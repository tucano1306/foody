import { describe, it, expect } from 'vitest';
import {
  buildBusinessResult,
  businessPart,
  matchesFilter,
  normalizeShare,
  personalPart,
  scopeOf,
  splitAmount,
  summarizeByScope,
  totalForFilter,
  type ScopedItem,
} from './expense-scope';

function item(over: Partial<ScopedItem> = {}): ScopedItem {
  return { id: 'x', name: 'Gasto', amount: 100, businessShare: 0, ...over };
}

describe('normalizeShare', () => {
  it('deja pasar un porcentaje válido', () => {
    expect(normalizeShare(60)).toBe(60);
    expect(normalizeShare(33.33)).toBe(33.33);
  });

  it('recorta por arriba a 100', () => {
    expect(normalizeShare(150)).toBe(100);
  });

  it('ante la duda, personal: todo lo inválido cae en 0', () => {
    expect(normalizeShare(-20)).toBe(0);
    expect(normalizeShare(Number.NaN)).toBe(0);
    expect(normalizeShare(null)).toBe(0);
    expect(normalizeShare(undefined)).toBe(0);
    expect(normalizeShare('hola')).toBe(0);
  });

  it('acepta el número escrito como texto', () => {
    expect(normalizeShare('45.5')).toBe(45.5);
  });
});

describe('scopeOf', () => {
  it('deriva la etiqueta del porcentaje', () => {
    expect(scopeOf(0)).toBe('personal');
    expect(scopeOf(100)).toBe('business');
    expect(scopeOf(60)).toBe('mixed');
    expect(scopeOf(0.5)).toBe('mixed');
    expect(scopeOf(99.9)).toBe('mixed');
  });

  it('lo inválido es personal', () => {
    expect(scopeOf(Number.NaN)).toBe('personal');
    expect(scopeOf(-5)).toBe('personal');
  });
});

describe('splitAmount', () => {
  it('reparte por el porcentaje', () => {
    expect(splitAmount(100, 60)).toEqual({ personal: 40, business: 60 });
  });

  it('sin porcentaje todo es personal', () => {
    expect(splitAmount(250, 0)).toEqual({ personal: 250, business: 0 });
  });

  it('al 100 % todo es del negocio', () => {
    expect(splitAmount(250, 100)).toEqual({ personal: 0, business: 250 });
  });

  it('INVARIANTE: las dos partes suman siempre el importe original', () => {
    // Casos elegidos porque redondear cada lado por separado los rompería.
    const casos: Array<[number, number]> = [
      [0.05, 50],
      [0.01, 50],
      [100, 33.33],
      [999.99, 7.77],
      [1, 1],
      [12.35, 66.67],
      [0.03, 33.33],
      [7, 14.28],
    ];
    for (const [amount, share] of casos) {
      const { personal, business } = splitAmount(amount, share);
      expect(personal + business).toBeCloseTo(amount, 10);
    }
  });

  it('no inventa centavos con importes diminutos', () => {
    const { personal, business } = splitAmount(0.05, 50);
    expect(personal + business).toBe(0.05);
  });

  it('aguanta importes inválidos', () => {
    expect(splitAmount(Number.NaN, 50)).toEqual({ personal: 0, business: 0 });
  });

  it('los atajos coinciden con el reparto completo', () => {
    expect(personalPart(80, 25)).toBe(60);
    expect(businessPart(80, 25)).toBe(20);
  });
});

describe('matchesFilter', () => {
  it('«todo» no filtra nada', () => {
    expect(matchesFilter(0, 'all')).toBe(true);
    expect(matchesFilter(100, 'all')).toBe(true);
  });

  it('un gasto puramente personal no sale en la vista de negocio', () => {
    expect(matchesFilter(0, 'personal')).toBe(true);
    expect(matchesFilter(0, 'business')).toBe(false);
  });

  it('un gasto puramente del negocio no sale en la vista personal', () => {
    expect(matchesFilter(100, 'business')).toBe(true);
    expect(matchesFilter(100, 'personal')).toBe(false);
  });

  it('un gasto mixto sale en LAS DOS vistas: es real en ambas', () => {
    expect(matchesFilter(60, 'personal')).toBe(true);
    expect(matchesFilter(60, 'business')).toBe(true);
  });
});

describe('summarizeByScope', () => {
  it('suma cada lado repartiendo ítem a ítem', () => {
    const s = summarizeByScope([
      item({ id: 'a', amount: 1000, businessShare: 0 }),
      item({ id: 'b', amount: 500, businessShare: 100 }),
      item({ id: 'c', amount: 200, businessShare: 50 }),
    ]);
    expect(s.personal).toBe(1100); // 1000 + 0 + 100
    expect(s.business).toBe(600); //     0 + 500 + 100
    expect(s.total).toBe(1700);
  });

  it('cuenta cuántos hay de cada tipo', () => {
    const s = summarizeByScope([
      item({ businessShare: 0 }),
      item({ businessShare: 0 }),
      item({ businessShare: 100 }),
      item({ businessShare: 40 }),
    ]);
    expect(s.personalCount).toBe(2);
    expect(s.businessCount).toBe(1);
    expect(s.mixedCount).toBe(1);
  });

  it('calcula qué parte del total se lleva el negocio', () => {
    const s = summarizeByScope([
      item({ amount: 750, businessShare: 0 }),
      item({ amount: 250, businessShare: 100 }),
    ]);
    expect(s.businessPercent).toBe(25);
  });

  it('la suma de los lados cuadra con el total de la lista', () => {
    const items = [
      item({ amount: 33.33, businessShare: 33.33 }),
      item({ amount: 0.07, businessShare: 50 }),
      item({ amount: 1234.56, businessShare: 61.5 }),
    ];
    const s = summarizeByScope(items);
    const bruto = items.reduce((acc, i) => acc + i.amount, 0);
    expect(s.personal + s.business).toBeCloseTo(bruto, 2);
    expect(s.total).toBeCloseTo(bruto, 2);
  });

  it('aguanta la lista vacía', () => {
    const s = summarizeByScope([]);
    expect(s.total).toBe(0);
    expect(s.businessPercent).toBe(0);
  });
});

describe('totalForFilter', () => {
  const items = [
    item({ amount: 1000, businessShare: 0 }),
    item({ amount: 400, businessShare: 100 }),
    item({ amount: 200, businessShare: 25 }),
  ];

  it('devuelve el total del lado que se está mirando', () => {
    expect(totalForFilter(items, 'personal')).toBe(1150); // 1000 + 150
    expect(totalForFilter(items, 'business')).toBe(450); //   400 + 50
    expect(totalForFilter(items, 'all')).toBe(1600);
  });

  it('los dos lados suman el total', () => {
    expect(totalForFilter(items, 'personal') + totalForFilter(items, 'business')).toBe(
      totalForFilter(items, 'all'),
    );
  });
});

describe('buildBusinessResult', () => {
  it('resta los gastos de los ingresos', () => {
    const r = buildBusinessResult(5000, 3200);
    expect(r.result).toBe(1800);
    expect(r.margin).toBe(36);
  });

  it('un negocio en pérdidas da resultado negativo', () => {
    const r = buildBusinessResult(1000, 1500);
    expect(r.result).toBe(-500);
    expect(r.margin).toBe(-50);
  });

  it('avisa cuando hay gastos de negocio pero ningún ingreso declarado', () => {
    const r = buildBusinessResult(0, 800);
    expect(r.expensesWithoutIncome).toBe(true);
    expect(r.result).toBe(-800);
    expect(r.margin).toBe(0); // sin ingresos no hay margen que calcular
  });

  it('sin gastos ni ingresos no avisa de nada', () => {
    expect(buildBusinessResult(0, 0).expensesWithoutIncome).toBe(false);
  });

  it('ignora entradas inválidas', () => {
    const r = buildBusinessResult(Number.NaN, -100);
    expect(r.income).toBe(0);
    expect(r.expenses).toBe(0);
    expect(r.result).toBe(0);
  });
});
