import { APP_CONFIG } from '@/config/app.config';
import { addDays, eachLocalDate, resolvePeriod, startOfDay } from '@/domain/dates';
import { repos } from '@/repositories';
import type { ReportQueryName, ReportRow } from '@/repositories/types';
import type { DateRange, PaymentMethod, RankedRow, ReportFilter, ReportPeriod, SalesKpis, TimeBucket } from '@/types';
import { ctx, requirePermission } from './context';

/* ==========================================================================
   Report & dashboard data. Every number is calculated from local records
   (sales, payments, returns, stock movements, purchases, shifts, expenses)
   through the ReportRepository — nothing is hard-coded.
   ========================================================================== */

const num = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) ? value : 0);
const str = (value: unknown): string => (typeof value === 'string' ? value : '');

export function defaultReportFilter(period: ReportPeriod = 'today', custom?: DateRange): ReportFilter {
  const range = resolvePeriod(period, ctx().now(), custom);
  return {
    period,
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
}

export function withPeriod(filter: ReportFilter, period: ReportPeriod, custom?: DateRange): ReportFilter {
  const range = resolvePeriod(period, ctx().now(), custom);
  return { ...filter, period, from: range.from, to: range.to };
}

export function toKpis(row: ReportRow): SalesKpis {
  const gross = num(row.gross);
  const orders = num(row.orders);
  const tax = num(row.tax);
  const cost = num(row.cost);
  const returns = num(row.returns);
  return {
    grossSales: gross,
    netSales: gross - returns,
    orders,
    averageOrder: orders > 0 ? Math.round(gross / orders) : 0,
    itemsSold: num(row.items),
    discountTotal: num(row.discount),
    taxTotal: tax,
    returnsTotal: returns,
    returnsCount: num(row.returns_count),
    cashSales: num(row.cash),
    cardSales: num(row.card),
    mobileSales: num(row.mobile),
    pointsSales: num(row.points),
    costOfGoods: cost,
    grossProfit: gross - tax - cost,
    customers: num(row.customers),
  };
}

export async function loadKpis(range: DateRange, filter: Partial<ReportFilter> = {}): Promise<SalesKpis> {
  return toKpis(await repos().reports.salesTotals(range, filter));
}

/** Runs a named report query (permission-checked). */
export async function runQuery(name: ReportQueryName, filter: ReportFilter, extra?: Record<string, string | number>): Promise<ReportRow[]> {
  requirePermission('reports.view');
  return repos().reports.query(name, filter, extra);
}

/** Change vs a previous value, as a fraction (0.12 = +12%); null when not comparable. */
export function delta(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return (current - previous) / Math.abs(previous);
}

export function toRanked(rows: ReportRow[], amountKey = 'amount', quantityKey = 'quantity'): RankedRow[] {
  const total = rows.reduce((sum, row) => sum + num(row[amountKey]), 0);
  return rows.map((row) => ({
    id: str(row.id),
    name: { bn: str(row.name_bn) || str(row.name_en) || str(row.name), en: str(row.name_en) || str(row.name) },
    quantity: num(row[quantityKey]),
    amount: num(row[amountKey]),
    orders: num(row.orders),
    share: total > 0 ? num(row[amountKey]) / total : 0,
    extra: row as Record<string, number | string>,
  }));
}

/** Fills every hour 08–23 (or every day of the range) so charts have no gaps. */
export function hourBuckets(rows: ReportRow[]): TimeBucket[] {
  const byKey = new Map(rows.map((row) => [str(row.key), row]));
  const buckets: TimeBucket[] = [];
  for (let hour = 7; hour <= 23; hour += 1) {
    const key = String(hour).padStart(2, '0');
    const row = byKey.get(key);
    buckets.push({ key, label: key, sales: num(row?.sales), orders: num(row?.orders) });
  }
  return buckets;
}

export function dayBuckets(rows: ReportRow[], range: DateRange): TimeBucket[] {
  const byKey = new Map(rows.map((row) => [str(row.key), row]));
  return eachLocalDate(range).map((key) => {
    const row = byKey.get(key);
    return { key, label: key, sales: num(row?.sales), orders: num(row?.orders) };
  });
}

export interface PaymentSlice {
  method: PaymentMethod;
  amount: number;
  count: number;
  share: number;
}

export function paymentSlices(rows: ReportRow[]): PaymentSlice[] {
  const totals = new Map<PaymentMethod, { amount: number; count: number }>();
  for (const row of rows) {
    const method = str(row.method) as PaymentMethod;
    const entry = totals.get(method) ?? { amount: 0, count: 0 };
    entry.amount += num(row.amount);
    entry.count += num(row.count);
    totals.set(method, entry);
  }
  const sum = [...totals.values()].reduce((total, entry) => total + entry.amount, 0);
  return [...totals.entries()]
    .map(([method, entry]) => ({ method, amount: entry.amount, count: entry.count, share: sum > 0 ? entry.amount / sum : 0 }))
    .sort((a, b) => b.amount - a.amount);
}

export interface DashboardSnapshot {
  period: ReportPeriod;
  range: DateRange;
  kpis: SalesKpis;
  previous: SalesKpis;
  trend: TimeBucket[];
  trendKind: 'hour' | 'day';
  last14Days: TimeBucket[];
  payments: PaymentSlice[];
  topProducts: RankedRow[];
  categories: RankedRow[];
  cashiers: RankedRow[];
  lowStock: ReportRow[];
}

export async function loadDashboard(period: Extract<ReportPeriod, 'today' | 'this_week' | 'this_month'> = 'today'): Promise<DashboardSnapshot> {
  requirePermission('dashboard.view');
  const now = ctx().now();
  const filter = defaultReportFilter(period);
  const range = { from: filter.from, to: filter.to };
  const previousRange =
    period === 'today'
      ? resolvePeriod('yesterday', now)
      : { from: addDays(new Date(range.from), -(period === 'this_week' ? 7 : 30)).toISOString(), to: range.from };
  const fourteen = { from: addDays(startOfDay(now), -13).toISOString(), to: addDays(startOfDay(now), 1).toISOString() };
  const reports = repos().reports;
  const [kpis, previous, trendRows, dayRows, payments, products, categories, cashiers, lowStock] = await Promise.all([
    loadKpis(range),
    loadKpis(previousRange),
    reports.query(period === 'today' ? 'salesByHour' : 'salesByDay', filter),
    reports.query('salesByDay', { ...filter, from: fourteen.from, to: fourteen.to }),
    reports.query('paymentMethods', filter),
    reports.query('productSales', filter, { limit: APP_CONFIG.reports.topListSize }),
    reports.query('categorySales', filter),
    reports.query('cashierSales', filter),
    reports.query('lowStock', filter),
  ]);
  return {
    period,
    range,
    kpis,
    previous,
    trend: period === 'today' ? hourBuckets(trendRows) : dayBuckets(trendRows, range),
    trendKind: period === 'today' ? 'hour' : 'day',
    last14Days: dayBuckets(dayRows, fourteen),
    payments: paymentSlices(payments),
    topProducts: toRanked(products),
    categories: toRanked(categories),
    cashiers: toRanked(cashiers),
    lowStock: lowStock.slice(0, 8),
  };
}

/* --------------------------------------------------------------------------
   Dashboard for any preset period (today / yesterday / this week / this
   month). Deltas compare with the previous day / week / month up to the
   same point in time, so a half-finished day is never compared with a
   full one.
   -------------------------------------------------------------------------- */

export type DashboardPeriod = Extract<ReportPeriod, 'today' | 'yesterday' | 'this_week' | 'this_month'>;

export interface DashboardView {
  period: DashboardPeriod;
  range: DateRange;
  /** Comparison window used for every delta. */
  comparison: DateRange;
  kpis: SalesKpis;
  previous: SalesKpis;
  /** Registered customers plus walk-in orders (each walk-in sale is one customer served). */
  customers: { served: number; previousServed: number; members: number; walkIn: number };
  trend: TimeBucket[];
  trendKind: 'hour' | 'day';
  /** Payment totals by method and provider (bKash, Nagad, Visa…). */
  payments: Array<{ method: PaymentMethod; provider: string; amount: number; count: number }>;
  topProducts: RankedRow[];
  categories: RankedRow[];
  cashiers: RankedRow[];
  lowStock: ReportRow[];
  lowStockCount: number;
}

function comparisonWindow(period: DashboardPeriod, range: DateRange, now: Date): DateRange {
  const back = (date: Date): Date => {
    if (period === 'this_week') return addDays(date, -7);
    if (period === 'this_month') {
      const lastDayOfPreviousMonth = new Date(date.getFullYear(), date.getMonth(), 0).getDate();
      return new Date(date.getFullYear(), date.getMonth() - 1, Math.min(date.getDate(), lastDayOfPreviousMonth), date.getHours(), date.getMinutes(), date.getSeconds(), date.getMilliseconds());
    }
    return addDays(date, -1);
  };
  const from = new Date(range.from);
  const end = new Date(Math.max(from.getTime(), Math.min(new Date(range.to).getTime(), now.getTime())));
  return { from: back(from).toISOString(), to: back(end).toISOString() };
}

function customersServed(memberRows: ReportRow[], orders: number): { served: number; members: number; walkIn: number } {
  const memberOrders = memberRows.reduce((sum, row) => sum + num(row.orders), 0);
  const walkIn = Math.max(0, orders - memberOrders);
  return { served: memberRows.length + walkIn, members: memberRows.length, walkIn };
}

export async function loadDashboardFor(period: DashboardPeriod = 'today'): Promise<DashboardView> {
  requirePermission('dashboard.view');
  const filter = defaultReportFilter(period);
  const range: DateRange = { from: filter.from, to: filter.to };
  const comparison = comparisonWindow(period, range, ctx().now());
  const previousFilter: ReportFilter = { ...filter, from: comparison.from, to: comparison.to };
  const singleDay = period === 'today' || period === 'yesterday';
  const reports = repos().reports;
  const everyCustomer = { limit: 1_000_000 };
  const [kpis, previous, trendRows, payments, products, categories, cashiers, lowStock, members, previousMembers] = await Promise.all([
    loadKpis(range),
    loadKpis(comparison),
    reports.query(singleDay ? 'salesByHour' : 'salesByDay', filter),
    reports.query('paymentMethods', filter),
    reports.query('productSales', filter, { limit: APP_CONFIG.reports.topListSize }),
    reports.query('categorySales', filter),
    reports.query('cashierSales', filter),
    reports.query('lowStock', filter),
    reports.query('customerPurchases', filter, everyCustomer),
    reports.query('customerPurchases', previousFilter, everyCustomer),
  ]);
  const current = customersServed(members, kpis.orders);
  return {
    period,
    range,
    comparison,
    kpis,
    previous,
    customers: { served: current.served, previousServed: customersServed(previousMembers, previous.orders).served, members: current.members, walkIn: current.walkIn },
    trend: singleDay ? hourBuckets(trendRows) : dayBuckets(trendRows, range),
    trendKind: singleDay ? 'hour' : 'day',
    payments: payments.map((row) => ({ method: str(row.method) as PaymentMethod, provider: str(row.provider), amount: num(row.amount), count: num(row.count) })),
    topProducts: toRanked(products),
    categories: toRanked(categories),
    cashiers: toRanked(cashiers),
    lowStock: lowStock.slice(0, 8),
    lowStockCount: lowStock.length,
  };
}

/* --------------------------------------------------------------------------
   Reports module. Report loaders (src/features/reports/definitions) run
   their named queries through these permission-checked entry points.
   -------------------------------------------------------------------------- */

/** Runs a named query for a report that reveals cost, stock value or profit. */
export async function runFinancialQuery(name: ReportQueryName, filter: ReportFilter, extra?: Record<string, string | number>): Promise<ReportRow[]> {
  requirePermission('reports.financial');
  return runQuery(name, filter, extra);
}

/** Whether the signed-in user may see cost, stock value and profit figures. */
export function canViewFinancialReports(): boolean {
  return ctx().can('reports.financial');
}
