/**
 * Lazily ensures the tables needed for the sharing system exist.
 * CREATE TABLE IF NOT EXISTS — safe to call on every cold start.
 */
import { sql } from './db';

let ensured = false;

export async function ensureSharingSchema(): Promise<void> {
  if (ensured) return;

  // pantry_shares — User A invites User B to view A's pantry (read-only)
  await sql`
    CREATE TABLE IF NOT EXISTS pantry_shares (
      id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      owner_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      guest_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      status       VARCHAR(20) NOT NULL DEFAULT 'pending',
      message      TEXT,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
      responded_at TIMESTAMPTZ,
      CONSTRAINT pantry_shares_pair UNIQUE (owner_id, guest_id),
      CONSTRAINT pantry_shares_no_self CHECK (owner_id <> guest_id),
      CONSTRAINT pantry_shares_status  CHECK (status IN ('pending','accepted','rejected','revoked'))
    )
  `;

  // product_gifts — User A sends a product copy to User B
  await sql`
    CREATE TABLE IF NOT EXISTS product_gifts (
      id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      product_id          UUID        NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      sender_id           UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      recipient_id        UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      message             TEXT,
      status              VARCHAR(20) NOT NULL DEFAULT 'pending',
      accepted_product_id UUID        REFERENCES products(id) ON DELETE SET NULL,
      created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
      responded_at        TIMESTAMPTZ,
      CONSTRAINT product_gifts_no_self CHECK (sender_id <> recipient_id),
      CONSTRAINT product_gifts_status  CHECK (status IN ('pending','accepted','declined'))
    )
  `;

  ensured = true;
}
