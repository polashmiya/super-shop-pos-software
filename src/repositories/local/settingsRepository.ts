import { mergeBusinessSettings, mergeDeviceSettings, mergeSession } from '@/domain/settings';
import type { BusinessSettings, CartDraft, DeviceSettings, SessionState } from '@/types';
import type { SqlClient } from '@/types/database';
import type { Actor, DeviceStorage, SettingsRepository } from '../types';
import { parseJson, toStr } from './sql';
import { auditStatement } from './statements';

/**
 * Business settings live in the SQLite `settings` table (one JSON value per
 * section); device settings, the session and the POS draft live in the
 * device store (electron-store).
 */
export class LocalSettingsRepository implements SettingsRepository {
  constructor(
    private readonly sql: SqlClient,
    private readonly device: DeviceStorage,
  ) {}

  async getBusiness(): Promise<BusinessSettings> {
    const rows = await this.sql.all('SELECT key, value FROM settings');
    const stored: Record<string, unknown> = {};
    for (const row of rows) stored[toStr(row.key)] = parseJson(row.value, undefined);
    return mergeBusinessSettings(stored);
  }

  async saveBusiness<K extends keyof BusinessSettings>(key: K, value: BusinessSettings[K], actor: Actor | null): Promise<void> {
    const now = new Date().toISOString();
    await this.sql.transaction([
      {
        sql: 'INSERT INTO settings (key, value, updated_at, updated_by) VALUES (?, ?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by',
        params: [key, JSON.stringify(value), now, actor?.id ?? null],
      },
      auditStatement(actor, 'settings.changed', 'settings', null, { section: key }, now),
    ]);
  }

  async getDevice(): Promise<DeviceSettings> {
    return mergeDeviceSettings(await this.device.get('device'));
  }

  async saveDevice(settings: DeviceSettings): Promise<void> {
    await this.device.set('device', settings);
  }

  async getSession(): Promise<SessionState> {
    return mergeSession(await this.device.get('session'));
  }

  async saveSession(session: SessionState): Promise<void> {
    await this.device.set('session', session);
  }

  async getDraft(): Promise<CartDraft | null> {
    return (await this.device.get<CartDraft | null>('posDraft')) ?? null;
  }

  async saveDraft(draft: CartDraft | null): Promise<void> {
    await this.device.set('posDraft', draft);
  }
}
