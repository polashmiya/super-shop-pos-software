import Store from 'electron-store';
import { APP_CONFIG } from '@/config/app.config';
import { mergeDeviceSettings, mergeSession } from '@/domain/settings';
import type { CartDraft } from '@/types/sales';
import { DEMO_TERMINAL_COUNTER_ID } from '@/data/seed/demoUsers';
import type { DeviceStoreKey } from '../shared/ipcChannels';
import type { DeviceStoreSchema } from '../types/electron';

/* ==========================================================================
   Device-level settings (electron-store → <userData>/config.json): look &
   feel, language, printer, POS behaviour, shortcuts, terminal counter, the
   local session and the in-progress POS cart (crash recovery).
   Values are validated/merged with defaults on every read and write.
   ========================================================================== */

const MAX_VALUE_BYTES = 2 * 1024 * 1024;

let store: Store<DeviceStoreSchema> | null = null;

function getStore(): Store<DeviceStoreSchema> {
  if (!store) {
    store = new Store<DeviceStoreSchema>({
      name: 'config',
      clearInvalidConfig: true,
    });
  }
  return store;
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

export function readDevice<K extends DeviceStoreKey>(key: K): DeviceStoreSchema[K] {
  const raw = getStore().get(key);
  switch (key) {
    case 'device': {
      const device = mergeDeviceSettings(raw);
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

export function writeDevice(key: DeviceStoreKey, value: unknown): void {
  const serialized = JSON.stringify(value ?? null);
  if (Buffer.byteLength(serialized, 'utf-8') > MAX_VALUE_BYTES) throw new Error('Value too large');
  switch (key) {
    case 'device':
      getStore().set('device', mergeDeviceSettings(value));
      break;
    case 'session':
      getStore().set('session', mergeSession(value));
      break;
    case 'posDraft':
      getStore().set('posDraft', sanitizeDraft(value));
      break;
    default:
      throw new Error('Unknown store key');
  }
}

export function deleteDevice(key: DeviceStoreKey): void {
  getStore().delete(key);
}

/** Removes device data except the terminal assignment (used by "Clear local data"). */
export function resetDeviceSession(): void {
  const session = readDevice('session');
  getStore().set('session', { ...session, lastUserId: null });
  getStore().delete('posDraft');
}
