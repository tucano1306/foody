/**
 * tarjetas-auto.ts — juntar sola los tramos de una misma tarjeta.
 *
 * Una tarjeta de crédito con dos saldos (compras al 23.99 % y un adelanto al
 * 0 %) se da de alta en Foody como dos deudas, y la app sabe abonar a la
 * tarjeta ENTERA repartiendo como el banco (card-payment.ts). Pero solo si las
 * dos deudas están unidas, y unirlas era un paso escondido en la ficha de cada
 * deuda que nadie encontraba: la Unlimited Cash 3650 se quedó como dos deudas
 * sueltas, cada una con su botón «Abonar», y el usuario no sabía a cuál de las
 * dos le tocaba el mínimo.
 *
 * El número de la tarjeta ya lo dice: mismo banco y mismos cuatro últimos
 * dígitos son el mismo plástico. Aquí se decide qué deudas unir; la base la
 * toca debt-data.ts.
 *
 * Reglas:
 * - Solo tarjetas de crédito activas con cuatro dígitos guardados.
 * - Si el usuario separó una a mano (`cardGroupManual`), no se vuelve a unir:
 *   lo automático propone, no insiste.
 * - Solo se tocan las que no tienen tarjeta; si alguna del grupo ya tiene una,
 *   las demás se unen a esa.
 *
 * Módulo PURO: sin SQL. Se prueba en tarjetas-auto.test.ts.
 */

export interface DeudaParaAgrupar {
  readonly id: string;
  readonly kind: string;
  readonly status: string;
  readonly issuer: string | null;
  readonly accountLast4: string | null;
  readonly cardGroup: string | null;
  readonly cardGroupManual: boolean;
  readonly currentBalance: number;
}

export interface Asignacion {
  readonly id: string;
  readonly cardGroup: string;
}

/** «Bank of America», «BofA», «BOFA » → el mismo banco. */
export function bancoNormalizado(issuer: string | null): string {
  const limpio = (issuer ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
  if (limpio === 'bofa' || limpio === 'boa' || limpio === 'bankofamerica' || limpio === 'bankofamericana') {
    return 'bankofamerica';
  }
  return limpio;
}

export function agrupacionesAutomaticas(deudas: readonly DeudaParaAgrupar[]): Asignacion[] {
  const porTarjeta = new Map<string, DeudaParaAgrupar[]>();
  for (const d of deudas) {
    if (d.kind !== 'credit_card' || d.status !== 'active') continue;
    if (!d.accountLast4 || !/^\d{4}$/.test(d.accountLast4)) continue;
    if (d.cardGroupManual) continue;
    const clave = `${bancoNormalizado(d.issuer)}|${d.accountLast4}`;
    porTarjeta.set(clave, [...(porTarjeta.get(clave) ?? []), d]);
  }

  const asignaciones: Asignacion[] = [];
  for (const miembros of porTarjeta.values()) {
    if (miembros.length < 2) continue;
    const sueltas = miembros.filter((d) => d.cardGroup === null);
    if (sueltas.length === 0) continue;

    // Si alguna ya tiene tarjeta, esa manda (la más repetida). Si no, la
    // tarjeta toma el id del tramo con más saldo, como hace setCardGroup.
    const cuenta = new Map<string, number>();
    for (const d of miembros) if (d.cardGroup) cuenta.set(d.cardGroup, (cuenta.get(d.cardGroup) ?? 0) + 1);
    const existente = [...cuenta.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    const mayor = [...miembros].sort((a, b) => b.currentBalance - a.currentBalance)[0];
    const grupo = existente ?? mayor.id;

    for (const d of sueltas) asignaciones.push({ id: d.id, cardGroup: grupo });
  }
  return asignaciones;
}
