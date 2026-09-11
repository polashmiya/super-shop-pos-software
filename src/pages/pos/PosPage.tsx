import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useCatalogStore, searchProducts } from '@/stores/catalogStore';
import { usePosStore } from '@/stores/posStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useShiftStore } from '@/stores/shiftStore';
import { useT } from '@/i18n';
import { useFormat } from '@/hooks/useFormat';
import { cn } from '@/components/ui/cn';
import { LoadingState } from '@/components/ui/States';
import { CartPanel } from '@/features/pos/CartPanel';
import { CategoryBar } from '@/features/pos/CategoryBar';
import { CustomerPickerModal } from '@/features/pos/CustomerPickerModal';
import { DiscountModal } from '@/features/pos/DiscountModal';
import { HeldSalesDrawer, HoldDialog } from '@/features/pos/HeldSalesDialogs';
import { LineEditModal } from '@/features/pos/LineEditModal';
import { PaymentModal } from '@/features/pos/PaymentModal';
import { ProductGrid } from '@/features/pos/ProductGrid';
import { ProductQuickView, ShiftGate } from '@/features/pos/QuickViewAndGate';
import { SearchBar } from '@/features/pos/SearchBar';
import { usePosKeyboard } from '@/features/pos/usePosKeyboard';
import { usePosUi } from '@/features/pos/posUiStore';
import CounterPosPage from './CounterPosPage';

/* ==========================================================================
   POS — the cashier screen (spec §16–17). Two layouts, chosen per terminal
   in Settings → POS → Screen layout:
   - grid (below): scan box, categories and a virtualised product grid on
     the left; the cart, always visible, with totals and the dominant Pay
     button on the right. Optimised for SCAN → ADD → PAY.
   - counter (CounterPosPage): scan box + wide item list only, no cards.
   ========================================================================== */

export default function PosPage() {
  const layout = useSettingsStore((state) => state.device.pos.layout);
  return layout === 'counter' ? <CounterPosPage /> : <GridPosPage />;
}

function GridPosPage() {
  const t = useT();
  const format = useFormat();
  const searchRef = useRef<HTMLInputElement | null>(null);
  const products = useCatalogStore((state) => state.products);
  const haystacks = useCatalogStore((state) => state.haystacks);
  const catalogStatus = useCatalogStore((state) => state.status);
  const shift = useShiftStore((state) => state.shift);
  const shiftLoaded = useShiftStore((state) => state.loaded);
  const requireShift = useSettingsStore((state) => state.business.shift.requireOpenShift);
  const autoFocus = useSettingsStore((state) => state.device.pos.autoFocusSearch);
  const focusMode = useSettingsStore((state) => state.device.appearance.focusMode);
  const rememberCategory = useSettingsStore((state) => state.device.pos.rememberLastCategory);
  const lastCategoryId = useSettingsStore((state) => state.device.pos.lastCategoryId);
  const updateDevice = useSettingsStore((state) => state.updateDevice);
  const focusTick = usePosStore((state) => state.focusTick);
  const dialog = usePosUi((state) => state.dialog);
  const query = usePosUi((state) => state.query);
  const categoryId = usePosUi((state) => state.categoryId);

  const focusSearch = useCallback(() => {
    requestAnimationFrame(() => searchRef.current?.focus());
  }, []);

  usePosKeyboard({ focusSearch });

  // Restore the last category once.
  useEffect(() => {
    if (rememberCategory && lastCategoryId && usePosUi.getState().categoryId === null) usePosUi.getState().setCategory(lastCategoryId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (rememberCategory && typeof categoryId === 'string' && categoryId !== 'featured') updateDevice({ pos: { lastCategoryId: categoryId } });
    if (rememberCategory && categoryId === null && lastCategoryId) updateDevice({ pos: { lastCategoryId: null } });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoryId, rememberCategory]);

  // Focus recovery: after dialogs close and after every add/clear.
  useEffect(() => {
    if (!dialog && autoFocus) focusSearch();
  }, [dialog, autoFocus, focusSearch, focusTick]);

  // Browsing order (no search): best sellers first, then category order, then name.
  const categoryById = useCatalogStore((state) => state.categoryById);
  const browseOrder = useMemo(() => {
    const rank = (id: string) => categoryById.get(id)?.sortOrder ?? 999;
    return [...products].sort(
      (a, b) =>
        Number(b.featured) - Number(a.featured) ||
        Number(b.stock > 0) - Number(a.stock > 0) ||
        rank(a.categoryId) - rank(b.categoryId) ||
        a.name.en.localeCompare(b.name.en),
    );
  }, [products, categoryById]);

  const results = useMemo(
    () =>
      searchProducts(query ? products : browseOrder, haystacks, query, {
        categoryId: categoryId === 'featured' ? null : categoryId,
        featuredOnly: categoryId === 'featured',
      }),
    [products, browseOrder, haystacks, query, categoryId],
  );

  if (catalogStatus !== 'ready' && products.length === 0) return <LoadingState label={t('common.states.loading')} className="h-full" />;
  if (shiftLoaded && requireShift && !shift) return <ShiftGate />;

  return (
    <div className={cn('grid h-full min-h-0 gap-3 p-3', focusMode ? 'grid-cols-[minmax(0,1fr)_minmax(26rem,36%)]' : 'grid-cols-[minmax(0,1fr)_minmax(22rem,33%)] 2xl:grid-cols-[minmax(0,1fr)_30rem]')}>
      <section aria-label={t('pos.title')} className="flex min-h-0 min-w-0 flex-col gap-3">
        <div className="flex items-center gap-3">
          <SearchBar inputRef={searchRef} results={results} large={focusMode} />
        </div>
        {!focusMode || !query ? <CategoryBar /> : null}
        <div className="flex items-center justify-between px-1 text-xs text-fg-subtle">
          <span>{query ? t('pos.searchResults', { count: results.length }) : t('pos.showingProducts', { count: format.integer(results.length) })}</span>
        </div>
        <ProductGrid products={results} focusMode={focusMode} />
      </section>
      <CartPanel large={focusMode} />

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
