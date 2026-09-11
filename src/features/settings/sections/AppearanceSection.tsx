import { Contrast, LayoutTemplate, SunMoon, Type } from 'lucide-react';
import { useT, type TranslationKey } from '@/i18n';
import type { CornerStyle, Density, SidebarMode, ThemeMode } from '@/types';
import { ChoiceCard, SegmentedControl } from '@/components/ui/Controls';
import { SettingBlock, SettingRow, SettingsCard, SwitchRow } from '../components/SettingsCard';
import { TextSizeControl } from '../components/TextSizeControl';
import { ThemeModePreview } from '../components/ThemePreview';
import { saveDevice, useDeviceGroup } from '../saveStatus';

const THEMES: Array<{ mode: ThemeMode; hint: TranslationKey }> = [
  { mode: 'dark', hint: 'settings.appearance.themeDark' },
  { mode: 'light', hint: 'settings.appearance.themeLight' },
  { mode: 'system', hint: 'settings.appearance.themeSystem' },
];
const DENSITIES: Density[] = ['compact', 'comfortable', 'spacious'];
const CORNERS: CornerStyle[] = ['rounded', 'standard', 'minimal'];
const SIDEBARS: SidebarMode[] = ['full', 'compact', 'hidden'];

/** Theme, layout density, corners, motion/contrast and text size of this terminal. */
export default function AppearanceSection() {
  const t = useT();
  const appearance = useDeviceGroup('appearance');

  return (
    <div className="flex flex-col gap-5">
      <SettingsCard icon={SunMoon} title={t('settings.appearance.theme')} description={t('settings.appearance.themeHint')}>
        <SettingBlock anchor="theme">
          <div className="grid gap-3 sm:grid-cols-3" role="group" aria-label={t('settings.appearance.theme')}>
            {THEMES.map(({ mode, hint }) => (
              <ChoiceCard key={mode} selected={appearance.theme === mode} onClick={() => saveDevice({ appearance: { theme: mode } })} className="gap-2.5 p-2.5">
                <div className="aspect-[16/10] w-full overflow-hidden rounded-md border border-border">
                  <ThemeModePreview mode={mode} accent={appearance.accent} />
                </div>
                <div className="w-full px-1 pb-0.5">
                  <p className="font-semibold text-fg">{t(`enums.theme.${mode}`)}</p>
                  <p className="type-caption text-fg-subtle">{t(hint)}</p>
                </div>
              </ChoiceCard>
            ))}
          </div>
        </SettingBlock>
      </SettingsCard>

      <SettingsCard icon={LayoutTemplate} title={t('settings.appearance.layout')} description={t('settings.appearance.layoutHint')}>
        <SettingRow anchor="density" label={t('settings.appearance.density')} description={t('settings.appearance.densityHint')}>
          <SegmentedControl ariaLabel={t('settings.appearance.density')} value={appearance.density} options={DENSITIES.map((value) => ({ value, label: t(`enums.density.${value}`) }))} onChange={(density) => saveDevice({ appearance: { density } })} />
        </SettingRow>
        <SettingRow anchor="corners" label={t('settings.appearance.corners')}>
          <SegmentedControl ariaLabel={t('settings.appearance.corners')} value={appearance.corners} options={CORNERS.map((value) => ({ value, label: t(`enums.corners.${value}`) }))} onChange={(corners) => saveDevice({ appearance: { corners } })} />
        </SettingRow>
        <SettingRow anchor="appearanceSidebar" label={t('settings.appearance.sidebar')}>
          <SegmentedControl ariaLabel={t('settings.appearance.sidebar')} value={appearance.sidebar} options={SIDEBARS.map((value) => ({ value, label: t(`enums.sidebar.${value}`) }))} onChange={(sidebar) => saveDevice({ appearance: { sidebar } })} />
        </SettingRow>
      </SettingsCard>

      <SettingsCard icon={Contrast} title={t('settings.appearance.effects')} description={t('settings.appearance.effectsHint')}>
        <SwitchRow anchor="animations" label={t('settings.appearance.animations')} description={t('settings.appearance.animationsHint')} checked={appearance.animations} onChange={(animations) => saveDevice({ appearance: { animations } })} />
        <SwitchRow anchor="hoverEffects" label={t('settings.appearance.hover')} description={t('settings.appearance.hoverHint')} checked={appearance.hoverEffects} onChange={(hoverEffects) => saveDevice({ appearance: { hoverEffects } })} />
        <SwitchRow anchor="highContrast" label={t('settings.appearance.highContrast')} description={t('settings.appearance.highContrastHint')} checked={appearance.highContrast} onChange={(highContrast) => saveDevice({ appearance: { highContrast } })} />
        <SwitchRow anchor="appearanceFocusMode" label={t('settings.appearance.focusMode')} description={t('settings.appearance.focusModeHint')} checked={appearance.focusMode} onChange={(focusMode) => saveDevice({ appearance: { focusMode } })} />
      </SettingsCard>

      <SettingsCard icon={Type} title={t('settings.appearance.textSize')} description={t('settings.appearance.textSizeHint')}>
        <SettingBlock anchor="textSize">
          <TextSizeControl />
        </SettingBlock>
      </SettingsCard>
    </div>
  );
}
