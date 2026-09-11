import { APP_CONFIG } from '@/config/app.config';
import { PERMISSION_GROUPS, type Permission } from '@/config/permissions';
import { AppError } from '@/domain/errors';
import { required, validateEmail, validatePhone, validatePin, type ValidationKey } from '@/domain/validation';
import { toAsciiDigits } from '@/domain/text';
import { repos } from '@/repositories';
import type { Id, Role, RoleId, User, UserInput, UserPreferences } from '@/types';
import { authService } from './authService';
import { actor, ctx, requirePermission } from './context';

/* ==========================================================================
   Staff accounts, PINs and the role permission matrix. Every change needs
   `users.manage` (except a user's own PIN and preferences) and is written
   to the activity log. At least one active administrator always remains.
   ========================================================================== */

export const USERNAME_PATTERN = /^[a-z0-9._-]{3,32}$/;

export type UserField = 'nameBn' | 'nameEn' | 'username' | 'phone' | 'email' | 'pin' | 'pinConfirm';
export type UserFormErrors = Partial<Record<UserField, ValidationKey | 'usernameFormat' | 'pinMismatch'>>;

/** Allowed PIN length for new/changed PINs: the shop's minimum (Settings → Security) up to the app maximum. */
export function pinBounds(): { min: number; max: number } {
  const configured = Math.trunc(ctx().business().security.pinLength) || APP_CONFIG.auth.pinMinLength;
  const min = Math.min(Math.max(configured, APP_CONFIG.auth.pinMinLength), APP_CONFIG.auth.pinMaxLength);
  return { min, max: APP_CONFIG.auth.pinMaxLength };
}

export function normalizeUsername(value: string): string {
  return value.trim().toLowerCase();
}

/** Validates a user form; `pin` is checked when given (always for new users). */
export function validateUserForm(input: UserInput, options: { requirePin: boolean; pinConfirm?: string }): UserFormErrors {
  const errors: UserFormErrors = {};
  const nameBn = required(input.name.bn);
  const nameEn = required(input.name.en);
  if (nameBn) errors.nameBn = nameBn;
  if (nameEn) errors.nameEn = nameEn;
  const username = normalizeUsername(input.username);
  if (!username) errors.username = 'required';
  else if (!USERNAME_PATTERN.test(username)) errors.username = 'usernameFormat';
  const phone = validatePhone(input.phone, false);
  if (phone) errors.phone = phone;
  const email = validateEmail(input.email);
  if (email) errors.email = email;
  if (options.requirePin || input.pin) {
    const { min, max } = pinBounds();
    const pin = toAsciiDigits(input.pin ?? '');
    if (!pin) errors.pin = 'required';
    else if (validatePin(pin, min, max)) errors.pin = 'invalidPin';
    else if (options.pinConfirm !== undefined && toAsciiDigits(options.pinConfirm) !== pin) errors.pinConfirm = 'pinMismatch';
  }
  return errors;
}

function clean(input: UserInput): UserInput {
  return {
    ...input,
    username: normalizeUsername(input.username),
    name: { bn: input.name.bn.trim(), en: input.name.en.trim() },
    phone: toAsciiDigits(input.phone.trim()),
    email: input.email.trim(),
  };
}

/** Throws `lastAdmin` when the change would leave the shop without an active administrator. */
async function ensureAdminRemains(id: Id, next: Pick<UserInput, 'roleId' | 'isActive'>): Promise<void> {
  const current = await repos().users.getById(id);
  if (!current || current.roleId !== 'admin' || !current.isActive) return;
  if (next.roleId === 'admin' && next.isActive) return;
  const others = (await repos().users.list(false)).filter((user) => user.id !== id && user.roleId === 'admin' && user.isActive);
  if (others.length === 0) throw new AppError('lastAdmin');
}

export function toUserInput(user: User): UserInput {
  return {
    id: user.id,
    username: user.username,
    name: { ...user.name },
    roleId: user.roleId,
    phone: user.phone,
    email: user.email,
    defaultCounterId: user.defaultCounterId,
    avatarColor: user.avatarColor,
    isActive: user.isActive,
  };
}

export const userService = {
  list(includeInactive = true): Promise<User[]> {
    requirePermission('users.manage');
    return repos().users.list(includeInactive);
  },

  roles(): Promise<Role[]> {
    return repos().users.roles();
  },

  rolePermissions(): Promise<Record<RoleId, Permission[]>> {
    requirePermission('users.manage');
    return repos().users.rolePermissions();
  },

  async create(input: UserInput & { pin: string }): Promise<User> {
    requirePermission('users.manage');
    const data = clean(input);
    if (Object.keys(validateUserForm({ ...data, pin: input.pin }, { requirePin: true })).length > 0) throw new AppError('validation');
    const { pinHash, pinSalt } = await authService.createPinHash(toAsciiDigits(input.pin));
    const { pin: _pin, ...rest } = data;
    return repos().users.create({ ...rest, pinHash, pinSalt }, actor());
  },

  async update(id: Id, input: UserInput): Promise<User> {
    requirePermission('users.manage');
    const { pin: _pin, ...data } = clean(input);
    if (Object.keys(validateUserForm(data, { requirePin: false })).length > 0) throw new AppError('validation');
    // Nobody can switch off their own account while signed in with it.
    if (id === ctx().user()?.id && !data.isActive) throw new AppError('permissionDenied');
    await ensureAdminRemains(id, data);
    return repos().users.update(id, data, actor());
  },

  setActive(user: User, active: boolean): Promise<User> {
    return this.update(user.id, { ...toUserInput(user), isActive: active });
  },

  /** Sets a new PIN for a staff member (they did not remember it). */
  async resetPin(id: Id, pin: string): Promise<void> {
    requirePermission('users.manage');
    const { min, max } = pinBounds();
    const digits = toAsciiDigits(pin);
    if (validatePin(digits, min, max)) throw new AppError('validation');
    const { pinHash, pinSalt } = await authService.createPinHash(digits);
    await repos().users.setPin(id, pinHash, pinSalt);
    await repos().audit.log({ action: 'user.updated', entity: 'user', entityId: id, details: { pinReset: true } }, actor());
  },

  /** The signed-in user changes their own PIN (current PIN required). */
  async changeOwnPin(currentPin: string, nextPin: string): Promise<void> {
    const user = ctx().user();
    if (!user) throw new AppError('permissionDenied');
    const { min, max } = pinBounds();
    const next = toAsciiDigits(nextPin);
    if (validatePin(next, min, max)) throw new AppError('validation');
    await authService.changePin(user.id, toAsciiDigits(currentPin), next);
    await repos()
      .audit.log({ action: 'user.updated', entity: 'user', entityId: user.id, details: { pinChanged: true } }, actor())
      .catch((error: unknown) => console.error('Writing the activity log failed', error));
  },

  /** Saves the signed-in user's personal preferences (language, theme…). */
  async savePreferences(preferences: UserPreferences): Promise<UserPreferences> {
    const user = ctx().user();
    if (!user) throw new AppError('permissionDenied');
    const next = { ...user.preferences, ...preferences };
    await repos().users.savePreferences(user.id, next);
    return next;
  },

  /** Replaces a role's permissions. The admin role always keeps every permission. */
  async setRolePermissions(roleId: RoleId, permissions: Permission[]): Promise<void> {
    requirePermission('users.manage');
    if (roleId === 'admin') throw new AppError('permissionDenied');
    const known = new Set<Permission>(Object.values(PERMISSION_GROUPS).flat());
    await repos().users.setRolePermissions(roleId, [...new Set(permissions)].filter((permission) => known.has(permission)), actor());
  },
};
