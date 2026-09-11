import { newId } from '@/domain/ids';
import { escapeLike } from '@/domain/text';
import type { AppNotification, AuditFilter, AuditLog, Id, PageRequest, PageResult } from '@/types';
import type { SqlClient, SqlStatement } from '@/types/database';
import type { Actor, AuditLogEntry, AuditQuery, AuditRepository, NotificationRepository } from '../types';
import { mapAudit, mapNotification } from './mappers';
import { Where, limitOffset, placeholders, toNum } from './sql';
import { auditStatement } from './statements';

export class LocalAuditRepository implements AuditRepository {
  constructor(private readonly sql: SqlClient) {}

  async log(entry: Parameters<AuditRepository['log']>[0], actor: Actor | null): Promise<void> {
    const statement = auditStatement(actor, entry.action, entry.entity, entry.entityId, entry.details);
    await this.sql.run(statement.sql, statement.params);
  }

  async list(filter: AuditFilter, page: PageRequest): Promise<PageResult<AuditLog>> {
    const where = new Where()
      .when(filter.action && filter.action !== 'all', 'action = ?', filter.action ?? null)
      .when(filter.userId && filter.userId !== 'all', 'user_id = ?', filter.userId ?? null)
      .when(filter.from, 'created_at >= ?', filter.from ?? null)
      .when(filter.to, 'created_at < ?', filter.to ?? null);
    if (filter.search?.trim()) {
      const like = `%${escapeLike(filter.search.trim().toLowerCase())}%`;
      where.add("(LOWER(action) LIKE ? ESCAPE '\\' OR LOWER(COALESCE(user_name, '')) LIKE ? ESCAPE '\\' OR LOWER(details) LIKE ? ESCAPE '\\' OR entity LIKE ? ESCAPE '\\')", like, like, like, like);
    }
    const limit = limitOffset(page.page, page.pageSize);
    const [countRow, rows] = await Promise.all([
      this.sql.get(`SELECT COUNT(*) AS count FROM audit_logs ${where}`, where.params),
      this.sql.all(`SELECT * FROM audit_logs ${where} ORDER BY created_at DESC, rowid DESC ${limit.sql}`, [...where.params, ...limit.params]),
    ]);
    return { rows: rows.map(mapAudit), total: toNum(countRow?.count), page: page.page, pageSize: page.pageSize };
  }

  async forEntity(entity: string, entityId: Id, limit: number): Promise<AuditLog[]> {
    const rows = await this.sql.all('SELECT * FROM audit_logs WHERE entity = ? AND entity_id = ? ORDER BY created_at DESC LIMIT ?', [entity, entityId, limit]);
    return rows.map(mapAudit);
  }

  async listDetailed(filter: AuditQuery, page: PageRequest): Promise<PageResult<AuditLogEntry>> {
    const where = new Where()
      .when(filter.action && filter.action !== 'all', 'a.action = ?', filter.action ?? null)
      .when(filter.userId && filter.userId !== 'all', 'a.user_id = ?', filter.userId ?? null)
      .when(filter.entity && filter.entity !== 'all', 'a.entity = ?', filter.entity ?? null)
      .when(filter.from, 'a.created_at >= ?', filter.from ?? null)
      .when(filter.to, 'a.created_at < ?', filter.to ?? null);
    if (filter.search?.trim()) {
      const like = `%${escapeLike(filter.search.trim().toLowerCase())}%`;
      where.add(
        `(LOWER(a.action) LIKE ? ESCAPE '\\' OR LOWER(COALESCE(a.user_name, '')) LIKE ? ESCAPE '\\' OR LOWER(a.details) LIKE ? ESCAPE '\\'
          OR a.entity LIKE ? ESCAPE '\\' OR LOWER(COALESCE(${AUDIT_REFERENCE_SQL}, '')) LIKE ? ESCAPE '\\')`,
        like,
        like,
        like,
        like,
        like,
      );
    }
    const limit = limitOffset(page.page, page.pageSize);
    const [countRow, rows] = await Promise.all([
      this.sql.get(`SELECT COUNT(*) AS count FROM audit_logs a ${where}`, where.params),
      this.sql.all(`SELECT a.*, ${AUDIT_REFERENCE_SQL} AS reference FROM audit_logs a ${where} ORDER BY a.created_at DESC, a.rowid DESC ${limit.sql}`, [...where.params, ...limit.params]),
    ]);
    return {
      rows: rows.map((row) => ({ ...mapAudit(row), reference: typeof row.reference === 'string' && row.reference !== '' ? row.reference : null })),
      total: toNum(countRow?.count),
      page: page.page,
      pageSize: page.pageSize,
    };
  }

  async entityTypes(): Promise<string[]> {
    const rows = await this.sql.all('SELECT DISTINCT entity FROM audit_logs ORDER BY entity');
    return rows.map((row) => (typeof row.entity === 'string' ? row.entity : '')).filter(Boolean);
  }
}

/** Readable reference for an audit row's entity (correlated lookups; NULL when unknown or deleted). */
const AUDIT_REFERENCE_SQL = `(CASE a.entity
  WHEN 'sale' THEN (SELECT invoice_no FROM sales WHERE id = a.entity_id)
  WHEN 'product' THEN (SELECT sku FROM products WHERE id = a.entity_id)
  WHEN 'purchase' THEN (SELECT po_no FROM purchases WHERE id = a.entity_id)
  WHEN 'shift' THEN (SELECT shift_no FROM cash_sessions WHERE id = a.entity_id)
  WHEN 'customer' THEN (SELECT name FROM customers WHERE id = a.entity_id)
  WHEN 'supplier' THEN (SELECT name FROM suppliers WHERE id = a.entity_id)
  WHEN 'user' THEN (SELECT username FROM users WHERE id = a.entity_id)
  WHEN 'counter' THEN (SELECT code FROM counters WHERE id = a.entity_id)
  WHEN 'expense' THEN (SELECT expense_no FROM expenses WHERE id = a.entity_id)
  WHEN 'category' THEN (SELECT name_en FROM categories WHERE id = a.entity_id)
  WHEN 'brand' THEN (SELECT name_en FROM brands WHERE id = a.entity_id)
  ELSE NULL END)`;

export class LocalNotificationRepository implements NotificationRepository {
  constructor(private readonly sql: SqlClient) {}

  async list(limit: number): Promise<AppNotification[]> {
    const rows = await this.sql.all('SELECT * FROM notifications ORDER BY is_read, created_at DESC LIMIT ?', [limit]);
    return rows.map(mapNotification);
  }

  async unreadCount(): Promise<number> {
    const row = await this.sql.get('SELECT COUNT(*) AS count FROM notifications WHERE is_read = 0');
    return toNum(row?.count);
  }

  private upsert(notification: Omit<AppNotification, 'id' | 'isRead' | 'createdAt'>, now: string): SqlStatement {
    return {
      sql: `INSERT INTO notifications (id, type, severity, title_key, message_key, params, entity, entity_id, is_read, dedupe_key, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
            ON CONFLICT(dedupe_key) DO UPDATE SET severity = excluded.severity, params = excluded.params, title_key = excluded.title_key, message_key = excluded.message_key`,
      params: [
        newId(),
        notification.type,
        notification.severity,
        notification.titleKey,
        notification.messageKey,
        JSON.stringify(notification.params),
        notification.entity,
        notification.entityId,
        notification.dedupeKey,
        now,
      ],
    };
  }

  async sync(notifications: Parameters<NotificationRepository['sync']>[0], managedTypes: AppNotification['type'][]): Promise<void> {
    const now = new Date().toISOString();
    const statements: SqlStatement[] = notifications.map((notification) => this.upsert(notification, now));
    if (managedTypes.length > 0) {
      const keys = notifications.map((notification) => notification.dedupeKey);
      statements.push({
        sql: `DELETE FROM notifications WHERE type IN (${placeholders(managedTypes.length)})${keys.length > 0 ? ` AND dedupe_key NOT IN (${placeholders(keys.length)})` : ''}`,
        params: [...managedTypes, ...keys],
      });
    }
    if (statements.length > 0) await this.sql.transaction(statements);
  }

  async markRead(id: Id): Promise<void> {
    await this.sql.run('UPDATE notifications SET is_read = 1 WHERE id = ?', [id]);
  }

  async markAllRead(): Promise<void> {
    await this.sql.run('UPDATE notifications SET is_read = 1 WHERE is_read = 0');
  }

  async add(notification: Omit<AppNotification, 'id' | 'isRead' | 'createdAt'>): Promise<void> {
    const statement = this.upsert(notification, new Date().toISOString());
    await this.sql.run(statement.sql, statement.params);
  }
}
