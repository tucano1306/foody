import PaymentForm from '@/components/payments/PaymentForm';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Nuevo Pago' };

export default function NewPaymentPage() {
  return (
    <div className="max-w-xl mx-auto">
      <div className="mb-6">
        <a href="/payments" className="text-brand-500 hover:underline text-sm">
          ← Volver a pagos
        </a>
        <h1 className="text-2xl font-bold text-stone-800 mt-2">Nuevo Pago Mensual</h1>
      </div>
      <div className="bg-white rounded-2xl shadow-sm border border-stone-100 p-6">
        <PaymentForm />
      </div>
    </div>
  );
}
