'use client';

import { ChevronDownIcon } from '@heroicons/react/24/solid';
import { categoryEmoji } from '@/lib/categories';
import { haptic } from '@/lib/haptic';

interface Props {
  /** Las categorías a ofrecer, ya ordenadas por pasillo. */
  readonly categories: readonly string[];
  /** Cuántos productos hay en cada una. Ausente = no se enseña número. */
  readonly counts?: ReadonlyMap<string, number>;
  /** Total para la opción «Todas». */
  readonly total?: number;
  /** Categoría elegida, o `null` / `''` para todas. */
  readonly value: string | null;
  readonly onChange: (category: string | null) => void;
  readonly label?: string;
  readonly className?: string;
}

/**
 * Elegir categoría de una lista desplegable.
 *
 * Antes esto era una fila de chips que se desplazaba en horizontal. El
 * problema no era que faltaran categorías —estaban todas— sino que solo se
 * veían cinco: el resto quedaba fuera de pantalla, detrás de un difuminado que
 * es fácil no registrar. Con 17 categorías, «todas» y «las cinco primeras» se
 * ven exactamente igual, y desde el teclado o un lector de pantalla había que
 * recorrer diecisiete botones para llegar al filtro.
 *
 * Un desplegable las enseña todas de una vez, ocupa una línea en vez de una
 * fila entera, y es el control nativo que el móvil ya sabe presentar a pantalla
 * completa.
 *
 * Los números van dentro de cada opción: son lo que convierte la lista en una
 * decisión —«Lácteos 8»— en vez de un menú a ciegas.
 */
export default function CategorySelect({
  categories,
  counts,
  total,
  value,
  onChange,
  label = 'Filtrar por categoría',
  className = '',
}: Props) {
  const etiqueta = (cat: string) => {
    const n = counts?.get(cat);
    return n === undefined ? `${categoryEmoji(cat)} ${cat}` : `${categoryEmoji(cat)} ${cat} · ${n}`;
  };

  return (
    <div className={`relative ${className}`}>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 select-none"
      >
        🗂️
      </span>
      <select
        value={value ?? ''}
        onChange={(e) => { haptic(6); onChange(e.target.value || null); }}
        aria-label={label}
        /* 16 px en el texto: por debajo de eso, Safari en iOS hace zoom al
           abrir el desplegable y saca media pantalla de sitio. */
        className="h-12 w-full cursor-pointer appearance-none rounded-2xl border border-[var(--line)] bg-[var(--surface)] pl-10 pr-10 text-base font-semibold text-[var(--ink)] shadow-[var(--shadow-xs)] transition focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/25"
      >
        <option value="">
          {total === undefined ? 'Todas las categorías' : `Todas las categorías · ${total}`}
        </option>
        {categories.map((cat) => (
          <option key={cat} value={cat}>
            {etiqueta(cat)}
          </option>
        ))}
      </select>
      {/* El «▾» era un carácter de texto: cambia de forma con la fuente del
          sistema y en Android se veía como un triángulo relleno distinto al de
          los demás desplegables de la app. */}
      <ChevronDownIcon
        aria-hidden="true"
        className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--ink-subtle)]"
      />
    </div>
  );
}
