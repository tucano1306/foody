/**
 * page.route() interceptors for client-side API calls.
 *
 * Server-rendered pages fetch data via direct SQL on the server — those
 * cannot be intercepted here. This helper mocks the *client-side* fetch
 * calls that React components make (mutations, toggle-cart, etc.) so tests
 * run without a real database on the mutation side.
 */
import type { Page } from '@playwright/test';
import { SHOPPING_LIST, PAYMENTS, TRIPS, PRODUCTS, toggledItem } from '../fixtures/data';

/** Intercept all known client-side API endpoints with fixture responses. */
export async function mockApiRoutes(page: Page): Promise<void> {
  // ── GET /api/shopping-list ─────────────────────────────────────────────────
  await page.route('**/api/shopping-list', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ json: SHOPPING_LIST });
    } else {
      await route.continue();
    }
  });

  // ── PATCH /api/shopping-list/:id/toggle-cart ───────────────────────────────
  await page.route('**/api/shopping-list/*/toggle-cart', async (route) => {
    const url = route.request().url();
    const id = url.split('/api/shopping-list/')[1]?.split('/toggle-cart')[0];
    const item = SHOPPING_LIST.find((i) => i.id === id);
    if (item) {
      await route.fulfill({ json: toggledItem(item) });
    } else {
      // Unknown id: return the first item toggled (graceful fallback)
      await route.fulfill({ json: toggledItem(SHOPPING_LIST[0]) });
    }
  });

  // ── Also intercept the proxy path used by SupermarketView ─────────────────
  await page.route('**/api/proxy/shopping-list/*/toggle-cart', async (route) => {
    const url = route.request().url();
    const id = url.split('/api/proxy/shopping-list/')[1]?.split('/toggle-cart')[0];
    const item = SHOPPING_LIST.find((i) => i.id === id);
    if (item) {
      await route.fulfill({ json: toggledItem(item) });
    } else {
      await route.fulfill({ json: toggledItem(SHOPPING_LIST[0]) });
    }
  });

  // ── POST /api/shopping-list/complete ──────────────────────────────────────
  await page.route('**/api/shopping-list/complete', async (route) => {
    await route.fulfill({
      json: { completed: 1, tripId: 'mock-trip-id', purchasesInserted: 1, purchaseError: null },
    });
  });

  // ── GET /api/payments ─────────────────────────────────────────────────────
  await page.route('**/api/payments', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ json: PAYMENTS });
    } else {
      await route.continue();
    }
  });

  // ── PATCH /api/payments/:id (mark paid / unpaid) ──────────────────────────
  await page.route('**/api/payments/*', async (route) => {
    if (route.request().method() === 'PATCH') {
      const url = route.request().url();
      const id = url.split('/api/payments/')[1];
      const payment = PAYMENTS.find((p) => p.id === id);
      if (payment) {
        await route.fulfill({ json: { ...payment, isPaidThisMonth: !payment.isPaidThisMonth } });
      } else {
        await route.fulfill({ json: PAYMENTS[0] });
      }
    } else {
      await route.continue();
    }
  });

  // ── GET /api/shopping-trips ───────────────────────────────────────────────
  await page.route('**/api/shopping-trips', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ json: TRIPS });
    } else {
      await route.continue();
    }
  });

  // ── GET /api/products ─────────────────────────────────────────────────────
  await page.route('**/api/products', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ json: PRODUCTS });
    } else {
      await route.continue();
    }
  });

  // ── POST /api/proxy/products (create) ─────────────────────────────────────
  await page.route('**/api/proxy/products', async (route) => {
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      await route.fulfill({
        status: 201,
        json: { ...PRODUCTS[0], id: 'prod-new-0000-0000-0000-000000000099', name: body.name ?? 'Nuevo' },
      });
    } else {
      await route.continue();
    }
  });

  // ── PATCH/DELETE /api/proxy/products/:id ──────────────────────────────────
  await page.route('**/api/proxy/products/*', async (route) => {
    const method = route.request().method();
    if (method === 'PATCH') {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      const url = route.request().url();
      const id = url.split('/api/proxy/products/')[1]?.split('/')[0];
      const existing = PRODUCTS.find((p) => p.id === id) ?? PRODUCTS[0];
      await route.fulfill({ json: { ...existing, ...body } });
    } else if (method === 'DELETE') {
      await route.fulfill({ status: 204, body: '' });
    } else {
      await route.continue();
    }
  });

  // ── POST /api/voice (voice assistant) ────────────────────────────────────
  await page.route('**/api/voice', async (route) => {
    await route.fulfill({
      json: { reply: 'Leche fue agregada a la lista.', action: 'added_to_list' },
    });
  });
}
