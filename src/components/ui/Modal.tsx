import { useEffect, useId, useRef, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from './cn';
import { useFocusTrap } from './useFocusTrap';

/* ==========================================================================
   Accessible dialog: focus trap, Escape to close, focus restoration, scroll
   lock via a fixed overlay. Used for every dialog (spec §105).
   ========================================================================== */

export type ModalSize = 'sm' | 'md' | 'lg' | 'xl' | 'full';

const SIZES: Record<ModalSize, string> = {
  sm: 'max-w-md',
  md: 'max-w-xl',
  lg: 'max-w-3xl',
  xl: 'max-w-5xl',
  full: 'max-w-[min(1400px,96vw)]',
};

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  size?: ModalSize;
  footer?: ReactNode;
  children: ReactNode;
  closeLabel?: string;
  initialFocus?: RefObject<HTMLElement | null>;
  /** Prevent closing with Escape / outside click (e.g. while saving). */
  dismissible?: boolean;
  className?: string;
  bodyClassName?: string;
  hideHeader?: boolean;
}

export function Modal({
  open,
  onClose,
  title,
  description,
  icon,
  size = 'md',
  footer,
  children,
  closeLabel = 'Close',
  initialFocus,
  dismissible = true,
  className,
  bodyClassName,
  hideHeader,
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const titleId = useId();
  const descriptionId = useId();
  useFocusTrap(panelRef, open, initialFocus);

  useEffect(() => {
    if (!open || !dismissible) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [open, dismissible, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 sm:p-6" data-modal-root>
      <div className="absolute inset-0 bg-overlay animate-fade-in" onMouseDown={() => dismissible && onClose()} aria-hidden />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        className={cn(
          'relative flex max-h-[calc(100vh-2rem)] w-full flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-lg outline-none animate-pop-in',
          SIZES[size],
          className,
        )}
      >
        {!hideHeader && (title || icon) && (
          <header className="flex items-start gap-3 border-b border-border px-6 py-4">
            {icon}
            <div className="min-w-0 flex-1">
              {title && (
                <h2 id={titleId} className="type-h2 text-fg">
                  {title}
                </h2>
              )}
              {description && (
                <p id={descriptionId} className="type-body-sm mt-0.5 text-fg-muted">
                  {description}
                </p>
              )}
            </div>
            {dismissible && (
              <button type="button" onClick={onClose} aria-label={closeLabel} className="-me-2 flex h-10 w-10 items-center justify-center rounded-md text-fg-muted hover:bg-surface-3 hover:text-fg">
                <X size={20} aria-hidden />
              </button>
            )}
          </header>
        )}
        <div className={cn('min-h-0 flex-1 overflow-y-auto px-6 py-5', bodyClassName)}>{children}</div>
        {footer && <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-border bg-surface-2/60 px-6 py-3.5">{footer}</footer>}
      </div>
    </div>,
    document.body,
  );
}

export interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  width?: 'sm' | 'md' | 'lg' | 'xl';
  closeLabel?: string;
  headerExtra?: ReactNode;
}

const DRAWER_WIDTHS = { sm: 'max-w-sm', md: 'max-w-md', lg: 'max-w-2xl', xl: 'max-w-4xl' };

/** Side panel (details, filters, held sales). */
export function Drawer({ open, onClose, title, description, children, footer, width = 'md', closeLabel = 'Close', headerExtra }: DrawerProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const titleId = useId();
  useFocusTrap(panelRef, open);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[55] flex justify-end">
      <div className="absolute inset-0 bg-overlay animate-fade-in" onMouseDown={onClose} aria-hidden />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        tabIndex={-1}
        className={cn('relative flex h-full w-full flex-col border-s border-border bg-surface shadow-lg outline-none animate-slide-in-right', DRAWER_WIDTHS[width])}
      >
        <header className="flex items-start gap-3 border-b border-border px-5 py-4">
          <div className="min-w-0 flex-1">
            {title && (
              <h2 id={titleId} className="type-h2 text-fg">
                {title}
              </h2>
            )}
            {description && <p className="type-body-sm mt-0.5 text-fg-muted">{description}</p>}
          </div>
          {headerExtra}
          <button type="button" onClick={onClose} aria-label={closeLabel} className="-me-2 flex h-10 w-10 items-center justify-center rounded-md text-fg-muted hover:bg-surface-3 hover:text-fg">
            <X size={20} aria-hidden />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
        {footer && <footer className="flex items-center justify-end gap-2 border-t border-border px-5 py-3.5">{footer}</footer>}
      </div>
    </div>,
    document.body,
  );
}
