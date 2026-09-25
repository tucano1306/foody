import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

function producto(precio: number | null, extra: Partial<Product> = {}): Product {
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
    ...extra,
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

/**
 * «El precio se ve muy apretado en el celular». En la rejilla de tres de Casa
 * la tarjeta deja ~80px útiles, y «Última $13.12» los ocupaba de borde a borde;
 * debajo, «hace 2 meses · Publix» salía cortado en «hace 2 mese…».
 *
 * jsdom no mide, así que esto fija la estructura que lo evita. Que de verdad
 * cabe se comprobó en el navegador a 375px (ver el PR).
 */
describe('ProductCard — el precio cabe en la tarjeta estrecha', () => {
  it('la tarjeta mide contra SU ancho, no el de la pantalla', () => {
    render(<ProductCard product={producto(13.12)} compact />);
    expect(screen.getByText('$13.12').closest('.stat-box')).not.toBeNull();
  });

  it('el precio no se corta: si no cabe, encoge', () => {
    render(<ProductCard product={producto(13.12)} compact />);
    const precio = screen.getByText('$13.12');
    expect(precio.className).toContain('stat-amount');
    expect(precio.style.getPropertyValue('--stat-chars')).not.toBe('');
    expect(precio.closest('.truncate')).toBeNull();
  });

  it('en la tarjeta estrecha «Última» va encima del precio', () => {
    render(<ProductCard product={producto(13.12)} compact />);
    // Ocupa la línea entera salvo que la tarjeta tenga sitio de sobra.
    const etiqueta = screen.getByText('Última');
    expect(etiqueta.className.split(/\s+/)).toContain('w-full');
    expect(etiqueta.className).toContain('@min-[8rem]:w-auto');
  });

  describe('cuándo fue', () => {
    // 12:00 del 25 de septiembre de 2026 en Miami.
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date('2026-09-25T16:00:00.000Z'));
    });
    afterEach(() => vi.useRealTimers());

    it('dice la fecha, no «hace 2 meses», que no cabía', () => {
      render(
        <ProductCard
          product={producto(13.12)}
          lastPurchase={{ purchasedAt: '2026-07-20T15:00:00.000Z', storeName: 'Publix' }}
        />,
      );
      expect(screen.getByText(/^20\W+jul/i)).toBeInTheDocument();
      expect(screen.queryByText(/hace/)).not.toBeInTheDocument();
    });

    it('la tienda solo sale si la tarjeta tiene sitio', () => {
      render(
        <ProductCard
          product={producto(13.12)}
          lastPurchase={{ purchasedAt: '2026-07-20T15:00:00.000Z', storeName: 'Publix' }}
        />,
      );
      const tienda = screen.getByText(/Publix/);
      expect(tienda.className.split(/\s+/)).toContain('hidden');
      expect(tienda.className).toContain('@min-[8rem]:inline');
    });

    it('lo de hace un rato es «hoy», no «hace menos de 1 h», que salía cortado', () => {
      render(
        <ProductCard
          product={producto(13.12)}
          lastPurchase={{ purchasedAt: '2026-09-25T15:50:00.000Z', storeName: null }}
        />,
      );
      expect(screen.getByText('hoy')).toBeInTheDocument();
    });
  });

  it('el total gastado no queda dentro de un recorte', () => {
    render(<ProductCard product={producto(null, { totalSpent: 1234.56, lastPurchaseDate: null })} />);
    const total = screen.getByText('$1,234.56');
    expect(total.closest('.truncate')).toBeNull();
    expect(total.className).toContain('whitespace-nowrap');
  });
});
