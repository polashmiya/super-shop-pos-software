import { repos } from '@/repositories';
import { getSale, paymentMethodsForSales } from '@/services/saleService';
import { counterService, shiftService } from '@/services/shiftService';
import type { AuditLog, BilingualText, Counter, Id, Language, PageResult, PaymentMethod, Sale, SaleDetail, Shift, User } from '@/types';

/* ==========================================================================
   Data loaders for the sales screens (thin wrappers over services and
   repositories so pages stay declarative).
   ========================================================================== */

export interface StaffDirectory {
  users: User[];
  counters: Counter[];
}

/** Every user (including former staff, so old sales still show names) and every counter. */
export async function loadStaffDirectory(): Promise<StaffDirectory> {
  const [users, counters] = await Promise.all([repos().users.list(true).catch(() => [] as User[]), counterService.list().catch(() => [] as Counter[])]);
  return { users, counters };
}

/** Name in the UI language for a user / counter id, falling back to the name stored on the record. */
export function directoryName(list: ReadonlyArray<{ id: Id; name: BilingualText }> | undefined, id: Id, language: Language, fallback: string): string {
  const entry = list?.find((item) => item.id === id);
  if (!entry) return fallback || '—';
  return (language === 'bn' ? entry.name.bn || entry.name.en : entry.name.en || entry.name.bn) || fallback || '—';
}

/** Recent audit trail of one sale (completed, discounts, reprints, returns, cancellation). */
export function loadSaleActivity(saleId: Id): Promise<AuditLog[]> {
  return repos().audit.forEntity('sale', saleId, 50);
}

export interface SaleDetailBundle {
  sale: SaleDetail;
  shift: Shift | null;
}

export async function loadSaleDetail(saleId: Id): Promise<SaleDetailBundle | null> {
  const sale = await getSale(saleId);
  if (!sale) return null;
  const shift = sale.shiftId ? await shiftService.getById(sale.shiftId).catch(() => null) : null;
  return { sale, shift };
}

export interface SalePage extends PageResult<Sale> {
  /** Methods of split payments, by sale id. */
  methods: Record<Id, PaymentMethod[]>;
}

/** Adds the payment methods of split sales to a page of sales. */
export async function withSplitMethods(page: PageResult<Sale>): Promise<SalePage> {
  const splitIds = page.rows.filter((sale) => sale.paymentSummary === 'split').map((sale) => sale.id);
  const methods = await paymentMethodsForSales(splitIds).catch(() => ({}));
  return { ...page, methods };
}
