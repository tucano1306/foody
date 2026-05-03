import Link from 'next/link';
import { api } from '@/lib/api';
import PaymentsList from '@/components/payments/PaymentsList';
import ModernTitle from '@/components/layout/ModernTitle';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Pagos Mensuales' };

export default async function PaymentsPage() {
  const payments = await api.payments.list().catch(() => []);
  const paid = payments.filter((p) => p.isPaidThisMonth);

  return (
    <div className="space-y-6">
      <ModernTitle
        title="💳 Pagos Mensuales"
        subtitle={`${paid.length}/${payments.length} pagados este mes`}
        action={
          <Link
            href="/payments/new"
            aria-label="Agregar pago"
            className="bg-brand-500 hover:bg-brand-600 text-white font-semibold px-3 sm:px-5 py-2 sm:py-2.5 rounded-xl transition-colors shadow-sm text-xs sm:text-sm whitespace-nowrap"
          >
            <span className="sm:hidden">+ Nuevo</span>
            <span className="hidden sm:inline">+ Agregar</span>
          </Link>
        }
      />

      <PaymentsList initialPayments={payments} />
    </div>
  );
}
