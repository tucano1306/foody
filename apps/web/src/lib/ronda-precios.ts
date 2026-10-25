/**
 * La ronda de precios del súper: ir de un producto sin precio al siguiente
 * sin volver a la rejilla.
 *
 * Antes, para ponerle precio a lo que llevabas en el carro había que buscar
 * cada tarjeta, abrirla, teclear, cerrar y buscar la siguiente — y nada decía
 * cuáles faltaban. Ahora el tablero dice «3 sin precio» y, desde la hoja del
 * precio, «Siguiente» salta al próximo.
 *
 * `saltados`: lo que el usuario dejó sin precio durante la ronda. Sin esto,
 * cerrar uno sin teclear lo devolvía como «siguiente» y la ronda no acababa
 * nunca.
 */
export interface LineaRonda {
  readonly id: string;
  /** Precio tecleado o escaneado en ESTA compra. Un importe estimado con el
   *  último precio conocido no cuenta: es una suposición, no lo que costó. */
  readonly conPrecio: boolean;
}

export function pendientesDePrecio(
  lineas: readonly LineaRonda[],
  saltados: ReadonlySet<string> = new Set(),
): string[] {
  return lineas.filter((l) => !l.conPrecio && !saltados.has(l.id)).map((l) => l.id);
}

export function siguienteSinPrecio(
  lineas: readonly LineaRonda[],
  actual: string | null,
  saltados: ReadonlySet<string> = new Set(),
): { readonly id: string | null; readonly restantes: number } {
  const pendientes = pendientesDePrecio(lineas, saltados).filter((id) => id !== actual);
  return { id: pendientes[0] ?? null, restantes: pendientes.length };
}
