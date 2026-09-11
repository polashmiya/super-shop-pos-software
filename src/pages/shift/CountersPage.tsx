import { useState } from 'react';
import { useNavigate } from 'react-router';
import { CircleDot, History, MonitorSmartphone, Plus, TrendingUp, Wallet, Wrench } from 'lucide-react';
import { useAsync } from '@/hooks/useAsync';
import { useFormat } from '@/hooks/useFormat';
import { useLanguage, useT } from '@/i18n';
import { counterService } from '@/services/shiftService';
import { useCan } from '@/stores/authStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useShiftStore } from '@/stores/shiftStore';
import { confirmAction, toast } from '@/stores/uiStore';
import type { Counter } from '@/types';
import { Button } from '@/components/ui/Button';
import { PageHeader, StatCard } from '@/components/ui/Display';
import { EmptyState, ErrorState, LoadingBar, Skeleton } from '@/components/ui/States';
import { CounterCard } from '@/features/cash/CounterCard';
import { CounterFormModal } from '@/features/cash/CounterFormModal';
import { counterName } from '@/features/cash/cashMeta';
import { loadCounterOverview } from '@/features/cash/shiftData';

/* ==========================================================================
   Counters (/counters): every checkout counter with its status, current
   shift and cashier, drawer cash and today's sales. Add / edit, activate /
   put under maintenance, and link this terminal to a counter.
   ========================================================================== */

export default function CountersPage() {
  const t = useT();
  const format = useFormat();
  const language = useLanguage();
  const navigate = useNavigate();
  const canManage = useCan('counters.manage');
  const terminalCounterId = useSettingsStore((state) => state.device.terminal.counterId);
  const printer = useSettingsStore((state) => state.device.printer);
  const [editing, setEditing] = useState<Counter | 'new' | null>(null);

  const overview = useAsync(() => loadCounterOverview(), []);
  const rows = overview.data ?? [];

  const refresh = () => {
    overview.reload();
    void useShiftStore
      .getState()
      .load()
      .catch(() => undefined);
  };

  const toggle = async (counter: Counter) => {
    const name = counterName(counter, language);
    const activating = counter.status === 'maintenance';
    if (!activating && counter.shiftId) {
      toast.warning('cash.counters.deactivateBlocked');
      return;
    }
    const ok = await confirmAction({
      title: t(activating ? 'cash.counters.confirmActivateTitle' : 'cash.counters.confirmDeactivateTitle', { name }),
      message: t(activating ? 'cash.counters.confirmActivateMessage' : 'cash.counters.confirmDeactivateMessage'),
      confirmLabel: activating ? t('common.actions.activate') : t('common.actions.deactivate'),
      tone: activating ? 'primary' : 'danger',
    });
    if (!ok) return;
    try {
      await counterService.update(counter.id, counter.name, activating ? 'closed' : 'maintenance');
      toast.success({ key: activating ? 'cash.counters.activated' : 'cash.counters.deactivated', params: { name } });
      refresh();
    } catch (error) {
      toast.fromError(error);
    }
  };

  const linkHere = async (counter: Counter) => {
    const name = counterName(counter, language);
    const { shift, counter: current } = useShiftStore.getState();
    const openHere = shift && current ? ` ${t('cash.counters.confirmUseOpenShift', { current: counterName(current, language) })}` : '';
    const ok = await confirmAction({ title: t('cash.counters.confirmUseTitle', { name }), message: `${t('cash.counters.confirmUseMessage', { name })}${openHere}`, confirmLabel: t('cash.counters.useHere'), tone: 'primary' });
    if (!ok) return;
    useSettingsStore.getState().updateDevice({ terminal: { counterId: counter.id } });
    try {
      await useShiftStore.getState().load();
      toast.success({ key: 'cash.counters.linked', params: { name } });
    } catch (error) {
      toast.fromError(error);
    }
  };

  const open = rows.filter((row) => row.counter.shiftId);
  const drawerTotal = open.reduce((sum, row) => sum + row.counter.currentCash, 0);
  const todayTotal = rows.reduce((sum, row) => sum + row.todaySales, 0);
  const todayOrders = rows.reduce((sum, row) => sum + row.todayOrders, 0);
  const inactive = rows.filter((row) => row.counter.status === 'maintenance').length;

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        icon={MonitorSmartphone}
        title={t('cash.counters.title')}
        description={t('cash.counters.description')}
        breadcrumb={[{ label: t('cash.shift.title'), to: '/shift' }, { label: t('cash.counters.title') }]}
        actions={
          <>
            <Button variant="ghost" icon={History} onClick={() => navigate('/shift/history')}>
              {t('cash.shift.history')}
            </Button>
            {canManage && (
              <Button variant="primary" icon={Plus} onClick={() => setEditing('new')}>
                {t('cash.counters.add')}
              </Button>
            )}
          </>
        }
      />

      <div className="relative min-h-0 flex-1 overflow-y-auto p-6">
        <LoadingBar active={overview.loading && Boolean(overview.data)} />
        {overview.error && !overview.data ? (
          <ErrorState title={t('errors.loadFailed')} description={t('common.states.somethingWrongHint')} action={<Button onClick={overview.reload}>{t('common.actions.retry')}</Button>} />
        ) : (
          <div className="flex flex-col gap-5">
            <section aria-label={t('cash.counters.title')} className="grid grid-cols-2 gap-3 xl:grid-cols-4">
              {!overview.data ? (
                Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="h-[6.4rem] rounded-xl" />)
              ) : (
                <>
                  <StatCard label={t('cash.counters.summaryOpen')} value={`${format.integer(open.length)} / ${format.integer(rows.length)}`} icon={CircleDot} tone="success" />
                  <StatCard label={t('cash.counters.summaryDrawers')} value={format.money(drawerTotal)} icon={Wallet} tone="primary" />
                  <StatCard label={t('cash.counters.summaryToday')} value={format.money(todayTotal)} icon={TrendingUp} tone="info" hint={t('cash.common.salesCount', { count: todayOrders })} />
                  <StatCard label={t('cash.counters.summaryInactive')} value={format.integer(inactive)} icon={Wrench} tone={inactive > 0 ? 'warning' : 'neutral'} />
                </>
              )}
            </section>

            {!overview.data ? (
              <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
                {Array.from({ length: 3 }, (_, index) => (
                  <Skeleton key={index} className="h-80 rounded-xl" />
                ))}
              </div>
            ) : rows.length === 0 ? (
              <EmptyState
                icon={MonitorSmartphone}
                title={t('cash.counters.empty')}
                description={t('cash.counters.emptyHint')}
                action={
                  canManage ? (
                    <Button variant="primary" icon={Plus} onClick={() => setEditing('new')}>
                      {t('cash.counters.add')}
                    </Button>
                  ) : undefined
                }
              />
            ) : (
              <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
                {rows.map((row) => (
                  <CounterCard
                    key={row.counter.id}
                    overview={row}
                    isTerminal={row.counter.id === terminalCounterId}
                    canManage={canManage}
                    printer={printer}
                    onEdit={() => setEditing(row.counter)}
                    onToggle={() => void toggle(row.counter)}
                    onUseHere={() => void linkHere(row.counter)}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {editing && (
        <CounterFormModal
          counter={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            refresh();
          }}
        />
      )}
    </div>
  );
}
