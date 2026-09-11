import { memo, useMemo } from 'react';
import { LayoutGrid, Star } from 'lucide-react';
import { useLocalize, useT } from '@/i18n';
import { useCatalogStore } from '@/stores/catalogStore';
import { cn } from '@/components/ui/cn';
import { categoryIcon } from '@/components/product/categoryIcons';
import { usePosUi } from './posUiStore';

/** Horizontal, touch-friendly category chips (All · Best sellers · categories). */
export const CategoryBar = memo(function CategoryBar() {
  const t = useT();
  const localize = useLocalize();
  const categories = useCatalogStore((state) => state.categories);
  const categoryId = usePosUi((state) => state.categoryId);
  const setCategory = usePosUi((state) => state.setCategory);
  const roots = useMemo(() => categories.filter((category) => category.parentId === null && category.isActive), [categories]);

  const chip = (active: boolean) =>
    cn(
      'flex h-11 shrink-0 items-center gap-2 rounded-full border px-4 text-[0.88rem] font-semibold whitespace-nowrap transition-base',
      active ? 'border-primary bg-primary text-primary-fg shadow-sm' : 'border-border bg-surface text-fg-muted hover:border-border-strong hover:text-fg',
    );

  return (
    <div role="toolbar" aria-label={t('pos.categories')} className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
      <button type="button" aria-pressed={categoryId === null} className={chip(categoryId === null)} onClick={() => setCategory(null)}>
        <LayoutGrid size={17} aria-hidden />
        {t('pos.allCategories')}
      </button>
      <button type="button" aria-pressed={categoryId === 'featured'} className={chip(categoryId === 'featured')} onClick={() => setCategory('featured')}>
        <Star size={17} aria-hidden />
        {t('pos.featured')}
      </button>
      {roots.map((category) => {
        const Icon = categoryIcon(category.icon);
        const active = categoryId === category.id;
        return (
          <button key={category.id} type="button" aria-pressed={active} className={chip(active)} onClick={() => setCategory(active ? null : category.id)}>
            <Icon size={17} aria-hidden />
            {localize(category.name)}
          </button>
        );
      })}
    </div>
  );
});
