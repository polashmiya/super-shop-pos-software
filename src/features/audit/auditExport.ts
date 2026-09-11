import { APP_CONFIG } from '@/config/app.config';
import { toLocalDate } from '@/domain/dates';
import { t } from '@/i18n';
import type { AuditQuery } from '@/repositories/types';
import { auditService } from '@/services/auditService';
import { dataService } from '@/services/dataService';
import { toast } from '@/stores/uiStore';
import { exportFileName, toCsv } from '@/utils/csv';
import type { Formatters } from '@/utils/format';
import { actionText, detailRows, entityText } from './auditMeta';

function localTime(iso: string): string {
  const date = new Date(iso);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`;
}

/** Saves the filtered activity log as CSV (capped at the report export limit). */
export async function exportAuditCsv(filter: AuditQuery, format: Formatters): Promise<void> {
  try {
    const rows = await auditService.exportRows(filter);
    if (rows.length === 0) {
      toast.info('settings.audit.exportEmpty');
      return;
    }
    const headers = [t('common.labels.date'), t('common.labels.time'), t('common.labels.user'), t('settings.audit.action'), t('settings.audit.entity'), t('common.labels.reference'), t('settings.audit.recorded')];
    const lines = rows.map((row) => [
      toLocalDate(new Date(row.createdAt)),
      localTime(row.createdAt),
      row.userName ?? t('settings.audit.system'),
      actionText(row.action, t),
      entityText(row.entity, t),
      row.reference ?? '',
      detailRows(row.entity, row.details, t, format)
        .map((detail) => `${detail.label}: ${detail.value.replace(/\n/g, '; ')}`)
        .join(' | '),
    ]);
    const saved = await dataService.saveFile(exportFileName('activity-log', 'csv'), toCsv(headers, lines), 'csv');
    if (saved.ok) {
      toast.success(
        { key: 'settings.audit.exported', params: { count: rows.length } },
        rows.length >= APP_CONFIG.reports.maxExportRows ? { key: 'settings.audit.exportLimited', params: { count: APP_CONFIG.reports.maxExportRows } } : undefined,
      );
    } else if (saved.reason !== 'cancelled') {
      toast.error('errors.saveFailed');
    }
  } catch (error) {
    toast.fromError(error);
  }
}
