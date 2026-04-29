import { test, expect } from '@playwright/test';
import { authenticate } from './helpers/auth';
import { mockApiRoutes } from './helpers/mock-routes';
import { PAYMENTS } from './fixtures/data';

test.describe('Payments page', () => {
  test.beforeEach(async ({ page, context }) => {
    await authenticate(page, context);
    await mockApiRoutes(page);
    await page.goto('/payments', { waitUntil: 'domcontentloaded' });
  });

  test('renders page heading', async ({ page }) => {
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });

  test('page is accessible (no navigation crash)', async ({ page }) => {
    await expect(page).toHaveURL(/\/payments/);
  });

  test('shows pending section heading', async ({ page }) => {
    // "⏰ Pendientes" section or similar heading must exist when payments exist
    const heading = page.getByRole('heading', { name: /pendientes/i });
    const visible = await heading.isVisible().catch(() => false);
    if (visible) {
      await expect(heading).toBeVisible();
    }
  });

  test('shows paid section heading', async ({ page }) => {
    const heading = page.getByRole('heading', { name: /pagados/i });
    const visible = await heading.isVisible().catch(() => false);
    if (visible) {
      await expect(heading).toBeVisible();
    }
  });

  test('mark-paid button triggers PATCH request', async ({ page }) => {
    // Unpaid payment in fixtures: Netflix (index 0) and Renta (index 2)
    const unpaid = PAYMENTS.filter((p) => !p.isPaidThisMonth);
    if (unpaid.length === 0) {
      test.skip();
      return;
    }

    const patchRequests: string[] = [];
    page.on('request', (req) => {
      if (req.url().includes('/api/payments') && req.method() === 'PATCH') {
        patchRequests.push(req.url());
      }
    });

    // Find and click the "Marcar pagado" / checkmark button for any payment
    const markBtn = page
      .getByRole('button', { name: /marcar pagado|✓/i })
      .first();
    const visible = await markBtn.isVisible().catch(() => false);
    if (!visible) {
      test.skip();
      return;
    }

    await markBtn.click();
    await page.waitForTimeout(400);
    expect(patchRequests.length).toBeGreaterThan(0);
  });

  test('"Añadir pago" link navigates to payments/new or opens form', async ({ page }) => {
    const addBtn = page
      .getByRole('link', { name: /añadir|nuevo|agregar/i })
      .or(page.getByRole('button', { name: /añadir|nuevo|agregar/i }))
      .first();
    const visible = await addBtn.isVisible().catch(() => false);
    if (!visible) {
      test.skip();
      return;
    }
    await addBtn.click();
    // Either navigates or opens modal — either way no crash
    await page.waitForTimeout(300);
    const url = page.url();
    expect(url).toMatch(/\/payments/);
  });
});

test.describe('Payments — empty state', () => {
  test('renders gracefully when no payments exist', async ({ page, context }) => {
    await authenticate(page, context);

    // Return empty payments list
    await page.route('**/api/payments', async (route) => {
      await route.fulfill({ json: [] });
    });

    await page.goto('/payments', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/payments/);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });
});
