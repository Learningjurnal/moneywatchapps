/**
 * public/js/49-strategy-engine.js — Strategy Engine V1 tab inside the
 * Unified Screener page (public/js/48-unified-screener.js switches into
 * this via US_STATE.pageTab === 'strategy').
 *
 * Data: GET /api/strategy-engine/strategies (list of 4 strategies) and
 * GET /api/strategy-engine/scan?strategy=...&tickers=... (on-demand run,
 * explicit ticker list — see server.js route comment for why there is no
 * "scan whole market" button here: that belongs in a scheduled cron, not
 * an unauthenticated on-demand endpoint).
 *
 * This UI never labels a result BUY/SELL — only the engine's own
 * STRONG/QUALIFIED/WATCH/REJECT/DATA_INSUFFICIENT vocabulary.
 */

var SE_STATE = {
  strategiesLoaded: false,
  strategies: [],
  selectedStrategy: 'swing-flow',
  conglomeratesLoaded: false,
  conglomerates: null,
  selectedConglomerate: '',
  tickersInput: '',
  loading: false,
  error: null,
  data: null, // last /scan response
  expandedTicker: null,
  latest: { loading: false, fetchedFor: null, data: null, error: null },
  dailyStats: { loading: false, fetchedFor: null, data: null, error: null }
};

// FIX (2026-09-25, follow-up to removing FOREIGN from
// hidden-accumulation/momentum-candidate's mandatoryConditions —
// see lib/engine/indicators/foreignFlow.js's header comment for the
// incident): no historical backtest is possible for this engine
// (order-book/intraday data has no confirmed historical retention at
// Invezgo), so the only honest way to confirm the fix actually raised
// the qualifying rate is to watch it happen for real. Reads
// GET /api/strategy-engine/daily-stats (accumulated day-by-day from
// warmStrategyEngineRotating(), not a fresh computation).
async function seLoadDailyStats(strategyId) {
  SE_STATE.dailyStats.loading = true;
  seRenderStrategyEnginePage('us-strategy-subpage');
  try {
    var resp = await fetch('/api/strategy-engine/daily-stats?strategy=' + encodeURIComponent(strategyId) + '&days=14');
    var json = await resp.json();
    if (!json.success) throw new Error(json.error || 'Gagal memuat tren harian');
    SE_STATE.dailyStats.data = json;
    SE_STATE.dailyStats.fetchedFor = strategyId;
    SE_STATE.dailyStats.error = null;
  } catch (e) {
    SE_STATE.dailyStats.error = e.message;
  } finally {
    SE_STATE.dailyStats.loading = false;
    seRenderStrategyEnginePage('us-strategy-subpage');
  }
}

// "Hasil Cron Terakhir" — sinyal STRONG/QUALIFIED yang sudah terkumpul
// hari ini dari warmStrategyEngineRotating() (lib/engine/strategy/
// StrategyEngine.js), bukan hasil scan on-demand. Cron ini TIDAK otomatis
// jalan lewat Vercel native cron (lihat komentar server.js pada
// GET /api/cron/warm-strategy-engine) — kalau panel ini kosong terus,
// kemungkinan besar penjadwal eksternalnya belum di-set up.
async function seLoadLatest(strategyId) {
  SE_STATE.latest.loading = true;
  seRenderStrategyEnginePage('us-strategy-subpage');
  try {
    var resp = await fetch('/api/strategy-engine/latest?strategy=' + encodeURIComponent(strategyId));
    var json = await resp.json();
    if (!json.success) throw new Error(json.error || 'Gagal memuat hasil cron');
    SE_STATE.latest.data = json;
    SE_STATE.latest.fetchedFor = strategyId;
    SE_STATE.latest.error = null;
  } catch (e) {
    SE_STATE.latest.error = e.message;
  } finally {
    SE_STATE.latest.loading = false;
    seRenderStrategyEnginePage('us-strategy-subpage');
  }
}

function seStatusBadgeClass(status) {
  if (status === 'STRONG') return 'b-up';
  if (status === 'QUALIFIED') return 'b-up';
  if (status === 'WATCH') return 'b-amb';
  if (status === 'REJECT') return 'b-dn';
  return 'b-neu'; // DATA_INSUFFICIENT
}

async function seLoadStrategies() {
  try {
    var resp = await fetch('/api/strategy-engine/strategies');
    var json = await resp.json();
    if (json.success) {
      SE_STATE.strategies = json.strategies || [];
      if (!SE_STATE.strategies.find(function (s) { return s.id === SE_STATE.selectedStrategy; }) && SE_STATE.strategies.length) {
        SE_STATE.selectedStrategy = SE_STATE.strategies[0].id;
      }
    }
  } catch (e) { /* silent — form still usable with the default strategy id */ }
  SE_STATE.strategiesLoaded = true;
  seRenderStrategyEnginePage('us-strategy-subpage');
}

function seOnStrategyChange() {
  var sel = document.getElementById('se-strategy-select');
  if (sel) SE_STATE.selectedStrategy = sel.value;
  seRenderStrategyEnginePage('us-strategy-subpage');
}

async function seLoadConglomerates() {
  if (SE_STATE.conglomeratesLoaded) return;
  try {
    var resp = await fetch('/api/strategy-engine/conglomerates');
    var json = await resp.json();
    if (json.success && Array.isArray(json.groups)) {
      SE_STATE.conglomerates = json;
    }
  } catch (_) { /* silent fallback */ }
  SE_STATE.conglomeratesLoaded = true;
  seRenderStrategyEnginePage('us-strategy-subpage');
}

function seOnConglomerateChange() {
  var sel = document.getElementById('se-conglomerate-select');
  if (!sel) return;
  var groupId = sel.value;
  SE_STATE.selectedConglomerate = groupId;
  if (!groupId) {
    seRenderStrategyEnginePage('us-strategy-subpage');
    return;
  }
  if (SE_STATE.conglomerates && Array.isArray(SE_STATE.conglomerates.relations)) {
    var groupRels = SE_STATE.conglomerates.relations.filter(function (r) {
      return r.group_id === groupId;
    });
    var tickers = groupRels.map(function (r) { return r.ticker; });
    var seen = {};
    var uniqueTickers = [];
    tickers.forEach(function (t) {
      if (t && !seen[t]) {
        seen[t] = true;
        uniqueTickers.push(t);
      }
    });
    SE_STATE.tickersInput = uniqueTickers.join(',');
    SE_STATE.error = null;
  }
  seRenderStrategyEnginePage('us-strategy-subpage');
}
window.seOnConglomerateChange = seOnConglomerateChange;

function seReadForm() {
  var sel = document.getElementById('se-strategy-select');
  var cong = document.getElementById('se-conglomerate-select');
  var tk = document.getElementById('se-tickers-input');
  if (sel) SE_STATE.selectedStrategy = sel.value;
  if (cong) SE_STATE.selectedConglomerate = cong.value;
  if (tk) SE_STATE.tickersInput = tk.value;
}

// User-requested (2026-10-01): "apakah harus dimasukan kode saham, buat
// sinkron saja dengan portofolio sebagai opsi" — fills the ticker input
// from the user's REAL current holdings (getPortfolio(), 03-engine.js —
// the same source of truth every other portfolio view in this app reads
// from) instead of requiring manual entry. Deliberately just fills the
// input rather than auto-running the scan: the user can still edit the
// list before hitting "Jalankan Scan", and a strategy scan calling
// Invezgo per ticker is not something to fire without an explicit click.
function seSyncFromPortfolio() {
  if (typeof getPortfolio !== 'function') {
    SE_STATE.error = 'Modul Portofolio tidak termuat di halaman ini — isi ticker manual.';
    seRenderStrategyEnginePage('us-strategy-subpage');
    return;
  }
  var porto = getPortfolio();
  if (!porto || !porto.length) {
    SE_STATE.error = 'Portofolio Anda masih kosong — isi transaksi dulu di menu Portofolio, atau masukkan ticker manual di sini.';
    seRenderStrategyEnginePage('us-strategy-subpage');
    return;
  }
  // Filter only valid IDX equity tickers (clean up .JK suffix, strip non-equity/crypto symbols)
  var seen = {};
  var tickers = [];
  porto.forEach(function (p) {
    var raw = String((p && p.ticker) || '').toUpperCase().replace(/\.JK$/i, '').trim();
    if (/^[A-Z]{4}$/.test(raw) && !seen[raw]) {
      seen[raw] = true;
      tickers.push(raw);
    }
  });
  if (!tickers.length) {
    SE_STATE.error = 'Tidak ada saham IDX valid yang ditemukan di portofolio Anda — silakan masukkan ticker manual di sini.';
    seRenderStrategyEnginePage('us-strategy-subpage');
    return;
  }
  var wasCapped = tickers.length > 50;
  if (wasCapped) tickers = tickers.slice(0, 50);
  SE_STATE.tickersInput = tickers.join(',');
  SE_STATE.error = wasCapped
    ? ('Portofolio Anda punya ' + porto.length + ' item — hanya 50 saham IDX pertama yang disinkronkan (batas maksimal scan per kuota Invezgo).')
    : (tickers.length > 15 ? ('Disinkronkan ' + tickers.length + ' saham IDX dari portofolio. Tip: Untuk pemindaian cepat, Anda dapat memindai bertahap 10–15 saham.') : null);
  seRenderStrategyEnginePage('us-strategy-subpage');
}
window.seSyncFromPortfolio = seSyncFromPortfolio;

async function seRunScan() {
  seReadForm();
  var tickers = SE_STATE.tickersInput.split(',').map(function (t) { return t.trim().toUpperCase(); }).filter(Boolean);
  if (!tickers.length) {
    SE_STATE.error = 'Isi minimal 1 ticker (pisahkan dengan koma), mis. BBCA,BBRI';
    seRenderStrategyEnginePage('us-strategy-subpage');
    return;
  }
  if (tickers.length > 50) {
    SE_STATE.error = 'Maksimal 50 ticker per scan (proteksi kuota Invezgo)';
    seRenderStrategyEnginePage('us-strategy-subpage');
    return;
  }
  SE_STATE.loading = true;
  SE_STATE.error = null;
  seRenderStrategyEnginePage('us-strategy-subpage');
  try {
    var url = '/api/strategy-engine/scan?strategy=' + encodeURIComponent(SE_STATE.selectedStrategy) + '&tickers=' + encodeURIComponent(tickers.join(','));
    var resp = await fetch(url);
    if (!resp.ok) {
      if (resp.status === 504 || resp.status === 502) {
        throw new Error('Server timeout (HTTP ' + resp.status + '): Pemindaian memakan waktu terlalu lama. Silakan kurangi jumlah ticker (mis. 5–15 saham) agar selesai lebih cepat.');
      }
      var errText = '';
      try {
        var errJson = await resp.json();
        errText = errJson.error || errJson.message || '';
      } catch (_) {
        try { errText = (await resp.text()).slice(0, 150); } catch (__) {}
      }
      throw new Error(errText || ('Gagal memindai (HTTP ' + resp.status + ')'));
    }
    var json = await resp.json();
    if (!json.success) throw new Error(json.error || 'Scan gagal');
    SE_STATE.data = json;
  } catch (e) {
    SE_STATE.error = e.message;
    SE_STATE.data = null;
  } finally {
    SE_STATE.loading = false;
    seRenderStrategyEnginePage('us-strategy-subpage');
  }
}

function seToggleExplain(ticker) {
  SE_STATE.expandedTicker = (SE_STATE.expandedTicker === ticker) ? null : ticker;
  seRenderStrategyEnginePage('us-strategy-subpage');
}

function seRenderStrategyEnginePage(containerId) {
  var container = document.getElementById(containerId);
  if (!container) return;

  if (!SE_STATE.strategiesLoaded) {
    container.innerHTML = '<div class="card" style="padding:20px;text-align:center;color:var(--text-mute)">Memuat daftar strategi…</div>';
    seLoadStrategies();
    return;
  }

  if (SE_STATE.latest.fetchedFor !== SE_STATE.selectedStrategy && !SE_STATE.latest.loading) {
    seLoadLatest(SE_STATE.selectedStrategy);
    return; // seLoadLatest re-renders when it resolves
  }

  if (SE_STATE.dailyStats.fetchedFor !== SE_STATE.selectedStrategy && !SE_STATE.dailyStats.loading) {
    seLoadDailyStats(SE_STATE.selectedStrategy);
    return; // seLoadDailyStats re-renders when it resolves
  }

  if (!SE_STATE.conglomeratesLoaded) {
    seLoadConglomerates();
  }

  var strat = SE_STATE.strategies.find(function (s) { return s.id === SE_STATE.selectedStrategy; });

  var html = '<div class="se-card">'
    + '<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;margin-bottom:8px">'
    + '  <div class="se-header-title">'
    + '    <i class="ti ti-cpu" style="color:var(--accent-blue,#38bdf8);font-size:20px"></i>'
    + '    <span>Money Watch Strategy Engine V1</span>'
    + '    <span class="se-badge-engine">Deterministic Quant Engine</span>'
    + '  </div>'
    + '  <div style="font-size:11px;color:var(--text3);display:flex;align-items:center;gap:6px">'
    + '    <span class="radar-live-blip" style="width:7px;height:7px"></span> Order Book &amp; Intraday Invezgo Live'
    + '  </div>'
    + '</div>'
    + '<div class="se-header-desc">'
    + 'Engine kuantitatif deterministik berbasis analisis mendalam order book &amp; anomali frekuensi transaksi pasar real-time (Invezgo). '
    + 'Setiap ticker dievaluasi secara obyektif berdasarkan aturan matematis baku dan diklasifikasikan ke dalam 5 tingkatan status:'
    + '</div>'
    + '<div class="se-status-taxonomy">'
    + '  <span class="se-taxonomy-label"><i class="ti ti-tags"></i> Taksonomi Status:</span>'
    + '  <span class="badge b-up" style="font-size:10px;font-weight:700">STRONG</span>'
    + '  <span class="badge b-blue" style="font-size:10px;font-weight:700">QUALIFIED</span>'
    + '  <span class="badge b-amb" style="font-size:10px;font-weight:700">WATCH</span>'
    + '  <span class="badge b-down" style="font-size:10px;font-weight:700">REJECT</span>'
    + '  <span class="badge" style="font-size:10px;background:var(--bg5,#1e293b);color:var(--text3,#8f9aa6)">DATA_INSUFFICIENT</span>'
    + '  <span style="font-size:10.5px;color:var(--text3);margin-left:auto;font-style:italic">✦ Sinyal matematis, bukan rekomendasi finansial (tanpa label BUY/SELL)</span>'
    + '</div>'
    + '<div class="se-control-grid">'
    + '  <div>'
    + '    <label class="se-field-label"><i class="ti ti-chart-dots" style="color:var(--accent-blue,#38bdf8)"></i> Strategi Kuantitatif</label>'
    + '    <select id="se-strategy-select" class="se-select finput fsel" onchange="seOnStrategyChange()">'
    +      SE_STATE.strategies.map(function (s) {
             return '<option value="' + s.id + '"' + (s.id === SE_STATE.selectedStrategy ? ' selected' : '') + '>' + s.name + '</option>';
           }).join('')
    + '    </select>'
    + '  </div>'
    + '  <div>'
    + '    <label class="se-field-label"><i class="ti ti-building" style="color:var(--accent,#5b8def)"></i> Universe Konglomerasi (Preset)</label>'
    + '    <select id="se-conglomerate-select" class="se-select finput fsel" onchange="seOnConglomerateChange()">'
    + '      <option value="">-- Pilih Konglomerasi (Bebas) --</option>'
    +      ((SE_STATE.conglomerates && SE_STATE.conglomerates.groups) ? SE_STATE.conglomerates.groups.map(function (g) {
             var count = (SE_STATE.conglomerates.relations || []).filter(function (r) { return r.group_id === g.group_id; }).length;
             return '<option value="' + g.group_id + '"' + (g.group_id === SE_STATE.selectedConglomerate ? ' selected' : '') + '>' + g.group_name + ' (' + count + ' emiten)</option>';
           }).join('') : '')
    + '    </select>'
    + '  </div>'
    + '</div>'
    + '<div>'
    + '  <label class="se-field-label" style="justify-content:space-between">'
    + '    <span><i class="ti ti-search" style="color:var(--accent-blue,#38bdf8)"></i> Daftar Ticker Target (Maksimal 50 Emiten)</span>'
    + '    <span style="font-size:11px;color:var(--text3);font-weight:normal">Pisahkan dengan koma</span>'
    + '  </label>'
    + '  <div class="se-action-bar">'
    + '    <div style="flex:1;min-width:260px">'
    + '      <input id="se-tickers-input" type="text" class="se-input finput mono" placeholder="BBCA, BBRI, TLKM, ADRO" value="' + (SE_STATE.tickersInput || '').replace(/"/g, '&quot;') + '" style="font-weight:600;letter-spacing:0.5px">'
    + '    </div>'
    + '    <button class="btn btn-ghost btn-sm" onclick="seSyncFromPortfolio()" title="Isi otomatis dari saham yang sedang Anda pegang di menu Portofolio" style="height:40px;padding:0 14px;border-radius:8px;font-weight:600;display:inline-flex;align-items:center;gap:6px">'
    + '      <i class="ti ti-folder-check"></i> 📂 Sinkron Portofolio'
    + '    </button>'
    + '    <button class="btn btn-primary btn-sm" onclick="seRunScan()"' + (SE_STATE.loading ? ' disabled' : '') + ' style="height:40px;padding:0 22px;border-radius:8px;font-weight:700;display:inline-flex;align-items:center;gap:6px;box-shadow:0 4px 14px rgba(15,105,255,0.35)">'
    + '      <i class="ti ti-player-play"></i> ' + (SE_STATE.loading ? 'Memindai…' : '▶ Jalankan Scan')
    + '    </button>'
    + '  </div>'
    + '</div>';

  if (SE_STATE.selectedConglomerate && SE_STATE.conglomerates && Array.isArray(SE_STATE.conglomerates.groups)) {
    var activeGroup = SE_STATE.conglomerates.groups.find(function (g) { return g.group_id === SE_STATE.selectedConglomerate; });
    if (activeGroup) {
      var rels = (SE_STATE.conglomerates.relations || []).filter(function (r) { return r.group_id === activeGroup.group_id; });
      var verifiedInGroup = rels.filter(function (r) { return r.status === 'VERIFIED'; });
      html += '<div class="se-conglom-banner">'
        + '  <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px">'
        + '    <div style="display:flex;align-items:center;flex-wrap:wrap;gap:10px">'
        + '      <span class="badge b-up" style="font-size:11px;font-weight:800;padding:4px 8px">🏢 ' + activeGroup.group_name + '</span>'
        + '      <span style="font-size:11.5px;color:var(--text)"><b style="color:var(--text-mute)">Anchor:</b> ' + activeGroup.anchor_person + '</span>'
        + '      <span style="font-size:11.5px;color:var(--text)"><b style="color:var(--text-mute)">Sektor:</b> ' + activeGroup.sector + '</span>'
        + '    </div>'
        + '    <span class="badge" style="background:rgba(16,185,129,0.15);color:#10b981;border:1px solid rgba(16,185,129,0.3);font-size:11px;font-weight:700;padding:4px 9px">✓ KSEI &gt;5%: ' + verifiedInGroup.length + '/' + rels.length + ' emiten terverifikasi</span>'
        + '  </div>'
        + (activeGroup.verification_note ? ('  <div style="font-size:11px;color:var(--text-mute);font-style:italic">ℹ️ ' + activeGroup.verification_note + '</div>') : '')
        + '</div>';
    }
  }

  if (strat) {
    html += '<div class="se-weights-ribbon">'
      + '  <span style="font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:0.5px"><i class="ti ti-adjustments"></i> Bobot &amp; Indikator:</span>'
      + Object.keys(strat.weights).map(function (k) {
          var isMandatory = (strat.mandatoryConditions || []).includes(k);
          var pct = Math.round(strat.weights[k] * 100);
          return '<span class="se-weight-chip ' + (isMandatory ? 'mandatory' : '') + '">'
            + k + ' <b>' + pct + '%</b>' + (isMandatory ? ' <span style="font-size:9.5px">🔒 MANDATORY</span>' : '')
            + '</span>';
        }).join('')
      + '</div>';
  }
  html += '</div>';

  // "Hasil Cron Terakhir" — akumulasi sinyal STRONG/QUALIFIED hari ini
  // dari warmStrategyEngineRotating(), bukan hasil scan manual di atas.
  html += '<div class="se-card">'
    + '  <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:6px">'
    + '    <div style="font-size:14px;font-weight:800;color:var(--text);display:flex;align-items:center;gap:8px">'
    + '      <i class="ti ti-bolt" style="color:var(--amber,#f59e0b)"></i> Hasil Cron Terakhir (Hari Ini)'
    + '    </div>'
    + (SE_STATE.latest.data ? ('<span class="badge b-accent" style="font-size:10px">Tanggal ' + SE_STATE.latest.data.date + '</span>') : '')
    + '  </div>'
    + '  <div style="font-size:11.5px;color:var(--text-mute);margin-bottom:12px">'
    + '    Akumulasi sinyal berkala dari <code>warmStrategyEngineRotating()</code> yang berhasil lolos kriteria STRONG atau QUALIFIED hari ini.'
    + '  </div>';

  if (SE_STATE.latest.error) {
    html += '<div style="font-size:11.5px;color:var(--down,#dc2626);padding:10px 14px;background:rgba(239,68,68,0.1);border-radius:8px">' + SE_STATE.latest.error + '</div>';
  } else if (SE_STATE.latest.loading) {
    html += '<div style="font-size:11.5px;color:var(--text-mute);padding:14px;text-align:center"><i class="ti ti-loader ti-spin"></i> Memuat sinyal terbaru…</div>';
  } else if (SE_STATE.latest.data && SE_STATE.latest.data.signals && SE_STATE.latest.data.signals.length > 0) {
    html += '<div style="display:grid;grid-template-columns:repeat(auto-fill, minmax(220px, 1fr));gap:10px">'
      + SE_STATE.latest.data.signals.map(function (s) {
          var isStrong = s.status === 'STRONG';
          var badgeStyle = isStrong
            ? 'background:rgba(16,185,129,0.15);color:#10b981;border:1px solid rgba(16,185,129,0.3)'
            : 'background:rgba(56,189,248,0.15);color:#38bdf8;border:1px solid rgba(56,189,248,0.3)';
          return '<div style="background:var(--bg3,#0D1322);border:1px solid var(--border,#1E293B);border-radius:8px;padding:10px 14px;display:flex;align-items:center;justify-content:space-between;gap:8px">'
            + '  <div style="display:flex;align-items:center;gap:8px">'
            + '    <span class="mono" style="font-weight:800;font-size:14px;color:var(--text)">' + s.ticker + '</span>'
            + '    <span class="badge" style="' + badgeStyle + ';font-size:10px;font-weight:700">' + s.status + '</span>'
            + '  </div>'
            + '  <div class="mono" style="font-weight:800;font-size:14px;color:var(--text)">' + (s.score != null ? s.score : '-') + '</div>'
            + '</div>';
        }).join('')
      + '</div>';
  } else {
    html += '<div style="font-size:11.5px;color:var(--text-mute);padding:14px;background:var(--bg3,#0D1322);border:1px solid var(--border,#1E293B);border-radius:8px;line-height:1.6">'
      + 'Belum ada sinyal terkumpul hari ini. Cron <code>GET /api/cron/warm-strategy-engine</code> belum otomatis jalan lewat Vercel native cron (2 slot Hobby sudah dipakai 2 cron lain) — perlu penjadwal eksternal (cron-job.org, GitHub Actions, dll) yang memanggil URL itu dengan header Authorization Bearer CRON_SECRET, atau jalankan manual dulu untuk tes.'
      + '</div>';
  }
  html += '</div>';

  // "Tren Harian (14 Hari)" — validasi forward setelah FOREIGN dihapus
  html += '<div class="se-card">'
    + '  <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:6px">'
    + '    <div style="font-size:14px;font-weight:800;color:var(--text);display:flex;align-items:center;gap:8px">'
    + '      <i class="ti ti-chart-line" style="color:var(--accent-blue,#38bdf8)"></i> Tren Harian &amp; Forward Validation (14 Hari Terakhir)'
    + '    </div>'
    + '    <div style="font-size:11px;color:var(--text3)">Qualifying Rate = (STRONG + QUALIFIED) / Discan</div>'
    + '  </div>'
    + '  <div style="font-size:11.5px;color:var(--text-mute);margin-bottom:14px">'
    + '    Evaluasi performa harian cron rotasi Strategy Engine untuk memvalidasi tingkat kelulusan sinyal pasar secara objektif.'
    + '  </div>';

  if (SE_STATE.dailyStats.error) {
    html += '<div style="font-size:11.5px;color:var(--down,#dc2626);padding:10px 14px;background:rgba(239,68,68,0.1);border-radius:8px">' + SE_STATE.dailyStats.error + '</div>';
  } else if (SE_STATE.dailyStats.loading) {
    html += '<div style="font-size:11.5px;color:var(--text-mute);padding:14px;text-align:center"><i class="ti ti-loader ti-spin"></i> Memuat statistik harian…</div>';
  } else if (SE_STATE.dailyStats.data && SE_STATE.dailyStats.data.days) {
    var activeDays = SE_STATE.dailyStats.data.days.filter(function (d) { return d.processed > 0; });
    if (!activeDays.length) {
      html += '<div style="font-size:11.5px;color:var(--text-mute);padding:14px;background:var(--bg3,#0D1322);border:1px solid var(--border,#1E293B);border-radius:8px">'
        + 'Belum ada data cron untuk 14 hari terakhir — statistik ini mulai terkumpul sejak pembaruan sistem, butuh beberapa hari cron berjalan sebelum trennya terlihat.'
        + '</div>';
    } else {
      var totalProcessed = 0;
      var totalStrong = 0;
      var totalQualified = 0;
      var peakRate = 0;
      var peakDate = '-';

      activeDays.forEach(function (d) {
        var proc = Number(d.processed) || 0;
        var sCount = Number(d.STRONG) || 0;
        var qCount = Number(d.QUALIFIED) || 0;
        var rVal = Number(d.qualifyingRate) || 0;
        totalProcessed += proc;
        totalStrong += sCount;
        totalQualified += qCount;
        if (rVal > peakRate) {
          peakRate = rVal;
          peakDate = d.date;
        }
      });
      var totalPassed = totalStrong + totalQualified;
      var avgRate = totalProcessed > 0 ? ((totalPassed / totalProcessed) * 100).toFixed(1) : '0';

      html += '<div class="se-kpi-grid">'
        + '  <div class="se-kpi-box">'
        + '    <div class="se-kpi-title"><i class="ti ti-scan"></i> Total Discan (14H)</div>'
        + '    <div class="se-kpi-val">' + totalProcessed + '</div>'
        + '    <div class="se-kpi-sub">Emiten dipindai rotasi</div>'
        + '  </div>'
        + '  <div class="se-kpi-box">'
        + '    <div class="se-kpi-title"><i class="ti ti-check-double" style="color:#10b981"></i> Sinyal Lolos (S+Q)</div>'
        + '    <div class="se-kpi-val" style="color:#10b981">' + totalPassed + '</div>'
        + '    <div class="se-kpi-sub">' + totalStrong + ' STRONG · ' + totalQualified + ' QUALIFIED</div>'
        + '  </div>'
        + '  <div class="se-kpi-box">'
        + '    <div class="se-kpi-title"><i class="ti ti-percentage" style="color:var(--accent-blue,#38bdf8)"></i> Rata-rata Lolos</div>'
        + '    <div class="se-kpi-val" style="color:var(--accent-blue,#38bdf8)">' + avgRate + '%</div>'
        + '    <div class="se-kpi-sub">Rasio kelulusan agregat</div>'
        + '  </div>'
        + '  <div class="se-kpi-box">'
        + '    <div class="se-kpi-title"><i class="ti ti-flame" style="color:var(--amber,#f59e0b)"></i> Puncak Sinyal</div>'
        + '    <div class="se-kpi-val" style="color:var(--amber,#f59e0b)">' + peakRate + '%</div>'
        + '    <div class="se-kpi-sub">Pada ' + peakDate + '</div>'
        + '  </div>'
        + '</div>';

      html += '<div style="overflow-x:auto;border-radius:8px;border:1px solid var(--border,#1E293B)">'
        + '<table class="tbl se-trend-table" style="width:100%">'
        + '<thead><tr>'
        + '  <th style="text-align:left">Tanggal</th>'
        + '  <th style="text-align:center">Discan</th>'
        + '  <th style="text-align:center">STRONG</th>'
        + '  <th style="text-align:center">QUALIFIED</th>'
        + '  <th style="text-align:center">WATCH</th>'
        + '  <th style="text-align:center">REJECT</th>'
        + '  <th style="text-align:center">DATA INSUFFICIENT</th>'
        + '  <th style="text-align:right;min-width:160px">Qualifying Rate</th>'
        + '</tr></thead><tbody>'
        + activeDays.map(function (d) {
            var qRate = d.qualifyingRate != null ? Number(d.qualifyingRate) : 0;
            var barColor = qRate >= 30 ? 'linear-gradient(90deg, #10b981, #34d399)' : (qRate > 0 ? 'linear-gradient(90deg, #0284c7, #38bdf8)' : 'transparent');
            var rateColor = qRate >= 30 ? '#10b981' : (qRate > 0 ? '#38bdf8' : 'var(--text3,#8f9aa6)');
            return '<tr>'
              + '<td class="mono" style="font-weight:700;color:var(--text)">' + d.date + '</td>'
              + '<td style="text-align:center"><span class="se-num-badge" style="background:var(--bg3,#0D1322);color:var(--text2,#D2D8DF)">' + d.processed + '</span></td>'
              + '<td style="text-align:center">' + (d.STRONG > 0 ? ('<span class="se-num-badge" style="background:rgba(16,185,129,0.15);color:#10b981;border:1px solid rgba(16,185,129,0.3)">' + d.STRONG + '</span>') : '<span style="color:var(--text3)">-</span>') + '</td>'
              + '<td style="text-align:center">' + (d.QUALIFIED > 0 ? ('<span class="se-num-badge" style="background:rgba(56,189,248,0.15);color:#38bdf8;border:1px solid rgba(56,189,248,0.3)">' + d.QUALIFIED + '</span>') : '<span style="color:var(--text3)">-</span>') + '</td>'
              + '<td style="text-align:center">' + (d.WATCH > 0 ? ('<span class="se-num-badge" style="background:rgba(245,158,11,0.15);color:#f59e0b">' + d.WATCH + '</span>') : '<span style="color:var(--text3)">-</span>') + '</td>'
              + '<td style="text-align:center">' + (d.REJECT > 0 ? ('<span style="color:#f87171;font-weight:600;font-family:var(--font-mono)">' + d.REJECT + '</span>') : '<span style="color:var(--text3)">-</span>') + '</td>'
              + '<td style="text-align:center">' + (d.DATA_INSUFFICIENT > 0 ? ('<span style="color:var(--text3);font-family:var(--font-mono)">' + d.DATA_INSUFFICIENT + '</span>') : '<span style="color:var(--text3)">-</span>') + '</td>'
              + '<td style="text-align:right">'
              + '  <div style="display:flex;align-items:center;gap:10px;justify-content:flex-end">'
              + '    <div style="flex:1;max-width:80px;height:7px;background:var(--bg5,#1e293b);border-radius:4px;overflow:hidden">'
              + '      <div style="width:' + Math.min(100, qRate) + '%;height:100%;background:' + barColor + ';border-radius:4px"></div>'
              + '    </div>'
              + '    <span class="mono" style="font-weight:800;font-size:12px;color:' + rateColor + ';min-width:44px;text-align:right">' + (d.qualifyingRate != null ? d.qualifyingRate + '%' : '-') + '</span>'
              + '  </div>'
              + '</td>'
              + '</tr>';
          }).join('')
        + '</tbody></table></div>';
    }
  }
  html += '</div>';

  if (SE_STATE.error) {
    html += '<div class="se-card" style="padding:14px 18px;color:var(--down,#dc2626);border-color:rgba(239,68,68,0.3);background:rgba(239,68,68,0.08);display:flex;align-items:center;gap:10px">'
      + '<i class="ti ti-alert-triangle" style="font-size:20px;flex-shrink:0"></i>'
      + '<div>' + SE_STATE.error + '</div>'
      + '</div>';
  }

  if (SE_STATE.data) {
    var d = SE_STATE.data;
    if (d.regulatoryDataSource && !d.regulatoryDataSource.available) {
      html += '<div class="se-card" style="padding:12px 16px;border-color:rgba(245,158,11,0.3);background:rgba(245,158,11,0.08);color:var(--amber,#f59e0b);display:flex;align-items:center;gap:10px">'
        + '<i class="ti ti-alert-circle" style="font-size:18px;flex-shrink:0"></i>'
        + '<div>⚠️ Data notasi khusus BEI (Regulatory Health Gate) sedang tidak tersedia' + (d.regulatoryDataSource.isStale ? ' (memakai cache lama)' : '') + ' — semua ticker default DATA_INSUFFICIENT sampai data ini pulih.</div>'
        + '</div>';
    }
    html += '<div class="se-card">'
      + '<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;margin-bottom:14px">'
      + '  <div style="font-size:14px;font-weight:800;color:var(--text);display:flex;align-items:center;gap:8px">'
      + '    <i class="ti ti-list-check" style="color:var(--accent-blue,#38bdf8)"></i> Hasil Pemindaian Target'
      + '  </div>'
      + '  <div style="display:flex;flex-wrap:wrap;gap:6px">'
      + '    <span class="badge b-up" style="font-size:10px;font-weight:700">STRONG: ' + d.summary.strong + '</span>'
      + '    <span class="badge b-blue" style="font-size:10px;font-weight:700">QUALIFIED: ' + d.summary.qualified + '</span>'
      + '    <span class="badge b-amb" style="font-size:10px;font-weight:700">WATCH: ' + d.summary.watch + '</span>'
      + '    <span class="badge b-down" style="font-size:10px;font-weight:700">REJECT: ' + d.summary.reject + '</span>'
      + '    <span class="badge" style="font-size:10px;background:var(--bg5,#1e293b);color:var(--text3,#8f9aa6)">DATA_INSUFFICIENT: ' + d.summary.dataInsufficient + '</span>'
      + '  </div>'
      + '</div>';

    html += '<div style="overflow-x:auto;border-radius:8px;border:1px solid var(--border,#1E293B)">'
      + '<table class="tbl" style="width:100%;font-size:12.5px">'
      + '<thead><tr>'
      + '  <th style="text-align:left;padding:10px 14px">Ticker</th>'
      + '  <th style="text-align:left;padding:10px 14px">Status</th>'
      + '  <th style="text-align:left;padding:10px 14px">Score</th>'
      + '  <th style="text-align:right;padding:10px 14px">Detail</th>'
      + '</tr></thead><tbody>';

    d.results.forEach(function (r) {
      html += '<tr>'
        + '<td style="padding:10px 14px"><span class="mono" style="font-weight:800;font-size:13px;color:var(--text)">' + r.ticker + '</span></td>'
        + '<td style="padding:10px 14px"><span class="badge ' + seStatusBadgeClass(r.status) + '" style="font-size:9.5px;font-weight:700">' + r.status + '</span></td>'
        + '<td style="padding:10px 14px"><span class="mono" style="font-weight:700;color:' + (r.score != null ? 'var(--text)' : 'var(--text-mute)') + '">' + (r.score != null ? r.score : '-') + '</span></td>'
        + '<td style="padding:10px 14px;text-align:right"><button class="btn btn-ghost btn-xs" onclick="seToggleExplain(\'' + r.ticker + '\')" style="border-radius:6px;font-weight:600">' + (SE_STATE.expandedTicker === r.ticker ? '✕ Tutup' : '🔍 Lihat penjelasan') + '</button></td>'
        + '</tr>';
      if (SE_STATE.expandedTicker === r.ticker) {
        var statusClass = 'status-' + String(r.status || '').toLowerCase().replace(/[^a-z0-9_]/g, '_');
        var explanations = r.explanations || [];
        var verdictLine = explanations.length > 0 ? explanations[0] : ('Status: ' + r.status);
        var indicatorLines = explanations.slice(1);

        html += '<tr><td colspan="4" class="se-explain-cell" style="background:var(--bg2,#080C14);color:var(--text,#FFFFFF);white-space:normal;padding:14px 18px">'
          + '<div class="se-explain-box">'
          + '  <div class="se-explain-header" style="display:flex;align-items:center;justify-content:space-between;gap:8px">'
          + '    <div style="display:flex;align-items:center;gap:8px">'
          + '      <span style="font-weight:700">🔍 Penjelasan Analisa &amp; Indikator: ' + r.ticker + '</span>'
          + '      <span class="badge ' + seStatusBadgeClass(r.status) + '" style="font-size:9px">' + r.status + '</span>'
          + '    </div>'
          + '    <div style="font-size:11px;color:var(--text3)">' + (r.score != null ? ('Skor: ' + r.score) : 'Tanpa skor') + '</div>'
          + '  </div>'
          + '  <div class="se-explain-verdict ' + statusClass + '">'
          +      verdictLine.replace(/</g, '&lt;')
          + '  </div>';

        if (indicatorLines.length > 0) {
          html += '  <div style="display:flex;flex-direction:column;gap:5px">';
          indicatorLines.forEach(function (line) {
            var colonIdx = line.indexOf(':');
            var keyPart = '';
            var valPart = line;
            if (colonIdx > 0 && colonIdx < 30) {
              keyPart = line.substring(0, colonIdx);
              valPart = line.substring(colonIdx + 1);
            }
            html += '<div class="se-explain-item">'
              + '<span class="se-explain-item-dot">•</span>'
              + (keyPart ? ('<span class="se-explain-key">' + keyPart.replace(/</g, '&lt;') + ':</span>') : '')
              + '<span class="se-explain-val">' + valPart.replace(/</g, '&lt;') + '</span>'
              + '</div>';
          });
          html += '  </div>';
        }

        html += '</div></td></tr>';
      }
    });

    html += '</tbody></table></div></div>';
  }

  container.innerHTML = html;
}

// ─────────────────────────────────────────────────────────────────────────
// DAILY PICKS WIDGET (Screener page header)
// User request (2026-09-24): "1 sidebar recommendation, isinya adalah
// rekomendasi stock pick dari analisa anda, sifatnya harian, setiap hari
// berubah kecuali libur bursa, dan akan reload tiap 15 menit, stock pick
// cukup 10 saham aja, namun anda beri score dan alasan nya." Originally
// placed in the global left sidebar; moved into the Screener page
// (2026-09-24, user-reported: "penempatannya di sidebar belum tepat,
// masukkan saja di screener supaya tidak berantakan") since that sidebar
// is shared across every page and this widget is screening/analysis
// content, not navigation — public/js/48-unified-screener.js's
// usRenderShell() now renders its container (#us-daily-picks) and calls
// usDailyPicksInit() once.
//
// ZERO FABRICATION (CLAUDE.md #1/#3): this widget invents NOTHING. It
// reads GET /api/strategy-engine/daily-picks, which itself only ever
// returns tickers that warmStrategyEngineRotating()'s cron already scored
// STRONG/QUALIFIED with the real Strategy Engine V1 formulas (see that
// endpoint's server.js comment and getDailyTopPicks() in
// lib/engine/strategy/StrategyEngine.js). "Changes daily except market
// holidays" and "10 stocks" are honored by the backend, not faked here:
// the backend walks back to the most recent date that actually has
// signals (weekends/holidays naturally reuse the last trading day's real
// results) and returns fewer than 10 with an honest `note` if the day's
// rotation hasn't found that many yet — this widget renders that note
// verbatim rather than padding the list.
// ─────────────────────────────────────────────────────────────────────────

var US_DAILY_PICKS_REFRESH_MS = 15 * 60 * 1000; // 15 minutes, as requested
var US_DAILY_PICKS_STATE = { loading: false, data: null, error: null };
var _usDailyPicksTimer = null;
var _usDailyPicksInitialized = false;

// usRenderShell() calls this on every render (including periodic same-page
// refresh ticks from 03-engine.js) — must be idempotent: only fetch/start
// the interval the FIRST time, otherwise just repaint from existing state.
function usDailyPicksInit() {
  var el = document.getElementById('us-daily-picks');
  if (!el) return; // markup not present on this build — no-op, not an error
  if (_usDailyPicksInitialized) {
    usDailyPicksRender();
    return;
  }
  _usDailyPicksInitialized = true;
  usDailyPicksLoad();
  if (_usDailyPicksTimer) clearInterval(_usDailyPicksTimer);
  _usDailyPicksTimer = setInterval(usDailyPicksLoad, US_DAILY_PICKS_REFRESH_MS);
}

async function usDailyPicksLoad() {
  US_DAILY_PICKS_STATE.loading = true;
  US_DAILY_PICKS_STATE.error = null;
  usDailyPicksRender();
  try {
    var resp = await fetch('/api/strategy-engine/daily-picks?limit=10', { signal: AbortSignal.timeout(15000) });
    var json = await resp.json();
    if (!json.success) throw new Error(json.error || 'Gagal memuat rekomendasi harian');
    US_DAILY_PICKS_STATE.data = json;
  } catch (e) {
    US_DAILY_PICKS_STATE.error = e.message || String(e);
  } finally {
    US_DAILY_PICKS_STATE.loading = false;
    usDailyPicksRender();
  }
}

function usDailyPicksStatusColor(status) {
  if (status === 'STRONG') return 'var(--green, #10b981)';
  if (status === 'QUALIFIED') return 'var(--accent-blue, #0ea5e9)';
  return 'var(--text3, #94a3b8)';
}

function usDailyPicksEsc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

// Parse raw rationale string into clean structured items
function usDailyPicksParseReason(reason) {
  if (!reason) return [];
  var parts = String(reason).split(/\s*—\s*/);
  var items = [];
  parts.forEach(function (part) {
    var p = part.trim();
    if (!p) return;
    if (/^(STRONG|QUALIFIED|WATCH|REJECT):\s*FinalScore/i.test(p)) {
      items.push({ type: 'verdict', label: 'STATUS &amp; SKOR', text: p, icon: 'ti-award', badgeClass: 'b-up' });
    } else if (/^Skor dihitung dari/i.test(p)) {
      items.push({ type: 'weight', label: 'CAKUPAN BOBOT', text: p, icon: 'ti-scale', badgeClass: 'b-amb' });
    } else {
      var colonIdx = p.indexOf(':');
      if (colonIdx > 0 && colonIdx < 35) {
        var key = p.slice(0, colonIdx).trim().replace(/_/g, ' ');
        var val = p.slice(colonIdx + 1).trim();
        items.push({ type: 'indicator', label: key, text: val, icon: 'ti-check', badgeClass: 'b-accent' });
      } else {
        items.push({ type: 'note', label: 'CATATAN ANALISIS', text: p, icon: 'ti-info-circle', badgeClass: 'b-neu' });
      }
    }
  });
  return items;
}

// Modal Popup for individual stock detailed rationale & breakdown
function usDailyPicksOpenModal(idx) {
  if (!US_DAILY_PICKS_STATE.data || !Array.isArray(US_DAILY_PICKS_STATE.data.picks)) return;
  var p = US_DAILY_PICKS_STATE.data.picks[idx];
  if (!p) return;

  var existing = document.getElementById('us-picks-modal-backdrop');
  if (existing) existing.remove();

  var scoreNum = p.score != null ? Number(p.score) : null;
  var isAlpha = scoreNum != null && scoreNum >= 88.0;
  var isStrong = scoreNum != null && scoreNum >= 83.0 && scoreNum < 88.0;

  var structured = usDailyPicksParseReason(p.reason);
  var indicatorCards = structured.map(function (item) {
    return '<div class="radar-modal-indicator-item">'
      + '<span class="indicator-badge-chip ' + (item.badgeClass || '') + '"><i class="ti ' + item.icon + '"></i> ' + usDailyPicksEsc(item.label) + '</span>'
      + '<div style="color:var(--text);font-size:11.5px;line-height:1.4">' + usDailyPicksEsc(item.text) + '</div>'
      + '</div>';
  }).join('');

  var tierBadgeText = isAlpha
    ? '🔥 <strong style="color:#f59e0b">ALPHA TARGET (TIER 1)</strong> — Konfluensi tertinggi pada pemindaian radar hari ini'
    : (isStrong ? '⚡ <strong style="color:#10b981">STRONG MOMENTUM (TIER 2)</strong> — Memenuhi akumulasi bandar &amp; momentum kuat'
      : '🎯 <strong style="color:#38bdf8">QUALIFIED TARGET (TIER 3)</strong> — Lolos ambang batas seleksi strategi');

  var modalHtml = '<div id="us-picks-modal-backdrop" class="radar-modal-backdrop" onclick="if(event.target===this)usDailyPicksCloseModal()">'
    + '<div class="radar-modal-card" role="dialog" aria-modal="true" aria-labelledby="radar-modal-title">'
    + '<div class="radar-modal-header">'
    + '  <div style="display:flex;align-items:center;gap:12px">'
    + '    <div style="flex-shrink:0">' + (typeof getStockLogoHtml === 'function' ? getStockLogoHtml(p.ticker, 42) : '') + '</div>'
    + '    <div>'
    + '      <div style="display:flex;align-items:center;gap:8px">'
    + '        <span id="radar-modal-title" class="mono" style="font-size:18px;font-weight:900;color:var(--text)">' + usDailyPicksEsc(p.ticker) + '</span>'
    + '        <span class="badge ' + (p.rank === 1 ? 'b-amb' : 'b-accent') + '" style="font-size:10px">RANK #' + p.rank + '</span>'
    + '        <span class="badge ' + (p.status === 'STRONG' ? 'b-up' : 'b-blue') + '" style="font-size:10px">' + usDailyPicksEsc(p.status) + '</span>'
    + '      </div>'
    + '      <div style="font-size:12px;color:var(--text3);margin-top:2px">' + usDailyPicksEsc(p.name || p.ticker) + '</div>'
    + '    </div>'
    + '  </div>'
    + '  <button class="radar-modal-close" onclick="usDailyPicksCloseModal()" aria-label="Tutup">✕</button>'
    + '</div>'
    + '<div class="radar-modal-body">'
    + '  <div class="radar-modal-score-banner">'
    + '    <div class="modal-score-circle ' + (isAlpha ? 'score-circle-alpha' : '') + '">'
    + '      <div class="score-large-val" style="color:' + usDailyPicksStatusColor(p.status) + '">' + (p.score != null ? p.score : '-') + '</div>'
    + '      <div class="score-large-lbl">FINAL SCORE</div>'
    + '    </div>'
    + '    <div class="modal-score-details">'
    + '      <div class="modal-strategy-title"><i class="ti ti-compass" style="color:var(--accent)"></i> Strategi: <strong>' + usDailyPicksEsc(p.strategyName) + '</strong></div>'
    + '      <div class="modal-tier-tag">' + tierBadgeText + '</div>'
    + '      <div class="modal-weight-note">Sistem perhitungan kuantitatif berbasis indikator multi-faktor tanpa manipulasi data sintetis.</div>'
    + '    </div>'
    + '  </div>'
    + '  <div class="radar-modal-section-title"><i class="ti ti-list-check"></i> Rincian Parameter &amp; Logika Skor</div>'
    + '  <div class="radar-modal-indicator-list">' + (indicatorCards || '<div style="color:var(--text3);font-size:11px">Tidak ada rincian tambahan.</div>') + '</div>'
    + '  <div class="radar-modal-verbatim-box">'
    + '    <div class="verbatim-header"><i class="ti ti-file-text"></i> Penjelasan Rationale Lengkap (Strategy Engine V1):</div>'
    + '    <div class="verbatim-content">' + usDailyPicksEsc(p.reason || 'Tidak ada penjelasan') + '</div>'
    + '  </div>'
    + '</div>'
    + '<div class="radar-modal-footer">'
    + '  <div style="font-size:10px;color:var(--text3);display:flex;align-items:center;gap:6px">'
    + '    <span class="radar-live-blip" style="width:6px;height:6px"></span> Data real Invezgo · Diperbarui tiap 15 mnt'
    + '  </div>'
    + '  <div style="display:flex;gap:8px">'
    + '    <button class="btn btn-ghost btn-sm" onclick="usDailyPicksCloseModal()">Tutup</button>'
    + '    <button class="btn btn-ghost btn-sm" onclick="usDailyPicksCloseModal();if(typeof selectStockChatTicker===\'function\')selectStockChatTicker(\'' + p.ticker + '\');if(typeof goPage===\'function\')goPage(\'stockchat\');">'
    + '      <i class="ti ti-terminal-2"></i> StockChat AI'
    + '    </button>'
    + '    <button class="btn btn-primary btn-sm" onclick="usDailyPicksCloseModal();if(typeof selectStockChatTicker===\'function\')selectStockChatTicker(\'' + p.ticker + '\');if(typeof goPage===\'function\')goPage(\'stock-dossier\');">'
    + '      <i class="ti ti-chart-candle"></i> Buka Stock Master 360'
    + '    </button>'
    + '  </div>'
    + '</div>'
    + '</div>'
    + '</div>';

  document.body.insertAdjacentHTML('beforeend', modalHtml);
}

// Modal Popup for methodology & scan coverage note (moved from bottom card text)
function usDailyPicksOpenCoverageModal() {
  var d = US_DAILY_PICKS_STATE.data;
  if (!d) return;

  var existing = document.getElementById('us-picks-modal-backdrop');
  if (existing) existing.remove();

  var cov = d.scanCoverage;
  var covText = (cov && cov.scannedPerStrategyMax > 0)
    ? ('Rotasi harian memindai ' + cov.scannedPerStrategyMax + ' dari ' + cov.universeSize + ' emiten (per strategi) untuk tanggal ini.')
    : 'Pemindaian berjalan secara rotatif sesuai jadwal cron bursa.';

  var noteText = d.note || 'Daftar rekomendasi dihasilkan dari perhitungan kuantitatif Strategy Engine V1.';

  var modalHtml = '<div id="us-picks-modal-backdrop" class="radar-modal-backdrop" onclick="if(event.target===this)usDailyPicksCloseModal()">'
    + '<div class="radar-modal-card" role="dialog" aria-modal="true">'
    + '<div class="radar-modal-header">'
    + '  <div style="display:flex;align-items:center;gap:8px">'
    + '    <i class="ti ti-info-circle" style="color:var(--accent);font-size:20px"></i>'
    + '    <div>'
    + '      <div style="font-size:14px;font-weight:800;color:var(--text)">Metodologi &amp; Cakupan Rotasi Harian</div>'
    + '      <div style="font-size:11px;color:var(--text3)">Strategy Engine V1 · Rekomendasi Saham Otomatis</div>'
    + '    </div>'
    + '  </div>'
    + '  <button class="radar-modal-close" onclick="usDailyPicksCloseModal()" aria-label="Tutup">✕</button>'
    + '</div>'
    + '<div class="radar-modal-body">'
    + '  <div style="background:var(--bg3);border:1px solid var(--border2);border-radius:10px;padding:14px;font-size:12px;color:var(--text);line-height:1.6">'
    + '    <div style="font-weight:700;color:var(--text);margin-bottom:6px"><i class="ti ti-file-text"></i> Catatan Pemindaian:</div>'
    + '    ' + usDailyPicksEsc(noteText)
    + '  </div>'
    + '  <div style="background:var(--bg3);border:1px solid var(--border2);border-radius:10px;padding:14px;font-size:12px;color:var(--text);line-height:1.6">'
    + '    <div style="font-weight:700;color:var(--text);margin-bottom:6px"><i class="ti ti-cpu"></i> Cakupan Pemindaian Universe:</div>'
    + '    ' + usDailyPicksEsc(covText) + ' Ini BUKAN pemindaian ulang serentak seluruh ~985 emiten secara real-time demi efisiensi kuota provider, melainkan hasil akumulatif cron rotasi resmi.'
    + '  </div>'
    + '  <div style="font-size:11px;color:var(--text3);line-height:1.5">'
    + '    <strong>Integritas Pasar:</strong> Sistem ini tidak pernah menggunakan data sintetis / fiktif. Saham yang masuk radar wajib lolos Regulatory Health Gate (bebas notasi khusus bermasalah) dan lolos ambang batas indikator mandatory.'
    + '  </div>'
    + '</div>'
    + '<div class="radar-modal-footer">'
    + '  <div style="font-size:10px;color:var(--text3)">Tanggal Data: ' + usDailyPicksEsc(d.date || '-') + '</div>'
    + '  <button class="btn btn-ghost btn-sm" onclick="usDailyPicksCloseModal()">Tutup</button>'
    + '</div>'
    + '</div>'
    + '</div>';

  document.body.insertAdjacentHTML('beforeend', modalHtml);
}

function usDailyPicksCloseModal() {
  var m = document.getElementById('us-picks-modal-backdrop');
  if (m) m.remove();
}

window.addEventListener('keydown', function (e) {
  if (e.key === 'Escape') usDailyPicksCloseModal();
});

// Search Radar layout with prominent hero radar, plain compact cards, and popups for long text
function usDailyPicksRender() {
  var el = document.getElementById('us-daily-picks');
  if (!el) return;

  var d = US_DAILY_PICKS_STATE.data;
  var hasPicks = d && Array.isArray(d.picks) && d.picks.length > 0;
  var pickCount = hasPicks ? d.picks.length : 0;
  var dateStr = (d && d.date) || 'Hari Ini';

  // Top HUD Status Bar
  var header = '<div class="radar-hud-bar">'
    + '<div class="radar-hud-status">'
    + '  <span class="radar-live-blip"></span>'
    + '  <span class="radar-hud-title">Tactical Sonar Radar <span class="badge b-blue" style="font-size:9px;border-color:rgba(56,189,248,0.4)">STRATEGY ENGINE V1</span></span>'
    + '</div>'
    + '<div class="radar-hud-meta">'
    + '  <span class="radar-meta-chip"><i class="ti ti-activity"></i> POLAR 360° SWEEP</span>'
    + '  <span class="radar-meta-chip"><i class="ti ti-calendar"></i> ' + usDailyPicksEsc(dateStr) + '</span>'
    + '  <span class="radar-meta-chip"><i class="ti ti-target"></i> ' + pickCount + ' TARGET TERKUNCI</span>'
    + '  <button class="btn btn-ghost btn-xs" onclick="usDailyPicksOpenCoverageModal()" title="Info Metodologi &amp; Cakupan"><i class="ti ti-info-circle"></i> Info Rotasi</button>'
    + '  <button class="btn btn-ghost btn-xs radar-refresh-btn" onclick="usDailyPicksLoad()" title="Pindai Ulang Radar"><i class="ti ti-refresh"></i> Pindai Ulang</button>'
    + '</div>'
    + '</div>';

  var cornerBrackets = '<div class="radar-hud-bracket radar-hud-tl"></div>'
    + '<div class="radar-hud-bracket radar-hud-tr"></div>'
    + '<div class="radar-hud-bracket radar-hud-bl"></div>'
    + '<div class="radar-hud-bracket radar-hud-br"></div>';

  var content;
  if (US_DAILY_PICKS_STATE.loading && !d) {
    content = '<div class="radar-scope-wrapper" style="text-align:center;padding:48px 20px">'
      + cornerBrackets
      + '<div class="radar-scope-container" style="width:300px;height:300px;margin-bottom:16px">'
      + '  <div class="radar-scope">'
      + '    <div class="radar-ring ring-alpha"></div>'
      + '    <div class="radar-ring ring-strong"></div>'
      + '    <div class="radar-crosshair-h"></div>'
      + '    <div class="radar-crosshair-v"></div>'
      + '    <div class="radar-sweep-beam"></div>'
      + '    <div class="radar-center-origin"><div class="radar-emitter-ripple"></div></div>'
      + '  </div>'
      + '</div>'
      + '<div style="font-size:13px;font-weight:700;color:var(--text);margin-bottom:4px">Memindai Peluang Pasar...</div>'
      + '<div style="font-size:11px;color:var(--text3)">Mengevaluasi konfluensi bandarmology, momentum, dan fundamental emiten IDX</div>'
      + '</div>';
    el.innerHTML = header + content;
    return;
  }

  if (US_DAILY_PICKS_STATE.error && !d) {
    content = '<div class="radar-scope-wrapper" style="text-align:center;padding:36px 20px">'
      + cornerBrackets
      + '<div style="color:var(--red,#ef4444);font-size:24px;margin-bottom:8px"><i class="ti ti-alert-triangle"></i></div>'
      + '<div style="font-size:13px;font-weight:700;color:var(--text);margin-bottom:6px">Radar Mengalami Gangguan Sensor</div>'
      + '<div style="font-size:11px;color:var(--text3);margin-bottom:14px">' + usDailyPicksEsc(US_DAILY_PICKS_STATE.error) + '</div>'
      + '<button class="btn btn-outline btn-sm" onclick="usDailyPicksLoad()"><i class="ti ti-refresh"></i> Coba Hubungkan Kembali</button>'
      + '</div>';
    el.innerHTML = header + content;
    return;
  }

  if (d && d.count === 0) {
    var cov = d.scanCoverage;
    var emptyReason = (cov && cov.scannedPerStrategyMax > 0)
      ? ('Rotasi harian baru memindai ' + cov.scannedPerStrategyMax + ' dari ' + cov.universeSize + ' emiten (per strategi) dan belum menemukan yang berstatus STRONG/QUALIFIED.')
      : 'Belum ada emiten yang berhasil dipindai untuk tanggal ini.';
    content = '<div class="radar-scope-wrapper" style="text-align:center;padding:36px 20px">'
      + cornerBrackets
      + '<div class="radar-scope-container" style="width:280px;height:280px;margin-bottom:16px">'
      + '  <div class="radar-scope">'
      + '    <div class="radar-ring ring-alpha"></div>'
      + '    <div class="radar-ring ring-strong"></div>'
      + '    <div class="radar-crosshair-h"></div>'
      + '    <div class="radar-crosshair-v"></div>'
      + '    <div class="radar-sweep-beam"></div>'
      + '    <div class="radar-center-origin"><div class="radar-emitter-ripple"></div></div>'
      + '  </div>'
      + '</div>'
      + '<div style="font-size:13px;font-weight:700;color:var(--text);margin-bottom:4px">Belum Ada Saham Masuk Jangkauan Radar</div>'
      + '<div style="font-size:11px;color:var(--text3);max-width:540px;margin:0 auto;line-height:1.5">' + usDailyPicksEsc(emptyReason) + '</div>'
      + '</div>';
    el.innerHTML = header + content;
    return;
  }

  if (hasPicks) {
    // Generate Hero Radar Scope Blips & Compact Plain Cards
    var blipsHtml = '';
    var totalPicks = d.picks.length;

    d.picks.forEach(function (p, idx) {
      var scoreVal = Number(p.score) || 75;
      var isAlpha = scoreVal >= 88.0;
      var isStrong = scoreVal >= 83.0 && scoreVal < 88.0;
      var tierClass = isAlpha ? 'tier-alpha' : (isStrong ? 'tier-strong' : 'tier-qualified');

      // Distance from center: higher score = closer to center bullseye (16% to 80% radius)
      var distPct = Math.max(16, Math.min(80, 84 - (scoreVal - 70) * 2.8));
      var angleDeg = (idx * (360 / totalPicks) + 40) % 360;
      var rad = angleDeg * (Math.PI / 180);
      var leftPct = (50 + (distPct / 2) * Math.cos(rad)).toFixed(2);
      var topPct = (50 + (distPct / 2) * Math.sin(rad)).toFixed(2);

      var logoSize = isAlpha ? 30 : 26;
      var stockLogo = typeof getStockLogoHtml === 'function' ? getStockLogoHtml(p.ticker, logoSize) : '';

      // Special visual effect based on scoring on radar (Futuristic Blue & Cyan)
      var specialGlowHtml = '';
      if (isAlpha) {
        specialGlowHtml = '<div class="radar-blip-ping-blue-alpha"></div><div class="radar-target-reticle"></div>';
      } else if (isStrong) {
        specialGlowHtml = '<div class="radar-blip-ping-blue"></div>';
      } else {
        specialGlowHtml = '<div class="radar-blip-ping-cyan"></div>';
      }

      blipsHtml += '<div class="radar-target-blip ' + tierClass + '" style="left:' + leftPct + '%;top:' + topPct + '%" '
        + 'onclick="usDailyPicksOpenModal(' + idx + ')" '
        + 'title="' + usDailyPicksEsc(p.ticker) + ' (' + usDailyPicksEsc(p.name || '') + ') · Skor: ' + (p.score != null ? p.score : '-') + ' · Klik untuk buka popup">'
        + specialGlowHtml
        + '<div class="radar-blip-inner">'
        + stockLogo
        + '</div>'
        + '<div class="radar-blip-label-pod">'
        + '<span class="radar-blip-ticker">' + usDailyPicksEsc(p.ticker) + '</span>'
        + '<span class="radar-blip-score">' + (p.score != null ? p.score : '-') + '</span>'
        + '</div>'
        + '</div>';
    });

    // Plain compact card row — follows previous design (no images, plain color, no text clutter)
    var cardsHtml = d.picks.map(function (p, idx) {
      var rankBadgeBg = p.rank === 1 ? '#F59E0B' : p.rank === 2 ? '#94A3B8' : p.rank === 3 ? '#B45309' : 'var(--bg3, rgba(255,255,255,0.08))';
      var rankBadgeColor = p.rank <= 3 ? '#0B0D12' : 'var(--text3, #94a3b8)';
      var rankBadge = '<span class="radar-rank-circle" style="background:' + rankBadgeBg + ';color:' + rankBadgeColor + '">' + p.rank + '</span>';

      return '<div onclick="usDailyPicksOpenModal(' + idx + ')" class="radar-plain-card" role="button" tabindex="0" title="Klik untuk membuka popup alasan ' + usDailyPicksEsc(p.ticker) + '">'
        + '<div class="radar-card-top-row">'
        + '  <div class="radar-card-ident">'
        +      rankBadge
        + '    <span class="mono radar-card-ticker">' + usDailyPicksEsc(p.ticker) + '</span>'
        + '  </div>'
        + '  <span class="mono radar-card-score" style="color:' + usDailyPicksStatusColor(p.status) + '">' + (p.score != null ? p.score : '-') + '</span>'
        + '</div>'
        + '<div class="radar-card-strat-row">'
        +    usDailyPicksEsc(p.strategyName) + ' · <span style="font-weight:700;color:' + usDailyPicksStatusColor(p.status) + '">' + usDailyPicksEsc(p.status) + '</span>'
        + '</div>'
        + '<div class="radar-card-actions">'
        + '  <button class="btn btn-ghost btn-xs radar-card-btn" onclick="event.stopPropagation();usDailyPicksOpenModal(' + idx + ');"><i class="ti ti-file-text"></i> Alasan</button>'
        + '  <button class="btn btn-ghost btn-xs radar-card-btn-icon" onclick="event.stopPropagation();if(typeof selectStockChatTicker===\'function\')selectStockChatTicker(\'' + p.ticker + '\');if(typeof goPage===\'function\')goPage(\'stock-dossier\');" title="Chart / Dossier"><i class="ti ti-chart-candle"></i></button>'
        + '</div>'
        + '</div>';
    }).join('');

    // Large Hero Radar Screen (Centered)
    var radarScopeHero = '<div class="radar-hero-box">'
      + '<div class="radar-scope-container hero-radar-size">'
      + '  <div class="radar-compass-label radar-compass-n">000° N</div>'
      + '  <div class="radar-compass-label radar-compass-ne">045°</div>'
      + '  <div class="radar-compass-label radar-compass-e">090° E</div>'
      + '  <div class="radar-compass-label radar-compass-se">135°</div>'
      + '  <div class="radar-compass-label radar-compass-s">180° S</div>'
      + '  <div class="radar-compass-label radar-compass-sw">225°</div>'
      + '  <div class="radar-compass-label radar-compass-w">270° W</div>'
      + '  <div class="radar-compass-label radar-compass-nw">315°</div>'
      + '  <div class="radar-scope" id="radar-scope-screen">'
      + '    <div class="radar-ring ring-outer"><span class="radar-ring-tag">75</span></div>'
      + '    <div class="radar-ring ring-qualified"><span class="radar-ring-tag">80</span></div>'
      + '    <div class="radar-ring ring-strong"><span class="radar-ring-tag">85</span></div>'
      + '    <div class="radar-ring ring-alpha"><span class="radar-ring-tag">88+ ALPHA</span></div>'
      + '    <div class="radar-crosshair-h"></div>'
      + '    <div class="radar-crosshair-v"></div>'
      + '    <div class="radar-crosshair-d1"></div>'
      + '    <div class="radar-crosshair-d2"></div>'
      + '    <div class="radar-sweep-beam"></div>'
      + '    <div class="radar-center-origin"><div class="radar-emitter-ripple"></div></div>'
      + blipsHtml
      + '  </div>'
      + '</div>'
      + '<div style="margin-top:14px;display:flex;align-items:center;justify-content:center;gap:18px;font-size:11px;color:#94a3b8;font-family:var(--font-mono);flex-wrap:wrap">'
      + '  <span style="display:inline-flex;align-items:center;gap:6px"><span style="width:9px;height:9px;border-radius:50%;background:#00e5ff;box-shadow:0 0 8px #00e5ff;display:inline-block"></span> <strong style="color:var(--text,#f8fafc)">Bullseye 88+</strong> (Alpha Target · Cyan Glow)</span>'
      + '  <span style="display:inline-flex;align-items:center;gap:6px"><span style="width:9px;height:9px;border-radius:50%;background:#3b82f6;box-shadow:0 0 8px #3b82f6;display:inline-block"></span> <strong style="color:var(--text,#f8fafc)">Strong 83-87</strong> (Electric Blue)</span>'
      + '  <span style="display:inline-flex;align-items:center;gap:6px"><span style="width:9px;height:9px;border-radius:50%;background:#0284c7;display:inline-block"></span> <strong style="color:var(--text,#f8fafc)">Qualified &lt;83</strong> (Sky Blue)</span>'
      + '</div>'
      + '</div>';

    // Cards Row (Horizontal Scrollable, Compact, Plain)
    var cardsSection = '<div class="radar-cards-section">'
      + '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;flex-wrap:wrap;gap:6px">'
      + '  <span style="font-size:12px;font-weight:800;color:var(--text);letter-spacing:0.02em;display:flex;align-items:center;gap:6px"><i class="ti ti-target" style="color:#38bdf8"></i> Daftar Saham Terdeteksi (' + totalPicks + ' Emiten)</span>'
      + '  <span style="font-size:10.5px;color:var(--text3)">Klik kartu atau tombol "Alasan" untuk popup rincian</span>'
      + '</div>'
      + '<div class="radar-cards-scroll-row">' + cardsHtml + '</div>'
      + '</div>';

    // Clean Minimal Footer (No long text dump; opened via modal)
    var footerBar = '<div style="margin-top:14px;padding-top:12px;border-top:1px solid rgba(56,189,248,0.1);display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px">'
      + '<span style="font-size:10.5px;color:var(--text3)">Data EOD ' + usDailyPicksEsc(d.date) + ' · Bukan nasihat investasi</span>'
      + '<button class="btn btn-ghost btn-xs" onclick="usDailyPicksOpenCoverageModal()" style="font-size:10px;padding:2px 8px;color:var(--text3)"><i class="ti ti-info-circle"></i> Catatan Rotasi &amp; Metodologi</button>'
      + '</div>';

    content = '<div class="radar-scope-wrapper">'
      + cornerBrackets
      + radarScopeHero
      + cardsSection
      + footerBar
      + '</div>';
  } else {
    content = '';
  }

  el.innerHTML = header + content;
}

window.usDailyPicksOpenModal = usDailyPicksOpenModal;
window.usDailyPicksOpenCoverageModal = usDailyPicksOpenCoverageModal;
window.usDailyPicksCloseModal = usDailyPicksCloseModal;
window.usDailyPicksRender = usDailyPicksRender;
