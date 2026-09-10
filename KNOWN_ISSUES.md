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

## #4 — `renderBandarmologySmartMoneyFlowView()`'s CMF/VWAP/Volume Surge
are hardcoded literals, not computed from anything

- **Found:** 2026-09-10, while fixing #3 above (`INCIDENT_LOG.md` #7).
- **Evidence:** `public/js/41-stockchat-cockpit.js`'s
  `renderBandarmologySmartMoneyFlowView(tk)` (the per-ticker "Smart Money
  Flow & Volume Price Matrix" tab) sets `cmfVal = isUp ? 0.24 : -0.18;` —
  exactly one of two possible values, selected only by whether the
  ticker's price is up or down today, not computed from any OHLCV/volume
  data at all. `vwapSession`/`vwapUpper`/`vwapLower` are fixed percentage
  offsets off the current price (`price * (isUp ? 0.992 : 1.008)`, etc.),
  and `volSurge` is one of two fixed strings ("2.4x (Heavy Inflow)" /
  "1.8x (Distribution Outflow)"). None of this reads
  `generateClientSideBrokerSummary()`'s (simulated) volume either — it's
  independent of that function's fabrication, a separate hardcode.
- **Suspected impact:** the view's own badges — "ALGORITMA PENETRASI
  HARGA BEI", "CHART ENGINE (60 CANDLES)" — imply a real calculation
  against 60 candles of data; in reality CMF can only ever display as
  `+0.24` or `-0.18` for every ticker, every day, forever. A user reading
  this as a real Chaikin Money Flow reading would be misled regardless of
  which stock or day they check.
- **Status:** deferred — not fixed. A `bandarSimBanner()` disclosure was
  added as an interim measure (`INCIDENT_LOG.md` #7), but that only warns
  the number isn't real; it doesn't make the number real.
- **Next step when picked up:** `07-flowscan.js` already computes a real
  CMF from cached OHLCV (`fsCalcCMF()`, `rdGetAny()`) for the same
  tickers — replace this view's hardcoded `cmfVal`/`vwapSession` with a
  real call into that (or equivalent), falling back honestly (not to a
  fabricated number) when no cached OHLCV exists yet for the ticker, the
  same pattern used everywhere else `rdGetAny()` is the real-data source.
