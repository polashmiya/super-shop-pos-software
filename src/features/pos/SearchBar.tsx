import { useEffect, useState, type RefObject } from 'react';
import { ScanBarcode, X } from 'lucide-react';
import { APP_CONFIG } from '@/config/app.config';
import { toAsciiDigits } from '@/domain/text';
import { useT } from '@/i18n';
import { findByCode } from '@/stores/catalogStore';
import { usePosStore } from '@/stores/posStore';
import { useSettingsStore } from '@/stores/settingsStore';
import type { Product } from '@/types';
import { cn } from '@/components/ui/cn';
import { addProductToCart, scanCode } from './posActions';
import { usePosUi } from './posUiStore';
import { parseScanInput } from './scanInput';

interface SearchBarProps {
  inputRef: RefObject<HTMLInputElement | null>;
  /** Products currently shown for the query (Enter adds the highlighted one). */
  results: readonly Product[];
  large: boolean;
  placeholder?: string;
  /** Marks the box as controlling a listbox of suggestions (counter layout). */
  listboxId?: string;
}

/**
 * The scan / search box — the heart of SCAN → ADD → PAY. Enter adds the exact
 * barcode/SKU match or the highlighted result, then clears for the next scan.
 * "3*<code>" adds three at once. Enter on an empty box opens payment (quick
 * checkout); ↑/↓ on an empty box move the selection in the cart.
 */
export function SearchBar({ inputRef, results, large, placeholder, listboxId }: SearchBarProps) {
  const t = useT();
  const query = usePosUi((state) => state.query);
  const typedQuantity = usePosUi((state) => state.typedQuantity);
  const setQuery = usePosUi((state) => state.setQuery);
  const highlight = usePosUi((state) => state.highlight);
  const setHighlight = usePosUi((state) => state.setHighlight);
  const barcode = useSettingsStore((state) => state.device.barcode);
  const quickCheckout = useSettingsStore((state) => state.device.pos.quickCheckoutOnEnter);
  const [text, setText] = useState(query);

  // The query can be set from outside (type-to-search, clear after sale).
  // The box may hold a quantity prefix the query does not ("3*rice" → "rice").
  useEffect(() => {
    const timer = setTimeout(() => setText((current) => (parseScanInput(current).code === query ? current : query)), 0);
    return () => clearTimeout(timer);
  }, [query]);

  // Debounced filtering on the code part; scanning uses the raw text on Enter.
  useEffect(() => {
    const { code, quantity } = parseScanInput(text);
    if (code === query && quantity === typedQuantity) return;
    const timer = setTimeout(() => setQuery(code, quantity), APP_CONFIG.pos.searchDebounceMs);
    return () => clearTimeout(timer);
  }, [text, query, typedQuantity, setQuery]);

  const reset = () => {
    setText('');
    setQuery('');
  };

  const submit = async () => {
    const value = text.trim();
    if (!value) {
      if (quickCheckout && usePosStore.getState().draft.lines.length > 0) usePosUi.getState().open({ type: 'payment' });
      return;
    }
    const { quantity, code } = parseScanInput(value);
    const count = quantity ?? 1;
    const exact = findByCode(code);
    if (exact) {
      reset();
      addProductToCart(exact, count, 'scan');
      return;
    }
    if (/^[0-9]+$/.test(toAsciiDigits(code)) && code.length >= barcode.minLength) {
      reset();
      await scanCode(code, count);
      return;
    }
    if (code === query.trim() && results.length > 0) {
      const product = results[Math.min(highlight, results.length - 1)];
      reset();
      addProductToCart(product, count, 'tap');
    }
  };

  return (
    <div className="relative flex-1">
      <ScanBarcode size={large ? 26 : 22} aria-hidden className="pointer-events-none absolute start-4 top-1/2 -translate-y-1/2 text-primary" />
      <input
        ref={inputRef}
        data-pos-search="true"
        type="text"
        inputMode="search"
        autoComplete="off"
        spellCheck={false}
        value={text}
        role={listboxId ? 'combobox' : undefined}
        aria-controls={listboxId}
        aria-expanded={listboxId ? Boolean(query) : undefined}
        aria-autocomplete={listboxId ? 'list' : undefined}
        aria-label={t('pos.scanLabel')}
        placeholder={placeholder ?? t('pos.scanPlaceholder')}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || (barcode.terminator === 'tab' && event.key === 'Tab' && text)) {
            event.preventDefault();
            void submit();
          } else if (event.key === 'Escape' && text) {
            event.preventDefault();
            reset();
          } else if (event.key === 'ArrowDown' && results.length > 0 && text) {
            event.preventDefault();
            setHighlight(Math.min(highlight + 1, results.length - 1));
          } else if (event.key === 'ArrowUp' && text) {
            event.preventDefault();
            setHighlight(Math.max(highlight - 1, 0));
          } else if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && !text) {
            // Empty box: the arrows walk the cart so Delete / + / − have a target.
            event.preventDefault();
            usePosStore.getState().selectRelative(event.key === 'ArrowDown' ? 1 : -1);
          }
        }}
        className={cn(
          'w-full rounded-xl border-2 border-border bg-surface ps-13 pe-12 font-medium text-fg shadow-sm transition-base placeholder:font-normal placeholder:text-fg-subtle',
          'focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/15',
          large ? 'h-16 text-lg' : 'h-14 text-base',
        )}
      />
      {text && (
        <button
          type="button"
          onClick={() => {
            reset();
            inputRef.current?.focus();
          }}
          aria-label={t('common.actions.clear')}
          className="absolute end-2.5 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-fg-subtle hover:bg-surface-3 hover:text-fg"
        >
          <X size={18} aria-hidden />
        </button>
      )}
    </div>
  );
}
