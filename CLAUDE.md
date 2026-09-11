# CLAUDE.md — Super Shop POS

Developer guide for changing and upgrading this project. User documentation (install, build,
printing, data folders) is in `README.md`.

## What this is

Offline-first **supermarket POS** desktop app: Electron 44 + React 19 + TypeScript 6 (strict) +
Vite 8 + Tailwind CSS 4 + Zustand 5 + react-router 7 + SQLite (`node:sqlite`, built into Electron)
+ electron-store. **Bangla (`bn`) is the default language**, English (`en`) the second. No
backend and no network at runtime — every asset (fonts, product artwork, icons) is bundled.

## Status (as of 12 Sep 2026)

Feature-complete against the original spec (`C:\Users\hp\Documents\supershoppos.txt`):
POS with two layouts (product grid / scan-only counter), payments (cash, card, bKash/Nagad/Rocket,
points, split), returns and cancellations, hold/recall, customers + loyalty, inventory + stock
ledger + adjustments, purchases (PO → GRN) + suppliers, shifts/cash drawer/expenses, dashboard,
25 reports (print/CSV/JSON), settings centre (29 sections, search, reset), activity log, profile,
receipts/A4 printing with preview and PDF fallback, backup/restore, demo data, Windows installer.
Checks: `npm run verify` (271 unit tests), 10 Playwright end-to-end tests. Nothing is a stub.

## Commands

```bash
npm run dev          # Vite + Electron with hot reload (data: %APPDATA%\Super Shop POS Dev)
npm run verify       # typecheck (3 projects) + lint + unit tests + build — run before finishing
npm run test         # Vitest (domain, repositories and services against in-memory SQLite)
npm run test:e2e     # build, then Playwright drives the real Electron app (≈1 min)
npm run dist:win     # installer → release/<version>/<productName>-Setup-<version>.exe
npm run art          # regenerate bundled product artwork (public/products/**)
npm run icons        # regenerate build/icon.png
npm run shots        # screenshots of the built app → screenshots/ (see Testing)
```

Env vars: `POS_USER_DATA_DIR=<dir>` (isolated data folder), `POS_PRINT_TO_PDF_DIR=<dir>` (print
jobs become PDFs — tests), `POS_FIXED_NOW=<iso>` (clock used ONLY when generating demo data),
`POS_NO_MAXIMIZE=1`.

Demo sign-ins: Rahim/admin `1111`, Nusrat/manager `2222`, Karim/cashier `3333` (counter 03),
Sadia `4444`, Hasan `5555`.

## Architecture (data flow)

```
React UI ─► Zustand stores ─► services (src/services) ─► repository interfaces (src/repositories/types.ts)
                                                            └─► local implementation (src/repositories/local)
                                                                  └─► SqlClient ─► preload IPC ─► main: SqlBridge ─► SQLite
```

- **UI never touches SQL or Electron.** Components call services/stores; `window.electronAPI` is
  only used in `src/platform/electron.ts`, `src/app/bootstrap.ts`, printing and data services.
- **Repositories** are the backend boundary. A future ASP.NET Core/Node API implements the same
  interfaces (`Repositories` in `src/repositories/types.ts`) and is installed with
  `setRepositories()` — services, stores and UI stay unchanged.
- **Services** get their user/permissions/settings/clock from `src/services/context.ts`
  (`ctx()`, `actor()`, `requirePermission()`), wired in `bootstrap.ts` and replaced in tests.
- **Business logic** is pure and tested in `src/domain` (money, pricing/VAT, payment, refunds,
  stock, loyalty, shift math, numbering, dates, validation, text/search normalisation).
- **Transactions:** every business action (sale, return, cancel, purchase receive, stock
  adjustment, shift open/close, expense) is ONE SQL transaction built from statement builders in
  `src/repositories/local/statements.ts` (stock ledger + balance, cash ledger, loyalty, document
  numbers, audit). Never update `stock_balances` without a `stock_movements` row.
- **Main process** (`electron/`): `database/` (connection + demo seeding, migrations, SQL guard,
  bridge), `ipc/handlers.ts` (validates every argument, checks the sender), `printing/`,
  `main/` (window, security, electron-store, backup/import, logger, paths), `preload/index.ts`
  (the only bridge), `shared/ipcChannels.ts` (channel names), `types/electron.d.ts`
  (`window.electronAPI` shape).
- **Demo data** (`src/data/seed`): deterministic generator — catalogue lines × brands × sizes →
  ~1,300 products (min/max stock scaled to each product's demand); a chronological simulator
  (`history.ts`) creates 45 days of sales, payments, stock ledger, POs/GRNs, returns,
  cancellations, shifts, cash movements, expenses, held sales and audit rows so every report
  adds up. `baseData.ts` is what an empty (non-demo) shop still gets.

## Map of the code

```
src/config/        app.config.ts (ALL constants) · theme.config.ts (accents, fonts, sizes)
                   defaults.ts (default settings + shortcuts) · permissions.ts (permission matrix)
src/styles/        tokens.css (ALL colours/radius/shadows/density) · index.css (Tailwind mapping,
                   type-* utilities, animations)
src/i18n/          index.ts (t, useT, useLocalize, tIn, translate) · en.ts/bn.ts (aggregators)
                   locales/{en,bn}/<ns>.ts  ns = common, enums, errors, validation, shell (nav,
                   shell, auth, onboarding), pos (pos, receipt, print), catalog, sales, customers,
                   inventory, cash, dashboard, reports, settings (settings, audit, profile)
src/types/         domain types (common, catalog, people, sales, inventory, operations, settings,
                   report, print) — re-exported from src/types/index.ts
src/domain/        pure business logic (tested)
src/repositories/  types.ts (interfaces) · local/* (SQLite) · index.ts (registry: repos())
src/services/      auth, user, audit, catalog, pricing, sale, return, payment, heldSale,
                   inventory, purchase, people (customers/suppliers), shift (+counter, expense),
                   report, notification, data (backup/files), sound, context
src/stores/        Zustand: settings, auth, ui (toasts/confirm/approval/palette), catalog
                   (in-memory products + search index), pos (cart draft), shift, notification
src/hooks/         useAsync (load + keep previous data), useFormat, useCommon (element size,
                   isEditableTarget, useNow…)
src/utils/         format.ts (createFormatters), csv.ts, code128.ts (barcode SVG)
src/components/ui/ design system (Button, IconButton, Input/FormField, Select, SearchInput,
                   Checkbox, Switch, SegmentedControl, Tabs, ChoiceCard, Modal/Drawer, Popover,
                   DropdownMenu, Tooltip, Badge/StatusBadge, Card, PageHeader, SectionHeader,
                   Breadcrumb, StatCard, DefinitionList, Meter, Kbd, Avatar, DataTable,
                   Pagination, EmptyState/LoadingState/Skeleton/ErrorState, NumericKeypad,
                   Combobox, PeriodPicker, useFocusTrap)
src/components/charts/  ColumnChart, LineChart, BarList, DonutChart, ChartCard, MiniTable, Legend
src/components/product/ ProductImage (never broken), ProductCard, stockStatusBadge, layout
src/components/app/     StoreLogo, DialogHosts (confirm/approval), Overlays (lock screen,
                        shortcuts sheet, notifications), CommandPalette
src/features/<area>/    feature components/logic:
   pos/        SearchBar, CartPanel, ProductGrid, CategoryBar, PaymentModal, DiscountModal,
               LineEditModal, HeldSalesDialogs, CustomerPickerModal, QuickViewAndGate,
               posActions.ts (ALL cart mutations), posUiStore.ts, usePosKeyboard.ts,
               scanInput.ts ("3*code"), useCartTotals.ts
   pos/counter/ scan-only layout: CounterSuggestions, CounterLinesTable, CounterLineRow,
               CounterSummary (used by src/pages/pos/CounterPosPage.tsx)
   printing/   printService (build*/printWithSettings/openPrintPreview), ReceiptDocument,
               A4Documents, PrintDialog
   settings/   sections.ts (29 sections), sectionComponents.ts (lazy map), settingEntries.ts
               (search index), sectionDefaults.ts (reset plans), saveStatus.ts (saveDevice/
               saveBusiness), useSettingsAccess.ts, components/*, sections/*Section.tsx
   reports/    definitions/{sales,items,stock,people,finance,operations}.ts + index.ts
               (registry), builders.ts, labels.ts, ReportView.tsx, exporters.ts, library.ts
   audit/      auditMeta.ts (action look, entity links, detail rows), AuditDetailDrawer,
               auditExport
   profile/    identity, preferences (applied at sign-in via userPreferences.ts), PIN,
               activity, shortcuts cards
   sales/, customers/, suppliers/, purchases/, inventory/, catalog/, cash/, dashboard/
src/pages/<area>/     route screens (lazy-loaded in src/app/router.tsx; POS is eager)
src/layouts/          AppShell (global shortcuts), Sidebar, Topbar, StatusBar
src/app/              router, navigation (nav items + landingPath), bootstrap, shortcuts,
                      applyAppearance, exitGuard, RouteGuards, App
electron/             main process (see above)
public/products/      bundled product artwork (generated by scripts/generate-product-art.mjs)
tests/                Vitest: domain/*, services/*, reports/*, electron/*, i18n, settings, pos,
                      helpers/{db,services}.ts
e2e/                  Playwright: helpers.ts, app.spec.ts, pos.spec.ts, counter.spec.ts
```

## Rules

- **Text:** every user-facing string goes through i18n. Add keys to BOTH
  `src/i18n/locales/en/<ns>.ts` and `src/i18n/locales/bn/<ns>.ts` (TypeScript fails if bn misses
  a key; `tests/i18n` fails if placeholders differ). Use `useT()` in components, `t()` outside
  React, `useLocalize()(product.name)` for `{ bn, en }` data. Placeholders: `{name}`; plurals:
  `key_one` / `key_other` with `{count}`. No hard-coded `aria-label` strings either.
- **Numbers, money, dates:** always `useFormat()` (`format.money(minor)`, `format.quantity`,
  `format.percent(bp)`, `format.date/time/dateTime/relative`, `format.integer`, `format.digits`).
  Never `toLocaleString` ad hoc — the numeral setting (English/Bangla digits) must apply.
- **Money is integer minor units** (poisha); rates are basis points (5% = 500). Use
  `src/domain/money.ts` (`toMinor`, `parseMoneyInput`, `percentOf`, `multiplyMoney`…). Never add
  floats. Cart totals only via `cartTotals()` / `calculateCartTotals()`.
- **Colours:** only tokens (`bg-surface`, `text-fg-muted`, `bg-primary`, `text-success-text`,
  `bg-danger-soft`, `bg-chart-1`…). The default Tailwind palette is removed. Status = colour +
  icon + text (`StatusBadge`), never colour alone.
- **Layout of a screen:** `<div className="flex h-full flex-col">` → `<PageHeader …/>` → body
  `<div className="min-h-0 flex-1 overflow-y-auto p-6">`. Touch targets ≥ 44 px: use the
  `h-touch` / `min-h-touch` token (44–54 px depending on density), not `h-11`.
- **Errors:** services throw `AppError(code)`; UI shows `toast.fromError(error)` (friendly,
  translated `errors.<code>`). Confirm destructive actions with `confirmAction({...})`; ask for a
  manager with `requestApproval({ permission, action })`.
- **Permissions:** `useCan('products.manage')`; services also check (`requirePermission`).
- **Printing:** build a document (`buildSaleReceipt`, `buildSaleInvoice`, `buildReportDocument`)
  then `printWithSettings(request)` or `openPrintPreview(request)` (src/features/printing).
  A print failure must never undo a completed action.
- **Exports:** `toCsv()` (src/utils/csv.ts) + `dataService.saveFile(name, content, 'csv'|'json')`.
- **Files:** `.tsx` files export components only (helpers in `.ts`), per eslint react-refresh.
  Keep files under ~400 lines; split by responsibility.
- **Settings:** device settings `useSettingsStore().updateDevice(patch)` (auto-saved, debounced);
  business settings `updateBusiness(section, value)` (one audit row per save). In settings
  screens use `saveDevice` / `saveBusiness` from `features/settings/saveStatus.ts`.
- **Lists:** filters live in the URL (`useListParams`, `readPeriod`, `readPaging` in
  `features/sales/listParams.ts`) so they survive opening a record and coming back.
- **Cart:** components never mutate `usePosStore` directly — go through `features/pos/posActions.ts`
  (validation, stock checks, approvals, sounds, toasts live there).

## Recipes

- **Change colours/brand:** `src/styles/tokens.css` (dark + light blocks) and accent presets in
  `src/config/theme.config.ts`. App name/version: `package.json`. Store defaults:
  `src/config/defaults.ts`. Icon: `build/icon.png` (`npm run icons`).
- **Add a page:** create `src/pages/<area>/<Name>Page.tsx` (default export), add a route in
  `src/app/router.tsx` (with permission), a nav item in `src/app/navigation.ts` (with bilingual
  `keywords` for the command palette), and `nav.<key>` texts.
- **Add a setting:** type in `src/types/settings.ts` → default in `src/config/defaults.ts`
  (existing installs are filled in by `mergeWithDefaults`) → control in the right
  `features/settings/sections/<X>Section.tsx` (wrap in `SettingRow`/`SwitchRow`/`SettingBlock`
  with a unique `anchor`) → entry in `settingEntries.ts` (search + palette; `tests/settings`
  checks the anchor exists) → key in `sectionDefaults.ts` if "Reset this section" should cover it
  → `settings.<section>.*` texts in en + bn.
- **Add a settings section:** id in `sections.ts` (icon, scope, permission, group) →
  `sections/<Name>Section.tsx` → `sectionComponents.ts` → `settings.sections.<id>.{title,description}`
  → optional reset plan in `sectionDefaults.ts`.
- **Add a report:** id in `src/types/report.ts` (`ReportId`) → SQL in
  `repositories/local/reportRepository.ts` + name in `ReportQueryName` (`repositories/types.ts`)
  → definition in `features/reports/definitions/<group>.ts` (kpis/charts/statement/table built
  with `builders.ts`, labels as specs resolved by `labels.ts`) → register in `definitions/index.ts`
  (the `Record<ReportId, …>` fails to compile if one is missing) → `reports.items.<id>` texts
  → a query test in `tests/reports`. Numbers must reconcile (net = gross − discounts − returns).
- **Add an audit action:** `AuditAction` in `src/types/operations.ts` → write it with
  `auditStatement(...)` inside the transaction (or `auditService.record` for non-transactional
  events) → `enums.auditAction.<action>` texts → tone/icon in `features/audit/auditMeta.ts`
  (and `settings.audit.details.<key>` for any new detail field).
- **Add a keyboard shortcut:** `ShortcutAction` in `src/types/settings.ts` → default combo in
  `DEFAULT_SHORTCUTS` → `GLOBAL_ACTIONS` (handled in `layouts/AppShell.tsx`) or `POS_ACTIONS`
  (handled in `features/pos/usePosKeyboard.ts` `runAction`) → `shell.shortcuts.actions.<action>`
  texts. Shortcuts must never fire while typing unless `firesWhileTyping(combo)`.
- **Add a permission:** `PERMISSIONS` + `PERMISSION_GROUPS` + role defaults in
  `src/config/permissions.ts` → `settings.users.permissions.<id>` texts → guard routes/buttons
  with `useCan` and services with `requirePermission`. Existing installs keep their saved matrix;
  admins always have everything.
- **Add an IPC channel:** name in `electron/shared/ipcChannels.ts` → handler with argument
  validation in `electron/ipc/handlers.ts` → `electron/preload/index.ts` → type in
  `electron/types/electron.d.ts` → call it only from a service via `getElectronAPI()`.
- **Add a table/column:** new migration in `electron/database/migrations.ts` (never edit a shipped
  one), bump `APP_CONFIG.database.schemaVersion`, add the table to `DATA_TABLES` (backup/restore),
  map rows in `repositories/local/mappers.ts`, and give the demo generator something to put in it.
- **Add a repository method:** interface in `src/repositories/types.ts`, implementation in
  `src/repositories/local/*`, expose through a service; tests use the real implementation.
- **Add a notification:** `NotificationType` in `src/types/operations.ts` → derive it in
  `services/notificationService.ts` `sync()` (idempotent via `dedupeKey`) → texts under
  `shell.notifications` → preference in `NotificationPreferences` + Settings → Notifications.
- **Change POS behaviour:** cart rules in `posActions.ts`; scan box parsing in `SearchBar.tsx` +
  `scanInput.ts`; keys in `usePosKeyboard.ts`. Both layouts (`GridPosPage` in `PosPage.tsx`,
  `CounterPosPage.tsx`) pick these up automatically — never duplicate cart logic in a layout.
  A third layout = new page + a value in `PosLayout` + a `ChoiceCard` in `PosSection.tsx`.
- **Connect a backend:** implement `Repositories` with HTTP calls and call `setRepositories()` in
  `src/app/bootstrap.ts` instead of `installLocalDataSource()`. Entities already carry
  `created_at/updated_at/version/sync_status/deleted_at` and `enums.syncStatus` has texts for
  local/pending/synced/error; `layouts/StatusBar.tsx` currently always shows "local" — give it a
  sync store to read from.
- **Release:** bump `version` in `package.json` → `npm run verify` → `npm run test:e2e` →
  `npm run dist:win` → `release/<version>/`. The build needs ~1 GB free RAM; it was killed once on
  a machine with 1.8 GB free — close other apps and run it in the foreground.

## Testing

- **Unit/integration:** `createServiceHarness()` in `tests/helpers/services.ts` gives a seeded
  in-memory database, the real local repositories and a controllable context (user, permissions,
  counter, clock) — see `tests/services/*.test.ts`. Prefer testing through services so the SQL
  guard, statement builders and audit rows are exercised.
- **End-to-end:** `e2e/helpers.ts` — `launchApp()` (fresh data folder, prints to PDF, and pins
  the demo generator's clock to **today at noon** so a shift is open on counter 03 whenever the
  suite runs), `login(page, 'karim')`, `ensurePos(page)` (signs in again if Playwright restarted
  the worker after a failure), `scan(page, code)`, `goto(page, '#/…')`, `sqlGet(page, sql)`.
  Stable hooks for tests: `input[data-pos-search]`, `[data-line-id]`, `input[data-pin-input]`,
  `[data-setting=<anchor>]`, `[data-modal-root]`; otherwise use roles and bilingual name regexes
  (`/হোল্ড|Hold/`). Look up a new sale by the invoice number shown on screen, not by
  `ORDER BY created_at` (demo rows can be later than the real clock).
- **Screenshots** for a visual check: `npm run build && npm run shots -- en-light 1280x720
  "#/pos,#/reports" counter` (`scripts/screenshots.mjs`: language-theme, size, routes, POS
  layout) launches the built app on fresh demo data, signs in as the admin and saves PNGs to
  `screenshots/`, failing if the renderer logged an error. Check bn/dark and en/light at 1366×768
  and 1280×720 for UI work. On a 125 % Windows display, screenshot pixels are 1.25× CSS px.

## Gotchas

- `node:sqlite` runs only in the main process. Tests create an in-memory DB and use the same
  `SqlBridge`, so SQL is validated exactly like production (`electron/database/sqlGuard.ts`
  rejects PRAGMA/DDL/ATTACH/comments/multiple statements from the renderer).
- ESLint `react-hooks/set-state-in-effect`: don't call setState synchronously in an effect body
  (defer with a timeout/promise or derive during render). Don't read `ref.current` during render
  — keep such state in a store (see `posUi.typedQuantity`).
- Vitest uses `pool: 'threads'` (forks time out on Windows).
- VS Code terminals may set `ELECTRON_RUN_AS_NODE=1`; unset it before `npm run dev`/`test:e2e`.
- Never call `webContents.print({ silent: false })` on a hidden window (Windows shows no preview
  and may never call back). The app has its own preview; the main process prints silently.
- Document numbers (`INV-YYYYMMDD-####`, `RET-`, `PO-`, `GRN-`, `SH-`, `EXP-`, `ADJ-`) come from
  the `sequences` table inside the saving transaction — never from array length.
- POS has two layouts behind one route: `PosPage` picks `GridPosPage` or `CounterPosPage` from
  `device.pos.layout`. Both share `SearchBar` (scan/search, `3*code` quantity prefix via
  `scanInput.ts`), `posActions`, `usePosKeyboard` and every dialog — add cart behaviour there,
  not in a layout. `posUi.query` is the search text *without* the quantity prefix.
- Dialog focus (`useFocusTrap` in Modal/Drawer): initial focus goes to `initialFocus`,
  `[data-autofocus]`, a field with `autoFocus`, or else the first focusable element; the previous
  focus is restored on close. Give a dialog's main field one of these, or typing hits Close.
- Device settings and the POS cart draft save with a debounce; `src/app/exitGuard.ts` flushes both
  on window close/reload and asks first when Settings → General → "Ask before closing" is on.
- Demo shifts open in the morning and close at night, generated "as of now". Late at night the
  POS shows the open-shift gate — that is correct behaviour, not a bug (tests pin the clock).
- Demo stock levels are deliberately low (scaled to demand, max ≈ 12 units); tests that need
  stock should `ORDER BY quantity DESC` rather than assume a threshold.
- Tables with `truncate` cells need `table-fixed`, or a long name makes the table overflow.
- Playwright restarts its worker (and re-runs `beforeAll`) after a failed test, so a later test
  in the same file may start on the sign-in screen — use `ensurePos`.

## Open upgrade paths (not started)

- **API repositories** (`src/repositories/api/*`) + sync queue using `sync_status` — the UI and
  services need no change; add a Settings → Sync section and wire the status-bar indicator.
- Multi-branch: `organizations`/`branches` tables and `branchId` filters already exist; the UI
  assumes one branch.
- Real product photos (`product.image` accepts data URLs today via the artwork picker).
- Hardware: weighing scale input, cash-drawer kick, customer-facing display (the counter layout's
  "last item" card is the natural source), KOT printing (channel exists, no UI).
- Per-user POS layout (currently per terminal) and a topbar toggle for the layout.

## Working on this repo

- Read this file, then the files a change touches; keep the architecture boundaries above.
- Finish with `npm run verify`; run `npm run test:e2e` for anything that changes the POS, login,
  settings persistence or printing; check Bangla + English and dark + light for UI work.
- The owner asked that work on this project is **not** logged to DevOS and that no session
  records are saved anywhere (this overrides the global DevOS instruction).
