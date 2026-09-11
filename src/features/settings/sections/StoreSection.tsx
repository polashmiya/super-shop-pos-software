import { useRef, useState, type ChangeEvent } from 'react';
import { BadgeCheck, ImageUp, Phone, Store, Trash2, Upload } from 'lucide-react';
import { validateEmail } from '@/domain/validation';
import { useLanguage, useT } from '@/i18n';
import { toast } from '@/stores/uiStore';
import type { StoreInfoSettings } from '@/types';
import { StoreLogo } from '@/components/app/StoreLogo';
import { Button } from '@/components/ui/Button';
import { FormField } from '@/components/ui/Input';
import { TextField } from '../components/Inputs';
import { PreviewPanel, SettingBlock, SettingsCard } from '../components/SettingsCard';
import { imageFileToLogo, LOGO_MAX_FILE_MB, LOGO_MAX_PX, LogoError } from '../logo';
import { saveBusiness, useBusinessGroup } from '../saveStatus';

type TextKey = Exclude<keyof StoreInfoSettings, 'logo'>;

/** Shop identity: bilingual name and address, contact, legal numbers and logo. */
export default function StoreSection() {
  const t = useT();
  const store = useBusinessGroup('store');
  const save = (key: TextKey) => (value: string) => void saveBusiness('store', { [key]: value } as Partial<StoreInfoSettings>);
  const requiredName = (value: string) => (value.trim() ? null : t('settings.store.nameRequired'));
  const email = (value: string) => {
    const problem = validateEmail(value);
    return problem ? t(`validation.${problem}`) : null;
  };

  return (
    <div className="flex flex-col gap-5">
      <SettingsCard icon={Store} title={t('settings.store.identity')} description={t('settings.store.identityHint')}>
        <SettingBlock anchor="storeName">
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label={t('settings.store.nameBn')} required>
              {(id) => <TextField id={id} lang="bn" value={store.nameBn} onCommit={save('nameBn')} validate={requiredName} maxLength={80} />}
            </FormField>
            <FormField label={t('settings.store.nameEn')} required>
              {(id) => <TextField id={id} lang="en" value={store.nameEn} onCommit={save('nameEn')} validate={requiredName} maxLength={80} />}
            </FormField>
          </div>
        </SettingBlock>
        <SettingBlock anchor="storeAddress">
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label={t('settings.store.addressBn')}>
              {(id) => <TextField id={id} lang="bn" multiline value={store.addressBn} onCommit={save('addressBn')} maxLength={160} />}
            </FormField>
            <FormField label={t('settings.store.addressEn')}>
              {(id) => <TextField id={id} lang="en" multiline value={store.addressEn} onCommit={save('addressEn')} maxLength={160} />}
            </FormField>
          </div>
        </SettingBlock>
      </SettingsCard>

      <SettingsCard icon={Phone} title={t('settings.store.contact')} description={t('settings.store.contactHint')}>
        <SettingBlock anchor="storeContact">
          <div className="grid gap-4 sm:grid-cols-3">
            <FormField label={t('settings.store.phone')}>{(id) => <TextField id={id} value={store.phone} onCommit={save('phone')} maxLength={40} />}</FormField>
            <FormField label={t('settings.store.email')}>{(id) => <TextField id={id} value={store.email} onCommit={save('email')} validate={email} maxLength={120} />}</FormField>
            <FormField label={t('settings.store.website')}>{(id) => <TextField id={id} value={store.website} onCommit={save('website')} maxLength={120} />}</FormField>
          </div>
        </SettingBlock>
      </SettingsCard>

      <SettingsCard icon={BadgeCheck} title={t('settings.store.registration')} description={t('settings.store.registrationHint')}>
        <SettingBlock anchor="storeBin">
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label={t('settings.store.bin')} hint={t('settings.store.binHint')}>
              {(id) => <TextField id={id} mono value={store.taxId} onCommit={save('taxId')} maxLength={40} />}
            </FormField>
            <FormField label={t('settings.store.tradeLicense')}>{(id) => <TextField id={id} mono value={store.tradeLicense} onCommit={save('tradeLicense')} maxLength={60} />}</FormField>
          </div>
        </SettingBlock>
      </SettingsCard>

      <LogoCard store={store} />
    </div>
  );
}

function LogoCard({ store }: { store: StoreInfoSettings }) {
  const t = useT();
  const language = useLanguage();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const name = language === 'bn' ? store.nameBn : store.nameEn;
  const address = language === 'bn' ? store.addressBn : store.addressEn;

  const onFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const logo = await imageFileToLogo(file);
      if (await saveBusiness('store', { logo })) toast.success('settings.store.updated');
    } catch (reason) {
      setError(reason instanceof LogoError && reason.problem === 'tooLarge' ? t('settings.store.tooLarge', { size: LOGO_MAX_FILE_MB }) : t('settings.store.invalid'));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setError(null);
    if (await saveBusiness('store', { logo: null })) toast.success('settings.store.removed');
  };

  return (
    <SettingsCard icon={ImageUp} title={t('settings.store.logo')}>
      <SettingBlock anchor="logo">
        <div className="flex flex-wrap items-center gap-5">
          <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-xl border border-border bg-surface-2">
            <StoreLogo size={72} />
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <p className="type-body font-medium text-fg">{store.logo ? t('settings.store.custom') : t('settings.store.builtIn')}</p>
            <p className="type-caption text-fg-subtle">{t('settings.store.logoHint', { size: LOGO_MAX_PX })}</p>
            {error && (
              <p role="alert" className="type-caption text-danger-text">
                {error}
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button icon={Upload} loading={busy} onClick={() => fileRef.current?.click()}>
                {store.logo ? t('settings.store.change') : t('settings.store.upload')}
              </Button>
              {store.logo && (
                <Button variant="ghost" icon={Trash2} onClick={() => void remove()}>
                  {t('settings.store.remove')}
                </Button>
              )}
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/svg+xml,image/gif"
              tabIndex={-1}
              aria-hidden
              className="sr-only"
              onChange={(event) => void onFile(event)}
            />
          </div>
        </div>
        <PreviewPanel className="mt-4" label={t('settings.store.preview')}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <span className="type-caption text-fg-subtle">{t('settings.store.sidebarSample')}</span>
              <div className="flex items-center gap-2.5 rounded-lg border border-border bg-surface px-3 py-2.5">
                <StoreLogo size={36} />
                <div className="min-w-0">
                  <p className="truncate font-semibold text-fg">{name}</p>
                  <p className="type-caption truncate text-fg-subtle">{address}</p>
                </div>
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="type-caption text-fg-subtle">{t('settings.store.receiptSample')}</span>
              <div className="flex flex-col items-center gap-0.5 rounded-md bg-paper px-4 py-3 text-center text-paper-fg shadow-sm type-receipt">
                <StoreLogo size={34} className="grayscale" />
                <p className="mt-1 text-[1.2em] font-extrabold">{name}</p>
                <p>{address}</p>
                {store.phone && <p className="tnum">{store.phone}</p>}
                {store.taxId && <p>{t('receipt.bin', { id: store.taxId })}</p>}
              </div>
            </div>
          </div>
        </PreviewPanel>
      </SettingBlock>
    </SettingsCard>
  );
}
