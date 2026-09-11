import { matchesTokens, normalizeSearch, tokenize } from '@/domain/text';
import { translate } from '@/i18n';
import type { ReportId } from '@/types';
import { isReportId } from './definitions';
import type { ReportDefinition } from './types';

/** Reports whose name, description or group matches the query in Bangla or English. */
export function matchReports(reports: readonly ReportDefinition[], query: string): ReportDefinition[] {
  const tokens = tokenize(query);
  if (tokens.length === 0) return [...reports];
  return reports.filter((report) => {
    const keys = [`reports.items.${report.id}.title`, `reports.items.${report.id}.description`, `reports.groups.${report.group}.title`];
    const text = (['en', 'bn'] as const).flatMap((language) => keys.map((key) => translate(language, 'en', key))).join(' ');
    return matchesTokens(normalizeSearch(`${report.id} ${text}`), tokens);
  });
}

/* ==========================================================================
   Favourite and recently viewed reports, remembered per user on this
   computer. Storage can be unavailable (private mode, quota): every access
   is guarded and the library still works without it.
   ========================================================================== */

const RECENT_LIMIT = 6;

const favouritesKey = (userId: string) => `reports:favourites:${userId}`;
const recentKey = (userId: string) => `reports:recent:${userId}`;

function read(key: string): ReportId[] {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(key) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter(isReportId) : [];
  } catch {
    return [];
  }
}

function write(key: string, ids: readonly ReportId[]): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(ids));
  } catch {
    // Not remembered this time; nothing else depends on it.
  }
}

export function readFavourites(userId: string): ReportId[] {
  return read(favouritesKey(userId));
}

/** Adds or removes a favourite; returns the new list. */
export function toggleFavourite(userId: string, id: ReportId): ReportId[] {
  const current = readFavourites(userId);
  const next = current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id];
  write(favouritesKey(userId), next);
  return next;
}

export function readRecent(userId: string): ReportId[] {
  return read(recentKey(userId));
}

/** Moves a report to the front of the recently viewed list. */
export function recordRecent(userId: string, id: ReportId): void {
  write(recentKey(userId), [id, ...readRecent(userId).filter((entry) => entry !== id)].slice(0, RECENT_LIMIT));
}
