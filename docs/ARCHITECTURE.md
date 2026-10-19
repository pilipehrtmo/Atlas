# Architecture

## Decisions

| Concern | Choice | Why |
|---|---|---|
| Language | TypeScript end to end | One type system across UI, API and formulas; shared domain types. |
| Layout | npm workspaces: `packages/core`, `apps/server`, `apps/web` | Formulas and the command language are framework-free and tested once. |
| Frontend | React 19 + Vite, hand-written CSS design system, `react-resizable-panels` | A terminal needs dense custom UI, not a component kit. Vite gives fast builds with no server framework lock-in. |
| Backend | Fastify 5 + zod | Small, fast, typed validation on every route. Keys stay server-side. |
| Storage (MVP) | SQLite via built-in `node:sqlite`, SQL migrations in `apps/server/migrations` | Zero setup for a single user. Schema is plain SQL; money is stored as TEXT decimals. |
| Storage (multi-user) | PostgreSQL | Proposed for Phase 6 together with auth. The repository layer (`repo.ts`) is the only code that touches SQL. |
| Money math | `decimal.js` (isolated clone, 34 digits, banker's rounding) | No binary floating point in cost basis, P&L or valuation. |
| AI | Anthropic SDK, Claude with the Citations API | Answers can only cite the evidence Atlas retrieved; cited text is quoted verbatim. |
| Streaming | None yet | No configured provider offers streaming quotes. WebSockets will be added only with a feed that justifies them. |

## Layers

```
apps/web            presentation only: panes, command bar, views. Talks to /api, never to vendors.
apps/server
  app.ts            HTTP routes + validation (zod). Business rules for portfolios and watchlists.
  market.ts         composite endpoints (overview, screener metrics)
  ai/research.ts    retrieval (evidence pack) + Claude call with citations
  providers/        one file per vendor, each implementing capability methods
    types.ts        Provider interface and capabilities
    service.ts      DataService: routes each capability to exactly one provider per data mode
  repo.ts, db.ts    persistence and migrations
packages/core       provenance types, domain types, decimal helpers, financial formulas,
                    portfolio ledger, command registry and parser
```

Every provider method returns `ProviderResult<T>`: either `{status: 'ok', data, provenance}` or
`{status: 'unavailable', reason, retryable}`. The UI renders both explicitly. In live mode an unconfigured
capability is unavailable; DataService never falls back to demo data.

Provider plumbing (`lib/http.ts`, `lib/cache.ts`): request timeouts, bounded retries with jittered backoff on
429/5xx, a token-bucket rate limiter per provider, a daily quota guard for Alpha Vantage, an in-memory TTL cache
with in-flight de-duplication. Cached responses are flagged `cached: true` in provenance.

## Adding a data provider

1. Create `apps/server/src/providers/<vendor>.ts` implementing the capability methods it supports and `info()`
   (terms, key requirement, capabilities). Return `unavailable(...)` for every failure.
2. Put parsing in exported pure functions and test them with fixtures in `apps/server/test/`.
3. Route it in `DataService` (`service.ts`). The frontend does not change.

## Adding a terminal function

1. Add a `FunctionDef` to `FUNCTIONS` in `packages/core/src/commands.ts` (id, aliases, argument kind, example).
2. Add a view component and register it in `apps/web/src/views/index.ts`.

The command bar, autocomplete and HELP pick it up automatically.

## Security notes

- API keys are read from the server environment only and never sent to the browser.
- The server binds to 127.0.0.1 by default. `ATLAS_ACCESS_TOKEN` adds a shared bearer token for any wider exposure.
  Real multi-user auth (accounts, sessions, per-user data) is not built; see TODO.
- All SQL is parameterized; all route inputs are validated with zod.
