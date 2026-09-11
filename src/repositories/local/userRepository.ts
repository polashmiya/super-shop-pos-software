import { isPermission, PERMISSION_GROUPS, ROLE_ORDER, type Permission } from '@/config/permissions';
import { AppError } from '@/domain/errors';
import { newId } from '@/domain/ids';
import type { Id, Role, RoleId, User, UserInput, UserPreferences } from '@/types';
import type { SqlClient, SqlStatement } from '@/types/database';
import type { Actor, UserCredentials, UserRepository } from '../types';
import { mapUser } from './mappers';
import { SqlError, bool, toBool, toStr } from './sql';
import { auditStatement } from './statements';

export class LocalUserRepository implements UserRepository {
  constructor(private readonly sql: SqlClient) {}

  async list(includeInactive = false): Promise<User[]> {
    const rows = await this.sql.all(
      `SELECT * FROM users WHERE deleted_at IS NULL ${includeInactive ? '' : 'AND is_active = 1'}
        ORDER BY CASE role_id WHEN 'admin' THEN 0 WHEN 'manager' THEN 1 ELSE 2 END, name_en`,
    );
    return rows.map(mapUser);
  }

  async getById(id: Id): Promise<User | null> {
    const row = await this.sql.get('SELECT * FROM users WHERE id = ?', [id]);
    return row ? mapUser(row) : null;
  }

  async getCredentials(id: Id): Promise<UserCredentials | null> {
    const row = await this.sql.get('SELECT id, pin_hash, pin_salt, is_active FROM users WHERE id = ? AND deleted_at IS NULL', [id]);
    if (!row) return null;
    return { id: toStr(row.id), pinHash: toStr(row.pin_hash), pinSalt: toStr(row.pin_salt), isActive: toBool(row.is_active) };
  }

  async recordLogin(id: Id, at: string): Promise<void> {
    const user = await this.getById(id);
    await this.sql.transaction([
      { sql: 'UPDATE users SET last_login_at = ? WHERE id = ?', params: [at, id] },
      auditStatement(user ? { id, name: user.name.en } : null, 'user.login', 'user', id, {}, at),
    ]);
  }

  async create(input: UserInput & { pinHash: string; pinSalt: string }, actor: Actor): Promise<User> {
    const id = input.id ?? newId();
    const now = new Date().toISOString();
    try {
      await this.sql.transaction([
        {
          sql: `INSERT INTO users (id, username, name_bn, name_en, role_id, pin_hash, pin_salt, phone, email, default_counter_id, avatar_color, preferences, is_active,
                  created_at, updated_at, version, sync_status)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '{}', ?, ?, ?, 1, 'local')`,
          params: [id, input.username.trim().toLowerCase(), input.name.bn.trim(), input.name.en.trim(), input.roleId, input.pinHash, input.pinSalt, input.phone, input.email, input.defaultCounterId, input.avatarColor, bool(input.isActive), now, now],
        },
        auditStatement(actor, 'user.created', 'user', id, { username: input.username, role: input.roleId }, now),
      ]);
    } catch (error) {
      if (error instanceof SqlError && error.code === 'constraint_unique') throw new AppError('duplicateUsername');
      throw new AppError('saveFailed', {}, error);
    }
    const user = await this.getById(id);
    if (!user) throw new AppError('saveFailed');
    return user;
  }

  async update(id: Id, input: UserInput, actor: Actor): Promise<User> {
    const now = new Date().toISOString();
    try {
      await this.sql.transaction([
        {
          sql: `UPDATE users SET username = ?, name_bn = ?, name_en = ?, role_id = ?, phone = ?, email = ?, default_counter_id = ?, avatar_color = ?, is_active = ?,
                  updated_at = ?, version = version + 1 WHERE id = ?`,
          params: [input.username.trim().toLowerCase(), input.name.bn.trim(), input.name.en.trim(), input.roleId, input.phone, input.email, input.defaultCounterId, input.avatarColor, bool(input.isActive), now, id],
        },
        auditStatement(actor, 'user.updated', 'user', id, { username: input.username, role: input.roleId, active: input.isActive }, now),
      ]);
    } catch (error) {
      if (error instanceof SqlError && error.code === 'constraint_unique') throw new AppError('duplicateUsername');
      throw new AppError('saveFailed', {}, error);
    }
    const user = await this.getById(id);
    if (!user) throw new AppError('saveFailed');
    return user;
  }

  async setPin(id: Id, pinHash: string, pinSalt: string): Promise<void> {
    await this.sql.run('UPDATE users SET pin_hash = ?, pin_salt = ?, updated_at = ?, version = version + 1 WHERE id = ?', [pinHash, pinSalt, new Date().toISOString(), id]);
  }

  async savePreferences(id: Id, preferences: UserPreferences): Promise<void> {
    await this.sql.run('UPDATE users SET preferences = ?, updated_at = ? WHERE id = ?', [JSON.stringify(preferences), new Date().toISOString(), id]);
  }

  async roles(): Promise<Role[]> {
    const rows = await this.sql.all('SELECT * FROM roles');
    return rows
      .map((row) => ({ id: toStr(row.id) as RoleId, name: { bn: toStr(row.name_bn), en: toStr(row.name_en) }, isSystem: toBool(row.is_system) }))
      .sort((a, b) => ROLE_ORDER.indexOf(a.id) - ROLE_ORDER.indexOf(b.id));
  }

  async rolePermissions(): Promise<Record<RoleId, Permission[]>> {
    const rows = await this.sql.all('SELECT role_id, permission_id FROM role_permissions');
    const result: Record<RoleId, Permission[]> = { admin: [], manager: [], cashier: [] };
    for (const row of rows) {
      const roleId = toStr(row.role_id) as RoleId;
      const permission = toStr(row.permission_id);
      if (result[roleId] && isPermission(permission)) result[roleId].push(permission);
    }
    return result;
  }

  async setRolePermissions(roleId: RoleId, permissions: Permission[], actor: Actor): Promise<void> {
    const now = new Date().toISOString();
    const known = new Set(Object.values(PERMISSION_GROUPS).flat());
    const valid = roleId === 'admin' ? [...known] : permissions.filter((permission) => known.has(permission));
    const statements: SqlStatement[] = [
      { sql: 'DELETE FROM role_permissions WHERE role_id = ?', params: [roleId] },
      ...valid.map((permission) => ({ sql: 'INSERT INTO role_permissions (role_id, permission_id) VALUES (?, ?)', params: [roleId, permission] })),
      auditStatement(actor, 'settings.changed', 'role', roleId, { permissions: valid.length }, now),
    ];
    await this.sql.transaction(statements);
  }
}
