import { APP_CONFIG } from '@/config/app.config';
import { BASIS_POINTS_100 } from '@/domain/money';
import { calculateCartTotals, validateDiscount, type DiscountValidationError, type PricingOptions } from '@/domain/pricing';
import type { BusinessSettings, CartDraft, CartLine, CartTotals, Discount, Money, Product } from '@/types';
import { ctx } from './context';

/* ==========================================================================
   Pricing, discount limits and cart line creation — thin wrappers that
   apply the shop's settings to the pure pricing engine (src/domain).
   ========================================================================== */

export function pricingOptions(business: BusinessSettings = ctx().business()): PricingOptions {
  return { taxEnabled: business.tax.enabled, taxMode: business.tax.mode, rounding: business.sales.rounding };
}

export function cartTotals(draft: Pick<CartDraft, 'lines' | 'orderDiscount'>, business: BusinessSettings = ctx().business()): CartTotals {
  return calculateCartTotals(draft.lines, draft.orderDiscount, pricingOptions(business));
}

let lineSequence = 0;

export function newLineId(): string {
  lineSequence = (lineSequence + 1) % Number.MAX_SAFE_INTEGER;
  return `L${Date.now().toString(36)}${lineSequence.toString(36)}`;
}

/** A new cart line for a product, with its running promotion applied. */
export function lineFromProduct(product: Product, quantity: number): CartLine {
  return {
    lineId: newLineId(),
    productId: product.id,
    sku: product.sku,
    barcode: product.barcode,
    name: product.name,
    image: product.image,
    unitId: product.unitId,
    weighted: product.weighted,
    quantity,
    unitPrice: product.sellingPrice,
    originalPrice: product.sellingPrice,
    mrp: product.mrp,
    costPrice: product.purchasePrice,
    taxRate: product.taxRate,
    discount: product.discount,
    discountSource: product.discount ? 'promo' : null,
    discountReason: '',
    note: '',
    priceOverride: null,
  };
}

export function isValidQuantity(quantity: number, weighted: boolean): boolean {
  if (!Number.isFinite(quantity) || quantity <= 0 || quantity > APP_CONFIG.pos.maxQuantity) return false;
  return weighted ? Math.round(quantity * 1000) === quantity * 1000 : Number.isInteger(quantity);
}

/* ----------------------------- Discounts -------------------------------- */

/** Largest manual discount rate the signed-in user may give without approval. */
export function userDiscountLimit(): number {
  const context = ctx();
  const user = context.user();
  if (!user || !context.can('pos.discount')) return 0;
  const business = context.business();
  if (user.roleId === 'admin') return BASIS_POINTS_100;
  if (user.roleId === 'manager') return business.discount.managerMaxRate;
  return business.discount.cashierMaxRate;
}

export interface DiscountCheck {
  error: DiscountValidationError | null;
  /** Valid, but above the user's limit → a manager must approve. */
  needsApproval: boolean;
}

export function checkDiscount(discount: Discount, base: Money): DiscountCheck {
  const hardError = validateDiscount(discount, base);
  if (hardError) return { error: hardError, needsApproval: false };
  const limitError = validateDiscount(discount, base, userDiscountLimit());
  if (limitError === 'aboveLimit') {
    const business = ctx().business();
    const managerOk = validateDiscount(discount, base, business.discount.managerMaxRate) === null;
    return { error: managerOk ? null : 'aboveLimit', needsApproval: managerOk && business.security.requireManagerForLargeDiscount };
  }
  return { error: limitError, needsApproval: false };
}

/** The customer-type/customer-specific discount rate that applies automatically. */
export function customerDiscountRate(customer: { customerType: string; discountRate: number } | null): number {
  if (!customer) return 0;
  if (customer.discountRate > 0) return customer.discountRate;
  const rates = ctx().business().discount.customerTypeRates as Record<string, number>;
  return rates[customer.customerType] ?? 0;
}
