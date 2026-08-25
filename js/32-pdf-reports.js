// ══════════════════════════════════════════════════════════════════════════
// MONEY WATCH PRO — PDF REPORT & WEALTH STATEMENT GENERATOR (v6.2)
// Modul Pembuatan & Pengunduhan Laporan Portofolio & Kekayaan Bersih (PDF)
// ══════════════════════════════════════════════════════════════════════════

var MW_CURRENT_REPORT_TYPE = 'portfolio'; // 'portfolio' | 'wealth' | 'consolidated'
var MW_PDF_INCLUDE_PRIVACY_MASK = false;

// ── Utility Format Angka & Mata Uang ──
function _mwPdfRp(val, prefix) {
  var p = (prefix !== undefined) ? prefix : 'Rp ';
  if (val === undefined || val === null || isNaN(val)) return p + '0';
  var abs = Math.abs(val);
  var sign = val < 0 ? '-' : '';
  return sign + p + Math.round(abs).toLocaleString('id-ID');
}

function _mwPdfPct(val) {
  if (val === undefined || val === null || isNaN(val)) return '0,00%';
  var sign = val > 0 ? '+' : '';
  return sign + val.toFixed(2).replace('.', ',') + '%';
}

function _mwPdfDate(dateStr) {
  var d = dateStr ? new Date(dateStr) : new Date();
  return d.toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });
}

function _mwPdfDateTime(dateStr) {
  var d = dateStr ? new Date(dateStr) : new Date();
  return d.toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }) + ' WIB';
}

// ══════════════════════════════════════════════════════════════════════════
// 1. BUILDER: LAPORAN RINGKASAN PORTOFOLIO INVESTASI (PDF HTML)
// ══════════════════════════════════════════════════════════════════════════
function buildPortfolioReportHtml() {
  var porto = (typeof getPortfolio === 'function') ? getPortfolio() : [];
  var crypto = (typeof getCryptoPortfolio === 'function') ? getCryptoPortfolio() : [];
  var etf = (typeof getEtfPortfolio === 'function') ? getEtfPortfolio() : [];
  var rd = (typeof getRdPortfolio === 'function') ? getRdPortfolio() : [];
  var rdn = (typeof calcRdnBalance === 'function') ? calcRdnBalance() : 0;
  var user = (typeof _currentUser !== 'undefined' && _currentUser && _currentUser.email) ? _currentUser.email : 'Investor Tamu (Demo)';

  var totalCost = porto.reduce(function(a, p) { return a + (p.cost || 0); }, 0);
  var totalMv = porto.reduce(function(a, p) { return a + (p.mv || 0); }, 0);
  var totalUnreal = totalMv - totalCost;
  var totalRetPct = totalCost > 0 ? (totalUnreal / totalCost * 100) : 0;

  var cryptoMv = crypto.reduce(function(a, c) { return a + (c.mv || 0); }, 0);
  var etfMv = etf.reduce(function(a, e) { return a + (e.mvIdr || 0); }, 0);
  var rdMv = rd.reduce(function(a, r) { return a + (r.mv || 0); }, 0);
  var totalAum = totalMv + cryptoMv + etfMv + rdMv + rdn;

  var ihsgVal = (typeof ihsg !== 'undefined' && ihsg > 0) ? ihsg.toLocaleString('id-ID') : '7.150,00';
  var usdVal = (typeof usdIdr !== 'undefined' && usdIdr > 0) ? 'Rp ' + Math.round(usdIdr).toLocaleString('id-ID') : 'Rp 16.200';

  // Urutkan saham berdasarkan Market Value tertinggi
  var sortedPorto = porto.slice().sort(function(a, b) { return b.mv - a.mv; });

  var rowsHtml = '';
  if (sortedPorto.length > 0) {
    rowsHtml = sortedPorto.map(function(p, idx) {
      var weight = totalAum > 0 ? (p.mv / totalAum * 100).toFixed(1) + '%' : '0%';
      var pnlColor = p.unreal >= 0 ? '#047857' : '#b91c1c';
      var strat = (typeof stratOf === 'function') ? stratOf(p.ticker) : ((DB[p.ticker] && DB[p.ticker].tradeType) || 'Core Long');
      var sector = (p.info && p.info.sector) || (DB[p.ticker] && DB[p.ticker].sector) || 'Lainnya';
      var name = (p.info && p.info.name) || (DB[p.ticker] && DB[p.ticker].name) || p.ticker;

      return '<tr style="border-bottom:1px solid #e2e8f0;' + (idx % 2 === 1 ? 'background:#f8fafc;' : '') + '">'
        + '<td style="padding:7px 8px;font-weight:700;font-family:monospace;color:#0f172a">' + p.ticker + '</td>'
        + '<td style="padding:7px 8px;color:#334155;font-size:10px;max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + name + '<br><span style="color:#64748b;font-size:9px">' + sector + '</span></td>'
        + '<td style="padding:7px 8px;text-align:right;font-family:monospace">' + p.lot.toLocaleString('id-ID') + ' <span style="color:#64748b;font-size:9px">lot</span></td>'
        + '<td style="padding:7px 8px;text-align:right;font-family:monospace">' + _mwPdfRp(p.avg, '') + '</td>'
        + '<td style="padding:7px 8px;text-align:right;font-family:monospace;font-weight:600">' + _mwPdfRp(p.mp, '') + '</td>'
        + '<td style="padding:7px 8px;text-align:right;font-family:monospace">' + _mwPdfRp(p.cost) + '</td>'
        + '<td style="padding:7px 8px;text-align:right;font-family:monospace;font-weight:700;color:#0f172a">' + _mwPdfRp(p.mv) + '</td>'
        + '<td style="padding:7px 8px;text-align:right;font-family:monospace;font-weight:700;color:' + pnlColor + '">' + _mwPdfRp(p.unreal) + '<br><span style="font-size:9px">' + _mwPdfPct(p.ret) + '</span></td>'
        + '<td style="padding:7px 8px;text-align:center;font-family:monospace;font-size:10px">' + weight + '</td>'
        + '<td style="padding:7px 8px;text-align:center"><span style="display:inline-block;padding:2px 6px;border-radius:4px;font-size:9px;font-weight:600;background:#eff6ff;color:#1d4ed8;border:1px solid #bfdbfe">' + strat + '</span></td>'
        + '</tr>';
    }).join('');
  } else {
    rowsHtml = '<tr><td colspan="10" style="text-align:center;padding:24px;color:#64748b">Belum ada posisi saham aktif dalam portofolio.</td></tr>';
  }

  // Multi-asset table
  var multiAssetRows = '';
  if (crypto.length > 0) {
    crypto.forEach(function(c) {
      multiAssetRows += '<tr style="border-bottom:1px solid #e2e8f0"><td style="padding:6px 8px;font-weight:700;font-family:monospace">🪙 ' + c.symbol + '</td><td style="padding:6px 8px">Crypto</td><td style="padding:6px 8px;text-align:right;font-family:monospace">' + (c.qty || 0) + '</td><td style="padding:6px 8px;text-align:right;font-family:monospace;font-weight:700">' + _mwPdfRp(c.mv) + '</td><td style="padding:6px 8px;text-align:right;font-family:monospace;' + (c.unreal >= 0 ? 'color:#047857' : 'color:#b91c1c') + '">' + _mwPdfRp(c.unreal) + ' (' + _mwPdfPct(c.ret) + ')</td></tr>';
    });
  }
  if (etf.length > 0) {
    etf.forEach(function(e) {
      multiAssetRows += '<tr style="border-bottom:1px solid #e2e8f0"><td style="padding:6px 8px;font-weight:700;font-family:monospace">📊 ' + e.ticker + '</td><td style="padding:6px 8px">US ETF</td><td style="padding:6px 8px;text-align:right;font-family:monospace">' + (e.shares || 0) + ' lbr</td><td style="padding:6px 8px;text-align:right;font-family:monospace;font-weight:700">' + _mwPdfRp(e.mvIdr) + '</td><td style="padding:6px 8px;text-align:right;font-family:monospace;' + (e.unrealIdr >= 0 ? 'color:#047857' : 'color:#b91c1c') + '">' + _mwPdfRp(e.unrealIdr) + '</td></tr>';
    });
  }
  if (rd.length > 0) {
    rd.forEach(function(r) {
      multiAssetRows += '<tr style="border-bottom:1px solid #e2e8f0"><td style="padding:6px 8px;font-weight:700;font-family:monospace">🏦 ' + r.name + '</td><td style="padding:6px 8px">Reksa Dana</td><td style="padding:6px 8px;text-align:right;font-family:monospace">' + (r.units || 0) + ' unit</td><td style="padding:6px 8px;text-align:right;font-family:monospace;font-weight:700">' + _mwPdfRp(r.mv) + '</td><td style="padding:6px 8px;text-align:right;font-family:monospace;' + (r.unreal >= 0 ? 'color:#047857' : 'color:#b91c1c') + '">' + _mwPdfRp(r.unreal) + '</td></tr>';
    });
  }

  return '<div id="pdf-report-document" style="width:100%;max-width:850px;margin:0 auto;background:#ffffff;color:#0f172a;font-family:\'Inter\',system-ui,sans-serif;padding:32px;box-sizing:border-box;line-height:1.45;font-size:11px">'
    // Document Header
    + '<div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #0f172a;padding-bottom:14px;margin-bottom:18px">'
    + '  <div>'
    + '    <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">'
    + '      <div style="width:24px;height:24px;background:#0f172a;border-radius:5px;display:flex;align-items:center;justify-content:center;color:#38bdf8;font-weight:800;font-size:13px">MW</div>'
    + '      <div style="font-size:16px;font-weight:800;letter-spacing:-0.3px;color:#0f172a">MONEY WATCH <span style="color:#2563eb">PRO</span></div>'
    + '    </div>'
    + '    <div style="font-size:12px;font-weight:700;color:#334155;text-transform:uppercase;letter-spacing:0.5px">Laporan Eksekutif Portofolio Investasi</div>'
    + '    <div style="font-size:10px;color:#64748b;margin-top:2px">ID Dokumen: MW-PORT-' + Date.now().toString().slice(-6) + ' · Tanggal: ' + _mwPdfDateTime() + '</div>'
    + '  </div>'
    + '  <div style="text-align:right">'
    + '    <div style="font-size:10px;color:#64748b">Akun Pengguna</div>'
    + '    <div style="font-size:11px;font-weight:700;color:#0f172a">' + user + '</div>'
    + '    <div style="font-size:9px;color:#64748b;margin-top:4px">Benchmark IHSG: <b>' + ihsgVal + '</b> · Kurs USD: <b>' + usdVal + '</b></div>'
    + '  </div>'
    + '</div>'

    // Executive Metrics 4-Box Grid
    + '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:18px">'
    + '  <div style="background:#f8fafc;border:1px solid #cbd5e1;border-radius:6px;padding:10px">'
    + '    <div style="font-size:9px;font-weight:700;color:#64748b;text-transform:uppercase">Total Nilai Portofolio (AUM)</div>'
    + '    <div style="font-size:16px;font-weight:800;font-family:monospace;color:#0f172a;margin-top:4px">' + _mwPdfRp(totalAum) + '</div>'
    + '    <div style="font-size:9px;color:#64748b;margin-top:2px">Saham + Multi-aset + Kas RDN</div>'
    + '  </div>'
    + '  <div style="background:#f8fafc;border:1px solid #cbd5e1;border-radius:6px;padding:10px">'
    + '    <div style="font-size:9px;font-weight:700;color:#64748b;text-transform:uppercase">Modal Tertanam Saham</div>'
    + '    <div style="font-size:16px;font-weight:800;font-family:monospace;color:#334155;margin-top:4px">' + _mwPdfRp(totalCost) + '</div>'
    + '    <div style="font-size:9px;color:#64748b;margin-top:2px">' + sortedPorto.length + ' posisi aktif</div>'
    + '  </div>'
    + '  <div style="background:' + (totalUnreal >= 0 ? '#ecfdf5' : '#fef2f2') + ';border:1px solid ' + (totalUnreal >= 0 ? '#a7f3d0' : '#fecaca') + ';border-radius:6px;padding:10px">'
    + '    <div style="font-size:9px;font-weight:700;color:' + (totalUnreal >= 0 ? '#065f46' : '#991b1b') + ';text-transform:uppercase">Unrealized P&amp;L Saham</div>'
    + '    <div style="font-size:16px;font-weight:800;font-family:monospace;color:' + (totalUnreal >= 0 ? '#047857' : '#b91c1c') + ';margin-top:4px">' + _mwPdfRp(totalUnreal) + '</div>'
    + '    <div style="font-size:9px;font-weight:700;color:' + (totalUnreal >= 0 ? '#047857' : '#b91c1c') + ';margin-top:2px">' + _mwPdfPct(totalRetPct) + ' (Floating Return)</div>'
    + '  </div>'
    + '  <div style="background:#f8fafc;border:1px solid #cbd5e1;border-radius:6px;padding:10px">'
    + '    <div style="font-size:9px;font-weight:700;color:#64748b;text-transform:uppercase">Kas Likuid RDN</div>'
    + '    <div style="font-size:16px;font-weight:800;font-family:monospace;color:#0f172a;margin-top:4px">' + _mwPdfRp(rdn) + '</div>'
    + '    <div style="font-size:9px;color:#64748b;margin-top:2px">' + (totalAum > 0 ? (rdn / totalAum * 100).toFixed(1) + '% dari AUM' : '0%') + '</div>'
    + '  </div>'
    + '</div>'

    // Asset Allocation Bar Summary
    + '<div style="background:#f1f5f9;border-radius:6px;padding:10px 14px;margin-bottom:18px;border:1px solid #e2e8f0">'
    + '  <div style="font-size:10px;font-weight:700;color:#1e293b;margin-bottom:6px">KOMPOSISI KELAS ASET:</div>'
    + '  <div style="display:flex;gap:16px;flex-wrap:wrap;font-size:10px">'
    + '    <div><span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:#2563eb;margin-right:4px"></span>Saham IDX: <b>' + _mwPdfRp(totalMv) + '</b> (' + (totalAum > 0 ? (totalMv / totalAum * 100).toFixed(1) : 0) + '%)</div>'
    + '    <div><span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:#10b981;margin-right:4px"></span>Kas RDN: <b>' + _mwPdfRp(rdn) + '</b> (' + (totalAum > 0 ? (rdn / totalAum * 100).toFixed(1) : 0) + '%)</div>'
    + (cryptoMv > 0 ? '    <div><span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:#f59e0b;margin-right:4px"></span>Crypto: <b>' + _mwPdfRp(cryptoMv) + '</b> (' + (totalAum > 0 ? (cryptoMv / totalAum * 100).toFixed(1) : 0) + '%)</div>' : '')
    + (etfMv > 0 ? '    <div><span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:#06b6d4;margin-right:4px"></span>US ETF: <b>' + _mwPdfRp(etfMv) + '</b> (' + (totalAum > 0 ? (etfMv / totalAum * 100).toFixed(1) : 0) + '%)</div>' : '')
    + (rdMv > 0 ? '    <div><span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:#8b5cf6;margin-right:4px"></span>Reksa Dana: <b>' + _mwPdfRp(rdMv) + '</b> (' + (totalAum > 0 ? (rdMv / totalAum * 100).toFixed(1) : 0) + '%)</div>' : '')
    + '  </div>'
    + '</div>'

    // Main Table: Saham IDX
    + '<div style="margin-bottom:18px">'
    + '  <div style="font-size:11px;font-weight:700;color:#0f172a;margin-bottom:6px;display:flex;justify-content:space-between;align-items:center">'
    + '    <span>RINCIAN KEPEMILIKAN SAHAM IDX (' + sortedPorto.length + ' Emiten)</span>'
    + '    <span style="font-size:9px;font-weight:400;color:#64748b">Harga terkoneksi feed pasar live &amp; baseline resmi</span>'
    + '  </div>'
    + '  <table style="width:100%;border-collapse:collapse;font-size:10px;text-align:left;border:1px solid #cbd5e1">'
    + '    <thead>'
    + '      <tr style="background:#f1f5f9;border-bottom:2px solid #cbd5e1;color:#334155">'
    + '        <th style="padding:7px 8px">KODE</th>'
    + '        <th style="padding:7px 8px">EMITEN &amp; SEKTOR</th>'
    + '        <th style="padding:7px 8px;text-align:right">LOT</th>'
    + '        <th style="padding:7px 8px;text-align:right">AVG BELI</th>'
    + '        <th style="padding:7px 8px;text-align:right">HARGA PASAR</th>'
    + '        <th style="padding:7px 8px;text-align:right">MODAL (IDR)</th>'
    + '        <th style="padding:7px 8px;text-align:right">NILAI PASAR (IDR)</th>'
    + '        <th style="padding:7px 8px;text-align:right">UNREALIZED P&amp;L</th>'
    + '        <th style="padding:7px 8px;text-align:center">BOBOT</th>'
    + '        <th style="padding:7px 8px;text-align:center">STRATEGI</th>'
    + '      </tr>'
    + '    </thead>'
    + '    <tbody>'
    + rowsHtml
    + '    </tbody>'
    + '    <tfoot>'
    + '      <tr style="background:#f8fafc;font-weight:700;border-top:2px solid #0f172a;font-family:monospace">'
    + '        <td colspan="5" style="padding:8px;color:#0f172a;text-align:left">TOTAL KEPEMILIKAN SAHAM</td>'
    + '        <td style="padding:8px;text-align:right">' + _mwPdfRp(totalCost) + '</td>'
    + '        <td style="padding:8px;text-align:right;color:#0f172a">' + _mwPdfRp(totalMv) + '</td>'
    + '        <td style="padding:8px;text-align:right;color:' + (totalUnreal >= 0 ? '#047857' : '#b91c1c') + '">' + _mwPdfRp(totalUnreal) + ' (' + _mwPdfPct(totalRetPct) + ')</td>'
    + '        <td style="padding:8px;text-align:center">' + (totalAum > 0 ? (totalMv / totalAum * 100).toFixed(1) : 0) + '%</td>'
    + '        <td></td>'
    + '      </tr>'
    + '    </tfoot>'
    + '  </table>'
    + '</div>'

    // Multi-asset sub-table if any
    + (multiAssetRows ? (
        '<div style="margin-bottom:18px">'
        + '  <div style="font-size:11px;font-weight:700;color:#0f172a;margin-bottom:6px">PORTOFOLIO MULTI-ASET LAINNYA (CRYPTO, ETF &amp; REKSA DANA)</div>'
        + '  <table style="width:100%;border-collapse:collapse;font-size:10px;text-align:left;border:1px solid #cbd5e1">'
        + '    <thead>'
        + '      <tr style="background:#f1f5f9;border-bottom:2px solid #cbd5e1;color:#334155">'
        + '        <th style="padding:6px 8px">INSTRUMEN</th>'
        + '        <th style="padding:6px 8px">KELAS ASET</th>'
        + '        <th style="padding:6px 8px;text-align:right">KUANTITAS</th>'
        + '        <th style="padding:6px 8px;text-align:right">NILAI PASAR (IDR)</th>'
        + '        <th style="padding:6px 8px;text-align:right">UNREALIZED P&amp;L</th>'
        + '      </tr>'
        + '    </thead>'
        + '    <tbody>' + multiAssetRows + '</tbody>'
        + '  </table>'
        + '</div>'
      ) : '')

    // Footer & Disclaimer
    + '<div style="margin-top:24px;border-top:1px solid #cbd5e1;padding-top:10px;display:flex;justify-content:space-between;align-items:center;font-size:9px;color:#64748b">'
    + '  <div>Laporan di-generate secara otomatis oleh Money Watch Pro Terminal · Metode Moving Average Cost Basis &amp; Real-time Market Feeds</div>'
    + '  <div>Halaman 1 dari 1</div>'
    + '</div>'
    + '</div>';
}

// ══════════════════════════════════════════════════════════════════════════
// 2. BUILDER: LAPORAN KEKAYAAN BERSIH (NET WORTH & WEALTH STATEMENT)
// ══════════════════════════════════════════════════════════════════════════
function buildWealthReportHtml() {
  var a = (typeof wCalc === 'function') ? wCalc() : {
    aset: 0, net: 0, debt: { t: 0, c: 0 }, invTotal: 0, bankTotal: 0,
    piu: { sisa: 0, pokok: 0, terbayar: 0 }, div12: 0, passive: 0,
    emMonths: 0, score: 70, inv: { saham: 0, crypto: 0, etf: 0, rd: 0, kas: 0 }
  };
  var user = (typeof _currentUser !== 'undefined' && _currentUser && _currentUser.email) ? _currentUser.email : 'Investor Tamu (Demo)';
  var dr = a.aset > 0 ? (a.debt.t / a.aset * 100) : 0;
  var grade = a.score >= 75 ? 'Sangat Sehat (Excellent)' : a.score >= 55 ? 'Baik (Good)' : 'Perlu Perhatian (Fair)';
  var fireTarget = (typeof WEALTH !== 'undefined' && WEALTH.expense) ? WEALTH.expense * 12 * 25 : 0;
  var firePct = fireTarget > 0 ? Math.min(100, a.net / fireTarget * 100) : 0;

  // Rincian Bank
  var bankRows = '';
  if (typeof WEALTH !== 'undefined' && WEALTH.bank && WEALTH.bank.length > 0) {
    bankRows = WEALTH.bank.map(function(b) {
      var noAcc = MW_PDF_INCLUDE_PRIVACY_MASK ? '•••• ' + (b.no ? String(b.no).slice(-4) : '0000') : (b.no || '-');
      return '<tr style="border-bottom:1px solid #e2e8f0">'
        + '<td style="padding:6px 8px;font-weight:600">' + b.bank + '</td>'
        + '<td style="padding:6px 8px;color:#64748b">' + (b.type || 'Tabungan / Giro') + '</td>'
        + '<td style="padding:6px 8px;font-family:monospace;color:#64748b">' + noAcc + '</td>'
        + '<td style="padding:6px 8px;text-align:right;font-family:monospace;font-weight:700">' + _mwPdfRp(b.saldo) + '</td>'
        + '</tr>';
    }).join('');
  } else {
    bankRows = '<tr><td colspan="4" style="text-align:center;padding:10px;color:#64748b">Belum ada akun bank tercatat.</td></tr>';
  }

  // Rincian Hutang / Liabilitas
  var debtRows = '';
  if (typeof WEALTH !== 'undefined' && WEALTH.debt && WEALTH.debt.length > 0) {
    debtRows = WEALTH.debt.map(function(d) {
      return '<tr style="border-bottom:1px solid #e2e8f0">'
        + '<td style="padding:6px 8px;font-weight:600;color:#0f172a">' + d.nama + '</td>'
        + '<td style="padding:6px 8px;color:#64748b">' + (d.tipe || 'Pinjaman') + '</td>'
        + '<td style="padding:6px 8px;text-align:right;font-family:monospace">' + (d.bunga ? d.bunga + '% p.a.' : '-') + '</td>'
        + '<td style="padding:6px 8px;text-align:right;font-family:monospace;color:#b91c1c;font-weight:600">' + _mwPdfRp(d.cicilan) + '/bln</td>'
        + '<td style="padding:6px 8px;text-align:right;font-family:monospace;font-weight:700;color:#b91c1c">' + _mwPdfRp(d.outstanding) + '</td>'
        + '</tr>';
    }).join('');
  } else {
    debtRows = '<tr><td colspan="5" style="text-align:center;padding:10px;color:#047857;font-weight:600">✓ Tidak ada catatan liabilitas / hutang aktif.</td></tr>';
  }

  return '<div id="pdf-report-document" style="width:100%;max-width:850px;margin:0 auto;background:#ffffff;color:#0f172a;font-family:\'Inter\',system-ui,sans-serif;padding:32px;box-sizing:border-box;line-height:1.45;font-size:11px">'
    // Header
    + '<div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #0f172a;padding-bottom:14px;margin-bottom:18px">'
    + '  <div>'
    + '    <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">'
    + '      <div style="width:24px;height:24px;background:#0f172a;border-radius:5px;display:flex;align-items:center;justify-content:center;color:#38bdf8;font-weight:800;font-size:13px">MW</div>'
    + '      <div style="font-size:16px;font-weight:800;letter-spacing:-0.3px;color:#0f172a">MONEY WATCH <span style="color:#2563eb">PRO</span></div>'
    + '    </div>'
    + '    <div style="font-size:12px;font-weight:700;color:#334155;text-transform:uppercase;letter-spacing:0.5px">Neraca Kekayaan Bersih (Personal Family Office Statement)</div>'
    + '    <div style="font-size:10px;color:#64748b;margin-top:2px">ID Dokumen: MW-WEALTH-' + Date.now().toString().slice(-6) + ' · Tanggal: ' + _mwPdfDateTime() + '</div>'
    + '  </div>'
    + '  <div style="text-align:right">'
    + '    <div style="font-size:10px;color:#64748b">Pemilik Laporan</div>'
    + '    <div style="font-size:11px;font-weight:700;color:#0f172a">' + user + '</div>'
    + '    <div style="font-size:9px;color:#64748b;margin-top:4px">Wealth Health Score: <b>' + a.score + '/100</b> (' + grade + ')</div>'
    + '  </div>'
    + '</div>'

    // Net Worth Hero Callout
    + '<div style="background:#0f172a;color:#ffffff;border-radius:8px;padding:16px 20px;margin-bottom:18px;display:flex;justify-content:space-between;align-items:center">'
    + '  <div>'
    + '    <div style="font-size:10px;font-weight:700;color:#94a3b8;letter-spacing:0.8px;text-transform:uppercase">TOTAL KEKAYAAN BERSIH (NET WORTH)</div>'
    + '    <div style="font-size:24px;font-weight:900;font-family:monospace;color:#38bdf8;margin-top:4px">' + _mwPdfRp(a.net) + '</div>'
    + '    <div style="font-size:10px;color:#cbd5e1;margin-top:4px">Aset Bruto: <b>' + _mwPdfRp(a.aset) + '</b> · Total Liabilitas: <b style="color:#f87171">' + _mwPdfRp(a.debt.t) + '</b> (' + dr.toFixed(1) + '%)</div>'
    + '  </div>'
    + '  <div style="text-align:right;border-left:1px solid #334155;padding-left:18px">'
    + '    <div style="font-size:9px;color:#94a3b8;text-transform:uppercase">Progress FIRE (Pensiun Dini)</div>'
    + '    <div style="font-size:16px;font-weight:800;font-family:monospace;color:#34d399;margin-top:2px">' + firePct.toFixed(1) + '%</div>'
    + '    <div style="font-size:9px;color:#94a3b8">Target: ' + _mwPdfRp(fireTarget) + '</div>'
    + '  </div>'
    + '</div>'

    // 4 Key Wealth Indicators
    + '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:18px">'
    + '  <div style="background:#f8fafc;border:1px solid #cbd5e1;border-radius:6px;padding:10px">'
    + '    <div style="font-size:9px;font-weight:700;color:#64748b;text-transform:uppercase">Portofolio Investasi</div>'
    + '    <div style="font-size:14px;font-weight:800;font-family:monospace;color:#0f172a;margin-top:3px">' + _mwPdfRp(a.invTotal) + '</div>'
    + '    <div style="font-size:9px;color:#64748b;margin-top:2px">' + (a.aset > 0 ? (a.invTotal / a.aset * 100).toFixed(1) : 0) + '% dari total aset</div>'
    + '  </div>'
    + '  <div style="background:#f8fafc;border:1px solid #cbd5e1;border-radius:6px;padding:10px">'
    + '    <div style="font-size:9px;font-weight:700;color:#64748b;text-transform:uppercase">Kas &amp; Rekening Bank</div>'
    + '    <div style="font-size:14px;font-weight:800;font-family:monospace;color:#0f172a;margin-top:3px">' + _mwPdfRp(a.bankTotal) + '</div>'
    + '    <div style="font-size:9px;color:#047857;margin-top:2px">Dana darurat: ' + a.emMonths.toFixed(1) + ' bln</div>'
    + '  </div>'
    + '  <div style="background:#f8fafc;border:1px solid #cbd5e1;border-radius:6px;padding:10px">'
    + '    <div style="font-size:9px;font-weight:700;color:#64748b;text-transform:uppercase">Passive Income Est.</div>'
    + '    <div style="font-size:14px;font-weight:800;font-family:monospace;color:#047857;margin-top:3px">' + _mwPdfRp(a.passive / 12) + '<span style="font-size:9px">/bln</span></div>'
    + '    <div style="font-size:9px;color:#64748b;margin-top:2px">Dividen + Bunga instrumen</div>'
    + '  </div>'
    + '  <div style="background:#f8fafc;border:1px solid #cbd5e1;border-radius:6px;padding:10px">'
    + '    <div style="font-size:9px;font-weight:700;color:#64748b;text-transform:uppercase">Total Liabilitas / Hutang</div>'
    + '    <div style="font-size:14px;font-weight:800;font-family:monospace;color:#b91c1c;margin-top:3px">' + _mwPdfRp(a.debt.t) + '</div>'
    + '    <div style="font-size:9px;color:#64748b;margin-top:2px">Cicilan: ' + _mwPdfRp(a.debt.c) + '/bln</div>'
    + '  </div>'
    + '</div>'

    // Assets Balance Table
    + '<div style="margin-bottom:18px">'
    + '  <div style="font-size:11px;font-weight:700;color:#0f172a;margin-bottom:6px">1. NERACA ASSET KELUARGA &amp; PRIBADI</div>'
    + '  <table style="width:100%;border-collapse:collapse;font-size:10px;text-align:left;border:1px solid #cbd5e1">'
    + '    <thead>'
    + '      <tr style="background:#f1f5f9;border-bottom:2px solid #cbd5e1;color:#334155">'
    + '        <th style="padding:6px 8px">KOMPONEN ASET</th>'
    + '        <th style="padding:6px 8px">KETERANGAN / INSTRUMEN</th>'
    + '        <th style="padding:6px 8px;text-align:right">NILAI NOMINAL (IDR)</th>'
    + '        <th style="padding:6px 8px;text-align:center">PORSI %</th>'
    + '      </tr>'
    + '    </thead>'
    + '    <tbody>'
    + '      <tr style="border-bottom:1px solid #e2e8f0"><td style="padding:6px 8px;font-weight:600">📈 Saham IDX</td><td style="padding:6px 8px;color:#64748b">Portofolio ekuitas bursa efek</td><td style="padding:6px 8px;text-align:right;font-family:monospace;font-weight:700">' + _mwPdfRp(a.inv.saham) + '</td><td style="padding:6px 8px;text-align:center;font-family:monospace">' + (a.aset > 0 ? (a.inv.saham / a.aset * 100).toFixed(1) : 0) + '%</td></tr>'
    + '      <tr style="border-bottom:1px solid #e2e8f0"><td style="padding:6px 8px;font-weight:600">💰 Kas RDN &amp; Sekuritas</td><td style="padding:6px 8px;color:#64748b">Saldo kas rekening dana nasabah</td><td style="padding:6px 8px;text-align:right;font-family:monospace;font-weight:700">' + _mwPdfRp(a.inv.kas) + '</td><td style="padding:6px 8px;text-align:center;font-family:monospace">' + (a.aset > 0 ? (a.inv.kas / a.aset * 100).toFixed(1) : 0) + '%</td></tr>'
    + '      <tr style="border-bottom:1px solid #e2e8f0"><td style="padding:6px 8px;font-weight:600">🏦 Tabungan &amp; Saldo Bank</td><td style="padding:6px 8px;color:#64748b">' + (WEALTH.bank ? WEALTH.bank.length : 0) + ' rekening perbankan</td><td style="padding:6px 8px;text-align:right;font-family:monospace;font-weight:700">' + _mwPdfRp(a.bankTotal) + '</td><td style="padding:6px 8px;text-align:center;font-family:monospace">' + (a.aset > 0 ? (a.bankTotal / a.aset * 100).toFixed(1) : 0) + '%</td></tr>'
    + (a.inv.crypto > 0 ? '<tr style="border-bottom:1px solid #e2e8f0"><td style="padding:6px 8px;font-weight:600">🪙 Crypto Assets</td><td style="padding:6px 8px;color:#64748b">Bitcoin &amp; Altcoins</td><td style="padding:6px 8px;text-align:right;font-family:monospace;font-weight:700">' + _mwPdfRp(a.inv.crypto) + '</td><td style="padding:6px 8px;text-align:center;font-family:monospace">' + (a.aset > 0 ? (a.inv.crypto / a.aset * 100).toFixed(1) : 0) + '%</td></tr>' : '')
    + (a.inv.etf > 0 ? '<tr style="border-bottom:1px solid #e2e8f0"><td style="padding:6px 8px;font-weight:600">📊 US ETF</td><td style="padding:6px 8px;color:#64748b">Pasar modal global Amerika</td><td style="padding:6px 8px;text-align:right;font-family:monospace;font-weight:700">' + _mwPdfRp(a.inv.etf) + '</td><td style="padding:6px 8px;text-align:center;font-family:monospace">' + (a.aset > 0 ? (a.inv.etf / a.aset * 100).toFixed(1) : 0) + '%</td></tr>' : '')
    + (a.inv.rd > 0 ? '<tr style="border-bottom:1px solid #e2e8f0"><td style="padding:6px 8px;font-weight:600">🏛️ Reksa Dana</td><td style="padding:6px 8px;color:#64748b">Pasar Uang / Pendapatan Tetap</td><td style="padding:6px 8px;text-align:right;font-family:monospace;font-weight:700">' + _mwPdfRp(a.inv.rd) + '</td><td style="padding:6px 8px;text-align:center;font-family:monospace">' + (a.aset > 0 ? (a.inv.rd / a.aset * 100).toFixed(1) : 0) + '%</td></tr>' : '')
    + (WEALTH.deposito > 0 ? '<tr style="border-bottom:1px solid #e2e8f0"><td style="padding:6px 8px;font-weight:600">📑 Deposito Berjangka</td><td style="padding:6px 8px;color:#64748b">Asumsi bunga 5.5% p.a.</td><td style="padding:6px 8px;text-align:right;font-family:monospace;font-weight:700">' + _mwPdfRp(WEALTH.deposito) + '</td><td style="padding:6px 8px;text-align:center;font-family:monospace">' + (a.aset > 0 ? (WEALTH.deposito / a.aset * 100).toFixed(1) : 0) + '%</td></tr>' : '')
    + (WEALTH.obligasi > 0 ? '<tr style="border-bottom:1px solid #e2e8f0"><td style="padding:6px 8px;font-weight:600">📜 SBN &amp; Obligasi</td><td style="padding:6px 8px;color:#64748b">Surat Berharga Negara (kupon 6.5%)</td><td style="padding:6px 8px;text-align:right;font-family:monospace;font-weight:700">' + _mwPdfRp(WEALTH.obligasi) + '</td><td style="padding:6px 8px;text-align:center;font-family:monospace">' + (a.aset > 0 ? (WEALTH.obligasi / a.aset * 100).toFixed(1) : 0) + '%</td></tr>' : '')
    + (WEALTH.emas > 0 ? '<tr style="border-bottom:1px solid #e2e8f0"><td style="padding:6px 8px;font-weight:600">🥇 Logam Mulia / Emas</td><td style="padding:6px 8px;color:#64748b">Safe haven fisik / digital</td><td style="padding:6px 8px;text-align:right;font-family:monospace;font-weight:700">' + _mwPdfRp(WEALTH.emas) + '</td><td style="padding:6px 8px;text-align:center;font-family:monospace">' + (a.aset > 0 ? (WEALTH.emas / a.aset * 100).toFixed(1) : 0) + '%</td></tr>' : '')
    + (a.piu.sisa > 0 ? '<tr style="border-bottom:1px solid #e2e8f0"><td style="padding:6px 8px;font-weight:600">🤝 Piutang Berjalan</td><td style="padding:6px 8px;color:#64748b">Hak tagih outstanding</td><td style="padding:6px 8px;text-align:right;font-family:monospace;font-weight:700">' + _mwPdfRp(a.piu.sisa) + '</td><td style="padding:6px 8px;text-align:center;font-family:monospace">' + (a.aset > 0 ? (a.piu.sisa / a.aset * 100).toFixed(1) : 0) + '%</td></tr>' : '')
    + '    </tbody>'
    + '    <tfoot>'
    + '      <tr style="background:#f8fafc;font-weight:700;border-top:2px solid #0f172a;font-family:monospace">'
    + '        <td colspan="2" style="padding:7px 8px;color:#0f172a">TOTAL ASET BRUTO</td>'
    + '        <td style="padding:7px 8px;text-align:right;color:#0f172a">' + _mwPdfRp(a.aset) + '</td>'
    + '        <td style="padding:7px 8px;text-align:center">100,0%</td>'
    + '      </tr>'
    + '    </tfoot>'
    + '  </table>'
    + '</div>'

    // Liabilities Table
    + '<div style="margin-bottom:18px">'
    + '  <div style="font-size:11px;font-weight:700;color:#0f172a;margin-bottom:6px">2. NERACA KEWAJIBAN &amp; LIABILITAS</div>'
    + '  <table style="width:100%;border-collapse:collapse;font-size:10px;text-align:left;border:1px solid #cbd5e1">'
    + '    <thead>'
    + '      <tr style="background:#f1f5f9;border-bottom:2px solid #cbd5e1;color:#334155">'
    + '        <th style="padding:6px 8px">NAMA KEWAJIBAN</th>'
    + '        <th style="padding:6px 8px">JENIS PINJAMAN</th>'
    + '        <th style="padding:6px 8px;text-align:right">SUKU BUNGA</th>'
    + '        <th style="padding:6px 8px;text-align:right">CICILAN / BULAN</th>'
    + '        <th style="padding:6px 8px;text-align:right">SISA POKOK (IDR)</th>'
    + '      </tr>'
    + '    </thead>'
    + '    <tbody>' + debtRows + '</tbody>'
    + '    <tfoot>'
    + '      <tr style="background:#fef2f2;font-weight:700;border-top:2px solid #b91c1c;font-family:monospace">'
    + '        <td colspan="3" style="padding:7px 8px;color:#b91c1c">TOTAL LIABILITAS KELUARGA</td>'
    + '        <td style="padding:7px 8px;text-align:right;color:#b91c1c">' + _mwPdfRp(a.debt.c) + '/bln</td>'
    + '        <td style="padding:7px 8px;text-align:right;color:#b91c1c">' + _mwPdfRp(a.debt.t) + '</td>'
    + '      </tr>'
    + '    </tfoot>'
    + '  </table>'
    + '</div>'

    // Bank details
    + (WEALTH.bank && WEALTH.bank.length > 0 ? (
        '<div style="margin-bottom:18px">'
        + '  <div style="font-size:11px;font-weight:700;color:#0f172a;margin-bottom:6px">3. RINCIAN SALDO REKENING BANK &amp; KAS</div>'
        + '  <table style="width:100%;border-collapse:collapse;font-size:10px;text-align:left;border:1px solid #cbd5e1">'
        + '    <thead>'
        + '      <tr style="background:#f1f5f9;border-bottom:2px solid #cbd5e1;color:#334155">'
        + '        <th style="padding:6px 8px">NAMA BANK</th>'
        + '        <th style="padding:6px 8px">TIPE REKENING</th>'
        + '        <th style="padding:6px 8px">NOMOR REKENING</th>'
        + '        <th style="padding:6px 8px;text-align:right">SALDO TERCATAT (IDR)</th>'
        + '      </tr>'
        + '    </thead>'
        + '    <tbody>' + bankRows + '</tbody>'
        + '  </table>'
        + '</div>'
      ) : '')

    // Footer
    + '<div style="margin-top:24px;border-top:1px solid #cbd5e1;padding-top:10px;display:flex;justify-content:space-between;align-items:center;font-size:9px;color:#64748b">'
    + '  <div>Laporan Neraca Pribadi Money Watch Pro · Dihitung berdasarkan data aset dan kalkulasi Family Office terpadu</div>'
    + '  <div>Halaman 1 dari 1</div>'
    + '</div>'
    + '</div>';
}

// ══════════════════════════════════════════════════════════════════════════
// 3. BUILDER: LAPORAN KONSOLIDASI LENGKAP (ALL-IN-ONE CONSOLIDATED STATEMENT)
// ══════════════════════════════════════════════════════════════════════════
function buildConsolidatedReportHtml() {
  var portoHtml = buildPortfolioReportHtml();
  var wealthHtml = buildWealthReportHtml();

  return '<div id="pdf-report-document" style="width:100%;max-width:850px;margin:0 auto;background:#ffffff;color:#0f172a;font-family:\'Inter\',system-ui,sans-serif;padding:32px;box-sizing:border-box;line-height:1.45;font-size:11px">'
    // Consolidated Header
    + '<div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #0f172a;padding-bottom:14px;margin-bottom:18px">'
    + '  <div>'
    + '    <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">'
    + '      <div style="width:24px;height:24px;background:#0f172a;border-radius:5px;display:flex;align-items:center;justify-content:center;color:#38bdf8;font-weight:800;font-size:13px">MW</div>'
    + '      <div style="font-size:16px;font-weight:800;letter-spacing:-0.3px;color:#0f172a">MONEY WATCH <span style="color:#2563eb">PRO</span></div>'
    + '    </div>'
    + '    <div style="font-size:13px;font-weight:800;color:#0f172a;text-transform:uppercase;letter-spacing:0.5px">Laporan Konsolidasi Portofolio &amp; Kekayaan Bersih</div>'
    + '    <div style="font-size:10px;color:#64748b;margin-top:2px">Comprehensive Family Office Statement · ' + _mwPdfDateTime() + '</div>'
    + '  </div>'
    + '  <div style="text-align:right">'
    + '    <div style="font-size:10px;color:#64748b">Pemilik Portofolio</div>'
    + '    <div style="font-size:11px;font-weight:700;color:#0f172a">' + ((typeof _currentUser !== 'undefined' && _currentUser && _currentUser.email) ? _currentUser.email : 'Investor Tamu') + '</div>'
    + '  </div>'
    + '</div>'
    + '<div style="margin-bottom:28px">' + wealthHtml.replace(/^<div[^>]*>/, '').replace(/<\/div>$/, '') + '</div>'
    + '<div style="page-break-before:always;margin-top:28px;border-top:2px dashed #cbd5e1;padding-top:20px">' + portoHtml.replace(/^<div[^>]*>/, '').replace(/<\/div>$/, '') + '</div>'
    + '</div>';
}

// ══════════════════════════════════════════════════════════════════════════
// 4. ACTION EXPORT: DOWNLOAD PDF & PRINT
// ══════════════════════════════════════════════════════════════════════════
function downloadPdfReport(type) {
  var reportType = type || MW_CURRENT_REPORT_TYPE || 'portfolio';
  var dateStamp = new Date().toISOString().slice(0, 10);
  var filename = 'MoneyWatchPro_Laporan_' + (reportType === 'wealth' ? 'Kekayaan_Bersih' : (reportType === 'consolidated' ? 'Konsolidasi_Lengkap' : 'Portofolio_Saham')) + '_' + dateStamp + '.pdf';

  if (typeof showSaveStatus === 'function') {
    showSaveStatus('⏳ Menyiapkan dokumen PDF...', 'var(--accent)', true);
  }

  // Siapkan container render offscreen / preview
  var container = document.getElementById('pdf-report-render-target');
  if (!container) {
    container = document.createElement('div');
    container.id = 'pdf-report-render-target';
    container.style.position = 'fixed';
    container.style.left = '-9999px';
    container.style.top = '0';
    container.style.width = '850px';
    container.style.zIndex = '-1000';
    document.body.appendChild(container);
  }

  var htmlContent = '';
  if (reportType === 'wealth') {
    htmlContent = buildWealthReportHtml();
  } else if (reportType === 'consolidated') {
    htmlContent = buildConsolidatedReportHtml();
  } else {
    htmlContent = buildPortfolioReportHtml();
  }

  container.innerHTML = htmlContent;

  var docElement = container.querySelector('#pdf-report-document') || container;

  // Gunakan html2pdf jika tersedia
  if (typeof html2pdf !== 'undefined') {
    var opt = {
      margin: [10, 10, 10, 10],
      filename: filename,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true, letterRendering: true },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
    };

    html2pdf().set(opt).from(docElement).save().then(function() {
      if (typeof showSaveStatus === 'function') {
        showSaveStatus('✓ Dokumen PDF (' + filename + ') berhasil diunduh', 'var(--green)');
      }
    }).catch(function(err) {
      console.warn('html2pdf notice:', err);
      // Fallback ke window.print
      window.print();
    });
  } else {
    // Fallback: Cetak via browser print
    window.print();
    if (typeof showSaveStatus === 'function') {
      showSaveStatus('✓ Dialog Cetak / Simpan PDF browser terbuka', 'var(--green)');
    }
  }
}

function printPdfReport(type) {
  var reportType = type || MW_CURRENT_REPORT_TYPE || 'portfolio';
  var htmlContent = (reportType === 'wealth')
    ? buildWealthReportHtml()
    : (reportType === 'consolidated' ? buildConsolidatedReportHtml() : buildPortfolioReportHtml());

  var printWin = window.open('', '_blank');
  if (printWin) {
    printWin.document.write('<!DOCTYPE html><html><head><title>Cetak Laporan Money Watch Pro</title>'
      + '<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@500;700&display=swap" rel="stylesheet">'
      + '<style>@page{size:A4 portrait;margin:10mm}body{margin:0;padding:0;background:#fff;font-family:\'Inter\',sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}</style>'
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

// ══════════════════════════════════════════════════════════════════════════
// 5. INTERACTIVE MODAL DIALOG PREVIEW
// ══════════════════════════════════════════════════════════════════════════
function mwOpenPdfReportModal(defaultType) {
  if (defaultType) MW_CURRENT_REPORT_TYPE = defaultType;
  var modal = document.getElementById('pdf-report-modal');
  if (!modal) {
    _createPdfReportModalDom();
    modal = document.getElementById('pdf-report-modal');
  }
  _mwUpdatePdfModalTabs();
  _mwRenderPdfModalPreview();
  if (modal) modal.style.display = 'flex';
}

function mwClosePdfReportModal() {
  var modal = document.getElementById('pdf-report-modal');
  if (modal) modal.style.display = 'none';
}

function mwSetReportType(type) {
  MW_CURRENT_REPORT_TYPE = type;
  _mwUpdatePdfModalTabs();
  _mwRenderPdfModalPreview();
}

function _mwUpdatePdfModalTabs() {
  ['portfolio', 'wealth', 'consolidated'].forEach(function(t) {
    var tab = document.getElementById('pdf-tab-' + t);
    if (tab) {
      if (t === MW_CURRENT_REPORT_TYPE) {
        tab.style.background = 'var(--accent)';
        tab.style.color = '#000000';
        tab.style.fontWeight = '700';
      } else {
        tab.style.background = 'rgba(255,255,255,0.05)';
        tab.style.color = 'var(--text2)';
        tab.style.fontWeight = '500';
      }
    }
  });
}

function _mwRenderPdfModalPreview() {
  var previewBox = document.getElementById('pdf-modal-preview-area');
  if (!previewBox) return;

  var htmlContent = '';
  if (MW_CURRENT_REPORT_TYPE === 'wealth') {
    htmlContent = buildWealthReportHtml();
  } else if (MW_CURRENT_REPORT_TYPE === 'consolidated') {
    htmlContent = buildConsolidatedReportHtml();
  } else {
    htmlContent = buildPortfolioReportHtml();
  }

  previewBox.innerHTML = htmlContent;
}

function _createPdfReportModalDom() {
  var el = document.createElement('div');
  el.id = 'pdf-report-modal';
  el.style.display = 'none';
  el.style.position = 'fixed';
  el.style.inset = '0';
  el.style.background = 'rgba(0,0,0,0.75)';
  el.style.zIndex = '1100';
  el.style.alignItems = 'center';
  el.style.justifyContent = 'center';
  el.style.backdropFilter = 'blur(6px)';

  el.innerHTML = '<div style="background:var(--bg2);border:1px solid var(--border2);border-radius:14px;width:920px;max-width:96vw;max-height:92vh;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 24px 70px rgba(0,0,0,0.6)">'
    // Modal Header
    + '<div style="padding:16px 20px;border-bottom:1px solid var(--border2);display:flex;justify-content:space-between;align-items:center;background:var(--bg3)">'
    + '  <div>'
    + '    <div style="font-size:15px;font-weight:700;color:var(--text);display:flex;align-items:center;gap:8px">'
    + '      <span>📄 Pusat Laporan &amp; Ekspor Dokumen PDF</span>'
    + '      <span class="badge b-up" style="font-size:9px">Resmi &amp; Siap Cetak</span>'
    + '    </div>'
    + '    <div style="font-size:11px;color:var(--text3);margin-top:2px">Unduh ringkasan portofolio investasi dan neraca kekayaan bersih untuk pelaporan berkala</div>'
    + '  </div>'
    + '  <button onclick="mwClosePdfReportModal()" aria-label="Tutup dialog" style="background:none;border:none;color:var(--text3);font-size:20px;cursor:pointer;line-height:1;padding:4px">✕</button>'
    + '</div>'

    // Toolbar Options & Tabs
    + '<div style="padding:12px 20px;border-bottom:1px solid var(--border2);display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;background:rgba(0,0,0,0.2)">'
    + '  <div style="display:flex;gap:6px;flex-wrap:wrap">'
    + '    <button id="pdf-tab-portfolio" class="btn btn-xs" onclick="mwSetReportType(\'portfolio\')" style="font-size:11px;padding:6px 12px;border-radius:6px;cursor:pointer">📊 Ringkasan Portofolio Saham</button>'
    + '    <button id="pdf-tab-wealth" class="btn btn-xs" onclick="mwSetReportType(\'wealth\')" style="font-size:11px;padding:6px 12px;border-radius:6px;cursor:pointer">💼 Neraca Kekayaan Bersih (Net Worth)</button>'
    + '    <button id="pdf-tab-consolidated" class="btn btn-xs" onclick="mwSetReportType(\'consolidated\')" style="font-size:11px;padding:6px 12px;border-radius:6px;cursor:pointer">📑 Laporan Konsolidasi Lengkap</button>'
    + '  </div>'
    + '  <div style="display:flex;align-items:center;gap:8px">'
    + '    <button class="btn btn-ghost btn-xs" onclick="printPdfReport()" style="font-size:11px;gap:5px;border-color:var(--border2)">🖨️ Pratinjau Cetak</button>'
    + '    <button class="btn btn-blue btn-xs" onclick="downloadPdfReport()" style="font-size:11px;gap:6px;font-weight:700">📥 Unduh Berkas PDF (.pdf)</button>'
    + '  </div>'
    + '</div>'

    // Live Paper Preview Container
    + '<div style="flex:1;overflow-y:auto;padding:20px;background:#1e222d;display:flex;justify-content:center">'
    + '  <div id="pdf-modal-preview-area" style="box-shadow:0 12px 36px rgba(0,0,0,0.4);border-radius:4px;overflow:hidden;background:#ffffff"></div>'
    + '</div>'

    // Modal Footer
    + '<div style="padding:10px 20px;border-top:1px solid var(--border2);display:flex;justify-content:space-between;align-items:center;font-size:11px;color:var(--text3);background:var(--bg2)">'
    + '  <div>Format: <b>A4 Portrait (300 DPI High Definition)</b> · Kompatibel dengan pembaca PDF &amp; Cetak Fisik</div>'
    + '  <button class="btn btn-ghost btn-xs" onclick="mwClosePdfReportModal()">Tutup</button>'
    + '</div>'
    + '</div>';

  document.body.appendChild(el);
}

// ── Global window shortcuts ──
window.mwOpenPdfReportModal = mwOpenPdfReportModal;
window.mwClosePdfReportModal = mwClosePdfReportModal;
window.downloadPdfReport = downloadPdfReport;
window.printPdfReport = printPdfReport;
window.mwSetReportType = mwSetReportType;
