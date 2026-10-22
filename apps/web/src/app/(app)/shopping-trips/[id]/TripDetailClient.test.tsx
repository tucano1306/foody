import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ShoppingTripDetail } from '@foody/types';

const push = vi.fn();
const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh }) }));
vi.mock('@/components/ui/Toast', () => ({ useToast: () => ({ show: vi.fn() }) }));

import TripDetailClient from './TripDetailClient';

/**
 * El Walmart del 21 oct 2026: se cerró en el súper con los precios tecleados y
 * se editó el ticket. Al guardar, el formulario mandó los productos sin precio
 * —solo conservaba los de origen `manual`— y el servidor repartió $111.69
 * entre las unidades: veinte productos a $2.25.
 */
function compra(over: Partial<ShoppingTripDetail['items'][number]>): ShoppingTripDetail['items'][number] {
  return {
    id: 'pp',
    productId: 'p',
    productName: 'Producto',
    quantity: 1,
    unitPrice: null,
    totalPrice: null,
    priceSource: 'unknown',
    currency: 'USD',
    purchasedAt: '2026-10-21T22:03:13.000Z',
    storeId: null,
    storeName: 'Walmart',
    tripId: 't',
    userId: 'u',
    createdAt: '2026-10-21T22:03:13.000Z',
    ...over,
  };
}

const TRIP: ShoppingTripDetail = {
  id: 't',
  storeId: null,
  storeName: 'Walmart',
  purchasedAt: '2026-10-21T22:03:13.000Z',
  totalAmount: 20,
  currency: 'USD',
  allocationStrategy: 'manual_partial',
  receiptPhotoUrl: null,
  notes: null,
  kind: 'grocery',
  businessShare: 0,
  userId: 'u',
  createdAt: '2026-10-21T22:03:13.000Z',
  updatedAt: '2026-10-21T22:03:13.000Z',
  splits: [],
  items: [
    compra({ id: 'pp1', productId: 'cafe', productName: 'Cafe la llave', unitPrice: 8.97, totalPrice: 8.97, priceSource: 'shopping_list' }),
    compra({ id: 'pp2', productId: 'adobo', productName: 'Adobo', unitPrice: 11.03, totalPrice: 11.03, priceSource: 'allocated' }),
  ],
};

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn(async () => new Response(JSON.stringify({ trip: {}, items: [] })));
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

function abrirEdicion() {
  render(<TripDetailClient trip={TRIP} products={[]} />);
  fireEvent.click(screen.getByRole('button', { name: /editar ticket/i }));
}

function cuerpoDelGuardado(): Record<string, unknown> {
  const llamada = fetchMock.mock.calls.find(([, init]) => (init as RequestInit | undefined)?.method === 'PATCH');
  return JSON.parse(String((llamada?.[1] as RequestInit).body));
}

describe('TripDetailClient — editar no borra los precios del súper', () => {
  it('el precio tecleado en el súper sigue en el formulario; solo lo repartido queda por estimar', () => {
    abrirEdicion();
    const precios = screen.getAllByPlaceholderText('Foody lo estima') as HTMLInputElement[];
    expect(precios.map((p) => p.value)).toEqual(['8.97', '']);
  });

  it('cambiar solo la fecha no reescribe los productos', async () => {
    abrirEdicion();
    fireEvent.change(screen.getByDisplayValue('2026-10-21'), { target: { value: '2026-10-20' } });
    fireEvent.click(screen.getByRole('button', { name: /guardar cambios/i }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const cuerpo = cuerpoDelGuardado();
    expect(cuerpo).not.toHaveProperty('items');
    expect(cuerpo.purchasedAt).toBeTruthy();
  });

  it('si se toca un producto, se mandan todos y el del súper con su precio', async () => {
    abrirEdicion();
    const [, adobo] = screen.getAllByPlaceholderText('Foody lo estima');
    fireEvent.change(adobo, { target: { value: '3.50' } });
    fireEvent.click(screen.getByRole('button', { name: /guardar cambios/i }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(cuerpoDelGuardado().items).toEqual([
      { productId: 'cafe', quantity: 1, unitPrice: 8.97 },
      { productId: 'adobo', quantity: 1, unitPrice: 3.5 },
    ]);
  });
});
