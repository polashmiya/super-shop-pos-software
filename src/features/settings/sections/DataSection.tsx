import { useState } from 'react';
import { ArchiveRestore, Database, DatabaseBackup, FolderOpen, Sparkles, Trash2, TriangleAlert, WandSparkles } from 'lucide-react';
import { refreshWorkspace } from '@/app/bootstrap';
import { useAsync } from '@/hooks/useAsync';
import { useFormat } from '@/hooks/useFormat';
import { useT, type TranslationKey } from '@/i18n';
import { hasPlatform, isDesktop } from '@/platform';
import { auditService } from '@/services/auditService';
import { dataService } from '@/services/dataService';
import { useSettingsStore } from '@/stores/settingsStore';
import { confirmAction, toast } from '@/stores/uiStore';
import { Button } from '@/components/ui/Button';
import { DefinitionList } from '@/components/ui/Display';
import { Skeleton } from '@/components/ui/States';
import { SettingBlock, SettingRow, SettingsCard } from '../components/SettingsCard';

type Busy = 'backup' | 'import' | 'reset' | 'more' | 'clear' | null;

const TABLES = ['products', 'customers', 'sales', 'sale_items', 'stock_movements', 'purchases', 'suppliers', 'cash_sessions', 'expenses', 'audit_logs'] as const;

function fileName(path: string | undefined): string {
  return path ? (path.split(/[\\/]/).pop() ?? path) : '';
}

/** Database facts, backup / restore (preview → type to confirm → restart), demo data and the danger zone. */
export default function DataSection() {
  const t = useT();
  const format = useFormat();
  const desktop = hasPlatform();
  const native = isDesktop();
  const lastBackupAt = useSettingsStore((state) => state.session.lastBackupAt);
  const info = useAsync(() => (desktop ? dataService.databaseInfo() : Promise.resolve(null)), [desktop]);
  const [busy, setBusy] = useState<Busy>(null);

  const run = async (kind: Exclude<Busy, null>, work: () => Promise<void>) => {
    setBusy(kind);
    try {
      await work();
    } catch (error) {
      toast.fromError(error);
    } finally {
      setBusy(null);
    }
  };

  const restart = async (message: TranslationKey) => {
    toast.success(message);
    await useSettingsStore.getState().flush();
    await dataService.relaunch();
  };

  const backup = () =>
    run('backup', async () => {
      const result = await dataService.exportBackup();
      if (!result.ok) {
        if (result.reason !== 'cancelled') toast.error('settings.data.actionFailed');
        return;
      }
      await useSettingsStore.getState().updateSession({ lastBackupAt: new Date().toISOString() });
      await auditService.record('data.exported', 'data', null, { file: fileName(result.filePath) });
      toast.success('settings.data.backupDone', result.filePath ? { text: result.filePath } : undefined);
      info.reload();
    });

  const restore = () =>
    run('import', async () => {
      const picked = await dataService.pickImport();
      if (!picked.ok || !picked.preview) {
        if (picked.reason === 'cancelled') return;
        toast.error(picked.reason === 'newer-schema' ? 'settings.data.newerSchema' : picked.reason === 'invalid' ? 'settings.data.importInvalid' : 'settings.data.importFailed');
        return;
      }
      const preview = picked.preview;
      const ok = await confirmAction({
        title: t('settings.data.restoreTitle'),
        message: t('settings.data.restoreMessage', {
          file: preview.fileName,
          date: format.dateTime(preview.exportedAt),
          version: preview.appVersion,
          products: format.integer(preview.counts.products ?? 0),
          sales: format.integer(preview.counts.sales ?? 0),
          customers: format.integer(preview.counts.customers ?? 0),
        }),
        confirmLabel: t('settings.data.restoreConfirm'),
        typeToConfirm: t('settings.data.restoreWord'),
      });
      if (!ok) return;
      const result = await dataService.applyImport(preview.token);
      if (!result.ok) {
        toast.error('settings.data.importFailed');
        return;
      }
      await restart('settings.data.restored');
    });

  const resetDemo = () =>
    run('reset', async () => {
      const ok = await confirmAction({ title: t('settings.data.resetDemoTitle'), message: t('settings.data.resetDemoMessage'), confirmLabel: t('settings.data.resetDemo'), typeToConfirm: t('settings.data.resetDemoWord') });
      if (!ok) return;
      const result = await dataService.resetDemo();
      if (!result.ok) toast.error('settings.data.actionFailed');
      else await restart('settings.data.resetDone');
    });

  const generateMore = () =>
    run('more', async () => {
      const result = await dataService.generateMore();
      if (!result.ok) {
        toast.error('settings.data.actionFailed');
        return;
      }
      toast.success({ key: 'settings.data.generated', params: { sales: result.sales ?? 0, customers: result.customers ?? 0 } });
      await refreshWorkspace();
      info.reload();
    });

  const clearAll = () =>
    run('clear', async () => {
      const ok = await confirmAction({ title: t('settings.data.clearTitle'), message: t('settings.data.clearMessage'), confirmLabel: t('settings.data.clearAll'), typeToConfirm: t('settings.data.clearWord') });
      if (!ok) return;
      const result = await dataService.clearLocal();
      if (!result.ok) toast.error('settings.data.actionFailed');
      else await restart('settings.data.cleared');
    });

  const data = info.data;
  const disabled = !desktop || busy !== null;

  return (
    <div className="flex flex-col gap-5">


      <SettingsCard
        icon={Database}
        title={t('settings.data.database')}
        description={t('settings.data.databaseHint')}
        action={
          native && (
            <Button size="sm" variant="ghost" icon={FolderOpen} onClick={() => void dataService.openDataFolder().catch((error: unknown) => toast.fromError(error))}>
              {t('settings.data.openFolder')}
            </Button>
          )
        }
      >
        <SettingBlock anchor="databaseInfo">
          {info.loading && !data ? (
            <Skeleton className="h-24 w-full" />
          ) : data ? (
            <div className="flex flex-col gap-4">
              <DefinitionList
                columns={3}
                items={[
                  { label: t('settings.data.size'), value: <span className="tnum">{format.number(data.sizeBytes / 1024 / 1024, 1)} MB</span> },
                  { label: t('settings.data.schema'), value: format.integer(data.schemaVersion) },
                  { label: t('settings.data.engine'), value: data.sqliteVersion },
                ]}
              />
              <div>
                <p className="type-caption text-fg-subtle">{t('settings.data.location')}</p>
                <p className="selectable truncate font-mono text-[0.8rem] text-fg-muted" title={data.path}>
                  {data.path}
                </p>
              </div>
              <div>
                <p className="type-caption mb-2 text-fg-subtle">{t('settings.data.records')}</p>
                <dl className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                  {TABLES.map((table) => (
                    <div key={table} className="rounded-md bg-surface-2 px-3 py-2">
                      <dt className="type-caption truncate text-fg-subtle">{t(`settings.data.tables.${table}`)}</dt>
                      <dd className="font-semibold text-fg tnum">{format.integer(data.counts[table] ?? 0)}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            </div>
          ) : (
            <p className="type-body-sm text-fg-muted">{info.error ? t('settings.ui.loadFailed') : t('settings.ui.desktopOnly')}</p>
          )}
        </SettingBlock>
      </SettingsCard>

      <SettingsCard icon={DatabaseBackup} title={t('settings.data.backup')} description={lastBackupAt ? t('settings.data.lastBackup', { time: format.relative(lastBackupAt) }) : t('settings.data.neverBackedUp')}>
        <SettingRow anchor="backupNow" label={t('settings.data.backupNow')} description={t('settings.data.backupHint')}>
          <Button variant="primary" icon={DatabaseBackup} loading={busy === 'backup'} disabled={disabled} onClick={() => void backup()}>
            {t('settings.data.backupNow')}
          </Button>
        </SettingRow>
        <SettingRow anchor="restoreBackup" label={t('settings.data.restore')} description={t('settings.data.restoreHint')}>
          <Button icon={ArchiveRestore} loading={busy === 'import'} disabled={disabled} onClick={() => void restore()}>
            {t('settings.data.chooseFile')}
          </Button>
        </SettingRow>
      </SettingsCard>

      <SettingsCard icon={Sparkles} title={t('settings.data.demo')} description={t('settings.data.demoHint')}>
        <SettingRow anchor="generateMore" label={t('settings.data.generateMore')} description={t('settings.data.generateMoreHint')}>
          <Button icon={WandSparkles} loading={busy === 'more'} disabled={disabled} onClick={() => void generateMore()}>
            {t('settings.data.generateMore')}
          </Button>
        </SettingRow>
        <SettingRow anchor="resetDemo" label={t('settings.data.resetDemo')} description={t('settings.data.resetDemoHint')}>
          <Button variant="outline" icon={ArchiveRestore} loading={busy === 'reset'} disabled={disabled} onClick={() => void resetDemo()}>
            {t('settings.data.resetDemo')}
          </Button>
        </SettingRow>
      </SettingsCard>

      <SettingsCard icon={TriangleAlert} title={t('settings.data.danger')} description={t('settings.data.dangerHint')} className="border-danger/50">
        <SettingRow anchor="clearAll" label={t('settings.data.clearAll')} description={t('settings.data.clearAllHint')}>
          <Button variant="danger" icon={Trash2} loading={busy === 'clear'} disabled={disabled} onClick={() => void clearAll()}>
            {t('settings.data.clearAll')}
          </Button>
        </SettingRow>
      </SettingsCard>
    </div>
  );
}
