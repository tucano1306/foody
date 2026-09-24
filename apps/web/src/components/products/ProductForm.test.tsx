import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ProductForm from './ProductForm';

const push = vi.fn();
const refresh = vi.fn();
const celebrate = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh }),
}));
vi.mock('@/components/ui/Celebration', () => ({
  useCelebration: () => ({ celebrate }),
}));
vi.mock('@/lib/sound', () => ({ playSound: vi.fn() }));

/**
 * El usuario da de alta el mismo nombre A PROPÓSITO cuando es otra marca:
 * «hay muchas marcas de mantequilla o de huevos». Primero la app fusionaba la
 * segunda con la primera sin decir nada —y celebraba «¡A la despensa!» igual—;
 * luego avisaba, pero seguía sin dejarle crearla. Ahora pregunta.
 */

const EXISTENTE = { id: 'viejo', name: 'Mantequilla', photoUrl: null };

/** Cola de respuestas del servidor, en orden. Guarda lo que se le mandó. */
function servidor(...respuestas: Array<[number, unknown]>) {
  const enviados: Array<Record<string, unknown>> = [];
  globalThis.fetch = vi.fn(async (_url: unknown, init?: RequestInit) => {
    enviados.push(JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>);
    const [status, body] = respuestas.shift() ?? [500, {}];
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;
  return enviados;
}

function escribirYGuardar(nombre: string) {
  render(<ProductForm />);
  fireEvent.change(screen.getByLabelText(/nombre/i), { target: { value: nombre } });
  fireEvent.submit(screen.getByRole('button', { name: 'Agregar producto' }).closest('form')!);
}

beforeEach(() => {
  push.mockReset();
  refresh.mockReset();
  celebrate.mockReset();
});

describe('ProductForm — alta de un producto', () => {
  it('uno nuevo se celebra y lleva a la despensa', async () => {
    servidor([201, { id: 'nuevo', name: 'Remolachas' }]);
    escribirYGuardar('Remolachas');

    await waitFor(() => expect(push).toHaveBeenCalledWith('/products'));
    expect(celebrate).toHaveBeenCalledTimes(1);
  });
});

describe('ProductForm — el nombre ya existe', () => {
  it('pregunta en vez de decidir, y no celebra nada', async () => {
    servidor([409, { existing: EXISTENTE }]);
    escribirYGuardar('mantequilla');

    expect(await screen.findByRole('group', { name: 'Ya tienes Mantequilla' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Agregar otra marca' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Es la misma' })).toBeInTheDocument();
    // Ni alta celebrada ni navegación: todavía no ha pasado nada.
    expect(celebrate).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });

  it('otra marca, con su nombre: la marca va al nombre y se comprueba de nuevo', async () => {
    const enviados = servidor([409, { existing: EXISTENTE }], [201, { id: 'n2', name: 'Mantequilla Kerrygold' }]);
    escribirYGuardar('Mantequilla');

    fireEvent.change(await screen.findByLabelText('Marca'), { target: { value: 'Kerrygold' } });
    fireEvent.click(screen.getByRole('button', { name: 'Agregar otra marca' }));

    await waitFor(() => expect(push).toHaveBeenCalledWith('/products'));
    expect(enviados[1].name).toBe('Mantequilla Kerrygold');
    // Sin saltarse la comprobación: si «Mantequilla Kerrygold» también
    // existiera, tiene que volver a preguntar en vez de duplicarla.
    expect(enviados[1].otraMarca).toBeUndefined();
    expect(celebrate).toHaveBeenCalledTimes(1);
  });

  it('otra marca, sin escribirla: se crea con el mismo nombre', async () => {
    const enviados = servidor([409, { existing: EXISTENTE }], [201, { id: 'n3', name: 'Mantequilla' }]);
    escribirYGuardar('Mantequilla');

    fireEvent.click(await screen.findByRole('button', { name: 'Agregar otra marca' }));

    await waitFor(() => expect(push).toHaveBeenCalledWith('/products'));
    expect(enviados[1].name).toBe('Mantequilla');
    expect(enviados[1].otraMarca).toBe(true);
  });

  it('«es la misma» lleva a la que ya tienes y no escribe nada', async () => {
    const enviados = servidor([409, { existing: EXISTENTE }]);
    escribirYGuardar('Mantequilla');

    fireEvent.click(await screen.findByRole('button', { name: 'Es la misma' }));

    expect(push).toHaveBeenCalledWith('/products/viejo');
    expect(enviados).toHaveLength(1);
    expect(celebrate).not.toHaveBeenCalled();
  });

  it('cambiar el nombre retira la pregunta', async () => {
    servidor([409, { existing: EXISTENTE }]);
    escribirYGuardar('Mantequilla');
    await screen.findByRole('group', { name: 'Ya tienes Mantequilla' });

    fireEvent.change(screen.getByLabelText(/nombre/i), { target: { value: 'Mantequilla de maní' } });

    expect(screen.queryByRole('group', { name: 'Ya tienes Mantequilla' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Agregar producto' })).toBeInTheDocument();
  });
});
