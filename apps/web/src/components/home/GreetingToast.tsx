'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';

interface Props {
  readonly firstName: string | null;
}

function getGreeting(h: number): string {
  if (h >= 5 && h < 12) return 'Buenos días';
  if (h >= 12 && h < 19) return 'Buenas tardes';
  return 'Buenas noches';
}

function getGreetingEmoji(h: number): string {
  if (h >= 5 && h < 12) return '🌅';
  if (h >= 12 && h < 19) return '☀️';
  return '🌙';
}

/** One playful phrase per day — feels alive without being random on every visit. */
const DAILY_PHRASES = [
  '¡A darle al día!',
  'Tu despensa te espera',
  'Hoy todo bajo control',
  '¿Listo para el súper?',
  '¡Vamos con todo hoy!',
  'Cada pago al día suma',
  'Pequeños hábitos, gran hogar',
] as const;

function dayOfYear(d: Date): number {
  return Math.floor((d.getTime() - new Date(d.getFullYear(), 0, 0).getTime()) / 86_400_000);
}

/**
 * El saludo, como línea de entrada del título.
 *
 * Antes era un cartel aparte: degradado azul en movimiento perpetuo, una mano
 * que saludaba, cuatro emojis de chispas estallando alrededor y un
 * auto-descarte a los 5 s que colapsaba su propia altura — o sea, la página
 * daba un salto justo cuando ibas a tocar algo. Mucha maquinaria para decir
 * «hola».
 *
 * Ahora es lo que hacen las apps con pantalla de inicio personal: una línea
 * pequeña ENCIMA del titular, que forma parte de la cabecera en vez de
 * competir con ella. Se queda —no desaparece sola— así que no mueve nada, y
 * mantiene la frase del día, que era lo que le daba gracia.
 */
export default function GreetingToast({ firstName }: Props) {
  // Render only after mount: all the content depends on the client clock.
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Reserva la altura de la línea desde el primer pintado: si apareciera de la
  // nada, el título bajaría de golpe al hidratar.
  if (!mounted) return <div className="h-[18px]" aria-hidden="true" />;

  const now = new Date();
  const hour = now.getHours();
  const phrase = DAILY_PHRASES[dayOfYear(now) % DAILY_PHRASES.length];

  return (
    <motion.p
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className="flex items-center gap-1.5 text-[13px] leading-[18px] truncate"
    >
      <span aria-hidden="true">{getGreetingEmoji(hour)}</span>
      <span className="font-semibold text-[var(--ink-muted)]">
        {getGreeting(hour)}
        {firstName ? `, ${firstName}` : ''}
      </span>
      <span className="text-[var(--ink-subtle)] truncate">· {phrase}</span>
    </motion.p>
  );
}
