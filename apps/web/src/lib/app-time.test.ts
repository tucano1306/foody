import { describe, expect, it } from 'vitest';
import {
  aCampoDeFecha,
  cuandoFue,
  deCampoDeFecha,
  diaDeLaFecha,
  esSoloFecha,
  formatFecha,
  normalizarSoloFecha,
  zonaDeLaFecha,
} from './app-time';

const MIAMI = 'America/New_York';
const MADRID = 'Europe/Madrid';
const corto = { day: '2-digit', month: 'short' } as const;

/**
 * El día y el mes, sin atarse a la puntuación: el ICU de Node escribe «06-sep»
 * y el del navegador «06 sep». Lo que importa aquí es QUÉ día sale.
 */
const DIA = (dia: string, mes: string) => new RegExp(`^${dia}[^a-z0-9]+${mes}`, 'i');

describe('esSoloFecha — la forma antigua de «solo un día»', () => {
  it('la medianoche UTC exacta es «solo fecha»: así se guardaba el calendario', () => {
    expect(esSoloFecha('2026-09-01T00:00:00.000Z')).toBe(true);
  });

  it('cualquier otra hora es un instante real, también el mediodía nuevo', () => {
    expect(esSoloFecha('2026-09-07T02:43:00.000Z')).toBe(false);
    expect(esSoloFecha('2026-09-01T00:00:00.001Z')).toBe(false);
    expect(esSoloFecha('2026-09-01T12:00:00.000Z')).toBe(false);
  });

  it('una fecha ilegible no es «solo fecha»', () => {
    expect(esSoloFecha('basura')).toBe(false);
  });
});

describe('formatFecha — el día que era donde está el usuario', () => {
  it('Publix del 6 sep a las 22:43 de Miami ya no sale como «07 sep»', () => {
    // 02:43 UTC del 7 = 22:43 del 6 en Miami (horario de verano, UTC−4).
    expect(formatFecha('2026-09-07T02:43:00.000Z', corto, MIAMI)).toMatch(DIA('06', 'sep'));
  });

  it('la zona es la del dispositivo: el mismo instante en Madrid ya es el 7', () => {
    expect(formatFecha('2026-09-07T02:43:00.000Z', corto, MADRID)).toMatch(DIA('07', 'sep'));
  });

  it('un día del calendario guardado a mediodía UTC es ese día en Miami y en Madrid', () => {
    expect(formatFecha('2026-09-01T12:00:00.000Z', corto, MIAMI)).toMatch(DIA('01', 'sep'));
    expect(formatFecha('2026-09-01T12:00:00.000Z', corto, MADRID)).toMatch(DIA('01', 'sep'));
  });

  it('uno antiguo, a medianoche UTC, sigue en su día y no en el anterior', () => {
    expect(formatFecha('2026-09-01T00:00:00.000Z', corto, MIAMI)).toMatch(DIA('01', 'sep'));
  });

  it('respeta el horario de invierno: en diciembre Miami va a UTC−5', () => {
    // 04:30 UTC del 1 dic = 23:30 del 30 nov en Miami.
    expect(formatFecha('2026-12-01T04:30:00.000Z', corto, MIAMI)).toMatch(DIA('30', 'nov'));
  });

  it('una fecha ilegible se devuelve tal cual', () => {
    expect(formatFecha('basura', corto, MIAMI)).toBe('basura');
  });
});

describe('diaDeLaFecha', () => {
  it('una compra de la noche del último día del mes es de ESE mes', () => {
    // 02:00 UTC del 1 oct = 22:00 del 30 sep en Miami.
    expect(diaDeLaFecha('2026-10-01T02:00:00.000Z', MIAMI)).toEqual({ year: 2026, month: 9, day: 30 });
  });

  it('un día del calendario del 1 es del 1', () => {
    expect(diaDeLaFecha('2026-10-01T12:00:00.000Z', MIAMI)).toEqual({ year: 2026, month: 10, day: 1 });
    expect(diaDeLaFecha('2026-10-01T00:00:00.000Z', MIAMI)).toEqual({ year: 2026, month: 10, day: 1 });
  });

  it('una fecha ilegible no tiene día', () => {
    expect(diaDeLaFecha('basura', MIAMI)).toBeNull();
  });
});

describe('zonaDeLaFecha', () => {
  it('se lee en la zona del usuario, salvo la medianoche UTC antigua', () => {
    expect(zonaDeLaFecha('2026-09-07T02:43:00.000Z', MIAMI)).toBe(MIAMI);
    expect(zonaDeLaFecha('2026-09-07T12:00:00.000Z', MADRID)).toBe(MADRID);
    expect(zonaDeLaFecha('2026-09-07T00:00:00.000Z', MIAMI)).toBe('UTC');
  });
});

describe('cuandoFue — lo que cabe debajo del precio', () => {
  // 12:00 del 25 de septiembre en Miami.
  const MEDIODIA = new Date('2026-09-25T16:00:00.000Z');

  it('lo de hoy es «hoy»', () => {
    expect(cuandoFue('2026-09-25T14:00:00.000Z', MIAMI, MEDIODIA)).toBe('hoy');
  });

  it('lo de anoche a las 23:00 es «ayer», aunque haya pasado una hora', () => {
    // 03:00 UTC del 25 = 23:00 del 24 en Miami; «ahora» es la 01:00 del 25.
    expect(cuandoFue('2026-09-25T03:00:00.000Z', MIAMI, new Date('2026-09-25T05:00:00.000Z'))).toBe('ayer');
  });

  it('a las 22:00 de Miami sigue siendo hoy, aunque en UTC ya sea mañana', () => {
    expect(cuandoFue('2026-09-25T14:00:00.000Z', MIAMI, new Date('2026-09-26T02:00:00.000Z'))).toBe('hoy');
  });

  it('un día del calendario de hoy es «hoy», se guardara como se guardara', () => {
    expect(cuandoFue('2026-09-25T12:00:00.000Z', MIAMI, MEDIODIA)).toBe('hoy');
    expect(cuandoFue('2026-09-25T00:00:00.000Z', MIAMI, MEDIODIA)).toBe('hoy');
  });

  it('lo de este año, con día y mes', () => {
    expect(cuandoFue('2026-07-20T15:00:00.000Z', MIAMI, MEDIODIA)).toMatch(/^20\W+jul/i);
  });

  it('lo de otro año, con mes y año: sin el año, «oct» sería el que viene', () => {
    expect(cuandoFue('2025-10-20T15:00:00.000Z', MIAMI, MEDIODIA)).toMatch(/^oct\W+2025$/i);
  });

  it('una fecha ilegible no dice nada', () => {
    expect(cuandoFue('basura', MIAMI, MEDIODIA)).toBe('');
  });
});

describe('aCampoDeFecha — el valor del calendario al editar', () => {
  it('una compra de la noche abre en SU día: guardar sin tocar no la mueve', () => {
    expect(aCampoDeFecha('2026-09-07T02:43:00.000Z', MIAMI)).toBe('2026-09-06');
  });

  it('un día del calendario abre en el día que se eligió', () => {
    expect(aCampoDeFecha('2026-09-01T12:00:00.000Z', MIAMI)).toBe('2026-09-01');
    expect(aCampoDeFecha('2026-09-01T00:00:00.000Z', MIAMI)).toBe('2026-09-01');
  });
});

describe('deCampoDeFecha — lo que se guarda para un día elegido', () => {
  it('el mediodía UTC de ese día', () => {
    expect(deCampoDeFecha('2026-09-01')).toBe('2026-09-01T12:00:00.000Z');
  });

  it('ida y vuelta: lo guardado vuelve a abrir en el mismo día, en cualquier zona', () => {
    for (const zona of [MIAMI, MADRID, 'America/Los_Angeles', 'Asia/Tokyo', 'Pacific/Honolulu']) {
      expect(aCampoDeFecha(deCampoDeFecha('2026-10-01')!, zona)).toBe('2026-10-01');
    }
  });

  it('un día que no existe no se guarda', () => {
    expect(deCampoDeFecha('2026-02-31')).toBeNull();
    expect(deCampoDeFecha('01/09/2026')).toBeNull();
    expect(deCampoDeFecha('')).toBeNull();
  });
});

describe('normalizarSoloFecha — lo que llega de una versión vieja de la app', () => {
  it('la medianoche UTC pasa a mediodía del mismo día', () => {
    expect(normalizarSoloFecha('2026-09-01T00:00:00.000Z')).toBe('2026-09-01T12:00:00.000Z');
  });

  it('un instante real se guarda tal cual', () => {
    expect(normalizarSoloFecha('2026-09-07T02:43:00.000Z')).toBe('2026-09-07T02:43:00.000Z');
    expect(normalizarSoloFecha('2026-09-01T12:00:00.000Z')).toBe('2026-09-01T12:00:00.000Z');
  });
});
