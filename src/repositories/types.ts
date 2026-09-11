import type { Permission } from '@/config/permissions';
import type { AppliedPayment } from '@/domain/payment';
import type {
  AdjustmentReason,
  AppNotification,
  AuditAction,
  AuditFilter,
  AuditLog,
  Brand,
  BusinessSettings,
  CartDraft,
  CartLine,
  CartTotals,
  CashMovement,
  CashMovementType,
  Category,
  Counter,
  CounterStatus,
  Customer,
  CustomerInput,
  CustomerType,
  DateRange,
  DeviceSettings,
  Expense,
  ExpenseCategory,
  ExpenseFilter,
  ExpenseInput,
  ExpenseStatus,
  GoodsReceipt,
  HeldSale,
  Id,
  InventorySummary,
  IsoDateTime,
  Language,
  LineTotals,
  LoyaltyTransaction,
  Money,
  OrderDiscount,
  PageRequest,
  PageResult,
  PaymentMethod,
  PriceHistoryEntry,
  Product,
  ProductBarcode,
  ProductInput,
  ProductStatus,
  Purchase,
  PurchaseDetail,
  PurchaseFilter,
  PurchaseStatus,
  RefundMethod,
  ReportFilter,
  Role,
  RoleId,
  Sale,
  SaleDetail,
  SaleFilter,
  SaleReturn,
  SessionState,
  Shift,
  ShiftFilter,
  ShiftTotals,
  StockMovement,
  StockMovementFilter,
  StockMovementType,
  Supplier,
  SupplierInput,
  SupplierPayment,
  SupplierSummary,
  Unit,
  User,
  UserInput,
  UserPreferences,
} from '@/types';

/* ==========================================================================
   Repository interfaces — the boundary between the application and its
   data source. Local implementations (SQLite via the Electron bridge) live
   in ./local; an API implementation (e.g. ASP.NET Core) can implement the
   same interfaces later without touching services, stores or UI.
   ========================================================================== */

/** Who performed an action (audit trail, "created by" columns). */
export interface Actor {
  id: Id;
  name: string;
}

/* ------------------------------ Catalogue ------------------------------- */

export interface ProductSaleRow {
  saleId: Id;
  invoiceNo: string;
  createdAt: IsoDateTime;
  quantity: number;
  unitPrice: Money;
  lineTotal: Money;
  customerName: string;
  cashierName: string;
}

export interface ProductRepository {
  getAll(): Promise<Product[]>;
  getById(id: Id): Promise<Product | null>;
  search(query: string, limit?: number): Promise<Product[]>;
  findByBarcode(code: string): Promise<Product | null>;
  create(input: ProductInput, actor: Actor): Promise<Product>;
  update(id: Id, input: ProductInput, actor: Actor, reason: string): Promise<Product>;
  setStatus(ids: Id[], status: ProductStatus, actor: Actor): Promise<void>;
  delete(id: Id, actor: Actor): Promise<void>;
  getBarcodes(productId: Id): Promise<ProductBarcode[]>;
  getPriceHistory(productId: Id): Promise<PriceHistoryEntry[]>;
  getSalesHistory(productId: Id, limit: number): Promise<ProductSaleRow[]>;
  isBarcodeTaken(barcode: string, exceptProductId?: Id): Promise<boolean>;
  isSkuTaken(sku: string, exceptProductId?: Id): Promise<boolean>;
  nextSku(prefix: string): Promise<string>;
  /** Net units/amount sold since `since` (cancelled sales and returns excluded) and the latest sale time. */
  getSalesSummary(productId: Id, since: IsoDateTime): Promise<{ quantity: number; amount: Money; orders: number; lastSaleAt: IsoDateTime | null }>;
}

export interface CategoryInput {
  id?: Id;
  parentId: Id | null;
  code: string;
  name: { bn: string; en: string };
  icon: string;
  color: string;
  image: string | null;
  sortOrder: number;
  isActive: boolean;
}

export interface BrandInput {
  id?: Id;
  code: string;
  name: { bn: string; en: string };
  logo: string | null;
  color: string;
  isActive: boolean;
}

export interface CatalogRepository {
  listCategories(): Promise<Category[]>;
  saveCategory(input: CategoryInput, actor: Actor): Promise<Category>;
  listBrands(): Promise<Array<Brand & { productCount: number }>>;
  saveBrand(input: BrandInput, actor: Actor): Promise<Brand>;
  listUnits(): Promise<Unit[]>;
  saveUnit(unit: Unit): Promise<Unit>;
  categoryProductCounts(): Promise<Map<Id, number>>;
}

/* ------------------------------ Inventory ------------------------------- */

export interface StockAdjustmentRecord {
  productId: Id;
  type: Extract<StockMovementType, 'adjustment' | 'damage'>;
  quantity: number;
  reason: AdjustmentReason;
  note: string;
  sequenceKey: string;
  createdAt: IsoDateTime;
}

export interface InventoryRepository {
  getSummary(expiringBefore: string): Promise<InventorySummary>;
  getStockLevels(productIds?: Id[]): Promise<Map<Id, number>>;
  listMovements(filter: StockMovementFilter, page: PageRequest): Promise<PageResult<StockMovement>>;
  adjust(record: StockAdjustmentRecord, actor: Actor): Promise<StockMovement>;
  /** Moving-average unit cost per product (falls back to the purchase price). */
  getAverageCosts(productIds?: Id[]): Promise<Map<Id, Money>>;
  /** Ledger totals of one product for [from, to): balance before `from`, stock in, stock out. */
  getMovementSummary(productId: Id, range: { from?: IsoDateTime; to?: IsoDateTime }): Promise<StockMovementSummary>;
}

export interface StockMovementSummary {
  /** Balance before the period (Σ movements before `from`). */
  opening: number;
  totalIn: number;
  /** Positive number: quantity that left the stock in the period. */
  totalOut: number;
  /** opening + totalIn − totalOut. */
  closing: number;
  movementCount: number;
}

/* -------------------------------- Sales --------------------------------- */

export interface NewSaleLine {
  lineNo: number;
  line: CartLine;
  totals: LineTotals;
}

export interface NewSaleRecord {
  id: Id;
  createdAt: IsoDateTime;
  sequenceKey: string;
  branchId: Id;
  counterId: Id;
  counterName: string;
  shiftId: Id | null;
  cashier: Actor;
  customer: { id: Id; name: string; phone: string; type: CustomerType } | null;
  language: Language;
  currencyCode: string;
  totals: CartTotals;
  lines: NewSaleLine[];
  orderDiscount: OrderDiscount | null;
  payments: AppliedPayment[];
  paymentSummary: PaymentMethod | 'split';
  pointsEarned: number;
  pointsRedeemed: number;
  note: string;
}

export interface NewReturnLine {
  saleItemId: Id;
  productId: Id;
  name: { bn: string; en: string };
  quantity: number;
  unitPrice: Money;
  refund: Money;
  tax: Money;
  restock: boolean;
  condition: 'good' | 'damaged';
}

export interface NewReturnRecord {
  id: Id;
  createdAt: IsoDateTime;
  sequenceKey: string;
  saleId: Id;
  invoiceNo: string;
  shiftId: Id | null;
  counterId: Id;
  cashier: Actor;
  customerId: Id | null;
  reason: string;
  refundMethod: RefundMethod;
  refundTotal: Money;
  taxTotal: Money;
  approvedBy: string | null;
  note: string;
  lines: NewReturnLine[];
  pointsReversed: number;
}

export interface CancelSaleRecord {
  saleId: Id;
  invoiceNo: string;
  reason: string;
  approvedBy: string;
  cancelledAt: IsoDateTime;
  shiftId: Id | null;
  counterId: Id;
  cashRefund: Money;
  pointsToReverse: number;
  pointsToRestore: number;
  customerId: Id | null;
  grandTotal: Money;
  lines: Array<{ productId: Id; quantity: number }>;
}

export interface SaleSort {
  field: 'createdAt' | 'grandTotal' | 'invoiceNo' | 'itemCount';
  direction: 'asc' | 'desc';
}

export interface SaleRepository {
  create(record: NewSaleRecord): Promise<{ id: Id; invoiceNo: string }>;
  getById(id: Id): Promise<SaleDetail | null>;
  findByInvoice(invoiceNo: string): Promise<SaleDetail | null>;
  list(filter: SaleFilter, page: PageRequest, sort?: SaleSort): Promise<PageResult<Sale>>;
  cancel(record: CancelSaleRecord, actor: Actor): Promise<void>;
  createReturn(record: NewReturnRecord): Promise<SaleReturn>;
  listReturns(filter: SaleFilter, page: PageRequest): Promise<PageResult<SaleReturn>>;
  searchInvoices(query: string, limit: number): Promise<Sale[]>;
  /** Distinct payment methods per sale, in payment order (lists show the methods of split payments). */
  paymentMethods(saleIds: Id[]): Promise<Record<Id, PaymentMethod[]>>;
}

export interface HeldSaleRepository {
  list(counterId: Id): Promise<HeldSale[]>;
  create(input: { counterId: Id; user: Actor; customerId: Id | null; customerName: string; label: string; draft: CartDraft; itemCount: number; total: Money }): Promise<HeldSale>;
  delete(id: Id): Promise<void>;
  count(counterId: Id): Promise<number>;
}

/* ------------------------------ Customers ------------------------------- */

export interface CustomerFilter {
  search?: string;
  type?: CustomerType | 'all';
  sort?: 'name' | 'totalSpent' | 'lastPurchase' | 'points' | 'createdAt';
  direction?: 'asc' | 'desc';
}

export interface CustomerRepository {
  list(filter: CustomerFilter, page: PageRequest): Promise<PageResult<Customer>>;
  search(query: string, limit: number): Promise<Customer[]>;
  getById(id: Id): Promise<Customer | null>;
  findByPhone(phone: string): Promise<Customer | null>;
  create(input: CustomerInput & { code?: string }, actor: Actor): Promise<Customer>;
  update(id: Id, input: CustomerInput, actor: Actor): Promise<Customer>;
  delete(id: Id, actor: Actor): Promise<void>;
  purchaseHistory(customerId: Id, page: PageRequest): Promise<PageResult<Sale>>;
  loyaltyHistory(customerId: Id, limit: number): Promise<LoyaltyTransaction[]>;
  adjustPoints(customerId: Id, points: number, note: string, actor: Actor): Promise<Customer>;
  countByType(): Promise<Record<CustomerType, number>>;
}

/* ------------------------------ Suppliers ------------------------------- */

export interface SupplierRepository {
  list(search?: string, status?: 'active' | 'inactive' | 'all'): Promise<Supplier[]>;
  getById(id: Id): Promise<Supplier | null>;
  create(input: SupplierInput, actor: Actor): Promise<Supplier>;
  update(id: Id, input: SupplierInput, actor: Actor): Promise<Supplier>;
  summaries(): Promise<Map<Id, SupplierSummary>>;
  payments(supplierId: Id): Promise<SupplierPayment[]>;
  addPayment(payment: Omit<SupplierPayment, 'id'>, actor: Actor): Promise<SupplierPayment>;
}

/* ------------------------------ Purchases ------------------------------- */

export interface PurchaseRecordItem {
  id: Id;
  productId: Id;
  name: { bn: string; en: string };
  sku: string;
  quantity: number;
  unitCost: Money;
  discountAmount: Money;
  taxRate: number;
  taxAmount: Money;
  lineTotal: Money;
}

export interface PurchaseRecord {
  id: Id;
  sequenceKey: string | null;
  supplierId: Id;
  supplierName: string;
  status: Extract<PurchaseStatus, 'draft' | 'ordered'>;
  orderDate: string;
  expectedDate: string | null;
  subtotal: Money;
  discountTotal: Money;
  taxTotal: Money;
  grandTotal: Money;
  note: string;
  items: PurchaseRecordItem[];
  createdAt: IsoDateTime;
}

export interface ReceiveRecord {
  purchaseId: Id;
  poNo: string;
  receiptId: Id;
  sequenceKey: string;
  receivedAt: IsoDateTime;
  note: string;
  lines: Array<{ purchaseItemId: Id; productId: Id; quantity: number; unitCost: Money }>;
  nextStatus: Extract<PurchaseStatus, 'partially_received' | 'received'>;
}

export interface PurchaseRepository {
  list(filter: PurchaseFilter, page: PageRequest): Promise<PageResult<Purchase>>;
  getById(id: Id): Promise<PurchaseDetail | null>;
  create(record: PurchaseRecord, actor: Actor): Promise<{ id: Id; poNo: string }>;
  update(record: PurchaseRecord, actor: Actor): Promise<void>;
  setStatus(id: Id, status: PurchaseStatus, actor: Actor): Promise<void>;
  receive(record: ReceiveRecord, actor: Actor): Promise<GoodsReceipt>;
  countByStatus(): Promise<Record<PurchaseStatus, number>>;
  /** Count and money totals for a filter (cancelled orders excluded unless filtered for). */
  totals(filter: PurchaseFilter): Promise<PurchaseTotalsSummary>;
}

export interface PurchaseTotalsSummary {
  count: number;
  grandTotal: Money;
  paidAmount: Money;
}

/* --------------------------- Shifts & cash ------------------------------ */

export interface ShiftRepository {
  getOpenShift(counterId: Id): Promise<Shift | null>;
  getById(id: Id): Promise<Shift | null>;
  list(filter: ShiftFilter, page: PageRequest): Promise<PageResult<Shift>>;
  open(input: { id: Id; sequenceKey: string; counterId: Id; branchId: Id; openingCash: Money; note: string; openedAt: IsoDateTime }, actor: Actor): Promise<Shift>;
  close(input: { id: Id; totals: ShiftTotals; actualCash: Money; difference: Money; note: string; closedAt: IsoDateTime; approvedBy: string | null }, actor: Actor): Promise<Shift>;
  computeTotals(shiftId: Id, openingCash: Money): Promise<ShiftTotals>;
  cashMovements(shiftId: Id): Promise<CashMovement[]>;
  addCashMovement(input: { shiftId: Id; counterId: Id; type: Extract<CashMovementType, 'cash_in' | 'cash_out'>; amount: Money; note: string; createdAt: IsoDateTime }, actor: Actor): Promise<CashMovement>;
  /** Shift history: shifts with their sales and the cash the drawer should hold. */
  search(filter: ShiftSearchFilter, page: PageRequest): Promise<PageResult<ShiftListRow>>;
  /** Totals over every shift matching the filter (sales, cash short / over). */
  summary(filter: ShiftSearchFilter): Promise<ShiftSummary>;
  /** Payment split by method + provider and sale / return / cancellation counts of one shift. */
  activity(shiftId: Id): Promise<ShiftActivity>;
}

export interface ShiftSearchFilter extends ShiftFilter {
  /** Only closed shifts whose counted cash differed from the expected cash. */
  differenceOnly?: boolean;
}

export interface ShiftListRow extends Shift {
  salesCount: number;
  salesTotal: Money;
  /** Σ drawer ledger except the closing count = cash the drawer should hold now. */
  drawerCash: Money;
}

export interface ShiftSummary {
  count: number;
  openCount: number;
  salesTotal: Money;
  /** Sum of cash shortages, as a positive amount. */
  shortTotal: Money;
  shortCount: number;
  overTotal: Money;
  overCount: number;
}

export interface ShiftActivity {
  payments: Array<{ method: PaymentMethod; provider: string | null; amount: Money; count: number }>;
  salesCount: number;
  itemsSold: number;
  cancelledCount: number;
  returnsCount: number;
}

export interface CounterRepository {
  list(): Promise<Counter[]>;
  update(id: Id, input: { name: { bn: string; en: string }; status: CounterStatus }, actor: Actor): Promise<void>;
  create(input: { code: string; name: { bn: string; en: string }; branchId: Id }, actor: Actor): Promise<Counter>;
}

/* ------------------------------- Expenses ------------------------------- */

export interface ExpenseRepository {
  categories(): Promise<ExpenseCategory[]>;
  list(filter: ExpenseFilter, page: PageRequest): Promise<PageResult<Expense>>;
  create(input: ExpenseInput & { id: Id; sequenceKey: string; shiftId: Id | null; counterId: Id | null; status: ExpenseStatus; createdAt: IsoDateTime }, actor: Actor): Promise<Expense>;
  update(id: Id, input: ExpenseInput, actor: Actor): Promise<void>;
  setStatus(id: Id, status: ExpenseStatus, actor: Actor): Promise<void>;
  delete(id: Id, actor: Actor): Promise<void>;
  getById(id: Id): Promise<Expense | null>;
  /** Expense list by expense date, with the paid-from filter (cash drawer / office). */
  search(filter: ExpenseSearchFilter, page: PageRequest): Promise<PageResult<Expense>>;
  /** Totals and category split for a filter (rejected expenses do not count as spent). */
  summary(filter: ExpenseSearchFilter): Promise<ExpenseSummary>;
}

export interface ExpenseSearchFilter extends ExpenseFilter {
  paidFrom?: Expense['paidFrom'] | 'all';
}

export interface ExpenseSummary {
  count: number;
  total: Money;
  pendingCount: number;
  pendingTotal: Money;
  drawerTotal: Money;
  officeTotal: Money;
  byCategory: Array<{ categoryId: Id; name: ExpenseCategory['name']; icon: string; amount: Money; count: number }>;
}

/* ------------------------------- Reports -------------------------------- */

export interface ReportRow {
  [key: string]: string | number | null;
}

export interface ReportRepository {
  /** Runs a named, parameterised report query and returns plain rows. */
  query(name: ReportQueryName, filter: ReportFilter, extra?: Record<string, string | number>): Promise<ReportRow[]>;
  salesTotals(range: DateRange, filter?: Partial<ReportFilter>): Promise<ReportRow>;
}

export type ReportQueryName =
  | 'salesByDay'
  | 'salesByHour'
  | 'salesByMonth'
  | 'paymentMethods'
  | 'productSales'
  | 'categorySales'
  | 'brandSales'
  | 'cashierSales'
  | 'counterSales'
  | 'discounts'
  | 'vatByRate'
  | 'returns'
  | 'returnItems'
  | 'inventoryByCategory'
  | 'stockMovementSummary'
  | 'stockMovements'
  | 'lowStock'
  | 'outOfStock'
  | 'stockValuation'
  | 'purchases'
  | 'supplierPurchases'
  | 'customerPurchases'
  | 'profitByCategory'
  | 'cashMovements'
  | 'shifts'
  | 'expenses'
  | 'expensesByCategory'
  | 'slowMoving'
  /* Reports module: reconciliation-grade aggregates (all SQL-side). */
  | 'salesReconciliation'
  | 'cancelledSales'
  | 'paymentDetails'
  | 'returnsByDay'
  | 'returnsByMonth'
  | 'returnsImpact'
  | 'returnProducts'
  | 'profitByDay'
  | 'stockMovementByType'
  | 'cashMovementSummary'
  | 'customerTypeSales'
  | 'customerActivity'
  | 'returnsByHour'
  | 'returnMethods'
  | 'stockMovementByDay'
  | 'brandSalesDetail'
  | 'expenseBreakdown'
  | 'purchaseStatusSummary';

/* ---------------------------- Settings & users -------------------------- */

export interface SettingsRepository {
  getBusiness(): Promise<BusinessSettings>;
  saveBusiness<K extends keyof BusinessSettings>(key: K, value: BusinessSettings[K], actor: Actor | null): Promise<void>;
  getDevice(): Promise<DeviceSettings>;
  saveDevice(settings: DeviceSettings): Promise<void>;
  getSession(): Promise<SessionState>;
  saveSession(session: SessionState): Promise<void>;
  getDraft(): Promise<CartDraft | null>;
  saveDraft(draft: CartDraft | null): Promise<void>;
}

export interface UserCredentials {
  id: Id;
  pinHash: string;
  pinSalt: string;
  isActive: boolean;
}

export interface UserRepository {
  list(includeInactive?: boolean): Promise<User[]>;
  getById(id: Id): Promise<User | null>;
  getCredentials(id: Id): Promise<UserCredentials | null>;
  recordLogin(id: Id, at: IsoDateTime): Promise<void>;
  create(input: UserInput & { pinHash: string; pinSalt: string }, actor: Actor): Promise<User>;
  update(id: Id, input: UserInput, actor: Actor): Promise<User>;
  setPin(id: Id, pinHash: string, pinSalt: string): Promise<void>;
  savePreferences(id: Id, preferences: UserPreferences): Promise<void>;
  roles(): Promise<Role[]>;
  rolePermissions(): Promise<Record<RoleId, Permission[]>>;
  setRolePermissions(roleId: RoleId, permissions: Permission[], actor: Actor): Promise<void>;
}

export interface AuditRepository {
  log(entry: { action: AuditAction; entity: string; entityId: Id | null; details: Record<string, unknown> }, actor: Actor | null): Promise<void>;
  list(filter: AuditFilter, page: PageRequest): Promise<PageResult<AuditLog>>;
  forEntity(entity: string, entityId: Id, limit: number): Promise<AuditLog[]>;
  /** Activity log with the entity filter and a readable reference (invoice no, SKU, PO no…) per row. */
  listDetailed(filter: AuditQuery, page: PageRequest): Promise<PageResult<AuditLogEntry>>;
  /** Distinct entity types present in the log (for filters). */
  entityTypes(): Promise<string[]>;
}

export interface AuditQuery extends AuditFilter {
  entity?: string | 'all';
}

export interface AuditLogEntry extends AuditLog {
  /** Human reference of the entity: invoice no, SKU, PO no, shift no, customer name… */
  reference: string | null;
}

export interface NotificationRepository {
  list(limit: number): Promise<AppNotification[]>;
  unreadCount(): Promise<number>;
  /** Inserts or refreshes notifications by dedupe key; removes stale ones of the given types. */
  sync(notifications: Array<Omit<AppNotification, 'id' | 'isRead' | 'createdAt'>>, managedTypes: AppNotification['type'][]): Promise<void>;
  markRead(id: Id): Promise<void>;
  markAllRead(): Promise<void>;
  add(notification: Omit<AppNotification, 'id' | 'isRead' | 'createdAt'>): Promise<void>;
}

/* ------------------------------------------------------------------------ */

export interface Repositories {
  products: ProductRepository;
  catalog: CatalogRepository;
  inventory: InventoryRepository;
  sales: SaleRepository;
  heldSales: HeldSaleRepository;
  customers: CustomerRepository;
  suppliers: SupplierRepository;
  purchases: PurchaseRepository;
  shifts: ShiftRepository;
  counters: CounterRepository;
  expenses: ExpenseRepository;
  reports: ReportRepository;
  settings: SettingsRepository;
  users: UserRepository;
  audit: AuditRepository;
  notifications: NotificationRepository;
}

/** Device-local key/value storage (electron-store in the app, memory in tests). */
export interface DeviceStorage {
  get<T>(key: 'device' | 'session' | 'posDraft'): Promise<T | undefined>;
  set(key: 'device' | 'session' | 'posDraft', value: unknown): Promise<void>;
  delete(key: 'device' | 'session' | 'posDraft'): Promise<void>;
}
