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
