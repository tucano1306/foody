import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import MoneyInput from './MoneyInput';

/**
 * El fallo reportado: «en este modal no me deja colocar decimales».
 *
 * El campo estaba atado al NÚMERO del formulario y se reinterpretaba en cada
 * tecla, asi que al escribir el separador «87.» se leia como 87 y el campo se
 * repintaba como «87», borrando el punto recien tecleado. El decimal no es que
 * se guardara mal: era imposible de escribir.
 */
function Formulario({ inicial = 0 }: { inicial?: number }) {
  const [amount, setAmount] = useState(inicial);
  return (
    <>
      <MoneyInput aria-label="Monto" value={amount} onChange={setAmount} />
      <output data-testid="valor">{amount}</output>
    </>
  );
}

/** Teclea caracter a caracter, como una persona. */
function teclear(texto: string) {
  const campo = screen.getByLabelText('Monto');
  let acumulado = '';
  for (const c of texto) {
    acumulado += c;
    fireEvent.change(campo, { target: { value: acumulado } });
  }
  return campo;
}

describe('MoneyInput — se pueden escribir decimales', () => {
  it('el separador NO desaparece al teclearlo', () => {
    render(<Formulario />);
    const campo = teclear('87.');
    expect(campo).toHaveValue('87.');
  });

  it('87.50 se puede escribir entero y vale 87.5', () => {
    render(<Formulario />);
    expect(teclear('87.50')).toHaveValue('87.50');
    expect(screen.getByTestId('valor')).toHaveTextContent('87.5');
  });

  it('con coma también, que es como se escribe en español', () => {
    render(<Formulario />);
    expect(teclear('87,50')).toHaveValue('87,50');
    expect(screen.getByTestId('valor')).toHaveTextContent('87.5');
  });

  it('los separadores de millares siguen entendiéndose', () => {
    render(<Formulario />);
    teclear('1.234,56');
    expect(screen.getByTestId('valor')).toHaveTextContent('1234.56');
  });

  it('editar un pago existente parte de su importe', () => {
    render(<Formulario inicial={14.5} />);
    expect(screen.getByLabelText('Monto')).toHaveValue('14.5');
  });

  it('se puede borrar del todo sin que reaparezca un 0', () => {
    render(<Formulario inicial={87.5} />);
    fireEvent.change(screen.getByLabelText('Monto'), { target: { value: '' } });
    expect(screen.getByLabelText('Monto')).toHaveValue('');
    expect(screen.getByTestId('valor')).toHaveTextContent('0');
  });

  it('si el importe cambia DESDE FUERA, el campo se pone al día', () => {
    // Abrir otro pago en el mismo modal: ahi si hay que pisar lo tecleado.
    function ConBoton() {
      const [amount, setAmount] = useState(10);
      return (
        <>
          <MoneyInput aria-label="Monto" value={amount} onChange={setAmount} />
          <button type="button" onClick={() => setAmount(250.75)}>otro pago</button>
        </>
      );
    }
    render(<ConBoton />);
    fireEvent.click(screen.getByRole('button', { name: 'otro pago' }));
    expect(screen.getByLabelText('Monto')).toHaveValue('250.75');
  });

  it('avisa del importe en cada tecla, no solo al final', () => {
    const onChange = vi.fn();
    render(<MoneyInput aria-label="Monto" value={0} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Monto'), { target: { value: '8' } });
    fireEvent.change(screen.getByLabelText('Monto'), { target: { value: '87' } });
    expect(onChange).toHaveBeenNthCalledWith(1, 8);
    expect(onChange).toHaveBeenNthCalledWith(2, 87);
  });
});
