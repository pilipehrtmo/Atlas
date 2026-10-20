# Atlas command language

Atlas has its own command syntax. It is inspired by terminal workflows but is not compatible with, or a copy of,
any other product's command system.

```
SYMBOL                     company overview (DES)          NOVA, AAPL, BRK.B
SYMBOL FUNCTION            security function              AAPL FA, MSFT FIL, NOVA GP
FUNCTION [ARGS]            workspace                      NEWS, PORT, ECO UNRATE, FX EURUSD, FILINGS MSFT
$SYMBOL ...                force a symbol that collides with a function name: $FX
... GO / <GO>              optional terminator, ignored:  AAPL <GO>
```

Functions match before symbols. Errors are reported, never guessed: `AAPL PORT` fails because PORT takes no symbol.

| Function | Aliases | Arguments | Purpose |
|---|---|---|---|
| MKT | MARKETS, TOP | none | Benchmarks, movers, sectors, FX, yields |
| DES | OVERVIEW, CO | symbol | Company overview: quote, chart, key stats, profile, financial summary |
| GP | CHART, GRAPH | symbol | Large price chart |
| FA | FIN, FINANCIALS | symbol | Reported statements, annual/quarterly, with derived margins and FCF |
| FIL | FILINGS | optional symbol | Filings with form filter and source links |
| NEWS | N | optional symbol | News (no provider connected yet) |
| EARNINGS | ERN, EVTS | optional symbol | Reported periodic results; calendar not connected |
| ECO | MACRO | optional series id | Macro indicators with source, frequency, unit, region, release date |
| YC | RATES, CURVE | none | Government yield curve |
| FX | FOREX, CCY | optional pair | Reference rates; pair history |
| SCREENER | EQS, SCREEN | none | Filters, sorting, saved screens, CSV export |
| PORT | PORTFOLIO, PRT | none | Portfolios, transactions, P&L, allocation |
| W | WATCH, WATCHLIST | none | Watchlists |
| RESEARCH | AI, ASK | optional symbol | Cited AI research over retrieved data |
| HELP | ?, H | none | Commands and shortcuts |
| STATUS | SRC, DATA | none | Data mode, providers, licensing notes |

## Keyboard

| Keys | Action |
|---|---|
| Start typing, `/`, `` ` ``, `Ctrl/Cmd+K` | Focus the command bar |
| `↑` `↓` `Tab` `Enter` `Esc` | Move, complete, run, cancel |
| `Alt+1` … `Alt+4` | Select the pane commands run in |
| `Alt+←` / `Alt+→` | Back / forward in the selected pane |
| `Alt+Enter`, double-click a pane title bar, or the □ button | Maximize the selected pane; `Alt+Enter` or `Esc` restores. `Alt+1..4` switches which pane is maximized |
| `F1` | Help |

Recent commands are stored on the server and offered first in autocomplete. Pane contents and sizes are saved
automatically and restored on reload.
