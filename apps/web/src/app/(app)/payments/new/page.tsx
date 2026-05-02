import Link from 'next/link';
import PaymentForm from '@/components/payments/PaymentForm';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Nuevo Pago' };

export default function NewPaymentPage() {
  return (
    <div className="max-w-lg mx-auto pb-8">
      {/* Back link */}
      <div className="mb-4">
        <Link href="/payments" className="text-brand-500 hover:underline text-sm font-medium">
          ← Volver a pagos
        </Link>
      </div>

      {/* Card */}
      <div className="bg-white rounded-3xl shadow-sm border border-stone-100 overflow-hidden">
        {/* Header */}
        <div className="bg-linear-to-br from-brand-500 to-brand-600 px-6 py-7 text-white">
          <div className="text-4xl mb-2">💳</div>
          <h1 className="text-2xl font-bold">Nuevo Pago Mensual</h1>
          <p className="text-brand-100 text-sm mt-1">Registra un gasto recurrente del hogar</p>
        </div>

        {/* Form */}
        <div className="px-6 py-6">
          <PaymentForm />
        </div>
      </div>
    </div>
  );
}
