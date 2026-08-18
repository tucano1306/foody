import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CelebrationProvider, useCelebration } from './Celebration';

function Boton({ titulo = '¡Compra hecha!', detail }: { titulo?: string; detail?: string }) {
  const { celebrate } = useCelebration();
  return (
    <button type="button" onClick={() => celebrate({ emoji: '🛍️', title: titulo, detail })}>
      celebrar {titulo}
    </button>
  );
}

beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
afterEach(() => vi.useRealTimers());

describe('Celebration', () => {
  it('aparece al celebrar y se va SOLA, sin que nadie la cierre', () => {
    render(
      <CelebrationProvider>
        <Boton />
      </CelebrationProvider>,
    );
    expect(screen.queryByText('¡Compra hecha!')).toBeNull();

    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByText('¡Compra hecha!')).toBeInTheDocument();

    act(() => void vi.advanceTimersByTime(2500));
    expect(screen.queryByText('¡Compra hecha!')).toBeNull();
  });

  it('se puede tocar para cerrarla antes', () => {
    render(
      <CelebrationProvider>
        <Boton />
      </CelebrationProvider>,
    );
    fireEvent.click(screen.getByRole('button'));

    fireEvent.click(screen.getByRole('status'));
    act(() => void vi.advanceTimersByTime(400));
    expect(screen.queryByText('¡Compra hecha!')).toBeNull();
  });

  it('NO bloquea el scroll del fondo — ese fue un bug caro', () => {
    render(
      <CelebrationProvider>
        <Boton />
      </CelebrationProvider>,
    );
    fireEvent.click(screen.getByRole('button'));
    expect(document.body.style.overflow).toBe('');

    act(() => void vi.advanceTimersByTime(2500));
    expect(document.body.style.overflow).toBe('');
  });

  it('se anuncia a los lectores de pantalla sin robar el foco', () => {
    render(
      <CelebrationProvider>
        <Boton />
      </CelebrationProvider>,
    );
    const disparador = screen.getByRole('button');
    disparador.focus();
    fireEvent.click(disparador);

    const capa = screen.getByRole('status');
    expect(capa).toHaveAttribute('aria-live', 'polite');
    // No es un diálogo: el foco se queda donde el usuario lo tenía.
    expect(document.activeElement).toBe(disparador);
  });

  it('muestra el dato de orgullo cuando lo hay', () => {
    render(
      <CelebrationProvider>
        <Boton detail="12 artículos · $48.20" />
      </CelebrationProvider>,
    );
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByText('12 artículos · $48.20')).toBeInTheDocument();
  });

  it('una celebración nueva sustituye a la que está — no se encolan', () => {
    function Dos() {
      const { celebrate } = useCelebration();
      return (
        <>
          <button type="button" onClick={() => celebrate({ emoji: '🛍️', title: 'Primera' })}>a</button>
          <button type="button" onClick={() => celebrate({ emoji: '🧺', title: 'Segunda' })}>b</button>
        </>
      );
    }
    render(
      <CelebrationProvider>
        <Dos />
      </CelebrationProvider>,
    );

    fireEvent.click(screen.getByText('a'));
    fireEvent.click(screen.getByText('b'));

    expect(screen.getByText('Segunda')).toBeInTheDocument();
    expect(screen.queryByText('Primera')).toBeNull();
  });

  it('sin proveedor no truena: la acción sigue funcionando', () => {
    // Una celebración que falta jamás puede tumbar lo que la disparó.
    render(<Boton />);
    expect(() => fireEvent.click(screen.getByRole('button'))).not.toThrow();
  });
});

describe('Celebration — no deja capas fantasma', () => {
  it('varias seguidas dejan UNA sola capa, y al final ninguna', () => {
    // El riesgo real de una capa `fixed inset-0`: si se acumulan o si una se
    // queda montada, la app entera se vuelve intocable.
    function Rafaga() {
      const { celebrate } = useCelebration();
      return (
        <button type="button" onClick={() => celebrate({ emoji: '🛍️', title: 'Otra' })}>
          disparar
        </button>
      );
    }
    render(
      <CelebrationProvider>
        <Rafaga />
      </CelebrationProvider>,
    );

    const disparar = screen.getByRole('button');
    for (let i = 0; i < 5; i++) fireEvent.click(disparar);
    expect(screen.getAllByRole('status')).toHaveLength(1);

    act(() => void vi.advanceTimersByTime(3000));
    expect(screen.queryAllByRole('status')).toHaveLength(0);
  });
});
