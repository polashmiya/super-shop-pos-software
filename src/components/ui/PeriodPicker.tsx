import { useState } from 'react';
import { CalendarRange } from 'lucide-react';
import { localDatesToRange, parseLocalDate, toLocalDate } from '@/domain/dates';
import { useT } from '@/i18n';
import type { DateRange, ReportPeriod } from '@/types';
import { cn, controlBase } from './cn';
import { Select } from './Controls';

interface PeriodPickerProps {
  period: ReportPeriod;
  range: DateRange;
  onChange: (period: ReportPeriod, custom?: DateRange) => void;
  periods?: ReportPeriod[];
  className?: string;
}

const DEFAULT_PERIODS: ReportPeriod[] = ['today', 'yesterday', 'this_week', 'this_month', 'last_month', 'last_30_days', 'custom'];

/** Period presets + custom from/to dates (inclusive local dates). */
export function PeriodPicker({ period, range, onChange, periods = DEFAULT_PERIODS, className }: PeriodPickerProps) {
  const t = useT();
  const initialTo = new Date(new Date(range.to).getTime() - 1);
  const [from, setFrom] = useState(toLocalDate(new Date(range.from)));
  const [to, setTo] = useState(toLocalDate(initialTo));

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
          options={periods.map((value) => ({ value, label: t(`common.periods.${value}`) }))}
          onChange={(value) => {
            if (value === 'custom') applyCustom(from, to);
            else onChange(value);
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
          <span className="text-fg-subtle">–</span>
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
