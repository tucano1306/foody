/**
 * Un evento suelto para abrir la paleta de comandos desde cualquier sitio.
 *
 * La paleta vive al final del layout y solo se abría con ⌘K, así que en un
 * teléfono —donde no hay teclado físico— era una función de la app a la que
 * literalmente no se podía llegar. Los botones de lupa (cabecera móvil y barra
 * lateral) disparan este evento en vez de levantar el estado hasta el layout,
 * que es un `async` de servidor y no puede tener `useState`.
 */
export const OPEN_PALETTE_EVENT = 'foody:open-palette';

export function openCommandPalette(): void {
  if (globalThis.window === undefined) return;
  globalThis.window.dispatchEvent(new CustomEvent(OPEN_PALETTE_EVENT));
}
