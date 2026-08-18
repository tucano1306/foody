import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { GoalProjection } from '@/lib/finance-engine';
import { applyOrder, moveInOrder } from '@/lib/goal-order';
import GoalReorderList from './GoalReorderList';

function goal(id: string, name: string): GoalProjection {
  return {
    goalId: id,
    name,
    emoji: '🎯',
    kind: 'project',
    priority: 1,
    targetAmount: 1000,
    savedAmount: 100,
    remaining: 900,
    percentComplete: 10,
    targetDate: null,
    daysLeft: null,
    monthsLeft: null,
    requiredMonthly: 90,
    requiredWeekly: 21,
    requiredDaily: 3,
    allocatedMonthly: 50,
    shortfallMonthly: 40,
    projectedDate: null,
    monthsLate: 0,
    feasibility: 'at_risk',
    status: 'active',
  };
}

const GOALS = [goal('a', 'Viajar'), goal('b', 'Pagar tarjetas'), goal('c', 'Fondo')];

/** Réplica mínima de lo que hace el Plan financiero con la lista. */
function Harness({ onSave }: { onSave: (ids: readonly string[]) => void }) {
  const [order, setOrder] = useState<readonly string[]>(GOALS.map((g) => g.goalId));
  const goals = applyOrder(GOALS, order, (g) => g.goalId);

  return (
    <GoalReorderList
      goals={goals}
      onReorder={setOrder}
      onCommit={() => onSave(order)}
      onMove={(id, delta) => {
        const next = moveInOrder(order, id, delta);
        if (next === order) return;
        setOrder(next);
        onSave(next);
      }}
      onContribute={() => {}}
      onEdit={() => {}}
      onDelete={() => {}}
      onComplete={() => {}}
    />
  );
}

function nombresEnPantalla(): string[] {
  return screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent ?? '');
}

describe('GoalReorderList', () => {
  it('cada meta trae su asa, nombrada para quien no ve la pantalla', () => {
    render(<Harness onSave={() => {}} />);
    expect(screen.getByLabelText('Cambiar el orden de Viajar')).toBeInTheDocument();
    expect(screen.getByLabelText('Cambiar el orden de Pagar tarjetas')).toBeInTheDocument();
    expect(screen.getByLabelText('Cambiar el orden de Fondo')).toBeInTheDocument();
  });

  it('la flecha abajo baja la meta y guarda el orden nuevo', () => {
    const onSave = vi.fn();
    render(<Harness onSave={onSave} />);
    expect(nombresEnPantalla()).toEqual(['Viajar', 'Pagar tarjetas', 'Fondo']);

    fireEvent.keyDown(screen.getByLabelText('Cambiar el orden de Viajar'), { key: 'ArrowDown' });

    expect(nombresEnPantalla()).toEqual(['Pagar tarjetas', 'Viajar', 'Fondo']);
    expect(onSave).toHaveBeenCalledWith(['b', 'a', 'c']);
  });

  it('la flecha arriba sube la meta', () => {
    const onSave = vi.fn();
    render(<Harness onSave={onSave} />);

    fireEvent.keyDown(screen.getByLabelText('Cambiar el orden de Fondo'), { key: 'ArrowUp' });

    expect(nombresEnPantalla()).toEqual(['Viajar', 'Fondo', 'Pagar tarjetas']);
    expect(onSave).toHaveBeenCalledWith(['a', 'c', 'b']);
  });

  it('empujar la primera hacia arriba no hace nada ni guarda', () => {
    const onSave = vi.fn();
    render(<Harness onSave={onSave} />);

    fireEvent.keyDown(screen.getByLabelText('Cambiar el orden de Viajar'), { key: 'ArrowUp' });

    expect(nombresEnPantalla()).toEqual(['Viajar', 'Pagar tarjetas', 'Fondo']);
    expect(onSave).not.toHaveBeenCalled();
  });

  it('con una sola meta no hay asa: no hay nada que ordenar', () => {
    render(
      <GoalReorderList
        goals={[goal('a', 'Viajar')]}
        onReorder={() => {}}
        onCommit={() => {}}
        onMove={() => {}}
        onContribute={() => {}}
        onEdit={() => {}}
        onDelete={() => {}}
        onComplete={() => {}}
      />,
    );
    expect(screen.queryByLabelText(/Cambiar el orden/)).toBeNull();
    expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent('Viajar');
  });

  it('otras teclas no mueven nada — el asa no secuestra el teclado', () => {
    const onSave = vi.fn();
    render(<Harness onSave={onSave} />);

    const asa = screen.getByLabelText('Cambiar el orden de Viajar');
    fireEvent.keyDown(asa, { key: 'Enter' });
    fireEvent.keyDown(asa, { key: 'Tab' });

    expect(nombresEnPantalla()).toEqual(['Viajar', 'Pagar tarjetas', 'Fondo']);
    expect(onSave).not.toHaveBeenCalled();
  });
});
