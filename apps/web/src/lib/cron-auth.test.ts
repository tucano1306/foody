import { describe, expect, it } from 'vitest';
import { permisoCron, rechazoCron } from './cron-auth';

const SECRETO = 'un-secreto-de-cron-de-prueba-0123456789';
const PROD = { CRON_SECRET: SECRETO, NODE_ENV: 'production' };

function peticion(authorization?: string): Request {
  return new Request('https://foody.test/api/cron/payments-daily', {
    headers: authorization ? { authorization } : {},
  });
}

describe('permisoCron', () => {
  it('deja pasar al cron de Vercel, que trae el secreto', () => {
    expect(permisoCron(`Bearer ${SECRETO}`, PROD)).toBe('ok');
  });

  it('rechaza sin cabecera, con otro secreto o sin el «Bearer»', () => {
    expect(permisoCron(null, PROD)).toBe('denegado');
    expect(permisoCron('Bearer otro-secreto', PROD)).toBe('denegado');
    expect(permisoCron(SECRETO, PROD)).toBe('denegado');
    expect(permisoCron(`Bearer ${SECRETO}x`, PROD)).toBe('denegado');
  });

  it('en producción, sin secreto no corre nada — la puerta que estuvo abierta', () => {
    expect(permisoCron(null, { NODE_ENV: 'production' })).toBe('sin_secreto');
    expect(permisoCron('Bearer cualquiera', { NODE_ENV: 'production' })).toBe('sin_secreto');
    // Una variable en blanco es lo mismo que no tenerla: con ella, «Bearer »
    // abriría la puerta.
    expect(permisoCron('Bearer ', { CRON_SECRET: '  ', NODE_ENV: 'production' })).toBe('sin_secreto');
  });

  it('en desarrollo, sin secreto se puede lanzar a mano', () => {
    expect(permisoCron(null, { NODE_ENV: 'development' })).toBe('ok');
    expect(permisoCron(null, {})).toBe('ok');
  });

  it('en desarrollo, si hay secreto también se exige', () => {
    expect(permisoCron(null, { CRON_SECRET: SECRETO, NODE_ENV: 'development' })).toBe('denegado');
  });
});

describe('rechazoCron', () => {
  it('con el secreto devuelve null y la ruta sigue', () => {
    const antes = process.env.CRON_SECRET;
    process.env.CRON_SECRET = SECRETO;
    try {
      expect(rechazoCron(peticion(`Bearer ${SECRETO}`))).toBeNull();
      expect(rechazoCron(peticion())?.status).toBe(401);
    } finally {
      if (antes === undefined) delete process.env.CRON_SECRET;
      else process.env.CRON_SECRET = antes;
    }
  });
});
