import { createElement } from 'react';
import { Link } from 'react-router';
import { ChevronRight, CircleCheck, CircleSlash, FolderPlus, Pencil } from 'lucide-react';
import { useFormat } from '@/hooks/useFormat';
import { useLanguage, useLocalize, useT } from '@/i18n';
import type { Category, Id } from '@/types';
import { StatusBadge } from '@/components/ui/Display';
import { IconButton } from '@/components/ui/IconButton';
import { Skeleton } from '@/components/ui/States';
import { cn } from '@/components/ui/cn';
import { categoryIcon } from '@/components/product/categoryIcons';
import { tintStyle, type CategoryNode } from './catalogUtils';

interface CategoryTreeProps {
  nodes: readonly CategoryNode[];
  /** Products per category id: undefined while loading, null when the counts could not be loaded. */
  counts: ReadonlyMap<Id, number> | null | undefined;
  isOpen: (id: Id) => boolean;
  onToggle: (id: Id) => void;
  /** Given when the user may manage the catalogue. */
  onEdit?: (category: Category) => void;
  onAddSub?: (parent: Category) => void;
}

interface RowProps extends Pick<CategoryTreeProps, 'counts' | 'onEdit' | 'onAddSub'> {
  category: Category;
  /** Subcategories of a main category; undefined for a subcategory row. */
  subcategories?: readonly Category[];
  open: boolean;
  onToggle: () => void;
}

const HEAD = 'h-11 border-b border-border bg-surface-2 px-3 type-label whitespace-nowrap text-fg-muted';
const CELL = 'border-b border-border px-3 align-middle';

function CategoryRow({ category, subcategories, open, onToggle, counts, onEdit, onAddSub }: RowProps) {
  const t = useT();
  const format = useFormat();
  const localize = useLocalize();
  const language = useLanguage();
  const isMain = subcategories !== undefined;
  const subCount = subcategories?.length ?? 0;
  const name = localize(category.name);
  const other = language === 'bn' ? category.name.en : category.name.bn;
  const count = counts ? (counts.get(category.id) ?? 0) : counts;
  const subText = isMain ? (subCount > 0 ? t('catalog.categories.subcount', { count: subCount }) : t('catalog.categories.noSubcategories')) : '';

  return (
    <tr className="transition-base hover:bg-surface-2">
      <td className={cn(CELL, 'py-2')}>
        <div className={cn('flex min-w-[16rem] items-center gap-3', !isMain && 'ps-12')}>
          {isMain &&
            (subCount > 0 ? (
              <button
                type="button"
                aria-expanded={open}
                aria-label={t('catalog.categories.toggle', { name })}
                onClick={onToggle}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-fg-muted transition-base hover:bg-surface-3 hover:text-fg"
              >
                <ChevronRight size={17} aria-hidden className={cn('transition-base', open && 'rotate-90')} />
              </button>
            ) : (
              <span aria-hidden className="w-9 shrink-0" />
            ))}
          <span aria-hidden className={cn('flex shrink-0 items-center justify-center rounded-lg', isMain ? 'h-10 w-10' : 'h-8 w-8')} style={tintStyle(category.color, 22)}>
            {createElement(categoryIcon(category.icon), { size: isMain ? 19 : 16 })}
          </span>
          <div className="min-w-0">
            <p className={cn('truncate text-fg', isMain ? 'font-semibold' : 'font-medium')}>{name}</p>
            <p className="type-caption truncate text-fg-subtle">{[other !== name ? other : '', subText].filter(Boolean).join(' · ') || '—'}</p>
          </div>
        </div>
      </td>
      <td className={CELL}>
        <span className="font-mono text-[0.82rem] whitespace-nowrap text-fg-muted">{category.code}</span>
      </td>
      <td className={cn(CELL, 'text-end tnum')}>
        {count === undefined ? (
          <Skeleton className="ms-auto h-4 w-8" />
        ) : count === null ? (
          <span className="text-fg-subtle">—</span>
        ) : (
          <Link to={`/products?category=${category.id}`} aria-label={t('catalog.categories.viewProducts', { name })} className="rounded-sm font-semibold text-primary-soft-fg hover:underline">
            {format.integer(count)}
          </Link>
        )}
      </td>
      <td className={CELL}>
        {category.isActive ? (
          <StatusBadge size="sm" tone="success" icon={CircleCheck} label={t('common.labels.active')} />
        ) : (
          <StatusBadge size="sm" tone="neutral" icon={CircleSlash} label={t('common.labels.inactive')} />
        )}
      </td>
      {onEdit && (
        <td className={CELL}>
          <div className="flex justify-end gap-1">
            {isMain && onAddSub && <IconButton size="sm" icon={FolderPlus} label={t('catalog.categories.addSubFor', { name })} onClick={() => onAddSub(category)} />}
            <IconButton size="sm" icon={Pencil} label={t('catalog.categories.edit', { name })} onClick={() => onEdit(category)} />
          </div>
        </td>
      )}
    </tr>
  );
}

/** Main categories with their (collapsible) subcategories, product counts and status. */
export function CategoryTree({ nodes, counts, isOpen, onToggle, onEdit, onAddSub }: CategoryTreeProps) {
  const t = useT();
  return (
    <div className="overflow-x-auto">
      <table aria-label={t('catalog.categories.title')} className="w-full border-separate border-spacing-0 text-[0.9rem]">
        <thead>
          <tr>
            <th scope="col" className={cn(HEAD, 'text-start')}>
              {t('catalog.categories.columns.name')}
            </th>
            <th scope="col" className={cn(HEAD, 'w-44 text-start')}>
              {t('catalog.categories.columns.code')}
            </th>
            <th scope="col" className={cn(HEAD, 'w-28 text-end')}>
              {t('catalog.categories.columns.products')}
            </th>
            <th scope="col" className={cn(HEAD, 'w-36 text-start')}>
              {t('catalog.categories.columns.status')}
            </th>
            {onEdit && (
              <th scope="col" className={cn(HEAD, 'w-28')}>
                <span className="sr-only">{t('common.labels.actions')}</span>
              </th>
            )}
          </tr>
        </thead>
        {nodes.map(({ category, children }) => {
          const open = isOpen(category.id);
          return (
            <tbody key={category.id}>
              <CategoryRow category={category} subcategories={children} open={open} onToggle={() => onToggle(category.id)} counts={counts} onEdit={onEdit} onAddSub={onAddSub} />
              {open &&
                children.map((child) => <CategoryRow key={child.id} category={child} open={false} onToggle={() => undefined} counts={counts} onEdit={onEdit} onAddSub={onAddSub} />)}
            </tbody>
          );
        })}
      </table>
    </div>
  );
}
