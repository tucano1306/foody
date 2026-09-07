import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { EMPTY_GROCERY_INSIGHT, type GroceryInsight } from '@/lib/grocery-insights';
import GroceryCategoryBreakdown from './GroceryCategoryBreakdown';

/**
 * El desglose se movió del Plan financiero a Estadísticas, y `/stats` tenía ya
 * una versión propia y peor. Estas pruebas cuidan lo que se perdía en la copia.
 */

const insight = (extra: Partial<GroceryInsight>): GroceryInsight => ({
  ...EMPTY_GROCERY_INSIGHT,
  spentThisMonth: 176.94,
  ...extra,
});

const cat = (category: string, currentMonth: number, share: number) => ({
  category,
  currentMonth,
  prevMonth: 0,
  deltaPct: null,
  share,
});

describe('<GroceryCategoryBreakdown>', () => {
  it('enseña la parte que ningún producto explica, y la explica', () => {
    // El caso real: $49.90 en productos de un mes de $176.94. Sin esta fila el
    // usuario ve una lista que no suma su mes y nada le dice por qué.
    render(
      <GroceryCategoryBreakdown
        groceries={insight({
          categories: [cat('Pasta', 15.45, 9)],
          unitemized: cat('Sin detallar', 127.04, 72),
        })}
        onChanged={() => {}}
      />,
    );

    expect(screen.getByText('$127.04')).toBeTruthy();
    expect(screen.getByText('tickets sin productos')).toBeTruthy();
  });

  it('pone «Sin detallar» al final, después de las categorías', () => {
    render(
      <GroceryCategoryBreakdown
        groceries={insight({
          categories: [cat('Pasta', 15.45, 9), cat('Lácteos', 6.89, 4)],
          unitemized: cat('Sin detallar', 127.04, 72),
        })}
        onChanged={() => {}}
      />,
    );

    const filas = screen.getAllByRole('button').map((b) => b.textContent ?? '');
    expect(filas).toHaveLength(3);
    expect(filas[filas.length - 1]).toContain('Sin detallar');
  });

  it('cada fila se puede abrir', () => {
    render(
      <GroceryCategoryBreakdown
        groceries={insight({ categories: [cat('Pasta', 15.45, 100)], unitemized: null })}
        onChanged={() => {}}
      />,
    );
    expect(screen.getByRole('button').textContent).toContain('Pasta');
  });

  it('sin nada que enseñar no deja una tarjeta vacía', () => {
    const { container } = render(
      <GroceryCategoryBreakdown groceries={EMPTY_GROCERY_INSIGHT} onChanged={() => {}} />,
    );
    expect(container.innerHTML).toBe('');
  });
});

/* ─── Guardián ──────────────────────────────────────────────────────────── */

function fuentes(dir: string, out: string[] = []): string[] {
  for (const nombre of readdirSync(dir)) {
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) fuentes(ruta, out);
    else if (/\.tsx?$/.test(nombre) && !/\.test\.tsx?$/.test(nombre)) out.push(ruta);
  }
  return out;
}

/** Agrupar el gasto del mes por categoría de producto. */
const AGRUPA_POR_CATEGORIA = /GROUP BY.*p\.category/i;

describe('el desglose por categoría se calcula en un solo sitio', () => {
  it('nadie más agrupa el gasto del mes por categoría', () => {
    const raiz = join(__dirname, '..', '..');
    const culpables = fuentes(raiz)
      .filter((f) => AGRUPA_POR_CATEGORIA.test(readFileSync(f, 'utf8')))
      .map((f) => f.slice(raiz.length + 1).replace(/\\/g, '/'));

    expect(
      culpables,
      'El Plan financiero y /stats tenían cada uno su consulta y derivaron: la ' +
        'de /stats no traía el arreglo de las categorías en cadena vacía ni la ' +
        'fila de «Sin detallar», así que enseñaba $49.90 de un mes de $176.94. ' +
        'Usa loadGroceryInsight() de lib/finance-data.ts.',
    ).toEqual(['lib/finance-data.ts']);
  });
});
