import { useEffect, useMemo, type RefObject } from 'react';
import { useLocation, useSearchParams } from 'react-router';
import { useAuthStore } from '@/stores/authStore';
import { SETTINGS_SECTIONS, type SettingsSection } from './sections';

/* ==========================================================================
   Settings centre access + "jump to a setting" (search results link to
   /settings/<section>?focus=<anchor>; the control is scrolled into view,
   focused and briefly highlighted).
   ========================================================================== */

/** Sections the signed-in user may open (hidden without their permission). */
export function useVisibleSections(): SettingsSection[] {
  const permissions = useAuthStore((state) => state.permissions);
  return useMemo(() => SETTINGS_SECTIONS.filter((section) => section.permission === null || permissions.has(section.permission)), [permissions]);
}

const HIGHLIGHT_MS = 2_400;
const POLL_MS = 60;
const MAX_ATTEMPTS = 30;

/** Scrolls to and highlights `[data-setting=<focus>]`; a new section without a focus starts at the top. */
export function useHighlightSetting(containerRef: RefObject<HTMLElement | null>, sectionId: string): void {
  const [params] = useSearchParams();
  const location = useLocation();
  const focus = params.get('focus');

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    if (!focus) {
      container.scrollTo({ top: 0 });
      return;
    }
    let attempts = 0;
    let clearTimer: ReturnType<typeof setTimeout> | undefined;
    // Sections load lazily: wait until the control is on the page.
    const poll = setInterval(() => {
      attempts += 1;
      const target = container.querySelector<HTMLElement>(`[data-setting="${CSS.escape(focus)}"]`);
      if (!target && attempts < MAX_ATTEMPTS) return;
      clearInterval(poll);
      if (!target) return;
      target.scrollIntoView({ block: 'center', behavior: 'smooth' });
      target.setAttribute('data-highlight', 'on');
      target.querySelector<HTMLElement>('input:not([type="file"]), select, textarea, button')?.focus({ preventScroll: true });
      clearTimer = setTimeout(() => target.removeAttribute('data-highlight'), HIGHLIGHT_MS);
    }, POLL_MS);
    return () => {
      clearInterval(poll);
      if (clearTimer) clearTimeout(clearTimer);
    };
  }, [containerRef, focus, sectionId, location.key]);
}
