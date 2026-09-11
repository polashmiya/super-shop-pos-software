import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { ArrowDown, ArrowUp, type LucideIcon } from 'lucide-react';
import { getStockStatus } from '@/domain/stock';
import { useFormat } from '@/hooks/useFormat';
import { useLanguage, useLocalize, useT } from '@/i18n';
import { useSettingsStore } from '@/stores/settingsStore';
import type { Product, StockMovementType } from '@/types';
import { cn } from '@/components/ui/cn';
import { StatusBadge, type Tone } from '@/components/ui/Display';
import { ProductImage } from '@/components/product/ProductImage';
import { stockStatusBadge } from '@/components/product/stockStatus';
import { movementBadge } from './inventoryHelpers';

/* Small building blocks shared by the inventory, ledger and purchase screens. */

/** Movement type badge: colour + icon + text. */
export function MovementTypeBadge({ type, size = 'sm' }: { type: StockMovementType; size?: 'sm' | 'md' }) {
  const t = useT();
  const badge = movementBadge(type);
  return <StatusBadge tone={badge.tone} icon={badge.icon} size={size} label={t(`enums.movementType.${type}`)} />;
}

/** Stock status badge of a product (in stock / low / out / expiring / inactive). */
export function ProductStockBadge({ product, size = 'sm' }: { product: Pick<Product, 'status' | 'stock' | 'minStock' | 'expiryDate'>; size?: 'sm' | 'md' }) {
  const t = useT();
  const expiringDays = useSettingsStore((state) => state.business.inventory.expiryAlertDays);
  const status = getStockStatus(product, expiringDays);
  const badge = stockStatusBadge(status);
  return <StatusBadge tone={badge.tone} icon={badge.icon} size={size} label={t(`enums.stockStatus.${status}`)} />;
}

/** Signed quantity: + in green with an up arrow, − in red with a down arrow. */
export function SignedQuantity({ value, unit, className }: { value: number; unit?: string; className?: string }) {
  const t = useT();
  const format = useFormat();
  if (value === 0) return <span className={cn('text-fg-muted tnum', className)}>{format.quantity(0, unit)}</span>;
  const positive = value > 0;
  const Icon = positive ? ArrowUp : ArrowDown;
  return (
    <span className={cn('inline-flex items-center gap-1 font-semibold whitespace-nowrap tnum', positive ? 'text-success-text' : 'text-danger-text', className)}>
      <Icon size={14} strokeWidth={2.5} aria-hidden />
      <span className="sr-only">{positive ? t('inventory.ledger.in') : t('inventory.ledger.out')}</span>
      {positive ? '+' : '−'}
      {format.quantity(Math.abs(value), unit)}
    </span>
  );
}

/** Product thumbnail + name (current language) + a secondary line. */
export function ProductCell({
  product,
  meta,
  to,
  onNameClick,
  size = 'md',
}: {
  product: Pick<Product, 'name' | 'image' | 'categoryId'>;
  meta?: ReactNode;
  to?: string | null;
  onNameClick?: () => void;
  size?: 'sm' | 'md';
}) {
  const localize = useLocalize();
  const language = useLanguage();
  const primary = localize(product.name);
  const secondary = language === 'bn' ? product.name.en : product.name.bn;
  const nameClass = 'block max-w-full truncate text-start font-medium text-fg';
  return (
    <div className="flex min-w-0 items-center gap-3">
      <ProductImage product={product} className={size === 'sm' ? 'h-9 w-9 shrink-0' : 'h-11 w-11 shrink-0'} iconSize={size === 'sm' ? 16 : 20} />
      <div className="min-w-0">
        {to ? (
          <Link to={to} className={cn(nameClass, 'rounded-sm hover:text-primary hover:underline')}>
            {primary}
          </Link>
        ) : onNameClick ? (
          <button type="button" onClick={onNameClick} className={cn(nameClass, 'rounded-sm hover:text-primary hover:underline')}>
            {primary}
          </button>
        ) : (
          <span className={nameClass}>{primary}</span>
        )}
        <span className="type-caption block truncate text-fg-subtle">{meta ?? secondary}</span>
      </div>
    </div>
  );
}

const TONE_ICON: Record<Tone, string> = {
  neutral: 'text-fg-subtle',
  primary: 'text-primary',
  success: 'text-success-text',
  warning: 'text-warning-text',
  danger: 'text-danger-text',
  info: 'text-info-text',
};

export interface ChipOption<T extends string> {
  value: T;
  label: string;
  count?: number;
  icon?: LucideIcon;
  tone?: Tone;
}

/** Pill-shaped filter toggles with counts (keyboard: Tab + Enter/Space). */
export function FilterChips<T extends string>({ value, options, onChange, ariaLabel, className }: { value: T; options: ReadonlyArray<ChipOption<T>>; onChange: (value: T) => void; ariaLabel: string; className?: string }) {
  const format = useFormat();
  return (
    <div role="group" aria-label={ariaLabel} className={cn('flex flex-wrap gap-2', className)}>
      {options.map((option) => {
        const selected = option.value === value;
        const Icon = option.icon;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(option.value)}
            className={cn(
              'inline-flex min-h-11 items-center gap-2 rounded-full border px-3.5 text-sm font-medium whitespace-nowrap transition-base',
              selected ? 'border-primary bg-primary-soft text-primary-soft-fg' : 'border-border bg-surface text-fg-muted hover:border-border-strong hover:text-fg',
            )}
          >
            {Icon && <Icon size={15} aria-hidden className={selected ? undefined : TONE_ICON[option.tone ?? 'neutral']} />}
            {option.label}
            {option.count !== undefined && (
              <span className={cn('min-w-6 rounded-full px-1.5 text-center text-xs font-semibold tnum', selected ? 'bg-primary/20' : 'bg-surface-3 text-fg-muted')}>{format.integer(option.count)}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** Label/value pair used in summary strips. */
export function Figure({ label, value, hint, tone, className }: { label: ReactNode; value: ReactNode; hint?: ReactNode; tone?: Tone; className?: string }) {
  const valueTone = tone === 'success' ? 'text-success-text' : tone === 'danger' ? 'text-danger-text' : tone === 'warning' ? 'text-warning-text' : 'text-fg';
  return (
    <div className={cn('min-w-0', className)}>
      <p className="type-caption truncate text-fg-subtle">{label}</p>
      <p className={cn('truncate text-lg font-bold tnum', valueTone)}>{value}</p>
      {hint && <p className="type-caption truncate text-fg-subtle">{hint}</p>}
    </div>
  );
}
