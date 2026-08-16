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

/**
 * Fetch JSON from an API route with loading/error state and a refresh().
 * A null url fetches nothing — for data a page only wants under a condition
 * (a permission, a tab), so the caller need not split the hook out.
 */
export function useResource<T>(url: string | null) {
  const [data, setDataState] = useState<T | null>(() =>
    url ? ((swrCache.get(url) as T) ?? null) : null,
  );
  const [loading, setLoading] = useState(url ? !swrCache.has(url) : false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!url) return;
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
    if (!url) return;
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
        if (!url) return next;
        if (next === null) swrCache.delete(url);
        else swrCache.set(url, next);
        return next;
      });
    },
    [url],
  );

  // A null url holds nothing and is never loading, whatever a previous url left
  // behind — derived rather than stored, so switching it off needs no render.
  return { data: url ? data : null, loading: url ? loading : false, error, refresh, setData };
}

/**
 * What to say when the answer did not come from the app. A gateway timeout or
 * a crashed function is a fact about the request, not about the data, and the
 * commonest one — the work took longer than the host allows — has an obvious
 * next step worth naming.
 */
function httpMessage(status: number, body: string | null): string {
  const looksLikePlatformError = !!body && /an error occurred|timed? ?out|gateway/i.test(body);
  if (status === 504 || (looksLikePlatformError && status >= 500)) {
    return "That took longer than the server allows and was cut short. Anything already done has been kept — try again to carry on.";
  }
  if (status >= 500) return `The server could not complete that (${status}).`;
  return `Request failed (${status}).`;
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
  // Not everything that answers is ours. A hosting platform returns its own
  // plain-text page when a function times out or crashes ("An error occurred
  // with this application…"), and parsing that as JSON turns a real failure
  // into "Unexpected token 'A'", which says nothing about what happened.
  let json: { error?: string } | null = null;
  let parsed = true;
  try {
    json = text ? (JSON.parse(text) as { error?: string }) : null;
  } catch {
    parsed = false;
  }
  if (!res.ok) {
    throw new Error(json?.error || httpMessage(res.status, parsed ? null : text));
  }
  if (!parsed) {
    throw new Error(httpMessage(res.status, text));
  }
  // A write anywhere may change any list — drop the read cache wholesale.
  swrCache.clear();
  return json;
}
