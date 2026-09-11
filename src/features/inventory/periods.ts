import { resolvePeriod } from '@/domain/dates';
import type { DateRange, ReportPeriod } from '@/types';

/** A report period or the whole history. */
export type PeriodValue = ReportPeriod | 'all';

export interface PeriodState {
  period: PeriodValue;
  range: DateRange;
}

export function periodState(period: PeriodValue, now: Date = new Date()): PeriodState {
  return { period, range: resolvePeriod(period, now) };
}

/** Range bounds for a list filter (none for "All time", so nothing is hidden). */
export function periodBounds(state: PeriodState): { from?: string; to?: string } {
  return state.period === 'all' ? {} : { from: state.range.from, to: state.range.to };
}
