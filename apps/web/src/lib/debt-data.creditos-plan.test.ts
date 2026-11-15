import { describe, expect, it, vi } from 'vitest';

/**
 * El Plan necesita de cada crédito dos datos más: el mínimo que pide el banco
 * y el día en que vence. Los dos salen de columnas de `debts` que la consulta
 * tiene que PEDIR. Un SELECT que olvida una columna la lee como `undefined`, y
 * el mapeo cae a un valor por defecto sin avisar: así salieron mensuales los
 * recibos semestrales. Por eso el `sql` falso hace lo que hace Postgres y
 * devuelve SOLO las columnas que nombra el SELECT.
 */
const datos = vi.hoisted(() => ({
  deudas: [
    {
      id: 'd-cero',
      user_id: 'u1',
      status: 'active',
      name: 'Tarjeta al 0 %',
      current_balance: '9000.00',
      rate: '0',
      rate_period: 'annual_nominal',
      strategy: 'by_date',
      term_months: null,
      payoff_date: '2027-01-25',
      custom_payment: null,
      min_percent: null,
      min_floor: null,
      min_includes_interest: false,
      extra_monthly: '0',
      business_share: '0',
      promo_ends_on: '2027-01-25',
      rate_after_promo: '24.99',
      cycle_days: null,
      due_day: 22,
      linked_payment_id: null,
      duplicate_dismissed: false,
      issuer: 'Bank of America',
      card_group: null,
      kind: 'credit_card',
      account_last4: '0000',
      currency: 'USD',
      promo_kind: 'cero',
      deferred_interest: null,
      opened_at: '2026-06-01T00:00:00.000Z',
    },
  ] as Record<string, unknown>[],
}));

vi.mock('@/lib/db', () => {
  const sql = (strings: TemplateStringsArray) => {
    const texto = strings.join('?');
    const select = texto.match(/SELECT\s+([\s\S]+?)\s+FROM\s+debts\b/i);
    if (select) {
      const columnas = select[1].split(',').map((c) => c.trim());
      if (columnas.includes('*')) return Promise.resolve(datos.deudas);
      return Promise.resolve(
        datos.deudas.map((fila) => Object.fromEntries(columnas.map((c) => [c, fila[c]]))),
      );
    }
    return Promise.resolve([]);
  };
  return { sql };
});

const { listCreditsForPlan } = await import('./debt-data');

describe('listCreditsForPlan — lo que el Plan necesita de cada crédito', () => {
  // 15 de noviembre: hasta el 25 de enero caben tres cuotas.
  const hoy = new Date(2026, 10, 15, 12);

  it('trae el mínimo del banco aparte de la cuota del plan', async () => {
    const [c] = await listCreditsForPlan('u1', hoy);
    // El plan abona lo que hace falta para llegar a cero a tiempo: $9,000 en
    // tres cuotas. Bank of America (1 % + intereses, piso de $35) pide $90.
    expect(c.installment).toBe(3000);
    expect(c.minimumPayment).toBe(90);
  });

  it('trae el día de vencimiento y lo que hace falta para avisar del fin del 0 %', async () => {
    const [c] = await listCreditsForPlan('u1', hoy);
    expect(c.dueDay).toBe(22);
    expect(c.promoEndsOn).toBe('2027-01-25');
    expect(c.rateAfterPromo).toBe(24.99);
    expect(c.promoKind).toBe('cero');
  });

  it('no deja salir los campos con los que se calculó el mínimo', async () => {
    const [c] = await listCreditsForPlan('u1', hoy);
    expect(c).not.toHaveProperty('strategy');
    expect(c).not.toHaveProperty('minPercent');
    expect(c).not.toHaveProperty('minFloor');
    expect(c).not.toHaveProperty('minIncludesInterest');
  });
});
