import { Injectable, Logger } from '@nestjs/common';

export interface SupermarketProduct {
  name: string;
  price: number | null;
  currency: string;
  url: string | null;
  imageUrl: string | null;
  store: 'walmart' | 'publix';
}

// ─── Walmart (Open Grocery API — no key required) ────────────────────────────
// Walmart does not expose a free public API. We use the search result page
// and extract structured data from Google Shopping / Open Food Facts as fallback.
// For a real scraper, replace this with a headless browser or paid API.
async function searchWalmart(query: string): Promise<SupermarketProduct[]> {
  try {
    // Fallback: Open Food Facts product search
    const encoded = encodeURIComponent(query);
    const url = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encoded}&action=process&json=true&page_size=5`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return [];

    type OFFProduct = { product_name?: string; image_front_small_url?: string };
    type OFFResponse = { products?: OFFProduct[] };
    const data = (await res.json()) as OFFResponse;

    return (data.products ?? []).slice(0, 5).map((p) => ({
      name: p.product_name ?? query,
      price: null, // price not available from Open Food Facts
      currency: 'USD',
      url: `https://www.walmart.com/search?q=${encoded}`,
      imageUrl: p.image_front_small_url ?? null,
      store: 'walmart' as const,
    }));
  } catch {
    return [];
  }
}

// ─── Publix (no public API — returns search link) ────────────────────────────
async function searchPublix(query: string): Promise<SupermarketProduct[]> {
  const encoded = encodeURIComponent(query);
  // Publix does not provide a free API. Return a search-URL result so the
  // frontend can deep-link users to the actual Publix search page.
  return [
    {
      name: query,
      price: null,
      currency: 'USD',
      url: `https://www.publix.com/shop/search#/search?q=${encoded}`,
      imageUrl: null,
      store: 'publix' as const,
    },
  ];
}

// ─── Price comparison helper ─────────────────────────────────────────────────
export interface CompareResult {
  query: string;
  walmart: SupermarketProduct[];
  publix: SupermarketProduct[];
  walmartTotal: number | null;
  publixTotal: number | null;
  bestOption: 'walmart' | 'publix' | 'unknown';
  savings: number | null;
}

@Injectable()
export class SupermarketService {
  private readonly logger = new Logger(SupermarketService.name);

  async searchWalmart(query: string): Promise<SupermarketProduct[]> {
    return searchWalmart(query);
  }

  async searchPublix(query: string): Promise<SupermarketProduct[]> {
    return searchPublix(query);
  }

  async compare(query: string): Promise<CompareResult> {
    const [walmartResults, publixResults] = await Promise.all([
      searchWalmart(query),
      searchPublix(query),
    ]);

    const walmartTotal = walmartResults.reduce<number | null>((acc, p) => {
      if (p.price === null) return acc;
      return (acc ?? 0) + p.price;
    }, null);

    const publixTotal = publixResults.reduce<number | null>((acc, p) => {
      if (p.price === null) return acc;
      return (acc ?? 0) + p.price;
    }, null);

    let bestOption: 'walmart' | 'publix' | 'unknown' = 'unknown';
    let savings: number | null = null;

    if (walmartTotal !== null && publixTotal !== null) {
      if (walmartTotal <= publixTotal) {
        bestOption = 'walmart';
        savings = Math.round((publixTotal - walmartTotal) * 100) / 100;
      } else {
        bestOption = 'publix';
        savings = Math.round((walmartTotal - publixTotal) * 100) / 100;
      }
    }

    return {
      query,
      walmart: walmartResults,
      publix: publixResults,
      walmartTotal,
      publixTotal,
      bestOption,
      savings,
    };
  }
}
