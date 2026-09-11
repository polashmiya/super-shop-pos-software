import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { ArrowDownToLine, ArrowUpFromLine, History, Info, LockKeyhole, MonitorSmartphone, RefreshCw, Wallet } from 'lucide-react';
import { useAsync } from '@/hooks/useAsync';
import { useNow } from '@/hooks/useCommon';
import { useFormat } from '@/hooks/useFormat';
import { useLanguage, useT } from '@/i18n';
import { listHeldSales } from '@/services/heldSaleService';
import { shiftService } from '@/services/shiftService';
import { useAuthStore, useCan } from '@/stores/authStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useShiftStore } from '@/stores/shiftStore';
import { toast } from '@/stores/uiStore';
import type { Shift, ShiftTotals } from '@/types';
import { Button } from '@/components/ui/Button';
import { PageHeader } from '@/components/ui/Display';
import { IconButton } from '@/components/ui/IconButton';
import { LoadingState, Skeleton } from '@/components/ui/States';
import { CashLedger } from '@/features/cash/CashLedger';
import { CashMovementDialog, type MovementType } from '@/features/cash/CashMovementDialog';
import { CloseShiftModal } from '@/features/cash/CloseShiftModal';
import { OpenShiftPanel } from '@/features/cash/OpenShiftPanel';
import { ActivityCard, PaymentsCard, ReconciliationCard, ShiftFactsCard } from '@/features/cash/ShiftCards';
import { ShiftPrintMenu } from '@/features/cash/ShiftPrintMenu';
import { counterName } from '@/features/cash/cashMeta';
import { loadShiftLiveDetails } from '@/features/cash/shiftData';

/* ==========================================================================
   Cash & shift (/shift): open a shift with a counted float, or run the open
   shift — live drawer totals, cash in / out, the drawer ledger, the X
   report and the multi-step close with over / short reconciliation.
   ========================================================================== */

interface CloseTarget {
  shift: Shift;
  totals: ShiftTotals;
  heldCount: number;
}

export default function ShiftPage() {
  const t = useT();
  const format = useFormat();
  const language = useLanguage();
  const navigate = useNavigate();
  const shift = useShiftStore((state) => state.shift);
  const totals = useShiftStore((state) => state.totals);
  const counter = useShiftStore((state) => state.counter);
  const loaded = useShiftStore((state) => state.loaded);
  const userId = useAuthStore((state) => state.user?.id ?? null);
  const canManageCash = useCan('cash.manage');
  const canManageCounters = useCan('counters.manage');
  const blindClose = useSettingsStore((state) => state.business.shift.blindClose);
  const hideExpected = blindClose && !canManageCash;
  const now = useNow(60_000);
  const [movement, setMovement] = useState<MovementType | null>(null);
  const [closing, setClosing] = useState<CloseTarget | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshedAt, setRefreshedAt] = useState(() => new Date());

  // Counters and the open shift may have changed on other terminals.
  useEffect(() => {
    void useShiftStore
      .getState()
      .load()
      .catch((error: unknown) => toast.fromError(error));
  }, []);

  const shiftId = shift?.id ?? null;
  const details = useAsync(() => (shiftId ? loadShiftLiveDetails(shiftId) : Promise.resolve(null)), [shiftId]);

  const refresh = async () => {
    setRefreshing(true);
    try {
      await useShiftStore.getState().refreshTotals();
      details.reload();
      setRefreshedAt(new Date());
    } catch (error) {
      toast.fromError(error);
    } finally {
      setRefreshing(false);
    }
  };

  const startClose = async () => {
    if (!shift) return;
    try {
      const [fresh, held] = await Promise.all([shiftService.totals(shift), listHeldSales().catch(() => [])]);
      setClosing({ shift, totals: fresh, heldCount: held.length });
    } catch (error) {
      toast.fromError(error);
    }
  };

  const counterLabel = counter ? `${counter.code} · ${counterName(counter, language)}` : (shift?.counterName ?? '');
  const payments = details.data?.activity.payments;

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        icon={Wallet}
        title={t('cash.shift.title')}
        description={counter ? t('cash.shift.description', { counter: counterLabel }) : t('cash.shift.noCounter')}
        actions={
          <>
            <Button variant="ghost" icon={History} onClick={() => navigate('/shift/history')}>
              {t('cash.shift.history')}
            </Button>
            {canManageCounters && (
              <Button variant="ghost" icon={MonitorSmartphone} onClick={() => navigate('/counters')}>
                {t('cash.shift.counters')}
              </Button>
            )}
            {shift && (
              <>
                <ShiftPrintMenu shift={shift} />
                <Button icon={ArrowDownToLine} onClick={() => setMovement('cash_in')} disabled={!totals}>
                  {t('cash.common.cashIn')}
                </Button>
                <Button icon={ArrowUpFromLine} onClick={() => setMovement('cash_out')} disabled={!totals}>
                  {t('cash.common.cashOut')}
                </Button>
                <Button variant="danger" icon={LockKeyhole} onClick={() => void startClose()}>
                  {t('cash.close.confirm')}
                </Button>
              </>
            )}
          </>
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto p-6">
        {!loaded ? (
          <LoadingState label={t('cash.shift.loading')} className="h-full" />
        ) : !shift ? (
          <OpenShiftPanel />
        ) : (
          <div className="flex flex-col gap-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="type-h2 text-fg">{t('cash.shift.heading', { shift: shift.shiftNo })}</h2>
              <div className="flex items-center gap-2">
                <span className="type-caption text-fg-subtle">{t('cash.common.updated', { time: format.time(refreshedAt) })}</span>
                <IconButton icon={RefreshCw} label={t('cash.shift.refresh')} variant="secondary" disabled={refreshing} onClick={() => void refresh()} />
              </div>
            </div>

            {shift.openedBy !== userId && (
              <p className="flex items-start gap-2 rounded-lg bg-info-soft p-3 type-body-sm text-info-text">
                <Info size={18} aria-hidden className="mt-0.5 shrink-0" />
                {t('cash.shift.otherOwner', { name: shift.openedByName })}
              </p>
            )}

            <ShiftFactsCard shift={shift} counterLabel={counterLabel} cashierLabel={shift.openedByName} now={now} />

            <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_24rem]">
              <div className="flex min-w-0 flex-col gap-5">
                {totals ? <ReconciliationCard totals={totals} hidden={hideExpected} live /> : <Skeleton className="h-96 rounded-xl" />}
                <CashLedger movements={details.data?.movements} error={Boolean(details.error)} onRetry={details.reload} />
              </div>
              <div className="flex min-w-0 flex-col gap-5">
                <PaymentsCard
                  title={t('cash.shift.nonCashTitle')}
                  hint={t('cash.shift.nonCashHint')}
                  payments={payments?.filter((row) => row.method !== 'cash')}
                  emptyText={t('cash.shift.nonCashEmpty')}
                />
                {totals ? <ActivityCard totals={totals} activity={details.data?.activity} /> : <Skeleton className="h-64 rounded-xl" />}
              </div>
            </div>
          </div>
        )}
      </div>

      {movement && shift && totals && (
        <CashMovementDialog
          shift={shift}
          drawerCash={totals.expectedCash}
          initialType={movement}
          hideDrawer={hideExpected}
          onClose={() => setMovement(null)}
          onSaved={() => {
            setMovement(null);
            void refresh();
          }}
        />
      )}
      {closing && <CloseShiftModal shift={closing.shift} totals={closing.totals} heldCount={closing.heldCount} hideExpected={hideExpected} onClose={() => setClosing(null)} />}
    </div>
  );
}
