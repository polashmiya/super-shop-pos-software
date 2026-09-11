import { useState } from 'react';
import { Banknote, Plus, X } from 'lucide-react';
import { APP_CONFIG } from '@/config/app.config';
import { parseMoneyInput } from '@/domain/money';
import { useFormat } from '@/hooks/useFormat';
import { useT } from '@/i18n';
import type { Money } from '@/types';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

const MAX_AMOUNTS = 8;

/** Editor for the quick cash note buttons shown in the payment dialog (amounts in poisha). */
export function QuickCashEditor({ value, onChange, disabled }: { value: readonly Money[]; onChange: (next: Money[]) => void; disabled?: boolean }) {
  const t = useT();
  const format = useFormat();
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const sorted = [...value].sort((a, b) => a - b);

  const add = () => {
    const amount = parseMoneyInput(text);
    if (amount === null || amount <= 0 || amount > APP_CONFIG.money.maxAmount) {
      setError(t('validation.invalidAmount'));
      return;
    }
    if (sorted.includes(amount)) {
      setError(t('settings.quickCash.duplicate', { amount: format.money(amount) }));
      return;
    }
    onChange([...sorted, amount].sort((a, b) => a - b));
    setText('');
    setError(null);
  };

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-wrap gap-2" aria-label={t('settings.quickCash.title')}>
        {sorted.map((amount) => (
          <li key={amount} className="inline-flex h-11 items-center gap-1.5 rounded-lg border border-border bg-surface-2 ps-3 pe-1 font-semibold text-fg tnum">
            <Banknote size={16} aria-hidden className="text-fg-subtle" />
            {format.money(amount)}
            <button
              type="button"
              onClick={() => onChange(sorted.filter((entry) => entry !== amount))}
              disabled={disabled || sorted.length <= 1}
              aria-label={t('settings.quickCash.remove', { amount: format.money(amount) })}
              className="flex h-9 w-9 items-center justify-center rounded-md text-fg-subtle transition-base hover:bg-danger-soft hover:text-danger-text disabled:opacity-30"
            >
              <X size={15} aria-hidden />
            </button>
          </li>
        ))}
      </ul>
      {!disabled && sorted.length < MAX_AMOUNTS && (
        <form
          className="flex flex-wrap items-start gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            add();
          }}
        >
          <div className="w-44">
            <Input
              value={text}
              inputMode="decimal"
              placeholder={t('settings.quickCash.placeholder')}
              aria-label={t('settings.quickCash.placeholder')}
              invalid={Boolean(error)}
              onChange={(event) => {
                setText(event.target.value);
                setError(null);
              }}
              className="tnum"
            />
          </div>
          <Button type="submit" icon={Plus} disabled={!text.trim()}>
            {t('settings.quickCash.add')}
          </Button>
        </form>
      )}
      {error ? (
        <p role="alert" className="type-caption text-danger-text">
          {error}
        </p>
      ) : (
        <p className="type-caption text-fg-subtle">{t('settings.quickCash.hint', { max: MAX_AMOUNTS })}</p>
      )}
    </div>
  );
}
