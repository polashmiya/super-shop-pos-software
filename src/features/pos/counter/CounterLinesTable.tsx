import { useCallback, useEffect, useMemo, useRef } from 'react';
import { ArchiveRestore, ScanBarcode } from 'lucide-react';
import { displayCombo } from '@/app/shortcuts';
import { useFormat } from '@/hooks/useFormat';
import { useLanguage, useT } from '@/i18n';
import { useCatalogStore } from '@/stores/catalogStore';
import { usePosStore } from '@/stores/posStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { Kbd } from '@/components/ui/Display';
import { removeLine, stepLineQuantity } from '../posActions';
import { usePosUi } from '../posUiStore';
import { useCartTotals } from '../useCartTotals';
import { CounterLineRow } from './CounterLineRow';

/** The sale as a wide table — many lines visible, the newest scrolled into view. */
export function CounterLinesTable({ heldCount }: { heldCount: number }) {
  const t = useT();
  const language = useLanguage();
  const format = useFormat();
  const lines = usePosStore((state) => state.draft.lines);
  const selectedLineId = usePosStore((state) => state.selectedLineId);
  const lastAdded = usePosStore((state) => state.lastAdded);
  const select = usePosStore((state) => state.select);
  const showImages = useSettingsStore((state) => state.device.pos.showProductImages);
  const showSecondaryName = useSettingsStore((state) => state.device.pos.showSecondaryName);
  const shortcuts = useSettingsStore((state) => state.device.shortcuts);
  const unitById = useCatalogStore((state) => state.unitById);
  const productById = useCatalogStore((state) => state.byId);
  const open = usePosUi((state) => state.open);
  const totals = useCartTotals();
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!lastAdded) return;
    scrollRef.current?.querySelector(`[data-line-id="${lastAdded.lineId}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [lastAdded]);

  const totalsById = useMemo(() => new Map(totals.lines.map((line) => [line.lineId, line])), [totals]);
  const onEdit = useCallback((lineId: string, focus: 'quantity' | 'price' | 'note') => open({ type: 'lineEdit', lineId, focus }), [open]);
  const onDiscount = useCallback((lineId: string) => open({ type: 'discount', lineId }), [open]);

  if (lines.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-border-strong bg-surface/60 p-8 text-center">
        <span className="flex h-20 w-20 items-center justify-center rounded-3xl bg-primary-soft text-primary-soft-fg">
          <ScanBarcode size={38} aria-hidden strokeWidth={1.6} />
        </span>
        <div className="max-w-md">
          <p className="type-h2 text-fg">{t('pos.counter.ready')}</p>
          <p className="type-body mt-1 text-fg-muted">{t('pos.counter.readyHint')}</p>
          <p className="type-caption mt-3 text-fg-subtle">{t('pos.counter.qtyTip')}</p>
        </div>
        {heldCount > 0 && (
          <button type="button" onClick={() => open({ type: 'held' })} className="inline-flex min-h-touch items-center gap-2 rounded-lg border border-border bg-surface px-4 font-semibold text-fg transition-base hover:bg-surface-2">
            <ArchiveRestore size={18} aria-hidden />
            {t('pos.counter.resumeHeld', { count: heldCount })}
            <Kbd>{displayCombo(shortcuts.recallSale)}</Kbd>
          </button>
        )}
      </div>
    );
  }

  return (
    <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto rounded-xl border border-border bg-surface shadow-sm">
      <table className="w-full table-fixed border-collapse text-[0.92rem]" aria-label={t('pos.cart.title')}>
        <thead className="sticky top-0 z-[1] bg-surface-2 text-start type-label text-fg-muted shadow-[0_1px_0_var(--c-border)]">
          <tr>
            <th scope="col" className="w-10 px-2 py-2 text-center font-semibold">{t('pos.counter.columns.no')}</th>
            <th scope="col" className="px-2 py-2 text-start font-semibold">{t('pos.counter.columns.item')}</th>
            <th scope="col" className="w-28 px-2 py-2 text-end font-semibold">{t('pos.counter.columns.price')}</th>
            <th scope="col" className="w-40 px-2 py-2 text-center font-semibold">{t('pos.counter.columns.qty')}</th>
            <th scope="col" className="hidden w-24 px-2 py-2 text-end font-semibold lg:table-cell">{t('pos.counter.columns.discount')}</th>
            <th scope="col" className="w-32 px-2 py-2 text-end font-semibold">{t('pos.counter.columns.amount')}</th>
            <th scope="col" className="w-24 px-1 py-2">
              <span className="sr-only">{t('common.labels.actions')}</span>
            </th>
          </tr>
        </thead>
        <tbody aria-live="polite">
          {lines.map((line, index) => (
            <CounterLineRow
              key={line.lineId}
              index={index}
              line={line}
              totals={totalsById.get(line.lineId)}
              unit={unitById.get(line.unitId)}
              selected={line.lineId === selectedLineId}
              flashing={lastAdded?.lineId === line.lineId ? lastAdded.at : null}
              showImage={showImages}
              showSecondaryName={showSecondaryName}
              categoryId={productById.get(line.productId)?.categoryId ?? ''}
              language={language}
              t={t}
              format={format}
              onSelect={select}
              onStep={stepLineQuantity}
              onRemove={removeLine}
              onEdit={onEdit}
              onDiscount={onDiscount}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}
