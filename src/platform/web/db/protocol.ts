import type { SqlStatement, SqlValue } from '@/types/database';

/* ==========================================================================
   Messages between the page and the database worker. The worker owns SQLite
   (WASM) and, where the browser allows it, the OPFS file it is stored in.
   ========================================================================== */

export type DbRequest =
  | { id: number; kind: 'open' }
  | { id: number; kind: 'all' | 'get' | 'run'; sql: string; params: readonly SqlValue[] }
  | { id: number; kind: 'transaction'; statements: readonly SqlStatement[] }
  | { id: number; kind: 'info' }
  | { id: number; kind: 'readTables' }
  | { id: number; kind: 'replaceTables'; tables: Record<string, unknown[]> }
  | { id: number; kind: 'reseed'; mode: 'demo' | 'empty' }
  | { id: number; kind: 'extend' };

export interface DbOpenResult {
  /** False when the browser cannot store the database (data is lost on reload). */
  persistent: boolean;
  /** Set when this call created the shop (first visit). */
  seeded: boolean;
  /** Shown in Settings → Data; an OPFS path, not a real file system path. */
  filePath: string;
  sqliteVersion: string;
}

export type DbResponse = { id: number; ok: true; value: unknown } | { id: number; ok: false; error: string };
