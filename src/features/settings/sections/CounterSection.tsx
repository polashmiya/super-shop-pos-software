import { useNavigate } from 'react-router';
import { CircleCheck, CircleDot, Monitor, MonitorSmartphone, Settings2, Wrench, type LucideIcon } from 'lucide-react';
import { useAsync } from '@/hooks/useAsync';
import { useLocalize, useT } from '@/i18n';
import { counterService } from '@/services/shiftService';
import { useCan } from '@/stores/authStore';
import { useShiftStore } from '@/stores/shiftStore';
import { confirmAction, toast } from '@/stores/uiStore';
import type { Counter, CounterStatus } from '@/types';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Controls';
import { Badge, StatusBadge, type Tone } from '@/components/ui/Display';
import { Skeleton } from '@/components/ui/States';
import { TextField } from '../components/Inputs';
import { LockedNote, SettingRow, SettingsCard } from '../components/SettingsCard';
import { saveDevice, useDeviceGroup } from '../saveStatus';

const STATUS: Record<CounterStatus, { tone: Tone; icon: LucideIcon }> = {
  open: { tone: 'success', icon: CircleCheck },
  closed: { tone: 'neutral', icon: CircleDot },
  maintenance: { tone: 'warning', icon: Wrench },
};

/** Which counter this computer sells on, its friendly name, and the branch's counters. */
export default function CounterSection() {
  const t = useT();
  const localize = useLocalize();
  const navigate = useNavigate();
  const terminal = useDeviceGroup('terminal');
  const canManage = useCan('counters.manage');
  const canManageSettings = useCan('settings.manage');
  const canEdit = canManage || canManageSettings;
  const counters = useAsync(() => counterService.list(), []);
  const list = counters.data ?? [];

  const link = async (counter: Counter) => {
    if (counter.id === terminal.counterId) return;
    if (counter.status === 'maintenance') {
      toast.warning({ text: t('settings.counter.maintenance', { name: localize(counter.name) }) });
      return;
    }
    const { shift, counter: current } = useShiftStore.getState();
    const message = [
      t('settings.counter.confirmMessage', { name: localize(counter.name) }),
      shift && current ? t('settings.counter.confirmOpenShift', { shift: shift.shiftNo, current: localize(current.name) }) : '',
    ]
      .filter(Boolean)
      .join(' ');
    const ok = await confirmAction({ title: t('settings.counter.confirmTitle', { name: localize(counter.name) }), message, confirmLabel: t('settings.counter.confirm'), tone: 'primary' });
    if (!ok) return;
    saveDevice({ terminal: { counterId: counter.id } });
    await useShiftStore.getState().load().catch((error: unknown) => console.error('Reloading the shift failed', error));
    counters.reload();
    toast.success({ text: t('settings.counter.linked', { name: localize(counter.name) }) });
  };

  const options = [
    { value: '', label: t('settings.counter.notLinked'), disabled: true },
    ...list.map((counter) => ({ value: counter.id, label: `${counter.code} · ${localize(counter.name)}`, disabled: counter.status === 'maintenance' && counter.id !== terminal.counterId })),
  ];

  return (
    <div className="flex flex-col gap-5">
      <SettingsCard icon={Monitor} title={t('settings.counter.terminal')} description={t('settings.counter.terminalHint')}>
        <SettingRow anchor="terminalCounter" label={t('settings.counter.counter')}>
          {(id) => (
            <div className="w-72">
              {counters.data ? (
                <Select
                  id={id}
                  value={terminal.counterId}
                  options={options}
                  disabled={!canEdit}
                  onChange={(value) => {
                    const counter = list.find((entry) => entry.id === value);
                    if (counter) void link(counter);
                  }}
                />
              ) : (
                <Skeleton className="h-11 w-full" />
              )}
            </div>
          )}
        </SettingRow>
        <SettingRow anchor="terminalName" label={t('settings.counter.name')} description={t('settings.counter.nameHint')}>
          {(id) => (
            <div className="w-72">
              <TextField id={id} value={terminal.name} placeholder={t('settings.counter.namePlaceholder')} disabled={!canEdit} maxLength={60} onCommit={(name) => saveDevice({ terminal: { name } })} />
            </div>
          )}
        </SettingRow>
        {!canEdit && <LockedNote />}
      </SettingsCard>

      <SettingsCard
        icon={MonitorSmartphone}
        title={t('settings.counter.list')}
        description={t('settings.counter.listHint')}
        action={
          canManage && (
            <Button size="sm" icon={Settings2} onClick={() => navigate('/counters')}>
              {t('settings.counter.manage')}
            </Button>
          )
        }
      >
        {!counters.data ? (
          <div className="flex flex-col gap-2 py-3">
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </div>
        ) : list.length === 0 ? (
          <p className="py-6 text-center type-body-sm text-fg-muted">{t('settings.counter.empty')}</p>
        ) : (
          list.map((counter) => {
            const current = counter.id === terminal.counterId;
            const status = STATUS[counter.status];
            return (
              <div key={counter.id} className="flex flex-wrap items-center gap-3 py-3">
                <span className="flex h-10 w-12 shrink-0 items-center justify-center rounded-md bg-surface-3 font-mono text-sm font-semibold text-fg">{counter.code}</span>
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 font-medium text-fg">
                    {localize(counter.name)}
                    {current && (
                      <Badge tone="primary" icon={Monitor} size="sm">
                        {t('settings.counter.thisTerminal')}
                      </Badge>
                    )}
                  </p>
                  <p className="type-caption text-fg-subtle">
                    {counter.shiftNo ? t('settings.counter.shiftOpen', { shift: counter.shiftNo }) : t('settings.counter.noShift')}
                    {counter.assignedUserName ? ` · ${t('settings.counter.cashier', { name: counter.assignedUserName })}` : ''}
                  </p>
                </div>
                <StatusBadge tone={status.tone} icon={status.icon} label={t(`enums.counterStatus.${counter.status}`)} size="sm" />
                {canEdit && !current && counter.status !== 'maintenance' && (
                  <Button size="sm" variant="ghost" onClick={() => void link(counter)}>
                    {t('settings.counter.use')}
                  </Button>
                )}
              </div>
            );
          })
        )}
      </SettingsCard>
    </div>
  );
}
