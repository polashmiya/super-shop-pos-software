/// <reference lib="webworker" />
import sqlite3InitModule, { type Database as WasmDatabase, type Sqlite3Static } from '@sqlite.org/sqlite-wasm';
import { APP_CONFIG } from '@/config/app.config';
import { toBridgeError } from '@/data/schema/sqlErrors';
import { createWebEngine, prepareDatabase, type WebEngine } from './engine';
import type { DbOpenResult, DbRequest, DbResponse } from './protocol';

/* ==========================================================================
   Database worker.

   SQLite runs here rather than on the page so that (a) OPFS synchronous
   access handles are available — they exist only in workers — and (b) the
   cashier's screen never freezes while a query runs or the demo shop is
   generated on first visit.

   Storage: OPFS via the SAH-pool VFS, which needs no COOP/COEP headers and
   so works on any static host. Where OPFS is unavailable (private windows,
   older browsers) the database falls back to memory for the session and
   `persistent: false` tells the UI to warn the cashier.
   ========================================================================== */

const OPFS_DIRECTORY = 'super-shop-pos';
const DB_PATH = `/${APP_CONFIG.database.fileName}`;

let sqlite3: Sqlite3Static | null = null;
let database: WasmDatabase | null = null;
let engine: WebEngine | null = null;
let persistent = false;

async function openDatabase(): Promise<DbOpenResult> {
  sqlite3 ??= await sqlite3InitModule();

  if (!engine) {
    try {
      const pool = await sqlite3.installOpfsSAHPoolVfs({ directory: OPFS_DIRECTORY, initialCapacity: 6 });
      database = new pool.OpfsSAHPoolDb(DB_PATH);
      persistent = true;
    } catch {
      // No OPFS (private window, unsupported browser): keep the shop in memory
      // for this session. The UI warns that nothing is being saved.
      database = new sqlite3.oo1.DB(':memory:', 'c');
      persistent = false;
    }
    // OPFS has no write-ahead log, and an in-memory database does not need one.
    prepareDatabase(database, { wal: false });
    engine = createWebEngine(sqlite3, database);
  }

  let seeded = false;
  if (engine.isEmpty()) {
    engine.reseed('demo', new Date());
    seeded = true;
  }

  return { persistent, seeded, filePath: persistent ? `opfs://${OPFS_DIRECTORY}${DB_PATH}` : 'memory', sqliteVersion: sqlite3.capi.sqlite3_libversion() };
}

function active(): WebEngine {
  if (!engine) throw new Error('The database is not open yet.');
  return engine;
}

/** Approximate stored size; OPFS does not expose the file size directly. */
function storedBytes(): number {
  if (!sqlite3 || !database) return 0;
  try {
    return sqlite3.capi.sqlite3_js_db_export(database).byteLength;
  } catch {
    return 0;
  }
}

async function handle(request: DbRequest): Promise<unknown> {
  switch (request.kind) {
    case 'open':
      return openDatabase();
    case 'all':
      return active().all(request.sql, request.params);
    case 'get':
      return active().get(request.sql, request.params);
    case 'run':
      return active().run(request.sql, request.params);
    case 'transaction':
      return active().transaction(request.statements);
    case 'info':
      return active().info(storedBytes(), persistent ? `opfs://${OPFS_DIRECTORY}${DB_PATH}` : 'memory');
    case 'readTables':
      return active().readTables();
    case 'replaceTables':
      return active().replaceTables(request.tables);
    case 'reseed':
      return active().reseed(request.mode, new Date());
    case 'extend':
      return active().extend(new Date());
  }
}

self.addEventListener('message', (event: MessageEvent<DbRequest>) => {
  const request = event.data;
  void handle(request).then(
    (value) => {
      const response: DbResponse = { id: request.id, ok: true, value };
      self.postMessage(response);
    },
    (error: unknown) => {
      // Raw SQLite text never reaches the page — only the shared error codes,
      // exactly as the desktop's IPC bridge reports them.
      const response: DbResponse = { id: request.id, ok: false, error: toBridgeError(error).message };
      self.postMessage(response);
    },
  );
});
