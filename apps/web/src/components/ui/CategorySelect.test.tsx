import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import CategorySelect from './CategorySelect';

/**
 * Antes esto era una fila de chips que se desplazaba en horizontal. Las
 * categorias estaban TODAS, pero solo se veian cinco: el resto quedaba fuera
 * de pantalla detras de un difuminado. Con 17 categorias, «todas» y «las cinco
 * primeras» se ven exactamente igual.
 */
const CATS = ['Frutas y Verduras', 'Lácteos', 'Carnicería', 'Panadería y Tortillería', 'Granos y Legumbres'];
const COUNTS = new Map([['Frutas y Verduras', 11], ['Lácteos', 8], ['Carnicería', 6], ['Panadería y Tortillería', 1]]);

function Filtro({ cats = CATS }: { cats?: string[] }) {
  const [value, setValue] = useState<string | null>(null);
  return (
    <>
      <CategorySelect categories={cats} counts={COUNTS} total={91} value={value} onChange={setValue} />
      <output data-testid="elegida">{value ?? 'todas'}</output>
    </>
  );
}

describe('CategorySelect', () => {
  it('las ofrece TODAS de una vez, no solo las que caben en una fila', () => {
    render(<Filtro />);
    const opciones = screen.getAllByRole('option').map((o) => o.textContent);
    expect(opciones).toHaveLength(CATS.length + 1);
    for (const c of CATS) expect(opciones.some((t) => t?.includes(c))).toBe(true);
  });

  it('cada opción lleva su número: es lo que la hace una decisión', () => {
    render(<Filtro />);
    expect(screen.getByRole('option', { name: /Lácteos/ })).toHaveTextContent('· 8');
    expect(screen.getByRole('option', { name: /Todas/ })).toHaveTextContent('· 91');
  });

  it('elegir una la comunica; volver a «todas» manda null', () => {
    render(<Filtro />);
    const select = screen.getByLabelText('Filtrar por categoría');
    fireEvent.change(select, { target: { value: 'Lácteos' } });
    expect(screen.getByTestId('elegida')).toHaveTextContent('Lácteos');
    fireEvent.change(select, { target: { value: '' } });
    expect(screen.getByTestId('elegida')).toHaveTextContent('todas');
  });

  it('una categoría sin productos sigue estando, sin número inventado', () => {
    // En el super, las categorias sin nada pendiente se listan igual: elegir
    // una enseña el estado vacio, que es una respuesta honesta.
    render(<Filtro cats={[...CATS, 'Mascotas']} />);
    expect(screen.getByRole('option', { name: /Mascotas/ })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Mascotas/ })).not.toHaveTextContent('·');
  });
});
