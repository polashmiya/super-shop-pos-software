import { matchesTokens, normalizeSearch, tokenize } from '@/domain/text';
import type { Translate, TranslationKey } from '@/i18n';
import { SETTINGS_SECTIONS, type SettingsSectionId } from './sections';
import { SETTING_ENTRIES } from './settingEntries';

/**
 * Searchable settings (settings search box + global command palette).
 * Each entry points to the section that contains the control; `anchor`
 * matches the control's `data-setting` so the page can scroll to it.
 */
export interface SettingsSearchEntry {
  section: SettingsSectionId;
  labelKey: TranslationKey;
  /** Extra words in both languages (e.g. "image photo ছবি"). */
  keywords?: string;
  /** `data-setting` of the control to highlight. */
  anchor?: string;
}

const SECTION_ENTRIES: SettingsSearchEntry[] = SETTINGS_SECTIONS.map((section) => ({
  section: section.id,
  labelKey: `settings.sections.${section.id}.title` as TranslationKey,
}));

export { SETTING_ENTRIES };

export const SETTINGS_SEARCH_INDEX: SettingsSearchEntry[] = [...SECTION_ENTRIES, ...SETTING_ENTRIES];

const MAX_RESULTS = 40;

/**
 * Settings whose label, section or keywords contain every word of the query
 * (Bangla digits and case are normalised). Only sections in `allowed` count.
 */
export function searchSettings(query: string, t: Translate, allowed: ReadonlySet<SettingsSectionId>): SettingsSearchEntry[] {
  const tokens = tokenize(query);
  if (tokens.length === 0) return [];
  const results: SettingsSearchEntry[] = [];
  const seen = new Set<string>();
  for (const entry of SETTINGS_SEARCH_INDEX) {
    if (!allowed.has(entry.section)) continue;
    const label = t(entry.labelKey);
    const key = `${entry.section}:${label}`;
    if (seen.has(key)) continue;
    const haystack = normalizeSearch(`${label} ${t(`settings.sections.${entry.section}.title` as TranslationKey)} ${entry.keywords ?? ''}`);
    if (!matchesTokens(haystack, tokens)) continue;
    seen.add(key);
    results.push(entry);
    if (results.length >= MAX_RESULTS) break;
  }
  return results;
}
