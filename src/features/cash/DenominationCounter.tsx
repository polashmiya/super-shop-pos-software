import { Eraser, Minus, Plus } from 'lucide-react';
import { CASH_DENOMINATIONS, sumDenominations } from '@/domain/shift';
import { useFormat } from '@/hooks/useFormat';
import { useT } from '@/i18n';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { cn, controlBase } from '@/components/ui/cn';
import { parseCount } from './cashMeta';

interface DenominationCounterProps {
  counts: Partial<Record<number, number>>;
  onChange: (counts: Partial<Record<number, number>>) => void;
  className?: string;
}

/** Counts notes and coins (৳1000 … ৳1) with big − / + buttons and a live total. */
export function DenominationCounter({ counts, onChange, className }: DenominationCounterProps) {
  const t = useT();
  const format = useFormat();
  const total = sumDenominations(counts);
  const pieces = CASH_DENOMINATIONS.reduce((sum, note) => sum + (counts[note] ?? 0), 0);

  const setCount = (note: number, value: number) => onChange({ ...counts, [note]: Math.max(0, Math.min(9_999, value)) });

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <div className="flex items-center justify-between gap-2">
        <span className="type-label text-fg-muted">{t('cash.count.title')}</span>
        <Button variant="ghost" icon={Eraser} onClick={() => onChange({})} disabled={pieces === 0}>
          {t('cash.count.clear')}
        </Button>
      </div>
      <ul className="grid gap-2 sm:grid-cols-2">
        {CASH_DENOMINATIONS.map((note) => {
          const count = counts[note] ?? 0;
          const label = format.money(note * 100, { decimals: 'never' });
          return (
            <li key={note} className={cn('flex items-center gap-2 rounded-lg border p-1.5 ps-3 transition-base', count > 0 ? 'border-primary/40 bg-primary-soft/40' : 'border-border bg-surface-2')}>
              <span className="w-16 shrink-0 font-semibold text-fg tnum">{label}</span>
              <IconButton icon={Minus} variant="secondary" tooltip={false} label={t('cash.count.decrease', { value: label })} disabled={count === 0} onClick={() => setCount(note, count - 1)} />
              <input
                type="text"
                inputMode="numeric"
                aria-label={t('cash.count.countLabel', { value: label })}
                value={count === 0 ? '' : format.digits(String(count))}
                placeholder={format.integer(0)}
                onChange={(event) => setCount(note, parseCount(event.target.value))}
                onFocus={(event) => event.target.select()}
                className={cn(controlBase, 'h-touch w-16 px-1 text-center font-semibold tnum')}
              />
              <IconButton icon={Plus} variant="secondary" tooltip={false} label={t('cash.count.increase', { value: label })} onClick={() => setCount(note, count + 1)} />
              <span className="ms-auto min-w-0 truncate pe-1 text-end text-sm text-fg-muted tnum">{count > 0 ? format.money(note * 100 * count) : ''}</span>
            </li>
          );
        })}
      </ul>
      <div className="flex items-center justify-between gap-3 rounded-lg bg-surface-3 px-4 py-3" aria-live="polite">
        <div className="min-w-0">
          <p className="type-label text-fg-muted">{t('cash.count.total')}</p>
          <p className="type-caption text-fg-subtle">{t('cash.count.pieces', { count: pieces })}</p>
        </div>
        <span className="text-2xl font-bold text-fg tnum">{format.money(total)}</span>
      </div>
    </div>
  );
}
