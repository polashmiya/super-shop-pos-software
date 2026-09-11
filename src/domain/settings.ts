import { DEFAULT_BUSINESS_SETTINGS, DEFAULT_DEVICE_SETTINGS, DEFAULT_SESSION } from '@/config/defaults';
import type { BusinessSettings, DeviceSettings, SessionState } from '@/types/settings';

/* ==========================================================================
   Settings merging. Persisted values are merged over the defaults with
   type checks, so unknown keys are dropped, wrong types fall back to the
   default and new options appear automatically after an upgrade.
   ========================================================================== */

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Deep-merges `stored` over `defaults`, keeping only keys/types the defaults define. */
export function mergeWithDefaults<T>(defaults: T, stored: unknown): T {
  if (!isPlainObject(defaults)) {
    if (Array.isArray(defaults)) return (Array.isArray(stored) ? stored : defaults) as T;
    if (defaults === null) return (stored === undefined ? defaults : stored) as T;
    return (typeof stored === typeof defaults ? stored : defaults) as T;
  }
  const source = isPlainObject(stored) ? stored : {};
  const result: Record<string, unknown> = {};
  for (const [key, defaultValue] of Object.entries(defaults)) {
    const storedValue = source[key];
    if (storedValue === undefined) {
      result[key] = defaultValue;
    } else if (defaultValue === null) {
      // Nullable fields (logo, lastCategoryId…) accept strings or null.
      result[key] = typeof storedValue === 'string' || storedValue === null ? storedValue : null;
    } else if (isPlainObject(defaultValue)) {
      // Records with dynamic keys (e.g. customerTypeRates) keep stored keys of the same type.
      result[key] = mergeWithDefaults(defaultValue, storedValue);
    } else {
      result[key] = mergeWithDefaults(defaultValue, storedValue);
    }
  }
  return result as T;
}

export function mergeDeviceSettings(stored: unknown): DeviceSettings {
  return mergeWithDefaults(DEFAULT_DEVICE_SETTINGS, stored);
}

export function mergeBusinessSettings(stored: unknown): BusinessSettings {
  return mergeWithDefaults(DEFAULT_BUSINESS_SETTINGS, stored);
}

export function mergeSession(stored: unknown): SessionState {
  return mergeWithDefaults(DEFAULT_SESSION, stored);
}

/** Deep partial for settings patches. */
export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends readonly unknown[] ? T[K] : T[K] extends object ? DeepPartial<T[K]> : T[K];
};

/** Applies a deep partial patch (arrays replace, objects merge). */
export function applyPatch<T>(base: T, patch: DeepPartial<T>): T {
  if (!isPlainObject(base) || !isPlainObject(patch)) return (patch as T) ?? base;
  const result: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    const current = (base as Record<string, unknown>)[key];
    result[key] = isPlainObject(current) && isPlainObject(value) ? applyPatch(current, value as DeepPartial<typeof current>) : value;
  }
  return result as T;
}
