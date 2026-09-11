/* CSV helpers for exports (UTF-8; the main process adds a BOM for Excel). */

export type CsvCell = string | number | boolean | null | undefined;

function escapeCell(value: CsvCell): string {
  if (value === null || value === undefined) return '';
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(headers: readonly string[], rows: ReadonlyArray<readonly CsvCell[]>): string {
  return [headers, ...rows].map((row) => row.map(escapeCell).join(',')).join('\r\n');
}

/** Money in minor units → plain decimal string for spreadsheets (e.g. 1234.50). */
export function csvMoney(minor: number): string {
  return (minor / 100).toFixed(2);
}

/** File-name friendly slug with the current date. */
export function exportFileName(base: string, extension: 'csv' | 'json'): string {
  const date = new Date();
  const stamp = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
  const slug = base
    .toLowerCase()
    .replace(/[^a-z0-9ঀ-৿]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${slug || 'export'}-${stamp}.${extension}`;
}
