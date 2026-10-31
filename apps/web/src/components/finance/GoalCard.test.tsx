import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { GoalProjection } from '@/lib/finance-engine';
import GoalCard from './GoalCard';

/**
 * La tarjeta de meta del Plan, con las dos metas de la tarjeta 3650 del dueño:
 * decía «faltan 1 dias», «Necesitas/mes $24,867.44» y no ofrecía enlazarla a
 * la tarjeta que ya estaba en Deudas.
 */
function meta(over: Partial<GoalProjection>): GoalProjection {
  return {
    goalId: 'g',
    debtId: null,
    name: 'tarjeta 3650 cash rewards',
    emoji: '💳',
    kind: 'debt',
    priority: 1,
    targetAmount: 1014,
    savedAmount: 197,
    remaining: 817,
    percentComplete: 19,
    targetDate: '2026-10-25',
    daysLeft: 1,
    monthsLeft: 0.03,
    requiredMonthly: 817,
    requiredWeekly: 817,
    requiredDaily: 817,
    allocatedMonthly: 0,
    cuotaTarjeta: null,
    shortfallMonthly: 817,
    projectedDate: null,
    monthsLate: 0,
    feasibility: 'at_risk',
    status: 'active',
    ...over,
  };
}

function montar(goal: GoalProjection, puedeEnlazar = true) {
  const onEdit = vi.fn();
  render(
    <GoalCard
      goal={goal}
      index={0}
      onContribute={vi.fn()}
      onEdit={onEdit}
      onDelete={vi.fn()}
      onComplete={vi.fn()}
      puedeEnlazar={puedeEnlazar}
    />,
  );
  return { onEdit };
}

describe('GoalCard — cuándo vence, en palabras', () => {
  it('mañana, hoy, faltan N días o hace cuánto venció', () => {
    const { unmount } = render(<GoalCard goal={meta({})} index={0} onContribute={vi.fn()} onEdit={vi.fn()} onDelete={vi.fn()} onComplete={vi.fn()} />);
    expect(screen.getByText(/vence mañana/)).toBeInTheDocument();
    unmount();
    montar(meta({ daysLeft: 0, monthsLeft: 0 }));
    expect(screen.getByText(/vence hoy/)).toBeInTheDocument();
  });

  it('vencida dice cuánto hace y qué falta', () => {
    montar(meta({ daysLeft: -2, monthsLeft: 0, feasibility: 'overdue' }));
    expect(screen.getByText(/venció hace 2 días/)).toBeInTheDocument();
    expect(screen.getByText(/La fecha pasó y faltan/)).toBeInTheDocument();
  });

  it('con menos de un mes, «Necesitas ya» lo que falta, no «al mes»', () => {
    montar(meta({}));
    expect(screen.getByText('Necesitas ya')).toBeInTheDocument();
    expect(screen.queryByText('Necesitas/mes')).not.toBeInTheDocument();
    expect(screen.getByText(/Faltan/).textContent).toMatch(/Faltan \$817 antes del/);
  });
});

describe('GoalCard — meta de una tarjeta', () => {
  it('suelta, ofrece enlazarla y abre el formulario', () => {
    const { onEdit } = montar(meta({}));
    fireEvent.click(screen.getByRole('button', { name: 'Enlazar' }));
    expect(onEdit).toHaveBeenCalled();
  });

  it('sin tarjetas en Deudas, o ya enlazada, no lo ofrece', () => {
    const { unmount } = render(
      <GoalCard goal={meta({})} index={0} onContribute={vi.fn()} onEdit={vi.fn()} onDelete={vi.fn()} onComplete={vi.fn()} puedeEnlazar={false} />,
    );
    expect(screen.queryByRole('button', { name: 'Enlazar' })).not.toBeInTheDocument();
    unmount();
    montar(meta({ debtId: 'unlimited-3650' }));
    expect(screen.queryByRole('button', { name: 'Enlazar' })).not.toBeInTheDocument();
  });

  it('enlazada, enseña la cuota de la tarjeta como su aporte', () => {
    montar(
      meta({
        debtId: 'unlimited-3650',
        targetAmount: 11440,
        savedAmount: 0,
        remaining: 11440,
        targetDate: '2027-02-28',
        daysLeft: 127,
        monthsLeft: 4.17,
        requiredMonthly: 2743,
        allocatedMonthly: 2860,
        cuotaTarjeta: 2860,
        shortfallMonthly: 0,
        feasibility: 'on_track',
      }),
    );
    expect(screen.getByText('Cuota tarjeta')).toBeInTheDocument();
    expect(screen.getByText(/La cuota de la tarjeta la liquida a tiempo/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Abonar la tarjeta' })).toBeInTheDocument();
  });
});

describe('GoalCard — enlazar de un toque', () => {
  // «tarjeta 3650» a $11,440 para el 25 ene: el 0 % de Unlimited Cash 3650
  // acaba ese día. El plan la reconoce y el enlace no pasa por el formulario.
  it('con la deuda clara, la nombra y la enlaza sin abrir el formulario', () => {
    const onLink = vi.fn();
    const onEdit = vi.fn();
    render(
      <GoalCard
        goal={meta({ targetAmount: 11440, savedAmount: 313, targetDate: '2027-01-25', daysLeft: 86 })}
        index={0}
        onContribute={vi.fn()}
        onEdit={onEdit}
        onDelete={vi.fn()}
        onComplete={vi.fn()}
        puedeEnlazar
        sugerencia={{ id: 'unlimited', name: 'Unlimited Cash 3650' }}
        onLink={onLink}
      />,
    );
    expect(screen.getByText('Unlimited Cash 3650')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Enlazar' }));
    expect(onLink).toHaveBeenCalledWith('unlimited');
    expect(onEdit).not.toHaveBeenCalled();
  });

  it('sin sugerencia, «Enlazar» sigue abriendo el formulario para elegir', () => {
    const { onEdit } = montar(meta({}));
    expect(screen.getByText(/¿Es una de tus tarjetas\?/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Enlazar' }));
    expect(onEdit).toHaveBeenCalled();
  });

  it('ya enlazada, no se ofrece nada', () => {
    render(
      <GoalCard
        goal={meta({ debtId: 'unlimited' })}
        index={0}
        onContribute={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onComplete={vi.fn()}
        puedeEnlazar
        sugerencia={{ id: 'unlimited', name: 'Unlimited Cash 3650' }}
        onLink={vi.fn()}
      />,
    );
    expect(screen.queryByRole('button', { name: 'Enlazar' })).not.toBeInTheDocument();
  });
});
