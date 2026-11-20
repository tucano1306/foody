/**
 * plan.ts — qué hay que mandarle a Computo para que quede como Foody.
 *
 * La sincronización es por ESTADO, no por eventos. Gastos se crean y cambian
 * por ocho caminos distintos (tickets, cerrar la compra en Súper, reclasificar,
 * repartir, marcar un pago, corregirlo, el autopago del cron…). Avisar desde
 * cada uno acaba con uno olvidado. Aquí se compara lo que DEBERÍA estar en
 * Computo con lo que ya se mandó, y sale solo la diferencia: si un camino se
 * olvida de avisar, la siguiente sincronización lo recoge igual.
 *
 * Módulo PURO. Se prueba en plan.test.ts.
 */
import { destinoDeRef, huella, type DestinoComputo, type GastoComputo } from './mapeo';

/** Lo que Foody recuerda de cada gasto que ya está en Computo. */
export interface Enviado {
  readonly ref: string;
  readonly huella: string;
  /**
   * El gasto ya estaba tecleado a mano en Computo y Foody solo lo enlazó. Si se
   * borra en Foody, en Computo se desvincula y se queda: lo escribió el usuario.
   */
  readonly vinculado: boolean;
}

export interface Borrado {
  readonly ref: string;
  readonly modo: 'borrar' | 'desvincular';
  /** De qué empresa sale: lo dice la propia ref. */
  readonly destino: DestinoComputo;
}

export interface PlanComputo {
  /** Nuevos o cambiados. */
  readonly upserts: readonly GastoComputo[];
  /** Ya no están en Foody (borrados, reclasificados, fuera de fecha). */
  readonly borrar: readonly Borrado[];
}

export function planificar(deseados: readonly GastoComputo[], enviados: readonly Enviado[]): PlanComputo {
  const previos = new Map(enviados.map((e) => [e.ref, e]));
  const vivos = new Set<string>();
  const upserts: GastoComputo[] = [];

  for (const g of deseados) {
    if (vivos.has(g.ref)) continue; // una ref repetida es la misma cosa
    vivos.add(g.ref);
    if (previos.get(g.ref)?.huella !== huella(g)) upserts.push(g);
  }

  const borrar: Borrado[] = enviados
    .filter((e) => !vivos.has(e.ref))
    .map((e) => ({ ref: e.ref, modo: e.vinculado ? 'desvincular' : 'borrar', destino: destinoDeRef(e.ref) }));

  return { upserts, borrar };
}

export function planVacio(p: PlanComputo): boolean {
  return p.upserts.length === 0 && p.borrar.length === 0;
}

/** El día siguiente a uno YYYY-MM-DD, a mediodía UTC para que ningún cambio de hora lo mueva. */
function diaSiguiente(clave: string): string {
  const d = new Date(`${clave}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Desde qué día van los ingresos a Computo, la primera vez que hay alguno.
 *
 * Lo cobrado hasta el día en que el usuario tecleó a mano su último ingreso en
 * Computo ya está allí, aunque sea sumado: tres cobros de Foody pueden ser un
 * único ingreso tecleado con el total. El enlace por importe y fecha no
 * ve esa suma (ningún cobro suelto coincide con ella), así que mandarlos los
 * contaría dos veces. Por eso los ingresos empiezan el día SIGUIENTE a ese
 * tecleo; sin nada tecleado, el día desde el que van los gastos. Nunca antes
 * de ese día, ni después de hoy.
 */
export function inicioDeIngresos(desdeGastos: string, ultimoTecleado: string | null, hoy: string): string {
  const siguiente = ultimoTecleado ? diaSiguiente(ultimoTecleado) : desdeGastos;
  const inicio = siguiente > desdeGastos ? siguiente : desdeGastos;
  return inicio > hoy ? hoy : inicio;
}
