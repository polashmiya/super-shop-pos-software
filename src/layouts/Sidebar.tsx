import { NavLink } from 'react-router';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { NAV_ITEMS, type NavItem } from '@/app/navigation';
import { displayCombo } from '@/app/shortcuts';
import { useT } from '@/i18n';
import { useAuthStore } from '@/stores/authStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { cn } from '@/components/ui/cn';
import { Tooltip } from '@/components/ui/Tooltip';
import { StoreLogo } from '@/components/app/StoreLogo';

const GROUP_ORDER: NavItem['group'][] = ['selling', 'stock', 'people', 'money', 'insights', 'system'];

/** App sidebar: full (icon + label) or compact (icons with tooltips). */
export function Sidebar({ compact }: { compact: boolean }) {
  const t = useT();
  const permissions = useAuthStore((state) => state.permissions);
  const shortcuts = useSettingsStore((state) => state.device.shortcuts);
  const updateDevice = useSettingsStore((state) => state.updateDevice);
  const items = NAV_ITEMS.filter((item) => item.permission === null || permissions.has(item.permission));
  const grouped = GROUP_ORDER.map((group) => ({ group, items: items.filter((item) => item.group === group) })).filter((entry) => entry.items.length > 0);

  return (
    <nav
      aria-label={t('nav.pos')}
      className={cn('flex h-full shrink-0 flex-col border-e border-border bg-bg-subtle transition-[width] duration-200', compact ? 'w-sidebar-compact' : 'w-sidebar')}
    >
      <div className={cn('flex h-topbar shrink-0 items-center gap-2.5 border-b border-border', compact ? 'justify-center px-2' : 'px-4')}>
        <StoreLogo size={36} />
        {!compact && <AppTitle />}
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-2.5 py-3 scrollbar-none">
        {grouped.map(({ group, items: groupItems }) => (
          <div key={group} className="flex flex-col gap-1">
            {!compact && <p className="type-caption px-2.5 pb-0.5 font-semibold tracking-wide text-fg-subtle uppercase">{t(`nav.groups.${group}`)}</p>}
            {compact && group !== grouped[0].group && <div className="mx-3 mb-1 h-px bg-border" />}
            {groupItems.map((item) => {
              const Icon = item.icon;
              const link = (
                <NavLink
                  to={item.path}
                  className={({ isActive }) =>
                    cn(
                      'relative flex min-h-11 items-center gap-3 rounded-md font-medium transition-base',
                      compact ? 'justify-center px-0' : 'px-2.5',
                      isActive ? 'bg-primary-soft text-primary-soft-fg' : 'text-fg-muted hover:bg-surface-3 hover:text-fg',
                    )
                  }
                >
                  {({ isActive }) => (
                    <>
                      {isActive && <span aria-hidden className="absolute start-0 top-2 bottom-2 w-1 rounded-full bg-primary" />}
                      <Icon size={20} aria-hidden strokeWidth={isActive ? 2.3 : 1.9} />
                      {compact ? <span className="sr-only">{t(item.labelKey)}</span> : <span className="flex-1 truncate text-[0.92rem]">{t(item.labelKey)}</span>}
                      {!compact && item.shortcut && shortcuts[item.shortcut] && (
                        <kbd className="font-mono text-[0.68rem] text-fg-subtle">{displayCombo(shortcuts[item.shortcut])}</kbd>
                      )}
                    </>
                  )}
                </NavLink>
              );
              return compact ? (
                <Tooltip key={item.key} content={t(item.labelKey)} shortcut={item.shortcut ? displayCombo(shortcuts[item.shortcut]) : undefined} side="right">
                  {link}
                </Tooltip>
              ) : (
                <div key={item.key}>{link}</div>
              );
            })}
          </div>
        ))}
      </div>

      <div className={cn('shrink-0 border-t border-border p-2.5', compact && 'flex justify-center')}>
        <button
          type="button"
          onClick={() => updateDevice({ appearance: { sidebar: compact ? 'full' : 'compact' } })}
          aria-label={compact ? t('shell.topbar.expandSidebar') : t('shell.topbar.collapseSidebar')}
          className={cn('flex min-h-10 items-center gap-3 rounded-md text-fg-subtle transition-base hover:bg-surface-3 hover:text-fg', compact ? 'w-11 justify-center' : 'w-full px-2.5')}
        >
          {compact ? <PanelLeftOpen size={19} aria-hidden /> : <PanelLeftClose size={19} aria-hidden />}
          {!compact && <span className="text-sm">{t('shell.topbar.collapseSidebar')}</span>}
        </button>
      </div>
    </nav>
  );
}

function AppTitle() {
  const store = useSettingsStore((state) => state.business.store);
  const language = useSettingsStore((state) => state.device.locale.language);
  return (
    <div className="min-w-0 leading-tight">
      <p className="truncate text-[0.95rem] font-bold text-fg">{language === 'bn' ? store.nameBn : store.nameEn}</p>
      <p className="truncate text-[0.7rem] text-fg-subtle">Super Shop POS</p>
    </div>
  );
}
