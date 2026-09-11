import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { LucideIcon } from 'lucide-react';
import { cn } from './cn';

/* ==========================================================================
   Popover + dropdown menu (keyboard: arrows, Enter, Escape).
   ========================================================================== */

interface PopoverProps {
  open: boolean;
  onClose: () => void;
  anchor: HTMLElement | null;
  align?: 'start' | 'end';
  children: ReactNode;
  className?: string;
  width?: number;
}

export function Popover({ open, onClose, anchor, align = 'end', children, className, width }: PopoverProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    if (!open || !anchor) return;
    const place = () => {
      const rect = anchor.getBoundingClientRect();
      const panelWidth = width ?? panelRef.current?.offsetWidth ?? 240;
      const left = align === 'end' ? Math.max(8, rect.right - panelWidth) : Math.min(rect.left, window.innerWidth - panelWidth - 8);
      const panelHeight = panelRef.current?.offsetHeight ?? 0;
      const below = rect.bottom + 6;
      const top = below + panelHeight > window.innerHeight - 8 && rect.top > panelHeight + 12 ? rect.top - panelHeight - 6 : below;
      setPosition({ top, left });
    };
    place();
    const frame = requestAnimationFrame(place);
    window.addEventListener('resize', place);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', place);
    };
  }, [open, anchor, align, width]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (panelRef.current?.contains(target) || anchor?.contains(target)) return;
      onClose();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
        anchor?.focus();
      }
    };
    document.addEventListener('pointerdown', onPointer, true);
    window.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('pointerdown', onPointer, true);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [open, onClose, anchor]);

  if (!open) return null;
  return createPortal(
    <div
      ref={panelRef}
      className={cn('fixed z-[70] rounded-lg border border-border bg-surface p-1.5 shadow-lg animate-pop-in', className)}
      style={{ top: position?.top ?? -9999, left: position?.left ?? -9999, width }}
    >
      {children}
    </div>,
    document.body,
  );
}

export interface MenuItem {
  key: string;
  label: ReactNode;
  icon?: LucideIcon;
  onSelect: () => void;
  danger?: boolean;
  disabled?: boolean;
  hint?: ReactNode;
}

interface DropdownMenuProps {
  trigger: (props: { ref: (node: HTMLElement | null) => void; onClick: () => void; 'aria-expanded': boolean; 'aria-haspopup': 'menu' }) => ReactNode;
  items: ReadonlyArray<MenuItem | 'separator'>;
  header?: ReactNode;
  align?: 'start' | 'end';
  width?: number;
}

export function DropdownMenu({ trigger, items, header, align = 'end', width = 240 }: DropdownMenuProps) {
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => listRef.current?.querySelector<HTMLElement>('[role="menuitem"]:not([disabled])')?.focus());
    return () => cancelAnimationFrame(frame);
  }, [open]);

  const onKeyDown = (event: ReactKeyboardEvent) => {
    const itemsEls = [...(listRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])') ?? [])];
    const index = itemsEls.indexOf(document.activeElement as HTMLElement);
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      itemsEls[(index + 1) % itemsEls.length]?.focus();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      itemsEls[(index - 1 + itemsEls.length) % itemsEls.length]?.focus();
    }
  };

  return (
    <>
      {trigger({ ref: setAnchor, onClick: () => setOpen((value) => !value), 'aria-expanded': open, 'aria-haspopup': 'menu' })}
      <Popover open={open} onClose={close} anchor={anchor} align={align} width={width}>
        {header}
        <div ref={listRef} role="menu" onKeyDown={onKeyDown} className="flex flex-col">
          {items.map((item, index) =>
            item === 'separator' ? (
              <div key={`separator-${index}`} className="my-1 h-px bg-border" role="separator" />
            ) : (
              <button
                key={item.key}
                type="button"
                role="menuitem"
                disabled={item.disabled}
                onClick={() => {
                  close();
                  item.onSelect();
                }}
                className={cn(
                  'flex min-h-11 w-full items-center gap-3 rounded-md px-3 text-start text-[0.92rem] outline-none transition-base disabled:opacity-40',
                  'focus-visible:bg-surface-3 hover:bg-surface-3',
                  item.danger ? 'text-danger-text' : 'text-fg',
                )}
              >
                {item.icon && <item.icon size={17} aria-hidden className={item.danger ? '' : 'text-fg-muted'} />}
                <span className="flex-1 truncate">{item.label}</span>
                {item.hint && <span className="type-caption text-fg-subtle">{item.hint}</span>}
              </button>
            ),
          )}
        </div>
      </Popover>
    </>
  );
}
