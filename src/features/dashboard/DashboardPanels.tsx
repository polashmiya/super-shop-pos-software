import type { ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import { ArrowRight, CalendarClock, CircleCheck, Monitor, ReceiptText, TriangleAlert, Wallet, type LucideIcon } from 'lucide-react';
import { useFormat } from '@/hooks/useFormat';
import { useLanguage, useLocalize, useT } from '@/i18n';
import type { ReportRow } from '@/repositories/types';
import type { Counter, Sale } from '@/types';
import { Card, SectionHeader, StatusBadge } from '@/components/ui/Display';
import { EmptyState } from '@/components/ui/States';
import { cn } from '@/components/ui/cn';
import { ProductImage } from '@/components/product/ProductImage';
import { PaymentSummaryBadge, SaleStatusBadge } from '@/features/sales/SaleBadges';
import type { ExpiringProduct } from './dashboardData';

function ViewAll({ to, label }: { to: string; label: string }) {
  return (
    <Link to={to} className="inline-flex min-h-9 items-center gap-1 rounded-md px-2 text-sm font-medium text-primary hover:underline">
      {label}
      <ArrowRight size={15} aria-hidden className="rtl:rotate-180" />
    </Link>
  );
}

function Row({ children, to }: { children: ReactNode; to?: string }) {
  const className = 'flex min-h-14 items-center gap-3 rounded-lg px-2 py-1.5 transition-base';
  return to ? (
    <li>
      <Link to={to} className={cn(className, 'hover:bg-surface-2')}>
        {children}
      </Link>
    </li>
  ) : (
    <li className={className}>{children}</li>
  );
}

const str = (value: unknown) => (typeof value === 'string' ? value : value === null || value === undefined ? '' : String(value));
const num = (value: unknown) => (typeof value === 'number' ? value : Number(value) || 0);

export function LowStockCard({ rows, count }: { rows: ReportRow[]; count: number }) {
  const t = useT();
  const format = useFormat();
  const language = useLanguage();
  return (
    <Card className="flex flex-col gap-3">
      <SectionHeader
        icon={TriangleAlert}
        title={t('dashboard.lowStock.title')}
        description={count > 0 ? t('dashboard.lowStock.subtitle', { count }) : undefined}
        action={count > 0 ? <ViewAll to="/inventory?status=low_stock" label={t('dashboard.lowStock.viewAll')} /> : undefined}
      />
      {rows.length === 0 ? (
        <EmptyState compact icon={CircleCheck} title={t('dashboard.lowStock.empty')} />
      ) : (
        <ul className="-mx-2 flex flex-col">
          {rows.map((row) => (
            <Row key={str(row.id)} to={`/products/${str(row.id)}`}>
              <ProductImage product={{ image: str(row.image) || null, categoryId: '' }} className="h-10 w-10 shrink-0" iconSize={18} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-fg">{language === 'bn' ? str(row.name_bn) : str(row.name_en)}</p>
                <p className="type-caption text-fg-subtle tnum">{t('dashboard.lowStock.left', { stock: format.quantity(num(row.stock)), min: format.quantity(num(row.min_stock)) })}</p>
              </div>
              <StatusBadge size="sm" tone="warning" icon={TriangleAlert} label={t('enums.stockStatus.low_stock')} />
            </Row>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function ExpiringCard({ items, days }: { items: ExpiringProduct[]; days: number }) {
  const t = useT();
  const format = useFormat();
  const localize = useLocalize();
  return (
    <Card className="flex flex-col gap-3">
      <SectionHeader
        icon={CalendarClock}
        title={t('dashboard.expiring.title')}
        description={t('dashboard.expiring.subtitle', { days })}
        action={items.length > 0 ? <ViewAll to="/inventory?status=expiring" label={t('dashboard.expiring.viewAll')} /> : undefined}
      />
      {items.length === 0 ? (
        <EmptyState compact icon={CircleCheck} title={t('dashboard.expiring.empty')} />
      ) : (
        <ul className="-mx-2 flex flex-col">
          {items.map(({ product, days: left }) => (
            <Row key={product.id} to={`/products/${product.id}`}>
              <ProductImage product={product} className="h-10 w-10 shrink-0" iconSize={18} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-fg">{localize(product.name)}</p>
                <p className="type-caption text-fg-subtle tnum">{format.quantity(product.stock)} · {product.expiryDate ? format.date(`${product.expiryDate}T00:00:00`) : ''}</p>
              </div>
              <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold', left < 0 ? 'bg-danger-soft text-danger-text' : 'bg-warning-soft text-warning-text')}>
                {left < 0 ? t('dashboard.expiring.expired') : left === 0 ? t('dashboard.expiring.today') : t('dashboard.expiring.inDays', { count: left })}
              </span>
            </Row>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function RecentSalesCard({ sales }: { sales: Sale[] }) {
  const t = useT();
  const format = useFormat();
  return (
    <Card className="flex flex-col gap-3">
      <SectionHeader icon={ReceiptText} title={t('dashboard.recent.title')} action={<ViewAll to="/sales" label={t('dashboard.recent.viewAll')} />} />
      {sales.length === 0 ? (
        <EmptyState compact icon={ReceiptText} title={t('dashboard.recent.empty')} />
      ) : (
        <ul className="-mx-2 flex flex-col">
          {sales.map((sale) => (
            <Row key={sale.id} to={`/sales/${sale.id}`}>
              <div className="min-w-0 flex-1">
                <p className="font-mono text-[0.84rem] font-semibold text-fg">{sale.invoiceNo}</p>
                <p className="type-caption truncate text-fg-subtle">
                  {format.time(sale.createdAt)} · {sale.customerId ? sale.customerName : t('common.labels.walkIn')}
                </p>
              </div>
              <PaymentSummaryBadge size="sm" summary={sale.paymentSummary} />
              <div className="flex w-28 shrink-0 flex-col items-end">
                <span className={cn('font-semibold tnum', sale.status === 'cancelled' ? 'text-fg-subtle line-through' : 'text-fg')}>{format.money(sale.grandTotal)}</span>
                {sale.status !== 'completed' && <SaleStatusBadge size="sm" status={sale.status} />}
              </div>
            </Row>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function CountersCard({ counters, canManage }: { counters: Counter[]; canManage: boolean }) {
  const t = useT();
  const format = useFormat();
  const localize = useLocalize();
  const total = counters.reduce((sum, counter) => sum + (counter.shiftId ? counter.currentCash : 0), 0);
  return (
    <Card className="flex flex-col gap-3">
      <SectionHeader
        icon={Monitor}
        title={t('dashboard.shifts.title')}
        description={counters.some((counter) => counter.shiftId) ? t('dashboard.shifts.total', { amount: format.money(total) }) : t('dashboard.shifts.subtitle')}
        action={<ViewAll to={canManage ? '/counters' : '/shift/history'} label={canManage ? t('dashboard.shifts.manage') : t('dashboard.shifts.history')} />}
      />
      {counters.length === 0 ? (
        <EmptyState compact icon={Monitor} title={t('dashboard.shifts.empty')} />
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {counters.map((counter) => (
            <li key={counter.id} className={cn('rounded-lg border p-3', counter.shiftId ? 'border-success/40 bg-success-soft/40' : 'border-border bg-surface-2')}>
              <div className="flex items-center justify-between gap-2">
                <p className="font-semibold text-fg">{localize(counter.name)}</p>
                <span className={cn('h-2.5 w-2.5 rounded-full', counter.shiftId ? 'bg-success' : counter.status === 'maintenance' ? 'bg-warning' : 'bg-fg-subtle')} aria-hidden />
              </div>
              {counter.shiftId ? (
                <>
                  <p className="type-caption mt-0.5 truncate text-fg-muted">
                    {counter.shiftNo} · {counter.assignedUserName ?? ''}
                  </p>
                  <p className="mt-1.5 flex items-center gap-1.5 text-sm">
                    <Wallet size={14} aria-hidden className="text-fg-subtle" />
                    <span className="text-fg-muted">{t('dashboard.shifts.expected')}</span>
                    <span className="ms-auto font-bold text-fg tnum">{format.money(counter.currentCash)}</span>
                  </p>
                </>
              ) : (
                <p className="type-caption mt-0.5 text-fg-subtle">{counter.status === 'maintenance' ? t('enums.counterStatus.maintenance') : t('dashboard.shifts.noShift')}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

interface QuickAction {
  key: string;
  icon: LucideIcon;
  label: string;
  hint: string;
  to: string;
  primary?: boolean;
}

export function QuickActions({ actions }: { actions: QuickAction[] }) {
  const t = useT();
  const navigate = useNavigate();
  if (actions.length === 0) return null;
  return (
    <section aria-label={t('dashboard.quick.title')} className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
      {actions.map((action) => (
        <button
          key={action.key}
          type="button"
          onClick={() => navigate(action.to)}
          className={cn(
            'group flex min-h-20 items-center gap-3 rounded-xl border p-4 text-start transition-base',
            action.primary ? 'border-primary bg-primary text-primary-fg hover:brightness-105' : 'border-border bg-surface hover:border-border-strong hover:bg-surface-2',
          )}
        >
          <span className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-lg', action.primary ? 'bg-black/15' : 'bg-primary-soft text-primary-soft-fg')}>
            <action.icon size={21} aria-hidden />
          </span>
          <span className="min-w-0">
            <span className="block font-semibold">{action.label}</span>
            <span className={cn('type-caption block truncate', action.primary ? 'opacity-85' : 'text-fg-subtle')}>{action.hint}</span>
          </span>
        </button>
      ))}
    </section>
  );
}
