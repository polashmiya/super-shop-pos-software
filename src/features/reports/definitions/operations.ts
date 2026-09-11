import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Banknote,
  CalendarDays,
  CircleCheck,
  CircleX,
  ClipboardList,
  Clock,
  Coins,
  HandCoins,
  Hourglass,
  PackageCheck,
  ReceiptText,
  ShoppingCart,
  Store,
  Timer,
  TriangleAlert,
  TrendingUp,
  Undo2,
  Wallet,
} from 'lucide-react';
import type { ReportRow } from '@/repositories/types';
import { amount, col, dayCount, donutFixed, enumLabel, groupBy, i18n, kpi, nameLabel, num, pickRow, rangeOf, say, str, sumOf, text, topBar, totalsBy } from '../builders';
import type { ReportDefinition, StatementLine } from '../types';
import { detail, LIST_LIMITS, limitNotice, query, table } from './common';

/* ==========================================================================
   Operations: cash drawers, shifts, expenses and purchasing.
   Cash ledger amounts are signed (refunds, expenses, cash out and the
   closing count are negative), so the expected cash is a plain sum.
   ========================================================================== */

const CASH_KEYS = ['id', 'created_at', 'type', 'amount', 'shift_no', 'reference_no', 'note', 'user_name'] as const;

export const cashReport: ReportDefinition = {
  id: 'cash',
  group: 'operations',
  icon: Wallet,
  permission: 'reports.view',
  filters: ['counter', 'cashType', 'search'],
  period: 'range',
  defaultPeriod: 'today',
  compare: true,
  emptyKey: 'reports.empty.cash',
  async load(filter, options) {
    const extra = { type: options.extra.cashType };
    const [summary, list] = await Promise.all([query('cashMovementSummary', filter, extra), detail(options, () => query('cashMovements', filter, extra))]);
    const byType = totalsBy(summary, 'type', 'amount');
    const get = (type: string) => byType.get(type) ?? 0;
    const opening = get('opening');
    const sales = get('sale');
    const refunds = -get('refund');
    const expenses = -get('expense');
    const cashIn = get('cash_in');
    const cashOut = -get('cash_out');
    const expected = opening + sales - refunds - expenses + cashIn - cashOut;
    const lines: StatementLine[] = [
      { key: 'opening', label: i18n('reports.statement.opening'), value: opening, kind: 'money', role: 'base' },
      { key: 'sales', label: i18n('reports.statement.cashSales'), value: sales, kind: 'money', role: 'add' },
      { key: 'refunds', label: i18n('reports.statement.refunds'), value: refunds, kind: 'money', role: 'subtract' },
      { key: 'expenses', label: i18n('reports.statement.expensesPaid'), value: expenses, kind: 'money', role: 'subtract' },
      { key: 'cashIn', label: i18n('reports.statement.cashIn'), value: cashIn, kind: 'money', role: 'add' },
      { key: 'cashOut', label: i18n('reports.statement.cashOut'), value: cashOut, kind: 'money', role: 'subtract' },
      { key: 'expected', label: i18n('reports.statement.expected'), value: expected, kind: 'money', role: 'total' },
      { key: 'counted', label: i18n('reports.statement.counted'), value: -get('closing'), kind: 'money', role: 'info' },
    ];
    return {
      kpis: [
        kpi('sales', 'reports.kpi.cashSales', sales, 'money', Banknote, { tone: 'success' }),
        kpi('refunds', 'reports.kpi.cashRefunds', refunds, 'money', Undo2, { tone: 'warning', invert: true }),
        kpi('expenses', 'reports.kpi.expensesPaid', expenses, 'money', ReceiptText, { tone: 'warning', invert: true }),
        kpi('in', 'reports.kpi.cashIn', cashIn, 'money', ArrowDownToLine, { tone: 'info' }),
        kpi('out', 'reports.kpi.cashOut', cashOut, 'money', ArrowUpFromLine, { tone: 'neutral' }),
        kpi('expected', 'reports.kpi.expectedCash', expected, 'money', Wallet, { tone: 'primary', hint: say('reports.hint.withOpening', { amount: amount(opening) }) }),
      ],
      statement: { titleKey: 'reports.statement.cashTitle', subtitle: say('reports.statement.cashSubtitle'), lines },
      charts: [
        topBar(
          summary.filter((row) => row.type !== 'closing'),
          {
            id: 'byType',
            titleKey: 'reports.chart.cashByType',
            categoryKey: 'reports.col.type',
            valueKey: 'reports.col.amount',
            valueKind: 'money',
            span: 'half',
            label: (row) => enumLabel('cashMovement', str(row.type)),
            value: (row) => Math.abs(num(row.amount)),
          },
        ),
      ],
      table: table(
        [
          col('created_at', 'reports.col.dateTime', 'datetime'),
          col('type', 'reports.col.type', 'text', { enumGroup: 'cashMovement' }),
          col('amount', 'reports.col.amount', 'money', { signed: true, signTone: true, total: 'sum' }),
          col('counter', 'reports.col.counter', 'text', { bnKey: 'counter_bn' }),
          col('shift_no', 'reports.col.shiftNo', 'text', { mono: true }),
          col('reference_no', 'reports.col.reference', 'text', { mono: true }),
          col('note', 'reports.col.note', 'text', { wrap: true, hidden: true }),
          col('user_name', 'reports.col.user', 'text'),
        ],
        list.map((row) => ({ ...pickRow(row, CASH_KEYS), counter: str(row.counter_en), counter_bn: str(row.counter_bn) })),
        'id',
        {
          defaultSort: { key: 'created_at', direction: 'desc' },
          searchKeys: ['shift_no', 'reference_no', 'note', 'user_name'],
          notice: limitNotice(list.length, LIST_LIMITS.cash),
        },
      ),
      empty: summary.length === 0,
    };
  },
};

function drawerState(row: ReportRow): 'open' | 'short' | 'over' | 'balanced' {
  if (row.status !== 'closed') return 'open';
  const difference = num(row.difference);
  return difference < 0 ? 'short' : difference > 0 ? 'over' : 'balanced';
}

export const shiftsReport: ReportDefinition = {
  id: 'shifts',
  group: 'operations',
  icon: Clock,
  permission: 'reports.view',
  filters: ['counter', 'cashier', 'search'],
  period: 'range',
  defaultPeriod: 'this_week',
  compare: false,
  emptyKey: 'reports.empty.shifts',
  landscape: true,
  async load(filter) {
    const rows = await query('shifts', filter);
    const short = rows.filter((row) => drawerState(row) === 'short').map((row) => ({ ...row, shortage: -num(row.difference) }));
    const over = rows.filter((row) => drawerState(row) === 'over');
    return {
      kpis: [
        kpi('shifts', 'reports.kpi.shifts', rows.length, 'number', Clock, { tone: 'info' }),
        kpi('open', 'reports.kpi.openShifts', rows.filter((row) => drawerState(row) === 'open').length, 'number', Timer, { tone: 'neutral' }),
        kpi('sales', 'reports.kpi.shiftSales', sumOf(rows, 'amount'), 'money', TrendingUp, { tone: 'primary', hint: say('reports.hint.orders', { count: amount(sumOf(rows, 'orders'), 'number') }) }),
        kpi('short', 'reports.kpi.shortage', sumOf(short, 'shortage'), 'money', TriangleAlert, {
          tone: 'danger',
          invert: true,
          hint: say('reports.hint.shifts', { count: amount(short.length, 'number') }),
        }),
        kpi('over', 'reports.kpi.overage', sumOf(over, 'difference'), 'money', Coins, { tone: 'warning', hint: say('reports.hint.shifts', { count: amount(over.length, 'number') }) }),
        kpi('balanced', 'reports.kpi.balanced', rows.filter((row) => drawerState(row) === 'balanced').length, 'number', CircleCheck, { tone: 'success' }),
      ],
      charts: [
        topBar(groupBy(rows, 'counter_en', { en: 'counter_en', bn: 'counter_bn' }, 'amount'), {
          id: 'byCounter',
          titleKey: 'reports.chart.salesByCounter',
          categoryKey: 'reports.col.counter',
          valueKey: 'reports.col.sales',
          valueKind: 'money',
          span: 'half',
          label: (row) => nameLabel(row),
          value: (row) => num(row.amount),
          secondary: (row) => say('reports.hint.shifts', { count: amount(num(row.count), 'number') }),
        }),
        topBar(groupBy(short, 'opened_by_name', { en: 'opened_by_name', bn: 'opened_by_name' }, 'shortage'), {
          id: 'shortage',
          titleKey: 'reports.chart.shortageByCashier',
          categoryKey: 'reports.col.cashier',
          valueKey: 'reports.col.difference',
          valueKind: 'money',
          span: 'half',
          label: (row) => nameLabel(row),
          value: (row) => num(row.amount),
          secondary: (row) => say('reports.hint.shifts', { count: amount(num(row.count), 'number') }),
        }),
      ],
      table: table(
        [
          col('shift_no', 'reports.col.shiftNo', 'text', { mono: true }),
          col('counter', 'reports.col.counter', 'text', { bnKey: 'counter_bn' }),
          col('opened_by_name', 'reports.col.cashier', 'text'),
          col('status', 'reports.col.status', 'text', { enumGroup: 'shiftStatus', tones: { open: 'info', closed: 'neutral' } }),
          col('opened_at', 'reports.col.openedAt', 'datetime'),
          col('closed_at', 'reports.col.closedAt', 'datetime'),
          col('orders', 'reports.col.orders', 'number', { total: 'sum' }),
          col('amount', 'reports.col.sales', 'money', { total: 'sum' }),
          col('opening_cash', 'reports.col.openingCash', 'money', { hidden: true }),
          col('actual_cash', 'reports.col.countedCash', 'money', { hidden: true }),
          col('difference', 'reports.col.difference', 'money', { signed: true, signTone: true, total: 'sum' }),
          col('drawer', 'reports.col.drawer', 'text', { enumGroup: 'drawer', tones: { short: 'danger', over: 'warning', balanced: 'success', open: 'neutral' } }),
        ],
        rows.map((row) => ({
          ...pickRow(row, ['id', 'shift_no', 'opened_by_name', 'status', 'opened_at', 'closed_at', 'orders', 'amount', 'opening_cash', 'actual_cash', 'difference']),
          counter: str(row.counter_en),
          counter_bn: str(row.counter_bn),
          drawer: drawerState(row),
        })),
        'id',
        { defaultSort: { key: 'opened_at', direction: 'desc' }, searchKeys: ['shift_no', 'counter', 'counter_bn', 'opened_by_name'] },
      ),
      empty: rows.length === 0,
    };
  },
};

export const expensesReport: ReportDefinition = {
  id: 'expenses',
  group: 'operations',
  icon: ReceiptText,
  permission: 'reports.view',
  filters: ['search'],
  period: 'range',
  defaultPeriod: 'this_month',
  compare: true,
  emptyKey: 'reports.empty.expenses',
  async load(filter, options) {
    const [byCategory, breakdown, list] = await Promise.all([query('expensesByCategory', filter), query('expenseBreakdown', filter), detail(options, () => query('expenses', filter))]);
    const spent = sumOf(byCategory, 'amount');
    const counted = breakdown.filter((row) => row.status !== 'rejected');
    const pending = breakdown.filter((row) => row.status === 'pending');
    const paidFrom = totalsBy(counted, 'paid_from', 'amount');
    return {
      kpis: [
        kpi('spent', 'reports.kpi.spent', spent, 'money', ReceiptText, { tone: 'primary', invert: true, hint: say('reports.hint.expenses', { count: amount(sumOf(byCategory, 'count'), 'number') }) }),
        kpi('pending', 'reports.kpi.pending', sumOf(pending, 'amount'), 'money', Hourglass, {
          tone: 'warning',
          comparable: false,
          hint: say('reports.hint.expenses', { count: amount(sumOf(pending, 'count'), 'number') }),
        }),
        kpi('drawer', 'reports.kpi.drawerPaid', paidFrom.get('cash_drawer') ?? 0, 'money', Wallet, { tone: 'neutral', invert: true }),
        kpi('office', 'reports.kpi.officePaid', paidFrom.get('office') ?? 0, 'money', Store, { tone: 'neutral', invert: true }),
        kpi('avg', 'reports.kpi.avgPerDay', Math.round(spent / dayCount(rangeOf(filter))), 'money', CalendarDays, { tone: 'info', invert: true }),
      ],
      charts: [
        topBar(byCategory, {
          id: 'byCategory',
          titleKey: 'reports.chart.expensesByCategory',
          categoryKey: 'reports.col.category',
          valueKey: 'reports.col.amount',
          valueKind: 'money',
          span: 'half',
          label: (row) => nameLabel(row),
          value: (row) => num(row.amount),
          secondary: (row) => say('reports.hint.expenses', { count: amount(num(row.count), 'number') }),
        }),
        donutFixed(['cash_drawer', 'office'], paidFrom, (key) => enumLabel('paidFrom', key), {
          id: 'paidFrom',
          titleKey: 'reports.chart.paidFrom',
          categoryKey: 'reports.col.paidFrom',
          valueKey: 'reports.col.amount',
          valueKind: 'money',
          centerKey: 'reports.chart.total',
          span: 'half',
        }),
      ],
      table: table(
        [
          col('expense_no', 'reports.col.expenseNo', 'text', { mono: true }),
          col('expense_date', 'reports.col.date', 'date'),
          col('category', 'reports.col.category', 'text', { bnKey: 'category_bn' }),
          col('description', 'reports.col.description', 'text', { wrap: true }),
          col('paid_from', 'reports.col.paidFrom', 'text', { enumGroup: 'paidFrom' }),
          col('status', 'reports.col.status', 'text', { enumGroup: 'expenseStatus', tones: { pending: 'warning', approved: 'success', rejected: 'danger' } }),
          col('user_name', 'reports.col.recordedBy', 'text'),
          col('approved_by_name', 'reports.col.approvedBy', 'text', { hidden: true }),
          col('amount', 'reports.col.amount', 'money', { total: { sumOf: 'counted' } }),
        ],
        list.map((row) => ({
          ...pickRow(row, ['id', 'expense_no', 'expense_date', 'description', 'paid_from', 'status', 'user_name', 'approved_by_name', 'amount']),
          category: str(row.category_en),
          category_bn: str(row.category_bn),
          counted: row.status === 'rejected' ? 0 : num(row.amount),
        })),
        'id',
        {
          defaultSort: { key: 'expense_date', direction: 'desc' },
          searchKeys: ['expense_no', 'category', 'category_bn', 'description', 'user_name'],
          notice: say('reports.notice.rejectedExcluded'),
        },
      ),
      empty: sumOf(breakdown, 'count') === 0,
    };
  },
};

const PURCHASE_STATUSES = ['draft', 'ordered', 'partially_received', 'received', 'cancelled'] as const;

export const purchaseSummary: ReportDefinition = {
  id: 'purchase-summary',
  group: 'operations',
  icon: ShoppingCart,
  permission: 'reports.view',
  filters: ['supplier', 'search'],
  period: 'range',
  defaultPeriod: 'this_month',
  compare: true,
  emptyKey: 'reports.empty.purchases',
  landscape: true,
  async load(filter, options) {
    const [statuses, suppliers, list] = await Promise.all([
      query('purchaseStatusSummary', filter),
      detail(options, () => query('supplierPurchases', filter)),
      detail(options, () => query('purchases', filter)),
    ]);
    const active = statuses.filter((row) => row.status !== 'cancelled');
    const received = statuses.filter((row) => row.status === 'received' || row.status === 'partially_received');
    const cancelled = sumOf(
      statuses.filter((row) => row.status === 'cancelled'),
      'count',
    );
    return {
      kpis: [
        kpi('orders', 'reports.kpi.purchaseOrders', sumOf(active, 'count'), 'number', ClipboardList, { tone: 'info' }),
        kpi('value', 'reports.kpi.purchaseValue', sumOf(active, 'amount'), 'money', ShoppingCart, { tone: 'primary' }),
        kpi('received', 'reports.kpi.receivedValue', sumOf(received, 'amount'), 'money', PackageCheck, { tone: 'success' }),
        kpi('paid', 'reports.kpi.paid', sumOf(active, 'paid'), 'money', Wallet, { tone: 'neutral' }),
        kpi('due', 'reports.kpi.due', sumOf(active, 'due'), 'money', HandCoins, { tone: 'warning', invert: true }),
        kpi('cancelled', 'reports.kpi.cancelledOrders', cancelled, 'number', CircleX, { tone: 'neutral', invert: true }),
      ],
      charts: [
        donutFixed(PURCHASE_STATUSES, totalsBy(statuses, 'status', 'count'), (key) => enumLabel('purchaseStatus', key), {
          id: 'status',
          titleKey: 'reports.chart.ordersByStatus',
          categoryKey: 'reports.col.status',
          valueKey: 'reports.col.count',
          valueKind: 'number',
          centerKey: 'reports.chart.total',
          span: 'half',
        }),
        topBar(suppliers, {
          id: 'suppliers',
          titleKey: 'reports.chart.topSuppliers',
          categoryKey: 'reports.col.supplier',
          valueKey: 'reports.col.amount',
          valueKind: 'money',
          span: 'half',
          label: (row) => text(str(row.name)),
          value: (row) => num(row.amount),
          secondary: (row) => say('reports.hint.orders', { count: amount(num(row.orders), 'number') }),
        }),
      ],
      table: table(
        [
          col('po_no', 'reports.col.poNo', 'text', { mono: true }),
          col('order_date', 'reports.col.orderDate', 'date'),
          col('supplier_name', 'reports.col.supplier', 'text'),
          col('status', 'reports.col.status', 'text', {
            enumGroup: 'purchaseStatus',
            tones: { draft: 'neutral', ordered: 'info', partially_received: 'warning', received: 'success', cancelled: 'danger' },
          }),
          col('item_count', 'reports.col.items', 'number'),
          col('grand_total', 'reports.col.amount', 'money', { total: { sumOf: 'counted_total' } }),
          col('paid_amount', 'reports.col.paid', 'money', { total: { sumOf: 'counted_paid' } }),
          col('due', 'reports.col.due', 'money', { total: { sumOf: 'counted_due' } }),
          col('received_at', 'reports.col.receivedAt', 'datetime', { hidden: true }),
        ],
        list.map((row) => {
          const counts = row.status !== 'cancelled';
          return {
            ...pickRow(row, ['id', 'po_no', 'order_date', 'supplier_name', 'status', 'item_count', 'grand_total', 'paid_amount', 'due', 'received_at']),
            counted_total: counts ? num(row.grand_total) : 0,
            counted_paid: counts ? num(row.paid_amount) : 0,
            counted_due: counts ? num(row.due) : 0,
          };
        }),
        'id',
        {
          defaultSort: { key: 'order_date', direction: 'desc' },
          searchKeys: ['po_no', 'supplier_name'],
          notice: cancelled > 0 ? say('reports.notice.cancelledExcluded') : undefined,
        },
      ),
      empty: sumOf(statuses, 'count') === 0,
    };
  },
};
