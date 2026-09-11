import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { CornerDownLeft, Package, ReceiptText, Search, Settings2, Truck, UserRound, type LucideIcon } from 'lucide-react';
import { APP_CONFIG } from '@/config/app.config';
import { EXTRA_DESTINATIONS, NAV_ITEMS } from '@/app/navigation';
import { SETTINGS_SEARCH_INDEX } from '@/features/settings/searchIndex';
import { addProductToCart } from '@/features/pos/posActions';
import { useDebouncedValue } from '@/hooks/useCommon';
import { useFormat } from '@/hooks/useFormat';
import { normalizeSearch, tokenize, matchesTokens } from '@/domain/text';
import { useLocalize, useT } from '@/i18n';
import { repos } from '@/repositories';
import { useAuthStore } from '@/stores/authStore';
import { searchProducts, useCatalogStore } from '@/stores/catalogStore';
import { useUiStore } from '@/stores/uiStore';
import type { Customer, Product, Sale, Supplier } from '@/types';
import { cn } from '@/components/ui/cn';
import { Kbd } from '@/components/ui/Display';
import { ProductImage } from '@/components/product/ProductImage';
import { useFocusTrap } from '@/components/ui/useFocusTrap';
import { createPortal } from 'react-dom';

/* ==========================================================================
   Global search (Ctrl/Cmd+K): products, invoices, customers, suppliers,
   pages and settings — grouped, keyboard driven, instant for products.
   ========================================================================== */

interface ResultItem {
  id: string;
  group: 'products' | 'sales' | 'customers' | 'suppliers' | 'navigation' | 'settings';
  title: ReactNode;
  subtitle?: ReactNode;
  icon?: LucideIcon;
  leading?: ReactNode;
  trailing?: ReactNode;
  run: () => void;
}

const GROUP_ORDER: ResultItem['group'][] = ['navigation', 'products', 'sales', 'customers', 'suppliers', 'settings'];

export function CommandPalette() {
  const open = useUiStore((state) => state.paletteOpen);
  if (!open) return null;
  return <PaletteDialog />;
}

function PaletteDialog() {
  const t = useT();
  const localize = useLocalize();
  const format = useFormat();
  const navigate = useNavigate();
  const location = useLocation();
  const setOpen = useUiStore((state) => state.setPaletteOpen);
  const permissions = useAuthStore((state) => state.permissions);
  const products = useCatalogStore((state) => state.products);
  const haystacks = useCatalogStore((state) => state.haystacks);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [remote, setRemote] = useState<{ sales: Sale[]; customers: Customer[]; suppliers: Supplier[] }>({ sales: [], customers: [], suppliers: [] });
  const debounced = useDebouncedValue(query, APP_CONFIG.pos.searchDebounceMs);
  useFocusTrap(panelRef, true);

  const close = () => setOpen(false);
  const go = (path: string) => {
    close();
    navigate(path);
  };

  useEffect(() => {
    const text = debounced.trim();
    let alive = true;
    const run = async () => {
      if (text.length < 2) {
        if (alive) setRemote({ sales: [], customers: [], suppliers: [] });
        return;
      }
      const limit = APP_CONFIG.ui.commandPaletteLimit;
      const [sales, customers, suppliers] = await Promise.all([
        permissions.has('sales.view') ? repos().sales.searchInvoices(text, limit).catch(() => []) : Promise.resolve([]),
        permissions.has('customers.view') ? repos().customers.search(text, limit).catch(() => []) : Promise.resolve([]),
        permissions.has('suppliers.view') ? repos().suppliers.list(text).then((list) => list.slice(0, limit)).catch(() => []) : Promise.resolve([]),
      ]);
      if (alive) setRemote({ sales, customers, suppliers });
    };
    void run();
    return () => {
      alive = false;
    };
  }, [debounced, permissions]);

  const results = useMemo<ResultItem[]>(() => {
    const tokens = tokenize(query);
    const items: ResultItem[] = [];
    const matches = (text: string) => tokens.length === 0 || matchesTokens(normalizeSearch(text), tokens);

    for (const item of [...NAV_ITEMS, ...EXTRA_DESTINATIONS]) {
      if (item.permission && !permissions.has(item.permission)) continue;
      const label = t(item.labelKey);
      if (!matches(`${label} ${item.keywords ?? ''} ${item.key}`)) continue;
      items.push({ id: `nav:${item.key}`, group: 'navigation', title: label, icon: item.icon, run: () => go(item.path) });
    }
    if (tokens.length === 0) return items.slice(0, 8);

    const onPos = location.pathname.startsWith('/pos');
    const found: Product[] = searchProducts(products, haystacks, query, { limit: APP_CONFIG.ui.commandPaletteLimit });
    for (const product of found) {
      items.push({
        id: `product:${product.id}`,
        group: 'products',
        title: localize(product.name),
        subtitle: `${product.sku} · ${product.barcode}`,
        leading: <ProductImage product={product} className="h-10 w-10" iconSize={18} />,
        trailing: <span className="text-sm font-semibold text-fg tnum">{format.money(product.sellingPrice)}</span>,
        run: () => {
          close();
          if (onPos || !permissions.has('products.view')) addProductToCart(product, 1);
          else navigate(`/products/${product.id}`);
        },
      });
    }
    for (const sale of remote.sales) {
      items.push({
        id: `sale:${sale.id}`,
        group: 'sales',
        title: sale.invoiceNo,
        subtitle: `${format.dateTime(sale.createdAt)} · ${sale.customerName || t('common.labels.walkIn')}`,
        icon: ReceiptText,
        trailing: <span className="text-sm font-semibold text-fg tnum">{format.money(sale.grandTotal)}</span>,
        run: () => go(`/sales/${sale.id}`),
      });
    }
    for (const customer of remote.customers) {
      items.push({ id: `customer:${customer.id}`, group: 'customers', title: customer.name, subtitle: customer.phone, icon: UserRound, run: () => go(`/customers/${customer.id}`) });
    }
    for (const supplier of remote.suppliers) {
      items.push({ id: `supplier:${supplier.id}`, group: 'suppliers', title: supplier.name, subtitle: supplier.company, icon: Truck, run: () => go(`/suppliers/${supplier.id}`) });
    }
    const seen = new Set<string>();
    for (const entry of SETTINGS_SEARCH_INDEX) {
      const label = t(entry.labelKey);
      if (!matches(`${label} ${entry.keywords ?? ''}`) || seen.has(`${entry.section}:${label}`)) continue;
      seen.add(`${entry.section}:${label}`);
      items.push({
        id: `setting:${entry.section}:${entry.labelKey}`,
        group: 'settings',
        title: label,
        subtitle: t(`settings.sections.${entry.section}.title`),
        icon: Settings2,
        run: () => go(`/settings/${entry.section}`),
      });
      if (seen.size >= 5) break;
    }
    return GROUP_ORDER.flatMap((group) => items.filter((item) => item.group === group));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, products, haystacks, remote, permissions, t, localize, format, location.pathname]);

  const safeActive = Math.min(active, Math.max(0, results.length - 1));

  useEffect(() => {
    panelRef.current?.querySelector<HTMLElement>(`[data-index="${safeActive}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [safeActive]);

  let lastGroup: string | null = null;

  return createPortal(
    <div className="fixed inset-0 z-[65] flex items-start justify-center px-4 pt-[10vh]">
      <div className="absolute inset-0 bg-overlay animate-fade-in" onMouseDown={close} aria-hidden />
      <div ref={panelRef} role="dialog" aria-modal="true" aria-label={t('shell.palette.title')} className="relative flex max-h-[70vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-lg animate-pop-in">
        <div className="flex items-center gap-3 border-b border-border px-4">
          <Search size={20} aria-hidden className="text-fg-subtle" />
          <input
            autoFocus
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActive(0);
            }}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown') {
                event.preventDefault();
                setActive((value) => Math.min(value + 1, results.length - 1));
              } else if (event.key === 'ArrowUp') {
                event.preventDefault();
                setActive((value) => Math.max(value - 1, 0));
              } else if (event.key === 'Enter') {
                event.preventDefault();
                results[safeActive]?.run();
              } else if (event.key === 'Escape') {
                event.preventDefault();
                close();
              }
            }}
            placeholder={t('shell.palette.placeholder')}
            aria-label={t('shell.palette.title')}
            className="h-14 flex-1 bg-transparent text-base text-fg outline-none placeholder:text-fg-subtle"
          />
          <Kbd>Esc</Kbd>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-2" role="listbox">
          {results.length === 0 ? (
            <p className="px-3 py-10 text-center type-body-sm text-fg-muted">{query ? t('common.states.noResultsFor', { query }) : t('shell.palette.empty')}</p>
          ) : (
            results.map((item, index) => {
              const header = item.group !== lastGroup ? t(`shell.palette.groups.${item.group}`) : null;
              lastGroup = item.group;
              const Icon = item.icon ?? Package;
              return (
                <div key={item.id}>
                  {header && <p className="type-caption px-3 pt-3 pb-1.5 font-semibold tracking-wide text-fg-subtle uppercase">{header}</p>}
                  <button
                    type="button"
                    role="option"
                    aria-selected={index === safeActive}
                    data-index={index}
                    onMouseEnter={() => setActive(index)}
                    onClick={item.run}
                    className={cn('flex min-h-12 w-full items-center gap-3 rounded-lg px-3 py-1.5 text-start transition-base', index === safeActive ? 'bg-surface-3' : '')}
                  >
                    {item.leading ?? (
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-surface-2 text-fg-muted">
                        <Icon size={18} aria-hidden />
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[0.92rem] font-medium text-fg">{item.title}</span>
                      {item.subtitle && <span className="block truncate text-xs text-fg-subtle">{item.subtitle}</span>}
                    </span>
                    {item.trailing}
                    {index === safeActive && <CornerDownLeft size={16} aria-hidden className="text-fg-subtle" />}
                  </button>
                </div>
              );
            })
          )}
        </div>
        <div className="flex items-center gap-4 border-t border-border px-4 py-2 text-xs text-fg-subtle">
          <span className="flex items-center gap-1.5">
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd> {t('shell.palette.hintNavigate')}
          </span>
          <span className="flex items-center gap-1.5">
            <Kbd>Enter</Kbd> {t('shell.palette.hintOpen')}
          </span>
          <span className="flex items-center gap-1.5">
            <Kbd>Esc</Kbd> {t('shell.palette.hintClose')}
          </span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
