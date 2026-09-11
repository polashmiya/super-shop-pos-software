import { create } from 'zustand';
import { DEFAULT_BUSINESS_SETTINGS, DEFAULT_DEVICE_SETTINGS, DEFAULT_SESSION } from '@/config/defaults';
import { applyPatch, type DeepPartial } from '@/domain/settings';
import { setI18nState } from '@/i18n';
import { repos } from '@/repositories';
import { configureSounds } from '@/services/soundService';
import type { BusinessSettings, DeviceSettings, SessionState } from '@/types';
import { useAuthStore } from './authStore';

/* ==========================================================================
   Settings store. Device settings save automatically (debounced); business
   settings save per section. Language/numerals/sounds apply immediately.
   ========================================================================== */

interface SettingsState {
  device: DeviceSettings;
  business: BusinessSettings;
  session: SessionState;
  loaded: boolean;
  load(): Promise<void>;
  updateDevice(patch: DeepPartial<DeviceSettings>): void;
  resetDevice(section?: keyof DeviceSettings): void;
  updateBusiness<K extends keyof BusinessSettings>(key: K, value: BusinessSettings[K]): Promise<void>;
  resetBusiness(section?: keyof BusinessSettings): Promise<void>;
  updateSession(patch: Partial<SessionState>): Promise<void>;
  flush(): Promise<void>;
}

const SAVE_DELAY_MS = 250;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let pendingSave: Promise<void> | null = null;

function applySideEffects(device: DeviceSettings): void {
  setI18nState(device.locale.language, device.locale.numerals);
  configureSounds(device.sound);
}

function actor() {
  const user = useAuthStore.getState().user;
  return user ? { id: user.id, name: user.name.en } : null;
}

export const useSettingsStore = create<SettingsState>((set, get) => {
  const scheduleDeviceSave = (): void => {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveTimer = null;
      pendingSave = repos()
        .settings.saveDevice(get().device)
        .catch((error: unknown) => console.error('Saving device settings failed', error))
        .finally(() => {
          pendingSave = null;
        });
    }, SAVE_DELAY_MS);
  };

  return {
    device: DEFAULT_DEVICE_SETTINGS,
    business: DEFAULT_BUSINESS_SETTINGS,
    session: DEFAULT_SESSION,
    loaded: false,

    async load() {
      const settings = repos().settings;
      const [device, business, session] = await Promise.all([settings.getDevice(), settings.getBusiness(), settings.getSession()]);
      applySideEffects(device);
      set({ device, business, session, loaded: true });
    },

    updateDevice(patch) {
      const device = applyPatch(get().device, patch);
      applySideEffects(device);
      set({ device });
      scheduleDeviceSave();
    },

    resetDevice(section) {
      const current = get().device;
      const device = section ? { ...current, [section]: DEFAULT_DEVICE_SETTINGS[section] } : { ...DEFAULT_DEVICE_SETTINGS, terminal: current.terminal };
      // The terminal's counter assignment is never reset with UI settings.
      device.terminal = current.terminal;
      applySideEffects(device);
      set({ device });
      scheduleDeviceSave();
    },

    async updateBusiness(key, value) {
      const previous = get().business;
      set({ business: { ...previous, [key]: value } });
      try {
        await repos().settings.saveBusiness(key, value, actor());
      } catch (error) {
        set({ business: previous });
        throw error;
      }
    },

    async resetBusiness(section) {
      const keys = section ? [section] : (Object.keys(DEFAULT_BUSINESS_SETTINGS) as Array<keyof BusinessSettings>);
      for (const key of keys) {
        await get().updateBusiness(key, DEFAULT_BUSINESS_SETTINGS[key]);
      }
    },

    async updateSession(patch) {
      const session = { ...get().session, ...patch };
      set({ session });
      await repos().settings.saveSession(session);
    },

    async flush() {
      if (saveTimer) {
        clearTimeout(saveTimer);
        saveTimer = null;
        await repos().settings.saveDevice(get().device);
      }
      if (pendingSave) await pendingSave;
    },
  };
});

/* Selector helpers (avoid re-rendering on unrelated settings changes). */
export const useAppearance = () => useSettingsStore((state) => state.device.appearance);
export const usePosSettings = () => useSettingsStore((state) => state.device.pos);
export const useBusiness = () => useSettingsStore((state) => state.business);
