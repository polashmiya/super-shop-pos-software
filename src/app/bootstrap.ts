import { APP_CONFIG } from '@/config/app.config';
import { detectDesktopAPI, getPlatformAPI, installPlatform, isDesktop, setStoragePersistent } from '@/platform';
import { createWebPlatform } from '@/platform/web';
import { setRepositories } from '@/repositories';
import { createIpcSqlClient, createLocalRepositories } from '@/repositories/local';
import type { DeviceStorage } from '@/repositories/types';
import { setServiceContext } from '@/services/context';
import { notificationService } from '@/services/notificationService';
import { useI18nStore } from '@/i18n';
import { useAuthStore } from '@/stores/authStore';
import { useCatalogStore } from '@/stores/catalogStore';
import { useNotificationStore } from '@/stores/notificationStore';
import { usePosStore } from '@/stores/posStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useShiftStore } from '@/stores/shiftStore';
import { repos } from '@/repositories';
import { purchaseService } from '@/services/purchaseService';
import { applyAppearance } from './applyAppearance';
import { installExitGuard } from './exitGuard';

/* ==========================================================================
   Application start-up:
   platform bridge (Electron preload, or the browser build) → repositories
   (local SQLite, over IPC or in the WASM worker) → service context → settings →
   appearance → catalogue → shift → notifications. Also keeps derived state
   in sync (appearance, native theme, POS draft persistence).
   ========================================================================== */

function deviceStorage(): DeviceStorage {
  const store = getPlatformAPI().store;
  return {
    get: async <T>(key: 'device' | 'session' | 'posDraft') => (await store.get(key)) as T | undefined,
    set: (key, value) => store.set(key, value as never),
    delete: (key) => store.delete(key),
  };
}

export function installLocalDataSource(): void {
  const api = getPlatformAPI();
  setRepositories(createLocalRepositories(createIpcSqlClient(api.database), deviceStorage()));
}

/**
 * Chooses the runtime: the Electron preload bridge when the app runs on the
 * desktop, otherwise the browser build, whose database has to be opened (and
 * on a first visit seeded) before anything can query it.
 */
async function installPlatformBridge(): Promise<void> {
  const desktop = detectDesktopAPI();
  if (desktop) {
    installPlatform(desktop, 'desktop');
    return;
  }
  const web = createWebPlatform();
  installPlatform(web.api, 'web');
  const opened = await web.start();
  setStoragePersistent(opened.persistent);
  if (!opened.persistent) {
    console.warn('This browser cannot store data: the shop will be lost when the page is closed.');
  }
}

export function wireServiceContext(): void {
  setServiceContext({
    user: () => useAuthStore.getState().user,
    can: (permission) => useAuthStore.getState().permissions.has(permission),
    business: () => useSettingsStore.getState().business,
    device: () => useSettingsStore.getState().device,
    language: () => useI18nStore.getState().language,
    now: () => new Date(),
  });
}

let subscriptionsInstalled = false;

function installSubscriptions(): void {
  if (subscriptionsInstalled) return;
  subscriptionsInstalled = true;

  // Appearance follows settings (and the OS theme when "System" is chosen).
  let lastTheme = '';
  const apply = () => {
    const { appearance } = useSettingsStore.getState().device;
    applyAppearance(appearance);
    if (appearance.theme !== lastTheme && isDesktop()) {
      lastTheme = appearance.theme;
      void getPlatformAPI().app.setNativeTheme(appearance.theme).catch(() => undefined);
    }
  };
  useSettingsStore.subscribe((state, previous) => {
    if (state.device.appearance !== previous.device.appearance) apply();
  });
  window.matchMedia?.('(prefers-color-scheme: light)').addEventListener('change', apply);
  apply();

  // The in-progress cart survives crashes and restarts.
  let draftTimer: ReturnType<typeof setTimeout> | null = null;
  const saveDraft = () => {
    draftTimer = null;
    const { draft } = usePosStore.getState();
    void repos()
      .settings.saveDraft(draft.lines.length > 0 ? draft : null)
      .catch((error: unknown) => console.error('Saving the cart draft failed', error));
  };
  usePosStore.subscribe((state, previous) => {
    if (state.draft === previous.draft) return;
    if (draftTimer) clearTimeout(draftTimer);
    draftTimer = setTimeout(saveDraft, APP_CONFIG.pos.draftSaveDebounceMs);
  });

  // Closing or reloading the window: write what is still waiting in a debounce.
  installExitGuard(() => {
    if (draftTimer) {
      clearTimeout(draftTimer);
      saveDraft();
    }
    void useSettingsStore
      .getState()
      .flush()
      .catch((error: unknown) => console.error('Saving device settings failed', error));
  });
}

/** Loads settings and applies appearance; safe before login. */
export async function bootstrapApp(): Promise<void> {
  await installPlatformBridge();
  installLocalDataSource();
  wireServiceContext();
  await useSettingsStore.getState().load();
  installSubscriptions();
}

/** Loads everything a signed-in user needs (catalogue, shift, draft, notifications). */
export async function loadWorkspace(): Promise<void> {
  const [draft] = await Promise.all([repos().settings.getDraft(), useCatalogStore.getState().load(), useShiftStore.getState().load()]);
  if (draft && draft.lines.length > 0 && usePosStore.getState().draft.lines.length === 0) {
    const customer = draft.customerId ? await repos().customers.getById(draft.customerId) : null;
    usePosStore.getState().loadDraft(draft, customer);
  }
  void refreshNotifications();
}

let lastNotificationSync = 0;

/** Re-derives stock/shift/backup notifications (throttled) and reloads the list. */
export async function refreshNotifications(force = false): Promise<void> {
  const now = Date.now();
  if (!force && now - lastNotificationSync < 20_000) {
    await useNotificationStore.getState().refresh();
    return;
  }
  lastNotificationSync = now;
  try {
    const catalog = useCatalogStore.getState();
    const shift = useShiftStore.getState().shift;
    const counts = await purchaseService.countByStatus().catch(() => null);
    const bestSellers = await repos()
      .reports.query('productSales', {
        period: 'last_30_days',
        from: new Date(now - 30 * 86_400_000).toISOString(),
        to: new Date(now + 60_000).toISOString(),
        branchId: 'all',
        counterId: 'all',
        cashierId: 'all',
        categoryId: 'all',
        brandId: 'all',
        paymentMethod: 'all',
        customerId: 'all',
        supplierId: 'all',
      }, { limit: 60 })
      .catch(() => []);
    await notificationService.sync({
      products: catalog.products,
      lastBackupAt: useSettingsStore.getState().session.lastBackupAt,
      openShift: shift ? { shiftNo: shift.shiftNo, openedAt: shift.openedAt } : null,
      pendingPurchases: counts ? counts.ordered + counts.partially_received : 0,
      bestSellers: bestSellers.map((row) => String(row.id)),
    });
  } catch (error) {
    console.error('Notification sync failed', error);
  }
  await useNotificationStore.getState().refresh();
}

/** F5: reload data from the database without reloading the window. */
export async function refreshWorkspace(): Promise<void> {
  await Promise.all([useCatalogStore.getState().load(), useShiftStore.getState().load(), useSettingsStore.getState().load()]);
  await refreshNotifications(true);
}
