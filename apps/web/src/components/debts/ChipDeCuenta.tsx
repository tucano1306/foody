import type { DebtKind } from '@/lib/debt-engine';
import { KIND_META } from './debt-ui';

interface Props {
  /** Los últimos cuatro dígitos; sin ellos el plástico lleva puntos. */
  readonly ultimos: string | null;
  /**
   * Una tarjeta (o una de tienda) se pinta como plástico; un préstamo, un
   * auto o una hipoteca, con su emoji. Sin tipo conocido, plástico: en las
   * listas donde aparece este sello casi todo son tarjetas.
   */
  readonly kind?: DebtKind | null;
}

const CON_PLASTICO: ReadonlySet<DebtKind> = new Set(['credit_card', 'store']);

/**
 * El sello de cada cuenta: un plástico en miniatura con sus últimos dígitos.
 *
 * Existe porque en el Plan y en Deudas las tarjetas se confundían entre sí y
 * con sus propios tramos: todo eran cajas del mismo tono con un nombre y un
 * importe. Ahora solo la CABECERA de una cuenta lleva sello —los tramos no—,
 * y los cuatro dígitos, que es como uno reconoce su tarjeta en la cartera,
 * quedan a la vista antes que el nombre.
 *
 * Es decorativo (`aria-hidden`): el título de al lado ya dice el emisor y los
 * dígitos, y un lector de pantalla no tiene por qué oírlos dos veces.
 */
export default function ChipDeCuenta({ ultimos, kind = null }: Props) {
  if (kind && !CON_PLASTICO.has(kind)) {
    return (
      <span
        aria-hidden="true"
        className="surface-2 grid h-[30px] w-12 shrink-0 place-items-center rounded-lg text-lg leading-none"
      >
        {KIND_META[kind]?.emoji ?? '📄'}
      </span>
    );
  }
  return (
    <span
      aria-hidden="true"
      data-chip-cuenta={ultimos ?? ''}
      className="relative h-[30px] w-12 shrink-0 overflow-hidden rounded-lg shadow-sm"
      // El mismo barrido índigo en claro y en oscuro, siempre con letra
      // blanca: es la firma de la app, y así el plástico se ve igual en las
      // dos pantallas y en los dos temas.
      style={{ backgroundImage: 'var(--aurora)' }}
    >
      {/* El chip dorado: lo que hace que un rectángulo se lea «tarjeta». */}
      <span className="absolute left-1.5 top-1.5 h-2 w-2.5 rounded-[3px] bg-amber-200/90" />
      <span className="absolute bottom-1 right-1.5 text-[10px] font-bold leading-none tracking-wide text-white tabular-nums">
        {ultimos ?? '•••'}
      </span>
    </span>
  );
}
