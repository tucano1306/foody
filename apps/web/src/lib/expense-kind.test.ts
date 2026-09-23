import { describe, it, expect } from 'vitest';
import {
  DEFAULT_EXPENSE_KIND,
  EXPENSE_KINDS,
  crossesBackToGrocery,
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

describe('crossesBackToGrocery', () => {
  /**
   * El fallo: tocar «Escanear ticket» en la tarjeta «Fuera del super» abria el
   * formulario en Super, asi que el gasto acababa registrado en Compras --justo
   * lo contrario de lo que decia la tarjeta desde la que se habia entrado--.
   *
   * Sembrar el tipo no bastaba: si el detector reconocia la tienda podia
   * devolver el ticket a Compras igual, y el usuario no veria por que.
   */

  it('protege al que entró desde «Fuera del super»', () => {
    expect(crossesBackToGrocery('other', 'grocery')).toBe(true);
    expect(crossesBackToGrocery('dining', 'grocery')).toBe(true);
    expect(crossesBackToGrocery('fuel', 'grocery')).toBe(true);
  });

  it('deja al detector afinar entre los gastos que no son despensa', () => {
    // «Iron Sushi» abierto como «Otro» tiene que poder volverse «Comida»: sigue
    // sin ser despensa, que es lo único que el usuario decidió al entrar.
    expect(crossesBackToGrocery('other', 'dining')).toBe(false);
    expect(crossesBackToGrocery('other', 'pharmacy')).toBe(false);
    expect(crossesBackToGrocery('dining', 'fuel')).toBe(false);
  });

  it('no estorba al flujo normal: desde súper el detector manda', () => {
    // Quien entra por Compras no ha decidido nada; ahí el detector es lo único
    // que hay, y un «Pollo Tropical» debe poder salirse de la despensa.
    expect(crossesBackToGrocery('grocery', 'dining')).toBe(false);
    expect(crossesBackToGrocery('grocery', 'grocery')).toBe(false);
  });
});
