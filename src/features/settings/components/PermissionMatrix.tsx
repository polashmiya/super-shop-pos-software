import { Fragment, useState } from 'react';
import { LoaderCircle, Lock } from 'lucide-react';
import { PERMISSION_GROUPS, ROLE_ORDER, type Permission, type PermissionGroup } from '@/config/permissions';
import { useT } from '@/i18n';
import { userService } from '@/services/userService';
import { useAuthStore } from '@/stores/authStore';
import { toast } from '@/stores/uiStore';
import type { RoleId } from '@/types';
import { Checkbox } from '@/components/ui/Controls';

const GROUPS = Object.keys(PERMISSION_GROUPS) as PermissionGroup[];

interface PermissionMatrixProps {
  matrix: Record<RoleId, Permission[]>;
  onChange: (roleId: RoleId, permissions: Permission[]) => void;
}

/** Roles × permissions. Admin always has everything; other roles save on every tick. */
export function PermissionMatrix({ matrix, onChange }: PermissionMatrixProps) {
  const t = useT();
  const [saving, setSaving] = useState<RoleId | null>(null);

  const toggle = async (roleId: RoleId, permission: Permission, allowed: boolean) => {
    const current = matrix[roleId] ?? [];
    const next = allowed ? [...current, permission] : current.filter((entry) => entry !== permission);
    setSaving(roleId);
    try {
      await userService.setRolePermissions(roleId, next);
      onChange(roleId, next);
      await useAuthStore.getState().refreshPermissions();
      toast.success({ key: 'settings.users.permissionsSaved', params: { role: t(`enums.role.${roleId}`) } });
    } catch (error) {
      toast.fromError(error);
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className="-mx-5 overflow-x-auto">
      <table className="w-full min-w-[34rem] border-collapse text-[0.9rem]">
        <thead className="sticky top-0 z-[1] bg-surface">
          <tr className="border-b border-border">
            <th scope="col" className="px-5 py-2.5 text-start type-label text-fg-muted">
              {t('settings.users.permission')}
            </th>
            {ROLE_ORDER.map((roleId) => (
              <th key={roleId} scope="col" className="w-28 px-3 py-2.5 text-center type-label text-fg-muted">
                <span className="inline-flex items-center gap-1.5">
                  {roleId === 'admin' && <Lock size={13} aria-hidden />}
                  {t(`enums.role.${roleId}`)}
                  {saving === roleId && <LoaderCircle size={13} aria-hidden className="animate-spin" />}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {GROUPS.map((group) => (
            <Fragment key={group}>
              <tr className="bg-surface-2">
                <th colSpan={ROLE_ORDER.length + 1} scope="colgroup" className="px-5 py-2 text-start type-caption font-semibold tracking-wide text-fg-subtle uppercase">
                  {t(`settings.users.permissionGroups.${group}`)}
                </th>
              </tr>
              {PERMISSION_GROUPS[group].map((permission) => {
                const label = t(`settings.users.permissions.${permission}`);
                return (
                  <tr key={permission} className="border-b border-border last:border-b-0 hover:bg-surface-2/60">
                    <th scope="row" className="px-5 py-1.5 text-start font-normal text-fg">
                      {label}
                    </th>
                    {ROLE_ORDER.map((roleId) => {
                      const locked = roleId === 'admin';
                      const checked = locked || (matrix[roleId] ?? []).includes(permission);
                      return (
                        <td key={roleId} className="px-3 py-1.5 text-center">
                          <span className="inline-flex min-h-touch items-center justify-center">
                            <Checkbox
                              checked={checked}
                              disabled={locked || saving !== null}
                              ariaLabel={t('settings.users.permissionFor', { role: t(`enums.role.${roleId}`), permission: label })}
                              onChange={(allowed) => void toggle(roleId, permission, allowed)}
                            />
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
