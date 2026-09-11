import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Search } from 'lucide-react';
import { cn, controlBase } from './cn';
import { Spinner } from './Spinner';

/* ==========================================================================
   Searchable picker (products, customers, suppliers). Keyboard: ↑ ↓ Enter
   Escape. The caller owns the search (sync or async) and the result list.
   ========================================================================== */

interface ComboboxProps<T> {
  query: string;
  onQueryChange: (query: string) => void;
  results: readonly T[];
  getKey: (item: T) => string;
  renderItem: (item: T, active: boolean) => ReactNode;
  onSelect: (item: T) => void;
  placeholder: string;
  emptyText: ReactNode;
  loading?: boolean;
  autoFocus?: boolean;
  /** Keep the list open below the input (inline) instead of as a dropdown. */
  inline?: boolean;
  className?: string;
  footer?: ReactNode;
  ariaLabel: string;
}

export function Combobox<T>({
  query,
  onQueryChange,
  results,
  getKey,
  renderItem,
  onSelect,
  placeholder,
  emptyText,
  loading,
  autoFocus,
  inline,
  className,
  footer,
  ariaLabel,
}: ComboboxProps<T>) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);
  const expanded = inline || (open && query.trim().length > 0);
  const safeActive = Math.min(active, Math.max(0, results.length - 1));

  useEffect(() => {
    if (inline) return;
    const onPointer = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    return () => document.removeEventListener('pointerdown', onPointer);
  }, [inline]);

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${safeActive}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [safeActive]);

  const choose = (item: T) => {
    onSelect(item);
    setOpen(false);
  };

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <div className="relative">
        <Search size={18} aria-hidden className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-fg-subtle" />
        <input
          type="text"
          role="combobox"
          aria-label={ariaLabel}
          aria-expanded={expanded}
          aria-controls={listId}
          aria-activedescendant={expanded && results.length > 0 ? `${listId}-${safeActive}` : undefined}
          autoFocus={autoFocus}
          value={query}
          placeholder={placeholder}
          onChange={(event) => {
            onQueryChange(event.target.value);
            setActive(0);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              setOpen(true);
              setActive((value) => Math.min(value + 1, results.length - 1));
            } else if (event.key === 'ArrowUp') {
              event.preventDefault();
              setActive((value) => Math.max(value - 1, 0));
            } else if (event.key === 'Enter') {
              const item = results[safeActive];
              if (item && expanded) {
                event.preventDefault();
                choose(item);
              }
            } else if (event.key === 'Escape' && open && !inline) {
              event.stopPropagation();
              setOpen(false);
            }
          }}
          className={cn(controlBase, 'min-h-touch ps-10 pe-10')}
        />
        {loading && <Spinner size={16} className="absolute end-3 top-1/2 -translate-y-1/2 text-fg-subtle" />}
      </div>
      {expanded && (
        <div className={cn(inline ? 'mt-2' : 'absolute inset-x-0 top-full z-30 mt-1.5 rounded-lg border border-border bg-surface shadow-lg')}>
          <ul ref={listRef} id={listId} role="listbox" className={cn('overflow-y-auto p-1', inline ? 'max-h-[50vh]' : 'max-h-80')}>
            {results.length === 0 ? (
              <li className="px-3 py-6 text-center type-body-sm text-fg-muted">{emptyText}</li>
            ) : (
              results.map((item, index) => (
                <li
                  key={getKey(item)}
                  id={`${listId}-${index}`}
                  data-index={index}
                  role="option"
                  aria-selected={index === safeActive}
                  onMouseEnter={() => setActive(index)}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => choose(item)}
                  className={cn('cursor-pointer rounded-md transition-base', index === safeActive ? 'bg-surface-3' : '')}
                >
                  {renderItem(item, index === safeActive)}
                </li>
              ))
            )}
          </ul>
          {footer && <div className="border-t border-border p-1.5">{footer}</div>}
        </div>
      )}
    </div>
  );
}
