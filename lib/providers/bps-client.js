/**
 * lib/providers/bps-client.js
 * Badan Pusat Statistik (BPS) WebAPI provider adapter.
 *
 * STATUS (2026-09-29): URL format dikoreksi ke QUERY-STRING
 * (`/v1/api/list/?model=X&domain=Y&...`), diverifikasi dari dokumentasi
 * resmi (https://webapi.bps.go.id/documentation/#domain, screenshot
 * user) DAN community Postman collection (GitHub, sumber sekunder) —
 * format path-segment sebelumnya (model/lang/domain/key sebagai segmen
 * URL berurutan, bukan query string) adalah tebakan dari web search yang
 * TIDAK terverifikasi dan sekarang terbukti salah. Skema respons Strategic Indicators (`model=indicators`)
 * SUDAH terverifikasi dari dokumentasi resmi (lihat
 * fetchBpsStrategicIndicators() di bawah) — field lain (inflasi/PDB/
 * ekspor-impor via `model=data`, dst) MASIH belum diverifikasi, jangan
 * ditambah tanpa contoh respons/dokumentasi resmi lebih dulu.
 *
 * Sandbox sesi ini tetap tidak bisa menjangkau webapi.bps.go.id (proxy
 * egress memblokir domain ini sepenuhnya, terpisah dari status API key)
 * — jadi fungsi-fungsi di file ini TIDAK PERNAH diuji hidup dari sini,
 * hanya diverifikasi terhadap dokumentasi resmi per CLAUDE.md Aturan #1.
 *
 * What IS built here (safe without live verification):
 * - Config/env reading (fail-closed to NOT_CONFIGURED, never fabricates).
 * - checkBpsLiveStatus() — health probe, mirrors checkInvezgoLiveStatus()'s
 *   shape (lib/invezgo-client.js) for consistency across this app's
 *   provider health checks.
 * - bpsListModels() — BPS's own dataset-discovery endpoint. Response
 *   SCHEMA (field names, nesting) untuk model selain 'indicators' BELUM
 *   diverifikasi dari respons real, jadi raw dikembalikan apa adanya
 *   (schemaVerified:false) — jangan dipetakan ke field spesifik.
 * - fetchBpsStrategicIndicators() — parser TERVERIFIKASI untuk
 *   `model=indicators` (lihat komentar fungsi untuk sumber verifikasi).
 *
 * Indicator-specific fetchers lain (inflation, GDP, trade, labor, etc.
 * via `model=data`) deliberately NOT built yet — building them requires
 * first running discovery (bpsListModels()) against a real key to find
 * the correct dataset_id/var codes (per this feature's spec §7: "Jangan
 * hard-code kode indikator secara sembarangan"). Add them here once a
 * human supplies BPS_API_KEY + at least one real captured response atau
 * dokumentasi resmi skema yang setara.
 *
 * GAP YANG BELUM TERSELESAIKAN: parameter `domain` untuk Strategic
 * Indicators butuh kode wilayah 4-digit ("central and province domain"
 * per dokumentasi resmi) — kode yang benar untuk level nasional/pusat
 * BELUM diverifikasi (dokumentasi Strategic Indicators tidak menyebutkan
 * nilai spesifiknya, dan halaman dokumentasi "Domain" terpisah belum
 * pernah dilihat langsung di sesi ini). JANGAN menebak nilai default —
 * `domain` di fetchBpsStrategicIndicators() adalah parameter WAJIB dari
 * caller, tanpa default internal, sampai kode ini terverifikasi.
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
    const url = `${BPS_API_BASE_URL}/v1/api/list/?model=list&lang=ind&key=${encodeURIComponent(apiKey)}`;
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
// CATATAN: default domain='0000' di bawah adalah carry-over dari asumsi
// SEBELUM sesi ini memverifikasi dokumentasi resmi — kode wilayah
// nasional/pusat BPS yang benar BELUM dikonfirmasi (lihat catatan file
// di atas). Caller yang butuh domain terverifikasi harus mengoper
// eksplisit, bukan mengandalkan default ini.
async function bpsListModels(model = 'data', domain = '0000') {
  const apiKey = getBpsApiKey();
  if (!apiKey) {
    return { ok: false, reason: 'NOT_CONFIGURED', raw: null };
  }
  try {
    const url = `${BPS_API_BASE_URL}/v1/api/list/?model=${encodeURIComponent(model)}&domain=${encodeURIComponent(domain)}&lang=ind&key=${encodeURIComponent(apiKey)}`;
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

// Strategic Indicators (`model=indicators`) — TERVERIFIKASI dari
// dokumentasi resmi BPS WebAPI (https://webapi.bps.go.id/documentation/,
// halaman Strategic Indicators, screenshot tabel parameter & response
// "Success 200" yang dikonfirmasi user, termasuk konfirmasi eksplisit
// user "tidak ada filed lain" untuk field di bawah `unit`) — BUKAN
// tebakan. Ini SATU-SATUNYA fetcher indikator BPS di file ini yang
// skemanya sudah diverifikasi; jangan jadikan pola ini contoh untuk
// menebak skema `model` lain.
//
// Request params resmi:
//   model  : fixed 'indicators' (di-hardcode di sini, bukan parameter caller)
//   domain : WAJIB, angka 4-digit ("central and province domain" per
//            dokumentasi) — TIDAK ADA DEFAULT di sini karena kode untuk
//            level nasional/pusat belum terverifikasi (lihat catatan file
//            di atas). Caller HARUS menyediakan nilai eksplisit.
//   var    : opsional, Number — ID variabel untuk filter indikator tertentu.
//   page   : opsional, Number — halaman hasil (pagination BPS).
//   lang   : opsional, default 'ind' (juga bisa 'eng').
//   key    : dari getBpsApiKey(), wajib.
//
// Response shape resmi:
//   { status, "data-availability", data: [ {page,pages,per_page,count,total}, [ {title,desc,data_source,value,unit}, ... ] ] }
// Fungsi ini mengembalikan array item APA ADANYA sesuai field resmi di
// atas — TIDAK menambah field turunan (period/frequency/geography) yang
// tidak disediakan endpoint ini, karena itu akan berarti mengarang data
// (CLAUDE.md Aturan #1 & #3).
async function fetchBpsStrategicIndicators({ domain, lang = 'ind', varId, page } = {}) {
  const apiKey = getBpsApiKey();
  if (!apiKey) {
    return { ok: false, reason: 'NOT_CONFIGURED', items: null, pagination: null };
  }
  if (!domain) {
    return {
      ok: false,
      reason: 'DOMAIN_REQUIRED',
      items: null,
      pagination: null,
      message: 'Parameter domain wajib diisi caller — kode wilayah nasional/pusat BPS belum terverifikasi di file ini, tidak ada default yang aman dipakai.'
    };
  }
  try {
    let url = `${BPS_API_BASE_URL}/v1/api/list/?model=indicators&domain=${encodeURIComponent(domain)}&lang=${encodeURIComponent(lang)}&key=${encodeURIComponent(apiKey)}`;
    if (varId != null) url += `&var=${encodeURIComponent(varId)}`;
    if (page != null) url += `&page=${encodeURIComponent(page)}`;
    const resp = await bpsFetch(url, { headers: { Accept: 'application/json' } });
    if (!resp.ok) {
      return { ok: false, reason: `HTTP_${resp.status}`, items: null, pagination: null };
    }
    const raw = await resp.json().catch(() => null);
    if (!raw || raw.status !== 'OK' || !Array.isArray(raw.data) || raw.data.length < 2) {
      return { ok: false, reason: 'UNEXPECTED_RESPONSE_SHAPE', items: null, pagination: null, raw };
    }
    const [pagination, items] = raw.data;
    return {
      ok: true,
      reason: null,
      pagination: pagination || null,
      items: Array.isArray(items) ? items.map(it => ({
        title: it.title != null ? String(it.title) : null,
        desc: it.desc != null ? String(it.desc) : null,
        dataSource: it.data_source != null ? String(it.data_source) : null,
        value: it.value != null ? Number(it.value) : null,
        unit: it.unit != null ? String(it.unit) : null
      })) : []
    };
  } catch (e) {
    return { ok: false, reason: 'NETWORK_ERROR', items: null, pagination: null, error: e.message };
  }
}

export {
  BPS_API_BASE_URL,
  BPS_TIMEOUT_MS,
  BPS_CACHE_TTL_SEC,
  getBpsApiKey,
  checkBpsLiveStatus,
  bpsListModels,
  fetchBpsStrategicIndicators
};
