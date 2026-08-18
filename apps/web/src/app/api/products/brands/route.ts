import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getRouteUser, unauthorized } from '@/lib/route-helpers';
import { ensurePurchaseSchema } from '@/lib/ensure-schema';
import { suggestBrands, type BrandPurchase } from '@/lib/product-brands';

/**
 * GET /api/products/brands — las marcas que ya compraste, por producto.
 *
 * Alimenta los atajos de un toque al anotar el precio en el súper: quien
 * alterna entre dos marcas de parmesano no debería teclear el nombre cada vez.
 *
 * Una sola consulta para todos los productos del usuario, y solo las filas que
 * tienen marca: el payload es una lista de nombres cortos, nada que pese.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const user = await getRouteUser(request);
  if (!user) return unauthorized();

  await ensurePurchaseSchema();

  const rows = await sql`
    SELECT product_id, brand, unit_price, purchased_at, store_name
    FROM product_purchases
    WHERE user_id = ${user.userId} AND brand IS NOT NULL
    ORDER BY purchased_at DESC
    LIMIT 500
  `;

  const byProduct = new Map<string, BrandPurchase[]>();
  for (const raw of rows as Record<string, unknown>[]) {
    const id = String(raw.product_id);
    const list = byProduct.get(id) ?? [];
    list.push({
      brand: (raw.brand as string | null) ?? null,
      unitPrice: raw.unit_price == null ? null : Number(raw.unit_price),
      purchasedAt: new Date(raw.purchased_at as string).toISOString(),
      storeName: (raw.store_name as string | null) ?? null,
    });
    byProduct.set(id, list);
  }

  const out: Record<string, string[]> = {};
  for (const [id, purchases] of byProduct) out[id] = suggestBrands(purchases);

  return NextResponse.json(out);
}
