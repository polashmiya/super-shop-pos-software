import { forwardRef, type ButtonHTMLAttributes } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from './cn';
import { Tooltip } from './Tooltip';

type Variant = 'ghost' | 'secondary' | 'primary' | 'danger' | 'soft';
type Size = 'sm' | 'md' | 'lg';

const VARIANTS: Record<Variant, string> = {
  ghost: 'text-fg-muted hover:bg-surface-3 hover:text-fg',
  secondary: 'bg-surface-2 border border-border text-fg hover:bg-surface-3',
  primary: 'bg-primary text-primary-fg hover:bg-primary-hover',
  danger: 'text-danger-text hover:bg-danger-soft',
  soft: 'bg-primary-soft text-primary-soft-fg hover:brightness-110',
};

const SIZES: Record<Size, { box: string; icon: number }> = {
  sm: { box: 'h-9 w-9 rounded-md', icon: 17 },
  md: { box: 'h-touch w-touch rounded-md', icon: 20 },
  lg: { box: 'h-14 w-14 rounded-lg', icon: 22 },
};

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  icon: LucideIcon;
  /** Accessible name — also shown as the tooltip. */
  label: string;
  shortcut?: string;
  variant?: Variant;
  size?: Size;
  badge?: number | string | null;
  tooltip?: boolean;
  tooltipSide?: 'top' | 'bottom' | 'left' | 'right';
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { icon: Icon, label, shortcut, variant = 'ghost', size = 'md', badge, tooltip = true, tooltipSide = 'bottom', className, type = 'button', ...rest },
  ref,
) {
  const button = (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      className={cn('relative inline-flex shrink-0 items-center justify-center transition-base active:scale-95 disabled:opacity-40 disabled:pointer-events-none', VARIANTS[variant], SIZES[size].box, className)}
      {...rest}
    >
      <Icon size={SIZES[size].icon} aria-hidden strokeWidth={2} />
      {badge !== undefined && badge !== null && badge !== 0 && (
        <span className="absolute -end-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-danger px-1 text-[0.68rem] font-bold text-danger-fg ring-2 ring-bg-subtle">
          {badge}
        </span>
      )}
    </button>
  );
  return tooltip ? (
    <Tooltip content={label} shortcut={shortcut} side={tooltipSide}>
      {button}
    </Tooltip>
  ) : (
    button
  );
});
