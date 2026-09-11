import path from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const rootDir = path.dirname(fileURLToPath(import.meta.url));

// Unit/integration tests run without the Electron plugin, so no Electron
// process is spawned. Repository/service tests use a real in-memory SQLite
// database (node:sqlite) through the same SQL bridge the main process uses.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.join(rootDir, 'src') },
  },
  define: {
    __APP_NAME__: JSON.stringify('Super Shop POS'),
    __APP_VERSION__: JSON.stringify('0.0.0-test'),
    __APP_DESCRIPTION__: JSON.stringify('Test build'),
  },
  test: {
    environment: 'jsdom',
    // Worker threads start reliably on Windows (child-process forks can time out).
    pool: 'threads',
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    setupFiles: ['tests/setup.ts'],
    restoreMocks: true,
    testTimeout: 30_000,
  },
});
