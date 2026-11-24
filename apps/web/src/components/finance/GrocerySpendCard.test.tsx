import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { computeGroceryInsight } from '@/lib/grocery-insights';
import GrocerySpendCard from './GrocerySpendCard';

// 22 de agosto de 2026: pasada la primera semana, el ritmo ya significa algo.
const NOW = new Date(2026, 7, 22, 12, 0, 0);

function datos(monthlyTotals = [
  { month: '2026-06', total: 300, trips: 6 },
  { month: '2026-07', total: 200, trips: 4 },
  { month: '2026-08', total: 110, trips: 3 },
], limit = 0) {
  return computeGroceryInsight({ monthlyTotals, categories: [], stores: [], limit, now: NOW });
}

/** El pie del plan, con el texto entero aunque vaya partido en negritas. */
function pieDelPlan(): string {
  const pie = screen.getByText((_, el) => el?.tagName === 'P' && /^(El plan resta|Sin compras aún:)/.test(el.textContent ?? ''));
  return pie.textContent ?? '';
}

/**
 * «Llevas» arriba y «Super» en «Tu mes» son cifras distintas a propósito: una
 * es lo gastado y la otra lo que el plan resta por el mes entero. El pie dice
 * de dónde sale la diferencia, con cifra.
 */
describe('GrocerySpendCard — lo que resta el plan', () => {
  it('es lo que llevas más lo previsto hasta fin de mes', () => {
    render(<GrocerySpendCard groceries={datos()} history={[]} />);
    // $110 llevados + $250 de promedio × 9/31 días que faltan.
    expect(pieDelPlan()).toBe('El plan resta $182.58: lo que llevas y $72.58 previstos hasta fin de mes.');
  });

  it('sin compras este mes, lo que resta es tu promedio', () => {
    render(<GrocerySpendCard groceries={datos([
      { month: '2026-06', total: 300, trips: 6 },
      { month: '2026-07', total: 200, trips: 4 },
    ])} history={[]} />);
    expect(pieDelPlan()).toBe('El plan resta $250 al mes de super, tu promedio real.');
  });

  it('sin historial ni compras, usa tu límite', () => {
    render(<GrocerySpendCard groceries={datos([], 400)} history={[]} />);
    expect(pieDelPlan()).toBe('Sin compras aún: el plan usa tu límite de $400.');
  });
});
