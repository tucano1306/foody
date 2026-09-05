import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import ScanTicketButton from './ScanTicketButton';

/**
 * Este boton vivia duplicado en las dos tarjetas del plan, y se separo DOS
 * veces: primero en el texto --uno decia «Escanear» y el otro «Escanear
 * factura», haciendo lo mismo y yendo al mismo sitio-- y despues en el color,
 * uno en sky-500 y el otro en blue-500. Escrito una sola vez ya no pueden
 * discrepar; esto fija lo que promete.
 */
describe('ScanTicketButton', () => {
  it('lleva al escáner de tickets', () => {
    render(<ScanTicketButton />);
    expect(screen.getByRole('link', { name: /Escanear ticket/ })).toHaveAttribute(
      'href',
      '/shopping-trips/new',
    );
  });

  it('usa el azul primario de la app, no un azul cualquiera', () => {
    render(<ScanTicketButton />);
    expect(screen.getByRole('link', { name: /Escanear ticket/ })).toHaveClass('bg-sky-500');
  });
});
