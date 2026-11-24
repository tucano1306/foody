import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { computeOtherSpend } from '@/lib/other-spend';
import OtherSpendCard from './OtherSpendCard';

// 22 de agosto de 2026: pasada la primera semana, el ritmo ya significa algo.
const NOW = new Date(2026, 7, 22, 12, 0, 0);

function datos(now = NOW) {
  return computeOtherSpend({
    monthlyTotals: [
      { month: '2026-06', total: 300, trips: 10 },
      { month: '2026-07', total: 200, trips: 8 },
      { month: '2026-08', total: 110, trips: 5 },
    ],
    byKind: [{ kind: 'dining', currentMonth: 110, prevMonth: 90, count: 5 }],
    places: [],
    now,
  });
}

/**
 * «Fuera del super» era una cifra y una lista; «Gastos en comida», al lado,
 * enseñaba el ritmo del mes y el gasto por mes. Ahora las dos se leen igual.
 */
describe('OtherSpendCard — como la tarjeta de comida', () => {
  it('enseña el ritmo del mes contra tu promedio', () => {
    render(<OtherSpendCard other={datos()} onChanged={() => undefined} />);
    expect(screen.getByText('Ritmo del mes · día 22 de 31')).toBeInTheDocument();
    expect(screen.getByText('Cerrarás en')).toBeInTheDocument();
    expect(screen.getByText('Tu promedio')).toBeInTheDocument();
    // 110 en 22 días → 155 al cierre, contra 250 de promedio: 95 por debajo.
    expect(screen.getByText(/cierras \$95 por debajo de tu promedio/)).toBeInTheDocument();
  });

  it('enseña el gasto por mes', () => {
    render(<OtherSpendCard other={datos()} onChanged={() => undefined} />);
    expect(screen.getByText('Gasto por mes')).toBeInTheDocument();
    expect(screen.getByText('jun')).toBeInTheDocument();
    expect(screen.getByText('ago')).toBeInTheDocument();
  });

  it('el día 3 todavía no hay ritmo que enseñar', () => {
    render(<OtherSpendCard other={datos(new Date(2026, 7, 3, 12))} onChanged={() => undefined} />);
    expect(screen.queryByText(/Ritmo del mes/)).toBeNull();
  });

  it('el botón dice «Agregar ticket» y abre el formulario fuera de la despensa', () => {
    render(<OtherSpendCard other={datos()} onChanged={() => undefined} />);
    expect(screen.getByRole('link', { name: /Agregar ticket/ })).toHaveAttribute('href', '/shopping-trips/new?kind=other');
  });
});

/** El pie del plan, con el texto entero aunque vaya partido en negritas. */
function pieDelPlan(): string {
  const pie = screen.getByText((_, el) => el?.tagName === 'P' && /^El plan resta/.test(el.textContent ?? ''));
  return pie.textContent ?? '';
}

/**
 * La cifra de arriba es lo que llevas; la fila de «Tu mes», lo que resta el
 * plan. El pie dice de dónde sale la diferencia, con cifra, para que las dos
 * no parezcan una suma mal hecha.
 */
describe('OtherSpendCard — lo que resta el plan', () => {
  it('es lo que llevas más lo previsto hasta fin de mes', () => {
    render(<OtherSpendCard other={datos()} onChanged={() => undefined} />);
    // $110 llevados + $250 de promedio × 9/31 días que faltan.
    expect(pieDelPlan()).toBe('El plan resta $182.58: lo que llevas y $72.58 previstos hasta fin de mes.');
  });

  it('sin gasto este mes, lo que resta es el promedio y no hay «lo que llevas»', () => {
    const vacio = computeOtherSpend({
      monthlyTotals: [
        { month: '2026-06', total: 300, trips: 10 },
        { month: '2026-07', total: 200, trips: 8 },
      ],
      byKind: [],
      places: [],
      now: NOW,
    });
    render(<OtherSpendCard other={vacio} onChanged={() => undefined} />);
    expect(pieDelPlan()).toBe('El plan resta $250 al mes por esto.');
  });
});
