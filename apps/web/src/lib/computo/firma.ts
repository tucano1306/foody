/**
 * firma.ts — cómo demuestra Foody a Computo que un lote de gastos es suyo.
 *
 * El esquema de los webhooks de Stripe: `t=<segundos>,v1=<hex>`, con v1 =
 * HMAC-SHA256 de `${t}.${cuerpo}` y el secreto que comparten las dos apps
 * (COMPUTO_SECRET aquí, FOODY_SECRET allí). El sello de tiempo va dentro de
 * la firma y Computo la rechaza a los 5 minutos: un lote capturado no se puede
 * reenviar más tarde.
 *
 * El mismo algoritmo vive en Computo (`src/lib/foody-integration/firma.ts`).
 * Las pruebas de los dos lados comprueban el mismo vector: es el contrato.
 */
import { createHmac } from 'node:crypto';

export function firmarCuerpo(secreto: string, timestamp: number, cuerpo: string): string {
  return createHmac('sha256', secreto).update(`${timestamp}.${cuerpo}`).digest('hex');
}

/** La cabecera `x-foody-signature` para este cuerpo, firmada ahora. */
export function cabeceraFirma(secreto: string, cuerpo: string, ahoraMs: number = Date.now()): string {
  const t = Math.floor(ahoraMs / 1000);
  return `t=${t},v1=${firmarCuerpo(secreto, t, cuerpo)}`;
}
