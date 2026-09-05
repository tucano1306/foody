import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Product } from '@foody/types';
import ProductsBrowser from './ProductsBrowser';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

/**
 * La paginacion partia los resultados de doce en doce, y en Casa se pintaba
 * INCLUSO con la rejilla oculta: «Pagina 1 de 8» debajo de una lista vacia,
 * paginando algo que no se veia. Ademas la vista por categorias nunca pagino,
 * asi que las dos vistas de la misma pantalla contaban cosas distintas.
 */
function producto(i: number): Product {
  return {
    id: `p${i}`,
    name: `Producto ${i}`,
    description: null,
    category: i % 2 === 0 ? 'Lácteos' : 'Frutas y Verduras',
    currentQuantity: 1,
    minQuantity: 1,
    unit: 'unidad',
    isRunningLow: false,
    needsShopping: false,
    stockLevel: 'full',
    userId: 'u1',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  } as Product;
}

const VEINTE = Array.from({ length: 20 }, (_, i) => producto(i + 1));

describe('ProductsBrowser — sin paginacion', () => {
  it('no queda ni rastro del pager', () => {
    render(<ProductsBrowser products={VEINTE} />);
    expect(screen.queryByText(/Página \d+ de \d+/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Anterior/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Siguiente/ })).not.toBeInTheDocument();
  });

  it('en Casa, sin buscar nada, no anuncia paginas de una lista vacia', () => {
    render(<ProductsBrowser products={VEINTE} searchOnly compact />);
    expect(screen.queryByText(/Página/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Producto 1$/)).not.toBeInTheDocument();
  });

  it('al filtrar salen TODOS los que coinciden, no los primeros doce', () => {
    // Diez «Lácteos» de veinte: con el pager solo se veian los que cabian en
    // la pagina, y el resto exigia dos clics para descubrir que estaban.
    render(<ProductsBrowser products={VEINTE} searchOnly compact />);
    fireEvent.change(screen.getByLabelText('Filtrar por categoría'), {
      target: { value: 'Lácteos' },
    });
    expect(screen.getByText('10 productos')).toBeInTheDocument();
  });

  it('la cuenta se dice en productos, no en un rango de pagina', () => {
    render(<ProductsBrowser products={VEINTE} searchOnly compact />);
    fireEvent.change(screen.getByLabelText('Filtrar por categoría'), {
      target: { value: 'Lácteos' },
    });
    expect(screen.queryByText(/Mostrando/)).not.toBeInTheDocument();
  });
});
