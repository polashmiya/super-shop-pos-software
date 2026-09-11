import { useNavigate } from 'react-router';
import { ArrowRight, Boxes, Check, Languages, Monitor, Moon, ReceiptText, Store, Users } from 'lucide-react';
import { landingPath } from '@/app/navigation';
import { useAsync } from '@/hooks/useAsync';
import { useFormat } from '@/hooks/useFormat';
import { useLanguage, useT } from '@/i18n';
import { dataService } from '@/services/dataService';
import { useAuthStore } from '@/stores/authStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { Button } from '@/components/ui/Button';
import { StoreLogo } from '@/components/app/StoreLogo';

/** First-run welcome: store summary, defaults, demo data (spec §137). */
export default function WelcomePage() {
  const t = useT();
  const language = useLanguage();
  const format = useFormat();
  const navigate = useNavigate();
  const store = useSettingsStore((state) => state.business.store);
  const business = useSettingsStore((state) => state.business);
  const updateSession = useSettingsStore((state) => state.updateSession);
  const info = useAsync(() => dataService.databaseInfo().catch(() => null), []);
  const counts = info.data?.counts ?? {};

  const finish = async () => {
    await updateSession({ firstRunCompleted: true });
    navigate(landingPath(useAuthStore.getState().can), { replace: true });
  };

  const defaults = [
    { icon: Languages, label: t('onboarding.language') },
    { icon: Moon, label: t('onboarding.theme') },
    { icon: Monitor, label: t('onboarding.images') },
    { icon: ReceiptText, label: t('onboarding.currency', { currency: `${business.currency.code} (${business.currency.symbol})` }) },
    { icon: ReceiptText, label: t('onboarding.vat', { rate: format.number(business.tax.defaultRate / 100, 1) }) },
  ];
  const demo = [
    { icon: Boxes, label: t('onboarding.demoProducts', { count: counts.products ?? 0 }) },
    { icon: Users, label: t('onboarding.demoCustomers', { count: counts.customers ?? 0 }) },
    { icon: ReceiptText, label: t('onboarding.demoSales', { count: counts.sales ?? 0 }) },
    { icon: Store, label: t('onboarding.demoCounters', { count: 4 }) },
  ];

  return (
    <div className="flex h-full items-center justify-center overflow-y-auto bg-bg p-6">
      <div className="w-full max-w-3xl rounded-2xl border border-border bg-surface p-8 shadow-lg animate-pop-in">
        <div className="flex items-center gap-4">
          <StoreLogo size={56} />
          <div>
            <h1 className="type-display text-fg">{t('onboarding.title')}</h1>
            <p className="type-body mt-1 text-fg-muted">{t('onboarding.subtitle')}</p>
          </div>
        </div>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          <section className="rounded-xl border border-border bg-surface-2 p-4">
            <h2 className="type-label text-fg-subtle">{t('onboarding.store')}</h2>
            <p className="mt-2 font-semibold text-fg">{language === 'bn' ? store.nameBn : store.nameEn}</p>
            <p className="type-body-sm text-fg-muted">{language === 'bn' ? store.addressBn : store.addressEn}</p>
            <p className="type-body-sm text-fg-muted tnum">{store.phone}</p>
          </section>
          <section className="rounded-xl border border-border bg-surface-2 p-4">
            <h2 className="type-label text-fg-subtle">{t('onboarding.defaults')}</h2>
            <ul className="mt-2 flex flex-col gap-1.5">
              {defaults.map((item) => (
                <li key={item.label} className="flex items-center gap-2 type-body-sm text-fg">
                  <Check size={15} aria-hidden className="text-success-text" />
                  {item.label}
                </li>
              ))}
            </ul>
          </section>
          <section className="rounded-xl border border-border bg-surface-2 p-4">
            <h2 className="type-label text-fg-subtle">{t('onboarding.demoData')}</h2>
            <ul className="mt-2 flex flex-col gap-1.5">
              {demo.map((item) => (
                <li key={item.label} className="flex items-center gap-2 type-body-sm text-fg">
                  <item.icon size={15} aria-hidden className="text-primary" />
                  {item.label}
                </li>
              ))}
            </ul>
          </section>
        </div>
        <p className="type-body-sm mt-6 text-fg-subtle">{t('onboarding.changeLater')}</p>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => void finish()}>
            {t('onboarding.skip')}
          </Button>
          <Button variant="primary" size="lg" iconRight={ArrowRight} onClick={() => void finish()} data-autofocus>
            {t('onboarding.goToPos')}
          </Button>
        </div>
      </div>
    </div>
  );
}
