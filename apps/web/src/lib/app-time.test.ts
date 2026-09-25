import { describe, expect, it } from 'vitest';
import { APP_TZ, aCampoDeFecha, cuandoFue, diaDeLaFecha, esSoloFecha, formatFecha, zonaDeLaFecha } from './app-time';

const corto = { day: '2-digit', month: 'short' } as const;

/**
 * El día y el mes, sin atarse a la puntuación: el ICU de Node escribe «06-sep»
 * y el del navegador «06 sep». Lo que importa aquí es QUÉ día sale.
 */
const DIA = (dia: string, mes: string) => new RegExp(`^${dia}[^a-z0-9]+${mes}`, 'i');

describe('esSoloFecha', () => {
  it('la medianoche UTC exacta es «solo fecha»: así se guarda el calendario', () => {
    expect(esSoloFecha('2026-09-01T00:00:00.000Z')).toBe(true);
  });

  it('cualquier otra hora es un instante real', () => {
    expect(esSoloFecha('2026-09-07T02:43:00.000Z')).toBe(false);
    expect(esSoloFecha('2026-09-01T00:00:00.001Z')).toBe(false);
  });

  it('una fecha ilegible no es «solo fecha»', () => {
    expect(esSoloFecha('basura')).toBe(false);
  });
});

describe('formatFecha — el día que era en Miami', () => {
  it('Publix del 6 sep a las 22:43 de Miami ya no sale como «07 sep»', () => {
    // 02:43 UTC del 7 = 22:43 del 6 en Miami (horario de verano, UTC−4).
    expect(formatFecha('2026-09-07T02:43:00.000Z', corto)).toMatch(DIA('06', 'sep'));
  });

  it('Walmart del 12 ago a las 23:03 de Miami ya no sale como «13 ago»', () => {
    expect(formatFecha('2026-08-13T03:03:00.000Z', corto)).toMatch(DIA('12', 'ago'));
  });

  it('un ticket del calendario sigue en su día, no en el anterior', () => {
    // Medianoche UTC del 1 de septiembre: en Miami serían las 20:00 del 31 de
    // agosto, pero es un día elegido en el calendario, no una hora.
    expect(formatFecha('2026-09-01T00:00:00.000Z', corto)).toMatch(DIA('01', 'sep'));
  });

  it('respeta el horario de invierno: en diciembre Miami va a UTC−5', () => {
    // 04:30 UTC del 1 dic = 23:30 del 30 nov en Miami.
    expect(formatFecha('2026-12-01T04:30:00.000Z', corto)).toMatch(DIA('30', 'nov'));
  });

  it('una fecha ilegible se devuelve tal cual', () => {
    expect(formatFecha('basura', corto)).toBe('basura');
  });
});

describe('diaDeLaFecha', () => {
  it('una compra de la noche del último día del mes es de ESE mes', () => {
    // 02:00 UTC del 1 oct = 22:00 del 30 sep en Miami.
    expect(diaDeLaFecha('2026-10-01T02:00:00.000Z')).toEqual({ year: 2026, month: 9, day: 30 });
  });

  it('un ticket del calendario del día 1 es del día 1', () => {
    expect(diaDeLaFecha('2026-10-01T00:00:00.000Z')).toEqual({ year: 2026, month: 10, day: 1 });
  });

  it('una fecha ilegible no tiene día', () => {
    expect(diaDeLaFecha('basura')).toBeNull();
  });
});

describe('zonaDeLaFecha', () => {
  it('Miami es America/New_York', () => {
    expect(APP_TZ).toBe('America/New_York');
    expect(zonaDeLaFecha('2026-09-07T02:43:00.000Z')).toBe(APP_TZ);
    expect(zonaDeLaFecha('2026-09-07T00:00:00.000Z')).toBe('UTC');
  });
});

describe('cuandoFue — lo que cabe debajo del precio', () => {
  // 12:00 del 25 de septiembre en Miami.
  const MEDIODIA = new Date('2026-09-25T16:00:00.000Z');

  it('lo de hoy es «hoy»', () => {
    expect(cuandoFue('2026-09-25T14:00:00.000Z', MEDIODIA)).toBe('hoy');
  });

  it('lo de anoche a las 23:00 es «ayer», aunque haya pasado una hora', () => {
    // 03:00 UTC del 25 = 23:00 del 24 en Miami; «ahora» es la 01:00 del 25.
    expect(cuandoFue('2026-09-25T03:00:00.000Z', new Date('2026-09-25T05:00:00.000Z'))).toBe('ayer');
  });

  it('a las 22:00 de Miami sigue siendo hoy, aunque en UTC ya sea mañana', () => {
    expect(cuandoFue('2026-09-25T14:00:00.000Z', new Date('2026-09-26T02:00:00.000Z'))).toBe('hoy');
  });

  it('un ticket del calendario de hoy es «hoy», no «ayer»', () => {
    // Medianoche UTC = las 20:00 del día anterior en Miami, si se leyera como hora.
    expect(cuandoFue('2026-09-25T00:00:00.000Z', MEDIODIA)).toBe('hoy');
  });

  it('lo de este año, con día y mes', () => {
    expect(cuandoFue('2026-07-20T15:00:00.000Z', MEDIODIA)).toMatch(DIA('20', 'jul'));
  });

  it('lo de otro año, con mes y año: sin el año, «oct» sería el que viene', () => {
    expect(cuandoFue('2025-10-20T15:00:00.000Z', MEDIODIA)).toMatch(/^oct\W+2025$/i);
  });

  it('una fecha ilegible no dice nada', () => {
    expect(cuandoFue('basura', MEDIODIA)).toBe('');
  });
});

describe('aCampoDeFecha — el valor del calendario al editar', () => {
  it('una compra de la noche abre en SU día: guardar sin tocar no la mueve', () => {
    expect(aCampoDeFecha('2026-09-07T02:43:00.000Z')).toBe('2026-09-06');
  });

  it('un ticket del calendario abre en el día que se eligió', () => {
    expect(aCampoDeFecha('2026-09-01T00:00:00.000Z')).toBe('2026-09-01');
  });
});
