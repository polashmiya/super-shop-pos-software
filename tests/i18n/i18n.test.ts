import { describe, expect, it } from 'vitest';
import { bn } from '@/i18n/bn';
import { en } from '@/i18n/en';
import { hasTranslation, translate } from '@/i18n';

/* Dictionary completeness: TypeScript checks the shape; these tests check the content. */

type Tree = { readonly [key: string]: string | Tree };

function flatten(tree: Tree, prefix = '', out = new Map<string, string>()): Map<string, string> {
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'string') out.set(path, value);
    else flatten(value, path, out);
  }
  return out;
}

const english = flatten(en as unknown as Tree);
const bangla = flatten(bn as unknown as Tree);
const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();

describe('dictionaries', () => {
  it('have exactly the same keys in English and Bangla', () => {
    const missingInBn = [...english.keys()].filter((key) => !bangla.has(key));
    const extraInBn = [...bangla.keys()].filter((key) => !english.has(key));
    expect(missingInBn).toEqual([]);
    expect(extraInBn).toEqual([]);
  });

  it('have no empty texts', () => {
    const empty = [...english, ...bangla].filter(([, value]) => value.trim() === '').map(([key]) => key);
    expect(empty).toEqual([]);
  });

  it('use the same placeholders in both languages', () => {
    const mismatched = [...english].filter(([key, value]) => bangla.has(key) && placeholders(value).join() !== placeholders(bangla.get(key) ?? '').join()).map(([key]) => key);
    expect(mismatched).toEqual([]);
  });

  it('always define plural forms in pairs', () => {
    const unpaired = [...english.keys()].filter((key) => (key.endsWith('_one') && !english.has(key.replace(/_one$/, '_other'))) || (key.endsWith('_other') && !english.has(key.replace(/_other$/, '_one'))));
    expect(unpaired).toEqual([]);
  });

  it('are really translated (Bangla texts contain Bangla script)', () => {
    const untranslated = [...bangla]
      .filter(([key, value]) => /[a-z]{4,}/i.test(value) && !/[ঀ-৿]/.test(value) && value === english.get(key))
      .map(([key]) => key)
      // Names, codes and technical words that are written the same in both languages.
      .filter((key) => !/(fileName|exportName|sku|barcode|bkash|nagad|rocket|visa|mastercard|amex|unionpay|upay|pdf|csv|json|email|pin|url|brand)$/i.test(key));
    expect(untranslated.length).toBeLessThan(english.size * 0.02);
  });
});

describe('translate', () => {
  it('interpolates parameters and picks plural forms', () => {
    expect(translate('en', 'en', 'common.units.items', { count: 1 })).toBe('1 item');
    expect(translate('en', 'en', 'common.units.items', { count: 3 })).toBe('3 items');
    expect(translate('en', 'en', 'common.table.showing', { from: 1, to: 25, total: 1312 })).toBe('Showing 1–25 of 1,312');
  });

  it('converts numeric parameters to Bangla digits when asked', () => {
    expect(translate('bn', 'bn', 'common.units.items', { count: 12 })).toContain('১২');
  });

  it('falls back to the key instead of throwing for an unknown key', () => {
    expect(translate('bn', 'en', 'nope.missing.key')).toBe('nope.missing.key');
    expect(hasTranslation('common.actions.save')).toBe(true);
    expect(hasTranslation('nope.missing.key')).toBe(false);
  });
});
