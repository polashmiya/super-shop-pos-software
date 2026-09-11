import { Banknote, CreditCard, Smartphone, SquareSplitHorizontal, Wallet } from 'lucide-react';
import { useT } from '@/i18n';
import { toast } from '@/stores/uiStore';
import type { MobileProvider, PaymentSettings } from '@/types';
import { QuickCashEditor } from '../components/QuickCashEditor';
import { SettingRow, SettingsCard, SwitchRow } from '../components/SettingsCard';
import { saveBusiness, useBusinessGroup } from '../saveStatus';

type Method = keyof PaymentSettings['methods'];

const METHODS: Method[] = ['cash', 'card', 'mobile'];
const PROVIDERS: MobileProvider[] = ['bkash', 'nagad', 'rocket', 'upay', 'other'];

/** Payment methods, mobile banking providers (bKash, Nagad…), reference checks, split payments and quick cash. */
export default function PaymentSection() {
  const t = useT();
  const payment = useBusinessGroup('payment');

  const setMethod = (method: Method, enabled: boolean) => {
    const methods = { ...payment.methods, [method]: enabled };
    if (!Object.values(methods).some(Boolean)) {
      toast.warning('settings.payment.atLeastOne');
      return;
    }
    void saveBusiness('payment', { methods });
  };

  const setProvider = (provider: MobileProvider, enabled: boolean) => {
    const mobileProviders = { ...payment.mobileProviders, [provider]: enabled };
    if (payment.methods.mobile && !Object.values(mobileProviders).some(Boolean)) {
      toast.warning('settings.payment.atLeastOneProvider');
      return;
    }
    void saveBusiness('payment', { mobileProviders });
  };

  return (
    <div className="flex flex-col gap-5">
      <SettingsCard icon={Wallet} title={t('settings.payment.methods')} description={t('settings.payment.methodsHint')}>
        {METHODS.map((method) => (
          <SwitchRow
            key={method}
            anchor={`method-${method}`}
            label={
              <span className="inline-flex items-center gap-2">
                {method === 'cash' ? <Banknote size={17} aria-hidden /> : method === 'card' ? <CreditCard size={17} aria-hidden /> : <Smartphone size={17} aria-hidden />}
                {t(`enums.paymentMethod.${method}`)}
              </span>
            }
            description={t(`settings.payment.methodHints.${method}`)}
            checked={payment.methods[method]}
            onChange={(enabled) => setMethod(method, enabled)}
          />
        ))}
      </SettingsCard>

      <SettingsCard icon={Smartphone} title={t('settings.payment.mobile')} description={t('settings.payment.mobileHint')}>
        {PROVIDERS.map((provider) => (
          <SwitchRow
            key={provider}
            anchor={`provider-${provider}`}
            label={t(`enums.mobileProvider.${provider}`)}
            checked={payment.mobileProviders[provider]}
            disabled={!payment.methods.mobile}
            onChange={(enabled) => setProvider(provider, enabled)}
          />
        ))}
      </SettingsCard>

      <SettingsCard icon={SquareSplitHorizontal} title={t('settings.payment.references')} description={t('settings.payment.referencesHint')}>
        <SwitchRow anchor="cardReference" label={t('settings.payment.cardRef')} checked={payment.requireCardReference} disabled={!payment.methods.card} onChange={(requireCardReference) => void saveBusiness('payment', { requireCardReference })} />
        <SwitchRow anchor="mobileReference" label={t('settings.payment.mobileRef')} checked={payment.requireMobileReference} disabled={!payment.methods.mobile} onChange={(requireMobileReference) => void saveBusiness('payment', { requireMobileReference })} />
        <SwitchRow anchor="splitPayment" label={t('settings.payment.split')} description={t('settings.payment.splitHint')} checked={payment.allowSplit} onChange={(allowSplit) => void saveBusiness('payment', { allowSplit })} />
      </SettingsCard>

      <SettingsCard icon={Banknote} title={t('settings.payment.quickCash')} description={t('settings.payment.quickCashHint')}>
        <SettingRow anchor="quickCash" label={t('settings.quickCash.title')} stacked>
          <QuickCashEditor value={payment.quickCash} onChange={(quickCash) => void saveBusiness('payment', { quickCash })} />
        </SettingRow>
      </SettingsCard>
    </div>
  );
}
