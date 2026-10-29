'use client';

import { useCallback, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import type { MonthlyPayment } from '@foody/types';
import { ChevronDownIcon, ExclamationTriangleIcon } from '@heroicons/react/24/solid';
import PaymentCard from '@/components/payments/PaymentCard';
import MesDePagos from '@/components/payments/MesDePagos';
import ScopeTabs from '@/components/ui/ScopeTabs';
import { agendaDePagos } from '@/lib/agenda-pagos';
import { importeDelMes, tocaEsteMes } from '@/lib/importe-del-mes';
import { APP_TZ } from '@/lib/app-time';
import { matchesFilter, summarizeByScope, totalForFilter, type ScopeFilter } from '@/lib/expense-scope';

interface Props {
  readonly initialPayments: MonthlyPayment[];
}

type Filter = 'all' | 'pending' | 'paid';

/** Atajos de la lista vacía: tocar la categoría ES la instrucción. */
const PAYMENT_SHORTCUTS: readonly { category: string; emoji: string; label: string }[] = [
  { category: 'rent', emoji: '🏠', label: 'Renta' },
  { category: 'utilities', emoji: '💡', label: 'Servicios' },
  { category: 'internet', emoji: '🌐', label: 'Internet' },
  { category: 'phone', emoji: '📞', label: 'Teléfono' },
  { category: 'streaming', emoji: '🎬', label: 'Streaming' },
  { category: 'other', emoji: '💰', label: 'Otro' },
];

const CATEGORY_ICONS: Record<string, string> = {
  utilities: '💡',
  subscriptions: '📱',
  rent: '🏠',
  insurance: '🛡️',
  internet: '🌐',
  phone: '📞',
  streaming: '🎬',
  other: '💰',
};

/** El ámbito pedido por la URL, o «todo» si no viene o no se entiende. */
function readScope(raw: string | null): ScopeFilter {
  return raw === 'personal' || raw === 'business' ? raw : 'all';
}

export default function PaymentsList({ initialPayments }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const highlightId = searchParams.get('payment');
  const scopeParam = searchParams.get('scope');

  const [allPayments, setAllPayments] = useState<MonthlyPayment[]>(initialPayments);
  /**
   * El ámbito puede venir en la URL: `?scope=personal`.
   *
   * Lo usa el Plan financiero cuando «contar el negocio» está apagado. Antes
   * los consejos decían «tus pagos fijos se llevan $2.027» y su enlace abría
   * esta pantalla en «Todo» ($4.341, con el negocio dentro): el consejo y la
   * pantalla a la que llevaba no hablaban del mismo dinero.
   */
  const [scope, setScope] = useState<ScopeFilter>(() => readScope(scopeParam));
  const [filter, setFilter] = useState<Filter>('all');
  const [historyOpen, setHistoryOpen] = useState(false);

  // Jump from a history row to that payment's card: reset the filter so the
  // card is rendered, then let ?payment= trigger its scroll + auto-open.
  const goToPayment = useCallback((id: string) => {
    setFilter('all');
    router.push(`/payments?payment=${id}`, { scroll: false });
  }, [router]);

  // ── Callbacks ────────────────────────────────────────────────────────────

  const handleDeleted = useCallback((id: string) => {
    setAllPayments((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const handleUpdated = useCallback((updated: MonthlyPayment) => {
    setAllPayments((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
  }, []);

  const handleSnoozed = useCallback((id: string, snoozedUntil: string) => {
    setAllPayments((prev) =>
      prev.map((p) => (p.id === id ? { ...p, snoozedUntil } : p)),
    );
  }, []);

  // ── Derived values ───────────────────────────────────────────────────────

  // El ámbito filtra ANTES que nada: todo lo de abajo —listas, totales,
  // historial— habla del lado que el usuario está mirando. Un pago mixto sale
  // en las dos vistas, con su parte correspondiente en cada total.
  const scopeSummary = summarizeByScope(
    allPayments.map((p) => ({ id: p.id, name: p.name, amount: p.amount, businessShare: p.businessShare ?? 0 })),
  );
  const payments = allPayments.filter((p) => matchesFilter(p.businessShare ?? 0, scope));

  const now = new Date();
  /**
   * Los recibos que este mes NO vencen (un seguro semestral en noviembre).
   *
   * Para no llenar la pantalla de rojo se dan por «al día», y por eso salían
   * en «Pagados este mes» y sumaban su importe entero al mes: un seguro de
   * $515 cada seis meses inflaba los pagos de TODOS los meses. Van aparte, y
   * no cuentan en los totales del mes (ver lib/importe-del-mes.ts).
   */
  const fueraDeCiclo = payments.filter((p) => !tocaEsteMes(p, now));
  const delMes = payments.filter((p) => tocaEsteMes(p, now));
  const snoozed = delMes.filter(
    (p) => !p.isPaidThisMonth && p.snoozedUntil != null && new Date(p.snoozedUntil) > now,
  );
  const snoozedIds = new Set(snoozed.map((p) => p.id));
  const pending = delMes.filter((p) => !p.isPaidThisMonth && !snoozedIds.has(p.id));
  const paid = delMes.filter((p) => p.isPaidThisMonth);
  /**
   * TODA cifra de dinero de esta pantalla pasa por aquí, para que no pueda
   * ocurrir que unos totales se repartan por ámbito y otros no: en la vista de
   * negocio, un móvil al 60 % suma sus $78, nunca los $130 enteros — y eso vale
   * igual para el total del mes que para el acumulado histórico.
   *
   * Al histórico se le aplica el reparto de HOY. Es una aproximación (el
   * porcentaje pudo cambiar), pero es el único dato que existe y es el mismo
   * criterio que ya usa la deuda acumulada, que multiplica meses por el importe
   * actual.
   */
  const scopedSum = (list: MonthlyPayment[], valueOf: (p: MonthlyPayment) => number) =>
    totalForFilter(
      list.map((p) => ({
        id: p.id,
        name: p.name,
        amount: valueOf(p),
        businessShare: p.businessShare ?? 0,
      })),
      scope,
    );

  // Lo que cada recibo saca de la cuenta ESTE mes: lo cobrado si ya se pagó,
  // su importe si vence y falta, nada si no le toca.
  const amountOf = (p: MonthlyPayment) => importeDelMes(p, now);
  const totalExpenses = scopedSum(delMes, amountOf);
  const totalPaid = scopedSum(paid, amountOf);
  const totalSnoozed = scopedSum(snoozed, amountOf);
  const totalAccumulated = scopedSum(payments, (p) => p.accumulatedDebt ?? 0);
  const totalPaidAllTime = scopedSum(payments, (p) => p.totalPaidAllTime ?? 0);
  // El CONTEO de pagos no se reparte: medio pago no existe. Un pago mixto
  // cuenta como uno en las dos vistas, que es lo que de verdad ocurrió.
  const paidCountAllTime = payments.reduce((sum, p) => sum + (p.paidCountAllTime ?? 0), 0);
  const paidBreakdown = payments
    .filter((p) => (p.totalPaidAllTime ?? 0) > 0)
    .sort((a, b) => (b.totalPaidAllTime ?? 0) - (a.totalPaidAllTime ?? 0));

  // Use the most common currency, fallback to USD
  const currencies = payments.map((p) => p.currency);
  const dominantCurrency = currencies.length > 0
    ? [...currencies].sort((a, b) => currencies.filter((c) => c === b).length - currencies.filter((c) => c === a).length)[0]
    : 'USD';
  const mixedCurrencies = new Set(currencies).size > 1;

  function formatTotal(value: number): string {
    if (mixedCurrencies) return value.toFixed(2);
    try {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: dominantCurrency,
        maximumFractionDigits: 2,
      }).format(value);
    } catch {
      return `${dominantCurrency} ${value.toFixed(2)}`;
    }
  }

  // Lo que sale en los próximos días, con la parte del ámbito que se mira.
  const agenda = agendaDePagos(payments, (p) => scopedSum([p], amountOf), now);
  const mes = new Intl.DateTimeFormat('es-MX', { month: 'long', timeZone: APP_TZ }).format(now);
  const iconoDe = (category: string | null) => CATEGORY_ICONS[category ?? 'other'] ?? '💰';

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* ─── Personal / Negocio ───────────────────────────────────────────
          Era una copia a mano del selector compartido, con su propio azul:
          justo la divergencia que ScopeTabs existe para evitar. Se oculta solo
          cuando no hay nada del negocio. */}
      <ScopeTabs value={scope} onChange={setScope} summary={scopeSummary} format={formatTotal} />

      {/* ─── Accumulated debt alert ──────────────────────────────────────── */}
      {totalAccumulated > 0 && (
        <div className="card flex items-center gap-3 px-4 py-3">
          <span
            aria-hidden="true"
            className="grid place-items-center w-10 h-10 shrink-0 rounded-2xl text-white shadow-[var(--glow)]"
            style={{ backgroundImage: 'var(--aurora)' }}
          >
            <ExclamationTriangleIcon className="w-5 h-5" />
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-[var(--ink)]">
              Ya llevas {formatTotal(totalAccumulated)} acumulado
            </p>
            <p className="t-meta mt-0.5">
              Meses vencidos sin pagar — cada pago que registres abona al mes más antiguo.
            </p>
          </div>
        </div>
      )}

      {/* ─── El mes: pagado, falta y lo que viene ───────────────────────── */}
      {payments.length > 0 && (
        <MesDePagos
          mes={mes}
          total={totalExpenses}
          pagado={totalPaid}
          pospuesto={totalSnoozed}
          cuantosPagados={paid.length}
          cuantosPendientes={pending.length + snoozed.length}
          agenda={agenda}
          filtro={filter}
          onFiltro={setFilter}
          onAbrir={goToPayment}
          formato={formatTotal}
          iconoDe={iconoDe}
        />
      )}

      {/* ─── All-time paid history ────────────────────────────────────────── */}
      {payments.length > 0 && (
        <section className="rounded-2xl overflow-hidden shadow-sm bg-linear-to-br from-sky-600 to-blue-700">
          <button
            type="button"
            onClick={() => setHistoryOpen((v) => !v)}
            aria-expanded={historyOpen}
            className="w-full flex items-center gap-3 px-4 py-4 sm:px-5 text-left active:scale-[0.99] transition-transform focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
          >
            <div className="w-11 h-11 rounded-full bg-white/20 flex items-center justify-center text-xl shrink-0" aria-hidden="true">
              💰
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white font-bold text-sm sm:text-base leading-tight">Pagado a la fecha</p>
              <p className="text-white/70 text-[11px] sm:text-xs mt-0.5">
                {paidCountAllTime === 0
                  ? 'Aún sin pagos registrados'
                  : `${paidCountAllTime} ${paidCountAllTime === 1 ? 'pago registrado' : 'pagos registrados'} en total`}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <p className="text-white text-lg sm:text-2xl font-extrabold">
                {formatTotal(totalPaidAllTime)}{mixedCurrencies && <span className="text-xs text-white/60 ml-1">*</span>}
              </p>
              <ChevronDownIcon className={`w-4 h-4 text-white/80 transition-transform duration-200 ${historyOpen ? 'rotate-180' : ''}`} />
            </div>
          </button>
          {historyOpen && (
            <div className="px-4 pb-4 sm:px-5 flex flex-col gap-1.5 animate-fade-up">
              {paidBreakdown.length === 0 ? (
                <p className="text-white/80 text-xs bg-white/10 rounded-xl px-3 py-2.5">
                  Cuando marques pagos como pagados, aquí verás cuánto llevas abonado a cada uno.
                </p>
              ) : (
                paidBreakdown.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => goToPayment(p.id)}
                    aria-label={`Ver el pago ${p.name}`}
                    className="w-full flex items-center justify-between gap-2 bg-white/10 hover:bg-white/20 rounded-xl px-3 py-2.5 text-left transition active:scale-[0.99] focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
                  >
                    <span className="text-white/90 text-xs font-semibold truncate">
                      <span aria-hidden="true" className="mr-1.5">{CATEGORY_ICONS[p.category ?? 'other'] ?? '💰'}</span>
                      {p.name}
                    </span>
                    <span className="text-white text-xs font-bold shrink-0 flex items-center gap-1.5">
                      <span>
                        {/* La fila también muestra su parte, o la suma de arriba
                            no cuadraría con el desglose que tiene debajo. */}
                        {p.currency}{' '}
                        {scopedSum([p], (x) => x.totalPaidAllTime ?? 0).toFixed(2)}
                        <span className="text-white/60 font-medium">
                          {' '}· {p.paidCountAllTime ?? 0} {(p.paidCountAllTime ?? 0) === 1 ? 'pago' : 'pagos'}
                        </span>
                      </span>
                      <span aria-hidden="true" className="text-white/60">›</span>
                    </span>
                  </button>
                ))
              )}
            </div>
          )}
        </section>
      )}

      {/* ─── Pending payments ─────────────────────────────────────────────── */}
      {pending.length > 0 && filter !== 'paid' && (
        <section className="card p-4 sm:p-5">
          <div className="flex items-center gap-2.5 mb-4">
            <span className="w-9 h-9 rounded-xl bg-[var(--accent-soft)] flex items-center justify-center text-lg shrink-0" aria-hidden="true">
              ⏰
            </span>
            <h2 className="text-lg font-bold text-[var(--ink)]">Pendientes</h2>
            <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-[var(--accent-soft)] text-[var(--accent)]">
              {pending.length}
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 card-stagger">
            {pending.map((payment) => (
              <PaymentCard
                key={payment.id}
                payment={payment}
                autoOpen={payment.id === highlightId}
                onDeleted={handleDeleted}
                onUpdated={handleUpdated}
                onSnoozed={handleSnoozed}
              />
            ))}
          </div>
        </section>
      )}

      {/* ─── Snoozed payments ─────────────────────────────────────────────── */}
      {snoozed.length > 0 && filter !== 'paid' && (
        <section className="card p-4 sm:p-5">
          <div className="flex items-center gap-2.5 mb-4">
            <span className="w-9 h-9 rounded-xl bg-slate-200/70 flex items-center justify-center text-lg shrink-0" aria-hidden="true">
              ⏸
            </span>
            <h2 className="text-lg font-bold text-[var(--ink)]">Pospuestos</h2>
            <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-slate-200/80 text-slate-600">
              {snoozed.length}
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 card-stagger">
            {snoozed.map((payment) => (
              <PaymentCard
                key={payment.id}
                payment={payment}
                autoOpen={payment.id === highlightId}
                onDeleted={handleDeleted}
                onUpdated={handleUpdated}
                onSnoozed={handleSnoozed}
              />
            ))}
          </div>
        </section>
      )}

      {/* ─── Paid this month ──────────────────────────────────────────────── */}
      {paid.length > 0 && filter !== 'pending' && (
        <section className="card p-4 sm:p-5">
          <div className="flex items-center gap-2.5 mb-4">
            <span className="w-9 h-9 rounded-xl bg-[var(--accent-soft)] flex items-center justify-center text-lg shrink-0" aria-hidden="true">
              ✅
            </span>
            <h2 className="text-lg font-bold text-[var(--ink)]">Pagados este mes</h2>
            <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-[var(--accent-soft)] text-[var(--accent)]">
              {paid.length}
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 card-stagger">
            {paid.map((payment) => (
              <PaymentCard
                key={payment.id}
                payment={payment}
                autoOpen={payment.id === highlightId}
                onDeleted={handleDeleted}
                onUpdated={handleUpdated}
                onSnoozed={handleSnoozed}
              />
            ))}
          </div>
        </section>
      )}

      {/* ─── No vencen este mes ───────────────────────────────────────────
          Recibos cada 2, 3, 6 o 12 meses fuera de su mes: no hay nada que
          pagar, así que ni pendientes ni «pagados». Cada tarjeta dice cuándo
          le toca. */}
      {fueraDeCiclo.length > 0 && filter === 'all' && (
        <section className="card p-4 sm:p-5">
          <div className="flex items-center gap-2.5 mb-4">
            <span className="w-9 h-9 rounded-xl bg-[var(--surface-2)] flex items-center justify-center text-lg shrink-0" aria-hidden="true">
              🗓️
            </span>
            <h2 className="text-lg font-bold text-[var(--ink)]">No vencen este mes</h2>
            <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-[var(--surface-2)] text-[var(--ink-muted)]">
              {fueraDeCiclo.length}
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 card-stagger">
            {fueraDeCiclo.map((payment) => (
              <PaymentCard
                key={payment.id}
                payment={payment}
                autoOpen={payment.id === highlightId}
                onDeleted={handleDeleted}
                onUpdated={handleUpdated}
                onSnoozed={handleSnoozed}
              />
            ))}
          </div>
        </section>
      )}

      {/* ─── Empty state ──────────────────────────────────────────────────── */}
      {/* Sin instrucciones: tocar la categoría abre el formulario ya encaminado. */}
      {payments.length === 0 && (
        <div className="grid grid-cols-3 gap-3 py-6">
          {PAYMENT_SHORTCUTS.map(({ category, emoji, label }) => (
            <Link
              key={category}
              href={`/payments/new?category=${category}`}
              className="flex flex-col items-center justify-center gap-2 aspect-square rounded-3xl bg-white border border-sky-100 shadow-sm active:scale-95 active:shadow-inner transition"
            >
              <span className="text-3xl leading-none" aria-hidden="true">{emoji}</span>
              <span className="text-xs font-bold text-black">{label}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
