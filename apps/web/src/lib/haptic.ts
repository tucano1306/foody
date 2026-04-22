export function haptic(pattern: number | number[] = 10): void {
  if (globalThis.window === undefined) return;
  if (!('vibrate' in navigator)) return;
  try {
    navigator.vibrate(pattern);
  } catch {
    /* noop */
  }
}
