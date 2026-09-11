import type { ElectronAPI } from '../../electron/types/electron';
import { AppError } from '@/domain/errors';

/* ==========================================================================
   The only module that touches window.electronAPI. Everything else talks to
   repositories/services, so the renderer stays platform-agnostic.
   ========================================================================== */

export type { ElectronAPI, DeviceStoreSchema, SeedResult } from '../../electron/types/electron';

export function hasElectronAPI(): boolean {
  return typeof window !== 'undefined' && window.electronAPI !== undefined;
}

export function getElectronAPI(): ElectronAPI {
  const api = typeof window !== 'undefined' ? window.electronAPI : undefined;
  if (!api) throw new AppError('desktopOnly');
  return api;
}
