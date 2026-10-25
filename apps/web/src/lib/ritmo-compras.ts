/**
 * ritmo-compras.ts — cómo va el mes en el súper comparado con los anteriores.
 *
 * Compras abría con tres tarjetas: cuántas compras, el total de SIEMPRE y el
 * promedio por ticket. El total de siempre no contesta nada que uno se
 * pregunte, y ninguna decía si este mes se está gastando más o menos.
 *
 * La comparación honesta no es «este mes contra la media de un mes»: el día 10
 * el mes en curso siempre parece barato. Es contra lo que solías llevar
 * gastado A ESTAS ALTURAS: la suma de cada mes anterior hasta el mismo día.
 *
 * Módulo PURO: sin React y sin SQL. Se prueba en ritmo-compras.test.ts.
 */

import { diaDeLaFecha, type Dia } from './app-time';
import { monthKey } from './trip-months';

export interface BarraMes {
  /** «2026-10». */
  readonly key: string;
  /** «oct». */
  readonly etiqueta: string;
  readonly total: number;
  readonly actual: boolean;
}

export interface RitmoCompras {
  /** Del más antiguo al actual, sin los meses anteriores al primer ticket. */
  readonly barras: readonly BarraMes[];
  readonly actual: number;
  readonly comprasActual: number;
  /** Lo que solías llevar al llegar a este día del mes. `null` sin meses previos. */
  readonly habitualHastaHoy: number | null;
  /** La media de un mes entero, para la línea de referencia de las barras. */
  readonly mediaMensual: number | null;
}

const ETIQUETAS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

const centavos = (n: number) => Math.round(n * 100) / 100;

function claveDe(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

/** Las claves de los `n` meses que acaban en `hoy`, del más antiguo al actual. */
function ventanaDeMeses(hoy: Dia, n: number): string[] {
  const claves: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const total = hoy.year * 12 + (hoy.month - 1) - i;
    claves.push(claveDe(Math.floor(total / 12), (total % 12) + 1));
  }
  return claves;
}

export function ritmoDeCompras(
  trips: readonly { readonly purchasedAt: string; readonly totalAmount: number }[],
  hoy: Dia,
  meses = 6,
): RitmoCompras {
  const ventana = ventanaDeMeses(hoy, meses);
  const actualKey = ventana[ventana.length - 1];
  const totales = new Map<string, number>();
  const hastaHoy = new Map<string, number>();
  let comprasActual = 0;

  for (const t of trips) {
    const key = monthKey(t.purchasedAt);
    if (!ventana.includes(key)) continue;
    totales.set(key, (totales.get(key) ?? 0) + t.totalAmount);
    const dia = diaDeLaFecha(t.purchasedAt);
    if (dia && dia.day <= hoy.day) hastaHoy.set(key, (hastaHoy.get(key) ?? 0) + t.totalAmount);
    if (key === actualKey) comprasActual++;
  }

  // Los meses de antes del primer ticket no son meses «a cero»: son meses en
  // que la app aún no se usaba. Contarlos hundiría la media.
  const primero = ventana.findIndex((k) => totales.has(k));
  const vivos = primero < 0 ? [actualKey] : ventana.slice(primero);
  const previos = vivos.filter((k) => k !== actualKey);

  const media = (valores: number[]) =>
    valores.length === 0 ? null : centavos(valores.reduce((a, b) => a + b, 0) / valores.length);

  return {
    barras: vivos.map((key) => ({
      key,
      etiqueta: ETIQUETAS[Number(key.slice(5)) - 1] ?? key,
      total: centavos(totales.get(key) ?? 0),
      actual: key === actualKey,
    })),
    actual: centavos(totales.get(actualKey) ?? 0),
    comprasActual,
    habitualHastaHoy: media(previos.map((k) => hastaHoy.get(k) ?? 0)),
    mediaMensual: media(previos.map((k) => totales.get(k) ?? 0)),
  };
}
