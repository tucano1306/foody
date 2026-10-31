'use client';

import { useMemo, useState } from 'react';
import type { CardStatementInfo, DebtWithProjection, DebtsSnapshot } from '@/lib/debt-data';
import { allocateCardPayment, cardTitle, enPromocion, tasaVigente, type CardTramo } from '@/lib/card-payment';
import {
  PLANTILLAS,
  aplicarPlantilla,
  conMinimo,
  costoDelAtraso,
  interesDiferido,
  minimoSegunCondiciones,
  type CondicionesDeCredito,
  type Plantilla,
  type ReglaDelAbono,
  type ReglaDelMinimo,
  type TipoDePromo,
} from '@/lib/condiciones-credito';
import { toDateKey } from '@/lib/debt-engine';
import { haptic } from '@/lib/haptic';
import { parseMoney } from '@/lib/money-input';
import ModalShell from '@/components/finance/ModalShell';
import { BTN_PRIMARY, BTN_SOFT, fmtDateFull, fmtMoney } from './debt-ui';

interface Props {
  /** Los tramos de la cuenta: la tarjeta entera, o la deuda suelta. */
  readonly tramos: readonly DebtWithProjection[];
  readonly condiciones: CondicionesDeCredito;
  /** El último estado de cuenta: contra él se comprueba el mínimo. */
  readonly estado?: CardStatementInfo | null;
  readonly onClose: () => void;
  readonly onSaved: (snapshot: DebtsSnapshot) => void;
}

const REGLAS_MINIMO: readonly { valor: ReglaDelMinimo; titulo: string; detalle: string }[] = [
  { valor: 'suma', titulo: '% + intereses', detalle: 'Un % del saldo, más lo que cobran' },
  { valor: 'mayor', titulo: 'Un % del saldo', detalle: 'O el piso, lo que sea mayor' },
  { valor: 'fijo', titulo: 'Cuota fija', detalle: 'Lo mismo cada mes' },
];

const REGLAS_ABONO: readonly { valor: ReglaDelAbono; emoji: string; titulo: string; detalle: string }[] = [
  { valor: 'ley_eeuu', emoji: '📜', titulo: 'Como manda la ley de EE. UU.', detalle: 'El mínimo al saldo más barato; lo de más, al más caro' },
  { valor: 'cara_primero', emoji: '🔥', titulo: 'Al más caro', detalle: 'Todo a la tasa más alta' },
  { valor: 'barata_primero', emoji: '🧊', titulo: 'Al más barato', detalle: 'Todo a la tasa más baja' },
  { valor: 'proporcional', emoji: '⚖️', titulo: 'En proporción', detalle: 'A cada saldo según lo que debe' },
];

/** Dónde está cada cifra en el papel. Es la parte que nadie sabe. */
const PISTAS: readonly { que: string; donde: string }[] = [
  { que: 'Pago mínimo', donde: 'Arriba, junto a la fecha de vencimiento («Minimum Payment Due»).' },
  { que: 'Cómo lo calculan', donde: 'En el contrato de la tarjeta, donde explica el pago mínimo («How we calculate your minimum payment»).' },
  { que: 'Cargo y tasa por atraso', donde: 'En el recuadro de aviso de pago tardío, debajo del mínimo («Late Payment Warning»).' },
  { que: 'Interés diferido', donde: 'En el resumen de promociones: «Deferred interest» o «interés diferido acumulado».' },
  { que: 'A dónde va tu abono', donde: 'En el contrato, «Payment allocation» o «Cómo aplicamos sus pagos».' },
];

const EJEMPLO_ABONO = 500;

/** «29.99», «29,99», «29.99 %»: un porcentaje, sin la regla de millares de los importes. */
function leerNumero(texto: string): number | null {
  const limpio = texto.replace(/[%\s]/g, '').replace(',', '.');
  if (limpio === '') return null;
  const n = Number(limpio);
  return Number.isFinite(n) ? n : null;
}

const aTexto = (n: number | null | undefined) => (n == null ? '' : String(n));

function aTramo(d: DebtWithProjection, tipo: TipoDePromo): CardTramo {
  return {
    id: d.id,
    name: d.name,
    balance: d.currentBalance,
    rate: d.rate,
    ratePeriod: d.ratePeriod,
    promoEndsOn: d.promoEndsOn,
    rateAfterPromo: d.rateAfterPromo,
    promoKind: tipo,
  };
}

/**
 * Las condiciones del banco de una tarjeta o préstamo.
 *
 * La app nació con las reglas de UNA tarjeta y cualquiera con otro banco veía
 * mínimos y repartos que no eran los suyos, sin saber por qué. Aquí cada uno
 * pone las de su contrato, y cada sección enseña al momento lo que cambia con
 * SU saldo: el mínimo que saldría, a dónde iría un abono, lo que costaría un
 * atraso. Así una regla abstracta se entiende sin leer nada.
 *
 * Un préstamo solo tiene la sección del atraso: su cuota la fija el contrato
 * y ya está en «Editar datos».
 */
export default function CreditTermsSheet({ tramos, condiciones, estado = null, onClose, onSaved }: Props) {
  const hoy = toDateKey(new Date());
  const currency = tramos[0]?.currency ?? 'USD';
  const esTarjeta = tramos.some((t) => t.kind === 'credit_card' || t.kind === 'store');
  const titulo = tramos.length > 1 ? cardTitle(tramos) : tramos[0]?.name ?? '';

  const [plantilla, setPlantilla] = useState<Plantilla>(condiciones.plantilla);
  const [regla, setRegla] = useState<ReglaDelMinimo>(condiciones.minimo.regla);
  const [porcentaje, setPorcentaje] = useState(aTexto(condiciones.minimo.porcentaje));
  const [piso, setPiso] = useState(aTexto(condiciones.minimo.piso));
  const [fijo, setFijo] = useState(aTexto(condiciones.minimo.fijo));
  const [abono, setAbono] = useState<ReglaDelAbono>(condiciones.abono);
  const [cargo, setCargo] = useState(aTexto(condiciones.atraso.cargo));
  const [tasaPenal, setTasaPenal] = useState(aTexto(condiciones.atraso.tasaPenal));
  const conPromo = tramos.filter((t) => t.promoEndsOn && t.currentBalance > 0);
  const [promos, setPromos] = useState<Record<string, { tipo: TipoDePromo; acumulado: string }>>(() =>
    Object.fromEntries(conPromo.map((t) => [t.id, { tipo: t.promoKind, acumulado: aTexto(t.deferredInterest) }])),
  );
  const [pistas, setPistas] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Lo tecleado, como condiciones: es lo que pintan los ejemplos y lo que se guarda. */
  const actuales: CondicionesDeCredito = useMemo(() => {
    const minimo = {
      regla,
      porcentaje: regla === 'fijo' ? 0 : leerNumero(porcentaje) ?? 0,
      piso: regla === 'fijo' ? 0 : parseMoney(piso) ?? 0,
      fijo: regla === 'fijo' ? parseMoney(fijo) : null,
    };
    // `conMinimo` dice de qué plantilla son ahora las cifras: tocar el % de
    // Bank of America ya no es Bank of America, es «a tu medida».
    return conMinimo({ ...condiciones, plantilla, abono, atraso: { cargo: parseMoney(cargo), tasaPenal: leerNumero(tasaPenal) } }, minimo);
  }, [condiciones, regla, porcentaje, piso, fijo, abono, cargo, tasaPenal, plantilla]);

  function elegirPlantilla(p: Exclude<Plantilla, 'propia'>) {
    haptic();
    const c = aplicarPlantilla(actuales, p);
    setPlantilla(p);
    setRegla(c.minimo.regla);
    setPorcentaje(aTexto(c.minimo.porcentaje));
    setPiso(aTexto(c.minimo.piso));
    setFijo(aTexto(c.minimo.fijo));
    if (tramos.length > 1) setAbono(c.abono);
  }

  const partes = tramos.map((t) => ({
    principal: t.breakdown.principalOwed,
    interest: t.breakdown.interestOwed,
    fees: t.breakdown.feesOwed,
  }));
  const minimoQueSale = minimoSegunCondiciones(actuales, partes);
  const cuadra = estado ? Math.abs(minimoQueSale - estado.minimumDue) < 1 : null;

  const tramosCard = tramos.map((t) => aTramo(t, promos[t.id]?.tipo ?? t.promoKind));
  const ejemplo = allocateCardPayment({
    tramos: tramosCard,
    amount: EJEMPLO_ABONO,
    minimumDue: estado?.minimumDue ?? minimoQueSale,
    hoy,
    regla: abono,
  });

  const atraso = costoDelAtraso(
    actuales,
    tramosCard.map((t) => ({ balance: t.balance, apr: tasaVigente(t, hoy) * 1200 })),
  );

  async function guardar() {
    setSaving(true);
    setError(null);
    try {
      const body = {
        plantilla: actuales.plantilla,
        minimo: actuales.minimo,
        abono: actuales.abono,
        atraso: actuales.atraso,
        promos: conPromo.map((t) => ({
          debtId: t.id,
          tipo: promos[t.id]?.tipo ?? 'cero',
          interesDiferido: promos[t.id]?.tipo === 'diferido' ? parseMoney(promos[t.id].acumulado) : null,
        })),
      };
      const res = await fetch(`/api/debts/${tramos[0]?.id}/terms`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as Partial<DebtsSnapshot> & { message?: string };
      if (!res.ok || !data.debts) throw new Error(data.message ?? 'No se pudieron guardar las condiciones');
      haptic([10, 30, 10]);
      onSaved(data as DebtsSnapshot);
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const campo =
    'w-full rounded-2xl border border-sky-200 bg-white px-3.5 py-3 text-right text-base font-extrabold text-black focus:border-sky-400 focus:outline-none';

  return (
    <ModalShell
      title="Condiciones del banco"
      subtitle={titulo}
      emoji="🏦"
      onClose={onClose}
      footer={
        <div className="flex flex-col gap-2">
          {error && (
            <p role="alert" className="rounded-2xl border border-blue-200 bg-blue-50 px-3.5 py-2.5 text-sm text-blue-800">
              {error}
            </p>
          )}
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
              {saving ? 'Guardando…' : 'Guardar condiciones'}
            </button>
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-6">
        {esTarjeta && (
          <>
            {/* ─── De qué banco: un toque y las cifras se rellenan ─────────── */}
            <section aria-labelledby="ct-banco">
              <h3 id="ct-banco" className="mb-2 text-xs font-bold text-slate-600">
                Tu banco
              </h3>
              <div className="grid grid-cols-2 gap-2">
                {(Object.keys(PLANTILLAS) as Exclude<Plantilla, 'propia'>[]).map((p) => {
                  const elegida = actuales.plantilla === p;
                  return (
                    <button
                      key={p}
                      type="button"
                      onClick={() => elegirPlantilla(p)}
                      aria-pressed={elegida}
                      className={`flex flex-col items-start gap-0.5 rounded-2xl border px-3 py-2.5 text-left transition active:scale-95 ${
                        elegida ? 'border-sky-500 bg-sky-500 text-white shadow-md' : 'border-sky-200 bg-white text-black hover:border-sky-300'
                      }`}
                    >
                      <span className="text-sm font-bold leading-tight">
                        {PLANTILLAS[p].nombre}
                        {PLANTILLAS[p].comprobada && <span aria-label="comprobada con estados reales"> ✓</span>}
                      </span>
                      <span className={`text-[11px] leading-snug ${elegida ? 'text-white/85' : 'text-slate-500'}`}>
                        {PLANTILLAS[p].detalle}
                      </span>
                    </button>
                  );
                })}
              </div>
              {actuales.plantilla === 'propia' && (
                <p className="mt-2 text-[11px] font-semibold text-sky-700">✏️ A tu medida</p>
              )}
            </section>

            {/* ─── El mínimo, con lo que sale con TU saldo ──────────────────── */}
            <section aria-labelledby="ct-minimo" className="rounded-3xl bg-sky-50/80 p-4">
              <h3 id="ct-minimo" className="mb-3 text-xs font-bold text-slate-600">
                Pago mínimo
              </h3>
              <div className="grid grid-cols-3 gap-1.5" role="radiogroup" aria-label="Cómo calculan el mínimo">
                {REGLAS_MINIMO.map((r) => {
                  const elegida = regla === r.valor;
                  return (
                    <button
                      key={r.valor}
                      type="button"
                      role="radio"
                      aria-checked={elegida}
                      onClick={() => {
                        haptic();
                        setRegla(r.valor);
                      }}
                      className={`flex flex-col items-center gap-0.5 rounded-2xl px-2 py-2 text-center transition active:scale-95 ${
                        elegida ? 'bg-sky-500 text-white shadow-md' : 'bg-white text-black'
                      }`}
                    >
                      <span className="text-xs font-bold leading-tight">{r.titulo}</span>
                      <span className={`text-[10px] leading-tight ${elegida ? 'text-white/85' : 'text-slate-500'}`}>{r.detalle}</span>
                    </button>
                  );
                })}
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2">
                {regla === 'fijo' ? (
                  <label className="col-span-2 flex flex-col gap-1">
                    <span className="text-[11px] font-bold text-slate-600">Cuota ({currency})</span>
                    <input type="text" inputMode="decimal" value={fijo} onChange={(e) => setFijo(e.target.value)} aria-label="Cuota fija" className={campo} />
                  </label>
                ) : (
                  <>
                    <label className="flex flex-col gap-1">
                      <span className="text-[11px] font-bold text-slate-600">% del saldo</span>
                      <input type="text" inputMode="decimal" value={porcentaje} onChange={(e) => setPorcentaje(e.target.value)} aria-label="Porcentaje del saldo" className={campo} />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-[11px] font-bold text-slate-600">Nunca menos de ({currency})</span>
                      <input type="text" inputMode="decimal" value={piso} onChange={(e) => setPiso(e.target.value)} aria-label="Piso del mínimo" className={campo} />
                    </label>
                  </>
                )}
              </div>

              <div className="mt-3 flex items-center justify-between gap-3 rounded-2xl bg-white px-3.5 py-2.5" aria-live="polite">
                <span className="min-w-0">
                  <span className="block text-[11px] font-semibold text-slate-600">Con tu saldo de hoy saldría</span>
                  <span className="block text-lg font-extrabold text-black">{fmtMoney(minimoQueSale, currency)}</span>
                </span>
                {estado && (
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${
                      cuadra ? 'bg-sky-100 text-sky-800' : 'bg-amber-100 text-amber-900'
                    }`}
                  >
                    {cuadra ? `✓ Como tu estado` : `Tu estado: ${fmtMoney(estado.minimumDue, currency)}`}
                  </span>
                )}
              </div>
            </section>

            {/* ─── A dónde va el abono: solo tiene sentido con varios saldos ─── */}
            {tramos.length > 1 && (
              <section aria-labelledby="ct-abono">
                <h3 id="ct-abono" className="mb-2 text-xs font-bold text-slate-600">
                  A dónde va tu abono
                </h3>
                <div className="flex flex-col gap-1.5" role="radiogroup" aria-label="A dónde va tu abono">
                  {REGLAS_ABONO.map((r) => {
                    const elegida = abono === r.valor;
                    return (
                      <button
                        key={r.valor}
                        type="button"
                        role="radio"
                        aria-checked={elegida}
                        onClick={() => {
                          haptic();
                          setAbono(r.valor);
                        }}
                        className={`flex items-center gap-3 rounded-2xl border px-3.5 py-2.5 text-left transition active:scale-[0.99] ${
                          elegida ? 'border-sky-500 bg-sky-500 text-white shadow-md' : 'border-sky-200 bg-white text-black'
                        }`}
                      >
                        <span className="text-xl leading-none" aria-hidden="true">{r.emoji}</span>
                        <span className="min-w-0">
                          <span className="block text-sm font-bold leading-tight">{r.titulo}</span>
                          <span className={`block text-[11px] leading-snug ${elegida ? 'text-white/85' : 'text-slate-500'}`}>{r.detalle}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>

                <div className="mt-3 rounded-3xl bg-sky-50/80 p-4" aria-live="polite">
                  <p className="mb-2 text-[11px] font-bold text-slate-600">
                    Si abonas {fmtMoney(EJEMPLO_ABONO, currency)}
                  </p>
                  <ul className="flex flex-col gap-1.5" aria-label="Ejemplo de reparto">
                    {ejemplo.parts.map((p) => (
                      <li key={p.tramoId} className="flex items-baseline justify-between gap-3 rounded-xl bg-white px-3 py-2">
                        <span className="min-w-0 truncate text-xs font-semibold text-black">
                          {p.name}
                          <span className="ml-1.5 text-[11px] font-semibold text-slate-500">
                            {p.monthlyRate > 0 ? `${(p.monthlyRate * 1200).toFixed(2).replace(/\.?0+$/, '')} %` : '0 %'}
                          </span>
                        </span>
                        <span className="shrink-0 text-sm font-extrabold tabular-nums text-black">{fmtMoney(p.amount, currency)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </section>
            )}

            {/* ─── Promociones: un 0 % no siempre es cero ───────────────────── */}
            {conPromo.length > 0 && (
              <section aria-labelledby="ct-promos">
                <h3 id="ct-promos" className="mb-2 text-xs font-bold text-slate-600">
                  Promociones
                </h3>
                <ul className="flex flex-col gap-2">
                  {conPromo.map((t) => {
                    const p = promos[t.id] ?? { tipo: 'cero' as const, acumulado: '' };
                    const viva = enPromocion(t, hoy);
                    const golpe =
                      p.tipo === 'diferido' && t.rateAfterPromo && t.promoEndsOn
                        ? interesDiferido({
                            saldo: t.currentBalance,
                            apr: t.rateAfterPromo,
                            desde: t.openedAt.slice(0, 10),
                            hasta: t.promoEndsOn,
                            delEstado: parseMoney(p.acumulado),
                          })
                        : null;
                    const cambiar = (tipo: TipoDePromo) => {
                      haptic();
                      setPromos((prev) => ({ ...prev, [t.id]: { ...p, tipo } }));
                    };
                    return (
                      <li key={t.id} className="rounded-3xl border border-sky-100 bg-white p-3.5">
                        <div className="flex items-baseline justify-between gap-3">
                          <span className="min-w-0 truncate text-sm font-bold text-black">{t.name}</span>
                          <span className="shrink-0 text-[11px] font-semibold text-slate-500">
                            {viva ? 'hasta el' : 'acabó el'} {fmtDateFull(t.promoEndsOn)}
                          </span>
                        </div>
                        <div className="mt-2 grid grid-cols-2 gap-1.5" role="radiogroup" aria-label={`Tipo de promoción de ${t.name}`}>
                          {(
                            [
                              { tipo: 'cero', titulo: '0 % de verdad', detalle: 'Cobra desde el día siguiente' },
                              { tipo: 'diferido', titulo: 'Interés diferido', detalle: 'Si queda saldo, cobra todo' },
                            ] as const
                          ).map((o) => {
                            const elegida = p.tipo === o.tipo;
                            return (
                              <button
                                key={o.tipo}
                                type="button"
                                role="radio"
                                aria-checked={elegida}
                                onClick={() => cambiar(o.tipo)}
                                className={`flex flex-col items-start rounded-2xl px-3 py-2 text-left transition active:scale-95 ${
                                  elegida
                                    ? o.tipo === 'diferido'
                                      ? 'bg-amber-500 text-white shadow-md'
                                      : 'bg-sky-500 text-white shadow-md'
                                    : 'bg-sky-50 text-black'
                                }`}
                              >
                                <span className="text-xs font-bold">{o.titulo}</span>
                                <span className={`text-[10px] leading-tight ${elegida ? 'text-white/85' : 'text-slate-500'}`}>{o.detalle}</span>
                              </button>
                            );
                          })}
                        </div>
                        {p.tipo === 'diferido' && (
                          <div className="mt-2 flex flex-col gap-2">
                            <label className="flex items-center justify-between gap-3 rounded-2xl bg-amber-50 px-3.5 py-2">
                              <span className="text-[11px] font-bold text-amber-900">Interés acumulado del estado</span>
                              <input
                                type="text"
                                inputMode="decimal"
                                value={p.acumulado}
                                placeholder={golpe?.estimado ? `~${golpe.monto.toFixed(2)}` : ''}
                                onChange={(e) => {
                                  const acumulado = e.target.value;
                                  setPromos((prev) => ({ ...prev, [t.id]: { ...p, acumulado } }));
                                }}
                                aria-label={`Interés diferido acumulado de ${t.name}`}
                                className="w-28 bg-transparent text-right text-sm font-extrabold text-black placeholder:text-amber-700/60 focus:outline-none"
                              />
                            </label>
                            {golpe && golpe.monto > 0 && (
                              <p className="text-[11px] leading-snug text-amber-950">
                                Si queda un centavo el {fmtDateFull(t.promoEndsOn)}, te cobran{' '}
                                <strong>
                                  {golpe.estimado ? '~' : ''}
                                  {fmtMoney(golpe.monto, currency)} de golpe
                                </strong>
                              </p>
                            )}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}
          </>
        )}

        {/* ─── Lo que cuesta pagar tarde ───────────────────────────────────── */}
        <section aria-labelledby="ct-atraso" className="rounded-3xl bg-sky-50/80 p-4">
          <h3 id="ct-atraso" className="mb-3 text-xs font-bold text-slate-600">
            Si te atrasas
          </h3>
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-bold text-slate-600">Cargo ({currency})</span>
              <input type="text" inputMode="decimal" value={cargo} onChange={(e) => setCargo(e.target.value)} placeholder="—" aria-label="Cargo por atraso" className={campo} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-bold text-slate-600">Tasa de castigo (%)</span>
              <input type="text" inputMode="decimal" value={tasaPenal} onChange={(e) => setTasaPenal(e.target.value)} placeholder="—" aria-label="Tasa de castigo" className={campo} />
            </label>
          </div>
          {atraso && (
            <p className="mt-3 rounded-2xl bg-white px-3.5 py-2.5 text-xs leading-snug text-black" aria-live="polite">
              ⚠️ Un atraso te costaría
              {atraso.cargo != null && <> <strong>{fmtMoney(atraso.cargo, currency)}</strong></>}
              {atraso.cargo != null && atraso.tasaPenal != null && ' y'}
              {atraso.tasaPenal != null && (
                <>
                  {' '}la tasa podría subir al <strong>{atraso.tasaPenal} %</strong>
                  {atraso.interesExtraAlMes != null && atraso.interesExtraAlMes > 0 && (
                    <> (hasta <strong>{fmtMoney(atraso.interesExtraAlMes, currency)} más al mes</strong>)</>
                  )}
                </>
              )}
            </p>
          )}
        </section>

        {/* ─── Dónde buscar cada cifra, plegado: es para quien lo necesita ── */}
        <section>
          <button
            type="button"
            onClick={() => setPistas((v) => !v)}
            aria-expanded={pistas}
            className="flex w-full items-center justify-between rounded-2xl px-1 py-1 text-xs font-bold text-sky-700"
          >
            <span>📄 Dónde está en tu estado de cuenta</span>
            <span aria-hidden="true">{pistas ? '−' : '+'}</span>
          </button>
          {pistas && (
            <dl className="mt-2 flex flex-col gap-2 rounded-3xl border border-sky-100 bg-white p-4">
              {PISTAS.filter((p) => esTarjeta || p.que === 'Cargo y tasa por atraso').map((p) => (
                <div key={p.que}>
                  <dt className="text-[11px] font-bold text-black">{p.que}</dt>
                  <dd className="text-[11px] leading-snug text-slate-600">{p.donde}</dd>
                </div>
              ))}
            </dl>
          )}
        </section>
      </div>
    </ModalShell>
  );
}
