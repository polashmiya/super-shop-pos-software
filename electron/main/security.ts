import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { app, session, shell, type IpcMainInvokeEvent, type WebContents } from 'electron';
import { logger } from './logger';
import { DEV_SERVER_URL, RENDERER_INDEX_PATH } from './paths';

/** CSP header applied to dev-server responses (production uses a meta tag). */
const DEV_CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self' ws://localhost:* http://localhost:*",
  "object-src 'none'",
  "base-uri 'none'",
].join('; ');

function normalizePath(filePath: string): string {
  const normalized = path.normalize(filePath);
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
}

function sameHost(url: string, reference: string): boolean {
  try {
    const target = new URL(url);
    const expected = new URL(reference);
    return target.hostname === expected.hostname && target.port === expected.port;
  } catch {
    return false;
  }
}

/** True for the application's own renderer page (dev server or bundled file). */
export function isAppUrl(url: string): boolean {
  if (DEV_SERVER_URL) return sameHost(url, DEV_SERVER_URL) && url.startsWith('http');
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'file:') return false;
    return normalizePath(fileURLToPath(parsed)) === normalizePath(RENDERER_INDEX_PATH);
  } catch {
    return false;
  }
}

/** Requests the app may make: local files/data only, plus the dev server. */
function isAllowedRequest(url: string): boolean {
  if (/^(file|data|blob|devtools|chrome-extension):/i.test(url)) return true;
  if (DEV_SERVER_URL && /^(https?|wss?):/i.test(url) && sameHost(url, DEV_SERVER_URL)) return true;
  return false;
}

let trustedWebContents: WebContents | null = null;

/** Registers the main window's WebContents as the only IPC sender allowed. */
export function setTrustedWebContents(contents: WebContents): void {
  trustedWebContents = contents;
}

/** Rejects IPC calls that do not come from the application's own page. */
export function assertTrustedSender(event: IpcMainInvokeEvent): void {
  const frameUrl = event.senderFrame?.url ?? '';
  if (!trustedWebContents || event.sender !== trustedWebContents || !isAppUrl(frameUrl)) {
    throw new Error(`Blocked IPC from untrusted sender: ${frameUrl || 'unknown'}`);
  }
}

/**
 * Session-wide protections:
 * - deny every permission request (camera, geolocation, notifications…)
 * - block all network requests to remote hosts (offline-only application)
 * - apply a CSP header to dev-server responses
 */
export function hardenSession(): void {
  const defaultSession = session.defaultSession;

  defaultSession.setPermissionRequestHandler((_contents, permission, callback) => callback(permission === 'fullscreen'));
  defaultSession.setPermissionCheckHandler((_contents, permission) => permission === 'fullscreen');

  defaultSession.webRequest.onBeforeRequest((details, callback) => {
    if (isAllowedRequest(details.url)) {
      callback({});
      return;
    }
    logger.warn(`Blocked remote request: ${details.url}`);
    callback({ cancel: true });
  });

  if (DEV_SERVER_URL) {
    const devServer = DEV_SERVER_URL;
    defaultSession.webRequest.onHeadersReceived((details, callback) => {
      if (!sameHost(details.url, devServer)) {
        callback({ responseHeaders: details.responseHeaders });
        return;
      }
      callback({
        responseHeaders: { ...details.responseHeaders, 'Content-Security-Policy': [DEV_CSP] },
      });
    });
  }
}

/**
 * Hardens every WebContents the app creates (main window and print windows):
 * no popups, no navigation away from the app, no <webview>.
 */
export function hardenWebContentsCreation(): void {
  app.on('web-contents-created', (_event, contents) => {
    contents.setWindowOpenHandler(({ url }) => {
      logger.warn(`Blocked window.open: ${url}`);
      return { action: 'deny' };
    });

    contents.on('will-navigate', (event, url) => {
      if (url === contents.getURL()) return;
      if (isAppUrl(url) && contents === trustedWebContents) return;
      event.preventDefault();
      // "mailto:" links (Settings → About → Developer) open the user's mail app; nothing else leaves the window.
      if (url.startsWith('mailto:') && contents === trustedWebContents) {
        void shell.openExternal(url).catch((error: unknown) => logger.warn(`Could not open mail client: ${String(error)}`));
        return;
      }
      logger.warn(`Blocked navigation: ${url}`);
    });

    contents.on('will-redirect', (event, url) => {
      if (isAllowedRequest(url)) return;
      event.preventDefault();
      logger.warn(`Blocked redirect: ${url}`);
    });

    contents.on('will-attach-webview', (event) => {
      event.preventDefault();
      logger.warn('Blocked <webview> attachment');
    });
  });
}
