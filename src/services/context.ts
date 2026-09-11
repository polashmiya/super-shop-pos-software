import type { Permission } from '@/config/permissions';
import { AppError } from '@/domain/errors';
import type { Actor } from '@/repositories/types';
import type { BusinessSettings, DeviceSettings, Language, User } from '@/types';

/* ==========================================================================
   Service context: who is working, where, and with which settings.
   Services read it instead of importing UI stores, so they stay testable
   and independent from React. Bootstrap wires it to the Zustand stores.
   ========================================================================== */

export interface ServiceContext {
  user(): User | null;
  can(permission: Permission): boolean;
  business(): BusinessSettings;
  device(): DeviceSettings;
  language(): Language;
  now(): Date;
}

let current: ServiceContext | null = null;

export function setServiceContext(context: ServiceContext): void {
  current = context;
}

export function ctx(): ServiceContext {
  if (!current) throw new AppError('loadFailed');
  return current;
}

/** The signed-in user as an audit actor. */
export function actor(): Actor {
  const user = ctx().user();
  if (!user) throw new AppError('permissionDenied');
  return { id: user.id, name: user.name.en };
}

export function requirePermission(permission: Permission): void {
  if (!ctx().can(permission)) throw new AppError('permissionDenied');
}

export function terminal(): { branchId: string; counterId: string } {
  return ctx().device().terminal;
}
