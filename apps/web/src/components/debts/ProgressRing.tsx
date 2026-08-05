'use client';

interface Props {
  /** 0–100. */
  readonly value: number;
  readonly color: string;
  readonly size?: number;
  readonly emoji?: string;
  readonly label?: string;
}

/**
 * Anillo de progreso: cuánto del capital original ya está pagado.
 *
 * Se anima al montar para que la tarjeta se sienta viva, y el emoji del centro
 * aguanta el papel de icono sin necesitar un título encima.
 */
export default function ProgressRing({ value, color, size = 56, emoji, label }: Props) {
  const clamped = Math.max(0, Math.min(100, value));
  const stroke = size >= 72 ? 6 : 5;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - clamped / 100);

  return (
    <div
      className="relative shrink-0"
      style={{ width: size, height: size }}
      role="img"
      aria-label={label ?? `${Math.round(clamped)} % pagado`}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#e0f2fe"
          strokeWidth={stroke}
        />
        {/* El avance se pinta con `style` + transición CSS: el anillo muestra el
            valor real desde el primer fotograma y se desliza solo cuando el
            progreso cambia de verdad (tras registrar un abono). */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          className="transition-[stroke-dashoffset] duration-700 ease-out"
          style={{ strokeDashoffset: offset }}
        />
      </svg>
      <span
        className="absolute inset-0 flex items-center justify-center"
        style={{ fontSize: size * 0.4 }}
        aria-hidden="true"
      >
        {emoji}
      </span>
    </div>
  );
}
