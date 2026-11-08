import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PrimaryAction from './PrimaryAction';

/**
 * «El botón tapa el nombre del producto» / «aquí también tapa el monto».
 *
 * El botón flotante se pinta encima de lo último de la lista. La página tiene
 * que reservar al final lo que él ocupa, y SOLO donde él aparece: en las
 * demás pantallas un hueco de más sería espacio muerto.
 */

let ruta = '/products';
vi.mock('next/navigation', () => ({ usePathname: () => ruta }));

const hueco = () => document.querySelector<HTMLElement>('[data-hueco-accion]');

/** Pasa las medidas del estilo a píxeles, con 1rem = 16px. */
function px(valor: string): number {
  const m = /^calc\((.*)\)$/.exec(valor.trim());
  const expr = (m ? m[1] : valor).replace(/var\(--tabbar-h\)/g, '0');
  return expr
    .split('+')
    .map((t) => t.trim())
    .filter(Boolean)
    .reduce((s, t) => s + (t.endsWith('rem') ? Number.parseFloat(t) * 16 : Number.parseFloat(t)), 0);
}

beforeEach(() => {
  ruta = '/products';
});

describe('PrimaryAction — el botón flotante no tapa lo último de la lista', () => {
  it.each([
    ['/products', 'Producto'],
    ['/payments', 'Pago'],
    ['/shopping-trips', 'Compra'],
  ])('en %s pinta el botón y reserva su hueco al final', (r, etiqueta) => {
    ruta = r;
    render(<PrimaryAction />);
    expect(screen.getByRole('link', { name: etiqueta })).toBeInTheDocument();
    expect(hueco()).not.toBeNull();
    expect(hueco()).toHaveAttribute('aria-hidden', 'true');
    // Solo en móvil, como el botón.
    expect(hueco()).toHaveClass('md:hidden');
  });

  it('el hueco mide al menos lo que el botón ocupa sobre la barra de pestañas', () => {
    render(<PrimaryAction />);
    const enlace = screen.getByRole('link', { name: 'Producto' });
    const flotante = enlace.parentElement as HTMLElement;
    const ocupaSobreLaBarra = px(flotante.style.bottom) + px(enlace.style.height);
    expect(ocupaSobreLaBarra).toBe(68);
    expect(px((hueco() as HTMLElement).style.height)).toBeGreaterThanOrEqual(ocupaSobreLaBarra);
  });

  it.each(['/products/new', '/payments/abc', '/home', '/debts'])('en %s no hay botón ni hueco', (r) => {
    ruta = r;
    render(<PrimaryAction />);
    expect(screen.queryByRole('link')).toBeNull();
    expect(hueco()).toBeNull();
  });
});
