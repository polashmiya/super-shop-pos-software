import { BANGLA_FONTS, UI_FONTS } from '@/config/theme.config';
import { useSettingsStore } from '@/stores/settingsStore';
import type { BanglaFontId, UiFontId, UserPreferences } from '@/types';

/* ==========================================================================
   A staff member's personal preferences (language, theme, fonts) are stored
   with their account and applied to this terminal when they sign in, so
   each cashier finds the counter the way they left it.
   ========================================================================== */

export function isUiFont(value: unknown): value is UiFontId {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(UI_FONTS, value);
}

export function isBanglaFont(value: unknown): value is BanglaFontId {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(BANGLA_FONTS, value);
}

/** Applies the saved preferences to this terminal's settings (unknown values are ignored). */
export function applyUserPreferences(preferences: UserPreferences): void {
  const { updateDevice } = useSettingsStore.getState();
  if (preferences.language === 'bn' || preferences.language === 'en') updateDevice({ locale: { language: preferences.language } });
  if (preferences.theme === 'dark' || preferences.theme === 'light' || preferences.theme === 'system') updateDevice({ appearance: { theme: preferences.theme } });
  if (isUiFont(preferences.uiFont)) updateDevice({ appearance: { uiFont: preferences.uiFont } });
  if (isBanglaFont(preferences.banglaFont)) updateDevice({ appearance: { banglaFont: preferences.banglaFont } });
}
