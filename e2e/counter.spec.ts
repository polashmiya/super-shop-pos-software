import { expect, test } from '@playwright/test';
import { goto, launchApp, login, scan, sqlGet, type LaunchedApp } from './helpers';

/* Scan-only counter layout: no product cards, scan → row, "3*code", name search, pay. */

let launched: LaunchedApp;

test.beforeAll(async () => {
  launched = await launchApp();
  await login(launched.page, 'rahim');
  // Settings → POS → Screen layout → Scan-only counter (saved for this terminal).
  await goto(launched.page, '#/settings/pos');
  const choice = launched.page.getByRole('button', { name: /শুধু স্ক্যান কাউন্টার|Scan-only counter/ });
  await choice.click();
  await expect(choice).toHaveAttribute('aria-pressed', 'true');
  await goto(launched.page, '#/pos');
  // Late in the day the demo shift may already be closed: open one from the gate.
  const openShift = launched.page.getByRole('button', { name: /^(শিফট খুলুন|Open shift)$/ });
  if (await openShift.isVisible().catch(() => false)) await openShift.click();
  await expect(launched.page.locator('input[data-pos-search="true"]')).toBeVisible();
});

test.afterAll(async () => {
  await launched.app.close();
});

test('shows no product cards, only the scan box and the item table', async () => {
  const { page } = launched;
  await expect(page.getByRole('button', { name: /কার্টে যোগ করুন|to cart$/ })).toHaveCount(0);
  await expect(page.getByRole('toolbar', { name: /ক্যাটাগরি|Categories/ })).toHaveCount(0);
  await expect(page.getByText(/স্ক্যান করতে প্রস্তুত|Ready to scan/)).toBeVisible();
});

test('scanning adds rows, "3*code" adds three, a typed name is added from the suggestions', async () => {
  const { page } = launched;
  const products = await page.evaluate(() =>
    window.electronAPI!.database.query(
      "SELECT p.id, pb.barcode, p.name_en AS name FROM products p JOIN product_barcodes pb ON pb.product_id = p.id AND pb.is_primary = 1 JOIN stock_balances b ON b.product_id = p.id WHERE p.status = 'active' AND p.weighted = 0 AND b.quantity >= 4 ORDER BY b.quantity DESC, p.sku LIMIT 2",
      [],
    ),
  ) as Array<{ id: string; barcode: string; name: string }>;
  expect(products).toHaveLength(2);
  const [first, second] = products;

  await scan(page, first.barcode);
  await expect(page.locator('[data-line-id]')).toHaveCount(1);
  await scan(page, `3*${second.barcode}`);
  await expect(page.locator('[data-line-id]')).toHaveCount(2);
  await expect(page.locator('[data-line-id]').nth(1).getByRole('button', { name: /^(পরিমাণ|Quantity)$/ })).toHaveText(/^(3|৩)$/);

  // Type a name: the suggestion list opens; Enter adds the highlighted product.
  const box = page.locator('input[data-pos-search="true"]');
  await box.click();
  await box.fill(first.name.split(' ')[0]);
  const listbox = page.getByRole('listbox');
  await expect(listbox).toBeVisible();
  await expect(listbox.getByRole('option').first()).toBeVisible();
  await box.press('Enter');
  await expect(listbox).toHaveCount(0);
  expect(await page.locator('[data-line-id]').count()).toBeGreaterThanOrEqual(2);
  await expect(box).toHaveValue('');
});

test('the sale is paid and saved from the counter layout', async () => {
  const { page } = launched;
  const before = await sqlGet<{ n: number }>(page, 'SELECT COUNT(*) AS n FROM sales');
  await page.keyboard.press('F9');
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Control+Enter');
  await expect(page.getByText(/INV-\d{8}-\d{4}/)).toBeVisible();
  expect((await sqlGet<{ n: number }>(page, 'SELECT COUNT(*) AS n FROM sales')).n).toBe(before.n + 1);
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-line-id]')).toHaveCount(0);
  await expect(page.locator('input[data-pos-search="true"]')).toBeFocused();
});

test('the layout survives a restart and the renderer never threw', async () => {
  expect(launched.errors).toEqual([]);
  const { dataDir } = launched;
  await launched.app.close();
  launched = await launchApp(dataDir);
  await login(launched.page, 'rahim');
  await goto(launched.page, '#/pos');
  await expect(launched.page.getByRole('button', { name: /কার্টে যোগ করুন|to cart$/ })).toHaveCount(0);
  await expect(launched.page.locator('input[data-pos-search="true"]')).toBeVisible();
});
