import Link from 'next/link';
import { api } from '@/lib/api';
import ModernTitle from '@/components/layout/ModernTitle';
import type { ShoppingTrip } from '@foody/types';

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
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export default async function ShoppingTripsPage() {
  let trips: ShoppingTrip[] = [];
  try {
    trips = await api.shoppingTrips.list();
  } catch {
    trips = [];
  }

  return (
    <div className="space-y-4">
      <ModernTitle
        title="🧾 Compras"
        subtitle="Historial de tickets y comparación de precios por supermercado."
        action={
          <Link
            href="/shopping-trips/new"
            aria-label="Nueva compra"
            className="rounded-xl bg-brand-600 text-white px-3 sm:px-4 py-2 text-xs sm:text-sm font-semibold shadow hover:bg-brand-700 transition whitespace-nowrap"
          >
            <span className="sm:hidden">+ Nueva</span>
            <span className="hidden sm:inline">+ Nueva compra</span>
          </Link>
        }
      />

      {/* Compare prices shortcut */}
      <Link
        href="/shopping-trips/compare"
        className="flex items-center gap-3 rounded-2xl bg-indigo-50 border border-indigo-100 px-4 py-3 hover:bg-indigo-100 transition"
      >
        <span className="text-2xl">📊</span>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-indigo-800 text-sm">Comparar precios</p>
          <p className="text-xs text-indigo-500">Ve qué supermercado tiene cada producto más barato</p>
        </div>
        <span className="text-indigo-400 text-sm">→</span>
      </Link>

      {trips.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-stone-200 bg-white p-10 text-center">
          <p className="text-5xl mb-3">🛒</p>
          <p className="text-stone-700 font-semibold">Aún no registras compras</p>
          <p className="text-sm text-stone-500 mt-1">
            Completa una sesión de supermercado y Foody guardará los precios automáticamente.
          </p>
          <Link
            href="/shopping-trips/new"
            className="inline-block mt-4 rounded-xl bg-brand-600 text-white px-5 py-2.5 text-sm font-semibold"
          >
            Registrar primera compra
          </Link>
        </div>
      ) : (
        <ul className="space-y-2">
          {trips.map((trip) => (
            <li key={trip.id}>
              <Link
                href={`/shopping-trips/${trip.id}`}
                className="block rounded-2xl bg-white border border-stone-100 px-4 py-3 shadow-sm hover:border-brand-200 hover:shadow-md transition"
              >
                <div className="flex items-center gap-3">
                  <span className="text-2xl shrink-0">🏪</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-stone-800 truncate">
                      {trip.storeName ?? 'Sin tienda'}
                    </p>
                    <p className="text-xs text-stone-500">
                      {formatDate(trip.purchasedAt)}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-bold text-brand-700">
                      {formatCurrency(trip.totalAmount, trip.currency)}
                    </p>
                    <p className="text-[11px] text-stone-400">Ver ticket →</p>
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
