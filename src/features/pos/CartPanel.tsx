import { useCallback, useEffect, useMemo, useRef } from 'react';
import { ArchiveRestore, Crown, Hand, Percent, ShoppingBasket, Trash2, UserPlus, UserRound, X } from 'lucide-react';
import { displayCombo } from '@/app/shortcuts';
import { useAsync } from '@/hooks/useAsync';
import { useFormat } from '@/hooks/useFormat';
import { useLanguage, useT } from '@/i18n';
import { listHeldSales } from '@/services/heldSaleService';
import { useCatalogStore } from '@/stores/catalogStore';
import { usePosStore } from '@/stores/posStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { cn } from '@/components/ui/cn';
import { Tooltip } from '@/components/ui/Tooltip';
import { Kbd } from '@/components/ui/Display';
import { CartLineItem } from './CartLineItem';
import { useCartTotals } from './useCartTotals';
import { applyOrderDiscount, clearCart, removeLine, selectCustomer, stepLineQuantity } from './posActions';
import { usePosUi } from './posUiStore';

/** Walk-in / selected customer with the member panel (shared by both POS layouts). */
export function CustomerBar({ large }: { large: boolean }) {
  const t = useT();
  const format = useFormat();
  const customer = usePosStore((state) => state.customer);
  const open = usePosUi((state) => state.open);
  const shortcut = useSettingsStore((state) => state.device.shortcuts.selectCustomer);
  const showPanel = useSettingsStore((state) => state.device.pos.showCustomerPanel);
  const orderDiscount = usePosStore((state) => state.draft.orderDiscount);

  if (!customer) {
    return (
      <Tooltip content={t('pos.cart.selectCustomer')} shortcut={displayCombo(shortcut)}>
        <button
          type="button"
          onClick={() => open({ type: 'customer' })}
          className={cn('flex w-full items-center gap-3 rounded-lg border border-dashed border-border-strong px-3 text-start transition-base hover:border-primary hover:bg-primary-soft/30', large ? 'h-14' : 'h-12')}
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-3 text-fg-muted">
            <UserRound size={17} aria-hidden />
          </span>
          <span className="flex-1 truncate text-sm text-fg-muted">{t('pos.cart.walkIn')}</span>
          <span className="flex items-center gap-1.5 text-sm font-semibold text-primary">
            <UserPlus size={17} aria-hidden />
            {t('pos.cart.selectCustomer')}
          </span>
        </button>
      </Tooltip>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-surface-2 px-3 py-2">
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary-soft-fg">
          {customer.customerType === 'vip' ? <Crown size={17} aria-hidden /> : <UserRound size={17} aria-hidden />}
        </span>
        <button type="button" onClick={() => open({ type: 'customer' })} className="min-w-0 flex-1 text-start" aria-label={t('pos.cart.changeCustomer')}>
          <p className="truncate text-[0.92rem] font-semibold text-fg">{customer.name}</p>
          <p className="truncate text-xs text-fg-muted tnum">
            {format.digits(customer.phone)} · {t(`enums.customerType.${customer.customerType}`)}
          </p>
        </button>
        <button type="button" onClick={() => selectCustomer(null)} aria-label={t('pos.cart.removeCustomer')} className="flex h-9 w-9 items-center justify-center rounded-md text-fg-subtle hover:bg-surface-3 hover:text-fg">
          <X size={17} aria-hidden />
        </button>
      </div>
      {showPanel && (
        <div className="mt-2 grid grid-cols-3 gap-2 border-t border-border pt-2 text-center">
          <div>
            <p className="text-[0.68rem] text-fg-subtle">{t('pos.customerPanel.points')}</p>
            <p className="text-sm font-bold text-fg tnum">{format.integer(customer.loyaltyPoints)}</p>
          </div>
          <div>
            <p className="text-[0.68rem] text-fg-subtle">{t('pos.customerPanel.orders')}</p>
            <p className="text-sm font-bold text-fg tnum">{format.integer(customer.totalOrders)}</p>
          </div>
          <div>
            <p className="text-[0.68rem] text-fg-subtle">{t('pos.customerPanel.spent')}</p>
            <p className="text-sm font-bold text-fg tnum">{format.compactMoney(customer.totalSpent)}</p>
          </div>
          {orderDiscount?.source === 'customer' && (
            <p className="col-span-3 rounded-md bg-success-soft px-2 py-1 text-xs font-semibold text-success-text">
              {t('pos.customerPanel.discountEligible', { rate: format.number(orderDiscount.value / 100, 1) })}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export function CartPanel({ large }: { large: boolean }) {
  const t = useT();
  const language = useLanguage();
  const format = useFormat();
  const lines = usePosStore((state) => state.draft.lines);
  const orderDiscount = usePosStore((state) => state.draft.orderDiscount);
  const selectedLineId = usePosStore((state) => state.selectedLineId);
  const lastAdded = usePosStore((state) => state.lastAdded);
  const select = usePosStore((state) => state.select);
  const showImages = useSettingsStore((state) => state.device.pos.showProductImages);
  const shortcuts = useSettingsStore((state) => state.device.shortcuts);
  const taxLabel = useSettingsStore((state) => (language === 'bn' ? state.business.tax.labelBn : state.business.tax.labelEn));
  const unitById = useCatalogStore((state) => state.unitById);
  const productById = useCatalogStore((state) => state.byId);
  const open = usePosUi((state) => state.open);
  const dialog = usePosUi((state) => state.dialog);
  const totals = useCartTotals();
  const listRef = useRef<HTMLUListElement | null>(null);
  const held = useAsync(() => listHeldSales(), [dialog === null]);
  const heldCount = held.data?.length ?? 0;

  useEffect(() => {
    if (!lastAdded) return;
    listRef.current?.querySelector(`[data-line-id="${lastAdded.lineId}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [lastAdded]);

  const totalsById = useMemo(() => new Map(totals.lines.map((line) => [line.lineId, line])), [totals]);
  const onEdit = useCallback((lineId: string, focus: 'quantity' | 'price' | 'note') => open({ type: 'lineEdit', lineId, focus }), [open]);
  const onDiscount = useCallback((lineId: string) => open({ type: 'discount', lineId }), [open]);
  const empty = lines.length === 0;

  const actionButton = 'flex h-11 flex-1 items-center justify-center gap-1.5 rounded-lg border border-border bg-surface-2 px-2 text-[0.8rem] font-semibold text-fg-muted transition-base hover:bg-surface-3 hover:text-fg disabled:opacity-40 disabled:pointer-events-none';

  return (
    <section aria-label={t('pos.cart.title')} className="flex h-full min-h-0 flex-col rounded-xl border border-border bg-surface shadow-sm">
      <header className="flex items-center justify-between gap-2 px-4 pt-3 pb-2">
        <div className="flex items-center gap-2">
          <ShoppingBasket size={20} aria-hidden className="text-primary" />
          <h2 className="type-h3 text-fg">{t('pos.cart.title')}</h2>
          {!empty && <span className="rounded-full bg-primary-soft px-2 py-0.5 text-xs font-bold text-primary-soft-fg tnum">{t('pos.cart.items', { count: lines.length })}</span>}
        </div>
      </header>

      <div className="px-3 pb-2">
        <CustomerBar large={large} />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto border-y border-border px-2 py-2">
        {empty ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
            <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-surface-3 text-fg-subtle">
              <ShoppingBasket size={30} aria-hidden strokeWidth={1.6} />
            </span>
            <p className="type-h3 text-fg">{t('pos.cart.empty')}</p>
            <p className="type-body-sm text-fg-muted">{t('pos.cart.emptyHint')}</p>
          </div>
        ) : (
          <ul ref={listRef} className="flex flex-col gap-1" aria-live="polite">
            {lines.map((line) => (
              <CartLineItem
                key={line.lineId}
                line={line}
                totals={totalsById.get(line.lineId)}
                unit={unitById.get(line.unitId)}
                selected={line.lineId === selectedLineId}
                flashing={lastAdded?.lineId === line.lineId ? lastAdded.at : null}
                showImage={showImages}
                large={large}
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
          </ul>
        )}
      </div>

      <div className="flex flex-col gap-1 px-4 pt-3 text-[0.9rem]">
        <div className="flex justify-between text-fg-muted">
          <span>{t('pos.cart.subtotal')}</span>
          <span className="tnum">{format.money(totals.subtotal)}</span>
        </div>
        {totals.itemDiscountTotal > 0 && (
          <div className="flex justify-between text-success-text">
            <span>{t('pos.cart.itemDiscount')}</span>
            <span className="tnum">−{format.money(totals.itemDiscountTotal)}</span>
          </div>
        )}
        {orderDiscount && totals.orderDiscountTotal > 0 && (
          <div className="flex items-center justify-between text-success-text">
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
          <div className="flex justify-between text-fg-muted">
            <span>{totals.taxMode === 'inclusive' ? `${taxLabel} (${t('pos.cart.vatIncluded')})` : taxLabel}</span>
            <span className="tnum">{format.money(totals.taxTotal)}</span>
          </div>
        )}
        {totals.roundingAdjustment !== 0 && (
          <div className="flex justify-between text-fg-muted">
            <span>{t('pos.cart.rounding')}</span>
            <span className="tnum">{format.money(totals.roundingAdjustment, { signed: true })}</span>
          </div>
        )}
        <div className="mt-1.5 flex items-end justify-between border-t border-border pt-2.5">
          <span className="type-h3 text-fg-muted">{t('pos.cart.total')}</span>
          <span className={cn('type-total text-fg', large && 'text-[2.4rem]')} aria-live="polite">
            {format.money(totals.grandTotal)}
          </span>
        </div>
        {totals.savings > 0 && <p className="text-end text-xs font-medium text-success-text">{t('pos.cart.savings', { amount: format.money(totals.savings) })}</p>}
      </div>

      <div className="flex flex-col gap-2 p-3">
        <div className="flex gap-2">
          <Tooltip content={t('pos.actions.hold')} shortcut={displayCombo(shortcuts.holdSale)}>
            <button type="button" className={actionButton} disabled={empty} onClick={() => open({ type: 'hold' })}>
              <Hand size={16} aria-hidden />
              {t('pos.actions.hold')}
            </button>
          </Tooltip>
          <Tooltip content={t('pos.actions.recall')} shortcut={displayCombo(shortcuts.recallSale)}>
            <button type="button" className={cn(actionButton, 'relative')} onClick={() => open({ type: 'held' })}>
              <ArchiveRestore size={16} aria-hidden />
              {t('pos.actions.recall')}
              {heldCount > 0 && <span className="absolute -end-1 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-warning px-1 text-[0.68rem] font-bold text-warning-fg tnum">{heldCount}</span>}
            </button>
          </Tooltip>
          <Tooltip content={t('pos.actions.discount')} shortcut={displayCombo(shortcuts.discount)}>
            <button type="button" className={actionButton} disabled={empty} onClick={() => open({ type: 'discount', lineId: null })}>
              <Percent size={16} aria-hidden />
              {t('pos.actions.discount')}
            </button>
          </Tooltip>
          <Tooltip content={t('pos.actions.clear')} shortcut={displayCombo(shortcuts.clearCart)}>
            <button type="button" className={cn(actionButton, 'hover:text-danger-text')} disabled={empty} onClick={() => void clearCart()}>
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
            'flex w-full items-center justify-between gap-3 rounded-xl bg-primary px-5 font-bold text-primary-fg shadow-glow transition-base',
            'hover:bg-primary-hover active:scale-[0.99] disabled:pointer-events-none disabled:opacity-40 disabled:shadow-none',
            large ? 'h-20 text-2xl' : 'h-16 text-xl',
          )}
        >
          <span className="flex items-center gap-2.5">
            {t('pos.cart.payNow')}
            <Kbd tone="onPrimary">{displayCombo(shortcuts.payment)}</Kbd>
          </span>
          <span className="tnum">{format.money(totals.grandTotal)}</span>
        </button>
      </div>
    </section>
  );
}
