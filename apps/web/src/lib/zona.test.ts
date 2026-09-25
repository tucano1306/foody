import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ZONA_POR_DEFECTO, horaDePared, mediodiaDelDia, zonaDelDispositivo, zonaValida } from './zona';

describe('zonaValida — la cookie no se cree a ciegas', () => {
  it('acepta las zonas que conoce Intl', () => {
    expect(zonaValida('America/New_York')).toBe('America/New_York');
    expect(zonaValida('Europe/Madrid')).toBe('Europe/Madrid');
    expect(zonaValida('UTC')).toBe('UTC');
  });

  it('rechaza lo que no es una zona: va a parar a SQL y a Intl', () => {
    expect(zonaValida('Marte/Olympus')).toBeNull();
    expect(zonaValida("America/New_York'; DROP TABLE products; --")).toBeNull();
    expect(zonaValida('')).toBeNull();
    expect(zonaValida('x'.repeat(65))).toBeNull();
    expect(zonaValida(undefined)).toBeNull();
    expect(zonaValida(42)).toBeNull();
  });

  it('la de casa es Miami', () => {
    expect(ZONA_POR_DEFECTO).toBe('America/New_York');
  });

  it('la del dispositivo siempre es una zona válida', () => {
    expect(zonaValida(zonaDelDispositivo())).not.toBeNull();
  });
});

describe('horaDePared — el `now` que ven los motores', () => {
  it('a las 22:00 del 30 sep en Miami, el mes es septiembre y no octubre', () => {
    // 02:00 UTC del 1 de octubre.
    const d = horaDePared(new Date('2026-10-01T02:00:00.000Z'), 'America/New_York');
    expect([d.getFullYear(), d.getMonth() + 1, d.getDate(), d.getHours()]).toEqual([2026, 9, 30, 22]);
  });

  it('el mismo instante en Madrid ya es el 1 de octubre a las 4', () => {
    const d = horaDePared(new Date('2026-10-01T02:00:00.000Z'), 'Europe/Madrid');
    expect([d.getMonth() + 1, d.getDate(), d.getHours()]).toEqual([10, 1, 4]);
  });

  it('respeta el horario de invierno: en diciembre Miami va a UTC−5', () => {
    const d = horaDePared(new Date('2026-12-01T04:30:00.000Z'), 'America/New_York');
    expect([d.getMonth() + 1, d.getDate(), d.getHours(), d.getMinutes()]).toEqual([11, 30, 23, 30]);
  });

  it('la medianoche es la hora 0, no la 24', () => {
    const d = horaDePared(new Date('2026-09-26T04:00:00.000Z'), 'America/New_York');
    expect([d.getDate(), d.getHours()]).toEqual([26, 0]);
  });
});

describe('mediodiaDelDia — un DÍA calculado, enviado al navegador', () => {
  it('el día de los campos locales, a mediodía UTC', () => {
    expect(mediodiaDelDia(new Date(2026, 9, 5))).toBe('2026-10-05T12:00:00.000Z');
  });

  it('se lee como ese mismo día de UTC−11 a UTC+11', () => {
    const iso = mediodiaDelDia(new Date(2026, 9, 5));
    for (const zona of ['Pacific/Pago_Pago', 'America/New_York', 'Europe/Madrid', 'Asia/Tokyo', 'Pacific/Noumea']) {
      const dia = new Intl.DateTimeFormat('en-US', { timeZone: zona, day: 'numeric' }).format(new Date(iso));
      expect(dia, zona).toBe('5');
    }
  });
});

/* ─── Guardián ──────────────────────────────────────────────────────────── */

function fuentes(dir: string, out: string[] = []): string[] {
  for (const nombre of readdirSync(dir)) {
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) fuentes(ruta, out);
    else if (/\.tsx?$/.test(nombre) && !/\.test\.tsx?$/.test(nombre)) out.push(ruta);
  }
  return out;
}

/**
 * «Este mes» o «hoy» contados en la hora de la base, que es UTC. Así estaban
 * ~25 consultas: la última noche de cada mes, lo gastado desde Miami caía en
 * el mes siguiente en el Plan, en Estadísticas y en el presupuesto.
 */
const MES_EN_UTC = [
  /DATE_TRUNC\(\s*'(day|week|month|year)'\s*,\s*NOW\(\)\s*\)/i,
  /DATE_TRUNC\(\s*'(day|week|month|year)'\s*,\s*NOW\(\)\s*-/i,
  /\bCURRENT_DATE\b/,
  /TO_CHAR\(\s*(t\.|pp\.)?(date|purchased_at|occurred_at)\s*,/i,
];

describe('nadie vuelve a contar el mes en UTC', () => {
  it('ninguna consulta usa «este mes» sin la zona del usuario', () => {
    const raiz = join(__dirname, '..');
    const culpables = fuentes(raiz).filter((f) => {
      const texto = readFileSync(f, 'utf8');
      return MES_EN_UTC.some((re) => re.test(texto));
    });

    expect(
      culpables.map((f) => f.slice(raiz.length + 1).replace(/\\/g, '/')),
      'Cuenta el mes en la zona del usuario: `(col AT TIME ZONE ${zona}) >= ' +
        "DATE_TRUNC('month', NOW() AT TIME ZONE ${zona})`, con la zona de " +
        'zonaDelUsuario() (lib/zona-servidor.ts).',
    ).toEqual([]);
  });

  it('nadie saca «hoy» cortando un ISO, que es el día en UTC', () => {
    const raiz = join(__dirname, '..');
    const culpables = fuentes(raiz).filter((f) =>
      /new Date\(\)\.toISOString\(\)\.(slice\(0,\s*10\)|split\('T'\))/.test(readFileSync(f, 'utf8')),
    );
    expect(culpables).toEqual([]);
  });
});
