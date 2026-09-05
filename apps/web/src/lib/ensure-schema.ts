/**
 * Lazily ensures that the tables needed for purchase tracking exist in the DB.
 * Uses CREATE TABLE IF NOT EXISTS so subsequent calls are no-ops.
 * Called from Next.js route handlers; safe to call on every cold start.
 */
import { sql } from './db';

let schemaEnsured = false;

export async function ensurePurchaseSchema(): Promise<void> {
  if (schemaEnsured) return;

  // shopping_trips (non-fatal if it already exists)
  await sql`
    CREATE TABLE IF NOT EXISTS shopping_trips (
      id               UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
      store_id         UUID          NULL,
      store_name       VARCHAR(255),
      date             TIMESTAMPTZ   NOT NULL DEFAULT now(),
      total_spent      DECIMAL(10,2) NOT NULL DEFAULT 0,
      currency         VARCHAR(10)   NOT NULL DEFAULT 'USD',
      allocation_strategy VARCHAR(30) NOT NULL DEFAULT 'manual_partial',
      receipt_photo_url VARCHAR(500) NULL,
      notes            TEXT,
      user_id          UUID          NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
      household_id     UUID          NULL,
      created_at       TIMESTAMPTZ   NOT NULL DEFAULT now(),
      updated_at       TIMESTAMPTZ   NOT NULL DEFAULT now()
    )
  `;

  // product_purchases
  await sql`
    CREATE TABLE IF NOT EXISTS product_purchases (
      id           UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
      product_id   UUID          NOT NULL REFERENCES "products"("id") ON DELETE CASCADE,
      trip_id      UUID          NULL,
      quantity     DECIMAL(10,2) NOT NULL DEFAULT 1,
      unit_price   DECIMAL(10,2) NULL,
      total_price  DECIMAL(10,2) NULL,
      price_source VARCHAR(50)   NOT NULL DEFAULT 'unknown',
      currency     VARCHAR(10)   NOT NULL DEFAULT 'USD',
      store_name   VARCHAR(255)  NULL,
      purchased_at TIMESTAMPTZ   NOT NULL DEFAULT now(),
      household_id UUID          NULL,
      user_id      UUID          NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
      created_at   TIMESTAMPTZ   NOT NULL DEFAULT now()
    )
  `;

  // Add columns that may be missing from older schema versions
  //
  // `brand`: qué marca se compró ESTA vez. Va en la compra y no en el
  // producto porque para la despensa «queso parmesano» es un solo artículo —
  // lo que cambia entre compras es la marca y su precio. Ver product-brands.ts.
  await sql`ALTER TABLE product_purchases ADD COLUMN IF NOT EXISTS brand VARCHAR(60) NULL`;
  await sql`ALTER TABLE product_purchases ADD COLUMN IF NOT EXISTS store_name VARCHAR(255) NULL`;
  await sql`ALTER TABLE product_purchases ADD COLUMN IF NOT EXISTS trip_id UUID NULL`;
  await sql`ALTER TABLE product_purchases ADD COLUMN IF NOT EXISTS household_id UUID NULL`;

  schemaEnsured = true;
}

let sharingEnsured = false;

/**
 * Ensures the products table has the `is_private` column that powers
 * household pantry sharing. Idempotent (ADD COLUMN IF NOT EXISTS) and gated by
 * an in-memory flag so it runs at most once per cold start.
 *
 * Safety: the column defaults to TRUE (private) so every existing product stays
 * owner-only until the user deliberately marks it "Compartido con el hogar".
 * A product is shared only when BOTH is_private = false AND household_id matches
 * the viewer's household — nothing becomes visible to other members on rollout.
 */
export async function ensureProductSharingSchema(): Promise<void> {
  if (sharingEnsured) return;
  await sql`ALTER TABLE products ADD COLUMN IF NOT EXISTS is_private BOOLEAN NOT NULL DEFAULT true`;
  sharingEnsured = true;
}

let stockSignalsEnsured = false;

/**
 * Las dos marcas de tiempo que le faltaban al aviso «se te acaba».
 *
 * - `stock_updated_at`: cuándo dijo el usuario en qué estado está el producto.
 *   Sin ella, la predicción contaba desde la última COMPRA e ignoraba que él
 *   acababa de marcarlo lleno — de ahí el «Carbone ya se agotó» diario sobre
 *   algo que tenía en casa.
 * - `last_stock_alert_at`: cuándo se le avisó. Sin ella no había forma de no
 *   repetir el mismo aviso cada mañana.
 *
 * Se rellenan con `updated_at` al crearlas: es la mejor aproximación
 * disponible a «la última vez que supimos algo de este producto», y evita que
 * el primer día tras el despliegue todo parezca recién tocado.
 */
export async function ensureStockSignalSchema(): Promise<void> {
  if (stockSignalsEnsured) return;
  await sql`ALTER TABLE products ADD COLUMN IF NOT EXISTS stock_updated_at TIMESTAMPTZ`;
  await sql`ALTER TABLE products ADD COLUMN IF NOT EXISTS last_stock_alert_at TIMESTAMPTZ`;
  await sql`UPDATE products SET stock_updated_at = updated_at WHERE stock_updated_at IS NULL`;
  stockSignalsEnsured = true;
}

let scopeEnsured = false;

/**
 * Añade `business_share` a todo lo que puede ser personal o del negocio.
 *
 * Es UN SOLO número (0–100) y no un enum aparte: el ámbito se deriva de él, así
 * que no puede existir la contradicción «marcado personal, pero 60 % negocio».
 *
 * DEFAULT 0 = personal. Al desplegar, todo lo que ya existía sigue siendo
 * exactamente lo que era y ningún gasto se muda de lado sin que el usuario lo
 * diga. Los ingresos llevan la misma columna porque separar gastos sin separar
 * ingresos dejaría un negocio que solo pierde dinero.
 *
 * `ALTER TABLE IF EXISTS` no es adorno: esta función la llama /api/payments, y
 * ahí se toca `finance_income_sources`, que es de otro módulo. Sin el IF EXISTS,
 * una tabla de finanzas todavía sin crear tumbaría la API de pagos entera con un
 * «relation does not exist» — el IF NOT EXISTS de la columna no cubre eso. Así
 * la migración deja de depender del orden en que se visiten las secciones.
 */
export async function ensureExpenseScopeSchema(): Promise<void> {
  if (scopeEnsured) return;
  await sql`ALTER TABLE IF EXISTS monthly_payments ADD COLUMN IF NOT EXISTS business_share DECIMAL(5,2) NOT NULL DEFAULT 0`;
  // Cada cuanto vence el recibo. Por defecto MENSUAL, que es lo que eran todos
  // hasta ahora: nada de lo ya guardado cambia de cifra al desplegar esto.
  await sql`ALTER TABLE IF EXISTS monthly_payments ADD COLUMN IF NOT EXISTS frequency VARCHAR(12) NOT NULL DEFAULT 'monthly'`;
  // Mes (1-12) en que cae uno de los cobros; los demas se deducen sumando
  // ciclos. NULL en los mensuales, que vencen todos los meses.
  await sql`ALTER TABLE IF EXISTS monthly_payments ADD COLUMN IF NOT EXISTS anchor_month SMALLINT`;
  await sql`ALTER TABLE IF EXISTS finance_income_sources ADD COLUMN IF NOT EXISTS business_share DECIMAL(5,2) NOT NULL DEFAULT 0`;
  // Una compra también puede ser del negocio (insumos, material de oficina).
  await sql`ALTER TABLE IF EXISTS shopping_trips ADD COLUMN IF NOT EXISTS business_share DECIMAL(5,2) NOT NULL DEFAULT 0`;
  scopeEnsured = true;
}

let kindEnsured = false;

/**
 * Añade `kind` a los tickets: qué CLASE de gasto es (super, comida fuera,
 * farmacia, gasolina, hogar, otro).
 *
 * DEFAULT 'grocery' no es un detalle: al desplegar, cada ticket que ya existía
 * sigue siendo exactamente lo que era —una compra de super— y ninguno se muda de
 * sección solo. Reclasificar es siempre una decisión explícita del usuario, y
 * eso vale también para el histórico.
 *
 * Se llama desde TODA consulta que filtre por tipo. Es idempotente y está
 * protegida por un flag en memoria, así que corre a lo sumo una vez por arranque
 * en frío; el coste de llamarla de más es cero y el de olvidarla sería un
 * «column kind does not exist» en producción.
 */
export async function ensureExpenseKindSchema(): Promise<void> {
  if (kindEnsured) return;
  await sql`ALTER TABLE IF EXISTS shopping_trips ADD COLUMN IF NOT EXISTS kind VARCHAR(20) NOT NULL DEFAULT 'grocery'`;
  // Todas las lecturas nuevas filtran por (user_id, kind) sobre un rango de
  // fechas: sin este índice, cada carga del plan hace un scan de la tabla.
  await sql`CREATE INDEX IF NOT EXISTS idx_trips_user_kind_date ON shopping_trips (user_id, kind, date DESC)`;
  kindEnsured = true;
}

let splitsEnsured = false;

/**
 * Un ticket, varios tipos de gasto.
 *
 * Un carrito de Walmart lleva la despensa de la semana y, en el mismo recibo,
 * las medicinas y una extensión de cable. Con un solo `kind` por ticket había
 * que elegir, y las dos opciones mienten: marcarlo súper infla el presupuesto
 * de despensa con lo que no es comida; marcarlo farmacia saca la despensa
 * entera de Compras y del comparador de precios.
 *
 * Cada fila aquí recorta del total la parte que pertenece a otro sitio. Lo que
 * sobra se queda en el `kind` del ticket, así que un ticket SIN filas se
 * comporta exactamente como antes — que es lo que hace seguro desplegar esto
 * sobre los tickets ya guardados.
 *
 * La vista `trip_kind_amounts` es la que consume el resto de la app: devuelve
 * una fila por (ticket, tipo) con su importe, de modo que sumar el gasto de un
 * tipo es un `SUM(amount)` normal y no hay que repetir la resta en cada
 * consulta. Sin ella, cada sitio que agrega gasto tendría que acordarse de
 * descontar los splits, y el primero que lo olvide cuenta de más.
 */
export async function ensureTripSplitsSchema(): Promise<void> {
  if (splitsEnsured) return;
  await ensureExpenseScopeSchema();
  await ensureExpenseKindSchema();

  await sql`
    CREATE TABLE IF NOT EXISTS shopping_trip_splits (
      id         UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
      trip_id    UUID          NOT NULL REFERENCES shopping_trips(id) ON DELETE CASCADE,
      user_id    UUID          NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
      kind       VARCHAR(20)   NOT NULL,
      amount     DECIMAL(10,2) NOT NULL,
      note       TEXT          NULL,
      created_at TIMESTAMPTZ   NOT NULL DEFAULT now()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_trip_splits_trip ON shopping_trip_splits (trip_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_trip_splits_user_kind ON shopping_trip_splits (user_id, kind)`;

  // GREATEST(...,0): repartir más de lo que costó el ticket se valida al
  // guardar, pero si una fila vieja quedara descuadrada el resto sería
  // negativo y ese ticket RESTARÍA del gasto del mes.
  await sql`
    CREATE OR REPLACE VIEW trip_kind_amounts AS
      SELECT t.id AS trip_id, t.user_id, t.household_id, t.date, t.store_name,
             t.business_share, t.currency, t.kind,
             GREATEST(COALESCE(t.total_spent, 0) - COALESCE(s.repartido, 0), 0) AS amount
        FROM shopping_trips t
        LEFT JOIN (
          SELECT trip_id, SUM(amount) AS repartido
            FROM shopping_trip_splits GROUP BY trip_id
        ) s ON s.trip_id = t.id
       WHERE GREATEST(COALESCE(t.total_spent, 0) - COALESCE(s.repartido, 0), 0) > 0
         OR s.repartido IS NULL
      UNION ALL
      SELECT sp.trip_id, t.user_id, t.household_id, t.date, t.store_name,
             t.business_share, t.currency, sp.kind, sp.amount
        FROM shopping_trip_splits sp
        JOIN shopping_trips t ON t.id = sp.trip_id
  `;

  splitsEnsured = true;
}
