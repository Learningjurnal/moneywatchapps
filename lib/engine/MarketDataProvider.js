/**
 * lib/engine/MarketDataProvider.js — Provider Adapter -> NormalizedMarketData
 * layer of the Strategy Engine (spec: "StrategyEngine MUST NOT call Yahoo/
 * IDX/Broker APIs directly").
 *
 * Fetches the raw Invezgo data ONCE per ticker per pass and normalizes it
 * into a single flat object every indicator reads from — indicators never
 * fetch data themselves, so a batch scan never makes duplicate calls for
 * the same ticker.
 */

import { fetchInvezgoOrderBook, fetchInvezgoIntradayData } from '../invezgo-client.js';

/**
 * buildNormalizedMarketData(ticker, opts)
 *   opts.date              - YYYY-MM-DD, optional (default: latest/live)
 *   opts.includeNonRegular - fetch NG+TN intraday-data too (2 extra Invezgo
 *                            calls/ticker). Default false — caller opts in
 *                            only when HIGH_NON_REGULAR is actually needed
 *                            by the strategy being scored, to avoid paying
 *                            for calls no active strategy uses.
 *   opts.foreignRow        - pre-fetched {netValueRp, valueRp} for this
 *                            ticker from the day's /analysis/top/foreign
 *                            scan (the caller fetches that ONCE for the
 *                            whole batch, not per-ticker) — null if this
 *                            ticker did not appear in that day's top movers.
 */
async function buildNormalizedMarketData(ticker, opts = {}) {
  const { date = null, includeNonRegular = false, foreignRow = null } = opts;

  const [orderBookRes, intradayRgRes] = await Promise.all([
    fetchInvezgoOrderBook(ticker, 'RG', date, null),
    fetchInvezgoIntradayData(ticker, 'RG', date)
  ]);

  const normalized = {
    ticker,
    date,
    ohlc: null,
    volume: null,
    freq: null,
    orderBook: null,
    nonRegular: null,
    foreign: foreignRow ? { netValueRp: foreignRow.netValueRp, totalValueRp: foreignRow.valueRp } : null,
    dataErrors: []
  };

  if (orderBookRes.ok && !orderBookRes.suspended && orderBookRes.bid.length && orderBookRes.offer.length) {
    const b = orderBookRes.bid[0];
    const o = orderBookRes.offer[0];
    normalized.orderBook = {
      bid1price: Number(b.bid1price), bid1lot: Number(b.bid1lot), bid1freq: Number(b.bid1freq),
      offer1price: Number(o.offer1price), offer1lot: Number(o.offer1lot), offer1freq: Number(o.offer1freq)
    };
  } else if (!orderBookRes.ok) {
    normalized.dataErrors.push({ field: 'orderBook', reason: orderBookRes.reason });
  }

  if (intradayRgRes.ok && !intradayRgRes.suspended && intradayRgRes.data) {
    const d = intradayRgRes.data;
    normalized.ohlc = { open: Number(d.open), high: Number(d.high), low: Number(d.low), close: Number(d.close) };
    normalized.volume = Number(d.volume);
    normalized.freq = Number(d.freq);
  } else if (!intradayRgRes.ok) {
    normalized.dataErrors.push({ field: 'intradayRG', reason: intradayRgRes.reason });
  }

  if (includeNonRegular) {
    const [ngRes, tnRes] = await Promise.all([
      fetchInvezgoIntradayData(ticker, 'NG', date),
      fetchInvezgoIntradayData(ticker, 'TN', date)
    ]);
    const rgVolume = (intradayRgRes.ok && intradayRgRes.data) ? Number(intradayRgRes.data.volume) || 0 : null;
    const ngVolume = (ngRes.ok && ngRes.data) ? Number(ngRes.data.volume) || 0 : (ngRes.ok ? 0 : null);
    const tnVolume = (tnRes.ok && tnRes.data) ? Number(tnRes.data.volume) || 0 : (tnRes.ok ? 0 : null);
    if (rgVolume !== null && ngVolume !== null && tnVolume !== null) {
      normalized.nonRegular = { rgVolume, ngVolume, tnVolume };
    } else {
      normalized.dataErrors.push({ field: 'nonRegular', reason: 'RG/NG/TN intraday-data incomplete' });
    }
  }

  return normalized;
}

export { buildNormalizedMarketData };
