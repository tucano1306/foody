import { beforeEach, describe, expect, it } from 'vitest';
import { __resetScrollLockForTests, lockBodyScroll } from './scroll-lock';

describe('scroll-lock', () => {
  beforeEach(() => {
    __resetScrollLockForTests();
    document.body.style.overflow = '';
  });

  it('bloquea y libera con un solo candado', () => {
    const unlock = lockBodyScroll();
    expect(document.body.style.overflow).toBe('hidden');
    unlock();
    expect(document.body.style.overflow).toBe('');
  });

  it('mantiene el bloqueo mientras quede algún candado (cierre en orden)', () => {
    const a = lockBodyScroll();
    const b = lockBodyScroll();
    b();
    expect(document.body.style.overflow).toBe('hidden');
    a();
    expect(document.body.style.overflow).toBe('');
  });

  it('también aguanta si se cierran en orden inverso — el caso de Deudas', () => {
    // El detalle abre el candado, el abono se monta encima y el detalle se
    // desmonta DESPUÉS (su animación de salida termina más tarde).
    const detalle = lockBodyScroll();
    const abono = lockBodyScroll();
    detalle();
    expect(document.body.style.overflow).toBe('hidden'); // el abono sigue abierto
    abono();
    expect(document.body.style.overflow).toBe('');
  });

  it('respeta el overflow que ya tenía la página', () => {
    document.body.style.overflow = 'clip';
    const unlock = lockBodyScroll();
    expect(document.body.style.overflow).toBe('hidden');
    unlock();
    expect(document.body.style.overflow).toBe('clip');
  });

  it('soltar dos veces el mismo candado no descuenta de más', () => {
    const a = lockBodyScroll();
    const b = lockBodyScroll();
    a();
    a(); // repetido: no debe liberar el candado de b
    expect(document.body.style.overflow).toBe('hidden');
    b();
    expect(document.body.style.overflow).toBe('');
  });
})
