import { Ban, FileDigit, Undo2 } from 'lucide-react';
import { APP_CONFIG } from '@/config/app.config';
import { toCompactDate } from '@/domain/dates';
import { useT } from '@/i18n';
import type { RoundingMode } from '@/types';
import { Select } from '@/components/ui/Controls';
import { NumberInput, TextField } from '../components/Inputs';
import { SettingRow, SettingsCard, SwitchRow } from '../components/SettingsCard';
import { saveBusiness, useBusinessGroup } from '../saveStatus';

const PREFIX_PATTERN = /^[A-Z0-9]{1,6}$/;
const ROUNDING: RoundingMode[] = ['none', 'nearest_1', 'nearest_0_5', 'down_1'];

/** Invoice numbering, bill rounding, return periods and cancellation rules. */
export default function SalesSection() {
  const t = useT();
  const sales = useBusinessGroup('sales');
  const example = `${sales.invoicePrefix}-${toCompactDate(new Date())}-${'1'.padStart(APP_CONFIG.numbering.sequenceDigits, '0')}`;

  return (
    <div className="flex flex-col gap-5">
      <SettingsCard icon={FileDigit} title={t('settings.sales.invoices')} description={t('settings.sales.invoicesHint')}>
        <SettingRow anchor="invoicePrefix" label={t('settings.sales.prefix')} description={t('settings.sales.prefixHint', { example })}>
          {(id) => (
            <div className="w-36">
              <TextField
                id={id}
                mono
                value={sales.invoicePrefix}
                maxLength={6}
                transform={(value) => value.toUpperCase()}
                validate={(value) => (PREFIX_PATTERN.test(value.trim()) ? null : t('settings.sales.prefixInvalid'))}
                onCommit={(invoicePrefix) => void saveBusiness('sales', { invoicePrefix })}
              />
            </div>
          )}
        </SettingRow>
        <SettingRow anchor="salesRounding" label={t('settings.currency.rounding')} description={t('settings.currency.roundingHint')}>
          {(id) => (
            <div className="w-64">
              <Select id={id} value={sales.rounding} options={ROUNDING.map((value) => ({ value, label: t(`enums.rounding.${value}`) }))} onChange={(rounding) => void saveBusiness('sales', { rounding })} />
            </div>
          )}
        </SettingRow>
      </SettingsCard>

      <SettingsCard icon={Undo2} title={t('settings.sales.returns')} description={t('settings.sales.returnsHint')}>
        <SettingRow anchor="returnWindow" label={t('settings.sales.returnWindow')} description={t('settings.sales.returnWindowHint')}>
          {(id) => <NumberInput id={id} value={sales.returnWindowDays} min={0} max={365} suffix={t('settings.units.days')} className="w-40" onCommit={(returnWindowDays) => void saveBusiness('sales', { returnWindowDays, cashierReturnWindowDays: Math.min(sales.cashierReturnWindowDays, returnWindowDays) })} />}
        </SettingRow>
        <SettingRow anchor="cashierReturnWindow" label={t('settings.sales.cashierWindow')} description={t('settings.sales.cashierWindowHint')}>
          {(id) => <NumberInput id={id} value={sales.cashierReturnWindowDays} min={0} max={sales.returnWindowDays} suffix={t('settings.units.days')} className="w-40" onCommit={(cashierReturnWindowDays) => void saveBusiness('sales', { cashierReturnWindowDays })} />}
        </SettingRow>
      </SettingsCard>

      <SettingsCard icon={Ban} title={t('settings.sales.cancel')} description={t('settings.sales.cancelHint')}>
        <SwitchRow anchor="allowCancel" label={t('settings.sales.allowCancel')} checked={sales.allowCancel} onChange={(allowCancel) => void saveBusiness('sales', { allowCancel })} />
        <SettingRow anchor="cancelWindow" label={t('settings.sales.cancelWindow')} description={t('settings.sales.cancelWindowHint')}>
          {(id) => <NumberInput id={id} value={sales.cancelWindowHours} min={1} max={720} suffix={t('settings.units.hours')} disabled={!sales.allowCancel} className="w-40" onCommit={(cancelWindowHours) => void saveBusiness('sales', { cancelWindowHours })} />}
        </SettingRow>
      </SettingsCard>
    </div>
  );
}
