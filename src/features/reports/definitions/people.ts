import { BadgePercent, Calculator, Crown, HandCoins, PackageCheck, ShoppingBag, ShoppingCart, Star, TrendingUp, Truck, UserRound, Users, Wallet } from 'lucide-react';
import type { ReportRow } from '@/repositories/types';
import { amount, bestOf, col, donutFixed, enumLabel, i18n, kpi, nameLabel, num, pickRow, ratio, say, str, sumOf, text, topBar, totalsBy, withShare } from '../builders';
import type { ReportDefinition } from '../types';
import { detail, first, LIST_LIMITS, limitNotice, query, table } from './common';

/* ==========================================================================
   People: cashier performance, customer purchases and supplier purchases.
   ========================================================================== */

export const cashierSales: ReportDefinition = {
  id: 'cashier-sales',
  group: 'people',
  icon: UserRound,
  permission: 'reports.view',
  filters: ['counter'],
  period: 'range',
  defaultPeriod: 'this_month',
  compare: true,
  emptyKey: 'reports.empty.cashiers',
  async load(filter) {
    const rows = await query('cashierSales', filter);
    const total = sumOf(rows, 'amount');
    const orders = sumOf(rows, 'orders');
    const top = bestOf(rows, (row) => num(row.amount));
    const data = rows.map((row) => {
      const sales = num(row.amount);
      const count = num(row.orders);
      const discount = num(row.discount);
      return {
        id: str(row.id),
        name: str(row.name_en),
        name_bn: str(row.name_bn),
        role: str(row.role) || null,
        shifts: num(row.shifts),
        orders: count,
        items: num(row.items),
        amount: sales,
        basket: count > 0 ? Math.round(sales / count) : 0,
        discount,
        before_discount: sales + discount,
        discount_rate: ratio(discount, sales + discount),
        returns: num(row.returns),
      };
    });
    return {
      kpis: [
        kpi('cashiers', 'reports.kpi.cashiers', rows.length, 'number', Users, { tone: 'info' }),
        kpi('sales', 'reports.kpi.invoicedSales', total, 'money', TrendingUp, { tone: 'primary' }),
        kpi('orders', 'reports.kpi.orders', orders, 'number', ShoppingBag, { tone: 'neutral' }),
        kpi('basket', 'reports.kpi.avgBasket', orders > 0 ? Math.round(total / orders) : 0, 'money', Calculator, { tone: 'neutral' }),
        kpi('top', 'reports.kpi.topCashier', num(top?.amount), 'money', Crown, { tone: 'warning', comparable: false, hint: top ? say('reports.hint.name', { name: nameLabel(top) }) : undefined }),
        kpi('discount', 'reports.kpi.discountsGiven', sumOf(rows, 'discount'), 'money', BadgePercent, { tone: 'success', invert: true }),
      ],
      charts: [
        topBar(rows, {
          id: 'sales',
          titleKey: 'reports.chart.salesByCashier',
          categoryKey: 'reports.col.cashier',
          valueKey: 'reports.col.sales',
          valueKind: 'money',
          span: 'half',
          label: (row) => nameLabel(row),
          value: (row) => num(row.amount),
          secondary: (row) => say('reports.hint.orders', { count: amount(num(row.orders), 'number') }),
        }),
        topBar(data, {
          id: 'basket',
          titleKey: 'reports.chart.basketByCashier',
          categoryKey: 'reports.col.cashier',
          valueKey: 'reports.col.basket',
          valueKind: 'money',
          span: 'half',
          label: (row) => nameLabel(row as ReportRow, 'name', 'name_bn'),
          value: (row) => num(row.basket),
        }),
      ],
      table: table(
        [
          col('name', 'reports.col.cashier', 'text', { bnKey: 'name_bn' }),
          col('role', 'reports.col.role', 'text', { enumGroup: 'role' }),
          col('shifts', 'reports.col.shifts', 'number'),
          col('orders', 'reports.col.orders', 'number', { total: 'sum' }),
          col('items', 'reports.col.lines', 'number', { total: 'sum', hidden: true }),
          col('amount', 'reports.col.sales', 'money', { total: 'sum' }),
          col('share', 'reports.col.share', 'percent', { total: 'sum' }),
          col('basket', 'reports.col.basket', 'money', { total: { ratio: ['amount', 'orders'] } }),
          col('discount', 'reports.col.discount', 'money', { total: 'sum' }),
          col('discount_rate', 'reports.col.discountRate', 'percent', { total: { ratio: ['discount', 'before_discount'] }, hidden: true }),
          col('returns', 'reports.col.returns', 'money', { total: 'sum', hidden: true }),
        ],
        withShare(data, 'amount'),
        'id',
        { defaultSort: { key: 'amount', direction: 'desc' }, searchKeys: ['name', 'name_bn'] },
      ),
      empty: rows.length === 0,
    };
  },
};

const CUSTOMER_TYPES = ['none', 'walk_in', 'regular', 'vip', 'wholesale'] as const;
const CUSTOMER_KEYS = ['id', 'name', 'phone', 'type', 'orders', 'amount', 'discount', 'returns', 'points', 'redeemed', 'balance', 'last_at'] as const;

export const customerPurchases: ReportDefinition = {
  id: 'customer-purchases',
  group: 'people',
  icon: Users,
  permission: 'reports.view',
  filters: ['customerType', 'search'],
  period: 'range',
  defaultPeriod: 'this_month',
  compare: true,
  emptyKey: 'reports.empty.customers',
  async load(filter, options) {
    const [types, recon, customers] = await Promise.all([
      query('customerTypeSales', filter),
      first('salesReconciliation', filter),
      detail(options, () => query('customerActivity', filter, { limit: LIST_LIMITS.customers, customerType: options.extra.customerType })),
    ]);
    const members = types.filter((row) => row.type !== 'none');
    const walkIn = types.find((row) => row.type === 'none');
    const total = sumOf(types, 'amount');
    const memberSales = sumOf(members, 'amount');
    const people = sumOf(members, 'customers');
    return {
      kpis: [
        kpi('customers', 'reports.kpi.customers', people, 'number', Users, { tone: 'info' }),
        kpi('members', 'reports.kpi.memberSales', memberSales, 'money', UserRound, { tone: 'primary', hint: say('reports.hint.ofSales', { value: amount(ratio(memberSales, total), 'percent') }) }),
        kpi('spend', 'reports.kpi.avgSpend', people > 0 ? Math.round(memberSales / people) : 0, 'money', Calculator, { tone: 'neutral' }),
        kpi('walkIn', 'reports.kpi.walkInSales', num(walkIn?.amount), 'money', ShoppingBag, {
          tone: 'neutral',
          hint: say('reports.hint.orders', { count: amount(num(walkIn?.orders), 'number') }),
        }),
        kpi('points', 'reports.kpi.pointsEarned', num(recon.points_earned), 'number', Star, { tone: 'warning' }),
      ],
      charts: [
        donutFixed(CUSTOMER_TYPES, totalsBy(types, 'type', 'amount'), (type) => (type === 'none' ? i18n('reports.labels.walkInSales') : enumLabel('customerType', type)), {
          id: 'types',
          titleKey: 'reports.chart.customerTypes',
          categoryKey: 'reports.col.type',
          valueKey: 'reports.col.sales',
          valueKind: 'money',
          centerKey: 'reports.chart.total',
          span: 'half',
        }),
        topBar(customers, {
          id: 'top',
          titleKey: 'reports.chart.topCustomers',
          categoryKey: 'reports.col.customer',
          valueKey: 'reports.col.sales',
          valueKind: 'money',
          span: 'half',
          label: (row) => text(str(row.name)),
          value: (row) => num(row.amount),
          secondary: (row) => say('reports.hint.orders', { count: amount(num(row.orders), 'number') }),
        }),
      ],
      table: table(
        [
          col('name', 'reports.col.customer', 'text'),
          col('phone', 'reports.col.phone', 'text', { mono: true }),
          col('type', 'reports.col.type', 'text', { enumGroup: 'customerType' }),
          col('orders', 'reports.col.orders', 'number', { total: 'sum' }),
          col('amount', 'reports.col.sales', 'money', { total: 'sum' }),
          col('basket', 'reports.col.basket', 'money', { total: { ratio: ['amount', 'orders'] } }),
          col('discount', 'reports.col.discount', 'money', { total: 'sum', hidden: true }),
          col('returns', 'reports.col.returns', 'money', { total: 'sum', hidden: true }),
          col('points', 'reports.col.points', 'number', { total: 'sum' }),
          col('redeemed', 'reports.col.redeemed', 'number', { total: 'sum', hidden: true }),
          col('balance', 'reports.col.balance', 'number', { hidden: true }),
          col('last_at', 'reports.col.lastPurchase', 'datetime'),
        ],
        customers.map((row) => {
          const orders = num(row.orders);
          return { ...pickRow(row, CUSTOMER_KEYS), basket: orders > 0 ? Math.round(num(row.amount) / orders) : 0 };
        }),
        'id',
        { defaultSort: { key: 'amount', direction: 'desc' }, searchKeys: ['name', 'phone'], notice: limitNotice(customers.length, LIST_LIMITS.customers) },
      ),
      empty: total === 0,
    };
  },
};

export const supplierPurchases: ReportDefinition = {
  id: 'supplier-purchases',
  group: 'people',
  icon: Truck,
  permission: 'reports.view',
  filters: ['supplier'],
  period: 'range',
  defaultPeriod: 'this_month',
  compare: true,
  emptyKey: 'reports.empty.suppliers',
  async load(filter) {
    const rows = await query('supplierPurchases', filter);
    const label = (row: ReportRow) => text(str(row.name));
    return {
      kpis: [
        kpi('suppliers', 'reports.kpi.suppliers', rows.length, 'number', Truck, { tone: 'info' }),
        kpi('value', 'reports.kpi.purchaseValue', sumOf(rows, 'amount'), 'money', ShoppingCart, { tone: 'primary' }),
        kpi('received', 'reports.kpi.receivedValue', sumOf(rows, 'received'), 'money', PackageCheck, { tone: 'success' }),
        kpi('paid', 'reports.kpi.paid', sumOf(rows, 'paid'), 'money', Wallet, { tone: 'neutral' }),
        kpi('due', 'reports.kpi.due', sumOf(rows, 'due'), 'money', HandCoins, { tone: 'warning', invert: true }),
      ],
      charts: [
        topBar(rows, {
          id: 'value',
          titleKey: 'reports.chart.purchasesBySupplier',
          categoryKey: 'reports.col.supplier',
          valueKey: 'reports.col.amount',
          valueKind: 'money',
          span: 'half',
          label,
          value: (row) => num(row.amount),
          secondary: (row) => say('reports.hint.orders', { count: amount(num(row.orders), 'number') }),
        }),
        topBar(rows, { id: 'due', titleKey: 'reports.chart.dueBySupplier', categoryKey: 'reports.col.supplier', valueKey: 'reports.col.due', valueKind: 'money', span: 'half', label, value: (row) => num(row.due) }),
      ],
      table: table(
        [
          col('name', 'reports.col.supplier', 'text'),
          col('orders', 'reports.col.orders', 'number', { total: 'sum' }),
          col('amount', 'reports.col.amount', 'money', { total: 'sum' }),
          col('received', 'reports.col.receivedValue', 'money', { total: 'sum' }),
          col('paid', 'reports.col.paid', 'money', { total: 'sum' }),
          col('due', 'reports.col.due', 'money', { total: 'sum' }),
          col('paid_share', 'reports.col.paidShare', 'percent', { total: { ratio: ['paid', 'amount'] } }),
        ],
        rows.map((row) => ({ ...pickRow(row, ['id', 'name', 'orders', 'amount', 'received', 'paid', 'due']), paid_share: ratio(num(row.paid), num(row.amount)) })),
        'id',
        { defaultSort: { key: 'amount', direction: 'desc' }, searchKeys: ['name'] },
      ),
      empty: rows.length === 0,
    };
  },
};
