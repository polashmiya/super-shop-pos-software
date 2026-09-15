import type { ExportResult, SaveFileKind } from '@/types/print';

/* ==========================================================================
   File exports and imports in the browser. The desktop app writes wherever
   the native save dialog points; here the file goes to the browser's
   downloads folder, and imports come from a file picker. Nothing is
   uploaded — the file never leaves the machine.
   ========================================================================== */

/** Byte-order mark so Excel opens UTF-8 CSV (Bangla) correctly. */
const UTF8_BOM = '﻿';

const MIME: Record<SaveFileKind, string> = {
  csv: 'text/csv;charset=utf-8',
  json: 'application/json;charset=utf-8',
};

export function downloadBlob(fileName: string, blob: Blob): ExportResult {
  try {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.rel = 'noopener';
    link.style.display = 'none';
    document.body.append(link);
    link.click();
    link.remove();
    // Revoke once the browser has started the download.
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
    return { ok: true, filePath: fileName };
  } catch (error) {
    console.error('Saving the file failed', error);
    return { ok: false, reason: 'failed' };
  }
}

export function saveTextFile(fileName: string, content: string, kind: SaveFileKind): ExportResult {
  const text = kind === 'csv' ? UTF8_BOM + content : content;
  return downloadBlob(fileName, new Blob([text], { type: MIME[kind] }));
}

export interface PickedFile {
  name: string;
  size: number;
  text: string;
}

/** Opens the browser's file picker; resolves null when the user cancels. */
export function pickTextFile(accept: string, maxBytes: number): Promise<PickedFile | null | 'too-large'> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.style.display = 'none';

    let settled = false;
    const finish = (value: PickedFile | null | 'too-large') => {
      if (settled) return;
      settled = true;
      input.remove();
      resolve(value);
    };

    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (!file) return finish(null);
      if (file.size > maxBytes) return finish('too-large');
      file
        .text()
        .then((text) => finish({ name: file.name, size: file.size, text }))
        .catch(() => finish(null));
    });

    // Chrome fires `cancel` on dismissal; other browsers simply never fire
    // `change`, leaving the promise pending until the page is left.
    input.addEventListener('cancel', () => finish(null));

    document.body.append(input);
    input.click();
  });
}
