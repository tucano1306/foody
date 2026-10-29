import { describe, expect, it } from 'vitest';
import { importeDelMes, tocaEsteMes } from './importe-del-mes';

const el = (y: number, m: number, d = 20) => new Date(y, m - 1, d, 12);

// Un seguro de $515 cada seis meses, con los cobros en octubre y abril.
const SEGURO = { amount: 515, frequency: 'semiannual', anchorMonth: 10 };
const pagado = (amount: number, actualAmount: number | null = null) => ({ status: 'paid', amount, actualAmount });

describe('importeDelMes — recibos que no son mensuales', () => {
  it('en un mes que no le toca no cuenta nada', () => {
    expect(tocaEsteMes(SEGURO, el(2026, 11))).toBe(false);
    expect(importeDelMes(SEGURO, el(2026, 11))).toBe(0);
    expect(importeDelMes(SEGURO, el(2027, 1))).toBe(0);
  });

  it('en su mes, sin pagar, cuenta su importe', () => {
    expect(tocaEsteMes(SEGURO, el(2027, 4))).toBe(true);
    expect(importeDelMes(SEGURO, el(2027, 4))).toBe(515);
  });

  it('pagado, cuenta lo que de verdad se cobró, no el importe de la ficha', () => {
    // El caso real: el seguro era mensual ($87.17) y se pasó a semestral
    // después de cobrarse octubre.
    expect(importeDelMes({ ...SEGURO, currentRecord: pagado(87.17) }, el(2026, 10))).toBe(87.17);
    expect(importeDelMes({ ...SEGURO, currentRecord: pagado(515, 498.5) }, el(2027, 4))).toBe(498.5);
  });

  it('un pago registrado en un mes que no tocaba sí cuenta: ese dinero salió', () => {
    const r = { ...SEGURO, currentRecord: pagado(515) };
    expect(tocaEsteMes(r, el(2026, 12))).toBe(true);
    expect(importeDelMes(r, el(2026, 12))).toBe(515);
  });

  it('un registro pendiente no es un pago', () => {
    const r = { ...SEGURO, currentRecord: { status: 'pending', amount: 515, actualAmount: null } };
    expect(importeDelMes(r, el(2026, 11))).toBe(0);
  });
});

describe('importeDelMes — los mensuales siguen igual', () => {
  const RENTA = { amount: 1650, frequency: 'monthly', anchorMonth: null };

  it('todos los meses cuentan su importe', () => {
    for (let m = 1; m <= 12; m++) expect(importeDelMes(RENTA, el(2026, m))).toBe(1650);
  });

  it('sin frecuencia (filas viejas) es mensual', () => {
    expect(importeDelMes({ amount: 80 }, el(2026, 11))).toBe(80);
  });
});
