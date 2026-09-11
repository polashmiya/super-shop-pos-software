import { CloudOff, FolderOpen, HardDrive, Info, Keyboard, Mail, Scale, Sparkles, UserRound } from 'lucide-react';
import { APP_CONFIG } from '@/config/app.config';
import { useAsync } from '@/hooks/useAsync';
import { useFormat } from '@/hooks/useFormat';
import { useLanguage, useT, type TranslationKey } from '@/i18n';
import { hasElectronAPI } from '@/platform/electron';
import { dataService } from '@/services/dataService';
import { useCan } from '@/stores/authStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { toast } from '@/stores/uiStore';
import { Button } from '@/components/ui/Button';
import { Avatar, Badge, DefinitionList, Kbd } from '@/components/ui/Display';
import { Skeleton } from '@/components/ui/States';
import { StoreLogo } from '@/components/app/StoreLogo';
import { Note, SettingBlock, SettingRow, SettingsCard } from '../components/SettingsCard';

/** Open-source software and fonts bundled with the app (names are proper nouns). */
const CREDITS: ReadonlyArray<{ name: string; role: TranslationKey }> = [
  { name: 'Electron', role: 'settings.about.roles.desktop' },
  { name: 'React', role: 'settings.about.roles.ui' },
  { name: 'TypeScript', role: 'settings.about.roles.language' },
  { name: 'Vite', role: 'settings.about.roles.build' },
  { name: 'Tailwind CSS', role: 'settings.about.roles.styles' },
  { name: 'Zustand', role: 'settings.about.roles.state' },
  { name: 'Lucide', role: 'settings.about.roles.icons' },
  { name: 'SQLite', role: 'settings.about.roles.database' },
  { name: 'electron-store', role: 'settings.about.roles.settings' },
  { name: 'Noto Sans Bengali · Hind Siliguri · Anek Bangla · Inter', role: 'settings.about.roles.fonts' },
];

/** Version, runtime and data folder, offline status, licence and credits. */
export default function AboutSection() {
  const t = useT();
  const format = useFormat();
  const language = useLanguage();
  const desktop = hasElectronAPI();
  const canManageData = useCan('data.manage');
  const store = useSettingsStore((state) => state.business.store);
  const info = useAsync(() => (desktop ? dataService.appInfo() : Promise.resolve(null)), [desktop]);
  const data = info.data;
  const storeName = language === 'bn' ? store.nameBn || store.nameEn : store.nameEn || store.nameBn;

  return (
    <div className="flex flex-col gap-5">
      <SettingsCard icon={Info} title={t('settings.about.app')} description={t('settings.about.appHint')}>
        <SettingBlock anchor="appVersion">
          <div className="flex flex-wrap items-center gap-4">
            <StoreLogo size={56} />
            <div className="min-w-0 flex-1">
              <p className="type-h2 text-fg">{APP_CONFIG.name}</p>
              <p className="type-body-sm text-fg-muted">
                {t('settings.about.versionLine', { version: format.digits(APP_CONFIG.version) })}
                {data && <> · {data.isPackaged ? t('settings.about.packaged') : t('settings.about.development')}</>}
              </p>
            </div>
            <Badge tone="success" icon={CloudOff}>
              {t('settings.about.syncLocal')}
            </Badge>
          </div>
        </SettingBlock>
        <SettingBlock anchor="systemInfo">
          {info.loading && !data ? (
            <Skeleton className="h-20 w-full" />
          ) : data ? (
            <DefinitionList
              columns={3}
              items={[
                { label: t('settings.about.version'), value: format.digits(data.version) },
                { label: t('settings.about.electron'), value: format.digits(data.electron) },
                { label: t('settings.about.chrome'), value: format.digits(data.chrome) },
                { label: t('settings.about.node'), value: format.digits(data.node) },
                { label: t('settings.about.platform'), value: `${data.platform} · ${data.arch}` },
                { label: t('settings.about.schema'), value: format.integer(APP_CONFIG.database.schemaVersion) },
              ]}
            />
          ) : (
            <p className="type-body-sm text-fg-muted">{info.error ? t('settings.ui.loadFailed') : t('settings.ui.desktopOnly')}</p>
          )}
        </SettingBlock>
      </SettingsCard>

      <SettingsCard icon={HardDrive} title={t('settings.about.dataFolder')} description={t('settings.about.dataFolderHint')}>
        <SettingRow anchor="dataFolder" label={t('settings.about.location')} description={<span className="selectable break-all font-mono text-[0.8rem]">{data?.userDataPath ?? '—'}</span>}>
          {canManageData && (
            <Button icon={FolderOpen} disabled={!desktop} onClick={() => void dataService.openDataFolder().catch((error: unknown) => toast.fromError(error))}>
              {t('settings.about.openFolder')}
            </Button>
          )}
        </SettingRow>
        <SettingBlock>
          <Note tone="info" icon={CloudOff}>
            <p className="font-semibold">{t('settings.about.offline')}</p>
            <p>{t('settings.about.offlineHint')}</p>
            <p className="mt-1 opacity-80">{t('settings.about.syncFuture')}</p>
          </Note>
        </SettingBlock>
      </SettingsCard>

      <SettingsCard icon={Scale} title={t('settings.about.licence')}>
        <SettingBlock anchor="licence" className="flex flex-col gap-1">
          <p className="type-body text-fg">{t('settings.about.licensedTo', { store: storeName })}</p>
          <p className="type-body-sm text-fg-muted">{t('settings.about.copyright', { year: format.digits(String(new Date().getFullYear())), name: APP_CONFIG.name })}</p>
        </SettingBlock>
        <SettingBlock className="flex flex-wrap items-center gap-2 type-body-sm text-fg-muted">
          <Keyboard size={16} aria-hidden />
          <span>{t('settings.about.searchTip')}</span>
          <Kbd>Ctrl</Kbd>
          <Kbd>K</Kbd>
        </SettingBlock>
      </SettingsCard>

      <SettingsCard icon={UserRound} title={t('settings.about.developer')} description={t('settings.about.developerHint')}>
        <SettingBlock anchor="developer">
          <div className="flex flex-wrap items-center gap-4">
            {/* Initials without the "Md." honorific. */}
            <Avatar name={APP_CONFIG.developer.name.replace(/^md\.?\s+/i, '')} size={56} />
            <div className="min-w-0 flex-1">
              <p className="type-h3 text-fg" lang="en">
                {APP_CONFIG.developer.name}
              </p>
              <p className="type-body-sm text-fg-muted">{t('settings.about.developerTitle')}</p>
              <p className="mt-1 flex items-center gap-1.5 type-body-sm">
                <Mail size={15} aria-hidden className="shrink-0 text-fg-subtle" />
                <a href={`mailto:${APP_CONFIG.developer.email}`} className="selectable truncate font-medium text-primary hover:underline" lang="en">
                  {APP_CONFIG.developer.email}
                </a>
              </p>
            </div>
          </div>
        </SettingBlock>
      </SettingsCard>

      <SettingsCard icon={Sparkles} title={t('settings.about.credits')} description={t('settings.about.creditsHint')}>
        <SettingBlock anchor="credits">
          <ul className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
            {CREDITS.map((credit) => (
              <li key={credit.name} className="flex min-w-0 flex-col">
                <span className="truncate font-medium text-fg" lang="en">
                  {credit.name}
                </span>
                <span className="type-caption text-fg-subtle">{t(credit.role)}</span>
              </li>
            ))}
          </ul>
          <p className="type-caption mt-4 text-fg-subtle">{t('settings.about.fontsLicence')}</p>
        </SettingBlock>
      </SettingsCard>
    </div>
  );
}
