import { getSession } from './session';
import { sql } from './db';
import { randomUUID } from 'node:crypto';
import type {
  AllocationStrategy,
  CreateShoppingTripDto,
  CreateShoppingTripResponse,
  CreatePaymentDto,
  CreateProductDto,
  CreateStoreDto,
  MonthlyPayment,
  PaymentRecord,
  Product,
  ProductPurchase,
  ShoppingListItem,
  ShoppingTrip,
  ShoppingTripDetail,
  StockLevel,
  Store,
  UpdateProductDto,
  UpdateStoreDto,
} from '@foody/types';

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

function asNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    return Number.isNaN(parsed) ? fallback : parsed;
  }
  return fallback;
}

function asInteger(value: unknown, fallback = 0): number {
  if (typeof value === 'number') return Math.trunc(value);
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10);
    return Number.isNaN(parsed) ? fallback : parsed;
  }
  return fallback;
}

function asIsoString(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value instanceof Date) return value.toISOString();
  return new Date(value as string | number | Date).toISOString();
}

function asText(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function getProductStatus(stockLevel: StockLevel): Product['status'] {
  if (stockLevel === 'empty') return 'empty';
  if (stockLevel === 'half') return 'low';
  return 'ok';
}

function mapProduct(row: Record<string, unknown>): Product {
  const stockLevel = (row.stock_level as StockLevel | undefined) ?? 'full';
  return {
    id: String(row.id),
    name: asText(row.name),
    description: (row.description as string | null | undefined) ?? null,
    photoUrl: (row.photo_url as string | null | undefined) ?? null,
    category: (row.category as string | null | undefined) ?? null,
    currentQuantity: asNumber(row.current_quantity),
    minQuantity: asNumber(row.min_quantity, 1),
    unit: asText(row.unit, 'units'),
    stockLevel,
    isRunningLow: Boolean(row.is_running_low),
    needsShopping: Boolean(row.needs_shopping),
    status: getProductStatus(stockLevel),
    userId: String(row.user_id),
    createdAt: asIsoString(row.created_at),
    updatedAt: asIsoString(row.updated_at),
    lastPurchasePrice: row.last_purchase_price == null ? null : asNumber(row.last_purchase_price),
    lastPurchaseDate: row.last_purchase_date == null ? null : asIsoString(row.last_purchase_date),
    avgPrice: row.avg_price == null ? null : asNumber(row.avg_price),
    totalSpent: asNumber(row.total_spent),
    totalPurchasedQty: asNumber(row.total_purchased_qty),
    currency: asText(row.currency, 'MXN'),
  };
}

function mapProductPurchase(row: Record<string, unknown>): ProductPurchase {
  return {
    id: String(row.id),
    productId: String(row.product_id),
    quantity: asNumber(row.quantity),
    unitPrice: row.unit_price == null ? null : asNumber(row.unit_price),
    totalPrice: row.total_price == null ? null : asNumber(row.total_price),
    priceSource: (row.price_source as ProductPurchase['priceSource'] | undefined) ?? 'unknown',
    currency: asText(row.currency, 'MXN'),
    purchasedAt: asIsoString(row.purchased_at),
    storeId: (row.store_id as string | null | undefined) ?? null,
    storeName: (row.store_name as string | null | undefined) ?? null,
    tripId: (row.trip_id as string | null | undefined) ?? null,
    userId: String(row.user_id),
    createdAt: asIsoString(row.created_at),
  };
}

function getCurrentMonthYear() {
  const now = new Date();
  return { month: now.getMonth() + 1, year: now.getFullYear() };
}

function daysUntilDue(dueDay: number): number {
  const now = new Date();
  const today = now.getDate();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();

  if (dueDay >= today) return dueDay - today;
  return daysInMonth - today + dueDay;
}

function mapPaymentRecord(row: Record<string, unknown>): PaymentRecord {
  return {
    id: String(row.id),
    paymentId: String(row.payment_id),
    month: asInteger(row.month),
    year: asInteger(row.year),
    paidAt: row.paid_at == null ? null : asIsoString(row.paid_at),
    amount: asNumber(row.amount),
    status: (row.status as PaymentRecord['status'] | undefined) ?? 'pending',
    userId: String(row.user_id),
    createdAt: asIsoString(row.created_at),
  };
}

function mapMonthlyPayment(row: Record<string, unknown>, currentRecord?: PaymentRecord): MonthlyPayment {
  const dueDay = asInteger(row.due_day, 1);
  return {
    id: String(row.id),
    name: asText(row.name),
    description: (row.description as string | null | undefined) ?? null,
    amount: asNumber(row.amount),
    currency: asText(row.currency, 'USD'),
    dueDay,
    category: ((row.category as string | null | undefined) ?? 'other') as MonthlyPayment['category'],
    isActive: row.is_active == null ? true : Boolean(row.is_active),
    notificationDaysBefore: asInteger(row.notification_days_before, 3),
    userId: String(row.user_id),
    createdAt: asIsoString(row.created_at),
    updatedAt: asIsoString(row.updated_at),
    isPaidThisMonth: currentRecord?.status === 'paid',
    daysUntilDue: daysUntilDue(dueDay),
    currentRecord,
  };
}

function mapShoppingTrip(row: Record<string, unknown>): ShoppingTrip {
  return {
    id: String(row.id),
    storeId: (row.store_id as string | null | undefined) ?? null,
    storeName: (row.store_name as string | null | undefined) ?? null,
    purchasedAt: asIsoString(row.purchased_at),
    totalAmount: asNumber(row.total_amount),
    currency: asText(row.currency, 'MXN'),
    allocationStrategy: (row.allocation_strategy as AllocationStrategy | undefined) ?? 'manual_partial',
    receiptPhotoUrl: (row.receipt_photo_url as string | null | undefined) ?? null,
    notes: (row.notes as string | null | undefined) ?? null,
    userId: String(row.user_id),
    createdAt: asIsoString(row.created_at),
    updatedAt: asIsoString(row.updated_at),
  };
}

function mapShoppingListItem(row: Record<string, unknown>): ShoppingListItem {
  return {
    id: String(row.id),
    productId: String(row.product_id),
    product: {
      id: String(row.product_id),
      name: asText(row.product_name),
      description: (row.product_description as string | null | undefined) ?? null,
      photoUrl: (row.product_photo_url as string | null | undefined) ?? null,
      category: (row.product_category as string | null | undefined) ?? null,
      currentQuantity: asNumber(row.product_current_quantity),
      minQuantity: asNumber(row.product_min_quantity, 1),
      unit: asText(row.product_unit, 'units'),
      stockLevel: (row.product_stock_level as StockLevel | undefined) ?? 'full',
      isRunningLow: Boolean(row.product_is_running_low),
      needsShopping: Boolean(row.product_needs_shopping),
      status: getProductStatus((row.product_stock_level as StockLevel | undefined) ?? 'full'),
      userId: asText(row.product_user_id, String(row.user_id)),
      createdAt: row.product_created_at ? asIsoString(row.product_created_at) : asIsoString(row.created_at),
      updatedAt: row.product_updated_at ? asIsoString(row.product_updated_at) : asIsoString(row.updated_at),
      lastPurchasePrice: row.product_last_purchase_price == null ? null : asNumber(row.product_last_purchase_price),
      lastPurchaseDate: row.product_last_purchase_date == null ? null : asIsoString(row.product_last_purchase_date),
      avgPrice: row.product_avg_price == null ? null : asNumber(row.product_avg_price),
      totalSpent: asNumber(row.product_total_spent),
      totalPurchasedQty: asNumber(row.product_total_purchased_qty),
      currency: asText(row.product_currency, 'MXN'),
    },
    quantityNeeded: asNumber(row.quantity_needed, 1),
    isInCart: Boolean(row.is_in_cart),
    isPurchased: Boolean(row.is_purchased),
    userId: String(row.user_id),
    createdAt: asIsoString(row.created_at),
    updatedAt: asIsoString(row.updated_at),
  };
}

function mapStore(row: Record<string, unknown>): Store {
  return {
    id: String(row.id),
    name: asText(row.name),
    chain: (row.chain as string | null | undefined) ?? null,
    location: (row.location as string | null | undefined) ?? null,
    currency: asText(row.currency, 'MXN'),
    color: (row.color as string | null | undefined) ?? null,
    icon: (row.icon as string | null | undefined) ?? null,
    userId: String(row.user_id),
    createdAt: asIsoString(row.created_at),
    updatedAt: asIsoString(row.updated_at),
  };
}

// ─── Products ─────────────────────────────────────────────────────────────────
export const api = {
  products: {
    list: async (): Promise<Product[]> => {
      const { userId, householdId } = await getAuthContext();
      if (householdId) {
        const rows = await sql`SELECT * FROM products WHERE household_id = ${householdId} ORDER BY name ASC`;
        return rows.map((row) => mapProduct(row as Record<string, unknown>));
      }
      const rows = await sql`SELECT * FROM products WHERE user_id = ${userId} AND household_id IS NULL ORDER BY name ASC`;
      return rows.map((row) => mapProduct(row as Record<string, unknown>));
    },
    runningLow: async (): Promise<Product[]> => {
      const { userId, householdId } = await getAuthContext();
      if (householdId) {
        const rows = await sql`SELECT * FROM products WHERE household_id = ${householdId} AND (needs_shopping = true OR is_running_low = true) ORDER BY name ASC`;
        return rows.map((row) => mapProduct(row as Record<string, unknown>));
      }
      const rows = await sql`SELECT * FROM products WHERE user_id = ${userId} AND household_id IS NULL AND (needs_shopping = true OR is_running_low = true) ORDER BY name ASC`;
      return rows.map((row) => mapProduct(row as Record<string, unknown>));
    },
    get: async (id: string) => {
      const rows = await sql`SELECT * FROM products WHERE id = ${id} LIMIT 1`;
      return rows[0] ? mapProduct(rows[0] as Record<string, unknown>) : null;
    },
    create: async (data: CreateProductDto) => {
      const { userId, householdId } = await getAuthContext();
      const id = randomUUID();
      const rows = await sql`
        INSERT INTO products (id, name, description, photo_url, category, current_quantity, min_quantity, unit, stock_level, is_running_low, needs_shopping, user_id, household_id, created_at, updated_at)
        VALUES (${id}, ${data.name}, ${data.description ?? null}, ${data.photoUrl ?? null}, ${data.category ?? null}, ${data.currentQuantity ?? 0}, ${data.minQuantity ?? 1}, ${data.unit ?? 'units'}, 'full', false, false, ${userId}, ${householdId}, NOW(), NOW())
        RETURNING *
      `;
      return mapProduct(rows[0] as Record<string, unknown>);
    },
    update: async (id: string, data: UpdateProductDto) => {
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
      return mapProduct(rows[0] as Record<string, unknown>);
    },
    markLow: async (id: string) => {
      const { userId } = await getAuthContext();
      const rows = await sql`UPDATE products SET stock_level='half', is_running_low=true, needs_shopping=true, updated_at=NOW() WHERE id=${id} RETURNING *`;
      await sql`INSERT INTO shopping_list_items (id, product_id, user_id, created_at, updated_at) VALUES (gen_random_uuid(), ${id}, ${userId}, NOW(), NOW()) ON CONFLICT DO NOTHING`;
      return mapProduct(rows[0] as Record<string, unknown>);
    },
    markOk: async (id: string) => {
      const { userId } = await getAuthContext();
      const rows = await sql`UPDATE products SET stock_level='full', is_running_low=false, needs_shopping=false, updated_at=NOW() WHERE id=${id} RETURNING *`;
      await sql`DELETE FROM shopping_list_items WHERE product_id=${id} AND user_id=${userId}`;
      return mapProduct(rows[0] as Record<string, unknown>);
    },
    setStockLevel: async (id: string, level: StockLevel) => {
      const { userId } = await getAuthContext();
      const isRunningLow = level !== 'full';
      const needsShopping = level === 'empty';
      const rows = await sql`UPDATE products SET stock_level=${level}, is_running_low=${isRunningLow}, needs_shopping=${needsShopping}, updated_at=NOW() WHERE id=${id} RETURNING *`;
      if (level === 'full') {
        await sql`DELETE FROM shopping_list_items WHERE product_id=${id} AND user_id=${userId}`;
      } else {
        await sql`INSERT INTO shopping_list_items (id, product_id, user_id, created_at, updated_at) VALUES (gen_random_uuid(), ${id}, ${userId}, NOW(), NOW()) ON CONFLICT DO NOTHING`;
      }
      return mapProduct(rows[0] as Record<string, unknown>);
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
      const purchaseRows = await sql`
        INSERT INTO product_purchases (id, product_id, quantity, unit_price, total_price, price_source, currency, purchased_at, user_id, household_id, created_at)
        VALUES (${purchaseId}, ${id}, ${data.quantity}, ${unitPrice}, ${totalPrice}, 'manual', ${data.currency ?? 'MXN'}, ${data.purchasedAt ?? new Date().toISOString()}, ${userId}, ${householdId}, NOW())
        RETURNING *
      `;
      const rows = await sql`UPDATE products SET current_quantity=current_quantity+${data.quantity}, stock_level='full', is_running_low=false, needs_shopping=false, last_purchase_price=${unitPrice}, last_purchase_date=NOW(), updated_at=NOW() WHERE id=${id} RETURNING *`;
      await sql`DELETE FROM shopping_list_items WHERE product_id=${id} AND user_id=${userId}`;
      return {
        product: mapProduct(rows[0] as Record<string, unknown>),
        purchase: mapProductPurchase(purchaseRows[0] as Record<string, unknown>),
      };
    },
    listPurchases: async (id: string) => {
      const rows = await sql`SELECT * FROM product_purchases WHERE product_id = ${id} ORDER BY purchased_at DESC`;
      return rows.map((row) => mapProductPurchase(row as Record<string, unknown>));
    },
    deletePurchase: async (id: string, purchaseId: string) => {
      await sql`DELETE FROM product_purchases WHERE id = ${purchaseId}`;
      const rows = await sql`SELECT * FROM products WHERE id = ${id} LIMIT 1`;
      return mapProduct(rows[0] as Record<string, unknown>);
    },
  },
  shoppingList: {
    get: async () => {
      const { userId, householdId } = await getAuthContext();
      if (householdId) {
        const rows = await sql`
          SELECT
            sli.*,
            p.name       as product_name,
            p.description as product_description,
            p.photo_url  as product_photo_url,
            p.category   as product_category,
            p.current_quantity as product_current_quantity,
            p.min_quantity     as product_min_quantity,
            p.unit             as product_unit,
            p.stock_level      as product_stock_level,
            p.is_running_low   as product_is_running_low,
            p.needs_shopping   as product_needs_shopping,
            p.user_id          as product_user_id,
            p.created_at       as product_created_at,
            p.updated_at       as product_updated_at
          FROM shopping_list_items sli
          LEFT JOIN products p ON sli.product_id = p.id
          WHERE sli.household_id = ${householdId}
          ORDER BY sli.created_at DESC
        `;
        return rows.map((row) => mapShoppingListItem(row as Record<string, unknown>));
      }
      const rows = await sql`
        SELECT
          sli.*,
          p.name       as product_name,
          p.description as product_description,
          p.photo_url  as product_photo_url,
          p.category   as product_category,
          p.current_quantity as product_current_quantity,
          p.min_quantity     as product_min_quantity,
          p.unit             as product_unit,
          p.stock_level      as product_stock_level,
          p.is_running_low   as product_is_running_low,
          p.needs_shopping   as product_needs_shopping,
          p.user_id          as product_user_id,
          p.created_at       as product_created_at,
          p.updated_at       as product_updated_at
        FROM shopping_list_items sli
        LEFT JOIN products p ON sli.product_id = p.id
        WHERE sli.user_id = ${userId} AND sli.household_id IS NULL
        ORDER BY sli.created_at DESC
      `;
      return rows.map((row) => mapShoppingListItem(row as Record<string, unknown>));
    },
    frequent: async () => {
      const { userId } = await getAuthContext();
      const rows = await sql`SELECT product_id as "productId", p.name, p.photo_url as "photoUrl", COUNT(*) as purchases, MAX(purchased_at) as "lastPurchasedAt" FROM product_purchases pp JOIN products p ON pp.product_id = p.id WHERE pp.user_id = ${userId} GROUP BY product_id, p.name, p.photo_url ORDER BY purchases DESC LIMIT 10`;
      return rows.map((row) => ({
        productId: String(row.productId),
        name: asText(row.name),
        photoUrl: (row.photoUrl as string | null | undefined) ?? null,
        purchases: asInteger(row.purchases),
        lastPurchasedAt: asIsoString(row.lastPurchasedAt),
      }));
    },
    lastPurchases: async (): Promise<{ productId: string; purchasedAt: string; storeName: string | null }[]> => {
      const { userId } = await getAuthContext();
      const rows = await sql`
        SELECT DISTINCT ON (pp.product_id)
          pp.product_id  AS "productId",
          pp.purchased_at AS "purchasedAt",
          pp.store_name  AS "storeName"
        FROM product_purchases pp
        WHERE pp.user_id = ${userId}
        ORDER BY pp.product_id, pp.purchased_at DESC
      `;
      return (rows as { productId: string; purchasedAt: string; storeName: string | null }[]).map((r) => ({
        productId: String(r.productId),
        purchasedAt: asIsoString(r.purchasedAt),
        storeName: (r.storeName as string | null | undefined) ?? null,
      }));
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
    list: async (): Promise<MonthlyPayment[]> => {
      const { userId } = await getAuthContext();
      const payments = await sql`SELECT * FROM monthly_payments WHERE user_id = ${userId} AND is_active = true ORDER BY due_day ASC`;
      const { month, year } = getCurrentMonthYear();
      const records = await sql`SELECT * FROM payment_records WHERE user_id = ${userId} AND month = ${month} AND year = ${year}`;
      const recordMap = new Map(
        records.map((row) => {
          const record = mapPaymentRecord(row as Record<string, unknown>);
          return [record.paymentId, record] as const;
        }),
      );

      return payments.map((row) => {
        const paymentRow = row as Record<string, unknown>;
        const paymentId = String(paymentRow.id);
        return mapMonthlyPayment(paymentRow, recordMap.get(paymentId));
      });
    },
    byCategory: async () => {
      const { userId } = await getAuthContext();
      const rows = await sql`
        SELECT COALESCE(category, 'other') as category, SUM(amount) as total, COUNT(id) as count
        FROM monthly_payments
        WHERE user_id = ${userId} AND is_active = true
        GROUP BY category
        ORDER BY total DESC
      `;
      return rows.map((row) => ({
        category: String(row.category ?? 'other'),
        total: asNumber(row.total),
        count: asInteger(row.count),
      }));
    },
    get: async (id: string) => {
      const { userId } = await getAuthContext();
      const rows = await sql`SELECT * FROM monthly_payments WHERE id = ${id} AND user_id = ${userId} LIMIT 1`;
      if (!rows[0]) return null;

      const { month, year } = getCurrentMonthYear();
      const records = await sql`SELECT * FROM payment_records WHERE payment_id = ${id} AND user_id = ${userId} AND month = ${month} AND year = ${year} LIMIT 1`;
      const currentRecord = records[0] ? mapPaymentRecord(records[0] as Record<string, unknown>) : undefined;
      return mapMonthlyPayment(rows[0] as Record<string, unknown>, currentRecord);
    },
    create: async (data: CreatePaymentDto) => {
      const { userId } = await getAuthContext();
      const id = randomUUID();
      const rows = await sql`
        INSERT INTO monthly_payments (id, name, description, amount, currency, due_day, category, is_active, notification_days_before, user_id, created_at, updated_at)
        VALUES (${id}, ${data.name}, ${data.description ?? null}, ${data.amount}, ${data.currency ?? 'USD'}, ${data.dueDay}, ${data.category ?? null}, true, ${data.notificationDaysBefore ?? 3}, ${userId}, NOW(), NOW())
        RETURNING *
      `;
      return mapMonthlyPayment(rows[0] as Record<string, unknown>);
    },
    update: async (id: string, data: Partial<CreatePaymentDto>) => {
      const { userId } = await getAuthContext();
      const rows = await sql`
        UPDATE monthly_payments SET
          name = COALESCE(${data.name ?? null}, name),
          description = COALESCE(${data.description ?? null}, description),
          amount = COALESCE(${data.amount ?? null}, amount),
          currency = COALESCE(${data.currency ?? null}, currency),
          due_day = COALESCE(${data.dueDay ?? null}, due_day),
          category = COALESCE(${data.category ?? null}, category),
          notification_days_before = COALESCE(${data.notificationDaysBefore ?? null}, notification_days_before),
          updated_at = NOW()
        WHERE id = ${id} AND user_id = ${userId} RETURNING *
      `;
      return mapMonthlyPayment(rows[0] as Record<string, unknown>);
    },
    markPaid: async (id: string) => {
      const { userId } = await getAuthContext();
      const paymentRows = await sql`SELECT * FROM monthly_payments WHERE id = ${id} AND user_id = ${userId} LIMIT 1`;
      if (!paymentRows[0]) throw new Error('Payment not found');

      const payment = paymentRows[0] as Record<string, unknown>;
      const { month, year } = getCurrentMonthYear();
      const rows = await sql`
        INSERT INTO payment_records (id, payment_id, month, year, paid_at, amount, status, user_id, created_at)
        VALUES (gen_random_uuid(), ${id}, ${month}, ${year}, NOW(), ${asNumber(payment.amount)}, 'paid', ${userId}, NOW())
        ON CONFLICT (payment_id, month, year)
        DO UPDATE SET status = 'paid', paid_at = NOW(), amount = EXCLUDED.amount
        RETURNING *
      `;
      return mapPaymentRecord(rows[0] as Record<string, unknown>);
    },
    markUnpaid: async (id: string) => {
      const { userId } = await getAuthContext();
      const { month, year } = getCurrentMonthYear();
      await sql`DELETE FROM payment_records WHERE payment_id = ${id} AND user_id = ${userId} AND month = ${month} AND year = ${year}`;
    },
    delete: async (id: string) => {
      const { userId } = await getAuthContext();
      await sql`DELETE FROM monthly_payments WHERE id = ${id} AND user_id = ${userId}`;
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
      const code = randomUUID().replaceAll('-', '').substring(0, 8).toUpperCase();
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
      if (householdId) {
        const rows = await sql`SELECT * FROM stores WHERE household_id = ${householdId} ORDER BY name ASC`;
        return rows.map((row) => mapStore(row as Record<string, unknown>));
      }
      const rows = await sql`SELECT * FROM stores WHERE user_id = ${userId} AND household_id IS NULL ORDER BY name ASC`;
      return rows.map((row) => mapStore(row as Record<string, unknown>));
    },
    get: async (id: string) => {
      const rows = await sql`SELECT * FROM stores WHERE id = ${id} LIMIT 1`;
      return rows[0] ? mapStore(rows[0] as Record<string, unknown>) : null;
    },
    create: async (data: CreateStoreDto) => {
      const { userId, householdId } = await getAuthContext();
      const id = randomUUID();
      const rows = await sql`
        INSERT INTO stores (id, name, chain, location, currency, color, icon, user_id, household_id, created_at, updated_at)
        VALUES (${id}, ${data.name}, ${data.chain ?? null}, ${data.location ?? null}, ${data.currency ?? 'MXN'}, ${data.color ?? null}, ${data.icon ?? null}, ${userId}, ${householdId}, NOW(), NOW())
        RETURNING *
      `;
      return mapStore(rows[0] as Record<string, unknown>);
    },
    update: async (id: string, data: UpdateStoreDto) => {
      const rows = await sql`
        UPDATE stores SET
          name = COALESCE(${data.name ?? null}, name),
          chain = COALESCE(${data.chain ?? null}, chain),
          location = COALESCE(${data.location ?? null}, location),
          currency = COALESCE(${data.currency ?? null}, currency),
          color = COALESCE(${data.color ?? null}, color),
          icon = COALESCE(${data.icon ?? null}, icon),
          updated_at = NOW()
        WHERE id = ${id} RETURNING *
      `;
      return mapStore(rows[0] as Record<string, unknown>);
    },
    delete: async (id: string) => {
      await sql`DELETE FROM stores WHERE id = ${id}`;
    },
  },
  shoppingTrips: {
    list: async () => {
      const { userId, householdId } = await getAuthContext();
      if (householdId) {
        const rows = await sql`SELECT * FROM shopping_trips WHERE household_id = ${householdId} ORDER BY purchased_at DESC`;
        return rows.map((row) => mapShoppingTrip(row as Record<string, unknown>));
      }
      const rows = await sql`SELECT * FROM shopping_trips WHERE user_id = ${userId} AND household_id IS NULL ORDER BY purchased_at DESC`;
      return rows.map((row) => mapShoppingTrip(row as Record<string, unknown>));
    },
    byStore: async () => {
      const { userId, householdId } = await getAuthContext();
      if (householdId) {
        const rows = await sql`SELECT COALESCE(store_name, 'Sin tienda') as "storeName", SUM(total_amount) as total, COUNT(*) as count FROM shopping_trips WHERE household_id = ${householdId} GROUP BY store_name`;
        return rows.map((row) => ({
          storeName: asText(row.storeName, 'Sin tienda'),
          total: asNumber(row.total),
          count: asInteger(row.count),
        }));
      }
      const rows = await sql`SELECT COALESCE(store_name, 'Sin tienda') as "storeName", SUM(total_amount) as total, COUNT(*) as count FROM shopping_trips WHERE user_id = ${userId} AND household_id IS NULL GROUP BY store_name`;
      return rows.map((row) => ({
        storeName: asText(row.storeName, 'Sin tienda'),
        total: asNumber(row.total),
        count: asInteger(row.count),
      }));
    },
    get: async (id: string) => {
      const { userId, householdId } = await getAuthContext();
      const tripRows = householdId
        ? await sql`SELECT * FROM shopping_trips WHERE id = ${id} AND household_id = ${householdId} LIMIT 1`
        : await sql`SELECT * FROM shopping_trips WHERE id = ${id} AND user_id = ${userId} AND household_id IS NULL LIMIT 1`;
      if (!tripRows[0]) return null;

      const itemRows = await sql`SELECT * FROM product_purchases WHERE trip_id = ${id} ORDER BY created_at ASC`;
      return {
        ...mapShoppingTrip(tripRows[0] as Record<string, unknown>),
        items: itemRows.map((row) => mapProductPurchase(row as Record<string, unknown>)),
      } satisfies ShoppingTripDetail;
    },
    create: async (data: CreateShoppingTripDto) => {
      const { userId, householdId } = await getAuthContext();
      const id = randomUUID();
      const rows = await sql`
        INSERT INTO shopping_trips (id, store_id, store_name, purchased_at, total_amount, currency, allocation_strategy, receipt_photo_url, notes, user_id, household_id, created_at, updated_at)
        VALUES (${id}, ${data.storeId ?? null}, ${data.storeName ?? null}, ${data.purchasedAt ?? new Date().toISOString()}, ${data.totalAmount ?? 0}, ${data.currency ?? 'MXN'}, ${data.allocationStrategy ?? 'manual_partial'}, ${data.receiptPhotoUrl ?? null}, ${data.notes ?? null}, ${userId}, ${householdId}, NOW(), NOW())
        RETURNING *
      `;
      return {
        trip: mapShoppingTrip(rows[0] as Record<string, unknown>),
        items: [],
      } satisfies CreateShoppingTripResponse;
    },
    update: async (id: string, data: Partial<CreateShoppingTripDto>) => {
      const rows = await sql`
        UPDATE shopping_trips SET store_name = COALESCE(${data.storeName ?? null}, store_name), total_amount = COALESCE(${data.totalAmount ?? null}, total_amount), notes = COALESCE(${data.notes ?? null}, notes), updated_at = NOW()
        WHERE id = ${id} RETURNING *
      `;
      return mapShoppingTrip(rows[0] as Record<string, unknown>);
    },
    delete: async (id: string) => {
      await sql`DELETE FROM shopping_trips WHERE id = ${id}`;
    },
  },
};
