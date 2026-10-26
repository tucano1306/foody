/**
 * La marca de una tienda en la lista de Compras: su inicial sobre un
 * degradado propio.
 *
 * Cada ticket llevaba el mismo 🏪, así que una lista de Walmart, Publix y
 * Aldi era una columna de casitas iguales y había que leer cada nombre. Con
 * una inicial y un color que siempre es el mismo para la misma tienda, el ojo
 * reconoce «el de Publix» antes de leerlo — como en las apps de banco.
 */

// Pares de la paleta Aurora: variados entre sí, todos de la misma familia.
const DEGRADADOS: readonly (readonly [string, string])[] = [
  ['var(--color-brand-500)', 'var(--color-blue-500)'],
  ['var(--color-sky-400)', 'var(--color-brand-500)'],
  ['var(--color-blue-500)', 'var(--color-sky-400)'],
  ['var(--color-brand-600)', 'var(--color-brand-400)'],
  ['var(--color-sky-500)', 'var(--color-blue-400)'],
  ['var(--color-blue-600)', 'var(--color-brand-400)'],
];

/** El mismo nombre da siempre el mismo color, sin importar mayúsculas ni espacios. */
export function degradadoDeTienda(nombre: string): readonly [string, string] {
  const clave = nombre.trim().toLowerCase();
  let h = 0;
  for (const c of clave) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return DEGRADADOS[h % DEGRADADOS.length];
}

/** «Walmart» → «W»; «Sam's Club» → «SC»; sin nombre → «?». */
export function inicialesDeTienda(nombre: string | null | undefined): string {
  const palabras = (nombre ?? '').trim().split(/\s+/).filter((p) => /[\p{L}\p{N}]/u.test(p));
  if (palabras.length === 0) return '?';
  const letra = (p: string) => (p.match(/[\p{L}\p{N}]/u)?.[0] ?? '').toUpperCase();
  return palabras.length === 1 ? letra(palabras[0]) : letra(palabras[0]) + letra(palabras[1]);
}

export default function StoreMark({ nombre }: { readonly nombre: string | null | undefined }) {
  const [desde, hasta] = degradadoDeTienda(nombre ?? '');
  return (
    <span
      aria-hidden="true"
      className="grid place-items-center w-11 h-11 shrink-0 rounded-2xl text-white font-[family-name:var(--font-display)] font-bold text-[15px] tracking-tight shadow-[var(--shadow-sm)] transition-transform duration-300 group-hover:scale-105 group-active:scale-95"
      style={{ backgroundImage: `linear-gradient(135deg, ${desde}, ${hasta})` }}
    >
      {inicialesDeTienda(nombre)}
    </span>
  );
}
