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

/**
 * Compras era una sola lista de arriba abajo; con 22 tickets en cuatro meses
 * ya era larga de recorrer con el dedo. Ahora cada mes es un bloque que se abre
 * al tocarlo, con sus compras de cinco en cinco.
 */
describe('TripsScopedList — por meses', () => {
  const de = (id: string, fecha: string, total = 10) => ({
    ...trip({ id, store: `Tienda ${id}`, total, businessShare: 0 }),
    purchasedAt: `${fecha}T00:00:00.000Z`,
  });

  /** Septiembre con 11 tickets (del 1 al 11), agosto con 2, junio con 1. */
  const MESES = [
    ...Array.from({ length: 11 }, (_, i) => de(`s${i + 1}`, `2026-09-${String(i + 1).padStart(2, '0')}`)),
    de('a1', '2026-08-10', 20),
    de('a2', '2026-08-22', 30),
    de('j1', '2026-06-05', 38),
  ];

  const bloque = (mes: RegExp) => screen.getByRole('button', { name: mes });

  it('un bloque por mes, el más reciente primero, con su cuenta y su total', () => {
    render(<TripsScopedList trips={MESES} />);
    const meses = [...document.querySelectorAll('button[aria-expanded]')];
    expect(meses.map((b) => b.textContent)).toEqual([
      expect.stringContaining('Septiembre de 2026'),
      expect.stringContaining('Agosto de 2026'),
      expect.stringContaining('Junio de 2026'),
    ]);
    expect(bloque(/Septiembre/)).toHaveTextContent('11 compras');
    expect(bloque(/Septiembre/)).toHaveTextContent('$110');
    expect(bloque(/Agosto/)).toHaveTextContent('2 compras');
    expect(bloque(/Agosto/)).toHaveTextContent('$50');
    expect(bloque(/Junio/)).toHaveTextContent('1 compra');
  });

  it('el mes más reciente viene abierto; los demás, cerrados', () => {
    render(<TripsScopedList trips={MESES} />);
    expect(bloque(/Septiembre/)).toHaveAttribute('aria-expanded', 'true');
    expect(bloque(/Agosto/)).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Tienda a1')).not.toBeInTheDocument();
  });

  it('tocar un mes lo abre, y tocarlo otra vez lo cierra', () => {
    render(<TripsScopedList trips={MESES} />);

    fireEvent.click(bloque(/Agosto/));
    expect(bloque(/Agosto/)).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Tienda a1')).toBeInTheDocument();
    expect(screen.getByText('Tienda a2')).toBeInTheDocument();

    fireEvent.click(bloque(/Agosto/));
    expect(screen.queryByText('Tienda a1')).not.toBeInTheDocument();
  });

  it('dentro del mes, de cinco en cinco y el más reciente primero', () => {
    render(<TripsScopedList trips={MESES} />);

    // Página 1: del 11 al 7.
    expect(screen.getByText('1 de 3')).toBeInTheDocument();
    for (const id of ['s11', 's10', 's9', 's8', 's7']) {
      expect(screen.getByText(`Tienda ${id}`)).toBeInTheDocument();
    }
    expect(screen.queryByText('Tienda s6')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Anterior/ })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: /Siguiente/ }));
    expect(screen.getByText('2 de 3')).toBeInTheDocument();
    expect(screen.getByText('Tienda s6')).toBeInTheDocument();
    expect(screen.queryByText('Tienda s11')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Siguiente/ }));
    expect(screen.getByText('3 de 3')).toBeInTheDocument();
    expect(screen.getByText('Tienda s1')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Siguiente/ })).toBeDisabled();
  });

  it('un mes corto no enseña paginador', () => {
    render(<TripsScopedList trips={MESES} />);
    fireEvent.click(bloque(/Septiembre/)); // cierra septiembre
    fireEvent.click(bloque(/Agosto/));
    expect(screen.queryByRole('navigation', { name: /Páginas/ })).not.toBeInTheDocument();
  });

  it('cerrar y volver a abrir un mes recuerda la página', () => {
    render(<TripsScopedList trips={MESES} />);
    fireEvent.click(screen.getByRole('button', { name: /Siguiente/ }));
    fireEvent.click(bloque(/Septiembre/));
    fireEvent.click(bloque(/Septiembre/));
    expect(screen.getByText('2 de 3')).toBeInTheDocument();
  });
});
