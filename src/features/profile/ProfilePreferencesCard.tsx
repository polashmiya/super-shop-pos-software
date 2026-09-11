import { SlidersHorizontal } from 'lucide-react';
import { BANGLA_FONTS, UI_FONTS } from '@/config/theme.config';
import { useT } from '@/i18n';
import { userService } from '@/services/userService';
import { useAuthStore } from '@/stores/authStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { toast } from '@/stores/uiStore';
import type { BanglaFontId, Language, ThemeMode, UiFontId, UserPreferences } from '@/types';
import { SegmentedControl, Select } from '@/components/ui/Controls';
import { SettingRow, SettingsCard } from '@/features/settings/components/SettingsCard';
import { applyUserPreferences } from './userPreferences';

const LANGUAGES: Language[] = ['bn', 'en'];
const THEMES: ThemeMode[] = ['dark', 'light', 'system'];

/**
 * Personal language, theme and fonts: applied to this terminal at once and
 * saved with the account (applied again whenever this person signs in).
 */
export function ProfilePreferencesCard() {
  const t = useT();
  const language = useSettingsStore((state) => state.device.locale.language);
  const appearance = useSettingsStore((state) => state.device.appearance);

  const save = async (patch: UserPreferences) => {
    applyUserPreferences(patch);
    try {
      const preferences = await userService.savePreferences(patch);
      useAuthStore.setState((state) => (state.user ? { user: { ...state.user, preferences } } : {}));
    } catch (error) {
      toast.fromError(error);
    }
  };

  return (
    <SettingsCard icon={SlidersHorizontal} title={t('settings.profile.preferences')} description={t('settings.profile.preferencesHint')}>
      <SettingRow label={t('settings.sections.language.title')}>
        <SegmentedControl ariaLabel={t('settings.sections.language.title')} value={language} options={LANGUAGES.map((value) => ({ value, label: t(`enums.language.${value}`) }))} onChange={(next) => void save({ language: next })} />
      </SettingRow>
      <SettingRow label={t('settings.sections.theme.title')}>
        <SegmentedControl ariaLabel={t('settings.sections.theme.title')} value={appearance.theme} options={THEMES.map((value) => ({ value, label: t(`enums.theme.${value}`) }))} onChange={(next) => void save({ theme: next })} />
      </SettingRow>
      <SettingRow label={t('settings.fonts.ui')}>
        {(id) => (
          <div className="w-56">
            <Select<UiFontId> id={id} value={appearance.uiFont} options={Object.values(UI_FONTS).map((font) => ({ value: font.id, label: font.label }))} onChange={(uiFont) => void save({ uiFont })} />
          </div>
        )}
      </SettingRow>
      <SettingRow label={t('settings.fonts.bangla')}>
        {(id) => (
          <div className="w-56">
            <Select<BanglaFontId> id={id} value={appearance.banglaFont} options={Object.values(BANGLA_FONTS).map((font) => ({ value: font.id, label: font.label }))} onChange={(banglaFont) => void save({ banglaFont })} />
          </div>
        )}
      </SettingRow>
    </SettingsCard>
  );
}
