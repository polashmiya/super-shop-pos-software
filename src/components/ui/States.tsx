import type { ReactNode } from 'react';
import { CircleAlert, Inbox, type LucideIcon } from 'lucide-react';
import { cn } from './cn';
import { Spinner } from './Spinner';

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn('animate-pulse rounded-md bg-surface-3', className)} />;
}

export function SkeletonRows({ rows = 6, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn('flex flex-col gap-2 p-4', className)} aria-hidden>
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton key={index} className="h-10 w-full" />
      ))}
    </div>
  );
}

export function LoadingState({ label, className }: { label: string; className?: string }) {
  return (
    <div role="status" aria-live="polite" className={cn('flex flex-col items-center justify-center gap-3 p-10 text-fg-muted', className)}>
      <Spinner size={26} className="text-primary" />
      <span className="type-body-sm">{label}</span>
    </div>
  );
}

export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
  className,
  compact,
}: {
  icon?: LucideIcon;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
  compact?: boolean;
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center text-center', compact ? 'gap-2 p-6' : 'gap-3 p-10', className)}>
      <span className={cn('flex items-center justify-center rounded-2xl bg-surface-3 text-fg-subtle', compact ? 'h-12 w-12' : 'h-16 w-16')}>
        <Icon size={compact ? 22 : 30} aria-hidden strokeWidth={1.7} />
      </span>
      <div className="max-w-sm">
        <p className={cn('font-semibold text-fg', compact ? 'type-body' : 'type-h3')}>{title}</p>
        {description && <p className="type-body-sm mt-1 text-fg-muted">{description}</p>}
      </div>
      {action && <div className="mt-1 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}

export function ErrorState({ title, description, action, className }: { title: ReactNode; description?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div role="alert" className={cn('flex flex-col items-center justify-center gap-3 p-10 text-center', className)}>
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-danger-soft text-danger-text">
        <CircleAlert size={28} aria-hidden />
      </span>
      <div className="max-w-sm">
        <p className="type-h3 text-fg">{title}</p>
        {description && <p className="type-body-sm mt-1 text-fg-muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}

/** Thin progress line at the top of a panel while data refreshes. */
export function LoadingBar({ active }: { active: boolean }) {
  if (!active) return null;
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-0.5 overflow-hidden" aria-hidden>
      <div className="h-full w-1/3 animate-[loading-bar_1s_ease-in-out_infinite] bg-primary" />
    </div>
  );
}
