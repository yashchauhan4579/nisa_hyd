// Persistent, reload-surviving data cache (localStorage-backed) for the heavy
// dashboard pages. The goal: a page repaints with its last data INSTANTLY on
// re-open *and* after a full F5 reload (localStorage survives reloads + new
// tabs), then revalidates in the background — "stale-while-revalidate".
//
// Snapshots/metadata only (not raw images — those ride the browser HTTP cache).
// Entries carry a version stamp (bump to invalidate after a schema change) and
// a timestamp; a size cap + LRU eviction keeps localStorage from overflowing.
import { useCallback, useEffect, useRef, useState } from 'react';

const PREFIX = 'iris_pc:';
const VERSION = 3; // bump to invalidate all persisted caches
const MAX_ENTRIES = 60;

interface Entry<T> {
  v: number;
  ts: number;
  data: T;
}

export function cacheGet<T>(key: string): { data: T; ts: number } | null {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (!raw) return null;
    const e: Entry<T> = JSON.parse(raw);
    if (e.v !== VERSION) {
      localStorage.removeItem(PREFIX + key);
      return null;
    }
    return { data: e.data, ts: e.ts };
  } catch {
    return null;
  }
}

function pruneOldest() {
  try {
    const entries: { k: string; ts: number }[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(PREFIX)) {
        try {
          entries.push({ k, ts: JSON.parse(localStorage.getItem(k) || '{}').ts || 0 });
        } catch {
          localStorage.removeItem(k);
        }
      }
    }
    entries.sort((a, b) => a.ts - b.ts);
    for (let i = 0; i < Math.ceil(entries.length / 3); i++) localStorage.removeItem(entries[i].k);
  } catch {
    /* ignore */
  }
}

export function cacheSet<T>(key: string, data: T): void {
  const write = () => localStorage.setItem(PREFIX + key, JSON.stringify({ v: VERSION, ts: Date.now(), data } as Entry<T>));
  try {
    // soft cap on entry count
    let n = 0;
    for (let i = 0; i < localStorage.length; i++) if ((localStorage.key(i) || '').startsWith(PREFIX)) n++;
    if (n > MAX_ENTRIES) pruneOldest();
    write();
  } catch {
    // quota exceeded — evict and retry once
    pruneOldest();
    try { write(); } catch { /* give up silently */ }
  }
}

/**
 * useCachedData — returns the last-saved value for `key` IMMEDIATELY (so the
 * page paints with data, no spinner), then runs `fetcher` in the background and
 * updates + persists. `loading` is true only when there is no cached value yet.
 * Revalidates on mount and whenever `key` changes.
 */
export function useCachedData<T>(key: string, fetcher: () => Promise<T>) {
  const initial = typeof window !== 'undefined' ? cacheGet<T>(key) : null;
  const [data, setData] = useState<T | null>(initial ? initial.data : null);
  const [loading, setLoading] = useState(!initial);
  const [error, setError] = useState<unknown>(null);
  const [updatedAt, setUpdatedAt] = useState<number | null>(initial ? initial.ts : null);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const refresh = useCallback(async () => {
    try {
      const fresh = await fetcherRef.current();
      setData(fresh);
      setError(null);
      setUpdatedAt(Date.now());
      cacheSet(key, fresh);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, [key]);

  useEffect(() => {
    // re-seed synchronously if the key changed to a cached value
    const seed = cacheGet<T>(key);
    if (seed) {
      setData(seed.data);
      setUpdatedAt(seed.ts);
      setLoading(false);
    } else {
      setLoading(true);
    }
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return { data, loading, error, updatedAt, refresh };
}
