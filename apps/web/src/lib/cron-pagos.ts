/**
 * cron-pagos.ts — qué hace el cron diario con cada recibo, según su frecuencia.
 *
 * El cron de las 9:00 nació cuando todo era mensual: «si tiene pago automático
 * y hoy es su día, se registra como pagado; si vence pronto, se avisa». Cuando
 * llegaron los recibos cada 2, 3, 6 o 12 meses, el cron no se enteró: un
 * seguro semestral de $515 con pago automático se habría registrado como
 * pagado —y mandado a Computo como gasto— el día 14 de CADA mes, y su aviso
 * habría saltado todos los meses.
 *
 * Aquí se decide con el mismo `isDueInMonth` que usa el resto de la app.
 *
 * Módulo PURO: sin SQL. Se prueba en cron-pagos.test.ts.
 */

import { isDueInMonth, normalizeAnchorMonth, normalizeFrequency } from './payment-frequency';

export interface ReciboParaCron {
  readonly due_day: number;
  readonly frequency?: unknown;
  readonly anchor_month?: unknown;
}

export interface DecisionCron {
  /** Hoy es el día de cobro de un mes en que toca: registrar el pago automático. */
  readonly tocaCobrarHoy: boolean;
  /** Días hasta el próximo día de cobro (este mes o el siguiente). */
  readonly dias: number;
  /** ¿Ese próximo día de cobro cae en un mes en que el recibo vence? */
  readonly vencimientoReal: boolean;
}

export function decisionCron(recibo: ReciboParaCron, ahora: Date): DecisionCron {
  const frecuencia = normalizeFrequency(recibo.frequency);
  const ancla = normalizeAnchorMonth(recibo.anchor_month, frecuencia);
  const hoy = ahora.getDate();
  const mes = ahora.getMonth() + 1;
  const diasDelMes = new Date(ahora.getFullYear(), mes, 0).getDate();

  // El próximo día de cobro: este mes si aún no ha pasado, si no el siguiente.
  const esteMes = recibo.due_day >= hoy;
  const dias = esteMes ? recibo.due_day - hoy : diasDelMes - hoy + recibo.due_day;
  const mesDelCobro = esteMes ? mes : (mes % 12) + 1;

  return {
    tocaCobrarHoy: recibo.due_day === hoy && isDueInMonth(frecuencia, ancla, mes),
    dias,
    vencimientoReal: isDueInMonth(frecuencia, ancla, mesDelCobro),
  };
}
