/**
 * lib/providers/yahoo-client.js
 * Yahoo Finance provider adapter — session (crumb/cookie), real-time
 * quotes, fundamentals (quoteSummary), and daily OHLCV history. This
 * app's ONLY source of live IDX stock price/fundamental data.
 *
 * Extracted from lib/idx-data-engine.js during the provider-adapter
 * refactor — the Yahoo-specific half of that split; IDX/BEI website
 * data lives in lib/providers/idx-client.js, Invezgo in
 * lib/invezgo-client.js. idx-data-engine.js keeps the cross-provider
 * business logic (signal/confluence/hypothesis engine, backtest,
 * universe scans) and imports these functions back in — no behavior
 * change, byte-identical function bodies.
 *
 * getCachedFundamentalsOnly()/hasFundamentalsCacheEntry()/
 * getCachedFundamentalsBulk() are kept here too (rather than in the
 * engine file) because they read this file's Redis-backed fundamentals
 * cache directly (see the Redis helper block below) — module-private
 * state that only this file should touch. warmRadarFundamentals()/
 * warmRadarFundamentalsRotating() in idx-data-engine.js call these via
 * these exports instead of reaching into the cache from outside.
 *
 * CACHE_TTL_MS (30s quote freshness) is also exported — getIdxMarketSummary()
 * in idx-data-engine.js reuses the same value for its own cache TTL
 * (it aggregates Yahoo bellwether quotes), so it imports the constant
 * back rather than duplicating the literal 30000 in two files.
 */

import { loadBaseUniverse } from '../universe.js';
import { getBeiTickSize } from './idx-client.js';

// ── Redis (Upstash REST) — lazy singleton, self-contained fallback for the
// fundamentals cache. This mirrors the proven pattern in
// lib/invezgo-client.js (getRedis()/storeGet/storeSetEx) but is a SEPARATE,
// duplicated ~40-line helper rather than a shared refactor of that file —
// deliberate: invezgo-client.js's getOrFetch() is hard-coupled to Invezgo's
// quota system (reserveQuota()), and Yahoo fundamentals have no quota
// concept at all, so reusing it verbatim isn't possible without risking a
// regression in already-tested, production-proven Invezgo code. Reuses the
// SAME UPSTASH_REDIS_REST_URL/TOKEN env vars — one Upstash instance for the
// whole app, just a different key namespace (`yahoo:` prefix below).
//
// WHY THIS MATTERS (2026-09-18, user-requested): this app is a Vercel
// serverless function — an in-memory Map cache (what _fundamentalsCache
// used to be) doesn't survive cold starts and isn't shared across
// concurrent instances, so a cron job "warming" it would only ever warm
// the ONE instance that happened to run the cron invocation. Redis-backing
// it means every successful fetch (cron OR organic on-demand) benefits
// every instance from then on.
let _yfRedisCtor = null;
try {
  const upstash = await import('@upstash/redis');
  _yfRedisCtor = upstash.Redis;
} catch (_) {
  // @upstash/redis not installed/available; fallback to in-memory store below
}

let _yfMemoryStore = null;
let _yfWarnedNoRedis = false;

const _yfRedisClient = (_yfRedisCtor && process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN)
  ? new _yfRedisCtor({ url: process.env.UPSTASH_REDIS_REST_URL, token: process.env.UPSTASH_REDIS_REST_TOKEN })
  : null;

function getYahooRedis() {
  if (_yfRedisClient) return _yfRedisClient;
  if (!_yfWarnedNoRedis) {
    _yfWarnedNoRedis = true;
    console.warn('[yahoo-client] UPSTASH_REDIS_REST_URL/TOKEN tidak diset — fundamentals cache memakai in-memory fallback (TIDAK dibagi antar instance serverless/cold-start, TIDAK aman untuk cron warming production).');
  }
  if (!_yfMemoryStore) _yfMemoryStore = new Map();
  return null;
}

async function yfMemGet(key) {
  const rec = _yfMemoryStore.get(key);
  if (!rec) return null;
  if (rec.expiresAt && rec.expiresAt < Date.now()) { _yfMemoryStore.delete(key); return null; }
  return rec.value;
}
async function yfMemSet(key, value, ttlSec) {
  _yfMemoryStore.set(key, { value, expiresAt: ttlSec ? Date.now() + ttlSec * 1000 : null });
}

async function yfStoreGet(key) {
  const redis = getYahooRedis();
  if (redis) return redis.get(key);
  return yfMemGet(key);
}
async function yfStoreSetEx(key, value, ttlSec) {
  const redis = getYahooRedis();
  if (redis) return ttlSec ? redis.set(key, value, { ex: ttlSec }) : redis.set(key, value);
  return yfMemSet(key, value, ttlSec);
}
async function yfStoreMget(keys) {
  if (keys.length === 0) return [];
  const redis = getYahooRedis();
  if (redis) return redis.mget(...keys);
  return Promise.all(keys.map((k) => yfMemGet(k)));
}

// In-memory cache
const _quoteCache = new Map();
const CACHE_TTL_MS = 30000; // 30 seconds for live quotes

// Redis-backed cache for real fundamentals (EPS, BVPS, ROE, DER, etc.) —
// these don't change intraday like price does, so a long TTL is safe and
// cuts down on redundant Yahoo Finance calls. Was an in-memory Map until
// 2026-09-18 (user-requested: "cron warming" only helps if the cache
// survives cold starts and is shared across serverless instances — see
// the Redis helper block above for the full rationale).
const FUNDAMENTALS_CACHE_TTL_SEC = 24 * 60 * 60; // 24 jam — fundamental jarang berubah intraday
const FUNDAMENTALS_NEGATIVE_TTL_SEC = 10 * 60; // 10 menit — saham tanpa coverage Yahoo, dicoba ulang berkala
function _fundamentalsCacheKey(ticker) {
  return 'yahoo:fundamentals:' + ticker;
}

const YAHOO_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

// Yahoo Finance's quoteSummary/quote endpoints now require an authenticated
// session (a "crumb" token tied to a session cookie) — the v8 chart endpoint
// used for live prices stayed open, but fundamentals did not. This obtains
// and caches that cookie+crumb pair (valid for hours), refreshing only when
// it's missing, stale, or a request comes back 401.
let _yahooAuth = null; // { cookie, crumb, fetchedAt }
const YAHOO_AUTH_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

async function getYahooCrumb(forceRefresh) {
  const now = Date.now();
  if (!forceRefresh && _yahooAuth && (now - _yahooAuth.fetchedAt < YAHOO_AUTH_TTL_MS)) {
    return _yahooAuth;
  }

  // Step 1: hit fc.yahoo.com purely to receive a session cookie (the request
  // itself 404s — only the Set-Cookie header matters).
  const cookieResp = await fetch('https://fc.yahoo.com', {
    headers: { 'User-Agent': YAHOO_UA },
    redirect: 'manual'
  });
  const setCookie = cookieResp.headers.get('set-cookie') || '';
  const cookie = setCookie.split(';')[0];
  if (!cookie) throw new Error('Failed to obtain Yahoo session cookie');

  // Step 2: exchange the cookie for a crumb token.
  const crumbResp = await fetch('https://query2.finance.yahoo.com/v1/test/getcrumb', {
    headers: { 'User-Agent': YAHOO_UA, 'Cookie': cookie }
  });
  if (!crumbResp.ok) throw new Error(`getcrumb status ${crumbResp.status}`);
  const crumb = (await crumbResp.text()).trim();
  if (!crumb) throw new Error('Empty Yahoo crumb');

  _yahooAuth = { cookie, crumb, fetchedAt: now };
  return _yahooAuth;
}

// Fetch REAL fundamental ratios from Yahoo Finance's quoteSummary endpoint —
// same data family already used client-side by the Fundamental Suite
// (js/24-stockmaster.js), just fetched server-side (no CORS proxy needed,
// more reliable, shared across every feature that calls fetchYahooQuote()).
// Returns null (never fabricated numbers) if Yahoo has no coverage for this
// ticker — callers must fall back to an honest estimate/label in that case.
async function fetchYahooFundamentals(ticker) {
  const clean = String(ticker || '').toUpperCase().replace(/\.JK$/i, '').trim();
  const cacheKey = _fundamentalsCacheKey(clean);

  const cached = await yfStoreGet(cacheKey);
  if (cached) {
    return cached.data; // may itself be null (a cached "no coverage" miss)
  }

  const isIndex = clean.startsWith('^') || clean === 'JKSE';
  const ySymbol = isIndex ? clean : (clean + '.JK');
  const baseUrl = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(ySymbol)}?modules=financialData,defaultKeyStatistics,summaryDetail`;

  try {
    const fetchQuoteSummary = async (forceFreshAuth) => {
      const auth = await getYahooCrumb(forceFreshAuth);
      return fetch(`${baseUrl}&crumb=${encodeURIComponent(auth.crumb)}`, {
        headers: { 'User-Agent': YAHOO_UA, 'Cookie': auth.cookie, 'Accept': 'application/json' }
      });
    };

    let resp = await fetchQuoteSummary(false);
    if (resp.status === 401) {
      // Crumb likely expired/invalidated — refresh once and retry.
      resp = await fetchQuoteSummary(true);
    }
    if (!resp.ok) throw new Error(`Yahoo quoteSummary status ${resp.status}`);

    const data = await resp.json();
    const result = data?.quoteSummary?.result?.[0];
    if (!result) throw new Error('No quoteSummary result returned');

    const fin = result.financialData || {};
    const stats = result.defaultKeyStatistics || {};
    const detail = result.summaryDetail || {};

    const eps = stats.trailingEps?.raw;
    const bvps = stats.bookValue?.raw;
    const roe = fin.returnOnEquity?.raw;
    const roa = fin.returnOnAssets?.raw;
    const der = fin.debtToEquity?.raw;
    const npm = fin.profitMargins?.raw;
    const per = detail.trailingPE?.raw ?? stats.forwardPE?.raw;
    const pbv = stats.priceToBook?.raw;
    const divYield = detail.dividendYield?.raw;

    // Require at least EPS or BVPS to consider this "real coverage" —
    // Yahoo returns an empty/near-empty result object for many small/illiquid
    // IDX tickers rather than a 404, so we can't rely on HTTP status alone.
    if (eps == null && bvps == null) {
      throw new Error('Yahoo has no fundamentals coverage for this ticker');
    }

    // Sanity guard: some thinly-covered IDX tickers report a near-zero or
    // negative bookValue (data artifact, e.g. post reverse-split), which
    // blows up every ratio derived from it (PBV/ROE in the hundreds of
    // thousands of percent). Treat that as unreliable rather than surface
    // nonsense labeled "real data" — fall back to the honest estimate.
    if (bvps != null && Math.abs(bvps) < 1) {
      throw new Error(`Yahoo bookValue implausible for this ticker (${bvps})`);
    }

    const fundamentals = {
      eps: eps ?? null,
      bvps: bvps ?? null,
      per: per != null ? Math.round(per * 100) / 100 : null,
      pbv: pbv != null ? Math.round(pbv * 100) / 100 : null,
      roe: roe != null ? Math.round(roe * 10000) / 100 : null,
      roa: roa != null ? Math.round(roa * 10000) / 100 : null,
      der: der != null ? Math.round(der) / 100 : null,
      npm: npm != null ? Math.round(npm * 10000) / 100 : null,
      dividendYield: divYield != null ? Math.round(divYield * 10000) / 100 : null,
      price: fin.currentPrice?.raw != null ? fin.currentPrice.raw : null,
      isReal: true
    };

    await yfStoreSetEx(cacheKey, { isReal: true, data: fundamentals }, FUNDAMENTALS_CACHE_TTL_SEC);
    return fundamentals;
  } catch (err) {
    console.warn(`[IDX Engine] Real fundamentals unavailable for ${clean}, falling back to estimate:`, err.message);
    // Cache the miss too (shorter-lived) so we don't hammer Yahoo every
    // request for tickers it simply doesn't cover.
    await yfStoreSetEx(cacheKey, { isReal: false, data: null }, FUNDAMENTALS_NEGATIVE_TTL_SEC);
    return null;
  }
}

// Fetch single real-time stock quote from Yahoo Finance
async function fetchYahooQuote(ticker) {
  const clean = ticker.toUpperCase().replace(/\.JK$/i, '').trim();
  const cacheKey = clean;
  const now = Date.now();
  
  if (_quoteCache.has(cacheKey)) {
    const cached = _quoteCache.get(cacheKey);
    if (now - cached.timestamp < CACHE_TTL_MS) {
      return cached.data;
    }
  }

  const isIndex = clean.startsWith('^') || clean === 'JKSE';
  const ySymbol = isIndex ? (clean.startsWith('^') ? clean : '^' + clean) : (clean + '.JK');
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ySymbol)}?interval=1d&range=5d`;

  try {
    // Fetch price/chart data and real fundamentals concurrently — independent
    // requests, no reason to serialize them.
    const [resp, realFundamentals] = await Promise.all([
      fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          'Accept': 'application/json'
        }
      }),
      isIndex ? Promise.resolve(null) : fetchYahooFundamentals(clean)
    ]);

    if (!resp.ok) {
      throw new Error(`Yahoo Finance API status ${resp.status}`);
    }

    const data = await resp.json();
    const result = data.chart?.result?.[0];
    if (!result || !result.meta) {
      throw new Error('No quote result returned');
    }

    const meta = result.meta;
    const quotes = result.indicators?.quote?.[0] || {};
    const timestamps = result.timestamp || [];
    
    const price = meta.regularMarketPrice || meta.chartPreviousClose || 0;
    const realChg = (typeof meta.fulldayChange === 'number' && !isNaN(meta.fulldayChange)) ? meta.fulldayChange
                  : (typeof meta.regularMarketChange === 'number' && !isNaN(meta.regularMarketChange)) ? meta.regularMarketChange
                  : null;
    const realChgPct = (typeof meta.regularMarketChangePercent === 'number' && !isNaN(meta.regularMarketChangePercent)) ? meta.regularMarketChangePercent
                     : (typeof meta.fulldayChangePercent === 'number' && !isNaN(meta.fulldayChangePercent)) ? meta.fulldayChangePercent
                     : null;

    const prevClose = (realChg !== null && Math.abs(realChg) > 0.0001) ? Math.round((price - realChg) * 100) / 100
                    : (realChgPct !== null && Math.abs(realChgPct) > 0.0001) ? Math.round((price / (1 + (realChgPct / 100))) * 100) / 100
                    : (meta.previousClose || meta.regularMarketPreviousClose || meta.chartPreviousClose || price);
    const change = (realChg !== null) ? Math.round(realChg * 100) / 100 : Math.round((price - prevClose) * 100) / 100;
    const changePercent = (realChgPct !== null) ? Math.round(realChgPct * 100) / 100 : (prevClose > 0 ? Math.round(((price - prevClose) / prevClose) * 10000) / 100 : 0);
    const dayHigh = meta.regularMarketDayHigh || price;
    const dayLow = meta.regularMarketDayLow || price;
    const volume = meta.regularMarketVolume || 0;
    const value = Math.round(volume * price);
    const high52 = meta.fiftyTwoWeekHigh || (price * 1.3);
    const low52 = meta.fiftyTwoWeekLow || (price * 0.7);

    // Build historical points (last 5 sessions)
    const history = timestamps.map((ts, idx) => ({
      date: new Date(ts * 1000).toISOString().slice(0, 10),
      open: quotes.open?.[idx] || price,
      high: quotes.high?.[idx] || price,
      low: quotes.low?.[idx] || price,
      close: quotes.close?.[idx] || price,
      volume: quotes.volume?.[idx] || 0
    })).filter(h => h.close > 0);

    // Build Orderbook Depth based on BEI Tick Fractions
    // FIX (2026-09-24, bug audit): these bid/offer levels are NOT real
    // Level-2 market depth — Yahoo Finance's public chart API does not
    // expose IDX order-book data at all. They're a formula derived purely
    // from the day's total volume split into fixed fractions (0.04/0.035/
    // 0.028/...) and the BEI tick size, presented with no disclosure. Per
    // CLAUDE.md Aturan #1/#3: this stays formula-derived (there is still no
    // real bid/offer feed integrated), but is now explicitly labeled
    // isSimulated so no consumer mistakes it for real depth — see also the
    // Strategy Engine HIGH_BID_OFFER data-sourcing discussion (2026-09-24),
    // which needs a real Level-2 feed this field cannot provide.
    const tick = getBeiTickSize(price);
    const bid1 = price > tick ? (change >= 0 ? price : price - tick) : price;
    const offer1 = bid1 + tick;

    const orderBook = {
      isSimulated: true,
      note: 'Order book ini dihitung dari formula fraksi volume harian + tick size BEI, BUKAN data depth bid/offer real-time. Belum ada feed order book real yang terintegrasi.',
      bids: [
        { level: 1, price: bid1, volume: Math.round(volume * 0.04) || 25000 },
        { level: 2, price: bid1 - tick, volume: Math.round(volume * 0.035) || 21000 },
        { level: 3, price: bid1 - (tick * 2), volume: Math.round(volume * 0.028) || 18000 },
        { level: 4, price: bid1 - (tick * 3), volume: Math.round(volume * 0.022) || 14000 },
        { level: 5, price: bid1 - (tick * 4), volume: Math.round(volume * 0.018) || 10000 }
      ],
      offers: [
        { level: 1, price: offer1, volume: Math.round(volume * 0.038) || 24000 },
        { level: 2, price: offer1 + tick, volume: Math.round(volume * 0.032) || 20000 },
        { level: 3, price: offer1 + (tick * 2), volume: Math.round(volume * 0.026) || 16000 },
        { level: 4, price: offer1 + (tick * 3), volume: Math.round(volume * 0.020) || 12000 },
        { level: 5, price: offer1 + (tick * 4), volume: Math.round(volume * 0.015) || 9000 }
      ]
    };

    const universe = loadBaseUniverse();
    const emiten = universe[clean] || { code: clean, name: clean + ' Tbk.', sector: 'Lainnya', board: 'Utama', shares: null };
    // INV-010: no static share-count default — market cap is only computed
    // when the share count is actually verified, never fabricated.
    const marketCap = emiten.shares ? Math.round(price * emiten.shares) : null;

    // Fundamental valuation ratios — prefer REAL data from Yahoo's
    // quoteSummary (fetchYahooFundamentals above); only fall back to a
    // price-derived estimate field-by-field when Yahoo has no coverage for
    // this particular ticker (e.g. thinly-covered small caps).
    //
    // FIX (2026-09-24, bug audit): `isReal` used to be a single boolean
    // (`!!realFundamentals`) covering the WHOLE fundamentals object, but
    // fetchYahooFundamentals() only requires EPS or BVPS to be non-null to
    // return a truthy object — every OTHER field (roe/roa/der/npm/pbv/per/
    // dividendYield) can independently be null and silently fall back to a
    // formula estimate or a hardcoded per-ticker guess right here, while
    // the old single flag still reported the whole bundle as isReal:true.
    // That mislabeled precise-looking formula/guessed ratios as verified
    // real data — the exact pattern CLAUDE.md Aturan #3 forbids. Each
    // field now tracks its own real/estimated provenance.
    const rf = realFundamentals || {};
    const fieldIsReal = {
      bvps: rf.bvps != null,
      eps: rf.eps != null,
      per: rf.per != null,
      pbv: rf.pbv != null,
      roe: rf.roe != null,
      roa: rf.roa != null,
      der: rf.der != null,
      npm: rf.npm != null,
      dividendYield: rf.dividendYield != null
    };
    // Whole-bundle isReal is kept for backward compatibility with existing
    // consumers, but now means "every field shown is verified real" —
    // never true when even one ratio fell back to an estimate/guess.
    const isRealFundamentals = Object.values(fieldIsReal).every(Boolean);

    const bvps = rf.bvps ?? (price > 0 ? (clean === 'BBCA' ? 2450 : clean === 'BBRI' ? 2100 : clean === 'BMRI' ? 3200 : clean === 'BBNI' ? 3800 : clean === 'TLKM' ? 1850 : clean === 'ASII' ? 4200 : Math.round(price * 0.6)) : 100);
    const eps = rf.eps ?? (price > 0 ? (clean === 'BBCA' ? 450 : clean === 'BBRI' ? 390 : clean === 'BMRI' ? 620 : clean === 'BBNI' ? 510 : clean === 'TLKM' ? 245 : clean === 'ASII' ? 680 : Math.round(price * 0.08)) : 10);
    const per = rf.per ?? (eps > 0 ? Math.round((price / eps) * 100) / 100 : 12.5);
    const pbv = rf.pbv ?? (bvps > 0 ? Math.round((price / bvps) * 100) / 100 : 1.5);
    const roe = rf.roe ?? (bvps > 0 && eps > 0 ? Math.round((eps / bvps) * 10000) / 100 : 14.5);
    const roa = rf.roa ?? Math.round(roe * 0.45 * 100) / 100;
    const der = rf.der ?? (clean.startsWith('BB') || clean === 'BMRI' ? 5.2 : 0.65);
    const npm = rf.npm ?? Math.round(roe * 1.8 * 100) / 100;
    const dividendYieldReal = rf.dividendYield;

    const quoteObj = {
      code: clean,
      name: emiten.name,
      sector: emiten.sector,
      board: emiten.board,
      price: price,
      previous: prevClose,
      change: change,
      changePercent: changePercent,
      open: meta.regularMarketOpen || prevClose,
      high: dayHigh,
      low: dayLow,
      volume: volume,
      value: value,
      // FIX (2026-09-24, bug audit): this is a formula guess at trade
      // frequency (volume / an assumed average lot size), not real IDX
      // trade-count data — Yahoo does not expose frequency. Kept as a
      // best-effort estimate (removing it would break existing callers)
      // but now explicitly disclosed via frequencyIsSimulated below rather
      // than presented as a real count.
      frequency: Math.round(volume / (price > 1000 ? 800 : 3000)) || 1250,
      frequencyIsSimulated: true,
      marketCap: marketCap,
      shares: emiten.shares,
      fiftyTwoWeek: {
        high: high52,
        low: low52,
        currentVsHighPct: high52 > 0 ? Math.round(((price - high52) / high52) * 10000) / 100 : 0,
        currentVsLowPct: low52 > 0 ? Math.round(((price - low52) / low52) * 10000) / 100 : 0
      },
      orderBook: orderBook,
      fundamentals: {
        eps: eps,
        bvps: bvps,
        per: per,
        pbv: pbv,
        roe: roe,
        roa: roa,
        der: der,
        npm: npm,
        dividendYield: dividendYieldReal ?? (clean === 'BBRI' ? 6.2 : clean === 'BBCA' ? 2.8 : clean === 'ADRO' ? 12.5 : clean === 'TLKM' ? 4.9 : 3.5),
        // isReal is now true ONLY when every single field above came from
        // Yahoo's quoteSummary (see fieldIsReal above) — never true merely
        // because SOME field (e.g. EPS) had coverage while others were
        // formula/hardcoded guesses. fieldIsReal exposes the per-field
        // breakdown so a consumer can still show the ratios that ARE real
        // as real, and label only the estimated ones honestly.
        isReal: isRealFundamentals,
        fieldIsReal: fieldIsReal
      },
      history: history,
      updatedAt: new Date().toISOString(),
      // INV-004 (audit): data-quality metadata so callers can actually tell
      // this apart from the synthetic fallback below — see quoteObj's own
      // isSimulated:false vs the catch-block's isSimulated:true.
      isSimulated: false,
      quality: { status: 'REAL', source: 'yahoo_finance', provider: 'Yahoo Finance', retrievedAt: new Date().toISOString(), dataTimestamp: new Date().toISOString(), freshnessSeconds: 0, requestId: null }
    };

    _quoteCache.set(cacheKey, { timestamp: now, data: quoteObj });
    return quoteObj;
  } catch (err) {
    console.warn(`[IDX Engine] Failed to fetch real-time quote for ${clean}:`, err.message);

    // If cached version exists (even if older than the live TTL), it's real
    // data going stale, not the fabricated last-resort below — relabel its
    // quality as STALE (per audit rule: "REAL cache outside freshness
    // threshold becomes STALE") rather than silently keep claiming REAL.
    if (_quoteCache.has(cacheKey)) {
      const cached = _quoteCache.get(cacheKey);
      const freshnessSeconds = Math.round((now - cached.timestamp) / 1000);
      return {
        ...cached.data,
        isSimulated: false,
        quality: { ...(cached.data.quality || {}), status: 'STALE', freshnessSeconds }
      };
    }

    const universe = loadBaseUniverse();
    const emiten = universe[clean];
    if (!emiten && !isIndex) {
      return {
        code: clean,
        name: clean,
        isValidTicker: false,
        price: 0,
        previous: 0,
        change: 0,
        changePercent: 0,
        open: 0,
        high: 0,
        low: 0,
        volume: 0,
        value: 0,
        frequency: 0,
        marketCap: null,
        shares: null,
        orderBook: { bids: [], offers: [] },
        fundamentals: {
          eps: null,
          bvps: null,
          per: null,
          pbv: null,
          roe: null,
          roa: null,
          der: null,
          npm: null,
          dividendYield: null,
          isReal: false
        },
        history: [],
        updatedAt: new Date().toISOString(),
        isSimulated: false,
        quality: {
          status: 'INVALID',
          source: 'universe_check',
          provider: 'IDX Universe',
          retrievedAt: new Date().toISOString(),
          dataTimestamp: null,
          freshnessSeconds: null,
          requestId: null,
          reason: `Ticker "${clean}" tidak terdaftar di IDX Universe`
        }
      };
    }
    const base = (emiten && emiten.basePrice) || 1000;
    const emitenName = (emiten && emiten.name) || clean + ' Tbk.';
    const emitenSector = (emiten && emiten.sector) || 'Lainnya';
    const emitenBoard = (emiten && emiten.board) || 'Utama';
    const emitenShares = emiten ? emiten.shares : null;

    return {
      code: clean,
      name: emitenName,
      sector: emitenSector,
      board: emitenBoard,
      price: base,
      previous: base,
      change: 0,
      changePercent: 0,
      open: base,
      high: base,
      low: base,
      volume: 1000000,
      value: base * 1000000,
      frequency: 500,
      marketCap: emitenShares ? base * emitenShares : null, // INV-010: never fabricate market cap from an unverified share count
      shares: emitenShares,
      orderBook: {
        bids: [{ level: 1, price: base, volume: 10000 }],
        offers: [{ level: 1, price: base + getBeiTickSize(base), volume: 10000 }]
      },
      fundamentals: {
        eps: Math.round(base * 0.08),
        bvps: Math.round(base * 0.6),
        per: 12.5,
        pbv: 1.5,
        roe: 14.0,
        roa: 5.5,
        der: 0.8,
        npm: 12.0,
        dividendYield: 3.5
      },
      history: [],
      updatedAt: new Date().toISOString(),
      // INV-004 (audit) / INV-P1-004: this whole object is a last-resort
      // placeholder (Yahoo unreachable AND no cache exists) — every field
      // above is fabricated (basePrice-derived price, flat 1,000,000
      // volume, hardcoded PER/PBV/ROE/ROA/DER/NPM). It must never be
      // consumed as if it were a real quote; isSimulated/quality.status
      // let callers detect and exclude it. Values themselves are left
      // as-is (existing behavior) — only labeling is added here — since
      // rewriting every consumer to handle a null quote is a much larger,
      // separate change.
      isSimulated: true,
      quality: { status: 'SIMULATION', source: 'client_side_fallback', provider: 'Yahoo Finance', retrievedAt: new Date().toISOString(), dataTimestamp: null, freshnessSeconds: null, requestId: null }
    };
  }
}

// In-memory cache for chart history series (separate from the 30s live-quote cache
// since each timeframe range is fetched/cached independently and can live longer)
const _historyCache = new Map();

// Map UI timeframe code -> Yahoo Finance chart interval/range, plus how long
// each is safe to cache. 1D data (5-minute candles, live session) needs a
// short TTL; 1M/1Y data barely changes minute-to-minute, so caching it much
// longer cuts Yahoo Finance calls (and rate-limit risk) with no real cost to
// freshness.
const HISTORY_TF_MAP = {
  '1D': { interval: '5m', range: '1d', cacheTtlMs: 60000 },        // 1 minute
  '1W': { interval: '30m', range: '5d', cacheTtlMs: 5 * 60000 },   // 5 minutes
  '1M': { interval: '1d', range: '1mo', cacheTtlMs: 30 * 60000 },  // 30 minutes
  '1Y': { interval: '1wk', range: '1y', cacheTtlMs: 60 * 60000 },  // 1 hour
  // Internal-only bucket for the AI scanner's technical indicators (needs
  // ~6 months of daily bars for a real EMA50) — not exposed as a chart
  // timeframe button, just a key fetchYahooHistory() also accepts.
  'SCAN': { interval: '1d', range: '6mo', cacheTtlMs: 15 * 60000 }, // 15 minutes
  // Internal-only bucket for the strategy backtester — needs ~2 years of
  // daily bars for a meaningful sample size and an in-sample/out-of-sample
  // split. Long TTL since a completed trading day never changes.
  'BACKTEST': { interval: '1d', range: '2y', cacheTtlMs: 6 * 60 * 60000 }, // 6 hours
  // Internal-only bucket for reconstructing real day-by-day portfolio equity
  // (rebuildEquityHistoryFromTransactions() in public/js/03-engine.js) across
  // a user's full holding period, which can span years. 10y keeps the payload
  // bounded (~2500 daily bars) while covering effectively every real user.
  // Long TTL — a completed trading day never changes, and this bucket is
  // refetched at most once/day per symbol from the client anyway.
  'DAILY_MAX': { interval: '1d', range: '10y', cacheTtlMs: 6 * 60 * 60000 } // 6 hours
};

// Shape a cleaned ticker into the Yahoo Finance symbol for a given market —
// Indonesian stocks/index need a `.JK` suffix (or `^` for the index itself),
// US-listed tickers (ETF, and FX pairs like USDIDR=X) are used raw, and
// crypto needs a `-USD` suffix. NOTE: `CODE-IDR` (the pair the client's live
// pricing — fhFetchCrypto(), 03-engine.js — treats as canonical for a *spot*
// quote) does not exist as a historical chart symbol on Yahoo Finance
// (confirmed: 404 for BTC-IDR/ADA-IDR) — only `CODE-USD` has real chart
// history, so historical crypto values must be fetched in USD and converted
// using historical USD/IDR, not fetched pre-converted. Centralizing this
// mapping keeps it in exactly one place instead of duplicated per caller.
function shapeYahooSymbol(clean, market) {
  const isIndex = clean.startsWith('^') || clean === 'JKSE';
  if (market === 'us') {
    return isIndex ? (clean.startsWith('^') ? clean : '^' + clean) : clean;
  }
  if (market === 'crypto') {
    return isIndex ? clean : clean + '-USD';
  }
  // 'id' (default) — Indonesian stocks/index
  return isIndex ? (clean.startsWith('^') ? clean : '^' + clean) : clean + '.JK';
}

// Fetch real historical price series for the price chart (Grafik Harga Realtime)
// and for real day-by-day equity reconstruction. Used by /api/idx/history/:ticker
// — separate from fetchYahooQuote() which only carries a short 5-day daily
// snapshot meant for the quote/orderbook panel, not for a proper multi-timeframe
// chart. `market` selects how `ticker` is shaped into a Yahoo symbol — see
// shapeYahooSymbol() — and defaults to 'id' so every pre-existing caller (all
// of which pass Indonesian stock tickers) is unaffected.
async function fetchYahooHistory(ticker, tf, market) {
  const clean = String(ticker || '').toUpperCase().replace(/\.JK$/i, '').trim();
  const mkt = ['id', 'us', 'crypto'].includes(market) ? market : 'id';
  const cfg = HISTORY_TF_MAP[tf] || HISTORY_TF_MAP['1D'];
  // Market is part of the cache key: the same cleaned ticker can legitimately
  // mean different instruments in different markets (e.g. GLD is both a US
  // ETF ticker in ETF_DB and a plausible-looking IDX code) — without this,
  // one market's cached series would silently leak into the other's request.
  const cacheKey = clean + '_' + mkt + '_' + tf;
  const now = Date.now();

  if (_historyCache.has(cacheKey)) {
    const cached = _historyCache.get(cacheKey);
    if (now - cached.timestamp < cfg.cacheTtlMs) {
      return cached.data;
    }
  }

  const ySymbol = shapeYahooSymbol(clean, mkt);
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ySymbol)}?interval=${cfg.interval}&range=${cfg.range}`;

  try {
    const resp = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'application/json'
      }
    });

    if (!resp.ok) {
      throw new Error(`Yahoo Finance API status ${resp.status}`);
    }

    const data = await resp.json();
    const result = data.chart?.result?.[0];
    if (!result) {
      throw new Error('No chart result returned');
    }

    const timestamps = result.timestamp || [];
    const quote = result.indicators?.quote?.[0] || {};
    const closes = quote.close || [];
    const opens = quote.open || [];
    const highs = quote.high || [];
    const lows = quote.low || [];
    const volumes = quote.volume || [];
    const r2 = (n) => (n == null ? null : Math.round(n * 100) / 100);

    const points = [];
    for (let i = 0; i < timestamps.length; i++) {
      if (closes[i] != null) {
        const cVal = r2(closes[i]);
        const oVal = r2(opens[i] ?? closes[i]);
        const hVal = r2(highs[i] ?? closes[i]);
        const lVal = r2(lows[i] ?? closes[i]);
        const vVal = volumes[i] || 0;
        const dStr = new Date(timestamps[i] * 1000).toISOString().slice(0, 10);
        points.push({
          t: timestamps[i] * 1000,
          date: dStr,
          c: cVal,
          close: cVal,
          o: oVal,
          open: oVal,
          h: hVal,
          high: hVal,
          l: lVal,
          low: lVal,
          v: vVal,
          volume: vVal
        });
      }
    }

    // Fallback for 1D outside market hours: if intraday 5m has no points, fetch recent 5-day daily bars
    if (!points.length && tf === '1D') {
      try {
        const fbUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ySymbol)}?interval=1d&range=5d`;
        const fbResp = await fetch(fbUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            'Accept': 'application/json'
          }
        });
        if (fbResp.ok) {
          const fbData = await fbResp.json();
          const fbResult = fbData.chart?.result?.[0];
          const fbTimestamps = fbResult?.timestamp || [];
          const fbQuote = fbResult?.indicators?.quote?.[0] || {};
          const fbCloses = fbQuote.close || [];
          const fbOpens = fbQuote.open || [];
          const fbHighs = fbQuote.high || [];
          const fbLows = fbQuote.low || [];
          const fbVols = fbQuote.volume || [];
          for (let i = 0; i < fbTimestamps.length; i++) {
            if (fbCloses[i] != null) {
              const cVal = r2(fbCloses[i]);
              const oVal = r2(fbOpens[i] ?? fbCloses[i]);
              const hVal = r2(fbHighs[i] ?? fbCloses[i]);
              const lVal = r2(fbLows[i] ?? fbCloses[i]);
              const vVal = fbVols[i] || 0;
              const dStr = new Date(fbTimestamps[i] * 1000).toISOString().slice(0, 10);
              points.push({
                t: fbTimestamps[i] * 1000,
                date: dStr,
                c: cVal,
                close: cVal,
                o: oVal,
                open: oVal,
                h: hVal,
                high: hVal,
                l: lVal,
                low: lVal,
                v: vVal,
                volume: vVal
              });
            }
          }
        }
      } catch (fbErr) {
        // Fallback fetch failed, proceed to validation check below
      }
    }

    if (!points.length) {
      throw new Error('No usable data points in chart response');
    }

    const historyData = {
      ticker: clean,
      tf: tf,
      market: mkt,
      points: points,
      updatedAt: new Date().toISOString()
    };

    _historyCache.set(cacheKey, { timestamp: now, data: historyData });
    return historyData;
  } catch (err) {
    console.warn(`[IDX Engine] Failed to fetch chart history for ${clean} (${tf}, market=${mkt}):`, err.message);

    // Serve stale cache rather than an empty chart if we have one
    if (_historyCache.has(cacheKey)) {
      return _historyCache.get(cacheKey).data;
    }

    return { ticker: clean, tf: tf, market: mkt, points: [], updatedAt: new Date().toISOString(), error: err.message };
  }
}

// ════════════════════════════════════════════════════════════
// DYNAMIC OPPORTUNITY RADAR SCORING ENGINE (950+ IDX UNIVERSE)
// ════════════════════════════════════════════════════════════
// Reads a ticker's real fundamentals from the shared Redis cache WITHOUT
// triggering a network fetch. Returns null if nothing is cached yet —
// callers must never fabricate a substitute. Redis-backed since 2026-09-18
// (was a synchronous in-memory Map read before — now genuinely async).
async function getCachedFundamentalsOnly(ticker) {
  const cached = await yfStoreGet(_fundamentalsCacheKey(ticker));
  if (!cached) return null;
  return cached.data; // may itself be null (a cached "no coverage" miss)
}

// Companion to getCachedFundamentalsOnly() above — used by
// warmRadarFundamentals() (lib/idx-data-engine.js) to check whether a
// ticker has ANY cache entry at all. Kept as a real accessor rather than
// exporting the store directly, so this file stays the only place that
// touches the fundamentals cache keys directly.
async function hasFundamentalsCacheEntry(ticker) {
  const cached = await yfStoreGet(_fundamentalsCacheKey(ticker));
  return cached !== null && cached !== undefined;
}

// Bulk cache-only read for getUniverseOpportunityRadar() (idx-data-engine.js)
// — that function scores ~950 tickers in one synchronous .map(); reading
// each ticker's cache entry with a separate Redis round-trip (950 of them)
// would be far too slow for one request. This does ONE mget for the whole
// batch instead, returning a plain Map the caller can read from
// synchronously afterward.
async function getCachedFundamentalsBulk(tickers) {
  const keys = tickers.map(_fundamentalsCacheKey);
  const values = await yfStoreMget(keys);
  const result = new Map();
  tickers.forEach((t, i) => {
    const cached = values[i];
    result.set(t, cached ? cached.data : null);
  });
  return result;
}

// ── Rotating cron-warm cursor (lib/idx-data-engine.js's
// warmRadarFundamentalsRotating()) — kept here, not exported as raw
// yfStoreGet/yfStoreSetEx, so Redis access for this file's data stays
// encapsulated in this module per the file-header convention above.
const RADAR_WARM_CURSOR_KEY = 'radar:warm:cursor';

async function getRadarWarmCursor() {
  const v = await yfStoreGet(RADAR_WARM_CURSOR_KEY);
  return Number(v) || 0;
}

async function setRadarWarmCursor(idx) {
  await yfStoreSetEx(RADAR_WARM_CURSOR_KEY, idx, 0); // no expiry — rotation runs indefinitely
}

// yfStoreGet/yfStoreSetEx/yfStoreMget exported (2026-09-18, Unified Screener
// technical-indicator cache): idx-data-engine.js's computeTechnicalSignal()
// needs the SAME Redis-backed cache-with-fallback this file already has for
// fundamentals, keyed under a different prefix ('yahoo:technical:'). Reusing
// these generic accessors avoids a 3rd duplicated ~40-line Redis-client
// block (invezgo-client.js has one, this file has another) — the technical
// cache's key namespace/TTL/cursor logic stays in idx-data-engine.js
// (where computeTechnicalSignal already lives), only the underlying
// get/set/mget primitives are shared.
export {
  getYahooCrumb,
  fetchYahooFundamentals,
  fetchYahooQuote,
  fetchYahooHistory,
  shapeYahooSymbol,
  getCachedFundamentalsOnly,
  hasFundamentalsCacheEntry,
  getCachedFundamentalsBulk,
  getRadarWarmCursor,
  setRadarWarmCursor,
  yfStoreGet,
  yfStoreSetEx,
  yfStoreMget,
  CACHE_TTL_MS
};
