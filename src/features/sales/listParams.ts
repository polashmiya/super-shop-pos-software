import { useCallback } from 'react';
import { useSearchParams } from 'react-router';
import { APP_CONFIG } from '@/config/app.config';
import { localDatesToRange, toLocalDate } from '@/domain/dates';
import { defaultReportFilter } from '@/services/reportService';
import type { DateRange, ReportPeriod } from '@/types';

/* ==========================================================================
   List state kept in the URL (?period=…&q=…&page=…). Filters survive opening
   a record and coming back, and links can pre-filter a list
   (e.g. /sales?customer=<id>). Updates replace the history entry.
   ========================================================================== */

export type ParamPatch = Record<string, string | number | null | undefined>;

export function useListParams(): [URLSearchParams, (patch: ParamPatch) => void] {
  const [params, setParams] = useSearchParams();
  const update = useCallback(
    (patch: ParamPatch) => {
      setParams(
        (current) => {
          const next = new URLSearchParams(current);
          for (const [key, value] of Object.entries(patch)) {
            if (value === null || value === undefined || value === '') next.delete(key);
            else next.set(key, String(value));
          }
          return next;
        },
        { replace: true },
      );
    },
    [setParams],
  );
  return [params, update];
}

const LOCAL_DATE = /^\d{4}-\d{2}-\d{2}$/;

export interface PeriodState {
  period: ReportPeriod;
  range: DateRange;
}

/** Reads ?period (+ ?from/?to local dates for a custom range). */
export function readPeriod(params: URLSearchParams, allowed: readonly ReportPeriod[], fallback: ReportPeriod): PeriodState {
  const raw = params.get('period') as ReportPeriod | null;
  const period = raw && allowed.includes(raw) ? raw : fallback;
  if (period === 'custom') {
    const from = params.get('from') ?? '';
    const to = params.get('to') ?? '';
    if (LOCAL_DATE.test(from) && LOCAL_DATE.test(to)) return { period, range: localDatesToRange(from, to) };
  }
  const filter = defaultReportFilter(period === 'custom' ? 'today' : period);
  return { period, range: { from: filter.from, to: filter.to } };
}

/** URL patch for a PeriodPicker change (resets to the first page). */
export function periodPatch(period: ReportPeriod, custom?: DateRange): ParamPatch {
  if (period !== 'custom' || !custom) return { period, from: null, to: null, page: null };
  const lastDay = new Date(new Date(custom.to).getTime() - 1);
  return { period, from: toLocalDate(new Date(custom.from)), to: toLocalDate(lastDay), page: null };
}

/** Link query for a custom date range, e.g. "a customer's sales since they joined". */
export function customRangeQuery(from: Date, to: Date): string {
  return `period=custom&from=${toLocalDate(from)}&to=${toLocalDate(to)}`;
}

export function readPaging(params: URLSearchParams): { page: number; pageSize: number } {
  const page = Math.max(1, Math.trunc(Number(params.get('page')) || 1));
  const size = Number(params.get('size'));
  const pageSize = (APP_CONFIG.tables.pageSizes as readonly number[]).includes(size) ? size : APP_CONFIG.tables.defaultPageSize;
  return { page, pageSize };
}

export function readChoice<T extends string>(params: URLSearchParams, key: string, allowed: readonly T[], fallback: T): T {
  const value = params.get(key) as T | null;
  return value && allowed.includes(value) ? value : fallback;
}

/** The last day (inclusive) of a [from, to) range, for display. */
export function lastDayOf(range: DateRange): Date {
  return new Date(new Date(range.to).getTime() - 1);
}
