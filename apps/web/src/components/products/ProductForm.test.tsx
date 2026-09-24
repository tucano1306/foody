import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ProductForm from './ProductForm';

const push = vi.fn();
const refresh = vi.fn();
const celebrate = vi.fn();
const show = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh }),
}));
vi.mock('@/components/ui/Celebration', () => ({
  useCelebration: () => ({ celebrate }),
}));
vi.mock('@/components/ui/Toast', () => ({
  useToast: () => ({ show }),
}));
vi.mock('@/lib/sound', () => ({ playSound: vi.fn() }));

/**
 * El servidor no crea una segunda ficha para un nombre que ya tienes: devuelve
 * la que hay con un 200 en vez de 201. El formulario lo ignoraba y celebraba
 * «¡A la despensa!» igual, así que el usuario buscaba su producto nuevo, no lo
 * encontraba, y lo volvía a dar de alta con otro nombre.
 */

function responde(status: number, body: unknown) {
  globalThis.fetch = vi.fn().mockResolvedValue(
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }),
  ) as typeof fetch;
}

function guardar(nombre: string) {
  render(<ProductForm />);
  fireEvent.change(screen.getByLabelText(/nombre/i), { target: { value: nombre } });
  fireEvent.submit(screen.getByRole('button', { name: 'Agregar producto' }).closest('form')!);
}

beforeEach(() => {
  push.mockReset();
  refresh.mockReset();
  celebrate.mockReset();
  show.mockReset();
});
afterEach(() => vi.restoreAllMocks());

describe('ProductForm — alta de un producto', () => {
  it('uno nuevo se celebra y lleva a la despensa', async () => {
    responde(201, { id: 'nuevo', name: 'Remolachas' });
    guardar('Remolachas');

    await waitFor(() => expect(push).toHaveBeenCalledWith('/products'));
    expect(celebrate).toHaveBeenCalledTimes(1);
    expect(show).not.toHaveBeenCalled();
  });

  it('si ya existía, lo dice y lleva a la ficha que ya tenías', async () => {
    responde(200, { id: 'viejo', name: 'Mantequilla' });
    guardar('mantequilla');

    await waitFor(() => expect(push).toHaveBeenCalledWith('/products/viejo'));
    expect(show).toHaveBeenCalledWith(expect.stringContaining('Ya tenías «Mantequilla»'), 'info');
    // Lo que no puede pasar: celebrar un alta que no ha ocurrido.
    expect(celebrate).not.toHaveBeenCalled();
  });
});
