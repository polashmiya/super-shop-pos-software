import type { Discount } from './catalog';
import type { BasisPoints, BilingualText, Id, IsoDateTime, Language, Money } from './common';
import type { CustomerType } from './people';

export type PaymentMethod = 'cash' | 'card' | 'mobile' | 'points';

export type MobileProvider = 'bkash' | 'nagad' | 'rocket' | 'upay' | 'other';

export type CardNetwork = 'visa' | 'mastercard' | 'amex' | 'unionpay' | 'other';

export type SaleStatus = 'completed' | 'partially_returned' | 'returned' | 'cancelled';

export type TaxMode = 'exclusive' | 'inclusive';

export type DiscountSource = 'promo' | 'manual' | 'customer';

/* --------------------------------------------------------------------------
   Draft cart (POS)
   -------------------------------------------------------------------------- */

export interface CartLine {
  lineId: string;
  productId: Id;
  sku: string;
  barcode: string;
  name: BilingualText;
  image: string | null;
  unitId: string;
  weighted: boolean;
  quantity: number;
  /** Price actually charged per unit (may be overridden). */
  unitPrice: Money;
  /** Catalogue price when the line was added. */
  originalPrice: Money;
  mrp: Money | null;
  costPrice: Money;
  taxRate: BasisPoints;
  discount: Discount | null;
  discountSource: DiscountSource | null;
  discountReason: string;
  note: string;
  /** Set when the unit price differs from the catalogue price. */
  priceOverride: { byUserId: Id; byName: string; reason: string } | null;
}

export interface OrderDiscount extends Discount {
  source: DiscountSource;
  reason: string;
  /** Manager who approved a discount above the cashier limit. */
  approvedBy: string | null;
}

export interface CartDraft {
  lines: CartLine[];
  customerId: Id | null;
  orderDiscount: OrderDiscount | null;
  note: string;
}

/* --------------------------------------------------------------------------
   Totals (always derived, never stored on the draft)
   -------------------------------------------------------------------------- */

export interface LineTotals {
  lineId: string;
  /** unitPrice × quantity. */
  subtotal: Money;
  itemDiscount: Money;
  /** Share of the cart-level discount allocated to this line. */
  orderDiscount: Money;
  /** Amount the VAT is calculated on. */
  taxable: Money;
  tax: Money;
  /** What the customer pays for this line. */
  total: Money;
}

export interface CartTotals {
  lines: LineTotals[];
  itemCount: number;
  totalQuantity: number;
  subtotal: Money;
  itemDiscountTotal: Money;
  orderDiscountTotal: Money;
  discountTotal: Money;
  taxableTotal: Money;
  taxTotal: Money;
  taxMode: TaxMode;
  roundingAdjustment: Money;
  grandTotal: Money;
  /** Savings against MRP + discounts, for the receipt. */
  savings: Money;
}

/* --------------------------------------------------------------------------
   Payments
   -------------------------------------------------------------------------- */

export interface PaymentEntry {
  id: string;
  method: PaymentMethod;
  provider: MobileProvider | CardNetwork | null;
  /** Amount tendered by the customer for this method. */
  amount: Money;
  /** Card last digits / mobile transaction id. */
  reference: string;
  /** Points redeemed (method 'points'). */
  points?: number;
}

export interface PaymentBreakdown {
  due: Money;
  /** Sum tendered across all methods. */
  tendered: Money;
  cashTendered: Money;
  nonCashTendered: Money;
  /** Change returned to the customer (cash only). */
  change: Money;
  /** Still to pay (0 when fully paid). */
  remaining: Money;
  isSufficient: boolean;
  /** Validation problem keys (i18n), empty when valid. */
  errors: PaymentErrorCode[];
}

export type PaymentErrorCode =
  | 'noPayment'
  | 'insufficient'
  | 'nonCashExceedsDue'
  | 'invalidAmount'
  | 'missingReference'
  | 'pointsExceedBalance'
  | 'pointsExceedLimit';

/* --------------------------------------------------------------------------
   Completed sale (immutable)
   -------------------------------------------------------------------------- */

export interface SaleItem {
  id: Id;
  saleId: Id;
  lineNo: number;
  productId: Id;
  sku: string;
  barcode: string;
  name: BilingualText;
  unitId: string;
  quantity: number;
  unitPrice: Money;
  originalPrice: Money;
  mrp: Money | null;
  costPrice: Money;
  discountType: Discount['type'] | null;
  discountValue: number;
  discountAmount: Money;
  orderDiscountAmount: Money;
  taxRate: BasisPoints;
  taxAmount: Money;
  lineSubtotal: Money;
  lineTotal: Money;
  returnedQuantity: number;
  note: string;
  priceOverridden: boolean;
}

export interface Payment {
  id: Id;
  saleId: Id;
  method: PaymentMethod;
  provider: string | null;
  /** Amount applied to the sale (cash: tendered − change). */
  amount: Money;
  tendered: Money;
  change: Money;
  reference: string;
  points: number;
  createdAt: IsoDateTime;
}

export interface Sale {
  id: Id;
  invoiceNo: string;
  branchId: Id;
  counterId: Id;
  counterName: string;
  shiftId: Id | null;
  cashierId: Id;
  cashierName: string;
  customerId: Id | null;
  customerName: string;
  customerPhone: string;
  customerType: CustomerType | null;
  status: SaleStatus;
  language: Language;
  currencyCode: string;
  itemCount: number;
  totalQuantity: number;
  subtotal: Money;
  itemDiscountTotal: Money;
  orderDiscountTotal: Money;
  discountTotal: Money;
  discountReason: string;
  taxTotal: Money;
  taxMode: TaxMode;
  roundingAdjustment: Money;
  grandTotal: Money;
  paidTotal: Money;
  changeDue: Money;
  returnedTotal: Money;
  pointsEarned: number;
  pointsRedeemed: number;
  note: string;
  /** Primary payment method for lists ("split" when more than one). */
  paymentSummary: PaymentMethod | 'split';
  cancelledAt: IsoDateTime | null;
  cancelledBy: string | null;
  cancelReason: string;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

export interface SaleDetail extends Sale {
  items: SaleItem[];
  payments: Payment[];
  returns: SaleReturn[];
}

export type SalesPeriod = 'today' | 'yesterday' | 'this_week' | 'this_month' | 'last_month' | 'custom' | 'all';

export interface SaleFilter {
  from?: IsoDateTime;
  to?: IsoDateTime;
  search?: string;
  status?: SaleStatus | 'all';
  paymentMethod?: PaymentMethod | 'all';
  cashierId?: Id | 'all';
  counterId?: Id | 'all';
  customerId?: Id | null;
  shiftId?: Id | null;
}

/* --------------------------------------------------------------------------
   Returns
   -------------------------------------------------------------------------- */

export type RefundMethod = 'cash' | 'card' | 'mobile' | 'store_credit';

export type ReturnCondition = 'good' | 'damaged';

export interface ReturnItem {
  id: Id;
  returnId: Id;
  saleItemId: Id;
  productId: Id;
  name: BilingualText;
  quantity: number;
  unitPrice: Money;
  refundAmount: Money;
  taxAmount: Money;
  restock: boolean;
  condition: ReturnCondition;
}

export interface SaleReturn {
  id: Id;
  returnNo: string;
  saleId: Id;
  invoiceNo: string;
  shiftId: Id | null;
  counterId: Id;
  cashierId: Id;
  cashierName: string;
  customerId: Id | null;
  reason: string;
  refundMethod: RefundMethod;
  refundTotal: Money;
  taxTotal: Money;
  approvedBy: string | null;
  note: string;
  createdAt: IsoDateTime;
  items: ReturnItem[];
}

export interface ReturnRequestLine {
  saleItemId: Id;
  quantity: number;
  condition: ReturnCondition;
}

/* --------------------------------------------------------------------------
   Held sales
   -------------------------------------------------------------------------- */

export interface HeldSale {
  id: Id;
  holdNo: number;
  counterId: Id;
  userId: Id;
  userName: string;
  customerId: Id | null;
  customerName: string;
  label: string;
  draft: CartDraft;
  itemCount: number;
  total: Money;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}
