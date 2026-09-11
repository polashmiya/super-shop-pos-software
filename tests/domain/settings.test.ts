// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { DEFAULT_BUSINESS_SETTINGS, DEFAULT_DEVICE_SETTINGS, DEFAULT_SESSION } from '@/config/defaults';
import { applyPatch, mergeBusinessSettings, mergeDeviceSettings, mergeSession, mergeWithDefaults } from '@/domain/settings';

describe('mergeWithDefaults', () => {
  it('returns the defaults for missing or malformed storage', () => {
    expect(mergeDeviceSettings(undefined)).toEqual(DEFAULT_DEVICE_SETTINGS);
    expect(mergeDeviceSettings(null)).toEqual(DEFAULT_DEVICE_SETTINGS);
    expect(mergeDeviceSettings('garbage')).toEqual(DEFAULT_DEVICE_SETTINGS);
    expect(mergeDeviceSettings([1, 2, 3])).toEqual(DEFAULT_DEVICE_SETTINGS);
    expect(mergeSession(undefined)).toEqual(DEFAULT_SESSION);
  });

  it('fills options added after the settings were saved', () => {
    const stored = structuredClone(DEFAULT_DEVICE_SETTINGS) as unknown as Record<string, Record<string, unknown>>;
    delete stored.pos.showSecondaryName;
    delete stored.notifications;
    const merged = mergeDeviceSettings(stored);
    expect(merged.pos.showSecondaryName).toBe(DEFAULT_DEVICE_SETTINGS.pos.showSecondaryName);
    expect(merged.notifications).toEqual(DEFAULT_DEVICE_SETTINGS.notifications);
  });

  it('keeps user values of the right type', () => {
    const merged = mergeDeviceSettings({
      appearance: { theme: 'light', baseFontPx: 17, animations: false },
      locale: { language: 'en', numerals: 'bn' },
      terminal: { counterId: 'counter-3' },
    });
    expect(merged.appearance.theme).toBe('light');
    expect(merged.appearance.baseFontPx).toBe(17);
    expect(merged.appearance.animations).toBe(false);
    expect(merged.appearance.accent).toBe(DEFAULT_DEVICE_SETTINGS.appearance.accent);
    expect(merged.locale).toEqual({ ...DEFAULT_DEVICE_SETTINGS.locale, language: 'en', numerals: 'bn' });
    expect(merged.terminal.counterId).toBe('counter-3');
    expect(merged.terminal.branchId).toBe(DEFAULT_DEVICE_SETTINGS.terminal.branchId);
  });

  it('drops unknown keys and falls back on wrong types', () => {
    const merged = mergeDeviceSettings({ appearance: { theme: 'light', baseFontPx: '16', foo: 1 }, bar: { baz: true } }) as unknown as Record<string, Record<string, unknown>>;
    expect(merged.bar).toBeUndefined();
    expect(merged.appearance.foo).toBeUndefined();
    expect(merged.appearance.baseFontPx).toBe(DEFAULT_DEVICE_SETTINGS.appearance.baseFontPx);
    expect(merged.appearance.theme).toBe('light');
  });

  it('accepts strings or null for nullable fields', () => {
    expect(mergeDeviceSettings({ pos: { lastCategoryId: 'cat-1' } }).pos.lastCategoryId).toBe('cat-1');
    expect(mergeDeviceSettings({ pos: { lastCategoryId: null } }).pos.lastCategoryId).toBeNull();
    expect(mergeDeviceSettings({ pos: { lastCategoryId: 5 } }).pos.lastCategoryId).toBeNull();
    expect(mergeBusinessSettings({ store: { logo: 'data:image/png;base64,AA' } }).store.logo).toBe('data:image/png;base64,AA');
  });

  it('replaces arrays as a whole and rejects non-arrays', () => {
    expect(mergeBusinessSettings({ tax: { rates: [0, 500] } }).tax.rates).toEqual([0, 500]);
    expect(mergeBusinessSettings({ tax: { rates: 'x' } }).tax.rates).toEqual(DEFAULT_BUSINESS_SETTINGS.tax.rates);
    expect(mergeBusinessSettings({ payment: { quickCash: [] } }).payment.quickCash).toEqual([]);
  });

  it('keeps nested business values and fills the rest', () => {
    const merged = mergeBusinessSettings({ loyalty: { earnStep: 20_000 }, discount: { customerTypeRates: { vip: 700 } }, sales: { rounding: 'nearest_1' } });
    expect(merged.loyalty).toEqual({ ...DEFAULT_BUSINESS_SETTINGS.loyalty, earnStep: 20_000 });
    expect(merged.discount.customerTypeRates).toEqual({ ...DEFAULT_BUSINESS_SETTINGS.discount.customerTypeRates, vip: 700 });
    expect(merged.sales.rounding).toBe('nearest_1');
    expect(merged.store).toEqual(DEFAULT_BUSINESS_SETTINGS.store);
  });

  it('works for primitive defaults', () => {
    expect(mergeWithDefaults(5, 7)).toBe(7);
    expect(mergeWithDefaults(5, '7')).toBe(5);
    expect(mergeWithDefaults<string | null>(null, 'x')).toBe('x');
    expect(mergeWithDefaults<string | null>(null, undefined)).toBeNull();
  });

  it('merges the session', () => {
    expect(mergeSession({ firstRunCompleted: true, lastUserId: 'u1', unknown: 1 })).toEqual({ ...DEFAULT_SESSION, firstRunCompleted: true, lastUserId: 'u1' });
  });
});

describe('applyPatch', () => {
  it('deep-merges objects, replaces arrays and skips undefined', () => {
    const base = mergeBusinessSettings(undefined);
    const patched = applyPatch(base, { tax: { rates: [0, 1_500], enabled: undefined }, loyalty: { enabled: false } });
    expect(patched.tax.rates).toEqual([0, 1_500]);
    expect(patched.tax.enabled).toBe(base.tax.enabled);
    expect(patched.tax.mode).toBe(base.tax.mode);
    expect(patched.loyalty.enabled).toBe(false);
    expect(patched.loyalty.earnStep).toBe(base.loyalty.earnStep);
  });

  it('does not mutate the base object', () => {
    const base = structuredClone(DEFAULT_DEVICE_SETTINGS);
    const snapshot = structuredClone(base);
    const patched = applyPatch(base, { appearance: { theme: 'light' } });
    expect(base).toEqual(snapshot);
    expect(patched.appearance.theme).toBe('light');
    expect(patched.appearance).not.toBe(base.appearance);
    expect(patched.pos).toBe(base.pos);
  });
});
