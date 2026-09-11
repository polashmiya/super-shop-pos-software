import { useState } from 'react';
import { CalendarRange } from 'lucide-react';
import { addDays, localDatesToRange, parseLocalDate, resolvePeriod, startOfMonth, toLocalDate } from '@/domain/dates';
import { useT } from '@/i18n';
import type { DateRange } from '@/types';
import { cn, controlBase } from '@/components/ui/cn';
import { Select } from '@/components/ui/Controls';
import type { PeriodValue } from './periods';

const PERIODS: PeriodValue[] = ['all', 'today', 'yesterday', 'this_week', 'this_month', 'last_month', 'last_30_days', 'custom'];

interface PeriodFilterProps {
  period: PeriodValue;
  range: DateRange;
  onChange: (period: PeriodValue, range: DateRange) => void;
  className?: string;
}

/**
 * Period presets (including "All time") + a custom from/to range. Same look
 * and behaviour as the design-system PeriodPicker, for lists whose natural
 * default is the whole history (purchases, stock ledger).
 */
export function PeriodFilter({ period, range, onChange, className }: PeriodFilterProps) {
  const t = useT();
  const [from, setFrom] = useState(() => (period === 'all' ? toLocalDate(startOfMonth(new Date())) : toLocalDate(new Date(range.from))));
  const [to, setTo] = useState(() => toLocalDate(period === 'all' ? new Date() : addDays(new Date(range.to), -1)));

  const applyCustom = (nextFrom: string, nextTo: string) => {
    if (!nextFrom || !nextTo) return;
    const start = parseLocalDate(nextFrom);
    const end = parseLocalDate(nextTo);
    onChange('custom', start <= end ? localDatesToRange(nextFrom, nextTo) : localDatesToRange(nextTo, nextFrom));
  };

  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      <div className="w-44">
        <Select
          aria-label={t('common.labels.period')}
          value={period}
          options={PERIODS.map((value) => ({ value, label: t(`common.periods.${value}`) }))}
          onChange={(value) => {
            if (value === 'custom') applyCustom(from, to);
            else onChange(value, resolvePeriod(value, new Date()));
          }}
        />
      </div>
      {period === 'custom' && (
        <div className="flex items-center gap-2">
          <CalendarRange size={18} aria-hidden className="text-fg-subtle" />
          <input
            type="date"
            aria-label={t('common.labels.from')}
            value={from}
            max={to}
            onChange={(event) => {
              setFrom(event.target.value);
              applyCustom(event.target.value, to);
            }}
            className={cn(controlBase, 'min-h-touch w-40')}
          />
          <span className="text-fg-subtle" aria-hidden>
            –
          </span>
          <input
            type="date"
            aria-label={t('common.labels.to')}
            value={to}
            min={from}
            onChange={(event) => {
              setTo(event.target.value);
              applyCustom(from, event.target.value);
            }}
            className={cn(controlBase, 'min-h-touch w-40')}
          />
        </div>
      )}
    </div>
  );
}
