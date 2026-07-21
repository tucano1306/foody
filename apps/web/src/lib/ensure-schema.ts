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
