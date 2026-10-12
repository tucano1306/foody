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
import { huella, type GastoComputo } from './mapeo';

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
    .map((e) => ({ ref: e.ref, modo: e.vinculado ? 'desvincular' : 'borrar' }));

  return { upserts, borrar };
}

export function planVacio(p: PlanComputo): boolean {
  return p.upserts.length === 0 && p.borrar.length === 0;
}
