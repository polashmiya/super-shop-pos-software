import type { SqlClient } from '@/types/database';
import type { DeviceStorage, Repositories } from '../types';
import { LocalAuditRepository, LocalNotificationRepository } from './auditRepository';
import { LocalCatalogRepository } from './catalogRepository';
import { LocalCustomerRepository } from './customerRepository';
import { LocalExpenseRepository } from './expenseRepository';
import { LocalInventoryRepository } from './inventoryRepository';
import { LocalProductRepository } from './productRepository';
import { LocalPurchaseRepository } from './purchaseRepository';
import { LocalReportRepository } from './reportRepository';
import { LocalHeldSaleRepository, LocalSaleRepository } from './saleRepository';
import { LocalSettingsRepository } from './settingsRepository';
import { LocalCounterRepository, LocalShiftRepository } from './shiftRepository';
import { LocalSupplierRepository } from './supplierRepository';
import { LocalUserRepository } from './userRepository';

/** Local (offline) data source: SQLite through the SQL client + device storage. */
export function createLocalRepositories(sql: SqlClient, device: DeviceStorage): Repositories {
  return {
    products: new LocalProductRepository(sql),
    catalog: new LocalCatalogRepository(sql),
    inventory: new LocalInventoryRepository(sql),
    sales: new LocalSaleRepository(sql),
    heldSales: new LocalHeldSaleRepository(sql),
    customers: new LocalCustomerRepository(sql),
    suppliers: new LocalSupplierRepository(sql),
    purchases: new LocalPurchaseRepository(sql),
    shifts: new LocalShiftRepository(sql),
    counters: new LocalCounterRepository(sql),
    expenses: new LocalExpenseRepository(sql),
    reports: new LocalReportRepository(sql),
    settings: new LocalSettingsRepository(sql, device),
    users: new LocalUserRepository(sql),
    audit: new LocalAuditRepository(sql),
    notifications: new LocalNotificationRepository(sql),
  };
}

export { createIpcSqlClient } from './sql';

/** In-memory device storage (tests, and a safe fallback). */
export function createMemoryDeviceStorage(initial: Partial<Record<'device' | 'session' | 'posDraft', unknown>> = {}): DeviceStorage {
  const values = new Map<string, unknown>(Object.entries(initial));
  return {
    get: async <T>(key: 'device' | 'session' | 'posDraft') => values.get(key) as T | undefined,
    set: async (key, value) => {
      values.set(key, JSON.parse(JSON.stringify(value ?? null)));
    },
    delete: async (key) => {
      values.delete(key);
    },
  };
}
