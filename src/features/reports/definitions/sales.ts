import { BadgePercent, Banknote, Calculator, CalendarDays, CalendarRange, Landmark, PackageMinus, Percent, Receipt, ShoppingBag, Trophy, TrendingUp, Undo2, Wallet } from 'lucide-react';
import { addDays, addMonths, parseLocalDate, startOfDay, startOfMonth } from '@/domain/dates';
import type { ReportRow } from '@/repositories/types';
import {
  amount,
  bestOf,
  byKey,
  col,
  columnChart,
  dateLabel,
  daysOf,
  donutFixed,
  enumLabel,
  hourLabel,
  hoursOf,
  i18n,
  isSingleDay,
  kpi,
  lineChart,
  monthLabel,
  monthsOf,
  nameLabel,
  num,
  pickRow,
  rangeOf,
  ratio,
  say,
  sumOf,
  topBar,
  totalsBy,
  WEEK_ORDER,
  weekdayLabel,
} from '../builders';
import type { ReportColumnDef, ReportDefinition, ReportRowData, StatementLine } from '../types';
import { detail, detailRow, first, PAYMENT_ORDER, query, REFUND_ORDER, table } from './common';

/* ==========================================================================
   Sales reports: summary (gross → net statement), daily, monthly, returns.
   Net sales = gross − discounts − returns; net takings = invoiced − refunds.
   ========================================================================== */

// A type alias (not an interface) so rows stay assignable to ReportRowData.
type BucketRow = { key: string; orders: number; discount: number; vat: number; sales: number; returns: number; net: number; basket: number };

/** One row per time bucket: sales (invoiced), refunds and net takings. */
function bucketRows(keys: readonly string[], sales: readonly ReportRow[], refunds: readonly ReportRow[]): BucketRow[] {
  const salesBy = byKey(sales);
  const refundsBy = byKey(refunds);
  return keys.map((key) => {
    const row = salesBy.get(key);
    const orders = num(row?.orders);
    const total = num(row?.sales);
    const refund = num(refundsBy.get(key)?.amount);
    return { key, orders, discount: num(row?.discount), vat: num(row?.tax), sales: total, returns: refund, net: total - refund, basket: orders > 0 ? Math.round(total / orders) : 0 };
  });
}

function bucketColumns(leading: ReportColumnDef[]): ReportColumnDef[] {
  return [
    ...leading,
    col('orders', 'reports.col.orders', 'number', { total: 'sum' }),
    col('discount', 'reports.col.discount', 'money', { total: 'sum' }),
    col('vat', 'reports.col.vat', 'money', { total: 'sum' }),
    col('sales', 'reports.col.sales', 'money', { total: 'sum' }),
    col('returns', 'reports.col.returns', 'money', { total: 'sum' }),
    col('net', 'reports.col.net', 'money', { total: 'sum' }),
    col('basket', 'reports.col.basket', 'money', { total: { ratio: ['sales', 'orders'] } }),
  ];
}

const values = (rows: readonly ReportRowData[], key: string): number[] => rows.map((row) => num(row[key]));

export const salesSummary: ReportDefinition = {
  id: 'sales-summary',
  group: 'sales',
  icon: Receipt,
  permission: 'reports.view',
  filters: ['cashier', 'counter'],
  period: 'range',
  defaultPeriod: 'today',
  compare: true,
  emptyKey: 'reports.empty.sales',
  async load(filter, options) {
    const range = rangeOf(filter);
    const hourly = isSingleDay(range);
    const [recon, impact, cancelled, trend, refunds, payments] = await Promise.all([
      first('salesReconciliation', filter),
      first('returnsImpact', filter),
      detailRow(options, () => first('cancelledSales', filter)),
      query(hourly ? 'salesByHour' : 'salesByDay', filter),
      detail(options, () => query(hourly ? 'returnsByHour' : 'returnsByDay', filter)),
      detail(options, () => query('paymentDetails', filter)),
    ]);
    const gross = num(recon.subtotal);
    const discount = num(recon.discount);
    const refund = num(impact.refund);
    const invoiced = num(recon.grand_total);
    const orders = num(recon.orders);
    const net = gross - discount - refund;
    const vatIncluded = num(recon.tax) - num(recon.tax_added);
    const keys = hourly ? hoursOf([...trend, ...refunds]) : daysOf(range);
    const rows = bucketRows(keys, trend, refunds);

    const lines: StatementLine[] = [
      { key: 'gross', label: i18n('reports.statement.grossSales'), value: gross, kind: 'money', role: 'base' },
      { key: 'itemDiscount', label: i18n('reports.statement.itemDiscounts'), value: num(recon.item_discount), kind: 'money', role: 'subtract' },
      { key: 'orderDiscount', label: i18n('reports.statement.orderDiscounts'), value: num(recon.order_discount), kind: 'money', role: 'subtract' },
      { key: 'returns', label: i18n('reports.statement.returns'), value: refund, kind: 'money', role: 'subtract' },
      { key: 'net', label: i18n('reports.statement.netSales'), value: net, kind: 'money', role: 'total' },
      { key: 'vatAdded', label: i18n('reports.statement.vatAdded'), value: num(recon.tax_added), kind: 'money', role: 'add' },
      { key: 'rounding', label: i18n('reports.statement.rounding'), value: num(recon.rounding), kind: 'money', role: 'add' },
      { key: 'takings', label: i18n('reports.statement.netTakings'), value: invoiced - refund, kind: 'money', role: 'total' },
      { key: 'invoiced', label: i18n('reports.statement.invoiced'), value: invoiced, kind: 'money', role: 'info' },
      ...(vatIncluded > 0 ? [{ key: 'vatIncluded', label: i18n('reports.statement.vatIncluded'), value: vatIncluded, kind: 'money' as const, role: 'info' as const }] : []),
      { key: 'cancelled', label: i18n('reports.statement.cancelled'), value: num(cancelled.amount), kind: 'money', role: 'info' },
    ];

    return {
      kpis: [
        kpi('net', 'reports.kpi.netSales', net, 'money', Wallet, { tone: 'primary', hint: say('reports.hint.netFormula') }),
        kpi('gross', 'reports.kpi.grossSales', gross, 'money', TrendingUp, { tone: 'info', hint: say('reports.hint.beforeDiscounts') }),
        kpi('discount', 'reports.kpi.discounts', discount, 'money', BadgePercent, {
          tone: 'success',
          invert: true,
          hint: say('reports.hint.discountedOrders', { count: amount(num(recon.discounted_orders), 'number') }),
        }),
        kpi('returns', 'reports.kpi.returns', refund, 'money', Undo2, { tone: 'warning', invert: true, hint: say('reports.hint.returns', { count: amount(num(impact.count), 'number') }) }),
        kpi('vat', 'reports.kpi.vat', num(recon.tax), 'money', Landmark, { tone: 'info' }),
        kpi('orders', 'reports.kpi.orders', orders, 'number', ShoppingBag, { tone: 'neutral', hint: say('reports.hint.unitsSold', { qty: amount(num(recon.quantity), 'quantity') }) }),
        kpi('basket', 'reports.kpi.avgBasket', orders > 0 ? Math.round(invoiced / orders) : 0, 'money', Calculator, { tone: 'neutral' }),
        kpi('takings', 'reports.kpi.netTakings', invoiced - refund, 'money', Banknote, { tone: 'primary', hint: say('reports.hint.takingsFormula') }),
      ],
      statement: { titleKey: 'reports.statement.salesTitle', subtitle: say('reports.statement.salesSubtitle'), lines },
      charts: [
        donutFixed(PAYMENT_ORDER, totalsBy(payments, 'method', 'amount'), (method) => enumLabel('paymentMethod', method), {
          id: 'payments',
          titleKey: 'reports.chart.paymentMix',
          categoryKey: 'reports.col.method',
          valueKey: 'reports.col.received',
          valueKind: 'money',
          centerKey: 'reports.chart.received',
          span: 'half',
        }),
        lineChart({
          id: 'trend',
          titleKey: 'reports.chart.salesTrend',
          subtitle: say(hourly ? 'reports.chart.byHour' : 'reports.chart.byDay'),
          categoryKey: hourly ? 'reports.col.hour' : 'reports.col.date',
          valueKey: 'reports.col.sales',
          valueKind: 'money',
          span: 'full',
          points: keys.map((key) => (hourly ? hourLabel(key) : dateLabel(key))),
          series: [{ key: 'sales', labelKey: 'reports.col.sales', values: values(rows, 'sales') }],
          compare: true,
        }),
      ],
      table: table(
        bucketColumns([hourly ? col('key', 'reports.col.hour', 'text', { display: 'hour' }) : col('key', 'reports.col.date', 'date')]),
        rows,
        'key',
        { defaultSort: { key: 'key', direction: 'asc' } },
      ),
      empty: orders === 0 && refund === 0,
    };
  },
};

export const dailySales: ReportDefinition = {
  id: 'daily-sales',
  group: 'sales',
  icon: CalendarDays,
  permission: 'reports.view',
  filters: ['cashier', 'counter'],
  period: 'range',
  defaultPeriod: 'this_month',
  compare: true,
  emptyKey: 'reports.empty.sales',
  async load(filter) {
    const keys = daysOf(rangeOf(filter));
    const [sales, refunds] = await Promise.all([query('salesByDay', filter), query('returnsByDay', filter)]);
    const rows = bucketRows(keys, sales, refunds).map((row) => ({ ...row, weekday: parseLocalDate(String(row.key)).getDay() }));
    const total = sumOf(sales, 'sales');
    const orders = sumOf(sales, 'orders');
    const refund = sumOf(refunds, 'amount');
    const best = bestOf(rows, (row) => num(row.sales));
    const weekdays = WEEK_ORDER.filter((day) => rows.some((row) => row.weekday === day)).map((day) => {
      const days = rows.filter((row) => row.weekday === day);
      return { key: String(day), label: weekdayLabel(day), value: Math.round(sumOf(days, 'sales') / days.length) };
    });
    return {
      kpis: [
        kpi('sales', 'reports.kpi.invoicedSales', total, 'money', TrendingUp, { tone: 'primary', hint: say('reports.hint.orders', { count: amount(orders, 'number') }) }),
        kpi('net', 'reports.kpi.netTakings', total - refund, 'money', Banknote, { tone: 'success', hint: say('reports.hint.takingsFormula') }),
        kpi('avg', 'reports.kpi.avgPerDay', Math.round(total / Math.max(1, keys.length)), 'money', CalendarDays, {
          tone: 'info',
          hint: say('reports.hint.days', { count: amount(keys.length, 'number') }),
        }),
        kpi('best', 'reports.kpi.bestDay', num(best?.sales), 'money', Trophy, { tone: 'warning', comparable: false, hint: best ? say('reports.hint.onDate', { date: dateLabel(String(best.key)) }) : undefined }),
        kpi('orders', 'reports.kpi.orders', orders, 'number', ShoppingBag, { tone: 'neutral' }),
        kpi('basket', 'reports.kpi.avgBasket', orders > 0 ? Math.round(total / orders) : 0, 'money', Calculator, { tone: 'neutral' }),
      ],
      charts: [
        columnChart({
          id: 'daily',
          titleKey: 'reports.chart.salesByDay',
          categoryKey: 'reports.col.date',
          valueKey: 'reports.col.sales',
          valueKind: 'money',
          span: 'full',
          data: rows.map((row) => ({ key: String(row.key), label: dateLabel(String(row.key)), value: num(row.sales) })),
          highlightKey: best ? String(best.key) : undefined,
        }),
        lineChart({
          id: 'orders',
          titleKey: 'reports.chart.ordersByDay',
          categoryKey: 'reports.col.date',
          valueKey: 'reports.col.orders',
          valueKind: 'number',
          span: 'half',
          points: keys.map(dateLabel),
          series: [{ key: 'orders', labelKey: 'reports.col.orders', values: values(rows, 'orders') }],
          compare: true,
        }),
        columnChart({ id: 'weekday', titleKey: 'reports.chart.weekdayAverage', categoryKey: 'reports.col.weekday', valueKey: 'reports.col.sales', valueKind: 'money', span: 'half', data: weekdays }),
      ],
      table: table(bucketColumns([col('key', 'reports.col.date', 'date'), col('weekday', 'reports.col.weekday', 'number', { display: 'weekday', align: 'start' })]), rows, 'key', {
        defaultSort: { key: 'key', direction: 'asc' },
      }),
      empty: orders === 0 && refund === 0,
    };
  },
};

export const monthlySales: ReportDefinition = {
  id: 'monthly-sales',
  group: 'sales',
  icon: CalendarRange,
  permission: 'reports.view',
  filters: ['cashier', 'counter'],
  period: 'range',
  defaultPeriod: 'custom',
  defaultRange: (now) => ({ from: addMonths(startOfMonth(now), -11).toISOString(), to: addDays(startOfDay(now), 1).toISOString() }),
  compare: true,
  emptyKey: 'reports.empty.sales',
  async load(filter) {
    const keys = monthsOf(rangeOf(filter));
    const [sales, refunds] = await Promise.all([query('salesByMonth', filter), query('returnsByMonth', filter)]);
    const base = bucketRows(keys, sales, refunds);
    const rows = base.map((row, index) => {
      const previous = index > 0 ? num(base[index - 1].sales) : 0;
      return { ...row, growth: previous > 0 ? (num(row.sales) - previous) / previous : null };
    });
    const total = sumOf(sales, 'sales');
    const orders = sumOf(sales, 'orders');
    const refund = sumOf(refunds, 'amount');
    const best = bestOf(rows, (row) => num(row.sales));
    const points = keys.map(monthLabel);
    return {
      kpis: [
        kpi('sales', 'reports.kpi.invoicedSales', total, 'money', TrendingUp, { tone: 'primary', hint: say('reports.hint.orders', { count: amount(orders, 'number') }) }),
        kpi('net', 'reports.kpi.netTakings', total - refund, 'money', Banknote, { tone: 'success', hint: say('reports.hint.takingsFormula') }),
        kpi('avg', 'reports.kpi.avgPerMonth', Math.round(total / Math.max(1, keys.length)), 'money', CalendarRange, {
          tone: 'info',
          hint: say('reports.hint.months', { count: amount(keys.length, 'number') }),
        }),
        kpi('best', 'reports.kpi.bestMonth', num(best?.sales), 'money', Trophy, { tone: 'warning', comparable: false, hint: best ? say('reports.hint.onDate', { date: monthLabel(String(best.key)) }) : undefined }),
        kpi('orders', 'reports.kpi.orders', orders, 'number', ShoppingBag, { tone: 'neutral' }),
        kpi('basket', 'reports.kpi.avgBasket', orders > 0 ? Math.round(total / orders) : 0, 'money', Calculator, { tone: 'neutral' }),
      ],
      charts: [
        columnChart({
          id: 'monthly',
          titleKey: 'reports.chart.salesByMonth',
          categoryKey: 'reports.col.month',
          valueKey: 'reports.col.sales',
          valueKind: 'money',
          span: 'full',
          data: rows.map((row) => ({ key: String(row.key), label: monthLabel(String(row.key)), value: num(row.sales) })),
          highlightKey: best ? String(best.key) : undefined,
        }),
        lineChart({
          id: 'orders',
          titleKey: 'reports.chart.ordersByMonth',
          categoryKey: 'reports.col.month',
          valueKey: 'reports.col.orders',
          valueKind: 'number',
          span: 'half',
          points,
          series: [{ key: 'orders', labelKey: 'reports.col.orders', values: values(rows, 'orders') }],
          compare: true,
        }),
        columnChart({
          id: 'basket',
          titleKey: 'reports.chart.basketByMonth',
          categoryKey: 'reports.col.month',
          valueKey: 'reports.col.basket',
          valueKind: 'money',
          span: 'half',
          data: rows.map((row) => ({ key: String(row.key), label: monthLabel(String(row.key)), value: num(row.basket) })),
        }),
      ],
      table: table(
        [...bucketColumns([col('key', 'reports.col.month', 'text', { display: 'month' })]), col('growth', 'reports.col.growth', 'percent', { signed: true, signTone: true })],
        rows,
        'key',
        { defaultSort: { key: 'key', direction: 'asc' } },
      ),
      empty: orders === 0 && refund === 0,
    };
  },
};

const RETURN_KEYS = ['id', 'return_no', 'created_at', 'invoice_no', 'cashier_name', 'reason', 'refund_method', 'quantity', 'tax_total', 'refund_total', 'approved_by'] as const;

export const returnsReport: ReportDefinition = {
  id: 'returns',
  group: 'sales',
  icon: Undo2,
  permission: 'reports.view',
  filters: ['cashier', 'counter', 'search'],
  period: 'range',
  defaultPeriod: 'this_month',
  compare: true,
  emptyKey: 'reports.empty.returns',
  async load(filter, options) {
    const days = daysOf(rangeOf(filter));
    const [impact, recon, byDay, products, methods, list] = await Promise.all([
      first('returnsImpact', filter),
      first('salesReconciliation', filter),
      query('returnsByDay', filter),
      detail(options, () => query('returnProducts', filter, { limit: 10 })),
      detail(options, () => query('returnMethods', filter)),
      detail(options, () => query('returns', filter)),
    ]);
    const refund = num(impact.refund);
    const count = num(impact.count);
    const perDay = byKey(byDay);
    return {
      kpis: [
        kpi('refunds', 'reports.kpi.refunds', refund, 'money', Undo2, { tone: 'warning', invert: true, hint: say('reports.hint.returns', { count: amount(count, 'number') }) }),
        kpi('rate', 'reports.kpi.returnRate', ratio(refund, num(recon.grand_total)), 'percent', Percent, { tone: 'danger', invert: true }),
        kpi('units', 'reports.kpi.unitsReturned', num(impact.quantity), 'quantity', PackageMinus, {
          tone: 'info',
          invert: true,
          hint: say('reports.hint.damaged', { qty: amount(num(impact.damaged), 'quantity') }),
        }),
        kpi('vat', 'reports.kpi.vatReversed', num(impact.tax), 'money', Landmark, { tone: 'neutral' }),
        kpi('avg', 'reports.kpi.avgRefund', count > 0 ? Math.round(refund / count) : 0, 'money', Calculator, { tone: 'neutral' }),
      ],
      charts: [
        columnChart({
          id: 'byDay',
          titleKey: 'reports.chart.refundsByDay',
          categoryKey: 'reports.col.date',
          valueKey: 'reports.col.refund',
          valueKind: 'money',
          span: 'full',
          data: days.map((key) => ({ key, label: dateLabel(key), value: num(perDay.get(key)?.amount) })),
        }),
        topBar(products, {
          id: 'products',
          titleKey: 'reports.chart.mostReturned',
          categoryKey: 'reports.col.product',
          valueKey: 'reports.col.refund',
          valueKind: 'money',
          span: 'half',
          label: (row) => nameLabel(row),
          value: (row) => num(row.amount),
          secondary: (row) => say('reports.hint.units', { qty: amount(num(row.quantity), 'quantity') }),
        }),
        donutFixed(REFUND_ORDER, totalsBy(methods, 'method', 'amount'), (method) => enumLabel('refundMethod', method), {
          id: 'methods',
          titleKey: 'reports.chart.refundMethods',
          categoryKey: 'reports.col.method',
          valueKey: 'reports.col.refund',
          valueKind: 'money',
          centerKey: 'reports.chart.total',
          span: 'half',
        }),
      ],
      table: table(
        [
          col('return_no', 'reports.col.returnNo', 'text', { mono: true }),
          col('created_at', 'reports.col.dateTime', 'datetime'),
          col('invoice_no', 'reports.col.invoice', 'text', { mono: true }),
          col('cashier_name', 'reports.col.cashier', 'text'),
          col('reason', 'reports.col.reason', 'text', { wrap: true }),
          col('refund_method', 'reports.col.method', 'text', { enumGroup: 'refundMethod' }),
          col('quantity', 'reports.col.quantity', 'quantity', { total: 'sum' }),
          col('tax_total', 'reports.col.vat', 'money', { total: 'sum', hidden: true }),
          col('refund_total', 'reports.col.refund', 'money', { total: 'sum' }),
          col('approved_by', 'reports.col.approvedBy', 'text', { hidden: true }),
        ],
        list.map((row) => pickRow(row, RETURN_KEYS)),
        'id',
        { defaultSort: { key: 'created_at', direction: 'desc' }, searchKeys: ['return_no', 'invoice_no', 'cashier_name', 'reason'] },
      ),
      empty: count === 0,
    };
  },
};
