import { CircleCheck, CircleOff, EllipsisVertical, KeyRound, Pencil, UserCheck, UserX } from 'lucide-react';
import { useFormat } from '@/hooks/useFormat';
import { useLocalize, useT } from '@/i18n';
import type { User } from '@/types';
import { Avatar, Badge, StatusBadge } from '@/components/ui/Display';
import { IconButton } from '@/components/ui/IconButton';
import { DropdownMenu, type MenuItem } from '@/components/ui/Menu';

interface StaffListProps {
  users: User[];
  currentUserId: string | undefined;
  onEdit: (user: User) => void;
  onResetPin: (user: User) => void;
  onSetActive: (user: User, active: boolean) => void;
}

/** Staff accounts: avatar, name, username, role, status and last sign-in, with a row menu. */
export function StaffList({ users, currentUserId, onEdit, onResetPin, onSetActive }: StaffListProps) {
  const t = useT();
  const format = useFormat();
  const localize = useLocalize();

  return (
    <ul className="flex flex-col divide-y divide-border">
      {users.map((user) => {
        const name = localize(user.name);
        const isSelf = user.id === currentUserId;
        const items: Array<MenuItem | 'separator'> = [
          { key: 'edit', label: t('settings.users.edit'), icon: Pencil, onSelect: () => onEdit(user) },
          { key: 'pin', label: t('settings.users.resetPin'), icon: KeyRound, onSelect: () => onResetPin(user) },
        ];
        if (!isSelf) {
          items.push(
            'separator',
            user.isActive
              ? { key: 'deactivate', label: t('settings.users.deactivate'), icon: UserX, danger: true, onSelect: () => onSetActive(user, false) }
              : { key: 'activate', label: t('settings.users.activate'), icon: UserCheck, onSelect: () => onSetActive(user, true) },
          );
        }
        return (
          <li key={user.id} className="flex items-center gap-3 py-3">
            <Avatar name={user.name.en || user.name.bn} color={user.avatarColor} size={40} className={user.isActive ? undefined : 'opacity-50'} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" onClick={() => onEdit(user)} className="truncate rounded-sm text-start font-semibold text-fg hover:underline">
                  {name}
                </button>
                {isSelf && (
                  <Badge size="sm" tone="primary">
                    {t('settings.users.you')}
                  </Badge>
                )}
              </div>
              <p className="type-caption flex flex-wrap items-center gap-x-2 text-fg-subtle">
                <span className="font-mono">@{user.username}</span>
                <span aria-hidden>·</span>
                <span>{user.lastLoginAt ? t('settings.users.lastLogin', { time: format.relative(user.lastLoginAt) }) : t('settings.users.neverSignedIn')}</span>
              </p>
            </div>
            <div className="hidden shrink-0 items-center gap-2 sm:flex">
              <Badge tone={user.roleId === 'admin' ? 'primary' : user.roleId === 'manager' ? 'info' : 'neutral'}>{t(`enums.role.${user.roleId}`)}</Badge>
              {user.isActive ? (
                <StatusBadge tone="success" icon={CircleCheck} label={t('settings.users.active')} />
              ) : (
                <StatusBadge tone="neutral" icon={CircleOff} label={t('settings.users.inactive')} />
              )}
            </div>
            <DropdownMenu
              items={items}
              width={220}
              trigger={(props) => <IconButton {...props} icon={EllipsisVertical} label={t('settings.users.actionsFor', { name })} tooltipSide="left" />}
            />
          </li>
        );
      })}
    </ul>
  );
}
