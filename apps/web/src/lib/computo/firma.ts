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
import { createHash, createHmac } from 'node:crypto';

export function firmarCuerpo(secreto: string, timestamp: number, cuerpo: string): string {
  return createHmac('sha256', secreto).update(`${timestamp}.${cuerpo}`).digest('hex');
}

/**
 * Seis caracteres del SHA-256 del secreto. En Vercel los dos secretos son
 * «Sensitive» y nadie puede leerlos: comparar las huellas es la única forma de
 * saber si Foody y Computo tienen la MISMA clave sin enseñar ninguna. 24 bits
 * de un hash no acercan a nadie a una clave de 256.
 */
export function huellaSecreto(secreto: string): string {
  return createHash('sha256').update(secreto).digest('hex').slice(0, 6);
}

/** La cabecera `x-foody-signature` para este cuerpo, firmada ahora. */
export function cabeceraFirma(secreto: string, cuerpo: string, ahoraMs: number = Date.now()): string {
  const t = Math.floor(ahoraMs / 1000);
  return `t=${t},v1=${firmarCuerpo(secreto, t, cuerpo)}`;
}
