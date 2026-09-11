import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const RESERVED_FILE_NAME_CHARS = new Set(['<', '>', ':', '"', '/', '\\', '|', '?', '*']);
const MAX_FILE_NAME = 100;

/**
 * A safe file name suggestion from the renderer: no folders, no reserved or
 * control characters, at most 100 characters, always the given extension.
 */
export function safeFileName(fileName: string, extension: string, fallback: string): string {
  const base = [...path.basename(String(fileName))]
    .map((char) => (RESERVED_FILE_NAME_CHARS.has(char) || char.charCodeAt(0) < 32 ? '-' : char))
    .join('')
    .trim();
  const suffix = `.${extension}`;
  const name = (base.toLowerCase().endsWith(suffix) ? base.slice(0, -suffix.length) : base) || fallback;
  return `${name.slice(0, MAX_FILE_NAME)}${suffix}`;
}

/** Writes via a temp file + rename so a partial file is never left behind. */
export async function writeFileAtomic(filePath: string, data: string | Uint8Array): Promise<void> {
  const tempPath = `${filePath}.${randomUUID()}.tmp`;
  await fs.promises.writeFile(tempPath, data);
  await fs.promises.rename(tempPath, filePath);
}
