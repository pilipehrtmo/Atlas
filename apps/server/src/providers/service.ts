import type { DataMode, ProviderResult } from '@atlas/core';
import type { Config } from '../config.js';
import { AlphaVantageProvider } from './alphavantage.js';
import { DemoProvider } from './demo.js';
import { FredProvider } from './fred.js';
import { FrankfurterProvider } from './frankfurter.js';
import { SecEdgarProvider } from './sec.js';
import { TreasuryProvider } from './treasury.js';
import { unavailable, type Capability, type Provider } from './types.js';

/**
 * Routes each capability to exactly one provider for the active data mode.
 * Demo and live are never mixed: in live mode a capability with no configured
 * provider returns "unavailable" with the reason; it does not fall back to demo data.
 */
export class DataService {
  readonly routes: Record<Capability, Provider | null>;
  readonly providers: Provider[];
  readonly demo?: DemoProvider;

  constructor(readonly mode: DataMode, providers: { demo?: DemoProvider; sec?: SecEdgarProvider; fred?: FredProvider; fx?: FrankfurterProvider; treasury?: TreasuryProvider; prices?: AlphaVantageProvider }) {
    if (mode === 'demo') {
      const d = providers.demo ?? new DemoProvider();
      this.demo = d;
      this.providers = [d];
      this.routes = { search: d, profile: d, quote: d, history: d, fundamentals: d, macro: d, fx: d, rates: d, filings: null, news: null };
    } else {
      const { sec, fred, fx, treasury, prices } = providers;
      this.providers = [sec, prices, fred, fx, treasury].filter(Boolean) as Provider[];
      this.routes = {
        search: sec ?? null, profile: sec ?? null, filings: sec ?? null, fundamentals: sec ?? null,
        quote: prices ?? null, history: prices ?? null, macro: fred ?? null, fx: fx ?? null, rates: treasury ?? null, news: null,
      };
    }
  }

  static fromConfig(c: Config): DataService {
    if (c.ATLAS_DATA_MODE === 'demo') return new DataService('demo', {});
    return new DataService('live', {
      sec: new SecEdgarProvider(c.SEC_USER_AGENT),
      fred: new FredProvider(c.FRED_API_KEY),
      fx: new FrankfurterProvider(c.FRANKFURTER_BASE_URL),
      treasury: new TreasuryProvider(),
      prices: new AlphaVantageProvider(c.ALPHAVANTAGE_API_KEY),
    });
  }

  /** Calls `method` on the provider routed for `cap`, converting thrown errors into "unavailable". */
  async call<T>(cap: Capability, run: (p: Provider) => Promise<ProviderResult<T>> | undefined): Promise<ProviderResult<T>> {
    const p = this.routes[cap];
    if (!p) return unavailable('none', this.missingReason(cap));
    try {
      const r = run(p);
      if (!r) return unavailable(p.info().id, `${p.info().name} does not support ${cap}`);
      return await r;
    } catch (e) {
      return unavailable(p.info().id, `Unexpected provider error: ${(e as Error).message}`, true);
    }
  }

  missingReason(cap: Capability): string {
    if (this.mode === 'demo') {
      if (cap === 'filings') return 'Demo mode does not simulate filings: fabricated regulatory documents would be indistinguishable from real ones. Switch to live mode for SEC EDGAR filings.';
      if (cap === 'news') return 'Demo mode never generates news. No news provider is integrated yet.';
    }
    if (cap === 'news') return 'No licensed news provider is configured yet. See docs/DATA_PROVIDERS.md for options.';
    return `No provider is configured for ${cap}.`;
  }
}
