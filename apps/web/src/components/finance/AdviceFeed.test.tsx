import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Advice } from '@/lib/finance-engine';
import AdviceFeed from './AdviceFeed';

function advice(over: Partial<Advice> & { id: string }): Advice {
  return {
    tone: 'info',
    icon: '💡',
    title: `Consejo ${over.id}`,
    body: `Por qué importa ${over.id}.`,
    ...over,
  };
}

/** Cifras inventadas: lo que se prueba es la forma, no un caso real. */
const PROMO = advice({
  id: 'promo-end-c1',
  tone: 'info',
  icon: '⏳',
  title: 'Tarjeta: el 0 % se acaba en 70 días',
  body: 'Con tu cuota llegas a cero antes del fin del 0 %.',
  figures: [
    { label: 'Saldo al 0 %', value: '$9,000' },
    { label: 'Tu cuota', value: '$3,000 al mes' },
  ],
  steps: ['Paga la cuota cada mes y llega a cero a tiempo.'],
  action: { label: 'Ver la tarjeta', kind: 'open_debts' },
});

const META = advice({
  id: 'goal-risk-g1',
  topic: 'goals',
  tone: 'warning',
  icon: '🎯',
  title: 'Viaje no llega a tiempo',
  body: 'Le faltan $200 al mes.',
});

const CINCO = [PROMO, META, advice({ id: 'c' }), advice({ id: 'd' }), advice({ id: 'e' })];

/** Las filas de la lista: cada una es un botón que abre su detalle. */
function filas() {
  return screen.getAllByRole('button').filter((b) => b.getAttribute('aria-haspopup') === 'dialog');
}

/**
 * El consejero eran ocho tarjetas con un párrafo cada una, en dos grupos con
 * título, y cifras metidas en frases. El usuario no entendía qué decía. Ahora
 * es una lista corta —lo urgente primero— y el detalle vive en una hoja.
 */
describe('AdviceFeed — lista corta por prioridad', () => {
  it('enseña los tres primeros y guarda el resto detrás de «Ver más»', () => {
    render(<AdviceFeed advice={CINCO} onAction={() => {}} />);

    expect(filas()).toHaveLength(3);
    const ver = screen.getByRole('button', { name: 'Ver 2 más' });
    expect(ver).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(ver);
    expect(filas()).toHaveLength(5);
    const menos = screen.getByRole('button', { name: 'Ver menos' });
    expect(menos).toHaveAttribute('aria-expanded', 'true');

    fireEvent.click(menos);
    expect(filas()).toHaveLength(3);
  });

  it('respeta el orden que trae: el primero de la lista es el primero que se lee', () => {
    render(<AdviceFeed advice={CINCO} onAction={() => {}} />);
    expect(filas()[0]).toHaveTextContent(PROMO.title);
    expect(filas()[1]).toHaveTextContent(META.title);
  });

  it('con tres o menos no hay «Ver más»', () => {
    render(<AdviceFeed advice={[PROMO, META, advice({ id: 'c' })]} onAction={() => {}} />);
    expect(filas()).toHaveLength(3);
    expect(screen.queryByRole('button', { name: /Ver \d+ más/ })).toBeNull();
  });

  it('cada fila dice qué pasa y, debajo, el porqué en una frase', () => {
    render(<AdviceFeed advice={[PROMO]} onAction={() => {}} />);
    const [fila] = filas();
    expect(fila).toHaveTextContent(PROMO.title);
    expect(fila).toHaveTextContent(PROMO.body);
  });

  it('un consejo de una meta lo dice delante del título', () => {
    render(<AdviceFeed advice={[PROMO, META]} onAction={() => {}} />);
    expect(filas()[1]).toHaveTextContent(`Meta · ${META.title}`);
    // Lo general no lleva prefijo.
    expect(filas()[0]).not.toHaveTextContent('Meta ·');
  });

  it('sin consejos no se monta nada', () => {
    const { container } = render(<AdviceFeed advice={[]} onAction={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('AdviceFeed — la hoja del detalle', () => {
  it('al tocar una fila abre la hoja con el porqué, las cifras con su nombre y los pasos', () => {
    render(<AdviceFeed advice={[PROMO]} onAction={() => {}} />);
    fireEvent.click(filas()[0]);

    expect(screen.getByRole('heading', { level: 2, name: PROMO.title })).toBeInTheDocument();
    // Cada cifra al lado de SU nombre: es lo que el párrafo no dejaba ver.
    const saldo = screen.getByText('Saldo al 0 %');
    expect(saldo.tagName).toBe('DT');
    expect(saldo.nextElementSibling).toHaveTextContent('$9,000');
    expect(screen.getByText('Tu cuota').nextElementSibling).toHaveTextContent('$3,000 al mes');
    expect(screen.getByText('Paga la cuota cada mes y llega a cero a tiempo.')).toBeInTheDocument();
  });

  it('el botón de la hoja cierra y hace la acción', async () => {
    const onAction = vi.fn();
    render(<AdviceFeed advice={[PROMO]} onAction={onAction} />);
    fireEvent.click(filas()[0]);

    fireEvent.click(screen.getByRole('button', { name: 'Ver la tarjeta' }));
    expect(onAction).toHaveBeenCalledWith({ label: 'Ver la tarjeta', kind: 'open_debts' });
    await waitFor(() =>
      expect(screen.queryByRole('heading', { level: 2, name: PROMO.title })).not.toBeInTheDocument(),
    );
  });

  it('sin acción, la hoja no inventa un botón', () => {
    render(<AdviceFeed advice={[META]} onAction={() => {}} />);
    fireEvent.click(filas()[0]);
    expect(screen.getByRole('heading', { level: 2, name: META.title })).toBeInTheDocument();
    // Fuera de las filas, la única salida es cerrar.
    const otros = screen
      .getAllByRole('button')
      .filter((b) => b.getAttribute('aria-haspopup') !== 'dialog' && b.getAttribute('aria-label') !== 'Cerrar');
    expect(otros).toHaveLength(0);
  });

  it('con el plan recalculado enseña las cifras nuevas, y si el consejo ya no está, se cierra', async () => {
    const { rerender } = render(<AdviceFeed advice={[PROMO, META]} onAction={() => {}} />);
    fireEvent.click(filas()[0]);
    expect(screen.getByText('Saldo al 0 %').nextElementSibling).toHaveTextContent('$9,000');

    // Volver a la app recalcula el plan: el mismo consejo llega con otra cifra.
    const abonado = { ...PROMO, figures: [{ label: 'Saldo al 0 %', value: '$6,000' }] };
    rerender(<AdviceFeed advice={[abonado, META]} onAction={() => {}} />);
    expect(screen.getByText('Saldo al 0 %').nextElementSibling).toHaveTextContent('$6,000');

    // Resuelto, el consejo desaparece de la lista y la hoja con él.
    rerender(<AdviceFeed advice={[META]} onAction={() => {}} />);
    await waitFor(() =>
      expect(screen.queryByRole('heading', { level: 2, name: PROMO.title })).not.toBeInTheDocument(),
    );
  });
});
