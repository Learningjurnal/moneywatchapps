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

---

## #12 — Sidebar collapse button stretched to ~229px, squeezing the
search box next to it down to ~18px

- **Date:** 2026-09-11.
- **Found by:** the user, from a screenshot showing what looked like a
  wide pill-shaped button with just an icon and a bare text cursor —
  described as "ada card yang terpotong" (a card that's cut off).
- **Impact:** the sidebar's top toolbar (`.side-toolbar`, above "COMMAND
  CENTER") has a collapse/expand icon button next to the "Cari fitur
  (Ctrl+K)..." search box. The button was rendering at ~229px wide
  instead of its intended 28px, leaving the search box only ~18px —
  wide enough to show its border and a blinking text cursor, but not its
  icon, placeholder text, or the "Ctrl K" keyboard-shortcut badge next to
  it. The feature itself (sidebar collapse, feature search) still worked
  if clicked/typed into blind — this was a pure visual/layout bug, not a
  functional break.
- **Root cause:** CSS specificity. `.side-nav button{width:100%; ...}`
  (a broad rule meant for the actual navigation item buttons, like
  "Market Pulse") has specificity `(0,1,1)` — one class plus one element.
  `.side-collapse-btn{width:28px; ...}` alone has specificity `(0,1,0)` —
  one class only, which is LOWER regardless of the two rules' order in
  the file. Since `.side-collapse-btn` is literally a `<button>` element
  inside `.side-nav`, the generic rule's selector matched it too, and its
  higher specificity made `width:100%` win over the button's own intended
  `width:28px` — stretching it to fill the whole toolbar and leaving the
  `flex:1` search box next to it almost nothing to occupy.
- **Fix:** scoped the selector to `.side-toolbar .side-collapse-btn`
  (two classes, specificity `(0,2,0)`) for both the base rule and its
  `:hover` variant — this reliably outranks `.side-nav button`'s
  `(0,1,1)` regardless of source order, rather than relying on a
  same-specificity source-order tiebreak that a future edit could easily
  disturb.
- **Prevention added:** `test_suite.js` TEST 41 — asserts the scoped
  `.side-toolbar .side-collapse-btn` selector exists in `main.css`.
  Verified to actually fail (clear message) when reverted to the bare
  `.side-collapse-btn` selector, before being restored.
- **Verification:** live Playwright — measured the actual rendered
  `getBoundingClientRect()` of both elements before and after: collapse
  button went from 229px → 28px, search box went from 18px → 195px
  (its placeholder text and keyboard-shortcut badge now visible).
  Screenshot sent to the user for confirmation. `npm test` (63/63 + 6/6
  provider) — `npm run lint` doesn't cover CSS in this project, so this
  fix relied on the new TEST 41 plus live visual verification instead.

---

## #13 — TradeWave "Wave Scanner" button appeared unresponsive; Bandarmology Smart Money Flow charts too small

- **Date:** 2026-09-11.
- **Found by:** the user, from a screenshot (2x2-worth charts squeezed
  into a single row) plus a direct report: "pada toolbar trade wave pro,
  tombol Wave Scanner tidak berfungsi/merespon".
- **Impact (Wave Scanner):** whenever the currently-selected ticker's own
  wave analysis was invalid (e.g. no 65-day OHLCV cached yet for it — a
  real, reachable state, not just an unregistered ticker), clicking
  "Wave Scanner" correctly switched `TW_STATE.activeTab` to 2 and
  highlighted the button, but the page kept showing the *other* tab's
  single-ticker "TICKER INVALID" error card instead of the scanner —
  looking exactly like the button did nothing. Root cause #1:
  `renderTradeWavePage()` ran that single-ticker validity gate
  unconditionally before checking which tab was active, even though Tab 2
  (Wave Scanner) scans its own multi-ticker universe and never reads that
  ticker's data at all. Root cause #2 (found while verifying the fix for
  #1): `renderTab2WaveScanner()` itself would then throw
  (`TypeError: Cannot read properties of undefined (reading 'toFixed')`)
  the moment ANY ticker in its scan universe (`TW_UNIVERSE`) was still
  `{isValid:false}` — because `twAnalyzeWave()`'s invalid-entry shape
  omits `changePct`/`waveScore`/`superTrend`/`flow`/`targets` entirely,
  but the row-rendering loop read those fields unconditionally. A single
  invalid ticker anywhere in the universe silently aborted the whole
  scanner render — which is what actually made the tab still look "dead"
  even after fixing root cause #1 alone.
- **Impact (chart grid):** the 4-chart "INTERACTIVE REAL-TIME CHART
  SUITE" inside Bandarmology → Smart Money Flow used
  `grid-template-columns:repeat(auto-fit,minmax(320px,1fr))`, which fit
  all 4 charts into a single row on typical desktop widths, squeezing
  each one too small to read comfortably.
- **Fix:**
  1. In `renderTradeWavePage()`, moved the `TW_STATE.activeTab === 2`
     dispatch (render `renderTab2WaveScanner()` and return) to run
     *before* the `!data || data.isValid === false` gate, since Tab 2 has
     no dependency on it. Removed the now-dead `else if (activeTab === 2)`
     branch further down.
  2. In `renderTab2WaveScanner()`, filter the mapped list to
     `x.isValid !== false` right after building it, before the wave-phase
     and search filters — dropping invalid entries instead of crashing on
     them. Also distinguished the "no rows" empty state: "data belum
     tersedia, sedang menyinkronkan" when zero tickers are valid yet vs.
     "tidak cocok dengan filter" when valid tickers exist but none match
     the active phase/search filter.
  3. Changed the Smart Money Flow chart grid to
     `minmax(480px,1fr)` — fits exactly 2 charts per row (2x2) at normal
     desktop/laptop widths, still collapses to 1 column on narrow/mobile.
- **Prevention added:** `test_suite.js` TEST 42 (tab-2 dispatch runs
  before the validity gate — matched via the specific
  `if (TW_STATE.activeTab === 2) {...return;}` statement, not a bare
  substring search, since that substring also appears in the button's
  active-highlight style earlier in the same function), TEST 42b
  (`renderTab2WaveScanner()` filters `isValid !== false` before
  rendering row fields), and TEST 43 (chart grid uses `minmax(480px,1fr)`
  scoped to `renderBandarmologySmartMoneyFlowView()`, not the whole file,
  since other unrelated grids elsewhere legitimately use `minmax(320px,1fr)`).
  All three verified to actually fail with a clear message when reverted
  to the pre-fix code, before being restored.
- **Verification:** live Playwright — clicked the real "Wave Scanner"
  button with the default ticker (BBCA) in an invalid state (no cached
  OHLCV, as is always true in this network-blocked sandbox) and confirmed
  the tab now renders real "Setup Detector" scanner content instead of
  the TICKER INVALID error card. Measured the chart grid's 4 children's
  `getBoundingClientRect()` and confirmed exactly 2 distinct row offsets
  (2x2 layout) at 1440px viewport width. Screenshot sent to the user.
  `npm test` (66/66 + 16/16 policy + 6/6 provider), `npm run lint` clean.

---

## #14 — Portfolio Allocation legend showed no color indicator in light theme

- **Date:** 2026-09-11.
- **Found by:** the user: "pada tema terang alokasi porotoflio legend
  tidak ada indikator warna".
- **Impact:** in the "Alokasi Portofolio Real-Time" card's legend
  (`#porto-donut-legend`, `04-render.js` `renderPortofolio()`), every
  row's small 10x10 color swatch — meant to match its slice's color on
  the donut chart — rendered as a uniform flat #F8FAFC/light-gray square
  in light theme regardless of the row's actual sector/asset-class color,
  making the legend indistinguishable by color (the emoji icon added in
  an earlier fix for a similar "color cue unreliable" issue was the only
  thing still differentiating rows).
- **Root cause:** two near-duplicate CSS rules exist for styling this
  legend's rows in light theme — one correctly scoped to
  `#porto-donut-legend > div` (direct children only — the row
  containers), and a second, added independently later in the file,
  using a bare descendant selector `#porto-donut-legend div` (no `>`).
  The bare version also matched the small color-swatch `<div>` nested
  *inside* each row, and its `background: #F8FAFC !important` won over
  the swatch's own inline `background:<hex color>` because an
  `!important` declaration in an author stylesheet always outranks a
  plain (non-`!important`) inline style — erasing every row's distinct
  color regardless of what `sectorColor()` or the class-color palette
  actually returned.
- **Fix:** scoped the duplicate rule to `#porto-donut-legend > div`
  (matching the already-correct rule above it), so it reaches only the
  row containers and no longer touches the nested swatch.
- **Prevention added:** `test_suite.js` TEST 44 — asserts the bare
  descendant selector `body.theme-light #porto-donut-legend div {` is
  absent and the scoped `> div` version is present. Verified to actually
  fail (clear message) when reverted to the bare selector, before being
  restored.
- **Verification:** live Playwright — switched to light theme, seeded a
  3-sector portfolio, rendered the legend, and walked
  `document.styleSheets` to find every CSS rule actually matching the
  swatch element via `.matches()` (confirming the exact duplicate rule
  responsible) before the fix, then re-measured each swatch's
  `getComputedStyle().backgroundColor` after the fix: three rows, three
  distinct colors (`rgb(59,130,246)` blue, `rgb(244,63,94)` red,
  `rgb(234,179,8)` yellow) matching their sectors. Screenshot sent to the
  user. `npm test` (67/67 + 16/16 policy + 6/6 provider), `npm run lint`
  clean.

---

## Follow-up to #13 — Smart Money Flow chart grid still showed 3+1, not 2+2, on wide viewports

- **Date:** 2026-09-11 (same day as #13, second screenshot from the user
  on the SAME grid after the first fix had already shipped).
- **Found by:** the user, screenshot showing 3 charts on the top row and
  1 alone on the second row, with the explicit ask "dibagi menjadi 2
  card (atas 2 dan bawah 2)".
- **Impact:** the #13 fix changed the inline
  `grid-template-columns:repeat(auto-fit,minmax(320px,1fr))` to
  `minmax(480px,1fr)`, which does fit exactly 2 per row on a "normal"
  ~1440px laptop viewport — but `auto-fit` always packs in as many
  `>= min-width` columns as the container can hold. On a wider screen
  (the user's screenshot shows a viewport wide enough for 3 columns of
  480px+gap to fit), it packed a 3rd chart into the first row instead of
  wrapping after 2, leaving only 1 chart on the second row. There is no
  single `minmax(Npx,1fr)` value that yields "always exactly 2" for
  every possible container width — the column count from `auto-fit` is
  inherently `floor(containerWidth / minWidth)`, not a fixed number.
- **Fix:** replaced the inline auto-fit/minmax style with a dedicated
  `.bandar-smart-chart-grid` CSS class (`main.css`) using a **fixed**
  `grid-template-columns: repeat(2, 1fr)` — always exactly 2 columns
  regardless of container width — plus a real `@media (max-width:
  760px)` query collapsing it to `1fr` (1 column) on narrow/mobile
  viewports. A plain inline style has no way to express "fixed 2, but 1
  below a breakpoint"; only an actual media query can, which requires an
  external/embedded stylesheet rule rather than an inline `style=`.
- **Prevention added:** updated `test_suite.js` TEST 43 — now asserts
  (a) the specific chart-suite container (identified by its neighboring
  `bandarSmartPriceChart` canvas id, since other unrelated grids in the
  same function legitimately use auto-fit/minmax) uses the
  `bandar-smart-chart-grid` class rather than any inline
  auto-fit/minmax style, and (b) `main.css` actually defines that class
  with a fixed `repeat(2,1fr)` plus a media query collapsing it to 1
  column. Verified to actually fail (clear message) when reverted to the
  inline `minmax(480px,1fr)` style, before being restored.
- **Verification:** live Playwright at three viewport widths — 1920px
  (matching the user's wide-screen report), 1440px (typical laptop), and
  600px (mobile). Measured all 4 chart children's
  `getBoundingClientRect()` at each width: 1920px and 1440px both now
  show exactly 2 distinct row offsets (true 2x2) with
  `getComputedStyle().gridTemplateColumns` reporting exactly 2 track
  values; 600px collapses to 4 distinct rows (1 column, stacked), as
  intended for mobile. Screenshot at 1920px sent to the user. `npm test`
  (67/67 + 16/16 policy + 6/6 provider), `npm run lint` clean.

---

## Proactive Maintainability Fixes (not user-reported incidents)

Lower-risk cleanups found during a deep-dive design/code review
(2026-09-11), not from a live bug report. Documented here anyway because
one of them is the same class of defect as a real incident above.

### Duplicate `body.theme-light {}` custom-property block in `main.css`

- **Found by:** proactive review of `main.css`'s theme-variable
  structure, prompted by a user-submitted aesthetic/architecture
  analysis flagging CSS-cascade risk in general terms.
- **What was wrong:** two separate `body.theme-light { ... }` rule
  blocks existed in the file — one near the top ("YAHOO FINANCE THEME &
  DESIGN SYSTEM TOKENS"), one much further down ("COMPREHENSIVE LIGHT
  THEME ENGINE"). Same selector, identical specificity, so the later
  block always silently won the cascade for every variable it
  redeclared. One variable, `--border-subtle`, actually held a
  **different value** in each block (`#E0E4E9` vs `rgba(0,0,0,0.06)`)
  with no visual signal anywhere that two competing definitions existed
  — the same class of bug as **#14** above (a duplicate light-theme CSS
  rule silently overriding another), just not yet visibly broken.
- **Fix:** consolidated into the single top block, keeping the value
  that was actually winning (`rgba(0,0,0,0.06)`) so the fix changes zero
  rendered output; the redundant `background`/`color` declarations from
  the removed block were merged in too (they duplicate
  `html,body{background:var(--bg);color:var(--text)}` elsewhere in the
  file, so they were dead weight either way, but kept as-is rather than
  dropped to avoid any behavior change from this cleanup).
- **Prevention added:** `test_suite.js` TEST 45 — asserts exactly one
  `body.theme-light {` block exists in `main.css`. Verified to fail
  (clear message) when a second block was temporarily reintroduced,
  before being restored.
- **Verification:** live Playwright — read every relevant CSS custom
  property via `getComputedStyle()` in light theme before and after the
  change; all values identical (`--bg`, `--bg2`, `--text`, `--text3`,
  `--border-subtle`, `--accent`, body's rendered `background`/`color`).
  `npm test` (68/68 + 6/6 provider), `npm run lint` clean.

### "Aksi" action-icon column not sticky-right in Riwayat Transaksi Saham & Mutasi RDN tables

- **Found by:** the same user-submitted analysis, verified directly
  against `04-render.js` and `main.css` before acting on it (no
  `position:sticky;right:*` rule existed anywhere in the stylesheet —
  only the existing `.tbl-sticky-left` for the ticker column).
- **What was wrong:** the rightmost "Aksi" column (detail/edit/delete
  icon buttons) in `#tx-tbody` and `#rdn-tbody` scrolled out of view
  along with the rest of the row whenever the table was scrolled
  horizontally on a medium-width screen, forcing the user to scroll
  right to reach the buttons and then back left to see which row they
  were acting on.
- **Fix:** added a `.tbl-sticky-right` CSS class (dark + light theme +
  row-hover variants, mirroring the existing `.tbl-sticky-left` pattern
  exactly but pinned to `right:0`) and applied it to both tables' "Aksi"
  `<th>` (in `index.html`) and each row's action `<td>` (in
  `04-render.js`).
- **Prevention added:** `test_suite.js` TEST 46 — asserts the
  `.tbl-sticky-right` CSS rule exists, and that both tables' header
  `<th>` and row `<td>` still carry the class. Verified to fail (clear
  message, one failure per removed class) when each of the three
  places — `04-render.js`'s `<td>`, `index.html`'s tx-table `<th>` —
  was independently reverted, before being restored.
- **Verification:** live Playwright at a 900px viewport (narrow enough
  to force horizontal scroll) — seeded one transaction, scrolled
  `#page-transaksi .tbl-wrap` fully to `scrollWidth`, and confirmed via
  `getBoundingClientRect()` that the action `<td>` stayed within the
  wrapper's visible bounds instead of scrolling off. Screenshot
  confirms the 🔍 ✎ ✕ icons visible and pinned to the right edge.
  `npm test` (69/69 + 16/16 policy + 6/6 provider), `npm run lint` clean.

### "Alert" button crowding the sticky-left ticker column in Portfolio table

- **Found by:** the same user-submitted deep-dive analysis, verified
  directly against `04-render.js` (`renderPortofolio()`) — confirmed the
  Portfolio table (`#porto-tbody`) has no dedicated "Aksi" column at all
  (13 columns total: ticker, name, sector, lot, shares, avg, price,
  market value, cost, unrealized, return%, allocation, signal), so the
  "Alert" shortcut button had nowhere to go except inline inside the
  sticky-left ticker cell, permanently widening that pinned column and
  crowding the ticker/logo on every single row.
- **Fix:** collapse the button to zero width/opacity by default, reveal
  it on row hover. Scoped to `@media (hover: hover)` — only devices with
  an actual pointer that can hover (mouse/trackpad) — so touch devices,
  which have no hover state to reveal it with, keep the button always
  visible exactly as before this change (zero behavior change for
  mobile/tablet). Uses `opacity`/`width`, deliberately NOT
  `display:none`/`visibility:hidden`: both of those also remove an
  element from the keyboard tab order, which would have made the button
  completely unreachable without a mouse — a real accessibility
  regression that surfaced while building this exact fix (an earlier
  draft using `display:none` combined with a `:focus-visible` reveal
  rule looked reasonable but the `:focus-visible` selector could never
  actually fire, since a `display:none` element is never focusable in
  the first place).
- **Prevention added:** `test_suite.js` TEST 47 — asserts the button
  keeps its `porto-alert-btn` class, that a `@media (hover: hover)`
  block exists scoping the collapse, that the collapse never uses
  `display:none`/`visibility:hidden`, and that a `:focus-visible` rule
  reveals it for keyboard navigation. Verified to fail (three separate
  failures, one per broken variant) when each of the three ways to break
  this was tried in turn — missing class, `display:none` instead of
  opacity/width, and a missing `:focus-visible` rule — before being
  restored.
- **Verification:** live Playwright — measured the button's actual
  `getBoundingClientRect()` width and `getComputedStyle().opacity`
  through a full mouse-hover/unhover cycle on a real row (collapsed →
  hover → collapsed again). Separately, drove real keyboard `Tab`
  key-presses (not a scripted `.focus()` call, which does not reliably
  trigger `:focus-visible` the same way) until landing on the button,
  confirming `:focus-visible` actually matches and the button becomes
  visible and clickable. Screenshots (before/during hover) sent to the
  user. `npm test` (70/70 + 16/16 policy + 6/6 provider), `npm run lint`
  clean.

### "Ghost stacking" — all 3 Dividen sub-tab sections rendered at once on every real page load

- **Found by:** the same user-submitted deep-dive analysis, verified by
  tracing the actual navigation path — the sidebar's only real entry
  point into this page (`goPage('dividen')` →
  `06-analysis-router.js`'s `case 'dividen':`) calls `renderDividen()`
  and `renderDividendCalendarComponent()` directly and **never** calls
  `switchDivSubTab()` at all (unlike the sibling `'dividen-calendar'`
  case, which does).
- **Impact:** `#div-section-calendar`, `#div-section-analytics`, and
  `#div-section-ledger` all defaulted to `style="display:block"` in the
  static HTML, while the "Kalender Dividen" sub-tab button was already
  marked active (`btn-green`) in that same markup. Every real navigation
  to the Dividen page (there is no other way in) rendered all three
  sub-tab sections stacked vertically at once — Kalender, Analisis &
  Proyeksi 5 Tahun, and Riwayat Pembukuan Transaksi all visible
  simultaneously — while the UI visually implied only "Kalender" was
  selected. Not a hypothetical race condition: this happened on 100% of
  page loads via the only real entry point, with no dependency on script
  timing.
- **Fix:** changed the static default of `#div-section-analytics` and
  `#div-section-ledger` to `display:none`, matching the calendar tab
  that's already marked active by default — so the markup is
  self-consistent with itself from first paint, with no dependency on
  `switchDivSubTab()` running before the user sees the page.
  `switchDivSubTab()` itself (unchanged) still toggles all three
  sections explicitly on every click, including "Tampilkan Semua"
  (which intentionally shows all three — a real, deliberate feature, not
  part of this bug).
- **Prevention added:** `test_suite.js` TEST 48 — asserts
  `#div-section-calendar` defaults to `display:block`,
  `#div-section-analytics`/`#div-section-ledger` default to
  `display:none`, and the Calendar sub-tab button is still the one
  marked active by default (so the fix isn't just "consistently
  defaulting to the wrong tab"). Verified to fail (clear message) when
  reverted to `display:block`, before being restored.
- **Verification:** live Playwright — navigated via `goPage('dividen')`
  (the real entry point, not the calendar-specific route) and confirmed
  only the Calendar section is visible with the Calendar button active;
  then drove through all four sub-tabs (Analisis, Riwayat, Tampilkan
  Semua, back to Kalender) via `switchDivSubTab()` and confirmed each
  correctly shows/hides sections including "Tampilkan Semua" still
  showing all three together, and that the Analytics tab's Chart.js
  projection canvas (`#divProjChart`) isn't stuck invisible after having
  been created while its container was hidden (`kc('divProj')` destroys
  and recreates the chart fresh on every tab visit, confirmed in the
  source). Screenshot of the fixed initial state sent to the user.
  `npm test` (71/71 + 16/16 policy + 6/6 provider), `npm run lint`
  clean.

### `.badge` missing `tabular-nums`, causing numeric badges to jitter in width on update

- **Found by:** the same user-submitted deep-dive analysis. On closer
  investigation, most of the codebase's numeric text was already
  correctly covered by `tabular-nums` via `.mval`, `.mono`,
  `.up`/`.dn`/`.amb` (contradicting the analysis's broader claim of
  widespread missing coverage) — but `.badge`, reused for both
  plain-text labels (`BUY`, `RADAR`, sector names) and live-updating
  numeric content (e.g. `#vol-risk-badge`'s volatility percentage, set
  in `05-assets.js`), had no digit-width normalization at all and
  inherits the page's default proportional `Inter` font.
- **Impact:** a badge showing a live percentage (e.g. annualized
  volatility) visibly shifts width as its digits change from one update
  to the next (e.g. "9.5%" → "10.2%").
- **Fix:** added `font-variant-numeric:tabular-nums` to `.badge`.
  `.badge` legitimately has multiple rule blocks in this file by
  design — a base rule and a later, deliberate override under a
  "READABILITY OVERRIDES" section that similarly re-tightens `.btn`,
  `.tbl th/td`, `.finput`, etc. (an intentional layering pattern, unlike
  the accidental `body.theme-light` and `#porto-donut-legend div`
  duplicates fixed earlier) — added to the override block, which is the
  one that actually wins the cascade. `tabular-nums` has zero visual
  effect on non-numeric glyphs, so this is safe for every badge in the
  app, not just the numeric ones — confirmed live (screenshot below).
- **Prevention added:** `test_suite.js` TEST 49 — asserts the specific
  `.badge` rule block gained `font-variant-numeric:tabular-nums`.
  Verified to fail (clear message) when reverted, before being restored.
- **Verification:** live Playwright — read `getComputedStyle().fontVariantNumeric`
  on the first 5 `.badge` elements on the dashboard (a mix of numeric and
  plain-text badges) and confirmed all report `tabular-nums`. Screenshot
  confirms no visual regression on either type. `npm test` (72/72 + 6/6
  provider), `npm run lint` clean.

### Sticky-right "Aksi" column extended to Crypto/ETF/Reksa Dana transaction tables

- **Found by:** consistency check while addressing the earlier
  Saham/RDN sticky-right fix — the Crypto, ETF, and Reksa Dana
  transaction tables (`#crypto-tx-tbody`, `#etf-tx-tbody`,
  `#rd-tx-tbody`) had the exact same unpinned action-icon column issue,
  just not explicitly named in the original analysis.
- **Fix:** applied the same, already-proven `.tbl-sticky-right` class
  (no new CSS — reuses the rule added for Saham/RDN) to these three
  tables' header `<th>` and row `<td>` in `index.html` and
  `05-assets.js`.
- **Prevention added:** `test_suite.js` TEST 50 — same pattern as TEST
  46, asserting the class on all 3 header cells and all 3 row templates.
  Verified to fail (clear message) when one instance was reverted,
  before being restored.
- **Verification:** live Playwright at a 900px viewport — seeded one
  crypto transaction, scrolled `#crypto-tx-tbody`'s wrapper fully right,
  confirmed via `getBoundingClientRect()` the action column stays within
  the visible wrapper bounds. `npm test` (73/73 + 6/6 provider), `npm
  run lint` clean.

### Uppercase table headers/labels with zero letter-spacing

- **Found by:** the same user-submitted deep-dive analysis. On full
  inventory (every `text-transform: uppercase` rule in `main.css`, 19
  total), the codebase turned out to be substantially better than the
  broad claim: 17 rules already carry a deliberate letter-spacing value
  in a fairly tight, reasonable range (0.03em–0.08em / 0.5px — all
  roughly equivalent at these small font sizes) — not the rampant
  inconsistency originally described. Only two rules had genuinely
  **zero** letter-spacing at all: `.sm-table th` (a real, visible table
  header — "Metrik Risiko Fundamental" / "Nilai Terkini" / "Batas
  Standar Aman" in the Quantitative Red Flag Detector table on the
  Fundamental page) and `.rmc-verdict` (currently unused, dead CSS with
  no references anywhere in `index.html` or the JS files — fixed anyway
  so it doesn't silently regress if reactivated later).
- **Fix:** added `letter-spacing: 0.05em` to both — matching the value
  already used by `.kpi-label` and `.health-score-label`, the two other
  10px/9px all-caps label classes in this file, rather than inventing a
  new value. Left every other already-tracked uppercase rule untouched:
  renumbering 17 already-reasonable, deliberate values to one "correct"
  number is a style opinion with no clear bug behind it, not something
  to change unilaterally.
- **Prevention added:** `test_suite.js` TEST 51 — asserts both rules
  keep a `letter-spacing` declaration. Verified to fail (clear message)
  when reverted, before being restored.
- **Verification:** live Playwright — navigated to the Fundamental
  page's Red Flag Detector table and read
  `getComputedStyle().letterSpacing` on its header cell (0.5px, matching
  0.05em at 10px). Screenshot confirms visibly less cramped tracking.
  `npm test` (74/74 + 6/6 provider), `npm run lint` clean.

### Card clutter on the Portfolio page — main table sat below 3 large chart/toolbar cards

- **Found by:** the user-submitted deep-dive design review — flagged as
  requiring an explicit design decision (unlike the earlier low-risk CSS
  fixes) since it's a structural DOM reorder, not a scoped style change.
  User confirmed proceeding with this specific reorder.
- **Impact:** on the Portfolio page (`#page-portofolio`), the order was:
  cash banner → 4 summary metric cards → Donut Chart Alokasi card → Bar
  Chart Gain/Loss card → Performa per Saham toolbar card → **the main
  position table** (`#porto-tbody`, the page's primary function). Users
  had to scroll past 3 large chart/toolbar cards before reaching the
  actual list of active stock positions.
- **Fix:** moved the main table's `<div class="card">` block to right
  after the 4 summary metric cards; the 3 supporting cards (donut chart,
  bar chart, performa toolbar) now follow the table instead of preceding
  it, keeping their own relative order to each other unchanged. Pure DOM
  reorder — no IDs, classes, or JS logic changed; verified beforehand
  that no CSS (`nth-child`/`+`/`~`) or JS (`nextElementSibling` etc.)
  in the app depends on these cards' specific sibling order.
- **Prevention added:** `test_suite.js` TEST 52 — asserts
  `#porto-tbody` appears before `#portoDonutChart`,
  `#portoRealizedVsPotensiChart`, and `#perf-toolbar-header` within the
  Portfolio page's HTML. Verified to fail (clear message) against the
  pre-fix `index.html` from `main`, before the fix was confirmed in
  place.
- **Verification:** live Playwright — confirmed DOM order via element
  position indices; confirmed the table still renders real rows (2
  seeded transactions → 2 rows); confirmed the ticker search filter
  still works (narrows to 1 row); confirmed the donut chart's
  Sektor/Kelas Aset tab switch still re-renders its legend; confirmed
  the Performa per Saham "Lihat Detail" toggle still shows its table.
  Screenshots (top of page showing table first, and the 3 cards now
  below it) sent to the user. `npm test` (75/75 + 6/6 provider), `npm
  run lint` clean.

### Nested cards in "Proyeksi Dividen 5 Tahun" — 5 mini-cards stacked inside the already-bordered parent card

- **Found by:** the user-submitted deep-dive design review, flagged as
  requiring an explicit design decision. User confirmed proceeding.
- **Impact:** in the Dividen page's "Proyeksi Dividen 5 Tahun
  (2027–2031)" card, each of the 5 yearly projection figures
  (`#div-proj-cards`) rendered as its own bordered, background-tinted
  box (`border:1px solid rgba(0,229,160,.15);
  background:rgba(0,229,160,.06);border-radius:9px`) — a card-shaped box
  nested inside the already-bordered parent card, doubling up visible
  borders around a short 3-line stat (year / value / % vs base) instead
  of reading as one clean row of related figures.
- **Fix:** flattened each yearly cell to plain stacked text with no own
  border/background/radius, separated by a thin `border-left:1px solid
  var(--border)` divider on all but the first column — a "stat strip"
  pattern, not 5 nested cards. Purely a CSS-in-JS-template change inside
  one render function (`renderDividen()` in `04-render.js`); no DOM IDs,
  structure, or other logic touched.
- **Prevention added:** `test_suite.js` TEST 53 — asserts the render
  block no longer emits the old per-cell border/background, and that
  the divider style is present. Verified to fail (clear message) when
  reverted, before being restored.
- **Verification:** live Playwright — read `getComputedStyle()` on all 5
  rendered cells: transparent background on every one, `border-left`
  only (not a full 4-side border) on the 4 non-first columns. Screenshot
  confirms a clean flat stat strip. `npm test` (76/76 + 6/6 provider),
  `npm run lint` clean.

### Fixed-height charts stretched into extremely flat shapes on ultrawide monitors

- **Found by:** the user-submitted deep-dive design review, flagged as
  requiring an explicit design decision. User confirmed proceeding.
  Verified the specific charts named (`#perfEquityChart`, `#divYearChart`)
  are real and confirmed the actual root cause by measuring on a live
  3000px-wide Playwright viewport before deciding on a fix, rather than
  guessing: the root cause isn't really "fixed canvas height" in
  isolation, it's that the `.g3`/`.g2c` card grids hosting these charts
  had **no max-width at all**, so each grid column stretches
  proportionally with the full viewport width while the chart height
  stays a fixed 185px–220px — at 3000px viewport, `#perfEquityChart`'s
  wrapper measured 852px wide × 190px tall (~4.5:1 aspect ratio, quite
  flat).
- **Fix:** added `max-width:1600px;margin-left:auto;margin-right:auto`
  to `.g2c` and `.g3` (the two grid classes hosting the flagged charts).
  1600px sits just above a typical 1920px viewport's content area (after
  the sidebar), so normal laptop/desktop widths are essentially
  unaffected — only genuinely ultrawide viewports get constrained and
  centered. Confirmed live: at 3000px viewport, `#perfEquityChart`'s
  wrapper aspect ratio improved from ~4.5:1 to ~2.55:1.
- **Prevention added:** `test_suite.js` TEST 54 — asserts both `.g2c`
  and `.g3` keep the `max-width:1600px` declaration. Verified to fail
  (clear message) when reverted, before being restored.
- **Verification:** live Playwright at a 3000px viewport — measured
  `.g3`'s `getBoundingClientRect()` (exactly 1600px wide, centered) and
  `#perfEquityChart`'s wrapper aspect ratio before/after; separately
  confirmed `.g2c` (Dividen page's `#divYearChart`) also computes to
  exactly 1600px via `getComputedStyle()`. Screenshot sent to the user.
  `npm test` (77/77 + 6/6 provider), `npm run lint` clean.

---

## Performance investigation: "app feels heavy switching between tabs" (user-requested, 2026-09-11)

Comprehensive live-profiling investigation via Playwright, not guesswork.
Summary of what was checked, what was ruled out, and the one confirmed,
fixed root cause. See conversation for full methodology.

### Ruled out (verified NOT the cause)

- **Render function execution time**: measured all 32 page routes'
  synchronous `goPage()` call time — all under 30ms, even the heaviest
  (Sectoral Insight 28ms).
- **Chart.js instance leaks**: audited every one of the ~51 `new Chart(`
  call sites across the codebase — every single one is preceded by a
  proper destroy-before-recreate guard (`kc()`, `techKillChart()`,
  `wKillChart()`, `twKillChart()`, or an inline `.destroy()` — different
  local naming per module, but the pattern holds everywhere).
- **DOM node growth on repeated tab revisits**: an initial test looked
  like a leak (+512 nodes revisiting 9 pages twice), but isolating with a
  12s warm-up first showed growth plateaus completely after the 2nd visit
  to a set of pages (0 further growth on a 3rd round) — this is one-time
  async/deferred content settling, not a compounding leak that gets worse
  the longer a session runs.
- **Redundant network fetches on tab revisit**: an initial test (Stock
  Intel, insufficient warm-up) looked like 8+ requests per revisit; after
  isolating with proper warm-up, real per-page data endpoints
  (quote/history/broker-summary) fired **once** across 3 rapid revisits
  on every page tested (Stock Intel, Bandarmology, FlowScan, StockChat,
  TradeWave) — existing caching/cooldown mechanisms are working
  correctly. Only third-party logo images re-requested per visit (normal
  `<img>` behavior, browser-cacheable, outside this app's control).

### Confirmed and fixed: Chart.js draw-in animation on every tab switch

- **Root cause**: every Chart.js instance in the app (~51 across the
  codebase) is destroyed and recreated from scratch on every visit to its
  page — there is no "just update the data" path anywhere, only
  destroy-then-recreate. None of those 51 chart configs disabled Chart.js's
  default ~1000ms draw-in animation. On chart-heavy pages (Bandarmology
  Smart Money Flow: 4 charts, FlowScan: up to 8 across its views,
  Quant/Backtester: 7), switching to that tab paid the full animation
  cost for every chart on it, simultaneously, every single time — a real,
  well-established Chart.js performance cost, independent of network
  conditions (so still real even though the network-storm hypothesis
  above was ruled out).
- **Fix**: set `Chart.defaults.animation = false` globally in
  `03-engine.js`, in the same block that already sets
  `Chart.defaults.interaction`/`.hover` globally (an established pattern
  in this codebase — "applied globally so every chart in the app benefits
  without needing to touch each individual chart config"). Also removed
  two per-chart `animation:` overrides that would have defeated the new
  global default for those two specific charts (Dashboard's sector
  allocation donut, `animation:{animateRotate:true, duration:600}`; Harga
  Wajar's valuation bar chart, `animation:{duration:300}`) — a per-instance
  Chart.js option always overrides the global default for that chart, so
  both had to go for the fix to actually apply everywhere.
- **Prevention added:** `test_suite.js` TEST 55 (asserts
  `Chart.defaults.animation = false` exists in the global defaults block)
  and TEST 56 (asserts no chart config anywhere still sets its own
  `animation:` object, which would silently defeat the global default for
  that one chart — checked with comments stripped first, since an
  explanatory comment quoting the old removed code would otherwise
  false-positive as live code). Both verified to fail with a clear
  message when reverted, before being restored.
- **Verification:** live Playwright with a Chart.js stub that tracks
  each instance's *effective* merged options (stub `.defaults` object +
  per-instance config, mimicking Chart.js's own merge behavior) —
  confirmed `Chart.defaults.animation` is `false` after app init, and a
  real chart created on the Performance page inherits `animation: false`
  with zero page errors. `npm test` (79/79 + 16/16 policy + 6/6
  provider), `npm run lint` clean.

### Genuinely reachable, well-verified dead-feature candidates found during this investigation (not yet acted on — pending product decision)

- `thesis` route (`renderThesisPage()`, "Investment Thesis Tracker") —
  fully built, zero navigation entry point anywhere in the app.
- `broker-flow`, `foreign-flow`, `smart-money-radar` Bandarmology
  sub-modes — implemented router cases, zero call sites anywhere
  (`smart-money-flow` is the only one of this group actually reachable,
  via the `flowscan` route).
- `dividen-calendar` route — redundant alias, zero call sites (the
  `dividen` route + manually clicking the Kalender sub-tab already covers
  the same behavior).
- Confirmed genuinely API-pending and NOT dead: `INVEZGO_API_KEY`
  (`lib/invezgo-client.js`, paid IDX market data API) and
  `GEMINI_API_KEY` (`server.js`, Google AI) — both gracefully degrade
  when unset and must not be touched.

---

## Dead-feature cleanup: Investment Thesis Tracker nav entry added, dead Bandarmology shortcuts removed (user-requested, 2026-09-11)

Follow-up to the performance investigation above. User asked specifically
about `thesis` and the 3 dead Bandarmology sub-modes; confirmed by reading
the actual code (not guessing) that neither was a missing-data/incomplete
stub — both were fully-functional code with zero navigation entry point.

### Investment Thesis Tracker — nav entry added

- **Confirmed via code reading:** `renderThesisPage()` (add/view/delete
  investment thesis: ticker, why-bought rationale, target price,
  invalidation criteria) was fully built and wired into the complete
  save/load system (`02-storage.js` — Firebase sync, local backup,
  export/import all already handle `theses`). Zero dependency on any
  external API or live market data — 100% user-typed content. The only
  thing missing was a way to reach it.
- **Fix:** added a sidebar button (`goPage('thesis', this)`) under the
  PORTFOLIO group, alongside Transactions/Dividend/Performance — grouped
  there since it's inherently about individual portfolio positions.
- **Honesty fix found along the way:** the page's own subtitle promised
  "evaluasi otomatis status thesis" (automatic thesis-status evaluation)
  — no such automatic checker exists anywhere in the file; the status
  badge is set once, manually, at creation time and never re-evaluated.
  Since this page is now actually reachable by real users, corrected the
  subtitle to describe only what's implemented, and corrected a matching
  overclaim in the file's own header comment ("AI Intact/Warning/Broken
  checker" → noted as never implemented).
- **Prevention added:** `test_suite.js` TEST 57 — asserts the sidebar
  has a `goPage('thesis'...)` button. Verified to fail when reverted,
  before being restored.
- **Verification:** live Playwright — clicked the real sidebar button,
  confirmed the page activates with the corrected subtitle; created a
  thesis via the actual modal form, confirmed it renders as a card;
  deleted it via `deleteThesis()` (with a dialog auto-accept handler,
  since it uses a native `confirm()` — a headless test without one
  silently rejects the dialog, which is not itself a bug), confirmed the
  empty state returns. Full CRUD cycle confirmed working end-to-end.

### Dead Bandarmology deep-link shortcuts removed

- **Confirmed via code reading:** `broker-flow`, `foreign-flow`, and
  `smart-money-radar` were never separate pages — `setBandarmologyTab()`
  always renders the SAME full Bandarmology Cockpit page regardless of
  which of these values it's called with; the "sub-mode" is only which
  section it auto-scrolls to afterward. All 3 had zero call sites
  anywhere in the app (confirmed via full-codebase search, including
  dynamic `goPage()` calls via variables) — not incomplete features, just
  named shortcuts nothing ever triggered. `smart-money-flow` (the 4th
  member of the same list) IS real and reachable, via the `flowscan`
  page route, and was kept working throughout this cleanup.
- **Fix:** removed the 3 dead names from every list that referenced
  them — the router's `case` statements and `targetPageName` mapping in
  `06-analysis-router.js`, and the dispatch/scroll-to logic in
  `goBandarmology()`/`setBandarmologyTab()` in `41-stockchat-cockpit.js`
  — while explicitly keeping `smart-money-flow` working in each of those
  same spots.
- **Prevention added:** `test_suite.js` TEST 58 — asserts the 3 dead
  router cases are gone, while `smart-money-flow`'s router case, its
  `targetPageName` redirect, its `goBandarmology()` dispatch, and its
  `setBandarmologyTab()` scroll-to branch are all still present.
  Verified to fail (clear message) when one of the dead cases was
  reintroduced, before being restored.
- **Verification:** live Playwright — navigated via `goPage('flowscan')`
  (the real entry point) and confirmed it still lands on the
  Bandarmology page with the correct mode set.
- **Separate pre-existing issue found, NOT fixed (out of scope for this
  request):** `setBandarmologyTab()`'s `smart-money-flow` scroll-to
  branch targets `#bandarSmartMoneyChart` with a fallback to
  `#bandar-tab-content` — neither ID exists anywhere in the rendered
  HTML. This silently no-ops (the `if (el)` guard prevents a crash) and
  predates this cleanup; the page navigation itself still works
  correctly, only the "auto-scroll to the smart money section" behavior
  has never actually worked. Left as-is since it wasn't part of what was
  asked; noted here for whenever it's worth revisiting.

`npm test` (81/81 + 16/16 policy + 6/6 provider), `npm run lint` clean.

---

## Remaining dead-feature cleanup: dividen-calendar route removed, broken FlowScan scroll-to fixed (user-requested, 2026-09-11)

Follow-up to the sessions above.

### `dividen-calendar` dead route removed

- **Confirmed via code reading:** zero call sites anywhere in the app
  (verified via full-codebase search). It rendered exactly what the
  `dividen` case already produces — the Dividen page defaults to
  showing its Calendar sub-tab (see the "ghost stacking" fix above), so
  the extra `switchDivSubTab('calendar')` call this route made was never
  adding anything the plain `dividen` route didn't already do.
- **Fix:** removed the `case 'dividen-calendar':` router branch and its
  `targetPageName` special-case mapping in `06-analysis-router.js`.
- **Prevention added:** `test_suite.js` TEST 59. Verified to fail when
  reverted, before being restored.

### Pre-existing broken FlowScan → Bandarmology scroll-to, now fixed

- **Root cause confirmed:** `setBandarmologyTab()`'s `smart-money-flow`
  branch scrolled to `getElementById('bandarSmartMoneyChart')` with a
  `getElementById('bandar-tab-content')` fallback — **neither id existed
  anywhere** in the rendered HTML. The deep-link from FlowScan still
  correctly navigated to the Bandarmology page, but the "auto-scroll
  straight to the Smart Money Flow chart section" behavior had silently
  no-op'd (guarded by `if (el)`, so no crash, just nothing happened)
  since this code was written.
- **Fix:** added `id="bandarSmartMoneyChart"` to the actual Smart Money
  Flow chart section's wrapping `<div>` in
  `renderBandarmologySmartMoneyFlowView()` — matching the id the
  scroll-to code was already looking for, rather than changing the
  scroll-to code itself. Removed the now-pointless
  `getElementById('bandar-tab-content')` fallback (that id never existed
  either).
- **Prevention added:** `test_suite.js` TEST 60 — asserts the real id
  exists in the rendered markup and the dead fallback lookup is gone.
  Verified to fail (clear message) when reverted, before being restored.
- **Verification:** live Playwright — navigated via `goPage('flowscan')`
  (the real deep-link entry point) and measured the target element's
  actual position after the scroll settled: its vertical center landed
  at ~468px vs. the viewport's center at 450px — the `block:'center'`
  scroll now genuinely works. Screenshot confirms the Smart Money Flow
  chart section (with its 2x2 chart grid) is what's actually visible
  after navigating from FlowScan, not the top of the page. Also
  confirmed the Dividen page (which shared no code path with this fix)
  still renders correctly.

`npm test` (83/83 + 16/16 policy + 6/6 provider), `npm run lint` clean.

## 2026-09-11 — AI Trading Win Rate made prominent (user request)

- **User request:** make the AI's real paper-trading win rate more
  visible ("latih AI untuk melihat winrate trading AI" → clarified with
  the user as: surface the existing, already-real win rate more
  prominently, not build a new training pipeline).
- **Before:** `AI_TRADE_STATE.paperAccount.winRate` was real (computed
  in `recomputePaperStats()` purely from closed paper trades, never
  fabricated) but only ever shown inside the "AI Paper Portfolio" tab's
  own KPI row and the Strategy Lab scorecards — invisible on the other 9
  tabs of the AI Trading page (Cockpit, Market Regime, Scanner, etc.).
- **Fix:** added a persistent Win Rate banner in `renderAiTradingPage()`
  (`38-ai-autonomous-trading.js`), placed BEFORE the `activeTab`
  dispatcher so it renders unconditionally on every tab. Shows Win Rate
  (W/L breakdown), Profit Factor, and Net Return; clicking it jumps to
  the "AI Paper Portfolio" tab for full detail. When
  `paper.totalTrades === 0`, shows an explicit "BELUM ADA TRADE" label
  instead of a bare "0%" — a 0% win rate with zero real trades would
  misleadingly read as "the AI always loses" rather than "no data yet".
- **Prevention added:** `test_suite.js` TEST 61 — asserts the banner
  string appears before the `activeTab` dispatcher in source order (so a
  future edit can't accidentally move it back inside one tab's branch),
  and asserts the honest empty-state text and the totalTrades>0 branch
  condition are both present. Verified to fail with a clear message when
  reverted, before being restored.
- **Verification:** live Playwright — confirmed the banner renders on
  initial Cockpit load (honest "BELUM ADA TRADE" state, since this
  sandbox has no real paper trades), persists after switching to the
  Market Regime tab via `aiSwitchTab('regime')`, and that clicking the
  banner correctly sets `AI_TRADE_STATE.activeTab` to `'paper'`.
  Screenshot sent to user.

`npm test` (84/84 + 16/16 policy + 6/6 provider), `npm run lint` clean.

## 2026-09-11 — Scanner Akumulasi & Distribusi: cache client-side per timeframe (Invezgo quota audit)

- **Konteks:** saat menganalisis kebutuhan kuota Invezgo bersama user untuk
  memilih paket berlangganan, ditemukan bahwa `loadAccumulationDistributionData()`
  (Scanner Akumulasi & Distribusi, Opportunity Radar) sama sekali **tidak
  punya cache sisi-klien** — beda dengan `loadOpportunityRadarUniverse()`
  yang sudah punya cache 60 detik. Setiap klik tombol timeframe (1D/3D/5D/
  20D), atau membuka ulang tab Scanner/Anomaly, langsung menembak
  `/api/idx/accumulation-distribution` lagi walau baru saja dimuat.
- **Dampak:** endpoint ini memicu hingga 45 panggilan `generateBrokerSummary()`
  (LQ45) di server, masing-masing berpotensi memakai 1 unit kuota Invezgo
  (`fetchInvezgoBrokerSummary`) kalau cache server-side (Redis, TTL 300
  detik) sudah kedaluwarsa — jadi navigasi bolak-balik antar timeframe
  atau tab bisa memicu pemborosan permintaan HTTP yang sebenarnya tidak
  perlu.
- **Catatan tambahan (bukan bagian dari fix ini, dilaporkan ke user
  terpisah):** `generateBrokerSummary()` ternyata SELALU memakai
  `fromDate=toDate=hari-ini` ke Invezgo terlepas dari parameter
  `timeframe` yang dikirim — jadi 1D/3D/5D/20D saat ini secara teknis
  mengembalikan data Invezgo yang identik untuk hari yang sama. Ini bug
  terpisah di luar scope permintaan cache client-side dan belum diperbaiki
  di sini.
- **Fix:** `RADAR_STATE.accDataCache` (per-timeframe, TTL 5 menit — selaras
  dengan TTL cache server-side `INVEZGO_BROKER_SUMMARY_CACHE_TTL_SEC`,
  supaya klien tidak pernah bertanya ulang lebih cepat dari yang bisa
  dijawab lebih segar oleh cache server sendiri). `loadAccumulationDistributionData(tf, force)`
  sekarang cache-first; parameter `force` (opsional, default false) dipakai
  HANYA oleh dua tombol "Refresh"/"Refresh Feed" eksplisit yang memang
  harus melewati cache.
- **Prevention added:** `test_suite.js` TEST 62 — memastikan cache store,
  pengecekan TTL, dan parameter `force` semuanya ada, serta kedua tombol
  Refresh tetap mengirim `force:true`. Terbukti gagal saat fix di-revert
  sebelum dikembalikan.
- **Verifikasi:** live Playwright — memanggil timeframe yang sama 2x
  berturut-turut hanya memicu 1 network request (cache hit terbukti),
  memanggil timeframe berbeda memicu request baru (cache key benar per
  timeframe), dan `force:true` berhasil melewati cache.

`npm test` (85/85 + 16/16 kebijakan + 6/6 provider), `npm run lint` bersih.

## 2026-09-11 — generateBrokerSummary() sekarang menghormati parameter timeframe

- **Konteks:** kelanjutan dari temuan sampingan di PR #126 (cache Scanner
  Akumulasi & Distribusi) — user secara eksplisit meminta bug ini
  diperbaiki juga.
- **Bug:** `generateBrokerSummary()` selalu memanggil
  `fetchInvezgoBrokerSummary(clean, today, today)` — mengabaikan
  parameter `timeframe` sepenuhnya. Semua nilai timeframe yang dipakai di
  seluruh aplikasi (`1D/3D/5D/20D` di Opportunity Radar Scanner & Flow
  Trail, `1D/1W/1M/3M/6M/1Y` di Bandarmology/StockChat Broker Flow tab)
  menghasilkan request Invezgo yang identik persis (hari ini saja).
  Hanya SIMULASI fallback sisi-klien (`generateClientSideBrokerSummary`,
  41-stockchat-cockpit.js) yang benar-benar membedakan berdasarkan
  timeframe — begitu Invezgo API key aktif, data REAL yang ditampilkan
  justru tidak berubah walau tombol timeframe diklik.
- **Fix:** `BROKER_SUMMARY_TIMEFRAME_DAYS` (tabel pemetaan timeframe →
  jumlah hari kalender) + `brokerSummaryDateRange(timeframe)` helper
  (`lib/idx-data-engine.js`), menghitung `fromDate`/`toDate` riil
  berdasarkan timeframe yang diminta, dikirim ke
  `fetchInvezgoBrokerSummary()`. Field `reportDate` pada respons
  (sebelumnya `today`, format tanpa dash) diganti `toDateDisplay` (format
  `YYYY-MM-DD`, konsisten dengan `reportDate` lain di file yang sama).
- **Prevention added:** `test_suite.js` TEST 63 — memastikan tabel
  pemetaan & helper masih ada, panggilan lama
  `fetchInvezgoBrokerSummary(clean, today, today)` tidak kembali, DAN
  memvalidasi isi tabel pemetaan (1D=0 hari, 3D/5D/20D sesuai, 1W/1M/3M/
  6M/1Y semuanya >0 hari). Terbukti gagal dengan pesan jelas saat fix
  di-revert sebelum dikembalikan.
- **Verifikasi:** skrip Node terpisah (INVEZGO_API_KEY diset sementara +
  `global.fetch` di-stub untuk menangkap URL request) — memanggil
  `generateBrokerSummary()` dengan timeframe 1D/20D/1Y menghasilkan 3 URL
  Invezgo yang BERBEDA (`from_date=20260911` / `20260822` / `20250911`),
  membuktikan rentang tanggal benar-benar berubah sesuai timeframe.
  Catatan: karena `INVEZGO_API_KEY` belum dikonfigurasi di production,
  jalur kode ini masih belum aktif sampai API key sungguhan disetel —
  verifikasi ini membuktikan logikanya benar, bukan perilaku live saat ini.

`npm test` (86/86 + 16/16 kebijakan + 6/6 provider), `npm run lint` bersih.

## 2026-09-11 — AI Paper Trading disinkron ke Supabase (tabel terpisah)

- **User request:** pindahkan data paper trading AI dari localStorage-only
  ke Supabase, supaya Win Rate konsisten lintas device. Konfirmasi desain
  dari user: (1) sync sederhana (simpan-saat-berubah + muat-saat-halaman-
  dibuka, BUKAN realtime), (2) mulai bersih dari Supabase (tidak ada
  migrasi otomatis localStorage lama, karena akun paper trading saat ini
  memang masih kosong).
- **Keputusan desain kunci:** dibuat tabel Supabase BARU (`ai_paper_trading`),
  BUKAN kolom tambahan di tabel `user_data` yang dipakai portofolio riil.
  Alasan: modul AI Trading punya prinsip tertulis "Complete Isolation:
  Zero Mixing with User's Personal Portfolio" (header
  `38-ai-autonomous-trading.js`), dan `user_data` sudah punya sejarah bug
  merge (`isExplicitlyEmpty`, lihat entri incident sebelumnya di file
  ini) — menggabungkan berisiko menambah blast radius bug ke data
  finansial riil pengguna.
- **Implementasi:**
  - `sql/schema_migration.sql`: tabel baru `ai_paper_trading` (`user_id`
    PK → `auth.users`, kolom `data` jsonb, `updated_at`), RLS aktif
    dengan policy `auth.uid() = user_id` untuk select/insert/update.
  - `38-ai-autonomous-trading.js`: `scheduleAiCloudSync()` (debounce 2
    detik, upsert ke `ai_paper_trading`) dipanggil dari
    `savePaperAccountState()`/`saveHypothesesState()`/`saveDecisionLog()`;
    `loadAiCloudState()` (dipanggil sekali per sesi dari
    `initAiAutonomousSuite()`) menarik data cloud dan menimpa state lokal
    + localStorage (cloud jadi sumber utama untuk user yang login, sesuai
    keputusan "mulai bersih"). Guest/demo (`getAppUserId()` return null
    karena tidak ada field `.id` di objek user tamu) dan Supabase yang
    belum dikonfigurasi keduanya no-op diam-diam — localStorage tetap
    jalan seperti sebelumnya, tidak ada regresi untuk kasus itu.
- **Batasan yang harus diketahui:** migrasi SQL ini **harus dijalankan
  manual oleh user** di Supabase SQL Editor — sesi ini tidak punya akses
  eksekusi SQL ke project Supabase user maupun akses jaringan ke Supabase
  API (sandbox network diblokir), jadi verifikasi hanya bisa dilakukan
  dengan me-mock `getSupabaseClient()`/`getAppUserId()` di browser
  (Playwright), bukan terhadap Supabase asli.
- **Prevention added:** `test_suite.js` TEST 64 — memastikan tabel &
  RLS policy ada di SQL, ketiga fungsi save lokal memanggil
  `scheduleAiCloudSync()`, `initAiAutonomousSuite()` memanggil
  `loadAiCloudState()`, sync menulis ke `ai_paper_trading` (bukan
  `user_data`), dan guard guest/demo tetap ada. Terbukti gagal saat fix
  di-revert sebelum dikembalikan.
- **Verifikasi (mocked, live Playwright, jalur produksi asli):**
  - Guest/demo: `initAiAutonomousSuite()` tidak pernah menyentuh
    `getSupabaseClient()` dan tidak melempar error.
  - Signed-in: `aiOpenPositionFromSignal()` (jalur nyata membuka posisi)
    → `savePaperAccountState()` dipanggil 2x berturut → tepat **1** upsert
    ke tabel `ai_paper_trading` (debounce bekerja), payload memuat posisi
    yang baru dibuka.
  - `initAiAutonomousSuite()` dengan data cloud tiruan → state lokal DAN
    localStorage ter-update sesuai data cloud (openPositions/
    closedTrades/winRate/hypotheses/decisionLog semua benar).

`npm test` (87/87 + 16/16 kebijakan + 6/6 provider), `npm run lint` bersih.

**LANGKAH LANJUTAN UNTUK USER (wajib sebelum fitur ini aktif):** jalankan
`sql/schema_migration.sql` (bagian terbaru, "AI PAPER TRADING CLOUD SYNC")
di Supabase SQL Editor project Anda. Tanpa ini, `getSupabaseClient()`
tetap ada tapi upsert/select ke `ai_paper_trading` akan gagal (tabel
belum ada) — aplikasi akan diam-diam fallback ke localStorage-only
seperti sebelumnya (tidak crash, karena semua panggilan Supabase di atas
dibungkus try/catch dengan console.warn).

## 2026-09-11 — Label training XGBoost diganti jadi SL/TP-aware (ATR-based)

- **User request:** perbaiki label training model XGBoost supaya konsisten
  dengan SL/TP yang sungguhan dipakai sistem, bukan target harga generik.
- **Masalah:** `ml/train_xgb_signal.py` melabeli tiap baris training
  sebagai "1 kalau harga naik >3% dalam 10 hari ke depan" — tidak peduli
  risiko sama sekali. Model bisa "benar" soal arah harga naik, padahal di
  eksekusi nyata posisi itu sudah kena Stop Loss duluan sebelum sempat
  naik. Definisi label ini sama sekali tidak terhubung ke SL/TP riil
  (`sl=price-ATR*1.5`, `tp1=price+ATR*2.5`) yang dipakai
  `computeStockSignal()` untuk setiap sinyal yang ditampilkan di aplikasi.
- **Fix:** `compute_atr()` (rata-rata sederhana True Range 14 hari, sama
  persis dengan `computeATR()` di `lib/idx-data-engine.js`) +
  `compute_sl_tp_label()` — label `1` kalau TP1 tersentuh SEBELUM SL dalam
  `MAX_HOLD_DAYS` (20 hari bursa), `0` kalau SL duluan (atau ambigu di
  hari yang sama — konservatif), baris dibuang (bukan diam-diam `0`)
  kalau keduanya belum tersentuh sampai akhir horizon (mengikuti pola
  `INV-011` yang sudah ada). `SL_ATR_MULT=1.5`/`TP_ATR_MULT=2.5`
  eksplisit disamakan dengan konstanta produksi. `meta.json` sekarang
  mencatat `label_definition`/`sl_atr_mult`/`tp_atr_mult`/`atr_period`/
  `max_hold_days`, menggantikan `fwd_days`/`target_return` lama.
  `ml/README.md` diperbarui dengan penjelasan lengkap + peringatan bahwa
  model yang ada di `public/models/` masih dilatih dengan label lama
  sampai retrain berikutnya dijalankan.
- **Prevention added:** `test_suite.js` TEST 65 — memastikan
  `SL_ATR_MULT`/`TP_ATR_MULT` cocok dengan produksi, helper `compute_atr`/
  `compute_sl_tp_label` ada dan BENAR-BENAR dipanggil di `build_dataset()`
  (bukan cuma dicek lewat nama fungsi di definisi — celah ini sempat lolos
  di percobaan pertama test, diperbaiki), konstanta lama `TARGET_RETURN`
  dan pola `shift(-N)` generik tidak boleh kembali. Terbukti gagal dengan
  pesan jelas saat fix di-revert dua kali (skenario berbeda) sebelum
  dikembalikan.
- **Verifikasi (Python, di luar `npm test`):**
  - `compute_atr()`/`compute_sl_tp_label()` diuji terpisah terhadap 4
    skenario OHLCV sintetis dengan hasil yang diketahui: TP tersentuh →
    label 1.0 ✓, SL tersentuh → label 0.0 ✓, tidak ada yang tersentuh →
    NaN (dibuang) ✓, keduanya tersentuh hari sama → konservatif 0.0 ✓.
  - Pipeline penuh (`build_dataset` → training XGBoost → ekspor ONNX →
    `meta.json`) dijalankan end-to-end memakai data OHLCV sintetis
    (random walk, 3 ticker palsu, network Yahoo Finance diblokir di
    sandbox ini) — tidak ada error, `meta.json` berisi field label baru
    dengan benar.
  - **Belum bisa dijalankan dengan data Yahoo Finance sungguhan** dari
    sandbox ini (jaringan diblokir) — retrain sungguhan untuk
    `public/models/xgb_signal.onnx` harus dijalankan manual oleh user
    atau menunggu jadwal bulanan `retrain-model.yml`.

`npm test` (88/88 + 16/16 kebijakan + 6/6 provider), `npm run lint` bersih.

## 2026-09-11 — XGBoost BUY/SELL threshold dikalibrasi dari persentil (Opsi A)

- **Konteks:** setelah retrain XGBoost dengan label SL/TP-aware (entri
  incident sebelumnya) dijalankan lewat GitHub Actions dan model baru
  di-deploy, user menjalankan Backtester dengan strategi XGBoost pada
  BBCA (2 tahun) — hasilnya **0 trade sepanjang periode**, equity curve
  flat total, 0 sinyal.
- **Root cause ditemukan dari log training GitHub Actions:** classification
  report menunjukkan recall kelas BUY (label 1) cuma **3,1%** pada
  threshold default 0,5 — model baru nyaris selalu memprediksi "0" apa
  pun kondisinya. `BUY_THRESHOLD=0.60` (tetap) nyaris tidak pernah
  tertembus, konsisten persis dengan 0 sinyal yang dilaporkan user.
  Precision kelas BUY juga cuma 29,7% (base rate test set 37,6%) —
  indikasi kuat model tidak menemukan sinyal nyata dari 6 fitur teknikal
  yang ada untuk target SL/TP-aware yang baru (jauh lebih sulit dari
  target arah-harga lama).
- **Fix (Opsi A, dipilih user dari 3 opsi yang diajukan — Opsi B/C lebih
  besar scope-nya):** `BUY_THRESHOLD`/`SELL_THRESHOLD` (konstanta tetap
  0.60/0.35) diganti `BUY_PERCENTILE=80`/`SELL_PERCENTILE=20` —
  `buy_threshold`/`sell_threshold` yang ditulis ke `xgb_signal_meta.json`
  sekarang dihitung sebagai persentil ke-80/ke-20 dari distribusi
  probabilitas prediksi model SENDIRI di test set, bukan angka absolut.
  Ini menjamin model selalu memberi sinyal pada kasus paling meyakinkan
  menurut dirinya sendiri (tidak lagi 0 sinyal), tapi TIDAK menjamin
  sinyal itu akurat.
- **Transparansi ditambahkan (bukan cuma fix diam-diam):** skrip sekarang
  mencetak & menyimpan diagnostik jujur setiap training — precision pada
  threshold hasil kalibrasi vs base rate label positif, plus "lift"
  (rasio keduanya). Field baru di `xgb_signal_meta.json`:
  `buy_percentile`/`sell_percentile`/`base_rate`/
  `buy_precision_at_threshold`/`buy_signal_rate_test`. Kalau lift <1.15x
  di retrain berikutnya, itu tanda Opsi A saja tidak cukup dan Opsi B
  (class-weighting) atau Opsi C (fitur tambahan) perlu dipertimbangkan —
  didokumentasikan eksplisit di `ml/README.md`.
- **Prevention added:** `test_suite.js` TEST 66 — memastikan konstanta
  tetap lama tidak kembali, `BUY_PERCENTILE=80`/`SELL_PERCENTILE=20` ada,
  `np.percentile(proba, ...)` benar-benar dipanggil untuk kedua threshold,
  dan `meta.json` menulis variabel PERHITUNGAN (bukan konstanta lama) plus
  field diagnostik precision/base_rate. Terbukti gagal dengan pesan jelas
  saat fix di-revert ke konstanta tetap sebelum dikembalikan.
- **Verifikasi:** pipeline penuh dijalankan ulang dengan data sintetis
  (Yahoo Finance diblokir di sandbox ini) — diagnostik tercetak dengan
  benar (base rate 27,6%, threshold persentil-80 = 0,559, precision di
  titik itu 36,7%, lift 1,33x "ada sinyal nyata di atas base rate" pada
  data sintetis ini), `meta.json` berisi semua field baru dengan nilai
  yang konsisten dengan output training.
- **Belum bisa diverifikasi di data BBCA riil dari sandbox ini** (Yahoo
  Finance & CDN onnxruntime-web sama-sama diblokir) — user perlu
  menjalankan ulang retrain (GitHub Actions manual atau tunggu jadwal
  bulanan) lalu uji ulang di Backtester untuk melihat apakah 0-sinyal
  sudah teratasi dan berapa lift precision aktualnya di data BBCA nyata.

`npm test` (89/89 + 16/16 kebijakan + 6/6 provider), `npm run lint` bersih.

## 2026-09-11 — Opsi C: 4 fitur baru untuk model XGBoost (mengatasi lift 1.09x)

- **Konteks:** setelah Opsi A (kalibrasi threshold persentil) mengatasi
  masalah "0 sinyal", diagnostik jujur di titik threshold hasil kalibrasi
  hanya menunjukkan **lift 1,09x** vs base rate (di bawah ambang 1,15x) —
  konfirmasi bahwa 6 fitur teknikal lama memang tidak cukup untuk target
  SL/TP-aware, bukan cuma soal kalibrasi threshold.
- **Analisis:** 6 fitur lama (`sma_ratio`, `rsi14`, `mom20`, `vol_ratio`,
  `volatility20`, `dist_high20`) semuanya soal ARAH/MOMENTUM harga —
  tidak ada satu pun yang menangkap REZIM VOLATILITAS, padahal target
  SL/TP itu sendiri ATR-scaled (`sl=price-ATR*1.5`, `tp1=price+ATR*2.5`),
  jadi volatilitas relatif terhadap harga langsung menentukan seberapa
  "jauh" target itu secara persentase.
- **Fix (Opsi C):** 4 fitur baru ditambahkan ke `FEATURE_NAMES`
  (Python)/`XGB_FEATURES` (JS), total jadi 10 fitur:
  - `atr_pct` = ATR(14)/close — volatilitas relatif terhadap harga.
  - `ema20_slope5` = percepatan tren jangka pendek dari EMA20 (lebih
    halus dari `mom20` mentah).
  - `dist_ema20` = seberapa jauh harga "meregang" dari EMA20 — sinyal
    mean-reversion vs trend-continuation.
  - `atr_ratio_20` = ATR(14) sekarang vs 20 hari lalu — rezim
    volatilitas melebar/menyempit.
- **Keputusan desain kritis (train/serve skew):** EMA20 dihitung dari
  jendela TETAP 60 candle terakhir (`EMA_LOOKBACK`/`XGB_EMA_LOOKBACK`),
  BUKAN direkursi dari seluruh histori — meniru persis pola
  `computeEMA(closes.slice(-40), 20)` yang sudah ada di
  `lib/idx-data-engine.js`. Kalau direkursi dari histori penuh, nilai EMA
  akan berbeda antara training (histori 5 tahun) dan inferensi live di
  browser (mungkin cuma dapat histori 1 tahun) untuk tanggal yang sama —
  bug train/serve skew yang tidak pernah muncul sebagai error, cuma diam-
  diam merusak akurasi. `xgbComputeFeatures()` (JS) sekarang mulai loop
  dari baris ke-60 (dulu ke-30) supaya jendela EMA selalu penuh.
- **Verifikasi parity numerik (bukan cuma baca kode):** data OHLCV
  sintetis identik di-generate sekali di Python, dimuat ulang di kedua
  sisi (Python `compute_features()` dan Node yang menjalankan salinan
  persis `xgbComputeFeatures()`) — **seluruh 10 fitur di 240 baris cocok
  persis, diff 0.0** untuk semua fitur termasuk 4 fitur baru.
- **Prevention added:** `test_suite.js` TEST 67 — mengekstrak
  `FEATURE_NAMES` (Python) dan `XGB_FEATURES` (JS) lewat regex, memastikan
  isinya identik persis (nama + urutan), memastikan 4 fitur baru ada di
  kedua sisi, memastikan `EMA_LOOKBACK`/`XGB_EMA_LOOKBACK` bernilai sama,
  dan memastikan loop JS mulai dari `XGB_EMA_LOOKBACK` bukan konstanta
  tetap lama. Terbukti gagal dengan pesan jelas saat JS di-revert ke 6
  fitur lama (simulasi desync) sebelum dikembalikan.
- **Verifikasi tambahan:** pipeline training penuh dijalankan ulang
  dengan data sintetis (3 ticker random-walk) — 10 fitur, training,
  ekspor ONNX, `meta.json` semua berhasil tanpa error.
- Cache-bust `11-quant.js` → `?v=20260911a`.
- **Batasan jujur:** data sintetis TIDAK bisa membuktikan apakah 4 fitur
  baru ini benar-benar menambah sinyal prediktif nyata di data pasar —
  cuma membuktikan pipeline & parity Python↔JS benar. Validasi kualitas
  sesungguhnya (apakah lift naik di atas 1,15x) baru bisa dilihat setelah
  retrain sungguhan lewat GitHub Actions dengan data Yahoo Finance riil.

`npm test` (90/90 + 16/16 kebijakan + 6/6 provider), `npm run lint` bersih.

## 2026-09-11 — XGBoost strategy didokumentasikan jujur sebagai eksperimen edukasi (iterasi dihentikan)

- **Konteks:** setelah 3 iterasi perbaikan berturut-turut (label SL/TP-
  aware → kalibrasi threshold persentil/Opsi A → 10 fitur teknikal/Opsi
  C), lift vs base rate justru MENURUN (1,09x → 0,98x) alih-alih naik ke
  ambang 1,15x yang ditetapkan sebagai "ada sinyal nyata". User memutuskan
  berhenti mengiterasi dan mendokumentasikan strategi ini apa adanya.
- **Masalah honesty yang diperbaiki sekaligus:** sebelumnya UI menampilkan
  badge hijau "alert-ok" dan teks "akurasi test X%" — secara teknis benar
  tapi menyesatkan, karena accuracy tinggi gampang dicapai model yang
  cuma menebak kelas mayoritas terus-menerus (persis situasi model ini).
  Tombol strategi juga bertuliskan "XGBoost*" dengan tanda bintang yang
  **tidak pernah punya footnote** di mana pun di aplikasi — dangling
  reference yang sudah lama ada, ditemukan & diperbaiki sekalian.
- **Fix:**
  - `public/index.html`: tombol strategi Backtester diubah dari
    "XGBoost*" → **"XGBoost (Eksperimen)"** dengan tooltip yang mengarah
    ke `ml/README.md`.
  - `public/js/11-quant.js` (`xgbUpdateStatusUI()`): badge status diubah
    dari hijau (`alert-ok`) ke amber (`alert-warn`); teks sekarang
    eksplisit "EKSPERIMEN/EDUKASI" dan menampilkan **precision vs base
    rate langsung dari `meta.json`** (`buy_precision_at_threshold`/
    `base_rate`) — bukan cuma accuracy mentah yang menyesatkan.
  - `ml/README.md`: callout "STATUS: EKSPERIMEN EDUKASI" di paling atas
    file, plus bagian "Kesimpulan" baru berisi tabel 3 iterasi (0 sinyal
    → 1,09x → 0,98x) dan penjelasan kenapa iterasi dihentikan, plus 3
    opsi lanjutan (scope besar) kalau suatu saat ingin dilanjutkan.
- **Prevention added:** `test_suite.js` TEST 68 — memastikan label tombol
  "XGBoost (Eksperimen)" ada, badge status tetap amber (bukan hijau),
  teks "EKSPERIMEN/EDUKASI" dan diagnostik precision/base_rate tetap
  ditampilkan, dan `ml/README.md` tetap mendokumentasikan angka lift
  1,09x/0,98x serta status eksperimen di bagian atas. Terbukti gagal saat
  fix di-revert ke versi lama (badge hijau + teks accuracy polos) sebelum
  dikembalikan.
- **Verifikasi live (Playwright, mocked `ort`/fetch model karena CDN
  onnxruntime-web & jaringan diblokir di sandbox ini):** tombol strategi
  menampilkan "XGBoost (Eksperimen)" dengan tooltip benar; status box
  menampilkan badge amber dan teks lengkap "Model XGBoost ONNX aktif
  (v20260911, 20 saham) — EKSPERIMEN/EDUKASI... precision 36,5% vs base
  rate 37,1% — TIDAK ada bukti sinyal prediktif jelas..." — persis sesuai
  desain.
- Cache-bust `11-quant.js` → `?v=20260911b`.

`npm test` (91/91 + 16/16 kebijakan + 6/6 provider), `npm run lint` bersih.

**Status akhir topik "AI trading / machine learning untuk sinyal XGBoost":
ditutup sebagai keputusan sadar user** — model tetap ada dan berfungsi
teknis, tapi sekarang jujur melabeli dirinya sebagai eksperimen edukasi
tanpa bukti sinyal prediktif, bukan alat yang diklaim bekerja.

## 2026-09-11 — localStorage origin penuh (4.99/5MB): cache harga tak dibatasi menghabiskan kuota data portofolio riil

- **Ditemukan dari:** console browser user nyata — `QuotaExceededError:
  Failed to execute 'setItem' on 'Storage'... exceeded the quota` saat
  `authLogout()` memanggil `saveData()`.
- **Diagnosis (via skrip yang dijalankan user di Console browsernya
  sendiri):** total localStorage origin **4,99 MB dari kuota ~5 MB
  Chrome, ~0 MB tersisa**. 10 key terbesar didominasi oleh:
  - `mw_local_data_v3_u_<user>` (1,66 MB) — blob data portofolio riil
    user (via `saveData()`), termasuk `equityHistory` ter-nested dobel.
  - `MW_KSEI_DATA_CACHE` (890 KB) — cache data pemegang saham KSEI.
  - Deretan `mw_rd_PXH_STK_<TICKER>`/`mw_rd_PXH_IDX_<INDEX>`, masing-
    masing ~90-130 KB — cache histori harga **10 tahun (DAILY_MAX)** per
    simbol, ditulis oleh `perfFetchDailyHistory()` (`21-performance.js`)
    lewat `rdSave()` (`13-realdata.js`).
- **Root cause:** `rdSave()` adalah satu-satunya titik tulis untuk
  SELURUH keluarga cache `mw_rd_*` — dipakai baik oleh cache 1-tahun
  miliknya sendiri maupun cache 10-tahun `perfFetchDailyHistory()`.
  **Tidak ada mekanisme penghapusan sama sekali** — setiap saham/index/
  crypto/ETF baru yang pernah dianalisis user (Bandarmology, Stock Intel,
  FlowScan, Screener, Correlation, Heatmap, Ranking — semua modul yang
  pernah menyentuh histori harga) menambah key permanen baru, tidak
  pernah dibersihkan. Untuk user aktif jangka panjang, akumulasi ini
  akhirnya menghabiskan kuota origin, dan korbannya adalah penulisan
  **data portofolio riil user sendiri** — yang justru paling tidak boleh
  gagal diam-diam.
- **Fix 1 — `rdSave()`/`13-realdata.js`:** `RD_CACHE_BUDGET_BYTES` (2MB
  gabungan untuk seluruh keluarga `mw_rd_*`) + `_rdEvictIfNeeded()` —
  sebelum menulis entry baru, hitung total ukuran semua key `mw_rd_*`
  yang ada; kalau akan melebihi budget, hapus entry paling basi (field
  `d` = tanggal terakhir di-refresh, dipakai sebagai proksi recency)
  duluan sampai muat. LRU sederhana tanpa index terpisah.
- **Fix 2 — `showSaveStatus()`/`02-storage.js`, celah yang ditemukan
  SAAT memverifikasi fix 1 secara live:** peringatan quota-exceeded yang
  sudah ditambahkan sebelumnya (catch block `saveData()` step 1) ternyata
  **langsung tertimpa** dalam ~1 detik oleh pesan sukses rutin "Tersimpan
  ke Supabase Cloud" dari `_syncToCloud()` — keduanya berbagi status bar
  yang sama tanpa konsep prioritas, jadi peringatan langka yang penting
  itu praktis tidak pernah sempat terbaca user. Ditambahkan parameter
  `priority` (opsional, default 0, backward-compatible) — pesan
  prioritas lebih tinggi tidak bisa ditimpa pesan prioritas lebih rendah
  sebelum durasi tampilnya habis. Peringatan quota sekarang dikirim
  dengan `priority=10`.
- **Prevention added:**
  - `test_suite.js` TEST 69 — memuat `rdSave()`/`_rdEvictIfNeeded()`
    lewat vm sandbox dengan mock localStorage in-memory, menulis 40 entry
    ~10 tahun (2500 baris) berturut-turut dengan tanggal `d` yang naik
    strict, membuktikan: (a) eviction benar-benar terjadi, (b) total
    footprint tetap di bawah budget, (c) entry TERLAMA yang dihapus
    duluan (bukan sembarang urutan). Terbukti gagal saat pemanggilan
    `_rdEvictIfNeeded()` di-revert sebelum dikembalikan.
  - `test_suite.js` TEST 70 — reimplementasi setia gate prioritas
    `showSaveStatus()`, membuktikan: pesan prioritas rendah tidak bisa
    menimpa pesan prioritas tinggi yang masih aktif, tapi BISA menimpa
    setelah pesan itu genuinely expired (status bar tidak macet
    selamanya), dan pesan prioritas SAMA tetap bisa saling gantian.
    Terbukti gagal saat parameter `priority=10` di-revert dari
    pemanggilan di `saveData()`.
- **Verifikasi live Playwright:**
  - `saveData()` dengan `localStorage.setItem` di-mock melempar
    `QuotaExceededError` → status bar menampilkan peringatan merah yang
    benar.
  - Peringatan itu **bertahan** walau `showSaveStatus()` prioritas rendah
    dipanggil segera setelahnya (simulasi pesan sukses Supabase) —
    sebelumnya tertimpa, sekarang tidak.
- Cache-bust `02-storage.js` → `?v=20260911a`, `13-realdata.js` →
  `?v=20260911a`.

`npm test` (93/93 + 16/16 kebijakan + 6/6 provider), `npm run lint` bersih.

**Catatan untuk user yang melaporkan insiden ini:** setelah fix ini aktif
(reload aplikasi), cache harga lama yang sudah terlanjur menumpuk di
browser Anda TIDAK otomatis dibersihkan sampai `rdSave()` dipanggil lagi
(mis. membuka analisis saham baru) — eviction baru berjalan saat ada
penulisan baru yang memicunya. Kalau ingin bersih seketika, bisa hapus
manual key `mw_rd_*` lewat DevTools → Application → Local Storage, atau
tunggu penggunaan normal secara bertahap memicu eviction.

## 2026-09-11 — FlowScan Ranking/Watchlist/Heatmap: nama emiten = kode ticker untuk saham di luar FS_UNIV (mis. CUAN)

- **Reported by:** user, via screenshot daftar saham bernomor (kolom
  kode/nama/badge sektor/harga) — baris CUAN tampil hanya 2 baris teks
  (kode + sektor/harga) alih-alih 3 baris seperti baris lain, karena nama
  yang ditampilkan sama persis dengan kodenya.
- **Root cause:** `fsFallbackInfo(tk)` di `public/js/07-flowscan.js` —
  fallback bersama untuk ticker yang TIDAK ada di `FS_UNIV` (daftar
  statis kurasi hanya 30 saham blue-chip; CUAN bukan salah satunya) —
  selalu mengembalikan `n: tk` (nama = kode ticker itu sendiri), meski
  `DB[tk].name` sudah punya nama perusahaan yang benar ('Petrindo Jaya
  Kreasi Tbk.' untuk CUAN, dari `01-data.js`). Field `s` (sektor) di
  fungsi yang sama SUDAH diperbaiki lebih dulu (insiden sebelumnya) untuk
  jatuh ke `DB[tk].sector` — tapi perbaikan yang sama tidak pernah
  diterapkan ke field `n`. Dipakai oleh `fsRunAnalysis()`,
  `fsToogleWatchlistCurrent()`, `fsSyncWithPortfolio()`, `fsTgWl()`, dan
  `fsInit()` — jadi bug ini muncul di Ranking, Heatmap, dan Watchlist
  FlowScan untuk SETIAP ticker di luar 30 saham `FS_UNIV`, bukan cuma
  CUAN.
- **Fix:** `fsFallbackInfo()` sekarang membaca `DB[tk].name` (dengan
  guard `!== tk`, sama seperti pola yang sudah dipakai
  `getIntelStockMeta()` di `27-stockintel.js`) sebelum jatuh ke kode
  ticker sebagai nama.
- **Prevention added:**
  - `test_suite.js` TEST 71 — memuat `fsFallbackInfo()` lewat vm sandbox
    (irisan `FS_UNIV`...`fsFallbackInfo` saja, DB/XLSX_DATA di-stub),
    membuktikan: (a) ticker dengan `DB[tk].name` valid (CUAN) menghasilkan
    nama perusahaan asli bukan kode, (b) sektor (perilaku lama yang sudah
    benar) tetap bekerja, (c) ticker tanpa entri DB sama sekali, atau
    dengan sektor tapi tanpa nama, tetap fallback ke kode tanpa error.
    Terbukti gagal (assertion regresi + assertion nilai `n`) saat fix
    di-revert ke versi lama `{t:tk, n:tk, ...}`.
- Cache-bust `07-flowscan.js` → `?v=20260911c`.

`npm test` (94/94 + 16/16 kebijakan + 6/6 provider), `npm run lint` bersih.

## 2026-09-11 — Audit lanjutan: 2 instance lain dari bug "nama = kode ticker" ditemukan & diperbaiki (rdRebuildFromReal, getKseiStock)

- **Trigger:** setelah fix `fsFallbackInfo()` di atas (CUAN), diaudit apakah
  ada pola bug serupa di tempat lain — DB (`01-data.js`, 958 ticker) dan
  `FS_UNIV` sendiri sudah bersih (tidak ada nama kosong/sama dengan kode),
  tapi ditemukan DUA tempat lain yang membangun fallback nama secara
  independen tanpa mengecek `DB[tk].name` lebih dulu:
- **1) `rdRebuildFromReal()` (`public/js/13-realdata.js`):** forEach yang
  merekonstruksi entry watchlist (`FS_WL`) setelah data riil dimuat ulang
  punya salinan sendiri dari fallback LAMA `fsFallbackInfo()` (sebelum
  diperbaiki hari ini): `{t:t, n:t, s:'IHSG', cap:0}` — nama = kode DAN
  sektor = 'IHSG' (indeks komposit, bukan sektor). Ticker apa pun di
  watchlist user yang berada di luar `FS_UNIV` (mis. CUAN) akan
  kembali kehilangan nama & sektor aslinya setiap kali data riil di-reload.
  **Fix:** reuse `fsFallbackInfo(t)` (helper yang sudah diperbaiki),
  bukan duplikasi logika.
- **2) `getKseiStock()` (`public/js/34-ksei-shareholders.js`):** fallback
  untuk saham tanpa data pemegang saham KSEI (free float 100%/belum
  disync) selalu membuat nama generik `"<TICKER> Tbk."` tanpa pernah
  mengecek `DB[tk].name` — jadi kartu detail emiten KSEI bisa menampilkan
  nama generik walau nama asli sudah tersedia di DB.
  **Fix:** cek `DB[tk].name` (guard `!== tk`) dulu, baru jatuh ke
  placeholder generik.
- **Yang SUDAH diverifikasi bersih (tidak perlu fix):**
  - `DB` (`01-data.js`, 958 ticker) — 0 nama kosong, 0 nama = kode.
  - `FS_UNIV` (30 ticker statis) — 0 nama = kode.
  - `11-quant.js:1162` — fallback `{name: ticker, sector:'IHSG'}` HANYA
    terpicu kalau `DB[ticker]` DAN `FS_UNIV` sama-sama tidak menemukan
    ticker sama sekali (ticker benar-benar tidak dikenal) — DB mencakup
    958 ticker jadi jalur ini praktis tidak terpicu untuk saham IDX asli.
- **Prevention added:**
  - `test_suite.js` TEST 72 — mengekstrak blok `wlTks.forEach` dari
    `rdRebuildFromReal()` lewat `new Function()` dengan dependency
    di-mock, membuktikan entry CUAN di watchlist mendapat nama & sektor
    asli lewat `fsFallbackInfo()`, bukan fallback hardcoded lama. Terbukti
    gagal saat direvert.
  - `test_suite.js` TEST 73 — memuat `getKseiStock()` lewat vm sandbox
    dengan `DB`/`KSEI_STATE` di-mock, membuktikan CUAN mendapat nama asli
    dari DB, dan ticker tanpa nama DB tetap fallback ke placeholder
    generik tanpa error. Terbukti gagal saat direvert.
- Cache-bust `13-realdata.js` → `?v=20260911b`,
  `34-ksei-shareholders.js` → `?v=20260911a`.

`npm test` (96/96 + 16/16 kebijakan + 6/6 provider), `npm run lint` bersih.

## 2026-09-11 — AI Copilot ("MoneyWatch Pro AI") menampilkan pesan error mati jalan, tidak berguna, saat server AI gagal

- **Reported by:** user, via screenshot — halaman Copilot menampilkan
  "Gagal terhubung ke engine MoneyWatch Pro AI. Silakan coba kembali
  sesaat lagi." dua kali berturut-turut, tanpa detail apa pun dan tanpa
  jalan keluar.
- **Root cause:** `sendCopilotPrompt()` (`public/js/28-decisiontools.js`)
  memanggil `POST /api/ai/agent-chat` lalu langsung `await res.json()`
  tanpa cek `res.ok` — kalau server merespons non-2xx (mis. 504 Gateway
  Timeout dari fungsi serverless Vercel yang timeout) dengan body HTML,
  `res.json()` melempar exception, jatuh ke `catch` yang menampilkan
  pesan generik tetap tanpa status HTTP atau penyebab nyata. Tidak ada
  fallback sama sekali — begitu request gagal (jaringan, timeout, atau
  body bukan JSON), user benar-benar mentok.
  Bandingkan dengan `sendStockChatMessage()` di `41-stockchat-cockpit.js`
  yang memanggil endpoint YANG SAMA: fungsi itu sudah lebih dulu punya
  fallback `generateClientSideAiAgentResponse()` — engine deterministik
  client-side yang SELALU memberi jawaban berguna, apa pun penyebab
  kegagalan server. Copilot tidak pernah mengadopsi pola yang sama.
- **Fix:** `sendCopilotPrompt()` sekarang mengecek `res.ok` sebelum parse
  JSON, dan pada KEGAGALAN APA PUN (network error, non-2xx, body bukan
  JSON, atau `{success:false}`) jatuh ke `generateClientSideAiAgentResponse()`
  — engine cadangan yang sama seperti StockChat — sehingga user selalu
  dapat analisa yang berguna, bukan pesan mati jalan. Hanya kalau engine
  cadangan itu sendiri juga tidak ter-load, pesan terakhir sekarang
  menyebutkan penyebab sebenarnya (bukan pesan generik "coba lagi").
- **Prevention added:**
  - `test_suite.js` TEST 74 — memuat `sendCopilotPrompt()` lewat vm
    sandbox dengan `fetch` di-mock 5 skenario (network error, HTTP
    non-2xx, JSON body malformed, sukses normal, engine cadangan tidak
    tersedia), membuktikan: (a) 3 skenario kegagalan pertama semuanya
    jatuh ke `generateClientSideAiAgentResponse()` bukan pesan mati
    jalan, (b) saat server sukses, engine cadangan TIDAK ikut dipanggil
    (bukan jawaban ganda), (c) saat engine cadangan sendiri tidak ada,
    pesan terakhir tetap menyebutkan penyebab nyata. Ditambahkan helper
    `asyncTest()` ke `test_suite.js` (pola sama seperti
    `test_provider_functions.js`) karena `test()` yang ada tidak
    meng-`await` fungsi test. Terbukti gagal saat fix direvert.
- Cache-bust `28-decisiontools.js` → `?v=20260911b`.

`npm test` (97/97 + 16/16 kebijakan + 6/6 provider), `npm run lint` bersih.

## 2026-09-11 — AI Copilot: kontras teks buruk pada bubble "Anda" (light theme) + jawaban AI ngaco untuk pertanyaan portofolio

- **Reported by:** user, via screenshot — bubble "Anda" di Copilot tampil
  teks hitam/gelap di atas latar biru solid (sulit dibaca), dan pertanyaan
  "analisa portofolio saya" dijawab dengan "Kode ticker SAYA tidak
  teridentifikasi pada database pasar saham Indonesia (IDX)..." alih-alih
  ringkasan portofolio.

### Bug 1: Kontras bubble "Anda" (`public/js/28-decisiontools.js`)
- **Root cause:** `.bubble-user` (CSS, `main.css`) di light theme diberi
  `background:#2563EB !important` — tapi `!important` pada properti `color`
  milik DIV bubble itu sendiri TIDAK pernah menang atas `color` yang
  di-set eksplisit secara inline pada elemen ANAK (`cb-role`, `cb-text`).
  Kedua elemen anak itu memakai `var(--accent)`/`var(--text)`, yang di
  light theme masing-masing resolve ke `#0000FF`/`#1D252C` — biru pudar
  dan nyaris hitam di atas latar biru solid, persis bug yang dilaporkan.
- **Fix:** `cb-role` dan `cb-text` untuk bubble user sekarang hardcode
  putih (`#FFFFFF`), sama seperti pola yang sudah benar di StockChat
  cockpit (`41-stockchat-cockpit.js` line ~1557, `color:#ffffff` langsung,
  tidak bergantung variabel tema) — bubble "Anda" selalu di atas warna
  biru di semua tema, jadi teks putih selalu aman.

### Bug 2: Jawaban ngaco untuk pertanyaan portofolio (`public/js/41-stockchat-cockpit.js`)
- **Root cause:** `generateClientSideAiAgentResponse()` (engine fallback
  client-side, sekarang juga dipakai AI Copilot sejak PR #136) SELALU
  mencoba mengekstrak kode ticker dari pesan lebih dulu — kalau tidak ada
  ticker asli yang cocok, ia menebak kata 3-6 huruf sebagai "kemungkinan
  ticker" (`possibleCode`). Untuk "analisa portofolio saya", kata `SAYA`
  (4 huruf, tidak ada di daftar pengecualian) lolos sebagai tebakan
  ticker, gagal validasi IDX universe, dan LANGSUNG return pesan error
  "Ticker Tidak Terdaftar" — SEBELUM logika pengecekan intent
  porto/aum/holding/rdn/kas (yang sebenarnya sudah benar dan lengkap)
  sempat dicek sama sekali. Kata seperti `KAS` sendirian punya masalah
  serupa.
- **Fix:** intent portofolio/AUM/kas dan strategi/playbook sekarang dicek
  LEBIH DULU (`isPortfolioIntent`, `isStrategyIntent`); kalau salah satu
  cocok, ekstraksi/validasi ticker dilewati sepenuhnya (dua intent ini
  memang tidak butuh ticker tunggal yang valid). Proteksi "Zero Dummy
  Data" untuk ticker yang benar-benar tidak dikenal tetap berjalan normal
  untuk pertanyaan spesifik-ticker.
- **Prevention added:**
  - `test_suite.js` TEST 75 — mengevaluasi ekspresi `.map()` pembangun
    bubble lewat `new Function()`, membuktikan bubble user (`cb-role`,
    `cb-text`) benar-benar `color:#FFFFFF` di HTML yang dihasilkan, dan
    bubble assistant tetap `var(--text)` (sanity). Terbukti gagal saat
    direvert.
  - `test_suite.js` TEST 76 — memuat `generateClientSideAiAgentResponse()`
    lewat vm sandbox, membuktikan "analisa portofolio saya" dan "cek kas
    saya" menghasilkan jawaban portofolio asli (bukan error ticker),
    ticker yang benar-benar tidak dikenal (tanpa intent porto/strategi)
    tetap kena guard Zero Dummy Data, dan ticker valid (BBCA) tetap
    berfungsi normal. Terbukti gagal saat direvert.
- Cache-bust `28-decisiontools.js` → `?v=20260911c`,
  `41-stockchat-cockpit.js` → `?v=20260911e`.

`npm test` (99/99 + 16/16 kebijakan + 6/6 provider), `npm run lint` bersih.

## 2026-09-11 — Fitur baru: AI Copilot/StockChat bisa menganalisa kinerja & memberi saran perbaikan dari histori AI Paper Trading riil

- **Konteks:** user bertanya bagaimana menerapkan ML supaya AI chat "menganalisa data, memberi saran perbaikan, dan jadi copilot trading". Setelah diskusi jujur (ML terlatih butuh data historis yang belum cukup — sama seperti pengalaman XGBoost minggu lalu), user memilih item #1: perkaya konteks Copilot dengan data real (context engineering, bukan ML terlatih).
- **Root gap:** AI Copilot & StockChat (keduanya lewat `/api/ai/agent-chat`) sebelumnya TIDAK PERNAH punya akses ke rekam jejak AI Paper Trading (`AI_TRADE_STATE.paperAccount`, `38-ai-autonomous-trading.js`) — data itu murni client-side/localStorage, server tidak tahu apa-apa soal itu, dan tidak ada tool yang mengeksposnya ke Gemini. Akibatnya pertanyaan "beri saran perbaikan" tidak bisa dijawab dari data nyata pengguna.
- **Fix (fitur baru):**
  - `public/js/28-decisiontools.js` — `sendCopilotPrompt()` sekarang membangun `userContext.aiPaperTrading` (win rate, profit factor, realized PnL, max drawdown, 5 trade terakhir + lesson/mistake/improvement dari mesin Post-Mortem 10-Point yang sudah ada) dari `AI_TRADE_STATE.paperAccount`, typeof-guarded.
  - `server.js` — tool baru `cek_kinerja_ai_trading` (Gemini function-calling) + case di `executeAgentTool()` yang membaca `userContext.aiPaperTrading` dan mengembalikannya apa adanya — TIDAK PERNAH mengarang win rate/lesson kalau data kosong (Zero Dummy Data, sama seperti tool lain). `SYSTEM_INSTRUCTION_MONEYWATCH_AI` diupdate (aturan #8) supaya Gemini wajib panggil tool ini untuk pertanyaan kinerja/saran perbaikan, bukan mengarang saran generik.
  - Fallback deterministik (non-Gemini) dan fallback client-side (`generateClientSideAiAgentResponse()` di `41-stockchat-cockpit.js`) — keduanya dapat cabang baru yang sama, supaya perilaku konsisten di ketiga lapis (Gemini → deterministik server → client-side).
- **Bug tambahan ditemukan & diperbaiki saat live-verify:**
  1. `pLower.includes('kas')` di branch portofolio server.js DAN client-side cocok sebagai substring kata umum **"kasih"** — "kasih saran perbaikan..." salah dialihkan ke branch portofolio. Diperbaiki jadi `\bkas\b` (word boundary) di kedua file.
  2. `pLower.includes('ara')` di branch simulasi/ARA-ARB server.js cocok sebagai substring **"saran"** (s-**ara**-n) — kolisi yang sama menimpa branch baru dari sisi lain. Diperbaiki dengan memindahkan branch `cek_kinerja_ai_trading` ke urutan PALING AWAL di rantai if/else server.js (kata kunci multi-kata yang lebih khas, mengurangi risiko tabrakan dengan short-keyword branch lain) — bukan memperbaiki setiap short-keyword lama satu-satu (di luar cakupan kerja ini).
- **Prevention added:**
  - `test_suite.js` TEST 77 — `executeAgentTool('cek_kinerja_ai_trading')` lewat vm sandbox: no-data → `hasData:false` tanpa fabrikasi, data asli → semua field (termasuk lesson/mistake/improvement) diteruskan utuh.
  - `test_suite.js` TEST 78 — fallback deterministik server.js merutekan pertanyaan kinerja AI ke tool baru, DAN posisinya lebih dulu dari branch catch-all umum (bukan dead code).
  - `test_suite.js` TEST 79 — `generateClientSideAiAgentResponse()` (client-side) menjawab dari `userContext.aiPaperTrading` tanpa terjebak gerbang validasi ticker, tanpa fabrikasi.
  - `test_suite.js` TEST 80 — `sendCopilotPrompt()` benar membangun `userContext.aiPaperTrading` dari `window.AI_TRADE_STATE.paperAccount`, dan degradasi aman ke `null` kalau modul AI Trading belum termuat.
  - Semua 4 test terbukti gagal saat masing-masing fix direvert.
- **Live verification (server lokal, `GEMINI_API_KEY` tidak diset → jalur fallback deterministik):**
  - "kasih saran perbaikan trading saya" tanpa data → honest empty state via `cek_kinerja_ai_trading` (bukan lagi nyasar ke branch portofolio).
  - "apa pelajaran dari trading saya" tanpa data → honest empty state (bukan nyasar ke branch simulasi ARA/ARB).
  - "analisa portofolio saya" dan "cek kas saya" → tetap ke `cek_portofolio_user` seperti semula (tidak ada regresi).
  - Payload dengan data AI Paper Trading realistis → jawaban mengutip win rate/PnL/lesson/mistake/improvement asli dengan benar.
- Cache-bust `28-decisiontools.js` → `?v=20260911d`, `41-stockchat-cockpit.js` → `?v=20260911f`. `server.js` tidak perlu cache-bust (server-side only).

`npm test` (103/103 + 16/16 kebijakan + 6/6 provider), `npm run lint` bersih.

**Catatan untuk user:** ini BUKAN machine learning terlatih — ini context engineering (menyuntikkan data real yang sudah ada ke prompt AI). Rencana untuk item #2-4 (saran berbasis aturan, pipeline data untuk ML copilot sungguhan, integrasi XGBoost sebagai tool) akan didokumentasikan terpisah sesuai permintaan.

## 2026-09-11 — Fitur item #2: AI Copilot/StockChat otomatis beri saran perbaikan berbasis Risk Gate (rule-based, bukan ML)

- **Konteks:** lanjutan roadmap "ML untuk AI chat" — item #2 (saran perbaikan berbasis aturan). Sesuai catatan sebelumnya, tool `cek_portofolio_user`/`cek_saldo_rdn` yang sudah ada punya ambang batas kategorisasi umum sendiri (25% konsentrasi, <5%/>30% kas) — TIDAK diubah (keputusan kebijakan tersendiri, di luar cakupan). Item #2 menambahkan pemeriksaan BARU yang eksplisit terhadap Risk Gate resmi yang benar-benar disetujui (§7: posisi tunggal maks 15% AUM, kas minimal 20% AUM), berdampingan dengan kategorisasi lama, bukan menggantikannya.
- **Fitur:**
  - `server.js` — `PORTFOLIO_RISK_POLICY` (15%/20%, harus sinkron dengan `RISK_POLICY` di `38-ai-autonomous-trading.js`) + `computePortfolioRiskGateFindings()`: mengecek SETIAP posisi (bukan cuma yang terbesar) terhadap batas 15%, dan kas terhadap batas 20%. Hasilnya ditambahkan sebagai field `riskGateFindings` di `cek_portofolio_user`. `SYSTEM_INSTRUCTION_MONEYWATCH_AI` diupdate (aturan #9) — Gemini WAJIB menyampaikan setiap finding secara proaktif, bukan cuma kalau diminta eksplisit.
  - Fallback deterministik (server.js) dan fallback client-side (`41-stockchat-cockpit.js`) — keduanya menyisipkan bagian "Saran Perbaikan (Risk Gate §7)" otomatis di SETIAP analisa portofolio (bukan gated di belakang keyword terpisah), menggantikan kalimat generik lama yang tidak pernah benar-benar dicek ("pastikan tidak ada saham yang melebihi 15%...").
- **Prevention added:**
  - `test_suite.js` TEST 81 — `computePortfolioRiskGateFindings()` lewat vm sandbox: portofolio compliant → 0 finding, 1 posisi over-limit → 1 finding bernama ticker+15%, BEBERAPA posisi over-limit → SEMUA diflag (bukan cuma terbesar), kas rendah → 1 finding bernama 20%, AUM nol → tidak divide-by-zero.
  - `test_suite.js` TEST 82 — reply portofolio deterministik menyertakan bagian Saran Perbaikan otomatis.
  - `test_suite.js` TEST 83 — cabang portofolio client-side menghitung finding riil (bukan lagi kalimat generik).
  - `test_financial_policy.js` — 2 drift-detector test baru: `PORTFOLIO_RISK_POLICY` (server.js) dan konstanta client-side (`41-stockchat-cockpit.js`) harus sinkron dengan `RISK_POLICY` (38-...) yang sudah diverifikasi sinkron dengan `FINANCIAL_POLICY.md` §7 — total jadi 18/18 test kebijakan.
  - Semua 5 test (81-83 + 2 drift-detector) terbukti gagal saat masing-masing bagian direvert.
- **Catatan teknis test:** ditemukan bug di test itu sendiri (bukan kode produksi) saat menulis TEST 81 — `assert.deepStrictEqual` gagal untuk array yang dibuat DI DALAM vm sandbox dibanding array literal biasa (beda realm/prototype Array meski isinya identik struktural). Diperbaiki dengan `.length` check / `Array.from()` sebelum deepStrictEqual, dicatat sebagai pola untuk test vm-sandbox berikutnya yang membandingkan array hasil komputasi (bukan array yang di-passthrough dari luar sandbox).
- **Live verification (server lokal):** portofolio dengan 1 posisi 91.94% AUM + kas 8.1% → dua finding tampil benar; portofolio kas cukup tapi 1 posisi pas di atas 15% → tetap diflag; portofolio benar-benar compliant → pesan "✅ Tidak ada pelanggaran" tampil; item #1 (kinerja AI) dipastikan tidak keserempet perubahan ini.
- Cache-bust `41-stockchat-cockpit.js` → `?v=20260911g`. `server.js` tidak perlu cache-bust.

`npm test` (106/106 + 18/18 kebijakan + 6/6 provider), `npm run lint` bersih.

## 2026-09-11 — Fitur item #3: AI Copilot/StockChat bisa mengutip prediksi model XGBoost (dengan disclaimer wajib)

- **Konteks:** lanjutan roadmap AI Copilot — item #3 (integrasikan XGBoost sebagai tool tambahan). Model ONNX yang ada sebelumnya HANYA pernah dipakai untuk batch backtest historis (`proceedWithData()` di Backtester, `11-quant.js`) — tidak pernah ada jalur "prediksi 1 bar terbaru untuk 1 ticker", jadi tidak ada apa pun untuk AI Copilot kutip.
- **Fitur:**
  - `public/js/11-quant.js` — `xgbPredictLatest(ticker, callback)`: reuse pipeline ONNX yang SAMA persis dipakai Backtester (`xgbEnsureLoaded()`, `xgbComputeFeatures()`, `xgbPredictBatch()`) tapi untuk satu bar TERBARU satu ticker, bukan batch historis — supaya angka yang dikutip AI selalu identik dengan yang tampil di Backtester. Menyertakan `hasProvenSignal` (dihitung dari lift precision/base_rate ≥ 1.15x — SELALU false untuk model saat ini, lift 0.98x) dan `isSimulatedData` (kalau histori OHLCV input-nya sendiri simulasi, bukan data pasar riil).
  - `server.js` — tool baru `cek_prediksi_xgboost` + case di `executeAgentTool()` (membaca `userContext.xgboostPrediction`, sama seperti pola `aiPaperTrading`/`cek_kinerja_ai_trading` — data ini murni client-side, server tidak punya endpoint ML). `SYSTEM_INSTRUCTION_MONEYWATCH_AI` diupdate (aturan #10) — Gemini WAJIB baca `hasProvenSignal` dan menyampaikan disclaimer "model ini eksperimen edukasi, TIDAK terbukti prediktif" SEBELUM menyebut angka apa pun, kondisi saat ini SELALU begitu.
  - `public/js/28-decisiontools.js` — `sendCopilotPrompt()` mendeteksi ticker riil + kata kunci prediksi (sinyal/prediksi/xgboost/rekomendasi/dst), menjalankan `xgbPredictLatest()` DI BROWSER sebelum mengirim ke server (dengan timeout 8 detik via `Promise.race`, gagal diam-diam ke null — tidak boleh menahan SETIAP pesan chat), hasilnya dikirim sebagai `userContext.xgboostPrediction`. Hanya jalan kalau benar-benar relevan (deteksi keyword) supaya tidak membebani setiap pesan Copilot dengan inferensi ONNX + fetch data yang mahal.
  - Fallback deterministik (server.js) & fallback client-side (`41-stockchat-cockpit.js`) — cabang baru yang sama, dicek LEBIH AWAL di rantai if/else (pola yang sama seperti fix ordering item #1/#2 kemarin, mencegah kolisi short-keyword).
- **Prevention added:**
  - `test_suite.js` TEST 84 — `executeAgentTool('cek_prediksi_xgboost')` lewat vm sandbox: no-data → `hasData:false` tanpa fabrikasi, `hasProvenSignal:false` (kondisi nyata model saat ini) → disclaimer "TIDAK terbukti" WAJIB muncul, `hasProvenSignal:true` (hipotetis) → disclaimer BEDA (membuktikan disclaimer benar-benar bercabang pada field ini, bukan hardcode satu pesan).
  - `test_suite.js` TEST 85 — branch prediksi di fallback deterministik diposisikan SEBELUM branch short-keyword (porto/kas, simulasi/ara/arb) — mencegah kolisi seperti bug "kasih"/"saran" kemarin.
  - `test_suite.js` TEST 86 — cabang client-side membaca `userContext.xgboostPrediction` apa adanya, tidak fabrikasi, tidak terjebak gerbang validasi ticker.
  - `test_suite.js` TEST 87 — `sendCopilotPrompt()` HANYA memanggil `xgbPredictLatest()` kalau pesan benar-benar berniat tanya prediksi DAN menyebut ticker riil (bukan di setiap pesan — mahal), dan struktur timeout/catch-nya diverifikasi (tanpa benar-benar menunggu 8 detik nyata di test suite).
  - Semua 4 test terbukti gagal saat masing-masing bagian direvert.
- **Live verification (server lokal, data realistis dari `models/xgb_signal_meta.json` asli — buy_threshold 44.7%, precision 36.5% vs base rate 37.1%, lift 0.98x):** prediksi tanpa data browser → honest empty state; prediksi dengan data realistis → disclaimer "TIDAK terbukti" tampil SEBELUM angka, precision vs base rate dikutip akurat; item #1 (kinerja AI) dan item #2 (portofolio/Risk Gate) dipastikan tidak keserempet.
- Cache-bust `11-quant.js` → `?v=20260911c`, `28-decisiontools.js` → `?v=20260911e`, `41-stockchat-cockpit.js` → `?v=20260911h`.

`npm test` (110/110 + 18/18 kebijakan + 6/6 provider), `npm run lint` bersih.

**Catatan jujur untuk user:** fitur ini secara teknis berfungsi dan sudah live, tapi NILAINYA TERBATAS — sesuai yang disampaikan saat merencanakan item #3, model XGBoost yang ada belum terbukti punya sinyal prediktif (lift 0.98x, di bawah ambang 1.15x). Setiap kali AI Copilot mengutip prediksi ini, disclaimer "eksperimen edukasi, tidak terbukti" akan SELALU muncul (bukan sesekali) sampai model ini benar-benar diperbaiki di masa depan (butuh iterasi ML baru, bukan sekadar wiring seperti ini).

## 2026-09-11 — Item #4 groundwork: struktur logging AI Paper Trading disiapkan untuk training ML masa depan (PERSIAPAN, BUKAN MODEL)

- **Konteks:** user setuju berhenti dulu di roadmap AI Copilot (item #1-3 sudah live), menunggu data AI Paper Trading cukup untuk item #4 (pipeline ML copilot sungguhan). Sambil menunggu, user minta struktur logging dirapikan supaya training nanti tidak didesain ulang dari nol.
- **Gap yang ditemukan:** `closedTrades` (`AI_TRADE_STATE.paperAccount`) mencatat harga/tanggal/PnL/narasi lesson, TAPI TIDAK mencatat breakdown skor teknikal/fundamental yang sebenarnya mendasari keputusan BUY saat itu. Merekonstruksi fitur itu belakangan (setelah banyak trade terkumpul) rapuh — indikator dihitung dari histori harga yang bisa sudah berubah/dievict dari cache (lihat insiden `mw_rd_*` eviction hari ini), hasilnya bisa beda dari yang benar-benar dilihat mesin saat itu.
- **Perbaikan (murni persiapan data, TIDAK ada model yang dilatih):**
  - `public/js/38-ai-autonomous-trading.js` — `aiOpenPositionFromSignal()` sekarang menyimpan `featureSnapshot` (breakdown `computeStockSignal()`: compositeScore/technicalScore/fundamentalScore/trend/rsi14/volRatio/probability/evPerShare/rrRatio/regimeAtEntry) pada SAAT posisi dibuka — bukan direkonstruksi setelahnya. Menandai `sourceEngine: 'scanner'` vs `'confluence_hypothesis'` dan `hasFullFeatureSet` tergantung apakah posisi dibuka dari signal Scanner asli atau dari Hypothesis Lab untuk ticker yang belum pernah di-scan (field breakdown kosong pada kasus kedua — jujur ditandai, bukan dipaksa terisi).
  - `aiClosePosition()` membawa `featureSnapshot` itu utuh ke `closedTrades` saat posisi ditutup — jadi setiap trade tertutup punya pasangan (X=fitur saat entry, y=hasil riil WIN/LOSS) yang lengkap dalam satu record.
  - `aiBuildTrainingDataset()`/`aiExportTrainingDataset()` (baru) — merangkai `closedTrades` yang punya `featureSnapshot` menjadi dataset JSON siap-training (label 1=WIN/0=LOSS). Trade LAMA dari sebelum fitur ini ada (`featureSnapshot: null`) DILEWATI, bukan diisi nol yang menyesatkan. Tombol "⬇️ Export Dataset ML (JSON)" ditambahkan di halaman AI Trading → Journal, sebelah export CSV Audit Trail yang sudah ada.
  - `ml/PAPER_TRADING_DATASET.md` (baru) — dokumentasi skema lengkap, alasan kenapa snapshot-saat-entry lebih baik dari rekonstruksi belakangan, dan opsi arsitektur ML untuk item #4 di masa depan (BELUM diputuskan, BELUM dikerjakan).
- **Penting — ini BUKAN feature space yang sama dengan model XGBoost** (`XGB_FEATURES`, `11-quant.js`/`ml/train_xgb_signal.py`, 10 fitur teknikal candle-level). `featureSnapshot` adalah breakdown skor komposit `computeStockSignal()` (lib/idx-data-engine.js) — sistem sinyal native aplikasi ini sendiri (65% teknikal + 35% fundamental, bobot tetap yang belum bisa menyesuaikan diri dari hasil trade riil — persis gap yang komentar kode sudah akui). Kedua feature space ini TIDAK boleh dicampur.
- **Prevention added:**
  - `test_suite.js` TEST 88 — konstruksi `featureSnapshot`: signal Scanner penuh → `sourceEngine:'scanner'`, semua field diteruskan benar; signal Hypothesis-only (tanpa compositeScore) → `sourceEngine:'confluence_hypothesis'`, field kosong jadi `null` (bukan `undefined`, supaya tidak hilang diam-diam saat `JSON.stringify()`); `regimeAtEntry` null (gagal fetch) tidak melempar error.
  - `test_suite.js` TEST 89 — `closedTrades` benar-benar membawa `pos.featureSnapshot` (bukan cuma ditangkap di entry lalu dibuang di exit).
  - `test_suite.js` TEST 90 — `aiBuildTrainingDataset()` lewat vm sandbox: label WIN→1/LOSS→0 benar, trade lama tanpa `featureSnapshot` DILEWATI (bukan di-nol-kan) dengan hitungan `skippedNoFeatureSnapshot` akurat, `features` diteruskan utuh dari `featureSnapshot`.
  - Semua 3 test terbukti gagal saat masing-masing bagian direvert.
- Cache-bust `38-ai-autonomous-trading.js` → `?v=20260911c`.

`npm test` (113/113 + 18/18 kebijakan + 6/6 provider), `npm run lint` bersih.

**Catatan untuk user:** ini murni persiapan struktur data — belum ada model ML yang dilatih, belum ada estimasi pasti kapan datanya cukup (realistis lebih lama dari perkiraan awal, karena ini trade-level sample bukan candle-level seperti XGBoost — 1 sampel per posisi yang benar-benar ditutup). Detail lengkap dan opsi arsitektur masa depan ada di `ml/PAPER_TRADING_DATASET.md`.

## 2026-09-11 — Bug ditemukan via live testing user: featureSnapshot (item #4) tidak terisi untuk sinyal Scanner riil

- **Reported by:** user, hasil validasi langsung yang saya minta setelah PR #141 (item #4 groundwork) live — buka 5 posisi baru dari Scanner, cek `AI_TRADE_STATE.paperAccount.openPositions[i].featureSnapshot` via console browser. Field-field kunci (technicalScore, rsi14, trend, evPerShare) semuanya `null`.
- **Root cause:** `_adaptRealSignal()` (`public/js/38-ai-autonomous-trading.js`) — fungsi yang mengubah respons server `/api/idx/ai-scan` mentah menjadi bentuk yang disimpan di `AI_UNIVERSE` — SEBELUMNYA hanya menyimpan field turunan/tampilan (`trendScore`/`momentumScore`/`moneyFlowScore`, ketiganya duplikat `technicalScore` dengan nama lain untuk UI; `ev`/`rrRatio` sebagai STRING terformat `'+Rp 120 / lembar'`/`'1 : 1.9'`), dan diam-diam MEMBUANG nilai mentah `technicalScore`, `rsi14`, `trend`, `evPerShare` (angka), `rrRatio` (angka) sama sekali. `aiOpenPositionFromSignal()` (dari PR #141) hanya pernah melihat objek yang SUDAH diadaptasi ini dari `AI_UNIVERSE` — tidak pernah melihat respons server mentah — jadi tidak ada cara bagi kode itu memulihkan nilai yang sudah hilang di hulu. Test vm-sandbox (TEST 88-90) yang saya tulis sebelumnya lolos karena mock `sig` yang dipakai adalah asumsi bentuk `computeStockSignal()` MENTAH, bukan bentuk `AI_UNIVERSE` yang SUDAH diadaptasi — celah yang cuma bisa ketahuan lewat live testing user, persis seperti yang saya sampaikan sebelumnya (tidak bisa live-verify fitur ini dari sandbox karena butuh live market data).
- **Fix:** `_adaptRealSignal()` sekarang JUGA menyimpan nilai mentah (`technicalScore`, `rsi14`, `trend`, `evPerShareRaw`, `rrRatioNum`) berdampingan dengan field turunan/tampilan yang sudah ada (tidak diubah — renderer lain seperti tabel Scanner/Opportunity card tetap memakai `ev`/`rrRatio` string apa adanya). `featureSnapshot` di `aiOpenPositionFromSignal()` diupdate membaca `sig.evPerShareRaw`/`sig.rrRatioNum` (bukan `sig.evPerShare`/`sig.rrRatio` yang string).
- **Yang BELUM terjawab:** kenapa `featureSnapshot` di screenshot user sama sekali `undefined` (bukan cuma field di dalamnya `null`) — dugaan kuat: tab browser user masih menjalankan JS versi lama (cache) sebelum deploy PR #141 sungguh-sungguh terpropagasi/ter-load ulang. User diminta hard-refresh (Ctrl+Shift+R) lalu buka posisi baru untuk validasi ulang setelah fix field-mapping ini live.
- **Prevention added:**
  - `test_suite.js` TEST 91 (baru) — `_adaptRealSignal()` lewat vm sandbox dengan payload sinyal server REALISTIS (semua field yang benar-benar dikembalikan `computeStockSignal()`), membuktikan field mentah baru (technicalScore/rsi14/trend/evPerShareRaw/rrRatioNum) benar-benar terisi, DAN field lama (ev/rrRatio string, trendScore/momentumScore/moneyFlowScore) tidak berubah (fix aditif, bukan breaking rename). Terbukti gagal saat direvert.
  - TEST 88 (existing) diupdate — mock `sig` sekarang pakai `evPerShareRaw`/`rrRatioNum` (bentuk yang benar-benar ada di `AI_UNIVERSE`), bukan `evPerShare`/`rrRatio` (asumsi lama yang salah), plus assertion baru untuk technicalScore/trend/evPerShare/rrRatio.
- Cache-bust `38-ai-autonomous-trading.js` → `?v=20260911d`.

`npm test` (114/114 + 18/18 kebijakan + 6/6 provider), `npm run lint` bersih.

**Pelajaran proses:** ini bukti nyata kenapa live-verification lewat user penting — test vm-sandbox yang saya tulis untuk PR #141 secara teknis "lolos" tapi mock datanya salah bentuk (memakai shape `computeStockSignal()` mentah, bukan shape `AI_UNIVERSE` yang sudah diadaptasi `_adaptRealSignal()`), sehingga tidak menangkap bug ini. Saya tidak bisa mereproduksi ini dari sandbox (butuh live market data untuk memicu Scanner), jadi validasi user secara langsung adalah satu-satunya cara bug ini ketahuan sebelum menumpuk data yang rusak.

**Update — tervalidasi user (2026-09-11, malam hari yang sama):** posisi baru (BMRI) dibuka setelah fix live, `featureSnapshot` terisi penuh dengan angka nyata (compositeScore:85, technicalScore:90, fundamentalScore:75, trend:"UPTREND", rsi14:64.3, volRatio:1.02, probability:69, evPerShare:82, rrRatio:1.66, regimeAtEntry:"BULL_TREND", sourceEngine:"scanner", hasFullFeatureSet:true). Misteri "undefined total" di percobaan sebelumnya TERJAWAB — bukan cache browser, bukan bug lain: user hanya membaca ulang posisi LAMA (dibuka sebelum fix) yang memang tidak dan tidak akan pernah punya featureSnapshot (sesuai desain — data lama dilewati, bukan diisi ulang retroaktif), bukan posisi baru. Setelah benar-benar membuka posisi baru pasca-fix, pipeline tervalidasi bekerja sempurna. Item #4 groundwork resmi selesai & terverifikasi live.

## 2026-09-11 — MW-P0-001: wire test_security_regressions.js ke npm test & CI + perbaiki celah _authHeaders() yang tersisa

- **Konteks:** user minta `test_security_regressions.js` diwire ke `npm test` dan CI. File ini sebelumnya sengaja TIDAK diwire — dulunya berupa "known-vulnerability tracker" (3 test yang memang DIRANCANG gagal, mendokumentasikan MW-P0-001 yang saat itu belum diperbaiki) dan CI (`.github/workflows/syntax-check.yml`) selama ini cuma menjalankan `node --check` per file (cek syntax saja) — tidak pernah menjalankan test suite (`npm test`, 114+18+6 assertion) secara otomatis sama sekali, murni disiplin manual selama sesi ini.
- **Keputusan user:** perbaiki dulu celahnya baru wire (supaya CI tidak permanen merah), dan untuk keputusan produksi `AUTH_ENFORCE_STAGE2` — saya HANYA memperbaiki celah client-side, user sendiri yang akan menyalakan Stage 2 setelah meninjau log telemetry `[AUTH TELEMETRY][MW-P0-001]` di produksi. Saya TIDAK mengubah/menyalakan `AUTH_ENFORCE_STAGE2` di commit ini.
- **Audit ditemukan (bug produksi nyata, bukan laporan user):** dari 6 titik panggilan `fetch('/api/user-data/*')` di `public/js/02-storage.js`, HANYA fallback `/load` (dipanggil saat load dari Supabase gagal, ~baris 1518) yang TIDAK menyertakan `{ headers: _authHeaders() }` — satu-satunya dari enam. Efeknya: Stage 1 mencatat ini sebagai "tidak ada token" (dikira tamu/demo padahal user asli), dan begitu Stage 2 dinyalakan nanti, path fallback ini akan mem-401 setiap user asli yang lewat situ. Diperbaiki dengan menambahkan `{ headers: _authHeaders() }`.
- **`test_security_regressions.js` ditulis ulang** dari "known-vulnerability tracker" (3 test yang memang didesain gagal) menjadi regression guard sungguhan (5 test, semua mengasersi perilaku BENAR yang sudah ada, bukan yang belum ada):
  - `extractRouteHandler()` — bug lama: mencocokkan `});` flush-left PERTAMA, yang untuk `/api/user-data/load` adalah penutup blok `res.status(400).json({...})` early-return di TENGAH handler, bukan akhir handler sungguhan — diam-diam memotong teks yang diekstrak sebelum sampai ke panggilan `logAuthMismatchTelemetry()`/`enforceIdentityStage2()` yang sebenarnya ada. Diganti dengan penghitungan depth kurung dari `(` registrasi route sampai `)` penutup yang seimbang.
  - Regex verifikasi diupdate agar mengenali nama fungsi asli (`enforceIdentityStage2`, `logAuthMismatchTelemetry`) — sebelumnya cuma cek kata generik (`verify`/`authenticate`/dst) yang tidak pernah cocok dengan implementasi nyata.
  - Ditemukan lagi bug kedua saat mengembangkan fix di atas: komentar TIDAK TERKAIT (`// Verify tenant ownership matches requested UID`, soal file mana yang dibaca, bukan soal identitas pemanggil) ikut match regex `/verify/i` dan membuat test tetap PASS palsu walau panggilan verifikasi sungguhan sengaja dihapus untuk diuji. Diperbaiki dengan `stripLineComments()` sebelum regex-match (pola yang sama dipakai TEST 65 di `test_suite.js` untuk masalah serupa).
  - 2 test baru ditambahkan: (a) `enforceIdentityStage2()` masih ada DAN masih digerbang `process.env.AUTH_ENFORCE_STAGE2` (mencegah seseorang menghardcode `true` atau menghapus gerbangnya di masa depan tanpa sadar mengubah keputusan rollout milik operator); (b) setiap panggilan `fetch('/api/user-data/*')` di `02-storage.js` menyertakan `_authHeaders()` — inilah yang menangkap celah `/load` fallback di atas.
  - Kedua bug ekstraksi/regex dibuktikan lewat revert sengaja (`server.js`, panggilan verifikasi `/load` dihapus manual) → test correctly FAIL sebelum fix, PASS semu sebelum fix comment-stripping ditambahkan, FAIL yang benar setelah fix. Fix `_authHeaders()` juga dibuktikan lewat revert sengaja (satu titik panggilan direvert ke bentuk lama) → test correctly FAIL, lalu direstore → PASS.
- **Wiring:**
  - `package.json` — `"test"` script sekarang menyertakan `node test_security_regressions.js` di rantai (`test_suite.js && test_financial_policy.js && test_provider_functions.js && test_security_regressions.js`).
  - `.github/workflows/syntax-check.yml` — job baru `test` (berjalan paralel dengan job `syntax-check` yang sudah ada) menjalankan `npm test` di setiap push & PR ke `main`. Semua file test hanya memakai Node builtin (`assert`/`fs`/`vm`/`path`/`url`) dan membaca source secara statis/lewat `vm`, tidak boot `server.js` sungguhan — jadi tidak perlu `npm install` atau credentials Supabase/Redis/GenAI untuk jalan di CI.
- Cache-bust `02-storage.js` → `?v=20260911b`.

`npm test` (114/114 + 18/18 kebijakan + 6/6 provider + 5/5 security regression), `npm run lint` bersih.

**Catatan jujur untuk user:** ini menutup celah client-side yang tersisa dan mencegah REGRESI ke depan pada wiring verifikasi identitas — bukan pernyataan bahwa MW-P0-001 "sudah selesai total". Stage 2 (`AUTH_ENFORCE_STAGE2`) tetap OFF di commit ini; kapan menyalakannya tetap sepenuhnya keputusan Anda setelah meninjau log telemetry Stage 1 di produksi.

**Update (commit sama hari, sebelum merge)** — job CI `test` yang baru ditambahkan di atas GAGAL pada run pertama di PR #145: `ERR_MODULE_NOT_FOUND '@upstash/redis'` saat `test_financial_policy.js` (lewat `vm`) memuat `lib/idx-data-engine.js` yang mengimpor `lib/invezgo-client.js`. Klaim di komentar/INCIDENT_LOG sebelumnya — "semua file test hanya pakai Node builtin, tidak perlu `npm install` di CI" — TERBUKTI SALAH: benar untuk import langsung di ATAS setiap file test, tapi tidak untuk modul yang dimuat transitif lewat `vm`/import saat test berjalan. Diperbaiki dengan menambahkan langkah `npm ci` sebelum `npm test` di job `test` (`.github/workflows/syntax-check.yml`). Ditemukan dari log job CI sungguhan (114/114 test_suite.js sempat lolos duluan sebelum proses crash saat pindah ke test_financial_policy.js), bukan simulasi lokal — lokal selalu punya `node_modules` ter-install jadi tidak pernah mereproduksi ini.

## 2026-09-11 — Monitoring kuota harian: GET /api/ai/gemini-status (baru) + widget UI "Kuota API" untuk Invezgo & Gemini

- **Konteks:** user bertanya apakah perlu dibuat monitoring kuota harian untuk API Gemini dan Invezgo supaya bisa aware batasannya.
- **Temuan audit (sebelum ada perubahan apa pun):**
  - **Invezgo**: kuota manager LENGKAP sudah ada di `lib/invezgo-client.js` (budget 30.000 req/bulan via Redis, alert metric otomatis di 80%/90%, cache hit ratio, error rate) DAN endpoint `GET /api/idx/invezgo-status` sudah mengeksposnya — tapi TIDAK ADA satu pun tempat di UI yang menampilkannya. Datanya sudah lengkap, cuma tidak pernah dilihat kecuali curl manual.
  - **Gemini**: TIDAK ADA sama sekali. `callGeminiWithRetryAndFallback()` (server.js) cuma retry reaktif saat kena 429/RESOURCE_EXHAUSTED (fallback ke 5 model: gemini-3.5-flash → 3.7 → 3.6 → flash-latest → 3.1-flash-lite), tanpa counter proaktif, tanpa visibilitas pemakaian harian.
  - User mengonfirmasi API key Gemini yang dipakai masih **free tier** (limit resmi RPD/RPM dari Google, bukan billing pay-as-you-go) — jadi counter berarti langsung sebagai "sisa kuota hari ini", bukan estimasi biaya.
- **Keputusan desain penting: TIDAK memblokir panggilan apa pun.** Angka limit RPD resmi per model tidak pernah bisa saya verifikasi dari sumber primer Google (ai.google.dev diblokir egress proxy sesi ini, hanya blog agregator pihak ketiga yang bisa diakses — datanya tidak saya pakai sebagai default karena berisiko keliru dan memblokir panggilan yang sebenarnya masih diizinkan Google). Google sendiri sudah menegakkan limit sungguhan (429/RESOURCE_EXHAUSTED sudah ditangani reaktif). Jadi counter Gemini murni observability — mencatat pemakaian riil, menghitung persentase HANYA kalau operator (Anda) mengisi limit asli lewat env var `GEMINI_RPD_LIMITS` setelah cek AI Studio sendiri (pola yang sama seperti `AUTH_ENFORCE_STAGE2`: keputusan operator, bukan tebakan kode).
- **Perubahan:**
  - `lib/gemini-quota.js` (baru) — mirror pola Redis/in-memory-fallback `invezgo-client.js`: `recordGeminiAttempt(model)` (counter RPD per-model + RPM per-menit, fire-and-forget, tidak pernah menghambat panggilan asli), `recordGeminiOutcome(outcome)` (agregat success/rate_limited/error harian), `getGeminiQuotaStatus()` (snapshot lengkap). Daftar 5 model fallback dipindah ke sini sebagai `GEMINI_FALLBACK_MODELS` — satu sumber kebenaran dipakai baik oleh jalur panggilan asli (`server.js`) maupun endpoint status, supaya tidak bisa drift.
  - `server.js` — `callGeminiWithRetryAndFallback()` memanggil `recordGeminiAttempt()`/`recordGeminiOutcome()` di titik yang sama persis dengan try/catch yang sudah ada (tidak menambah latency ke jalur kritis). Endpoint baru `GET /api/ai/gemini-status`.
  - `public/js/35-settings.js` — panel baru "Kuota API" (GRID 4) di halaman Settings: dua card (Invezgo, Gemini) yang fetch kedua endpoint setelah render dan menampilkan progress bar, badge alert 80%/90%, serta catatan jujur kalau `GEMINI_RPD_LIMITS` belum diisi.
  - `.env.example` — dokumentasi `GEMINI_RPD_LIMITS` (opsional, JSON per-model, dengan instruksi eksplisit "cek angka riil di AI Studio, jangan menebak").
- **Prevention added (`test_gemini_quota.js`, baru, 9 test):**
  - Kontrak `getGeminiQuotaStatus()`: default (tanpa `GEMINI_RPD_LIMITS`) → `dailyLimit`/`usagePct` null (bukan 0 atau angka tebakan), alert80/90 false.
  - `recordGeminiAttempt()` menambah counter per-model yang benar, tidak menyentuh model lain.
  - Dengan `GEMINI_RPD_LIMITS` diisi → `usagePct`/`alert80`/`alert90` terhitung benar melewati ambang 80%/90%.
  - `recordGeminiOutcome()` menambah counter success/rate_limited/error harian secara independen.
  - REGRESSION GUARD: `server.js` mengimpor `GEMINI_FALLBACK_MODELS` dari `lib/gemini-quota.js` (bukan array hardcode kedua yang bisa drift) — dibuktikan gagal saat direvert ke array hardcode.
  - REGRESSION GUARD: `server.js` memanggil `recordGeminiAttempt()`/`recordGeminiOutcome()` pada jalur panggilan asli.
  - REGRESSION GUARD: `35-settings.js` benar-benar fetch kedua endpoint status dan render ke elemen target (`quota-invezgo-box`/`quota-gemini-box`).
  - REGRESSION GUARD: `renderSettingsPage()` memanggil `loadApiQuotaWidgets()` setelah set HTML — dibuktikan gagal saat direvert (box macet di "Memuat data kuota…").
  - Semua regression guard dibuktikan gagal saat masing-masing bagian direvert manual, lalu direstore.
- **Live verification:** server lokal dijalankan, `GET /api/idx/invezgo-status` dan `GET /api/ai/gemini-status` dicurl langsung — keduanya mengembalikan bentuk JSON yang benar (Invezgo: used:0/30000; Gemini: 5 entri model, semua `dailyLimit:null` karena `GEMINI_RPD_LIMITS` belum diisi — sesuai desain).
- Cache-bust `35-settings.js` → `?v=20260911a`.

`npm test` (114+18+6+5+9), `npm run lint` bersih.

**Catatan jujur untuk user:** panel Gemini akan menampilkan jumlah pemakaian riil per model mulai sekarang, tapi TIDAK menampilkan persentase/alert sampai Anda mengisi `GEMINI_RPD_LIMITS` di environment variable server (Vercel) dengan angka RPD asli dari Google AI Studio — saya sengaja tidak menebak angka itu. Baik panel Invezgo maupun Gemini murni observability, tidak ada yang memblokir panggilan API — kalau kuota habis, perilaku existing (Invezgo: fallback simulasi berlabel jujur; Gemini: fallback model berikutnya lalu error) tetap sama seperti sebelumnya.

## 2026-09-11 — Rombak total persistence KSEI 5%+ Shareholders & Free Float: Google Sheets/Firebase → Upload Excel/Supabase

- **Konteks:** user bertanya soal tab "STRUKTUR KEPEMILIKAN & FREE FLOAT (KSEI)" — sumber data spreadsheet yang harus diolah dulu, dan risiko data hilang kalau spreadsheet-nya hilang.
- **Audit ditemukan (sebelum ada perubahan apa pun) — masalahnya lebih mendesak dari yang dikhawatirkan user:**
  - Parser CSV lama (`parseKseiCsv()`, server.js) membaca kolom berdasarkan **posisi tetap** (`r[0]`...`r[17]`, mulai baris ke-4), dengan tanggal laporan diambil dari regex satu sel spesifik yang **fallback diam-diam ke hardcode `"26 Aug 2026"`** kalau gagal cocok — kalau struktur sheet berubah, data salah tanpa peringatan.
  - **Lebih penting**: `POST /api/ksei/sync` menulis hasil parse ke `data/ksei-shareholders.json` lewat `fs.writeFileSync()`. Di Vercel serverless, filesystem itu **read-only** di production (kecuali `/tmp`) — persis kelas kegagalan yang SUDAH didokumentasikan & diperbaiki untuk `/api/user-data/save` sebelumnya (lihat komentar di handler itu: "this handler's on-disk write ALWAYS fails on Vercel... EROFS"). `/api/ksei/sync` belum pernah dapat perbaikan yang sama — tombol "Update Data" di modal KSEI kemungkinan besar **sudah gagal di production** setiap kali dicoba, bukan skenario hipotetis.
  - Data KSEI production selama ini murni snapshot JSON yang di-commit ke git terakhir kali seseorang sync lokal (per 26 Agustus 2026) — aman dari "sheet hilang" (sudah tersalin), tapi tidak bisa diperbarui lewat UI sama sekali.
  - Ada JUGA salinan ketiga di Firebase Firestore (`kseiSaveSnapshotToFirestore`/`kseiLoadFromFirestore`) — redundan, sisa dari sebelum migrasi Supabase, tidak dipakai fitur lain.
- **Keputusan (dikonfirmasi user via beberapa pertanyaan klarifikasi):**
  - Alur manual TIDAK berubah — user tetap download dari web IDX lalu bersihkan manual (gabung sel, hapus baris) sebelum data siap dipakai; itu tetap tugas manusia, bukan sesuatu yang bisa ditebak otomatis.
  - Yang berubah: dibersihkan ke **template Excel kolom-tetap** (bukan Google Sheet ad-hoc), lalu **upload file .xlsx langsung** ke app (bukan app fetch URL Google Sheets).
  - Google Sheets sync + Firebase Firestore **dihapus total**, diganti satu jalur: upload → parse client-side → simpan ke Supabase.
- **Perubahan:**
  - **Tidak ada dependency baru.** Ditemukan app SUDAH punya library SheetJS (`XLSX`, dimuat di `index.html`) dipakai untuk fitur "Kelola Daftar Saham" (Admin Panel, `14-admin.js`'s `idxImportFile()`) — pola baca-Excel-di-browser-dengan-header-nama dipakai ulang persis, bukan dibangun dari nol.
  - **Tidak ada endpoint upload baru, tidak ada base64/multipart.** Ditemukan app SUDAH punya pola tabel Supabase khusus terisolasi untuk data besar/jarang-berubah (`ai_paper_trading`, sengaja terpisah dari `user_data` blob transaksi harian). Dipakai ulang persis untuk KSEI: tabel baru `public.ksei_ownership` (`sql/schema_migration.sql`, RLS select/insert/update-own, sama seperti `ai_paper_trading`).
  - `public/js/34-ksei-shareholders.js` — **ditulis ulang signifikan**:
    - `kseiSaveSnapshotToFirestore()`/`kseiLoadFromFirestore()`/`handleKseiFirestoreError()` **dihapus** (Firestore bukan lagi sumber kebenaran untuk fitur ini).
    - `kseiSyncFromSheets()` **dihapus**, diganti `kseiParseWorkbook(rows)` (fungsi murni, tervalidasi ketat, HEADER-BASED bukan posisi — kolom wajib dicek nama-nya, baris invalid ditolak dengan pesan bernomor baris, seluruh file ditolak kalau ada satu error — tidak pernah partial-import) + `kseiImportExcelFile()` (baca file via `FileReader`/`XLSX.read`/`sheet_to_json`, panggil `kseiParseWorkbook()`, konfirmasi RESET TOTAL sebelum apply — pola persis `idxImportFile()`).
    - `scheduleKseiCloudSync()`/`flushKseiCloudSync()` — debounced upsert ke `ksei_ownership` (pola persis AI Paper Trading's `scheduleAiCloudSync()`/`flushAiCloudSync()`).
    - `kseiInitData()` — urutan prioritas baru: localStorage cache → Supabase `ksei_ownership` milik user (kalau sudah pernah upload) → snapshot bawaan bundled (`GET /api/ksei/data`, read-only, tidak ada risiko EROFS karena tidak pernah menulis).
    - UI tab Settings dirombak: URL Google Sheets input dihapus, diganti input file `.xlsx` + tombol "Import & RESET TOTAL", badge status "DATA HASIL UPLOAD ANDA" vs "DATA BAWAAN (BELUM ADA UPLOAD)".
  - `server.js` — `POST /api/ksei/sync` dan `parseKseiCsv()` **dihapus total** (satu-satunya sumber EROFS untuk fitur ini). `GET /api/ksei/data`/`/stock/:ticker`/`/summary` **dipertahankan** (read-only, melayani snapshot bawaan sebagai starting point sebelum upload pertama — mirror pola "universe bawaan" Admin Panel).
  - Template resmi (`.xlsx`, 2 sheet: contoh data + petunjuk pengisian) dikirim langsung ke user sebagai starting point nyata, bukan cuma deskripsi di chat.
- **Prevention added (`test_suite.js`, 6 test baru — TEST 92-97):**
  - `kseiParseWorkbook()` mengelompokkan baris per-ticker dengan benar, menghitung free float/lokal/asing, dan MENGGABUNGKAN baris investor yang sama (multi-kustodian) jadi satu entri — bukan duplikat.
  - File dengan kolom wajib hilang → ditolak total, pesan menyebut kolom spesifik.
  - Baris dengan Status/Ticker/Persentase tidak valid → ditolak dengan nomor baris spesifik, tidak pernah di-coerce diam-diam (mis. Persentase non-numerik jadi NaN/0 lalu tetap diimpor).
  - File dengan `Tanggal Laporan` tidak konsisten antar baris → ditolak total.
  - REGRESSION GUARD: `POST /api/ksei/sync` dan `parseKseiCsv()` harus tetap hilang dari `server.js`; `GET /api/ksei/data` harus tetap ada. Dibuktikan gagal saat sengaja dikembalikan (`app.post('/api/ksei/sync', ...)` ditambahkan manual) → test FAIL, lalu direstore → PASS.
  - REGRESSION GUARD: fungsi Google-Sheets/Firestore lama harus tetap hilang dari `34-ksei-shareholders.js`; `kseiImportExcelFile()`/`kseiParseWorkbook()`/`scheduleKseiCloudSync()`/wiring tabel `ksei_ownership` harus tetap ada.
  - Catatan teknis: satu assersi sempat false-fail karena gotcha vm-sandbox cross-realm array (`assert.deepStrictEqual([], sandboxArray)` — sudah didokumentasikan sesi ini sebelumnya) — diperbaiki jadi cek `.length`.
- **Live verification (server lokal):** `GET /api/ksei/data` dan `GET /api/ksei/summary` tetap 200 (snapshot bawaan masih terlayani apa adanya). `POST /api/ksei/sync` sekarang 404 (dikonfirmasi benar-benar terhapus, bukan cuma diam-diam gagal seperti sebelumnya).
- Cache-bust `34-ksei-shareholders.js` → `?v=20260911b`.

`npm test` (119+18+6+5+9), `npm run lint` bersih.

**Catatan penting untuk user:**
1. Migrasi SQL (`sql/schema_migration.sql`, bagian `ksei_ownership`) **harus dijalankan manual** di Supabase SQL Editor sebelum upload pertama bisa tersimpan ke cloud — sama seperti migrasi-migrasi sebelumnya di file ini.
2. Alur manual Anda (download IDX → bersihkan) **tidak berubah** — yang berubah cuma bentuk akhirnya (template kolom-tetap, lihat file yang dikirim) dan cara mengirim ke app (upload file, bukan URL Google Sheets).
3. Sekali upload pertama berhasil, data itu aman di Supabase selamanya — hilangnya file Excel di komputer Anda nanti TIDAK menghapus data yang sudah tersimpan, hanya menghalangi upload BERIKUTNYA.
4. Versi SheetJS (`xlsx@0.18.5`) yang dipakai (sudah ada sejak fitur Admin Panel, bukan ditambahkan task ini) tergolong lama dan punya CVE prototype-pollution yang sudah diperbaiki di rilis lebih baru — di luar cakupan task ini untuk di-upgrade, ditandai untuk keputusan terpisah kalau Anda mau.

## 2026-09-11 — KSEI: upload 2 file mentah IDX (Kepemilikan + Free Float) tanpa perlu buat Master manual, + perbaikan metodologi Free Float

- **Konteks:** setelah PR #147 (upload 1 file template), user menjelaskan proses aslinya: data IDX punya 2 sumber terpisah (Kepemilikan >5% & Free Float), dan selama ini digabung manual jadi satu sheet "Master Data Kepemilikan" sebelum dipakai. User minta ditest dulu metodenya, lalu bertanya apakah 2 file mentah bisa diupload langsung tanpa bikin Master manual.
- **User mengirim file Excel asli** (`Owner Agustus` = raw KSEI Kepemilikan >5%, `FF Agustus` = raw IDX Free Float, `Master Data Kepemilikan` = hasil gabungan manual yang sudah mereka buat sendiri sebagai ground truth) — kesempatan langka untuk validasi metodologi terhadap hasil yang sudah diverifikasi manusia, bukan asumsi.
- **Temuan metodologi penting (dikonfirmasi lewat data asli):**
  - **Free Float BUKAN `100% − kepemilikan mayoritas`** — itu angka resmi terpisah dari IDX (laporan kepatuhan free float). Contoh nyata: satu emiten kepemilikan mayoritas 62,30% tapi Free Float resmi 18,62% (bukan komplemen 37,70%). Formula lama (`100-totalMajorPercent`), yang dipakai baik di parser lama server.js MAUPUN yang sempat saya bangun di PR #147, secara metodologis salah.
  - Baris "Kepemilikan Per Investor" di raw KSEI SUDAH punya total gabungan per investor ("Saham Gabungan Per Investor"/"Persentase Kepemilikan Per Investor (%)") — tidak perlu dijumlah ulang dari baris sub-akun kustodian.
- **Validasi (sebelum ada kode app apa pun) — prototipe Python dulu, lalu port ke JS produksi:**
  - 1.043-1.044 dari 1.046 bucket (ticker × status Lokal/Asing) di "Master Data Kepemilikan" user cocok **PERSIS** (0 selisih) pada Persentase Kepemilikan, Papan Pencatatan, Kapitalisasi Pasar, Jumlah Pemegang Saham, DAN Free Float %.
  - 2 selisih sisa (DIVA-Asing, PALM-Asing) ditelusuri ke bug data mentah KSEI sendiri (baris sub-akun kustodian yang salah label status L/A dibanding baris utama investornya) — dan di Master user pun bucket itu tetap 0% (tidak memengaruhi hasil), jadi bukan masalah metodologi.
  - Ditemukan juga: satu ticker asli ("TRUE") terbaca sebagai boolean JS `true` oleh SheetJS (Excel/spreadsheet mengubah teks "TRUE" jadi boolean) — dipagari dengan `_kseiCellText()`.
- **Perubahan (`public/js/34-ksei-shareholders.js`):**
  - **Fix metodologi** di `kseiParseWorkbook()` (jalur 1-file dari PR #147): tambah kolom opsional "Persentase Free Float (%)" di template — kalau diisi, dipakai apa adanya (`freeFloatIsEstimated:false`); kalau kosong, fallback ke estimasi `100-mayoritas` TAPI ditandai jelas `freeFloatIsEstimated:true` (sebelumnya diam-diam dianggap sama dengan angka resmi).
  - **Jalur baru (utama, direkomendasikan)**: `kseiParseOwnershipRaw()` + `kseiParseFreeFloatRaw()` + `kseiCombineRawSheets()` — parse 2 file MENTAH IDX apa adanya (header multi-baris, kolom periode ganda, baris lanjutan sub-akun kustodian), kolom dicari via nama landmark (bukan posisi tetap) sehingga robust kalau IDX ubah/tambah kolom periode bulan depan. Baris landmark tidak ditemukan → ditolak eksplisit, tidak pernah menebak.
  - `kseiImportRawFiles()` — baca 2 file bersamaan (`Promise.all`), gabungkan HANYA kalau kedua file lolos validasi (satu file rusak tidak boleh diam-diam apply dataset yang Free Float-nya semua estimasi).
  - UI Settings tab: 2 input file + tombol "Gabungkan & Import" sebagai **cara utama** (ditandai ⭐), upload 1-file-template tetap ada sebagai alternatif (sesuai pilihan user "sediakan keduanya").
  - Panel detail KSEI menampilkan badge jelas "FREE FLOAT RESMI IDX" vs "ESTIMASI FREE FLOAT (BUKAN ANGKA RESMI)" tergantung `freeFloatIsEstimated`.
- **Prevention added (`test_suite.js`, 5 test baru):**
  - Kombinasi 2 file sintetis (mirip struktur asli: header 2-baris, baris lanjutan kustodian, 1 ticker match FF, 1 ticker tidak match) — memverifikasi FF resmi dipakai (bukan komplemen), baris lanjutan tidak dobel dihitung, dan ticker boolean `true` tetap terbaca sebagai "TRUE".
  - Reject eksplisit kalau "per tanggal" atau "Kode Efek" tidak ditemukan (Kepemilikan), atau "Kode" tidak ditemukan (Free Float).
  - `kseiParseWorkbook()`: kolom Free Float opsional dipakai kalau ada, fallback estimasi jelas ditandai kalau tidak ada.
  - REGRESSION GUARD diperluas: fungsi/wiring raw-2-file harus tetap ada.
  - Dibuktikan gagal saat FF join sengaja dirusak manual (`ff = null` paksa) → test FAIL, lalu direstore → PASS.
- **Live validation (data asli, JS produksi — bukan cuma prototipe):** 1.044/1.044 bucket yang match dengan "Master Data Kepemilikan" user COCOK SEMPURNA (0 selisih persentase, 0 selisih Papan/Kapitalisasi/JPS/Free Float%) — bahkan lebih baik dari prototipe Python (bug ticker "TRUE" ikut teratasi otomatis lewat `_kseiCellText()`).
- Cache-bust `34-ksei-shareholders.js` → `?v=20260911c`.

`npm test` (123+18+6+5+9), `npm run lint` bersih.

**Catatan jujur untuk user:** jalur 2-file-mentah TERVALIDASI terhadap data Agustus 2026 Anda sendiri — tapi ini bukan jaminan berlaku selamanya kalau IDX suatu saat mengubah format laporannya secara signifikan (nama kolom, bukan cuma urutan — pencarian kolom saya berbasis nama landmark, jadi perubahan URUTAN aman, tapi perubahan NAMA kolom akan membuat file ditolak eksplisit, bukan salah kalkulasi diam-diam). Kalau itu terjadi, upload akan gagal dengan pesan jelas, bukan menghasilkan angka yang salah.

## 2026-09-11 — Tombol shortcut ke KSEI Explorer di halaman Settings

- **Konteks:** user bertanya "Diamana tombil upload datanya" — tombol upload KSEI (dari PR #147/#148) cuma bisa diakses dari halaman detail saham (Fundamental Suite/Bandarmology/TradeWave), berputar-putar (buka saham dulu → cari widget KSEI → klik → baru ketemu tab upload).
- **Perbaikan:** tombol baru "Buka KSEI Explorer & Upload Data" di halaman Settings (`public/js/35-settings.js`, kartu baru di GRID 3) — klik langsung membuka modal KSEI Explorer DAN langsung pindah ke tab upload (`sync-settings`), tanpa perlu buka saham apa pun dulu.
- **Prevention added:** 1 regression guard baru di `test_suite.js` — memastikan tombol memanggil `openKseiModal()` DAN `kseiSwitchTab('sync-settings')` (bukan cuma buka modal ke tab default). Dibuktikan gagal saat panggilan `kseiSwitchTab` sengaja dihapus, lalu direstore.
- **Live verification (Playwright, server lokal):** buka halaman Settings → klik tombol baru → modal KSEI terbuka (`display:flex`) langsung di tab upload (`KSEI_STATE.activeTab === 'sync-settings'`), kedua input file (Kepemilikan + Free Float) terlihat di DOM.
- Cache-bust `35-settings.js` → `?v=20260911b`.

`npm test` (124+18+6+5+9), `npm run lint` bersih.

## 2026-09-11 — Audit menyeluruh KSEI: ditemukan bug duplikasi investor di data mentah, 57 emiten diperbaiki

- **Konteks:** user minta cek apakah ada emiten lain yang datanya "aneh" setelah upload 2-file berhasil untuk AADI/ADRO. Dilakukan pemindaian otomatis ke seluruh 840 emiten (bukan cuma sampel), bukan menunggu laporan manual.
- **Temuan:** raw file KSEI "Kepemilikan >5%" mencantumkan investor YANG SAMA dua kali di bawah nama sedikit berbeda, dengan persentase & jumlah saham IDENTIK — menyebabkan dobel hitung. Contoh paling ekstrem: **ASJT** (Asuransi Jasa Tania) — "DANA PENSIUN PERKEBUNAN" muncul 2x (beda 1 huruf: "PENSIUN" vs "PENSUN") masing-masing 77,39% → totalMajorPercent jadi **154,78%**, mustahil secara matematis.
  - **Dikonfirmasi bug di data sumber, BUKAN di kode saya**: angka 154,78% yang sama PERSIS juga muncul di "Master Data Kepemilikan" milik user sendiri — siapa pun/proses apa pun yang membangun Master sebelumnya juga tidak menangkap duplikasi ini.
  - Pola paling sering: **"PERUSAHAAN PERSEROAN (PERSERO) PT ASABRI" vs "...PT. ASABRI"** (cuma beda satu titik) — muncul di **17 emiten berbeda**. Juga **"BANK PAN INDONESIA TBK, PT" vs nama mereknya sendiri "Panin Bank Tbk, PT"** — di **5 emiten**.
  - Pemindaian penuh menemukan **146 pasangan mencurigakan** (persentase & jumlah saham identik, nama beda) di seluruh dataset. Diklasifikasi jadi 3 kelompok:
    - **57 kasus keyakinan tinggi** (52 identik setelah dibersihkan dari "PT"/"PT."/tanda baca/kapital, + 5 alias "Bank Pan Indonesia"="Panin Bank") — **diperbaiki**.
    - **~70 kasus tidak pasti** (nama benar-benar berbeda, persentase kebetulan sama — pola keluarga/ahli waris memecah kepemilikan rata, mis. 10 nama berbeda di ticker HAIS semuanya 5,60%) — **SENGAJA TIDAK DISENTUH**, sesuai keputusan user: menggabungkan ini berisiko menyembunyikan pemegang saham yang benar-benar berbeda.
    - Sisa kasus (termasuk ASJT sendiri, typo huruf bukan tanda baca) — tetap tidak disentuh, di luar cakupan yang disetujui.
- **Perbaikan (`public/js/34-ksei-shareholders.js`):** `kseiCombineRawSheets()` sekarang mendeteksi & menggabungkan investor duplikat HANYA kalau (a) status+persentase+jumlah saham identik PERSIS, DAN (b) nama sama setelah dinormalisasi (strip PT/PT./Tbk/tanda baca/kapital) ATAU cocok tabel alias kecil yang sudah dikenal (`KSEI_KNOWN_INVESTOR_ALIASES`). Nama yang tergabung dicatat di `mergedAliasNames` untuk transparansi.
- **Prevention added (`test_suite.js`):** 1 test baru dengan data sintetis mirip pola asli (ASABRI, Bank Pan Indonesia/Panin) DAN kasus keluarga (Budi Hartono/Bambang Hartono, persentase sama tapi orang beda) — membuktikan yang pertama digabung, yang kedua TETAP terpisah. Dibuktikan gagal saat logika penggabungan sengaja dirusak, lalu direstore.
- **Live validation (data asli, 840 emiten):**
  - Sebelum fix: 41 emiten dengan total kepemilikan+FF > 105% (indikasi dobel hitung).
  - Sesudah fix: turun jadi 18 (23 emiten teratasi tepat sesuai 52+5 kasus yang disetujui; sisanya seperti ASJT sengaja tidak disentuh karena bukan variasi tanda baca, tapi typo huruf).
  - Dibandingkan ulang ke "Master Data Kepemilikan" user: **57 baris sekarang SENGAJA berbeda** dari Master (persentase app lebih RENDAH & lebih benar — Master masih membawa bug dobel-hitung yang sama), 987 baris lain tetap cocok persis seperti sebelumnya.
- Cache-bust `34-ksei-shareholders.js` → `?v=20260911d`.

`npm test` (125+18+6+5+9), `npm run lint` bersih.

**Catatan jujur untuk user:** ini BUKAN daftar lengkap semua "keanehan" di data KSEI — cuma kategori duplikasi investor yang bisa dideteksi dengan aman secara otomatis. Kategori lain yang saya temukan tapi TIDAK diutak-atik (sesuai instruksi): ~70 pasangan persentase-sama-nama-beda (kemungkinan besar sah, bukan bug), 43 emiten tanpa data Free Float resmi (sudah ditandai "ESTIMASI" di UI), 3 emiten dengan satu investor >99% (kemungkinan besar sah untuk anak perusahaan yang hampir sepenuhnya dimiliki). Kalau Anda mau saya tinjau kategori lain itu satu per satu, tinggal bilang.

## 2026-09-12 — Rework visual halaman Bank & Hutang (logo bank + grafik progres pelunasan)

- **Konteks:** user minta halaman "Rekening Bank & Kas" dan "Hutang & Cicilan" dirapikan secara visual: logo per rekening bank, dan grafik antara jumlah hutang vs terbayar berikut persentasenya.
- **Bank & Dana Darurat (`public/js/20-wealth.js`):** ditambahkan `wBankLogo()`/`wBankLogoHtml()` — badge inisial berwarna brand (BCA, Mandiri, BRI, BNI, CIMB Niaga, Danamon, Permata, BTN, Panin, OCBC NISP, Maybank, HSBC, Citibank, UOB, Jago, SeaBank, Jenius/BTPN, digibank/DBS, blu, Neo Commerce, Allo, Mega, Sinarmas, Commonwealth, Muamalat, BSI), dicocokkan lewat regex nama bank bebas ketik, fallback ke 3 huruf awal nama bank kalau tak dikenali. **Sengaja badge lokal (CSS+teks), bukan gambar logo dari CDN eksternal** — sandbox sesi ini berulang kali gagal konek ke domain eksternal (lihat log health-check per jam), jadi menghindari dependensi gambar eksternal untuk fitur yang harus tampil konsisten di production.
  - Sekalian dibetulkan duplikasi teks "Bank Bank Mandiri" pada kartu rekening — kalau nama yang diketik user sudah diawali kata "Bank", tidak diprefix lagi.
- **Hutang & Kewajiban:** ditambahkan kartu "PROGRES PELUNASAN" — ring persentase + donut chart (Chart.js) "Sudah Terbayar" vs "Sisa Outstanding" + legenda (total terbayar, sisa outstanding, total pinjaman/pokok). Pokok pinjaman diturunkan dari data yang SUDAH ADA (`outstanding saat ini + akumulasi seluruh pembayaran tercatat`) — TANPA field baru, karena `outstanding` di app ini hanya berkurang lewat `wSaveDebtPay()`. Kolom "Progres Bayar" (mini progress bar + %) ditambahkan ke tabel per-hutang. Toolbar halaman ditambah tombol "Laporan Konsolidasi" (konsisten dengan pola di halaman Net Worth/FIRE yang sudah ada tombol serupa, sebelumnya cuma ada di Debt).
- **CSS baru:** `.w-bank-logo` di `public/css/wealth.css`.
- **Live verification (Playwright, server lokal, data sintetis mirip skenario di screenshot user):** 4 rekening (BCA/Mandiri/Jago/SeaBank) → 4 logo benar tampil dengan warna brand masing-masing; 3 hutang (KPR BCA, BPRP PLN, Kartu Kredit Mandiri) dengan riwayat pembayaran → ring "2% terbayar", donut chart ter-render, kolom Progres Bayar per baris tampil (0%/2%/2%), total terbayar Rp16,8jt dari pokok Rp828,6jt cocok dengan jumlah manual `outstanding+payments`.
- Tidak ada perubahan skema data (`WEALTH.bank`/`WEALTH.debt` field-nya sama persis) — 100% aditif di layer render, tidak menyentuh kalkulasi Net Worth/DTI/Debt Ratio yang sudah ada.
- Cache-bust `20-wealth.js` → `?v=20260912a`, `wealth.css` → `?v=20260912a`.

`npm test` (125/125), `npm run lint` bersih.

## 2026-09-12 — Ganti donut Hutang jadi gaya "Alokasi Portofolio", tambah grafik serupa ke Piutang

- **Konteks:** user tunjukkan screenshot donut "Sudah Terbayar" di halaman Hutang — tooltip Chart.js menutupi label di tengah donut karena chart terlalu kecil/berdempetan dengan ring SVG di sampingnya (dari PR #151). Diminta disamakan gayanya dengan donut "Alokasi Portofolio Real-Time" yang sudah ada (halaman Portfolio, `public/js/04-render.js`), dan diterapkan juga ke halaman Piutang yang belum disentuh.
- **Perbaikan (`public/js/20-wealth.js`):**
  - Ring SVG persentase di kartu "PROGRES PELUNASAN" dihapus — diganti donut polos (cutout 65%, tanpa border, `hoverOffset:6`) berukuran 200×200px berdampingan dengan daftar legenda (ikon + swatch warna + label + persentase + nominal per baris), meniru struktur `portoDonut`/`porto-donut-legend` persis.
  - Ditambah helper bersama `wDonutLegendHtml()` dan `wRenderPayoffDonut()` supaya Hutang & Piutang pakai kode chart yang identik, bukan duplikasi.
  - Halaman Piutang (sebelumnya tidak tersentuh oleh PR #151): ditambah kartu baru "PROGRES PENAGIHAN" (donut "Sudah Diterima" vs "Sisa Piutang" + legenda + persentase tertagih) dan tombol toolbar "Laporan Konsolidasi", menyamakan dengan halaman Hutang.
- **Verifikasi database (dicek atas pertanyaan user "apakah hanya tersimpan di lokal atau sudah sinkron"):** dibaca `saveData()`/`fireSaveAllData()` di `public/js/02-storage.js` — `WEALTH` (termasuk `.debt`, `.bank`, `.piutang`) SUDAH ikut disinkronkan ke Supabase Cloud lewat tabel `user_data` (`client.from('user_data').upsert({user_id, data: payload, ...})`, field `payload.wealth = WEALTH`) untuk user yang login (bukan mode Tamu/Demo). localStorage cuma cache offline device, bukan satu-satunya penyimpanan. Untuk mode Tamu/Demo, `fireSaveAllData()` sengaja `return false` di awal — data memang cuma lokal, sesuai desain sandbox demo (tidak ada identitas cloud untuk disinkronkan).
- **Live verification (Playwright, server lokal):** 3 hutang + 2 piutang sintetis — donut Hutang menampilkan 2,0% terbayar/98,0% sisa sesuai kalkulasi manual, donut Piutang menampilkan 54,5% diterima/45,5% sisa sesuai kalkulasi manual; keduanya bersih tanpa tooltip menumpuk.
- Cache-bust `20-wealth.js` → `?v=20260912b`.

`npm test` (163/163: 125+18+6+5+9), `npm run lint` bersih.

## 2026-09-12 — Perbaiki 2 kasus konten tabel terpotong: modal Rincian Transaksi & 2D Sensitivity Matrix

- **Konteks:** user tunjukkan 2 screenshot: (1) modal "Rincian Kalkulasi Transaksi" — kolom "NILAI (Rp)" terpotong; (2) kartu "2D SENSITIVITY MATRIX (BEAR · BASE · BULL)" di halaman Harga Wajar — angka & header kolom terpotong di tepi kanan.
- **Root cause #1 (modal transaksi, `public/js/05-assets.js`):** wrapper tabel pakai `overflow:hidden` TANPA `overflow-x:auto` di dalamnya, dan `.tbl th/.tbl td` (CSS global) punya `white-space:nowrap` bawaan — kolom "Dasar Pengenaan/Rumus" berisi kalimat panjang (mis. "0,043% × Gross (Bursa & KPEI)") dipaksa satu baris, melebihi lebar modal 560px, lalu `overflow:hidden` MEMOTONGNYA secara diam-diam (bukan scroll, langsung hilang).
- **Root cause #2 (2D Sensitivity Matrix, `public/index.html` + `public/js/10-hargawajar.js`) — DUA lapis bug, bukan cuma satu:**
  1. Sama seperti #1: label kolom/baris ("Bear (18.8x)", "Bear (-25%)") dipaksa nowrap oleh `.tbl` default, memaksa 4 kolom melebihi kartunya sendiri.
  2. **Bug lebih dalam yang baru ditemukan saat investigasi**: halaman "Harga Wajar" pakai CSS Grid 2-kolom (`grid-template-columns:1fr 340px`) untuk panel Input (kiri) vs Hasil (kanan, tempat kartu Sensitivity Matrix berada). Tabel "Data Keuangan Historis" 7-kolom di panel kiri SUDAH dibungkus `overflow-x:auto`, tapi TANPA `min-width:0` pada grid-item induknya — classic **CSS Grid "min-width:auto blowout"**: track grid kiri tetap memakai min-content tabel (~995px) sebagai lantai minimum, memaksa SELURUH grid (termasuk kolom kanan 340px berisi kartu Sensitivity Matrix) meluber ratusan piksel melewati viewport dan ter-clip di luar layar — bukan cuma tabelnya yang sempit di dalam kartu, TAPI SELURUH KARTUNYA sendiri sudah di luar area yang terlihat. Dikonfirmasi lewat pengukuran `getBoundingClientRect()` sebelum/sesudah fix (kartu sensitivity: right-edge 1656px vs viewport 1400px SEBELUM fix; 1376px, di dalam viewport, SESUDAH fix).
- **Perbaikan:**
  - CSS baru `.tbl-tight` (`public/css/main.css`) — override padding+white-space untuk tabel sempit tanpa mengubah `.tbl` default di tabel lain manapun.
  - Modal transaksi: tabel dibungkus tambahan `overflow-x:auto`, diberi class `tbl-tight` (kolom label & rumus boleh wrap), kolom nominal tetap `white-space:nowrap` eksplisit supaya angka tidak pecah baris.
  - Sensitivity Matrix: label dipersingkat ("Bear (18.8x)" → "Bear" + "18.8x" dua baris), `table-layout:fixed` + lebar kolom 25% rata, class `tbl-tight`.
  - **Fix akar CSS Grid**: `.hw-result-layout > :first-child{min-width:0}` — grid-item kolom kiri sekarang boleh menyusut di bawah min-content tabelnya; tabel 7-kolom itu sendiri yang scroll horizontal (sudah ada wrapper-nya), bukan seluruh grid yang meluber. Kolom kanan (340px → dilebarkan jadi 380px untuk sedikit lega) sekarang benar-benar berada dalam viewport. Ditambah breakpoint `@media(max-width:900px)` collapse ke 1 kolom untuk layar sempit.
- **Live verification (Playwright, server lokal, sebelum/sesudah dibandingkan lewat `getBoundingClientRect()`):**
  - Modal transaksi: `tableOverflowsModal:false`, baris "TOTAL BERSIH (NET CASH)" lengkap terbaca hingga nominalnya.
  - Sensitivity Matrix: `tableOverflowsCard:false` DAN kartu itu sendiri kini `right:1376` (< viewport 1400px) — sebelum fix `right:1656` (168px+ di luar viewport, mustahil dilihat tanpa scroll horizontal browser).
- Cache-bust: `main.css` → `?v=20260912a`, `05-assets.js` → `?v=20260912a`, `10-hargawajar.js` → `?v=20260912a`.

`npm test` (163/163), `npm run lint` bersih.

**Catatan jujur untuk user:** akar masalah #2 (grid CSS blowout) ternyata SUDAH ADA sebelum sesi ini menyentuh halaman Harga Wajar sama sekali — bukan regresi dari perubahan Debt/Bank/Piutang sebelumnya di sesi ini. Kemungkinan sudah lama begitu di halaman ini pada layar dengan lebar tertentu (khususnya sekitar 1400px viewport ke bawah); baru ketahuan sekarang karena diperiksa langsung.

## 2026-09-12 — Rapikan desain 2D Sensitivity Matrix: bold tidak konsisten & sel biru tanpa penjelasan

- **Konteks:** user tunjukkan screenshot kartu 2D Sensitivity Matrix (sudah diperbaiki tata letaknya di PR #153) dan bertanya: (1) kenapa selalu ada satu sel yang ditandai (kotak biru di tengah), (2) label "Bear"/"Base"/"Bull" ada yang bold ada yang tidak.
- **Diagnosa:** kedua hal SEBENARNYA bukan bug fungsional — kotak biru memang sengaja menandai perpotongan skenario ROE Base × PER Base (estimasi paling mungkin), fitur yang sudah ada sejak awal. Tapi (a) tidak ada penjelasan visual apa pun untuk sel yang ditandai itu, jadi wajar terlihat seperti kesalahan; (b) `rowLabelStyle` di `public/js/10-hargawajar.js` cuma memberi `font-weight:700` ke baris "Base" (`rIdx===1`), sementara baris "Bear"/"Bull" polos — kontras dengan header kolom yang SEMUA bold (lewat `.tbl th` bawaan) dengan cuma "Base" dibedakan warna, bukan bold. Inkonsistensi bold row-vs-column inilah yang terlihat "acak".
- **Perbaikan:**
  - `rowLabelStyle`: sekarang SEMUA baris (Bear/Base/Bull) selalu `font-weight:700`, cuma warna yang beda untuk "Base" (`var(--accent)`) — konsisten dengan header kolom.
  - Ditambah legenda kecil di bawah tabel (`public/index.html`): swatch kotak biru + teks "Kotak biru = skenario dasar (ROE Base × PER Base) — estimasi paling mungkin. Bear/Bull di sekelilingnya cuma skenario alternatif jika ROE atau PER melenceng ±25%." — supaya sel yang ditandai punya penjelasan, tidak terlihat seperti bug.
- **Live verification (Playwright, server lokal):** screenshot kartu menunjukkan "Bear"/"Base"/"Bull" (baris) sama-sama bold, legenda tampil di bawah tabel.
- Cache-bust `10-hargawajar.js` → `?v=20260912b`.

`npm test` (163/163), `npm run lint` bersih.

## 2026-09-12 — Diagnosa "Kuota AI harian tercapai" mandek: catch block `/api/sectoral-news` diam total

- **Konteks:** setelah user ganti `GEMINI_API_KEY`, widget "Berita Pasar & Katalis Terkoneksi" (Sectoral Insight) terus menampilkan "Kuota AI harian tercapai, coba lagi nanti." User cek Google Cloud Console Rate Limits dashboard sendiri — semua model 0/0 usage, tidak ada tanda kena limit asli. 3 kali export log Vercel juga tidak menunjukkan satupun warning/error terkait Gemini, padahal widget-nya jelas menampilkan pesan kegagalan.
- **Root cause ditemukan lewat pembacaan kode langsung**: catch block di `/api/sectoral-news` (`server.js`, endpoint terpisah dari `/api/trending-news`) **tidak pernah memanggil `console.warn`/`console.error` sama sekali** — beda dengan endpoint berita lain yang sudah pernah diperbaiki. Jadi setiap kali panggilan Gemini di endpoint ini gagal dengan pesan mengandung "429"/"quota", errornya SUNGGUHAN terjadi, tapi:
  - Response HTTP tetap `200 OK` (dibungkus jadi respons "jujur tapi ramah" — `dataUnavailable:true` + pesan di body JSON).
  - Vercel access-log hanya mencatat status code (200), tidak pernah membaca isi body.
  - Tidak ada `console.warn` apapun → tidak ada jejak di Runtime Logs.
  - Hasilnya: kegagalan nyata, tapi **100% tidak terlihat** dari log manapun — persis skenario yang user alami (log bersih, tapi UI menampilkan kegagalan).
- **Root cause ASLI (penyebab errornya sendiri) BELUM ditemukan** — user sudah cek dan tidak ada peringatan "Search grounding requires billing" di Google AI Studio seperti dugaan awal saya, jadi hipotesis itu gugur. Root cause pastinya menunggu log berikutnya setelah fix ini di-deploy.
- **Perbaikan (`server.js`):**
  - `/api/sectoral-news` catch block: ditambah `console.warn('Gemini sectoral-news notice:', {message, name, status})` — sekarang SELALU logging, tidak ada lagi jalur silent-fail.
  - `/api/trending-news` catch block: sebelumnya cuma log `"Quota limit reached."` generik tanpa `errMessage` asli saat `quotaExhausted`. Sekarang selalu log pesan error asli + `name`/`status` terlepas dari klasifikasi kuota-atau-bukan, supaya lain kali bisa dibedakan apakah benar 429 asli dari Google atau sekadar error lain yang kebetulan mengandung kata "quota".
- **Belum ada verifikasi live** — perbaikan ini murni observability (tidak mengubah perilaku/response ke user), efeknya baru kelihatan begitu terjadi kegagalan berikutnya dan user export log lagi.

`npm test` (163/163), `npm run lint` bersih. Tidak ada cache-bust diperlukan (server-side only, tidak ada file public/js yang berubah).

**Catatan jujur untuk user:** ini BUKAN perbaikan akar masalah "kenapa Gemini gagal" — ini cuma memperbaiki kebutaan log yang menghalangi kita menemukan akarnya. Setelah di-deploy, kalau widget berita masih gagal, tolong export log lagi (cari kata "sectoral-news notice") — kali ini pasti ada pesan errornya.

## 2026-09-12 — Hapus total kode Firebase mati (menutup akar alert GitHub secret scanning)

- **Konteks:** GitHub secret scanning menandai Firebase Web API key (`AIzaSy...`) sebagai "Public leak" — hardcoded di `public/js/00-config.js`. Investigasi (lihat sesi sebelumnya) mengonfirmasi Firebase sudah 100% mati sejak migrasi ke Supabase, termasuk fitur KSEI yang sebelumnya jadi alasan kode ini dipertahankan (sudah pindah ke tabel Supabase sendiri, `sql/schema_migration.sql`). User sudah rotasi key + hapus env var Firebase di Vercel; langkah terakhir yang tersisa di tangan Claude: hapus kodenya dari repo.
- **Perbaikan:**
  - `public/js/00-config.js`: hapus `FIREBASE_CONFIG`, `FIRESTORE_DB_ID`, `_firebaseApp`/`_firebaseAuth`/`_firebaseDb`, `_configureDbSettings()`, `getFirebaseDb()`, dan seluruh blok inisialisasi `firebase.initializeApp()`/`firebase.auth()`/`enablePersistence()`. **Dipertahankan**: `getFirestoreUserUid()` — meski namanya menyebut Firestore, fungsi ini murni baca `localStorage`/`sessionStorage`, tidak pernah menyentuh SDK Firebase, dan masih dipanggil dari 5 tempat di `02-storage.js`.
  - `public/index.html`: hapus 3 `<script>` tag Firebase SDK (`firebase-app-compat.js`, `firebase-auth-compat.js`, `firebase-firestore-compat.js`) — tidak ada lagi kode yang memanggil `firebase.*` di manapun.
- **Verifikasi cakupan sebelum hapus**: `grep` seluruh `public/js/*.js` untuk `getFirebaseDb|FIREBASE_CONFIG|_firebaseApp|_firebaseAuth|_firebaseDb|FIRESTORE_DB_ID` — nol pemanggil di luar `00-config.js` sendiri.
- **Live verification (Playwright, server lokal):** `window.firebase` sekarang `undefined` (SDK benar-benar tidak ter-load), nol page error, login Mode Tamu & render dashboard tetap normal, `getFirestoreUserUid()` tetap mengembalikan `'demo_guest_user'` seperti sebelumnya.
- Cache-bust `00-config.js` → `?v=20260912a`.

`npm test` (163/163), `npm run lint` bersih.

**Dampak keamanan:** setelah PR ini merge, key Firebase yang sebelumnya di-flag GitHub tidak lagi ada di kode manapun di HEAD repo (masih ada di histori git lama, tapi itu sudah tidak relevan karena key-nya sudah dirotasi user). Alert GitHub bisa di-dismiss dengan alasan "Revoked".

## 2026-09-12 — Migrasi total AI provider: Gemini → Claude (Anthropic)

- **Konteks:** setelah kegagalan Gemini yang berulang (429 `RESOURCE_EXHAUSTED` — pesan asli Google mengarah ke masalah billing) dan user secara eksplisit menolak opsi API key gratis pihak ketiga dari GitHub (risiko ToS/ban/keamanan terlalu tinggi untuk direkomendasikan), user memutuskan: **"saya migrasi ke anthropic aja, siapkan kodenya."** Konfirmasi keputusan sebelumnya: model = Claude Sonnet 5, Gemini dihentikan total (bukan dual-fallback).
- **Perubahan (`server.js`):**
  - Dependency: `@google/genai` → `@anthropic-ai/sdk` (`package.json`).
  - `getAiClient()` (nama fungsi sengaja dipertahankan agar semua call site tidak perlu berubah signature): sekarang membaca `ANTHROPIC_API_KEY` dan mengembalikan instance `Anthropic`.
  - `callGeminiWithRetryAndFallback()` (5-model fallback chain Gemini) diganti `callClaudeWithRetry()` — retry sederhana dengan backoff untuk status 429/5xx, tidak perlu fallback antar-model karena Claude tidak punya banyak tier gratis terpisah seperti Gemini.
  - Helper baru `claudeExtractText()` dan `claudeExtractGroundingChunks()` — sengaja mengembalikan bentuk yang SAMA dengan respons lama Gemini (`response.text`, `groundingChunks[i].web.uri/.title`) supaya kode downstream (parsing JSON dari teks, render sumber berita) nol perubahan.
  - 3 endpoint AI (`/api/trending-news`, `/api/sectoral-news`, `/api/ai/portfolio-advice`): `tools:[{googleSearch:{}}]` → `tools:[{type:'web_search_20260209', name:'web_search'}]`; prompt yang menyebut "Google Search" diubah jadi "web search" generik.
  - `/api/ai/agent-chat`: loop tool-calling ditulis ulang total untuk protokol Claude (`tool_use`/`tool_result` content blocks, bukan `functionCalls`/`functionResponse` Gemini). `AGENT_TOOL_DECLARATIONS` (10 tools) DIPERTAHANKAN dalam skema Gemini lama sebagai single source of truth — ditambah converter `toClaudeTools()` yang mengubahnya ke skema Claude (`input_schema`) sekali saat startup, supaya tidak ada duplikasi/risiko drift dari menulis ulang 10 tool schema secara manual.
  - Blok "2. DETERMINISTIC AGENTIC ENGINE FALLBACK" (jaring pengaman keyword-routed via `executeAgentTool()`) **tidak disentuh sama sekali** — provider-agnostic by design, tetap jadi fallback kalau `ANTHROPIC_API_KEY` belum diset atau Claude API error.
  - Endpoint `/api/ai/gemini-status` (quota observability Gemini) dihapus total — Anthropic tidak punya API quota-check ringan yang setara.
- **Perubahan file lain:**
  - `lib/gemini-quota.js` + `test_gemini_quota.js` dihapus total (Upstash-backed per-model quota counter, sudah tidak relevan). `package.json` script `test`/`test:gemini-quota` disesuaikan.
  - `public/js/35-settings.js`: widget "Gemini API Quota" di halaman Settings dihapus (fetch ke endpoint yang sudah tidak ada).
  - `public/js/06-analysis-router.js`: teks berbrand Gemini di `aiRunGemini()` (loading/disclaimer/error message) diganti jadi Claude Sonnet 5 / Web Search Grounding generik. Nama fungsi & `window.aiRunGemini` export DIPERTAHANKAN (verifikasi grep: tidak ada `onclick`/pemanggil dari `index.html`, aman untuk tidak di-rename, meminimalkan risiko).
  - `public/js/41-stockchat-cockpit.js`: komentar header diperbarui dari "Gemini Function Calling" jadi "Claude Tool Use".
- **Verifikasi:**
  - `node --check` semua file yang diubah — bersih.
  - `npm test` — 154/154 test lulus (test_suite.js 125, test_financial_policy.js 18, test_provider_functions.js 6, test_security_regressions.js 5), zero regresi.
  - `npm run lint` — bersih.
  - **Graceful degradation tanpa `ANTHROPIC_API_KEY`** (disimulasikan lokal dengan env var di-unset): `/api/trending-news` → fallback jujur (`isFallback:true`, tanpa crash); `/api/ai/portfolio-advice` → pesan error yang benar ("ANTHROPIC_API_KEY belum dikonfigurasi di server."); `/api/ai/agent-chat` → deterministic engine tetap berfungsi penuh (tool `cek_harga`/`cek_fundamental`/`hitung_proyeksi_risiko_drawdown` semua tereksekusi benar); `/api/ai/gemini-status` → 404 (sudah dihapus, sesuai ekspektasi).
  - **BELUM diverifikasi**: panggilan live ke Claude API yang sesungguhnya (sandbox ini tidak bisa menjangkau `api.anthropic.com`, sama seperti tidak bisa menjangkau `moneywatchapps.vercel.app`). Verifikasi end-to-end BARU bisa dilakukan setelah deploy ke Vercel dengan `ANTHROPIC_API_KEY` yang valid ter-set.
  - Cache-bust: `06-analysis-router.js` → `?v=20260912a`, `35-settings.js` → `?v=20260912a`, `41-stockchat-cockpit.js` → `?v=20260912a`.

**Yang HARUS dilakukan user setelah PR ini merge & ter-deploy:** set env var `ANTHROPIC_API_KEY` di Vercel (Project Settings → Environment Variables) dengan key dari [console.anthropic.com](https://console.anthropic.com), lalu redeploy. Selama env var ini belum diset, semua fitur AI generatif (berita trending, berita sektoral, AI Copilot chat, portfolio advice) akan otomatis jatuh ke mode fallback/deterministic — tidak crash, tapi juga tidak pakai AI generatif sungguhan. `GEMINI_API_KEY` di Vercel sudah tidak dipakai kode manapun lagi setelah PR ini — aman dihapus kapan saja.

## 2026-09-12 — Card "Arus Kas RDN" tidak terisi penuh: fix CSS grid-stretch dead space

- **Konteks:** user melaporkan (screenshot) grafik "Arus Kas RDN" di halaman Kas & Mutasi RDN terlihat kecil dengan area putih kosong besar di bawahnya, sementara card sebelahnya ("Ringkasan Saldo") jauh lebih tinggi.
- **Root cause:** `.g2b{display:grid;grid-template-columns:1.2fr 1fr;gap:16px}` (grid 2 kolom) memakai `align-items:stretch` bawaan CSS Grid, jadi kedua `.card` di baris yang sama otomatis disamakan tingginya mengikuti yang tertinggi (card "Ringkasan Saldo", yang isinya lebih banyak: saldo + info sekuritas). Tapi `.card` bukan flex container — jadi tinggi ekstra yang "dipaksakan" grid ke card "Arus Kas RDN" cuma jadi ruang kosong di bawah `<div class="cw" style="height:190px">`, bukan ikut memperbesar chart-nya.
- **Perbaikan (`public/index.html`):** card "Arus Kas RDN" diubah jadi flex column (`style="display:flex;flex-direction:column"`), dan wrapper `.cw` chart-nya diubah dari `height:190px` tetap menjadi `height:190px;flex:1;min-height:0` — sekarang chart ikut memenuhi sisa tinggi card yang di-stretch oleh grid, bukan berhenti di 190px. Chart.js sendiri sudah pakai `responsive:true, maintainAspectRatio:false` (`buildRdnChart()` di `03-engine.js`) jadi otomatis resize mengikuti tinggi container baru tanpa perlu ubah kode chart.
- **Live verification (Playwright, server lokal):** screenshot `.g2b` menunjukkan kedua card sekarang sama tinggi TANPA ruang kosong — area chart "Arus Kas RDN" memenuhi seluruh card (isi grafiknya sendiri tidak ter-render di screenshot sandbox karena Chart.js dari CDN diblokir kebijakan jaringan sandbox, bukan akibat perubahan ini — layout CSS-nya yang diverifikasi).
- Tidak ada cache-bust diperlukan (perubahan hanya inline style di `index.html`, bukan file `.js` terpisah).

`npm test` (154/154), `npm run lint` bersih.

## 2026-09-12 — Verifikasi P0 dari Master Deep Audit: 2 temuan navigasi nyata + 1 temuan arsitektur besar

- **Konteks:** user membagikan `MoneyWatchApps_Master_Deep_Audit_2026-09-12.pdf` (audit independen, baseline 2026-09-10, TIDAK terkait perbaikan sesi ini). Saya verifikasi setiap klaim P0 terhadap kode aktual sebelum bertindak — audit sendiri mengaku baseline line-mapping bisa sudah usang.
- **Klaim yang terbukti usang/salah** (tidak ditindaklanjuti): dead link `goPage('risiko')` — tidak ada di kode manapun; "copilot/dataconn tanpa navigasi" — keduanya punya tombol sidebar eksplisit (`index.html:390`, `432`). Verifikasi: cross-reference seluruh `goPage('X')` call vs seluruh `id="page-X"` yang terdaftar (52 halaman) menemukan HANYA satu orphan nyata: `page-scanner`.
- **Perbaikan #1 — Router silent-fail** (`06-analysis-router.js`, `goPage()`): sebelumnya `if(!pg) return;` gagal 100% diam-diam kalau nama halaman salah/typo — tombol seolah tidak berfungsi, tanpa jejak di console. Sekarang `console.warn()` selalu dipanggil dengan nama halaman yang gagal. Zero risk untuk path yang valid (semua 52 halaman terdaftar tetap bekerja identik).
- **Perbaikan #2 — "Big Money Scanner" (`page-scanner`) diekspos ke navigasi**: halaman fungsional lengkap (filter CMF/skor akumulasi/volume ratio dari data FlowScan, `fsRunScanner()` di `07-flowscan.js`) tapi sebelumnya benar-benar tidak reachable dari manapun di UI. User memilih opsi "Tambahkan ke navigasi". Ditambahkan sebagai entry sidebar baru di grup RESEARCH, setelah Bandarmology.
- **Temuan besar tak terduga (didokumentasikan, BELUM ditindaklanjuti — perlu keputusan produk)**: markup `<div id="page-flowscan">` (halaman FlowScan lama dengan ticker input & tab "Analisa Lengkap"/"Data Harian") ternyata **dead code yang tidak pernah bisa dilihat user** — `goPage('flowscan')` SELALU redirect instan ke Bandarmology Cockpit (`renderPage()` case 'flowscan' → `goBandarmology('smart-money-flow')`, `06-analysis-router.js:872`) sebelum halaman flowscan sempat ter-render. Ini konsolidasi historis (FlowScan digabung ke tab "Smart Money Flow" di Bandarmology) yang meninggalkan markup HTML + sebagian JS pendukungnya sebagai bangkai tak terlihat. Percobaan awal saya menaruh tombol akses Scanner DI DALAM markup ini gagal total saat diverifikasi live (Playwright) — baru ketahuan setelah trace `goPage()` call chain menunjukkan `flowscan → bandarmology` terjadi sinkron dalam satu klik. Diperbaiki dengan memindahkan entry ke sidebar langsung, TIDAK bergantung pada markup flowscan yang mati.
  - **Belum diputuskan**: apakah markup `#page-flowscan` (dan kode JS pendukungnya yang hanya dipakai di sana) mau dihapus sebagai dead code, atau dipertahankan untuk kemungkinan penggunaan lain. Ini keputusan produk, bukan bug fix — tidak diambil tindakan sepihak.
- **Live verification (Playwright, server lokal):** sidebar "Big Money Scanner" ditemukan & bisa diklik, `page-scanner` ter-aktivasi (`.on` class), tombol "Scan" hadir; `console.warn()` untuk nama halaman tidak valid terkonfirmasi terpanggil.

`npm test` (154/154), `npm run lint` bersih.

## 2026-09-12 — Hapus dead code `<div id="page-flowscan">` (persetujuan user setelah temuan P0 audit)

- **Konteks:** entry sebelumnya (verifikasi P0 audit) menemukan markup `<div id="page-flowscan">` (dashboard FlowScan lama: ticker input, tab "Analisa Lengkap"/"Data Harian") sebagai dead code total — `goPage('flowscan')` selalu redirect instan ke Bandarmology Cockpit sebelum halaman itu sempat dirender. User menjawab "Hapus apabila kode mati" untuk menindaklanjuti.
- **Investigasi sebelum hapus — penting**: `fsQuickLoad(tk)` (dipanggil dari tombol "Lihat"/klik ticker di 3 halaman LIVE: Ranking, Heatmap, Watchlist) memanggil `fsRunAnalysis()`, salah satu fungsi yang tampak eksklusif untuk markup mati ini. Investigasi lebih lanjut menemukan `fsRunAnalysis()` dan fungsi turunannya (`fsRenderCharts()`, `fsRenderInd()`, `fsRenderDailyTable()`, `fsRenderVWAP()`) SEMUA menjaga setiap akses DOM dengan `if(el)...` — jadi ketika target elemennya dihapus, fungsi-fungsi ini menjadi no-op aman, BUKAN crash. Ini yang membedakan mana yang aman dihapus vs harus dipertahankan.
- **Yang dihapus (100% tidak punya pemanggil lain, diverifikasi via grep seluruh codebase):**
  - `public/index.html`: seluruh blok `<div id="page-flowscan">...</div>` (129 baris).
  - `public/js/07-flowscan.js`: `fsSt()`, `fsSetPeriod()`, `fsToogleWatchlistCurrent()` — ketiganya HANYA dipanggil dari `onclick` di markup yang baru dihapus.
- **Yang DIPERTAHANKAN (meski sekarang jadi no-op tanpa target render) karena masih dipanggil dari kode live**: `fsRunAnalysis()`, `fsRenderCharts()`, `fsRenderInd()`, `fsRenderDailyTable()`, `fsRenderVWAP()`, `fsCalcVWAP()`/`fsCalcVWAPPeriod()`/`fsCalcVWAPStdDev()` (beberapa di antaranya juga dipakai StockChat Cockpit), `fsQuickLoad()`, `fsGenAlerts()` (dipakai halaman Alerts) — semua ini dicek satu-satu dengan grep sebelum keputusan diambil.
- **Fix kritis yang menyertai** (`06-analysis-router.js`, `goPage()`): setelah markup dihapus, `el('page-flowscan')` akan `null` — tanpa penyesuaian, ini akan memicu `console.warn` dari fix sebelumnya lalu `return` SEBELUM sempat redirect ke Bandarmology, merusak `goPage('flowscan')` yang masih dipanggil dari `fsQuickLoad()` (Ranking/Heatmap/Watchlist) dan checklist Quant Toolkit di Wealth. Diperbaiki dengan menambah pemetaan `name === 'flowscan'` ke `'bandarmology'` di `targetPageName`, ditulis sebagai kondisi terpisah (bukan digabung `||`) supaya pola teks `name === 'smart-money-flow' ? 'bandarmology'` yang diverifikasi test tetap utuh.
- **2 test regresi sempat gagal setelah perubahan** (`npm test` 123/125), keduanya false-positive dari pergeseran teks, bukan bug fungsional — diperbaiki:
  1. "FlowScan must never fall back to literal IHSG": hitungan situs pemanggilan `fsFallbackInfo()` turun dari 5 ke 4 karena `fsToogleWatchlistCurrent()` (salah satu dari 5) memang dihapus sebagai dead code. Threshold test disesuaikan ke 4, dengan komentar penjelasan.
  2. "smart-money-flow must still work": regex test mencari pola teks persis `name === 'smart-money-flow' ? 'bandarmology'` — sempat pecah karena saya awalnya menggabungkan kondisi pakai `||`. Diperbaiki dengan menulis ulang sebagai ternary bersarang yang mempertahankan pola asli.
- **Live verification (Playwright, server lokal):** `goPage('flowscan')` dan `goPage('smart-money-flow')` sama-sama tetap mendarat di `page-bandarmology` dengan `currentPage` yang benar; `fsQuickLoad('BBCA')` dipanggil langsung (function reachable dari Ranking/Heatmap/Watchlist) — sukses tanpa error, `FS_G.tk` terisi benar, redirect tetap jalan.

`npm test` (154/154), `npm run lint` bersih.

## 2026-09-12 — P1 audit "Stock Cockpit fragmentation": sambungkan halaman Fundamental ke GLOBAL_STOCK_CONTEXT

- **Konteks:** audit §5 merekomendasikan "bangun Stock Cockpit sebagai single contextual shell" (MAJOR risk) untuk mengatasi fragmentasi ticker di 8 modul analisis saham. Investigasi menemukan koreksi penting: **adapter context-nya SUDAH ADA** — `window.GLOBAL_STOCK_CONTEXT` (`00-config.js`, pub/sub dengan `setTicker()`/`getTicker()`/`subscribe()`) — dan sudah tersambung ke Stock Intel, StockChat, KSEI, Sectoral Insight, dan search bar global. Yang benar masih terfragmentasi: Fundamental, Technical, Valuation, Backtester, Monthly Returns — 5 halaman dengan ticker input lokal sendiri-sendiri, tanpa publish/subscribe ke context global. User memilih mulai dari Fundamental.
- **Perbaikan (`public/js/24-stockmaster.js`):**
  - `fundFetchData()`: setelah `FUND_DATA.ticker = cleanCode`, tambah `window.GLOBAL_STOCK_CONTEXT.setTicker(cleanCode, 'fundamental')` — publish, pola identik dengan `selectStockIntelTicker()`/`selectStockChatTicker()`.
  - Listener baru: `window.GLOBAL_STOCK_CONTEXT.subscribe(function(tk, source){...})` — kalau `source !== 'fundamental'` dan ticker beda dari `FUND_DATA.ticker`: update `#fundTickerInput` selalu; kalau halaman Fundamental sedang aktif langsung `fundFetchData(tk)` (live re-render), kalau tidak cukup update state (`FUND_DATA.ticker`) supaya `fundInit()` menampilkan ticker yang benar saat halaman dibuka nanti. Pola identik dengan listener StockChat yang sudah ada di `41-stockchat-cockpit.js:1646`.
  - Guard anti-infinite-loop: `source !== 'fundamental'` mencegah listener bereaksi ke publish-nya sendiri; `tk !== FUND_DATA.ticker` di semua listener lain mencegah reprocessing berantai — pola yang sama sudah terbukti aman di StockChat.
- **Live verification (Playwright, server lokal)** — 5 skenario, semua sesuai ekspektasi tanpa error:
  1. Boot: `GLOBAL_STOCK_CONTEXT` dan `FUND_DATA.ticker` sama-sama 'BBCA'.
  2. `setTicker('UNVR','user-search')` saat TIDAK di halaman Fundamental → `FUND_DATA.ticker` dan `#fundTickerInput` ikut ter-update di background (tanpa fetch/render, karena halaman tidak aktif).
  3. Navigasi ke Fundamental sesudahnya → menampilkan 'UNVR' (bukan 'BBCA' basi) — inilah bug fragmentasi yang diperbaiki.
  4. Ganti ticker eksternal ('BMRI' dari stock-intel) SAAT sedang aktif di halaman Fundamental → live re-render langsung ke 'BMRI'.
  5. `fundFetchData('ASII')` dari halaman Fundamental sendiri → `GLOBAL_STOCK_CONTEXT` ikut ter-update ke 'ASII', sinkron ke arah sebaliknya.
- Tidak ada cache-bust diperlukan untuk file lain (index.html tidak diubah, `24-stockmaster.js` di-cache-bust otomatis lewat query string yang sudah ada — cek versi saat ini).

`npm test` (154/154), `npm run lint` bersih.

**Catatan untuk lanjutan:** pola yang sama (publish + subscribe, ~15 baris) siap direplikasi untuk Technical, Valuation, Backtester, Monthly Returns kapanpun diminta — masing-masing halaman independen, jadi bisa dikerjakan satu per satu tanpa saling bergantung.

## 2026-09-12 — P1 audit "Stock Cockpit fragmentation": sambungkan halaman Technical ke GLOBAL_STOCK_CONTEXT

- **Konteks:** lanjutan dari entry Fundamental sebelumnya — user memilih Technical sebagai halaman kedua yang disambungkan ke `window.GLOBAL_STOCK_CONTEXT`.
- **Perbaikan (`public/js/24-stockmaster.js`):**
  - `techFetchData()`: setelah `TECH_DATA.ticker = cleanCode`, tambah `window.GLOBAL_STOCK_CONTEXT.setTicker(cleanCode, 'technical')` — publish, pola identik `fundFetchData()`.
  - Listener baru: `window.GLOBAL_STOCK_CONTEXT.subscribe(...)` — kalau `source !== 'technical'` dan ticker beda dari `TECH_DATA.ticker`: update `#techTickerInput` selalu; kalau halaman Technical sedang aktif langsung `techFetchData(tk)`, kalau tidak cukup update state `TECH_DATA.ticker` supaya `techInit()` menampilkan ticker yang benar saat halaman dibuka nanti. Pola identik listener Fundamental/StockChat.
  - Catatan: `techInit()` juga dipakai sebagai fallback render untuk case router 'flowscan' (redirect) dan 'candle' — publish dari sana harmless karena guard `tk !== TECH_DATA.ticker` di semua listener mencegah reprocessing berantai (sama seperti dianalisis di entry Fundamental).
  - Cache-bust `24-stockmaster.js` → `?v=20260912b`.
- **Live verification (Playwright, server lokal)** — 5 skenario sama seperti Fundamental, semua sesuai ekspektasi tanpa error: boot state konsisten, sync masuk saat halaman tidak aktif, ticker benar setelah navigasi, live re-render saat aktif, publish keluar dari perubahan lokal.

`npm test` (154/154), `npm run lint` bersih.

**Progres P1 "Stock Cockpit fragmentation":** Stock Intel, StockChat, KSEI, Sectoral Insight (sudah ada sebelumnya) + Fundamental, Technical (baru disambungkan) = 6 dari 8 modul kini tersinkron via `GLOBAL_STOCK_CONTEXT`. Sisa: Valuation (Harga Wajar), Backtester, Monthly Returns.

## 2026-09-12 — P1 audit "Stock Cockpit fragmentation": sambungkan halaman Valuation ke GLOBAL_STOCK_CONTEXT

- **Konteks:** lanjutan dari Fundamental (#161) dan Technical (#162) — halaman ketiga yang disambungkan ke `window.GLOBAL_STOCK_CONTEXT`.
- **Perbedaan penting dari Fundamental/Technical** (bukan copy-paste langsung, disesuaikan setelah investigasi arsitektur halaman ini):
  1. `hw_loadStock()` memicu toast global (`showSaveStatus()` → `#save-status-bar`, terlihat di halaman MANAPUN, bukan cuma di Valuation). Memanggilnya diam-diam dari background sync (saat user ada di halaman lain) akan menampilkan toast "Data riil X dimuat" yang membingungkan tanpa konteks.
  2. `hw_init()` memprioritaskan restore dari `localStorage('hw_state')` DI ATAS state in-memory `hwData.ticker` — beda dari `fundInit()`/`techInit()` yang membaca ticker dari `#input.value`/state var sebagai prioritas utama. Ini karena Valuation punya tabel yang bisa diedit manual (data historis MoS) dan "Simpan" adalah tombol manual, bukan autosave — meng-update `hwData.ticker` saja di background tanpa memanggil `hw_loadStock()` tidak akan bertahan sampai kunjungan halaman berikutnya.
- **Keputusan desain**: listener HANYA bertindak (panggil `hw_loadStock(tk)` penuh) kalau halaman `page-hargawajar` SEDANG AKTIF — beda dari Fundamental/Technical yang tetap update state di background meski halaman tidak aktif. Trade-off yang diterima secara sadar: kalau ticker global berubah SAAT Valuation tidak sedang dibuka, halaman ini TIDAK otomatis mengambil ticker itu saat dibuka nanti (tetap pakai ticker/tabel tersimpan terakhirnya) — konsisten dengan perilaku existing (localStorage-first) yang sengaja tidak diubah, dan menghindari toast global yang mengganggu.
- **Perbaikan (`public/js/10-hargawajar.js`):**
  - `hw_loadStockData(tk)`: setelah `hwData.ticker = tk`, publish ke `GLOBAL_STOCK_CONTEXT.setTicker(tk, 'hargawajar')` — ditaruh di titik tunggal ini (bukan di `hw_loadStock`) supaya semua jalur yang benar-benar me-resolve ticker (termasuk restorasi awal di `hw_init()`) ikut publish.
  - Listener baru: `GLOBAL_STOCK_CONTEXT.subscribe(...)` — cek `page-hargawajar.classList.contains('on')` sebelum memanggil `hw_loadStock(tk)`.
  - Cache-bust `10-hargawajar.js` → `?v=20260912c`.
- **Live verification (Playwright, server lokal)** — 4 skenario, semua sesuai desain:
  1. Boot: `hwData.ticker` kosong (form kosong by design, beda dari default 'BBCA' di Fundamental/Technical).
  2. `setTicker('UNVR')` saat TIDAK di Valuation → `hwData.ticker` TIDAK berubah (sesuai desain, dihindari agar tidak memicu toast di halaman lain).
  3. Navigasi ke Valuation → tetap form kosong (tidak otomatis mengambil 'UNVR' — trade-off yang disengaja, dicatat di atas).
  4. Ganti ticker eksternal SAAT aktif di Valuation → live re-render (`hwData.ticker` jadi 'BMRI'); ubah ticker dari Valuation sendiri (`hw_loadStock('ASII')`) → ter-propagasi keluar ke context global.
  Tidak ada error, tidak ada infinite loop.

`npm test` (154/154), `npm run lint` bersih.

**Progres P1 "Stock Cockpit fragmentation":** 7/8 modul kini tersinkron (sebagian penuh dua-arah, sebagian — Valuation — hanya live-sync saat aktif karena alasan arsitektur di atas). Sisa: Backtester, Monthly Returns.
