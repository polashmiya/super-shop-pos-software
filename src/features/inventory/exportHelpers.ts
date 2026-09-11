import { buildReportDocument, openPrintPreview } from '@/features/printing/printService';
import { dataService } from '@/services/dataService';
import { toast } from '@/stores/uiStore';
import { exportFileName, toCsv, type CsvCell } from '@/utils/csv';

/* ==========================================================================
   CSV export + A4 print helpers used by the inventory, ledger, purchase and
   supplier screens. Outcomes are reported with friendly, translated toasts.
   ========================================================================== */

/** Saves rows as CSV where the user chooses. Returns true when the file was written. */
export async function saveCsvExport(baseName: string, headers: readonly string[], rows: ReadonlyArray<readonly CsvCell[]>): Promise<boolean> {
  if (rows.length === 0) {
    toast.info('inventory.shared.nothingToExport');
    return false;
  }
  try {
    const result = await dataService.saveFile(exportFileName(baseName, 'csv'), toCsv(headers, rows), 'csv');
    if (result.ok) {
      toast.success('inventory.shared.exported', { key: 'inventory.shared.exportedRows', params: { count: rows.length } });
      return true;
    }
    if (result.reason !== 'cancelled') toast.error('errors.saveFailed');
    return false;
  } catch (error) {
    toast.fromError(error);
    return false;
  }
}

type ReportInput = Parameters<typeof buildReportDocument>[0];

/** Builds an A4 report and opens the in-app print preview (printer, copies, PDF). */
export async function previewA4Report(input: ReportInput): Promise<void> {
  try {
    const request = await buildReportDocument(input);
    await openPrintPreview(request);
  } catch (error) {
    toast.fromError(error);
  }
}
