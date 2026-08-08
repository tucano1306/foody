import { describe, it, expect } from 'vitest';
import {
  DEFAULT_EXPENSE_KIND,
  EXPENSE_KINDS,
  detectExpenseKind,
  expenseKindMeta,
  isGroceryKind,
  normalizeExpenseKind,
} from './expense-kind';

describe('normalizeExpenseKind', () => {
  it('acepta los tipos conocidos', () => {
    for (const { kind } of EXPENSE_KINDS) {
      expect(normalizeExpenseKind(kind)).toBe(kind);
    }
  });

  it('tolera mayúsculas y espacios de la base', () => {
    expect(normalizeExpenseKind(' Dining ')).toBe('dining');
    expect(normalizeExpenseKind('GROCERY')).toBe('grocery');
  });

  it('cae a super ante cualquier dato inesperado', () => {
    // El default importa: es lo que hace que ningún ticket ya guardado se mude
    // de sección por un valor raro o por una fila anterior a la columna.
    expect(normalizeExpenseKind(null)).toBe('grocery');
    expect(normalizeExpenseKind(undefined)).toBe('grocery');
    expect(normalizeExpenseKind('')).toBe('grocery');
    expect(normalizeExpenseKind('restaurante')).toBe('grocery');
    expect(normalizeExpenseKind(42)).toBe('grocery');
    expect(normalizeExpenseKind({ kind: 'dining' })).toBe('grocery');
    expect(DEFAULT_EXPENSE_KIND).toBe('grocery');
  });
});

describe('isGroceryKind', () => {
  it('solo el super es super', () => {
    expect(isGroceryKind('grocery')).toBe(true);
    for (const { kind } of EXPENSE_KINDS.filter((k) => k.kind !== 'grocery')) {
      expect(isGroceryKind(kind)).toBe(false);
    }
  });
});

describe('expenseKindMeta', () => {
  it('cada tipo tiene emoji y etiquetas', () => {
    for (const { kind } of EXPENSE_KINDS) {
      const meta = expenseKindMeta(kind);
      expect(meta.kind).toBe(kind);
      expect(meta.emoji.length).toBeGreaterThan(0);
      expect(meta.label.length).toBeGreaterThan(0);
      expect(meta.groupLabel.length).toBeGreaterThan(0);
    }
  });
});

describe('detectExpenseKind', () => {
  it('reconoce el caso que motivó todo esto', () => {
    expect(detectExpenseKind('Pollo Tropical')).toBe('dining');
    expect(detectExpenseKind('POLLO TROPICAL #212')).toBe('dining');
  });

  it('reconoce supermercados', () => {
    expect(detectExpenseKind('Walmart')).toBe('grocery');
    expect(detectExpenseKind('Publix Super Markets')).toBe('grocery');
    expect(detectExpenseKind('Soriana Híper')).toBe('grocery');
    expect(detectExpenseKind('Supermercado La Placita')).toBe('grocery');
  });

  it('reconoce comida fuera', () => {
    expect(detectExpenseKind("McDonald's")).toBe('dining');
    expect(detectExpenseKind('Café Río')).toBe('dining');
    expect(detectExpenseKind('Cafe Rio')).toBe('dining');
    expect(detectExpenseKind('Taquería El Güero')).toBe('dining');
    expect(detectExpenseKind('Uber Eats')).toBe('dining');
  });

  it('reconoce farmacia, gasolina y hogar', () => {
    expect(detectExpenseKind('Farmacia Guadalajara')).toBe('pharmacy');
    expect(detectExpenseKind('Walgreens')).toBe('pharmacy');
    expect(detectExpenseKind('Shell')).toBe('fuel');
    expect(detectExpenseKind('Gasolinera Pemex')).toBe('fuel');
    expect(detectExpenseKind('Home Depot #4512')).toBe('home');
    expect(detectExpenseKind('Ferretería El Tornillo')).toBe('home');
  });

  it('lo específico gana a lo genérico', () => {
    // "Super Pollo" es un restaurante aunque diga "super"; "Walmart Pharmacy"
    // es farmacia aunque diga "walmart".
    expect(detectExpenseKind('Super Pollo')).toBe('dining');
    expect(detectExpenseKind('Walmart Pharmacy')).toBe('pharmacy');
  });

  it('devuelve null cuando no reconoce nada', () => {
    // null ≠ grocery: quien llama tiene que poder distinguir "lo detecté" de
    // "no sé", o acabaría imponiendo super en silencio a cualquier ticket.
    expect(detectExpenseKind('La Tiendita de Doña Mari')).toBeNull();
    expect(detectExpenseKind('ZZZQQQ')).toBeNull();
    expect(detectExpenseKind('')).toBeNull();
    expect(detectExpenseKind('   ')).toBeNull();
    expect(detectExpenseKind(null)).toBeNull();
    expect(detectExpenseKind(undefined)).toBeNull();
  });

  it('no se confunde con puntuación ni acentos', () => {
    expect(detectExpenseKind('  publix  ')).toBe('grocery');
    expect(detectExpenseKind('PIZZA-HUT')).toBe('dining');
    expect(detectExpenseKind('Óptica Devlyn')).toBe('pharmacy');
  });
});
