import { useNavigate } from 'react-router';
import { ChevronRight, Languages, Tags } from 'lucide-react';
import { tIn, useT, type TranslationKey } from '@/i18n';
import type { Language } from '@/types';
import { Button } from '@/components/ui/Button';
import { ChoiceCard } from '@/components/ui/Controls';
import { Note, SettingBlock, SettingsCard, SwitchRow } from '../components/SettingsCard';
import { saveDevice, useDeviceGroup } from '../saveStatus';

const LANGUAGES: Array<{ value: Language; hint: TranslationKey }> = [
  { value: 'bn', hint: 'settings.language.bnHint' },
  { value: 'en', hint: 'settings.language.enHint' },
];

/** Interface language (applies instantly) and bilingual product names. */
export default function LanguageSection() {
  const t = useT();
  const navigate = useNavigate();
  const locale = useDeviceGroup('locale');
  const pos = useDeviceGroup('pos');

  return (
    <div className="flex flex-col gap-5">
      <SettingsCard icon={Languages} title={t('settings.language.interface')} description={t('settings.language.interfaceHint')}>
        <SettingBlock anchor="language">
          <div className="grid gap-3 sm:grid-cols-2" role="group" aria-label={t('settings.language.interface')}>
            {LANGUAGES.map(({ value, hint }) => (
              <ChoiceCard key={value} selected={locale.language === value} onClick={() => saveDevice({ locale: { language: value } })} className="gap-1.5 p-4">
                <span lang={value} className="text-2xl font-bold text-fg">
                  {t(`enums.language.${value}`)}
                </span>
                <span className="type-caption text-fg-subtle">{t(hint)}</span>
                <span lang={value} className="mt-2 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-fg-muted">
                  <span className="font-semibold text-fg">{tIn(value, 'settings.language.sample')}:</span> {tIn(value, 'pos.cart.emptyHint')}
                </span>
              </ChoiceCard>
            ))}
          </div>
        </SettingBlock>
        <SettingBlock>
          <Note>
            <span>{t('settings.language.receiptNote')}</span>{' '}
            <Button size="sm" variant="ghost" iconRight={ChevronRight} onClick={() => navigate('/settings/receipt?focus=receiptLanguage')} className="-my-1 ms-1">
              {t('settings.language.openReceipt')}
            </Button>
          </Note>
        </SettingBlock>
      </SettingsCard>

      <SettingsCard icon={Tags} title={t('settings.language.productNames')} description={t('settings.language.productNamesHint')}>
        <SwitchRow
          anchor="bothNames"
          label={t('settings.language.bothNames')}
          description={t('settings.language.bothNamesHint')}
          checked={pos.showSecondaryName}
          onChange={(showSecondaryName) => saveDevice({ pos: { showSecondaryName } })}
        />
      </SettingsCard>
    </div>
  );
}
