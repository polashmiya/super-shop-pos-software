import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from './cn';
import { Spinner } from './Spinner';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success' | 'soft' | 'outline' | 'warning';
export type ButtonSize = 'sm' | 'md' | 'lg' | 'xl';

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-primary-fg hover:bg-primary-hover shadow-sm',
  secondary: 'bg-surface-2 text-fg border border-border hover:bg-surface-3 hover:border-border-strong',
  ghost: 'bg-transparent text-fg-muted hover:bg-surface-3 hover:text-fg',
  danger: 'bg-danger text-danger-fg hover:brightness-110 shadow-sm',
  success: 'bg-success text-success-fg hover:brightness-110 shadow-sm',
  warning: 'bg-warning text-warning-fg hover:brightness-110 shadow-sm',
  soft: 'bg-primary-soft text-primary-soft-fg hover:brightness-110',
  outline: 'bg-transparent text-fg border border-border-strong hover:bg-surface-3',
};

const SIZES: Record<ButtonSize, string> = {
  sm: 'h-9 px-3 text-sm gap-1.5 rounded-md',
  md: 'min-h-touch px-4 text-[0.94rem] gap-2 rounded-md',
  lg: 'min-h-[3.25rem] px-5 text-base gap-2.5 rounded-lg',
  xl: 'min-h-[4rem] px-6 text-lg gap-3 rounded-lg',
};

const ICON_SIZES: Record<ButtonSize, number> = { sm: 16, md: 18, lg: 20, xl: 24 };

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: LucideIcon;
  iconRight?: LucideIcon;
  loading?: boolean;
  fullWidth?: boolean;
  /** Keyboard shortcut hint shown on the right, e.g. "F9". */
  shortcut?: string;
  children?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', icon: Icon, iconRight: IconRight, loading = false, fullWidth = false, shortcut, className, children, disabled, type = 'button', ...rest },
  ref,
) {
  const iconSize = ICON_SIZES[size];
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        'inline-flex select-none items-center justify-center font-semibold whitespace-nowrap transition-base',
        'active:scale-[0.985] disabled:pointer-events-none disabled:opacity-50',
        VARIANTS[variant],
        SIZES[size],
        fullWidth && 'w-full',
        className,
      )}
      {...rest}
    >
      {loading ? <Spinner size={iconSize} /> : Icon ? <Icon size={iconSize} aria-hidden strokeWidth={2.1} /> : null}
      {children !== undefined && <span className="truncate">{children}</span>}
      {IconRight && !loading && <IconRight size={iconSize} aria-hidden strokeWidth={2.1} />}
      {shortcut && <kbd className="ms-1 rounded-sm bg-black/15 px-1.5 py-0.5 font-mono text-[0.7rem] font-medium opacity-80">{shortcut}</kbd>}
    </button>
  );
});
