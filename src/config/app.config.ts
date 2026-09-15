/* ==========================================================================
   Global application constants.

   Every tunable number or identifier lives here (or in theme.config.ts /
   defaults.ts) so the product can be rebranded, retuned or upgraded without
   hunting through components. The name/version come from package.json and
   are injected at build time.
   ========================================================================== */

declare const __APP_NAME__: string;
declare const __APP_VERSION__: string;
declare const __APP_DESCRIPTION__: string;

export const APP_CONFIG = {
  name: __APP_NAME__,
  version: __APP_VERSION__,
  description: __APP_DESCRIPTION__,

  /** Shown in Settings → About → Developer. */
  developer: {
    name: 'Md. Polash Miya',
    title: 'Software Engineer',
    email: 'polashmiya2015@gmail.com',
  },

  window: {
    width: 1440,
    height: 900,
    minWidth: 1180,
    minHeight: 680,
    backgroundDark: '#0e1116',
    backgroundLight: '#f4f6f9',
  },

  database: {
    fileName: 'supershop.db',
    /** Bump when adding a migration in src/data/schema/migrations.ts. */
    schemaVersion: 1,
    statementCacheSize: 400,
    maxSqlLength: 20_000,
    maxParams: 999,
    maxTransactionStatements: 50_000,
  },

  /** Stable ids of the single demo organisation / branch (multi-branch ready). */
  organization: {
    organizationId: '0b6a1c2e-4f1d-4c3a-9a51-6f0e2d9c0001',
    branchId: '0b6a1c2e-4f1d-4c3a-9a51-6f0e2d9c0002',
  },

  /** Document number formats: PREFIX-YYYYMMDD-#### (unique, from the sequences table). */
  numbering: {
    invoicePrefix: 'INV',
    returnPrefix: 'RET',
    purchasePrefix: 'PO',
    receiptPrefix: 'GRN',
    shiftPrefix: 'SH',
    expensePrefix: 'EXP',
    adjustmentPrefix: 'ADJ',
    customerPrefix: 'CUS',
    supplierPrefix: 'SUP',
    sequenceDigits: 4,
  },

  pos: {
    maxCartLines: 300,
    maxQuantity: 9_999,
    maxWeightedDecimals: 3,
    maxHeldSales: 50,
    searchDebounceMs: 110,
    searchResultLimit: 8,
    quickCashDefaults: [5_000, 10_000, 20_000, 50_000, 100_000, 200_000],
    addedFlashMs: 650,
    draftSaveDebounceMs: 400,
  },

  barcode: {
    scanSpeedMs: 45,
    minLength: 4,
    /** GS1 prefix for Bangladesh, used by generated demo barcodes. */
    gs1CountryPrefix: '841',
  },

  tables: {
    pageSizes: [25, 50, 100] as const,
    defaultPageSize: 25,
    searchDebounceMs: 200,
  },

  reports: {
    topListSize: 10,
    slowMovingDays: 30,
    maxExportRows: 50_000,
  },

  inventory: {
    expiringSoonDays: 7,
  },

  money: {
    /** Minor units per major unit (poisha per taka). */
    minorPerMajor: 100,
    maxAmount: 99_999_999_00,
  },

  print: {
    jobTimeoutMs: 20_000,
    maxHtmlBytes: 6 * 1024 * 1024,
    paper: {
      '80mm': { paperMm: 80, contentMm: 72 },
      '58mm': { paperMm: 58, contentMm: 48 },
    },
    a4: { widthMm: 210, heightMm: 297 },
  },

  backup: {
    format: 'super-shop-pos-backup',
    reminderDays: 7,
    maxImportBytes: 200 * 1024 * 1024,
  },

  auth: {
    pinMinLength: 4,
    pinMaxLength: 6,
    maxFailedAttempts: 5,
    lockoutSeconds: 30,
  },

  ui: {
    toastDurationMs: 2_600,
    toastErrorDurationMs: 4_500,
    maxToasts: 4,
    clockTickMs: 1_000,
    notificationRefreshMs: 5 * 60 * 1_000,
    commandPaletteLimit: 6,
  },

  demo: {
    /** Deterministic generator seed: the same demo data on every reset. */
    seed: 20260910,
    historyDays: 45,
    salesPerDay: { weekday: 26, friday: 38, saturday: 32 },
    customers: 560,
    openShiftCounterCode: 'C03',
  },

  sound: {
    scanHz: 1_850,
    successHz: [880, 1_320],
    errorHz: 220,
  },
} as const;

export type AppConfig = typeof APP_CONFIG;
