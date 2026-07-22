import { sql } from './db';
import { ensureProductSharingSchema } from './ensure-schema';

export interface ProductAccess {
  readonly product: Record<string, unknown>;
  /** true when the row belongs to the requesting user (not just shared with them) */
  readonly isOwner: boolean;
}

/**
 * Resolves a product the user is allowed to act on in the shared pantry:
 * their own products, plus non-private products of other members of their
 * household. Returns null when the product does not exist or is out of reach,
 * so callers can answer 404 exactly as before.
 *
 * Household members may change stock, edit and gift a shared product — the
 * whole point of a shared pantry is that anyone can say "se acabó la leche".
 * Deleting stays owner-only: check `isOwner` for destructive operations.
 */
export async function findAccessibleProduct(
  id: string,
  userId: string,
): Promise<ProductAccess | null> {
  await ensureProductSharingSchema();
  const rows = await sql`
    SELECT p.* FROM products p
    WHERE p.id = ${id}
      AND (
        p.user_id = ${userId}
        OR (
          p.is_private = false
          AND p.household_id IS NOT NULL
          AND p.household_id = (SELECT household_id FROM users WHERE id = ${userId})
        )
      )
    LIMIT 1
  `;
  const product = rows[0] as Record<string, unknown> | undefined;
  if (!product) return null;
  return { product, isOwner: String(product.user_id) === userId };
}
