import { APP_CONFIG } from '@/config/app.config';
import type { Permission } from '@/config/permissions';
import { AppError } from '@/domain/errors';
import { validatePin } from '@/domain/validation';
import { repos } from '@/repositories';
import type { Id, RoleId, User } from '@/types';

/* ==========================================================================
   Authentication behind an interface: LocalAuthService verifies PINs
   against the local database today; an ApiAuthService can replace it when
   a backend exists (same interface, no UI changes).
   ========================================================================== */

export interface AuthResult {
  user: User;
  permissions: Permission[];
}

export interface AuthService {
  listUsers(): Promise<User[]>;
  login(userId: Id, pin: string): Promise<AuthResult>;
  verifyPin(userId: Id, pin: string): Promise<boolean>;
  /** Manager/admin approval: returns the approver when the PIN matches a user with the permission. */
  approve(pin: string, permission: Permission): Promise<User | null>;
  changePin(userId: Id, currentPin: string, nextPin: string): Promise<void>;
  permissionsFor(roleId: RoleId): Promise<Permission[]>;
  hashPin(pin: string, salt: string): Promise<string>;
}

async function sha256Hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function randomSalt(): string {
  const bytes = new Uint8Array(8);
  globalThis.crypto.getRandomValues(bytes);
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Brute-force protection: a short lockout after repeated wrong PINs. */
const failures = new Map<Id, { count: number; until: number }>();

function checkLockout(userId: Id): void {
  const entry = failures.get(userId);
  if (entry && entry.until > Date.now()) {
    throw new AppError('lockedOut', { seconds: Math.ceil((entry.until - Date.now()) / 1000) });
  }
}

function recordFailure(userId: Id): number {
  const entry = failures.get(userId) ?? { count: 0, until: 0 };
  entry.count += 1;
  if (entry.count >= APP_CONFIG.auth.maxFailedAttempts) {
    entry.until = Date.now() + APP_CONFIG.auth.lockoutSeconds * 1000;
    entry.count = 0;
  }
  failures.set(userId, entry);
  return APP_CONFIG.auth.maxFailedAttempts - entry.count;
}

export class LocalAuthService implements AuthService {
  hashPin(pin: string, salt: string): Promise<string> {
    return sha256Hex(`${salt}:${pin}`);
  }

  listUsers(): Promise<User[]> {
    return repos().users.list(false);
  }

  async verifyPin(userId: Id, pin: string): Promise<boolean> {
    const credentials = await repos().users.getCredentials(userId);
    if (!credentials || !credentials.isActive) return false;
    return (await this.hashPin(pin, credentials.pinSalt)) === credentials.pinHash;
  }

  async permissionsFor(roleId: RoleId): Promise<Permission[]> {
    const matrix = await repos().users.rolePermissions();
    return matrix[roleId] ?? [];
  }

  async login(userId: Id, pin: string): Promise<AuthResult> {
    checkLockout(userId);
    const user = await repos().users.getById(userId);
    if (!user) throw new AppError('loginFailed');
    if (!user.isActive) throw new AppError('userInactive');
    if (!(await this.verifyPin(userId, pin))) {
      const left = recordFailure(userId);
      checkLockout(userId);
      throw new AppError('loginFailed', { left });
    }
    failures.delete(userId);
    const now = new Date().toISOString();
    await repos().users.recordLogin(userId, now);
    return { user: { ...user, lastLoginAt: now }, permissions: await this.permissionsFor(user.roleId) };
  }

  async approve(pin: string, permission: Permission): Promise<User | null> {
    const users = await repos().users.list(false);
    const matrix = await repos().users.rolePermissions();
    for (const user of users) {
      if (!(matrix[user.roleId] ?? []).includes(permission)) continue;
      if (await this.verifyPin(user.id, pin)) return user;
    }
    return null;
  }

  async changePin(userId: Id, currentPin: string, nextPin: string): Promise<void> {
    if (validatePin(nextPin, APP_CONFIG.auth.pinMinLength, APP_CONFIG.auth.pinMaxLength)) throw new AppError('validation');
    if (!(await this.verifyPin(userId, currentPin))) throw new AppError('loginFailed');
    const salt = randomSalt();
    await repos().users.setPin(userId, await this.hashPin(nextPin, salt), salt);
  }

  /** Creates hash + salt for a new PIN (user management). */
  async createPinHash(pin: string): Promise<{ pinHash: string; pinSalt: string }> {
    const salt = randomSalt();
    return { pinHash: await this.hashPin(pin, salt), pinSalt: salt };
  }
}

export const authService = new LocalAuthService();
