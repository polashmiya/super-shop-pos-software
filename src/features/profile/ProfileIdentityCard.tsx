import { useNavigate } from 'react-router';
import { Lock, LogOut } from 'lucide-react';
import { useFormat } from '@/hooks/useFormat';
import { useLanguage, useLocalize, useT } from '@/i18n';
import { useAuthStore } from '@/stores/authStore';
import { useShiftStore } from '@/stores/shiftStore';
import type { User } from '@/types';
import { Button } from '@/components/ui/Button';
import { Avatar, Badge, Card, DefinitionList } from '@/components/ui/Display';

/** Who is signed in: name in both languages, role, counter, contact, last sign-in; lock and sign out. */
export function ProfileIdentityCard({ user }: { user: User }) {
  const t = useT();
  const format = useFormat();
  const language = useLanguage();
  const localize = useLocalize();
  const navigate = useNavigate();
  const counter = useShiftStore((state) => state.counter);
  const shift = useShiftStore((state) => state.shift);
  const lock = useAuthStore((state) => state.lock);
  const logout = useAuthStore((state) => state.logout);
  const otherName = language === 'bn' ? user.name.en : user.name.bn;

  return (
    <Card className="flex flex-col gap-5">
      <div className="flex items-center gap-4">
        <Avatar name={user.name.en || user.name.bn} color={user.avatarColor} size={72} />
        <div className="min-w-0 flex-1">
          <h2 className="type-h2 truncate text-fg">{localize(user.name)}</h2>
          {otherName && otherName !== localize(user.name) && (
            <p lang={language === 'bn' ? 'en' : 'bn'} className="type-body-sm truncate text-fg-muted">
              {otherName}
            </p>
          )}
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <Badge tone={user.roleId === 'admin' ? 'primary' : user.roleId === 'manager' ? 'info' : 'neutral'}>{t(`enums.role.${user.roleId}`)}</Badge>
            <span className="type-caption font-mono text-fg-subtle">@{user.username}</span>
          </div>
        </div>
      </div>

      <DefinitionList
        columns={2}
        items={[
          { label: t('common.labels.counter'), value: counter ? `${counter.code} · ${localize(counter.name)}` : t('settings.profile.noCounter') },
          { label: t('common.labels.shift'), value: shift ? <span className="font-mono">{shift.shiftNo}</span> : t('settings.profile.noShift') },
          { label: t('common.labels.phone'), value: user.phone ? <span className="tnum">{format.digits(user.phone)}</span> : '—' },
          { label: t('common.labels.email'), value: user.email ? <span title={user.email}>{user.email}</span> : '—' },
          { label: t('settings.profile.lastLogin'), value: user.lastLoginAt ? format.dateTime(user.lastLoginAt) : t('settings.users.neverSignedIn') },
          { label: t('settings.profile.memberSince'), value: format.date(user.createdAt) },
        ]}
      />

      <div className="flex flex-wrap gap-2 border-t border-border pt-4">
        <Button icon={Lock} onClick={lock}>
          {t('settings.profile.lock')}
        </Button>
        <Button variant="ghost" icon={LogOut} className="text-danger-text" onClick={() => void logout().then(() => navigate('/login'))}>
          {t('settings.profile.signOut')}
        </Button>
      </div>
    </Card>
  );
}
