import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { EMPTY_GROCERY_INSIGHT } from '@/lib/grocery-insights';
import StatsContent, { type StatsContentProps } from './StatsContent';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

const PROPS: StatsContentProps = {
  stock: { full: 35, half: 3, empty: 2 },
  topStores: [
    { name: 'Walmart', trips: 6, totalSpent: 600 },
    { name: 'Publix', trips: 4, totalSpent: 300 },
    { name: 'Aldi', trips: 2, totalSpent: 100 },
  ],
  monthlySpending: [
    { month: '2026-08', total: 500, trips: 5 },
    { month: '2026-09', total: 300, trips: 4 },
  ],
  totalProducts: 40,
  topProducts: [
    { name: 'Leche', purchases: 14, totalQty: 14 },
    { name: 'Pan', purchases: 9, totalQty: 9 },
  ],
  groceries: { ...EMPTY_GROCERY_INSIGHT },
  totalThisMonth: 0,
  insights: [],
  fullPct: 88,
  halfPct: 8,
  emptyPct: 5,
  maxTrips: 6,
  maxSpend: 500,
};

/**
 * Cada gráfico tiene que decir qué significa: antes eran barras con un
 * título y, a veces, una instrucción de uso.
 */
describe('StatsContent — una frase por gráfico', () => {
  it('cada tarjeta lleva su conclusión', () => {
    render(<StatsContent {...PROPS} />);
    expect(screen.getByText('Leche es lo que más compras: 14 veces')).toBeInTheDocument();
    expect(screen.getByText('El 88 % está lleno · 5 por reponer')).toBeInTheDocument();
    expect(screen.getByText('Walmart se lleva el 60 % de lo que gastas en el súper')).toBeInTheDocument();
    expect(screen.getByText(/^Media de \$400 al mes/)).toBeInTheDocument();
  });

  it('ya no imprime instrucciones de uso', () => {
    render(<StatsContent {...PROPS} />);
    expect(screen.queryByText(/toca una barra/i)).toBeNull();
  });
});
