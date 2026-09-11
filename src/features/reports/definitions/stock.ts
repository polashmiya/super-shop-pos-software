import { ArrowDownToLine, ArrowLeftRight, ArrowUpFromLine, Boxes, Coins, History, Package, PackagePlus, PackageX, PiggyBank, Scale, Snail, Tags, TriangleAlert, Truck, Warehouse } from 'lucide-react';
import type { ReportRow } from '@/repositories/types';
import { amount, byKey, col, dateLabel, daysOf, donutFixed, donutTop, enumLabel, groupBy, kpi, lineChart, nameLabel, num, pickRow, rangeOf, ratio, say, str, sumOf, topBar, when, whole, withShare } from '../builders';
import type { BarChartSpec, ReportDefinition, ReportKpi, ReportRowData } from '../types';
import { daysSince, detail, financialQuery, LIST_LIMITS, limitNotice, query, table } from './common';

/* ==========================================================================
   Products & inventory: stock on hand, valuation, the stock ledger,
   reordering (low / out of stock) and slow movers.
   ========================================================================== */

const PRODUCT_SEARCH = ['sku', 'name', 'name_bn', 'category', 'category_bn'];

function productBase(row: ReportRow): ReportRowData {
  return {
    id: str(row.id),
    sku: str(row.sku),
    name: str(row.name_en),
    name_bn: str(row.name_bn),
    category: str(row.category_en),
    category_bn: str(row.category_bn),
  };
}

const productColumns = [
  col('sku', 'reports.col.sku', 'text', { mono: true }),
  col('name', 'reports.col.product', 'text', { bnKey: 'name_bn' }),
  col('category', 'reports.col.category', 'text', { bnKey: 'category_bn' }),
];

/** Count of listed products per category and per supplier (lists are a few hundred rows at most). */
function reorderCharts(rows: readonly ReportRow[]): BarChartSpec[] {
  return [
    topBar(groupBy(rows, 'category_en', { en: 'category_en', bn: 'category_bn' }), {
      id: 'byCategory',
      titleKey: 'reports.chart.byCategory',
      categoryKey: 'reports.col.category',
      valueKey: 'reports.col.products',
      valueKind: 'number',
      span: 'half',
      label: (row) => nameLabel(row),
      value: (row) => num(row.count),
    }),
    topBar(groupBy(rows, 'supplier', { en: 'supplier', bn: 'supplier' }), {
      id: 'bySupplier',
      titleKey: 'reports.chart.bySupplier',
      categoryKey: 'reports.col.supplier',
      valueKey: 'reports.col.products',
      valueKind: 'number',
      span: 'half',
      label: (row) => nameLabel(row),
      value: (row) => num(row.count),
    }),
  ];
}

function reorderKpis(rows: readonly ReportRow[], financial: boolean): ReportKpi[] {
  const cost = rows.reduce((total, row) => total + Math.round(num(row.reorder) * num(row.cost)), 0);
  const suppliers = new Set(rows.map((row) => str(row.supplier)).filter(Boolean)).size;
  return [
    kpi('reorder', 'reports.kpi.toReorder', sumOf(rows, 'reorder'), 'quantity', PackagePlus, { tone: 'info' }),
    ...when(financial, kpi('reorderCost', 'reports.kpi.reorderCost', cost, 'money', Coins, { tone: 'neutral', hint: say('reports.hint.atCost') })),
    kpi('suppliers', 'reports.kpi.suppliersAffected', suppliers, 'number', Truck, { tone: 'neutral' }),
  ];
}

function reorderFields(row: ReportRow, financial: boolean): ReportRowData {
  return {
    supplier: str(row.supplier) || null,
    stock: num(row.stock),
    min_stock: num(row.min_stock),
    max_stock: num(row.max_stock),
    reorder: num(row.reorder),
    ...(financial ? { reorder_cost: Math.round(num(row.reorder) * num(row.cost)) } : {}),
    last_sale_at: str(row.last_sale_at) || null,
    last_movement_at: str(row.last_movement_at) || null,
  };
}

export const inventorySummary: ReportDefinition = {
  id: 'inventory-summary',
  group: 'products',
  icon: Warehouse,
  permission: 'reports.view',
  filters: ['category', 'brand', 'supplier'],
  period: 'snapshot',
  defaultPeriod: 'today',
  compare: false,
  emptyKey: 'reports.empty.stock',
  async load(filter, options) {
    const financial = options.canFinancial;
    const rows = await query('inventoryByCategory', filter);
    const products = sumOf(rows, 'products');
    const low = sumOf(rows, 'low');
    const out = sumOf(rows, 'out_of_stock');
    const health = new Map([
      ['ok', products - low - out],
      ['low', low],
      ['out', out],
    ]);
    const data = rows.map((row) => {
      const retail = whole(row.retail);
      const value = whole(row.value);
      return {
        id: str(row.id),
        name: str(row.name_en),
        name_bn: str(row.name_bn),
        products: num(row.products),
        quantity: num(row.quantity),
        low: num(row.low),
        out: num(row.out_of_stock),
        retail,
        ...(financial ? { value, margin: retail - value } : {}),
      };
    });
    return {
      kpis: [
        kpi('products', 'reports.kpi.products', products, 'number', Package, { tone: 'info' }),
        kpi('units', 'reports.kpi.stockUnits', sumOf(rows, 'quantity'), 'quantity', Boxes, { tone: 'neutral' }),
        kpi('retail', 'reports.kpi.retailValue', whole(sumOf(rows, 'retail')), 'money', Tags, { tone: 'primary', hint: say('reports.hint.atPrice') }),
        ...when(financial, kpi('cost', 'reports.kpi.costValue', whole(sumOf(rows, 'value')), 'money', Coins, { tone: 'success', hint: say('reports.hint.atCost') })),
        kpi('low', 'reports.kpi.lowStock', low, 'number', TriangleAlert, { tone: 'warning', invert: true }),
        kpi('out', 'reports.kpi.outOfStock', out, 'number', PackageX, { tone: 'danger', invert: true }),
      ],
      charts: [
        topBar(rows, {
          id: 'value',
          titleKey: 'reports.chart.valueByCategory',
          subtitle: say(financial ? 'reports.hint.atCost' : 'reports.hint.atPrice'),
          categoryKey: 'reports.col.category',
          valueKey: financial ? 'reports.col.costValue' : 'reports.col.retailValue',
          valueKind: 'money',
          span: 'half',
          limit: 12,
          label: (row) => nameLabel(row),
          value: (row) => whole(financial ? row.value : row.retail),
        }),
        donutFixed(['ok', 'low', 'out'], health, (key) => enumLabel('stockHealth', key), {
          id: 'health',
          titleKey: 'reports.chart.stockHealth',
          categoryKey: 'reports.col.health',
          valueKey: 'reports.col.products',
          valueKind: 'number',
          centerKey: 'reports.kpi.products',
          span: 'half',
        }),
      ],
      table: table(
        [
          col('name', 'reports.col.category', 'text', { bnKey: 'name_bn' }),
          col('products', 'reports.col.products', 'number', { total: 'sum' }),
          col('quantity', 'reports.col.stock', 'quantity', { total: 'sum' }),
          col('low', 'reports.col.low', 'number', { total: 'sum' }),
          col('out', 'reports.col.out', 'number', { total: 'sum' }),
          col('retail', 'reports.col.retailValue', 'money', { total: 'sum' }),
          ...when(financial, col('value', 'reports.col.costValue', 'money', { total: 'sum' }), col('margin', 'reports.col.potentialMargin', 'money', { total: 'sum' })),
        ],
        data,
        'id',
        { defaultSort: { key: 'retail', direction: 'desc' }, searchKeys: ['name', 'name_bn'] },
      ),
      empty: products === 0,
    };
  },
};

export const stockValuation: ReportDefinition = {
  id: 'stock-valuation',
  group: 'products',
  icon: Coins,
  permission: 'reports.financial',
  filters: ['category', 'brand', 'supplier', 'search'],
  period: 'snapshot',
  defaultPeriod: 'today',
  compare: false,
  emptyKey: 'reports.empty.stock',
  landscape: true,
  async load(filter) {
    const [byCategory, items] = await Promise.all([financialQuery('inventoryByCategory', filter), financialQuery('stockValuation', filter)]);
    const value = whole(sumOf(byCategory, 'value'));
    const retail = whole(sumOf(byCategory, 'retail'));
    const inStock = items.filter((row) => num(row.stock) > 0);
    const data = inStock.map((row) => {
      const cost = whole(row.value);
      const price = whole(row.retail);
      return { ...productBase(row), stock: num(row.stock), cost: num(row.cost), price: num(row.price), value: cost, retail: price, margin: price - cost };
    });
    return {
      kpis: [
        kpi('cost', 'reports.kpi.costValue', value, 'money', Coins, { tone: 'primary', hint: say('reports.hint.atCost') }),
        kpi('retail', 'reports.kpi.retailValue', retail, 'money', Tags, { tone: 'info', hint: say('reports.hint.atPrice') }),
        kpi('margin', 'reports.kpi.potentialMargin', retail - value, 'money', PiggyBank, {
          tone: 'success',
          hint: say('reports.hint.margin', { value: amount(ratio(retail - value, retail), 'percent') }),
        }),
        kpi('inStock', 'reports.kpi.inStockProducts', inStock.length, 'number', Package, { tone: 'neutral' }),
        kpi('units', 'reports.kpi.stockUnits', sumOf(byCategory, 'quantity'), 'quantity', Boxes, { tone: 'neutral' }),
      ],
      charts: [
        topBar(byCategory, {
          id: 'value',
          titleKey: 'reports.chart.valueByCategory',
          categoryKey: 'reports.col.category',
          valueKey: 'reports.col.costValue',
          valueKind: 'money',
          span: 'half',
          limit: 12,
          label: (row) => nameLabel(row),
          value: (row) => whole(row.value),
        }),
        donutTop(
          byCategory.map((row) => ({ key: str(row.id), label: nameLabel(row), value: whole(row.value) })),
          { id: 'share', titleKey: 'reports.chart.valueShare', categoryKey: 'reports.col.category', valueKey: 'reports.col.costValue', valueKind: 'money', centerKey: 'reports.chart.total', span: 'half' },
        ),
      ],
      table: table(
        [
          ...productColumns,
          col('stock', 'reports.col.stock', 'quantity', { total: 'sum' }),
          col('cost', 'reports.col.unitCost', 'money'),
          col('price', 'reports.col.unitPrice', 'money', { hidden: true }),
          col('value', 'reports.col.costValue', 'money', { total: 'sum' }),
          col('retail', 'reports.col.retailValue', 'money', { total: 'sum' }),
          col('margin', 'reports.col.potentialMargin', 'money', { total: 'sum' }),
          col('share', 'reports.col.share', 'percent', { total: 'sum' }),
        ],
        withShare(data, 'value'),
        'id',
        { defaultSort: { key: 'value', direction: 'desc' }, searchKeys: PRODUCT_SEARCH, notice: say('reports.notice.inStockOnly') },
      ),
      empty: inStock.length === 0,
    };
  },
};

const MOVEMENT_KEYS = ['id', 'created_at', 'type', 'sku', 'quantity', 'balance_after', 'reference_no', 'reason', 'user_name'] as const;

export const stockMovement: ReportDefinition = {
  id: 'stock-movement',
  group: 'products',
  icon: ArrowLeftRight,
  permission: 'reports.view',
  filters: ['category', 'movementType', 'search'],
  period: 'range',
  defaultPeriod: 'this_week',
  compare: false,
  emptyKey: 'reports.empty.movements',
  landscape: true,
  async load(filter, options) {
    const financial = options.canFinancial;
    const extra = { type: options.extra.movementType };
    const [byType, byDay, list] = await Promise.all([
      query('stockMovementByType', filter, extra),
      query('stockMovementByDay', filter, extra),
      detail(options, () => query('stockMovements', filter, extra)),
    ]);
    const days = daysOf(rangeOf(filter));
    const perDay = byKey(byDay);
    const typeLabel = (row: ReportRow) => enumLabel('movementType', str(row.type));
    return {
      kpis: [
        kpi('movements', 'reports.kpi.movements', sumOf(byType, 'count'), 'number', ArrowLeftRight, { tone: 'info' }),
        kpi('in', 'reports.kpi.unitsIn', sumOf(byType, 'qty_in'), 'quantity', ArrowDownToLine, { tone: 'success' }),
        kpi('out', 'reports.kpi.unitsOut', sumOf(byType, 'qty_out'), 'quantity', ArrowUpFromLine, { tone: 'warning' }),
        kpi('net', 'reports.kpi.netChange', sumOf(byType, 'net'), 'quantity', Scale, { tone: 'neutral' }),
        ...when(financial, kpi('value', 'reports.kpi.valueMoved', sumOf(byType, 'value'), 'money', Coins, { tone: 'neutral', hint: say('reports.hint.atCost') })),
      ],
      charts: [
        lineChart({
          id: 'inOut',
          titleKey: 'reports.chart.inOut',
          categoryKey: 'reports.col.date',
          valueKey: 'reports.col.quantity',
          valueKind: 'quantity',
          span: 'full',
          points: days.map(dateLabel),
          series: [
            { key: 'in', labelKey: 'reports.col.unitsIn', values: days.map((key) => num(perDay.get(key)?.qty_in)) },
            { key: 'out', labelKey: 'reports.col.unitsOut', values: days.map((key) => num(perDay.get(key)?.qty_out)) },
          ],
        }),
        topBar(byType, {
          id: 'byType',
          titleKey: 'reports.chart.unitsByType',
          categoryKey: 'reports.col.movement',
          valueKey: 'reports.col.quantity',
          valueKind: 'quantity',
          span: 'half',
          label: typeLabel,
          value: (row) => num(row.qty_in) + num(row.qty_out),
        }),
        donutTop(
          byType.map((row) => ({ key: str(row.type), label: typeLabel(row), value: num(row.count) })),
          { id: 'share', titleKey: 'reports.chart.movementShare', categoryKey: 'reports.col.movement', valueKey: 'reports.col.count', valueKind: 'number', centerKey: 'reports.kpi.movements', span: 'half' },
        ),
      ],
      table: table(
        [
          col('created_at', 'reports.col.dateTime', 'datetime'),
          col('type', 'reports.col.movement', 'text', { enumGroup: 'movementType' }),
          col('sku', 'reports.col.sku', 'text', { mono: true }),
          col('name', 'reports.col.product', 'text', { bnKey: 'name_bn' }),
          col('quantity', 'reports.col.quantity', 'quantity', { signed: true, signTone: true, total: 'sum' }),
          col('balance_after', 'reports.col.balanceAfter', 'quantity'),
          ...when(financial, col('unit_cost', 'reports.col.unitCost', 'money', { hidden: true })),
          col('reference_no', 'reports.col.reference', 'text', { mono: true }),
          col('reason', 'reports.col.reason', 'text', { enumGroup: 'adjustmentReason', hidden: true }),
          col('user_name', 'reports.col.user', 'text'),
        ],
        list.map((row) => ({ ...pickRow(row, MOVEMENT_KEYS), name: str(row.name_en), name_bn: str(row.name_bn), ...(financial ? { unit_cost: num(row.unit_cost) } : {}) })),
        'id',
        {
          defaultSort: { key: 'created_at', direction: 'desc' },
          searchKeys: ['sku', 'name', 'name_bn', 'reference_no', 'user_name'],
          notice: limitNotice(list.length, LIST_LIMITS.movements),
        },
      ),
      empty: sumOf(byType, 'count') === 0,
    };
  },
};

export const lowStock: ReportDefinition = {
  id: 'low-stock',
  group: 'products',
  icon: TriangleAlert,
  permission: 'reports.view',
  filters: ['category', 'brand', 'supplier', 'search'],
  period: 'snapshot',
  defaultPeriod: 'today',
  compare: false,
  emptyKey: 'reports.empty.lowStock',
  async load(filter, options) {
    const financial = options.canFinancial;
    const rows = await query('lowStock', filter);
    const data = rows.map((row) => {
      const minimum = num(row.min_stock);
      const cover = minimum > 0 ? num(row.stock) / minimum : 1;
      return { ...productBase(row), ...reorderFields(row, financial), cover, health: cover <= 0.5 ? 'critical' : 'low' };
    });
    return {
      kpis: [
        kpi('items', 'reports.kpi.lowItems', rows.length, 'number', TriangleAlert, { tone: 'warning', invert: true }),
        kpi('critical', 'reports.kpi.critical', data.filter((row) => row.health === 'critical').length, 'number', PackageX, {
          tone: 'danger',
          invert: true,
          hint: say('reports.hint.critical'),
        }),
        ...reorderKpis(rows, financial),
      ],
      charts: reorderCharts(rows),
      table: table(
        [
          ...productColumns,
          col('supplier', 'reports.col.supplier', 'text'),
          col('stock', 'reports.col.stock', 'quantity'),
          col('min_stock', 'reports.col.minStock', 'quantity'),
          col('max_stock', 'reports.col.maxStock', 'quantity', { hidden: true }),
          col('cover', 'reports.col.cover', 'percent'),
          col('reorder', 'reports.col.reorder', 'quantity', { total: 'sum' }),
          ...when(financial, col('reorder_cost', 'reports.col.reorderCost', 'money', { total: 'sum' })),
          col('last_sale_at', 'reports.col.lastSale', 'datetime', { fallbackKey: 'reports.labels.never' }),
          col('health', 'reports.col.health', 'text', { enumGroup: 'stockHealth', tones: { critical: 'danger', low: 'warning' } }),
        ],
        data,
        'id',
        { defaultSort: { key: 'cover', direction: 'asc' }, searchKeys: [...PRODUCT_SEARCH, 'supplier'] },
      ),
      empty: rows.length === 0,
    };
  },
};

export const outOfStock: ReportDefinition = {
  id: 'out-of-stock',
  group: 'products',
  icon: PackageX,
  permission: 'reports.view',
  filters: ['category', 'brand', 'supplier', 'search'],
  period: 'snapshot',
  defaultPeriod: 'today',
  compare: false,
  emptyKey: 'reports.empty.outOfStock',
  async load(filter, options) {
    const financial = options.canFinancial;
    const rows = await query('outOfStock', filter);
    const data = rows.map((row) => ({ ...productBase(row), ...reorderFields(row, financial), days_idle: daysSince(row.last_sale_at, options.now) }));
    const recent = data.filter((row) => row.days_idle !== null && row.days_idle <= 30).length;
    return {
      kpis: [
        kpi('items', 'reports.kpi.outItems', rows.length, 'number', PackageX, { tone: 'danger', invert: true }),
        kpi('recent', 'reports.kpi.recentlySold', recent, 'number', History, { tone: 'warning', invert: true, hint: say('reports.hint.reorderFirst') }),
        ...reorderKpis(rows, financial),
      ],
      charts: reorderCharts(rows),
      table: table(
        [
          ...productColumns,
          col('supplier', 'reports.col.supplier', 'text'),
          col('stock', 'reports.col.stock', 'quantity', { signTone: true }),
          col('reorder', 'reports.col.reorder', 'quantity', { total: 'sum' }),
          ...when(financial, col('reorder_cost', 'reports.col.reorderCost', 'money', { total: 'sum' })),
          col('last_sale_at', 'reports.col.lastSale', 'datetime', { fallbackKey: 'reports.labels.never' }),
          col('days_idle', 'reports.col.daysIdle', 'number'),
          col('last_movement_at', 'reports.col.lastMovement', 'datetime', { hidden: true }),
        ],
        data,
        'id',
        { defaultSort: { key: 'last_sale_at', direction: 'desc' }, searchKeys: [...PRODUCT_SEARCH, 'supplier'] },
      ),
      empty: rows.length === 0,
    };
  },
};

export const slowMoving: ReportDefinition = {
  id: 'slow-moving',
  group: 'products',
  icon: Snail,
  permission: 'reports.view',
  filters: ['category', 'brand', 'supplier', 'search'],
  period: 'range',
  defaultPeriod: 'last_30_days',
  compare: false,
  emptyKey: 'reports.empty.slowMoving',
  async load(filter, options) {
    const financial = options.canFinancial;
    const rows = await query('slowMoving', filter);
    const data = rows.map((row) => ({
      ...productBase(row),
      stock: num(row.stock),
      sold: num(row.sold),
      last_at: str(row.last_at) || null,
      days_idle: daysSince(row.last_at, options.now),
      ...(financial ? { cost: num(row.cost), value: whole(row.value) } : {}),
    }));
    return {
      kpis: [
        kpi('items', 'reports.kpi.slowItems', rows.length, 'number', Snail, { tone: 'info' }),
        kpi('notSold', 'reports.kpi.notSold', rows.filter((row) => num(row.sold) === 0).length, 'number', PackageX, { tone: 'warning', invert: true }),
        kpi('units', 'reports.kpi.stockUnits', sumOf(rows, 'stock'), 'quantity', Boxes, { tone: 'neutral' }),
        ...when(financial, kpi('capital', 'reports.kpi.capitalTied', whole(sumOf(rows, 'value')), 'money', Coins, { tone: 'danger', invert: true, hint: say('reports.hint.atCost') })),
      ],
      charts: [
        topBar(rows, {
          id: 'idle',
          titleKey: financial ? 'reports.chart.idleValue' : 'reports.chart.idleUnits',
          categoryKey: 'reports.col.product',
          valueKey: financial ? 'reports.col.costValue' : 'reports.col.stock',
          valueKind: financial ? 'money' : 'quantity',
          span: 'half',
          label: (row) => nameLabel(row),
          value: (row) => (financial ? whole(row.value) : num(row.stock)),
        }),
        topBar(groupBy(rows, 'category_en', { en: 'category_en', bn: 'category_bn' }), {
          id: 'byCategory',
          titleKey: 'reports.chart.byCategory',
          categoryKey: 'reports.col.category',
          valueKey: 'reports.col.products',
          valueKind: 'number',
          span: 'half',
          label: (row) => nameLabel(row),
          value: (row) => num(row.count),
        }),
      ],
      table: table(
        [
          ...productColumns,
          col('stock', 'reports.col.stock', 'quantity', { total: 'sum' }),
          col('sold', 'reports.col.sold', 'quantity', { total: 'sum' }),
          col('last_at', 'reports.col.lastSale', 'datetime'),
          col('days_idle', 'reports.col.daysIdle', 'number'),
          ...when(financial, col('cost', 'reports.col.unitCost', 'money', { hidden: true }), col('value', 'reports.col.costValue', 'money', { total: 'sum' })),
        ],
        data,
        'id',
        {
          defaultSort: { key: 'sold', direction: 'asc' },
          searchKeys: PRODUCT_SEARCH,
          notice: say('reports.notice.slowMoving', { count: amount(LIST_LIMITS.slowMoving, 'number') }),
        },
      ),
      empty: rows.length === 0,
    };
  },
};
