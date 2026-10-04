/**
 * 03b-regime-store.js — SATU sumber Market Regime untuk seluruh UI.
 *
 * FIX (2026-10-04, user-reported: "Market Regime & Tactical Allocation berbeda
 * dengan Market Regime pada Autonomous AI Trading, kenapa ada 2 namun
 * berbeda"): klasifikasi regime ditampilkan di 6 tempat (strip Dashboard,
 * halaman Market Regime, kartu Market Pulse, Cockpit + tab AI Trading, Stock
 * Dossier, Laporan Pasar), masing-masing mengambil /api/idx/regime sendiri
 * dengan tabel label sendiri (4 tabel berbeda: "RISK OFF" / "RISK-OFF" /
 * "Risk-Off"; "BULLISH" vs "BULL TREND"), dan Market Pulse bahkan menentukan
 * "RISK-ON BULLISH" hanya dari tanda perubahan IHSG hari ini. Sekarang semua
 * membaca modul ini: satu fetch ber-cache (TTL 5 menit, permintaan bersamaan
 * digabung, backoff 45 dtk setelah gagal — beban 8 panggilan /api/idx/regime
 * dalam 20 dtk dulu ikut memicu 429 rate limiter), satu tabel label.
 *
 * Rentang alokasi (equityTarget/cashTarget) adalah PEDOMAN UMUM per regime,
 * bukan data dan belum divalidasi backtest — UI wajib menyatakan itu.
 */

var MW_REGIME_TTL_MS = 5 * 60 * 1000;
var MW_REGIME_RETRY_MS = 45 * 1000;

// Kode regime server (classifyMarketRegime) -> tampilan. SATU-SATUNYA tabel label regime.
var MW_REGIME_MAP = {
  BULL_TREND: { label: 'BULL TREND', badge: 'b-up', color: 'var(--green)', bg: 'rgba(0,200,5,0.12)', posture: 'RISK-ON', equityTarget: '70% – 85%', cashTarget: '15% – 30%' },
  SIDEWAYS: { label: 'SIDEWAYS', badge: 'b-amb', color: 'var(--text)', bg: 'var(--bg3)', posture: 'SELECTIVE ACCUMULATION', equityTarget: '60% – 75%', cashTarget: '25% – 40%' },
  HIGH_VOLATILITY: { label: 'HIGH VOLATILITY', badge: 'b-amb', color: 'var(--amber)', bg: 'rgba(245,158,11,0.12)', posture: 'SELEKTIF — WASPADA KOREKSI', equityTarget: '60% – 75%', cashTarget: '25% – 40%' },
  BEAR_TREND: { label: 'BEAR TREND', badge: 'b-dn', color: 'var(--red)', bg: 'rgba(255,51,58,0.12)', posture: 'CAPITAL PRESERVATION', equityTarget: '40% – 55%', cashTarget: '45% – 60%' },
  RISK_OFF: { label: 'RISK-OFF', badge: 'b-dn', color: 'var(--red)', bg: 'rgba(255,51,58,0.12)', posture: 'CAPITAL PRESERVATION', equityTarget: '40% – 55%', cashTarget: '45% – 60%' }
};

var MW_REGIME = { loading: false, data: null, error: null, at: 0, failedAt: 0, listeners: [], inflight: null };

function mwRegimeNotify() {
  MW_REGIME.listeners.slice().forEach(function (fn) { try { fn(); } catch (e) { /* satu pendengar rusak tidak boleh menghentikan yang lain */ } });
}

/** Berlangganan perubahan state regime (selesai load/gagal). Mengembalikan fungsi untuk berhenti. */
function mwRegimeSubscribe(fn) {
  MW_REGIME.listeners.push(fn);
  return function () { MW_REGIME.listeners = MW_REGIME.listeners.filter(function (x) { return x !== fn; }); };
}

/** Payload regime terakhir yang berhasil dimuat (objek `regime` dari /api/idx/regime) atau null. */
function mwRegimePeek() {
  return MW_REGIME.data && MW_REGIME.data.regime ? MW_REGIME.data.regime : null;
}

/** Kode regime ("RISK_OFF", ...) atau null bila belum/ tidak tersedia — JANGAN beri nilai bawaan karangan. */
function mwRegimeCode() {
  var r = mwRegimePeek();
  return r && MW_REGIME_MAP[r.regime] ? r.regime : null;
}

/**
 * Muat regime bila belum segar. Selalu resolve (tidak pernah reject) dengan payload regime atau null.
 * Permintaan bersamaan digabung; setelah gagal tidak mencoba lagi sebelum MW_REGIME_RETRY_MS.
 */
function mwRegimeEnsure(force) {
  var fresh = MW_REGIME.data && (Date.now() - MW_REGIME.at) < MW_REGIME_TTL_MS;
  if (!force && fresh) return Promise.resolve(mwRegimePeek());
  if (MW_REGIME.inflight) return MW_REGIME.inflight;
  var backingOff = MW_REGIME.failedAt && (Date.now() - MW_REGIME.failedAt) < MW_REGIME_RETRY_MS;
  if (!force && backingOff) return Promise.resolve(mwRegimePeek());

  MW_REGIME.loading = true;
  var fetchOpts = (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') ? { signal: AbortSignal.timeout(30000) } : {};
  MW_REGIME.inflight = fetch('/api/idx/regime', fetchOpts)
    .then(function (res) { return res.json(); })
    .then(function (json) {
      if (!json || !json.success || !json.regime) throw new Error((json && json.error) || 'Respons regime tidak valid');
      MW_REGIME.data = json; MW_REGIME.error = null; MW_REGIME.at = Date.now(); MW_REGIME.failedAt = 0;
    })
    .catch(function (e) {
      MW_REGIME.error = (e && e.message) || 'Gagal memuat';
      MW_REGIME.failedAt = Date.now();
      setTimeout(function () { mwRegimeEnsure(false); }, MW_REGIME_RETRY_MS + 500);
    })
    .then(function () {
      MW_REGIME.loading = false;
      MW_REGIME.inflight = null;
      mwRegimeNotify();
      return mwRegimePeek();
    });
  return MW_REGIME.inflight;
}

/**
 * Klasifikasi siap tampil. state: 'ok' | 'loading' | 'unavailable'.
 * Tanpa klasifikasi, status = "KLASIFIKASI TIDAK TERSEDIA" dan alokasi "-" (tidak ada angka tebakan).
 */
function mwRegimeClassification() {
  var r = mwRegimePeek();
  if (r) {
    var m = MW_REGIME_MAP[r.regime];
    if (m) {
      return {
        state: 'ok', code: r.regime, status: m.label, badge: m.badge, color: m.color, bg: m.bg,
        strategy: m.posture, equityTarget: m.equityTarget, cashTarget: m.cashTarget,
        description: r.description || '', confidence: r.confidence, computedAt: r.computedAt || null,
        ihsg: r.ihsg, ihsgChangePct: r.ihsgChangePct, rsi14: r.rsi14
      };
    }
    // Mis. UNKNOWN: data historis IHSG tidak cukup.
    return mwRegimeUnavailable('unavailable', r.description || 'Data historis IHSG tidak cukup untuk klasifikasi regime.');
  }
  if (MW_REGIME.error && !MW_REGIME.loading) {
    return mwRegimeUnavailable('unavailable', 'Gagal memuat klasifikasi regime (' + MW_REGIME.error + '). Mencoba lagi otomatis.');
  }
  return mwRegimeUnavailable('loading', '');
}

function mwRegimeUnavailable(state, description) {
  return {
    state: state, code: null, status: state === 'loading' ? 'MEMUAT KLASIFIKASI…' : 'KLASIFIKASI TIDAK TERSEDIA',
    badge: 'b-neu', color: 'var(--text3)', bg: 'var(--bg3)', strategy: '-', equityTarget: '-', cashTarget: '-',
    description: description || '', confidence: null, computedAt: null, ihsg: null, ihsgChangePct: null, rsi14: null
  };
}

/** Tautan ke halaman rinci, untuk tampilan ringkas (strip Dashboard, kartu Market Pulse, Cockpit AI). */
function mwRegimeDetailLinkHtml() {
  return '<a href="javascript:void(0)" onclick="goPage(\'market-regime\')" style="color:var(--accent);font-size:11px;font-weight:700;text-decoration:none">Lihat detail →</a>';
}
