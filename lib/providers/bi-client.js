/**
 * lib/providers/bi-client.js
 * Bank Indonesia (BI) provider adapter — JISDOR, Kurs Transaksi BI, dst.
 *
 * STATUS (2026-09-28): SKELETON ONLY, health-check capable, NO data
 * parser yet. BI's official web service (wskursbi.asmx) is a SOAP/XML
 * (WSDL) endpoint — a completely different protocol from every other
 * integration in this app (Invezgo, Yahoo Finance are both plain REST/
 * JSON). This session cannot reach www.bi.go.id at all from its sandbox
 * (proxy returns a 403 policy denial, confirmed via curl — not a DNS/
 * network issue), so there is no way to capture and verify a real SOAP
 * response from here, and this app has no SOAP client/XML-parsing
 * dependency installed to build one against a guessed envelope anyway.
 *
 * Per CLAUDE.md Aturan #1 (Zero Fabricated Data) and this feature's own
 * spec §3 ("Untuk dataset BI yang belum memiliki API resmi terverifikasi:
 * access = 'not_verified'"), no SOAP request/response parsing is written
 * here — doing so would mean guessing the SOAPAction header, envelope
 * shape, and field names, which is exactly what's forbidden.
 *
 * What IS built here: config, a lightweight reachability probe (fetches
 * the WSDL description — a GET, not a real SOAP call — just to report
 * online/offline for the health check), and stub fetchers for JISDOR/
 * Kurs Transaksi that honestly return access:'not_verified' without
 * attempting to fabricate a SOAP request body. Fill these in once a
 * human supplies a real captured SOAP response (e.g. from SoapUI/Postman
 * against the WSDL, or BI's own published sample) — see this file's
 * TODO markers below.
 */

const BI_API_BASE_URL = process.env.BI_API_BASE_URL || 'https://www.bi.go.id/biwebservice/wskursbi.asmx';
const BI_TIMEOUT_MS = Number(process.env.BI_TIMEOUT_MS || 10000);

async function biFetch(url, opts = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), BI_TIMEOUT_MS);
  try {
    return await fetch(url, { ...opts, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// Health check — GET terhadap deskripsi WSDL (bukan panggilan SOAP
// sungguhan) hanya untuk mengonfirmasi domain BI bisa dijangkau dari
// server tempat app ini di-deploy. BI's wskursbi.asmx tidak butuh API
// key (layanan publik), jadi tidak ada status NOT_CONFIGURED di sini —
// cuma reachable/unreachable.
async function checkBiLiveStatus() {
  try {
    const resp = await biFetch(BI_API_BASE_URL, { method: 'GET' });
    if (resp.ok) {
      return {
        configured: true,
        status: 'REACHABLE',
        httpStatus: resp.status,
        message: 'Domain BI web service bisa dijangkau. Endpoint SOAP spesifik (JISDOR/Kurs Transaksi) belum diverifikasi — lihat access:"not_verified" pada fetcher masing-masing.'
      };
    }
    return {
      configured: true,
      status: 'UNAVAILABLE',
      httpStatus: resp.status,
      message: `BI web service mengembalikan HTTP ${resp.status}.`
    };
  } catch (e) {
    return {
      configured: true,
      status: 'UNAVAILABLE',
      message: `Gagal menghubungi BI web service: ${e.message}`
    };
  }
}

// TODO (butuh sampel respons real sebelum diimplementasikan — lihat
// catatan file di atas): operasi SOAP resmi untuk JISDOR di wskursbi.asmx
// belum diverifikasi dari respons real. JANGAN isi fungsi ini dengan
// SOAPAction/envelope tebakan.
async function fetchBiJisdor() {
  return {
    ok: false,
    access: 'not_verified',
    reason: 'SOAP_SCHEMA_NOT_VERIFIED',
    message: 'Operasi SOAP JISDOR belum diverifikasi dari respons real BI. Butuh sampel respons (mis. lewat SoapUI/Postman terhadap WSDL) sebelum parser ditulis.'
  };
}

// TODO — sama seperti fetchBiJisdor(), untuk Kurs Transaksi BI.
async function fetchBiKursTransaksi(_currencyCode, _date) {
  return {
    ok: false,
    access: 'not_verified',
    reason: 'SOAP_SCHEMA_NOT_VERIFIED',
    message: 'Operasi SOAP Kurs Transaksi BI belum diverifikasi dari respons real. Butuh sampel respons sebelum parser ditulis.'
  };
}

export {
  BI_API_BASE_URL,
  BI_TIMEOUT_MS,
  checkBiLiveStatus,
  fetchBiJisdor,
  fetchBiKursTransaksi
};
