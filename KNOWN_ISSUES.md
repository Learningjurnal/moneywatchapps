# MoneyWatch Pro — Known Issues (not yet investigated/fixed)

Observed-but-deferred findings — distinct from `INCIDENT_LOG.md`, which is
only for incidents that have already been root-caused and fixed. An entry
here moves to `INCIDENT_LOG.md` once actually worked.

---

## #1 — ~~Crypto price fetch via `/api/proxy` appears to always fail for `*-IDR` pairs~~ FIXED, moved to `INCIDENT_LOG.md` #11

Confirmed root cause: `fhFetchCrypto()` fetched `CODE-IDR` directly —
Yahoo has no crypto→IDR pairs at all, so every call 404'd by
construction. Fixed to fetch `CODE-USD` (Yahoo's real symbol) and
convert with the live `usdIdr` rate. Full writeup: `INCIDENT_LOG.md` #11.

*(No other findings currently open in this file — #2/#3/#4 above are
also all fixed, see their own `INCIDENT_LOG.md` pointers. This file
stays for whatever's found next.)*

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
