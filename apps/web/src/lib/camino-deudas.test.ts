import { describe, expect, it } from 'vitest';
import { caminoDeDeudas, type DeudaParaCamino } from './camino-deudas';

const AHORA = new Date(2026, 9, 26); // 26 oct 2026, hora local

function d(over: Partial<DeudaParaCamino> & { id: string }): DeudaParaCamino {
  return {
    nombre: over.id,
    grupo: null,
    nombreGrupo: null,
    saldo: 1000,
    capitalPagado: 0,
    referencia: 1000,
    meses: 12,
    nuncaTermina: false,
    ...over,
  };
}

describe('caminoDeDeudas', () => {
  it('el avance es el capital pagado contra la referencia de todas', () => {
    const c = caminoDeDeudas(
      [
        d({ id: 'gmc', saldo: 6000, capitalPagado: 4000, referencia: 10000 }),
        d({ id: 'visa', saldo: 1500, capitalPagado: 500, referencia: 2000 }),
      ],
      AHORA,
    );
    expect(c.pagado).toBe(4500);
    expect(c.referencia).toBe(12000);
    expect(c.porcentaje).toBe(37.5);
  });

  it('una deuda ya saldada cuenta en el avance pero no tiene fila', () => {
    const c = caminoDeDeudas(
      [d({ id: 'saldada', saldo: 0, capitalPagado: 800, referencia: 800 }), d({ id: 'viva' })],
      AHORA,
    );
    expect(c.pagado).toBe(800);
    expect(c.filas.map((f) => f.clave)).toEqual(['viva']);
  });

  it('las filas van de la que antes termina a la que más tarda; las que no terminan, al final', () => {
    const c = caminoDeDeudas(
      [
        d({ id: 'larga', meses: 40 }),
        d({ id: 'eterna', meses: null, nuncaTermina: true }),
        d({ id: 'corta', meses: 3 }),
      ],
      AHORA,
    );
    expect(c.filas.map((f) => f.clave)).toEqual(['corta', 'larga', 'eterna']);
    expect(c.mesesMax).toBe(40);
    expect(c.filas[2]).toMatchObject({ atascada: true, fin: null, meses: null });
  });

  it('la fecha de fin es la del mes de la última cuota, como la de la cartera', () => {
    const c = caminoDeDeudas([d({ id: 'a', meses: 1 }), d({ id: 'b', meses: 5 })], AHORA);
    expect(c.filas[0].fin).toBe('2026-10-26');
    expect(c.filas[1].fin).toBe('2027-02-26');
  });

  it('los tramos de una tarjeta son una fila: suma su saldo y acaba con el último', () => {
    const c = caminoDeDeudas(
      [
        d({ id: 'compras', grupo: 'bofa', nombreGrupo: 'BofA ···3650', saldo: 2000, meses: 18 }),
        d({ id: 'promo', grupo: 'bofa', nombreGrupo: 'BofA ···3650', saldo: 1014, meses: 4 }),
        d({ id: 'gmc', saldo: 9000, meses: 30 }),
      ],
      AHORA,
    );
    expect(c.filas).toHaveLength(2);
    expect(c.filas[0]).toMatchObject({ nombre: 'BofA ···3650', saldo: 3014, meses: 18, abrir: 'compras' });
  });

  it('un tramo que nunca termina deja atascada a toda la tarjeta', () => {
    const c = caminoDeDeudas(
      [
        d({ id: 'a', grupo: 'g', nombreGrupo: 'Tarjeta', meses: 5 }),
        d({ id: 'b', grupo: 'g', nombreGrupo: 'Tarjeta', meses: null, nuncaTermina: true }),
      ],
      AHORA,
    );
    expect(c.filas[0].atascada).toBe(true);
  });

  it('sin referencia no hay porcentaje, y nunca pasa de 100', () => {
    expect(caminoDeDeudas([d({ id: 'x', referencia: 0, capitalPagado: 0 })], AHORA).porcentaje).toBe(0);
    expect(caminoDeDeudas([d({ id: 'x', referencia: 100, capitalPagado: 150 })], AHORA).porcentaje).toBe(100);
  });
});
