import { toLocalDate } from '@/domain/dates';
import { t, type TranslationKey } from '@/i18n';
import type { ExpenseSearchFilter, ShiftListRow, ShiftSearchFilter } from '@/repositories/types';
import { dataService } from '@/services/dataService';
import { searchExpenses, searchShifts } from '@/services/shiftService';
import { toast } from '@/stores/uiStore';
import type { BilingualText, Expense, PageRequest, PageResult } from '@/types';
import { csvMoney, exportFileName, toCsv, type CsvCell } from '@/utils/csv';
import { splitExpenseDescription } from './cashMeta';

/* ==========================================================================
   CSV exports of the shift history and the expense list (current filter,
   up to 5,000 rows). Outcomes are reported with translated toasts.
   ========================================================================== */

const EXPORT_LIMIT = 5_000;
const EXPORT_PAGE = 1_000;

const pad = (value: number): string => String(value).padStart(2, '0');

function localDateTime(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  return `${toLocalDate(date)} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

async function collect<T>(load: (page: PageRequest) => Promise<PageResult<T>>): Promise<T[]> {
  const rows: T[] = [];
  for (let page = 1; rows.length < EXPORT_LIMIT; page += 1) {
    const result = await load({ page, pageSize: EXPORT_PAGE });
    rows.push(...result.rows);
    if (result.rows.length < EXPORT_PAGE || rows.length >= result.total) break;
  }
  return rows.slice(0, EXPORT_LIMIT);
}

interface ExportKeys {
  exported: TranslationKey;
  failed: TranslationKey;
  empty: TranslationKey;
}

async function saveCsv(baseName: string, headers: string[], rows: CsvCell[][], keys: ExportKeys): Promise<void> {
  if (rows.length === 0) {
    toast.info(keys.empty);
    return;
  }
  const fileName = exportFileName(baseName, 'csv');
  const saved = await dataService.saveFile(fileName, toCsv(headers, rows), 'csv');
  if (saved.ok) toast.success({ key: keys.exported, params: { file: saved.filePath?.split(/[\\/]/).pop() ?? fileName } });
  else if (saved.reason !== 'cancelled') toast.error(keys.failed);
}

export interface ShiftExportNames {
  counter: (row: ShiftListRow) => string;
  cashier: (row: ShiftListRow) => string;
}

export async function exportShiftHistory(filter: ShiftSearchFilter, names: ShiftExportNames): Promise<void> {
  try {
    const rows = await collect((page) => searchShifts(filter, page));
    const headers = [
      t('cash.history.columns.shift'),
      t('common.labels.status'),
      t('common.labels.counter'),
      t('common.labels.cashier'),
      t('cash.history.columns.opened'),
      t('cash.history.columns.closed'),
      t('cash.history.columns.opening'),
      t('cash.history.columns.sales'),
      `${t('cash.history.columns.sales')} (${t('cash.common.count')})`,
      t('cash.history.columns.expected'),
      t('cash.history.columns.counted'),
      t('cash.history.columns.difference'),
      t('common.labels.note'),
    ];
    const lines = rows.map((row) => [
      row.shiftNo,
      t(`enums.shiftStatus.${row.status}`),
      names.counter(row),
      names.cashier(row),
      localDateTime(row.openedAt),
      localDateTime(row.closedAt),
      csvMoney(row.openingCash),
      csvMoney(row.salesTotal),
      row.salesCount,
      csvMoney(row.closingTotals?.expectedCash ?? row.drawerCash),
      row.actualCash !== null ? csvMoney(row.actualCash) : '',
      row.difference !== null ? csvMoney(row.difference) : '',
      row.note,
    ]);
    await saveCsv('shift-history', headers, lines, { exported: 'cash.history.exported', failed: 'cash.history.exportFailed', empty: 'cash.history.exportEmpty' });
  } catch (error) {
    toast.fromError(error);
  }
}

export async function exportExpenses(filter: ExpenseSearchFilter, localize: (text: BilingualText) => string): Promise<void> {
  try {
    const rows = await collect<Expense>((page) => searchExpenses(filter, page));
    const headers = [
      t('cash.expenses.columns.number'),
      t('common.labels.date'),
      t('common.labels.category'),
      t('common.labels.description'),
      t('common.labels.reference'),
      t('cash.expenses.columns.paidFrom'),
      t('cash.expenses.columns.paidBy'),
      t('common.labels.status'),
      t('common.labels.amount'),
    ];
    const lines = rows.map((row) => {
      const { note, reference } = splitExpenseDescription(row.description);
      return [
        row.expenseNo,
        row.expenseDate,
        localize(row.categoryName),
        note,
        reference,
        t(`enums.paidFrom.${row.paidFrom}`),
        row.userName ?? '',
        t(`enums.expenseStatus.${row.status}`),
        csvMoney(row.amount),
      ];
    });
    await saveCsv('expenses', headers, lines, { exported: 'cash.expenses.exported', failed: 'cash.expenses.exportFailed', empty: 'cash.expenses.exportEmpty' });
  } catch (error) {
    toast.fromError(error);
  }
}
