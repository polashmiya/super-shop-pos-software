import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Monitor, SearchX, Store } from 'lucide-react';
import { useT, type TranslationKey } from '@/i18n';
import { cn } from '@/components/ui/cn';
import { SearchInput } from '@/components/ui/Controls';
import { searchSettings, type SettingsSearchEntry } from '../searchIndex';
import { SETTINGS_GROUPS, findSection, type SettingsSection, type SettingsSectionId } from '../sections';

/* ==========================================================================
   Left pane of the Settings Center: search (label + bilingual keywords)
   and the grouped section list with a scope hint for every section.
   ========================================================================== */

export function SettingsNav({ sections, activeId }: { sections: SettingsSection[]; activeId: SettingsSectionId | undefined }) {
  const t = useT();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const allowed = useMemo(() => new Set(sections.map((section) => section.id)), [sections]);
  const results = useMemo(() => searchSettings(query, t, allowed), [query, t, allowed]);
  const searching = query.trim().length > 0;

  const open = (entry: SettingsSearchEntry) => {
    navigate({ pathname: `/settings/${entry.section}`, search: entry.anchor ? `?focus=${encodeURIComponent(entry.anchor)}` : '' });
  };

  return (
    <aside aria-label={t('settings.ui.sectionsLabel')} className="flex w-72 shrink-0 flex-col border-e border-border bg-bg-subtle">
      <div className="border-b border-border p-3">
        <SearchInput
          value={query}
          onChange={setQuery}
          clearLabel={t('common.actions.clear')}
          placeholder={t('settings.searchPlaceholder')}
          aria-label={t('settings.ui.searchLabel')}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && results[0]) {
              event.preventDefault();
              open(results[0]);
            } else if (event.key === 'Escape' && query) {
              event.preventDefault();
              event.stopPropagation();
              setQuery('');
            }
          }}
        />
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto p-2">
        {searching ? (
          <div>
            <p role="status" className="px-3 pt-1 pb-2 type-caption text-fg-subtle">
              {results.length > 0 ? t('settings.ui.results', { count: results.length }) : ''}
            </p>
            {results.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
                <SearchX size={26} aria-hidden className="text-fg-subtle" />
                <p className="type-body-sm text-fg-muted">{t('settings.noMatches', { query: query.trim() })}</p>
              </div>
            ) : (
              <ul className="flex flex-col gap-0.5">
                {results.map((entry) => (
                  <li key={`${entry.section}:${entry.labelKey}:${entry.anchor ?? ''}`}>
                    <ResultButton entry={entry} active={entry.section === activeId} onOpen={open} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          SETTINGS_GROUPS.map((group) => {
            const items = sections.filter((section) => section.group === group);
            if (items.length === 0) return null;
            return (
              <div key={group} className="mb-2">
                <h2 className="px-3 pt-3 pb-1.5 type-caption font-semibold tracking-wider text-fg-subtle uppercase">{t(`settings.groups.${group}`)}</h2>
                <ul className="flex flex-col gap-0.5">
                  {items.map((section) => (
                    <li key={section.id}>
                      <SectionLink section={section} active={section.id === activeId} />
                    </li>
                  ))}
                </ul>
              </div>
            );
          })
        )}
      </nav>
    </aside>
  );
}

function SectionLink({ section, active }: { section: SettingsSection; active: boolean }) {
  const t = useT();
  const Icon = section.icon;
  const ScopeIcon = section.scope === 'device' ? Monitor : Store;
  return (
    <Link
      to={`/settings/${section.id}`}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'group flex min-h-touch items-center gap-3 rounded-lg px-2.5 py-1.5 transition-base',
        active ? 'bg-primary-soft text-primary-soft-fg' : 'text-fg-muted hover:bg-surface-3 hover:text-fg',
      )}
    >
      <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-md transition-base', active ? 'bg-primary text-primary-fg' : 'bg-surface-2 text-fg-muted group-hover:text-fg')}>
        <Icon size={17} aria-hidden />
      </span>
      <span className="min-w-0 flex-1 leading-tight">
        <span className="block truncate text-[0.9rem] font-medium">{t(`settings.sections.${section.id}.title` as TranslationKey)}</span>
        {section.scope !== 'info' && (
          <span className={cn('mt-0.5 flex items-center gap-1 text-[0.7rem]', active ? 'text-primary-soft-fg' : 'text-fg-subtle')}>
            <ScopeIcon size={11} aria-hidden />
            {section.scope === 'device' ? t('settings.deviceScope') : t('settings.businessScope')}
          </span>
        )}
      </span>
    </Link>
  );
}

function ResultButton({ entry, active, onOpen }: { entry: SettingsSearchEntry; active: boolean; onOpen: (entry: SettingsSearchEntry) => void }) {
  const t = useT();
  const section = findSection(entry.section);
  const Icon = section?.icon ?? Monitor;
  return (
    <button
      type="button"
      onClick={() => onOpen(entry)}
      className={cn('flex min-h-touch w-full items-center gap-3 rounded-lg px-2.5 py-1.5 text-start transition-base', active ? 'bg-surface-3' : 'hover:bg-surface-3')}
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-surface-2 text-fg-muted">
        <Icon size={16} aria-hidden />
      </span>
      <span className="min-w-0 flex-1 leading-tight">
        <span className="block truncate text-[0.9rem] font-medium text-fg">{t(entry.labelKey)}</span>
        <span className="mt-0.5 block truncate text-[0.72rem] text-fg-subtle">{t(`settings.sections.${entry.section}.title` as TranslationKey)}</span>
      </span>
    </button>
  );
}
