import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { ArrowLeft, Languages, LogIn, ShieldCheck, WifiOff } from 'lucide-react';
import { APP_CONFIG } from '@/config/app.config';
import { landingPath } from '@/app/navigation';
import { loadWorkspace } from '@/app/bootstrap';
import { DEMO_USERS } from '@/data/seed/demoUsers';
import { applyUserPreferences } from '@/features/profile/userPreferences';
import { isAppError } from '@/domain/errors';
import { useAsync } from '@/hooks/useAsync';
import { useFormat } from '@/hooks/useFormat';
import { useLanguage, useT } from '@/i18n';
import { authService } from '@/services/authService';
import { useAuthStore } from '@/stores/authStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { toast } from '@/stores/uiStore';
import type { User } from '@/types';
import { Button } from '@/components/ui/Button';
import { cn } from '@/components/ui/cn';
import { Avatar } from '@/components/ui/Display';
import { NumericKeypad } from '@/components/ui/NumericKeypad';
import { applyKeypadKey } from '@/components/ui/keypad';
import { LoadingState } from '@/components/ui/States';
import { StoreLogo } from '@/components/app/StoreLogo';

export default function LoginPage() {
  const t = useT();
  const language = useLanguage();
  const format = useFormat();
  const navigate = useNavigate();
  const login = useAuthStore((state) => state.login);
  const store = useSettingsStore((state) => state.business.store);
  const session = useSettingsStore((state) => state.session);
  const updateSession = useSettingsStore((state) => state.updateSession);
  const updateDevice = useSettingsStore((state) => state.updateDevice);
  const users = useAsync(() => authService.listUsers(), []);
  const [selected, setSelected] = useState<User | null>(null);
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const lastUser = useMemo(() => users.data?.find((user) => user.id === session.lastUserId) ?? null, [users.data, session.lastUserId]);
  const current = selected ?? lastUser;
  const demoPin = (user: User) => (session.demoMode ? DEMO_USERS.find((entry) => entry.id === user.id)?.pin : undefined);

  const submit = async (value: string) => {
    if (!current || value.length < APP_CONFIG.auth.pinMinLength) return;
    setBusy(true);
    setError(null);
    try {
      const user = await login(current.id, value);
      await updateSession({ lastUserId: user.id });
      applyUserPreferences(user.preferences);
      await loadWorkspace();
      const { can } = useAuthStore.getState();
      navigate(useSettingsStore.getState().session.firstRunCompleted ? landingPath(can) : '/welcome', { replace: true });
    } catch (reason) {
      setPin('');
      if (isAppError(reason)) setError(reason.code === 'lockedOut' ? t('errors.lockedOut', reason.params) : t(`errors.${reason.code}`));
      else toast.fromError(reason);
    } finally {
      setBusy(false);
    }
  };

  // Keep keyboard focus on the hidden PIN field so typing + Enter always works.
  useEffect(() => {
    if (!current) return;
    const timer = setTimeout(() => document.querySelector<HTMLInputElement>('input[data-pin-input]')?.focus(), 0);
    return () => clearTimeout(timer);
  }, [current]);

  if (users.loading && !users.data) return <LoadingState label={t('common.states.loading')} className="h-full" />;

  return (
    <div className="grid h-full grid-cols-1 bg-bg lg:grid-cols-[1.05fr_1fr]">
      {/* Brand panel */}
      <section className="relative hidden flex-col justify-between overflow-hidden border-e border-border bg-bg-subtle p-10 lg:flex">
        <div className="flex items-center gap-3">
          <StoreLogo size={48} />
          <div>
            <p className="text-xl font-bold text-fg">{language === 'bn' ? store.nameBn : store.nameEn}</p>
            <p className="text-sm text-fg-subtle">{language === 'bn' ? store.addressBn : store.addressEn}</p>
          </div>
        </div>
        <div className="max-w-md">
          <p className="type-display text-fg">Super Shop POS</p>
          <p className="mt-3 text-lg text-fg-muted">{t('auth.subtitle')}</p>
          <div className="mt-8 flex flex-col gap-3 text-fg-muted">
            <span className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-soft text-primary-soft-fg">
                <WifiOff size={18} aria-hidden />
              </span>
              {t('auth.offlineBadge')}
            </span>
            <span className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-soft text-primary-soft-fg">
                <ShieldCheck size={18} aria-hidden />
              </span>
              {t('onboarding.offline')}
            </span>
          </div>
        </div>
        <p className="text-xs text-fg-subtle">v{APP_CONFIG.version}</p>
        <div aria-hidden className="pointer-events-none absolute -end-24 -bottom-24 h-80 w-80 rounded-full bg-primary opacity-[0.08] blur-3xl" />
      </section>

      {/* Sign-in panel */}
      <section className="flex min-h-0 flex-col overflow-y-auto">
        <div className="flex justify-end p-4">
          <Button variant="ghost" icon={Languages} onClick={() => updateDevice({ locale: { language: language === 'bn' ? 'en' : 'bn' } })}>
            {language === 'bn' ? 'English' : 'বাংলা'}
          </Button>
        </div>
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6 px-6 pb-10">
          {!current ? (
            <>
              <div>
                <h1 className="type-h1 text-fg">{t('auth.title')}</h1>
                <p className="type-body mt-1 text-fg-muted">{t('auth.selectUser')}</p>
              </div>
              <ul className="grid grid-cols-2 gap-3">
                {(users.data ?? []).map((user) => (
                  <li key={user.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setSelected(user);
                        setPin('');
                        setError(null);
                      }}
                      className="flex w-full flex-col items-center gap-2 rounded-xl border border-border bg-surface p-4 transition-base hover:border-primary hover:bg-primary-soft/30"
                    >
                      <Avatar name={user.name.en} color={user.avatarColor} size={52} />
                      <span className="text-center font-semibold text-fg">{language === 'bn' ? user.name.bn : user.name.en}</span>
                      <span className="type-caption text-fg-subtle">{t(`enums.role.${user.roleId}`)}</span>
                      {demoPin(user) && <span className="rounded-full bg-surface-3 px-2 py-0.5 font-mono text-[0.68rem] text-fg-muted">{t('auth.demoHint', { pin: demoPin(user) ?? '' })}</span>}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void submit(pin);
              }}
              className="flex flex-col items-center gap-5"
            >
              <button
                type="button"
                onClick={() => {
                  setSelected(null);
                  setPin('');
                  void updateSession({ lastUserId: null });
                }}
                className="flex items-center gap-1.5 self-start rounded-md text-sm text-fg-muted hover:text-fg"
              >
                <ArrowLeft size={16} aria-hidden />
                {t('auth.changeUser')}
              </button>
              <Avatar name={current.name.en} color={current.avatarColor} size={72} />
              <div className="text-center">
                <p className="type-h2 text-fg">{language === 'bn' ? current.name.bn : current.name.en}</p>
                <p className="type-body-sm text-fg-subtle">
                  {t(`enums.role.${current.roleId}`)}
                  {current.lastLoginAt ? ` · ${t('auth.lastLogin', { time: format.relative(current.lastLoginAt) })}` : ''}
                </p>
              </div>
              <p className="type-body text-fg-muted">{t('auth.enterPin', { name: language === 'bn' ? current.name.bn : current.name.en })}</p>
              <div className="flex gap-3" aria-hidden>
                {Array.from({ length: Math.max(APP_CONFIG.auth.pinMinLength, pin.length) }, (_, index) => (
                  <span key={index} className={cn('h-4 w-4 rounded-full border-2 transition-base', index < pin.length ? 'border-primary bg-primary' : 'border-border-strong', error && 'border-danger')} />
                ))}
              </div>
              <input
                type="password"
                inputMode="numeric"
                autoFocus
                data-pin-input
                aria-label={t('auth.pinLabel')}
                value={pin}
                maxLength={APP_CONFIG.auth.pinMaxLength}
                onChange={(event) => {
                  setError(null);
                  setPin(event.target.value.replace(/\D/g, '').slice(0, APP_CONFIG.auth.pinMaxLength));
                }}
                className="sr-only"
              />
              {error && (
                <p role="alert" className="type-body-sm -mt-1 text-danger-text">
                  {error}
                </p>
              )}
              <NumericKeypad className="w-full max-w-xs" size="lg" allowDecimal={false} backLabel={t('common.actions.remove')} onKey={(key) => setPin((value) => applyKeypadKey(value, key, 0, APP_CONFIG.auth.pinMaxLength))} />
              <Button type="submit" variant="primary" size="lg" icon={LogIn} loading={busy} disabled={pin.length < APP_CONFIG.auth.pinMinLength} className="w-full max-w-xs">
                {busy ? t('auth.signingIn') : t('auth.signIn')}
              </Button>
              {demoPin(current) && <p className="type-caption text-fg-subtle">{t('auth.demoHint', { pin: demoPin(current) ?? '' })}</p>}
            </form>
          )}
        </div>
      </section>
    </div>
  );
}
