// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest';
import { resolvePeriod } from '@/domain/dates';
import { LocalReportRepository } from '@/repositories/local/reportRepository';
import type { ReportQueryName, ReportRow } from '@/repositories/types';
import type { ReportFilter } from '@/types';
import { createTestDatabase, type TestDatabase } from '../helpers/db';

/* ==========================================================================
   Every named report query runs through the real SqlBridge/guard against
   the seeded demo database, and the figures reconcile with each other.
   ========================================================================== */

const NOW = new Date('2026-09-10T15:30:00+06:00');

/** Compile-time complete list of query names (TypeScript fails when one is missing). */
const QUERY_NAMES: Record<ReportQueryName, true> = {
  salesByDay: true,
  salesByHour: true,
  salesByMonth: true,
  paymentMethods: true,
  productSales: true,
  categorySales: true,
  brandSales: true,
  cashierSales: true,
  counterSales: true,
  discounts: true,
  vatByRate: true,
  returns: true,
  returnItems: true,
  inventoryByCategory: true,
  stockMovementSummary: true,
  stockMovements: true,
  lowStock: true,
  outOfStock: true,
  stockValuation: true,
  purchases: true,
  supplierPurchases: true,
  customerPurchases: true,
  profitByCategory: true,
  cashMovements: true,
  shifts: true,
  expenses: true,
  expensesByCategory: true,
  slowMoving: true,
  salesReconciliation: true,
  cancelledSales: true,
  paymentDetails: true,
  returnsByDay: true,
  returnsByMonth: true,
  returnsImpact: true,
  returnProducts: true,
  profitByDay: true,
  stockMovementByType: true,
  cashMovementSummary: true,
  customerTypeSales: true,
  customerActivity: true,
  returnsByHour: true,
  returnMethods: true,
  stockMovementByDay: true,
  brandSalesDetail: true,
  expenseBreakdown: true,
  purchaseStatusSummary: true,
};

let database: TestDatabase;
let reports: LocalReportRepository;
let filter: ReportFilter;

const num = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) ? value : 0);
const sum = (rows: ReportRow[], key: string): number => rows.reduce((total, row) => total + num(row[key]), 0);
const one = async (name: ReportQueryName, extra?: Record<string, string | number>, override: Partial<ReportFilter> = {}): Promise<ReportRow> => {
  const rows = await reports.query(name, { ...filter, ...override }, extra);
  expect(rows).toHaveLength(1);
  return rows[0];
};

beforeAll(() => {
  database = createTestDatabase({ seed: 'demo', now: NOW });
  reports = new LocalReportRepository(database.sql);
  const range = resolvePeriod('last_30_days', NOW);
  filter = {
    period: 'last_30_days',
    from: range.from,
    to: range.to,
    branchId: 'all',
    counterId: 'all',
    cashierId: 'all',
    categoryId: 'all',
    brandId: 'all',
    paymentMethod: 'all',
    customerId: 'all',
    supplierId: 'all',
  };
});

describe('report queries (30-day period, seeded demo data)', () => {
  it('runs every query name without error', async () => {
    for (const name of Object.keys(QUERY_NAMES) as ReportQueryName[]) {
      const rows = await reports.query(name, filter, { limit: 50 });
      expect(Array.isArray(rows), name).toBe(true);
    }
  });

  it('runs every query with every filter applied (SQL guard + parameters)', async () => {
    const pick = (sql: string) => database.one<{ id: string }>(sql).id;
    const narrowed: ReportFilter = {
      ...filter,
      counterId: pick('SELECT id FROM counters ORDER BY code LIMIT 1'),
      cashierId: pick("SELECT cashier_id AS id FROM sales GROUP BY cashier_id ORDER BY COUNT(*) DESC LIMIT 1"),
      categoryId: pick('SELECT category_id AS id FROM products GROUP BY category_id ORDER BY COUNT(*) DESC LIMIT 1'),
      brandId: pick('SELECT brand_id AS id FROM products WHERE brand_id IS NOT NULL GROUP BY brand_id ORDER BY COUNT(*) DESC LIMIT 1'),
      supplierId: pick('SELECT supplier_id AS id FROM purchases GROUP BY supplier_id ORDER BY COUNT(*) DESC LIMIT 1'),
      paymentMethod: 'cash',
    };
    for (const name of Object.keys(QUERY_NAMES) as ReportQueryName[]) {
      const rows = await reports.query(name, narrowed, { limit: 20, type: name.startsWith('cash') ? 'sale' : 'sale', customerType: 'regular' });
      expect(Array.isArray(rows), name).toBe(true);
    }
  });

  it('reconciles the sales statement: gross − discounts + VAT + rounding = invoiced', async () => {
    const row = await one('salesReconciliation');
    expect(num(row.orders)).toBeGreaterThan(500);
    expect(num(row.subtotal) - num(row.discount) + num(row.tax_added) + num(row.rounding)).toBe(num(row.grand_total));
    expect(num(row.item_discount) + num(row.order_discount)).toBe(num(row.discount));
    const totals = await reports.salesTotals({ from: filter.from, to: filter.to });
    expect(num(totals.gross)).toBe(num(row.grand_total));
    expect(num(totals.orders)).toBe(num(row.orders));
    expect(num(totals.tax)).toBe(num(row.tax));
    const byDay = await reports.query('salesByDay', filter);
    expect(sum(byDay, 'sales')).toBe(num(row.grand_total));
    expect(sum(byDay, 'orders')).toBe(num(row.orders));
    const byHour = await reports.query('salesByHour', filter);
    expect(sum(byHour, 'sales')).toBe(num(row.grand_total));
  });

  it('reconciles payments: tendered − change = received = invoiced sales', async () => {
    const statement = await one('salesReconciliation');
    const payments = await reports.query('paymentDetails', filter);
    expect(payments.length).toBeGreaterThan(2);
    expect(sum(payments, 'amount')).toBe(num(statement.grand_total));
    expect(sum(payments, 'tendered') - sum(payments, 'change_amount')).toBe(sum(payments, 'amount'));
    expect(sum(payments, 'tendered')).toBe(num(statement.tendered));
    expect(sum(payments, 'change_amount')).toBe(num(statement.change_due));
    const legacy = await reports.query('paymentMethods', filter);
    expect(sum(legacy, 'amount')).toBe(sum(payments, 'amount'));
    const cashOnly = await reports.query('paymentDetails', { ...filter, paymentMethod: 'cash' });
    expect(cashOnly.every((row) => row.method === 'cash')).toBe(true);
  });

  it('reconciles item-level reports with invoiced sales and VAT', async () => {
    const statement = await one('salesReconciliation');
    const lineTotal = num(statement.grand_total) - num(statement.rounding);
    expect(sum(await reports.query('categorySales', filter), 'amount')).toBe(lineTotal);
    expect(sum(await reports.query('productSales', filter, { limit: 5000 }), 'amount')).toBe(lineTotal);
    const vat = await reports.query('vatByRate', filter);
    expect(sum(vat, 'tax')).toBe(num(statement.tax));
    expect(sum(vat, 'gross')).toBe(lineTotal);
    expect(sum(vat, 'taxable') + sum(vat, 'tax')).toBe(sum(vat, 'gross'));
  });

  it('reconciles profit by day with profit by category', async () => {
    const byDay = await reports.query('profitByDay', filter);
    const byCategory = await reports.query('profitByCategory', filter);
    expect(byDay.length).toBeGreaterThan(20);
    expect(sum(byDay, 'revenue')).toBe(sum(byCategory, 'revenue'));
    expect(Math.abs(sum(byDay, 'cost') - sum(byCategory, 'cost'))).toBeLessThanOrEqual(byDay.length);
    expect(sum(byDay, 'revenue')).toBeGreaterThan(sum(byDay, 'cost'));
  });

  it('reconciles returns (headers, items, by day and by month)', async () => {
    const returns = await reports.query('returns', filter);
    const impact = await one('returnsImpact');
    expect(num(impact.count)).toBe(returns.length);
    expect(num(impact.refund)).toBe(sum(returns, 'refund_total'));
    expect(num(impact.tax)).toBe(sum(returns, 'tax_total'));
    expect(num(impact.cost)).toBeGreaterThanOrEqual(0);
    expect(sum(await reports.query('returnsByDay', filter), 'amount')).toBe(sum(returns, 'refund_total'));
    expect(sum(await reports.query('returnsByMonth', filter), 'amount')).toBe(sum(returns, 'refund_total'));
    const products = await reports.query('returnProducts', filter, { limit: 1000 });
    expect(sum(products, 'amount')).toBe(sum(returns, 'refund_total'));
    const totals = await reports.salesTotals({ from: filter.from, to: filter.to });
    expect(num(totals.returns)).toBe(sum(returns, 'refund_total'));
  });

  it('splits sales by customer type and ranks customers consistently', async () => {
    const statement = await one('salesReconciliation');
    const types = await reports.query('customerTypeSales', filter);
    expect(sum(types, 'amount')).toBe(num(statement.grand_total));
    expect(sum(types, 'orders')).toBe(num(statement.orders));
    const members = types.filter((row) => row.type !== 'none');
    const customers = await reports.query('customerActivity', filter, { limit: 5000 });
    expect(sum(customers, 'amount')).toBe(sum(members, 'amount'));
    expect(sum(customers, 'orders')).toBe(num(statement.member_orders));
    const vip = await reports.query('customerActivity', filter, { limit: 5000, customerType: 'vip' });
    expect(vip.every((row) => row.type === 'vip')).toBe(true);
    const legacy = await reports.query('customerPurchases', filter, { limit: 5000 });
    expect(sum(legacy, 'amount')).toBe(sum(customers, 'amount'));
  });

  it('summarises stock movements and cash movements like their ledgers', async () => {
    const byType = await reports.query('stockMovementByType', filter);
    const legacy = await reports.query('stockMovementSummary', filter);
    expect(sum(byType, 'count')).toBe(sum(legacy, 'count'));
    expect(sum(byType, 'qty_in') - sum(byType, 'qty_out')).toBeCloseTo(sum(byType, 'net'), 3);
    const movements = await reports.query('stockMovements', filter);
    if (movements.length < 5000) expect(movements.length).toBe(sum(byType, 'count'));
    const sales = await reports.query('stockMovementByType', filter, { type: 'sale' });
    expect(sales.every((row) => row.type === 'sale')).toBe(true);

    const cash = await reports.query('cashMovementSummary', filter);
    const cashRows = await reports.query('cashMovements', filter);
    expect(cashRows.length).toBeLessThan(5000);
    expect(sum(cash, 'amount')).toBe(sum(cashRows, 'amount'));
    expect(sum(cash, 'count')).toBe(cashRows.length);
    // The drawer records the cash of every sale when it happens; a later cancellation adds a
    // 'refund' movement instead of deleting it, so cancelled sales' cash is still in 'sale'.
    const cashPaid = database.one<{ total: number }>(
      "SELECT COALESCE(SUM(p.amount), 0) AS total FROM payments p JOIN sales s ON s.id = p.sale_id WHERE p.method = 'cash' AND s.created_at >= ? AND s.created_at < ?",
      [filter.from, filter.to],
    ).total;
    const cashSales = cash.find((row) => row.type === 'sale');
    expect(num(cashSales?.amount)).toBe(cashPaid);
    const payments = await reports.query('paymentDetails', { ...filter, paymentMethod: 'cash' });
    expect(sum(payments, 'amount')).toBeLessThanOrEqual(cashPaid);
  });

  it('adds up the Reports-module breakdowns (brands, refunds, ledger by day, expenses, purchases)', async () => {
    const statement = await one('salesReconciliation');
    const lineTotal = num(statement.grand_total) - num(statement.rounding);
    const brands = await reports.query('brandSalesDetail', filter);
    expect(sum(brands, 'amount')).toBe(lineTotal);
    expect(sum(brands, 'tax')).toBe(num(statement.tax));

    const returns = await reports.query('returns', filter);
    expect(sum(await reports.query('returnMethods', filter), 'amount')).toBe(sum(returns, 'refund_total'));
    expect(sum(await reports.query('returnsByHour', filter), 'count')).toBe(returns.length);

    const byType = await reports.query('stockMovementByType', filter);
    const byDay = await reports.query('stockMovementByDay', filter);
    expect(sum(byDay, 'count')).toBe(sum(byType, 'count'));
    expect(sum(byDay, 'qty_in')).toBeCloseTo(sum(byType, 'qty_in'), 3);
    expect(sum(byDay, 'qty_out')).toBeCloseTo(sum(byType, 'qty_out'), 3);

    const expenses = await reports.query('expenses', filter);
    expect(sum(await reports.query('expenseBreakdown', filter), 'amount')).toBe(sum(expenses, 'amount'));

    const purchases = await reports.query('purchases', filter);
    const statuses = await reports.query('purchaseStatusSummary', filter);
    expect(sum(statuses, 'count')).toBe(purchases.length);
    expect(sum(statuses, 'amount')).toBe(sum(purchases, 'grand_total'));
    expect(sum(statuses, 'due')).toBe(sum(purchases, 'due'));
  });

  it('keeps inventory, purchases, expenses and shifts consistent', async () => {
    const byCategory = await reports.query('inventoryByCategory', filter);
    const valuation = await reports.query('stockValuation', filter);
    expect(sum(byCategory, 'products')).toBe(valuation.length);
    expect(Math.abs(sum(byCategory, 'value') - sum(valuation, 'value'))).toBeLessThanOrEqual(1);
    const out = await reports.query('outOfStock', filter);
    expect(out.every((row) => num(row.stock) <= 0)).toBe(true);
    expect(sum(byCategory, 'out_of_stock')).toBe(out.length);
    const low = await reports.query('lowStock', filter);
    expect(low.every((row) => num(row.stock) > 0 && num(row.stock) <= num(row.min_stock))).toBe(true);
    expect(sum(byCategory, 'low')).toBe(low.length);

    const purchases = await reports.query('purchases', filter);
    const bySupplier = await reports.query('supplierPurchases', filter);
    const active = purchases.filter((row) => row.status !== 'cancelled');
    expect(purchases.length).toBeGreaterThan(0);
    expect(sum(bySupplier, 'amount')).toBe(sum(active, 'grand_total'));
    expect(sum(bySupplier, 'due')).toBe(sum(active, 'due'));

    const expenses = await reports.query('expenses', filter);
    const expenseCategories = await reports.query('expensesByCategory', filter);
    expect(sum(expenseCategories, 'amount')).toBe(sum(expenses.filter((row) => row.status !== 'rejected'), 'amount'));

    const shifts = await reports.query('shifts', filter);
    expect(shifts.length).toBeGreaterThan(10);
    const shiftSales = sum(shifts, 'amount');
    expect(shiftSales).toBeGreaterThan(0);

    const cancelled = await one('cancelledSales', undefined, { from: resolvePeriod('all', NOW).from });
    expect(num(cancelled.count)).toBeGreaterThan(0);
    expect(num(cancelled.amount)).toBeGreaterThan(0);

    const slow = await reports.query('slowMoving', filter);
    expect(slow.every((row) => num(row.stock) > 0)).toBe(true);
  });
});
