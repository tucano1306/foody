import type { MonthTotal } from '@/lib/grocery-insights';
import { fmtMoney } from './finance-ui';

const MONTHS_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function monthLabel(key: string): string {
  const m = Number(key.split('-')[1]);
  return MONTHS_SHORT[m - 1] ?? key;
}

/**
 * «Gasto por mes»: una barra por mes, el último resaltado.
 *
 * Vivía dentro de la tarjeta de comida, y «Fuera del super» no tenía nada
 * parecido. Se saca aquí para que las dos tarjetas enseñen su historia con
 * el MISMO gráfico: dos copias acaban dibujando distinto lo mismo.
 */
export default function HistorialMensual({
  history,
  tope = 0,
}: {
  readonly history: readonly MonthTotal[];
  /** Otra cifra que tiene que caber en la escala (la proyección del mes). */
  readonly tope?: number;
}) {
  if (history.length < 2) return null;
  const maxMonth = Math.max(...history.map((h) => h.total), tope, 1);

  return (
    <div className="mt-4">
      <p className="text-[11px] font-bold text-slate-500 mb-2">Gasto por mes</p>
      {/* Las barras NO se veían. Su altura iba en % contra un padre de
          altura automática —la columna del mes—, y un porcentaje contra
          `auto` no resuelve: quedaban en cero. Ahora el % se mide contra un
          contenedor de altura fija (`h-16`), que sí es una referencia real.

          Y va en `style` con transición CSS, no en un `initial` de framer:
          el dato correcto queda pintado desde el primer fotograma aunque la
          animación no llegue a correr. */}
      <div className="flex items-end gap-1.5">
        {history.map((h, i) => (
          <div key={h.month} className="flex-1 flex flex-col items-center gap-1 min-w-0">
            <div className="flex h-16 w-full items-end">
              <div
                className={`w-full rounded-t-md transition-[height] duration-700 ease-out ${
                  i === history.length - 1 ? 'bg-linear-to-t from-sky-400 to-sky-300' : 'bg-sky-200'
                }`}
                style={{ height: `${Math.max(6, (h.total / maxMonth) * 100)}%` }}
              />
            </div>
            <span className="text-[11px] font-bold text-slate-500 tabular-nums">{fmtMoney(h.total)}</span>
            <span className="text-[11px] text-slate-400 truncate">{monthLabel(h.month)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
