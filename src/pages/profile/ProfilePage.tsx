import { UserRound } from 'lucide-react';
import { useT } from '@/i18n';
import { useAuthStore } from '@/stores/authStore';
import { PageHeader } from '@/components/ui/Display';
import { ChangePinCard } from '@/features/profile/ChangePinCard';
import { MyActivityCard } from '@/features/profile/MyActivityCard';
import { ProfileIdentityCard } from '@/features/profile/ProfileIdentityCard';
import { ProfilePreferencesCard } from '@/features/profile/ProfilePreferencesCard';
import { ProfileShortcutsCard } from '@/features/profile/ProfileShortcutsCard';

/* ==========================================================================
   /profile — the signed-in staff member: who they are, their counter and
   shift, personal preferences (saved with the account), PIN change, today's
   activity and their keyboard shortcuts.
   ========================================================================== */

export default function ProfilePage() {
  const t = useT();
  const user = useAuthStore((state) => state.user);
  if (!user) return null;

  return (
    <div className="flex h-full flex-col">
      <PageHeader icon={UserRound} title={t('settings.profile.title')} description={t('settings.profile.subtitle')} />
      <div className="min-h-0 flex-1 overflow-y-auto p-6">
        <div className="mx-auto grid max-w-6xl grid-cols-1 gap-5 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          <div className="flex min-w-0 flex-col gap-5">
            <ProfileIdentityCard user={user} />
            <MyActivityCard userId={user.id} />
          </div>
          <div className="flex min-w-0 flex-col gap-5">
            <ProfilePreferencesCard />
            <ChangePinCard />
            <ProfileShortcutsCard />
          </div>
        </div>
      </div>
    </div>
  );
}
