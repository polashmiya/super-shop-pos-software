import { customRangeQuery } from '@/features/sales/listParams';
import type { Customer } from '@/types';

const YEAR_MS = 365 * 24 * 60 * 60 * 1000;

/** Sales history filtered to this customer: since they joined (at least the last 12 months) until today. */
export function customerSalesLink(customer: Pick<Customer, 'id' | 'createdAt'>, now: Date = new Date()): string {
  const joined = new Date(customer.createdAt).getTime();
  const yearAgo = now.getTime() - YEAR_MS;
  const from = new Date(Number.isNaN(joined) ? yearAgo : Math.min(joined, yearAgo));
  return `/sales?customer=${encodeURIComponent(customer.id)}&${customRangeQuery(from, now)}`;
}
