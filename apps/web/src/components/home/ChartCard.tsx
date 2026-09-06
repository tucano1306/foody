import type { ReactNode } from 'react';
import ChartZoom from './ChartZoom';

/**
 * Envoltorio común de las tarjetas con gráfica.
 *
 * Las cuatro de Casa (y las de Stats) repetían el mismo bloque a mano: emoji
 * dentro de un cuadrado azul, título CENTRADO y, debajo, una frase que volvía
 * a decir lo que el título ya decía — «Gastos por supermercado / Cuánto llevas
 * gastado en cada tienda». Cuatro frases de relleno seguidas en la misma
 * pantalla, y el título centrado rompiendo la alineación izquierda del resto
 * de la app.
 *
 * Aquí el título va a la izquierda como todo lo demás, sin adorno, y la
 * gráfica empieza antes. Si un dato necesita explicación, la explicación es
 * que la gráfica está mal hecha.
 */
export default function ChartCard({
  title,
  children,
  zoomable = true,
}: {
  readonly title: string;
  readonly children: ReactNode;
  /** Los estados vacíos no se amplían: no hay nada que agrandar. */
  readonly zoomable?: boolean;
}) {
  return (
    <section className="relative bg-[var(--surface)] rounded-[var(--radius-card)] p-5 border border-[var(--line)] shadow-[var(--shadow-sm)]">
      {/* pr-10 deja hueco al botón de ampliar, que va anclado a la esquina. */}
      <h2 className="text-base sm:text-lg font-extrabold text-[var(--ink)] mb-4 pr-10">
        {title}
      </h2>
      {zoomable ? <ChartZoom title={title}>{children}</ChartZoom> : children}
    </section>
  );
}

/** Hueco de una gráfica sin datos: un icono, una línea y nada más. */
export function ChartEmpty({
  emoji,
  message,
}: {
  readonly emoji: string;
  readonly message: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-12">
      <span className="text-4xl mb-3 opacity-40" aria-hidden="true">{emoji}</span>
      <p className="text-sm font-medium text-[var(--ink-subtle)] text-center">{message}</p>
    </div>
  );
}
