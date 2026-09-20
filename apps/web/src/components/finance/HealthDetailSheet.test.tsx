import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { buildFinancePlan, explainHealthScore, type PlanInput } from '@/lib/finance-engine';
import HealthDetailSheet from './HealthDetailSheet';
import { healthLabel } from './finance-ui';

const NOW = new Date(2026, 8, 20, 12, 0, 0); // 20 sep 2026

/**
 * Un plan real, calculado con el motor de verdad.
 *
 * Nada de desgloses inventados a mano: lo que se comprueba es justo que la
 * hoja no pueda decir una cosa distinta del anillo, y con cifras fabricadas la
 * prueba no demostraría eso.
 */
function planInput(over: Partial<PlanInput> = {}): PlanInput {
  return {
    incomes: [
      { id: 'i1', name: 'Sueldo', amount: 3000, frequency: 'monthly', isActive: true, note: null },
    ],
    goals: [],
    fixedPayments: [
      {
        id: 'p1',
        name: 'Renta',
        amount: 900,
        dueDay: 5,
        isPaidThisMonth: true,
        missedMonths: 0,
        accumulatedDebt: 0,
      },
    ],
    groceriesMonthly: 400,
    groceriesSource: 'limit',
    groceriesSpentThisMonth: 180,
    now: NOW,
    ...over,
  };
}

function montar(over: Partial<PlanInput> = {}, businessIncluded: boolean | null = null) {
  const plan = buildFinancePlan(planInput(over));
  const breakdown = explainHealthScore(plan.cashFlow, plan.goals, plan.debts);
  const onClose = vi.fn();
  render(
    <HealthDetailSheet
      breakdown={breakdown}
      cash={plan.cashFlow}
      businessIncluded={businessIncluded}
      onClose={onClose}
    />,
  );
  return { plan, breakdown, onClose };
}

describe('HealthDetailSheet — el anillo, explicado', () => {
  it('enseña la misma nota que el plan y su palabra', () => {
    const { plan } = montar();
    expect(plan.healthScore).toBeGreaterThan(0);
    expect(screen.getByText(`De dónde sale tu ${plan.healthScore} de 100`)).toBeInTheDocument();
    expect(screen.getByText(healthLabel(plan.healthScore))).toBeInTheDocument();
  });

  it('desglosa las tres partes con sus topes', () => {
    montar();
    expect(screen.getByText('Lo que te queda libre')).toBeInTheDocument();
    expect(screen.getByText('Ir al día con lo vencido')).toBeInTheDocument();
    expect(screen.getByText('Metas que llegan a tiempo')).toBeInTheDocument();
    expect(screen.getByText('/ 40 pts')).toBeInTheDocument();
    expect(screen.getAllByText('/ 30 pts')).toHaveLength(2);
  });

  it('los puntos que pinta suman la nota del anillo', () => {
    const { breakdown } = montar();
    const suma = breakdown.parts.reduce((acc, p) => acc + p.points, 0);
    expect(suma).toBe(breakdown.score);
    // Y cada cifra de puntos está escrita en la pantalla, no solo en el objeto.
    for (const part of breakdown.parts) {
      const fila = screen.getByText(part.label).closest('div')?.parentElement;
      expect(within(fila as HTMLElement).getByText(String(part.points))).toBeInTheDocument();
    }
  });

  it('dice de qué periodo habla — la duda que trae aquí al usuario', () => {
    montar();
    expect(screen.getByText('solo el mes en curso')).toBeInTheDocument();
    expect(screen.getByText(/septiembre/)).toBeInTheDocument();
    expect(screen.getByText(/ni guarda histórico/i)).toBeInTheDocument();
  });

  it('explica las dos cifras de la cabecera con sus importes', () => {
    montar();
    expect(screen.getByText('Libre al mes')).toBeInTheDocument();
    // $3,000 − $900 de renta − $400 de super = $1,700 libres.
    expect(screen.getByText('$1,700')).toBeInTheDocument();
    expect(screen.getByText(/pagos fijos \(\$900\)/)).toBeInTheDocument();
  });

  it('con deuda vencida baja los puntos y dice cuánto se arrastra', () => {
    montar({
      incomes: [{ id: 'i1', name: 'Sueldo', amount: 1500, frequency: 'monthly', isActive: true, note: null }],
      fixedPayments: [
        {
          id: 'p1',
          name: 'Renta',
          amount: 600,
          dueDay: 5,
          isPaidThisMonth: false,
          missedMonths: 2,
          accumulatedDebt: 600,
        },
      ],
    });
    expect(screen.getByText(/Arrastras \$600 de 1 pago vencido/)).toBeInTheDocument();
    expect(screen.getByText(/abonar esos \$600 devuelve los 30 puntos/)).toBeInTheDocument();
  });

  it('sin ingresos no finge una nota: lo dice', () => {
    const { breakdown } = montar({ incomes: [] });
    expect(breakdown.score).toBe(0);
    expect(screen.getByText('Sin ingresos cargados no hay nota que calcular.')).toBeInTheDocument();
    expect(screen.getAllByText('Sin ingresos cargados no se puede calcular.')).toHaveLength(3);
  });

  it('avisa de qué dinero está contando cuando hay negocio', () => {
    const { onClose } = montar({}, false);
    expect(screen.getByText(/solo de tu dinero personal/i)).toBeInTheDocument();

    fireEvent.click(screen.getAllByLabelText('Cerrar')[0]);
    expect(onClose).toHaveBeenCalled();
  });

  it('sin negocio no menciona el reparto', () => {
    montar({}, null);
    expect(screen.queryByText(/dinero personal/i)).not.toBeInTheDocument();
  });
});
