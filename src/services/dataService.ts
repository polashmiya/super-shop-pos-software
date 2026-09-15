import { getPlatformAPI } from '@/platform';
import type { AppInfo, DatabaseInfo, ExportResult, ImportPickResult, SaveFileKind } from '@/types';
import { requirePermission } from './context';

/* ==========================================================================
   Backup / restore / demo data / file export — delegated to the main
   process (file dialogs and database replacement happen there).
   ========================================================================== */

export const dataService = {
  exportBackup(): Promise<ExportResult> {
    requirePermission('data.manage');
    return getPlatformAPI().data.exportBackup();
  },
  pickImport(): Promise<ImportPickResult> {
    requirePermission('data.manage');
    return getPlatformAPI().data.pickImport();
  },
  applyImport(token: string) {
    requirePermission('data.manage');
    return getPlatformAPI().data.applyImport(token);
  },
  resetDemo() {
    requirePermission('data.manage');
    return getPlatformAPI().data.resetDemo();
  },
  generateMore() {
    requirePermission('data.manage');
    return getPlatformAPI().data.generateMore();
  },
  clearLocal() {
    requirePermission('data.manage');
    return getPlatformAPI().data.clearLocal();
  },
  /** Saves CSV/JSON exports where the user chooses. */
  saveFile(fileName: string, content: string, kind: SaveFileKind): Promise<ExportResult> {
    return getPlatformAPI().data.saveFile(fileName, content, kind);
  },
  databaseInfo(): Promise<DatabaseInfo> {
    return getPlatformAPI().database.info();
  },
  appInfo(): Promise<AppInfo> {
    return getPlatformAPI().app.getInfo();
  },
  openDataFolder(): Promise<void> {
    return getPlatformAPI().app.openDataFolder();
  },
  relaunch(): Promise<void> {
    return getPlatformAPI().app.relaunch();
  },
};
