/**
 * cliente.ts — la llamada a Computo, firmada.
 *
 * Un solo sitio que sabe la URL, la cabecera y qué hacer con un error: lo que
 * vea el usuario en la hoja de Computo sale de aquí, así que los mensajes van
 * en su idioma y dicen qué hacer.
 */
import type { ConfigComputo } from './config';
import { cabeceraFirma } from './firma';
import type { GastoComputo } from './mapeo';
import type { Borrado } from './plan';

export type AccionComputo =
  | 'creado'
  | 'actualizado'
  | 'sin_cambios'
  | 'vinculado'
  | 'borrado'
  | 'desvinculado'
  | 'no_existe';

export interface ResultadoComputo {
  readonly ref: string;
  readonly accion: AccionComputo;
  readonly id?: string;
}

export interface RespuestaComputo {
  readonly empresa: { id: string; nombre: string };
  readonly resultados: readonly ResultadoComputo[];
}

export class ErrorComputo extends Error {
  constructor(message: string, readonly status: number | null) {
    super(message);
    this.name = 'ErrorComputo';
  }
}

function mensajeDeEstado(status: number, detalle: string | undefined): string {
  if (status === 401) return 'Computo rechazó la firma: el secreto no coincide entre las dos apps.';
  if (status === 503) return 'Computo no tiene configurada la integración con Foody.';
  if (status === 409) return 'La empresa configurada en Computo no existe o está inactiva.';
  if (status === 422) return `Computo no aceptó los datos${detalle ? `: ${detalle}` : ''}.`;
  return `Computo respondió ${status}${detalle ? `: ${detalle}` : ''}.`;
}

async function llamar(config: ConfigComputo, cuerpo: unknown): Promise<Record<string, unknown>> {
  const texto = JSON.stringify(cuerpo);
  let res: Response;
  try {
    res = await fetch(`${config.url}/api/integrations/foody`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-foody-signature': cabeceraFirma(config.secreto, texto),
      },
      body: texto,
      cache: 'no-store',
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new ErrorComputo('No se pudo conectar con Computo. Se reintentará solo.', null);
  }
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new ErrorComputo(mensajeDeEstado(res.status, json.error as string | undefined), res.status);
  return json;
}

/** Comprueba la conexión y dice en qué empresa entran los gastos. */
export async function pingComputo(config: ConfigComputo): Promise<{ id: string; nombre: string }> {
  const json = await llamar(config, { ping: true });
  return json.empresa as { id: string; nombre: string };
}

export async function enviarLote(
  config: ConfigComputo,
  lote: { upserts: readonly GastoComputo[]; borrar: readonly Borrado[]; simular: boolean },
): Promise<RespuestaComputo> {
  const json = await llamar(config, lote);
  return {
    empresa: json.empresa as { id: string; nombre: string },
    resultados: (json.resultados as ResultadoComputo[] | undefined) ?? [],
  };
}
