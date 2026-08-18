'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';

export interface CelebrationInput {
  /** El dibujo del momento: un emoji grande, que es toda la ilustración. */
  readonly emoji: string;
  /** Una línea, en voz de quien celebra: «¡Compra hecha!». */
  readonly title: string;
  /** El dato que da orgullo: «12 artículos · $48.20». */
  readonly detail?: string;
  /** Emojis que salen disparados alrededor. Sin esto, solo el dibujo. */
  readonly confetti?: readonly string[];
  /** Cuánto se queda en pantalla. Por defecto, lo justo para leerlo. */
  readonly ms?: number;
}

interface CelebrationCtx {
  readonly celebrate: (input: CelebrationInput) => void;
}

const Ctx = createContext<CelebrationCtx | null>(null);

/**
 * Cuánto se queda en pantalla.
 *
 * Elegido a ojo sobre el resultado real, no calculado: 1,6 s se sentía
 * apresurado —la animación de entrada aún estaba asentándose cuando ya tocaba
 * irse— y a 2,5 s da tiempo a mirarla. Quien tenga prisa la toca y se va.
 */
const DEFAULT_MS = 2500;
/** Lo que tarda en disolverse una vez decidido que se va. */
const FADE_MS = 220;

/**
 * Chispas que salen del centro, detrás del dibujo.
 *
 * Se calculan UNA vez por celebración: si se recalcularan en cada fotograma,
 * las partículas cambiarían de sitio a mitad del vuelo.
 */
function Sparks({ emojis }: { readonly emojis: readonly string[] }) {
  const bits = useMemo(
    () =>
      Array.from({ length: 14 }, (_, i) => ({
        emoji: emojis[i % emojis.length],
        angle: (Math.PI * 2 * i) / 14 + Math.random() * 0.5,
        distance: 110 + Math.random() * 90,
        size: 20 + Math.random() * 16,
        delay: Math.random() * 0.12,
      })),
    [emojis],
  );

  return (
    <>
      {bits.map((b, i) => (
        <motion.span
          key={i}
          aria-hidden="true"
          className="pointer-events-none absolute select-none"
          style={{ fontSize: b.size }}
          initial={{ opacity: 0, x: 0, y: 0, scale: 0.3 }}
          animate={{
            opacity: [0, 1, 1, 0],
            x: Math.cos(b.angle) * b.distance,
            y: Math.sin(b.angle) * b.distance - 30,
            scale: 1,
            rotate: (Math.random() - 0.5) * 220,
          }}
          transition={{ duration: 1.1, delay: b.delay, ease: [0.22, 0.61, 0.36, 1] }}
        >
          {b.emoji}
        </motion.span>
      ))}
    </>
  );
}

function CelebrationOverlay({
  data,
  leaving,
  onTap,
}: {
  readonly data: CelebrationInput;
  readonly leaving: boolean;
  readonly onTap: () => void;
}) {
  const reduced = useReducedMotion() ?? false;

  return (
    <motion.div
      role="status"
      aria-live="polite"
      onClick={onTap}
      initial={{ opacity: 0 }}
      animate={{ opacity: leaving ? 0 : 1 }}
      transition={{ duration: leaving ? FADE_MS / 1000 : 0.18 }}
      // `pointer-events-none` mientras se va: aunque el navegador tardara en
      // quitarla de en medio, jamás puede quedarse capturando toques.
      className={`fixed inset-0 z-[80] flex flex-col items-center justify-center gap-4 bg-slate-900/25 backdrop-blur-[3px] ${
        leaving ? 'pointer-events-none' : ''
      }`}
    >
      <div className="relative flex items-center justify-center">
        {data.confetti && !reduced && <Sparks emojis={data.confetti} />}

        <motion.span
          aria-hidden="true"
          className="select-none text-[7rem] leading-none drop-shadow-2xl"
          initial={reduced ? { opacity: 0 } : { scale: 0.3, opacity: 0, rotate: -12 }}
          animate={reduced ? { opacity: 1 } : { scale: 1, opacity: 1, rotate: 0 }}
          transition={
            reduced ? { duration: 0.2 } : { type: 'spring', stiffness: 300, damping: 14, mass: 0.7 }
          }
        >
          {data.emoji}
        </motion.span>
      </div>

      <motion.div
        className="px-8 text-center"
        initial={reduced ? { opacity: 0 } : { opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: reduced ? 0 : 0.12, duration: 0.28 }}
      >
        <p className="text-2xl font-black text-white drop-shadow-lg">{data.title}</p>
        {data.detail && (
          <p className="mt-1.5 text-sm font-bold text-white/90 drop-shadow">{data.detail}</p>
        )}
      </motion.div>
    </motion.div>
  );
}

/**
 * Celebración a pantalla completa que SE VA SOLA.
 *
 * Es la pieza grande —la que hace que una acción se sienta como un logro— pero
 * sin el peaje de las de las tiendas: no hay botón que cerrar. Aparece, se luce
 * y se disuelve. Quien tenga prisa la toca y se va antes.
 *
 * Cuatro cosas que hace a propósito:
 *
 *  1. El desmontaje lo manda un TEMPORIZADOR, no el final de una animación.
 *     Una capa `fixed inset-0` que se quedara montada porque su animación de
 *     salida no terminó dejaría la app entera capturando toques — ya pasó algo
 *     así con los modales (ver scroll-lock.ts). Aquí el reloj es nuestro.
 *  2. NO bloquea el scroll del fondo. Nada de candados en `body`.
 *  3. NO es un diálogo: es un `role="status"`, así que un lector de pantalla lo
 *     anuncia sin robarle el foco a quien estaba escribiendo.
 *  4. Con «reducir movimiento» activado no rebota ni lanza chispas: aparece y
 *     se va, igual que hace fx.ts.
 */
export function CelebrationProvider({ children }: { readonly children: React.ReactNode }) {
  const [current, setCurrent] = useState<(CelebrationInput & { key: number }) | null>(null);
  const [leaving, setLeaving] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const seq = useRef(0);

  const clearTimers = useCallback(() => {
    for (const t of timers.current) clearTimeout(t);
    timers.current = [];
  }, []);

  const finish = useCallback(() => {
    clearTimers();
    setLeaving(true);
    timers.current.push(
      setTimeout(() => {
        setCurrent(null);
        setLeaving(false);
      }, FADE_MS),
    );
  }, [clearTimers]);

  const celebrate = useCallback(
    (input: CelebrationInput) => {
      clearTimers();
      seq.current += 1;
      // Una a la vez: si llega otra mientras hay una, la nueva SUSTITUYE a la
      // vieja. Encolarlas significaría celebraciones que aparecen tarde, cuando
      // el usuario ya está en otra pantalla haciendo otra cosa.
      setLeaving(false);
      setCurrent({ ...input, key: seq.current });
      timers.current.push(setTimeout(finish, input.ms ?? DEFAULT_MS));
    },
    [clearTimers, finish],
  );

  // Al desmontar el proveedor no puede quedar ningún reloj corriendo.
  useEffect(() => clearTimers, [clearTimers]);

  const value = useMemo(() => ({ celebrate }), [celebrate]);

  return (
    <Ctx.Provider value={value}>
      {children}
      {current && (
        <CelebrationOverlay key={current.key} data={current} leaving={leaving} onTap={finish} />
      )}
    </Ctx.Provider>
  );
}

/**
 * Celebrar desde cualquier sitio.
 *
 * Sin proveedor devuelve una función que no hace nada: una celebración que
 * falta jamás puede tumbar la acción que la disparó.
 */
export function useCelebration(): CelebrationCtx {
  return useContext(Ctx) ?? { celebrate: () => undefined };
}
