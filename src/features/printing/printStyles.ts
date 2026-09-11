import { APP_CONFIG } from '@/config/app.config';
import type { PaperWidth } from '@/types';
import { PRINT_FONT_STACK } from './printFonts';

/* CSS for printed documents (receipts and A4). Black on white, no colours. */

export function receiptCss(paperWidth: PaperWidth, fontFamily: string = PRINT_FONT_STACK): string {
  const width = APP_CONFIG.print.paper[paperWidth].contentMm;
  return `
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #fff; color: #000; }
  body { width: ${APP_CONFIG.print.paper[paperWidth].paperMm}mm; padding: 3mm ${(APP_CONFIG.print.paper[paperWidth].paperMm - width) / 2}mm 2mm; font-family: ${fontFamily}; font-size: ${paperWidth === '58mm' ? 10.5 : 12}px; line-height: 1.35; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .receipt { width: 100%; }
  .c { text-align: center; }
  .store { font-size: 1.35em; font-weight: 800; margin-bottom: 2px; }
  .logo { display: flex; justify-content: center; margin-bottom: 4px; }
  .logo svg { width: 42px; height: 42px; }
  .strong { font-weight: 700; }
  .sub { font-size: 0.88em; }
  .num { font-variant-numeric: tabular-nums; white-space: nowrap; }
  .item { margin-bottom: 4px; }
  .item .name { font-weight: 600; word-break: break-word; }
  svg { display: block; }
  @page { margin: 0; size: ${APP_CONFIG.print.paper[paperWidth].paperMm}mm auto; }
  `;
}

export function a4Css(fontFamily: string = PRINT_FONT_STACK, landscape = false): string {
  return `
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #fff; color: #111; }
  body { font-family: ${fontFamily}; font-size: 11.5px; line-height: 1.45; padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .page { width: 100%; }
  h1 { font-size: 20px; margin: 0 0 2px; }
  h2 { font-size: 14px; margin: 16px 0 6px; }
  .muted { color: #555; }
  .row { display: flex; justify-content: space-between; gap: 16px; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #111; padding-bottom: 10px; margin-bottom: 12px; }
  .kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin: 8px 0 12px; }
  .kpi { border: 1px solid #ccc; border-radius: 6px; padding: 6px 8px; }
  .kpi .label { color: #555; font-size: 10px; }
  .kpi .value { font-size: 15px; font-weight: 700; font-variant-numeric: tabular-nums; }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; font-size: 10.5px; color: #333; border-bottom: 1.5px solid #111; padding: 5px 6px; }
  td { border-bottom: 1px solid #ddd; padding: 4px 6px; vertical-align: top; }
  th.num, td.num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  tfoot td { font-weight: 700; border-top: 1.5px solid #111; border-bottom: none; }
  .totals { margin-left: auto; width: 45%; margin-top: 10px; }
  .totals .row { padding: 3px 0; }
  .totals .grand { font-size: 15px; font-weight: 800; border-top: 2px solid #111; padding-top: 6px; }
  .footer { margin-top: 18px; color: #555; font-size: 10px; text-align: center; }
  @page { size: A4 ${landscape ? 'landscape' : 'portrait'}; margin: 12mm; }
  `;
}

export function htmlDocument(title: string, css: string, body: string, fontCss: string): string {
  const escapedTitle = title.replace(/[<>&]/g, '');
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapedTitle}</title><style>${fontCss}${css}</style></head><body>${body}</body></html>`;
}
