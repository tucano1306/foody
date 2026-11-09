import { sql } from './db';
import { ensureExpenseKindSchema } from './ensure-schema';
import { randomUUID } from 'node:crypto';
import {
  armarTiendas,
  canonizarNombre,
  claveDeTienda,
  limpiarNombreTienda,
  sugerirUniones,
  type GrupoRepetido,
  type Sucursal,
  type TiendaResumen,
  type UsoDeTienda,
} from './tiendas';
import type { CambioDeSucursal, SucursalNueva } from './store-input';

/**
 * Consultas de tiendas. La regla de qué nombre es cuál vive en `tiendas.ts`;
 * aquí solo se lee y se escribe, siempre acotado al `user_id`.
 *
 * `stores` es una tabla de la época NestJS que nadie usaba (tres filas sin
 * ubicación). No la crea `ensure-schema.ts`: existe en producción con
 * `id, name, address, latitude, longitude, user_id, household_id, created_at,
 * updated_at`, y `shopping_trips.store_id` / `product_purchases.store_id` ya
 * apuntan a ella con ON DELETE SET NULL.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const esUuid = (v: unknown): v is string => typeof v === 'string' && UUID.test(v);

/** Postgres devuelve DECIMAL y COUNT como texto. */
function numero(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : Number.NaN;
  return Number.isFinite(n) ? n : null;
}

function filaASucursal(r: Record<string, unknown>): Sucursal {
  const lat = numero(r.latitude);
  const lng = numero(r.longitude);
  return {
    id: String(r.id),
    nombre: String(r.name ?? ''),
    direccion: typeof r.address === 'string' && r.address.trim() ? r.address : null,
    // DECIMAL llega como texto; y una fila vieja puede tener una sola de las dos.
    lat: lat !== null && lng !== null ? lat : null,
    lng: lat !== null && lng !== null ? lng : null,
  };
}

const iso = (v: unknown): string | null => {
  if (v instanceof Date) return v.toISOString();
  return typeof v === 'string' && v ? new Date(v).toISOString() : null;
};

export interface TiendasDelUsuario {
  readonly tiendas: readonly TiendaResumen[];
  readonly sucursales: readonly Sucursal[];
  readonly repetidas: readonly GrupoRepetido[];
}

/** Todo lo que pintan la pantalla de Tiendas y el selector del Súper. */
export async function listarTiendas(userId: string): Promise<TiendasDelUsuario> {
  await ensureExpenseKindSchema();
  const [viajes, sueltas, filas] = await Promise.all([
    sql`
      SELECT trim(store_name) AS nombre, COALESCE(kind, 'grocery') AS kind,
             COUNT(*)::int AS usos, MAX(date) AS ultima
      FROM shopping_trips
      WHERE user_id = ${userId} AND store_name IS NOT NULL AND trim(store_name) <> ''
      GROUP BY 1, 2
    `,
    // Compras sueltas (sin ticket): cada día en una tienda cuenta como una visita.
    sql`
      SELECT trim(store_name) AS nombre, COUNT(DISTINCT purchased_at::date)::int AS usos, MAX(purchased_at) AS ultima
      FROM product_purchases
      WHERE user_id = ${userId} AND trip_id IS NULL AND store_name IS NOT NULL AND trim(store_name) <> ''
      GROUP BY 1
    `,
    sql`
      SELECT id, name, address, latitude, longitude
      FROM stores WHERE user_id = ${userId}
      ORDER BY created_at ASC
    `,
  ]);
  const usos: UsoDeTienda[] = [
    ...viajes.map((r) => ({ nombre: String(r.nombre), kind: String(r.kind), usos: numero(r.usos) ?? 0, ultima: iso(r.ultima) })),
    ...sueltas.map((r) => ({ nombre: String(r.nombre), kind: 'grocery', usos: numero(r.usos) ?? 0, ultima: iso(r.ultima) })),
  ];
  const sucursales = filas.map(filaASucursal);
  const tiendas = armarTiendas(usos, sucursales);
  return { tiendas, sucursales, repetidas: sugerirUniones(tiendas) };
}

/** Los nombres que ya existen, el más usado primero. */
export async function nombresConocidos(userId: string): Promise<string[]> {
  const rows = await sql`
    SELECT nombre FROM (
      SELECT trim(store_name) AS nombre, COUNT(*) AS n
      FROM shopping_trips
      WHERE user_id = ${userId} AND store_name IS NOT NULL AND trim(store_name) <> ''
      GROUP BY 1
      UNION ALL
      SELECT trim(name) AS nombre, 0 AS n FROM stores WHERE user_id = ${userId} AND trim(name) <> ''
    ) x
    GROUP BY nombre
    ORDER BY SUM(n) DESC, nombre ASC
  `;
  return rows.map((r) => String(r.nombre));
}

/**
 * El nombre de tienda que se va a guardar en una compra: escrito como ya
 * existe («publix» → «Publix»), para no volver a partir las estadísticas.
 *
 * Nunca tumba la compra: si la consulta falla, se guarda lo escrito, limpio.
 */
export async function nombreDeTiendaCanonico(userId: string, nombre: unknown): Promise<string | null> {
  const limpio = limpiarNombreTienda(nombre);
  if (!limpio) return null;
  try {
    return canonizarNombre(limpio, await nombresConocidos(userId));
  } catch {
    return limpio;
  }
}

/**
 * Nombre y sucursal de una compra nueva.
 *
 * El `storeId` llega del teléfono, así que se comprueba que la sucursal es del
 * usuario: sin eso, una compra podría quedar colgada de la tienda de otro. Y
 * si el nombre escrito ya no es el de esa sucursal (lo cambió a mano al
 * cerrar), manda el nombre y la sucursal se suelta.
 */
export async function resolverTiendaDelViaje(
  userId: string,
  storeName: unknown,
  storeId: unknown,
): Promise<{ storeName: string | null; storeId: string | null }> {
  const escrito = limpiarNombreTienda(storeName);
  if (esUuid(storeId)) {
    try {
      const rows = await sql`SELECT id, name FROM stores WHERE id = ${storeId} AND user_id = ${userId} LIMIT 1`;
      const fila = rows[0] as { id: string; name: string } | undefined;
      if (fila) {
        if (!escrito || claveDeTienda(escrito) === claveDeTienda(fila.name)) {
          return { storeName: limpiarNombreTienda(fila.name), storeId: fila.id };
        }
      }
    } catch {
      // Sin sucursal se guarda igual: el nombre basta para las estadísticas.
    }
  }
  return { storeName: await nombreDeTiendaCanonico(userId, escrito), storeId: null };
}

export async function crearSucursal(userId: string, s: SucursalNueva): Promise<Sucursal> {
  const nombre = (await nombreDeTiendaCanonico(userId, s.nombre)) ?? s.nombre;
  const rows = await sql`
    INSERT INTO stores (id, name, address, latitude, longitude, user_id, household_id, created_at, updated_at)
    VALUES (${randomUUID()}, ${nombre}, ${s.direccion}, ${s.lat}, ${s.lng}, ${userId}, NULL, NOW(), NOW())
    RETURNING id, name, address, latitude, longitude
  `;
  return filaASucursal(rows[0] as Record<string, unknown>);
}

export async function leerSucursal(userId: string, id: string): Promise<Sucursal | null> {
  const rows = await sql`SELECT id, name, address, latitude, longitude FROM stores WHERE id = ${id} AND user_id = ${userId} LIMIT 1`;
  return rows[0] ? filaASucursal(rows[0] as Record<string, unknown>) : null;
}

export async function actualizarSucursal(userId: string, id: string, c: CambioDeSucursal): Promise<Sucursal | null> {
  const tocaDireccion = c.direccion !== undefined;
  const tocaPunto = c.lat !== undefined && c.lng !== undefined;
  const rows = await sql`
    UPDATE stores SET
      address = CASE WHEN ${tocaDireccion} THEN ${c.direccion ?? null} ELSE address END,
      latitude = CASE WHEN ${tocaPunto} THEN ${c.lat ?? null}::numeric ELSE latitude END,
      longitude = CASE WHEN ${tocaPunto} THEN ${c.lng ?? null}::numeric ELSE longitude END,
      updated_at = NOW()
    WHERE id = ${id} AND user_id = ${userId}
    RETURNING id, name, address, latitude, longitude
  `;
  return rows[0] ? filaASucursal(rows[0] as Record<string, unknown>) : null;
}

/**
 * Quita una ubicación guardada. Las compras hechas allí no se tocan: guardan
 * el nombre, y su `store_id` pasa a NULL por la clave foránea.
 */
export async function borrarSucursal(userId: string, id: string): Promise<boolean> {
  const rows = await sql`DELETE FROM stores WHERE id = ${id} AND user_id = ${userId} RETURNING id`;
  return rows.length > 0;
}

export interface ResultadoDeUnion {
  readonly compras: number;
  readonly sueltas: number;
  readonly sucursales: number;
}

/**
 * Deja todas las formas de escribir una tienda con un solo nombre: en los
 * tickets, en las compras sueltas y en las sucursales. Renombrar es lo mismo
 * con una sola variante.
 *
 * En UNA transacción: a medias quedarían las estadísticas partidas de otra
 * manera (los tickets con el nombre nuevo y sus productos con el viejo).
 *
 * Computo: la descripción de un gasto es el nombre de la tienda, así que los
 * tickets renombrados cambian de huella y la siguiente sincronización los
 * ACTUALIZA allí (misma ref, no duplica). Quien llama programa esa sincronización.
 */
export async function unirTiendas(userId: string, variantes: readonly string[], nombre: string): Promise<ResultadoDeUnion> {
  const lista = [...variantes];
  const [viajes, sueltas, sucursales] = await sql.transaction([
    sql`
      UPDATE shopping_trips SET store_name = ${nombre}, updated_at = NOW()
      WHERE user_id = ${userId} AND trim(store_name) = ANY(${lista}::text[]) AND store_name IS DISTINCT FROM ${nombre}
      RETURNING id
    `,
    sql`
      UPDATE product_purchases SET store_name = ${nombre}
      WHERE user_id = ${userId} AND trim(store_name) = ANY(${lista}::text[]) AND store_name IS DISTINCT FROM ${nombre}
      RETURNING id
    `,
    sql`
      UPDATE stores SET name = ${nombre}, updated_at = NOW()
      WHERE user_id = ${userId} AND trim(name) = ANY(${lista}::text[]) AND name IS DISTINCT FROM ${nombre}
      RETURNING id
    `,
  ]);
  return { compras: viajes.length, sueltas: sueltas.length, sucursales: sucursales.length };
}
