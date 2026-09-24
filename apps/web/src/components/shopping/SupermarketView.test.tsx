import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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

/**
 * Casa contaba 6 faltantes y Súper enseñaba 4. «No estaba en el súper» borraba
 * la fila para siempre aunque el aviso prometía quitarlo solo «de hoy». Ahora
 * se aparta hasta finalizar la compra, y mientras tanto se nombra al pie: si no
 * se viera, la diferencia con Casa volvería a parecer un error.
 */
describe('SupermarketView · lo que no estaba en el súper', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 204, json: async () => ({}) })));
    // La hoja del producto pregunta por `prefers-reduced-motion`; jsdom no
    // trae `matchMedia`.
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: false, media: query, onchange: null,
      addEventListener: () => undefined, removeEventListener: () => undefined,
      addListener: () => undefined, removeListener: () => undefined,
      dispatchEvent: () => false,
    }));
    // Las chispas usan la Web Animations API, que jsdom tampoco trae.
    Element.prototype.animate ??= function animate() {
      return { finished: Promise.resolve(), cancel: () => undefined, onfinish: null } as unknown as Animation;
    };
  });

  it('nombra al pie lo apartado hoy y cuándo vuelve', () => {
    render(
      <SupermarketView
        initialItems={ITEMS}
        initialApartados={[{ productId: 'qf', name: 'Queso Fresco' }]}
      />,
    );
    const pie = screen.getByText(/No estaban en el súper/);
    expect(pie).toHaveTextContent('Queso Fresco');
    expect(pie).toHaveTextContent('Vuelven a la lista al finalizar la compra');
  });

  it('sin nada apartado no hay pie', () => {
    render(<SupermarketView initialItems={ITEMS} />);
    expect(screen.queryByText(/No estaban en el súper/)).not.toBeInTheDocument();
  });

  it('«no estaba en el súper» lo aparta: al pie, no perdido', async () => {
    render(<SupermarketView initialItems={ITEMS} />);

    fireEvent.click(screen.getAllByText('Mantequilla')[0]);
    fireEvent.click(await screen.findByRole('button', { name: /No estaba en el súper/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Apartar por hoy' }));

    const pie = await screen.findByText(/No estaban en el súper/);
    expect(pie).toHaveTextContent('Mantequilla');
    const [url, init] = vi.mocked(fetch).mock.calls.at(-1)!;
    expect(url).toBe('/api/proxy/shopping-list/li-mantequilla');
    expect((init as RequestInit).method).toBe('DELETE');
  });
});

/**
 * El usuario quitó el Queso Fresco de la lista porque ya no lo quería —o lo
 * había cambiado por otro queso— y Casa seguía pidiendo «reponer 6» donde él
 * esperaba 5. El único botón que había era «No estaba en el súper», que lo
 * apartaba y lo dejaba como faltante. Ahora se elige el motivo.
 */
describe('SupermarketView · «ya no lo necesito»', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) })));
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: false, media: query, onchange: null,
      addEventListener: () => undefined, removeEventListener: () => undefined,
      addListener: () => undefined, removeListener: () => undefined,
      dispatchEvent: () => false,
    }));
    Element.prototype.animate ??= function animate() {
      return { finished: Promise.resolve(), cancel: () => undefined, onfinish: null } as unknown as Animation;
    };
  });

  it('la hoja ofrece los dos motivos', async () => {
    render(<SupermarketView initialItems={ITEMS} />);
    fireEvent.click(screen.getAllByText('Mantequilla')[0]);

    expect(await screen.findByRole('button', { name: /Ya no lo necesito/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /No estaba en el súper/ })).toBeInTheDocument();
  });

  it('lo saca de los faltantes de Casa: el mismo «ya tengo» que usa Casa', async () => {
    render(<SupermarketView initialItems={ITEMS} />);

    fireEvent.click(screen.getAllByText('Mantequilla')[0]);
    fireEvent.click(await screen.findByRole('button', { name: /Ya no lo necesito/ }));
    // La confirmación dice la consecuencia, que es justo lo que confundía.
    expect(await screen.findByText(/Sale de la lista y de los faltantes de Casa/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Ya no lo necesito' }));

    await waitFor(() => expect(fetch).toHaveBeenCalledWith(
      '/api/proxy/products/mantequilla/mark-ok',
      expect.objectContaining({ method: 'PATCH' }),
    ));
    // Y no pasa por la ruta de apartar.
    expect(vi.mocked(fetch).mock.calls.some(([u]) => String(u).includes('/shopping-list/'))).toBe(false);
  });

  it('y no lo deja apartado: no vuelve al finalizar la compra', async () => {
    render(<SupermarketView initialItems={ITEMS} />);

    fireEvent.click(screen.getAllByText('Mantequilla')[0]);
    fireEvent.click(await screen.findByRole('button', { name: /Ya no lo necesito/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Ya no lo necesito' }));

    await waitFor(() => expect(fetch).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /Ya no necesitas/ })).not.toBeInTheDocument());
    expect(screen.queryByText(/No estaban en el súper/)).not.toBeInTheDocument();
  });
});
