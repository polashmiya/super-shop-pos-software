import { create } from 'zustand';
import type { DeepPartial } from '@/domain/settings';
import { useSettingsStore } from '@/stores/settingsStore';
import { toast } from '@/stores/uiStore';
import type { BusinessSettings, DeviceSettings } from '@/types';

/* ==========================================================================
   Instant-apply saving for the Settings Center.

   - Device settings (this terminal) apply immediately; the settings store
     writes them to electron-store (debounced).
   - Business settings (whole shop) are merged per section and saved to the
     database right away (each save is one audit entry). Unchanged values are
     skipped so the activity log stays clean.
   A tiny store pulses the "Saved" indicator in the page header.
   ========================================================================== */

interface SaveStatusState {
  savedAt: number;
  markSaved(): void;
}

export const useSaveStatus = create<SaveStatusState>((set) => ({
  savedAt: 0,
  markSaved: () => set({ savedAt: Date.now() }),
}));

/** Applies a device (terminal) settings patch instantly. */
export function saveDevice(patch: DeepPartial<DeviceSettings>): void {
  useSettingsStore.getState().updateDevice(patch);
  useSaveStatus.getState().markSaved();
}

function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Merges a patch into one business section and saves it. Resolves false (after a friendly toast) on failure. */
export async function saveBusiness<K extends keyof BusinessSettings>(key: K, patch: Partial<BusinessSettings[K]>): Promise<boolean> {
  const current = useSettingsStore.getState().business[key];
  const fields = current as unknown as Record<string, unknown>;
  const changed = Object.entries(patch).some(([field, value]) => !sameValue(fields[field], value));
  if (!changed) return true;
  const next = Object.assign({}, current, patch) as BusinessSettings[K];
  try {
    await useSettingsStore.getState().updateBusiness(key, next);
    useSaveStatus.getState().markSaved();
    return true;
  } catch (error) {
    toast.fromError(error);
    return false;
  }
}

/** Selector hooks for one settings group (re-render only when that group changes). */
export function useDeviceGroup<K extends keyof DeviceSettings>(key: K): DeviceSettings[K] {
  return useSettingsStore((state) => state.device[key]);
}

export function useBusinessGroup<K extends keyof BusinessSettings>(key: K): BusinessSettings[K] {
  return useSettingsStore((state) => state.business[key]);
}
