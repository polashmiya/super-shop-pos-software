import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { _electron as electron, expect, type ElectronApplication, type Page } from '@playwright/test';

/* ==========================================================================
   Launch helpers for the end-to-end tests. Every app instance gets its own
   data folder (fresh demo shop) and prints to PDF files instead of a printer.
   ========================================================================== */

/** Playwright runs from the project root (see package.json "test:e2e"). */
export const PROJECT_ROOT = process.cwd();

export interface LaunchedApp {
  app: ElectronApplication;
  page: Page;
  dataDir: string;
  printDir: string;
  /** Uncaught errors from the renderer (should stay empty). */
  errors: string[];
}

export function freshDataDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ssp-e2e-'));
}

/**
 * The demo shop is generated "as of now": shifts open in the morning and
 * close at night. Pinning the generator's clock to today at noon keeps a
 * shift open on counter 03 whenever the suite runs (the app itself still
 * uses the real clock).
 */
function demoClock(): string {
  const noon = new Date();
  noon.setHours(12, 0, 0, 0);
  return noon.toISOString();
}

export async function launchApp(dataDir: string = freshDataDir()): Promise<LaunchedApp> {
  const printDir = path.join(dataDir, 'print');
  fs.mkdirSync(printDir, { recursive: true });
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) if (value !== undefined) env[key] = value;
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.VITE_DEV_SERVER_URL;
  Object.assign(env, { POS_USER_DATA_DIR: dataDir, POS_PRINT_TO_PDF_DIR: printDir, POS_NO_MAXIMIZE: '1', POS_FIXED_NOW: demoClock() });

  const app = await electron.launch({ args: ['.'], cwd: PROJECT_ROOT, env });
  const page = await app.firstWindow();
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await app.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0];
    window.setSize(1366, 768);
  });
  await page.waitForLoadState('domcontentloaded');
  return { app, page, dataDir, printDir, errors };
}

const USER_TILES = {
  rahim: /রহিম|Rahim/,
  nusrat: /নুসরাত|Nusrat/,
  karim: /করিম|Karim/,
} as const;

const PINS = { rahim: '1111', nusrat: '2222', karim: '3333' } as const;

/** Signs in from the login screen and lands on the first screen (skips the welcome tour). */
export async function login(page: Page, user: keyof typeof USER_TILES = 'karim'): Promise<void> {
  const pinField = page.locator('input[data-pin-input]');
  const tile = page.getByRole('button', { name: USER_TILES[user] }).first();
  // The sign-in screen opens on the last user's PIN pad, or on the staff list the first time.
  await expect(pinField.or(tile).first()).toBeVisible();
  if (!(await pinField.isVisible())) await tile.click();
  await expect(pinField).toBeAttached();
  await page.keyboard.type(PINS[user]);
  await page.keyboard.press('Enter');
  const welcome = page.getByRole('button', { name: /পসে যান|Go to POS/ });
  await Promise.race([welcome.waitFor({ timeout: 8_000 }).then(() => welcome.click()), page.waitForURL(/#\/(pos|dashboard)/, { timeout: 8_000 })]).catch(() => undefined);
  await page.waitForURL(/#\/(pos|dashboard)/);
}

/**
 * Makes sure the POS screen is showing. Playwright starts a fresh worker (and
 * a fresh app) after a failed test, so later tests sign in again if needed.
 */
export async function ensurePos(page: Page, user: keyof typeof USER_TILES = 'karim'): Promise<void> {
  const box = page.locator('input[data-pos-search="true"]');
  if (await box.isVisible().catch(() => false)) return;
  const signIn = page.locator('input[data-pin-input]').or(page.getByRole('button', { name: USER_TILES[user] }).first());
  if (await signIn.isVisible().catch(() => false)) await login(page, user);
  await goto(page, '#/pos');
  await expect(box).toBeVisible();
}

/** Runs a read-only query through the app's own SQL bridge. */
export async function sqlGet<T>(page: Page, sql: string, params: Array<string | number> = []): Promise<T> {
  return page.evaluate(({ sql, params }) => {
    if (!window.electronAPI) throw new Error('Not running in Electron');
    return window.electronAPI.database.get(sql, params);
  }, { sql, params }) as Promise<T>;
}

export async function goto(page: Page, hash: string): Promise<void> {
  await page.evaluate((target) => {
    window.location.hash = target;
  }, hash);
}

/** Types a code into the POS scan box and presses Enter, like a USB scanner. */
export async function scan(page: Page, code: string): Promise<void> {
  const box = page.locator('input[data-pos-search="true"]');
  await box.click();
  await box.fill(code);
  await box.press('Enter');
}

export const ERROR_BOUNDARY_TEXT = /কিছু একটা সমস্যা হয়েছে|Something went wrong/;
