/** Canonical statement lines and the US-GAAP XBRL concepts that report them, in order of preference.
 * Companies use different concepts for the same line; the first concept with data wins and the
 * concept actually used is returned to the UI so the mapping is auditable. */
export interface LineDef {
  key: string;
  label: string;
  statement: 'income' | 'balance' | 'cashflow' | 'per-share' | 'shares';
  kind: 'duration' | 'instant';
  unit: 'USD' | 'USD/shares' | 'shares';
  concepts: string[];
}

export const LINES: LineDef[] = [
  { key: 'revenue', label: 'Revenue', statement: 'income', kind: 'duration', unit: 'USD', concepts: ['RevenueFromContractWithCustomerExcludingAssessedTax', 'Revenues', 'SalesRevenueNet', 'RevenueFromContractWithCustomerIncludingAssessedTax'] },
  { key: 'grossProfit', label: 'Gross Profit', statement: 'income', kind: 'duration', unit: 'USD', concepts: ['GrossProfit'] },
  { key: 'operatingIncome', label: 'Operating Income', statement: 'income', kind: 'duration', unit: 'USD', concepts: ['OperatingIncomeLoss'] },
  { key: 'netIncome', label: 'Net Income', statement: 'income', kind: 'duration', unit: 'USD', concepts: ['NetIncomeLoss', 'ProfitLoss'] },
  { key: 'epsDiluted', label: 'Diluted EPS', statement: 'per-share', kind: 'duration', unit: 'USD/shares', concepts: ['EarningsPerShareDiluted'] },
  { key: 'operatingCashFlow', label: 'Operating Cash Flow', statement: 'cashflow', kind: 'duration', unit: 'USD', concepts: ['NetCashProvidedByUsedInOperatingActivities'] },
  { key: 'capex', label: 'Capital Expenditure', statement: 'cashflow', kind: 'duration', unit: 'USD', concepts: ['PaymentsToAcquirePropertyPlantAndEquipment'] },
  { key: 'dividendsPerShare', label: 'Dividends / Share (declared)', statement: 'per-share', kind: 'duration', unit: 'USD/shares', concepts: ['CommonStockDividendsPerShareDeclared'] },
  { key: 'cash', label: 'Cash & Equivalents', statement: 'balance', kind: 'instant', unit: 'USD', concepts: ['CashAndCashEquivalentsAtCarryingValue'] },
  { key: 'totalAssets', label: 'Total Assets', statement: 'balance', kind: 'instant', unit: 'USD', concepts: ['Assets'] },
  { key: 'totalLiabilities', label: 'Total Liabilities', statement: 'balance', kind: 'instant', unit: 'USD', concepts: ['Liabilities'] },
  { key: 'longTermDebt', label: 'Long-Term Debt', statement: 'balance', kind: 'instant', unit: 'USD', concepts: ['LongTermDebtNoncurrent', 'LongTermDebt'] },
  { key: 'equity', label: "Stockholders' Equity", statement: 'balance', kind: 'instant', unit: 'USD', concepts: ['StockholdersEquity'] },
  { key: 'sharesOutstanding', label: 'Shares Outstanding', statement: 'shares', kind: 'instant', unit: 'shares', concepts: ['dei:EntityCommonStockSharesOutstanding', 'CommonStockSharesOutstanding'] },
];
