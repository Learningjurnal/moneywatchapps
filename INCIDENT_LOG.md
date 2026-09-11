# MoneyWatch Pro — Production Incident Log

Purpose: a durable record of real production bugs, their root cause, and
the fix — so a recurring pattern is visible as a pattern instead of being
re-diagnosed from scratch each time. See `AGENTS.md` §29 (Cross-File
Refactor Safety) for the process rules these incidents led to.

Format per entry: what broke, how it was found, root cause, fix, and what
was added afterward to make the same class of bug harder to ship again.

---

## #1 — `getBeiTickSize is not defined` breaking all live quotes

- **Date:** 2026-09-10
- **Found by:** the user, from a Vercel runtime log export (185 warnings
  in one hour, all identical, all on `/api/idx/quote/BBCA`).
- **Impact:** every real-time quote fetch (`fetchYahooQuote()`) failed
  for every ticker, app-wide, from the moment the provider-adapter
  refactor (#86) merged until the hotfix (#87) merged (~2 hours later).
- **Root cause:** the provider-adapter refactor split
  `lib/idx-data-engine.js` into `lib/providers/yahoo-client.js` and
  `lib/providers/idx-client.js`. `fetchYahooQuote()` (moved into the
  Yahoo file) calls `getBeiTickSize()` (moved into the IDX file), but
  `yahoo-client.js` never imported it. `node --check` (the only lint this
  project ran at the time) only parses syntax — a call to an undeclared
  identifier is syntactically valid JavaScript, so nothing caught it
  before merge, and the provider layer had zero automated test coverage
  (both files need live network — finance.yahoo.com / idx.co.id — which
  the CI/dev sandbox doesn't have) so `npm test` didn't catch it either.
- **Fix:** `import { getBeiTickSize } from './idx-client.js';` in
  `yahoo-client.js` (PR #87).
- **Prevention added:**
  - `eslint.config.js` + `eslint lib server.js` wired into `npm run lint`
    — `no-undef` catches exactly this class of bug statically, before
    merge, with no test run required. Verified against this exact
    incident (see `AGENTS.md` §29 / `test_provider_functions.js`).
  - `test_provider_functions.js` INCIDENT #1 case: runs the real
    `fetchYahooQuote()` against a mocked `global.fetch`, asserting the
    returned `orderBook` (the field `getBeiTickSize()` builds) is
    well-formed — added to `npm test`.

---

## #2 — Infinite retry loop in Stock Intel auto-fetch

- **Date:** 2026-09-10 (same day, found while investigating an unusual
  traffic pattern related to #1)
- **Found by:** the user, from the same Vercel log export — 978 requests
  to `/api/idx/quote/BBCA` + 946 to `/api/idx/broker-summary/BBCA` in
  ~18 minutes, all HTTP 500, all from a single browser session, gaps as
  tight as 100-500ms with no deliberate delay.
- **Impact:** while a tab with the Stock Intel page open kept failing to
  fetch a quote, it hammered the app's own backend (and transitively
  Yahoo Finance) continuously, for as long as the tab stayed open. #1
  was the immediate trigger (it made the fetch always fail), but this is
  a separate, latent bug — it can resurface any time the fetch fails for
  *any* reason (a real Yahoo outage, rate limiting, a network blip),
  with or without #1 being involved.
- **Root cause:** `fetchRealStockIntelData()`'s `finally` block always
  calls `renderStockIntelPage()`, which re-enters that same function's
  own "auto-fetch on mount if not cached" guard. When the fetch fails,
  the cache never gets populated, so the very next render's guard passes
  again — with no cooldown, backoff, or attempt cap of any kind.
- **Fix:** `MW_INTEL_LAST_ATTEMPT` + `MW_INTEL_RETRY_COOLDOWN_MS` (30s) —
  the auto-fetch guard now also requires the cooldown to have elapsed
  since the last attempt (success or failure) for that ticker (PR #88).
  The manual "Refresh Real-Time" button is unaffected (calls the fetch
  function directly, bypassing the guard).
- **Prevention added:**
  - The guard was extracted into a standalone pure function,
    `intelShouldAutoFetch()`, specifically so it can be tested without a
    DOM.
  - `test_provider_functions.js` INCIDENT #2 case: loads the real
    `public/js/27-stockintel.js` in a sandboxed VM context and calls the
    real `intelShouldAutoFetch()`, asserting a simulated sustained
    failure produces exactly one attempt (not an unbounded retry loop)
    within the cooldown window, and that it resumes correctly once the
    cooldown elapses (self-healing) — added to `npm test`.
  - `AGENTS.md` §29's "self-re-triggering function pattern" rule: any
    function whose completion callback re-enters its own trigger
    condition needs an explicit cooldown/backoff/max-attempt guard,
    verified under a simulated sustained-failure scenario before
    shipping — not just declared and assumed correct.

---

## #3 — Same infinite-retry-loop bug class in AI Trading's universe auto-load

- **Date:** 2026-09-10 (same day)
- **Found by:** a proactive sweep of `public/js/**` for the exact pattern
  behind #2 (`finally { ...; render() }` re-entering its own auto-fetch
  guard with no cooldown) — **not** from a user report or a log symptom.
  This is the first incident in this log found by pattern search rather
  than by an observed failure.
- **Impact (latent, not yet confirmed to have fired in production):**
  `public/js/38-ai-autonomous-trading.js`'s `ensureFullUniverseLoaded()`
  is called from every AI Trading tab's render path (5 call sites:
  ~lines 1175, 1289, 1448, 1566, 1941). If `fetchAiScanData()` ever
  fails (Yahoo outage, rate limit, network blip) while the AI Trading
  page is open, every subsequent render would re-trigger the fetch
  immediately with no cooldown — identical failure mode to #2, just on
  a different page/dataset (the AI scan universe instead of a single
  ticker's quote).
- **Root cause:** `fetchAiScanData()`'s `finally` block always calls
  `renderAiTradingPage()`, which calls `ensureFullUniverseLoaded()`,
  which re-enters the same "load if `!AI_UNIVERSE.length`" guard with no
  cooldown, backoff, or attempt cap — the same unguarded re-entrant
  pattern as #2, in a different file.
- **Fix:** `AI_SCAN_LAST_ATTEMPT` + `AI_SCAN_RETRY_COOLDOWN_MS` (30s),
  guard extracted into a standalone pure function
  `aiShouldAutoLoadUniverse()`, wired into `ensureFullUniverseLoaded()`.
  `fetchAiScanData()` records the attempt timestamp at the very start,
  before the network call, so a hang counts as an attempt too.
- **Prevention added:**
  - `test_provider_functions.js` INCIDENT #3 case: this file is wrapped
    in an IIFE (unlike `27-stockintel.js`), so its internal state is
    closure-private and not reachable from outside a sandboxed VM
    context. The test instead drives time through a controllable
    `Date.now()` and drives state exclusively through the real exported
    `fetchAiScanData()` / `aiShouldAutoLoadUniverse()` functions against
    a mocked always-failing `fetch` — asserting exactly one attempt
    within the cooldown window and correct self-healing after it
    elapses. Verified to actually fail (with a clear message) when the
    fix is reverted, before being added to `npm test`.
  - Confirms the value of `AGENTS.md` §29's pattern rule beyond the
    incident that prompted it: the same rule, applied as a search
    pattern rather than a checklist item, found a second real instance
    before it ever reached production logs.

---

## #4 — No double-submit guard on 7 of 8 modal "Konfirmasi/Simpan" buttons

- **Date:** 2026-09-10 (same day)
- **Found by:** a proactive sweep for a different bug pattern class — not
  from a user report or a log symptom. Noticed `submitDivModal()`
  (`public/js/05-assets.js`) already has a duplicate-detection fix (see its
  own `FIX AUDIT` comment: "dividen tercatat 2x") but the other 7 modal
  submit functions (Buy/Sell saham, crypto, ETF, reksa dana, Setor/Tarik,
  Penyesuaian Saldo, Biaya) had no equivalent protection at all.
- **Impact (latent, not yet confirmed to have fired in production):** a
  fast double-click or double-tap on any "Konfirmasi"/"Simpan" button would
  fire two separate, fully-completed `click` handler invocations. Each one
  writes an unconditional new transaction/mutation with zero duplicate
  detection (`addTx()`, `addCryptoTx()`, `addEtfTx()`, `addRdTx()`,
  `addRdn()` all just `.push()` unconditionally) — a real double-submit
  would silently double the shares, double the cash debit/credit, and
  double the fees on the user's own portfolio data, with no error and no
  indication anything went wrong.
- **Root cause:** `closeModal()` only removes a CSS class (`.on`) from the
  modal — it never disables the confirm `<button>` or otherwise blocks a
  second `click` event already in flight. Because click targets for a
  physical double-click are resolved from the original pointer
  down/up coordinates (not re-checked against DOM visibility at dispatch
  time), a queued second `click` still reaches the same handler even after
  the first invocation has already run to completion and hidden the modal.
  An in-function "isSubmitting" flag reset at the end of the function
  cannot catch this either — JS's single-threaded event loop means the
  first invocation always finishes (flag back to false) before the second
  one starts, so the two calls never literally overlap for a boolean flag
  to guard against.
- **Fix:** a shared timestamp-cooldown guard, `_modalSubmitAllowed()`
  (800ms), called once in each of the 8 submit functions right after field
  validation passes and right before the actual data write — so a failed
  validation never consumes the cooldown, but two valid submits within
  800ms only let the first one through.
- **Prevention added:**
  - `test_suite.js` TEST 32: a pure contract test for
    `_modalSubmitAllowed()`'s cooldown-boundary behavior, plus a
    regression guard that greps `05-assets.js` for exactly 8
    `if(!_modalSubmitAllowed()) return;` call sites — catches both a
    dropped guard and a new modal submit function added without one.
    Verified to actually fail (with a clear message naming the missing
    count) when one guard call site is removed, before being added to
    `npm test`.

---

## #5 — `escapeHtml is not defined` in AI Copilot, newly reachable after
activating its navigation

- **Date:** 2026-09-10 (same day)
- **Found by:** live headless-browser click-through (server run locally,
  Chromium/Playwright) while wiring up real sidebar navigation for the
  `copilot` page (`UIUX_ROADMAP_AUDIT.md` §1.3 had flagged it as a fully-
  built feature — real AI chat UI, real `/api/ai/agent-chat` backend —
  with zero navigation entry point anywhere in the app). The bug had
  always existed in the code but was unreachable through the UI, so it
  never surfaced until this session's audit gave it a way in.
- **Impact:** `public/js/28-decisiontools.js`'s Copilot message renderer
  calls `escapeHtml()` when the AI's reply includes tool calls (badges
  like `cek_harga({"ticker":"BBCA"})`) — a common, expected path, not an
  edge case, since the AI agent routinely uses tools. `escapeHtml` was
  never defined anywhere in the entire codebase. Sending any message that
  produced a tool-call response threw `pageerror: escapeHtml is not
  defined`, confirmed with a real click-through against the real backend
  endpoint (not a source-only read) — the AI actually invoked
  `cek_harga`/`cek_fundamental`/`hitung_proyeksi_risiko_drawdown` and the
  render crashed on the badge markup for each one.
- **Root cause:** the function was presumably assumed to exist (maybe
  copied from a reference implementation that had one) when this file was
  written, and since the page had no navigation entry point, nobody —
  human or automated — ever exercised this code path to notice.
- **Fix:** added a real `escapeHtml()` to `public/js/01-data.js` (loaded
  first, already proven safely loadable standalone via `vm` — see
  `lib/universe.js`'s `loadBaseUniverse()`) — escapes all 5 HTML-special
  characters (`& < > " '`), coerces `null`/`undefined` to an empty string
  rather than the literal text `"null"`/`"undefined"`.
- **Prevention added:**
  - `test_suite.js` TEST 33: loads the real `01-data.js` via the same `vm`
    sandbox technique `lib/universe.js` already uses in production,
    asserts `escapeHtml()`'s actual escaping behavior, plus a regression
    guard counting `escapeHtml(` call sites in `28-decisiontools.js`.
    Verified to actually fail (clear message) when the function is
    removed again, before being added to `npm test`.
  - Confirms the value of navigation-audit work as a bug-finding method in
    its own right: activating a previously-unreachable page is itself a
    form of test coverage — dead code paths can hide real bugs that no
    amount of source reading catches, only actually running them does.

---

## #6 — FlowScan's fabricated random-walk fallback (`fsGenData()`) shown
with no simulation disclosure across 5 views

- **Date:** 2026-09-10 (same day), moved here from `KNOWN_ISSUES.md` #2
  once fixed.
- **Found by:** code audit while checking whether `07-flowscan.js`'s
  `FS_RD` data was safe to reuse for a Dashboard Command Center card
  (`UIUX_ROADMAP_AUDIT.md` §6/§7) — not a user report.
- **Impact:** `fsGenData(tk, days)` prioritizes real cached OHLCV
  (`rdGetAny(tk)`) but falls through to a seeded random-walk series
  (`fsSr()`) when none is cached yet for a ticker. Every "Big Money
  Score"/"AKUMULASI"/"DISTRIBUSI" signal derived from that series was
  shown identically to one derived from real data, with the sole
  exception of the Ranking table (which already had a green-dot/red-"○
  SIM" marker, but keyed off `rdIsReal(r.t)` — whether *any* real cache
  exists at all — rather than whether this specific call actually used
  it, so it could read real for a ticker with 1-4 cached rows while
  `fsGenData()` had still used the synthetic branch). Heatmap, Alerts,
  Watchlist, and the single-ticker FlowScan deep-dive view had no
  disclosure at all.
- **Root cause:** `fsGenData()`'s synthetic fallback branch never tagged
  its output as simulated, so nothing downstream could tell real and
  fabricated data apart — the same class of gap `isSimulated`/
  `assessDataQuality()` were built elsewhere in this app to close, never
  applied to this code path.
- **Fix:** `fsGenData()` now sets `.simulated` (`true`/`false`) directly
  on the array it returns — the array object itself carries the flag, so
  every consumer holding a reference to `r.data`/`w.data`/the local
  `data` var can read it with no extra plumbing through the
  `Object.assign({...}, {data, a})` wrapper objects built in `fsInit()`,
  `fsSyncWithPortfolio()`, `fsTgWl()`, `fsRunAnalysis()`. A shared
  `fsSrcDot(isSimulated)` helper renders the marker consistently; applied
  to `fsRenderRanking()` (upgraded from `rdIsReal()` to the exact flag),
  `fsRenderHeatmap()`, `fsGenAlerts()` (disclosed via an "[Estimasi]"
  prefix + sub-text note rather than hidden — hiding would remove most
  alerts for any ticker without a cache hit yet), `fsRenderWlPage()`, and
  `fsRunAnalysis()`'s cards/price label.
- **Prevention added:** none yet — no automated test covers this path
  (would need to force the synthetic branch and assert the marker
  appears in the rendered HTML); deferred, not blocking, since the fix
  itself was verified live via Playwright (see below).
- **Verification:** `npm test` (all passing), `npm run lint` clean, live
  Playwright check with a ticker that has no cached OHLCV confirmed the
  red "○ SIM" marker + outline on Ranking/Heatmap/Watchlist/single-ticker
  view and the "[Estimasi]" prefix on its alerts; a ticker with real
  cached data showed the green "●" marker and no alert prefix.

---

## #7 — 5 of 8 Bandarmology views showed simulated broker-flow figures
with no disclosure (2 already did)

- **Date:** 2026-09-10 (same day), moved here from `KNOWN_ISSUES.md` #3
  once fixed.
- **Found by:** code audit, same investigation pass as #6 above — checking
  whether Bandarmology's data was safe to reuse for a Dashboard Command
  Center "Smart Money Flow" card.
- **Correction to the original finding:** the investigation's initial
  claim — that `renderBandarmologyMarketFlowView()` ("Analisis Full
  Market") had no simulation disclosure anywhere — was wrong. `git log -S`
  shows that view's amber disclosure banner and "SIMULASI" badge (which
  replaced a misleading "LIVE AGGREGATION" label) were added in commit
  `21e7132` on 2026-09-06, four days before this was filed as an issue,
  and were already on `main`. `renderBandarmology1YearBrokerCostMatrix()`
  and `renderBandarmologyHeatmapScannerView()` also already had
  disclosure badges. This was an investigation error, not a regression —
  recorded here so it isn't repeated.
- **Impact (the real gap):** `generateClientSideBrokerSummary(ticker,
  timeframe)` (`41-stockchat-cockpit.js:176`) computes transaction volume
  from a per-market-cap-tier constant times a pseudo-random offset seeded
  from the ticker string's own character codes — not real broker/exchange
  data (price and % change are real; volume and everything derived from
  it is not). Five Bandarmology views read this with zero disclosure:
  `renderBandarmologyForeignFlowView()` (Top 5 Foreign Buy/Sell),
  `renderBandarmologyAccumulationView()`, `renderBandarmologyDistributionView()`,
  `renderBandarmologySmartMoneyRadarView()` (Smart Money vs Retail
  Footprint), `renderBandarmologyBrokerTrailView()`.
- **Root cause:** the disclosure banner added to Market Flow (commit
  `21e7132`) was never propagated to the other views built on the same
  `generateClientSideBrokerSummary()` function — each view was written
  independently rather than through a shared "this data might be
  simulated" render path.
- **Fix:** added a shared `bandarSimBanner(extraNote)` helper (same
  amber-banner visual pattern already proven in Market Flow) and
  prepended it to all five views' returned HTML.
- **New issue found while fixing this, not folded in:** during the audit,
  `renderBandarmologySmartMoneyFlowView()` turned out to have a deeper,
  distinct problem — its CMF/VWAP/Volume Surge figures aren't computed
  from `generateClientSideBrokerSummary()` or anything at all; they're
  two hardcoded literals selected by `isUp` (`cmfVal` is either exactly
  `0.24` or exactly `-0.18`), under badges ("ALGORITMA PENETRASI HARGA
  BEI", "CHART ENGINE (60 CANDLES)") that imply a real calculation. Given
  its own `bandarSimBanner()` disclosure for now; filed as
  `KNOWN_ISSUES.md` #4 for the real fix (replace with `07-flowscan.js`'s
  actual `fsCalcCMF()` against real cached OHLCV).
- **Prevention added:** none yet — same gap as #6 (no automated test
  covers Bandarmology view HTML output); deferred, not blocking, verified
  live instead.
- **Verification:** `npm test`, `npm run lint` clean, live Playwright
  check that all five previously-undisclosed tabs (plus Smart Money Flow)
  now render the amber disclosure banner.

---

## #8 — `renderBandarmologySmartMoneyFlowView()`'s CMF/VWAP/Volume Surge
were hardcoded literals, not computed from anything

- **Date:** 2026-09-10 (same day), moved here from `KNOWN_ISSUES.md` #4
  once fixed.
- **Found by:** code audit while fixing #7 above.
- **Impact:** `cmfVal = isUp ? 0.24 : -0.18;` — exactly one of two possible
  values, chosen only by whether the ticker's price was up or down that
  day, not computed from any OHLCV/volume data. `vwapSession`/`vwapUpper`/
  `vwapLower` were fixed percentage offsets off the current price, and
  `volSurge` was one of two fixed strings. The view's own badges
  ("ALGORITMA PENETRASI HARGA BEI", "CHART ENGINE (60 CANDLES)") implied a
  real calculation against 60 candles; in reality CMF could only ever
  display as `+0.24` or `-0.18`, for every ticker, every day.
- **Root cause:** the summary cards at the top of the view were written
  independently of `mountBandarmologySmartMoneyCharts()` — the chart-
  drawing function immediately below them in the same file — which
  already computed a real CMF/VWAP for the exact same ticker via
  `fsGenData()`/`fsProcess()`/`fsCalcVWAP()`/`fsCalcVWAPStdDev()` for its
  charts. The cards never reused that real computation.
- **Fix:** replaced the hardcoded literals with the same real computation
  the chart already used: `fsGenData(ticker, 60)` → `fsProcess(data)` for
  `cmfVal` (`a.cl`, the real last-bar CMF-20) and `volSurge` (`a.last.vr`,
  real volume vs 20-day average); `fsCalcVWAP(data)`/
  `fsCalcVWAPStdDev(data, vwap)` for `vwapSession`/`vwapUpper`/
  `vwapLower` (last value ± 2σ, matching the chart's own band formula
  exactly). The 4th card ("ACCUMULATION INDEX (A/D)") was also silently
  wrong in a second way — it displayed `isUp` (price direction) under an
  "A/D" (Accumulation/Distribution line) label; switched to `fsProcess()`'s
  real `adT` (whether the cumulative A/D value actually trended up over
  the last ~5 bars), which can and does disagree with price direction.
  `fsGenData()`'s `.simulated` flag (`KNOWN_ISSUES.md` #2's fix) is now
  read directly (`isSimFlow`), so the disclosure banner only shows when
  the underlying 60-day series really is the synthetic fallback — a
  blanket "always simulated" banner would now be wrong on a real cache
  hit.
- **Prevention added:** none yet — same gap as #6/#7 (no automated test
  covers Bandarmology view HTML output); deferred, verified live instead.
- **Verification:** `npm test` (75/75), `npm run lint` clean, live
  Playwright check across 3 tickers (BBCA, ANTM, TLKM) confirming the
  card's displayed CMF and VWAP exactly match an independent
  `fsGenData()`/`fsProcess()`/`fsCalcVWAP()` recomputation for that same
  ticker (previously only 2 possible CMF values existed across all
  tickers; now 3 different tickers produced 3 different real values:
  `+0.20`, `+0.13`, `-0.03`), and the disclosure banner correctly appears
  since this sandbox has no real Yahoo access (all 3 tickers' underlying
  series were the honestly-disclosed synthetic fallback). Zero page
  errors.

---

## #9 — Scenario Engine crashed the tab ("Maximum call stack size
exceeded") once every portfolio ticker + IHSG had failed to fetch once

- **Date:** 2026-09-10 (same day), found proactively during a post-session
  QA sweep of all 52 routable pages (Tahap 7 — QA & Regression,
  `UIUX_ROADMAP_AUDIT.md` §17) — not from a user report.
- **Found by:** a Playwright sweep visiting every page and collecting
  `pageerror` events; the Scenario Engine page (`goPage('scenario')`)
  threw `RangeError: Maximum call stack size exceeded` with a stack trace
  repeating `renderScenarioPage → scenarioGetRealRisk →
  perfComputeRealBeta → perfFetchHoldingsHistory` over and over.
- **Impact:** opening (or revisiting) the Scenario Engine page while every
  portfolio ticker's and IHSG's real-data fetch has already failed once
  this session crashes/freezes the tab outright — worse than a hung
  request, since a stack overflow is synchronous and blocks the main
  thread immediately. This is a real, reachable production state (a
  Yahoo/proxy outage that day, not just this sandbox's permanently-blocked
  network), not a sandbox-only artifact.
- **Root cause:** the exact same self-re-triggering pattern as
  `INCIDENT_LOG.md` #2 and #3 (`AGENTS.md` §29 names this bug class
  explicitly), but manifesting as a stack overflow instead of an infinite
  async retry storm, because the completion callback here CAN resolve
  synchronously. `scenarioGetRealRisk()`'s call to `perfComputeRealBeta()`
  had its completion callback call `renderScenarioPage()` directly, and
  `renderScenarioPage()` calls `scenarioGetRealRisk()` again at its own
  top. A real Yahoo fetch takes real time, so normally the callback fires
  on a later tick and this never nests inside its own call stack. But
  `rdEnsure()` (`13-realdata.js`) has a synchronous fast path —
  `if(RD_FAILED[tk]){ cb('failed'); return; }` — for any ticker that
  already failed once this session. Once every portfolio ticker + IHSG
  hits that fast path, the entire `scenarioGetRealRisk → perfComputeRealBeta
  → perfFetchHoldingsHistory → rdEnsure` chain resolves synchronously, so
  the "re-render" lands inside the ORIGINAL render's own stack frame —
  unbounded recursion.
- **Fix:** two independent guards, both required (verified: removing
  either one alone still leaves a real bug — the cooldown alone doesn't
  stop the *first* synchronous recursive call from overflowing the stack,
  and the defer alone doesn't stop a synchronous-resolution retry storm
  across separate renders from spinning in a tight `setTimeout(0)` loop):
  1. `scenarioShouldRetryRisk()` — a 30s cooldown guard
     (`SCENARIO_RISK_LAST_ATTEMPT`/`SCENARIO_RISK_RETRY_COOLDOWN_MS`),
     same pattern as `intelShouldAutoFetch()` (#2) and
     `aiShouldAutoLoadUniverse()` (#3).
  2. The `renderScenarioPage()` re-render call is now wrapped in
     `setTimeout(fn, 0)` — guarantees it can never nest inside the call
     stack of the render that triggered it, regardless of how fast
     `perfComputeRealBeta()`'s callback fires.
- **Prevention added:**
  - `test_provider_functions.js` INCIDENT #4 case: loads the real
    `public/js/28-decisiontools.js` in a sandboxed VM context (same
    technique as #2/#3) and calls the real `scenarioShouldRetryRisk()`,
    asserting a simulated synchronous-failure attempt is blocked within
    the cooldown window and allowed again after — added to `npm test`.
  - A second regression guard specifically asserts the `setTimeout(...)`
    wrapper around the `renderScenarioPage()` call survives future edits
    — the cooldown test alone wouldn't catch someone removing just the
    defer while leaving the cooldown intact, which would still leave the
    first-call stack-overflow half of this bug live.
  - Both guards verified to actually fail (clear message) with the fix
    reverted, before being restored and finalized.
- **Verification:** live Playwright reproduction — forced
  `RD_FAILED[ticker]=true` for every portfolio ticker + IHSG (the exact
  triggering state), visited the Scenario Engine page (previously
  crashed here), then revisited it 3 more times rapidly (would tight-loop
  without the cooldown): survived all of it with zero page errors.
- **Also checked, not bugs:** the same sweep flagged errors on
  `candle`/`technical` (`chartInstance.update is not a function`) and
  `crypto-technical` (`Chart.getChart is not a function`) — re-verified
  with a more faithful Chart.js stub (real Chart.js instances expose
  `update()`/`getChart()`; this sandbox's CDN-blocked network means the
  sweep's minimal stub only had `destroy()`) and all 3 pages loaded with
  zero errors — confirmed test-stub artifacts, not application bugs.

---

## #10 — FlowScan showed the literal string "IHSG" as a sector badge for
portfolio holdings with no sector data

- **Date:** 2026-09-11.
- **Found by:** the user, from a screenshot of the FlowScan Watchlist
  table — several rows (ERAA, GGRM, CPRI, PMMP, RAJA, DEWA, MBMA, PRDL,
  GMFI) showed "IHSG" as their sector badge, next to other rows correctly
  showing "Konsumer"/"Tambang"/"Energi"/etc.
- **Impact:** "IHSG" is the composite index (Indeks Harga Saham
  Gabungan), not a sector — showing it as one is nonsensical and reads as
  a data-sync bug (which is exactly how the user described it: "daftar
  watchlist sectoralnya tidak sinkron"). Affected any portfolio holding
  bulk-imported without its own sector metadata, across Ranking, Heatmap,
  Watchlist, and the single-ticker FlowScan view — anywhere `07-flowscan.js`
  looks up a ticker's sector.
- **Root cause:** `public/js/07-flowscan.js` had 6 separate places
  falling back to the sector-shaped placeholder `"IHSG"` when a ticker's
  own `sector` field was empty — both `FS_UNIV`'s construction from
  `XLSX_DATA.stocks` (the user's real portfolio import) and 5 duplicate
  "ticker not found in `FS_UNIV`" fallback objects. None of them checked
  `DB[tk].sector`, which `01-data.js` already backfills from
  `_IDX_RAW_LIST` for real IDX tickers at script-load time — nor did any
  of them use `'Lainnya'`, the "sector unknown" convention already
  established everywhere else in this app (`01-data.js`,
  `06-analysis-router.js`, `22-datahealth.js`).
- **Fix:** `FS_UNIV`'s construction now tries `s.sector` → `DB[s.code].sector`
  → `'Lainnya'`, in that order. The 5 duplicate fallback objects were
  replaced with a single shared `fsFallbackInfo(tk)` helper (tries
  `DB[tk].sector` → `'Lainnya'`) so there's one place to get this right
  instead of five copies that can drift.
- **Prevention added:** `test_suite.js` TEST 39 — asserts no `s:'IHSG'`
  literal exists anywhere in the file, `fsFallbackInfo()` exists and
  checks `DB[tk]` before falling back to `'Lainnya'`, at least 5 call
  sites use the shared helper (not a re-typed inline fallback), and
  `FS_UNIV`'s own construction tries `dbInfo.sector` before `'Lainnya'`.
  Verified to actually fail (clear message) when the fix is reverted,
  before being restored and finalized.
- **Verification:** live Playwright — injected a portfolio ticker with no
  sector field (as real bulk-imported holdings have) and confirmed it
  resolves to `'Lainnya'` (not `'IHSG'`), a ticker whose `DB[]` entry has
  a real sector resolves to that real sector, and the actual Watchlist
  page render (`fsRenderWlPage()`, via the real `fsTgWl()` add-to-watchlist
  function) shows the `Lainnya` badge, not `IHSG`, in the DOM. Zero page
  errors. `npm test` (61/61 + 6/6 provider), `npm run lint` clean.
- **Follow-up (same day, found while re-checking the fix live at the
  user's request):** re-ran the exact ticker mix from the user's original
  screenshot (UNVR, ERAA, GGRM, BBNI, CPRI, SIDO, PMMP, BUMI, RAJA, ADMR,
  DEWA, MBMA, WIFI, PRDL, GMFI). The literal `"IHSG"` was gone, but 6 of
  the no-sector tickers (ERAA, GGRM, CPRI, PMMP, RAJA, DEWA, MBMA, GMFI)
  now resolved to `DB[tk].sector` correctly — except that value is
  `_IDX_RAW_LIST`'s raw English classification ("Consumer Cyclicals",
  "Energy", "Basic Materials", "Infrastructures", ...), while every other
  sector badge in this app is Indonesian. So the fix above traded a
  nonsensical label for an inconsistent-language one in the same table.
  Added `fsSectorLabel(raw)` — the same English→Indonesian map
  `06-analysis-router.js`'s `init()` already applies when it builds
  `DB[]` from the user's own portfolio rows (duplicated here rather than
  shared, since it's a small static lookup table and hoisting it would
  touch that file's init() for no behavioral gain) — and routed both
  `FS_UNIV`'s construction and `fsFallbackInfo()` through it before the
  `'Lainnya'` fallback. `test_suite.js` TEST 39 updated to assert the
  translation call sites exist. Re-verified live with the same 15-ticker
  mix: all 21 rows (6 hardcoded top holdings + the 15 test tickers) now
  show Indonesian sector labels, zero English ones, zero `"IHSG"`.

---

## #11 — Live crypto prices never updated from real data — always fetched
a Yahoo Finance pair that doesn't exist

- **Date:** 2026-09-11, moved here from `KNOWN_ISSUES.md` #1 once
  root-caused and fixed. Originally found 2026-09-10 from a routine
  Vercel log check (not a user report) — 9/9 requests to `/api/proxy` for
  a `*-IDR` crypto symbol returned HTTP 404 in one log window, deferred
  at the user's request to investigate later.
- **Found by (this pass):** grepped every code path constructing a
  `-IDR` Yahoo symbol per the deferred issue's own "next step" note.
  Found `fhFetchCrypto()` (`public/js/03-engine.js`) — the live-price
  refresh engine's crypto tick, called every refresh cycle from
  `fhStart()` — fetching `code+'-IDR'` directly.
- **Impact:** Yahoo Finance has no crypto→IDR trading pairs at all (only
  `CODE-USD`) — confirmed by comments already present elsewhere in this
  codebase (`server.js:2765`, `03-engine.js:273`/`452`,
  `21-performance.js:257`) documenting the exact same 404 for historical
  crypto-IDR charts, fixed there by fetching `-USD` and converting.
  `fhFetchCrypto()` was never updated to match — every single live-price
  tick for every crypto holding failed by construction, not
  intermittently. `cryptoPrices[code]` (read as a direct IDR value
  throughout `03-engine.js`/`05-assets.js`/`36-crypto-technical.js`) was
  silently stuck on whatever fallback/import value it started with,
  for the life of the session — a portfolio holding BTC/ETH/etc. never
  saw a real live price update, with no visible error to the user (the
  fetch failure was swallowed the same way any single-symbol `yfFetch()`
  failure is, by design, for the other symbols that DO succeed).
- **Root cause:** the direct-to-IDR fetch pattern was presumably written
  before the `-USD`-plus-conversion pattern was established elsewhere in
  this codebase (or copied from an assumption that never held), and
  never revisited once that pattern proved out for historical crypto
  charts.
- **Fix:** `fhFetchCrypto()` now fetches `code+'-USD'` (Yahoo's real
  symbol) and converts with `usdIdr` — the live USD/IDR rate
  `fhFetchKurs()` already fetches earlier in the same `fhStart()`
  sequence (2s vs. crypto's 6s delay), with a sane default
  (`usdIdr = 17823.65`, `05-assets.js`) so the very first tick before
  `fhFetchKurs()` resolves still produces a real (if slightly stale-rate)
  IDR price rather than skipping the update.
- **Prevention added:** `test_suite.js` TEST 40 — asserts
  `fhFetchCrypto()` never fetches `code+'-IDR'` again, does fetch
  `code+'-USD'`, and converts through `usdIdr`. Verified to actually fail
  (clear message) when reverted to the old pattern, before being
  restored.
- **Verification:** live Playwright — intercepted the `/api/proxy`
  requests `fhFetchCrypto()` makes, returning a controlled fake USD price
  only for `-USD` symbols (404 for anything ending `-IDR`, matching
  Yahoo's real behavior) and confirmed: the function requests `BTC-USD`
  (never `BTC-IDR`), and `cryptoPrices['BTC']` ends up as
  `regularMarketPrice * usdIdr` exactly (`67000 * 15800 = 1058600000`).
  Zero page errors. `npm test` (62/62 + 6/6 provider), `npm run lint`
  clean.
