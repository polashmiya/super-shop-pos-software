import { useMemo, useState } from 'react';
import { CircleCheck, CircleSlash, Hash, Pencil, Plus, Ruler, Scale } from 'lucide-react';
import { useFormat } from '@/hooks/useFormat';
import { useLanguage, useLocalize, useT } from '@/i18n';
import { useCan } from '@/stores/authStore';
import { useCatalogStore } from '@/stores/catalogStore';
import type { Unit } from '@/types';
import { Button } from '@/components/ui/Button';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Badge, PageHeader, StatusBadge } from '@/components/ui/Display';
import { IconButton } from '@/components/ui/IconButton';
import { EmptyState } from '@/components/ui/States';
import { CatalogNav } from '@/features/catalog/CatalogNav';
import { UnitEditorModal } from '@/features/catalog/UnitEditorModal';
import { countBy } from '@/features/catalog/catalogUtils';

/* ==========================================================================
   Units (piece, kg, litre…): code, names, short names, whether fractional
   quantities are allowed, display order, product counts and status.
   ========================================================================== */

export default function UnitsPage() {
  const t = useT();
  const format = useFormat();
  const localize = useLocalize();
  const language = useLanguage();
  const canManage = useCan('products.manage');
  const units = useCatalogStore((state) => state.units);
  const products = useCatalogStore((state) => state.products);
  const catalogStatus = useCatalogStore((state) => state.status);
  /** undefined = editor closed, null = new unit. */
  const [editing, setEditing] = useState<Unit | null | undefined>(undefined);

  const counts = useMemo(() => countBy(products, (product) => product.unitId), [products]);
  const rows = useMemo(() => [...units].sort((a, b) => a.sortOrder - b.sortOrder || a.name.en.localeCompare(b.name.en)), [units]);
  const loading = catalogStatus !== 'ready' && units.length === 0;
  const secondary = (text: Unit['name']) => (language === 'bn' ? text.en : text.bn);

  const columns: Array<Column<Unit>> = [
    {
      key: 'unit',
      header: t('catalog.units.columns.unit'),
      sortValue: (row) => localize(row.name),
      cell: (row) => (
        <div className="flex min-w-[12rem] items-center gap-3">
          <span aria-hidden className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-3 text-fg-muted">
            <Ruler size={17} />
          </span>
          <div className="min-w-0">
            <p className="truncate font-medium text-fg">{localize(row.name)}</p>
            <p className="type-caption truncate text-fg-subtle">{secondary(row.name)}</p>
          </div>
        </div>
      ),
    },
    { key: 'code', header: t('catalog.units.columns.code'), sortValue: (row) => row.id, cell: (row) => <span className="font-mono text-[0.82rem] text-fg-muted">{row.id}</span> },
    {
      key: 'short',
      header: t('catalog.units.columns.short'),
      cell: (row) => (
        <span className="whitespace-nowrap">
          <span className="font-medium text-fg">{localize(row.short)}</span>
          {secondary(row.short) && secondary(row.short) !== localize(row.short) && <span className="text-fg-subtle"> · {secondary(row.short)}</span>}
        </span>
      ),
    },
    {
      key: 'quantities',
      header: t('catalog.units.columns.quantities'),
      sortValue: (row) => (row.allowDecimal ? 0 : 1),
      cell: (row) =>
        row.allowDecimal ? (
          <Badge size="sm" tone="info" icon={Scale}>
            {t('catalog.units.decimals')}
          </Badge>
        ) : (
          <Badge size="sm" tone="neutral" icon={Hash}>
            {t('catalog.units.wholeOnly')}
          </Badge>
        ),
    },
    { key: 'order', header: t('catalog.units.columns.sortOrder'), align: 'end', sortValue: (row) => row.sortOrder, cell: (row) => <span className="text-fg-muted">{format.integer(row.sortOrder)}</span> },
    { key: 'products', header: t('catalog.units.columns.products'), align: 'end', sortValue: (row) => counts.get(row.id) ?? 0, cell: (row) => <span className="font-semibold">{format.integer(counts.get(row.id) ?? 0)}</span> },
    {
      key: 'status',
      header: t('catalog.units.columns.status'),
      sortValue: (row) => (row.isActive ? 0 : 1),
      cell: (row) =>
        row.isActive ? (
          <StatusBadge size="sm" tone="success" icon={CircleCheck} label={t('common.labels.active')} />
        ) : (
          <StatusBadge size="sm" tone="neutral" icon={CircleSlash} label={t('common.labels.inactive')} />
        ),
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
          label={t('catalog.units.edit', { name: localize(row.name) })}
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
      {t('catalog.units.add')}
    </Button>
  ) : undefined;

  return (
    <div className="flex h-full flex-col">
      <PageHeader icon={Ruler} title={t('catalog.units.title')} actions={addButton}>
        <CatalogNav />
      </PageHeader>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-6">
        <DataTable
          ariaLabel={t('catalog.units.tableLabel')}
          columns={columns}
          rows={rows}
          rowKey={(row) => row.id}
          loading={loading}
          empty={<EmptyState icon={Ruler} title={t('catalog.units.empty.title')} description={t('catalog.units.empty.description')} action={addButton} />}
          onRowClick={canManage ? (row) => setEditing(row) : undefined}
          className="min-h-[20rem] flex-1"
        />
      </div>

      {editing !== undefined && <UnitEditorModal unit={editing} onClose={() => setEditing(undefined)} />}
    </div>
  );
}
