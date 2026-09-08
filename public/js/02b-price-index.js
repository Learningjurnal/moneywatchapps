// ============================================================
// EQUITY-HISTORY REBUILD HELPERS — pure, DOM-free date/price
// utilities used by rebuildEquityHistoryFromTransactions()
// (03-engine.js) to walk a user's holding period day by day.
// ============================================================
// Both functions here are plain pure functions with no DOM/browser
// dependency, so they load as normal global scripts in the browser AND are
// requireable from Node (used by test_suite.js) via the CommonJS export
// guard at the bottom.

// Generate every calendar day from startStr to endStr (both inclusive,
// 'YYYY-MM-DD') as an array of date strings, parsed/incremented/formatted
// ENTIRELY in UTC (`...T00:00:00Z`, setUTCDate/getUTCDate, toISOString()).
//
// FIX: this replaces day generation that used to parse the date as LOCAL
// time (`new Date(dateStr + 'T00:00:00')`, no explicit UTC) but read it
// back via `.toISOString()` (UTC). For any positive-UTC-offset timezone —
// WIB/WITA/WIT, i.e. every Indonesian user's browser, this app's whole
// userbase — local midnight of a given date is that date MINUS ONE DAY in
// UTC, so the very first generated date silently came out one day earlier
// than `startStr`, and — since the total number of iterations stayed the
// same — the true last day (`endStr`, typically "today") silently never
// appeared at all: the entire generated range was uniformly shifted back
// by one day. That corrupted rebuildEquityHistoryFromTransactions() in two
// ways: (1) a phantom day before the real first transaction, with no
// holdings yet, so equity=0 — which flattened the "Kinerja Kumulatif vs
// IHSG" chart's Portfolio line at exactly 0% until a narrow defensive trim
// was added there; (2) "today" never matched, so the live-price branch
// (`dStr === todayStr`) never fired — the day meant to use a live quote
// silently fell back to historical/lastPrice data instead. Doing
// everything in UTC (parse with a 'Z' suffix, increment with
// setUTCDate/getUTCDate) removes the local-to-UTC round-trip entirely, so
// the generated sequence is immune to the running browser's timezone.
function generateUtcDateRange(startStr, endStr) {
  var out = [];
  if (!startStr || !endStr || startStr > endStr) return out;
  var cur = new Date(startStr + 'T00:00:00Z');
  var end = new Date(endStr + 'T00:00:00Z');
  while (cur <= end) {
    out.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}

// ── PRICE ADVANCER — O(1)-amortized "nearest prior trading day" lookup
// built from a sparse ascending {date, close} series (e.g. daily OHLCV
// from Yahoo Finance, which only has rows for trading days). ──
// Used by rebuildEquityHistoryFromTransactions() (03-engine.js) to look up
// a real market close for every calendar day of a user's holding period,
// including weekends/holidays (which forward-fill from the prior trading
// day's close — same "nearest prior trading day" contract already used by
// perfNearestIhsgClose(), 21-performance.js, just O(1) amortized instead of
// linear-scanned per lookup: a stateful forward-only pointer advanced once
// per call, instead of rescanning `rows` from the start on every one of
// `days × symbols` lookups — the difference between a multi-year,
// multi-symbol rebuild finishing instantly vs. tens of millions of
// comparisons on every Dashboard open).
//
// Deliberately does NOT independently regenerate the calendar-day sequence
// itself — it only ever consumes the date strings the CALLER's own
// day-by-day loop already produces (now generateUtcDateRange() above, the
// same canonical sequence both use), in the same order. Requires
// `next(dStr)` to be called with non-decreasing `dStr` values, which the
// caller's forward day-by-day loop always satisfies.

// Build an advancer for one price series. Returns a function `next(dStr)`
// that, called with non-decreasing 'YYYY-MM-DD' date strings, returns the
// real close as of that date (the most recent row with date <= dStr), or
// `null` if `dStr` predates the series' first real close — callers should
// treat `null` as "no real data yet" and fall back to their own logic
// (e.g. cost-basis/last-transaction price) rather than inventing a price
// that predates the instrument's known history.
function makePriceAdvancer(rows) {
  var clean = (rows || [])
    .filter(function (r) { return r && r.date && typeof r.close === 'number' && isFinite(r.close) && r.close > 0; })
    .slice()
    .sort(function (a, b) { return a.date < b.date ? -1 : (a.date > b.date ? 1 : 0); });

  var pointer = 0;
  var lastClose = null;

  return function next(dStr) {
    while (pointer < clean.length && clean[pointer].date <= dStr) {
      lastClose = clean[pointer].close;
      pointer++;
    }
    return lastClose;
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { makePriceAdvancer: makePriceAdvancer, generateUtcDateRange: generateUtcDateRange };
}
