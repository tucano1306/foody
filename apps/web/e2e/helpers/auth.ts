/**
 * Auth helper for Playwright e2e tests.
 *
 * Calls the non-production test session endpoint to obtain a valid
 * iron-session cookie, then injects it into the browser context so
 * every subsequent page.goto() is authenticated.
 */
import type { BrowserContext, Page } from '@playwright/test';
import { expect } from '@playwright/test';

export async function authenticate(page: Page, context: BrowserContext): Promise<void> {
  // Hit the test-only session seeder; the response includes Set-Cookie
  const res = await page.request.post('/api/test/session');
  expect(res.status(), 'Test session endpoint must return 200 (not running in prod)').toBe(200);

  // Playwright automatically stores cookies returned by page.request — confirm
  const cookies = await context.cookies();
  const sessionCookie = cookies.find((c) => c.name === 'foody_session');
  expect(sessionCookie, 'foody_session cookie should be set after test-session call').toBeDefined();
}
