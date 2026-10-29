import { describe, expect, it } from 'vitest';
import { agendaDePagos, cuandoVence, type PagoParaAgenda } from './agenda-pagos';

const AHORA = new Date('2026-10-13T15:00:00.000Z');

function p(id: string, dias: number, amount: number, over: Partial<PagoParaAgenda> = {}) {
  return {
    id,
    name: id,
    category: 'other',
    isPaidThisMonth: false,
    daysUntilDue: dias,
    snoozedUntil: null,
    amount,
    ...over,
  };
}

const importe = (x: { amount: number }) => x.amount;

describe('agendaDePagos', () => {
  it('separa lo vencido de lo que viene y lo ordena por fecha', () => {
    const a = agendaDePagos(
      [p('luz', 5, 80), p('gmc', 1, 1097), p('permiso', -12, 600), p('renta', 20, 2000), p('cable', -3, 45)],
      importe,
      AHORA,
    );
    expect(a.vencidos.map((e) => e.id)).toEqual(['permiso', 'cable']);
    expect(a.proximos.map((e) => e.id)).toEqual(['gmc', 'luz']);
    expect(a.totalVencidos).toBe(645);
    expect(a.totalProximos).toBe(1177);
  });

  it('lo pagado este mes no sale, ni vencido ni próximo', () => {
    const a = agendaDePagos([p('gmc', 1, 1097, { isPaidThisMonth: true })], importe, AHORA);
    expect(a.proximos).toEqual([]);
  });

  it('lo pospuesto no sale mientras dure el aplazamiento', () => {
    const pospuesto = p('cable', -3, 45, { snoozedUntil: '2026-10-20T00:00:00.000Z' });
    expect(agendaDePagos([pospuesto], importe, AHORA).vencidos).toEqual([]);
    const caducado = p('cable', -3, 45, { snoozedUntil: '2026-10-01T00:00:00.000Z' });
    expect(agendaDePagos([caducado], importe, AHORA).vencidos).toHaveLength(1);
  });

  it('el día límite entra; el siguiente, no', () => {
    const a = agendaDePagos([p('a', 7, 1), p('b', 8, 1), p('c', 0, 1)], importe, AHORA);
    expect(a.proximos.map((e) => e.id)).toEqual(['c', 'a']);
  });

  it('suma la parte del ámbito, no el pago entero', () => {
    const a = agendaDePagos([p('movil', 2, 130)], (x) => x.amount * 0.6, AHORA);
    expect(a.totalProximos).toBe(78);
  });
});

describe('cuandoVence', () => {
  it('en palabras', () => {
    expect(cuandoVence(0)).toBe('hoy');
    expect(cuandoVence(1)).toBe('mañana');
    expect(cuandoVence(4)).toBe('en 4 días');
    expect(cuandoVence(-1)).toBe('ayer');
    expect(cuandoVence(-9)).toBe('hace 9 días');
  });
});

/**
 * Un seguro de $515 cada seis meses no es un pago del mes, pero el dinero se
 * prepara con tiempo: entra en «Se acercan» un mes antes de vencer.
 */
describe('agendaDePagos — recibos de cada varios meses', () => {
  const seguro = (dias: number, over: Partial<PagoParaAgenda> = {}) =>
    p('geico', dias, 515, { frequency: 'semiannual', isPaidThisMonth: true, ...over });

  it('un mes antes de vencer entra en «Se acercan», aunque esté «al día»', () => {
    const a = agendaDePagos([seguro(28)], importe, AHORA);
    expect(a.seAcercan.map((e) => e.id)).toEqual(['geico']);
    expect(a.totalSeAcercan).toBe(515);
    expect(a.proximos).toEqual([]);
  });

  it('a más de un mes, todavía no', () => {
    expect(agendaDePagos([seguro(45)], importe, AHORA).seAcercan).toEqual([]);
  });

  it('ya pagado en su ciclo, el siguiente está a meses y no sale', () => {
    expect(agendaDePagos([seguro(176)], importe, AHORA).seAcercan).toEqual([]);
  });

  it('vencido y sin pagar sale en vencidos, como cualquier otro', () => {
    const a = agendaDePagos([seguro(-3, { isPaidThisMonth: false })], importe, AHORA);
    expect(a.vencidos.map((e) => e.id)).toEqual(['geico']);
    expect(a.seAcercan).toEqual([]);
  });

  it('un mensual a 20 días no entra: los mensuales siguen con su semana', () => {
    expect(agendaDePagos([p('luz', 20, 80)], importe, AHORA).seAcercan).toEqual([]);
  });
});
