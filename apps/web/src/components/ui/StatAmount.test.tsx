import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import StatAmount, { anchoEnDigitos } from './StatAmount';

/**
 * Dos cosas a la vez: que la medida sea razonable, y un guardián para que
 * `break-all` no vuelva a colarse sobre un importe.
 *
 * El fallo que da origen a esto se veía en Compras: el total, «$720.73», salía
 * partido en dos líneas dentro de su tarjeta —«$720.7» arriba y «3» abajo—.
 * `break-all` parte por donde sea, y en un número «por donde sea» es entre dos
 * cifras. Un importe cortado a la mitad no es un importe: es otro número.
 */

describe('anchoEnDigitos', () => {
  it('cuenta cada cifra como un dígito', () => {
    expect(anchoEnDigitos('12345')).toBe(5);
  });

  it('pesa menos los caracteres estrechos que un dígito', () => {
    // «$720.73»: seis anchos + un punto.
    expect(anchoEnDigitos('$720.73')).toBeCloseTo(6.45);
    // El punto y la coma juntos no llegan a un dígito.
    expect(anchoEnDigitos('$1,234.56')).toBeCloseTo(7.9);
  });

  it('nunca baja de tres, para que la cuenta siga significando algo', () => {
    expect(anchoEnDigitos('$5')).toBe(3);
    expect(anchoEnDigitos('')).toBe(3);
  });

  it('crece con el importe: más dinero, letra más pequeña', () => {
    expect(anchoEnDigitos('$48.05')).toBeLessThan(anchoEnDigitos('$720.73'));
    expect(anchoEnDigitos('$720.73')).toBeLessThan(anchoEnDigitos('$12,345.67'));
  });
});

describe('<StatAmount>', () => {
  it('publica la medida para que el CSS calcule el tamaño', () => {
    const { container } = render(<StatAmount value="$720.73" />);
    const p = container.querySelector('p');
    expect(p).not.toBeNull();
    expect(p!.className).toContain('stat-amount');
    expect(p!.style.getPropertyValue('--stat-chars')).toBe('6.45');
  });

  it('respeta las clases del sitio donde se usa', () => {
    const { container } = render(<StatAmount value="$1" className="text-black mt-1" />);
    const p = container.querySelector('p')!;
    expect(p.className).toContain('stat-amount');
    expect(p.className).toContain('text-black');
    expect(p.className).toContain('mt-1');
  });

  it('deja pasar un adorno detrás sin que cuente para la medida', () => {
    const { container } = render(
      <StatAmount value="$720.73">
        <span>*</span>
      </StatAmount>,
    );
    expect(screen.getByText('*')).toBeTruthy();
    // La medida sigue siendo la del importe, no la del importe más el asterisco.
    expect(container.querySelector('p')!.style.getPropertyValue('--stat-chars')).toBe('6.45');
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

/** En una clase de Tailwind, no dentro de un comentario que lo explique. */
const CLASE_BREAK_ALL = /className=(?:"[^"]*|\{`[^`]*|\{'[^']*)\bbreak-all\b/;

describe('nadie vuelve a partir un número por la mitad', () => {
  it('ningún componente usa break-all', () => {
    const raiz = join(__dirname, '..', '..');
    const culpables = fuentes(raiz).filter((f) => CLASE_BREAK_ALL.test(readFileSync(f, 'utf8')));

    expect(
      culpables,
      'break-all parte por donde sea, y en un importe eso es entre dos cifras ' +
        '(«$720.73» → «$720.7» / «3»). Para un número usa <StatAmount>: no ' +
        'parte, encoge. Para un texto largo, break-words.',
    ).toEqual([]);
  });
});
