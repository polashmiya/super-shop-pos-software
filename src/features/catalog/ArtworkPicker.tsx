import { useDeferredValue, useMemo, useState, type ReactNode } from 'react';
import { Check, ImageOff, Images, Sparkles } from 'lucide-react';
import { normalizeSearch } from '@/domain/text';
import type { ArtFolder } from '@/data/seed/catalog/artRegistry';
import { useFormat } from '@/hooks/useFormat';
import { tIn, useT } from '@/i18n';
import { Button } from '@/components/ui/Button';
import { SearchInput } from '@/components/ui/Controls';
import { Modal } from '@/components/ui/Modal';
import { EmptyState } from '@/components/ui/States';
import { cn } from '@/components/ui/cn';
import { resolveImageSrc } from '@/components/product/categoryIcons';
import { ART_FOLDERS, ARTWORK, parseArtworkPath, shapeWords } from './artwork';

interface ArtworkPickerProps {
  current: string | null;
  suggestedFolder: ArtFolder | null;
  onClose: () => void;
  onSelect: (path: string) => void;
}

type FolderChoice = ArtFolder | 'all';

/** Searchable grid of the bundled product artwork (suggested group first). */
export function ArtworkPicker({ current, suggestedFolder, onClose, onSelect }: ArtworkPickerProps) {
  const t = useT();
  const format = useFormat();
  const currentArt = parseArtworkPath(current);
  const [folder, setFolder] = useState<FolderChoice>(currentArt?.folder ?? suggestedFolder ?? 'all');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string | null>(currentArt?.path ?? null);
  const deferredQuery = useDeferredValue(query);

  const folderLabel = (value: ArtFolder) => t(`catalog.artwork.folders.${value}`);

  const folderSearch = useMemo(
    () => new Map(ART_FOLDERS.map((value) => [value, normalizeSearch(`${value} ${tIn('en', `catalog.artwork.folders.${value}`)} ${tIn('bn', `catalog.artwork.folders.${value}`)}`)])),
    [],
  );

  const orderedFolders = useMemo(() => (suggestedFolder ? [suggestedFolder, ...ART_FOLDERS.filter((value) => value !== suggestedFolder)] : ART_FOLDERS), [suggestedFolder]);

  const items = useMemo(() => {
    const tokens = normalizeSearch(deferredQuery).split(' ').filter(Boolean);
    if (tokens.length > 0) {
      return ARTWORK.filter((item) => {
        const haystack = `${shapeWords(item.shape)} ${folderSearch.get(item.folder) ?? ''}`;
        return tokens.every((token) => haystack.includes(token));
      });
    }
    return folder === 'all' ? ARTWORK : ARTWORK.filter((item) => item.folder === folder);
  }, [deferredQuery, folder, folderSearch]);

  const searching = deferredQuery.trim().length > 0;

  const folderButton = (value: FolderChoice, label: string, extra?: ReactNode) => {
    const active = !searching && folder === value;
    return (
      <button
        key={value}
        type="button"
        aria-pressed={active}
        onClick={() => {
          setFolder(value);
          setQuery('');
        }}
        className={cn(
          'flex min-h-10 w-full items-center gap-2 rounded-md px-3 text-start text-[0.9rem] transition-base',
          active ? 'bg-primary-soft font-semibold text-primary-soft-fg' : 'text-fg-muted hover:bg-surface-3 hover:text-fg',
        )}
      >
        <span className="min-w-0 flex-1 truncate">{label}</span>
        {extra}
      </button>
    );
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="xl"
      title={t('catalog.artwork.title')}
      description={t('catalog.artwork.description')}
      closeLabel={t('common.actions.close')}
      icon={
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary-soft-fg">
          <Images size={20} aria-hidden />
        </span>
      }
      bodyClassName="p-0"
      footer={
        <>
          <span className="type-body-sm me-auto text-fg-muted">{t('catalog.artwork.count', { count: items.length })}</span>
          <Button onClick={onClose}>{t('common.actions.cancel')}</Button>
          <Button variant="primary" icon={Check} disabled={!selected} onClick={() => selected && onSelect(selected)}>
            {t('catalog.artwork.use')}
          </Button>
        </>
      }
    >
      <div className="grid h-[min(64vh,38rem)] grid-cols-[13rem_minmax(0,1fr)]">
        <nav aria-label={t('catalog.artwork.groups')} className="flex min-h-0 flex-col gap-0.5 overflow-y-auto border-e border-border bg-surface-2/50 p-2">
          {suggestedFolder &&
            folderButton(
              suggestedFolder,
              folderLabel(suggestedFolder),
              <span className="inline-flex items-center gap-1 rounded-full bg-surface px-1.5 py-0.5 text-[0.68rem] font-semibold text-fg-muted ring-1 ring-border">
                <Sparkles size={11} aria-hidden />
                {t('catalog.artwork.suggested')}
              </span>,
            )}
          {folderButton('all', t('catalog.artwork.all'))}
          <div className="my-1 h-px bg-border" role="separator" />
          {orderedFolders.filter((value) => value !== suggestedFolder).map((value) => folderButton(value, folderLabel(value)))}
        </nav>

        <div className="flex min-h-0 flex-col">
          <div className="border-b border-border p-3">
            <SearchInput
              value={query}
              onChange={setQuery}
              clearLabel={t('common.actions.clear')}
              placeholder={t('catalog.artwork.searchPlaceholder')}
              aria-label={t('catalog.artwork.searchLabel')}
              data-autofocus
            />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            {items.length === 0 ? (
              <EmptyState icon={ImageOff} compact title={t('catalog.artwork.empty', { query: deferredQuery.trim() })} />
            ) : (
              <div role="listbox" aria-label={t('catalog.artwork.title')} className="grid grid-cols-[repeat(auto-fill,minmax(6.25rem,1fr))] gap-2">
                {items.map((item) => {
                  const active = item.path === selected;
                  const src = resolveImageSrc(item.path);
                  return (
                    <button
                      key={item.path}
                      type="button"
                      role="option"
                      aria-selected={active}
                      aria-label={t('catalog.artwork.option', { folder: folderLabel(item.folder), shape: shapeWords(item.shape), number: format.integer(item.variant) })}
                      onClick={() => setSelected(item.path)}
                      onDoubleClick={() => onSelect(item.path)}
                      className={cn(
                        'relative aspect-square overflow-hidden rounded-lg border bg-image-tile transition-base',
                        active ? 'border-primary ring-2 ring-primary' : 'border-border hover:border-border-strong',
                      )}
                    >
                      {src && <img src={src} alt="" loading="lazy" decoding="async" draggable={false} className="h-full w-full object-contain p-2.5" />}
                      {active && (
                        <span className="absolute end-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-fg">
                          <Check size={13} strokeWidth={3} aria-hidden />
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}
