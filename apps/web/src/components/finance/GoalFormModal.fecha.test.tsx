import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { FinanceGoal } from '@/lib/finance-engine';
import GoalFormModal, { type GoalPayload } from './GoalFormModal';

/**
 * La fecha de una meta enganchada puede ser la de la tarjeta (el fin del 0 %,
 * o el día en que termina a su cuota) y moverse con ella. Aquí se prueba que
 * el formulario no la congela al guardar otra cosa, que escribir una fecha a
 * mano la hace del usuario, y que un toque la devuelve a la tarjeta.
 */

const DEUDA = 'd0000000-0000-4000-8000-000000000001';

const DEUDAS = [{ id: DEUDA, name: 'Compras 3650', balance: 152.04, fechaPropuesta: '2026-12-13' }];

function meta(over: Partial<FinanceGoal> = {}): FinanceGoal {
  return {
    id: 'g1', name: 'Compras 3650', emoji: '💳', kind: 'debt', targetAmount: 1026.54, savedAmount: 874.5,
    targetDate: '2026-12-13', priority: 1, monthlyOverride: null, status: 'active', note: null,
    createdAt: '2026-11-08T00:00:00.000Z', debtId: DEUDA, dateFollowsDebt: true, ...over,
  };
}

function abrir(goal: FinanceGoal | null) {
  const onSave = vi.fn<(p: GoalPayload) => Promise<void>>(async () => undefined);
  render(<GoalFormModal goal={goal} monthlyAvailable={500} debts={DEUDAS} onSave={onSave} onClose={() => undefined} />);
  return onSave;
}

async function guardar(onSave: ReturnType<typeof abrir>): Promise<GoalPayload> {
  fireEvent.click(screen.getByRole('button', { name: /Guardar|Crear/ }));
  await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
  return onSave.mock.calls[0][0];
}

const fecha = () => screen.getByLabelText('¿Para cuándo?') as HTMLInputElement;
const boton = () => screen.getByRole('button', { name: /La fecha de la tarjeta/ });

describe('la fecha de una meta enganchada', () => {
  it('editar el nombre no congela la fecha: sigue siendo la de la tarjeta', async () => {
    const onSave = abrir(meta());
    expect(boton()).toHaveAttribute('aria-pressed', 'true');
    expect(fecha().value).toBe('2026-12-13');

    fireEvent.change(screen.getByDisplayValue('Compras 3650'), { target: { value: 'Liquidar compras' } });
    const p = await guardar(onSave);

    expect(p.name).toBe('Liquidar compras');
    expect(p.dateFollowsDebt).toBe(true);
    expect(p.targetDate).toBe('2026-12-13');
  });

  it('escribir otra fecha la hace del usuario', async () => {
    const onSave = abrir(meta());
    fireEvent.change(fecha(), { target: { value: '2027-06-30' } });
    expect(boton()).toHaveAttribute('aria-pressed', 'false');

    const p = await guardar(onSave);
    expect(p.dateFollowsDebt).toBe(false);
    expect(p.targetDate).toBe('2027-06-30');
  });

  it('un toque la devuelve a la tarjeta, con la fecha que la tarjeta dice hoy', async () => {
    const onSave = abrir(meta({ dateFollowsDebt: false, targetDate: '2027-06-30' }));
    expect(fecha().value).toBe('2027-06-30');

    fireEvent.click(boton());
    expect(fecha().value).toBe('2026-12-13');

    const p = await guardar(onSave);
    expect(p.dateFollowsDebt).toBe(true);
    expect(p.targetDate).toBe('2026-12-13');
  });

  it('desenganchar la tarjeta deja la fecha en manos del usuario', async () => {
    const onSave = abrir(meta());
    fireEvent.click(screen.getByRole('button', { name: /Compras 3650/ }));
    expect(screen.queryByRole('button', { name: /La fecha de la tarjeta/ })).toBeNull();

    const p = await guardar(onSave);
    expect(p.debtId).toBeNull();
    expect(p.dateFollowsDebt).toBe(false);
  });

  it('una meta sin tarjeta no ofrece la fecha de ninguna', () => {
    abrir(meta({ debtId: null, dateFollowsDebt: false, kind: 'trip' }));
    expect(screen.queryByRole('button', { name: /La fecha de la tarjeta/ })).toBeNull();
  });
});
