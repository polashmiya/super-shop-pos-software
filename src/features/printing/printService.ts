import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { toLocalDate } from '@/domain/dates';
import { t } from '@/i18n';
import { getPlatformAPI, hasPlatform } from '@/platform';
import { repos } from '@/repositories';
import { useCatalogStore } from '@/stores/catalogStore';
import { useSettingsStore } from '@/stores/settingsStore';
import type { Language, PaperWidth, PrinterInfo, PrintResult, SaleDetail } from '@/types';
import { InvoiceDocument, ReportDocument, type ReportDocumentProps } from './A4Documents';
import { printFontCss } from './printFonts';
import { a4Css, htmlDocument, receiptCss } from './printStyles';
import { ReceiptDocument, TestReceiptDocument } from './ReceiptDocument';
import { usePrintStore } from './printStore';

/* ==========================================================================
   Printing (renderer side). Documents are React components rendered to
   self-contained HTML (inline CSS + embedded Bangla font). The same HTML is
   previewed in the app and sent to the main process, which prints silently
   to the chosen printer. A failed print never affects the sale.
   ========================================================================== */

export interface PrintRequest {
  kind: 'receipt' | 'report';
  title: string;
  html: string;
  page: 'receipt' | 'a4';
  paperWidth: PaperWidth;
  landscape?: boolean;
  fileName: string;
}

/** Store logo for print (uploaded image or the built-in basket mark, black on white). */
function logoSvg(): string {
  const logo = useSettingsStore.getState().business.store.logo;
  if (logo) return `<img src="${logo}" alt="" style="width:100%;height:100%;object-fit:contain" />`;
  return `<svg viewBox="0 0 48 48" width="42" height="42" xmlns="http://www.w3.org/2000/svg"><rect width="48" height="48" rx="12" fill="#000"/><path d="M14.5 20h19l-2.2 12.6a3 3 0 0 1-3 2.4h-8.6a3 3 0 0 1-3-2.4Z" fill="none" stroke="#fff" stroke-width="3" stroke-linejoin="round"/><path d="M18.5 20 22 12.5M29.5 20 26 12.5" stroke="#fff" stroke-width="3" stroke-linecap="round"/><path d="M12 20h24" stroke="#fff" stroke-width="3" stroke-linecap="round"/><path d="M21 25v5M27 25v5" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/></svg>`;
}

function unitShort(unitId: string, language: Language): string {
  const unit = useCatalogStore.getState().unitById.get(unitId);
  return unit ? (language === 'bn' ? unit.short.bn : unit.short.en) : '';
}

async function namesForSale(sale: SaleDetail): Promise<{ cashier: string; counter: string }> {
  const [cashier, counters] = await Promise.all([repos().users.getById(sale.cashierId).catch(() => null), repos().counters.list().catch(() => [])]);
  const counter = counters.find((entry) => entry.id === sale.counterId);
  const bn = sale.language === 'bn';
  return {
    cashier: cashier ? (bn ? cashier.name.bn : cashier.name.en) : sale.cashierName,
    counter: counter ? (bn ? counter.name.bn : counter.name.en) : sale.counterName,
  };
}

export async function buildSaleReceipt(sale: SaleDetail, reprint = false): Promise<PrintRequest> {
  const { business, device } = useSettingsStore.getState();
  const [names, customer, fontCss] = await Promise.all([
    namesForSale(sale),
    sale.customerId ? repos().customers.getById(sale.customerId).catch(() => null) : Promise.resolve(null),
    printFontCss(),
  ]);
  const paperWidth = device.printer.paperWidth;
  const body = renderToStaticMarkup(
    createElement(ReceiptDocument, {
      context: {
        sale,
        store: business.store,
        receipt: business.receipt,
        tax: business.tax,
        currency: business.currency,
        paperWidth,
        numerals: device.locale.numerals,
        clock: device.locale.clock,
        cashierName: names.cashier,
        counterName: names.counter,
        unitShort,
        customerPoints: customer?.loyaltyPoints ?? null,
        membership: customer ? t(`enums.customerType.${customer.customerType}`) : null,
        reprint,
        logoSvg: logoSvg(),
      },
    }),
  );
  return {
    kind: 'receipt',
    title: sale.invoiceNo,
    html: htmlDocument(sale.invoiceNo, receiptCss(paperWidth), body, fontCss),
    page: 'receipt',
    paperWidth,
    fileName: `${sale.invoiceNo}.pdf`,
  };
}

export async function buildSaleInvoice(sale: SaleDetail): Promise<PrintRequest> {
  const { business, device } = useSettingsStore.getState();
  const [names, fontCss] = await Promise.all([namesForSale(sale), printFontCss()]);
  const body = renderToStaticMarkup(
    createElement(InvoiceDocument, {
      context: { sale, store: business.store, tax: business.tax, currency: business.currency, numerals: device.locale.numerals, cashierName: names.cashier, counterName: names.counter, logoSvg: logoSvg() },
    }),
  );
  return { kind: 'report', title: sale.invoiceNo, html: htmlDocument(sale.invoiceNo, a4Css(), body, fontCss), page: 'a4', paperWidth: device.printer.paperWidth, fileName: `${sale.invoiceNo}-invoice.pdf` };
}

export async function buildTestReceipt(printerName: string): Promise<PrintRequest> {
  const { business, device } = useSettingsStore.getState();
  const language = device.locale.language;
  const fontCss = await printFontCss();
  const body = renderToStaticMarkup(
    createElement(TestReceiptDocument, {
      language,
      storeName: language === 'bn' ? business.store.nameBn : business.store.nameEn,
      printerName: printerName || t('print.defaultPrinter'),
      when: new Date().toLocaleString(language === 'bn' ? 'bn-BD' : 'en-GB'),
    }),
  );
  return { kind: 'receipt', title: t('print.testPrint'), html: htmlDocument('test', receiptCss(device.printer.paperWidth), body, fontCss), page: 'receipt', paperWidth: device.printer.paperWidth, fileName: 'test-print.pdf' };
}

/** A4 report print-out (used by Reports, stock lists, shift reports…). */
export async function buildReportDocument(props: Omit<ReportDocumentProps, 'storeName' | 'generatedAt' | 'footer'> & { landscape?: boolean; fileName: string }): Promise<PrintRequest> {
  const { business, device } = useSettingsStore.getState();
  const language = device.locale.language;
  const fontCss = await printFontCss();
  const { landscape, fileName, ...rest } = props;
  const body = renderToStaticMarkup(
    createElement(ReportDocument, {
      ...rest,
      storeName: language === 'bn' ? business.store.nameBn : business.store.nameEn,
      generatedAt: new Date().toLocaleString(language === 'bn' ? 'bn-BD' : 'en-GB'),
      footer: 'Super Shop POS',
    }),
  );
  return { kind: 'report', title: props.title, html: htmlDocument(props.title, a4Css(undefined, landscape), body, fontCss), page: 'a4', paperWidth: device.printer.paperWidth, landscape, fileName: fileName || `report-${toLocalDate(new Date())}.pdf` };
}

/** Sends a document straight to the printer (settings printer + copies unless overridden). */
export async function sendToPrinter(request: PrintRequest, overrides: { printerName?: string; copies?: number } = {}): Promise<PrintResult> {
  if (!hasPlatform()) return { outcome: 'failed', failure: 'error', reason: 'no platform bridge' };
  const { printer } = useSettingsStore.getState().device;
  const printerName = overrides.printerName ?? (request.page === 'a4' ? printer.a4Printer || printer.reportPrinter : printer.receiptPrinter);
  const options = {
    printerName,
    copies: overrides.copies ?? (request.kind === 'receipt' ? printer.copies : 1),
    paperWidth: request.paperWidth,
    page: request.page,
    title: request.title,
    landscape: request.landscape,
  };
  const api = getPlatformAPI().printer;
  try {
    return request.kind === 'receipt' ? await api.printReceipt(request.html, options) : await api.printReport(request.html, options);
  } catch (error) {
    console.error('Print failed', error);
    return { outcome: 'failed', failure: 'error', reason: error instanceof Error ? error.message : String(error) };
  }
}

export async function saveAsPdf(request: PrintRequest) {
  return getPlatformAPI().printer.savePdf(request.html, { fileName: request.fileName, paperWidth: request.paperWidth, page: request.page, landscape: request.landscape });
}

/** Opens the in-app print preview; resolves with the result (null when closed without printing). */
export function openPrintPreview(request: PrintRequest): Promise<PrintResult | null> {
  return new Promise((resolve) => {
    const previous = usePrintStore.getState().request;
    previous?.resolve(null);
    usePrintStore.setState({ request: { ...request, resolve } });
  });
}

/** Prints according to settings: silently when auto-print is on, otherwise with the preview. */
export async function printWithSettings(request: PrintRequest): Promise<PrintResult | null> {
  const { printer } = useSettingsStore.getState().device;
  if (printer.autoPrint || !printer.showPreview) return sendToPrinter(request);
  return openPrintPreview(request);
}

export function printResultMessage(result: PrintResult): string {
  if (result.outcome === 'printed') return t('print.printed');
  if (result.outcome === 'saved-pdf') return t('print.savedPdf');
  if (result.outcome === 'cancelled') return t('print.cancelled');
  if (result.failure === 'no-printer') return t('print.noPrinter');
  if (result.failure === 'printer-not-found') return t('print.printerNotFound');
  if (result.failure === 'timeout') return t('print.timeout');
  return t('print.failed', { reason: result.reason ?? '' });
}

/** Printers installed on this computer (empty outside the desktop app or when listing fails). */
export async function listPrinters(): Promise<PrinterInfo[]> {
  if (!hasPlatform()) return [];
  try {
    return await getPlatformAPI().printer.getPrinters();
  } catch (error) {
    console.error('Listing printers failed', error);
    return [];
  }
}

/** The store logo markup used on printed receipts (for previews built outside this module). */
export function receiptLogoMarkup(): string {
  return logoSvg();
}
