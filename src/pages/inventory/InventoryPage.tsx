import { useCallback, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import {
  Boxes,
  CircleCheck,
  CircleSlash,
  CircleX,
  ClipboardList,
  Clock,
  Coins,
  Download,
  EllipsisVertical,
  ExternalLink,
  Layers,
  PackageSearch,
  Printer,
  RefreshCw,
  ShoppingCart,
  SlidersHorizontal,
  Tags,
  TrendingUp,
  TriangleAlert,
  X,
} from 'lucide-react';
import { toLocalDate } from '@/domain/dates';
import { multiplyMoney } from '@/domain/money';
import { getStockStatus } from '@/domain/stock';
import { useAsync } from '@/hooks/useAsync';
import { useFormat } from '@/hooks/useFormat';
import { useLocalize, useT } from '@/i18n';
import { inventoryService } from '@/services/inventoryService';
import { supplierService } from '@/services/peopleService';
import { useCan } from '@/stores/authStore';
import { searchProducts, useCatalogStore } from '@/stores/catalogStore';
import { useSettingsStore } from '@/stores/settingsStore';
import type { Product, StockStatus } from '@/types';
import { csvMoney } from '@/utils/csv';
import { Button } from '@/components/ui/Button';
import { cn } from '@/components/ui/cn';
import { SearchInput, Select } from '@/components/ui/Controls';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { PageHeader, StatCard } from '@/components/ui/Display';
import { IconButton } from '@/components/ui/IconButton';
import { DropdownMenu, type MenuItem } from '@/components/ui/Menu';
import { EmptyState, Skeleton } from '@/components/ui/States';
import { saveCsvExport, previewA4Report } from '@/features/inventory/exportHelpers';
import { FilterChips, ProductCell, ProductStockBadge, type ChipOption } from '@/features/inventory/InventoryBits';
import { STOCK_FILTERS, matchesStockFilter, parseStockFilter, type StockFilter } from '@/features/inventory/inventoryHelpers';
import { StockAdjustDialog } from '@/features/inventory/StockAdjustDialog';
import { useClientTable } from '@/features/inventory/useClientTable';

/* ==========================================================================
   Inventory — stock health KPIs, filters and the stock list of every
   product (in-memory catalogue). Links: ?status=low_stock|out_of_stock|
   expiring presets the filter; ?adjust=<productId> opens the adjustment.
   ========================================================================== */

const STATUS_RANK: Record<StockStatus, number> = { out_of_stock: 0, low_stock: 1, expiring: 2, in_stock: 3, inactive: 4 };

const CHIP_META: Record<StockFilter, Pick<ChipOption<StockFilter>, 'icon' | 'tone'>> = {
  all: { icon: Layers, tone: 'neutral' },
  in_stock: { icon: CircleCheck, tone: 'success' },
  low_stock: { icon: TriangleAlert, tone: 'warning' },
  out_of_stock: { icon: CircleX, tone: 'danger' },
  expiring: { icon: Clock, tone: 'warning' },
  inactive: { icon: CircleSlash, tone: 'neutral' },
};

export default function InventoryPage() {
  const t = useT();
  const localize = useLocalize();
  const format = useFormat();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const canAdjust = useCan('inventory.adjust');
  const canPurchase = useCan('purchases.manage');
  const canViewProducts = useCan('products.view');

  const products = useCatalogStore((state) => state.products);
  const haystacks = useCatalogStore((state) => state.haystacks);
  const categories = useCatalogStore((state) => state.categories);
  const brands = useCatalogStore((state) => state.brands);
  const categoryById = useCatalogStore((state) => state.categoryById);
  const brandById = useCatalogStore((state) => state.brandById);
  const unitById = useCatalogStore((state) => state.unitById);
  const catalogStatus = useCatalogStore((state) => state.status);
  const catalogVersion = useCatalogStore((state) => state.version);
  const expiringDays = useSettingsStore((state) => state.business.inventory.expiryAlertDays);
  const [today] = useState(() => new Date());

  const summary = useAsync(() => inventoryService.summary(), [catalogVersion]);
  const costs = useAsync(() => inventoryService.averageCosts(), [catalogVersion]);
  const suppliers = useAsync(() => supplierService.list(undefined, 'all'), []);

  const statusFilter = parseStockFilter(searchParams.get('status'));
  const adjustId = searchParams.get('adjust');
  const adjustProduct = useCatalogStore((state) => (adjustId ? state.byId.get(adjustId) : undefined));
  const [query, setQuery] = useState('');
  const [categoryId, setCategoryId] = useState('all');
  const [brandId, setBrandId] = useState('all');
  const [supplierId, setSupplierId] = useState('all');

  const updateParam = useCallback(
    (key: string, value: string | null) => {
      setSearchParams(
        (previous) => {
          const next = new URLSearchParams(previous);
          if (value === null) next.delete(key);
          else next.set(key, value);
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );
  const setStatusFilter = (value: StockFilter) => updateParam('status', value === 'all' ? null : value);
  const openAdjust = (productId: string) => updateParam('adjust', productId);
  const closeAdjust = useCallback(() => updateParam('adjust', null), [updateParam]);

  const supplierById = useMemo(() => new Map((suppliers.data ?? []).map((supplier) => [supplier.id, supplier])), [suppliers.data]);
  const costOf = useCallback((product: Product) => costs.data?.get(product.id) ?? product.purchasePrice, [costs.data]);
  const valueOf = useCallback((product: Product) => multiplyMoney(costOf(product), Math.max(0, product.stock)), [costOf]);
  const unitShort = useCallback((product: Product) => {
    const unit = unitById.get(product.unitId);
    return unit ? localize(unit.short) : '';
  }, [unitById, localize]);

  /* ------------------------------ filtering ------------------------------ */

  const searched = useMemo(() => (query.trim() ? searchProducts(products, haystacks, query, { includeInactive: true }) : products), [products, haystacks, query]);
  const scoped = useMemo(
    () =>
      searched.filter(
        (product) =>
          (categoryId === 'all' || product.categoryId === categoryId || product.subcategoryId === categoryId) &&
          (brandId === 'all' || product.brandId === brandId) &&
          (supplierId === 'all' || product.supplierId === supplierId),
      ),
    [searched, categoryId, brandId, supplierId],
  );
  const counts = useMemo(() => {
    const result = {} as Record<StockFilter, number>;
    for (const filter of STOCK_FILTERS) result[filter] = scoped.filter((product) => matchesStockFilter(product, filter, expiringDays, today)).length;
    return result;
  }, [scoped, expiringDays, today]);
  const filtered = useMemo(() => scoped.filter((product) => matchesStockFilter(product, statusFilter, expiringDays, today)), [scoped, statusFilter, expiringDays, today]);

  const sortValue = useCallback(
    (product: Product, key: string): string | number | null => {
      switch (key) {
        case 'name':
          return localize(product.name);
        case 'sku':
          return product.sku;
        case 'category': {
          const category = categoryById.get(product.categoryId);
          return category ? localize(category.name) : '';
        }
        case 'stock':
          return product.stock;
        case 'minStock':
          return product.minStock;
        case 'status':
          return STATUS_RANK[getStockStatus(product, expiringDays, today)];
        case 'cost':
          return costOf(product);
        case 'value':
          return valueOf(product);
        default:
          return null;
      }
    },
    [localize, categoryById, expiringDays, today, costOf, valueOf],
  );

  const filterKey = `${query}|${categoryId}|${brandId}|${supplierId}|${statusFilter}`;
  const table = useClientTable(filtered, sortValue, { key: 'name', direction: 'asc' }, filterKey);
  const hasFilters = query.trim() !== '' || categoryId !== 'all' || brandId !== 'all' || supplierId !== 'all' || statusFilter !== 'all';

  const clearFilters = () => {
    setQuery('');
    setCategoryId('all');
    setBrandId('all');
    setSupplierId('all');
    setStatusFilter('all');
  };

  /* ------------------------------- options ------------------------------- */

  const categoryOptions = useMemo(() => {
    const byOrder = [...categories].sort((a, b) => a.sortOrder - b.sortOrder || localize(a.name).localeCompare(localize(b.name)));
    const roots = byOrder.filter((category) => !category.parentId || !categoryById.has(category.parentId));
    const options = [{ value: 'all', label: t('inventory.filters.allCategories') }];
    for (const root of roots) {
      options.push({ value: root.id, label: localize(root.name) });
      for (const child of byOrder.filter((category) => category.parentId === root.id)) options.push({ value: child.id, label: `— ${localize(child.name)}` });
    }
    return options;
  }, [categories, categoryById, localize, t]);
  const brandOptions = useMemo(
    () => [{ value: 'all', label: t('inventory.filters.allBrands') }, ...[...brands].sort((a, b) => localize(a.name).localeCompare(localize(b.name))).map((brand) => ({ value: brand.id, label: localize(brand.name) }))],
    [brands, localize, t],
  );
  const supplierOptions = useMemo(() => [{ value: 'all', label: t('inventory.filters.allSuppliers') }, ...(suppliers.data ?? []).map((supplier) => ({ value: supplier.id, label: supplier.name }))], [suppliers.data, t]);

  const chipOptions: Array<ChipOption<StockFilter>> = STOCK_FILTERS.map((value) => ({
    value,
    label: value === 'all' ? t('common.labels.all') : t(`enums.stockStatus.${value}`),
    count: counts[value],
    ...CHIP_META[value],
  }));

  /* ------------------------------- actions ------------------------------- */

  const reorderPath = (product: Product) => {
    const params = new URLSearchParams();
    if (product.supplierId) params.set('supplier', product.supplierId);
    params.set('product', product.id);
    return `/purchases/new?${params.toString()}`;
  };

  const describeFilters = (): string => {
    const parts: string[] = [];
    if (statusFilter !== 'all') parts.push(t(`enums.stockStatus.${statusFilter}`));
    if (categoryId !== 'all') parts.push(categoryOptions.find((option) => option.value === categoryId)?.label.replace(/^— /, '') ?? '');
    if (brandId !== 'all') parts.push(brandOptions.find((option) => option.value === brandId)?.label ?? '');
    if (supplierId !== 'all') parts.push(supplierById.get(supplierId)?.name ?? '');
    if (query.trim()) parts.push(`“${query.trim()}”`);
    return parts.filter(Boolean).join(' · ');
  };

  const exportCsv = () => {
    const rows = table.sorted.map((product) => {
      const status = getStockStatus(product, expiringDays, today);
      const category = categoryById.get(product.categoryId);
      const brand = product.brandId ? brandById.get(product.brandId) : undefined;
      return [
        product.sku,
        product.barcode,
        product.name.en,
        product.name.bn,
        category ? localize(category.name) : '',
        brand ? localize(brand.name) : '',
        product.supplierId ? (supplierById.get(product.supplierId)?.name ?? '') : '',
        unitShort(product),
        product.stock,
        product.minStock,
        product.maxStock,
        t(`enums.stockStatus.${status}`),
        csvMoney(costOf(product)),
        csvMoney(valueOf(product)),
        csvMoney(product.sellingPrice),
        product.expiryDate ?? '',
      ];
    });
    void saveCsvExport(
      t('inventory.export.fileName'),
      [
        t('common.labels.sku'),
        t('common.labels.barcode'),
        t('inventory.export.nameEn'),
        t('inventory.export.nameBn'),
        t('common.labels.category'),
        t('common.labels.brand'),
        t('common.labels.supplier'),
        t('common.labels.unit'),
        t('inventory.columns.currentStock'),
        t('inventory.columns.minStock'),
        t('inventory.export.maxStock'),
        t('common.labels.status'),
        t('inventory.columns.avgCost'),
        t('inventory.columns.stockValue'),
        t('inventory.export.sellingPrice'),
        t('inventory.export.expiryDate'),
      ],
      rows,
    );
  };

  const print = () => {
    const rows = table.sorted;
    const totalCost = rows.reduce((sum, product) => sum + valueOf(product), 0);
    const totalRetail = rows.reduce((sum, product) => sum + multiplyMoney(product.sellingPrice, Math.max(0, product.stock)), 0);
    void previewA4Report({
      title: t('inventory.print.title'),
      subtitle: `${describeFilters() || t('inventory.print.allProducts')} · ${format.date(today, 'long')}`,
      kpis: [
        { label: t('inventory.print.products'), value: format.integer(rows.length) },
        { label: t('inventory.kpi.stockValue'), value: format.money(totalCost) },
        { label: t('inventory.kpi.retailValue'), value: format.money(totalRetail) },
        { label: t('inventory.kpi.potentialMargin'), value: format.money(totalRetail - totalCost) },
      ],
      sections: [
        {
          headers: ['#', t('inventory.columns.product'), t('common.labels.sku'), t('common.labels.category'), t('inventory.columns.currentStock'), t('inventory.columns.minStock'), t('common.labels.status'), t('inventory.columns.avgCost'), t('inventory.columns.stockValue')],
          numeric: [true, false, false, false, true, true, false, true, true],
          rows: rows.map((product, index) => {
            const category = categoryById.get(product.categoryId);
            return [
              format.integer(index + 1),
              localize(product.name),
              product.sku,
              category ? localize(category.name) : '—',
              format.quantity(product.stock, unitShort(product)),
              format.quantity(product.minStock),
              t(`enums.stockStatus.${getStockStatus(product, expiringDays, today)}`),
              format.money(costOf(product)),
              format.money(valueOf(product)),
            ];
          }),
          totals: ['', t('common.labels.total'), '', '', '', '', '', '', format.money(totalCost)],
        },
      ],
      landscape: true,
      fileName: `inventory-${toLocalDate(today)}.pdf`,
    });
  };

  /* ------------------------------- columns ------------------------------- */

  const columns: Array<Column<Product>> = [
    {
      key: 'name',
      header: t('inventory.columns.product'),
      sortKey: 'name',
      width: '30%',
      cell: (product) => {
        const unit = unitById.get(product.unitId);
        const brand = product.brandId ? brandById.get(product.brandId) : undefined;
        return (
          <ProductCell
            product={product}
            to={canViewProducts ? `/products/${product.id}` : null}
            meta={[brand ? localize(brand.name) : null, unit ? localize(unit.name) : null].filter(Boolean).join(' · ') || undefined}
          />
        );
      },
    },
    { key: 'sku', header: t('common.labels.sku'), sortKey: 'sku', hideable: true, cell: (product) => <span className="font-mono text-sm text-fg-muted selectable">{product.sku}</span> },
    { key: 'barcode', header: t('common.labels.barcode'), hideable: true, defaultHidden: true, cell: (product) => <span className="font-mono text-sm text-fg-muted selectable">{product.barcode || '—'}</span> },
    {
      key: 'category',
      header: t('common.labels.category'),
      sortKey: 'category',
      hideable: true,
      cell: (product) => {
        const category = categoryById.get(product.categoryId);
        return <span className="text-fg-muted">{category ? localize(category.name) : '—'}</span>;
      },
    },
    {
      key: 'stock',
      header: t('inventory.columns.currentStock'),
      sortKey: 'stock',
      align: 'end',
      cell: (product) => (
        <span className={cn('font-semibold', product.stock <= 0 ? 'text-danger-text' : product.stock <= product.minStock ? 'text-warning-text' : 'text-fg')}>
          {format.quantity(product.stock, unitShort(product))}
        </span>
      ),
    },
    { key: 'minStock', header: t('inventory.columns.minStock'), sortKey: 'minStock', align: 'end', hideable: true, cell: (product) => <span className="text-fg-muted">{format.quantity(product.minStock)}</span> },
    { key: 'status', header: t('common.labels.status'), sortKey: 'status', cell: (product) => <ProductStockBadge product={product} /> },
    { key: 'cost', header: t('inventory.columns.avgCost'), sortKey: 'cost', align: 'end', hideable: true, cell: (product) => <span className="text-fg-muted">{format.money(costOf(product))}</span> },
    { key: 'value', header: t('inventory.columns.stockValue'), sortKey: 'value', align: 'end', cell: (product) => <span className="font-medium">{format.money(valueOf(product))}</span> },
    {
      key: 'actions',
      header: <span className="sr-only">{t('common.labels.actions')}</span>,
      align: 'end',
      width: '7.5rem',
      cell: (product) => {
        const name = localize(product.name);
        const items: MenuItem[] = [];
        if (canAdjust) items.push({ key: 'adjust', label: t('inventory.actions.adjust'), icon: SlidersHorizontal, onSelect: () => openAdjust(product.id) });
        items.push({ key: 'ledger', label: t('inventory.actions.viewLedger'), icon: ClipboardList, onSelect: () => navigate(`/inventory/ledger?product=${product.id}`) });
        if (canPurchase) items.push({ key: 'reorder', label: t('inventory.actions.reorder'), icon: ShoppingCart, onSelect: () => navigate(reorderPath(product)) });
        if (canViewProducts) items.push({ key: 'open', label: t('inventory.actions.openProduct'), icon: ExternalLink, onSelect: () => navigate(`/products/${product.id}`) });
        return (
          <div className="flex items-center justify-end gap-1">
            {canAdjust && <IconButton icon={SlidersHorizontal} label={t('inventory.actions.adjustFor', { name })} tooltipSide="left" onClick={() => openAdjust(product.id)} />}
            <DropdownMenu
              width={230}
              items={items}
              trigger={(props) => <IconButton {...props} icon={EllipsisVertical} label={t('inventory.actions.moreFor', { name })} tooltipSide="left" />}
            />
          </div>
        );
      },
    },
  ];

  /* -------------------------------- render ------------------------------- */

  const data = summary.data;
  const margin = data ? data.retailValue - data.stockValue : 0;
  const catalogLoading = catalogStatus !== 'ready' && products.length === 0;

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        icon={Boxes}
        title={t('inventory.title')}
        description={t('inventory.description')}
        actions={
          <>
            <Button icon={ClipboardList} onClick={() => navigate('/inventory/ledger')}>
              {t('inventory.actions.stockLedger')}
            </Button>
            <Button icon={Download} onClick={exportCsv} disabled={catalogLoading}>
              {t('common.actions.exportCsv')}
            </Button>
            <Button icon={Printer} onClick={print} disabled={catalogLoading}>
              {t('common.actions.print')}
            </Button>
          </>
        }
      />
      <div className="min-h-0 flex-1 overflow-y-auto p-6">
        <div className="flex flex-col gap-5">
          <section aria-label={t('inventory.kpi.title')} className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {!data && summary.error ? (
              <div role="alert" className="col-span-full flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface p-4">
                <span className="type-body flex items-center gap-2 text-fg-muted">
                  <CircleX size={18} aria-hidden className="text-danger-text" />
                  {t('errors.loadFailed')}
                </span>
                <Button icon={RefreshCw} onClick={summary.reload}>
                  {t('common.actions.retry')}
                </Button>
              </div>
            ) : !data ? (
              Array.from({ length: 8 }, (_, index) => <Skeleton key={index} className="h-[6.6rem] rounded-xl" />)
            ) : (
              <>
                <StatCard label={t('inventory.kpi.totalProducts')} value={format.integer(data.totalProducts)} icon={Boxes} tone="primary" hint={t('inventory.kpi.activeHint', { count: format.integer(data.activeProducts) })} onClick={() => setStatusFilter('all')} />
                <StatCard label={t('enums.stockStatus.in_stock')} value={format.integer(data.inStock)} icon={CircleCheck} tone="success" hint={t('inventory.kpi.inStockHint')} onClick={() => setStatusFilter('in_stock')} />
                <StatCard label={t('enums.stockStatus.low_stock')} value={format.integer(data.lowStock)} icon={TriangleAlert} tone="warning" hint={t('inventory.kpi.lowStockHint')} onClick={() => setStatusFilter('low_stock')} />
                <StatCard label={t('enums.stockStatus.out_of_stock')} value={format.integer(data.outOfStock)} icon={CircleX} tone="danger" hint={t('inventory.kpi.outOfStockHint')} onClick={() => setStatusFilter('out_of_stock')} />
                <StatCard label={t('enums.stockStatus.expiring')} value={format.integer(data.expiringSoon)} icon={Clock} tone="warning" hint={t('inventory.kpi.expiringHint', { days: format.integer(expiringDays) })} onClick={() => setStatusFilter('expiring')} />
                <StatCard label={t('inventory.kpi.stockValue')} value={format.money(data.stockValue)} icon={Coins} tone="info" hint={t('inventory.kpi.stockValueHint')} />
                <StatCard label={t('inventory.kpi.retailValue')} value={format.money(data.retailValue)} icon={Tags} tone="primary" hint={t('inventory.kpi.retailValueHint')} />
                <StatCard
                  label={t('inventory.kpi.potentialMargin')}
                  value={format.money(margin)}
                  icon={TrendingUp}
                  tone="success"
                  hint={data.retailValue > 0 ? t('inventory.kpi.marginHint', { rate: format.percentValue((margin / data.retailValue) * 100) }) : undefined}
                />
              </>
            )}
          </section>

          <FilterChips ariaLabel={t('inventory.filters.status')} value={statusFilter} options={chipOptions} onChange={setStatusFilter} />

          <DataTable
            ariaLabel={t('inventory.tableLabel')}
            columns={columns}
            rows={table.rows}
            rowKey={(product) => product.id}
            loading={catalogLoading}
            sort={table.sort}
            onSortChange={table.setSort}
            columnsKey="inventory"
            pagination={{ page: table.page, pageSize: table.pageSize, total: table.total, onPageChange: table.setPage, onPageSizeChange: table.setPageSize }}
            toolbar={
              <>
                <div className="w-full max-w-sm min-w-56 flex-1">
                  <SearchInput value={query} onChange={setQuery} placeholder={t('inventory.filters.search')} aria-label={t('inventory.filters.searchLabel')} clearLabel={t('common.actions.clear')} />
                </div>
                <div className="w-48">
                  <Select aria-label={t('common.labels.category')} value={categoryId} options={categoryOptions} onChange={setCategoryId} />
                </div>
                <div className="w-44">
                  <Select aria-label={t('common.labels.brand')} value={brandId} options={brandOptions} onChange={setBrandId} />
                </div>
                <div className="w-48">
                  <Select aria-label={t('common.labels.supplier')} value={supplierId} options={supplierOptions} onChange={setSupplierId} />
                </div>
                {hasFilters && (
                  <Button variant="ghost" icon={X} onClick={clearFilters}>
                    {t('common.actions.clearFilters')}
                  </Button>
                )}
              </>
            }
            empty={
              products.length === 0 ? (
                <EmptyState icon={Boxes} title={t('inventory.empty.noProducts')} description={t('inventory.empty.noProductsHint')} />
              ) : (
                <EmptyState
                  icon={PackageSearch}
                  title={t('inventory.empty.title')}
                  description={t('inventory.empty.hint')}
                  action={
                    <Button icon={X} onClick={clearFilters}>
                      {t('common.actions.clearFilters')}
                    </Button>
                  }
                />
              )
            }
          />
        </div>
      </div>

      <StockAdjustDialog productId={adjustProduct ? adjustProduct.id : null} onClose={closeAdjust} />
      {adjustProduct === undefined && adjustId && !catalogLoading && <MissingProductNotice onClose={closeAdjust} />}
    </div>
  );
}

/** Shown when ?adjust= points at a product that no longer exists. */
function MissingProductNotice({ onClose }: { onClose: () => void }) {
  const t = useT();
  return (
    <div role="status" className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-lg border border-border bg-surface px-4 py-3 shadow-lg">
      <PackageSearch size={18} aria-hidden className="text-fg-subtle" />
      <span className="type-body-sm text-fg">{t('errors.notFound')}</span>
      <Button size="sm" variant="ghost" onClick={onClose}>
        {t('common.actions.close')}
      </Button>
    </div>
  );
}
