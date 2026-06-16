"use client";

import { useEffect, useRef, useState, useCallback } from "react";

interface PollingOptions {
  intervalMs?: number;
  enabled?: boolean;
  immediate?: boolean;
}

/**
 * Generic polling hook. Repeatedly calls `fetcher` on an interval and exposes
 * the latest data, loading and error state. Polling pauses when the tab is
 * hidden and can be stopped via the `enabled` option.
 */
export function usePolling<T>(
  fetcher: () => Promise<T>,
  { intervalMs = 3000, enabled = true, immediate = true }: PollingOptions = {},
) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(immediate);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const tick = useCallback(async () => {
    try {
      const result = await fetcherRef.current();
      setData(result);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    let timer: ReturnType<typeof setInterval> | null = null;

    const run = async () => {
      if (!active) return;
      if (document.visibilityState === "hidden") return;
      await tick();
    };

    if (immediate) void run();
    timer = setInterval(run, intervalMs);

    const onVisible = () => {
      if (document.visibilityState === "visible") void run();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      active = false;
      if (timer) clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [enabled, intervalMs, immediate, tick]);

  return { data, error, loading, refetch: tick };
}
