import { useDeferredValue, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { CircleCheck, CircleSlash, Pencil, Plus, SearchX, Tags, X } from 'lucide-react';
import { matchesTokens, normalizeSearch, tokenize } from '@/domain/text';
import { useFormat } from '@/hooks/useFormat';
import { useLanguage, useLocalize, useT } from '@/i18n';
import { useCan } from '@/stores/authStore';
import { useCatalogStore } from '@/stores/catalogStore';
import type { Brand } from '@/types';
import { Button } from '@/components/ui/Button';
import { SearchInput } from '@/components/ui/Controls';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Avatar, PageHeader, StatusBadge } from '@/components/ui/Display';
import { IconButton } from '@/components/ui/IconButton';
import { EmptyState } from '@/components/ui/States';
import { BrandEditorModal } from '@/features/catalog/BrandEditorModal';
import { CatalogNav } from '@/features/catalog/CatalogNav';
import { countBy } from '@/features/catalog/catalogUtils';

/* ==========================================================================
   Brands: searchable, sortable list with product counts and status.
   Add / edit through BrandEditorModal (the catalogue reloads after saving).
   ========================================================================== */

export default function BrandsPage() {
  const t = useT();
  const format = useFormat();
  const localize = useLocalize();
  const language = useLanguage();
  const navigate = useNavigate();
  const canManage = useCan('products.manage');
  const brands = useCatalogStore((state) => state.brands);
  const products = useCatalogStore((state) => state.products);
  const catalogStatus = useCatalogStore((state) => state.status);
  const [query, setQuery] = useState('');
  /** undefined = editor closed, null = new brand. */
  const [editing, setEditing] = useState<Brand | null | undefined>(undefined);
  const deferredQuery = useDeferredValue(query);

  const counts = useMemo(() => countBy(products, (product) => product.brandId), [products]);
  const rows = useMemo(() => {
    const tokens = tokenize(deferredQuery);
    const list = tokens.length === 0 ? [...brands] : brands.filter((brand) => matchesTokens(normalizeSearch(`${brand.name.bn} ${brand.name.en} ${brand.code}`), tokens));
    const collator = new Intl.Collator(language === 'bn' ? 'bn' : 'en', { sensitivity: 'base', numeric: true });
    return list.sort((a, b) => collator.compare(localize(a.name), localize(b.name)));
  }, [brands, deferredQuery, language, localize]);

  const loading = catalogStatus !== 'ready' && brands.length === 0;
  const productsLink = (brand: Brand) => `/products?brand=${brand.id}`;

  const columns: Array<Column<Brand>> = [
    {
      key: 'brand',
      header: t('catalog.brands.columns.brand'),
      sortValue: (row) => localize(row.name),
      cell: (row) => (
        <div className="flex max-w-[26rem] min-w-[14rem] items-center gap-3">
          <Avatar name={row.name.en || row.name.bn} color={row.color} size={36} />
          <div className="min-w-0">
            <p className="truncate font-medium text-fg">{localize(row.name)}</p>
            <p className="type-caption truncate text-fg-subtle">{language === 'bn' ? row.name.en : row.name.bn}</p>
          </div>
        </div>
      ),
    },
    { key: 'code', header: t('catalog.brands.columns.code'), sortValue: (row) => row.code, cell: (row) => <span className="font-mono text-[0.82rem] text-fg-muted">{row.code}</span> },
    {
      key: 'products',
      header: t('catalog.brands.columns.products'),
      align: 'end',
      sortValue: (row) => counts.get(row.id) ?? 0,
      cell: (row) => (
        <Link
          to={productsLink(row)}
          aria-label={t('catalog.brands.viewProducts', { name: localize(row.name) })}
          onClick={(event) => event.stopPropagation()}
          className="rounded-sm font-semibold text-primary-soft-fg hover:underline"
        >
          {format.integer(counts.get(row.id) ?? 0)}
        </Link>
      ),
    },
    {
      key: 'status',
      header: t('catalog.brands.columns.status'),
      sortValue: (row) => (row.isActive ? 0 : 1),
      cell: (row) =>
        row.isActive ? (
          <StatusBadge size="sm" tone="success" icon={CircleCheck} label={t('common.labels.active')} />
        ) : (
          <StatusBadge size="sm" tone="neutral" icon={CircleSlash} label={t('common.labels.inactive')} />
        ),
    },
    {
      key: 'updated',
      header: t('catalog.brands.columns.updated'),
      hideable: true,
      sortValue: (row) => row.updatedAt,
      cell: (row) => <span className="whitespace-nowrap text-fg-muted">{format.date(row.updatedAt)}</span>,
    },
  ];
  if (canManage) {
    columns.push({
      key: 'actions',
      header: <span className="sr-only">{t('common.labels.actions')}</span>,
      width: '4rem',
      align: 'end',
      cell: (row) => (
        <IconButton
          size="sm"
          icon={Pencil}
          label={t('catalog.brands.edit', { name: localize(row.name) })}
          onClick={(event) => {
            event.stopPropagation();
            setEditing(row);
          }}
        />
      ),
    });
  }

  const addButton = canManage ? (
    <Button variant="primary" icon={Plus} onClick={() => setEditing(null)}>
      {t('catalog.brands.add')}
    </Button>
  ) : undefined;

  const empty =
    brands.length === 0 ? (
      <EmptyState icon={Tags} title={t('catalog.brands.empty.title')} description={t('catalog.brands.empty.description')} action={addButton} />
    ) : (
      <EmptyState
        icon={SearchX}
        title={t('catalog.brands.empty.filteredTitle')}
        description={t('common.states.noResultsFor', { query: deferredQuery.trim() })}
        action={
          <Button icon={X} onClick={() => setQuery('')}>
            {t('common.actions.clear')}
          </Button>
        }
      />
    );

  return (
    <div className="flex h-full flex-col">
      <PageHeader icon={Tags} title={t('catalog.brands.title')} actions={addButton}>
        <CatalogNav />
      </PageHeader>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-6">
        <DataTable
          ariaLabel={t('catalog.brands.tableLabel')}
          columns={columns}
          rows={rows}
          rowKey={(row) => row.id}
          loading={loading}
          empty={empty}
          onRowClick={(row) => (canManage ? setEditing(row) : navigate(productsLink(row)))}
          toolbar={
            <div className="max-w-lg min-w-[15rem] flex-[1_1_18rem]">
              <SearchInput value={query} onChange={setQuery} clearLabel={t('common.actions.clear')} placeholder={t('catalog.brands.searchPlaceholder')} aria-label={t('catalog.brands.searchLabel')} />
            </div>
          }
          columnsKey="catalog-brands"
          className="min-h-[24rem] flex-1"
        />
      </div>

      {editing !== undefined && <BrandEditorModal brand={editing} onClose={() => setEditing(undefined)} />}
    </div>
  );
}
