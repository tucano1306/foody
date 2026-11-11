import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * En oscuro, `text-slate-700` y compañía pasan a letra clara (globals.css),
 * pero un fondo tintado claro solo se oscurece si tiene SU línea
 * `html.dark .<clase>`. Y `bg-sky-100/80` no es la misma clase que
 * `bg-sky-100`: cada opacidad necesita la suya.
 *
 * Esto se rompió dos veces en el consejero financiero: las tarjetas se
 * quedaban en lavanda claro con la letra ya pasada a blanca, ilegibles. La
 * segunda, con los tonos «crítico» (/80) y «aviso» (/90), cuando la primera
 * corrección ya había cubierto los demás.
 *
 * La regla: todo tinte claro (50–200 de sky, blue, brand y slate) que se use
 * en la app tiene línea en globals.css, o lleva su propio `dark:bg-…` al lado,
 * en la misma línea.
 */

const SRC = join(__dirname, '..');
const CSS = readFileSync(join(__dirname, 'globals.css'), 'utf8');

// Sin variante delante (`hover:`, `dark:`) ni arbitrario (`[`): esos los
// resuelve quien los escribe.
const TINTE_CLARO = /(?<![\w:/[-])bg-(?:sky|blue|brand|slate)-(?:50|100|200)(?:\/\d+)?(?![\w/-])/g;

function fuentes(dir: string, out: string[] = []): string[] {
  for (const nombre of readdirSync(dir)) {
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) fuentes(ruta, out);
    else if (/\.tsx?$/.test(nombre) && !/\.test\.tsx?$/.test(nombre)) out.push(ruta);
  }
  return out;
}

function tieneLineaOscura(clase: string): boolean {
  const selector = `html.dark .${clase.replace('/', '\\/')}`;
  // Que no valga `.bg-sky-100` por estar `.bg-sky-100\/80`, ni al revés.
  const escapado = selector.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
  return new RegExp(`${escapado}(?![\\w\\\\/-])`).test(CSS);
}

describe('tintes claros en modo oscuro', () => {
  it('el detector de líneas distingue cada opacidad', () => {
    expect(tieneLineaOscura('bg-sky-100')).toBe(true);
    expect(tieneLineaOscura('bg-sky-100/80')).toBe(true);
    expect(tieneLineaOscura('bg-sky-100/33')).toBe(false);
  });

  it('cada tinte claro que usa la app se oscurece', () => {
    const sinLinea: string[] = [];
    let vistos = 0;
    for (const archivo of fuentes(SRC)) {
      const lineas = readFileSync(archivo, 'utf8').split('\n');
      lineas.forEach((linea, i) => {
        for (const [clase] of linea.matchAll(TINTE_CLARO)) {
          vistos++;
          if (tieneLineaOscura(clase) || linea.includes('dark:bg-')) continue;
          sinLinea.push(`${clase} — ${relative(SRC, archivo)}:${i + 1}`);
        }
      });
    }
    // Si el patrón dejara de encontrar nada, la prueba pasaría sin mirar.
    expect(vistos).toBeGreaterThan(20);
    expect(sinLinea).toEqual([]);
  });

  it('las franjas de color no se pierden bajo el borde oscuro', () => {
    // `html.dark .border-sky-200` cambia `border-color`, que incluye el lado
    // con franja. Una franja de sky/blue/slate sin su propia línea sale gris.
    const FRANJA = /(?<![\w:/[-])border-[lrtb]-(?:sky|blue|slate)-\d+(?![\w/-])/g;
    const sinLinea = new Set<string>();
    for (const archivo of fuentes(SRC)) {
      for (const [clase] of readFileSync(archivo, 'utf8').matchAll(FRANJA)) {
        if (!tieneLineaOscura(clase)) sinLinea.add(clase);
      }
    }
    expect([...sinLinea]).toEqual([]);
  });

  it('las tarjetas del consejero, una por una', () => {
    for (const clase of ['bg-sky-100/80', 'bg-sky-50/90', 'bg-sky-50/70', 'bg-blue-50/70', 'bg-sky-50/60']) {
      expect(tieneLineaOscura(clase), clase).toBe(true);
    }
  });
});
