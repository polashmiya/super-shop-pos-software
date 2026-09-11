import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router';
import type { CashMovementType, CustomerType, DateRange, PaymentMethod, ReportFilter, ReportPeriod, StockMovementType } from '@/types';
import { rangeToLocalDates, resolveReportRange } from './period';
import type { FilterKey, ReportDefinition, ReportExtraFilters } from './types';

/* ==========================================================================
   Report screen state kept in the URL (period, dates, filters, comparison),
   so Back/Refresh and shared links reopen the same view.
   ========================================================================== */

export const PAYMENT_METHODS: readonly PaymentMethod[] = ['cash', 'card', 'mobile', 'points'];
export const CUSTOMER_TYPES: readonly CustomerType[] = ['regular', 'vip', 'wholesale', 'walk_in'];
export const MOVEMENT_TYPES: readonly StockMovementType[] = ['sale', 'purchase', 'return', 'cancel', 'adjustment', 'damage', 'opening', 'transfer_in', 'transfer_out'];
export const CASH_TYPES: readonly CashMovementType[] = ['opening', 'sale', 'refund', 'expense', 'cash_in', 'cash_out', 'closing'];
const RANKS: readonly ReportExtraFilters['rankBy'][] = ['amount', 'quantity'];

/** Filters that live in the URL (everything but the table search). */
export const URL_FILTERS: readonly Exclude<FilterKey, 'search'>[] = ['cashier', 'counter', 'category', 'brand', 'supplier', 'customerType', 'paymentMethod', 'movementType', 'cashType', 'rankBy'];

export interface ReportState {
  period: ReportPeriod;
  range: DateRange;
  filter: ReportFilter;
  extra: ReportExtraFilters;
  compare: boolean;
  /** True when any filter (not the period or ranking) narrows the report. */
  filtered: boolean;
}

export type ReportPatch = Record<string, string | null>;

export function readReportState(params: URLSearchParams, definition: ReportDefinition, now: Date): ReportState {
  const { period, range } = resolveReportRange(definition, now, params.get('period'), params.get('from'), params.get('to'));
  const uses = (key: FilterKey) => definition.filters.includes(key);
  const id = (key: FilterKey): string => (uses(key) && params.get(key)) || 'all';
  const pick = <T extends string>(key: FilterKey, allowed: readonly T[], fallback: T): T => {
    const value = params.get(key);
    return uses(key) && value && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
  };
  const filter: ReportFilter = {
    period,
    from: range.from,
    to: range.to,
    branchId: 'all',
    counterId: id('counter'),
    cashierId: id('cashier'),
    categoryId: id('category'),
    brandId: id('brand'),
    supplierId: id('supplier'),
    customerId: 'all',
    paymentMethod: pick<PaymentMethod | 'all'>('paymentMethod', PAYMENT_METHODS, 'all'),
  };
  const extra: ReportExtraFilters = {
    customerType: pick<CustomerType | 'all'>('customerType', CUSTOMER_TYPES, 'all'),
    movementType: pick<StockMovementType | 'all'>('movementType', MOVEMENT_TYPES, 'all'),
    cashType: pick<CashMovementType | 'all'>('cashType', CASH_TYPES, 'all'),
    rankBy: pick('rankBy', RANKS, 'amount'),
  };
  const filtered = [filter.counterId, filter.cashierId, filter.categoryId, filter.brandId, filter.supplierId, filter.paymentMethod, extra.customerType, extra.movementType, extra.cashType].some(
    (value) => value !== 'all',
  );
  return { period, range, filter, extra, compare: definition.compare && definition.period === 'range' && params.get('compare') !== '0', filtered };
}

/** URL patch for a period choice (custom ranges keep their local dates). */
export function periodPatch(period: ReportPeriod, custom?: DateRange): ReportPatch {
  if (period === 'custom' && custom) return { period, ...rangeToLocalDates(custom) };
  return { period, from: null, to: null };
}

export function clearFiltersPatch(): ReportPatch {
  return Object.fromEntries(URL_FILTERS.filter((key) => key !== 'rankBy').map((key) => [key, null]));
}

export function useReportState(definition: ReportDefinition, now: Date): [ReportState, (patch: ReportPatch) => void] {
  const [params, setParams] = useSearchParams();
  const query = params.toString();
  const state = useMemo(() => readReportState(new URLSearchParams(query), definition, now), [query, definition, now]);
  const update = useCallback(
    (patch: ReportPatch) =>
      setParams(
        (current) => {
          const next = new URLSearchParams(current);
          for (const [name, value] of Object.entries(patch)) {
            if (value === null || value === '' || value === 'all') next.delete(name);
            else next.set(name, value);
          }
          return next;
        },
        { replace: true },
      ),
    [setParams],
  );
  return [state, update];
}
