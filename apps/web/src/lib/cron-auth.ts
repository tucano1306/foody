import { createHash, timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';

export type PermisoCron = 'ok' | 'sin_secreto' | 'denegado';

/**
 * ¿Esta llamada la hace el cron de Vercel?
 *
 * Vercel manda `Authorization: Bearer <CRON_SECRET>` a sus crons cuando la
 * variable existe. Antes cada ruta comprobaba `if (cronSecret && …)`, así que
 * SIN la variable la puerta quedaba abierta. En producción estuvo así hasta el
 * 13 de octubre de 2026: cualquier GET —o un HEAD, que Next resuelve
 * ejecutando el GET— mandaba avisos al móvil y podía adelantar un autopago.
 * Ahora, en producción, sin variable no se ejecuta nada.
 *
 * En desarrollo se deja pasar sin variable, para poder lanzar un cron a mano.
 */
export function permisoCron(
  authorization: string | null,
  env: { CRON_SECRET?: string; NODE_ENV?: string } = process.env,
): PermisoCron {
  const secreto = env.CRON_SECRET;
  if (!secreto?.trim()) return env.NODE_ENV === 'production' ? 'sin_secreto' : 'ok';
  if (!authorization) return 'denegado';
  // Se comparan huellas de longitud fija: `timingSafeEqual` exige buffers del
  // mismo tamaño, y así la longitud de lo recibido tampoco se filtra.
  const recibido = createHash('sha256').update(authorization).digest();
  const esperado = createHash('sha256').update(`Bearer ${secreto}`).digest();
  return timingSafeEqual(recibido, esperado) ? 'ok' : 'denegado';
}

/**
 * La respuesta con la que una ruta de cron se niega, o `null` si puede seguir.
 *
 * Sin secreto responde 503 y no 401: no es que el llamante se equivoque, es
 * que el despliegue está mal configurado, y así se distingue en los logs.
 */
export function rechazoCron(request: Request): NextResponse | null {
  const permiso = permisoCron(request.headers.get('authorization'));
  if (permiso === 'ok') return null;
  if (permiso === 'sin_secreto') {
    return NextResponse.json({ error: 'CRON_SECRET no está configurado' }, { status: 503 });
  }
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}
