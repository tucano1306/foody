import { test, expect } from '@playwright/test';
import { authenticate } from './helpers/auth';
import { mockApiRoutes } from './helpers/mock-routes';

test.describe('Home page', () => {
  test.beforeEach(async ({ page, context }) => {
    await authenticate(page, context);
    await mockApiRoutes(page);
  });

  test('renders main navigation sections', async ({ page }) => {
    await page.goto('/home', { waitUntil: 'domcontentloaded' });

    // Navbar is present
    await expect(page.getByRole('navigation').first()).toBeVisible();
  });

  test('redirects unauthenticated users to /login', async ({ page, context }) => {
    // Clear session so we are unauthenticated
    await context.clearCookies();
    const res = await page.goto('/home', { waitUntil: 'domcontentloaded' });
    expect(res).not.toBeNull();
    await expect(page).toHaveURL(/\/login/);
  });

  test('page title contains Foody', async ({ page }) => {
    await page.goto('/home', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveTitle(/foody/i);
  });

  test('links to supermarket page', async ({ page }) => {
    await page.goto('/home', { waitUntil: 'domcontentloaded' });
    // Find any link to /supermarket (may be in nav or quick-action card)
    const link = page.getByRole('link', { name: /supermercado/i }).first();
    await expect(link).toBeVisible();
    await link.click();
    await expect(page).toHaveURL(/\/supermarket/);
  });

  test('links to payments page', async ({ page }) => {
    await page.goto('/home', { waitUntil: 'domcontentloaded' });
    const link = page.getByRole('link', { name: /pagos/i }).first();
    await expect(link).toBeVisible();
    await link.click();
    await expect(page).toHaveURL(/\/payments/);
  });
});
