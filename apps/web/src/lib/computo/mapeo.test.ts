import { describe, expect, it } from 'vitest';
import {
  categoriaDePago,
  CATEGORIA_DE_TICKET,
  destinoDeRef,
  gastoDePago,
  gastoDeTicket,
  gastosDePago,
  gastosDeTicket,
  huella,
  repartirPorNegocio,
} from './mapeo';

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
      destino: 'personal',
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
      destino: 'personal',
    });
  });
});

/**
 * Lo de negocio no entra en la empresa personal. Los tres pagos de Venecoro
 * (GMC, Cable insurance, Permiso Larry's) están al 100 % de negocio en Foody.
 */
describe('reparto entre lo personal y lo de negocio', () => {
  const gmc = {
    recordId: 'rec-gmc',
    paidAt: '2026-10-14T13:00:00.000Z',
    monto: 1097,
    nombre: 'GMC',
    category: 'other',
    month: 10,
    year: 2026,
  };

  it('sin parte de negocio es el mismo gasto, personal y con su ref de siempre', () => {
    expect(gastosDePago(gmc)).toEqual([gastoDePago(gmc)]);
    expect(gastosDePago({ ...gmc, businessShare: 0 })).toEqual([gastoDePago(gmc)]);
  });

  it('al 100 % va entero a negocio, con «:negocio» en la ref', () => {
    expect(gastosDePago({ ...gmc, businessShare: 100 })).toEqual([
      { ...gastoDePago(gmc), ref: 'payment:rec-gmc:negocio', destino: 'negocio' },
    ]);
  });

  it('un gasto mixto son dos que suman exactamente el original', () => {
    const partes = gastosDePago({ ...gmc, nombre: 'Verizon', monto: 120.62, businessShare: 25 });
    expect(partes.map((p) => [p.ref, p.monto, p.destino])).toEqual([
      ['payment:rec-gmc', 90.46, 'personal'],
      ['payment:rec-gmc:negocio', 30.16, 'negocio'],
    ]);
    expect(partes[0].monto + partes[1].monto).toBeCloseTo(120.62, 10);
    expect(partes[0].notas).toBe('Desde Foody · Pagos · octubre 2026 · parte personal (75 %)');
    expect(partes[1].notas).toBe('Desde Foody · Pagos · octubre 2026 · parte de negocio (25 %)');
  });

  it('un ticket también se reparte, tramo a tramo', () => {
    const depot = { tripId: 't9', kind: 'home', tripKind: 'home', amount: 64.2, date: '2026-10-10T16:00:00.000Z', storeName: 'Home Depot', businessShare: 100 };
    expect(gastosDeTicket(depot).map((g) => [g.ref, g.destino])).toEqual([['trip:t9:home:negocio', 'negocio']]);
  });

  it('un porcentaje fuera de rango no inventa dinero', () => {
    expect(repartirPorNegocio(gastoDePago(gmc), 140).map((g) => [g.monto, g.destino])).toEqual([[1097, 'negocio']]);
    expect(repartirPorNegocio(gastoDePago(gmc), -5).map((g) => [g.monto, g.destino])).toEqual([[1097, 'personal']]);
    expect(repartirPorNegocio(gastoDePago(gmc), Number.NaN).map((g) => g.destino)).toEqual(['personal']);
  });

  it('el destino se lee de la ref', () => {
    expect(destinoDeRef('payment:rec-gmc:negocio')).toBe('negocio');
    expect(destinoDeRef('trip:t1:grocery')).toBe('personal');
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

  it('cambiar de empresa también la cambia', () => {
    expect(huella({ ...g, destino: 'negocio' })).not.toBe(huella(g));
  });
});
