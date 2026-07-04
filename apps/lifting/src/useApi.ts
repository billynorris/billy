import { useEffect, useState } from "react";

export interface QueryResult<T> {
  data: T | undefined;
  loading: boolean;
  error: unknown;
}

/**
 * Minimal data-fetching hook — the platform apps avoid TanStack Query, so this
 * covers the "fetch on mount / when the key changes" cases the dashboard needs.
 * `key` re-runs the query when it changes; pass `null` to skip fetching.
 */
export function useApi<T>(key: string | null, fetcher: () => Promise<T>): QueryResult<T> {
  const [data, setData] = useState<T | undefined>(undefined);
  const [loading, setLoading] = useState<boolean>(key != null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    if (key == null) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetcher()
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((e) => {
        if (!cancelled) setError(e);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return { data, loading, error };
}
