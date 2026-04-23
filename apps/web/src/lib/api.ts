import { getSession } from './session';
import { sql } from './db';
import { randomUUID } from 'node:crypto';

async function getUserHousehold(userId: string): Promise<string | null> {
  const rows = await sql`SELECT household_id FROM users WHERE id = ${userId} LIMIT 1`;
  return (rows[0] as { household_id: string | null } | undefined)?.household_id ?? null;
}

async function getAuthContext() {
  const session = await getSession();
  if (!session.isLoggedIn || !session.userId) throw new Error('Not authenticated');
  const householdId = await getUserHousehold(session.userId);
  return { userId: session.userId, householdId };
}

// ─── Products ─────────────────────────────────────────────────────────────────
export const api = {
  products: {
    list: async () => {
      const { userId, householdId } = await getAuthContext();
      if (householdId) {
        return sql`SELECT * FROM products WHERE household_id = ${householdId} ORDER BY name ASC`;
      }
      return sql`SELECT * FROM products WHERE user_id = ${userId} AND household_id IS NULL ORDER BY name ASC`;
    },
    runningLow: async () => {
      const { userId, householdId } = await getAuthContext();
      if (householdId) {
        return sql`SELECT * FROM products WHERE household_id = ${householdId} AND (needs_shopping = true OR is_running_low = true) ORDER BY name ASC`;
      }
      return sql`SELECT * FROM products WHERE user_id = ${userId} AND household_id IS NULL AND (needs_shopping = true OR is_running_low = true) ORDER BY name ASC`;
    },
    get: async (id: string) => {
      const rows = await sql`SELECT * FROM products WHERE id = ${id} LIMIT 1`;
      return rows[0] ?? null;
    },
    create: async (data: import('@foody/types').CreateProductDto) => {
      const { userId, householdId } = await getAuthContext();
      const id = randomUUID();
      const rows = await sql`
        INSERT INTO products (id, name, description, photo_url, category, current_quantity, min_quantity, unit, stock_level, is_running_low, needs_shopping, user_id, household_id, created_at, updated_at)
        VALUES (${id}, ${data.name}, ${data.description ?? null}, ${(data as Record<string,unknown>).photoUrl as string ?? null}, ${data.category ?? null}, ${data.currentQuantity ?? 0}, ${data.minQuantity ?? 1}, ${data.unit ?? 'units'}, 'full', false, false, ${userId}, ${householdId}, NOW(), NOW())
        RETURNING *
      `;
      return rows[0];
    },
    update: async (id: string, data: import('@foody/types').UpdateProductDto) => {
      const rows = await sql`
        UPDATE products SET
          name = COALESCE(${data.name ?? null}, name),
          description = COALESCE(${data.description ?? null}, description),
          category = COALESCE(${data.category ?? null}, category),
          current_quantity = COALESCE(${data.currentQuantity ?? null}, current_quantity),
          min_quantity = COALESCE(${data.minQuantity ?? null}, min_quantity),
          unit = COALESCE(${data.unit ?? null}, unit),
          updated_at = NOW()
        WHERE id = ${id} RETURNING *
      `;
      return rows[0];
    },
    markLow: async (id: string) => {
      const { userId } = await getAuthContext();
      const rows = await sql`UPDATE products SET stock_level='half', is_running_low=true, needs_shopping=true, updated_at=NOW() WHERE id=${id} RETURNING *`;
      await sql`INSERT INTO shopping_list_items (id, product_id, user_id, added_at) VALUES (gen_random_uuid(), ${id}, ${userId}, NOW()) ON CONFLICT DO NOTHING`;
      return rows[0];
    },
    markOk: async (id: string) => {
      const { userId } = await getAuthContext();
      const rows = await sql`UPDATE products SET stock_level='full', is_running_low=false, needs_shopping=false, updated_at=NOW() WHERE id=${id} RETURNING *`;
      await sql`DELETE FROM shopping_list_items WHERE product_id=${id} AND user_id=${userId}`;
      return rows[0];
    },
    setStockLevel: async (id: string, level: import('@foody/types').StockLevel) => {
      const { userId } = await getAuthContext();
      const isRunningLow = level !== 'full';
      const needsShopping = level === 'empty';
      const rows = await sql`UPDATE products SET stock_level=${level}, is_running_low=${isRunningLow}, needs_shopping=${needsShopping}, updated_at=NOW() WHERE id=${id} RETURNING *`;
      if (level === 'full') {
        await sql`DELETE FROM shopping_list_items WHERE product_id=${id} AND user_id=${userId}`;
      } else {
        await sql`INSERT INTO shopping_list_items (id, product_id, user_id, added_at) VALUES (gen_random_uuid(), ${id}, ${userId}, NOW()) ON CONFLICT DO NOTHING`;
      }
      return rows[0];
    },
    delete: async (id: string) => {
      await sql`DELETE FROM products WHERE id = ${id}`;
    },
    getUploadUrl: async (_fileName: string, _contentType: string) => {
      // File upload requires Supabase Storage — not yet configured
      throw new Error('File upload not configured');
    },
    registerPurchase: async (id: string, data: import('@foody/types').CreatePurchaseDto) => {
      const { userId, householdId } = await getAuthContext();
      const purchaseId = randomUUID();
      const unitPrice = data.unitPrice ?? (data.totalPrice! / data.quantity);
      const totalPrice = data.totalPrice ?? (unitPrice * data.quantity);
      await sql`
        INSERT INTO product_purchases (id, product_id, quantity, unit_price, total_price, price_source, currency, purchased_at, user_id, household_id, created_at)
        VALUES (${purchaseId}, ${id}, ${data.quantity}, ${unitPrice}, ${totalPrice}, 'manual', ${data.currency ?? 'MXN'}, ${(data as Record<string,unknown>).purchasedAt as string ?? new Date().toISOString()}, ${userId}, ${householdId}, NOW())
      `;
      const rows = await sql`UPDATE products SET current_quantity=current_quantity+${data.quantity}, stock_level='full', is_running_low=false, needs_shopping=false, last_purchase_price=${unitPrice}, last_purchase_date=NOW(), updated_at=NOW() WHERE id=${id} RETURNING *`;
      await sql`DELETE FROM shopping_list_items WHERE product_id=${id} AND user_id=${userId}`;
      return { product: rows[0], purchase: { id: purchaseId } };
    },
    listPurchases: async (id: string) => {
      return sql`SELECT * FROM product_purchases WHERE product_id = ${id} ORDER BY purchased_at DESC`;
    },
    deletePurchase: async (id: string, purchaseId: string) => {
      await sql`DELETE FROM product_purchases WHERE id = ${purchaseId}`;
      const rows = await sql`SELECT * FROM products WHERE id = ${id} LIMIT 1`;
      return rows[0];
    },
  },
  shoppingList: {
    get: async () => {
      const { userId, householdId } = await getAuthContext();
      if (householdId) {
        return sql`SELECT sli.*, p.name as product_name, p.unit, p.photo_url, p.category, p.stock_level FROM shopping_list_items sli LEFT JOIN products p ON sli.product_id = p.id WHERE sli.household_id = ${householdId} ORDER BY sli.added_at DESC`;
      }
      return sql`SELECT sli.*, p.name as product_name, p.unit, p.photo_url, p.category, p.stock_level FROM shopping_list_items sli LEFT JOIN products p ON sli.product_id = p.id WHERE sli.user_id = ${userId} AND sli.household_id IS NULL ORDER BY sli.added_at DESC`;
    },
    frequent: async () => {
      const { userId } = await getAuthContext();
      return sql`SELECT product_id as "productId", p.name, p.photo_url as "photoUrl", COUNT(*) as purchases, MAX(purchased_at) as "lastPurchasedAt" FROM product_purchases pp JOIN products p ON pp.product_id = p.id WHERE pp.user_id = ${userId} GROUP BY product_id, p.name, p.photo_url ORDER BY purchases DESC LIMIT 10`;
    },
    toggleCart: async (id: string) => {
      const rows = await sql`UPDATE shopping_list_items SET in_cart = NOT in_cart WHERE id = ${id} RETURNING *`;
      return rows[0];
    },
    completeShopping: async () => {
      const { userId } = await getAuthContext();
      await sql`DELETE FROM shopping_list_items WHERE user_id = ${userId} AND in_cart = true`;
      return { message: 'Shopping completed' };
    },
  },
  payments: {
    list: async () => {
      const { userId, householdId } = await getAuthContext();
      if (householdId) {
        return sql`SELECT * FROM payments WHERE household_id = ${householdId} ORDER BY due_date DESC`;
      }
      return sql`SELECT * FROM payments WHERE user_id = ${userId} AND household_id IS NULL ORDER BY due_date DESC`;
    },
    byCategory: async () => {
      const { userId, householdId } = await getAuthContext();
      if (householdId) {
        return sql`SELECT category, SUM(amount) as total, COUNT(*) as count FROM payments WHERE household_id = ${householdId} GROUP BY category`;
      }
      return sql`SELECT category, SUM(amount) as total, COUNT(*) as count FROM payments WHERE user_id = ${userId} AND household_id IS NULL GROUP BY category`;
    },
    get: async (id: string) => {
      const rows = await sql`SELECT * FROM payments WHERE id = ${id} LIMIT 1`;
      return rows[0] ?? null;
    },
    create: async (data: import('@foody/types').CreatePaymentDto) => {
      const { userId, householdId } = await getAuthContext();
      const id = randomUUID();
      const rows = await sql`
        INSERT INTO payments (id, name, amount, currency, due_date, category, is_paid, notes, is_recurring, user_id, household_id, created_at, updated_at)
        VALUES (${id}, ${data.name}, ${data.amount}, ${data.currency ?? 'MXN'}, ${data.dueDate ?? null}, ${data.category ?? null}, false, ${data.notes ?? null}, ${data.isRecurring ?? false}, ${userId}, ${householdId}, NOW(), NOW())
        RETURNING *
      `;
      return rows[0];
    },
    update: async (id: string, data: Partial<import('@foody/types').CreatePaymentDto>) => {
      const rows = await sql`
        UPDATE payments SET
          name = COALESCE(${data.name ?? null}, name),
          amount = COALESCE(${data.amount ?? null}, amount),
          due_date = COALESCE(${data.dueDate ?? null}, due_date),
          notes = COALESCE(${data.notes ?? null}, notes),
          updated_at = NOW()
        WHERE id = ${id} RETURNING *
      `;
      return rows[0];
    },
    markPaid: async (id: string) => {
      const rows = await sql`UPDATE payments SET is_paid = true, updated_at = NOW() WHERE id = ${id} RETURNING *`;
      return rows[0];
    },
    markUnpaid: async (id: string) => {
      await sql`UPDATE payments SET is_paid = false, updated_at = NOW() WHERE id = ${id}`;
    },
    delete: async (id: string) => {
      await sql`DELETE FROM payments WHERE id = ${id}`;
    },
  },
  users: {
    me: async () => {
      const { userId } = await getAuthContext();
      const rows = await sql`SELECT * FROM users WHERE id = ${userId} LIMIT 1`;
      return rows[0] ?? null;
    },
    updateMe: async (data: { name?: string; onesignalPlayerId?: string }) => {
      const { userId } = await getAuthContext();
      const rows = await sql`
        UPDATE users SET name = COALESCE(${data.name ?? null}, name), onesignal_player_id = COALESCE(${data.onesignalPlayerId ?? null}, onesignal_player_id), updated_at = NOW()
        WHERE id = ${userId} RETURNING *
      `;
      return rows[0];
    },
  },
  households: {
    me: async () => {
      const { userId, householdId } = await getAuthContext();
      if (!householdId) return { household: null, members: [], isOwner: false };
      const hhRows = await sql`SELECT * FROM households WHERE id = ${householdId} LIMIT 1`;
      const household = hhRows[0] as { id: string; name: string; owner_id: string } | undefined;
      if (!household) return { household: null, members: [], isOwner: false };
      const members = await sql`SELECT id, name, email, avatar_url as "avatarUrl" FROM users WHERE household_id = ${householdId}`;
      return { household: { id: household.id, name: household.name, ownerId: household.owner_id }, members, isOwner: household.owner_id === userId };
    },
    create: async (name: string) => {
      const { userId } = await getAuthContext();
      const id = randomUUID();
      await sql`INSERT INTO households (id, name, owner_id, created_at, updated_at) VALUES (${id}, ${name}, ${userId}, NOW(), NOW())`;
      await sql`UPDATE users SET household_id = ${id} WHERE id = ${userId}`;
      return { id, name, ownerId: userId };
    },
    createInvite: async () => {
      const { householdId } = await getAuthContext();
      if (!householdId) throw new Error('No household');
      const code = randomUUID().replace(/-/g, '').substring(0, 8).toUpperCase();
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      await sql`INSERT INTO household_invites (id, household_id, code, expires_at, created_at) VALUES (gen_random_uuid(), ${householdId}, ${code}, ${expiresAt}, NOW())`;
      return { code, expiresAt };
    },
    join: async (code: string) => {
      const { userId } = await getAuthContext();
      const invites = await sql`SELECT * FROM household_invites WHERE code = ${code} AND expires_at > NOW() AND used_at IS NULL LIMIT 1`;
      if (!invites.length) throw new Error('Invalid or expired invite code');
      const invite = invites[0] as { id: string; household_id: string };
      await sql`UPDATE users SET household_id = ${invite.household_id} WHERE id = ${userId}`;
      await sql`UPDATE household_invites SET used_at = NOW() WHERE id = ${invite.id}`;
      const hhRows = await sql`SELECT * FROM households WHERE id = ${invite.household_id} LIMIT 1`;
      return hhRows[0];
    },
    leave: async () => {
      const { userId } = await getAuthContext();
      await sql`UPDATE users SET household_id = NULL WHERE id = ${userId}`;
    },
  },
  stores: {
    list: async () => {
      const { userId, householdId } = await getAuthContext();
      if (householdId) return sql`SELECT * FROM stores WHERE household_id = ${householdId} ORDER BY name ASC`;
      return sql`SELECT * FROM stores WHERE user_id = ${userId} AND household_id IS NULL ORDER BY name ASC`;
    },
    get: async (id: string) => {
      const rows = await sql`SELECT * FROM stores WHERE id = ${id} LIMIT 1`;
      return rows[0] ?? null;
    },
    create: async (data: import('@foody/types').CreateStoreDto) => {
      const { userId, householdId } = await getAuthContext();
      const id = randomUUID();
      const rows = await sql`INSERT INTO stores (id, name, address, user_id, household_id, created_at, updated_at) VALUES (${id}, ${data.name}, ${data.address ?? null}, ${userId}, ${householdId}, NOW(), NOW()) RETURNING *`;
      return rows[0];
    },
    update: async (id: string, data: import('@foody/types').UpdateStoreDto) => {
      const rows = await sql`UPDATE stores SET name = COALESCE(${data.name ?? null}, name), address = COALESCE(${data.address ?? null}, address), updated_at = NOW() WHERE id = ${id} RETURNING *`;
      return rows[0];
    },
    delete: async (id: string) => {
      await sql`DELETE FROM stores WHERE id = ${id}`;
    },
  },
  shoppingTrips: {
    list: async () => {
      const { userId, householdId } = await getAuthContext();
      if (householdId) return sql`SELECT * FROM shopping_trips WHERE household_id = ${householdId} ORDER BY date DESC`;
      return sql`SELECT * FROM shopping_trips WHERE user_id = ${userId} AND household_id IS NULL ORDER BY date DESC`;
    },
    byStore: async () => {
      const { userId, householdId } = await getAuthContext();
      if (householdId) {
        return sql`SELECT store_name as "storeName", SUM(total_spent) as total, COUNT(*) as count FROM shopping_trips WHERE household_id = ${householdId} GROUP BY store_name`;
      }
      return sql`SELECT store_name as "storeName", SUM(total_spent) as total, COUNT(*) as count FROM shopping_trips WHERE user_id = ${userId} AND household_id IS NULL GROUP BY store_name`;
    },
    get: async (id: string) => {
      const rows = await sql`SELECT * FROM shopping_trips WHERE id = ${id} LIMIT 1`;
      return rows[0] ?? null;
    },
    create: async (data: import('@foody/types').CreateShoppingTripDto) => {
      const { userId, householdId } = await getAuthContext();
      const id = randomUUID();
      const rows = await sql`
        INSERT INTO shopping_trips (id, store_id, store_name, date, total_spent, currency, notes, user_id, household_id, created_at, updated_at)
        VALUES (${id}, ${data.storeId ?? null}, ${data.storeName ?? null}, ${data.date ?? new Date().toISOString()}, ${data.totalSpent ?? 0}, ${data.currency ?? 'MXN'}, ${data.notes ?? null}, ${userId}, ${householdId}, NOW(), NOW())
        RETURNING *
      `;
      return rows[0];
    },
    update: async (id: string, data: Partial<import('@foody/types').CreateShoppingTripDto>) => {
      const rows = await sql`
        UPDATE shopping_trips SET store_name = COALESCE(${data.storeName ?? null}, store_name), total_spent = COALESCE(${data.totalSpent ?? null}, total_spent), notes = COALESCE(${data.notes ?? null}, notes), updated_at = NOW()
        WHERE id = ${id} RETURNING *
      `;
      return rows[0];
    },
    delete: async (id: string) => {
      await sql`DELETE FROM shopping_trips WHERE id = ${id}`;
    },
  },
};
