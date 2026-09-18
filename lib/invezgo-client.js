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

async function invezgoFetch(url, options = {}) {
  await acquireSlot();
  try {
    let lastResp = null;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const resp = await fetch(url, options);
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
  const params = { ticker, fromDate: fromDate || '', toDate: toDate || '' };
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
      const url = `${INVEZGO_BASE_URL}/analysis/summary/stock/${encodeURIComponent(ticker)}` +
        (fromDate && toDate ? `?from=${fromDate}&to=${toDate}&investor=all&market=RG` : '');
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

  const params = { kind: safeKind, date: date || '' };
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
  fetchInvezgoTopMovers,
  MONTHLY_QUOTA,
  MAX_CONCURRENCY
};
