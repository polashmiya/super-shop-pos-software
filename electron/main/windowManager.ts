import fs from 'node:fs';
import path from 'node:path';
import { app, BrowserWindow, Menu, nativeTheme } from 'electron';
import { APP_CONFIG } from '@/config/app.config';
import type { ThemeMode } from '@/types/settings';
import { logger } from './logger';
import { DEV_SERVER_URL, PRELOAD_PATH, RENDERER_INDEX_PATH } from './paths';
import { setTrustedWebContents } from './security';

let mainWindow: BrowserWindow | null = null;

export function getMainWindow(): BrowserWindow | null {
  return mainWindow && !mainWindow.isDestroyed() ? mainWindow : null;
}

function resolveWindowIcon(): string | undefined {
  // Packaged builds take the icon from the executable; use build/icon.png in development.
  if (app.isPackaged) return undefined;
  const iconPath = path.join(app.getAppPath(), 'build', 'icon.png');
  return fs.existsSync(iconPath) ? iconPath : undefined;
}

function backgroundFor(theme: ThemeMode): string {
  const resolved = theme === 'system' ? (nativeTheme.shouldUseDarkColors ? 'dark' : 'light') : theme;
  return resolved === 'dark' ? APP_CONFIG.window.backgroundDark : APP_CONFIG.window.backgroundLight;
}

/**
 * Creates the secure main window. It stays hidden until the renderer is
 * ready, so the cashier never sees a blank or unstyled frame.
 */
export function createMainWindow(theme: ThemeMode): BrowserWindow {
  const window = new BrowserWindow({
    width: APP_CONFIG.window.width,
    height: APP_CONFIG.window.height,
    minWidth: APP_CONFIG.window.minWidth,
    minHeight: APP_CONFIG.window.minHeight,
    show: false,
    title: APP_CONFIG.name,
    backgroundColor: backgroundFor(theme),
    autoHideMenuBar: true,
    icon: resolveWindowIcon(),
    webPreferences: {
      preload: PRELOAD_PATH,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      webviewTag: false,
      spellcheck: false,
      navigateOnDragDrop: false,
      devTools: !app.isPackaged,
    },
  });

  mainWindow = window;
  setTrustedWebContents(window.webContents);

  window.once('ready-to-show', () => {
    if (!process.env.POS_NO_MAXIMIZE) window.maximize();
    window.show();
  });

  window.on('closed', () => {
    if (mainWindow === window) mainWindow = null;
  });

  // Touch screens: prevent accidental pinch-zoom of the POS.
  void window.webContents.setVisualZoomLevelLimits(1, 1);

  window.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    // Developer tools only in unpackaged builds.
    if (!app.isPackaged && input.key === 'F12') {
      window.webContents.toggleDevTools();
      event.preventDefault();
    }
    // F5 is the app's own "refresh data" shortcut, never a page reload.
    if ((input.key === 'F5' || (input.key.toLowerCase() === 'r' && (input.control || input.meta))) && app.isPackaged) {
      event.preventDefault();
    }
  });

  // A crashed renderer is reloaded; all data is already persisted.
  window.webContents.on('render-process-gone', (_event, details) => {
    logger.error(`Renderer process gone: ${details.reason} (exit code ${details.exitCode})`);
    if (details.reason !== 'clean-exit' && !window.isDestroyed()) {
      void loadRenderer(window);
    }
  });

  window.webContents.on('preload-error', (_event, preloadPath, error) => {
    logger.error(`Preload failed: ${preloadPath}`, error);
  });

  return window;
}

export async function loadRenderer(window: BrowserWindow): Promise<void> {
  if (DEV_SERVER_URL) {
    await window.loadURL(DEV_SERVER_URL);
  } else {
    await window.loadFile(RENDERER_INDEX_PATH);
  }
}

/** Keeps the title bar, native dialogs and window background in the app theme. */
export function applyNativeTheme(theme: ThemeMode): void {
  nativeTheme.themeSource = theme;
  getMainWindow()?.setBackgroundColor(backgroundFor(theme));
}

export function toggleFullscreen(): boolean {
  const window = getMainWindow();
  if (!window) return false;
  const next = !window.isFullScreen();
  window.setFullScreen(next);
  return next;
}

export function focusMainWindow(): void {
  const window = getMainWindow();
  if (!window) return;
  if (window.isMinimized()) window.restore();
  window.show();
  window.focus();
}

/**
 * No application menu on Windows/Linux (prevents reload/devtools shortcuts in
 * production). macOS needs the standard app and Edit menus for Cmd+Q and
 * copy/paste inside text fields.
 */
export function setupApplicationMenu(): void {
  if (process.platform === 'darwin') {
    Menu.setApplicationMenu(Menu.buildFromTemplate([{ role: 'appMenu' }, { role: 'editMenu' }, { role: 'windowMenu' }]));
  } else {
    Menu.setApplicationMenu(null);
  }
}
