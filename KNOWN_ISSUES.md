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

## #2 — ~~Market Heatmap / FS_RD-based Alerts can display fabricated signals with no "simulated" disclosure~~ FIXED, moved to `INCIDENT_LOG.md` #6

`fsGenData()`'s synthetic random-walk fallback (`07-flowscan.js`) is now
tagged `.simulated` and disclosed everywhere it's consumed (Ranking,
Heatmap, Alerts, Watchlist, single-ticker view). Full writeup, root
cause and verification: `INCIDENT_LOG.md` #6.

---

## #3 — ~~Bandarmology market-aggregate views compute institutional flow from a fabricated volume figure, no disclosure~~ FIXED, moved to `INCIDENT_LOG.md` #7

`generateClientSideBrokerSummary()`'s simulated volume is now disclosed
in the 5 Bandarmology views that previously showed it with no marker
(Foreign Flow, Accumulation, Distribution, Smart Money Radar, Broker
Trail) — Market Flow/Heatmap Scanner/1-Year Cost Matrix already had
disclosure before this session (a correction to the original finding is
in the incident writeup). Full writeup: `INCIDENT_LOG.md` #7. Surfaced a
new, separate issue in the process — see #4 below.

---

## #4 — ~~`renderBandarmologySmartMoneyFlowView()`'s CMF/VWAP/Volume Surge were hardcoded literals, not computed from anything~~ FIXED, moved to `INCIDENT_LOG.md` #8

The view's summary cards now reuse the same real `fsGenData()`/
`fsProcess()`/`fsCalcVWAP()`/`fsCalcVWAPStdDev()` computation its own
charts (`mountBandarmologySmartMoneyCharts()`, in the same file) already
used — CMF, VWAP bands and Volume Surge are real per-ticker values now,
not 2 hardcoded constants, and the disclosure banner is conditional on
`fsGenData()`'s own `.simulated` flag instead of always showing. Full
writeup, root cause and verification: `INCIDENT_LOG.md` #8.
