import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ShoppingListItem } from '@foody/types';
import SupermarketView from './SupermarketView';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: () => undefined, push: () => undefined }),
}));

function item(id: string, name: string, enCarrito: boolean): ShoppingListItem {
  return {
    id: `li-${id}`,
    productId: id,
    quantityNeeded: 1,
    isInCart: enCarrito,
    isPurchased: false,
    userId: 'u1',
    createdAt: '2026-09-06T00:00:00.000Z',
    updatedAt: '2026-09-06T00:00:00.000Z',
    product: {
      id,
      name,
      unit: 'unid.',
      category: 'Lácteos',
      photoUrl: null,
      stockLevel: 'empty',
      lastPurchasePrice: null,
    },
  } as unknown as ShoppingListItem;
}

const ITEMS = [
  item('queso', 'Queso muenster', true),
  item('jamon', 'Jamón Turkey Breast', true),
  item('mantequilla', 'Mantequilla', false),
];

/** La sesión de compra a medias que vive en localStorage: dos precios puestos. */
const SESION = {
  entries: {
    queso: [{ qty: 1, total: 6.89 }],
    jamon: [{ qty: 1, total: 8.99 }],
  },
  cartTimes: { queso: 1000, jamon: 2000 },
  storeName: '',
  totalAmount: '',
};

describe('SupermarketView · el carrito', () => {
  beforeEach(() => {
    localStorage.setItem('foody-sky-session-v2', JSON.stringify(SESION));
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({}) })));
  });

  /**
   * El total es lo que se mira cada dos minutos en la tienda. Tocarlo tiene que
   * contestar la pregunta que viene detrás: «¿y qué llevo ya?».
   */
  it('el total del carrito es un botón que enseña lo ya comprado', () => {
    render(<SupermarketView initialItems={ITEMS} />);

    const total = screen.getByRole('button', { name: /Ver el carrito/ });
    expect(total).toHaveTextContent('15.88');

    fireEvent.click(total);

    const hoja = screen.getByRole('dialog', { name: 'Tu carrito' });
    expect(within(hoja).getByText('Queso muenster')).toBeInTheDocument();
    expect(within(hoja).getByText('Jamón Turkey Breast')).toBeInTheDocument();
    expect(within(hoja).getByText('$6.89')).toBeInTheDocument();
    expect(within(hoja).getByText('$8.99')).toBeInTheDocument();
    expect(within(hoja).getByText('$15.88')).toBeInTheDocument();
    // Lo que aún NO está en el carrito no es «lo comprado».
    expect(within(hoja).queryByText('Mantequilla')).not.toBeInTheDocument();
  });

  it('desde la hoja se cierra la compra sin ir a buscar el botón flotante', () => {
    render(<SupermarketView initialItems={ITEMS} />);
    fireEvent.click(screen.getByRole('button', { name: /Ver el carrito/ }));

    const hoja = screen.getByRole('dialog', { name: 'Tu carrito' });
    fireEvent.click(within(hoja).getByRole('button', { name: /Finalizar compra/ }));

    expect(screen.queryByRole('dialog', { name: 'Tu carrito' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Finalizar compra/ })).toBeInTheDocument();
    // El resumen que se va a guardar lleva los precios de esta compra.
    expect(screen.getByLabelText(/Cuánto gastaste/)).toHaveValue('15.88');
  });

  /** El botón de siempre sigue estando, y sigue abriendo el mismo modal. */
  it('el botón flotante abre la misma hoja de finalizar', () => {
    render(<SupermarketView initialItems={ITEMS} />);

    fireEvent.click(screen.getByRole('button', { name: /^Finalizar · / }));

    expect(screen.getByRole('heading', { name: /Finalizar compra/ })).toBeInTheDocument();
  });
});
