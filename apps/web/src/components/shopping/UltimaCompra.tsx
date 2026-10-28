import Image from 'next/image';
import Link from 'next/link';
import { ChevronRightIcon } from '@heroicons/react/24/outline';
import type { ShoppingTrip } from '@foody/types';
import { cuandoFue } from '@/lib/app-time';
import { getStoreLogo } from '@/lib/store-logo';
import StoreMark from './StoreMark';

function dinero(value: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 2 }).format(value);
  } catch {
    return `${currency} ${value.toFixed(2)}`;
  }
}

/**
 * La última compra, en la puerta del súper.
 *
 * Aquí iba el súper con más visitas y lo gastado en él desde siempre: una
 * estadística, y además una que ya está en Estadísticas. Al entrar a comprar lo útil es lo de la última vez —dónde,
 * cuándo, cuánto— y poder abrir ese ticket para ver qué se llevó.
 *
 * Sin estado ni efectos: se pinta en el servidor con la página.
 */
export default function UltimaCompra({
  trip,
  items,
  ahora,
}: {
  readonly trip: ShoppingTrip;
  readonly items: number;
  /** Solo lo fijan las pruebas. */
  readonly ahora?: Date;
}) {
  const tienda = trip.storeName?.trim() || 'Sin tienda';
  const logo = trip.storeName ? getStoreLogo(trip.storeName) : null;
  const cuando = cuandoFue(trip.purchasedAt, ahora);

  return (
    <Link
      href={`/shopping-trips/${trip.id}`}
      aria-label={`Última compra: ${tienda}, ${cuando}, ${dinero(trip.totalAmount, trip.currency)}. Ver el ticket`}
      className="card group flex items-center gap-3 p-3.5 transition hover:shadow-[var(--shadow-md)] active:scale-[0.99]"
    >
      {logo ? (
        <span className="w-11 h-11 rounded-2xl overflow-hidden grid place-items-center bg-white border border-[var(--line)] shrink-0">
          <Image src={logo} alt="" width={44} height={44} className="object-contain w-full h-full" />
        </span>
      ) : (
        <StoreMark nombre={trip.storeName} />
      )}
      <span className="flex-1 min-w-0">
        <span className="t-label block">Última compra · {cuando}</span>
        <span className="block font-bold text-[var(--ink)] truncate">{tienda}</span>
        {items > 0 && (
          <span className="t-meta block">
            {items} {items === 1 ? 'producto' : 'productos'}
          </span>
        )}
      </span>
      <span className="t-num text-lg text-[var(--ink)] shrink-0">{dinero(trip.totalAmount, trip.currency)}</span>
      <ChevronRightIcon
        aria-hidden="true"
        className="w-5 h-5 shrink-0 text-[var(--ink-subtle)] transition-transform group-hover:translate-x-0.5"
      />
    </Link>
  );
}
