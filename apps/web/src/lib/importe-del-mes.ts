/**
 * importe-del-mes.ts — lo que un recibo cuenta en los totales de ESTE mes.
 *
 * La pantalla de Pagos sumaba el importe de cada recibo en el total del mes,
 * fuera cual fuera su frecuencia. Y como un recibo que no vence este mes se da
 * por «al día» (no hay nada que pagar), un seguro de $515 cada seis meses
 * aparecía cada mes como «pagado» y sumaba sus $515 a «Pagos de noviembre»,
 * «de diciembre»… El Plan financiero no tenía el problema: allí cuenta lo que
 * cuesta AL MES ($85.83), que es otra pregunta.
 *
 * Esta pantalla responde «¿qué sale de la cuenta este mes?»:
 * - pagado este mes → lo que de verdad se cobró (el registro manda: si se
 *   cobraron $87.17, no son los $515 de la ficha);
 * - vence este mes y no se ha pagado → su importe;
 * - no vence este mes → nada.
 *
 * Módulo PURO: sin React y sin SQL. Se prueba en importe-del-mes.test.ts.
 */

import { isDueInMonth, normalizeFrequency } from './payment-frequency';

export interface ReciboDelMes {
  readonly amount: number;
  readonly frequency?: unknown;
  readonly anchorMonth?: number | null;
  readonly currentRecord?: {
    readonly status: string;
    readonly amount: number;
    readonly actualAmount: number | null;
  } | null;
}

function pagadoEsteMes(r: ReciboDelMes): boolean {
  return r.currentRecord?.status === 'paid';
}

/**
 * ¿Le toca a este recibo este mes? Sí si vence este mes, y también si se
 * registró un pago este mes aunque no tocara: ese dinero salió de verdad.
 */
export function tocaEsteMes(r: ReciboDelMes, ahora: Date): boolean {
  if (pagadoEsteMes(r)) return true;
  return isDueInMonth(normalizeFrequency(r.frequency), r.anchorMonth ?? null, ahora.getMonth() + 1);
}

export function importeDelMes(r: ReciboDelMes, ahora: Date): number {
  if (pagadoEsteMes(r)) return r.currentRecord!.actualAmount ?? r.currentRecord!.amount;
  return tocaEsteMes(r, ahora) ? r.amount : 0;
}
