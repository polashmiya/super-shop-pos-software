import { useId, type ReactNode } from 'react';
import { Eye, Info, Lock, Monitor, Store, type LucideIcon } from 'lucide-react';
import { useT } from '@/i18n';
import { cn } from '@/components/ui/cn';
import { Switch } from '@/components/ui/Controls';
import { Badge, Card } from '@/components/ui/Display';

/* ==========================================================================
   Settings building blocks: grouped cards, labelled rows (label + one-line
   description + control) and small notes. Rows carry `data-setting` so the
   settings search can scroll to and highlight the exact control.
   ========================================================================== */

const ROW = 'setting-row -mx-3 rounded-lg px-3 transition-base data-[highlight=on]:bg-primary-soft data-[highlight=on]:ring-2 data-[highlight=on]:ring-primary/50';

export function ScopeBadge({ scope }: { scope: 'device' | 'business' | 'info' }) {
  const t = useT();
  if (scope === 'info') return null;
  return (
    <Badge tone="neutral" icon={scope === 'device' ? Monitor : Store}>
      {scope === 'device' ? t('settings.deviceScope') : t('settings.businessScope')}
    </Badge>
  );
}

export function SettingsCard({
  title,
  description,
  icon: Icon,
  badge,
  action,
  children,
  className,
  bodyClassName,
}: {
  title: ReactNode;
  description?: ReactNode;
  icon?: LucideIcon;
  badge?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <Card padded={false} className={cn('min-w-0', className)}>
      <header className="flex items-start gap-3 border-b border-border px-5 py-4">
        {Icon && (
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-3 text-fg-muted">
            <Icon size={18} aria-hidden />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="type-h3 text-fg">{title}</h3>
            {badge}
          </div>
          {description && <p className="type-body-sm mt-0.5 text-fg-subtle">{description}</p>}
        </div>
        {action && <div className="flex shrink-0 flex-wrap items-center gap-2">{action}</div>}
      </header>
      <div className={cn('flex flex-col divide-y divide-border px-5 py-1', bodyClassName)}>{children}</div>
    </Card>
  );
}

interface SettingRowProps {
  anchor?: string;
  label: ReactNode;
  description?: ReactNode;
  /** Put the control below the label (wide controls: choice cards, editors). */
  stacked?: boolean;
  className?: string;
  children: ReactNode | ((id: string) => ReactNode);
}

/** A labelled setting. Pass a function child to receive the id for the control (label association). */
export function SettingRow({ anchor, label, description, stacked, className, children }: SettingRowProps) {
  const id = useId();
  const labelled = typeof children === 'function';
  const content = typeof children === 'function' ? children(id) : children;
  return (
    <div data-setting={anchor} className={cn(ROW, 'py-3.5', className)}>
      <div className={cn('flex gap-x-6 gap-y-3', stacked ? 'flex-col' : 'flex-wrap items-center justify-between')}>
        <div className={cn('min-w-0', stacked ? '' : 'flex-1 basis-60')}>
          {labelled ? (
            <label htmlFor={id} className="type-body font-medium text-fg">
              {label}
            </label>
          ) : (
            <p className="type-body font-medium text-fg">{label}</p>
          )}
          {description && <p className="type-caption mt-0.5 text-fg-subtle">{description}</p>}
        </div>
        <div className={cn('min-w-0', stacked ? 'w-full' : 'flex shrink-0 flex-wrap items-center justify-end gap-2')}>{content}</div>
      </div>
    </div>
  );
}

/** A setting with an on/off switch. `extra` renders after the switch (e.g. a "Play" button). */
export function SwitchRow({
  anchor,
  label,
  description,
  checked,
  onChange,
  disabled,
  extra,
}: {
  anchor?: string;
  label: ReactNode;
  description?: ReactNode;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  extra?: ReactNode;
}) {
  const control = <Switch checked={checked} onChange={onChange} label={label} description={description} disabled={disabled} className={extra ? 'min-w-0 flex-1' : undefined} />;
  return (
    <div data-setting={anchor} className={cn(ROW, 'py-2', extra ? 'flex items-center gap-3' : undefined)}>
      {control}
      {extra}
    </div>
  );
}

/** Free-form block inside a card (previews, editors) that can still be a search target. */
export function SettingBlock({ anchor, children, className }: { anchor?: string; children: ReactNode; className?: string }) {
  return (
    <div data-setting={anchor} className={cn(ROW, 'py-4', className)}>
      {children}
    </div>
  );
}

const NOTE_TONES = {
  info: 'bg-info-soft text-info-text',
  warning: 'bg-warning-soft text-warning-text',
  danger: 'bg-danger-soft text-danger-text',
  neutral: 'bg-surface-2 text-fg-muted',
} as const;

export function Note({ tone = 'info', icon: Icon = Info, children, className }: { tone?: keyof typeof NOTE_TONES; icon?: LucideIcon; children: ReactNode; className?: string }) {
  return (
    <div className={cn('flex items-start gap-2.5 rounded-lg px-3.5 py-3 type-body-sm', NOTE_TONES[tone], className)}>
      <Icon size={17} aria-hidden className="mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

/** Shown on cards the signed-in user may view but not change. */
export function LockedNote({ children }: { children?: ReactNode }) {
  const t = useT();
  return (
    <p className="flex items-center gap-1.5 py-3 type-caption text-fg-subtle">
      <Lock size={13} aria-hidden />
      {children ?? t('settings.ui.managerOnly')}
    </p>
  );
}

/** Framed live preview area. */
export function PreviewPanel({ children, className, label }: { children: ReactNode; className?: string; label?: ReactNode }) {
  const t = useT();
  return (
    <div className={cn('rounded-xl border border-dashed border-border-strong bg-surface-2 p-4', className)}>
      <p className="mb-3 flex items-center gap-1.5 type-caption font-semibold tracking-wide text-fg-subtle uppercase">
        <Eye size={13} aria-hidden />
        {label ?? t('settings.ui.livePreview')}
      </p>
      {children}
    </div>
  );
}
