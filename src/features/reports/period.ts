import { addDays, localDatesToRange, previousRange, resolvePeriod, toLocalDate } from '@/domain/dates';
import type { Formatters } from '@/utils/format';
import type { DateRange, ReportPeriod } from '@/types';
import type { ReportDefinition } from './types';

/* ==========================================================================
   Periods of the report screen: defaults per report, custom ranges from the
   URL and the comparison window for "compare with previous period".
   ========================================================================== */

export const ALL_PERIODS: readonly ReportPeriod[] = ['today', 'yesterday', 'this_week', 'this_month', 'last_month', 'last_30_days', 'custom'];

const LOCAL_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function periodsOf(definition: ReportDefinition): ReportPeriod[] {
  return [...(definition.periods ?? ALL_PERIODS)];
}

/** Period + range from URL values, falling back to the report's default. */
export function resolveReportRange(definition: ReportDefinition, now: Date, period: string | null, from: string | null, to: string | null): { period: ReportPeriod; range: DateRange } {
  const allowed = periodsOf(definition);
  const chosen = allowed.find((value) => value === period);
  if (chosen === 'custom' && from && to && LOCAL_DATE.test(from) && LOCAL_DATE.test(to)) return { period: 'custom', range: localDatesToRange(from, to) };
  if (chosen && chosen !== 'custom') return { period: chosen, range: resolvePeriod(chosen, now) };
  if (definition.defaultPeriod === 'custom') return { period: 'custom', range: definition.defaultRange?.(now) ?? resolvePeriod('last_30_days', now) };
  return { period: definition.defaultPeriod, range: resolvePeriod(definition.defaultPeriod, now) };
}

/** Local "yyyy-mm-dd" pair of a range (inclusive last day) for the URL. */
export function rangeToLocalDates(range: DateRange): { from: string; to: string } {
  return { from: toLocalDate(new Date(range.from)), to: toLocalDate(new Date(new Date(range.to).getTime() - 1)) };
}

function monthBack(date: Date): Date {
  const lastDay = new Date(date.getFullYear(), date.getMonth(), 0).getDate();
  return new Date(date.getFullYear(), date.getMonth() - 1, Math.min(date.getDate(), lastDay), date.getHours(), date.getMinutes(), date.getSeconds(), date.getMilliseconds());
}

/**
 * The window to compare with. A period that is still running (today, this
 * week, this month) is compared up to the same point in time, so half a day
 * is never compared with a whole one.
 */
export function comparisonRange(period: ReportPeriod, range: DateRange, now: Date): DateRange {
  const from = new Date(range.from);
  const end = new Date(Math.max(from.getTime(), Math.min(new Date(range.to).getTime(), now.getTime())));
  switch (period) {
    case 'today':
    case 'yesterday':
      return { from: addDays(from, -1).toISOString(), to: addDays(end, -1).toISOString() };
    case 'this_week':
      return { from: addDays(from, -7).toISOString(), to: addDays(end, -7).toISOString() };
    case 'this_month':
    case 'last_month':
      return { from: monthBack(from).toISOString(), to: monthBack(end).toISOString() };
    default:
      return previousRange(range);
  }
}

/** "11 Sep 2026" for one day, "1 Sep 2026 – 11 Sep 2026" for a range. */
export function rangeCaption(range: DateRange, format: Formatters): string {
  const last = new Date(new Date(range.to).getTime() - 1);
  const first = new Date(range.from);
  return toLocalDate(first) === toLocalDate(last) ? format.date(first, 'long') : `${format.date(first)} – ${format.date(last)}`;
}
