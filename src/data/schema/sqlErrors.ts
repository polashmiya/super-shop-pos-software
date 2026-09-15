import { SqlRejectedError } from './sqlGuard';
import type { SqlErrorCode } from '@/types/database';

/* ==========================================================================
   SQLite error classification, shared by both runtimes: node:sqlite in the
   Electron main process and sqlite-wasm in the browser's database worker.
   Raw driver text never reaches the UI — only these stable codes do.
   ========================================================================== */

/** Error message prefix understood by the renderer's SQL client. */
export const SQL_ERROR_PREFIX = 'SQL_ERROR';

export function classifySqlError(error: unknown): { code: SqlErrorCode; detail: string } {
  if (error instanceof SqlRejectedError) return { code: 'rejected', detail: error.message };
  const message = error instanceof Error ? error.message : String(error);
  const unique = /UNIQUE constraint failed: ([\w.]+(?:, [\w.]+)*)/i.exec(message);
  if (unique) return { code: 'constraint_unique', detail: unique[1] };
  if (/FOREIGN KEY constraint failed/i.test(message)) return { code: 'constraint_foreign_key', detail: '' };
  const check = /CHECK constraint failed: (.+)$/i.exec(message);
  if (check) return { code: 'constraint_check', detail: check[1] };
  if (/database is locked|SQLITE_BUSY/i.test(message)) return { code: 'busy', detail: '' };
  return { code: 'failed', detail: '' };
}

/** Error with a stable, parseable message: SQL_ERROR|code|detail. */
export function toBridgeError(error: unknown): Error {
  const { code, detail } = classifySqlError(error);
  return new Error(`${SQL_ERROR_PREFIX}|${code}|${detail}`);
}
