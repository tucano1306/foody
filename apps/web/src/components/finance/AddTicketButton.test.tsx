import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import AddTicketButton from './AddTicketButton';

/**
 * Este boton vivia duplicado en las dos tarjetas del plan, y se separo DOS
 * veces: primero en el texto --uno decia «Escanear» y el otro «Escanear
 * factura», haciendo lo mismo y yendo al mismo sitio-- y despues en el color.
 * Escrito una sola vez ya no pueden discrepar; esto fija lo que promete.
 *
 * Y unificarlos borro de paso lo unico que SI tenia que diferir: a donde va a
 * parar el gasto. Agregar desde «Fuera del super» abria el formulario en
 * Super, asi que el ticket acababa en Compras. Eso tambien se fija aqui.
 */
describe('AddTicketButton', () => {
  it('dice «Agregar», no «Escanear»: el ticket también se escribe a mano', () => {
    render(<AddTicketButton />);
    expect(screen.getByRole('link', { name: /Agregar ticket/ })).toBeInTheDocument();
    expect(screen.queryByText(/Escanear/)).toBeNull();
  });

  it('lleva al formulario de tickets, en súper por defecto', () => {
    render(<AddTicketButton />);
    expect(screen.getByRole('link', { name: /Agregar ticket/ })).toHaveAttribute(
      'href',
      '/shopping-trips/new?kind=grocery',
    );
  });

  it('desde «Fuera del super» abre el formulario fuera de la despensa', () => {
    render(<AddTicketButton kind="other" />);
    expect(screen.getByRole('link', { name: /Agregar ticket/ })).toHaveAttribute(
      'href',
      '/shopping-trips/new?kind=other',
    );
  });

  it('se ve igual venga de donde venga: lo que cambia es el destino', () => {
    const { container: superCard } = render(<AddTicketButton />);
    const { container: fueraCard } = render(<AddTicketButton kind="dining" />);
    const clase = (c: HTMLElement) => c.querySelector('a')!.className;

    expect(clase(superCard)).toBe(clase(fueraCard));
    // El botón principal de la app, el mismo en todas partes.
    expect(clase(superCard)).toContain('btn-primary');
  });
});
