import { Suspense, useRef } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router';
import { Lock, RotateCcw, Settings } from 'lucide-react';
import { useT, type TranslationKey } from '@/i18n';
import { confirmAction, toast } from '@/stores/uiStore';
import { ErrorBoundary } from '@/components/app/ErrorBoundary';
import { Button } from '@/components/ui/Button';
import { PageHeader } from '@/components/ui/Display';
import { EmptyState, LoadingState } from '@/components/ui/States';
import { SavedIndicator } from '@/features/settings/components/SavedIndicator';
import { ScopeBadge } from '@/features/settings/components/SettingsCard';
import { SettingsNav } from '@/features/settings/components/SettingsNav';
import { SECTION_COMPONENTS } from '@/features/settings/sectionComponents';
import { applyResetPlan, resetPlanFor } from '@/features/settings/sectionDefaults';
import { findSection, type SettingsSection } from '@/features/settings/sections';
import { useHighlightSetting, useVisibleSections } from '@/features/settings/useSettingsAccess';

/* ==========================================================================
   Settings Center (/settings, /settings/:sectionId). Left: search + grouped
   sections (hidden without permission). Right: the section's controls.
   Device settings apply to this terminal instantly; business settings are
   saved for the whole shop. A calm "Saved" pill confirms every change.
   ========================================================================== */

const DEFAULT_SECTION = 'general';

export default function SettingsPage() {
  const t = useT();
  const { sectionId = DEFAULT_SECTION } = useParams();
  const visible = useVisibleSections();
  const contentRef = useRef<HTMLDivElement | null>(null);
  const section = findSection(sectionId);
  useHighlightSetting(contentRef, sectionId);

  if (!section) return <Navigate to={`/settings/${DEFAULT_SECTION}`} replace />;
  const allowed = visible.some((entry) => entry.id === section.id);

  return (
    <div className="flex h-full flex-col">
      <PageHeader icon={Settings} title={t('settings.title')} description={t('settings.subtitle')} actions={<SavedIndicator />} />
      <div className="flex min-h-0 flex-1">
        <SettingsNav sections={visible} activeId={section.id} />
        <div ref={contentRef} className="min-h-0 flex-1 overflow-y-auto p-6">
          <div className="mx-auto flex w-full max-w-4xl flex-col gap-5 pb-10">
            {allowed ? <SectionView section={section} /> : <NoAccess />}
          </div>
        </div>
      </div>
    </div>
  );
}

function SectionView({ section }: { section: SettingsSection }) {
  const t = useT();
  const Icon = section.icon;
  const Component = SECTION_COMPONENTS[section.id];
  const plan = resetPlanFor(section.id);
  const title = t(`settings.sections.${section.id}.title` as TranslationKey);

  const reset = async () => {
    if (!plan) return;
    const ok = await confirmAction({
      title: t('settings.resetSectionConfirm', { section: title }),
      message: t('settings.ui.resetSectionMessage'),
      confirmLabel: t('settings.resetSection'),
      tone: 'primary',
    });
    if (ok && (await applyResetPlan(plan))) toast.success('settings.resetDone');
  };

  return (
    <>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary-soft-fg">
            <Icon size={22} aria-hidden />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="type-h2 text-fg">{title}</h2>
              <ScopeBadge scope={section.scope} />
            </div>
            <p className="type-body-sm mt-0.5 text-fg-muted">{t(`settings.sections.${section.id}.description` as TranslationKey)}</p>
          </div>
        </div>
        {plan && (
          <Button variant="ghost" icon={RotateCcw} onClick={() => void reset()}>
            {t('settings.resetSection')}
          </Button>
        )}
      </header>
      <ErrorBoundary key={section.id}>
        <Suspense fallback={<LoadingState label={t('common.states.loading')} />}>
          <Component />
        </Suspense>
      </ErrorBoundary>
    </>
  );
}

function NoAccess() {
  const t = useT();
  const navigate = useNavigate();
  return (
    <EmptyState
      icon={Lock}
      title={t('settings.ui.noAccessTitle')}
      description={t('settings.ui.noAccessHint')}
      action={<Button onClick={() => navigate(`/settings/${DEFAULT_SECTION}`)}>{t('settings.ui.backToGeneral')}</Button>}
    />
  );
}
