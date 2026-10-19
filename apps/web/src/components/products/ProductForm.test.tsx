import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
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

/**
 * El botón 📸 abría la app de cámara del sistema; en Android eso hacía que el
 * sistema cerrara Chrome y la foto volvía a una página muerta, con el aviso
 * «falta de memoria» de Chrome. Ahora la cámara se abre dentro de la página.
 */
describe('ProductForm — la foto con la cámara', () => {
  function conCamara(getUserMedia: () => Promise<MediaStream>) {
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: vi.fn(getUserMedia) },
    });
  }

  // La cámara se carga bajo demanda (next/dynamic). Con la suite entera en
  // paralelo, la primera transformación del módulo pasaba del segundo que
  // espera `findBy` y el primer test fallaba solo a veces. Precargada, el
  // import dinámico se resuelve al momento.
  beforeAll(async () => {
    await import('./ProductCamera');
  });

  afterEach(() => {
    Reflect.deleteProperty(navigator, 'mediaDevices');
    vi.restoreAllMocks();
  });

  it('📸 abre la cámara dentro de la página, no la app de cámara del sistema', async () => {
    conCamara(() => new Promise<MediaStream>(() => undefined)); // pidiendo permiso
    const clickNativo = vi.spyOn(HTMLInputElement.prototype, 'click');
    render(<ProductForm />);

    fireEvent.click(screen.getByRole('button', { name: '📸 Cámara' }));

    expect(await screen.findByRole('dialog', { name: 'Cámara' })).toBeInTheDocument();
    expect(clickNativo).not.toHaveBeenCalled();
  });

  it('sin cámara en la página (http, navegador viejo) queda la del sistema', () => {
    const clickNativo = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => undefined);
    render(<ProductForm />);

    fireEvent.click(screen.getByRole('button', { name: '📸 Cámara' }));

    expect(clickNativo).toHaveBeenCalledTimes(1);
    const input = clickNativo.mock.contexts[0] as HTMLInputElement;
    expect(input.getAttribute('capture')).toBe('environment');
    expect(screen.queryByRole('dialog', { name: 'Cámara' })).not.toBeInTheDocument();
  });

  it('desde la cámara, «Galería» cierra la cámara y abre el selector', async () => {
    conCamara(() => Promise.reject(new DOMException('denied', 'NotAllowedError')));
    const clickNativo = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => undefined);
    render(<ProductForm />);
    fireEvent.click(screen.getByRole('button', { name: '📸 Cámara' }));
    await screen.findByRole('alert');

    // Dos «Galería»: la del formulario y la de la cámara; la de la cámara es la última.
    const galerias = screen.getAllByRole('button', { name: '🖼️ Galería' });
    fireEvent.click(galerias[galerias.length - 1]);

    expect(screen.queryByRole('dialog', { name: 'Cámara' })).not.toBeInTheDocument();
    expect(clickNativo).toHaveBeenCalledTimes(1);
    expect((clickNativo.mock.contexts[0] as HTMLInputElement).hasAttribute('capture')).toBe(false);
  });

  it('la foto tomada se sube y el producto guarda su URL, no la imagen', async () => {
    const track = { stop: vi.fn(), addEventListener: vi.fn() };
    conCamara(async () => ({ getTracks: () => [track], getVideoTracks: () => [track] }) as unknown as MediaStream);
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage: vi.fn(),
    } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (cb) {
      cb(new Blob(['jpeg'], { type: 'image/jpeg' }));
    });

    const subidas: FormData[] = [];
    const altas: Array<Record<string, unknown>> = [];
    globalThis.fetch = vi.fn(async (url: unknown, init?: RequestInit) => {
      if (url === '/api/upload/photo') {
        subidas.push(init?.body as FormData);
        return new Response(JSON.stringify({ url: 'https://blob/salsa.jpg' }), { status: 201 });
      }
      altas.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      return new Response(JSON.stringify({ id: 'n', name: 'Salsa' }), { status: 201 });
    }) as typeof fetch;

    render(<ProductForm />);
    fireEvent.change(screen.getByLabelText(/nombre/i), { target: { value: 'Salsa' } });
    fireEvent.click(screen.getByRole('button', { name: '📸 Cámara' }));
    await screen.findByRole('dialog', { name: 'Cámara' });

    const video = document.querySelector('video')!;
    await waitFor(() => expect(video.srcObject).toBeTruthy());
    Object.defineProperty(video, 'videoWidth', { configurable: true, value: 720 });
    Object.defineProperty(video, 'videoHeight', { configurable: true, value: 1280 });
    video.getBoundingClientRect = () => ({ width: 390, height: 600 }) as DOMRect;
    fireEvent.loadedData(video);
    fireEvent.click(screen.getByRole('button', { name: 'Tomar foto' }));

    // La cámara se cierra y se apaga; la foto se ve en el formulario.
    expect(await screen.findByAltText('preview')).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Cámara' })).not.toBeInTheDocument();
    expect(track.stop).toHaveBeenCalled();
    expect(subidas).toHaveLength(1);
    expect((subidas[0].get('file') as Blob).type).toBe('image/jpeg');

    fireEvent.submit(screen.getByRole('button', { name: 'Agregar producto' }).closest('form')!);

    await waitFor(() => expect(push).toHaveBeenCalledWith('/products'));
    expect(altas[0].photoUrl).toBe('https://blob/salsa.jpg');
  });
});
