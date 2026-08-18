import { describe, it, expect } from 'vitest';
import {
  cycleStart,
  forecastMessage,
  forecastStock,
  quietPeriodDays,
  stockFraction,
  type StockForecastInput,
} from './stock-forecast';

const NOW = new Date(2026, 7, 18, 8, 0, 0);
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000);

function input(over: Partial<StockForecastInput> = {}): StockForecastInput {
  return {
    stockLevel: 'full',
    avgIntervalDays: 14,
    purchaseDays: 4,
    lastPurchasedAt: daysAgo(3),
    stockUpdatedAt: daysAgo(3),
    lastAlertAt: null,
    now: NOW,
    ...over,
  };
}

describe('el caso real: Carbone', () => {
  // Marcado LLENO hace 14 días, comprado hace 26, y con un «ciclo» de 0.9 días
  // porque las dos compras cayeron casi el mismo día. Recibía «ya se agotó»
  // todas las mañanas.
  const carbone = input({
    stockLevel: 'full',
    avgIntervalDays: 0.9,
    purchaseDays: 2,
    lastPurchasedAt: daysAgo(26),
    stockUpdatedAt: daysAgo(14),
  });

  it('ya no avisa: dos compras no son un hábito', () => {
    const f = forecastStock(carbone);
    expect(f.shouldAlert).toBe(false);
    expect(f.reason).toBe('no-history');
  });

  it('y aunque hubiera compras de sobra, un ciclo de 0.9 días es ruido', () => {
    const f = forecastStock({ ...carbone, purchaseDays: 6 });
    expect(f.shouldAlert).toBe(false);
    expect(f.reason).toBe('cycle-too-short');
  });
});

describe('lo que el usuario afirma gana a la predicción', () => {
  it('el reloj arranca cuando marcó el stock, no en la compra vieja', () => {
    // Comprado hace 26 días pero marcado lleno hace 2: le queda casi el ciclo
    // entero, no −12 días.
    const f = forecastStock(input({
      avgIntervalDays: 14,
      lastPurchasedAt: daysAgo(26),
      stockUpdatedAt: daysAgo(2),
    }));
    expect(f.daysRemaining).toBe(12);
    expect(f.shouldAlert).toBe(false);
    expect(f.reason).toBe('plenty-left');
  });

  it('sin marca de stock cae en la compra, como antes', () => {
    const f = forecastStock(input({ stockUpdatedAt: null, lastPurchasedAt: daysAgo(13) }));
    expect(f.daysRemaining).toBe(1);
    expect(f.shouldAlert).toBe(true);
  });

  it('gana la señal MÁS RECIENTE, venga de donde venga', () => {
    // Marcado hace 20 días pero recomprado hace 1: manda la compra.
    const start = cycleStart({ lastPurchasedAt: daysAgo(1), stockUpdatedAt: daysAgo(20) });
    expect(Math.round((NOW.getTime() - start.getTime()) / 86_400_000)).toBe(1);
  });

  it('nunca dice "ya se agotó" de algo marcado LLENO', () => {
    // Aunque el ciclo diga que debería estar vacío, contradecir al usuario es
    // exactamente lo que hacía que el aviso resultara molesto.
    const f = forecastStock(input({
      stockLevel: 'full',
      lastPurchasedAt: daysAgo(40),
      stockUpdatedAt: daysAgo(40),
    }));
    expect(f.daysRemaining).toBeLessThan(0);
    expect(f.tone).toBe('soon');
  });

  it('pero sí lo dice de algo marcado VACÍO', () => {
    const f = forecastStock(input({ stockLevel: 'empty', stockUpdatedAt: daysAgo(1) }));
    expect(f.tone).toBe('out');
    expect(f.shouldAlert).toBe(true);
  });
});

describe('un aviso por ciclo, no uno por mañana', () => {
  const porAvisar = input({ lastPurchasedAt: daysAgo(13), stockUpdatedAt: daysAgo(13) });

  it('avisa la primera vez', () => {
    expect(forecastStock({ ...porAvisar, lastAlertAt: null }).shouldAlert).toBe(true);
  });

  it('calla al día siguiente', () => {
    const f = forecastStock({ ...porAvisar, lastAlertAt: daysAgo(1) });
    expect(f.shouldAlert).toBe(false);
    expect(f.reason).toBe('already-alerted');
  });

  it('vuelve a hablar pasado el periodo de silencio', () => {
    expect(forecastStock({ ...porAvisar, lastAlertAt: daysAgo(8) }).shouldAlert).toBe(true);
  });

  it('el silencio escala con el ciclo, con una semana de suelo', () => {
    expect(quietPeriodDays(4)).toBe(7);
    expect(quietPeriodDays(30)).toBe(15);
  });
});

describe('el umbral escala con el ciclo', () => {
  it('en algo mensual avisa con más margen que en algo semanal', () => {
    // Ciclo 30: umbral 8 → avisa a falta de 8 días.
    const mensual = forecastStock(input({ avgIntervalDays: 30, purchaseDays: 5, lastPurchasedAt: daysAgo(22), stockUpdatedAt: daysAgo(22) }));
    expect(mensual.daysRemaining).toBe(8);
    expect(mensual.shouldAlert).toBe(true);

    // Ciclo 7: umbral 2 → con 3 días todavía calla.
    const semanal = forecastStock(input({ avgIntervalDays: 7, purchaseDays: 5, lastPurchasedAt: daysAgo(4), stockUpdatedAt: daysAgo(4) }));
    expect(semanal.daysRemaining).toBe(3);
    expect(semanal.shouldAlert).toBe(false);
  });
});

describe('stockFraction', () => {
  it('el nivel marcado decide cuánto queda del ciclo', () => {
    expect(stockFraction('full')).toBe(1);
    expect(stockFraction('half')).toBe(0.5);
    // Vacío es vacío: cero, no «un poquito».
    expect(stockFraction('empty')).toBe(0);
  });

  it('a la mitad se acaba en la mitad del ciclo', () => {
    const f = forecastStock(input({ stockLevel: 'half', avgIntervalDays: 20, lastPurchasedAt: daysAgo(8), stockUpdatedAt: daysAgo(8) }));
    expect(f.daysRemaining).toBe(2);
    expect(f.shouldAlert).toBe(true);
  });
});

describe('datos inválidos no producen avisos', () => {
  it('sin promedio no hay predicción', () => {
    expect(forecastStock(input({ avgIntervalDays: null })).shouldAlert).toBe(false);
  });

  it('un promedio no finito tampoco', () => {
    expect(forecastStock(input({ avgIntervalDays: Number.NaN })).shouldAlert).toBe(false);
    expect(forecastStock(input({ avgIntervalDays: Number.POSITIVE_INFINITY })).shouldAlert).toBe(false);
  });

  it('con menos de tres días de compra se calla', () => {
    expect(forecastStock(input({ purchaseDays: 2 })).reason).toBe('no-history');
  });
});

describe('forecastMessage', () => {
  const base = { shouldAlert: true, reason: 'alert' as const, daysRemaining: 0, tone: 'soon' as const };

  it('el texto respeta lo que el usuario marcó', () => {
    expect(forecastMessage('Leo', 'Carbone', { ...base, tone: 'soon' }, 14)).toContain('está por acabarse');
    expect(forecastMessage('Leo', 'Carbone', { ...base, tone: 'out' }, 14)).toContain('ya se agotó');
  });

  it('saluda por el nombre cuando lo hay', () => {
    expect(forecastMessage('Leo', 'Arroz', base, 14)).toContain('Hola Leo');
    expect(forecastMessage(null, 'Arroz', base, 14)).toContain('¡Hola!');
  });

  it('con días de sobra da la cifra, no la alarma', () => {
    const msg = forecastMessage('Leo', 'Arroz', { ...base, daysRemaining: 5 }, 20);
    expect(msg).toContain('5 días más');
    expect(msg).toContain('cada ~20 días');
  });

  it('nunca promete días negativos', () => {
    expect(forecastMessage('Leo', 'Arroz', { ...base, daysRemaining: -9 }, 14)).not.toContain('-9');
  });
});
