export function haptic(pattern: number | number[] = 10): void {
  if (globalThis.window === undefined) return;
  if (!('vibrate' in navigator)) return;
  // Sin un toque previo en la página, Chrome bloquea la vibración y lo apunta
  // como error en la consola. Pasa con lo que vibra solo, como el aviso de
  // «Estás en Publix» al abrir el Súper: mejor no intentarlo.
  const activacion = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation;
  if (activacion && !activacion.hasBeenActive) return;
  try {
    navigator.vibrate(pattern);
  } catch {
    /* noop */
  }
}
