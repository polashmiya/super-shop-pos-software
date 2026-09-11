import { Link } from 'react-router';
import { EllipsisVertical, Link2, MonitorCheck, Pencil, Power, Printer, UserRound, Wallet } from 'lucide-react';
import { useFormat } from '@/hooks/useFormat';
import { useLanguage, useT } from '@/i18n';
import type { PrinterSettings } from '@/types';
import { Button } from '@/components/ui/Button';
import { Badge, Card } from '@/components/ui/Display';
import { IconButton } from '@/components/ui/IconButton';
import { DropdownMenu, type MenuItem } from '@/components/ui/Menu';
import { cn } from '@/components/ui/cn';
import { CounterStatusBadge } from './CashBadges';
import { counterName } from './cashMeta';
import type { CounterOverview } from './shiftData';

interface CounterCardProps {
  overview: CounterOverview;
  isTerminal: boolean;
  canManage: boolean;
  printer: PrinterSettings;
  onEdit: () => void;
  onToggle: () => void;
  onUseHere: () => void;
}

/** A checkout counter: status, current shift and cashier, drawer cash, today's sales and printer. */
export function CounterCard({ overview, isTerminal, canManage, printer, onEdit, onToggle, onUseHere }: CounterCardProps) {
  const t = useT();
  const format = useFormat();
  const language = useLanguage();
  const { counter, todaySales, todayOrders } = overview;
  const name = counterName(counter, language);
  const otherName = language === 'bn' ? counter.name.en : counter.name.bn;
  const maintenance = counter.status === 'maintenance';

  const items: MenuItem[] = [
    { key: 'edit', label: t('common.actions.edit'), icon: Pencil, onSelect: onEdit, disabled: !canManage },
    { key: 'toggle', label: maintenance ? t('common.actions.activate') : t('common.actions.deactivate'), icon: Power, onSelect: onToggle, disabled: !canManage, danger: !maintenance },
    { key: 'use', label: t('cash.counters.useHere'), icon: Link2, onSelect: onUseHere, disabled: isTerminal },
  ];

  return (
    <Card className={cn('flex flex-col gap-4', isTerminal && 'ring-2 ring-primary/40', maintenance && 'opacity-90')}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex h-11 min-w-11 shrink-0 items-center justify-center rounded-lg bg-surface-3 px-2 font-mono text-sm font-bold text-fg">{counter.code}</span>
          <div className="min-w-0">
            <h3 className="type-h3 truncate text-fg">{name}</h3>
            {otherName && otherName !== name && <p className="type-caption truncate text-fg-subtle">{otherName}</p>}
          </div>
        </div>
        <DropdownMenu items={items} width={250} trigger={(props) => <IconButton {...props} icon={EllipsisVertical} label={t('cash.counters.menu', { name })} tooltipSide="left" />} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <CounterStatusBadge status={counter.status} size="sm" />
        {isTerminal && (
          <Badge tone="primary" icon={MonitorCheck} size="sm">
            {t('cash.common.thisTerminal')}
          </Badge>
        )}
      </div>

      <div className="rounded-lg border border-border bg-surface-2 p-3">
        <p className="type-caption text-fg-subtle">{t('cash.counters.currentShift')}</p>
        {counter.shiftId ? (
          <div className="mt-1 flex flex-col gap-1.5">
            <Link to={`/shift/${counter.shiftId}`} className="self-start font-mono text-sm font-semibold text-primary-soft-fg hover:underline">
              {counter.shiftNo}
            </Link>
            <p className="flex items-center gap-1.5 text-sm text-fg">
              <UserRound size={15} aria-hidden className="text-fg-muted" />
              <span className="truncate">{counter.assignedUserName ?? '—'}</span>
            </p>
            <div className="flex items-center justify-between gap-2 border-t border-border pt-1.5">
              <span className="flex items-center gap-1.5 text-sm text-fg-muted">
                <Wallet size={15} aria-hidden />
                {t('cash.counters.expected')}
              </span>
              <span className="font-bold text-fg tnum">{format.money(counter.currentCash)}</span>
            </div>
          </div>
        ) : (
          <p className="mt-1 text-sm text-fg-muted">{t('cash.counters.noShift')}</p>
        )}
      </div>

      <dl className="flex flex-col gap-2 text-sm">
        <div className="flex items-center justify-between gap-2">
          <dt className="text-fg-muted">{t('cash.counters.today')}</dt>
          <dd className="font-semibold text-fg tnum">{t('cash.counters.todaySales', { amount: format.money(todaySales), count: todayOrders })}</dd>
        </div>
        <div className="flex items-start justify-between gap-2">
          <dt className="flex items-center gap-1.5 text-fg-muted">
            <Printer size={15} aria-hidden />
            {t('cash.counters.printer')}
          </dt>
          <dd className="min-w-0 text-end text-fg">
            {isTerminal ? (
              <>
                <span className="block truncate">{printer.receiptPrinter || t('cash.counters.defaultPrinter')}</span>
                <span className="type-caption text-fg-subtle">{t('cash.counters.paper', { paper: t(`enums.paperWidth.${printer.paperWidth}`) })}</span>
              </>
            ) : (
              <span className="type-caption block max-w-56 text-fg-subtle">{t('cash.counters.otherTerminal')}</span>
            )}
          </dd>
        </div>
      </dl>

      {canManage && (
        <div className="mt-auto flex flex-wrap gap-2 border-t border-border pt-3">
          <Button size="md" variant="secondary" icon={Pencil} onClick={onEdit}>
            {t('common.actions.edit')}
          </Button>
          {!isTerminal && (
            <Button size="md" variant="ghost" icon={Link2} onClick={onUseHere}>
              {t('cash.counters.useHere')}
            </Button>
          )}
        </div>
      )}
    </Card>
  );
}
