import { useEffect, useState } from 'react';
import { RouterProvider } from 'react-router';
import { MonitorX } from 'lucide-react';
import { hasElectronAPI } from '@/platform/electron';
import { useT } from '@/i18n';
import { LogoMark } from '@/components/app/StoreLogo';
import { EmptyState, ErrorState } from '@/components/ui/States';
import { Button } from '@/components/ui/Button';
import { bootstrapApp } from './bootstrap';
import { router } from './router';

type Status = 'loading' | 'ready' | 'error' | 'no-desktop';

function Splash({ label }: { label: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-5 bg-bg" role="status" aria-live="polite">
      <LogoMark size={64} className="animate-pop-in" />
      <p className="text-sm text-fg-muted">{label}</p>
    </div>
  );
}

/** Application root: boots the local data source and settings, then routes. */
export function App() {
  const t = useT();
  const [status, setStatus] = useState<Status>(hasElectronAPI() ? 'loading' : 'no-desktop');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!hasElectronAPI()) return;
    let alive = true;
    bootstrapApp()
      .then(() => alive && setStatus('ready'))
      .catch((error: unknown) => {
        console.error('Start-up failed', error);
        if (alive) setStatus('error');
      });
    return () => {
      alive = false;
    };
  }, [attempt]);

  if (status === 'no-desktop') return <EmptyState icon={MonitorX} title={t('shell.desktopOnlyTitle')} description={t('shell.desktopOnlyMessage')} className="h-full" />;
  if (status === 'loading') return <Splash label={t('shell.starting')} />;
  if (status === 'error')
    return (
      <ErrorState
        className="h-full"
        title={t('errors.loadFailed')}
        action={
          <Button
            variant="primary"
            onClick={() => {
              setStatus('loading');
              setAttempt((value) => value + 1);
            }}
          >
            {t('common.actions.retry')}
          </Button>
        }
      />
    );
  return <RouterProvider router={router} />;
}
