import { useCallback, useDeferredValue, useMemo, useState, type ReactNode } from 'react';
import { ChevronsDownUp, ChevronsUpDown, FolderTree, Plus, SearchX, X } from 'lucide-react';
import { useAsync } from '@/hooks/useAsync';
import { useT } from '@/i18n';
import { catalogService } from '@/services/catalogService';
import { useCan } from '@/stores/authStore';
import { useCatalogStore } from '@/stores/catalogStore';
import type { Category, Id } from '@/types';
import { Button } from '@/components/ui/Button';
import { SearchInput } from '@/components/ui/Controls';
import { Card, PageHeader } from '@/components/ui/Display';
import { EmptyState, SkeletonRows } from '@/components/ui/States';
import { CatalogNav } from '@/features/catalog/CatalogNav';
import { CategoryEditorModal } from '@/features/catalog/CategoryEditorModal';
import { CategoryTree } from '@/features/catalog/CategoryTree';
import { categoryTree, filterCategoryTree } from '@/features/catalog/catalogUtils';

/* ==========================================================================
   Categories: main categories with collapsible subcategories, icon, colour,
   product counts and status. Add / edit through CategoryEditorModal.
   ========================================================================== */

interface EditorState {
  category: Category | null;
  parentId: Id | null;
}

export default function CategoriesPage() {
  const t = useT();
  const canManage = useCan('products.manage');
  const categories = useCatalogStore((state) => state.categories);
  const catalogStatus = useCatalogStore((state) => state.status);
  const version = useCatalogStore((state) => state.version);
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<ReadonlySet<Id>>(() => new Set());
  const [editor, setEditor] = useState<EditorState | null>(null);
  const deferredQuery = useDeferredValue(query);
  const counts = useAsync(() => catalogService.categoryProductCounts(), [version]);

  const tree = useMemo(() => categoryTree(categories), [categories]);
  const nodes = useMemo(() => filterCategoryTree(tree, deferredQuery), [tree, deferredQuery]);
  const parentIds = useMemo(() => tree.filter((node) => node.children.length > 0).map((node) => node.category.id), [tree]);
  const searching = deferredQuery.trim().length > 0;
  const loading = catalogStatus !== 'ready' && categories.length === 0;
  const subTotal = tree.reduce((sum, node) => sum + node.children.length, 0);
  const allExpanded = parentIds.length > 0 && parentIds.every((id) => expanded.has(id));

  const isOpen = useCallback((id: Id) => searching || expanded.has(id), [searching, expanded]);
  const toggle = useCallback((id: Id) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const addSubcategory = (parent: Category) => {
    setExpanded((current) => new Set(current).add(parent.id));
    setEditor({ category: null, parentId: parent.id });
  };

  const addButton = canManage ? (
    <Button variant="primary" icon={Plus} onClick={() => setEditor({ category: null, parentId: null })}>
      {t('catalog.categories.add')}
    </Button>
  ) : undefined;

  let body: ReactNode;
  if (loading) {
    body = <SkeletonRows rows={8} />;
  } else if (categories.length === 0) {
    body = <EmptyState icon={FolderTree} title={t('catalog.categories.empty.title')} description={t('catalog.categories.empty.description')} action={addButton} />;
  } else if (nodes.length === 0) {
    body = (
      <EmptyState
        icon={SearchX}
        title={t('catalog.categories.noMatch', { query: deferredQuery.trim() })}
        action={
          <Button icon={X} onClick={() => setQuery('')}>
            {t('common.actions.clear')}
          </Button>
        }
      />
    );
  } else {
    body = (
      <CategoryTree
        nodes={nodes}
        counts={counts.data ?? (counts.error ? null : undefined)}
        isOpen={isOpen}
        onToggle={toggle}
        onEdit={canManage ? (category) => setEditor({ category, parentId: category.parentId }) : undefined}
        onAddSub={canManage ? addSubcategory : undefined}
      />
    );
  }

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        icon={FolderTree}
        title={t('catalog.categories.title')}
        description={loading ? undefined : t('catalog.categories.summary', { main: tree.length, sub: subTotal })}
        actions={addButton}
      >
        <CatalogNav />
      </PageHeader>

      <div className="min-h-0 flex-1 overflow-y-auto p-6">
        <Card padded={false} className="overflow-hidden">
          <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2.5">
            <div className="max-w-lg min-w-[15rem] flex-[1_1_18rem]">
              <SearchInput
                value={query}
                onChange={setQuery}
                clearLabel={t('common.actions.clear')}
                placeholder={t('catalog.categories.searchPlaceholder')}
                aria-label={t('catalog.categories.searchLabel')}
              />
            </div>
            {!searching && parentIds.length > 0 && (
              <Button variant="ghost" icon={allExpanded ? ChevronsDownUp : ChevronsUpDown} onClick={() => setExpanded(allExpanded ? new Set() : new Set(parentIds))}>
                {t(allExpanded ? 'catalog.categories.collapseAll' : 'catalog.categories.expandAll')}
              </Button>
            )}
          </div>
          {body}
        </Card>
      </div>

      {editor && <CategoryEditorModal category={editor.category} parentId={editor.parentId} onClose={() => setEditor(null)} />}
    </div>
  );
}
