import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ProductCamera from './ProductCamera';

/**
 * La cámara de la foto de producto vive DENTRO de la página: la del sistema
 * hacía que Android cerrara Chrome y la foto se perdía con «falta de memoria»
 * (ver lib/photo-capture.ts). Lo que importa aquí es que nunca se quede
 * encendida, que la foto sea lo encuadrado a 512 px y que, si no arranca,
 * siempre quede una salida.
 */

interface PistaFalsa {
  stop: ReturnType<typeof vi.fn>;
  terminar: () => void;
}

function pista(): PistaFalsa & MediaStreamTrack {
  const alTerminar: Array<() => void> = [];
  return {
    stop: vi.fn(),
    addEventListener: (tipo: string, fn: () => void) => {
      if (tipo === 'ended') alTerminar.push(fn);
    },
    terminar: () => alTerminar.forEach((fn) => fn()),
  } as unknown as PistaFalsa & MediaStreamTrack;
}

function flujo(track: MediaStreamTrack): MediaStream {
  return { getTracks: () => [track], getVideoTracks: () => [track] } as unknown as MediaStream;
}

let getUserMedia: ReturnType<typeof vi.fn>;

function conCamara(impl: () => Promise<MediaStream>) {
  getUserMedia = vi.fn(impl);
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia },
  });
}

function props() {
  return {
    onCapture: vi.fn(),
    onClose: vi.fn(),
    onGallery: vi.fn(),
    onSystemCamera: vi.fn(),
  };
}

/** El vídeo recibe su primer fotograma (720×1280, móvil en vertical). */
function primerFotograma() {
  const video = document.querySelector('video')!;
  Object.defineProperty(video, 'videoWidth', { configurable: true, value: 720 });
  Object.defineProperty(video, 'videoHeight', { configurable: true, value: 1280 });
  video.getBoundingClientRect = () => ({ width: 390, height: 600 }) as DOMRect;
  fireEvent.loadedData(video);
  return video;
}

const dibujado = vi.fn();

beforeEach(() => {
  dibujado.mockReset();
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    drawImage: dibujado,
  } as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (cb) {
    cb(new Blob(['jpeg'], { type: 'image/jpeg' }));
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ProductCamera — abrir y cerrar', () => {
  it('pide la cámara trasera, sin audio y a una resolución modesta', async () => {
    conCamara(async () => flujo(pista()));
    render(<ProductCamera {...props()} />);

    await waitFor(() => expect(getUserMedia).toHaveBeenCalledTimes(1));
    const pedido = getUserMedia.mock.calls[0][0] as MediaStreamConstraints;
    expect(pedido.audio).toBe(false);
    expect(pedido.video).toMatchObject({
      facingMode: { ideal: 'environment' },
      width: { ideal: 1280 },
      height: { ideal: 720 },
    });
  });

  it('el disparador espera al primer fotograma (si no, foto negra)', async () => {
    conCamara(async () => flujo(pista()));
    render(<ProductCamera {...props()} />);
    await waitFor(() => expect(getUserMedia).toHaveBeenCalled());

    expect(screen.getByRole('button', { name: 'Tomar foto' })).toBeDisabled();
    primerFotograma();
    expect(screen.getByRole('button', { name: 'Tomar foto' })).toBeEnabled();
  });

  it('al cerrarse apaga la cámara', async () => {
    const track = pista();
    conCamara(async () => flujo(track));
    const p = props();
    const { unmount } = render(<ProductCamera {...p} />);
    await waitFor(() => expect(document.querySelector('video')!.srcObject).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: 'Cerrar cámara' }));
    expect(p.onClose).toHaveBeenCalledTimes(1);

    unmount();
    expect(track.stop).toHaveBeenCalled();
  });

  it('Escape cierra', async () => {
    conCamara(async () => flujo(pista()));
    const p = props();
    render(<ProductCamera {...p} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(p.onClose).toHaveBeenCalledTimes(1);
  });

  it('si se cierra mientras el navegador pide permiso, la cámara no se queda encendida', async () => {
    const track = pista();
    let conceder: (s: MediaStream) => void = () => undefined;
    conCamara(() => new Promise<MediaStream>((r) => { conceder = r; }));
    const { unmount } = render(<ProductCamera {...props()} />);

    unmount();
    await act(async () => { conceder(flujo(track)); });
    expect(track.stop).toHaveBeenCalled();
  });
});

describe('ProductCamera — tomar la foto', () => {
  it('entrega lo encuadrado a 512 px y apaga la cámara', async () => {
    const track = pista();
    conCamara(async () => flujo(track));
    const p = props();
    render(<ProductCamera {...p} />);
    await waitFor(() => expect(document.querySelector('video')!.srcObject).toBeTruthy());
    const video = primerFotograma();

    fireEvent.click(screen.getByRole('button', { name: 'Tomar foto' }));

    await waitFor(() => expect(p.onCapture).toHaveBeenCalledTimes(1));
    const foto = p.onCapture.mock.calls[0][0] as Blob;
    expect(foto.type).toBe('image/jpeg');

    // 720×1280 en una caja de 390×600: el ancho llena la caja (escala
    // 390/720), así que se ve todo el ancho y un alto de 600·720/390 ≈ 1107.7
    // px, centrado; lo de arriba y abajo no estaba en el visor. Sale a 512 de alto.
    const [origen, sx, sy, sw, sh, dx, dy, dw, dh] = dibujado.mock.calls[0];
    expect(origen).toBe(video);
    expect(sx).toBe(0);
    expect(sw).toBe(720);
    expect(sh).toBeCloseTo((600 * 720) / 390, 5);
    expect(sy).toBeCloseTo((1280 - sh) / 2, 5);
    expect([dx, dy]).toEqual([0, 0]);
    expect(dh).toBe(512);
    expect(dw).toBe(Math.round((720 * 512) / Math.round(sh)));

    expect(track.stop).toHaveBeenCalled();
  });

  it('un doble toque no saca dos fotos', async () => {
    conCamara(async () => flujo(pista()));
    const p = props();
    render(<ProductCamera {...p} />);
    await waitFor(() => expect(document.querySelector('video')!.srcObject).toBeTruthy());
    primerFotograma();

    const disparador = screen.getByRole('button', { name: 'Tomar foto' });
    fireEvent.click(disparador);
    fireEvent.click(disparador);

    await waitFor(() => expect(p.onCapture).toHaveBeenCalled());
    expect(p.onCapture).toHaveBeenCalledTimes(1);
    expect(dibujado).toHaveBeenCalledTimes(1);
  });

  it('si el lienzo no da la foto, lo dice en vez de entregar nada', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (cb) {
      cb(null);
    });
    conCamara(async () => flujo(pista()));
    const p = props();
    render(<ProductCamera {...p} />);
    await waitFor(() => expect(document.querySelector('video')!.srcObject).toBeTruthy());
    primerFotograma();

    fireEvent.click(screen.getByRole('button', { name: 'Tomar foto' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo tomar la foto.');
    expect(p.onCapture).not.toHaveBeenCalled();
  });
});

describe('ProductCamera — cuando la cámara no arranca, siempre hay salida', () => {
  it('permiso denegado: lo dice y ofrece galería y la cámara del teléfono', async () => {
    conCamara(() => Promise.reject(new DOMException('Permission denied', 'NotAllowedError')));
    const p = props();
    render(<ProductCamera {...p} />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Sin permiso para usar la cámara.');

    fireEvent.click(screen.getByRole('button', { name: '🖼️ Galería' }));
    expect(p.onGallery).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: '📸 Cámara del teléfono' }));
    expect(p.onSystemCamera).toHaveBeenCalledTimes(1);
  });

  it('el ✕ queda por encima de la capa de error y de la de carga', async () => {
    // jsdom no maqueta, así que se comprueba el orden: entre hermanos con
    // `absolute`, el último se pinta encima. Con el ✕ antes de las capas, en
    // el navegador quedaba tapado y en el móvil no había forma de salir.
    let rechazar: (e: unknown) => void = () => undefined;
    conCamara(() => new Promise<MediaStream>((_, r) => { rechazar = r; }));
    render(<ProductCamera {...props()} />);

    const cerrar = screen.getByRole('button', { name: 'Cerrar cámara' });
    expect(cerrar.parentElement!.lastElementChild).toBe(cerrar); // abriendo

    await act(async () => { rechazar(new DOMException('no', 'NotAllowedError')); });
    await screen.findByRole('alert');
    expect(cerrar.parentElement!.lastElementChild).toBe(cerrar); // error
  });

  it('Reintentar vuelve a pedir la cámara', async () => {
    conCamara(() => Promise.reject(new DOMException('busy', 'NotReadableError')));
    render(<ProductCamera {...props()} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('ocupada por otra app');

    getUserMedia.mockImplementation(async () => flujo(pista()));
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));

    await waitFor(() => expect(getUserMedia).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  });

  it('si otra app se lleva la cámara a mitad, avisa en vez de quedarse en negro', async () => {
    const track = pista();
    conCamara(async () => flujo(track));
    render(<ProductCamera {...props()} />);
    await waitFor(() => expect(document.querySelector('video')!.srcObject).toBeTruthy());
    primerFotograma();

    act(() => track.terminar());

    expect(await screen.findByRole('alert')).toHaveTextContent('La cámara se cerró.');
    expect(screen.getByRole('button', { name: 'Tomar foto' })).toBeDisabled();
  });
});
