/**
 * cliente.ts — la llamada a Computo, firmada.
 *
 * Un solo sitio que sabe la URL, la cabecera y qué hacer con un error: lo que
 * vea el usuario en la hoja de Computo sale de aquí, así que los mensajes van
 * en su idioma y dicen qué hacer.
 */
import type { ConfigComputo } from './config';
import { cabeceraFirma, huellaSecreto } from './firma';
import type { GastoComputo } from './mapeo';
import type { Borrado } from './plan';

export type AccionComputo =
  | 'creado'
  | 'actualizado'
  | 'sin_cambios'
  | 'vinculado'
  | 'borrado'
  | 'desvinculado'
  | 'no_existe'
  | 'omitido';

export interface ResultadoComputo {
  readonly ref: string;
  readonly accion: AccionComputo;
  readonly id?: string;
  /** `omitido`: por qué Computo no lo apuntó (y Foody lo deja pendiente). */
  readonly motivo?: string;
  /** Negocio: la categoría con la que Computo lo apunta, copiada de lo que ya había. */
  readonly categoria?: string;
}

export interface EmpresaComputo {
  readonly id: string;
  readonly nombre: string;
}

/** Dónde escribe Computo: la empresa personal y, si la hay, la de negocio. */
export interface EmpresasComputo {
  readonly empresa: EmpresaComputo;
  readonly empresaNegocio: EmpresaComputo | null;
}

export interface RespuestaComputo extends EmpresasComputo {
  readonly resultados: readonly ResultadoComputo[];
}

export class ErrorComputo extends Error {
  constructor(message: string, readonly status: number | null) {
    super(message);
    this.name = 'ErrorComputo';
  }
}

/**
 * Un 401 puede ser cuatro cosas distintas, y antes las cuatro decían «el
 * secreto no coincide». Con los dos secretos ilegibles en Vercel, eso dejaba
 * al usuario adivinando qué tocar. Computo manda el motivo y la huella de su
 * clave; aquí se comparan con la nuestra.
 */
function mensajeDe401(json: Record<string, unknown>, secreto: string): string {
  const motivo = typeof json.error === 'string' ? json.error : null;
  // Sin el JSON de Computo, quien contestó no es Computo: lo más habitual es
  // la protección de Vercel de una dirección de despliegue.
  if (!motivo) {
    return 'Computo no dejó pasar la llamada. COMPUTO_URL debe ser la dirección principal de Computo (https://quickbokks-clone.vercel.app), no la de un despliegue.';
  }
  if (motivo === 'Firma caducada') return 'Computo rechazó la firma por la hora: los relojes de las dos apps no coinciden.';
  const mia = huellaSecreto(secreto);
  const suya = typeof json.huella === 'string' ? json.huella : null;
  if (suya && suya !== mia) {
    return `Las claves no coinciden: Foody usa la ·${mia} y Computo la ·${suya}. Pon el mismo valor en COMPUTO_SECRET (Foody) y FOODY_SECRET (Computo) y vuelve a desplegar las dos apps.`;
  }
  if (suya) return `Las dos apps tienen la misma clave (·${mia}), pero Computo no reconoce la firma: ${motivo}.`;
  return 'Computo rechazó la firma: el secreto no coincide entre las dos apps.';
}

function mensajeDeEstado(status: number, json: Record<string, unknown>, secreto: string): string {
  const detalle = typeof json.error === 'string' ? json.error : undefined;
  if (status === 401) return mensajeDe401(json, secreto);
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
  if (!res.ok) throw new ErrorComputo(mensajeDeEstado(res.status, json, config.secreto), res.status);
  return json;
}

function empresas(json: Record<string, unknown>): EmpresasComputo {
  return {
    empresa: json.empresa as EmpresaComputo,
    empresaNegocio: (json.empresaNegocio as EmpresaComputo | null | undefined) ?? null,
  };
}

/** Comprueba la conexión y dice en qué empresas entran los gastos. */
export async function pingComputo(config: ConfigComputo): Promise<EmpresasComputo> {
  return empresas(await llamar(config, { ping: true }));
}

export async function enviarLote(
  config: ConfigComputo,
  lote: { upserts: readonly GastoComputo[]; borrar: readonly Borrado[]; simular: boolean },
): Promise<RespuestaComputo> {
  const json = await llamar(config, lote);
  return {
    ...empresas(json),
    resultados: (json.resultados as ResultadoComputo[] | undefined) ?? [],
  };
}
