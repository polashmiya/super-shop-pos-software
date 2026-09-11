import { BellRing, ShieldCheck, Tag } from 'lucide-react';
import { useT } from '@/i18n';
import { PercentInput } from '../components/Inputs';
import { Note, SettingBlock, SettingRow, SettingsCard, SwitchRow } from '../components/SettingsCard';
import { saveBusiness, useBusinessGroup } from '../saveStatus';

/** Which manual discounts are allowed, the approval limits per role and the large-discount alert. */
export default function DiscountSection() {
  const t = useT();
  const discount = useBusinessGroup('discount');

  return (
    <div className="flex flex-col gap-5">
      <SettingsCard icon={Tag} title={t('settings.discount.allowed')} description={t('settings.discount.allowedHint')}>
        <SwitchRow anchor="itemDiscount" label={t('settings.discount.item')} checked={discount.allowItemDiscount} onChange={(allowItemDiscount) => void saveBusiness('discount', { allowItemDiscount })} />
        <SwitchRow anchor="orderDiscount" label={t('settings.discount.order')} checked={discount.allowOrderDiscount} onChange={(allowOrderDiscount) => void saveBusiness('discount', { allowOrderDiscount })} />
        <SwitchRow anchor="discountReason" label={t('settings.discount.reason')} checked={discount.requireReason} onChange={(requireReason) => void saveBusiness('discount', { requireReason })} />
      </SettingsCard>

      <SettingsCard icon={ShieldCheck} title={t('settings.discount.limits')} description={t('settings.discount.limitsHint')}>
        <SettingRow anchor="cashierDiscountLimit" label={t('settings.discount.cashierMax')}>
          {(id) => <PercentInput id={id} value={discount.cashierMaxRate} max={discount.managerMaxRate} onCommit={(cashierMaxRate) => void saveBusiness('discount', { cashierMaxRate })} />}
        </SettingRow>
        <SettingRow anchor="managerDiscountLimit" label={t('settings.discount.managerMax')}>
          {(id) => <PercentInput id={id} value={discount.managerMaxRate} min={discount.cashierMaxRate} onCommit={(managerMaxRate) => void saveBusiness('discount', { managerMaxRate })} />}
        </SettingRow>
        <SettingBlock>
          <Note tone="neutral">{t('settings.discount.approvalNote')}</Note>
        </SettingBlock>
      </SettingsCard>

      <SettingsCard icon={BellRing} title={t('settings.discount.alert')}>
        <SettingRow anchor="largeDiscount" label={t('settings.discount.alert')} description={t('settings.discount.alertHint')}>
          {(id) => <PercentInput id={id} value={discount.largeDiscountRate} min={100} onCommit={(largeDiscountRate) => void saveBusiness('discount', { largeDiscountRate })} />}
        </SettingRow>
      </SettingsCard>
    </div>
  );
}
