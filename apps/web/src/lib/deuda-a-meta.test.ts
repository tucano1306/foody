import { describe, expect, it } from 'vitest';
import { EMOJI_DE_DEUDA, fechaQueProponeLaDeuda, metaDesdeDeuda, proponerMetas, resumenEnMetas, type DeudaParaMeta } from './deuda-a-meta';
import { KIND_META } from '@/components/debts/debt-ui';
import { buildFinancePlan, goalWithDebt, type FinanceGoal } from './finance-engine';

/**
 * Los tres tramos reales de la Bank of America ···3650 el 7 nov 2026, como los
 * enseña Deudas: el 0 % hasta el 25 ene 2027 y dos saldos al 23.99 %.
 */
const HOY = '2026-11-07';

function deuda(over: Partial<DeudaParaMeta> = {}): DeudaParaMeta {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    name: 'Unlimited Cash 3650',
    kind: 'credit_card',
    status: 'active',
    currentBalance: 11_286,
    originalAmount: 11_440,
    promoEndsOn: '2027-01-25',
    promoKind: 'cero',
    projection: { payoffDate: '2028-03-01', neverPaysOff: false },
    ...over,
  };
}

const compras = deuda({
  id: '22222222-2222-4222-8222-222222222222',
  name: 'Compras 3650',
  currentBalance: 652.04,
  originalAmount: 1026.54,
  promoEndsOn: null,
  projection: { payoffDate: '2027-06-01', neverPaysOff: false },
});

const saldoNuevo = deuda({
  id: '33333333-3333-4333-8333-333333333333',
  name: 'Saldo nuevo 3650',
  currentBalance: 553.4,
  originalAmount: 0,
  promoEndsOn: null,
  projection: { payoffDate: null, neverPaysOff: true },
});

describe('metaDesdeDeuda — la deuda propone su propia meta', () => {
  it('el 0 % vivo pone la fecha: liquidarla antes de que acabe', () => {
    const p = metaDesdeDeuda(deuda(), HOY);
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    expect(p.meta.targetDate).toBe('2027-01-25');
    expect(p.meta.porQue).toBe('promo');
    expect(p.meta.note).toContain('25 ene 2027');
    expect(p.meta.note).toContain('0 %');
  });

  it('las cifras son las mismas que leerá el Plan con goalWithDebt', () => {
    const p = metaDesdeDeuda(deuda(), HOY);
    if (!p.ok) throw new Error('debía proponer');
    const plan = goalWithDebt(
      { ...metaBase(), debtId: p.meta.debtId },
      { originalAmount: 11_440, currentBalance: 11_286 },
    );
    expect(p.meta.targetAmount).toBe(plan.targetAmount);
    expect(p.meta.savedAmount).toBe(plan.savedAmount);
    expect(p.meta.targetAmount).toBe(11_440);
    expect(p.meta.savedAmount).toBe(154);
    expect(p.meta.falta).toBe(11_286);
  });

  it('el último día del 0 % todavía es promoción', () => {
    const p = metaDesdeDeuda(deuda({ promoEndsOn: HOY }), HOY);
    expect(p.ok && p.meta.porQue).toBe('promo');
  });

  it('un 0 % ya vencido no manda: la fecha es la del ritmo de la cuota', () => {
    const p = metaDesdeDeuda(deuda({ promoEndsOn: '2026-11-06' }), HOY);
    expect(p.ok && p.meta.porQue).toBe('ritmo');
    expect(p.ok && p.meta.targetDate).toBe('2028-03-01');
    expect(p.ok && p.meta.note).toContain('mar 2028');
  });

  it('el interés diferido lo dice, porque ahí quedarse corto cuesta todo el periodo', () => {
    const p = metaDesdeDeuda(deuda({ promoKind: 'diferido' }), HOY);
    expect(p.ok && p.meta.note).toContain('interés diferido');
  });

  it('sin promoción, la fecha es cuándo termina a la cuota de hoy', () => {
    const p = metaDesdeDeuda(compras, HOY);
    if (!p.ok) throw new Error('debía proponer');
    expect(p.meta.porQue).toBe('ritmo');
    expect(p.meta.targetDate).toBe('2027-06-01');
    expect(p.meta.targetAmount).toBe(1026.54);
    expect(p.meta.savedAmount).toBe(374.5);
  });

  it('una deuda que nunca termina no inventa fecha', () => {
    const p = metaDesdeDeuda(saldoNuevo, HOY);
    if (!p.ok) throw new Error('debía proponer');
    expect(p.meta.targetDate).toBeNull();
    expect(p.meta.porQue).toBe('sin_fecha');
    expect(p.meta.note).toContain('no termina nunca');
  });

  it('sin lo que se debía al abrirla, el objetivo es el saldo y no se inventa lo pagado', () => {
    const p = metaDesdeDeuda(saldoNuevo, HOY);
    expect(p.ok && p.meta.targetAmount).toBe(553.4);
    expect(p.ok && p.meta.savedAmount).toBe(0);
  });

  it('una fecha de fin ya pasada (proyección vieja) cae a sin fecha', () => {
    const p = metaDesdeDeuda(compras, '2027-07-01');
    expect(p.ok && p.meta.porQue).toBe('sin_fecha');
    expect(p.ok && p.meta.targetDate).toBeNull();
  });

  it('una deuda pagada no es meta de nada', () => {
    expect(metaDesdeDeuda(deuda({ currentBalance: 0 }), HOY)).toEqual({
      ok: false, debtId: deuda().id, motivo: 'pagada',
    });
    expect(metaDesdeDeuda(deuda({ currentBalance: 0.004 }), HOY).ok).toBe(false);
    expect(metaDesdeDeuda(deuda({ status: 'paid_off' }), HOY).ok).toBe(false);
  });

  it('un saldo corrupto no se convierte en una meta de NaN', () => {
    const p = metaDesdeDeuda(deuda({ currentBalance: Number.NaN }), HOY);
    expect(p).toMatchObject({ ok: false, motivo: 'pagada' });
  });

  it('archivada no se ofrece', () => {
    expect(metaDesdeDeuda(deuda({ status: 'archived' }), HOY)).toMatchObject({ ok: false, motivo: 'archivada' });
  });

  it('una deuda que ya persigue una meta no se duplica', () => {
    const p = metaDesdeDeuda(deuda(), HOY, new Set([deuda().id]));
    expect(p).toMatchObject({ ok: false, motivo: 'ya_en_metas' });
  });

  it('el emoji es el del tipo de deuda', () => {
    expect(metaDesdeDeuda(deuda({ kind: 'auto' }), HOY)).toMatchObject({ ok: true, meta: { emoji: '🚗' } });
  });

  it('un nombre largo se recorta al máximo de la columna, y uno vacío no queda vacío', () => {
    const largo = metaDesdeDeuda(deuda({ name: 'x'.repeat(300) }), HOY);
    expect(largo.ok && largo.meta.name.length).toBe(160);
    const vacio = metaDesdeDeuda(deuda({ name: '   ' }), HOY);
    expect(vacio.ok && vacio.meta.name).toBe('Deuda');
  });

  it('el mapa de emojis no se separa del que usa la pantalla de Deudas', () => {
    for (const [kind, meta] of Object.entries(KIND_META)) {
      expect(EMOJI_DE_DEUDA[kind as keyof typeof EMOJI_DE_DEUDA]).toBe(meta.emoji);
    }
  });
});

describe('proponerMetas — la tarjeta entera, tramo a tramo', () => {
  it('la 3650: el 0 % primero, luego por fecha, la que nunca termina al final', () => {
    const { metas, omitidas } = proponerMetas(
      [saldoNuevo.id, compras.id, deuda().id],
      [deuda(), compras, saldoNuevo],
      HOY,
    );
    expect(omitidas).toEqual([]);
    expect(metas.map((m) => m.name)).toEqual(['Unlimited Cash 3650', 'Compras 3650', 'Saldo nuevo 3650']);
  });

  it('un id repetido cuenta una vez', () => {
    const { metas } = proponerMetas([compras.id, compras.id], [compras], HOY);
    expect(metas).toHaveLength(1);
  });

  it('una deuda que no es del usuario (o no existe) nunca se convierte', () => {
    const ajena = '99999999-9999-4999-8999-999999999999';
    const { metas, omitidas } = proponerMetas([ajena, compras.id], [compras], HOY);
    expect(metas).toHaveLength(1);
    expect(omitidas).toEqual([{ debtId: ajena, motivo: 'no_encontrada' }]);
  });

  it('mezcla: la que ya está en Metas se salta y las demás se crean', () => {
    const { metas, omitidas } = proponerMetas(
      [deuda().id, compras.id],
      [deuda(), compras],
      HOY,
      new Set([deuda().id]),
    );
    expect(metas.map((m) => m.debtId)).toEqual([compras.id]);
    expect(omitidas).toEqual([{ debtId: deuda().id, motivo: 'ya_en_metas' }]);
  });

  it('a igual fecha, primero la que más debe', () => {
    const a = deuda({ id: 'a', promoEndsOn: null, currentBalance: 100, projection: { payoffDate: '2027-05-01', neverPaysOff: false } });
    const b = deuda({ id: 'b', promoEndsOn: null, currentBalance: 900, projection: { payoffDate: '2027-05-01', neverPaysOff: false } });
    expect(proponerMetas(['a', 'b'], [a, b], HOY).metas.map((m) => m.debtId)).toEqual(['b', 'a']);
  });
});

describe('la meta creada entra en el Plan sin pedir dinero que ya tiene dueño', () => {
  it('enganchada a una tarjeta del plan, se paga con la cuota de esa tarjeta', () => {
    const p = metaDesdeDeuda(compras, HOY);
    if (!p.ok) throw new Error('debía proponer');
    const goal: FinanceGoal = {
      ...metaBase(),
      id: 'g',
      name: p.meta.name,
      emoji: p.meta.emoji,
      targetAmount: p.meta.targetAmount,
      savedAmount: p.meta.savedAmount,
      targetDate: p.meta.targetDate,
      debtId: p.meta.debtId,
    };
    const plan = buildFinancePlan({
      incomes: [{ id: 'i', name: 'Sueldo', amount: 3000, frequency: 'monthly', isActive: true, note: null }],
      goals: [goal],
      fixedPayments: [],
      credits: [{
        id: compras.id, name: compras.name, balance: 652.04, installment: 110,
        monthlyInterest: 13, monthsToPayoff: 7, neverPaysOff: false,
      }],
      groceriesMonthly: 0,
      groceriesSource: 'limit',
      groceriesSpentThisMonth: 0,
      now: new Date(2026, 10, 7, 12),
    });
    const [g] = plan.goals;
    expect(g.cuotaTarjeta).toBe(110);
    // Nada sale del dinero libre hacia esta meta: su cuota ya está restada.
    expect(plan.cashFlow.allocatedToGoals).toBe(0);
  });
});

function metaBase(): FinanceGoal {
  return {
    id: '', name: '', emoji: '', kind: 'debt', targetAmount: 0, savedAmount: 0,
    targetDate: null, priority: 1, monthlyOverride: null, status: 'active', note: null, createdAt: '',
  };
}

describe('resumenEnMetas — qué dice el menú', () => {
  it('nada en Metas: las tres por pasar', () => {
    expect(resumenEnMetas([deuda(), compras, saldoNuevo], HOY, new Set())).toEqual({ porPasar: 3, yaEnMetas: 0 });
  });

  it('una ya en Metas: quedan dos', () => {
    expect(resumenEnMetas([deuda(), compras, saldoNuevo], HOY, new Set([compras.id]))).toEqual({
      porPasar: 2, yaEnMetas: 1,
    });
  });

  it('una pagada no cuenta en ningún lado', () => {
    expect(resumenEnMetas([deuda({ currentBalance: 0 }), compras], HOY, new Set([compras.id]))).toEqual({
      porPasar: 0, yaEnMetas: 1,
    });
  });
});

/**
 * La fecha que la deuda propone se calcula igual al crear la meta que en cada
 * carga del Plan: por eso está sola y se prueba sola.
 */
describe('fechaQueProponeLaDeuda — la fecha se mueve con la deuda', () => {
  const HOY_ = '2026-11-13';

  it('con el 0 % vigente manda el fin de la promoción, diga lo que diga la cuota', () => {
    expect(
      fechaQueProponeLaDeuda({ promoEndsOn: '2027-01-25', payoffDate: '2058-01-13', neverPaysOff: false }, HOY_),
    ).toEqual({ fecha: '2027-01-25', porQue: 'promo' });
  });

  it('el último día del 0 % todavía cuenta', () => {
    expect(
      fechaQueProponeLaDeuda({ promoEndsOn: HOY_, payoffDate: '2027-05-13', neverPaysOff: false }, HOY_).porQue,
    ).toBe('promo');
  });

  it('con la promoción caducada, cuándo termina a la cuota de hoy', () => {
    expect(
      fechaQueProponeLaDeuda({ promoEndsOn: '2026-10-25', payoffDate: '2027-03-13', neverPaysOff: false }, HOY_),
    ).toEqual({ fecha: '2027-03-13', porQue: 'ritmo' });
  });

  it('un abono acerca la fecha: la misma deuda, con menos saldo, termina antes', () => {
    const antes = fechaQueProponeLaDeuda({ promoEndsOn: null, payoffDate: '2027-03-13', neverPaysOff: false }, HOY_);
    const despues = fechaQueProponeLaDeuda({ promoEndsOn: null, payoffDate: '2026-12-13', neverPaysOff: false }, HOY_);
    expect([antes.fecha, despues.fecha]).toEqual(['2027-03-13', '2026-12-13']);
  });

  it('si la cuota no la termina nunca, sin fecha: inventar una escondería el problema', () => {
    expect(
      fechaQueProponeLaDeuda({ promoEndsOn: null, payoffDate: null, neverPaysOff: true }, HOY_),
    ).toEqual({ fecha: null, porQue: 'sin_fecha' });
  });

  it('propone lo mismo que al crear la meta', () => {
    const d = deuda();
    const creada = metaDesdeDeuda(d, HOY);
    if (!creada.ok) throw new Error('esperaba una meta');
    expect(
      fechaQueProponeLaDeuda(
        { promoEndsOn: d.promoEndsOn, payoffDate: d.projection.payoffDate, neverPaysOff: d.projection.neverPaysOff },
        HOY,
      ).fecha,
    ).toBe(creada.meta.targetDate);
  });
});
