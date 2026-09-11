import { BadgePercent, Banknote, Calculator, Coins, CreditCard, Landmark, Package, Percent, PiggyBank, Receipt, ReceiptText, Scale, ShoppingBag, Smartphone, Star, Tags, TrendingUp, Undo2, Wallet } from 'lucide-react';
import type { ReportRow } from '@/repositories/types';
import {
  amount,
  byKey,
  col,
  columnChart,
  dateLabel,
  daysOf,
  donutFixed,
  enumLabel,
  i18n,
  kpi,
  lineChart,
  nameLabel,
  num,
  pickRow,
  rangeOf,
  rateLabel,
  ratio,
  say,
  str,
  sumOf,
  topBar,
  totalsBy,
  whole,
  withShare,
} from '../builders';
import type { ReportDefinition, StatementLine } from '../types';
import { anyFilter, detail, detailRow, financialQuery, first, LIST_LIMITS, limitNotice, PAYMENT_ORDER, query, table } from './common';

/* ==========================================================================
   Finance & tax: payment methods (tendered − change = received), VAT per
   rate, discounts and the profit estimate.
   ========================================================================== */

const line = (key: string, labelKey: Parameters<typeof i18n>[0], value: number | undefined, role: StatementLine['role']): StatementLine => ({
  key,
  label: i18n(labelKey),
  value,
  kind: value === undefined ? undefined : 'money',
  role,
});

export const paymentMethods: ReportDefinition = {
  id: 'payment-methods',
  group: 'finance',
  icon: CreditCard,
  permission: 'reports.view',
  filters: ['cashier', 'counter', 'paymentMethod'],
  period: 'range',
  defaultPeriod: 'today',
  compare: true,
  emptyKey: 'reports.empty.payments',
  async load(filter, options) {
    const [rows, recon] = await Promise.all([
      query('paymentDetails', filter),
      filter.paymentMethod === 'all' ? detailRow(options, () => first('salesReconciliation', filter)) : Promise.resolve({} as ReportRow),
    ]);
    const byMethod = totalsBy(rows, 'method', 'amount');
    const tendered = sumOf(rows, 'tendered');
    const change = sumOf(rows, 'change_amount');
    const received = sumOf(rows, 'amount');
    const method = (key: string) => byMethod.get(key) ?? 0;
    const lines: StatementLine[] = [
      line('tendered', 'reports.statement.tendered', tendered, 'base'),
      line('change', 'reports.statement.change', change, 'subtract'),
      line('received', 'reports.statement.received', received, 'total'),
    ];
    if (recon.grand_total !== undefined) {
      lines.push(line('invoiced', 'reports.statement.invoicedCheck', num(recon.grand_total), 'info'), line('difference', 'reports.statement.difference', received - num(recon.grand_total), 'info'));
    }
    const payments = totalsBy(rows, 'method', 'payments');
    return {
      kpis: [
        kpi('received', 'reports.kpi.received', received, 'money', Wallet, { tone: 'primary' }),
        kpi('cash', 'reports.kpi.cash', method('cash'), 'money', Banknote, { tone: 'success' }),
        kpi('card', 'reports.kpi.card', method('card'), 'money', CreditCard, { tone: 'info' }),
        kpi('mobile', 'reports.kpi.mobile', method('mobile'), 'money', Smartphone, { tone: 'info' }),
        kpi('points', 'reports.kpi.points', method('points'), 'money', Star, { tone: 'warning' }),
        kpi('change', 'reports.kpi.change', change, 'money', Coins, { tone: 'neutral' }),
      ],
      statement: { titleKey: 'reports.statement.paymentsTitle', subtitle: say('reports.statement.paymentsSubtitle'), lines },
      charts: [
        donutFixed(PAYMENT_ORDER, byMethod, (key) => enumLabel('paymentMethod', key), {
          id: 'methods',
          titleKey: 'reports.chart.paymentMix',
          categoryKey: 'reports.col.method',
          valueKey: 'reports.col.received',
          valueKind: 'money',
          centerKey: 'reports.chart.received',
          span: 'half',
        }),
        topBar(
          rows.filter((row) => str(row.provider)),
          {
            id: 'providers',
            titleKey: 'reports.chart.byProvider',
            categoryKey: 'reports.col.provider',
            valueKey: 'reports.col.received',
            valueKind: 'money',
            span: 'half',
            label: (row) => enumLabel('provider', str(row.provider)),
            value: (row) => num(row.amount),
            secondary: (row) => say('reports.hint.name', { name: enumLabel('paymentMethod', str(row.method)) }),
          },
        ),
        columnChart({
          id: 'transactions',
          titleKey: 'reports.chart.transactionsByMethod',
          categoryKey: 'reports.col.method',
          valueKey: 'reports.col.transactions',
          valueKind: 'number',
          span: 'half',
          data: PAYMENT_ORDER.map((key) => ({ key, label: enumLabel('paymentMethod', key), value: payments.get(key) ?? 0 })),
        }),
      ],
      table: table(
        [
          col('method', 'reports.col.method', 'text', { enumGroup: 'paymentMethod' }),
          col('provider', 'reports.col.provider', 'text', { enumGroup: 'provider' }),
          col('payments', 'reports.col.transactions', 'number', { total: 'sum' }),
          col('count', 'reports.col.orders', 'number', { hidden: true }),
          col('tendered', 'reports.col.tendered', 'money', { total: 'sum' }),
          col('change_amount', 'reports.col.change', 'money', { total: 'sum' }),
          col('amount', 'reports.col.received', 'money', { total: 'sum' }),
          col('share', 'reports.col.share', 'percent', { total: 'sum' }),
        ],
        withShare(
          rows.map((row) => ({ ...pickRow(row, ['method', 'payments', 'count', 'tendered', 'change_amount', 'amount']), id: `${str(row.method)}:${str(row.provider)}`, provider: str(row.provider) || null })),
          'amount',
        ),
        'id',
        { defaultSort: { key: 'amount', direction: 'desc' } },
      ),
      empty: rows.length === 0,
    };
  },
};

export const vatReport: ReportDefinition = {
  id: 'vat',
  group: 'finance',
  icon: Landmark,
  permission: 'reports.view',
  filters: ['category', 'brand', 'cashier', 'counter'],
  period: 'range',
  defaultPeriod: 'this_month',
  compare: true,
  emptyKey: 'reports.empty.vat',
  async load(filter) {
    const [rates, impact] = await Promise.all([query('vatByRate', filter), first('returnsImpact', filter)]);
    const tax = sumOf(rates, 'tax');
    const taxable = sumOf(rates, 'taxable');
    const refundTax = num(impact.tax);
    const exempt = sumOf(
      rates.filter((row) => num(row.rate) === 0),
      'gross',
    );
    return {
      kpis: [
        kpi('vat', 'reports.kpi.vat', tax, 'money', Landmark, { tone: 'primary' }),
        kpi('taxable', 'reports.kpi.taxableSales', taxable, 'money', Receipt, { tone: 'info', hint: say('reports.hint.exclVat') }),
        kpi('exempt', 'reports.kpi.exemptSales', exempt, 'money', Tags, { tone: 'neutral' }),
        kpi('rate', 'reports.kpi.effectiveRate', ratio(tax, taxable), 'percent', Percent, { tone: 'neutral', hint: say('reports.hint.effectiveRate') }),
        kpi('returns', 'reports.kpi.vatOnReturns', refundTax, 'money', Undo2, { tone: 'warning', invert: true }),
        kpi('net', 'reports.kpi.netVat', tax - refundTax, 'money', Scale, { tone: 'success' }),
      ],
      statement: {
        titleKey: 'reports.statement.vatTitle',
        subtitle: say('reports.statement.vatSubtitle'),
        lines: [
          line('sales', 'reports.statement.vatOnSales', tax, 'base'),
          line('returns', 'reports.statement.vatOnReturns', refundTax, 'subtract'),
          line('net', 'reports.statement.netVat', tax - refundTax, 'total'),
          line('taxable', 'reports.statement.taxable', taxable, 'info'),
          line('gross', 'reports.statement.grossInclVat', sumOf(rates, 'gross'), 'info'),
        ],
      },
      charts: [
        donutFixed(
          rates.map((row) => String(num(row.rate))),
          totalsBy(rates, 'rate', 'gross'),
          (key) => rateLabel(Number(key)),
          { id: 'salesByRate', titleKey: 'reports.chart.salesByRate', categoryKey: 'reports.col.rate', valueKey: 'reports.col.gross', valueKind: 'money', centerKey: 'reports.chart.total', span: 'half' },
        ),
        columnChart({
          id: 'vatByRate',
          titleKey: 'reports.chart.vatByRate',
          categoryKey: 'reports.col.rate',
          valueKey: 'reports.col.vat',
          valueKind: 'money',
          span: 'full',
          data: rates.map((row) => ({ key: String(num(row.rate)), label: rateLabel(num(row.rate)), value: num(row.tax) })),
        }),
      ],
      table: table(
        [
          col('rate', 'reports.col.rate', 'number', { display: 'rate', align: 'start' }),
          col('lines', 'reports.col.lines', 'number', { total: 'sum' }),
          col('orders', 'reports.col.orders', 'number', { hidden: true }),
          col('taxable', 'reports.col.taxable', 'money', { total: 'sum' }),
          col('tax', 'reports.col.vat', 'money', { total: 'sum' }),
          col('gross', 'reports.col.gross', 'money', { total: 'sum' }),
          col('share', 'reports.col.share', 'percent', { total: 'sum' }),
        ],
        withShare(
          rates.map((row) => ({ ...pickRow(row, ['rate', 'lines', 'orders', 'taxable', 'tax', 'gross']), id: String(num(row.rate)) })),
          'tax',
        ),
        'id',
        { defaultSort: { key: 'rate', direction: 'asc' } },
      ),
      empty: rates.length === 0,
    };
  },
};

const DISCOUNT_KEYS = [
  'id',
  'invoice_no',
  'created_at',
  'cashier_name',
  'customer_name',
  'subtotal',
  'item_discount_total',
  'order_discount_total',
  'discount_total',
  'discount_reason',
  'discount_approved_by',
  'grand_total',
] as const;

export const discountsReport: ReportDefinition = {
  id: 'discounts',
  group: 'finance',
  icon: BadgePercent,
  permission: 'reports.view',
  filters: ['cashier', 'counter', 'search'],
  period: 'range',
  defaultPeriod: 'this_month',
  compare: true,
  emptyKey: 'reports.empty.discounts',
  landscape: true,
  async load(filter, options) {
    const [recon, byDay, cashiers, list] = await Promise.all([
      first('salesReconciliation', filter),
      query('salesByDay', filter),
      detail(options, () => query('cashierSales', filter)),
      detail(options, () => query('discounts', filter)),
    ]);
    const discount = num(recon.discount);
    const discounted = num(recon.discounted_orders);
    const perDay = byKey(byDay);
    return {
      kpis: [
        kpi('discount', 'reports.kpi.discounts', discount, 'money', BadgePercent, {
          tone: 'success',
          invert: true,
          hint: say('reports.hint.discountedOrders', { count: amount(discounted, 'number') }),
        }),
        kpi('item', 'reports.kpi.itemDiscounts', num(recon.item_discount), 'money', Tags, { tone: 'neutral', invert: true }),
        kpi('order', 'reports.kpi.orderDiscounts', num(recon.order_discount), 'money', Receipt, { tone: 'neutral', invert: true }),
        kpi('orders', 'reports.kpi.discountedOrders', discounted, 'number', ShoppingBag, {
          tone: 'info',
          hint: say('reports.hint.ofOrders', { value: amount(ratio(discounted, num(recon.orders)), 'percent') }),
        }),
        kpi('rate', 'reports.kpi.discountRate', ratio(discount, num(recon.subtotal)), 'percent', Percent, { tone: 'warning', invert: true }),
        kpi('avg', 'reports.kpi.avgDiscount', discounted > 0 ? Math.round(discount / discounted) : 0, 'money', Calculator, { tone: 'neutral' }),
      ],
      charts: [
        columnChart({
          id: 'byDay',
          titleKey: 'reports.chart.discountsByDay',
          categoryKey: 'reports.col.date',
          valueKey: 'reports.col.discount',
          valueKind: 'money',
          span: 'half',
          data: daysOf(rangeOf(filter)).map((key) => ({ key, label: dateLabel(key), value: num(perDay.get(key)?.discount) })),
        }),
        topBar(cashiers, {
          id: 'byCashier',
          titleKey: 'reports.chart.discountsByCashier',
          categoryKey: 'reports.col.cashier',
          valueKey: 'reports.col.discount',
          valueKind: 'money',
          span: 'half',
          label: (row) => nameLabel(row),
          value: (row) => num(row.discount),
        }),
      ],
      table: table(
        [
          col('invoice_no', 'reports.col.invoice', 'text', { mono: true }),
          col('created_at', 'reports.col.dateTime', 'datetime'),
          col('cashier_name', 'reports.col.cashier', 'text'),
          col('customer_name', 'reports.col.customer', 'text', { fallbackKey: 'common.labels.walkIn' }),
          col('subtotal', 'reports.col.subtotal', 'money', { total: 'sum', hidden: true }),
          col('item_discount_total', 'reports.col.itemDiscount', 'money', { total: 'sum' }),
          col('order_discount_total', 'reports.col.orderDiscount', 'money', { total: 'sum' }),
          col('discount_total', 'reports.col.discount', 'money', { total: 'sum' }),
          col('rate', 'reports.col.discountRate', 'percent', { total: { ratio: ['discount_total', 'subtotal'] } }),
          col('discount_reason', 'reports.col.reason', 'text', { wrap: true }),
          col('discount_approved_by', 'reports.col.approvedBy', 'text', { hidden: true }),
          col('grand_total', 'reports.col.sales', 'money', { total: 'sum' }),
        ],
        list.map((row) => ({ ...pickRow(row, DISCOUNT_KEYS), customer_name: str(row.customer_name) || null, rate: ratio(num(row.discount_total), num(row.subtotal)) })),
        'id',
        {
          defaultSort: { key: 'discount_total', direction: 'desc' },
          searchKeys: ['invoice_no', 'cashier_name', 'customer_name', 'discount_reason'],
          notice: limitNotice(list.length, LIST_LIMITS.discounts),
        },
      ),
      empty: discount === 0,
    };
  },
};

export const profitEstimate: ReportDefinition = {
  id: 'profit-estimate',
  group: 'finance',
  icon: PiggyBank,
  permission: 'reports.financial',
  filters: ['category', 'brand', 'cashier', 'counter'],
  period: 'range',
  defaultPeriod: 'this_month',
  compare: true,
  emptyKey: 'reports.empty.profit',
  async load(filter) {
    const withExpenses = !anyFilter(filter);
    const [byCategory, byDay, impact, expenses] = await Promise.all([
      financialQuery('profitByCategory', filter),
      financialQuery('profitByDay', filter),
      first('returnsImpact', filter, undefined, true),
      withExpenses ? financialQuery('expensesByCategory', filter) : Promise.resolve([] as ReportRow[]),
    ]);
    const revenue = sumOf(byCategory, 'revenue');
    const cost = whole(sumOf(byCategory, 'cost'));
    const gross = revenue - cost;
    const returnsExVat = num(impact.refund) - num(impact.tax);
    const returnedCost = num(impact.cost);
    const afterReturns = gross - returnsExVat + returnedCost;
    const spent = sumOf(expenses, 'amount');
    const net = afterReturns - spent;
    const days = daysOf(rangeOf(filter));
    const perDay = byKey(byDay);
    const data = byCategory.map((row) => {
      const categoryCost = whole(row.cost);
      const profit = num(row.revenue) - categoryCost;
      return { id: str(row.id), name: str(row.name_en), name_bn: str(row.name_bn), quantity: num(row.quantity), revenue: num(row.revenue), cost: categoryCost, profit, margin: ratio(profit, num(row.revenue)) };
    });
    return {
      kpis: [
        kpi('revenue', 'reports.kpi.revenue', revenue, 'money', TrendingUp, { tone: 'info', hint: say('reports.hint.exclVat') }),
        kpi('cogs', 'reports.kpi.cogs', cost, 'money', Package, { tone: 'neutral' }),
        kpi('gross', 'reports.kpi.grossProfit', gross, 'money', PiggyBank, { tone: 'success', hint: say('reports.hint.margin', { value: amount(ratio(gross, revenue), 'percent') }) }),
        kpi('returns', 'reports.kpi.returnsImpact', returnsExVat - returnedCost, 'money', Undo2, { tone: 'warning', invert: true }),
        kpi('expenses', 'reports.kpi.expenses', spent, 'money', ReceiptText, { tone: 'warning', invert: true, hint: withExpenses ? undefined : say('reports.hint.notFiltered') }),
        kpi('net', 'reports.kpi.netProfit', net, 'money', Wallet, { tone: 'primary' }),
      ],
      statement: {
        titleKey: 'reports.statement.profitTitle',
        subtitle: say('reports.statement.profitSubtitle'),
        lines: [
          line('revenue', 'reports.statement.revenue', revenue, 'base'),
          line('cogs', 'reports.statement.cogs', cost, 'subtract'),
          line('gross', 'reports.statement.grossProfit', gross, 'total'),
          line('returns', 'reports.statement.returnsExVat', returnsExVat, 'subtract'),
          line('returnedCost', 'reports.statement.returnedCost', returnedCost, 'add'),
          line('afterReturns', 'reports.statement.afterReturns', afterReturns, 'total'),
          withExpenses ? line('expenses', 'reports.statement.expenses', spent, 'subtract') : line('expenses', 'reports.statement.expensesFiltered', undefined, 'info'),
          line('net', 'reports.statement.netProfit', net, 'total'),
        ],
      },
      charts: [
        topBar(data, {
          id: 'byCategory',
          titleKey: 'reports.chart.profitByCategory',
          categoryKey: 'reports.col.category',
          valueKey: 'reports.col.profit',
          valueKind: 'money',
          span: 'half',
          limit: 12,
          label: (row) => nameLabel(row, 'name', 'name_bn'),
          value: (row) => num(row.profit),
          secondary: (row) => say('reports.hint.margin', { value: amount(num(row.margin), 'percent') }),
        }),
        lineChart({
          id: 'byDay',
          titleKey: 'reports.chart.profitByDay',
          categoryKey: 'reports.col.date',
          valueKey: 'reports.col.profit',
          valueKind: 'money',
          span: 'full',
          points: days.map(dateLabel),
          series: [{ key: 'profit', labelKey: 'reports.col.profit', values: days.map((key) => num(perDay.get(key)?.revenue) - num(perDay.get(key)?.cost)) }],
          compare: true,
        }),
      ],
      table: table(
        [
          col('name', 'reports.col.category', 'text', { bnKey: 'name_bn' }),
          col('quantity', 'reports.col.quantity', 'quantity', { total: 'sum' }),
          col('revenue', 'reports.col.revenue', 'money', { total: 'sum' }),
          col('cost', 'reports.col.cost', 'money', { total: 'sum' }),
          col('profit', 'reports.col.profit', 'money', { total: 'sum', signTone: true }),
          col('margin', 'reports.col.margin', 'percent', { total: { ratio: ['profit', 'revenue'] } }),
          col('share', 'reports.col.share', 'percent', { total: 'sum' }),
        ],
        withShare(data, 'profit'),
        'id',
        { defaultSort: { key: 'profit', direction: 'desc' }, searchKeys: ['name', 'name_bn'] },
      ),
      empty: revenue === 0 && cost === 0,
    };
  },
};
