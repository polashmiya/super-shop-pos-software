import type { PaperWidth } from './settings';

export interface PrinterInfo {
  name: string;
  displayName: string;
  description: string;
  isDefault: boolean;
}

export type PrintFailure = 'no-printer' | 'printer-not-found' | 'timeout' | 'error';

export interface PrintResult {
  outcome: 'printed' | 'cancelled' | 'failed' | 'saved-pdf';
  failure?: PrintFailure;
  reason?: string;
}

export type PrintPageKind = 'receipt' | 'a4';

export interface PrintJobOptions {
  printerName: string;
  copies: number;
  /** Roll width for receipts; ignored for A4 documents. */
  paperWidth: PaperWidth;
  page: PrintPageKind;
  title: string;
  landscape?: boolean;
}

export interface SavePdfOptions {
  fileName: string;
  paperWidth: PaperWidth;
  page: PrintPageKind;
  landscape?: boolean;
}

export interface ExportResult {
  ok: boolean;
  filePath?: string;
  reason?: 'cancelled' | 'failed' | 'invalid';
}

export type SaveFileKind = 'csv' | 'json';

export interface ImportPreview {
  token: string;
  fileName: string;
  exportedAt: string;
  appVersion: string;
  schemaVersion: number;
  counts: Record<string, number>;
}

export interface ImportPickResult {
  ok: boolean;
  preview?: ImportPreview;
  reason?: 'cancelled' | 'invalid' | 'failed' | 'newer-schema';
}

export interface DatabaseInfo {
  path: string;
  sizeBytes: number;
  schemaVersion: number;
  counts: Record<string, number>;
  sqliteVersion: string;
}

export interface AppInfo {
  name: string;
  version: string;
  electron: string;
  chrome: string;
  node: string;
  platform: string;
  arch: string;
  userDataPath: string;
  isPackaged: boolean;
}
