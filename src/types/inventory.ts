import type { BilingualText, EntityMeta, Id, IsoDate, IsoDateTime, Money } from './common';

export type StockMovementType =
  | 'opening'
  | 'purchase'
  | 'sale'
  | 'return'
  | 'damage'
  | 'adjustment'
  | 'transfer_in'
  | 'transfer_out'
  | 'cancel';

export type AdjustmentReason = 'damage' | 'lost' | 'expired' | 'counting_error' | 'manual_correction' | 'other';

export interface StockMovement {
  id: Id;
  productId: Id;
  productName: BilingualText;
  sku: string;
  type: StockMovementType;
  /** Signed quantity: positive adds stock, negative removes it. */
  quantity: number;
  balanceAfter: number;
  unitCost: Money;
  referenceType: string | null;
  referenceId: Id | null;
  referenceNo: string | null;
  reason: AdjustmentReason | null;
  note: string;
  userId: Id | null;
  userName: string | null;
  createdAt: IsoDateTime;
}

export interface StockMovementFilter {
  productId?: Id;
  type?: StockMovementType | 'all';
  from?: IsoDateTime;
  to?: IsoDateTime;
  search?: string;
}

export interface StockAdjustmentInput {
  productId: Id;
  direction: 'increase' | 'decrease';
  quantity: number;
  reason: AdjustmentReason;
  note: string;
}

export interface InventorySummary {
  totalProducts: number;
  activeProducts: number;
  inStock: number;
  lowStock: number;
  outOfStock: number;
  expiringSoon: number;
  stockValue: Money;
  retailValue: Money;
}

/* --------------------------------------------------------------------------
   Purchases
   -------------------------------------------------------------------------- */

export type PurchaseStatus = 'draft' | 'ordered' | 'partially_received' | 'received' | 'cancelled';

export interface PurchaseItem {
  id: Id;
  purchaseId: Id;
  productId: Id;
  name: BilingualText;
  sku: string;
  quantity: number;
  receivedQuantity: number;
  unitCost: Money;
  discountAmount: Money;
  taxRate: number;
  taxAmount: Money;
  lineTotal: Money;
}

export interface Purchase extends EntityMeta {
  poNo: string;
  supplierId: Id;
  supplierName: string;
  status: PurchaseStatus;
  orderDate: IsoDate;
  expectedDate: IsoDate | null;
  subtotal: Money;
  discountTotal: Money;
  taxTotal: Money;
  grandTotal: Money;
  paidAmount: Money;
  note: string;
  createdBy: Id | null;
  createdByName: string | null;
  receivedAt: IsoDateTime | null;
  itemCount: number;
}

export interface PurchaseDetail extends Purchase {
  items: PurchaseItem[];
  receipts: GoodsReceipt[];
}

export interface PurchaseItemInput {
  productId: Id;
  quantity: number;
  unitCost: Money;
  discountAmount: Money;
  taxRate: number;
}

export interface PurchaseInput {
  id?: Id;
  supplierId: Id;
  orderDate: IsoDate;
  expectedDate: IsoDate | null;
  note: string;
  status: Extract<PurchaseStatus, 'draft' | 'ordered'>;
  items: PurchaseItemInput[];
}

export interface GoodsReceipt {
  id: Id;
  grnNo: string;
  purchaseId: Id;
  receivedBy: Id | null;
  receivedByName: string | null;
  receivedAt: IsoDateTime;
  note: string;
  items: Array<{ purchaseItemId: Id; productId: Id; quantity: number; unitCost: Money }>;
}

export interface ReceiveLineInput {
  purchaseItemId: Id;
  quantity: number;
}

export interface PurchaseFilter {
  search?: string;
  status?: PurchaseStatus | 'all';
  supplierId?: Id | 'all';
  from?: IsoDateTime;
  to?: IsoDateTime;
}
