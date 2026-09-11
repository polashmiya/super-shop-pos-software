import { daysBetween, parseLocalDate } from '@/domain/dates';
import { loadDashboardFor, type DashboardPeriod, type DashboardView } from '@/services/reportService';
import { listSales } from '@/services/saleService';
import { counterService } from '@/services/shiftService';
import type { Counter, Product, Sale } from '@/types';

/* ==========================================================================
   Everything the dashboard shows, loaded in parallel. Parts that need extra
   permissions (sales list, counters) fail soft so the rest still renders.
   ========================================================================== */

export interface DashboardData {
  view: DashboardView;
  recentSales: Sale[];
  counters: Counter[];
}

export async function loadDashboardData(period: DashboardPeriod, options: { canSeeSales: boolean; canSeeCounters: boolean }): Promise<DashboardData> {
  const view = await loadDashboardFor(period);
  const [recent, counters] = await Promise.all([
    options.canSeeSales ? listSales({ from: view.range.from, to: view.range.to }, { page: 1, pageSize: 6 }, { field: 'createdAt', direction: 'desc' }).catch(() => null) : Promise.resolve(null),
    options.canSeeCounters ? counterService.list().catch(() => [] as Counter[]) : Promise.resolve([] as Counter[]),
  ]);
  return { view, recentSales: recent?.rows ?? [], counters };
}

export interface ExpiringProduct {
  product: Product;
  days: number;
}

/** Active products with stock whose expiry date falls within `withinDays` (already expired first). */
export function expiringProducts(products: readonly Product[], withinDays: number, now: Date, limit = 6): ExpiringProduct[] {
  const result: ExpiringProduct[] = [];
  for (const product of products) {
    if (product.status !== 'active' || !product.expiryDate || product.stock <= 0) continue;
    const days = daysBetween(now, parseLocalDate(product.expiryDate));
    if (days <= withinDays) result.push({ product, days });
  }
  return result.sort((a, b) => a.days - b.days).slice(0, limit);
}

export type Greeting = 'morning' | 'noon' | 'afternoon' | 'evening';

export function greetingFor(date: Date): Greeting {
  const hour = date.getHours();
  if (hour < 12) return 'morning';
  if (hour < 15) return 'noon';
  if (hour < 18) return 'afternoon';
  return 'evening';
}

/** Change as a fraction, or null when there is nothing to compare with. */
export function change(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return (current - previous) / previous;
}
