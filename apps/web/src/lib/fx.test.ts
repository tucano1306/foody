import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cameBackTo, ranOutFrom } from './fx';

/**
 * jsdom no trae ni `matchMedia` ni la API de animaciones, así que hay que
 * ponerlas. No es maquillaje para que pase la prueba: lo que se comprueba es
 * que la capa de partículas se crea y —sobre todo— que se RECOGE. Una capa
 * `position:fixed` olvidada en el documento se va acumulando invisible con cada
 * toque.
 */
function stubBrowser({ reduced = false }: { reduced?: boolean } = {}) {
  vi.stubGlobal('matchMedia', () => ({ matches: reduced }));
  Element.prototype.animate = vi.fn(() => ({}) as Animation);
}

function capas(): number {
  return document.querySelectorAll('body > div[aria-hidden="true"]').length;
}

function tarjeta(): HTMLElement {
  const el = document.createElement('div');
  el.getBoundingClientRect = () =>
    ({ left: 100, top: 200, width: 160, height: 120 }) as DOMRect;
  document.body.append(el);
  return el;
}

beforeEach(() => {
  vi.useFakeTimers();
  document.body.innerHTML = '';
  stubBrowser();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe.each([
  ['ranOutFrom', ranOutFrom],
  ['cameBackTo', cameBackTo],
])('%s', (_nombre, efecto) => {
  it('dibuja una capa y la recoge sola', () => {
    efecto(tarjeta());
    expect(capas()).toBe(1);

    vi.advanceTimersByTime(5000);
    expect(capas()).toBe(0);
  });

  it('no deja nada si no hay elemento del que salir', () => {
    efecto(null);
    efecto(undefined);
    expect(capas()).toBe(0);
  });

  it('con «reducir movimiento» no dibuja nada', () => {
    stubBrowser({ reduced: true });
    efecto(tarjeta());
    expect(capas()).toBe(0);
  });

  it('varios toques seguidos se recogen todos', () => {
    const el = tarjeta();
    for (let i = 0; i < 4; i++) efecto(el);
    expect(capas()).toBe(4);

    vi.advanceTimersByTime(5000);
    expect(capas()).toBe(0);
  });
});

describe('las dos animaciones cuentan historias opuestas', () => {
  it('«se acabó» manda el carrito hacia ARRIBA y «sí lo tengo» hacia ABAJO', () => {
    // El detalle que hace que una se lea como «se fue a la lista» y la otra
    // como «volvió al estante». Si alguien las iguala, esto lo dice.
    const capturados: Keyframe[][] = [];
    Element.prototype.animate = ((keyframes: Keyframe[]) => {
      if (Array.isArray(keyframes)) capturados.push(keyframes);
      return {} as Animation;
    }) as Element['animate'];

    // En «se acabó» el carrito se anima el ÚLTIMO; en «sí lo tengo», el primero.
    ranOutFrom(tarjeta());
    const seFue = capturados.at(-1);

    capturados.length = 0;
    cameBackTo(tarjeta());
    const volvio = capturados[0];

    expect(seFue).toBeDefined();
    expect(volvio).toBeDefined();

    // El carrito de «se acabó» TERMINA muy por encima de la tarjeta…
    expect(String(seFue?.at(-1)?.transform)).toContain('-210%');
    // …y el de «sí lo tengo» EMPIEZA justo ahí y baja hasta ella.
    expect(String(volvio?.[0]?.transform)).toContain('-210%');
    expect(String(volvio?.at(-1)?.transform)).toContain('-50%');
  });
})
