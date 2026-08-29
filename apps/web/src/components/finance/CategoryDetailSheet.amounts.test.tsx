import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CategoryDetailSheet from './CategoryDetailSheet';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

/**
 * El aguacate del ticket: 2 unidades por $1.12 en total, o sea $0.56 cada uno.
 *
 * Redondeado a cero decimales se leía «2 × $1» con un total de «$1», que no es
 * que esté mal calculado: es que la pantalla enseñaba una cuenta que no cuadra.
 * En un ticket, el importe es el que se escribió — no se redondea.
 */
const BREAKDOWN = {
  kind: 'category',
  category: 'Frutas y Verduras',
  total: 15.24,
  items: [
    {
      id: 'i1',
      productId: 'p1',
      productName: 'Aguacate',
      category: 'Frutas y Verduras',
      quantity: 2,
      unitPrice: 0.56,
      totalPrice: 1.12,
      purchasedAt: '2026-08-23T12:00:00.000Z',
      storeName: 'Walmart',
      tripId: null,
    },
  ],
  trips: [],
};

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (String(url).includes('spend-breakdown')) {
        return { ok: true, json: async () => BREAKDOWN } as Response;
      }
      return { ok: true, json: async () => [] } as Response;
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('CategoryDetailSheet — los importes son los que se escribieron', () => {
  it('enseña el precio unitario con sus centavos, no redondeado a $1', async () => {
    render(<CategoryDetailSheet category="Frutas y Verduras" onClose={() => {}} onChanged={() => {}} />);

    await waitFor(() => expect(screen.getByText('Aguacate')).toBeInTheDocument());
    // «2 × $0.56», no «2 × $1».
    expect(screen.getByText(/2 × \$0\.56/)).toBeInTheDocument();
  });

  it('enseña el total de la línea exacto', async () => {
    render(<CategoryDetailSheet category="Frutas y Verduras" onClose={() => {}} onChanged={() => {}} />);

    await waitFor(() => expect(screen.getByText('Aguacate')).toBeInTheDocument());
    expect(screen.getByText('$1.12')).toBeInTheDocument();
  });

  it('la cuenta de la línea CUADRA: cantidad × unitario = total', async () => {
    // Lo que se reportó: «2 aguacates por $1 es igual a 2, no $1».
    render(<CategoryDetailSheet category="Frutas y Verduras" onClose={() => {}} onChanged={() => {}} />);

    await waitFor(() => expect(screen.getByText('Aguacate')).toBeInTheDocument());
    const linea = screen.getByText(/2 × \$0\.56/).textContent ?? '';
    const [, unitario] = linea.match(/2 × \$([\d.]+)/) ?? [];
    expect(Number(unitario) * 2).toBeCloseTo(1.12, 2);
  });

  it('el encabezado también lleva sus centavos', async () => {
    render(<CategoryDetailSheet category="Frutas y Verduras" onClose={() => {}} onChanged={() => {}} />);

    await waitFor(() => expect(screen.getByText('Aguacate')).toBeInTheDocument());
    expect(screen.getByText(/\$15\.24 este mes/)).toBeInTheDocument();
  });
})
