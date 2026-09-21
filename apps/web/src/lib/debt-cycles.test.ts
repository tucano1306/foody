import { describe, expect, it } from 'vitest';
import type { DebtMovement } from './debt-data';
import {
  listPeriods,
  nextPeriod,
  periodContaining,
  previousPeriod,
  summarizePeriod,
} from './debt-cycles';

/** Un movimiento del libro mayor, con lo mínimo que mira este módulo. */
function mov(over: Partial<DebtMovement> & { occurredAt: string }): DebtMovement {
  return {
    id: over.occurredAt + (over.kind ?? 'charge'),
    debtId: 'd1',
    kind: 'charge',
    amount: 0,
    interestPart: 0,
    principalPart: 0,
    feesPart: 0,
    balanceBefore: 0,
    balanceAfter: 0,
    paymentMethod: null,
    periodKey: null,
    note: null,
    ...over,
  };
}

/** Fecha local, sin la sorpresa de que un ISO con Z cambie de día. */
function local(y: number, m: number, d: number, h = 12): Date {
  return new Date(y, m - 1, d, h, 0, 0, 0);
}

function iso(y: number, m: number, d: number, h = 12): string {
  return local(y, m, d, h).toISOString();
}

describe('periodContaining — sin día de corte', () => {
  it('cae en el mes natural completo', () => {
    const p = periodContaining(local(2026, 9, 20), null, local(2026, 9, 20));
    expect(p.byStatement).toBe(false);
    expect(p.start.getDate()).toBe(1);
    expect(p.start.getMonth()).toBe(8);
    expect(p.end.getDate()).toBe(30);
    expect(p.label).toBe('septiembre 2026');
    expect(p.isCurrent).toBe(true);
  });

  it('febrero se cierra donde acaba febrero', () => {
    const p = periodContaining(local(2027, 2, 10), null, local(2027, 2, 10));
    expect(p.end.getDate()).toBe(28);
  });
});

describe('periodContaining — con día de corte', () => {
  it('el ciclo va del día siguiente al corte anterior hasta el corte', () => {
    const p = periodContaining(local(2026, 9, 20), 14, local(2026, 9, 20));
    expect(p.byStatement).toBe(true);
    expect([p.start.getDate(), p.start.getMonth()]).toEqual([15, 8]); // 15 sep
    expect([p.end.getDate(), p.end.getMonth()]).toEqual([14, 9]);     // 14 oct
    expect(p.label).toBe('15 sep – 14 oct 2026');
  });

  it('el propio día de corte cierra su estado, no abre el siguiente', () => {
    const corte = periodContaining(local(2026, 10, 14), 14, local(2026, 10, 14));
    expect([corte.end.getDate(), corte.end.getMonth()]).toEqual([14, 9]);

    const diaSiguiente = periodContaining(local(2026, 10, 15), 14, local(2026, 10, 15));
    expect([diaSiguiente.end.getDate(), diaSiguiente.end.getMonth()]).toEqual([14, 10]);
  });

  it('un corte el 31 se recorta al último día de los meses cortos', () => {
    // Ciclo que cierra en febrero de 2027 (28 días): del 1 al 28.
    const p = periodContaining(local(2027, 2, 10), 31, local(2027, 2, 10));
    expect([p.end.getDate(), p.end.getMonth()]).toEqual([28, 1]);
    expect([p.start.getDate(), p.start.getMonth()]).toEqual([1, 1]); // 31 ene + 1 día
  });

  it('cruza el fin de año sin perderse', () => {
    const p = periodContaining(local(2026, 12, 25), 20, local(2026, 12, 25));
    expect([p.start.getDate(), p.start.getMonth(), p.start.getFullYear()]).toEqual([21, 11, 2026]);
    expect([p.end.getDate(), p.end.getMonth(), p.end.getFullYear()]).toEqual([20, 0, 2027]);
    // Al cruzar el año, el año de salida también se dice: si no, «21 dic – 20 ene
    // 2027» se lee como si el ciclo durase trece meses.
    expect(p.label).toBe('21 dic 2026 – 20 ene 2027');
  });

  it('isCurrent solo lo lleva el ciclo que contiene hoy', () => {
    const hoy = local(2026, 9, 20);
    expect(periodContaining(hoy, 14, hoy).isCurrent).toBe(true);
    expect(periodContaining(local(2026, 8, 20), 14, hoy).isCurrent).toBe(false);
  });
});

describe('encadenado de periodos', () => {
  it('el anterior acaba justo antes de que empiece este — sin huecos ni solapes', () => {
    for (const corte of [null, 1, 14, 28, 31]) {
      let p = periodContaining(local(2027, 3, 5), corte, local(2027, 3, 5));
      for (let i = 0; i < 14; i++) {
        const anterior = previousPeriod(p, corte, local(2027, 3, 5));
        expect(anterior.end.getTime()).toBe(p.start.getTime() - 1);
        p = anterior;
      }
    }
  });

  it('ir y volver deja el mismo periodo', () => {
    const hoy = local(2026, 9, 20);
    const p = periodContaining(hoy, 14, hoy);
    expect(nextPeriod(previousPeriod(p, 14, hoy), 14, hoy).key).toBe(p.key);
  });
});

describe('summarizePeriod', () => {
  const hoy = local(2026, 10, 3);
  const periodo = periodContaining(hoy, 14, hoy); // 15 sep – 14 oct 2026

  const movimientos = [
    mov({ occurredAt: iso(2026, 9, 20), kind: 'charge', amount: 25 }),
    mov({ occurredAt: iso(2026, 9, 21), kind: 'charge', amount: 11 }),
    mov({ occurredAt: iso(2026, 9, 30), kind: 'interest', amount: 30.5 }),
    mov({ occurredAt: iso(2026, 10, 1), kind: 'fee', amount: 5 }),
    mov({ occurredAt: iso(2026, 10, 2), kind: 'payment', amount: 50, principalPart: 20, balanceAfter: 1990 }),
    mov({ occurredAt: iso(2026, 10, 3), kind: 'adjustment', amount: -10, balanceAfter: 1980 }),
    // Fuera del ciclo: es del anterior (cerró el 14 sep).
    mov({ occurredAt: iso(2026, 9, 10), kind: 'charge', amount: 999 }),
  ];

  it('solo suma lo que cae dentro del ciclo', () => {
    const s = summarizePeriod(movimientos, periodo, 2000);
    expect(s.movements).toHaveLength(6);
    expect(s.charges).toBe(36);
    expect(s.interest).toBe(30.5);
    expect(s.fees).toBe(5);
    expect(s.payments).toBe(50);
    expect(s.principalPaid).toBe(20);
    expect(s.adjustments).toBe(-10);
    expect(s.net).toBe(11.5); // 36 + 30.5 + 5 − 10 − 50
  });

  it('ordena del más reciente al más antiguo', () => {
    const s = summarizePeriod(movimientos, periodo, 2000);
    expect(s.movements[0].kind).toBe('adjustment');
    expect(s.movements.at(-1)?.kind).toBe('charge');
  });

  it('en el ciclo en curso el saldo al cierre es el de hoy', () => {
    const s = summarizePeriod(movimientos, periodo, 2009.38);
    expect(s.period.isCurrent).toBe(true);
    expect(s.closingBalance).toBe(2009.38);
  });

  it('en un ciclo cerrado lo lee del último movimiento', () => {
    const cerrado = previousPeriod(periodo, 14, hoy); // 15 ago – 14 sep
    const s = summarizePeriod(movimientos, cerrado, 2009.38);
    expect(s.period.isCurrent).toBe(false);
    expect(s.movements).toHaveLength(1);
    expect(s.closingBalance).toBe(0); // balanceAfter del consumo del 10 sep
  });

  it('un ciclo sin movimientos no inventa saldo', () => {
    const viejo = periodContaining(local(2025, 1, 5), 14, hoy);
    const s = summarizePeriod(movimientos, viejo, 2009.38);
    expect(s.movements).toHaveLength(0);
    expect(s.closingBalance).toBeNull();
    expect(s.net).toBe(0);
  });
});

describe('listPeriods', () => {
  const hoy = local(2026, 10, 3);

  it('siempre incluye el ciclo en curso, aunque esté vacío', () => {
    const periodos = listPeriods([], 14, hoy);
    expect(periodos).toHaveLength(1);
    expect(periodos[0].isCurrent).toBe(true);
  });

  it('llega hasta el ciclo del movimiento más antiguo, sin saltarse los vacíos', () => {
    const periodos = listPeriods(
      [mov({ occurredAt: iso(2026, 7, 2), kind: 'charge', amount: 10 })],
      14,
      hoy,
    );
    // Ciclos que cierran el 14 de jul, ago, sep y oct.
    expect(periodos).toHaveLength(4);
    expect(periodos[0].isCurrent).toBe(true);
    expect(periodos.at(-1)?.start.getMonth()).toBe(5); // 15 jun
  });

  it('no se desboca con una fecha absurda', () => {
    const periodos = listPeriods(
      [mov({ occurredAt: iso(1990, 1, 1), kind: 'charge', amount: 10 })],
      14,
      hoy,
      12,
    );
    expect(periodos).toHaveLength(12);
  });
});
