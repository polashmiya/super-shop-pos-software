import type { ShiftActivity } from '@/repositories/types';
import { defaultReportFilter, loadKpis } from '@/services/reportService';
import { counterService, shiftActivity, shiftService } from '@/services/shiftService';
import type { CashMovement, Counter, Id, Money, Shift, ShiftWithTotals } from '@/types';

/* ==========================================================================
   Data loaders for the cash screens (thin wrappers over services so pages
   stay declarative).
   ========================================================================== */

/** The most recent closed shift of a counter (its closing count is the next opening float). */
export async function lastClosedShift(counterId: Id): Promise<Shift | null> {
  const page = await shiftService.list({ counterId, status: 'closed' }, { page: 1, pageSize: 1 });
  return page.rows[0] ?? null;
}

export interface ShiftLiveDetails {
  movements: CashMovement[];
  activity: ShiftActivity;
}

/** Drawer ledger + payment split of one shift. */
export async function loadShiftLiveDetails(shiftId: Id): Promise<ShiftLiveDetails> {
  const [movements, activity] = await Promise.all([shiftService.cashMovements(shiftId), shiftActivity(shiftId)]);
  return { movements, activity };
}

export interface ShiftDetailBundle extends ShiftLiveDetails {
  shift: ShiftWithTotals;
  counters: Counter[];
}

export async function loadShiftDetail(shiftId: Id): Promise<ShiftDetailBundle | null> {
  const shift = await shiftService.getById(shiftId);
  if (!shift) return null;
  const [withTotals, details, counters] = await Promise.all([shiftService.withTotals(shift), loadShiftLiveDetails(shift.id), counterService.list().catch(() => [] as Counter[])]);
  return { shift: withTotals, counters, ...details };
}

export interface CounterOverview {
  counter: Counter;
  todaySales: Money;
  todayOrders: number;
}

/** Every counter with today's sales (net of cancellations) recorded on it. */
export async function loadCounterOverview(): Promise<CounterOverview[]> {
  const counters = await counterService.list();
  const today = defaultReportFilter('today');
  const range = { from: today.from, to: today.to };
  const kpis = await Promise.all(counters.map((counter) => loadKpis(range, { counterId: counter.id }).catch(() => null)));
  return counters.map((counter, index) => ({ counter, todaySales: kpis[index]?.grossSales ?? 0, todayOrders: kpis[index]?.orders ?? 0 }));
}
