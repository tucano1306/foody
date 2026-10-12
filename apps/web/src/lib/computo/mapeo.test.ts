import { describe, expect, it } from 'vitest';
import { categoriaDePago, CATEGORIA_DE_TICKET, gastoDePago, gastoDeTicket, huella } from './mapeo';

/**
 * Las categorías son las que el usuario ya usaba en Computo a mano: lo que
 * llega solo se suma a lo que ya había, no abre líneas nuevas.
 */
describe('categorías', () => {
  it('cada tipo de ticket cae donde el usuario ya los ponía', () => {
    expect(CATEGORIA_DE_TICKET).toEqual({
      grocery: 'Supermercado',
      dining: 'Restaurante',
      fuel: 'Gasolina',
      pharmacy: 'Farmacia',
      home: 'Hogar y ferretería',
      other: 'Otros gastos',
    });
  });

  it('los recibos de Pagos, por su categoría; lo desconocido a «Otros gastos»', () => {
    expect(categoriaDePago('utilities')).toBe('Servicios Públicos');
    expect(categoriaDePago('insurance')).toBe('Seguros');
    expect(categoriaDePago('phone')).toBe('Internet y teléfono');
    expect(categoriaDePago('internet')).toBe('Internet y teléfono');
    expect(categoriaDePago('raro')).toBe('Otros gastos');
    expect(categoriaDePago(null)).toBe('Otros gastos');
  });
});

describe('gastoDeTicket', () => {
  const publix = {
    tripId: 'trip-1',
    kind: 'grocery',
    tripKind: 'grocery',
    amount: 20.675,
    date: '2026-10-06T16:00:00.000Z',
    storeName: ' Publix ',
  };

  it('un ticket de súper: su tienda, su importe y su día', () => {
    expect(gastoDeTicket(publix)).toEqual({
      ref: 'trip:trip-1:grocery',
      fecha: '2026-10-06',
      monto: 20.68,
      categoria: 'Supermercado',
      descripcion: 'Publix',
      notas: 'Desde Foody · Compras',
    });
  });

  it('el día es el de Miami: una compra de las 22:43 no cae en el siguiente', () => {
    // 02:43 UTC del 7 = 22:43 del 6 en Miami.
    expect(gastoDeTicket({ ...publix, date: '2026-09-07T02:43:00.000Z' }).fecha).toBe('2026-09-06');
  });

  it('la parte de farmacia de un ticket de súper es otro gasto, en Farmacia', () => {
    const g = gastoDeTicket({ ...publix, kind: 'pharmacy', amount: 21.94 });
    expect(g.ref).toBe('trip:trip-1:pharmacy');
    expect(g.categoria).toBe('Farmacia');
    expect(g.notas).toBe('Desde Foody · parte de un ticket de Súper');
  });

  it('sin tienda, el nombre del tipo', () => {
    expect(gastoDeTicket({ ...publix, kind: 'fuel', tripKind: 'fuel', storeName: null }).descripcion).toBe(
      'Gasolina y transporte',
    );
  });
});

describe('gastoDePago', () => {
  it('un recibo pagado: su nombre, lo que se pagó y el mes que cubre', () => {
    expect(
      gastoDePago({
        recordId: 'rec-1',
        paidAt: '2026-10-05T15:00:00.000Z',
        monto: 93.39,
        nombre: 'FPL',
        category: 'utilities',
        month: 10,
        year: 2026,
      }),
    ).toEqual({
      ref: 'payment:rec-1',
      fecha: '2026-10-05',
      monto: 93.39,
      categoria: 'Servicios Públicos',
      descripcion: 'FPL',
      notas: 'Desde Foody · Pagos · octubre 2026',
    });
  });
});

describe('huella', () => {
  const g = gastoDeTicket({ tripId: 't', kind: 'grocery', tripKind: 'grocery', amount: 10, date: '2026-10-06T16:00:00.000Z', storeName: 'X' });

  it('el mismo gasto da la misma huella', () => {
    expect(huella(g)).toBe(huella({ ...g }));
  });

  it('cambiar el importe, el día o la descripción cambia la huella', () => {
    expect(huella({ ...g, monto: 10.01 })).not.toBe(huella(g));
    expect(huella({ ...g, fecha: '2026-10-07' })).not.toBe(huella(g));
    expect(huella({ ...g, descripcion: 'Y' })).not.toBe(huella(g));
  });
});
