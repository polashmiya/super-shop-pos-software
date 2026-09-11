import type {
  AppInfo,
  CartDraft,
  DatabaseInfo,
  DeviceSettings,
  ExportResult,
  ImportPickResult,
  PrinterInfo,
  PrintJobOptions,
  PrintResult,
  SaveFileKind,
  SavePdfOptions,
  SessionState,
  SqlRow,
  SqlRunResult,
  SqlStatement,
  SqlTransactionResult,
  SqlValue,
  ThemeMode,
} from '../../src/types';

/** Values stored per device in electron-store. */
export interface DeviceStoreSchema {
  device: DeviceSettings;
  session: SessionState;
  posDraft: CartDraft | null;
}

export interface SeedResult {
  ok: boolean;
  products?: number;
  customers?: number;
  sales?: number;
  reason?: string;
}

/**
 * The complete API exposed to the renderer on window.electronAPI by the
 * sandboxed preload script. Nothing else from Node/Electron is reachable.
 */
export interface ElectronAPI {
  store: {
    get<K extends keyof DeviceStoreSchema>(key: K): Promise<DeviceStoreSchema[K] | undefined>;
    set<K extends keyof DeviceStoreSchema>(key: K, value: DeviceStoreSchema[K]): Promise<void>;
    delete(key: keyof DeviceStoreSchema): Promise<void>;
  };
  database: {
    query(sql: string, params?: readonly SqlValue[]): Promise<SqlRow[]>;
    get(sql: string, params?: readonly SqlValue[]): Promise<SqlRow | null>;
    run(sql: string, params?: readonly SqlValue[]): Promise<SqlRunResult>;
    transaction(statements: readonly SqlStatement[]): Promise<SqlTransactionResult[]>;
    info(): Promise<DatabaseInfo>;
  };
  printer: {
    printReceipt(html: string, options: PrintJobOptions): Promise<PrintResult>;
    printReport(html: string, options: PrintJobOptions): Promise<PrintResult>;
    printKOT(html: string, options: PrintJobOptions): Promise<PrintResult>;
    savePdf(html: string, options: SavePdfOptions): Promise<ExportResult>;
    getPrinters(): Promise<PrinterInfo[]>;
  };
  data: {
    exportBackup(): Promise<ExportResult>;
    pickImport(): Promise<ImportPickResult>;
    applyImport(token: string): Promise<{ ok: boolean; reason?: string }>;
    saveFile(fileName: string, content: string, kind: SaveFileKind): Promise<ExportResult>;
    resetDemo(): Promise<SeedResult>;
    generateMore(): Promise<SeedResult>;
    clearLocal(): Promise<SeedResult>;
  };
  app: {
    getVersion(): Promise<string>;
    getInfo(): Promise<AppInfo>;
    setNativeTheme(theme: ThemeMode): Promise<void>;
    toggleFullscreen(): Promise<boolean>;
    openDataFolder(): Promise<void>;
    relaunch(): Promise<void>;
    quit(): Promise<void>;
  };
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}
