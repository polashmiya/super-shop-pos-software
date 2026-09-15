import type { SqlValue } from '@/types/database';

/* ==========================================================================
   SQLite schema migrations.

   Shared by both runtimes: node:sqlite in the Electron main process and
   sqlite-wasm in the browser's database worker. The schema therefore talks
   to a minimal structural interface (SchemaDb) instead of a concrete driver.

   Rules:
   - Never edit a migration that has shipped; add a new one with the next
     version and bump APP_CONFIG.database.schemaVersion.
   - Money columns are INTEGER minor units (poisha); rates are basis points.
   - Timestamps are ISO-8601 UTC strings; business dates are 'yyyy-mm-dd'.
   - Synchronisable entities carry created_at, updated_at, version,
     sync_status and deleted_at (soft delete) for a future backend.
   ========================================================================== */

/** One prepared statement — the subset the migrations need. */
export interface SchemaStatement {
  get(...params: SqlValue[]): unknown;
  run(...params: SqlValue[]): unknown;
}

/** Minimal synchronous database surface the schema needs. */
export interface SchemaDb {
  exec(sql: string): unknown;
  prepare(sql: string): SchemaStatement;
}

export interface Migration {
  version: number;
  name: string;
  sql: string;
}

const META = `
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  sync_status TEXT NOT NULL DEFAULT 'local',
  deleted_at TEXT`;

const V1_INITIAL = `
CREATE TABLE organizations (
  id TEXT PRIMARY KEY,
  name_bn TEXT NOT NULL,
  name_en TEXT NOT NULL,${META}
);

CREATE TABLE branches (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  code TEXT NOT NULL UNIQUE,
  name_bn TEXT NOT NULL,
  name_en TEXT NOT NULL,
  address_bn TEXT NOT NULL DEFAULT '',
  address_en TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  is_active INTEGER NOT NULL DEFAULT 1,${META}
);

CREATE TABLE roles (
  id TEXT PRIMARY KEY,
  name_bn TEXT NOT NULL,
  name_en TEXT NOT NULL,
  is_system INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE permissions (
  id TEXT PRIMARY KEY,
  group_key TEXT NOT NULL
);

CREATE TABLE role_permissions (
  role_id TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id TEXT NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
) WITHOUT ROWID;

CREATE TABLE counters (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL REFERENCES branches(id),
  code TEXT NOT NULL UNIQUE,
  name_bn TEXT NOT NULL,
  name_en TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'closed' CHECK (status IN ('open', 'closed', 'maintenance')),
  assigned_user_id TEXT,${META}
);

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name_bn TEXT NOT NULL,
  name_en TEXT NOT NULL,
  role_id TEXT NOT NULL REFERENCES roles(id),
  pin_hash TEXT NOT NULL,
  pin_salt TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  default_counter_id TEXT REFERENCES counters(id),
  avatar_color TEXT NOT NULL DEFAULT '#1fbf7c',
  preferences TEXT NOT NULL DEFAULT '{}',
  is_active INTEGER NOT NULL DEFAULT 1,
  last_login_at TEXT,${META}
);

CREATE TABLE terminals (
  id TEXT PRIMARY KEY,
  counter_id TEXT NOT NULL REFERENCES counters(id),
  name TEXT NOT NULL,
  last_seen_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE categories (
  id TEXT PRIMARY KEY,
  parent_id TEXT REFERENCES categories(id),
  code TEXT NOT NULL UNIQUE,
  name_bn TEXT NOT NULL,
  name_en TEXT NOT NULL,
  icon TEXT NOT NULL DEFAULT 'Package',
  color TEXT NOT NULL DEFAULT '#64748b',
  image TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,${META}
);

CREATE TABLE brands (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name_bn TEXT NOT NULL,
  name_en TEXT NOT NULL,
  logo TEXT,
  color TEXT NOT NULL DEFAULT '#64748b',
  is_active INTEGER NOT NULL DEFAULT 1,${META}
);

CREATE TABLE units (
  id TEXT PRIMARY KEY,
  name_bn TEXT NOT NULL,
  name_en TEXT NOT NULL,
  short_bn TEXT NOT NULL,
  short_en TEXT NOT NULL,
  allow_decimal INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE suppliers (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  company TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  contact_person TEXT NOT NULL DEFAULT '',
  opening_balance INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  notes TEXT NOT NULL DEFAULT '',
  search_text TEXT NOT NULL DEFAULT '',${META}
);

CREATE TABLE products (
  id TEXT PRIMARY KEY,
  sku TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name_bn TEXT NOT NULL,
  name_en TEXT NOT NULL,
  description_bn TEXT NOT NULL DEFAULT '',
  description_en TEXT NOT NULL DEFAULT '',
  category_id TEXT NOT NULL REFERENCES categories(id),
  subcategory_id TEXT REFERENCES categories(id),
  brand_id TEXT REFERENCES brands(id),
  unit_id TEXT NOT NULL REFERENCES units(id),
  supplier_id TEXT REFERENCES suppliers(id),
  purchase_price INTEGER NOT NULL CHECK (purchase_price >= 0),
  selling_price INTEGER NOT NULL CHECK (selling_price >= 0),
  mrp INTEGER CHECK (mrp IS NULL OR mrp >= 0),
  discount_type TEXT CHECK (discount_type IS NULL OR discount_type IN ('percent', 'fixed')),
  discount_value INTEGER NOT NULL DEFAULT 0 CHECK (discount_value >= 0),
  tax_rate INTEGER NOT NULL DEFAULT 0 CHECK (tax_rate >= 0 AND tax_rate <= 10000),
  min_stock REAL NOT NULL DEFAULT 0,
  max_stock REAL NOT NULL DEFAULT 0,
  image TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  featured INTEGER NOT NULL DEFAULT 0,
  weighted INTEGER NOT NULL DEFAULT 0,
  expiry_date TEXT,
  search_text TEXT NOT NULL DEFAULT '',${META}
);

CREATE TABLE product_barcodes (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  barcode TEXT NOT NULL UNIQUE,
  is_primary INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE price_history (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  field TEXT NOT NULL CHECK (field IN ('selling_price', 'purchase_price', 'mrp')),
  old_value INTEGER,
  new_value INTEGER,
  changed_by TEXT,
  changed_by_name TEXT,
  changed_at TEXT NOT NULL,
  reason TEXT NOT NULL DEFAULT ''
);

CREATE TABLE customers (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  customer_type TEXT NOT NULL DEFAULT 'regular' CHECK (customer_type IN ('walk_in', 'regular', 'vip', 'wholesale')),
  loyalty_points INTEGER NOT NULL DEFAULT 0,
  total_spent INTEGER NOT NULL DEFAULT 0,
  total_orders INTEGER NOT NULL DEFAULT 0,
  discount_rate INTEGER NOT NULL DEFAULT 0 CHECK (discount_rate >= 0 AND discount_rate <= 10000),
  notes TEXT NOT NULL DEFAULT '',
  is_active INTEGER NOT NULL DEFAULT 1,
  last_purchase_at TEXT,
  search_text TEXT NOT NULL DEFAULT '',${META}
);

CREATE TABLE customer_loyalty_transactions (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customers(id),
  sale_id TEXT,
  invoice_no TEXT,
  type TEXT NOT NULL CHECK (type IN ('earn', 'redeem', 'adjust', 'reverse')),
  points INTEGER NOT NULL,
  balance_after INTEGER NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  user_id TEXT,
  user_name TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE cash_sessions (
  id TEXT PRIMARY KEY,
  shift_no TEXT NOT NULL UNIQUE,
  counter_id TEXT NOT NULL REFERENCES counters(id),
  branch_id TEXT NOT NULL REFERENCES branches(id),
  opened_by TEXT NOT NULL REFERENCES users(id),
  opened_by_name TEXT NOT NULL,
  closed_by TEXT,
  closed_by_name TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  opening_cash INTEGER NOT NULL DEFAULT 0 CHECK (opening_cash >= 0),
  closing_totals TEXT,
  actual_cash INTEGER,
  difference INTEGER,
  note TEXT NOT NULL DEFAULT '',
  opened_at TEXT NOT NULL,
  closed_at TEXT,${META}
);

CREATE TABLE sales (
  id TEXT PRIMARY KEY,
  invoice_no TEXT NOT NULL UNIQUE,
  branch_id TEXT NOT NULL REFERENCES branches(id),
  counter_id TEXT NOT NULL REFERENCES counters(id),
  counter_name TEXT NOT NULL DEFAULT '',
  shift_id TEXT REFERENCES cash_sessions(id),
  cashier_id TEXT NOT NULL REFERENCES users(id),
  cashier_name TEXT NOT NULL,
  customer_id TEXT REFERENCES customers(id),
  customer_name TEXT NOT NULL DEFAULT '',
  customer_phone TEXT NOT NULL DEFAULT '',
  customer_type TEXT,
  status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('completed', 'partially_returned', 'returned', 'cancelled')),
  language TEXT NOT NULL DEFAULT 'bn' CHECK (language IN ('bn', 'en')),
  currency_code TEXT NOT NULL DEFAULT 'BDT',
  item_count INTEGER NOT NULL,
  total_quantity REAL NOT NULL,
  subtotal INTEGER NOT NULL,
  item_discount_total INTEGER NOT NULL DEFAULT 0,
  order_discount_total INTEGER NOT NULL DEFAULT 0,
  discount_total INTEGER NOT NULL DEFAULT 0,
  discount_reason TEXT NOT NULL DEFAULT '',
  discount_approved_by TEXT,
  tax_total INTEGER NOT NULL DEFAULT 0,
  tax_mode TEXT NOT NULL DEFAULT 'exclusive' CHECK (tax_mode IN ('exclusive', 'inclusive')),
  rounding_adjustment INTEGER NOT NULL DEFAULT 0,
  grand_total INTEGER NOT NULL CHECK (grand_total >= 0),
  paid_total INTEGER NOT NULL,
  change_due INTEGER NOT NULL DEFAULT 0,
  returned_total INTEGER NOT NULL DEFAULT 0,
  points_earned INTEGER NOT NULL DEFAULT 0,
  points_redeemed INTEGER NOT NULL DEFAULT 0,
  payment_summary TEXT NOT NULL DEFAULT 'cash',
  note TEXT NOT NULL DEFAULT '',
  cancelled_at TEXT,
  cancelled_by TEXT,
  cancel_reason TEXT NOT NULL DEFAULT '',${META}
);

CREATE TABLE sale_items (
  id TEXT PRIMARY KEY,
  sale_id TEXT NOT NULL REFERENCES sales(id),
  line_no INTEGER NOT NULL,
  product_id TEXT NOT NULL REFERENCES products(id),
  sku TEXT NOT NULL,
  barcode TEXT NOT NULL DEFAULT '',
  name_bn TEXT NOT NULL,
  name_en TEXT NOT NULL,
  unit_id TEXT NOT NULL,
  quantity REAL NOT NULL CHECK (quantity > 0),
  unit_price INTEGER NOT NULL CHECK (unit_price >= 0),
  original_price INTEGER NOT NULL,
  mrp INTEGER,
  cost_price INTEGER NOT NULL DEFAULT 0,
  discount_type TEXT,
  discount_value INTEGER NOT NULL DEFAULT 0,
  discount_amount INTEGER NOT NULL DEFAULT 0,
  order_discount_amount INTEGER NOT NULL DEFAULT 0,
  tax_rate INTEGER NOT NULL DEFAULT 0,
  tax_amount INTEGER NOT NULL DEFAULT 0,
  line_subtotal INTEGER NOT NULL,
  line_total INTEGER NOT NULL,
  returned_quantity REAL NOT NULL DEFAULT 0,
  note TEXT NOT NULL DEFAULT '',
  price_overridden INTEGER NOT NULL DEFAULT 0,
  override_by TEXT,
  override_reason TEXT NOT NULL DEFAULT ''
);

CREATE TABLE payments (
  id TEXT PRIMARY KEY,
  sale_id TEXT NOT NULL REFERENCES sales(id),
  shift_id TEXT,
  counter_id TEXT,
  method TEXT NOT NULL CHECK (method IN ('cash', 'card', 'mobile', 'points')),
  provider TEXT,
  amount INTEGER NOT NULL CHECK (amount >= 0),
  tendered INTEGER NOT NULL,
  change_amount INTEGER NOT NULL DEFAULT 0,
  reference TEXT NOT NULL DEFAULT '',
  points INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE returns (
  id TEXT PRIMARY KEY,
  return_no TEXT NOT NULL UNIQUE,
  sale_id TEXT NOT NULL REFERENCES sales(id),
  invoice_no TEXT NOT NULL,
  shift_id TEXT REFERENCES cash_sessions(id),
  counter_id TEXT NOT NULL,
  cashier_id TEXT NOT NULL,
  cashier_name TEXT NOT NULL,
  customer_id TEXT,
  reason TEXT NOT NULL DEFAULT '',
  refund_method TEXT NOT NULL CHECK (refund_method IN ('cash', 'card', 'mobile', 'store_credit')),
  refund_total INTEGER NOT NULL CHECK (refund_total >= 0),
  tax_total INTEGER NOT NULL DEFAULT 0,
  approved_by TEXT,
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  sync_status TEXT NOT NULL DEFAULT 'local'
);

CREATE TABLE return_items (
  id TEXT PRIMARY KEY,
  return_id TEXT NOT NULL REFERENCES returns(id),
  sale_item_id TEXT NOT NULL REFERENCES sale_items(id),
  product_id TEXT NOT NULL,
  name_bn TEXT NOT NULL,
  name_en TEXT NOT NULL,
  quantity REAL NOT NULL CHECK (quantity > 0),
  unit_price INTEGER NOT NULL,
  refund_amount INTEGER NOT NULL,
  tax_amount INTEGER NOT NULL DEFAULT 0,
  restock INTEGER NOT NULL DEFAULT 1,
  condition TEXT NOT NULL DEFAULT 'good' CHECK (condition IN ('good', 'damaged'))
);

CREATE TABLE stock_balances (
  product_id TEXT PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,
  quantity REAL NOT NULL DEFAULT 0,
  avg_cost INTEGER NOT NULL DEFAULT 0,
  last_movement_at TEXT,
  updated_at TEXT NOT NULL
) WITHOUT ROWID;

CREATE TABLE stock_movements (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id),
  type TEXT NOT NULL CHECK (type IN ('opening', 'purchase', 'sale', 'return', 'damage', 'adjustment', 'transfer_in', 'transfer_out', 'cancel')),
  quantity REAL NOT NULL,
  balance_after REAL NOT NULL,
  unit_cost INTEGER NOT NULL DEFAULT 0,
  reference_type TEXT,
  reference_id TEXT,
  reference_no TEXT,
  reason TEXT,
  note TEXT NOT NULL DEFAULT '',
  user_id TEXT,
  user_name TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE purchases (
  id TEXT PRIMARY KEY,
  po_no TEXT NOT NULL UNIQUE,
  supplier_id TEXT NOT NULL REFERENCES suppliers(id),
  supplier_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'ordered', 'partially_received', 'received', 'cancelled')),
  order_date TEXT NOT NULL,
  expected_date TEXT,
  subtotal INTEGER NOT NULL DEFAULT 0,
  discount_total INTEGER NOT NULL DEFAULT 0,
  tax_total INTEGER NOT NULL DEFAULT 0,
  grand_total INTEGER NOT NULL DEFAULT 0,
  paid_amount INTEGER NOT NULL DEFAULT 0,
  note TEXT NOT NULL DEFAULT '',
  created_by TEXT,
  created_by_name TEXT,
  received_at TEXT,
  item_count INTEGER NOT NULL DEFAULT 0,${META}
);

CREATE TABLE purchase_items (
  id TEXT PRIMARY KEY,
  purchase_id TEXT NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL REFERENCES products(id),
  name_bn TEXT NOT NULL,
  name_en TEXT NOT NULL,
  sku TEXT NOT NULL,
  quantity REAL NOT NULL CHECK (quantity > 0),
  received_quantity REAL NOT NULL DEFAULT 0,
  unit_cost INTEGER NOT NULL CHECK (unit_cost >= 0),
  discount_amount INTEGER NOT NULL DEFAULT 0,
  tax_rate INTEGER NOT NULL DEFAULT 0,
  tax_amount INTEGER NOT NULL DEFAULT 0,
  line_total INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE goods_receipts (
  id TEXT PRIMARY KEY,
  grn_no TEXT NOT NULL UNIQUE,
  purchase_id TEXT NOT NULL REFERENCES purchases(id),
  received_by TEXT,
  received_by_name TEXT,
  received_at TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT ''
);

CREATE TABLE goods_receipt_items (
  id TEXT PRIMARY KEY,
  receipt_id TEXT NOT NULL REFERENCES goods_receipts(id) ON DELETE CASCADE,
  purchase_item_id TEXT NOT NULL REFERENCES purchase_items(id),
  product_id TEXT NOT NULL,
  quantity REAL NOT NULL CHECK (quantity > 0),
  unit_cost INTEGER NOT NULL
);

CREATE TABLE supplier_payments (
  id TEXT PRIMARY KEY,
  supplier_id TEXT NOT NULL REFERENCES suppliers(id),
  purchase_id TEXT REFERENCES purchases(id),
  amount INTEGER NOT NULL CHECK (amount > 0),
  method TEXT NOT NULL,
  reference TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  user_id TEXT,
  paid_at TEXT NOT NULL
);

CREATE TABLE cash_movements (
  id TEXT PRIMARY KEY,
  shift_id TEXT NOT NULL REFERENCES cash_sessions(id),
  counter_id TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('opening', 'sale', 'refund', 'expense', 'cash_in', 'cash_out', 'closing')),
  amount INTEGER NOT NULL,
  reference_type TEXT,
  reference_id TEXT,
  reference_no TEXT,
  note TEXT NOT NULL DEFAULT '',
  user_id TEXT,
  user_name TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE expense_categories (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name_bn TEXT NOT NULL,
  name_en TEXT NOT NULL,
  icon TEXT NOT NULL DEFAULT 'Receipt',
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE expenses (
  id TEXT PRIMARY KEY,
  expense_no TEXT NOT NULL UNIQUE,
  category_id TEXT NOT NULL REFERENCES expense_categories(id),
  amount INTEGER NOT NULL CHECK (amount > 0),
  description TEXT NOT NULL DEFAULT '',
  expense_date TEXT NOT NULL,
  paid_from TEXT NOT NULL DEFAULT 'cash_drawer' CHECK (paid_from IN ('cash_drawer', 'office')),
  shift_id TEXT REFERENCES cash_sessions(id),
  counter_id TEXT,
  user_id TEXT,
  user_name TEXT,
  approved_by TEXT,
  approved_by_name TEXT,
  status TEXT NOT NULL DEFAULT 'approved' CHECK (status IN ('pending', 'approved', 'rejected')),${META}
);

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT
) WITHOUT ROWID;

CREATE TABLE held_sales (
  id TEXT PRIMARY KEY,
  hold_no INTEGER NOT NULL,
  counter_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  user_name TEXT NOT NULL,
  customer_id TEXT,
  customer_name TEXT NOT NULL DEFAULT '',
  label TEXT NOT NULL DEFAULT '',
  payload TEXT NOT NULL,
  item_count INTEGER NOT NULL DEFAULT 0,
  total INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE audit_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  user_name TEXT,
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id TEXT,
  details TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE TABLE notifications (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'info',
  title_key TEXT NOT NULL,
  message_key TEXT NOT NULL,
  params TEXT NOT NULL DEFAULT '{}',
  entity TEXT,
  entity_id TEXT,
  is_read INTEGER NOT NULL DEFAULT 0,
  dedupe_key TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
);

CREATE TABLE sequences (
  key TEXT PRIMARY KEY,
  value INTEGER NOT NULL
) WITHOUT ROWID;

-- Indexes -----------------------------------------------------------------
CREATE INDEX ix_products_name_en ON products(name_en COLLATE NOCASE);
CREATE INDEX ix_products_name_bn ON products(name_bn);
CREATE INDEX ix_products_category ON products(category_id, status);
CREATE INDEX ix_products_brand ON products(brand_id);
CREATE INDEX ix_products_supplier ON products(supplier_id);
CREATE INDEX ix_product_barcodes_product ON product_barcodes(product_id);
CREATE INDEX ix_price_history_product ON price_history(product_id, changed_at);
CREATE INDEX ix_categories_parent ON categories(parent_id, sort_order);
CREATE UNIQUE INDEX ux_customers_phone ON customers(phone) WHERE phone <> '' AND deleted_at IS NULL;
CREATE INDEX ix_customers_name ON customers(name COLLATE NOCASE);
CREATE INDEX ix_loyalty_customer ON customer_loyalty_transactions(customer_id, created_at);
CREATE UNIQUE INDEX ux_cash_sessions_open_counter ON cash_sessions(counter_id) WHERE status = 'open';
CREATE INDEX ix_cash_sessions_opened ON cash_sessions(opened_at);
CREATE INDEX ix_sales_created ON sales(created_at);
CREATE INDEX ix_sales_cashier ON sales(cashier_id, created_at);
CREATE INDEX ix_sales_customer ON sales(customer_id, created_at);
CREATE INDEX ix_sales_shift ON sales(shift_id);
CREATE INDEX ix_sales_counter ON sales(counter_id, created_at);
CREATE INDEX ix_sale_items_sale ON sale_items(sale_id);
CREATE INDEX ix_sale_items_product ON sale_items(product_id);
CREATE INDEX ix_payments_sale ON payments(sale_id);
CREATE INDEX ix_payments_method ON payments(method, created_at);
CREATE INDEX ix_payments_shift ON payments(shift_id);
CREATE INDEX ix_returns_sale ON returns(sale_id);
CREATE INDEX ix_returns_created ON returns(created_at);
CREATE INDEX ix_returns_shift ON returns(shift_id);
CREATE INDEX ix_return_items_return ON return_items(return_id);
CREATE INDEX ix_return_items_sale_item ON return_items(sale_item_id);
CREATE INDEX ix_stock_movements_product ON stock_movements(product_id, created_at);
CREATE INDEX ix_stock_movements_created ON stock_movements(created_at);
CREATE INDEX ix_stock_movements_type ON stock_movements(type, created_at);
CREATE INDEX ix_purchases_supplier ON purchases(supplier_id, order_date);
CREATE INDEX ix_purchases_status ON purchases(status);
CREATE INDEX ix_purchase_items_purchase ON purchase_items(purchase_id);
CREATE INDEX ix_purchase_items_product ON purchase_items(product_id);
CREATE INDEX ix_goods_receipts_purchase ON goods_receipts(purchase_id);
CREATE INDEX ix_supplier_payments_supplier ON supplier_payments(supplier_id);
CREATE INDEX ix_cash_movements_shift ON cash_movements(shift_id, created_at);
CREATE INDEX ix_expenses_date ON expenses(expense_date);
CREATE INDEX ix_expenses_shift ON expenses(shift_id);
CREATE INDEX ix_held_sales_counter ON held_sales(counter_id, created_at);
CREATE INDEX ix_audit_created ON audit_logs(created_at);
CREATE INDEX ix_audit_entity ON audit_logs(entity, entity_id);
CREATE INDEX ix_notifications_created ON notifications(is_read, created_at);
`;

export const MIGRATIONS: readonly Migration[] = [{ version: 1, name: 'initial schema', sql: V1_INITIAL }];

export const LATEST_SCHEMA_VERSION = MIGRATIONS[MIGRATIONS.length - 1].version;

/**
 * Applies connection-level settings. Call right after opening the database.
 * `wal` is off for in-memory databases (tests) and for the browser's OPFS
 * storage, neither of which supports a write-ahead log.
 */
export function configureConnection(db: SchemaDb, { wal = true } = {}): void {
  if (wal) {
    db.exec('PRAGMA journal_mode = WAL');
    db.exec('PRAGMA synchronous = NORMAL');
  }
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('PRAGMA busy_timeout = 5000');
  db.exec('PRAGMA temp_store = MEMORY');
  db.exec('PRAGMA cache_size = -16000');
}

export function getSchemaVersion(db: SchemaDb): number {
  db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL)');
  const row = db.prepare('SELECT MAX(version) AS version FROM schema_migrations').get() as { version: number | null } | undefined;
  return row?.version ?? 0;
}

/**
 * Runs every pending migration inside its own transaction. Returns the
 * schema version afterwards. Throws when the database is newer than the app.
 */
export function migrate(db: SchemaDb): number {
  let current = getSchemaVersion(db);
  if (current > LATEST_SCHEMA_VERSION) {
    throw new Error(`Database schema ${current} is newer than this application (${LATEST_SCHEMA_VERSION}).`);
  }
  for (const migration of MIGRATIONS) {
    if (migration.version <= current) continue;
    db.exec('BEGIN IMMEDIATE');
    try {
      db.exec(migration.sql);
      db.prepare('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)').run(
        migration.version,
        migration.name,
        new Date().toISOString(),
      );
      db.exec('COMMIT');
      current = migration.version;
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }
  return current;
}

/** Business tables in dependency order (parents first) — used by backup/restore/reset. */
export const DATA_TABLES = [
  'organizations',
  'branches',
  'roles',
  'permissions',
  'role_permissions',
  'counters',
  'users',
  'terminals',
  'categories',
  'brands',
  'units',
  'suppliers',
  'products',
  'product_barcodes',
  'price_history',
  'customers',
  'customer_loyalty_transactions',
  'cash_sessions',
  'sales',
  'sale_items',
  'payments',
  'returns',
  'return_items',
  'stock_balances',
  'stock_movements',
  'purchases',
  'purchase_items',
  'goods_receipts',
  'goods_receipt_items',
  'supplier_payments',
  'cash_movements',
  'expense_categories',
  'expenses',
  'settings',
  'held_sales',
  'audit_logs',
  'notifications',
  'sequences',
] as const;

export type DataTable = (typeof DATA_TABLES)[number];
