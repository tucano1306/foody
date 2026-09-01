import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ShoppingTrip } from '@foody/types';
import TripsScopedList from './TripsScopedList';

function trip(over: { id: string; store: string; total: number; businessShare: number }): ShoppingTrip {
  return {
    id: over.id,
    storeId: null,
    storeName: over.store,
    purchasedAt: '2026-08-10T12:00:00.000Z',
    totalAmount: over.total,
    currency: 'USD',
    allocationStrategy: 'equal',
    receiptPhotoUrl: null,
    notes: null,
    kind: 'grocery',
    businessShare: over.businessShare,
    userId: 'user-1',
    createdAt: '2026-08-10T12:00:00.000Z',
    updatedAt: '2026-08-10T12:00:00.000Z',
  };
}

const TICKETS = [
  trip({ id: 't1', store: 'Walmart', total: 100, businessShare: 0 }),
  trip({ id: 't2', store: 'Proveedor', total: 400, businessShare: 100 }),
  trip({ id: 't3', store: 'Publix', total: 200, businessShare: 50 }),
];

function pestana(nombre: RegExp) {
  return screen.getByRole('button', { name: nombre });
}

/** El titular de las cifras, no el totalcito de la pestaña. */
function totalDeLaFranja(): string {
  return screen.getByText('💰 Total').parentElement?.textContent ?? '';
}

function cuantasCompras(): string {
  return screen.getByText('🧾 Compras').parentElement?.textContent ?? '';
}

describe('TripsScopedList — filtro Personal / Negocio', () => {
  it('sin nada del negocio, el selector ni aparece', () => {
    render(<TripsScopedList trips={[TICKETS[0]]} />);
    expect(screen.queryByRole('button', { name: /Personal/ })).toBeNull();
  });

  it('arranca en «Todo» con las tres compras y su total', () => {
    render(<TripsScopedList trips={TICKETS} />);
    expect(pestana(/Todo/)).toHaveAttribute('aria-pressed', 'true');
    expect(cuantasCompras()).toContain('3');
    expect(totalDeLaFranja()).toContain('700');
  });

  it('en «Personal» las CIFRAS de arriba también cambian', () => {
    // Dejar el titular contando todo mientras la lista enseña una parte es
    // justo lo que hacía imposible cuadrar el plan con esta pantalla.
    render(<TripsScopedList trips={TICKETS} />);
    fireEvent.click(pestana(/Personal/));

    // Walmart (100) + la mitad de Publix (100) = 200
    expect(totalDeLaFranja()).toContain('200');
    expect(screen.queryByText('Proveedor')).toBeNull();
    expect(screen.getByText('Walmart')).toBeInTheDocument();
    expect(screen.getByText('Publix')).toBeInTheDocument();
  });

  it('en «Negocio» deja fuera la compra personal', () => {
    render(<TripsScopedList trips={TICKETS} />);
    fireEvent.click(pestana(/Negocio/));

    // Proveedor (400) + la otra mitad de Publix (100) = 500
    expect(totalDeLaFranja()).toContain('500');
    expect(screen.queryByText('Walmart')).toBeNull();
  });

  it('el CONTEO no se reparte: medio ticket no existe', () => {
    render(<TripsScopedList trips={TICKETS} />);
    fireEvent.click(pestana(/Personal/));
    // Walmart y Publix: dos compras enteras, aunque una sea a medias.
    expect(cuantasCompras()).toContain('2');
  });

  it('abre en el ámbito que le pidan', () => {
    render(<TripsScopedList trips={TICKETS} initialScope="personal" />);
    expect(pestana(/Personal/)).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByText('Proveedor')).toBeNull();
  });

  it('sin compras enseña el vacío de siempre, sin selector', () => {
    render(<TripsScopedList trips={[]} />);
    expect(screen.getByText(/Aún no registras compras/)).toBeInTheDocument();
  });
})
