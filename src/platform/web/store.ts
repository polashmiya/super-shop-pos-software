import { APP_CONFIG } from '@/config/app.config';
import { DEMO_TERMINAL_COUNTER_ID } from '@/data/seed/demoUsers';
import { mergeDeviceSettings, mergeSession } from '@/domain/settings';
import type { CartDraft } from '@/types/sales';
import type { DeviceStoreSchema, ElectronAPI } from '../../../electron/types/electron';

/* ==========================================================================
   Per-device settings, session and cart draft — electron-store's role in the
   desktop app, localStorage's in the browser.

   Values are validated and merged with the defaults on every read and write,
   exactly as electron/main/deviceStore.ts does, so a hand-edited or stale
   value cannot break start-up. Every access is guarded too: a private window
   can refuse storage outright, and losing device preferences must never stop
   the till from opening.
   ========================================================================== */

const PREFIX = 'super-shop-pos:';
const MAX_VALUE_BYTES = 2 * 1024 * 1024;

/** Used when localStorage is unavailable, so the app still works for the session. */
const fallback = new Map<string, string>();

function readRaw(key: string): string | null {
  try {
    return globalThis.localStorage.getItem(PREFIX + key) ?? fallback.get(key) ?? null;
  } catch {
    return fallback.get(key) ?? null;
  }
}

function writeRaw(key: string, value: string): void {
  fallback.set(key, value);
  try {
    globalThis.localStorage.setItem(PREFIX + key, value);
  } catch {
    // Storage refused or full: the in-memory copy above still serves this session.
  }
}

function removeRaw(key: string): void {
  fallback.delete(key);
  try {
    globalThis.localStorage.removeItem(PREFIX + key);
  } catch {
    // Nothing to do: the value is already gone from the fallback.
  }
}

function parse(key: string): unknown {
  const raw = readRaw(key);
  if (raw === null) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    // Corrupted value: drop it rather than blocking start-up.
    removeRaw(key);
    return undefined;
  }
}

function sanitizeDraft(value: unknown): CartDraft | null {
  if (typeof value !== 'object' || value === null) return null;
  const draft = value as Partial<CartDraft>;
  if (!Array.isArray(draft.lines) || draft.lines.length > APP_CONFIG.pos.maxCartLines) return null;
  return {
    lines: draft.lines,
    customerId: typeof draft.customerId === 'string' ? draft.customerId : null,
    orderDiscount: draft.orderDiscount ?? null,
    note: typeof draft.note === 'string' ? draft.note.slice(0, 500) : '',
  };
}

function read<K extends keyof DeviceStoreSchema>(key: K): DeviceStoreSchema[K] {
  const raw = parse(key);
  switch (key) {
    case 'device': {
      const device = mergeDeviceSettings(raw);
      // A browser has no terminal of its own, so the demo counter is assumed
      // until Settings → Counter says otherwise — as on a fresh desktop install.
      if (!device.terminal.counterId) device.terminal.counterId = DEMO_TERMINAL_COUNTER_ID;
      return device as DeviceStoreSchema[K];
    }
    case 'session':
      return mergeSession(raw) as DeviceStoreSchema[K];
    case 'posDraft':
    default:
      return sanitizeDraft(raw) as DeviceStoreSchema[K];
  }
}

function write<K extends keyof DeviceStoreSchema>(key: K, value: DeviceStoreSchema[K]): void {
  const merged = key === 'device' ? mergeDeviceSettings(value) : key === 'session' ? mergeSession(value) : sanitizeDraft(value);
  const serialized = JSON.stringify(merged ?? null);
  if (new TextEncoder().encode(serialized).length > MAX_VALUE_BYTES) throw new Error('Value too large');
  writeRaw(key, serialized);
}

export function createWebDeviceStore(): ElectronAPI['store'] {
  return {
    get: <K extends keyof DeviceStoreSchema>(key: K) => Promise.resolve<DeviceStoreSchema[K] | undefined>(read(key)),
    set: <K extends keyof DeviceStoreSchema>(key: K, value: DeviceStoreSchema[K]) => {
      write(key, value);
      return Promise.resolve();
    },
    delete: (key: keyof DeviceStoreSchema) => {
      removeRaw(key);
      return Promise.resolve();
    },
  };
}

/** The stored device settings (a backup export records them alongside the data). */
export function readStoredDevice(): unknown {
  return read('device');
}
