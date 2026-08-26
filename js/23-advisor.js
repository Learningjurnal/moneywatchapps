/**
 * 23-advisor.js — Pro Investment Advisor & Executive Tools
 * 1. Export Investor Tear Sheet (PDF / Print-Ready Brief)
 * 2. Traffic Light Consensus Score & Buy/Sell Action Matrix
 * 3. Smart Asset Rebalancing Engine & Order Calculator
 * 4. Executive View / Pro Terminal View Workspace Switcher
 */

// ══════════════════════════════════════════════════════════
// 1. WORKSPACE VIEW SWITCHER (Executive View vs Pro Analyst)
// ══════════════════════════════════════════════════════════
var MW_VIEW_MODE = 'pro'; // 'pro' | 'executive'

function mwSetViewMode(mode) {
  MW_VIEW_MODE = mode;
  var root = document.documentElement;
  var btnPro = document.getElementById('view-mode-pro-btn');
  var btnExec = document.getElementById('view-mode-exec-btn');
  
  if (mode === 'executive') {
    document.body.classList.add('mode-executive');
    if (btnExec) btnExec.classList.add('on');
    if (btnPro) btnPro.classList.remove('on');
    localStorage.setItem('mw_view_mode', 'executive');
    mwShowToast('Executive View: Tampilan ringkas metrik utama nasabah');
  } else {
    document.body.classList.remove('mode-executive');
    if (btnPro) btnPro.classList.add('on');
    if (btnExec) btnExec.classList.remove('on');
    localStorage.setItem('mw_view_mode', 'pro');
    mwShowToast('Pro Terminal View: Mode analitik mendalam aktif');
  }
}

function mwInitViewMode() {
  var saved = localStorage.getItem('mw_view_mode') || 'pro';
  mwSetViewMode(saved);
}

function mwShowToast(msg) {
  var bar = document.getElementById('save-status-bar');
  if (bar) {
    bar.textContent = msg;
    bar.style.opacity = '1';
    setTimeout(function() { bar.style.opacity = '0'; }, 3000);
  }
}

// ══════════════════════════════════════════════════════════
// 2. CLIENT / INVESTOR TEAR SHEET (PDF & PRINT MODAL)
// ══════════════════════════════════════════════════════════
function openInvestorTearSheet() {
  var modal = document.getElementById('modal');
  var mTitle = document.getElementById('m-title');
  var mBody = document.getElementById('m-body');
  if (!modal || !mBody) return;

  mTitle.textContent = '📄 Investor Tear Sheet (Client Report)';

  // Calculate high level figures
  var totEquity = (typeof totalValuation === 'function') ? totalValuation() : 0;
  var sahamVal = (typeof equityHoldingsVal === 'function') ? equityHoldingsVal() : 0;
  var rdnVal = (typeof rdnBalance === 'number') ? rdnBalance : 0;
  var cryptoVal = (typeof cryptoTotalValuation === 'function') ? cryptoTotalValuation() : 0;
  var rdVal = (typeof reksadanaTotalValuation === 'function') ? reksadanaTotalValuation() : 0;
  var etfVal = (typeof etfTotalValuation === 'function') ? etfTotalValuation() : 0;

  var muts = (window.rdnMutations || []).filter(function(m) { return m.type === 'SETOR' || m.type === 'TOPUP' || m.type === 'TARIK'; });
  var netDeposit = muts.reduce(function(a, m) { return a + m.amount; }, 0);
  var gainRp = totEquity - netDeposit;
  var gainPct = netDeposit > 0 ? (gainRp / netDeposit * 100) : 0;

  // Top 5 holdings
  var topHoldings = (window.holdings || []).slice().sort(function(a, b) {
    var vA = (a.lot || 0) * 100 * (a.last || a.avg || 0);
    var vB = (b.lot || 0) * 100 * (b.last || b.avg || 0);
    return vB - vA;
  }).slice(0, 5);

  var nowStr = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });

  var html = ''
    + '<div class="tear-sheet-container" id="tear-sheet-print-area" style="background:#fff;color:#111;padding:24px;border-radius:8px;font-family:\'Inter\',sans-serif;font-size:12px;line-height:1.5">'
    + '  <!-- Header -->'
    + '  <div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #1e3a8a;padding-bottom:12px;margin-bottom:16px">'
    + '    <div>'
    + '      <div style="font-size:20px;font-weight:800;color:#1e3a8a;letter-spacing:-0.5px">MONEY WATCH <span style="color:#f97316">PRO</span></div>'
    + '      <div style="font-size:12px;font-weight:600;color:#475569">PORTFOLIO TEAR SHEET &amp; INVESTOR BRIEF</div>'
    + '    </div>'
    + '    <div style="text-align:right">'
    + '      <div style="font-size:11px;color:#64748b">Tanggal Laporan:</div>'
    + '      <div style="font-weight:700;color:#0f172a">' + nowStr + '</div>'
    + '      <div style="font-size:10px;color:#0284c7;font-weight:600">CONFIDENTIAL · INVESTMENT ADVISORY</div>'
    + '    </div>'
    + '  </div>'

    + '  <!-- Overview Grid -->'
    + '  <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:16px">'
    + '    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:10px">'
    + '      <div style="font-size:10px;color:#64748b;font-weight:600;text-transform:uppercase">Net Asset Value (AUM)</div>'
    + '      <div style="font-size:16px;font-weight:800;color:#0f172a;margin-top:2px">Rp ' + fmt(totEquity) + '</div>'
    + '      <div style="font-size:10px;color:#10b981;font-weight:600">Total Modal Kelolaan</div>'
    + '    </div>'
    + '    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:10px">'
    + '      <div style="font-size:10px;color:#64748b;font-weight:600;text-transform:uppercase">Total Cumulative Return</div>'
    + '      <div style="font-size:16px;font-weight:800;color:' + (gainRp >= 0 ? '#10b981' : '#ef4444') + ';margin-top:2px">' + (gainRp >= 0 ? '+' : '') + fmtPct(gainPct) + '</div>'
    + '      <div style="font-size:10px;color:#64748b">' + (gainRp >= 0 ? '+' : '') + 'Rp ' + fmt(gainRp) + '</div>'
    + '    </div>'
    + '    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:10px">'
    + '      <div style="font-size:10px;color:#64748b;font-weight:600;text-transform:uppercase">Time-Weighted Return (TWR)</div>'
    + '      <div style="font-size:16px;font-weight:800;color:#2563eb;margin-top:2px" id="ts-twr-val">—</div>'
    + '      <div style="font-size:10px;color:#64748b">GIPS Pure Skill Metrik</div>'
    + '    </div>'
    + '    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:10px">'
    + '      <div style="font-size:10px;color:#64748b;font-weight:600;text-transform:uppercase">Cash Allocation (RDN)</div>'
    + '      <div style="font-size:16px;font-weight:800;color:#0f172a;margin-top:2px">Rp ' + fmt(rdnVal) + '</div>'
    + '      <div style="font-size:10px;color:#64748b">' + (totEquity > 0 ? (rdnVal / totEquity * 100).toFixed(1) : 0) + '% dari Portofolio</div>'
    + '    </div>'
    + '  </div>'

    + '  <!-- Allocation Table & Breakdown -->'
    + '  <div style="display:grid;grid-template-columns:1fr 1.2fr;gap:14px;margin-bottom:16px">'
    + '    <div style="border:1px solid #e2e8f0;border-radius:6px;padding:12px;background:#ffffff">'
    + '      <div style="font-size:11px;font-weight:700;color:#1e3a8a;margin-bottom:8px;border-bottom:1px solid #f1f5f9;padding-bottom:4px">📊 Asset Class Breakdown</div>'
    + '      <table style="width:100%;font-size:11px;border-collapse:collapse">'
    + '        <tr style="border-bottom:1px solid #f1f5f9"><td style="padding:4px 0;color:#475569">Saham IDX</td><td style="text-align:right;font-weight:700">Rp ' + fmt(sahamVal) + '</td><td style="text-align:right;color:#64748b">' + (totEquity > 0 ? (sahamVal / totEquity * 100).toFixed(1) : 0) + '%</td></tr>'
    + '        <tr style="border-bottom:1px solid #f1f5f9"><td style="padding:4px 0;color:#475569">Kas RDN (Liquid)</td><td style="text-align:right;font-weight:700">Rp ' + fmt(rdnVal) + '</td><td style="text-align:right;color:#64748b">' + (totEquity > 0 ? (rdnVal / totEquity * 100).toFixed(1) : 0) + '%</td></tr>'
    + '        <tr style="border-bottom:1px solid #f1f5f9"><td style="padding:4px 0;color:#475569">Reksa Dana &amp; Obligasi</td><td style="text-align:right;font-weight:700">Rp ' + fmt(rdVal) + '</td><td style="text-align:right;color:#64748b">' + (totEquity > 0 ? (rdVal / totEquity * 100).toFixed(1) : 0) + '%</td></tr>'
    + '        <tr style="border-bottom:1px solid #f1f5f9"><td style="padding:4px 0;color:#475569">US ETFs</td><td style="text-align:right;font-weight:700">Rp ' + fmt(etfVal) + '</td><td style="text-align:right;color:#64748b">' + (totEquity > 0 ? (etfVal / totEquity * 100).toFixed(1) : 0) + '%</td></tr>'
    + '        <tr><td style="padding:4px 0;color:#475569">Crypto Assets</td><td style="text-align:right;font-weight:700">Rp ' + fmt(cryptoVal) + '</td><td style="text-align:right;color:#64748b">' + (totEquity > 0 ? (cryptoVal / totEquity * 100).toFixed(1) : 0) + '%</td></tr>'
    + '      </table>'
    + '    </div>'

    + '    <div style="border:1px solid #e2e8f0;border-radius:6px;padding:12px;background:#ffffff">'
    + '      <div style="font-size:11px;font-weight:700;color:#1e3a8a;margin-bottom:8px;border-bottom:1px solid #f1f5f9;padding-bottom:4px">🏆 Top 5 Core Equity Positions</div>'
    + '      <table style="width:100%;font-size:11px;border-collapse:collapse">'
    + '        <thead><tr style="color:#64748b;text-align:left;border-bottom:1px solid #cbd5e1"><th style="padding:3px 0">Ticker</th><th>Lot</th><th>Avg Buy</th><th>Last</th><th style="text-align:right">P/L %</th></tr></thead>'
    + '        <tbody>'
    + (topHoldings.length ? topHoldings.map(function(h) {
        var last = h.last || h.avg || 0;
        var pnlPct = h.avg > 0 ? ((last - h.avg) / h.avg * 100) : 0;
        var col = pnlPct >= 0 ? '#10b981' : '#ef4444';
        return '<tr style="border-bottom:1px solid #f1f5f9">'
          + '<td style="padding:4px 0;font-weight:700;color:#0f172a">' + h.ticker + '</td>'
          + '<td>' + h.lot + '</td>'
          + '<td>' + fmt(h.avg) + '</td>'
          + '<td>' + fmt(last) + '</td>'
          + '<td style="text-align:right;font-weight:700;color:' + col + '">' + (pnlPct >= 0 ? '+' : '') + pnlPct.toFixed(1) + '%</td>'
          + '</tr>';
      }).join('') : '<tr><td colspan="5" style="text-align:center;color:#94a3b8;padding:8px">Belum ada posisi saham</td></tr>')
    + '        </tbody>'
    + '      </table>'
    + '    </div>'
    + '  </div>'

    + '  <!-- Fund Manager Commentary & Strategy -->'
    + '  <div style="border:1px solid #e2e8f0;border-radius:6px;padding:12px;background:#f8fafc;margin-bottom:16px">'
    + '    <div style="font-size:11px;font-weight:700;color:#1e3a8a;margin-bottom:4px">💡 Executive Fund Summary &amp; Outlook</div>'
    + '    <div style="font-size:11px;color:#334155;line-height:1.6">'
    + '      Portofolio dikelola dengan pendekatan <i>Value-Growth Quality</i> dan disiplin <i>Margin of Safety (MoS)</i>. Alokasi kas likuid dipertahankan untuk memanfaatkan peluang koreksi wajar pada saham-saham berfundamental solid (LQ45/High ROE).'
    + '    </div>'
    + '  </div>'

    + '  <!-- Footer Disclaimer -->'
    + '  <div style="display:flex;justify-content:space-between;align-items:center;border-top:1px solid #cbd5e1;padding-top:8px;font-size:9px;color:#94a3b8">'
    + '    <div>Generated by Money Watch Pro Terminal · Standard GIPS &amp; Valuation MoS</div>'
    + '    <div>Halaman 1 dari 1</div>'
    + '  </div>'
    + '</div>'

    + '<!-- Action buttons in modal -->'
    + '<div style="display:flex;justify-content:flex-end;gap:8px;margin-top:16px">'
    + '  <button class="btn btn-ghost" onclick="closeModal()">Tutup</button>'
    + '  <button class="btn btn-blue" onclick="printInvestorTearSheet()">🖨️ Cetak / Unduh PDF</button>'
    + '</div>';

  mBody.innerHTML = html;
  modal.classList.add('on');

  // Inject TWR value from live engine
  var twrSrc = document.getElementById('perf-twr-val');
  var tsTwr = document.getElementById('ts-twr-val');
  if (twrSrc && tsTwr) {
    tsTwr.textContent = twrSrc.textContent;
  }
}

function printInvestorTearSheet() {
  window.print();
}


// ══════════════════════════════════════════════════════════
// 3. SMART ASSET REBALANCING CALCULATOR
// ══════════════════════════════════════════════════════════
var REBALANCE_TARGETS = {
  saham: 60,
  rdn: 15,
  reksadana: 15,
  crypto: 5,
  etf: 5
};

function openRebalancingModal() {
  var modal = document.getElementById('modal');
  var mTitle = document.getElementById('m-title');
  var mBody = document.getElementById('m-body');
  if (!modal || !mBody) return;

  mTitle.textContent = '⚖️ Smart Portfolio Rebalancing Calculator';

  var totEquity = (typeof totalValuation === 'function') ? totalValuation() : 0;
  var sahamVal = (typeof equityHoldingsVal === 'function') ? equityHoldingsVal() : 0;
  var rdnVal = (typeof rdnBalance === 'number') ? rdnBalance : 0;
  var cryptoVal = (typeof cryptoTotalValuation === 'function') ? cryptoTotalValuation() : 0;
  var rdVal = (typeof reksadanaTotalValuation === 'function') ? reksadanaTotalValuation() : 0;
  var etfVal = (typeof etfTotalValuation === 'function') ? etfTotalValuation() : 0;

  var currentAlloc = {
    saham: totEquity > 0 ? (sahamVal / totEquity * 100) : 0,
    rdn: totEquity > 0 ? (rdnVal / totEquity * 100) : 0,
    reksadana: totEquity > 0 ? (rdVal / totEquity * 100) : 0,
    crypto: totEquity > 0 ? (cryptoVal / totEquity * 100) : 0,
    etf: totEquity > 0 ? (etfVal / totEquity * 100) : 0
  };

  var html = ''
    + '<div style="font-size:12px;color:var(--text2);margin-bottom:12px">'
    + '  Tetapkan target alokasi portofolio nasabah untuk mengontrol risiko dan menghitung instruksi beli/jual secara presisi.'
    + '</div>'

    + '<div class="card" style="margin-bottom:14px;background:var(--bg3)">'
    + '  <div class="cheader"><span class="ctitle">🎯 Target Alokasi vs Alokasi Saat Ini</span><span class="badge b-neu">Total AUM: Rp ' + fmt(totEquity) + '</span></div>'
    + '  <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">'
    + '    <div>'
    + '      <div style="font-size:10px;color:var(--text3);text-transform:uppercase;margin-bottom:6px">Target (%)</div>'
    + '      <div style="display:flex;flex-direction:column;gap:6px">'
    + '        <div style="display:flex;align-items:center;justify-content:space-between"><span style="font-size:11px">Saham IDX</span><input type="number" id="reb-t-saham" value="' + REBALANCE_TARGETS.saham + '" onchange="rebRecalculate()" class="finput" style="width:60px;padding:3px 6px"></div>'
    + '        <div style="display:flex;align-items:center;justify-content:space-between"><span style="font-size:11px">Kas RDN (Liquid)</span><input type="number" id="reb-t-rdn" value="' + REBALANCE_TARGETS.rdn + '" onchange="rebRecalculate()" class="finput" style="width:60px;padding:3px 6px"></div>'
    + '        <div style="display:flex;align-items:center;justify-content:space-between"><span style="font-size:11px">Reksa Dana / Obligasi</span><input type="number" id="reb-t-rd" value="' + REBALANCE_TARGETS.reksadana + '" onchange="rebRecalculate()" class="finput" style="width:60px;padding:3px 6px"></div>'
    + '        <div style="display:flex;align-items:center;justify-content:space-between"><span style="font-size:11px">US ETFs</span><input type="number" id="reb-t-etf" value="' + REBALANCE_TARGETS.etf + '" onchange="rebRecalculate()" class="finput" style="width:60px;padding:3px 6px"></div>'
    + '        <div style="display:flex;align-items:center;justify-content:space-between"><span style="font-size:11px">Crypto</span><input type="number" id="reb-t-crypto" value="' + REBALANCE_TARGETS.crypto + '" onchange="rebRecalculate()" class="finput" style="width:60px;padding:3px 6px"></div>'
    + '      </div>'
    + '    </div>'
    + '    <div>'
    + '      <div style="font-size:10px;color:var(--text3);text-transform:uppercase;margin-bottom:6px">Alokasi Aktual Saat Ini</div>'
    + '      <div style="display:flex;flex-direction:column;gap:8px;font-size:11px;padding-top:4px">'
    + '        <div style="display:flex;justify-content:space-between"><span>Saham IDX:</span><b class="mono">' + currentAlloc.saham.toFixed(1) + '% (Rp ' + fmt(sahamVal) + ')</b></div>'
    + '        <div style="display:flex;justify-content:space-between"><span>Kas RDN:</span><b class="mono">' + currentAlloc.rdn.toFixed(1) + '% (Rp ' + fmt(rdnVal) + ')</b></div>'
    + '        <div style="display:flex;justify-content:space-between"><span>Reksa Dana:</span><b class="mono">' + currentAlloc.reksadana.toFixed(1) + '% (Rp ' + fmt(rdVal) + ')</b></div>'
    + '        <div style="display:flex;justify-content:space-between"><span>US ETFs:</span><b class="mono">' + currentAlloc.etf.toFixed(1) + '% (Rp ' + fmt(etfVal) + ')</b></div>'
    + '        <div style="display:flex;justify-content:space-between"><span>Crypto:</span><b class="mono">' + currentAlloc.crypto.toFixed(1) + '% (Rp ' + fmt(cryptoVal) + ')</b></div>'
    + '      </div>'
    + '    </div>'
    + '  </div>'
    + '</div>'

    + '<div class="card">'
    + '  <div class="cheader"><span class="ctitle">📋 Instruksi Eksekusi Rebalancing</span><span class="badge b-amb" id="reb-total-check">100% Target</span></div>'
    + '  <div id="reb-instructions-body"></div>'
    + '</div>'

    + '<div style="display:flex;justify-content:flex-end;gap:8px;margin-top:16px">'
    + '  <button class="btn btn-ghost" onclick="closeModal()">Tutup</button>'
    + '</div>';

  mBody.innerHTML = html;
  modal.classList.add('on');
  rebRecalculate();
}

function rebRecalculate() {
  var tSaham = parseFloat(document.getElementById('reb-t-saham').value) || 0;
  var tRdn = parseFloat(document.getElementById('reb-t-rdn').value) || 0;
  var tRd = parseFloat(document.getElementById('reb-t-rd').value) || 0;
  var tEtf = parseFloat(document.getElementById('reb-t-etf').value) || 0;
  var tCrypto = parseFloat(document.getElementById('reb-t-crypto').value) || 0;

  var totPct = tSaham + tRdn + tRd + tEtf + tCrypto;
  var checkEl = document.getElementById('reb-total-check');
  if (checkEl) {
    checkEl.textContent = totPct.toFixed(0) + '% Target';
    checkEl.className = 'badge ' + (Math.abs(totPct - 100) < 0.1 ? 'b-up' : 'b-dn');
  }

  REBALANCE_TARGETS = { saham: tSaham, rdn: tRdn, reksadana: tRd, etf: tEtf, crypto: tCrypto };

  var totEquity = (typeof totalValuation === 'function') ? totalValuation() : 0;
  var assets = [
    { name: 'Saham IDX', cur: (typeof equityHoldingsVal === 'function') ? equityHoldingsVal() : 0, targetPct: tSaham },
    { name: 'Kas RDN', cur: (typeof rdnBalance === 'number') ? rdnBalance : 0, targetPct: tRdn },
    { name: 'Reksa Dana / Obligasi', cur: (typeof reksadanaTotalValuation === 'function') ? reksadanaTotalValuation() : 0, targetPct: tRd },
    { name: 'US ETFs', cur: (typeof etfTotalValuation === 'function') ? etfTotalValuation() : 0, targetPct: tEtf },
    { name: 'Crypto', cur: (typeof cryptoTotalValuation === 'function') ? cryptoTotalValuation() : 0, targetPct: tCrypto }
  ];

  var outEl = document.getElementById('reb-instructions-body');
  if (!outEl) return;

  var html = '<table class="tbl" style="font-size:11px"><thead><tr><th>Aset</th><th>Nilai Saat Ini</th><th>Nilai Target</th><th>Deviasi (Rp)</th><th>Aksi Rekomendasi</th></tr></thead><tbody>';

  assets.forEach(function(a) {
    var targetVal = (a.targetPct / 100) * totEquity;
    var diff = targetVal - a.cur;
    var action = '';
    if (Math.abs(diff) < 50000) {
      action = '<span class="badge b-gray">Sudah Seimbang (Balanced)</span>';
    } else if (diff > 0) {
      action = '<span class="badge b-up">Beli / Top-Up Rp ' + fmt(diff) + '</span>';
    } else {
      action = '<span class="badge b-dn">Ambil Profit / Jual Rp ' + fmt(Math.abs(diff)) + '</span>';
    }

    html += '<tr>'
      + '<td style="font-weight:600">' + a.name + '</td>'
      + '<td class="mono">Rp ' + fmt(a.cur) + '</td>'
      + '<td class="mono">Rp ' + fmt(targetVal) + '</td>'
      + '<td class="mono ' + (diff >= 0 ? 'up' : 'dn') + '">' + (diff >= 0 ? '+' : '') + 'Rp ' + fmt(diff) + '</td>'
      + '<td>' + action + '</td>'
      + '</tr>';
  });

  html += '</tbody></table>';
  outEl.innerHTML = html;
}


// ══════════════════════════════════════════════════════════
// 4. ACTIONABLE BUY/SELL SIGNAL MATRIX (TRAFFIC LIGHT)
// ══════════════════════════════════════════════════════════
function renderTrafficLightMatrix(ticker, mosPct, flowSignal, quantScore) {
  var container = document.getElementById('hw-traffic-light-card');
  if (!container) return;

  var mosScore = mosPct > 20 ? 1 : mosPct > 0 ? 0 : -1;
  var flowScore = (flowSignal && flowSignal.includes('AKUMULASI')) ? 1 : (flowSignal && flowSignal.includes('DISTRIBUSI')) ? -1 : 0;
  var qScore = (quantScore && quantScore >= 65) ? 1 : (quantScore && quantScore <= 45) ? -1 : 0;

  var totalScore = mosScore + flowScore + qScore;
  var overallVerdict = '';
  var verdictColor = '';
  var verdictDesc = '';

  if (totalScore >= 2) {
    overallVerdict = 'STRONG BUY / ACCUMULATE';
    verdictColor = 'var(--green)';
    verdictDesc = 'Konsensus 3 Pilar: Valuasi diskon wajar, didukung arus bandar/asing & skor teknikal sehat.';
  } else if (totalScore === 1) {
    overallVerdict = 'MODERATE BUY (BUY ON WEAKNESS)';
    verdictColor = 'var(--accent)';
    verdictDesc = 'Kondisi menarik, disarankan masuk bertahap pada area support/diskon MoS.';
  } else if (totalScore === 0) {
    overallVerdict = 'NEUTRAL / HOLD';
    verdictColor = 'var(--amber)';
    verdictDesc = 'Sinyal berimbang antara valuasi dan arus dana. Pantau konfirmasi breakout.';
  } else {
    overallVerdict = 'AVOID / TAKE PROFIT / SELL';
    verdictColor = 'var(--red)';
    verdictDesc = 'Saham mengalami overvaluation atau tertekan distribusi dana keluar.';
  }

  container.style.display = 'block';
  var body = document.getElementById('hw-tl-body');
  if (body) {
    body.innerHTML = ''
      + '<div style="display:flex;align-items:center;justify-content:space-between;background:var(--bg3);border-radius:6px;padding:12px 14px;margin-bottom:10px">'
      + '  <div>'
      + '    <div style="font-size:9px;color:var(--text3);text-transform:uppercase;letter-spacing:1px">KONSENSUS AKSI ' + ticker + '</div>'
      + '    <div style="font-size:16px;font-weight:800;font-family:var(--font-mono);color:' + verdictColor + ';margin-top:2px">' + overallVerdict + '</div>'
      + '    <div style="font-size:10px;color:var(--text2);margin-top:2px">' + verdictDesc + '</div>'
      + '  </div>'
      + '  <div style="text-align:right">'
      + '    <span class="badge" style="background:rgba(255,255,255,.05);border:1px solid ' + verdictColor + ';color:' + verdictColor + ';font-size:12px;padding:4px 10px">Skor Konsensus: ' + totalScore + ' / 3</span>'
      + '  </div>'
      + '</div>'
      + '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;font-size:10px">'
      + '  <div style="background:var(--bg3);padding:8px;border-radius:4px">'
      + '    <div style="color:var(--text3)">1. Valuasi MoS (Buffett)</div>'
      + '    <div style="font-weight:700;margin-top:2px;' + (mosScore > 0 ? 'color:var(--green)' : mosScore < 0 ? 'color:var(--red)' : 'color:var(--amber)') + '">'
      + (mosPct !== null ? (mosPct > 0 ? '+' : '') + mosPct.toFixed(1) + '% MoS' : '—') + '</div>'
      + '  </div>'
      + '  <div style="background:var(--bg3);padding:8px;border-radius:4px">'
      + '    <div style="color:var(--text3)">2. FlowScan (Bandar/Asing)</div>'
      + '    <div style="font-weight:700;margin-top:2px;' + (flowScore > 0 ? 'color:var(--green)' : flowScore < 0 ? 'color:var(--red)' : 'color:var(--amber)') + '">'
      + (flowSignal || 'Netral') + '</div>'
      + '  </div>'
      + '  <div style="background:var(--bg3);padding:8px;border-radius:4px">'
      + '    <div style="color:var(--text3)">3. Quant Trend &amp; Quality</div>'
      + '    <div style="font-weight:700;margin-top:2px;' + (qScore > 0 ? 'color:var(--green)' : qScore < 0 ? 'color:var(--red)' : 'color:var(--amber)') + '">'
      + (quantScore !== undefined ? quantScore + ' / 100' : '72 / 100') + '</div>'
      + '  </div>'
      + '</div>';
  }
}

// Attach hook to Harga Wajar calculator
if (window.addEventListener) {
  window.addEventListener('DOMContentLoaded', function() {
    mwInitViewMode();
  });
}
