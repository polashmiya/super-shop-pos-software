import { getLanguage, pick, t } from '@/i18n';
import { repos } from '@/repositories';
import { productService } from '@/services/catalogService';
import { useCatalogStore } from '@/stores/catalogStore';
import { confirmAction, toast } from '@/stores/uiStore';
import type { AuditLog, Id, Product, ProductStatus } from '@/types';

/* ==========================================================================
   Catalogue actions shared by the list and detail screens.
   ========================================================================== */

/**
 * Activates or deactivates products after a confirmation, refreshes the
 * in-memory catalogue and shows the result. Resolves true when saved.
 */
export async function changeProductStatus(products: readonly Product[], status: ProductStatus): Promise<boolean> {
  const targets = products.filter((product) => product.status !== status);
  const activate = status === 'active';
  if (targets.length === 0) {
    toast.info(activate ? 'catalog.status.alreadyActive' : 'catalog.status.alreadyInactive');
    return false;
  }
  const count = targets.length;
  const title =
    count === 1
      ? t(activate ? 'catalog.status.activateOne' : 'catalog.status.deactivateOne', { name: pick(targets[0].name, getLanguage()) })
      : t(activate ? 'catalog.status.activateMany' : 'catalog.status.deactivateMany', { count });
  const ok = await confirmAction({
    title,
    message: t(activate ? 'catalog.status.activateMessage' : 'catalog.status.deactivateMessage'),
    confirmLabel: t(activate ? 'common.actions.activate' : 'common.actions.deactivate'),
    tone: activate ? 'primary' : 'danger',
  });
  if (!ok) return false;
  try {
    await productService.setStatus(
      targets.map((product) => product.id),
      status,
    );
    const store = useCatalogStore.getState();
    if (count === 1) {
      const fresh = await productService.getById(targets[0].id);
      if (fresh) store.upsert(fresh);
    } else {
      await store.reloadProducts();
    }
    toast.success({ key: activate ? 'catalog.status.activated' : 'catalog.status.deactivated', params: { count } });
    return true;
  } catch (error) {
    toast.fromError(error);
    return false;
  }
}

/** Audit trail of one product (newest first). */
export function productActivity(productId: Id, limit = 50): Promise<AuditLog[]> {
  return repos().audit.forEntity('product', productId, limit);
}
