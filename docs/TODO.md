# Status and roadmap

Legend: ✅ works and is tested · 🟡 partial · ❌ not built

## Phase 1–2: shell and foundations
- ✅ Four-pane resizable workspace, saved layout and pane contents (server-side)
- ✅ Command bar: parser, autocomplete (functions, symbols, recents), errors, HELP
- ✅ Keyboard: type-anywhere, `/`, Ctrl+K, Alt+1..4, Alt+←/→, F1
- ✅ Design system: dark, dense, mono numerics, provenance tags, loading/empty/error/unavailable states
- ✅ Configurable product name (`ATLAS_PRODUCT_NAME`)
- ✅ Pane maximize (Alt+Enter, double-click title, button; Esc restores)
- ❌ More than four panes, named workspaces

## Phase 3: data
- ✅ Provider abstraction with capability routing, provenance, caching, retries, rate limits, quota guard
- ✅ Demo mode (synthetic, fictional, deterministic); never mixed with live
- 🟡 SEC EDGAR, Treasury, ECB/Frankfurter, FRED, Alpha Vantage adapters: parsers tested against documented
  response shapes. Treasury and ECB verified live in CI; SEC blocks CI runner IPs and is still unverified live;
  FRED and Alpha Vantage need keys (see DATA_PROVIDERS.md)
- ❌ Licensed intraday/delayed prices, index levels, news, estimates (see DATA_PROVIDERS.md)
- ❌ Persistent cache / scheduled ingestion jobs (cache is in-memory)

## Phase 4: modules
- ✅ DES, GP, FA (annual/quarterly, derived margins, FCF), FIL, ECO, YC, FX, W, PORT, STATUS
- 🟡 MKT: demo complete; live has ETF proxies, FX and yields, no movers or sectors
- 🟡 SCREENER: filters, sort, saved screens, CSV export work in demo; live screener not built
- 🟡 EARNINGS: reported results from filings; no forward calendar
- ❌ NEWS feed, alerts, comparable-company analysis, dividend history, corporate actions feed
- ✅ Portfolio performance history (daily value, TWR, annualized) with benchmark comparison
- ❌ Sector/geography allocation, CSV import

## Phase 5: AI
- ✅ Evidence pack retrieval with provenance; Claude Citations API; facts / interpretation / missing-data structure
- 🟡 Not tested against the live Claude API (no key in the build environment)
- ❌ News-based catalysts, thesis tracking, hallucination evaluation set

## Phase 6: quality and deployment
- ✅ 58 automated tests (formulas, ledger, parser, provider parsers, API), typecheck, production build
- ✅ GitHub Actions CI: typecheck, unit tests, build, Playwright E2E (demo mode), weekday live-data checks
- ❌ Multi-user auth and Postgres, deployment config
