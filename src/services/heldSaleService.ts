import { APP_CONFIG } from '@/config/app.config';
import { AppError } from '@/domain/errors';
import { repos } from '@/repositories';
import type { CartDraft, Customer, HeldSale, Id } from '@/types';
import { actor, requirePermission, terminal } from './context';
import { cartTotals } from './pricingService';

/* Hold / recall sales (spec §29). Held carts are stored per counter. */

export async function listHeldSales(): Promise<HeldSale[]> {
  return repos().heldSales.list(terminal().counterId);
}

export async function holdSale(draft: CartDraft, customer: Customer | null, label: string): Promise<HeldSale> {
  requirePermission('pos.hold');
  if (draft.lines.length === 0) throw new AppError('cartEmpty');
  const { counterId } = terminal();
  if ((await repos().heldSales.count(counterId)) >= APP_CONFIG.pos.maxHeldSales) throw new AppError('heldSalesFull');
  const totals = cartTotals(draft);
  return repos().heldSales.create({
    counterId,
    user: actor(),
    customerId: customer?.id ?? null,
    customerName: customer?.name ?? '',
    label: label.trim(),
    draft,
    itemCount: draft.lines.length,
    total: totals.grandTotal,
  });
}

/** Removes a held sale and returns its cart for the POS. */
export async function recallHeldSale(held: HeldSale): Promise<CartDraft> {
  await repos().heldSales.delete(held.id);
  return held.draft;
}

export async function deleteHeldSale(id: Id): Promise<void> {
  await repos().heldSales.delete(id);
}
