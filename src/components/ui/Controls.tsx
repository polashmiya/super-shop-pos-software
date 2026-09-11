import { forwardRef, useId, type ReactNode, type SelectHTMLAttributes } from 'react';
import { Check, ChevronDown, Search, X, type LucideIcon } from 'lucide-react';
import { cn, controlBase, controlInvalid } from './cn';
import { Input, type InputProps } from './Input';

/* ---------------------------------- Select --------------------------------- */

export interface SelectOption<T extends string = string> {
  value: T;
  label: string;
  disabled?: boolean;
}

interface SelectProps<T extends string> extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'onChange' | 'value'> {
  value: T;
  options: ReadonlyArray<SelectOption<T>>;
  onChange: (value: T) => void;
  invalid?: boolean;
  compact?: boolean;
}

/** Native select (fast, accessible, keyboard friendly) with the app's styling. */
export function Select<T extends string>({ value, options, onChange, invalid, compact, className, ...rest }: SelectProps<T>) {
  return (
    <div className="relative w-full">
      <select
        value={value}
        onChange={(event) => onChange(event.target.value as T)}
        className={cn(controlBase, 'appearance-none pe-9', compact ? 'h-9 text-sm' : 'min-h-touch', invalid && controlInvalid, className)}
        {...rest}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value} disabled={option.disabled}>
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDown size={16} aria-hidden className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-fg-subtle" />
    </div>
  );
}

/* ------------------------------- SearchInput ------------------------------- */

export const SearchInput = forwardRef<HTMLInputElement, Omit<InputProps, 'icon' | 'onChange'> & { value: string; onChange: (value: string) => void; clearLabel: string }>(
  function SearchInput({ value, onChange, clearLabel, ...rest }, ref) {
    return (
      <Input
        ref={ref}
        type="search"
        icon={Search}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        trailing={
          value ? (
            <button type="button" aria-label={clearLabel} onClick={() => onChange('')} className="flex h-8 w-8 items-center justify-center rounded-md text-fg-subtle hover:bg-surface-3 hover:text-fg">
              <X size={16} aria-hidden />
            </button>
          ) : undefined
        }
        {...rest}
      />
    );
  },
);

/* -------------------------------- Checkbox --------------------------------- */

interface CheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
  indeterminate?: boolean;
  ariaLabel?: string;
  className?: string;
}

export function Checkbox({ checked, onChange, label, description, disabled, indeterminate, ariaLabel, className }: CheckboxProps) {
  const id = useId();
  return (
    <label htmlFor={id} className={cn('inline-flex cursor-pointer items-start gap-3', disabled && 'cursor-not-allowed opacity-60', className)}>
      <span className="relative mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center">
        <input
          id={id}
          type="checkbox"
          checked={checked}
          disabled={disabled}
          aria-label={ariaLabel}
          ref={(node) => {
            if (node) node.indeterminate = Boolean(indeterminate) && !checked;
          }}
          onChange={(event) => onChange(event.target.checked)}
          className="peer h-5 w-5 cursor-pointer appearance-none rounded-sm border-2 border-border-strong bg-surface-2 transition-base checked:border-primary checked:bg-primary indeterminate:border-primary indeterminate:bg-primary"
        />
        {checked && <Check size={14} strokeWidth={3} aria-hidden className="pointer-events-none absolute text-primary-fg" />}
        {indeterminate && !checked && <span className="pointer-events-none absolute h-0.5 w-2.5 rounded bg-primary-fg" />}
      </span>
      {(label || description) && (
        <span className="flex flex-col">
          {label && <span className="type-body text-fg">{label}</span>}
          {description && <span className="type-caption text-fg-subtle">{description}</span>}
        </span>
      )}
    </label>
  );
}

/* --------------------------------- Switch ---------------------------------- */

interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
  className?: string;
}

/** A settings row with a toggle switch (role="switch"). */
export function Switch({ checked, onChange, label, description, disabled, className }: SwitchProps) {
  const id = useId();
  return (
    <div className={cn('flex min-h-touch items-center justify-between gap-4', disabled && 'opacity-60', className)}>
      <label htmlFor={id} className="flex min-w-0 flex-col">
        <span className="type-body font-medium text-fg">{label}</span>
        {description && <span className="type-caption text-fg-subtle">{description}</span>}
      </label>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn('relative h-7 w-12 shrink-0 rounded-full transition-base', checked ? 'bg-primary' : 'bg-surface-3 ring-1 ring-inset ring-border-strong')}
      >
        <span className={cn('absolute top-1 h-5 w-5 rounded-full bg-white shadow-sm transition-base', checked ? 'start-6' : 'start-1')} />
      </button>
    </div>
  );
}

/* ---------------------------- SegmentedControl ----------------------------- */

interface SegmentOption<T extends string> {
  value: T;
  label: ReactNode;
  icon?: LucideIcon;
}

interface SegmentedProps<T extends string> {
  value: T;
  options: ReadonlyArray<SegmentOption<T>>;
  onChange: (value: T) => void;
  ariaLabel: string;
  size?: 'sm' | 'md';
  fullWidth?: boolean;
  className?: string;
}

/** Radio group styled as segmented buttons (arrow keys supported natively via radio inputs). */
export function SegmentedControl<T extends string>({ value, options, onChange, ariaLabel, size = 'md', fullWidth, className }: SegmentedProps<T>) {
  const name = useId();
  return (
    <div role="radiogroup" aria-label={ariaLabel} className={cn('inline-flex rounded-md border border-border bg-surface-2 p-1 gap-1', fullWidth && 'flex w-full', className)}>
      {options.map((option) => {
        const Icon = option.icon;
        const selected = option.value === value;
        return (
          <label
            key={option.value}
            className={cn(
              'relative flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-sm px-3 font-medium whitespace-nowrap transition-base has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-focus',
              size === 'sm' ? 'h-8 text-sm' : 'h-10 text-[0.92rem]',
              selected ? 'bg-surface text-fg shadow-sm ring-1 ring-border' : 'text-fg-muted hover:text-fg',
            )}
          >
            <input type="radio" name={name} value={option.value} checked={selected} onChange={() => onChange(option.value)} className="sr-only" />
            {Icon && <Icon size={16} aria-hidden />}
            {option.label}
          </label>
        );
      })}
    </div>
  );
}

/* ---------------------------------- Tabs ----------------------------------- */

interface TabItem<T extends string> {
  value: T;
  label: ReactNode;
  icon?: LucideIcon;
  count?: number;
}

interface TabsProps<T extends string> {
  value: T;
  items: ReadonlyArray<TabItem<T>>;
  onChange: (value: T) => void;
  ariaLabel: string;
  className?: string;
}

export function Tabs<T extends string>({ value, items, onChange, ariaLabel, className }: TabsProps<T>) {
  const move = (index: number) => onChange(items[(index + items.length) % items.length].value);
  return (
    <div role="tablist" aria-label={ariaLabel} className={cn('flex gap-1 overflow-x-auto border-b border-border scrollbar-none', className)}>
      {items.map((item, index) => {
        const Icon = item.icon;
        const selected = item.value === value;
        return (
          <button
            key={item.value}
            type="button"
            role="tab"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(item.value)}
            onKeyDown={(event) => {
              if (event.key === 'ArrowRight') move(index + 1);
              if (event.key === 'ArrowLeft') move(index - 1);
            }}
            className={cn(
              'relative -mb-px flex min-h-11 items-center gap-2 border-b-2 px-3.5 text-[0.92rem] font-medium whitespace-nowrap transition-base',
              selected ? 'border-primary text-fg' : 'border-transparent text-fg-muted hover:text-fg',
            )}
          >
            {Icon && <Icon size={17} aria-hidden />}
            {item.label}
            {item.count !== undefined && (
              <span className={cn('rounded-full px-1.5 text-xs tnum', selected ? 'bg-primary-soft text-primary-soft-fg' : 'bg-surface-3 text-fg-muted')}>{item.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------- Selectable -------------------------------- */

/** Big touch-friendly choice card (themes, payment methods, etc.). */
export function ChoiceCard({
  selected,
  onClick,
  children,
  className,
  disabled,
  ariaLabel,
}: {
  selected: boolean;
  onClick: () => void;
  children: ReactNode;
  className?: string;
  disabled?: boolean;
  ariaLabel?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'relative flex min-h-touch flex-col items-start rounded-lg border p-3 text-start transition-base disabled:opacity-50',
        selected ? 'border-primary bg-primary-soft ring-1 ring-primary' : 'border-border bg-surface-2 hover:border-border-strong hover:bg-surface-3',
        className,
      )}
    >
      {children}
      {selected && (
        <span className="absolute end-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-fg">
          <Check size={13} strokeWidth={3} aria-hidden />
        </span>
      )}
    </button>
  );
}
