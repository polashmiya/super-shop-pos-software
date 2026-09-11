import { useMemo, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, Columns3 } from 'lucide-react';
import { APP_CONFIG } from '@/config/app.config';
import { useFormat } from '@/hooks/useFormat';
import { useT } from '@/i18n';
import { cn } from './cn';
import { Checkbox, Select } from './Controls';
import { Popover } from './Menu';
import { EmptyState, SkeletonRows } from './States';

/* ==========================================================================
   DataTable: sticky header, sorting (client or server), row selection with
   bulk actions, column visibility (remembered), pagination, loading and
   empty states. Horizontal scroll on narrow windows.
   ========================================================================== */

export interface Column<T> {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  sortValue?: (row: T) => string | number | null;
  /** Server-side sort key (when onSortChange is used). */
  sortKey?: string;
  align?: 'start' | 'end' | 'center';
  width?: string;
  hideable?: boolean;
  defaultHidden?: boolean;
  className?: string;
}

export interface SortState {
  key: string;
  direction: 'asc' | 'desc';
}

export interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
}

export interface DataTableProps<T> {
  columns: Array<Column<T>>;
  rows: readonly T[];
  rowKey: (row: T) => string;
  loading?: boolean;
  empty?: ReactNode;
  sort?: SortState | null;
  onSortChange?: (sort: SortState) => void;
  selection?: { selected: ReadonlySet<string>; onChange: (selected: Set<string>) => void };
  bulkActions?: (selectedIds: string[]) => ReactNode;
  onRowClick?: (row: T) => void;
  pagination?: PaginationProps;
  toolbar?: ReactNode;
  /** localStorage key to remember hidden columns. */
  columnsKey?: string;
  dense?: boolean;
  className?: string;
  rowClassName?: (row: T) => string | undefined;
  ariaLabel: string;
}

function readHidden(key: string | undefined, columns: Array<Column<unknown>>): Set<string> {
  const defaults = new Set(columns.filter((column) => column.defaultHidden).map((column) => column.key));
  if (!key) return defaults;
  try {
    const stored = window.localStorage.getItem(`table-columns:${key}`);
    return stored ? new Set(JSON.parse(stored) as string[]) : defaults;
  } catch {
    return defaults;
  }
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  loading,
  empty,
  sort,
  onSortChange,
  selection,
  bulkActions,
  onRowClick,
  pagination,
  toolbar,
  columnsKey,
  dense,
  className,
  rowClassName,
  ariaLabel,
}: DataTableProps<T>) {
  const t = useT();
  const [localSort, setLocalSort] = useState<SortState | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(() => readHidden(columnsKey, columns as Array<Column<unknown>>));
  const [columnsAnchor, setColumnsAnchor] = useState<HTMLElement | null>(null);
  const [columnsOpen, setColumnsOpen] = useState(false);

  const activeSort = onSortChange ? (sort ?? null) : localSort;
  const visibleColumns = columns.filter((column) => !hidden.has(column.key));

  const sortedRows = useMemo(() => {
    if (onSortChange || !localSort) return rows;
    const column = columns.find((entry) => entry.key === localSort.key);
    if (!column?.sortValue) return rows;
    const factor = localSort.direction === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const left = column.sortValue?.(a) ?? '';
      const right = column.sortValue?.(b) ?? '';
      if (typeof left === 'number' && typeof right === 'number') return (left - right) * factor;
      return String(left).localeCompare(String(right)) * factor;
    });
  }, [rows, columns, localSort, onSortChange]);

  const toggleSort = (column: Column<T>) => {
    const key = column.sortKey ?? column.key;
    const next: SortState = activeSort?.key === key && activeSort.direction === 'desc' ? { key, direction: 'asc' } : { key, direction: 'desc' };
    if (onSortChange) onSortChange(next);
    else setLocalSort(next);
  };

  const toggleColumn = (key: string) => {
    const next = new Set(hidden);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setHidden(next);
    if (columnsKey) {
      try {
        window.localStorage.setItem(`table-columns:${columnsKey}`, JSON.stringify([...next]));
      } catch {
        // Storage may be unavailable; the choice then lasts for this session only.
      }
    }
  };

  const allIds = sortedRows.map(rowKey);
  const selectedCount = selection ? allIds.filter((id) => selection.selected.has(id)).length : 0;
  const allSelected = selection !== undefined && allIds.length > 0 && selectedCount === allIds.length;
  const hideable = columns.filter((column) => column.hideable);

  return (
    <div className={cn('flex min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-surface', className)}>
      {(toolbar || hideable.length > 0 || (selection && selection.selected.size > 0)) && (
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2.5">
          {selection && selection.selected.size > 0 ? (
            <div className="flex flex-1 flex-wrap items-center gap-2">
              <span className="type-label rounded-md bg-primary-soft px-2.5 py-1.5 text-primary-soft-fg">{t('common.table.selected', { count: selection.selected.size })}</span>
              {bulkActions?.([...selection.selected])}
              <button type="button" className="type-label rounded-md px-2 py-1.5 text-fg-muted hover:text-fg" onClick={() => selection.onChange(new Set())}>
                {t('common.actions.clearSelection')}
              </button>
            </div>
          ) : (
            <div className="flex flex-1 flex-wrap items-center gap-2">{toolbar}</div>
          )}
          {hideable.length > 0 && (
            <>
              <button
                ref={setColumnsAnchor}
                type="button"
                onClick={() => setColumnsOpen((open) => !open)}
                aria-expanded={columnsOpen}
                className="inline-flex h-10 items-center gap-2 rounded-md border border-border bg-surface-2 px-3 text-sm font-medium text-fg-muted hover:text-fg"
              >
                <Columns3 size={16} aria-hidden />
                {t('common.actions.columns')}
              </button>
              <Popover open={columnsOpen} onClose={() => setColumnsOpen(false)} anchor={columnsAnchor} width={240}>
                <p className="type-caption px-2 pt-1 pb-2 text-fg-subtle">{t('common.table.visibleColumns')}</p>
                <div className="flex flex-col gap-1 px-2 pb-1">
                  {hideable.map((column) => (
                    <Checkbox key={column.key} checked={!hidden.has(column.key)} onChange={() => toggleColumn(column.key)} label={column.header} />
                  ))}
                </div>
              </Popover>
            </>
          )}
        </div>
      )}

      <div className="relative min-h-0 flex-1 overflow-auto">
        <table aria-label={ariaLabel} aria-busy={loading || undefined} className="w-full border-separate border-spacing-0 text-[0.9rem]">
          <thead className="sticky top-0 z-[1]">
            <tr>
              {selection && (
                <th scope="col" className="w-12 border-b border-border bg-surface-2 px-3 text-start">
                  <Checkbox
                    checked={allSelected}
                    indeterminate={selectedCount > 0 && !allSelected}
                    ariaLabel={t('common.actions.selectAll')}
                    onChange={(checked) => {
                      const next = new Set(selection.selected);
                      for (const id of allIds) {
                        if (checked) next.add(id);
                        else next.delete(id);
                      }
                      selection.onChange(next);
                    }}
                  />
                </th>
              )}
              {visibleColumns.map((column) => {
                const sortable = Boolean(column.sortValue || column.sortKey);
                const sortKey = column.sortKey ?? column.key;
                const isSorted = activeSort?.key === sortKey;
                return (
                  <th
                    key={column.key}
                    scope="col"
                    style={column.width ? { width: column.width } : undefined}
                    aria-sort={isSorted ? (activeSort?.direction === 'asc' ? 'ascending' : 'descending') : undefined}
                    className={cn(
                      'h-11 border-b border-border bg-surface-2 px-3 type-label whitespace-nowrap text-fg-muted',
                      column.align === 'end' ? 'text-end' : column.align === 'center' ? 'text-center' : 'text-start',
                    )}
                  >
                    {sortable ? (
                      <button type="button" onClick={() => toggleSort(column)} className={cn('inline-flex items-center gap-1 rounded-sm hover:text-fg', column.align === 'end' && 'flex-row-reverse')}>
                        {column.header}
                        {isSorted ? activeSort?.direction === 'asc' ? <ArrowUp size={13} aria-hidden /> : <ArrowDown size={13} aria-hidden /> : <ArrowUpDown size={13} aria-hidden className="opacity-40" />}
                      </button>
                    ) : (
                      column.header
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {!loading &&
              sortedRows.map((row) => {
                const id = rowKey(row);
                const selected = selection?.selected.has(id) ?? false;
                return (
                  <tr
                    key={id}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                    onKeyDown={
                      onRowClick
                        ? (event) => {
                            if (event.key === 'Enter') onRowClick(row);
                          }
                        : undefined
                    }
                    tabIndex={onRowClick ? 0 : undefined}
                    aria-selected={selection ? selected : undefined}
                    className={cn('group transition-base', onRowClick && 'cursor-pointer hover:bg-surface-2 focus-visible:bg-surface-2', selected && 'bg-primary-soft/60', rowClassName?.(row))}
                  >
                    {selection && (
                      <td className="border-b border-border px-3" onClick={(event) => event.stopPropagation()}>
                        <Checkbox
                          checked={selected}
                          ariaLabel={t('common.actions.select')}
                          onChange={(checked) => {
                            const next = new Set(selection.selected);
                            if (checked) next.add(id);
                            else next.delete(id);
                            selection.onChange(next);
                          }}
                        />
                      </td>
                    )}
                    {visibleColumns.map((column) => (
                      <td
                        key={column.key}
                        className={cn(
                          'border-b border-border px-3 align-middle text-fg',
                          dense ? 'h-10' : 'h-row py-2',
                          column.align === 'end' ? 'text-end tnum' : column.align === 'center' ? 'text-center' : 'text-start',
                          column.className,
                        )}
                      >
                        {column.cell(row)}
                      </td>
                    ))}
                  </tr>
                );
              })}
          </tbody>
        </table>
        {loading && <SkeletonRows rows={Math.min(pagination?.pageSize ?? 8, 10)} />}
        {!loading && sortedRows.length === 0 && (empty ?? <EmptyState title={t('common.table.noRows')} compact />)}
      </div>

      {pagination && <Pagination {...pagination} />}
    </div>
  );
}

export function Pagination({ page, pageSize, total, onPageChange, onPageSizeChange }: PaginationProps) {
  const t = useT();
  const format = useFormat();
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-3 py-2">
      <span className="type-body-sm text-fg-muted">{t('common.table.showing', { from: format.integer(from), to: format.integer(to), total: format.integer(total) })}</span>
      <div className="flex items-center gap-2">
        {onPageSizeChange && (
          <label className="flex items-center gap-2 text-sm text-fg-muted">
            <span className="hidden sm:inline">{t('common.table.perPage')}</span>
            <div className="w-20">
              <Select
                compact
                value={String(pageSize)}
                options={APP_CONFIG.tables.pageSizes.map((size) => ({ value: String(size), label: format.integer(size) }))}
                onChange={(value) => onPageSizeChange(Number(value))}
              />
            </div>
          </label>
        )}
        <span className="type-body-sm px-1 text-fg-muted tnum">{t('common.table.page', { page: format.integer(page), pages: format.integer(pages) })}</span>
        <button type="button" disabled={page <= 1} onClick={() => onPageChange(page - 1)} aria-label={t('common.actions.previous')} className="flex h-9 w-9 items-center justify-center rounded-md border border-border bg-surface-2 text-fg-muted hover:text-fg disabled:opacity-40">
          <ChevronLeft size={17} aria-hidden />
        </button>
        <button type="button" disabled={page >= pages} onClick={() => onPageChange(page + 1)} aria-label={t('common.actions.next')} className="flex h-9 w-9 items-center justify-center rounded-md border border-border bg-surface-2 text-fg-muted hover:text-fg disabled:opacity-40">
          <ChevronRight size={17} aria-hidden />
        </button>
      </div>
    </div>
  );
}
