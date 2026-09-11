import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import {
  Activity,
  Barcode,
  Boxes,
  ClipboardList,
  Copy,
  History,
  PackagePlus,
  Pencil,
  Power,
  PowerOff,
  ReceiptText,
  Tag,
  TrendingDown,
  TrendingUp,
  type LucideIcon,
} from 'lucide-react';
import { APP_CONFIG } from '@/config/app.config';
import { useAsync } from '@/hooks/useAsync';
import { useFormat } from '@/hooks/useFormat';
import { useT, type TranslationKey } from '@/i18n';
import type { ProductSaleRow } from '@/repositories/types';
import { productService } from '@/services/catalogService';
import { inventoryService } from '@/services/inventoryService';
import { useCan } from '@/stores/authStore';
import { toast } from '@/stores/uiStore';
import type { AuditLog, PriceHistoryEntry, Product, StockMovement, StockMovementType } from '@/types';
import { Button } from '@/components/ui/Button';
import { Tabs } from '@/components/ui/Controls';
import { Badge, Card, type Tone } from '@/components/ui/Display';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { IconButton } from '@/components/ui/IconButton';
import { EmptyState, ErrorState, SkeletonRows } from '@/components/ui/States';
import { cn } from '@/components/ui/cn';
import { BarcodeImage } from './BarcodeImage';
import { productActivity } from './catalogActions';

/* ==========================================================================
   Product detail history: stock ledger, sales, price changes, barcodes and
   the audit trail. Each tab loads its own data when it is opened.
   ========================================================================== */

type HistoryTab = 'stock' | 'sales' | 'prices' | 'barcodes' | 'activity';

interface HistoryProps {
  product: Product;
  unitShort: string;
}

export function ProductHistory({ product, unitShort }: HistoryProps) {
  const t = useT();
  const [tab, setTab] = useState<HistoryTab>('stock');
  const items: Array<{ value: HistoryTab; label: string; icon: LucideIcon }> = [
    { value: 'stock', label: t('catalog.detail.tabs.stock'), icon: Boxes },
    { value: 'sales', label: t('catalog.detail.tabs.sales'), icon: ReceiptText },
    { value: 'prices', label: t('catalog.detail.tabs.prices'), icon: Tag },
    { value: 'barcodes', label: t('catalog.detail.tabs.barcodes'), icon: Barcode },
    { value: 'activity', label: t('catalog.detail.tabs.activity'), icon: Activity },
  ];
  const current = items.find((item) => item.value === tab) ?? items[0];

  return (
    <Card padded={false} className="overflow-hidden">
      <Tabs value={tab} items={items} onChange={setTab} ariaLabel={t('catalog.detail.tabs.label')} className="px-3 pt-1" />
      <div role="tabpanel" aria-label={current.label} className="p-4">
        {tab === 'stock' && <StockTab product={product} unitShort={unitShort} />}
        {tab === 'sales' && <SalesTab product={product} unitShort={unitShort} />}
        {tab === 'prices' && <PricesTab product={product} />}
        {tab === 'barcodes' && <BarcodesTab product={product} />}
        {tab === 'activity' && <ActivityTab product={product} />}
      </div>
    </Card>
  );
}

function LoadError({ onRetry }: { onRetry: () => void }) {
  const t = useT();
  return (
    <ErrorState
      title={t('errors.loadFailed')}
      action={
        <Button onClick={onRetry} icon={History}>
          {t('common.actions.retry')}
        </Button>
      }
    />
  );
}

/* --------------------------------- Stock ---------------------------------- */

const MOVEMENT_TONES: Record<StockMovementType, Tone> = {
  opening: 'info',
  purchase: 'success',
  sale: 'neutral',
  return: 'success',
  damage: 'danger',
  adjustment: 'warning',
  transfer_in: 'success',
  transfer_out: 'neutral',
  cancel: 'info',
};

function StockTab({ product, unitShort }: HistoryProps) {
  const t = useT();
  const format = useFormat();
  const canViewLedger = useCan('inventory.view');
  const canViewSales = useCan('sales.view');
  const canViewPurchases = useCan('purchases.view');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(APP_CONFIG.tables.defaultPageSize);
  const { data, loading, error, reload } = useAsync(() => inventoryService.movements({ productId: product.id }, { page, pageSize }), [product.id, product.stock, page, pageSize]);

  if (error && !data) return <LoadError onRetry={reload} />;

  const reference = (movement: StockMovement) => {
    const text = movement.referenceNo ?? '—';
    if (movement.referenceId && movement.referenceType === 'sale' && canViewSales) {
      return (
        <Link to={`/sales/${movement.referenceId}`} className="font-mono text-[0.84rem] text-primary-soft-fg hover:underline">
          {text}
        </Link>
      );
    }
    if (movement.referenceId && movement.referenceType === 'purchase' && canViewPurchases) {
      return (
        <Link to={`/purchases/${movement.referenceId}`} className="font-mono text-[0.84rem] text-primary-soft-fg hover:underline">
          {text}
        </Link>
      );
    }
    return <span className="font-mono text-[0.84rem] text-fg-muted">{text}</span>;
  };

  const columns: Array<Column<StockMovement>> = [
    { key: 'date', header: t('common.labels.dateTime'), cell: (row) => <span className="whitespace-nowrap tnum">{format.dateTime(row.createdAt)}</span> },
    { key: 'type', header: t('common.labels.type'), cell: (row) => <Badge tone={MOVEMENT_TONES[row.type]}>{t(`enums.movementType.${row.type}`)}</Badge> },
    { key: 'reference', header: t('catalog.detail.stock.reference'), cell: reference },
    {
      key: 'change',
      header: t('catalog.detail.stock.change'),
      align: 'end',
      cell: (row) => (
        <span className={cn('font-semibold whitespace-nowrap', row.quantity > 0 ? 'text-success-text' : row.quantity < 0 ? 'text-danger-text' : 'text-fg-muted')}>
          {row.quantity > 0 ? '+' : row.quantity < 0 ? '−' : ''}
          {format.quantity(Math.abs(row.quantity), unitShort)}
        </span>
      ),
    },
    { key: 'balance', header: t('catalog.detail.stock.balance'), align: 'end', cell: (row) => <span className="whitespace-nowrap">{format.quantity(row.balanceAfter, unitShort)}</span> },
    { key: 'cost', header: t('catalog.detail.stock.unitCost'), align: 'end', hideable: true, cell: (row) => (row.unitCost > 0 ? format.money(row.unitCost) : '—') },
    { key: 'user', header: t('catalog.detail.stock.by'), hideable: true, cell: (row) => <span className="text-fg-muted">{row.userName ?? '—'}</span> },
    {
      key: 'note',
      header: t('catalog.detail.stock.note'),
      hideable: true,
      cell: (row) => (
        <span className="block max-w-[16rem] truncate text-fg-muted" title={row.note || undefined}>
          {[row.reason ? t(`enums.adjustmentReason.${row.reason}`) : '', row.note].filter(Boolean).join(' · ') || '—'}
        </span>
      ),
    },
  ];

  return (
    <DataTable
      ariaLabel={t('catalog.detail.stock.tableLabel')}
      columns={columns}
      rows={data?.rows ?? []}
      rowKey={(row) => row.id}
      loading={loading && !data}
      columnsKey="product-stock-history"
      toolbar={
        canViewLedger ? (
          <Link to={`/inventory/ledger?product=${product.id}`} className="inline-flex min-h-10 items-center gap-2 rounded-md px-2 text-sm font-medium text-fg-muted hover:bg-surface-3 hover:text-fg">
            <ClipboardList size={16} aria-hidden />
            {t('catalog.detail.stock.openLedger')}
          </Link>
        ) : undefined
      }
      empty={<EmptyState icon={Boxes} compact title={t('catalog.detail.stock.empty')} />}
      pagination={{ page, pageSize, total: data?.total ?? 0, onPageChange: setPage, onPageSizeChange: (size) => {
          setPageSize(size);
          setPage(1);
        } }}
      className="max-h-[36rem]"
    />
  );
}

/* --------------------------------- Sales ---------------------------------- */

const SALES_LIMIT = 200;

function SalesTab({ product, unitShort }: HistoryProps) {
  const t = useT();
  const format = useFormat();
  const canViewSales = useCan('sales.view');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(APP_CONFIG.tables.defaultPageSize);
  const { data, loading, error, reload } = useAsync(() => productService.salesHistory(product.id, SALES_LIMIT), [product.id]);

  if (error && !data) return <LoadError onRetry={reload} />;
  const rows = data ?? [];
  const pageRows = rows.slice((page - 1) * pageSize, page * pageSize);

  const columns: Array<Column<ProductSaleRow>> = [
    {
      key: 'invoice',
      header: t('catalog.detail.sales.invoice'),
      cell: (row) =>
        canViewSales ? (
          <Link to={`/sales/${row.saleId}`} className="font-mono text-[0.84rem] font-medium text-primary-soft-fg hover:underline">
            {row.invoiceNo}
          </Link>
        ) : (
          <span className="font-mono text-[0.84rem]">{row.invoiceNo}</span>
        ),
    },
    { key: 'date', header: t('common.labels.dateTime'), cell: (row) => <span className="whitespace-nowrap tnum">{format.dateTime(row.createdAt)}</span> },
    { key: 'customer', header: t('common.labels.customer'), cell: (row) => <span className="block max-w-[14rem] truncate">{row.customerName || t('common.labels.walkIn')}</span> },
    { key: 'cashier', header: t('common.labels.cashier'), hideable: true, cell: (row) => <span className="text-fg-muted">{row.cashierName}</span> },
    { key: 'qty', header: t('common.labels.quantity'), align: 'end', cell: (row) => format.quantity(row.quantity, unitShort) },
    { key: 'price', header: t('common.labels.unitPrice'), align: 'end', cell: (row) => format.money(row.unitPrice) },
    { key: 'total', header: t('common.labels.total'), align: 'end', cell: (row) => <span className="font-semibold">{format.money(row.lineTotal)}</span> },
  ];

  return (
    <DataTable
      ariaLabel={t('catalog.detail.sales.tableLabel')}
      columns={columns}
      rows={pageRows}
      rowKey={(row) => `${row.saleId}-${row.createdAt}-${row.quantity}-${row.lineTotal}`}
      loading={loading && !data}
      columnsKey="product-sales-history"
      toolbar={rows.length >= SALES_LIMIT ? <span className="type-body-sm px-1 text-fg-muted">{t('catalog.detail.sales.latest', { count: SALES_LIMIT })}</span> : undefined}
      empty={<EmptyState icon={ReceiptText} compact title={t('catalog.detail.sales.empty')} />}
      pagination={rows.length > 0 ? { page, pageSize, total: rows.length, onPageChange: setPage, onPageSizeChange: (size) => {
          setPageSize(size);
          setPage(1);
        } } : undefined}
      className="max-h-[36rem]"
    />
  );
}

/* --------------------------------- Prices --------------------------------- */

function PricesTab({ product }: { product: Product }) {
  const t = useT();
  const format = useFormat();
  const { data, loading, error, reload } = useAsync(() => productService.priceHistory(product.id), [product.id, product.updatedAt]);

  if (error && !data) return <LoadError onRetry={reload} />;
  const money = (value: number | null) => (value === null ? <span className="text-fg-subtle">{t('catalog.detail.prices.notSet')}</span> : format.money(value));

  const columns: Array<Column<PriceHistoryEntry>> = [
    { key: 'date', header: t('common.labels.dateTime'), cell: (row) => <span className="whitespace-nowrap tnum">{format.dateTime(row.changedAt)}</span> },
    { key: 'field', header: t('catalog.detail.prices.field'), cell: (row) => <span className="font-medium">{t(`catalog.detail.prices.fields.${row.field}`)}</span> },
    { key: 'from', header: t('catalog.detail.prices.from'), align: 'end', cell: (row) => <span className="text-fg-muted">{money(row.oldValue)}</span> },
    { key: 'to', header: t('catalog.detail.prices.to'), align: 'end', cell: (row) => <span className="font-semibold">{money(row.newValue)}</span> },
    {
      key: 'change',
      header: t('catalog.detail.prices.change'),
      align: 'end',
      cell: (row) => {
        if (row.oldValue === null || row.newValue === null || row.oldValue === row.newValue) return <span className="text-fg-subtle">—</span>;
        const up = row.newValue > row.oldValue;
        const share = row.oldValue > 0 ? ((row.newValue - row.oldValue) / row.oldValue) * 100 : null;
        return (
          <Badge tone={up ? 'warning' : 'success'} icon={up ? TrendingUp : TrendingDown}>
            {`${up ? '+' : '−'}${format.money(Math.abs(row.newValue - row.oldValue))}${share !== null ? ` (${format.percentValue(Math.abs(share))})` : ''}`}
          </Badge>
        );
      },
    },
    { key: 'by', header: t('catalog.detail.prices.by'), cell: (row) => <span className="text-fg-muted">{row.changedByName ?? '—'}</span> },
    { key: 'reason', header: t('common.labels.reason'), cell: (row) => <span className="block max-w-[18rem] truncate text-fg-muted">{row.reason || '—'}</span> },
  ];

  return (
    <DataTable
      ariaLabel={t('catalog.detail.prices.tableLabel')}
      columns={columns}
      rows={data ?? []}
      rowKey={(row) => row.id}
      loading={loading && !data}
      empty={<EmptyState icon={Tag} compact title={t('catalog.detail.prices.empty')} />}
      className="max-h-[36rem]"
    />
  );
}

/* -------------------------------- Barcodes -------------------------------- */

function BarcodesTab({ product }: { product: Product }) {
  const t = useT();
  const format = useFormat();
  const { data, loading, error, reload } = useAsync(() => productService.barcodes(product.id), [product.id, product.updatedAt]);

  if (error && !data) return <LoadError onRetry={reload} />;
  if (loading && !data) return <SkeletonRows rows={3} />;
  const barcodes = data ?? [];
  if (barcodes.length === 0) return <EmptyState icon={Barcode} compact title={t('catalog.detail.barcodes.empty')} />;

  const copy = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      toast.success('catalog.detail.barcode.copied');
    } catch (reason) {
      toast.fromError(reason);
    }
  };

  return (
    <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {barcodes.map((barcode) => (
        <li key={barcode.id} className="flex flex-col gap-3 rounded-lg border border-border bg-surface-2 p-3">
          <div className="flex items-center justify-between gap-2">
            <Badge tone={barcode.isPrimary ? 'primary' : 'neutral'}>{t(barcode.isPrimary ? 'catalog.detail.barcodes.primary' : 'catalog.detail.barcodes.additional')}</Badge>
            <IconButton icon={Copy} label={t('catalog.detail.barcode.copy')} size="sm" onClick={() => void copy(barcode.barcode)} />
          </div>
          <BarcodeImage value={barcode.barcode} height={52} />
          <p className="type-caption text-fg-subtle">{t('catalog.detail.barcodes.added', { date: format.date(barcode.createdAt) })}</p>
        </li>
      ))}
    </ul>
  );
}

/* -------------------------------- Activity -------------------------------- */

const ACTIVITY_ICONS: Partial<Record<AuditLog['action'], LucideIcon>> = {
  'product.created': PackagePlus,
  'product.updated': Pencil,
  'product.price_changed': Tag,
  'product.activated': Power,
  'product.deactivated': PowerOff,
};

const PRICE_FIELDS = new Set(['selling_price', 'purchase_price', 'mrp']);

function ActivityDetails({ entry }: { entry: AuditLog }) {
  const t = useT();
  const format = useFormat();
  const details = entry.details;
  const lines: string[] = [];
  if (entry.action === 'product.price_changed' && Array.isArray(details.changes)) {
    for (const change of details.changes as Array<Record<string, unknown>>) {
      const field = String(change.field ?? '');
      if (!PRICE_FIELDS.has(field)) continue;
      const from = typeof change.from === 'number' ? format.money(change.from) : t('catalog.detail.prices.notSet');
      const to = typeof change.to === 'number' ? format.money(change.to) : t('catalog.detail.prices.notSet');
      lines.push(`${t(`catalog.detail.prices.fields.${field}` as TranslationKey)}: ${from} → ${to}`);
    }
    if (typeof details.reason === 'string' && details.reason.trim()) lines.push(t('catalog.detail.activity.reason', { reason: details.reason }));
  } else if (typeof details.count === 'number' && details.count > 1) {
    lines.push(t('catalog.detail.activity.bulk', { count: details.count }));
  } else if (typeof details.sku === 'string' && details.sku) {
    lines.push(t('catalog.detail.activity.sku', { sku: details.sku }));
  }
  if (lines.length === 0) return null;
  return (
    <ul className="mt-1 flex flex-col gap-0.5">
      {lines.map((line) => (
        <li key={line} className="type-body-sm text-fg-muted">
          {line}
        </li>
      ))}
    </ul>
  );
}

function ActivityTab({ product }: { product: Product }) {
  const t = useT();
  const format = useFormat();
  const canAudit = useCan('audit.view');
  const navigate = useNavigate();
  const { data, loading, error, reload } = useAsync(() => productActivity(product.id), [product.id, product.updatedAt]);

  if (error && !data) return <LoadError onRetry={reload} />;
  if (loading && !data) return <SkeletonRows rows={4} />;
  const entries = data ?? [];
  if (entries.length === 0) return <EmptyState icon={Activity} compact title={t('catalog.detail.activity.empty')} />;

  return (
    <div className="flex flex-col gap-3">
      <ol className="relative flex flex-col">
        {entries.map((entry, index) => {
          const Icon = ACTIVITY_ICONS[entry.action] ?? History;
          return (
            <li key={entry.id} className="relative flex gap-3 pb-4 last:pb-0">
              {index < entries.length - 1 && <span aria-hidden className="absolute start-[1.1rem] top-10 bottom-0 w-px bg-border" />}
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-3 text-fg-muted ring-4 ring-surface">
                <Icon size={16} aria-hidden />
              </span>
              <div className="min-w-0 flex-1 pt-1">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <p className="font-medium text-fg">{t(`enums.auditAction.${entry.action}`)}</p>
                  <time dateTime={entry.createdAt} title={format.dateTime(entry.createdAt)} className="type-caption text-fg-subtle tnum">
                    {format.dateTime(entry.createdAt)}
                  </time>
                </div>
                <p className="type-body-sm text-fg-subtle">{t('catalog.detail.activity.by', { name: entry.userName ?? t('catalog.detail.activity.system') })}</p>
                <ActivityDetails entry={entry} />
              </div>
            </li>
          );
        })}
      </ol>
      {canAudit && (
        <div>
          <Button variant="ghost" size="sm" icon={History} onClick={() => navigate('/audit')}>
            {t('catalog.detail.activity.openAudit')}
          </Button>
        </div>
      )}
    </div>
  );
}
