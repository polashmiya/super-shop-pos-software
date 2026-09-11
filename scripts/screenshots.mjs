// Screenshots of the built app for a visual check — every route in one language,
// theme and window size, signed in as the demo admin. Run `npm run build` first.
//
//   npm run shots                                   # bn-dark, 1366x768, the default routes
//   npm run shots -- en-light 1280x720              # language-theme and size
//   npm run shots -- bn-dark 1366x768 "#/pos,#/reports" counter
//
// Arguments: [bn|en]-[dark|light]  [WIDTHxHEIGHT]  [comma-separated routes]  [grid|counter]
// Output: screenshots/<mode>-<width>-<route>.png (the folder is git-ignored).
// Uses a temporary data folder with fresh demo data, so nothing you own is touched.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from '@playwright/test';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'screenshots');
const DEFAULT_ROUTES = ['#/pos', '#/dashboard', '#/sales', '#/products', '#/inventory', '#/customers', '#/reports', '#/shift', '#/settings'];

const [mode = 'bn-dark', size = '1366x768', routeList = '', layout = 'grid'] = process.argv.slice(2);
const [width, height] = size.split('x').map(Number);
const routes = routeList ? routeList.split(',').map((route) => route.trim()).filter(Boolean) : DEFAULT_ROUTES;

function demoClock() {
  const noon = new Date();
  noon.setHours(12, 0, 0, 0);
  return noon.toISOString();
}

async function signIn(page) {
  const pin = page.locator('input[data-pin-input]');
  const tile = page.getByRole('button', { name: /রহিম|Rahim/ }).first();
  await pin.or(tile).first().waitFor();
  if (!(await pin.isVisible())) await tile.click();
  await page.keyboard.type('1111');
  await page.keyboard.press('Enter');
  const welcome = page.getByRole('button', { name: /পিওএস-এ যান|Go to POS/ });
  await Promise.race([welcome.waitFor({ timeout: 8_000 }).then(() => welcome.click()), page.waitForURL(/#\/(pos|dashboard)/, { timeout: 8_000 })]).catch(() => undefined);
  await page.waitForURL(/#\/(pos|dashboard)/);
}

async function main() {
  if (!fs.existsSync(path.join(ROOT, 'dist', 'index.html'))) throw new Error('No build found — run `npm run build` first.');
  fs.mkdirSync(OUT, { recursive: true });
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ssp-shots-'));
  const env = { ...process.env, POS_USER_DATA_DIR: dataDir, POS_PRINT_TO_PDF_DIR: path.join(dataDir, 'print'), POS_NO_MAXIMIZE: '1', POS_FIXED_NOW: demoClock() };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.VITE_DEV_SERVER_URL;

  const app = await electron.launch({ args: ['.'], cwd: ROOT, env });
  const page = await app.firstWindow();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });
  await app.evaluate(({ BrowserWindow }, bounds) => BrowserWindow.getAllWindows()[0].setSize(bounds.width, bounds.height), { width, height });
  await page.waitForLoadState('domcontentloaded');
  await signIn(page);

  if (mode.startsWith('en')) await page.getByRole('button', { name: /ভাষা পরিবর্তন|Switch language/ }).first().click();
  if (mode.endsWith('light')) {
    const html = page.locator('html');
    while (/\bdark\b/.test((await html.getAttribute('class')) ?? '')) {
      await page.getByRole('button', { name: /থিম পরিবর্তন|Switch theme/ }).first().click();
      await page.waitForTimeout(150);
    }
  }
  if (layout === 'counter') {
    await page.evaluate(() => {
      window.location.hash = '#/settings/pos';
    });
    await page.getByRole('button', { name: /শুধু স্ক্যান কাউন্টার|Scan-only counter/ }).click();
  }

  for (const route of routes) {
    await page.evaluate((target) => {
      window.location.hash = target;
    }, route);
    await page.waitForTimeout(1_500);
    const file = `${mode}-${width}-${route.replace(/[#/?=&]+/g, '_').replace(/^_+/, '') || 'home'}.png`;
    await page.screenshot({ path: path.join(OUT, file) });
    console.log('saved', path.relative(ROOT, path.join(OUT, file)));
  }
  console.log(errors.length === 0 ? 'no renderer errors' : `renderer errors:\n${errors.join('\n')}`);
  await app.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
  if (errors.length > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
