import { useCallback, useEffect, useRef, useState } from 'react';

export class ApiError extends Error {
  constructor(message: string, public readonly status: number, public readonly issues?: string[]) {
    super(message);
  }
}

const token = () => {
  try {
    return localStorage.getItem('atlas.token');
  } catch {
    return null;
  }
};

export function setToken(value: string | null) {
  try {
    if (value) localStorage.setItem('atlas.token', value);
    else localStorage.removeItem('atlas.token');
  } catch {
    // Storage blocked (private window): the token lasts only until reload.
  }
}

export async function api<T = unknown>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (init.body !== undefined) headers['content-type'] = 'application/json';
  const t = token();
  if (t) headers.authorization = `Bearer ${t}`;
  let res: Response;
  try {
    res = await fetch(path, { method: init.method ?? 'GET', headers, body: init.body === undefined ? undefined : JSON.stringify(init.body) });
  } catch {
    throw new ApiError('Cannot reach the Atlas server. Is it running?', 0);
  }
  const text = await res.text();
  const json = text ? JSON.parse(text) : null;
  if (!res.ok) throw new ApiError(json?.error ?? `Request failed (${res.status})`, res.status, json?.issues);
  return json as T;
}

/** Fetches `path` (skips when null). Responses are cached briefly per path so switching panes is instant. */
const cache = new Map<string, { at: number; value: unknown }>();
const TTL = 30_000;

export function useApi<T>(path: string | null, deps: unknown[] = []) {
  const [state, setState] = useState<{ data: T | null; error: ApiError | null; loading: boolean }>(() => {
    const c = path ? cache.get(path) : undefined;
    return { data: (c?.value as T) ?? null, error: null, loading: !!path && !c };
  });
  const seq = useRef(0);
  const load = useCallback(
    (force = false) => {
      if (!path) return;
      const c = cache.get(path);
      if (!force && c && Date.now() - c.at < TTL) {
        setState({ data: c.value as T, error: null, loading: false });
        return;
      }
      const n = ++seq.current;
      setState((s) => ({ ...s, loading: true, error: null }));
      api<T>(path)
        .then((data) => {
          cache.set(path, { at: Date.now(), value: data });
          if (n === seq.current) setState({ data, error: null, loading: false });
        })
        .catch((error: ApiError) => n === seq.current && setState({ data: null, error, loading: false }));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [path, ...deps],
  );
  useEffect(() => load(), [load]);
  return { ...state, reload: () => load(true) };
}

export function invalidate(prefix: string) {
  for (const k of cache.keys()) if (k.startsWith(prefix)) cache.delete(k);
}
