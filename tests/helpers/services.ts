import { DEFAULT_DEVICE_SETTINGS } from '@/config/defaults';
import type { Permission } from '@/config/permissions';
import { DEMO_COUNTERS, DEMO_TERMINAL_COUNTER_ID, DEMO_USERS } from '@/data/seed/demoUsers';
import { newId } from '@/domain/ids';
import { setRepositories } from '@/repositories';
import { createLocalRepositories, createMemoryDeviceStorage } from '@/repositories/local';
import type { Repositories } from '@/repositories/types';
import { setServiceContext } from '@/services/context';
import { lineFromProduct } from '@/services/pricingService';
import type { BusinessSettings, CartDraft, CartLine, Customer, DeviceSettings, Language, PaymentEntry, Product, Shift, User } from '@/types';
import type { SqlValue } from '@/types/database';
import { createTestDatabase, type TestDatabase } from './db';

/* ==========================================================================
   Service-test harness: a seeded in-memory database, the real local
   repositories and a controllable service context (user, permissions,
   settings, terminal counter and clock).
   ========================================================================== */

/** A POS-like fixed clock: Thursday 10 Sep 2026, 15:30 in Dhaka. */
export const SERVICE_TEST_NOW = new Date('2026-09-10T15:30:00+06:00');

export type DemoUsername = 'rahim' | 'nusrat' | 'karim' | 'sadia' | 'hasan';

export const COUNTER_ID = Object.fromEntries(DEMO_COUNTERS.map((counter) => [counter.code, counter.id])) as Record<'C01' | 'C02' | 'C03' | 'C04', string>;

export function demoUser(username: DemoUsername) {
  const user = DEMO_USERS.find((entry) => entry.username === username);
  if (!user) throw new Error(`Unknown demo user ${username}`);
  return user;
}

export interface ProductFilter {
  minStock?: number;
  weighted?: boolean;
  withDiscount?: boolean;
  taxed?: boolean;
}

export interface ServiceHarness {
  readonly database: TestDatabase;
  readonly repos: Repositories;
  business: BusinessSettings;
  device: DeviceSettings;
  language: Language;
  now: Date;
  user: User | null;
  permissions: Set<Permission>;
  /** Re-installs this harness' repositories and context (the registries are global). */
  install(): void;
  signIn(username: DemoUsername): Promise<User>;
  signOut(): void;
  /** Replaces the permission set of the signed-in user (e.g. to remove one). */
  setPermissions(permissions: Iterable<Permission>): void;
  withoutPermission(permission: Permission): void;
  useCounter(counterId: string): void;
  advance(ms: number): Date;
  /** Distinct active products, deterministic (by SKU); never returns the same product twice. */
  takeProducts(count: number, filter?: ProductFilter): Promise<Product[]>;
  takeProduct(filter?: ProductFilter): Promise<Product>;
  product(id: string): Promise<Product>;
  stockOf(productId: string): number;
  openShift(counterId?: string): Promise<Shift>;
  /** Σ of the shift's cash ledger (everything but the closing count). */
  cashLedger(shiftId: string): number;
  one<T>(sql: string, params?: SqlValue[]): T;
  query<T>(sql: string, params?: SqlValue[]): T[];
  count(sql: string, params?: SqlValue[]): number;
}

export async function createServiceHarness(options: { now?: Date; user?: DemoUsername; seed?: 'demo' | 'empty' } = {}): Promise<ServiceHarness> {
  const database = createTestDatabase({ seed: options.seed ?? 'demo', now: options.now ?? SERVICE_TEST_NOW });
  const repositories = createLocalRepositories(database.sql, createMemoryDeviceStorage());
  const business = await repositories.settings.getBusiness();
  const device = structuredClone(DEFAULT_DEVICE_SETTINGS);
  device.terminal.counterId = DEMO_TERMINAL_COUNTER_ID;
  const used = new Set<string>();

  const harness: ServiceHarness = {
    database,
    repos: repositories,
    business,
    device,
    language: 'bn',
    now: new Date((options.now ?? SERVICE_TEST_NOW).getTime()),
    user: null,
    permissions: new Set(),

    install() {
      setRepositories(repositories);
      setServiceContext({
        user: () => harness.user,
        can: (permission) => harness.user !== null && harness.permissions.has(permission),
        business: () => harness.business,
        device: () => harness.device,
        language: () => harness.language,
        now: () => new Date(harness.now.getTime()),
      });
    },

    async signIn(username) {
      const user = await repositories.users.getById(demoUser(username).id);
      if (!user) throw new Error(`Demo user ${username} missing from the seed`);
      const matrix = await repositories.users.rolePermissions();
      harness.user = user;
      harness.permissions = new Set(matrix[user.roleId]);
      return user;
    },

    signOut() {
      harness.user = null;
      harness.permissions = new Set();
    },

    setPermissions(permissions) {
      harness.permissions = new Set(permissions);
    },

    withoutPermission(permission) {
      harness.permissions.delete(permission);
    },

    useCounter(counterId) {
      harness.device = { ...harness.device, terminal: { ...harness.device.terminal, counterId } };
    },

    advance(ms) {
      harness.now = new Date(harness.now.getTime() + ms);
      return harness.now;
    },

    async takeProducts(count, filter = {}) {
      const products = (await repositories.products.getAll())
        .filter(
          (product) =>
            product.status === 'active' &&
            !used.has(product.id) &&
            product.barcode !== '' &&
            product.stock >= (filter.minStock ?? 5) &&
            product.weighted === (filter.weighted ?? false) &&
            (filter.withDiscount === undefined || (product.discount !== null) === filter.withDiscount) &&
            (filter.taxed === undefined || product.taxRate > 0 === filter.taxed),
        )
        .sort((a, b) => a.sku.localeCompare(b.sku));
      if (products.length < count) throw new Error(`Only ${products.length} products match ${JSON.stringify(filter)}`);
      const picked = products.slice(0, count);
      for (const product of picked) used.add(product.id);
      return picked;
    },

    async takeProduct(filter) {
      const [product] = await harness.takeProducts(1, filter);
      return product;
    },

    async product(id) {
      const product = await repositories.products.getById(id);
      if (!product) throw new Error(`Product ${id} not found`);
      return product;
    },

    stockOf(productId) {
      return database.one<{ quantity: number } | undefined>('SELECT quantity FROM stock_balances WHERE product_id = ?', [productId])?.quantity ?? 0;
    },

    async openShift(counterId = harness.device.terminal.counterId) {
      const shift = await repositories.shifts.getOpenShift(counterId);
      if (!shift) throw new Error(`No open shift on counter ${counterId}`);
      return shift;
    },

    cashLedger(shiftId) {
      return database.one<{ total: number }>("SELECT COALESCE(SUM(amount), 0) AS total FROM cash_movements WHERE shift_id = ? AND type <> 'closing'", [shiftId]).total;
    },

    one: <T>(sql: string, params: SqlValue[] = []) => database.one<T>(sql, params),
    query: <T>(sql: string, params: SqlValue[] = []) => database.query<T>(sql, params),
    count: (sql: string, params: SqlValue[] = []) => Number(Object.values(database.one<Record<string, number>>(sql, params))[0] ?? 0),
  };

  harness.install();
  if (options.user) await harness.signIn(options.user);
  return harness;
}

/* ----------------------------- cart helpers ------------------------------ */

export function cartOf(entries: Array<[Product, number]>, extra: Partial<CartDraft> = {}): CartDraft {
  const lines: CartLine[] = entries.map(([product, quantity]) => lineFromProduct(product, quantity));
  return { lines, customerId: null, orderDiscount: null, note: '', ...extra };
}

export function payCash(amount: number): PaymentEntry {
  return { id: newId(), method: 'cash', provider: null, amount, reference: '' };
}

export function payCard(amount: number, reference = '4242'): PaymentEntry {
  return { id: newId(), method: 'card', provider: 'visa', amount, reference };
}

export function payMobile(amount: number, provider: 'bkash' | 'nagad' | 'rocket' = 'bkash', reference = 'TX123'): PaymentEntry {
  return { id: newId(), method: 'mobile', provider, amount, reference };
}

export function payPoints(amount: number, pointValue: number): PaymentEntry {
  return { id: newId(), method: 'points', provider: null, amount, reference: '', points: Math.floor(amount / pointValue) };
}

/** A seeded customer with a phone and enough points to redeem, deterministic by code. */
export async function takeCustomer(harness: ServiceHarness, minPoints = 0, used: Set<string> = new Set()): Promise<Customer> {
  const rows = harness.query<{ id: string }>(
    "SELECT id FROM customers WHERE deleted_at IS NULL AND is_active = 1 AND phone <> '' AND customer_type = 'regular' AND discount_rate = 0 AND loyalty_points >= ? ORDER BY code",
    [minPoints],
  );
  const row = rows.find((entry) => !used.has(entry.id));
  if (!row) throw new Error('No matching customer in the seed');
  used.add(row.id);
  const customer = await harness.repos.customers.getById(row.id);
  if (!customer) throw new Error('Customer vanished');
  return customer;
}

/** Captures the AppError code of a rejected promise (or throws when it resolves). */
export async function errorCode(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error) return String((error as { code: unknown }).code);
    throw error;
  }
  throw new Error('Expected the call to fail');
}
