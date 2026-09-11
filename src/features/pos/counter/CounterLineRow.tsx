import { memo } from 'react';
import { EllipsisVertical, Minus, PencilLine, Percent, Plus, Tag, Trash2 } from 'lucide-react';
import type { Translate } from '@/i18n';
import type { CartLine, Language, LineTotals, Unit } from '@/types';
import type { Formatters } from '@/utils/format';
import { cn } from '@/components/ui/cn';
import { IconButton } from '@/components/ui/IconButton';
import { DropdownMenu } from '@/components/ui/Menu';
import { ProductImage } from '@/components/product/ProductImage';

export interface CounterLineRowProps {
  index: number;
  line: CartLine;
  totals: LineTotals | undefined;
  unit: Unit | undefined;
  selected: boolean;
  /** Timestamp of the latest add/scan of this line (replays the highlight), or null. */
  flashing: number | null;
  showImage: boolean;
  showSecondaryName: boolean;
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

/* Every control in a row is one touch target tall (follows the density setting), so rows stay as short as possible. */
const STEP_BUTTON = 'flex h-touch w-touch shrink-0 items-center justify-center rounded-lg border border-border bg-surface-2 text-fg transition-base hover:bg-surface-3 active:scale-95';
const CELL = 'px-2 py-1';

/** One line of the counter table: #, item, unit price, quantity, discount, amount, actions. */
export const CounterLineRow = memo(function CounterLineRow({
  index,
  line,
  totals,
  unit,
  selected,
  flashing,
  showImage,
  showSecondaryName,
  categoryId,
  language,
  t,
  format,
  onSelect,
  onStep,
  onRemove,
  onEdit,
  onDiscount,
}: CounterLineRowProps) {
  const name = language === 'bn' ? line.name.bn : line.name.en;
  const secondary = language === 'bn' ? line.name.en : line.name.bn;
  const unitShort = unit ? (language === 'bn' ? unit.short.bn : unit.short.en) : '';
  const discount = totals?.itemDiscount ?? 0;
  const amount = (totals?.subtotal ?? 0) - discount;
  const stop = (event: { stopPropagation(): void }) => event.stopPropagation();

  return (
    // The key replays the flash animation on every scan of this line.
    <tr
      key={flashing ?? 'row'}
      data-line-id={line.lineId}
      aria-selected={selected}
      onClick={() => onSelect(line.lineId)}
      className={cn('group cursor-default border-b border-border transition-base last:border-b-0', selected ? 'bg-primary-soft/45' : 'hover:bg-surface-2', flashing !== null && 'animate-flash')}
    >
      <td className={cn(CELL, 'relative w-10 text-center type-caption font-semibold text-fg-subtle tnum')}>
        {selected && <span aria-hidden className="absolute start-0 top-2 bottom-2 w-1 rounded-full bg-primary" />}
        {format.integer(index + 1)}
      </td>
      <td className={CELL}>
        <div className="flex min-w-0 items-center gap-3">
          {showImage && <ProductImage product={{ image: line.image, categoryId }} className="h-9 w-9 shrink-0" iconSize={16} />}
          <div className="min-w-0">
            <p className="truncate text-[0.95rem] leading-snug font-semibold text-fg">{name}</p>
            <p className="flex min-w-0 items-center gap-x-2 type-caption text-fg-subtle">
              <span className="shrink-0 font-mono">{line.sku}</span>
              {showSecondaryName && secondary && <span className="truncate">{secondary}</span>}
              {line.priceOverride && <span className="shrink-0 text-warning-text">· {t('pos.cart.overridden')}</span>}
              {line.note && (
                <button type="button" onClick={(event) => { stop(event); onEdit(line.lineId, 'note'); }} className="inline-flex min-w-0 items-center gap-1 truncate rounded-full bg-surface-3 px-1.5 text-fg-muted hover:text-fg">
                  <PencilLine size={10} aria-hidden />
                  <span className="truncate">{line.note}</span>
                </button>
              )}
            </p>
          </div>
        </div>
      </td>
      <td className={cn(CELL, 'w-28 text-end')}>
        <button type="button" onClick={(event) => { stop(event); onEdit(line.lineId, 'price'); }} className="rounded-md px-1.5 py-0.5 text-end leading-tight hover:bg-surface-3" aria-label={t('pos.cart.priceOverride')}>
          <span className="block text-[0.92rem] text-fg tnum">{format.money(line.unitPrice)}</span>
          {unitShort && <span className="block type-caption text-fg-subtle">/{unitShort}</span>}
        </button>
      </td>
      <td className={cn(CELL, 'w-40')}>
        <div className="flex items-center justify-center gap-1" onClick={stop}>
          <button type="button" className={STEP_BUTTON} onClick={() => onStep(line.lineId, -1)} aria-label={t('pos.cart.decrease')}>
            <Minus size={17} aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => onEdit(line.lineId, 'quantity')}
            aria-label={t('pos.cart.quantity')}
            className="h-touch min-w-12 rounded-lg border border-transparent px-1.5 text-center text-base font-bold text-fg tnum hover:border-border hover:bg-surface-2"
          >
            {format.quantity(line.quantity)}
          </button>
          <button type="button" className={STEP_BUTTON} onClick={() => onStep(line.lineId, 1)} aria-label={t('pos.cart.increase')}>
            <Plus size={17} aria-hidden />
          </button>
        </div>
      </td>
      <td className={cn(CELL, 'hidden w-24 text-end lg:table-cell')}>
        {discount > 0 ? (
          <button type="button" onClick={(event) => { stop(event); onDiscount(line.lineId); }} className="inline-flex items-center gap-1 rounded-full bg-success-soft px-2 py-0.5 text-xs font-semibold whitespace-nowrap text-success-text tnum">
            <Tag size={11} aria-hidden />−{format.money(discount)}
          </button>
        ) : (
          <span className="text-fg-subtle">—</span>
        )}
      </td>
      <td className={cn(CELL, 'w-32 text-end text-[1.05rem] font-bold text-fg tnum')}>{format.money(amount)}</td>
      <td className="w-24 px-1 py-1">
        <div className="flex items-center justify-end gap-0.5" onClick={stop}>
          <DropdownMenu
            width={230}
            items={[
              { key: 'discount', label: t('pos.actions.discount'), icon: Percent, onSelect: () => onDiscount(line.lineId) },
              { key: 'price', label: t('pos.cart.priceOverride'), icon: Tag, onSelect: () => onEdit(line.lineId, 'price') },
              { key: 'note', label: t('pos.lineEdit.note'), icon: PencilLine, onSelect: () => onEdit(line.lineId, 'note') },
              'separator',
              { key: 'remove', label: t('common.actions.remove'), icon: Trash2, danger: true, onSelect: () => onRemove(line.lineId) },
            ]}
            trigger={(props) => <IconButton {...props} icon={EllipsisVertical} label={t('pos.counter.more', { name })} tooltipSide="left" />}
          />
          <button
            type="button"
            onClick={() => onRemove(line.lineId)}
            aria-label={t('pos.cart.remove', { name })}
            className="flex h-touch w-touch shrink-0 items-center justify-center rounded-lg text-fg-subtle transition-base hover:bg-danger-soft hover:text-danger-text"
          >
            <Trash2 size={17} aria-hidden />
          </button>
        </div>
      </td>
    </tr>
  );
});
