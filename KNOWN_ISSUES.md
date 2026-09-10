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
