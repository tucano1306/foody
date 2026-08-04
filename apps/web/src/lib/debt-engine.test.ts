import { describe, it, expect } from 'vitest';
import {
  accrualCycles,
  accrueInterest,
  addMonths,
  allocatePayment,
  breakEvenPayment,
  buildDebtAdvice,
  buildPortfolio,
  buildSchedule,
  completedMonthlyCycles,
  frenchInstallment,
  installmentFor,
  minimumPayment,
  monthlyInterestOf,
  monthsToPayoff,
  projectDebt,
  round2,
  simulateExtra,
  toAnnualEffectiveRate,
  toDateKey,
  toMonthlyRate,
  type DebtInput,
  type PortfolioDebt,
} from './debt-engine';

// "Ahora" fijo para que las proyecciones con fecha sean deterministas.
const NOW = new Date(2026, 7, 4); // 4 de agosto de 2026

describe('toMonthlyRate', () => {
  it('toma la tasa mensual tal cual', () => {
    expect(toMonthlyRate(3, 'monthly')).toBeCloseTo(0.03, 10);
  });

  it('divide la anual nominal entre 12', () => {
    expect(toMonthlyRate(36, 'annual_nominal')).toBeCloseTo(0.03, 10);
  });

  it('desanualiza la efectiva con raíz doceava', () => {
    // Una TEA del 42.576 % equivale a 3 % mensual capitalizado.
    expect(toMonthlyRate(42.576089, 'annual_effective')).toBeCloseTo(0.03, 6);
  });

  it('trata la tasa 0 y las negativas como sin interés', () => {
    expect(toMonthlyRate(0, 'monthly')).toBe(0);
    expect(toMonthlyRate(-5, 'monthly')).toBe(0);
  });

  it('ignora valores no numéricos', () => {
    expect(toMonthlyRate(Number.NaN, 'monthly')).toBe(0);
  });
});

describe('toAnnualEffectiveRate', () => {
  it('capitaliza la mensual 12 veces', () => {
    // 3 % mensual NO es 36 % anual: es 42.58 %. Esa diferencia es el punto.
    expect(toAnnualEffectiveRate(0.03)).toBeCloseTo(0.4257609, 6);
  });

  it('devuelve 0 sin tasa', () => {
    expect(toAnnualEffectiveRate(0)).toBe(0);
  });
});

describe('frenchInstallment', () => {
  it('calcula la cuota fija clásica', () => {
    // 1000 al 3 % mensual a 12 meses → 100.47 (redondeo al alza al centavo)
    expect(frenchInstallment(1000, 0.03, 12)).toBe(100.47);
  });

  it('reparte linealmente cuando no hay interés', () => {
    expect(frenchInstallment(1200, 0, 12)).toBe(100);
  });

  it('devuelve 0 con plazo o capital inválidos', () => {
    expect(frenchInstallment(1000, 0.03, 0)).toBe(0);
    expect(frenchInstallment(0, 0.03, 12)).toBe(0);
    expect(frenchInstallment(-500, 0.03, 12)).toBe(0);
  });

  it('la cuota redondeada al alza liquida en el plazo exacto pactado', () => {
    for (const months of [6, 12, 24, 36, 48, 60]) {
      const cuota = frenchInstallment(1000, 0.03, months);
      expect(monthsToPayoff(1000, 0.03, cuota)).toBe(months);
    }
  });
});

describe('monthsToPayoff', () => {
  it('divide el saldo entre la cuota cuando no hay interés', () => {
    expect(monthsToPayoff(1000, 0, 100)).toBe(10);
  });

  it('redondea hacia arriba el mes incompleto', () => {
    expect(monthsToPayoff(1000, 0, 300)).toBe(4);
  });

  it('devuelve null cuando la cuota es menor que el interés', () => {
    // Saldo 1000 al 3 % → 30 de interés. Pagando 25 la deuda crece.
    expect(monthsToPayoff(1000, 0.03, 25)).toBeNull();
  });

  it('devuelve null cuando la cuota iguala exactamente el interés', () => {
    expect(monthsToPayoff(1000, 0.03, 30)).toBeNull();
  });

  it('sí termina cuando la cuota supera el interés aunque sea por un centavo', () => {
    const months = monthsToPayoff(1000, 0.03, 30.01);
    expect(months).not.toBeNull();
    expect(months).toBeLessThanOrEqual(600);
  });

  it('es 0 si ya no se debe nada', () => {
    expect(monthsToPayoff(0, 0.03, 100)).toBe(0);
  });

  it('devuelve null sin cuota', () => {
    expect(monthsToPayoff(1000, 0.03, 0)).toBeNull();
  });
});

describe('minimumPayment', () => {
  it('cobra el porcentaje del saldo', () => {
    expect(minimumPayment(1000, 0.03, 5)).toBe(50);
  });

  it('respeta el piso en dinero', () => {
    expect(minimumPayment(100, 0.03, 5, 25)).toBe(25);
  });

  it('nunca queda por debajo del interés del ciclo', () => {
    // 5 % de mínimo con 8 % de tasa: el mínimo sube hasta el interés.
    expect(minimumPayment(1000, 0.08, 5)).toBe(80);
  });

  it('no exige más de lo que realmente se debe', () => {
    // 200 % de 10 serían 20, pero con su interés solo se deben 10.30.
    expect(minimumPayment(10, 0.03, 200)).toBe(10.3);
  });

  it('es 0 sin saldo', () => {
    expect(minimumPayment(0, 0.03, 5)).toBe(0);
  });
});

describe('breakEvenPayment', () => {
  it('es el interés del ciclo más un centavo', () => {
    expect(breakEvenPayment(1000, 0.03)).toBe(30.01);
  });

  it('es 0 sin interés', () => {
    expect(breakEvenPayment(1000, 0)).toBe(0);
  });
});

describe('allocatePayment', () => {
  it('aplica la cascada comisiones → interés → capital', () => {
    const split = allocatePayment({
      balance: 1000,
      accruedInterest: 30,
      pendingFees: 10,
      payment: 200,
    });
    expect(split.fees).toBe(10);
    expect(split.interest).toBe(30);
    expect(split.principal).toBe(160);
    expect(split.remainingBalance).toBe(840);
    expect(split.touchedPrincipal).toBe(true);
    expect(split.overpayment).toBe(0);
  });

  it('no toca el capital si el pago solo cubre el interés', () => {
    const split = allocatePayment({ balance: 1000, accruedInterest: 30, payment: 30 });
    expect(split.interest).toBe(30);
    expect(split.principal).toBe(0);
    expect(split.touchedPrincipal).toBe(false);
    expect(split.remainingBalance).toBe(1000);
  });

  it('deja interés sin cubrir cuando el pago no alcanza', () => {
    const split = allocatePayment({ balance: 1000, accruedInterest: 30, payment: 20 });
    expect(split.interest).toBe(20);
    expect(split.unpaidInterest).toBe(10);
    expect(split.principal).toBe(0);
    // La deuda crece: el interés impago se queda encima del capital.
    expect(split.remainingBalance).toBe(1010);
  });

  it('separa el sobrepago cuando se paga de más', () => {
    const split = allocatePayment({ balance: 100, accruedInterest: 3, payment: 200 });
    expect(split.principal).toBe(100);
    expect(split.overpayment).toBe(97);
    expect(split.remainingBalance).toBe(0);
  });

  it('con pago 0 no mueve nada y acumula lo devengado', () => {
    const split = allocatePayment({ balance: 500, accruedInterest: 15, pendingFees: 5, payment: 0 });
    expect(split.principal).toBe(0);
    expect(split.remainingBalance).toBe(520);
  });

  it('ignora entradas negativas o inválidas', () => {
    const split = allocatePayment({ balance: -100, accruedInterest: Number.NaN, payment: 50 });
    expect(split.principal).toBe(0);
    expect(split.overpayment).toBe(50);
    expect(split.remainingBalance).toBe(0);
  });
});

describe('completedMonthlyCycles', () => {
  it('cuenta solo los ciclos cumplidos', () => {
    expect(completedMonthlyCycles(new Date(2026, 0, 15), new Date(2026, 2, 14))).toBe(1);
    expect(completedMonthlyCycles(new Date(2026, 0, 15), new Date(2026, 2, 15))).toBe(2);
  });

  it('es 0 si no pasó un mes completo', () => {
    expect(completedMonthlyCycles(new Date(2026, 0, 15), new Date(2026, 0, 31))).toBe(0);
  });

  it('es 0 si la fecha final es anterior', () => {
    expect(completedMonthlyCycles(new Date(2026, 5, 1), new Date(2026, 0, 1))).toBe(0);
  });

  it('se topa a 120 ciclos aunque pasen siglos', () => {
    expect(completedMonthlyCycles(new Date(1900, 0, 1), new Date(2026, 0, 1))).toBe(120);
  });
});

describe('addMonths', () => {
  it('recorta al último día cuando el mes destino es más corto', () => {
    // 31 de enero + 1 mes → 28 de febrero (2026 no es bisiesto)
    expect(toDateKey(addMonths(new Date(2026, 0, 31), 1))).toBe('2026-02-28');
  });

  it('cruza el año', () => {
    expect(toDateKey(addMonths(new Date(2026, 11, 15), 2))).toBe('2027-02-15');
  });
});

describe('accrueInterest', () => {
  it('capitaliza mes a mes (interés compuesto)', () => {
    const res = accrueInterest({
      balance: 1000,
      monthlyRate: 0.03,
      from: new Date(2026, 0, 1),
      to: new Date(2026, 3, 1), // 3 ciclos
    });
    expect(res.periods).toBe(3);
    // 1000 × 1.03³ = 1092.727
    expect(res.newBalance).toBe(1092.73);
    expect(res.interest).toBe(92.73);
  });

  it('no devenga nada si no cerró un ciclo', () => {
    const res = accrueInterest({
      balance: 1000,
      monthlyRate: 0.03,
      from: new Date(2026, 0, 1),
      to: new Date(2026, 0, 20),
    });
    expect(res.periods).toBe(0);
    expect(res.interest).toBe(0);
    expect(res.newBalance).toBe(1000);
  });

  it('no devenga sobre saldo cero', () => {
    const res = accrueInterest({
      balance: 0,
      monthlyRate: 0.03,
      from: new Date(2026, 0, 1),
      to: new Date(2027, 0, 1),
    });
    expect(res.interest).toBe(0);
  });

  it('avanza la marca de devengo justo hasta el último ciclo cerrado', () => {
    const res = accrueInterest({
      balance: 500,
      monthlyRate: 0.02,
      from: new Date(2026, 0, 10),
      to: new Date(2026, 2, 25),
    });
    expect(res.periods).toBe(2);
    expect(toDateKey(res.accruedThrough)).toBe('2026-03-10');
  });
});

describe('accrualCycles', () => {
  it('emite un movimiento por ciclo, capitalizando uno sobre otro', () => {
    const cycles = accrualCycles({
      balance: 1000,
      monthlyRate: 0.03,
      from: new Date(2026, 0, 15),
      to: new Date(2026, 3, 20), // 3 ciclos cerrados
    });
    expect(cycles).toHaveLength(3);
    expect(cycles.map((c) => c.periodKey)).toEqual(['2026-02', '2026-03', '2026-04']);
    expect(cycles[0].interest).toBe(30);
    expect(cycles[1].openingBalance).toBe(1030);
    expect(cycles[1].interest).toBe(30.9);
    expect(cycles.at(-1)?.closingBalance).toBeCloseTo(1092.73, 2);
  });

  it('la suma de los ciclos coincide con el devengo total', () => {
    const args = {
      balance: 2500,
      monthlyRate: 0.025,
      from: new Date(2026, 0, 1),
      to: new Date(2026, 6, 1),
    };
    const total = accrueInterest(args);
    const sum = accrualCycles(args).reduce((s, c) => s + c.interest, 0);
    expect(round2(sum)).toBeCloseTo(total.interest, 1);
  });

  it('las claves de período son únicas (la idempotencia depende de eso)', () => {
    const cycles = accrualCycles({
      balance: 1000,
      monthlyRate: 0.02,
      from: new Date(2026, 0, 31),
      to: new Date(2027, 0, 31),
    });
    expect(new Set(cycles.map((c) => c.periodKey)).size).toBe(cycles.length);
  });

  it('no devenga sin ciclos cerrados, sin saldo o sin tasa', () => {
    const from = new Date(2026, 0, 1);
    expect(accrualCycles({ balance: 1000, monthlyRate: 0.03, from, to: new Date(2026, 0, 20) })).toHaveLength(0);
    expect(accrualCycles({ balance: 0, monthlyRate: 0.03, from, to: new Date(2027, 0, 1) })).toHaveLength(0);
    expect(accrualCycles({ balance: 1000, monthlyRate: 0, from, to: new Date(2027, 0, 1) })).toHaveLength(0);
  });
});

describe('buildSchedule', () => {
  it('amortiza y cierra exactamente en el plazo pactado', () => {
    const cuota = frenchInstallment(1000, 0.03, 12);
    const schedule = buildSchedule({ balance: 1000, monthlyRate: 0.03, payment: cuota });
    expect(schedule.months).toBe(12);
    expect(schedule.rows).toHaveLength(12);
    expect(schedule.rows.at(-1)?.closingBalance).toBe(0);
  });

  it('la primera cuota es casi todo interés y la última casi todo capital', () => {
    const cuota = frenchInstallment(1000, 0.03, 12);
    const { rows } = buildSchedule({ balance: 1000, monthlyRate: 0.03, payment: cuota });
    const first = rows[0];
    const last = rows.at(-1);
    expect(first.interest).toBe(30);
    expect(first.principal).toBeCloseTo(70.47, 2);
    expect(last!.interest).toBeLessThan(first.interest);
    expect(last!.principal).toBeGreaterThan(first.principal);
  });

  it('la suma de capital devuelve el saldo original', () => {
    const cuota = frenchInstallment(2500, 0.025, 18);
    const { rows } = buildSchedule({ balance: 2500, monthlyRate: 0.025, payment: cuota });
    const capital = rows.reduce((s, r) => s + r.principal, 0);
    expect(round2(capital)).toBeCloseTo(2500, 1);
  });

  it('la última cuota se ajusta y nunca cobra de más', () => {
    const cuota = frenchInstallment(1000, 0.03, 12);
    const { rows } = buildSchedule({ balance: 1000, monthlyRate: 0.03, payment: cuota });
    expect(rows.at(-1)!.payment).toBeLessThanOrEqual(cuota);
  });

  it('devuelve tabla vacía y meses null cuando la cuota no amortiza', () => {
    const schedule = buildSchedule({ balance: 1000, monthlyRate: 0.03, payment: 25 });
    expect(schedule.rows).toHaveLength(0);
    expect(schedule.months).toBeNull();
  });

  it('sin saldo devuelve una tabla vacía liquidada', () => {
    const schedule = buildSchedule({ balance: 0, monthlyRate: 0.03, payment: 100 });
    expect(schedule.months).toBe(0);
    expect(schedule.totalInterest).toBe(0);
  });

  it('recorta las filas con limit pero conserva los totales reales', () => {
    const cuota = frenchInstallment(5000, 0.02, 36);
    const full = buildSchedule({ balance: 5000, monthlyRate: 0.02, payment: cuota });
    const capped = buildSchedule({ balance: 5000, monthlyRate: 0.02, payment: cuota, limit: 6 });
    expect(capped.rows).toHaveLength(6);
    expect(capped.truncated).toBe(true);
    expect(capped.totalInterest).toBe(full.totalInterest);
    expect(capped.months).toBe(full.months);
  });

  it('el abono extra acorta el plazo y abarata el interés', () => {
    const cuota = frenchInstallment(5000, 0.03, 36);
    const base = buildSchedule({ balance: 5000, monthlyRate: 0.03, payment: cuota });
    const boosted = buildSchedule({ balance: 5000, monthlyRate: 0.03, payment: cuota, extraMonthly: 100 });
    expect(boosted.months!).toBeLessThan(base.months!);
    expect(boosted.totalInterest).toBeLessThan(base.totalInterest);
  });

  it('fecha las filas a partir de la fecha de inicio', () => {
    const { rows } = buildSchedule({
      balance: 300,
      monthlyRate: 0,
      payment: 100,
      startDate: new Date(2026, 0, 31),
    });
    expect(rows[0].date).toBe('2026-01-31');
    expect(rows[1].date).toBe('2026-02-28');
  });
});

describe('installmentFor', () => {
  const base: DebtInput = { balance: 1000, rate: 3, ratePeriod: 'monthly', strategy: 'custom' };

  it('cuota fija: calcula la francesa con el plazo', () => {
    expect(installmentFor({ ...base, strategy: 'fixed_installment', termMonths: 12 })).toBe(100.47);
  });

  it('cuota fija: la cuota pactada por el usuario manda sobre la calculada', () => {
    expect(
      installmentFor({ ...base, strategy: 'fixed_installment', termMonths: 12, customPayment: 120 }),
    ).toBe(120);
  });

  it('mínimo: porcentaje del saldo', () => {
    expect(installmentFor({ ...base, strategy: 'minimum', minPercent: 5 })).toBe(50);
  });

  it('solo intereses: exactamente el interés del ciclo', () => {
    expect(installmentFor({ ...base, strategy: 'interest_only' })).toBe(30);
  });

  it('personalizada: lo que eligió el usuario', () => {
    expect(installmentFor({ ...base, strategy: 'custom', customPayment: 250 })).toBe(250);
  });

  it('sin saldo no hay cuota', () => {
    expect(installmentFor({ ...base, balance: 0, customPayment: 250 })).toBe(0);
  });
});

describe('projectDebt', () => {
  it('proyecta un crédito a cuota fija de punta a punta', () => {
    const p = projectDebt({
      balance: 1000,
      rate: 3,
      ratePeriod: 'monthly',
      strategy: 'fixed_installment',
      termMonths: 12,
      now: NOW,
    });
    expect(p.installment).toBe(100.47);
    expect(p.monthlyInterest).toBe(30);
    expect(p.firstSplit).toEqual({ interest: 30, principal: 70.47 });
    expect(p.monthsToPayoff).toBe(12);
    // Primera cuota hoy → la última cae 11 meses después.
    expect(p.payoffDate).toBe('2027-07-04');
    expect(p.neverPaysOff).toBe(false);
    expect(p.totalInterest).toBeGreaterThan(0);
    expect(p.interestShare).toBeGreaterThan(0);
  });

  it('marca "nunca" cuando la estrategia es solo intereses', () => {
    const p = projectDebt({
      balance: 1000,
      rate: 3,
      ratePeriod: 'monthly',
      strategy: 'interest_only',
      now: NOW,
    });
    expect(p.installment).toBe(30);
    expect(p.neverPaysOff).toBe(true);
    expect(p.monthsToPayoff).toBeNull();
    expect(p.payoffDate).toBeNull();
    expect(p.status).toBe('never');
    expect(p.breakEven).toBe(30.01);
    expect(p.firstSplit.principal).toBe(0);
  });

  it('un extra voluntario saca del "solo intereses": manda el dinero, no la etiqueta', () => {
    const p = projectDebt({
      balance: 1000,
      rate: 3,
      ratePeriod: 'monthly',
      strategy: 'interest_only',
      extraMonthly: 100,
      now: NOW,
    });
    expect(p.installment).toBe(130);
    expect(p.neverPaysOff).toBe(false);
    expect(p.monthsToPayoff).not.toBeNull();
    expect(p.firstSplit.principal).toBe(100);
  });

  it('detecta la trampa del pago mínimo cuando la tasa supera el porcentaje', () => {
    const p = projectDebt({
      balance: 2000,
      rate: 8,
      ratePeriod: 'monthly',
      strategy: 'minimum',
      minPercent: 5,
      now: NOW,
    });
    expect(p.neverPaysOff).toBe(true);
    expect(p.status).toBe('never');
  });

  it('con pago mínimo sano sí liquida, pero lento y caro', () => {
    const p = projectDebt({
      balance: 3000,
      rate: 2,
      ratePeriod: 'monthly',
      strategy: 'minimum',
      minPercent: 5,
      now: NOW,
    });
    expect(p.neverPaysOff).toBe(false);
    expect(p.monthsToPayoff).toBeGreaterThan(12);
  });

  it('sin interés todo el abono va a capital', () => {
    const p = projectDebt({
      balance: 1200,
      rate: 0,
      ratePeriod: 'monthly',
      strategy: 'custom',
      customPayment: 100,
      now: NOW,
    });
    expect(p.monthlyInterest).toBe(0);
    expect(p.firstSplit).toEqual({ interest: 0, principal: 100 });
    expect(p.monthsToPayoff).toBe(12);
    expect(p.totalInterest).toBe(0);
    expect(p.interestShare).toBe(0);
    expect(p.status).toBe('healthy');
  });

  it('una deuda liquidada queda en estado pagado', () => {
    const p = projectDebt({
      balance: 0,
      rate: 3,
      ratePeriod: 'monthly',
      strategy: 'custom',
      customPayment: 100,
      now: NOW,
    });
    expect(p.status).toBe('paid');
    expect(p.installment).toBe(0);
    expect(p.monthsToPayoff).toBe(0);
  });

  it('el abono extra se suma a la cuota de la estrategia', () => {
    const p = projectDebt({
      balance: 1000,
      rate: 3,
      ratePeriod: 'monthly',
      strategy: 'fixed_installment',
      termMonths: 12,
      extraMonthly: 50,
      now: NOW,
    });
    expect(p.baseInstallment).toBe(100.47);
    expect(p.installment).toBe(150.47);
    expect(p.monthsToPayoff!).toBeLessThan(12);
  });

  it('la anual efectiva refleja el costo real de la tarjeta', () => {
    const p = projectDebt({
      balance: 1000,
      rate: 3,
      ratePeriod: 'monthly',
      strategy: 'custom',
      customPayment: 200,
      now: NOW,
    });
    expect(p.annualEffectiveRate).toBeCloseTo(0.4257609, 6);
  });
});

describe('simulateExtra', () => {
  const input: DebtInput = {
    balance: 5000,
    rate: 3,
    ratePeriod: 'monthly',
    strategy: 'fixed_installment',
    termMonths: 36,
    now: NOW,
  };

  it('acorta el plazo y ahorra intereses', () => {
    const sim = simulateExtra(input, 100);
    expect(sim.monthsSaved).toBeGreaterThan(0);
    expect(sim.interestSaved).toBeGreaterThan(0);
    expect(sim.newMonths!).toBeLessThan(36);
  });

  it('sin extra no cambia nada', () => {
    const sim = simulateExtra(input, 0);
    expect(sim.monthsSaved).toBe(0);
    expect(sim.interestSaved).toBe(0);
  });

  it('avisa cuando el extra rompe la trampa de solo intereses', () => {
    const trap: DebtInput = {
      balance: 1000,
      rate: 3,
      ratePeriod: 'monthly',
      strategy: 'interest_only',
      now: NOW,
    };
    const sim = simulateExtra(trap, 100);
    expect(sim.breaksTheTrap).toBe(true);
    expect(sim.newMonths).not.toBeNull();
  });
});

describe('buildPortfolio', () => {
  const debts: PortfolioDebt[] = [
    {
      id: 'card',
      name: 'Tarjeta',
      balance: 2000,
      monthlyRate: 0.05,
      installment: 150,
      monthlyInterest: 100,
      monthsToPayoff: 20,
      neverPaysOff: false,
      status: 'slow',
    },
    {
      id: 'loan',
      name: 'Crédito',
      balance: 8000,
      monthlyRate: 0.02,
      installment: 400,
      monthlyInterest: 160,
      monthsToPayoff: 24,
      neverPaysOff: false,
      status: 'healthy',
    },
    {
      id: 'store',
      name: 'Tienda',
      balance: 500,
      monthlyRate: 0.06,
      installment: 30,
      monthlyInterest: 30,
      monthsToPayoff: null,
      neverPaysOff: true,
      status: 'never',
    },
  ];

  it('suma saldo, interés y compromiso mensual', () => {
    const p = buildPortfolio(debts, NOW);
    expect(p.totalBalance).toBe(10500);
    expect(p.totalMonthlyInterest).toBe(290);
    expect(p.totalMonthlyCommitment).toBe(580);
  });

  it('avalancha ataca primero la tasa más alta', () => {
    expect(buildPortfolio(debts, NOW).avalanche.map((d) => d.id)).toEqual(['store', 'card', 'loan']);
  });

  it('bola de nieve ataca primero el saldo más chico', () => {
    expect(buildPortfolio(debts, NOW).snowball.map((d) => d.id)).toEqual(['store', 'card', 'loan']);
  });

  it('señala la deuda que más intereses genera al mes', () => {
    expect(buildPortfolio(debts, NOW).costliest?.id).toBe('loan');
  });

  it('lista las deudas estancadas y no promete fecha de libertad', () => {
    const p = buildPortfolio(debts, NOW);
    expect(p.stuck.map((d) => d.id)).toEqual(['store']);
    expect(p.freeDate).toBeNull();
  });

  it('da fecha de libertad cuando todas se liquidan', () => {
    const healthy = debts.filter((d) => !d.neverPaysOff);
    const p = buildPortfolio(healthy, NOW);
    expect(p.freeDate).toBe('2028-07-04'); // 24 meses: la última cuota cae 23 meses después
  });

  it('aguanta la cartera vacía', () => {
    const p = buildPortfolio([], NOW);
    expect(p.totalBalance).toBe(0);
    expect(p.costliest).toBeNull();
    expect(p.freeDate).toBeNull();
  });
});

describe('buildDebtAdvice', () => {
  const debt = { name: 'Visa', balance: 1000, currency: 'USD' };

  it('celebra la deuda liquidada y no da más consejos', () => {
    const p = projectDebt({ balance: 0, rate: 3, ratePeriod: 'monthly', strategy: 'custom', now: NOW });
    const advice = buildDebtAdvice({ ...debt, balance: 0 }, p);
    expect(advice).toHaveLength(1);
    expect(advice[0].id).toBe('paid');
  });

  it('avisa en crítico cuando la deuda no termina nunca', () => {
    const p = projectDebt({ balance: 1000, rate: 3, ratePeriod: 'monthly', strategy: 'interest_only', now: NOW });
    const advice = buildDebtAdvice(debt, p);
    const never = advice.find((a) => a.id === 'never');
    expect(never?.tone).toBe('critical');
    expect(never?.suggestedPayment).toBe(30.01);
    expect(never?.body).toContain('congelado');
  });

  it('dice que el saldo SUBE cuando el abono no cubre el interés', () => {
    const p = projectDebt({
      balance: 1000, rate: 3, ratePeriod: 'monthly', strategy: 'custom', customPayment: 20, now: NOW,
    });
    expect(buildDebtAdvice(debt, p).find((a) => a.id === 'never')?.body).toContain('SUBE');
  });

  it('anuncia la fecha de libertad cuando sí se liquida', () => {
    const p = projectDebt({
      balance: 1000, rate: 3, ratePeriod: 'monthly', strategy: 'fixed_installment', termMonths: 12, now: NOW,
    });
    expect(buildDebtAdvice(debt, p).find((a) => a.id === 'payoff')?.title).toContain('1 año');
  });
});

describe('monthlyInterestOf', () => {
  it('es saldo × tasa', () => {
    expect(monthlyInterestOf(1000, 0.03)).toBe(30);
  });

  it('es 0 sin saldo o sin tasa', () => {
    expect(monthlyInterestOf(0, 0.03)).toBe(0);
    expect(monthlyInterestOf(1000, 0)).toBe(0);
  });
});
