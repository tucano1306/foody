import Link from 'next/link';
import { api } from '@/lib/api';
import ModernTitle from '@/components/layout/ModernTitle';
import OtherExpensesButton from '@/components/shopping/OtherExpensesButton';
import TripsScopedList from '@/components/shopping/TripsScopedList';
import type { ScopeFilter } from '@/lib/expense-scope';
import type { ShoppingTrip } from '@foody/types';

/** El ámbito pedido por la URL, o «todo» si no viene o no se entiende. */
function readScope(raw: string | undefined): ScopeFilter {
  return raw === 'personal' || raw === 'business' ? raw : 'all';
}

export default async function ShoppingTripsPage({
  searchParams,
}: {
  searchParams: Promise<{ scope?: string }>;
}) {
  // El Plan financiero enlaza aquí con el ámbito puesto, para que el consejo y
  // la pantalla a la que lleva hablen del mismo dinero.
  const { scope } = await searchParams;

  let trips: ShoppingTrip[] = [];
  try {
    trips = await api.shoppingTrips.list();
  } catch {
    trips = [];
  }

  // Cuántos gastos de este mes NO son de super. Se enseñan como puerta al plan:
  // sin esto, quien escaneó una factura de restaurante la buscaría aquí, no la
  // encontraría y pensaría que se perdió.
  let otherKinds = { count: 0, total: 0 };
  try {
    otherKinds = await api.shoppingTrips.otherKindsThisMonth();
  } catch {
    otherKinds = { count: 0, total: 0 };
  }

  return (
    <div className="space-y-4">
      <ModernTitle
        title="Compras"
        subtitle="Tickets y precios de tu despensa"
        action={
          <Link
            href="/shopping-trips/new"
            aria-label="Nueva compra"
            className="hidden md:inline-flex items-center gap-1.5 btn-primary rounded-2xl px-5 py-3 text-sm"
          >
            + Nueva compra
          </Link>
        }
      />

      {/* Lo que se escaneó y NO era super. Solo aparece si existe: quien nunca
          clasifica un gasto fuera del super no ve nada de esto.

          Título y cifra, nada más: el desglose por tipo se abre al tocar, en
          vez de resumirse en un renglón de texto que no cabía y no dejaba
          llegar al detalle. */}
      {otherKinds.count > 0 && <OtherExpensesButton total={otherKinds.total} />}

      {/* Compare prices shortcut */}
      <Link
        href="/shopping-trips/compare"
        className="flex items-center gap-3 rounded-2xl bg-sky-50 border border-sky-100 px-4 py-3 hover:bg-sky-100 transition"
      >
        <span className="text-2xl">📊</span>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sky-800 text-sm">Comparar precios</p>
          <p className="text-xs text-sky-500">Ve qué supermercado tiene cada producto más barato</p>
        </div>
        <span className="text-sky-400 text-sm">→</span>
      </Link>

      {/* Las cifras y la lista viven juntas en un cliente: el filtro por ámbito
          tiene que mover las dos a la vez o el titular contradice a la lista. */}
      <TripsScopedList trips={trips} initialScope={readScope(scope)} />
    </div>
  );
}
