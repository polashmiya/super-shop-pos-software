import { NavLink } from 'react-router';
import { FolderTree, Package, Ruler, Tags, type LucideIcon } from 'lucide-react';
import { useFormat } from '@/hooks/useFormat';
import { useT, type TranslationKey } from '@/i18n';
import { useCatalogStore } from '@/stores/catalogStore';
import { cn } from '@/components/ui/cn';

interface NavEntry {
  to: string;
  labelKey: TranslationKey;
  icon: LucideIcon;
  count: number;
  end?: boolean;
}

/**
 * Tab bar across Products / Categories / Brands / Units. Rendered as the
 * last row of the PageHeader: the active underline sits on the header border.
 */
export function CatalogNav() {
  const t = useT();
  const format = useFormat();
  const products = useCatalogStore((state) => state.products.length);
  const categories = useCatalogStore((state) => state.categories.length);
  const brands = useCatalogStore((state) => state.brands.length);
  const units = useCatalogStore((state) => state.units.length);

  const entries: NavEntry[] = [
    { to: '/products', labelKey: 'catalog.nav.products', icon: Package, count: products, end: true },
    { to: '/products/categories', labelKey: 'catalog.nav.categories', icon: FolderTree, count: categories },
    { to: '/products/brands', labelKey: 'catalog.nav.brands', icon: Tags, count: brands },
    { to: '/products/units', labelKey: 'catalog.nav.units', icon: Ruler, count: units },
  ];

  return (
    <nav aria-label={t('catalog.nav.label')} className="mb-[calc(var(--space-unit)*-4_-_1px)] flex gap-1 overflow-x-auto scrollbar-none">
      {entries.map((entry) => (
        <NavLink
          key={entry.to}
          to={entry.to}
          end={entry.end}
          className={({ isActive }) =>
            cn(
              'group flex min-h-11 items-center gap-2 border-b-2 px-3.5 text-[0.92rem] font-medium whitespace-nowrap transition-base',
              isActive ? 'border-primary text-fg' : 'border-transparent text-fg-muted hover:border-border-strong hover:text-fg',
            )
          }
        >
          {({ isActive }) => (
            <>
              <entry.icon size={17} aria-hidden />
              {t(entry.labelKey)}
              <span className={cn('rounded-full px-1.5 text-xs tnum', isActive ? 'bg-primary-soft text-primary-soft-fg' : 'bg-surface-3 text-fg-muted')}>{format.integer(entry.count)}</span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}
