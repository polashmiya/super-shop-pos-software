import type { Discount } from '@/types/catalog';
import type { BasisPoints, Money } from '@/types/common';
import type { CartLine, CartTotals, LineTotals, OrderDiscount, TaxMode } from '@/types/sales';
import type { RoundingMode } from '@/types/settings';
import {
  BASIS_POINTS_100,
  allocateProportionally,
  applyRounding,
  clampMoney,
  multiplyMoney,
  percentOf,
  roundHalfUp,
  sumMoney,
} from './money';

/* ==========================================================================
   Pricing engine — the ONLY place cart money is calculated.

   Order of operations for every line:
     subtotal   = unit price × quantity
     item disc. = line discount (promo or manual)
     order disc = cart discount allocated proportionally to line nets
     taxable    = subtotal − item disc − order disc
     VAT        = exclusive: taxable × rate
                  inclusive: part of taxable (taxable − taxable ÷ (1 + rate))
     line total = exclusive: taxable + VAT, inclusive: taxable
   Grand total = Σ line totals, then the cash rounding rule.
   ========================================================================== */

export interface PricingOptions {
  taxEnabled: boolean;
  taxMode: TaxMode;
  rounding: RoundingMode;
}

export type PricingLine = Pick<CartLine, 'lineId' | 'quantity' | 'unitPrice' | 'taxRate' | 'discount' | 'mrp'>;

export function calculateSubtotal(unitPrice: Money, quantity: number): Money {
  return multiplyMoney(unitPrice, quantity);
}

/** Discount amount for a base amount; never negative and never more than the base. */
export function calculateDiscountAmount(base: Money, discount: Discount | null | undefined): Money {
  if (!discount || base <= 0) return 0;
  if (discount.type === 'percent') {
    const rate = clampMoney(roundHalfUp(discount.value), 0, BASIS_POINTS_100);
    return clampMoney(percentOf(base, rate), 0, base);
  }
  return clampMoney(roundHalfUp(discount.value), 0, base);
}

export function calculateItemDiscount(line: PricingLine): Money {
  return calculateDiscountAmount(calculateSubtotal(line.unitPrice, line.quantity), line.discount);
}

export function calculateOrderDiscount(netAfterItemDiscounts: Money, discount: OrderDiscount | Discount | null): Money {
  return calculateDiscountAmount(netAfterItemDiscounts, discount);
}

/** VAT for a taxable amount. Inclusive mode extracts the VAT already inside the amount. */
export function calculateTax(taxable: Money, rate: BasisPoints, mode: TaxMode): Money {
  if (taxable <= 0 || rate <= 0) return 0;
  if (mode === 'exclusive') return percentOf(taxable, rate);
  const net = roundHalfUp((taxable * BASIS_POINTS_100) / (BASIS_POINTS_100 + rate));
  return taxable - net;
}

export function calculateTotal(taxable: Money, tax: Money, mode: TaxMode): Money {
  return mode === 'exclusive' ? taxable + tax : taxable;
}

/** Change due to the customer; 0 when underpaid. */
export function calculateChange(due: Money, tendered: Money): Money {
  return tendered > due ? tendered - due : 0;
}

export function calculateCartTotals(
  lines: readonly PricingLine[],
  orderDiscount: OrderDiscount | Discount | null,
  options: PricingOptions,
): CartTotals {
  const subtotals = lines.map((line) => calculateSubtotal(line.unitPrice, line.quantity));
  const itemDiscounts = lines.map((line, index) => calculateDiscountAmount(subtotals[index], line.discount));
  const nets = subtotals.map((subtotal, index) => subtotal - itemDiscounts[index]);
  const netTotal = sumMoney(nets);

  const orderDiscountTotal = calculateOrderDiscount(netTotal, orderDiscount);
  const orderShares = allocateProportionally(orderDiscountTotal, nets);

  const lineTotals: LineTotals[] = lines.map((line, index) => {
    const taxable = nets[index] - orderShares[index];
    const rate = options.taxEnabled ? line.taxRate : 0;
    const tax = calculateTax(taxable, rate, options.taxMode);
    return {
      lineId: line.lineId,
      subtotal: subtotals[index],
      itemDiscount: itemDiscounts[index],
      orderDiscount: orderShares[index],
      taxable,
      tax,
      total: calculateTotal(taxable, tax, options.taxMode),
    };
  });

  const subtotal = sumMoney(subtotals);
  const itemDiscountTotal = sumMoney(itemDiscounts);
  const taxableTotal = sumMoney(lineTotals.map((line) => line.taxable));
  const taxTotal = sumMoney(lineTotals.map((line) => line.tax));
  const beforeRounding = sumMoney(lineTotals.map((line) => line.total));
  const grandTotal = applyRounding(beforeRounding, options.rounding);

  const mrpSavings = sumMoney(
    lines.map((line) => (line.mrp && line.mrp > line.unitPrice ? multiplyMoney(line.mrp - line.unitPrice, line.quantity) : 0)),
  );

  return {
    lines: lineTotals,
    itemCount: lines.length,
    totalQuantity: lines.reduce((total, line) => total + line.quantity, 0),
    subtotal,
    itemDiscountTotal,
    orderDiscountTotal,
    discountTotal: itemDiscountTotal + orderDiscountTotal,
    taxableTotal,
    taxTotal,
    taxMode: options.taxMode,
    roundingAdjustment: grandTotal - beforeRounding,
    grandTotal,
    savings: mrpSavings + itemDiscountTotal + orderDiscountTotal,
  };
}

export type DiscountValidationError = 'negative' | 'percentTooHigh' | 'exceedsAmount' | 'aboveLimit' | 'zero';

/**
 * Validates a discount against its base amount and the user's limit (basis
 * points of the base). Returns null when valid.
 */
export function validateDiscount(
  discount: Discount,
  base: Money,
  limitRate: BasisPoints = BASIS_POINTS_100,
): DiscountValidationError | null {
  if (!Number.isFinite(discount.value) || discount.value < 0) return 'negative';
  if (discount.value === 0) return 'zero';
  if (discount.type === 'percent') {
    if (discount.value > BASIS_POINTS_100) return 'percentTooHigh';
    if (discount.value > limitRate) return 'aboveLimit';
    return null;
  }
  if (discount.value > base) return 'exceedsAmount';
  if (base > 0 && discount.value > percentOf(base, limitRate)) return 'aboveLimit';
  return null;
}

/** Effective discount rate (basis points) of an amount relative to a base. */
export function effectiveRate(amount: Money, base: Money): BasisPoints {
  if (base <= 0) return 0;
  return roundHalfUp((amount * BASIS_POINTS_100) / base);
}
