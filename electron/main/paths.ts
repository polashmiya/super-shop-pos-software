import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** dist-electron/main at runtime (the bundled main process lives here). */
const MAIN_DIR = path.dirname(fileURLToPath(import.meta.url));

export const PRELOAD_PATH = path.join(MAIN_DIR, '../preload/index.cjs');

export const RENDERER_INDEX_PATH = path.join(MAIN_DIR, '../../dist/index.html');

/** Set by vite-plugin-electron while `npm run dev` is running. */
export const DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;

/** When set, print jobs are saved as PDF files in this folder (testing/diagnostics). */
export const PRINT_TO_PDF_DIR = process.env.POS_PRINT_TO_PDF_DIR;

/** Fixed clock for automated tests (ISO string), so demo data is reproducible. */
export const FIXED_NOW = process.env.POS_FIXED_NOW;
