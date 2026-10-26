/**
 * lecturas-stats.ts — una frase por gráfico que dice qué significa.
 *
 * Las tarjetas de Estadísticas enseñaban barras con un título («Gasto
 * mensual», «Supermercados más usados») y, como mucho, una instrucción de uso
 * («toca una barra para ver cuáles»). La conclusión —qué tienda se lleva el
 * dinero, qué es lo que más se compra— había que sacarla mirando las barras.
 * Cada función devuelve esa conclusión ya dicha, o `null` cuando los datos no
 * dan para una frase honesta.
 *
 * Módulo PURO: sin React y sin SQL. Se prueba en lecturas-stats.test.ts.
 */

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function dinero(n: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}

function mesCorto(ym: string): string {
  const m = Number(ym.slice(5, 7));
  return MESES[m - 1] ?? ym;
}

/**
 * El gasto mensual. El mes en curso no entra en la media ni compite por «el
 * más caro»: está a medias, y compararlo con meses enteros siempre lo haría
 * parecer barato.
 */
export function lecturaGastoMensual(
  meses: readonly { readonly month: string; readonly total: number }[],
  mesActual: string,
): string | null {
  const cerrados = meses.filter((m) => m.month !== mesActual && m.total > 0);
  if (cerrados.length === 0) return null;
  const media = cerrados.reduce((s, m) => s + m.total, 0) / cerrados.length;
  if (cerrados.length === 1) return `Gastas unos ${dinero(media)} al mes en el súper`;
  const caro = cerrados.reduce((a, b) => (b.total > a.total ? b : a));
  return `Media de ${dinero(media)} al mes · el más caro, ${mesCorto(caro.month)} (${dinero(caro.total)})`;
}

export function lecturaProductos(
  productos: readonly { readonly name: string; readonly purchases: number }[],
): string | null {
  const primero = productos[0];
  if (!primero || primero.purchases < 2) return null;
  return `${primero.name} es lo que más compras: ${primero.purchases} veces`;
}

export function lecturaDespensa(
  stock: { readonly full: number; readonly half: number; readonly empty: number },
): string | null {
  const total = stock.full + stock.half + stock.empty;
  if (total === 0) return null;
  const lleno = Math.round((stock.full / total) * 100);
  const faltan = stock.half + stock.empty;
  if (faltan === 0) return 'Tienes de todo: nada por reponer';
  return `El ${lleno} % está lleno · ${faltan} por reponer`;
}

/** Quién se lleva el dinero, no quién recibe más visitas: es lo que pesa. */
export function lecturaSupermercados(
  tiendas: readonly { readonly name: string; readonly totalSpent: number }[],
): string | null {
  const conGasto = tiendas.filter((t) => t.totalSpent > 0 && t.name !== 'Sin tienda');
  if (conGasto.length < 2) return null;
  const total = conGasto.reduce((s, t) => s + t.totalSpent, 0);
  const mayor = conGasto.reduce((a, b) => (b.totalSpent > a.totalSpent ? b : a));
  const parte = Math.round((mayor.totalSpent / total) * 100);
  return `${mayor.name} se lleva el ${parte} % de lo que gastas en el súper`;
}
