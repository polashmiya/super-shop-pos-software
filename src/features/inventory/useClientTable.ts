import { useMemo, useState } from 'react';
import { APP_CONFIG } from '@/config/app.config';
import type { SortState } from '@/components/ui/DataTable';

type SortValue = string | number | null;

/**
 * Client-side sorting + pagination for in-memory lists (catalogue products,
 * suppliers). The page resets to 1 whenever `resetKey` (the filters), the
 * sort or the page size change — derived during render, no effects.
 */
export function useClientTable<T>(rows: readonly T[], getSortValue: (row: T, key: string) => SortValue, initialSort: SortState, resetKey: string) {
  const [sort, setSort] = useState<SortState>(initialSort);
  const [pageSize, setPageSize] = useState<number>(APP_CONFIG.tables.defaultPageSize);
  const key = `${resetKey}|${sort.key}|${sort.direction}|${pageSize}`;
  const [pageState, setPageState] = useState({ key, page: 1 });

  const sorted = useMemo(() => {
    const factor = sort.direction === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const left = getSortValue(a, sort.key) ?? '';
      const right = getSortValue(b, sort.key) ?? '';
      if (typeof left === 'number' && typeof right === 'number') return (left - right) * factor;
      return String(left).localeCompare(String(right)) * factor;
    });
  }, [rows, getSortValue, sort]);

  const pages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const page = Math.min(pageState.key === key ? pageState.page : 1, pages);
  const pageRows = useMemo(() => sorted.slice((page - 1) * pageSize, page * pageSize), [sorted, page, pageSize]);

  return {
    sort,
    setSort,
    page,
    setPage: (next: number) => setPageState({ key, page: next }),
    pageSize,
    setPageSize,
    total: sorted.length,
    sorted,
    rows: pageRows,
  };
}

/**
 * Page number for server-paginated lists: resets to 1 whenever `resetKey`
 * (filters, page size) changes.
 */
export function useResettingPage(resetKey: string): [number, (page: number) => void] {
  const [state, setState] = useState({ key: resetKey, page: 1 });
  const page = state.key === resetKey ? state.page : 1;
  return [page, (next: number) => setState({ key: resetKey, page: next })];
}
