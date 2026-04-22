import { api } from '@/lib/api';
import PaymentCard from '@/components/payments/PaymentCard';
import ModernTitle from '@/components/layout/ModernTitle';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Pagos Mensuales' };

export default async function PaymentsPage() {
  const payments = await api.payments.list();

  const pending = payments.filter((p) => !p.isPaidThisMonth);
  const paid = payments.filter((p) => p.isPaidThisMonth);
  const totalExpenses = payments.reduce((sum, p) => sum + p.amount, 0);
  const totalPaid = paid.reduce((sum, p) => sum + p.amount, 0);

  return (
    <div className="space-y-6">
      <ModernTitle
        title="💳 Pagos Mensuales"
        subtitle={`${paid.length}/${payments.length} pagados este mes`}
        action={
          <a
            href="/payments/new"
            aria-label="Agregar pago"
            className="bg-brand-500 hover:bg-brand-600 text-white font-semibold px-3 sm:px-5 py-2 sm:py-2.5 rounded-xl transition-colors shadow-sm text-xs sm:text-sm whitespace-nowrap"
          >
            <span className="sm:hidden">+ Nuevo</span>
            <span className="hidden sm:inline">+ Agregar</span>
          </a>
        }
      />

      {/* ─── Monthly summary ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl p-4 border border-stone-100 shadow-sm text-center">
          <p className="text-2xl font-bold text-stone-800">${totalExpenses.toFixed(2)}</p>
          <p className="text-xs text-stone-500 mt-1">Total mensual</p>
        </div>
        <div className="bg-green-50 rounded-2xl p-4 border border-green-100 shadow-sm text-center">
          <p className="text-2xl font-bold text-green-700">${totalPaid.toFixed(2)}</p>
          <p className="text-xs text-green-600 mt-1">Pagado</p>
        </div>
        <div className="bg-amber-50 rounded-2xl p-4 border border-amber-100 shadow-sm text-center">
          <p className="text-2xl font-bold text-amber-700">
            ${(totalExpenses - totalPaid).toFixed(2)}
          </p>
          <p className="text-xs text-amber-600 mt-1">Pendiente</p>
        </div>
      </div>

      {/* ─── Pending payments ───────────────────────────────────────────────── */}
      {pending.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold text-stone-700 mb-3">
            ⏰ Pendientes ({pending.length})
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {pending.map((payment) => (
              <PaymentCard key={payment.id} payment={payment} />
            ))}
          </div>
        </section>
      )}

      {/* ─── Paid this month ────────────────────────────────────────────────── */}
      {paid.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold text-stone-700 mb-3">
            ✅ Pagados este mes ({paid.length})
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {paid.map((payment) => (
              <PaymentCard key={payment.id} payment={payment} />
            ))}
          </div>
        </section>
      )}

      {payments.length === 0 && (
        <div className="text-center py-20">
          <p className="text-6xl mb-4">💸</p>
          <h2 className="text-xl font-semibold text-stone-600 mb-2">
            Sin pagos registrados
          </h2>
          <a
            href="/payments/new"
            className="inline-block bg-brand-500 text-white px-6 py-3 rounded-xl font-semibold hover:bg-brand-600 transition mt-4"
          >
            Agregar primer pago
          </a>
        </div>
      )}
    </div>
  );
}
