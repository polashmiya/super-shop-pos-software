import { create } from 'zustand';
import { roundQuantity } from '@/domain/money';
import { lineFromProduct } from '@/services/pricingService';
import type { CartDraft, CartLine, Customer, Discount, DiscountSource, Id, OrderDiscount, Product } from '@/types';

/* ==========================================================================
   POS cart (draft sale). Pure state transitions only — validation, sounds
   and toasts live in src/features/pos/posActions.ts. Totals are always
   derived (useCartTotals), never stored.
   ========================================================================== */

export interface AddResult {
  lineId: string;
  merged: boolean;
  quantity: number;
}

interface PosState {
  draft: CartDraft;
  customer: Customer | null;
  selectedLineId: string | null;
  lastAdded: { lineId: string; at: number } | null;
  /** Increments whenever the search box should take focus again. */
  focusTick: number;

  addProduct(product: Product, quantity: number, mergeDuplicates: boolean): AddResult;
  setQuantity(lineId: string, quantity: number): void;
  removeLine(lineId: string): void;
  setLineDiscount(lineId: string, discount: Discount | null, source: DiscountSource | null, reason: string): void;
  setLineNote(lineId: string, note: string): void;
  overridePrice(lineId: string, unitPrice: number, by: { id: Id; name: string }, reason: string): void;
  setOrderDiscount(discount: OrderDiscount | null): void;
  setCustomer(customer: Customer | null, autoDiscountRate: number): void;
  setNote(note: string): void;
  select(lineId: string | null): void;
  selectRelative(step: 1 | -1): void;
  clear(): void;
  loadDraft(draft: CartDraft, customer: Customer | null): void;
  requestFocus(): void;
}

const EMPTY_DRAFT: CartDraft = { lines: [], customerId: null, orderDiscount: null, note: '' };

function updateLine(draft: CartDraft, lineId: string, update: (line: CartLine) => CartLine): CartDraft {
  return { ...draft, lines: draft.lines.map((line) => (line.lineId === lineId ? update(line) : line)) };
}

export const usePosStore = create<PosState>((set, get) => ({
  draft: EMPTY_DRAFT,
  customer: null,
  selectedLineId: null,
  lastAdded: null,
  focusTick: 0,

  addProduct(product, quantity, mergeDuplicates) {
    const { draft } = get();
    const existing = mergeDuplicates
      ? draft.lines.find((line) => line.productId === product.id && !line.priceOverride && line.discountSource !== 'manual')
      : undefined;
    if (existing) {
      const nextQuantity = roundQuantity(existing.quantity + quantity);
      set({
        draft: updateLine(draft, existing.lineId, (line) => ({ ...line, quantity: nextQuantity })),
        selectedLineId: existing.lineId,
        lastAdded: { lineId: existing.lineId, at: Date.now() },
      });
      return { lineId: existing.lineId, merged: true, quantity: nextQuantity };
    }
    const line = lineFromProduct(product, roundQuantity(quantity));
    set({
      draft: { ...draft, lines: [...draft.lines, line] },
      selectedLineId: line.lineId,
      lastAdded: { lineId: line.lineId, at: Date.now() },
    });
    return { lineId: line.lineId, merged: false, quantity: line.quantity };
  },

  setQuantity(lineId, quantity) {
    set({ draft: updateLine(get().draft, lineId, (line) => ({ ...line, quantity: roundQuantity(quantity) })) });
  },

  removeLine(lineId) {
    const { draft, selectedLineId } = get();
    const index = draft.lines.findIndex((line) => line.lineId === lineId);
    const lines = draft.lines.filter((line) => line.lineId !== lineId);
    const neighbour = lines[Math.min(index, lines.length - 1)] ?? null;
    set({ draft: { ...draft, lines }, selectedLineId: selectedLineId === lineId ? (neighbour?.lineId ?? null) : selectedLineId });
  },

  setLineDiscount(lineId, discount, source, reason) {
    set({ draft: updateLine(get().draft, lineId, (line) => ({ ...line, discount, discountSource: discount ? source : null, discountReason: discount ? reason : '' })) });
  },

  setLineNote(lineId, note) {
    set({ draft: updateLine(get().draft, lineId, (line) => ({ ...line, note: note.slice(0, 200) })) });
  },

  overridePrice(lineId, unitPrice, by, reason) {
    set({
      draft: updateLine(get().draft, lineId, (line) => ({
        ...line,
        unitPrice,
        priceOverride: unitPrice === line.originalPrice ? null : { byUserId: by.id, byName: by.name, reason },
      })),
    });
  },

  setOrderDiscount(discount) {
    set({ draft: { ...get().draft, orderDiscount: discount } });
  },

  setCustomer(customer, autoDiscountRate) {
    const { draft } = get();
    let orderDiscount = draft.orderDiscount;
    if (orderDiscount?.source === 'customer') orderDiscount = null;
    if (customer && autoDiscountRate > 0 && !orderDiscount) {
      orderDiscount = { type: 'percent', value: autoDiscountRate, source: 'customer', reason: '', approvedBy: null };
    }
    set({ customer, draft: { ...draft, customerId: customer?.id ?? null, orderDiscount } });
  },

  setNote(note) {
    set({ draft: { ...get().draft, note: note.slice(0, 500) } });
  },

  select(lineId) {
    set({ selectedLineId: lineId });
  },

  selectRelative(step) {
    const { draft, selectedLineId } = get();
    if (draft.lines.length === 0) return;
    const index = draft.lines.findIndex((line) => line.lineId === selectedLineId);
    const nextIndex = index < 0 ? (step > 0 ? 0 : draft.lines.length - 1) : Math.min(Math.max(index + step, 0), draft.lines.length - 1);
    set({ selectedLineId: draft.lines[nextIndex].lineId });
  },

  clear() {
    set({ draft: EMPTY_DRAFT, customer: null, selectedLineId: null, lastAdded: null, focusTick: get().focusTick + 1 });
  },

  loadDraft(draft, customer) {
    set({ draft, customer, selectedLineId: draft.lines[draft.lines.length - 1]?.lineId ?? null, lastAdded: null, focusTick: get().focusTick + 1 });
  },

  requestFocus() {
    set({ focusTick: get().focusTick + 1 });
  },
}));

export const selectLineCount = (state: PosState): number => state.draft.lines.length;
