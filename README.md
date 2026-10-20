# Atlas

A keyboard-first financial research terminal: a dense four-pane workspace driven by a command line, with
company research, filings, reported financials, macro series, FX, yields, a screener, watchlists, a portfolio
ledger and a citation-grounded AI research assistant.

Atlas is an early MVP. It is not a Bloomberg replacement and does not claim comparable data coverage,
latency or reliability. Every number on screen carries its source, as-of date and timeliness
(synthetic, end of day, as reported…). Missing data is shown as `n/a`, never as zero.

## Quick start

Requirements: Node.js 22.13 or newer (Atlas uses the built-in `node:sqlite`).

```bash
npm install
cp .env.example .env        # optional: demo mode works with no .env at all
npm run dev                 # API on :8787, UI on http://localhost:5173
```

Single process (works the same in Windows PowerShell, macOS and Linux):

```bash
npm run atlas               # builds the UI, then serves it and the API on http://127.0.0.1:8787
```

Checks:

```bash
npm test                    # formulas, ledger, commands, provider parsers, API
npm run typecheck
```

## Data modes

| Mode | What you get |
|---|---|
| `demo` (default) | 16 fictional companies, 7 synthetic benchmarks, synthetic macro/FX/yields. Deterministic, offline. Labelled SYNTHETIC everywhere. Filings and news are never simulated. Real tickers return "not in the demo universe". |
| `live` | SEC EDGAR (profiles, filings, reported financials), US Treasury yields and ECB FX rates work without keys. Quotes and history need `ALPHAVANTAGE_API_KEY`; macro needs `FRED_API_KEY`. A capability without a provider shows as unavailable with the reason. |

Watchlists and portfolios are stored per mode so fictional demo symbols never mix with live ones.

## Using it

Start typing anywhere to open the command bar. `NOVA` opens a company, `NOVA FA` its financial statements,
`ECO UNRATE` a macro series, `PORT` the portfolio, `HELP` (or F1) everything else. `Alt+1..4` selects the pane
a command runs in. Full syntax: [docs/COMMANDS.md](docs/COMMANDS.md).

## Docs

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): structure, layers, how to add a provider or a function
- [docs/DATA_PROVIDERS.md](docs/DATA_PROVIDERS.md): provider assessment, licensing, costs, what is integrated
- [docs/CALCULATIONS.md](docs/CALCULATIONS.md): cost basis, returns, ratios, missing-data rules
- [docs/COMMANDS.md](docs/COMMANDS.md): command language and shortcuts
- [docs/DEPLOY.md](docs/DEPLOY.md): run Atlas 24/7 on a free cloud server with HTTPS and a sign-in
- [docs/TODO.md](docs/TODO.md): status and roadmap

Information only. Not investment advice. Atlas does not connect to brokers or place trades.
