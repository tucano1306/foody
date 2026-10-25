'use client';

import { forwardRef, useId } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { CheckIcon, ChevronRightIcon } from '@heroicons/react/24/solid';

interface Props {
  /** Productos ya en el carro / total de la lista de hoy. */
  readonly enCarrito: number;
  readonly totalLista: number;
  readonly total: number;
  /** Parte del total que sale del último precio conocido, no de lo tecleado. */
  readonly hayEstimados: boolean;
  /** En el carro y sin precio de ESTA compra. */
  readonly sinPrecio: number;
  readonly onAbrirCarrito: () => void;
  readonly onPonerPrecios: () => void;
}

const R = 26;
const C = 2 * Math.PI * R;

/**
 * El tablero del súper: cuánto llevas y cuánto falta, en una pieza.
 *
 * Eran dos tarjetas apiladas —una barra de progreso con un 🛒 que se
 * deslizaba y, debajo, la «calculadora» con el total— que contaban la misma
 * compra por separado, y una línea de instrucciones («toca 💵 en un producto
 * para poner su precio») para lo que el diseño no decía solo.
 *
 * Ahora: un anillo con lo que llevas de la lista, el total grande al lado y,
 * si falta algún precio, un chip que lo dice con un número y que, al tocarlo,
 * abre directamente el primero. La instrucción sobra porque la acción está
 * donde se nota la falta.
 */
const TripBoard = forwardRef<HTMLDivElement, Props>(function TripBoard(
  { enCarrito, totalLista, total, hayEstimados, sinPrecio, onAbrirCarrito, onPonerPrecios },
  ref,
) {
  const reducir = useReducedMotion();
  const gradId = useId();
  const avance = totalLista === 0 ? 0 : enCarrito / totalLista;
  const completo = totalLista > 0 && enCarrito === totalLista;
  const vacio = enCarrito === 0;

  return (
    <div
      ref={ref}
      className="card overflow-hidden"
      style={{ backgroundImage: 'var(--aurora-soft)' }}
    >
      <button
        type="button"
        onClick={onAbrirCarrito}
        disabled={vacio}
        aria-label={vacio ? undefined : `Ver el carrito · ${enCarrito} de ${totalLista}`}
        className="w-full flex items-center gap-4 p-4 text-left transition active:scale-[0.99] disabled:active:scale-100 focus:outline-none"
      >
        {/* Anillo de avance: la lista de hoy, llenándose. */}
        <span className="relative shrink-0 w-[68px] h-[68px]">
          <svg viewBox="0 0 64 64" className="w-full h-full -rotate-90" aria-hidden="true">
            <defs>
              <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="var(--color-brand-500)" />
                <stop offset="55%" stopColor="var(--color-blue-500)" />
                <stop offset="100%" stopColor="var(--color-sky-400)" />
              </linearGradient>
            </defs>
            <circle cx="32" cy="32" r={R} fill="none" stroke="var(--line)" strokeWidth="7" />
            <motion.circle
              cx="32"
              cy="32"
              r={R}
              fill="none"
              stroke={`url(#${gradId})`}
              strokeWidth="7"
              strokeLinecap="round"
              strokeDasharray={C}
              initial={false}
              animate={{ strokeDashoffset: C * (1 - avance) }}
              transition={reducir ? { duration: 0 } : { type: 'spring', stiffness: 120, damping: 20 }}
            />
          </svg>
          <span className="absolute inset-0 grid place-items-center">
            {completo ? (
              <span
                className="grid place-items-center w-9 h-9 rounded-full text-white shadow-[var(--glow)] animate-pop"
                style={{ backgroundImage: 'var(--aurora)' }}
              >
                <CheckIcon className="w-5 h-5" aria-hidden="true" />
              </span>
            ) : (
              <span className="t-num text-[15px] leading-none text-[var(--ink)]">
                {enCarrito}
                <span className="text-[var(--ink-subtle)] font-semibold">/{totalLista}</span>
              </span>
            )}
          </span>
        </span>

        <span className="flex-1 min-w-0">
          <span className="t-label block">
            {completo ? '¡Carrito completo!' : hayEstimados ? 'Llevas, aprox.' : 'Llevas'}
          </span>
          <motion.span
            key={Math.round(total * 100)}
            initial={reducir ? false : { y: 6, opacity: 0.5 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 600, damping: 20 }}
            className={`block font-[family-name:var(--font-display)] t-num text-[2.1rem] leading-tight tracking-tight ${
              vacio ? 'text-[var(--ink-subtle)]' : 'text-aurora'
            }`}
          >
            ${total.toFixed(2)}
          </motion.span>
          <span className="t-meta block">
            {vacio
              ? `${totalLista} por comprar`
              : `${enCarrito} en el carrito · ${totalLista - enCarrito} por comprar`}
          </span>
        </span>

        {!vacio && <ChevronRightIcon aria-hidden="true" className="w-5 h-5 shrink-0 text-[var(--ink-subtle)]" />}
      </button>

      {/* La falta de precio se dice con un número y se arregla en el mismo
          sitio: el chip abre el primer producto sin precio. */}
      {sinPrecio > 0 && (
        <div className="px-4 pb-4 -mt-1">
          <button
            type="button"
            onClick={onPonerPrecios}
            className="w-full flex items-center justify-between gap-2 rounded-2xl border border-dashed border-brand-300 dark:border-brand-700 bg-[var(--surface)]/70 px-3.5 py-2.5 text-sm font-semibold text-[var(--ink)] transition hover:border-brand-400 active:scale-[0.98]"
          >
            <span className="flex items-center gap-2">
              <span className="grid place-items-center min-w-7 h-7 px-1.5 rounded-full text-white text-xs t-num" style={{ backgroundImage: 'var(--aurora)' }}>
                {sinPrecio}
              </span>
              sin precio
            </span>
            <span className="flex items-center gap-1 text-[var(--accent)]">
              Poner precios
              <ChevronRightIcon aria-hidden="true" className="w-4 h-4" />
            </span>
          </button>
        </div>
      )}
    </div>
  );
});

export default TripBoard;
