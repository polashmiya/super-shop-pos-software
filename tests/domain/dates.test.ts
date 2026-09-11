// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  addDays,
  addMonths,
  dayRange,
  daysBetween,
  eachLocalDate,
  isSameLocalDay,
  localDatesToRange,
  parseLocalDate,
  previousRange,
  resolvePeriod,
  startOfDay,
  startOfMonth,
  startOfWeek,
  toCompactDate,
  toLocalDate,
  WEEK_STARTS_ON,
} from '@/domain/dates';

/*
 * The helpers work in the runtime's LOCAL time. Most tests build dates with
 * the local Date constructor, so they hold in any time zone; the Asia/Dhaka
 * block additionally checks the concrete UTC instants when the tests run on
 * a Bangladeshi machine (UTC+6, no daylight saving).
 */

const local = (year: number, month: number, day: number, hours = 0, minutes = 0, seconds = 0, ms = 0) => new Date(year, month - 1, day, hours, minutes, seconds, ms);
const iso = (year: number, month: number, day: number) => local(year, month, day).toISOString();
// 10 September 2026 is a Thursday.
const NOW = local(2026, 9, 10, 15, 30);

describe('calendar basics', () => {
  it('starts weeks on Saturday (Bangladesh retail week)', () => {
    expect(WEEK_STARTS_ON).toBe(6);
    expect(NOW.getDay()).toBe(4);
    expect(toLocalDate(startOfWeek(NOW))).toBe('2026-09-05');
    expect(toLocalDate(startOfWeek(local(2026, 9, 11)))).toBe('2026-09-05'); // Friday → previous Saturday
    expect(toLocalDate(startOfWeek(local(2026, 9, 12, 20)))).toBe('2026-09-12'); // Saturday → itself
    expect(toLocalDate(startOfWeek(local(2026, 9, 13)))).toBe('2026-09-12'); // Sunday
    expect(startOfWeek(NOW).getHours()).toBe(0);
  });

  it('truncates to the local day and month', () => {
    expect(startOfDay(NOW)).toEqual(local(2026, 9, 10));
    expect(startOfMonth(NOW)).toEqual(local(2026, 9, 1));
  });

  it('adds calendar days keeping the time of day, across month and year ends', () => {
    expect(addDays(NOW, 1)).toEqual(local(2026, 9, 11, 15, 30));
    expect(addDays(NOW, -10)).toEqual(local(2026, 8, 31, 15, 30));
    expect(addDays(local(2026, 12, 31, 23, 59), 1)).toEqual(local(2027, 1, 1, 23, 59));
    expect(addDays(local(2028, 2, 28), 1)).toEqual(local(2028, 2, 29)); // leap year
  });

  it('adds months landing on the first of the month', () => {
    expect(addMonths(NOW, -1)).toEqual(local(2026, 8, 1));
    expect(addMonths(local(2026, 1, 31), 1)).toEqual(local(2026, 2, 1));
    expect(addMonths(local(2026, 12, 15), 1)).toEqual(local(2027, 1, 1));
  });

  it('formats and parses local calendar dates', () => {
    expect(toLocalDate(NOW)).toBe('2026-09-10');
    expect(toCompactDate(NOW)).toBe('20260910');
    expect(toLocalDate(local(2026, 1, 5))).toBe('2026-01-05');
    expect(parseLocalDate('2026-09-10')).toEqual(local(2026, 9, 10));
    expect(toLocalDate(parseLocalDate('2026-02-28'))).toBe('2026-02-28');
  });

  it('switches the local date exactly at local midnight', () => {
    expect(toLocalDate(local(2026, 9, 10, 23, 59, 59, 999))).toBe('2026-09-10');
    expect(toLocalDate(local(2026, 9, 11, 0, 0, 0, 0))).toBe('2026-09-11');
    expect(isSameLocalDay(local(2026, 9, 10, 0, 0), local(2026, 9, 10, 23, 59))).toBe(true);
    expect(isSameLocalDay(local(2026, 9, 10, 23, 59), local(2026, 9, 11, 0, 1))).toBe(false);
  });

  it('counts calendar days, not 24-hour blocks', () => {
    expect(daysBetween(local(2026, 9, 10, 23, 59), local(2026, 9, 11, 0, 1))).toBe(1);
    expect(daysBetween(local(2026, 9, 11, 0, 1), local(2026, 9, 10, 23, 59))).toBe(-1);
    expect(daysBetween(local(2026, 9, 10, 0, 0), local(2026, 9, 10, 23, 59))).toBe(0);
    expect(daysBetween(local(2026, 9, 1), local(2026, 10, 1))).toBe(30);
  });
});

describe('ranges', () => {
  it('builds [from, to) for a local day', () => {
    expect(dayRange(NOW)).toEqual({ from: iso(2026, 9, 10), to: iso(2026, 9, 11) });
  });

  it('converts inclusive local dates into an ISO [from, to) range', () => {
    expect(localDatesToRange('2026-09-01', '2026-09-10')).toEqual({ from: iso(2026, 9, 1), to: iso(2026, 9, 11) });
    expect(localDatesToRange('2026-09-10', '2026-09-10')).toEqual({ from: iso(2026, 9, 10), to: iso(2026, 9, 11) });
  });

  it('covers the same inclusive days when the dates are picked in reverse order', () => {
    expect(localDatesToRange('2026-09-10', '2026-09-01')).toEqual({ from: iso(2026, 9, 1), to: iso(2026, 9, 11) });
  });

  it('resolves report periods relative to now', () => {
    expect(resolvePeriod('today', NOW)).toEqual({ from: iso(2026, 9, 10), to: iso(2026, 9, 11) });
    expect(resolvePeriod('yesterday', NOW)).toEqual({ from: iso(2026, 9, 9), to: iso(2026, 9, 10) });
    expect(resolvePeriod('this_week', NOW)).toEqual({ from: iso(2026, 9, 5), to: iso(2026, 9, 11) });
    expect(resolvePeriod('this_month', NOW)).toEqual({ from: iso(2026, 9, 1), to: iso(2026, 9, 11) });
    expect(resolvePeriod('last_month', NOW)).toEqual({ from: iso(2026, 8, 1), to: iso(2026, 9, 1) });
    expect(resolvePeriod('last_30_days', NOW)).toEqual({ from: iso(2026, 8, 12), to: iso(2026, 9, 11) });
    expect(resolvePeriod('all', NOW)).toEqual({ from: iso(2000, 1, 1), to: iso(2026, 9, 11) });
  });

  it('uses the custom range when given, else today', () => {
    const custom = { from: iso(2026, 8, 3), to: iso(2026, 8, 9) };
    expect(resolvePeriod('custom', NOW, custom)).toEqual(custom);
    expect(resolvePeriod('custom', NOW)).toEqual(resolvePeriod('today', NOW));
  });

  it('handles the first days of a month and year', () => {
    const newYear = local(2027, 1, 1, 9);
    expect(resolvePeriod('last_month', newYear)).toEqual({ from: iso(2026, 12, 1), to: iso(2027, 1, 1) });
    expect(resolvePeriod('yesterday', newYear)).toEqual({ from: iso(2026, 12, 31), to: iso(2027, 1, 1) });
  });

  it('gives the same-length period right before a range', () => {
    expect(previousRange({ from: iso(2026, 9, 5), to: iso(2026, 9, 11) })).toEqual({ from: iso(2026, 8, 30), to: iso(2026, 9, 5) });
    expect(previousRange(resolvePeriod('today', NOW))).toEqual(resolvePeriod('yesterday', NOW));
  });

  it('lists the local dates of a range', () => {
    expect(eachLocalDate({ from: iso(2026, 9, 8), to: iso(2026, 9, 11) })).toEqual(['2026-09-08', '2026-09-09', '2026-09-10']);
    expect(eachLocalDate({ from: iso(2026, 9, 8), to: iso(2026, 9, 8) })).toEqual([]);
    expect(eachLocalDate(resolvePeriod('last_30_days', NOW))).toHaveLength(30);
  });
});

describe('Asia/Dhaka (UTC+6) conversions around midnight', () => {
  const offsets = [new Date(2026, 0, 15).getTimezoneOffset(), new Date(2026, 6, 15).getTimezoneOffset()];
  const inDhakaOffset = offsets.every((offset) => offset === -360);

  it('maps 18:00Z to the next local calendar day', () => {
    const beforeMidnight = new Date('2026-09-10T17:59:59.999Z');
    const atMidnight = new Date('2026-09-10T18:00:00.000Z');
    if (inDhakaOffset) {
      expect(toLocalDate(beforeMidnight)).toBe('2026-09-10');
      expect(toLocalDate(atMidnight)).toBe('2026-09-11');
      expect(toCompactDate(atMidnight)).toBe('20260911');
    }
    // In every zone the two instants are 1 ms apart and on consecutive or equal local days.
    expect(Math.abs(daysBetween(beforeMidnight, atMidnight))).toBeLessThanOrEqual(1);
  });

  it('stores local-day boundaries as the matching UTC instants', () => {
    const range = dayRange(new Date('2026-09-10T12:00:00+06:00'));
    if (inDhakaOffset) {
      expect(range).toEqual({ from: '2026-09-09T18:00:00.000Z', to: '2026-09-10T18:00:00.000Z' });
      expect(localDatesToRange('2026-09-10', '2026-09-10')).toEqual(range);
      expect(resolvePeriod('today', new Date('2026-09-10T23:59:00+06:00'))).toEqual(range);
      expect(resolvePeriod('today', new Date('2026-09-11T00:01:00+06:00'))).toEqual({ from: '2026-09-10T18:00:00.000Z', to: '2026-09-11T18:00:00.000Z' });
    }
    expect(new Date(range.to).getTime() - new Date(range.from).getTime()).toBe(86_400_000);
  });
});
