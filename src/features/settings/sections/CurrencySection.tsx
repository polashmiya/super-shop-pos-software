import { Coins, Scale } from 'lucide-react';
import { applyRounding } from '@/domain/money';
import { useFormat } from '@/hooks/useFormat';
import { useT } from '@/i18n';
import type { CurrencyCode, CurrencySettings, RoundingMode } from '@/types';
import { SegmentedControl, Select } from '@/components/ui/Controls';
import { TextField } from '../components/Inputs';
import { Note, PreviewPanel, SettingBlock, SettingRow, SettingsCard } from '../components/SettingsCard';
import { saveBusiness, useBusinessGroup } from '../saveStatus';

const CODES: CurrencyCode[] = ['BDT', 'USD', 'EUR', 'GBP'];
const DEFAULT_SYMBOL: Record<CurrencyCode, string> = { BDT: '৳', USD: '$', EUR: '€', GBP: '£' };
const DECIMALS: Array<CurrencySettings['decimals']> = ['auto', 'always', 'never'];
const ROUNDING: RoundingMode[] = ['none', 'nearest_1', 'nearest_0_5', 'down_1'];
const SAMPLES = [123_450, 120_000, 9_975];
const ROUNDING_SAMPLE = 123_475;

/** Currency, symbol, poisha display and bill rounding, with live examples. */
export default function CurrencySection() {
  const t = useT();
  const format = useFormat();
  const currency = useBusinessGroup('currency');
  const sales = useBusinessGroup('sales');
  const rounded = applyRounding(ROUNDING_SAMPLE, sales.rounding);

  return (
    <div className="flex flex-col gap-5">
      <SettingsCard icon={Coins} title={t('settings.currency.currency')} description={t('settings.currency.currencyHint')}>
        <SettingRow anchor="currencyCode" label={t('settings.currency.code')} description={t('settings.currency.codeNote')}>
          {(id) => (
            <div className="w-64">
              <Select
                id={id}
                value={currency.code}
                options={CODES.map((value) => ({ value, label: t(`settings.currency.codes.${value}`) }))}
                onChange={(code) => void saveBusiness('currency', { code, symbol: DEFAULT_SYMBOL[code] })}
              />
            </div>
          )}
        </SettingRow>
        <SettingRow anchor="currencySymbol" label={t('settings.currency.symbol')} description={t('settings.currency.symbolHint')}>
          {(id) => (
            <div className="w-28">
              <TextField id={id} value={currency.symbol} maxLength={4} validate={(value) => (value.trim() ? null : t('settings.currency.symbolRequired'))} onCommit={(symbol) => void saveBusiness('currency', { symbol })} />
            </div>
          )}
        </SettingRow>
        <SettingRow anchor="currencyPosition" label={t('settings.currency.position')}>
          <SegmentedControl
            ariaLabel={t('settings.currency.position')}
            value={currency.position}
            options={[
              { value: 'before', label: t('settings.currency.before') },
              { value: 'after', label: t('settings.currency.after') },
            ]}
            onChange={(position) => void saveBusiness('currency', { position })}
          />
        </SettingRow>
        <SettingRow anchor="currencyDecimals" label={t('settings.currency.decimals')} description={t('settings.currency.decimalsHint')}>
          <SegmentedControl ariaLabel={t('settings.currency.decimals')} value={currency.decimals} options={DECIMALS.map((value) => ({ value, label: t(`settings.currency.decimalOptions.${value}`) }))} onChange={(decimals) => void saveBusiness('currency', { decimals })} />
        </SettingRow>
        <SettingBlock>
          <PreviewPanel label={t('settings.currency.sample')}>
            <div className="flex flex-wrap gap-x-8 gap-y-2">
              {SAMPLES.map((amount) => (
                <span key={amount} className="text-xl font-bold text-fg tnum">
                  {format.money(amount)}
                </span>
              ))}
            </div>
          </PreviewPanel>
        </SettingBlock>
      </SettingsCard>

      <SettingsCard icon={Scale} title={t('settings.currency.rounding')} description={t('settings.currency.roundingHint')}>
        <SettingRow anchor="rounding" label={t('settings.currency.rounding')}>
          {(id) => (
            <div className="w-64">
              <Select id={id} value={sales.rounding} options={ROUNDING.map((value) => ({ value, label: t(`enums.rounding.${value}`) }))} onChange={(rounding) => void saveBusiness('sales', { rounding })} />
            </div>
          )}
        </SettingRow>
        <SettingBlock>
          <Note tone="neutral">
            <span className="font-semibold">{t('settings.currency.sample')}:</span> {t('settings.currency.sampleRounded', { from: format.money(ROUNDING_SAMPLE, { decimals: 'always' }), to: format.money(rounded, { decimals: 'always' }) })}
          </Note>
        </SettingBlock>
      </SettingsCard>
    </div>
  );
}
