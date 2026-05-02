import { expect, test } from '@playwright/test';

const PROTECTED = ['/home', '/products', '/payments', '/supermarket'];

test.describe('Security · Auth middleware', () => {
  for (const path of PROTECTED) {
    test(`${path} redirects to /login when unauthenticated`, async ({ page }) => {
      const res = await page.goto(path, { waitUntil: 'domcontentloaded' });
      expect(res, `expected response for ${path}`).not.toBeNull();
      await expect(page).toHaveURL(/\/login(\?|$)/);
      const url = new URL(page.url());
      expect(url.searchParams.get('callbackUrl')).toBe(path);
    });
  }

  test('landing page is public', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });
});

test.describe('Security · Session cookie', () => {
  test('no session cookie is set on landing', async ({ page, context }) => {
    await page.goto('/');
    const cookies = await context.cookies();
    const session = cookies.find((c) => c.name === 'foody_session');
    expect(session, 'session cookie should not exist before login').toBeUndefined();
  });

  test('requesting a login code does not grant access before verification', async ({ page, context }) => {
    await page.goto('/login');
    await page.getByPlaceholder('tu@email.com').fill('tester@example.com');
    await page.getByRole('button', { name: /continuar/i }).click();

    await expect(page).toHaveURL(/\/login\/verify/);

    const cookies = await context.cookies();
    const session = cookies.find((c) => c.name === 'foody_session');
    expect(session, 'pending login should still use the session cookie').toBeDefined();

    await page.goto('/home', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/login/);
  });

  test('login endpoint requires POST (GET must not create session)', async ({ request }) => {
    const res = await request.get('/api/auth/login');
    // GET should be 404 / 405 — never 200 with a cookie
    expect([404, 405]).toContain(res.status());
    const setCookie = res.headers()['set-cookie'];
    expect(setCookie ?? '').not.toContain('foody_session');
  });

  test('fake session cookie cannot grant access to /home', async ({ page, context }) => {
    await context.addCookies([
      {
        name: 'foody_session',
        value: 'this-is-not-a-valid-iron-session-token',
        domain: 'localhost',
        path: '/',
        httpOnly: true,
        secure: false,
        sameSite: 'Lax',
      },
    ]);
    await page.goto('/home', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe('Security · Proxy / API boundary', () => {
  test('proxy rejects unauthenticated requests to API endpoints', async ({ request }) => {
    const res = await request.get('/api/proxy/products');
    expect([401, 403, 404]).toContain(res.status());
  });

  test('proxy does not leak backend URL in response headers', async ({ request }) => {
    const res = await request.get('/api/proxy/products');
    const headers = res.headers();
    expect(headers['x-powered-by']).toBeUndefined();
    // Should not echo internal service URLs
    const body = (await res.text()).toLowerCase();
    expect(body).not.toContain('localhost:3001');
    expect(body).not.toContain('http://api:');
  });
});

test.describe('Security · XSS / input handling', () => {
  test('login form escapes reflected callbackUrl param', async ({ page }) => {
    const payload = '"><script>window.__pwned=1</script>';
    await page.goto(`/login?callbackUrl=${encodeURIComponent(payload)}`);
    const pwned = await page.evaluate(() => (globalThis as unknown as { __pwned?: number }).__pwned);
    expect(pwned).toBeUndefined();
  });

  test('javascript: URLs are not rendered as clickable links', async ({ page }) => {
    const payload = 'javascript:alert(1)';
    await page.goto(`/login?callbackUrl=${encodeURIComponent(payload)}`);
    const anchors = await page.$$eval('a[href]', (els) =>
      els.map((e) => (e as HTMLAnchorElement).href),
    );
    for (const href of anchors) {
      expect(href.toLowerCase()).not.toMatch(/^javascript:/);
    }
  });
});

test.describe('Security · HTTP response hygiene', () => {
  test('landing does not expose X-Powered-By', async ({ request }) => {
    const res = await request.get('/');
    expect(res.headers()['x-powered-by']).toBeUndefined();
  });

  test('landing HTML does not inline session secrets', async ({ request }) => {
    const res = await request.get('/');
    const html = await res.text();
    expect(html).not.toMatch(/IRON_SESSION_PASSWORD/);
    expect(html).not.toMatch(/JWT_SECRET/);
    expect(html).not.toMatch(/DATABASE_URL/);
  });
});
