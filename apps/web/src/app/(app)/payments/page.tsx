import Link from 'next/link';
import { Suspense } from 'react';
import { api } from '@/lib/api';
import PaymentsList from '@/components/payments/PaymentsList';
import ModernTitle from '@/components/layout/ModernTitle';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Pagos Mensuales' };

/**
 * Pagos Mensuales: los recibos que se pagan y se olvidan.
 *
 * Aquí NO hay entrada a Deudas y Créditos. La tenía —una tarjeta con el saldo
 * total arriba del todo— de cuando Deudas colgaba de esta sección y no había
 * otra forma de llegar. Ahora Deudas es una sección propia con su entrada en el
 * menú, así que esa tarjeta solo repetía un camino que ya existe y le robaba la
 * portada a lo que esta pantalla sí resuelve: qué toca pagar este mes.
 */
export default async function PaymentsPage() {
  const payments = await api.payments.list().catch(() => []);
  const paid = payments.filter((p) => p.isPaidThisMonth);

  return (
    <div className="space-y-6">
      <ModernTitle
        title="Pagos"
        subtitle={`${paid.length}/${payments.length} pagados este mes`}
        action={
          <Link
            href="/payments/new"
            aria-label="Agregar pago"
            className="hidden md:inline-flex items-center gap-1.5 btn-primary rounded-2xl px-5 py-3 text-sm"
          >
            + Agregar pago
          </Link>
        }
      />

      <Suspense>
        <PaymentsList initialPayments={payments} />
      </Suspense>
    </div>
  );
}
