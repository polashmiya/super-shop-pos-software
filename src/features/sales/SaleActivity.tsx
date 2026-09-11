import { Activity } from 'lucide-react';
import { useAsync } from '@/hooks/useAsync';
import { useFormat } from '@/hooks/useFormat';
import { useT, type Translate } from '@/i18n';
import type { AuditLog, Id } from '@/types';
import type { Formatters } from '@/utils/format';
import { Card, SectionHeader } from '@/components/ui/Display';
import { TONE_DOT } from '@/components/ui/tones';
import { cn } from '@/components/ui/cn';
import { Skeleton } from '@/components/ui/States';
import { AUDIT_META, DEFAULT_AUDIT_META } from './saleMeta';
import { loadSaleActivity } from './saleData';

/** Human-readable details of an audit entry (reason, approver, amounts). */
function detailLines(log: AuditLog, t: Translate, format: Formatters): string[] {
  const text = (key: string): string | null => {
    const value = log.details[key];
    return typeof value === 'string' && value.trim() ? value : null;
  };
  const number = (key: string): number | null => {
    const value = log.details[key];
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  };
  const lines: string[] = [];
  const total = number('total');
  const items = number('items');
  if (log.action === 'sale.completed' && total !== null) lines.push(t('sales.detail.activity.completed', { count: items ?? 0, total: format.money(total) }));
  const refund = number('refund');
  if (refund !== null) lines.push(t('sales.detail.activity.refund', { amount: format.money(refund) }));
  const amount = number('amount');
  if (log.action === 'discount.applied' && amount !== null) lines.push(t('sales.detail.activity.discount', { amount: format.money(amount) }));
  const reason = text('reason');
  if (reason) lines.push(t('sales.detail.activity.reason', { reason }));
  const approvedBy = text('approvedBy');
  if (approvedBy) lines.push(t('auth.approvedBy', { name: approvedBy }));
  return lines;
}

/** Audit trail of a sale, newest first. `version` reloads it after an action. */
export function SaleActivity({ saleId, version }: { saleId: Id; version: string }) {
  const t = useT();
  const format = useFormat();
  const activity = useAsync(() => loadSaleActivity(saleId), [saleId, version]);
  const logs = activity.data ?? [];

  return (
    <Card>
      <SectionHeader icon={Activity} title={t('sales.detail.activity.title')} description={t('sales.detail.activity.description')} />
      {!activity.data ? (
        <div className="mt-4 flex flex-col gap-3" aria-hidden>
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : logs.length === 0 ? (
        <p className="mt-4 type-body-sm text-fg-subtle">{t('sales.detail.activity.empty')}</p>
      ) : (
        <ol className="mt-4 flex flex-col">
          {logs.map((log, index) => {
            const meta = AUDIT_META[log.action] ?? DEFAULT_AUDIT_META;
            const Icon = meta.icon;
            const lines = detailLines(log, t, format);
            return (
              <li key={log.id} className="relative flex gap-3 pb-4 last:pb-0">
                {index < logs.length - 1 && <span className="absolute start-4 top-9 bottom-0 w-px bg-border" aria-hidden />}
                <span className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-3 text-fg-muted">
                  <Icon size={15} aria-hidden />
                  <span className={cn('absolute -end-0.5 -bottom-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-surface', TONE_DOT[meta.tone])} aria-hidden />
                </span>
                <div className="min-w-0 flex-1 pt-0.5">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <p className="font-medium text-fg">{t(`enums.auditAction.${log.action}`)}</p>
                    <time dateTime={log.createdAt} title={format.dateTime(log.createdAt)} className="type-caption text-fg-subtle tnum">
                      {format.dateTime(log.createdAt)}
                    </time>
                  </div>
                  {log.userName && <p className="type-caption text-fg-subtle">{t('sales.detail.activity.by', { name: log.userName })}</p>}
                  {lines.map((line) => (
                    <p key={line} className="type-body-sm text-fg-muted">
                      {line}
                    </p>
                  ))}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </Card>
  );
}
