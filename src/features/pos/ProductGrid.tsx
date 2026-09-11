import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PackageSearch } from 'lucide-react';
import { CARD_MIN_WIDTH } from '@/config/theme.config';
import { useFormat } from '@/hooks/useFormat';
import { useElementSize } from '@/hooks/useCommon';
import { useLanguage, useT } from '@/i18n';
import { usePosStore } from '@/stores/posStore';
import { useCatalogStore } from '@/stores/catalogStore';
import { useSettingsStore } from '@/stores/settingsStore';
import type { Product } from '@/types';
import { cn } from '@/components/ui/cn';
import { EmptyState } from '@/components/ui/States';
import { ProductCard } from '@/components/product/ProductCard';
import { productCardHeight, type ProductCardDisplay } from '@/components/product/layout';
import { addProductToCart } from './posActions';
import { usePosUi } from './posUiStore';

const GAP = 10;
const OVERSCAN_ROWS = 2;

/**
 * Virtualised product grid: only the visible rows (+ a small overscan) are
 * rendered, so 1,000+ products scroll smoothly. Columns adapt to the width;
 * card height adapts to the image setting (no empty image space when off).
 */
export const ProductGrid = memo(function ProductGrid({ products, focusMode }: { products: readonly Product[]; focusMode: boolean }) {
  const t = useT();
  const language = useLanguage();
  const format = useFormat();
  const pos = useSettingsStore((state) => state.device.pos);
  const appearance = useSettingsStore((state) => state.device.appearance);
  const expiringDays = useSettingsStore((state) => state.business.inventory.expiryAlertDays);
  const unitById = useCatalogStore((state) => state.unitById);
  const lines = usePosStore((state) => state.draft.lines);
  const lastAdded = usePosStore((state) => state.lastAdded);
  const highlight = usePosUi((state) => state.highlight);
  const query = usePosUi((state) => state.query);
  const categoryId = usePosUi((state) => state.categoryId);
  const openDialog = usePosUi((state) => state.open);
  const [containerRef, size] = useElementSize<HTMLDivElement>();
  const [scrollTop, setScrollTop] = useState(0);
  const [flashId, setFlashId] = useState<string | null>(null);
  const frame = useRef<number | null>(null);

  const display: ProductCardDisplay = useMemo(
    () => ({
      showImage: pos.showProductImages,
      imageSize: pos.productImageSize,
      showSku: pos.showSku && !focusMode,
      showBarcode: pos.showBarcode && !focusMode,
      showStock: pos.showStock,
      showMrp: pos.showMrp,
      showDiscount: pos.showDiscount,
      showSecondaryName: pos.showSecondaryName && !focusMode,
      expiringDays,
    }),
    [pos, focusMode, expiringDays],
  );

  const inCart = useMemo(() => {
    const map = new Map<string, number>();
    for (const line of lines) map.set(line.productId, (map.get(line.productId) ?? 0) + line.quantity);
    return map;
  }, [lines]);

  // Brief highlight on the card that was just added.
  useEffect(() => {
    if (!lastAdded) return;
    const line = usePosStore.getState().draft.lines.find((entry) => entry.lineId === lastAdded.lineId);
    if (!line) return;
    const show = setTimeout(() => setFlashId(line.productId), 0);
    const hide = setTimeout(() => setFlashId(null), 650);
    return () => {
      clearTimeout(show);
      clearTimeout(hide);
    };
  }, [lastAdded]);

  // Back to the top when the filter changes.
  useEffect(() => {
    const element = containerRef.current;
    if (element) element.scrollTop = 0;
    const timer = setTimeout(() => setScrollTop(0), 0);
    return () => clearTimeout(timer);
  }, [query, categoryId, containerRef]);

  const onAdd = useCallback((product: Product) => {
    addProductToCart(product, 1, 'tap');
  }, []);
  const onInfo = useCallback((product: Product) => openDialog({ type: 'quickView', productId: product.id }), [openDialog]);

  const rootFont = appearance.baseFontPx;
  const minWidth = CARD_MIN_WIDTH[appearance.cardSize] * (rootFont / 15);
  const width = Math.max(size.width - 4, minWidth);
  const columns = Math.max(1, Math.floor((width + GAP) / (minWidth + GAP)));
  const cardHeight = productCardHeight(display, rootFont);
  const rowHeight = cardHeight + GAP;
  const rowCount = Math.ceil(products.length / columns);
  const viewport = size.height || 800;
  const startRow = Math.max(0, Math.floor(scrollTop / rowHeight) - OVERSCAN_ROWS);
  const endRow = Math.min(rowCount, Math.ceil((scrollTop + viewport) / rowHeight) + OVERSCAN_ROWS);
  const visible = products.slice(startRow * columns, endRow * columns);

  if (products.length === 0) {
    return (
      <div ref={containerRef} className="flex min-h-0 flex-1 items-center justify-center">
        <EmptyState icon={PackageSearch} title={t('pos.noProductsFound')} description={t('pos.noProductsHint')} />
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="min-h-0 flex-1 overflow-y-auto pe-1"
      onScroll={(event) => {
        const top = event.currentTarget.scrollTop;
        if (frame.current !== null) cancelAnimationFrame(frame.current);
        frame.current = requestAnimationFrame(() => setScrollTop(top));
      }}
    >
      <div style={{ height: rowCount * rowHeight, position: 'relative' }}>
        <div
          role="list"
          className="grid"
          style={{
            gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
            gap: GAP,
            gridAutoRows: cardHeight,
            transform: `translateY(${startRow * rowHeight}px)`,
          }}
        >
          {visible.map((product, index) => {
            const absoluteIndex = startRow * columns + index;
            const highlighted = query !== '' && absoluteIndex === highlight;
            return (
              <div key={product.id} role="listitem" className={cn('min-w-0 rounded-lg', highlighted && 'ring-2 ring-primary ring-offset-2 ring-offset-bg')}>
                <ProductCard
                  product={product}
                  unit={unitById.get(product.unitId)}
                  display={display}
                  language={language}
                  t={t}
                  format={format}
                  flashing={flashId === product.id}
                  inCart={inCart.get(product.id) ?? 0}
                  onAdd={onAdd}
                  onInfo={onInfo}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
});
