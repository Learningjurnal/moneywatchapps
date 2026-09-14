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

var VS_STATE = { ticker: null, loading: false };
var VS_SCREEN_STATE = {
  index: 'lq45',          // filter aktif: lq45 | idx30 | idx80 | kompas100
  rows: [],                // hasil scan [{code,name,todayVol,med14,med30,ratio14,ratio30,isSpike,chg1d}]
  scanning: false,
  scannedCount: 0,
  totalCount: 0,
  sortKey: 'ratio30',
  sortDir: 'desc',
  scanToken: 0             // dibatalkan kalau filter berganti di tengah scan
};
var VS_INDEX_LABELS = { lq45: 'LQ45', idx30: 'IDX30', idx80: 'IDX80', kompas100: 'Kompas100' };

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

function vsSparklineHtml(closes, isUp) {
  if (!closes || closes.length < 2) return '';
  var min = Math.min.apply(null, closes), max = Math.max.apply(null, closes);
  var range = (max - min) || 1;
  var w = 100, h = 30;
  var pts = closes.map(function(v, i) {
    var x = (i / (closes.length - 1)) * w;
    var y = h - ((v - min) / range) * h;
    return x.toFixed(1) + ',' + y.toFixed(1);
  }).join(' ');
  var color = isUp ? 'var(--green)' : 'var(--red)';
  return '<svg viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none" style="width:100%;height:36px;display:block">'
    + '<polyline points="' + pts + '" fill="none" stroke="' + color + '" stroke-width="1.5" vector-effect="non-scaling-stroke"/>'
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
    isSpike: ratio14 >= 1.5 || ratio30 >= 1.5,
    chg1d: pctChange(1), chg3d: pctChange(3), chg7d: pctChange(7),
    closes: closes
  };
}

function renderVolumeSpikePage(presetTicker) {
  var c = el('page-volume-spike');
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

  var firstRender = !el('vs-screen-table');
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
if (typeof window !== 'undefined' && window.GLOBAL_STOCK_CONTEXT) {
  window.GLOBAL_STOCK_CONTEXT.subscribe(function(tk, source) {
    if (source !== 'volume-spike' && tk && tk !== VS_STATE.ticker) {
      var pg = el('page-volume-spike');
      if (pg && pg.classList.contains('on')) {
        renderVolumeSpikePage(tk);
      } else {
        VS_STATE.ticker = tk;
      }
    }
  });
}

function vsRenderShell(tk) {
  var c = el('page-volume-spike');
  if (!c) return;
  c.innerHTML =
    '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:14px">'
      + '<div><div class="ptitle">Volume Spike Scanner</div><div class="psub">Screening lintas-saham + detail lonjakan volume &amp; arus dana per-saham.</div></div>'
    + '</div>'
    + '<div class="g2b">'
      + '<div id="vs-detail-col">'
        + '<div class="card" style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:14px">'
          + '<input id="vs-ticker-input" class="finput mono" style="max-width:160px;text-transform:uppercase" placeholder="Kode saham (mis. AKRA)" value="' + tk + '" onkeydown="if(event.key===\'Enter\')vsSearch()">'
          + '<button class="btn btn-blue btn-sm" onclick="vsSearch()">Analisa</button>'
        + '</div>'
        + '<div id="vs-body"><div class="card" style="text-align:center;padding:40px;color:var(--text3)">Memuat data volume &amp; arus dana untuk ' + tk + '...</div></div>'
      + '</div>'
      + '<div id="vs-screen-col">' + vsScreenPanelShellHtml() + '</div>'
    + '</div>';
}

function vsScreenPanelShellHtml() {
  var opts = Object.keys(VS_INDEX_LABELS).map(function(k) {
    return '<option value="' + k + '"' + (k === VS_SCREEN_STATE.index ? ' selected' : '') + '>' + VS_INDEX_LABELS[k] + '</option>';
  }).join('');
  return '<div class="card">'
    + '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:10px">'
      + '<div class="ctitle" style="font-size:14px">Screening Volume Spike</div>'
      + '<div style="display:flex;gap:6px;align-items:center">'
        + '<select class="finput fsel" id="vs-screen-index" style="font-size:11px;padding:4px 8px" onchange="vsStartScreening(this.value)">' + opts + '</select>'
        + '<button class="btn btn-ghost btn-xs" id="vs-screen-refresh" onclick="vsStartScreening(VS_SCREEN_STATE.index, true)" title="Pindai ulang">↻</button>'
      + '</div>'
    + '</div>'
    + '<div style="font-size:10px;color:var(--text3);margin-bottom:8px">Volume &amp; harga: Yahoo Finance (cache harian) — tidak memakai kuota Invezgo. Klik satu baris untuk dianalisis di panel kiri.</div>'
    + '<div id="vs-screen-progress" style="font-size:11px;color:var(--text3);margin-bottom:6px"></div>'
    + '<div style="overflow-x:auto"><table class="tbl" style="font-size:11px;width:100%">'
      + '<thead><tr>'
        + '<th style="cursor:pointer" onclick="vsSortScreen(\'code\')">Kode' + vsSortArrow('code') + '</th>'
        + '<th style="cursor:pointer;text-align:right" onclick="vsSortScreen(\'todayVol\')">Volume Hari Ini' + vsSortArrow('todayVol') + '</th>'
        + '<th style="cursor:pointer;text-align:right" onclick="vsSortScreen(\'med14\')">Median 14D' + vsSortArrow('med14') + '</th>'
        + '<th style="cursor:pointer;text-align:right" onclick="vsSortScreen(\'med30\')">Median 30D' + vsSortArrow('med30') + '</th>'
        + '<th style="cursor:pointer;text-align:right" onclick="vsSortScreen(\'ratio30\')">Rasio (30D)' + vsSortArrow('ratio30') + '</th>'
      + '</tr></thead>'
      + '<tbody id="vs-screen-tbody"><tr><td colspan="5" style="text-align:center;padding:24px;color:var(--text3)">Memindai...</td></tr></tbody>'
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

  fetch('/api/idx/stocks?index=' + encodeURIComponent(indexKey) + '&limit=150')
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

function vsScanNext(universe, i, myToken, forceRefresh) {
  if (myToken !== VS_SCREEN_STATE.scanToken) return; // filter sudah diganti, hentikan scan lama
  var progressEl = el('vs-screen-progress');
  if (i >= universe.length) {
    VS_SCREEN_STATE.scanning = false;
    if (progressEl) progressEl.textContent = VS_SCREEN_STATE.rows.length + ' dari ' + universe.length + ' saham berhasil dipindai (data historis kurang untuk sisanya).';
    return;
  }
  var item = universe[i];
  var tk = item.code;
  if (progressEl) progressEl.textContent = 'Memindai ' + (i + 1) + '/' + universe.length + ' — ' + tk + '...';

  var afterFetch = function() {
    VS_SCREEN_STATE.scannedCount++;
    var rows = (typeof rdGetAny === 'function') ? rdGetAny(tk) : null;
    if (rows && rows.length >= 15) {
      var stats = vsVolumeStats(rows);
      VS_SCREEN_STATE.rows.push({
        code: tk, name: item.name || (tk + ' Tbk.'),
        todayVol: stats.todayVol, med14: stats.med14, med30: stats.med30,
        ratio14: stats.ratio14, ratio30: stats.ratio30, isSpike: stats.isSpike, chg1d: stats.chg1d
      });
      vsRenderScreenTable();
    }
    setTimeout(function() { vsScanNext(universe, i + 1, myToken, forceRefresh); }, 350);
  };

  if (forceRefresh && typeof rdFetchYahoo === 'function') {
    rdFetchYahoo(tk, afterFetch);
  } else if (typeof rdEnsure === 'function') {
    rdEnsure(tk, afterFetch);
  } else {
    afterFetch();
  }
}

function vsSortedScreenRows() {
  var key = VS_SCREEN_STATE.sortKey, dir = VS_SCREEN_STATE.sortDir;
  var rows = VS_SCREEN_STATE.rows.slice();
  rows.sort(function(a, b) {
    var vA = a[key], vB = b[key];
    if (typeof vA === 'string') {
      return dir === 'asc' ? vA.localeCompare(vB) : vB.localeCompare(vA);
    }
    return dir === 'asc' ? (vA - vB) : (vB - vA);
  });
  return rows;
}

function vsRenderScreenTable() {
  var tbody = el('vs-screen-tbody');
  if (!tbody) return;
  var rows = vsSortedScreenRows();
  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:24px;color:var(--text3)">'
      + (VS_SCREEN_STATE.scanning ? 'Memindai...' : 'Belum ada hasil.') + '</td></tr>';
    return;
  }
  tbody.innerHTML = rows.map(function(r) {
    var isSel = r.code === VS_STATE.ticker;
    return '<tr data-code="' + r.code + '" style="cursor:pointer' + (isSel ? ';background:var(--bg2)' : '') + '" onclick="vsSelectFromScreen(\'' + r.code + '\')">'
      + '<td><div style="display:flex;align-items:center;gap:6px">'
        + (typeof getStockLogoHtml === 'function' ? getStockLogoHtml(r.code, 22) : '')
        + '<div><div style="font-weight:700">' + r.code + (r.isSpike ? ' <span class="badge" style="font-size:8px;background:rgba(245,158,11,.18);color:var(--amber)">SPIKE</span>' : '') + '</div>'
        + '<div style="font-size:9.5px;color:var(--text3);max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + r.name + '</div></div>'
      + '</div></td>'
      + '<td style="text-align:right;font-family:var(--font-mono)">' + vsFmtVol(r.todayVol) + '</td>'
      + '<td style="text-align:right;font-family:var(--font-mono);color:var(--text3)">' + vsFmtVol(r.med14) + '</td>'
      + '<td style="text-align:right;font-family:var(--font-mono);color:var(--text3)">' + vsFmtVol(r.med30) + '</td>'
      + '<td style="text-align:right;font-family:var(--font-mono);font-weight:700" class="' + (r.ratio30 >= 1.5 ? 'up' : 'neu') + '">' + r.ratio30.toFixed(2) + 'x</td>'
    + '</tr>';
  }).join('');
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

  var headline = isSpike
    ? '<div class="ctitle" style="font-size:16px;color:var(--amber)">⚡ VOLUME SPIKE TERDETEKSI</div>'
      + '<ul style="margin:8px 0 0;padding-left:18px;font-size:12px;color:var(--text2);line-height:1.7">'
        + (ratio14 >= 1.5 ? '<li>Volume transaksi hari ini <b>' + ratio14.toFixed(2) + 'x</b> median 14 hari</li>' : '')
        + (ratio30 >= 1.5 ? '<li>Volume transaksi hari ini <b>' + ratio30.toFixed(2) + 'x</b> median 30 hari</li>' : '')
      + '</ul>'
    : '<div class="ctitle" style="font-size:16px;color:var(--text2)">Tidak Ada Lonjakan Volume Signifikan</div>'
      + '<div style="font-size:12px;color:var(--text3);margin-top:4px">Volume hari ini ' + ratio14.toFixed(2) + 'x median 14D dan ' + ratio30.toFixed(2) + 'x median 30D — di bawah ambang lonjakan (1.5x).</div>';

  var html =
    '<div class="card" style="border:1px solid var(--amber);margin-bottom:14px">' + headline + '</div>'

    + '<div class="card" style="margin-bottom:14px">'
      + '<div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">'
        // FIX (2026-09-14, user-reported "logo karangan"): sebelumnya di sini
        // lingkaran warna + 3 huruf pertama ticker (dikarang, bukan logo
        // asli). Diganti getStockLogoHtml() (01-data.js) — logo perusahaan
        // REAL dari CDN publik Stockbit (assets.stockbit.com), sudah dipakai
        // & terverifikasi di Stock Intel (27-stockintel.js); fallback ke
        // monogram kalau logo 404, bukan diam-diam mengarang gambar.
        + (typeof getStockLogoHtml === 'function' ? getStockLogoHtml(tk, 40) : '')
        + '<div style="flex:1;min-width:120px"><div style="font-size:16px;font-weight:700">' + tk + '</div><div style="font-size:11px;color:var(--text3)">' + name + '</div></div>'
        + '<div><div style="font-size:10px;color:var(--text3)">TODAY\'S VOLUME</div><div class="up" style="font-size:16px;font-weight:700;font-family:var(--font-mono)">' + vsFmtVol(todayVol) + '</div></div>'
        + '<div><div style="font-size:10px;color:var(--text3)">14D MEDIAN</div><div style="font-size:16px;font-weight:700;font-family:var(--font-mono)">' + vsFmtVol(med14) + '</div></div>'
        + '<div><div style="font-size:10px;color:var(--text3)">30D MEDIAN</div><div style="font-size:16px;font-weight:700;font-family:var(--font-mono)">' + vsFmtVol(med30) + '</div></div>'
        + '<div><div style="font-size:10px;color:var(--text3)">VOLUME RATIO (30D)</div><div style="font-size:16px;font-weight:700;font-family:var(--font-mono);color:var(--accent)">' + ratio30.toFixed(2) + 'x</div></div>'
      + '</div>'
    + '</div>'

    + '<div class="card" style="margin-bottom:14px">'
      + '<div class="ctitle" style="font-size:12px;margin-bottom:10px">7 HARI BURSA TERAKHIR — VOLUME TRANSAKSI</div>'
      + '<div style="height:200px;position:relative"><canvas id="vs-volume-chart"></canvas></div>'
    + '</div>'

    + '<div class="row3" style="margin-bottom:14px">'
      + [['1D', chg1d], ['3D', chg3d], ['7D', chg7d]].map(function(pair) {
          var label = pair[0], val = pair[1];
          var up = val !== null && val >= 0;
          var sub = closes.slice(-8);
          return '<div class="card">'
            + '<div style="font-size:10px;color:var(--text3)">' + label + ' PRICE CHANGE</div>'
            + '<div class="' + (val === null ? 'neu' : (up ? 'up' : 'dn')) + '" style="font-size:18px;font-weight:700;margin:2px 0">' + (val === null ? '—' : ((up ? '+' : '') + val.toFixed(2) + '%')) + '</div>'
            + vsSparklineHtml(sub, up)
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
  var statusOf = function(v) { return v === null ? 'Data tidak tersedia' : (v >= 0 ? 'Net Buy' : 'Net Sell'); };

  // Verdict Bandarmology (akumulasi/distribusi broker) — data yang sama
  // sudah ikut terambil dari /api/idx/broker-summary di atas, sebelumnya
  // tidak ditampilkan sama sekali di halaman ini. Menyatukan verdict ini
  // ke Volume Spike berarti user tidak perlu lagi membuka halaman
  // Bandarmology terpisah hanya untuk melihat kesimpulan dasarnya.
  var verdict = bs1d && bs1d.bandarmology ? bs1d.bandarmology.verdict : null;
  var verdictBadgeCls = verdict === 'BIG ACCUMULATION' || verdict === 'NORMAL ACCUMULATION' ? 'b-up'
    : verdict === 'BIG DISTRIBUTION' || verdict === 'NORMAL DISTRIBUTION' ? 'b-dn' : 'b-gray';
  var verdictHtml = verdict
    ? '<div style="margin-bottom:12px;padding-bottom:12px;border-bottom:1px solid var(--border2)">'
        + '<div class="flabel">VERDICT BANDARMOLOGY (BROKER SUMMARY)' + simNote(bs1d) + '</div>'
        + '<span class="badge ' + verdictBadgeCls + '" style="margin:4px 0;display:inline-block">' + verdict + '</span>'
        + '<div style="font-size:11px;color:var(--text2);margin-top:4px">' + (bs1d.bandarmology.interpretation || '') + '</div>'
      + '</div>'
    : '';

  return '<div class="card">'
    + verdictHtml
    + '<div class="fgrid" style="grid-template-columns:1fr 1fr">'
      + '<div class="fg">'
        + '<div class="flabel">FOREIGN NET BUY/SELL (HARI INI)' + simNote(bs1d) + '</div>'
        + '<div class="' + (net1d === null ? 'neu' : (net1d >= 0 ? 'up' : 'dn')) + '" style="font-size:20px;font-weight:700;font-family:var(--font-mono)">Rp ' + fmtNet(net1d) + '</div>'
        + '<div style="font-size:11px;color:var(--text3)">' + statusOf(net1d) + '</div>'
      + '</div>'
      + '<div class="fg">'
        + '<div class="flabel">NET ASING AGREGAT 30 HARI' + simNote(bs30d) + '</div>'
        + '<div class="' + (net30d === null ? 'neu' : (net30d >= 0 ? 'up' : 'dn')) + '" style="font-size:20px;font-weight:700;font-family:var(--font-mono)">Rp ' + fmtNet(net30d) + '</div>'
        + '<div style="font-size:11px;color:var(--text3)">' + statusOf(net30d) + '</div>'
      + '</div>'
    + '</div>'
    + '<div style="font-size:9.5px;color:var(--text3);margin-top:10px;padding-top:10px;border-top:1px solid var(--border2);line-height:1.5">'
      + 'Angka 30 hari adalah SATU agregat (bukan breakdown per-hari) — menghitung "N hari Buy / M hari Sell" butuh broker summary terpisah untuk tiap hari, yang akan memboroskan kuota API Invezgo hanya untuk membuka laporan ini.'
      + (bs1d && bs1d.isSimulated ? ' Data ditandai SIMULASI karena feed broker riil (Invezgo) tidak terkonfigurasi/tidak tersedia untuk sesi ini — BUKAN transaksi broker sungguhan.' : '')
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
        ctx.strokeStyle = 'rgba(96,165,250,.7)';
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
