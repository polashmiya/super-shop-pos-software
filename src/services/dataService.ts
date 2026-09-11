import { getElectronAPI } from '@/platform/electron';
import type { AppInfo, DatabaseInfo, ExportResult, ImportPickResult, SaveFileKind } from '@/types';
import { requirePermission } from './context';

/* ==========================================================================
   Backup / restore / demo data / file export — delegated to the main
   process (file dialogs and database replacement happen there).
   ========================================================================== */

export const dataService = {
  exportBackup(): Promise<ExportResult> {
    requirePermission('data.manage');
    return getElectronAPI().data.exportBackup();
  },
  pickImport(): Promise<ImportPickResult> {
    requirePermission('data.manage');
    return getElectronAPI().data.pickImport();
  },
  applyImport(token: string) {
    requirePermission('data.manage');
    return getElectronAPI().data.applyImport(token);
  },
  resetDemo() {
    requirePermission('data.manage');
    return getElectronAPI().data.resetDemo();
  },
  generateMore() {
    requirePermission('data.manage');
    return getElectronAPI().data.generateMore();
  },
  clearLocal() {
    requirePermission('data.manage');
    return getElectronAPI().data.clearLocal();
  },
  /** Saves CSV/JSON exports where the user chooses. */
  saveFile(fileName: string, content: string, kind: SaveFileKind): Promise<ExportResult> {
    return getElectronAPI().data.saveFile(fileName, content, kind);
  },
  databaseInfo(): Promise<DatabaseInfo> {
    return getElectronAPI().database.info();
  },
  appInfo(): Promise<AppInfo> {
    return getElectronAPI().app.getInfo();
  },
  openDataFolder(): Promise<void> {
    return getElectronAPI().app.openDataFolder();
  },
  relaunch(): Promise<void> {
    return getElectronAPI().app.relaunch();
  },
};
