import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { ShieldAlert } from 'lucide-react';
import type { Permission } from '@/config/permissions';
import { useT } from '@/i18n';
import { useAuthStore } from '@/stores/authStore';
import { EmptyState } from '@/components/ui/States';
import { landingPath } from './navigation';

/** Sends signed-out users to the login screen. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const user = useAuthStore((state) => state.user);
  const location = useLocation();
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return children;
}

function NoAccess() {
  const t = useT();
  return <EmptyState icon={ShieldAlert} title={t('errors.permissionDenied')} className="h-full" />;
}

/** Shows the page only when the user has the permission. */
export function Guard({ permission, children }: { permission: Permission | null; children: ReactNode }) {
  const allowed = useAuthStore((state) => permission === null || state.permissions.has(permission));
  return allowed ? children : <NoAccess />;
}

/** Redirects to the first screen the user may open. */
export function Landing() {
  const can = useAuthStore((state) => state.can);
  return <Navigate to={landingPath(can)} replace />;
}
