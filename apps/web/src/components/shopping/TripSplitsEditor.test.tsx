import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { TripSplitInput } from '@/lib/trip-splits';
import TripSplitsEditor from './TripSplitsEditor';

/**
 * El caso real: un carrito de Walmart de $120 con la despensa de la semana y,
 * en el mismo recibo, $35 de farmacia.
 */
function Editor({ total = 120 }: { total?: number }) {
  const [splits, setSplits] = useState<TripSplitInput[]>([]);
  return <TripSplitsEditor total={total} mainKind="grocery" splits={splits} onChange={setSplits} />;
}

function abrirYRepartir(monto: string, tipo?: RegExp) {
  fireEvent.click(screen.getByRole('button', { name: /trae algo que no es/i }));
  if (tipo) fireEvent.click(screen.getByRole('button', { name: tipo }));
  const campo = screen.getByLabelText(/Cuánto de/i);
  fireEvent.change(campo, { target: { value: monto } });
}

describe('TripSplitsEditor — repartir un ticket', () => {
  it('empieza plegado: quien nunca reparte no ve un campo de más', () => {
    render(<Editor />);
    expect(screen.getByRole('button', { name: /trae algo que no es/i })).toBeInTheDocument();
    expect(screen.queryByLabelText(/Cuánto de/i)).not.toBeInTheDocument();
  });

  it('resta del total y enseña lo que queda de despensa', () => {
    render(<Editor />);
    abrirYRepartir('35');
    expect(screen.getByText('Queda en súper').nextElementSibling).toHaveTextContent('$85.00');
    expect(screen.getByText('Repartido').nextElementSibling).toHaveTextContent('$35.00');
  });

  it('acepta decimales con coma, como el resto de la app', () => {
    render(<Editor />);
    abrirYRepartir('35,50');
    expect(screen.getByText('Queda en súper').nextElementSibling).toHaveTextContent('$84.50');
  });

  it('varias partes se suman', () => {
    render(<Editor />);
    abrirYRepartir('35');
    fireEvent.click(screen.getByRole('button', { name: /otra parte/i }));
    const campos = screen.getAllByLabelText(/Cuánto de/i);
    fireEvent.change(campos[1], { target: { value: '40' } });
    expect(screen.getByText('Repartido').nextElementSibling).toHaveTextContent('$75.00');
    expect(screen.getByText('Queda en súper').nextElementSibling).toHaveTextContent('$45.00');
  });

  it('repartir de más avisa y dice cuánto sobra', () => {
    render(<Editor total={100} />);
    abrirYRepartir('130');
    expect(screen.getByText(/sobran/i)).toHaveTextContent('30.00');
    expect(screen.getByText('Queda en súper').nextElementSibling).toHaveTextContent('$0.00');
  });

  it('quitar la última parte vuelve a plegarlo', () => {
    render(<Editor />);
    abrirYRepartir('35');
    fireEvent.click(screen.getByRole('button', { name: /quitar esta parte/i }));
    expect(screen.getByRole('button', { name: /trae algo que no es/i })).toBeInTheDocument();
  });

  it('el tipo se puede cambiar y la etiqueta del importe lo sigue', () => {
    render(<Editor />);
    abrirYRepartir('35');
    // El emoji va en un aria-hidden, asi que el nombre accesible es la palabra.
    fireEvent.click(screen.getByRole('button', { name: 'Gasolina' }));
    expect(screen.getByLabelText('Cuánto de Gasolina')).toBeInTheDocument();
  });

  it('propone un tipo distinto al del ticket: repetirlo no repartiría nada', () => {
    const onChange = vi.fn();
    render(<TripSplitsEditor total={120} mainKind="grocery" splits={[]} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: /trae algo que no es/i }));
    expect(onChange.mock.calls[0][0][0].kind).not.toBe('grocery');
  });
});
