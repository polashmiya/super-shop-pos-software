import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { BadgePercent, CircleCheck, CircleSlash, Download, FilterX, Package, PackagePlus, PackageSearch, PackageX, Plus, Power, PowerOff, Star, TriangleAlert } from 'lucide-react';
import { comboMatches } from '@/app/shortcuts';
import { useFormat } from '@/hooks/useFormat';
import { useLanguage, useLocalize, useT } from '@/i18n';
import { dataService } from '@/services/dataService';
import { useCan } from '@/stores/authStore';
import { useCatalogStore } from '@/stores/catalogStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { toast } from '@/stores/uiStore';
import type { Product, ProductStatus } from '@/types';
import { exportFileName } from '@/utils/csv';
import { Button } from '@/components/ui/Button';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Badge, PageHeader, StatCard, StatusBadge } from '@/components/ui/Display';
import { EmptyState } from '@/components/ui/States';
import { ProductImage } from '@/components/product/ProductImage';
import { stockStatusBadge } from '@/components/product/stockStatus';
import { CatalogNav } from '@/features/catalog/CatalogNav';
import { changeProductStatus } from '@/features/catalog/catalogActions';
import { ProductFilters } from '@/features/catalog/ProductFilters';
import { ProductRowActions } from '@/features/catalog/ProductRowActions';
import { filtersFromParams, hasActiveFilters, useProductListStore, type ProductListFilters } from '@/features/catalog/productListStore';
import { filterProducts, productKpis, productsCsv, sortProducts, stockLevel } from '@/features/catalog/productQueries';

/* ==========================================================================
   Products — the catalogue list (spec: product management). All products
   are in memory, so search, filters, sorting and paging are instant.
   ========================================================================== */

export default function ProductsPage() {
  const t = useT();
  const format = useFormat();
  const localize = useLocalize();
  const language = useLanguage();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const canManage = useCan('products.manage');
  const catalogStatus = useCatalogStore((state) => state.status);
  const products = useCatalogStore((state) => state.products);
  const byId = useCatalogStore((state) => state.byId);
  const haystacks = useCatalogStore((state) => state.haystacks);
  const categoryById = useCatalogStore((state) => state.categoryById);
  const brandById = useCatalogStore((state) => state.brandById);
  const unitById = useCatalogStore((state) => state.unitById);
  const expiringDays = useSettingsStore((state) => state.business.inventory.expiryAlertDays);
  const focusCombo = useSettingsStore((state) => state.device.shortcuts.focusSearch);
  const filters = useProductListStore((state) => state.filters);
  const sort = useProductListStore((state) => state.sort);
  const page = useProductListStore((state) => state.page);
  const pageSize = useProductListStore((state) => state.pageSize);
  const setFilters = useProductListStore((state) => state.setFilters);
  const resetFilters = useProductListStore((state) => state.resetFilters);
  const setSort = useProductListStore((state) => state.setSort);
  const setPage = useProductListStore((state) => state.setPage);
  const setPageSize = useProductListStore((state) => state.setPageSize);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [exporting, setExporting] = useState(false);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const deferredFilters = useDeferredValue(filters);

  // Filters passed in the URL (links from categories, brands, dashboards) replace the current ones once.
  useEffect(() => {
    const patch = filtersFromParams(searchParams);
    if (!patch) return;
    useProductListStore.getState().resetFilters(patch);
    setSearchParams({}, { replace: true });
  }, [searchParams, setSearchParams]);

  // The "focus search" shortcut (Ctrl+F by default) jumps to the search box.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!comboMatches(event, focusCombo) || document.querySelector('[data-modal-root]')) return;
      event.preventDefault();
      searchRef.current?.focus();
      searchRef.current?.select();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [focusCombo]);

  const sortContext = useMemo(() => ({ language, categoryById, brandById }), [language, categoryById, brandById]);
  const filtered = useMemo(() => filterProducts(products, haystacks, deferredFilters, expiringDays), [products, haystacks, deferredFilters, expiringDays]);
  const rows = useMemo(() => {
    if (sort) return sortProducts(filtered, sort, sortContext);
    // While searching keep the relevance order; otherwise list alphabetically.
    return deferredFilters.query.trim() ? filtered : sortProducts(filtered, { key: 'name', direction: 'asc' }, sortContext);
  }, [filtered, sort, sortContext, deferredFilters.query]);
  const kpis = useMemo(() => productKpis(products, expiringDays), [products, expiringDays]);

  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  const currentPage = Math.min(page, pages);
  const pageRows = rows.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const loading = catalogStatus !== 'ready' && products.length === 0;
  const filtering = hasActiveFilters(filters);

  const updateFilters = (patch: Partial<ProductListFilters>) => {
    setFilters(patch);
    setSelected(new Set());
  };
  const applyQuickFilter = (patch?: Partial<ProductListFilters>) => {
    resetFilters(patch);
    setSelected(new Set());
  };

  const bulkStatus = async (ids: string[], status: ProductStatus) => {
    const list = ids.map((id) => byId.get(id)).filter((product): product is Product => Boolean(product));
    if (await changeProductStatus(list, status)) setSelected(new Set());
  };

  const exportCsv = async () => {
    setExporting(true);
    try {
      const csv = productsCsv(rows, { t, language, categoryById, brandById, unitById });
      const result = await dataService.saveFile(exportFileName(t('catalog.products.export.fileName'), 'csv'), csv, 'csv');
      if (result.ok) toast.success({ key: 'catalog.products.export.done', params: { count: rows.length } });
      else if (result.reason !== 'cancelled') toast.error('catalog.products.export.failed');
    } catch (error) {
      toast.fromError(error);
    } finally {
      setExporting(false);
    }
  };

  const columns = useMemo<Array<Column<Product>>>(
    () => [
      {
        key: 'name',
        sortKey: 'name',
        header: t('catalog.products.columns.product'),
        cell: (row) => (
          <div className="flex max-w-[24rem] min-w-[14rem] items-center gap-3">
            <ProductImage product={row} className="h-11 w-11 shrink-0" iconSize={20} />
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 font-medium text-fg">
                <span className="truncate">{localize(row.name)}</span>
                {row.featured && (
                  <>
                    <Star size={13} aria-hidden className="shrink-0 fill-current text-warning" />
                    <span className="sr-only">{t('catalog.products.featured')}</span>
                  </>
                )}
              </p>
              <p className="type-caption truncate text-fg-subtle">{language === 'bn' ? row.name.en : row.name.bn}</p>
              <p className="font-mono text-[0.72rem] text-fg-subtle">{row.sku}</p>
            </div>
          </div>
        ),
      },
      { key: 'barcode', sortKey: 'barcode', hideable: true, header: t('catalog.products.columns.barcode'), cell: (row) => <span className="font-mono text-[0.82rem] text-fg-muted">{row.barcode}</span> },
      {
        key: 'category',
        sortKey: 'category',
        hideable: true,
        header: t('catalog.products.columns.category'),
        cell: (row) => {
          const sub = row.subcategoryId ? categoryById.get(row.subcategoryId) : undefined;
          return (
            <div className="max-w-[11rem] min-w-0">
              <p className="truncate">{localize(categoryById.get(row.categoryId)?.name) || '—'}</p>
              {sub && <p className="type-caption truncate text-fg-subtle">{localize(sub.name)}</p>}
            </div>
          );
        },
      },
      {
        key: 'brand',
        sortKey: 'brand',
        hideable: true,
        header: t('catalog.products.columns.brand'),
        cell: (row) => <span className="block max-w-[9rem] truncate text-fg-muted">{row.brandId ? localize(brandById.get(row.brandId)?.name) : '—'}</span>,
      },
      {
        key: 'price',
        sortKey: 'price',
        align: 'end',
        header: t('catalog.products.columns.price'),
        cell: (row) => (
          <div className="flex flex-col items-end gap-0.5">
            <span className="font-semibold whitespace-nowrap">{format.money(row.sellingPrice)}</span>
            {row.discount ? (
              <Badge size="sm" tone="danger" icon={BadgePercent}>
                {row.discount.type === 'percent' ? format.percent(row.discount.value) : format.money(row.discount.value)}
              </Badge>
            ) : row.mrp !== null && row.mrp > row.sellingPrice ? (
              <span className="text-[0.74rem] whitespace-nowrap text-fg-subtle line-through">{format.money(row.mrp)}</span>
            ) : null}
          </div>
        ),
      },
      { key: 'cost', sortKey: 'cost', align: 'end', hideable: true, defaultHidden: true, header: t('catalog.products.columns.cost'), cell: (row) => <span className="whitespace-nowrap text-fg-muted">{format.money(row.purchasePrice)}</span> },
      { key: 'vat', sortKey: 'vat', align: 'end', hideable: true, defaultHidden: true, header: t('catalog.products.columns.vat'), cell: (row) => <span className="text-fg-muted">{format.percent(row.taxRate)}</span> },
      {
        key: 'stock',
        sortKey: 'stock',
        align: 'end',
        header: t('catalog.products.columns.stock'),
        cell: (row) => {
          const level = stockLevel(row, expiringDays);
          const badge = stockStatusBadge(level);
          const unit = unitById.get(row.unitId);
          return (
            <div className="flex flex-col items-end gap-1">
              <span className="font-semibold whitespace-nowrap">{format.quantity(row.stock, unit ? localize(unit.short) : undefined)}</span>
              <StatusBadge size="sm" tone={badge.tone} icon={badge.icon} label={t(`enums.stockStatus.${level}`)} />
            </div>
          );
        },
      },
      {
        key: 'status',
        sortKey: 'status',
        hideable: true,
        header: t('catalog.products.columns.status'),
        cell: (row) =>
          row.status === 'active' ? (
            <StatusBadge size="sm" tone="success" icon={CircleCheck} label={t('enums.productStatus.active')} />
          ) : (
            <StatusBadge size="sm" tone="neutral" icon={CircleSlash} label={t('enums.productStatus.inactive')} />
          ),
      },
      { key: 'actions', header: <span className="sr-only">{t('catalog.products.columns.actions')}</span>, width: '3.5rem', align: 'end', cell: (row) => <ProductRowActions product={row} /> },
    ],
    [t, format, localize, language, categoryById, brandById, unitById, expiringDays],
  );

  const empty =
    products.length === 0 ? (
      <EmptyState
        icon={PackagePlus}
        title={t('catalog.products.empty.title')}
        description={t('catalog.products.empty.description')}
        action={
          canManage ? (
            <Button variant="primary" icon={Plus} onClick={() => navigate('/products/new')}>
              {t('catalog.products.add')}
            </Button>
          ) : undefined
        }
      />
    ) : (
      <EmptyState
        icon={PackageSearch}
        title={t('catalog.products.empty.filteredTitle')}
        description={t('catalog.products.empty.filteredDescription')}
        action={
          <>
            {filtering && (
              <Button icon={FilterX} onClick={() => applyQuickFilter()}>
                {t('common.actions.clearFilters')}
              </Button>
            )}
            {canManage && (
              <Button variant="primary" icon={Plus} onClick={() => navigate('/products/new')}>
                {t('catalog.products.add')}
              </Button>
            )}
          </>
        }
      />
    );

  const kpiValue = (value: number) => (loading ? '—' : format.integer(value));

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        icon={Package}
        title={t('catalog.products.title')}
        actions={
          <>
            <Button icon={Download} loading={exporting} disabled={rows.length === 0} onClick={() => void exportCsv()}>
              {t('common.actions.exportCsv')}
            </Button>
            {canManage && (
              <Button variant="primary" icon={Plus} onClick={() => navigate('/products/new')}>
                {t('catalog.products.add')}
              </Button>
            )}
          </>
        }
      >
        <CatalogNav />
      </PageHeader>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-6">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label={t('catalog.products.kpi.total')} value={kpiValue(kpis.total)} icon={Package} tone="primary" hint={t('catalog.products.kpi.totalHint', { count: format.integer(kpis.inactive) })} onClick={() => applyQuickFilter()} />
          <StatCard label={t('catalog.products.kpi.active')} value={kpiValue(kpis.active)} icon={CircleCheck} tone="success" hint={t('catalog.products.kpi.activeHint')} onClick={() => applyQuickFilter({ status: 'active' })} />
          <StatCard label={t('catalog.products.kpi.lowStock')} value={kpiValue(kpis.lowStock)} icon={TriangleAlert} tone="warning" hint={t('catalog.products.kpi.lowStockHint')} onClick={() => applyQuickFilter({ status: 'active', stock: 'low_stock' })} />
          <StatCard label={t('catalog.products.kpi.outOfStock')} value={kpiValue(kpis.outOfStock)} icon={PackageX} tone="danger" hint={t('catalog.products.kpi.outOfStockHint')} onClick={() => applyQuickFilter({ status: 'active', stock: 'out_of_stock' })} />
        </div>

        <DataTable
          ariaLabel={t('catalog.products.tableLabel')}
          columns={columns}
          rows={pageRows}
          rowKey={(row) => row.id}
          loading={loading}
          empty={empty}
          sort={sort}
          onSortChange={setSort}
          selection={canManage ? { selected, onChange: setSelected } : undefined}
          bulkActions={
            canManage
              ? (ids) => (
                  <>
                    <Button size="sm" icon={Power} onClick={() => void bulkStatus(ids, 'active')}>
                      {t('common.actions.activate')}
                    </Button>
                    <Button size="sm" icon={PowerOff} onClick={() => void bulkStatus(ids, 'inactive')}>
                      {t('common.actions.deactivate')}
                    </Button>
                  </>
                )
              : undefined
          }
          onRowClick={(row) => navigate(`/products/${row.id}`)}
          toolbar={<ProductFilters filters={filters} onChange={updateFilters} onClear={() => applyQuickFilter()} searchRef={searchRef} />}
          pagination={{ page: currentPage, pageSize, total: rows.length, onPageChange: setPage, onPageSizeChange: setPageSize }}
          columnsKey="products"
          className="min-h-[30rem] flex-1"
        />
      </div>
    </div>
  );
}
