import type { DateRange, IsoDate, IsoDateTime } from '@/types/common';
import type { ReportPeriod } from '@/types/report';

/* ==========================================================================
   Calendar helpers. Timestamps are stored as UTC ISO strings; periods are
   calculated in LOCAL time (the shop's clock) and returned as [from, to).
   Use these helpers instead of millisecond arithmetic (DST-safe).
   ========================================================================== */

/** Bangladesh retail weeks start on Saturday (0 = Sunday … 6 = Saturday). */
export const WEEK_STARTS_ON = 6;

export function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days, date.getHours(), date.getMinutes(), date.getSeconds(), date.getMilliseconds());
}

export function addMonths(date: Date, months: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + months, 1);
}

export function startOfWeek(date: Date): Date {
  const day = startOfDay(date);
  const diff = (day.getDay() - WEEK_STARTS_ON + 7) % 7;
  return addDays(day, -diff);
}

export function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

const pad = (value: number, length = 2): string => String(value).padStart(length, '0');

/** Local calendar date "yyyy-mm-dd". */
export function toLocalDate(date: Date): IsoDate {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Local calendar date "yyyymmdd" (document numbers). */
export function toCompactDate(date: Date): string {
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
}

/** Parses "yyyy-mm-dd" as a LOCAL date (Date.parse would treat it as UTC). */
export function parseLocalDate(value: IsoDate): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, (month ?? 1) - 1, day ?? 1);
}

export function nowIso(): IsoDateTime {
  return new Date().toISOString();
}

export function dayRange(date: Date): DateRange {
  const from = startOfDay(date);
  return { from: from.toISOString(), to: addDays(from, 1).toISOString() };
}

/** Converts a pair of local dates (inclusive) into an ISO [from, to) range. */
export function localDatesToRange(fromDate: IsoDate, toDate: IsoDate): DateRange {
  let first = parseLocalDate(fromDate);
  let last = parseLocalDate(toDate);
  // Dates picked in reverse order cover the same inclusive days.
  if (first > last) [first, last] = [last, first];
  return { from: first.toISOString(), to: addDays(last, 1).toISOString() };
}

export function resolvePeriod(period: ReportPeriod | 'all', now: Date = new Date(), custom?: DateRange): DateRange {
  const today = startOfDay(now);
  switch (period) {
    case 'today':
      return { from: today.toISOString(), to: addDays(today, 1).toISOString() };
    case 'yesterday':
      return { from: addDays(today, -1).toISOString(), to: today.toISOString() };
    case 'this_week':
      return { from: startOfWeek(today).toISOString(), to: addDays(today, 1).toISOString() };
    case 'this_month':
      return { from: startOfMonth(today).toISOString(), to: addDays(today, 1).toISOString() };
    case 'last_month': {
      const thisMonth = startOfMonth(today);
      return { from: addMonths(thisMonth, -1).toISOString(), to: thisMonth.toISOString() };
    }
    case 'last_30_days':
      return { from: addDays(today, -29).toISOString(), to: addDays(today, 1).toISOString() };
    case 'custom':
      return custom ?? { from: today.toISOString(), to: addDays(today, 1).toISOString() };
    case 'all':
    default:
      return { from: new Date(2000, 0, 1).toISOString(), to: addDays(today, 1).toISOString() };
  }
}

/** The same-length period immediately before `range` (for comparison deltas). */
export function previousRange(range: DateRange): DateRange {
  const from = new Date(range.from).getTime();
  const to = new Date(range.to).getTime();
  const length = to - from;
  return { from: new Date(from - length).toISOString(), to: new Date(from).toISOString() };
}

export function daysBetween(a: Date, b: Date): number {
  const start = startOfDay(a).getTime();
  const end = startOfDay(b).getTime();
  return Math.round((end - start) / 86_400_000);
}

export function isSameLocalDay(a: Date, b: Date): boolean {
  return toLocalDate(a) === toLocalDate(b);
}

/** List of local dates "yyyy-mm-dd" in [from, to). */
export function eachLocalDate(range: DateRange): IsoDate[] {
  const dates: IsoDate[] = [];
  let cursor = startOfDay(new Date(range.from));
  const end = new Date(range.to);
  while (cursor < end && dates.length < 800) {
    dates.push(toLocalDate(cursor));
    cursor = addDays(cursor, 1);
  }
  return dates;
}
