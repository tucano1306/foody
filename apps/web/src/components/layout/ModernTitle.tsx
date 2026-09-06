import type { ReactNode } from 'react';

interface Props {
  readonly title: string;
  /** Una línea corta, y solo si añade algo. Si explica cómo usar la pantalla,
   *  sobra: eso lo tiene que decir el diseño. */
  readonly subtitle?: string;
  readonly align?: 'left' | 'center';
  readonly onDark?: boolean;
  readonly action?: ReactNode;
}

/**
 * Título de pantalla.
 *
 * Antes: un emoji pegado al texto, el título en tres tamaños por breakpoint, un
 * subtítulo que casi siempre explicaba lo obvio y una barra degradada
 * azul→cian debajo. Esa barra es el tic visual que más envejecía la app —se
 * repetía idéntica en las trece pantallas— y el emoji cambia de dibujo en cada
 * sistema operativo, así que el mismo título se veía distinto en cada teléfono.
 *
 * Ahora es lo que hacen las apps que se sienten actuales: un titular grande,
 * muy apretado de tracking, y nada más. La escala es continua (`clamp`) en vez
 * de saltar de golpe entre breakpoints.
 */
export default function ModernTitle({
  title,
  subtitle,
  align = 'left',
  onDark = false,
  action,
}: Readonly<Props>) {
  const titleCls = onDark ? 'text-white' : '';
  const subtitleCls = onDark ? 'text-white/70' : 'text-[var(--ink-muted)]';
  const alignCls = align === 'center' ? 'items-center text-center' : 'items-start text-left';

  return (
    <div
      className={
        action
          ? 'flex items-start justify-between gap-3 sm:gap-4'
          : `flex flex-col ${alignCls}`
      }
    >
      <div className={action ? `flex flex-col ${alignCls} min-w-0 flex-1` : 'min-w-0'}>
        <h1 className={`t-display ${titleCls}`}>{title}</h1>
        {subtitle && (
          <p className={`mt-1.5 text-sm sm:text-[15px] leading-snug ${subtitleCls}`}>
            {subtitle}
          </p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
