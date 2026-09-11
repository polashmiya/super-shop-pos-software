import { CaseSensitive, Languages, ReceiptText, Type } from 'lucide-react';
import { BANGLA_FONTS, RECEIPT_FONTS, UI_FONTS, type FontOption } from '@/config/theme.config';
import { useT } from '@/i18n';
import { ChoiceCard } from '@/components/ui/Controls';
import { SettingBlock, SettingsCard } from '../components/SettingsCard';
import { TextSizeControl } from '../components/TextSizeControl';
import { saveDevice, useDeviceGroup } from '../saveStatus';

/** Interface, Bangla and receipt fonts (all bundled, offline) with samples, and the text size. */
export default function FontsSection() {
  const t = useT();
  const appearance = useDeviceGroup('appearance');

  return (
    <div className="flex flex-col gap-5">
      <SettingsCard icon={CaseSensitive} title={t('settings.fonts.ui')} description={t('settings.fonts.uiHint')}>
        <FontChoices anchor="uiFont" label={t('settings.fonts.ui')} options={UI_FONTS} value={appearance.uiFont} onChange={(uiFont) => saveDevice({ appearance: { uiFont } })} />
      </SettingsCard>

      <SettingsCard icon={Languages} title={t('settings.fonts.bangla')} description={t('settings.fonts.banglaHint')}>
        <FontChoices anchor="banglaFont" label={t('settings.fonts.bangla')} options={BANGLA_FONTS} value={appearance.banglaFont} onChange={(banglaFont) => saveDevice({ appearance: { banglaFont } })} />
      </SettingsCard>

      <SettingsCard icon={ReceiptText} title={t('settings.fonts.receipt')} description={t('settings.fonts.receiptHint')}>
        <FontChoices anchor="receiptFont" label={t('settings.fonts.receipt')} options={RECEIPT_FONTS} value={appearance.receiptFont} onChange={(receiptFont) => saveDevice({ appearance: { receiptFont } })} />
      </SettingsCard>

      <SettingsCard icon={Type} title={t('settings.fonts.size')} description={t('settings.fonts.sizeHint')}>
        <SettingBlock anchor="fontSize">
          <TextSizeControl />
        </SettingBlock>
      </SettingsCard>
    </div>
  );
}

function FontChoices<T extends string>({ anchor, label, options, value, onChange }: { anchor: string; label: string; options: Record<T, FontOption<T>>; value: T; onChange: (value: T) => void }) {
  const t = useT();
  const list = Object.values<FontOption<T>>(options);
  return (
    <SettingBlock anchor={anchor}>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" role="group" aria-label={label}>
        {list.map((option) => (
          <ChoiceCard key={option.id} selected={value === option.id} onClick={() => onChange(option.id)} className="gap-1 pe-9">
            <span className="text-[1.3rem] leading-snug text-fg" style={{ fontFamily: `${option.stack}, sans-serif` }}>
              {option.sample}
            </span>
            <span className="text-sm font-semibold text-fg">{option.label}</span>
            <span className="type-caption text-fg-subtle">{option.id === 'system' ? t('settings.fonts.systemFont') : t('settings.fonts.offline')}</span>
          </ChoiceCard>
        ))}
      </div>
    </SettingBlock>
  );
}
