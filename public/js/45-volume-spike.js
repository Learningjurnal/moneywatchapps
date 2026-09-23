/**
 * 45-volume-spike.js — Volume Spike Scanner
 *
 * Fitur: analisis lonjakan volume transaksi per-saham dibanding
 * median 14 hari/30 hari, mengikuti format visual laporan "Volume Spike"
 * ala Sectors.app yang dikirim user, TAPI hanya diisi dengan data yang
 * benar-benar dimiliki aplikasi ini:
 *
 * - Volume harian & harga penutupan: REAL, dari rdEnsure()/rdGetAny()
 *   (13-realdata.js) — cache OHLCV 1 tahun Yahoo Finance yang sudah
 *   dipakai bersama oleh FlowScan/TradeWave/Screener/Backtester, berlaku
 *   untuk TICKER APAPUN (tidak terbatas LQ45).
 * - Foreign Net Buy/Sell (hari ini & agregat 30 hari): REAL kalau Invezgo
 *   dikonfigurasi (generateBrokerSummary() di lib/idx-data-engine.js, via
 *   endpoint /api/idx/broker-summary/:ticker) — TAPI jujur diberi label
 *   "(simulasi)" kalau `isSimulated:true` dikembalikan API, PERSIS pola
 *   yang sudah dipakai di seluruh app (27-stockintel.js, 41-stockchat-
 *   cockpit.js) untuk data broker/bandarmology. HANYA dipanggil untuk
 *   SATU ticker yang sedang dilihat di panel detail — TIDAK PERNAH per
 *   baris tabel screening (lihat blok "SCREENING" di bawah).
 * - SENGAJA TIDAK ADA hitungan "N Buy Days / M Sell Days" dari histori
 *   30 hari (seperti pada referensi Sectors.app) — itu butuh broker
 *   summary PER HARI selama 30 hari (30 panggilan API terpisah), yang
 *   akan menghabiskan kuota Invezgo bulanan (lihat getQuotaUsage() di
 *   idx-data-engine.js) hanya untuk satu kali buka halaman ini. Alih-alih
 *   itu, angka 30 hari ditampilkan sebagai satu agregat (1 panggilan API,
 *   timeframe=1M) — jujur soal keterbatasannya, bukan mengarang breakdown
 *   harian yang tidak benar-benar dihitung.
 *
 * ── LAYOUT (2026-09-14, user-requested rework) ──
 * Halaman dibagi 2 kolom (class .g2b, sama seperti pola grid 2-kolom
 * yang sudah dipakai di tempat lain di app, sudah otomatis menumpuk jadi
 * 1 kolom di layar sempit — lihat main.css):
 *   - KIRI: panel detail ticker tunggal (fitur lama, tidak berubah).
 *   - KANAN: tabel SCREENING lintas-saham — cari kandidat volume spike
 *     dulu, baru pilih satu buat dianalisis mendalam di kiri. Klik satu
 *     baris tabel = pilih ticker itu (ikut disiarkan ke GLOBAL_STOCK_
 *     CONTEXT supaya halaman lain ikut pindah juga).
 *
 * ── SUMBER DATA TABEL SCREENING (mudah diverifikasi, TANPA Invezgo) ──
 *   1. Daftar ticker + keanggotaan indeks (LQ45/IDX30/IDX80/Kompas100):
 *      GET /api/idx/stocks?index=... (loadBaseUniverse() di lib/universe.js)
 *      — daftar STATIS lokal (bukan API pihak ketiga), nol kuota apapun.
 *   2. Volume harian per ticker buat hitung median 14D/30D & rasio:
 *      rdEnsure()/rdGetAny() — PERSIS mesin yang sama dengan panel detail
 *      di kolom kiri (Yahoo Finance, di-cache per hari di localStorage).
 *      Dipilih justru KARENA sudah dipakai & diverifikasi di kolom kiri
 *      pada file yang sama — paling mudah diidentifikasi/diaudit,
 *      dibanding membangun jalur data baru. Yahoo Finance != Invezgo,
 *      jadi memindai berapa pun banyak saham TIDAK memakai kuota Invezgo
 *      sama sekali.
 *   Di-fetch BERURUTAN dengan jeda (pola sama seperti rdFetchLivePrices()
 *   di 13-realdata.js) supaya tidak membanjiri proxy CORS publik yang
 *   sudah dipakai bersama seluruh app.
 */

// FIX (2026-09-14, user-reported "layout tidak stabil" — ambang naik ke 1.70x
// atas permintaan user sendiri): satu konstanta ambang "spike" dipakai di
// SELURUH file (panel detail kiri MAUPUN tabel screening kanan) — sebelumnya
// 1.5x ditulis literal berulang di 3 tempat berbeda, rawan salah satu
// ketinggalan kalau nilainya diubah lagi nanti.
var VS_SPIKE_THRESHOLD = 1.70;

var VS_STATE = { ticker: null, loading: false };

// FIX (2026-09-19, user-directed consolidation: "volume spike, quant
// analysis masuk tab screener, karena seluruh fungsinya sama2 deteksi"):
// Volume Spike Scanner moved from its own standalone page into a tab
// inside the unified Screener (public/js/48-unified-screener.js,
// US_STATE.pageTab === 'volspike') — same "relocate the tab, keep the
// formula" pattern already used for TradeWave's Wave Cockpit/Risk Planner.
// This scanner's real volume-ratio-vs-median formula is genuinely
// different from the Screener's Whale/Uptrend formula, so this is a UI
// relocation, not an analysis merge. Every function below used to
// hardcode el('page-volume-spike') as its render target; they now read
// this variable instead, which the Screener page points at its own
// sub-tab container before calling renderVolumeSpikePage().
var VS_CONTAINER_ID = 'page-volume-spike';
var VS_SCREEN_STATE = {
  index: 'lq45',          // filter aktif: lq45 | idx30 | idx80 | kompas100
  filterBandar: 'all',    // filter akumulasi/distribusi: all | acc | dist
  rows: [],                // hasil scan [{code,name,todayVol,med14,med30,ratio14,ratio30,isSpike,chg1d}]
  scanning: false,
  scannedCount: 0,
  totalCount: 0,
  sortKey: 'ratio30',
  sortDir: 'desc',
  scanToken: 0             // dibatalkan kalau filter berganti di tengah scan
};
// FIX (2026-09-17, user-reported "Screening Volume Spike cuma maksimal
// saham Kompas 100"): 'all' added as the widest option (950+ tickers, no
// index filter server-side). See vsStartScreening()/vsScanNext() below for
// how a universe this size is scanned in bounded concurrent batches
// instead of one ticker at a time (would take ~5.5 minutes sequentially).
var VS_INDEX_LABELS = { lq45: 'LQ45', idx30: 'IDX30', idx80: 'IDX80', kompas100: 'Kompas100', all: 'Seluruh BEI (950+)' };
var VS_SCAN_BATCH = 4; // concurrency kept modest — rdEnsure()/rdFetchYahoo() share a public CORS proxy with the rest of the app
// FIX (2026-09-14, user-requested): tabel screening dibatasi menampilkan
// maksimal 10 baris tertinggi (sesuai sort aktif) — scan seluruh index
// TETAP jalan penuh di background (VS_SCREEN_STATE.rows menyimpan SEMUA
var VS_MAX_DISPLAY_ROWS = 20;

function vsFmtVol(n) {
  n = Number(n) || 0;
  var a = Math.abs(n);
  if (a >= 1e9) return (n / 1e9).toFixed(2) + 'B';
  if (a >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (a >= 1e3) return (n / 1e3).toFixed(0) + 'K';
  return String(Math.round(n));
}

function vsMedian(arr) {
  var a = arr.filter(function(v) { return typeof v === 'number' && v > 0; }).slice().sort(function(x, y) { return x - y; });
  if (!a.length) return 0;
  var mid = Math.floor(a.length / 2);
  return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
}

function vsSparklineHtml(closes, isUp, gradId) {
  if (!closes || closes.length < 2) return '';
  var id = gradId || ('vs-grad-' + Math.random().toString(36).slice(2, 9));
  var min = Math.min.apply(null, closes), max = Math.max.apply(null, closes);
  var range = (max - min);
  if (range <= 0) range = Math.max(1, Math.abs(min) * 0.01);

  var w = 120, h = 44;
  var padTop = 5, padBottom = 4, padX = 2;
  var effW = w - (padX * 2);
  var effH = h - padTop - padBottom;

  var pts = closes.map(function(v, i) {
    var x = padX + (i / (closes.length - 1)) * effW;
    var y = padTop + effH - ((v - min) / range) * effH;
    return { x: x, y: y };
  });

  // Construct smooth Catmull-Rom cubic Bézier curve
  var d = 'M ' + pts[0].x.toFixed(1) + ' ' + pts[0].y.toFixed(1);
  if (pts.length === 2) {
    d += ' L ' + pts[1].x.toFixed(1) + ' ' + pts[1].y.toFixed(1);
  } else {
    for (var i = 0; i < pts.length - 1; i++) {
      var p0 = pts[i === 0 ? 0 : i - 1];
      var p1 = pts[i];
      var p2 = pts[i + 1];
      var p3 = (i + 2 < pts.length) ? pts[i + 2] : p2;

      var cp1x = p1.x + (p2.x - p0.x) * 0.16;
      var cp1y = p1.y + (p2.y - p0.y) * 0.16;
      var cp2x = p2.x - (p3.x - p1.x) * 0.16;
      var cp2y = p2.y - (p3.y - p1.y) * 0.16;

      d += ' C ' + cp1x.toFixed(1) + ' ' + cp1y.toFixed(1) + ', ' + cp2x.toFixed(1) + ' ' + cp2y.toFixed(1) + ', ' + p2.x.toFixed(1) + ' ' + p2.y.toFixed(1);
    }
  }

  var firstPt = pts[0];
  var lastPt = pts[pts.length - 1];
  var fillD = d + ' L ' + lastPt.x.toFixed(1) + ' ' + (h + 2) + ' L ' + firstPt.x.toFixed(1) + ' ' + (h + 2) + ' Z';

  var strokeColor = isUp ? '#10B981' : '#EF4444';
  var stopColor = isUp ? '#10B981' : '#EF4444';

  return '<svg viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none" style="width:100%;height:48px;display:block;overflow:visible;margin-top:2px">'
    + '<defs>'
      + '<linearGradient id="' + id + '" x1="0" y1="0" x2="0" y2="1">'
        + '<stop offset="0%" stop-color="' + stopColor + '" stop-opacity="0.35"/>'
        + '<stop offset="55%" stop-color="' + stopColor + '" stop-opacity="0.10"/>'
        + '<stop offset="100%" stop-color="' + stopColor + '" stop-opacity="0.0"/>'
      + '</linearGradient>'
    + '</defs>'
    + '<path d="' + fillD + '" fill="url(#' + id + ')" />'
    + '<path d="' + d + '" fill="none" stroke="' + strokeColor + '" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>'
    + '<circle cx="' + lastPt.x.toFixed(1) + '" cy="' + lastPt.y.toFixed(1) + '" r="5" fill="' + strokeColor + '" opacity="0.25"/>'
    + '<circle cx="' + lastPt.x.toFixed(1) + '" cy="' + lastPt.y.toFixed(1) + '" r="2.5" fill="' + strokeColor + '"/>'
    + '</svg>';
}

// Statistik volume harian dipakai BERSAMA oleh panel detail (kiri) dan tiap
// baris tabel screening (kanan) — satu titik hitung, supaya angka rasio yang
// ditampilkan di kedua tempat selalu konsisten (sebelumnya logika ini hanya
// ada inline di vsRenderContent(), diduplikasi manual kalau dipakai di tabel).
function vsVolumeStats(rows) {
  var todayRow = rows[rows.length - 1];
  var todayVol = todayRow.volume || 0;
  var vol14Arr = rows.slice(-15, -1).map(function(r) { return r.volume; });
  var vol30Arr = rows.slice(-31, -1).map(function(r) { return r.volume; });
  var med14 = vsMedian(vol14Arr);
  var med30 = vsMedian(vol30Arr);
  var ratio14 = med14 > 0 ? (todayVol / med14) : 0;
  var ratio30 = med30 > 0 ? (todayVol / med30) : 0;
  var closes = rows.map(function(r) { return r.close; });
  var n = closes.length;
  var pctChange = function(daysBack) {
    var idx = n - 1 - daysBack;
    if (idx < 0 || !closes[idx]) return null;
    return ((closes[n - 1] - closes[idx]) / closes[idx]) * 100;
  };
  return {
    todayVol: todayVol, med14: med14, med30: med30,
    ratio14: ratio14, ratio30: ratio30,
    isSpike: ratio14 >= VS_SPIKE_THRESHOLD || ratio30 >= VS_SPIKE_THRESHOLD,
    chg1d: pctChange(1), chg3d: pctChange(3), chg7d: pctChange(7),
    closes: closes
  };
}

function renderVolumeSpikePage(presetTicker) {
  var c = el(VS_CONTAINER_ID);
  if (!c) return;
  // Urutan resolusi ticker: eksplisit diminta > state halaman ini > GLOBAL_STOCK_CONTEXT
  // (ticker aktif lintas-halaman, dipakai bersama Fundamental/Technical/Valuation/
  // StockChat/Bandarmology — lihat 00-config.js) > fallback lama > default.
  var tk = (presetTicker
    || VS_STATE.ticker
    || (typeof window !== 'undefined' && window.GLOBAL_STOCK_CONTEXT && window.GLOBAL_STOCK_CONTEXT.getTicker())
    || (typeof MW_SELECTED_INTEL_TICKER !== 'undefined' && MW_SELECTED_INTEL_TICKER)
    || 'AKRA').toUpperCase().trim();
  VS_STATE.ticker = tk;

  // FIX (2026-09-14, user-reported "scan selalu reset dari 0"): sebelumnya
  // cek ini mengacu ke id="vs-screen-table" yang TIDAK PERNAH ada di markup
  // manapun (typo dari PR sebelumnya — yang benar-benar dibuat cuma
  // "vs-screen-tbody"/"vs-screen-col") — jadi kondisi ini SELALU true,
  // membangun ulang seluruh panel + me-restart scan dari 0 SETIAP KALI
  // renderVolumeSpikePage() dipanggil. Fungsi ini dipanggil otomatis tiap
  // ~60 detik oleh mesin harga live (lihat "if(tick%4===0)
  // renderPage(currentPage)" di 03-engine.js, bagian refresh IHSG/harga
  // yang jalan di SEMUA halaman) — untuk index besar (Kompas100, 131
  // saham × 350ms ≈ 46 detik per scan), refresh 60 detik itu HAMPIR SELALU
  // memotong scan di tengah jalan dan mengulang dari 0, persis gejala yang
  // dilaporkan. "vs-detail-col" dipakai sebagai penanda di sini karena
  // wrapper ini sendiri TIDAK PERNAH dibangun ulang setelah render pertama
  // (hanya isi di dalamnya, #vs-body, yang berubah) — beda dari
  // "vs-screen-tbody" yang isinya sengaja ditulis ulang tiap ganti filter.
  var firstRender = !el('vs-detail-col');
  if (firstRender) {
    vsRenderShell(tk);
    vsStartScreening(VS_SCREEN_STATE.index); // scan otomatis sekali saat halaman pertama dibuka
  } else {
    var inp = el('vs-ticker-input');
    if (inp) inp.value = tk;
    vsRenderBody(tk, '<div class="card" style="text-align:center;padding:40px;color:var(--text3)">Memuat data volume &amp; arus dana untuk ' + tk + '...</div>');
    vsHighlightSelectedRow(tk);
  }
  vsLoadAndRender(tk);
}

function vsSearch() {
  var input = el('vs-ticker-input');
  var tk = input ? input.value.toUpperCase().trim() : '';
  if (!tk) return;
  if (typeof isValidStockTicker === 'function' && !isValidStockTicker(tk)) {
    if (typeof showToast === 'function') showToast('Ticker "' + tk + '" tidak ditemukan di database IDX', { type: 'error' });
    return;
  }
  // Broadcast supaya halaman lain yang berbagi GLOBAL_STOCK_CONTEXT (Stock
  // Intel, Fundamental, Technical, Valuation, StockChat, Bandarmology) ikut
  // pindah ke ticker yang sama — sebelumnya Volume Spike terisolasi, tidak
  // mengirim maupun menerima perubahan ticker lintas-halaman.
  if (typeof window !== 'undefined' && window.GLOBAL_STOCK_CONTEXT) {
    window.GLOBAL_STOCK_CONTEXT.setTicker(tk, 'volume-spike');
  }
  renderVolumeSpikePage(tk);
}

// Dipanggil saat baris tabel screening (kanan) diklik — pilih ticker itu
// buat dianalisis di panel detail (kiri), TANPA membangun ulang shell/tabel.
function vsSelectFromScreen(tk) {
  if (!tk) return;
  if (typeof window !== 'undefined' && window.GLOBAL_STOCK_CONTEXT) {
    window.GLOBAL_STOCK_CONTEXT.setTicker(tk, 'volume-spike');
  }
  renderVolumeSpikePage(tk);
}

function vsHighlightSelectedRow(tk) {
  var rows = document.querySelectorAll('#vs-screen-tbody tr[data-code]');
  rows.forEach(function(r) {
    r.style.background = (r.getAttribute('data-code') === tk) ? 'var(--bg2)' : '';
  });
}

// FIX (2026-09-14, konsolidasi analisa "tanpa pindah-pindah tab"): subscribe
// ke GLOBAL_STOCK_CONTEXT, pola sama persis dengan listener Fundamental/
// Technical/Valuation/StockChat (lihat 24-stockmaster.js/10-hargawajar.js/
// 41-stockchat-cockpit.js) — supaya Volume Spike ikut pindah ticker saat
// dipilih dari modul lain. Kalau halaman ini sedang aktif, langsung re-render;
// kalau tidak, cukup update state supaya render berikutnya pakai ticker benar.
// Whether the Volume Spike scanner is the thing currently on-screen —
// generalized so it works both at its original standalone location and
// relocated inside the unified Screener's own tab (US_STATE.pageTab).
function vsIsContainerActive() {
  if (VS_CONTAINER_ID === 'page-volume-spike') {
    var pg = el('page-volume-spike');
    return !!(pg && pg.classList.contains('on'));
  }
  var radar = el('page-radar');
  return !!(radar && radar.classList.contains('on') && typeof US_STATE !== 'undefined' && US_STATE.pageTab === 'volspike');
}

if (typeof window !== 'undefined' && window.GLOBAL_STOCK_CONTEXT) {
  window.GLOBAL_STOCK_CONTEXT.subscribe(function(tk, source) {
    if (source !== 'volume-spike' && tk && tk !== VS_STATE.ticker) {
      if (vsIsContainerActive()) {
        renderVolumeSpikePage(tk);
      } else {
        VS_STATE.ticker = tk;
      }
    }
  });
}

function vsRenderShell(tk) {
  var c = el(VS_CONTAINER_ID);
  if (!c) return;
  c.innerHTML =
    '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:16px">'
      + '<div><div class="ptitle" style="display:flex;align-items:center;gap:8px"><i class="ti ti-activity" style="color:var(--accent)"></i> Volume Spike Scanner &amp; Flow Radar</div><div class="psub">Screening anomali lonjakan volume transaksi lintas-indeks BEI &amp; visualisasi arus akumulasi/distribusi smart money.</div></div>'
    + '</div>'
    + '<div class="g2b">'
      + '<div id="vs-detail-col">'
        + '<div class="card" style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:14px;border-radius:12px;background:var(--bg2);border:1px solid var(--border);padding:12px 16px">'
          + '<div style="display:flex;align-items:center;gap:8px;flex:1;min-width:180px">'
            + '<i class="ti ti-search" style="color:var(--text3);font-size:16px"></i>'
            + '<input id="vs-ticker-input" class="finput mono" style="flex:1;max-width:200px;text-transform:uppercase;font-weight:700;letter-spacing:0.04em;padding:6px 12px;border-radius:8px" placeholder="KODE SAHAM" value="' + tk + '" onkeydown="if(event.key===\'Enter\')vsSearch()">'
          + '</div>'
          + '<button class="sm-btn" onclick="vsSearch()" style="height:34px;padding:0 18px;border-radius:8px;font-size:12px;font-weight:700"><i class="ti ti-radar"></i> Analisa</button>'
        + '</div>'
        + '<div id="vs-body"><div class="card" style="text-align:center;padding:40px;color:var(--text3);border-radius:12px;background:var(--bg2);border:1px solid var(--border)">Memuat data volume &amp; arus dana untuk ' + tk + '...</div></div>'
      + '</div>'
      + '<div id="vs-screen-col">' + vsScreenPanelShellHtml() + '</div>'
    + '</div>';
}

function vsScreenPanelShellHtml() {
  var opts = Object.keys(VS_INDEX_LABELS).map(function(k) {
    return '<option value="' + k + '"' + (k === VS_SCREEN_STATE.index ? ' selected' : '') + '>' + VS_INDEX_LABELS[k] + '</option>';
  }).join('');
  var filterBandar = VS_SCREEN_STATE.filterBandar || 'all';
  return '<div class="card" style="border-radius:12px;background:var(--bg2);border:1px solid var(--border)">'
    + '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:12px">'
      + '<div class="ctitle" style="font-size:13px;display:flex;align-items:center;gap:6px"><i class="ti ti-scan" style="color:var(--accent)"></i> Screening Volume Spike</div>'
      + '<div class="filter-bar-inline" style="display:flex;gap:6px;align-items:center;flex-wrap:nowrap">'
        + '<select class="finput fsel" id="vs-filter-bandar" style="font-size:11px;padding:5px 24px 5px 8px;border-radius:8px;width:auto;min-width:110px;max-width:140px;flex:0 0 auto" onchange="vsFilterScreen(this.value)">'
          + '<option value="all"' + (filterBandar === 'all' ? ' selected' : '') + '>Semua Aliran</option>'
          + '<option value="acc"' + (filterBandar === 'acc' ? ' selected' : '') + '>🟢 Akumulasi</option>'
          + '<option value="dist"' + (filterBandar === 'dist' ? ' selected' : '') + '>🔴 Distribusi</option>'
        + '</select>'
        + '<select class="finput fsel" id="vs-screen-index" style="font-size:11.5px;padding:5px 24px 5px 9px;border-radius:8px;width:auto;min-width:85px;max-width:130px;flex:0 0 auto" onchange="vsStartScreening(this.value)">' + opts + '</select>'
        + '<button class="btn btn-ghost btn-xs" id="vs-screen-refresh" onclick="vsStartScreening(VS_SCREEN_STATE.index, true)" title="Pindai ulang" style="border-radius:6px;padding:5px 8px;flex:0 0 auto"><i class="ti ti-refresh"></i></button>'
      + '</div>'
    + '</div>'
    + '<div style="font-size:10.5px;color:var(--text3);margin-bottom:10px;line-height:1.4">Filter otomatis 20 saham dengan rasio volume ≥' + VS_SPIKE_THRESHOLD.toFixed(2) + 'x vs median 30 hari. Klik baris emiten untuk analisis detail.</div>'
    + '<div id="vs-screen-progress" style="font-size:11px;color:var(--text2);margin-bottom:8px;font-weight:600"></div>'
    + '<div style="overflow-x:auto"><table class="tbl" style="font-size:11.5px;width:100%">'
      + '<thead><tr>'
        + '<th style="cursor:pointer" onclick="vsSortScreen(\'code\')">Kode' + vsSortArrow('code') + '</th>'
        + '<th style="cursor:pointer;text-align:right" onclick="vsSortScreen(\'todayVol\')">Volume Hari Ini' + vsSortArrow('todayVol') + '</th>'
        + '<th style="cursor:pointer;text-align:right" onclick="vsSortScreen(\'med14\')">Median 14D' + vsSortArrow('med14') + '</th>'
        + '<th style="cursor:pointer;text-align:right" onclick="vsSortScreen(\'med30\')">Median 30D' + vsSortArrow('med30') + '</th>'
        + '<th style="cursor:pointer;text-align:right" onclick="vsSortScreen(\'ratio30\')">Rasio (30D)' + vsSortArrow('ratio30') + '</th>'
        + '<th style="cursor:pointer;text-align:center" onclick="vsSortScreen(\'chg1d\')" title="Heuristik dari arah harga hari ini (chg1d real) — bukan identitas buyer/seller sebenarnya">Indikasi' + vsSortArrow('chg1d') + '</th>'
      + '</tr></thead>'
      + '<tbody id="vs-screen-tbody"><tr><td colspan="6" style="text-align:center;padding:24px;color:var(--text3)">Memindai...</td></tr></tbody>'
    + '</table></div>'
  + '</div>';
}

function vsSortArrow(key) {
  if (VS_SCREEN_STATE.sortKey !== key) return '';
  return VS_SCREEN_STATE.sortDir === 'desc' ? ' ▼' : ' ▲';
}

function vsSortScreen(key) {
  if (VS_SCREEN_STATE.sortKey === key) {
    VS_SCREEN_STATE.sortDir = VS_SCREEN_STATE.sortDir === 'desc' ? 'asc' : 'desc';
  } else {
    VS_SCREEN_STATE.sortKey = key;
    VS_SCREEN_STATE.sortDir = (key === 'code') ? 'asc' : 'desc';
  }
  // Header (panah urut) ikut berubah, jadi shell panel di-render ulang —
  // tapi HANYA panel kanan, panel detail kiri tidak disentuh.
  var col = el('vs-screen-col');
  if (col) col.innerHTML = vsScreenPanelShellHtml();
  vsRenderScreenTable();
}

// Memindai daftar ticker sesuai indeks terpilih: ambil universe (statis,
// nol kuota) dari /api/idx/stocks, lalu untuk tiap ticker ambil volume via
// rdEnsure() (Yahoo, cache harian) SATU PER SATU dengan jeda supaya proxy
// CORS publik yang dipakai bersama seluruh app tidak dibanjiri permintaan
// paralel. Tabel terisi progresif — baris langsung muncul begitu satu
// ticker selesai dipindai, bukan menunggu semuanya selesai.
function vsStartScreening(indexKey, forceRefresh) {
  indexKey = indexKey || 'lq45';
  VS_SCREEN_STATE.index = indexKey;
  var myToken = ++VS_SCREEN_STATE.scanToken; // scan lama dibatalkan kalau filter ganti di tengah jalan
  VS_SCREEN_STATE.rows = [];
  VS_SCREEN_STATE.scanning = true;
  VS_SCREEN_STATE.scannedCount = 0;
  VS_SCREEN_STATE.totalCount = 0;
  var sel = el('vs-screen-index'); if (sel) sel.value = indexKey;
  var progressEl = el('vs-screen-progress');
  if (progressEl) progressEl.textContent = 'Memuat daftar saham ' + (VS_INDEX_LABELS[indexKey] || indexKey.toUpperCase()) + '...';
  vsRenderScreenTable();

  var qs = indexKey === 'all' ? 'limit=2000' : ('index=' + encodeURIComponent(indexKey) + '&limit=150');
  fetch('/api/idx/stocks?' + qs)
    .then(function(r) { return r.json(); })
    .then(function(res) {
      if (myToken !== VS_SCREEN_STATE.scanToken) return; // dibatalkan
      var universe = (res && res.success && res.data) ? res.data : [];
      VS_SCREEN_STATE.totalCount = universe.length;
      if (!universe.length) {
        VS_SCREEN_STATE.scanning = false;
        if (progressEl) progressEl.textContent = 'Tidak ada saham ditemukan untuk indeks ini.';
        vsRenderScreenTable();
        return;
      }
      vsScanNext(universe, 0, myToken, forceRefresh);
    })
    .catch(function() {
      if (myToken !== VS_SCREEN_STATE.scanToken) return;
      VS_SCREEN_STATE.scanning = false;
      if (progressEl) progressEl.textContent = 'Gagal memuat daftar saham.';
      vsRenderScreenTable();
    });
}

// FIX (2026-09-17, "Seluruh BEI" follow-up): scanning one ticker at a
// time (350ms apart) was fine for Kompas100 (~35s) but would take ~5.5
// minutes sequentially for 950+ tickers. Now processes VS_SCAN_BATCH
// tickers CONCURRENTLY per round (still paced 350ms between rounds, not
// between every single ticker) — a bounded speedup, not unlimited
// parallelism, since rdEnsure()/rdFetchYahoo() share a public CORS proxy
// with the rest of the app.
function vsScanNext(universe, i, myToken, forceRefresh) {
  if (myToken !== VS_SCREEN_STATE.scanToken) return; // filter sudah diganti, hentikan scan lama
  var progressEl = el('vs-screen-progress');
  if (i >= universe.length) {
    VS_SCREEN_STATE.scanning = false;
    if (progressEl) {
      var foundMsg = VS_SCREEN_STATE.rows.length + ' dari ' + universe.length + ' saham menunjukkan lonjakan volume ≥' + VS_SPIKE_THRESHOLD.toFixed(2) + 'x.';
      if (VS_SCREEN_STATE.rows.length > VS_MAX_DISPLAY_ROWS) foundMsg += ' Menampilkan ' + VS_MAX_DISPLAY_ROWS + ' rasio tertinggi.';
      progressEl.textContent = foundMsg;
    }
    // Satu-satunya titik di mana seluruh tabel diurutkan & ditulis ulang
    // penuh selama proses scan — sekali di akhir, bukan per-ticker (lihat
    // catatan di afterFetch() / vsAppendScreenRow()).
    vsRenderScreenTable();
    return;
  }
  var batch = universe.slice(i, i + VS_SCAN_BATCH);
  if (progressEl) progressEl.textContent = 'Memindai ' + Math.min(i + batch.length, universe.length) + '/' + universe.length + ' — ' + batch.map(function(x) { return x.code; }).join(', ') + '...';

  var remaining = batch.length;
  var scanOneTicker = function(item) {
    var tk = item.code;
    var afterFetch = function() {
      if (myToken !== VS_SCREEN_STATE.scanToken) return; // filter sudah diganti sementara fetch ini masih berjalan
      VS_SCREEN_STATE.scannedCount++;
      var rows = (typeof rdGetAny === 'function') ? rdGetAny(tk) : null;
      if (rows && rows.length >= 15) {
        var stats = vsVolumeStats(rows);
        // FIX (2026-09-14, user-reported "layout tidak stabil, seluruh
        // layout berubah"): sebelumnya SEMUA saham yang berhasil dipindai
        // (spike ATAU tidak) ditambahkan ke tabel — untuk index besar
        // (Kompas100, 100 saham) itu berarti tabel terus tumbuh dari 0 ke
        // 100 baris selama ~35 detik scan, dan ketinggian kolom kanan yang
        // terus berubah drastis ikut menggeser posisi elemen di sekitarnya
        // (termasuk panel detail di kolom kiri, karena keduanya berbagi 1
        // baris grid). Sekarang HANYA saham yang benar-benar memenuhi
        // kriteria spike (rasio ≥ VS_SPIKE_THRESHOLD, 1.70x) yang
        // ditambahkan ke tabel — mayoritas saham normal tidak pernah masuk
        // sama sekali, jadi tabel jarang tumbuh dan layout jauh lebih
        // stabil. Saham yang TIDAK lolos tetap dihitung di scannedCount
        // (lihat progress text) supaya user tahu berapa banyak yang sudah
        // diperiksa, walau tidak ditampilkan satu-satu.
        if (stats.isSpike) {
          var rowObj = {
            code: tk, name: item.name || (tk + ' Tbk.'),
            todayVol: stats.todayVol, med14: stats.med14, med30: stats.med30,
            ratio14: stats.ratio14, ratio30: stats.ratio30, isSpike: stats.isSpike, chg1d: stats.chg1d
          };
          // SEMUA saham spike tetap disimpan di state (tidak dibuang) — dipakai
          // untuk angka "N saham menunjukkan lonjakan" di progress text, dan
          // supaya scan TETAP jalan penuh di background sampai selesai
          // (user-requested: "biarkan scanning berjalan dibelakang").
          VS_SCREEN_STATE.rows.push(rowObj);
          vsMaybeUpdateVisibleTable(rowObj);
        }
      }
      remaining--;
      if (remaining <= 0) {
        setTimeout(function() { vsScanNext(universe, i + VS_SCAN_BATCH, myToken, forceRefresh); }, 350);
      }
    };
    if (forceRefresh && typeof rdFetchYahoo === 'function') {
      rdFetchYahoo(tk, afterFetch);
    } else if (typeof rdEnsure === 'function') {
      rdEnsure(tk, afterFetch);
    } else {
      afterFetch();
    }
  };
  batch.forEach(scanOneTicker);
}

function vsSortedScreenRows() {
  var key = VS_SCREEN_STATE.sortKey, dir = VS_SCREEN_STATE.sortDir;
  var filter = VS_SCREEN_STATE.filterBandar || 'all';
  var rows = VS_SCREEN_STATE.rows.filter(function(r) {
    if (filter === 'acc') return typeof r.chg1d === 'number' && r.chg1d >= 0;
    if (filter === 'dist') return typeof r.chg1d === 'number' && r.chg1d < 0;
    return true;
  });
  rows.sort(function(a, b) {
    var vA = a[key], vB = b[key];
    if (typeof vA === 'string') {
      return dir === 'asc' ? vA.localeCompare(vB) : vB.localeCompare(vA);
    }
    return dir === 'asc' ? (vA - vB) : (vB - vA);
  });
  return rows;
}

function vsTopScreenRows() {
  return vsSortedScreenRows().slice(0, VS_MAX_DISPLAY_ROWS);
}

function vsFilterScreen(val) {
  VS_SCREEN_STATE.filterBandar = val || 'all';
  vsRenderScreenTable();
}
window.vsFilterScreen = vsFilterScreen;

// HTML 1 baris tabel screening — dipakai BERSAMA oleh rebuild penuh
// (vsRenderScreenTable, dipanggil jarang/sekali) dan penambahan 1 baris
// saja saat scan sedang berjalan (vsAppendScreenRow, dipanggil tiap
// ticker) — satu titik render supaya markup kedua jalur selalu identik.
function vsRowHtml(r) {
  var isSel = r.code === VS_STATE.ticker;
  return '<tr data-code="' + r.code + '" style="cursor:pointer' + (isSel ? ';background:var(--bg2)' : '') + '" onclick="vsSelectFromScreen(\'' + r.code + '\')">'
    + '<td><div style="display:flex;align-items:center;gap:6px">'
      + (typeof getStockLogoHtml === 'function' ? getStockLogoHtml(r.code, 22) : '')
      + '<div><div style="font-weight:700">' + r.code + (r.isSpike ? ' <span class="badge" style="font-size:8.5px;padding:2px 6px;border-radius:4px;background:rgba(56,189,248,0.14);color:#38BDF8;border:1px solid rgba(56,189,248,0.3);font-weight:700">SPIKE</span>' : '') + '</div>'
      + '<div style="font-size:9.5px;color:var(--text3);max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + r.name + '</div></div>'
    + '</div></td>'
    + '<td style="text-align:right;font-family:var(--font-mono)">' + vsFmtVol(r.todayVol) + '</td>'
    + '<td style="text-align:right;font-family:var(--font-mono);color:var(--text3)">' + vsFmtVol(r.med14) + '</td>'
    + '<td style="text-align:right;font-family:var(--font-mono);color:var(--text3)">' + vsFmtVol(r.med30) + '</td>'
    + '<td style="text-align:right;font-family:var(--font-mono);font-weight:700" class="' + (r.ratio30 >= VS_SPIKE_THRESHOLD ? 'up' : 'neu') + '">' + r.ratio30.toFixed(2) + 'x</td>'
    + '<td style="text-align:center">' + (typeof r.chg1d === 'number'
      ? (r.chg1d >= 0
        ? '<span class="badge" style="font-size:8.5px;padding:2px 6px;background:rgba(34,197,94,0.14);color:var(--green);border:1px solid rgba(34,197,94,0.3)">AKUMULASI</span>'
        : '<span class="badge" style="font-size:8.5px;padding:2px 6px;background:rgba(239,68,68,0.14);color:var(--red);border:1px solid rgba(239,68,68,0.3)">DISTRIBUSI</span>')
      : '<span style="color:var(--text3);font-size:10px">-</span>') + '</td>'
  + '</tr>';
}

// Rebuild PENUH tabel (urut ulang semua baris) — sengaja dipakai jarang:
// state kosong/loading, akhir scan (sekali), ganti filter indeks, dan klik
// header sort (aksi eksplisit user, bukan sesuatu yang terjadi berulang
// otomatis di latar belakang). SELAMA scan berjalan, dipakai vsAppendScreenRow
// (di bawah) supaya baris yang sudah tampil tidak ikut "refresh".
function vsRenderScreenTable() {
  var tbody = el('vs-screen-tbody');
  if (!tbody) return;
  var rows = vsTopScreenRows(); // dibatasi max VS_MAX_DISPLAY_ROWS, scan penuh tetap di VS_SCREEN_STATE.rows
  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--text3)">'
      + (VS_SCREEN_STATE.scanning ? 'Memindai...' : ('Tidak ada saham dengan lonjakan volume ≥' + VS_SPIKE_THRESHOLD.toFixed(2) + 'x di indeks ini saat ini.')) + '</td></tr>';
    return;
  }
  tbody.innerHTML = rows.map(vsRowHtml).join('');
}

// Tambahkan SATU baris baru ke tabel tanpa menyentuh baris yang sudah
// tampil — dipakai selama tabel masih di bawah VS_MAX_DISPLAY_ROWS baris
// (lihat vsMaybeUpdateVisibleTable) supaya layar tidak "refresh"/berkedip
// penuh terus-menerus. Baris ditambahkan di URUTAN DITEMUKAN (bukan
// diurutkan ulang tiap kali — itu yang bikin baris lama meloncat posisi);
// urutan sesuai sort aktif baru diterapkan sekali di akhir scan lewat
// vsRenderScreenTable().
function vsAppendScreenRow(r) {
  var tbody = el('vs-screen-tbody');
  if (!tbody) return;
  var placeholder = tbody.querySelector('td[colspan]');
  if (placeholder) tbody.innerHTML = ''; // baris pertama: buang placeholder "Memindai..."
  var wrap = document.createElement('tbody');
  wrap.innerHTML = vsRowHtml(r);
  var tr = wrap.firstElementChild;
  tr.style.animation = 'smFadeIn .25s ease'; // transisi halus, bukan lompatan mendadak
  tbody.appendChild(tr);
}

// FIX (2026-09-14, user-requested "hanya tampilkan 10 tertinggi, biarkan
// scanning berjalan dibelakang"): dipanggil tiap kali 1 saham baru lolos
// ambang spike selama scan. Tabel yang TAMPIL dibatasi VS_MAX_DISPLAY_ROWS
// (10) baris, tapi scan tetap jalan penuh sampai akhir index (lihat
// vsScanNext — tidak berhenti di 10) supaya "N saham ditemukan" di
// progress text tetap akurat.
//   - Kalau baris yang tampil MASIH di bawah 10: cukup append 1 baris baru
//     (murah, tanpa rebuild — sama seperti sebelumnya).
//   - Kalau sudah PAS 10: baris baru hanya memicu render ulang (dibatasi
//     tetap 10 baris, jadi tetap murah) KALAU saham ini cukup tinggi buat
//     benar-benar masuk top 10 saat ini — menggeser 1 baris yang paling
//     rendah keluar. Saham yang tidak cukup tinggi diam-diam diabaikan
//     dari tampilan (tapi tetap tersimpan di VS_SCREEN_STATE.rows).
function vsMaybeUpdateVisibleTable(newRow) {
  var filter = VS_SCREEN_STATE.filterBandar || 'all';
  var matches = true;
  if (filter === 'acc') matches = (typeof newRow.chg1d === 'number' && newRow.chg1d >= 0);
  else if (filter === 'dist') matches = (typeof newRow.chg1d === 'number' && newRow.chg1d < 0);
  if (!matches) return;

  var tbody = el('vs-screen-tbody');
  var shownCount = tbody ? tbody.querySelectorAll('tr[data-code]').length : 0;
  if (shownCount < VS_MAX_DISPLAY_ROWS) {
    vsAppendScreenRow(newRow);
    return;
  }
  if (vsTopScreenRows().indexOf(newRow) !== -1) {
    vsRenderScreenTable(); // tetap dibatasi max baris oleh vsTopScreenRows() — murah, jarang terjadi
  }
}

function vsLoadAndRender(tk) {
  VS_STATE.loading = true;
  if (typeof rdEnsure !== 'function') {
    vsRenderBody(tk, '<div class="card" style="text-align:center;padding:40px;color:var(--text3)">Modul data historis (13-realdata.js) tidak dimuat.</div>');
    return;
  }
  rdEnsure(tk, function() {
    var rows = (typeof rdGetAny === 'function') ? rdGetAny(tk) : null;
    if (!rows || rows.length < 15) {
      VS_STATE.loading = false;
      vsRenderBody(tk, '<div class="card" style="text-align:center;padding:40px;color:var(--text3)">Data historis volume untuk <b>' + tk + '</b> tidak cukup (butuh minimal 15 hari bursa). Coba ticker lain atau cek kembali nanti.</div>');
      return;
    }

    var fetchBs = function(tf) {
      return fetch('/api/idx/broker-summary/' + encodeURIComponent(tk) + '?timeframe=' + tf)
        .then(function(r) { return r.ok ? r.json() : null; })
        .catch(function() { return null; });
    };

    // Reuse cache 1D milik Stock Intel Cockpit (MW_INTEL_CACHE, 27-stockintel.js)
    // kalau ticker yang sama baru saja dianalisis di sana — mengurangi
    // panggilan /api/idx/broker-summary duplikat untuk ticker+timeframe yang
    // persis sama, yang sebelumnya selalu fetch ulang dari nol tiap buka
    // Volume Spike walau Stock Intel baru saja mengambil data yang sama.
    var cached1d = (typeof MW_INTEL_CACHE !== 'undefined' && MW_INTEL_CACHE[tk] && MW_INTEL_CACHE[tk].brokerSummary) || null;
    var bs1dPromise = cached1d ? Promise.resolve({ data: cached1d }) : fetchBs('1D');

    Promise.all([bs1dPromise, fetchBs('1M')]).then(function(results) {
      VS_STATE.loading = false;
      vsRenderContent(tk, rows, results[0] && results[0].data, results[1] && results[1].data);
      vsHighlightSelectedRow(tk);
    });
  });
}

function vsRenderBody(tk, html) {
  var body = el('vs-body');
  if (body) body.innerHTML = html;
}

function vsRenderContent(tk, rows, bs1d, bs30d) {
  var info = (typeof DB !== 'undefined' && DB[tk]) ? DB[tk] : null;
  var name = (info && info.name) || tk + ' Tbk.';

  var stats = vsVolumeStats(rows);
  var todayVol = stats.todayVol, med14 = stats.med14, med30 = stats.med30;
  var ratio14 = stats.ratio14, ratio30 = stats.ratio30, isSpike = stats.isSpike;
  var closes = stats.closes;
  var chg1d = stats.chg1d, chg3d = stats.chg3d, chg7d = stats.chg7d;

  // 7 hari terakhir untuk bar chart volume
  var last7 = rows.slice(-7);

  // FIX (2026-09-18, user-reported: "belum dijelaskan ini volume akumulasi
  // atau distribusi karna anda hitung sesuai volume bukan pada aksinya"):
  // volume itu sendiri tetap directionless (total transaksi, dijelaskan di
  // baris di bawahnya) — TAPI arah harga PADA HARI lonjakan terjadi (chg1d,
  // data real dari OHLCV, bukan tebakan) adalah heuristik teknikal standar
  // untuk indikasi akumulasi (volume naik + harga naik) vs distribusi
  // (volume naik + harga turun). Ini "indikasi" dari pola harga+volume real,
  // BUKAN klaim mengetahui identitas buyer/seller sebenarnya — itu tetap
  // butuh data Bandarmology (broker summary) untuk dipastikan.
  var vsSpikeDirection = chg1d >= 0
    ? '<span style="color:var(--green);font-weight:700">Indikasi AKUMULASI</span> (harga naik ' + chg1d.toFixed(2) + '% saat volume melonjak)'
    : '<span style="color:var(--red);font-weight:700">Indikasi DISTRIBUSI</span> (harga turun ' + chg1d.toFixed(2) + '% saat volume melonjak)';

  var headline = isSpike
    ? '<div style="display:flex;align-items:center;gap:12px">'
      + '<div style="width:38px;height:38px;border-radius:10px;background:rgba(245,158,11,0.15);color:var(--amber);display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0"><i class="ti ti-bolt"></i></div>'
      + '<div>'
        + '<div class="ctitle" style="font-size:14px;color:var(--amber);margin-bottom:2px">LONJAKAN VOLUME TINGGI TERDETEKSI (VOLUME SPIKE)</div>'
        + '<div style="font-size:12px;color:var(--text2);line-height:1.4">'
          + 'Aktivitas transaksi melonjak '
          + (ratio30 >= VS_SPIKE_THRESHOLD ? '<b style="color:var(--amber)">' + ratio30.toFixed(2) + 'x</b> di atas median 30 hari' : '<b style="color:var(--amber)">' + ratio14.toFixed(2) + 'x</b> di atas median 14 hari')
          + ' — ' + vsSpikeDirection + '. '
          + '<span style="color:var(--text3)">(Volume total transaksi — gabungan sisi beli &amp; jual, bukan volume satu arah; arah akumulasi/distribusi di atas adalah heuristik dari kombinasi volume+harga real, bukan identitas buyer/seller. Untuk breakdown broker sebenarnya, cek tab Bandarmology.)</span>'
        + '</div>'
      + '</div>'
    + '</div>'
    : '<div style="display:flex;align-items:center;gap:12px">'
      + '<div style="width:38px;height:38px;border-radius:10px;background:var(--bg3);border:1px solid var(--border);color:var(--text3);display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0"><i class="ti ti-activity"></i></div>'
      + '<div>'
        + '<div class="ctitle" style="font-size:14px;color:var(--text2);margin-bottom:2px">Aktivitas Volume Normal (Di Bawah Ambang Spike)</div>'
        + '<div style="font-size:12px;color:var(--text3);line-height:1.4">Volume hari ini ' + ratio14.toFixed(2) + 'x median 14D dan ' + ratio30.toFixed(2) + 'x median 30D — di bawah batas lonjakan (' + VS_SPIKE_THRESHOLD.toFixed(2) + 'x).</div>'
      + '</div>'
    + '</div>';

  var html =
    '<div class="card" style="border:1px solid var(--border);background:var(--bg2);margin-bottom:14px;border-radius:12px;padding:14px 16px">' + headline + '</div>'

    + '<div class="card" style="margin-bottom:14px;border-radius:12px;background:var(--bg2);border:1px solid var(--border);padding:14px 18px">'
      + '<div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap;justify-content:space-between">'
        + '<div style="display:flex;align-items:center;gap:12px">'
          + (typeof getStockLogoHtml === 'function' ? getStockLogoHtml(tk, 42) : '')
          + '<div>'
            + '<div style="font-size:17px;font-weight:800;letter-spacing:0.02em;color:var(--text)">' + tk + '</div>'
            + '<div style="font-size:11px;color:var(--text3)">' + name + '</div>'
          + '</div>'
        + '</div>'
        + '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">'
          + '<div style="background:var(--bg3);border:1px solid var(--border);border-radius:8px;padding:8px 12px;text-align:right">'
            + '<div style="font-size:9.5px;color:var(--text3);font-weight:700;letter-spacing:0.04em">TODAY VOLUME</div>'
            + '<div class="up" style="font-size:14px;font-weight:800;font-family:var(--font-mono);font-variant-numeric:tabular-nums">' + vsFmtVol(todayVol) + '</div>'
          + '</div>'
          + '<div style="background:var(--bg3);border:1px solid var(--border);border-radius:8px;padding:8px 12px;text-align:right">'
            + '<div style="font-size:9.5px;color:var(--text3);font-weight:700;letter-spacing:0.04em">14D MEDIAN</div>'
            + '<div style="font-size:14px;font-weight:800;font-family:var(--font-mono);color:var(--text);font-variant-numeric:tabular-nums">' + vsFmtVol(med14) + '</div>'
          + '</div>'
          + '<div style="background:var(--bg3);border:1px solid var(--border);border-radius:8px;padding:8px 12px;text-align:right">'
            + '<div style="font-size:9.5px;color:var(--text3);font-weight:700;letter-spacing:0.04em">30D MEDIAN</div>'
            + '<div style="font-size:14px;font-weight:800;font-family:var(--font-mono);color:var(--text);font-variant-numeric:tabular-nums">' + vsFmtVol(med30) + '</div>'
          + '</div>'
          + '<div style="background:rgba(56,189,248,0.06);border:1px solid rgba(56,189,248,0.25);border-radius:8px;padding:8px 12px;text-align:right">'
            + '<div style="font-size:9.5px;color:var(--accent);font-weight:700;letter-spacing:0.04em">VOLUME RATIO (30D)</div>'
            + '<div style="font-size:15px;font-weight:900;font-family:var(--font-mono);color:var(--accent);font-variant-numeric:tabular-nums">' + ratio30.toFixed(2) + 'x</div>'
          + '</div>'
        + '</div>'
      + '</div>'
    + '</div>'

    + '<div class="card" style="margin-bottom:14px;border-radius:12px;background:var(--bg2);border:1px solid var(--border)">'
      + '<div class="cheader" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">'
        + '<span class="ctitle" style="font-size:12.5px;display:flex;align-items:center;gap:6px"><i class="ti ti-chart-bar" style="color:var(--accent)"></i> 7 Hari Bursa Terakhir — Volume Transaksi</span>'
        + '<span style="font-size:10px;color:var(--text3)">Garis oranye = Median 30D</span>'
      + '</div>'
      + '<div style="height:200px;position:relative"><canvas id="vs-volume-chart"></canvas></div>'
    + '</div>'

    + '<div class="row3" style="margin-bottom:14px;display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px">'
      + [
          {
            tf: '1D',
            label: '1D PRICE CHANGE',
            val: chg1d,
            badge: 'Sesi Terakhir',
            pts: (function() {
              if (rows.length >= 2) {
                var p0 = rows[rows.length - 2];
                var p1 = rows[rows.length - 1];
                var lo = Math.min(p0.close, p1.low, p1.open, p1.close);
                var hi = Math.max(p0.close, p1.high, p1.open, p1.close);
                var isUpToday = p1.close >= p1.open;
                return [p0.close, p1.open, (isUpToday ? lo : hi), (isUpToday ? hi : lo), p1.close];
              }
              return closes.slice(-2);
            })()
          },
          {
            tf: '3D',
            label: '3D PRICE CHANGE',
            val: chg3d,
            badge: '3 Hari Bursa',
            pts: closes.slice(-4)
          },
          {
            tf: '7D',
            label: '7D PRICE CHANGE',
            val: chg7d,
            badge: '7 Hari Bursa',
            pts: closes.slice(-8)
          }
        ].map(function(item, idx) {
          var label = item.label, val = item.val;
          var up = val !== null && val >= 0;
          var gradId = 'vs-grad-' + item.tf.toLowerCase() + '-' + idx;
          return '<div class="card" style="margin:0;border-radius:12px;background:var(--bg2);border:1px solid var(--border);padding:14px 16px 10px;position:relative;overflow:hidden;display:flex;flex-direction:column;justify-content:space-between">'
            + '<div>'
              + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">'
                + '<span style="font-size:10px;color:var(--text3);font-weight:700;letter-spacing:0.05em;text-transform:uppercase">' + label + '</span>'
                + '<span style="font-size:9.5px;color:var(--text3);background:var(--bg3);border:1px solid var(--border);padding:1px 6px;border-radius:4px;font-family:var(--font-mono)">' + item.badge + '</span>'
              + '</div>'
              + '<div class="' + (val === null ? 'neu' : (up ? 'up' : 'dn')) + '" style="font-size:22px;font-weight:800;font-family:var(--font-mono);font-variant-numeric:tabular-nums;margin:2px 0 6px;letter-spacing:-0.5px">' + (val === null ? '—' : ((up ? '+' : '') + val.toFixed(2) + '%')) + '</div>'
            + '</div>'
            + vsSparklineHtml(item.pts, up, gradId)
          + '</div>';
        }).join('')
    + '</div>'

    + vsForeignFlowCardHtml(bs1d, bs30d);

  vsRenderBody(tk, html);
  vsRenderVolumeChart(last7, med30);
}

function vsForeignFlowCardHtml(bs1d, bs30d) {
  var simNote = function(d) {
    return (d && d.isSimulated) ? ' <span class="badge b-gray" style="font-size:8px">SIMULASI</span>' : (d ? ' <span class="badge b-up" style="font-size:8px">REAL</span>' : '');
  };
  var net1d = bs1d && bs1d.bandarmology && bs1d.bandarmology.foreignFlow ? bs1d.bandarmology.foreignFlow.netValRp : null;
  var net30d = bs30d && bs30d.bandarmology && bs30d.bandarmology.foreignFlow ? bs30d.bandarmology.foreignFlow.netValRp : null;
  var fmtNet = function(v) {
    if (v === null || v === undefined) return '—';
    var m = Math.round(v / 1e9);
    return (m >= 0 ? '+' : '') + m.toLocaleString('id-ID') + ' M';
  };
  var statusOf = function(v) { return (v === null || v === undefined) ? 'Data tidak tersedia' : (v >= 0 ? 'Net Buy' : 'Net Sell'); };

  var verdict = bs1d && bs1d.bandarmology ? bs1d.bandarmology.verdict : null;
  var verdictBadgeCls = verdict === 'BIG ACCUMULATION' || verdict === 'NORMAL ACCUMULATION' ? 'b-up'
    : verdict === 'BIG DISTRIBUTION' || verdict === 'NORMAL DISTRIBUTION' ? 'b-dn' : 'b-gray';
  var verdictHtml = verdict
    ? '<div style="margin-bottom:14px;padding-bottom:12px;border-bottom:1px solid var(--border2)">'
        + '<div class="flabel" style="font-size:10px;font-weight:700">VERDICT BANDARMOLOGY (BROKER SUMMARY)' + simNote(bs1d) + '</div>'
        + '<span class="badge ' + verdictBadgeCls + '" style="margin:6px 0 4px;display:inline-flex;align-items:center;gap:4px;padding:4px 10px;border-radius:6px;font-weight:700"><i class="ti ti-check"></i> ' + verdict + '</span>'
        + '<div style="font-size:11.5px;color:var(--text2);margin-top:4px">' + (bs1d.bandarmology.interpretation || '') + '</div>'
      + '</div>'
    : '';

  return '<div class="card" style="border-radius:12px;background:var(--bg2);border:1px solid var(--border)">'
    + verdictHtml
    + '<div class="fgrid" style="grid-template-columns:1fr 1fr;gap:14px">'
      + '<div class="fg" style="background:var(--bg3);border:1px solid var(--border);border-radius:8px;padding:12px">'
        + '<div class="flabel" style="font-size:10px;font-weight:700">FOREIGN NET FLOW (HARI INI)' + simNote(bs1d) + '</div>'
        + '<div class="' + (net1d === null ? 'neu' : (net1d >= 0 ? 'up' : 'dn')) + '" style="font-size:20px;font-weight:800;font-family:var(--font-mono);font-variant-numeric:tabular-nums;margin:4px 0 2px">Rp ' + fmtNet(net1d) + '</div>'
        + '<div style="font-size:11px;color:var(--text3)">' + statusOf(net1d) + '</div>'
      + '</div>'
      + '<div class="fg" style="background:var(--bg3);border:1px solid var(--border);border-radius:8px;padding:12px">'
        + '<div class="flabel" style="font-size:10px;font-weight:700">NET ASING AGREGAT 30 HARI' + simNote(bs30d) + '</div>'
        + '<div class="' + (net30d === null ? 'neu' : (net30d >= 0 ? 'up' : 'dn')) + '" style="font-size:20px;font-weight:800;font-family:var(--font-mono);font-variant-numeric:tabular-nums;margin:4px 0 2px">Rp ' + fmtNet(net30d) + '</div>'
        + '<div style="font-size:11px;color:var(--text3)">' + statusOf(net30d) + '</div>'
      + '</div>'
    + '</div>'
    + '<div style="font-size:9.5px;color:var(--text3);margin-top:12px;padding-top:10px;border-top:1px solid var(--border2);line-height:1.5">'
      + 'Angka 30 hari adalah agregat kumulatif dari broker summary historis.'
      + (bs1d && bs1d.isSimulated ? ' Data ditandai SIMULASI karena feed broker riil (Invezgo) tidak terkonfigurasi/tidak tersedia untuk sesi ini.' : '')
    + '</div>'
  + '</div>';
}

function vsRenderVolumeChart(last7, med30) {
  kc('vsVolume');
  var cv = el('vs-volume-chart');
  if (!cv || typeof Chart === 'undefined' || !last7.length) return;

  var labels = last7.map(function(r) { return new Date(r.date).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' }); });
  var vols = last7.map(function(r) { return r.volume; });
  var maxVol = Math.max.apply(null, vols);
  var barColors = vols.map(function(v, i) {
    return (i === vols.length - 1 && v === maxVol) ? 'rgba(163,230,53,.85)' : 'rgba(148,163,184,.55)';
  });

  charts['vsVolume'] = new Chart(cv, {
    type: 'bar',
    plugins: [{
      id: 'vsMedianLine',
      afterDatasetsDraw: function(chart) {
        if (!med30) return;
        var yScale = chart.scales.y, xScale = chart.scales.x;
        var y = yScale.getPixelForValue(med30);
        var ctx = chart.ctx;
        ctx.save();
        ctx.setLineDash([4, 3]);
        ctx.strokeStyle = 'rgba(245,158,11,0.85)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(xScale.left, y);
        ctx.lineTo(xScale.right, y);
        ctx.stroke();
        ctx.restore();
      }
    }],
    data: {
      labels: labels,
      datasets: [{
        data: vols,
        backgroundColor: barColors,
        borderRadius: 3,
        maxBarThickness: 48
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          displayColors: false,
          callbacks: {
            title: function() { return ''; },
            label: function(c) { return vsFmtVol(c.raw) + ' saham'; }
          }
        }
      },
      scales: {
        x: { grid: { display: false }, ticks: { color: _chartTextColor('--text2', '#D2D8DF'), font: { weight: 'bold', size: 10 } } },
        y: { grid: { color: GC }, ticks: { color: _chartTextColor('--text2', '#D2D8DF'), font: { weight: 'bold' }, callback: function(v) { return vsFmtVol(v); } } }
      }
    }
  });
}
