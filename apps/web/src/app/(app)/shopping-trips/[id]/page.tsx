import Link from 'next/link';
import { notFound } from 'next/navigation';
import { api } from '@/lib/api';
import type { ShoppingTripDetail } from '@foody/types';
import DeleteTripButton from './DeleteTripButton';

function formatCurrency(value: number, currency: string): string {
  try {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${currency} ${value.toFixed(2)}`;
  }
}

function formatDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat('es-MX', {
      dateStyle: 'long',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

const STRATEGY_LABELS: Record<string, string> = {
  manual_partial: 'Mixto',
  by_quantity: 'Por cantidad',
  equal: 'Igual',
  none: 'Sin precios',
};

export default async function TripDetailPage({
  params,
}: Readonly<{
  params: Promise<{ id: string }>;
}>) {
  const { id } = await params;
  let trip: ShoppingTripDetail;
  try {
    trip = await api.shoppingTrips.get(id);
  } catch {
    notFound();
  }

  return (
    <div className="space-y-4">
      <Link href="/shopping-trips" className="text-sm text-stone-500 hover:text-stone-700">
        ← Volver a compras
      </Link>

      <header className="rounded-2xl bg-white p-5 shadow-sm border border-stone-100">
        <p className="text-xs uppercase tracking-wide text-brand-600 font-semibold">
          Ticket
        </p>
        <h1 className="text-2xl font-bold text-stone-800">
          🏪 {trip.storeName ?? 'Sin tienda'}
        </h1>
        <p className="text-sm text-stone-500 mt-1">{formatDate(trip.purchasedAt)}</p>
        <div className="mt-3 flex items-center justify-between">
          <p className="text-sm text-stone-500">
            Estrategia:{' '}
            <strong className="text-stone-700">
              {STRATEGY_LABELS[trip.allocationStrategy] ?? trip.allocationStrategy}
            </strong>
          </p>
          <p className="text-2xl font-bold text-brand-700">
            {formatCurrency(trip.totalAmount, trip.currency)}
          </p>
        </div>
      </header>

      <section className="rounded-2xl bg-white p-4 shadow-sm border border-stone-100">
        <h2 className="font-semibold text-stone-800 mb-3">Productos ({trip.items.length})</h2>
        <ul className="space-y-2">
          {trip.items.map((item) => (
            <li
              key={item.id}
              className="flex items-center justify-between rounded-xl border border-stone-100 px-3 py-2"
            >
              <div className="min-w-0">
                <p className="font-medium text-stone-800 truncate">
                  {item.quantity} × producto
                </p>
                <p className="text-xs text-stone-500 flex items-center gap-1">
                  {item.unitPrice != null && (
                    <>
                      {formatCurrency(item.unitPrice, item.currency)} c/u
                      {item.priceSource === 'allocated' && (
                        <span className="text-[10px] px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded">
                          est.
                        </span>
                      )}
                    </>
                  )}
                  {item.unitPrice == null && (
                    <span className="text-stone-400">Sin precio</span>
                  )}
                </p>
              </div>
              <p className="font-semibold text-stone-700">
                {item.totalPrice == null
                  ? '—'
                  : formatCurrency(item.totalPrice, item.currency)}
              </p>
            </li>
          ))}
        </ul>
      </section>

      {trip.notes && (
        <section className="rounded-2xl bg-white p-4 shadow-sm border border-stone-100">
          <h2 className="font-semibold text-stone-800 mb-2">Notas</h2>
          <p className="text-sm text-stone-600 whitespace-pre-wrap">{trip.notes}</p>
        </section>
      )}

      <DeleteTripButton tripId={trip.id} />
    </div>
  );
}
