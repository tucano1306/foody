import { describe, expect, it } from 'vitest';
import type { DebtMovement } from './debt-data';
import { periodContaining, summarizePeriod } from './debt-cycles';
import { additiveMinimumPayment, projectDebt } from './debt-engine';

/**
 * El estado de cuenta real de la Cash Rewards 8523 (Bank of America), del
 * 11 de agosto al 10 de septiembre de 2026.
 *
 * Es la prueba contra el papel del banco, no contra otra función de la app:
 *
 *   Saldo Anterior                     $2,126.94
 *   Pagos y Otros Créditos            −$1,375.00
 *   Compras y Ajustes                  $1,354.97
 *   Cargos Cobrados                        $0.00
 *   Intereses Cobrados                    $32.66
 *   Nuevo Saldo Total                  $2,139.57
 *   Fecha de Cierre del Estado        09/10/2026
 *   Días del Ciclo de Facturación             31
 *   Saldo Sujeto a las Tasas de Interés $2,080.04  (APR 18,49 % en compras)
 *   Pago Mínimo Total Adeudado            $53.00
 *   Fecha de Vencimiento de Pago      10/07/2026
 *
 * Y su cuadro de advertencia, que es la mejor prueba del mínimo:
 *
 *   Pagando solo el mínimo  →  9 años  →  $4,042.00 en total
 *   Pagando $78.00 al mes   →  36 meses →  $2,808.00 (ahorro $1,234.00)
 */
const APERTURA = 2126.94;
const CIERRE = 2139.57;
const TASA = 18.49;

function mov(
  y: number,
  m: number,
  d: number,
  amount: number,
  kind: DebtMovement['kind'] = 'charge',
  note: string | null = null,
): DebtMovement {
  return {
    id: `${y}-${m}-${d}-${amount}-${kind}`,
    debtId: 'd8523',
    kind,
    amount: Math.abs(amount),
    interestPart: 0,
    principalPart: kind === 'payment' ? Math.abs(amount) : 0,
    feesPart: 0,
    balanceBefore: 0,
    balanceAfter: 0,
    paymentMethod: null,
    periodKey: null,
    note,
    occurredAt: new Date(y, m - 1, d, 12).toISOString(),
  };
}

/** Los pagos del estado, tal cual: suman los −$1,375.00 exactos. */
const PAGOS: DebtMovement[] = [
  mov(2026, 8, 11, 55, 'payment'),
  mov(2026, 8, 18, 150, 'payment'),
  mov(2026, 8, 25, 150, 'payment'),
  mov(2026, 8, 29, 880, 'payment'),
  mov(2026, 9, 4, 40, 'payment'),
  mov(2026, 9, 6, 100, 'payment'),
];

/**
 * Las compras del estado, por fecha de transacción.
 *
 * Lo legible de la captura suma $1,350.97 y el estado dice $1,354.97: hay una
 * línea cuyo importe no se pudo leer. Los $4.00 que faltan van como una compra
 * más el 6 de septiembre — manda el total del banco, no mi lectura.
 */
const COMPRAS: DebtMovement[] = [
  mov(2026, 8, 23, 53.89, 'charge', 'WM Supercenter 3236'),
  mov(2026, 8, 23, 20.00, 'charge', 'Anthropic Claude'),
  mov(2026, 8, 23, 20.31, 'charge', 'Publix 871'),
  mov(2026, 8, 26, 12.00, 'charge', 'Marathon'),
  mov(2026, 8, 27, 830.07, 'charge', 'Unishippers'),
  mov(2026, 8, 28, 10.00, 'charge', 'Citiblb'),
  mov(2026, 8, 29, 56.38, 'charge', 'Amazon'),
  mov(2026, 9, 1, 25.29, 'charge', 'Publix 669'),
  mov(2026, 9, 2, 76.47, 'charge', 'Amazon'),
  mov(2026, 9, 2, 35.71, 'charge', 'Publix 669'),
  mov(2026, 9, 4, 16.00, 'charge', 'Chipotle'),
  mov(2026, 9, 4, 39.00, 'charge', 'Exxon 7 Eleven'),
  mov(2026, 9, 5, 127.04, 'charge', 'WM Supercenter 4826'),
  mov(2026, 9, 5, 8.55, 'charge', 'Ross Store'),
  mov(2026, 9, 6, 20.26, 'charge', 'Publix 871'),
  mov(2026, 9, 6, 4.00, 'charge', 'Línea ilegible de la captura'),
];

/** El interés se carga el día del cierre, como en el papel. */
const INTERES = mov(2026, 9, 10, 32.66, 'interest', 'Interés cargado por compras');

/**
 * El libro mayor equivalente, con las fotos del saldo ya encadenadas —que es
 * como lo deja el servidor (`resnapshotLedger`).
 */
const LIBRO: DebtMovement[] = (() => {
  const todos = [...PAGOS, ...COMPRAS, INTERES].sort(
    (a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime(),
  );
  let saldo = APERTURA;
  return todos.map((m) => {
    const antes = saldo;
    saldo = Math.round((m.kind === 'payment' ? antes - m.amount : antes + m.amount) * 100) / 100;
    return { ...m, balanceBefore: antes, balanceAfter: saldo };
  });
})();

const HOY = new Date(2026, 8, 20, 12); // 20 sep: el ciclo del estado ya cerró

describe('Cash Rewards 8523 — contra el estado de cuenta de Bank of America', () => {
  const periodo = periodContaining(new Date(2026, 8, 1), 10, HOY);

  it('el ciclo que calcula la app es el que imprime el banco', () => {
    expect(periodo.label).toBe('11 ago – 10 sep 2026');
    expect(periodo.isCurrent).toBe(false);
  });

  it('cuenta los 31 días del ciclo de facturación', () => {
    const s = summarizePeriod(LIBRO, periodo, CIERRE, TASA, HOY);
    expect(s.days).toBe(31);
  });

  it('cuadra la cuenta entera del estado, línea por línea', () => {
    const s = summarizePeriod(LIBRO, periodo, CIERRE, TASA, HOY);
    expect(s.openingBalance).toBe(2126.94);   // Saldo Anterior
    expect(s.payments).toBe(1375);            // Pagos y Otros Créditos
    expect(s.charges).toBe(1354.97);          // Compras y Ajustes
    expect(s.fees).toBe(0);                   // Cargos Cobrados
    expect(s.interest).toBe(32.66);           // Intereses Cobrados
    expect(s.closingBalance).toBe(2139.57);   // Nuevo Saldo Total

    // Y la suma cierra: anterior − pagos + compras + intereses = nuevo saldo.
    expect(Math.round(((s.openingBalance ?? 0) + s.net) * 100) / 100).toBe(2139.57);
  });

  it('el interés NO sale del saldo final, sino del promedio diario', () => {
    const s = summarizePeriod(LIBRO, periodo, CIERRE, TASA, HOY);

    // Sobre el saldo final se cobrarían $33.60: casi un dólar de más. La
    // diferencia es haber abonado $1,375 a mitad de ciclo — justo lo que el
    // promedio diario recoge y el saldo final no.
    const sobreElFinal = 2139.57 * (TASA / 100 / 365) * 31;
    expect(sobreElFinal).toBeGreaterThan(33.5);

    // El banco cobró $32.66 sobre un saldo sujeto a interés de $2,080.04.
    // La app llega a $2,057.45 y $32.31 con las fechas de TRANSACCIÓN; el
    // banco usa las de REGISTRO, uno o dos días después, así que queda ~1 %
    // por debajo. Es una comprobación del estado, no un sustituto.
    expect(s.averageDailyBalance).toBeCloseTo(2057.45, 2);
    expect(Math.abs((s.estimatedInterest ?? 0) - 32.66)).toBeLessThan(0.5);
  });

  it('el pago mínimo sale clavado: $53.00, no $35', () => {
    const s = summarizePeriod(LIBRO, periodo, CIERRE, TASA, HOY, { percent: 1, floor: 35 });

    // 1 % de $2,106.94 (saldo al corte menos el interés cobrado) = $21.07,
    // más los $32.66 de intereses = $53.73, truncado al dólar por el banco.
    expect(s.statementMinimum).toBe(53);
  });

  it('el mínimo del ciclo en curso no se inventa: todavía no hay estado', () => {
    const enCurso = periodContaining(HOY, 10, HOY);
    const s = summarizePeriod(LIBRO, enCurso, CIERRE, TASA, HOY, { percent: 1, floor: 35 });
    expect(s.period.isCurrent).toBe(true);
    expect(s.statementMinimum).toBeNull();
  });

  it('con el modelo de máximo el mínimo se queda en $35 — dieciocho dólares corto', () => {
    // El motor viejo compara el % con el interés en vez de sumarlos; sobre
    // este mismo saldo da el piso y nada más. Por eso hizo falta el aditivo.
    const conSuma = additiveMinimumPayment(2106.91, 32.66, 1, 35);
    const comparando = Math.max(2139.57 * 0.01, 35, 32.66);
    expect(conSuma).toBe(53);
    expect(Math.round(comparando)).toBe(35);
  });

  it('proyecta los nueve años que el propio banco advierte', () => {
    // El cuadro del estado: pagando solo el mínimo se liquida en ~9 años con
    // ~$4,042 pagados. Solo sale si el mínimo se RECALCULA cada mes; con la
    // cuota de hoy congelada el plazo se acorta y el total se abarata.
    const p = projectDebt({
      balance: CIERRE,
      rate: TASA,
      ratePeriod: 'annual_nominal',
      strategy: 'minimum',
      minPercent: 1,
      minFloor: 35,
      minIncludesInterest: true,
      dueDay: 7,
      now: HOY,
    });

    expect(p.monthsToPayoff).not.toBeNull();
    const anos = (p.monthsToPayoff ?? 0) / 12;
    expect(anos).toBeGreaterThan(8);
    expect(anos).toBeLessThan(10);
    // El banco dice $4,042.00 «estimado»; la app llega a menos de un 3 % de ahí.
    expect(Math.abs(p.totalPaid - 4042)).toBeLessThan(120);
  });

  it('a $78 al mes cuadra con el otro renglón del cuadro: 36 meses', () => {
    const p = projectDebt({
      balance: CIERRE,
      rate: TASA,
      ratePeriod: 'annual_nominal',
      strategy: 'custom',
      customPayment: 78,
      dueDay: 7,
      now: HOY,
    });
    expect(p.monthsToPayoff).toBe(36);
    // El estado dice $2,808.00 (36 × $78); la app ajusta la última cuota al
    // saldo exacto, así que da unos dólares menos.
    expect(Math.abs(p.totalPaid - 2808)).toBeLessThan(10);
  });

  it('el ciclo siguiente arranca donde cerró este, con su saldo', () => {
    const siguiente = periodContaining(HOY, 10, HOY);
    expect(siguiente.label).toBe('11 sep – 10 oct 2026');
    expect(siguiente.isCurrent).toBe(true);

    const s = summarizePeriod(LIBRO, siguiente, CIERRE, TASA, HOY);
    expect(s.openingBalance).toBe(2139.57); // hereda el cierre del anterior
    expect(s.movements).toHaveLength(0);
    expect(s.closingBalance).toBe(2139.57);
  });
});
