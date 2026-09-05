// ══════════════════════════════════════════════════════════════════════════
// MONEY WATCH PRO — CONSOLIDATED MASTER REPORT & EXPORT SUITE (v7.0)
// Laporan Tunggal Terkonsolidasi: Portofolio, Multi-Aset, Kas, Liabilitas & FIRE
// ══════════════════════════════════════════════════════════════════════════

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

function _mwCsvEsc(val) {
  if (val === undefined || val === null) return '""';
  var str = String(val);
  if (str.includes('"') || str.includes(';') || str.includes('\n') || str.includes('\r')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return '"' + str + '"';
}

// ══════════════════════════════════════════════════════════════════════════
// MASTER BUILDER: 1 LAPORAN FINANSIAL TUNGGAL TERKONSOLIDASI (ALL-IN-ONE)
// ══════════════════════════════════════════════════════════════════════════
function buildConsolidatedReportHtml() {
  var porto = (typeof getPortfolio === 'function') ? getPortfolio() : [];
  var crypto = (typeof getCryptoPortfolio === 'function') ? getCryptoPortfolio() : [];
  var etf = (typeof getEtfPortfolio === 'function') ? getEtfPortfolio() : [];
  var rd = (typeof getRdPortfolio === 'function') ? getRdPortfolio() : [];
  var rdn = (typeof calcRdnBalance === 'function') ? calcRdnBalance() : 0;
  var a = (typeof wCalc === 'function') ? wCalc() : {
    aset: 0, net: 0, debt: { t: 0, c: 0 }, invTotal: 0, bankTotal: 0,
    piu: { sisa: 0, pokok: 0, terbayar: 0 }, div12: 0, passive: 0,
    emMonths: 0, score: 70, inv: { saham: 0, crypto: 0, etf: 0, rd: 0, kas: 0 }
  };
  var user = (typeof _currentUser !== 'undefined' && _currentUser && _currentUser.email) ? _currentUser.email : 'Investor Tamu (Demo)';

  var totalCost = porto.reduce(function(acc, p) { return acc + (p.cost || 0); }, 0);
  var totalMv = porto.reduce(function(acc, p) { return acc + (p.mv || 0); }, 0);
  var totalUnreal = totalMv - totalCost;
  var totalRetPct = totalCost > 0 ? (totalUnreal / totalCost * 100) : 0;

  var cryptoMv = crypto.reduce(function(acc, c) { return acc + (c.mv || 0); }, 0);
  var etfMv = etf.reduce(function(acc, e) { return acc + (e.mvIdr || 0); }, 0);
  var rdMv = rd.reduce(function(acc, r) { return acc + (r.mv || 0); }, 0);

  var ihsgVal = (typeof ihsg !== 'undefined' && ihsg > 0) ? ihsg.toLocaleString('id-ID') : '7.150,00';
  var usdVal = (typeof usdIdr !== 'undefined' && usdIdr > 0) ? 'Rp ' + Math.round(usdIdr).toLocaleString('id-ID') : 'Rp 16.200';

  var dr = a.aset > 0 ? (a.debt.t / a.aset * 100) : 0;
  var grade = a.score >= 75 ? 'Sangat Sehat (Excellent)' : a.score >= 55 ? 'Baik (Good)' : 'Perlu Perhatian (Fair)';
  var monthlyExp = (typeof WEALTH !== 'undefined' && WEALTH.expense) ? WEALTH.expense : 10000000;
  var monthlyInc = (typeof WEALTH !== 'undefined' && WEALTH.income) ? WEALTH.income : 0;
  var annualExp = monthlyExp * 12;
  var fireTarget = annualExp * 25;
  var firePct = fireTarget > 0 ? Math.min(100, a.net / fireTarget * 100) : 0;
  var fireShortfall = Math.max(0, fireTarget - a.net);
  var swrMonthly = a.net * 0.04 / 12;
  var swrCoverage = monthlyExp > 0 ? (swrMonthly / monthlyExp * 100) : 0;

  var currentYear = new Date().getFullYear();
  var cagr = 0.12;
  var infl = 0.04;
  var monthlyInv = (monthlyInc > monthlyExp) ? (monthlyInc - monthlyExp) : (5 * 1000000);

  // Saham Rows
  var sortedPorto = porto.slice().sort(function(x, y) { return y.mv - x.mv; });
  var stockRows = '';
  if (sortedPorto.length > 0) {
    stockRows = sortedPorto.map(function(p, idx) {
      var weight = a.invTotal > 0 ? (p.mv / a.invTotal * 100).toFixed(1) + '%' : '0%';
      var pnlColor = p.unreal >= 0 ? '#047857' : '#b91c1c';
      var strat = (typeof stratOf === 'function') ? stratOf(p.ticker) : ((typeof DB !== 'undefined' && DB[p.ticker] && DB[p.ticker].tradeType) || 'Core Long');
      var sector = (p.info && p.info.sector) || (typeof DB !== 'undefined' && DB[p.ticker] && DB[p.ticker].sector) || 'Lainnya';
      var name = (p.info && p.info.name) || (typeof DB !== 'undefined' && DB[p.ticker] && DB[p.ticker].name) || p.ticker;

      return '<tr style="border-bottom:1px solid #e2e8f0;' + (idx % 2 === 1 ? 'background:#f8fafc;' : '') + '">'
        + '<td style="padding:6px 8px;font-weight:700;font-family:monospace;color:#0f172a">' + p.ticker + '</td>'
        + '<td style="padding:6px 8px;color:#334155;font-size:10px;max-width:130px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + name + '<br><span style="color:#64748b;font-size:9px">' + sector + '</span></td>'
        + '<td style="padding:6px 8px;text-align:right;font-family:monospace">' + (p.lot || 0).toLocaleString('id-ID') + '</td>'
        + '<td style="padding:6px 8px;text-align:right;font-family:monospace">' + _mwPdfRp(p.avg, '') + '</td>'
        + '<td style="padding:6px 8px;text-align:right;font-family:monospace;font-weight:600">' + _mwPdfRp(p.mp, '') + '</td>'
        + '<td style="padding:6px 8px;text-align:right;font-family:monospace">' + _mwPdfRp(p.cost) + '</td>'
        + '<td style="padding:6px 8px;text-align:right;font-family:monospace;font-weight:700;color:#0f172a">' + _mwPdfRp(p.mv) + '</td>'
        + '<td style="padding:6px 8px;text-align:right;font-family:monospace;font-weight:700;color:' + pnlColor + '">' + _mwPdfRp(p.unreal) + '<br><span style="font-size:9px">' + _mwPdfPct(p.ret) + '</span></td>'
        + '<td style="padding:6px 8px;text-align:center;font-family:monospace;font-size:9.5px">' + weight + '</td>'
        + '<td style="padding:6px 8px;text-align:center"><span style="display:inline-block;padding:2px 5px;border-radius:4px;font-size:8.5px;font-weight:600;background:#eff6ff;color:#1d4ed8;border:1px solid #bfdbfe">' + strat + '</span></td>'
        + '</tr>';
    }).join('');
  } else {
    stockRows = '<tr><td colspan="10" style="text-align:center;padding:16px;color:#64748b">Belum ada posisi saham aktif dalam portofolio.</td></tr>';
  }

  // Multi-Asset Rows
  var multiAssetRows = '';
  if (crypto.length > 0) {
    crypto.forEach(function(c) {
      var sigBadge = '';
      if (typeof getCryptoTechnicalSignal === 'function') {
        try {
          var sig = getCryptoTechnicalSignal(c.symbol);
          if (sig && sig.badgeText) sigBadge = ' <span style="font-size:8.5px;padding:1px 4px;border-radius:3px;background:#fef3c7;color:#92400e;font-weight:600">' + sig.badgeText + '</span>';
        } catch(e) {}
      }
      multiAssetRows += '<tr style="border-bottom:1px solid #e2e8f0"><td style="padding:5px 8px;font-weight:700;font-family:monospace">🪙 ' + c.symbol + sigBadge + '</td><td style="padding:5px 8px">Crypto Assets</td><td style="padding:5px 8px;text-align:right;font-family:monospace">' + (c.qty || 0) + '</td><td style="padding:5px 8px;text-align:right;font-family:monospace;font-weight:700">' + _mwPdfRp(c.mv) + '</td><td style="padding:5px 8px;text-align:right;font-family:monospace;' + (c.unreal >= 0 ? 'color:#047857' : 'color:#b91c1c') + '">' + _mwPdfRp(c.unreal) + ' (' + _mwPdfPct(c.ret) + ')</td></tr>';
    });
  }
  if (etf.length > 0) {
    etf.forEach(function(e) {
      multiAssetRows += '<tr style="border-bottom:1px solid #e2e8f0"><td style="padding:5px 8px;font-weight:700;font-family:monospace">📊 ' + e.ticker + '</td><td style="padding:5px 8px">US ETF Global</td><td style="padding:5px 8px;text-align:right;font-family:monospace">' + (e.shares || 0) + ' lbr</td><td style="padding:5px 8px;text-align:right;font-family:monospace;font-weight:700">' + _mwPdfRp(e.mvIdr) + '</td><td style="padding:5px 8px;text-align:right;font-family:monospace;' + (e.unrealIdr >= 0 ? 'color:#047857' : 'color:#b91c1c') + '">' + _mwPdfRp(e.unrealIdr) + '</td></tr>';
    });
  }
  if (rd.length > 0) {
    rd.forEach(function(r) {
      multiAssetRows += '<tr style="border-bottom:1px solid #e2e8f0"><td style="padding:5px 8px;font-weight:700;font-family:monospace">🏛️ ' + r.name + '</td><td style="padding:5px 8px">Reksa Dana</td><td style="padding:5px 8px;text-align:right;font-family:monospace">' + (r.units || 0) + ' unit</td><td style="padding:5px 8px;text-align:right;font-family:monospace;font-weight:700">' + _mwPdfRp(r.mv) + '</td><td style="padding:5px 8px;text-align:right;font-family:monospace;' + (r.unreal >= 0 ? 'color:#047857' : 'color:#b91c1c') + '">' + _mwPdfRp(r.unreal) + '</td></tr>';
    });
  }

  // Bank Rows
  var bankRows = '';
  if (typeof WEALTH !== 'undefined' && WEALTH.bank && WEALTH.bank.length > 0) {
    bankRows = WEALTH.bank.map(function(b) {
      var noAcc = MW_PDF_INCLUDE_PRIVACY_MASK ? '•••• ' + (b.no ? String(b.no).slice(-4) : '0000') : (b.no || '-');
      return '<tr style="border-bottom:1px solid #e2e8f0">'
        + '<td style="padding:5px 8px;font-weight:600">' + b.bank + '</td>'
        + '<td style="padding:5px 8px;color:#64748b">' + (b.type || 'Tabungan / Giro') + '</td>'
        + '<td style="padding:5px 8px;font-family:monospace;color:#64748b">' + noAcc + '</td>'
        + '<td style="padding:5px 8px;text-align:right;font-family:monospace;font-weight:700">' + _mwPdfRp(b.saldo) + '</td>'
        + '</tr>';
    }).join('');
  } else {
    bankRows = '<tr><td colspan="4" style="text-align:center;padding:10px;color:#64748b">Belum ada akun perbankan tercatat.</td></tr>';
  }

  // Debt Rows
  var debtRows = '';
  if (typeof WEALTH !== 'undefined' && WEALTH.debt && WEALTH.debt.length > 0) {
    debtRows = WEALTH.debt.map(function(d) {
      return '<tr style="border-bottom:1px solid #e2e8f0">'
        + '<td style="padding:5px 8px;font-weight:600;color:#0f172a">' + d.nama + '</td>'
        + '<td style="padding:5px 8px;color:#64748b">' + (d.tipe || 'Pinjaman') + '</td>'
        + '<td style="padding:5px 8px;text-align:right;font-family:monospace">' + (d.bunga ? d.bunga + '% p.a.' : '-') + '</td>'
        + '<td style="padding:5px 8px;text-align:right;font-family:monospace;color:#b91c1c;font-weight:600">' + _mwPdfRp(d.cicilan) + '/bln</td>'
        + '<td style="padding:5px 8px;text-align:right;font-family:monospace;font-weight:700;color:#b91c1c">' + _mwPdfRp(d.outstanding) + '</td>'
        + '</tr>';
    }).join('');
  } else {
    debtRows = '<tr><td colspan="5" style="text-align:center;padding:10px;color:#047857;font-weight:600">✓ Tidak ada catatan kewajiban / hutang aktif.</td></tr>';
  }

  // FIRE Scenarios Rows
  var fireScenariosHtml = [
    { label: '🌱 Lean FIRE (70%)', desc: 'Pengeluaran esensial & hidup hemat', cost: monthlyExp * 0.7, tgt: fireTarget * 0.7 },
    { label: '🎯 Regular FIRE (100%)', desc: 'Gaya hidup sama persis saat ini', cost: monthlyExp, tgt: fireTarget },
    { label: '💎 Fat FIRE (200%)', desc: 'Gaya hidup makmur berlebih & leluasa', cost: monthlyExp * 2, tgt: fireTarget * 2 },
    { label: '☕ Barista FIRE (50%)', desc: '50% pasif modal + 50% freelance/passion', cost: monthlyExp * 0.5, tgt: fireTarget * 0.5 }
  ].map(function(s) {
    var isReached = a.net >= s.tgt;
    var status = isReached ? '<span style="color:#047857;font-weight:700">✓ Tercapai</span>' : (a.net / s.tgt * 100).toFixed(1) + '%';
    return '<tr style="border-bottom:1px solid #e2e8f0;' + (s.label.includes('Regular') ? 'background:#f8fafc;' : '') + '">'
      + '<td style="padding:5px 8px;font-weight:700">' + s.label + '</td>'
      + '<td style="padding:5px 8px;color:#64748b;font-size:9.5px">' + s.desc + '</td>'
      + '<td style="padding:5px 8px;text-align:right;font-family:monospace">' + _mwPdfRp(s.cost) + '</td>'
      + '<td style="padding:5px 8px;text-align:right;font-family:monospace;font-weight:700">' + _mwPdfRp(s.tgt) + '</td>'
      + '<td style="padding:5px 8px;text-align:center">' + status + '</td>'
      + '</tr>';
  }).join('');

  // Proyeksi Compound 20 Tahun Rows
  var projYears = [1, 3, 5, 10, 15, 20];
  var projRows = projYears.map(function(y) {
    var nw = a.net;
    for (var i = 0; i < y; i++) {
      nw = nw * (1 + cagr) + (monthlyInv * 12);
    }
    var realVal = nw / Math.pow(1 + infl, y);
    var targetFuture = fireTarget * Math.pow(1 + infl, y);
    var isReached = nw >= targetFuture;
    return '<tr style="border-bottom:1px solid #e2e8f0">'
      + '<td style="padding:5px 8px;font-weight:600">Thn ke-' + y + ' (' + (currentYear + y) + ')</td>'
      + '<td style="padding:5px 8px;text-align:right;font-family:monospace;font-weight:700;color:#0f172a">' + _mwPdfRp(nw) + '</td>'
      + '<td style="padding:5px 8px;text-align:right;font-family:monospace;color:#047857">' + _mwPdfRp(realVal) + '</td>'
      + '<td style="padding:5px 8px;text-align:center;font-size:9.5px">' + (isReached ? '<span style="color:#047857;font-weight:700">✓ Reached</span>' : '<span style="color:#64748b">' + (nw / targetFuture * 100).toFixed(1) + '%</span>') + '</td>'
      + '</tr>';
  }).join('');

  return '<div id="pdf-report-document" style="width:100%;max-width:880px;margin:0 auto;background:#ffffff;color:#0f172a;font-family:\'Inter\',system-ui,sans-serif;padding:32px;box-sizing:border-box;line-height:1.45;font-size:10.5px">'
    // ── MASTER DOCUMENT HEADER ──
    + '<div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #0f172a;padding-bottom:14px;margin-bottom:16px">'
    + '  <div>'
    + '    <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">'
    + '      <div style="width:26px;height:26px;background:#0f172a;border-radius:5px;display:flex;align-items:center;justify-content:center;color:#38bdf8;font-weight:800;font-size:14px">MW</div>'
    + '      <div style="font-size:17px;font-weight:800;letter-spacing:-0.3px;color:#0f172a">MONEY WATCH <span style="color:#2563eb">PRO</span></div>'
    + '    </div>'
    + '    <div style="font-size:13px;font-weight:800;color:#0f172a;text-transform:uppercase;letter-spacing:0.5px">Laporan Konsolidasi Finansial Terpadu</div>'
    + '    <div style="font-size:9.5px;color:#64748b;margin-top:2px">Dokumen Resmi Family Office: Hasil Kinerja, Portofolio Saham, Multi-Aset, Kas &amp; Sasaran FIRE · ' + _mwPdfDateTime() + '</div>'
    + '  </div>'
    + '  <div style="text-align:right">'
    + '    <div style="font-size:9.5px;color:#64748b">Pemilik Laporan</div>'
    + '    <div style="font-size:11.5px;font-weight:700;color:#0f172a">' + user + '</div>'
    + '    <div style="font-size:9px;color:#64748b;margin-top:3px">Benchmark IHSG: <b>' + ihsgVal + '</b> · Kurs USD: <b>' + usdVal + '</b></div>'
    + '  </div>'
    + '</div>'

    // ── EXECUTIVE HERO CALLOUT ──
    + '<div style="background:#0f172a;color:#ffffff;border-radius:8px;padding:16px 20px;margin-bottom:16px;display:flex;justify-content:space-between;align-items:center">'
    + '  <div>'
    + '    <div style="font-size:9.5px;font-weight:700;color:#94a3b8;letter-spacing:0.8px;text-transform:uppercase">TOTAL KEKAYAAN BERSIH (NET WORTH)</div>'
    + '    <div style="font-size:24px;font-weight:900;font-family:monospace;color:#38bdf8;margin-top:3px">' + _mwPdfRp(a.net) + '</div>'
    + '    <div style="font-size:10px;color:#cbd5e1;margin-top:3px">Aset Bruto: <b>' + _mwPdfRp(a.aset) + '</b> · Total Liabilitas: <b style="color:#f87171">' + _mwPdfRp(a.debt.t) + '</b> (' + dr.toFixed(1) + '% Debt Ratio)</div>'
    + '  </div>'
    + '  <div style="display:flex;gap:18px;border-left:1px solid #334155;padding-left:18px">'
    + '    <div style="text-align:right">'
    + '      <div style="font-size:9px;color:#94a3b8;text-transform:uppercase">Wealth Health Score</div>'
    + '      <div style="font-size:15px;font-weight:800;font-family:monospace;color:#38bdf8;margin-top:2px">' + a.score + '/100</div>'
    + '      <div style="font-size:8.5px;color:#94a3b8">' + grade + '</div>'
    + '    </div>'
    + '    <div style="text-align:right">'
    + '      <div style="font-size:9px;color:#94a3b8;text-transform:uppercase">Kesiapan FIRE</div>'
    + '      <div style="font-size:15px;font-weight:800;font-family:monospace;color:#34d399;margin-top:2px">' + firePct.toFixed(1) + '%</div>'
    + '      <div style="font-size:8.5px;color:#94a3b8">Target: ' + _mwPdfRp(fireTarget) + '</div>'
    + '    </div>'
    + '  </div>'
    + '</div>'

    // ── 4 KPI CARDS ──
    + '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:18px">'
    + '  <div style="background:#f8fafc;border:1px solid #cbd5e1;border-radius:6px;padding:10px">'
    + '    <div style="font-size:9px;font-weight:700;color:#64748b;text-transform:uppercase">Portofolio Investasi</div>'
    + '    <div style="font-size:14px;font-weight:800;font-family:monospace;color:#0f172a;margin-top:3px">' + _mwPdfRp(a.invTotal) + '</div>'
    + '    <div style="font-size:9px;color:#64748b;margin-top:2px">' + (a.aset > 0 ? (a.invTotal / a.aset * 100).toFixed(1) : 0) + '% dari total aset</div>'
    + '  </div>'
    + '  <div style="background:#f8fafc;border:1px solid #cbd5e1;border-radius:6px;padding:10px">'
    + '    <div style="font-size:9px;font-weight:700;color:#64748b;text-transform:uppercase">Kas &amp; Rekening Bank</div>'
    + '    <div style="font-size:14px;font-weight:800;font-family:monospace;color:#0f172a;margin-top:3px">' + _mwPdfRp(a.bankTotal) + '</div>'
    + '    <div style="font-size:9px;color:#047857;margin-top:2px">Dana Darurat: ' + a.emMonths.toFixed(1) + ' bln</div>'
    + '  </div>'
    + '  <div style="background:' + (totalUnreal >= 0 ? '#ecfdf5' : '#fef2f2') + ';border:1px solid ' + (totalUnreal >= 0 ? '#a7f3d0' : '#fecaca') + ';border-radius:6px;padding:10px">'
    + '    <div style="font-size:9px;font-weight:700;color:' + (totalUnreal >= 0 ? '#065f46' : '#991b1b') + ';text-transform:uppercase">Unrealized Gain Saham</div>'
    + '    <div style="font-size:14px;font-weight:800;font-family:monospace;color:' + (totalUnreal >= 0 ? '#047857' : '#b91c1c') + ';margin-top:3px">' + _mwPdfRp(totalUnreal) + '</div>'
    + '    <div style="font-size:9px;font-weight:700;color:' + (totalUnreal >= 0 ? '#047857' : '#b91c1c') + ';margin-top:2px">' + _mwPdfPct(totalRetPct) + ' Floating Return</div>'
    + '  </div>'
    + '  <div style="background:#f8fafc;border:1px solid #cbd5e1;border-radius:6px;padding:10px">'
    + '    <div style="font-size:9px;font-weight:700;color:#64748b;text-transform:uppercase">Estimasi Passive Income</div>'
    + '    <div style="font-size:14px;font-weight:800;font-family:monospace;color:#047857;margin-top:3px">' + _mwPdfRp(a.passive / 12) + '<span style="font-size:9px">/bln</span></div>'
    + '    <div style="font-size:9px;color:#64748b;margin-top:2px">Dividen + Bunga instrumen</div>'
    + '  </div>'
    + '</div>'

    // ── SEKSI I: NERACA ASET & ALOKASI KELAS ASET ──
    + '<div style="margin-bottom:18px">'
    + '  <div style="font-size:11px;font-weight:700;color:#0f172a;margin-bottom:6px;display:flex;justify-content:space-between;align-items:center">'
    + '    <span>1. NERACA ASSET &amp; ALOKASI KEKAYAAN</span>'
    + '    <span style="font-size:9.5px;color:#64748b">Total Aset Bruto: <b>' + _mwPdfRp(a.aset) + '</b></span>'
    + '  </div>'
    + '  <table style="width:100%;border-collapse:collapse;font-size:10px;text-align:left;border:1px solid #cbd5e1">'
    + '    <thead>'
    + '      <tr style="background:#f1f5f9;border-bottom:2px solid #cbd5e1;color:#334155">'
    + '        <th style="padding:6px 8px">KOMPONEN ASET</th>'
    + '        <th style="padding:6px 8px">KETERANGAN / INSTRUMEN</th>'
    + '        <th style="padding:6px 8px;text-align:right">NILAI NOMINAL (IDR)</th>'
    + '        <th style="padding:6px 8px;text-align:center">ALOKASI %</th>'
    + '      </tr>'
    + '    </thead>'
    + '    <tbody>'
    + '      <tr style="border-bottom:1px solid #e2e8f0"><td style="padding:5px 8px;font-weight:600">📈 Saham IDX</td><td style="padding:5px 8px;color:#64748b">Portofolio ekuitas bursa efek (' + sortedPorto.length + ' emiten)</td><td style="padding:5px 8px;text-align:right;font-family:monospace;font-weight:700">' + _mwPdfRp(a.inv.saham) + '</td><td style="padding:5px 8px;text-align:center;font-family:monospace">' + (a.aset > 0 ? (a.inv.saham / a.aset * 100).toFixed(1) : 0) + '%</td></tr>'
    + '      <tr style="border-bottom:1px solid #e2e8f0"><td style="padding:5px 8px;font-weight:600">💰 Kas RDN &amp; Sekuritas</td><td style="padding:5px 8px;color:#64748b">Saldo kas likuid rekening dana nasabah</td><td style="padding:5px 8px;text-align:right;font-family:monospace;font-weight:700">' + _mwPdfRp(a.inv.kas) + '</td><td style="padding:5px 8px;text-align:center;font-family:monospace">' + (a.aset > 0 ? (a.inv.kas / a.aset * 100).toFixed(1) : 0) + '%</td></tr>'
    + '      <tr style="border-bottom:1px solid #e2e8f0"><td style="padding:5px 8px;font-weight:600">🏦 Tabungan &amp; Saldo Bank</td><td style="padding:5px 8px;color:#64748b">' + ((typeof WEALTH !== 'undefined' && WEALTH.bank) ? WEALTH.bank.length : 0) + ' rekening perbankan</td><td style="padding:5px 8px;text-align:right;font-family:monospace;font-weight:700">' + _mwPdfRp(a.bankTotal) + '</td><td style="padding:5px 8px;text-align:center;font-family:monospace">' + (a.aset > 0 ? (a.bankTotal / a.aset * 100).toFixed(1) : 0) + '%</td></tr>'
    + (a.inv.crypto > 0 ? '<tr style="border-bottom:1px solid #e2e8f0"><td style="padding:5px 8px;font-weight:600">🪙 Crypto Assets</td><td style="padding:5px 8px;color:#64748b">Bitcoin &amp; Altcoins</td><td style="padding:5px 8px;text-align:right;font-family:monospace;font-weight:700">' + _mwPdfRp(a.inv.crypto) + '</td><td style="padding:5px 8px;text-align:center;font-family:monospace">' + (a.aset > 0 ? (a.inv.crypto / a.aset * 100).toFixed(1) : 0) + '%</td></tr>' : '')
    + (a.inv.etf > 0 ? '<tr style="border-bottom:1px solid #e2e8f0"><td style="padding:5px 8px;font-weight:600">📊 US ETF</td><td style="padding:5px 8px;color:#64748b">Pasar modal global Amerika</td><td style="padding:5px 8px;text-align:right;font-family:monospace;font-weight:700">' + _mwPdfRp(a.inv.etf) + '</td><td style="padding:5px 8px;text-align:center;font-family:monospace">' + (a.aset > 0 ? (a.inv.etf / a.aset * 100).toFixed(1) : 0) + '%</td></tr>' : '')
    + (a.inv.rd > 0 ? '<tr style="border-bottom:1px solid #e2e8f0"><td style="padding:5px 8px;font-weight:600">🏛️ Reksa Dana</td><td style="padding:5px 8px;color:#64748b">Pasar Uang / Pendapatan Tetap</td><td style="padding:5px 8px;text-align:right;font-family:monospace;font-weight:700">' + _mwPdfRp(a.inv.rd) + '</td><td style="padding:5px 8px;text-align:center;font-family:monospace">' + (a.aset > 0 ? (a.inv.rd / a.aset * 100).toFixed(1) : 0) + '%</td></tr>' : '')
    + ((typeof WEALTH !== 'undefined' && WEALTH.deposito > 0) ? '<tr style="border-bottom:1px solid #e2e8f0"><td style="padding:5px 8px;font-weight:600">📑 Deposito Berjangka</td><td style="padding:5px 8px;color:#64748b">Asumsi bunga 5.5% p.a.</td><td style="padding:5px 8px;text-align:right;font-family:monospace;font-weight:700">' + _mwPdfRp(WEALTH.deposito) + '</td><td style="padding:5px 8px;text-align:center;font-family:monospace">' + (a.aset > 0 ? (WEALTH.deposito / a.aset * 100).toFixed(1) : 0) + '%</td></tr>' : '')
    + ((typeof WEALTH !== 'undefined' && WEALTH.obligasi > 0) ? '<tr style="border-bottom:1px solid #e2e8f0"><td style="padding:5px 8px;font-weight:600">📜 SBN &amp; Obligasi</td><td style="padding:5px 8px;color:#64748b">Surat Berharga Negara (kupon 6.5%)</td><td style="padding:5px 8px;text-align:right;font-family:monospace;font-weight:700">' + _mwPdfRp(WEALTH.obligasi) + '</td><td style="padding:5px 8px;text-align:center;font-family:monospace">' + (a.aset > 0 ? (WEALTH.obligasi / a.aset * 100).toFixed(1) : 0) + '%</td></tr>' : '')
    + ((typeof WEALTH !== 'undefined' && WEALTH.emas > 0) ? '<tr style="border-bottom:1px solid #e2e8f0"><td style="padding:5px 8px;font-weight:600">🥇 Logam Mulia / Emas</td><td style="padding:5px 8px;color:#64748b">Safe haven fisik / digital</td><td style="padding:5px 8px;text-align:right;font-family:monospace;font-weight:700">' + _mwPdfRp(WEALTH.emas) + '</td><td style="padding:5px 8px;text-align:center;font-family:monospace">' + (a.aset > 0 ? (WEALTH.emas / a.aset * 100).toFixed(1) : 0) + '%</td></tr>' : '')
    + (a.piu.sisa > 0 ? '<tr style="border-bottom:1px solid #e2e8f0"><td style="padding:5px 8px;font-weight:600">🤝 Piutang Berjalan</td><td style="padding:5px 8px;color:#64748b">Hak tagih outstanding</td><td style="padding:5px 8px;text-align:right;font-family:monospace;font-weight:700">' + _mwPdfRp(a.piu.sisa) + '</td><td style="padding:5px 8px;text-align:center;font-family:monospace">' + (a.aset > 0 ? (a.piu.sisa / a.aset * 100).toFixed(1) : 0) + '%</td></tr>' : '')
    + '    </tbody>'
    + '    <tfoot>'
    + '      <tr style="background:#f8fafc;font-weight:700;border-top:2px solid #0f172a;font-family:monospace">'
    + '        <td colspan="2" style="padding:6px 8px;color:#0f172a">TOTAL ASET BRUTO</td>'
    + '        <td style="padding:6px 8px;text-align:right;color:#0f172a">' + _mwPdfRp(a.aset) + '</td>'
    + '        <td style="padding:6px 8px;text-align:center">100,0%</td>'
    + '      </tr>'
    + '    </tfoot>'
    + '  </table>'
    + '</div>'

    // ── SEKSI II: RINCIAN PORTOFOLIO SAHAM IDX ──
    + '<div style="margin-bottom:18px">'
    + '  <div style="font-size:11px;font-weight:700;color:#0f172a;margin-bottom:6px;display:flex;justify-content:space-between;align-items:center">'
    + '    <span>2. RINCIAN PORTOFOLIO SAHAM IDX (' + sortedPorto.length + ' Emiten)</span>'
    + '    <span style="font-size:9.5px;color:#64748b">Modal Tertanam: <b>' + _mwPdfRp(totalCost) + '</b></span>'
    + '  </div>'
    + '  <table style="width:100%;border-collapse:collapse;font-size:9.5px;text-align:left;border:1px solid #cbd5e1">'
    + '    <thead>'
    + '      <tr style="background:#f1f5f9;border-bottom:2px solid #cbd5e1;color:#334155">'
    + '        <th style="padding:6px 8px">KODE</th>'
    + '        <th style="padding:6px 8px">EMITEN &amp; SEKTOR</th>'
    + '        <th style="padding:6px 8px;text-align:right">LOT</th>'
    + '        <th style="padding:6px 8px;text-align:right">AVG</th>'
    + '        <th style="padding:6px 8px;text-align:right">HARGA</th>'
    + '        <th style="padding:6px 8px;text-align:right">MODAL</th>'
    + '        <th style="padding:6px 8px;text-align:right">NILAI PASAR</th>'
    + '        <th style="padding:6px 8px;text-align:right">UNREALIZED P&amp;L</th>'
    + '        <th style="padding:6px 8px;text-align:center">BOBOT</th>'
    + '        <th style="padding:6px 8px;text-align:center">STRATEGI</th>'
    + '      </tr>'
    + '    </thead>'
    + '    <tbody>' + stockRows + '</tbody>'
    + '    <tfoot>'
    + '      <tr style="background:#f8fafc;font-weight:700;border-top:2px solid #0f172a;font-family:monospace">'
    + '        <td colspan="5" style="padding:7px 8px;color:#0f172a;text-align:left">TOTAL KEPEMILIKAN SAHAM</td>'
    + '        <td style="padding:7px 8px;text-align:right">' + _mwPdfRp(totalCost) + '</td>'
    + '        <td style="padding:7px 8px;text-align:right;color:#0f172a">' + _mwPdfRp(totalMv) + '</td>'
    + '        <td style="padding:7px 8px;text-align:right;color:' + (totalUnreal >= 0 ? '#047857' : '#b91c1c') + '">' + _mwPdfRp(totalUnreal) + ' (' + _mwPdfPct(totalRetPct) + ')</td>'
    + '        <td style="padding:7px 8px;text-align:center">' + (a.invTotal > 0 ? (totalMv / a.invTotal * 100).toFixed(1) : 0) + '%</td>'
    + '        <td></td>'
    + '      </tr>'
    + '    </tfoot>'
    + '  </table>'
    + '</div>'

    // Multi-Asset Table if any
    + (multiAssetRows ? (
        '<div style="margin-bottom:18px">'
        + '  <div style="font-size:11px;font-weight:700;color:#0f172a;margin-bottom:6px">PORTOFOLIO MULTI-ASET (CRYPTO, US ETF &amp; REKSA DANA)</div>'
        + '  <table style="width:100%;border-collapse:collapse;font-size:9.5px;text-align:left;border:1px solid #cbd5e1">'
        + '    <thead>'
        + '      <tr style="background:#f1f5f9;border-bottom:2px solid #cbd5e1;color:#334155">'
        + '        <th style="padding:5px 8px">INSTRUMEN</th>'
        + '        <th style="padding:5px 8px">KELAS ASET</th>'
        + '        <th style="padding:5px 8px;text-align:right">KUANTITAS</th>'
        + '        <th style="padding:5px 8px;text-align:right">NILAI PASAR (IDR)</th>'
        + '        <th style="padding:5px 8px;text-align:right">UNREALIZED P&amp;L</th>'
        + '      </tr>'
    + '    </thead>'
        + '    <tbody>' + multiAssetRows + '</tbody>'
        + '  </table>'
        + '</div>'
      ) : '')

    // ── SEKSI III: PERBANKAN & LIABILITAS ──
    + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:18px">'
    + '  <div>'
    + '    <div style="font-size:11px;font-weight:700;color:#0f172a;margin-bottom:6px">3. KAS &amp; REKENING BANK</div>'
    + '    <table style="width:100%;border-collapse:collapse;font-size:9.5px;text-align:left;border:1px solid #cbd5e1">'
    + '      <thead><tr style="background:#f1f5f9;border-bottom:2px solid #cbd5e1;color:#334155"><th style="padding:5px 8px">BANK</th><th style="padding:5px 8px">TIPE</th><th style="padding:5px 8px">NO REKENING</th><th style="padding:5px 8px;text-align:right">SALDO</th></tr></thead>'
    + '      <tbody>' + bankRows + '</tbody>'
    + '    </table>'
    + '  </div>'
    + '  <div>'
    + '    <div style="font-size:11px;font-weight:700;color:#0f172a;margin-bottom:6px">4. LIABILITAS / HUTANG</div>'
    + '    <table style="width:100%;border-collapse:collapse;font-size:9.5px;text-align:left;border:1px solid #cbd5e1">'
    + '      <thead><tr style="background:#f1f5f9;border-bottom:2px solid #cbd5e1;color:#334155"><th style="padding:5px 8px">NAMA</th><th style="padding:5px 8px">TIPE</th><th style="padding:5px 8px;text-align:right">BUNGA</th><th style="padding:5px 8px;text-align:right">CICILAN</th><th style="padding:5px 8px;text-align:right">SISA</th></tr></thead>'
    + '      <tbody>' + debtRows + '</tbody>'
    + '    </table>'
    + '  </div>'
    + '</div>'

    // ── SEKSI IV: ANALISIS & PROYEKSI FIRE ──
    + '<div style="margin-bottom:18px">'
    + '  <div style="font-size:11px;font-weight:700;color:#0f172a;margin-bottom:6px;display:flex;justify-content:space-between;align-items:center">'
    + '    <span>5. ANALISIS &amp; PROYEKSI SASARAN FIRE (PENSIUN DINI)</span>'
    + '    <span style="font-size:9.5px;color:#64748b">Target Regular: <b>' + _mwPdfRp(fireTarget) + '</b> (Kesiapan: <b>' + firePct.toFixed(1) + '%</b>)</span>'
    + '  </div>'
    + '  <table style="width:100%;border-collapse:collapse;font-size:9.5px;text-align:left;border:1px solid #cbd5e1;margin-bottom:10px">'
    + '    <thead>'
    + '      <tr style="background:#f1f5f9;border-bottom:2px solid #cbd5e1;color:#334155">'
    + '        <th style="padding:5px 8px">SKENARIO FIRE</th>'
    + '        <th style="padding:5px 8px">GAYA HIDUP &amp; ASUMSI</th>'
    + '        <th style="padding:5px 8px;text-align:right">BIAYA HIDUP/BLN</th>'
    + '        <th style="padding:5px 8px;text-align:right">TARGET DANA (25×)</th>'
    + '        <th style="padding:5px 8px;text-align:center">STATUS CAPAIAN</th>'
    + '      </tr>'
    + '    </thead>'
    + '    <tbody>' + fireScenariosHtml + '</tbody>'
    + '  </table>'
    + '  <div style="font-size:10px;font-weight:700;color:#0f172a;margin:8px 0 4px">Simulasi Compound 20 Tahun (Return 12% p.a., Inflasi 4%)</div>'
    + '  <table style="width:100%;border-collapse:collapse;font-size:9.5px;text-align:left;border:1px solid #cbd5e1">'
    + '    <thead><tr style="background:#f1f5f9;border-bottom:2px solid #cbd5e1;color:#334155"><th style="padding:5px 8px">HORIZON</th><th style="padding:5px 8px;text-align:right">NILAI NOMINAL</th><th style="padding:5px 8px;text-align:right">NILAI RIIL (INFLASI 4%)</th><th style="padding:5px 8px;text-align:center">STATUS TARGET</th></tr></thead>'
    + '    <tbody>' + projRows + '</tbody>'
    + '  </table>'
    + '</div>'

    // ── FOOTER & LEGAL DISCLAIMER ──
    + '<div style="margin-top:20px;border-top:1px solid #cbd5e1;padding-top:10px;display:flex;justify-content:space-between;align-items:center;font-size:9px;color:#64748b">'
    + '  <div>Laporan Konsolidasi Finansial Terpadu Money Watch Pro · Metode Moving Average Cost Basis, Live Feeds, &amp; FIRE Engine 4% Rule</div>'
    + '  <div>ID: MW-FULL-' + Date.now().toString().slice(-6) + '</div>'
    + '</div>'
    + '</div>';
}

// ══════════════════════════════════════════════════════════════════════════
// EXPORT SPREADSHEET / CSV TERKONSOLIDASI (ALL-IN-ONE)
// ══════════════════════════════════════════════════════════════════════════
function exportConsolidatedPortfolioCsv() {
  var dateStamp = new Date().toISOString().slice(0, 10);
  var user = (typeof _currentUser !== 'undefined' && _currentUser && _currentUser.email) ? _currentUser.email : 'Investor Tamu';
  var filename = 'MoneyWatchPro_Laporan_Konsolidasi_Lengkap_' + dateStamp + '.csv';

  var porto = (typeof getPortfolio === 'function') ? getPortfolio() : [];
  var crypto = (typeof getCryptoPortfolio === 'function') ? getCryptoPortfolio() : [];
  var etf = (typeof getEtfPortfolio === 'function') ? getEtfPortfolio() : [];
  var rd = (typeof getRdPortfolio === 'function') ? getRdPortfolio() : [];
  var rdn = (typeof calcRdnBalance === 'function') ? calcRdnBalance() : 0;
  var a = (typeof wCalc === 'function') ? wCalc() : {
    aset: 0, net: 0, debt: { t: 0, c: 0 }, invTotal: 0, bankTotal: 0,
    piu: { sisa: 0, pokok: 0, terbayar: 0 }, div12: 0, passive: 0,
    emMonths: 0, score: 70, inv: { saham: 0, crypto: 0, etf: 0, rd: 0, kas: 0 }
  };

  var monthlyExp = (typeof WEALTH !== 'undefined' && WEALTH.expense) ? WEALTH.expense : 10000000;
  var annualExp = monthlyExp * 12;
  var fireTarget = annualExp * 25;
  var firePct = fireTarget > 0 ? (a.net / fireTarget * 100) : 0;
  var fireShortfall = Math.max(0, fireTarget - a.net);
  var swr4Monthly = a.net * 0.04 / 12;

  var totalCostStock = porto.reduce(function(acc, p) { return acc + (p.cost || 0); }, 0);
  var totalMvStock = porto.reduce(function(acc, p) { return acc + (p.mv || 0); }, 0);
  var totalUnrealStock = totalMvStock - totalCostStock;
  var totalRetStockPct = totalCostStock > 0 ? (totalUnrealStock / totalCostStock * 100) : 0;

  var csvLines = [];
  var bom = '\uFEFF';

  csvLines.push('MONEY WATCH PRO — LAPORAN KONSOLIDASI FINANSIAL TERPADU');
  csvLines.push('Tanggal Ekspor:;' + new Date().toLocaleString('id-ID'));
  csvLines.push('Pemilik Akun:;' + user);
  csvLines.push('');

  csvLines.push('=== 1. RINGKASAN EKSEKUTIF & NERACA KEKAYAAN BERSIH ===');
  csvLines.push('Metrik Finansial;Nilai Nominal (IDR);Keterangan / Rasio');
  csvLines.push('Total Kekayaan Bersih (Net Worth);' + Math.round(a.net) + ';' + _mwCsvEsc('Aset Bruto dikurangi Seluruh Liabilitas'));
  csvLines.push('Total Aset Bruto;' + Math.round(a.aset) + ';' + _mwCsvEsc('Seluruh Portofolio, Kas Bank, Emas, SBN & Piutang'));
  csvLines.push('Total Liabilitas / Hutang;' + Math.round(a.debt.t) + ';' + _mwCsvEsc('Debt Ratio: ' + (a.aset > 0 ? (a.debt.t / a.aset * 100).toFixed(1) : 0) + '%'));
  csvLines.push('Total Portofolio Investasi;' + Math.round(a.invTotal) + ';' + _mwCsvEsc('Saham, Crypto, ETF, Reksa Dana & Kas RDN'));
  csvLines.push('Total Kas & Rekening Bank;' + Math.round(a.bankTotal) + ';' + _mwCsvEsc('Dana Darurat mencukupi ' + a.emMonths.toFixed(1) + ' bulan'));
  csvLines.push('Unrealized P&L Saham IDX;' + Math.round(totalUnrealStock) + ';' + _mwCsvEsc('Floating Return: ' + totalRetStockPct.toFixed(2) + '%'));
  csvLines.push('Dividen Saham (12 Bulan Terakhir);' + Math.round(a.div12) + ';Dividen tunai terkumpul');
  csvLines.push('Estimasi Passive Income Bulanan;' + Math.round(a.passive / 12) + ';Dividen + Bunga per bulan');
  csvLines.push('Wealth Health Score;' + a.score + '/100;' + _mwCsvEsc(a.score >= 75 ? 'Sangat Sehat' : a.score >= 55 ? 'Baik' : 'Perlu Perhatian'));
  csvLines.push('');

  csvLines.push('=== 2. RINCIAN PORTOFOLIO SAHAM IDX ===');
  csvLines.push('Kode;Nama Emiten;Sektor;Lot;Lembar;Harga Beli Avg (IDR);Harga Pasar (IDR);Modal Tertanam (IDR);Nilai Pasar (IDR);Floating P&L (IDR);Return (%);Bobot (%);Strategi');
  if (porto.length > 0) {
    porto.forEach(function(p) {
      var strat = (typeof stratOf === 'function') ? stratOf(p.ticker) : ((typeof DB !== 'undefined' && DB[p.ticker] && DB[p.ticker].tradeType) || 'Core Long');
      var sector = (p.info && p.info.sector) || (typeof DB !== 'undefined' && DB[p.ticker] && DB[p.ticker].sector) || 'Lainnya';
      var name = (p.info && p.info.name) || (typeof DB !== 'undefined' && DB[p.ticker] && DB[p.ticker].name) || p.ticker;
      var weight = a.invTotal > 0 ? (p.mv / a.invTotal * 100).toFixed(1) : '0';
      csvLines.push([
        _mwCsvEsc(p.ticker),
        _mwCsvEsc(name),
        _mwCsvEsc(sector),
        p.lot || 0,
        (p.lot || 0) * 100,
        Math.round(p.avg || 0),
        Math.round(p.mp || 0),
        Math.round(p.cost || 0),
        Math.round(p.mv || 0),
        Math.round(p.unreal || 0),
        (p.ret || 0).toFixed(2) + '%',
        weight + '%',
        _mwCsvEsc(strat)
      ].join(';'));
    });
  } else {
    csvLines.push('Belum ada data posisi saham aktif;;;;;;;;;;;');
  }
  csvLines.push('');

  csvLines.push('=== 3. PORTOFOLIO MULTI-ASET (CRYPTO, US ETF, REKSA DANA) ===');
  csvLines.push('Kategori;Instrumen / Simbol;Kuantitas / Lembar;Harga / NAB Satuan;Nilai Pasar (IDR);Unrealized P&L (IDR);Return (%);Keterangan');
  if (crypto.length > 0) {
    crypto.forEach(function(c) {
      csvLines.push(['Crypto Assets', _mwCsvEsc(c.symbol), c.qty || 0, Math.round(c.priceIdr || 0), Math.round(c.mv || 0), Math.round(c.unreal || 0), (c.ret || 0).toFixed(2) + '%', 'Crypto'].join(';'));
    });
  }
  if (etf.length > 0) {
    etf.forEach(function(e) {
      csvLines.push(['US ETF Global', _mwCsvEsc(e.ticker), e.shares || 0, '$' + (e.priceUsd || 0).toFixed(2), Math.round(e.mvIdr || 0), Math.round(e.unrealIdr || 0), (e.retPct || 0).toFixed(2) + '%', 'US Equities'].join(';'));
    });
  }
  if (rd.length > 0) {
    rd.forEach(function(r) {
      csvLines.push(['Reksa Dana', _mwCsvEsc(r.name), r.units || 0, Math.round(r.navCur || 0), Math.round(r.mv || 0), Math.round(r.unreal || 0), (r.ret || 0).toFixed(2) + '%', _mwCsvEsc(r.type || 'Pasar Uang')].join(';'));
    });
  }
  if ((typeof WEALTH !== 'undefined') && WEALTH.emas > 0) {
    csvLines.push(['Logam Mulia', 'Emas Batangan', '-', '-', Math.round(WEALTH.emas), 0, '0%', 'Safe Haven'].join(';'));
  }
  if ((typeof WEALTH !== 'undefined') && WEALTH.deposito > 0) {
    csvLines.push(['Deposito', 'Deposito Berjangka', '-', 'Bunga 5.5%', Math.round(WEALTH.deposito), 0, '5.50%', 'Perbankan'].join(';'));
  }
  if ((typeof WEALTH !== 'undefined') && WEALTH.obligasi > 0) {
    csvLines.push(['Surat Berharga', 'SBN / Obligasi', '-', 'Kupon 6.5%', Math.round(WEALTH.obligasi), 0, '6.50%', 'Fixed Income'].join(';'));
  }
  csvLines.push('');

  csvLines.push('=== 4. KAS, REKENING MULTI-BANK & LIKUIDITAS ===');
  csvLines.push('Institusi / Bank;Tipe Rekening;Nomor Rekening;Saldo (IDR);Kategori Likuiditas');
  csvLines.push(['Kas RDN Sekuritas', 'Rekening Dana Nasabah', 'RDN Saham', Math.round(rdn), 'Likuid Pasar Modal'].join(';'));
  if (typeof WEALTH !== 'undefined' && WEALTH.bank && WEALTH.bank.length > 0) {
    WEALTH.bank.forEach(function(b) {
      var noAcc = MW_PDF_INCLUDE_PRIVACY_MASK ? '•••• ' + (b.no ? String(b.no).slice(-4) : '0000') : (b.no || '-');
      csvLines.push([_mwCsvEsc(b.bank), _mwCsvEsc(b.type || 'Tabungan / Giro'), _mwCsvEsc(noAcc), Math.round(b.saldo || 0), 'Kas Perbankan'].join(';'));
    });
  }
  csvLines.push('');

  csvLines.push('=== 5. NERACA LIABILITAS & HUTANG ===');
  csvLines.push('Nama Kewajiban;Jenis Pinjaman;Suku Bunga (% p.a.);Cicilan Bulanan (IDR);Sisa Pokok Hutang (IDR)');
  if (typeof WEALTH !== 'undefined' && WEALTH.debt && WEALTH.debt.length > 0) {
    WEALTH.debt.forEach(function(d) {
      csvLines.push([_mwCsvEsc(d.nama), _mwCsvEsc(d.tipe || 'Pinjaman'), (d.bunga ? d.bunga + '%' : '-'), Math.round(d.cicilan || 0), Math.round(d.outstanding || 0)].join(';'));
    });
  } else {
    csvLines.push('Tidak ada catatan liabilitas / hutang aktif;;;;');
  }
  csvLines.push('');

  csvLines.push('=== 6. ANALISIS SASARAN & PROYEKSI FIRE ===');
  csvLines.push('Parameter FIRE;Nilai;Keterangan');
  csvLines.push('Pengeluaran Bulanan Saat Ini;' + Math.round(monthlyExp) + ';' + _mwCsvEsc('Basis Rule of 25×'));
  csvLines.push('Target Regular FIRE Number (25×);' + Math.round(fireTarget) + ';' + _mwCsvEsc('Target dana pensiun mandiri'));
  csvLines.push('Total Net Worth Terkumpul;' + Math.round(a.net) + ';-');
  csvLines.push('Persentase Kesiapan FIRE;' + firePct.toFixed(2) + '%;' + _mwCsvEsc(firePct >= 100 ? 'Bebas Finansial Tercapai' : 'Kekurangan: Rp ' + Math.round(fireShortfall).toLocaleString('id-ID')));
  csvLines.push('Safe Withdrawal Rate (4% Rule/Bulan);' + Math.round(swr4Monthly) + ';' + _mwCsvEsc('Arus kas pasif per bulan'));
  csvLines.push('');
  csvLines.push('Skenario FIRE;Faktor;Biaya Hidup/Bln (IDR);Target Dana 25× (IDR);Status Capaian');
  csvLines.push(['Lean FIRE', '70%', Math.round(monthlyExp * 0.7), Math.round(fireTarget * 0.7), (a.net >= fireTarget * 0.7 ? 'Tercapai' : (a.net / (fireTarget * 0.7) * 100).toFixed(1) + '%')].join(';'));
  csvLines.push(['Regular FIRE', '100%', Math.round(monthlyExp), Math.round(fireTarget), (a.net >= fireTarget ? 'Tercapai' : firePct.toFixed(1) + '%')].join(';'));
  csvLines.push(['Fat FIRE', '200%', Math.round(monthlyExp * 2), Math.round(fireTarget * 2), (a.net >= fireTarget * 2 ? 'Tercapai' : (a.net / (fireTarget * 2) * 100).toFixed(1) + '%')].join(';'));
  csvLines.push(['Barista FIRE', '50%', Math.round(monthlyExp * 0.5), Math.round(fireTarget * 0.5), (a.net >= fireTarget * 0.5 ? 'Tercapai' : (a.net / (fireTarget * 0.5) * 100).toFixed(1) + '%')].join(';'));

  var csvContent = bom + csvLines.join('\r\n');
  var blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  var url = URL.createObjectURL(blob);
  var link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);

  if (typeof showSaveStatus === 'function') {
    showSaveStatus('✓ Berkas Spreadsheet Konsolidasi (' + filename + ') berhasil diunduh', 'var(--green)');
  }
}

// ══════════════════════════════════════════════════════════════════════════
// SALIN RINGKASAN EKSEKUTIF KONSOLIDASI (MARKDOWN)
// ══════════════════════════════════════════════════════════════════════════
function copyPortfolioSummaryMarkdown() {
  var user = (typeof _currentUser !== 'undefined' && _currentUser && _currentUser.email) ? _currentUser.email : 'Investor';
  var dateStr = _mwPdfDate();
  var porto = (typeof getPortfolio === 'function') ? getPortfolio() : [];
  var a = (typeof wCalc === 'function') ? wCalc() : {
    aset: 0, net: 0, debt: { t: 0, c: 0 }, invTotal: 0, bankTotal: 0,
    piu: { sisa: 0, pokok: 0, terbayar: 0 }, div12: 0, passive: 0,
    emMonths: 0, score: 70, inv: { saham: 0, crypto: 0, etf: 0, rd: 0, kas: 0 }
  };
  var monthlyExp = (typeof WEALTH !== 'undefined' && WEALTH.expense) ? WEALTH.expense : 10000000;
  var fireTarget = monthlyExp * 12 * 25;
  var firePct = fireTarget > 0 ? (a.net / fireTarget * 100) : 0;

  var totalCostStock = porto.reduce(function(acc, p) { return acc + (p.cost || 0); }, 0);
  var totalMvStock = porto.reduce(function(acc, p) { return acc + (p.mv || 0); }, 0);
  var totalUnrealStock = totalMvStock - totalCostStock;
  var totalRetStockPct = totalCostStock > 0 ? (totalUnrealStock / totalCostStock * 100) : 0;

  var topHoldings = porto.slice().sort(function(x, y) { return y.mv - x.mv; }).slice(0, 5).map(function(p) {
    return '- **' + p.ticker + '**: ' + _mwPdfRp(p.mv) + ' (' + (p.ret >= 0 ? '+' : '') + p.ret.toFixed(2) + '%)';
  }).join('\n');

  var md = '# 📊 Laporan Konsolidasi Finansial — Money Watch Pro\n'
    + '**Pemilik**: ' + user + ' | **Tanggal**: ' + dateStr + '\n\n'
    + '## 💎 Ringkasan Kinerja & Net Worth\n'
    + '- **Total Net Worth**: ' + _mwPdfRp(a.net) + '\n'
    + '- **Total Aset Bruto**: ' + _mwPdfRp(a.aset) + '\n'
    + '- **Total Liabilitas / Hutang**: ' + _mwPdfRp(a.debt.t) + '\n'
    + '- **Portofolio Investasi**: ' + _mwPdfRp(a.invTotal) + '\n'
    + '- **Kas & Rekening Bank**: ' + _mwPdfRp(a.bankTotal) + ' (Dana Darurat: ' + a.emMonths.toFixed(1) + ' bulan)\n'
    + '- **Unrealized Gain Saham**: ' + _mwPdfRp(totalUnrealStock) + ' (' + (totalRetStockPct >= 0 ? '+' : '') + totalRetStockPct.toFixed(2) + '%)\n'
    + '- **Dividen 12 Bulan**: ' + _mwPdfRp(a.div12) + '\n'
    + '- **Wealth Health Score**: ' + a.score + '/100\n\n'
    + '## 🔥 Status Sasaran FIRE (Pensiun Dini)\n'
    + '- **Biaya Hidup Bulanan**: ' + _mwPdfRp(monthlyExp) + '/bulan\n'
    + '- **Target FIRE Number (25×)**: ' + _mwPdfRp(fireTarget) + '\n'
    + '- **Kesiapan FIRE**: ' + firePct.toFixed(1) + '%\n'
    + '- **4% Safe Withdrawal Rate**: ' + _mwPdfRp(a.net * 0.04 / 12) + '/bulan\n\n'
    + '## 🏆 Top Kepemilikan Saham\n'
    + (topHoldings || '- Belum ada posisi saham aktif') + '\n\n'
    + '_Generated via Money Watch Pro Terminal_';

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(md).then(function() {
      if (typeof showSaveStatus === 'function') {
        showSaveStatus('✓ Ringkasan konsolidasi berhasil disalin ke clipboard', 'var(--green)');
      }
    }).catch(function() {
      _mwFallbackCopyText(md);
    });
  } else {
    _mwFallbackCopyText(md);
  }
}

function _mwFallbackCopyText(text) {
  var textArea = document.createElement('textarea');
  textArea.value = text;
  textArea.style.position = 'fixed';
  textArea.style.left = '-9999px';
  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();
  try {
    document.execCommand('copy');
    if (typeof showSaveStatus === 'function') {
      showSaveStatus('✓ Ringkasan konsolidasi berhasil disalin ke clipboard', 'var(--green)');
    }
  } catch (err) {
    alert('Gagal menyalin: ' + err.message);
  }
  document.body.removeChild(textArea);
}

// ══════════════════════════════════════════════════════════════════════════
// MASTER JSON BACKUP
// ══════════════════════════════════════════════════════════════════════════
function downloadConsolidatedJsonBackup() {
  if (typeof downloadBackup === 'function') {
    downloadBackup();
    return;
  }
  if (typeof MW_SETTINGS !== 'undefined' && typeof MW_SETTINGS.exportJsonBackup === 'function') {
    MW_SETTINGS.exportJsonBackup();
    return;
  }
  if (typeof wExport === 'function') {
    wExport();
  }
}

// ══════════════════════════════════════════════════════════════════════════
// UNDUH DOKUMEN PDF & CETAK LAPORAN TUNGGAL TERKONSOLIDASI
// ══════════════════════════════════════════════════════════════════════════
function downloadPdfReport() {
  var dateStamp = new Date().toISOString().slice(0, 10);
  var filename = 'MoneyWatchPro_Laporan_Konsolidasi_Lengkap_' + dateStamp + '.pdf';

  if (typeof showSaveStatus === 'function') {
    showSaveStatus('⏳ Menyiapkan dokumen PDF konsolidasi...', 'var(--accent)', true);
  }

  var container = document.getElementById('pdf-report-render-target');
  if (!container) {
    container = document.createElement('div');
    container.id = 'pdf-report-render-target';
    container.style.position = 'fixed';
    container.style.left = '-9999px';
    container.style.top = '0';
    container.style.width = '880px';
    container.style.zIndex = '-1000';
    document.body.appendChild(container);
  }

  container.innerHTML = buildConsolidatedReportHtml();

  var docElement = container.querySelector('#pdf-report-document') || container;

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
        showSaveStatus('✓ Dokumen PDF Konsolidasi (' + filename + ') berhasil diunduh', 'var(--green)');
      }
    }).catch(function(err) {
      console.warn('html2pdf fallback to print:', err);
      printPdfReport();
    });
  } else {
    printPdfReport();
  }
}

function printPdfReport() {
  var htmlContent = buildConsolidatedReportHtml();

  var printWin = window.open('', '_blank');
  if (printWin) {
    printWin.document.write('<!DOCTYPE html><html><head><title>Laporan Konsolidasi Finansial Terpadu — Money Watch Pro</title>'
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

// ══════════════════════════════════════════════════════════════════════════
// MODAL DIALOG PREVIEW LAPORAN TUNGGAL KONSOLIDASI
// ══════════════════════════════════════════════════════════════════════════
function mwOpenPdfReportModal() {
  var modal = document.getElementById('pdf-report-modal');
  if (!modal) {
    _createPdfReportModalDom();
    modal = document.getElementById('pdf-report-modal');
  }
  _mwRenderPdfModalPreview();
  if (modal) modal.style.display = 'flex';
}

function mwClosePdfReportModal() {
  var modal = document.getElementById('pdf-report-modal');
  if (modal) modal.style.display = 'none';
}

function _mwRenderPdfModalPreview() {
  var previewBox = document.getElementById('pdf-modal-preview-area');
  if (!previewBox) return;
  previewBox.innerHTML = buildConsolidatedReportHtml();
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

  el.innerHTML = '<div style="background:var(--bg2);border:1px solid var(--border2);border-radius:14px;width:960px;max-width:96vw;max-height:92vh;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 24px 70px rgba(0,0,0,0.6)">'
    // Modal Header
    + '<div style="padding:16px 20px;border-bottom:1px solid var(--border2);display:flex;justify-content:space-between;align-items:center;background:var(--bg3)">'
    + '  <div>'
    + '    <div style="font-size:15px;font-weight:700;color:var(--text);display:flex;align-items:center;gap:8px">'
    + '      <span>📑 Laporan Konsolidasi Finansial Terpadu</span>'
    + '      <span class="badge b-up" style="font-size:9.5px">Semua dalam 1 Laporan Terpadu</span>'
    + '    </div>'
    + '    <div style="font-size:11px;color:var(--text3);margin-top:2px">Seluruh komponen disatukan: Hasil Kinerja, Portofolio Saham &amp; Multi-Aset, Kas Bank, Hutang &amp; Sasaran FIRE</div>'
    + '  </div>'
    + '  <button onclick="mwClosePdfReportModal()" aria-label="Tutup dialog" style="background:none;border:none;color:var(--text3);font-size:20px;cursor:pointer;line-height:1;padding:4px">✕</button>'
    + '</div>'

    // Export Action Toolbar
    + '<div style="padding:10px 20px;border-bottom:1px solid var(--border2);display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;background:var(--bg3)">'
    + '  <div style="display:flex;align-items:center;gap:8px;color:var(--text2);font-size:11.5px">'
    + '    <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#10b981"></span>'
    + '    <span><b>1 Dokumen Lengkap</b> (Neraca + Portofolio + Kas + FIRE)</span>'
    + '  </div>'
    + '  <!-- Direct 1-Click Export Buttons -->'
    + '  <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">'
    + '    <button class="btn btn-green btn-xs" onclick="exportConsolidatedPortfolioCsv()" title="Unduh Semua Data Konsolidasi dalam 1 File Spreadsheet / CSV (Hasil, Saham, Crypto, ETF, Kas & FIRE)" style="font-size:11px;gap:5px;font-weight:700;background:#059669;color:#fff;border-color:#047857">📊 Ekspor Excel / CSV</button>'
    + '    <button class="btn btn-blue btn-xs" onclick="downloadPdfReport()" title="Unduh Laporan Konsolidasi Dokumen PDF Resmi" style="font-size:11px;gap:5px;font-weight:700">📥 Unduh PDF</button>'
    + '    <button class="btn btn-ghost btn-xs" onclick="copyPortfolioSummaryMarkdown()" title="Salin Ringkasan Konsolidasi ke Clipboard (Markdown)" style="font-size:11px;gap:5px;border-color:var(--border2)">📋 Salin Teks</button>'
    + '    <button class="btn btn-ghost btn-xs" onclick="printPdfReport()" title="Cetak Dokumen Laporan Fisik / Printer" style="font-size:11px;gap:4px;border-color:var(--border2)">🖨️ Cetak</button>'
    + '  </div>'
    + '</div>'

    // Live Paper Preview Container
    + '<div style="flex:1;overflow-y:auto;padding:20px;background:#1e222d;display:flex;justify-content:center">'
    + '  <div id="pdf-modal-preview-area" style="box-shadow:0 12px 36px rgba(0,0,0,0.4);border-radius:4px;overflow:hidden;background:#ffffff"></div>'
    + '</div>'

    // Modal Footer
    + '<div style="padding:10px 20px;border-top:1px solid var(--border2);display:flex;justify-content:space-between;align-items:center;font-size:11px;color:var(--text3);background:var(--bg2)">'
    + '  <div>Format Berkas: <b>Excel (.csv UTF-8)</b> · <b>Dokumen A4 (.pdf)</b> · <b>Master Cadangan (.json)</b></div>'
    + '  <div style="display:flex;gap:8px">'
    + '    <button class="btn btn-ghost btn-xs" onclick="downloadConsolidatedJsonBackup()" title="Unduh Cadangan Master JSON Lengkap">💾 Master JSON</button>'
    + '    <button class="btn btn-ghost btn-xs" onclick="mwClosePdfReportModal()">Tutup</button>'
    + '  </div>'
    + '</div>'
    + '</div>';

  document.body.appendChild(el);
}

// ── Global window shortcuts ──
window.mwOpenPdfReportModal = mwOpenPdfReportModal;
window.mwClosePdfReportModal = mwClosePdfReportModal;
window.downloadPdfReport = downloadPdfReport;
window.printPdfReport = printPdfReport;
window.exportConsolidatedPortfolioCsv = exportConsolidatedPortfolioCsv;
window.copyPortfolioSummaryMarkdown = copyPortfolioSummaryMarkdown;
window.downloadConsolidatedJsonBackup = downloadConsolidatedJsonBackup;
window.buildConsolidatedReportHtml = buildConsolidatedReportHtml;
// Aliases for compatibility
window.buildFireReportHtml = buildConsolidatedReportHtml;
window.buildPortfolioReportHtml = buildConsolidatedReportHtml;
window.buildWealthReportHtml = buildConsolidatedReportHtml;
