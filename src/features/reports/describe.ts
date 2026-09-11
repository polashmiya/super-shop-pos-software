import { pick } from '@/i18n';
import type { FilterChoice, FilterDirectory } from './filterOptions';
import { enumText, type LabelContext } from './labels';
import type { ReportState } from './useReportState';

/* ==========================================================================
   Human-readable description of the filters in effect (print subtitle) and
   the raw filter values (JSON export).
   ========================================================================== */

function nameOf(list: readonly FilterChoice[] | undefined, id: string, ctx: LabelContext): string {
  return pick(list?.find((choice) => choice.id === id)?.name, ctx.language) || id;
}

export function describeFilters(state: ReportState, directory: FilterDirectory | undefined, ctx: LabelContext): string {
  const { filter, extra } = state;
  const parts: string[] = [];
  const add = (label: string, value: string) => parts.push(`${label}: ${value}`);
  if (filter.cashierId !== 'all') add(ctx.t('reports.filters.cashier'), nameOf(directory?.cashiers, filter.cashierId, ctx));
  if (filter.counterId !== 'all') add(ctx.t('reports.filters.counter'), nameOf(directory?.counters, filter.counterId, ctx));
  if (filter.categoryId !== 'all') add(ctx.t('reports.filters.category'), nameOf(directory?.categories, filter.categoryId, ctx));
  if (filter.brandId !== 'all') add(ctx.t('reports.filters.brand'), nameOf(directory?.brands, filter.brandId, ctx));
  if (filter.supplierId !== 'all') add(ctx.t('reports.filters.supplier'), nameOf(directory?.suppliers, filter.supplierId, ctx));
  if (filter.paymentMethod !== 'all') add(ctx.t('reports.filters.paymentMethod'), enumText('paymentMethod', filter.paymentMethod, ctx.t));
  if (extra.customerType !== 'all') add(ctx.t('reports.filters.customerType'), enumText('customerType', extra.customerType, ctx.t));
  if (extra.movementType !== 'all') add(ctx.t('reports.filters.movementType'), enumText('movementType', extra.movementType, ctx.t));
  if (extra.cashType !== 'all') add(ctx.t('reports.filters.cashType'), enumText('cashMovement', extra.cashType, ctx.t));
  return parts.length > 0 ? ctx.t('reports.view.filtersApplied', { filters: parts.join(', ') }) : ctx.t('reports.view.noFilters');
}

/** Filters in effect as raw ids / codes (only the ones that narrow the report). */
export function filterValues(state: ReportState): Record<string, string> {
  const { filter, extra } = state;
  const entries: Array<[string, string]> = [
    ['cashierId', filter.cashierId],
    ['counterId', filter.counterId],
    ['categoryId', filter.categoryId],
    ['brandId', filter.brandId],
    ['supplierId', filter.supplierId],
    ['paymentMethod', filter.paymentMethod],
    ['customerType', extra.customerType],
    ['movementType', extra.movementType],
    ['cashType', extra.cashType],
  ];
  return { ...Object.fromEntries(entries.filter(([, value]) => value !== 'all')), rankBy: extra.rankBy };
}
