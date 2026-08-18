/**
 * scroll-lock.ts — un solo candado para el scroll del fondo.
 *
 * Cada modal quería bloquear el scroll igual: guardar `body.style.overflow`,
 * ponerlo en `hidden` y restaurarlo al cerrar. Con UN modal funciona; con dos
 * SOLAPADOS se pisaban entre ellos.
 *
 * Pasaba en Deudas: tocar «Abonar» dentro de la hoja de detalle abre el modal
 * de abono y cierra la hoja a la vez, y como la hoja sale con animación, los
 * dos conviven ~180 ms. En esa ventana el modal de abono guardaba `hidden`
 * como "estado anterior" —el que había dejado la hoja— y al cerrarse lo
 * restauraba: el fondo quedaba SIN scroll con todo cerrado. Como `body` no se
 * vuelve a crear al navegar, la app entera se quedaba pegada hasta recargar.
 *
 * La solución es contar: el estado original se guarda al poner el PRIMER
 * candado y solo se restaura al quitar el ÚLTIMO. Así da igual cuántos modales
 * se solapen ni en qué orden se cierren.
 */

let depth = 0;
let savedOverflow = '';

/**
 * Bloquea el scroll del fondo y devuelve la función que lo suelta.
 *
 * La función devuelta es idempotente: llamarla dos veces no descuenta dos
 * candados (React puede reejecutar limpiezas en desarrollo con StrictMode).
 */
export function lockBodyScroll(): () => void {
  if (typeof document === 'undefined') return () => {};

  if (depth === 0) {
    savedOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  }
  depth += 1;

  let released = false;
  return function unlockBodyScroll() {
    if (released) return;
    released = true;
    depth -= 1;
    if (depth <= 0) {
      depth = 0;
      document.body.style.overflow = savedOverflow;
      savedOverflow = '';
    }
  };
}

/** Solo para las pruebas: deja el contador como recién cargado el módulo. */
export function __resetScrollLockForTests(): void {
  depth = 0;
  savedOverflow = '';
}
