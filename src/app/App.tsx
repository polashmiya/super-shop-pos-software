import { useEffect, useState } from 'react';
import { RouterProvider } from 'react-router';
import { useT } from '@/i18n';
import { LogoMark } from '@/components/app/StoreLogo';
import { ErrorState } from '@/components/ui/States';
import { Button } from '@/components/ui/Button';
import { bootstrapApp } from './bootstrap';
import { router } from './router';

type Status = 'loading' | 'ready' | 'error';

function Splash({ label }: { label: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-5 bg-bg" role="status" aria-live="polite">
      <LogoMark size={64} className="animate-pop-in" />
      <p className="text-sm text-fg-muted">{label}</p>
    </div>
  );
}

/**
 * Application root: picks the platform bridge (Electron or browser), boots
 * the data source and settings, then routes.
 */
export function App() {
  const t = useT();
  const [status, setStatus] = useState<Status>('loading');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
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
