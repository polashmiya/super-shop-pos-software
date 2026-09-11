import { Suspense, useEffect } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router';
import { APP_CONFIG } from '@/config/app.config';
import { NAV_ITEMS } from '@/app/navigation';
import { firesWhileTyping, GLOBAL_ACTIONS, matchShortcut } from '@/app/shortcuts';
import { refreshNotifications, refreshWorkspace } from '@/app/bootstrap';
import { isEditableTarget } from '@/hooks/useCommon';
import { useT } from '@/i18n';
import { getElectronAPI, hasElectronAPI } from '@/platform/electron';
import { useAuthStore } from '@/stores/authStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { toast, useUiStore } from '@/stores/uiStore';
import { CommandPalette } from '@/components/app/CommandPalette';
import { ApprovalHost, ConfirmHost } from '@/components/app/DialogHosts';
import { ErrorBoundary } from '@/components/app/ErrorBoundary';
import { LockScreen, NotificationsPanel, ShortcutsDialog } from '@/components/app/Overlays';
import { Toaster } from '@/components/app/Toaster';
import { LoadingState } from '@/components/ui/States';
import { PrintDialog } from '@/features/printing/PrintDialog';
import { Sidebar } from './Sidebar';
import { StatusBar } from './StatusBar';
import { Topbar } from './Topbar';

const NAV_BY_ACTION = new Map(NAV_ITEMS.filter((item) => item.shortcut).map((item) => [item.shortcut, item]));

/** Global keyboard shortcuts (navigation, refresh, full screen, search). */
function useGlobalShortcuts(): void {
  const navigate = useNavigate();
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const { shortcuts } = useSettingsStore.getState().device;
      const action = matchShortcut(event, shortcuts, GLOBAL_ACTIONS);
      if (!action) return;
      if (isEditableTarget(event.target) && !firesWhileTyping(shortcuts[action])) return;
      const auth = useAuthStore.getState();
      if (auth.locked) return;
      event.preventDefault();
      const ui = useUiStore.getState();
      switch (action) {
        case 'globalSearch':
          ui.setPaletteOpen(!ui.paletteOpen);
          break;
        case 'showShortcuts':
          ui.setShortcutsOpen(!ui.shortcutsOpen);
          break;
        case 'fullscreen':
          if (hasElectronAPI()) void getElectronAPI().app.toggleFullscreen();
          break;
        case 'refresh':
          void refreshWorkspace().then(() => toast.info('shell.refreshed'));
          break;
        default: {
          const item = NAV_BY_ACTION.get(action);
          if (item && (item.permission === null || auth.permissions.has(item.permission))) navigate(item.path);
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [navigate]);
}

/** App shell: sidebar, top bar, page outlet (with error boundary), status bar, overlays. */
export function AppShell() {
  const t = useT();
  const location = useLocation();
  const navigate = useNavigate();
  const sidebar = useSettingsStore((state) => state.device.appearance.sidebar);
  const focusMode = useSettingsStore((state) => state.device.appearance.focusMode);
  const updateDevice = useSettingsStore((state) => state.updateDevice);
  const onPos = location.pathname.startsWith('/pos');
  const effectiveSidebar = focusMode && onPos ? 'hidden' : sidebar;
  useGlobalShortcuts();

  // Periodic notification refresh (stock alerts, reminders).
  useEffect(() => {
    const timer = setInterval(() => void refreshNotifications(), APP_CONFIG.ui.notificationRefreshMs);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="flex h-full w-full overflow-hidden bg-bg" data-sidebar={effectiveSidebar}>
      {effectiveSidebar !== 'hidden' && <Sidebar compact={effectiveSidebar === 'compact'} />}
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar sidebarHidden={effectiveSidebar === 'hidden'} onToggleSidebar={() => updateDevice({ appearance: { sidebar: 'compact', focusMode: false } })} />
        <main id="main" className="relative min-h-0 flex-1 overflow-hidden">
          <ErrorBoundary key={location.pathname} onGoHome={() => navigate('/pos')}>
            <Suspense fallback={<LoadingState label={t('common.states.loading')} className="h-full" />}>
              <Outlet />
            </Suspense>
          </ErrorBoundary>
        </main>
        <StatusBar />
      </div>
      <CommandPalette />
      <NotificationsPanel />
      <ShortcutsDialog />
      <PrintDialog />
      <ConfirmHost />
      <ApprovalHost />
      <Toaster />
      <LockScreen />
    </div>
  );
}
