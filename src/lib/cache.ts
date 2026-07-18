import "server-only";

// Tiny in-process TTL cache for hot, rarely-changing lookups (session user,
// role permissions). On serverless the process is reused across requests, so
// this trims the 2 extra DB round-trips that preceded every API query.
// Mutating routes invalidate their prefix so admin changes apply immediately
// in the same process; other processes converge within the TTL.
type Entry = { value: unknown; expires: number };
const store = new Map<string, Entry>();

export async function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const hit = store.get(key);
  if (hit && hit.expires > Date.now()) return hit.value as T;
  const value = await fn();
  store.set(key, { value, expires: Date.now() + ttlMs });
  return value;
}

/** Drop every cache entry whose key starts with the prefix. */
export function invalidateCache(prefix: string) {
  for (const k of store.keys()) if (k.startsWith(prefix)) store.delete(k);
}
