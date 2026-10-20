# Calculations

Implemented in `packages/core/src/finance.ts` and `portfolio.ts`; tested in `packages/core/test/`.

## General rules

- Money and quantities are decimal strings, computed with decimal.js. Chart series use JS numbers for display only.
- A missing input yields `null`, rendered `n/a`. Nothing missing is ever treated as zero.
- Ratios are fractions internally (0.05 = 5%).
- Provider placeholders such as `"."` (FRED), `"None"`, `"-"` and empty strings parse as missing.

## Portfolio ledger

- Transactions: BUY, SELL, DIVIDEND, DEPOSIT, WITHDRAWAL, FEE, SPLIT. Applied in date order; same-day order is entry order.
- **Cost basis: weighted average cost.** A buy adds `qty × price + fee` to total cost. A sell removes
  `average cost × qty` from total cost and realizes `qty × price − fee − cost removed`.
- Selling more than is held is rejected (no short positions). Each instrument keeps a single currency.
- **Splits** multiply quantity by the ratio (4 = 4-for-1, 0.1 = 1-for-10) and leave total cost unchanged.
- **Dividends** are cash income, tracked per position and added to cash. They do not change cost basis.
- **Cash** is tracked per currency; buys and fees reduce it, sells, deposits and dividends increase it.
- Every new transaction (and every deletion) is validated against the whole ledger before it is saved.

## Valuation

- Market value = quantity × latest available price, in the instrument's currency.
- Conversion to the portfolio base currency uses the provider's reference rate: base units per one unit of the
  foreign currency = 1 / (rate quoted as 1 base = r foreign).
- If any holding has no price or any currency has no rate, **total value is reported as unavailable**, the
  valued subtotal is shown separately, and the missing items are listed. Weights are only shown when complete.
- Unrealized P&L = market value − remaining total cost. Unrealized % = that / remaining total cost.

## Returns and ratios

- Simple return = (end − start) / start; null if start is zero.
- Annualized = (1 + r)^(365 / days) − 1, calendar days.
- CAGR = (end / start)^(1 / years) − 1; null for non-positive inputs.
- Time-weighted return chains sub-period returns `V_i / (V_{i−1} + F_i) − 1`, with external flows at the start of a
  period, so deposits and withdrawals are not counted as performance.

## Portfolio performance history

- Each trading date in the window (the union of the holdings' and benchmark's price dates, from the range start or
  the first transaction, whichever is later) is valued at that day's close, carried forward at most 7 calendar days.
  Foreign holdings use that date's FX rate (ECB reference rates in live mode), also carried forward at most 7 days.
- **Cash-tracked** portfolios (at least one DEPOSIT): value = holdings + cash; flows are deposits (+) and
  withdrawals (−).
- **Holdings-only** portfolios (no DEPOSIT): cash is not modelled, so value = holdings; a buy (cost plus fee) is
  money in, a sell (proceeds after fee) and a dividend are money out, and a FEE is money in.
- Daily TWR links `V_d / (V_{d−1} + F_d)`. When the window starts before the first transaction, the first period's
  base is that day's flow; otherwise the chain opens at the first day's value.
- A day that cannot be valued (missing price or FX) has no value, never zero. It breaks the chain: later cumulative
  returns and the window TWR are n/a, because the return across the gap is unknown, and the gap count is shown.
- Annualized return is shown only for windows of at least 365 days.
- The benchmark line is close-to-close price return (not total return), rebased to 0% on the portfolio's first
  valued date. Excess return = portfolio TWR − benchmark return, in percentage points.
- P/E = price / latest fiscal-year diluted EPS; not shown when EPS ≤ 0.
- Margins = line / revenue for the same period. Free cash flow = operating cash flow − capital expenditure.
- Price history is not split- or dividend-adjusted unless the provider says so (Alpha Vantage free series are not).

## Fiscal versus calendar periods

SEC XBRL facts carry `fy`/`fp` for the **filing**, not the period: a FY2024 10-K also reports FY2023 and FY2022
comparatives tagged `fy=2024`. Atlas therefore only labels a period with a fiscal year when it is the newest period
in that filing, otherwise it shows the period end date. Annual values must cover 330–400 days; quarterly values
80–100 days (year-to-date figures are excluded). When several filings report the same period, the latest filing
wins, so restatements replace originals; the accession number used is shown on hover. Fourth quarters are not
derived.
