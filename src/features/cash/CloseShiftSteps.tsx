import type { ReactNode } from 'react';
import { CircleCheckBig, Info, ShieldAlert, TriangleAlert, type LucideIcon } from 'lucide-react';
import { useFormat } from '@/hooks/useFormat';
import { useT } from '@/i18n';
import type { Money, Shift, ShiftTotals } from '@/types';
import { StatusBadge } from '@/components/ui/Display';
import { FormField, Textarea } from '@/components/ui/Input';
import { cn } from '@/components/ui/cn';
import { CashCountInput } from './CashCountInput';
import { DifferenceBadge, DifferenceValue } from './CashBadges';
import { CLOSE_STEPS, DIFFERENCE_META, differenceKind, type CashCountState, type CloseStep } from './cashMeta';

/* Presentational steps of the close-shift flow (state lives in CloseShiftModal). */

function Banner({ tone, icon: Icon, children }: { tone: 'warning' | 'info' | 'danger'; icon: LucideIcon; children: ReactNode }) {
  const tones = { warning: 'bg-warning-soft text-warning-text', info: 'bg-info-soft text-info-text', danger: 'bg-danger-soft text-danger-text' };
  return (
    <p className={cn('flex items-start gap-2 rounded-lg p-3 type-body-sm', tones[tone])}>
      <Icon size={18} aria-hidden className="mt-0.5 shrink-0" />
      <span>{children}</span>
    </p>
  );
}

/** "Step 2 of 3" with the three step names. */
export function StepIndicator({ step }: { step: CloseStep }) {
  const t = useT();
  const index = CLOSE_STEPS.findIndex((entry) => entry === step);
  return (
    <div className="flex flex-col gap-2">
      <p className="type-caption text-fg-subtle">{t('cash.close.stepOf', { step: index + 1, total: CLOSE_STEPS.length })}</p>
      <ol className="grid grid-cols-3 gap-2">
        {CLOSE_STEPS.map((entry, position) => (
          <li key={entry} aria-current={entry === step ? 'step' : undefined} className="flex flex-col gap-1.5">
            <span className={cn('h-1.5 rounded-full', position <= index ? 'bg-primary' : 'bg-surface-3')} />
            <span className={cn('text-sm font-medium', position === index ? 'text-fg' : 'text-fg-subtle')}>{t(`cash.close.steps.${entry}`)}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

interface CountStepProps {
  count: CashCountState;
  onCount: (count: CashCountState) => void;
  error?: string;
  heldCount: number;
  /** null when the expected cash is hidden (blind count). */
  expected: Money | null;
}

export function CountStep({ count, onCount, error, heldCount, expected }: CountStepProps) {
  const t = useT();
  const format = useFormat();
  return (
    <div className="flex flex-col gap-4">
      {heldCount > 0 && (
        <Banner tone="warning" icon={TriangleAlert}>
          {t('cash.close.heldWarning', { count: heldCount })}
        </Banner>
      )}
      <p className="type-body text-fg-muted">{t('cash.close.countHint')}</p>
      <CashCountInput state={count} onChange={onCount} label={t('cash.common.countedCash')} error={error} autoFocus />
      {expected !== null && (
        <p className="type-body-sm text-fg-subtle">
          {t('cash.common.expectedCash')}: <span className="font-semibold text-fg-muted tnum">{format.money(expected)}</span>
        </p>
      )}
    </div>
  );
}

interface ReviewStepProps {
  expected: Money;
  actual: Money;
  note: string;
  onNote: (note: string) => void;
  noteError?: string;
  needsApproval: boolean;
  limit: Money;
}

export function ReviewStep({ expected, actual, note, onNote, noteError, needsApproval, limit }: ReviewStepProps) {
  const t = useT();
  const format = useFormat();
  const difference = actual - expected;
  const kind = differenceKind(difference);
  const meta = DIFFERENCE_META[kind];
  const amount = format.money(Math.abs(difference));
  const message = kind === 'balanced' ? t('cash.close.differenceBalanced') : t(kind === 'over' ? 'cash.close.differenceOver' : 'cash.close.differenceShort', { amount });
  const Icon = meta.icon;
  const messageTone = kind === 'balanced' ? 'bg-success-soft text-success-text' : kind === 'over' ? 'bg-warning-soft text-warning-text' : 'bg-danger-soft text-danger-text';
  return (
    <div className="flex flex-col gap-4">
      <p className="type-body text-fg-muted">{t('cash.close.reviewHint')}</p>
      <dl className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-border bg-surface-2 p-4">
          <dt className="type-caption text-fg-subtle">{t('cash.common.expectedCash')}</dt>
          <dd className="mt-1 text-xl font-bold text-fg tnum">{format.money(expected)}</dd>
        </div>
        <div className="rounded-lg border border-border bg-surface-2 p-4">
          <dt className="type-caption text-fg-subtle">{t('cash.common.countedCash')}</dt>
          <dd className="mt-1 text-xl font-bold text-fg tnum">{format.money(actual)}</dd>
        </div>
        <div className="rounded-lg border border-border bg-surface-2 p-4">
          <dt className="type-caption text-fg-subtle">{t('cash.common.difference')}</dt>
          <dd className="mt-1">
            <DifferenceValue difference={difference} className="text-lg" />
          </dd>
        </div>
      </dl>
      <p className={cn('flex items-center gap-2 rounded-lg p-3 font-semibold', messageTone)} role="status">
        <Icon size={20} aria-hidden className="shrink-0" />
        {message}
      </p>
      <FormField label={t('cash.close.noteLabel')} required={difference !== 0} error={noteError}>
        {(id) => <Textarea id={id} rows={2} maxLength={300} value={note} invalid={Boolean(noteError)} placeholder={t('cash.close.notePlaceholder')} onChange={(event) => onNote(event.target.value)} />}
      </FormField>
      {needsApproval && (
        <Banner tone="danger" icon={ShieldAlert}>
          {t('cash.close.approvalNeeded', { limit: format.money(limit) })}
        </Banner>
      )}
    </div>
  );
}

interface ConfirmStepProps {
  shift: Shift;
  expected: Money;
  actual: Money;
  note: string;
  needsApproval: boolean;
}

export function ConfirmStep({ shift, expected, actual, note, needsApproval }: ConfirmStepProps) {
  const t = useT();
  const format = useFormat();
  const rows = [
    { label: t('common.labels.shift'), value: <span className="font-mono">{shift.shiftNo}</span> },
    { label: t('cash.common.expectedCash'), value: <span className="tnum">{format.money(expected)}</span> },
    { label: t('cash.common.countedCash'), value: <span className="tnum">{format.money(actual)}</span> },
    { label: t('cash.common.difference'), value: <DifferenceBadge difference={actual - expected} size="sm" /> },
    { label: t('cash.close.noteLabel'), value: note.trim() || <span className="text-fg-subtle">{t('cash.detail.noNote')}</span> },
  ];
  return (
    <div className="flex flex-col gap-4">
      <dl className="flex flex-col rounded-lg border border-border">
        {rows.map((row) => (
          <div key={row.label} className="flex min-h-11 items-center justify-between gap-4 border-b border-border px-4 py-2 last:border-b-0">
            <dt className="text-fg-muted">{row.label}</dt>
            <dd className="min-w-0 text-end font-semibold break-words text-fg">{row.value}</dd>
          </div>
        ))}
      </dl>
      {needsApproval && <StatusBadge tone="warning" icon={ShieldAlert} label={t('cash.common.needsApproval')} />}
      <Banner tone="info" icon={Info}>
        {t('cash.close.confirmHint')}
      </Banner>
    </div>
  );
}

interface DoneStepProps {
  closed: Shift;
  totals: ShiftTotals;
}

export function DoneStep({ closed, totals }: DoneStepProps) {
  const t = useT();
  const format = useFormat();
  const actual = closed.actualCash ?? 0;
  const difference = closed.difference ?? actual - totals.expectedCash;
  return (
    <div className="flex flex-col items-center gap-5 py-2 text-center">
      <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-success-soft text-success-text">
        <CircleCheckBig size={32} aria-hidden />
      </span>
      <div>
        <p className="type-h2 text-fg">{t('cash.close.doneTitle')}</p>
        <p className="type-body mt-1 text-fg-muted">{t('cash.close.doneMessage', { shift: closed.shiftNo, time: format.time(closed.closedAt) })}</p>
      </div>
      <dl className="grid w-full gap-3 text-start sm:grid-cols-2">
        {[
          { label: t('cash.common.expectedCash'), value: format.money(totals.expectedCash) },
          { label: t('cash.common.countedCash'), value: format.money(actual) },
          { label: t('cash.common.grossSales'), value: format.money(totals.grossSales) },
          { label: t('cash.common.sales'), value: format.integer(totals.salesCount) },
        ].map((item) => (
          <div key={item.label} className="rounded-lg border border-border bg-surface-2 p-3">
            <dt className="type-caption text-fg-subtle">{item.label}</dt>
            <dd className="text-lg font-bold text-fg tnum">{item.value}</dd>
          </div>
        ))}
      </dl>
      <DifferenceBadge difference={difference} />
    </div>
  );
}
