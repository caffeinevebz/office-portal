"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Debounce a fast-changing value (search input) so list URLs — and therefore
 * refetches — only change once typing pauses, not on every keystroke.
 */
export function useDebounced<T>(value: T, ms = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

// Stale-while-revalidate cache: navigating back to a page (or re-applying a
// filter) renders the last-known data instantly while a background refetch
// brings it up to date. Any mutation clears the cache so nothing stale
// survives a write.
const swrCache = new Map<string, unknown>();

/** Fetch JSON from an API route with loading/error state and a refresh(). */
export function useResource<T>(url: string) {
  const [data, setDataState] = useState<T | null>(() => (swrCache.get(url) as T) ?? null);
  const [loading, setLoading] = useState(!swrCache.has(url));
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setError(null);
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const json = (await res.json()) as T;
      swrCache.set(url, json);
      setDataState(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }, [url]);

  useEffect(() => {
    const hit = swrCache.get(url) as T | undefined;
    if (hit !== undefined) {
      // Serve the cached copy instantly; revalidate quietly behind it.
      setDataState(hit);
      setLoading(false);
    } else {
      setDataState(null);
      setLoading(true);
    }
    refresh();
  }, [url, refresh]);

  // Local row updates (in-place PATCH results) also keep the cache current.
  const setData = useCallback(
    (updater: T | null | ((prev: T | null) => T | null)) => {
      setDataState((prev) => {
        const next =
          typeof updater === "function" ? (updater as (p: T | null) => T | null)(prev) : updater;
        if (next === null) swrCache.delete(url);
        else swrCache.set(url, next);
        return next;
      });
    },
    [url],
  );

  return { data, loading, error, refresh, setData };
}

/** Send a JSON mutation (POST/PUT/PATCH/DELETE). Throws on non-2xx. */
export async function apiMutate(
  url: string,
  method: "POST" | "PUT" | "PATCH" | "DELETE",
  body?: unknown,
) {
  const res = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : null;
  if (!res.ok) {
    throw new Error(json?.error || `Request failed (${res.status})`);
  }
  // A write anywhere may change any list — drop the read cache wholesale.
  swrCache.clear();
  return json;
}
