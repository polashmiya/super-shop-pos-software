import { APP_CONFIG } from '@/config/app.config';
import { AppError } from '@/domain/errors';
import { roundQuantity } from '@/domain/money';
import { toAsciiDigits } from '@/domain/text';
import { pick, t } from '@/i18n';
import { productService } from '@/services/catalogService';
import { deleteHeldSale, holdSale, listHeldSales, recallHeldSale } from '@/services/heldSaleService';
import { customerService } from '@/services/peopleService';
import { checkDiscount, customerDiscountRate, isValidQuantity, userDiscountLimit } from '@/services/pricingService';
import { sounds } from '@/services/soundService';
import { useAuthStore } from '@/stores/authStore';
import { findByCode, useCatalogStore } from '@/stores/catalogStore';
import { usePosStore } from '@/stores/posStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { confirmAction, requestApproval, toast } from '@/stores/uiStore';
import type { Customer, Discount, HeldSale, OrderDiscount, Product } from '@/types';
import { cartTotals } from '@/services/pricingService';

/* ==========================================================================
   POS actions: the only place the cart is changed from the UI. They
   validate (stock, quantity, limits), ask for approvals, play sounds and
   show friendly messages; components stay simple.
   ========================================================================== */

function language() {
  return useSettingsStore.getState().device.locale.language;
}

function nameOf(product: { name: { bn: string; en: string } }): string {
  return pick(product.name, language());
}

function quantityInCart(productId: string): number {
  return usePosStore
    .getState()
    .draft.lines.filter((line) => line.productId === productId)
    .reduce((sum, line) => sum + line.quantity, 0);
}

function stockAllows(product: Product, extra: number): boolean {
  if (useSettingsStore.getState().business.inventory.allowNegativeStock) return true;
  return roundQuantity(quantityInCart(product.id) + extra) <= product.stock + 0.0005;
}

/** Adds a product (one action: scan or tap). Returns true when added. */
export function addProductToCart(product: Product, quantity = 1, source: 'scan' | 'tap' | 'search' = 'tap'): boolean {
  if (product.status !== 'active') {
    toast.error('errors.productInactive');
    return false;
  }
  const { draft } = usePosStore.getState();
  const mergeDuplicates = useSettingsStore.getState().device.pos.duplicateScanIncreasesQty;
  const willMerge = mergeDuplicates && draft.lines.some((line) => line.productId === product.id && !line.priceOverride && line.discountSource !== 'manual');
  if (!willMerge && draft.lines.length >= APP_CONFIG.pos.maxCartLines) {
    toast.error('errors.cartFull');
    return false;
  }
  if (!isValidQuantity(roundQuantity(quantity), product.weighted)) {
    toast.error('errors.invalidQuantity');
    return false;
  }
  if (!stockAllows(product, quantity)) {
    toast.error({ key: 'errors.stockInsufficient', params: { name: nameOf(product), available: Math.max(0, product.stock) } });
    return false;
  }
  usePosStore.getState().addProduct(product, quantity, mergeDuplicates);
  if (source === 'scan') sounds.scan();
  if (source === 'search') toast.success({ key: 'pos.addedToCart', params: { name: nameOf(product) } });
  return true;
}

/** Barcode / SKU entered by a scanner or typed (optionally with a quantity). Returns true when a product was added. */
export async function scanCode(rawCode: string, quantity = 1): Promise<boolean> {
  const code = toAsciiDigits(rawCode.trim());
  if (!code) return false;
  let product = findByCode(code);
  if (!product) {
    // Secondary barcodes are not in memory; ask the database.
    product = await productService.findByBarcode(code).catch(() => null);
    if (product) useCatalogStore.getState().upsert(product);
  }
  if (!product) {
    sounds.error();
    toast.warning({ key: 'pos.unknownBarcode', params: { code } });
    return false;
  }
  return addProductToCart(product, quantity, 'scan');
}

/** Sets a line quantity (0 removes the line). */
export function setLineQuantity(lineId: string, quantity: number): boolean {
  const store = usePosStore.getState();
  const line = store.draft.lines.find((entry) => entry.lineId === lineId);
  if (!line) return false;
  const next = roundQuantity(quantity);
  if (next <= 0) {
    store.removeLine(lineId);
    return true;
  }
  if (!isValidQuantity(next, line.weighted)) {
    toast.error('errors.invalidQuantity');
    return false;
  }
  const product = useCatalogStore.getState().byId.get(line.productId);
  if (product && next > line.quantity && !stockAllows(product, next - line.quantity)) {
    toast.error({ key: 'errors.stockInsufficient', params: { name: nameOf(product), available: Math.max(0, product.stock) } });
    return false;
  }
  store.setQuantity(lineId, next);
  return true;
}

export function stepLineQuantity(lineId: string, direction: 1 | -1): void {
  const line = usePosStore.getState().draft.lines.find((entry) => entry.lineId === lineId);
  if (!line) return;
  const step = line.weighted ? (line.quantity < 1 ? 0.25 : 0.5) : 1;
  setLineQuantity(lineId, roundQuantity(line.quantity + direction * step));
}

export function removeLine(lineId: string): void {
  usePosStore.getState().removeLine(lineId);
  usePosStore.getState().requestFocus();
}

export async function clearCart(): Promise<void> {
  const { draft } = usePosStore.getState();
  if (draft.lines.length === 0) return;
  if (useSettingsStore.getState().device.pos.confirmClearCart) {
    const ok = await confirmAction({
      title: t('pos.cart.clearConfirmTitle'),
      message: t('pos.cart.clearConfirmMessage', { count: draft.lines.length }),
      confirmLabel: t('pos.cart.clear'),
      tone: 'danger',
    });
    if (!ok) {
      usePosStore.getState().requestFocus();
      return;
    }
  }
  usePosStore.getState().clear();
}

/* ------------------------------ Discounts ------------------------------- */

async function approveIfNeeded(needsApproval: boolean, action: string): Promise<string | null | false> {
  if (!needsApproval) return null;
  const approver = await requestApproval({ permission: 'pos.discount', action });
  if (!approver) return false;
  return approver.name.en;
}

/** Item discount (percent or fixed) with limit checks and manager approval. */
export async function applyLineDiscount(lineId: string, discount: Discount | null, reason: string): Promise<boolean> {
  const store = usePosStore.getState();
  const line = store.draft.lines.find((entry) => entry.lineId === lineId);
  if (!line) return false;
  if (!discount) {
    store.setLineDiscount(lineId, null, null, '');
    return true;
  }
  const settings = useSettingsStore.getState().business;
  if (!settings.discount.allowItemDiscount) throw new AppError('permissionDenied');
  if (settings.discount.requireReason && !reason.trim()) throw new AppError('discountReasonRequired');
  const base = Math.round(line.unitPrice * line.quantity);
  const check = checkDiscount(discount, base);
  if (check.error) throw new AppError(check.error === 'aboveLimit' ? 'discountAboveLimit' : 'invalidDiscount', { limit: `${userDiscountLimit() / 100}%` });
  const approvedBy = await approveIfNeeded(check.needsApproval, `${t('pos.discount.itemTitle')} — ${pick(line.name, language())}`);
  if (approvedBy === false) return false;
  store.setLineDiscount(lineId, discount, 'manual', approvedBy ? `${reason.trim()} (${approvedBy})` : reason.trim());
  return true;
}

/** Cart-level discount. */
export async function applyOrderDiscount(discount: Discount | null, reason: string): Promise<boolean> {
  const store = usePosStore.getState();
  if (!discount) {
    store.setOrderDiscount(null);
    return true;
  }
  const settings = useSettingsStore.getState().business;
  if (!settings.discount.allowOrderDiscount) throw new AppError('permissionDenied');
  if (settings.discount.requireReason && !reason.trim()) throw new AppError('discountReasonRequired');
  const totals = cartTotals({ lines: store.draft.lines, orderDiscount: null });
  const base = totals.subtotal - totals.itemDiscountTotal;
  const check = checkDiscount(discount, base);
  if (check.error) throw new AppError(check.error === 'aboveLimit' ? 'discountAboveLimit' : 'invalidDiscount', { limit: `${userDiscountLimit() / 100}%` });
  const approvedBy = await approveIfNeeded(check.needsApproval, t('pos.discount.orderTitle'));
  if (approvedBy === false) return false;
  const orderDiscount: OrderDiscount = { ...discount, source: 'manual', reason: reason.trim(), approvedBy };
  store.setOrderDiscount(orderDiscount);
  return true;
}

/** Price override: needs pos.priceOverride, otherwise a manager's PIN. */
export async function overridePrice(lineId: string, unitPrice: number, reason: string): Promise<boolean> {
  const store = usePosStore.getState();
  const line = store.draft.lines.find((entry) => entry.lineId === lineId);
  const user = useAuthStore.getState().user;
  if (!line || !user) return false;
  if (!Number.isSafeInteger(unitPrice) || unitPrice < 0) throw new AppError('invalidPrice');
  if (unitPrice === line.unitPrice) return true;
  let by = { id: user.id, name: user.name.en };
  const allowed = useAuthStore.getState().can('pos.priceOverride');
  if (!allowed || useSettingsStore.getState().business.security.requireManagerForPriceOverride) {
    if (!allowed || user.roleId === 'cashier') {
      const approver = await requestApproval({ permission: 'pos.priceOverride', action: t('pos.priceOverride.approvalAction', { name: pick(line.name, language()) }) });
      if (!approver) return false;
      by = { id: approver.id, name: approver.name.en };
    }
  }
  store.overridePrice(lineId, unitPrice, by, reason.trim());
  return true;
}

/* ------------------------------- Customer ------------------------------- */

export function selectCustomer(customer: Customer | null): void {
  const auto = useSettingsStore.getState().business.discount.applyCustomerDiscountAutomatically;
  usePosStore.getState().setCustomer(customer, auto ? customerDiscountRate(customer) : 0);
  usePosStore.getState().requestFocus();
}

/* ----------------------------- Hold / recall ---------------------------- */

export async function holdCurrentSale(label: string): Promise<boolean> {
  const { draft, customer } = usePosStore.getState();
  if (draft.lines.length === 0) {
    toast.info('errors.cartEmpty');
    return false;
  }
  try {
    const held = await holdSale(draft, customer, label);
    usePosStore.getState().clear();
    toast.success({ key: 'pos.held.held', params: { no: String(held.holdNo).padStart(3, '0') } });
    return true;
  } catch (error) {
    toast.fromError(error);
    return false;
  }
}

export async function resumeHeldSale(held: HeldSale): Promise<boolean> {
  const { draft } = usePosStore.getState();
  if (draft.lines.length > 0) {
    const ok = await confirmAction({
      title: t('pos.held.replaceTitle'),
      message: t('pos.held.replaceMessage', { no: String(held.holdNo).padStart(3, '0') }),
      confirmLabel: t('pos.held.holdAndResume'),
      tone: 'primary',
    });
    if (!ok) return false;
    if (!(await holdCurrentSale(''))) return false;
  }
  try {
    const restored = await recallHeldSale(held);
    const customer = held.customerId ? await customerService.getById(held.customerId) : null;
    usePosStore.getState().loadDraft(restored, customer);
    toast.success({ key: 'pos.held.recalled', params: { no: String(held.holdNo).padStart(3, '0') } });
    return true;
  } catch (error) {
    toast.fromError(error);
    return false;
  }
}

export async function removeHeldSale(held: HeldSale): Promise<boolean> {
  const ok = await confirmAction({ title: t('pos.held.deleteConfirm', { no: String(held.holdNo).padStart(3, '0') }), tone: 'danger', confirmLabel: t('pos.held.delete') });
  if (!ok) return false;
  await deleteHeldSale(held.id);
  return true;
}

export { listHeldSales };
