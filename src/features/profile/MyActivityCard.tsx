import { Link } from 'react-router';
import { Activity, ChevronRight } from 'lucide-react';
import { useAsync } from '@/hooks/useAsync';
import { useFormat } from '@/hooks/useFormat';
import { useT } from '@/i18n';
import { auditService } from '@/services/auditService';
import { defaultReportFilter } from '@/services/reportService';
import { useCan } from '@/stores/authStore';
import { StatusBadge } from '@/components/ui/Display';
import { EmptyState, SkeletonRows } from '@/components/ui/States';
import { actionLook, actionText, detailSummary } from '@/features/audit/auditMeta';
import { SettingBlock, SettingsCard } from '@/features/settings/components/SettingsCard';

const LIMIT = 8;

/** The signed-in user's own activity since midnight (sign-ins, sales, cash, changes). */
export function MyActivityCard({ userId }: { userId: string }) {
  const t = useT();
  const format = useFormat();
  const canViewLog = useCan('audit.view');
  const activity = useAsync(() => {
    const today = defaultReportFilter('today');
    return auditService.list({ userId, from: today.from, to: today.to }, { page: 1, pageSize: LIMIT });
  }, [userId]);
  const data = activity.data;

  return (
    <SettingsCard
      icon={Activity}
      title={t('settings.profile.activity')}
      description={data ? t('settings.profile.activityCount', { count: data.total }) : t('settings.profile.activityHint')}
      action={
        canViewLog ? (
          <Link to={`/audit?user=${encodeURIComponent(userId)}&period=today`} className="inline-flex min-h-touch items-center gap-1 rounded-md px-2 text-sm font-medium text-primary hover:underline">
            {t('settings.profile.fullLog')}
            <ChevronRight size={16} aria-hidden />
          </Link>
        ) : undefined
      }
    >
      <SettingBlock className="py-2">
        {!data ? (
          <SkeletonRows rows={4} />
        ) : data.rows.length === 0 ? (
          <EmptyState compact icon={Activity} title={t('settings.profile.noActivity')} />
        ) : (
          <ol className="flex flex-col divide-y divide-border">
            {data.rows.map((entry) => {
              const look = actionLook(entry.action);
              const summary = detailSummary(entry.entity, entry.details, t, format, entry.reference);
              return (
                <li key={entry.id} className="flex items-start gap-3 py-2.5">
                  <span className="w-14 shrink-0 pt-0.5 type-caption text-fg-subtle tnum">{format.time(entry.createdAt)}</span>
                  <div className="min-w-0 flex-1">
                    <StatusBadge size="sm" tone={look.tone} icon={look.icon} label={actionText(entry.action, t)} />
                    {(entry.reference || summary) && (
                      <p className="type-caption mt-1 truncate text-fg-muted">
                        {entry.reference && <span className="font-mono">{entry.reference}</span>}
                        {entry.reference && summary && ' · '}
                        {summary}
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </SettingBlock>
    </SettingsCard>
  );
}
