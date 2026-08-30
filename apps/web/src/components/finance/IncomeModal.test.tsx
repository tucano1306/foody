import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { IncomeSource } from '@/lib/finance-engine';
import IncomeModal, { type IncomePayload } from './IncomeModal';

/**
 * «No me está tomando ni calculando los ingresos que coloco.»
 *
 * El modal tenía DOS botones azules: «Agregar ingreso», dentro del recuadro de
 * alta, y «Listo» abajo a la derecha —el más visible, en la posición canónica
 * del botón de confirmar—. «Listo» solo cerraba. Quien rellenaba el formulario
 * y pulsaba el que parece el de guardar veía cómo su ingreso desaparecía sin un
 * solo aviso, y la pantalla seguía diciendo INGRESO $0.
 */
function montar(over: Partial<Parameters<typeof IncomeModal>[0]> = {}) {
  const onCreate = vi.fn<(p: IncomePayload) => Promise<void>>().mockResolvedValue(undefined);
  const onClose = vi.fn();
  render(
    <IncomeModal
      incomes={[]}
      onCreate={onCreate}
      onToggle={vi.fn().mockResolvedValue(undefined)}
      onDelete={vi.fn().mockResolvedValue(undefined)}
      onClose={onClose}
      {...over}
    />,
  );
  return { onCreate, onClose };
}

function rellenar(nombre: string, monto: string) {
  fireEvent.change(screen.getByPlaceholderText('Sueldo'), { target: { value: nombre } });
  fireEvent.change(screen.getByLabelText('Monto'), { target: { value: monto } });
}

describe('IncomeModal — lo escrito no se pierde al cerrar', () => {
  it('el botón del pie GUARDA lo que hay escrito, no lo tira', async () => {
    const { onCreate, onClose } = montar();
    rellenar('Sueldo', '3000');

    fireEvent.click(screen.getByRole('button', { name: /guardar y cerrar/i }));

    await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(1));
    expect(onCreate.mock.calls[0][0]).toMatchObject({ name: 'Sueldo', amount: 3000, frequency: 'monthly' });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('avisa de que hay algo sin guardar cambiando el propio botón', () => {
    montar();
    expect(screen.getByRole('button', { name: /^listo$/i })).toBeInTheDocument();
    rellenar('Sueldo', '3000');
    expect(screen.getByRole('button', { name: /guardar y cerrar/i })).toBeInTheDocument();
  });

  it('con el formulario vacío simplemente cierra', async () => {
    const { onCreate, onClose } = montar();
    fireEvent.click(screen.getByRole('button', { name: /^listo$/i }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(onCreate).not.toHaveBeenCalled();
  });

  it('si lo escrito no vale, explica por qué en vez de cerrar', async () => {
    const { onCreate, onClose } = montar();
    fireEvent.change(screen.getByPlaceholderText('Sueldo'), { target: { value: 'Sueldo' } });

    fireEvent.click(screen.getByRole('button', { name: /guardar y cerrar/i }));

    expect(await screen.findByText(/monto debe ser mayor a 0/i)).toBeInTheDocument();
    expect(onCreate).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('IncomeModal — el cheque suelto', () => {
  it('se puede elegir: antes no estaba en la lista', () => {
    montar();
    expect(screen.getByRole('button', { name: /cheque o pago suelto/i })).toBeInTheDocument();
  });

  it('pide el día, porque es lo que decide en qué mes cuenta', async () => {
    const { onCreate } = montar();
    expect(screen.queryByLabelText(/qué día lo cobraste/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /cheque o pago suelto/i }));
    const fecha = screen.getByLabelText(/qué día lo cobraste/i);
    fireEvent.change(fecha, { target: { value: '2026-08-19' } });
    rellenar('Cheque obra', '2300');
    fireEvent.click(screen.getByRole('button', { name: /agregar ingreso/i }));

    await waitFor(() => expect(onCreate).toHaveBeenCalled());
    expect(onCreate.mock.calls[0][0]).toMatchObject({
      name: 'Cheque obra',
      amount: 2300,
      frequency: 'one_time',
      receivedOn: '2026-08-19',
    });
  });

  it('un ingreso que se repite no lleva fecha de cobro', async () => {
    const { onCreate } = montar();
    rellenar('Sueldo', '3000');
    fireEvent.click(screen.getByRole('button', { name: /agregar ingreso/i }));
    await waitFor(() => expect(onCreate).toHaveBeenCalled());
    expect(onCreate.mock.calls[0][0].receivedOn).toBeNull();
  });

  it('el pie separa lo que se repite de lo que entró una vez', () => {
    const hoy = new Date();
    const dia = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-15`;
    const incomes: IncomeSource[] = [
      { id: 'a', name: 'Sueldo', amount: 3000, frequency: 'monthly', isActive: true, note: null },
      { id: 'b', name: 'Cheque', amount: 1200, frequency: 'one_time', isActive: true, note: null, receivedOn: dia },
    ];
    montar({ incomes });
    expect(screen.getByText('Entra este mes')).toBeInTheDocument();
    expect(screen.getByText(/fijos \+/)).toHaveTextContent('$3,000 fijos + $1,200 de una sola vez');
  });
});
