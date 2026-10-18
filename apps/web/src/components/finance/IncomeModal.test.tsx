import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { within } from '@testing-library/react';
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
      onUpdateAmount={vi.fn().mockResolvedValue(undefined)}
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
    expect(screen.getByText(/^Ingresos de /)).toBeInTheDocument();
    expect(screen.getByText(/cobrados \+/)).toHaveTextContent('$1,200 cobrados + $3,000 de ingresos regulares');
  });
});

/**
 * «Este mes solo he ingresado $1,386.» El modal decía «Entra este mes $4,526»
 * y había que descifrar «Llevo este año ÷ 10 meses» u «otro mes». Estos son los
 * ingresos del dueño tal como estaban el 18 de octubre de 2026.
 */
describe('IncomeModal — se entiende de un vistazo', () => {
  const DUENO: IncomeSource[] = [
    { id: 'driver', name: 'Como Driver', amount: 31397.5, frequency: 'ytd', isActive: true, note: null, asOf: '2026-08-30' },
    { id: 'ga', name: 'Cargas a Georgia', amount: 3311, frequency: 'one_time', isActive: true, note: null, receivedOn: '2026-09-17' },
    { id: 't1', name: 'Tecnofuel', amount: 65, frequency: 'one_time', isActive: true, note: null, receivedOn: '2026-09-28' },
    { id: 't2', name: 'Tecnofuel', amount: 1386, frequency: 'one_time', isActive: true, note: null, receivedOn: '2026-10-16' },
  ];

  function enOctubre<T>(fn: () => T): T {
    vi.useFakeTimers({ now: new Date(2026, 9, 18, 12), toFake: ['Date'] });
    try {
      return fn();
    } finally {
      vi.useRealTimers();
    }
  }

  it('el pie dice lo cobrado de verdad en octubre', () => {
    enOctubre(() => montar({ incomes: DUENO }));
    expect(screen.getByText('Ingresos de octubre')).toBeInTheDocument();
    expect(screen.getByText('$1,386', { selector: 'p' })).toBeInTheDocument();
    expect(screen.getByText('Lo que has cobrado este mes')).toBeInTheDocument();
  });

  it('separa lo que cuenta este mes de lo que no, y cada fila dice qué es en palabras', () => {
    enOctubre(() => montar({ incomes: DUENO }));
    const cuentan = within(screen.getByRole('region', { name: 'Cuentan en octubre' }));
    expect(cuentan.getByText('$1,386 · cobrado el 16 oct')).toBeInTheDocument();
    expect(cuentan.queryByText('Como Driver')).not.toBeInTheDocument();

    const noCuentan = within(screen.getByRole('region', { name: 'No cuentan en octubre' }));
    expect(noCuentan.getByText('$31,398 cobrados de enero al 30 ago · $3,924.69 al mes de media')).toBeInTheDocument();
    expect(noCuentan.getByText('$3,311 · cobrado el 17 sep')).toBeInTheDocument();
    expect(screen.queryByText(/otro mes|÷/)).not.toBeInTheDocument();
  });

  it('un acumulado se pone al día ahí mismo', async () => {
    const onUpdateAmount = vi.fn<(id: string, amount: number) => Promise<void>>().mockResolvedValue(undefined);
    enOctubre(() => montar({ incomes: DUENO, onUpdateAmount }));
    fireEvent.click(screen.getByRole('button', { name: 'Actualizar' }));
    fireEvent.change(screen.getByLabelText(/lo que llevas cobrado en 2026 hasta hoy/i), { target: { value: '35.000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(onUpdateAmount).toHaveBeenCalledWith('driver', 35000));
  });
});

describe('IncomeModal — lo que llevo cobrado este año', () => {
  it('enseña la cuenta entera: cifra ÷ meses transcurridos = al mes', () => {
    // El resultado cambia solo al pasar de mes, así que la división tiene que
    // verse: si no, parece que la app se inventa el número.
    vi.useFakeTimers({ now: new Date(2026, 7, 30), toFake: ['Date'] });
    try {
      montar();
      fireEvent.click(screen.getByRole('button', { name: /llevo cobrado este año/i }));
      fireEvent.change(screen.getByLabelText('Monto'), { target: { value: '31397.50' } });

      const nota = screen.getByText(/han pasado/i);
      expect(nota).toHaveTextContent('8 meses de 2026');
      expect(nota).toHaveTextContent('$3,924.69 al mes');
    } finally {
      vi.useRealTimers();
    }
  });

  it('lo manda con su propia frecuencia, no como sueldo anual', async () => {
    const { onCreate } = montar();
    fireEvent.click(screen.getByRole('button', { name: /llevo cobrado este año/i }));
    rellenar('Trabajos 2026', '31397.50');
    fireEvent.click(screen.getByRole('button', { name: /agregar ingreso/i }));

    await waitFor(() => expect(onCreate).toHaveBeenCalled());
    expect(onCreate.mock.calls[0][0]).toMatchObject({ amount: 31397.5, frequency: 'ytd', receivedOn: null });
  });
});
