import { useCallback, useEffect, useRef, useState } from 'react';
import { APP_CONFIG } from '@/config/app.config';

/**
 * Text of a search box that commits (e.g. to the URL) after the user pauses
 * typing. Returns [text, change, reset]; `reset` sets the text without
 * committing (used by "Clear filters").
 */
export function useSearchText(initial: string, onCommit: (value: string) => void, delay: number = APP_CONFIG.tables.searchDebounceMs): [string, (value: string) => void, (value?: string) => void] {
  const [text, setText] = useState(initial);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const commitRef = useRef(onCommit);

  useEffect(() => {
    commitRef.current = onCommit;
  }, [onCommit]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const change = useCallback(
    (value: string) => {
      setText(value);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => commitRef.current(value.trim()), delay);
    },
    [delay],
  );

  const reset = useCallback((value = '') => {
    if (timer.current) clearTimeout(timer.current);
    setText(value);
  }, []);

  return [text, change, reset];
}
