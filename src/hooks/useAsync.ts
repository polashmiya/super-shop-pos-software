import { useCallback, useEffect, useState, type DependencyList } from 'react';

export interface AsyncState<T> {
  data: T | undefined;
  loading: boolean;
  error: unknown;
  reload: () => void;
  setData: (data: T) => void;
}

/**
 * Loads data for a screen and keeps the previous result visible while
 * reloading (no blank flashes). Responses from outdated requests are ignored.
 * `load` is re-run whenever `deps` change (or `reload()` is called).
 */
export function useAsync<T>(load: () => Promise<T>, deps: DependencyList): AsyncState<T> {
  const [data, setData] = useState<T | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let active = true;
    const run = async () => {
      await Promise.resolve();
      if (!active) return;
      setLoading(true);
      try {
        const result = await load();
        if (active) {
          setData(result);
          setError(null);
        }
      } catch (reason) {
        if (active) {
          console.error(reason);
          setError(reason);
        }
      } finally {
        if (active) setLoading(false);
      }
    };
    void run();
    return () => {
      active = false;
    };
    // `load` is intentionally not a dependency: callers list what it depends on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  const reload = useCallback(() => setTick((value) => value + 1), []);
  return { data, loading, error, reload, setData };
}
