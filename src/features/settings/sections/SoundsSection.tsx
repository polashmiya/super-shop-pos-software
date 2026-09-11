import { Music, Play, Volume1, Volume2, VolumeX } from 'lucide-react';
import { useFormat } from '@/hooks/useFormat';
import { useT, type TranslationKey } from '@/i18n';
import { sounds } from '@/services/soundService';
import type { SoundSettings } from '@/types';
import { Button } from '@/components/ui/Button';
import { Note, SettingBlock, SettingRow, SettingsCard, SwitchRow } from '../components/SettingsCard';
import { saveDevice, useDeviceGroup } from '../saveStatus';

type SoundEvent = 'scan' | 'success' | 'error';

const EVENTS: Array<{ key: SoundEvent; label: TranslationKey; hint: TranslationKey }> = [
  { key: 'scan', label: 'settings.sounds.scan', hint: 'settings.sounds.scanHint' },
  { key: 'success', label: 'settings.sounds.success', hint: 'settings.sounds.successHint' },
  { key: 'error', label: 'settings.sounds.error', hint: 'settings.sounds.errorHint' },
];

/** Master switch, volume and each sound (with a Play button to hear it). */
export default function SoundsSection() {
  const t = useT();
  const format = useFormat();
  const sound = useDeviceGroup('sound');
  const VolumeIcon = !sound.enabled || sound.volume === 0 ? VolumeX : sound.volume < 0.5 ? Volume1 : Volume2;

  return (
    <div className="flex flex-col gap-5">
      <SettingsCard icon={Volume2} title={t('settings.sounds.master')} description={t('settings.sounds.masterHint')}>
        <SwitchRow anchor="soundEnabled" label={t('settings.sounds.enabled')} checked={sound.enabled} onChange={(enabled) => saveDevice({ sound: { enabled } })} />
        <SettingRow anchor="soundVolume" label={t('settings.sounds.volume')}>
          {(id) => (
            <div className="flex w-72 items-center gap-3">
              <VolumeIcon size={18} aria-hidden className="shrink-0 text-fg-subtle" />
              <input
                id={id}
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={sound.volume}
                disabled={!sound.enabled}
                aria-valuetext={format.percentValue(sound.volume * 100, 0)}
                onChange={(event) => saveDevice({ sound: { volume: Number(event.target.value) } })}
                className="h-2 min-w-0 flex-1 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
              />
              <span className="w-12 shrink-0 text-end text-sm font-semibold text-fg tnum">{format.percentValue(sound.volume * 100, 0)}</span>
            </div>
          )}
        </SettingRow>
      </SettingsCard>

      <SettingsCard icon={Music} title={t('settings.sounds.events')} description={t('settings.sounds.eventsHint')}>
        {EVENTS.map(({ key, label, hint }) => (
          <SwitchRow
            key={key}
            anchor={`sound-${key}`}
            label={t(label)}
            description={t(hint)}
            checked={sound[key]}
            disabled={!sound.enabled}
            onChange={(checked) => saveDevice({ sound: { [key]: checked } as Partial<SoundSettings> })}
            extra={
              <Button size="sm" variant="ghost" icon={Play} disabled={!sound.enabled || !sound[key]} aria-label={t('settings.sounds.play', { name: t(label) })} onClick={() => sounds[key]()}>
                {t('common.actions.preview')}
              </Button>
            }
          />
        ))}
        {!sound.enabled && (
          <SettingBlock>
            <Note tone="neutral" icon={VolumeX}>
              {t('settings.sounds.muted')}
            </Note>
          </SettingBlock>
        )}
      </SettingsCard>
    </div>
  );
}
