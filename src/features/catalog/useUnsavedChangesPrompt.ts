import { useEffect, useRef } from 'react';
import { useBlocker, type Location } from 'react-router';

/* ==========================================================================
   Asks before an in-app navigation throws away unsaved form changes (links,
   sidebar, Back). Navigations that pass LEAVE_WITHOUT_PROMPT as location
   state — e.g. the redirect after saving — are never blocked.
   ========================================================================== */

export const LEAVE_WITHOUT_PROMPT = { leaveWithoutPrompt: true } as const;

function leavesWithoutPrompt(location: Location): boolean {
  const state: unknown = location.state;
  return typeof state === 'object' && state !== null && 'leaveWithoutPrompt' in state && state.leaveWithoutPrompt === true;
}

/**
 * Blocks leaving the current screen while `dirty` is true and asks with
 * `ask()` (resolve true to leave). Signing out is never blocked.
 */
export function useUnsavedChangesPrompt(dirty: boolean, ask: () => Promise<boolean>): void {
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) => dirty && currentLocation.pathname !== nextLocation.pathname && nextLocation.pathname !== '/login' && !leavesWithoutPrompt(nextLocation),
  );
  const askRef = useRef(ask);

  useEffect(() => {
    askRef.current = ask;
  });

  useEffect(() => {
    if (blocker.state !== 'blocked') return;
    let active = true;
    void askRef.current().then((leave) => {
      if (!active) return;
      if (leave) blocker.proceed();
      else blocker.reset();
    });
    return () => {
      active = false;
    };
  }, [blocker]);
}
