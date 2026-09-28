/**
 * 51-market-report.js — MoneyWatch Pro: Laporan Kondisi Market (PDF)
 *
 * Menggabungkan data REAL dari fitur yang sudah ada di aplikasi jadi 1
 * dokumen yang bisa diunduh, tersedia dalam 3 periode (Harian/Mingguan/
 * Bulanan). Bukan laporan portofolio pribadi (itu sudah ada di
 * 32-pdf-reports.js) — ini murni kondisi pasar.
 *
 * Sumber data per section (semua real, tidak ada angka karangan):
 * 1. IHSG & Market Regime — GET /api/idx/regime (classifyMarketRegime(),
 *    lib/idx-data-engine.js) + GET /api/idx/history/%5EJKSE?tf=DAILY_MAX
 *    untuk hitung perubahan mingguan/bulanan (regime sendiri hanya expose
 *    perubahan 1 hari).
 * 2. Rotasi Sektor — siComputeAllSectors(timeframe) (44-sectoral-insight.js)
 *    dipanggil LANGSUNG dengan timeframe sesuai periode laporan — BUKAN
 *    lewat siGetSectorHeatmapData() yang hardcode '1D'.
 * 3. Radar Akumulasi/Distribusi Pasar — GET /api/idx/accumulation-distribution
 *    (getUniverseAccumulationDistribution(), whole-BEI via Invezgo). Ini
 *    snapshot EOD 1 hari — Invezgo tidak punya agregasi mingguan/bulanan
 *    untuk endpoint ini, jadi sama untuk ketiga periode, dilabeli jujur.
 * 4. Konsensus Screener — GET /api/idx/screener-consensus?minAgree=3
 *    (generateScreenerConsensus()) — rekomendasi "saat ini", sama untuk
 *    ketiga periode.
 * 5. Ringkasan Bellwether 20 Saham — GET /api/idx/summary
 *    (getIdxMarketSummary()) — WAJIB dilabeli sampel 20 saham, bukan
 *    breadth ~958 emiten BEI penuh (lihat marketBreadth.sampleNote).
 *
 * Sengaja TIDAK dimasukkan: Foreign Flow (widget-nya sudah dicabut
 * 2026-09-26 karena data menyesatkan, tidak ada route client-reachable
 * lagi), Volume Spike whole-universe scan (menit-an, tidak cocok untuk
 * generate laporan instan), data portofolio pribadi (sudah di Laporan
 * Konsolidasi).
 *
 * Pola PDF-generation (html2pdf) meniru persis downloadPdfReport()/
 * printPdfReport()/mwOpenPdfReportModal() di 32-pdf-reports.js.
 */

var MW_MARKET_REPORT_STATE = {
  period: 'harian', // 'harian' | 'mingguan' | 'bulanan'
  data: {},          // cache per periode: { harian: {...}, mingguan: {...}, bulanan: {...} }
  isLoading: false
};

var MW_MARKET_REPORT_PERIOD_LABEL = { harian: 'Harian', mingguan: 'Mingguan', bulanan: 'Bulanan' };
var MW_MARKET_REPORT_PERIOD_TF = { harian: '1D', mingguan: '1W', bulanan: '1M' };
// Offset hari BURSA (bukan kalender) — 5 hari bursa ≈ 1 minggu, 21 hari
// bursa ≈ 1 bulan. Dipakai untuk mengambil titik referensi dari deret
// harga harian IHSG yang sudah pasti hanya berisi hari bursa (Yahoo tidak
// menyertakan weekend/libur), jadi ini akurat tanpa perlu tabel kalender
// bursa terpisah.
var MW_MARKET_REPORT_PERIOD_OFFSET = { harian: 1, mingguan: 5, bulanan: 21 };

// ────────────────────────────────────────────────────────────────
// DATA LOADER
// ────────────────────────────────────────────────────────────────

async function mwLoadMarketReportData(period, force) {
  if (!force && MW_MARKET_REPORT_STATE.data[period]) return MW_MARKET_REPORT_STATE.data[period];

  var tf = MW_MARKET_REPORT_PERIOD_TF[period] || '1D';

  var results = await Promise.allSettled([
    fetch('/api/idx/regime').then(function(r) { return r.json(); }),
    fetch('/api/idx/history/%5EJKSE?tf=DAILY_MAX').then(function(r) { return r.json(); }),
    fetch('/api/idx/accumulation-distribution').then(function(r) { return r.json(); }),
    fetch('/api/idx/screener-consensus?minAgree=3').then(function(r) { return r.json(); }),
    fetch('/api/idx/summary').then(function(r) { return r.json(); })
  ]);

  // GET /api/idx/regime membungkus hasilnya sebagai { success, regime:
  // {...classifyMarketRegime()...} } — bukan objek datar — jadi harus
  // di-unwrap 1 level di sini, beda dari 4 endpoint lain di bawah yang
  // men-spread field-nya langsung ke root response.
  var regime = (results[0].status === 'fulfilled' && results[0].value) ? results[0].value.regime : null;
  var history = results[1].status === 'fulfilled' ? results[1].value : null;
  var accDist = results[2].status === 'fulfilled' ? results[2].value : null;
  var consensus = results[3].status === 'fulfilled' ? results[3].value : null;
  var summary = results[4].status === 'fulfilled' ? results[4].value : null;

  // Rotasi Sektor: sinkron, client-side, tidak perlu fetch — panggil
  // langsung dengan timeframe sesuai periode (lihat header comment file
  // ini untuk kenapa BUKAN lewat siGetSectorHeatmapData()).
  var sectors = null;
  try {
    if (typeof siComputeAllSectors === 'function') {
      sectors = siComputeAllSectors(tf);
    }
  } catch (e) {
    sectors = null;
  }

  var periodChange = null;
  if (history && Array.isArray(history.points) && history.points.length > 1) {
    var pts = history.points;
    var last = pts[pts.length - 1];
    var offset = MW_MARKET_REPORT_PERIOD_OFFSET[period] || 1;
    var refIdx = Math.max(0, pts.length - 1 - offset);
    var ref = pts[refIdx];
    if (ref && ref.c > 0 && last && last.c > 0) {
      periodChange = {
        fromDate: ref.date,
        toDate: last.date,
        fromClose: ref.c,
        toClose: last.c,
        changePct: Math.round(((last.c - ref.c) / ref.c) * 10000) / 100
      };
    }
  }

  var result = {
    period: period,
    generatedAt: new Date().toISOString(),
    regime: regime,
    periodChange: periodChange,
    sectors: sectors,
    accDist: accDist,
    consensus: consensus,
    summary: summary
  };

  MW_MARKET_REPORT_STATE.data[period] = result;
  return result;
}

// ────────────────────────────────────────────────────────────────
// HTML SECTION BUILDERS (semua sync — dipanggil setelah data ter-cache)
// ────────────────────────────────────────────────────────────────

var MR_REGIME_LABEL = {
  BULL_TREND: 'Bull Trend', BEAR_TREND: 'Bear Trend', SIDEWAYS: 'Sideways / Konsolidasi',
  HIGH_VOLATILITY: 'Volatilitas Tinggi', RISK_OFF: 'Risk-Off', UNKNOWN: 'Belum Dapat Diklasifikasi'
};
var MR_REGIME_COLOR = {
  BULL_TREND: '#047857', BEAR_TREND: '#b91c1c', SIDEWAYS: '#64748b',
  HIGH_VOLATILITY: '#b45309', RISK_OFF: '#b91c1c', UNKNOWN: '#64748b'
};

function mrSectionTitle(num, title, rightNote) {
  return '<div style="font-size:11px;font-weight:700;color:#0f172a;margin-bottom:6px;display:flex;justify-content:space-between;align-items:center">'
    + '<span>' + num + '. ' + title + '</span>'
    + (rightNote ? '<span style="font-size:9.5px;color:#64748b;font-weight:500">' + rightNote + '</span>' : '')
    + '</div>';
}

function mrEmptyRow(colspan, msg) {
  return '<tr><td colspan="' + colspan + '" style="text-align:center;padding:14px;color:#64748b;font-size:9.5px">' + msg + '</td></tr>';
}

function buildRegimeSection(regime, periodChange, period) {
  var hasRegime = !!(regime && regime.regime && regime.regime !== 'UNKNOWN');
  var label = hasRegime ? (MR_REGIME_LABEL[regime.regime] || regime.regime) : 'Data Tidak Tersedia';
  var color = hasRegime ? (MR_REGIME_COLOR[regime.regime] || '#64748b') : '#64748b';
  var ihsgVal = (regime && regime.ihsg > 0) ? regime.ihsg.toLocaleString('id-ID') : 'Data Tidak Tersedia';
  var chg1d = (regime && regime.ihsgChangePct != null) ? regime.ihsgChangePct : null;

  var periodRow = '';
  if (period !== 'harian') {
    var periodLbl = period === 'bulanan' ? 'Bulanan (≈21 Hari Bursa)' : 'Mingguan (≈5 Hari Bursa)';
    if (periodChange) {
      var pc = periodChange.changePct;
      periodRow = '<div style="font-size:9.5px;color:#cbd5e1;margin-top:3px">Perubahan ' + periodLbl + ': '
        + '<b style="color:' + (pc >= 0 ? '#4ade80' : '#f87171') + '">' + (pc >= 0 ? '+' : '') + pc.toFixed(2) + '%</b>'
        + ' (' + periodChange.fromDate + ' &rarr; ' + periodChange.toDate + ')</div>';
    } else {
      periodRow = '<div style="font-size:9.5px;color:#cbd5e1;margin-top:3px">Perubahan ' + periodLbl + ': Data historis tidak tersedia.</div>';
    }
  }

  return '<div style="margin-bottom:16px">'
    + mrSectionTitle(1, 'KONDISI IHSG &amp; MARKET REGIME', regime ? ('Diperbarui ' + _mwPdfDateTime(regime.computedAt)) : '')
    + '<div style="background:#0f172a;color:#fff;border-radius:8px;padding:16px 20px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px">'
    + '  <div>'
    + '    <div style="font-size:9.5px;font-weight:700;color:#94a3b8;letter-spacing:0.8px;text-transform:uppercase">IHSG</div>'
    + '    <div style="font-size:22px;font-weight:900;font-family:monospace;color:#38bdf8;margin-top:2px">' + ihsgVal + '</div>'
    + '    <div style="font-size:10px;color:#cbd5e1;margin-top:2px">'
    + (chg1d != null ? ('Perubahan Harian: <b style="color:' + (chg1d >= 0 ? '#4ade80' : '#f87171') + '">' + (chg1d >= 0 ? '+' : '') + chg1d.toFixed(2) + '%</b>') : 'Perubahan Harian: Data Tidak Tersedia')
    + '</div>'
    + '    ' + periodRow
    + '  </div>'
    + '  <div style="text-align:right;border-left:1px solid #334155;padding-left:16px">'
    + '    <div style="font-size:9px;color:#94a3b8;text-transform:uppercase">Market Regime</div>'
    + '    <div style="font-size:14px;font-weight:800;margin-top:2px;color:' + (hasRegime ? '#38bdf8' : '#94a3b8') + '">' + label + '</div>'
    + (hasRegime && regime.confidence != null ? '<div style="font-size:8.5px;color:#94a3b8">Keyakinan: ' + regime.confidence + '%</div>' : '')
    + '  </div>'
    + '</div>'
    + (regime && regime.description ? '<div style="font-size:9.5px;color:#475569;margin-top:6px;font-style:italic">' + regime.description + '</div>' : '')
    + '</div>';
}

function buildSectorSection(sectors, period) {
  var tfLabel = period === 'bulanan' ? '1 Bulan (20 Hari Bursa)' : (period === 'mingguan' ? '1 Minggu (5 Hari Bursa)' : 'Hari Ini');
  var body;

  if (!Array.isArray(sectors) || !sectors.length) {
    body = '<div style="padding:14px;text-align:center;color:#64748b;font-size:9.5px;border:1px solid #cbd5e1;border-radius:6px">Data rotasi sektor tidak tersedia.</div>';
  } else {
    var sorted = sectors.slice().sort(function(a, b) { return (b.cmf || 0) - (a.cmf || 0); });
    // Filter dulu ke tanda yang benar-benar sesuai kolomnya sebelum slice —
    // kalau cuma diambil top-3/bottom-3 dari urutan tanpa filter, sektor
    // dengan CMF negatif bisa ikut terisi di kolom "AKUMULASI" hanya karena
    // peringkatnya ke-3 tertinggi (bukan berarti benar-benar akumulasi).
    var topAcc = sorted.filter(function(s) { return (s.cmf || 0) > 0; }).slice(0, 3);
    var topDist = sorted.filter(function(s) { return (s.cmf || 0) < 0; }).slice(-3).reverse();

    var rowsHtml = function(list) {
      if (!list.length) return mrEmptyRow(4, 'Tidak ada sektor pada kategori ini.');
      return list.map(function(s) {
        var cmfPct = ((s.cmf || 0) * 100).toFixed(1) + '%';
        var color = s.cmf >= 0 ? '#047857' : '#b91c1c';
        var covNote = (s.totalCount > 0) ? (s.realCount + '/' + s.totalCount + ' saham real') : '';
        return '<tr style="border-bottom:1px solid #e2e8f0">'
          + '<td style="padding:5px 8px;font-weight:700">' + (s.labelId || s.name) + '</td>'
          + '<td style="padding:5px 8px;text-align:right;font-family:monospace;font-weight:700;color:' + color + '">' + (s.cmf >= 0 ? '+' : '') + cmfPct + '</td>'
          + '<td style="padding:5px 8px;color:#64748b;font-size:9px">' + (s.flowScoreLabel || '-') + '</td>'
          + '<td style="padding:5px 8px;text-align:right;color:#94a3b8;font-size:8.5px">' + covNote + '</td>'
          + '</tr>';
      }).join('');
    };

    body = '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">'
      + '<div>'
      + '  <div style="font-size:9.5px;font-weight:700;color:#047857;margin-bottom:4px">TOP 3 AKUMULASI (CMF Tertinggi)</div>'
      + '  <table style="width:100%;border-collapse:collapse;font-size:9.5px;border:1px solid #cbd5e1">'
      + '    <tbody>' + rowsHtml(topAcc) + '</tbody>'
      + '  </table>'
      + '</div>'
      + '<div>'
      + '  <div style="font-size:9.5px;font-weight:700;color:#b91c1c;margin-bottom:4px">TOP 3 DISTRIBUSI (CMF Terendah)</div>'
      + '  <table style="width:100%;border-collapse:collapse;font-size:9.5px;border:1px solid #cbd5e1">'
      + '    <tbody>' + rowsHtml(topDist) + '</tbody>'
      + '  </table>'
      + '</div>'
      + '</div>';
  }

  return '<div style="margin-bottom:16px">'
    + mrSectionTitle(2, 'ROTASI SEKTOR (CHAIKIN MONEY FLOW)', 'Lookback: ' + tfLabel)
    + body
    + '</div>';
}

function buildAccDistSection(accDist) {
  var isUnavailable = !accDist || accDist.isSimulated === true || (!Array.isArray(accDist.accumulation) && !Array.isArray(accDist.distribution));
  var body;

  if (isUnavailable) {
    body = '<div style="padding:14px;text-align:center;color:#b45309;background:#fffbeb;border:1px solid #fde68a;border-radius:6px;font-size:9.5px">'
      + '⚠ Data tidak tersedia — feed Invezgo belum dikonfigurasi (INVEZGO_API_KEY) atau sedang tidak dapat diakses. Section ini TIDAK diisi angka perkiraan.'
      + '</div>';
  } else {
    var acc = (accDist.accumulation || []).slice(0, 5);
    var dist = (accDist.distribution || []).slice(0, 5);
    var rowsHtml = function(list, isAcc) {
      if (!list.length) return mrEmptyRow(3, 'Tidak ada data untuk kategori ini hari ini.');
      return list.map(function(s) {
        var color = isAcc ? '#047857' : '#b91c1c';
        var chg = (s.priceChangePct != null) ? ((s.priceChangePct >= 0 ? '+' : '') + s.priceChangePct.toFixed(2) + '%') : '-';
        return '<tr style="border-bottom:1px solid #e2e8f0">'
          + '<td style="padding:5px 8px;font-weight:700;font-family:monospace">' + s.ticker + '</td>'
          + '<td style="padding:5px 8px;color:#64748b;font-size:9px;max-width:110px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + (s.name || s.ticker) + '</td>'
          + '<td style="padding:5px 8px;text-align:right;font-family:monospace;font-weight:700;color:' + color + '">' + chg + '</td>'
          + '</tr>';
      }).join('');
    };

    body = '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">'
      + '<div>'
      + '  <div style="font-size:9.5px;font-weight:700;color:#047857;margin-bottom:4px">TOP 5 AKUMULASI</div>'
      + '  <table style="width:100%;border-collapse:collapse;font-size:9.5px;border:1px solid #cbd5e1"><tbody>' + rowsHtml(acc, true) + '</tbody></table>'
      + '</div>'
      + '<div>'
      + '  <div style="font-size:9.5px;font-weight:700;color:#b91c1c;margin-bottom:4px">TOP 5 DISTRIBUSI</div>'
      + '  <table style="width:100%;border-collapse:collapse;font-size:9.5px;border:1px solid #cbd5e1"><tbody>' + rowsHtml(dist, false) + '</tbody></table>'
      + '</div>'
      + '</div>';
  }

  return '<div style="margin-bottom:16px">'
    + mrSectionTitle(3, 'RADAR AKUMULASI &amp; DISTRIBUSI PASAR (SELURUH BEI)', 'Snapshot EOD terbaru' + (accDist && accDist.date ? (' — ' + accDist.date) : ''))
    + body
    + '<div style="font-size:8.5px;color:#94a3b8;margin-top:4px;font-style:italic">Data Invezgo bersifat snapshot EOD 1 hari — belum ada agregasi mingguan/bulanan dari provider, sehingga section ini sama untuk ketiga periode laporan.</div>'
    + '</div>';
}

function buildConsensusSection(consensus) {
  var body;
  var rows = (consensus && Array.isArray(consensus.results)) ? consensus.results.slice(0, 8) : [];

  if (!rows.length) {
    body = '<div style="padding:14px;text-align:center;color:#64748b;font-size:9.5px;border:1px solid #cbd5e1;border-radius:6px">Belum ada saham yang disepakati minimal ' + (consensus ? consensus.minAgree : 3) + ' dari 5 sistem screening hari ini.</div>';
  } else {
    body = '<table style="width:100%;border-collapse:collapse;font-size:9.5px;border:1px solid #cbd5e1">'
      + '<thead><tr style="background:#f1f5f9;border-bottom:2px solid #cbd5e1;color:#334155">'
      + '<th style="padding:5px 8px;text-align:left">TICKER</th><th style="padding:5px 8px;text-align:left">SEKTOR</th>'
      + '<th style="padding:5px 8px;text-align:right">CHG 1D</th><th style="padding:5px 8px;text-align:center">SETUJU</th>'
      + '<th style="padding:5px 8px;text-align:left">SISTEM YANG SEPAKAT</th>'
      + '</tr></thead><tbody>'
      + rows.map(function(r) {
        var chg = (r.chg1d != null) ? ((r.chg1d >= 0 ? '+' : '') + r.chg1d.toFixed(2) + '%') : '-';
        return '<tr style="border-bottom:1px solid #e2e8f0">'
          + '<td style="padding:5px 8px;font-weight:700;font-family:monospace">' + r.ticker + '</td>'
          + '<td style="padding:5px 8px;color:#64748b;font-size:9px">' + (r.sector || '-') + '</td>'
          + '<td style="padding:5px 8px;text-align:right;font-family:monospace;color:' + (r.chg1d >= 0 ? '#047857' : '#b91c1c') + '">' + chg + '</td>'
          + '<td style="padding:5px 8px;text-align:center;font-weight:700">' + r.agreeCount + '/' + (consensus.totalSystems || 5) + '</td>'
          + '<td style="padding:5px 8px;color:#475569;font-size:8.5px">' + (r.agreeSystems || []).join(', ') + '</td>'
          + '</tr>';
      }).join('')
      + '</tbody></table>';
  }

  return '<div style="margin-bottom:16px">'
    + mrSectionTitle(4, 'KONSENSUS SCREENER (REKOMENDASI TERSAAT)', consensus ? ('Diperiksa: ' + (consensus.universeScanned || 0) + ' emiten') : '')
    + body
    + '<div style="font-size:8.5px;color:#94a3b8;margin-top:4px;font-style:italic">Saham yang disetujui minimal 3 dari 5 sistem screening independen (Unified Screener, Strategy Engine, Opportunity Radar, Volume Spike, Quant Screener) — bukan rekomendasi/nasihat investasi resmi.</div>'
    + '</div>';
}

function buildBellwetherSection(summary) {
  var mb = summary && summary.marketBreadth;
  var body;

  if (!mb) {
    body = '<div style="padding:14px;text-align:center;color:#64748b;font-size:9.5px;border:1px solid #cbd5e1;border-radius:6px">Data ringkasan bellwether tidak tersedia.</div>';
  } else {
    var gainers = (summary.topGainers || []).slice(0, 3);
    var losers = (summary.topLosers || []).slice(0, 3);
    var moverRow = function(q) {
      var chg = (q.changePercent != null) ? ((q.changePercent >= 0 ? '+' : '') + q.changePercent.toFixed(2) + '%') : '-';
      return '<div style="display:flex;justify-content:space-between;padding:3px 0;border-bottom:1px solid #f1f5f9">'
        + '<span style="font-weight:700;font-family:monospace">' + q.code + '</span>'
        + '<span style="font-family:monospace;font-weight:700;color:' + (q.changePercent >= 0 ? '#047857' : '#b91c1c') + '">' + chg + '</span>'
        + '</div>';
    };

    body = '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px">'
      + '<div style="background:#f8fafc;border:1px solid #cbd5e1;border-radius:6px;padding:10px">'
      + '  <div style="font-size:9px;color:#64748b;text-transform:uppercase;font-weight:700">Advancing / Declining</div>'
      + '  <div style="font-size:15px;font-weight:800;font-family:monospace;margin-top:2px"><span style="color:#047857">' + mb.advancing + '</span> / <span style="color:#b91c1c">' + mb.declining + '</span></div>'
      + '  <div style="font-size:8.5px;color:#94a3b8">dari ' + mb.sampleSize + ' saham sampel</div>'
      + '</div>'
      + '<div>'
      + '  <div style="font-size:9.5px;font-weight:700;color:#047857;margin-bottom:3px">Top Gainers (Sampel)</div>'
      + (gainers.length ? gainers.map(moverRow).join('') : '<div style="font-size:9px;color:#94a3b8">-</div>')
      + '</div>'
      + '<div>'
      + '  <div style="font-size:9.5px;font-weight:700;color:#b91c1c;margin-bottom:3px">Top Losers (Sampel)</div>'
      + (losers.length ? losers.map(moverRow).join('') : '<div style="font-size:9px;color:#94a3b8">-</div>')
      + '</div>'
      + '</div>';
  }

  return '<div style="margin-bottom:16px">'
    + mrSectionTitle(5, 'RINGKASAN 20 SAHAM BELLWETHER', '')
    + body
    + '<div style="font-size:8.5px;color:#b45309;margin-top:4px;font-weight:600">'
    + (mb ? mb.sampleNote : 'Sampel 20 saham unggulan (bellwether), BUKAN representasi penuh ~958 emiten BEI — belum ada feed breadth whole-market real-time yang terintegrasi.')
    + '</div>'
    + '</div>';
}

function buildMarketReportHtml(period) {
  var d = MW_MARKET_REPORT_STATE.data[period];
  if (!d) {
    return '<div id="market-report-document" style="width:100%;max-width:880px;margin:0 auto;background:#ffffff;color:#64748b;font-family:\'Inter\',system-ui,sans-serif;padding:60px 32px;text-align:center;font-size:12px">⏳ Memuat data laporan kondisi market...</div>';
  }

  var periodLabel = MW_MARKET_REPORT_PERIOD_LABEL[period] || 'Harian';

  return '<div id="market-report-document" style="width:100%;max-width:880px;margin:0 auto;background:#ffffff;color:#0f172a;font-family:\'Inter\',system-ui,sans-serif;padding:32px;box-sizing:border-box;line-height:1.45;font-size:10.5px">'
    // ── HEADER ──
    + '<div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #0f172a;padding-bottom:14px;margin-bottom:16px">'
    + '  <div>'
    + '    <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">'
    + '      <div style="width:26px;height:26px;background:#0f172a;border-radius:5px;display:flex;align-items:center;justify-content:center;color:#38bdf8;font-weight:800;font-size:14px">MW</div>'
    + '      <div style="font-size:17px;font-weight:800;letter-spacing:-0.3px;color:#0f172a">MONEY WATCH <span style="color:#2563eb">PRO</span></div>'
    + '    </div>'
    + '    <div style="font-size:13px;font-weight:800;color:#0f172a;text-transform:uppercase;letter-spacing:0.5px">Laporan Kondisi Pasar — ' + periodLabel + '</div>'
    + '    <div style="font-size:9.5px;color:#64748b;margin-top:2px">Ringkasan Bursa Efek Indonesia (BEI): IHSG &amp; Regime, Rotasi Sektor, Radar Akumulasi/Distribusi, Konsensus Screener · ' + _mwPdfDateTime(d.generatedAt) + '</div>'
    + '  </div>'
    + '  <div style="text-align:right">'
    + '    <div style="font-size:9.5px;color:#64748b">Periode Laporan</div>'
    + '    <div style="font-size:13px;font-weight:800;color:#0f172a">' + periodLabel + '</div>'
    + '  </div>'
    + '</div>'

    + buildRegimeSection(d.regime, d.periodChange, period)
    + buildSectorSection(d.sectors, period)
    + buildAccDistSection(d.accDist)
    + buildConsensusSection(d.consensus)
    + buildBellwetherSection(d.summary)

    // ── FOOTER & DISCLAIMER ──
    + '<div style="margin-top:20px;border-top:1px solid #cbd5e1;padding-top:10px;font-size:9px;color:#64748b">'
    + '  <div style="margin-bottom:4px"><b>Disclaimer:</b> Laporan ini disusun dari data real yang tersedia saat dokumen dibuat dan BUKAN nasihat/rekomendasi investasi resmi. Section yang datanya tidak tersedia ditampilkan jujur (tidak diisi angka perkiraan). Setiap sampel/snapshot dilabeli sesuai cakupannya.</div>'
    + '  <div style="display:flex;justify-content:space-between;align-items:center">'
    + '    <div>Laporan Kondisi Pasar Money Watch · Data: Yahoo Finance (IHSG/Regime/Sektor), Invezgo (Akumulasi/Distribusi)</div>'
    + '    <div>ID: MW-MKT-' + Date.now().toString().slice(-6) + '</div>'
    + '  </div>'
    + '</div>'
    + '</div>';
}

// ────────────────────────────────────────────────────────────────
// MODAL, PERIOD SWITCH, PDF/PRINT (pola meniru 32-pdf-reports.js)
// ────────────────────────────────────────────────────────────────

async function mwOpenMarketReportModal() {
  var modal = document.getElementById('market-report-modal');
  if (!modal) {
    _createMarketReportModalDom();
    modal = document.getElementById('market-report-modal');
  }
  if (modal) modal.style.display = 'flex';
  await _mwRenderMarketReportPreview(MW_MARKET_REPORT_STATE.period);
}

function mwCloseMarketReportModal() {
  var modal = document.getElementById('market-report-modal');
  if (modal) modal.style.display = 'none';
}

async function mwSetMarketReportPeriod(period) {
  MW_MARKET_REPORT_STATE.period = period;
  document.querySelectorAll('.mr-period-tab').forEach(function(btn) {
    btn.classList.toggle('btn-primary', btn.getAttribute('data-period') === period);
    btn.classList.toggle('btn-ghost', btn.getAttribute('data-period') !== period);
  });
  await _mwRenderMarketReportPreview(period);
}

async function _mwRenderMarketReportPreview(period) {
  var previewBox = document.getElementById('market-report-preview-area');
  if (!previewBox) return;

  if (!MW_MARKET_REPORT_STATE.data[period]) {
    previewBox.innerHTML = buildMarketReportHtml(period); // loading placeholder
    try {
      await mwLoadMarketReportData(period);
    } catch (e) {
      previewBox.innerHTML = '<div style="padding:40px;text-align:center;color:#b91c1c">Gagal memuat data laporan: ' + (e && e.message ? e.message : 'error') + '</div>';
      return;
    }
  }
  previewBox.innerHTML = buildMarketReportHtml(period);
}

function _createMarketReportModalDom() {
  var el = document.createElement('div');
  el.id = 'market-report-modal';
  el.style.display = 'none';
  el.style.position = 'fixed';
  el.style.inset = '0';
  el.style.background = 'rgba(0,0,0,0.75)';
  el.style.zIndex = '1100';
  el.style.alignItems = 'center';
  el.style.justifyContent = 'center';
  el.style.backdropFilter = 'blur(6px)';

  var periodTabsHtml = ['harian', 'mingguan', 'bulanan'].map(function(p) {
    var isActive = p === MW_MARKET_REPORT_STATE.period;
    return '<button class="mr-period-tab btn btn-xs ' + (isActive ? 'btn-primary' : 'btn-ghost') + '" data-period="' + p + '" onclick="mwSetMarketReportPeriod(\'' + p + '\')" style="font-size:11px;font-weight:700;padding:4px 12px">' + MW_MARKET_REPORT_PERIOD_LABEL[p] + '</button>';
  }).join('');

  el.innerHTML = '<div style="background:var(--bg2);border:1px solid var(--border2);border-radius:14px;width:960px;max-width:96vw;max-height:92vh;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 24px 70px rgba(0,0,0,0.6)">'
    // Modal Header
    + '<div style="padding:16px 20px;border-bottom:1px solid var(--border2);display:flex;justify-content:space-between;align-items:center;background:var(--bg3)">'
    + '  <div>'
    + '    <div style="font-size:15px;font-weight:700;color:var(--text);display:flex;align-items:center;gap:8px">'
    + '      <span>📈 Laporan Kondisi Pasar</span>'
    + '      <span class="badge b-up" style="font-size:9.5px">Data Real BEI</span>'
    + '    </div>'
    + '    <div style="font-size:11px;color:var(--text3);margin-top:2px">IHSG &amp; Regime, Rotasi Sektor, Radar Akumulasi/Distribusi, Konsensus Screener, Ringkasan Bellwether</div>'
    + '  </div>'
    + '  <button onclick="mwCloseMarketReportModal()" aria-label="Tutup dialog" style="background:none;border:none;color:var(--text3);font-size:20px;cursor:pointer;line-height:1;padding:4px">✕</button>'
    + '</div>'

    // Toolbar: period tabs + export
    + '<div style="padding:10px 20px;border-bottom:1px solid var(--border2);display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;background:var(--bg3)">'
    + '  <div style="display:inline-flex;background:var(--bg2);padding:3px;border-radius:8px;border:1px solid var(--border2);gap:4px">' + periodTabsHtml + '</div>'
    + '  <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">'
    + '    <button class="btn btn-blue btn-xs" onclick="downloadMarketReportPdf()" title="Unduh Laporan Kondisi Pasar sebagai PDF" style="font-size:11px;gap:5px;font-weight:700">📥 Unduh PDF</button>'
    + '    <button class="btn btn-ghost btn-xs" onclick="printMarketReportPdf()" title="Cetak Laporan" style="font-size:11px;gap:4px;border-color:var(--border2)">🖨️ Cetak</button>'
    + '  </div>'
    + '</div>'

    // Live Preview
    + '<div style="flex:1;overflow-y:auto;padding:20px;background:#1e222d;display:flex;justify-content:center">'
    + '  <div id="market-report-preview-area" style="box-shadow:0 12px 36px rgba(0,0,0,0.4);border-radius:4px;overflow:hidden;background:#ffffff;width:100%;max-width:880px"></div>'
    + '</div>'

    // Footer
    + '<div style="padding:10px 20px;border-top:1px solid var(--border2);display:flex;justify-content:space-between;align-items:center;font-size:11px;color:var(--text3);background:var(--bg2)">'
    + '  <div>Format Berkas: <b>Dokumen A4 (.pdf)</b></div>'
    + '  <button class="btn btn-ghost btn-xs" onclick="mwCloseMarketReportModal()">Tutup</button>'
    + '</div>'
    + '</div>';

  document.body.appendChild(el);
}

async function downloadMarketReportPdf() {
  var period = MW_MARKET_REPORT_STATE.period;
  var dateStamp = new Date().toISOString().slice(0, 10);
  var filename = 'MoneyWatchPro_Laporan_Market_' + MW_MARKET_REPORT_PERIOD_LABEL[period] + '_' + dateStamp + '.pdf';

  if (!MW_MARKET_REPORT_STATE.data[period]) {
    await mwLoadMarketReportData(period);
  }

  if (typeof showSaveStatus === 'function') {
    showSaveStatus('⏳ Menyiapkan dokumen PDF Laporan Kondisi Pasar...', 'var(--accent)', true);
  }

  var container = document.getElementById('market-report-render-target');
  if (!container) {
    container = document.createElement('div');
    container.id = 'market-report-render-target';
    container.style.position = 'fixed';
    container.style.left = '-9999px';
    container.style.top = '0';
    container.style.width = '880px';
    container.style.zIndex = '-1000';
    document.body.appendChild(container);
  }

  container.innerHTML = buildMarketReportHtml(period);
  var docElement = container.querySelector('#market-report-document') || container;

  if (typeof html2pdf !== 'undefined') {
    var opt = {
      margin: [8, 8, 8, 8],
      filename: filename,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true, letterRendering: true },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
    };

    html2pdf().set(opt).from(docElement).save().then(function() {
      if (typeof showSaveStatus === 'function') {
        showSaveStatus('✓ Laporan Kondisi Pasar (' + filename + ') berhasil diunduh', 'var(--green)');
      }
    }).catch(function(err) {
      console.warn('html2pdf fallback to print:', err);
      printMarketReportPdf();
    });
  } else {
    printMarketReportPdf();
  }
}

async function printMarketReportPdf() {
  var period = MW_MARKET_REPORT_STATE.period;
  if (!MW_MARKET_REPORT_STATE.data[period]) {
    await mwLoadMarketReportData(period);
  }
  var htmlContent = buildMarketReportHtml(period);

  var printWin = window.open('', '_blank');
  if (printWin) {
    printWin.document.write('<!DOCTYPE html><html><head><title>Laporan Kondisi Pasar — Money Watch</title>'
      + '<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@500;700&display=swap" rel="stylesheet">'
      + '<style>@page{size:A4 portrait;margin:8mm}body{margin:0;padding:0;background:#fff;font-family:\'Inter\',sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}</style>'
      + '</head><body>' + htmlContent + '</body></html>');
    printWin.document.close();
    printWin.focus();
    setTimeout(function() {
      printWin.print();
      printWin.close();
    }, 450);
  } else {
    window.print();
  }
}

window.mwOpenMarketReportModal = mwOpenMarketReportModal;
window.mwCloseMarketReportModal = mwCloseMarketReportModal;
window.mwSetMarketReportPeriod = mwSetMarketReportPeriod;
window.downloadMarketReportPdf = downloadMarketReportPdf;
window.printMarketReportPdf = printMarketReportPdf;
