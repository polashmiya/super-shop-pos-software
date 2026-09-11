import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { SETTING_ENTRIES, searchSettings } from '@/features/settings/searchIndex';
import { SETTINGS_SECTIONS, type SettingsSectionId } from '@/features/settings/sections';
import { hasTranslation, translate, type Language, type Translate } from '@/i18n';

/* Settings search (spec §111): every indexed setting leads to a real control, in both languages. */

const SECTIONS_DIR = path.resolve(__dirname, '../../src/features/settings/sections');
const COMPONENTS = readFileSync(path.resolve(__dirname, '../../src/features/settings/sectionComponents.ts'), 'utf8');

/** Source of the component that renders a section (from the lazy-import map). */
function sectionSource(id: SettingsSectionId): string {
  const match = new RegExp(`\\b${id}: section\\(\\(\\) => import\\('\\./sections/(\\w+)'\\)\\)`).exec(COMPONENTS);
  if (!match) throw new Error(`No component for section ${id}`);
  return readFileSync(path.join(SECTIONS_DIR, `${match[1]}.tsx`), 'utf8');
}

/** True when the section renders `data-setting={anchor}`: a literal, or a template such as `receipt-${key}`. */
function rendersAnchor(source: string, anchor: string): boolean {
  if (source.includes(`anchor="${anchor}"`)) return true;
  const dash = anchor.indexOf('-');
  if (dash < 0) return false;
  const prefix = anchor.slice(0, dash);
  const value = anchor.slice(dash + 1);
  return source.includes(`anchor={\`${prefix}-\${`) && source.includes(`'${value}'`);
}

const tIn =
  (language: Language): Translate =>
  (key, params) =>
    translate(language, 'en', key, params);
const everySection = new Set<SettingsSectionId>(SETTINGS_SECTIONS.map((section) => section.id));

describe('settings search index', () => {
  it('points every entry at a control that exists in its section', () => {
    const missing = SETTING_ENTRIES.filter((entry) => entry.anchor && !rendersAnchor(sectionSource(entry.section), entry.anchor)).map((entry) => `${entry.section}:${entry.anchor}`);
    expect(missing).toEqual([]);
  });

  it('uses labels that exist in the dictionaries', () => {
    expect(SETTING_ENTRIES.filter((entry) => !hasTranslation(entry.labelKey)).map((entry) => entry.labelKey)).toEqual([]);
  });

  it('finds the product image settings and the receipt logo for "image" (spec example)', () => {
    const anchors = searchSettings('image', tIn('en'), everySection).map((entry) => entry.anchor);
    expect(anchors).toEqual(expect.arrayContaining(['productImages', 'productImageSize', 'receipt-showLogo']));
  });

  it('finds settings with Bangla words and Bangla brand names', () => {
    expect(searchSettings('ছবি', tIn('bn'), everySection).map((entry) => entry.anchor)).toContain('productImages');
    expect(searchSettings('বিকাশ', tIn('bn'), everySection).map((entry) => entry.anchor)).toContain('provider-bkash');
    expect(searchSettings('ভ্যাট', tIn('bn'), everySection).some((entry) => entry.section === 'tax')).toBe(true);
  });

  it('only returns sections the user may open', () => {
    const cashier = new Set<SettingsSectionId>(SETTINGS_SECTIONS.filter((section) => section.permission === null).map((section) => section.id));
    const results = searchSettings('backup', tIn('en'), cashier);
    expect(results.every((entry) => cashier.has(entry.section))).toBe(true);
    expect(results.some((entry) => entry.section === 'data')).toBe(false);
  });
});
