import { Check, Palette, SunMoon } from 'lucide-react';
import { ACCENT_ORDER, ACCENT_PRESETS } from '@/config/theme.config';
import { useLocalize, useT } from '@/i18n';
import type { ThemeMode } from '@/types';
import { Button } from '@/components/ui/Button';
import { cn } from '@/components/ui/cn';
import { SegmentedControl, Switch } from '@/components/ui/Controls';
import { Badge } from '@/components/ui/Display';
import { PreviewPanel, SettingBlock, SettingRow, SettingsCard } from '../components/SettingsCard';
import { MiniWindow } from '../components/ThemePreview';
import { saveDevice, useDeviceGroup } from '../saveStatus';

const MODES: ThemeMode[] = ['dark', 'light', 'system'];
const noop = () => undefined;

/** Theme mode and accent colour (applied instantly), with a live preview in both themes. */
export default function ThemeSection() {
  const t = useT();
  const localize = useLocalize();
  const appearance = useDeviceGroup('appearance');

  return (
    <div className="flex flex-col gap-5">
      <SettingsCard icon={SunMoon} title={t('settings.theme.mode')} description={t('settings.theme.modeHint')}>
        <SettingRow anchor="themeMode" label={t('settings.appearance.theme')}>
          <SegmentedControl ariaLabel={t('settings.appearance.theme')} value={appearance.theme} options={MODES.map((value) => ({ value, label: t(`enums.theme.${value}`) }))} onChange={(theme) => saveDevice({ appearance: { theme } })} />
        </SettingRow>
      </SettingsCard>

      <SettingsCard icon={Palette} title={t('settings.theme.accent')} description={t('settings.theme.accentHint')}>
        <SettingBlock anchor="accent">
          <div className="grid grid-cols-4 gap-3 lg:grid-cols-8" role="group" aria-label={t('settings.theme.accent')}>
            {ACCENT_ORDER.map((id) => {
              const preset = ACCENT_PRESETS[id];
              const selected = appearance.accent === id;
              const name = localize(preset.label);
              return (
                <button
                  key={id}
                  type="button"
                  aria-pressed={selected}
                  aria-label={t('settings.theme.selectAccent', { name })}
                  onClick={() => saveDevice({ appearance: { accent: id } })}
                  className={cn(
                    'flex min-h-touch flex-col items-center gap-2 rounded-lg border px-2 py-3 transition-base',
                    selected ? 'border-primary bg-primary-soft ring-1 ring-primary' : 'border-border bg-surface-2 hover:border-border-strong hover:bg-surface-3',
                  )}
                >
                  <span className="flex h-10 w-10 items-center justify-center rounded-full shadow-sm ring-2 ring-black/10" style={{ background: preset.swatch }}>
                    {selected && <Check size={18} strokeWidth={3} aria-hidden className="text-white" />}
                  </span>
                  <span className="max-w-full truncate text-sm font-medium text-fg">{name}</span>
                </button>
              );
            })}
          </div>
        </SettingBlock>
        <SettingBlock>
          <PreviewPanel label={t('settings.theme.preview')}>
            <div className="grid gap-4 md:grid-cols-[1fr_1fr_minmax(0,1.15fr)]">
              {(['dark', 'light'] as const).map((theme) => (
                <figure key={theme} className="flex flex-col gap-1.5">
                  <div className="aspect-[16/10] overflow-hidden rounded-md border border-border shadow-sm">
                    <MiniWindow theme={theme} accent={appearance.accent} />
                  </div>
                  <figcaption className="type-caption text-fg-subtle">{t(`enums.theme.${theme}`)}</figcaption>
                </figure>
              ))}
              <div inert className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="type-h3 text-fg">{t('settings.theme.sampleTitle')}</p>
                  <Badge tone="primary">{t('settings.theme.sampleSelected')}</Badge>
                </div>
                <Switch checked onChange={noop} label={t('settings.theme.sampleSwitch')} />
                <div className="flex flex-wrap gap-2">
                  <Button variant="soft">{t('settings.theme.sampleLink')}</Button>
                  <Button variant="primary" className="flex-1">
                    {t('settings.theme.samplePay')}
                  </Button>
                </div>
              </div>
            </div>
          </PreviewPanel>
        </SettingBlock>
      </SettingsCard>
    </div>
  );
}
