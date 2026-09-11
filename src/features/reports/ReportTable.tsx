import { useState, type ReactNode } from 'react';
import { CircleCheck, CircleDot, CircleX, Info, TriangleAlert, type LucideIcon } from 'lucide-react';
import { APP_CONFIG } from '@/config/app.config';
import { useT } from '@/i18n';
import { cn } from '@/components/ui/cn';
import { SearchInput } from '@/components/ui/Controls';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { StatusBadge, type Tone } from '@/components/ui/Display';
import { cellText, resolveText, type LabelContext } from './labels';
import { columnTotal, hasTotals, type TableSort } from './tableModel';
import type { ReportColumnDef, ReportRowData, ReportTableData } from './types';

/* ==========================================================================
   The report's detail table: client-side sort and pagination over every
   row, column visibility (remembered per report), table search and a
   totals row computed over all listed rows (not just the visible page).
   ========================================================================== */

const TONE_ICON: Record<Tone, LucideIcon> = {
  neutral: CircleDot,
  primary: CircleDot,
  info: Info,
  success: CircleCheck,
  warning: TriangleAlert,
  danger: CircleX,
};

const TOTAL_KEY = '__total';

function signClass(column: ReportColumnDef, value: unknown): string | undefined {
  if (!column.signTone || typeof value !== 'number') return undefined;
  return value > 0 ? 'text-success-text' : value < 0 ? 'text-danger-text' : undefined;
}

function CellView({ column, row, ctx }: { column: ReportColumnDef; row: ReportRowData; ctx: LabelContext }) {
  const raw = row[column.key];
  const text = cellText(column, row, ctx);
  const tone = column.tones && typeof raw === 'string' ? column.tones[raw] : undefined;
  if (tone) return <StatusBadge size="sm" tone={tone} icon={TONE_ICON[tone]} label={text} />;
  const empty = raw === null || raw === undefined || raw === '';
  return (
    <span
      title={column.kind === 'text' && !column.wrap ? text : undefined}
      className={cn(
        column.mono && 'font-mono text-[0.84rem]',
        column.wrap ? 'block max-w-72 break-words whitespace-normal' : column.kind === 'text' ? 'block max-w-80 truncate' : 'whitespace-nowrap',
        signClass(column, raw),
        empty && !column.fallbackKey && 'text-fg-subtle',
      )}
    >
      {text}
    </span>
  );
}

function TotalCell({ column, row, first, ctx }: { column: ReportColumnDef; row: ReportRowData; first: boolean; ctx: LabelContext }) {
  const value = row[column.key];
  if (value === null || value === undefined) return first ? <span className="whitespace-nowrap">{ctx.t('reports.view.total')}</span> : null;
  return <span className={cn('whitespace-nowrap', signClass(column, value))}>{cellText(column, row, ctx)}</span>;
}

interface ReportTableProps {
  table: ReportTableData;
  /** Rows as listed (search and sort applied). */
  rows: ReportRowData[];
  sort: TableSort | null;
  onSortChange: (sort: TableSort) => void;
  search: string;
  onSearchChange: (value: string) => void;
  searchable: boolean;
  columnsKey: string;
  ctx: LabelContext;
  loading: boolean;
  empty: ReactNode;
  title: string;
}

export function ReportTable({ table, rows, sort, onSortChange, search, onSearchChange, searchable, columnsKey, ctx, loading, empty, title }: ReportTableProps) {
  const t = useT();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(APP_CONFIG.tables.defaultPageSize);
  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  const current = Math.min(page, pages);
  const pageRows = rows.slice((current - 1) * pageSize, current * pageSize);
  const totals: ReportRowData | null =
    hasTotals(table.columns) && rows.length > 0 ? { [TOTAL_KEY]: 1, ...Object.fromEntries(table.columns.map((column) => [column.key, columnTotal(column, rows)])) } : null;

  const columns: Array<Column<ReportRowData>> = table.columns.map((column, index) => ({
    key: column.key,
    header: t(column.labelKey),
    sortKey: column.key,
    align: column.align === 'end' ? 'end' : 'start',
    hideable: index > 0,
    defaultHidden: column.hidden,
    cell: (row) => (row[TOTAL_KEY] ? <TotalCell column={column} row={row} first={index === 0} ctx={ctx} /> : <CellView column={column} row={row} ctx={ctx} />),
  }));

  return (
    <DataTable
      ariaLabel={title}
      className="min-h-[22rem]"
      dense
      columns={columns}
      columnsKey={columnsKey}
      rows={totals ? [...pageRows, totals] : pageRows}
      rowKey={(row) => (row[TOTAL_KEY] ? TOTAL_KEY : String(row[table.rowKey] ?? ''))}
      rowClassName={(row) => (row[TOTAL_KEY] ? 'bg-surface-2 font-semibold' : undefined)}
      loading={loading}
      sort={sort ?? table.defaultSort ?? null}
      onSortChange={(next) => {
        onSortChange(next);
        setPage(1);
      }}
      toolbar={
        <div className="flex flex-1 flex-wrap items-center gap-x-3 gap-y-2">
          {searchable && (
            <div className="max-w-sm min-w-[14rem] flex-1">
              <SearchInput
                value={search}
                onChange={(value) => {
                  onSearchChange(value);
                  setPage(1);
                }}
                clearLabel={t('common.actions.clear')}
                placeholder={t('reports.view.tableSearch')}
                aria-label={t('reports.view.tableSearchLabel')}
              />
            </div>
          )}
          <span className="type-body-sm text-fg-muted">{t('reports.view.rows', { count: rows.length })}</span>
          {table.notice && (
            <span className="type-caption flex items-center gap-1.5 text-fg-subtle">
              <Info size={14} aria-hidden />
              {resolveText(table.notice, ctx)}
            </span>
          )}
        </div>
      }
      pagination={
        rows.length > 0
          ? {
              page: current,
              pageSize,
              total: rows.length,
              onPageChange: setPage,
              onPageSizeChange: (size) => {
                setPageSize(size);
                setPage(1);
              },
            }
          : undefined
      }
      empty={empty}
    />
  );
}
