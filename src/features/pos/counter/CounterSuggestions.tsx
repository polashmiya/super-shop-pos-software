import { useEffect, useRef } from 'react';
import { PackageSearch } from 'lucide-react';
import { getStockStatus } from '@/domain/stock';
import { useFormat } from '@/hooks/useFormat';
import { useLanguage, useT } from '@/i18n';
import { useCatalogStore } from '@/stores/catalogStore';
import { useSettingsStore } from '@/stores/settingsStore';
import type { Product } from '@/types';
import { cn } from '@/components/ui/cn';
import { Kbd } from '@/components/ui/Display';
import { ProductImage } from '@/components/product/ProductImage';
import { stockStatusBadge } from '@/components/product/stockStatus';
import { usePosUi } from '../posUiStore';

interface CounterSuggestionsProps {
  id: string;
  results: readonly Product[];
  /** Quantity typed in front of the search text ("3*"), shown on the rows. */
  quantity: number | null;
  onPick: (product: Product) => void;
}

/**
 * The counter layout has no product grid, so typing shows the best matches
 * right under the scan box: ↑/↓ move, Enter adds, a click adds. Rows keep
 * the mouse from stealing focus so the scanner keeps working.
 */
export function CounterSuggestions({ id, results, quantity, onPick }: CounterSuggestionsProps) {
  const t = useT();
  const format = useFormat();
  const language = useLanguage();
  const query = usePosUi((state) => state.query);
  const highlight = usePosUi((state) => state.highlight);
  const setHighlight = usePosUi((state) => state.setHighlight);
  const unitById = useCatalogStore((state) => state.unitById);
  const showImages = useSettingsStore((state) => state.device.pos.showProductImages);
  const showSecondaryName = useSettingsStore((state) => state.device.pos.showSecondaryName);
  const expiringDays = useSettingsStore((state) => state.business.inventory.expiryAlertDays);
  const listRef = useRef<HTMLUListElement | null>(null);

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${highlight}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [highlight, results]);

  return (
    <div className="absolute inset-x-0 top-full z-30 mt-2 overflow-hidden rounded-xl border border-border bg-surface shadow-lg animate-pop-in" onMouseDown={(event) => event.preventDefault()}>
      {results.length === 0 ? (
        <div className="flex items-center gap-3 px-4 py-4 text-fg-muted">
          <PackageSearch size={22} aria-hidden className="shrink-0 text-fg-subtle" />
          <div className="min-w-0">
            <p className="font-medium text-fg">{t('pos.counter.noMatch', { query })}</p>
            <p className="type-caption text-fg-subtle">{t('pos.counter.noMatchHint')}</p>
          </div>
        </div>
      ) : (
        <ul ref={listRef} id={id} role="listbox" aria-label={t('pos.counter.suggestions')} className="max-h-[22rem] overflow-y-auto py-1">
          {results.map((product, index) => {
            const name = language === 'bn' ? product.name.bn : product.name.en;
            const secondary = language === 'bn' ? product.name.en : product.name.bn;
            const unit = unitById.get(product.unitId);
            const status = getStockStatus(product, expiringDays);
            const badge = stockStatusBadge(status);
            const active = index === Math.min(highlight, results.length - 1);
            return (
              <li
                key={product.id}
                role="option"
                aria-selected={active}
                data-index={index}
                onMouseEnter={() => setHighlight(index)}
                onClick={() => onPick(product)}
                className={cn('flex min-h-touch cursor-pointer items-center gap-3 px-3 py-1.5 transition-base', active ? 'bg-primary-soft' : 'hover:bg-surface-2')}
              >
                {showImages && <ProductImage product={product} className="h-10 w-10 shrink-0" iconSize={18} />}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-fg">{name}</p>
                  <p className="type-caption flex flex-wrap items-center gap-x-2 text-fg-subtle">
                    <span className="font-mono">{product.sku}</span>
                    {showSecondaryName && secondary && <span className="truncate">{secondary}</span>}
                    <span className={cn('inline-flex items-center gap-1', status === 'out_of_stock' ? 'text-danger-text' : status === 'low_stock' ? 'text-warning-text' : '')}>
                      <badge.icon size={12} aria-hidden />
                      {format.quantity(product.stock)}
                      {unit ? ` ${language === 'bn' ? unit.short.bn : unit.short.en}` : ''}
                    </span>
                  </p>
                </div>
                {quantity !== null && <span className="shrink-0 rounded-md bg-surface-3 px-2 py-0.5 text-xs font-bold text-fg-muted tnum">× {format.quantity(quantity)}</span>}
                <span className="shrink-0 text-end">
                  <span className="block font-bold text-fg tnum">{format.money(product.sellingPrice)}</span>
                  {product.mrp !== null && product.mrp > product.sellingPrice && <span className="block type-caption text-fg-subtle line-through tnum">{format.money(product.mrp)}</span>}
                </span>
                {active && <Kbd className="hidden shrink-0 sm:inline-flex">Enter</Kbd>}
              </li>
            );
          })}
        </ul>
      )}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border bg-surface-2 px-3 py-1.5 type-caption text-fg-subtle">
        <span className="inline-flex items-center gap-1">
          <Kbd>↑</Kbd>
          <Kbd>↓</Kbd> {t('pos.counter.hints.select')}
        </span>
        <span className="inline-flex items-center gap-1">
          <Kbd>Enter</Kbd> {t('pos.counter.hints.add')}
        </span>
        <span className="inline-flex items-center gap-1">
          <Kbd>Esc</Kbd> {t('pos.counter.hints.clear')}
        </span>
        <span className="ms-auto hidden md:inline">{t('pos.counter.qtyTip')}</span>
      </div>
    </div>
  );
}
