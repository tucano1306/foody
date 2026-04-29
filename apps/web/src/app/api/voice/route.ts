import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getRouteUser, unauthorized } from '@/lib/route-helpers';
import { randomUUID } from 'node:crypto';

interface VoiceRequest {
  transcript: string;
}

interface IntentResult {
  reply: string;
  action?: string;
  data?: unknown;
}

// ─── Intent matchers ──────────────────────────────────────────────────────────

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replaceAll(/[\u0300-\u036f]/gu, '');
}

const ADD_PATTERNS = [
  /agrega?\s+(.+?)\s+a\s+(?:la\s+)?lista/,
  /pon\s+(.+?)\s+en\s+(?:la\s+)?lista/,
  /necesito\s+(?:comprar\s+)?(.+)/,
  /comprar\s+(.+)/,
  /añade?\s+(.+?)\s+a\s+(?:la\s+)?lista/,
];

const STOCK_PATTERNS = [
  /(?:que|qué|cuales|cuáles)\s+productos?\s+(?:estan|están)\s+(?:por\s+)?(?:acabarse|agotarse|terminarse)/,
  /(?:que|qué)\s+(?:me|nos)\s+falta/,
  /(?:que|qué)\s+(?:hay\s+)?(?:en\s+)?(?:la\s+)?lista/,
  /(?:que|qué)\s+(?:productos?\s+)?(?:estan|están)\s+(?:bajos?|vacios?|vacíos?)/,
  /stock\s+(?:bajo|vacio|vacío)/,
];

const SPENDING_PATTERNS = [
  /(?:cuanto|cuánto)\s+(?:he\s+)?gast(?:ado|e)\s+(?:este\s+mes|este\s+año|esta\s+semana)?/,
  /gasto\s+(?:del\s+)?mes/,
  /(?:mis\s+)?estadisticas/,
  /resumen\s+de\s+(?:gasto|compras)/,
];

const HELP_PATTERNS = [
  /(?:que|qué)\s+(?:puedes|puedo)\s+(?:hacer|preguntar|decir)/,
  /ayuda/,
  /comandos/,
];

// ─── Intent handlers ──────────────────────────────────────────────────────────

async function handleAdd(userId: string, productName: string): Promise<IntentResult> {
  const rows = await sql`
    SELECT id, name FROM products
    WHERE user_id = ${userId}
      AND LOWER(name) ILIKE ${'%' + productName.toLowerCase() + '%'}
    ORDER BY name ASC
    LIMIT 1
  `;

  if (rows.length === 0) {
    return { reply: `No encontré un producto llamado "${productName}" en tu despensa. ¿Está registrado?` };
  }

  const product = rows[0] as { id: string; name: string };

  const householdRow = await sql`SELECT household_id FROM users WHERE id = ${userId} LIMIT 1`;
  const householdId = (householdRow[0] as { household_id: string | null })?.household_id ?? null;

  await sql`
    INSERT INTO shopping_list_items (id, product_id, user_id, household_id, note, created_at, updated_at)
    VALUES (${randomUUID()}, ${product.id}, ${userId}, ${householdId}, NULL, NOW(), NOW())
    ON CONFLICT DO NOTHING
  `;

  return {
    reply: `✅ Agregué "${product.name}" a tu lista de compras.`,
    action: 'added_to_list',
    data: { productId: product.id, productName: product.name },
  };
}

async function handleStockQuery(userId: string): Promise<IntentResult> {
  const rows = await sql`
    SELECT name, stock_level
    FROM products
    WHERE user_id = ${userId}
      AND stock_level IN ('empty', 'half')
    ORDER BY CASE stock_level WHEN 'empty' THEN 0 ELSE 1 END, name ASC
    LIMIT 8
  `;

  if (rows.length === 0) {
    return { reply: '🎉 ¡Todo bien! No tienes productos por acabarse.' };
  }

  const items = rows as { name: string; stock_level: string }[];
  const lines = items.map((r) => {
    const icon = r.stock_level === 'empty' ? '🚨' : '⚠️';
    return `${icon} ${r.name}`;
  });

  return {
    reply: `Tienes ${items.length} productos con stock bajo:\n${lines.join('\n')}`,
    action: 'stock_query',
    data: items,
  };
}

async function handleSpendingQuery(userId: string): Promise<IntentResult> {
  const rows = await sql`
    SELECT
      TO_CHAR(purchased_at, 'Month YYYY') AS month_label,
      SUM(total_amount) AS total,
      COUNT(*) AS trips
    FROM shopping_trips
    WHERE user_id = ${userId}
      AND purchased_at >= DATE_TRUNC('month', NOW())
    GROUP BY TO_CHAR(purchased_at, 'Month YYYY')
  `;

  if (rows.length === 0) {
    return { reply: 'No tienes compras registradas este mes todavía.' };
  }

  const row = rows[0] as { month_label: string; total: string; trips: string };
  const total = Number.parseFloat(row.total ?? '0');
  const trips = Number.parseInt(row.trips, 10);

  return {
    reply: `💰 Este mes llevas $${total.toFixed(2)} en ${trips} ${trips === 1 ? 'compra' : 'compras'}.`,
    action: 'spending_query',
    data: { total, trips },
  };
}

function handleHelp(): IntentResult {
  return {
    reply: `Puedo ayudarte con:\n• "Agrega leche a la lista"\n• "¿Qué productos están por acabarse?"\n• "¿Cuánto gasté este mes?"\n• "¿Qué hay en la lista?"`,
    action: 'help',
  };
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(request: NextRequest): Promise<NextResponse> {
  const user = await getRouteUser(request);
  if (!user) return unauthorized();

  const body = await request.json() as VoiceRequest;
  const transcript = (body.transcript ?? '').trim();

  if (!transcript) {
    return NextResponse.json({ reply: 'No entendí nada. Intenta de nuevo.' });
  }

  const norm = normalize(transcript);

  // ─── Help
  if (HELP_PATTERNS.some((p) => p.test(norm))) {
    return NextResponse.json(handleHelp());
  }

  // ─── Add to list
  for (const pattern of ADD_PATTERNS) {
    const match = pattern.exec(norm);
    if (match?.[1]) {
      const result = await handleAdd(user.userId, match[1].trim());
      return NextResponse.json(result);
    }
  }

  // ─── Stock query
  if (STOCK_PATTERNS.some((p) => p.test(norm))) {
    return NextResponse.json(await handleStockQuery(user.userId));
  }

  // ─── Spending query
  if (SPENDING_PATTERNS.some((p) => p.test(norm))) {
    return NextResponse.json(await handleSpendingQuery(user.userId));
  }

  return NextResponse.json({
    reply: `No entendí "${transcript}". Di "ayuda" para ver qué puedo hacer.`,
  });
}
