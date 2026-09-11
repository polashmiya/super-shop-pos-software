import { ArrowUpRight } from 'lucide-react';
import { Link } from 'react-router';
import { useFormat } from '@/hooks/useFormat';
import { useT } from '@/i18n';
import type { AuditLogEntry } from '@/repositories/types';
import { DefinitionList, StatusBadge } from '@/components/ui/Display';
import { Drawer } from '@/components/ui/Modal';
import { actionLook, actionText, detailRows, entityLink, entityText } from './auditMeta';

/** Everything recorded for one activity-log entry, with a link to the record. */
export function AuditDetailDrawer({ entry, userName, onClose }: { entry: AuditLogEntry | null; userName: string; onClose: () => void }) {
  const t = useT();
  const format = useFormat();
  if (!entry) return null;

  const look = actionLook(entry.action);
  const link = entityLink(entry.entity, entry.entityId);
  const rows = detailRows(entry.entity, entry.details, t, format);

  return (
    <Drawer open onClose={onClose} width="md" closeLabel={t('common.actions.close')} title={actionText(entry.action, t)} description={format.dateTime(entry.createdAt)}>
      <div className="flex flex-col gap-6">
        <div>
          <StatusBadge tone={look.tone} icon={look.icon} label={actionText(entry.action, t)} />
        </div>
        <DefinitionList
          columns={2}
          items={[
            { label: t('common.labels.user'), value: userName },
            { label: t('common.labels.dateTime'), value: format.dateTime(entry.createdAt) },
            { label: t('settings.audit.entity'), value: entityText(entry.entity, t) },
            {
              label: t('common.labels.reference'),
              value: link ? (
                <Link to={link} onClick={onClose} className="inline-flex items-center gap-1 font-mono text-primary hover:underline">
                  {entry.reference ?? t('settings.audit.openRecord')}
                  <ArrowUpRight size={14} aria-hidden />
                </Link>
              ) : (
                <span className="font-mono">{entry.reference ?? '—'}</span>
              ),
            },
          ]}
        />

        <section aria-labelledby="audit-details" className="flex flex-col gap-2">
          <h3 id="audit-details" className="type-label text-fg-muted">
            {t('settings.audit.recorded')}
          </h3>
          {rows.length === 0 ? (
            <p className="type-body-sm text-fg-subtle">{t('settings.audit.noDetails')}</p>
          ) : (
            <dl className="divide-y divide-border rounded-lg border border-border">
              {rows.map((row) => (
                <div key={row.key} className="flex gap-4 px-3.5 py-2.5">
                  <dt className="w-36 shrink-0 type-body-sm text-fg-subtle">{row.label}</dt>
                  <dd className="selectable min-w-0 flex-1 type-body-sm font-medium break-words whitespace-pre-line text-fg tnum">{row.value}</dd>
                </div>
              ))}
            </dl>
          )}
        </section>
      </div>
    </Drawer>
  );
}
