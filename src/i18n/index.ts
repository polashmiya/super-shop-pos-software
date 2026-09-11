import { useCallback } from 'react';
import { create } from 'zustand';
import { toBanglaDigits } from '@/domain/text';
import type { BilingualText, NumeralSystem } from '@/types/common';
import { bn } from './bn';
import { en } from './en';
import type { Language, Translate, TranslationKey, TranslationParams } from './types';

/* ==========================================================================
   Internationalisation runtime (Bangla first, English second).

   - Dictionaries are flattened once into Maps → O(1) lookups.
   - `{name}` placeholders; numeric params follow the numeral setting.
   - Plurals: "<key>_one" / "<key>_other" chosen from params.count.
   - UI language lives in a tiny store so every `useT()` re-renders instantly
     when the language changes; the settings store keeps it in sync.
   ========================================================================== */

export type { Language, TranslationKey, TranslationParams, Translate } from './types';

export const LOCALES: Record<Language, string> = { bn: 'bn-BD', en: 'en-US' };

function flatten(source: object, prefix = '', target = new Map<string, string>()): Map<string, string> {
  for (const [key, value] of Object.entries(source)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'string') target.set(path, value);
    else if (value && typeof value === 'object') flatten(value, path, target);
  }
  return target;
}

const DICTIONARIES: Record<Language, Map<string, string>> = {
  en: flatten(en),
  bn: flatten(bn),
};

interface I18nState {
  language: Language;
  numerals: NumeralSystem;
}

export const useI18nStore = create<I18nState>(() => ({ language: 'bn', numerals: 'en' }));

export function setI18nState(language: Language, numerals: NumeralSystem): void {
  const current = useI18nStore.getState();
  if (current.language !== language || current.numerals !== numerals) useI18nStore.setState({ language, numerals });
  if (typeof document !== 'undefined') document.documentElement.lang = language;
}

export function getLanguage(): Language {
  return useI18nStore.getState().language;
}

function formatParam(value: string | number, numerals: NumeralSystem): string {
  if (typeof value === 'number') {
    const text = Number.isInteger(value) ? value.toLocaleString('en-US') : value.toLocaleString('en-US', { maximumFractionDigits: 2 });
    return numerals === 'bn' ? toBanglaDigits(text) : text;
  }
  return value;
}

export function translate(language: Language, numerals: NumeralSystem, key: string, params?: TranslationParams): string {
  const dictionary = DICTIONARIES[language];
  let template: string | undefined;
  if (params && typeof params.count === 'number') {
    const pluralKey = `${key}_${params.count === 1 ? 'one' : 'other'}`;
    template = dictionary.get(pluralKey) ?? DICTIONARIES.en.get(pluralKey);
  }
  template ??= dictionary.get(key) ?? DICTIONARIES.en.get(key);
  if (template === undefined) {
    if (import.meta.env?.DEV) console.warn(`Missing translation: ${key}`);
    return key;
  }
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) => (name in params ? formatParam(params[name], numerals) : match));
}

/** Translate outside React (services, printing). Uses the current UI language. */
export const t: Translate = (key, params) => {
  const { language, numerals } = useI18nStore.getState();
  return translate(language, numerals, key, params);
};

/** Translate in a specific language (e.g. a receipt printed in the sale's language). */
export function tIn(language: Language, key: TranslationKey, params?: TranslationParams, numerals?: NumeralSystem): string {
  return translate(language, numerals ?? useI18nStore.getState().numerals, key, params);
}

/** React hook: translation function bound to the current language (re-renders on change). */
export function useT(): Translate {
  const language = useI18nStore((state) => state.language);
  const numerals = useI18nStore((state) => state.numerals);
  return useCallback<Translate>((key, params) => translate(language, numerals, key, params), [language, numerals]);
}

export function useLanguage(): Language {
  return useI18nStore((state) => state.language);
}

/** Picks the text for the current language from a { bn, en } pair. */
export function pick(text: BilingualText | null | undefined, language: Language): string {
  if (!text) return '';
  return (language === 'bn' ? text.bn || text.en : text.en || text.bn) ?? '';
}

export function useLocalize(): (text: BilingualText | null | undefined) => string {
  const language = useLanguage();
  return useCallback((text: BilingualText | null | undefined) => pick(text, language), [language]);
}

/** True when a translation exists for a dynamic key (e.g. notification keys stored in the DB). */
export function hasTranslation(key: string): boolean {
  return DICTIONARIES.en.has(key);
}
