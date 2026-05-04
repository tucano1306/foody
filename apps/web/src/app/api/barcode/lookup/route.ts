import { NextRequest, NextResponse } from 'next/server';
import { getRouteUser, unauthorized } from '@/lib/route-helpers';

interface OFFProduct {
  product_name?: string;
  product_name_es?: string;
  product_name_en?: string;
  generic_name?: string;
  categories_tags?: string[];
  image_front_thumb_url?: string;
  image_front_small_url?: string;
}

interface OFFResponse {
  status: 0 | 1;
  product?: OFFProduct;
}

// Open Food Facts category tag → our Spanish category
const CATEGORY_MAP: ReadonlyArray<readonly [string, string]> = [
  ['beverages', 'Bebidas'],
  ['drinks', 'Bebidas'],
  ['waters', 'Bebidas'],
  ['juices', 'Bebidas'],
  ['sodas', 'Bebidas'],
  ['dairy', 'Lácteos'],
  ['dairies', 'Lácteos'],
  ['milks', 'Lácteos'],
  ['yogurts', 'Lácteos'],
  ['cheeses', 'Lácteos'],
  ['meats', 'Carnicería'],
  ['beef', 'Carnicería'],
  ['poultry', 'Carnicería'],
  ['sausages', 'Carnicería'],
  ['fish', 'Pescadería'],
  ['seafood', 'Pescadería'],
  ['breads', 'Panadería y Tortillería'],
  ['tortillas', 'Panadería y Tortillería'],
  ['pastries', 'Panadería y Tortillería'],
  ['cereals', 'Cereales y Desayunos'],
  ['breakfast', 'Cereales y Desayunos'],
  ['oatmeals', 'Cereales y Desayunos'],
  ['frozen', 'Congelados'],
  ['canned', 'Enlatados'],
  ['preserves', 'Enlatados'],
  ['legumes', 'Granos y Legumbres'],
  ['beans', 'Granos y Legumbres'],
  ['grains', 'Granos y Legumbres'],
  ['rice', 'Granos y Legumbres'],
  ['lentils', 'Granos y Legumbres'],
  ['snacks', 'Snacks y Dulces'],
  ['chocolates', 'Snacks y Dulces'],
  ['candies', 'Snacks y Dulces'],
  ['chips', 'Snacks y Dulces'],
  ['cookies', 'Snacks y Dulces'],
  ['condiments', 'Condimentos y Salsas'],
  ['sauces', 'Condimentos y Salsas'],
  ['dressings', 'Condimentos y Salsas'],
  ['cleaning', 'Limpieza'],
  ['detergents', 'Limpieza'],
  ['hygiene', 'Higiene y Cuidado'],
  ['personal-care', 'Higiene y Cuidado'],
  ['cosmetics', 'Higiene y Cuidado'],
  ['pet', 'Mascotas'],
  ['fruits', 'Frutas y Verduras'],
  ['vegetables', 'Frutas y Verduras'],
  ['salads', 'Frutas y Verduras'],
] as const;

function resolveCategory(tags: string[]): string {
  for (const tag of tags) {
    const key = tag.replace(/^[a-z]{2}:/, '').toLowerCase();
    for (const [pattern, category] of CATEGORY_MAP) {
      if (key.includes(pattern)) return category;
    }
  }
  return '';
}

function resolveProductName(product: OFFProduct): string {
  return (
    product.product_name_es?.trim() ||
    product.product_name?.trim() ||
    product.product_name_en?.trim() ||
    product.generic_name?.trim() ||
    ''
  );
}

async function fetchImageAsDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) return null;
    const contentType = res.headers.get('content-type') ?? 'image/jpeg';
    if (!contentType.startsWith('image/')) return null;
    const buffer = await res.arrayBuffer();
    // Skip images larger than 200 KB to keep the API response lean
    if (buffer.byteLength > 200_000) return null;
    const base64 = Buffer.from(buffer).toString('base64');
    return `data:${contentType};base64,${base64}`;
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const user = await getRouteUser(request);
  if (!user) return unauthorized();

  const code = request.nextUrl.searchParams.get('code')?.trim();
  if (!code || !/^\d{6,14}$/.test(code)) {
    return NextResponse.json({ found: false, error: 'invalid_code' }, { status: 400 });
  }

  try {
    const offRes = await fetch(
      `https://world.openfoodfacts.org/api/v0/product/${encodeURIComponent(code)}.json`,
      {
        headers: { 'User-Agent': 'Foody/1.0 (contact@foody-app.com)' },
        next: { revalidate: 86_400 }, // cache product data for 24 h
        signal: AbortSignal.timeout(8_000),
      },
    );

    if (!offRes.ok) return NextResponse.json({ found: false });

    const data = (await offRes.json()) as OFFResponse;
    if (data.status !== 1 || !data.product) return NextResponse.json({ found: false });

    const { product } = data;
    const name = resolveProductName(product);
    const category = resolveCategory(product.categories_tags ?? []);

    // Prefer thumbnail for speed (100 px); fall back to small (200 px)
    const imageUrl = product.image_front_thumb_url ?? product.image_front_small_url;
    const photoUrl = imageUrl ? await fetchImageAsDataUrl(imageUrl) : null;

    return NextResponse.json({ found: true, name, category, photoUrl });
  } catch {
    return NextResponse.json({ found: false, error: 'lookup_failed' });
  }
}
