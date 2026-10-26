/**
 * camino-deudas.ts — el camino hasta quedar libre de deudas, de un vistazo.
 *
 * La cabecera de Deudas decía cuánto se debe, el interés del mes, las cuotas
 * y una fecha («Sin deudas en mar 2028»). Faltaban las dos cosas que mueven a
 * seguir pagando: cuánto se ha avanzado ya, y qué deuda cae primero. Para lo
 * segundo había que abrir cada tarjeta y comparar plazos de cabeza.
 *
 * - El avance es el CAPITAL pagado contra la referencia de cada deuda (lo que
 *   se debía al darla de alta más los consumos nuevos), la misma cuenta que el
 *   anillo de cada tarjeta. Los intereses pagados no cuentan: no acercan el
 *   final.
 * - Las filas dicen cuándo termina cada deuda, de la que antes acaba a la que
 *   más tarda. Los tramos de una misma tarjeta van juntos: es UN plástico, y
 *   acaba cuando acaba su último tramo.
 *
 * Módulo PURO: sin React y sin SQL. Se prueba en camino-deudas.test.ts.
 */

import { addMonths, toDateKey } from './debt-engine';

export interface DeudaParaCamino {
  readonly id: string;
  readonly nombre: string;
  /** Tramos de una misma tarjeta comparten grupo y título. */
  readonly grupo: string | null;
  readonly nombreGrupo: string | null;
  readonly saldo: number;
  readonly capitalPagado: number;
  readonly referencia: number;
  readonly meses: number | null;
  readonly nuncaTermina: boolean;
}

export interface FilaCamino {
  readonly clave: string;
  readonly nombre: string;
  /** La deuda que se abre al tocar la fila (en una tarjeta, su tramo mayor). */
  readonly abrir: string;
  readonly saldo: number;
  readonly meses: number | null;
  /** YYYY-MM-DD del mes en que se paga la última cuota. */
  readonly fin: string | null;
  readonly atascada: boolean;
}

export interface CaminoDeudas {
  readonly pagado: number;
  readonly referencia: number;
  /** 0-100. */
  readonly porcentaje: number;
  readonly filas: readonly FilaCamino[];
  /** El plazo más largo de las que sí terminan: la escala de las barras. */
  readonly mesesMax: number;
}

const centavos = (n: number) => Math.round(n * 100) / 100;

export function caminoDeDeudas(deudas: readonly DeudaParaCamino[], ahora: Date): CaminoDeudas {
  const pagado = centavos(deudas.reduce((s, d) => s + Math.max(0, d.capitalPagado), 0));
  const referencia = centavos(deudas.reduce((s, d) => s + Math.max(0, d.referencia), 0));
  const porcentaje = referencia > 0 ? Math.min(100, Math.round((pagado / referencia) * 1000) / 10) : 0;

  const vivas = deudas.filter((d) => d.saldo > 0);
  const porClave = new Map<string, DeudaParaCamino[]>();
  for (const d of vivas) {
    const clave = d.grupo ?? d.id;
    porClave.set(clave, [...(porClave.get(clave) ?? []), d]);
  }

  const filas: FilaCamino[] = [...porClave.entries()].map(([clave, grupo]) => {
    const atascada = grupo.some((d) => d.nuncaTermina || d.meses === null);
    const meses = atascada ? null : Math.max(...grupo.map((d) => d.meses ?? 0));
    const mayor = [...grupo].sort((a, b) => b.saldo - a.saldo)[0];
    return {
      clave,
      nombre: grupo.length > 1 ? (mayor.nombreGrupo ?? mayor.nombre) : mayor.nombre,
      abrir: mayor.id,
      saldo: centavos(grupo.reduce((s, d) => s + d.saldo, 0)),
      meses,
      // La misma cuenta que la fecha de «libre» de la cartera (buildPortfolio):
      // con 1 mes de plazo, la última cuota es la de este mes.
      fin: meses === null || meses <= 0 ? null : toDateKey(addMonths(ahora, meses - 1)),
      atascada,
    };
  });

  filas.sort((a, b) => {
    if (a.atascada !== b.atascada) return a.atascada ? 1 : -1;
    return (a.meses ?? 0) - (b.meses ?? 0) || b.saldo - a.saldo;
  });

  const mesesMax = filas.reduce((m, f) => Math.max(m, f.meses ?? 0), 0);
  return { pagado, referencia, porcentaje, filas, mesesMax };
}
