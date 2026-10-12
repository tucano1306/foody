/**
 * programar.ts — avisar de que algo cambió, sin hacer esperar a nadie.
 *
 * Las rutas que crean o cambian gastos llaman a `programarSyncComputo` y
 * contestan en el acto: la sincronización corre DESPUÉS de la respuesta, con
 * `after()` de Next. Si Computo tarda o está caído, guardar un ticket sigue
 * siendo instantáneo; el gasto queda pendiente y la siguiente vuelta —otro
 * cambio, el cron diario o el botón de la hoja— lo manda.
 *
 * Para cualquier usuario que no sea el dueño (config.ts) no hace nada.
 */
import { after } from 'next/server';
import { configComputo } from './config';
import { sincronizarComputo } from './sync';

export function programarSyncComputo(userId: string | null | undefined): void {
  const config = configComputo();
  if (!config || !userId || userId !== config.duenoId) return;
  try {
    after(async () => {
      try {
        await sincronizarComputo(userId, { config });
      } catch (e) {
        console.error('[computo] sincronización en segundo plano:', e);
      }
    });
  } catch {
    // Fuera de una petición (pruebas, scripts) no hay `after`: no pasa nada,
    // el cron recoge lo pendiente.
  }
}
