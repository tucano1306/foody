import { NextRequest, NextResponse } from 'next/server';
import { configComputo } from '@/lib/computo/config';
import { rechazoCron } from '@/lib/cron-auth';
import { sincronizarComputo } from '@/lib/computo/sync';

/**
 * GET /api/cron/computo-sync — la red de seguridad diaria.
 *
 * Casi todo llega a Computo a los segundos de guardarse (ver programar.ts).
 * Esto recoge lo que se quedó por el camino: un Computo caído, un autopago
 * que asentó el cron de pagos, un camino que se olvidó de avisar.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const rechazo = rechazoCron(request);
  if (rechazo) return rechazo;

  const config = configComputo();
  if (!config) return NextResponse.json({ ok: true, estado: 'no_configurado' });

  const resultado = await sincronizarComputo(config.duenoId, { config });
  return NextResponse.json({ ok: resultado.estado !== 'error', ...resultado });
}
