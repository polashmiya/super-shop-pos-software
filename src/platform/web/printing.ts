import type { ElectronAPI } from '../../../electron/types/electron';
import type { PrintJobOptions, PrintResult } from '@/types/print';

/* ==========================================================================
   Printing in the browser.

   The desktop app prints silently to a named printer through the main
   process. A web page cannot do that — choosing the printer, the paper and
   the number of copies belongs to the browser's own print dialog. So the
   document is rendered into a hidden iframe sized to the right paper and
   handed to the browser; "Save as PDF" is a destination in that same dialog.

   The browser never reports whether the user printed or cancelled, so the
   result is optimistic. A print failure must never undo a completed sale,
   which is exactly how the rest of the app already treats this.
   ========================================================================== */

const PRINT_TIMEOUT_MS = 60_000;

/** Paper size for @page, so a receipt does not print on A4 with huge margins. */
function pageCss(options: Pick<PrintJobOptions, 'page' | 'paperWidth' | 'landscape'>): string {
  if (options.page === 'a4') return `@page { size: A4 ${options.landscape ? 'landscape' : 'portrait'}; margin: 10mm; }`;
  return `@page { size: ${options.paperWidth}mm auto; margin: 0; }`;
}

/**
 * Renders `html` in an offscreen iframe and opens the browser's print
 * dialog for it. The iframe is removed once printing finishes or the guard
 * timeout elapses, so a dismissed dialog cannot leak frames.
 */
export function printHtml(html: string, options: Pick<PrintJobOptions, 'page' | 'paperWidth' | 'landscape' | 'title'>): Promise<PrintResult> {
  return new Promise((resolve) => {
    const frame = document.createElement('iframe');
    frame.setAttribute('aria-hidden', 'true');
    frame.setAttribute('title', options.title);
    // Offscreen rather than display:none — a hidden frame may not lay out,
    // and the print engine needs a laid-out document.
    frame.style.cssText = 'position:fixed;right:0;bottom:0;width:1px;height:1px;opacity:0;border:0;';

    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const finish = (result: PrintResult) => {
      if (settled) return;
      settled = true;
      if (timer !== undefined) clearTimeout(timer);
      // Leave the frame long enough for the print job to be spooled.
      setTimeout(() => frame.remove(), 1000);
      resolve(result);
    };

    frame.addEventListener('load', () => {
      const view = frame.contentWindow;
      if (!view) return finish({ outcome: 'failed', failure: 'error', reason: 'no print frame' });
      try {
        view.addEventListener('afterprint', () => finish({ outcome: 'printed' }), { once: true });
        view.focus();
        view.print();
        // Browsers that never fire afterprint still resolve, via the timeout.
        timer = setTimeout(() => finish({ outcome: 'printed' }), PRINT_TIMEOUT_MS);
      } catch (error) {
        finish({ outcome: 'failed', failure: 'error', reason: error instanceof Error ? error.message : String(error) });
      }
    });

    frame.srcdoc = html.replace('</head>', `<style>${pageCss(options)}</style></head>`);
    document.body.append(frame);
  });
}

export function createWebPrinter(): ElectronAPI['printer'] {
  const print = (html: string, options: PrintJobOptions) => printHtml(html, options);
  return {
    printReceipt: print,
    printReport: print,
    printKOT: print,
    // The browser's print dialog offers "Save as PDF" as a destination, so
    // saving a PDF is the same action as printing one.
    savePdf: async (html, options) => {
      const result = await printHtml(html, { ...options, title: options.fileName });
      return result.outcome === 'failed' ? { ok: false, reason: 'failed' } : { ok: true, filePath: options.fileName };
    },
    // A web page cannot enumerate the machine's printers; the browser's own
    // dialog handles printer choice.
    getPrinters: () => Promise.resolve([]),
  };
}
