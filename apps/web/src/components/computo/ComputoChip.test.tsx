import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ComputoChip, { etiquetaChip } from './ComputoChip';
import type { EstadoComputo } from './useComputo';

const base: EstadoComputo = {
  disponible: true,
  activo: false,
  desde: '2026-10-01',
  ingresosDesde: null,
  empresa: 'Leonardo',
  empresaNegocio: null,
  ultimaSync: null,
  ultimoError: null,
  ultimoResumen: null,
  pendientes: {
    nuevos: 2,
    quitar: 0,
    muestra: [
      { ref: 'trip:t1:grocery', fecha: '2026-10-06', monto: 20.68, categoria: 'Supermercado', descripcion: 'Publix', destino: 'personal' },
      { ref: 'payment:p1', fecha: '2026-10-05', monto: 93.39, categoria: 'Servicios Públicos', descripcion: 'FPL', destino: 'personal' },
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
    expect(await screen.findByText('Tus gastos e ingresos entran en Leonardo')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Encender y enviar 2' })).toBeInTheDocument();
    // Sin fecha de ingresos todavía (se fija en la primera sincronización con
    // cobros) no hay nada que mover.
    expect(screen.queryByLabelText('Enviar los ingresos desde')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Revisar con Computo' }));
    const lista = within(screen.getByRole('list', { name: 'Por enviar' }));
    expect(await lista.findByText('Ya lo tenías: se enlaza')).toBeInTheDocument();
    expect(lista.getByText('Nuevo')).toBeInTheDocument();

    const simulacion = fetchMock.mock.calls.find(([, i]) => i?.method === 'POST');
    expect(JSON.parse(String(simulacion?.[1]?.body))).toEqual({ simular: true, desde: '2026-10-01' });
  });

  it('lo de negocio dice a qué empresa va y, al revisar, con qué categoría entra allí', async () => {
    const conNegocio: EstadoComputo = {
      ...base,
      activo: true,
      empresaNegocio: 'Venecoro',
      ultimaSync: new Date().toISOString(),
      pendientes: {
        nuevos: 1,
        quitar: 0,
        muestra: [
          { ref: 'payment:gmc:negocio', fecha: '2026-10-14', monto: 1097, categoria: 'Otros gastos', descripcion: 'GMC', destino: 'negocio' },
        ],
      },
    };
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        return new Response(
          JSON.stringify({ estado: 'simulado', resultados: [{ ref: 'payment:gmc:negocio', accion: 'creado', categoria: 'Vehiculo' }] }),
        );
      }
      return new Response(JSON.stringify(conNegocio));
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<ComputoChip />);
    fireEvent.click(await screen.findByRole('button', { name: 'Computo: 1 por enviar' }));
    expect(await screen.findByText('Personal → Leonardo · Negocio → Venecoro')).toBeInTheDocument();
    const lista = within(screen.getByRole('list', { name: 'Por enviar' }));
    expect(lista.getByText('💼 Venecoro')).toBeInTheDocument();
    // La categoría de Foody no se enseña: en Venecoro manda la que usa el usuario.
    expect(lista.queryByText('Otros gastos')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Revisar con Computo' }));
    expect(await lista.findByText('Vehiculo')).toBeInTheDocument();
    // Y la conexión se puede probar sin esperar a un error.
    expect(screen.getByRole('button', { name: 'Probar la conexión' })).toBeInTheDocument();
  });

  it('un cheque sale con «+», con la categoría que elige Computo al revisar, y su fecha de arranque se mueve', async () => {
    const conIngreso: EstadoComputo = {
      ...base,
      activo: true,
      ingresosDesde: '2026-10-26',
      ultimaSync: new Date().toISOString(),
      pendientes: {
        nuevos: 1,
        quitar: 1,
        muestra: [
          { ref: 'income:i1', fecha: '2026-11-13', monto: 1200, categoria: 'Otros Ingresos', descripcion: 'Cheque obra', destino: 'personal' },
        ],
      },
    };
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        return new Response(
          JSON.stringify({ estado: 'simulado', resultados: [{ ref: 'income:i1', accion: 'creado', categoria: 'Servicios' }] }),
        );
      }
      if (init?.method === 'PUT') return new Response(JSON.stringify({ ...conIngreso, ingresosDesde: '2026-11-01' }));
      return new Response(JSON.stringify(conIngreso));
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<ComputoChip />);
    fireEvent.click(await screen.findByRole('button', { name: 'Computo: 2 por enviar' }));
    const lista = within(screen.getByRole('list', { name: 'Por enviar' }));
    expect(lista.getByText('+$1,200.00')).toBeInTheDocument();
    // La categoría de Foody es solo una pista: manda la de los ingresos que el
    // usuario ya tiene en Computo, y esa se sabe al revisar.
    expect(lista.queryByText('Otros Ingresos')).not.toBeInTheDocument();
    expect(screen.getByText('Lo que borraste en Foody (1) sale también de Computo.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Revisar con Computo' }));
    expect(await lista.findByText('Servicios')).toBeInTheDocument();

    const fecha = screen.getByLabelText('Enviar los ingresos desde');
    expect(fecha).toHaveValue('2026-10-26');
    fireEvent.change(fecha, { target: { value: '2026-11-01' } });
    await waitFor(() => expect(fetchMock.mock.calls.some(([, i]) => i?.method === 'PUT')).toBe(true));
    const put = fetchMock.mock.calls.find(([, i]) => i?.method === 'PUT');
    expect(JSON.parse(String(put?.[1]?.body))).toEqual({ ingresosDesde: '2026-11-01' });
    expect(await screen.findByLabelText('Enviar los ingresos desde')).toHaveValue('2026-11-01');
  });

  it('un gasto no lleva «+» y enseña su categoría de Foody sin revisar', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ...base, activo: true }))));
    render(<ComputoChip />);
    fireEvent.click(await screen.findByRole('button', { name: 'Computo: 2 por enviar' }));
    const lista = within(screen.getByRole('list', { name: 'Por enviar' }));
    expect(lista.getByText('$20.68')).toBeInTheDocument();
    expect(lista.queryByText('+$20.68')).not.toBeInTheDocument();
    expect(lista.getByText('Supermercado')).toBeInTheDocument();
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
