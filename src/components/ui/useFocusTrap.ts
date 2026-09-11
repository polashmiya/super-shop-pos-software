import { useEffect, type RefObject } from 'react';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
const FOCUS_HISTORY = 8;

/**
 * The last few focused elements. A dialog field with `autoFocus` takes the
 * focus while React mounts it — before any effect runs — so the trap looks
 * here to find where the focus was just before the dialog opened.
 */
const recentFocus: HTMLElement[] = [];
if (typeof document !== 'undefined') {
  document.addEventListener(
    'focusin',
    (event) => {
      if (!(event.target instanceof HTMLElement)) return;
      recentFocus.push(event.target);
      if (recentFocus.length > FOCUS_HISTORY) recentFocus.shift();
    },
    true,
  );
}

/** The element to give the focus back to when the dialog closes. */
function focusedBefore(container: HTMLElement): HTMLElement | null {
  const active = document.activeElement;
  if (!(active instanceof HTMLElement) || active === document.body) return null;
  if (!container.contains(active)) return active;
  for (let index = recentFocus.length - 1; index >= 0; index -= 1) {
    const element = recentFocus[index];
    if (element.isConnected && !container.contains(element)) return element;
  }
  return null;
}

/**
 * Keeps Tab/Shift+Tab inside the container, focuses the first field
 * (`initialFocus`, `[data-autofocus]`, a field that focused itself, or the
 * first focusable element) and restores the previous focus on unmount.
 */
export function useFocusTrap(containerRef: RefObject<HTMLElement | null>, active: boolean, initialFocus?: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    if (!active) return;
    const container = containerRef.current;
    if (!container) return;
    const previous = focusedBefore(container);
    const focusFirst = () => {
      const explicit = initialFocus?.current ?? container.querySelector<HTMLElement>('[data-autofocus]');
      const current = document.activeElement;
      // A field that focused itself on mount (autoFocus) keeps the focus.
      if (!explicit && current instanceof HTMLElement && current !== container && container.contains(current)) return;
      const target = explicit ?? container.querySelector<HTMLElement>(FOCUSABLE) ?? container;
      target.focus({ preventScroll: true });
    };
    const frame = requestAnimationFrame(focusFirst);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const items = [...container.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((element) => element.offsetParent !== null);
      if (items.length === 0) {
        event.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    container.addEventListener('keydown', onKeyDown);
    return () => {
      cancelAnimationFrame(frame);
      container.removeEventListener('keydown', onKeyDown);
      if (previous && document.contains(previous)) previous.focus({ preventScroll: true });
    };
  }, [active, containerRef, initialFocus]);
}
