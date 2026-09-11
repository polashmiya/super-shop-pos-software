import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      'dist',
      'dist-electron',
      'release',
      'node_modules',
      'coverage',
      'test-results',
      'playwright-report',
      'public',
      'scripts',
    ],
  },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2023,
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports', fixStyle: 'inline-type-imports' }],
      '@typescript-eslint/no-empty-object-type': 'off',
      'no-console': ['warn', { allow: ['warn', 'error', 'info'] }],
    },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    languageOptions: {
      globals: globals.browser,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      // The renderer must never touch Node/Electron APIs directly.
      'no-restricted-imports': [
        'error',
        {
          paths: [
            { name: 'electron', message: 'Use window.electronAPI via src/services/platform instead.' },
            { name: 'fs', message: 'Renderer code cannot access the filesystem.' },
            { name: 'path', message: 'Renderer code cannot use Node path.' },
            { name: 'node:fs', message: 'Renderer code cannot access the filesystem.' },
            { name: 'node:path', message: 'Renderer code cannot use Node path.' },
            { name: 'node:sqlite', message: 'SQLite lives in the main process. Use repositories.' },
          ],
        },
      ],
    },
  },
  {
    files: ['tests/**/*.{ts,tsx}', 'e2e/**/*.ts'],
    rules: {
      'no-console': 'off',
    },
  },
);
