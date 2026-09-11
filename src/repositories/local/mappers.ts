import type {
  AppNotification,
  AuditLog,
  Brand,
  CashMovement,
  Category,
  Counter,
  Customer,
  DiscountType,
  Expense,
  HeldSale,
  LoyaltyTransaction,
  Payment,
  Product,
  Purchase,
  PurchaseItem,
  Sale,
  SaleItem,
  SaleReturn,
  Shift,
  StockMovement,
  Supplier,
  Unit,
  User,
} from '@/types';
import type { SqlRow } from '@/types/database';
import { parseJson, toBool, toNullableNum, toNullableStr, toNum, toStr } from './sql';

/* ==========================================================================
   Row → domain mappers (snake_case columns → typed camelCase objects).
   ========================================================================== */

type Row = SqlRow;

function metaOf(row: Row) {
  return {
    id: toStr(row.id),
    createdAt: toStr(row.created_at),
    updatedAt: toStr(row.updated_at, toStr(row.created_at)),
    version: toNum(row.version, 1),
    syncStatus: (toStr(row.sync_status, 'local') as Product['syncStatus']) ?? 'local',
    deletedAt: toNullableStr(row.deleted_at),
  };
}

export const PRODUCT_SELECT = `
  SELECT p.*, pb.barcode AS primary_barcode, COALESCE(sb.quantity, 0) AS stock
    FROM products p
    LEFT JOIN product_barcodes pb ON pb.product_id = p.id AND pb.is_primary = 1
    LEFT JOIN stock_balances sb ON sb.product_id = p.id`;

export function mapProduct(row: Row): Product {
  const discountType = toNullableStr(row.discount_type) as DiscountType | null;
  return {
    ...metaOf(row),
    sku: toStr(row.sku),
    barcode: toStr(row.primary_barcode),
    name: { bn: toStr(row.name_bn), en: toStr(row.name_en) },
    description: { bn: toStr(row.description_bn), en: toStr(row.description_en) },
    categoryId: toStr(row.category_id),
    subcategoryId: toNullableStr(row.subcategory_id),
    brandId: toNullableStr(row.brand_id),
    unitId: toStr(row.unit_id),
    supplierId: toNullableStr(row.supplier_id),
    purchasePrice: toNum(row.purchase_price),
    sellingPrice: toNum(row.selling_price),
    mrp: toNullableNum(row.mrp),
    discount: discountType ? { type: discountType, value: toNum(row.discount_value) } : null,
    taxRate: toNum(row.tax_rate),
    minStock: toNum(row.min_stock),
    maxStock: toNum(row.max_stock),
    image: toNullableStr(row.image),
    status: toStr(row.status, 'active') as Product['status'],
    featured: toBool(row.featured),
    weighted: toBool(row.weighted),
    expiryDate: toNullableStr(row.expiry_date),
    stock: toNum(row.stock),
  };
}

export function mapCategory(row: Row): Category {
  return {
    ...metaOf(row),
    parentId: toNullableStr(row.parent_id),
    code: toStr(row.code),
    name: { bn: toStr(row.name_bn), en: toStr(row.name_en) },
    icon: toStr(row.icon, 'Package'),
    color: toStr(row.color, '#64748b'),
    image: toNullableStr(row.image),
    sortOrder: toNum(row.sort_order),
    isActive: toBool(row.is_active),
  };
}

export function mapBrand(row: Row): Brand {
  return {
    ...metaOf(row),
    code: toStr(row.code),
    name: { bn: toStr(row.name_bn), en: toStr(row.name_en) },
    logo: toNullableStr(row.logo),
    color: toStr(row.color, '#64748b'),
    isActive: toBool(row.is_active),
  };
}

export function mapUnit(row: Row): Unit {
  return {
    id: toStr(row.id),
    name: { bn: toStr(row.name_bn), en: toStr(row.name_en) },
    short: { bn: toStr(row.short_bn), en: toStr(row.short_en) },
    allowDecimal: toBool(row.allow_decimal),
    sortOrder: toNum(row.sort_order),
    isActive: toBool(row.is_active),
  };
}

export function mapCustomer(row: Row): Customer {
  return {
    ...metaOf(row),
    code: toStr(row.code),
    name: toStr(row.name),
    phone: toStr(row.phone),
    email: toStr(row.email),
    address: toStr(row.address),
    customerType: toStr(row.customer_type, 'regular') as Customer['customerType'],
    loyaltyPoints: toNum(row.loyalty_points),
    totalSpent: toNum(row.total_spent),
    totalOrders: toNum(row.total_orders),
    discountRate: toNum(row.discount_rate),
    notes: toStr(row.notes),
    isActive: toBool(row.is_active),
    lastPurchaseAt: toNullableStr(row.last_purchase_at),
  };
}

export function mapLoyalty(row: Row): LoyaltyTransaction {
  return {
    id: toStr(row.id),
    customerId: toStr(row.customer_id),
    saleId: toNullableStr(row.sale_id),
    invoiceNo: toNullableStr(row.invoice_no),
    type: toStr(row.type) as LoyaltyTransaction['type'],
    points: toNum(row.points),
    balanceAfter: toNum(row.balance_after),
    note: toStr(row.note),
    userId: toNullableStr(row.user_id),
    userName: toNullableStr(row.user_name),
    createdAt: toStr(row.created_at),
  };
}

export function mapSupplier(row: Row): Supplier {
  return {
    ...metaOf(row),
    code: toStr(row.code),
    name: toStr(row.name),
    company: toStr(row.company),
    phone: toStr(row.phone),
    email: toStr(row.email),
    address: toStr(row.address),
    contactPerson: toStr(row.contact_person),
    openingBalance: toNum(row.opening_balance),
    status: toStr(row.status, 'active') as Supplier['status'],
    notes: toStr(row.notes),
  };
}

export function mapSale(row: Row): Sale {
  return {
    id: toStr(row.id),
    invoiceNo: toStr(row.invoice_no),
    branchId: toStr(row.branch_id),
    counterId: toStr(row.counter_id),
    counterName: toStr(row.counter_name),
    shiftId: toNullableStr(row.shift_id),
    cashierId: toStr(row.cashier_id),
    cashierName: toStr(row.cashier_name),
    customerId: toNullableStr(row.customer_id),
    customerName: toStr(row.customer_name),
    customerPhone: toStr(row.customer_phone),
    customerType: toNullableStr(row.customer_type) as Sale['customerType'],
    status: toStr(row.status, 'completed') as Sale['status'],
    language: toStr(row.language, 'bn') as Sale['language'],
    currencyCode: toStr(row.currency_code, 'BDT'),
    itemCount: toNum(row.item_count),
    totalQuantity: toNum(row.total_quantity),
    subtotal: toNum(row.subtotal),
    itemDiscountTotal: toNum(row.item_discount_total),
    orderDiscountTotal: toNum(row.order_discount_total),
    discountTotal: toNum(row.discount_total),
    discountReason: toStr(row.discount_reason),
    taxTotal: toNum(row.tax_total),
    taxMode: toStr(row.tax_mode, 'exclusive') as Sale['taxMode'],
    roundingAdjustment: toNum(row.rounding_adjustment),
    grandTotal: toNum(row.grand_total),
    paidTotal: toNum(row.paid_total),
    changeDue: toNum(row.change_due),
    returnedTotal: toNum(row.returned_total),
    pointsEarned: toNum(row.points_earned),
    pointsRedeemed: toNum(row.points_redeemed),
    note: toStr(row.note),
    paymentSummary: toStr(row.payment_summary, 'cash') as Sale['paymentSummary'],
    cancelledAt: toNullableStr(row.cancelled_at),
    cancelledBy: toNullableStr(row.cancelled_by),
    cancelReason: toStr(row.cancel_reason),
    createdAt: toStr(row.created_at),
    updatedAt: toStr(row.updated_at),
  };
}

export function mapSaleItem(row: Row): SaleItem {
  return {
    id: toStr(row.id),
    saleId: toStr(row.sale_id),
    lineNo: toNum(row.line_no),
    productId: toStr(row.product_id),
    sku: toStr(row.sku),
    barcode: toStr(row.barcode),
    name: { bn: toStr(row.name_bn), en: toStr(row.name_en) },
    unitId: toStr(row.unit_id),
    quantity: toNum(row.quantity),
    unitPrice: toNum(row.unit_price),
    originalPrice: toNum(row.original_price),
    mrp: toNullableNum(row.mrp),
    costPrice: toNum(row.cost_price),
    discountType: toNullableStr(row.discount_type) as SaleItem['discountType'],
    discountValue: toNum(row.discount_value),
    discountAmount: toNum(row.discount_amount),
    orderDiscountAmount: toNum(row.order_discount_amount),
    taxRate: toNum(row.tax_rate),
    taxAmount: toNum(row.tax_amount),
    lineSubtotal: toNum(row.line_subtotal),
    lineTotal: toNum(row.line_total),
    returnedQuantity: toNum(row.returned_quantity),
    note: toStr(row.note),
    priceOverridden: toBool(row.price_overridden),
  };
}

export function mapPayment(row: Row): Payment {
  return {
    id: toStr(row.id),
    saleId: toStr(row.sale_id),
    method: toStr(row.method) as Payment['method'],
    provider: toNullableStr(row.provider),
    amount: toNum(row.amount),
    tendered: toNum(row.tendered),
    change: toNum(row.change_amount),
    reference: toStr(row.reference),
    points: toNum(row.points),
    createdAt: toStr(row.created_at),
  };
}

export function mapReturn(row: Row): Omit<SaleReturn, 'items'> {
  return {
    id: toStr(row.id),
    returnNo: toStr(row.return_no),
    saleId: toStr(row.sale_id),
    invoiceNo: toStr(row.invoice_no),
    shiftId: toNullableStr(row.shift_id),
    counterId: toStr(row.counter_id),
    cashierId: toStr(row.cashier_id),
    cashierName: toStr(row.cashier_name),
    customerId: toNullableStr(row.customer_id),
    reason: toStr(row.reason),
    refundMethod: toStr(row.refund_method, 'cash') as SaleReturn['refundMethod'],
    refundTotal: toNum(row.refund_total),
    taxTotal: toNum(row.tax_total),
    approvedBy: toNullableStr(row.approved_by),
    note: toStr(row.note),
    createdAt: toStr(row.created_at),
  };
}

export function mapReturnItem(row: Row): SaleReturn['items'][number] {
  return {
    id: toStr(row.id),
    returnId: toStr(row.return_id),
    saleItemId: toStr(row.sale_item_id),
    productId: toStr(row.product_id),
    name: { bn: toStr(row.name_bn), en: toStr(row.name_en) },
    quantity: toNum(row.quantity),
    unitPrice: toNum(row.unit_price),
    refundAmount: toNum(row.refund_amount),
    taxAmount: toNum(row.tax_amount),
    restock: toBool(row.restock),
    condition: toStr(row.condition, 'good') as 'good' | 'damaged',
  };
}

export function mapHeldSale(row: Row): HeldSale {
  return {
    id: toStr(row.id),
    holdNo: toNum(row.hold_no),
    counterId: toStr(row.counter_id),
    userId: toStr(row.user_id),
    userName: toStr(row.user_name),
    customerId: toNullableStr(row.customer_id),
    customerName: toStr(row.customer_name),
    label: toStr(row.label),
    draft: parseJson(row.payload, { lines: [], customerId: null, orderDiscount: null, note: '' }),
    itemCount: toNum(row.item_count),
    total: toNum(row.total),
    createdAt: toStr(row.created_at),
    updatedAt: toStr(row.updated_at),
  };
}

export function mapMovement(row: Row): StockMovement {
  return {
    id: toStr(row.id),
    productId: toStr(row.product_id),
    productName: { bn: toStr(row.name_bn), en: toStr(row.name_en) },
    sku: toStr(row.sku),
    type: toStr(row.type) as StockMovement['type'],
    quantity: toNum(row.quantity),
    balanceAfter: toNum(row.balance_after),
    unitCost: toNum(row.unit_cost),
    referenceType: toNullableStr(row.reference_type),
    referenceId: toNullableStr(row.reference_id),
    referenceNo: toNullableStr(row.reference_no),
    reason: toNullableStr(row.reason) as StockMovement['reason'],
    note: toStr(row.note),
    userId: toNullableStr(row.user_id),
    userName: toNullableStr(row.user_name),
    createdAt: toStr(row.created_at),
  };
}

export function mapPurchase(row: Row): Purchase {
  return {
    ...metaOf(row),
    poNo: toStr(row.po_no),
    supplierId: toStr(row.supplier_id),
    supplierName: toStr(row.supplier_name),
    status: toStr(row.status, 'draft') as Purchase['status'],
    orderDate: toStr(row.order_date),
    expectedDate: toNullableStr(row.expected_date),
    subtotal: toNum(row.subtotal),
    discountTotal: toNum(row.discount_total),
    taxTotal: toNum(row.tax_total),
    grandTotal: toNum(row.grand_total),
    paidAmount: toNum(row.paid_amount),
    note: toStr(row.note),
    createdBy: toNullableStr(row.created_by),
    createdByName: toNullableStr(row.created_by_name),
    receivedAt: toNullableStr(row.received_at),
    itemCount: toNum(row.item_count),
  };
}

export function mapPurchaseItem(row: Row): PurchaseItem {
  return {
    id: toStr(row.id),
    purchaseId: toStr(row.purchase_id),
    productId: toStr(row.product_id),
    name: { bn: toStr(row.name_bn), en: toStr(row.name_en) },
    sku: toStr(row.sku),
    quantity: toNum(row.quantity),
    receivedQuantity: toNum(row.received_quantity),
    unitCost: toNum(row.unit_cost),
    discountAmount: toNum(row.discount_amount),
    taxRate: toNum(row.tax_rate),
    taxAmount: toNum(row.tax_amount),
    lineTotal: toNum(row.line_total),
  };
}

export function mapShift(row: Row): Shift {
  return {
    ...metaOf(row),
    shiftNo: toStr(row.shift_no),
    counterId: toStr(row.counter_id),
    counterName: toStr(row.counter_name, toStr(row.counter_name_en)),
    branchId: toStr(row.branch_id),
    openedBy: toStr(row.opened_by),
    openedByName: toStr(row.opened_by_name),
    closedBy: toNullableStr(row.closed_by),
    closedByName: toNullableStr(row.closed_by_name),
    status: toStr(row.status, 'open') as Shift['status'],
    openingCash: toNum(row.opening_cash),
    closingTotals: parseJson(row.closing_totals, null),
    actualCash: toNullableNum(row.actual_cash),
    difference: toNullableNum(row.difference),
    note: toStr(row.note),
    openedAt: toStr(row.opened_at),
    closedAt: toNullableStr(row.closed_at),
  };
}

export function mapCashMovement(row: Row): CashMovement {
  return {
    id: toStr(row.id),
    shiftId: toStr(row.shift_id),
    counterId: toStr(row.counter_id),
    type: toStr(row.type) as CashMovement['type'],
    amount: toNum(row.amount),
    referenceType: toNullableStr(row.reference_type),
    referenceId: toNullableStr(row.reference_id),
    referenceNo: toNullableStr(row.reference_no),
    note: toStr(row.note),
    userId: toNullableStr(row.user_id),
    userName: toNullableStr(row.user_name),
    createdAt: toStr(row.created_at),
  };
}

export function mapCounter(row: Row): Counter {
  return {
    ...metaOf(row),
    branchId: toStr(row.branch_id),
    code: toStr(row.code),
    name: { bn: toStr(row.name_bn), en: toStr(row.name_en) },
    status: toStr(row.status, 'closed') as Counter['status'],
    assignedUserId: toNullableStr(row.assigned_user_id),
    assignedUserName: toNullableStr(row.assigned_user_name),
    shiftId: toNullableStr(row.shift_id),
    shiftNo: toNullableStr(row.shift_no),
    openingCash: toNum(row.opening_cash),
    currentCash: toNum(row.current_cash),
  };
}

export function mapExpense(row: Row): Expense {
  return {
    ...metaOf(row),
    expenseNo: toStr(row.expense_no),
    categoryId: toStr(row.category_id),
    categoryName: { bn: toStr(row.category_name_bn), en: toStr(row.category_name_en) },
    amount: toNum(row.amount),
    description: toStr(row.description),
    expenseDate: toStr(row.expense_date),
    paidFrom: toStr(row.paid_from, 'cash_drawer') as Expense['paidFrom'],
    shiftId: toNullableStr(row.shift_id),
    counterId: toNullableStr(row.counter_id),
    userId: toNullableStr(row.user_id),
    userName: toNullableStr(row.user_name),
    approvedBy: toNullableStr(row.approved_by),
    approvedByName: toNullableStr(row.approved_by_name),
    status: toStr(row.status, 'approved') as Expense['status'],
  };
}

export function mapUser(row: Row): User {
  return {
    ...metaOf(row),
    username: toStr(row.username),
    name: { bn: toStr(row.name_bn), en: toStr(row.name_en) },
    roleId: toStr(row.role_id, 'cashier') as User['roleId'],
    phone: toStr(row.phone),
    email: toStr(row.email),
    defaultCounterId: toNullableStr(row.default_counter_id),
    avatarColor: toStr(row.avatar_color, '#1fbf7c'),
    preferences: parseJson(row.preferences, {}),
    isActive: toBool(row.is_active),
    lastLoginAt: toNullableStr(row.last_login_at),
  };
}

export function mapAudit(row: Row): AuditLog {
  return {
    id: toStr(row.id),
    userId: toNullableStr(row.user_id),
    userName: toNullableStr(row.user_name),
    action: toStr(row.action) as AuditLog['action'],
    entity: toStr(row.entity),
    entityId: toNullableStr(row.entity_id),
    details: parseJson(row.details, {}),
    createdAt: toStr(row.created_at),
  };
}

export function mapNotification(row: Row): AppNotification {
  return {
    id: toStr(row.id),
    type: toStr(row.type) as AppNotification['type'],
    severity: toStr(row.severity, 'info') as AppNotification['severity'],
    titleKey: toStr(row.title_key),
    messageKey: toStr(row.message_key),
    params: parseJson(row.params, {}),
    entity: toNullableStr(row.entity),
    entityId: toNullableStr(row.entity_id),
    isRead: toBool(row.is_read),
    dedupeKey: toStr(row.dedupe_key),
    createdAt: toStr(row.created_at),
  };
}
