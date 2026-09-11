import { useEffect } from 'react';
import { CircleAlert, CircleCheckBig, Info, TriangleAlert, X } from 'lucide-react';
import { useT } from '@/i18n';
import { useUiStore, type Toast, type ToastTone } from '@/stores/uiStore';
import { cn } from '@/components/ui/cn';

const ICONS: Record<ToastTone, typeof Info> = {
  success: CircleCheckBig,
  info: Info,
  warning: TriangleAlert,
  danger: CircleAlert,
};

const TONES: Record<ToastTone, string> = {
  success: 'text-success-text',
  info: 'text-info-text',
  warning: 'text-warning-text',
  danger: 'text-danger-text',
};

function ToastItem({ toast }: { toast: Toast }) {
  const t = useT();
  const dismiss = useUiStore((state) => state.dismissToast);
  const Icon = ICONS[toast.tone];

  useEffect(() => {
    const timer = setTimeout(() => dismiss(toast.id), toast.duration);
    return () => clearTimeout(timer);
  }, [toast.id, toast.duration, dismiss]);

  return (
    <div
      role={toast.tone === 'danger' ? 'alert' : 'status'}
      className="pointer-events-auto flex w-[22rem] max-w-[calc(100vw-2rem)] items-start gap-3 rounded-lg border border-border bg-surface px-4 py-3 shadow-lg animate-slide-up"
    >
      <Icon size={20} aria-hidden className={cn('mt-0.5 shrink-0', TONES[toast.tone])} />
      <div className="min-w-0 flex-1">
        <p className="type-body font-semibold text-fg">{toast.title}</p>
        {toast.description && <p className="type-body-sm mt-0.5 text-fg-muted">{toast.description}</p>}
        {toast.action && (
          <button
            type="button"
            onClick={() => {
              toast.action?.run();
              dismiss(toast.id);
            }}
            className="type-label mt-1.5 rounded-sm text-primary hover:underline"
          >
            {toast.action.label}
          </button>
        )}
      </div>
      <button type="button" onClick={() => dismiss(toast.id)} aria-label={t('common.actions.close')} className="-me-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-fg-subtle hover:bg-surface-3 hover:text-fg">
        <X size={15} aria-hidden />
      </button>
    </div>
  );
}

/**
 * Toasts appear bottom-left, above the status bar — never over the cart,
 * the Pay button, the scan box or payment fields (spec §106).
 */
export function Toaster() {
  const toasts = useUiStore((state) => state.toasts);
  return (
    <div aria-live="polite" className="pointer-events-none fixed bottom-10 start-4 z-[75] flex flex-col-reverse gap-2 [[data-sidebar=full]_&]:start-[calc(var(--sidebar-full)+1rem)] [[data-sidebar=compact]_&]:start-[calc(var(--sidebar-compact)+1rem)]">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} />
      ))}
    </div>
  );
}
