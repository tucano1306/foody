import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Un guardian, no una prueba de comportamiento.
 *
 * Cuando entro `trip_kind_amounts` --la vista que descuenta de un ticket las
 * partes repartidas a otro tipo de gasto-- lo escribi en su propio commit:
 * «sin ella, cada sitio que agrega gasto tendria que acordarse de descontar los
 * repartos, y el primero que lo olvide cuenta de mas».
 *
 * Lo escribi y luego lo olvide en CUATRO sitios. Los cuatro los encontro el
 * usuario, no yo, mirando dos pantallas que decian cifras distintas del mismo
 * mes:
 *
 *   - el desglose de gasto por tipo   (#128)  «$0 en 0 gastos» sobre $21.94
 *   - la pagina /stats                (#132)  septiembre $51.16 vs $29.22
 *   - /api/stats                      (#132)
 *   - la ruta de voz                  (#132)  contestaba $51.16 hablando
 *
 * Un comentario no impide eso; esta prueba si. Sumar `total_spent` es sumar el
 * ticket ENTERO, y eso solo es correcto dentro de la definicion de la vista.
 * En cualquier otro sitio se suma `amount` de `trip_kind_amounts`.
 */

/** Donde SI se puede sumar total_spent: la vista se define sobre la tabla. */
const PERMITIDOS = ['lib\ensure-schema.ts', 'lib/ensure-schema.ts'];

function fuentes(dir: string, out: string[] = []): string[] {
  for (const nombre of readdirSync(dir)) {
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) fuentes(ruta, out);
    else if (/\.tsx?$/.test(nombre) && !/\.test\.tsx?$/.test(nombre)) out.push(ruta);
  }
  return out;
}

/** `SUM(total_spent)`, `SUM(COALESCE(total_spent, 0))`, `SUM(t.total_spent)`… */
const AGREGA = /SUM\s*\(\s*[^)]*total_spent/i;

describe('el gasto del super se suma en UN solo sitio', () => {
  it('nadie agrega total_spent fuera de la definicion de la vista', () => {
    const culpables = fuentes(join(process.cwd(), 'src'))
      .filter((f) => !PERMITIDOS.some((p) => f.endsWith(p)))
      .filter((f) => AGREGA.test(readFileSync(f, 'utf8')))
      .map((f) => f.slice(f.indexOf('src')));

    expect(culpables, [
      'Sumar total_spent cuenta el ticket ENTERO e ignora las partes',
      'repartidas a otro tipo de gasto. Usa la vista:',
      '',
      "  SELECT ... SUM(amount) FROM trip_kind_amounts WHERE kind = 'grocery'",
      '',
      'Ver ensureTripSplitsSchema en lib/ensure-schema.ts.',
    ].join('\n')).toEqual([]);
  });

  it('el guardian detecta de verdad, no pasa por vacio', () => {
    // Sin esto, un fallo del recorrido de ficheros dejaria la prueba en verde
    // para siempre y el guardian seria decorativo.
    expect(AGREGA.test('SUM(total_spent) AS total')).toBe(true);
    expect(AGREGA.test('SUM(COALESCE(total_spent, 0)) AS total')).toBe(true);
    expect(AGREGA.test('SUM(t.total_spent)')).toBe(true);
    expect(AGREGA.test('SUM(amount)')).toBe(false);
    expect(fuentes(join(process.cwd(), 'src')).length).toBeGreaterThan(100);
  });
});
