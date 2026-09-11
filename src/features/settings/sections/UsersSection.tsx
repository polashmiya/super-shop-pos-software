import { useMemo, useState } from 'react';
import { RefreshCw, ShieldCheck, UserPlus, UsersRound } from 'lucide-react';
import { AVATAR_COLORS } from '@/config/theme.config';
import { useAsync } from '@/hooks/useAsync';
import { useLocalize, useT } from '@/i18n';
import { userService } from '@/services/userService';
import { useAuthStore } from '@/stores/authStore';
import { useShiftStore } from '@/stores/shiftStore';
import { confirmAction, toast } from '@/stores/uiStore';
import type { User } from '@/types';
import { Button } from '@/components/ui/Button';
import { Switch } from '@/components/ui/Controls';
import { EmptyState, ErrorState, SkeletonRows } from '@/components/ui/States';
import { PermissionMatrix } from '../components/PermissionMatrix';
import { PinResetModal } from '../components/PinResetModal';
import { Note, SettingBlock, SettingsCard } from '../components/SettingsCard';
import { StaffList } from '../components/StaffList';
import { UserFormModal } from '../components/UserFormModal';

/** Staff accounts (add, edit, reset PIN, deactivate) and the role permission matrix. */
export default function UsersSection() {
  const t = useT();
  const localize = useLocalize();
  const currentUserId = useAuthStore((state) => state.user?.id);
  const [showInactive, setShowInactive] = useState(false);
  const [editing, setEditing] = useState<User | 'new' | null>(null);
  const [pinFor, setPinFor] = useState<User | null>(null);
  const users = useAsync(() => userService.list(true), []);
  const matrix = useAsync(() => userService.rolePermissions(), []);

  const all = useMemo(() => users.data ?? [], [users.data]);
  const visible = useMemo(() => all.filter((user) => showInactive || user.isActive), [all, showInactive]);
  const inactiveCount = all.length - all.filter((user) => user.isActive).length;
  const suggestedColor = AVATAR_COLORS[all.length % AVATAR_COLORS.length];

  const afterChange = (saved?: User) => {
    users.reload();
    // The signed-in user's own name/colour in the top bar, and cashier names on counters.
    if (saved && saved.id === currentUserId) useAuthStore.setState({ user: saved });
    void useShiftStore
      .getState()
      .load()
      .catch((error: unknown) => console.error('Reloading counters failed', error));
  };

  const setActive = async (user: User, active: boolean) => {
    const name = localize(user.name);
    if (!active) {
      const ok = await confirmAction({
        title: t('settings.users.deactivateTitle', { name }),
        message: t('settings.users.deactivateMessage', { name }),
        confirmLabel: t('settings.users.deactivate'),
        tone: 'danger',
      });
      if (!ok) return;
    }
    try {
      const saved = await userService.setActive(user, active);
      toast.success({ key: active ? 'settings.users.activated' : 'settings.users.deactivated', params: { name } });
      afterChange(saved);
    } catch (error) {
      toast.fromError(error);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <SettingsCard
        icon={UsersRound}
        title={t('settings.users.staff')}
        description={t('settings.users.staffHint')}
        action={
          <Button variant="primary" icon={UserPlus} onClick={() => setEditing('new')}>
            {t('settings.users.add')}
          </Button>
        }
      >
        <SettingBlock anchor="staffAccounts" className="py-2">
          {users.error && !users.data ? (
            <ErrorState
              title={t('settings.ui.loadFailed')}
              action={
                <Button icon={RefreshCw} onClick={users.reload}>
                  {t('common.actions.retry')}
                </Button>
              }
            />
          ) : !users.data ? (
            <SkeletonRows rows={5} />
          ) : visible.length === 0 ? (
            <EmptyState compact icon={UsersRound} title={t('settings.users.empty')} />
          ) : (
            <StaffList users={visible} currentUserId={currentUserId} onEdit={setEditing} onResetPin={setPinFor} onSetActive={(user, active) => void setActive(user, active)} />
          )}
        </SettingBlock>
        {inactiveCount > 0 && (
          <div className="py-3">
            <Switch checked={showInactive} onChange={setShowInactive} label={t('settings.users.showInactive')} />
          </div>
        )}
      </SettingsCard>

      <SettingsCard icon={ShieldCheck} title={t('settings.users.matrix')} description={t('settings.users.matrixHint')}>
        <SettingBlock anchor="permissionMatrix" className="flex flex-col gap-3">
          <Note tone="neutral">{t('settings.users.adminLocked')}</Note>
          {matrix.error && !matrix.data ? (
            <ErrorState
              title={t('settings.ui.loadFailed')}
              action={
                <Button icon={RefreshCw} onClick={matrix.reload}>
                  {t('common.actions.retry')}
                </Button>
              }
            />
          ) : !matrix.data ? (
            <SkeletonRows rows={8} />
          ) : (
            <PermissionMatrix matrix={matrix.data} onChange={(roleId, permissions) => matrix.data && matrix.setData({ ...matrix.data, [roleId]: permissions })} />
          )}
        </SettingBlock>
      </SettingsCard>

      {editing !== null && (
        <UserFormModal
          user={editing === 'new' ? null : editing}
          suggestedColor={suggestedColor}
          onClose={() => setEditing(null)}
          onSaved={(saved) => {
            setEditing(null);
            afterChange(saved);
          }}
        />
      )}
      {pinFor && <PinResetModal user={pinFor} onClose={() => setPinFor(null)} />}
    </div>
  );
}
