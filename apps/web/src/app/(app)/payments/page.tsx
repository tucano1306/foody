import Link from 'next/link';
import { Suspense } from 'react';
import { api } from '@/lib/api';
import { getSession } from '@/lib/session';
import { getDebtsSummary } from '@/lib/debt-data';
import PaymentsList from '@/components/payments/PaymentsList';
import ModernTitle from '@/components/layout/ModernTitle';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Pagos Mensuales' };

/** Total adeudado formateado, con recorte de centavos cuando no aportan. */
function formatDebt(total: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      maximumFractionDigits: Number.isInteger(total) ? 0 : 2,
    }).format(total);
  } catch {
    return `${currency} ${total.toFixed(2)}`;
  }
}

export default async function PaymentsPage() {
  const session = await getSession();
  const [payments, debts] = await Promise.all([
    api.payments.list().catch(() => []),
    session.userId ? getDebtsSummary(session.userId).catch(() => null) : Promise.resolve(null),
  ]);
  const paid = payments.filter((p) => p.isPaidThisMonth);
  const hasDebts = (debts?.count ?? 0) > 0;

  return (
    <div className="space-y-6">
      <ModernTitle
        title="💳 Pagos Mensuales"
        subtitle={`${paid.length}/${payments.length} pagados este mes`}
        action={
          <Link
            href="/payments/new"
            aria-label="Agregar pago"
            className="inline-flex items-center bg-brand-500 hover:bg-brand-600 active:scale-95 text-white font-semibold px-4 sm:px-5 py-3 rounded-2xl transition shadow-sm text-sm whitespace-nowrap"
          >
            <span className="sm:hidden">+ Nuevo</span>
            <span className="hidden sm:inline">+ Agregar</span>
          </Link>
        }
      />

      {/* Entrada a Deudas: el saldo es el gancho, tocar la tarjeta es la única
          instrucción que hace falta. */}
      <Link
        href="/debts"
        className="flex items-center gap-4 rounded-2xl bg-linear-to-br from-sky-500 to-blue-700 px-4 py-4 shadow-sm transition-all duration-200 active:scale-[0.99] hover:shadow-md sm:px-5"
      >
        <span
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white/20 text-2xl"
          aria-hidden="true"
        >
          🏦
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold leading-tight text-white sm:text-base">
            Deudas y Créditos
          </p>
          <p className="mt-0.5 text-[11px] text-white/75 sm:text-xs">
            {hasDebts
              ? `${debts!.count} ${debts!.count === 1 ? 'deuda activa' : 'deudas activas'} · cuota e intereses al día`
              : 'Tarjetas y préstamos: cuánto pagar cada mes'}
          </p>
        </div>
        {hasDebts && (
          <p className="shrink-0 text-lg font-extrabold text-white sm:text-2xl">
            {formatDebt(debts!.totalBalance, debts!.currency)}
          </p>
        )}
        <span className="shrink-0 text-white/60" aria-hidden="true">›</span>
      </Link>

      <Suspense>
        <PaymentsList initialPayments={payments} />
      </Suspense>
    </div>
  );
}
