import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GrupoRepetido, TiendaResumen } from '@/lib/tiendas';
import type { Lectura } from '@/lib/use-posicion';
import { ToastProvider } from '@/components/ui/Toast';
import UnirRepetidas, { firmaDeGrupo } from './UnirRepetidas';
import TiendaSheet from './TiendaSheet';

/**
 * La pantalla de Tiendas: unir los nombres repetidos y guardar dónde está
 * cada tienda. Contra un `fetch` falso que apunta qué se mandó a la API.
 *
 * Lo que importa: nada se une sin el toque del dueño, «No son la misma» no
 * vuelve a preguntar, y «Estoy aquí» no guarda una posición mala ni duplica
 * una sucursal que ya estaba.
 */

vi.mock('./MapaTiendas', () => ({ default: () => null }));

interface Llamada {
  readonly url: string;
  readonly method: string;
  readonly body: unknown;
}
let llamadas: Llamada[] = [];
let respuestas: Record<string, () => Response> = {};

const json = (datos: unknown, status = 200) =>
  new Response(JSON.stringify(datos), { status, headers: { 'Content-Type': 'application/json' } });

beforeEach(() => {
  llamadas = [];
  respuestas = {};
  localStorage.clear();
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      llamadas.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : null });
      const clave = `${method} ${url.split('?')[0]}`;
      return respuestas[clave]?.() ?? json({ message: 'no esperada' }, 500);
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const CVS: GrupoRepetido = {
  nombre: 'CVS',
  variantes: [
    { nombre: 'CVS', usos: 12 },
    { nombre: 'Cvs', usos: 3 },
    { nombre: 'CVS Pharmacy', usos: 1 },
  ],
};

describe('UnirRepetidas', () => {
  it('une con el nombre elegido y manda todas las formas', async () => {
    respuestas['POST /api/proxy/stores/merge'] = () => json({ nombre: 'CVS Pharmacy', compras: 16, sueltas: 0, sucursales: 0 });
    const onUnidas = vi.fn();
    render(
      <ToastProvider>
        <UnirRepetidas grupos={[CVS]} onUnidas={onUnidas} />
      </ToastProvider>,
    );

    expect(await screen.findByText('¿Son la misma tienda?')).toBeInTheDocument();
    // Propone la más usada; un toque cambia cuál se queda.
    expect(screen.getByRole('radio', { name: /^CVS\s*12$/ })).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(screen.getByRole('radio', { name: /CVS Pharmacy/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Unir en «CVS Pharmacy»' }));

    await waitFor(() => expect(onUnidas).toHaveBeenCalled());
    expect(llamadas).toEqual([
      { url: '/api/proxy/stores/merge', method: 'POST', body: { variants: ['CVS', 'Cvs', 'CVS Pharmacy'], name: 'CVS Pharmacy' } },
    ]);
  });

  it('«No son la misma» la esconde y no vuelve al entrar otra vez', async () => {
    const { unmount } = render(
      <ToastProvider>
        <UnirRepetidas grupos={[CVS]} onUnidas={vi.fn()} />
      </ToastProvider>,
    );
    fireEvent.click(await screen.findByRole('button', { name: 'No son la misma' }));
    await waitFor(() => expect(screen.queryByText('¿Son la misma tienda?')).not.toBeInTheDocument());
    expect(llamadas).toHaveLength(0);
    unmount();

    render(
      <ToastProvider>
        <UnirRepetidas grupos={[CVS]} onUnidas={vi.fn()} />
      </ToastProvider>,
    );
    // Se lee el almacenamiento en un efecto: se espera a que haya pasado.
    await waitFor(() => expect(localStorage.getItem('foody-tiendas-no-unir-v1')).toContain(firmaDeGrupo(CVS)));
    expect(screen.queryByText('¿Son la misma tienda?')).not.toBeInTheDocument();
  });

  it('si la unión falla, lo dice y la tarjeta sigue', async () => {
    respuestas['POST /api/proxy/stores/merge'] = () => json({ message: 'Una de las tiendas no es válida' }, 422);
    const onUnidas = vi.fn();
    render(
      <ToastProvider>
        <UnirRepetidas grupos={[CVS]} onUnidas={onUnidas} />
      </ToastProvider>,
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Unir en «CVS»' }));
    expect(await screen.findByText('Una de las tiendas no es válida')).toBeInTheDocument();
    expect(onUnidas).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Unir en «CVS»' })).toBeEnabled();
  });

  it('la firma no depende de mayúsculas ni del orden', () => {
    const otro: GrupoRepetido = { nombre: 'Cvs', variantes: [{ nombre: 'cvs pharmacy', usos: 1 }, { nombre: 'cvs', usos: 9 }] };
    expect(firmaDeGrupo(otro)).toBe(firmaDeGrupo(CVS));
  });
});

// ─── TiendaSheet ─────────────────────────────────────────────────────────────

const PUBLIX: TiendaResumen = {
  nombre: 'Publix',
  usos: 16,
  ultima: null,
  kind: 'grocery',
  sucursales: [{ id: 'p1', nombre: 'Publix', direccion: '12800 Pines Blvd', lat: 26.0, lng: -80.3 }],
};

function abrirHoja(pedir: () => Promise<Lectura>, tienda: TiendaResumen = PUBLIX) {
  const onCambio = vi.fn();
  render(
    <ToastProvider>
      <TiendaSheet tienda={tienda} yo={null} cerca={null} pedirPosicion={pedir} onCambio={onCambio} onClose={vi.fn()} />
    </ToastProvider>,
  );
  return { onCambio, hoja: screen.getByRole('dialog', { name: tienda.nombre }) };
}

const leida = (lat: number, lng: number, precision = 12) => async (): Promise<Lectura> => ({
  ok: true,
  posicion: { lat, lng, precision },
});

describe('TiendaSheet: «📍 Estoy aquí»', () => {
  it('guarda la posición con la calle, como una sucursal más', async () => {
    respuestas['GET /api/proxy/stores/reverse'] = () => json({ nombre: null, direccion: '9000 Biscayne Blvd, Miami' });
    respuestas['POST /api/proxy/stores'] = () =>
      json({ id: 'p2', nombre: 'Publix', direccion: '9000 Biscayne Blvd, Miami', lat: 25.9, lng: -80.2 }, 201);
    const { onCambio, hoja } = abrirHoja(leida(25.9, -80.2));

    fireEvent.click(within(hoja).getByRole('button', { name: '📍 Estoy aquí' }));

    await waitFor(() => expect(onCambio).toHaveBeenCalled());
    const post = llamadas.find((l) => l.method === 'POST');
    expect(post).toEqual({
      url: '/api/proxy/stores',
      method: 'POST',
      body: { name: 'Publix', address: '9000 Biscayne Blvd, Miami', latitude: 25.9, longitude: -80.2 },
    });
  });

  it('si el buscador no da la calle, se guarda igual sin ella', async () => {
    respuestas['GET /api/proxy/stores/reverse'] = () => json({ message: 'El buscador no responde ahora' }, 502);
    respuestas['POST /api/proxy/stores'] = () => json({ id: 'p2', nombre: 'Publix', direccion: null, lat: 25.9, lng: -80.2 }, 201);
    const { onCambio, hoja } = abrirHoja(leida(25.9, -80.2));
    fireEvent.click(within(hoja).getByRole('button', { name: '📍 Estoy aquí' }));
    await waitFor(() => expect(onCambio).toHaveBeenCalled());
    expect(llamadas.find((l) => l.method === 'POST')?.body).toMatchObject({ address: null });
  });

  it('a menos de 100 m de una que ya está, no la duplica', async () => {
    const { onCambio, hoja } = abrirHoja(leida(26.0005, -80.3)); // ~55 m
    fireEvent.click(within(hoja).getByRole('button', { name: '📍 Estoy aquí' }));
    expect(await screen.findByText('Esta ya estaba guardada')).toBeInTheDocument();
    expect(llamadas).toHaveLength(0);
    expect(onCambio).not.toHaveBeenCalled();
  });

  it('con un GPS impreciso no guarda nada', async () => {
    const { hoja } = abrirHoja(leida(25.9, -80.2, 650));
    fireEvent.click(within(hoja).getByRole('button', { name: '📍 Estoy aquí' }));
    expect(await screen.findByText(/El GPS aún no te ubica bien/)).toBeInTheDocument();
    expect(llamadas).toHaveLength(0);
  });

  it('sin permiso, lo dice en una línea', async () => {
    const { hoja } = abrirHoja(async () => ({ ok: false, motivo: 'denegada' }));
    fireEvent.click(within(hoja).getByRole('button', { name: '📍 Estoy aquí' }));
    expect(await screen.findByText('Foody no tiene permiso para ver tu ubicación')).toBeInTheDocument();
    expect(llamadas).toHaveLength(0);
  });
});

describe('TiendaSheet: sucursales y nombre', () => {
  it('cada sucursal con su ruta, y quitarla pregunta antes', async () => {
    respuestas['DELETE /api/proxy/stores/p1'] = () => new Response(null, { status: 204 });
    const { onCambio, hoja } = abrirHoja(leida(0, 0));

    expect(within(hoja).getByRole('link', { name: /Cómo llegar/ })).toHaveAttribute(
      'href',
      'https://www.google.com/maps/dir/?api=1&destination=26.000000,-80.300000',
    );
    fireEvent.click(within(hoja).getByRole('button', { name: 'Quitar Pines Blvd' }));
    expect(llamadas).toHaveLength(0);

    const dialogo = await screen.findByRole('alertdialog', { name: '¿Quitar esta ubicación?' });
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Quitar' }));
    await waitFor(() => expect(onCambio).toHaveBeenCalled());
    expect(llamadas).toEqual([{ url: '/api/proxy/stores/p1', method: 'DELETE', body: null }]);
  });

  it('cambiar el nombre es unir esta tienda en el nombre nuevo', async () => {
    respuestas['POST /api/proxy/stores/merge'] = () => json({ nombre: 'Publix Super Market', compras: 16, sueltas: 0, sucursales: 1 });
    const { onCambio, hoja } = abrirHoja(leida(0, 0));

    fireEvent.click(within(hoja).getByRole('button', { name: 'Cambiar nombre' }));
    fireEvent.change(within(hoja).getByRole('textbox', { name: 'Nombre de la tienda' }), { target: { value: '  Publix  Super Market ' } });
    fireEvent.click(within(hoja).getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(onCambio).toHaveBeenCalledWith('Publix Super Market'));
    expect(llamadas[0]).toEqual({
      url: '/api/proxy/stores/merge',
      method: 'POST',
      body: { variants: ['Publix'], name: 'Publix Super Market' },
    });
  });

  it('una tienda sin ubicación lo dice, sin mapa ni ruta', () => {
    const { hoja } = abrirHoja(leida(0, 0), { ...PUBLIX, nombre: 'Walmart', sucursales: [] });
    expect(within(hoja).getByText('Aún no sabes dónde está')).toBeInTheDocument();
    expect(within(hoja).queryByRole('link', { name: /Cómo llegar/ })).not.toBeInTheDocument();
  });
});

// ─── BuscarEnMapa ────────────────────────────────────────────────────────────

describe('BuscarEnMapa', () => {
  const RESULTADOS = [
    { nombre: 'Publix', direccion: '9000 Biscayne Boulevard, Miami', lat: 25.8655, lng: -80.1857, distancia: 900 },
    { nombre: 'Publix', direccion: '12800 Pines Blvd, Pembroke Pines', lat: 26.0078, lng: -80.2962, distancia: 15000 },
  ];

  it('busca al abrir con tu zona redondeada, y guarda el elegido como sucursal', async () => {
    const { default: BuscarEnMapa } = await import('./BuscarEnMapa');
    respuestas['GET /api/proxy/stores/search'] = () => json({ resultados: RESULTADOS });
    respuestas['POST /api/proxy/stores'] = () => json({ id: 'p9', nombre: 'Publix', direccion: '12800 Pines Blvd, Pembroke Pines', lat: 26.0078, lng: -80.2962 }, 201);
    const onGuardada = vi.fn();
    const yo = { lat: 26.007812, lng: -80.296234 };
    render(
      <ToastProvider>
        <BuscarEnMapa nombreFijo="Publix" cerca={yo} yo={yo} onGuardada={onGuardada} onClose={vi.fn()} />
      </ToastProvider>,
    );

    const lista = await screen.findByRole('list', { name: 'Resultados' });
    // Tu posición sale del teléfono con dos decimales, no la exacta.
    expect(llamadas[0].url).toBe('/api/proxy/stores/search?q=Publix&lat=26.01&lng=-80.30');
    // Las distancias se rehacen con tu posición: el de Pines (a tu lado) primero.
    const filas = within(lista).getAllByRole('button');
    expect(filas[0]).toHaveTextContent('12800 Pines Blvd');
    expect(filas[0]).toHaveTextContent('a 10 m');

    const guardar = screen.getByRole('button', { name: 'Guardar aquí' });
    expect(guardar).toBeDisabled();
    fireEvent.click(filas[0]);
    fireEvent.click(guardar);

    await waitFor(() => expect(onGuardada).toHaveBeenCalledWith(expect.objectContaining({ id: 'p9' })));
    expect(llamadas.at(-1)).toEqual({
      url: '/api/proxy/stores',
      method: 'POST',
      body: { name: 'Publix', address: '12800 Pines Blvd, Pembroke Pines', latitude: 26.0078, longitude: -80.2962 },
    });
  });

  it('sin tu posición no inventa distancias (el centro puede ser el de tus tiendas)', async () => {
    const { default: BuscarEnMapa } = await import('./BuscarEnMapa');
    respuestas['GET /api/proxy/stores/search'] = () => json({ resultados: RESULTADOS });
    render(
      <ToastProvider>
        <BuscarEnMapa nombreFijo="Publix" cerca={{ lat: 26, lng: -80.3 }} onGuardada={vi.fn()} onClose={vi.fn()} />
      </ToastProvider>,
    );
    const lista = await screen.findByRole('list', { name: 'Resultados' });
    expect(within(lista).queryByText(/^a \d/)).not.toBeInTheDocument();
  });

  it('una tienda nueva lleva el nombre que se buscó, y se puede corregir', async () => {
    const { default: BuscarEnMapa } = await import('./BuscarEnMapa');
    respuestas['GET /api/proxy/stores/search'] = () => json({ resultados: [RESULTADOS[0]] });
    respuestas['POST /api/proxy/stores'] = () => json({ id: 't1', nombre: "Trader Joe's", direccion: null, lat: 25.8655, lng: -80.1857 }, 201);
    render(
      <ToastProvider>
        <BuscarEnMapa consultaInicial="Trader Joe" cerca={null} onGuardada={vi.fn()} onClose={vi.fn()} />
      </ToastProvider>,
    );
    // Un único resultado queda elegido solo.
    await screen.findByRole('list', { name: 'Resultados' });
    const nombre = screen.getByRole('textbox', { name: 'Nombre de la tienda' });
    expect(nombre).toHaveValue('Trader Joe');
    fireEvent.change(nombre, { target: { value: "Trader Joe's" } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar aquí' }));
    await waitFor(() => expect(llamadas.at(-1)?.method).toBe('POST'));
    expect(llamadas.at(-1)?.body).toMatchObject({ name: "Trader Joe's" });
  });

  it('si el buscador falla, lo dice', async () => {
    const { default: BuscarEnMapa } = await import('./BuscarEnMapa');
    respuestas['GET /api/proxy/stores/search'] = () => json({ message: 'El buscador no responde ahora' }, 502);
    render(
      <ToastProvider>
        <BuscarEnMapa nombreFijo="Publix" cerca={null} onGuardada={vi.fn()} onClose={vi.fn()} />
      </ToastProvider>,
    );
    expect(await screen.findByText('El buscador no responde ahora')).toBeInTheDocument();
  });
});
