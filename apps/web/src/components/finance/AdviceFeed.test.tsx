import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Advice } from '@/lib/finance-engine';
import AdviceFeed from './AdviceFeed';

function advice(over: Partial<Advice> & { id: string }): Advice {
  return {
    tone: 'info',
    icon: '💡',
    title: 'Título',
    body: 'Cuerpo del consejo.',
    ...over,
  } as Advice;
}

const DEL_MES = advice({ id: 'negative-flow', title: 'Gastas más de lo que ingresas' });
const DE_METAS = advice({ id: 'goals-no-room', topic: 'goals', title: 'Tus metas no avanzan este mes' });

/**
 * Los consejos iban en una lista plana y no había forma de saber a qué se
 * refería cada uno: entre un aviso de deudas y otro del super aparecía «Viajar a
 * Uruguay está parada» sin nada que dijera que hablaba de una meta.
 */
describe('AdviceFeed — agrupado por tema', () => {
  it('pone las metas bajo su propio título', () => {
    render(<AdviceFeed advice={[DEL_MES, DE_METAS]} onAction={() => {}} />);

    expect(screen.getByText(/Sobre tus metas/)).toBeInTheDocument();
    expect(screen.getByText(/Sobre tu mes/)).toBeInTheDocument();
  });

  it('las metas van DESPUÉS de lo general: primero la causa, luego la consecuencia', () => {
    render(<AdviceFeed advice={[DE_METAS, DEL_MES]} onAction={() => {}} />);

    const titulos = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent ?? '');
    const iMes = titulos.findIndex((t) => t.includes('Sobre tu mes'));
    const iMetas = titulos.findIndex((t) => t.includes('Sobre tus metas'));
    expect(iMes).toBeLessThan(iMetas);
  });

  it('sin consejos de metas no hay encabezados: no se anuncia una división que no existe', () => {
    render(<AdviceFeed advice={[DEL_MES]} onAction={() => {}} />);

    expect(screen.queryByText(/Sobre tus metas/)).toBeNull();
    expect(screen.queryByText(/Sobre tu mes/)).toBeNull();
    expect(screen.getByText('Gastas más de lo que ingresas')).toBeInTheDocument();
  });

  it('solo consejos de metas: lleva su título y ninguno sobra', () => {
    render(<AdviceFeed advice={[DE_METAS]} onAction={() => {}} />);

    expect(screen.getByText(/Sobre tus metas/)).toBeInTheDocument();
    expect(screen.queryByText(/Sobre tu mes/)).toBeNull();
  });

  it('cuenta cada grupo por separado', () => {
    render(
      <AdviceFeed
        advice={[DEL_MES, advice({ id: 'credit-interest' }), DE_METAS]}
        onAction={() => {}}
      />,
    );

    expect(screen.getByText('2 consejos')).toBeInTheDocument();
    expect(screen.getByText('1 consejo')).toBeInTheDocument();
    expect(screen.getByText('3 recomendaciones')).toBeInTheDocument();
  });

  it('la tarjeta entera sigue siendo el botón', () => {
    const onAction = vi.fn();
    const conAccion = advice({
      id: 'goals-no-room',
      topic: 'goals',
      action: { label: 'Revisar pagos fijos', kind: 'open_payments' },
    });
    render(<AdviceFeed advice={[conAccion]} onAction={onAction} />);

    screen.getByRole('button', { name: /Revisar pagos fijos/ }).click();
    expect(onAction).toHaveBeenCalledWith({ label: 'Revisar pagos fijos', kind: 'open_payments' });
  });

  it('sin consejos no se monta nada', () => {
    const { container } = render(<AdviceFeed advice={[]} onAction={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });
})
