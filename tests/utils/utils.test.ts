import { describe, expect, it } from 'vitest';
import { comboMatches, displayCombo, eventToCombo, firesWhileTyping } from '@/app/shortcuts';
import { DEFAULT_BUSINESS_SETTINGS, DEFAULT_SHORTCUTS } from '@/config/defaults';
import { csvMoney, exportFileName, toCsv } from '@/utils/csv';
import { createFormatters } from '@/utils/format';

const key = (init: Partial<KeyboardEventInit> & { key: string }) => new KeyboardEvent('keydown', init);

describe('csv', () => {
  it('quotes commas, quotes and new lines, and leaves plain cells alone', () => {
    const csv = toCsv(['Name', 'Note'], [
      ['চাল, মিনিকেট', 'He said "hi"'],
      ['Line\nbreak', null],
      [12.5, true],
    ]);
    expect(csv.split('\r\n')).toEqual(['Name,Note', '"চাল, মিনিকেট","He said ""hi"""', '"Line\nbreak",', '12.5,true']);
  });

  it('writes money as plain decimals and builds safe file names', () => {
    expect(csvMoney(123450)).toBe('1234.50');
    expect(csvMoney(-5)).toBe('-0.05');
    expect(exportFileName('Stock Levels / All', 'csv')).toMatch(/^stock-levels-all-\d{8}\.csv$/);
    expect(exportFileName('###', 'json')).toMatch(/^export-\d{8}\.json$/);
  });
});

describe('shortcuts', () => {
  it('turns key events into combos (Ctrl = Mod on Windows/Linux)', () => {
    expect(eventToCombo(key({ key: 'F9' }))).toBe('F9');
    expect(eventToCombo(key({ key: 'k', ctrlKey: true }))).toBe('Mod+K');
    expect(eventToCombo(key({ key: 'Enter', ctrlKey: true }))).toBe('Mod+Enter');
    expect(eventToCombo(key({ key: '+', shiftKey: true }))).toBe('+');
    expect(eventToCombo(key({ key: 'Tab', shiftKey: true }))).toBe('Shift+Tab');
  });

  it('matches the default shortcuts case-insensitively', () => {
    expect(comboMatches(key({ key: 'F9' }), DEFAULT_SHORTCUTS.payment)).toBe(true);
    expect(comboMatches(key({ key: 'K', ctrlKey: true }), DEFAULT_SHORTCUTS.globalSearch)).toBe(true);
    expect(comboMatches(key({ key: 'F8' }), DEFAULT_SHORTCUTS.payment)).toBe(false);
    expect(comboMatches(key({ key: 'F9' }), '')).toBe(false);
  });

  it('only lets function keys and modifier combos fire while typing', () => {
    expect(firesWhileTyping('F7')).toBe(true);
    expect(firesWhileTyping('Mod+Enter')).toBe(true);
    expect(firesWhileTyping('Delete')).toBe(false);
    expect(firesWhileTyping('+')).toBe(false);
  });

  it('shows combos in a friendly way', () => {
    expect(displayCombo('Mod+K')).toBe('Ctrl+K');
    expect(displayCombo('Mod+Delete')).toBe('Ctrl+Del');
    expect(displayCombo('+')).toBe('+');
    expect(displayCombo('')).toBe('');
  });

  it('has no duplicate default bindings', () => {
    const combos = Object.values(DEFAULT_SHORTCUTS).map((combo) => combo.toLowerCase());
    expect(new Set(combos).size).toBe(combos.length);
  });
});

describe('format', () => {
  const currency = DEFAULT_BUSINESS_SETTINGS.currency;
  const en = createFormatters({ language: 'en', numerals: 'en', currency, clock: '12h' });
  const bn = createFormatters({ language: 'bn', numerals: 'bn', currency, clock: '12h' });

  it('formats money from poisha with the taka sign', () => {
    expect(en.money(123_456)).toContain('1,234.56');
    expect(en.money(123_456)).toContain('৳');
    expect(en.money(500_000)).toContain('5,000');
    expect(en.money(-2_500, { signed: true })).toContain('25');
    expect(bn.money(123_456)).toContain('১,২৩৪.৫৬');
  });

  it('formats percentages from basis points and quantities with units', () => {
    expect(en.percent(500)).toBe('5%');
    expect(en.percent(750)).toBe('7.5%');
    expect(en.quantity(1.5, 'kg')).toContain('1.5');
    expect(en.quantity(1.5, 'kg')).toContain('kg');
    expect(bn.integer(2026)).toBe('২,০২৬');
  });

  it('writes large amounts compactly (lakh / crore)', () => {
    expect(en.compactMoney(250_000_00)).toMatch(/2\.5\s?L/);
    expect(bn.compactMoney(1_20_00_000_00)).toContain('কোটি');
  });
});
