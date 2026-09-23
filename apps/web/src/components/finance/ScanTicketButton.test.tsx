import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import ScanTicketButton from './ScanTicketButton';

/**
 * Este boton vivia duplicado en las dos tarjetas del plan, y se separo DOS
 * veces: primero en el texto --uno decia «Escanear» y el otro «Escanear
 * factura», haciendo lo mismo y yendo al mismo sitio-- y despues en el color,
 * uno en sky-500 y el otro en blue-500. Escrito una sola vez ya no pueden
 * discrepar; esto fija lo que promete.
 *
 * Y unificarlos borro de paso lo unico que SI tenia que diferir: a donde va a
 * parar el gasto. Escanear desde «Fuera del super» abria el formulario en
 * Super, asi que el ticket acababa en Compras. Eso tambien se fija aqui.
 */
describe('ScanTicketButton', () => {
  it('lleva al escáner de tickets, en súper por defecto', () => {
    render(<ScanTicketButton />);
    expect(screen.getByRole('link', { name: /Escanear ticket/ })).toHaveAttribute(
      'href',
      '/shopping-trips/new?kind=grocery',
    );
  });

  it('desde «Fuera del super» abre el formulario fuera de la despensa', () => {
    render(<ScanTicketButton kind="other" />);
    expect(screen.getByRole('link', { name: /Escanear ticket/ })).toHaveAttribute(
      'href',
      '/shopping-trips/new?kind=other',
    );
  });

  it('se ve igual venga de donde venga: lo que cambia es el destino', () => {
    const { container: superCard } = render(<ScanTicketButton />);
    const { container: fueraCard } = render(<ScanTicketButton kind="dining" />);
    const clase = (c: HTMLElement) => c.querySelector('a')!.className;

    expect(clase(superCard)).toBe(clase(fueraCard));
    expect(clase(superCard)).toContain('bg-sky-500');
  });
});
