/**
 * zona-servidor.ts — la zona del usuario, leída en el servidor.
 *
 * Aparte de zona.ts porque importa `next/headers`, que no existe en el
 * navegador. La usan las páginas y las rutas; los motores siguen puros y
 * reciben `now` ya convertido.
 */
import { cookies } from 'next/headers';
import { COOKIE_ZONA, ZONA_POR_DEFECTO, horaDePared, zonaValida } from './zona';

/**
 * La zona del dispositivo del usuario, de su cookie.
 *
 * Sin cookie —la primera visita, o quien no pasa por un navegador, como los
 * crons— vale la de casa. Fuera de una petición `cookies()` lanza; ahí también.
 */
export async function zonaDelUsuario(): Promise<string> {
  try {
    const almacen = await cookies();
    return zonaValida(almacen.get(COOKIE_ZONA)?.value) ?? ZONA_POR_DEFECTO;
  } catch {
    return ZONA_POR_DEFECTO;
  }
}

/** La zona, y el `now` de pared en ella para los motores de calendario. */
export async function relojDelUsuario(): Promise<{ zona: string; ahora: Date }> {
  const zona = await zonaDelUsuario();
  return { zona, ahora: horaDePared(new Date(), zona) };
}
