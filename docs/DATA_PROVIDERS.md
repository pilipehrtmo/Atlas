# Data provider assessment

Status as of 2026-10-19. Prices, limits and terms below are from published plans as last known to the team and
**could not be re-verified from the build environment** (its network policy blocks these hosts). Check each
provider's current pricing and terms before any purchase. Atlas has not signed up for or paid for anything.

## Integrated

| Provider | Capabilities in Atlas | Key | Cost | Limits | Timeliness | Licensing / redistribution | Attribution |
|---|---|---|---|---|---|---|---|
| SEC EDGAR (data.sec.gov) | ticker search, company profile, filings index with document links, reported financials (XBRL companyfacts) | none; descriptive User-Agent required | free | 10 req/s fair access | as filed | US government public data | not required; Atlas links to source |
| US Treasury daily par yield curve | yield curve | none | free | be polite (Atlas: 2 req/s) | end of day | US government public data | not required |
| ECB euro reference rates via Frankfurter | FX latest and history (~30 currencies) | none | free | not published; Atlas: 5 req/s | daily, ~16:00 CET on TARGET days | ECB reuse allowed with source attribution; reference rates, not for transactions | "Source: ECB" (shown) |
| FRED (St. Louis Fed) | macro series (CPI, PCE, payrolls, unemployment, GDP, policy rates, yields, any series id) | free key | free | 120 req/min | per series release | free API terms; **some series are third-party copyrighted** and not redistributable commercially | FRED + original source (shown) |
| Alpha Vantage | quotes, daily history | free key | free tier; premium plans from roughly $50/month | free: 25 req/day | Atlas labels free data **end of day**; real-time US data needs a premium plan and entitlement | personal use; redistribution needs a commercial license | "Data provided by Alpha Vantage" (shown) |
| Anthropic Claude API | RESEARCH answers with citations | API key | usage-based; Claude Opus 5.5 lists at $4 / $20 per million input/output tokens | account limits | n/a | Atlas sends only the retrieved evidence pack | answers are marked AI-generated |

**Live verification (2026-10-20, GitHub Actions):** Treasury yield curve and ECB/Frankfurter FX (latest and 30-day
history) pass against the real services. SEC EDGAR refused GitHub's runner IPs with its "Undeclared Automated Tool" and
"Request Rate Threshold Exceeded" pages, so the SEC adapter has still not been exercised live; run
`npx tsx scripts/live-check.ts` in `apps/server` from a home or office connection with `SEC_USER_AGENT` set to a real
contact. FRED and Alpha Vantage need their keys. CI reports an SEC IP block as BLOCKED with a warning, not a failure.

## Evaluated, not integrated

| Provider | Would add | Cost (verify) | Notes |
|---|---|---|---|
| Massive (formerly Polygon.io) | US stocks/options/FX/crypto prices, aggregates, reference data, corporate actions, news | free tier ~5 req/min EOD; paid tiers from ~$29/month; real-time needs exchange entitlement | Strong candidate for the price layer. Display/redistribution rights depend on plan; business use needs a business plan. |
| Tiingo | EOD prices (long history, adjusted), IEX intraday, news | free tier; ~$30/month individual | Good adjusted EOD history; news API is a paid add-on. |
| Finnhub | company news, earnings calendar, basic fundamentals, insider transactions | free 60 req/min (personal, non-commercial); commercial plans much higher | Best low-cost candidate for NEWS and EARNINGS in a personal deployment. |
| Financial Modeling Prep | normalized fundamentals, estimates, price targets, transcripts | free ~250 req/day; paid ~$20–100/month | Estimates/targets would let DES show sourced analyst data. |
| Twelve Data | global equities, FX, crypto, indices | free ~800 req/day; paid from ~$30/month | Broader non-US coverage. |
| CoinGecko | crypto prices and market data | free demo key ~30 req/min | Attribution required. |
| Bloomberg, LSEG, FactSet, S&P | institutional coverage and real-time feeds | tens of thousands USD per user per year | Out of scope for the MVP. |
| Yahoo Finance (unofficial endpoints), Stooq, scraping | prices | free | **Excluded**: no clear license for this use; Yahoo's terms prohibit it. |

## Gaps that need a licensed source

- Real-time or delayed intraday quotes and index levels (exchange fees and agreements apply to real-time display).
- News headlines and article text (redistribution rights vary; most free tiers are non-commercial).
- Analyst estimates, price targets, earnings calendar, insider transactions beyond SEC Form 4 parsing.
- Market-wide data for movers, sectors and a live screener.

## Recommendation (needs approval before any spend)

1. Keep the free government sources (SEC, Treasury, ECB, FRED) as the reference backbone.
2. Price layer: Massive (Polygon) or Tiingo paid individual plan (~$30/month) instead of Alpha Vantage free, which
   at 25 requests/day cannot keep a watchlist and portfolio priced.
3. News and earnings calendar: Finnhub free tier for a personal deployment; a commercial news license before any
   multi-user or public deployment.
4. Before publishing Atlas to other users: confirm redistribution rights for every provider, since free and
   individual plans generally do not allow showing data to third parties.
