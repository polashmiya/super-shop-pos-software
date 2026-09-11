import type { ReactNode } from 'react';
import { ChevronRight, TrendingDown, TrendingUp, type LucideIcon } from 'lucide-react';
import { Link } from 'react-router';
import { initials } from '@/domain/text';
import { useT } from '@/i18n';
import { cn } from './cn';
import { TONE_DOT } from './tones';

/* ---------------------------------- Badge ---------------------------------- */

export type Tone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger' | 'info';

const TONES: Record<Tone, string> = {
  neutral: 'bg-surface-3 text-fg-muted',
  primary: 'bg-primary-soft text-primary-soft-fg',
  success: 'bg-success-soft text-success-text',
  warning: 'bg-warning-soft text-warning-text',
  danger: 'bg-danger-soft text-danger-text',
  info: 'bg-info-soft text-info-text',
};


export function Badge({ tone = 'neutral', icon: Icon, children, className, size = 'md' }: { tone?: Tone; icon?: LucideIcon; children: ReactNode; className?: string; size?: 'sm' | 'md' }) {
  return (
    <span
      className={cn(
        'inline-flex max-w-full items-center gap-1 rounded-full font-semibold whitespace-nowrap',
        size === 'sm' ? 'px-2 py-0.5 text-[0.7rem]' : 'px-2.5 py-1 text-xs',
        TONES[tone],
        className,
      )}
    >
      {Icon && <Icon size={size === 'sm' ? 12 : 13} aria-hidden strokeWidth={2.4} />}
      <span className="truncate">{children}</span>
    </span>
  );
}

/** Status = colour + icon + text (never colour alone). */
export function StatusBadge({ tone, icon, label, size }: { tone: Tone; icon: LucideIcon; label: ReactNode; size?: 'sm' | 'md' }) {
  return (
    <Badge tone={tone} icon={icon} size={size}>
      {label}
    </Badge>
  );
}

/* ---------------------------------- Card ----------------------------------- */

export function Card({ children, className, padded = true, as: Tag = 'section' }: { children: ReactNode; className?: string; padded?: boolean; as?: 'section' | 'div' | 'article' }) {
  return <Tag className={cn('rounded-xl border border-border bg-surface', padded && 'p-5', className)}>{children}</Tag>;
}

export function SectionHeader({ title, description, action, icon: Icon, className }: { title: ReactNode; description?: ReactNode; action?: ReactNode; icon?: LucideIcon; className?: string }) {
  return (
    <div className={cn('flex items-start justify-between gap-3', className)}>
      <div className="flex min-w-0 items-start gap-2.5">
        {Icon && (
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-surface-3 text-fg-muted">
            <Icon size={17} aria-hidden />
          </span>
        )}
        <div className="min-w-0">
          <h3 className="type-h3 truncate text-fg">{title}</h3>
          {description && <p className="type-body-sm text-fg-subtle">{description}</p>}
        </div>
      </div>
      {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
    </div>
  );
}

export interface BreadcrumbItem {
  label: ReactNode;
  to?: string;
}

export function Breadcrumb({ items }: { items: BreadcrumbItem[] }) {
  const t = useT();
  return (
    <nav aria-label={t('common.labels.breadcrumb')} className="flex items-center gap-1 text-sm text-fg-subtle">
      {items.map((item, index) => (
        <span key={index} className="flex items-center gap-1">
          {index > 0 && <ChevronRight size={14} aria-hidden />}
          {item.to ? (
            <Link to={item.to} className="rounded-sm hover:text-fg hover:underline">
              {item.label}
            </Link>
          ) : (
            <span aria-current={index === items.length - 1 ? 'page' : undefined} className={index === items.length - 1 ? 'text-fg-muted' : ''}>
              {item.label}
            </span>
          )}
        </span>
      ))}
    </nav>
  );
}

/** Page header bar used by every screen except POS. */
export function PageHeader({ title, description, actions, breadcrumb, icon: Icon, children }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; breadcrumb?: BreadcrumbItem[]; icon?: LucideIcon; children?: ReactNode }) {
  return (
    <header className="border-b border-border bg-bg-subtle px-6 pt-4 pb-4">
      {breadcrumb && (
        <div className="mb-1.5">
          <Breadcrumb items={breadcrumb} />
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          {Icon && (
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary-soft-fg">
              <Icon size={21} aria-hidden />
            </span>
          )}
          <div className="min-w-0">
            <h1 className="type-h1 truncate text-fg">{title}</h1>
            {description && <p className="type-body-sm truncate text-fg-muted">{description}</p>}
          </div>
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children && <div className="mt-4">{children}</div>}
    </header>
  );
}

/* ----------------------------------- Kbd ----------------------------------- */

/** Keyboard key. `onPrimary` is for keys shown inside filled primary buttons. */
export function Kbd({ children, className, tone = 'default' }: { children: ReactNode; className?: string; tone?: 'default' | 'onPrimary' }) {
  return (
    <kbd
      className={cn(
        'inline-flex min-w-6 items-center justify-center rounded-sm border px-1.5 py-0.5 font-mono text-[0.72rem] font-medium',
        tone === 'onPrimary' ? 'border-black/10 bg-black/15 text-primary-fg' : 'border-border-strong bg-surface-2 text-fg-muted shadow-[0_1px_0_var(--c-border-strong)]',
        className,
      )}
    >
      {children}
    </kbd>
  );
}

/* --------------------------------- Avatar ---------------------------------- */

export function Avatar({ name, color, size = 36, className }: { name: string; color?: string; size?: number; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn('inline-flex shrink-0 items-center justify-center rounded-full font-bold text-white', className)}
      style={{ width: size, height: size, backgroundColor: color ?? 'var(--c-primary)', fontSize: size * 0.38 }}
    >
      {initials(name)}
    </span>
  );
}

/* --------------------------------- StatCard -------------------------------- */

export interface StatCardProps {
  label: ReactNode;
  value: ReactNode;
  icon?: LucideIcon;
  tone?: Tone;
  /** Change vs previous period as a fraction (0.12 = +12%). */
  delta?: number | null;
  deltaLabel?: ReactNode;
  /** When lower is better (returns, discount), invert the delta colour. */
  invertDelta?: boolean;
  hint?: ReactNode;
  formatDelta?: (value: number) => string;
  className?: string;
  onClick?: () => void;
}

export function StatCard({ label, value, icon: Icon, tone = 'primary', delta, deltaLabel, invertDelta, hint, formatDelta, className, onClick }: StatCardProps) {
  const positive = delta !== undefined && delta !== null && delta > 0;
  const negative = delta !== undefined && delta !== null && delta < 0;
  const good = invertDelta ? negative : positive;
  const bad = invertDelta ? positive : negative;
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={cn('flex min-w-0 flex-col gap-2 rounded-xl border border-border bg-surface p-4 text-start', onClick && 'transition-base hover:border-border-strong hover:bg-surface-2', className)}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="type-label truncate text-fg-muted">{label}</span>
        {Icon && (
          <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-md', TONES[tone])}>
            <Icon size={17} aria-hidden />
          </span>
        )}
      </div>
      <div className="truncate text-[1.55rem] leading-tight font-bold tracking-tight text-fg tnum">{value}</div>
      {(delta !== undefined || hint) && (
        <div className="flex items-center gap-2 text-xs">
          {delta !== undefined && delta !== null && (
            <span className={cn('inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 font-semibold', good ? 'bg-success-soft text-success-text' : bad ? 'bg-danger-soft text-danger-text' : 'bg-surface-3 text-fg-muted')}>
              {positive ? <TrendingUp size={12} aria-hidden /> : negative ? <TrendingDown size={12} aria-hidden /> : null}
              {formatDelta ? formatDelta(delta) : `${Math.round(delta * 100)}%`}
            </span>
          )}
          {deltaLabel && <span className="truncate text-fg-subtle">{deltaLabel}</span>}
          {hint && <span className="truncate text-fg-subtle">{hint}</span>}
        </div>
      )}
    </Tag>
  );
}

/* ------------------------------- Definition -------------------------------- */

export function DefinitionList({ items, columns = 2 }: { items: Array<{ label: ReactNode; value: ReactNode }>; columns?: 1 | 2 | 3 }) {
  return (
    <dl className={cn('grid gap-x-6 gap-y-3', columns === 1 ? 'grid-cols-1' : columns === 2 ? 'grid-cols-2' : 'grid-cols-3')}>
      {items.map((item, index) => (
        <div key={index} className="min-w-0">
          <dt className="type-caption text-fg-subtle">{item.label}</dt>
          <dd className="type-body truncate font-medium text-fg">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Progress bar for shares (charts in tables, stock levels). */
export function Meter({ value, tone = 'primary', className, label }: { value: number; tone?: Tone; className?: string; label?: string }) {
  const clamped = Math.max(0, Math.min(1, value));
  return (
    <div role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(clamped * 100)} aria-label={label} className={cn('h-1.5 w-full overflow-hidden rounded-full bg-surface-3', className)}>
      <div className={cn('h-full rounded-full', TONE_DOT[tone])} style={{ width: `${clamped * 100}%` }} />
    </div>
  );
}
