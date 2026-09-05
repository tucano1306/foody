import { describe, expect, it } from 'vitest';
import {
  amountForKind,
  normalizeSplits,
  remainderFor,
  splitsTotal,
  tripKindAmounts,
  validateSplits,
} from './trip-splits';

/**
 * El caso real: un carrito de Walmart de $120 con la despensa de la semana y,
 * en el mismo recibo, $35 de farmacia.
 *
 * Sin esto habia que elegir uno: marcarlo super inflaba el presupuesto de
 * despensa con lo que no es comida; marcarlo farmacia sacaba la despensa
 * entera de Compras y de las estadisticas de precios.
 */
describe('tripKindAmounts — el ticket mixto', () => {
  it('lo que sobra se queda en el tipo del ticket', () => {
    expect(tripKindAmounts('grocery', 120, [{ kind: 'pharmacy', amount: 35 }])).toEqual([
      { kind: 'grocery', amount: 85 },
      { kind: 'pharmacy', amount: 35 },
    ]);
  });

  it('funciona al reves: un ticket de farmacia con algo de despensa', () => {
    expect(tripKindAmounts('pharmacy', 80, [{ kind: 'grocery', amount: 20 }])).toEqual([
      { kind: 'pharmacy', amount: 60 },
      { kind: 'grocery', amount: 20 },
    ]);
  });

  it('un ticket sin repartir se comporta como siempre', () => {
    expect(tripKindAmounts('dining', 76.69, [])).toEqual([{ kind: 'dining', amount: 76.69 }]);
    expect(tripKindAmounts('dining', 76.69, null)).toEqual([{ kind: 'dining', amount: 76.69 }]);
  });

  it('varios trozos, cada uno a su sitio', () => {
    expect(tripKindAmounts('grocery', 200, [
      { kind: 'pharmacy', amount: 35 },
      { kind: 'home', amount: 40 },
      { kind: 'fuel', amount: 25 },
    ])).toEqual([
      { kind: 'grocery', amount: 100 },
      { kind: 'pharmacy', amount: 35 },
      { kind: 'home', amount: 40 },
      { kind: 'fuel', amount: 25 },
    ]);
  });

  it('dos trozos del mismo tipo son uno solo', () => {
    expect(tripKindAmounts('grocery', 100, [
      { kind: 'pharmacy', amount: 10 },
      { kind: 'pharmacy', amount: 15.5 },
    ])).toEqual([
      { kind: 'grocery', amount: 74.5 },
      { kind: 'pharmacy', amount: 25.5 },
    ]);
  });

  it('repartir un trozo del MISMO tipo del ticket no duplica nada', () => {
    expect(tripKindAmounts('grocery', 100, [{ kind: 'grocery', amount: 30 }])).toEqual([
      { kind: 'grocery', amount: 100 },
    ]);
  });

  it('un ticket repartido al centimo no deja principal', () => {
    expect(tripKindAmounts('grocery', 50, [{ kind: 'dining', amount: 50 }])).toEqual([
      { kind: 'dining', amount: 50 },
    ]);
  });

  it('los centavos cuadran, no se arrastra error de flotante', () => {
    const partes = tripKindAmounts('grocery', 100, [
      { kind: 'pharmacy', amount: 33.33 },
      { kind: 'fuel', amount: 33.33 },
      { kind: 'home', amount: 33.34 },
    ]);
    expect(partes.reduce((s, p) => s + p.amount, 0)).toBeCloseTo(100, 2);
    expect(partes.find((p) => p.kind === 'grocery')).toBeUndefined();
  });
});

describe('remainderFor — lo que queda de despensa', () => {
  it('resta lo repartido del total', () => {
    expect(remainderFor(120, [{ kind: 'pharmacy', amount: 35 }])).toBe(85);
  });

  it('nunca es negativo: un ticket no puede restar del gasto del mes', () => {
    expect(remainderFor(50, [{ kind: 'pharmacy', amount: 80 }])).toBe(0);
  });

  it('sin total todavia escrito no revienta', () => {
    expect(remainderFor(0, [{ kind: 'pharmacy', amount: 10 }])).toBe(0);
    expect(remainderFor(Number.NaN, [])).toBe(0);
  });
});

describe('normalizeSplits — lo que no es dinero se cae', () => {
  it('descarta ceros, negativos y basura en vez de guardarlos', () => {
    // Una fila de $0 en el ticket no dice nada y ensucia el detalle para siempre.
    expect(normalizeSplits([
      { kind: 'pharmacy', amount: 0 },
      { kind: 'fuel', amount: -5 },
      { kind: 'home', amount: Number.NaN },
      { kind: 'dining', amount: 12.5 },
    ])).toEqual([{ kind: 'dining', amount: 12.5, note: null }]);
  });

  it('un tipo desconocido cae a super, como el resto de la app', () => {
    const [s] = normalizeSplits([{ kind: 'lo-que-sea' as never, amount: 10 }]);
    expect(s.kind).toBe('grocery');
  });

  it('la nota vacia es null, no una cadena en blanco', () => {
    expect(normalizeSplits([{ kind: 'fuel', amount: 10, note: '   ' }])[0].note).toBeNull();
    expect(normalizeSplits([{ kind: 'fuel', amount: 10, note: ' gasolina ' }])[0].note).toBe('gasolina');
  });

  it('lo que no es una lista no rompe nada', () => {
    expect(normalizeSplits(null)).toEqual([]);
    expect(normalizeSplits(undefined)).toEqual([]);
  });
});

describe('validateSplits — repartir de mas', () => {
  it('deja pasar un reparto que cabe', () => {
    expect(validateSplits(120, [{ kind: 'pharmacy', amount: 35 }])).toBeNull();
    expect(validateSplits(120, [{ kind: 'pharmacy', amount: 120 }])).toBeNull();
  });

  it('dice CUANTO sobra, no un «datos invalidos»', () => {
    const msg = validateSplits(100, [{ kind: 'pharmacy', amount: 130 }]);
    expect(msg).toContain('sobran');
    expect(msg).toContain('30.00');
  });
});

describe('amountForKind y splitsTotal', () => {
  it('cuanto aporta este ticket a un tipo concreto', () => {
    const splits = [{ kind: 'pharmacy' as const, amount: 35 }];
    expect(amountForKind('grocery', 'grocery', 120, splits)).toBe(85);
    expect(amountForKind('pharmacy', 'grocery', 120, splits)).toBe(35);
    expect(amountForKind('fuel', 'grocery', 120, splits)).toBe(0);
  });

  it('suma lo repartido', () => {
    expect(splitsTotal([{ kind: 'fuel', amount: 10.05 }, { kind: 'home', amount: 20.1 }])).toBe(30.15);
    expect(splitsTotal([])).toBe(0);
  });
});
