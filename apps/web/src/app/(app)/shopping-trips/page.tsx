import Link from 'next/link';
import { ChevronRightIcon, ScaleIcon } from '@heroicons/react/24/outline';
import { api } from '@/lib/api';
import ModernTitle from '@/components/layout/ModernTitle';
import OtherExpensesButton from '@/components/shopping/OtherExpensesButton';
import TripsScopedList from '@/components/shopping/TripsScopedList';
import ComputoChip from '@/components/computo/ComputoChip';
import { computoDisponiblePara } from '@/lib/computo/config';
import { getSession } from '@/lib/session';
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

  // El enlace con Computo es solo del dueño (ver lib/computo/config.ts): para
  // los demás ni se pinta el chip ni se pide su estado.
  const conComputo = computoDisponiblePara((await getSession()).userId);

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

      {conComputo && <ComputoChip />}

      {/* Lo que se escaneó y NO era super. Solo aparece si existe: quien nunca
          clasifica un gasto fuera del super no ve nada de esto.

          Título y cifra, nada más: el desglose por tipo se abre al tocar, en
          vez de resumirse en un renglón de texto que no cabía y no dejaba
          llegar al detalle. */}
      {otherKinds.count > 0 && <OtherExpensesButton total={otherKinds.total} />}

      {/* Atajo a comparar precios: una fila de la misma familia que las
          tarjetas, con su icono en aurora, en vez de un recuadro celeste con
          un emoji que se veía distinto en cada teléfono. */}
      <Link
        href="/shopping-trips/compare"
        className="card group flex items-center gap-3 px-4 py-3 transition hover:shadow-[var(--shadow-md)] active:scale-[0.99]"
      >
        <span
          aria-hidden="true"
          className="grid place-items-center w-10 h-10 shrink-0 rounded-2xl text-white shadow-[var(--glow)]"
          style={{ backgroundImage: 'var(--aurora)' }}
        >
          <ScaleIcon className="w-5 h-5" />
        </span>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-[var(--ink)] text-sm">Comparar precios</p>
          <p className="t-meta">Qué súper tiene cada producto más barato</p>
        </div>
        <ChevronRightIcon aria-hidden="true" className="w-5 h-5 text-[var(--ink-subtle)] transition-transform group-hover:translate-x-0.5" />
      </Link>

      {/* Las cifras y la lista viven juntas en un cliente: el filtro por ámbito
          tiene que mover las dos a la vez o el titular contradice a la lista. */}
      <TripsScopedList trips={trips} initialScope={readScope(scope)} />
    </div>
  );
}
