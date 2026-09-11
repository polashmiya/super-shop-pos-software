import { Banknote, CircleCheck, CircleSlash, CreditCard, Landmark, Smartphone, type LucideIcon } from 'lucide-react';
import { normalizeSearch } from '@/domain/text';
import type { Supplier, SupplierPayment, SupplierStatus } from '@/types';
import type { Tone } from '@/components/ui/Display';

/* Supplier display helpers (pure). */

export const PAYMENT_METHOD_ICONS: Record<SupplierPayment['method'], LucideIcon> = {
  cash: Banknote,
  bank: Landmark,
  mobile: Smartphone,
  card: CreditCard,
};

export function supplierStatusBadge(status: SupplierStatus): { tone: Tone; icon: LucideIcon } {
  return status === 'active' ? { tone: 'success', icon: CircleCheck } : { tone: 'neutral', icon: CircleSlash };
}

/** Normalised text used for instant client-side supplier search. */
export function supplierHaystack(supplier: Supplier): string {
  return normalizeSearch(`${supplier.name} ${supplier.company} ${supplier.contactPerson} ${supplier.phone} ${supplier.email} ${supplier.code}`);
}
