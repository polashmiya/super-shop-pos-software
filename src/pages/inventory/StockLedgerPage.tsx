import { useCallback, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { ClipboardList, Download, ExternalLink, PackageSearch, SlidersHorizontal, X } from 'lucide-react';
import { APP_CONFIG } from '@/config/app.config';
import { useAsync } from '@/hooks/useAsync';
import { useDebouncedValue } from '@/hooks/useCommon';
import { useFormat } from '@/hooks/useFormat';
import { useLocalize, useT } from '@/i18n';
import { inventoryService } from '@/services/inventoryService';
import { useCan } from '@/stores/authStore';
import { useCatalogStore } from '@/stores/catalogStore';
import { toast } from '@/stores/uiStore';
import type { StockMovement, StockMovementFilter, StockMovementType } from '@/types';
import { csvMoney } from '@/utils/csv';
import { Button } from '@/components/ui/Button';
import { SearchInput, Select } from '@/components/ui/Controls';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Card, PageHeader } from '@/components/ui/Display';
import { EmptyState, LoadingBar, Skeleton } from '@/components/ui/States';
import { ProductImage } from '@/components/product/ProductImage';
import { saveCsvExport } from '@/features/inventory/exportHelpers';
import { Figure, MovementTypeBadge, ProductCell, ProductStockBadge, SignedQuantity } from '@/features/inventory/InventoryBits';
import { MOVEMENT_TYPES, movementLink } from '@/features/inventory/inventoryHelpers';
import { PeriodFilter } from '@/features/inventory/PeriodFilter';
import { ProductPicker } from '@/features/inventory/ProductPicker';
import { periodBounds, periodState, type PeriodState } from '@/features/inventory/periods';
import { StockAdjustDialog } from '@/features/inventory/StockAdjustDialog';
import { useResettingPage } from '@/features/inventory/useClientTable';

/* ==========================================================================
   Stock ledger — every stock movement (sale, purchase, return, damage,
   adjustment…) with the running balance. ?product=<id> focuses one product
   and shows its opening / in / out / closing summary for the period.
   ========================================================================== */

export default function StockLedgerPage() {
  const t = useT();
  const localize = useLocalize();
  const format = useFormat();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const canAdjust = useCan('inventory.adjust');
  const canViewSales = useCan('sales.view');
  const canViewPurchases = useCan('purchases.view');
  const canViewProducts = useCan('products.view');

  const productId = searchParams.get('product');
  const product = useCatalogStore((state) => (productId ? state.byId.get(productId) : undefined));
  const byId = useCatalogStore((state) => state.byId);
  const unitById = useCatalogStore((state) => state.unitById);
  const catalogVersion = useCatalogStore((state) => state.version);

  const [type, setType] = useState<StockMovementType | 'all'>('all');
  const [period, setPeriod] = useState<PeriodState>(() => periodState('last_30_days'));
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search.trim(), APP_CONFIG.tables.searchDebounceMs);
  const [pageSize, setPageSize] = useState<number>(APP_CONFIG.tables.defaultPageSize);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  const bounds = periodBounds(period);
  const filter: StockMovementFilter = { productId: productId ?? undefined, type, from: bounds.from, to: bounds.to, search: debouncedSearch || undefined };
  const filterKey = `${JSON.stringify(filter)}|${pageSize}`;
  const [page, setPage] = useResettingPage(filterKey);

  const movements = useAsync(() => inventoryService.movements(filter, { page, pageSize }), [filterKey, page, catalogVersion]);
  const summary = useAsync(() => (productId ? inventoryService.movementSummary(productId, bounds) : Promise.resolve(null)), [productId, bounds.from, bounds.to, catalogVersion]);

  const selectProduct = useCallback(
    (id: string | null) => {
      setSearchParams(
        (previous) => {
          const next = new URLSearchParams(previous);
          if (id) next.set('product', id);
          else next.delete('product');
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const unitShortOf = (id: string): string | undefined => {
    const entry = byId.get(id);
    const unit = entry ? unitById.get(entry.unitId) : undefined;
    return unit ? localize(unit.short) : undefined;
  };

  const referenceText = (movement: StockMovement): string => (movement.referenceNo && movement.referenceNo !== 'OPENING' ? movement.referenceNo : '');

  const exportCsv = async () => {
    setExporting(true);
    try {
      const rows: StockMovement[] = [];
      for (let pageNo = 1; ; pageNo += 1) {
        const result = await inventoryService.movements(filter, { page: pageNo, pageSize: 1_000 });
        rows.push(...result.rows);
        if (result.rows.length === 0 || rows.length >= result.total || rows.length >= APP_CONFIG.reports.maxExportRows) break;
      }
      await saveCsvExport(
        product ? `${t('inventory.ledger.exportName')}-${product.sku}` : t('inventory.ledger.exportName'),
        [
          t('common.labels.date'),
          t('common.labels.time'),
          t('common.labels.sku'),
          t('inventory.columns.product'),
          t('common.labels.type'),
          t('common.labels.quantity'),
          t('inventory.ledger.columns.balance'),
          t('inventory.shared.unitCost'),
          t('common.labels.reference'),
          t('common.labels.reason'),
          t('common.labels.note'),
          t('common.labels.user'),
        ],
        rows.map((movement) => [
          format.date(movement.createdAt, 'short'),
          format.time(movement.createdAt),
          movement.sku,
          localize(movement.productName),
          t(`enums.movementType.${movement.type}`),
          movement.quantity,
          movement.balanceAfter,
          csvMoney(movement.unitCost),
          referenceText(movement),
          movement.reason ? t(`enums.adjustmentReason.${movement.reason}`) : '',
          movement.note,
          movement.userName ?? '',
        ]),
      );
    } catch (error) {
      toast.fromError(error);
    } finally {
      setExporting(false);
    }
  };

  /* ------------------------------- columns ------------------------------- */

  const columns: Array<Column<StockMovement>> = [
    {
      key: 'date',
      header: t('common.labels.dateTime'),
      width: '9.5rem',
      cell: (movement) => (
        <div className="leading-tight">
          <p className="text-fg tnum">{format.date(movement.createdAt)}</p>
          <p className="type-caption text-fg-subtle tnum">{format.time(movement.createdAt)}</p>
        </div>
      ),
    },
    ...(productId
      ? []
      : [
          {
            key: 'product',
            header: t('inventory.columns.product'),
            width: '26%',
            cell: (movement: StockMovement) => {
              const entry = byId.get(movement.productId);
              return (
                <ProductCell
                  size="sm"
                  product={{ name: movement.productName, image: entry?.image ?? null, categoryId: entry?.categoryId ?? '' }}
                  meta={<span className="font-mono">{movement.sku}</span>}
                  onNameClick={() => selectProduct(movement.productId)}
                />
              );
            },
          },
        ]),
    { key: 'type', header: t('common.labels.type'), cell: (movement) => <MovementTypeBadge type={movement.type} /> },
    { key: 'quantity', header: t('common.labels.quantity'), align: 'end', cell: (movement) => <SignedQuantity value={movement.quantity} unit={unitShortOf(movement.productId)} /> },
    { key: 'balance', header: t('inventory.ledger.columns.balance'), align: 'end', cell: (movement) => <span className="font-medium">{format.quantity(movement.balanceAfter)}</span> },
    { key: 'cost', header: t('inventory.shared.unitCost'), align: 'end', hideable: true, cell: (movement) => <span className="text-fg-muted">{movement.unitCost > 0 ? format.money(movement.unitCost) : '—'}</span> },
    {
      key: 'reference',
      header: t('common.labels.reference'),
      cell: (movement) => {
        const text = referenceText(movement);
        if (!text) return <span className="text-fg-subtle">—</span>;
        const link = movementLink(movement);
        const allowed = movement.referenceType === 'sale' ? canViewSales : movement.referenceType === 'purchase' ? canViewPurchases : false;
        return link && allowed ? (
          <Link to={link} className="rounded-sm font-mono text-sm text-primary hover:underline">
            {text}
          </Link>
        ) : (
          <span className="font-mono text-sm text-fg-muted selectable">{text}</span>
        );
      },
    },
    {
      key: 'reason',
      header: t('common.labels.reason'),
      hideable: true,
      cell: (movement) =>
        movement.reason || movement.note ? (
          <div className="max-w-56 min-w-0 leading-tight">
            {movement.reason && <p className="truncate text-fg">{t(`enums.adjustmentReason.${movement.reason}`)}</p>}
            {movement.note && (
              <p className="type-caption truncate text-fg-subtle" title={movement.note}>
                {movement.note}
              </p>
            )}
          </div>
        ) : (
          <span className="text-fg-subtle">—</span>
        ),
    },
    { key: 'user', header: t('common.labels.user'), hideable: true, cell: (movement) => <span className="text-fg-muted">{movement.userName ?? '—'}</span> },
  ];

  const typeOptions = [{ value: 'all' as const, label: t('inventory.ledger.allTypes') }, ...MOVEMENT_TYPES.map((value) => ({ value, label: t(`enums.movementType.${value}`) }))];
  const productUnit = product ? unitShortOf(product.id) : undefined;
  const periodLabel = t(`common.periods.${period.period}`);

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        icon={ClipboardList}
        title={t('inventory.ledger.title')}
        description={t('inventory.ledger.description')}
        breadcrumb={[{ label: t('nav.inventory'), to: '/inventory' }, { label: t('nav.stockLedger') }]}
        actions={
          <Button icon={Download} loading={exporting} onClick={() => void exportCsv()}>
            {t('common.actions.exportCsv')}
          </Button>
        }
      />
      <div className="min-h-0 flex-1 overflow-y-auto p-6">
        <div className="flex flex-col gap-5">
          <Card className="flex flex-wrap items-end gap-3" padded>
            <div className="flex w-full max-w-md min-w-64 flex-1 flex-col gap-1.5">
              <span className="type-label text-fg-muted">{t('inventory.ledger.productFilter')}</span>
              <ProductPicker includeInactive ariaLabel={t('inventory.ledger.productFilter')} placeholder={t('inventory.ledger.productPlaceholder')} onSelect={(picked) => selectProduct(picked.id)} />
            </div>
            <label className="flex w-52 flex-col gap-1.5">
              <span className="type-label text-fg-muted">{t('inventory.ledger.typeFilter')}</span>
              <Select value={type} options={typeOptions} onChange={setType} />
            </label>
            <div className="flex flex-col gap-1.5">
              <span className="type-label text-fg-muted">{t('common.labels.period')}</span>
              <PeriodFilter period={period.period} range={period.range} onChange={(value, range) => setPeriod({ period: value, range })} />
            </div>
          </Card>

          {productId && (
            <Card>
              {product ? (
                <>
                  <div className="flex flex-wrap items-center gap-4">
                    <ProductImage product={product} className="h-16 w-16 shrink-0" iconSize={28} />
                    <div className="min-w-0 flex-1">
                      <p className="type-h2 truncate text-fg">{localize(product.name)}</p>
                      <p className="type-caption truncate text-fg-subtle">
                        <span className="font-mono">{product.sku}</span>
                        {product.barcode ? ` · ${product.barcode}` : ''}
                      </p>
                      <div className="mt-1.5">
                        <ProductStockBadge product={product} />
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {canAdjust && (
                        <Button icon={SlidersHorizontal} onClick={() => setAdjustOpen(true)}>
                          {t('inventory.actions.adjust')}
                        </Button>
                      )}
                      {canViewProducts && (
                        <Button icon={ExternalLink} onClick={() => navigate(`/products/${product.id}`)}>
                          {t('inventory.actions.openProduct')}
                        </Button>
                      )}
                      <Button variant="ghost" icon={X} onClick={() => selectProduct(null)}>
                        {t('inventory.ledger.clearProduct')}
                      </Button>
                    </div>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-4 border-t border-border pt-4 md:grid-cols-5">
                    <Figure label={t('inventory.ledger.summary.current')} value={format.quantity(product.stock, productUnit)} />
                    {summary.data ? (
                      <>
                        <Figure label={t('inventory.ledger.summary.opening')} value={format.quantity(summary.data.opening, productUnit)} hint={periodLabel} />
                        <Figure label={t('inventory.ledger.summary.totalIn')} value={`+${format.quantity(summary.data.totalIn, productUnit)}`} tone="success" />
                        <Figure label={t('inventory.ledger.summary.totalOut')} value={`−${format.quantity(summary.data.totalOut, productUnit)}`} tone="danger" />
                        <Figure
                          label={t('inventory.ledger.summary.closing')}
                          value={format.quantity(summary.data.closing, productUnit)}
                          hint={t('inventory.ledger.summary.movements', { count: summary.data.movementCount })}
                        />
                      </>
                    ) : (
                      Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="h-12" />)
                    )}
                  </div>
                </>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span className="type-body flex items-center gap-2 text-fg-muted">
                    <PackageSearch size={18} aria-hidden />
                    {t('inventory.ledger.productMissing')}
                  </span>
                  <Button variant="ghost" icon={X} onClick={() => selectProduct(null)}>
                    {t('inventory.ledger.clearProduct')}
                  </Button>
                </div>
              )}
            </Card>
          )}

          <div className="relative">
            <LoadingBar active={movements.loading && Boolean(movements.data)} />
            <DataTable
              ariaLabel={t('inventory.ledger.tableLabel')}
              columns={columns}
              rows={movements.data?.rows ?? []}
              rowKey={(movement) => movement.id}
              loading={movements.loading && !movements.data}
              columnsKey="stock-ledger"
              pagination={{ page, pageSize, total: movements.data?.total ?? 0, onPageChange: setPage, onPageSizeChange: setPageSize }}
              toolbar={
                <div className="w-full max-w-sm min-w-56 flex-1">
                  <SearchInput value={search} onChange={setSearch} placeholder={t('inventory.ledger.search')} aria-label={t('inventory.ledger.search')} clearLabel={t('common.actions.clear')} />
                </div>
              }
              empty={
                movements.error ? (
                  <EmptyState
                    icon={ClipboardList}
                    title={t('errors.loadFailed')}
                    action={
                      <Button onClick={movements.reload}>{t('common.actions.retry')}</Button>
                    }
                  />
                ) : (
                  <EmptyState icon={ClipboardList} title={t('inventory.ledger.empty')} description={t('inventory.ledger.emptyHint')} />
                )
              }
            />
          </div>
        </div>
      </div>
      <StockAdjustDialog productId={adjustOpen && product ? product.id : null} onClose={() => setAdjustOpen(false)} />
    </div>
  );
}
