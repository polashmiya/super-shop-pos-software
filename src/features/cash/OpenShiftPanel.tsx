import { useState, type ReactNode } from 'react';
import { ClipboardList, Coins, History, Info, LockOpen, PlayCircle, ShieldAlert, TriangleAlert, Wrench, type LucideIcon } from 'lucide-react';
import { useAsync } from '@/hooks/useAsync';
import { useFormat } from '@/hooks/useFormat';
import { pick, useLanguage, useT } from '@/i18n';
import { shiftService } from '@/services/shiftService';
import { useAuthStore, useCan } from '@/stores/authStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useShiftStore } from '@/stores/shiftStore';
import { requestApproval, toast } from '@/stores/uiStore';
import type { Counter } from '@/types';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Controls';
import { Card, SectionHeader, StatusBadge } from '@/components/ui/Display';
import { FormField, Input } from '@/components/ui/Input';
import { Skeleton } from '@/components/ui/States';
import { cn } from '@/components/ui/cn';
import { DifferenceBadge } from './CashBadges';
import { CashCountInput } from './CashCountInput';
import { amountText, counterName, countValue, emptyCount, OPENING_QUICK_AMOUNTS, uniqueAmounts, type CashCountState } from './cashMeta';
import { lastClosedShift } from './shiftData';

function Notice({ tone, icon: Icon, title, children }: { tone: 'warning' | 'info'; icon: LucideIcon; title?: string; children: ReactNode }) {
  return (
    <div className={cn('flex items-start gap-3 rounded-lg p-4', tone === 'warning' ? 'bg-warning-soft text-warning-text' : 'bg-info-soft text-info-text')}>
      <Icon size={20} aria-hidden className="mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1">
        {title && <p className="font-semibold">{title}</p>}
        <div className="type-body-sm">{children}</div>
      </div>
    </div>
  );
}

/** Opening form: counter, opening float (typed or counted), note and manager approval for unusual amounts. */
export function OpenShiftPanel() {
  const t = useT();
  const format = useFormat();
  const language = useLanguage();
  const counters = useShiftStore((state) => state.counters);
  const terminalCounterId = useSettingsStore((state) => state.device.terminal.counterId);
  const rules = useSettingsStore((state) => state.business.shift);
  const userId = useAuthStore((state) => state.user?.id ?? null);
  const canOperate = useCan('shift.operate');
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [count, setCount] = useState<CashCountState>(() => emptyCount(amountText(useSettingsStore.getState().business.shift.defaultOpeningCash)));
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  const available = (counter: Counter) => counter.status !== 'maintenance' && !counter.shiftId;
  const terminalCounter = counters.find((counter) => counter.id === terminalCounterId);
  const defaultId = (terminalCounter && available(terminalCounter) ? terminalCounter : counters.find(available))?.id ?? terminalCounterId;
  const selectedId = pickedId ?? defaultId;
  const selected = counters.find((counter) => counter.id === selectedId) ?? null;
  const ownOpenShift = Boolean(selected?.shiftId && selected.assignedUserId === userId);
  const otherOpenShift = Boolean(selected?.shiftId && !ownOpenShift);
  const maintenance = selected?.status === 'maintenance';
  const canOpen = Boolean(selected) && !maintenance && !selected?.shiftId && canOperate;
  const amount = countValue(count);
  const needsApproval = amount !== null && shiftService.needsApproval(rules.defaultOpeningCash, amount);

  const last = useAsync(() => (selectedId ? lastClosedShift(selectedId) : Promise.resolve(null)), [selectedId]);
  const lastCount = last.data?.actualCash ?? null;
  const quickAmounts = uniqueAmounts([rules.defaultOpeningCash, lastCount, ...OPENING_QUICK_AMOUNTS]);

  const optionLabel = (counter: Counter) => {
    const name = counterName(counter, language);
    if (counter.status === 'maintenance') return t('cash.open.counterMaintenance', { code: counter.code, name });
    if (counter.shiftId) return t('cash.open.counterBusy', { code: counter.code, name, user: counter.assignedUserName ?? '—' });
    return t('cash.open.counterOption', { code: counter.code, name });
  };

  const linkTerminal = (counterId: string) => {
    if (counterId !== useSettingsStore.getState().device.terminal.counterId) useSettingsStore.getState().updateDevice({ terminal: { counterId } });
  };

  const resume = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      linkTerminal(selected.id);
      await useShiftStore.getState().load();
      toast.success({ key: 'cash.open.resumed', params: { shift: selected.shiftNo ?? '' } });
    } catch (reason) {
      toast.fromError(reason);
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    if (!selected || !canOpen) return;
    if (amount === null) {
      setError(t('validation.invalidAmount'));
      return;
    }
    let finalNote = note.trim();
    if (needsApproval) {
      const approver = await requestApproval({ permission: 'cash.manage', action: t('cash.open.approvalAction', { amount: format.money(amount), usual: format.money(rules.defaultOpeningCash) }) });
      if (!approver) {
        toast.error('cash.open.approvalDeclined');
        return;
      }
      const approved = t('cash.open.approvedNote', { name: pick(approver.name, language) });
      finalNote = finalNote ? `${finalNote} · ${approved}` : approved;
    }
    setBusy(true);
    try {
      linkTerminal(selected.id);
      const shift = await useShiftStore.getState().open(amount, finalNote);
      toast.success({ key: 'cash.open.opened', params: { shift: shift.shiftNo } });
    } catch (reason) {
      toast.fromError(reason);
      void useShiftStore.getState().load().catch(() => undefined);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <Card className="flex flex-col gap-5">
        <div className="flex items-start gap-3">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary-soft-fg">
            <LockOpen size={24} aria-hidden />
          </span>
          <div>
            <h2 className="type-h2 text-fg">{t('cash.open.title')}</h2>
            <p className="type-body text-fg-muted">{t('cash.open.description')}</p>
          </div>
        </div>

        <form
          className="flex flex-col gap-5"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <FormField label={t('cash.open.counter')} hint={selected && selected.id !== terminalCounterId && canOpen ? t('cash.open.relinkHint', { counter: counterName(selected, language) }) : undefined}>
            {(id) => (
              <Select
                id={id}
                value={selectedId}
                onChange={(value) => setPickedId(value)}
                options={counters.map((counter) => ({ value: counter.id, label: optionLabel(counter) }))}
              />
            )}
          </FormField>

          {otherOpenShift && selected && (
            <Notice tone="warning" icon={TriangleAlert} title={t('cash.open.busyTitle')}>
              {t('cash.open.busyMessage', { shift: selected.shiftNo ?? '', name: selected.assignedUserName ?? '—' })}
            </Notice>
          )}
          {ownOpenShift && selected && (
            <Notice tone="info" icon={Info} title={t('cash.open.resumeTitle')}>
              <p>{t('cash.open.resumeMessage', { shift: selected.shiftNo ?? '' })}</p>
              <Button className="mt-3" variant="primary" icon={PlayCircle} loading={busy} onClick={() => void resume()}>
                {t('cash.open.resume')}
              </Button>
            </Notice>
          )}
          {maintenance && (
            <Notice tone="warning" icon={Wrench}>
              {t('cash.open.maintenance')}
            </Notice>
          )}
          {!selected && (
            <Notice tone="warning" icon={Wrench}>
              {t('cash.shift.noCounter')}
            </Notice>
          )}

          {canOpen && (
            <>
              <CashCountInput
                state={count}
                onChange={(next) => {
                  setCount(next);
                  setError(undefined);
                }}
                label={t('cash.common.openingCash')}
                hint={t('cash.open.usual', { amount: format.money(rules.defaultOpeningCash) })}
                error={error}
                quickAmounts={quickAmounts}
                autoFocus
              />
              <p className="type-caption text-fg-subtle">{t('cash.open.ruleHint', { limit: format.money(rules.maxDifference) })}</p>
              {needsApproval && <StatusBadge tone="warning" icon={ShieldAlert} label={t('cash.common.needsApproval')} />}
              <FormField label={t('common.labels.note')}>
                {(id) => <Input id={id} maxLength={200} autoComplete="off" value={note} placeholder={t('cash.open.notePlaceholder')} onChange={(event) => setNote(event.target.value)} />}
              </FormField>
              <Button type="submit" variant="primary" size="lg" icon={LockOpen} loading={busy} fullWidth>
                {t('cash.open.submit')}
              </Button>
            </>
          )}
          {!canOperate && <p className="type-body-sm text-danger-text">{t('errors.permissionDenied')}</p>}
        </form>
      </Card>

      <div className="flex flex-col gap-5">
        <Card className="flex flex-col gap-3">
          <SectionHeader icon={History} title={t('cash.open.lastShiftTitle')} />
          {last.loading && !last.data ? (
            <Skeleton className="h-24 w-full" />
          ) : last.data ? (
            <>
              <dl className="grid grid-cols-2 gap-3">
                <div>
                  <dt className="type-caption text-fg-subtle">{t('common.labels.shift')}</dt>
                  <dd className="font-mono text-sm font-semibold text-fg">{last.data.shiftNo}</dd>
                </div>
                <div>
                  <dt className="type-caption text-fg-subtle">{t('cash.common.closedAt')}</dt>
                  <dd className="text-sm font-medium text-fg tnum">{format.dateTime(last.data.closedAt)}</dd>
                </div>
                <div>
                  <dt className="type-caption text-fg-subtle">{t('cash.common.closedBy')}</dt>
                  <dd className="truncate text-sm font-medium text-fg">{last.data.closedByName ?? last.data.openedByName}</dd>
                </div>
                <div>
                  <dt className="type-caption text-fg-subtle">{t('cash.common.countedCash')}</dt>
                  <dd className="text-sm font-semibold text-fg tnum">{lastCount !== null ? format.money(lastCount) : '—'}</dd>
                </div>
              </dl>
              {last.data.difference !== null && <DifferenceBadge difference={last.data.difference} size="sm" />}
              {lastCount !== null && canOpen && (
                <Button icon={Coins} onClick={() => setCount({ ...count, mode: 'amount', text: amountText(lastCount) })}>
                  {t('cash.open.useLastClosing')}
                </Button>
              )}
            </>
          ) : (
            <p className="type-body-sm text-fg-muted">{t('cash.open.lastShiftNone')}</p>
          )}
        </Card>
        <Card className="flex flex-col gap-3">
          <SectionHeader icon={ClipboardList} title={t('cash.open.tipsTitle')} />
          <ul className="flex flex-col gap-2.5 type-body-sm text-fg-muted">
            {[t('cash.open.tipCount'), t('cash.open.tipChange'), t('cash.open.tipRecord')].map((tip) => (
              <li key={tip} className="flex items-start gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden />
                {tip}
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
