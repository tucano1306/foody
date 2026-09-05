'use client';

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
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 select-none text-slate-400"
      >
        🗂️
      </span>
      <select
        value={value ?? ''}
        onChange={(e) => { haptic(6); onChange(e.target.value || null); }}
        aria-label={label}
        className="w-full cursor-pointer appearance-none rounded-xl border border-sky-200 bg-white py-2.5 pl-9 pr-9 text-sm font-semibold text-slate-800 transition focus:outline-none focus:ring-2 focus:ring-sky-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
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
      <span
        aria-hidden="true"
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 select-none text-slate-400"
      >
        ▾
      </span>
    </div>
  );
}
