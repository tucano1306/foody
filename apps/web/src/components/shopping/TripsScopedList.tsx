'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { ShoppingTrip } from '@foody/types';
import { detectExpenseKind } from '@/lib/expense-kind';
import { matchesFilter, splitAmount, summarizeByScope, type ScopeFilter } from '@/lib/expense-scope';
import ScopeTabs from '@/components/ui/ScopeTabs';
import ReclassifyChip from './ReclassifyChip';

interface Props {
  readonly trips: readonly ShoppingTrip[];
  /** Ámbito con el que abrir, si quien enlaza aquí ya sabe cuál quiere. */
  readonly initialScope?: ScopeFilter;
}

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

/**
 * La lista de tickets, con su franja de cifras, filtrable por ámbito.
 *
 * Sale del componente de servidor de la página porque el filtro necesita
 * estado. Se lleva consigo las CIFRAS de arriba —compras, total, promedio— y no
 * solo la lista: dejar el titular contando todo mientras la lista enseña una
 * parte es justo la incoherencia que hacía imposible cuadrar el Plan financiero
 * con esta pantalla.
 *
 * Un ticket MIXTO sale en las dos vistas con su parte correspondiente. El
 * CONTEO no se reparte: medio ticket no existe, y una compra a medias entre la
 * casa y el negocio ocurrió una sola vez.
 */
export default function TripsScopedList({ trips: recibidos, initialScope = 'all' }: Props) {
  const [scope, setScope] = useState<ScopeFilter>(initialScope);

  /**
   * Esta pantalla es «Compras del súper», así que el importe de un ticket es
   * lo que fue A LA DESPENSA, no lo que costó el recibo.
   *
   * Un Publix de $35.71 con $21.94 mandados a farmacia salía aquí como $35.71
   * de súper: el mismo dinero contado dos veces entre esta lista y el plan, y
   * un gasto de despensa inflado en la mitad. El total del recibo se guarda
   * aparte para poder enseñarlo como contexto.
   */
  const trips = useMemo(
    () =>
      recibidos.map((t) => {
        const fuera = t.splitTotal ?? 0;
        return {
          ...t,
          ticketTotal: t.totalAmount,
          repartidoFuera: fuera,
          totalAmount: Math.round(Math.max(0, t.totalAmount - fuera) * 100) / 100,
        };
      }),
    [recibidos],
  );

  const summary = useMemo(
    () =>
      summarizeByScope(
        trips.map((t) => ({
          id: t.id,
          name: t.storeName ?? 'Sin tienda',
          amount: t.totalAmount,
          businessShare: t.businessShare,
        })),
      ),
    [trips],
  );

  const visibles = useMemo(() => {
    if (scope === 'all') return trips;
    const lado = scope === 'business' ? 'business' : 'personal';
    return trips
      .filter((t) => matchesFilter(t.businessShare, scope))
      .map((t) => ({
        ...t,
        totalAmount: splitAmount(t.totalAmount, t.businessShare)[lado],
      }));
  }, [trips, scope]);

  const currency = trips[0]?.currency ?? 'USD';
  const totalSpent = visibles.reduce((sum, t) => sum + t.totalAmount, 0);
  const avgSpent = visibles.length > 0 ? totalSpent / visibles.length : 0;

  // Medallas: solo tienen sentido con dos o más tickets con importe.
  const withAmount = visibles.filter((t) => t.totalAmount > 0);
  const cheapestId =
    visibles.length >= 2 && withAmount.length >= 2
      ? withAmount.reduce((a, b) => (a.totalAmount <= b.totalAmount ? a : b)).id
      : null;
  const priciestId =
    visibles.length >= 2 && withAmount.length >= 2
      ? withAmount.reduce((a, b) => (a.totalAmount >= b.totalAmount ? a : b)).id
      : null;

  if (trips.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-10 text-center">
        <p className="text-5xl mb-3">🛒</p>
        <p className="text-slate-700 font-semibold">Aún no registras compras del super</p>
        <p className="text-sm text-slate-500 mt-1">
          Completa una sesión de supermercado y Foody guardará los precios automáticamente.
        </p>
        <Link
          href="/shopping-trips/new"
          className="inline-block mt-4 rounded-xl bg-brand-600 text-white px-5 py-2.5 text-sm font-semibold"
        >
          Registrar primera compra
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <ScopeTabs
        value={scope}
        onChange={setScope}
        summary={summary}
        format={(n) => formatCurrency(n, currency)}
      />

      <div className="grid grid-cols-3 gap-3 card-stagger">
        <div className="stat-card" data-accent="brand">
          <p className="text-[11px] sm:text-xs font-semiboldr text-slate-500">🧾 Compras</p>
          <p className="stat-value mt-1.5 text-xl sm:text-2xl font-extrabold text-slate-900">{visibles.length}</p>
        </div>
        <div className="stat-card" data-accent="energy">
          <p className="text-[11px] sm:text-xs font-semiboldr text-slate-500">💰 Total</p>
          <p className="stat-value mt-1.5 text-xl sm:text-2xl font-extrabold text-slate-900 break-all">
            {formatCurrency(totalSpent, currency)}
          </p>
        </div>
        <div className="stat-card" data-accent="warn">
          <p className="text-[11px] sm:text-xs font-semiboldr text-slate-500">📊 Promedio</p>
          <p className="stat-value mt-1.5 text-xl sm:text-2xl font-extrabold text-slate-900 break-all">
            {formatCurrency(avgSpent, currency)}
          </p>
        </div>
      </div>

      {visibles.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-500">
          No hay compras de este lado.
        </p>
      ) : (
        <ul className="space-y-2 card-stagger">
          {visibles.map((trip) => {
            // Tickets de antes de que existiera la clasificación: nada se migró
            // solo, así que el nombre de la tienda es lo único que puede
            // delatar que esto no era una compra de despensa.
            const suggested = detectExpenseKind(trip.storeName);
            const misfiled = suggested !== null && suggested !== 'grocery';
            return (
              <li key={trip.id}>
                <Link
                  href={`/shopping-trips/${trip.id}`}
                  className="group block rounded-2xl bg-white border border-slate-100 px-4 py-3 shadow-sm hover:border-brand-200 hover:shadow-md hover:-translate-y-0.5 active:scale-[0.99] transition"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-2xl shrink-0 transition-transform duration-300 group-hover:scale-125 group-hover:-rotate-12">
                      🏪
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-slate-800 truncate">
                        {trip.storeName ?? 'Sin tienda'}
                      </p>
                      <p className="text-xs text-slate-500">{formatDate(trip.purchasedAt)}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-bold text-brand-700">
                        {formatCurrency(trip.totalAmount, trip.currency)}
                      </p>
                      {/* De dónde sale esa cifra cuando no es el recibo entero:
                          sin esto, un ticket repartido parece que costó menos
                          de lo que dice el papel. */}
                      {trip.repartidoFuera > 0 && (
                        <p className="text-[11px] text-slate-400">
                          de {formatCurrency(trip.ticketTotal, trip.currency)}
                        </p>
                      )}
                      {trip.id === cheapestId && (
                        <span className="inline-block mt-0.5 text-[11px] font-bold px-1.5 py-0.5 rounded-full bg-sky-100 text-sky-700">
                          🏆 Más ahorradora
                        </span>
                      )}
                      {trip.id === priciestId && (
                        <span className="inline-block mt-0.5 text-[11px] font-bold px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-600">
                          💸 La más cara
                        </span>
                      )}
                    </div>
                    <span
                      aria-hidden="true"
                      className="shrink-0 text-slate-300 group-hover:text-brand-400 transition text-lg"
                    >
                      ›
                    </span>
                  </div>
                </Link>
                {/* Fuera del <Link>: es un botón, y anidarlo dentro de un
                    enlace haría que tocarlo también navegara. */}
                {misfiled && (
                  <ReclassifyChip
                    tripId={trip.id}
                    storeName={trip.storeName ?? 'Este ticket'}
                    suggested={suggested}
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
