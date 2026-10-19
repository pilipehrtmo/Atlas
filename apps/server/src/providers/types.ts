import type {
  Bar, CompanyProfile, Filing, Fundamentals, FxRate, HistoryRange, MacroSeries, ProviderResult, Quote, SymbolMatch, YieldCurve,
} from '@atlas/core';

/**
 * Capability interfaces. A provider implements any subset; the DataService
 * routes each capability to one configured provider. The frontend only sees
 * DataService responses, so vendors can be swapped without UI changes.
 */
export interface ProviderInfo {
  id: string;
  name: string;
  homepage: string;
  /** Short licensing / permitted-use note shown on the STATUS page. */
  terms: string;
  requiresKey: boolean;
  configured: boolean;
  capabilities: Capability[];
}

export type Capability = 'search' | 'profile' | 'quote' | 'history' | 'filings' | 'fundamentals' | 'macro' | 'fx' | 'rates' | 'news';

export interface Provider {
  info(): ProviderInfo;
  search?(query: string): Promise<ProviderResult<SymbolMatch[]>>;
  profile?(symbol: string): Promise<ProviderResult<CompanyProfile>>;
  quote?(symbol: string): Promise<ProviderResult<Quote>>;
  history?(symbol: string, range: HistoryRange): Promise<ProviderResult<Bar[]>>;
  filings?(symbol: string, forms?: string[]): Promise<ProviderResult<Filing[]>>;
  fundamentals?(symbol: string): Promise<ProviderResult<Fundamentals>>;
  macroSeries?(id: string): Promise<ProviderResult<MacroSeries>>;
  macroCatalog?(): MacroCatalogEntry[];
  fxRates?(base: string): Promise<ProviderResult<FxRate[]>>;
  fxHistory?(base: string, quote: string, days: number): Promise<ProviderResult<{ date: string; rate: number }[]>>;
  yieldCurve?(): Promise<ProviderResult<YieldCurve>>;
}

export interface MacroCatalogEntry {
  id: string;
  title: string;
  region: string;
  category: 'Inflation' | 'Employment' | 'Growth' | 'Rates' | 'Other';
}

export function unavailable(provider: string, reason: string, retryable = false) {
  return { status: 'unavailable' as const, provider, reason, retryable };
}

export function rangeStart(range: HistoryRange, end: Date): Date | null {
  const d = new Date(end);
  switch (range) {
    case '1M': d.setUTCMonth(d.getUTCMonth() - 1); return d;
    case '3M': d.setUTCMonth(d.getUTCMonth() - 3); return d;
    case '6M': d.setUTCMonth(d.getUTCMonth() - 6); return d;
    case '1Y': d.setUTCFullYear(d.getUTCFullYear() - 1); return d;
    case '5Y': d.setUTCFullYear(d.getUTCFullYear() - 5); return d;
    case 'MAX': return null;
  }
}
