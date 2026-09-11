import { useState } from 'react';
import { Landmark, Percent, Plus, ReceiptText, Tag, X } from 'lucide-react';
import { parsePercentInput } from '@/domain/money';
import { calculateTax } from '@/domain/pricing';
import { useFormat } from '@/hooks/useFormat';
import { useT } from '@/i18n';
import type { BasisPoints, TaxMode } from '@/types';
import { Button } from '@/components/ui/Button';
import { ChoiceCard, Select } from '@/components/ui/Controls';
import { Badge } from '@/components/ui/Display';
import { Input } from '@/components/ui/Input';
import { TextField } from '../components/Inputs';
import { Note, SettingBlock, SettingRow, SettingsCard, SwitchRow } from '../components/SettingsCard';
import { saveBusiness, useBusinessGroup } from '../saveStatus';

const MODES: TaxMode[] = ['exclusive', 'inclusive'];
const EXAMPLE_PRICE = 10_000;
const MAX_RATES = 8;

/** VAT on/off, inclusive vs exclusive pricing (with a worked example), rates and receipt labels. */
export default function TaxSection() {
  const t = useT();
  const format = useFormat();
  const tax = useBusinessGroup('tax');
  const receipt = useBusinessGroup('receipt');
  const vat = calculateTax(EXAMPLE_PRICE, tax.defaultRate, tax.mode);
  const total = tax.mode === 'exclusive' ? EXAMPLE_PRICE + vat : EXAMPLE_PRICE;
  const sortedRates = [...tax.rates].sort((a, b) => a - b);

  return (
    <div className="flex flex-col gap-5">
      <SettingsCard icon={Landmark} title={t('settings.tax.vat')} description={t('settings.tax.vatHint')}>
        <SwitchRow anchor="taxEnabled" label={t('settings.tax.enabled')} description={t('settings.tax.enabledHint')} checked={tax.enabled} onChange={(enabled) => void saveBusiness('tax', { enabled })} />
        <SettingRow anchor="taxMode" label={t('settings.tax.mode')} stacked>
          <div className="grid gap-3 sm:grid-cols-2" role="group" aria-label={t('settings.tax.mode')}>
            {MODES.map((mode) => (
              <ChoiceCard key={mode} selected={tax.mode === mode} disabled={!tax.enabled} onClick={() => void saveBusiness('tax', { mode })} className="gap-0.5 pe-9">
                <span className="font-semibold text-fg">{mode === 'inclusive' ? t('settings.tax.inclusive') : t('settings.tax.exclusive')}</span>
                <span className="type-caption text-fg-subtle">{mode === 'inclusive' ? t('settings.tax.inclusiveHint') : t('settings.tax.exclusiveHint')}</span>
              </ChoiceCard>
            ))}
          </div>
        </SettingRow>
        {tax.enabled && (
          <SettingBlock>
            <Note>
              <p className="font-semibold">{t('settings.tax.example', { price: format.money(EXAMPLE_PRICE), rate: format.percent(tax.defaultRate) })}</p>
              <p>
                {tax.mode === 'inclusive'
                  ? t('settings.tax.exampleInclusive', { total: format.money(total), vat: format.money(vat) })
                  : t('settings.tax.exampleExclusive', { total: format.money(total), vat: format.money(vat) })}
              </p>
            </Note>
          </SettingBlock>
        )}
      </SettingsCard>

      <SettingsCard icon={Percent} title={t('settings.tax.rates')} description={t('settings.tax.ratesHint')}>
        <SettingRow anchor="taxDefaultRate" label={t('settings.tax.defaultRate')} description={t('settings.tax.defaultRateHint')}>
          {(id) => (
            <div className="w-40">
              <Select
                id={id}
                value={String(tax.defaultRate)}
                options={sortedRates.map((rate) => ({ value: String(rate), label: format.percent(rate, 2) }))}
                onChange={(value) => void saveBusiness('tax', { defaultRate: Number(value) })}
              />
            </div>
          )}
        </SettingRow>
        <SettingBlock anchor="taxRates">
          <RateListEditor rates={sortedRates} defaultRate={tax.defaultRate} onChange={(rates) => void saveBusiness('tax', { rates })} />
        </SettingBlock>
      </SettingsCard>

      <SettingsCard icon={Tag} title={t('settings.tax.labels')}>
        <SettingBlock anchor="taxLabel">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5">
              <span className="type-label text-fg-muted">{t('settings.tax.labelBn')}</span>
              <TextField lang="bn" value={tax.labelBn} maxLength={20} validate={(value) => (value.trim() ? null : t('validation.required'))} onCommit={(labelBn) => void saveBusiness('tax', { labelBn })} />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="type-label text-fg-muted">{t('settings.tax.labelEn')}</span>
              <TextField lang="en" value={tax.labelEn} maxLength={20} validate={(value) => (value.trim() ? null : t('validation.required'))} onCommit={(labelEn) => void saveBusiness('tax', { labelEn })} />
            </label>
          </div>
        </SettingBlock>
      </SettingsCard>

      <SettingsCard icon={ReceiptText} title={t('settings.tax.receipt')}>
        <SwitchRow anchor="taxBreakdown" label={t('settings.tax.showBreakdown')} checked={receipt.showTaxBreakdown} onChange={(showTaxBreakdown) => void saveBusiness('receipt', { showTaxBreakdown })} />
        <SwitchRow anchor="taxShowBin" label={t('settings.tax.showBin')} checked={receipt.showBin} onChange={(showBin) => void saveBusiness('receipt', { showBin })} />
      </SettingsCard>
    </div>
  );
}

function RateListEditor({ rates, defaultRate, onChange }: { rates: BasisPoints[]; defaultRate: BasisPoints; onChange: (rates: BasisPoints[]) => void }) {
  const t = useT();
  const format = useFormat();
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);

  const add = () => {
    const rate = parsePercentInput(text);
    if (rate === null || rate < 0 || rate > 10_000) {
      setError(t('settings.tax.rateInvalid'));
      return;
    }
    if (rates.includes(rate)) {
      setError(t('settings.tax.rateExists', { rate: format.percent(rate, 2) }));
      return;
    }
    onChange([...rates, rate].sort((a, b) => a - b));
    setText('');
    setError(null);
  };

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-wrap gap-2" aria-label={t('settings.tax.rates')}>
        {rates.map((rate) => (
          <li key={rate} className="inline-flex h-11 items-center gap-2 rounded-lg border border-border bg-surface-2 ps-3 pe-1 font-semibold text-fg tnum">
            {format.percent(rate, 2)}
            {rate === defaultRate && (
              <Badge tone="primary" size="sm">
                {t('settings.tax.isDefault')}
              </Badge>
            )}
            <button
              type="button"
              onClick={() => onChange(rates.filter((entry) => entry !== rate))}
              disabled={rate === defaultRate || rates.length <= 1}
              aria-label={t('settings.tax.removeRate', { rate: format.percent(rate, 2) })}
              className="flex h-9 w-9 items-center justify-center rounded-md text-fg-subtle transition-base hover:bg-danger-soft hover:text-danger-text disabled:opacity-30"
            >
              <X size={15} aria-hidden />
            </button>
          </li>
        ))}
      </ul>
      {rates.length < MAX_RATES && (
        <form
          className="flex flex-wrap items-start gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            add();
          }}
        >
          <div className="w-36">
            <Input
              value={text}
              inputMode="decimal"
              placeholder={t('settings.tax.ratePlaceholder')}
              aria-label={t('settings.tax.addRate')}
              invalid={Boolean(error)}
              trailing={<span className="pe-2 text-sm text-fg-subtle">%</span>}
              onChange={(event) => {
                setText(event.target.value);
                setError(null);
              }}
              className="tnum"
            />
          </div>
          <Button type="submit" icon={Plus} disabled={!text.trim()}>
            {t('settings.tax.addRate')}
          </Button>
        </form>
      )}
      {error ? (
        <p role="alert" className="type-caption text-danger-text">
          {error}
        </p>
      ) : (
        <p className="type-caption text-fg-subtle">{t('settings.tax.maxRates', { max: MAX_RATES })}</p>
      )}
    </div>
  );
}
