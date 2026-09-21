/**
 * lib/invezgo-client.js
 * Invezgo API access layer — shared quota manager, cache, concurrency
 * limiter and retry/backoff, sitting BETWEEN idx-data-engine.js and the raw
 * Invezgo HTTP endpoint.
 *
 * WHY THIS FILE EXISTS (deployment context):
 * This app runs as a Vercel serverless function (vercel.json → api/index.js).
 * Every request can land on a fresh cold-start instance, and concurrent
 * requests can run on separate instances simultaneously. A quota counter or
 * cache kept in a plain in-process object (as idx-data-engine.js already
 * does for quotes/universe data) is NOT safe for Invezgo: the whole
 * "Advance plan, 30,000 requests/month, 250 req/min" budget can only be
 * enforced if the counter is shared across instances — otherwise usage is
 * silently undercounted and the account can be rate-limited or suspended
 * without any of the observability this module is meant to provide.
 *
 * So quota + cache state here live in Upstash Redis (REST API, works from
 * any serverless runtime, no persistent TCP connection needed). If Redis
 * env vars are not configured, this module degrades to an in-process Map —
 * clearly logged as NOT SAFE for production quota enforcement, useful only
 * for local dev without an Upstash account.
 *
 * Canonical data-quality contract (per audit doc
 * MoneyWatchPro_Invezgo_Integration_Audit_v1): every payload leaving this
 * module carries status REAL|STALE|UNAVAILABLE|SIMULATION|INVALID plus
 * source/provider/retrievedAt/dataTimestamp/freshnessSeconds/requestId.
 * Never invents price/volume/broker/foreign-flow/order-book values.
 */

import crypto from 'crypto';

let Redis = null;
try {
  const upstash = await import('@upstash/redis');
  Redis = upstash.Redis;
} catch (_) {
  // @upstash/redis not installed/available; fallback to in-memory store below
}

// ── Redis (Upstash REST) — lazy singleton, with an explicit in-memory ──
// fallback for local dev only. The fallback is NOT safe for production
// quota enforcement on serverless (counters don't survive cold starts and
// aren't shared across concurrent instances) — it exists purely so the app
// doesn't crash before an Upstash account is provisioned.
let _memoryStore = null;
let _warnedNoRedis = false;

const _redisClient = (Redis && process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN)
  ? new Redis({ url: process.env.UPSTASH_REDIS_REST_URL, token: process.env.UPSTASH_REDIS_REST_TOKEN })
  : null;

function getRedis() {
  if (_redisClient) return _redisClient;
  if (!_warnedNoRedis) {
    _warnedNoRedis = true;
    console.warn('[invezgo-client] UPSTASH_REDIS_REST_URL/TOKEN tidak diset — quota manager & cache Invezgo memakai in-memory fallback (TIDAK aman untuk production di serverless: counter tidak konsisten lintas instance/cold start). Set kedua env var ini sebelum production_trading dianggap READY.');
  }
  if (!_memoryStore) _memoryStore = new Map();
  return null;
}

async function memGet(key) {
  const rec = _memoryStore.get(key);
  if (!rec) return null;
  if (rec.expiresAt && rec.expiresAt < Date.now()) { _memoryStore.delete(key); return null; }
  return rec.value;
}
async function memSet(key, value, ttlSec) {
  _memoryStore.set(key, { value, expiresAt: ttlSec ? Date.now() + ttlSec * 1000 : null });
}
async function memIncr(key) {
  const cur = (await memGet(key)) || 0;
  const next = cur + 1;
  await memSet(key, next, null);
  return next;
}

async function storeGet(key) {
  const redis = getRedis();
  if (redis) return redis.get(key);
  return memGet(key);
}
async function storeSetEx(key, value, ttlSec) {
  const redis = getRedis();
  if (redis) return redis.set(key, value, { ex: ttlSec });
  return memSet(key, value, ttlSec);
}
async function storeIncr(key) {
  const redis = getRedis();
  if (redis) return redis.incr(key);
  return memIncr(key);
}

// ── Quota manager ───────────────────────────────────────────────────────
// Budget per audit doc: 30,000 requests/month on the Invezgo Advance plan.
// Counter key rolls over automatically by calendar month (UTC).
const MONTHLY_QUOTA = Number(process.env.INVEZGO_MONTHLY_QUOTA || 30000);
const QUOTA_WARN_80 = 0.8;
const QUOTA_WARN_90 = 0.9;

function currentMonthKey() {
  const d = new Date();
  return `invezgo:quota:${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

async function getQuotaUsage() {
  const key = currentMonthKey();
  const used = Number((await storeGet(key)) || 0);
  return { used, quota: MONTHLY_QUOTA, remaining: Math.max(0, MONTHLY_QUOTA - used), pct: MONTHLY_QUOTA > 0 ? used / MONTHLY_QUOTA : 0 };
}

// Reserves one unit of quota BEFORE making the HTTP call. Returns
// {allowed, usage}. When the budget is exhausted, callers must not call
// Invezgo — surface UNAVAILABLE (never fabricate) instead.
async function reserveQuota() {
  const key = currentMonthKey();
  const usage = await getQuotaUsage();
  if (usage.used >= MONTHLY_QUOTA) {
    return { allowed: false, usage };
  }
  const used = await storeIncr(key);
  // TTL not strictly required (key naturally rolls over by name each
  // month) but set a generous expiry so stale monthly keys don't linger
  // forever in Redis.
  try { const redis = getRedis(); if (redis) await redis.expire(key, 60 * 60 * 24 * 40); } catch (_) {}
  await recordMetric('invezgo_requests_total');
  if (used / MONTHLY_QUOTA >= QUOTA_WARN_90) await recordMetric('quota_alert_90');
  else if (used / MONTHLY_QUOTA >= QUOTA_WARN_80) await recordMetric('quota_alert_80');
  return { allowed: true, usage: { used, quota: MONTHLY_QUOTA, remaining: Math.max(0, MONTHLY_QUOTA - used), pct: used / MONTHLY_QUOTA } };
}

// ── Metrics (lightweight counters, per audit `observability.metrics`) ──
async function recordMetric(name) {
  try {
    const key = `invezgo:metric:${name}:${new Date().toISOString().slice(0, 10)}`;
    await storeIncr(key);
  } catch (_) { /* metrics must never break the request path */ }
}

async function getMetricsToday() {
  const day = new Date().toISOString().slice(0, 10);
  const names = ['invezgo_requests_total', 'invezgo_success_total', 'invezgo_error_total', 'invezgo_429_total', 'cache_hits', 'cache_misses', 'simulation_blocked'];
  const out = {};
  for (const n of names) out[n] = Number((await storeGet(`invezgo:metric:${n}:${day}`)) || 0);
  return out;
}

// ── Cache (with request coalescing per-instance) ───────────────────────
const _inFlight = new Map(); // per-instance dedup for concurrent identical requests

function cacheKey(endpoint, params) {
  const sorted = Object.keys(params || {}).sort().map(k => `${k}=${params[k]}`).join('&');
  return `invezgo:cache:${endpoint}:${sorted}`;
}

/**
 * getOrFetch — cache-first with request coalescing + quota gate.
 * `fetcher` is only invoked on a real cache miss, and only after a quota
 * unit is successfully reserved. Never caches a non-REAL result (per audit
 * rule: "Cache only valid real responses").
 */
async function getOrFetch(endpoint, params, ttlSec, fetcher) {
  const key = cacheKey(endpoint, params);

  const cached = await storeGet(key);
  if (cached) {
    await recordMetric('cache_hits');
    return { ...cached, _cacheHit: true };
  }
  await recordMetric('cache_misses');

  if (_inFlight.has(key)) return _inFlight.get(key);

  const promise = (async () => {
    try {
      const reservation = await reserveQuota();
      if (!reservation.allowed) {
        return {
          status: 'UNAVAILABLE',
          reason: 'QUOTA_EXHAUSTED',
          source: 'invezgo_quota_guard',
          provider: 'Invezgo',
          retrievedAt: new Date().toISOString(),
          dataTimestamp: null,
          freshnessSeconds: null,
          requestId: null,
          quota: reservation.usage
        };
      }
      const result = await fetcher();
      if (result && result.status === 'REAL') {
        await storeSetEx(key, result, ttlSec);
        await recordMetric('invezgo_success_total');
      } else if (result && result.status === 'INVALID') {
        await recordMetric('invezgo_error_total');
      }
      return result;
    } finally {
      _inFlight.delete(key);
    }
  })();

  _inFlight.set(key, promise);
  return promise;
}

// ── Concurrency limiter (per audit rate_limiting.client.max_concurrency=5) ──
let _activeRequests = 0;
const _waitQueue = [];
const MAX_CONCURRENCY = Number(process.env.INVEZGO_MAX_CONCURRENCY || 5);

function acquireSlot() {
  if (_activeRequests < MAX_CONCURRENCY) {
    _activeRequests++;
    return Promise.resolve();
  }
  return new Promise(resolve => _waitQueue.push(resolve));
}
function releaseSlot() {
  const next = _waitQueue.shift();
  if (next) next();
  else _activeRequests = Math.max(0, _activeRequests - 1);
}

// ── HTTP with retry/backoff (429/502/503/504, exponential + jitter, ──
// respects Retry-After per audit rate_limiting.client) ──
const RETRY_CODES = new Set([429, 502, 503, 504]);
const MAX_RETRIES = Number(process.env.INVEZGO_MAX_RETRIES || 3);

// ── Standard headers matching Invezgo Claude MCPB ───────────────────────
const INVEZGO_DEFAULT_HEADERS = {
  'Accept': 'application/json',
  'Accept-Language': 'id',
  'Content-Type': 'application/json',
  'User-Agent': 'Invezgo Claude MCPB'
};

async function invezgoFetch(url, options = {}) {
  await acquireSlot();
  try {
    const mergedHeaders = Object.assign({}, INVEZGO_DEFAULT_HEADERS, options.headers || {});
    const finalOptions = Object.assign({}, options, { headers: mergedHeaders });
    let lastResp = null;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const resp = await fetch(url, finalOptions);
      lastResp = resp;
      if (resp.status === 429) await recordMetric('invezgo_429_total');
      if (!RETRY_CODES.has(resp.status) || attempt === MAX_RETRIES) return resp;

      const retryAfterHeader = resp.headers.get('retry-after');
      let delayMs;
      if (retryAfterHeader) {
        const asSeconds = Number(retryAfterHeader);
        delayMs = Number.isFinite(asSeconds) ? asSeconds * 1000 : 1000;
      } else {
        const base = 500 * Math.pow(2, attempt); // 500ms, 1s, 2s
        const jitter = Math.random() * base * 0.3;
        delayMs = base + jitter;
      }
      await new Promise(r => setTimeout(r, Math.min(delayMs, 15000)));
    }
    return lastResp;
  } finally {
    releaseSlot();
  }
}

// ── Latest EOD Trading Date Helper ──────────────────────────────────────
// Determines the most recent valid trading day with completed EOD data
// in Asia/Jakarta timezone (UTC+7, market closing 16:15 WIB, EOD ~17:30 WIB).
// Prevents querying today's date on weekends or intraday before EOD is ready,
// which otherwise returns empty [] from Invezgo and wastes quota.
function getLatestEodTradingDate(refDate = new Date()) {
  const d = refDate instanceof Date ? refDate : new Date(refDate);
  const wibTime = d.getTime() + (7 * 60 * 60 * 1000);
  const wib = new Date(wibTime);
  const day = wib.getUTCDay(); // 0: Sun, 1: Mon, ..., 6: Sat
  const hour = wib.getUTCHours();
  const min = wib.getUTCMinutes();
  const timeVal = hour * 60 + min;
  const eodCutoff = 17 * 60 + 30; // 17:30 WIB

  let daysBack = 0;
  if (day === 0) {
    daysBack = 2; // Sunday -> Friday
  } else if (day === 6) {
    daysBack = 1; // Saturday -> Friday
  } else if (day === 1 && timeVal < eodCutoff) {
    daysBack = 3; // Monday before 17:30 WIB -> Friday
  } else if (timeVal < eodCutoff) {
    daysBack = 1; // Tue-Fri before 17:30 WIB -> yesterday
  } else {
    daysBack = 0; // After 17:30 WIB on weekday -> today
  }

  const target = new Date(wibTime);
  target.setUTCDate(target.getUTCDate() - daysBack);
  return target.toISOString().slice(0, 10);
}

// ── Canonical envelope builder ──────────────────────────────────────────
function makeRequestId() {
  return crypto.randomBytes(8).toString('hex');
}

function freshnessSecondsFrom(dataTimestamp) {
  if (!dataTimestamp) return null;
  const t = new Date(dataTimestamp).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.round((Date.now() - t) / 1000));
}

// ── Invezgo API integration (per-ticker Bandarmology — real data) ──
// Beda dari fetchIdxBrokerSummaryReal() di lib/providers/idx-client.js
// (itu market-wide dari idx.co.id), ini memakai Invezgo API
// (https://docs.invezgo.com/api) yang menyediakan endpoint per-ticker:
// GET /analysis/summary/stock/{code} (broker accumulation/distribution
// untuk SATU saham — persis kebutuhan Bandarmology). Butuh
// INVEZGO_API_KEY (env var) dari akun berlangganan.
//
// Moved here (from lib/idx-data-engine.js) during the provider-adapter
// refactor — this is the one Invezgo-specific HTTP call in the app, so it
// belongs alongside this file's Invezgo-specific plumbing (quota/cache/
// retry/concurrency above) rather than living in the general engine file.
// No behavior change — only the getOrFetch/invezgoFetch/makeRequestId/
// freshnessSecondsFrom calls below are now local functions instead of an
// import, since they're defined in this same file.
//
// CATATAN PENTING: field mapping response JSON di bawah ini BELUM
// diverifikasi terhadap respons API sungguhan — dokumentasi resminya
// (docs.invezgo.com) di-render lewat JavaScript sehingga tidak bisa
// dibaca detail skema JSON-nya dari sini. Begitu API key aktif, LOG
// respons mentahnya sekali (lihat console.log di bawah, aktifkan lalu
// nonaktifkan lagi) dan sesuaikan pemetaan field kalau namanya berbeda.
const INVEZGO_BASE_URL = 'https://api.invezgo.com';
// FIX AUDIT (2026-09-17, quota budget planning): was a hardcoded 300s
// (5 min), inherited from the original audit doc's per-ticker "broker
// summary" design before the full-~900-ticker BEI scanner
// (getUniverseAccumulationDistribution) existed. A 5-minute TTL barely
// helps that scanner at all — its whole point is to fetch ~958 DISTINCT
// tickers once, so almost every call is a first-time cache miss regardless
// of TTL.
//
// REVISED (2026-09-17, same day, user correction): broker summary di BEI
// BUKAN data real-time — ini laporan batch yang baru terbit sekali sehari
// setelah sesi post-closing selesai (16:15 WIB), dan tidak berubah lagi
// sampai hari bursa berikutnya. `fromDate`/`toDate` yang dikirim ke
// Invezgo (lihat brokerSummaryDateRange() di lib/idx-data-engine.js) sudah
// berisi tanggal kalender hari ini, jadi cache key di getOrFetch() SUDAH
// otomatis berganti sendiri setiap hari (reset tengah malam UTC = 07:00
// WIB, jauh sebelum jam buka bursa 09:00 WIB) — TTL tidak perlu, dan tidak
// bisa, menyajikan data hari kemarin ke permintaan hari ini karena key-nya
// sudah beda. Maka TTL yang benar bukan "cukup lama untuk hemat kuota
// tapi tetap segar" (30 menit) melainkan "seumur hari bursa itu sendiri":
// begitu satu ticker+tanggal berhasil di-fetch, tidak ada alasan untuk
// fetch ulang lagi hari itu juga. Dinaikkan ke 24 jam (86400 detik).
// Configurable via env var so the operator can override without a code
// change.
const INVEZGO_BROKER_SUMMARY_CACHE_TTL_SEC = Number(process.env.INVEZGO_BROKER_SUMMARY_CACHE_TTL_SEC || 86400);

async function fetchInvezgoBrokerSummary(ticker, fromDate, toDate) {
  const apiKey = process.env.INVEZGO_API_KEY;
  if (!apiKey) return { ok: false, reason: 'NOT_CONFIGURED' };

  // Cache-first + quota-gated + concurrency-limited + retry/backoff, all
  // handled above in this same file — never call fetch() directly here
  // (see this file's header comment for why: this app is serverless, an
  // in-process counter can't enforce the 30k/month budget safely).
  const latestDate = getLatestEodTradingDate();
  fromDate = fromDate || latestDate;
  toDate = toDate || latestDate;
  const params = { ticker, fromDate, toDate };
  const envelope = await getOrFetch('broker_summary', params, INVEZGO_BROKER_SUMMARY_CACHE_TTL_SEC, async () => {
    try {
      // FIX (2026-09-17, user-provided Invezgo's own official MCP server
      // source — github/Invezgo's invezgo-mcp .mcpb bundle,
      // dist/tools/stock/handler.js's summaryStock() — ground truth, not a
      // guess): three request bugs at once, all confirmed from that source.
      // (1) query params were `from_date`/`to_date`; Invezgo's own client
      // sends `from`/`to`. (2) `investor` (enum: all/f/d) and `market`
      // (enum: RG/NG/TN) are REQUIRED and were never sent at all — the
      // previous "?" was only appended when both dates were present, so a
      // request with dates but no investor/market still validated as
      // "complete" on our side while Invezgo's own schema
      // (dist/schema/stock.js summarySchema) requires both. This is the
      // confirmed root cause of every real call failing with HTTP 422
      // Unprocessable Entity (the date-format-only fix earlier was
      // necessary but not sufficient). investor='all'/market='RG' match
      // that schema's own defaults — same values Invezgo's MCP client uses
      // when the caller doesn't override them.
      const url = `${INVEZGO_BASE_URL}/analysis/summary/stock/${encodeURIComponent(ticker)}?from=${fromDate}&to=${toDate}&investor=all&market=RG`;
      const resp = await invezgoFetch(url, {
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Accept': 'application/json' }
      });
      const requestId = makeRequestId();
      const retrievedAt = new Date().toISOString();

      if (resp.status === 401 || resp.status === 403) return { status: 'UNAVAILABLE', reason: 'AUTH_FAILED', provider: 'Invezgo', retrievedAt, requestId };
      if (resp.status === 402) return { status: 'UNAVAILABLE', reason: 'SUBSCRIPTION_INSUFFICIENT', provider: 'Invezgo', retrievedAt, requestId };
      if (resp.status === 429) return { status: 'UNAVAILABLE', reason: 'RATE_LIMITED', provider: 'Invezgo', retrievedAt, requestId };
      if (!resp.ok) return { status: 'UNAVAILABLE', reason: `HTTP_${resp.status}`, provider: 'Invezgo', retrievedAt, requestId };

      const raw = await resp.json();

      // FIX (2026-09-17, INV-P1-002 resolved — user-provided a real
      // authenticated response for /analysis/summary/stock/BBCA, not a
      // guess): the schema-mismatch fail-closed above was firing on EVERY
      // request, because the real response is a FLAT ARRAY — one entry per
      // broker, each carrying BOTH buy_* and sell_* activity for the
      // requested period in ONE row (not separate buyers[]/sellers[]
      // arrays, nor wrapped in {data:...}/{buyers:...}/{brokers:...} as
      // previously guessed): {code, name, buy_freq, buy_volume, buy_value,
      // sell_freq, sell_volume, sell_value, buy_avg, sell_avg, net_value,
      // net_volume, net_freq} — every numeric field arrives as a STRING.
      // There is no per-broker foreign/domestic (F/D) flag in this payload
      // (that's controlled by the `investor` request param itself, which
      // this app always sends as 'all') — see generateBrokerSummary() in
      // lib/idx-data-engine.js for how that limitation is surfaced
      // honestly rather than guessed.
      if (!Array.isArray(raw)) {
        return { status: 'INVALID', reason: 'UNEXPECTED_SCHEMA', provider: 'Invezgo', retrievedAt, requestId, raw };
      }

      const buyers = raw
        .filter(b => Number(b.buy_value) > 0)
        .sort((a, b) => Number(b.buy_value) - Number(a.buy_value))
        .map(b => ({ code: b.code, name: b.name, value: Number(b.buy_value) || 0, volume: Number(b.buy_volume) || 0, avgPrice: Number(b.buy_avg) || 0, freq: Number(b.buy_freq) || 0 }));
      const sellers = raw
        .filter(b => Number(b.sell_value) > 0)
        .sort((a, b) => Number(b.sell_value) - Number(a.sell_value))
        .map(b => ({ code: b.code, name: b.name, value: Number(b.sell_value) || 0, volume: Number(b.sell_volume) || 0, avgPrice: Number(b.sell_avg) || 0, freq: Number(b.sell_freq) || 0 }));
      const dataTimestamp = retrievedAt; // respons tidak menyertakan timestamp laporan per-baris
      return {
        status: 'REAL',
        source: 'invezgo_api',
        provider: 'Invezgo',
        symbol: ticker,
        retrievedAt,
        dataTimestamp,
        freshnessSeconds: freshnessSecondsFrom(dataTimestamp),
        requestId,
        buyers,
        sellers,
        foreignFlow: null, // tidak tersedia dari respons investor=all — lihat catatan di generateBrokerSummary()
        raw // disimpan mentah supaya UI/konsumen lain bisa akses field yang belum dipetakan
      };
    } catch (e) {
      return { status: 'UNAVAILABLE', reason: 'NETWORK_ERROR', provider: 'Invezgo', retrievedAt: new Date().toISOString(), requestId: makeRequestId(), error: e.message };
    }
  });

  if (envelope.status === 'REAL') {
    return { ok: true, source: 'invezgo_real', buyers: envelope.buyers, sellers: envelope.sellers, foreignFlow: envelope.foreignFlow, raw: envelope.raw, quality: envelope };
  }
  return { ok: false, reason: envelope.reason || envelope.status, quality: envelope };
}

// ── Invezgo API: Broker Summary by Broker (GET /analysis/summary/broker/{code}) ──
// Fetches the entire portfolio of stocks traded (net buy & net sell) by a specific
// broker in ONE API call, eliminating the need to scan 958 tickers individually.
async function fetchInvezgoBrokerSummaryByBroker(brokerCode, fromDate, toDate) {
  const apiKey = process.env.INVEZGO_API_KEY;
  if (!apiKey) return { ok: false, reason: 'NOT_CONFIGURED' };

  const cleanBroker = String(brokerCode || '').trim().toUpperCase();
  if (!cleanBroker) return { ok: false, reason: 'INVALID_BROKER_CODE' };

  const latestDate = getLatestEodTradingDate();
  const effectiveFrom = fromDate || latestDate;
  const effectiveTo = toDate || latestDate;
  const params = { broker: cleanBroker, fromDate: effectiveFrom, toDate: effectiveTo };
  const envelope = await getOrFetch('broker_summary_by_broker', params, INVEZGO_BROKER_SUMMARY_CACHE_TTL_SEC, async () => {
    try {
      const url = `${INVEZGO_BASE_URL}/analysis/summary/broker/${encodeURIComponent(cleanBroker)}?from=${effectiveFrom}&to=${effectiveTo}&investor=all&market=RG`;
      const resp = await invezgoFetch(url, {
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Accept': 'application/json' }
      });
      const requestId = makeRequestId();
      const retrievedAt = new Date().toISOString();

      if (resp.status === 401 || resp.status === 403) return { status: 'UNAVAILABLE', reason: 'AUTH_FAILED', provider: 'Invezgo', retrievedAt, requestId };
      if (resp.status === 402) return { status: 'UNAVAILABLE', reason: 'SUBSCRIPTION_INSUFFICIENT', provider: 'Invezgo', retrievedAt, requestId };
      if (resp.status === 429) return { status: 'UNAVAILABLE', reason: 'RATE_LIMITED', provider: 'Invezgo', retrievedAt, requestId };
      if (!resp.ok) return { status: 'UNAVAILABLE', reason: `HTTP_${resp.status}`, provider: 'Invezgo', retrievedAt, requestId };

      const raw = await resp.json();
      if (!Array.isArray(raw)) {
        return { status: 'INVALID', reason: 'UNEXPECTED_SCHEMA', provider: 'Invezgo', retrievedAt, requestId, raw };
      }

      const netBuyStocks = raw
        .filter(s => (Number(s.net_value) || (Number(s.buy_value) - Number(s.sell_value))) > 0)
        .sort((a, b) => {
          const netA = Number(a.net_value) || (Number(a.buy_value) - Number(a.sell_value));
          const netB = Number(b.net_value) || (Number(b.buy_value) - Number(b.sell_value));
          return netB - netA;
        })
        .map(s => {
          const buyVal = Number(s.buy_value) || 0;
          const sellVal = Number(s.sell_value) || 0;
          const netVal = Number(s.net_value) || (buyVal - sellVal);
          const buyVol = Number(s.buy_volume) || 0;
          const sellVol = Number(s.sell_volume) || 0;
          const netVol = Number(s.net_volume) || (buyVol - sellVol);
          return {
            ticker: s.code,
            name: s.name || s.code,
            buyValue: buyVal,
            sellValue: sellVal,
            netValue: netVal,
            buyVolume: buyVol,
            sellVolume: sellVol,
            netVolume: netVol,
            buyAvg: Number(s.buy_avg) || 0,
            sellAvg: Number(s.sell_avg) || 0
          };
        });

      const netSellStocks = raw
        .filter(s => (Number(s.net_value) || (Number(s.buy_value) - Number(s.sell_value))) < 0)
        .sort((a, b) => {
          const netA = Number(a.net_value) || (Number(a.buy_value) - Number(a.sell_value));
          const netB = Number(b.net_value) || (Number(b.buy_value) - Number(b.sell_value));
          return netA - netB;
        })
        .map(s => {
          const buyVal = Number(s.buy_value) || 0;
          const sellVal = Number(s.sell_value) || 0;
          const netVal = Number(s.net_value) || (buyVal - sellVal);
          const buyVol = Number(s.buy_volume) || 0;
          const sellVol = Number(s.sell_volume) || 0;
          const netVol = Number(s.net_volume) || (buyVol - sellVol);
          return {
            ticker: s.code,
            name: s.name || s.code,
            buyValue: buyVal,
            sellValue: sellVal,
            netValue: netVal,
            buyVolume: buyVol,
            sellVolume: sellVol,
            netVolume: netVol,
            buyAvg: Number(s.buy_avg) || 0,
            sellAvg: Number(s.sell_avg) || 0
          };
        });

      const dataTimestamp = retrievedAt;
      return {
        status: 'REAL',
        source: 'invezgo_api',
        provider: 'Invezgo',
        broker: cleanBroker,
        retrievedAt,
        dataTimestamp,
        freshnessSeconds: freshnessSecondsFrom(dataTimestamp),
        requestId,
        netBuyStocks,
        netSellStocks,
        totalStocksTraded: raw.length,
        raw
      };
    } catch (e) {
      return { status: 'UNAVAILABLE', reason: 'NETWORK_ERROR', provider: 'Invezgo', retrievedAt: new Date().toISOString(), requestId: makeRequestId(), error: e.message };
    }
  });

  if (envelope.status === 'REAL') {
    return {
      ok: true,
      source: 'invezgo_real',
      broker: envelope.broker,
      netBuyStocks: envelope.netBuyStocks,
      netSellStocks: envelope.netSellStocks,
      totalStocksTraded: envelope.totalStocksTraded,
      quality: envelope
    };
  }
  return { ok: false, reason: envelope.reason || envelope.status, quality: envelope };
}

// ── Invezgo API: Intraday Trade Flow (GET /analysis/trade-flow/{ticker}) ──
// Returns intraday HAKA (Buy) vs HAKI (Sell) cumulative tape with price overlay and Big Money filter
const INVEZGO_TRADE_FLOW_CACHE_TTL_SEC = Number(process.env.INVEZGO_TRADE_FLOW_CACHE_TTL_SEC || 120);

async function fetchInvezgoTradeFlow(ticker, date, isBigMoney = false) {
  const apiKey = process.env.INVEZGO_API_KEY;
  if (!apiKey) return { ok: false, reason: 'NOT_CONFIGURED' };

  const cleanTicker = String(ticker || '').trim().toUpperCase().replace(/\.JK$/i, '').replace(/\.US$/i, '');
  if (!cleanTicker) return { ok: false, reason: 'INVALID_TICKER' };

  const latestDate = getLatestEodTradingDate();
  const effectiveDate = date || latestDate;
  const isHistorical = effectiveDate < latestDate;
  const ttl = isHistorical ? 86400 : INVEZGO_TRADE_FLOW_CACHE_TTL_SEC;

  const params = { ticker: cleanTicker, date: effectiveDate, isBigMoney: !!isBigMoney };
  const envelope = await getOrFetch('trade_flow', params, ttl, async () => {
    try {
      const url = `${INVEZGO_BASE_URL}/analysis/trade-flow/${encodeURIComponent(cleanTicker)}?date=${effectiveDate}&big_money=${isBigMoney ? 'true' : 'false'}`;
      const resp = await invezgoFetch(url, {
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Accept': 'application/json' }
      });
      const requestId = makeRequestId();
      const retrievedAt = new Date().toISOString();

      if (resp.status === 401 || resp.status === 403) return { status: 'UNAVAILABLE', reason: 'AUTH_FAILED', provider: 'Invezgo', retrievedAt, requestId };
      if (resp.status === 402) return { status: 'UNAVAILABLE', reason: 'SUBSCRIPTION_INSUFFICIENT', provider: 'Invezgo', retrievedAt, requestId };
      if (resp.status === 429) return { status: 'UNAVAILABLE', reason: 'RATE_LIMITED', provider: 'Invezgo', retrievedAt, requestId };
      if (!resp.ok) return { status: 'UNAVAILABLE', reason: `HTTP_${resp.status}`, provider: 'Invezgo', retrievedAt, requestId };

      const raw = await resp.json();
      const seriesRaw = Array.isArray(raw) ? raw : (raw && Array.isArray(raw.data) ? raw.data : (raw && Array.isArray(raw.series) ? raw.series : []));

      let cumBuy = 0;
      let cumSell = 0;
      const points = seriesRaw.map(pt => {
        const buyVal = Number(pt.buy_value || pt.buyValue || pt.buy || 0);
        const sellVal = Number(pt.sell_value || pt.sellValue || pt.sell || 0);
        cumBuy += buyVal;
        cumSell += sellVal;
        return {
          time: pt.time || pt.datetime || pt.timestamp || '',
          price: Number(pt.price || pt.close || 0),
          buyValue: buyVal,
          sellValue: sellVal,
          cumBuyValue: cumBuy,
          cumSellValue: cumSell,
          netValue: cumBuy - cumSell,
          buyVolume: Number(pt.buy_volume || pt.buyVolume || 0),
          sellVolume: Number(pt.sell_volume || pt.sellVolume || 0)
        };
      });

      const netTotal = cumBuy - cumSell;
      const totalTurnover = cumBuy + cumSell;
      const accScore = totalTurnover > 0 ? Math.max(-100, Math.min(100, Math.round((netTotal / totalTurnover) * 100))) : 0;
      let meterLabel = 'Neutral';
      if (accScore >= 40) meterLabel = 'Big Acc';
      else if (accScore >= 15) meterLabel = 'Normal Acc';
      else if (accScore <= -40) meterLabel = 'Big Dist';
      else if (accScore <= -15) meterLabel = 'Normal Dist';

      const dataTimestamp = points.length ? points[points.length - 1].time : retrievedAt;
      return {
        status: 'REAL',
        source: 'invezgo_api',
        provider: 'Invezgo',
        symbol: cleanTicker,
        date: effectiveDate,
        isBigMoney: !!isBigMoney,
        retrievedAt,
        dataTimestamp,
        freshnessSeconds: freshnessSecondsFrom(dataTimestamp),
        requestId,
        totalBuyValue: cumBuy,
        totalSellValue: cumSell,
        netValue: netTotal,
        accScore,
        meterLabel,
        points,
        raw
      };
    } catch (e) {
      return { status: 'UNAVAILABLE', reason: 'NETWORK_ERROR', provider: 'Invezgo', retrievedAt: new Date().toISOString(), requestId: makeRequestId(), error: e.message };
    }
  });

  if (envelope.status === 'REAL') {
    return {
      ok: true,
      source: 'invezgo_real',
      symbol: envelope.symbol,
      date: envelope.date,
      isBigMoney: envelope.isBigMoney,
      totalBuyValue: envelope.totalBuyValue,
      totalSellValue: envelope.totalSellValue,
      netValue: envelope.netValue,
      accScore: envelope.accScore,
      meterLabel: envelope.meterLabel,
      points: envelope.points,
      quality: envelope
    };
  }
  return { ok: false, reason: envelope.reason || envelope.status, quality: envelope };
}

// ── Invezgo API: Multi-Broker Cumulative Flow (GET /analysis/broker-flow/{ticker}) ──
// Returns cumulative net flow time-series per broker with timeframe support (1D, 1W, 1M, 3M, YTD, 1Y)
const INVEZGO_BROKER_FLOW_CACHE_TTL_SEC = Number(process.env.INVEZGO_BROKER_FLOW_CACHE_TTL_SEC || 180);

async function fetchInvezgoBrokerFlow(ticker, range = '1D', investor = 'all', market = 'RG') {
  const apiKey = process.env.INVEZGO_API_KEY;
  if (!apiKey) return { ok: false, reason: 'NOT_CONFIGURED' };

  const cleanTicker = String(ticker || '').trim().toUpperCase().replace(/\.JK$/i, '').replace(/\.US$/i, '');
  if (!cleanTicker) return { ok: false, reason: 'INVALID_TICKER' };

  const validRanges = ['1D', '1W', '1M', '3M', 'YTD', '1Y'];
  const effectiveRange = validRanges.includes(range.toUpperCase()) ? range.toUpperCase() : '1D';
  const ttl = effectiveRange === '1D' ? INVEZGO_BROKER_FLOW_CACHE_TTL_SEC : 86400;

  const params = { ticker: cleanTicker, range: effectiveRange, investor: investor || 'all', market: market || 'RG' };
  const envelope = await getOrFetch('broker_flow', params, ttl, async () => {
    try {
      const url = `${INVEZGO_BASE_URL}/analysis/broker-flow/${encodeURIComponent(cleanTicker)}?range=${effectiveRange}&investor=${encodeURIComponent(investor || 'all')}&market=${encodeURIComponent(market || 'RG')}`;
      const resp = await invezgoFetch(url, {
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Accept': 'application/json' }
      });
      const requestId = makeRequestId();
      const retrievedAt = new Date().toISOString();

      if (resp.status === 401 || resp.status === 403) return { status: 'UNAVAILABLE', reason: 'AUTH_FAILED', provider: 'Invezgo', retrievedAt, requestId };
      if (resp.status === 402) return { status: 'UNAVAILABLE', reason: 'SUBSCRIPTION_INSUFFICIENT', provider: 'Invezgo', retrievedAt, requestId };
      if (resp.status === 429) return { status: 'UNAVAILABLE', reason: 'RATE_LIMITED', provider: 'Invezgo', retrievedAt, requestId };
      if (!resp.ok) return { status: 'UNAVAILABLE', reason: `HTTP_${resp.status}`, provider: 'Invezgo', retrievedAt, requestId };

      const raw = await resp.json();
      const seriesRaw = Array.isArray(raw) ? raw : (raw && Array.isArray(raw.data) ? raw.data : (raw && Array.isArray(raw.series) ? raw.series : []));
      const brokerTotals = (raw && raw.brokerTotals) || {};

      const points = seriesRaw.map(pt => ({
        time: pt.time || pt.datetime || pt.date || '',
        price: Number(pt.price || pt.close || 0),
        brokers: pt.brokers || pt.flows || {}
      }));

      const dataTimestamp = points.length ? points[points.length - 1].time : retrievedAt;
      return {
        status: 'REAL',
        source: 'invezgo_api',
        provider: 'Invezgo',
        symbol: cleanTicker,
        range: effectiveRange,
        investor,
        market,
        retrievedAt,
        dataTimestamp,
        freshnessSeconds: freshnessSecondsFrom(dataTimestamp),
        requestId,
        points,
        brokerTotals,
        raw
      };
    } catch (e) {
      return { status: 'UNAVAILABLE', reason: 'NETWORK_ERROR', provider: 'Invezgo', retrievedAt: new Date().toISOString(), requestId: makeRequestId(), error: e.message };
    }
  });

  if (envelope.status === 'REAL') {
    return {
      ok: true,
      source: 'invezgo_real',
      symbol: envelope.symbol,
      range: envelope.range,
      investor: envelope.investor,
      market: envelope.market,
      points: envelope.points,
      brokerTotals: envelope.brokerTotals,
      quality: envelope
    };
  }
  return { ok: false, reason: envelope.reason || envelope.status, quality: envelope };
}

// ── Invezgo API integration (market-wide top movers — real data, 1 quota
// unit for the WHOLE BEI universe) ──
// FIX (2026-09-17, user-requested quota optimization: "optimalkan
// langganan API saya... karena broker ini sifatnya reload per hari saja"):
// the app's existing "Broker Flow Riil (Seluruh BEI)" scanner
// (getUniverseAccumulationDistribution in lib/idx-data-engine.js) scanned
// the whole ~958-ticker universe by calling fetchInvezgoBrokerSummary()
// ONCE PER TICKER — up to 12 batches of 80 = ~960 quota units for a single
// full scan, out of a 30,000/month budget. GET /analysis/top/accumulation
// and GET /analysis/top/foreign (confirmed via a real, authenticated
// "Test Request" response the user captured from Invezgo's own API
// docs UI — not a guess) return the ENTIRE market's top accumulation/
// distribution movers for a given date in ONE call: {accum: [...], dist:
// [...]}, each row {code, name, price, change, value, volume, logo,
// calculated_value, graph}. `calculated_value` is Invezgo's own ranking
// score (positive for accum, negative for dist) — NOT a Rupiah amount, so
// it's surfaced as a score, never mislabeled as a currency figure.
// 1 call = 1 quota unit for the whole universe, cached 24h (this data is
// an EOD batch report per Invezgo's own endpoint description: "Update EOD
// setiap hari" — a fresh call after that only ever returns the same day's
// numbers again until the next trading day).
const INVEZGO_TOP_MOVERS_CACHE_TTL_SEC = Number(process.env.INVEZGO_TOP_MOVERS_CACHE_TTL_SEC || 86400);

async function fetchInvezgoTopMovers(kind, date) {
  const apiKey = process.env.INVEZGO_API_KEY;
  if (!apiKey) return { ok: false, reason: 'NOT_CONFIGURED' };
  const safeKind = kind === 'foreign' ? 'foreign' : 'accumulation';
  date = date || getLatestEodTradingDate();
  const params = { kind: safeKind, date };
  const envelope = await getOrFetch('top_movers', params, INVEZGO_TOP_MOVERS_CACHE_TTL_SEC, async () => {
    try {
      const url = `${INVEZGO_BASE_URL}/analysis/top/${safeKind}${date ? `?date=${date}` : ''}`;
      const resp = await invezgoFetch(url, {
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Accept': 'application/json' }
      });
      const requestId = makeRequestId();
      const retrievedAt = new Date().toISOString();

      if (resp.status === 401 || resp.status === 403) return { status: 'UNAVAILABLE', reason: 'AUTH_FAILED', provider: 'Invezgo', retrievedAt, requestId };
      if (resp.status === 402) return { status: 'UNAVAILABLE', reason: 'SUBSCRIPTION_INSUFFICIENT', provider: 'Invezgo', retrievedAt, requestId };
      if (resp.status === 429) return { status: 'UNAVAILABLE', reason: 'RATE_LIMITED', provider: 'Invezgo', retrievedAt, requestId };
      if (!resp.ok) return { status: 'UNAVAILABLE', reason: `HTTP_${resp.status}`, provider: 'Invezgo', retrievedAt, requestId };

      const raw = await resp.json();
      if (!raw || !Array.isArray(raw.accum) || !Array.isArray(raw.dist)) {
        return { status: 'INVALID', reason: 'UNEXPECTED_SCHEMA', provider: 'Invezgo', retrievedAt, requestId, raw };
      }

      return {
        status: 'REAL',
        source: 'invezgo_api',
        provider: 'Invezgo',
        retrievedAt,
        dataTimestamp: retrievedAt,
        freshnessSeconds: 0,
        requestId,
        accum: raw.accum,
        dist: raw.dist
      };
    } catch (e) {
      return { status: 'UNAVAILABLE', reason: 'NETWORK_ERROR', provider: 'Invezgo', retrievedAt: new Date().toISOString(), requestId: makeRequestId(), error: e.message };
    }
  });

  if (envelope.status === 'REAL') {
    return { ok: true, source: 'invezgo_real', accum: envelope.accum, dist: envelope.dist, quality: envelope };
  }
  return { ok: false, reason: envelope.reason || envelope.status, quality: envelope };
}

// ── Invezgo API integration (Corporate Action Calendar) ──
// FIX (2026-09-18, user-reported: getIdxCalendarData() di idx-client.js
// adalah 100% array hardcoded fiksi — dividen/split/rights issue/RUPS
// dengan tanggal & angka karangan — TAPI komentarnya sendiri mengklaim
// "data resmi terverifikasi". Ditemukan lewat audit menyeluruh setelah
// user marah karena masih banyak simulasi diam-diam di aplikasi ini):
// Invezgo punya GET /analysis/calendar (dikonfirmasi dari file OpenAPI
// spec resmi vendor, bukan tebakan) — parameter `type` enum resmi:
// IPO/PUBLIC_EXPOSE/REVERSE/RIGHT/RUPS_RESULT/RUPS_SCHEDULE/SPLIT/
// WARRANT/BONUS/CONVERTION/DIVIDEND. Response: {totalPage, page, nextPage,
// data:[{code, type, payload}]} — `code`/`type` dikonfirmasi dari skema,
// TAPI struktur `payload` BEDA-BEDA per tipe dan dokumentasi vendor cuma
// kasih contoh untuk tipe WARRANT (bukan salah satu tipe yang dipakai app
// ini) — jadi payload TIDAK di-parse/dipetakan ke field spesifik di sini
// (dps/cumDate/exercisePrice/dst semua TIDAK diverifikasi), cuma
// diteruskan mentah. Ini caller's job untuk menampilkannya generik
// (key-value apa adanya) sampai ada contoh respons real per tipe untuk
// memverifikasi skema payload-nya — lihat generateCorporateActionCalendar()
// di lib/idx-data-engine.js.
const INVEZGO_CALENDAR_CACHE_TTL_SEC = Number(process.env.INVEZGO_CALENDAR_CACHE_TTL_SEC || 86400);

async function fetchInvezgoCalendar(type, code) {
  const apiKey = process.env.INVEZGO_API_KEY;
  if (!apiKey) return { ok: false, reason: 'NOT_CONFIGURED' };

  const params = { type: type || '', code: code || '' };
  const envelope = await getOrFetch('calendar', params, INVEZGO_CALENDAR_CACHE_TTL_SEC, async () => {
    try {
      const qs = new URLSearchParams();
      if (type) qs.set('type', type);
      if (code) qs.set('code', code);
      qs.set('limit', '50');
      const url = `${INVEZGO_BASE_URL}/analysis/calendar?${qs.toString()}`;
      const resp = await invezgoFetch(url, {
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Accept': 'application/json' }
      });
      const requestId = makeRequestId();
      const retrievedAt = new Date().toISOString();

      if (resp.status === 401 || resp.status === 403) return { status: 'UNAVAILABLE', reason: 'AUTH_FAILED', provider: 'Invezgo', retrievedAt, requestId };
      if (resp.status === 402) return { status: 'UNAVAILABLE', reason: 'SUBSCRIPTION_INSUFFICIENT', provider: 'Invezgo', retrievedAt, requestId };
      if (resp.status === 429) return { status: 'UNAVAILABLE', reason: 'RATE_LIMITED', provider: 'Invezgo', retrievedAt, requestId };
      if (resp.status === 204) return { status: 'REAL', source: 'invezgo_api', provider: 'Invezgo', retrievedAt, dataTimestamp: retrievedAt, freshnessSeconds: 0, requestId, items: [] };
      if (!resp.ok) return { status: 'UNAVAILABLE', reason: `HTTP_${resp.status}`, provider: 'Invezgo', retrievedAt, requestId };

      const raw = await resp.json();
      if (!raw || !Array.isArray(raw.data)) {
        return { status: 'INVALID', reason: 'UNEXPECTED_SCHEMA', provider: 'Invezgo', retrievedAt, requestId, raw };
      }

      // code/type dikonfirmasi dari skema resmi; payload diteruskan MENTAH
      // (lihat catatan di atas fungsi ini) — tidak ada field yang ditebak.
      const items = raw.data.map(row => ({ code: row.code, type: row.type, payload: row.payload || {} }));
      return {
        status: 'REAL',
        source: 'invezgo_api',
        provider: 'Invezgo',
        retrievedAt,
        dataTimestamp: retrievedAt,
        freshnessSeconds: 0,
        requestId,
        items
      };
    } catch (e) {
      return { status: 'UNAVAILABLE', reason: 'NETWORK_ERROR', provider: 'Invezgo', retrievedAt: new Date().toISOString(), requestId: makeRequestId(), error: e.message };
    }
  });

  if (envelope.status === 'REAL') {
    return { ok: true, source: 'invezgo_real', items: envelope.items, quality: envelope };
  }
  return { ok: false, reason: envelope.reason || envelope.status, quality: envelope };
}

// ── Invezgo API integration (Financial Statement — Harga Wajar auto-fill) ──
// FIX (2026-09-18, user-reported: "Harga Wajar, tidak ada data lengkap
// padahal API data invezgo punya data financial"): GET /analysis/
// financial-statement/{code} dikonfirmasi REAL dari 2 file JSON respons
// asli yang di-upload user untuk BBCA (statement=BS dan statement=IS,
// type=FY, limit=4) — bukan tebakan. Skema respons: {rows:[{id, name,
// level, values:[{col,year,amount,period}], parent_id, is_abstract,
// display_order}], columns:[{year,label,period}]}. Setiap baris adalah
// satu item laporan keuangan bernama (Bahasa Indonesia), amount dalam
// Rupiah penuh untuk SEBAGIAN BESAR baris (dikonfirmasi: "Jumlah aset"
// BBCA FY2025 = 1.586.828.536.000.000, cocok dengan total aset real) —
// KECUALI baris EPS ("Laba (rugi) per saham dasar...") yang nilainya
// perlu dibagi 1.000.000 supaya masuk akal (467000000/1e6=467, cocok
// dengan EPS real BBCA ~Rp 467/lembar FY2025) — pola ini diamati dari
// angka, BUKAN dikonfirmasi dari dokumentasi resmi Invezgo, jadi
// generateFinancialStatementSummary() (lib/idx-data-engine.js) mewariskan
// disclosure eksplisit soal ini ke UI, bukan diam-diam dianggap pasti.
// Tidak ada baris "jumlah saham beredar" sama sekali di kedua statement
// (BS maupun IS) — lihat generateFinancialStatementSummary() untuk cara
// itu diturunkan (Net Income ÷ EPS), bukan field langsung.
const INVEZGO_FINANCIAL_STATEMENT_CACHE_TTL_SEC = Number(process.env.INVEZGO_FINANCIAL_STATEMENT_CACHE_TTL_SEC || 86400);

async function fetchInvezgoFinancialStatement(code, statement, type, limit) {
  const apiKey = process.env.INVEZGO_API_KEY;
  if (!apiKey) return { ok: false, reason: 'NOT_CONFIGURED' };

  const cleanCode = String(code || '').toUpperCase().trim();
  const params = { code: cleanCode, statement: statement || 'BS', type: type || 'FY', limit: String(limit || 4) };
  const envelope = await getOrFetch('financial_statement', params, INVEZGO_FINANCIAL_STATEMENT_CACHE_TTL_SEC, async () => {
    try {
      const qs = new URLSearchParams({ statement: params.statement, type: params.type, limit: params.limit });
      const url = `${INVEZGO_BASE_URL}/analysis/financial-statement/${encodeURIComponent(cleanCode)}?${qs.toString()}`;
      const resp = await invezgoFetch(url, {
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Accept': 'application/json' }
      });
      const requestId = makeRequestId();
      const retrievedAt = new Date().toISOString();

      if (resp.status === 401 || resp.status === 403) return { status: 'UNAVAILABLE', reason: 'AUTH_FAILED', provider: 'Invezgo', retrievedAt, requestId };
      if (resp.status === 402) return { status: 'UNAVAILABLE', reason: 'SUBSCRIPTION_INSUFFICIENT', provider: 'Invezgo', retrievedAt, requestId };
      if (resp.status === 429) return { status: 'UNAVAILABLE', reason: 'RATE_LIMITED', provider: 'Invezgo', retrievedAt, requestId };
      if (!resp.ok) return { status: 'UNAVAILABLE', reason: `HTTP_${resp.status}`, provider: 'Invezgo', retrievedAt, requestId };

      const raw = await resp.json();
      if (!raw || !Array.isArray(raw.rows)) {
        return { status: 'INVALID', reason: 'UNEXPECTED_SCHEMA', provider: 'Invezgo', retrievedAt, requestId, raw };
      }

      return {
        status: 'REAL',
        source: 'invezgo_api',
        provider: 'Invezgo',
        retrievedAt,
        dataTimestamp: retrievedAt,
        freshnessSeconds: 0,
        requestId,
        rows: raw.rows,
        columns: raw.columns || []
      };
    } catch (e) {
      return { status: 'UNAVAILABLE', reason: 'NETWORK_ERROR', provider: 'Invezgo', retrievedAt: new Date().toISOString(), requestId: makeRequestId(), error: e.message };
    }
  });

  if (envelope.status === 'REAL') {
    return { ok: true, source: 'invezgo_real', rows: envelope.rows, columns: envelope.columns, quality: envelope };
  }
  return { ok: false, reason: envelope.reason || envelope.status, quality: envelope };
}

// ── Invezgo API integration (Shareholder/KSEI ownership composition) ──
// Skema keempat endpoint di bawah ini dikonfirmasi dari respons REAL yang
// diambil user via "Test Request" Invezgo docs untuk BBCA (2026-09-18) —
// bukan tebakan. Penting: ini data AGREGAT per KATEGORI investor (Asing/
// Lokal x jenis institusi), BUKAN daftar pemegang saham bernama seperti
// dataset upload manual ">5% Kepemilikan" di 34-ksei-shareholders.js —
// karena itu disurfacekan sebagai tampilan komposisi terpisah, tidak
// dipaksakan ke bentuk investors[] yang butuh nama pemegang saham (yang
// memang tidak ada di respons ini).
const INVEZGO_SHAREHOLDER_CACHE_TTL_SEC = Number(process.env.INVEZGO_SHAREHOLDER_CACHE_TTL_SEC || 259200); // 3 hari — laporan KSEI ini bulanan, tidak perlu refetch harian

// 9 kategori standar KSEI, dikonfirmasi dari field foreign_<kode>/local_<kode>
// pada respons real /analysis/shareholder/ksei/BBCA.
const INVEZGO_KSEI_CATEGORY_LABELS = {
  is: 'Asuransi', cp: 'Korporasi', pf: 'Dana Pensiun', ib: 'Bank',
  id: 'Individu', mf: 'Reksa Dana', sc: 'Perusahaan Efek', fd: 'Yayasan', ot: 'Lainnya'
};

// 39 kode klasifikasi investor granular untuk /shareholder/classify-table
// dan /shareholder/classification — legenda resmi dari dokumentasi Invezgo
// (dikirim user, 2026-09-18), BUKAN tebakan.
const INVEZGO_CLASSIFICATION_LABELS = {
  BK: 'Bank', GV: 'Pemerintah', PE: 'Private Equity', TB: 'Trustee Bank',
  VC: 'Venture Capital', PB: 'Private Bank', EF: 'Exchange Traded Funds (ETF)',
  IM: 'Manajer Investasi', IA: 'Investment Advisors', BR: 'Perusahaan Sekuritas (Brokerage Firms)',
  HF: 'Hedge Fund', SW: 'Sovereign Wealth Fund', CM: 'Lembaga Pendukung Pasar Modal',
  CV: 'Commanditaire Vennootschap (CV)', FM: 'Firma', SA: 'Agen Penjual Reksa Dana',
  PP: 'Peer to Peer Lending', PS: 'Permanent Establishment', SP: 'Sole Proprietorship (Usaha Perorangan)',
  CR: 'Korporasi', AS: 'Asosiasi / Organisasi Sosial', SO: 'Badan Usaha Milik Negara (BUMN)',
  CB: 'Bank Sentral', OC: 'Perusahaan Milik Negara', DC: 'Keuskupan (Diocese)',
  CN: 'Konferensi (Conference)', CG: 'Kongregasi (Congregation)', CP: 'Koperasi',
  IO: 'Organisasi Internasional', PL: 'Partai Politik', PT: 'Partnership (Persekutuan)',
  ED: 'Lembaga Pendidikan', MF: 'Reksa Dana', SC: 'Perusahaan Sekuritas',
  PF: 'Dana Pensiun', IB: 'Lembaga Finansial', IS: 'Asuransi',
  FD: 'Yayasan', IN: 'Individu'
};

async function fetchInvezgoShareholderNumber(ticker) {
  const apiKey = process.env.INVEZGO_API_KEY;
  if (!apiKey) return { ok: false, reason: 'NOT_CONFIGURED' };
  const params = { ticker };
  const envelope = await getOrFetch('shareholder_number', params, INVEZGO_SHAREHOLDER_CACHE_TTL_SEC, async () => {
    try {
      const url = `${INVEZGO_BASE_URL}/analysis/shareholder/number/${encodeURIComponent(ticker)}`;
      const resp = await invezgoFetch(url, { headers: { 'Authorization': `Bearer ${apiKey}`, 'Accept': 'application/json' } });
      const requestId = makeRequestId();
      const retrievedAt = new Date().toISOString();

      if (resp.status === 401 || resp.status === 403) return { status: 'UNAVAILABLE', reason: 'AUTH_FAILED', provider: 'Invezgo', retrievedAt, requestId };
      if (resp.status === 402) return { status: 'UNAVAILABLE', reason: 'SUBSCRIPTION_INSUFFICIENT', provider: 'Invezgo', retrievedAt, requestId };
      if (resp.status === 429) return { status: 'UNAVAILABLE', reason: 'RATE_LIMITED', provider: 'Invezgo', retrievedAt, requestId };
      if (!resp.ok) return { status: 'UNAVAILABLE', reason: `HTTP_${resp.status}`, provider: 'Invezgo', retrievedAt, requestId };

      const raw = await resp.json();
      // Skema real BBCA: array bulanan {code, date, value, price} — `value`
      // = JUMLAH PEMEGANG SAHAM (SID), bukan nilai Rupiah (magnitudo
      // 300rb-800rb, konsisten dengan jumlah investor, bukan nominal saham).
      if (!Array.isArray(raw)) {
        return { status: 'INVALID', reason: 'UNEXPECTED_SCHEMA', provider: 'Invezgo', retrievedAt, requestId, raw };
      }
      const series = raw.map(r => ({ date: r.date, holderCount: Number(r.value) || null, price: Number(r.price) || null })).filter(r => r.date);
      const dataTimestamp = series.length ? series[series.length - 1].date : retrievedAt;
      return { status: 'REAL', source: 'invezgo_api', provider: 'Invezgo', symbol: ticker, retrievedAt, dataTimestamp, freshnessSeconds: freshnessSecondsFrom(dataTimestamp), requestId, series };
    } catch (e) {
      return { status: 'UNAVAILABLE', reason: 'NETWORK_ERROR', provider: 'Invezgo', retrievedAt: new Date().toISOString(), requestId: makeRequestId(), error: e.message };
    }
  });
  if (envelope.status === 'REAL') return { ok: true, source: 'invezgo_real', series: envelope.series, quality: envelope };
  return { ok: false, reason: envelope.reason || envelope.status, quality: envelope };
}

async function fetchInvezgoShareholderKsei(ticker, range) {
  const apiKey = process.env.INVEZGO_API_KEY;
  if (!apiKey) return { ok: false, reason: 'NOT_CONFIGURED' };
  const rangeMonths = Number(range) > 0 ? Number(range) : 6;
  const params = { ticker, range: rangeMonths };
  const envelope = await getOrFetch('shareholder_ksei', params, INVEZGO_SHAREHOLDER_CACHE_TTL_SEC, async () => {
    try {
      const url = `${INVEZGO_BASE_URL}/analysis/shareholder/ksei/${encodeURIComponent(ticker)}?range=${rangeMonths}`;
      const resp = await invezgoFetch(url, { headers: { 'Authorization': `Bearer ${apiKey}`, 'Accept': 'application/json' } });
      const requestId = makeRequestId();
      const retrievedAt = new Date().toISOString();

      if (resp.status === 401 || resp.status === 403) return { status: 'UNAVAILABLE', reason: 'AUTH_FAILED', provider: 'Invezgo', retrievedAt, requestId };
      if (resp.status === 402) return { status: 'UNAVAILABLE', reason: 'SUBSCRIPTION_INSUFFICIENT', provider: 'Invezgo', retrievedAt, requestId };
      if (resp.status === 429) return { status: 'UNAVAILABLE', reason: 'RATE_LIMITED', provider: 'Invezgo', retrievedAt, requestId };
      if (!resp.ok) return { status: 'UNAVAILABLE', reason: `HTTP_${resp.status}`, provider: 'Invezgo', retrievedAt, requestId };

      const raw = await resp.json();
      // Skema real BBCA: array bulanan {code, date, price, foreign_<kode>,
      // local_<kode>} untuk 9 kode kategori KSEI standar.
      if (!Array.isArray(raw)) {
        return { status: 'INVALID', reason: 'UNEXPECTED_SCHEMA', provider: 'Invezgo', retrievedAt, requestId, raw };
      }
      const categories = Object.keys(INVEZGO_KSEI_CATEGORY_LABELS);
      const series = raw.map(r => {
        const foreign = {}, local = {};
        let foreignTotal = 0, localTotal = 0;
        categories.forEach((k) => {
          const fv = Number(r['foreign_' + k]) || 0;
          const lv = Number(r['local_' + k]) || 0;
          foreign[k] = fv; local[k] = lv;
          foreignTotal += fv; localTotal += lv;
        });
        return { date: r.date, price: Number(r.price) || null, foreign, local, foreignTotal, localTotal };
      }).filter(r => r.date);
      const dataTimestamp = series.length ? series[series.length - 1].date : retrievedAt;
      return { status: 'REAL', source: 'invezgo_api', provider: 'Invezgo', symbol: ticker, retrievedAt, dataTimestamp, freshnessSeconds: freshnessSecondsFrom(dataTimestamp), requestId, series };
    } catch (e) {
      return { status: 'UNAVAILABLE', reason: 'NETWORK_ERROR', provider: 'Invezgo', retrievedAt: new Date().toISOString(), requestId: makeRequestId(), error: e.message };
    }
  });
  if (envelope.status === 'REAL') return { ok: true, source: 'invezgo_real', series: envelope.series, quality: envelope };
  return { ok: false, reason: envelope.reason || envelope.status, quality: envelope };
}

function _mapInvezgoClassificationRow(row) {
  const total = Number(row.total) || 0;
  const categories = Object.keys(row)
    .filter((k) => k !== 'code' && k !== 'date' && k !== 'total')
    .map((k) => {
      const code = k.toUpperCase();
      return { code, label: INVEZGO_CLASSIFICATION_LABELS[code] || code, value: Number(row[k]) || 0 };
    })
    .filter((c) => c.value > 0)
    .sort((a, b) => b.value - a.value);
  return { total, categories };
}

async function fetchInvezgoShareholderClassifyTable(ticker) {
  const apiKey = process.env.INVEZGO_API_KEY;
  if (!apiKey) return { ok: false, reason: 'NOT_CONFIGURED' };
  const params = { ticker };
  const envelope = await getOrFetch('shareholder_classify_table', params, INVEZGO_SHAREHOLDER_CACHE_TTL_SEC, async () => {
    try {
      const url = `${INVEZGO_BASE_URL}/analysis/shareholder/classify-table/${encodeURIComponent(ticker)}`;
      const resp = await invezgoFetch(url, { headers: { 'Authorization': `Bearer ${apiKey}`, 'Accept': 'application/json' } });
      const requestId = makeRequestId();
      const retrievedAt = new Date().toISOString();

      if (resp.status === 401 || resp.status === 403) return { status: 'UNAVAILABLE', reason: 'AUTH_FAILED', provider: 'Invezgo', retrievedAt, requestId };
      if (resp.status === 402) return { status: 'UNAVAILABLE', reason: 'SUBSCRIPTION_INSUFFICIENT', provider: 'Invezgo', retrievedAt, requestId };
      if (resp.status === 429) return { status: 'UNAVAILABLE', reason: 'RATE_LIMITED', provider: 'Invezgo', retrievedAt, requestId };
      if (!resp.ok) return { status: 'UNAVAILABLE', reason: `HTTP_${resp.status}`, provider: 'Invezgo', retrievedAt, requestId };

      const raw = await resp.json();
      // Skema real BBCA: SATU objek (snapshot bulan terakhir) berisi 39
      // kode kategori granular + `total` — TANPA field tanggal. Kode-kode
      // diterjemahkan via INVEZGO_CLASSIFICATION_LABELS (legenda resmi
      // Invezgo, dikonfirmasi user 2026-09-18, bukan tebakan).
      if (!raw || typeof raw !== 'object' || Array.isArray(raw) || !raw.total) {
        return { status: 'INVALID', reason: 'UNEXPECTED_SCHEMA', provider: 'Invezgo', retrievedAt, requestId, raw };
      }
      const mapped = _mapInvezgoClassificationRow(raw);
      // Responsnya tidak menyertakan tanggal periode laporan — jangan
      // mengarang salah satu, biarkan konsumen tahu ini tidak diketahui.
      return { status: 'REAL', source: 'invezgo_api', provider: 'Invezgo', symbol: ticker, retrievedAt, dataTimestamp: null, freshnessSeconds: null, periodUnknown: true, requestId, total: mapped.total, categories: mapped.categories };
    } catch (e) {
      return { status: 'UNAVAILABLE', reason: 'NETWORK_ERROR', provider: 'Invezgo', retrievedAt: new Date().toISOString(), requestId: makeRequestId(), error: e.message };
    }
  });
  if (envelope.status === 'REAL') return { ok: true, source: 'invezgo_real', total: envelope.total, categories: envelope.categories, periodUnknown: envelope.periodUnknown, quality: envelope };
  return { ok: false, reason: envelope.reason || envelope.status, quality: envelope };
}

async function fetchInvezgoShareholderClassification(ticker, range) {
  const apiKey = process.env.INVEZGO_API_KEY;
  if (!apiKey) return { ok: false, reason: 'NOT_CONFIGURED' };
  const rangeMonths = Number(range) > 0 ? Number(range) : 6;
  const params = { ticker, range: rangeMonths };
  const envelope = await getOrFetch('shareholder_classification', params, INVEZGO_SHAREHOLDER_CACHE_TTL_SEC, async () => {
    try {
      const url = `${INVEZGO_BASE_URL}/analysis/shareholder/classification/${encodeURIComponent(ticker)}?range=${rangeMonths}`;
      const resp = await invezgoFetch(url, { headers: { 'Authorization': `Bearer ${apiKey}`, 'Accept': 'application/json' } });
      const requestId = makeRequestId();
      const retrievedAt = new Date().toISOString();

      if (resp.status === 401 || resp.status === 403) return { status: 'UNAVAILABLE', reason: 'AUTH_FAILED', provider: 'Invezgo', retrievedAt, requestId };
      if (resp.status === 402) return { status: 'UNAVAILABLE', reason: 'SUBSCRIPTION_INSUFFICIENT', provider: 'Invezgo', retrievedAt, requestId };
      if (resp.status === 429) return { status: 'UNAVAILABLE', reason: 'RATE_LIMITED', provider: 'Invezgo', retrievedAt, requestId };
      if (!resp.ok) return { status: 'UNAVAILABLE', reason: `HTTP_${resp.status}`, provider: 'Invezgo', retrievedAt, requestId };

      const raw = await resp.json();
      // Skema real BBCA: array time-series dari struktur yang sama seperti
      // classify-table, tapi tiap entri PUNYA `date` bulanan.
      if (!Array.isArray(raw)) {
        return { status: 'INVALID', reason: 'UNEXPECTED_SCHEMA', provider: 'Invezgo', retrievedAt, requestId, raw };
      }
      const series = raw.filter(r => r && r.date).map(r => {
        const mapped = _mapInvezgoClassificationRow(r);
        return { date: r.date, total: mapped.total, categories: mapped.categories };
      });
      const dataTimestamp = series.length ? series[series.length - 1].date : retrievedAt;
      return { status: 'REAL', source: 'invezgo_api', provider: 'Invezgo', symbol: ticker, retrievedAt, dataTimestamp, freshnessSeconds: freshnessSecondsFrom(dataTimestamp), requestId, series };
    } catch (e) {
      return { status: 'UNAVAILABLE', reason: 'NETWORK_ERROR', provider: 'Invezgo', retrievedAt: new Date().toISOString(), requestId: makeRequestId(), error: e.message };
    }
  });
  if (envelope.status === 'REAL') return { ok: true, source: 'invezgo_real', series: envelope.series, quality: envelope };
  return { ok: false, reason: envelope.reason || envelope.status, quality: envelope };
}

// ── Invezgo API integration (Sector Rotation / RRG) ──
// Skema dikonfirmasi dari file spec OpenAPI RESMI Invezgo (bukan tebakan,
// bukan hasil trial-and-error) yang di-upload user 2026-09-18:
// GET /analysis/sector/rotation, param wajib from/to (YYYY-MM-DD), optional
// base (default COMPOSITE — level indeks sektoral, nilai lain seperti IDX30
// mengembalikan rotasi ANTAR SAHAM dalam indeks itu, di luar cakupan fitur
// ini), length (5-50, default 10), interval (daily/weekly, default weekly
// per deskripsi), tail (1-52, default 5). Respons 200 (data ada):
// {benchmark, lastDate, data:[{code, name, trail:[{date,x,y}], quadrant}]}
// — x/y adalah koordinat RS-Ratio/RS-Momentum (RRG), quadrant salah satu
// dari leading/weakening/lagging/improving. Respons kosong (`data:[]`,
// didokumentasikan sebagai kode 204 meski server kadang mengembalikannya
// dengan kode 200) adalah KASUS RESMI "data tidak tersedia untuk rentang
// ini" — bukan error, bukan bug, honestly surfaced sebagai NO_DATA.
const INVEZGO_SECTOR_ROTATION_CACHE_TTL_SEC = Number(process.env.INVEZGO_SECTOR_ROTATION_CACHE_TTL_SEC || 86400); // update harian setelah penutupan pasar

async function fetchInvezgoSectorRotation(toDate) {
  const apiKey = process.env.INVEZGO_API_KEY;
  if (!apiKey) return { ok: false, reason: 'NOT_CONFIGURED' };

  const to = toDate || new Date().toISOString().slice(0, 10);
  // Rentang ~180 hari kalender supaya cukup titik mingguan untuk
  // length=10 (smoothing) + tail=5 (trailing points) = minimal 15 periode
  // mingguan (~105 hari); 180 hari memberi margin aman.
  const fromD = new Date(to + 'T00:00:00Z');
  fromD.setUTCDate(fromD.getUTCDate() - 180);
  const from = fromD.toISOString().slice(0, 10);

  const params = { from, to, base: 'COMPOSITE' };
  const envelope = await getOrFetch('sector_rotation', params, INVEZGO_SECTOR_ROTATION_CACHE_TTL_SEC, async () => {
    try {
      const url = `${INVEZGO_BASE_URL}/analysis/sector/rotation?from=${from}&to=${to}&base=COMPOSITE&interval=weekly&length=10&tail=5`;
      const resp = await invezgoFetch(url, { headers: { 'Authorization': `Bearer ${apiKey}`, 'Accept': 'application/json' } });
      const requestId = makeRequestId();
      const retrievedAt = new Date().toISOString();

      if (resp.status === 401 || resp.status === 403) return { status: 'UNAVAILABLE', reason: 'AUTH_FAILED', provider: 'Invezgo', retrievedAt, requestId };
      if (resp.status === 402) return { status: 'UNAVAILABLE', reason: 'SUBSCRIPTION_INSUFFICIENT', provider: 'Invezgo', retrievedAt, requestId };
      if (resp.status === 429) return { status: 'UNAVAILABLE', reason: 'RATE_LIMITED', provider: 'Invezgo', retrievedAt, requestId };
      if (resp.status === 204) return { status: 'UNAVAILABLE', reason: 'NO_DATA', provider: 'Invezgo', retrievedAt, requestId };
      if (!resp.ok) return { status: 'UNAVAILABLE', reason: `HTTP_${resp.status}`, provider: 'Invezgo', retrievedAt, requestId };

      const raw = await resp.json();
      if (!raw || !Array.isArray(raw.data)) {
        return { status: 'INVALID', reason: 'UNEXPECTED_SCHEMA', provider: 'Invezgo', retrievedAt, requestId, raw };
      }
      // data:[] adalah respons resmi "tidak tersedia" (lihat komentar di
      // atas) — honest UNAVAILABLE/NO_DATA, bukan array kosong yang
      // diteruskan diam-diam sebagai "REAL tapi kosong".
      if (raw.data.length === 0) {
        return { status: 'UNAVAILABLE', reason: 'NO_DATA', provider: 'Invezgo', retrievedAt, requestId, lastDate: raw.lastDate };
      }

      const sectors = raw.data.map((s) => {
        const trail = Array.isArray(s.trail) ? s.trail.map((t) => ({ date: t.date, x: Number(t.x), y: Number(t.y) })) : [];
        const latest = trail.length ? trail[trail.length - 1] : null;
        return { code: s.code, name: s.name, quadrant: s.quadrant || null, x: latest ? latest.x : null, y: latest ? latest.y : null, trail };
      });
      const dataTimestamp = raw.lastDate || retrievedAt;
      return { status: 'REAL', source: 'invezgo_api', provider: 'Invezgo', retrievedAt, dataTimestamp, freshnessSeconds: freshnessSecondsFrom(dataTimestamp), requestId, benchmark: raw.benchmark, sectors };
    } catch (e) {
      return { status: 'UNAVAILABLE', reason: 'NETWORK_ERROR', provider: 'Invezgo', retrievedAt: new Date().toISOString(), requestId: makeRequestId(), error: e.message };
    }
  });

  if (envelope.status === 'REAL') return { ok: true, source: 'invezgo_real', benchmark: envelope.benchmark, sectors: envelope.sectors, quality: envelope };
  return { ok: false, reason: envelope.reason || envelope.status, quality: envelope };
}

// ── Invezgo API integration (Master Screener Fase 1 — POST /screener/screen) ──
// Skema dikonfirmasi live oleh user (AUDIT_INVEZGO_UNUSED_ENDPOINTS_2026-09-18.md):
// formula string bebas (mis. "per > 0 AND per < 15 AND roe > 15"), 1 panggilan
// men-scan SELURUH pasar (bukan per-ticker), respons array
// [{code, matched:true, <field-di-formula>: number}] — HANYA baris yang match
// yang dikembalikan.
//
// DUA BAHAYA yang dikonfirmasi lewat pengujian live user, keduanya WAJIB
// ditangani di sini (bukan di caller) supaya semua konsumen fitur ini otomatis
// aman:
// 1. Field name yang salah/huruf besar TIDAK error — diam-diam jadi 0, sehingga
//    kondisi seperti "PER > 0" bisa lolos sebagai matched:true untuk semua
//    saham tanpa peringatan apa pun. Makanya validator di bawah pakai ALLOWLIST
//    KETAT hanya 4 field yang sudah terbukti live: close/pbv/per/roe (huruf
//    kecil PERSIS — sengaja TIDAK case-insensitive, supaya field yang salah
//    kapitalisasi ditolak di sini, bukan diam-diam jadi 0 di server Invezgo).
//    Formula yang mengandung token lain ditolak SEBELUM reserveQuota()
//    dipanggil sama sekali (status INVALID, 0 kuota terpakai) — field baru di
//    luar 4 ini harus diverifikasi live dulu (lihat CLAUDE.md §1/§3) sebelum
//    ditambah ke INVEZGO_SCREENER_ALLOWED_FIELDS.
// 2. Endpoint ini throttle lebih ketat dari kuota bulanan biasa — 429 muncul
//    bahkan dengan jeda 5-8 detik antar panggilan pada pengujian live user.
//    _screenerThrottleWait() di bawah memberi jeda minimum tersendiri
//    (terpisah dari MAX_CONCURRENCY/reserveQuota di atas, yang mengatur
//    keseluruhan API Invezgo, bukan endpoint ini secara spesifik) sebelum
//    request nyata dikirim.
const INVEZGO_SCREENER_CACHE_TTL_SEC = Number(process.env.INVEZGO_SCREENER_CACHE_TTL_SEC || 86400); // EOD batch, sama seperti top movers
const INVEZGO_SCREENER_MIN_INTERVAL_MS = Number(process.env.INVEZGO_SCREENER_MIN_INTERVAL_MS || 8000);
const INVEZGO_SCREENER_ALLOWED_FIELDS = new Set(['close', 'pbv', 'per', 'roe']);

function validateScreenerFormula(formula) {
  if (!formula || typeof formula !== 'string' || !formula.trim()) {
    return { valid: false, reason: 'EMPTY_FORMULA' };
  }
  const tokens = formula.match(/[a-zA-Z_][a-zA-Z0-9_]*/g) || [];
  const OPERATORS = new Set(['AND', 'OR', 'NOT', 'and', 'or', 'not']);
  const unknownFields = [];
  for (const tok of tokens) {
    if (OPERATORS.has(tok)) continue;
    if (!INVEZGO_SCREENER_ALLOWED_FIELDS.has(tok)) unknownFields.push(tok);
  }
  if (unknownFields.length > 0) {
    return { valid: false, reason: 'UNKNOWN_FIELD', unknownFields: [...new Set(unknownFields)] };
  }
  return { valid: true };
}

// Distributed-enough for Fase 1: reads/writes a shared last-call timestamp
// (Redis when configured, per-instance Map fallback otherwise — same
// storeGet/storeSetEx helpers as the rest of this file) and sleeps out the
// remainder of the minimum interval before the caller is allowed to send the
// real HTTP request. Not a perfect cross-instance lock (two concurrent cold
// starts could still race), but this endpoint is user-triggered and
// low-frequency by design (whole-market scan, not per-ticker polling), so a
// best-effort shared gate is a reasonable Fase 1 scope — a hard Redis
// SET-NX lock can be added later if concurrent screener usage becomes real.
async function _screenerThrottleWait() {
  const key = 'invezgo:screener:lastcall';
  const now = Date.now();
  const last = Number((await storeGet(key)) || 0);
  const elapsed = now - last;
  if (elapsed < INVEZGO_SCREENER_MIN_INTERVAL_MS) {
    await new Promise(r => setTimeout(r, INVEZGO_SCREENER_MIN_INTERVAL_MS - elapsed));
  }
  await storeSetEx(key, Date.now(), 60);
}

async function fetchInvezgoScreener(formula) {
  const apiKey = process.env.INVEZGO_API_KEY;
  if (!apiKey) return { ok: false, reason: 'NOT_CONFIGURED' };

  const validation = validateScreenerFormula(formula);
  if (!validation.valid) {
    return { ok: false, reason: validation.reason, unknownFields: validation.unknownFields || [], quality: { status: 'INVALID', reason: validation.reason } };
  }

  const params = { formula };
  const envelope = await getOrFetch('screener_screen', params, INVEZGO_SCREENER_CACHE_TTL_SEC, async () => {
    try {
      await _screenerThrottleWait();
      const resp = await invezgoFetch(`${INVEZGO_BASE_URL}/screener/screen`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Accept': 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ formula })
      });
      const requestId = makeRequestId();
      const retrievedAt = new Date().toISOString();

      if (resp.status === 401 || resp.status === 403) return { status: 'UNAVAILABLE', reason: 'AUTH_FAILED', provider: 'Invezgo', retrievedAt, requestId };
      if (resp.status === 402) return { status: 'UNAVAILABLE', reason: 'SUBSCRIPTION_INSUFFICIENT', provider: 'Invezgo', retrievedAt, requestId };
      if (resp.status === 429) return { status: 'UNAVAILABLE', reason: 'RATE_LIMITED', provider: 'Invezgo', retrievedAt, requestId };
      if (!resp.ok) return { status: 'UNAVAILABLE', reason: `HTTP_${resp.status}`, provider: 'Invezgo', retrievedAt, requestId };

      const raw = await resp.json();
      if (!Array.isArray(raw)) {
        return { status: 'INVALID', reason: 'UNEXPECTED_SCHEMA', provider: 'Invezgo', retrievedAt, requestId, raw };
      }
      const matched = raw.filter(r => r && r.matched === true && r.code);
      const dataTimestamp = retrievedAt;
      return { status: 'REAL', source: 'invezgo_api', provider: 'Invezgo', retrievedAt, dataTimestamp, freshnessSeconds: freshnessSecondsFrom(dataTimestamp), requestId, formula, matched };
    } catch (e) {
      return { status: 'UNAVAILABLE', reason: 'NETWORK_ERROR', provider: 'Invezgo', retrievedAt: new Date().toISOString(), requestId: makeRequestId(), error: e.message };
    }
  });

  if (envelope.status === 'REAL') return { ok: true, source: 'invezgo_real', formula, matched: envelope.matched, quality: envelope };
  return { ok: false, reason: envelope.reason || envelope.status, quality: envelope };
}

// Invezgo API Live Health and Key Verification
// Checks live connectivity against https://api.invezgo.com/usage/api
// to verify that INVEZGO_API_KEY is configured, valid, and has Advance access.
async function checkInvezgoLiveStatus() {
  const apiKey = process.env.INVEZGO_API_KEY;
  if (!apiKey) {
    return {
      configured: false,
      status: 'NOT_CONFIGURED',
      message: 'INVEZGO_API_KEY belum dikonfigurasi di environment server (.env atau Vercel Environment Variables).'
    };
  }
  try {
    const resp = await invezgoFetch(`${INVEZGO_BASE_URL}/usage/api`, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Accept': 'application/json'
      }
    });
    if (resp.status === 200) {
      const data = await resp.json();
      return {
        configured: true,
        status: 'ACTIVE',
        httpStatus: 200,
        quota: data,
        message: 'Koneksi ke Invezgo API berhasil dan aktif.'
      };
    }
    if (resp.status === 401) {
      return {
        configured: true,
        status: 'UNAUTHORIZED',
        httpStatus: 401,
        message: 'Token API tidak valid atau sesi kadaluarsa. Pastikan token di-generate dari https://invezgo.com/id/setting/api.'
      };
    }
    if (resp.status === 403) {
      return {
        configured: true,
        status: 'FORBIDDEN',
        httpStatus: 403,
        message: 'Akun Invezgo Anda tidak memiliki akses API. Pastikan langganan paket Anda aktif dan mencakup akses API (Advance plan).'
      };
    }
    return {
      configured: true,
      status: `HTTP_${resp.status}`,
      httpStatus: resp.status,
      message: `Invezgo API merespons dengan status HTTP ${resp.status}.`
    };
  } catch (err) {
    return {
      configured: true,
      status: 'NETWORK_ERROR',
      message: `Gagal menghubungi api.invezgo.com: ${err.message}`
    };
  }
}

export {
  getRedis,
  getQuotaUsage,
  reserveQuota,
  recordMetric,
  getMetricsToday,
  getOrFetch,
  invezgoFetch,
  makeRequestId,
  freshnessSecondsFrom,
  fetchInvezgoBrokerSummary,
  fetchInvezgoBrokerSummaryByBroker,
  fetchInvezgoTradeFlow,
  fetchInvezgoBrokerFlow,
  fetchInvezgoTopMovers,
  fetchInvezgoCalendar,
  fetchInvezgoFinancialStatement,
  fetchInvezgoShareholderNumber,
  fetchInvezgoShareholderKsei,
  fetchInvezgoShareholderClassifyTable,
  fetchInvezgoShareholderClassification,
  fetchInvezgoSectorRotation,
  fetchInvezgoScreener,
  validateScreenerFormula,
  INVEZGO_SCREENER_ALLOWED_FIELDS,
  INVEZGO_KSEI_CATEGORY_LABELS,
  INVEZGO_CLASSIFICATION_LABELS,
  MONTHLY_QUOTA,
  MAX_CONCURRENCY,
  checkInvezgoLiveStatus,
  getLatestEodTradingDate
};
