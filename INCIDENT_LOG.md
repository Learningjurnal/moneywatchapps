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
