import { APP_CONFIG } from '@/config/app.config';
import { repos } from '@/repositories';
import type { AuditLogEntry, AuditQuery } from '@/repositories/types';
import type { AuditAction, AuditLog, Id, PageRequest, PageResult, User } from '@/types';
import { actor, ctx, requirePermission } from './context';

/* ==========================================================================
   Activity log (audit trail). Users with `audit.view` see everything;
   everyone else only sees their own entries (profile → my activity).
   ========================================================================== */

const EXPORT_PAGE_SIZE = 500;

export const auditService = {
  list(filter: AuditQuery, page: PageRequest): Promise<PageResult<AuditLogEntry>> {
    const context = ctx();
    const scoped: AuditQuery = context.can('audit.view') ? filter : { ...filter, userId: context.user()?.id ?? 'none' };
    return repos().audit.listDetailed(scoped, page);
  },

  /** Recent entries for one record (sale, product, user…). */
  forEntity(entity: string, entityId: Id, limit = 20): Promise<AuditLog[]> {
    requirePermission('audit.view');
    return repos().audit.forEntity(entity, entityId, limit);
  },

  entityTypes(): Promise<string[]> {
    requirePermission('audit.view');
    return repos().audit.entityTypes();
  },

  /** Everyone who can appear in the log (including deactivated staff). */
  users(): Promise<User[]> {
    requirePermission('audit.view');
    return repos().users.list(true);
  },

  /** All rows for a filter (CSV export), capped at the report export limit. */
  async exportRows(filter: AuditQuery): Promise<AuditLogEntry[]> {
    requirePermission('audit.view');
    const rows: AuditLogEntry[] = [];
    for (let page = 1; rows.length < APP_CONFIG.reports.maxExportRows; page += 1) {
      const result = await repos().audit.listDetailed(filter, { page, pageSize: EXPORT_PAGE_SIZE });
      rows.push(...result.rows);
      if (result.rows.length < EXPORT_PAGE_SIZE || rows.length >= result.total) break;
    }
    return rows.slice(0, APP_CONFIG.reports.maxExportRows);
  },

  /** Records an action of the signed-in user. Never throws: the trail must not block work. */
  async record(action: AuditAction, entity: string, entityId: Id | null, details: Record<string, unknown> = {}): Promise<void> {
    try {
      await repos().audit.log({ action, entity, entityId, details }, actor());
    } catch (error) {
      console.error('Writing the activity log failed', error);
    }
  },
};
