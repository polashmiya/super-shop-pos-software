import { APP_CONFIG } from '@/config/app.config';
import { DEFAULT_BUSINESS_SETTINGS } from '@/config/defaults';
import { addDays, startOfDay, toLocalDate } from '@/domain/dates';
import { createRandom, stableId } from '@/domain/ids';
import { roundQuantity } from '@/domain/money';
import { normalizeSearch } from '@/domain/text';
import type { CustomerType } from '@/types/people';
import { seedBaseData, type PinHasher } from './baseData';
import { expandCatalog } from './catalogExpand';
import { generateCustomers, type SeedCustomer } from './customers';
import { DEMO_COUNTERS, DEMO_USERS } from './demoUsers';
import { insertRow, meta, type SeedExecutor } from './executor';
import { runHistory, seedHeldSales, type SimProduct } from './history';

/* ==========================================================================
   Seed orchestration.

   - seedDatabase(db, { mode: 'demo' })  → base data + full demo history
   - seedDatabase(db, { mode: 'empty' }) → base data only (clear local data)
   - extendDemoData(db)                  → "Generate more demo data": adds
     customers and continues the sales history up to now.
   ========================================================================== */

export interface SeedOptions {
  mode: 'demo' | 'empty';
  hashPin: PinHasher;
  now?: Date;
}

export interface SeedSummary {
  products: number;
  customers: number;
  sales: number;
  openShifts: number;
}

const HOUR = 3_600_000;

function inTransaction<T>(db: SeedExecutor, work: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = work();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    try {
      db.exec('ROLLBACK');
    } catch {
      // Already rolled back.
    }
    throw error;
  }
}

function insertCustomers(db: SeedExecutor, customers: SeedCustomer[]): void {
  for (const customer of customers) {
    insertRow(db, 'customers', {
      id: customer.id,
      code: customer.code,
      name: customer.name,
      phone: customer.phone,
      email: customer.email,
      address: customer.address,
      customer_type: customer.customerType,
      loyalty_points: customer.loyaltyPoints,
      total_spent: customer.totalSpent,
      total_orders: customer.totalOrders,
      discount_rate: customer.discountRate,
      notes: '',
      is_active: 1,
      last_purchase_at: customer.lastPurchaseAt,
      search_text: customer.searchText,
      ...meta(customer.createdAt.toISOString()),
    });
  }
}

function saveCustomerStats(db: SeedExecutor, customers: SeedCustomer[], now: string): void {
  for (const customer of customers) {
    db.run('UPDATE customers SET loyalty_points = ?, total_spent = ?, total_orders = ?, last_purchase_at = ?, updated_at = ? WHERE id = ?', [
      customer.loyaltyPoints,
      customer.totalSpent,
      customer.totalOrders,
      customer.lastPurchaseAt,
      customer.lastPurchaseAt ?? now,
      customer.id,
    ]);
  }
}

function saveSequences(db: SeedExecutor, sequences: Map<string, number>): void {
  for (const [key, value] of sequences) {
    db.run('INSERT INTO sequences (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', [key, value]);
  }
}

function seedDemo(db: SeedExecutor, now: Date): SeedSummary {
  const random = createRandom(APP_CONFIG.demo.seed);
  const between = (min: number, max: number): number => min + random() * (max - min);
  const catalog = expandCatalog();
  const today = startOfDay(now);
  const historyStart = addDays(today, -APP_CONFIG.demo.historyDays);
  const catalogCreated = new Date(addDays(historyStart, -30).getTime() + 9 * HOUR).toISOString();
  const rahim = DEMO_USERS[0];
  const nusrat = DEMO_USERS[1];

  for (const brand of catalog.brands) {
    insertRow(db, 'brands', { id: brand.id, code: brand.code, name_bn: brand.bn, name_en: brand.en, logo: null, color: brand.color, is_active: 1, ...meta(catalogCreated) });
  }
  catalog.suppliers.forEach((supplier, index) => {
    const code = `${APP_CONFIG.numbering.supplierPrefix}-${String(index + 1).padStart(4, '0')}`;
    insertRow(db, 'suppliers', {
      id: supplier.id,
      code,
      name: supplier.name,
      company: supplier.company,
      phone: supplier.phone,
      email: supplier.email,
      address: supplier.address,
      contact_person: supplier.contactPerson,
      // Carried-over payable, scaled to the demo shop's purchase volume.
      opening_balance: Math.round(supplier.openingBalance * 0.2) * 100,
      status: 'active',
      notes: '',
      search_text: normalizeSearch(`${supplier.name} ${supplier.company} ${supplier.contactPerson} ${supplier.phone} ${code}`),
      ...meta(catalogCreated),
    });
  });
  const supplierNames = new Map(catalog.suppliers.map((supplier) => [supplier.id, supplier.name]));

  const simProducts: SimProduct[] = [];
  const priceChanges: Array<{ product: SimProduct; time: number; oldPrice: number; user: (typeof DEMO_USERS)[number] }> = [];

  // Opening stock covers only part of the expected demand, so the simulator
  // has to reorder from suppliers (purchase orders, GRNs) like a real shop.
  const demandWeight = (popularity: number, featured: boolean) => popularity ** 1.7 * (featured ? 1.3 : 1);
  const totalWeight = catalog.products.reduce((sum, product) => sum + demandWeight(product.popularity, product.featured), 0);
  const expectedLines = APP_CONFIG.demo.historyDays * 29 * 4.6;

  for (const catalogProduct of catalog.products) {
    const inactive = random() < 0.025;
    const expectedSold = (expectedLines * demandWeight(catalogProduct.popularity, catalogProduct.featured)) / totalWeight * (catalogProduct.weighted ? 1.2 : 1.4);
    // Stock levels follow demand (≈ 5 days cover as the reorder point, ≈ 3 weeks
    // as the maximum), so stock value and purchase volume match this shop's sales.
    const dailyDemand = expectedSold / APP_CONFIG.demo.historyDays;
    const minStock = catalogProduct.weighted ? Math.max(2, Math.ceil(dailyDemand * 5 * 2) / 2) : Math.max(3, Math.ceil(dailyDemand * 5));
    const maxStock = catalogProduct.weighted ? Math.max(minStock * 2, Math.ceil((minStock + dailyDemand * 16) * 2) / 2) : Math.max(minStock * 2, Math.ceil(minStock + dailyDemand * 16));
    const product = { ...catalogProduct, minStock, maxStock };
    const rawOpening = product.minStock + expectedSold * between(0.2, 0.85);
    const openingBalance = inactive ? 0 : product.weighted ? Math.max(1, Math.round(rawOpening * 2) / 2) : Math.max(2, Math.round(rawOpening));
    const policyRoll = random();
    const sim: SimProduct = {
      id: product.id,
      sku: product.sku,
      barcode: product.barcode,
      nameEn: product.nameEn,
      nameBn: product.nameBn,
      unitId: product.unitId,
      weighted: product.weighted,
      categoryCode: product.categoryCode,
      supplierId: product.supplierId,
      supplierName: supplierNames.get(product.supplierId) ?? '',
      image: product.image,
      price: product.sellingPrice,
      mrp: product.mrp,
      cost: product.purchasePrice,
      discountType: product.discountType,
      discountValue: product.discountValue,
      taxRate: product.taxRate,
      minStock: product.minStock,
      maxStock: product.maxStock,
      weight: inactive ? 0 : product.popularity ** 1.7 * (product.featured ? 1.3 : 1),
      balance: 0,
      lastMovementAt: null,
      policy: policyRoll < 0.04 ? 'oos' : policyRoll < 0.12 ? 'low' : 'normal',
      pendingPo: false,
      shelfLifeDays: product.shelfLifeDays,
      oldPrice: null,
    };

    let expiryDate: string | null = null;
    if (product.shelfLifeDays && !inactive) {
      const soon = random() < 0.08;
      const days = soon ? Math.floor(between(0, APP_CONFIG.inventory.expiringSoonDays)) : Math.max(1, Math.floor(between(0.3, 1) * product.shelfLifeDays));
      expiryDate = toLocalDate(addDays(today, days));
    }

    if (!inactive && random() < 0.04) {
      const time = historyStart.getTime() + Math.floor(between(5, APP_CONFIG.demo.historyDays - 3)) * 24 * HOUR + 10 * HOUR;
      const oldPrice = Math.max(100, Math.round((product.sellingPrice * between(0.9, 0.97)) / 100) * 100);
      if (oldPrice !== product.sellingPrice) {
        sim.oldPrice = { until: time, price: oldPrice };
        priceChanges.push({ product: sim, time, oldPrice, user: random() < 0.5 ? rahim : nusrat });
      }
    }

    insertRow(db, 'products', {
      id: product.id,
      sku: product.sku,
      name_bn: product.nameBn,
      name_en: product.nameEn,
      description_bn: product.descriptionBn,
      description_en: product.descriptionEn,
      category_id: product.categoryId,
      subcategory_id: product.subcategoryId,
      brand_id: product.brandId,
      unit_id: product.unitId,
      supplier_id: product.supplierId,
      purchase_price: product.purchasePrice,
      selling_price: product.sellingPrice,
      mrp: product.mrp,
      discount_type: product.discountType,
      discount_value: product.discountValue,
      tax_rate: product.taxRate,
      min_stock: product.minStock,
      max_stock: product.maxStock,
      image: product.image,
      status: inactive ? 'inactive' : 'active',
      featured: product.featured,
      weighted: product.weighted,
      expiry_date: expiryDate,
      search_text: product.searchText,
      ...meta(catalogCreated, sim.oldPrice ? new Date(sim.oldPrice.until).toISOString() : catalogCreated),
    });
    insertRow(db, 'product_barcodes', { id: stableId(`barcode:${product.barcode}`), product_id: product.id, barcode: product.barcode, is_primary: 1, created_at: catalogCreated });
    for (const extra of product.extraBarcodes) {
      insertRow(db, 'product_barcodes', { id: stableId(`barcode:${extra}`), product_id: product.id, barcode: extra, is_primary: 0, created_at: catalogCreated });
    }

    if (openingBalance > 0) {
      const openingTime = historyStart.getTime() + 7.5 * HOUR;
      sim.balance = roundQuantity(openingBalance);
      sim.lastMovementAt = new Date(openingTime).toISOString();
      insertRow(db, 'stock_movements', {
        id: stableId(`opening:${product.id}`),
        product_id: product.id,
        type: 'opening',
        quantity: sim.balance,
        balance_after: sim.balance,
        unit_cost: product.purchasePrice,
        reference_type: 'opening',
        reference_id: null,
        reference_no: 'OPENING',
        reason: null,
        note: 'প্রারম্ভিক স্টক',
        user_id: rahim.id,
        user_name: rahim.name.en,
        created_at: sim.lastMovementAt,
      });
    }
    simProducts.push(sim);
  }

  for (const change of priceChanges) {
    const changedAt = new Date(change.time).toISOString();
    insertRow(db, 'price_history', {
      id: stableId(`price:${change.product.id}:${change.time}`),
      product_id: change.product.id,
      field: 'selling_price',
      old_value: change.oldPrice,
      new_value: change.product.price,
      changed_by: change.user.id,
      changed_by_name: change.user.name.en,
      changed_at: changedAt,
      reason: 'সরবরাহকারীর মূল্য পরিবর্তন',
    });
    insertRow(db, 'audit_logs', {
      id: stableId(`audit:price:${change.product.id}`),
      user_id: change.user.id,
      user_name: change.user.name.en,
      action: 'product.price_changed',
      entity: 'product',
      entity_id: change.product.id,
      details: JSON.stringify({ sku: change.product.sku, from: change.oldPrice, to: change.product.price }),
      created_at: changedAt,
    });
  }

  const customers = generateCustomers(APP_CONFIG.demo.customers, random, historyStart, DEFAULT_BUSINESS_SETTINGS.discount.customerTypeRates);
  insertCustomers(db, customers);

  const sequences = new Map<string, number>();
  const result = runHistory({
    db,
    random,
    now,
    fromDay: historyStart,
    products: simProducts.filter((product) => product.weight > 0),
    customers,
    sequences,
    terminalCounterCode: APP_CONFIG.demo.openShiftCounterCode,
  });

  const terminalShift = result.openShifts.find((shift) => shift.counterId === DEMO_COUNTERS[2].id);
  if (terminalShift) seedHeldSales(db, simProducts, terminalShift.counterId, terminalShift.userId, random, now);

  const nowIso = now.toISOString();
  for (const product of simProducts) {
    insertRow(db, 'stock_balances', {
      product_id: product.id,
      quantity: product.balance,
      avg_cost: product.cost,
      last_movement_at: product.lastMovementAt,
      updated_at: nowIso,
    });
  }
  saveCustomerStats(db, customers, nowIso);
  saveSequences(db, sequences);
  db.run("UPDATE counters SET status = 'maintenance', updated_at = ? WHERE code = 'C04' AND status <> 'open'", [nowIso]);

  return { products: simProducts.length, customers: customers.length, sales: result.sales, openShifts: result.openShifts.length };
}

export function seedDatabase(db: SeedExecutor, options: SeedOptions): SeedSummary {
  const now = options.now ?? new Date();
  return inTransaction(db, () => {
    const baseCreated = addDays(startOfDay(now), -(APP_CONFIG.demo.historyDays + 60)).toISOString();
    seedBaseData(db, options.hashPin, baseCreated);
    if (options.mode === 'empty') return { products: 0, customers: 0, sales: 0, openShifts: 0 };
    return seedDemo(db, now);
  });
}

/* --------------------------------------------------------------------------
   Generate more demo data (continue mode)
   -------------------------------------------------------------------------- */

interface ProductRow {
  id: string;
  sku: string;
  barcode: string | null;
  name_en: string;
  name_bn: string;
  unit_id: string;
  weighted: number;
  category_code: string;
  supplier_id: string | null;
  supplier_name: string | null;
  image: string | null;
  selling_price: number;
  mrp: number | null;
  purchase_price: number;
  avg_cost: number | null;
  discount_type: 'percent' | 'fixed' | null;
  discount_value: number;
  tax_rate: number;
  min_stock: number;
  max_stock: number;
  quantity: number | null;
  last_movement_at: string | null;
  sold: number;
}

interface CustomerRow {
  id: string;
  code: string;
  name: string;
  phone: string;
  email: string;
  address: string;
  customer_type: CustomerType;
  discount_rate: number;
  loyalty_points: number;
  total_spent: number;
  total_orders: number;
  last_purchase_at: string | null;
  created_at: string;
  search_text: string;
}

export interface ExtendSummary {
  sales: number;
  customers: number;
  fromDate: string;
}

export function extendDemoData(db: SeedExecutor, now: Date = new Date()): ExtendSummary {
  return inTransaction(db, () => {
    const random = createRandom((APP_CONFIG.demo.seed ^ now.getTime()) >>> 0);
    const nowIso = now.toISOString();

    // 1. More customers.
    const existingCount = db.get<{ count: number }>('SELECT COUNT(*) AS count FROM customers')?.count ?? 0;
    const extraCustomers = generateCustomers(100, random, addDays(startOfDay(now), -30), DEFAULT_BUSINESS_SETTINGS.discount.customerTypeRates).map((customer, index) => {
      const code = `CUS-${String(existingCount + index + 1).padStart(5, '0')}`;
      return { ...customer, code, id: stableId(`customer:${code}:${now.getTime()}`), createdAt: new Date(Math.min(customer.createdAt.getTime(), now.getTime() - HOUR)) };
    });
    const existingPhones = new Set(db.all<{ phone: string }>("SELECT phone FROM customers WHERE phone <> ''").map((row) => row.phone));
    const newCustomers = extraCustomers.filter((customer) => !existingPhones.has(customer.phone));
    insertCustomers(db, newCustomers);

    // 2. Continue the history from the latest activity up to now.
    const latest = db.get<{ latest: string | null }>(
      'SELECT MAX(value) AS latest FROM (SELECT MAX(created_at) AS value FROM sales UNION ALL SELECT MAX(created_at) FROM stock_movements)',
    )?.latest;
    const notBefore = latest ? new Date(latest).getTime() + 60_000 : addDays(startOfDay(now), -7).getTime();
    const fromDay = startOfDay(new Date(Math.max(notBefore, addDays(startOfDay(now), -APP_CONFIG.demo.historyDays).getTime())));

    const productRows = db.all<ProductRow>(
      `SELECT p.id, p.sku, pb.barcode, p.name_en, p.name_bn, p.unit_id, p.weighted, c.code AS category_code, p.supplier_id, s.name AS supplier_name,
              p.image, p.selling_price, p.mrp, p.purchase_price, sb.avg_cost, p.discount_type, p.discount_value, p.tax_rate, p.min_stock, p.max_stock,
              sb.quantity, sb.last_movement_at,
              (SELECT COUNT(*) FROM sale_items si WHERE si.product_id = p.id) AS sold
         FROM products p
         JOIN categories c ON c.id = p.category_id
         LEFT JOIN suppliers s ON s.id = p.supplier_id
         LEFT JOIN product_barcodes pb ON pb.product_id = p.id AND pb.is_primary = 1
         LEFT JOIN stock_balances sb ON sb.product_id = p.id
        WHERE p.status = 'active' AND p.deleted_at IS NULL`,
    );
    const products: SimProduct[] = productRows.map((row) => ({
      id: row.id,
      sku: row.sku,
      barcode: row.barcode ?? '',
      nameEn: row.name_en,
      nameBn: row.name_bn,
      unitId: row.unit_id,
      weighted: row.weighted === 1,
      categoryCode: row.category_code,
      supplierId: row.supplier_id ?? '',
      supplierName: row.supplier_name ?? '',
      image: row.image,
      price: row.selling_price,
      mrp: row.mrp,
      cost: row.avg_cost ?? row.purchase_price,
      discountType: row.discount_type,
      discountValue: row.discount_value,
      taxRate: row.tax_rate,
      minStock: row.min_stock,
      maxStock: row.max_stock,
      weight: 1 + row.sold,
      balance: row.quantity ?? 0,
      lastMovementAt: row.last_movement_at,
      policy: row.supplier_id ? 'normal' : 'oos',
      pendingPo: !row.supplier_id,
      shelfLifeDays: null,
      oldPrice: null,
    }));

    const customerRows = db.all<CustomerRow>(
      'SELECT id, code, name, phone, email, address, customer_type, discount_rate, loyalty_points, total_spent, total_orders, last_purchase_at, created_at, search_text FROM customers WHERE is_active = 1 AND deleted_at IS NULL',
    );
    const customers: SeedCustomer[] = customerRows.map((row) => ({
      id: row.id,
      code: row.code,
      name: row.name,
      phone: row.phone,
      email: row.email,
      address: row.address,
      customerType: row.customer_type,
      discountRate: row.discount_rate,
      createdAt: new Date(row.created_at),
      searchText: row.search_text,
      weight: row.customer_type === 'vip' ? 4 : row.customer_type === 'wholesale' ? 3 : row.customer_type === 'regular' ? 1.4 : 0.5,
      totalSpent: row.total_spent,
      totalOrders: row.total_orders,
      loyaltyPoints: row.loyalty_points,
      lastPurchaseAt: row.last_purchase_at,
    }));

    const sequences = new Map(db.all<{ key: string; value: number }>('SELECT key, value FROM sequences').map((row) => [row.key, row.value]));
    const busyCounterIds = new Set(db.all<{ counter_id: string }>("SELECT counter_id FROM cash_sessions WHERE status = 'open'").map((row) => row.counter_id));

    const result =
      products.length > 0 && now.getTime() - notBefore > 30 * 60_000
        ? runHistory({ db, random, now, fromDay, products, customers, sequences, notBefore, busyCounterIds })
        : { sales: 0, openShifts: [] };

    for (const product of products) {
      db.run(
        `INSERT INTO stock_balances (product_id, quantity, avg_cost, last_movement_at, updated_at) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(product_id) DO UPDATE SET quantity = excluded.quantity, avg_cost = excluded.avg_cost, last_movement_at = excluded.last_movement_at, updated_at = excluded.updated_at`,
        [product.id, product.balance, product.cost, product.lastMovementAt, nowIso],
      );
    }
    saveCustomerStats(db, customers, nowIso);
    saveSequences(db, sequences);

    return { sales: result.sales, customers: newCustomers.length, fromDate: toLocalDate(fromDay) };
  });
}
