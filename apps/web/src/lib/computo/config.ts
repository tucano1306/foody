/**
 * config.ts — si el enlace con Computo existe, y para quién.
 *
 * Es para UN usuario: el dueño de las dos apps. Las tres variables viven en
 * Vercel y no en la base, así que ningún otro usuario de Foody puede ni verlo
 * ni encenderlo:
 *
 *   COMPUTO_URL          https://quickbokks-clone.vercel.app
 *   COMPUTO_SECRET       el secreto compartido (allí: FOODY_SECRET), ≥ 32 caracteres
 *   COMPUTO_OWNER_EMAIL  el email con el que el dueño entra en Foody
 *
 * Sin las tres, todo lo de Computo está apagado y no se nota en ningún sitio.
 */
import { emailToUuid } from '../server-auth';

export interface ConfigComputo {
  readonly url: string;
  readonly secreto: string;
  /** El id de Foody del dueño: el email pasa por el mismo hash que el login. */
  readonly duenoId: string;
}

export function configComputo(env: NodeJS.ProcessEnv = process.env): ConfigComputo | null {
  const url = env.COMPUTO_URL?.trim().replace(/\/+$/, '') ?? '';
  const secreto = env.COMPUTO_SECRET?.trim() ?? '';
  const email = env.COMPUTO_OWNER_EMAIL?.trim() ?? '';
  if (!/^https:\/\/[^\s/]+/.test(url) || secreto.length < 32 || !email.includes('@')) return null;
  return { url, secreto, duenoId: emailToUuid(email) };
}

/** ¿Este usuario de Foody es el dueño del enlace? */
export function computoDisponiblePara(userId: string | null | undefined, env: NodeJS.ProcessEnv = process.env): boolean {
  const config = configComputo(env);
  return config !== null && !!userId && userId === config.duenoId;
}
