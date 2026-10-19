import { describe, expect, it } from 'vitest';
import { cameraErrorMessage, coverSourceRect, fitWithin, hasLiveCamera } from './photo-capture';

describe('fitWithin', () => {
  it('no amplía lo que ya cabe', () => {
    expect(fitWithin(400, 300, 512)).toEqual({ w: 400, h: 300 });
  });

  it('apaisada: el ancho manda', () => {
    expect(fitWithin(1280, 720, 512)).toEqual({ w: 512, h: 288 });
  });

  it('vertical: el alto manda', () => {
    expect(fitWithin(720, 1280, 512)).toEqual({ w: 288, h: 512 });
  });

  it('cuadrada justo en el límite se queda igual', () => {
    expect(fitWithin(512, 512, 512)).toEqual({ w: 512, h: 512 });
  });

  it('una tira finísima nunca baja de 1 px', () => {
    expect(fitWithin(5000, 1, 512)).toEqual({ w: 512, h: 1 });
  });
});

describe('coverSourceRect — guarda lo que se ve en el visor', () => {
  it('vídeo apaisado en pantalla vertical: recorta los lados', () => {
    // 1280×720 llenando una caja de 360×640: escala 640/720, se ven 405 px de ancho.
    const r = coverSourceRect(1280, 720, 360, 640)!;
    expect(r.sh).toBe(720);
    expect(r.sy).toBe(0);
    expect(r.sw).toBeCloseTo(405, 5);
    expect(r.sx).toBeCloseTo((1280 - 405) / 2, 5);
  });

  it('vídeo vertical en caja apaisada: recorta arriba y abajo', () => {
    const r = coverSourceRect(720, 1280, 800, 400)!;
    expect(r.sw).toBe(720);
    expect(r.sx).toBe(0);
    expect(r.sh).toBeCloseTo(360, 5);
    expect(r.sy).toBeCloseTo((1280 - 360) / 2, 5);
  });

  it('mismas proporciones: el fotograma entero', () => {
    expect(coverSourceRect(1280, 720, 640, 360)).toEqual({ sx: 0, sy: 0, sw: 1280, sh: 720 });
  });

  it('el recorte siempre queda centrado y dentro del fotograma', () => {
    for (const [vw, vh, cw, ch] of [[1920, 1080, 390, 844], [480, 640, 1024, 300], [1, 1, 300, 300]]) {
      const r = coverSourceRect(vw, vh, cw, ch)!;
      expect(r.sx).toBeGreaterThanOrEqual(0);
      expect(r.sy).toBeGreaterThanOrEqual(0);
      expect(r.sx + r.sw).toBeLessThanOrEqual(vw + 1e-9);
      expect(r.sy + r.sh).toBeLessThanOrEqual(vh + 1e-9);
      expect(r.sx * 2 + r.sw).toBeCloseTo(vw, 9);
      expect(r.sy * 2 + r.sh).toBeCloseTo(vh, 9);
    }
  });

  it('sin medidas todavía (vídeo sin arrancar, caja oculta) no hay recorte', () => {
    expect(coverSourceRect(0, 0, 360, 640)).toBeNull();
    expect(coverSourceRect(1280, 720, 0, 640)).toBeNull();
    expect(coverSourceRect(Number.NaN, 720, 360, 640)).toBeNull();
  });
});

describe('hasLiveCamera', () => {
  it('sí, con mediaDevices.getUserMedia', () => {
    const nav = { mediaDevices: { getUserMedia: () => Promise.resolve() } } as unknown as Navigator;
    expect(hasLiveCamera(nav)).toBe(true);
  });

  it('no, sin contexto seguro (no hay mediaDevices)', () => {
    expect(hasLiveCamera({} as Navigator)).toBe(false);
  });

  it('no, sin navigator (render en el servidor)', () => {
    expect(hasLiveCamera(undefined)).toBe(false);
  });
});

describe('cameraErrorMessage', () => {
  const err = (name: string) => new DOMException('mensaje en inglés que no se enseña', name);

  it('permiso denegado', () => {
    expect(cameraErrorMessage(err('NotAllowedError'))).toBe('Sin permiso para usar la cámara.');
    expect(cameraErrorMessage(err('SecurityError'))).toBe('Sin permiso para usar la cámara.');
  });

  it('sin cámara', () => {
    expect(cameraErrorMessage(err('NotFoundError'))).toBe('No se encontró ninguna cámara.');
  });

  it('OverconstrainedError no siempre es un DOMException: basta con el name', () => {
    expect(cameraErrorMessage({ name: 'OverconstrainedError' })).toBe('No se encontró ninguna cámara.');
  });

  it('ocupada por otra app', () => {
    expect(cameraErrorMessage(err('NotReadableError'))).toBe('La cámara está ocupada por otra app.');
  });

  it('cualquier otra cosa', () => {
    expect(cameraErrorMessage(new Error('x'))).toBe('No se pudo abrir la cámara.');
    expect(cameraErrorMessage('texto suelto')).toBe('No se pudo abrir la cámara.');
    expect(cameraErrorMessage(null)).toBe('No se pudo abrir la cámara.');
  });
});
