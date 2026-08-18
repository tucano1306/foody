/**
 * goal-order.ts — el orden de las metas, que ES su prioridad.
 *
 * En el Plan financiero el usuario arrastra las metas para decir cuál va
 * primero, y eso no es decoración: `compareGoals` en finance-engine.ts ordena
 * por `priority` antes que por nada, así que la meta que queda arriba es la que
 * se lleva el dinero primero. Mover una tarjeta cambia el plan.
 *
 * Aquí vive solo la aritmética del orden —sin React y sin SQL— para poder
 * probarla sola y para que el arrastre, las flechas del teclado y la ruta que
 * guarda compartan exactamente las mismas reglas.
 */

/**
 * Mueve un id `delta` posiciones (negativo = hacia arriba).
 *
 * Se queda en los extremos en vez de dar la vuelta: la primera meta empujada
 * hacia arriba se queda primera, que es lo que espera quien la empuja.
 * Devuelve la MISMA lista si no hay nada que mover, para que quien la use
 * pueda comparar por identidad y ahorrarse guardar un orden idéntico.
 */
export function moveInOrder(ids: readonly string[], id: string, delta: number): readonly string[] {
  const from = ids.indexOf(id);
  if (from < 0 || delta === 0) return ids;

  const to = Math.min(ids.length - 1, Math.max(0, from + delta));
  if (to === from) return ids;

  const next = [...ids];
  next.splice(from, 1);
  next.splice(to, 0, id);
  return next;
}

/**
 * Reordena `items` según `ids`.
 *
 * Lo que no aparezca en `ids` se va al final conservando su orden — así una
 * meta recién creada en otra pestaña no desaparece de la lista mientras el
 * orden local todavía no la conoce.
 */
export function applyOrder<T>(
  items: readonly T[],
  ids: readonly string[],
  keyOf: (item: T) => string,
): T[] {
  const rank = new Map(ids.map((id, i) => [id, i]));
  const fallback = ids.length;
  return [...items].sort((a, b) => {
    const ra = rank.get(keyOf(a)) ?? fallback;
    const rb = rank.get(keyOf(b)) ?? fallback;
    if (ra !== rb) return ra - rb;
    return items.indexOf(a) - items.indexOf(b);
  });
}
