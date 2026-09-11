import { useEffect, useRef, useState, type ReactNode } from 'react';
import { APP_CONFIG } from '@/config/app.config';
import { parseMoneyInput, parsePercentInput } from '@/domain/money';
import { toAsciiDigits } from '@/domain/text';
import { useFormat } from '@/hooks/useFormat';
import { useSettingsStore } from '@/stores/settingsStore';
import { cn, controlBase, controlInvalid } from '@/components/ui/cn';

/* ==========================================================================
   Inputs that commit instead of saving on every keystroke: numbers, money
   (typed in taka, stored in poisha), percentages (stored in basis points)
   and text. They commit on Enter or blur (text can also commit "live" after
   a short pause so previews follow typing). Escape restores the saved value.
   ========================================================================== */

const LIVE_DELAY_MS = 450;

interface AffixProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  onCommit: () => void;
  onCancel: () => void;
  prefix?: ReactNode;
  suffix?: ReactNode;
  invalid?: boolean;
  disabled?: boolean;
  ariaLabel?: string;
  inputMode?: 'numeric' | 'decimal' | 'text';
  className?: string;
  align?: 'start' | 'end';
}

function AffixInput({ id, value, onChange, onCommit, onCancel, prefix, suffix, invalid, disabled, ariaLabel, inputMode = 'numeric', className, align = 'end' }: AffixProps) {
  return (
    <div
      className={cn(
        'flex min-h-touch items-stretch overflow-hidden rounded-md border bg-surface-2 transition-base focus-within:ring-2',
        invalid ? 'border-danger focus-within:ring-danger/25' : 'border-border focus-within:border-primary focus-within:ring-primary/25',
        disabled && 'opacity-60',
        className,
      )}
    >
      {prefix && <span className="flex items-center border-e border-border bg-surface-3 px-3 text-sm font-medium text-fg-muted">{prefix}</span>}
      <input
        id={id}
        type="text"
        inputMode={inputMode}
        autoComplete="off"
        value={value}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-invalid={invalid || undefined}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onCommit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            onCommit();
          } else if (event.key === 'Escape') {
            event.preventDefault();
            onCancel();
          }
        }}
        className={cn('min-w-0 flex-1 bg-transparent px-3 text-[0.94rem] text-fg outline-none tnum placeholder:text-fg-subtle focus-visible:outline-none disabled:cursor-not-allowed', align === 'end' ? 'text-end' : 'text-start')}
      />
      {suffix && <span className="flex items-center border-s border-border bg-surface-3 px-3 text-sm whitespace-nowrap text-fg-muted">{suffix}</span>}
    </div>
  );
}

function plainNumber(value: number, decimals: number): string {
  if (decimals === 0) return String(Math.round(value));
  return Number.isInteger(value) ? String(value) : value.toFixed(decimals).replace(/0+$/, '').replace(/\.$/, '');
}

function parseNumber(text: string, decimals: number): number | null {
  const ascii = toAsciiDigits(text).replace(/[,\s]/g, '').trim();
  const pattern = decimals > 0 ? new RegExp(`^\\d+(\\.\\d{0,${decimals}})?$`) : /^\d+$/;
  if (!pattern.test(ascii)) return null;
  const value = Number(ascii);
  return Number.isFinite(value) ? value : null;
}

interface NumberInputProps {
  id?: string;
  value: number;
  onCommit: (value: number) => void;
  min?: number;
  max?: number;
  decimals?: number;
  suffix?: ReactNode;
  disabled?: boolean;
  ariaLabel?: string;
  className?: string;
}

/** Whole or decimal number with an optional unit (days, minutes, ms…). Out-of-range values are clamped. */
export function NumberInput({ id, value, onCommit, min = 0, max = 1_000_000, decimals = 0, suffix, disabled, ariaLabel, className = 'w-40' }: NumberInputProps) {
  const format = useFormat();
  const [draft, setDraft] = useState<string | null>(null);
  const parsed = draft === null ? value : parseNumber(draft, decimals);
  const invalid = draft !== null && (parsed === null || parsed < min || parsed > max);
  const commit = () => {
    if (draft === null) return;
    setDraft(null);
    const next = parseNumber(draft, decimals);
    if (next === null) return;
    const clamped = Math.min(Math.max(next, min), max);
    if (clamped !== value) onCommit(clamped);
  };
  return (
    <AffixInput
      id={id}
      value={draft ?? format.digits(plainNumber(value, decimals))}
      onChange={setDraft}
      onCommit={commit}
      onCancel={() => setDraft(null)}
      suffix={suffix}
      invalid={invalid}
      disabled={disabled}
      ariaLabel={ariaLabel}
      inputMode={decimals > 0 ? 'decimal' : 'numeric'}
      className={className}
    />
  );
}

/** Amount typed in taka (Bangla digits accepted), committed as integer poisha. */
export function MoneyInput({ id, value, onCommit, min = 0, max = APP_CONFIG.money.maxAmount, disabled, ariaLabel, className = 'w-44' }: Omit<NumberInputProps, 'decimals' | 'suffix'>) {
  const format = useFormat();
  const currency = useSettingsStore((state) => state.business.currency);
  const [draft, setDraft] = useState<string | null>(null);
  const parsed = draft === null ? value : parseMoneyInput(draft);
  const invalid = draft !== null && (parsed === null || parsed < min || parsed > max);
  const commit = () => {
    if (draft === null) return;
    setDraft(null);
    const next = parseMoneyInput(draft);
    if (next === null) return;
    const clamped = Math.min(Math.max(next, min), max);
    if (clamped !== value) onCommit(clamped);
  };
  const symbol = <span aria-hidden>{currency.symbol}</span>;
  return (
    <AffixInput
      id={id}
      value={draft ?? format.digits(plainNumber(value / 100, 2))}
      onChange={setDraft}
      onCommit={commit}
      onCancel={() => setDraft(null)}
      prefix={currency.position === 'before' ? symbol : undefined}
      suffix={currency.position === 'after' ? symbol : undefined}
      invalid={invalid}
      disabled={disabled}
      ariaLabel={ariaLabel}
      inputMode="decimal"
      className={className}
    />
  );
}

/** Percentage typed as "7.5", committed as basis points (750). */
export function PercentInput({ id, value, onCommit, min = 0, max = 10_000, disabled, ariaLabel, className = 'w-36' }: Omit<NumberInputProps, 'decimals' | 'suffix'>) {
  const format = useFormat();
  const [draft, setDraft] = useState<string | null>(null);
  const parsed = draft === null ? value : parsePercentInput(draft);
  const invalid = draft !== null && (parsed === null || parsed < min || parsed > max);
  const commit = () => {
    if (draft === null) return;
    setDraft(null);
    const next = parsePercentInput(draft);
    if (next === null) return;
    const clamped = Math.min(Math.max(next, min), max);
    if (clamped !== value) onCommit(clamped);
  };
  return (
    <AffixInput
      id={id}
      value={draft ?? format.digits(plainNumber(value / 100, 2))}
      onChange={setDraft}
      onCommit={commit}
      onCancel={() => setDraft(null)}
      suffix="%"
      invalid={invalid}
      disabled={disabled}
      ariaLabel={ariaLabel}
      inputMode="decimal"
      className={className}
    />
  );
}

interface TextFieldProps {
  id?: string;
  value: string;
  onCommit: (value: string) => void;
  /** Also commit after a short pause while typing (for live previews). */
  live?: boolean;
  multiline?: boolean;
  rows?: number;
  placeholder?: string;
  maxLength?: number;
  disabled?: boolean;
  ariaLabel?: string;
  lang?: string;
  mono?: boolean;
  /** Returns an error message, or null when valid. Invalid text is never committed. */
  validate?: (value: string) => string | null;
  transform?: (value: string) => string;
  className?: string;
}

export function TextField({ id, value, onCommit, live, multiline, rows = 2, placeholder, maxLength = 200, disabled, ariaLabel, lang, mono, validate, transform, className }: TextFieldProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const error = draft !== null && validate ? validate(draft) : null;

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const commit = (text: string) => {
    if (validate?.(text)) return;
    const next = text.trim();
    if (next !== value) onCommit(next);
  };

  const change = (text: string) => {
    const next = transform ? transform(text) : text;
    setDraft(next);
    if (!live) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      commit(next);
    }, LIVE_DELAY_MS);
  };

  const finish = () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    if (draft === null) return;
    if (validate?.(draft)) return;
    commit(draft);
    setDraft(null);
  };

  const shared = {
    id,
    value: draft ?? value,
    placeholder,
    maxLength,
    disabled,
    lang,
    'aria-label': ariaLabel,
    'aria-invalid': error ? true : undefined,
    onBlur: finish,
    className: cn(controlBase, error && controlInvalid, mono && 'font-mono', multiline ? 'py-2.5 leading-relaxed' : 'min-h-touch text-[0.94rem]'),
  };

  return (
    <div className={cn('flex w-full flex-col gap-1', className)}>
      {multiline ? (
        <textarea
          {...shared}
          rows={rows}
          onChange={(event) => change(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault();
              setDraft(null);
            }
          }}
        />
      ) : (
        <input
          {...shared}
          type="text"
          autoComplete="off"
          onChange={(event) => change(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              finish();
            } else if (event.key === 'Escape') {
              event.preventDefault();
              setDraft(null);
            }
          }}
        />
      )}
      {error && (
        <p role="alert" className="type-caption text-danger-text">
          {error}
        </p>
      )}
    </div>
  );
}
