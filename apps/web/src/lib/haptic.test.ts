import { afterEach, describe, expect, it, vi } from 'vitest';
import { haptic } from './haptic';

/** Vibrar solo cuando el navegador lo va a permitir, sin ensuciar la consola. */
describe('haptic', () => {
  const original = Object.getOwnPropertyDescriptor(navigator, 'userActivation');
  afterEach(() => {
    if (original) Object.defineProperty(navigator, 'userActivation', original);
    else delete (navigator as unknown as Record<string, unknown>).userActivation;
  });

  function conVibracion() {
    const vibrate = vi.fn(() => true);
    Object.defineProperty(navigator, 'vibrate', { configurable: true, value: vibrate });
    return vibrate;
  }

  it('sin un toque previo en la página no lo intenta', () => {
    const vibrate = conVibracion();
    Object.defineProperty(navigator, 'userActivation', { configurable: true, value: { hasBeenActive: false } });
    haptic(10);
    expect(vibrate).not.toHaveBeenCalled();
  });

  it('tras un toque, vibra', () => {
    const vibrate = conVibracion();
    Object.defineProperty(navigator, 'userActivation', { configurable: true, value: { hasBeenActive: true } });
    haptic([10, 20]);
    expect(vibrate).toHaveBeenCalledWith([10, 20]);
  });

  it('un navegador sin userActivation (Safari viejo) vibra como antes', () => {
    const vibrate = conVibracion();
    haptic(10);
    expect(vibrate).toHaveBeenCalledWith(10);
  });
});
