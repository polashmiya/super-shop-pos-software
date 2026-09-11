import type { ReportQueryName, ReportRow } from '@/repositories/types';
import { runFinancialQuery, runQuery } from '@/services/reportService';
import type { PaymentMethod, RefundMethod, ReportFilter } from '@/types';
import type { LoadOptions, ReportColumnDef, ReportRowData, ReportTableData, ReportText } from '../types';

/* ==========================================================================
   Shared plumbing for the report loaders: permission-checked queries and a
   few constants. Every aggregate is computed in SQL (repositories); loaders
   only shape rows into KPIs, charts, statements and tables.
   ========================================================================== */

export type Extra = Record<string, string | number>;

export function query(name: ReportQueryName, filter: ReportFilter, extra?: Extra): Promise<ReportRow[]> {
  return runQuery(name, filter, extra);
}

/** Queries that reveal cost, stock value or profit (reports.financial). */
export function financialQuery(name: ReportQueryName, filter: ReportFilter, extra?: Extra): Promise<ReportRow[]> {
  return runFinancialQuery(name, filter, extra);
}

/** The single row of an aggregate query (an empty row when nothing matched). */
export async function first(name: ReportQueryName, filter: ReportFilter, extra?: Extra, financial = false): Promise<ReportRow> {
  const rows = await (financial ? runFinancialQuery : runQuery)(name, filter, extra);
  return rows[0] ?? {};
}

/** Table-only queries are skipped for the previous-period comparison. */
export function detail(options: LoadOptions, run: () => Promise<ReportRow[]>): Promise<ReportRow[]> {
  return options.summaryOnly ? Promise.resolve([]) : run();
}

export function detailRow(options: LoadOptions, run: () => Promise<ReportRow>): Promise<ReportRow> {
  return options.summaryOnly ? Promise.resolve({}) : run();
}

export const PAYMENT_ORDER: readonly PaymentMethod[] = ['cash', 'card', 'mobile', 'points'];
export const REFUND_ORDER: readonly RefundMethod[] = ['cash', 'card', 'mobile', 'store_credit'];

/** Rows the list queries return at most (see reportRepository). */
export const LIST_LIMITS = { movements: 5000, cash: 5000, discounts: 2000, customers: 1000, slowMoving: 300, products: 5000 } as const;

/** True when a product-level filter (category / brand) narrows the report. */
export function itemFiltered(filter: ReportFilter): boolean {
  return filter.categoryId !== 'all' || filter.brandId !== 'all';
}

/** True when any filter besides the period is set. */
export function anyFilter(filter: ReportFilter): boolean {
  return (['counterId', 'cashierId', 'categoryId', 'brandId', 'paymentMethod', 'customerId', 'supplierId'] as const).some((key) => filter[key] !== 'all');
}

export function table(columns: ReportColumnDef[], rows: ReportRowData[], rowKey: string, more: Partial<ReportTableData> = {}): ReportTableData {
  return { columns, rows, rowKey, ...more };
}

/** A notice when a list query hit its row limit. */
export function limitNotice(count: number, limit: number): ReportText | undefined {
  return count >= limit ? { key: 'reports.notice.limited', params: { count: { value: limit, kind: 'number' } } } : undefined;
}

/** Whole days between an ISO time and now (null when there is no time). */
export function daysSince(iso: unknown, now: Date): number | null {
  if (typeof iso !== 'string' || !iso) return null;
  const time = new Date(iso).getTime();
  return Number.isFinite(time) ? Math.max(0, Math.floor((now.getTime() - time) / 86_400_000)) : null;
}
