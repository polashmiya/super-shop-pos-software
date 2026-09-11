import { create } from 'zustand';
import type { Permission } from '@/config/permissions';
import { repos } from '@/repositories';
import { authService } from '@/services/authService';
import type { User } from '@/types';

/* Signed-in user, permissions and the lock screen. */

interface AuthState {
  user: User | null;
  permissions: ReadonlySet<Permission>;
  locked: boolean;
  login(userId: string, pin: string): Promise<User>;
  logout(): Promise<void>;
  lock(): void;
  unlock(pin: string): Promise<boolean>;
  refreshPermissions(): Promise<void>;
  can(permission: Permission): boolean;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  permissions: new Set(),
  locked: false,

  async login(userId, pin) {
    const result = await authService.login(userId, pin);
    set({ user: result.user, permissions: new Set(result.permissions), locked: false });
    return result.user;
  },

  async logout() {
    const user = get().user;
    if (user) {
      await repos()
        .audit.log({ action: 'user.logout', entity: 'user', entityId: user.id, details: {} }, { id: user.id, name: user.name.en })
        .catch(() => undefined);
    }
    set({ user: null, permissions: new Set(), locked: false });
  },

  lock() {
    if (get().user) set({ locked: true });
  },

  async unlock(pin) {
    const user = get().user;
    if (!user) return false;
    const ok = await authService.verifyPin(user.id, pin);
    if (ok) set({ locked: false });
    return ok;
  },

  async refreshPermissions() {
    const user = get().user;
    if (!user) return;
    set({ permissions: new Set(await authService.permissionsFor(user.roleId)) });
  },

  can(permission) {
    return get().permissions.has(permission);
  },
}));

/** Reactive permission check for components. */
export function useCan(permission: Permission): boolean {
  return useAuthStore((state) => state.permissions.has(permission));
}
