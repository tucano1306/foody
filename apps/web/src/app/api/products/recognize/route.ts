import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { sql } from '@/lib/db';
import { getRouteUser, unauthorized, badRequest } from '@/lib/route-helpers';

// Vision call can take a few seconds; give the function room on Vercel.
export const maxDuration = 60;

/** Max photo payload we accept (base64), ~4MB binary. */
const MAX_IMAGE_BASE64_CHARS = 6_000_000;

const ALLOWED_MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
type AllowedMediaType = (typeof ALLOWED_MEDIA_TYPES)[number];

interface RecognizeMatch {
  readonly id: string;
  readonly confidence: 'alta' | 'media' | 'baja';
}

/** Shape enforced via structured outputs (output_config.format). */
const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    detected: {
      type: 'string',
      description:
        'Descripción muy corta en español del producto principal visible en la foto (marca y tipo si se distinguen).',
    },
    matches: {
      type: 'array',
      description:
        'Productos de la despensa que corresponden al producto de la foto, del más probable al menos probable. Vacío si ninguno corresponde.',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'El id exacto del producto de la lista.' },
          confidence: { type: 'string', enum: ['alta', 'media', 'baja'] },
        },
        required: ['id', 'confidence'],
        additionalProperties: false,
      },
    },
  },
  required: ['detected', 'matches'],
  additionalProperties: false,
} as const;

const SYSTEM_PROMPT =
  'Eres el buscador visual de una app de despensa doméstica. El usuario fotografía un producto ' +
  '(empaque, botella, fruta, etc.) y tu tarea es identificar cuál o cuáles productos de SU despensa ' +
  'aparecen en la foto. Compara lo que ves (tipo de producto, marca, etiqueta, forma, color) contra ' +
  'la lista de productos del usuario. Devuelve solo productos que realmente correspondan; si ninguno ' +
  'corresponde, devuelve matches vacío. Nunca inventes ids.';

// POST /api/products/recognize — photo of a product → matching pantry products
export async function POST(request: NextRequest) {
  const user = await getRouteUser(request);
  if (!user) return unauthorized();

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    // Client falls back to on-device OCR when AI recognition is not configured.
    return NextResponse.json({ code: 'ai_unavailable' }, { status: 501 });
  }

  let body: { image?: unknown; mediaType?: unknown };
  try {
    body = (await request.json()) as { image?: unknown; mediaType?: unknown };
  } catch {
    return badRequest('Invalid JSON body');
  }

  const image = typeof body.image === 'string' ? body.image : '';
  if (!image || image.length > MAX_IMAGE_BASE64_CHARS) {
    return badRequest('image (base64) is required and must be under the size limit');
  }
  const mediaType: AllowedMediaType = ALLOWED_MEDIA_TYPES.includes(body.mediaType as AllowedMediaType)
    ? (body.mediaType as AllowedMediaType)
    : 'image/jpeg';

  const products = (await sql`
    SELECT id, name, category FROM products WHERE user_id = ${user.userId} ORDER BY name ASC
  `) as { id: string; name: string; category: string | null }[];

  if (products.length === 0) {
    return NextResponse.json({ detected: null, matches: [] });
  }

  const catalog = products
    .map((p) => `- id: ${p.id} | nombre: ${p.name}${p.category ? ` | categoría: ${p.category}` : ''}`)
    .join('\n');

  const client = new Anthropic({ apiKey });

  try {
    const response = await client.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      output_config: {
        effort: 'low',
        format: { type: 'json_schema', schema: RESPONSE_SCHEMA },
      },
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: image } },
            {
              type: 'text',
              text: `Productos de mi despensa:\n${catalog}\n\n¿Cuál o cuáles de estos productos aparecen en la foto?`,
            },
          ],
        },
      ],
    });

    if (response.stop_reason === 'refusal') {
      return NextResponse.json({ code: 'ai_refused' }, { status: 502 });
    }

    const textBlock = response.content.find((b) => b.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      return NextResponse.json({ code: 'ai_empty' }, { status: 502 });
    }

    const parsed = JSON.parse(textBlock.text) as { detected?: unknown; matches?: unknown };
    const validIds = new Set(products.map((p) => p.id));
    const rawMatches = Array.isArray(parsed.matches) ? (parsed.matches as RecognizeMatch[]) : [];
    const matches = rawMatches
      .filter((m) => m && typeof m.id === 'string' && validIds.has(m.id))
      .slice(0, 5)
      .map((m) => ({
        id: m.id,
        confidence: (['alta', 'media', 'baja'] as const).includes(m.confidence) ? m.confidence : 'baja',
      }));

    return NextResponse.json({
      detected: typeof parsed.detected === 'string' ? parsed.detected : null,
      matches,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'AI request failed';
    return NextResponse.json({ code: 'ai_error', message }, { status: 502 });
  }
}
