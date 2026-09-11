import { Calculator, Coins, Gift, HandCoins } from 'lucide-react';
import { calculatePointsEarned, maxRedeemableAmount, pointsToMoney } from '@/domain/loyalty';
import { useFormat } from '@/hooks/useFormat';
import { useT } from '@/i18n';
import { MoneyInput, NumberInput, PercentInput } from '../components/Inputs';
import { Note, SettingBlock, SettingRow, SettingsCard, SwitchRow } from '../components/SettingsCard';
import { saveBusiness, useBusinessGroup } from '../saveStatus';

const EXAMPLE_BILL = 125_000;
const EXAMPLE_BALANCE = 500;
const EXAMPLE_POINTS = 100;

/** Points earning and redemption rules, with a worked example that follows every change. */
export default function LoyaltySection() {
  const t = useT();
  const format = useFormat();
  const loyalty = useBusinessGroup('loyalty');
  const earned = calculatePointsEarned(EXAMPLE_BILL, loyalty);
  const maxPayable = maxRedeemableAmount(EXAMPLE_BALANCE, EXAMPLE_BILL, loyalty);

  return (
    <div className="flex flex-col gap-5">
      <SettingsCard icon={Gift} title={t('settings.loyalty.programme')} description={t('settings.loyalty.programmeHint')}>
        <SwitchRow anchor="loyaltyEnabled" label={t('settings.loyalty.enabled')} description={t('settings.loyalty.enabledHint')} checked={loyalty.enabled} onChange={(enabled) => void saveBusiness('loyalty', { enabled })} />
      </SettingsCard>

      <SettingsCard icon={Coins} title={t('settings.loyalty.earning')}>
        <SettingRow anchor="loyaltyEarnStep" label={t('settings.loyalty.earnStep')} description={t('settings.loyalty.earnStepHint')}>
          {(id) => <MoneyInput id={id} value={loyalty.earnStep} min={100} disabled={!loyalty.enabled} onCommit={(earnStep) => void saveBusiness('loyalty', { earnStep })} />}
        </SettingRow>
        <SettingRow anchor="loyaltyPointsPerStep" label={t('settings.loyalty.pointsPerStep')}>
          {(id) => <NumberInput id={id} value={loyalty.pointsPerStep} min={1} max={1_000} suffix={t('settings.units.points')} disabled={!loyalty.enabled} className="w-44" onCommit={(pointsPerStep) => void saveBusiness('loyalty', { pointsPerStep })} />}
        </SettingRow>
      </SettingsCard>

      <SettingsCard icon={HandCoins} title={t('settings.loyalty.redeeming')}>
        <SettingRow anchor="loyaltyPointValue" label={t('settings.loyalty.pointValue')}>
          {(id) => <MoneyInput id={id} value={loyalty.pointValue} min={1} disabled={!loyalty.enabled} onCommit={(pointValue) => void saveBusiness('loyalty', { pointValue })} />}
        </SettingRow>
        <SettingRow anchor="loyaltyMinRedeem" label={t('settings.loyalty.minRedeem')}>
          {(id) => <NumberInput id={id} value={loyalty.minRedeemPoints} min={0} max={100_000} suffix={t('settings.units.points')} disabled={!loyalty.enabled} className="w-44" onCommit={(minRedeemPoints) => void saveBusiness('loyalty', { minRedeemPoints })} />}
        </SettingRow>
        <SettingRow anchor="loyaltyMaxRedeem" label={t('settings.loyalty.maxRedeem')}>
          {(id) => <PercentInput id={id} value={loyalty.maxRedeemRate} disabled={!loyalty.enabled} onCommit={(maxRedeemRate) => void saveBusiness('loyalty', { maxRedeemRate })} />}
        </SettingRow>
      </SettingsCard>

      {loyalty.enabled && (
        <SettingsCard icon={Calculator} title={t('settings.loyalty.example')}>
          <SettingBlock anchor="loyaltyExample">
            <Note>
              <ul className="flex list-disc flex-col gap-1 ps-4">
                <li>{t('settings.loyalty.exampleEarn', { amount: format.money(EXAMPLE_BILL), points: format.integer(earned) })}</li>
                <li>{t('settings.loyalty.exampleWorth', { points: format.integer(EXAMPLE_POINTS), amount: format.money(pointsToMoney(EXAMPLE_POINTS, loyalty)) })}</li>
                <li>{t('settings.loyalty.exampleRedeem', { amount: format.money(EXAMPLE_BILL), balance: format.integer(EXAMPLE_BALANCE), max: format.money(maxPayable) })}</li>
                <li>{t('settings.loyalty.exampleMin', { min: format.integer(loyalty.minRedeemPoints) })}</li>
              </ul>
            </Note>
          </SettingBlock>
        </SettingsCard>
      )}
    </div>
  );
}
