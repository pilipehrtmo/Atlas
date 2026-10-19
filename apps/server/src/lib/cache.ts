/** In-memory TTL cache with in-flight de-duplication. Values carry their own provenance, so a
 * cache hit is flagged on the way out rather than silently presented as fresh. */
export class TtlCache {
  private store = new Map<string, { expires: number; value: unknown }>();
  private inflight = new Map<string, Promise<unknown>>();
  constructor(private readonly maxEntries = 2000) {}

  async getOrLoad<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<{ value: T; hit: boolean }> {
    const now = Date.now();
    const hit = this.store.get(key);
    if (hit && hit.expires > now) return { value: hit.value as T, hit: true };
    const pending = this.inflight.get(key);
    if (pending) return { value: (await pending) as T, hit: true };
    const p = load();
    this.inflight.set(key, p);
    try {
      const value = await p;
      if (this.store.size >= this.maxEntries) this.store.delete(this.store.keys().next().value!);
      this.store.set(key, { expires: now + ttlMs, value });
      return { value, hit: false };
    } finally {
      this.inflight.delete(key);
    }
  }

  clear() {
    this.store.clear();
  }
}
