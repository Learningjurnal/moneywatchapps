# MoneyWatch Pro — Known Issues (not yet investigated/fixed)

Observed-but-deferred findings — distinct from `INCIDENT_LOG.md`, which is
only for incidents that have already been root-caused and fixed. An entry
here moves to `INCIDENT_LOG.md` once actually worked.

---

## #1 — Crypto price fetch via `/api/proxy` appears to always fail for `*-IDR` pairs

- **Found:** 2026-09-10, from a routine Vercel log check (not a user report
  of broken behavior — found by pattern, not by a complaint).
- **Evidence:** in one log window (11:03–11:06 UTC), **9 of 9** requests to
  `/api/proxy` for a Yahoo Finance chart URL ending in `-IDR` returned
  HTTP 404. All 9 distinct symbols: `BTC-IDR`, `ETH-IDR`, `BNB-IDR`,
  `SOL-IDR`, `ADA-IDR`, `AVAX-IDR`, `DOT-IDR`, `LINK-IDR`, `MATIC-IDR`.
  Every non-crypto request in the same window succeeded (200).
- **Suspected cause (not yet confirmed):** Yahoo Finance likely does not
  publish direct crypto→IDR pairs — typically only `*-USD` (e.g.
  `BTC-USD`) exists. If the crypto feature always requests the `-IDR`
  suffix, this would fail 100% of the time by construction, not
  intermittently — consistent with what was observed, but this is a
  hypothesis, not yet verified against Yahoo's actual supported symbol
  list or traced to the exact code path that builds these URLs.
- **Suspected impact:** any crypto price display/portfolio-valuation
  feature that depends on this endpoint is likely silently degraded or
  broken for every ticker, not just occasionally — worth confirming
  whether it fails open (honest "unavailable") or produces a stale/wrong
  number.
- **Status:** deferred at the user's request ("catat dulu, lanjut nanti")
  — not yet investigated further, not yet root-caused, no fix attempted.
- **Next step when picked up:** find the code path that constructs the
  `*-IDR` Yahoo symbol (likely in `public/js` crypto-related files or a
  server-side crypto handler) and confirm whether Yahoo has a real
  IDR-denominated symbol for these pairs at all, or whether this needs a
  USD pair + a separate USD/IDR conversion step.

---

## #2 — Market Heatmap / FS_RD-based Alerts can display fabricated
signals with no "simulated" disclosure

- **Found:** 2026-09-10, while investigating whether `public/js/07-flowscan.js`'s
  `FS_RD` data (`fsInit()`) was safe to reuse for a Command Center
  "Market Heatmap" / "Alerts" preview card on the Dashboard
  (`UIUX_ROADMAP_AUDIT.md` §6/§7, P0 slice 3) — not from a user report.
- **Evidence:** `fsGenData(tk, days)` (`07-flowscan.js:86`) prioritizes
  real cached OHLCV (`rdGetAny(tk)`), but when no real data is cached yet
  for a ticker, it falls through to a **synthetic random-walk price
  series** (`fsSr()` seeded random, `07-flowscan.js:~130-148`) while
  kicking off a real background fetch (`rdEnsure()`) for next time.
  `fsRenderHeatmap()` (`:581`) and `fsGenAlerts()` (`:633`) — which
  produce heatmap cells and alert messages like *"Akumulasi kuat: BBCA —
  Skor 85/100"* — read `r.a.sc`/`r.a.sig` directly with **no check
  anywhere on whether the underlying data for that ticker was real or
  synthetic**, and render no simulation indicator either way.
- **Suspected impact:** any ticker whose real OHLCV hasn't been cached
  yet at the moment `fsInit()` runs can show an "Akumulasi kuat" /
  "Distribusi terdeteksi" alert, or a heatmap cell with a specific
  score, derived entirely from fabricated data — presented
  indistinguishably from a signal computed on real data. This is the
  same class of problem `isSimulated`/`gateStatus`/`assessDataQuality()`
  were built elsewhere in this app (Yahoo quotes, AI Trading signals,
  Data Quality Gate) specifically to prevent, but it was never applied
  to this code path.
- **Status:** deferred — not fixed. `fsGenData()`/`FS_RD` feed multiple
  features (Ranking, Screener, Heatmap, Alerts, TradeWave), so a real fix
  needs to audit all of them, not patch one call site. Explicitly NOT
  reused for the Dashboard Command Center's Market Heatmap/Alerts zones
  because of this — building a preview card on top would move exposure
  to potentially-fabricated signals from a rarely-visited page to the
  homepage, the opposite of the fix this needs.
- **Next step when picked up:** thread a `isSimulated`/data-quality flag
  through `fsGenData()`'s synthetic fallback branch (mirroring the
  pattern already used in `fetchYahooQuote()`/`assessDataQuality()`),
  and surface it in `fsRenderHeatmap()`/`fsGenAlerts()`/wherever else
  reads `FS_RD` — audit every consumer of `FS_RD`, not just these two,
  before considering it safe to build new features (like a Command
  Center card) on top of.

---

## #3 — Bandarmology "Analisis Full Market" (Smart Money Flow) computes
institutional flow from a fabricated volume figure, no disclosure

- **Found:** 2026-09-10, same investigation pass as #2 above — checking
  whether Bandarmology's market-wide aggregate view was safe to reuse for
  a Command Center "Smart Money Flow" preview card.
- **Evidence:** `generateClientSideBrokerSummary(ticker, timeframe)`
  (`public/js/41-stockchat-cockpit.js:176`) — the function name itself
  says "client-side generate" — computes `adjVolLots` (the transaction
  volume every downstream "Smart Money Net"/"Foreign Flow"/verdict
  figure is derived from) as `baseVolLots * (0.9 + randOffset)`, where
  `baseVolLots` is a hardcoded per-market-cap-tier constant and
  `randOffset` is a pseudo-random value **seeded from the ticker
  string's own character codes** (`seed += tk.charCodeAt(i) * (i+1)`) —
  not from any real broker/exchange data. Price and % change ARE real
  (via `getAccurateStockPrice()`/`getGlobalMarketChange()`), and
  historical VWAP tries real cached OHLCV (`rdGetAny`) — but the volume,
  and everything computed from it, is not.
- **Suspected impact:** `renderBandarmologyMarketFlowView()` (the
  "ANALISIS FULL MARKET" tab of Bandarmology, called via
  `goBandarmology('market', ...)`/`setBandarmologyMode('market')`) uses
  this to show per-bank and per-sector net institutional flow in Rupiah
  with an "ACCUMULATION"/"DISTRIBUTION" verdict — for all of it, not just
  a temporary cache-miss fallback (unlike #2's `fsGenData()`, which at
  least tries real cached data first). No "simulated"/disclosure label
  found anywhere in this path. Distinct from the real broker-summary
  system fixed earlier this session (`fetchBrokerSummaryData()` →
  `/api/idx/broker-summary/...`, used by the per-stock Top Buyer/Seller
  tables) — this is a separate, synchronous, always-fabricated code path
  used specifically for the multi-ticker market aggregate (likely
  because awaiting the real async API for many tickers at once in a
  synchronous render function wasn't implemented).
- **Status:** deferred — not fixed. Explicitly NOT reused for a Dashboard
  Command Center "Smart Money Flow" zone because of this — same reasoning
  as #2: building a preview card on the homepage would amplify exposure
  to fabricated institutional-flow claims, not reduce it.
- **Next step when picked up:** either (a) rewrite the market-aggregate
  view to await the real `/api/idx/broker-summary/...` endpoint per
  ticker (accepting the added latency/complexity of a multi-ticker async
  render), or (b) if that's not feasible for all tickers shown, add an
  explicit, visible "estimasi, bukan data broker riil" disclosure to
  every figure `generateClientSideBrokerSummary()` produces, matching how
  other estimated/fallback numbers are already labeled elsewhere in this
  app (e.g. `24-stockmaster.js`'s fundamental estimate fallback).
