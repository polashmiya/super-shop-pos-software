import { t } from '@/i18n';
import { getPlatformAPI, isDesktop } from '@/platform';
import { useAuthStore } from '@/stores/authStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { confirmAction } from '@/stores/uiStore';

/* ==========================================================================
   Leaving the app (closing the window or reloading it):
   - whatever is still waiting in a debounce (device settings, the cart
     draft) is written at once — the IPC message leaves before the page goes;
   - with Settings → General → "Ask before closing the app" on, a signed-in
     user confirms first. Electron cancels the close for any beforeunload
     return value without a native dialog, so the app shows its own.
   Restarts after a restore/reset use app.exit() and are never blocked.
   ========================================================================== */

let installed = false;

export function installExitGuard(flushPending: () => void): void {
  if (installed) return;
  installed = true;
  let confirmed = false;

  window.addEventListener('beforeunload', (event) => {
    flushPending();
    const askFirst = useSettingsStore.getState().device.general.confirmExit && useAuthStore.getState().user !== null;
    if (confirmed || !askFirst || !isDesktop()) return;
    event.preventDefault();
    event.returnValue = '';
    void confirmAction({ title: t('shell.exit.title'), message: t('shell.exit.message'), confirmLabel: t('shell.exit.confirm'), tone: 'danger' }).then((ok) => {
      if (!ok) return;
      confirmed = true;
      void getPlatformAPI().app.quit();
    });
  });
}
