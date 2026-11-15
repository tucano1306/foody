import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * El Plan contaba los recibos cada varios meses como si fueran mensuales.
 *
 * No era el cálculo: `monthlyCost` y los atrasos por frecuencia estaban bien
 * escritos y probados. Era la CONSULTA, que no pedía `frequency` ni
 * `anchor_month`; el mapeo los leía como `undefined` y caía a «mensual». Un
 * seguro semestral pagado a tiempo salía cada mes entero en pagos fijos y,
 * pasado su día, como pago atrasado en el consejero.
 *
 * Por eso el `sql` falso hace lo que hace Postgres: devuelve SOLO las columnas
 * que nombra el SELECT. Si la consulta vuelve a olvidar una columna que el
 * mapeo lee, esta prueba lo nota.
 */
const datos = vi.hoisted(() => ({
  pagos: [
    {
      id: 'p-seguro',
      name: 'Seguro del coche',
      amount: '120.00',
      due_day: 10,
      frequency: 'semiannual',
      anchor_month: 3,
      created_at: '2026-01-05T00:00:00.000Z',
      business_share: '0',
    },
    {
      id: 'p-luz',
      name: 'Luz',
      amount: '60.00',
      due_day: 10,
      frequency: 'monthly',
      anchor_month: null,
      created_at: '2026-01-05T00:00:00.000Z',
      business_share: '0',
    },
  ] as Record<string, unknown>[],
  registros: [
    // El seguro, en su mes: marzo.
    { payment_id: 'p-seguro', month: 3, year: 2026, amount: '120.00', actual_amount: null, paid_at: '2026-03-09T00:00:00.000Z' },
    // La luz, de enero a marzo; abril todavía no.
    { payment_id: 'p-luz', month: 1, year: 2026, amount: '60.00', actual_amount: null, paid_at: '2026-01-09T00:00:00.000Z' },
    { payment_id: 'p-luz', month: 2, year: 2026, amount: '60.00', actual_amount: null, paid_at: '2026-02-09T00:00:00.000Z' },
    { payment_id: 'p-luz', month: 3, year: 2026, amount: '60.00', actual_amount: null, paid_at: '2026-03-09T00:00:00.000Z' },
  ] as Record<string, unknown>[],
}));

vi.mock('@/lib/db', () => {
  const sql = (strings: TemplateStringsArray) => {
    const texto = strings.join('?');
    const select = texto.match(/SELECT\s+([\s\S]+?)\s+FROM\s+monthly_payments/i);
    if (select) {
      const columnas = select[1].split(',').map((c) => c.trim());
      if (columnas.includes('*')) return Promise.resolve(datos.pagos);
      return Promise.resolve(
        datos.pagos.map((fila) => Object.fromEntries(columnas.map((c) => [c, fila[c]]))),
      );
    }
    if (/FROM\s+payment_records/i.test(texto)) return Promise.resolve(datos.registros);
    return Promise.resolve([]);
  };
  return { sql };
});

const { loadFixedPayments } = await import('./finance-data');

describe('loadFixedPayments — los recibos cada varios meses', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // 15 de abril: el día 10 ya pasó, así que la luz de abril está vencida.
    vi.setSystemTime(new Date('2026-04-15T12:00:00'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('un semestral resta su parte del mes, no el cobro entero', async () => {
    const pagos = await loadFixedPayments('u1');
    const seguro = pagos.find((p) => p.id === 'p-seguro');

    expect(seguro?.amount).toBe(20); // 120 ÷ 6
  });

  it('un semestral pagado en su mes no sale atrasado en los meses en que no toca', async () => {
    const pagos = await loadFixedPayments('u1');
    const seguro = pagos.find((p) => p.id === 'p-seguro');

    expect(seguro?.missedMonths).toBe(0);
    expect(seguro?.accumulatedDebt).toBe(0);
    expect(seguro?.isPaidThisMonth).toBe(true);
  });

  it('un mensual sin pagar sigue saliendo atrasado: el arreglo no apaga los avisos de verdad', async () => {
    const pagos = await loadFixedPayments('u1');
    const luz = pagos.find((p) => p.id === 'p-luz');

    expect(luz?.amount).toBe(60);
    expect(luz?.missedMonths).toBe(1);
    expect(luz?.accumulatedDebt).toBe(60);
  });
});
