import Link from 'next/link';
import { api } from '@/lib/api';
import ModernTitle from '@/components/layout/ModernTitle';
import type { ShoppingTrip } from '@foody/types';

function formatCurrency(value: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-US', {
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
    // Medianoche UTC formateada en hora local mostraría el día anterior.
    return new Intl.DateTimeFormat('es-MX', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
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

  const totalSpent = trips.reduce((sum, t) => sum + t.totalAmount, 0);
  const avgSpent = trips.length > 0 ? totalSpent / trips.length : 0;
  const currency = trips[0]?.currency ?? 'USD';

  // Playful medals: cheapest and priciest trips (only meaningful with 2+ trips)
  const withAmount = trips.filter((t) => t.totalAmount > 0);
  const cheapestId = trips.length >= 2 && withAmount.length >= 2
    ? withAmount.reduce((a, b) => (a.totalAmount <= b.totalAmount ? a : b)).id
    : null;
  const priciestId = trips.length >= 2 && withAmount.length >= 2
    ? withAmount.reduce((a, b) => (a.totalAmount >= b.totalAmount ? a : b)).id
    : null;

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

      {/* Fun stats strip */}
      {trips.length > 0 && (
        <div className="grid grid-cols-3 gap-3 card-stagger">
          <div className="stat-card" data-accent="brand">
            <p className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-stone-500">🧾 Compras</p>
            <p className="stat-value mt-1.5 text-xl sm:text-2xl font-extrabold text-stone-900">{trips.length}</p>
          </div>
          <div className="stat-card" data-accent="energy">
            <p className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-stone-500">💰 Total</p>
            <p className="stat-value mt-1.5 text-xl sm:text-2xl font-extrabold text-stone-900 break-all">{formatCurrency(totalSpent, currency)}</p>
          </div>
          <div className="stat-card" data-accent="warn">
            <p className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-stone-500">📊 Promedio</p>
            <p className="stat-value mt-1.5 text-xl sm:text-2xl font-extrabold text-stone-900 break-all">{formatCurrency(avgSpent, currency)}</p>
          </div>
        </div>
      )}

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
        <>
          <p className="text-xs text-stone-400 px-1">
            👆 Toca un ticket para verlo, editarlo o borrarlo.
          </p>
          <ul className="space-y-2 card-stagger">
            {trips.map((trip) => (
              <li key={trip.id}>
                <Link
                  href={`/shopping-trips/${trip.id}`}
                  className="group block rounded-2xl bg-white border border-stone-100 px-4 py-3 shadow-sm hover:border-brand-200 hover:shadow-md hover:-translate-y-0.5 active:scale-[0.99] transition"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-2xl shrink-0 transition-transform duration-300 group-hover:scale-125 group-hover:-rotate-12">🏪</span>
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
                      {trip.id === cheapestId && (
                        <span className="inline-block mt-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                          🏆 Más ahorradora
                        </span>
                      )}
                      {trip.id === priciestId && (
                        <span className="inline-block mt-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-rose-100 text-rose-600">
                          💸 La más cara
                        </span>
                      )}
                    </div>
                    <span
                      aria-hidden="true"
                      className="shrink-0 text-stone-300 group-hover:text-brand-400 transition text-lg"
                    >
                      ›
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
