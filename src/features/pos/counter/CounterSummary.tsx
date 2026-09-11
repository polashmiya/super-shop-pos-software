import { ArchiveRestore, Hand, Percent, ScanBarcode, Trash2, X } from 'lucide-react';
import { displayCombo } from '@/app/shortcuts';
import { useFormat } from '@/hooks/useFormat';
import { useLanguage, useT } from '@/i18n';
import { useCatalogStore } from '@/stores/catalogStore';
import { usePosStore } from '@/stores/posStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { cn } from '@/components/ui/cn';
import { Kbd } from '@/components/ui/Display';
import { Tooltip } from '@/components/ui/Tooltip';
import { CustomerBar } from '../CartPanel';
import { applyOrderDiscount, clearCart } from '../posActions';
import { usePosUi } from '../posUiStore';
import { useCartTotals } from '../useCartTotals';

/** What was just scanned — the cashier's confirmation without looking at the list. */
function LastItem() {
  const t = useT();
  const format = useFormat();
  const language = useLanguage();
  const lastAdded = usePosStore((state) => state.lastAdded);
  const line = usePosStore((state) => (state.lastAdded ? state.draft.lines.find((entry) => entry.lineId === state.lastAdded?.lineId) : undefined));
  const unit = useCatalogStore((state) => (line ? state.unitById.get(line.unitId) : undefined));

  if (!line || !lastAdded) {
    return (
      <div className="flex min-h-[6.5rem] items-center gap-3 rounded-xl border border-border bg-surface px-4 text-fg-muted">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-surface-3 text-fg-subtle">
          <ScanBarcode size={22} aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="type-label text-fg-subtle">{t('pos.counter.lastItem')}</p>
          <p className="type-body-sm">{t('pos.counter.none')}</p>
        </div>
      </div>
    );
  }
  const unitShort = unit ? (language === 'bn' ? unit.short.bn : unit.short.en) : '';
  return (
    <div key={lastAdded.at} className="min-h-[6.5rem] rounded-xl border border-primary/40 bg-primary-soft/40 px-4 py-3 animate-bump" aria-live="polite">
      <p className="type-label text-fg-subtle">{t('pos.counter.lastItem')}</p>
      <p className="mt-0.5 line-clamp-2 text-[1.05rem] leading-snug font-bold text-fg">{language === 'bn' ? line.name.bn : line.name.en}</p>
      <p className="mt-1 flex items-baseline justify-between gap-2 tnum">
        <span className="type-body-sm text-fg-muted">
          {format.quantity(line.quantity)}
          {unitShort ? ` ${unitShort}` : ''} × {format.money(line.unitPrice)}
        </span>
        <span className="text-xl font-extrabold text-fg">{format.money(Math.round(line.unitPrice * line.quantity))}</span>
      </p>
    </div>
  );
}

/** Right column of the counter layout: last item, customer, totals, actions and the Pay button. */
export function CounterSummary({ heldCount }: { heldCount: number }) {
  const t = useT();
  const language = useLanguage();
  const format = useFormat();
  const lines = usePosStore((state) => state.draft.lines);
  const orderDiscount = usePosStore((state) => state.draft.orderDiscount);
  const shortcuts = useSettingsStore((state) => state.device.shortcuts);
  const taxLabel = useSettingsStore((state) => (language === 'bn' ? state.business.tax.labelBn : state.business.tax.labelEn));
  const open = usePosUi((state) => state.open);
  const totals = useCartTotals();
  const empty = lines.length === 0;

  const action = 'flex h-12 items-center justify-center gap-1.5 rounded-lg border border-border bg-surface-2 px-2 text-[0.82rem] font-semibold text-fg-muted transition-base hover:bg-surface-3 hover:text-fg disabled:pointer-events-none disabled:opacity-40';

  return (
    <aside aria-label={t('pos.cart.title')} className="flex h-full min-h-0 flex-col gap-3">
      <LastItem />
      <CustomerBar large={false} />

      <div className="mt-auto flex flex-col gap-3">
        <div className="rounded-xl border border-border bg-surface px-4 py-3 text-[0.9rem]">
          <div className="flex justify-between text-fg-muted">
            <span>
              {t('pos.cart.subtotal')} <span className="type-caption">· {t('pos.cart.items', { count: lines.length })}</span>
            </span>
            <span className="tnum">{format.money(totals.subtotal)}</span>
          </div>
          {totals.itemDiscountTotal > 0 && (
            <div className="mt-1 flex justify-between text-success-text">
              <span>{t('pos.cart.itemDiscount')}</span>
              <span className="tnum">−{format.money(totals.itemDiscountTotal)}</span>
            </div>
          )}
          {orderDiscount && totals.orderDiscountTotal > 0 && (
            <div className="mt-1 flex items-center justify-between text-success-text">
              <button type="button" onClick={() => open({ type: 'discount', lineId: null })} className="flex items-center gap-1 rounded-sm hover:underline">
                {orderDiscount.source === 'customer' ? t('pos.cart.customerDiscount') : t('pos.cart.orderDiscount')}
                {orderDiscount.type === 'percent' && <span className="tnum">({format.number(orderDiscount.value / 100, 1)}%)</span>}
              </button>
              <span className="flex items-center gap-1 tnum">
                −{format.money(totals.orderDiscountTotal)}
                <button type="button" onClick={() => void applyOrderDiscount(null, '')} aria-label={t('pos.discount.remove')} className="flex h-6 w-6 items-center justify-center rounded-md text-fg-subtle hover:bg-surface-3 hover:text-fg">
                  <X size={13} aria-hidden />
                </button>
              </span>
            </div>
          )}
          {totals.taxTotal > 0 && (
            <div className="mt-1 flex justify-between text-fg-muted">
              <span>{totals.taxMode === 'inclusive' ? `${taxLabel} (${t('pos.cart.vatIncluded')})` : taxLabel}</span>
              <span className="tnum">{format.money(totals.taxTotal)}</span>
            </div>
          )}
          {totals.roundingAdjustment !== 0 && (
            <div className="mt-1 flex justify-between text-fg-muted">
              <span>{t('pos.cart.rounding')}</span>
              <span className="tnum">{format.money(totals.roundingAdjustment, { signed: true })}</span>
            </div>
          )}
          <div className="mt-2 flex items-end justify-between border-t border-border pt-2.5">
            <span className="type-h3 text-fg-muted">{t('pos.cart.total')}</span>
            <span className="type-total text-[2.2rem] text-fg" aria-live="polite">
              {format.money(totals.grandTotal)}
            </span>
          </div>
          {totals.savings > 0 && <p className="text-end text-xs font-medium text-success-text">{t('pos.cart.savings', { amount: format.money(totals.savings) })}</p>}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Tooltip content={t('pos.actions.hold')} shortcut={displayCombo(shortcuts.holdSale)}>
            <button type="button" className={action} disabled={empty} onClick={() => open({ type: 'hold' })}>
              <Hand size={16} aria-hidden />
              {t('pos.actions.hold')}
            </button>
          </Tooltip>
          <Tooltip content={t('pos.actions.recall')} shortcut={displayCombo(shortcuts.recallSale)}>
            <button type="button" className={cn(action, 'relative')} onClick={() => open({ type: 'held' })}>
              <ArchiveRestore size={16} aria-hidden />
              {t('pos.actions.recall')}
              {heldCount > 0 && <span className="absolute -end-1 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-warning px-1 text-[0.68rem] font-bold text-warning-fg tnum">{heldCount}</span>}
            </button>
          </Tooltip>
          <Tooltip content={t('pos.actions.discount')} shortcut={displayCombo(shortcuts.discount)}>
            <button type="button" className={action} disabled={empty} onClick={() => open({ type: 'discount', lineId: null })}>
              <Percent size={16} aria-hidden />
              {t('pos.actions.discount')}
            </button>
          </Tooltip>
          <Tooltip content={t('pos.actions.clear')} shortcut={displayCombo(shortcuts.clearCart)}>
            <button type="button" className={cn(action, 'hover:text-danger-text')} disabled={empty} onClick={() => void clearCart()}>
              <Trash2 size={16} aria-hidden />
              {t('pos.actions.clear')}
            </button>
          </Tooltip>
        </div>

        <button
          type="button"
          disabled={empty}
          onClick={() => open({ type: 'payment' })}
          className={cn(
            'flex h-[4.5rem] w-full items-center justify-between gap-3 rounded-xl bg-primary px-5 text-xl font-bold text-primary-fg shadow-glow transition-base',
            'hover:bg-primary-hover active:scale-[0.99] disabled:pointer-events-none disabled:opacity-40 disabled:shadow-none',
          )}
        >
          <span className="flex items-center gap-2.5">
            {t('pos.cart.payNow')}
            <Kbd tone="onPrimary">{displayCombo(shortcuts.payment)}</Kbd>
          </span>
          <span className="tnum">{format.money(totals.grandTotal)}</span>
        </button>
      </div>
    </aside>
  );
}
