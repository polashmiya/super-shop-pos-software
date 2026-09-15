import { memo } from 'react';
import { useNavigate } from 'react-router';
import { Bell, Keyboard, Languages, Lock, LogOut, Maximize, Menu, Monitor, Moon, Search, Sun, Target, UserRound } from 'lucide-react';
import { displayCombo } from '@/app/shortcuts';
import { useNow } from '@/hooks/useCommon';
import { useFormat } from '@/hooks/useFormat';
import { useT } from '@/i18n';
import { getPlatformAPI, hasPlatform } from '@/platform';
import { useAuthStore } from '@/stores/authStore';
import { useNotificationStore } from '@/stores/notificationStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useShiftStore } from '@/stores/shiftStore';
import { useUiStore } from '@/stores/uiStore';
import type { ThemeMode } from '@/types';
import { cn } from '@/components/ui/cn';
import { Avatar, Kbd } from '@/components/ui/Display';
import { IconButton } from '@/components/ui/IconButton';
import { DropdownMenu } from '@/components/ui/Menu';

const NEXT_THEME: Record<ThemeMode, ThemeMode> = { dark: 'light', light: 'system', system: 'dark' };
const THEME_ICON = { dark: Moon, light: Sun, system: Monitor };

const Clock = memo(function Clock() {
  const now = useNow(1_000);
  const format = useFormat();
  return (
    <div className="hidden flex-col items-end leading-tight xl:flex" aria-live="off">
      <span className="text-sm font-semibold text-fg tnum">{format.time(now, true)}</span>
      <span className="text-[0.7rem] text-fg-subtle">{format.date(now, 'long')}</span>
    </div>
  );
});

function CounterStatus() {
  const t = useT();
  const counter = useShiftStore((state) => state.counter);
  const shift = useShiftStore((state) => state.shift);
  const language = useSettingsStore((state) => state.device.locale.language);
  const navigate = useNavigate();
  return (
    <button
      type="button"
      onClick={() => navigate('/shift')}
      className="flex min-h-11 items-center gap-2.5 rounded-lg border border-border bg-surface px-3 text-start transition-base hover:border-border-strong"
    >
      <span aria-hidden className={cn('h-2.5 w-2.5 rounded-full', shift ? 'bg-success shadow-[0_0_0_3px_var(--c-success-soft)]' : 'bg-fg-subtle')} />
      <span className="flex flex-col leading-tight">
        <span className="text-[0.82rem] font-semibold text-fg">{counter ? (language === 'bn' ? counter.name.bn : counter.name.en) : t('shell.topbar.counter')}</span>
        <span className="text-[0.7rem] text-fg-subtle tnum">{shift ? `#${shift.shiftNo}` : t('shell.topbar.noShift')}</span>
      </span>
    </button>
  );
}

export function Topbar({ onToggleSidebar, sidebarHidden }: { onToggleSidebar: () => void; sidebarHidden: boolean }) {
  const t = useT();
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const lock = useAuthStore((state) => state.lock);
  const unread = useNotificationStore((state) => state.unread);
  const setPaletteOpen = useUiStore((state) => state.setPaletteOpen);
  const setNotificationsOpen = useUiStore((state) => state.setNotificationsOpen);
  const setShortcutsOpen = useUiStore((state) => state.setShortcutsOpen);
  const theme = useSettingsStore((state) => state.device.appearance.theme);
  const focusMode = useSettingsStore((state) => state.device.appearance.focusMode);
  const language = useSettingsStore((state) => state.device.locale.language);
  const shortcuts = useSettingsStore((state) => state.device.shortcuts);
  const updateDevice = useSettingsStore((state) => state.updateDevice);
  const ThemeIcon = THEME_ICON[theme];

  return (
    <header className="flex h-topbar shrink-0 items-center gap-3 border-b border-border bg-bg-subtle px-4">
      {sidebarHidden && <IconButton icon={Menu} label={t('shell.topbar.expandSidebar')} onClick={onToggleSidebar} />}

      <button
        type="button"
        onClick={() => setPaletteOpen(true)}
        className="flex h-11 min-w-0 flex-1 items-center gap-3 rounded-lg border border-border bg-surface px-3.5 text-start text-fg-subtle transition-base hover:border-border-strong md:max-w-md"
      >
        <Search size={18} aria-hidden />
        <span className="flex-1 truncate text-sm">{t('shell.topbar.search')}</span>
        <Kbd>{displayCombo(shortcuts.globalSearch)}</Kbd>
      </button>

      <div className="ms-auto flex items-center gap-1.5">
        <CounterStatus />
        <div className="mx-2 hidden h-8 w-px bg-border xl:block" />
        <Clock />
        <div className="mx-2 hidden h-8 w-px bg-border xl:block" />
        <button
          type="button"
          onClick={() => updateDevice({ locale: { language: language === 'bn' ? 'en' : 'bn' } })}
          aria-label={t('shell.topbar.switchLanguage')}
          title={t('shell.topbar.switchLanguage')}
          className="flex h-touch items-center gap-1.5 rounded-md px-2.5 text-sm font-semibold text-fg-muted transition-base hover:bg-surface-3 hover:text-fg"
        >
          <Languages size={18} aria-hidden />
          {language === 'bn' ? 'EN' : 'বাং'}
        </button>
        <IconButton icon={ThemeIcon} label={`${t('shell.topbar.toggleTheme')} (${t(`enums.theme.${theme}`)})`} onClick={() => updateDevice({ appearance: { theme: NEXT_THEME[theme] } })} />
        <IconButton
          icon={Target}
          label={focusMode ? t('shell.topbar.focusModeOn') : t('shell.topbar.focusModeOff')}
          variant={focusMode ? 'soft' : 'ghost'}
          aria-pressed={focusMode}
          onClick={() => updateDevice({ appearance: { focusMode: !focusMode } })}
        />
        {hasPlatform() && <IconButton icon={Maximize} label={t('shell.topbar.fullscreen')} shortcut={displayCombo(shortcuts.fullscreen)} onClick={() => void getPlatformAPI().app.toggleFullscreen()} />}
        <IconButton icon={Bell} label={t('shell.topbar.notifications')} badge={unread > 0 ? (unread > 9 ? '9+' : unread) : null} onClick={() => setNotificationsOpen(true)} />

        {user && (
          <DropdownMenu
            width={260}
            header={
              <div className="flex items-center gap-3 border-b border-border px-3 pt-2 pb-3">
                <Avatar name={user.name.en} color={user.avatarColor} size={40} />
                <div className="min-w-0">
                  <p className="truncate font-semibold text-fg">{language === 'bn' ? user.name.bn : user.name.en}</p>
                  <p className="type-caption text-fg-subtle">{t(`enums.role.${user.roleId}`)}</p>
                </div>
              </div>
            }
            items={[
              { key: 'profile', label: t('nav.profile'), icon: UserRound, onSelect: () => navigate('/profile') },
              { key: 'shortcuts', label: t('shell.shortcuts.title'), icon: Keyboard, hint: displayCombo(shortcuts.showShortcuts), onSelect: () => setShortcutsOpen(true) },
              'separator',
              { key: 'lock', label: t('shell.topbar.lock'), icon: Lock, onSelect: lock },
              { key: 'logout', label: t('shell.topbar.logout'), icon: LogOut, danger: true, onSelect: () => void logout().then(() => navigate('/login')) },
            ]}
            trigger={(props) => (
              <button
                type="button"
                {...props}
                className="ms-1 flex h-touch items-center gap-2.5 rounded-lg ps-1 pe-2.5 transition-base hover:bg-surface-3"
                aria-label={t('shell.topbar.profile')}
              >
                <Avatar name={user.name.en} color={user.avatarColor} size={34} />
                <span className="hidden flex-col text-start leading-tight 2xl:flex">
                  <span className="max-w-32 truncate text-[0.84rem] font-semibold text-fg">{language === 'bn' ? user.name.bn : user.name.en}</span>
                  <span className="text-[0.7rem] text-fg-subtle">{t(`enums.role.${user.roleId}`)}</span>
                </span>
              </button>
            )}
          />
        )}
      </div>
    </header>
  );
}
