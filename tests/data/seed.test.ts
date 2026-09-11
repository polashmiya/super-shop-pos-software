// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, extendTestData, type TestDatabase } from '../helpers/db';

/* Demo data must be large, realistic and internally consistent (reports add up). */

const NOW = new Date('2026-09-10T15:30:00+06:00');
let database: TestDatabase;

beforeAll(() => {
  database = createTestDatabase({ seed: 'demo', now: NOW });
});

describe('demo data generator', () => {
  it('creates the required volume of realistic data', () => {
    const count = (table: string) => database.one<{ count: number }>(`SELECT COUNT(*) AS count FROM ${table}`).count;
    expect(count('products')).toBeGreaterThanOrEqual(1000);
    expect(count('customers')).toBeGreaterThanOrEqual(500);
    expect(count('sales')).toBeGreaterThanOrEqual(1000);
    expect(count('suppliers')).toBeGreaterThanOrEqual(20);
    expect(count('brands')).toBeGreaterThanOrEqual(20);
    expect(count('categories')).toBeGreaterThanOrEqual(50);
    expect(count('counters')).toBe(4);
    expect(count('users')).toBe(5);
    expect(count('cash_sessions')).toBeGreaterThanOrEqual(30);
    expect(count('returns')).toBeGreaterThan(0);
    expect(count('purchases')).toBeGreaterThan(0);
    expect(count('expenses')).toBeGreaterThan(0);
  });

  it('gives every product a unique barcode, SKU and a bundled image path', () => {
    const products = database.query<{ sku: string; image: string | null }>('SELECT sku, image FROM products');
    expect(new Set(products.map((product) => product.sku)).size).toBe(products.length);
    for (const product of products) expect(product.image).toMatch(/^products\/[a-z-]+\/[a-z-]+-[1-6]\.svg$/);
    const barcodes = database.one<{ total: number; unique_count: number }>('SELECT COUNT(*) AS total, COUNT(DISTINCT barcode) AS unique_count FROM product_barcodes');
    expect(barcodes.total).toBe(barcodes.unique_count);
  });

  it('keeps the stock ledger consistent with stock balances', () => {
    const mismatches = database.query(
      `SELECT sb.product_id FROM stock_balances sb
        LEFT JOIN (SELECT product_id, ROUND(SUM(quantity), 3) AS total FROM stock_movements GROUP BY product_id) m ON m.product_id = sb.product_id
       WHERE ABS(ROUND(sb.quantity, 3) - COALESCE(m.total, 0)) > 0.001`,
    );
    expect(mismatches).toEqual([]);
    const negative = database.one<{ count: number }>('SELECT COUNT(*) AS count FROM stock_movements WHERE balance_after < -0.0005').count;
    expect(negative).toBe(0);
  });

  it('records payments that match each sale total', () => {
    const wrong = database.query(
      `SELECT s.invoice_no FROM sales s JOIN (SELECT sale_id, SUM(amount) AS applied FROM payments GROUP BY sale_id) p ON p.sale_id = s.id
        WHERE p.applied <> s.grand_total`,
    );
    expect(wrong).toEqual([]);
    const lineMismatch = database.query(
      `SELECT s.invoice_no FROM sales s JOIN (SELECT sale_id, SUM(line_total) AS total FROM sale_items GROUP BY sale_id) i ON i.sale_id = s.id
        WHERE i.total + s.rounding_adjustment <> s.grand_total`,
    );
    expect(lineMismatch).toEqual([]);
  });

  it('uses unique, well-formed invoice numbers', () => {
    const rows = database.query<{ invoice_no: string }>('SELECT invoice_no FROM sales');
    expect(new Set(rows.map((row) => row.invoice_no)).size).toBe(rows.length);
    for (const row of rows) expect(row.invoice_no).toMatch(/^INV-\d{8}-\d{4}$/);
  });

  it('closes shifts with expected cash equal to the cash ledger', () => {
    const shifts = database.query<{ id: string; closing_totals: string; actual_cash: number; difference: number }>(
      "SELECT id, closing_totals, actual_cash, difference FROM cash_sessions WHERE status = 'closed'",
    );
    expect(shifts.length).toBeGreaterThan(20);
    for (const shift of shifts) {
      const totals = JSON.parse(shift.closing_totals) as { expectedCash: number };
      const ledger = database.one<{ total: number }>("SELECT COALESCE(SUM(amount), 0) AS total FROM cash_movements WHERE shift_id = ? AND type <> 'closing'", [shift.id]).total;
      expect(ledger).toBe(totals.expectedCash);
      expect(shift.actual_cash - totals.expectedCash).toBe(shift.difference);
    }
  });

  it('leaves the terminal counter with an open shift and held sales today', () => {
    const open = database.query("SELECT id FROM cash_sessions WHERE status = 'open'");
    expect(open.length).toBeGreaterThanOrEqual(1);
    const held = database.one<{ count: number }>('SELECT COUNT(*) AS count FROM held_sales').count;
    expect(held).toBeGreaterThanOrEqual(1);
  });

  it('is deterministic for the same clock', () => {
    const again = createTestDatabase({ seed: 'demo', now: NOW });
    const first = database.one<{ total: number }>('SELECT SUM(grand_total) AS total FROM sales').total;
    const second = again.one<{ total: number }>('SELECT SUM(grand_total) AS total FROM sales').total;
    expect(second).toBe(first);
  });

  it('extends the history up to a later day ("Generate more demo data")', () => {
    const before = database.one<{ count: number }>('SELECT COUNT(*) AS count FROM sales').count;
    const later = new Date(NOW.getTime() + 2 * 86_400_000);
    const summary = extendTestData(database, later);
    const after = database.one<{ count: number }>('SELECT COUNT(*) AS count FROM sales').count;
    expect(summary.sales).toBeGreaterThan(0);
    expect(after).toBe(before + summary.sales);
    const mismatches = database.query(
      `SELECT sb.product_id FROM stock_balances sb
        LEFT JOIN (SELECT product_id, ROUND(SUM(quantity), 3) AS total FROM stock_movements GROUP BY product_id) m ON m.product_id = sb.product_id
       WHERE ABS(ROUND(sb.quantity, 3) - COALESCE(m.total, 0)) > 0.001`,
    );
    expect(mismatches).toEqual([]);
  });
});
