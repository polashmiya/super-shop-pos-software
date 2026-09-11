import { useMemo } from 'react';
import { cartTotals } from '@/services/pricingService';
import { usePosStore } from '@/stores/posStore';
import { useSettingsStore } from '@/stores/settingsStore';
import type { CartTotals } from '@/types';

/** Totals are derived from the cart on every change (never stored). */
export function useCartTotals(): CartTotals {
  const draft = usePosStore((state) => state.draft);
  const business = useSettingsStore((state) => state.business);
  return useMemo(() => cartTotals(draft, business), [draft, business]);
}
