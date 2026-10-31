'use client';

import { useEffect, useMemo, useState } from 'react';
import type { CardStatementInfo, DebtWithProjection, DebtsSnapshot } from '@/lib/debt-data';
import { cardTitle, enPromocion } from '@/lib/card-payment';
import { toDateKey } from '@/lib/debt-engine';
import { parseMoney } from '@/lib/money-input';
import { haptic } from '@/lib/haptic';
import ModalShell from '@/components/finance/ModalShell';
import { BTN_PRIMARY, BTN_SOFT, fmtDateFull, fmtMoney } from './debt-ui';

interface Props {
  /** Los tramos de la tarjeta con sus saldos ENTEROS. */
  readonly tramos: readonly DebtWithProjection[];
  readonly estado: CardStatementInfo | null;
  readonly onClose: () => void;
  readonly onSaved: (snapshot: DebtsSnapshot) => void;
}

interface NuevoSaldo {
  readonly clave: number;
  name: string;
  saldo: string;
  apr: string;
  promo: string;
}

const centavos = (n: number) => Math.round(n * 100) / 100;

/** El último día de cierre (`statementDay`) que ya pasó, YYYY-MM-DD. */
function ultimoCierre(statementDay: number | null, hoy: string): string {
  if (!statementDay) return hoy;
  const [y, m, d] = hoy.split('-').map(Number);
  const dia = (yy: number, mm: number) => Math.min(statementDay, new Date(Date.UTC(yy, mm, 0)).getUTCDate());
  if (d >= dia(y, m)) return `${y}-${String(m).padStart(2, '0')}-${String(dia(y, m)).padStart(2, '0')}`;
  const pm = m === 1 ? 12 : m - 1;
  const py = m === 1 ? y - 1 : y;
  return `${py}-${String(pm).padStart(2, '0')}-${String(dia(py, pm)).padStart(2, '0')}`;
}

/** El primer `dueDay` después del cierre, YYYY-MM-DD. */
function vencimientoTras(cierre: string, dueDay: number | null): string {
  if (!dueDay) return '';
  const [y, m, d] = cierre.split('-').map(Number);
  const dia = (yy: number, mm: number) => Math.min(dueDay, new Date(Date.UTC(yy, mm, 0)).getUTCDate());
  if (dueDay > d) return `${y}-${String(m).padStart(2, '0')}-${String(dia(y, m)).padStart(2, '0')}`;
  const nm = m === 12 ? 1 : m + 1;
  const ny = m === 12 ? y + 1 : y;
  return `${ny}-${String(nm).padStart(2, '0')}-${String(dia(ny, nm)).padStart(2, '0')}`;
}

/**
 * La tasa de la casilla de cada tramo, en APR. Con promoción —viva o ya
 * caducada— es la de DESPUÉS: la que cobrará, o cobra ya, lo que quede. Es la
 * que el banco puede cambiar y la que decide el aviso de fin del 0 %.
 */
function aprDelTramo(t: DebtWithProjection): number | null {
  if (t.promoEndsOn) return t.rateAfterPromo;
  if (t.ratePeriod === 'annual_nominal') return t.rate;
  if (t.ratePeriod === 'monthly') return centavos(t.rate * 12);
  return t.rate;
}

/**
 * Cuadrar la tarjeta con su estado de cuenta.
 *
 * El estado trae, en «Cálculo del cargo por intereses», cada saldo con su tasa;
 * arriba, el mínimo y la fecha de vencimiento. Se copian aquí y la app ajusta
 * cada tramo por la diferencia (sin borrar historial), da de alta lo que no
 * tenía y guarda el mínimo para proponerlo al abonar.
 *
 * La suma de abajo es la comprobación: tiene que dar el «Nuevo saldo total»
 * del estado. Si da, todo cuadra; si no, falta un saldo.
 *
 * Se compara con lo que Foody tenía EL DÍA DEL CIERRE: el estado se cuadra
 * días después y el mínimo suele estar ya abonado. Con lo de hoy, ese abono
 * salía como diferencia y el cuadre lo deshacía.
 */
export default function CardStatementModal({ tramos, estado, onClose, onSaved }: Props) {
  const hoy = toDateKey(new Date());
  const currency = tramos[0]?.currency ?? 'USD';
  const base = tramos[0];
  const cierreSugerido = estado?.closingDate && estado.closingDate >= ultimoCierre(base?.statementDay ?? null, hoy)
    ? estado.closingDate
    : ultimoCierre(base?.statementDay ?? null, hoy);

  const [cierre, setCierre] = useState(cierreSugerido);
  const [minimo, setMinimo] = useState(estado?.closingDate === cierreSugerido ? estado.minimumDue.toFixed(2) : '');
  const [vence, setVence] = useState(
    estado?.closingDate === cierreSugerido && estado.dueDate ? estado.dueDate : vencimientoTras(cierreSugerido, base?.dueDay ?? null),
  );
  // Solo lo que el usuario teclea; el resto sigue al saldo del cierre, que
  // llega del servidor y cambia con la fecha.
  const [saldos, setSaldos] = useState<Record<string, string>>({});
  // Lo que se movió cada tramo después del cierre (abonos en negativo). null
  // mientras se pregunta: sin él no se sabe aún si cuadra.
  const [movido, setMovido] = useState<Record<string, number> | null>(null);
  const [tasas, setTasas] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      tramos.map((t) => {
        const apr = aprDelTramo(t);
        return [t.id, apr === null ? '' : String(apr)];
      }),
    ),
  );
  const [nuevos, setNuevos] = useState<NuevoSaldo[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const grupo = base?.cardGroup ?? null;
  useEffect(() => {
    if (!grupo || !/^\d{4}-\d{2}-\d{2}$/.test(cierre)) return;
    const control = new AbortController();
    setMovido(null);
    fetch(`/api/debts/cards/${grupo}/statement?closing=${cierre}`, { credentials: 'include', signal: control.signal })
      .then((res) => (res.ok ? res.json() : { movido: {} }))
      .then((data: { movido?: Record<string, number> }) => setMovido(data.movido ?? {}))
      // Sin respuesta se compara con el saldo de hoy, como antes: el servidor
      // vuelve a calcular el del cierre al guardar.
      .catch((err: unknown) => {
        if ((err as Error).name !== 'AbortError') setMovido({});
      });
    return () => control.abort();
  }, [grupo, cierre]);

  const alCierre = (t: DebtWithProjection) => centavos(t.currentBalance - (movido?.[t.id] ?? 0));
  const textoDe = (t: DebtWithProjection) => saldos[t.id] ?? alCierre(t).toFixed(2);
  const saldoDe = (t: DebtWithProjection) => parseMoney(textoDe(t));
  const ordenados = useMemo(() => [...tramos].sort((a, b) => b.currentBalance - a.currentBalance), [tramos]);
  const totalNuevo = centavos(
    tramos.reduce((s, t) => s + (saldoDe(t) ?? 0), 0) + nuevos.reduce((s, n) => s + (parseMoney(n.saldo) ?? 0), 0),
  );
  // Lo del estado más lo que se movió después: lo que el banco llama «saldo
  // actual». Es la comprobación contra la app del banco.
  const totalMovido = centavos(tramos.reduce((s, t) => s + (movido?.[t.id] ?? 0), 0));
  const debesHoy = centavos(totalNuevo + totalMovido);

  function agregarNuevo() {
    haptic();
    setNuevos((prev) => [...prev, { clave: Date.now(), name: '', saldo: '', apr: '', promo: '' }]);
  }

  function cambiarNuevo(clave: number, campo: keyof Omit<NuevoSaldo, 'clave'>, valor: string) {
    setNuevos((prev) => prev.map((n) => (n.clave === clave ? { ...n, [campo]: valor } : n)));
  }

  async function guardar() {
    const minimoNum = parseMoney(minimo);
    if (minimoNum === null) {
      setError('Copia el pago mínimo del estado de cuenta');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const body = {
        closingDate: cierre,
        minimumDue: minimoNum,
        dueDate: vence || null,
        tramos: tramos.map((t) => {
          const apr = tasas[t.id] === '' ? null : Number.parseFloat(tasas[t.id]);
          return { debtId: t.id, balance: saldoDe(t) ?? alCierre(t), apr: apr !== null && Number.isFinite(apr) ? apr : null };
        }),
        nuevos: nuevos
          .filter((n) => n.name.trim() || n.saldo.trim())
          .map((n) => ({
            name: n.name,
            balance: parseMoney(n.saldo) ?? 0,
            apr: Number.parseFloat(n.apr || '0'),
            promoEndsOn: n.promo || null,
          })),
      };
      const res = await fetch(`/api/debts/cards/${base?.cardGroup}/statement`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as DebtsSnapshot & { message?: string };
      if (!res.ok || !Array.isArray(data.debts)) throw new Error(data.message ?? 'No se pudo cuadrar la tarjeta');
      haptic([10, 30, 10]);
      onSaved(data);
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const campo = 'w-full rounded-2xl border border-sky-200 bg-white px-3 py-2.5 text-base font-bold text-black focus:border-sky-400 focus:outline-none';

  return (
    <ModalShell
      title="Cuadrar la tarjeta"
      subtitle={base ? `${cardTitle(tramos)} · con su estado de cuenta` : undefined}
      emoji="🧾"
      onClose={onClose}
      footer={
        <div className="flex gap-2">
          <button type="button" onClick={onClose} className={`flex-1 rounded-2xl py-3.5 text-sm ${BTN_SOFT}`}>
            Cancelar
          </button>
          <button
            type="button"
            onClick={guardar}
            disabled={saving}
            className={`flex-[2] rounded-2xl py-3.5 text-sm ${BTN_PRIMARY} disabled:opacity-40`}
          >
            {saving ? 'Cuadrando…' : 'Cuadrar la tarjeta'}
          </button>
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        {error && (
          <p className="rounded-2xl border border-blue-200 bg-blue-50 px-3.5 py-2.5 text-sm text-blue-800">{error}</p>
        )}

        <div className="grid grid-cols-2 gap-2">
          <label className="col-span-2 flex flex-col gap-1 text-xs font-bold text-slate-600">
            Pago mínimo
            <input
              type="text"
              inputMode="decimal"
              value={minimo}
              onChange={(e) => setMinimo(e.target.value)}
              placeholder="0.00"
              aria-label="Pago mínimo del estado de cuenta"
              className={`${campo} text-2xl`}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-bold text-slate-600">
            Cierre
            <input type="date" value={cierre} onChange={(e) => setCierre(e.target.value)} className={campo} />
          </label>
          <label className="flex flex-col gap-1 text-xs font-bold text-slate-600">
            Vence
            <input type="date" value={vence} onChange={(e) => setVence(e.target.value)} className={campo} />
          </label>
        </div>

        <ul className="flex flex-col gap-2.5" aria-label="Saldos de la tarjeta">
          {ordenados.map((t) => {
            const nuevo = saldoDe(t);
            const diferencia = nuevo === null ? 0 : centavos(nuevo - alCierre(t));
            const promoViva = enPromocion(t, hoy);
            return (
              <li key={t.id} className="rounded-2xl bg-sky-50/80 p-3.5">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-black">{t.name}</span>
                    {promoViva && (
                      <span className="block text-[11px] font-semibold text-sky-700">0 % hasta el {fmtDateFull(t.promoEndsOn)}</span>
                    )}
                  </span>
                  {movido !== null && (
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${
                        diferencia === 0 ? 'bg-white text-sky-700' : 'bg-blue-100 text-blue-800'
                      }`}
                    >
                      {diferencia === 0
                        ? '✓ cuadra'
                        : `${diferencia > 0 ? '+' : '−'}${fmtMoney(Math.abs(diferencia), currency)} vs Foody`}
                    </span>
                  )}
                </div>
                <div className={`mt-2 grid gap-2 ${promoViva ? 'grid-cols-[1fr_8.5rem]' : 'grid-cols-[1fr_6.5rem]'}`}>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={textoDe(t)}
                    onChange={(e) => setSaldos((prev) => ({ ...prev, [t.id]: e.target.value }))}
                    aria-label={`Saldo de ${t.name} según el estado`}
                    className={campo}
                  />
                  <label className="relative">
                    {promoViva && (
                      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[11px] font-bold text-slate-400">
                        luego
                      </span>
                    )}
                    <input
                      type="text"
                      inputMode="decimal"
                      value={tasas[t.id] ?? ''}
                      onChange={(e) => setTasas((prev) => ({ ...prev, [t.id]: e.target.value }))}
                      aria-label={promoViva ? `Tasa de ${t.name} cuando acabe el 0 %` : `Tasa anual de ${t.name}`}
                      className={`${campo} pr-7${promoViva ? ' pl-12' : ''}`}
                    />
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400">%</span>
                  </label>
                </div>
              </li>
            );
          })}

          {nuevos.map((n) => (
            <li key={n.clave} className="rounded-2xl border border-dashed border-sky-300 bg-white p-3.5">
              <input
                type="text"
                value={n.name}
                onChange={(e) => cambiarNuevo(n.clave, 'name', e.target.value)}
                placeholder="Nombre (p. ej. Adelanto LP27)"
                aria-label="Nombre del saldo nuevo"
                className={campo}
              />
              <div className="mt-2 grid grid-cols-[1fr_6.5rem] gap-2">
                <input
                  type="text"
                  inputMode="decimal"
                  value={n.saldo}
                  onChange={(e) => cambiarNuevo(n.clave, 'saldo', e.target.value)}
                  placeholder="Saldo"
                  aria-label="Saldo del saldo nuevo"
                  className={campo}
                />
                <label className="relative">
                  <input
                    type="text"
                    inputMode="decimal"
                    value={n.apr}
                    onChange={(e) => cambiarNuevo(n.clave, 'apr', e.target.value)}
                    placeholder="APR"
                    aria-label="Tasa anual del saldo nuevo"
                    className={`${campo} pr-7`}
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400">%</span>
                </label>
              </div>
              <label className="mt-2 flex items-center justify-between gap-2 text-xs font-bold text-slate-600">
                Al 0 % hasta
                <input
                  type="date"
                  value={n.promo}
                  onChange={(e) => cambiarNuevo(n.clave, 'promo', e.target.value)}
                  aria-label="Fin de la promoción del saldo nuevo"
                  className={`${campo} w-auto`}
                />
              </label>
            </li>
          ))}
        </ul>

        <button
          type="button"
          onClick={agregarNuevo}
          className="rounded-2xl border-2 border-dashed border-sky-200 py-2.5 text-xs font-bold text-slate-600 transition hover:border-sky-300 active:scale-[0.99]"
        >
          ＋ Un saldo del estado que no está aquí
        </button>

        <div className="flex flex-col gap-2 rounded-2xl bg-sky-50/80 px-4 py-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-600">Nuevo saldo total</span>
            <span className="text-lg font-extrabold text-black">{fmtMoney(totalNuevo, currency)}</span>
          </div>
          {Math.abs(totalMovido) >= 0.01 && (
            <div className="flex items-center justify-between gap-3 border-t border-sky-100 pt-2">
              <span className="text-xs font-semibold text-slate-600">
                Hoy, con {totalMovido < 0 ? 'lo abonado' : 'lo movido'} desde el cierre
              </span>
              <span className="shrink-0 text-sm font-extrabold text-black">{fmtMoney(debesHoy, currency)}</span>
            </div>
          )}
        </div>
      </div>
    </ModalShell>
  );
}
