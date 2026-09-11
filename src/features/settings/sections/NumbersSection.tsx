import { Clock, Hash } from 'lucide-react';
import { useLanguage, useT } from '@/i18n';
import { useSettingsStore } from '@/stores/settingsStore';
import type { NumeralSystem } from '@/types';
import { createFormatters } from '@/utils/format';
import { ChoiceCard, SegmentedControl } from '@/components/ui/Controls';
import { Note, SettingBlock, SettingRow, SettingsCard } from '../components/SettingsCard';
import { saveDevice, useDeviceGroup } from '../saveStatus';

const NUMERALS: NumeralSystem[] = ['en', 'bn'];
const CLOCKS = ['12h', '24h'] as const;
/** A fixed moment so the samples do not change while you look at them. */
const SAMPLE_DATE = new Date(2026, 11, 16, 14, 35);

/** English or Bangla digits (with samples) and the 12/24-hour clock. */
export default function NumbersSection() {
  const t = useT();
  const language = useLanguage();
  const locale = useDeviceGroup('locale');
  const currency = useSettingsStore((state) => state.business.currency);
  const samples = NUMERALS.map((numerals) => {
    const format = createFormatters({ language, numerals, currency, clock: locale.clock });
    return {
      numerals,
      rows: [
        { label: t('settings.numbers.samplePrice'), value: format.money(123_450) },
        { label: t('settings.numbers.sampleQty'), value: format.quantity(12.75) },
        { label: t('settings.numbers.sampleDate'), value: format.date(SAMPLE_DATE) },
        { label: t('settings.numbers.sampleTime'), value: format.time(SAMPLE_DATE) },
      ],
    };
  });
  const clockSample = (clock: (typeof CLOCKS)[number]) => createFormatters({ language, numerals: locale.numerals, currency, clock }).time(SAMPLE_DATE);

  return (
    <div className="flex flex-col gap-5">
      <SettingsCard icon={Hash} title={t('settings.numbers.digits')} description={t('settings.numbers.digitsHint')}>
        <SettingBlock anchor="numerals">
          <div className="grid gap-3 sm:grid-cols-2" role="group" aria-label={t('settings.numbers.digits')}>
            {samples.map(({ numerals, rows }) => (
              <ChoiceCard key={numerals} selected={locale.numerals === numerals} onClick={() => saveDevice({ locale: { numerals } })} className="gap-3 p-4">
                <span className="text-lg font-bold text-fg">{numerals === 'bn' ? t('settings.numbers.bangla') : t('settings.numbers.english')}</span>
                <dl className="grid w-full grid-cols-2 gap-x-4 gap-y-1.5">
                  {rows.map((row) => (
                    <div key={row.label} className="min-w-0">
                      <dt className="type-caption text-fg-subtle">{row.label}</dt>
                      <dd className="truncate font-semibold text-fg tnum">{row.value}</dd>
                    </div>
                  ))}
                </dl>
              </ChoiceCard>
            ))}
          </div>
        </SettingBlock>
        <SettingBlock>
          <Note tone="neutral">{t('settings.numbers.inputNote')}</Note>
        </SettingBlock>
      </SettingsCard>

      <SettingsCard icon={Clock} title={t('settings.numbers.clock')} description={t('settings.numbers.clockHint')}>
        <SettingRow anchor="clock" label={t('settings.numbers.clock')}>
          <SegmentedControl
            ariaLabel={t('settings.numbers.clock')}
            value={locale.clock}
            options={CLOCKS.map((value) => ({ value, label: `${t(`enums.clock.${value}`)} · ${clockSample(value)}` }))}
            onChange={(clock) => saveDevice({ locale: { clock } })}
          />
        </SettingRow>
      </SettingsCard>
    </div>
  );
}
