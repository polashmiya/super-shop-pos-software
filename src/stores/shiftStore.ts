import { create } from 'zustand';
import { shiftService, counterService } from '@/services/shiftService';
import type { Counter, Money, Shift, ShiftTotals } from '@/types';
import { useSettingsStore } from './settingsStore';

/* Current counter + open shift of this terminal, with live drawer totals. */

interface ShiftState {
  counters: Counter[];
  counter: Counter | null;
  shift: Shift | null;
  totals: ShiftTotals | null;
  loaded: boolean;
  load(): Promise<void>;
  refreshTotals(): Promise<void>;
  open(openingCash: Money, note: string): Promise<Shift>;
  close(actualCash: Money, note: string, approvedBy: string | null): Promise<Shift>;
}

export const useShiftStore = create<ShiftState>((set, get) => ({
  counters: [],
  counter: null,
  shift: null,
  totals: null,
  loaded: false,

  async load() {
    const counterId = useSettingsStore.getState().device.terminal.counterId;
    const [counters, shift] = await Promise.all([counterService.list(), shiftService.current()]);
    const totals = shift ? await shiftService.totals(shift) : null;
    set({ counters, counter: counters.find((counter) => counter.id === counterId) ?? null, shift, totals, loaded: true });
  },

  async refreshTotals() {
    const { shift } = get();
    if (!shift) return;
    set({ totals: await shiftService.totals(shift) });
  },

  async open(openingCash, note) {
    const shift = await shiftService.open(openingCash, note);
    await get().load();
    return shift;
  },

  async close(actualCash, note, approvedBy) {
    const { shift } = get();
    if (!shift) throw new Error('No open shift');
    const closed = await shiftService.close(shift, actualCash, note, approvedBy);
    await get().load();
    return closed;
  },
}));
