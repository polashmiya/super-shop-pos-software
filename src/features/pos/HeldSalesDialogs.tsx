import { useMemo, useState } from 'react';
import { ArchiveRestore, Hand, Play, Trash2 } from 'lucide-react';
import { normalizeSearch } from '@/domain/text';
import { useAsync } from '@/hooks/useAsync';
import { useFormat } from '@/hooks/useFormat';
import { useT } from '@/i18n';
import { listHeldSales } from '@/services/heldSaleService';
import { usePosStore } from '@/stores/posStore';
import { Button } from '@/components/ui/Button';
import { SearchInput } from '@/components/ui/Controls';
import { FormField, Input } from '@/components/ui/Input';
import { Drawer, Modal } from '@/components/ui/Modal';
import { EmptyState, SkeletonRows } from '@/components/ui/States';
import { useCartTotals } from './useCartTotals';
import { holdCurrentSale, removeHeldSale, resumeHeldSale } from './posActions';
import { usePosUi } from './posUiStore';

/** "Hold this sale" dialog (optional label). */
export function HoldDialog() {
  const dialog = usePosUi((state) => state.dialog);
  if (dialog?.type !== 'hold') return null;
  return <HoldForm />;
}

function HoldForm() {
  const t = useT();
  const format = useFormat();
  const close = usePosUi((state) => state.close);
  const lines = usePosStore((state) => state.draft.lines);
  const totals = useCartTotals();
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    const ok = await holdCurrentSale(label);
    setBusy(false);
    if (ok) {
      close();
      usePosStore.getState().requestFocus();
    }
  };

  return (
    <Modal
      open
      onClose={close}
      size="sm"
      title={t('pos.held.holdTitle')}
      description={`${t('pos.cart.items', { count: lines.length })} · ${format.money(totals.grandTotal)}`}
      icon={
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-warning-soft text-warning-text">
          <Hand size={20} aria-hidden />
        </span>
      }
      closeLabel={t('common.actions.close')}
      footer={
        <>
          <Button onClick={close}>{t('common.actions.cancel')}</Button>
          <Button variant="primary" loading={busy} onClick={() => void submit()}>
            {t('pos.cart.hold')}
          </Button>
        </>
      }
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <FormField label={t('pos.held.label')}>
          {(id) => <Input id={id} data-autofocus value={label} placeholder={t('pos.held.labelPlaceholder')} onChange={(event) => setLabel(event.target.value)} maxLength={80} />}
        </FormField>
      </form>
    </Modal>
  );
}

/** Held sales list: search, resume, delete. */
export function HeldSalesDrawer() {
  const dialog = usePosUi((state) => state.dialog);
  if (dialog?.type !== 'held') return null;
  return <HeldList />;
}

function HeldList() {
  const t = useT();
  const format = useFormat();
  const close = usePosUi((state) => state.close);
  const [query, setQuery] = useState('');
  const held = useAsync(() => listHeldSales(), []);
  const filtered = useMemo(() => {
    const needle = normalizeSearch(query);
    const list = held.data ?? [];
    if (!needle) return list;
    return list.filter((entry) => normalizeSearch(`${entry.holdNo} ${entry.label} ${entry.customerName} ${entry.userName} ${entry.draft.lines.map((line) => `${line.name.en} ${line.name.bn}`).join(' ')}`).includes(needle));
  }, [held.data, query]);

  return (
    <Drawer open onClose={close} width="md" title={t('pos.held.title')} closeLabel={t('common.actions.close')}>
      <div className="flex flex-col gap-3 p-4">
        <SearchInput value={query} onChange={setQuery} placeholder={t('pos.held.search')} clearLabel={t('common.actions.clear')} autoFocus />
        {held.loading && !held.data ? (
          <SkeletonRows rows={3} />
        ) : filtered.length === 0 ? (
          <EmptyState icon={ArchiveRestore} title={t('pos.held.empty')} description={t('pos.held.emptyHint')} />
        ) : (
          <ul className="flex flex-col gap-2.5">
            {filtered.map((entry) => (
              <li key={entry.id} className="rounded-xl border border-border bg-surface-2 p-3.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-mono text-sm font-bold text-primary">{t('pos.held.holdNo', { no: String(entry.holdNo).padStart(3, '0') })}</p>
                    {entry.label && <p className="mt-0.5 truncate font-medium text-fg">{entry.label}</p>}
                    <p className="type-caption mt-0.5 text-fg-subtle">
                      {t('pos.held.heldAt', { time: format.relative(entry.createdAt) })} · {t('pos.held.by', { name: entry.userName })}
                      {entry.customerName ? ` · ${entry.customerName}` : ''}
                    </p>
                  </div>
                  <div className="text-end">
                    <p className="text-lg font-bold text-fg tnum">{format.money(entry.total)}</p>
                    <p className="type-caption text-fg-subtle">{t('pos.cart.items', { count: entry.itemCount })}</p>
                  </div>
                </div>
                <p className="type-body-sm mt-2 line-clamp-2 text-fg-muted">{entry.draft.lines.map((line) => `${line.name.bn} × ${format.quantity(line.quantity)}`).join(', ')}</p>
                <div className="mt-3 flex gap-2">
                  <Button
                    variant="primary"
                    size="sm"
                    icon={Play}
                    className="flex-1"
                    onClick={async () => {
                      if (await resumeHeldSale(entry)) close();
                    }}
                  >
                    {t('pos.held.resume')}
                  </Button>
                  <Button
                    size="sm"
                    icon={Trash2}
                    variant="ghost"
                    onClick={async () => {
                      if (await removeHeldSale(entry)) held.reload();
                    }}
                  >
                    {t('pos.held.delete')}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Drawer>
  );
}
