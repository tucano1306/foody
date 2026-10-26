import { describe, expect, it } from 'vitest';
import { lecturaDespensa, lecturaGastoMensual, lecturaProductos, lecturaSupermercados } from './lecturas-stats';

describe('lecturaGastoMensual', () => {
  it('media y mes más caro, sin contar el mes en curso', () => {
    const r = lecturaGastoMensual(
      [
        { month: '2026-08', total: 500 },
        { month: '2026-09', total: 300 },
        { month: '2026-10', total: 9999 }, // en curso: ni media ni «el más caro»
      ],
      '2026-10',
    );
    expect(r).toBe('Media de $400 al mes · el más caro, ago ($500)');
  });

  it('con un solo mes cerrado no hay «más caro»', () => {
    expect(lecturaGastoMensual([{ month: '2026-09', total: 320 }], '2026-10')).toBe(
      'Gastas unos $320 al mes en el súper',
    );
  });

  it('sin meses cerrados no dice nada', () => {
    expect(lecturaGastoMensual([{ month: '2026-10', total: 80 }], '2026-10')).toBeNull();
  });
});

describe('lecturaProductos', () => {
  it('el primero de la lista, con sus veces', () => {
    expect(lecturaProductos([{ name: 'Leche', purchases: 14 }, { name: 'Pan', purchases: 9 }])).toBe(
      'Leche es lo que más compras: 14 veces',
    );
  });

  it('una sola compra no es «lo que más compras»', () => {
    expect(lecturaProductos([{ name: 'Leche', purchases: 1 }])).toBeNull();
    expect(lecturaProductos([])).toBeNull();
  });
});

describe('lecturaDespensa', () => {
  it('lo lleno en porcentaje y lo que falta en número', () => {
    expect(lecturaDespensa({ full: 35, half: 3, empty: 2 })).toBe('El 88 % está lleno · 5 por reponer');
  });

  it('todo lleno', () => {
    expect(lecturaDespensa({ full: 12, half: 0, empty: 0 })).toBe('Tienes de todo: nada por reponer');
  });

  it('despensa vacía', () => {
    expect(lecturaDespensa({ full: 0, half: 0, empty: 0 })).toBeNull();
  });
});

describe('lecturaSupermercados', () => {
  it('la tienda que se lleva más dinero y su parte', () => {
    expect(
      lecturaSupermercados([
        { name: 'Publix', totalSpent: 300 },
        { name: 'Walmart', totalSpent: 600 },
        { name: 'Aldi', totalSpent: 100 },
      ]),
    ).toBe('Walmart se lleva el 60 % de lo que gastas en el súper');
  });

  it('con una sola tienda no hay reparto que contar; «Sin tienda» no cuenta', () => {
    expect(lecturaSupermercados([{ name: 'Walmart', totalSpent: 600 }])).toBeNull();
    expect(lecturaSupermercados([{ name: 'Walmart', totalSpent: 600 }, { name: 'Sin tienda', totalSpent: 50 }])).toBeNull();
  });
});
