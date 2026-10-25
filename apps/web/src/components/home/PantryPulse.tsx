'use client';

import Link from 'next/link';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ArrowRightIcon, CheckIcon, ShoppingCartIcon } from '@heroicons/react/24/solid';
import type { PulsoDespensa } from '@/lib/pulso-despensa';

interface Props {
  readonly pulso: PulsoDespensa;
}

interface Tramo {
  readonly clave: 'tengo' | 'carrito' | 'mitad' | 'acabado';
  readonly etiqueta: string;
  readonly valor: number;
  /** Relleno del tramo y del punto de la leyenda: la misma pieza en los dos
   *  sitios, así la leyenda explica la barra sin una palabra más. */
  readonly color: string;
  readonly estilo?: React.CSSProperties;
  readonly href: string;
}

/**
 * El pulso de la despensa: lo primero que se ve en Casa.
 *
 * Antes, para saber cómo estaba la casa había que bajar hasta «Tu mes» y leer
 * dos tarjetas («En la despensa 48», «Por reponer 5»), que además repetían lo
 * que las secciones de urgencia ya contaban. Y nada decía que marcar «se
 * acabó» es lo que llena la lista del súper: había que descubrirlo.
 *
 * Una barra hecha de los mismos tres niveles que llevan las tarjetas
 * (tengo · a la mitad · se acabó) lo enseña sin texto: marcas un producto
 * abajo y el tramo crece aquí arriba, y crece también el número del botón
 * que lleva al súper. La relación causa → efecto se VE.
 */
export default function PantryPulse({ pulso }: Props) {
  const reducir = useReducedMotion();

  if (pulso.total === 0) return null;

  // Los tramos van de lo que está bien a lo urgente, de izquierda a derecha:
  // el final de la barra —donde el ojo termina— es lo que pide acción.
  const tramos: readonly Tramo[] = [
    { clave: 'tengo', etiqueta: 'Tengo', valor: pulso.tengo, color: 'bg-brand-200 dark:bg-brand-900', href: '#productos' },
    { clave: 'carrito', etiqueta: 'Carrito', valor: pulso.enCarrito, color: 'bg-sky-400', href: '/supermarket' },
    { clave: 'mitad', etiqueta: 'A la mitad', valor: pulso.mitad, color: 'bg-brand-400', href: '#queda-poco' },
    { clave: 'acabado', etiqueta: 'Se acabó', valor: pulso.acabado, color: 'bg-brand-600', estilo: { backgroundImage: 'var(--aurora)' }, href: '#se-acabo' },
  ];
  // «En el carrito» solo existe mientras hay una compra a medias: fuera de
  // ella sería un cero permanente en la leyenda.
  const visibles = tramos.filter((t) => t.clave !== 'carrito' || t.valor > 0);

  const todoBien = pulso.porReponer === 0;
  const muelle = reducir ? { duration: 0 } : { type: 'spring' as const, stiffness: 260, damping: 30 };

  const resumen = visibles.map((t) => `${t.valor} ${t.etiqueta.toLowerCase()}`).join(', ');

  return (
    <section
      aria-label="Estado de la despensa"
      className="card relative overflow-hidden p-4 sm:p-5"
      style={{ backgroundImage: 'var(--aurora-soft)' }}
    >
      <p className="t-label tabular-nums">
        Tu despensa · {pulso.total} {pulso.total === 1 ? 'producto' : 'productos'}
      </p>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.p
          key={todoBien ? `ok-${pulso.enCarrito > 0}` : pulso.porReponer}
          initial={reducir ? false : { opacity: 0, y: 10, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={reducir ? undefined : { opacity: 0, y: -10 }}
          transition={muelle}
          className="mt-1 flex items-center gap-2 font-[family-name:var(--font-display)] tracking-tight"
        >
          {todoBien ? (
            <>
              <span
                className="grid place-items-center w-8 h-8 shrink-0 rounded-full text-white shadow-[var(--glow)]"
                style={{ backgroundImage: 'var(--aurora)' }}
              >
                <CheckIcon className="w-5 h-5" aria-hidden="true" />
              </span>
              <span className="text-2xl font-bold text-[var(--ink)]">
                {pulso.enCarrito > 0 ? 'Todo en el carrito' : 'Todo en orden'}
              </span>
            </>
          ) : (
            <span className="flex items-baseline gap-2">
              <span className="t-num text-5xl font-bold leading-none text-aurora">{pulso.porReponer}</span>
              <span className="text-lg font-semibold text-[var(--ink)]">por reponer</span>
            </span>
          )}
        </motion.p>
      </AnimatePresence>

      {/* La barra. `flex-grow` con el recuento: cada tramo mide lo que pesa en
          la despensa, y animarlo es animar un número. El mínimo de 10 px
          impide que un solo producto agotado entre cuarenta desaparezca. */}
      <div role="img" aria-label={resumen} className="mt-4 flex h-4 gap-1 rounded-full">
        {visibles.map((t) =>
          t.valor > 0 ? (
            <motion.span
              key={t.clave}
              // Al abrir Casa la barra se llena desde cero: el primer vistazo
              // ya enseña que es un medidor y no una franja decorativa.
              initial={reducir ? false : { flexGrow: 0 }}
              animate={{ flexGrow: t.valor }}
              transition={muelle}
              className={`min-w-[10px] basis-0 rounded-full ${t.color}`}
              style={t.estilo}
            />
          ) : null,
        )}
      </div>

      {/* Leyenda que también es navegación: cada nivel lleva a su sección.
          Columnas iguales, número arriba y nombre debajo: se lee como un
          marcador y no se parte en dos renglones en un móvil. */}
      <ul className={`mt-3 grid gap-1 ${visibles.length === 4 ? 'grid-cols-4' : 'grid-cols-3'}`}>
        {visibles.map((t) => {
          const contenido = (
            <>
              <span className="flex items-center gap-1.5">
                <span aria-hidden="true" className={`w-2.5 h-2.5 rounded-full shrink-0 ${t.color}`} style={t.estilo} />
                <span className="t-num text-lg leading-none text-[var(--ink)]">{t.valor}</span>
              </span>
              <span className="t-meta mt-1 max-w-full truncate">{t.etiqueta}</span>
            </>
          );
          const caja = 'flex flex-col items-start rounded-2xl px-2 py-2 min-w-0';
          return (
            <li key={t.clave} className="min-w-0">
              {t.valor > 0 ? (
                <Link href={t.href} className={`${caja} transition-colors hover:bg-[var(--surface)]/70 active:scale-95`}>
                  {contenido}
                </Link>
              ) : (
                <span className={`${caja} opacity-45`}>{contenido}</span>
              )}
            </li>
          );
        })}
      </ul>

      {(pulso.porReponer > 0 || pulso.enCarrito > 0) && (
        <Link
          href="/supermarket"
          className="btn-primary mt-4 flex items-center justify-center gap-2 rounded-2xl px-5 py-3.5 text-[15px]"
        >
          <ShoppingCartIcon className="w-5 h-5" aria-hidden="true" />
          {pulso.enCarrito > 0 ? 'Seguir en el súper' : 'Ir al súper'}
          {pulso.porReponer > 0 && (
            <span className="t-num rounded-full bg-white/20 px-2 py-0.5 text-sm">{pulso.porReponer}</span>
          )}
          <ArrowRightIcon className="w-4 h-4 opacity-80" aria-hidden="true" />
        </Link>
      )}
    </section>
  );
}
