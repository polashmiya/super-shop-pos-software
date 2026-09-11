import { ChevronRight, Star } from 'lucide-react';
import { Link } from 'react-router';
import { useT } from '@/i18n';
import { cn } from '@/components/ui/cn';
import { Tooltip } from '@/components/ui/Tooltip';
import { GROUP_TONE } from './groupMeta';
import type { ReportDefinition } from './types';

/* ==========================================================================
   A report in the library: icon, name and one-line description (the whole
   card opens the report) plus a favourite toggle.
   ========================================================================== */

interface ReportCardProps {
  definition: ReportDefinition;
  favourite: boolean;
  onToggleFavourite: () => void;
}

export function ReportCard({ definition, favourite, onToggleFavourite }: ReportCardProps) {
  const t = useT();
  const Icon = definition.icon;
  const title = t(`reports.items.${definition.id}.title`);
  const toggleLabel = favourite ? t('reports.library.removeFavourite', { name: title }) : t('reports.library.addFavourite', { name: title });
  return (
    <article className="group relative flex min-h-[6.75rem] rounded-xl border border-border bg-surface transition-base hover:border-border-strong hover:bg-surface-2 has-[a:focus-visible]:ring-2 has-[a:focus-visible]:ring-focus">
      <Link to={`/reports/${definition.id}`} className="flex flex-1 items-start gap-3 rounded-xl p-4 pe-14 outline-none">
        <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-lg', GROUP_TONE[definition.group])}>
          <Icon size={20} aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1 text-[0.98rem] font-semibold text-fg">
            <span className="truncate">{title}</span>
            <ChevronRight size={16} aria-hidden className="shrink-0 text-fg-subtle opacity-0 transition-base group-hover:opacity-100" />
          </span>
          <span className="type-body-sm mt-0.5 line-clamp-2 block text-fg-muted">{t(`reports.items.${definition.id}.description`)}</span>
        </span>
      </Link>
      <Tooltip content={toggleLabel} side="left">
        <button
          type="button"
          onClick={onToggleFavourite}
          aria-pressed={favourite}
          aria-label={toggleLabel}
          className="absolute end-2 top-2 flex h-touch w-touch items-center justify-center rounded-md text-fg-subtle transition-base hover:bg-surface-3 hover:text-fg"
        >
          <Star size={18} aria-hidden className={favourite ? 'fill-warning text-warning' : undefined} />
        </button>
      </Tooltip>
    </article>
  );
}
