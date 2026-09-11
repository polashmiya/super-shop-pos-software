import { memo } from 'react';
import { Minus, PencilLine, Plus, Tag, Trash2 } from 'lucide-react';
import type { Translate } from '@/i18n';
import type { CartLine, Language, LineTotals, Unit } from '@/types';
import type { Formatters } from '@/utils/format';
import { cn } from '@/components/ui/cn';
import { ProductImage } from '@/components/product/ProductImage';

interface CartLineItemProps {
  line: CartLine;
  totals: LineTotals | undefined;
  unit: Unit | undefined;
  selected: boolean;
  /** Timestamp of the latest add/scan of this line (replays the highlight), or null. */
  flashing: number | null;
  showImage: boolean;
  large: boolean;
  categoryId: string;
  language: Language;
  t: Translate;
  format: Formatters;
  onSelect: (lineId: string) => void;
  onStep: (lineId: string, direction: 1 | -1) => void;
  onRemove: (lineId: string) => void;
  onEdit: (lineId: string, focus: 'quantity' | 'price' | 'note') => void;
  onDiscount: (lineId: string) => void;
}

/** One cart row: image, name, SKU, unit price, quantity controls, discount, total, remove. */
export const CartLineItem = memo(function CartLineItem({
  line,
  totals,
  unit,
  selected,
  flashing,
  showImage,
  large,
  categoryId,
  language,
  t,
  format,
  onSelect,
  onStep,
  onRemove,
  onEdit,
  onDiscount,
}: CartLineItemProps) {
  const name = language === 'bn' ? line.name.bn : line.name.en;
  const unitShort = unit ? (language === 'bn' ? unit.short.bn : unit.short.en) : '';
  const discount = totals?.itemDiscount ?? 0;
  const lineAmount = (totals?.subtotal ?? 0) - discount;
  const button = cn('flex shrink-0 items-center justify-center rounded-lg border border-border bg-surface-2 text-fg transition-base hover:bg-surface-3 active:scale-95', large ? 'h-11 w-11' : 'h-10 w-10');

  return (
    <li
      data-line-id={line.lineId}
      aria-selected={selected}
      onClick={() => onSelect(line.lineId)}
      className={cn(
        'group relative flex gap-3 rounded-lg px-2.5 py-2 transition-base',
        selected ? 'bg-primary-soft/50 ring-1 ring-primary/40' : 'hover:bg-surface-2',
      )}
    >
      {flashing !== null && <span key={flashing} aria-hidden className="pointer-events-none absolute inset-0 rounded-lg animate-flash" />}
      {selected &&<span aria-hidden className="absolute start-0 top-2 bottom-2 w-1 rounded-full bg-primary" />}
      {showImage && <ProductImage product={{ image: line.image, categoryId }} className={cn('shrink-0', large ? 'h-14 w-14' : 'h-12 w-12')} iconSize={20} />}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-start gap-2">
          <p className={cn('min-w-0 flex-1 leading-snug font-semibold text-fg', large ? 'text-base' : 'text-[0.9rem]')}>{name}</p>
          <span className={cn('shrink-0 font-bold text-fg tnum', large ? 'text-lg' : 'text-[0.95rem]')}>{format.money(lineAmount)}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5" onClick={(event) => event.stopPropagation()}>
            <button type="button" className={button} onClick={() => onStep(line.lineId, -1)} aria-label={t('pos.cart.decrease')}>
              <Minus size={17} aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => onEdit(line.lineId, 'quantity')}
              aria-label={t('pos.cart.quantity')}
              className={cn('min-w-12 rounded-lg border border-transparent px-1.5 text-center font-bold text-fg tnum hover:border-border hover:bg-surface-2', large ? 'h-11 text-lg' : 'h-10 text-base')}
            >
              {format.quantity(line.quantity)}
            </button>
            <button type="button" className={button} onClick={() => onStep(line.lineId, 1)} aria-label={t('pos.cart.increase')}>
              <Plus size={17} aria-hidden />
            </button>
          </div>
          <button type="button" onClick={(event) => { event.stopPropagation(); onEdit(line.lineId, 'price'); }} className="min-w-0 flex-1 truncate rounded-md px-1 text-start text-xs text-fg-muted hover:text-fg">
            <span className="tnum">{format.money(line.unitPrice)}</span>
            {unitShort ? ` / ${unitShort}` : ''}
            {line.priceOverride && <span className="ms-1 text-warning-text">· {t('pos.cart.overridden')}</span>}
          </button>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onRemove(line.lineId);
            }}
            aria-label={t('pos.cart.remove', { name })}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-fg-subtle transition-base hover:bg-danger-soft hover:text-danger-text"
          >
            <Trash2 size={17} aria-hidden />
          </button>
        </div>
        {(discount > 0 || line.note) && (
          <div className="flex flex-wrap items-center gap-1.5 text-[0.72rem]">
            {discount > 0 && (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onDiscount(line.lineId);
                }}
                className="inline-flex items-center gap-1 rounded-full bg-success-soft px-2 py-0.5 font-semibold text-success-text"
              >
                <Tag size={11} aria-hidden />
                {line.discountSource === 'promo' ? t('pos.cart.promo') : t('pos.cart.discount')} −{format.money(discount)}
              </button>
            )}
            {line.note && (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onEdit(line.lineId, 'note');
                }}
                className="inline-flex max-w-full items-center gap-1 truncate rounded-full bg-surface-3 px-2 py-0.5 text-fg-muted"
              >
                <PencilLine size={11} aria-hidden />
                <span className="truncate">{line.note}</span>
              </button>
            )}
          </div>
        )}
      </div>
    </li>
  );
});
