import { describe, expect, it } from 'vitest';
import { avisoDePromo, hitoDeAvisoPromo, mensajeAvisoPromo } from './debt-promo';

/**
 * El aviso de un 0 % que se acaba: cuándo sale en pantalla, cuándo se manda
 * notificación y con qué cifras. Un saldo de $10,000 que al acabar el 0 %
 * pasaría al 24 %: $200 de interés al mes.
 */
const DEUDA = { currentBalance: 10000, promoEndsOn: '2027-01-25', rateAfterPromo: 24 };

/** La fecha que queda a `n` días del fin (negativo: después). */
function aDias(n: number): string {
  const d = new Date(Date.UTC(2027, 0, 25 - n));
  return d.toISOString().slice(0, 10);
}

describe('avisoDePromo', () => {
  it('a 90 días sale en pantalla, con lo que costaría lo que queda', () => {
    expect(avisoDePromo(DEUDA, aDias(90))).toEqual({
      fase: 'antes',
      dias: 90,
      fin: '2027-01-25',
      cobraDesde: '2027-01-26',
      saldo: 10000,
      apr: 24,
      interesMes: 200,
    });
  });

  it('a 91 días todavía no: un aviso que está siempre deja de leerse', () => {
    expect(avisoDePromo(DEUDA, aDias(91))).toBeNull();
  });

  it('el último día al 0 % sigue siendo «antes»', () => {
    expect(avisoDePromo(DEUDA, '2027-01-25')).toMatchObject({ fase: 'antes', dias: 0 });
  });

  it('el día siguiente ya cobra: «después»', () => {
    expect(avisoDePromo(DEUDA, '2027-01-26')).toMatchObject({ fase: 'despues', dias: 1, interesMes: 200 });
  });

  it('tras 60 días del fin deja de decirlo: ya es una deuda con interés más', () => {
    expect(avisoDePromo(DEUDA, aDias(-60))).not.toBeNull();
    expect(avisoDePromo(DEUDA, aDias(-61))).toBeNull();
  });

  it('el interés sigue al saldo de hoy: si baja, el aviso baja', () => {
    expect(avisoDePromo({ ...DEUDA, currentBalance: 2500 }, aDias(30))?.interesMes).toBe(50);
  });

  it('sin saldo, sin promoción o con 0 % también después: nada que avisar', () => {
    expect(avisoDePromo({ ...DEUDA, currentBalance: 0 }, aDias(30))).toBeNull();
    expect(avisoDePromo({ ...DEUDA, promoEndsOn: null }, aDias(30))).toBeNull();
    expect(avisoDePromo({ ...DEUDA, rateAfterPromo: null }, aDias(30))).toBeNull();
    expect(avisoDePromo({ ...DEUDA, rateAfterPromo: 0 }, aDias(30))).toBeNull();
  });

  it('el día en que empieza a cobrar cruza bien el fin de año', () => {
    expect(avisoDePromo({ ...DEUDA, promoEndsOn: '2026-12-31' }, '2026-12-01')?.cobraDesde).toBe('2027-01-01');
  });
});

describe('hitoDeAvisoPromo: cuándo se manda notificación', () => {
  const hito = (n: number) => hitoDeAvisoPromo(avisoDePromo(DEUDA, aDias(n)));

  it('en pantalla desde los 90 días, pero la primera notificación es a los 60', () => {
    expect(hito(61)).toBeNull();
    expect(hito(60)).toBe('60');
  });

  it('por umbral: si el cron no corre el día justo, sale al siguiente', () => {
    expect(hito(59)).toBe('60');
    expect(hito(30)).toBe('30');
    expect(hito(8)).toBe('30');
    expect(hito(7)).toBe('7');
    expect(hito(2)).toBe('7');
    expect(hito(1)).toBe('1');
    expect(hito(0)).toBe('1');
  });

  it('después del fin, uno durante el primer mes y ya', () => {
    expect(hito(-1)).toBe('fin');
    expect(hito(-30)).toBe('fin');
    expect(hito(-31)).toBeNull();
  });
});

describe('mensajeAvisoPromo', () => {
  it('antes: cuánto queda y qué costará al mes', () => {
    const aviso = avisoDePromo(DEUDA, aDias(30))!;
    expect(mensajeAvisoPromo('Adelanto  0 %', aviso)).toEqual({
      title: '⏳ El 0 % de Adelanto 0 % se acaba en 30 días',
      body: 'Quedan $10,000.00. Si siguen ahí el 25 ene 2027, desde el día siguiente cobrará ~$200.00 al mes (24 %).',
    });
  });

  it('el último día se dice «hoy», la víspera «mañana»', () => {
    expect(mensajeAvisoPromo('Adelanto', avisoDePromo(DEUDA, aDias(0))!).title).toBe('⏳ Adelanto: el 0 % se acaba hoy');
    expect(mensajeAvisoPromo('Adelanto', avisoDePromo(DEUDA, aDias(1))!).title).toBe('⏳ Adelanto: el 0 % se acaba mañana');
  });

  it('después: ya cobra, y cuánto', () => {
    const aviso = avisoDePromo(DEUDA, aDias(-3))!;
    expect(mensajeAvisoPromo('Adelanto', aviso)).toEqual({
      title: '💸 Adelanto ya cobra interés',
      body: 'El 0 % terminó el 25 ene 2027. Con $10,000.00 pendientes son ~$200.00 al mes (24 %).',
    });
  });
});
