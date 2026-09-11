import { expect, test } from '@playwright/test';
import { ERROR_BOUNDARY_TEXT, freshDataDir, goto, launchApp, login, sqlGet } from './helpers';

/* Every screen opens, language/theme switching, product-image setting and persistence after restart. */

const ROUTES = [
  '#/dashboard',
  '#/sales',
  '#/sales/returns',
  '#/products',
  '#/products/categories',
  '#/products/brands',
  '#/products/units',
  '#/products/new',
  '#/inventory',
  '#/inventory/ledger',
  '#/purchases',
  '#/purchases/new',
  '#/suppliers',
  '#/customers',
  '#/reports',
  '#/reports/sales-summary',
  '#/shift',
  '#/shift/history',
  '#/counters',
  '#/expenses',
  '#/settings',
  '#/settings/appearance',
  '#/settings/data',
  '#/audit',
  '#/profile',
  '#/notifications',
];

test('an administrator can open every screen without errors', async () => {
  const { app, page, errors } = await launchApp();
  try {
    await login(page, 'rahim');
    for (const route of ROUTES) {
      await goto(page, route);
      await page.waitForTimeout(700);
      await expect(page.getByText(ERROR_BOUNDARY_TEXT), `error boundary on ${route}`).toHaveCount(0);
    }
    // Detail screens reached from their lists.
    for (const [list, detail] of [
      ['#/sales', /#\/sales\/[^/]+$/],
      ['#/customers', /#\/customers\/[^/]+$/],
      ['#/products', /#\/products\/[^/]+$/],
      ['#/suppliers', /#\/suppliers\/[^/]+$/],
      ['#/purchases', /#\/purchases\/[^/]+$/],
    ] as const) {
      await goto(page, list);
      await page.locator('tbody tr').first().click();
      await page.waitForURL(detail);
      await expect(page.getByText(ERROR_BOUNDARY_TEXT)).toHaveCount(0);
    }
    expect(errors).toEqual([]);
  } finally {
    await app.close();
  }
});

test('language, theme and product-image settings apply instantly and survive a restart', async () => {
  const dataDir = freshDataDir();
  let launched = await launchApp(dataDir);
  try {
    const { page } = launched;
    const html = page.locator('html');
    const productImages = page.locator('img[src*="products/"]');
    const productCards = page.getByRole('button', { name: /কার্টে যোগ করুন|to cart/ });
    await login(page, 'rahim');
    await goto(page, '#/pos');
    await expect(productCards.first()).toBeVisible();
    await expect(productImages.first()).toBeVisible();

    // Language: Bangla → English from the top bar.
    await page.getByRole('button', { name: /ভাষা পরিবর্তন|Switch language/ }).first().click();
    await expect(html).toHaveAttribute('lang', 'en');

    // Theme: dark → light.
    await expect(html).toHaveClass(/\bdark\b/);
    await page.getByRole('button', { name: /থিম পরিবর্তন|Switch theme/ }).first().click();
    await expect(html).not.toHaveClass(/\bdark\b/);

    // Settings → Product images off: the POS grid turns compact (no image space at all)…
    const imagesSwitch = page.getByRole('switch', { name: /Show product images/ });
    await goto(page, '#/settings/products');
    await imagesSwitch.click();
    await expect(imagesSwitch).toHaveAttribute('aria-checked', 'false');
    await goto(page, '#/pos');
    await expect(productCards.first()).toBeVisible();
    await expect(productImages).toHaveCount(0);

    // …and on again.
    await goto(page, '#/settings/products');
    await imagesSwitch.click();
    await expect(imagesSwitch).toHaveAttribute('aria-checked', 'true');

    // Closed straight after the last change: pending settings are written on the way out.
    const sales = await sqlGet<{ n: number }>(page, 'SELECT COUNT(*) AS n FROM sales');
    await launched.app.close();

    // Restart with the same data folder: data, English, light theme and images are all still there.
    launched = await launchApp(dataDir);
    await expect(launched.page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(launched.page.locator('html')).not.toHaveClass(/\bdark\b/);
    await login(launched.page, 'rahim');
    expect((await sqlGet<{ n: number }>(launched.page, 'SELECT COUNT(*) AS n FROM sales')).n).toBe(sales.n);
    await goto(launched.page, '#/pos');
    await expect(launched.page.locator('img[src*="products/"]').first()).toBeVisible();
  } finally {
    await launched.app.close();
  }
});
