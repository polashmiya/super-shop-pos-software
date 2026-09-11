import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { displayCombo } from '@/app/shortcuts';
import { useAsync } from '@/hooks/useAsync';
import { useFormat } from '@/hooks/useFormat';
import { useT } from '@/i18n';
import { listHeldSales } from '@/services/heldSaleService';
import { searchProducts, useCatalogStore } from '@/stores/catalogStore';
import { usePosStore } from '@/stores/posStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useShiftStore } from '@/stores/shiftStore';
import type { Product } from '@/types';
import { Kbd } from '@/components/ui/Display';
import { LoadingState } from '@/components/ui/States';
import { CounterLinesTable } from '@/features/pos/counter/CounterLinesTable';
import { CounterSuggestions } from '@/features/pos/counter/CounterSuggestions';
import { CounterSummary } from '@/features/pos/counter/CounterSummary';
import { CustomerPickerModal } from '@/features/pos/CustomerPickerModal';
import { DiscountModal } from '@/features/pos/DiscountModal';
import { HeldSalesDrawer, HoldDialog } from '@/features/pos/HeldSalesDialogs';
import { LineEditModal } from '@/features/pos/LineEditModal';
import { PaymentModal } from '@/features/pos/PaymentModal';
import { addProductToCart } from '@/features/pos/posActions';
import { usePosUi } from '@/features/pos/posUiStore';
import { ProductQuickView, ShiftGate } from '@/features/pos/QuickViewAndGate';
import { SearchBar } from '@/features/pos/SearchBar';
import { useCartTotals } from '@/features/pos/useCartTotals';
import { usePosKeyboard } from '@/features/pos/usePosKeyboard';

/* ==========================================================================
   POS — counter layout (Settings → POS → Screen layout → "Scan-only
   counter"). No product cards: one scan box across the top with search
   suggestions, the sale as a wide table underneath (twice the lines of the
   grid layout), and a narrow column with the last item, totals and Pay.
   The same cart, payment and shortcut code as the grid layout.
   ========================================================================== */

const SUGGESTION_LIMIT = 8;

function StatusStrip() {
  const t = useT();
  const format = useFormat();
  const totals = useCartTotals();
  const shortcuts = useSettingsStore((state) => state.device.shortcuts);
  const hint = (keys: string[], label: string) => (
    <span className="inline-flex items-center gap-1">
      {keys.map((key) => (
        <Kbd key={key}>{key}</Kbd>
      ))}
      {label}
    </span>
  );
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-1 type-caption text-fg-subtle">
      <span className="tnum">
        {t('pos.cart.items', { count: totals.itemCount })} · {t('pos.counter.quantity', { qty: format.quantity(totals.totalQuantity) })}
      </span>
      <span className="hidden flex-wrap items-center gap-x-4 md:flex">
        {hint(['↑', '↓'], t('pos.counter.hints.select'))}
        {hint([displayCombo(shortcuts.increaseQty), displayCombo(shortcuts.decreaseQty)], t('pos.counter.hints.qty'))}
        {hint([displayCombo(shortcuts.removeItem)], t('pos.counter.hints.remove'))}
        {hint([displayCombo(shortcuts.payment)], t('pos.counter.hints.pay'))}
      </span>
    </div>
  );
}

export default function CounterPosPage() {
  const t = useT();
  const searchRef = useRef<HTMLInputElement | null>(null);
  const listboxId = useId();
  const products = useCatalogStore((state) => state.products);
  const haystacks = useCatalogStore((state) => state.haystacks);
  const catalogStatus = useCatalogStore((state) => state.status);
  const shift = useShiftStore((state) => state.shift);
  const shiftLoaded = useShiftStore((state) => state.loaded);
  const requireShift = useSettingsStore((state) => state.business.shift.requireOpenShift);
  const autoFocus = useSettingsStore((state) => state.device.pos.autoFocusSearch);
  const focusTick = usePosStore((state) => state.focusTick);
  const dialog = usePosUi((state) => state.dialog);
  const query = usePosUi((state) => state.query);
  const typedQuantity = usePosUi((state) => state.typedQuantity);
  const [searchFocused, setSearchFocused] = useState(false);
  const held = useAsync(() => listHeldSales(), [dialog === null]);
  const heldCount = held.data?.length ?? 0;

  const focusSearch = useCallback(() => {
    requestAnimationFrame(() => searchRef.current?.focus());
  }, []);

  usePosKeyboard({ focusSearch });

  // Focus recovery: after dialogs close and after every add/clear.
  useEffect(() => {
    if (!dialog && autoFocus) focusSearch();
  }, [dialog, autoFocus, focusSearch, focusTick]);

  const results = useMemo(() => (query ? searchProducts(products, haystacks, query, { limit: SUGGESTION_LIMIT }) : []), [products, haystacks, query]);

  const pick = useCallback(
    (product: Product) => {
      const quantity = usePosUi.getState().typedQuantity ?? 1;
      usePosUi.getState().setQuery('');
      addProductToCart(product, quantity, 'tap');
      focusSearch();
    },
    [focusSearch],
  );

  if (catalogStatus !== 'ready' && products.length === 0) return <LoadingState label={t('common.states.loading')} className="h-full" />;
  if (shiftLoaded && requireShift && !shift) return <ShiftGate />;

  return (
    <div className="grid h-full min-h-0 grid-cols-[minmax(0,1fr)_clamp(18rem,26vw,23rem)] gap-3 p-3">
      <section aria-label={t('pos.counter.title')} className="flex min-h-0 min-w-0 flex-col gap-3">
        <div
          className="relative flex items-center"
          onFocus={() => setSearchFocused(true)}
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget)) setSearchFocused(false);
          }}
        >
          <SearchBar inputRef={searchRef} results={results} large placeholder={t('pos.counter.placeholder')} listboxId={listboxId} />
          {searchFocused && query && <CounterSuggestions id={listboxId} results={results} quantity={typedQuantity} onPick={pick} />}
        </div>
        <CounterLinesTable heldCount={heldCount} />
        <StatusStrip />
      </section>
      <CounterSummary heldCount={heldCount} />

      <PaymentModal />
      <DiscountModal />
      <LineEditModal />
      <HoldDialog />
      <HeldSalesDrawer />
      <CustomerPickerModal />
      <ProductQuickView />
    </div>
  );
}
