import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ComputoChip, { etiquetaChip } from './ComputoChip';
import type { EstadoComputo } from './useComputo';

const base: EstadoComputo = {
  disponible: true,
  activo: false,
  desde: '2026-10-01',
  empresa: 'Leonardo',
  ultimaSync: null,
  ultimoError: null,
  ultimoResumen: null,
  pendientes: {
    nuevos: 2,
    quitar: 0,
    muestra: [
      { ref: 'trip:t1:grocery', fecha: '2026-10-06', monto: 20.68, categoria: 'Supermercado', descripcion: 'Publix' },
      { ref: 'payment:p1', fecha: '2026-10-05', monto: 93.39, categoria: 'Servicios Públicos', descripcion: 'FPL' },
    ],
  },
  categorias: { tickets: [{ foody: '🛒 Súper', computo: 'Supermercado' }], pagos: ['Servicios Públicos'] },
};

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.style.overflow = '';
});

describe('etiquetaChip — una palabra por estado', () => {
  it('apagado, por enviar, al día, revisar', () => {
    expect(etiquetaChip(base, null).texto).toBe('apagado');
    expect(etiquetaChip({ ...base, activo: true }, null).texto).toBe('2 por enviar');
    expect(etiquetaChip({ ...base, activo: true, pendientes: { nuevos: 0, quitar: 0, muestra: [] } }, null).texto).toBe('al día');
    expect(etiquetaChip({ ...base, activo: true, ultimoError: 'x' }, null).tono).toBe('error');
  });
});

describe('ComputoChip', () => {
  it('para quien no es el dueño (404) no pinta nada', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 404 })));
    const { container } = render(<ComputoChip />);
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it('«Revisar con Computo» dice cuáles ya estaban tecleados y solo se enlazan', async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        return new Response(
          JSON.stringify({
            estado: 'simulado',
            resultados: [
              { ref: 'trip:t1:grocery', accion: 'creado' },
              { ref: 'payment:p1', accion: 'vinculado' },
            ],
          }),
        );
      }
      return new Response(JSON.stringify(base));
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<ComputoChip />);
    fireEvent.click(await screen.findByRole('button', { name: 'Computo: apagado' }));
    expect(await screen.findByText('Tus gastos entran en Leonardo')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Encender y enviar 2' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Revisar con Computo' }));
    const lista = within(screen.getByRole('list', { name: 'Gastos por enviar' }));
    expect(await lista.findByText('Ya lo tenías: se enlaza')).toBeInTheDocument();
    expect(lista.getByText('Nuevo')).toBeInTheDocument();

    const simulacion = fetchMock.mock.calls.find(([, i]) => i?.method === 'POST');
    expect(JSON.parse(String(simulacion?.[1]?.body))).toEqual({ simular: true, desde: '2026-10-01' });
  });

  it('encender manda el PUT con activo', async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) =>
      new Response(JSON.stringify(init?.method === 'PUT' ? { ...base, activo: true } : base)),
    );
    vi.stubGlobal('fetch', fetchMock);

    render(<ComputoChip />);
    fireEvent.click(await screen.findByRole('button', { name: 'Computo: apagado' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Encender y enviar 2' }));

    await waitFor(() => expect(fetchMock.mock.calls.some(([, i]) => i?.method === 'PUT')).toBe(true));
    const put = fetchMock.mock.calls.find(([, i]) => i?.method === 'PUT');
    expect(JSON.parse(String(put?.[1]?.body))).toEqual({ activo: true });
    expect(await screen.findByRole('button', { name: 'Sincronizar ahora' })).toBeInTheDocument();
  });
});
