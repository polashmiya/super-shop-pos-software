import { BadgePercent, Crown, Gauge, Layers, LayoutGrid, Medal, Package, PackageMinus, PiggyBank, ShoppingBag, Tags, Trophy, TrendingUp } from 'lucide-react';
import type { ReportRow } from '@/repositories/types';
import { amount, bestOf, col, donutTop, i18n, kpi, lineChart, nameLabel, num, numberLabel, ratio, say, str, sumOf, topBar, when, whole, withShare } from '../builders';
import type { Label, LoadOptions, ReportColumnDef, ReportDefinition, ReportKpi, ReportRowData, ValueKind } from '../types';
import { LIST_LIMITS, limitNotice, query, table } from './common';

/* ==========================================================================
   Item-level sales: products, categories, brands and the top sellers.
   Amounts are line totals (VAT included, after discounts); profit uses
   revenue excluding VAT minus the cost recorded on each sale line.
   ========================================================================== */

interface Ranking {
  byQuantity: boolean;
  value: (row: ReportRow) => number;
  valueKey: 'reports.col.quantity' | 'reports.col.sales';
  valueKind: ValueKind;
}

function ranking(options: LoadOptions): Ranking {
  const byQuantity = options.extra.rankBy === 'quantity';
  return {
    byQuantity,
    value: (row) => num(byQuantity ? row.quantity : row.amount),
    valueKey: byQuantity ? 'reports.col.quantity' : 'reports.col.sales',
    valueKind: byQuantity ? 'quantity' : 'money',
  };
}

/** Financial fields of a sales row: revenue excl. VAT, cost, gross profit and margin. */
function profitFields(row: ReportRow, financial: boolean): ReportRowData {
  if (!financial) return {};
  const revenue = num(row.amount) - num(row.tax);
  const cost = whole(row.cost);
  return { revenue, cost, profit: revenue - cost, margin: revenue !== 0 ? (revenue - cost) / revenue : 0 };
}

function profitColumns(financial: boolean): ReportColumnDef[] {
  return when(
    financial,
    col('cost', 'reports.col.cost', 'money', { total: 'sum', hidden: true }),
    col('profit', 'reports.col.profit', 'money', { total: 'sum' }),
    col('margin', 'reports.col.margin', 'percent', { total: { ratio: ['profit', 'revenue'] } }),
  );
}

function profitKpi(rows: readonly ReportRow[], financial: boolean): ReportKpi[] {
  const revenue = sumOf(rows, 'amount') - sumOf(rows, 'tax');
  const profit = revenue - whole(sumOf(rows, 'cost'));
  return when(financial, kpi('profit', 'reports.kpi.grossProfit', profit, 'money', PiggyBank, { tone: 'success', hint: say('reports.hint.margin', { value: amount(ratio(profit, revenue), 'percent') }) }));
}

/** "Units" for a sales ranking, "sales" for a units ranking. */
function secondaryOf(rank: Ranking) {
  return (row: ReportRow) =>
    rank.byQuantity ? say('reports.hint.name', { name: amount(num(row.amount), 'money') }) : say('reports.hint.units', { qty: amount(num(row.quantity), 'quantity') });
}

const sortBy = (rank: Ranking) => ({ key: rank.byQuantity ? 'quantity' : 'amount', direction: 'desc' as const });

export const productSales: ReportDefinition = {
  id: 'product-sales',
  group: 'sales',
  icon: Package,
  permission: 'reports.view',
  filters: ['category', 'brand', 'cashier', 'counter', 'rankBy', 'search'],
  period: 'range',
  defaultPeriod: 'this_month',
  compare: false,
  emptyKey: 'reports.empty.products',
  landscape: true,
  async load(filter, options) {
    const rank = ranking(options);
    const financial = options.canFinancial;
    const rows = await query('productSales', filter, { limit: LIST_LIMITS.products });
    const data = rows.map((row) => ({
      id: str(row.id),
      sku: str(row.sku),
      name: str(row.name_en),
      name_bn: str(row.name_bn),
      quantity: num(row.quantity),
      returned: num(row.returned),
      orders: num(row.orders),
      discount: num(row.discount),
      tax: num(row.tax),
      amount: num(row.amount),
      ...profitFields(row, financial),
    }));
    return {
      kpis: [
        kpi('products', 'reports.kpi.productsSold', rows.length, 'number', Package, { tone: 'info' }),
        kpi('units', 'reports.kpi.unitsSold', sumOf(rows, 'quantity'), 'quantity', ShoppingBag, { tone: 'neutral' }),
        kpi('sales', 'reports.kpi.itemSales', sumOf(rows, 'amount'), 'money', TrendingUp, { tone: 'primary', hint: say('reports.hint.inclVat') }),
        kpi('discount', 'reports.kpi.discounts', sumOf(rows, 'discount'), 'money', BadgePercent, { tone: 'success', invert: true }),
        ...profitKpi(rows, financial),
        kpi('returned', 'reports.kpi.unitsReturned', sumOf(rows, 'returned'), 'quantity', PackageMinus, { tone: 'warning', invert: true }),
      ],
      charts: [
        topBar(rows, {
          id: 'top',
          titleKey: 'reports.chart.topProducts',
          categoryKey: 'reports.col.product',
          valueKey: rank.valueKey,
          valueKind: rank.valueKind,
          span: 'half',
          label: (row) => nameLabel(row),
          value: rank.value,
          secondary: secondaryOf(rank),
        }),
        topBar(rows, {
          id: 'returned',
          titleKey: 'reports.chart.mostReturned',
          categoryKey: 'reports.col.product',
          valueKey: 'reports.col.quantity',
          valueKind: 'quantity',
          span: 'half',
          label: (row) => nameLabel(row),
          value: (row) => num(row.returned),
        }),
      ],
      table: table(
        [
          col('sku', 'reports.col.sku', 'text', { mono: true }),
          col('name', 'reports.col.product', 'text', { bnKey: 'name_bn' }),
          col('quantity', 'reports.col.quantity', 'quantity', { total: 'sum' }),
          col('returned', 'reports.kpi.unitsReturned', 'quantity', { total: 'sum', hidden: true }),
          col('orders', 'reports.col.orders', 'number', { total: 'sum' }),
          col('discount', 'reports.col.discount', 'money', { total: 'sum', hidden: true }),
          col('tax', 'reports.col.vat', 'money', { total: 'sum', hidden: true }),
          col('amount', 'reports.col.sales', 'money', { total: 'sum' }),
          col('share', 'reports.col.share', 'percent', { total: 'sum' }),
          ...profitColumns(financial),
        ],
        withShare(data, 'amount'),
        'id',
        { defaultSort: sortBy(rank), searchKeys: ['sku', 'name', 'name_bn'], notice: limitNotice(rows.length, LIST_LIMITS.products) },
      ),
      empty: rows.length === 0,
    };
  },
};

/** Category or brand ranking (same shape: id, names, amount, quantity, orders, tax, cost). */
function groupRows(rows: readonly ReportRow[], financial: boolean, extra: (row: ReportRow) => ReportRowData = () => ({})): ReportRowData[] {
  const data = rows.map((row) => ({
    id: str(row.id) || '__none',
    name: str(row.name_en) || null,
    name_bn: str(row.name_bn) || null,
    ...extra(row),
    orders: num(row.orders),
    quantity: num(row.quantity),
    amount: num(row.amount),
    tax: num(row.tax),
    ...profitFields(row, financial),
  }));
  return withShare(data, 'amount');
}

function topKpi(id: string, labelKey: 'reports.kpi.topCategory' | 'reports.kpi.topBrand', rows: readonly ReportRow[], label: (row: ReportRow) => Label): ReportKpi {
  const top = bestOf(rows, (row) => num(row.amount));
  const total = sumOf(rows, 'amount');
  return kpi(id, labelKey, num(top?.amount), 'money', Crown, {
    tone: 'warning',
    comparable: false,
    hint: top ? say('reports.hint.nameShare', { name: label(top), share: amount(ratio(num(top.amount), total), 'percent') }) : undefined,
  });
}

export const categorySales: ReportDefinition = {
  id: 'category-sales',
  group: 'sales',
  icon: LayoutGrid,
  permission: 'reports.view',
  filters: ['brand', 'cashier', 'counter', 'rankBy'],
  period: 'range',
  defaultPeriod: 'this_month',
  compare: true,
  emptyKey: 'reports.empty.products',
  async load(filter, options) {
    const rank = ranking(options);
    const financial = options.canFinancial;
    const rows = await query('categorySales', filter);
    const label = (row: ReportRow) => nameLabel(row);
    return {
      kpis: [
        kpi('categories', 'reports.kpi.categories', rows.length, 'number', LayoutGrid, { tone: 'info' }),
        kpi('sales', 'reports.kpi.itemSales', sumOf(rows, 'amount'), 'money', TrendingUp, { tone: 'primary', hint: say('reports.hint.inclVat') }),
        kpi('units', 'reports.kpi.unitsSold', sumOf(rows, 'quantity'), 'quantity', ShoppingBag, { tone: 'neutral' }),
        topKpi('top', 'reports.kpi.topCategory', rows, label),
        ...profitKpi(rows, financial),
      ],
      charts: [
        donutTop(
          rows.map((row) => ({ key: str(row.id), label: label(row), value: rank.value(row) })),
          { id: 'share', titleKey: 'reports.chart.categoryShare', categoryKey: 'reports.col.category', valueKey: rank.valueKey, valueKind: rank.valueKind, centerKey: 'reports.chart.total', span: 'half' },
        ),
        topBar(rows, {
          id: 'ranking',
          titleKey: 'reports.chart.categoryRanking',
          categoryKey: 'reports.col.category',
          valueKey: rank.valueKey,
          valueKind: rank.valueKind,
          span: 'half',
          limit: 12,
          label,
          value: rank.value,
          secondary: secondaryOf(rank),
        }),
      ],
      table: table(
        [
          col('name', 'reports.col.category', 'text', { bnKey: 'name_bn' }),
          col('orders', 'reports.col.orders', 'number', { total: 'sum' }),
          col('quantity', 'reports.col.quantity', 'quantity', { total: 'sum' }),
          col('tax', 'reports.col.vat', 'money', { total: 'sum', hidden: true }),
          col('amount', 'reports.col.sales', 'money', { total: 'sum' }),
          col('share', 'reports.col.share', 'percent', { total: 'sum' }),
          ...profitColumns(financial),
        ],
        groupRows(rows, financial),
        'id',
        { defaultSort: sortBy(rank), searchKeys: ['name', 'name_bn'] },
      ),
      empty: rows.length === 0,
    };
  },
};

export const brandSales: ReportDefinition = {
  id: 'brand-sales',
  group: 'sales',
  icon: Tags,
  permission: 'reports.view',
  filters: ['category', 'cashier', 'counter', 'rankBy'],
  period: 'range',
  defaultPeriod: 'this_month',
  compare: true,
  emptyKey: 'reports.empty.products',
  async load(filter, options) {
    const rank = ranking(options);
    const financial = options.canFinancial;
    const rows = await query('brandSalesDetail', filter);
    const label = (row: ReportRow): Label => (str(row.id) ? nameLabel(row) : i18n('reports.labels.noBrand'));
    return {
      kpis: [
        kpi('brands', 'reports.kpi.brands', rows.filter((row) => str(row.id)).length, 'number', Tags, { tone: 'info' }),
        kpi('sales', 'reports.kpi.itemSales', sumOf(rows, 'amount'), 'money', TrendingUp, { tone: 'primary', hint: say('reports.hint.inclVat') }),
        kpi('units', 'reports.kpi.unitsSold', sumOf(rows, 'quantity'), 'quantity', ShoppingBag, { tone: 'neutral' }),
        topKpi('top', 'reports.kpi.topBrand', rows, label),
        ...profitKpi(rows, financial),
      ],
      charts: [
        topBar(rows, {
          id: 'ranking',
          titleKey: 'reports.chart.brandRanking',
          categoryKey: 'reports.col.brand',
          valueKey: rank.valueKey,
          valueKind: rank.valueKind,
          span: 'half',
          label,
          value: rank.value,
          secondary: secondaryOf(rank),
        }),
        donutTop(
          rows.map((row) => ({ key: str(row.id) || '__none', label: label(row), value: rank.value(row) })),
          { id: 'share', titleKey: 'reports.chart.brandShare', categoryKey: 'reports.col.brand', valueKey: rank.valueKey, valueKind: rank.valueKind, centerKey: 'reports.chart.total', span: 'half' },
        ),
      ],
      table: table(
        [
          col('name', 'reports.col.brand', 'text', { bnKey: 'name_bn', fallbackKey: 'reports.labels.noBrand' }),
          col('products', 'reports.col.products', 'number'),
          col('orders', 'reports.col.orders', 'number', { total: 'sum' }),
          col('quantity', 'reports.col.quantity', 'quantity', { total: 'sum' }),
          col('amount', 'reports.col.sales', 'money', { total: 'sum' }),
          col('share', 'reports.col.share', 'percent', { total: 'sum' }),
          ...profitColumns(financial),
        ],
        groupRows(rows, financial, (row) => ({ products: num(row.products) })),
        'id',
        { defaultSort: sortBy(rank), searchKeys: ['name', 'name_bn'] },
      ),
      empty: rows.length === 0,
    };
  },
};

const TOP_COUNT = 50;

export const topProducts: ReportDefinition = {
  id: 'top-products',
  group: 'sales',
  icon: Trophy,
  permission: 'reports.view',
  filters: ['category', 'brand', 'rankBy'],
  period: 'range',
  defaultPeriod: 'this_month',
  compare: false,
  emptyKey: 'reports.empty.products',
  async load(filter, options) {
    const rank = ranking(options);
    const rows = await query('productSales', filter, { limit: LIST_LIMITS.products });
    const sorted = [...rows].sort((a, b) => rank.value(b) - rank.value(a));
    const total = sorted.reduce((sum, row) => sum + rank.value(row), 0);
    const shareOf = (count: number) => ratio(sorted.slice(0, count).reduce((sum, row) => sum + rank.value(row), 0), total);
    let running = 0;
    let pareto = 0;
    for (const row of sorted) {
      if (total <= 0 || running >= total * 0.8) break;
      running += rank.value(row);
      pareto += 1;
    }
    let cumulative = 0;
    const top = sorted.slice(0, TOP_COUNT).map((row, index) => {
      cumulative += rank.value(row);
      return {
        rank: index + 1,
        id: str(row.id),
        sku: str(row.sku),
        name: str(row.name_en),
        name_bn: str(row.name_bn),
        quantity: num(row.quantity),
        amount: num(row.amount),
        orders: num(row.orders),
        share: ratio(rank.value(row), total),
        cumulative: ratio(cumulative, total),
      };
    });
    const best = sorted[0];
    return {
      kpis: [
        kpi('best', 'reports.kpi.bestSeller', best ? rank.value(best) : 0, rank.valueKind, Trophy, { tone: 'warning', hint: best ? say('reports.hint.name', { name: nameLabel(best) }) : undefined }),
        kpi('top10', 'reports.kpi.top10Share', shareOf(10), 'percent', Medal, { tone: 'primary' }),
        kpi('top20', 'reports.kpi.top20Share', shareOf(20), 'percent', Layers, { tone: 'info' }),
        kpi('pareto', 'reports.kpi.paretoProducts', pareto, 'number', Gauge, { tone: 'neutral', hint: say('reports.hint.ofProducts', { count: amount(rows.length, 'number') }) }),
      ],
      charts: [
        topBar(sorted, {
          id: 'top',
          titleKey: 'reports.chart.topProducts',
          categoryKey: 'reports.col.product',
          valueKey: rank.valueKey,
          valueKind: rank.valueKind,
          span: 'half',
          label: (row) => nameLabel(row),
          value: rank.value,
          secondary: secondaryOf(rank),
        }),
        lineChart({
          id: 'pareto',
          titleKey: 'reports.chart.cumulativeShare',
          subtitle: say('reports.chart.cumulativeSubtitle'),
          categoryKey: 'reports.col.rank',
          valueKey: 'reports.col.cumulative',
          valueKind: 'percent',
          span: 'half',
          points: top.map((row) => numberLabel(row.rank)),
          series: [{ key: 'cumulative', labelKey: 'reports.col.cumulative', values: top.map((row) => row.cumulative) }],
        }),
      ],
      table: table(
        [
          col('rank', 'reports.col.rank', 'number'),
          col('sku', 'reports.col.sku', 'text', { mono: true }),
          col('name', 'reports.col.product', 'text', { bnKey: 'name_bn' }),
          col('quantity', 'reports.col.quantity', 'quantity', { total: 'sum' }),
          col('amount', 'reports.col.sales', 'money', { total: 'sum' }),
          col('orders', 'reports.col.orders', 'number', { hidden: true }),
          col('share', 'reports.col.share', 'percent', { total: 'sum' }),
          col('cumulative', 'reports.col.cumulative', 'percent'),
        ],
        top,
        'id',
        { defaultSort: { key: 'rank', direction: 'asc' }, searchKeys: ['sku', 'name', 'name_bn'], notice: say('reports.notice.topCount', { count: amount(TOP_COUNT, 'number') }) },
      ),
      empty: rows.length === 0,
    };
  },
};
