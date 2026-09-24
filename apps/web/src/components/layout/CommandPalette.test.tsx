import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { PaletteProduct } from '@/lib/api';
import CommandPalette from './CommandPalette';
import { openCommandPalette } from './command-palette-bus';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

/**
 * El buscador de la cabecera tenía un tope de 50 productos por orden
 * alfabético —en la consulta y otra vez en el componente—. Con 100 en la
 * despensa, todo lo que iba después de «Marketside Bacon Caesar» no existía
 * para él: el usuario agregaba «Remolachas», la buscaba y no salía.
 */

beforeAll(() => {
  // jsdom no pinta la capa superior del navegador; basta con que no reviente.
  HTMLDialogElement.prototype.showModal ??= function showModal(this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close ??= function close(this: HTMLDialogElement) {
    this.removeAttribute('open');
  };
});

/** Cien productos con nombres que ordenan: «Producto 001» … «Producto 100». */
const CIEN: PaletteProduct[] = Array.from({ length: 100 }, (_, i) => ({
  id: `p${i + 1}`,
  name: `Producto ${String(i + 1).padStart(3, '0')}`,
  category: 'Otro',
}));

function abrirYBuscar(texto: string) {
  act(() => openCommandPalette());
  fireEvent.change(screen.getByPlaceholderText('Busca un producto o una sección'), {
    target: { value: texto },
  });
}

describe('CommandPalette — encuentra toda la despensa', () => {
  it('encuentra un producto que va más allá del puesto 50', () => {
    render(<CommandPalette products={[...CIEN, { id: 'r', name: 'Remolachas', category: 'Frutas y Verduras' }]} />);
    abrirYBuscar('remolachas');
    expect(screen.getByText('Remolachas')).toBeInTheDocument();
  });

  it('encuentra el último de cien', () => {
    render(<CommandPalette products={CIEN} />);
    abrirYBuscar('Producto 100');
    expect(screen.getByText('Producto 100')).toBeInTheDocument();
  });

  it('busca sin acentos, como el resto de la app', () => {
    render(<CommandPalette products={[{ id: 'l', name: 'Limón', category: 'Frutas y Verduras' }]} />);
    abrirYBuscar('limon');
    expect(screen.getByText('Limón')).toBeInTheDocument();
  });

  it('busca por palabras sueltas, en cualquier orden', () => {
    render(<CommandPalette products={[{ id: 'q', name: 'Queso blanco Venezolano', category: 'Lácteos' }]} />);
    abrirYBuscar('venezolano queso');
    expect(screen.getByText('Queso blanco Venezolano')).toBeInTheDocument();
  });
});
