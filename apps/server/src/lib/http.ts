/** Outbound HTTP for providers: timeouts, bounded retries with backoff, and per-provider rate limiting. */

export class ProviderError extends Error {
  constructor(
    message: string,
    public readonly provider: string,
    public readonly retryable: boolean,
    public readonly status?: number,
  ) {
    super(message);
  }
}

/** Token bucket. `ratePerSec` tokens refill continuously up to `burst`. */
export class RateLimiter {
  private tokens: number;
  private last = Date.now();
  private queue: Promise<void> = Promise.resolve();
  constructor(private readonly ratePerSec: number, private readonly burst: number) {
    this.tokens = burst;
  }
  acquire(): Promise<void> {
    const next = this.queue.then(async () => {
      for (;;) {
        const now = Date.now();
        this.tokens = Math.min(this.burst, this.tokens + ((now - this.last) / 1000) * this.ratePerSec);
        this.last = now;
        if (this.tokens >= 1) {
          this.tokens -= 1;
          return;
        }
        await new Promise((r) => setTimeout(r, Math.ceil(((1 - this.tokens) / this.ratePerSec) * 1000)));
      }
    });
    this.queue = next.catch(() => undefined);
    return next;
  }
}

/** Fixed daily quota (e.g. Alpha Vantage free tier). Resets at UTC midnight. */
export class DailyQuota {
  private day = '';
  private used = 0;
  constructor(public readonly limit: number) {}
  take(): boolean {
    const d = new Date().toISOString().slice(0, 10);
    if (d !== this.day) {
      this.day = d;
      this.used = 0;
    }
    if (this.used >= this.limit) return false;
    this.used++;
    return true;
  }
  remaining(): number {
    const d = new Date().toISOString().slice(0, 10);
    return d === this.day ? this.limit - this.used : this.limit;
  }
}

export interface FetchOptions {
  provider: string;
  headers?: Record<string, string>;
  timeoutMs?: number;
  retries?: number;
  limiter?: RateLimiter;
  fetchImpl?: typeof fetch;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function fetchText(url: string, opts: FetchOptions): Promise<string> {
  const retries = opts.retries ?? 2;
  const f = opts.fetchImpl ?? fetch;
  let lastErr: ProviderError | undefined;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) await sleep(500 * 2 ** (attempt - 1) + Math.random() * 200);
    await opts.limiter?.acquire();
    try {
      const res = await f(url, { headers: opts.headers, signal: AbortSignal.timeout(opts.timeoutMs ?? 10_000) });
      if (res.ok) return await res.text();
      const retryable = res.status === 429 || res.status >= 500;
      lastErr = new ProviderError(`${opts.provider} responded ${res.status}`, opts.provider, retryable, res.status);
      if (!retryable) throw lastErr;
    } catch (e) {
      if (e instanceof ProviderError && !e.retryable) throw e;
      lastErr = e instanceof ProviderError ? e : new ProviderError(`${opts.provider} request failed: ${(e as Error).message}`, opts.provider, true);
    }
  }
  throw lastErr!;
}

export async function fetchJson<T = unknown>(url: string, opts: FetchOptions): Promise<T> {
  const text = await fetchText(url, opts);
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new ProviderError(`${opts.provider} returned invalid JSON`, opts.provider, false);
  }
}
