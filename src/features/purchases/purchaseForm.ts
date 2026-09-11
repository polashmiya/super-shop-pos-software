import { multiplyMoney, parseMoneyInput, parseQuantityInput, roundQuantity } from '@/domain/money';
import type { BasisPoints, BilingualText, Id, Money, Product, PurchaseItem, PurchaseItemInput } from '@/types';

/* ==========================================================================
   Purchase order form: editable line state (text inputs) and validation.
   Amounts are typed in taka and converted to poisha with parseMoneyInput.
   ========================================================================== */

export interface DraftLine {
  productId: Id;
  name: BilingualText;
  sku: string;
  /** Text as typed (Bangla digits and decimals accepted). */
  quantity: string;
  unitCost: string;
  discount: string;
  taxRate: BasisPoints;
}

export type LineErrorKey = 'invalidQuantity' | 'wholeOnly' | 'invalidAmount' | 'discountTooHigh';

export interface LineCheck {
  /** Parsed values (invalid parts count as 0 so totals stay meaningful while typing). */
  item: PurchaseItemInput;
  errors: Partial<Record<'quantity' | 'unitCost' | 'discount', LineErrorKey>>;
}

/** Poisha → an input string in taka without needless decimals (125000 → "1250", 12550 → "125.50"). */
export function minorToInput(minor: Money): string {
  return minor % 100 === 0 ? String(minor / 100) : (minor / 100).toFixed(2);
}

export function quantityToInput(quantity: number): string {
  return String(roundQuantity(quantity));
}

export function lineFromProduct(product: Product, quantity: number): DraftLine {
  return {
    productId: product.id,
    name: product.name,
    sku: product.sku,
    quantity: quantityToInput(quantity),
    unitCost: minorToInput(product.purchasePrice),
    discount: '',
    taxRate: product.taxRate,
  };
}

export function lineFromItem(item: PurchaseItem): DraftLine {
  return {
    productId: item.productId,
    name: item.name,
    sku: item.sku,
    quantity: quantityToInput(item.quantity),
    unitCost: minorToInput(item.unitCost),
    discount: item.discountAmount > 0 ? minorToInput(item.discountAmount) : '',
    taxRate: item.taxRate,
  };
}

export function checkLine(line: DraftLine, decimals: boolean): LineCheck {
  const errors: LineCheck['errors'] = {};
  const quantity = parseQuantityInput(line.quantity);
  const unitCost = parseMoneyInput(line.unitCost);
  const discount = line.discount.trim() ? parseMoneyInput(line.discount) : 0;

  if (quantity === null || quantity <= 0) errors.quantity = 'invalidQuantity';
  else if (!decimals && !Number.isInteger(quantity)) errors.quantity = 'wholeOnly';
  if (unitCost === null || unitCost < 0) errors.unitCost = 'invalidAmount';
  if (discount === null || discount < 0) errors.discount = 'invalidAmount';

  const safeQuantity = errors.quantity || quantity === null ? 0 : quantity;
  const safeCost = errors.unitCost || unitCost === null ? 0 : unitCost;
  const safeDiscount = errors.discount || discount === null ? 0 : discount;
  if (!errors.discount && safeDiscount > 0 && safeDiscount > multiplyMoney(safeCost, safeQuantity)) errors.discount = 'discountTooHigh';

  return {
    item: { productId: line.productId, quantity: safeQuantity, unitCost: safeCost, discountAmount: safeDiscount, taxRate: line.taxRate },
    errors,
  };
}

export const hasLineErrors = (check: LineCheck): boolean => Object.keys(check.errors).length > 0;

/** Stable snapshot of the form for "unsaved changes" detection. */
export function formSnapshot(state: { supplierId: string; orderDate: string; expectedDate: string; note: string; lines: DraftLine[] }): string {
  return JSON.stringify([
    state.supplierId,
    state.orderDate,
    state.expectedDate,
    state.note.trim(),
    state.lines.map((line) => [line.productId, line.quantity, line.unitCost, line.discount, line.taxRate]),
  ]);
}
