import { BadgePercent, UserRound } from 'lucide-react';
import { useT } from '@/i18n';
import type { CustomerType, DiscountSettings } from '@/types';
import { Select } from '@/components/ui/Controls';
import { PercentInput } from '../components/Inputs';
import { SettingRow, SettingsCard, SwitchRow } from '../components/SettingsCard';
import { saveBusiness, useBusinessGroup } from '../saveStatus';

type MemberType = keyof DiscountSettings['customerTypeRates'];

const TYPES: Array<Exclude<CustomerType, 'walk_in'>> = ['regular', 'vip', 'wholesale'];
const MEMBER_TYPES: MemberType[] = ['regular', 'vip', 'wholesale'];

/** Customer record rules and automatic member discounts by customer type. */
export default function CustomerSection() {
  const t = useT();
  const customer = useBusinessGroup('customer');
  const discount = useBusinessGroup('discount');

  return (
    <div className="flex flex-col gap-5">
      <SettingsCard icon={UserRound} title={t('settings.customer.records')} description={t('settings.customer.recordsHint')}>
        <SwitchRow anchor="requirePhone" label={t('settings.customer.requirePhone')} description={t('settings.customer.requirePhoneHint')} checked={customer.requirePhone} onChange={(requirePhone) => void saveBusiness('customer', { requirePhone })} />
        <SettingRow anchor="defaultCustomerType" label={t('settings.customer.defaultType')}>
          {(id) => (
            <div className="w-56">
              <Select id={id} value={customer.defaultType} options={TYPES.map((value) => ({ value, label: t(`enums.customerType.${value}`) }))} onChange={(defaultType) => void saveBusiness('customer', { defaultType })} />
            </div>
          )}
        </SettingRow>
      </SettingsCard>

      <SettingsCard icon={BadgePercent} title={t('settings.customer.memberDiscounts')} description={t('settings.customer.memberDiscountsHint')}>
        <SwitchRow
          anchor="memberDiscountAuto"
          label={t('settings.customer.autoApply')}
          description={t('settings.customer.autoApplyHint')}
          checked={discount.applyCustomerDiscountAutomatically}
          onChange={(applyCustomerDiscountAutomatically) => void saveBusiness('discount', { applyCustomerDiscountAutomatically })}
        />
        {MEMBER_TYPES.map((type) => (
          <SettingRow key={type} anchor={`memberRate-${type}`} label={t('settings.customer.rateFor', { type: t(`enums.customerType.${type}`) })}>
            {(id) => (
              <PercentInput
                id={id}
                value={discount.customerTypeRates[type]}
                max={5_000}
                onCommit={(rate) => void saveBusiness('discount', { customerTypeRates: { ...discount.customerTypeRates, [type]: rate } })}
              />
            )}
          </SettingRow>
        ))}
      </SettingsCard>
    </div>
  );
}
