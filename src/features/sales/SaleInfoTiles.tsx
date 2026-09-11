import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { Ban, Clock, IdCard, Languages, Monitor, Undo2, UserRound } from 'lucide-react';
import { useFormat } from '@/hooks/useFormat';
import { useLanguage, useT } from '@/i18n';
import { useCan } from '@/stores/authStore';
import type { SaleDetail, Shift } from '@/types';
import { Button } from '@/components/ui/Button';
import { cn } from '@/components/ui/cn';
import { directoryName, type StaffDirectory } from './saleData';

function Tile({ icon, label, children }: { icon: ReactNode; label: ReactNode; children: ReactNode }) {
  return (
    <div className="flex min-w-0 items-start gap-3 rounded-xl border border-border bg-surface px-4 py-3">
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-surface-3 text-fg-muted">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="type-caption text-fg-subtle">{label}</p>
        <div className="type-body truncate font-medium text-fg">{children}</div>
      </div>
    </div>
  );
}

const linkClass = 'rounded-sm text-primary underline-offset-2 hover:underline focus-visible:underline';

/** Who, where and when: cashier, counter, customer, receipt language and shift. */
export function SaleInfoTiles({ sale, shift, directory }: { sale: SaleDetail; shift: Shift | null; directory: StaffDirectory | undefined }) {
  const t = useT();
  const format = useFormat();
  const language = useLanguage();
  const canViewCustomers = useCan('customers.view');
  const canViewShift = useCan('shift.operate');

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
      <Tile icon={<IdCard size={16} aria-hidden />} label={t('common.labels.cashier')}>
        {directoryName(directory?.users, sale.cashierId, language, sale.cashierName)}
      </Tile>
      <Tile icon={<Monitor size={16} aria-hidden />} label={t('common.labels.counter')}>
        {directoryName(directory?.counters, sale.counterId, language, sale.counterName)}
      </Tile>
      <Tile icon={<UserRound size={16} aria-hidden />} label={t('common.labels.customer')}>
        {sale.customerId ? (
          <span className="flex min-w-0 flex-col leading-tight">
            {canViewCustomers ? (
              <Link to={`/customers/${sale.customerId}`} className={cn('truncate', linkClass)}>
                {sale.customerName}
              </Link>
            ) : (
              <span className="truncate">{sale.customerName}</span>
            )}
            {sale.customerPhone && <span className="type-caption font-normal text-fg-subtle tnum">{format.digits(sale.customerPhone)}</span>}
          </span>
        ) : (
          <span className="text-fg-muted">{t('common.labels.walkIn')}</span>
        )}
      </Tile>
      <Tile icon={<Languages size={16} aria-hidden />} label={t('sales.detail.info.language')}>
        {t(`enums.language.${sale.language}`)}
      </Tile>
      <Tile icon={<Clock size={16} aria-hidden />} label={t('common.labels.shift')}>
        {shift ? (
          canViewShift ? (
            <Link to={`/shift/${shift.id}`} className={cn('font-mono', linkClass)}>
              {shift.shiftNo}
            </Link>
          ) : (
            <span className="font-mono">{shift.shiftNo}</span>
          )
        ) : (
          <span className="text-fg-muted">{t('sales.detail.info.noShift')}</span>
        )}
      </Tile>
    </div>
  );
}

/** Banner for cancelled or (partly) returned sales. */
export function SaleStatusBanner({ sale }: { sale: SaleDetail }) {
  const t = useT();
  const format = useFormat();

  if (sale.status === 'cancelled') {
    return (
      <div role="status" className="flex items-start gap-3 rounded-xl bg-danger-soft px-4 py-3 text-danger-text">
        <Ban size={20} aria-hidden className="mt-0.5 shrink-0" />
        <div className="min-w-0">
          <p className="font-semibold">{t('sales.detail.banner.cancelledTitle')}</p>
          <p className="type-body-sm">
            {t('sales.detail.banner.cancelledBy', { name: sale.cancelledBy || '—', date: format.dateTime(sale.cancelledAt) })}
            {sale.cancelReason ? ` · ${t('sales.detail.activity.reason', { reason: sale.cancelReason })}` : ''}
          </p>
          <p className="type-caption mt-0.5 opacity-90">{t('sales.detail.banner.cancelledHint')}</p>
        </div>
      </div>
    );
  }

  if (sale.status === 'returned' || sale.status === 'partially_returned') {
    const full = sale.status === 'returned';
    return (
      <div role="status" className={cn('flex flex-wrap items-center gap-3 rounded-xl px-4 py-3', full ? 'bg-info-soft text-info-text' : 'bg-warning-soft text-warning-text')}>
        <Undo2 size={20} aria-hidden className="shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{full ? t('sales.detail.banner.returnedTitle') : t('sales.detail.banner.partlyReturnedTitle')}</p>
          <p className="type-body-sm">{t('sales.detail.banner.refunded', { count: sale.returns.length, amount: format.money(sale.returnedTotal) })}</p>
        </div>
        <Button variant="ghost" onClick={() => document.getElementById('sale-returns')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
          {t('sales.detail.banner.viewReturns')}
        </Button>
      </div>
    );
  }

  return null;
}
