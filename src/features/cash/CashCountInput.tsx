import type { ReactNode } from 'react';
import { Coins, Keyboard } from 'lucide-react';
import { useFormat } from '@/hooks/useFormat';
import { useT } from '@/i18n';
import type { Money } from '@/types';
import { SegmentedControl } from '@/components/ui/Controls';
import { FormField, Input } from '@/components/ui/Input';
import { cn } from '@/components/ui/cn';
import { amountText, countValue, sanitizeAmount, type CashCountState, type CountMode } from './cashMeta';
import { DenominationCounter } from './DenominationCounter';

interface CashCountInputProps {
  state: CashCountState;
  onChange: (state: CashCountState) => void;
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  quickAmounts?: readonly Money[];
  autoFocus?: boolean;
  /** Offer the notes-and-coins counter (opening and closing counts). */
  allowNotes?: boolean;
}

/** Cash amount entry: type the amount (with quick amounts) or count notes and coins. */
export function CashCountInput({ state, onChange, label, hint, error, quickAmounts = [], autoFocus, allowNotes = true }: CashCountInputProps) {
  const t = useT();
  const format = useFormat();
  const value = countValue(state);

  const switchMode = (mode: CountMode) => {
    if (mode === state.mode) return;
    // Carry a counted total over to the typed amount so nothing is lost.
    const counted = state.mode === 'notes' ? countValue(state) : null;
    onChange({ ...state, mode, text: mode === 'amount' && counted ? amountText(counted) : state.text });
  };

  return (
    <div className="flex flex-col gap-3">
      {allowNotes && (
        <SegmentedControl<CountMode>
          ariaLabel={typeof label === 'string' ? label : t('cash.common.countedCash')}
          value={state.mode}
          onChange={switchMode}
          fullWidth
          options={[
            { value: 'amount', label: t('cash.open.modeAmount'), icon: Keyboard },
            { value: 'notes', label: t('cash.open.modeNotes'), icon: Coins },
          ]}
        />
      )}
      {state.mode === 'amount' ? (
        <>
          <FormField label={label} hint={error ? undefined : (hint ?? (value !== null ? format.money(value) : undefined))} error={error}>
            {(id) => (
              <Input
                id={id}
                autoFocus={autoFocus}
                inputMode="decimal"
                inputSize="xl"
                autoComplete="off"
                value={state.text}
                invalid={Boolean(error)}
                placeholder={format.integer(0)}
                onChange={(event) => onChange({ ...state, text: sanitizeAmount(event.target.value) })}
                onFocus={(event) => event.target.select()}
                className="text-end text-2xl font-bold tnum"
              />
            )}
          </FormField>
          {quickAmounts.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <span className="type-caption text-fg-subtle">{t('cash.common.quickAmounts')}</span>
              <div className="flex flex-wrap gap-2">
                {quickAmounts.map((amount) => {
                  const selected = value === amount;
                  return (
                    <button
                      key={amount}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => onChange({ ...state, text: amountText(amount) })}
                      className={cn(
                        'min-h-touch rounded-md border px-3.5 text-sm font-semibold tnum transition-base',
                        selected ? 'border-primary bg-primary-soft text-primary-soft-fg' : 'border-border bg-surface-2 text-fg hover:border-border-strong hover:bg-surface-3',
                      )}
                    >
                      {format.money(amount)}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </>
      ) : (
        <>
          <DenominationCounter counts={state.counts} onChange={(counts) => onChange({ ...state, counts })} />
          {error && (
            <p role="alert" className="type-caption text-danger-text">
              {error}
            </p>
          )}
        </>
      )}
    </div>
  );
}
