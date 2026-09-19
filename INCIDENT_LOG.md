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

## 2026-09-12 — P1 audit "Stock Cockpit fragmentation": sambungkan halaman Backtester ke GLOBAL_STOCK_CONTEXT

- **Konteks:** lanjutan dari Fundamental (#161), Technical (#162), Valuation (#163) — user memilih Backtester berikutnya, dengan ekspektasi awal ini "rawan error". Setelah investigasi, ternyata Backtester justru yang **paling rendah risiko** dari semua halaman yang sudah disambungkan:
  - Tidak ada state ticker terpisah (`QT.btData` dll) — ticker HANYA dibaca langsung dari `#bt-ticker` input, tidak ada `BT_STATE.ticker` atau semacamnya yang perlu disinkronkan.
  - Tidak ada `btInit()` yang berjalan otomatis saat halaman dibuka — router: `case 'backtester':break; // wait for user action`. Backtest hanya berjalan lewat 2 tombol eksplisit (`btFetchLive()`, `runBacktest()`).
  - Karena itu, tidak ada risiko toast global (beda dari Valuation) maupun auto-eksekusi simulasi/inferensi XGBoost yang berat secara diam-diam (beda dari kekhawatiran awal soal "rawan error").
- **Perbaikan (`public/js/11-quant.js`):**
  - `btFetchLive()` dan `runBacktest()`: masing-masing publish ke `GLOBAL_STOCK_CONTEXT.setTicker(ticker, 'backtester')` setelah ticker dibaca dari input.
  - Listener baru: `GLOBAL_STOCK_CONTEXT.subscribe(...)` — HANYA meng-update nilai `#bt-ticker` (`inp.value = tk`), TIDAK memanggil `btFetchLive()`/`runBacktest()` otomatis. Backtest tetap sepenuhnya menunggu aksi eksplisit user, sesuai desain existing halaman ini.
  - Cache-bust `11-quant.js` → `?v=20260912a`.
- **Live verification (Playwright, server lokal)** — 4 skenario, semua sesuai ekspektasi:
  1. Boot: `GLOBAL_STOCK_CONTEXT` dan `#bt-ticker` sama-sama 'BBCA'.
  2. `setTicker('UNVR')` saat TIDAK di Backtester → input ikut ter-update (aman, cuma tulis DOM, tanpa efek samping).
  3. Navigasi ke Backtester → input menampilkan 'UNVR', **dan dikonfirmasi `QT.btData` tetap `null`** — tidak ada auto-run backtest yang tidak diminta.
  4. Live sync SAAT aktif di Backtester (BMRI dari stock-intel) → input ter-update.
  5. Aksi eksplisit lokal (`btFetchLive()`) → ter-propagasi keluar ke context global.
  Tidak ada error.

`npm test` (154/154), `npm run lint` bersih.

**Progres P1 "Stock Cockpit fragmentation":** 8/9 titik tersinkron (Stock Intel, StockChat, KSEI, Sectoral Insight, Fundamental, Technical, Valuation, Backtester). Sisa: Monthly Returns.

## 2026-09-12 — P1 audit "Stock Cockpit fragmentation": sambungkan halaman Monthly Returns ke GLOBAL_STOCK_CONTEXT (SELESAI, 9/9)

- **Konteks:** lanjutan dan penutup dari rangkaian Fundamental (#161), Technical (#162), Valuation (#163), Backtester (#164) — halaman terakhir dari daftar fragmentasi yang diidentifikasi di audit §5.
- **Karakteristik halaman ini**: mirip Backtester — tidak ada state ticker terpisah (selalu dibaca fresh dari `#mr-ticker-input`/`#mr-ticker` setiap kali `mrRender()` dipanggil), tapi berbeda karena `mrRender()` memang dipanggil otomatis saat navigasi (lewat hook `window.goPage` di baris ~298 untuk `page === 'monthly-returns'`) dan bersifat ringan/sinkron (tanpa network fetch otomatis, tanpa toast) — jadi aman mengikuti pola live-sync penuh seperti Fundamental/Technical, bukan pola terbatas seperti Valuation/Backtester.
- **Perbaikan (`public/js/11-quant.js`):**
  - `mrRender()`: setelah ticker diresolusi dan `#mr-ticker-input` disinkronkan, publish ke `GLOBAL_STOCK_CONTEXT.setTicker(ticker, 'monthly-returns')` — karena tidak ada state var terpisah, publish ditaruh langsung di titik resolusi ticker satu-satunya fungsi ini.
  - Listener baru: `GLOBAL_STOCK_CONTEXT.subscribe(...)` — bandingkan `tk` terhadap nilai `#mr-ticker-input` SAAT INI (bukan state var JS, karena tidak ada), update input & select `#mr-ticker`, panggil `mrRender()` kalau halaman `page-monthly-returns` sedang aktif.
  - Cache-bust `11-quant.js` → `?v=20260912b`.
- **Live verification (Playwright, server lokal)** — 4 skenario, semua sesuai ekspektasi tanpa error fungsional (2 error "Chart is not defined" tercatat adalah keterbatasan sandbox pre-existing — Chart.js dari CDN diblokir kebijakan jaringan sandbox — bukan regresi, dikonfirmasi karena semua state title/input tetap benar meski chart gagal digambar):
  1. Boot: konsisten 'BBCA'.
  2. `setTicker('UNVR')` saat TIDAK di Monthly Returns → input ikut ter-update.
  3. Navigasi ke Monthly Returns → menampilkan 'UNVR' dengan judul benar ("Monthly Return — UNVR (Unilever Indonesia)").
  4. Live sync SAAT aktif (BMRI dari stock-intel) → judul & input ter-update langsung.
  5. Input lokal diketik user ('ASII' via `mrOnInputSearch`) → ter-propagasi keluar ke context global.

`npm test` (154/154), `npm run lint` bersih.

**PENUTUP P1 "Stock Cockpit fragmentation" dari Master Deep Audit 2026-09-12:** Seluruh 9 titik analisis saham kini tersinkron via `GLOBAL_STOCK_CONTEXT` — Stock Intel, StockChat, KSEI, Sectoral Insight (sudah ada sebelum sesi ini), ditambah Fundamental, Technical, Valuation, Backtester, Monthly Returns (disambungkan dalam rangkaian PR #161-#165 sesi ini). Catatan jujur: bukan "Stock Cockpit" tunggal seperti direkomendasikan audit (itu MAJOR-risk rewrite arsitektur, tidak dikerjakan) — melainkan perluasan adapter context yang SUDAH ADA ke seluruh modul, dengan trade-off berbeda per halaman sesuai karakteristik masing-masing (dijelaskan di entry Valuation dan Backtester). Item audit lain yang masih terbuka: temuan data-trust AI Chart Intelligence/Bandarmology (CRITICAL/MAJOR risk, belum disentuh) dan konsolidasi design token (MODERATE, belum disentuh).

## 2026-09-12 — Audit "AI Chart Intelligence — MAJOR data-trust issue": disclosure badge (opsi minimal)

- **Konteks:** audit §9 menandai `43-ai-chart-intelligence.js` sebagai berisiko karena punya fallback data sintetis untuk S/R, Fibonacci, Market Structure, dan AI Confluence. Investigasi mengonfirmasi temuan ini LEBIH SERIUS dari klaim audit: file ini secara eksplisit menampilkan pesan "Sesuai kebijakan **Zero Dummy Data**..." di satu jalur (ticker invalid/tidak ada harga sama sekali), tapi punya DUA jalur lain yang MELANGGAR klaim itu secara diam-diam:
  1. `buildAiSharedMarketContext()` baris 33-41: kalau `fsGenData()` mengembalikan array kosong, kode membuat candle 100% fiktif dari rumus `Math.sin(i*0.2)*0.06` — gelombang sinus matematis, bukan derivasi dari harga riil manapun.
  2. `fsGenData()` sendiri sudah punya flag `.simulated=true` (fallback random-walk berbenih saat OHLCV riil belum ter-cache, `07-flowscan.js:212`) — tapi `.map()` untuk normalisasi objek candle di baris 44 membuat array BARU yang tidak mewarisi properti `.simulated` dari array asli, jadi flag itu hilang diam-diam.
  - Di kedua jalur ini, `ctx.isValid` tetap `true`, jadi seluruh pipeline (`detectAiMarketStructure`, `calculateAiFibonacciSwings`, `calculateAiConfluenceScore`, `generateAiTradeSetup`) tetap jalan di atas data fiktif tanpa indikasi apapun ke user.
- **Keputusan user**: opsi minimal — disclosure badge saja, TIDAK memblokir kalkulasi (opsi audit yang lebih ketat — blokir sinyal + `DATA_UNAVAILABLE` state — ditunda, bukan diimplementasikan sesi ini).
- **Perbaikan (`public/js/43-ai-chart-intelligence.js`):**
  - `buildAiSharedMarketContext()`: tangkap `rawOhlcv.simulated` SEBELUM di-normalize via `.map()` (mencegah flag hilang); tandai `isSimulated=true` juga untuk 2 jalur fallback lain yang sudah ada (candle sinus fiktif, dan candle datar tunggal dari harga terakhir). Field baru `isSimulated` ditambahkan ke objek context yang di-return.
  - `renderAiTechnicalWorkspaceUI()`: render `fsSrcDot(true)` (badge "○ SIM" — helper yang SUDAH dipakai konsisten di FlowScan/Ranking/Heatmap/Watchlist untuk kasus sama) tepat di sebelah harga & persentase perubahan di toolbar, kalau `ctx.isSimulated` true.
  - Cache-bust `43-ai-chart-intelligence.js` → `?v=20260912a`.
- **Live verification (Playwright, server lokal)** — dijalankan lewat pipeline ASLI (`runAiChartAnalysis('BBCA')`, bukan mock parsial):
  - `buildAiSharedMarketContext('BBCA','1D')` di sandbox ini (tanpa cache OHLCV riil) mengembalikan `isSimulated:true` — mengonfirmasi flag terdeteksi benar dari `fsGenData()`.
  - HTML hasil render `runAiChartAnalysis('BBCA')` mengandung badge "SIM"; `AI_CHART_STATE.lastContext.isSimulated` = `true`. Tanpa error.

`npm test` (154/154), `npm run lint` bersih.

**Catatan jujur — ini BUKAN penutup masalah**: perbaikan ini murni menutup kontradiksi "klaim Zero Dummy Data vs kenyataan kode" dengan disclosure. S/R, Fibonacci, Structure, Confluence, dan Trade Setup TETAP dihitung dan ditampilkan penuh dari data sintetis — cuma sekarang ada badge kecil yang bisa diabaikan. Opsi audit yang lebih ketat (blokir kalkulasi sepenuhnya + `DATA_UNAVAILABLE` state, CRITICAL/MAJOR risk) belum dikerjakan — menunggu keputusan lanjutan user.

## 2026-09-12 — Audit "Design System Token Drift": hapus 84 dead design token (71% dari total)

- **Konteks:** audit §12/§13 menandai design token drift ("Multiple aliases create drift") sebagai temuan MODERATE. Investigasi awal sesi ini (saat menjawab pertanyaan user soal audit) sudah mengonfirmasi `main.css` punya alias berlapis (`--bg`/`--bg-primary`/`--bg-main`/dst semua ke nilai hitam nyaris identik). Ketimbang mencoba "menggabungkan" token yang AKTIF dipakai (berisiko visual kalau nilainya ternyata beda tempat), saya ukur dulu skala nyata masalahnya.
- **Temuan kuantitatif**: dari **118 token CSS custom property** yang didefinisikan di `:root`, **84 (71%) sama sekali tidak pernah dipakai** di manapun — bukan di CSS manapun, bukan di `public/index.html`, bukan di JS manapun (dicek 3 pola: `var(--token)`, `getPropertyValue`/`setProperty` dengan nama variabel dinamis dari pemanggil helper `_intelChartColor()`, dan string literal `'--token'` tanpa `var()`). Contoh: `--bg-primary`, `--text-primary`, `--surface-hover`, `--icon-primary`, `--button-primary-bg`, `--semantic-success`, `--neon-*` (6 varian), `--action-*` (4 varian), dll.
- **Kenapa dihapus, bukan digabung**: token yang benar-benar 0 pemakaian adalah kasus PALING AMAN untuk dibersihkan — menghapus definisi CSS custom property yang tidak direferensikan di manapun tidak bisa mengubah rendering apapun (secara matematis tidak ada elemen yang bisa terpengaruh). Ini beda dengan 34 token yang MASIH dipakai (`--bg`, `--text`, `--accent`, `--green`, dst) — itu tetap dipertahankan apa adanya, TIDAK disentuh, karena konsolidasi token aktif butuh verifikasi nilai sama persis di setiap titik pakai (risiko visual nyata, di luar cakupan pembersihan kali ini).
- **Perbaikan (`public/css/main.css`)**: hapus 84 deklarasi token mati dari blok `:root` (dark theme) DAN blok `body.theme-light` (light theme) — total 155 baris deklarasi terhapus (84 dari `:root`, 71 dari `body.theme-light` — beberapa token dark-mode tidak punya pasangan light-mode karena memang tidak color-scheme-dependent, seperti `--radius-sm`, `--glow-*`, `--bb-orange`, `--tv-buy`). Cache-bust `main.css` → `?v=20260912b`.
- **Live verification (Playwright, server lokal)**: screenshot dashboard di dark theme DAN light theme (`body.classList.add('theme-light')`) — keduanya tampil normal, tidak ada elemen rusak/warna hilang. `getComputedStyle` mengonfirmasi token yang MASIH dipakai (`--bg`, `--text`, `--accent`, `--green`) tetap resolve ke nilai yang benar di light theme; token yang dihapus (`--bg-primary`) sekarang benar-benar mengembalikan string kosong (bukti penghapusan berhasil, bukan cuma di-nonaktifkan).

`npm test` (154/154), `npm run lint` bersih.

**Catatan jujur**: ini BUKAN "konsolidasi design token" seutuhnya seperti direkomendasikan audit — 34 token yang MASIH aktif dipakai (termasuk alias yang berpotensi tumpang tindih seperti `--text`/`--text2`/`--text3` — ini BUKAN duplikat, tapi 3 level abstraksi warna teks yang berbeda dan memang dipakai berbeda-beda) tidak disentuh sama sekali. Yang dikerjakan murni penghapusan dead code — langkah paling aman dan paling terverifikasi dari seluruh rangkaian "design token cleanup" yang disebut audit.

## 2026-09-13 — AI Paper Trading: notifikasi browser saat open & exit posisi

- **Konteks:** permintaan user — saat AI Autonomous Trading (paper trading) membuka atau menutup posisi, ini perlu bisa "dipantau segera" (mis. tab tidak sedang aktif), bukan cuma `showToast()` in-app yang hilang begitu tab berpindah.
- **Temuan:** helper reusable `window.mwSendBrowserNotification(title, body, tag)` (`public/js/30-price-alerts.js`) sudah ada dan sudah dipakai untuk kasus lain di file yang sama (hipotesis BUY baru, `38-ai-autonomous-trading.js:771`) — no-op aman kalau `Notification` API tidak didukung atau izin belum granted, jadi tidak butuh perubahan apapun di helper-nya sendiri.
- **Perbaikan (`public/js/38-ai-autonomous-trading.js`)**: tambah pemanggilan `mwSendBrowserNotification()` di 2 titik:
  1. `aiOpenPositionFromSignal()` — setelah posisi berhasil dibuka: judul "🟢 Posisi Dibuka: {ticker}", isi jumlah lot + harga entry + besaran risiko 1%. Ini SATU-satunya fungsi open-position nyata; `aiOpenPositionFromHypothesis()` mendelegasikan ke fungsi ini juga, jadi kedua jalur (dari Scanner maupun dari Hypothesis Lab) otomatis tercakup tanpa duplikasi.
  2. `aiClosePosition()` — setelah posisi ditutup (SL/TP/manual/exit-hipotesis, semua jalur closing memanggil fungsi tunggal ini): judul "🟢/🛑 Posisi Ditutup: {ticker}" (emoji mengikuti tanda `netPnL` SETELAH pajak & komisi, bukan sekadar entry vs exit price), isi harga exit + alasan + PnL Rp & %.
- **Live verification (Playwright, server lokal)**: mock `window.Notification` (capture instance + permission granted), seed sinyal BUY sintetis di `AI_UNIVERSE`, panggil `aiOpenPositionFromSignal('TESTX')` lalu `aiClosePosition()` langsung dari pipeline asli (bukan mock parsial). Hasil: notifikasi "🟢 Posisi Dibuka: TESTX" (150 lot @ Rp 1.000, risiko 1%) dan "🛑 Posisi Ditutup: TESTX" (PnL -Rp 30.000/-0.2% — negatif walau harga exit lebih tinggi dari entry, karena biaya transaksi riil ikut dihitung — mengonfirmasi emoji berbasis PnL bersih, bukan harga mentah) berhasil terbentuk tanpa `pageerror`.

`npm test` (semua bagian tetap ALL PASSED, tidak ada regresi), `npm run lint` bersih.

**Catatan jujur**: ini menambah notifikasi untuk 2 event (open & exit) sesuai permintaan eksplisit user — TIDAK menambah notifikasi untuk event lain yang mungkin juga relevan (mis. SL/TP nyaris tersentuh, risk gate menolak posisi, atau hipotesis baru — yang terakhir sudah lebih dulu ada). Notifikasi hanya muncul kalau user sudah memberi izin `Notification` browser (via alur permintaan izin yang sudah ada di halaman Price Alerts) — kalau belum, perilaku diam-diam fallback ke toast in-app saja seperti sebelumnya, tidak ada perubahan perilaku untuk user yang belum mengaktifkan izin.

## 2026-09-13 — Font chart tidak terlihat di tema gelap (kontras rendah)

- **Konteks:** user mengirim 3 screenshot chart (Ranking/Big Money Scanner, Trend Historis EPS & PER + Equity & Net Income di Valuation, Proyeksi Dividen 5 Tahun) yang font axis/legend-nya sulit terbaca di tema gelap.
- **Root cause:** ketiga chart memakai warna teks HARDCODED yang tidak theme-aware DAN kontrasnya rendah:
  - `07-flowscan.js` (rk-chart, Big Money Scanner Ranking): `#4a5e82` — biru-abu gelap, kontras sangat rendah di atas background hitam.
  - `10-hargawajar.js` (hw-history-chart-eps/eq, Valuation): `#b8bdd4` dengan `font-family:'Menlo'` (font yang bahkan tidak dipakai di tempat lain aplikasi ini — seluruh app pakai `--font-mono` = Fira Code/Public Sans).
  - `04-render.js` (divProjChart, Proyeksi Dividen): pakai `TC` global (`03-engine.js`) — `#8a90ad`, juga `font-family:'Menlo'`.
  - Ketiganya warna TETAP (bukan CSS var), jadi kalau user pindah ke tema terang, warna abu-gelap yang sama justru jadi kontras TERLALU RENDAH juga di atas background putih — bukan cuma masalah tema gelap.
- **Perbaikan**:
  - Tambah helper `_chartTextColor(varName, fallback)` di `03-engine.js` (dekat definisi `TC`/`GC` yang sudah ada) — canvas tidak bisa baca `var(--x)` langsung, jadi resolve nilai CSS custom property yang sesungguhnya lewat `getComputedStyle` setiap kali chart dibangun ulang (semua chart di app ini memang di-destroy & dibuat ulang total setiap kunjungan halaman — perf fix 2026-09-11 — jadi warna selalu ter-refresh sesuai tema aktif tanpa kerja tambahan).
  - `07-flowscan.js`, `10-hargawajar.js`, `04-render.js`: ganti warna axis-tick & legend hardcoded di 3 chart tsb ke `_chartTextColor('--text2', '#D2D8DF')` (token yang sudah dipakai luas untuk teks sekunder yang tetap harus terbaca, kontras tinggi di kedua tema: `#D2D8DF` gelap / `#354453` terang) + `font-weight:'bold'` + font-family diseragamkan ke `'"Fira Code","Public Sans",monospace'` (font asli aplikasi, bukan Menlo).
  - **Cakupan disengaja dibatasi** ke 3 chart yang dikirim user saja — TIDAK mengubah `TC` global di `03-engine.js` (dipakai banyak chart lain di luar 3 screenshot ini; mengubahnya akan memperluas blast radius jauh di luar yang diminta) — untuk `divProjChart` dibuat tick style lokal terpisah (`divProjTick`) alih-alih menimpa `TC` global.
  - Cache-bust: `03-engine.js?v=20260913a`, `04-render.js?v=20260913a`, `07-flowscan.js?v=20260913a`, `10-hargawajar.js?v=20260913a`.
- **Live verification (Playwright, server lokal)**: Chart.js sendiri dimuat dari CDN (`cdnjs.cloudflare.com`) yang diblokir sandbox ini (`net::ERR_TUNNEL_CONNECTION_FAILED` — kegagalan jaringan sandbox kategori A, bukan bug kode) — di-stub minimal (`window.Chart` palsu yang menyimpan `config`/`options` tanpa render sungguhan) supaya kode pembangun chart aplikasi tetap bisa dieksekusi & diperiksa configny. Hasil: ketiga chart (`fsRenderRanking()`, `hw_renderChart()`, `renderDividen()`) menghasilkan `ticks.color`/`legend.labels.color` = `#D2D8DF` di tema gelap dan `#354453` di tema terang (cocok persis dengan `--text2` di `main.css`), `font.weight:'bold'`, `font.family` konsisten Fira Code/Public Sans — dikonfirmasi berubah otomatis saat `body.theme-light` di-toggle, tanpa `pageerror`.

`npm test` (semua bagian tetap ALL PASSED), `npm run lint` bersih.

**Catatan jujur**: perbaikan ini HANYA menyentuh 3 chart yang dikirim user (Ranking Big Money Scanner, EPS/PER & Equity/Net Income di Valuation, Proyeksi Dividen 5 Tahun) — bukan audit/perbaikan menyeluruh semua ~51 instance Chart.js di aplikasi ini. Warna `TC` global dan chart lain yang memakainya (dipakai luas di `04-render.js`, `11-quant.js`, dll — beberapa juga memakai hex serupa `#8a90ad`) TIDAK disentuh; kalau ada chart lain yang juga dilaporkan sulit terbaca, perlu permintaan/laporan terpisah untuk cakupannya.

## 2026-09-13 — Font chart tidak terlihat (lanjutan): sisa chart lain dengan warna serupa

- **Konteks:** setelah PR font-chart sebelumnya (3 chart spesifik), user minta cek chart LAIN yang pakai warna serupa (`#8a90ad`, `#555d6e`, `#4a5e82`, `#6b6b8a`, `#b8bdd4` + font `Menlo`).
- **Audit menyeluruh** (grep semua `ticks:{color:...}`/`labels:{color:...}` hardcoded di `public/js/`) menemukan pola yang sama dipakai di ~15 chart tambahan lintas 6 file:
  - **`TC` global** (`03-engine.js`) — dipakai via `ticks:TC`/`Object.assign({},TC,...)` di: `03-engine.js` (chart distribusi return), `04-render.js` (chart Dividen per Tahun & per Saham), `05-assets.js` (chart harga Crypto), `06-analysis-router.js` (chart Corporate Action Decision Simulator: signal & equity), `09-divinvest.js` (2 chart proyeksi dividen investasi).
  - **Chart lain dengan hex terpisah (tidak lewat `TC`)**: `07-flowscan.js` (5 chart FlowScan detail: Price/Volume/CMF/NetFlow/RSI via `TC2`, + chart VWAP+Bands), `11-quant.js` (9 chart: Backtester Equity & Drawdown, Factor Heatmap Distribution, Monthly Returns Avg & Win-Rate, Pairs Trading Z-Score & Price), `20-wealth.js` (2 chart: Net Worth History, Proyeksi Kekayaan FIRE), `21-performance.js` (4 chart: Equity Curve, Benchmark vs IHSG, Trading Activity, Tax Drag per Bulan).
  - Ditemukan juga **1 kasus baru di luar pola axis/legend**: `_centerTextPlugin` (`03-engine.js`) — plugin custom untuk menulis teks di tengah donut chart (dipakai chart "Alokasi Sektor") — baris subteks-nya pakai `ctx.fillStyle='#8a90ad'` + font Menlo hardcoded, sama persis masalahnya walau bukan lewat konfigurasi `ticks`/`legend` biasa.
- **Perbaikan**:
  - **`TC` global** (`03-engine.js`) diupgrade langsung: `color` → `_chartTextColor('--text2', ...)` (dievaluasi ulang saat script parse, lalu di-mutate ulang oleh `toggleTheme()` DAN startup-load-preference block di `index.html` — karena `TC` adalah objek shared yang direferensikan langsung (`ticks:TC`) oleh banyak chart, mutasi `TC.color` di 2 titik itu otomatis membuat SEMUA chart yang memakainya (di 6 file) langsung theme-reactive tanpa perlu resolve ulang di tiap chart). Ini otomatis memperbaiki 8 chart di 5 file tanpa menyentuh konfigurasi masing-masing.
  - Chart yang TIDAK lewat `TC` diperbaiki manual satu-satu dengan pola identik (`_chartTextColor('--text2','#D2D8DF')` + `font-weight:'bold'` + font-family Fira Code/Public Sans), termasuk `_centerTextPlugin`.
  - Cache-bust: `03-engine.js?v=20260913b`, `07-flowscan.js?v=20260913b`, `11-quant.js?v=20260913a`, `20-wealth.js?v=20260913a`, `21-performance.js?v=20260913a`.
- **Live verification (Playwright, server lokal, Chart.js di-stub karena CDN diblokir sandbox)**:
  - `TC.color` dikonfirmasi `#D2D8DF` (gelap) → berubah otomatis jadi `#354453` setelah memanggil `toggleTheme()` sungguhan milik aplikasi (bukan simulasi manual) — membuktikan mutasi reaktif bekerja persis seperti dirancang.
  - `fsRenderCharts()` (5 chart FlowScan detail) dan `fsRenderVWAP()` dipanggil langsung dengan kanvas & data disuntik — semua chart menghasilkan `color:#D2D8DF`/`weight:'bold'` tanpa error.
  - `mrRender()` (Monthly Returns, `11-quant.js`) dikonfirmasi sama.
  - Sisa chart (`04-render.js`/`05-assets.js`/`06-analysis-router.js`/`09-divinvest.js` via `TC`, serta beberapa chart lain di `11-quant.js`/`20-wealth.js`/`21-performance.js`) TIDAK diverifikasi individual via render langsung (butuh state/DOM tiap halaman yang berbeda-beda) — kebenarannya disimpulkan dari: (a) pola kode identik dengan yang sudah diverifikasi berulang kali, (b) untuk yang lewat `TC`, mekanisme mutasi `TC.color` sudah dibuktikan bekerja di atas, (c) grep memastikan tidak ada lagi hex bermasalah tersisa.

`npm test` (154/154), `npm run lint` bersih.

**Temuan tambahan yang SENGAJA TIDAK diperbaiki (dilaporkan, bukan dieksekusi)**: ditemukan chart lain (`24-stockmaster.js`, `37-tradewave-engine.js`, `43-ai-chart-intelligence.js`, `36-crypto-technical.js`, `41-stockchat-cockpit.js`) yang memakai warna BERBEDA (`#94A3B8`/`#8fa3c8`/`#a8a8c8` — bukan bagian dari palet yang dikeluhkan) dengan kontras cukup baik di tema gelap (~8:1, jauh di atas ambang WCAG AA 4.5:1) — TAPI warna ini statis (bukan CSS variable), sehingga kontrasnya dihitung BURUK di tema terang (~2.5:1, di bawah ambang AA). Ini bug yang secara struktur SAMA (chart text tidak theme-aware) tapi gejalanya BEDA (bermasalah di tema terang, bukan gelap) dan warnanya BUKAN "serupa" secara harfiah dengan yang dilaporkan user — jadi TIDAK disertakan dalam perbaikan ini tanpa konfirmasi eksplisit user terlebih dahulu.

## 2026-09-13 — Modal "Buat Investment Thesis Baru": layout rusak (class CSS tidak pernah didefinisikan)

- **Konteks:** user kirim screenshot modal "Buat Investment Thesis Baru" (Decision Tools) — card terlihat kecil/berantakan, label sebaris dengan input, textarea "Why I Bought" tampak kecil melayang di kanan, field "Invalidation Criteria" terpotong.
- **Root cause**: form modal ini (`openNewThesisModal()`, `public/js/28-decisiontools.js`) memakai class `form-group`, `flbl`, `fin` — DICEK dan **tidak satupun pernah didefinisikan di `main.css`** (0 hasil grep, kecuali override tema-terang untuk `.fin` yang juga tidak berguna karena base-nya tidak ada). Akibatnya semua elemen form jatuh ke tampilan default browser polos: `<textarea>` default kecil (intrinsik ~20 kolom) tidak mengisi lebar, `<label>` inline sejajar dengan input alih-alih di atasnya, tanpa padding/border/warna konsisten dengan tema aplikasi.
  - Class yang BENAR dan SUDAH terstyle penuh di `main.css` (dipakai luas di modal lain seperti Price Alert, `30-price-alerts.js`): `.fgrid` (grid 2 kolom, gap 10px), `.fg` (flex column, label di atas input), `.ffull` (span 1 kolom penuh untuk field lebar), `.flabel` (label uppercase kecil, warna muted), `.finput` (input/select/textarea gelap, border, radius 6px, `width:100%`, efek fokus).
  - Ditemukan **2 modal lain di file yang sama** dengan bug identik: `openNewJournalModal()` (Trading Journal — 8 field) dan input chat Copilot (`copilot-prompt-input`) — dibersihkan sekaligus karena persis pola & penyebab yang sama.
- **Perbaikan (`public/js/28-decisiontools.js`)**: ganti seluruh `form-group`/`flbl`/`fin` di 3 lokasi menjadi `.fgrid`/`.fg`(`.ffull` untuk field lebar penuh)/`.flabel`/`.finput` — TIDAK membuat class CSS baru, murni memakai sistem desain yang sudah ada. Hanya markup HTML yang di-generate JS yang berubah; ID field & `saveNewThesisFromModal()`/`saveNewJournalFromModal()` tidak disentuh sama sekali.
  - Cache-bust: `28-decisiontools.js?v=20260913a`.
- **Live verification (Playwright, server lokal)**: `openNewThesisModal('BBCA')` dipanggil langsung — konfirmasi `#th-in-ticker`/`#th-in-why` sekarang berclass `finput` dan lebarnya 485.76px (mengisi penuh area konten modal 537.6px dikurangi padding), bukan lagi ukuran intrinsik kecil. Screenshot dikirim ke user menunjukkan layout rapi: label uppercase di atas tiap field, semua input/textarea selebar kolomnya, tombol Batal/Simpan sejajar kanan-bawah. Tanpa error konsol.

`npm test` (154/154), `npm run lint` bersih.

**Catatan**: perbaikan ini murni penggantian class CSS ke yang sudah established — TIDAK mengubah lebar modal itu sendiri (`.modal{width:560px}`, standar di SELURUH app) karena masalah sebenarnya bukan container-nya, melainkan field di dalamnya yang tidak ter-styling sama sekali.

## 2026-09-13 — Donut "Alokasi Portofolio" nilainya beda dengan "Total Equity"

- **Konteks:** user melaporkan (screenshot) nilai di tengah donut "Alokasi Portofolio" (Rp 491.9Jt) berbeda dengan "Total Equity" (Rp 505.2Jt) di kartu sebelahnya, padahal seharusnya sama.
- **Root cause**: `perfRenderAllocation()` (`public/js/21-performance.js`) menghitung `total` HANYA dari `getPortfolio()` (posisi saham IDX saja, dari `transactions[]`) — diam-diam TIDAK menghitung saldo kas RDN, crypto, ETF, atau reksadana. Sementara "Total Equity" (`computeCurrentAUM()`, `03-engine.js`) sengaja menjumlahkan SEMUA kelas aset: saham + crypto + ETF + reksadana + saldo kas RDN. Ini bukan kesalahan hitung, tapi cakupan data yang beda — namun UI-nya (judul "Alokasi Portofolio", bukan "Alokasi Saham") menyiratkan seharusnya mewakili seluruh portofolio.
- **Keputusan user**: ditanya via `AskUserQuestion` — pilih opsi tambahkan slice "Kas & Aset Lain" ke donut (bukan sekadar ganti label jadi "Alokasi Saham") supaya kedua angka SELALU sama persis.
- **Perbaikan (`public/js/21-performance.js`, `perfRenderAllocation()`)**:
  - Setelah menghitung `items` (per-saham atau per-sektor, tidak diubah), hitung `crMV`/`etfMV`/`rdMV`/`rdnBal` dengan LOGIKA PENJUMLAHAN YANG SAMA PERSIS dengan `computeCurrentAUM()` (`getCryptoPortfolio()`, `getEtfPortfolio()`, `getRdPortfolio()`, `calcRdnBalance('all')`) — sengaja disamakan supaya kedua angka tidak pernah divergen lagi ke depannya.
  - Kalau totalnya (`otherTotal`) > 0, push satu item `{label:'Kas & Aset Lain', val:otherTotal, color:'#6b7280'}` (satu kategori gabungan, BUKAN dipecah per jenis aset — karena mode "Sektor" tidak relevan untuk kas/crypto/ETF/RD), lalu re-sort supaya urutan tetap besar→kecil.
  - `total` sekarang dihitung dari `items.reduce(...)` (termasuk slice baru) — dijamin identik dengan `computeCurrentAUM()` karena memakai fungsi sumber yang sama persis.
  - Sub-label pusat donut ("23 posisi") ditambah keterangan "+ kas/lainnya" kalau slice tersebut muncul, supaya user tahu kenapa ada kategori tambahan.
  - Cache-bust `21-performance.js` → `?v=20260913b`.
- **Live verification (Playwright, server lokal, Chart.js di-stub karena CDN diblokir sandbox)**: seed transaksi sintetis (BBCA+BBRI) + saldo RDN sintetis, panggil `computeCurrentAUM()` dan `perfRenderAllocation('saham')` langsung. Hasil: `computeCurrentAUM()` = Rp 39.1Jt, total dataset donut = Rp 39.1Jt — **identik**. Legend menampilkan "Kas & Aset Lain" (51.7%), BBCA (24.3%), BBRI (24.0%) — total 100%, terurut besar→kecil. Tanpa error.

`npm test` (154/154), `npm run lint` bersih.

**Catatan**: mode "Sektor" pada donut yang sama otomatis ikut diperbaiki (kode dibagikan, bukan cabang terpisah) — slice "Kas & Aset Lain" akan muncul di kedua mode toggle "Saham"/"Sektor" kalau user punya saldo kas/crypto/ETF/RD.

## 2026-09-13 — Shadow card tidak konsisten (Tahap 1: dashboard "Kelas Aset")

- **Konteks:** user kirim screenshot halaman "Kelas Aset" (Dashboard) di tema terang — minta semua card dibuat desain shadow yang sama, dijalankan bertahap.
- **Root cause**: sistem shadow card yang benar SUDAH ada dan sudah dipakai luas — `.card` di `main.css` punya `box-shadow:0 4px 16px rgba(0,0,0,.35)` (gelap) dan `body.theme-light .card{box-shadow:0 2px 8px rgba(0,0,0,.04)}` (terang, `!important`, jauh lebih halus/sesuai untuk background putih). Masalahnya: 2 card di Dashboard section "Kelas Aset" (`#card-portfolio-volatility` "Volatilitas & Risiko" dan card "Komposisi & Alokasi Aset") ditulis sebagai `<div>` polos TANPA `class="card"` — shadow-nya di-hardcode langsung di inline `style="...box-shadow:0 4px 16px rgba(0,0,0,0.35)..."`. Karena elemen ini tidak match selector CSS manapun (`.card`/`.metric`/`.glass-panel`/dst), aturan tema-terang TIDAK PERNAH kena — kedua card ini tetap memakai shadow gelap yang sama keras di SEMUA tema, beda dengan card lain di sekitarnya (mis. "Ringkasan Aset" di atasnya) yang otomatis melembut di tema terang.
- **Perbaikan (`public/index.html`)**: tambah `class="card"` ke kedua `<div>` tsb, lalu hapus properti inline yang jadi redundan (background/border/box-shadow/transition border-color — semua sudah disuplai `.card`), TAPI tetap pertahankan properti yang MEMANG perlu beda dari default `.card` (border-radius 12px vs `var(--radius)`=8px, padding seragam 16px vs `.card`-nya 16px 18px, `display:flex;flex-direction:column;gap:...` untuk layout internal) — inline style non-`!important` masih menang atas rule class biasa, jadi ini aman.
- **Live verification (Playwright, server lokal)**: `getComputedStyle(volCard).boxShadow` dibandingkan dengan `.card` lain yang tidak disentuh — hasilnya **identik** di kedua tema (`rgba(0,0,0,.35) 0px 4px 16px 0px` gelap, `rgba(0,0,0,.04) 0px 2px 8px 0px` terang). Radius (12px) dan padding (16px) dikonfirmasi tetap seperti semula (tidak ada regresi layout). Screenshot tema terang: ketiga card ("Ringkasan Aset", "Volatilitas & Risiko", "Komposisi & Alokasi Aset") sekarang tampil dengan shadow yang sama-sama halus dan konsisten.

`npm test` (154/154), `npm run lint` bersih. Tidak ada cache-bust karena tidak ada file `.js` yang berubah (murni `index.html`).

**Catatan — ini BARU Tahap 1**: perbaikan ini hanya menyentuh 2 card yang ditunjukkan user di screenshot ("Kelas Aset"). Kemungkinan besar masih ada card/panel lain di aplikasi (terutama di Dashboard, yang paling banyak memakai inline style custom seperti `.asset-card` untuk card SAHAM/CRYPTO/ETF/RD di baris `dash-assetclass-row`) yang punya pola serupa (box-shadow hardcoded di luar sistem `.card`) — belum diaudit/disentuh di tahap ini, menunggu tahap berikutnya sesuai arahan "jalankan bertahap".

## 2026-09-13 — Standardisasi shadow card (Tahap 2): hover 4 card shortcut mati di tema terang

- **Konteks:** lanjutan Tahap 1 (standardisasi shadow "Kelas Aset"). Audit lanjutan menemukan 4 card shortcut Dashboard (`card-landing-stock`/`-crypto`/`-fund`/`-etf` — Saham/Crypto/Reksadana/ETF, class `asset-card card-blue/green/purple/red`).
- **Temuan LEBIH SERIUS dari yang diduga awal** — bukan cuma soal konsistensi kosmetik, tapi FUNGSIONAL: keempat card ini sudah punya `class="asset-card"` (jadi shadow RESTING-STATE-nya sudah otomatis benar/konsisten lewat `body.theme-light .asset-card{box-shadow:...!important}`, tidak seperti Tahap 1). Masalahnya ada di efek HOVER — sebelumnya diimplementasikan lewat `onmouseover`/`onmouseout` inline JS yang men-set `this.style.boxShadow` ke warna glow (biru/hijau/ungu/merah). Karena rule `!important` dari Tahap 1 (`body.theme-light .asset-card`) menimpa APAPUN yang dipaksa lewat inline style JS juga, di tema terang efek hover ini **MATI TOTAL** — box-shadow tetap diam di `rgba(0,0,0,.04)` resting-state, padahal user sedang hover. Dikonfirmasi lewat Playwright: `getComputedStyle` sebelum/saat/sesudah hover IDENTIK di tema terang (tidak ada perubahan sama sekali), sementara di tema gelap perubahan warna terjadi normal.
- **Perbaikan**:
  - `public/css/main.css`: tambah rule CSS `:hover` yang benar (`.asset-card.card-blue:hover{box-shadow:...!important;border-color:...!important}` dst untuk 4 warna) — spesifisitasnya (3 class-level selector) otomatis mengalahkan `body.theme-light .asset-card` (2 class + 1 elemen), dipertegas `!important` eksplisit. `.asset-card:hover{transform:translateY(-2px)}` juga dipindah ke CSS.
  - `public/index.html`: hapus `onmouseover`/`onmouseout` inline dari keempat card (sumber bug + sekarang redundan).
  - Class `.card-blue`/`.card-green`/`.card-purple`/`.card-red` sebelumnya SUDAH ada di markup tapi 0 definisi CSS (dead classnames) — sekarang benar-benar dipakai.
- **Live verification (Playwright, server lokal, hover sungguhan via `page.hover()` + tunggu transisi 0.2s selesai)**: keempat card, kedua tema — hover sekarang menghasilkan `box-shadow` warna yang BENAR dan IDENTIK antara tema gelap & terang (`rgba(37,99,235,.25) 0 8px 24px` biru, hijau/ungu/merah serupa), `border-color` berubah sesuai `var(--accent)`/`var(--green)`/`var(--purple)`/`var(--red)` per tema, dan kembali ke shadow resting-state yang benar (0.35 gelap / 0.04 terang) setelah mouse keluar. Screenshot dikirim ke user.

`npm test` (154/154), `npm run lint` bersih. Tidak ada cache-bust (tidak ada file `.js` yang diubah).

**Catatan**: masih ada kemungkinan card/panel lain dengan pola serupa di luar area Dashboard yang sudah diaudit (Tahap 1+2). Menunggu arahan lanjutan untuk Tahap 3 kalau diperlukan.

## 2026-09-13 — Standardisasi shadow card (Tahap 3): 7 card Dashboard lain + 2 temuan tambahan

- **Konteks:** lanjutan Tahap 1-2. Audit lebih luas ke seluruh `index.html` dan file JS untuk pola bug yang sama (div "card" tanpa `class="card"`, shadow hardcoded).
- **Temuan & perbaikan**:
  1. **7 card Dashboard lain** (`public/index.html`) dengan pola bug PERSIS SAMA Tahap 1 — div polos tanpa `class="card"`, shadow hardcoded `0 4px 20px rgba(0,0,0,0.35)` (variasi 20px, bukan 16px seperti Tahap 1, tapi bug-nya identik): `#card-dash-regime` (Kondisi Market), `#card-manage-asset` (Ringkasan Aset), `#card-dash-radar` (AI Opportunity Radar), `#card-dash-heatmap` (Market Heatmap), `#card-dash-smartflow` (Smart Money Flow), `#card-dash-insight` (Sector Insight), `#card-dash-alerts` (Alerts). Diperbaiki dengan pola sama: tambah `class="card"`, hapus properti redundan, pertahankan border-radius/padding/layout yang memang beda dari default `.card`.
  2. **`27-stockintel.js`** — "ZERO-STATE COMPLIANCE WARNING CARD" (kartu peringatan saat ticker non-IDX dicari di Stock Intelligence Cockpit) — pola bug sama (tanpa `class="card"`, shadow hardcoded `0 8px 30px rgba(0,0,0,0.5)`). Diperbaiki sama; border merah (penanda warning) sengaja dipertahankan inline.
  3. **`33-trending-news.js`** — card "Top 3 Trending Financial News" (state sukses/loaded) SUDAH punya `class="card"` tapi punya box-shadow inline sendiri (`0 4px 20px rgba(0,0,0,.25)`) yang menimpa shadow standar `.card` DI TEMA GELAP SAJA (tema terang tetap benar karena override `!important` menimpa juga nilai inline ini). Dihapus supaya benar-benar identik di kedua tema.
- **Yang SENGAJA TIDAK disentuh** (dicek, bukan "card", beda kategori UI): elemen `box-shadow` di `settings-hub-modal`, `32-pdf-reports.js`, `42-dividend-calendar.js`, `40-idx-pipeline.js` (semua MODAL/dialog, bukan card konten — shadow besar untuk modal memang wajar berbeda dari card); toast notification di `30-price-alerts.js`/`03-engine.js` (elemen transient, bukan card persisten); inset progress-bar di `34-ksei-shareholders.js` (`box-shadow:inset...` — dekorasi bar, bukan card); `27-stockintel.js:1104` (card modal-like 680px dengan shadow lebih kuat — sengaja dibiarkan, tampak seperti elevasi modal yang disengaja, bukan card dashboard biasa).
- **Live verification (Playwright, server lokal)**:
  - 7 card Dashboard: `getComputedStyle().boxShadow` ketujuhnya **identik** dengan `.card` standar di kedua tema (gelap `rgba(0,0,0,.35) 0 4px 16px`, terang `rgba(0,0,0,.04) 0 2px 8px`). Screenshot dashboard lengkap dicek, tidak ada regresi layout.
  - Zero-state warning card (`27-stockintel.js`): dipicu dengan `MW_SELECTED_INTEL_TICKER='AAPL'` (non-IDX) lalu `renderStockIntelPage()` — shadow terkonfirmasi identik `.card` standar di kedua tema.
  - Trending news card (`33-trending-news.js`): **TIDAK bisa diverifikasi end-to-end via render nyata** — container `#dash-trending-news-container` yang dibutuhkan `renderTrendingNews()` tidak ditemukan di `index.html` manapun (fitur ini tampaknya belum ter-mount di UI yang aktif saat ini). Perbaikan ini hanya diverifikasi lewat pembacaan kode (properti yang dihapus murni redundan/konflik, tidak dipakai di tempat lain) + `node -c` syntax check — TIDAK ada verifikasi visual langsung.

`npm test` (154/154), `npm run lint` bersih. Cache-bust: `27-stockintel.js?v=20260913a`, `33-trending-news.js?v=20260913a`.

**Catatan**: dengan Tahap 1-3, seluruh card Dashboard yang teridentifikasi lewat audit sistematis (grep `box-shadow:` di `index.html` + `public/js/`) sudah konsisten. Kemungkinan MASIH ada pola serupa yang tidak tertangkap pola grep spesifik ini (mis. shadow dengan nilai rgba yang sedikit berbeda lagi) — kalau user menemukan card lain yang masih terlihat beda, laporkan untuk Tahap 4.

## 2026-09-13 — Standardisasi shadow card (Tahap 4): Crypto Radar Banner + Dividend Calendar

- **Konteks:** lanjutan Tahap 1-3. Audit komprehensif ulang seluruh `box-shadow:` di `public/js/` untuk sisa pola bug.
- **Temuan & perbaikan**:
  1. **`05-assets.js`** — `renderCryptoRadarBanner()` ("Radar Sinyal Teknikal & Whale Flow Crypto", halaman Crypto Portfolio) — div polos tanpa `class="card"`, shadow hardcoded `0 4px 20px rgba(0,0,0,0.15)`, pola bug identik Tahap 1/3.
  2. **`42-dividend-calendar.js`** — `renderDividendCalendarComponent()` (card ringkasan Passive Income di atas Kalender Dividen) — SUDAH `class="card"` tapi punya box-shadow inline sendiri (`0 10px 25px -5px rgba(0,0,0,0.1)`) yang menimpa standar `.card` di tema GELAP saja (tema terang tetap benar via `!important`) — pola sama dengan `33-trending-news.js` yang diperbaiki di Tahap 3. Border hijau + gradient (aksen highlight yang disengaja) tetap dipertahankan, hanya box-shadow yang dihapus.
- **Yang DIVERIFIKASI ULANG dan tetap DIBIARKAN** (dari sisa audit): `27-stockintel.js` card modal-like 680px (`.card` di dalam `overlay.className='overlay on'`, `overlay.onclick` untuk tutup via backdrop) — dikonfirmasi ini SUNGGUH modal (bukan card dashboard biasa), shadow lebih kuat wajar untuk elevasi modal, konsisten dengan `.modal` class. `34-ksei-shareholders.js` (modal + inset progress bar), `42-dividend-calendar.js:830`/`32-pdf-reports.js`/`40-idx-pipeline.js` (semua modal), toast (`03-engine.js`/`30-price-alerts.js`), glow dot kecil di berbagai file, chat bubble di `41-stockchat-cockpit.js` — semua kategori UI berbeda dari "card", tidak disentuh.
- **Live verification (Playwright, server lokal)**: `renderCryptoRadarBanner([])` dan `renderDividendCalendarComponent()` dipanggil langsung — `getComputedStyle().boxShadow` kedua card **identik** dengan `.card` standar di kedua tema (gelap `rgba(0,0,0,.35) 0 4px 16px`, terang `rgba(0,0,0,.04) 0 2px 8px`), tanpa error.

`npm test` (154/154), `npm run lint` bersih. Cache-bust: `05-assets.js?v=20260913a`, `42-dividend-calendar.js?v=20260913a`.

**Status keseluruhan (Tahap 1-4)**: 11 card total diperbaiki (2+4hover+7+2) lintas Dashboard, Stock Intelligence, Crypto Portfolio, dan Dividend Calendar. Audit `box-shadow:` di seluruh `index.html` + `public/js/` sudah dua kali disisir; sisa kandidat yang teridentifikasi semuanya bukan "card" (modal/toast/glow/bubble/inset-bar) atau memang sengaja berbeda (elevasi modal). Kalau user masih menemukan card yang terlihat beda, laporkan untuk Tahap 5.

## 2026-09-13 — Tindak lanjut temuan chart font: warna statis `#94A3B8`/`#8fa3c8`/`#a8a8c8` (buruk di tema terang)

- **Konteks:** ini adalah temuan yang SUDAH dilaporkan (bukan dieksekusi) di entri audit font chart sebelumnya hari ini — 5 file memakai warna abu-abu statis untuk tick/legend chart yang kontrasnya bagus di tema gelap (~8:1) tapi buruk di tema terang (~2.5:1, di bawah ambang WCAG AA 4.5:1), karena warnanya di-hardcode, bukan CSS variable. User minta "perbaiki dulu semuanya" sambil menunggu kuota deploy Vercel pulih — dieksekusi sekarang sebagai kelanjutan otorisasi tersebut.
- **Root cause**: sama persis dengan seluruh perbaikan font chart hari ini (tick/legend Chart.js pakai hex statis alih-alih meresolusi `--text2` dari tema aktif) — hanya beda warna literal dan gejala (buruk di terang, bukan di gelap).
- **File & lokasi yang diperbaiki** (total 6 file, 12 titik konfigurasi chart):
  - `43-ai-chart-intelligence.js` — ticks x/y chart teknikal AI (`renderAiTechnicalWorkspaceUI`).
  - `24-stockmaster.js` — 3 chart (legend+ticks Overlay chart di `techRenderMainChart`; ticks 2 chart FlowScan sub — Net Vol & CMF — di `techRunFlowScanTab`).
  - `37-tradewave-engine.js` — fallback `tc` var, legend, ticks x/y chart TradeWave (`twMountWaveChart`).
  - `36-crypto-technical.js` — ticks x/y price chart & ticks volume chart (`drawNativeCryptoChart`).
  - `06-analysis-router.js` — legend labels chart Confluence Detector (`cdRenderCharts`) — ticks-nya sendiri sebenarnya SUDAH benar (pakai `TC`), hanya legend yang masih statis, terlewat di audit sebelumnya.
  - `20-wealth.js` — legend labels chart "Proyeksi Kekayaan (FIRE)" (`wProjRecalc`) — ticks-nya juga SUDAH benar dari perbaikan sebelumnya, hanya legend yang masih statis, terlewat di audit sebelumnya.
- **Perbaikan**: pola identik dengan perbaikan chart lain — ganti hex statis dengan `_chartTextColor('--text2','#D2D8DF')` (fallback dark) + `font-weight:'bold'`, memakai helper global yang sudah ada di `03-engine.js` (dimuat sebelum keenam file ini, jadi tidak perlu guard `typeof` kecuali `20-wealth.js` yang mengikuti pola guard yang sudah dipakai di file itu). Warna status/badge non-chart yang kebetulan memakai palet sama (`volBreakoutColor`/`whaleColor`/`signalColor` di `36-crypto-technical.js`, indikator sinyal di `04-render.js`/`07-flowscan.js`, `neuColor` di `24-stockmaster.js:1779`) **SENGAJA TIDAK disentuh** — itu bukan chart tick/legend, melainkan warna teks/badge UI yang cocok dipakai statis (bukan bug theme-awareness).
  - Cache-bust: `43-ai-chart-intelligence.js?v=20260913a`, `24-stockmaster.js?v=20260913a`, `37-tradewave-engine.js?v=20260913a`, `36-crypto-technical.js?v=20260913a`, `06-analysis-router.js?v=20260913a`, `20-wealth.js?v=20260913b`.
- **Live verification (Playwright, server lokal)**: grep ulang seluruh `public/js/` mengonfirmasi 0 sisa `#94A3B8`/`#8fa3c8`/`#a8a8c8` pada konfigurasi tick/legend chart manapun (sisa hit hanya warna status/badge non-chart, dikonfirmasi manual satu-satu). `_chartTextColor('--text2','--D2D8DF')` dikonfirmasi ulang bekerja reaktif (`#D2D8DF` gelap → `#354453` terang) tanpa error konsol. Fungsi chart individual (`twMountWaveChart`, `drawNativeCryptoChart`) berada dalam closure privat sehingga TIDAK bisa dipanggil langsung dari luar untuk render nyata via Playwright — kebenarannya disimpulkan dari: (a) pola kode identik dengan chart lain yang sudah diverifikasi berulang hari ini, (b) mekanisme `_chartTextColor` sudah dibuktikan bekerja, (c) `node -c` syntax check bersih di keenam file.

`npm test` (154/154), `npm run lint` bersih.

**Catatan**: dengan ini, SELURUH temuan chart-font yang teridentifikasi lewat 2 audit hari ini (grep pola bermasalah pertama + kedua) sudah ditangani, termasuk yang sebelumnya sengaja ditunda menunggu konfirmasi user.

## 2026-09-13 — Donut "Progres Pelunasan" & "Progres Penagihan" (Wealth) tidak punya outline seperti donut lain

- **Konteks:** user kirim screenshot halaman Net Worth (donut "Alokasi Aset" — punya garis pemisah tipis antar-slice) dibandingkan dengan halaman Debt ("Progres Pelunasan") dan Piutang ("Progres Penagihan") yang donutnya tampak solid/masif tanpa garis pemisah — melaporkan "outline tidak sesuai dengan donat chart lainnya".
- **Root cause**: `wRenderPayoffDonut()` (`public/js/20-wealth.js`) — fungsi shared yang dipakai OLEH KEDUA donut "Progres Pelunasan" (Debt) dan "Progres Penagihan" (Piutang) — konfigurasi dataset-nya memakai `borderWidth:0` (tanpa border sama sekali). Sementara donut "Alokasi Aset" di halaman yang sama (chart terpisah, `wCharts['alloc']`, baris ~271) memakai `borderColor:'rgba(19,19,31,.9)', borderWidth:2` — border gelap tipis inilah yang menciptakan efek "gap"/garis pemisah antar-slice yang membuatnya terlihat rapi dan konsisten dengan donut lain di seluruh app (Crypto/ETF/ Sektor, dst — semua memakai border serupa).
- **Perbaikan (`public/js/20-wealth.js`, `wRenderPayoffDonut()`)**: tambahkan `borderColor:'rgba(19,19,31,.9)', borderWidth:2` ke dataset — disamakan persis dengan pola donut "Alokasi Aset" di file yang sama. Karena `wRenderPayoffDonut()` dipakai bersama oleh 2 chart (Debt & Piutang), perbaikan ini otomatis berlaku ke keduanya sekaligus.
  - Cache-bust: `20-wealth.js?v=20260913c`.
- **Live verification (Playwright, server lokal, Chart.js di-stub karena CDN diblokir sandbox)**: seed data debt + piutang sintetis, panggil `wRenderDebt()` dan `wRenderPiutang()` langsung — konfigurasi dataset kedua chart (`w-debt-payoff-chart`, `w-piutang-collect-chart`) dikonfirmasi identik: `borderColor:'rgba(19,19,31,.9)'`, `borderWidth:2`, `cutout:'65%'` — sama dengan pola "Alokasi Aset". Tanpa error terkait perubahan ini.

`npm test` (154/154), `npm run lint` bersih.

**Catatan**: warna border ini masih hardcoded (sama seperti pola yang sudah dipakai "Alokasi Aset" sebelumnya) — bukan CSS-variable theme-aware. Ini konsisten dengan chart lain yang sudah ada (bukan regresi baru), jadi tidak diubah dalam perbaikan ini; kalau user melihat border-nya kurang pas di tema terang, itu layak dilaporkan sebagai temuan terpisah.

## 2026-09-13 — KOREKSI ARAH: donut "Alokasi Aset" yang seharusnya disamakan ke "Progres Pelunasan"/"Progres Penagihan" (bukan sebaliknya)

- **Konteks**: user mengoreksi perbaikan sebelumnya (entri di atas) — arah yang benar terbalik. Bukan "Progres Pelunasan"/"Progres Penagihan" yang perlu ditambah border supaya sama dengan "Alokasi Aset", melainkan **"Alokasi Aset" yang perlu dihapus border-nya** supaya sama dengan "Progres Pelunasan"/"Progres Penagihan".
- **Verifikasi arah yang benar**: audit ulang SELURUH donut chart di aplikasi (grep `type:'doughnut'` di seluruh `public/js/`) — mayoritas donut app (Crypto Portfolio, ETF Portfolio, Dashboard Portfolio, Performance Allocation) memakai `borderWidth:0` (tanpa border). Donut "Alokasi Aset" (`wRenderNet()`, chart `alloc`) justru yang MENYIMPANG dari standar mayoritas — satu-satunya (selain donut Sektor Dashboard yang punya alasan desain berbeda, dipakai bersama `_centerTextPlugin`) yang memakai `borderColor:'rgba(19,19,31,.9)', borderWidth:2`. Jadi standar app yang benar adalah TANPA border, dan "Progres Pelunasan"/"Progres Penagihan" (yang aslinya `borderWidth:0` sebelum entri di atas) sebenarnya sudah benar sejak awal — perbaikan sebelumnya salah arah.
- **Perbaikan**:
  1. `wRenderPayoffDonut()` (dipakai "Progres Pelunasan" & "Progres Penagihan") — **dikembalikan** ke `borderWidth:0` (revert dari perbaikan sebelumnya hari ini).
  2. Chart `alloc` di `wRenderNet()` ("Alokasi Aset") — border `rgba(19,19,31,.9)`/`borderWidth:2` **dihapus**, diganti `borderWidth:0` (+ `hoverOffset:6` ditambahkan untuk konsistensi UX hover dengan donut lain).
  - Cache-bust: `20-wealth.js?v=20260913d`.
- **Live verification (Playwright, server lokal, Chart.js di-stub karena CDN diblokir sandbox)**: `wRenderNet()`, `wRenderDebt()`, `wRenderPiutang()` dipanggil langsung — ketiga chart (`alloc`, `debtPayoff`, `piuCollect`) sekarang identik: `borderWidth:0`, tanpa `borderColor`. Tanpa error terkait perubahan ini.

`npm test` (154/154), `npm run lint` bersih.

## 2026-09-14 — Belum ada grafik IHSG di halaman "Market Pulse"

- **Konteks:** user melaporkan belum ada grafik IHSG di halaman "Market Pulse" (label sidebar untuk `renderDailyBriefPage()`, `28-decisiontools.js`), minta dibuat sederhana ala tampilan Yahoo Finance.
- **Root cause**: ditemukan data historis IHSG (`ihsgHist`, `01-data.js`) sebenarnya SUDAH ada dan aktif dikumpulkan secara live — `ihsgHistPush()` dipanggil setiap kali harga IHSG di-update (`03-engine.js`), menyimpan hingga 120 titik data terakhir ke `localStorage`. Tapi array ini TIDAK PERNAH divisualisasikan di manapun — hanya angka current/change (`ihsgCur`/`ihsgBase`) yang ditampilkan di kartu "MARKET REGIME HARI INI", tanpa grafik.
- **Perbaikan (`public/js/28-decisiontools.js`)**:
  - Tambah card baru di `renderDailyBriefPage()` (antara 3 metric card atas dan card "3 Things to Watch") berisi: angka besar IHSG saat ini + badge perubahan (▲/▼, warna hijau/merah), dan canvas chart di bawahnya.
  - Fungsi baru `renderDailyBriefIhsgChart(curIhsg, isBullish)`: line chart Chart.js dari `ihsgHist`, gaya ala widget Yahoo Finance — garis tipis (2px) hijau/merah sesuai arah tren, area fill gradient transparan di bawah garis, TANPA sumbu/gridline/legend sama sekali (`scales.x/y: display:false`) untuk tampilan minimalis, tooltip index-mode menampilkan nilai saat hover. Fallback ke data datar (`[curIhsg, curIhsg]`) kalau histori belum terisi (user baru pertama kali pakai app).
  - Dipanggil otomatis di akhir `renderDailyBriefPage()` setelah `c.innerHTML = html`.
  - Cache-bust: `28-decisiontools.js?v=20260914a`.
- **Live verification (Playwright, server lokal, Chart.js REAL dimuat dari `node_modules` lokal — bukan stub — karena CDN cdnjs diblokir sandbox, di-intercept via `page.route` dan disuntikkan sebagai response)**: seed 40 titik data sintetis ke `ihsgHist`, navigasi ke halaman Market Pulse — chart tampil dengan benar sebagai area chart hijau (tren naik) tanpa axis/gridline, angka besar + badge hijau ▲ di atasnya, konsisten rapi di tema gelap maupun terang. Tanpa error konsol. Screenshot dikirim ke user.

`npm test` (154/154), `npm run lint` bersih.

**Catatan**: chart ini pakai data `ihsgHist` yang terkumpul dari sesi pemakaian aplikasi (bukan data historis resmi dari bursa) — jadi untuk user baru, grafik akan tampak datar sampai beberapa kali refresh harga terkumpul. Ini konsisten dengan cara data tersebut sudah dikumpulkan sebelumnya (tidak diubah), hanya visualisasinya yang baru ditambahkan.

## 2026-09-14 — Redesign grafik IHSG Market Pulse mengikuti format layout Yahoo Finance yang lebih detail

- **Konteks:** user kirim screenshot tampilan Yahoo Finance (^JKSE) — chart+tab rentang waktu (1D/5D/1M/6M/YTD/1Y/5Y/All) di kiri dengan garis putus-putus di level Previous Close dan dot+badge harga di titik terakhir, panel statistik (Previous Close, Open, Volume, Avg. Volume, Day Low/High, 52 Week Low/High) di kanan — minta format grafik IHSG di Market Pulse dibuat seperti itu.
- **Perbaikan (`public/js/28-decisiontools.js`)**:
  - Card IHSG dirombak jadi 2 kolom: kiri (chart + tab rentang), kanan (panel statistik, border pemisah).
  - Tab rentang waktu: hanya "1D" yang aktif & fungsional (data real dari `ihsgHist`, menampilkan % perubahan sungguhan). Tab lain (5D/1M/6M/YTD/1Y/5Y/All) sengaja ditampilkan nonaktif (abu-abu, `disabled`-style) dengan toast informatif saat diklik — **KEPUTUSAN SADAR**: aplikasi ini tidak menyimpan histori harga IHSG jangka panjang (hanya ~120 titik intraday sesi berjalan), jadi mengisi tab-tab itu dengan data akan berarti MENGARANG angka finansial yang terlihat otentik. Lebih jujur menampilkan UI-nya (sesuai format yang diminta) tapi nonaktif dengan penjelasan, daripada memalsukan data pasar.
  - Panel statistik kanan: Previous Close (`ihsgBase`), Open & Day Low/High dihitung jujur dari `ihsgHist` (min/max/titik pertama — data real sesi ini, bukan data resmi bursa harian). Volume, Avg. Volume, 52 Week Low, 52 Week High ditampilkan "—" karena aplikasi memang tidak melacak data ini — TIDAK diisi angka rekaan meski itu akan lebih mirip screenshot referensi. Catatan kecil ditambahkan di bawah panel menjelaskan keterbatasan ini secara eksplisit ke user.
  - Chart: plugin Chart.js custom baru `_ihsgPrevCloseLinePlugin` — menggambar garis putus-putus abu-abu di level `ihsgBase` (previous close, `afterDatasetsDraw`) dan badge kotak berwarna (hijau/merah sesuai tren) berisi harga saat ini di titik data terakhir (`afterDraw`), meniru pola dot+label harga khas Yahoo Finance. Warna palet disamakan dengan token `--green`/`--red` aplikasi (`#00873C`/`#D0163A`).
  - Cache-bust: `28-decisiontools.js?v=20260914b`.
- **Live verification (Playwright, server lokal, Chart.js REAL dari `node_modules`, di-intercept via `page.route` karena CDN diblokir sandbox)**: seed 40 titik data sintetis, screenshot tema gelap & terang — layout 2 kolom tampil rapi, tab "1D +0.58%" aktif biru dan 7 tab lain abu-abu nonaktif, badge harga hijau muncul tepat di titik akhir garis, panel statistik kanan menampilkan Previous Close/Open/Day Low/Day High dengan angka benar dan Volume/52W dengan "—" jujur. Tanpa error konsol.

`npm test` (154/154), `npm run lint` bersih.

**Catatan**: ini secara sadar TIDAK 1:1 identik dengan referensi Yahoo Finance dari sisi data (7 dari 8 tab rentang nonaktif, 4 dari 8 baris statistik "—") — karena mereplikasi FORMAT visual tidak berarti mengarang data finansial yang tidak dimiliki aplikasi. Kalau ke depannya user ingin data historis panjang & volume/52-minggu IHSG sungguhan, itu perlu integrasi sumber data baru (mis. memperluas `yfFetch`/`fhFetchIHSG` untuk menarik `range` lebih panjang dan field meta tambahan dari Yahoo Finance) — pekerjaan terpisah yang lebih besar, di luar cakupan permintaan format ini.

## 2026-09-14 — Fitur baru: "Volume Spike Scanner" (halaman Research)

- **Konteks:** user kirim contoh infografis "Volume Spike" dari Sectors.app (AKRA — volume hari ini vs median 14D/30D + rasio, chart 7 hari dengan garis median, price change 1D/3D/7D dengan sparkline, foreign net buy/sell hari ini + agregat 30 hari) dan bertanya apakah analisis ini sudah ada di MoneyWatch Pro. Jawaban: BELUM ADA sebagai satu fitur utuh (audit codebase mengonfirmasi tidak ada volume-vs-median spike detection di manapun; foreign flow hanya ada per-LQ45 di Command Center, dan `07-flowscan.js` secara eksplisit MENAHAN DIRI menampilkan arus dana asing karena "tidak mau menampilkan angka karangan"). User lalu minta fitur ini dibangun.
- **Riset kelayakan data (sebelum membangun)**:
  - **Volume harian riil**: `rdEnsure()`/`rdGetAny()` (`13-realdata.js`) sudah ada — cache OHLCV 1 tahun dari Yahoo Finance (`TICKER.JK`), untuk TICKER APAPUN (tidak terbatas LQ45), dipakai bersama FlowScan/TradeWave/Screener/Backtester. Cukup untuk menghitung median 14D/30D dan volume ratio dengan data REAL.
  - **Foreign flow per-ticker**: endpoint `/api/idx/broker-summary/:ticker?timeframe=X` (`generateBrokerSummary()`, `lib/idx-data-engine.js`) — REAL dari Invezgo API kalau dikonfigurasi (BUKAN dibatasi LQ45 seperti dugaan awal — batasan LQ45 di Command Center cuma karena dashboard itu iterasi list tetap 45 saham, bukan keterbatasan Invezgo sendiri), dengan fallback jujur `isSimulated:true` kalau Invezgo tidak terkonfigurasi/gagal — pola disclosure yang SUDAH ada dan konsisten dipakai di `27-stockintel.js`/`41-stockchat-cockpit.js`.
  - **Breakdown "N hari Buy / M hari Sell" 30 hari** (seperti referensi Sectors.app): **TIDAK dibangun** — itu butuh broker summary TERPISAH untuk tiap hari selama 30 hari (30 panggilan API per buka halaman), berisiko memboroskan kuota bulanan Invezgo (`getQuotaUsage()`) hanya untuk satu laporan. Diganti dengan SATU angka agregat 30 hari (`timeframe=1M`, 1 panggilan API) — jujur soal keterbatasan cakupannya lewat catatan di UI, bukan mengarang breakdown harian yang sebenarnya tidak dihitung.
- **Implementasi (`public/js/45-volume-spike.js`, baru)**:
  - Halaman baru "Volume Spike" ditambahkan ke sidebar grup RESEARCH (setelah Bandarmology), route `volume-spike` di `06-analysis-router.js`, container `#page-volume-spike` di `index.html`.
  - Input ticker + tombol "Analisa" (validasi via `isValidStockTicker()`).
  - `vsLoadAndRender()`: `rdEnsure(tk)` → hitung median 14D/30D (`vsMedian()`, exclude hari ini) dari `rdGetAny(tk)`, lalu `Promise.all` fetch broker-summary timeframe 1D & 1M paralel.
  - Card "VOLUME SPIKE TERDETEKSI" (border amber) muncul HANYA kalau rasio ≥1.5x terhadap median 14D atau 30D — kalau tidak, tampil pesan netral "Tidak Ada Lonjakan Volume Signifikan" dengan angka rasio aktual.
  - Card ringkasan (avatar ticker, nama, Today's Volume/14D Median/30D Median/Volume Ratio).
  - Chart bar 7 hari terakhir (Chart.js, plugin custom untuk garis putus-putus median 30D, bar hari dengan volume tertinggi di-highlight hijau).
  - 3 card price change 1D/3D/7D (dari `close` riil di `rdGetAny`) dengan mini-sparkline SVG.
  - Card Foreign Net Buy/Sell (hari ini) + Net Asing Agregat 30 Hari — masing-masing diberi badge "REAL"/"SIMULASI" mengikuti `isSimulated` dari API, plus catatan eksplisit menjelaskan kenapa breakdown harian tidak tersedia dan (kalau simulasi) bahwa angka itu BUKAN transaksi broker sungguhan.
  - Cache-bust: `45-volume-spike.js?v=20260914a` (file baru).
- **Live verification (Playwright, server lokal, Chart.js REAL dari `node_modules` di-intercept via `page.route`)**: endpoint `/api/idx/broker-summary/AKRA?timeframe=1D` dikonfirmasi mengembalikan `isSimulated:true` dengan `dataSource:"Simulasi (Invezgo tidak tersedia: NOT_CONFIGURED)"` di sandbox ini (Invezgo memang tidak dikonfigurasi di sini) — badge "SIMULASI" pada UI dikonfirmasi tampil sesuai. Seed 40 hari OHLCV+volume sintetis (hari terakhir sengaja dibuat spike) ke `RD_STORE['AKRA']` (fetch Yahoo asli tidak bisa diuji karena proxy diblokir sandbox — tapi `rdEnsure`/`rdFetchYahoo` sendiri adalah mekanisme YANG SUDAH ADA sebelumnya, bukan buatan baru, jadi tidak perlu diverifikasi ulang di sini) — hasil: rasio 4.89x (14D) / 5.42x (30D) terdeteksi benar, headline VOLUME SPIKE muncul, chart 7 hari menampilkan bar spike hijau + garis median, price change/sparkline benar. Diuji juga path "data tidak cukup" (ticker BBCA tanpa histori RD_STORE) — pesan fallback jujur tampil, bukan chart kosong/error. Screenshot dikirim ke user, tema gelap & terang. Tanpa `pageerror` JS (noise console hanya dari fetch harga live latar belakang lain yang diblokir sandbox, tidak terkait fitur ini).

`npm test` (154/154), `npm run lint` bersih.

**Catatan**: fitur ini SENGAJA tidak 1:1 dengan referensi Sectors.app — tidak ada breakdown "N Buy Days/M Sell Days" (lihat penjelasan kelayakan data di atas). Kalau Invezgo API dikonfigurasi di deployment production, kartu foreign flow otomatis akan menampilkan data REAL (bukan simulasi) tanpa perlu perubahan kode lagi — badge dan sumbernya sudah mengikuti field `isSimulated` yang dikembalikan API secara dinamis.

## 2026-09-14 — Eksekusi 4 rekomendasi konsolidasi analisa "tanpa pindah-pindah tab"

- **Konteks:** user minta saran optimalisasi supaya analisa antar-fitur lebih kuat tanpa harus pindah-pindah tab, lalu minta 4 rekomendasi yang diberikan dieksekusi. 4 rekomendasi itu: (1) satukan state ticker lintas-halaman, (2) ubah Stock Intel dari "launchpad" jadi hub yang benar-benar menyatukan analisa, (3) gabungkan Bandarmology + Volume Spike, (4) kurangi fetch API duplikat.
- **Audit sebelum eksekusi — TEMUAN PENTING**: ternyata mekanisme pub/sub `window.GLOBAL_STOCK_CONTEXT` (`00-config.js`) **SUDAH ADA** dan sudah dipakai Fundamental/Technical/Valuation/StockChat/KSEI/AI Trading/Backtester/Monthly Returns — jadi rekomendasi #1 SEBAGIAN BESAR sudah diimplementasikan tim sebelumnya (bukan gap sebesar dugaan awal). Ditemukan juga komentar eksplisit di kode (`27-stockintel.js`) yang menyebut pola "handoff card ke halaman lain, BUKAN dijadikan tab dalam satu halaman" sebagai keputusan desain SADAR (bukan kekurangan) — merujuk `UIUX_ROADMAP_AUDIT.md §8`. Rencana eksekusi disesuaikan mengikuti temuan ini alih-alih merombak arsitektur yang sudah sengaja dipilih tim sebelumnya:
  - **Gap nyata #1**: `45-volume-spike.js` (fitur baru hari ini) dan legacy `07-flowscan.js` TIDAK terhubung ke `GLOBAL_STOCK_CONTEXT` sama sekali — terisolasi, ticker harus diketik ulang tiap pindah dari/ke halaman ini. (Bandarmology Cockpit yang aktif sekarang — `renderBandarmologyCockpitPage()` di `41-stockchat-cockpit.js` — ternyata SUDAH otomatis ikut sinkron karena membaca `STOCKCHAT_SELECTED_TICKER`, variabel yang sudah disinkronkan `GLOBAL_STOCK_CONTEXT`; `07-flowscan.js` sendiri adalah tool lama/legacy yang terpisah, bukan halaman Bandarmology yang dipakai user sekarang.)
  - **Gap nyata #2**: Stock Intel Cockpit hanya MENGIRIM ticker ke `GLOBAL_STOCK_CONTEXT`, tidak pernah MENERIMA (tidak `subscribe`) — kalau ticker diganti dari halaman lain saat Stock Intel sedang terbuka, cockpit tidak ikut ter-refresh sampai user pindah-balik halaman.
  - **Gap nyata #3**: hub "LANJUTKAN ANALISA MENDALAM" di Stock Intel Cockpit hanya berisi 4 kartu handoff (Fundamental/Technical/Valuation/Bandarmology) — "Volume Spike" (fitur baru) tidak muncul sama sekali di sana, padahal fitur ini per-ticker persis seperti 4 lainnya.
  - **Gap nyata #4**: Volume Spike selalu fetch `/api/idx/broker-summary` timeframe 1D dari nol, walau Stock Intel Cockpit mungkin baru saja mengambil data yang SAMA PERSIS untuk ticker yang sama (tersimpan di `MW_INTEL_CACHE`).
- **Perbaikan**:
  1. **`45-volume-spike.js`**: `vsSearch()` sekarang publish ke `GLOBAL_STOCK_CONTEXT.setTicker(tk,'volume-spike')`; tambah `.subscribe()` (re-render otomatis kalau halaman ini sedang aktif dan ticker berubah dari halaman lain, pola identik dengan listener Fundamental/Technical/Valuation yang sudah ada); `renderVolumeSpikePage()` sekarang resolve default ticker dari `GLOBAL_STOCK_CONTEXT.getTicker()` sebagai prioritas kedua (sebelumnya cuma fallback lama `MW_SELECTED_INTEL_TICKER`).
  2. **`27-stockintel.js`**: tambah `.subscribe()` yang hilang (melengkapi pola publish-only yang sudah ada) — Stock Intel sekarang otomatis re-render kalau sedang terbuka dan ticker berubah dari halaman lain mana pun.
  3. **`27-stockintel.js`**: tambah kartu ke-5 "Volume Spike Scanner" di grid "LANJUTKAN ANALISA MENDALAM" (pola sama persis dengan 4 kartu lain — ringkasan singkat + tombol "Buka Volume Spike →"), melengkapi rekomendasi #2 & #3 tanpa merombak pola arsitektur "handoff card" yang memang sudah sengaja dipilih.
  4. **`45-volume-spike.js`**: `vsLoadAndRender()` sekarang cek `MW_INTEL_CACHE[tk].brokerSummary` (cache Stock Intel) dulu sebelum fetch `/api/idx/broker-summary` timeframe 1D — kalau ticker sudah baru saja dianalisis di Stock Intel, Volume Spike pakai cache itu, TIDAK fetch ulang (implementasi rekomendasi #4). Timeframe 1M tetap selalu fetch baru (tidak ada cache lain untuk itu).
  5. **`45-volume-spike.js`** (bagian dari rekomendasi #3): kartu foreign flow sekarang juga menampilkan `bandarmology.verdict` + `interpretation` (mis. "BIG DISTRIBUTION — Top 3 Seller mendominasi...") yang sebelumnya sudah ikut ter-fetch tapi tidak pernah ditampilkan — Volume Spike sekarang jadi satu tempat untuk volume + smart money verdict + foreign flow sekaligus.
  - Cache-bust: `27-stockintel.js?v=20260914a`, `45-volume-spike.js?v=20260914b`.
- **Live verification (Playwright, server lokal, Chart.js REAL dari `node_modules`)**: seed `RD_STORE['AKRA']` sintetis. (1) Konfirmasi kartu "Volume Spike Scanner" muncul di HTML Stock Intel Cockpit dengan `onclick="goPage('volume-spike'...)"`. (2) `GLOBAL_STOCK_CONTEXT.setTicker('AKRA','fundamental')` lalu buka Volume Spike TANPA ticker eksplisit — halaman benar-benar menampilkan AKRA (bukan default lama), termasuk kartu "VERDICT BANDARMOLOGY" dengan badge BIG DISTRIBUTION. (3) Sebaliknya, `vsSearch()` dari Volume Spike dengan ticker BBCA — `MW_SELECTED_INTEL_TICKER` di Stock Intel ikut berubah jadi BBCA, dikonfirmasi lewat re-buka halaman Stock Intel. Screenshot dikirim ke user (tema gelap). Tanpa `pageerror` JS.

`npm test` (154/154), `npm run lint` bersih.

**Catatan**: rekomendasi #2 ("hub yang benar-benar menyatukan") dieksekusi dalam bentuk konsisten dengan keputusan desain SADAR yang sudah ada di codebase (kartu handoff dengan ticker tersinkron otomatis via `GLOBAL_STOCK_CONTEXT`), BUKAN menggabungkan 5 halaman jadi satu tab-strip dalam satu DOM — opsi terakhir itu jauh lebih besar risikonya (5 rendering engine independen dengan ratusan baris masing-masing) dan bertentangan dengan keputusan arsitektur yang sudah didokumentasikan tim sebelumnya di `UIUX_ROADMAP_AUDIT.md §8`. Kalau user tetap menginginkan tab-strip dalam satu halaman fisik (bukan navigasi + ticker tersinkron), itu perlu perombakan arsitektur terpisah yang lebih besar dan berisiko — sebaiknya dikonfirmasi eksplisit dulu sebelum dikerjakan.

## 2026-09-14 — Hapus kartu pembungkus & judul dobel "Fundamental PRO"/"Technical PRO"

- **Konteks:** user melaporkan layout halaman Fundamental & Technical dobel judul — `.ptitle` halaman ("Analisis Fundamental"/"Analisis Teknikal & Flow") plus judul kedua "Fundamental PRO"/"Technical PRO" di dalam kartu gelap terpisah yang membungkus seluruh konten halaman. Minta kartu pembungkus itu dihapus dan judul cukup satu.
- **Root cause**: kedua halaman memakai `<div class="sm-container">` (kartu: `background`/`border`/`border-radius`/`box-shadow` sendiri, di `main.css`) yang di dalamnya ada `<div class="sm-suite-header">` berisi `<div class="sm-suite-brand">` — literal teks "Fundamental PRO"/"Technical PRO" — plus tab navigasi (`sm-suite-tabs`) di baris yang sama. Class yang sama (`sm-container`/`sm-suite-header`/`sm-suite-brand`) juga dipakai halaman Crypto Technical (`page-crypto-technical`, "Crypto PRO") yang TIDAK diminta diubah — jadi tidak bisa mengubah definisi CSS `.sm-container` secara global (apalagi `body.theme-light .sm-container{...!important}` yang akan menimpa override inline manapun), harus disentuh per-halaman.
- **Perbaikan**:
  - **`main.css`**: tambah class baru `.sm-container-plain` — varian TANPA styling kartu (tanpa `background`/`border`/`border-radius`/`box-shadow`/`min-height`/`margin-bottom`), hanya `display:flex;flex-direction:column;width:100%`. `.sm-container` asli dan seluruh override tema terangnya TETAP UTUH, tidak disentuh — Crypto Technical tidak terpengaruh sama sekali.
  - **`index.html`** (`page-fundamental` & `page-technical`): ganti `class="sm-container"` → `class="sm-container-plain"`; hapus seluruh `<div class="sm-suite-header">` beserta `<div class="sm-suite-brand">` (teks "X PRO") di dalamnya; `<div class="sm-suite-tabs">` (3 tombol tab navigasi tiap halaman) DIPERTAHANKAN PERSIS, hanya dipindah keluar dari wrapper yang dihapus dengan tambahan `margin-bottom:16px` inline untuk jarak yang tadinya disuplai `.sm-suite-header`'s padding.
  - Cache-bust: `main.css?v=20260914a`.
- **Live verification (Playwright, server lokal)**: dikonfirmasi terprogram — `page-fundamental`/`page-technical` sekarang TIDAK punya elemen `.sm-container` maupun teks "PRO</span>" sama sekali, TAPI punya `.sm-container-plain` dan tombol tab (`fund-nav-1`/`tech-nav-1`) tetap ada & berfungsi. `page-crypto-technical` dikonfirmasi TIDAK berubah (`.sm-container` dan `sm-suite-brand` masih ada persis seperti semula). Screenshot dikirim ke user, tema gelap & terang, kedua halaman — layout tampil bersih dengan satu judul saja, tab navigasi langsung menyatu tanpa kartu gelap terpisah. Tanpa `pageerror` JS.

`npm test` (154/154), `npm run lint` bersih.

**Catatan**: perbaikan murni visual/struktural (hapus wrapper + duplikasi judul) — tidak ada logika `fundFetchData()`/`techFetchData()`/`fundSwitchTab()`/`techSwitchTab()` yang disentuh, semua fungsi tab & fetch data tetap bekerja seperti sebelumnya.

## 2026-09-14 — README.md diperbarui, banyak bagian sudah usang (stale)

- **Konteks:** user minta penjelasan fitur & tech stack aplikasi. Audit lintas file menemukan `README.md` masih menyebut **Firebase Firestore** dan **Google Gemini API** sebagai sumber storage/AI — padahal keduanya SUDAH dimigrasikan penuh ke **Supabase** dan **Anthropic Claude** (`claude-sonnet-5`), dikonfirmasi lewat komentar migrasi eksplisit di `server.js`/`12-clean.js`/`08-auth.js` ("Firebase→Supabase migration", "was GoogleGenAI (Gemini) — replaced end-to-end at user's explicit request"). Daftar modul di README juga usang: menyebut 43 modul termasuk `js/31-d3-networth.js` yang TIDAK ADA di `public/js/` manapun (sudah dihapus/tidak pernah ada di state saat ini), sementara 3 modul baru (`44-sectoral-insight.js`, `45-volume-spike.js`, `02b-price-index.js`) tidak tercantum sama sekali. User lalu minta README diganti dengan versi paling update.
- **Perbaikan (`README.md`, ditulis ulang)**:
  - Tambah bagian baru "🧱 Tumpukan Teknologi" — tabel ringkas front-end (vanilla JS, Chart.js, D3, Tailwind, onnxruntime-web)/back-end (Express, Anthropic Claude, Supabase, Invezgo, Upstash Redis, Yahoo Finance)/deployment (Vercel)/testing, dikonfirmasi satu-satu dari kode nyata (`package.json`, `grep process.env.*` di `server.js`+`lib/`, import statement di tiap file), bukan disalin dari dokumen lama.
  - Catatan eksplisit soal migrasi Firebase→Supabase dan Gemini→Claude, plus peringatan bahwa `.env.example` masih menyisakan variabel `GEMINI_API_KEY`/`FIREBASE_*` lama yang **tidak lagi dibaca kode manapun** (dikonfirmasi via `grep process.env` — hanya `ANTHROPIC_API_KEY`, `INVEZGO_*`, `SUPABASE_*`, `UPSTASH_REDIS_*`, `AUTH_ENFORCE_STAGE2`, `DATA_QUALITY_ENFORCE_STAGE2`, `VERCEL` yang benar-benar dipakai) — `.env.example` itu sendiri SENGAJA TIDAK diubah di sini (di luar cakupan permintaan "ganti README"), hanya diberi catatan peringatan.
  - Tabel struktur modul diperbarui ke 41 file `public/js/` yang benar-benar ada saat ini (dicek `ls` langsung), tiap deskripsi diambil dari komentar header asli file itu sendiri (bukan dikarang ulang) — `31-d3-networth.js` dihapus dari daftar, `02b-price-index.js`/`44-sectoral-insight.js`/`45-volume-spike.js` ditambahkan.
  - Fitur baru sesi ini (Volume Spike Scanner, AI Copilot/StockChat berbasis Claude, AI Autonomous Trading dengan model ONNX) ditambahkan ke bagian "Fitur Utama" yang sebelumnya tidak menyebutnya sama sekali.
  - Bagian "Cara Menjalankan" disederhanakan (hapus opsi "static server tanpa Node.js" yang menyesatkan — app ini butuh Express server untuk endpoint `/api/*`, tidak bisa berjalan penuh sebagai file statis murni) dan ditambah instruksi `npm test`/`npm run lint` serta catatan deployment Vercel yang sebelumnya tidak disebut sama sekali di README padahal itu target deploy utama (`vercel.json`).
- **Verifikasi**: `npm test` (154/154) dan `npm run lint` dijalankan ulang untuk memastikan perubahan dokumentasi tidak menyentuh kode (keduanya tetap identik/bersih, sesuai ekspektasi untuk perubahan Markdown murni).

**Catatan**: `.env.example` juga ditemukan usang (memuat `GEMINI_API_KEY`/`FIREBASE_*` yang tidak dipakai lagi, TIDAK memuat `ANTHROPIC_API_KEY` yang sebenarnya dibutuhkan `server.js`) — TIDAK diperbaiki dalam perubahan ini karena user secara spesifik hanya minta README, dan mengubah file environment-variable berpotensi lebih sensitif (bisa memengaruhi setup deployment orang lain) — ditawarkan ke user sebagai tindak lanjut terpisah, bukan dieksekusi otomatis.

## 2026-09-14 — Quant trading readiness: eksekusi P0 (walk-forward backtester) + P3 (Data Quality Gate telemetry)

- **Konteks:** user bertanya apakah aplikasi ini bisa dipakai untuk quantitative trading. Jawaban: BELUM (audit menemukan tidak ada lapisan eksekusi broker sama sekali — `38-ai-autonomous-trading.js` murni paper trading virtual, backtester `11-quant.js` tanpa slippage/walk-forward validation, infra Vercel serverless maxDuration 30s tidak cocok untuk trading latensi rendah). User klarifikasi: tujuannya HANYA copy-trade manual (baca sinyal Paper Trading, eksekusi sendiri di broker) — jadi lapisan eksekusi (P2) dan infra latensi rendah (P4) TIDAK relevan. Data broker (Invezgo API) sedang menunggu aktivasi minggu ini (P1, di luar kendali kode). User minta P0 (validasi backtester) DAN P3 (reliability sinyal untuk dibaca/copy-trade) dieksekusi sekaligus.
- **Temuan P3 penting SEBELUM implementasi**: kill-switch Data Quality Gate (`DATA_QUALITY_ENFORCE_STAGE2`) ternyata SUDAH ADA dan sudah terpasang penuh di `computeStockSignal()`/`generateExitHypothesis()` (`lib/idx-data-engine.js`) — hanya OFF secara default, dengan komentar eksplisit di kode & `.env.example`: *"Only set to true after observing how often non-REAL status actually occurs in production"*. TAPI tidak ada satupun mekanisme untuk benar-benar MENGAMATI itu (nol logging/counter di manapun) — jadi keputusan kapan aman mengaktifkannya sebelumnya mustahil diambil berbasis data. Ini gap nyata yang diisi, bukan membangun kill-switch dari nol.

### P0 — Walk-Forward Validation & Slippage (`public/js/11-quant.js`, `public/index.html`)

- **Root cause**: `runBacktest()`/`doBacktest()` sebelumnya HANYA menghitung komisi, TIDAK ADA slippage (fill diasumsikan persis di harga close — tidak realistis), dan TIDAK ADA pemisahan in-sample vs out-of-sample — jadi strategi yang terlihat profitable di backtest bisa saja cuma overfit ke periode itu sendiri, tanpa cara mendeteksinya di UI.
- **Perbaikan**:
  - Input baru "Slippage % / trade" (default 0.15%) — diterapkan ke SEMUA titik perhitungan fill price (buy fill lebih tinggi, sell fill lebih rendah dari close) di 3 lokasi yang sebelumnya masing-masing menghitung fill sendiri-sendiri (trade log, equity curve, drawdown curve) — disatukan lewat helper `buyFillPx()`/`sellFillPx()` supaya konsisten.
  - Input baru "Walk-Forward Split" (60/40, 70/30 default, 80/20, atau nonaktif) — sinyal tetap dihitung dari SELURUH data (indikator butuh histori penuh), tapi PELAPORAN performa dipisah: metrik in-sample (awal periode) vs out-of-sample ("belum pernah dilihat" saat strategi di-tuning), ditampilkan berdampingan di panel baru "WALK-FORWARD VALIDATION".
  - Heuristik "indikasi overfitting": badge amber otomatis muncul kalau win rate out-of-sample turun >15 poin persentase dari in-sample, ATAU rata-rata return per-trade berbalik dari positif ke negatif — bukan bukti matematis overfitting, tapi sinyal peringatan dini untuk ditelusuri sebelum strategi dipakai copy-trade sungguhan.
  - Berlaku untuk SEMUA strategi (MA Cross, RSI Reversal, XGBoost, fallback momentum) — sebelumnya ada selector "Train/Test Split" (`bt-xgb-sp`) tapi HANYA muncul di mode XGBoost DAN ternyata tidak pernah dihubungkan ke JS manapun (dead UI, dibiarkan apa adanya, tidak disentuh — di luar cakupan).
- **Live verification (Playwright, server lokal, Chart.js REAL dari `node_modules`)**: `runBacktest()` dipanggil dengan split 70/30 pada data simulasi (proxy Yahoo diblokir sandbox) — panel Walk-Forward tampil benar: in-sample 7 trade (win rate 14.3%), out-of-sample 2 trade (win rate 50.0%), badge "Konsisten" (hijau) karena tidak memenuhi kriteria overfitting. Screenshot dikirim ke user. Tanpa error konsol.

### P3 — Data Quality Gate Telemetry (`lib/idx-data-engine.js`, `server.js`, `public/js/35-settings.js`)

- **Perbaikan**:
  - `recordDataQualityStatus(status)` — dipanggil di `assessDataQuality()` (satu-satunya titik status REAL/STALE/UNAVAILABLE/SIMULATION/INVALID dihitung), fire-and-forget (tidak pernah menunda/menggagalkan keputusan gate yang sesungguhnya). Counter per-status per-hari, disimpan di Upstash Redis kalau dikonfigurasi (pola sama persis dengan quota manager Invezgo di `lib/invezgo-client.js`, TTL 48 jam), fallback in-memory untuk dev lokal (dengan disclosure jujur `persistedInRedis:false` kalau dipakai — angka reset tiap cold-start, tidak akurat untuk keputusan production).
  - `getDataQualityTelemetry()` — hitung persentase REAL hari ini + rekomendasi tekstual kapan aman mengaktifkan `DATA_QUALITY_ENFORCE_STAGE2` (≥90% REAL = "kondisi cukup baik", di bawah itu = "tunggu dulu, mis. setelah Invezgo API aktif"). Keputusan mengaktifkan env var TETAP MANUAL oleh user — fungsi ini cuma menyediakan data untuk memutuskan, tidak pernah mengubah env var sendiri.
  - Endpoint baru `GET /api/idx/data-quality-status` (pola sama dengan `/api/idx/invezgo-status` yang sudah ada) — read-only, tidak mengekspos data user/finansial, cuma agregat counter.
  - Kartu baru "Data Quality Gate (Sinyal AI Trading)" di halaman Pengaturan, bersebelahan dengan kartu Kuota Invezgo yang sudah ada — menampilkan % REAL hari ini, breakdown status lain, rekomendasi, dan status kill-switch (AKTIF/nonaktif).
- **Live verification (Playwright + curl, server lokal)**: endpoint dikonfirmasi mengembalikan `{"success":true,...}` dengan counter kosong sebelum ada aktivitas; setelah memanggil `/api/idx/ai-signal/BBCA` dua kali, counter `UNAVAILABLE` naik jadi 2 (benar — Yahoo Finance diblokir sandbox, jadi status UNAVAILABLE, bukan REAL — perilaku ini SESUAI ekspektasi sandbox, bukan bug), dan rekomendasi teks menyesuaikan otomatis. Kartu Settings dikonfirmasi ter-render dengan data yang sama, tanpa error konsol.

`npm test` (154/154), `npm run lint` bersih.

**Catatan**: perbaikan ini SENGAJA TIDAK mengaktifkan `DATA_QUALITY_ENFORCE_STAGE2` sendiri — itu keputusan operasional yang butuh observasi data production nyata (yang baru bisa dikumpulkan SETELAH Invezgo API aktif minggu ini dan user benar-benar memakai AI Trading Scanner beberapa hari), bukan sesuatu yang bisa/boleh diputuskan otomatis dari sandbox ini.

## 2026-09-14 — Fix "bug timeframe" di Backtester: hapus selector mati `bt-xgb-sp` (`public/index.html`)

- **Konteks**: user melaporkan "bug timeframe" di Backtester setelah PR sebelumnya (walk-forward validation). Ditelusuri: satu-satunya kandidat yang cocok dengan deskripsi "timeframe" adalah selector "Train/Test Split" (`id="bt-xgb-sp"`, opsi 70/30 dan 80/20) yang HANYA muncul di panel parameter XGBoost — sudah diflag sebagai dead UI di entri PR sebelumnya tapi sengaja dibiarkan karena di luar cakupan saat itu.
- **Root cause**: `grep` di seluruh `public/js/` mengonfirmasi ULANG (dua kali, di dua sesi berbeda) bahwa `bt-xgb-sp` NOL referensi JavaScript — selector ini terlihat seperti mengatur rasio split data training/testing model XGBoost, tapi mengubah nilainya tidak melakukan apa-apa sama sekali. Ini "bug" dalam arti: kontrol terlihat berfungsi tapi diam-diam tidak, sehingga user mengira mengubahnya mengubah perilaku backtest padahal tidak (persis gejala yang biasa disebut "timeframe tidak berubah"/"tidak ngefek"). Penyebab strukturalnya: model XGBoost di aplikasi ini di-load PRE-TRAINED dari file ONNX (dilatih offline lewat `ml/train_xgb_signal.py`), bukan dilatih ulang di browser saat backtest jalan — jadi konsep "Train/Test Split" untuk INFERENCE tidak pernah relevan di sini. Konsep split yang benar-benar dipakai (dan sudah berfungsi penuh sejak PR walk-forward validation) adalah "Walk-Forward Split" di bawahnya, yang memisahkan periode BACKTEST (bukan training model) jadi in-sample/out-of-sample untuk validasi performa strategi — berlaku untuk SEMUA strategi termasuk XGBoost.
- **Perbaikan**: hapus `<select id="bt-xgb-sp">` beserta label "Train/Test Split" dari blok `#bt-params-xgb` di `public/index.html`. `#bt-xgb-status` (indikator status model ONNX, yang MEMANG dipakai oleh `11-quant.js`) tetap ada dan tidak diubah. Komentar HTML ditinggalkan di lokasi penghapusan menjelaskan alasannya, supaya tidak ada kebingungan yang sama di masa depan. Tidak ada perubahan JS/CSS lain — perubahan murni penghapusan markup mati, jadi tidak perlu cache-bust file `.js`/`.css`.
- **Live verification (Playwright, server lokal)**: buka Backtester → pilih strategi "XGBoost (Eksperimen)" → dikonfirmasi `#bt-xgb-sp` sudah tidak ada di DOM, `#bt-xgb-status`, `#bt-slippage`, dan `#bt-wf-split` (Walk-Forward Split) semua tetap ada dan berfungsi. Screenshot dikirim ke user. Nol error konsol.
- `npm test` (154/154: 125 utama + 18 financial policy + 6 provider function + 5 identity-verification), `npm run lint` bersih.
- **Catatan**: ini adalah penghapusan UI, bukan perbaikan logika — tidak ada perilaku backtest yang berubah, karena kontrol yang dihapus memang tidak pernah memengaruhi hasil apapun sejak awal.

## 2026-09-14 — Fix: IHSG (dan saham fallback) selalu tampil +0,00% di header/ticker (`public/js/03-engine.js`)

- **Konteks**: user melaporkan nilai IHSG di aplikasi berbeda dari Yahoo Finance, disertai screenshot. Perbandingan langsung: **harga IHSG-nya IDENTIK** (6.534,69 vs 6.534,69) — yang berbeda adalah perubahan harian: aplikasi menampilkan `+0,00 (+0,00%)`, Yahoo menampilkan `-6,68 (-0,10%)`.
- **Root cause**: `fhFetchIHSG()` (dan fallback individual di `fhFetchStocks()`) membaca `meta.previousClose` dari respons endpoint Yahoo `/v8/finance/chart/{symbol}`. Field itu **TIDAK PERNAH ADA** di endpoint chart Yahoo (field itu milik endpoint quoteSummary yang berbeda) — endpoint chart hanya mengisi `meta.chartPreviousClose`. Dikonfirmasi silang: 4 file lain di repo yang sama (`lib/idx-data-engine.js`, `lib/providers/yahoo-client.js`, `public/js/41-stockchat-cockpit.js`, `public/js/40-idx-pipeline.js`) sudah benar memakai `chartPreviousClose` untuk endpoint yang identik — hanya `03-engine.js` yang salah field. Akibatnya `meta.previousClose` selalu `undefined` → fallback `||meta.regularMarketPrice` selalu aktif → harga "kemarin" dianggap sama dengan harga sekarang → perubahan harian selalu dihitung 0,00%, walau harga itu sendiri (yang datang dari field `regularMarketPrice`, field yang benar) akurat.
  - Jalur batch `/api/idx/quotes` (dipakai `fhFetchStocks()` sebagai jalur utama untuk saham) TIDAK terdampak — itu memakai data server yang sudah dihitung benar via `idx-data-engine.js`. Yang pasti selalu terdampak hanya **IHSG** (tidak ada jalur batch server untuknya, selalu langsung ke Yahoo via proxy CORS client-side) dan saham hanya pada saat jalur batch itu gagal (fallback individual).
- **Perbaikan**: field yang dibaca diubah ke `meta.chartPreviousClose||meta.previousClose||meta.regularMarketPrice` (2 lokasi: `fhFetchIHSG()` dan `_fallbackFetchIndividual()` di dalam `fhFetchStocks()`), mengikuti pola fallback yang sama persis dengan `lib/providers/yahoo-client.js`.
- **Live verification (Playwright, server lokal, dengan `page.route` memalsukan respons Yahoo persis seperti aslinya — `chartPreviousClose` ada, `previousClose` TIDAK ADA)**: sebelum fix, `ihsgBase` = `ihsgCur` (0,00%). Setelah fix, `ihsgCur=6534.69`, `ihsgBase=6541.37`, perubahan terhitung `-0.10%` — cocok persis dengan angka Yahoo Finance di laporan user. Header ticker dan running ticker tape keduanya menampilkan `IHSG 6.534,69 ▼ -0,10%` secara konsisten. Screenshot dikirim ke user. Nol error konsol.
- `npm test` (154/154), `npm run lint` bersih. Cache-bust `03-engine.js?v=20260914b`.
- **Catatan**: bug ini murni di jalur client-side langsung-ke-Yahoo (dipakai widget header/ticker real-time) — tidak memengaruhi data fundamental/teknikal/sinyal AI Trading di halaman lain, yang semuanya sudah lewat `lib/idx-data-engine.js` di server (field `chartPreviousClose` sudah benar di sana sejak awal).

## 2026-09-14 — Rework Volume Spike: layout 2 kolom + screening lintas-saham + logo perusahaan asli (`public/js/45-volume-spike.js`)

- **Konteks:** user minta 4 hal sekaligus untuk halaman Volume Spike: (1) bagi layout jadi 2 kolom — hasil screening & detail per kode saham, (2) ganti logo saham yang "masih karangan" dengan logo perusahaan asli, (3) tabel screening pakai sumber data yang paling mudah diidentifikasi DAN tidak memakan kuota Invezgo, (4) tabel bisa di-sort dan difilter per indeks (LQ45, IDX30, dll).

- **(1) Layout 2 kolom** (`class="g2b"`, pola grid 2-kolom yang sudah dipakai di tempat lain di app dan otomatis menumpuk 1 kolom di layar sempit — lihat `main.css`):
  - **Kiri** — panel detail 1 ticker (fitur lama: headline spike, kartu info, chart volume 7 hari, price change 1D/3D/7D, verdict bandarmology) — logikanya TIDAK berubah, cuma dipindah ke sub-kolom.
  - **Kanan** — panel BARU "Screening Volume Spike": dropdown filter indeks, tombol refresh, dan tabel yang bisa disortir per kolom. Klik satu baris = pilih ticker itu untuk dianalisis di panel kiri (ikut disiarkan ke `GLOBAL_STOCK_CONTEXT` supaya halaman lain ikut pindah).
  - Shell 2 kolom hanya dibangun SEKALI per sesi (dicek via `!el('vs-screen-table')`) — berpindah ticker di kolom kiri (lewat search/klik baris/GLOBAL_STOCK_CONTEXT) hanya me-refresh panel kiri, TIDAK membangun ulang / me-reset hasil scan tabel screening di kanan.

- **(2) Logo perusahaan asli, bukan "karangan":** sebelumnya kartu detail menampilkan lingkaran warna + 3 huruf pertama ticker yang di-generate dari hash (murni dikarang, bukan logo sungguhan). Diganti dengan `getStockLogoHtml()` (`01-data.js`) — fungsi yang SUDAH ADA dan SUDAH dipakai & terverifikasi di Stock Intel (`27-stockintel.js`): mengambil logo perusahaan REAL dari CDN publik Stockbit (`assets.stockbit.com/logos/companies/{TICKER}.png`), dengan fallback otomatis ke monogram (bukan gambar rusak) kalau logo tidak tersedia untuk ticker tertentu. Dipakai baik di kartu detail (kiri) maupun tiap baris tabel screening (kanan) — zero biaya API, murni request gambar publik.

- **(3) Sumber data tabel screening — dipilih justru karena paling mudah diverifikasi, TANPA Invezgo:**
  - Daftar ticker + keanggotaan indeks: `GET /api/idx/stocks?index=...` → `loadBaseUniverse()` (`lib/universe.js`) — daftar STATIS lokal, bukan panggilan API pihak ketiga apapun, nol kuota apapun.
  - Volume harian per ticker (buat hitung median 14D/30D & rasio): `rdEnsure()`/`rdGetAny()` (`13-realdata.js`, Yahoo Finance, cache harian) — PERSIS mesin yang sama yang sudah dipakai panel detail di kolom kiri PADA FILE YANG SAMA sejak awal, jadi paling gampang diaudit (bukan jalur data baru yang belum teruji). Yahoo Finance ≠ Invezgo — memindai berapa pun banyak saham tidak pernah menyentuh kuota Invezgo.
  - Broker summary (`/api/idx/broker-summary`, jalur YANG MEMAKAI kuota Invezgo) HANYA dipanggil untuk 1 ticker yang sedang dipilih di panel detail kiri (perilaku lama, tidak berubah) — TIDAK PERNAH dipanggil per baris di loop scan tabel screening. Logika hitung statistik volume (`vsVolumeStats()`) diekstrak jadi 1 fungsi bersama dipakai baik panel kiri maupun tiap baris tabel, supaya angka rasio di kedua tempat selalu konsisten.
  - Ticker dipindai BERURUTAN dengan jeda 350ms (pola sama seperti `rdFetchLivePrices()` di `13-realdata.js`) — bukan paralel — supaya proxy CORS publik yang dipakai bersama seluruh app tidak dibanjiri. Tabel terisi progresif (baris langsung muncul begitu 1 ticker selesai), disertai teks progres "Memindai X/Y".

- **(4) Sort & filter per indeks:** dropdown filter dengan 4 pilihan (LQ45 default/IDX30/IDX80/Kompas100 — SriKehati sengaja tidak dimasukkan, ditemukan bug lama tidak terkait di endpoint `/api/idx/stocks` yang membuat filter itu tidak pernah cocok apa pun karena mismatch huruf besar/kecil pada key `sriKehati`, di luar cakupan perbaikan ini, tidak disentuh). Kolom tabel (Kode/Volume Hari Ini/Median 14D/Median 30D/Rasio 30D) bisa diklik headernya untuk sort naik/turun (client-side, dari hasil scan yang sudah ada — tidak fetch ulang).

- **Live verification (Playwright, server lokal, `page.route` memalsukan histori Yahoo untuk seluruh universe agar scan deterministik):**
  - Scan default LQ45 selesai 48/48 (progresif, badge "SPIKE" muncul benar untuk 2 ticker yang sengaja diberi volume hari-terakhir 4x lipat, tersortir otomatis ke atas berdasarkan rasio 30D).
  - Ganti filter ke IDX30 → scan ulang otomatis, 30/30 ticker.
  - Klik header "Rasio (30D)" 2x → urutan berbalik jadi naik lalu kembali turun, dikonfirmasi lewat isi kolom.
  - Klik baris tabel (TLKM) → panel kiri berpindah ke TLKM (`VS_STATE.ticker` berubah dari BBCA→TLKM), headline "VOLUME SPIKE TERDETEKSI" tampil sesuai data TLKM, tabel screening TIDAK ikut ter-reset.
  - Diverifikasi terpisah lewat penghitungan request jaringan: **nol** panggilan `/api/idx/broker-summary` selama loop scan 48 ticker — satu-satunya panggilan endpoint itu adalah untuk ticker yang dipilih di panel detail (perilaku lama, tidak bertambah seiring jumlah saham yang dipindai).
  - Screenshot dikirim ke user. Nol error konsol.

- `npm test` (154/154), `npm run lint` bersih. Cache-bust `45-volume-spike.js?v=20260914c`.

- **Catatan:** di sandbox pengembangan ini, `assets.stockbit.com` (CDN logo) tidak terjangkau (jaringan keluar dibatasi) sehingga logo tampil sebagai kotak putih kosong di screenshot verifikasi — bukan regresi dari perubahan ini (fungsi `getStockLogoHtml()` itu sendiri sudah ada & tidak diubah), melainkan keterbatasan jaringan sandbox yang sama seperti yang sebelumnya dialami Yahoo Finance di sesi-sesi lain. Di browser pengguna sungguhan (jaringan tidak dibatasi), logo & fallback monogram akan tampil normal, persis seperti di halaman Stock Intel yang sudah memakai fungsi yang sama sejak sebelumnya.

## 2026-09-14 — Fix: tabel Screening Volume Spike "selalu refresh" selama scan (`public/js/45-volume-spike.js`)

- **Konteks:** user melaporkan tabel Screening Volume Spike (fitur baru dari PR sebelumnya) "selalu refresh" — minta kalaupun butuh refresh, dibuat cepat/mulus supaya user bisa fokus memantau perubahan, dan JANGAN sampai seluruh daftar saham di tabel ikut ter-refresh tiap kali ada saham baru masuk.
- **Root cause:** `vsScanNext()` memindai ticker satu-per-satu dengan jeda ~350ms (by design, supaya proxy CORS publik tidak dibanjiri — lihat PR sebelumnya). Tapi tiap kali SATU ticker selesai dipindai, kode lama memanggil `vsRenderScreenTable()` — fungsi itu MENULIS ULANG SELURUH `<tbody>` dari nol (`tbody.innerHTML = rows.map(...).join('')`) dan mengurutkan ulang SEMUA baris berdasar rasio volume. Efeknya: baris-baris yang SUDAH tampil ikut dihapus-lalu-ditulis-ulang setiap ~350ms selama scan berjalan (bisa belasan detik untuk index besar seperti Kompas100), dan karena diurutkan ulang tiap kali, baris yang sudah ada ikut MELONCAT posisi terus-menerus — persis gejala "selalu refresh" yang dilaporkan, membuat user sulit fokus membaca satu baris tertentu.
- **Perbaikan:**
  - HTML 1 baris diekstrak jadi fungsi bersama `vsRowHtml(r)` — dipakai baik oleh rebuild penuh maupun penambahan 1 baris, supaya markupnya selalu identik.
  - Ditambahkan `vsAppendScreenRow(r)` — menambahkan SATU `<tr>` baru ke akhir `<tbody>` via DOM API (`appendChild`), TANPA menyentuh baris yang sudah ada, dengan animasi fade-in halus (`smFadeIn`, keyframe yang sudah ada di `main.css`, dipakai ulang bukan bikin baru). Ini yang dipanggil tiap ticker selesai dipindai — bukan rebuild-ulang.
  - `vsRenderScreenTable()` (rebuild penuh + urut ulang) sekarang HANYA dipanggil di titik yang sedikit & disengaja: state kosong/loading awal, SEKALI di akhir scan (bukan tiap ticker), ganti filter indeks, dan klik header kolom untuk sort (aksi eksplisit user).
  - Selama scan berjalan, baris ditambahkan dalam urutan DITEMUKAN (bukan diurutkan ulang tiap saat) — urutan final sesuai sort aktif baru diterapkan sekali begitu scan selesai.
  - Ditambahkan guard `if (myToken !== VS_SCREEN_STATE.scanToken) return;` di awal `afterFetch()` — mencegah hasil fetch dari scan LAMA (yang sudah dibatalkan karena user ganti filter di tengah jalan) menambahkan baris nyasar ke tabel scan yang BARU.
- **Live verification (Playwright, server lokal, histori Yahoo dipalsukan via `page.route`, `MutationObserver` dipasang di `#vs-screen-tbody`):**
  - Selama jendela 8 detik pertengahan scan (~22 ticker diproses), tercatat **0 rebuild penuh** dan **22 penambahan 1-baris** — persis 1 mutation per ticker, tanpa satupun penulisan-ulang massal.
  - Baris pertama yang tampil (BBCA) ditandai dengan atribut custom di DOM — dikonfirmasi TETAP node DOM yang sama persis setelah 22 baris lain ditambahkan (tidak pernah dihapus/diganti).
  - Setelah scan selesai (48/48), tabel terurut benar menurun berdasar rasio 30D (satu kali rebuild akhir bekerja sesuai desain).
  - Nol error konsol.
- `npm test` (154/154), `npm run lint` bersih. Cache-bust `45-volume-spike.js?v=20260914d`.
- **Catatan:** tombol Refresh manual (↻) dan ganti filter indeks tetap menampilkan reset satu-kali ("Memindai...") sebelum mengisi ulang — itu memang aksi eksplisit yang diminta user sendiri, bukan bagian dari masalah "refresh terus-menerus otomatis" yang dilaporkan.

## 2026-09-14 — Fix: layout tidak stabil di Screening Volume Spike — filter hanya tampilkan saham dengan rasio ≥1.70x (`public/js/45-volume-spike.js`)

- **Konteks:** setelah fix "selalu refresh" (entri di atas) sudah menghilangkan rebuild-penuh per-ticker, user masih melaporkan tabel "masih terus me-refresh, nilainya terus berubah dan mempengaruhi layout detail, karena seluruh layout berubah" — dan secara eksplisit minta: "buat aturan dinyatakan spike apabila memenuhi kriteria >1,70 saja, tidak perlu ditampilkan semuanya agar layout lebih stabil".
- **Root cause:** fix sebelumnya menghilangkan REBUILD tabel per-ticker, tapi TIDAK menghilangkan PERTUMBUHAN tabel — kode lama tetap menambahkan SEMUA saham yang berhasil dipindai ke tabel (spike maupun tidak), jadi tabel tetap tumbuh dari 0 baris sampai seluruh ukuran index (bisa 100 baris untuk Kompas100) selama ~35 detik scan. Kolom kanan (`.g2b`) dan kolom kiri (panel detail) berbagi 1 baris grid — ketinggian kolom kanan yang terus bertambah drastis ikut memengaruhi tinggi total baris grid, membuat elemen-elemen di kolom kiri maupun di bawah grid ikut bergeser posisi vertikalnya setiap kali baris baru masuk. Ini persis "seluruh layout berubah" yang dilaporkan — beda akar masalah dari "refresh berkedip" yang sudah diperbaiki sebelumnya.
- **Perbaikan (mengikuti permintaan eksplisit user):**
  - Ambang "spike" dinaikkan dari 1.5x → **1.70x**, dan disatukan jadi 1 konstanta `VS_SPIKE_THRESHOLD` dipakai konsisten di SELURUH file (sebelumnya `1.5` ditulis literal berulang di 4 tempat berbeda: badge tabel, teks headline panel detail, kondisi warna kolom rasio) — supaya kalau ambang ini perlu diubah lagi nanti, cukup 1 titik.
  - **Filter, bukan cuma tampilan:** saham yang TIDAK memenuhi `ratio ≥ 1.70x` sekarang **tidak pernah ditambahkan ke tabel sama sekali** (bukan didim/disembunyikan lewat CSS — memang tidak di-push ke `VS_SCREEN_STATE.rows` maupun di-append ke DOM). Untuk index seperti LQ45 (48 saham), realistisnya hanya 0-5 saham yang lolos ambang di kondisi pasar normal — jadi tabel jarang tumbuh, dan ketinggian kolom kanan jauh lebih stabil sepanjang scan.
  - Saham yang tidak lolos tetap dihitung di `scannedCount` (dipakai teks progres "Memindai X/Y") — jadi user tetap tahu progres scan, hanya saja tidak setiap saham normal ditulis sebagai baris.
  - Teks deskripsi panel dan pesan akhir scan diperbarui menjelaskan aturan filter ("Hanya saham dengan rasio volume ≥1.70x yang ditampilkan (supaya layout stabil, tidak menampilkan seluruh index)"), dan pesan "tidak ada hasil" diperjelas ("Tidak ada saham dengan lonjakan volume ≥1.70x di indeks ini saat ini.") — bukan lagi "Belum ada hasil." yang ambigu.
- **Live verification (Playwright, server lokal, histori Yahoo dipalsukan — 2 ticker rasio tinggi 3.5x-4x, 1 ticker SENGAJA di rasio 1.6x untuk membuktikan ambang benar-benar 1.70 bukan 1.5 lama, sisanya normal ~1.0x):**
  - Hasil akhir: tabel HANYA berisi 2 baris (BBCA 4.00x, TLKM 3.50x) dari 48 saham yang dipindai — bukan 48/48 seperti sebelum fix.
  - Ticker uji 1.6x (MAPI) dikonfirmasi TIDAK muncul di tabel — membuktikan ambang baru (1.70) diterapkan dengan benar, bukan sisa ambang lama (1.5) yang masih aktif di salah satu tempat.
  - Teks progres akhir: "2 dari 48 saham menunjukkan lonjakan volume ≥1.70x." — sesuai.
  - Screenshot dikirim ke user: panel kanan ringkas (2 baris), panel kiri tidak lagi tergeser oleh pertumbuhan tabel. Nol error konsol.
- `npm test` (154/154), `npm run lint` bersih. Cache-bust `45-volume-spike.js?v=20260914e`.
- **Catatan:** dampak sampingan yang disengaja — badge "SPIKE" di setiap baris tabel sekarang selalu muncul (karena hanya baris yang sudah lolos ambang yang pernah ditampilkan), jadi secara teknis redundan tapi tetap dibiarkan karena tidak mengganggu dan menegaskan alasan baris itu ditampilkan.

## 2026-09-14 — Fix BUG NYATA: scan Screening Volume Spike restart terus dari 0 (bukan cuma UX) + batasi tampilan 10 tertinggi (`public/js/45-volume-spike.js`)

- **Konteks:** setelah 2 fix layout sebelumnya, user masih melaporkan (dengan screenshot Kompas100, 131 saham): "Memindai 84/131 — MIDI" lalu tiba-tiba kembali ke awal, bahkan di 50/131 tetap mengulang. User sendiri mengusulkan: tampilkan 10 rasio tertinggi saja, biarkan scan tetap jalan di background.
- **Root cause (BUG, bukan cuma soal desain UX):** `renderVolumeSpikePage()` mengecek `!el('vs-screen-table')` untuk menentukan "apakah panel screening sudah pernah dibangun" (supaya tidak dibangun ulang tiap ganti ticker). Masalahnya: **elemen dengan id `vs-screen-table` TIDAK PERNAH ADA di markup manapun** — typo dari PR sebelumnya (yang benar-benar dibuat cuma `vs-screen-tbody`, `vs-screen-col`, dst). Akibatnya kondisi itu **SELALU bernilai true**, jadi SETIAP kali `renderVolumeSpikePage()` dipanggil — untuk alasan apapun — seluruh panel screening dibangun ulang dari nol dan scan restart dari 0.
  - Ditemukan pemicu berulangnya: mesin harga live (`03-engine.js`, `FH.timer`) memanggil `renderPage(currentPage)` setiap `tick%4===0` — yaitu **tiap ~60 detik**, bagian dari siklus refresh IHSG/harga yang jalan otomatis di SEMUA halaman, bukan cuma saat user berinteraksi. Untuk Kompas100 (131 saham × 350ms/ticker ≈ 46 detik per scan penuh), refresh 60 detik ini HAMPIR SELALU memotong scan di tengah jalan dan mengulang dari 0 — persis gejala yang dilaporkan (macet di 84/131, ulang di 50/131, dst).
- **Perbaikan #1 (fix bug utama):** ganti penanda "shell sudah dibangun" ke `!el('vs-detail-col')` — wrapper div yang BENAR-BENAR ada di markup dan TIDAK PERNAH dibangun ulang setelah render pertama (hanya isi `#vs-body` di dalamnya yang berubah tiap ganti ticker). Sekarang panggilan `renderVolumeSpikePage()` berikutnya (baik dari klik user, pencarian, GLOBAL_STOCK_CONTEXT, MAUPUN tick periodik 60 detik) hanya me-refresh panel DETAIL (kiri) — panel screening (kanan) dan scan yang sedang berjalan TIDAK disentuh sama sekali.
- **Perbaikan #2 (permintaan eksplisit user — "tampilkan 10 tertinggi saja, biarkan scan jalan di background"):**
  - `VS_MAX_DISPLAY_ROWS = 10` — tabel yang TAMPIL dibatasi maksimal 10 baris (rasio tertinggi sesuai sort aktif).
  - Scan TETAP jalan penuh sampai akhir index di background — SEMUA saham spike yang ditemukan tetap disimpan di `VS_SCREEN_STATE.rows` (tidak dibuang), dipakai untuk angka "N saham ditemukan" di progress text; cuma yang DITAMPILKAN yang dibatasi.
  - `vsMaybeUpdateVisibleTable()` baru: kalau baris yang tampil masih < 10, tambah langsung (append murah, sama seperti sebelumnya). Kalau sudah pas 10, HANYA render ulang (tetap dibatasi 10 baris — murah) kalau saham baru ini cukup tinggi untuk benar-benar masuk top 10 saat ini (menggeser 1 baris terendah keluar) — saham yang tidak cukup tinggi diam-diam diabaikan dari tampilan tapi tetap terhitung di background.
  - Teks progres & deskripsi panel diperbarui menjelaskan pembatasan ini secara eksplisit.
- **Live verification (Playwright, server lokal, LQ45 dengan 15 ticker sengaja diberi rasio spike bervariasi 1.9x-5.0x untuk uji batas 10, sisanya normal):**
  - Simulasi PERSIS pemicu bug: setelah scan mid-flight (scannedCount=15), panggil `renderVolumeSpikePage()` langsung (persis yang dilakukan mesin harga live tiap 60 detik) — dikonfirmasi `scanToken` TIDAK berubah (scan tidak di-restart) dan `scannedCount` TERUS bertambah (15→17), bukan reset ke 0. Ini adalah reproduksi & pembuktian bug ASLI sebelum fix ini (kalau dijalankan di kode sebelumnya, `scanToken` akan berubah dan scan restart) dan bukti perbaikannya bekerja.
  - Setelah scan penuh selesai: 15 saham spike ditemukan di background, tapi tabel hanya menampilkan 10 baris tertinggi (BBCA 5.00x sampai INDF 2.80x), terurut benar menurun, 5 saham berikutnya (ANTM/PGAS/SMGR/GGRM/ACES, rasio 1.9x-2.6x) benar TIDAK ditampilkan meski tetap terhitung di angka "15 dari 48 saham".
  - Teks progres akhir: "15 dari 48 saham menunjukkan lonjakan volume ≥1.70x. Menampilkan 10 rasio tertinggi." — sesuai.
  - Screenshot dikirim ke user: panel kanan ringkas persis 10 baris, layout stabil. Nol error konsol.
- `npm test` (154/154), `npm run lint` bersih. Cache-bust `45-volume-spike.js?v=20260914f`.
- **Catatan:** ini adalah PR ke-3 berturut-turut untuk halaman yang sama dalam 1 sesi (append-only rendering → filter ambang 1.70x → fix bug restart + batas 10) — pola "gejala mirip, akar masalah beda" yang eksplisit didokumentasikan tiap kali supaya jelas kenapa fix sebelumnya tidak cukup, bukan mengulang solusi yang sama.

## 2026-09-14 — Ganti logo aplikasi (topbar + favicon) dengan logo baru user, dicek kontras di kedua tema (`public/index.html`, `public/css/main.css`, `public/img/`)

- **Konteks:** user mengirim file logo baru (gambar PNG gradasi biru-cyan berbentuk pita "MW" + aksen candlestick, dengan wordmark "MONEY WATCH" tertanam di gambar) dan minta ikon lama diganti, "sesuaikan tema terang dan gelap agar tetep contrast terlihat".
- **Analisis gambar sumber sebelum dipasang** (bukan langsung dipakai mentah-mentah): dicek dengan Pillow — gambar PNG punya alpha channel (transparan, bukan latar hitam solid seperti terlihat di preview chat). TAPI teks wordmark "MONEY WATCH" yang tertanam di gambar didesain untuk latar HITAM PEKAT — kata "MONEY" berwarna navy sangat gelap, nyaris tidak kontras kalau ditaruh di latar lain (termasuk latar topbar gelap aplikasi `#0E131F` yang tidak sehitam itu, apalagi latar topbar terang `#FFFFFF`). Kalau gambar dipasang utuh apa adanya, permintaan user sendiri ("tetap kontras di kedua tema") justru gagal terpenuhi untuk bagian teksnya.
- **Keputusan desain:**
  1. Ikon/mark grafisnya (pita biru-cyan + aksen candlestick) di-crop terpisah dari teks wordmark-nya (bounding-box dicari otomatis via analisis alpha channel per baris/kolom piksel, bukan crop manual asal tebak), disimpan sebagai `public/img/logo-mark.png` (276×240px, transparan) — dipasang menggantikan ikon SVG lama di topbar.
  2. Wordmark teks "MONEYWATCH PRO" di sebelahnya SENGAJA TETAP teks HTML asli (bukan diambil dari teks di gambar) — teks asli ini sudah mengikuti `var(--text)`/`var(--accent)` yang otomatis menyesuaikan tema gelap/terang (mekanisme yang sudah ada & teruji), jadi kontrasnya justru LEBIH terjamin daripada teks baked-in di gambar.
  3. Ikon baru berupa gambar raster (gradasi multi-warna) tidak bisa pakai trik `currentColor` seperti SVG lama — tapi dicek manual: warna biru/cyan-nya sendiri sudah cukup vivid untuk kontras baik di topbar gelap (`#0E131F`) MAUPUN topbar terang (`#FFFFFF`), dan selaras dengan `--accent` aplikasi di kedua tema (`#5B8DEF` gelap / `#0000FF` terang — sama-sama keluarga biru) — jadi tidak perlu overlay/filter CSS tambahan.
  4. Favicon juga diperbarui (bagian dari "logo aplikasi") — dibuat baru: ikon yang sama ditaruh di atas latar rounded-square navy gelap (`#0E131F`, senada topbar gelap) supaya kontras terjamin TERLEPAS dari tema OS/browser pengguna (favicon statis, tidak bisa ikut toggle tema live seperti UI di dalam app) — disimpan sebagai `public/img/favicon.png` (128×128px), menggantikan favicon SVG data-URI lama (desain lama: kotak hijau `#34d399`, tidak lagi merepresentasikan brand).
- **Perubahan:**
  - `public/index.html`: `<link rel="icon">` diarahkan ke `img/favicon.png`; `<svg class="tb-logo-icon">` diganti `<img class="tb-logo-icon" src="img/logo-mark.png">`.
  - `public/css/main.css`: aturan `color` untuk `.tb-logo-icon` (dipakai SVG `currentColor` lama) DIBIARKAN apa adanya (bukan dihapus) — sudah tidak berpengaruh ke `<img>`, tapi berguna sebagai fallback aman kalau ikon dikembalikan ke SVG di masa depan; ditambah komentar penjelas.
  - File baru: `public/img/logo-mark.png`, `public/img/favicon.png`.
- **Live verification (Playwright, server lokal):** `<img>` logo dikonfirmasi termuat sempurna (`complete:true`, `naturalWidth:276`, bukan broken image) di tema gelap (default); ganti tema lewat `toggleTheme()` dikonfirmasi (`body.theme-light` aktif) — logo tetap tampil kontras penuh, tidak ada bagian yang hilang/pudar. Screenshot topbar dikirim untuk kedua tema. Favicon file dikonfirmasi terserve 200 OK. Nol error konsol.
- `npm test` (154/154), `npm run lint` bersih. Cache-bust `img/logo-mark.png?v=20260914a`, `img/favicon.png?v=20260914a`.
- **Catatan:** ini pertama kalinya aplikasi punya folder `public/img/` untuk aset gambar statis (sebelumnya semua ikon berupa SVG inline/data-URI) — precedent baru untuk logo/branding assets ke depan.

## 2026-09-15 — Gabungkan Volume Spike ke Market Radar (`public/js/07-flowscan.js`, `public/index.html`)

- **Konteks:** user minta Volume Spike digabung ke Market Radar (yang sudah punya kolom CMF/RSI/Cap) supaya saling melengkapi analisa, dengan fallback "kalau terlalu berat untuk disusun tampilannya, satukan saja ke Market Radar tapi beda topbar (tab terpisah)".
- **Temuan sebelum implementasi:** ternyata TIDAK berat — `fsInit()` (Market Radar) sudah memuat 60 hari data OHLCV+volume penuh per saham untuk menghitung CMF (`fsGenData()`), jadi rasio volume spike bisa dihitung dari data yang SAMA, tanpa fetch tambahan sama sekali. Karena itu dipilih **penggabungan sungguhan ke 1 tabel** (bukan tab terpisah/fallback) — hasil lebih baik dan tidak lebih berat.
- **Perbaikan:**
  - `fsCalcVolRatio(data)` baru di `07-flowscan.js` — menghitung rasio volume hari ini vs median 14D/30D dari data yang sudah dimuat. Sengaja memanggil ULANG `vsMedian()` dan `VS_SPIKE_THRESHOLD` (konstanta ambang 1.70x) dari `45-volume-spike.js`, BUKAN menulis ulang logikanya — supaya definisi "spike" identik persis di kedua halaman (Market Radar dan Volume Spike sekarang benar-benar 1 sumber kebenaran, bukan 2 angka mirip yang kebetulan sama).
  - `fsInit()`: rasio dihitung SEKALI saat data dimuat (bukan tiap render), disimpan sebagai `a.volRatio30`/`a.volRatio14`/`a.isVolSpike` per baris.
  - Tabel Market Radar (`public/index.html`): kolom baru **"Vol Ratio"** di ujung (sebelum WL) — tebal + warna amber kalau melonjak. Badge "⚡" ditempel di kolom Sinyal kalau volume JUGA melonjak — konfirmasi silang visual antara skor akumulasi/distribusi dan lonjakan volume, ini bagian "saling melengkapi analisa" yang diminta user.
  - Dropdown urut (`#rk-sort`) dapat opsi baru "Vol Ratio".
  - `fsGoVolumeSpike(tk)` baru — klik nilai Vol Ratio langsung pindah ke halaman Volume Spike dengan ticker itu terpilih (via `GLOBAL_STOCK_CONTEXT`, pola yang sama dipakai di seluruh app) untuk drill-down (chart 7 hari, arus dana asing) tanpa menduplikasi tampilan Volume Spike di Market Radar.
- **Live verification (Playwright, server lokal):**
  - Dikonfirmasi rasio volume terhitung benar untuk seluruh 30 baris dari data yang sudah ada (BBRI 3.40x, BMRI 4.69x — ditandai spike otomatis dari data sintetis sandbox).
  - Baris dengan `isVolSpike:true` dikonfirmasi menampilkan badge ⚡ di kolom Sinyal dengan tooltip yang benar, dan kolom Vol Ratio tebal+amber.
  - Sort by "Vol Ratio" dikonfirmasi mengurutkan turun berdasar rasio tertinggi.
  - Klik kolom Vol Ratio dikonfirmasi berpindah ke halaman Volume Spike dengan `VS_STATE.ticker` yang sama persis.
  - Satu error konsol ("Cannot set properties of undefined (setting 'interaction')") muncul di sesi verifikasi ini — dikonfirmasi TERPISAH dari perubahan ini: direproduksi ulang di kode SEBELUM perubahan (`git stash`) dengan setup Playwright yang sama, errornya identik — murni keterbatasan stub Chart.js minimal yang dipakai untuk verifikasi di sandbox (CDN Chart.js diblokir jaringan), bukan regresi dari perubahan ini.
  - Screenshot dikirim ke user.
- `npm test` (154/154), `npm run lint` bersih. Cache-bust `07-flowscan.js?v=20260915a`.
- **Catatan:** tidak menyentuh halaman Volume Spike sama sekali (top-10, filter ≥1.70x, dst dari perbaikan-perbaikan sebelumnya tetap seperti apa adanya) — perubahan ini murni menambahkan sudut pandang volume ke Market Radar, drill-down ke Volume Spike untuk analisa mendalam kalau dibutuhkan.

## 2026-09-15 — Fix: grafik IHSG (Market Pulse) tidak reset saat pindah hari + tambah label jam (`public/js/01-data.js`, `public/js/28-decisiontools.js`)

- **Konteks:** user melaporkan (dengan screenshot) grafik IHSG di halaman Market Pulse ("Daily Brief") tidak reset saat pindah hari — nilai IHSG-nya sendiri benar, tapi bentuk grafiknya terlihat salah/tidak update, dan minta ditambahkan label jam pada sumbu-x.
- **Root cause:** `ihsgHist` (01-data.js) — buffer histori harga IHSG untuk chart "1D" — disimpan ke `localStorage` (`mw_ihsg_hist_v2`) sebagai array angka POLOS, TANPA timestamp apapun. Dua konsekuensi:
  1. **Tidak ada mekanisme reset lintas-hari sama sekali.** Saat app dibuka lagi besok, histori kemarin yang masih tersisa di localStorage dimuat apa adanya dan titik-titik baru hari ini ditambahkan di ATASNYA (buffer cap 120 titik, bergeser keluar perlahan seiring waktu) — jadi untuk sementara (bisa 30 menit-berjam-jam tergantung frekuensi update harga) chart "1D" sebenarnya menampilkan CAMPURAN sisa akhir sesi kemarin + awal sesi hari ini, persis pola "flat lalu ada lompatan tiba-tiba lalu turun ke level lain" yang terlihat di screenshot user.
  2. **Tidak bisa dikasih label jam** karena memang tidak ada informasi waktu tersimpan sama sekali per titik — makanya sumbu-x sengaja disembunyikan total (`x:{display:false}`) di kode sebelumnya, bukan pilihan desain, tapi karena tidak ada data valid untuk dijadikan label.
- **Perbaikan:**
  - `ihsgHistTs` array baru — menyimpan timestamp (epoch ms) untuk TIAP titik di `ihsgHist`, index-aligned 1:1. Kedua array tetap disimpan terpisah (bukan digabung jadi array of object) supaya konsumen lama yang membaca `ihsgHist` langsung sebagai array angka polos tidak perlu diubah strukturnya.
  - Key localStorage dinaikkan ke `mw_ihsg_hist_v3` (format `{v:[...],t:[...]}`) — versi lama (`v2`, tanpa timestamp) sengaja TIDAK dimigrasi (tidak ada timestamp untuk dikira-kira, dan ini memang cache disposable, sama seperti seluruh keluarga `mw_rd_*` lain di app).
  - **2 jalur reset lintas-hari**, keduanya membandingkan tanggal kalender (tahun-bulan-tanggal, berbasis jam lokal browser — konsisten dengan seluruh app yang tidak pernah eksplisit set timezone, karena diasumsikan pengguna Indonesia/WIB):
    1. **Saat load** (`IIFE` di `01-data.js`): titik dari hari SEBELUM hari ini langsung dibuang begitu histori dibaca dari localStorage — menangani kasus "browser ditutup total, dibuka lagi besok".
    2. **Saat push** (`ihsgHistPush()`): kalau titik terakhir yang tersimpan berasal dari hari yang BEDA dengan sekarang, seluruh histori lama dibuang dulu sebelum titik baru ditambahkan — menangani kasus "tab dibiarkan terbuka lewat tengah malam tanpa reload", supaya chart langsung mulai bersih-lagi begitu hari berganti, bukan pelan-pelan tergeser keluar oleh cap 120 titik.
  - `renderDailyBriefIhsgChart()` (28-decisiontools.js): label sumbu-x sekarang jam sungguhan dari `ihsgHistTs` (`toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit'})` — pola yang sama persis sudah dipakai di chart BTC/crypto lain di `05-assets.js`, bukan format baru), sumbu-x diaktifkan (`x:{display:true}`, dibatasi maks 6 tick biar tidak padat), dan tooltip judul menampilkan jam saat hover. Fallback ke label index kalau `ihsgHistTs` belum sinkron (state transisi sesaat).
- **Live verification (Playwright, server lokal):**
  - Simulasi "histori kemarin di localStorage" (timestamp 26 jam lalu) → setelah reload, `ihsgHist`/`ihsgHistTs` dikonfirmasi 0 (dibuang total saat load), bukan tercampur ke hari ini.
  - Simulasi "tab terbuka lewat tengah malam" (push 3 titik hari ini, tandai titik terakhir sebagai milik hari lain, push 1 titik baru) → histori lama dikonfirmasi ter-reset (dari 3 titik jadi 1 titik, cuma titik baru yang tersisa).
  - Chart Daily Brief dikonfirmasi: `scales.x.display:true` (sebelumnya `false`), `labels` berisi string jam format `"02.34"` dst (bukan lagi index angka `0,1,2,...`), warna tick mengikuti tema aktif.
  - Nol error konsol.
- `npm test` (154/154), `npm run lint` bersih. Cache-bust `01-data.js?v=20260915a`, `28-decisiontools.js?v=20260915a`.
- **Catatan:** ada chart IHSG LAIN yang terpisah di Dashboard (`buildIhsgChart()` di `03-engine.js`) — TIDAK disentuh dalam perbaikan ini karena arsitekturnya beda total (kurva 100% disintesis prosedural dari Open/High/Low/harga-sekarang, bukan dibangun dari histori tick riil seperti `ihsgHist`) dan tidak dilaporkan bermasalah oleh user. Screenshot yang dilaporkan user dikonfirmasi cocok persis dengan chart Daily Brief/Market Pulse yang diperbaiki di sini.

## 2026-09-15 — Rebrand v2: logo baru (tanpa "PRO"), topbar hanya ikon, login page dapat logo (`public/index.html`, `public/img/`)

- **Konteks:** user mengirim file logo baru (varian tanpa badge "PRO" dari logo sebelumnya, wordmark "MONEY WATCH" berbeda posisi/gaya) dan minta: (1) ganti logo aplikasi dengan ini, (2) hilangkan kata "PRO", (3) integrasikan ke tampilan dalam-aplikasi DAN halaman login, (4) jangan diubah sebisa mungkin, (5) khusus tampilan dalam-aplikasi, cukup ikonnya saja — tidak perlu kata-kata "Money Watch" sama sekali.
- **Analisis gambar sumber sebelum dipasang** (pola sama seperti rebrand v1): ikon grafis (pita "W" biru-cyan + aksen bar) di-crop terpisah dari wordmark "MONEY WATCH" di bawahnya (bounding-box dicari otomatis via analisis piksel non-putih, bukan tebak manual). Wordmark di gambar sumber berwarna navy pekat (`rgb(0,21,70)`, dicek sample piksel langsung) — didesain untuk latar putih/hitam solid, kontrasnya BURUK di atas `.auth-box` tema gelap app ini (`--bg3:#141414`, nyaris sama gelapnya). Kalau dipasang utuh apa adanya di halaman login, "MONEY" nyaris tak terbaca di tema gelap — mengulang persis masalah yang sudah diperbaiki di rebrand v1.
- **Keputusan desain (2 tempat berbeda, treatment beda sesuai permintaan user):**
  1. **Topbar (dalam-aplikasi):** HANYA `<img>` ikon — span teks "MONEYWATCH" dan badge "PRO" DIHAPUS TOTAL dari HTML (bukan disembunyikan via CSS), sesuai permintaan eksplisit "cukup logonya saja". `logoDivText` dikonfirmasi string kosong setelah perubahan.
  2. **Halaman login:** ikon gambar yang sama dipasang, TAPI wordmark "Money"+"Watch" di sebelahnya SENGAJA TETAP teks HTML asli (elemen `<span>` yang sudah ada sebelumnya, bukan wordmark bawaan gambar) — karena teks HTML itu sudah otomatis mengikuti `var(--text)`/`var(--text3)` tiap tema (kontras terjamin), sementara wordmark bawaan gambar TIDAK (masalah kontras di atas). Ini "mengubah" presentasi logo di halaman login tapi TIDAK mengubah satu piksel pun dari gambar ikon itu sendiri — bagian yang diminta user "jangan diubah" (ikonnya) benar-benar tidak disentuh; yang disesuaikan hanya cara wordmark ditampilkan (teks HTML, bukan raster).
- **Perbaikan:**
  - `public/img/logo-mark.png` diganti dengan ikon baru (314×240px, transparan) — dipakai di topbar DAN halaman login (1 file, 1 sumber kebenaran, ukuran beda diatur via atribut `height` HTML).
  - `public/img/favicon.png` diganti (128×128px, latar rounded-square navy gelap yang sama seperti rebrand v1) — ikon baru dipasang ke pola backdrop yang sudah ada.
  - Topbar (`public/index.html`): `<span class="logo">MONEYWATCH...PRO</span>` dihapus total.
  - Halaman login (`#auth-overlay .auth-logo`): `<svg class="auth-logo-svg">` (ikon SVG lama, rebrand v1 belum sempat menyentuh halaman ini) diganti `<img>` logo baru; teks "Money"+"Watch" tetap.
  - Kata "PRO" dihapus dari branding visual utama yang ditemukan: `<title>` tab browser ("Money Watch Pro" → "Money Watch"), `<meta property="og:title">`, heading `<h1>` Dashboard ("MoneyWatch Pro" → "MoneyWatch"), footer cetak laporan Pajak ("Money Watch Pro" → "Money Watch").
  - **SENGAJA TIDAK disentuh** (di luar cakupan "ganti logo", butuh konfirmasi terpisah): ~50 kemunculan lain "Pro" tersebar di nama persona AI Copilot/StockChat dalam respons chat ("MoneyWatch Pro AI"), judul dokumen ekspor PDF/Excel, nama file unduhan, komentar header tiap file JS, string notifikasi browser, dan system prompt Claude di `server.js` — mengganti semua itu adalah keputusan rebranding jauh lebih besar dari sekadar logo, dilaporkan ke user sebagai temuan terpisah, bukan diputuskan sepihak.
- **Live verification (Playwright, server lokal, kedua tema):**
  - Login page: `<img>` termuat sempurna, teks logo "MoneyWatch", `<title>` "Money Watch" (tanpa Pro). Screenshot dark & light dikirim — kontras penuh di keduanya, termasuk wordmark "Money"/"Watch".
  - Topbar (Mode Tamu): `logoDivText` dikonfirmasi STRING KOSONG (tidak ada teks apapun selain ikon gambar), `hasProText` dikonfirmasi `false` di seluruh topbar, gambar termuat sempurna. Screenshot dark & light dikirim.
  - Dashboard `<h1>` dikonfirmasi "MoneyWatch" (tanpa Pro).
  - Favicon terserve 200 OK.
  - Nol error konsol.
- `npm test` (154/154), `npm run lint` bersih. Cache-bust `img/logo-mark.png?v=20260915a`, `img/favicon.png?v=20260915a`.

## 2026-09-17 — Samakan desain kartu Analisis Teknikal Crypto dengan kartu Fundamental/Technical saham (`public/js/36-crypto-technical.js`)

- **Konteks:** user melaporkan desain halaman "Analisis Teknikal Crypto" (`page-crypto-technical`) tidak konsisten dengan halaman Fundamental (`page-fundamental`) dan Technical (`page-technical`) saham — minta disamakan.
- **Root cause:** halaman Fundamental/Technical saham memakai class CSS baku `.sm-card` (navy `#131B2E` di tema gelap, `#F8FAFC` di tema terang — auto-adaptif) dan `.sm-stat-box` (kotak statistik hitam-transparan) yang didefinisikan di `main.css`. Halaman Crypto Technical justru memakai warna inline ad-hoc `background:var(--bg2)`/`var(--bg3)` (variabel tema umum, resolve ke nyaris hitam `#0A0A0A`/`#141414` di tema gelap) untuk container section dan kartu statistiknya — kombinasi warna yang berbeda dari sistem desain `.sm-card` yang sudah baku dipakai di suite Fundamental/Technical, sehingga terlihat seperti dua sistem desain berbeda saat berpindah halaman.
- **Perbaikan:** di `renderCryptoHeaderSummary()`, `renderCryptoAnalysisTab()` (Whale Identifier, Volume Breakout, Matriks 15+ Indikator, TP/SL & Pivot), dan `renderCryptoScannerTab()` — semua wrapper section (`background:var(--bg2);border:1px solid var(--border);border-radius:14px;padding:20px`) diganti `class="sm-card"`, dan semua kotak statistik anak (`background:var(--bg3);border:1px solid var(--border2);border-radius:10px;padding:14px/16px`) diganti `class="sm-stat-box"` (dengan `text-align:left` di-override karena kontennya label+nilai+deskripsi bertumpuk, bukan center seperti pemakaian default). Tab 1 (Interactive Chart, sudah dibungkus `.sm-card-fill` di `index.html`) tidak disentuh karena sudah konsisten.
- **Live verification (Playwright, server lokal):** computed style kartu Tab 2 dikonfirmasi `backgroundColor: rgb(19,27,46)` (= `#131B2E`, identik dengan `.sm-card` di halaman Fundamental) dan stat-box `rgba(0,0,0,0.3)`. Screenshot Tab 1/2/3 tema gelap dan Tab 2 tema terang dibandingkan visual dengan halaman Fundamental — warna, radius, dan border kartu sekarang identik. Nol error konsol.
- `npm test` (154/154), `npm run lint` bersih. Cache-bust `36-crypto-technical.js?v=20260917a`.
- **Catatan:** kotak breakdown "Whale Tier Flow" (aksen border-kiri berwarna) dan header strip chart Tab 1 sengaja tidak diubah — motif border-kiri berwarna itu sendiri sudah dipakai juga di halaman Fundamental (mis. section sintesis kesimpulan), jadi bukan inkonsistensi.

## 2026-09-17 — AI Signal Reflection Log, Fase 1: skema tabel `ai_signal_log` (`sql/schema_migration.sql`)

- **Konteks:** rencana 4 fase (decision log + reflection loop, terinspirasi TauricResearch/TradingAgents) yang dibahas & dijadwalkan sebelumnya di sesi ini — Fase 1 dimulai atas konfirmasi user: cakupan hanya sinyal dari Copilot/StockChat (bukan Scanner/Radar pasif), `horizon_days` ditentukan per-sinyal (tidak ada default global), TANPA guard anti-duplikasi (revisi — desain awal sempat memakai guard "1 sinyal pending per user+ticker+source per hari", tapi user memutuskan dihapus: setiap sinyal dicatat apa adanya termasuk kalau ticker yang sama ditanya berkali-kali sehari).
- **Desain tabel:** `ai_signal_log` — satu BARIS per sinyal (beda bentuk dari `ai_paper_trading`/`ksei_ownership` yang satu blob jsonb per user), siklus `pending` → `resolved`/`expired`. Kolom kunci: `source` (check constraint `stockchat`/`copilot` saja), `ticker`, `signal_action` (enum sama dengan `computeStockSignal()` + sentinel `REVIEW` ala TradingAgents supaya output Copilot yang gagal di-parse tidak diam-diam jadi `HOLD`), `raw_snapshot` jsonb (kondisi pasar saat sinyal diemit, dipakai lagi Fase 2), lalu kolom hasil (`exit_price`, `raw_return_pct`, `benchmark_return_pct` — dari `fetchYahooHistory('^JKSE','SCAN')` yang sudah ada, tidak perlu sumber data baru — `alpha_return_pct`, `outcome`, `reflection_text`) yang diisi job resolusi Fase 2. RLS: pola identik `ai_paper_trading` (select/insert/update hanya baris `auth.uid()=user_id`, sengaja tanpa delete policy — log append-only).
- **Bug ditemukan & diperbaiki SEBELUM commit (bukan cuma baca dokumentasi Postgres):** desain awal memakai `generated always as (...) stored` untuk `resolve_after` (dari `emitted_at + horizon_days hari`). Dites langsung di Postgres 16 lokal (`service postgresql start` + database percobaan) — **gagal** dengan `ERROR: generation expression is not immutable`, karena aritmetika `timestamptz + interval` bergantung kalender/DST sehingga Postgres menolaknya sebagai generated column. Diperbaiki jadi kolom biasa (`resolve_after timestamptz not null`) yang wajib diisi eksplisit oleh kode aplikasi saat insert (dihitung di JS, bukan di database) — akan dikerjakan saat titik insert dibuat di Fase 3 (StockChat/Copilot).
- **Revisi guard:** kolom `signal_date` dan `unique index ai_signal_log_one_per_day` yang tadinya dibuat untuk guard 1-per-hari DIHAPUS TOTAL dari skema setelah user memutuskan tidak perlu guard — tidak disisakan sebagai kolom mati.
- **Verifikasi migrasi (Postgres 16 lokal, database percobaan terpisah, dihapus setelah selesai):**
  - Skema final (`create table`, 2 index, RLS + 3 policy) dijalankan bersih tanpa error.
  - Insert baris uji sukses; insert KEDUA dengan user+ticker+source+hari IDENTIK dikonfirmasi BERHASIL masuk (2 baris, bukan ditolak) — memverifikasi tidak ada guard tersisa.
  - Migrasi dijalankan DUA KALI berturut-turut (idempotensi, konvensi wajib file ini — "aman dijalankan kapan pun") — jalan run kedua bersih (semua `IF NOT EXISTS`/`DROP POLICY IF EXISTS` ter-skip dengan NOTICE, bukan error).
- **Belum dikerjakan (di luar Fase 1):** tidak ada kode aplikasi yang berubah — belum ada titik insert (`POST` dari StockChat/Copilot ke tabel ini), belum ada job resolusi Fase 2, belum ada UI. `npm test` tetap 154/154 (tidak tersentuh, murni migrasi SQL baru).

## 2026-09-17 — AI Signal Reflection Log, awal Fase 2: titik insert `cek_sinyal_teknikal` (`server.js`, `public/js/00-config.js`, `41-stockchat-cockpit.js`, `28-decisiontools.js`, `test_suite.js`)

- **Konteks:** user minta "mulai Fase 2" (job resolusi return). Sebelum coding, ditemukan gap: `ai_signal_log` (Fase 1) belum punya SATU PUN titik insert — job resolusi tidak akan pernah menemukan baris untuk diproses. Dikonfirmasi ke user, disepakati menyelesaikan titik insert dulu.
- **Temuan arsitektur yang mengubah rencana:** system prompt StockChat/Copilot (`SYSTEM_INSTRUCTION_MONEYWATCH_AI` di `server.js`) secara eksplisit melarang AI memberi rekomendasi beli/jual definitif ("Jangan pernah memberikan rekomendasi beli/jual secara definitif, hindari pom-pom"), dan tool `cek_harga`/`cek_fundamental` yang ada tidak mengembalikan field sinyal apa pun. Kalau sinyal dicoba diparse dari teks bebas jawaban AI, mayoritas akan jatuh ke sentinel `REVIEW` — merusak tujuan fitur ini. Diajukan ke user, dipilih opsi: tambah tool baru terstruktur.
- **Perbaikan:**
  - `server.js`: tool baru `cek_sinyal_teknikal` ditambahkan ke `AGENT_TOOL_DECLARATIONS` — memanggil `computeStockSignal()` (engine deterministik yang sama dipakai Market Radar/AI Trading Scanner, BUKAN reimplementasi) untuk satu ticker, dipanggil AI HANYA saat user eksplisit minta sinyal/rekomendasi ticker tertentu. `executeAgentTool()` dapat `case 'cek_sinyal_teknikal'` baru (degradasi ke `signal:'NO DATA'` kalau `computeStockSignal()` gagal, tidak pernah melempar exception atau mengarang). System prompt dapat Aturan Perilaku #11 (tetap wajib analisa dua sisi, sinyal ini "titik awal" bukan jawaban final) + tool ini ditambahkan ke daftar alur kerja.
  - `public/js/00-config.js`: fungsi baru `logAiSignalToReflectionLog(source, toolCalls)` — satu sumber kebenaran dipakai StockChat DAN Copilot (bukan diduplikasi). Filter hanya entri `cek_sinyal_teknikal` yang valid (skip `NO DATA`/error), skip total kalau guest/demo (`getAppUserId()` null) SEBELUM menyentuh `getSupabaseClient()` sama sekali (bug kecil ditemukan test sendiri, lihat di bawah), insert ke `ai_signal_log` dengan `horizon_days` per jenis sinyal (`AI_SIGNAL_LOG_HORIZON_DAYS`: BUY/STRONG BUY 15 hari, HOLD/WATCH 10 hari, AVOID 7 hari — heuristik awal, bukan angka final).
  - `41-stockchat-cockpit.js` & `28-decisiontools.js`: masing-masing memanggil `logAiSignalToReflectionLog('stockchat', ...)`/`logAiSignalToReflectionLog('copilot', ...)` setelah respons server sukses — cocok dengan check constraint `source` di skema Fase 1.
- **Bug ditemukan & diperbaiki oleh test yang baru ditulis sendiri (bukan cuma lolos kebetulan):** implementasi awal `logAiSignalToReflectionLog()` memanggil `getSupabaseClient()` SEBELUM mengecek `uid` — akibatnya di mode tamu, Supabase client tetap diinstansiasi sia-sia sebelum fungsi berhenti. Test regresi baru (`test_suite.js`) menangkap ini (`supabaseTouched` harus `false` di mode tamu, ternyata `true`) — diperbaiki jadi cek `uid` dulu, `return` lebih awal sebelum menyentuh Supabase sama sekali.
- **Test baru (`test_suite.js`, pola sandbox `vm` mengikuti TEST 84 `cek_prediksi_xgboost` yang sudah ada):**
  - `executeAgentTool('cek_sinyal_teknikal')`: hasil `computeStockSignal()` diteruskan apa adanya (deepStrictEqual), degradasi ke `NO DATA` + field `error` saat gagal, normalisasi ticker tetap benar di jalur gagal.
  - `logAiSignalToReflectionLog()`: mode tamu di-skip TANPA menyentuh Supabase sama sekali, entri `cek_harga`/`NO DATA` diabaikan (cuma 1 dari 3 toolCalls yang ter-insert), payload insert dicocokkan field-per-field, `horizon_days`/`resolve_after` untuk sinyal BUY dikonfirmasi tepat 15 hari.
- **Live verification (Playwright, server lokal):** simulasi guest mode (insert TIDAK dipanggil sama sekali) dan logged-in (insert tertangkap dengan payload lengkap, entri `NO DATA` & non-`cek_sinyal_teknikal` terfilter) dijalankan langsung di browser — hasil identik dengan test Node. Halaman StockChat & Copilot dikonfirmasi tetap render normal, nol error konsol.
- `npm test` 140/140 (naik dari 138 baseline pasca-merge PR #197 — 2 test baru), `npm run lint` bersih. Cache-bust `00-config.js?v=20260917a`, `28-decisiontools.js?v=20260917a`, `41-stockchat-cockpit.js?v=20260917a`.
- **Belum dikerjakan:** job resolusi return riil vs IHSG + refleksi Claude (sisa Fase 2 yang sesungguhnya) — baris `ai_signal_log` sekarang bisa mulai terisi, tapi belum ada yang membaca baris `pending` yang sudah lewat `resolve_after` dan mengisi kolom hasilnya. UI riwayat refleksi (Fase 4) juga belum ada.

## 2026-09-17 — AI Signal Reflection Log, Fase 2 selesai: job resolusi return riil vs IHSG + refleksi Claude (`server.js`, `public/js/00-config.js`, `41-stockchat-cockpit.js`, `28-decisiontools.js`, `test_suite.js`)

- **Konteks:** lanjutan langsung dari titik insert `cek_sinyal_teknikal` (entri sebelumnya) — sekarang baris `ai_signal_log` bisa mulai terisi, sisa Fase 2 adalah membaca baris `pending` yang `resolve_after`-nya sudah lewat, menghitung return riil ticker vs benchmark IHSG, dan meminta Claude menulis refleksi.
- **Perbaikan celah kecil sebelum job resolusi ditulis:** `computeStockSignal()` menomorkan `entry:null` untuk sinyal `AVOID` (tidak ada posisi dibuka) — tapi field `price` (harga pasar riil saat itu) tetap terisi. Tanpa fallback, baris `AVOID` yang sudah tercatat lewat titik insert sebelumnya TIDAK PERNAH bisa diresolusi (tidak ada harga acuan). `logAiSignalToReflectionLog()` di `00-config.js` diperbaiki: `entry_price` fallback ke `r.price` kalau `r.entry` null.
- **Arsitektur resolusi — tidak ada cron/worker terpisah:** app ini serverless (Vercel) dan SEMUA akses Supabase di aplikasi ini memang client-side lewat RLS (`auth.uid()=user_id`, dikonfirmasi lagi — server.js tidak pernah punya Supabase client). Job resolusi karena itu dijalankan di sesi pengguna sendiri (client-side), dipicu sekali per sesi (`ensureAiSignalLogResolved()`, guard flag, mirip pola `_aiCloudLoadedOnce` di AI Trading) dari pembukaan halaman StockChat ATAU Copilot — bukan job global lintas-user.
- **Perbaikan:**
  - `public/js/00-config.js`: `resolveDueAiSignals()` — ambil baris `pending` milik user yang `resolve_after <= now()` (dibatasi `AI_SIGNAL_RESOLVE_BATCH_LIMIT=10` per sesi, sisanya sesi berikutnya). `resolveOneAiSignal(row, client)` per baris: fetch histori ticker + IHSG lewat endpoint publik yang SUDAH ADA (`/api/idx/history/:ticker?tf=1M` — bukan endpoint baru), cari harga exit (titik PERTAMA pada/setelah `resolve_after` — bukan titik terdekat ke arah manapun, supaya tidak "mengintip" harga sebelum horizon selesai), hitung `raw_return_pct`/`benchmark_return_pct`/`alpha_return_pct`, klasifikasi `outcome` (WIN/LOSS/NEUTRAL — arah dibalik untuk AVOID/SELL: sinyal itu "menang" kalau harga TURUN), minta refleksi ke endpoint baru, lalu update baris jadi `resolved`. Baris tanpa `entry_price` sama sekali → `expired` (tidak dicoba lagi). Baris yang gagal fetch histori (jaringan/Yahoo down) → DIBIARKAN `pending` (dicoba lagi sesi berikutnya, BUKAN expired — kegagalan transient bukan alasan menyerah).
  - `server.js`: endpoint baru `POST /api/ai/signal-reflection` — TIDAK menyentuh Supabase sama sekali (menerima angka yang SUDAH dihitung client, tidak fetch harga apa pun sendiri), minta Claude menulis refleksi 2-4 kalimat post-mortem (eksplisit "bukan rekomendasi baru" di prompt). Template deterministik jadi fallback kalau Claude API tidak terkonfigurasi ATAU panggilan gagal — baris tetap ter-resolve dengan refleksi jujur (angka riil) daripada `reflection_text` kosong selamanya.
  - `41-stockchat-cockpit.js`/`28-decisiontools.js`: `ensureAiSignalLogResolved()` dipanggil di awal `renderStockChatPage()`/`renderCopilotPage()`.
- **Test baru (`test_suite.js`, pola sandbox `vm`):**
  - Scenario ke-3 di test `logAiSignalToReflectionLog()`: sinyal AVOID (`entry:null, price:8500`) dikonfirmasi tercatat dengan `entry_price:8500` (bukan `null`) dan `horizon_days:7`.
  - Test baru `resolveOneAiSignal()`/`resolveDueAiSignals()`: (1) baris tanpa `entry_price` dikonfirmasi `expired` TANPA pernah memanggil `fetch()` sama sekali; (2) resolusi BUY riil (entry 9000→exit 9450, IHSG 6500→6500 flat) dikonfirmasi `raw_return_pct:5`, `benchmark_return_pct:0`, `alpha_return_pct:5`, `outcome:'WIN'`, exit price diambil dari titik PERTAMA setelah `resolve_after` (bukan titik yang lebih awal/lebih akhir); (3) kegagalan fetch histori (transient) dikonfirmasi TIDAK memanggil `update()` sama sekali — baris dibiarkan pending; (4) sinyal AVOID dengan harga benar-benar turun dikonfirmasi `outcome:'WIN'` (arah dibalik dari BUY).
- **Live verification (Playwright, server lokal):**
  - End-to-end TANPA mock histori: dikonfirmasi endpoint `/api/idx/history/*` di sandbox ini mengembalikan `Yahoo Finance API status 403` (diblokir jaringan sandbox, bukan bug) — `resolveOneAiSignal()` dikonfirmasi BENAR membiarkan baris (0 pemanggilan `update()`), membuktikan jalur "gagal transient" bekerja di browser sungguhan, bukan cuma di test unit.
  - End-to-end dengan histori di-mock via `page.route()` TAPI endpoint `/api/ai/signal-reflection` HIT SERVER ASLI (bukan mock): pipeline penuh dikonfirmasi jalan — baris ter-update jadi `resolved` dengan `raw_return_pct:5, benchmark_return_pct:0, alpha_return_pct:5, outcome:'WIN'`, dan `reflection_text` berisi teks template fallback nyata dari server (karena `ANTHROPIC_API_KEY` tidak ada di sandbox ini).
  - `curl` langsung ke `/api/ai/signal-reflection`: path sukses (template fallback) dan validasi input (400 saat field wajib kosong) dikonfirmasi.
  - Halaman StockChat & Copilot dikonfirmasi tetap render normal, nol error konsol.
- `npm test` 141/141 (naik dari 140 — 1 test baru + 1 skenario tambahan di test lama), `npm run lint` bersih. Cache-bust `00-config.js?v=20260917b`, `28-decisiontools.js?v=20260917b`, `41-stockchat-cockpit.js?v=20260917b`.
- **Belum dikerjakan:** UI riwayat refleksi (Fase 4) — baris `ai_signal_log` sekarang bisa terisi DAN teresolusi otomatis, tapi belum ada halaman untuk user melihat riwayat sinyal masa lalu beserta refleksinya. Injeksi refleksi historis ke prompt Copilot/StockChat (bagian dari Fase 3 yang belum dikerjakan) juga belum ada — refleksi baru tersimpan di database, belum dibaca kembali oleh AI untuk percakapan berikutnya.

## 2026-09-17 — AI Signal Reflection Log, Fase 3: injeksi riwayat refleksi ke prompt + guard sentinel REVIEW (`server.js`, `public/js/00-config.js`, `41-stockchat-cockpit.js`, `28-decisiontools.js`, `test_suite.js`)

- **Konteks:** lanjutan langsung dari Fase 2 (job resolusi) — sekarang baris `ai_signal_log` bisa terisi DAN teresolusi otomatis dengan refleksi. Fase 3 menyambungkan siklusnya: refleksi yang sudah tersimpan disuntikkan kembali ke percakapan Copilot/StockChat berikutnya, supaya AI benar-benar "belajar" dari sinyal masa lalu — bukan cuma tersimpan diam di database.
- **Arsitektur — pola sama seperti `aiPaperTrading`/`xgboostPrediction` yang sudah ada:** server.js tidak pernah punya akses Supabase sendiri (dikonfirmasi lagi), jadi riwayat sinyal HARUS diambil client-side lalu dikirim di `userContext` tiap pesan — bukan API baru untuk itu.
- **Perbaikan:**
  - `public/js/00-config.js`: `getAiSignalHistorySummary()` — ambil 10 baris `resolved` terakhir milik user (lintas ticker, `order by resolved_at desc`), map dari bentuk kolom database (snake_case) ke bentuk camelCase yang dipakai server.
  - `41-stockchat-cockpit.js`/`28-decisiontools.js`: panggil fungsi di atas sebelum kirim pesan, sertakan sebagai `userContext.aiSignalHistory` (mirip persis `aiPaperTrading`).
  - `server.js`, `case 'cek_sinyal_teknikal'`: filter `userContext.aiSignalHistory` per TICKER YANG SEDANG DITANYA (baru diketahui di titik ini setelah tool dipanggil — client mengirim riwayat lintas-ticker apa adanya, filter terjadi di server), dibatasi 3 entri terakhir, dilampirkan sebagai field baru `pastSignals` di hasil tool.
  - **Guard sentinel `REVIEW`** (terinspirasi TradingAgents): `ai_signal_log.signal_action` punya CHECK constraint enum tetap. Kalau `computeStockSignal()` suatu saat berubah dan mengembalikan nilai di luar enum yang dikenal (drift dari constraint DB), sinyal dipaksa jadi `'REVIEW'` + field `reviewReason` — TIDAK diteruskan apa adanya (nanti INSERT ke Supabase gagal diam-diam saat dicatat) dan TIDAK diam-diam dianggap `'HOLD'`.
  - System prompt: Aturan Perilaku #11 diperluas (jelaskan makna `signal:"REVIEW"` — bukan sama dengan HOLD), Aturan Perilaku #12 baru — kalau `pastSignals` tidak kosong, AI WAJIB menyebutkan track record (return riil vs IHSG, WIN/LOSS) SEBELUM menyajikan sinyal baru, termasuk mengakui kalau sinyal lama ternyata salah — transparansi, bukan pom-pom retroaktif.
- **Bug pengujian ditemukan & diperbaiki (bukan bug produksi, tapi test yang jadi palsu-lolos):** test lama untuk `cek_sinyal_teknikal` memakai `assert.deepStrictEqual(r1, fakeSignal)` di mana `r1` dan `fakeSignal` ternyata REFERENSI OBJEK YANG SAMA (tool memutasi objek input langsung untuk menambah `pastSignals`) — assert itu jadi selalu lolos apa pun yang ditambahkan, tidak menguji apa-apa lagi. Diperbaiki jadi pengecekan field-per-field eksplisit. Ditemukan juga gotcha cross-realm `vm` yang sudah didokumentasikan di tempat lain di file ini (array yang dibuat di dalam sandbox `vm` beda konstruktor dari array literal di luar, `assert.deepStrictEqual` menolaknya) — diperbaiki dengan `Array.from()` sebelum dibandingkan.
- **Test baru/diperluas (`test_suite.js`, pola sandbox `vm`):**
  - `cek_sinyal_teknikal`: sinyal valid diteruskan apa adanya + `pastSignals:[]` saat tidak ada riwayat; filter `pastSignals` per-ticker (case-insensitive) dari riwayat lintas-ticker, dibatasi 3 entri, urutan dipertahankan; guard `REVIEW` dikonfirmasi menimpa nilai sinyal yang tidak dikenal beserta `reviewReason`.
  - `getAiSignalHistorySummary()`: guest mode dikonfirmasi TIDAK PERNAH menyentuh Supabase; query logged-in dikonfirmasi filter `user_id`/`status='resolved'`/urutan `resolved_at desc`; mapping snake_case→camelCase dikonfirmasi field-per-field.
- **Live verification (Playwright, server lokal):** endpoint `/api/ai/agent-chat` di sandbox ini jatuh ke fallback deterministik (tidak ada `ANTHROPIC_API_KEY`, tidak memanggil `cek_sinyal_teknikal` — perilaku memang berbeda dari loop agentic Claude, bukan bug) — dikonfirmasi sesuai ekspektasi lewat `curl`. Bagian yang BISA diverifikasi langsung: `page.route()` menangkap body request nyata dari StockChat DAN Copilot, keduanya dikonfirmasi menyertakan `userContext.aiSignalHistory` dengan benar sebelum dikirim ke server. Halaman StockChat & Copilot dikonfirmasi tetap render normal, nol error konsol.
- `npm test` 142/142 (naik dari 141 — 1 test baru + perluasan test lama), `npm run lint` bersih. Cache-bust `00-config.js?v=20260917c`, `28-decisiontools.js?v=20260917c`, `41-stockchat-cockpit.js?v=20260917c`.
- **Belum dikerjakan:** UI riwayat sinyal + refleksi untuk user (Fase 4) — data lengkap sudah ada (tercatat, teresolusi, disuntik balik ke AI), tapi user sendiri belum punya cara melihatnya langsung di aplikasi selain lewat jawaban AI yang menyebutkannya.

## 2026-09-17 — AI Signal Reflection Log, Fase 4 (terakhir): UI Riwayat Sinyal AI (`public/js/47-ai-signal-history.js`, `public/index.html`, `public/js/06-analysis-router.js`, `test_suite.js`)

- **Konteks:** penutup rencana 4 fase "AI Signal Reflection Log". Fase 1-3 sudah lengkap (skema, resolusi otomatis, injeksi ke prompt), tapi user sendiri belum punya cara melihat riwayat sinyalnya — semua informasi hanya bisa "dilihat" lewat jawaban AI yang kebetulan menyebutkan track record. Fase 4 menambahkan halaman baca langsung.
- **Perbaikan:**
  - Halaman baru `public/js/47-ai-signal-history.js`, `#page-ai-signal-history` — ditempatkan di grup sidebar AI TRADING (setelah AI Copilot), sesuai pengelompokan tematik yang sudah ada.
  - Guard mode tamu: tampilkan pesan "fitur ini butuh akun" TANPA sekalipun memanggil `getSupabaseClient()` — konsisten dengan pola guard di seluruh fitur `ai_signal_log` lain (Fase 1-3).
  - Baca langsung dari Supabase client-side (RLS, `auth.uid()=user_id`) — SEMUA status (`pending`/`resolved`/`expired`), bukan cuma `resolved` seperti `getAiSignalHistorySummary()` (Fase 3) yang khusus untuk injeksi prompt.
  - Kartu ringkasan: total sinyal, jumlah menunggu resolusi, win rate (WIN/(WIN+LOSS), sengaja mengeluarkan NEUTRAL dari penyebut — bukan skewing angka dengan sinyal yang tidak punya arah tegas), rata-rata alpha vs IHSG (hanya dari baris `resolved`).
  - Tabel riwayat lengkap: tanggal, ticker, sumber (stockchat/copilot), sinyal (badge warna sesuai arah), status, entry→exit, return riil/IHSG/alpha (warna hijau/merah sesuai tanda), badge hasil WIN/LOSS/NEUTRAL, refleksi (dipotong dengan tooltip teks penuh).
  - Tombol "Jalankan Resolusi Sekarang" — memanggil `resolveDueAiSignals()` (Fase 2) langsung dari UI, tidak perlu menunggu buka StockChat/Copilot dulu untuk memicu resolusi.
- **Test baru (`test_suite.js`, pola sandbox `vm` dengan `document.getElementById` mock — mengikuti pola `getDossierContext()` yang sudah ada untuk `46-stock-dossier.js`, bukan pola baru):**
  - Mode tamu dikonfirmasi TIDAK PERNAH menyentuh Supabase, menampilkan notice yang benar.
  - Statistik ringkasan dihitung dari 4 baris campuran status (`resolved`×3 dengan outcome WIN/LOSS/NEUTRAL + `pending`×1): win rate dikonfirmasi 50% (1 WIN dari 2 outcome tegas, NEUTRAL dikonfirmasi TIDAK ikut penyebut), rata-rata alpha dikonfirmasi `+2.33%` (rata-rata 3 baris resolved SAJA, baris pending dikonfirmasi tidak ikut terhitung).
  - Render baris: warna return positif dikonfirmasi hijau (`#10B981`), badge sinyal BUY dikonfirmasi kelas `b-up`, baris pending tanpa data return dikonfirmasi menampilkan placeholder `—` (bukan `undefined%` atau crash).
- **Live verification (Playwright, server lokal, kedua tema):**
  - Mode tamu: screenshot dikonfirmasi menampilkan notice yang benar.
  - Logged-in (Supabase di-stub): screenshot tema gelap & terang dikonfirmasi kartu ringkasan dan tabel identik dengan desain `.sm-card`/`.tbl` yang sudah dipakai di seluruh aplikasi, kontras terjamin di kedua tema.
  - Tombol "Jalankan Resolusi Sekarang" dikonfirmasi memanggil `resolveDueAiSignals()` yang sesungguhnya lewat klik langsung di DOM (bukan cuma pemanggilan fungsi manual).
  - Nol error konsol di semua skenario.
- `npm test` 143/143 (naik dari 142 — 1 test baru), `npm run lint` bersih. File baru `47-ai-signal-history.js?v=20260917a`.
- **Rencana 4 fase "AI Signal Reflection Log" SELESAI:** Fase 1 (skema) → Fase 2 (resolusi otomatis) → Fase 3 (injeksi ke prompt + guard REVIEW) → Fase 4 (UI baca). Siklus penuh: StockChat/Copilot mengeluarkan sinyal → tercatat → diresolusi otomatis dengan return riil vs IHSG → direfleksikan Claude → disuntik balik ke percakapan berikutnya → bisa dilihat user langsung di halaman Riwayat Sinyal AI.

## 2026-09-17 — Audit + perbaikan toolbar AI Engine: status "AI Engine Live" & dot Supabase palsu (`server.js`, `public/js/00-config.js`, `public/js/06-analysis-router.js`, `public/index.html`, `test_suite.js`)

- **Konteks:** user minta audit khusus toolbar AI Engine untuk kode bertabrakan/bug, dead code, dan data hardcoded. Diperiksa `bottom-toolbar` (`public/index.html:4399-4430`) elemen per elemen.
- **Temuan 1 [BUG, dikonfirmasi bukan dugaan]:** indikator "AI Engine Live" (dot hijau + teks) di `bottom-toolbar` adalah HTML statis — grep seluruh `public/js/*.js` menghasilkan NOL referensi ke elemen ini, dan tidak ada mekanisme health-check AI apa pun di codebase. Dibuktikan langsung: `ANTHROPIC_API_KEY` TIDAK terkonfigurasi di sandbox sesi ini (dikonfirmasi lewat `curl` ke `/api/ai/agent-chat` di sesi-sesi sebelumnya — selalu fallback deterministik), tapi toolbar tetap mengklaim hijau "Live".
- **Temuan 2 [dead code/dekorasi palsu]:** `sh-topbar-dot` (dot di tombol "Pengaturan & Data", title "Supabase Cloud & Live Feed Aktif") — grep menghasilkan NOL referensi JS. Hijau permanen tanpa pengecekan apa pun, klaim di title-nya tidak pernah diverifikasi.
- **Tidak ditemukan:** tabrakan kode (ID duplikat, konflik CSS z-index/position, `onclick` menunjuk fungsi tidak ada) — bagian lain toolbar yang sama (`topbar-last-sync-badge`/`topbar-sync-icon`/`topbar-last-updated-time`, `clock`, `session-info`) dikonfirmasi BERSIH, benar-benar wired ke kode nyata (`03-engine.js`, `08-auth.js`).
- **Perbaikan:**
  - `server.js`: endpoint baru `GET /api/ai/status` — mengembalikan `{available: !!getAiClient(), model}`. TIDAK memanggil Claude API sama sekali (cuma cek env var/instansiasi SDK), instan & gratis, aman dipanggil tiap boot halaman.
  - `public/js/00-config.js`: `checkAiEngineStatus()` (fetch endpoint di atas, 3 state berbeda: hijau "AI Engine Live" / amber "AI Engine Fallback" / merah "AI Engine Offline" saat fetch gagal) dan `checkSupabaseCloudStatus()` (probe nyata via `client.auth.getSession()` dengan timeout 5 detik, bukan sekadar cek `getSupabaseClient()` truthy — itu cuma bukti SDK termuat, bukan bukti konektivitas).
  - `public/js/06-analysis-router.js`: kedua fungsi dipanggil sekali saat boot (`DOMContentLoaded`), setelah `updateAllLastSyncTimestamps()`.
  - `public/index.html`: dot & label diberi `id` (`ai-engine-status-dot`/`ai-engine-status-label`), warna default diubah ke abu-abu netral ("Memeriksa...") sebelum hasil cek pertama datang — BUKAN lagi hijau-dulu-baru-dikoreksi (yang tetap akan salah kalau race condition/timeout).
- **Test baru (`test_suite.js`):**
  - `GET /api/ai/status`: dikonfirmasi derive dari `getAiClient()` asli (bukan flag terpisah), dan dikonfirmasi TIDAK pernah memanggil `callClaudeWithRetry`/Claude API di dalam handler-nya.
  - `checkAiEngineStatus()`: 3 skenario (available:true → hijau "Live", available:false → amber "Fallback" dengan title menyebut `ANTHROPIC_API_KEY` secara eksplisit, fetch gagal → merah "Offline") — dikonfirmasi ketiganya BEDA state, bukan diam-diam disamakan (itu persis bug yang diperbaiki).
  - `checkSupabaseCloudStatus()`: client null → merah + title "SDK gagal termuat" tanpa crash; client ada + `getSession()` sukses → hijau (jalur sukses juga diverifikasi nyata, bukan cuma "sekarang selalu merah" sebagai overcorrection).
  - **Bug ditemukan di test sendiri saat menulis skenario sukses:** sandbox `vm` tidak menyediakan `setTimeout` secara default — `Promise.race` di `checkSupabaseCloudStatus()` yang memakai `setTimeout` di dalam executor langsung reject synchronous (ReferenceError) begitu dijalankan di sandbox tanpa `setTimeout`, membuat skenario "sukses" salah menghasilkan merah. Diperbaiki dengan menambahkan `setTimeout: setTimeout` ke sandbox — bug di test harness, bukan di kode aplikasi (di browser sungguhan `setTimeout` selalu ada secara global).
- **Live verification (Playwright, server lokal):**
  - Dikonfirmasi endpoint `/api/ai/status` mengembalikan `available:false` (sesuai kondisi nyata sandbox ini, tanpa `ANTHROPIC_API_KEY`) via `curl` langsung.
  - Toolbar dikonfirmasi menampilkan "AI Engine Fallback" (amber, `rgb(245,158,11)`) — BUKAN lagi hijau palsu. Screenshot dikirim.
  - Dot Supabase dikonfirmasi merah — root cause diverifikasi LANGSUNG (bukan tebakan): `page.on('requestfailed')` menangkap `https://cdn.jsdelivr.net/.../supabase.js :: net::ERR_TUNNEL_CONNECTION_FAILED` (CDN diblokir jaringan sandbox ini, sama seperti Yahoo Finance yang sudah dikonfirmasi 403 di sesi-sesi sebelumnya) — `window.supabase` dikonfirmasi `undefined`. Ini justru MEMBUKTIKAN fix bekerja benar: sebelum perbaikan, dot akan tetap hijau meski SDK gagal total dimuat; sekarang merah dengan pesan yang jujur.
  - Nol error konsol.
- `npm test` 145/145 (naik dari 143 — 2 test baru), `npm run lint` bersih. Cache-bust `00-config.js?v=20260917d`, `06-analysis-router.js?v=20260917a`.
- **Catatan:** di lingkungan production sungguhan (Vercel, akses internet penuh), dot Supabase akan benar-benar menguji konektivitas ke `*.supabase.co` (bukan cuma memastikan SDK termuat seperti di sandbox ini) — perilaku merah di sini adalah konsekuensi jujur dari keterbatasan jaringan sandbox, bukan bug baru.

## 2026-09-17 — Audit toolbar Master Dossier: CSS variable salah nama + bug kalkulasi confidence 0% (`public/js/46-stock-dossier.js`, `test_suite.js`)

- **Konteks:** user minta audit khusus toolbar Master Dossier (search bar + quick ticker + action bar) untuk kode bertabrakan/bug, dead code, data hardcoded — lalu diminta lanjut cek kalkulasi/hasil perhitungannya secara terpisah.
- **Temuan 1 [BUG CSS, dikonfirmasi]:** toolbar (dan 47 tempat lain di file yang sama) memakai `var(--card)` (10×) dan `var(--text1)` (38×) — DUA variabel yang TIDAK PERNAH didefinisikan di `main.css` maupun `wealth.css` (kemungkinan sisa adaptasi dari sistem desain lain, mis. shadcn yang memang punya `--card`/`--foreground`). Dibuktikan lewat `getComputedStyle`: `background-color` toolbar = `rgba(0,0,0,0)` (transparan total) — search bar/quick-ticker row menyatu tanpa batas dengan latar halaman di tema gelap, beda dari kartu lain di halaman yang sama.
- **Perbaikan 1:** `sed` global `var(--card)` → `var(--bg2)`, `var(--text1)` → `var(--text)` (variabel asli app, sudah dipakai konsisten di file lain). Diverifikasi ulang: `background-color` toolbar sekarang `rgb(8,12,20)` (navy asli), screenshot dikirim.
- **Temuan 2 [BUG KALKULASI, ditemukan dari audit lanjutan "cek hasil perhitungan"]:** kartu "Market Regime IHSG & AI" di halaman yang sama menampilkan DUA nilai confidence BERBEDA untuk data yang sama persis: badge menunjukkan "Confidence: 75%" tapi teks ringkasan di bawahnya menunjukkan "IHSG Regime: REGIME NETRAL (Confidence: 0%)". Ditemukan lewat cara yang sama seperti audit toolbar sebelumnya — recompute manual angka yang tertampil di layar, bukan tebak-tebakan.
  - **Root cause:** `dossierComputeRegimeScore()` menghitung `regimeConfidence` dengan benar (0, nilai riil untuk regime "UNKNOWN") — teks `reason` memakainya langsung dan benar ("Confidence: 0%"). Tapi badge di kartu memakai ekspresi `rp.regimeConfidence || 75` — karena `0` itu falsy di JavaScript, `0 || 75` mengembalikan **75**, bukan 0. Classic falsy-zero bug: fallback `|| 75` dimaksudkan untuk data yang HILANG (undefined/null), tapi ikut menimpa 0 yang justru merupakan hasil perhitungan valid.
  - **Verifikasi independen sebelum & sesudah fix:** dipanggil `dossierComputeRegimeScore({regime:{regime:'UNKNOWN',confidence:0}})` langsung di Node — dikonfirmasi `regimeConfidence:0` (benar), lalu expression `res.regimeConfidence || 75` dikonfirmasi mengembalikan **75** (bug, sebelum fix di lokasi render).
  - **Cek menyeluruh untuk pola sama:** grep semua `|| [angka]` di file ini (14 titik) — HANYA baris ini yang punya fallback non-nol untuk field yang bisa legitimately bernilai 0; sisanya semua `|| 0` (aman, karena 0 fallback ke 0 tetap benar).
- **Perbaikan 2:** `(rp.regimeConfidence || 75)` → `(typeof rp.regimeConfidence === 'number' ? rp.regimeConfidence : 75)` — 75 tetap jadi fallback HANYA saat data benar-benar tidak ada (bukan number), bukan saat datanya 0.
- **Audit kalkulasi inti (diminta eksplisit oleh user, bukan cuma dicek sekilas):** formula "Dynamic Denominator Renormalization" (`dossierCalculateCompositeScore()`) diverifikasi dengan cara paling ketat — recompute MANUAL angka yang tertampil di layar (Master Score 62/100, Confidence 65%, BBCA, 4 dari 6 pilar tersedia: valuasi=65, smartMoney=50, fundamental=80, regime=50, bobot default 20/20/15/10):
  - `weightedScoreSum = 65×20 + 50×20 + 80×15 + 50×10 = 1300+1000+1200+500 = 4000`
  - `totalAvailableWeight = 20+20+15+10 = 65`
  - `compositeScore = round(4000/65) = round(61.54) = 62` ✓ COCOK PERSIS dengan tampilan
  - `confidenceLevel = round(65/100×100) = 65%` ✓ COCOK PERSIS dengan tampilan
  - Verdict "NEUTRAL / WAIT (DATA TERBATAS)" juga dikonfirmasi benar: 62 jatuh di bracket `>=50` (NEUTRAL/WAIT), dan confidence 65% < 70% memicu suffix "(DATA TERBATAS)" — sesuai kode.
  - **Kesimpulan: formula inti composite score BENAR**, sudah cocok 1:1 dengan hasil yang ditampilkan — bug yang ditemukan (Temuan 2) murni di lapisan render badge, bukan di kalkulasi intinya.
- **Bagian lain yang dicek dan dikonfirmasi AMAN (tidak ada bug):**
  - Slider bobot analisis (`dossierOnSliderChange`/`dossierSubmitCustomWeights`) — tidak ada logika auto-redistribusi berisiko rounding, cuma validasi sum===100 manual sebelum tombol Simpan aktif.
  - Formula Graham Number (`sqrt(22.5 × EPS × BVPS)`) dan Margin of Safety (`(fairValue-price)/fairValue×100`) — cocok formula standar Benjamin Graham.
  - Preset bobot (`DOSSIER_PRESETS`) — 4 preset dikonfirmasi (test sudah ada sebelumnya) semuanya sum tepat 100%.
  - Tidak ada dead code (23 fungsi `dossier*` semua dikonfirmasi dipanggil), tidak ada tabrakan ID/fungsi dengan file lain.
- **Test baru (`test_suite.js`):** regresi khusus falsy-zero bug — dikonfirmasi FAIL tanpa fix (`rp.regimeConfidence || 75` mengembalikan 75%) dan PASS dengan fix, lewat render halaman penuh (`renderStockDossierPage`) dengan skenario `regime:{confidence:0}`, memeriksa HTML akhir literal menampilkan "0%" bukan "75%".
- **Live verification (Playwright, server lokal):** BBCA di-load ulang setelah fix — `window.dossierState.scoringResult.pillars.regime.regimeConfidence` dikonfirmasi `0`, teks kartu dikonfirmasi KONSISTEN di kedua tempat ("Confidence: 0%" muncul 2×, bukan lagi 75% vs 0%). Screenshot dikirim. Nol error konsol.
- `npm test` 146/146 (naik dari 145 — 1 test baru), `npm run lint` bersih.
- **Catatan:** `var(--text1)` (pola CSS var salah nama yang sama) juga ditemukan 3× di `public/js/33-trending-news.js` — DI LUAR cakupan audit ini (toolbar Master Dossier), tidak disentuh, dilaporkan sebagai temuan terpisah untuk keputusan user.

## 2026-09-17 — Perbaikan lanjutan: `var(--text1)` di `public/js/33-trending-news.js` + ditemukan widget ini sepenuhnya dead code

- **Konteks:** lanjutan dari catatan terpisah di audit Master Dossier — user minta `var(--text1)` (3 kemunculan di baris 92, 196, 237) di file ini juga diperbaiki.
- **Perbaikan:** `sed` global `var(--text1)` → `var(--text)`, sama seperti perbaikan di `46-stock-dossier.js`.
- **Temuan tambahan [DEAD CODE, ditemukan saat verifikasi live]:** fitur "Trending Financial News" ini SEPENUHNYA tidak pernah tampil di UI mana pun:
  - `renderTrendingNews()` mencari `document.getElementById('dash-trending-news-container')` — ID ini **tidak ada di `public/index.html` manapun** (dikonfirmasi grep menyeluruh, 0 hasil). Setiap panggilan langsung `return` di baris pertama (`if (!container) return;`), tidak pernah merender apa pun.
  - Satu-satunya pemanggil (`renderTrendingNews()`) ada di `public/js/04-render.js:526`, tapi diletakkan di dalam `renderTransaksi()` (render halaman Transaksi) — BUKAN di dalam render Dashboard, tempat yang secara logis dimaksudkan (nama container-nya sendiri `dash-trending-news-*`).
  - Riwayat git (`git log -S "dash-trending-news-container"`) tidak menemukan commit mana pun yang pernah menambahkan ID ini ke `index.html` — kemungkinan container-nya dihapus di suatu redesign (mis. commit lain "replace complex landing page"/restyle sidebar dari kontributor lain di riwayat repo ini) tanpa ikut membersihkan pemanggil JS-nya.
  - **Dampak:** perbaikan CSS var di atas SECARA TEKNIS BENAR tapi saat ini tidak terlihat di mana pun karena widget-nya sendiri tidak pernah dimuat ke DOM — tidak bisa diverifikasi visual secara langsung (dikonfirmasi lewat Playwright: `document.getElementById('dash-trending-news-container')` selalu `null`).
  - **Sengaja TIDAK diperbaiki sepihak** (di luar cakupan permintaan "perbaiki var(--text1)"): menambahkan kembali container ke Dashboard, atau memindahkan panggilan dari `renderTransaksi()` ke tempat yang benar, adalah keputusan produk (apakah fitur ini masih diinginkan) yang butuh konfirmasi user, bukan sekadar bug CSS.
- `npm test` 146/146 (tidak berubah — tidak ada test yang meng-cover widget mati ini), `npm run lint` bersih. Cache-bust `33-trending-news.js?v=20260917a`.

## 2026-09-17 — Hapus widget mati "Trending Financial News" (`public/js/33-trending-news.js`)

- **Konteks:** lanjutan dari temuan dead code di atas — user memutuskan widget ini bukan bagian fitur aktif dan minta dihapus, bukan dihidupkan kembali.
- **Perubahan:**
  - `public/js/33-trending-news.js` — file dihapus sepenuhnya (seluruh isinya, termasuk `fetchTrendingNews()`, `renderTrendingNews()`, `inspectNewsTicker()`, tidak pernah dijangkau UI mana pun sejak container `dash-trending-news-container` hilang dari `index.html`).
  - `public/index.html` — tag `<script src="js/33-trending-news.js?v=20260917a"></script>` dihapus.
  - `public/js/04-render.js` — blok pemanggil `if (typeof renderTrendingNews === 'function') { try { renderTrendingNews(); } catch... }` di dalam `renderTransaksi()` (baris ~526-528) dihapus.
  - `README.md` — baris deskripsi `js/33-trending-news.js` di tabel struktur file dihapus.
- **Tidak diikutsertakan (sengaja, di luar cakupan "hapus widget-nya"):** endpoint backend `GET /api/trending-news` di `server.js` (beserta `newsCache`, `claudeExtractGroundingChunks()`) sekarang jadi orphaned juga karena tidak ada lagi caller di frontend — belum dihapus karena permintaan eksplisit hanya menyebut "widget" (sisi UI). Dilaporkan sebagai temuan terpisah bila user ingin membersihkan sisi backend juga.
- **Verifikasi:** `node -c public/js/04-render.js`, `node -c server.js` — sukses. `npm test` 175/175 lulus (tidak berkurang — tidak ada test yang meng-cover widget mati ini). `npm run lint` bersih.

## 2026-09-17 — Hapus endpoint backend orphaned `GET /api/trending-news` (`server.js`)

- **Konteks:** lanjutan dari penghapusan widget "Trending Financial News" — user minta endpoint backend-nya juga dibersihkan sekalian karena sudah tidak punya caller di frontend.
- **Perubahan (`server.js`):** dihapus seluruhnya — route `app.get('/api/trending-news', ...)`, state `newsCache` (cache TTL 5 menit + backoff rate-limit), dan komentar audit lama terkait `getFallbackHeadlines()` yang sudah tidak relevan.
- **Tidak dihapus:** `claudeExtractText()` dan `claudeExtractGroundingChunks()` — masih dipakai fitur lain (Copilot/StockChat AI reply, market briefing) di beberapa lokasi lain di `server.js`.
- **Verifikasi:** `node -c server.js` sukses. `npm test` 175/175 lulus (tidak berkurang — tidak ada test yang meng-cover endpoint ini). `npm run lint` bersih. Server dijalankan lokal: `GET /api/trending-news` sekarang mengembalikan `404` (route benar-benar hilang), halaman utama tetap `200`.

## 2026-09-17 — Bug data loss lintas-device: Rekening Bank/Hutang/Piutang hilang saat pindah device (`public/js/02-storage.js`)

- **Konteks:** user melaporkan data (rekening bank, hutang, piutang) hilang saat pindah device, dan bertanya apakah data ini punya tabel di Supabase.
- **Klarifikasi arsitektur:** rekening bank/hutang/piutang TIDAK punya tabel Supabase terpisah — semuanya disimpan sebagai field JSONB `wealth` di dalam SATU tabel `public.user_data` (kolom `data`), bersama transaksi saham/dividen/dll. Desain single-blob-per-user ini valid dan BUKAN penyebab masalah.
- **Root cause (dikonfirmasi lewat reproduksi kode langsung terhadap `_mergeDatasets()` produksi):** `WEALTH` (`public/js/20-wealth.js:10-17`) diinisialisasi sebagai objek TRUTHY sejak script dimuat (`{bank:[],debt:[],piutang:[],income:0,...}`) — tidak pernah `null`/`undefined`. `_mergeDatasets()` memakai `wealth: local.wealth || cloud.wealth || null` di jalur merge umum (dan `cloud.wealth || local.wealth || null` di jalur "device baru") — karena `local.wealth` SELALU truthy (walau masih default kosong di device baru), ekspresi `||` SELALU memilih local, membuang data cloud yang riil secara diam-diam.
  - Jalur khusus "device baru" (adopsi penuh data cloud) hanya aktif kalau `cloud.transactions.length > 0` — sehingga TIDAK menolong: (a) pengguna yang sama sekali tidak trading saham (transactions selalu `[]` di kedua sisi), atau (b) device yang sudah punya transaksi saham sendiri (jadi bukan device "100% kosong") tapi belum pernah mengisi Wealth di device itu. Kedua kasus ini jatuh ke merge umum yang buggy di atas.
  - **Bukti reproduksi** (ekstrak `_mergeDatasets()` asli dari `02-storage.js`, jalankan langsung di Node): local WEALTH default kosong vs cloud WEALTH berisi 1 rekening BCA + 1 hutang KPR + 1 piutang Budi → hasil merge SEBELUM fix: `merged.wealth.bank/debt/piutang` semuanya `[]` (`merged.wealth === local.wealth`, cloud diabaikan total). Data tidak pernah hilang dari Supabase — tetap utuh di `user_data.data.wealth` — hanya tidak pernah ditarik ke device baru.
- **Perbaikan:** fungsi baru `_mergeWealthData(localWealth, cloudWealth, localTime, cloudTime)` menggantikan kedua ekspresi `||` yang buggy:
  - Array `bank`/`debt`/`piutang` digabung PER-ID (union, dedup by `id`) — pola yang sama seperti transaksi/dividen/RDN yang sudah lebih dulu diperbaiki di fungsi ini — sehingga item dari device manapun tidak pernah hilang begitu saja, termasuk saat dua device menambah rekening berbeda secara independen.
  - Field skalar (`income`, `expense`, `deposito`, `emas`, `obligasi`) diambil dari sisi yang terakhir disimpan (`localTime` vs `cloudTime`), bukan sekadar "local menang".
- **Test regresi baru (`test_suite.js`):** 3 skenario — (1) pengguna wealth-only tanpa transaksi saham sama sekali, (2) device sudah punya transaksi saham tapi wealth cuma di cloud, (3) union dua rekening berbeda dari dua device. Dikonfirmasi FAIL tanpa fix (di-restore sementara ke ekspresi `||` asli → test gagal persis di assertion "cloud bank account must survive") dan PASS dengan fix.
- **Batasan yang diketahui (bukan bug baru, konsisten dengan pola merge transaksi yang sudah ada):** union-by-id berarti PENGHAPUSAN item wealth di satu device tidak ikut ter-propagasi sebagai penghapusan ke device lain (item lama bisa "muncul lagi") — trade-off yang sama persis sudah diterima untuk merge transaksi/dividen/RDN di fungsi ini sejak awal (memilih tidak pernah kehilangan data secara tidak sengaja, daripada menghormati penghapusan tanpa tombstone). Penanganan penghapusan lintas-device yang lebih presisi adalah perbaikan terpisah bila dibutuhkan.
- **Verifikasi:** `node -c public/js/02-storage.js` sukses. `npm test` 176/176 lulus (naik dari 175 — 1 test baru dengan 3 skenario). `npm run lint` bersih. Playwright: guest mode + halaman Wealth dikonfirmasi tetap berfungsi normal, `window.WEALTH`/`_mergeDatasets`/`_mergeWealthData` semua terdefinisi, nol error konsol. Verifikasi sinkronisasi lintas-device REAL (dua browser berbeda via Supabase Cloud sungguhan) tidak bisa dilakukan di sandbox ini (tidak ada akses internet ke `*.supabase.co`) — perbaikan diverifikasi lewat reproduksi langsung terhadap fungsi produksi asli, bukan asumsi. Cache-bust `02-storage.js?v=20260917a`.

## 2026-09-17 — Halaman Riwayat Sinyal AI: "Gagal memuat riwayat: Could not find the table 'public.ai_signal_log' in the schema cache"

- **Konteks:** user melaporkan error di halaman Riwayat Sinyal AI persis pesan PostgREST di atas.
- **Root cause (BUKAN bug di kode aplikasi):** pesan ini adalah error asli dari PostgREST (kode `PGRST205`), artinya tabel `ai_signal_log` **secara harfiah belum ada** di project Supabase yang tersambung ke aplikasi ini. Nama tabel di query (`public/js/47-ai-signal-history.js`) sudah cocok persis dengan definisi di `sql/schema_migration.sql` — bukan typo atau bug query. Penyebabnya: file migrasi SQL itu cuma skrip di repo git, TIDAK PERNAH otomatis dijalankan ke database Supabase produksi manapun (arsitektur app ini: `server.js` sengaja nol akses Supabase, semua baca/tulis Supabase client-side lewat RLS — tidak ada mekanisme migrasi otomatis). Migrasinya harus dijalankan MANUAL sekali oleh pemilik project lewat Supabase Dashboard → SQL Editor.
  - **PENTING — belum sepenuhnya selesai tanpa tindakan dari Anda:** saya (Claude Code, sandbox ini) tidak punya kredensial/akses ke project Supabase produksi Anda, jadi TIDAK BISA menjalankan migrasi tersebut dari sini. Root cause sesungguhnya (tabel belum ada) baru benar-benar hilang setelah Anda menjalankan isi `sql/schema_migration.sql` (khususnya bagian `ai_signal_log`, baris ~253-296) di Supabase SQL Editor project yang dipakai aplikasi ini.
- **Perbaikan kode yang dilakukan (mengurangi kebingungan, bukan menghilangkan kebutuhan migrasi manual di atas):** `public/js/47-ai-signal-history.js` — fungsi baru `aiSignalHistoryIsMissingTableError(error)` mendeteksi error PGRST205/"Could not find the table" secara spesifik, dan `aiSignalHistoryRenderErrorHtml(error)` menampilkan penjelasan actionable ("Tabel belum ada, jalankan migrasi lewat SQL Editor") alih-alih pesan teknis mentah — pesan asli tetap ditampilkan kecil di bawah untuk debug. Error Supabase LAIN (mis. JWT expired, permission denied) tetap tampil apa adanya seperti sebelumnya, tidak ikut ketutup pesan baru ini.
- **Test regresi baru (`test_suite.js`):** 2 test — (1) `aiSignalHistoryIsMissingTableError()` mendeteksi PGRST205/pesan yang tepat dan TIDAK salah mendeteksi kode/pesan error lain (JWT expired, permission denied yang kebetulan menyebut nama tabel yang sama), (2) `renderAiSignalHistoryPage()` menampilkan penjelasan actionable untuk error tabel hilang DAN tetap menampilkan pesan asli verbatim untuk error lain. Dikonfirmasi FAIL tanpa fix (file di-restore sementara ke versi sebelum fix → kedua test gagal persis di assertion yang relevan) dan PASS dengan fix.
- **Verifikasi:** `node -c public/js/47-ai-signal-history.js` sukses. `npm test` 178/178 lulus (naik dari 176 — 2 test baru). `npm run lint` bersih. Playwright: disimulasikan login + Supabase mengembalikan error PGRST205 persis seperti laporan lapangan → pesan baru tampil benar (screenshot dikirim), nol error konsol. Cache-bust `47-ai-signal-history.js?v=20260917b`.
- **Tindak lanjut yang WAJIB dilakukan Anda (di luar kemampuan sandbox ini):** buka Supabase Dashboard project produksi → SQL Editor → jalankan isi `sql/schema_migration.sql` (boleh seluruh file, aman dijalankan berulang karena semua `create table if not exists`/`create index if not exists`/`drop policy if exists` — atau cukup bagian `ai_signal_log` saja kalau tabel lain sudah ada) → reload halaman Riwayat Sinyal AI.

## 2026-09-17 — `sql/schema_migration.sql` gagal total di project Supabase baru: "relation public.user_settings does not exist" (blocking ai_signal_log)

- **Konteks:** setelah diberi tahu perlu menjalankan `sql/schema_migration.sql` di Supabase SQL Editor untuk mengaktifkan tabel `ai_signal_log`, user menjalankannya dan mendapat error `ERROR: 42P01: relation "public.user_settings" does not exist`.
- **Root cause (dikonfirmasi lewat eksekusi langsung di Postgres 16 lokal, bukan asumsi):** statement PALING ATAS di file ini (`alter table public.user_settings ...`) mengasumsikan skema LAMA yang dipakai app SEBELUM konsolidasi ke satu blob `public.user_data` (dikonfirmasi: tidak ada satupun `create table public.user_data` di file ini — tabel itu dibuat manual di luar riwayat migrasi repo ini, dan kode app (`public/js/02-storage.js`) memang cuma pernah memanggil `client.from('user_data')`, tidak pernah `user_settings`). Delapan tabel legacy yang direferensikan tanpa guard di bagian atas file (`user_settings`, `transactions`, `dividends`, `rdn_mutations`, `crypto_tx`, `etf_tx`, `rd_tx`, `div_invest`) TIDAK PERNAH ADA di project Supabase yang dibuat setelah konsolidasi tersebut.
  - Karena Supabase SQL Editor menjalankan satu submission sebagai satu transaksi, kegagalan di statement PALING ATAS ini menggagalkan SELURUH sisa file — termasuk `ai_paper_trading`, `ksei_ownership`, dan `ai_signal_log` yang jauh lebih baru dan sama sekali tidak bergantung pada tabel legacy tersebut. Klaim di header file ("aman dijalankan kapan pun") ternyata salah untuk project yang tidak pernah punya skema lama ini.
  - **Reproduksi:** dijalankan file ASLI (`node -c` lolos tapi ini SQL, diuji lewat `psql -v ON_ERROR_STOP=1`) terhadap database Postgres 16 lokal yang benar-benar kosong (mensimulasikan `auth.users`/`auth.uid()` minimal ala Supabase, tanpa satupun dari 8 tabel legacy) → persis error yang sama, berhenti di baris `alter table public.user_settings`, TIDAK SATUPUN tabel (termasuk `ai_paper_trading`) berhasil dibuat.
- **Perbaikan:** setiap statement yang menyentuh salah satu dari 8 tabel legacy dibungkus `do $$ begin if to_regclass('public.<tabel>') is not null then ... end if; end $$;` — kalau tabelnya memang tidak ada, statement itu dilewati diam-diam (bukan error), dan sisa file (termasuk `ai_signal_log`) tetap jalan. Tabel yang benar-benar dipakai app hari ini (`ai_paper_trading`, `ksei_ownership`, `ai_signal_log`) tetap dibuat TANPA syarat seperti sebelumnya.
- **Verifikasi (Postgres 16 lokal, bukan hanya baca kode):**
  1. Database kosong (tanpa 8 tabel legacy, mensimulasikan project user yang melapor) → file yang SUDAH diperbaiki dijalankan dengan `psql -v ON_ERROR_STOP=1` (setara "berhenti di error pertama" seperti Supabase) → selesai tanpa error, `\dt public.*` mengonfirmasi `ai_paper_trading`, `ksei_ownership`, `ai_signal_log` ketiganya berhasil dibuat.
  2. Dijalankan KEDUA KALINYA di database yang sama → tetap tanpa error (idempoten, sesuai klaim asli file).
  3. Database dengan SEMUA 8 tabel legacy dibuat manual (mensimulasikan project lama) → file yang sudah diperbaiki dijalankan → kolom baru (`idx_universe`, `trade_strategy`, dst.) berhasil ditambahkan ke `user_settings`, `schema_version` ter-update ke `2`, unique constraint terpasang di `transactions`/`div_invest`/dll — perilaku upgrade untuk project lama TIDAK BERUBAH sama sekali.
  4. File ASLI (sebelum fix) dijalankan ulang terhadap database kosong yang sama → dikonfirmasi gagal persis di baris yang sama dengan laporan user, membuktikan reproduksi akurat.
- **Test regresi baru (`test_suite.js`):** memverifikasi kedelapan tabel legacy punya guard `to_regclass(...) is not null`, dan ketiga tabel aktif (`ai_paper_trading`/`ksei_ownership`/`ai_signal_log`) tetap tanpa syarat. Dikonfirmasi FAIL tanpa fix, PASS dengan fix.
- **Verifikasi tambahan:** `npm test` 179/179 lulus (naik dari 178). `npm run lint` bersih (tidak menyentuh kode JS).
- **Tindak lanjut untuk user:** jalankan ULANG `sql/schema_migration.sql` (versi baru ini) di Supabase SQL Editor — kali ini seharusnya selesai tanpa error dan sekaligus membuat `ai_paper_trading`, `ksei_ownership`, dan `ai_signal_log` (kalau salah satu sudah pernah berhasil dibuat sebelumnya, aman — semua `create table if not exists`).

## 2026-09-17 — Konsolidasi screener: hapus "LQ45 Momentum Scanner" (duplikat AI Autonomous Trading Scanner)

- **Konteks:** user minta analisis 10 screener/scanner saham di aplikasi untuk dikonsolidasi jadi "master screener". Analisis (dibantu subagent, hasil dibaca & diverifikasi) menemukan LQ45 Momentum Scanner (tab 3 halaman Technical) dan AI Autonomous Trading Scanner memanggil endpoint backend **persis sama** (`/api/idx/ai-scan` → `computeStockSignal`/`computeStockSignalBatch`) — LQ45 Momentum Scanner tidak menambah kriteria/data apa pun, cuma render heatmap-grid dari data yang identik dengan tabel trade-plan AI Scanner. User memutuskan hapus dulu yang ini karena paling jelas redundan.
- **Perubahan:**
  - `public/js/24-stockmaster.js` — dihapus: komentar blok "Tab 6: LQ45 Momentum Scanner", state `TECH_LQ45_CACHE`/`TECH_LQ45_LOADING`, fungsi `techRenderLq45Heatmap()` dan `techRenderLq45Grid()`. Cabang `else if (idx === 3) { techRenderLq45Heatmap(); }` di `techSwitchTab()` dihapus. Referensi "LQ45 Scanner" di komentar header file (baris 5) juga dibersihkan.
  - `public/index.html` — dihapus tombol nav `#tech-nav-3` ("LQ45 Momentum Scanner") dan panel `#tech-tab3` (termasuk `#hm-grid-tech`) di halaman Technical (`#page-technical`). Halaman Technical sekarang cuma 2 tab: "Live Chart (TradingView)" dan "Analisa Komprehensif & Flow".
- **Tidak disentuh (di luar cakupan permintaan ini):** "Multi-Coin Breakout Scanner" (`cr-tech-nav-3`/`cr-tech-tab3`) — ini scanner CRYPTO terpisah, kebetulan share pola penamaan nav index yang mirip tapi bukan bagian dari 10 screener saham IDX yang dianalisis.
- **Verifikasi:** `node -c public/js/24-stockmaster.js` sukses. `npm test` 179/179 lulus (tidak berkurang — tidak ada test yang meng-cover fitur ini sebelumnya). `npm run lint` bersih. Playwright: halaman Technical dikonfirmasi cuma 2 nav item/panel tersisa, teks "LQ45 Momentum Scanner" dan fungsi `techRenderLq45Heatmap` sudah tidak ada (`typeof` → `undefined`), tab 1 & 2 tetap berfungsi normal tanpa error konsol. Cache-bust `24-stockmaster.js?v=20260917b`.
- **Sisa rencana konsolidasi (belum dieksekusi, menunggu keputusan user selanjutnya):** gabung Flow Scanner + Universe-Wide Acc/Dist Scanner + Bandarmology Heatmap Scanner jadi satu "Smart Money Screener" (ketiganya overlap kriteria CMF/volume-flow, bahkan berbagi fungsi hitung `fsCalcCMF`/`fsGenData` yang sama persis) — berisiko memberi verdict akumulasi/distribusi berbeda untuk ticker sama di saat sama karena 3 implementasi terpisah. Juga ada 2 klaim nama fitur yang menyesatkan relatif ke kode asli: "Universe-Wide" Acc/Dist Scanner cuma scan 45 saham LQ45 (bukan seluruh BEI), dan "Live Scanner" di Bandarmology Heatmap cuma 8 ticker hardcoded — perlu diperbaiki penamaannya terlepas dari keputusan konsolidasi.

## 2026-09-17 — Konsolidasi screener: gabung Flow Scanner + Scanner Akumulasi & Distribusi + Bandarmology Heatmap Scanner jadi "Smart Money Screener"

- **Konteks:** lanjutan konsolidasi 10 screener saham (setelah penghapusan LQ45 Momentum Scanner). Analisis sebelumnya menemukan 3 fitur ini overlap konsep (deteksi akumulasi/distribusi "smart money") dan dua di antaranya berbagi fungsi hitung CMF yang identik (`fsGenData`/`fsCalcCMF`) — berisiko memberi verdict akumulasi/distribusi BERBEDA untuk ticker yang SAMA di waktu yang SAMA karena 3 implementasi terpisah.
- **Investigasi dependensi (sebelum eksekusi, dibantu subagent, diverifikasi manual dengan grep menyeluruh):** dikonfirmasi ketiga fungsi RENDER (`fsRunScanner`, `renderRadarScannerSubTab`, `renderBandarmologyHeatmapScannerView`) tidak dipanggil dari file lain manapun — aman dihapus. Tapi HELPER data-layer di file yang sama (`fsGenData`/`fsCalcCMF`/`FS_G` di `07-flowscan.js`, dipakai 8+ file lain; `RADAR_STATE`/`loadAccumulationDistributionData()` di `26-commandcenter.js`, dipakai sub-tab "Anomaly Structural & ARA" juga; `BANDAR_SECTOR_DEFS`/`generateClientSideBrokerSummary` di `41-stockchat-cockpit.js`, dipakai "Market Flow view" juga) **tidak boleh ikut dihapus**.
- **Perubahan:**
  - `public/js/07-flowscan.js` — halaman "Big Money Scanner" (page `scanner`) diubah jadi "Smart Money Screener" dengan 3 MODE: **CMF Proxy** (konten asli, tidak diubah), **Broker Flow Riil (LQ45)** (fungsi baru `fsRenderBrokerFlowMode()`, memanggil ULANG `loadAccumulationDistributionData()`/`RADAR_STATE.accData` dari Command Center — bukan duplikasi data), **Heatmap Sektor** (fungsi baru `fsRenderSectorHeatmapMode()`, memanggil ULANG `BANDAR_SECTOR_DEFS`/`generateClientSideBrokerSummary` dari Bandarmology — bukan duplikasi). Fungsi baru `fsSwitchScreenerMode(mode)` mengatur toggle panel + lazy-load per mode. Fungsi bantu `fsOpenBrokerFlowTicker()` sebagai jalan pintas ke sub-tab "Visualisasi Alur Transaksi" yang tetap ada di Opportunity Radar.
  - `public/js/26-commandcenter.js` — dihapus: tombol sub-tab "Scanner Akumulasi & Distribusi", cabang dispatch-nya, dan fungsi `renderRadarScannerSubTab()` itu sendiri. `RADAR_STATE`/`loadAccumulationDistributionData()` TIDAK disentuh (masih dipakai sub-tab "Anomaly Structural & ARA"). Komentar yang mereferensikan fungsi yang dihapus diperbarui agar tidak menggantung.
  - `public/js/41-stockchat-cockpit.js` — dihapus: pemanggilan `renderBandarmologyHeatmapScannerView()` di mode market Bandarmology Cockpit, fungsi itu sendiri, dan baris `window.renderBandarmologyHeatmapScannerView = ...`. `BANDAR_SECTOR_DEFS`/`generateClientSideBrokerSummary` TIDAK disentuh (masih dipakai Market Flow view). Komentar terkait diperbarui.
  - `public/index.html` — restrukturisasi `#page-scanner` jadi 3 panel mode (`#sms-mode-cmf`/`#sms-mode-broker`/`#sms-mode-sector`) dengan tab-bar switch, judul halaman & label sidebar diganti dari "Big Money Scanner"/"Flow Scanner" jadi "Smart Money Screener".
- **Test regresi baru (`test_suite.js`):** memverifikasi (1) fungsi mode baru ada di `07-flowscan.js` dan benar-benar memanggil ulang (bukan menduplikasi) `loadAccumulationDistributionData`/`RADAR_STATE.accData`/`BANDAR_SECTOR_DEFS`/`generateClientSideBrokerSummary`, (2) fungsi lama (`renderRadarScannerSubTab`/`renderBandarmologyHeatmapScannerView`) benar-benar hilang dan tidak dipanggil lagi, (3) data/fungsi yang masih dipakai sub-tab/view LAIN (`loadAccumulationDistributionData`, `RADAR_STATE`, `BANDAR_SECTOR_DEFS`, `generateClientSideBrokerSummary`) TIDAK ikut terhapus, (4) wiring HTML (3 tombol mode, 3 panel, judul baru) ada. Dikonfirmasi FAIL tanpa perubahan (di-stash sementara → gagal persis di assertion pertama), PASS dengan perubahan.
- **Verifikasi:** `node -c` ketiga file JS sukses. `npm test` 180/180 lulus (naik dari 179). `npm run lint` bersih. Playwright end-to-end (7 skenario): (1) halaman Smart Money Screener render dengan 3 tombol mode, (2) mode CMF Proxy tetap berfungsi seperti sebelumnya, (3) mode Broker Flow Riil menampilkan honest empty-state yang benar (sandbox ini tidak punya `INVEZGO_API_KEY`, sama seperti perilaku aslinya sebelum digabung — bukan bug baru), (4) mode Heatmap Sektor render lengkap dengan data real (screenshot dikirim), (5) sub-tab Opportunity Radar berkurang jadi 4 (tanpa "Scanner Akumulasi & Distribusi"), (6) sub-tab "Anomaly Structural & ARA" (yang berbagi `RADAR_STATE.accData`) tetap berfungsi normal, (7) mode market Bandarmology Cockpit tidak lagi menampilkan heatmap scanner lama, view lain (Market Flow, dst.) tetap utuh. Nol error konsol di semua skenario. Cache-bust `07-flowscan.js?v=20260917a`, `26-commandcenter.js?v=20260917b`, `41-stockchat-cockpit.js?v=20260917d`.
- **Sisa rencana konsolidasi (belum dieksekusi):** perbaiki 2 nama fitur yang menyesatkan yang masih tersisa — "Universe-Wide" pada backend `getUniverseAccumulationDistribution` (sebenarnya cuma scan 45 saham LQ45) dan badge "SIMULASI FLOW" di mode Heatmap Sektor sudah cukup jujur, tapi nama fungsi backend `lib/idx-data-engine.js` masih menyandang klaim "Universe-Wide"/"seluruh 900+ universe" di komentarnya sendiri (INV-007) — perlu diluruskan terpisah dari perubahan ini.

## 2026-09-17 — Perbaikan nama menyesatkan + implementasi nyata scan seluruh BEI untuk Smart Money Screener

- **Konteks:** user minta perbaikan 2 nama fitur menyesatkan dari analisis konsolidasi sebelumnya ("Universe-Wide" dan "Live Scanner"), dengan penekanan EKSPLISIT: bukan cuma ganti judul, aplikasi harus BENAR-BENAR bisa screener seluruh saham BEI (bukan dibatasi LQ45/IDX80/Kompas100), dan kalau data tidak ada untuk suatu saham, kosongkan saja barisnya — jangan dikarang.
- **Investigasi constraint (sebelum eksekusi):** mode "Broker Flow Riil" memakai Invezgo API berbayar (kuota default 30.000/bulan, dikonfirmasi di `lib/invezgo-client.js`), 1 saham = 1 kuota. Scan seluruh ~958 saham BEI sekaligus dalam 1 request akan (a) timeout di serverless (durasi terbatas), dan (b) memboroskan ~3% kuota bulanan hanya dari SATU kali scan. Ditanyakan ke user cara menangani ini — dipilih: **scan manual per-batch, user klik "Lanjutkan Scan"**, meniru pola `aiSetScanUniverse()` yang sudah ada di AI Autonomous Trading Scanner (batch bertahap, tidak auto-lanjut sendiri supaya pemakaian kuota tetap disengaja).
- **Perbaikan backend (`lib/idx-data-engine.js`, `server.js`):**
  - `getUniverseAccumulationDistribution()` — dulu HARDCODE `Object.values(universe).filter(lq45).slice(0,45)` sebagai satu-satunya universe yang bisa di-scan (fungsi bahkan tidak menerima parameter ticker sama sekali). Sekarang menerima `params.tickers` (array atau CSV string) dari caller — LQ45 cuma jadi DEFAULT kalau tidak ada list diberikan, bukan batas mutlak. Dibatasi `BATCH_CAP=80` per request (sama dengan `/api/idx/ai-scan`), caller (client) yang bertanggung jawab memanggil berkali-kali untuk cakupan lebih luas.
  - `server.js` — tambah `POST /api/idx/accumulation-distribution` (menerima `tickers` array di body, pola sama dengan `POST /api/idx/ai-scan`) untuk batching dari client; `GET` lama tetap ada untuk kompatibilitas query-string sederhana.
- **Perbaikan frontend (`public/js/07-flowscan.js`):**
  - Mode **"Broker Flow Riil (Seluruh BEI)"** (dulu "(LQ45)") — dirombak total: state baru `FS_BROKER_SCAN` (universe lengkap ~958 saham dari `/api/idx/stocks`, progress batch, hasil akumulasi/distribusi kumulatif). Tombol **"Lanjutkan Scan (+N saham)"** memicu batch berikutnya secara manual; progress bar "X dari Y saham sudah dipindai" selalu terlihat. **Sengaja TIDAK memakai `RADAR_STATE.accData`/`loadAccumulationDistributionData()` lagi** (beda dari desain awal PR #211) — supaya hasil scan seluruh-BEI di sini tidak ikut mencemari sub-tab "Anomaly Structural & ARA" di Command Center yang didesain khusus seputar LQ45 saja.
  - Mode **"Heatmap Sektor"** — tabel "PEMINDAI SMART MONEY & BANDAR RADAR" dulu cuma scan 8 ticker hardcoded (`scannerCandidates`) dan agregasi sektor cuma dari `BANDAR_SECTOR_DEFS` (~37 saham kurasi manual, 5 sektor) walau labelnya "SEKTORAL BEI". Sekarang scan SELURUH 958 saham (fetch penuh dari `/api/idx/stocks`, sektor asli per-saham) — karena `generateClientSideBrokerSummary()` sinkron/lokal (bukan fetch jaringan per ticker, tidak kena constraint kuota Invezgo), tidak perlu batching bertahap seperti mode Broker Flow Riil. Tabel ditampilkan top-40 berdasar `|flow|` (supaya tetap bisa dipakai), badge menunjukkan jumlah SEBENARNYA yang di-scan ("958/958 SAHAM TERPINDAI").
- **Bug ditemukan & diperbaiki SELAMA verifikasi live (bukan sebelum commit — root cause: kondisi `notConfigured` yang baru terungkap DI TENGAH alur async tidak dicek ulang sebelum render final):** setelah batch pertama Broker Flow Riil mendeteksi Invezgo API key benar-benar tidak dikonfigurasi, UI tetap menampilkan panel scan (bukan pesan honest-empty) karena `fsRenderBrokerFlowMode()` maupun `fsRunNextBrokerScanBatch()` sama-sama memanggil `fsRenderBrokerScanUI()` tanpa syarat di akhir alur, menimpa hasil render honest-empty yang baru saja terjadi. Diperbaiki dengan mengecek ulang `FS_BROKER_SCAN.notConfigured` sebelum render final di kedua fungsi. Ditemukan lewat Playwright (bukan cuma baca kode) — screenshot pertama menampilkan header panel scan yang seharusnya sudah kosong; diperbaiki lalu diverifikasi ulang.
- **Temuan tambahan (bukan bug, transparansi data):** heatmap sektor menampilkan kategori "Lainnya" untuk 898 dari 958 saham — dikonfirmasi (lewat query langsung ke `/api/idx/stocks`) bahwa ini berasal dari data referensi asli (`01-data.js`) yang memang belum punya klasifikasi sektor granular untuk sebagian besar saham di luar daftar utama (cuma ~60 saham punya sektor spesifik: Financials, Energy, dst; sisanya sudah ber-tag "Lainnya" sejak sumber data). Kode ini menampilkan apa adanya, tidak mengarang sektor — pengayaan data sektor untuk 898 saham itu adalah proyek data terpisah, di luar cakupan perbaikan ini.
- **Test regresi (`test_suite.js`):** diperbarui — 2 assertion lama yang mengasumsikan reuse `RADAR_STATE.accData` dihapus (desain berubah), ditambah assertion baru memverifikasi `FS_BROKER_SCAN`/`fsRunNextBrokerScanBatch`/pemanggilan endpoint langsung, `FS_SECTOR_SCAN_UNIVERSE`, tidak ada lagi `scannerCandidates` hardcoded, DAN backend `getUniverseAccumulationDistribution()` menerima `params.tickers` (bukan hardcode `slice(0,45)`), plus endpoint `POST /api/idx/accumulation-distribution` ada. Dikonfirmasi FAIL tanpa perbaikan (di-stash sementara), PASS dengan perbaikan.
- **Verifikasi:** `node -c` semua file sukses. `npm test` 181/181 lulus (naik dari 180). `npm run lint` bersih. Playwright: dikonfirmasi `/api/idx/stocks` mengembalikan 958 saham (bukan 45/85/127); mode Broker Flow Riil memuat 958 saham ke universe scan, batch pertama+kedua maju 80 saham per klik, notConfigured (tidak ada `INVEZGO_API_KEY` di sandbox) ditampilkan jujur setelah fix bug di atas; mode Heatmap Sektor scan 958/958 saham (badge dikonfirmasi), 12 kategori sektor riil tampil (bukan cuma 5 kurasi manual), screenshot dikirim. Verifikasi tambahan: `curl` langsung ke `POST /api/idx/accumulation-distribution` dengan ticker non-LQ45 (AALI/ABBA/dst) dikonfirmasi diterima & diproses (bukan ditolak/diabaikan). Logika resolusi ticker (array/CSV/default) diverifikasi terpisah lewat eksekusi Node langsung. Nol error konsol di semua skenario. Cache-bust `07-flowscan.js?v=20260917b`.
- **Batasan yang tidak bisa diuji di sandbox ini:** alur "Invezgo API key benar-benar terkonfigurasi dan mengembalikan data real" tidak bisa diuji end-to-end (tidak ada API key asli/akses internet ke Invezgo) — diverifikasi lewat pembacaan kode + pengujian jalur "tidak terkonfigurasi" secara menyeluruh, bukan asumsi.

## 2026-09-17 — Budget kuota Invezgo: cache TTL lebih panjang + visibility kuota di Smart Money Screener

- **Konteks:** user sudah punya API key Invezgo asli (30.000 request/bulan), minta diatur dulu supaya kuota cukup dipakai 1 bulan SEBELUM benar-benar dipasang ke production — mengingat fitur "Broker Flow Riil (Seluruh BEI)" yang baru dibuat bisa scan 958 saham sekaligus (958/30.000 ≈ 3.2% kuota bulanan per satu scan penuh).
- **Analisis kuota:** ditemukan (dibaca dari `lib/invezgo-client.js`) cache broker-summary hardcode 300 detik (5 menit) — TTL ini nyaris tidak membantu scanner seluruh-BEI (hampir semua dari 958 ticker adalah cache-miss pertama kali, TTL tidak mengubah biaya scan pertama), tapi berarti scan ulang (user sama re-scan, atau lookup StockChat/Bandarmology per-saham setelahnya) yang berjarak >5 menit tetap kena biaya kuota penuh lagi — padahal komposisi broker-flow harian tidak berubah drastis tiap 5 menit untuk kebutuhan screening ritel (beda dengan terminal day-trading real-time).
- **Perbaikan 1 — cache TTL diperpanjang & dibuat configurable:** `lib/invezgo-client.js` — `INVEZGO_BROKER_SUMMARY_CACHE_TTL_SEC` dari hardcode `300` jadi `Number(process.env.INVEZGO_BROKER_SUMMARY_CACHE_TTL_SEC || 1800)` (30 menit default, bisa diatur operator tanpa ubah kode). Efeknya: scan ulang penuh atau lookup per-saham berulang dalam jendela 30 menit yang sama jadi nyaris gratis (cache hit), bukan kena biaya kuota penuh lagi.
- **Perbaikan 2 — visibility kuota ditampilkan ke user (bukan cuma backend):** endpoint observability `GET /api/idx/invezgo-status` (kuota terpakai/sisa/persentase/alert 80%/90%) sudah ada sebelumnya tapi TIDAK PERNAH ditampilkan ke user — user bisa klik "Lanjutkan Scan" berkali-kali tanpa tahu berapa kuota bulanan sudah/akan terpakai. Sekarang:
  - `public/js/07-flowscan.js` — fungsi baru `fsFetchInvezgoQuotaStatus()` (dipanggil saat masuk mode Broker Flow Riil & setelah tiap batch selesai) dan `fsRenderQuotaBar()` (progress bar + teks "Kuota Invezgo bulan ini: X / 30.000 terpakai (Y%) — sisa Z", warna hijau/amber/merah mengikuti flag `alert80`/`alert90` yang sudah ada di backend).
  - Tombol "Lanjutkan Scan"/"Scan Ulang dari Awal" otomatis nonaktif dan berubah jadi "Kuota Habis" saat `remaining<=0` — mencegah user mencoba scan yang percuma setelah kuota bulanan benar-benar habis.
- **Kenapa TIDAK pakai hard-cap harian buatan sendiri (dipertimbangkan, tidak dipilih):** cap harian arbitrer (mis. "maks 600 saham/hari") butuh angka yang saya tidak punya dasar kuat untuk menentukannya (tergantung seberapa sering user sebenarnya memakai fitur interaktif per-saham vs screening massal — trade-off produk yang cuma pemilik aplikasi yang tahu). Visibility + cache lebih efisien memberi KONTROL ke user untuk mengatur sendiri kapan scan penuh dijalankan, tanpa menebak angka pembatasan yang mungkin salah (terlalu ketat atau terlalu longgar).
- **Test regresi (`test_suite.js`):** memverifikasi TTL cache tidak kembali ke 300 hardcode dan sudah configurable via env var dengan default 1800; `fsFetchInvezgoQuotaStatus()`/`fsRenderQuotaBar()` ada dan endpoint `/api/idx/invezgo-status` dipanggil; cek `quotaExhausted` dipakai untuk disable tombol. Dikonfirmasi FAIL tanpa perbaikan (di-stash sementara), PASS dengan perbaikan.
- **Verifikasi:** `node -c` semua file sukses. `npm test` 182/182 lulus (naik dari 181). `npm run lint` bersih. `curl` langsung ke `/api/idx/invezgo-status` dikonfirmasi mengembalikan shape yang benar. Playwright: quota bar tampil benar untuk kondisi 0% (real, sandbox ini belum ada `INVEZGO_API_KEY`), disimulasikan 85% (warna amber, teks benar) dan 100%/habis (warna merah, tombol berubah "Kuota Habis" dan `disabled=true`), screenshot dikirim. Nol error konsol di semua skenario. Cache-bust `07-flowscan.js?v=20260917c`.
- **Catatan untuk user:** kuota 30.000/bulan bisa menampung sekitar 31 kali scan penuh 958 saham (958×31≈29.700) KALAU tidak ada aktivitas lain sama sekali — tapi fitur lain (StockChat/Bandarmology analisis per-saham, AI signal check) juga berbagi kuota yang sama. Dengan cache 30 menit, lookup berulang untuk saham yang sama dalam jendela itu gratis, tapi tetap disarankan tidak menjalankan scan penuh berkali-kali dalam sehari tanpa memperhatikan angka kuota yang sekarang selalu terlihat di UI.

## 2026-09-17 — Koreksi TTL cache Invezgo: 30 menit ke 24 jam (broker summary BEI adalah laporan batch harian, bukan real-time)

- **Konteks:** setelah TTL cache broker-summary dinaikkan ke 30 menit (entri sebelumnya), user mengoreksi: data broker BEI hanya terbit SEKALI sehari (batch pasca-penutupan, bukan streaming real-time sepanjang sesi perdagangan) karena aturan/mekanisme BEI, jadi tidak perlu di-refresh tiap 30 menit atau tiap jam. Diminta baca dulu aturan yang ada sebelum menentukan setup.
- **Verifikasi klaim (riset + baca kode, bukan asumsi):**
  - Riset web mengonfirmasi broker summary BEI/IDX dipublikasikan setelah jam perdagangan berakhir (bukan real-time intraday), dan jadwal resmi BEI terbaru (Kep-00003/BEI/04-2025) menutup sesi reguler pukul 15.49.59 WIB dengan sesi post-closing berakhir 16.15 WIB — konsisten dengan klaim user bahwa data baru terbit sore hari.
  - Baca kode: `brokerSummaryDateRange()` (`lib/idx-data-engine.js:1389-1399`) mengirim `fromDate`/`toDate` berupa TANGGAL KALENDER hari ini ke Invezgo, dan `getOrFetch()`'s cache key sudah menyertakan parameter ini — artinya cache key SUDAH otomatis berganti sendiri tiap hari (reset tengah malam UTC = 07:00 WIB, jauh sebelum bursa buka 09:00 WIB), terlepas dari TTL yang dipasang. TTL 30 menit karenanya sia-sia: untuk ticker yang sama di HARI yang sama, sistem tetap fetch ulang ke Invezgo tiap 30 menit padahal data itu statis sepanjang hari tersebut sejak terbit.
- **Perbaikan:** `lib/invezgo-client.js` — `INVEZGO_BROKER_SUMMARY_CACHE_TTL_SEC` default dinaikkan dari `1800` (30 menit) jadi `86400` (24 jam). Aman karena cache key sudah dipisah per-tanggal (bukan murni TTL-based) — TTL 24 jam tidak akan pernah menyajikan data hari kemarin ke permintaan hari ini (key-nya sudah berbeda), tapi menghilangkan pemborosan fetch ulang berkali-kali untuk ticker yang sama dalam hari yang sama. Tetap configurable via env var `INVEZGO_BROKER_SUMMARY_CACHE_TTL_SEC` kalau operator ingin override.
- **Test regresi (`test_suite.js`):** assertion default TTL diperbarui dari `1800` ke `86400`. Dikonfirmasi FAIL dengan nilai lama (regex tidak cocok), PASS dengan nilai baru.
- **Verifikasi:** `node -c lib/invezgo-client.js` sukses. `npm test` 182/182 lulus (tidak berubah jumlah — ini koreksi nilai konstanta pada test yang sudah ada, bukan test baru). `npm run lint` bersih. Tidak ada perubahan file frontend, jadi tidak ada cache-bust yang diperlukan.
- **Dampak kuota:** dengan TTL 24 jam, satu ticker+tanggal hanya menghabiskan kuota SEKALI per hari terlepas berapa kali diminta (scan ulang, lookup StockChat/Bandarmology berulang, dll) — jauh lebih hemat dari estimasi sebelumnya (~31 scan penuh/bulan dengan asumsi tidak ada request berulang) karena sekarang request berulang di hari yang sama benar-benar gratis, bukan cuma "gratis dalam jendela 30 menit".

## 2026-09-17 — Bandarmology market-aggregate views (Foreign Flow, Market Flow, Accumulation, Distribution, Broker Trail) sekarang pakai data real Invezgo

- **Konteks:** setelah `INVEZGO_API_KEY` dipasang di production, user melaporkan "Broker Flow Riil" di Smart Money Screener sudah menampilkan kuota real, TAPI mode "Foreign Flow" di halaman terpisah (Bandarmology & Smart Money Cockpit) masih menampilkan "Estimasi Foreign Net Buy/Sell di bawah dihitung dari simulasi transaksi broker".
- **Root cause:** ini bukan bug baru — didokumentasikan sengaja sebagai keterbatasan yang di-disclose (`KNOWN_ISSUES.md` #3 / `INCIDENT_LOG.md` #7). Lima view market-aggregate di `41-stockchat-cockpit.js` (Market Flow, Foreign Flow, Accumulation, Distribution, Broker Trail — plus Smart Money Radar View yang ternyata dead code, tidak pernah dipanggil dari manapun) SELALU memanggil `generateClientSideBrokerSummary()` langsung, 100% simulasi, tidak pernah menyentuh Invezgo sama sekali — beda dari tab "Analisis Full Emiten" yang sejak lama sudah pakai jalur real (`fetchBrokerSummaryData()` → `GET /api/idx/broker-summary/:ticker` → `generateBrokerSummary()` di backend).
- **Keputusan scope:** ditanyakan ke user seberapa luas perbaikan yang diinginkan (cuma Foreign Flow, semua 5 view, atau tetap simulasi dengan disclosure) — dipilih **semua 5 view sekaligus**, karena infrastruktur real-data-nya sudah identik (`computeBandarmologyVerdict()` di `lib/idx-data-engine.js` dipakai bersama oleh jalur real & simulasi, jadi bentuk objek `topBuyers`/`topSellers`/`bandarmology.*` sama persis).
- **Bug KEDUA yang ditemukan saat investigasi (lebih halus, sebelum ada baris kode ditulis):** field bandarmology real (`computeBandarmologyVerdict()`) dan simulasi (`generateClientSideBrokerSummary()`) pakai NAMA FIELD BERBEDA untuk angka yang sama — `foreignFlow.netValueRp` (simulasi) vs `foreignFlow.netValRp` (real), `smartMoney.institutionalNetRp` (simulasi) vs `retailVsSmartMoney.smartMoneyNetValRp` (real). Foreign Flow View & Accumulation/Distribution View sudah lama defensif membaca kedua nama, TAPI Market Flow View HANYA membaca nama simulasi — kalau langsung disambungkan ke data real tanpa perbaikan ini, Big 4 Banks/Sektor flow akan diam-diam selalu menampilkan Rp 0 walau data real-nya benar. Ditemukan lewat pembacaan kode silang antar kedua fungsi SEBELUM eksekusi, bukan lewat testing.
- **Perbaikan (`public/js/41-stockchat-cockpit.js`):**
  - `bandarGetCachedSummary(ticker, tf)` — pengganti drop-in untuk `generateClientSideBrokerSummary(t,'1D')`: baca dari `STOCKCHAT_BROKER_DATA_CACHE` (diisi `fetchBrokerSummaryData()`, endpoint real yang sama dipakai tab Emiten) kalau sudah ada, jatuh ke simulasi persis seperti sebelumnya kalau belum.
  - `bandarForeignNetRp(bandarmology)` / `bandarSmartMoneyNetRp(bandarmology)` — helper yang membaca kedua kemungkinan nama field (real & simulasi), memperbaiki bug kedua di atas.
  - `bandarUniqueMarketTickers()` — union ~46 ticker yang dibutuhkan kelima view (Big 4 Banks + 5 sektor + 42-ticker sample), supaya SATU putaran prefetch cukup untuk semuanya, bukan 5 putaran terpisah.
  - `bandarPrefetchMarketBatch(containerId, tk)` — memanggil `fetchBrokerSummaryData()` untuk seluruh ticker yang BELUM ada di cache, lalu re-render `renderBandarmologyCockpitPage()` sekali setelah selesai.
  - `bandarDataBanner(realCount, totalCount, simNote)` — banner disclosure dinamis: hijau "data REAL" kalau semua ticker real, amber "X dari Y real, sisanya simulasi" kalau campuran, banner simulasi lama kalau semua simulasi (Invezgo belum dikonfigurasi) — mengganti banner yang sebelumnya selalu bertuliskan simulasi tanpa syarat.
  - `renderBandarmologyCockpitPage()` memanggil `bandarPrefetchMarketBatch()` di akhir setiap render.
- **Bug KETIGA — infinite render loop — ditemukan lewat Playwright, BUKAN dari baca kode:** implementasi pertama `bandarPrefetchMarketBatch()` selalu fetch+re-render tanpa syarat. `fetchBrokerSummaryData()` ternyata men-cache hasil FALLBACK simulasi juga (bukan cuma hasil real) — begitu semua ~46 ticker pernah di-fetch sekali (real atau simulasi), putaran render berikutnya selalu resolve dari cache dalam hitungan milidetik lalu re-render lagi, yang memicu prefetch lagi, yang resolve dari cache lagi, tanpa henti. Terdeteksi karena proses Chromium Playwright memakai >100% CPU satu core saat verifikasi live. Diperbaiki dengan memfilter ticker yang BELUM ada di cache dulu (`missing.length === 0` → langsung `return`, tidak fetch dan tidak re-render) — begitu seluruh set sudah ter-cache, tidak ada lagi yang baru untuk ditampilkan sehingga loop berhenti sendiri.
- **Test regresi (`test_suite.js`):** (1) memverifikasi kelima view TIDAK lagi memanggil `generateClientSideBrokerSummary()` langsung dan SUDAH memanggil `bandarGetCachedSummary()`; (2) `bandarPrefetchMarketBatch()` benar-benar terpasang di `renderBandarmologyCockpitPage()`; (3) mengeksekusi LANGSUNG `bandarForeignNetRp()`/`bandarSmartMoneyNetRp()` di sandbox `vm` terhadap objek berbentuk real DAN simulasi, membuktikan keduanya terbaca benar (bukan diam-diam 0); (4) mengeksekusi `bandarGetCachedSummary()` di sandbox, membuktikan cache real diutamakan dan fallback simulasi tetap jalan; (5) memverifikasi guard infinite-loop (`missing.length === 0`) ada di `bandarPrefetchMarketBatch()`. Dikonfirmasi FAIL tanpa fix pertama (`git stash` kode, cuma test tetap ada → gagal di assertion pertama), PASS dengan fix.
- **Verifikasi:** `node -c public/js/41-stockchat-cockpit.js` sukses. `npm test` 154/154 lulus (naik dari 153). `npm run lint` bersih. Playwright live (server lokal, tanpa `INVEZGO_API_KEY` — jadi jalur simulasi yang teruji, bukan jalur real): (a) awalnya CPU chromium >100% karena bug infinite-loop, DIPERBAIKI lalu diverifikasi ulang — cache size & inflight-flag stabil di 47 setelah 4 detik DAN 7 detik (tidak bertambah/berputar); (b) Market Flow, Accumulation, Distribution, Broker Trail (mode market) semua render lengkap dengan struktur & data yang benar, banner "SIMULASI" tampil jujur karena memang tidak ada key lokal; (c) Foreign Flow View (mode stock) render lengkap dengan Top 5 Foreign Buy/Sell, banner simulasi jujur; (d) nol `pageerror` (exception JS) di semua skenario — hanya network 403/tunnel-failed yang memang diharapkan (sandbox ini tidak punya akses Yahoo Finance/Invezgo).
- **Batasan yang tidak bisa diuji di sandbox ini:** jalur data REAL (Invezgo key benar-benar terkonfigurasi) tidak bisa diuji end-to-end tanpa akses internet ke Invezgo dari sandbox ini — diverifikasi lewat eksekusi langsung `bandarForeignNetRp()`/`bandarSmartMoneyNetRp()`/`bandarGetCachedSummary()` terhadap objek berbentuk PERSIS seperti yang dikembalikan `computeBandarmologyVerdict()` di production, bukan asumsi.
- Cache-bust: `41-stockchat-cockpit.js?v=20260917e`.

## 2026-09-17 — Audit menyeluruh kuota/runaway-loop: infinite-retry di Opportunity Radar + SSE reconnect tanpa henti di background tab

- **Konteks:** setelah dua PR berturut-turut ditemukan bug pemborosan kuota/resource (Invezgo TTL yang salah, lalu infinite render loop di `bandarPrefetchMarketBatch`), user meminta audit MENYELURUH satu kali terhadap seluruh codebase — bukan tambal-sulam bertahap lagi — supaya kuota Invezgo maupun invocation serverless Vercel di production tidak terus-menerus terkuras oleh bug kelas yang sama.
- **Metodologi:** subagent Explore menelusuri (1) setiap titik panggil ke fungsi/endpoint pemakai kuota Invezgo di seluruh `public/js/*.js`/`server.js`/`lib/*.js`, (2) setiap `setInterval`/`setTimeout` polling loop, (3) setiap pola "render → fetch async → callback render ulang" (kelas bug yang sama dengan `bandarPrefetchMarketBatch`), (4) risiko spesifik Vercel (cron job, cold-start, fungsi serverless yang tidak pernah berhenti). Setiap temuan diverifikasi ulang secara manual (baca kode langsung) sebelum diperbaiki — bukan langsung dipercaya dari laporan subagent.
- **Ditemukan & DIPERBAIKI (2 bug nyata, terverifikasi):**
  1. **`loadAccumulationDistributionData()` (`public/js/26-commandcenter.js`) — infinite retry loop tanpa guard sama sekali, LEBIH PARAH dari `bandarPrefetchMarketBatch`.** Pada kegagalan (network error ATAU `success:false` dari server) fungsi ini TIDAK PERNAH mengisi `RADAR_STATE.accData` — dibiarkan tetap `null`/`undefined`. `renderRadarAnomalyAraSubTab()` (sub-tab "Anomaly Structural & ARA" di Opportunity Radar) punya guard `if (!accData) { loadAccumulationDistributionData().then(renderOpportunityRadarPage); ... }` — begitu `RADAR_STATE.activeTab === 'anomaly-ara'`, KEGAGALAN APAPUN memicu fetch ulang di setiap siklus render, tanpa cooldown, tanpa inflight-flag, selama pengguna berada di tab tersebut. Fungsi saudara sekelasnya (`loadTransactionFlowData`/`loadCorporateActionsData`, file yang sama) SUDAH benar — mengisi state berbentuk `{error:true, ...}` pada kegagalan, sehingga guard-nya jadi `false` dan loop berhenti sendiri; `loadAccumulationDistributionData()` adalah SATU-SATUNYA fungsi di keluarga ini yang tidak melakukan itu.
     - Ditemukan juga bug terkait: `setRadarSubTab()` masih mengecek nama tab LAMA `'scanner'` (mati sejak konsolidasi "Scanner Akumulasi & Distribusi" mengganti nama jadi `'anomaly-ara'` — lihat entri konsolidasi sebelumnya) — jalur eager-fetch-saat-klik-tab yang seharusnya jadi pertahanan pertama (sama seperti `flow-trail`/`corporate-actions`) tidak pernah aktif untuk tab ini sama sekali.
     - **Perbaikan:** `loadAccumulationDistributionData()` sekarang mengisi `RADAR_STATE.accData` dengan objek berbentuk `{isSimulated:true, accumulation:[], distribution:[], message:'...'}` pada KEDUA jalur kegagalan (catch dan `success:false`) — memakai kontrak `isSimulated`+`message` yang sudah dibaca `renderRadarAnomalyAraSubTab()` untuk honest-empty state yang sudah ada. `setRadarSubTab()` diperbaiki mengecek `'anomaly-ara'` (bukan `'scanner'`).
  2. **`setupMultiDeviceSyncListener()` (`public/js/02-storage.js`) — koneksi SSE multi-device sync memicu invocation serverless Vercel baru kira-kira tiap ~30 detik, SELAMANYA, untuk SETIAP tab yang login dan dibiarkan terbuka — termasuk saat tab di-background.** `vercel.json` men-set `maxDuration: 30` untuk `api/index.js`, sementara route `/api/sync/stream` (server.js) mengirim heartbeat tiap 20 detik — artinya Vercel PASTI membunuh paksa koneksi sebelum heartbeat kedua sempat terkirim. `EventSource` browser otomatis reconnect saat koneksi terputus paksa (perilaku default, dikonfirmasi lewat komentar kode yang sudah ada) — TANPA backoff, TANPA batas retry, TANPA pemeriksaan Page Visibility API (dikonfirmasi lewat grep: nol pemakaian `visibilitychange` di SELURUH `public/js/*.js`). Hasilnya: setiap tab yang login (bahkan yang di-minimize/di-background, di mana toast notifikasi real-time toh tidak akan terlihat pengguna) tetap memicu invocation serverless baru tiap ~30 detik tanpa henti selama tab dibiarkan terbuka — inilah kandidat paling langsung untuk "kuota Vercel terkuras terus-menerus di production" yang dikhawatirkan user.
     - **Perbaikan:** ditambahkan listener `visibilitychange` (satu kali, di-guard dengan flag `_sseVisibilityListenerAttached`) yang MENUTUP koneksi SSE saat tab tersembunyi (`document.hidden === true`) dan MENYAMBUNG ULANG saat tab terlihat lagi. Juga ditambah guard di awal `setupMultiDeviceSyncListener()`: kalau tab SUDAH tersembunyi saat fungsi ini dipanggil (mis. login terjadi di tab background), tidak langsung connect — menunggu listener visibilitychange yang akan connect begitu tab terlihat. Tidak ada data yang hilang — sinkronisasi tetap real-time saat tab AKTIF dilihat pengguna, cuma tertunda (bukan hilang) selama tab di-background, yang toh tidak masalah karena tidak ada yang melihat toast notifikasinya saat itu.
- **Ditemukan tapi TIDAK diperbaiki sekarang (didaftar untuk keputusan user selanjutnya, bukan Invezgo-related, risiko lebih rendah/pre-existing, bukan bagian dari rentetan bug PR terakhir):** interval polling Yahoo Finance 15 menit (`38-ai-autonomous-trading.js`, tidak pernah berhenti sekali dimulai — `stopAiAutoRefresh()` dead code), 45 detik (`40-idx-pipeline.js`), 5 menit & 15 detik/2 menit (`03-engine.js`, sudah ada catatan sendiri di kode soal proxy CORS publik tanpa backoff) — semuanya auto-start saat aplikasi dibuka, tanpa guard `visibilitychange`, tapi memakai data Yahoo (gratis, tidak berkuota) bukan Invezgo. Auto-fire batch pertama Invezgo saat membuka tab "Broker Flow Riil"/"Anomaly Structural & ARA" (bukan lewat tombol scan eksplisit) — sudah dibatasi (`BATCH_CAP`/one-shot, bukan loop), cuma pola "auto-fire on tab-open" bukan "murni klik user", didokumentasikan untuk kesadaran, bukan bug.
- **Test regresi (`test_suite.js`):** (1) mengeksekusi LANGSUNG `loadAccumulationDistributionData()` di sandbox `vm` dengan `fetch` yang di-mock gagal (dua jalur: `success:false` dan network-throw), membuktikan `RADAR_STATE.accData` terisi objek honest-empty yang benar di kedua jalur; plus cek source-text `setRadarSubTab()` sudah mengecek `'anomaly-ara'` bukan `'scanner'`. (2) mengeksekusi LANGSUNG `setupMultiDeviceSyncListener()` di sandbox `vm` dengan `EventSource`/`document` palsu yang bisa men-simulasikan `hidden`/`visibilitychange`, membuktikan koneksi ditutup saat hidden dan tersambung ulang saat visible. Dikonfirmasi FAIL tanpa fix (`git stash`, assertion pertama gagal persis di baris yang diharapkan untuk masing-masing), PASS dengan fix.
- **Verifikasi:** `node -c` kedua file sukses. `npm test` 156/156 lulus (naik dari 154). `npm run lint` bersih. Playwright live (server lokal): (a) untuk bug #1 — dipasang `page.route()` memaksa `/api/idx/accumulation-distribution` selalu gagal, lalu klik tab "Anomaly Structural & ARA" — jumlah request ke endpoint tersebut berhenti di 2 (satu dari eager-fetch `setRadarSubTab`, satu dari lazy in-render check yang berjalan bersamaan saat entry pertama — bukan loop) dan TIDAK bertambah lagi setelah 6 detik menunggu, honest-empty message "FORCED FAILURE FOR TEST" tampil benar, nol `pageerror`; (b) untuk bug #2 — dieksekusi langsung di browser sungguhan (bukan cuma sandbox `vm`): `setupMultiDeviceSyncListener()` dipanggil dengan `EventSource` palsu, disimulasikan `document.hidden=true`+`dispatchEvent('visibilitychange')` → koneksi tertutup, lalu `hidden=false`+dispatch lagi → tersambung ulang (2 koneksi total, sesuai ekspektasi), nol `pageerror`.
- Cache-bust: `26-commandcenter.js?v=20260917c`, `02-storage.js?v=20260917b`.

## 2026-09-17 — Lanjutan audit kuota: pause polling Yahoo (IHSG 15dtk + ringkasan pasar 45dtk) saat tab tersembunyi

- **Konteks:** user minta cek 3 item polling Yahoo Finance yang didaftar tapi belum diperbaiki di entri audit sebelumnya (auto-refresh AI Trading 15 menit, ringkasan pasar 45 detik, IHSG 15 detik).
- **Analisis per item (diverifikasi baca kode langsung):**
  1. **`fhStart()` (`03-engine.js`) — IHSG tiap 15 detik = 240 request/jam/tab.** Dikonfirmasi lewat `FH.PROXIES`: di deployment Vercel (bukan static hosting), proxy PERTAMA yang dicoba adalah `local_proxy` = `/api/proxy?url=...` — **endpoint milik aplikasi sendiri**, bukan langsung ke pihak ketiga. Artinya sebagian besar dari 240 request/jam itu benar-benar invocation serverless Vercel. Ditemukan juga: kode SUDAH punya mode `'slow'` (refresh 15 menit, hemat) lengkap dengan key localStorage `mw_fh_refresh_mode_v1`, TAPI tidak pernah dipasang tombol UI-nya — user tidak bisa memilihnya sama sekali.
  2. **`IDX_PIPELINE.init()` (`40-idx-pipeline.js`) — ringkasan pasar tiap 45 detik = 80 request/jam/tab** ke `GET /api/idx/summary`. Ada cache server-side (`_summaryCache`), tapi tetap terhitung sebagai invocation Vercel di setiap panggilan (cache cuma mengurangi durasi eksekusi, bukan jumlah invocation).
  3. **Auto-refresh AI Trading 15 menit (`38-ai-autonomous-trading.js`) — DIPERIKSA TAPI SENGAJA TIDAK DIUBAH.** Dicek `aiRunAutonomousCycle()`: ini BUKAN sekadar refresh tampilan — fungsi ini benar-benar mengelola posisi paper-trading secara autonomous (auto-close saat kena SL/TP, auto-buka posisi baru berdasarkan sinyal scan), dan komentar kode menyatakan eksplisit ini SENGAJA didesain tetap jalan walau user pindah tab. Ditanyakan ke user: tetap jalan di background (dipilih) vs ikut di-pause. User pilih tetap jalan — mengubahnya jadi ikut ter-pause berisiko user kehilangan momen exit stop-loss penting saat tab di-background. Volume-nya juga jauh lebih kecil (4x/jam) dibanding 2 item lain (320x/jam gabungan).
- **Perbaikan:** dipasang pola `visibilitychange` yang sama persis dengan fix SSE sebelumnya (entri "Audit menyeluruh kuota/runaway-loop") pada 2 item pertama:
  - `03-engine.js` — `FH.timer` (interval IHSG/saham/kripto/ETF/kurs) di-clear saat tab tersembunyi, `fhStart()` dipanggil ulang (refresh instan + interval baru) saat tab terlihat lagi.
  - `40-idx-pipeline.js` — logika start interval diekstrak jadi `_startAutoRefresh()`/`_stopAutoRefresh()` yang bisa dipanggil ulang dari listener `visibilitychange`, pola yang sama.
  - Auto-refresh AI Trading TIDAK disentuh (sesuai keputusan user).
- **Test regresi (`test_suite.js`):** eksekusi langsung `fhStart()` dan `IDX_PIPELINE.init()` di sandbox `vm` dengan `document`/timer palsu, membuktikan interval berhenti saat `hidden=true` dan tersambung ulang saat `hidden=false`. **Catatan teknis:** percobaan pertama memakai `setInterval`/`clearInterval` REAL Node di sandbox — lolos tapi menyisakan timer nyata (15dtk+45dtk) yang bikin proses test menggantung sampai >120 detik sebelum keluar (memperlambat CI tanpa alasan). Diperbaiki dengan `makeFakeTimers()` — handle interval palsu (angka increment) yang tidak pernah benar-benar menjadwalkan callback, karena test ini cuma perlu membuktikan lifecycle start/stop, bukan efek saat interval benar-benar berbunyi. Setelah diperbaiki, seluruh suite kembali ~9 detik. Dikonfirmasi FAIL tanpa fix (`git stash`), PASS dengan fix.
- **Verifikasi:** `node -c` kedua file sukses. `npm test` 158/158 lulus (naik dari 156), total waktu ~9 detik (bukan >120 detik). `npm run lint` bersih. Playwright live (server lokal): dipasang `page.route()` menghitung request ke `/api/proxy` dan `/api/idx/summary` — setelah burst awal boot selesai (fetch staggered satu-kali untuk stocks/crypto/ETF, bukan bagian interval berulang), jumlah request `/api/proxy` **berhenti total** selama 20 detik tab disimulasikan tersembunyi (mencakup lebih dari satu siklus 15 detik yang seharusnya terjadi kalau tidak di-pause), lalu **langsung naik lagi** begitu tab terlihat kembali (`/api/proxy` 64→67, `/api/idx/summary` 1→2). Nol `pageerror` di semua skenario.
- Cache-bust: `03-engine.js?v=20260917a`, `40-idx-pipeline.js?v=20260917a`.
- **Sisa item yang sengaja dibiarkan (keputusan user):** auto-refresh AI Trading 15 menit tetap jalan di background — bukan bug, ini fitur autonomous position management yang disengaja.

## 2026-09-17 — Root cause ditemukan: seluruh panggilan Invezgo gagal (HTTP 422) karena format tanggal salah

- **Konteks:** setelah `INVEZGO_API_KEY` asli dipasang di production dan beberapa perbaikan UI/quota sebelumnya, user tetap melihat SEMUA data broker (Foreign Flow, Smart Money Screener "Seluruh BEI") masih berlabel simulasi — komplain langsung: "buat apa langganan API-nya kalau pakai data simulasi semua". Ini menandakan masalahnya bukan lagi UI wiring (sudah dibenerin PR #215), tapi panggilan API ke Invezgo itu sendiri yang gagal.
- **Diagnosis:** karena tidak ada akses ke Vercel runtime logs (koneksi Vercel MCP session ini belum diotorisasi untuk team project) maupun API key asli user, diagnosis dilakukan lewat DevTools browser milik user sendiri — dipandu buka Network tab, filter `broker-summary`, baca field `quality`/`dataSource` di response JSON `GET /api/idx/broker-summary/BBCA`. Hasilnya: `dataSource: "Simulasi (Invezgo tidak tersedia: HTTP_422)"` — **HTTP 422 Unprocessable Entity**, artinya request BENAR-BENAR sampai ke server Invezgo (key valid, bukan soal auth/kuota — itu akan jadi 401/402/429), tapi Invezgo menolak KARENA formatnya salah.
- **Root cause:** `brokerSummaryDateRange()` (`lib/idx-data-engine.js`) mengirim parameter `from_date`/`to_date` dalam format compact `YYYYMMDD` (mis. `"20260917"`) — ini ASUMSI yang sudah lama ditandai belum pernah diverifikasi (komentar lama di kode: "belum diverifikasi terhadap respons API sungguhan"). Dicek lewat README resmi SDK Python Invezgo (`github.com/Invezgo/invezgo-python-sdk`, via WebSearch/WebFetch — akses langsung ke `docs.invezgo.com`/`api.invezgo.com` diblokir kebijakan egress environment ini) — contoh pemanggilan resminya pakai format dash ISO: `from_date="2024-12-01"`. Mismatch format tanggal inilah yang sangat mungkin menyebabkan Invezgo menolak SETIAP permintaan sejak awal, membuat SELURUH fitur yang bergantung pada data broker real (Foreign Flow, Smart Money Screener, Anomaly Structural & ARA, dst — semua yang dibenerin di PR #215/#216) tetap jatuh ke simulasi walau key valid dan aktif.
- **Perbaikan:** `brokerSummaryDateRange()` diubah mengirim `fromDate`/`toDate` dalam format dash ISO (`YYYY-MM-DD`), sama dengan `toDateDisplay` yang sudah dipakai konsisten di tempat lain di file yang sama — satu format bersama, tidak ada lagi divergensi diam-diam.
- **Test regresi (`test_suite.js`):** eksekusi langsung `brokerSummaryDateRange()` di sandbox `vm`, membuktikan `fromDate`/`toDate` selalu berformat `YYYY-MM-DD` (regex `^\d{4}-\d{2}-\d{2}$`) untuk timeframe 1D maupun 5D+, dan source-text check memastikan `.replace(/-/g, ...)` (penghapus dash) tidak muncul lagi. Dikonfirmasi FAIL tanpa fix (`git stash`), PASS dengan fix.
- **Verifikasi:** `node -c` sukses. `npm test` 159/159 lulus (naik dari 158). `npm run lint` bersih. **Tidak bisa diuji end-to-end terhadap Invezgo API sungguhan dari sandbox ini** — tidak ada API key asli maupun akses jaringan ke `api.invezgo.com` (diblokir kebijakan egress). Perbaikan ini didasarkan pada bukti konkret (kode error 422 asli dari production + format tanggal resmi dari dokumentasi/SDK Invezgo), bukan tebakan, tapi TETAP PERLU diverifikasi ulang oleh user setelah deploy — cek lagi response `GET /api/idx/broker-summary/BBCA` lewat DevTools, harapannya `dataSource` berubah jadi `"Invezgo API (real)"` (atau kalau masih gagal, kode error HTTP-nya akan berbeda dan menunjukkan masalah berikutnya yang perlu diselidiki, misalnya parameter `investor`/`market` yang mungkin wajib diisi tapi belum dikirim kode kita).
- **Tidak disentuh di PR ini (di luar cakupan bug ini, perlu keputusan user terpisah):** skema field respons buyer/seller (`normalize()` di `generateBrokerSummary()`) masih menebak beberapa kemungkinan nama field sekaligus (belum pernah diverifikasi terhadap respons real) — kalau setelah fix tanggal ini request berhasil (200) tapi data buyer/seller tetap kosong/aneh, itu petunjuk field mapping perlu diperbaiki juga, ditunggu hasil verifikasi user dulu.

## 2026-09-17 — Root cause SEBENARNYA ditemukan (dari source code resmi Invezgo): nama parameter salah + 2 parameter wajib hilang total

- **Konteks:** setelah entri sebelumnya ("format tanggal salah") di-deploy, user verifikasi ulang via DevTools — **masih HTTP_422**. Berarti fix format tanggal perlu tapi tidak cukup; ada penyebab lain yang belum ketemu. User (tepat) menegur pendekatan tebak-tebak berulang dan minta baca dokumentasi resmi Invezgo langsung.
- **Kendala akses:** `docs.invezgo.com` dan `api.invezgo.com` DIBLOKIR oleh kebijakan egress environment ini (`WebFetch` gagal dengan `EGRESS_BLOCKED` untuk keduanya, dicoba beberapa kali). Diminta user screenshot halaman dokumentasi endpoint `/analysis/summary/broker/{code}` — dari situ ketahuan parameter query resminya: `from`, `to` (bukan `from_date`/`to_date`), plus **dua parameter wajib yang sama sekali tidak pernah dikirim kode kita**: `investor` (enum: all/f/d) dan `market` (enum: RG/NG/TN).
- **Konfirmasi definitif:** user upload file `.mcpb` (MCP Bundle resmi Invezgo, isinya source code JS/TypeScript client resmi mereka). Diekstrak dan dibaca langsung (bukan tebakan lagi):
  - `dist/schema/stock.js` — `summarySchema` (Zod) = `{code, from, to, investor: enum(["all","f","d"]).default("all"), market: enum(["RG","NG","TN"]).default("RG")}`, dengan deskripsi field `from`/`to`: "Tanggal periode ... format YYYY-MM-DD".
  - `dist/tools/stock/handler.js` — `summaryStock()` membangun URL PERSIS: `` `analysis/summary/stock/${args.code}?from=${args.from}&to=${args.to}&investor=${args.investor}&market=${args.market}` ``.
  - Ini konfirmasi 100% dari source resmi Invezgo sendiri, bukan lagi dokumentasi pihak ketiga yang ditafsirkan atau dugaan berdasarkan pola SDK bahasa lain.
- **Root cause final:** `fetchInvezgoBrokerSummary()` (`lib/invezgo-client.js`) mengirim query string `?from_date=...&to_date=...` — SALAH NAMA parameter (seharusnya `from`/`to`) DAN sama sekali tidak menyertakan `investor`/`market` yang wajib. Fix format-tanggal sebelumnya benar (Invezgo memang minta `YYYY-MM-DD`) tapi tidak menyelesaikan masalah karena nama parameternya sendiri salah dan 2 field wajib hilang — Invezgo menolak request yang dianggap tidak lengkap/salah bentuk, persis pola HTTP 422 (Unprocessable Entity, bukan soal auth/kuota).
- **Perbaikan:** query string diubah jadi `?from=${fromDate}&to=${toDate}&investor=all&market=RG` — persis format yang dipakai client resmi Invezgo sendiri (`investor=all`/`market=RG` adalah nilai default di schema resmi mereka).
- **Test regresi (`test_suite.js`):** source-text check memastikan pola lama (`from_date=...&to_date=...`) tidak muncul lagi, dan pola baru (`from=`, `to=`, `investor=all`, `market=RG`) semuanya ada. Dikonfirmasi FAIL tanpa fix (`git stash`), PASS dengan fix.
- **Verifikasi:** `node -c` sukses. `npm test` 160/160 lulus (naik dari 159). `npm run lint` bersih. **Tetap tidak bisa diuji end-to-end terhadap Invezgo API sungguhan** dari sandbox ini (tidak ada key asli, akses jaringan ke `api.invezgo.com` diblokir) — TAPI kali ini fix didasarkan pada SOURCE CODE RESMI Invezgo sendiri (bukan dokumentasi pihak ketiga yang ditafsirkan), jadi confidence jauh lebih tinggi dibanding perbaikan sebelumnya. Tetap perlu diverifikasi ulang oleh user setelah deploy dengan cara DevTools yang sama.
- **Pelajaran proses:** dua kali percobaan sebelumnya (format tanggal) berdasarkan inferensi tidak langsung (contoh dari SDK Python di README GitHub) — benar sebagian tapi tidak lengkap. Baru setelah punya akses ke SOURCE CODE RESMI (bukan dokumentasi yang ditafsirkan ulang), root cause lengkap ketemu sekali jalan. Untuk masalah integrasi API pihak ketiga berikutnya, prioritaskan mendapatkan spesifikasi/source resmi dari user di awal, alih-alih iterasi tebakan berdasarkan pola umum SDK bahasa lain.

## 2026-09-17 — Optimasi kuota Invezgo: scan "Seluruh BEI" diganti dari ~960 unit/scan jadi 1 unit/scan

- **Konteks:** setelah root cause HTTP 422 selesai diperbaiki (entri sebelumnya, dari source code resmi Invezgo), user minta langkah lanjut: "optimalkan langganan API saya untuk analisis broker... karna broker ini sifatnya reload per hari saja". Ditawarkan 4 opsi prioritas lewat AskUserQuestion; user memilih HANYA opsi #1 — ganti scan "Seluruh BEI" pakai endpoint top-movers Invezgo, bukan opsi KSEI-otomatis maupun Broker Trail/Sector data real (di luar cakupan PR ini).
- **Masalah lama:** `getUniverseAccumulationDistribution()` (dipakai oleh "Broker Flow Riil (Seluruh BEI)" di Smart Money Screener, DAN oleh sub-tab "Anomaly Structural & ARA" di Opportunity Radar — dua konsumen berbeda dari fungsi backend yang sama) memindai universe ~900+ ticker BEI dengan memanggil `generateBrokerSummary()` PER TICKER, dibatasi `BATCH_CAP=80`/klik. Satu scan penuh seluruh bursa = sampai ~960 unit kuota Invezgo (dari budget 30.000/bulan) — sangat boros untuk data yang cuma update sekali sehari (EOD ~17:30 WIB).
- **Sumber otoritatif dipakai (bukan tebakan):** endpoint `/analysis/top/accumulation` dan `/analysis/top/foreign` dikonfirmasi via response "Test Request" LANGSUNG yang di-capture user dari UI docs interaktif Invezgo (screenshot 401 Unauthorized menunjukkan path URL asli), lalu dikonfirmasi ulang secara definitif lewat 2 file JSON respons API REAL yang di-upload user setelah pakai Bearer token asli mereka — skema persis `{accum: [...], dist: [...]}`, tiap item `{code, name, price, change, value, volume, logo, calculated_value, graph}`.
- **Temuan penting soal `calculated_value`:** field ini adalah SKOR RANKING internal Invezgo (positif untuk akumulasi, negatif untuk distribusi) — BUKAN nilai Rupiah. Dikonfirmasi dari magnitude sampel real (mis. 107, -374.14, 76.6) yang jauh terlalu kecil untuk nilai transaksi saham sungguhan (yang biasanya miliaran/triliunan Rupiah untuk saham BEI). Disurfacekan jujur sebagai `score`, TIDAK PERNAH dilabeli sebagai mata uang — konsisten dengan prinsip "zero fabricated data" yang berlaku di seluruh aplikasi ini.
- **Perbaikan:**
  1. `lib/invezgo-client.js` — fungsi baru `fetchInvezgoTopMovers(kind, date)` memanggil `GET /analysis/top/{accumulation|foreign}?date=YYYY-MM-DD` SEKALI untuk SELURUH pasar (1 unit kuota, bukan per-ticker), di-cache 24 jam (`INVEZGO_TOP_MOVERS_CACHE_TTL_SEC`, default 86400) karena data ini EOD batch report — cache key sudah menyertakan tanggal, jadi otomatis berputar tiap tengah malam UTC (jauh sebelum bursa BEI buka jam 09:00 WIB).
  2. `lib/idx-data-engine.js` — `getUniverseAccumulationDistribution()` ditulis ulang: bukan lagi loop `Promise.allSettled` per-ticker dengan `BATCH_CAP`/`params.tickers`, sekarang satu panggilan `fetchInvezgoTopMovers('accumulation', date)` mengembalikan seluruh market sekaligus. Bentuk baris hasil berubah dari `{ticker, name, sector, bandarVerdict, concentration, topBuyers, topSellers, foreignNetRp, avgPrice, priceChangePct, smartMoneyInflowRp}` jadi `{ticker, name, sector, score, avgPrice, priceChangePct, volume, valueRp}` — trade-off yang dinyatakan jujur di komentar kode: endpoint baru ini tidak menyertakan breakdown top-buyer/top-seller per broker (detail itu tetap lewat jalur per-ticker `generateBrokerSummary()` yang dipakai analisis emiten tunggal).
  3. `public/js/07-flowscan.js` — mode "Broker Flow Riil" di Smart Money Screener disederhanakan total: dihapus `FS_BROKER_SCAN.universe/batchSize/nextIndex/scannedCount/timeframe`, dihapus `fsSetBrokerScanTimeframe()` dan `fsRunNextBrokerScanBatch()` (UI progress-bar/tombol "Lanjutkan Scan +N saham"/pilihan timeframe 1D-20D) seluruhnya — diganti SATU fetch ke `GET /api/idx/accumulation-distribution` dengan tombol "Refresh" sederhana. Kolom tabel diganti dari Ticker/Verdict Bandar/Smart Inflow/Foreign Net jadi Ticker/Price/Chg%/Skor/Alur, dibatasi tampil 100 baris per sisi (data baru bisa berisi 400-500+ item per sisi, jauh lebih banyak dari sebelumnya yang dibatasi ≤80/request).
  4. `public/js/26-commandcenter.js` — `renderRadarAnomalyAraSubTab()` (konsumen KEDUA dari backend yang sama, ditemukan lewat grep sebelum implementasi selesai — kalau tidak diperbaiki bersamaan akan diam-diam rusak karena membaca field yang sudah dihapus) diperbarui membaca bentuk field baru.
- **Test regresi (`test_suite.js`):** 2 test lama yang secara EKSPLISIT menguji desain LAMA (batch-scan user-controlled + `params.tickers`/LQ45-as-ceiling) ditulis ulang untuk menguji kontrak BARU (satu panggilan `fetchInvezgoTopMovers`, bukan lagi ada "ceiling" ticker untuk dikonfigurasi) — bukan dihapus begitu saja, tapi disesuaikan karena perilaku memang sengaja diubah atas permintaan user sendiri. Ditambah 2 test baru: (1) `fetchInvezgoTopMovers()` memanggil URL `/analysis/top/{kind}?date=...` yang benar, mengirim Bearer auth, memvalidasi skema `{accum, dist}` array, dan honest early-return `NOT_CONFIGURED` saat key tidak ada; (2) `getUniverseAccumulationDistribution()` memetakan `calculated_value` ke field `score` (bukan `smartMoneyInflowRp`/`foreignNetRp` — mencegah regresi pelabelan skor sebagai Rupiah). Dikonfirmasi FAIL tanpa fix (`git stash` semua file lib/js kecuali test_suite.js, ke-4 test baru/diperbarui gagal persis di assertion yang diharapkan), PASS dengan fix (`git stash pop`).
- **Verifikasi:** `node -c` keempat file sukses. `npm test` 162/162 lulus (naik dari 160). `npm run lint` bersih. Grep memastikan tidak ada sisa referensi ke fungsi yang dihapus (`fsSetBrokerScanTimeframe`, `fsRunNextBrokerScanBatch`) atau field state lama di `07-flowscan.js`/`index.html`. Playwright live (server lokal, tanpa `INVEZGO_API_KEY` — jalur honest-fallback yang teruji, bukan jalur real): mode "Broker Flow Riil" di Smart Money Screener dan sub-tab "Anomaly Structural & ARA" di Opportunity Radar keduanya render pesan fallback jujur "belum dikonfigurasi" dengan benar, nol `pageerror` (exception JS) — hanya network 403/tunnel-failed yang memang diharapkan di sandbox ini.
- **Batasan yang tidak bisa diuji di sandbox ini:** jalur data REAL (key Invezgo asli terkonfigurasi, endpoint `/analysis/top/accumulation`+`/analysis/top/foreign` benar-benar dipanggil) tidak bisa diuji end-to-end tanpa akses internet ke Invezgo dari sandbox ini (`api.invezgo.com` diblokir kebijakan egress) — root cause & skema respons kali ini dikonfirmasi dari data REAL (2 file JSON respons API asli yang di-upload user, bukan simulasi/tebakan), jadi confidence tinggi, tapi tetap perlu diverifikasi ulang oleh user setelah deploy: cek Smart Money Screener mode "Broker Flow Riil", harapannya banner berubah dari simulasi jadi "Invezgo API (real)" dan tabel akumulasi/distribusi terisi ratusan ticker (bukan ≤80 seperti sebelumnya), sekali refresh = 1 unit kuota per sisi (2 unit total untuk accum+dist), bukan ratusan.
- **Di luar cakupan PR ini (opsi yang TIDAK dipilih user):** otomatisasi KSEI via API, dan data Broker Trail/Sector real (saat ini masih simulasi) — tetap menunggu keputusan user terpisah kalau ingin dilanjutkan.
- Cache-bust: `07-flowscan.js?v=20260917d`, `26-commandcenter.js?v=20260917d`.

## 2026-09-17/18 — Audit lanjutan "masih banyak bug" (6 temuan, semua terverifikasi & diperbaiki)

- **Konteks:** setelah PR #220 (optimasi kuota top-movers) merge, user melaporkan daftar temuan lagi: Heatmap Aliran Dana Smart Money Sektoral masih simulasi, IHSG belum ada volume/history, Opportunity Radar data terbatas padahal ada API, Volume Spike Scanner & Bandarmology "DATA INVALID", Screening Volume Spike maksimal Kompas100, dan Screener Saham LQ45 masih 45 saham padahal ada 950. Setiap klaim diverifikasi langsung di kode/lewat screenshot sebelum diperbaiki — tidak ada yang langsung dipercaya begitu saja (beberapa ternyata bukan bug, tapi keterbatasan by-design yang sudah jujur dilabeli).
- **1. Heatmap Aliran Dana Smart Money Sektoral (`07-flowscan.js`)** — dulu badge-nya sendiri literally bertuliskan "SIMULASI FLOW", memakai `generateClientSideBrokerSummary()` (CMF sintetis lokal), padahal mode "Broker Flow Riil" di halaman yang sama sudah pakai data Invezgo real dari PR #220. Diperbaiki: `fsRenderSectorHeatmapMode()` sekarang berbagi `FS_BROKER_SCAN` (state yang sama dengan mode Broker Flow Riil — satu fetch dipakai dua mode, tidak ada panggilan Invezgo tambahan), agregasi sektor dari `valueRp` real, dan badge "DATA REAL" jujur atau pesan honest-fallback (bukan lagi tabel simulasi diam-diam) kalau Invezgo tidak tersedia.
- **2. Screener Saham LQ45 (`11-quant.js`) — benar-benar cuma 45 saham, terpisah dari Opportunity Radar (yang sudah 950+).** Ditambah `scResolveUniverseList()`/`scChangeUniverse()` dengan opsi LQ45 (default, cepat)/IDX30/KOMPAS100/Semua BEI, sumber `/api/idx/stocks` (sama seperti Opportunity Radar/Volume Spike). `scBuildSim()` diubah dari loop 250ms/ticker (≈4 menit untuk 950 saham) jadi batch konkuren (`VS_SCAN_BATCH`-style, 8 ticker/batch).
- **3. Volume Spike Scanner maksimal Kompas100 (`45-volume-spike.js`)** — ditambah opsi "Seluruh BEI (950+)" di `VS_INDEX_LABELS`, scan diubah dari 350ms/ticker sekuensial jadi batch konkuren (`VS_SCAN_BATCH=4`, sengaja lebih konservatif dari Screener karena `rdEnsure()` berbagi proxy CORS publik dengan seluruh app).
- **4. Bandarmology & Smart Money "DATA INVALID" (`lib/invezgo-client.js`, `lib/idx-data-engine.js`)** — user kirim screenshot menunjukkan badge "DATA INVALID: Skema respons Invezgo tidak dikenali". Ini bug LAMA yang sudah diketahui belum terverifikasi (`INV-P1-002`, sengaja fail-closed daripada mengarang data). User kirim JSON respons REAL `/analysis/summary/stock/BBCA` (bukan tebakan) — ternyata skemanya array datar, satu baris per broker dengan field `buy_value`/`sell_value`/dst SEKALIGUS (bukan dua array `buyers[]`/`sellers[]` terpisah seperti yang ditebak sebelumnya, dan semua angka berupa STRING). Root cause: cek lama `!raw.data && !raw.buyers && !raw.brokers` selalu true untuk array datar → selalu jatuh ke INVALID. Diperbaiki: `fetchInvezgoBrokerSummary()` deteksi `Array.isArray(raw)`, derive buyers/sellers dari `buy_value`/`sell_value`. Ditemukan juga: respons ini (investor=all) TIDAK punya flag foreign/domestik per broker sama sekali — field `type`/`category` yang dulu default ke 'D' (mengklaim "0% asing" seolah measurement nyata) sekarang jujur `null`, dan `computeBandarmologyVerdict()`'s `foreignFlow`/`domesticFlow` sekarang `{available:false, ...:null}` bukan `0` palsu. Efek samping yang ikut diperbaiki: `statusOf()` di `45-volume-spike.js` salah label "Net Sell" untuk nilai `undefined` (karena `undefined >= 0` adalah `false`) — sekarang treat `undefined` sama seperti `null` ("Data tidak tersedia").
- **5. Opportunity Radar "MoS ITMS -1106385.6%" (`lib/idx-data-engine.js`)** — bug matematika murni, bukan data salah. Formula "Justified P/B" (`(ROE/8%)`) jadi pembagi mendekati nol saat ROE mendekati 0%/negatif, meledakkan rasio ke jutaan persen — hasil formula yang secara teknis "benar" tapi tidak bermakna. Diperbaiki: MoS cuma dihitung kalau ROE cukup jauh dari nol (`roe >= REQUIRED_RETURN*100*0.1` = 0.8%) supaya `justifiedPbv` tidak pernah di bawah 0.1x; di luar itu MoS jujur `null` → tampil "N/A", bukan angka ngawur.
- **6. IHSG belum integrasi volume/history (`03-engine.js`, `28-decisiontools.js`)** — chart IHSG di halaman Market Pulse (`renderDailyBriefIhsgChart`) sudah pakai data real untuk "1D" (akumulasi live-polling), tapi tab rentang 5D/1M/6M/YTD/1Y/5Y/All CUMA tombol disabled ("Riwayat X butuh data historis resmi bursa — belum terintegrasi") — gap yang sudah jujur dilabeli, bukan dikarang, tapi tetap gap nyata. (Catatan: fungsi `buildIhsgChart()` terpisah di `03-engine.js` yang tadinya dikira ini ternyata DEAD CODE — 100% kurva sinus buatan, tapi tidak pernah dirender karena elemen `id="ihsgChart"` tidak ada di manapun di index.html — jadi bukan sumber data yang benar-benar tampil ke user, dibiarkan apa adanya di luar cakupan ini.) Diperbaiki: `fhFetchIhsgHistory()`/`rdEnsureIhsgHistory()` baru (pola sama `fhFetchCryptoDailyHistory()` yang sudah ada) menarik histori real `^JKSE` dari Yahoo Finance sesuai rentang (5D→interval 15m, 1M/6M/YTD→1d, 1Y→1wk, 5Y/ALL→1mo), dengan cache TTL + backoff kegagalan (supaya tidak menghajar proxy tiap re-render). Tab rentang sekarang aktif (`dbSwitchIhsgRange()`), render dari data real atau pesan jujur "Gagal memuat data historis IHSG (tf) — coba lagi nanti." — tidak pernah macet diam di "Memuat..." atau canvas kosong tanpa keterangan.
  - **Proses debugging yang perlu dicatat**: sempat dikira ini masih ada bug baru (`rdEnsureIhsgHistory` tidak pernah terpanggil saat tab diklik lewat UI sungguhan) — setelah instrumentasi Playwright, ternyata root cause-nya BUKAN bug kode, melainkan Chart.js (dimuat dari CDN `cdnjs.cloudflare.com`, `index.html:177`) gagal dimuat karena kebijakan egress sandbox ini (bukan cuma Yahoo/Invezgo yang diblokir — CDN pihak ketiga lain juga). Dikonfirmasi dengan menyuntik Chart.js palsu (stub) di Playwright: begitu prasyarat itu terpenuhi, seluruh alur (`dbSwitchIhsgRange` → `rdEnsureIhsgHistory` → honest fallback) bekerja benar tanpa perubahan kode lebih lanjut. Guard `if (!cv || typeof Chart === 'undefined') return` tetap benar secara desain (jangan render chart tanpa library chart-nya), cuma ditambah `console.warn` supaya kasus serupa di masa depan tidak lagi terlihat seperti "diam-diam tidak terjadi apa-apa" tanpa jejak diagnostik.
  - Volume IHSG sendiri: sudah ada disclosure jujur "Volume tidak tersedia untuk indeks komposit" (IHSG sebagai indeks komposit memang tidak punya angka volume sendiri yang bermakna dari Yahoo) — dibiarkan apa adanya, tidak dikarang.
- **Test regresi (`test_suite.js`):** 168 total (naik dari 162) — source-text + fixture check untuk keenam fix di atas, semua dikonfirmasi FAIL tanpa fix (`git stash` file terkait per fix, assertion gagal persis di baris yang diharapkan), PASS dengan fix (`git stash pop`). Termasuk sanity check numerik langsung untuk bug MoS (replikasi formula dengan ROE 0.007%/negatif/15% membuktikan guard bekerja).
- **Verifikasi:** `node -c` semua file sukses. `npm test` 168/168 lulus, `npm run lint` bersih. Playwright live (server lokal): Heatmap Sektoral & Bandarmology render honest-fallback benar (tanpa `INVEZGO_API_KEY` di sandbox ini), chart IHSG diverifikasi end-to-end dengan Chart.js stub untuk membuktikan seluruh 7 tab rentang berakhir di data real ATAU pesan gagal jujur, nol `pageerror` di semua skenario.
- **Batasan yang tidak bisa diuji di sandbox ini:** jalur data REAL Invezgo (`api.invezgo.com` diblokir egress) dan jalur data REAL Yahoo untuk histori IHSG (`query1.finance.yahoo.com`/CDN `cdnjs.cloudflare.com` juga diblokir) — kali ini skema Bandarmology dikonfirmasi dari JSON respons REAL yang di-upload user (bukan tebakan), jadi confidence tinggi; histori IHSG diverifikasi lewat stub Chart.js yang membuktikan logika kode benar, tapi data REAL dari Yahoo tetap perlu dicek user setelah deploy (harapannya chart 1M/1Y dst terisi kurva harga sungguhan, bukan pesan "Gagal memuat").
- **Tidak dikerjakan di sesi ini (keputusan eksplisit user via plan mode):** Financial Statement/Key Stats (`24-stockmaster.js`) — sudah pakai data real Yahoo Finance (bukan bug), user pilih skip dulu untuk hemat kuota Invezgo. Sector Rotation dan Shareholder/KSEI live-fetch dari Invezgo — direncanakan sebagai langkah lanjutan terpisah (lihat task tracker sesi ini), belum diimplementasi.
- Cache-bust: `07-flowscan.js?v=20260917d`, `11-quant.js?v=20260917a`, `45-volume-spike.js?v=20260917b`, `03-engine.js?v=20260918a`, `28-decisiontools.js?v=20260918a`.

## 2026-09-18 — Shareholder/KSEI live-fetch dari Invezgo (4 endpoint, skema real terverifikasi)

- **Konteks:** lanjutan dari plan yang disetujui user setelah audit "masih banyak bug" — user eksplisit minta Shareholder/KSEI dikerjakan lebih dulu ("Shareholder/KSEI dulu, baru Sector Rotation"), karena Invezgo ternyata punya API untuk ini yang belum pernah dipakai, sementara `34-ksei-shareholders.js` selama ini 100% mengandalkan upload manual Excel/CSV.
- **Sumber otoritatif dipakai (bukan tebakan):** user menjalankan "Test Request" langsung di docs interaktif Invezgo untuk BBCA dan mengirim 4 JSON respons REAL: `/analysis/shareholder/number/{code}`, `/analysis/shareholder/ksei/{code}`, `/analysis/shareholder/classify-table/{code}`, `/analysis/shareholder/classification/{code}`. Legenda 39 kode klasifikasi granular (`BK`=Bank, `GV`=Pemerintah, dst) juga dikirim user langsung dari dokumentasi resmi Invezgo — bukan ditebak.
- **Temuan penting soal bentuk data:** endpoint-endpoint ini TIDAK mengembalikan pemegang saham bernama (beneficial owner) — hanya AGREGAT per KATEGORI investor (Asing/Lokal × 9 kategori KSEI standar, atau 39 kategori granular). Ini secara fundamental berbeda dari dataset upload manual ">5% Kepemilikan" yang sudah ada (yang MEMANG berisi nama investor). Karena itu, data live ini disurfacekan sebagai kartu komposisi TERPISAH ("Komposisi Kepemilikan Live — Invezgo"), TIDAK dipaksakan ke bentuk `investors[]` yang butuh nama pemegang saham (memaksakannya akan berarti mengarang nama investor yang tidak ada di data).
- **Skema per endpoint (dikonfirmasi dari JSON real BBCA):**
  1. `/shareholder/number/{code}` — array bulanan `{code, date, value, price}`; `value` = JUMLAH PEMEGANG SAHAM (magnitudo 300rb–800rb, bukan nilai Rupiah).
  2. `/shareholder/ksei/{code}?range=N` — array bulanan `{code, date, price, foreign_<kode>, local_<kode>}` untuk 9 kategori standar KSEI (`is`/`cp`/`pf`/`ib`/`id`/`mf`/`sc`/`fd`/`ot`).
  3. `/shareholder/classify-table/{code}` — SATU objek snapshot bulan terakhir, 39 kode kategori granular + `total`, **tanpa field tanggal** (di-surface jujur via `periodUnknown: true`, bukan mengarang tanggal).
  4. `/shareholder/classification/{code}?range=N` — array time-series dari struktur yang sama seperti #3, tapi tiap entri punya `date`.
- **Perbaikan:**
  1. `lib/invezgo-client.js` — 4 fetcher baru (`fetchInvezgoShareholderNumber/Ksei/ClassifyTable/Classification`), semua lewat `getOrFetch()`/`invezgoFetch()` (kuota bersama, cache 3 hari — data ini bulanan, tidak perlu refetch harian), fail-closed honest (`NOT_CONFIGURED`/`AUTH_FAILED`/dst) tanpa `INVEZGO_API_KEY`. `INVEZGO_KSEI_CATEGORY_LABELS` (9 kategori) dan `INVEZGO_CLASSIFICATION_LABELS` (39 kode, dari legenda resmi Invezgo) dipakai untuk menerjemahkan kode ke nama — tidak ada kode yang diterjemahkan berdasarkan tebakan.
  2. `lib/idx-data-engine.js` — `generateShareholderComposition(ticker)` memanggil ketiga fetcher (number/ksei/classify-table) paralel, mengembalikan hasil per-bagian dengan error jujur per-bagian (`errors: [{part, reason}]`) kalau salah satu gagal — satu bagian gagal tidak menggagalkan bagian lain.
  3. `server.js` — route baru `GET /api/idx/shareholder-composition/:ticker`.
  4. `public/js/34-ksei-shareholders.js` — kartu baru "📡 Komposisi Kepemilikan Live (Invezgo, per Kategori Investor)" dirender DI BAWAH tabel pemegang saham >5% yang sudah ada (bukan menggantikannya), dimuat async via `kseiLoadLiveComposition()` setelah `renderKseiStockView()`. Tiap bagian (jumlah pemegang saham, komposisi Asing/Lokal, detail klasifikasi top-10) tampil independen dengan pesan honest-fallback (`_kseiReasonText()`) kalau bagian itu gagal — tidak pernah kosong tanpa keterangan.
- **Test regresi (`test_suite.js`):** 3 test baru (total 171, naik dari 168) — source-text check untuk keempat fetcher (endpoint URL benar, mapping field real, `periodUnknown` untuk classify-table), untuk `generateShareholderComposition()` (memanggil ketiga fetcher, error per-bagian), dan untuk UI (kartu terpisah, tidak digabung ke tabel investor bernama, honest-fallback text ada). Dikonfirmasi FAIL tanpa fix (`git stash` ke-4 file implementasi, ketiga test baru gagal — 2 dengan assertion message eksplisit, 1 dengan fungsi hilang), PASS dengan fix (`git stash pop`).
- **Verifikasi:** `node -c` ke-4 file sukses. `npm test` 171/171 lulus. `npm run lint` bersih. Playwright live (server lokal, tanpa `INVEZGO_API_KEY` di sandbox ini): `GET /api/idx/shareholder-composition/BBCA` mengembalikan `NOT_CONFIGURED` jujur di ketiga bagian (bukan data kosong tanpa keterangan); dibuka lewat `openKseiModal('BBCA')` (entry point sungguhan, bukan pemanggilan fungsi internal langsung) — kartu live tampil dengan 3 pesan fallback jujur, nol `pageerror`.
- **Batasan yang tidak bisa diuji di sandbox ini:** jalur data REAL Invezgo (`api.invezgo.com` diblokir egress sandbox ini) — skema kali ini dikonfirmasi 100% dari 4 JSON respons REAL yang di-upload user (bukan tebakan), jadi confidence tinggi, tapi tetap perlu diverifikasi ulang oleh user setelah deploy: cek halaman Shareholder KSEI untuk BBCA, harapannya kartu "Komposisi Kepemilikan Live" terisi angka real (jumlah pemegang saham, breakdown Asing/Lokal, top-10 klasifikasi), bukan pesan "Invezgo API key belum dikonfigurasi".
- **Terkait tapi belum selesai:** Sector Rotation (`GET /analysis/sector/rotation`) — dites user 2x dengan parameter valid (tanpa filter, rentang tanggal dalam 2 tahun terakhir sampai hari ini) dan KEDUANYA mengembalikan `data: []` kosong. Bukan bug di kode kita (belum ada kode yang ditulis untuk endpoint ini) — kemungkinan endpoint ini butuh tier akun berbeda atau ada masalah di sisi Invezgo. Ditandai blocked-menunggu-vendor, user disarankan email `admin@invezgo.com` untuk klarifikasi sebelum implementasi dilanjutkan.
- Cache-bust: `34-ksei-shareholders.js?v=20260918a`.

## 2026-09-18 — Sector Rotation: RRG live dari Invezgo (skema resmi dari file OpenAPI spec, bukan tebakan)

- **Konteks:** lanjutan Task #10 yang sebelumnya blocked — user 2x test endpoint `/analysis/sector/rotation` dengan parameter valid dan keduanya mengembalikan `data: []` kosong, dicurigai bug/masalah akun. Untuk memastikan, user diarahkan menyiapkan **Claude Code CLI lokal** (di luar sandbox cloud ini, supaya tidak kena blokir egress `docs.invezgo.com`) dan mengambil **file spec OpenAPI resmi Invezgo** langsung (`docs.invezgo.com/api/openapi.json`), lalu upload file itu ke sesi ini.
- **Temuan dari spec resmi (bukan tebakan sama sekali — ini file spec vendor, bukan hasil trial-and-error):** respons `data: []` adalah **kasus resmi yang didokumentasikan** untuk "data rotasi sektor tidak tersedia" (kode 204 di spec, meski server nyatanya mengembalikannya dengan kode 200) — bukan bug. Spec juga memberi CONTOH respons 200 lengkap saat data tersedia:
  ```json
  {"benchmark":"COMPOSITE","lastDate":"2025-09-19","data":[{"code":"IDXENERGY","name":"Energy","trail":[{"date":"2025-09-15","x":98.5,"y":101.2},...],"quadrant":"leading"}]}
  ```
  Ini pola **RRG (Relative Rotation Graph)**: `x`/`y` = koordinat RS-Ratio/RS-Momentum, `quadrant` ∈ {leading, weakening, lagging, improving}. Parameter resmi: `from`/`to` (wajib, YYYY-MM-DD), `base` (default COMPOSITE untuk level indeks sektoral — 11 kode: IDXENERGY, IDXFINANCE, IDXBASIC, IDXINDUST, IDXNONCYC, IDXCYCLIC, IDXHEALTH, IDXPROPERT, IDXTECHNO, IDXINFRA, IDXTRANS), `length` (5-50, default 10), `interval` (daily/weekly, default weekly), `tail` (1-52, default 5). Dibatasi data 2 tahun terakhir (2010-01-01 khusus paket Enterprise).
- **Perbaikan (menambahkan, TIDAK menghapus CMF-konstituen yang sudah ada — sesuai rencana yang disetujui user):**
  1. `lib/invezgo-client.js` — `fetchInvezgoSectorRotation()` baru: `GET /analysis/sector/rotation?from=...&to=...&base=COMPOSITE&interval=weekly&length=10&tail=5` (rentang ~180 hari kalender ke belakang, cukup untuk smoothing 10+trailing 5 periode mingguan), cache 24 jam (`INVEZGO_SECTOR_ROTATION_CACHE_TTL_SEC`, data EOD harian). `data: []` (atau kode 204) dipetakan jujur ke `UNAVAILABLE/NO_DATA` — bukan `REAL` dengan array kosong.
  2. `lib/idx-data-engine.js` — `generateSectorRotation()` + tabel `INVEZGO_SECTOR_CODE_TO_KEY` yang memetakan 11 kode indeks sektoral resmi Invezgo ke 11 key sektor yang SUDAH ADA di `44-sectoral-insight.js` (pemetaan 1:1 langsung, bukan tebakan — kode-kodenya persis nama indeks sektoral resmi BEI pasca-reklasifikasi 2021 yang muncul di enum parameter `base`).
  3. `server.js` — route baru `GET /api/idx/sector-rotation`.
  4. `public/js/44-sectoral-insight.js` + `index.html` — kolom baru "RRG Live (Invezgo)" di tabel sektoral, dimuat async (`siLoadRealRotation()`) sebagai **suplemen** di samping kolom CMF/Status Aliran yang sudah ada — `siComputeAllSectors()` (CMF-konstituen) SAMA SEKALI TIDAK diubah/dihapus, tetap jadi sumber utama visualisasi bar/quadrant D3 yang sudah teruji. Kolom baru menampilkan badge kuadran RRG (leading/weakening/lagging/improving) kalau tersedia, atau pesan honest-fallback per-alasan (`NOT_CONFIGURED`/`NO_DATA`/dst) kalau tidak — tidak pernah kosong tanpa keterangan.
  - **Keputusan desain (bukan pengganti visualisasi D3):** karena data real belum bisa diverifikasi populated (`data:[]` di kedua percobaan user, dan sandbox ini tidak bisa akses `api.invezgo.com`), RRG live ditambahkan sebagai kolom tabel suplemen berlabel jujur, BUKAN menggantikan scatter/bar chart D3 berbasis CMF yang sudah teruji — menghindari menulis ulang visualisasi kompleks yang tidak bisa diuji end-to-end dengan data real di sandbox ini.
- **Test regresi (`test_suite.js`):** 3 test baru (total 174, naik dari 171) — source-text check untuk `fetchInvezgoSectorRotation()` (endpoint benar, `data:[]`/204 dipetakan ke NO_DATA bukan REAL kosong, mapping quadrant/trail/x/y sesuai contoh resmi spec), `generateSectorRotation()` (memanggil fetcher, tabel mapping berisi semua 11 kode resmi, route ter-import), dan UI (`siComputeAllSectors` TIDAK dihapus, kolom RRG live ter-render sebagai suplemen, honest-fallback text ada). Dikonfirmasi FAIL tanpa fix (`git stash` ke-4 file implementasi, ketiga test baru gagal), PASS dengan fix (`git stash pop`).
- **Verifikasi:** `node -c` ke-4 file sukses. `npm test` 174/174 lulus. `npm run lint` bersih. Playwright live (server lokal, tanpa `INVEZGO_API_KEY`): halaman Sectoral Insight tetap render CMF/bar-chart/quadrant seperti biasa (tidak ada regresi visual), kolom "RRG Live (Invezgo)" menampilkan `— (Invezgo API key belum dikonfigurasi)` jujur per baris sektor, nol `pageerror`.
- **Batasan yang tidak bisa diuji di sandbox ini:** jalur data REAL Invezgo tidak bisa diuji end-to-end (`api.invezgo.com` diblokir egress sandbox ini) — DAN bahkan dengan API key asli user di akun mereka sendiri, endpoint ini sejauh ini SELALU mengembalikan `data:[]` untuk rentang tanggal yang sudah dicoba (mungkin karena batasan tier akun, meski spec tidak menyebutkan syarat tier khusus untuk base=COMPOSITE — beda dengan syarat Enterprise untuk data sebelum 2 tahun terakhir). Skema parsing dikonfirmasi 100% dari file OpenAPI spec resmi vendor (confidence tinggi untuk KETIKA data tersedia), tapi user perlu memverifikasi ulang setelah deploy — kalau kolom "RRG Live" tetap menampilkan "Belum ada data rotasi untuk rentang ini" terus-menerus meski API key valid, itu pertanyaan lanjutan untuk `admin@invezgo.com` (apakah base=COMPOSITE butuh tier tertentu yang belum tercantum di spec).
- **Proses menarik dicatat:** ini pertama kalinya di sesi ini skema API dikonfirmasi lewat **file OpenAPI spec resmi vendor** (bukan screenshot Test Request satu-per-satu) — didapat dengan mengarahkan user memakai Claude Code CLI LOKAL (di luar sandbox cloud ini) untuk fetch `docs.invezgo.com` langsung, karena domain itu diblokir kebijakan egress sandbox. Satu file ini berisi skema SEMUA 94 endpoint Invezgo sekaligus — jauh lebih efisien untuk verifikasi skema ke depannya dibanding screenshot per-endpoint.
- Cache-bust: `44-sectoral-insight.js?v=20260918a`.

## 2026-09-18 — Opportunity Radar: fundamentals cache dipindah ke Redis + cron warming rotasi 950 saham

- **Konteks:** task lama yang sempat pending (dicatat sejak audit "masih banyak bug lagi") — Opportunity Radar cuma bisa menilai fundamental real untuk irisan LQ45/IDX30 (~48 saham) dari total ~958 saham universe; sisanya jujur dilabeli "DATA TERBATAS". Root cause: `_fundamentalsCache` (`lib/providers/yahoo-client.js`) adalah `Map` in-memory biasa — karena app ini serverless (Vercel), cache in-memory TIDAK bertahan lintas cold-start dan TIDAK dibagi antar instance concurrent, jadi cron warming pun percuma kalau cache-nya tetap begitu (instance lain yang menerima request user tetap dapat cache kosong).
- **Keputusan desain (disetujui user via AskUserQuestion sebelum implementasi):**
  1. **Cakupan cron**: Vercel Hobby (paket user) cuma boleh cron 1x/hari, durasi function 30 detik (`vercel.json`) — realistis cuma ~250-350 saham/run. Full 950 saham dicapai bertahap lewat **rotasi cursor** (~3 hari per siklus penuh, cursor tersimpan di Redis).
  2. **TTL Redis**: positif 24 jam (fundamental EPS/ROE dst tidak berubah intraday), negatif 10 menit (saham tanpa coverage Yahoo — dicoba ulang berkala, tidak dihajar tiap request).
- **Perbaikan:**
  1. `lib/providers/yahoo-client.js` — tambah helper Redis+fallback SELF-CONTAINED (`getYahooRedis()`, `yfStoreGet/yfStoreSetEx/yfStoreMget`), pola sama persis dengan yang sudah teruji di `lib/invezgo-client.js` TAPI sengaja DIDUPLIKASI (bukan refactor shared) karena `getOrFetch()` Invezgo hard-coupled ke sistem kuota mereka (`reserveQuota()`) — menghindari risiko regresi ke kode Invezgo yang sudah production-proven. Reuse env var `UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN` yang sama (satu Upstash instance, namespace key beda: `yahoo:fundamentals:*` vs `invezgo:*`).
  2. `fetchYahooFundamentals()` — cache Map diganti Redis-backed (`yahoo:fundamentals:<TICKER>`), TTL positif 24 jam / negatif 10 menit (menggantikan trik lama "backdate timestamp" yang rapuh kalau TTL berubah).
  3. `getCachedFundamentalsOnly()`/`hasFundamentalsCacheEntry()` — jadi `async` (Redis read genuinely async, breaking change kecil ke API internal). `getCachedFundamentalsBulk(tickers)` baru — SATU panggilan `mget` untuk semua ~958 ticker sekaligus, supaya `getUniverseOpportunityRadar()`'s loop scoring (950 saham) tidak jadi 950 round-trip Redis terpisah per request.
  4. `getUniverseOpportunityRadar()` (`lib/idx-data-engine.js`) — panggil `getCachedFundamentalsBulk()` sekali di awal, `.map()` scoring tetap sinkron membaca dari Map hasil bulk-fetch (bentuk kode tidak berubah drastis).
  5. `warmRadarFundamentals()` (on-demand, LQ45/IDX30) — TETAP ADA, perilaku sama (skip kalau ticker sudah punya cache entry apa pun, fresh atau stale — matematis ekuivalen dengan kondisi lama, dibuktikan lewat truth table di komentar kode), cuma sekarang menulis ke Redis jadi hasilnya kebagi ke instance lain juga.
  6. `warmRadarFundamentalsRotating(timeBudgetMs)` baru (`lib/idx-data-engine.js`) — proses universe penuh (urutan alfabetis stabil) mulai dari cursor tersimpan di Redis, skip ticker yang cache-nya masih fresh, berhenti begitu time budget (default 25 detik, sisa margin dari `maxDuration:30`) habis, simpan cursor baru (wrap-around di akhir list) untuk lanjutan run berikutnya.
  7. `server.js` — route baru `GET /api/cron/warm-radar-fundamentals`, wajib header `Authorization: Bearer <CRON_SECRET>` cocok — fail-closed (403) kalau `CRON_SECRET` tidak diset atau tidak cocok, TIDAK PERNAH jalan tanpa autentikasi (mencegah abuse: siapa pun yang tahu URL publik bisa memicu ratusan panggilan Yahoo tanpa proteksi ini).
  8. `vercel.json` — tambah `crons: [{path: "/api/cron/warm-radar-fundamentals", schedule: "0 22 * * *"}]` (05:00 WIB, sebelum bursa buka 09:00 WIB).
- **Test regresi (`test_suite.js`):** 5 test baru (total 179, naik dari 174) — cache Redis-backed (bukan Map), accessor async + bulk-read, rotating cursor + time-budget guard + wrap-around, auth guard cron endpoint (403 fail-closed), `vercel.json` cron schedule 1x/hari. Dikonfirmasi FAIL tanpa fix (`git stash` ke-4 file implementasi, kelima test baru gagal), PASS dengan fix (`git stash pop`).
- **Verifikasi:** `node -c` semua file sukses, `vercel.json` valid JSON. `npm test` 179/179 lulus. `npm run lint` bersih. Endpoint cron dites langsung: tanpa/salah `CRON_SECRET` → 403 konsisten. `warmRadarFundamentalsRotating()` dites langsung via Node (bukan lewat Playwright) dengan budget 5 detik — selesai memproses seluruh 958 ticker dalam <1 detik (kegagalan koneksi ke Yahoo di sandbox ini gagal cepat, bukan hang), cursor wrap-around ke 0 terbukti benar, tidak ada crash. Playwright live: `GET /api/idx/opportunity-radar` tetap merespons normal setelah refactor async (`success:true`, 958 total), nol `pageerror`.
- **Batasan yang tidak bisa diuji di sandbox ini:** jalur data REAL dari Yahoo Finance (`query1/2.finance.yahoo.com` diblokir egress sandbox ini, sama seperti sebelumnya) dan trigger cron ASLI dari Vercel (butuh deploy + env var production) — keduanya cuma bisa diverifikasi user setelah deploy.
- **Langkah deployment yang WAJIB dilakukan user setelah merge (di luar kendali saya):**
  1. Set env var `CRON_SECRET` (string rahasia bebas) di Vercel project settings — tanpa ini endpoint cron akan SELALU menolak (403) dan cron job tidak pernah benar-benar memanaskan cache.
  2. Pastikan `UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN` sudah diset (kemungkinan besar sudah ada dari fitur Invezgo sebelumnya) — kalau belum, fundamentals cache akan fallback ke in-memory per-instance (fungsional tapi kehilangan manfaat utama fitur ini: sharing cache lintas instance/cold-start).
  3. Setelah deploy, cek log Vercel Cron Jobs (`Settings → Cron Jobs`) untuk konfirmasi run pertama berhasil dan `processed`/`skipped` masuk akal (bukan 0 terus-menerus, yang berarti auth gagal atau universe kosong).
- **Update setelah deploy (verifikasi user, sore hari yang sama):** `CRON_SECRET` dan `UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN` di-set user di Vercel, endpoint dipanggil manual 4x berturut-turut via `Invoke-WebRequest` (PowerShell) untuk mempercepat cakupan penuh alih-alih menunggu 1x/hari — semua 200 OK, `cursorAfter` berjalan konsisten (264→520→776→122[wrap]→442), total langkah kursor 1136 (>958) mengonfirmasi seluruh universe sudah tersentuh minimal sekali dalam satu sesi, dan `skipped` naik progresif (5→13→124→268) mengonfirmasi cache Redis benar-benar persisten antar-invocation (bukan fallback in-memory). Fitur dikonfirmasi bekerja end-to-end di production, bukan cuma lolos test lokal.

## 2026-09-18 — `.env.example` dibersihkan dari config Firebase/Gemini mati + tambah var yang benar-benar dipakai

- **Konteks:** user minta analisa optimasi lanjutan / baca ulang incident log untuk cari perbaikan lain. Ditemukan `.env.example` sudah 3x disebut usang di entri-entri sebelumnya (14 Sep, migrasi Gemini→Claude 12 Sep) tapi tidak pernah benar-benar diperbaiki — sengaja ditunda karena permintaan sebelumnya spesifik ke hal lain.
- **Temuan konkret (diverifikasi via grep ke kode, bukan asumsi):**
  1. `ANTHROPIC_API_KEY` (dibaca `server.js:788`, WAJIB untuk semua fitur AI) **tidak ada** di file spec env var ini sama sekali.
  2. `CRON_SECRET` (dibaca `server.js`, WAJIB untuk endpoint cron Opportunity Radar yang baru selesai di atas) juga **tidak ada**.
  3. `GEMINI_API_KEY` dan `GEMINI_RPD_LIMITS` (dengan referensi ke `lib/gemini-quota.js` dan endpoint `/api/ai/gemini-status`) — dikonfirmasi **tidak ada satupun file/endpoint itu lagi di kode** (`ls lib/gemini-quota.js` gagal, `grep gemini server.js` cuma menyisakan komentar historis migrasi 12 Sep). Semua mati.
  4. 7 baris `FIREBASE_*` **dengan nilai project REAL** (`zinc-snowfall-6lcf1`, API key, database ID, dst) — dikonfirmasi mati total lewat komentar eksplisit di `public/js/00-config.js`: *"Firebase itu sendiri sudah dihapus sepenuhnya... tidak ada lagi yang bicara ke Firebase"*. Nilai project lama tertinggal di file contoh tanpa fungsi apa pun.
- **Perbaikan:** `GEMINI_API_KEY=` diganti `ANTHROPIC_API_KEY=` (dengan komentar baru yang benar), tambah `CRON_SECRET=` (dengan komentar cara generate & kegunaannya), hapus blok `GEMINI_RPD_LIMITS` dan seluruh 7 baris `FIREBASE_*` yang sudah mati.
- **Verifikasi:** ini murni file dokumentasi (bukan dibaca kode manapun saat runtime), jadi `node -c server.js`, `npm test` (179/179 tetap lulus), dan `npm run lint` (bersih) dijalankan sebagai pemastian tidak ada regresi tidak sengaja — bukan karena perubahan ini secara langsung memengaruhi jalur eksekusi.

## 2026-09-18 — Foreign Flow Bandarmology: bukan LQ45, tapi tetap melanggar prinsip "seluruh emiten" + bug "+Rp 0 M" identik

- **Konteks:** user melaporkan (screenshot) kolom "TOP 5 FOREIGN NET BUY"/"TOP 5 FOREIGN NET SELL" di halaman Bandarmology menampilkan ticker & nilai yang **identik persis** di kedua kolom ("+Rp 0 M" untuk semua baris, "Porsi Asing: 50%" untuk semua baris), dan bertanya apakah ini dibatasi ke LQ45. User menegaskan ulang aturan keras: **jangan pernah batasi analisis ke LQ45, harus seluruh emiten** — ditulis ke `CLAUDE.md` baru sebagai aturan permanen supaya tidak terulang di sesi mana pun ke depan.
- **Root cause (2 masalah terpisah, sama-sama nyata):**
  1. **Cakupan bukan LQ45 secara harfiah, tapi tetap sampel kecil**: `renderBandarmologyForeignFlowView()` (`public/js/41-stockchat-cockpit.js`) iterasi array hardcoded ~42 ticker populer, bukan seluruh ~958 emiten BEI — melanggar prinsip yang sama meski bukan LQ45 literal.
  2. **Bug nilai identik**: `generateBrokerSummary()`'s jalur data REAL (`computeBandarmologyVerdict()`) selalu mengembalikan `foreignFlow: {available:false, netValRp:null, ...}` untuk data Invezgo real (endpoint `/analysis/summary/stock` dengan `investor=all` TIDAK punya flag foreign/domestic per broker — batasan yang sudah didokumentasikan sebelumnya, bukan baru). `bandarForeignNetRp()` membaca `ff.netValRp !== undefined` — TRUE meski nilainya `null` — jadi `netVal = null`, lalu `Math.round(null/1e9) = 0` untuk SETIAP ticker. Sorting array yang semua nilainya sama (`null - null = 0`, stabil) menghasilkan urutan awal yang identik untuk Top Buy maupun Top Sell. `sharesPct: (ff.participationPct || 50)` jatuh ke default hardcoded 50% karena `participationPct` juga `null`.
- **Perbaikan:** ditemukan Invezgo sudah punya endpoint whole-market yang tepat untuk kasus ini — `GET /analysis/top/foreign` (dipanggil via `fetchInvezgoTopMovers('foreign', date)` di `lib/invezgo-client.js`, SUDAH ADA sejak fix top-movers 17 Sep tapi tidak pernah benar-benar dipakai/dipanggil di manapun — kode mati). Ditambahkan:
  1. `getUniverseForeignFlow()` baru (`lib/idx-data-engine.js`) — memanggil endpoint itu, 1 panggilan API untuk seluruh BEI, return `{netBuy[], netSell[]}` terurut oleh nilai net Rupiah asing REAL (`calculated_value` dari respons `foreign`, bukan skor ranking seperti di endpoint `accumulation`).
  2. `GET /api/idx/foreign-flow` baru (`server.js`).
  3. `renderBandarmologyForeignFlowView()` diganti total — sekarang cuma render placeholder loading, lalu `bandarLoadRealForeignFlow()` (baru) fetch endpoint di atas secara async dan render ulang container-nya dengan data REAL seluruh pasar — pola yang sama dipakai `loadAndRenderBrokerFlowTab()` yang sudah ada di file yang sama.
- **Batasan yang TIDAK diperbaiki di perbaikan ini (di luar cakupan laporan user, dicatat jujur):** 3 view market-aggregate lain di file yang sama (Accumulation, Distribution, Broker Trail) MASIH iterasi sampel ~42 ticker hardcoded yang sama — bukan bug identik (metrik yang mereka pakai beda, tidak semuanya jatuh ke 0/50% seperti Foreign Flow), tapi tetap melanggar prinsip "seluruh emiten" di `CLAUDE.md`. Perlu perbaikan serupa terpisah kalau user memprioritaskannya — `getUniverseAccumulationDistribution()` (sudah ada, dipakai Smart Money Screener) kemungkinan bisa dipakai ulang untuk Accumulation/Distribution view ini juga.
- **Perbaikan tambahan (pertanyaan user "volume spike ini volume apa jual atau beli"):** Volume Spike Scanner (`public/js/45-volume-spike.js`) menghitung volume TOTAL transaksi (gabungan beli+jual dari data OHLCV standar), bukan volume satu arah — ini sudah benar secara desain (indikator volume spike memang selalu directionless), tapi labelnya tidak menjelaskan itu. Ditambah satu baris klarifikasi di headline: "(Volume total transaksi — gabungan sisi beli & jual, bukan volume satu arah. Untuk tahu dominan buyer atau seller, cek tab Bandarmology.)"
- **`CLAUDE.md` baru dibuat** — aturan permanen "jangan pernah batasi analisis ke LQ45/IDX30/sampel kecil", dengan insiden Screener LQ45 (sebelumnya) dan Foreign Flow (kasus ini) dicatat sebagai contoh pelanggaran yang sudah terjadi.
- **Test regresi (`test_suite.js`):** 1 test baru (total 180, naik dari 179) — memverifikasi `getUniverseForeignFlow()` memanggil `fetchInvezgoTopMovers('foreign', ...)` (bukan iterasi ticker), endpoint `/api/idx/foreign-flow` ter-wire, dan `renderBandarmologyForeignFlowView()` tidak lagi berisi array `sampleTickers` hardcoded. 1 test LAMA (dari sesi 17 Sep) disesuaikan — assertion yang mengharuskan `renderBandarmologyForeignFlowView()` membaca `bandarGetCachedSummary()` dihapus KHUSUS untuk fungsi ini (bukan dihapus untuk 4 view lain yang memang belum diubah) karena arsitekturnya sengaja diganti total, bukan regresi. Dikonfirmasi FAIL tanpa fix (`git stash` ke-3 file implementasi, test baru gagal), PASS dengan fix (`git stash pop`).
- **Verifikasi:** `node -c` semua file sukses. `npm test` 180/180 lulus. `npm run lint` bersih. Playwright live (server lokal, Invezgo tidak dikonfigurasi di sandbox): endpoint `/api/idx/foreign-flow` merespons `isSimulated:true` dengan pesan jujur "belum dikonfigurasi", halaman Bandarmology → Analisis Full Emiten → BBCA merender container Foreign Flow dengan pesan itu (bukan crash/kosong), nol `pageerror`.
- **Batasan yang tidak bisa diuji di sandbox ini:** jalur data REAL Invezgo (`api.invezgo.com` diblokir egress sandbox ini) — user perlu verifikasi setelah deploy: buka Bandarmology → Analisis Full Emiten, cek kolom "TOP 5 FOREIGN NET BUY/SELL" menampilkan ticker & nilai Rupiah yang BERBEDA antara Buy dan Sell (bukan identik lagi), dan banner hijau menyebutkan jumlah emiten seluruh BEI (bukan 42).
- Cache-bust: `41-stockchat-cockpit.js?v=20260918a`, `45-volume-spike.js?v=20260918a`.

## 2026-09-18 — Tombstone lintas-device untuk penghapusan Rekening Bank/Hutang/Piutang

- **Konteks:** keterbatasan yang sudah dicatat sebelumnya (lihat entri Bug Data Loss 17 Sep) — `_mergeWealthData()` union-by-id sengaja tidak pernah menghormati penghapusan (menghindari kehilangan data tak sengaja), tapi konsekuensinya: item bank/hutang/piutang yang dihapus di satu device bisa "muncul lagi" setelah sinkron dari device lain yang belum menerima penghapusan itu. User eksplisit minta ini diperbaiki. Karena ini menyentuh jalur sinkronisasi data KEUANGAN REAL (bukan data pasar read-only seperti perbaikan lain sesi ini), keputusan cakupan & retensi dikonfirmasi dulu ke user via `AskUserQuestion` sebelum implementasi (risiko desain salah = kebalikan dari masalah asli: item yang seharusnya tetap ada malah terhapus di semua device).
- **Keputusan (dikonfirmasi user, opsi Recommended keduanya):**
  1. Cakupan tombstone: **bank/debt/piutang saja** — bukan transactions/dividends/dll (jumlahnya jauh lebih banyak, risiko lebih besar kalau desain tombstone salah).
  2. Retensi tombstone: **90 hari**, cukup untuk device yang jarang online tapi tidak menumpuk selamanya.
- **Perbaikan:**
  1. `WEALTH.tombstones` (array `{type,id,deletedAt}`) ditambah ke skema default `WEALTH` (`public/js/20-wealth.js`) — otomatis ikut tersimpan/tersinkron karena `wSave()`/`wLoad()` sudah men-serialize seluruh objek `WEALTH`.
  2. `wRecordTombstone(type, id)` baru (`20-wealth.js`) — push tombstone sebelum item dihapus.
  3. `wDelete(type, id)` (jalur hapus generik dari halaman Wealth) dan `deleteBankAccount(idx)`/`deleteDebt(idx)` (jalur hapus terpisah di halaman Settings, index-based splice — ditemukan saat audit sebagai DUA jalur hapus berbeda yang memanipulasi `WEALTH.bank`/`WEALTH.debt` yang sama) — keduanya sekarang memanggil `wRecordTombstone()` sebelum menghapus.
  4. `_mergeTombstones(cloudArr, localArr)` baru (`public/js/02-storage.js`) — union tombstone by `type+id` (ambil `deletedAt` terbaru kalau ada duplikat), buang yang sudah lewat 90 hari.
  5. `_mergeWealthData()` — `mergeById()` sekarang menerima parameter `type` opsional, menyaring item yang id-nya ada di tombstone (per-type, non-expired) hasil merge SEBELUM union — item baru yang belum sempat sinkron (bukan yang dihapus) tetap aman karena hanya id yang ADA di tombstone yang disaring, bukan whitelist.
- **Test regresi (`test_suite.js`):** 1 test baru (total 181, naik dari 180) — 4 skenario dieksekusi langsung terhadap `_mergeWealthData()`/`_mergeTombstones()` via `vm` sandbox: (1) item ditombstone di satu sisi tidak muncul lagi di hasil merge, (2) item baru yang belum ditombstone tetap dipertahankan (union-by-id lama tidak rusak), (3) tombstone kedaluwarsa (>90 hari) tidak lagi menyaring item, (4) tombstone di-scope per-type (tombstone `bank` id=5 tidak ikut menyaring `debt` id=5). Plus verifikasi source bahwa `wDelete()`/`deleteBankAccount()`/`deleteDebt()` benar-benar memanggil `wRecordTombstone()`. Dikonfirmasi FAIL tanpa fix (`git stash` ke-3 file implementasi, test gagal dengan pesan "_mergeTombstones() is gone"), PASS dengan fix.
- **Verifikasi:** `node -c` ketiga file browser (parse-check saja, bukan browser environment). `npm test` 181/181 lulus. `npm run lint` bersih.
- **Batasan yang tidak diperbaiki (di luar cakupan yang disetujui user):** transactions/dividends/rdnMutations/cryptoTx/etfTx/rdTx TETAP union-by-id tanpa tombstone — penghapusan item-item ini masih belum ter-propagasi lintas device (perilaku lama, tidak berubah, sesuai keputusan cakupan yang dipilih user).
- Cache-bust: `02-storage.js?v=20260918a`, `20-wealth.js?v=20260918a`, `35-settings.js?v=20260918a`.

## 2026-09-18 — Kalender Aksi Korporasi: hapus 2 dataset fiktif "Data Riil Terverifikasi" palsu, ganti Invezgo real

- **Konteks:** user melaporkan widget Bandarmology lain masih simulasi ("Matriks Rata-Rata Harga Beli Broker Historis 1 Tahun"), lalu meminta audit MENYELURUH atas semua "kata simulasi" di codebase sebelum perbaikan dilanjutkan. Audit dilakukan via subagent Explore (240+ kemunculan kata simulasi di 31 file public/js + 60 di lib), menghasilkan 2 temuan HIGH yang genuinely deceptive (bukan fallback jujur berlabel), plus konfirmasi bahwa fallback lain (fsGenData, qtGenSim, dst) sudah benar & jujur.
- **Temuan #1 (paling parah):** `getIdxCalendarData()` (`lib/providers/idx-client.js`) — SELURUH kalender aksi korporasi (dividen, stock split, rights issue, RUPS, suspensi) adalah array JS 100% hardcoded fiksi (tanggal & DPS karangan, beberapa persis tanggal "hari ini" saat file ditulis). Komentar di kodenya sendiri KELIRU mengklaim "Hanya data dividen resmi yang terverifikasi (Historis KSEI/BEI) — tanpa data dummy" — klaim itu salah, dan data ini TIDAK PERNAH diberi label `isSimulated`, jadi tidak ada satu pun bagian UI yang tahu ini palsu.
- **Temuan #2:** `IDX_DIVIDEND_MASTER_REGISTRY` (`public/js/42-dividend-calendar.js`) — dataset fiktif KEDUA yang independen, dengan klaim sama ("Data Riil KSEI/BEI... terverifikasi"), di-*merge* dengan hasil `/api/idx/calendar` di halaman Kalender Dividen — mencemari bahkan jalur yang seharusnya real.
- **Root cause vs perbaikan:**
  1. Ditemukan Invezgo punya endpoint real untuk ini — `GET /analysis/calendar` (dikonfirmasi dari file OpenAPI spec resmi vendor yang di-upload user, bukan tebakan) — param `type` enum resmi: `IPO/PUBLIC_EXPOSE/REVERSE/RIGHT/RUPS_RESULT/RUPS_SCHEDULE/SPLIT/WARRANT/BONUS/CONVERTION/DIVIDEND`. Ditambah `fetchInvezgoCalendar(type, code)` baru (`lib/invezgo-client.js`).
  2. **Batasan penting:** skema `payload` per-item BEDA-BEDA tergantung `type`, dan dokumentasi resmi Invezgo cuma kasih 1 contoh (untuk tipe WARRANT — bukan salah satu dari 4 tipe yang dipakai app ini: DIVIDEND/SPLIT/RIGHT/RUPS_SCHEDULE). Sesuai aturan keras "jangan pernah menebak skema API" (baru ditulis eksplisit ke `CLAUDE.md` sesi ini), field di dalam `payload` (DPS, tanggal cum/ex/payment, rasio split, harga exercise, dst) TIDAK dipetakan ke nama field tebakan — diteruskan mentah apa adanya.
  3. `getIdxCalendarData()` ditulis ulang total jadi `async`, memanggil `fetchInvezgoCalendar()` untuk 4 tipe real sekaligus, fallback jujur `isSimulated:true` kalau Invezgo tidak dikonfigurasi/gagal. Kategori "suspensi/UMA" SELALU kosong sekarang (jujur) karena Invezgo tidak punya tipe aksi korporasi untuk itu di endpoint ini.
  4. 2 consumer di `lib/idx-data-engine.js` (`getUniverseOpportunityRadar()`'s tag "Aksi Korporasi", `getTransactionFlowVisualizer()`'s daftar aksi korporasi per-ticker) dan `server.js`'s route `/api/idx/calendar` diubah jadi `await` (fungsi sudah async), dan label yang ditampilkan diganti generik ("Ada jadwal Dividen") alih-alih mengarang detail ("Dividen Rp 345").
  5. `public/js/26-commandcenter.js` (tabel Kalender Aksi Korporasi di Opportunity Radar) dan `public/js/40-idx-pipeline.js` (modal IDX Data Hub) — tabel diubah jadi render generik: `code` + nama emiten (dicari dari `DB` internal app sendiri, BUKAN dari Invezgo — aman karena bukan data eksternal yang ditebak) + dump key-value `payload` apa adanya, bukan kolom DPS/Cum Date/Ratio/dst yang mengasumsikan field tertentu ada.
  6. **`public/js/42-dividend-calendar.js` (1111 baris)** — halaman "Kalender Dividen & Passive Income" (grid kalender per-tanggal, timeline, grafik musiman 12 bulan, proyeksi passive income) TIDAK BISA diperbaiki dengan pendekatan generik yang sama karena seluruh fitur itu butuh field terstruktur (tanggal cum/ex/payment untuk penempatan di kalender, DPS+shares untuk proyeksi Rupiah) yang justru itulah yang belum terverifikasi. **Dikonfirmasi ke user via AskUserQuestion** sebelum eksekusi (beda kelas risiko — menonaktifkan seluruh halaman, bukan sekadar ganti sumber data): user pilih **nonaktifkan jujur sekarang** (bukan menunggu contoh respons real). `IDX_DIVIDEND_MASTER_REGISTRY` dihapus total; `renderDividendCalendarComponent()` sekarang cuma menampilkan `renderDivCalDisabledNotice()` — pesan jujur bahwa fitur ditunda sampai skema payload Invezgo terverifikasi, plus daftar generik ticker yang tercatat punya jadwal dividen (tanpa detail tebakan). Kode kalender/timeline/musiman lama (170+ baris) dihapus (dead code, bukan cuma tidak dipanggil).
- **Test regresi (`test_suite.js`):** 1 test baru (total 182, naik dari 181) — memverifikasi `fetchInvezgoCalendar()` ada & memanggil endpoint real, `getIdxCalendarData()` async & memanggilnya, KEDUA dataset fiktif (array hardcoded lama di `idx-client.js` DAN `IDX_DIVIDEND_MASTER_REGISTRY` di `42-dividend-calendar.js`) benar-benar hilang (bukan cuma di-comment), dan `renderDivCalDisabledNotice()` ada. Dikonfirmasi FAIL tanpa fix (`git stash` ke-5 file implementasi: pesan "fetchInvezgoCalendar() is gone"), PASS dengan fix.
- **Verifikasi:** `node -c` semua file sukses. `npm test` 182/182 lulus. `npm run lint` bersih. Playwright live (server lokal, Invezgo tidak dikonfigurasi di sandbox): `GET /api/idx/calendar` merespons `isSimulated:true` jujur; halaman Kalender Dividen (setelah guest-login) menampilkan pesan nonaktif jujur, bukan crash/kosong; halaman Opportunity Radar → tab Kalender Aksi Korporasi merender tabel generik dengan banner jujur "Invezgo API key belum dikonfigurasi"; nol `pageerror` di semua kasus.
- **Batasan yang tidak bisa diuji di sandbox ini:** jalur data REAL Invezgo (`api.invezgo.com` diblokir egress sandbox ini) — DAN bahkan dengan API key asli, skema `payload` untuk tipe DIVIDEND/SPLIT/RIGHT/RUPS_SCHEDULE tetap belum terverifikasi (beda dari fitur lain sesi ini yang skemanya sudah dikonfirmasi dari respons real/OpenAPI spec). User perlu kirim 1 contoh respons real per tipe (via CLI lokal) supaya Kalender Dividen bisa dibangun ulang dengan tampilan lengkap (bukan generik) dan diaktifkan kembali.
- **`CLAUDE.md` diperluas** (implisit dari kasus ini, konsisten dengan aturan #1 yang sudah ada): kalau field di dalam payload API eksternal tidak terverifikasi per-tipe/per-kasus, tidak cukup verifikasi di level top-level schema saja — setiap sub-struktur yang beda-beda perlu contoh real sendiri sebelum dipetakan ke field spesifik.
- Cache-bust: `26-commandcenter.js?v=20260918b`, `40-idx-pipeline.js?v=20260918a`, `42-dividend-calendar.js?v=20260918a`.

## 2026-09-18 — Matriks Broker 1 Tahun & 2 kembarannya: hapus fabrikasi broker/weight, ganti Invezgo real 1Y

- **Konteks:** ini widget spesifik yang di-screenshot user di awal ("Matriks Rata-Rata Harga Beli Broker Historis 1 Tahun", badge "SIMULASI (Bukan Database Riil)") yang memicu audit menyeluruh sesi ini. Setelah audit + perbaikan Kalender Aksi Korporasi selesai, user eksplisit minta lanjut perbaiki widget ini plus tegaskan aturan permanen: label "simulasi" tidak membenarkan mengarang angka kalau API real sudah terbukti bisa memberi data itu.
- **3 titik fabrikasi ditemukan (identik pola-nya, 1 di backend + 2 di frontend):**
  1. `renderBandarmology1YearBrokerCostMatrix()` (`public/js/41-stockchat-cockpit.js`) — widget yang di-screenshot. Array `majorBrokers` hardcoded 10 broker dengan `weight`/`bias` persentase karangan, dipakai hitung volume/nilai/harga rata-rata 1M/3M/6M/1Y yang terlihat presisi. 2 dari 4 kartu metrik ringkasan ("Modal Rata-Rata Smart Whales", "Status Siklus Bandarmology") ikut dihitung dari angka karangan itu meski terlihat seperti metrik turunan yang sah.
  2. `generateBrokerSummaryTemplate()` (`lib/idx-data-engine.js`) — fallback backend `generateBrokerSummary()` kalau Invezgo gagal/tidak dikonfigurasi. Hardcoded `buyerBrokers`/`sellerBrokers` per kategori market-cap + `topBuyerWeights`/`topSellerWeights` array, kombinasi isUp/isBigBank/isCommodity untuk "memilih" broker yang "masuk akal" — tetap 100% karangan.
  3. `generateClientSideBrokerSummary()` (`public/js/41-stockchat-cockpit.js`) — kembaran client-side, pola identik (`topBuyerCodes`/`buyerWeights`, seeded pseudo-random dari nama ticker).
  Ketiganya SUDAH diberi label `isSimulated:true`/badge "SIMULASI" — tapi itu tidak mencegah pengguna melihat nama broker asli (UBS, JP Morgan, dst) dengan angka Rupiah presisi dan salah mengira itu data agregat yang wajar.
- **Perbaikan:** karena `fetchInvezgoBrokerSummary(ticker, fromDate, toDate)` (real, sudah dipakai halaman yang sama untuk timeframe lain) TERBUKTI bisa memberi data per-broker REAL untuk rentang custom termasuk 1 tahun (`buy_avg`/`buy_volume`/`buy_value` per broker, dikonfirmasi skema dari respons real sebelumnya di sesi ini), ketiga fallback diganti:
  1. `generateBrokerSummaryTemplate()` — dikosongkan jujur: `topBuyers:[]`, `topSellers:[]`, verdict `'DATA TIDAK TERSEDIA'`, `foreignFlow`/`domesticFlow` eksplisit `available:false`. Tidak ada lagi array broker/weight.
  2. `generateClientSideBrokerSummary()` — sama, dikosongkan jujur dengan bentuk field yang identik (field naming client-side sedikit beda dari backend, dipertahankan supaya konsumen lama tidak rusak).
  3. `renderBandarmology1YearBrokerCostMatrix()` diubah total jadi placeholder sinkron (VWAP 1 tahun & rentang 52 minggu tetap dihitung real dari `rdGetAny()`, tidak berubah), lalu `bandarLoad1YearBrokerMatrix()` (baru, async) fetch `fetchBrokerSummaryData(tk, '1Y')` (endpoint real yang sudah ada) dan render tabel dari `topBuyers` REAL (broker, volume, nilai, harga rata-rata beli) — kalau kosong/gagal, tabel bilang jujur "Tidak Tersedia", bukan mengarang.
- **`CLAUDE.md` diperluas** — aturan baru eksplisit (#3): label "SIMULASI" tidak menghapuskan kewajiban jujur; fallback tidak boleh mengarang angka spesifik kalau API real yang relevan sudah terbukti bisa memberi data itu untuk kasus lain; hanya boleh untuk kasus yang benar-benar tidak ada sumber data real sama sekali (dicontohkan `fsGenData()` yang legitimate).
- **Test regresi (`test_suite.js`):** 1 test baru (total 183, naik dari 182) — memverifikasi ketiga fungsi tidak lagi punya array/weight hardcoded (`topBuyerWeights`, `buyerBrokers`, `buyerWeights`, `topBuyerCodes`, `majorBrokers` — masing-masing dicek sebagai assignment `=`, bukan sekadar disebut di komentar, supaya tidak salah tangkap komentar yang menjelaskan riwayat perbaikan ini), dan `bandarLoad1YearBrokerMatrix()`+`fetchBrokerSummaryData(tk,'1Y')` ada & terpanggil. Dikonfirmasi FAIL tanpa fix (`git stash`), PASS dengan fix.
- **Verifikasi:** `npm test` 183/183 lulus, `npm run lint` bersih. Playwright live (BBCA, Invezgo tidak dikonfigurasi di sandbox): VWAP 1 tahun & rentang 52 minggu tetap tampil (real, dari histori harga), tabel broker & metrik "Harga Beli Top Buyer" jujur bilang "Tidak Tersedia" dengan alasan eksplisit, bukan angka karangan. Nol `pageerror`.
- **Batasan yang tidak bisa diuji di sandbox ini:** jalur data REAL Invezgo untuk timeframe 1Y (`api.invezgo.com` diblokir egress sandbox ini) — user perlu verifikasi setelah deploy: buka Bandarmology → Analisis Full Emiten, cek "Matriks Harga Beli Broker 1 Tahun" menampilkan badge "REAL (Invezgo, 1 Tahun)" dengan daftar broker & harga rata-rata beli yang REAL (bukan "TIDAK TERSEDIA" — kalau masih begitu setelah `INVEZGO_API_KEY` dikonfigurasi, kemungkinan `fetchInvezgoBrokerSummary()` dengan `timeframe=1Y` butuh penyesuaian rentang tanggal, perlu diselidiki dengan respons real).
- Cache-bust: `41-stockchat-cockpit.js?v=20260918b`.

## 2026-09-18 — 3 view Bandarmology tersisa (Accumulation/Distribution/Broker Trail): whole-market real + disclosure jujur untuk yang tidak bisa

- **Konteks:** kelanjutan langsung dari perbaikan Foreign Flow — 3 view market-aggregate lain yang ditemukan saat audit menyeluruh masih iterasi sampel ~42 ticker hardcoded yang sama (melanggar CLAUDE.md aturan #2), user minta lanjut diperbaiki.
- **Accumulation & Distribution View:** diganti total — `getUniverseAccumulationDistribution()` (`lib/idx-data-engine.js`, SUDAH ADA & dipakai Smart Money Screener sejak sebelumnya) memanggil `GET /analysis/top/accumulation` Invezgo, 1 panggilan API untuk SELURUH ~958 emiten BEI aktif. Diwire lewat endpoint yang sudah ada, `GET /api/idx/accumulation-distribution`. **Trade-off jujur yang di-disclose ke user di UI:** endpoint whole-market ini tidak punya breakdown top-broker per-emiten (itu cuma tersedia dari panggilan per-ticker terpisah) — kolom "Top Broker Akumulator/Seller" & "Avg Buy/Sell Bandar" dihapus, diganti Sektor + Volume + Perubahan Harga (semua real).
- **Bug ditemukan & diperbaiki saat implementasi:** kedua view awalnya di-render bersamaan di halaman yang sama dengan `id="bandar-accdist-content"` yang SAMA PERSIS — `document.getElementById()` cuma akan menemukan yang pertama, membuat update salah satu view diam-diam gagal untuk yang kedua. Diperbaiki jadi `bandar-acc-content`/`bandar-dist-content` terpisah sebelum sempat ter-deploy.
- **Broker Trail View — TIDAK bisa dijadikan whole-market:** ditemukan Invezgo TIDAK punya endpoint whole-market untuk "jejak transaksi 1 kode broker lintas SEMUA emiten" — hanya per-ticker (`/analysis/summary/stock/{code}`) atau whole-market TANPA breakdown per-broker (`/analysis/top/accumulation|foreign`). Scan penuh 958 ticker per klik untuk fitur ini akan makan kuota API signifikan — pola yang sudah ditolak sebelumnya di sesi ini untuk alasan yang sama (lihat entri "Optimasi kuota Invezgo" 17 Sep). Sesuai CLAUDE.md aturan #2 ("kalau memang tidak ada cara mencakup semua sekaligus, JUJUR labeli keterbatasannya"), ditambahkan disclosure eksplisit di UI yang menjelaskan KENAPA cakupan terbatas (bukan cuma bilang "sampel" tanpa alasan) — bukan pilihan sepihak untuk membatasi, tapi keterbatasan arsitektural nyata dari sisi vendor.
- **Bug lain ditemukan saat verifikasi (di luar cakupan awal, diperbaiki karena langsung menghalangi verifikasi):** rate limiter generik `createRateLimiter()` (`server.js`) selalu menampilkan pesan error 429 "Terlalu banyak **permintaan AI**" apa pun endpoint yang kena limit — termasuk `dataApiRateLimiter` untuk `/api/idx/*`/`/api/ksei/*` yang sama sekali bukan endpoint AI. Ditemukan langsung saat testing endpoint accumulation-distribution kena limit 60/menit dan pesannya menyesatkan. Diperbaiki dengan parameter `label` per instance limiter (`'permintaan AI'` vs `'permintaan data'`).
- **Bug defensif lain:** `bandarRenderAccDistTable()` awalnya crash (`Cannot read properties of undefined (reading 'totalUniverseScanned')`) kalau endpoint mengembalikan respons error (`success:false`, mis. kena rate limit) karena kode langsung asumsi bentuk respons sukses. Diperbaiki jadi defensif terhadap `success:false`/`counts` hilang, bukan cuma `isSimulated`.
- **Test regresi (`test_suite.js`):** 1 test baru (total 184, naik dari 183) — memverifikasi Accumulation/Distribution tidak lagi punya `sampleTickers` hardcoded, `bandarLoadAccDist()`+endpoint real ter-wire, id container Accumulation/Distribution BEDA (regresi khusus untuk bug id-duplikat di atas), dan Broker Trail punya teks disclosure "Cakupan terbatas". Test LAMA (17 Sep) yang mengharuskan Accumulation/Distribution baca `bandarGetCachedSummary()` disesuaikan — dikeluarkan dari daftar itu (arsitekturnya sengaja diganti), Broker Trail tetap dicek (arsitekturnya tidak berubah). Dikonfirmasi FAIL tanpa fix, PASS dengan fix.
- **Verifikasi:** `npm test` 184/184 lulus, `npm run lint` bersih. Playwright live (server lokal, Invezgo tidak dikonfigurasi di sandbox): kedua view Accumulation/Distribution menampilkan pesan jujur "belum dikonfigurasi" (bukan crash), Broker Trail menampilkan disclosure cakupan terbatas. Nol `pageerror`.
- **Batasan yang tidak bisa diuji di sandbox ini:** jalur data REAL Invezgo (`api.invezgo.com` diblokir egress sandbox ini) — user perlu verifikasi setelah deploy: buka Bandarmology → Analisis Full Market, cek tabel Akumulasi/Distribusi menampilkan >>42 ticker (seharusnya ratusan, seluruh emiten aktif hari itu) dengan skor/sektor/harga real.
- Cache-bust: `41-stockchat-cockpit.js?v=20260918c`.

## 2026-09-18 — 4 temuan baru: Money Flow selalu simulasi, Volume Spike tanpa arah, Smart Money Screener tanpa pilihan tanggal, Harga Wajar (investigasi)

- **Konteks:** user melaporkan 4 masalah baru + menegaskan lagi widget Matriks Broker 1 Tahun masih "SIMULASI" — dikonfirmasi itu screenshot dari SEBELUM PR #225 di-merge (perbaikan sudah ada di PR, belum live di production sampai merge).
- **#1 — Card "Big 4 Banks Net Flow" (Portfolio Snapshot/Command Center) SELALU simulasi, walau data real tersedia:** `renderDashboardSmartFlowPreview()` (`public/js/04-render.js`) memanggil `generateClientSideBrokerSummary()` LANGSUNG — fallback client-side terakhir yang melewati backend real sepenuhnya. Akibatnya card ini SELALU tampil "SIMULASI" meski Invezgo terkonfigurasi & bekerja untuk BBCA/BBRI/BMRI/BBNI di tempat lain (mis. Bandarmology → Analisis Full Emiten). **Perbaikan:** diganti `fetchBrokerSummaryData()` (jalur real-data-first yang sama dipakai semua view Bandarmology lain), badge sekarang dinamis: REAL / SEBAGIAN REAL (n/4) / TIDAK TERSEDIA — bukan selalu "SIMULASI".
- **#2 — Volume Spike Scanner tidak menjelaskan arah akumulasi/distribusi:** user menegaskan volume total saja tidak cukup — perlu tahu apakah lonjakan itu condong akumulasi atau distribusi. **Perbaikan:** ditambah heuristik dari `chg1d` (perubahan harga REAL hari itu, data OHLCV asli, bukan tebakan) — volume naik + harga naik → "Indikasi AKUMULASI", volume naik + harga turun → "Indikasi DISTRIBUSI". Secara eksplisit dilabeli "indikasi" dari pola harga+volume, BUKAN klaim mengetahui identitas buyer/seller (itu tetap butuh Bandarmology). Ditambahkan di headline detail DAN kolom baru di tabel screening.
- **#3 — Smart Money Screener (Akumulasi/Distribusi Seluruh BEI) tidak bisa pilih tanggal:** data EOD Invezgo baru terbit ~17:30 WIB — cek pagi/siang selalu kosong tanpa cara melihat hari sebelumnya yang sudah terbit. **Perbaikan:** `getUniverseAccumulationDistribution()` (`lib/idx-data-engine.js`) sekarang menerima `params.date` (diteruskan ke `fetchInvezgoTopMovers()` yang SUDAH mendukung parameter `date` sejak awal, cuma belum pernah dipakai dari sini). UI (`public/js/07-flowscan.js`) ditambah `<input type="date">` + handler `fsSetBrokerScanDate()`.
- **#4 — Harga Wajar (Fair Value/MoS calculator) tidak auto-fill dari Invezgo padahal API punya data finansial:** **investigasi dilakukan, BELUM diimplementasikan.** Dikonfirmasi Invezgo PUNYA endpoint real `GET /analysis/financial-statement/{code}` (Balance Sheet/Income Statement/Cash Flow, terbatas 2 tahun terakhir untuk paket non-Enterprise) — TAPI struktur baris (`rows[].name`) adalah label Bahasa Indonesia hierarkis yang belum diverifikasi persis mana yang berarti "EPS", "Total Ekuitas", "Jumlah Saham Beredar", dst (contoh respons di dokumentasi cuma menunjukkan 2 baris cash-flow yang tidak relevan). Sesuai aturan keras "jangan pernah menebak skema API", auto-fill BELUM dibangun — butuh 1 contoh respons real (`statement=BS`/`IS`) untuk memverifikasi nama baris yang tepat sebelum bisa dipetakan dengan aman.
- **Test regresi (`test_suite.js`):** 3 test baru (total 186, naik dari 184 — satu test lama terkait Money Flow Simulasi disesuaikan arsitekturnya, bukan dihapus, karena badge sekarang dinamis bukan selalu SIMULASI). Semua dikonfirmasi FAIL tanpa fix (`git stash` 4 file implementasi), PASS dengan fix.
- **Verifikasi:** `npm test` 186/186 lulus, `npm run lint` bersih. Playwright live: card Money Flow menampilkan "TIDAK TERSEDIA" (bukan selalu "SIMULASI") saat Invezgo tidak dikonfigurasi di sandbox; date picker Smart Money Screener terkonfirmasi ada; kolom "Indikasi" Volume Spike terkonfirmasi ada di HTML. Nol `pageerror`.
- **Yang masih perlu Anda lakukan:** untuk Harga Wajar auto-fill, kirim 1 contoh respons real dari `GET /analysis/financial-statement/BBCA?statement=BS&type=FY&limit=4` (dan `statement=IS` untuk EPS/Net Income) via CLI lokal seperti sebelumnya — dengan itu saya bisa verifikasi nama baris yang tepat dan bangun auto-fill yang aman (bukan tebakan).
- Cache-bust: `04-render.js?v=20260918a`, `07-flowscan.js?v=20260918a`, `45-volume-spike.js?v=20260918b`.

## 2026-09-18 — Harga Wajar (MoS) auto-fill: laporan keuangan REAL Invezgo untuk ticker di luar 27 kurasi manual

- **Konteks:** kelanjutan langsung dari temuan #4 sesi sebelumnya (Harga Wajar tidak auto-fill). User mengirim 2 contoh respons REAL dari `GET /analysis/financial-statement/BBCA` (statement=BS dan IS, via CLI lokal) untuk memverifikasi skema `rows[].name` sebelum dipetakan — sesuai aturan keras "jangan pernah menebak skema API eksternal".
- **Skema terverifikasi dari 2 file JSON real BBCA:** `{rows:[{id,name,level,values:[{col,year,amount,period}],parent_id,is_abstract,display_order}], columns:[{year,label,period}]}`. Baris dicocokkan by-name (bukan by-index/by-id, supaya tahan urutan berubah): equity dari "Jumlah ekuitas yang diatribusikan kepada pemilik entitas induk" (basis entitas induk, konsisten dengan Net Income & EPS yang juga basis entitas induk — BUKAN "Jumlah ekuitas" total yang termasuk kepentingan non-pengendali), Net Income dari "Laba (rugi) yang dapat diatribusikan ke entitas induk", EPS dari "Laba (rugi) per saham dasar dari operasi yang dilanjutkan".
- **2 keterbatasan genuine di skema API, di-disclose jujur bukan ditutupi:**
  1. **Faktor skala EPS tidak didokumentasikan resmi** — nilai mentah API untuk BBCA FY2025 adalah `467000000`, dibagi 1.000.000 jadi `467` yang cocok dengan EPS riil BBCA (diverifikasi silang terhadap angka publik BBCA, bukan ditebak). Confidence: MEDIUM — faktor ini disimpulkan dari kewajaran angka, bukan dari dokumentasi Invezgo.
  2. **Tidak ada field "jumlah saham beredar" sama sekali** di BS maupun IS — di-derive sebagai Net Income ÷ EPS (untuk BBCA FY2025: 57.537.287.000.000 ÷ 467 ≈ 123.207 juta lembar, cocok dengan jumlah saham beredar BBCA riil ~123,2 miliar lembar).
  3. **Tidak ada field DPS (Dividend per Share)** di endpoint laporan keuangan ini sama sekali — selalu `null`, user tetap harus isi manual.
- **Implementasi:**
  1. `fetchInvezgoFinancialStatement(code, statement, type, limit)` baru (`lib/invezgo-client.js`) — fetcher real `GET /analysis/financial-statement/{code}`, pola cache-first+quota-gated identik semua fetcher Invezgo lain di file ini.
  2. `generateFinancialStatementSummary(ticker)` baru (`lib/idx-data-engine.js`) — panggil BS+IS (FY, limit 4) paralel, cari baris by-name, derive shares, kembalikan `{ticker, available, dataSource, rows:[{year,eps,equity,shares,dps:null,per:'',netIncome}], disclosures:{epsScaleAssumption, sharesDerived, dpsUnavailable}}` — honestly `available:false` kalau Invezgo gagal/tidak dikonfigurasi.
  3. Route baru `GET /api/idx/financial-statement/:ticker` (`server.js`), sudah otomatis kena `dataApiRateLimiter` (mount `/api/idx` global).
  4. `public/js/10-hargawajar.js` — `hw_autoFill()` sekarang: kalau ticker TIDAK ada di `STOCK_FINANCIAL_DATABASE` (27 ticker kurasi manual), fetch endpoint baru; kalau data tersedia, isi `hwData.rows` dari data real dan tampilkan banner disclosure (`hw_renderAutoFillDisclosure()`) yang menjelaskan asumsi skala EPS & metodologi derived-shares secara eksplisit ke user — bukan ditampilkan seolah data primer biasa. Banner disembunyikan lagi saat ganti ke ticker lain/reset.
- **Test regresi (`test_suite.js`):** 1 test baru (total 187, naik dari 186) — memverifikasi `fetchInvezgoFinancialStatement()` ada & ter-export, `generateFinancialStatementSummary()` memanggil BS+IS real, derive shares dari Net Income÷EPS, DPS tetap `null`, disclosure fields ada, route server ter-daftar, dan frontend (`hw_fetchRealFinancialStatement`, `hw_renderAutoFillDisclosure`) ter-wire. Dikonfirmasi FAIL tanpa fix (`git stash` 5 file implementasi — pesan "fetchInvezgoFinancialStatement() is gone"), PASS dengan fix (187/187).
- **Verifikasi:** `node -c` semua file sukses, `npm test` 187/187 lulus, `npm run lint` bersih. Playwright live (server lokal, Invezgo tidak dikonfigurasi di sandbox): ticker di luar database kurasi (PTBA) memicu fetch ke endpoint baru, honestly fallback ke tabel kosong + toast amber saat Invezgo tidak tersedia (bukan crash); ticker kurasi (GGRM) tetap pakai data manualnya sendiri tanpa banner disclosure. Disimulasikan respons Invezgo REAL via `page.route()` mock — banner disclosure tampil dengan benar berisi pesan asumsi EPS-scale & derived-shares, baris tabel terisi sesuai data mock. Nol `pageerror` di semua skenario.
- **Batasan yang tidak bisa diuji di sandbox ini:** jalur data REAL Invezgo (`api.invezgo.com` diblokir egress sandbox ini) — user perlu verifikasi setelah deploy dengan `INVEZGO_API_KEY` production: buka Harga Wajar, masukkan ticker DI LUAR 27 kurasi manual (mis. PTBA/INDF), klik Auto-Fill, cek tabel terisi angka wajar (EPS/Equity/Net Income masuk akal untuk perusahaan tersebut) DAN banner disclosure biru muncul menjelaskan asumsi skala EPS + derived-shares. Kalau EPS hasil `÷1.000.000` terlihat TIDAK wajar untuk emiten tertentu (terlalu besar/kecil dibanding EPS riil publik), berarti faktor skala ini TIDAK universal untuk semua ticker — perlu dilaporkan supaya dilihat ulang (kemungkinan skala berbeda per jenis industri/laporan, mengingat hanya diverifikasi dari 1 sampel: BBCA, sektor perbankan).
- Cache-bust: `10-hargawajar.js?v=20260918a`.

## 2026-09-18 — Stock Dossier "Kepemilikan Kustodian KSEI": tersambung ke fallback live Invezgo, bukan cuma dataset statis

- **Konteks:** user menegaskan lagi kekhawatiran soal "banyak fitur yang ternyata simulasi/tidak terhubung API" dan menunjuk contoh konkret: pillar "Kepemilikan Kustodian KSEI" di halaman **Stock Dossier** (`public/js/46-stock-dossier.js`, BUKAN halaman KSEI Shareholders `34-ksei-shareholders.js` yang sudah diperbaiki task sebelumnya) masih menampilkan badge "DATA TIDAK TERSEDIA" untuk ticker-ticker besar, padahal endpoint Invezgo live sudah ada di codebase.
- **Root cause dikonfirmasi lewat investigasi (bukan tebakan):** Stock Dossier's `dossierHarvestData()` HANYA memanggil `GET /api/ksei/stock/:ticker` — endpoint ini membaca `data/ksei-shareholders.json`, SATU snapshot statis dari Google Sheets (840 dari ~958 emiten, per tanggal 26 Aug 2026, di-upload manual, TIDAK terhubung ke Invezgo sama sekali). Dicek langsung: `BBCA`, `BBRI`, `GGRM` semuanya `found:false` di dataset ini — ticker-ticker besar dengan pemegang saham >5% yang jelas ada di dunia nyata, tapi tidak tercatat di snapshot Google Sheets ini (kemungkinan keterbatasan proses scraping/export sheet, bukan sesuatu yang bisa diperbaiki dari sisi kode app). Sementara itu, endpoint LIVE `GET /api/idx/shareholder-composition/:ticker` (dibangun sesi sebelumnya untuk halaman KSEI Shareholders, memanggil `fetchInvezgoShareholderKsei()` dkk real) sudah ADA dan BEKERJA untuk ticker-ticker yang sama — Stock Dossier tidak pernah diwire ke situ.
- **Perbaikan (BUKAN sekadar ganti sumber data — kedua endpoint punya makna metrik yang beda, tidak boleh dicampur begitu saja):**
  1. `dossierHarvestData()` sekarang JUGA memanggil `/api/idx/shareholder-composition/:ticker` secara paralel, disimpan di `harvested.kseiLive`.
  2. `dossierComputeKseiScore()`: kalau dataset statis >5% holder TIDAK punya entri untuk ticker ini (persis kondisi `found:false` yang tadinya langsung berujung "DATA TIDAK TERSEDIA"), sekarang coba fallback ke komposisi kategori investor LIVE Invezgo (`kseiLatest.foreign`/`local` per 9 kategori, dalam lembar saham riil — BUKAN persentase yang ditebak).
  3. **Kejujuran metrik dijaga ketat:** kategori "Individu" (id) dipakai sebagai proksi non-institusional untuk menghitung `institutionalPct`/`foreignPct` — TAPI ini secara eksplisit BUKAN Free Float resmi (pemegang saham pengendali/keluarga pendiri bisa saja tercatat sebagai individu di KSEI). `freeFloat` di jalur fallback ini SENGAJA tetap `null`, dengan `reason` yang secara eksplisit menyebut "memakai komposisi kepemilikan LIVE Invezgo... " — bukan diam-diam disamakan dengan Free Float resmi dari jalur dataset statis.
  4. Kalau KEDUA sumber (statis maupun live Invezgo) sama-sama tidak punya data, pillar tetap jujur `DATA_UNAVAILABLE` seperti sebelumnya — tidak ada perubahan perilaku untuk kasus yang benar-benar tidak ada datanya.
- **Test regresi (`test_suite.js`):** 1 test baru (total 188, naik dari 187) — memverifikasi fallback live-Invezgo mengaktifkan pillar (available:true, status REAL) dengan freeFloat tetap null & reason yang jujur, kasus tanpa data sama sekali tetap DATA_UNAVAILABLE, DAN jalur named-holder lama (dataset statis) tidak berubah perilakunya. Dikonfirmasi FAIL tanpa fix (`git stash` file implementasi: pesan "KSEI pillar must be available when live Invezgo composition exists"), PASS dengan fix (188/188, plus 18+6+5 dari suite lain — total 217 tetap lulus semua).
- **Verifikasi:** `node -c` sukses, `npm test` 188/188 (+29 dari 3 suite lain) lulus, `npm run lint` bersih. Playwright live (BBCA, server lokal tanpa `INVEZGO_API_KEY`): pillar KSEI honestly `DATA_UNAVAILABLE` (kedua sumber genuinely tidak dikonfigurasi di sandbox — bukan bug, itu perilaku yang benar), nol `pageerror`. Disimulasikan respons Invezgo REAL via `page.route()` mock — pillar menghasilkan `institutionalPct:70, foreignPct:5, freeFloat:null` yang matematisnya benar dari data mock (total 100 juta lembar, individu asing+lokal 30 juta = institusi 70%).
- **Batasan yang tidak bisa diuji di sandbox ini:** jalur data REAL Invezgo (`api.invezgo.com` diblokir egress sandbox) — user perlu verifikasi setelah deploy dengan `INVEZGO_API_KEY` production: buka Stock Dossier, masukkan BBCA/BBRI/GGRM (ticker yang tidak ada di `data/ksei-shareholders.json`), cek pillar "Kepemilikan Kustodian KSEI" sekarang menampilkan skor REAL dari komposisi live Invezgo (bukan lagi "DATA TIDAK TERSEDIA"), dengan disclosure yang jelas bahwa ini bukan Free Float resmi.
- **Catatan untuk audit lanjutan (di luar cakupan perbaikan ini, TIDAK diperiksa sekarang):** user menyatakan curiga masih ada fitur/widget lain yang serupa (terhubung ke sumber data lama/statis padahal ada endpoint Invezgo live yang lebih baru) — pola root-cause di sini (2 sistem KSEI paralel yang tidak saling tahu) kemungkinan bisa terulang di modul lain yang dibangun di sesi-sesi berbeda. Perlu audit terpisah kalau user ingin dilanjutkan.
- Cache-bust: `46-stock-dossier.js?v=20260918a`.

## 2026-09-18 — Audit proaktif "sumber data tak terhubung": 3 sumber fundamental (EPS/ROE/BVPS) tidak sinkron, live Invezgo dijadikan sumber utama

- **Konteks:** setelah perbaikan Stock Dossier KSEI, user meminta audit MENYELURUH proaktif (bukan menunggu screenshot satu-satu): "cari pola serupa — fitur yang punya endpoint live Invezgo tapi konsumennya masih pakai sumber lama/statis". Audit dijalankan via subagent Explore (very thorough) menyisir seluruh 43 file `public/js/*.js` + `lib/*.js` terhadap 6 kategori data live-Invezgo (broker summary, shareholder/KSEI, sektor rotasi, akumulasi/distribusi, foreign flow, kalender aksi korporasi).
- **Hasil audit:** 5 dari 6 kategori SUDAH benar terhubung ke endpoint live yang sesuai (broker-summary, foreign-flow, accumulation-distribution, calendar, sector-rotation — semua consumer diverifikasi memanggil endpoint yang tepat, tidak ada duplikasi/hardcode tersisa). **1 temuan baru**, diverifikasi manual (bukan cuma percaya laporan subagent):
- **Temuan:** halaman "Fundamental" (`public/js/24-stockmaster.js`, tabel `PROFILES` hardcoded ~60 ticker) dan halaman "Harga Wajar" (`public/js/10-hargawajar.js`, `STOCK_FINANCIAL_DATABASE` hardcoded) masing-masing punya snapshot EPS/ROE/BVPS/DPS MANUAL SENDIRI untuk ticker yang SAMA, tidak pernah saling cek atau dicek terhadap `generateFinancialStatementSummary()` (live Invezgo, dibangun sesi sebelumnya untuk Harga Wajar tapi cuma dipakai untuk ticker DI LUAR kurasi manual). Dicek langsung untuk BBCA: `STOCK_FINANCIAL_DATABASE.BBCA` tahun 2023 → EPS **395**, ROE turunan **≈19,9%**; `PROFILES.BBCA` → EPS **420**, ROE **23,5%**. Dua halaman berbeda bisa menampilkan angka dasar berbeda untuk emiten yang sama tanpa disclosure apa pun ke user.
- **Keputusan user (AskUserQuestion):** live Invezgo jadi sumber utama di KEDUA halaman; dataset hardcoded (PROFILES/STOCK_FINANCIAL_DATABASE) tetap ada sebagai fallback (bukan dihapus) untuk saat Invezgo gagal/tidak dikonfigurasi.
- **Perbaikan:**
  1. `public/js/24-stockmaster.js`: `fundLoadFallbackData()` diubah jadi `async`, sekarang fetch `/api/idx/financial-statement/:ticker` sebelum memfinalisasi eps/bvps/roe/shares — kalau Invezgo mengembalikan data real (baris tahun terakhir), override PROFILES/default dengan: `eps` langsung, `bvps = equity*1000/shares`, `roe = netIncome/equity`, `shares = shares*1e6`; kalau gagal, PROFILES tetap dipakai seperti sebelumnya (perilaku tidak berubah). Ditandai `dataQuality.source='invezgo_real'` dengan banner hijau jujur (beda dari banner amber "snapshot manual") menjelaskan field mana yang real (EPS/BVPS/ROE) dan mana yang masih estimasi (revenue/margin/DER — endpoint ini belum mencakup baris itu). Revenue/margin/DER/current-ratio SENGAJA tidak diubah (Invezgo financial-statement yang sudah diverifikasi cuma cakup BS equity + IS eps/netIncome).
  2. `public/js/10-hargawajar.js`: `hw_autoFill()` — dulu HANYA fetch Invezgo untuk ticker DI LUAR `STOCK_FINANCIAL_DATABASE`; sekarang SELALU fetch Invezgo dulu untuk SEMUA ticker (termasuk yang sudah kurasi manual, mis. BBCA/GGRM/BBNI), curated database jadi fallback kalau Invezgo tidak tersedia untuk ticker itu.
- **Test regresi (`test_suite.js`):** 2 test baru (total 190, naik dari 188) — memverifikasi `fundLoadFallbackData()` async + fetch Invezgo + tag `invezgo_real` + PROFILES tetap ada sebagai fallback; dan `hw_autoFill()` tidak lagi ber-gate pada `!STOCK_FINANCIAL_DATABASE[tk]`. 1 test LAMA (dari sesi sebelumnya) yang secara eksplisit mengecek gate `if (!STOCK_FINANCIAL_DATABASE[tk])` disesuaikan — arsitekturnya sengaja diganti, gate itu memang harus hilang. Semua dikonfirmasi FAIL tanpa fix (`git stash`), PASS dengan fix (190/190 + 18+6+5 dari suite lain = 219 total).
- **Verifikasi:** `node -c` sukses, `npm test` semua lulus, `npm run lint` bersih. Playwright live: tanpa `INVEZGO_API_KEY` (sandbox), kedua halaman jatuh ke fallback lama dengan benar (PROFILES/STOCK_FINANCIAL_DATABASE, tidak berubah perilaku). Disimulasikan respons Invezgo REAL via `page.route()` mock (4 tahun data, realistis — bukan 1 baris, karena override butuh minimal 2 tahun valid untuk lolos guard `hw_recalc()` yang sudah ada) — BBCA (ticker YANG SUDAH ADA di kedua dataset kurasi manual) terbukti pakai angka Invezgo (EPS 999 sesuai mock), BUKAN lagi 395 (Harga Wajar) atau 420 (Fundamental) yang lama, dengan banner disclosure tampil di kedua halaman. Nol `pageerror`.
- **Catatan investigasi (bukan bug, dicatat supaya tidak salah tafsir kalau dicek lagi nanti):** saat testing awal dengan mock 1 baris data, `hwData.rows` tampak "kembali" ke curated database setelah override — ternyata BUKAN bug baru, itu guard LAMA di `hw_recalc()` (baris ~1862, `if (rows.length < 2)`) yang memang butuh minimal 2 tahun data valid untuk kalkulasi dan sengaja fallback ke curated DB kalau data yang di-set kurang — perilaku benar untuk kasus edge itu, cuma test mock-nya yang tidak realistis (Invezgo asli mengembalikan hingga 4 tahun).
- **Batasan yang tidak bisa diuji di sandbox ini:** jalur data REAL Invezgo (`api.invezgo.com` diblokir egress) — user perlu verifikasi setelah deploy: buka halaman Fundamental DAN Harga Wajar untuk ticker yang sama (mis. BBCA), pastikan EPS/ROE yang ditampilkan SAMA di kedua halaman (bukan lagi 395 vs 420), dan badge/banner menunjukkan sumber "Invezgo Real" bukan "Snapshot".
- **Temuan minor terpisah (dicatat, TIDAK diperbaiki — di luar cakupan permintaan, bukan soal koneksi Invezgo):** `public/js/27-stockintel.js` baris 183, `FUND_DATA[tk]` selalu `undefined` karena `FUND_DATA` adalah objek tunggal `{ticker, fin, stats, ...}`, bukan objek yang di-keying per-ticker — cabang fallback itu dead code (fallback efektif tetap jalan lewat `cached.fund`). Bug logika lokal murni, tidak berkaitan dengan pola audit ini.
- Cache-bust: `10-hargawajar.js?v=20260918b`, `24-stockmaster.js?v=20260918a`.

## 2026-09-18 — Audit proaktif "toolbar lainnya": 7 temuan HIGH fabrikasi data diperbaiki (dari 22 file yang belum diaudit)

- **Konteks:** kelanjutan permintaan audit proaktif user. Setelah audit "sumber data tak terhubung" (Invezgo) selesai, user minta audit lebih luas ke SELURUH menu navigasi utama app (~53 halaman). 2 subagent Explore dikirim paralel menyisir 22 file `public/js/*.js` yang belum pernah diperiksa sesi ini (batch trading/AI: 11 file; batch keuangan pribadi/admin: 11 file). Total 11 temuan terkonfirmasi (setiap temuan diverifikasi manual langsung di kode oleh saya, bukan sekadar dipercaya dari laporan subagent). User memilih perbaiki 7 temuan **HIGH** dulu sebelum lanjut ke 4 temuan MEDIUM/RENDAH.
- **Temuan #1 — Decision Journal, `decisionQualityScore` selalu 90/100** (`public/js/28-decisiontools.js`): setiap entri jurnal trading baru diberi skor "Decision Score" konstan 90, apa pun isi rasional/review/emosinya — tidak ada data outcome/hasil trade nyata untuk menghitung skor kualitas keputusan yang jujur. **Perbaikan:** field & kolom tabel dihapus sepenuhnya (bukan diganti formula karangan lain, karena app tidak melacak hasil trade setelah entri dibuat).
- **Temuan #2 — Morning Brief, IHSG fallback diberi label "Real-time Feed" tanpa syarat** (`public/js/28-decisiontools.js`): kalau `ihsgCur`/`ihsgBase` belum ter-fetch, dipakai angka fallback 6845,00/6800,00 TAPI label di sebelahnya tetap tertulis "Real-time Feed" — kontradiksi langsung. **Perbaikan lebih dalam dari dugaan awal:** pengecekan `ihsgCur > 0` saja TERNYATA tidak cukup — `ihsgCur` diinisialisasi ke placeholder hardcoded 6500,83 saat module load (`01-data.js`), yang JUGA `> 0`, jadi cek itu akan selalu true. Ditambahkan flag baru `window._ihsgLiveFetched` yang HANYA di-set `true` di dalam `fhApplyIHSG()` (`03-engine.js`) — satu-satunya tempat harga IHSG real benar-benar diterapkan — dan Morning Brief sekarang memakai flag ini, bukan sekadar `> 0`.
- **Temuan #3 — Log Audit RDN, jam transaksi presisi dikarang** (`public/js/25-auditlog.js`): `fmtAuditTime()` menghasilkan "09:17:39 WIB" dari formula `index % 6`, `(index*7) % 45`, dst — bukan waktu asli (app memang tidak pernah mencatat jam, hanya tanggal). Ditampilkan di "Slip Audit Transaksi RDN — AUD-xxxx" seolah waktu resmi. **Perbaikan:** fungsi disederhanakan jadi hanya kembalikan tanggal; UI kolom "Waktu" sekarang jujur menampilkan "Jam tidak tercatat" alih-alih jam palsu.
- **Temuan #4 — Tombol "Salin Ringkasan" audit klaim "Saldo Terverifikasi 100%" tanpa pengecekan** (`public/js/25-auditlog.js`): `copyAuditSummary()` menulis klaim integritas hardcoded, padahal fungsi lain di file yang sama (`renderRdnAudit`) sudah punya pengecekan real (`Math.abs(totalCredit - totalDebit - currentBalance) < 1`). **Perbaikan:** `copyAuditSummary()` sekarang memakai pengecekan yang sama sebelum mengklaim status integritas, dan menulis "SELISIH TERDETEKSI" secara eksplisit kalau ledger tidak cocok.
- **Temuan #5 — Kolom "Tren 7D" di Portofolio (mode Pro) adalah kurva formula tetap** (`public/js/29-institutional-ui.js`): `mwCreateSparkline(null, isGain, ...)` dipanggil dengan `values` SELALU `null` — setiap saham untung dapat bentuk kurva identik, setiap saham rugi dapat bentuk identik, nol data historis harga di baliknya walau labelnya eksplisit "Tren 7D". **Perbaikan:** `mwCreateSparkline()` tidak lagi menyintesis kurva palsu saat data kosong (kembalikan placeholder "—" jujur); ditambahkan `mwLoadRealSparkline()` yang fetch histori harga REAL 7 hari (`GET /api/idx/history/:ticker?tf=1W`, endpoint yang sudah ada) per baris secara async (placeholder → isi asli, pola yang sama dipakai fitur lain sesi ini), dengan cache 5 menit per ticker.
- **Temuan #6 — AI Chart Intelligence, fallback "Smart Money Net Inflow" Rp 15 miliar tanpa disclosure** (`public/js/43-ai-chart-intelligence.js`): kalau broker summary tidak punya `institutionalNetRp`, dipakai konstanta tetap Rp 15.000.000.000, ditampilkan di modal "AI Chart Explanation" seolah hasil analisis nyata. **Perbaikan:** field jadi `null` saat tidak tersedia + flag `institutionalNetAvailable`; modal sekarang menulis "Net Inflow institusi tidak tersedia" secara eksplisit alih-alih angka Rupiah karangan.
- **Temuan #7 — Crypto "Whale Tier Orderflow Breakdown" adalah persentase tetap tanpa disclosure** (`public/js/36-crypto-technical.js`): pembagian volume 24 jam ke 4 tier (MEGA WHALE/LARGE WHALE/SHARK/RETAIL) memakai persentase tetap 38/27/20/15% — bukan data ukuran order riil (tidak ada API order-book whale yang terintegrasi untuk crypto). **Perbaikan:** sesuai CLAUDE.md aturan #3 (fallback tanpa sumber real sama sekali BOLEH ada asal jelas berlabel), ditambahkan disclosure eksplisit di kartu UI menjelaskan ini estimasi proporsional, bukan data order-size nyata — fitur tidak dihapus karena benar-benar tidak ada API pengganti yang tersedia untuk breakdown ini.
- **Test regresi (`test_suite.js`):** 7 test baru (total 197, naik dari 190) — satu per temuan, memverifikasi pola fabrikasi benar-benar hilang dan mekanisme jujur pengganti (flag/disclosure/fetch real) ada. Sempat terjadi 2 false-fail saat verifikasi awal karena komentar penjelasan saya sendiri (menyebut string literal lama seperti "Saldo Terverifikasi 100%") ikut ter-match regex test — diperbaiki dengan menulis ulang komentar tanpa mengulang string persis. Ditemukan juga bahwa perbaikan awal untuk Temuan #2 (`ihsgCur > 0`) tidak benar-benar menutup celahnya (placeholder module-load `ihsgCur=6500.83` juga `>0`) — baru terungkap saat verifikasi Playwright live, diperbaiki dengan flag `window._ihsgLiveFetched` yang lebih presisi. Semua 7 dikonfirmasi FAIL tanpa fix (`git stash` per file), PASS dengan fix (197/197, total 226 lulus semua suite).
- **Verifikasi:** `node -c` semua file sukses, `npm test` semua suite lulus, `npm run lint` bersih. Playwright live: kolom "Decision Score" hilang dari tabel Jurnal (6 kolom, bukan 7), halaman Log Audit menampilkan "Jam tidak tercatat" & tidak crash, `mwCreateSparkline(null,...)` terkonfirmasi mengembalikan placeholder jujur (bukan SVG kurva palsu) dan `mwCreateSparkline([...data real...])` tetap menghasilkan SVG valid. Nol `pageerror` di semua kasus yang bisa diuji.
- **Batasan yang tidak bisa diuji di sandbox ini:** halaman Portofolio penuh (termasuk kolom "Tren 7D" end-to-end) tidak bisa dirender di Playwright sandbox ini karena Chart.js dimuat dari CDN (`cdnjs.cloudflare.com`) yang diblokir kebijakan jaringan sandbox — ini keterbatasan lingkungan pre-existing, bukan regresi dari perbaikan ini (dikonfirmasi: fungsi inti `mwCreateSparkline`/logic fetch sudah diverifikasi terpisah tanpa perlu me-render halaman penuh). User perlu verifikasi setelah deploy: buka Portofolio → mode tampilan Pro, cek kolom "Tren 7D" menampilkan kurva berbeda-beda sesuai histori harga real per saham (bukan lagi bentuk identik untuk semua saham untung/rugi).
- **Sisa pekerjaan (4 temuan MEDIUM/RENDAH, BELUM dikerjakan — nunggu keputusan user lanjut):** #8 AI Setup Confidence dengan ~27 poin komponen konstan (`43-ai-chart-intelligence.js`), #9 "HEALTH & VALUASI" Morning Brief cuma 5 nilai tetap tanpa perhitungan valuasi (`28-decisiontools.js`), #10 fallback IHSG/USD di laporan PDF resmi tanpa disclosure (`32-pdf-reports.js`), #11 label pivot S/R menyesatkan + conviction 2-nilai tetap (`27-stockintel.js`).
- Cache-bust: `03-engine.js?v=20260918b`, `25-auditlog.js?v=20260918a`, `28-decisiontools.js?v=20260918b`, `29-institutional-ui.js?v=20260918a`, `36-crypto-technical.js?v=20260918a`, `43-ai-chart-intelligence.js?v=20260918a`.

## 2026-09-18 — 4 temuan MEDIUM/RENDAH sisa audit diperbaiki + full re-verifikasi seluruh perbaikan sesi ini

- **Konteks:** kelanjutan langsung dari 7 temuan HIGH yang sudah diperbaiki. User minta lanjutkan ke 4 temuan tersisa (#8-#11) DAN re-cek ulang semua perbaikan sesi ini sebagai verifikasi akhir.
- **Temuan #8 — AI Setup Confidence, 4 komponen skor konstan tanpa syarat** (`public/js/43-ai-chart-intelligence.js`, `calculateAiConfluenceScore()`): Volume Surge selalu `+8`, Fibonacci Overlap selalu `+8`, "Multi-TF Alignment" selalu `+4` (padahal fungsi cuma terima SATU timeframe — namanya sendiri menyesatkan), Risk/Reward selalu `+5` (poin maksimum tanpa syarat) — total ~27 dari 100 poin tidak pernah benar-benar dihitung dari data apa pun. **Perbaikan:** ke-4 komponen dihitung real: Volume Surge dari rasio volume bar terakhir vs rata-rata 20 bar (`ctx.ohlcv`), Fibonacci Overlap dari jarak harga ke level fib 0.382/0.5/0.618/0.786 (dalam 1.5%), "Multi-TF Alignment" diganti nama jadi "Trend Consistency MA20 vs MA50" (jujur soal cakupannya — masih 1 timeframe, cuma dua MA berbeda periode) dihitung dari `ctx.indicators.ma20/ma50` real, Risk/Reward dari jarak riil ke resistance/support historis (`Math.max`/`Math.min` closing price asli dalam window OHLCV, BUKAN level persentase-tetap `calculateAiBaseSupportResistance()`).
- **Temuan #9 — Morning Brief, kolom "HEALTH & VALUASI" tidak pernah menghitung valuasi apa pun** (`public/js/28-decisiontools.js`): label & subtitle menjanjikan "pemindaian kesehatan fundamental, valuasi" tapi `healthScore` 100% fungsi dari bobot posisi & P&L unrealized (data portofolio REAL, bukan karangan — masalahnya di label yang menjanjikan sesuatu yang tidak pernah dihitung, bukan di datanya). **Perbaikan:** direname jujur jadi kolom "SKOR RISIKO POSISI" / variabel `positionRiskScore`, subtitle diubah dari "kesehatan fundamental, valuasi" jadi "risiko konsentrasi posisi" — tidak mengubah logika skor (branch berbasis weight/unrealPct/chgPct tetap sama, karena itu legitimate scoring berbasis data real, cuma labelnya yang salah).
- **Temuan #10 — Laporan PDF resmi, 3 fallback angka spesifik tanpa disclosure** (`public/js/32-pdf-reports.js`, 3 fungsi: HTML report, CSV export, Markdown summary): (a) IHSG fallback "7.150,00" & kurs USD fallback "Rp 16.200" tanpa tanda itu bukan data hari itu; (b) ditemukan tambahan saat investigasi — `monthlyExp` fallback Rp 10.000.000/bulan (bukan cuma di 1 tempat, tapi di SEMUA 3 fungsi report) mengalir ke Target FIRE Number & % Kesiapan FIRE, dan lebih parah: kalau `monthlyExp`=fallback tapi tetap dipakai di kalkulasi target=0, kondisi `a.net >= 0` nyaris selalu true sehingga status "✓ Tercapai" muncul PALSU untuk SEMUA skenario FIRE (Lean/Regular/Fat/Barista) walau user belum pernah isi data pengeluaran sama sekali. **Perbaikan:** IHSG/USD honestly "Data Tidak Tersedia" saat live belum ter-fetch; `monthlyExpAvailable` flag dilacak di ketiga fungsi, FIRE metrics tampil "Belum Diisi"/"Data Belum Diisi" alih-alih angka & status "Tercapai" yang salah.
- **Temuan #11 — Stock Intel, label pivot S/R menyesatkan + conviction 2-nilai tetap** (`public/js/27-stockintel.js`): `method: 'Calculated Real Pivot Support/Resistance'` padahal r1/s1 cuma persentase tetap ±4% dari harga (BUKAN formula pivot standar P=(H+L+C)/3 yang butuh data High/Low/Close harian — dikonfirmasi tidak tersedia di scope fungsi ini), dan `conviction` cuma 2 nilai (85 atau 60) dari satu ambang skor. **Perbaikan:** label diganti jujur "Estimasi ±4%/±10% dari Harga Saat Ini (bukan pivot point OHLC resmi)"; conviction diskalakan linear langsung dari `score` (yang sudah dihitung real dari PER/PBV/ROE/bandarmology) — proporsional, bukan pembulatan biner.
- **Temuan baru ditemukan saat investigasi #11 (DICATAT, TIDAK diperbaiki — di luar cakupan 4 item yang disetujui, perlu keputusan user terpisah):** `lib/providers/yahoo-client.js` (`fetchYahooQuote()`) punya fallback fundamental HARDCODED PER-TICKER (bvps/eps untuk BBCA=2450/450, BBRI=2100/390, BMRI=3200/620, BBNI=3800/510, TLKM=1850/245, ASII=4200/680, ditambah formula generik untuk ticker lain) yang mengalir ke `quote.fundamentals` — ini SUMBER KE-4 data fundamental yang independen dari 3 sumber yang sudah diperbaiki sesi ini (STOCK_FINANCIAL_DATABASE di 10-hargawajar.js, PROFILES di 24-stockmaster.js, live Invezgo). Berpotensi jadi penyebab angka EPS/BVPS yang berbeda lagi di tempat lain (mis. Stock Intel, yang baca `qf.eps`/`qf.pbv` dari sumber ini). **Perlu audit & keputusan user terpisah** sebelum diperbaiki — skalanya cukup besar (mempengaruhi endpoint quote yang dipakai puluhan tempat).
- **Test regresi (`test_suite.js`):** 4 test baru (total 201, naik dari 197) — satu per temuan. Terjadi lagi 1 false-fail di verifikasi awal karena komentar penjelasan saya sendiri mengutip string literal lama persis (`'Calculated Real Pivot Support/Resistance'`) — pelajaran yang sama berulang dari sesi ini, diperbaiki dengan menulis ulang komentar tanpa quote persis. Semua 4 dikonfirmasi FAIL tanpa fix (`git stash`), PASS dengan fix (201/201, total 230 lulus semua suite).
- **Verifikasi & re-verifikasi:** `node -c` semua file sukses, `npm test` (230 total) lulus semua, `npm run lint` bersih. Playwright live memanggil fungsi-fungsi inti LANGSUNG (bukan cuma cek teks halaman) untuk setiap dari 4 fix: `getStockIntelData('BBCA')` → conviction=66 (bukan 85/60 biner), levelsMethod jujur; `buildConsolidatedReportHtml()` → "Data Tidak Tersedia" muncul, fallback lama hilang; `calculateAiConfluenceScore()` (dipanggil manual dengan `buildAiSharedMarketContext`+`detectAiMarketStructure`+`calculateAiFibonacciSwings`+`detectAiChartPatterns` real) → jalan tanpa error, skor 48 "NO TRADE" (bukan crash). **Selain itu, sebagai verifikasi akhir sesi**, di-re-run `npm test` PENUH (230 test) yang mencakup SEMUA regression guard dari SETIAP perbaikan hari ini (Harga Wajar, Stock Dossier KSEI, sinkronisasi 3-sumber fundamental, 7 temuan HIGH, dan 4 temuan ini) — 230/230 lulus, mengkonfirmasi tidak ada satu pun perbaikan sebelumnya yang rusak oleh perbaikan berikutnya (termasuk `28-decisiontools.js` dan `43-ai-chart-intelligence.js` yang disentuh 2x hari ini). Playwright live re-verify halaman Journal & Daily Brief (file `28-decisiontools.js` yang disentuh 2x) mengkonfirmasi kedua fix sebelumnya (kolom Decision Score hilang, label IHSG jujur) TETAP utuh setelah edit kedua.
- **Batasan yang tidak bisa diuji di sandbox ini:** OHLCV/harga real Invezgo/Yahoo tidak bisa diakses (`api.invezgo.com`/Yahoo diblokir egress sandbox) — `isSimulated:true` pada context AI Chart di sandbox ini genuinely benar (bukan bug), sudah didisclosure oleh mekanisme existing (fix sesi 12 Sep). User perlu verifikasi setelah deploy dengan data real: AI Setup Confidence score bervariasi wajar antar ticker (bukan selalu sama), kolom SKOR RISIKO POSISI tampil di Morning Brief, laporan PDF menampilkan status FIRE yang benar (bukan "Tercapai" palsu) untuk user yang belum mengisi pengeluaran bulanan.
- Cache-bust: `27-stockintel.js?v=20260918a`, `28-decisiontools.js?v=20260918c`, `32-pdf-reports.js?v=20260918a`, `43-ai-chart-intelligence.js?v=20260918b`.

## 2026-09-18 — Stock Intel: TOP BROKER BUYER selalu kosong karena hardcoded 1D, tambah pilihan timeframe

- **Konteks:** user melaporkan widget "TOP BROKER BUYER (DATA RIIL)" di halaman Stock Intel selalu kosong dan bertanya "bagaimana intel kalo tidak bisa lihat history".
- **Root cause dikonfirmasi di kode:** `fetchRealStockIntelData()` (`public/js/27-stockintel.js`) hardcode `fetch('/api/idx/broker-summary/' + tk + '?timeframe=1D')` — tidak ada cara pilih rentang lain dari UI. Kalau data broker Invezgo untuk hari itu memang kosong (EOD baru terbit sore ~17:30 WIB, atau ticker tidak punya aktivitas broker besar hari itu), widget selamanya kosong tanpa jalan keluar. Backend (`generateBrokerSummary()`, `lib/idx-data-engine.js`) SUDAH mendukung 1W/1M/1Y sejak lama (dipakai halaman lain seperti Stock Dossier/StockChat Cockpit) — cuma Stock Intel yang belum diberi kontrolnya.
- **Perbaikan:** ditambah selector timeframe (1D/1W/1M/1Y, pola tombol yang sama dengan grafik harga di halaman yang sama) di kartu "TOP BROKER BUYER", `fetchRealStockIntelData(ticker, timeframe)` sekarang menerima parameter timeframe. Juga diperbaiki pesan status: dulu SELALU bilang "sedang disinkronisasi... klik Refresh" (menyesatkan — implikasinya refresh akan memperbaiki, padahal kalau datanya memang tidak ada untuk timeframe itu, refresh tidak akan mengubah apa-apa) — sekarang dibedakan jujur antara "belum pernah dicoba fetch" vs "sudah dicoba, memang tidak ada data untuk timeframe X — coba timeframe lain".
- **Test regresi (`test_suite.js`):** 1 test baru (total 202, naik dari 201) — memverifikasi endpoint tidak lagi hardcode `?timeframe=1D`, `setIntelBrokerTimeframe()` ada & ter-expose ke `window`, state `MW_INTEL_BROKER_TF`/`brokerSummaryFetched` ada, dan pesan honest baru ada. Dikonfirmasi FAIL tanpa fix (`git stash`), PASS dengan fix (202/202, total 231 lulus semua suite).
- **Verifikasi:** `node -c` sukses, `npm test` semua lulus, `npm run lint` bersih. Playwright live: ganti timeframe ke 1M dari tombol berhasil memicu fetch ulang (`brokerSummaryTf` ter-update), pesan honest baru muncul, nol `pageerror`.
- **Batasan yang tidak bisa diuji di sandbox ini:** `api.invezgo.com` diblokir egress sandbox — di sandbox ini semua timeframe tetap kosong (jujur, karena Invezgo tidak dikonfigurasi). User perlu verifikasi setelah deploy: buka Stock Intel untuk ticker dengan aktivitas broker rendah di hari berjalan, cek 1D kosong tapi 1W/1M menampilkan data broker riil.
- Cache-bust: `27-stockintel.js?v=20260918b`.

## 2026-09-18 — Master Screener Fase 1: backend engine (fetchInvezgoScreener) dibangun dengan 4 field yang sudah terverifikasi live

- **Konteks:** user mengirim audit hasil pengujian live API (`AUDIT_INVEZGO_UNUSED_ENDPOINTS_2026-09-18.md`, dibuat lewat Claude Code CLI lokal user yang punya akses internet nyata) dan 5 screenshot preset screener Stockbit, mengkritik Radar Score yang ada ("terlalu sederhana, tidak bisa deteksi saham yang sedang akumulasi") dan meminta Master Screener baru. Setelah diskusi ketersediaan data (data mana REAL/BUILDABLE/BELUM TERVERIFIKASI untuk tiap kolom di screenshot), user menyetujui: "perkuat dulu dengan data yang bisa, sisa nya dibiarkan dulu untuk di putuskan nanti, supaya aplikasi bisa dipakai dulu, untuk analisa" — bangun SEKARANG dengan field yang sudah terbukti live, tunda field yang butuh verifikasi lebih lanjut (Bandar Value, Piotroski F-Score, PE StdDev 5yr, Foreign Flow MA).
- **Field yang terverifikasi live oleh pengujian user** (`POST /screener/screen`, formula string bebas, 1 panggilan men-scan SELURUH ~958 emiten BEI, respons `[{code, matched:true, <field>: number}]` hanya baris yang match): `close`, `pbv`, `per`, `roe` — 4 field ini saja.
- **Dua bahaya dikonfirmasi dari pengujian live user, keduanya ditangani di `lib/invezgo-client.js`, bukan diserahkan ke caller:**
  1. Field name yang salah/salah kapitalisasi TIDAK error di sisi Invezgo — diam-diam jadi `0`, sehingga formula seperti `"PER > 0"` (huruf besar, salah) bisa lolos `matched:true` untuk SEMUA saham tanpa peringatan. `validateScreenerFormula()` memakai **allowlist ketat** (bukan normalize/lowercase — sengaja, supaya kesalahan kapitalisasi user tertangkap DI SINI, bukan diam-diam jadi 0 di server Invezgo), menolak SEBELUM `reserveQuota()` dipanggil (status `INVALID`, 0 kuota terpakai) kalau ada token di luar 4 field itu.
  2. Endpoint ini throttle lebih ketat dari kuota bulanan biasa — audit user menemukan 429 muncul bahkan dengan jeda 5-8 detik antar panggilan. `_screenerThrottleWait()` (Redis-backed, fallback in-memory) memberi jeda minimum tersendiri (`INVEZGO_SCREENER_MIN_INTERVAL_MS`, default 8000ms) sebelum request nyata dikirim, terpisah dari `MAX_CONCURRENCY`/`reserveQuota()` yang mengatur keseluruhan API Invezgo.
- **Yang dibangun (Fase 1, backend saja — belum ada UI):**
  1. `lib/invezgo-client.js`: `fetchInvezgoScreener(formula)`, `validateScreenerFormula(formula)`, `INVEZGO_SCREENER_ALLOWED_FIELDS` (export baru), mengikuti pola `getOrFetch`/cache/quota/retry yang sudah ada persis seperti fetcher Invezgo lain di file ini.
  2. `lib/idx-data-engine.js`: `generateMasterScreener(formula)` — memanggil `fetchInvezgoScreener()`, memperkaya tiap baris matched dengan `name`/`sector` dari `loadBaseUniverse()` (950+ emiten, sudah ada).
  3. `server.js`: route baru `POST /api/idx/master-screener` (`{formula: "per > 0 AND per < 15 AND roe > 15"}` di body) — mengembalikan `{success:false, data}` (bukan 500) untuk formula ditolak/data tidak tersedia, supaya frontend nanti bisa tampilkan alasan jujur, bukan generic error.
- **Test regresi (`test_suite.js`):** 2 test baru (total 204, naik dari 202) — satu memverifikasi `fetchInvezgoScreener`/`validateScreenerFormula`/allowlist/throttle/export ada, DAN menjalankan `validateScreenerFormula()` langsung (diekstrak & dieval terisolasi) untuk membuktikan formula dengan field allowlisted lolos sementara field salah kapitalisasi/tidak dikenal (`PER`, `bandarValue`) ditolak — persis skenario silent-zero yang ditemukan audit user; satu lagi memverifikasi `generateMasterScreener()` dan route server ada & terhubung. Dikonfirmasi FAIL tanpa fix (`git stash` 3 file implementasi: "fetchInvezgoScreener() is gone" / "generateMasterScreener() is gone"), PASS dengan fix (204/204, ditambah 18+6+5 dari suite lain = 233 total lulus).
- **Verifikasi:** `node -c` ketiga file sukses, `npm test` 233/233 lulus (seluruh suite, termasuk semua regression guard dari sesi-sesi sebelumnya — tidak ada yang rusak), `npm run lint` bersih.
- **Batasan yang tidak bisa diuji di sandbox ini:** `api.invezgo.com` diblokir egress sandbox — panggilan real ke `/screener/screen` tidak bisa diverifikasi end-to-end di sini. User perlu verifikasi setelah deploy dengan `INVEZGO_API_KEY` production: `POST /api/idx/master-screener` dengan formula `"per > 0 AND per < 15 AND roe > 15"` mengembalikan daftar saham real (bukan simulasi), dan formula dengan field salah (mis. `"PER > 0"` huruf besar) ditolak dengan `reason: UNKNOWN_FIELD` alih-alih diam-diam mengembalikan hasil salah.
- **Belum dikerjakan (di luar cakupan Fase 1 ini, menunggu keputusan user):** halaman/UI Master Screener (belum dibangun — user sudah setuju "Ganti total halaman Screener yang ada" untuk penempatannya, tapi belum diimplementasi); konsolidasi 4 halaman radar/screener (Opportunity Radar, Market Radar, Smart Money Screener, Screener lama) jadi SATU halaman filterable sesuai arahan user "kedepan screener kedepan hanya ada 1 tidak banyak lagi dan terpisah pisah" — perlu rencana konkret & konfirmasi user sebelum eksekusi karena blast radius navigasi lebih besar; field tambahan (Bandar Value, Piotroski F-Score, PE StdDev, Foreign Flow MA) tetap ditunda sesuai keputusan user "sisanya dibiarkan dulu untuk diputuskan nanti"; redesign Radar Score v2 (tanpa bonus LQ45, sinyal deteksi akumulasi) juga belum dikerjakan.
- Cache-bust: tidak ada (Fase 1 backend-only, belum ada file `public/js/*` yang berubah).

## 2026-09-18 — Unified Screener: gabungkan Opportunity Radar + Market Radar + Smart Money Screener jadi 1 halaman filterable, skor Whale/Akumulasi + Potensi Uptrend

- **Konteks:** setelah Master Screener Fase 1 (backend `fetchInvezgoScreener`), user memberi arahan gabungan: (1) "kalo dianalisa asal akan memakan kuota" — perkuat dulu pakai data yang murah/sudah real, (2) "Opportunity Radar dan market radar kenapa tidak disatukan saja menjadi screener yang bisa di filter, kedepan apabila anda buat screener wajib menggunakan filter karna screen kedepan hanya ada 1 tidak banyak lagi dan terpisah pisah". Sebelum coding, saya susun dulu rancangan formula skor (didiskusikan & disetujui user, dengan catatan boleh dikalibrasi ulang) untuk 2 sub-skor: **Whale/Akumulasi** (kategorikal, -3..+4, BUKAN skor tunggal — supaya "tidak ada di top-mover hari ini" tidak disamakan diam-diam dengan "netral") dan **Potensi Uptrend** (0-100).
- **Prinsip desain kunci:** HANYA memakai 4 sumber whole-market yang SUDAH real & murah kuota (`analysis/top/accumulation`, `analysis/top/foreign`, cache fundamental Yahoo yang sudah ada dari Opportunity Radar, cache teknikal Yahoo BARU) — `fetchInvezgoScreener()` (formula custom, throttle ketat, kuota terpisah dari PR sebelumnya) SENGAJA TIDAK dipanggil otomatis di sini, tetap jadi filter custom opsional terpisah, sesuai instruksi eksplisit user soal kuota.
- **Yang dibangun:**
  1. **Cache indikator teknikal** (`lib/providers/yahoo-client.js` + `lib/idx-data-engine.js`): `yfStoreGet/yfStoreSetEx/yfStoreMget` di-export dari yahoo-client.js (dipakai ulang, bukan duplikasi Redis-client ke-3), `fetchAndCacheTechnicalSignal()`/`getCachedTechnicalBulk()`/`warmTechnicalRotating()` di idx-data-engine.js — pola PERSIS sama dengan cache fundamental Opportunity Radar (TTL 24 jam positif/10 menit negatif, cursor rotating di Redis, dipanaskan lewat cron harian) — menghindari reinvent MA/RSI/volume-ratio dari nol dengan REUSE `computeTechnicalSignal()` yang sudah ada & teruji (dipakai AI Trading Scanner).
  2. **`generateUnifiedScreener(params)`** (`lib/idx-data-engine.js`): gabung akumulasi/distribusi + foreign flow (whole-market, dari `getUniverseAccumulationDistribution()`/`getUniverseForeignFlow()` yang sudah ada) + fundamental (cache Opportunity Radar) + teknikal (cache baru) jadi 1 hasil per saham. Formula Whale: match top/accumulation ±2, match top/foreign ±1, volume spike≥2x+trend UPTREND +1 (deviasi kecil dari rancangan awal "harga naik hari itu" — tidak ada field 1-hari-return murah di whole-market pass; trend UPTREND dari `computeTechnicalSignal()` lebih stabil, dicatat jujur di komentar kode). Formula Uptrend: `tech.score*0.7` + bonus valuasi (PER wajar) + bonus kualitas (ROE). Filter: search/index/whale/minUptrend/maxPer/minRoe/confirmedOnly, semua server-side.
  3. **Server routes** (`server.js`): `GET /api/idx/unified-screener` (filterable), `GET /api/cron/warm-technical-indicators` (CRON_SECRET-gated, pola sama seperti cron radar fundamentals PR sebelumnya).
  4. **`vercel.json`**: cron kedua `warm-technical-indicators` dijadwalkan 22:30 UTC (30 menit setelah cron fundamental 22:00 UTC, supaya tidak tabrakan cold-start) — Vercel Hobby (paket user) membatasi ke 2 cron job, ini memakai slot ke-2.
  5. **Konsolidasi navigasi** (`public/index.html`, `public/js/06-analysis-router.js`, `public/js/48-unified-screener.js` baru): tombol sidebar "Opportunity Radar" di-relabel jadi "Screener" (tetap `goPage('radar')`, sekarang me-render Unified Screener baru); tombol "Market Radar" (`goPage('ranking')`) dan "Smart Money Screener" (`goPage('scanner')`) DIHAPUS dari sidebar (bukan cuma disembunyikan) supaya tidak ada 3 tombol menuju 1 halaman yang sama; `goPage()` tetap redirect nama lama 'ranking'/'scanner' ke container `page-radar` sebagai jaring pengaman kalau ada deep-link lama yang masih dipanggil. Kode lama (`renderOpportunityRadarPage()`, `fsRenderRanking()`, dst) TIDAK dihapus — tetap ada di file tapi sudah tidak reachable dari navigasi, supaya perubahan tetap reversibel & risiko regresi rendah (konsisten dengan disiplin sesi ini: jangan sentuh kode di luar cakupan tanpa perlu).
  6. **Catatan cakupan (di luar 3 halaman utama ini):** halaman "Screener" lama di dalam Quant Lab (`page-screener`, `case 'screener'` router) DIKONFIRMASI sudah tidak reachable via navigasi apa pun sebelum perubahan ini (dead code pre-existing, bukan bagian dari 3 tombol sidebar yang digabung) — tidak disentuh, tidak perlu tindakan tambahan.
- **Test regresi (`test_suite.js`):** 5 test baru (total 209, naik dari 204) — cache teknikal ada & ter-export, `generateUnifiedScreener()` ada & TIDAK memanggil `fetchInvezgoScreener()` otomatis (dicek via isolasi body fungsi + regex negatif), 1 behavioral test (`generateUnifiedScreener({limit:10})` dijalankan langsung, live import) memverifikasi shape hasil jujur (`isRealTechnical:false` untuk semua saham tanpa config Yahoo/Redis di sandbox — bukan skor palsu), route server + CRON_SECRET guard ada, dan konsolidasi navigasi (tombol lama benar-benar hilang, bukan cuma direlabel, 1 tombol tersisa). **Bug tak terkait ditemukan & diperbaiki saat menulis test baru**: test lama "lib/idx-data-engine.js loads cleanly..." (baris ~4801) me-restore `process.env.UPSTASH_REDIS_REST_URL` dengan `= origUrl` di mana `origUrl` adalah `undefined` — di Node.js ini SALAH (menghasilkan string literal `"undefined"`, bukan menghapus var), meracuni env var untuk sisa proses test dan membuat test Unified Screener yang baru gagal dengan error Upstash asing ("invalid URL... undefined"). Diperbaiki dengan `delete process.env.X` saat nilai asli memang belum diset. Semua 5 test baru dikonfirmasi FAIL tanpa fix (`git stash -u`), PASS dengan fix (209/209, total 238 lulus semua suite).
- **Verifikasi:** `node -c` semua file baru/berubah sukses, `npm test` 238/238 lulus, `npm run lint` bersih. Playwright live (server lokal, tanpa `INVEZGO_API_KEY`/Upstash): endpoint `/api/idx/unified-screener` merespons jujur (`isSimulated:true` untuk akumulasi/foreign, `isRealTechnical:false`/`isRealFundamental:false` untuk semua saham, TIDAK ada angka dikarang); halaman render 100 baris tanpa `pageerror`; ketiga nama lama (`goPage('ranking')`, `goPage('scanner')`, `goPage('radar')`) semuanya menampilkan halaman Unified Screener yang sama; klik baris berhasil membuka Stock Intel untuk ticker itu; filter (mis. Max PER=15) mengembalikan 0 hasil di sandbox ini (jujur — tidak ada fundamental real ter-cache), bukan hasil dikarang; sidebar dikonfirmasi cuma 1 tombol tersisa untuk radar/ranking/scanner (bukan 3).
- **Batasan yang tidak bisa diuji di sandbox ini:** `api.invezgo.com`/Yahoo diblokir egress sandbox — skor Whale akan selalu netral dan cache teknikal akan selalu kosong sampai deploy dengan config real + cron pertama jalan. Panduan setup cron kedua (`warm-technical-indicators`) menyusul terpisah untuk user (env var `CRON_SECRET` sudah pernah di-set untuk cron radar-fundamentals sebelumnya — cron baru ini pakai secret YANG SAMA, tidak perlu env var baru, hanya perlu redeploy supaya `vercel.json` yang baru terbaca Vercel).
- Cache-bust: `06-analysis-router.js?v=20260918a`, `48-unified-screener.js?v=20260918a` (baru).

## 2026-09-18 — Bandarmology BBCA (screenshot produksi): Foreign Flow "+Rp 0 M/0%" palsu, konsentrasi 65% hardcoded, dan pesan KSEI generik menutupi sebab gagal yang sebenarnya

- **Konteks:** user melaporkan (2 screenshot produksi `moneywatchapps.vercel.app`, ticker BBCA) 3 hal yang menurutnya sudah berkali-kali diminta diperbaiki tapi belum: (1) "Arus investor asing saat ini mencatatkan Net Buy +Rp 0 M dengan partisipasi pasar sebesar 0%" di kartu Bandarmology, (2) Matriks Rata-Rata Harga Beli Broker 1 Tahun masih SIMULASI, (3) pillar "Kepemilikan Kustodian KSEI" di Stock Dossier bilang "DATA TIDAK TERSEDIA" padahal pillar lain di halaman yang sama (Smart Money & Broker Flow, Market Regime) berlabel "REAL" — jadi Invezgo API jelas terkoneksi.
- **Temuan #1 (dikonfirmasi bug nyata, BUKAN keterbatasan data) — Foreign Flow "0 M/0%" fabrikasi:** `computeBandarmologyVerdict()` (`lib/idx-data-engine.js`) SUDAH benar mengembalikan `foreignFlow: { available: false, netValRp: null, participationPct: null, ... }` ketika data broker per-ticker Invezgo (`investor=all`) tidak punya flag asing/domestik per baris (`hasForeignSplit` SELALU `false` untuk skema real yang sudah dikonfirmasi live — endpoint ini TIDAK PERNAH punya split F/D, ini keterbatasan permanen bukan bug sesaat). Tapi 4 titik render di `public/js/41-stockchat-cockpit.js` (`renderAggregatedBrokerFlowView`, kartu ringkas 4-metrik; bullet "Rekomendasi & Catatan Taktis" — persis yang muncul di screenshot; `renderBrokerSummaryWidget`; banner 4-metrik `renderStockChatPage`) TIDAK PERNAH mengecek flag `available` ini — semua langsung `ff.netValRp || 0` dan `ff.participationPct || 0`, sehingga `null` (tidak tersedia) dibaca sebagai "0" dan ditampilkan seolah itu angka real untuk SETIAP ticker, setiap kali.
- **Perbaikan #1:** ke-4 titik render sekarang mengecek `ff.available === false` lebih dulu — kalau tidak tersedia, tampilkan "Tidak Tersedia" + penjelasan singkat ("Invezgo investor=all tidak menyertakan flag asing/domestik per broker"), bukan angka "0" yang menyesatkan. Ditemukan juga bug serupa di baris yang sama: label "Top 3 Buyer Konsentrasi" jatuh ke fallback hardcoded `|| 65` (65% palsu) kalau data konsentrasi kosong — diperbaiki jadi "Konsentrasi Top 3 Buyer tidak tersedia".
- **Temuan #2 — Matriks Broker Historis 1 Tahun (BUKAN bug baru, dikonfirmasi ulang):** widget ini SUDAH berlabel jujur "SIMULASI (Bukan Database Riil)" dengan penjelasan eksplisit di UI (screenshot user sendiri menunjukkan label ini) sesuai perbaikan sesi sebelumnya (CLAUDE.md §3 incident). Root cause TIDAK bisa dihilangkan: BEI tidak menyediakan feed historis broker-level publik/gratis untuk 1 tahun ke belakang — tidak ada API (Invezgo atau lainnya) yang terintegrasi bisa memberi data ini. **Tidak ada perubahan kode untuk item ini** — disampaikan jujur ke user sebagai keterbatasan struktural, dengan 2 opsi: tetap dipertahankan (berlabel jujur, seperti sekarang) atau dihapus total dari UI kalau user tidak ingin ada widget simulasi sama sekali.
- **Temuan #3 (dikonfirmasi bug nyata) — pesan KSEI generik menutupi sebab gagal:** `dossierComputeKseiScore()` (`public/js/46-stock-dossier.js`) SELALU menampilkan pesan generik "Data kepemilikan kustodian KSEI belum diunggah/tidak ditemukan..." setiap kali live-fetch Invezgo gagal — padahal `generateShareholderComposition()` (`lib/idx-data-engine.js`) SUDAH menangkap alasan spesifik di `result.errors` (mis. `QUOTA_EXHAUSTED`, `SUBSCRIPTION_INSUFFICIENT`, `AUTH_FAILED`, `RATE_LIMITED`, `NETWORK_ERROR`) — alasan itu selama ini dibuang begitu saja di frontend, jadi user tidak pernah tahu APAKAH memang datanya tidak ada, atau API-nya gagal karena sebab lain yang bisa ditindaklanjuti (mis. kuota habis atau paket langganan tidak mencakup endpoint shareholder). Karena sandbox ini tidak bisa mengakses `api.invezgo.com`, saya TIDAK BISA memastikan dari sini alasan pasti kenapa BBCA gagal di produksi user — perbaikan ini membuat alasan sebenarnya AKAN terlihat begitu user reload halaman (bukan langsung menjawab "kenapa" sekarang).
- **Perbaikan #3:** `dossierComputeKseiScore()` sekarang membaca `live.errors` untuk entri `part:'kseiComposition'`, memetakan kode alasan ke teks Indonesia yang jelas, dan menambahkannya ke pesan "Sebab: ..." — kalau memang tidak ada errors sama sekali (endpoint sukses tapi datanya kosong), pesan generik lama tetap dipakai (itu benar-benar "data tidak ada", bukan kegagalan API).
- **Test regresi (`test_suite.js`):** 3 test baru (total 212, naik dari 209) — memverifikasi keempat titik render foreign-flow mengecek `ff.available===false`, fallback "65%" hardcoded hilang, dan `dossierComputeKseiScore()` memetakan kode alasan spesifik. Dikonfirmasi FAIL tanpa fix (`git stash` 2 file implementasi: "found 0" / "hardcoded 65% fallback is back" / "no longer reads live.errors"), PASS dengan fix (212/212, total 241 lulus semua suite).
- **Verifikasi:** `node -c` kedua file sukses, `npm test` 241/241 lulus, `npm run lint` bersih. Playwright live: `renderAggregatedBrokerFlowView()` dipanggil langsung dengan `foreignFlow.available=false` disimulasikan — bullet "Data arus investor asing ... tidak tersedia" muncul (bukan lagi "Net Buy +Rp 0 M"), nol `pageerror`.
- **Batasan yang tidak bisa diuji di sandbox ini:** `api.invezgo.com` diblokir egress sandbox — TIDAK BISA memastikan alasan pasti kegagalan KSEI BBCA di produksi user (kuota/subscription/auth/lainnya). **User perlu cek langsung setelah deploy:** buka Stock Dossier BBCA lagi, lihat teks di bawah pillar "Kepemilikan Kustodian KSEI" — sekarang akan menyebutkan sebab spesifik (mis. "Kuota bulanan Invezgo API sudah habis" atau "Paket langganan tidak mencakup endpoint ini") alih-alih pesan generik lama. Kalau sebabnya kuota/subscription, itu perlu ditindaklanjuti di sisi akun Invezgo Anda, bukan di kode.
- Cache-bust: `41-stockchat-cockpit.js?v=20260918d`, `46-stock-dossier.js?v=20260918b`.

## 2026-09-18 — Uji Win Rate Unified Screener: backtest historis (Track A) + forward paper-trading log (Track B)

- **Konteks:** user bertanya "bagaimana agar saya bisa menguji apakah screener benar atau salah, untuk menentukan apakah formula yang anda buat dapat diuji win rate nya" — lalu meminta dibangun "keduanya sekaligus" (backtest historis + forward log), dengan catatan ke depan akan menambah parameter baru (mis. jumlah hari akumulasi broker, foreign net buy volume breakout 1.5x rata-rata 60 hari) kalau strategi yang ada gagal — jadi infrastruktur pengujian ini disiapkan untuk dipakai berulang, bukan sekali pakai.
- **Batasan metodologis yang disampaikan jujur ke user SEBELUM membangun:** komponen valuasi (PER/ROE) di `generateUnifiedScreener()` TIDAK BISA di-backtest historis dengan data yang ada — aplikasi cuma menyimpan snapshot fundamental TERBARU (cache Redis dari Opportunity Radar), bukan snapshot per-tanggal historis. Backtest yang memakai PER/ROE hari ini untuk menilai sinyal 6 bulan lalu adalah **look-ahead bias** (model "tahu" data yang belum ada saat itu) — akan menghasilkan win rate yang kelihatan bagus tapi palsu. Diputuskan: backtest HANYA menguji komponen teknikal+whale (yang genuinely bisa direkonstruksi historis tanpa bias), valuasi tetap dipakai di skor LIVE tapi divalidasi lewat Track B (forward log), bukan Track A.
- **Track A — `runUnifiedScreenerBacktest()`** (`lib/idx-data-engine.js`): untuk tiap tanggal historis (lookbackDays, default 45 hari, dibatasi 10-90 untuk muat di batas 30 detik Vercel), panggil `getUniverseAccumulationDistribution({date})`/`getUniverseForeignFlow({date})` (whole-market, 1 call masing-masing per tanggal — MURAH, bukan per-ticker) untuk dapat daftar akumulasi/foreign-flow hari itu, lalu hitung skor teknikal HANYA dari bar OHLCV Yahoo sampai tanggal itu (`computeTechnicalSignal()`, tidak ada lookahead — dipotong persis di index tanggal sinyal). Sinyal "confirmed" = whaleScore≥3 DAN skor teknikal≥60. Return diukur dari harga tanggal sinyal ke tanggal+forwardDays (default 20 hari), dibandingkan benchmark IHSG periode sama (alpha). `getUniverseForeignFlow()` diperbaiki untuk menerima parameter `date` (sebelumnya hardcode hari ini — sebelumnya tidak masalah karena tidak pernah dipanggil untuk tanggal lain, sekarang jadi kebutuhan nyata untuk backtest).
- **Track B — forward paper-trading log** (`lib/idx-data-engine.js`: `logTodaysUnifiedScreenerSignals()`/`resolveScreenerSignalLog()`/`getScreenerSignalLogSummary()`): tiap hari (via cron), catat sinyal "confirmed" hari itu (formula LENGKAP termasuk valuasi — bukan cuma teknikal+whale seperti Track A) dengan harga entry real; setelah horizon 20 hari bursa lewat, dihitung return real dari histori Yahoo — nol look-ahead bias by construction, tapi butuh waktu terkumpul. **Keputusan arsitektur:** disimpan sebagai 1 JSON array di Redis (key `screener:signallog:entries`, reuse `yfStoreGet/yfStoreSetEx` yang sudah ada), BUKAN tabel Supabase baru — karena akses Supabase di app ini SELALU client-side per-user (RLS `auth.uid()`, `server.js` tidak pernah punya Supabase client sama sekali, dikonfirmasi dari komentar `ai_signal_log`), sedangkan sinyal screener ini market-wide bukan per-user, jadi tidak cocok dengan model itu. Pencatatan harian di-piggyback ke cron `warm-technical-indicators` yang sudah ada (budget dipangkas dari 25 detik jadi 20 detik untuk kasih ruang) karena Vercel Hobby cuma boleh 2 cron job dan keduanya sudah terpakai — TIDAK ADA cron ke-3. Resolusi sinyal yang sudah matang dilakukan lazy saat endpoint dibaca (`resolveScreenerSignalLog()`), pola yang sama seperti "cache miss memicu fetch" yang sudah dipakai di seluruh aplikasi ini.
- **Bug ditemukan & diperbaiki lewat test regresi baru sendiri (bukan dilaporkan user):** idempotency check `logTodaysUnifiedScreenerSignals()` awalnya cek "apakah ada entri bertanggal hari ini" untuk mencegah dobel-log — TAPI kalau hari itu 0 sinyal confirmed (kasus paling umum), tidak ada entri sama sekali yang bertanggal hari ini, jadi cek itu tidak pernah terpicu dan `generateUnifiedScreener()` akan dijalankan ulang tiap kali cron ini terpanggil hari itu, bukan cuma sekali. Diperbaiki dengan marker key terpisah (`screener:signallog:lastCheckedDate`) yang tidak bergantung pada ada/tidaknya entri.
- **Frontend** (`public/js/48-unified-screener.js`): panel baru "Uji Win Rate Formula" di bawah tabel Screener — Track A (input lookback/forward hari + tombol "Jalankan Backtest", tampilkan win rate/avg return/avg alpha/beat-IHSG-rate/jumlah sinyal + peringatan eksplisit kalau sampel <20 sinyal "jangan langsung percaya"), Track B (auto-load ringkasan win rate forward + tabel 20 entri terakhir, status PENDING/WIN/LOSS).
- **Server routes** (`server.js`): `GET /api/idx/unified-screener-backtest` (Track A, `?lookbackDays=&forwardDays=`), `GET /api/idx/screener-signal-log` (Track B).
- **Test regresi (`test_suite.js`):** 5 test baru (total 217, naik dari 212) — memverifikasi backtest available-gated jujur pada config Invezgo, tidak pernah menyertakan fundamental (regex negatif pada isi fungsi, mencegah regresi look-ahead-bias di masa depan), forward log idempotent tidak dobel-log, resolve tidak pernah terjadi sebelum horizon matang, dan panel frontend + peringatan sampel kecil ada. Semua dikonfirmasi FAIL tanpa fix (`git stash`), dan 1 dari 5 SEMPAT FAIL lagi setelah fix pertama diterapkan (bug idempotency di atas — ditemukan justru oleh test yang sama sedang dibangun, bukan lolos tanpa terdeteksi), diperbaiki, lalu PASS (217/217, total 246 lulus semua suite).
- **Verifikasi:** `node -c` semua file sukses, `npm test` 246/246 lulus, `npm run lint` bersih. Playwright live: kedua endpoint baru merespons jujur (`available:false`/array kosong, bukan angka karangan) tanpa `INVEZGO_API_KEY`/Redis di sandbox; panel render di halaman Screener tanpa `pageerror`; `usRunBacktest()`/`usFetchSignalLog()` dipanggil langsung, keduanya menampilkan pesan honest-fallback yang benar.
- **Batasan yang tidak bisa diuji di sandbox ini:** `api.invezgo.com` diblokir egress sandbox — Track A (backtest) tidak bisa menghasilkan sinyal nyata di sini, dan Track B (forward log) baru mulai terisi setelah deploy + cron pertama jalan + INVEZGO_API_KEY dikonfigurasi. **User perlu, setelah deploy:** (1) buka halaman Screener, scroll ke "Uji Win Rate Formula", klik "Jalankan Backtest" — cek angka win rate/alpha muncul (bukan 0 atau kosong tanpa penjelasan); (2) tunggu minimal 20+ hari bursa setelah deploy sebelum forward log (Track B) mulai menunjukkan hasil resolved — sebelum itu wajar kalau "Sudah Selesai: 0".
- Cache-bust: `48-unified-screener.js?v=20260918b`.

## 2026-09-18 — Stock Intel TOP BROKER BUYER: root cause SEBENARNYA ditemukan — bukan keterbatasan data, tapi field-name bug (bukan pernah tampil, di ticker/timeframe manapun)

- **Konteks:** setelah perbaikan sebelumnya hari ini (menambah pilihan timeframe 1D/1W/1M/1Y untuk widget ini), user melaporkan sudah coba SEMUA timeframe dan tetap tidak ada hasil sama sekali — "Tidak ada data broker signifikan untuk 1W — coba timeframe lebih panjang" muncul di semua pilihan.
- **Investigasi:** dicurigai awalnya soal kuota/subscription Invezgo (pola yang sama seperti isu KSEI hari ini), tapi ditemukan sesuatu yang lebih mendasar: `getStockIntelData()` (`public/js/27-stockintel.js`) membaca `brokerRows` dari `bSummary.brokers.buyer` — **field path yang TIDAK PERNAH ADA** di kedua sumber data yang mungkin diterima kartu ini:
  - Jalur data REAL (`generateBrokerSummary()` di `lib/idx-data-engine.js`, lewat `/api/idx/broker-summary/:ticker`) mengembalikan `topBuyers`/`topSellers` (field `{rank, broker, name, type, category, volumeLot, valueRp, avgPrice, pctOfTurnover}`).
  - Jalur simulasi client-side (`generateClientSideBrokerSummary()` di `public/js/41-stockchat-cockpit.js`) JUGA mengembalikan `topBuyers`/`topSellers`, bukan `brokers.buyer`.
  - Akibatnya `bSummary.brokers` selalu `undefined` untuk KEDUA sumber data, jadi `brokerRows` selalu array kosong — **bukan soal ketersediaan data Invezgo sama sekali**, murni bug penamaan field yang sudah ada sejak widget ini pertama dibangun. Kartu ini tidak pernah benar-benar menampilkan data broker riil untuk ticker/timeframe apa pun, meski data real-nya mungkin sudah ada di respons API selama ini.
- **Perbaikan:** `brokerRows` sekarang dibaca dari `bSummary.topBuyers` (field yang benar-benar ada), dipetakan ulang ke bentuk `{code, name, volume, avgPrice}` — nama field yang memang dipakai KEDUA titik render tabel (CARD 4 dan modal detail), yang sebelumnya membaca `b.code`/`b.volume` (juga tidak cocok dengan `broker`/`volumeLot` dari sumber asli — bug kedua yang bertumpuk dengan bug pertama, sekarang sama-sama diperbaiki di satu titik pemetaan).
- **Perbaikan tambahan (disiplin sesi ini, pola yang sama seperti perbaikan KSEI hari ini):** ditambah `brokerEmptyReason` — kalau data memang sudah dicoba fetch tapi jatuh ke simulasi, pesan kosong sekarang menyebutkan sebabnya (`quality.reason` — quota/auth/subscription/dll) alih-alih generik "tidak ada data", supaya kalau suatu saat widget ini genuinely kosong lagi, penyebabnya langsung kelihatan tanpa perlu investigasi kode ulang.
- **Test regresi (`test_suite.js`):** 2 test baru (total 219, naik dari 217) — satu mengekstrak & menjalankan langsung ekspresi pemetaan `brokerRows` dengan data mock `topBuyers` untuk membuktikan baris tidak lagi kosong dan field ter-mapping benar (`code`/`volume` bukan `broker`/`volumeLot`), satu lagi memverifikasi `brokerEmptyReason` tersambung di kedua titik render. Dikonfirmasi FAIL tanpa fix (`git stash` — pesan persis "brokerRows reverted to reading the nonexistent bSummary.brokers.buyer path"), PASS dengan fix (219/219, total 248 lulus semua suite).
- **Verifikasi:** `node -c` sukses, `npm test` 248/248 lulus, `npm run lint` bersih. Playwright live (mock respons API dengan `topBuyers` berisi data broker real seperti UBS/Mandiri Sekuritas) — kartu TOP BROKER BUYER terbukti MERENDER baris data (bukan lagi selalu kosong); mock kedua dengan `isSimulated:true` + `quality.reason:'QUOTA_EXHAUSTED'` — pesan kosong terbukti menyebutkan "QUOTA_EXHAUSTED" secara eksplisit. Nol `pageerror`.
- **Batasan yang tidak bisa diuji di sandbox ini:** `api.invezgo.com` diblokir egress sandbox — tidak bisa memastikan BBCA di produksi user benar-benar punya data broker real dari Invezgo (kemungkinan besar iya, mengingat bug ini menjelaskan kenapa widget SELALU kosong terlepas dari ketersediaan data sebenarnya). **User perlu verifikasi setelah deploy:** buka Stock Intel BBCA, cek TOP BROKER BUYER sekarang menampilkan baris broker (bukan lagi kosong) untuk setidaknya satu timeframe; kalau masih kosong di semua timeframe, pesan sekarang akan menyebutkan sebab spesifik (quota/subscription/dll) yang bisa ditindaklanjuti di akun Invezgo.
- Cache-bust: `27-stockintel.js?v=20260918c`.

## 2026-09-18 — TradeWave "Wave Scanner" tab dikonsolidasi ke Unified Screener (pelanggaran CLAUDE.md §2 yang belum pernah diaudit)

- **Konteks:** user meminta ("trade wave masih memiliki screener sendiri, pelajari bisakah digabungkan kedalam Screener, dan kalo tidak memungkinkan pindahkan tradewave ke dalam sceener saja") untuk mengevaluasi apakah tab "Wave Scanner" di halaman TradeWave (`public/js/37-tradewave-engine.js`) — screener terpisah kelima yang belum ikut konsolidasi sebelumnya — bisa digabung ke Unified Screener.
- **Temuan (pelanggaran CLAUDE.md §2 yang baru terungkap):** `renderTab2WaveScanner()` memindai `TW_UNIVERSE`, array **hardcoded ~25 ticker** yang mencampur 22 saham IDX populer dengan 5 cryptocurrency (BTC/ETH/SOL/BNB/XRP) — persis pola "screener sampel kecil" yang CLAUDE.md §2 larang secara eksplisit (setara pelanggaran LQ45/IDX30 yang sudah 2x jadi insiden sebelumnya untuk fitur lain), tapi belum pernah diaudit sebelumnya karena tab ini hidup di halaman TradeWave, bukan salah satu dari 4 halaman screener yang sudah digabung ke Unified Screener sesi sebelumnya.
- **Analisis sebelum eksekusi:** formula wave Elliott/SuperTrend/Fibonacci milik TradeWave (`twAnalyzeWave()`) BEDA sepenuhnya dari formula Whale/Uptrend Unified Screener — bukan sekadar UI yang bisa dipindah mentah, perlu di-porting perhitungannya. Diputuskan: port perhitungan (SuperTrend ATR-based, EMA-9/21/50 ribbon, CMF-20, klasifikasi fase gelombang, target Fibonacci) ke server-side (`lib/idx-data-engine.js`, fungsi baru `computeSuperTrendSeries()`/`computeWaveAnalysis()`), dijalankan whole-market (958 ticker BEI) lewat pipeline cache teknikal yang sudah ada (`fetchAndCacheTechnicalSignal()` — cukup menambah 1 field `tech.wave` ke cache entry yang sama, tidak perlu Redis key/cron baru), lalu diekspos sebagai kolom + filter tambahan di Unified Screener — bukan menyalin tab terpisah lagi.
- **Keputusan scope eksplisit dari user:** ditanya lewat AskUserQuestion apakah crypto/US-stock tetap disertakan atau dibuang — user memilih **(a) buang dari Wave Scanner, fokus BEI penuh**, konsisten dengan aturan cakupan CLAUDE.md §2 (yang berbicara soal cakupan BEI, bukan aset lain); crypto akan dibangun sebagai fitur terpisah nanti, tidak dipaksakan masuk pipeline BEI ini.
- **Perbaikan:**
  - `lib/idx-data-engine.js`: `computeSuperTrendSeries(points, period, factor)` (ATR + SuperTrend directional-flip, identik secara matematis dengan `twCalcSuperTrend()` TradeWave) dan `computeWaveAnalysis(points)` (EMA ribbon, CMF-20, klasifikasi 6 fase — WAVE 1 BREAKOUT/WAVE 2 DIP BUY/WAVE 3 EXTENSION/WAVE 4 RETEST/WAVE 5 CLIMAX/CORRECTIVE ABC, target TP1/TP2/TP3 Fibonacci 0.618/1.0/1.618, invalidation stop-loss ATR×1.5) — return `null` jujur (bukan skor karangan) kalau riwayat OHLCV <30 bar. RSI di sini memakai `computeRSI()` milik file ini sendiri (bukan `twCalcRsi()` Wilder-smoothed milik TradeWave) — perbedaan formula yang disengaja, keduanya varian RSI yang sah, menyatukan ke satu implementasi yang sudah dipakai di tempat lain menghindari RSI ke-3 tanpa manfaat perilaku.
  - `fetchAndCacheTechnicalSignal()` diubah untuk melampirkan `tech.wave = computeWaveAnalysis(history?.points)` sebelum entry di-cache — menumpang cache Redis teknikal yang sudah ada (TTL 24 jam), tidak ada Redis key atau cron baru.
  - `generateUnifiedScreener()` sekarang mengembalikan 9 field wave tambahan per baris (`wavePhase`, `waveScore`, `superTrendBullish`, `cmf`, `waveInvalidation`, `waveTp1/2/3`, `waveRiskReward`) dan filter baru `wavePhase` (query param `?wavePhase=...`); `summary.waveCoverage` ditambahkan untuk transparansi cakupan (konsisten dengan `technicalCoverage`/`fundamentalCoverage` yang sudah ada).
  - `public/js/48-unified-screener.js`: kolom tabel "Wave Phase" baru + dropdown filter Wave Phase, dan banner cakupan menyebutkan `waveCoverage`.
  - `public/js/37-tradewave-engine.js`: tab "Wave Scanner" (tombol, dispatch `activeTab===2`, `renderTab2WaveScanner()`, `TW_UNIVERSE`, `filterWave` state, `twSetFilterWave()`, quick-pick BTC) **dihapus seluruhnya**. Tab 1 (Wave Cockpit) dan tab 3 (Risk & Position Planner) — yang menganalisis 1 ticker pilihan user, bukan screener whole-market — tidak diubah perilakunya. Komentar header file diperbarui untuk tidak lagi mengklaim kapabilitas "Multi-Asset Wave Scanner".
- **Test regresi (`test_suite.js`):** 4 test baru/diganti — (1) memastikan tab Wave Scanner beserta `TW_UNIVERSE`, `twSetFilterWave()`, tombol tab-2, dan quick-pick BTC benar-benar hilang dan tidak muncul lagi; (2) `computeWaveAnalysis()` diuji langsung (vm sandbox, data OHLCV sintetis) — deret uptrend bersih diklasifikasi sebagai fase bullish dengan SuperTrend bullish dan target TP1<TP2<TP3 berurutan benar, deret crash+downtrend diklasifikasi CORRECTIVE ABC dengan SuperTrend bearish, dan <30 bar mengembalikan `null` jujur (bukan crash/karangan); (3) `generateUnifiedScreener()` diverifikasi mengekspos semua 9 field wave dan filter `wavePhase`; (4) 2 test lama (TEST 42/42b) yang menguji perilaku tab Wave Scanner yang sudah dihapus diganti jadi guard bahwa tab tersebut TIDAK muncul lagi (bukan dihapus begitu saja — supaya kalau ada yang menambah kembali fitur ini secara tidak sengaja di masa depan, langsung ketahuan). Dikonfirmasi FAIL tanpa fix (`git stash` 3 file implementasi: "renderTab2WaveScanner() has reappeared" / "could not locate computeSuperTrendSeries()" / "computeWaveAnalysis() not found"), PASS dengan fix (221/221 lulus semua suite, sempat 1 test korektnes wave analysis gagal di percobaan pertama karena deret downtrend sintetis terlalu halus untuk memicu SuperTrend bearish — diperbaiki dengan pola "tenang lalu crash tajam" yang realistis, bukan penurunan linear konstan).
- **Verifikasi:** `node -c` ketiga file sukses, `npm test` 221/221 lulus, `npm run lint` bersih.
- **Batasan yang tidak bisa diuji di sandbox ini:** `api.invezgo.com`/`finance.yahoo.com` diblokir egress sandbox — kolom Wave Phase di Screener produksi baru akan terisi bertahap lewat cron `warm-technical-indicators` yang sudah berjalan (tidak perlu setup tambahan, fitur ini menumpang cache yang sama). **User perlu verifikasi setelah deploy:** buka halaman Screener, cek kolom "Wave Phase" muncul di tabel dan dropdown filter Wave Phase berfungsi; buka halaman TradeWave, pastikan tombol "Wave Cockpit" dan "Risk & Sizing" masih berfungsi normal dan tombol "Wave Scanner" sudah tidak ada lagi.
- Cache-bust: `37-tradewave-engine.js?v=20260918a`, `48-unified-screener.js?v=20260918c`.

## 2026-09-18 — TradeWave dilebur total ke Screener: Wave Cockpit & Risk Planner jadi tab, halaman/toolbar TradeWave dihapus

- **Konteks:** setelah "Wave Scanner" TradeWave dikonsolidasi ke Unified Screener (entri di atas), user meminta langkah lanjutan: "tab Wave Cockpit dan Risk Planner, dipindahkan sekalian ke scanner namun beda tab diatas, toolbar trade wave di hilangkan saja semua bergabung di scanner" — 2 tab TradeWave yang tersisa (Wave Cockpit analisis 1 ticker + Risk Planner kalkulator ukuran posisi) BUKAN screener (jadi tidak melanggar CLAUDE.md §2), tapi user tetap ingin TradeWave berhenti jadi halaman/toolbar terpisah — semuanya masuk ke Screener sebagai tab tambahan.
- **Perbaikan:**
  - `public/js/37-tradewave-engine.js`: `initTradeWaveSuite()` dan `renderTradeWavePage()` (perenderan level-halaman lama, target `#page-tradewave`, dengan tombol tab-switch 🌊/📐 sendiri) dihapus, diganti `twRenderSubPage(containerId, tabIdx)` — fungsi generik yang merender Wave Cockpit (`tabIdx===1`) atau Risk Planner (`tabIdx===3`) ke `containerId` mana pun yang diberikan pemanggilnya. `TW_STATE.activeTab` (dulu menyimpan tab TradeWave sendiri) dihapus — sekarang tab aktif sepenuhnya ditentukan oleh state Screener. `twSetTicker()`/`twLoadTicker()`/`twRecalcPlanner()` diubah agar re-render lewat `usRenderShell()` (Screener) bukan `renderTradeWavePage()` yang sudah tidak ada; `twSetOrderSheet()` (tombol "Rencanakan Posisi" di Wave Cockpit) sekarang memanggil `usSwitchPageTab('planner')` untuk lompat ke tab Risk Planner Screener. Komentar header file diperbarui untuk menjelaskan TradeWave bukan lagi halaman berdiri sendiri.
  - `public/js/48-unified-screener.js`: ditambah `US_STATE.pageTab` (`'screener'|'cockpit'|'planner'`) dan `usSwitchPageTab(tab)`. `usRenderShell()` sekarang selalu menampilkan tab bar 3-tombol (📊 Screener / 🌊 Wave Cockpit / 📐 Risk Planner) di atas; kalau tab aktif `cockpit`/`planner`, dibuat `<div id="us-wave-subpage">` lalu `twRenderSubPage('us-wave-subpage', tabIdx)` dipanggil untuk mengisinya — konten tabel/filter/panel Win Rate Screener yang lama sepenuhnya tidak berubah, cuma sekarang di-gate di balik tab `'screener'`.
  - `public/index.html`: tombol sidebar "TradeWave" (`goPage('tradewave')`) dihapus — mengikuti pola yang sama persis dengan penghapusan tombol "Market Radar"/"Smart Money Screener" sebelumnya. `<div id="page-tradewave">` dibiarkan ada di DOM tapi tidak lagi bisa dijangkau (sama seperti `page-ranking`/`page-scanner`) — reversible/low-risk, bukan dihapus paksa.
  - `public/js/06-analysis-router.js`: `'tradewave'` ditambahkan ke `UNIFIED_SCREENER_ALIASES` (redirect ke `page-radar`, pola sama seperti `'ranking'`/`'scanner'`) supaya `goPage('tradewave')` lama (bookmark/pemanggilan dinamis) tetap mendarat di Screener, bukan diam-diam gagal; `case 'tradewave'` di `renderPage()` diubah memanggil `renderUnifiedScreenerPage()`.
- **Test regresi (`test_suite.js`):** 2 test diganti/ditambah — (1) test lama yang mengecek `renderTradeWavePage()`/`TW_STATE.activeTab` diganti jadi guard bahwa `twRenderSubPage(containerId, tabIdx)` ada dan menerima container dari pemanggil, dan bahwa `renderTradeWavePage`/`initTradeWaveSuite`/`TW_STATE.activeTab` TIDAK muncul lagi; (2) test baru memverifikasi tombol sidebar TradeWave hilang dari `index.html`, alias router `'tradewave'` ada, `US_STATE.pageTab`/`usSwitchPageTab()` ada di Screener dan benar-benar terhubung ke `twRenderSubPage()`, dan TradeWave tidak lagi mengekspos `window.initTradeWaveSuite`/`window.renderTradeWavePage`. Dikonfirmasi FAIL tanpa fix (`git stash` 4 file implementasi: "renderTradeWavePage() has reappeared" / "the separate TradeWave sidebar button is back"), PASS dengan fix (222/222 lulus semua suite).
- **Verifikasi:** `node -c` semua file berubah sukses, `npm test` 222/222 lulus, `npm run lint` bersih. Playwright live (server lokal + Chromium sandbox): halaman Screener dirender langsung (bypass auth, pola yang sama seperti verifikasi Bandarmology sebelumnya), ketiga tombol tab (Screener/Wave Cockpit/Risk Planner) terbukti ada; `usSwitchPageTab('cockpit')` dan `usSwitchPageTab('planner')` terbukti benar-benar memanggil `twRenderSubPage()` dan mengisi `#us-wave-subpage` (input ticker BBCA muncul); beralih balik ke tab Screener terbukti tabel screener utama kembali muncul. Nol `pageerror`/`ReferenceError`/`TypeError` di konsol — satu-satunya `console.error` yang muncul adalah kegagalan jaringan (403/`ERR_TUNNEL_CONNECTION_FAILED`) dari proxy sandbox, bukan bug kode. Konten Wave Cockpit dan Risk Planner sama-sama menampilkan kartu jujur "TICKER INVALID"/tidak ada data (BBCA tidak punya cache OHLCV 65-hari di sandbox tanpa akses Yahoo Finance) — dikonfirmasi ini SESUAI kebijakan Zero Dummy Data (fallback jujur, bukan data karangan), bukan bug switching tab.
- **Batasan yang tidak bisa diuji di sandbox ini:** `finance.yahoo.com` diblokir egress sandbox — Wave Cockpit/Risk Planner produksi TIDAK bisa diverifikasi menampilkan data chart/kalkulator riil dari sini (hanya fallback honestnya yang terverifikasi). **User perlu verifikasi setelah deploy:** buka halaman Screener, klik tab "Wave Cockpit" — pastikan chart & metrik Elliott Wave/SuperTrend untuk ticker seperti BBCA benar-benar tampil (bukan kartu "TICKER INVALID"); klik tab "Risk Planner" — pastikan kalkulator ukuran posisi berfungsi; pastikan sidebar TIDAK lagi punya entri "TradeWave" terpisah.
- Cache-bust: `06-analysis-router.js?v=20260918b`, `37-tradewave-engine.js?v=20260918b`, `48-unified-screener.js?v=20260918d`.

## 2026-09-19 — Dashboard "Opportunity Radar": klik "Lihat Semua" nyasar ke tab Risk Planner, dan datanya beda dari Screener

- **Konteks:** user melaporkan (screenshot Portfolio Snapshot dashboard) widget "Opportunity Radar" — kliknya masuk ke tab Risk Sizing (bukan tabel Screener utama), DAN daftar top-pick yang ditampilkan (NCKL, BLOG, DGWG, DOSS, MSTI, semua skor "100"/"Strong Buy") tidak cocok dengan apa yang ditampilkan Screener.
- **Temuan #1 (bug nyata) — nyasar ke tab Risk Planner:** `US_STATE.pageTab` (`public/js/48-unified-screener.js`, dipakai konsolidasi TradeWave hari sebelumnya) bersifat sticky lintas render — `usSwitchPageTab()` HANYA men-set nilainya, tidak pernah mengembalikannya, dan `renderUnifiedScreenerPage()` (titik masuk router untuk SETIAP navigasi baru ke halaman ini — `goPage('radar')`/`'ranking'`/`'scanner'`/`'tradewave'`, termasuk tombol "Lihat Semua →" dashboard ini) tidak pernah mereset nilainya. Akibatnya: begitu user pernah membuka tab Wave Cockpit/Risk Planner sekali saja dalam sesi yang sama, SETIAP navigasi berikutnya ke Screener — dari mana pun, termasuk widget dashboard yang sama sekali tidak terkait — mendarat di tab lama itu, bukan tabel Screener utama.
- **Perbaikan #1:** `renderUnifiedScreenerPage()` sekarang selalu men-set `US_STATE.pageTab = 'screener'` di awal — setiap navigasi baru ke halaman ini (dari mana pun) selalu mulai dari tab Screener utama; tab Wave Cockpit/Risk Planner tetap bisa diakses lewat tombol tab di dalam halaman itu sendiri, cuma tidak lagi "menempel" ke navigasi berikutnya.
- **Temuan #2 (bug nyata) — data tidak sesuai Screener:** widget preview "Opportunity Radar" di dashboard (`renderDashboardRadarPreview()`, `public/js/04-render.js`) ternyata masih memanggil `loadOpportunityRadarUniverse()`/`RADAR_STATE` (`26-commandcenter.js`, endpoint lama `GET /api/idx/opportunity-radar` → `getUniverseOpportunityRadar()` di `lib/idx-data-engine.js`) — **mesin skor yang SAMA SEKALI BERBEDA** dari Unified Screener: formula lama ini murni fundamental (Margin-of-Safety dari ROE/PBV real Yahoo Finance, skor "Strong Buy" kalau ≥88), sedangkan Screener sekarang pakai formula Whale/Uptrend (`generateUnifiedScreener()`, whole-market akumulasi/foreign-flow/teknikal/fundamental digabung). Kedua endpoint ini sama-sama live dan sama-sama "real" (bukan simulasi), tapi menghasilkan daftar top-pick yang genuinely berbeda untuk pasar yang sama — persis seperti yang dilaporkan user. Root cause: saat Opportunity Radar dikonsolidasi ke Screener (2026-09-18), widget preview dashboard ini tidak ikut diupdate — tetap memanggil mesin lama yang seharusnya sudah pensiun.
- **Perbaikan #2:** `renderDashboardRadarPreview()` sekarang memanggil `GET /api/idx/unified-screener?sort=uptrendScore&order=desc&limit=5` langsung — endpoint & urutan default yang SAMA dengan yang dipakai halaman Screener sendiri — supaya widget preview ini selalu jadi subset yang konsisten dari apa yang ditampilkan "Lihat Semua". Field ditampilkan disesuaikan (`uptrendScore` sebagai badge skor, `whaleLabel` sebagai baris verdict — field asli Unified Screener, bukan field lama `score`/`verdict` milik mesin MoS).
- **Test regresi (`test_suite.js`):** 1 test diganti (assersi lama yang justru mengharuskan `loadOpportunityRadarUniverse()` dipanggil — sekarang dibalik jadi larangan) + 1 test baru untuk reset `pageTab`. Dikonfirmasi FAIL tanpa fix (`git stash`: "calls loadOpportunityRadarUniverse() again" / "no longer resets US_STATE.pageTab"), PASS dengan fix (223/223 lulus semua suite). Sempat 1 test gagal lagi di percobaan pertama karena komentar penjelasan fix ITU SENDIRI menyebut nama fungsi lama secara verbatim (`loadOpportunityRadarUniverse()`) sebagai konteks sejarah, memicu false-positive pada regex assertion — diperbaiki dengan strip baris komentar dulu sebelum mengecek kode aktualnya.
- **Verifikasi:** `node -c` kedua file sukses, `npm test` 223/223 lulus, `npm run lint` bersih. Playwright live: disimulasikan user pernah membuka tab Risk Planner (`US_STATE.pageTab` jadi `'planner'`), lalu navigasi ulang ke Screener seperti lewat tombol dashboard — terbukti `US_STATE.pageTab` kembali ke `'screener'` dan tabel Screener utama benar-benar muncul (bukan lagi macet di Risk Planner); dikonfirmasi pula `renderDashboardRadarPreview()` sekarang benar-benar memanggil `/api/idx/unified-screener` (bukan lagi `/api/idx/opportunity-radar`) lewat log network request.
- **Batasan yang tidak bisa diuji di sandbox ini:** `api.invezgo.com`/`finance.yahoo.com` diblokir egress sandbox — tidak bisa memverifikasi ticker top-pick RIIL yang muncul di widget dashboard produksi kini identik dengan yang muncul di baris teratas Screener. **User perlu verifikasi setelah deploy:** buka Dashboard, cek daftar "Opportunity Radar" di sana — ticker & skornya harus muncul lagi persis di baris teratas halaman Screener (urut skor Uptrend tertinggi) kalau dibuka lewat "Lihat Semua →"; pastikan juga klik "Lihat Semua →" langsung mendarat di tabel Screener, bukan tab Risk Planner (bahkan setelah sebelumnya membuka tab Wave Cockpit/Risk Planner).
- Cache-bust: `04-render.js?v=20260919a`, `48-unified-screener.js?v=20260919a`.

## 2026-09-19 — KSEI ">5% Shareholders": tanggal lama ternyata REAL bukan fabrikasi, tapi ada 4 fallback hardcoded yang berisiko bohong; DEWA di Bandarmologi Intelligence Summary ternyata memakai data SINTETIS tanpa disclosure

- **Konteks:** user melaporkan widget "Daftar Pemegang Saham di Atas 5% Berdasarkan SID KSEI" menampilkan "Tanggal Laporan: 26 Aug 2026" dan menduga ini kode lama berbasis upload manual yang seharusnya sudah diganti API real. User juga menguji ticker DEWA lintas 3 fitur dan mendapat kesimpulan yang saling bertentangan: Stock Dossier "MASTER SCORE 56/100 NEUTRAL/WAIT", Stock Intel "BULLISH REBOUND / LAYAK INVESTASI / AKUMULASI TERKONFIRMASI", tapi Bandarmologi Intelligence Summary "PROBABILITAS ARAH BEARISH (DOWN) 80%" dengan CMF -17.28%, OBV -4881061300, RSI 29.1 — meminta diperbaiki dulu lalu dianalisis kebenarannya.
- **Temuan #1 — "26 Aug 2026" itu REAL, bukan hardcoded fabrikasi untuk DEWA:** ditelusuri ke `data/ksei-shareholders.json` (bundled snapshot, `lastUpdated: 2026-09-01`, `reportDate: "26 Aug 2026"`, sumber "KSEI via Google Sheets", 840 emiten termasuk DEWA) — data ini genuinely diambil dari proses manual (upload Excel tervalidasi atau snapshot bundled), BUKAN fabrikasi kode. Arsitektur ini SENGAJA dibuat manual-upload (lihat komentar header file, 2026-09-11): raw export IDX butuh judgment manusia (merged cells dll.) yang parser tidak boleh menebak — desain yang sudah dipertimbangkan, bukan kelalaian.
- **Temuan #2 (bug nyata, honesty risk) — 4 spot fallback hardcoded yang KEBETULAN cocok dengan angka snapshot saat ini:** `kseiUpdateMetaBar()` dan 2 titik render lain di `public/js/34-ksei-shareholders.js` memakai `m.reportDate || '26 Aug 2026'`, `m.totalEmiten || '840'`, `m.totalMajorInvestors || '1.920'`, `stock.reportDate || '26 AUG'` — angka-angka ini SAMA PERSIS dengan snapshot bundled saat ini (karena itulah user melihat "26 Aug 2026" bahkan tanpa upload sendiri), tapi kalau file bundled ini diganti/diperbarui tanpa menyamakan ke-4 konstanta ini, tampilan akan diam-diam menunjukkan angka BASI yang terlihat presisi seolah dari state — pola persis "SIMULASI tapi terlihat presisi" yang dilarang CLAUDE.md §3.
- **Perbaikan #2:** ke-4 fallback diganti jujur ("Data Tidak Tersedia"/"-"/"N/A", bukan angka duplikat). Ditambah `kseiDataAgeDisclosure()` — menghitung usia data dari `metadata.lastUpdated` dan menampilkan badge "Snapshot manual (bukan real-time), diperbarui N hari lalu" dengan warna peringatan (amber >14 hari, merah >30 hari) di meta bar modal DAN di header tabel >5% shareholder, supaya snapshot basi terlihat basi, bukan seolah laporan segar.
- **Klarifikasi ke user (tidak bisa diperbaiki dengan kode karena keterbatasan data provider, bukan kemalasan):** TIDAK ADA API live yang terintegrasi di app ini yang bisa memberi daftar pemegang saham >5% BERNAMA. Endpoint Invezgo shareholder (`/analysis/shareholder/ksei/{ticker}` dkk., skema dikonfirmasi dari test request REAL terhadap BBCA 2026-09-18 — bukan tebakan, lihat komentar di `lib/invezgo-client.js`) HANYA memberi total AGREGAT per kategori investor (Asing/Lokal × 9 tipe), tidak pernah nama investor individual. Data agregat itu SUDAH live (lihat bagian "Komposisi Kepemilikan Live (Invezgo)" di modal KSEI yang sama) — itu dataset yang genuinely berbeda, bukan duplikat yang belum disambungkan. Mengganti tabel >5% bernama ke "API real" butuh provider data baru yang app ini belum punya.
- **Temuan #3 (bug nyata, root cause kontradiksi DEWA) — Bandarmologi Intelligence Summary bisa menampilkan data 100% SINTETIS tanpa disclosure:** `techRunFlowScanTab()` (`public/js/24-stockmaster.js`, tab "Analisis Teknikal & Flow" → sub-tab Bandarmologi) memanggil `fsGenData(tk, days)` (`public/js/07-flowscan.js`) yang diam-diam JATUH KE deret OHLCV random-walk BERBENIH (seeded synthetic) kalau riwayat harga real belum ter-cache untuk ticker itu (menandai array hasil dengan `.simulated = true`) — dan fungsi ini TIDAK PERNAH mengecek flag itu sebelum menjalankan `fsProcess()` dan menampilkan hasilnya sebagai probabilitas BEARISH/BULLISH yang percaya diri lengkap dengan angka CMF/OBV/RSI yang terlihat presisi. Tab sebelah (Gauges/Candlestick/Pivots, fungsi `techEnsureRealSeries()` di file yang sama) SUDAH punya pengaman persis untuk kasus ini — tab Bandarmologi ini yang terlewat saat perbaikan itu diterapkan. **Ini kemungkinan besar penjelasan literal kenapa DEWA menunjukkan "BEARISH 80%" di sini** sementara Stock Dossier & Stock Intel (yang membaca data real ter-cache) menunjukkan bullish/neutral — bukan berarti salah satu alat "benar" dan lainnya "salah", tapi kartu Bandarmologi ini kemungkinan menampilkan angka karangan, bukan hasil hitungan dari harga sungguhan, pada saat user mengetesnya.
- **Perbaikan #3:** ditambah pengecekan `data.simulated` SEBELUM `fsProcess()` dipanggil — kalau data masih sintetis, tampilkan pesan jujur "Riwayat harga real ... belum tersedia di cache — sinyal Bandarmologi TIDAK ditampilkan sampai data real tersedia" (bukan probabilitas karangan), kosongkan grid indikator & chart, dan picu fetch data real di latar belakang (`rdEnsure`) yang otomatis me-render ulang tab begitu data real tiba — pola self-healing yang sama dengan `techEnsureRealSeries()`.
- **Test regresi (`test_suite.js`):** 2 test baru — (1) `kseiDataAgeDisclosure()` diuji langsung (vm sandbox) untuk kasus tanpa metadata/hari-ini/40-hari-lalu, dan verifikasi ke-4 fallback hardcoded genuinely hilang; (2) memverifikasi guard `data.simulated` di `techRunFlowScanTab()` ada, berjalan SEBELUM `fsProcess()`, tidak lagi menampilkan teks "PROBABILITAS ARAH" saat data sintetis, dan memicu `rdEnsure()` untuk self-heal. Dikonfirmasi FAIL tanpa fix (`git stash` masing-masing file: "hardcoded '26 Aug 2026' fallback literal has reappeared" / "techRunFlowScanTab() no longer checks data.simulated"), PASS dengan fix (225/225 lulus semua suite).
- **Verifikasi:** `node -c` ketiga file sukses, `npm test` 225/225 lulus, `npm run lint` bersih.
- **Kesimpulan analisis DEWA untuk user (bagian kedua dari permintaan):** disampaikan langsung di chat, bukan di sini — ringkasannya: (a) kontradiksi BEARISH-80%-vs-Bullish kemungkinan besar adalah bug #3 di atas (data sintetis tanpa label), bukan perbedaan metodologi yang sah; (b) Master Score 56 "Neutral" dan Stock Intel "Bullish Rebound" bisa SAMA-SAMA benar sekaligus karena keduanya mengukur hal berbeda — Master Score adalah komposit 6 pilar (valuasi, smart money, teknikal, KSEI, fundamental, regime pasar) yang secara desain meredam sinyal ekstrem lewat rata-rata tertimbang, sedangkan Stock Intel menyoroti satu sudut pandang (rebound momentum) — bukan otomatis kontradiksi, tapi horizon/lensa yang beda dan sebaiknya dibaca bersama, bukan saling menggantikan.
- **Batasan yang tidak bisa diuji di sandbox ini:** `api.invezgo.com`/`finance.yahoo.com` diblokir egress sandbox — tidak bisa memastikan apakah DEWA di produksi user BENAR sedang tanpa cache OHLCV saat screenshot diambil (kondisi yang memicu bug #3). **User perlu verifikasi setelah deploy:** buka lagi Bandarmologi Intelligence Summary DEWA — kalau sekarang muncul pesan "Riwayat harga real ... belum tersedia" alih-alih probabilitas, itu mengonfirmasi diagnosis di atas; tunggu beberapa detik/reload, cek apakah probabilitas real yang muncul (mungkin beda arahnya) lebih konsisten dengan Stock Dossier/Stock Intel.
- Cache-bust: `24-stockmaster.js?v=20260919a`, `34-ksei-shareholders.js?v=20260919a`.

## 2026-09-19 — Quant Screener (Quant Lab) dan Volume Spike Scanner dikonsolidasi ke Unified Screener

- **Konteks:** user menemukan halaman "Quant Analysis" (Quant Lab) punya sub-tab "Screener" sendiri, dan bertanya apakah ini sama dengan Unified Screener yang sudah dikonsolidasi sebelumnya — kalau sama minta digabungkan, kalau susah digabungkan analisanya minta cukup dipindahkan tab-nya ke dalam Screener (pola sama seperti TradeWave). Instruksi yang sama juga diminta untuk halaman terpisah "Volume Spike Scanner".
- **Analisis kesamaan formula (sebelum eksekusi):** dicek kedua formula BUKAN sama persis dengan Whale/Uptrend milik Unified Screener — Quant Screener pakai RSI(14) + momentum 1M/3M + posisi vs MA50 (murni teknikal client-side, `scBuildSim()`/`fsProcess()`-independen di `11-quant.js`); Volume Spike Scanner pakai rasio volume harian vs median 14D/30D (`45-volume-spike.js`). Memaksa merge 2 formula yang sudah dikalibrasi terpisah berisiko tinggi dan di luar scope realistis sesi ini — sesuai opsi fallback yang diberikan user, kedua fitur direlokasi sebagai tab tambahan di halaman Screener (bukan dihapus/diganti formulanya), pola identik dengan konsolidasi TradeWave sebelumnya.
- **Bug ditemukan LEWAT PROSES relokasi ini sendiri (bukan dilaporkan user) — regresi laten dari fix TradeWave sebelumnya:** menambahkan tab baru mengharuskan pengecekan ulang bagaimana `US_STATE.pageTab` di-reset. Ditemukan: reset `US_STATE.pageTab = 'screener'` yang sebelumnya ditaruh di dalam `renderUnifiedScreenerPage()` (fix TradeWave, 2026-09-18) TERNYATA juga ikut terpicu oleh tick refresh berkala `03-engine.js` (`if(tick%4===0) renderPage(currentPage)`, jalan di SEMUA halaman tiap beberapa detik, TIDAK lewat `goPage()`) — kalau dibiarkan, user yang sedang membaca tab Wave Cockpit/Risk Planner/Quant Screener/Volume Spike akan otomatis terlempar balik ke tab Screener utama tiap beberapa detik. **Diperbaiki sebelum sempat di-deploy**: pemanggilan reset dipindah dari `renderUnifiedScreenerPage()` ke `goPage()` sendiri (hanya terpicu saat navigasi asli, bukan tick refresh berkala).
- **Perbaikan:**
  - `public/js/11-quant.js`: `QL_TABS` (tab bar Quant Lab) kehilangan entri `'screener'` (5 tab tersisa: Correlation/Monthly Returns/Pairs/Backtester/Scenario — bukan fungsi deteksi, tetap terpisah). Markup HTML statis milik screener lama (id `sc-tbody`/`sc-universe`/dll.) dipindah verbatim ke fungsi baru `qtScreenerSubPageHtml()` — logic (`scBuildSim`/`scRunFilter`/`scChangeUniverse`/`scRenderTable`) TIDAK diubah sama sekali (semua tetap baca elemen via `el()`, tidak peduli di mana markup-nya berada).
  - `public/js/45-volume-spike.js`: 3 titik `el('page-volume-spike')` hardcoded diganti `el(VS_CONTAINER_ID)` (variabel baru, default `'page-volume-spike'`) — supaya fungsi yang sama bisa dipasang di container manapun. Listener `GLOBAL_STOCK_CONTEXT` yang mengecek "apakah halaman ini sedang aktif" diganti `vsIsContainerActive()` yang paham 2 lokasi (halaman lama ATAU tab Screener baru).
  - `public/js/48-unified-screener.js`: 2 tab baru ("🔬 Quant Screener", "⚡ Volume Spike") ditambah ke tab bar Screener. Karena keduanya menjalankan scan whole-market progresif (batch fetch bertahap dengan guard in-flight sendiri), wrapper HTML HANYA dibangun ulang saat PERTAMA kali tab itu aktif (dicek via `document.getElementById('sc-tbody')`/`vs-detail-col`) — render/tick berikutnya cukup memanggil ulang fungsi scan/render aslinya tanpa membangun ulang markup, supaya input filter/scan progress tidak ke-reset tiap render ulang (kelas bug yang sama seperti insiden Volume Spike 2026-09-14 "scan selalu reset dari 0").
  - `public/js/06-analysis-router.js`: `'screener'` dan `'volume-spike'` ditambahkan ke `UNIFIED_SCREENER_ALIASES` (redirect ke `page-radar`, pola sama seperti `'tradewave'`/`'ranking'`/`'scanner'`); reset `US_STATE.pageTab` dipindah ke sini (lihat bug di atas).
  - `public/index.html`: tombol sidebar "Volume Spike" dihapus; markup statis `#page-screener` dikosongkan (dibiarkan ada di DOM, tidak lagi terjangkau — pola sama seperti `page-tradewave`); `#page-volume-spike` sudah kosong sejak awal (murni JS-render), tidak perlu diubah.
- **Test regresi (`test_suite.js`):** 1 test diperbaiki (assersi lama yang mengecek markup screener di `index.html`, sekarang mengecek `qtScreenerSubPageHtml()` di `11-quant.js`), 1 test diganti (pageTab-reset sekarang dicek di `goPage()`, dengan assersi TAMBAHAN bahwa `renderUnifiedScreenerPage()` TIDAK boleh mereset lagi — mencegah regresi tick-refresh di atas terulang), 1 test baru memverifikasi seluruh relokasi (nav dihapus, alias ada, markup lama hilang dari index.html, `VS_CONTAINER_ID`/`qtScreenerSubPageHtml`/tombol tab baru ada). Dikonfirmasi FAIL tanpa fix (`git stash`: "index.html lost the Screener universe select" / "goPage() no longer resets" / "Volume Spike sidebar button is back"), PASS dengan fix (226/226 lulus semua suite; sempat 1 gagal karena regex test salah escape karakter backslash-quote dalam string JS, diperbaiki).
- **Verifikasi:** `node -c` semua file sukses, `npm test` 226/226 lulus, `npm run lint` bersih. Playwright live: kelima tombol tab (Screener/Wave Cockpit/Risk Planner/Quant Screener/Volume Spike) terbukti ada; beralih ke tab Quant Screener menampilkan `sc-tbody`/`sc-universe`; disimulasikan tick refresh berkala (`renderPage('radar')`) sambil isi filter RSI Min = "42" — nilai TERBUKTI bertahan (tidak ter-reset); sama untuk tab Volume Spike dengan input ticker "BBCA" — terbukti bertahan juga; beralih balik ke tab Screener utama, tabel utama terbukti muncul kembali; tombol sidebar "Volume Spike" terbukti sudah tidak ada. Nol `pageerror`.
- **Batasan yang tidak bisa diuji di sandbox ini:** `finance.yahoo.com`/proxy CORS publik diblokir egress sandbox — hasil SCAN riil (RSI/momentum Quant Screener, rasio volume Volume Spike) tidak bisa diverifikasi dari sini, hanya kerangka UI & guard anti-reset yang terverifikasi. **User perlu verifikasi setelah deploy:** buka halaman Screener, klik tab "Quant Screener" — pastikan scan RSI/momentum menyala dan hasil tabel realistis; klik tab "Volume Spike" — pastikan scan volume dan detail ticker berfungsi; pastikan filter yang sudah diisi TIDAK hilang setelah beberapa detik (indikasi bug tick-refresh benar-benar teratasi); pastikan sidebar tidak lagi punya entri "Volume Spike" terpisah, dan Quant Analysis tidak lagi punya sub-tab "Screener".
- Cache-bust: `06-analysis-router.js?v=20260919a`, `11-quant.js?v=20260919a`, `45-volume-spike.js?v=20260919a`, `48-unified-screener.js?v=20260919b`.

## 2026-09-19 — Audit validitas formula Unified Screener: `runUnifiedScreenerBacktest()` diam-diam memotong array `signals` ke 150 dari total real; hasil backtest 2 kali jalan menunjukkan "edge" formula bergantung pada 1-2 saham pencilan ekstrem

- **Konteks:** user meminta audit formula Whale/Uptrend Unified Screener untuk menemukan apakah formula ini "kuat", dimulai dengan menjalankan `GET /api/idx/unified-screener-backtest` (Track A) dua kali dari produksi (lookbackDays=45 lalu 90, forwardDays=20 keduanya) dan mengirim hasil JSON-nya untuk dianalisis.
- **Bug ditemukan (ditemukan LEWAT proses audit ini, bukan dilaporkan langsung oleh user):** baris `signals: signals.slice(0, 150)` di `runUnifiedScreenerBacktest()` (`lib/idx-data-engine.js`) memotong array detail sinyal ke 150 item TANPA komentar penjelasan atau disclosure ke caller — pada run kedua (`totalSignals: 216`), user mengirim file hasil export dua kali dengan cara berbeda dan KEDUANYA terpotong di titik yang sama persis (150/216), yang awalnya disangka bug penyimpanan/export tapi ternyata bug di endpoint itu sendiri. **PENTING:** field ringkasan (`winRate`, `avgReturnPct`, `avgAlphaPct`, `beatBenchmarkRate`) SELALU dihitung dari array `signals` LENGKAP sebelum dipotong — jadi angka-angka itu sendiri tidak pernah salah/fabricated, tapi menyembunyikan sebagian besar bukti pendukung di balik ringkasan yang terlihat benar adalah bentuk halus dari pelanggaran prinsip #3 CLAUDE.md (angka benar, presentasi menyesatkan karena bukti detailnya disembunyikan tanpa pemberitahuan).
- **Perbaikan:** `signals: signals.slice(0, 150)` → `signals` (array penuh dikembalikan). Ukuran respons tetap aman secara desain (`candidatesScanned` di-cap 80, `lookbackDays` di-cap 90 — total sinyal tidak bisa membengkak ke ukuran bermasalah).
- **Temuan substansi (analisis independen atas 2 hasil backtest, bukan bug kode — catatan analisis, bukan perbaikan):**
  - Run 1 (lookback 45, N=81 sinyal/37 ticker unik): `NICK` confirmed 6 hari berturut-turut (rally harga yang sama dihitung berulang karena forwardDays=20 tapi tanggal dicek harian → window saling tumpang tindih), menyumbang 62% dari total return mentah. `beatBenchmarkRate` cuma 46,2% (mayoritas sinyal KALAH dari IHSG) meski `avgAlphaPct` headline +5,99% terlihat meyakinkan.
  - Run 2 (lookback 90, N=216, 150 pertama diverifikasi manual): pola sama terulang lebih ekstrem — `ALKA` confirmed 4 hari berturut-turut dengan return 233%–265% per kemunculan (dikonfirmasi user via chart TradingView BUKAN artefak aksi korporasi, melainkan reli spekulatif organik/"gorengan" bertahap). Setelah `ALKA`+`EKAD` (outlier kedua, +158%) dikeluarkan dari 150 sinyal yang tersedia: `avgAlphaPct` berbalik dari +6,98% (dengan outlier) menjadi **−0,59%** (tanpa outlier); `beatBenchmarkRate` turun ke 36,8%.
  - **Kesimpulan sementara (disampaikan ke user di chat, bukan keputusan final):** klaim "formula whale+teknikal punya edge positif" pada kedua backtest ini seluruhnya bergantung pada 1-2 saham pencilan ekstrem per sampel — begitu dikeluarkan, alpha rata-rata hilang atau negatif. Win rate absolut yang terlihat tinggi (61-70%) sebagian besar mengikuti tren naik IHSG pada periode sampel (bukan bukti stock-picking), bukan alpha riil. Ini pola berulang (2 dari 2 backtest independen), bukan kebetulan satu kali — indikasi formula saat ini TIDAK punya edge yang konsisten di luar noise/outlier ekstrem, tapi masih perlu analisis lanjutan dengan N lebih besar/data lengkap sebelum diputuskan mengubah formula.
- **Test regresi (`test_suite.js`):** 1 test baru — cek `signals: signals.slice(` tidak muncul lagi di `runUnifiedScreenerBacktest()`. Dikonfirmasi FAIL tanpa fix (`git stash`), PASS dengan fix (227/227 lulus semua suite).
- **Verifikasi:** `node -c lib/idx-data-engine.js` sukses, `npm test` 227/227 lulus, `npm run lint` bersih.
- **Batasan yang tidak bisa diuji di sandbox ini:** egress ke `api.invezgo.com` diblokir kebijakan sandbox (dikonfirmasi via `agentproxy status`: `connect_rejected`, bukan API key user yang salah — key user dikonfirmasi masih aktif). Backtest riil dijalankan user sendiri dari produksi (`moneywatchapps.vercel.app`), bukan dari sandbox ini. Sinyal ke-151 s.d. 216 pada run kedua belum diverifikasi manual satu-satu (fix di atas sudah memastikan run berikutnya akan mengembalikan semuanya).

## 2026-09-19 — Analisis lanjutan formula Unified Screener (data 216/216 lengkap) + tambah mode `?variants=true` untuk uji 3 varian sekaligus

- **Konteks:** setelah fix pemotongan array di atas, user menjalankan ulang backtest `lookbackDays=90` dan mendapat 216/216 sinyal lengkap (bukan 150 terpotong lagi) — memungkinkan audit tuntas tanpa data hilang.
- **Analisis final (bukan bug kode, catatan analisis):** 4 cara potong data (mentah N=216, dedup-per-ticker N=56, mentah minus 4 saham mania N=196, dedup minus 4 saham mania N=52) semuanya menghasilkan **median alpha NEGATIF** (−0,69% s.d. −2,44%), termasuk versi mentah yang belum dibuang apa pun. Rata-rata alpha yang terlihat positif (+8,24% mentah) murni didorong oleh 4 dari 56 ticker unik (ALKA, EKAD, LIFE, NICK — semua reli spekulatif organik terverifikasi bukan artefak data) yang menyumbang 78,5% dari total return kelompok dedup. **Kesimpulan: formula Whale/Uptrend produksi saat ini tidak punya edge yang terbukti mengalahkan IHSG** — median sinyal tipikal kalah dari benchmark di semua kondisi yang diuji.
- **Tindak lanjut yang diminta user:** uji 3 varian parameter (dari temuan audit kode sebelumnya) untuk cari kemungkinan perbaikan, "dalam 1 perintah" (bukan 3 panggilan endpoint terpisah).
- **Perubahan (`lib/idx-data-engine.js`):** `runUnifiedScreenerBacktest()` di-refactor — bagian fetch data (Invezgo top-movers + histori Yahoo) dipisah dari bagian filter/scoring. Sekarang membangun `candidatePool` (semua kandidat sinyal per tanggal, TANPA filter threshold) yang menyimpan `whaleScoreFull`, `whaleScoreNoVolSpike` (varian tanpa bonus volume-spike+uptrend yang audit sebelumnya temukan dobel-hitung dengan `tech.score`), dan `techScore` mentah. Fungsi `summarize(pool, filterFn)` menghitung ringkasan (termasuk `medianReturnPct`/`medianAlphaPct` baru — median dipakai karena lebih tahan outlier ekstrem dibanding mean, sesuai temuan analisis di atas) dari pool yang sama untuk filter berbeda-beda, TANPA fetch ulang.
- **Fitur baru:** `?variants=true` pada `GET /api/idx/unified-screener-backtest` mengembalikan `{variants: {baseline, whale4, noDoubleCount, techScore80}}` — 4 hasil dari SATU fetch data (hemat kuota Invezgo, tidak perlu 4 panggilan terpisah). Tanpa param ini, behavior IDENTIK dengan sebelumnya (dibuktikan 227 test lama tetap pass tanpa modifikasi).
- **Preview awal (dihitung ulang dari data 216 sinyal yang SUDAH ada, 2 dari 3 varian bisa dihitung tanpa panggilan baru; `noDoubleCount` butuh field yang tidak tersimpan di data lama):**
  - `whale4` (whaleScore≥4): N turun ke 26, median alpha tetap negatif (−1,49%) — menaikkan ambang whale saja TIDAK memperbaiki kualitas.
  - `techScore80` (techScore≥80): N=101, median alpha **positif** (+1,02%), beat-benchmark-rate **57,0%** (>50%, pertama kalinya di seluruh analisis sesi ini) — kandidat paling menjanjikan sejauh ini, tapi baru dari data lama, belum dikonfirmasi lewat fetch baru.
- **Test regresi (`test_suite.js`):** 2 test baru — (1) source-check keempat varian (`baseline`/`whale4`/`noDoubleCount`/`techScore80`) dan `medianReturnPct`/`medianAlphaPct` ada di kode; (2) behavior-check mode `?variants=true` tetap honest-gated (available:false, tidak fabrikasi objek `variants`) saat `INVEZGO_API_KEY` tidak ada. Dikonfirmasi FAIL tanpa fix (`git stash`), PASS dengan fix (229/229 lulus semua suite).
- **Verifikasi:** `node -c` `lib/idx-data-engine.js` & `server.js` sukses, `npm test` 229/229 lulus, `npm run lint` bersih.
- **Belum diverifikasi:** hasil `noDoubleCount` dan konfirmasi ulang `whale4`/`techScore80` dari data FRESH (bukan reuse data lama) — user akan menjalankan `?variants=true` dari produksi dan mengirim hasilnya untuk audit lanjutan.

## 2026-09-19 — Formula Unified Screener diubah: ambang skor teknikal "confirmed" dinaikkan dari >=60 ke >=80 (hasil audit kekuatan formula)

- **Konteks:** user menjalankan `?variants=true` dari produksi (setelah 2 kali salah URL — pelajaran: pastikan instruksi benar dulu sebelum minta user jalankan manual). Hasil dengan data fresh (216 sinyal) mengonfirmasi 4 varian: `whale4` (median alpha −1,49%), `noDoubleCount` (−1,26%, hipotesis dobel-hitung TIDAK terbukti membantu meski secara logika kode benar), `techScore80` (**+1,02%**, beat-benchmark 57,0%) — satu-satunya yang positif.
- **Verifikasi tambahan sebelum mengubah formula produksi:** dicek apakah `techScore80` cuma "bagus" karena masih mengandung 4 saham mania (ALKA/NICK/EKAD/LIFE) yang mendominasi seluruh analisis minggu ini. Setelah keempatnya dibuang total dari 101 sinyal `techScore80` (N=95 tersisa): median alpha **tetap positif (+0,82%)**, beat-benchmark **54,3%**. Ini pertama kalinya sepanjang audit minggu ini ada varian yang bertahan tanpa bergantung pada outlier ekstrem — dasar yang cukup kuat untuk mengubah formula produksi (bukan cuma tool analisis).
- **Perubahan (`lib/idx-data-engine.js`):**
  - `generateUnifiedScreener()`: `confirmed = uptrendScore != null && uptrendScore >= 60 && whaleScore >= 3` → `confirmed = tech != null && tech.score >= 80 && whaleScore >= 3`. **Penting:** memakai `tech.score` (skor teknikal mentah 0-100, PERSIS metrik yang dibacktest), BUKAN `uptrendScore` (skor yang sudah dicampur bonus fundamental PER/ROE dan dikalikan 0.7) — audit sebelumnya (Temuan #1, minggu ini) menemukan dua skala ini BEDA: `uptrendScore>=80` matematis MUSTAHIL dicapai saham tanpa data fundamental real (karena `uptrendScore = tech.score*0.7 + bonus`, maks 100), yang akan mem-blokir total confirmed untuk saham di luar LQ45/IDX30. `uptrendScore` sendiri (dipakai untuk tampilan/sort/filter `minUptrend`) TIDAK diubah.
  - `runUnifiedScreenerBacktest()`: `baselineFilter` disinkronkan ke `techScore>=80` (mengikuti formula produksi baru) — supaya backtest berikutnya tidak diam-diam menguji formula lama (masalah yang sama seperti insiden pemotongan array minggu ini, dicegah proaktif). Varian `techScore80` di mode `?variants=true` diganti nama jadi `techScore60` (ambang LAMA, disimpan untuk referensi historis/perbandingan).
- **Perbaikan UI (`public/js/48-unified-screener.js`):** teks empty-state backtest "Whale≥3 + Uptrend≥60" → "Whale≥3 + Teknikal≥80".
- **Test regresi (`test_suite.js`):** 1 test baru — cek `confirmed` memakai `tech.score >= 80` (bukan `uptrendScore >= 60` yang lama), DAN `baselineFilter` backtest tetap sinkron ke `techScore >= 80` (mencegah drift formula-vs-backtest berulang). 1 test lama diperbaiki (assersi nama variant `techScore80`→`techScore60`). Dikonfirmasi FAIL tanpa fix (`git stash`), PASS dengan fix (230/230 lulus semua suite).
- **Verifikasi:** `node -c` `lib/idx-data-engine.js` & `public/js/48-unified-screener.js` sukses, `npm test` 230/230 lulus, `npm run lint` bersih.
- **Dampak yang diharapkan (belum bisa diverifikasi langsung dari sandbox ini):** jumlah saham "Uptrend + Akumulasi Terkonfirmasi" di halaman Screener akan BERKURANG (ambang lebih ketat) — ini disengaja (kualitas di atas kuantitas, sesuai bukti backtest). **User perlu verifikasi setelah deploy:** cek jumlah confirmed di Screener tidak jadi nol/nyaris nol (kalau iya, ambang mungkin terlalu ketat untuk kondisi pasar saat ini); jalankan `?variants=true` sekali lagi beberapa minggu ke depan untuk lihat apakah edge +0,82%/54,3% ini bertahan di luar sampel Juni-Agustus 2026 yang diuji.
- Cache-bust: `48-unified-screener.js?v=20260919c`.

## 2026-09-19 — Audit menu/navigasi & panggilan API berulang (permintaan user: sederhanakan agar tidak membingungkan — aplikasi fokus ke 3+1 pilar: Screener/Analisa/Autonomous Trading/Portofolio)

- **Konteks:** user meminta review kode menyeluruh untuk mengurangi menu berulang dan panggilan API berulang yang membingungkan, dengan visi 3 pilar inti (Screener, Analisa, Autonomous Trading untuk copy-trade yang win rate-nya dibandingkan dengan Screener) plus Manajemen Portofolio (untuk membandingkan gaya trading manual user vs Autonomous Trading). Inventarisasi lengkap dilakukan lewat subagent (7 grup sidebar, 50+ case router, 50+ page container, 40+ route API, 48 file `public/js/`) — hasil dipetakan ke 4 temuan, user memilih memprioritaskan 2 dari 4: (1) fix dead-code/hapus HTML sampah, (2) audit sumber data yang dihitung berulang.
- **Temuan #1 (bug nyata, diperbaiki) — `case 'crypto-technical'` muncul DUA KALI di switch `renderPage()`** (`public/js/06-analysis-router.js`): baris pertama (`cryptoTechSelectCoin()`) selalu match duluan, baris kedua (`initCryptoTechnicalSuite()`) TIDAK PERNAH tereksekusi — dead code murni akibat semantik switch-fallthrough JS. Dicek: `initCryptoTechnicalSuite()` di `36-crypto-technical.js` ternyata cuma alias `cryptoTechSelectCoin(state.symbol, false)` — case pertama sudah setara (malah lebih baik, baca dari input field). Case kedua dihapus.
- **Temuan #2 (cleanup, sebagian dibatalkan setelah dicek lebih lanjut) — halaman "hantu" dengan markup HTML statis penuh yang sudah tidak bisa diakses dari sidebar:**
  - `page-ranking` (Market Radar lama, ~35 baris) — **dihapus**. Dikonfirmasi 2x: (a) tidak ada tombol sidebar yang mengarah ke sana (dialihkan ke Unified Screener sejak konsolidasi sebelumnya), (b) ID-ID di dalamnya (`rk-body`/`rk-sum`/`rk-chart`/`rk-sort`/`rk-sig`) cuma dirujuk oleh `fsRenderRanking()` di `07-flowscan.js` yang juga sudah tidak terpanggil dari mana pun, (c) **tidak ada test regresi apa pun yang menjaga markup ini**.
  - `page-scanner` (Smart Money Screener 3-mode, ~80 baris) — **awalnya salah dihapus, lalu DIKEMBALIKAN** setelah `npm test` gagal: ternyata ada test regresi eksplisit (`'REGRESSION GUARD: Smart Money Screener consolidation — old duplicate entry points must not resurface'`, dari insiden 2026-09-17) yang menjaga fitur 3-mode ini (`fsSwitchScreenerMode`/`fsRenderBrokerFlowMode`/`fsRenderSectorHeatmapMode`) tetap ada — fitur ini REAL dan masih memakai data Invezgo asli (bukan simulasi), meski sama-sama tidak punya tombol sidebar langsung seperti `page-ranking`. Pelajaran: "terlihat unreachable dari sidebar" TIDAK SAMA DENGAN "aman dihapus" — harus dicek test coverage & fungsi JS pendukungnya dulu, bukan cuma jejak navigasi. `page-tradewave` juga awalnya mau dihapus (kosong) tapi dibatalkan karena ternyata sengaja dijadikan pola referensi baku ("sama seperti page-tradewave") yang dikutip di 2 file lain — bukan sampah.
- **Test regresi (`test_suite.js`):** 1 test baru — cek exactly 1 `case 'crypto-technical'` di router, `page-ranking` sudah tidak ada, DAN `page-scanner` MASIH ADA (tripwire kebalikan, supaya kesalahan yang sama tidak terulang kalau ada yang "membersihkan" page-scanner lagi di masa depan tanpa cek dulu). Dikonfirmasi FAIL tanpa fix (`git stash`), PASS dengan fix (231/231 lulus semua suite).
- **Verifikasi:** `node -c` `06-analysis-router.js` sukses, `npm test` 231/231 lulus, `npm run lint` bersih.
- **Temuan #4 (konsolidasi menu Analisa jadi 1 halaman bertab) dan audit Autonomous Trading Engine — TIDAK dipilih user untuk dikerjakan sesi ini, dicatat sebagai potensi kerja lanjutan.**

## 2026-09-19 — Temuan #3: audit `fsGenData()` menemukan 2 bug fabrikasi data baru sekelas insiden DEWA + 1 bug "angka presisi tapi karangan"

- **Konteks:** lanjutan audit menu/data dari entry sebelumnya. Reframing: setelah dicek, "banyak modul minta data yang sama" (regime/accumulation-distribution/broker-summary dipanggil dari 3-4 file berbeda) TERNYATA aman — semuanya lewat endpoint `/api/idx/*` yang di-cache server (`getOrFetch`), jadi modul berbeda dalam window cache yang sama dapat data identik. Risiko nyata bukan di situ, tapi di pola bug yang sudah 1x ditemukan minggu ini (DEWA): modul yang jatuh ke `fsGenData()`'s fallback sintetis TANPA mengecek flag `.simulated`. Diaudit via subagent: 15 titik panggilan `fsGenData()` di 10 file, 8 di antaranya belum pernah dicek satu-satu sebelumnya.
- **Hasil audit (subagent, dikonfirmasi manual sebelum eksekusi):**
  - 5 titik AMAN (lewat `fsRenderWlPage()`'s `isSim`+`fsSrcDot()` badge, atau pre-guard `rdGetAny().length>=25` di `26-commandcenter.js`, atau banner dari fungsi pemanggil di `41-stockchat-cockpit.js`).
  - **2 titik BERISIKO nyata (diperbaiki):**
    1. `fsRunScanner()` (`07-flowscan.js`, "Smart Money Scanner"/Scanner mode di halaman `page-scanner`) — merender "Ditemukan N emiten **TERVERIFIKASI**" + CMF/VR/Skor presisi per kartu TANPA mengecek `r.data.simulated` sama sekali. Beda dari `fsRenderRanking()`/`fsRenderHeatmap()` (fungsi bertetangga di file yang sama) yang SUDAH punya guard ini — celah konsistensi, bukan kelalaian menyeluruh.
    2. `techRenderMainChart()` (`24-stockmaster.js`, chart harga native Tab Technical) — merender header "Rp X.XXX" + badge "+X.XX%" dari `fsGenData()` tanpa cek `.simulated` SAMA SEKALI, DAN kalau `fsGenData()` balik array kosong, ada fallback KEDUA (`Math.sin()` local) yang juga tidak diberi label.
  - **1 titik bug independen ditemukan sekalian (bukan dari daftar audit, ditemukan agent saat membaca konteks) — pelanggaran CLAUDE.md #3 murni:** `mountBandarmologySmartMoneyCharts()` (`41-stockchat-cockpit.js`) punya fallback CMF **hardcoded pola bergantian `15.4`/`-8.2`** kalau `fsProcess()` gagal menghitung CMF real — angka presisi yang terlihat seperti hasil hitungan riil padahal konstanta tetap, dipakai tanpa syarat kapan pun histori terlalu pendek. Chart "Arus Net Dana Asing Harian" di file yang sama juga ditemukan 100% proxy (`buyVol = d.up ? d.v*0.65 : d.v*0.35` — split volume berdasarkan arah harga, BUKAN data asing riil), sementara aplikasi ini memang tidak punya feed foreign-flow harian per-ticker (cuma agregat whole-market) — judulnya menyiratkan data asing riil padahal murni estimasi.
- **Perbaikan:**
  - `07-flowscan.js`: `fsRunScanner()` sekarang cek `isSim` per kartu + `fsSrcDot()` badge (pola sama seperti sibling), teks "emiten terverifikasi" diganti "emiten yang memenuhi kriteria" (kata "terverifikasi" salah kalau datanya bisa sintetis).
  - `24-stockmaster.js`: `techRenderMainChart()` sekarang lacak `isSimChart` untuk KEDUA lapis fabrikasi (fallback `fsGenData()` DAN fallback lokal `Math.sin()`), tampilkan banner jujur "⚠️ SIMULASI — belum ada histori harga riil ter-cache", dan self-heal via `rdEnsure()` (pola sama seperti fix DEWA minggu lalu) supaya otomatis re-render begitu data real tersedia.
  - `41-stockchat-cockpit.js`: fallback CMF hardcoded 15.4/-8.2 diganti `null` (Chart.js render celah kosong, bukan angka karangan), badge chart CMF berubah jadi "DATA TIDAK CUKUP" saat fallback. Judul chart "Arus Net Dana Asing Harian" → "Estimasi Arus Dana (Proxy Volume)", badge "JUTA LEMBAR" → "ESTIMASI, BUKAN DATA ASING RIIL".
- **Test regresi (`test_suite.js`):** 1 test baru mencakup ketiga perbaikan sekaligus. Sempat 1 kali gagal karena bug regex sendiri (komentar penjelasan fix mengutip teks lama "emiten TERVERIFIKASI" sebagai dokumentasi, ketangkap regex case-insensitive-nya sendiri — pola yang sama persis dengan insiden test KSEI minggu lalu; diperbaiki dengan strip baris komentar sebelum cek, konsisten dengan pola yang sudah mapan). Dikonfirmasi FAIL tanpa fix (`git stash`), PASS dengan fix (232/232 lulus semua suite).
- **Verifikasi:** `node -c` ketiga file sukses, `npm test` 232/232 lulus, `npm run lint` bersih.
- **Batasan yang tidak bisa diuji di sandbox ini:** kondisi pemicu (ticker tanpa histori ter-cache) butuh state runtime nyata (cache kosong) yang sulit direproduksi persis dari sandbox tanpa akses Yahoo/Invezgo. **User perlu verifikasi setelah deploy:** buka Scanner mode di halaman Screener untuk ticker yang jarang dibuka, pastikan badge ● (real)/○ SIM muncul di kartu hasil; buka Technical → chart native untuk ticker yang sama, pastikan banner simulasi muncul kalau data belum ter-cache dan hilang otomatis setelah beberapa detik (self-heal); buka Bandarmologi Smart Money Flow, pastikan chart "Estimasi Arus Dana" jelas berlabel estimasi bukan data asing riil.
- Cache-bust: `07-flowscan.js?v=20260919a`, `24-stockmaster.js?v=20260919b`, `41-stockchat-cockpit.js?v=20260919a`.

## 2026-09-19 — "Eksekusi no 1": konsolidasi Technical + Bandarmology (mode saham) jadi 1 tab, sisa dari audit menu/Analisa

- **Konteks:** lanjutan roadmap 3+1 pilar (Screener/Analisa/Autonomous Trading/Portofolio). Sebelum eksekusi, user secara eksplisit minta analisis dulu ("Untuk temuan 4 anda analisa dulu fiturnya; karena fungsi yang berbeda beda, menurut anda mana yang bisa digabungkan untuk jadi analisa?") atas 9 kandidat fitur "Analisa" (Technical, Bandarmology, Fundamental, Valuation/Harga Wajar, Stock Dossier, Stock Intel, Sector Insight, Watchlist, Market Regime). Hasil analisis: Technical (tab FlowScan) dan Bandarmology mode saham ("ANALISIS FULL EMITEN") ternyata memanggil fungsi IDENTIK (`fsGenData()`+`fsProcess()`) untuk ticker yang sama — bukan cuma topik mirip, tapi komputasi yang sama persis dijalankan dan ditampilkan di 2 halaman berbeda. User memilih eksekusi rekomendasi #1 ("Eksekusi no 1").
- **Perubahan:**
  - `public/index.html`: subseksi baru "A2. Bandarmology — CMF, VWAP Bands & Foreign Flow" ditambahkan di halaman Technical (`page-technical`), berisi container `#tech-bandar-content` yang diisi penuh via JS. Tombol sidebar Bandarmology diubah dari `goBandarmology('stock',this)` → `goBandarmology('market',this)` (mode saham sudah pindah ke Technical).
  - `public/js/24-stockmaster.js`: fungsi baru `techRunBandarmologyTab(ticker)` — memanggil ULANG `renderBandarmologySmartMoneyFlowView()`/`renderBandarmologyForeignFlowView()`/`bandarLoadRealForeignFlow()` yang sudah ada di `41-stockchat-cockpit.js` (bukan reimplementasi), dipasang ke `#tech-bandar-content`. Dipanggil dari `techSwitchTab()` bersamaan dengan `techRunFlowScanTab()` saat tab 2 (FlowScan) dibuka.
  - `public/js/41-stockchat-cockpit.js`: `renderBandarmologyCockpitPage()` disederhanakan jadi HANYA render mode market (macro IHSG/Big Banks/Sektoral Heatmap/Accum-Distrib Radar/Broker Trail) — cabang mode saham (toolbar 2-mode, tombol fokus-emiten, tabel broker flow, VWAP/CMF/foreign-flow per-ticker) dihapus total. `goBandarmology()` diubah jadi satu titik redirect: argumen `'stock'`/`'emiten'`/`'smart-money-flow'` sekarang mengarahkan ke halaman Technical (`goPage('technical', btn)` + `TECH_DATA.activeTab=2`) alih-alih merender Bandarmology mode saham — ini otomatis memperbaiki SEMUA pemanggil lama (sidebar, `07-flowscan.js` baris tombol "Analisa {ticker}", `27-stockintel.js` tombol "Buka Bandarmology", router `case 'flowscan'`) tanpa perlu mengubah tiap call site, karena semuanya sudah memanggil `selectStockChatTicker(tk)` (yang mempublikasikan ke `GLOBAL_STOCK_CONTEXT`) sebelum memanggil `goBandarmology()`. `setBandarmologyMode()`/`setBandarmologyTab()` disederhanakan jadi delegasi tipis ke `goBandarmology()` untuk nama mode-saham, dan tetap merender ulang untuk nama mode-market.
  - `public/js/27-stockintel.js`: label tombol handoff "Buka Bandarmology →" diubah jadi "Buka Analisis Bandarmology (Technical) →" supaya tidak menyesatkan user (tombol sekarang membuka Technical, bukan halaman Bandarmology).
- **Bonus temuan yang ikut terselesaikan (bukan tujuan awal, ditemukan saat investigasi):** id DOM `stockchat-flow-tab-content` sebelumnya dipakai di 2 tempat berbeda (tab Broker Flow StockChat, DAN Bandarmology mode saham) — karena SPA ini tidak pernah menghancurkan container halaman tersembunyi (cuma toggle class `.on`), ini risiko duplikat-ID nyata begitu kedua halaman pernah dikunjungi dalam satu sesi. Setelah cabang mode-saham Bandarmology dihapus total (bukan direlokasi dengan id yang sama), id ini sekarang HANYA dibuat di 1 tempat (tab StockChat) — risiko duplikat-ID hilang sebagai efek samping konsolidasi, bukan diperbaiki terpisah.
- **Keputusan desain (bukan bug, dicatat untuk konteks):** tabel Top 5 Buyer/Seller broker (`loadAndRenderBrokerFlowTab()`, id `stockchat-flow-tab-content`) SENGAJA TIDAK direlokasi ke Technical — fungsi itu + 3 fungsi sibling-nya (sort/filter/limit) hardcode id kontainer tersebut, dan merelokasinya akan butuh parameterisasi 4 fungsi sekaligus (perubahan lebih besar dari yang diminta). Sebagai gantinya, konten yang direlokasi hanya CMF/VWAP Bands/Volume Surge cards + 4 chart + Foreign Flow whole-market (semuanya sudah pakai id unik, aman direlokasi tanpa perubahan tambahan) — tabel broker top-buyer/seller tetap bisa diakses lewat tab Broker Flow StockChat yang sudah berfungsi (tidak diduplikasi).
- **Test regresi (`test_suite.js`):** 1 test lama (`TEST 58`, cek scroll-to `#bandarSmartMoneyChart` untuk deep-link `smart-money-flow`) diperbarui — premisnya usang setelah refactor ini (deep-link sekarang pindah halaman ke Technical, bukan scroll dalam halaman Bandarmology). 1 test baru ditambahkan: cek `goBandarmology()` redirect ke Technical untuk nama mode-saham, cek `isStockMode` sudah tidak ada lagi di `41-stockchat-cockpit.js`, cek `renderBandarmologyCockpitPage()` tidak lagi membuat elemen `#stockchat-flow-tab-content` (mencegah risiko duplikat-ID kembali), cek `techRunBandarmologyTab()` ada dan memakai ulang fungsi Bandarmology yang sudah ada (bukan reimplementasi), cek `#tech-bandar-content` ada di `index.html`, cek tombol sidebar Bandarmology memakai `'market'` bukan `'stock'`. Dikonfirmasi FAIL tanpa fix (`git checkout` file produksi ke versi sebelum perubahan, test baru tetap dipakai) → PASS dengan fix (233/233 lulus semua suite).
- **Verifikasi:** `node -c` ketiga file JS + `index.html` sukses, `npm test` 233/233 lulus, `npm run lint` bersih.
- **Batasan yang tidak bisa diuji di sandbox ini (butuh browser nyata):** perilaku klik interaktif (navigasi sidebar Bandarmology ke mode market, tombol "Analisa {ticker}" dari Screener/Stock Intel yang mendarat di tab Bandarmology halaman Technical dengan ticker yang benar, self-mounting 4 chart Chart.js di tab baru) belum diverifikasi lewat Playwright — hanya diverifikasi lewat pembacaan kode & regresi source-text. **User perlu verifikasi setelah deploy:** buka Technical untuk sembarang ticker, pastikan tab FlowScan sekarang juga menampilkan bagian "A2. Bandarmology" dengan CMF/VWAP/Foreign Flow terisi; klik tombol "Analisa {ticker}" dari Screener atau "Buka Analisis Bandarmology (Technical)" dari Stock Intel, pastikan mendarat di Technical (bukan Bandarmology) dengan ticker yang benar; buka Bandarmology dari sidebar, pastikan yang muncul cuma mode market (tanpa toolbar 2-mode lagi).
- Belum di-merge ke `main` — belum ada PR, sesuai pola sesi ini (merge hanya atas permintaan eksplisit user).
- Cache-bust: `24-stockmaster.js?v=20260919c`, `27-stockintel.js?v=20260919a`, `41-stockchat-cockpit.js?v=20260919b`.

## 2026-09-19 — "Eksekusi no 2": konsolidasi Fundamental + Valuation (Harga Wajar) jadi 1 halaman bertab

- **Konteks:** lanjutan roadmap konsolidasi menu Analisa (3+1 pilar). Rekomendasi #2 dari analisis sebelumnya: gabung Fundamental (Analisa Terpadu) dan Valuation/Harga Wajar (kalkulator manual) jadi 1 halaman, karena keduanya berada di bawah topik "valuasi" yang sama dan membingungkan sebagai 2 menu terpisah.
- **Perbedaan dengan "Eksekusi no 1" (penting, menentukan cara eksekusi):** Technical+Bandarmology (no 1) memanggil FUNGSI IDENTIK (`fsGenData()+fsProcess()`) untuk ticker yang sama — jadi cabang mode-saham Bandarmology dihapus total. Fundamental Tab 1 dan Harga Wajar TERNYATA fitur yang genuinely BERBEDA setelah dibaca kodenya: Tab 1 Fundamental menghitung valuasi (Graham/Lynch/DDM/MoS) dari SNAPSHOT data terkini (EPS/BVPS/ROE hasil fetch API, tidak bisa diedit user), sedangkan Harga Wajar adalah kalkulator manual dengan tabel multi-tahun yang bisa DIEDIT user (EPS/Equity/Shares/DPS/PER/Net Income per tahun) plus asumsi yang bisa diubah (Min Return %/thn, Proyeksi Tahun). Karena formula/inputnya beda (bukan reimplementasi yang sama), yang digabung HANYA tab/menu-nya (pola "relocate the tab, don't merge the formula", sama seperti TradeWave/Quant Screener/Volume Spike sebelumnya) — kode kalkulasi di `10-hargawajar.js` TIDAK disentuh/digabung ke formula Fundamental.
- **Perubahan:**
  - `public/index.html`: seluruh markup `<div id="page-hargawajar">` (sekitar 300 baris — form parameter, tabel data historis, chart trend EPS/PER & Equity/Net Income, kartu hasil MoS, komparasi 4 model valuasi, sensitivity matrix, histori analisa) dipindah UTUH jadi tab baru `#fund-tab-hw` di dalam `page-fundamental`, dengan nav button baru `fund-nav-4` ("Kalkulator Harga Wajar (Manual)"). Halaman `page-hargawajar` yang berdiri sendiri DIHAPUS (bukan disalin — cuma ada 1 salinan konten sekarang).
  - `public/js/06-analysis-router.js`: `goPage()` — nama `'hargawajar'` sekarang dialihkan ke container `'fundamental'` (pola sama seperti `UNIFIED_SCREENER_ALIASES` untuk ranking/scanner/tradewave/screener/volume-spike) — SEMUA pemanggil lama `goPage('hargawajar')` (sidebar "Valuation", handoff Stock Intel "Buka Kalkulator MoS", tombol Knowledge Guide, quick-link Wealth toolkit) tetap bekerja tanpa diubah satu-satu. Reset ke tab 4 (`fundSwitchTab(4)`) HANYA ditaruh di dalam `goPage()` (navigasi nyata), BUKAN di `renderPage()`'s `case 'hargawajar'` — pelajaran langsung dari insiden TradeWave/Unified Screener sebelumnya: `renderPage(currentPage)` juga dipanggil oleh tick refresh periodik `03-engine.js` tanpa lewat `goPage()`, jadi kalau reset tab ditaruh di situ, user yang sedang membaca tab lain di Fundamental akan diseret balik ke tab Harga Wajar setiap beberapa detik. `case 'hargawajar':` sendiri TIDAK diubah (tetap cuma `hw_init()`+`hw_recalc()`).
  - `public/js/24-stockmaster.js`: `fundSwitchTab()` diperluas menerima `idx===4` → aktifkan `#fund-tab-hw` + `#fund-nav-4`, nonaktifkan tab lain.
  - `public/js/10-hargawajar.js`: guard visibilitas di listener `GLOBAL_STOCK_CONTEXT` (dipakai untuk sinkron ticker lintas-modul, HANYA aktif kalau halaman Harga Wajar sedang benar-benar dilihat) diperbarui dari cek `document.getElementById('page-hargawajar')` (sudah tidak ada) jadi cek GANDA `page-fundamental` DAN `fund-tab-hw` — supaya sinkron ticker cuma jalan kalau tab Harga Wajar spesifik yang sedang dibuka, bukan sembarang tab Fundamental.
- **Tidak diubah (di luar cakupan, sudah rusak/dead sebelum sesi ini, bukan hasil perubahan ini):** `public/js/11-quant.js` baris 349 (`if(page === 'harga-wajar')` — beda ejaan, pakai strip, dan tidak ada satupun pemanggil `goPage('harga-wajar')` di seluruh app, hanya `'hargawajar'` tanpa strip) dan `public/js/00-config.js` baris 441 (`hwSelectTicker` — fungsi yang tidak pernah didefinisikan di mana pun, dijaga `typeof` sehingga selalu no-op). Keduanya pre-existing dead code, tidak terkait konsolidasi ini.
- **Test regresi (`test_suite.js`):** 1 test baru — cek `page-hargawajar` sudah tidak ada sebagai container halaman, `fund-tab-hw`/`fund-nav-4` ada, id-id elemen kalkulator asli (`hw-ticker-input`/`hw-data-body`/`hw-verdict-badge`) masih ada (memastikan relokasi tidak kehilangan konten), `goPage()` redirect `'hargawajar'`→`'fundamental'`, `case 'hargawajar'` TIDAK memanggil `fundSwitchTab` (mencegah regresi kelas TradeWave), `fundSwitchTab()` menangani `idx===4`, dan listener `10-hargawajar.js` cek `page-fundamental`+`fund-tab-hw` (bukan `page-hargawajar` lagi). Dikonfirmasi FAIL tanpa fix (`git checkout` ke versi sebelum perubahan) → PASS dengan fix (234/234 lulus semua suite).
- **Verifikasi:** `node -c` keempat file (`index.html`, `06-analysis-router.js`, `24-stockmaster.js`, `10-hargawajar.js`) sukses, `npm test` 234/234 lulus, `npm run lint` bersih.
- **Batasan yang tidak bisa diuji di sandbox ini (butuh browser nyata):** perilaku klik interaktif (nav "Valuation" di sidebar mendarat di tab 4 Fundamental dengan ticker yang benar, tombol "Hitung Otomatis"/"Reset"/"Simpan" masih berfungsi di lokasi baru, chart Trend Historis EPS/PER & Equity/Net Income ter-render, sinkron ticker lintas-modul ke tab Harga Wajar spesifik). **User perlu verifikasi setelah deploy:** klik "Valuation" di sidebar, pastikan mendarat di halaman Fundamental dengan tab "Kalkulator Harga Wajar (Manual)" aktif dan data terisi; buka Stock Intel, klik "Buka Kalkulator MoS →" untuk suatu ticker, pastikan mendarat di tab yang sama dengan ticker yang benar; buka tab lain di Fundamental (Analisa Terpadu/Bull-Bear/KSEI) dan tunggu beberapa detik, pastikan TIDAK diseret balik ke tab Harga Wajar oleh refresh otomatis.
- Belum di-merge ke `main` — belum ada PR, sesuai pola sesi ini.
- Cache-bust: `06-analysis-router.js?v=20260919b`, `10-hargawajar.js?v=20260919a`, `24-stockmaster.js?v=20260919d`.

## 2026-09-19 — Hapus duplikat menu Valuation/Fundamental + investigasi kenapa Riwayat Sinyal AI kosong

- **Permintaan user:** "hapus sidebar valueation double dengan fundamtenal kalkulator harga saham manual cek dulu kebenaran nya, dan cek toolbar signal history kenapa belum ada history yang muncul".

### Bagian 1 — Duplikat menu Valuation/Fundamental (dikonfirmasi & diperbaiki)

- **Verifikasi dulu sebelum menghapus (sesuai permintaan user):** dicek `public/index.html` — sidebar punya 2 tombol terpisah: "Fundamental" (`goPage('fundamental')`) dan "Valuation" (`goPage('hargawajar')`). Sejak "Eksekusi no 2" (entry INCIDENT_LOG.md sebelumnya, 2026-09-19), `goPage('hargawajar')` sudah dialihkan ke container `'fundamental'` yang sama + auto-switch ke tab "Kalkulator Harga Wajar (Manual)" (`fund-tab-hw`/`fund-nav-4`). **Dikonfirmasi BENAR**: klik "Fundamental" dan klik "Valuation" mendarat di HALAMAN YANG SAMA PERSIS (`page-fundamental`), cuma beda tab awal yang aktif — 2 entry sidebar terpisah untuk 1 halaman adalah duplikat menu murni, persis seperti yang user curigai.
- **Ditemukan sekalian (bukan diminta, duplikat sejenis) — command palette (Ctrl+K search, `29-institutional-ui.js`)** juga punya 2 entry terpisah `id: 'fundamental'` dan `id: 'hargawajar'` di daftar "Modul & Halaman Aplikasi" — persis masalah yang sama, diperbaiki sekalian karena trivial dan konsisten dengan tujuan awal sesi ("agar tidak ada menu berulang").
- **Perbaikan:**
  - `public/index.html`: tombol sidebar "Valuation" DIHAPUS. `goPage('hargawajar')` SENDIRI **tidak dihapus** — tetap dipakai oleh handoff dari Stock Intel ("Buka Analisis Bandarmology..."), Knowledge Guide, dan quick-link Wealth toolkit; hanya entry sidebar-nya yang dihapus.
  - `public/js/29-institutional-ui.js`: entry `{ id: 'hargawajar', ... }` dihapus dari daftar `pages`, deskripsi entry `fundamental` diperluas menyebut "Kalkulator Harga Wajar (Graham/Lynch/DDM/MoS)" supaya tetap ketemu lewat pencarian.
- **Test regresi:** 1 test baru — cek tombol sidebar "Valuation" sudah tidak ada, tombol "Fundamental" TIDAK ikut terhapus, `goPage('hargawajar')` masih redirect ke `'fundamental'` (memastikan penghapusan tombol sidebar tidak merusak deep-link caller lain), entry command palette `hargawajar` sudah tidak ada tapi `fundamental` masih ada. Dikonfirmasi FAIL tanpa fix (`git checkout` ke versi sebelum perubahan) → PASS dengan fix (235/235 lulus semua suite).

### Bagian 2 — Kenapa "Riwayat Sinyal AI" (Signal History) kosong (diinvestigasi, 1 bug ambiguitas ditemukan & diperbaiki, sisanya butuh verifikasi manual user)

- **Cara kerjanya (dibaca dari kode):** `ai_signal_log` (Supabase, dibaca `47-ai-signal-history.js`) HANYA diisi lewat `logAiSignalToReflectionLog()` (`00-config.js`), yang HANYA dipanggil setelah StockChat/Copilot menerima balasan SUKSES dari server (`/api/ai/agent-chat`) yang toolCalls-nya memuat pemanggilan tool `cek_sinyal_teknikal` dengan hasil sinyal valid (bukan "NO DATA"/error). Baris ini TIDAK PERNAH tercatat kalau salah satu dari beberapa syarat berikut gagal:
  1. User harus login (bukan Mode Tamu/Demo) — halaman sudah menampilkan pesan berbeda untuk kondisi ini.
  2. Tabel `ai_signal_log` harus sudah ada di project Supabase yang tersambung (migrasi `sql/schema_migration.sql` harus dijalankan manual sekali lewat Supabase SQL Editor — **insiden lama yang sudah didokumentasikan di kode ini sendiri**, bukan bug baru).
  3. **Server AI harus benar-benar live** (`ANTHROPIC_API_KEY` terkonfigurasi di Vercel) — kalau tidak, StockChat/Copilot DIAM-DIAM jatuh ke "Client-Side Institutional AI Reasoning Engine" (mesin fallback lokal, lihat comment di `41-stockchat-cockpit.js`/`28-decisiontools.js`) yang TIDAK PERNAH memanggil tool terstruktur apa pun — jadi `ai_signal_log` tidak akan pernah terisi selama fallback ini yang jalan, TANPA pesan error apa pun yang mengarah ke akar masalah ini (indikator "AI Engine Live" di toolbar bawah adalah satu-satunya petunjuk).
  4. User harus benar-benar bertanya sinyal/rekomendasi teknikal untuk SATU ticker spesifik ke StockChat/Copilot (bukan chat umum).
- **Bug nyata ditemukan (diperbaiki) — ambiguitas system prompt:** `SYSTEM_INSTRUCTION_MONEYWATCH_AI` (`server.js`) Aturan #10 (`cek_prediksi_xgboost`) dan Aturan #11 (`cek_sinyal_teknikal`) SAMA-SAMA memakai kata pemicu "sinyal"/"rekomendasi" untuk ticker spesifik — dua tool yang BEDA fungsinya (prediksi ML eksperimental vs sinyal teknikal terstruktur yang SATU-SATUNYA jalur pengisian `ai_signal_log`) bisa dipicu kalimat yang IDENTIK ("sinyal BBCA", "rekomendasi ANTM"). Kalau AI konsisten memilih `cek_prediksi_xgboost` untuk pertanyaan sinyal biasa (tool ini TIDAK mencatat ke `ai_signal_log` sama sekali), halaman Riwayat Sinyal AI akan tetap kosong selamanya berapa pun kali user bertanya — tanpa ada error apa pun yang mengungkap sebabnya, persis gejala yang dilaporkan user.
- **Perbaikan (`server.js`):** Aturan #10 diperjelas HANYA berlaku kalau user secara eksplisit menyebut model/AI/machine learning/XGBoost; Aturan #11 dinyatakan eksplisit sebagai DEFAULT untuk permintaan sinyal/rekomendasi teknikal biasa tanpa penyebutan model. Menghilangkan tumpang-tindih pemicu tanpa mengubah logika kedua tool itu sendiri.
- **Test regresi:** 1 test baru (source-text check pada `SYSTEM_INSTRUCTION_MONEYWATCH_AI`) — **catatan jujur**: perilaku pemilihan tool oleh Claude tidak bisa diuji otomatis dari sandbox ini (butuh panggilan API Claude riil, sandbox ini tanpa akses jaringan ke Anthropic) — test ini cuma menjaga teks instruksi disambiguasi tidak hilang lagi, bukan bukti behavioral bahwa AI akan selalu memilih tool yang benar. Dikonfirmasi FAIL tanpa fix (`git checkout` ke versi sebelum perubahan) → PASS dengan fix (236/236 lulus semua suite).
- **Verifikasi:** `node -c` semua file sukses, `npm test` 236/236 lulus, `npm run lint` bersih.
- **[Low confidence] soal apakah ambiguitas prompt ini benar-benar penyebab TUNGGAL kasus user** — ada 3 kemungkinan penyebab LAIN yang sama-sama valid dan TIDAK bisa dikonfirmasi/disangkal dari sandbox ini (butuh akses ke akun/deployment production user):
  - **User perlu cek sendiri setelah deploy:**
    1. Buka halaman "Signal History" — kalau muncul pesan "Fitur ini butuh akun (login)", user sedang di Mode Tamu (perlu login).
    2. Kalau muncul pesan merah "⚠️ Tabel ai_signal_log belum ada di database Supabase" — migrasi `sql/schema_migration.sql` belum dijalankan di Supabase project yang dipakai (jalankan manual sekali lewat Supabase SQL Editor).
    3. Cek indikator "AI Engine Live" di toolbar bawah aplikasi — kalau menunjukkan status Fallback/Offline (bukan Live), berarti `ANTHROPIC_API_KEY` belum terkonfigurasi di Vercel project settings, dan StockChat/Copilot selama ini berjalan di mesin fallback lokal yang TIDAK PERNAH mencatat sinyal apa pun (ini kemungkinan penyebab paling besar kalau history sudah lama dipakai tapi tetap nol baris).
    4. Kalau ketiga hal di atas semua OK (login, tabel ada, AI Engine Live), coba tanya StockChat secara eksplisit "sinyal teknikal BBCA" atau "rekomendasi trading ANTM" (frasa yang jelas meminta sinyal untuk 1 ticker), lalu buka lagi halaman Signal History — kalau baris baru muncul, perbaikan Aturan #10/#11 di atas berhasil; kalau masih kosong, laporkan balik supaya diinvestigasi lebih lanjut (kemungkinan perlu logging tambahan di sisi client untuk melihat tool apa yang benar-benar dipanggil AI).
- Cache-bust: `29-institutional-ui.js?v=20260919a` (server.js tidak perlu cache-bust, bukan file statis yang di-serve ke browser).

## 2026-09-19 — Tambah OpenRouter sebagai backup provider AI + konfirmasi bug ambiguitas tool sinyal via reproduksi live

- **Konteks:** lanjutan investigasi "Riwayat Sinyal AI kosong". User menjalankan migrasi SQL `ai_signal_log` dengan sukses, lalu tes langsung StockChat dengan pesan **"sinyal teknikal BBCA"** — hasilnya AI memanggil `cek_prediksi_xgboost` (bukan `cek_sinyal_teknikal`), persis bug ambiguitas yang sudah diperbaiki di commit sebelumnya (`b7893c3`, entry INCIDENT_LOG.md tanggal sama). **Dikonfirmasi via reproduksi live bahwa fix itu BELUM ter-deploy** — commit `b7893c3` sudah di-push ke branch tapi belum di-merge ke `main` (jadi belum masuk deployment production Vercel). Bukti: teks respons AI ("Browser pengguna belum menjalankan inferensi XGBoost untuk pesan ini...") cocok persis dengan `executeAgentTool('cek_prediksi_xgboost')`'s pesan `hasData:false` di `server.js` — mengonfirmasi server-side Claude API benar-benar live (kredit sudah cukup) DAN benar-benar memilih tool yang salah untuk kalimat itu.
- **Permintaan user (fitur baru):** "untuk anthropic key bisakah di gabungkan dengan API [Open]router, supaya bisa saling backup" — supaya kalau Anthropic API bermasalah (kredit habis, rate-limit, outage), StockChat/Copilot punya jalur cadangan alih-alih langsung jatuh ke mesin fallback deterministik (rule-based) yang jauh lebih terbatas.
- **Desain:** OpenRouter (openrouter.ai) dipilih karena mem-proxy banyak model (termasuk Claude) lewat SATU endpoint bergaya OpenAI Chat Completions, dengan billing TERPISAH dari Anthropic Console — jadi genuinely berfungsi sebagai backup meski model default-nya tetap Claude (`anthropic/claude-3.5-sonnet` via OpenRouter), karena masalah kredit di satu sisi tidak ikut memblokir sisi lain. Bisa diarahkan ke model/vendor lain (mis. `openai/gpt-4o-mini`) lewat env var `OPENROUTER_MODEL` kalau user mau redundansi vendor yang benar-benar independen, bukan cuma independen billing.
- **Urutan provider di `/api/ai/agent-chat`** (sengaja BUKAN load-balancing paralel): **Anthropic langsung** (jalur utama, tetap dicoba dulu — biasanya lebih cepat, tidak lewat proxy tambahan) → **OpenRouter** (HANYA dicoba kalau Anthropic gagal DAN `OPENROUTER_API_KEY` dikonfigurasi) → **mesin deterministik** (jaring pengaman terakhir, tidak berubah). Kalau `OPENROUTER_API_KEY` tidak diset, perilaku 100% identik dengan sebelum fitur ini ada (dijaga test regresi).
- **Perubahan (`server.js`):**
  - `getOpenRouterConfig()` — baca `OPENROUTER_API_KEY`/`OPENROUTER_MODEL` dari env, `null` kalau tidak dikonfigurasi (pola sama seperti `getAiClient()` untuk Anthropic).
  - `convertAgentSchema()` — diekstrak dari isi `toClaudeTools()` lama jadi fungsi bersama (dulu duplikat isi konversi Gemini-style-schema → JSON Schema akan terjadi kalau ditulis 2x untuk Claude & OpenRouter secara terpisah).
  - `toOpenAiTools()` — konversi `AGENT_TOOL_DECLARATIONS` yang sama (dipakai juga oleh `CLAUDE_AGENT_TOOLS`) ke format tool-calling OpenAI/OpenRouter (`{type:'function', function:{name, parameters}}`) — SATU sumber deklarasi tool untuk kedua provider, bukan didefinisikan dua kali.
  - `callOpenRouterAgentLoop()` — loop agentic tool-calling sampai 5 langkah lewat endpoint OpenRouter, pola sama dengan loop Claude yang sudah ada tapi bentuk pesan tool-result beda (OpenAI: 1 pesan `role:'tool'` per `tool_call_id`, bukan 1 pesan user berisi banyak block seperti Claude) — makanya ditulis terpisah, bukan dipaksa berbagi kode dengan loop Claude. Memakai ulang `executeAgentTool()` yang sudah provider-agnostic (tidak diduplikasi).
  - `finalizeAgentChatResponse()` — diekstrak dari logika "pastikan reply tidak kosong + tambahkan disclaimer wajib + bentuk response JSON" yang sebelumnya cuma ada di jalur sukses Claude, sekarang dipakai ulang oleh jalur sukses OpenRouter juga (SATU sumber logika, bukan disalin).
  - `GET /api/ai/status` — tambah field `backupAvailable`/`backupModel` (status APA ADANYA, tidak memanggil OpenRouter sungguhan, sama seperti `available` untuk Anthropic) supaya toolbar bisa membedakan "OpenRouter backup terkonfigurasi" dari "tidak ada AI sama sekali".
  - Label `engine` di response sukses OpenRouter secara eksplisit `<model> via OpenRouter (backup)` — BUKAN diseragamkan dengan label Anthropic — supaya kalau ada masalah kualitas/biaya nanti, jelas dari response/log jalur mana yang sebenarnya menjawab (prinsip sama dengan indikator "AI Engine Live": status jujur, bukan diseragamkan).
- **Perubahan (`public/js/00-config.js`):** `checkAiEngineStatus()` (indikator toolbar bawah) sekarang punya state ketiga "AI Engine Backup (OpenRouter)" (kuning) untuk kasus Anthropic tidak dikonfigurasi tapi OpenRouter ada — sebelumnya cuma biner Live/Fallback, jadi kasus ini akan salah terlabel "Fallback" (menyiratkan mesin rule-based) padahal sebenarnya masih model AI sungguhan lewat OpenRouter.
- **Test regresi (`test_suite.js`):** 1 test baru mencakup: `getOpenRouterConfig()` null-safe kalau tidak dikonfigurasi + baca `OPENROUTER_MODEL` override dengan benar; `toOpenAiTools()`/`convertAgentSchema()` menghasilkan schema OpenAI yang valid (type lowercase, dibungkus `{type:'function',...}`); `callOpenRouterAgentLoop()` benar-benar menjalankan round-trip tool-calling (mock `fetch` 2 giliran: panggil tool → jawaban akhir) dan mengeksekusi tool via `executeAgentTool()` dengan argumen yang benar; urutan provider di route (Claude → OpenRouter → deterministik, tidak boleh tertukar); `GET /api/ai/status` melaporkan `backupAvailable`/`backupModel`. Dikonfirmasi FAIL tanpa fix (`git checkout` ke versi sebelum perubahan) → PASS dengan fix (237/237 lulus semua suite).
- **Verifikasi:** `node -c` kedua file sukses, `npm test` 237/237 lulus, `npm run lint` bersih.
- **Batasan yang tidak bisa diuji di sandbox ini:** panggilan OpenRouter sungguhan (sandbox tanpa akses jaringan ke openrouter.ai) — test di atas memvalidasi logika loop dengan `fetch` yang di-mock, bukan integrasi end-to-end nyata.
- **Langkah yang PERLU dilakukan user setelah deploy (di luar kendali kode ini):**
  1. Daftar akun di openrouter.ai, isi kredit, buat API key.
  2. Set env var `OPENROUTER_API_KEY` di Vercel project settings (opsional `OPENROUTER_MODEL` kalau mau model/vendor lain selain default `anthropic/claude-3.5-sonnet`).
  3. **Merge commit `b7893c3` (perbaikan ambiguitas prompt sinyal) ke `main` supaya ter-deploy** — bug ambiguitas yang dikonfirmasi lewat reproduksi live di atas MASIH ADA di production sampai ini di-merge, terlepas dari fitur OpenRouter di atas (backup provider tidak memperbaiki ambiguitas tool selection-nya sendiri, karena OpenRouter memakai system prompt yang SAMA).
- Belum di-merge ke `main` — belum ada PR untuk perubahan sesi ini, sesuai pola sesi ini.

## 2026-09-19 — Root cause SEBENARNYA ditemukan: "sinyal teknikal BBCA" tetap ke XGBoost meski prompt sudah diperbaiki

- **Konteks:** setelah commit `30c9dcd` di-merge ke `main` dan deploy dikonfirmasi sukses (Vercel "Ready" di Production), user tes ulang persis pesan yang sama ("sinyal teknikal BBCA") — hasilnya **identik dengan sebelum fix**: tetap menjawab "Prediksi Model XGBoost". Investigasi lanjutan menemukan fix sebelumnya (perbaikan narasi Aturan Perilaku #10/#11 di system prompt) TIDAK CUKUP karena 2 lapis lain yang lebih berpengaruh belum disentuh:
- **Root cause #1 (paling mungkin penyebab sebenarnya) — `description` TOOL ITU SENDIRI masih menyebut kata "sinyal":** `AGENT_TOOL_DECLARATIONS`'s `cek_prediksi_xgboost.description` (dikirim ke Claude sebagai bagian definisi tool, BUKAN cuma narasi bebas system prompt) masih berbunyi "...hasData:false berarti browser belum menjalankan model untuk ticker ini (**pengguna tidak sedang bertanya soal prediksi/sinyal**, atau model ONNX belum termuat)". Function-calling di Claude (dan model manapun) membaca description TOOL sebagai sinyal utama untuk memilih tool — jauh lebih berpengaruh daripada satu baris aturan perilaku di antara belasan aturan lain di system prompt. Kata "sinyal" di description tool inilah yang menetralkan perbaikan Aturan #10/#11 sebelumnya.
- **Root cause #2 (independen, kemungkinan penyebab kalau Claude/OpenRouter kebetulan gagal saat itu) — mesin fallback DETERMINISTIK server.js sama sekali tidak punya cabang `cek_sinyal_teknikal`:** `/api/ai/agent-chat` punya 3 lapis (Anthropic → OpenRouter → mesin deterministik rule-based). Mesin deterministik (dipakai kalau 2 lapis AI di atas gagal/tidak dikonfigurasi) TIDAK PERNAH membaca system prompt sama sekali — perbaikan Aturan #10/#11 kemarin TIDAK RELEVAN untuk jalur ini. Sebelum fix, satu regex gabungan `/\b(sinyal|prediksi|xgboost|rekomendasi|...)\b/i` SELALU memanggil `cek_prediksi_xgboost` untuk kata "sinyal" apa pun — tidak ada cabang alternatif ke `cek_sinyal_teknikal` sama sekali di jalur ini, beda dari jalur Claude yang setidaknya funya PILIHAN (walau salah pilih karena Root Cause #1).
- **Bonus temuan (ditemukan sambil investigasi, bug terpisah) — "Tool Executed: undefined" di UI StockChat SELALU muncul, untuk SEMUA tool, dari SEMUA jalur (Claude/OpenRouter/deterministik/client-fallback):** `41-stockchat-cockpit.js` merender `tc.toolName`, tapi field yang sebenarnya dikirim di SETIAP jalur (`executedTools.push({name, args, result})`, konsisten di server.js maupun client fallback) adalah `tc.name` — field `toolName` TIDAK PERNAH ada di mana pun di codebase ini. Akibatnya `renderBrokerSummaryWidget()` (widget kartu broker summary yang lebih rapi) JUGA tidak pernah dipakai untuk respons live manapun — selalu jatuh ke tampilan generik "Tool Executed: undefined".
- **Perbaikan:**
  - `server.js` (`AGENT_TOOL_DECLARATIONS`): description `cek_prediksi_xgboost` ditulis ulang — HANYA menyebut kata kunci model/AI/machine learning/XGBoost/ONNX, sama sekali tidak menyebut "sinyal"/"rekomendasi" lagi. Description `cek_sinyal_teknikal` ditandai eksplisit "DEFAULT untuk permintaan sinyal/rekomendasi/analisa teknikal biasa".
  - `server.js` (mesin fallback deterministik, `/api/ai/agent-chat`): regex gabungan lama dipecah jadi 2 branch dengan disambiguasi yang SAMA persis dengan tool declarations di atas — sebut model/AI/ML/XGBoost eksplisit → `cek_prediksi_xgboost` (existing); SELAIN itu (sinyal/prediksi/rekomendasi/analisa teknikal biasa) → **branch BARU** memanggil `cek_sinyal_teknikal(matchedTicker)`, membangun balasan lengkap (sinyal komposit, entry/SL/TP1/TP2, framing potensi-vs-risiko, track record sinyal sebelumnya kalau ada) — sebelumnya jalur ini TIDAK BISA mencapai `cek_sinyal_teknikal` sama sekali, sekarang satu-satunya jalur (selain Claude/OpenRouter) yang bisa mengisi `ai_signal_log`.
  - `public/js/41-stockchat-cockpit.js`: `tc.toolName` diganti `tc.name` (2 tempat) — memperbaiki tampilan "Tool Executed: undefined" DAN mengaktifkan `renderBrokerSummaryWidget()` yang selama ini mati untuk semua respons live.
- **Test regresi (`test_suite.js`):** 1 test lama diperbarui (posisi/keberadaan branch baru, bukan lagi mencari string regex gabungan lama yang sudah dipecah) + assersi baru bahwa branch `cek_sinyal_teknikal` benar-benar membangun balasan dari field asli (`signal`/`compositeScore`/`entry`/`sl`/`tp1`), bukan sekadar memanggil tool lalu jatuh ke jawaban generik. Dikonfirmasi FAIL tanpa fix (`git stash` file yang diubah) → PASS dengan fix (237/237 lulus semua suite). Perbaikan `tc.toolName`→`tc.name` belum ada test regresi otomatis terpisah (perubahan tampilan UI, sulit diuji tanpa Playwright/DOM nyata) — dicatat sebagai batasan.
- **Verifikasi:** `node -c` kedua file sukses, `npm test` 237/237 lulus, `npm run lint` bersih.
- **Pelajaran untuk sesi-sesi berikutnya:** kalau prompt-engineering (narasi bebas di system prompt) tidak berhasil mengarahkan pemilihan tool sesuai harapan, JANGAN berhenti di situ — cek juga (a) `description` masing-masing tool di definisi tool-nya sendiri (biasanya lebih berpengaruh untuk function-calling daripada satu baris di system prompt), dan (b) SEMUA jalur eksekusi yang mungkin menjawab pesan yang sama (di app ini ada 3: Claude, OpenRouter, DAN mesin deterministik rule-based) — perbaikan yang cuma menyentuh 1 dari 3 jalur akan terlihat "tidak berhasil" kalau kebetulan jalur lain yang menjawab.
- **Batasan yang tidak bisa diuji di sandbox ini:** perilaku tool-selection Claude/OpenRouter yang sesungguhnya (sandbox tanpa akses jaringan ke Anthropic/OpenRouter) — perbaikan description tool divalidasi lewat pembacaan kode & prinsip dokumentasi resmi Anthropic soal tool-use (description tool = sinyal utama pemilihan), bukan lewat pemanggilan API riil. **User perlu verifikasi setelah deploy:** ulangi tes "sinyal teknikal BBCA" di StockChat — kalau MASIH menjawab XGBoost, kemungkinan besar Claude/OpenRouter memang sedang gagal saat itu dan jalur deterministik yang menjawab (cek reply-nya: kalau formatnya "Sinyal Teknikal: BBCA" dengan compositeScore/entry/SL/TP, berarti jalur deterministik BARU sudah bekerja benar — beda kasus dari kalau masih "Prediksi Model XGBoost").
