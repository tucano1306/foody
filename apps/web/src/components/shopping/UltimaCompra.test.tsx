import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ShoppingTrip } from '@foody/types';
import UltimaCompra from './UltimaCompra';

function trip(over: Partial<ShoppingTrip> = {}): ShoppingTrip {
  return {
    id: 't1',
    storeId: null,
    storeName: 'Walmart',
    purchasedAt: '2026-10-21T20:00:00.000Z',
    totalAmount: 111.4,
    currency: 'USD',
    allocationStrategy: 'equal',
    receiptPhotoUrl: null,
    notes: null,
    kind: 'grocery',
    businessShare: 0,
    userId: 'u',
    createdAt: '2026-10-21T20:00:00.000Z',
    updatedAt: '2026-10-21T20:00:00.000Z',
    ...over,
  };
}

const AHORA = new Date('2026-10-26T15:00:00.000Z');

/**
 * La cabecera del Modo Supermercado era «el súper con más visitas»: una
 * estadística. Ahora es lo de la última vez, y lleva al ticket.
 */
describe('UltimaCompra', () => {
  it('dónde, cuándo, cuánto y cuántos productos', () => {
    render(<UltimaCompra trip={trip()} items={12} ahora={AHORA} />);
    expect(screen.getByText('Última compra · 21 oct')).toBeInTheDocument();
    expect(screen.getByText('Walmart')).toBeInTheDocument();
    expect(screen.getByText('$111.40')).toBeInTheDocument();
    expect(screen.getByText('12 productos')).toBeInTheDocument();
  });

  it('tocarla abre ese ticket', () => {
    render(<UltimaCompra trip={trip()} items={12} ahora={AHORA} />);
    expect(screen.getByRole('link', { name: /Última compra: Walmart/ })).toHaveAttribute('href', '/shopping-trips/t1');
  });

  it('una compra de ayer dice «ayer»', () => {
    render(<UltimaCompra trip={trip({ purchasedAt: '2026-10-25T18:00:00.000Z' })} items={3} ahora={AHORA} />);
    expect(screen.getByText('Última compra · ayer')).toBeInTheDocument();
  });

  it('un ticket sin productos detallados no dice «0 productos»', () => {
    render(<UltimaCompra trip={trip()} items={0} ahora={AHORA} />);
    expect(screen.queryByText(/productos?$/)).toBeNull();
  });

  it('sin tienda se nombra como tal, con su monograma', () => {
    render(<UltimaCompra trip={trip({ storeName: null })} items={1} ahora={AHORA} />);
    expect(screen.getByText('Sin tienda')).toBeInTheDocument();
    expect(screen.getByText('?')).toBeInTheDocument();
  });
});
