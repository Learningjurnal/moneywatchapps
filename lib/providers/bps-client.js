/**
 * lib/providers/bps-client.js
 * Badan Pusat Statistik (BPS) WebAPI provider adapter.
 *
 * STATUS (2026-09-28): SKELETON ONLY. No indicator parser (inflasi/PDB/
 * ekspor-impor/dst) is implemented yet — per CLAUDE.md Aturan #1 (Zero
 * Fabricated Data) and this feature's own governing spec, a parser must
 * never be written against a GUESSED response schema. This session's
 * sandbox has its egress proxy blocking webapi.bps.go.id entirely
 * (confirmed: `curl` to it returns a 403 policy denial from the proxy,
 * not a DNS/network failure), and there is no BPS_API_KEY configured —
 * registration at https://webapi.bps.go.id/developer requires a human,
 * not something this session can do on its own.
 *
 * What IS built here (safe without live verification):
 * - Config/env reading (fail-closed to NOT_CONFIGURED, never fabricates).
 * - checkBpsLiveStatus() — health probe, mirrors checkInvezgoLiveStatus()'s
 *   shape (lib/invezgo-client.js) for consistency across this app's
 *   provider health checks.
 * - bpsListModels() — BPS's own dataset-discovery endpoint. The URL
 *   STRUCTURE below (`/v1/api/list/model/{model}/lang/{lang}/domain/{domain}/key/{key}`)
 *   is BPS's publicly documented WebAPI pattern (webapi.bps.go.id/developer)
 *   — but the RESPONSE SCHEMA (field names, nesting) has NOT been verified
 *   against a real captured response from this session, so callers must
 *   treat the raw response as opaque/unverified until a human confirms it.
 *
 * Indicator-specific fetchers (inflation, GDP, trade, labor, etc.) are
 * deliberately NOT built yet — building them requires first running
 * discovery (bpsListModels()) against a real key to find the correct
 * dataset_id/var codes (per this feature's spec §7: "Jangan hard-code
 * kode indikator secara sembarangan"). Add them here once a human
 * supplies BPS_API_KEY + at least one real captured response.
 */

const BPS_API_BASE_URL = process.env.BPS_API_BASE_URL || 'https://webapi.bps.go.id';
const BPS_TIMEOUT_MS = Number(process.env.BPS_TIMEOUT_MS || 10000);
const BPS_CACHE_TTL_SEC = Number(process.env.BPS_CACHE_TTL || 21600); // 6 jam default — BPS merilis data periodik (bulanan/kuartalan), bukan real-time.

function getBpsApiKey() {
  return process.env.BPS_API_KEY || null;
}

// Fetch wrapper dengan timeout eksplisit (pola sama seperti invezgoFetch()/
// fetchYahooQuote() di provider lain app ini — AbortSignal.timeout, bukan
// biarkan request menggantung tanpa batas).
async function bpsFetch(url, opts = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), BPS_TIMEOUT_MS);
  try {
    return await fetch(url, { ...opts, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// Health check — mirrors checkInvezgoLiveStatus()'s response shape
// (lib/invezgo-client.js) so /api/economic/health can combine BI/BPS/
// Invezgo statuses uniformly.
async function checkBpsLiveStatus() {
  const apiKey = getBpsApiKey();
  if (!apiKey) {
    return {
      configured: false,
      status: 'NOT_CONFIGURED',
      message: 'BPS_API_KEY belum dikonfigurasi di environment server. Daftar gratis di https://webapi.bps.go.id/developer untuk mendapatkan token.'
    };
  }
  try {
    const url = `${BPS_API_BASE_URL}/v1/api/list/model/list/lang/ind/domain/0000/key/${encodeURIComponent(apiKey)}`;
    const resp = await bpsFetch(url, { headers: { Accept: 'application/json' } });
    if (resp.status === 200) {
      const data = await resp.json().catch(() => null);
      return {
        configured: true,
        status: data ? 'ACTIVE' : 'INVALID_RESPONSE',
        httpStatus: 200,
        message: data ? 'Koneksi ke BPS WebAPI berhasil.' : 'BPS WebAPI mengembalikan 200 tapi body bukan JSON valid.'
      };
    }
    return {
      configured: true,
      status: 'UNAVAILABLE',
      httpStatus: resp.status,
      message: `BPS WebAPI mengembalikan HTTP ${resp.status}.`
    };
  } catch (e) {
    return {
      configured: true,
      status: 'UNAVAILABLE',
      message: `Gagal menghubungi BPS WebAPI: ${e.message}`
    };
  }
}

// Dataset discovery — BPS's own "list" endpoint. `model` mengikuti param
// resmi BPS WebAPI: 'data' (daftar tabel dinamis), 'subject' (daftar
// subjek/kategori), 'unit', 'var' (variabel), dst — lihat dokumentasi
// resmi di https://webapi.bps.go.id/developer sebelum memakai model lain.
// Response BELUM diverifikasi dari respons real — raw dikembalikan apa
// adanya, TIDAK dipetakan ke field spesifik (lihat catatan file di atas).
async function bpsListModels(model = 'data', domain = '0000') {
  const apiKey = getBpsApiKey();
  if (!apiKey) {
    return { ok: false, reason: 'NOT_CONFIGURED', raw: null };
  }
  try {
    const url = `${BPS_API_BASE_URL}/v1/api/list/model/${encodeURIComponent(model)}/lang/ind/domain/${encodeURIComponent(domain)}/key/${encodeURIComponent(apiKey)}`;
    const resp = await bpsFetch(url, { headers: { Accept: 'application/json' } });
    if (!resp.ok) {
      return { ok: false, reason: `HTTP_${resp.status}`, raw: null };
    }
    const raw = await resp.json().catch(() => null);
    if (!raw) {
      return { ok: false, reason: 'INVALID_JSON', raw: null };
    }
    // Sengaja TIDAK dipetakan ke shape ternormalisasi — schema belum
    // terverifikasi. Caller (dan manusia yang review) harus melihat raw
    // apa adanya sebelum ada parser resmi ditulis.
    return { ok: true, reason: null, raw, schemaVerified: false };
  } catch (e) {
    return { ok: false, reason: 'NETWORK_ERROR', raw: null, error: e.message };
  }
}

export {
  BPS_API_BASE_URL,
  BPS_TIMEOUT_MS,
  BPS_CACHE_TTL_SEC,
  getBpsApiKey,
  checkBpsLiveStatus,
  bpsListModels
};
