import type { ReportId } from '@/types';
import { REPORT_GROUPS, type ReportDefinition, type ReportGroup } from '../types';
import { paymentMethods, discountsReport, profitEstimate, vatReport } from './finance';
import { brandSales, categorySales, productSales, topProducts } from './items';
import { cashReport, expensesReport, purchaseSummary, shiftsReport } from './operations';
import { cashierSales, customerPurchases, supplierPurchases } from './people';
import { dailySales, monthlySales, returnsReport, salesSummary } from './sales';
import { inventorySummary, lowStock, outOfStock, slowMoving, stockMovement, stockValuation } from './stock';

/* ==========================================================================
   Report registry. The Record type makes TypeScript fail when a ReportId
   has no definition; the insertion order is the order in the library.
   ========================================================================== */

const REGISTRY: Record<ReportId, ReportDefinition> = {
  'sales-summary': salesSummary,
  'daily-sales': dailySales,
  'monthly-sales': monthlySales,
  'product-sales': productSales,
  'category-sales': categorySales,
  'brand-sales': brandSales,
  'top-products': topProducts,
  returns: returnsReport,
  'inventory-summary': inventorySummary,
  'stock-valuation': stockValuation,
  'stock-movement': stockMovement,
  'low-stock': lowStock,
  'out-of-stock': outOfStock,
  'slow-moving': slowMoving,
  'cashier-sales': cashierSales,
  'customer-purchases': customerPurchases,
  'supplier-purchases': supplierPurchases,
  'payment-methods': paymentMethods,
  vat: vatReport,
  discounts: discountsReport,
  'profit-estimate': profitEstimate,
  cash: cashReport,
  shifts: shiftsReport,
  expenses: expensesReport,
  'purchase-summary': purchaseSummary,
};

export const REPORTS: readonly ReportDefinition[] = Object.values(REGISTRY);

export function isReportId(value: unknown): value is ReportId {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(REGISTRY, value);
}

export function getReport(id: string | undefined): ReportDefinition | null {
  return isReportId(id) ? REGISTRY[id] : null;
}

/** Reports the user may open (financial ones need reports.financial). */
export function visibleReports(canFinancial: boolean): ReportDefinition[] {
  return REPORTS.filter((report) => canFinancial || report.permission !== 'reports.financial');
}

export function reportsByGroup(reports: readonly ReportDefinition[]): Array<{ group: ReportGroup; reports: ReportDefinition[] }> {
  return REPORT_GROUPS.map((group) => ({ group, reports: reports.filter((report) => report.group === group) })).filter((entry) => entry.reports.length > 0);
}
