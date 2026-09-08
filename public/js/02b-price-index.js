// ============================================================
// PRICE ADVANCER — O(1)-amortized "nearest prior trading day"
// lookup built from a sparse ascending {date, close} series
// (e.g. daily OHLCV from Yahoo Finance, which only has rows for
// trading days).
// ============================================================
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
// itself (e.g. by parsing/incrementing dates) — it only ever consumes the
// date strings the CALLER's own day-by-day loop already produces, in the
// same order. Building a second, separate date sequence here would risk
// silently drifting from the caller's (parse-as-local-midnight,
// format-via-toISOString) convention in any timezone with a positive UTC
// offset, causing every lookup to miss by one day. Requires `next(dStr)` to
// be called with non-decreasing `dStr` values, which the caller's forward
// day-by-day loop always satisfies.
//
// A plain pure function with no DOM/browser dependency, so it is loaded as
// a normal global script in the browser AND requireable from Node (used by
// test_suite.js) via the CommonJS export guard at the bottom.

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
  module.exports = { makePriceAdvancer: makePriceAdvancer };
}
