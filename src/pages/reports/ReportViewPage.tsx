import { ArrowLeft, FileQuestion, Lock } from 'lucide-react';
import { Link, useParams } from 'react-router';
import { useT } from '@/i18n';
import { useCan } from '@/stores/authStore';
import { PageHeader } from '@/components/ui/Display';
import { EmptyState } from '@/components/ui/States';
import { getReport } from '@/features/reports/definitions';
import { ReportView } from '@/features/reports/ReportView';

/* ==========================================================================
   /reports/:reportId — resolves the report, guards financial reports and
   shows a friendly page for unknown links.
   ========================================================================== */

function BackLink() {
  const t = useT();
  return (
    <Link to="/reports" className="inline-flex min-h-touch items-center gap-2 rounded-md bg-surface-2 px-4 text-[0.94rem] font-semibold text-fg ring-1 ring-border transition-base hover:bg-surface-3">
      <ArrowLeft size={18} aria-hidden />
      {t('reports.view.back')}
    </Link>
  );
}

export default function ReportViewPage() {
  const t = useT();
  const { reportId } = useParams();
  const canFinancial = useCan('reports.financial');
  const definition = getReport(reportId);

  if (!definition || (definition.permission === 'reports.financial' && !canFinancial)) {
    const missing = !definition;
    return (
      <div className="flex h-full flex-col">
        <PageHeader
          title={missing ? t('reports.view.notFoundTitle') : t(`reports.items.${definition.id}.title`)}
          breadcrumb={[{ label: t('reports.title'), to: '/reports' }, { label: missing ? t('reports.view.notFoundTitle') : t(`reports.items.${definition.id}.title`) }]}
        />
        <div className="min-h-0 flex-1 overflow-y-auto p-6">
          <EmptyState
            icon={missing ? FileQuestion : Lock}
            title={missing ? t('reports.view.notFoundTitle') : t('reports.view.noPermissionTitle')}
            description={missing ? t('reports.view.notFoundHint') : t('reports.view.noPermissionHint')}
            action={<BackLink />}
          />
        </div>
      </div>
    );
  }

  return <ReportView key={definition.id} definition={definition} />;
}
