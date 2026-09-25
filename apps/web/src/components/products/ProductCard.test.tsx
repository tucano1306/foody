import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Product } from '@foody/types';
import ProductCard from './ProductCard';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

/**
 * «Veo algunos productos con precio debajo de la foto y otros no: ¿eso qué
 * quiere decir, la última compra?». Iba el número solo, y en la rejilla densa
 * de Casa —donde se esconde «hace 3 días · Publix»— no había forma de saberlo.
 */

function producto(precio: number | null): Product {
  return {
    id: 'p1',
    name: 'Cotufas',
    description: null,
    category: 'Snacks y Dulces',
    currentQuantity: 1,
    minQuantity: 1,
    unit: 'unidades',
    isRunningLow: false,
    needsShopping: false,
    stockLevel: 'full',
    userId: 'u1',
    lastPurchasePrice: precio,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
  } as Product;
}

describe('ProductCard — el precio de la última compra', () => {
  it('dice qué es: la última vez que se pagó', () => {
    render(<ProductCard product={producto(7.19)} compact />);
    expect(screen.getByText('Última')).toBeInTheDocument();
    expect(screen.getByText('$7.19')).toBeInTheDocument();
    expect(screen.getByLabelText('La última vez pagaste $7.19')).toBeInTheDocument();
  });

  it('sin compras con precio, no inventa ninguno', () => {
    render(<ProductCard product={producto(null)} compact />);
    expect(screen.queryByText('Última')).not.toBeInTheDocument();
  });
});
