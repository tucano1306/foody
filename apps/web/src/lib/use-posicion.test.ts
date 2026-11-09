import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { textoDeFalloDePosicion, usePosicion } from './use-posicion';

/**
 * La posición del teléfono: que una lectura suelta diga POR QUÉ falló, y que
 * vigilar no gaste batería con la pantalla apagada ni pasado el tiempo.
 */

const DENEGADO = 1;
const TIMEOUT = 3;

let watch: ReturnType<typeof vi.fn>;
let clearWatch: ReturnType<typeof vi.fn>;
let getCurrentPosition: ReturnType<typeof vi.fn>;

function error(code: number): GeolocationPositionError {
  return { code, message: '', PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 } as GeolocationPositionError;
}

function ponerVisibilidad(estado: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => estado });
  document.dispatchEvent(new Event('visibilitychange'));
}

beforeEach(() => {
  vi.useFakeTimers();
  watch = vi.fn(() => 7);
  clearWatch = vi.fn();
  getCurrentPosition = vi.fn();
  Object.defineProperty(globalThis.navigator, 'geolocation', {
    configurable: true,
    value: { watchPosition: watch, clearWatch, getCurrentPosition },
  });
  ponerVisibilidad('visible');
});

afterEach(() => {
  vi.useRealTimers();
});

describe('pedir()', () => {
  it('devuelve la posición', async () => {
    getCurrentPosition.mockImplementation((ok: PositionCallback) =>
      ok({ coords: { latitude: 26, longitude: -80, accuracy: 9 } } as GeolocationPosition),
    );
    const { result } = renderHook(() => usePosicion({ vigilar: false }));
    let r: Awaited<ReturnType<typeof result.current.pedir>> | undefined;
    await act(async () => {
      r = await result.current.pedir();
    });
    expect(r).toEqual({ ok: true, posicion: { lat: 26, lng: -80, precision: 9 } });
    expect(result.current.posicion).toEqual({ lat: 26, lng: -80, precision: 9 });
  });

  it('sin permiso dice «denegada»; un tiempo agotado es un fallo', async () => {
    const { result } = renderHook(() => usePosicion({ vigilar: false }));

    getCurrentPosition.mockImplementationOnce((_ok: PositionCallback, mal: PositionErrorCallback) => mal(error(DENEGADO)));
    await act(async () => {
      expect(await result.current.pedir()).toEqual({ ok: false, motivo: 'denegada' });
    });
    expect(result.current.permiso).toBe('denegado');

    getCurrentPosition.mockImplementationOnce((_ok: PositionCallback, mal: PositionErrorCallback) => mal(error(TIMEOUT)));
    await act(async () => {
      expect(await result.current.pedir()).toEqual({ ok: false, motivo: 'fallo' });
    });
  });

  it('sin geolocalización en el navegador, lo dice', async () => {
    Object.defineProperty(globalThis.navigator, 'geolocation', { configurable: true, value: undefined });
    const { result } = renderHook(() => usePosicion({ vigilar: false }));
    await act(async () => {
      expect(await result.current.pedir()).toEqual({ ok: false, motivo: 'no-disponible' });
    });
    expect(textoDeFalloDePosicion('no-disponible')).toBe('Este navegador no da la ubicación');
  });
});

describe('vigilar', () => {
  it('no vigila si no se pide', () => {
    renderHook(() => usePosicion({ vigilar: false }));
    expect(watch).not.toHaveBeenCalled();
  });

  it('deja de vigilar al apagar la pantalla y vuelve al encenderla', () => {
    renderHook(() => usePosicion({ vigilar: true }));
    expect(watch).toHaveBeenCalledTimes(1);

    act(() => ponerVisibilidad('hidden'));
    expect(clearWatch).toHaveBeenCalledWith(7);

    act(() => ponerVisibilidad('visible'));
    expect(watch).toHaveBeenCalledTimes(2);
  });

  it('para solo pasado el tiempo máximo', () => {
    renderHook(() => usePosicion({ vigilar: true, maxMs: 60_000 }));
    expect(clearWatch).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(60_001));
    expect(clearWatch).toHaveBeenCalledWith(7);
  });

  it('con el permiso denegado deja de intentarlo', () => {
    watch.mockImplementation((_ok: PositionCallback, mal: PositionErrorCallback) => {
      mal(error(DENEGADO));
      return 7;
    });
    const { result } = renderHook(() => usePosicion({ vigilar: true }));
    expect(result.current.estado).toBe('denegada');
    // El efecto se vuelve a evaluar con el permiso denegado y no arranca otra vigilancia.
    expect(watch).toHaveBeenCalledTimes(1);
  });
});
