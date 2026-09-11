import { memo } from 'react';
import { Database, HardDriveDownload, Keyboard, User, WifiOff } from 'lucide-react';
import { APP_CONFIG } from '@/config/app.config';
import { displayCombo } from '@/app/shortcuts';
import { useFormat } from '@/hooks/useFormat';
import { useT } from '@/i18n';
import { useAuthStore } from '@/stores/authStore';
import { useCatalogStore } from '@/stores/catalogStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useShiftStore } from '@/stores/shiftStore';
import { useUiStore } from '@/stores/uiStore';
import { cn } from '@/components/ui/cn';

/**
 * Bottom status bar: connection state (offline/local today — ready for
 * Online / Syncing / Synced / Sync error later), database health, counter,
 * cashier, shift, last backup and version (spec §79–80).
 */
export const StatusBar = memo(function StatusBar() {
  const t = useT();
  const format = useFormat();
  const user = useAuthStore((state) => state.user);
  const counter = useShiftStore((state) => state.counter);
  const shift = useShiftStore((state) => state.shift);
  const catalogStatus = useCatalogStore((state) => state.status);
  const lastBackupAt = useSettingsStore((state) => state.session.lastBackupAt);
  const language = useSettingsStore((state) => state.device.locale.language);
  const shortcut = useSettingsStore((state) => state.device.shortcuts.showShortcuts);
  const setShortcutsOpen = useUiStore((state) => state.setShortcutsOpen);
  const healthy = catalogStatus !== 'error';

  const item = 'flex items-center gap-1.5 whitespace-nowrap';
  return (
    <footer className="flex h-statusbar shrink-0 items-center gap-4 overflow-hidden border-t border-border bg-bg-subtle px-4 text-[0.72rem] text-fg-subtle">
      <span className={item} title={t('enums.syncStatus.local')}>
        <WifiOff size={13} aria-hidden />
        {t('shell.statusbar.offline')}
      </span>
      <span className={cn(item, healthy ? 'text-success-text' : 'text-danger-text')}>
        <Database size={13} aria-hidden />
        {healthy ? t('shell.statusbar.database') : t('shell.statusbar.databaseError')}
      </span>
      {counter && <span className={item}>{language === 'bn' ? counter.name.bn : counter.name.en}</span>}
      {user && (
        <span className={item}>
          <User size={13} aria-hidden />
          {language === 'bn' ? user.name.bn : user.name.en}
        </span>
      )}
      <span className={cn(item, shift ? 'text-success-text' : '')}>
        <span aria-hidden className={cn('h-1.5 w-1.5 rounded-full', shift ? 'bg-success' : 'bg-fg-subtle')} />
        {shift ? `${t('shell.topbar.shiftOpen')} · #${shift.shiftNo}` : t('shell.topbar.noShift')}
      </span>
      <span className={cn(item, 'hidden lg:flex')}>
        <HardDriveDownload size={13} aria-hidden />
        {lastBackupAt ? t('shell.statusbar.lastBackup', { time: format.relative(lastBackupAt) }) : t('shell.statusbar.neverBackedUp')}
      </span>
      <span className="ms-auto flex items-center gap-4">
        <button type="button" onClick={() => setShortcutsOpen(true)} className={cn(item, 'rounded-sm hover:text-fg')}>
          <Keyboard size={13} aria-hidden />
          {t('shell.statusbar.shortcuts')} ({displayCombo(shortcut)})
        </button>
        <span className="tnum">{t('shell.statusbar.version', { version: APP_CONFIG.version })}</span>
      </span>
    </footer>
  );
});
