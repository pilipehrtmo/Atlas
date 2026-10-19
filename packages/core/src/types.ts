/** Domain types shared by server and web. Numbers that feed money math are
 * carried as decimal strings; plain numbers are used for display-only series. */

export type DataMode = 'demo' | 'live';

export interface Quote {
  symbol: string;
  name?: string;
  /** Decimal string. */
  price: string;
  previousClose: string | null;
  change: string | null;
  changePercent: string | null;
  open: string | null;
  high: string | null;
  low: string | null;
  volume: number | null;
  currency: string;
  /** Trading session the quote belongs to (YYYY-MM-DD). */
  sessionDate: string | null;
}

export interface Bar {
  date: string; // YYYY-MM-DD
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number | null;
}

export type HistoryRange = '1M' | '3M' | '6M' | '1Y' | '5Y' | 'MAX';

export interface CompanyProfile {
  symbol: string;
  name: string;
  cik?: string;
  exchange?: string;
  sector?: string;
  industry?: string;
  sicCode?: string;
  fiscalYearEnd?: string; // MMDD
  stateOfIncorporation?: string;
  website?: string;
  description?: string;
}

export interface Filing {
  form: string;
  filingDate: string;
  reportDate: string | null;
  accessionNumber: string;
  description: string | null;
  url: string;
}

/** One reported value of a financial statement line, as filed. */
export interface FundamentalPoint {
  /** Period end date. */
  end: string;
  /** Period start date for duration items (income, cash flow); absent for instants (balance sheet). */
  start?: string;
  value: string; // decimal string, in `unit`
  unit: string; // e.g. USD, USD/shares, shares
  fiscalYear: number | null;
  fiscalPeriod: string | null; // FY, Q1..Q4
  form: string;
  filed: string;
  accessionNumber: string;
}

export interface FundamentalLine {
  key: string; // Atlas canonical key, e.g. "revenue"
  label: string;
  concept: string; // XBRL concept actually used
  annual: FundamentalPoint[];
  quarterly: FundamentalPoint[];
}

export interface Fundamentals {
  symbol: string;
  cik: string;
  entityName: string;
  lines: FundamentalLine[];
}

export interface MacroObservation {
  date: string;
  /** null when the source reports the observation as missing. */
  value: number | null;
}

export interface MacroSeries {
  id: string;
  title: string;
  region: string;
  frequency: string;
  units: string;
  seasonalAdjustment?: string;
  lastUpdated: string | null;
  observations: MacroObservation[];
}

export interface FxRate {
  base: string;
  quote: string;
  rate: string;
  date: string;
}

export interface YieldCurvePoint {
  tenor: string; // "1M", "10Y"
  months: number;
  yieldPct: number | null;
}

export interface YieldCurve {
  date: string;
  country: string;
  points: YieldCurvePoint[];
}

export interface SymbolMatch {
  symbol: string;
  name: string;
  cik?: string;
}
