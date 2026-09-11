import type { BilingualText, Id, IsoDateTime, Money } from './common';
import type { PaymentMethod } from './sales';

export type ReportId =
  | 'sales-summary'
  | 'daily-sales'
  | 'monthly-sales'
  | 'product-sales'
  | 'category-sales'
  | 'brand-sales'
  | 'cashier-sales'
  | 'payment-methods'
  | 'discounts'
  | 'vat'
  | 'returns'
  | 'inventory-summary'
  | 'stock-movement'
  | 'low-stock'
  | 'out-of-stock'
  | 'stock-valuation'
  | 'purchase-summary'
  | 'supplier-purchases'
  | 'customer-purchases'
  | 'profit-estimate'
  | 'cash'
  | 'shifts'
  | 'expenses'
  | 'top-products'
  | 'slow-moving';

export type ReportPeriod = 'today' | 'yesterday' | 'this_week' | 'this_month' | 'last_month' | 'last_30_days' | 'custom';

export interface ReportFilter {
  period: ReportPeriod;
  from: IsoDateTime;
  to: IsoDateTime;
  branchId: Id | 'all';
  counterId: Id | 'all';
  cashierId: Id | 'all';
  categoryId: Id | 'all';
  brandId: Id | 'all';
  paymentMethod: PaymentMethod | 'all';
  customerId: Id | 'all';
  supplierId: Id | 'all';
}

export interface SalesKpis {
  grossSales: Money;
  netSales: Money;
  orders: number;
  averageOrder: Money;
  itemsSold: number;
  discountTotal: Money;
  taxTotal: Money;
  returnsTotal: Money;
  returnsCount: number;
  cashSales: Money;
  cardSales: Money;
  mobileSales: Money;
  pointsSales: Money;
  costOfGoods: Money;
  grossProfit: Money;
  customers: number;
}

export interface TimeBucket {
  /** yyyy-mm-dd, yyyy-mm or hour "00".."23". */
  key: string;
  label: string;
  sales: Money;
  orders: number;
}

export interface RankedRow {
  id: Id;
  name: BilingualText;
  quantity: number;
  amount: Money;
  orders: number;
  share: number;
  extra?: Record<string, number | string>;
}

export interface PaymentMethodRow {
  method: PaymentMethod;
  provider: string | null;
  amount: Money;
  count: number;
  share: number;
}

/**
 * A generic, export-ready table: typed columns + plain rows. Every report
 * produces one, so CSV/JSON export and printing work the same everywhere.
 */
export type ReportColumnKind = 'text' | 'number' | 'money' | 'percent' | 'date' | 'datetime' | 'quantity';

export interface ReportColumn {
  key: string;
  /** i18n key for the header. */
  labelKey: string;
  kind: ReportColumnKind;
  align?: 'start' | 'end';
}

export type ReportCell = string | number | null;

export interface ReportTable {
  columns: ReportColumn[];
  rows: Array<Record<string, ReportCell>>;
  totals?: Record<string, ReportCell>;
}

export interface DashboardData {
  today: SalesKpis;
  yesterday: SalesKpis;
  salesByHour: TimeBucket[];
  salesByDay: TimeBucket[];
  paymentMethods: PaymentMethodRow[];
  topProducts: RankedRow[];
  categorySales: RankedRow[];
  cashierPerformance: RankedRow[];
  lowStock: Array<{ id: Id; name: BilingualText; sku: string; stock: number; minStock: number; image: string | null }>;
  generatedAt: IsoDateTime;
}
