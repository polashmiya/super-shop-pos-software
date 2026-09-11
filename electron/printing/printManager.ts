import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { app, BrowserWindow, dialog } from 'electron';
import { APP_CONFIG } from '@/config/app.config';
import type { ExportResult, PrinterInfo, PrintJobOptions, PrintResult, SavePdfOptions } from '@/types/print';
import type { PaperWidth } from '@/types/settings';
import { logger } from '../main/logger';
import { PRINT_TO_PDF_DIR } from '../main/paths';
import { getMainWindow } from '../main/windowManager';
import { safeFileName, writeFileAtomic } from '../main/files';

/* ==========================================================================
   Printing in the main process.

   - Documents arrive as complete, self-contained HTML (inline CSS, fonts as
     data: URIs) rendered by the React renderer — the preview the cashier saw
     is exactly what prints.
   - Jobs print SILENTLY from a hidden, sandboxed window with scripts
     disabled. Receipts use a page as wide as the roll and as tall as the
     content; reports use A4. Printer, copies and preview are chosen in the
     app's own print dialog (the OS dialog cannot preview hidden windows).
   - Every job settles (printed or failed with a reason, including timeout),
     so the POS never waits forever and a sale is never lost to a printer.
   ========================================================================== */

const MM_PER_CSS_PIXEL = 25.4 / 96;
const TEAR_OFF_MARGIN_MM = 8;

let lastPdfDirectory: string | null = null;

function printDirectory(): string {
  return path.join(app.getPath('temp'), 'super-shop-pos-print');
}

function assertPrintableHtml(html: unknown): asserts html is string {
  if (typeof html !== 'string' || html.length === 0) throw new Error('Print document is empty');
  if (Buffer.byteLength(html, 'utf-8') > APP_CONFIG.print.maxHtmlBytes) throw new Error('Print document is too large');
}

function injectIntoHead(html: string, markup: string): string {
  return /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, (head) => `${head}${markup}`) : `${markup}${html}`;
}

/** Print jobs run with scripts disabled by CSP; only inline styles/fonts/images. */
function withPrintPolicy(html: string): string {
  const csp = "default-src 'none'; style-src 'unsafe-inline'; font-src data:; img-src data:; script-src 'none'";
  return injectIntoHead(html, `<meta http-equiv="Content-Security-Policy" content="${csp}">`);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function writeTempDocument(html: string): Promise<string> {
  const directory = printDirectory();
  await fs.promises.mkdir(directory, { recursive: true });
  const filePath = path.join(directory, `${randomUUID()}.html`);
  await fs.promises.writeFile(filePath, html, 'utf-8');
  return filePath;
}

function removeTempDocument(filePath: string): void {
  fs.promises.rm(filePath, { force: true }).catch(() => undefined);
}

function pageWidthMm(options: { page: PrintJobOptions['page']; paperWidth: PaperWidth; landscape?: boolean }): number {
  if (options.page === 'a4') return options.landscape ? APP_CONFIG.print.a4.heightMm : APP_CONFIG.print.a4.widthMm;
  return APP_CONFIG.print.paper[options.paperWidth].paperMm;
}

async function withDocumentWindow<T>(html: string, widthMm: number, title: string, job: (window: BrowserWindow) => Promise<T>): Promise<T> {
  const filePath = await writeTempDocument(withPrintPolicy(html));
  const window = new BrowserWindow({
    show: false,
    title,
    width: Math.round(widthMm / MM_PER_CSS_PIXEL),
    height: 1200,
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      javascript: false,
      devTools: false,
    },
  });
  try {
    await window.loadFile(filePath);
    return await job(window);
  } finally {
    if (!window.isDestroyed()) window.destroy();
    removeTempDocument(filePath);
  }
}

/** Height of the content so the roll is cut right after the last line. */
async function measureContentHeightMm(window: BrowserWindow): Promise<number> {
  let heightPx: number;
  try {
    const size = await window.webContents.executeJavaScript('document.body ? Math.ceil(Math.max(document.body.getBoundingClientRect().height, document.body.scrollHeight)) : 0', true);
    heightPx = typeof size === 'number' ? size : 0;
  } catch {
    heightPx = 0;
  }
  const safePx = Number.isFinite(heightPx) && heightPx > 0 ? heightPx : 900;
  return Math.ceil(safePx * MM_PER_CSS_PIXEL) + TEAR_OFF_MARGIN_MM;
}

async function renderPdf(html: string, options: { page: PrintJobOptions['page']; paperWidth: PaperWidth; landscape?: boolean }, title: string): Promise<Buffer> {
  const widthMm = pageWidthMm(options);
  return withDocumentWindow(html, widthMm, title, async (window) => {
    if (options.page === 'a4') {
      return window.webContents.printToPDF({
        printBackground: true,
        landscape: Boolean(options.landscape),
        pageSize: 'A4',
        margins: { top: 0.4, bottom: 0.4, left: 0.4, right: 0.4 },
      });
    }
    const heightMm = await measureContentHeightMm(window);
    return window.webContents.printToPDF({
      printBackground: true,
      margins: { top: 0, bottom: 0, left: 0, right: 0 },
      pageSize: { width: widthMm / 25.4, height: heightMm / 25.4 },
    });
  });
}

export async function getPrinters(): Promise<PrinterInfo[]> {
  const window = getMainWindow();
  if (!window) return [];
  try {
    const printers = await window.webContents.getPrintersAsync();
    return printers.map((printer) => ({
      name: printer.name,
      displayName: printer.displayName || printer.name,
      description: printer.description ?? '',
      isDefault: Boolean((printer as { isDefault?: boolean }).isDefault),
    }));
  } catch (error) {
    logger.warn('Could not list printers', error);
    return [];
  }
}

async function saveJobToTestFolder(kind: string, html: string, options: PrintJobOptions): Promise<PrintResult> {
  const directory = PRINT_TO_PDF_DIR as string;
  const pdf = await renderPdf(html, options, options.title);
  await fs.promises.mkdir(directory, { recursive: true });
  const target = path.join(directory, `${kind}-${Date.now()}-${randomUUID().slice(0, 8)}.pdf`);
  await fs.promises.writeFile(target, pdf);
  logger.info(`Print job saved as PDF: ${target}`);
  return { outcome: 'saved-pdf', reason: target };
}

function printSilently(window: BrowserWindow, options: PrintJobOptions, heightMm: number | null): Promise<PrintResult> {
  return new Promise((resolve) => {
    const timer = setTimeout(
      () => resolve({ outcome: 'failed', failure: 'timeout', reason: `no answer from the printer after ${APP_CONFIG.print.jobTimeoutMs} ms` }),
      APP_CONFIG.print.jobTimeoutMs,
    );
    const copies = Math.min(Math.max(Math.trunc(options.copies) || 1, 1), 5);
    window.webContents.print(
      {
        silent: true,
        printBackground: true,
        deviceName: options.printerName || undefined,
        copies,
        landscape: Boolean(options.landscape),
        margins: options.page === 'a4' ? { marginType: 'default' } : { marginType: 'none' },
        pageSize:
          options.page === 'a4' || heightMm === null
            ? 'A4'
            : { width: APP_CONFIG.print.paper[options.paperWidth].paperMm * 1000, height: Math.max(heightMm, 60) * 1000 },
      },
      (success, failureReason) => {
        clearTimeout(timer);
        if (success) resolve({ outcome: 'printed' });
        else if (/cancel/i.test(failureReason)) resolve({ outcome: 'cancelled', reason: failureReason });
        else resolve({ outcome: 'failed', failure: 'error', reason: failureReason || 'unknown print failure' });
      },
    );
  });
}

/**
 * Prints a document to the chosen printer (empty name = system default).
 * Never throws for printer problems: it reports what happened.
 */
export async function printDocument(kind: 'receipt' | 'report' | 'kot', html: string, options: PrintJobOptions): Promise<PrintResult> {
  assertPrintableHtml(html);
  if (PRINT_TO_PDF_DIR) return saveJobToTestFolder(kind, html, options);

  const printers = await getPrinters();
  if (printers.length === 0) {
    logger.warn(`${kind} not printed: no printers installed`);
    return { outcome: 'failed', failure: 'no-printer', reason: 'no printers installed' };
  }
  if (options.printerName && !printers.some((printer) => printer.name === options.printerName)) {
    logger.warn(`${kind} not printed: printer "${options.printerName}" not found`);
    return { outcome: 'failed', failure: 'printer-not-found', reason: `printer "${options.printerName}" not found` };
  }

  try {
    const result = await withDocumentWindow(html, pageWidthMm(options), options.title, async (window) =>
      printSilently(window, options, options.page === 'a4' ? null : await measureContentHeightMm(window)),
    );
    if (result.outcome === 'printed') logger.info(`${kind} printed on ${options.printerName || 'the default printer'}`);
    else logger.warn(`${kind} not printed: ${result.reason ?? 'unknown'}`);
    return result;
  } catch (error) {
    logger.error(`${kind} print error`, error);
    return { outcome: 'failed', failure: 'error', reason: errorMessage(error) };
  }
}

async function choosePdfTarget(fileName: string): Promise<string | null> {
  if (PRINT_TO_PDF_DIR) {
    await fs.promises.mkdir(PRINT_TO_PDF_DIR, { recursive: true });
    return path.join(PRINT_TO_PDF_DIR, `saved-${randomUUID().slice(0, 8)}-${fileName}`);
  }
  const window = getMainWindow();
  const options = {
    defaultPath: path.join(lastPdfDirectory ?? app.getPath('documents'), fileName),
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
  };
  const result = window ? await dialog.showSaveDialog(window, options) : await dialog.showSaveDialog(options);
  return result.canceled || !result.filePath ? null : result.filePath;
}

/** "Save as PDF": asks where to save, then writes the document as a PDF file. */
export async function savePdf(html: string, options: SavePdfOptions): Promise<ExportResult> {
  assertPrintableHtml(html);
  const fileName = safeFileName(options.fileName, 'pdf', 'document');
  const target = await choosePdfTarget(fileName);
  if (!target) return { ok: false, reason: 'cancelled' };
  try {
    await writeFileAtomic(target, await renderPdf(html, options, fileName));
    lastPdfDirectory = path.dirname(target);
    logger.info(`PDF saved: ${target}`);
    return { ok: true, filePath: target };
  } catch (error) {
    logger.error('PDF could not be saved', error);
    return { ok: false, reason: 'failed' };
  }
}

/** Removes print temp files left behind by a previous crash. */
export function cleanupPrintTempFiles(): void {
  fs.promises.rm(printDirectory(), { recursive: true, force: true }).catch(() => undefined);
}
