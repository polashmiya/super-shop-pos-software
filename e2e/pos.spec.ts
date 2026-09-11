import fs from 'node:fs';
import { expect, test } from '@playwright/test';
import { ensurePos, launchApp, login, scan, sqlGet, type LaunchedApp } from './helpers';

/* Cashier flow (spec §143): scan → quantity → pay → sale saved → stock & cash updated → receipt. */

let launched: LaunchedApp;

test.beforeAll(async () => {
  launched = await launchApp();
});

test.afterAll(async () => {
  await launched.app.close();
});

test('starts offline in Bangla with the dark theme and product images', async () => {
  const { page } = launched;
  await expect(page.locator('html')).toHaveAttribute('lang', 'bn');
  await expect(page.locator('html')).toHaveClass(/dark/);
  await login(page, 'karim');
  await expect(page.locator('input[data-pos-search="true"]')).toBeVisible();
  await expect(page.locator('img[src*="products/"]').first()).toBeVisible();
});

test('scanning adds a product, scanning again increases the quantity, and a cash sale is saved', async () => {
  const { page } = launched;
  await ensurePos(page);
  const product = await sqlGet<{ id: string; barcode: string; stock: number }>(
    page,
    "SELECT p.id, pb.barcode, b.quantity AS stock FROM products p JOIN product_barcodes pb ON pb.product_id = p.id AND pb.is_primary = 1 JOIN stock_balances b ON b.product_id = p.id WHERE p.status = 'active' AND p.weighted = 0 AND b.quantity >= 4 ORDER BY b.quantity DESC, p.sku LIMIT 1",
  );
  const salesBefore = await sqlGet<{ n: number }>(page, 'SELECT COUNT(*) AS n FROM sales');
  const shift = await sqlGet<{ id: string }>(page, "SELECT id FROM cash_sessions WHERE status = 'open' AND counter_id = (SELECT id FROM counters WHERE code = 'C03')");
  const cashBefore = await sqlGet<{ total: number }>(page, "SELECT COALESCE(SUM(amount), 0) AS total FROM cash_movements WHERE shift_id = ? AND type <> 'closing'", [shift.id]);

  await scan(page, product.barcode);
  await scan(page, product.barcode);
  await expect(page.locator('[data-line-id]')).toHaveCount(1);

  await page.keyboard.press('F9');
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Control+Enter');
  const invoiceText = page.getByText(/INV-\d{8}-\d{4}/).first();
  await expect(invoiceText).toBeVisible();
  const invoiceNo = /INV-\d{8}-\d{4}/.exec((await invoiceText.textContent()) ?? '')?.[0] ?? '';

  const sale = await sqlGet<{ id: string; grand_total: number; n: number }>(page, 'SELECT id, grand_total, (SELECT COUNT(*) FROM sales) AS n FROM sales WHERE invoice_no = ?', [invoiceNo]);
  expect(sale.n).toBe(salesBefore.n + 1);
  const item = await sqlGet<{ quantity: number }>(page, 'SELECT quantity FROM sale_items WHERE sale_id = ? AND product_id = ?', [sale.id, product.id]);
  expect(item.quantity).toBe(2);
  const stock = await sqlGet<{ quantity: number }>(page, 'SELECT quantity FROM stock_balances WHERE product_id = ?', [product.id]);
  expect(stock.quantity).toBeCloseTo(product.stock - 2, 3);
  const cashAfter = await sqlGet<{ total: number }>(page, "SELECT COALESCE(SUM(amount), 0) AS total FROM cash_movements WHERE shift_id = ? AND type <> 'closing'", [shift.id]);
  expect(cashAfter.total - cashBefore.total).toBe(sale.grand_total);

  // Receipt: P opens the print preview (on by default); Print sends the job.
  // In test mode print jobs become PDF files, so printing never blocks the sale.
  await page.keyboard.press('p');
  const preview = page.getByRole('dialog').filter({ has: page.getByRole('heading', { name: /প্রিন্ট প্রিভিউ|Print preview/ }) });
  await expect(preview.getByText(/INV-\d{8}-\d{4}/).first()).toBeVisible();
  await preview.getByRole('button', { name: /^(প্রিন্ট|Print)$/ }).click();
  await expect(preview).toHaveCount(0);
  await expect.poll(() => fs.readdirSync(launched.printDir).filter((file) => file.endsWith('.pdf')).length, { timeout: 20_000 }).toBeGreaterThan(0);

  await page.keyboard.press('Enter');
  await expect(page.locator('[data-line-id]')).toHaveCount(0);
});

test('a sale can be held and recalled', async () => {
  const { page } = launched;
  await ensurePos(page);
  const product = await sqlGet<{ barcode: string; name: string }>(
    page,
    "SELECT pb.barcode, p.name_en AS name FROM products p JOIN product_barcodes pb ON pb.product_id = p.id AND pb.is_primary = 1 JOIN stock_balances b ON b.product_id = p.id WHERE p.status = 'active' AND p.weighted = 0 AND b.quantity >= 3 ORDER BY b.quantity DESC, p.sku DESC LIMIT 1",
  );
  const heldBefore = await sqlGet<{ n: number }>(page, 'SELECT COUNT(*) AS n FROM held_sales');
  await scan(page, product.barcode);
  await expect(page.locator('[data-line-id]')).toHaveCount(1);

  await page.keyboard.press('F7');
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-line-id]')).toHaveCount(0);
  expect((await sqlGet<{ n: number }>(page, 'SELECT COUNT(*) AS n FROM held_sales')).n).toBe(heldBefore.n + 1);

  // The demo counter already has held sales: find ours with the drawer's search (it looks inside held items).
  await page.keyboard.press('F8');
  const drawer = page.getByRole('dialog');
  await expect(drawer).toBeVisible();
  const resume = drawer.getByRole('button', { name: /চালু করুন|Resume/ });
  await expect(resume.first()).toBeVisible();
  await page.keyboard.type(product.name);
  await expect(resume).toHaveCount(1);
  await resume.click();
  await expect(page.locator('[data-line-id]')).toHaveCount(1);
  expect((await sqlGet<{ n: number }>(page, 'SELECT COUNT(*) AS n FROM held_sales')).n).toBe(heldBefore.n);
});

test('the renderer never threw', async () => {
  expect(launched.errors).toEqual([]);
});
