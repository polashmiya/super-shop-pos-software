import { useEffect, useRef, useState } from 'react';
import { ShieldCheck, TriangleAlert } from 'lucide-react';
import { APP_CONFIG } from '@/config/app.config';
import { useT } from '@/i18n';
import { authService } from '@/services/authService';
import { useUiStore } from '@/stores/uiStore';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { NumericKeypad } from '@/components/ui/NumericKeypad';
import { applyKeypadKey } from '@/components/ui/keypad';

/** Renders the promise-based confirmation dialog (confirmAction). */
export function ConfirmHost() {
  const t = useT();
  const request = useUiStore((state) => state.confirm);
  const [typed, setTyped] = useState('');
  const confirmRef = useRef<HTMLButtonElement | null>(null);

  const close = (ok: boolean) => {
    request?.resolve(ok);
    useUiStore.setState({ confirm: null });
    setTyped('');
  };

  if (!request) return null;
  const blocked = Boolean(request.typeToConfirm) && typed.trim().toLowerCase() !== request.typeToConfirm?.toLowerCase();
  const danger = request.tone !== 'primary';

  return (
    <Modal
      open
      onClose={() => close(false)}
      size="sm"
      title={request.title}
      closeLabel={t('common.actions.close')}
      initialFocus={request.typeToConfirm ? undefined : confirmRef}
      icon={
        <span className={danger ? 'flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-danger-soft text-danger-text' : 'flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary-soft-fg'}>
          <TriangleAlert size={20} aria-hidden />
        </span>
      }
      footer={
        <>
          <Button onClick={() => close(false)}>{request.cancelLabel ?? t('common.actions.cancel')}</Button>
          <Button ref={confirmRef} variant={danger ? 'danger' : 'primary'} disabled={blocked} onClick={() => close(true)}>
            {request.confirmLabel ?? t('common.actions.confirm')}
          </Button>
        </>
      }
    >
      {request.message && <p className="type-body text-fg-muted">{request.message}</p>}
      {request.typeToConfirm && (
        <div className="mt-4 flex flex-col gap-2">
          <label className="type-label text-fg-muted" htmlFor="type-to-confirm">
            {t('common.confirm.typeToConfirm', { word: request.typeToConfirm })}
          </label>
          <Input id="type-to-confirm" data-autofocus value={typed} onChange={(event) => setTyped(event.target.value)} autoComplete="off" />
        </div>
      )}
    </Modal>
  );
}

/** Manager approval: a manager/admin enters their PIN (requestApproval). */
export function ApprovalHost() {
  const t = useT();
  const request = useUiStore((state) => state.approval);
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!request) return;
    const reset = setTimeout(() => {
      setPin('');
      setError(false);
    }, 0);
    return () => clearTimeout(reset);
  }, [request]);

  if (!request) return null;

  const finish = (user: Awaited<ReturnType<typeof authService.approve>>) => {
    request.resolve(user);
    useUiStore.setState({ approval: null });
  };

  const submit = async () => {
    if (pin.length < APP_CONFIG.auth.pinMinLength) return;
    setBusy(true);
    try {
      const approver = await authService.approve(pin, request.permission);
      if (approver) finish(approver);
      else {
        setError(true);
        setPin('');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={() => finish(null)}
      size="sm"
      title={t('auth.approvalTitle')}
      description={t('auth.approvalHint', { action: request.action })}
      closeLabel={t('common.actions.close')}
      icon={
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary-soft-fg">
          <ShieldCheck size={20} aria-hidden />
        </span>
      }
      footer={
        <>
          <Button onClick={() => finish(null)}>{t('common.actions.cancel')}</Button>
          <Button variant="primary" loading={busy} disabled={pin.length < APP_CONFIG.auth.pinMinLength} onClick={() => void submit()}>
            {t('auth.approve')}
          </Button>
        </>
      }
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
        className="flex flex-col gap-3"
      >
        <Input
          type="password"
          inputMode="numeric"
          autoComplete="off"
          data-autofocus
          aria-label={t('auth.pinLabel')}
          value={pin}
          maxLength={APP_CONFIG.auth.pinMaxLength}
          invalid={error}
          onChange={(event) => {
            setError(false);
            setPin(event.target.value.replace(/\D/g, '').slice(0, APP_CONFIG.auth.pinMaxLength));
          }}
          inputSize="lg"
          className="text-center text-2xl tracking-[0.5em]"
        />
        {error && <p className="type-body-sm text-center text-danger-text">{t('errors.loginFailed')}</p>}
        <NumericKeypad allowDecimal={false} backLabel={t('common.actions.remove')} onKey={(key) => setPin((value) => applyKeypadKey(value, key === '00' ? '0' : key, 0, APP_CONFIG.auth.pinMaxLength))} />
      </form>
    </Modal>
  );
}
