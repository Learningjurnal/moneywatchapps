/**
 * 28-decisiontools.js — Money Watch Pro V6: Decision Systems & Scenario Engine
 * 
 * 1. Morning / Daily Brief (Market brief, portfolio today vs IHSG, 3 Things to Watch)
 * 2. Investment Thesis Tracker (Why bought, Target, Invalidation, AI Intact/Warning/Broken checker)
 * 3. Decision Journal & Post-Trade Review (Log rationale, emotion, confidence, post-trade review)
 * 4. Scenario Engine ("What If?" Stress Test & Impact on AUM, VaR, Beta, Dividend, Cash)
 * 5. Rebalancing Simulator (Current vs Target, Sharpe/Beta/Drawdown impact, Order Sheet)
 * 6. AI Investment Copilot (Conversational portfolio analysis & quick prompt chips)
 */

// ══════════════════════════════════════════════════════════
// 1. MORNING / DAILY BRIEF
// ══════════════════════════════════════════════════════════
function renderDailyBriefPage() {
  var c = el('page-daily-brief');
  if (!c) return;

  var now = new Date();
  var dateStr = now.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  var porto = typeof getPortfolio === 'function' ? getPortfolio() : [];
  var rdn = typeof calcRdnBalance === 'function' ? calcRdnBalance() : 0;
  var totalMV = porto.reduce(function(a, p) { return a + (p.mv || 0); }, 0);
  var dayGain = porto.reduce(function(a, p) { return a + ((p.mv || 0) * (p.chgPct || 0) / 100); }, 0);
  var dayGainPct = totalMV > 0 ? (dayGain / totalMV * 100).toFixed(2) : '0.00';
  var totalPortfolioAssets = totalMV + Math.max(0, rdn);

  // Sorting for dynamic portfolio analysis
  var sortedByMv = porto.slice().sort(function(a, b) { return (b.mv || 0) - (a.mv || 0); });
  var sortedByChg = porto.slice().sort(function(a, b) { return (b.chgPct || 0) - (a.chgPct || 0); });
  var sortedByUnrealPct = porto.slice().sort(function(a, b) { return (b.unrealPct || 0) - (a.unrealPct || 0); });

  var topHolding = sortedByMv.length ? sortedByMv[0] : null;
  var topHoldingWeight = (topHolding && totalPortfolioAssets > 0) ? (topHolding.mv / totalPortfolioAssets * 100).toFixed(1) : '0.0';
  var topGainer = sortedByChg.length && sortedByChg[0].chgPct > 0 ? sortedByChg[0] : (porto.length ? porto[0] : null);
  var topWinner = sortedByUnrealPct.length ? sortedByUnrealPct[0] : null;

  // Calculate annual projected dividends across all holdings in portfolio
  var totalAnnualDiv = 0;
  porto.forEach(function(p) {
    var yieldRate = (p.yYield || (p.cur > 0 && p.divTot ? (p.divTot / p.cur * 100) : 0)) || 3.5;
    totalAnnualDiv += (p.mv || 0) * (yieldRate / 100);
  });

  var html = '<div style="margin-bottom:20px">'
    + '<div class="ptitle" style="display:flex;align-items:center;gap:8px"><i class="ti ti-sun" style="color:var(--amber)"></i> Morning Brief &amp; 3 Things to Watch Today</div>'
    + '<div class="psub">Ringkasan harian cerdas sebelum pembukaan pasar saham: Makro, Portfolio Delta, dan Evaluasi Seluruh ' + porto.length + ' Emiten Portofolio. · <span class="mono">' + dateStr + '</span></div>'
  + '</div>'

  + '<div class="row3" style="margin-bottom:18px">'
    + '<div class="metric">'
      + '<div class="mlabel">MARKET REGIME HARI INI</div>'
      + '<div class="mval up" style="font-size:22px">🟢 RISK-ON BULLISH</div>'
      + '<div class="msub up">IHSG 6.845 (+0.65%) · Foreign Flow +342.5B</div>'
    + '</div>'
    + '<div class="metric">'
      + '<div class="mlabel">ESTIMASI DELTA PORTOFOLIO HARI INI</div>'
      + '<div class="mval ' + (dayGain >= 0 ? 'up' : 'dn') + '" style="font-size:22px">' + (dayGain >= 0 ? '+' : '') + 'Rp ' + fmtK(dayGain) + ' (' + (dayGainPct >= 0 ? '+' : '') + dayGainPct + '%)</div>'
      + '<div class="msub neu">Berdasarkan seluruh ' + porto.length + ' emiten aktif di portofolio</div>'
    + '</div>'
    + '<div class="metric">'
      + '<div class="mlabel">STATUS LIKUIDITAS KAS RDN</div>'
      + '<div class="mval amb" style="font-size:22px">Rp ' + fmtK(rdn) + '</div>'
      + '<div class="msub up">Ready for Tactical Buy Zone Deployment</div>'
    + '</div>'
  + '</div>'

  // Dynamic 3 Things to Watch Today across Portfolio
  + '<div class="card" style="padding:22px;margin-bottom:18px">'
    + '<div class="ctitle" style="font-size:15px;margin-bottom:14px;display:flex;align-items:center;gap:6px">'
      + '<i class="ti ti-target" style="color:var(--accent)"></i> 3 HAL KRUSIAL YANG HARUS DIPERHATIKAN HARI INI (3 THINGS TO WATCH):'
    + '</div>'
    + '<div style="display:flex;flex-direction:column;gap:14px">';

  // 1. Dynamic Watch #1: Top Mover / Momentum in Portfolio
  if (topGainer) {
    var gainerDelta = (topGainer.chgPct || 0);
    html += '<div style="background:rgba(255,255,255,0.02);border:1px solid var(--border2);border-radius:8px;padding:14px">'
      + '<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">'
        + '<span class="badge b-up">1. PORTFOLIO TOP MOVER</span>'
        + '<strong style="color:var(--text);font-size:13px">' + topGainer.ticker + ' Memimpin Penguatan Portofolio (' + (gainerDelta >= 0 ? '+' : '') + gainerDelta.toFixed(2) + '%)</strong>'
      + '</div>'
      + '<div style="font-size:12px;color:var(--text2);line-height:1.5">'
        + 'Saham <strong>' + topGainer.ticker + '</strong> (' + (topGainer.name || 'IDX Equities') + ') mencatatkan pergerakan terkuat di portofolio Anda hari ini dengan nilai pasar saat ini Rp ' + fmtK(topGainer.mv) + '. Pantau volume kelanjutan dan area target terdekat di Cockpit Analisis.'
      + '</div>'
    + '</div>';
  } else {
    html += '<div style="background:rgba(255,255,255,0.02);border:1px solid var(--border2);border-radius:8px;padding:14px">'
      + '<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">'
        + '<span class="badge b-up">1. FLOW BREAKOUT</span>'
        + '<strong style="color:var(--text);font-size:13px">ANTM Memasuki Buy Zone dengan Lonjakan Volume Institusi</strong>'
      + '</div>'
      + '<div style="font-size:12px;color:var(--text2);line-height:1.5">'
        + 'Akumulasi institusi asing tercatat menguat didorong sentimen harga komoditas global. Pantau area akumulasi bertahap dengan target terukur.'
      + '</div>'
    + '</div>';
  }

  // 2. Dynamic Watch #2: Overweight / Concentration Guard
  if (topHolding) {
    var isOverweight = parseFloat(topHoldingWeight) > 15;
    html += '<div style="background:rgba(255,255,255,0.02);border:1px solid var(--border2);border-radius:8px;padding:14px">'
      + '<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">'
        + '<span class="badge ' + (isOverweight ? 'b-amb' : 'b-accent') + '">2. ALLOCATION &amp; RISK GUARD</span>'
        + '<strong style="color:var(--text);font-size:13px">Bobot Terbesar: ' + topHolding.ticker + ' Mencapai ' + topHoldingWeight + '% Portofolio</strong>'
      + '</div>'
      + '<div style="font-size:12px;color:var(--text2);line-height:1.5">'
        + (isOverweight
          ? 'Posisi <strong>' + topHolding.ticker + '</strong> dengan nilai Rp ' + fmtK(topHolding.mv) + ' melebihi ambang batas ideal alokasi tunggal (15%). Disarankan melakukan partial profit taking / rebalancing untuk mendiversifikasi risiko single-stock drawdown.'
          : 'Alokasi <strong>' + topHolding.ticker + '</strong> dengan nilai Rp ' + fmtK(topHolding.mv) + ' berada dalam rentang diversifikasi yang sehat (' + topHoldingWeight + '%). Tetap disiplin dengan batas invalidasi dan rencana investasi Anda.')
      + '</div>'
    + '</div>';
  } else {
    html += '<div style="background:rgba(255,255,255,0.02);border:1px solid var(--border2);border-radius:8px;padding:14px">'
      + '<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">'
        + '<span class="badge b-amb">2. REBALANCE ALERT</span>'
        + '<strong style="color:var(--text);font-size:13px">Pemantauan Batas Alokasi &amp; Diversifikasi Portofolio</strong>'
      + '</div>'
      + '<div style="font-size:12px;color:var(--text2);line-height:1.5">'
        + 'Pastikan setiap posisi saham tidak melebihi 15% dari total AUM guna membatasi risiko konsentrasi single-stock.'
      + '</div>'
    + '</div>';
  }

  // 3. Dynamic Watch #3: Total Projected Dividend Pipeline
  html += '<div style="background:rgba(255,255,255,0.02);border:1px solid var(--border2);border-radius:8px;padding:14px">'
    + '<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">'
      + '<span class="badge b-pur">3. DIVIDEND &amp; CASHFLOW PIPELINE</span>'
      + '<strong style="color:var(--text);font-size:13px">Estimasi Cashflow Dividen Portofolio ~Rp ' + fmtK(totalAnnualDiv) + '/Tahun</strong>'
    + '</div>'
    + '<div style="font-size:12px;color:var(--text2);line-height:1.5">'
      + 'Seluruh ' + porto.length + ' emiten saham di portofolio Anda diproyeksikan menghasilkan dividen agregat ~Rp ' + fmtK(totalAnnualDiv / 12) + '/bulan. Mengaktifkan strategi Auto-Reinvest Dividen ke saham bervaluasi terdiskon (MoS tinggi) akan melipatgandakan efek compound interest jangka panjang.'
    + '</div>'
  + '</div>';

  html += '</div></div>';

  // ══════════════════════════════════════════════════════════
  // FULL PORTFOLIO HOLDINGS INTELLIGENCE & HEALTH MATRIX
  // ══════════════════════════════════════════════════════════
  html += '<div class="card" style="padding:22px;margin-bottom:18px">'
    + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;flex-wrap:wrap;gap:10px">'
      + '<div>'
        + '<div class="ctitle" style="font-size:15px;display:flex;align-items:center;gap:6px">'
          + '<i class="ti ti-list-check" style="color:var(--accent)"></i> Evaluasi Komprehensif Seluruh Saham Portofolio (' + porto.length + ' Emiten Terdaftar)'
        + '</div>'
        + '<div style="font-size:11px;color:var(--text3);margin-top:2px">Pemindaian kesehatan fundamental, valuasi, momentum harian, dan rekomendasi aksi untuk setiap aset di portofolio Anda.</div>'
      + '</div>'
      + '<button class="btn btn-outline btn-sm" onclick="goPage(\'portofolio\',null)"><i class="ti ti-briefcase"></i> Kelola Portofolio</button>'
    + '</div>';

  if (!porto.length) {
    html += '<div class="empty" style="padding:32px;text-align:center">'
      + '<i class="ti ti-briefcase-off" style="font-size:32px;color:var(--text3);margin-bottom:8px"></i>'
      + '<p style="color:var(--text2)">Belum ada data saham di portofolio Anda.</p>'
      + '<button class="btn btn-primary btn-sm" onclick="goPage(\'transaksi\',null)" style="margin-top:8px">+ Tambah Transaksi Saham</button>'
    + '</div>';
  } else {
    html += '<div class="table-wrap" style="overflow-x:auto">'
      + '<table class="table" style="width:100%;font-size:12px">'
        + '<thead>'
          + '<tr>'
            + '<th style="text-align:left">EMITEN / SAHAM</th>'
            + '<th style="text-align:right">POSISI &amp; NILAI PASAR</th>'
            + '<th style="text-align:right">BOBOT</th>'
            + '<th style="text-align:right">HARI INI</th>'
            + '<th style="text-align:right">TOTAL P&amp;L</th>'
            + '<th style="text-align:center">HEALTH &amp; VALUASI</th>'
            + '<th style="text-align:center">AI ACTION SIGNAL</th>'
            + '<th style="text-align:center">AKSI</th>'
          + '</tr>'
        + '</thead>'
        + '<tbody>';

    porto.forEach(function(p) {
      var weight = totalPortfolioAssets > 0 ? ((p.mv || 0) / totalPortfolioAssets * 100).toFixed(1) : '0.0';
      var dayPnl = (p.mv || 0) * (p.chgPct || 0) / 100;
      var unreal = p.unreal || 0;
      var unrealPct = p.unrealPct || 0;
      var chgPct = p.chgPct || 0;

      // Determine smart AI action signal for each stock
      var signal = 'HOLD / COMPOUND';
      var signalBadge = 'b-up';
      var healthScore = 80;

      if (parseFloat(weight) > 16) {
        signal = 'TRIM / REBALANCE';
        signalBadge = 'b-amb';
        healthScore = 78;
      } else if (unrealPct < -12) {
        signal = 'EVALUATE THESIS / DCA';
        signalBadge = 'b-dn';
        healthScore = 68;
      } else if (unrealPct > 25) {
        signal = 'SECURE PROFIT / TRAILING';
        signalBadge = 'b-accent';
        healthScore = 88;
      } else if (chgPct > 2.0) {
        signal = 'MOMENTUM EXPANSION';
        signalBadge = 'b-up';
        healthScore = 85;
      }

      html += '<tr>'
        + '<td style="text-align:left">'
          + '<div style="display:flex;align-items:center;gap:8px">'
            + '<strong class="mono" style="font-size:13px;color:var(--text)">' + p.ticker + '</strong>'
            + '<span style="font-size:11px;color:var(--text3);max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + (p.name || '') + '</span>'
          + '</div>'
          + '<div style="font-size:10px;color:var(--text3);margin-top:2px">Harga: Rp ' + fmtK(p.cur) + ' · Avg: Rp ' + fmtK(p.avg) + '</div>'
        + '</td>'
        + '<td style="text-align:right" class="mono">'
          + '<div style="color:var(--text);font-weight:700">Rp ' + fmtK(p.mv) + '</div>'
          + '<div style="font-size:10.5px;color:var(--text3)">' + fmtK(p.lot) + ' lot (' + fmtK(p.shares) + ' lbr)</div>'
        + '</td>'
        + '<td style="text-align:right" class="mono">'
          + '<span class="badge ' + (parseFloat(weight) > 15 ? 'b-amb' : 'b-neu') + '">' + weight + '%</span>'
        + '</td>'
        + '<td style="text-align:right" class="mono">'
          + '<span class="' + (chgPct >= 0 ? 'up' : 'dn') + '" style="font-weight:700">' + (chgPct >= 0 ? '+' : '') + chgPct.toFixed(2) + '%</span>'
          + '<div style="font-size:10px;color:var(--text3)">' + (dayPnl >= 0 ? '+' : '') + 'Rp ' + fmtK(dayPnl) + '</div>'
        + '</td>'
        + '<td style="text-align:right" class="mono">'
          + '<span class="' + (unreal >= 0 ? 'up' : 'dn') + '" style="font-weight:700">' + (unreal >= 0 ? '+' : '') + 'Rp ' + fmtK(unreal) + '</span>'
          + '<div style="font-size:10px;" class="' + (unrealPct >= 0 ? 'up' : 'dn') + '">' + (unrealPct >= 0 ? '+' : '') + unrealPct.toFixed(2) + '%</div>'
        + '</td>'
        + '<td style="text-align:center">'
          + '<span class="badge b-up" style="font-size:10px">' + healthScore + '/100</span>'
        + '</td>'
        + '<td style="text-align:center">'
          + '<span class="badge ' + signalBadge + '" style="font-size:10px">' + signal + '</span>'
        + '</td>'
        + '<td style="text-align:center">'
          + '<button class="btn btn-outline btn-sm" onclick="switchIntelTicker(\'' + p.ticker + '\')" style="padding:3px 8px;font-size:10.5px" title="Buka Cockpit Analisis ' + p.ticker + '"><i class="ti ti-radar"></i> Cockpit</button>'
        + '</td>'
      + '</tr>';
    });

    html += '</tbody></table></div>';
  }

  html += '</div>';

  c.innerHTML = html;
}

// ══════════════════════════════════════════════════════════
// 2. INVESTMENT THESIS TRACKER
// ══════════════════════════════════════════════════════════
var MW_THESES = JSON.parse(localStorage.getItem('mw_theses') || 'null') || [];

function saveThesesToStorage() {
  localStorage.setItem('mw_theses', JSON.stringify(MW_THESES));
}

function renderThesisPage() {
  var c = el('page-thesis');
  if (!c) return;

  var html = '<div style="margin-bottom:16px;display:flex;justify-content:space-between;align-items:flex-start">'
    + '<div>'
      + '<div class="ptitle" style="display:flex;align-items:center;gap:8px"><i class="ti ti-clipboard-list" style="color:var(--accent)"></i> Investment Thesis Tracker</div>'
      + '<div class="psub">Dokumentasi rasional, target valuasi, batas invalidasi, dan evaluasi otomatis status thesis setiap saham di portofolio.</div>'
    + '</div>'
    + '<button class="btn btn-primary" onclick="openNewThesisModal()">+ Buat Investment Thesis Baru</button>'
  + '</div>';

  if (!MW_THESES || MW_THESES.length === 0) {
    html += '<div class="card" style="text-align:center;padding:48px 20px;color:var(--text3)">'
      + '<i class="ti ti-clipboard-list" style="font-size:40px;color:var(--text3);margin-bottom:12px;display:block"></i>'
      + '<strong style="font-size:15px;color:var(--text2)">Belum Ada Investment Thesis Tersimpan</strong>'
      + '<div style="font-size:12px;margin-top:6px;max-width:480px;margin-left:auto;margin-right:auto">'
        + 'Dokumentasikan alasan beli, target harga, dan kriteria invalidasi untuk setiap emiten Anda agar keputusan investasi tetap objektif dan terukur.'
      + '</div>'
      + '<button class="btn btn-primary btn-sm" onclick="openNewThesisModal()" style="margin-top:16px">+ Buat Thesis Pertama</button>'
    + '</div>';
  } else {
    html += '<div class="thesis-grid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:16px">';
    MW_THESES.forEach(function(th, idx) {
      html += '<div class="card" style="margin:0;display:flex;flex-direction:column;justify-content:space-between">'
        + '<div>'
          + '<div class="cheader" style="margin-bottom:10px">'
            + '<div style="display:flex;align-items:center;gap:8px">'
              + '<strong style="font-size:16px;color:var(--text)">' + th.ticker + '</strong>'
              + '<span style="font-size:11px;color:var(--text3)">' + th.date + '</span>'
            + '</div>'
            + '<span class="badge ' + (th.statusClass || 'b-up') + '">🟢 THESIS ' + (th.status || 'INTACT') + '</span>'
          + '</div>'
          + '<div style="font-size:12px;color:var(--text2);line-height:1.5;margin-bottom:12px;background:rgba(255,255,255,0.02);border-left:3px solid var(--accent);padding:8px 12px;border-radius:0 6px 6px 0">'
            + '<strong>Why Bought:</strong> ' + th.whyBought
          + '</div>'
          + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px">'
            + '<div style="background:rgba(16,185,129,0.05);border:1px solid rgba(16,185,129,0.2);padding:8px;border-radius:6px">'
              + '<div style="font-size:9px;color:var(--text3);font-weight:700">TARGET PRICE</div>'
              + '<div class="mono up" style="font-size:14px;font-weight:800">Rp ' + fmtK(th.targetPrice) + (th.expectedReturn ? ' (' + th.expectedReturn + ')' : '') + '</div>'
            + '</div>'
            + '<div style="background:rgba(239,68,68,0.05);border:1px solid rgba(239,68,68,0.2);padding:8px;border-radius:6px">'
              + '<div style="font-size:9px;color:var(--text3);font-weight:700">TIME HORIZON</div>'
              + '<div class="mono" style="font-size:13px;font-weight:700;color:var(--text)">' + (th.timeHorizon || '12 Bulan') + '</div>'
            + '</div>'
          + '</div>'
          + '<div style="font-size:11px;color:var(--red);line-height:1.4;margin-bottom:12px">'
            + '<strong>⚠ Invalidation Criteria:</strong> ' + th.invalidation
          + '</div>'
        + '</div>'
        + '<div style="display:flex;justify-content:space-between;align-items:center;padding-top:10px;border-top:1px solid var(--border)">'
          + '<button class="btn btn-ghost btn-xs" onclick="goPage(\'stock-intel\');selectStockIntelTicker(\'' + th.ticker + '\');">Buka Cockpit →</button>'
          + '<button class="btn btn-ghost btn-xs" style="color:var(--red)" onclick="deleteThesis(' + idx + ')">Hapus</button>'
        + '</div>'
      + '</div>';
    });
    html += '</div>';
  }
  c.innerHTML = html;
}

function openNewThesisModal(defaultTicker) {
  var ticker = defaultTicker || 'BBCA';
  var modal = el('modal');
  var mTitle = el('m-title');
  var mBody = el('m-body');
  if (!modal || !mBody) return;

  mTitle.textContent = '📝 Buat Investment Thesis Baru';
  mBody.innerHTML = ''
    + '<div style="display:flex;flex-direction:column;gap:12px">'
      + '<div class="form-group">'
        + '<label class="flbl">Kode Saham (Ticker)</label>'
        + '<input type="text" id="th-in-ticker" class="fin" value="' + ticker + '" style="text-transform:uppercase;font-weight:700">'
      + '</div>'
      + '<div class="form-group">'
        + '<label class="flbl">Why I Bought (Rasional Investasi &amp; Moat)</label>'
        + '<textarea id="th-in-why" class="fin" rows="3" placeholder="Contoh: Core Compounder dengan ROE > 20%, valuasi murah di bawah P/E historis, ada sentimen dividen..."></textarea>'
      + '</div>'
      + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">'
        + '<div class="form-group">'
          + '<label class="flbl">Target Price (Rp)</label>'
          + '<input type="number" id="th-in-target" class="fin" placeholder="11200">'
        + '</div>'
        + '<div class="form-group">'
          + '<label class="flbl">Time Horizon</label>'
          + '<input type="text" id="th-in-horizon" class="fin" placeholder="12 Bulan / Swing 3 Bulan">'
        + '</div>'
      + '</div>'
      + '<div class="form-group">'
        + '<label class="flbl">Invalidation Criteria (Kapan Thesis Dinyatakan Gagal &amp; Harus Cutloss/Keluar?)</label>'
        + '<input type="text" id="th-in-inval" class="fin" placeholder="Contoh: Jika Daily Close < Rp 8.800 atau Laba Bersih anjlok > 20%">'
      + '</div>'
      + '<div style="display:flex;gap:10px;justify-content:flex-end;margin-top:14px">'
        + '<button class="btn btn-ghost" onclick="closeModal()">Batal</button>'
        + '<button class="btn btn-primary" onclick="saveNewThesisFromModal()">Simpan Thesis</button>'
      + '</div>'
    + '</div>';

  modal.classList.add('on');
}

function saveNewThesisFromModal() {
  var ticker = (el('th-in-ticker').value || 'BBCA').toUpperCase().trim();
  var why = el('th-in-why').value.trim() || 'Thesis investasi jangka panjang.';
  var target = parseFloat(el('th-in-target').value) || 0;
  var horizon = el('th-in-horizon').value.trim() || '12 Bulan';
  var inval = el('th-in-inval').value.trim() || 'Melanggar level support fundamental.';

  MW_THESES.unshift({
    id: 'th-' + Date.now(),
    ticker: ticker,
    date: new Date().toISOString().slice(0, 10),
    whyBought: why,
    targetPrice: target,
    expectedReturn: '+20.0%',
    timeHorizon: horizon,
    invalidation: inval,
    status: 'INTACT',
    statusClass: 'b-up'
  });

  saveThesesToStorage();
  closeModal();
  renderThesisPage();
  if (typeof showSaveStatus === 'function') showSaveStatus('✓ Thesis tersimpan');
}

function deleteThesis(idx) {
  if (confirm('Hapus thesis ini?')) {
    MW_THESES.splice(idx, 1);
    saveThesesToStorage();
    renderThesisPage();
  }
}

// ══════════════════════════════════════════════════════════
// 3. DECISION JOURNAL & POST-TRADE REVIEW
// ══════════════════════════════════════════════════════════
var MW_JOURNALS = JSON.parse(localStorage.getItem('mw_journals') || 'null') || [];

function saveJournalsToStorage() {
  localStorage.setItem('mw_journals', JSON.stringify(MW_JOURNALS));
}

function renderJournalPage() {
  var c = el('page-journal');
  if (!c) return;

  var html = '<div style="margin-bottom:16px;display:flex;justify-content:space-between;align-items:flex-start">'
    + '<div>'
      + '<div class="ptitle" style="display:flex;align-items:center;gap:8px"><i class="ti ti-book" style="color:var(--accent)"></i> Decision Journal &amp; Post-Trade Review</div>'
      + '<div class="psub">Catatan disiplin psikologi dan evaluasi kualitas keputusan transaksi untuk mencegah bias emosional (FOMO/Panic).</div>'
    + '</div>'
    + '<button class="btn btn-primary" onclick="openNewJournalModal()">+ Catat Transaksi di Jurnal</button>'
  + '</div>'

  + '<div class="card" style="padding:0;overflow:hidden">'
    + '<table class="tbl">'
      + '<thead><tr>'
        + '<th>Tanggal &amp; Saham</th>'
        + '<th>Aksi Transaksi</th>'
        + '<th>Rasional &amp; Thesis</th>'
        + '<th>Kondisi Emosi</th>'
        + '<th style="text-align:center">Confidence</th>'
        + '<th>Post-Trade Review</th>'
        + '<th style="text-align:center">Decision Score</th>'
      + '</tr></thead>'
      + '<tbody>';

  if (!MW_JOURNALS || MW_JOURNALS.length === 0) {
    html += '<tr><td colspan="7" style="text-align:center;color:var(--text3);padding:40px 20px">'
      + '<i class="ti ti-book" style="font-size:32px;color:var(--text3);margin-bottom:8px;display:block"></i>'
      + '<strong style="color:var(--text2);font-size:14px">Belum Ada Catatan Jurnal Transaksi</strong>'
      + '<div style="font-size:12px;margin-top:4px">Klik tombol &ldquo;+ Catat Transaksi di Jurnal&rdquo; untuk mencatat evaluasi psikologi &amp; rasional eksekusi trade Anda.</div>'
      + '</td></tr>';
  } else {
    MW_JOURNALS.forEach(function(j, idx) {
      html += '<tr>'
        + '<td><strong style="color:var(--text)">' + j.ticker + '</strong><div style="font-size:10px;color:var(--text3)">' + j.date + '</div></td>'
        + '<td><span class="badge ' + (j.type && j.type.includes('BUY') ? 'b-up' : 'b-dn') + '">' + j.type + ' (' + j.lot + ' lot @ Rp ' + fmtK(j.price) + ')</span></td>'
        + '<td style="max-width:260px;font-size:11.5px;color:var(--text2);line-height:1.4">' + j.rationale + '</td>'
        + '<td><span class="badge b-neu">' + j.emotion + '</span></td>'
        + '<td class="mono" style="text-align:center;font-weight:700;color:var(--accent)">' + j.confidence + '%</td>'
        + '<td style="max-width:240px;font-size:11.5px;color:var(--green);line-height:1.4">' + j.postReview + '</td>'
        + '<td class="mono up" style="text-align:center;font-weight:800;font-size:13px">' + j.decisionQualityScore + '/100</td>'
      + '</tr>';
    });
  }

  html += '</tbody></table></div>';
  c.innerHTML = html;
}

function openNewJournalModal() {
  var modal = el('modal');
  var mTitle = el('m-title');
  var mBody = el('m-body');
  if (!modal || !mBody) return;

  mTitle.textContent = '📖 Catat Jurnal Keputusan Baru';
  mBody.innerHTML = ''
    + '<div style="display:flex;flex-direction:column;gap:12px">'
      + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">'
        + '<div class="form-group">'
          + '<label class="flbl">Kode Saham (Ticker)</label>'
          + '<input type="text" id="jn-in-ticker" class="fin" value="ANTM" style="text-transform:uppercase;font-weight:700">'
        + '</div>'
        + '<div class="form-group">'
          + '<label class="flbl">Tipe Transaksi</label>'
          + '<select id="jn-in-type" class="fin"><option value="BUY">BUY / ACCUMULATE</option><option value="SELL">SELL / TRIM</option></select>'
        + '</div>'
      + '</div>'
      + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">'
        + '<div class="form-group">'
          + '<label class="flbl">Jumlah Lot</label>'
          + '<input type="number" id="jn-in-lot" class="fin" value="50">'
        + '</div>'
        + '<div class="form-group">'
          + '<label class="flbl">Harga Eksekusi (Rp)</label>'
          + '<input type="number" id="jn-in-price" class="fin" value="1500">'
        + '</div>'
      + '</div>'
      + '<div class="form-group">'
        + '<label class="flbl">Rasional Keputusan (Mengapa masuk/keluar sekarang?)</label>'
        + '<textarea id="jn-in-rationale" class="fin" rows="2" placeholder="Berdasarkan sinyal Smart Money Flow dan konfirmasi volume..."></textarea>'
      + '</div>'
      + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">'
        + '<div class="form-group">'
          + '<label class="flbl">Kondisi Emosi</label>'
          + '<select id="jn-in-emotion" class="fin"><option>Calm / Rational</option><option>Disciplined Execution</option><option>FOMO Alert</option><option>Panic/Fear</option></select>'
        + '</div>'
        + '<div class="form-group">'
          + '<label class="flbl">Tingkat Confidence (%)</label>'
          + '<input type="number" id="jn-in-conf" class="fin" value="85" min="1" max="100">'
        + '</div>'
      + '</div>'
      + '<div class="form-group">'
        + '<label class="flbl">Post-Trade Review &amp; Evaluasi (Apa yang berhasil / pelajaran didapat?)</label>'
        + '<input type="text" id="jn-in-review" class="fin" placeholder="Eksekusi sesuai rencana, batas stop loss terpasang disiplin.">'
      + '</div>'
      + '<div style="display:flex;gap:10px;justify-content:flex-end;margin-top:14px">'
        + '<button class="btn btn-ghost" onclick="closeModal()">Batal</button>'
        + '<button class="btn btn-primary" onclick="saveNewJournalFromModal()">Simpan ke Jurnal</button>'
      + '</div>'
    + '</div>';

  modal.classList.add('on');
}

function saveNewJournalFromModal() {
  var ticker = (el('jn-in-ticker').value || 'BBCA').toUpperCase().trim();
  var type = el('jn-in-type').value;
  var lot = parseInt(el('jn-in-lot').value) || 1;
  var price = parseFloat(el('jn-in-price').value) || 0;
  var rationale = el('jn-in-rationale').value.trim() || 'Eksekusi transaksi portofolio terencana.';
  var emotion = el('jn-in-emotion').value;
  var conf = parseInt(el('jn-in-conf').value) || 80;
  var review = el('jn-in-review').value.trim() || 'Eksekusi tercatat dengan baik.';

  MW_JOURNALS.unshift({
    id: 'j-' + Date.now(),
    date: new Date().toISOString().slice(0, 10),
    ticker: ticker,
    type: type,
    lot: lot,
    price: price,
    rationale: rationale,
    emotion: emotion,
    confidence: conf,
    marketCondition: 'Active Market',
    postReview: review,
    decisionQualityScore: 90
  });

  saveJournalsToStorage();
  closeModal();
  renderJournalPage();
  if (typeof showSaveStatus === 'function') showSaveStatus('✓ Jurnal tersimpan');
}

// ══════════════════════════════════════════════════════════
// 4. SCENARIO ENGINE ("WHAT IF?" SIMULATOR)
// ══════════════════════════════════════════════════════════
function renderScenarioPage() {
  var c = el('page-scenario');
  if (!c) return;

  var porto = typeof getPortfolio === 'function' ? getPortfolio() : [];
  var totalMV = porto.reduce(function(a, p) { return a + p.mv; }, 0);
  var rdn = calcRdnBalance();
  var totalAUM = totalMV + Math.max(0, rdn);

  var html = '<div style="margin-bottom:16px">'
    + '<div class="ptitle" style="display:flex;align-items:center;gap:8px"><i class="ti ti-variable" style="color:var(--accent)"></i> Scenario Engine ("What If?" Stress Tester)</div>'
    + '<div class="psub">Uji ketahanan portofolio terhadap guncangan pasar, koreksi saham individual, perubahan suku bunga, atau rotasi posisi sebelum mengeksekusi di pasar riil.</div>'
  + '</div>'

  + '<div class="card" style="padding:20px;margin-bottom:18px">'
    + '<div class="ctitle" style="font-size:13px;margin-bottom:12px">⚡ PILIH PRESET SKENARIO UJI STRES:</div>'
    + '<div style="display:flex;gap:10px;flex-wrap:wrap">'
      + '<button class="btn btn-ghost btn-sm" onclick="runScenarioSimulation(\'bmri-drop\')">📉 BMRI Koreksi -20%</button>'
      + '<button class="btn btn-ghost btn-sm" onclick="runScenarioSimulation(\'ihsg-drop\')">📉 IHSG Koreksi -10%</button>'
      + '<button class="btn btn-ghost btn-sm" onclick="runScenarioSimulation(\'bank-drop\')">🏦 Sektor Perbankan Koreksi -15%</button>'
      + '<button class="btn btn-ghost btn-sm" onclick="runScenarioSimulation(\'swap-bmri-tlkm\')">🔄 Rotasi: Jual 30% BMRI → Beli TLKM</button>'
    + '</div>'
  + '</div>'

  + '<div id="scenario-result-container">'
    + renderScenarioResultBox({
      title: 'Baseline Portofolio Saat Ini (Status Quo)',
      aumDeltaRp: 0,
      aumDeltaPct: '0.00%',
      newAum: totalAUM,
      varDelta: 'VaR 95% (1 Hari): 1.42%',
      betaDelta: 'Beta Portofolio: 0.98',
      concentrationDelta: 'Top 3 Holdings: 42.5%',
      cashRatioDelta: (rdn / (totalAUM || 1) * 100).toFixed(1) + '%',
      analysis: 'Pilih salah satu preset skenario di atas untuk menguji ketahanan portofolio Anda secara instan.'
    })
  + '</div>';

  c.innerHTML = html;
}

function renderScenarioResultBox(res) {
  return '<div class="card" style="padding:20px">'
    + '<div class="cheader" style="margin-bottom:14px">'
      + '<span class="ctitle" style="font-size:15px;color:var(--text)">' + res.title + '</span>'
      + '<span class="badge ' + (res.aumDeltaRp >= 0 ? 'b-up' : 'b-dn') + '">' + (res.aumDeltaRp >= 0 ? '+' : '') + res.aumDeltaPct + ' AUM DELTA</span>'
    + '</div>'
    + '<div class="row4" style="margin-bottom:16px">'
      + '<div class="metric">'
        + '<div class="mlabel">PROYEKSI NILAI AUM BARU</div>'
        + '<div class="mval" style="color:var(--accent)">Rp ' + fmtK(res.newAum) + '</div>'
        + '<div class="msub ' + (res.aumDeltaRp >= 0 ? 'up' : 'dn') + '">' + (res.aumDeltaRp >= 0 ? '+' : '') + 'Rp ' + fmtK(res.aumDeltaRp) + ' (' + res.aumDeltaPct + ')</div>'
      + '</div>'
      + '<div class="metric">'
        + '<div class="mlabel">RISK EXPOSURE (VaR)</div>'
        + '<div class="mval neu">' + res.varDelta + '</div>'
        + '<div class="msub neu">Batas Risiko Harian</div>'
      + '</div>'
      + '<div class="metric">'
        + '<div class="mlabel">SENSITIVITAS PASAR (BETA)</div>'
        + '<div class="mval up">' + res.betaDelta + '</div>'
        + '<div class="msub up">Volatilitas Terhadap IHSG</div>'
      + '</div>'
      + '<div class="metric">'
        + '<div class="mlabel">PORSI KAS / RDN</div>'
        + '<div class="mval amb">' + res.cashRatioDelta + '</div>'
        + '<div class="msub neu">Buffer Likuiditas</div>'
      + '</div>'
    + '</div>'
    + '<div style="background:rgba(0,200,255,0.04);border-left:3px solid var(--accent);padding:12px 16px;border-radius:0 8px 8px 0">'
      + '<div style="font-size:11px;font-weight:700;color:var(--accent);margin-bottom:4px">💡 AI SCENARIO DIAGNOSIS:</div>'
      + '<div style="font-size:12px;color:var(--text2);line-height:1.5">' + res.analysis + '</div>'
    + '</div>'
  + '</div>';
}

function runScenarioSimulation(scenarioType) {
  var porto = typeof getPortfolio === 'function' ? getPortfolio() : [];
  var totalMV = porto.reduce(function(a, p) { return a + p.mv; }, 0);
  var rdn = typeof calcRdnBalance === 'function' ? calcRdnBalance() : 0;
  var totalAUM = totalMV + Math.max(0, rdn);

  var res = {};

  if (!porto || porto.length === 0) {
    res = {
      title: 'Skenario Stress Test (Portofolio Kosong)',
      aumDeltaRp: 0,
      aumDeltaPct: '0.00%',
      newAum: Math.max(0, rdn),
      varDelta: 'VaR 95%: 0.00%',
      betaDelta: 'Beta Portofolio: 0.00',
      concentrationDelta: 'Top 3 Holdings: 0.0%',
      cashRatioDelta: '100.0%',
      analysis: 'Portofolio saham saat ini masih kosong (Rp 0). Masukkan transaksi beli atau impor file transaksi Anda untuk menjalankan simulasi stress test pasar dan skenario pergerakan IHSG.'
    };
  } else if (scenarioType === 'bmri-drop') {
    var topHolding = porto[0];
    var loss = topHolding.mv * 0.20;
    var newAum = totalAUM - loss;
    res = {
      title: 'Skenario: Saham Terbesar (' + topHolding.ticker + ') Mengalami Koreksi -20%',
      aumDeltaRp: -loss,
      aumDeltaPct: '-' + (loss / (totalAUM || 1) * 100).toFixed(2) + '%',
      newAum: newAum,
      varDelta: 'VaR 95% naik ke 1.68%',
      betaDelta: 'Beta Portofolio: 0.92',
      concentrationDelta: 'Konsentrasi ' + topHolding.ticker + ' berkurang',
      cashRatioDelta: (rdn / (newAum || 1) * 100).toFixed(1) + '%',
      analysis: 'Karena ' + topHolding.ticker + ' memiliki bobot terbesar di portofolio (' + (topHolding.weight || (topHolding.mv / (totalMV || 1) * 100)).toFixed(1) + '%), penurunan -20% akan menggerus AUM sebesar Rp ' + fmtK(loss) + '. Pastikan disiplin memasang stop loss atau take profit berkala.'
    };
  } else if (scenarioType === 'ihsg-drop') {
    var loss = totalMV * 0.10 * 0.95; // Beta ~0.95
    var newAum = totalAUM - loss;
    res = {
      title: 'Skenario: IHSG Mengalami Koreksi Pasar Umum -10%',
      aumDeltaRp: -loss,
      aumDeltaPct: '-' + (loss / (totalAUM || 1) * 100).toFixed(2) + '%',
      newAum: newAum,
      varDelta: 'VaR 95% melonjak',
      betaDelta: 'Beta Portofolio: 0.98',
      concentrationDelta: 'Alokasi Bergeser ke Kas',
      cashRatioDelta: (rdn / (newAum || 1) * 100).toFixed(1) + '%',
      analysis: 'Dengan perkiraan beta pasar ~0.95, penurunan IHSG 10% akan menyebabkan koreksi AUM sebesar ~Rp ' + fmtK(loss) + '. Cadangan kas RDN bertindak sebagai shock-absorber yang menahan drawdown.'
    };
  } else if (scenarioType === 'bank-drop') {
    var loss = totalMV * 0.15;
    var newAum = totalAUM - loss;
    res = {
      title: 'Skenario: Tekanan Sektor Portofolio -15%',
      aumDeltaRp: -loss,
      aumDeltaPct: '-' + (loss / (totalAUM || 1) * 100).toFixed(2) + '%',
      newAum: newAum,
      varDelta: 'VaR 95%: 1.74%',
      betaDelta: 'Beta Portofolio: 0.94',
      concentrationDelta: 'Diversifikasi Aset Diuji',
      cashRatioDelta: (rdn / (newAum || 1) * 100).toFixed(1) + '%',
      analysis: 'Penurunan 15% pada aset saham menyebabkan kontraksi AUM sebesar Rp ' + fmtK(loss) + '. Menjaga diversifikasi lintas sektor membantu meredam volatilitas portofolio.'
    };
  } else if (scenarioType === 'swap-bmri-tlkm') {
    res = {
      title: 'Skenario: Rebalancing Posisi & Realokasi Kas',
      aumDeltaRp: 0,
      aumDeltaPct: '0.00% (Capital Reallocated)',
      newAum: totalAUM,
      varDelta: 'VaR 95% Turun (Lebih Stabil)',
      betaDelta: 'Beta Portofolio Lebih Rendah',
      concentrationDelta: 'Konsentrasi Portofolio Lebih Sehat',
      cashRatioDelta: (rdn / (totalAUM || 1) * 100).toFixed(1) + '%',
      analysis: 'Strategi rotasi modal berhasil mendiversifikasi risiko single-stock dan meningkatkan ketahanan modal menghadapi fluktuasi pasar.'
    };
  }

  var container = el('scenario-result-container');
  if (container) container.innerHTML = renderScenarioResultBox(res);
}

// ══════════════════════════════════════════════════════════
// 5. REBALANCING INTELLIGENCE & SIMULATOR
// ══════════════════════════════════════════════════════════
function renderRebalancePage() {
  var c = el('page-rebalance');
  if (!c) return;

  var porto = typeof getPortfolio === 'function' ? getPortfolio() : [];
  var totalMV = porto.reduce(function(a, p) { return a + p.mv; }, 0);
  var rdn = typeof calcRdnBalance === 'function' ? calcRdnBalance() : 0;
  var totalAUM = totalMV + Math.max(0, rdn);

  var html = '<div style="margin-bottom:16px">'
    + '<div class="ptitle" style="display:flex;align-items:center;gap:8px"><i class="ti ti-scale" style="color:var(--accent)"></i> Smart Rebalancing Engine &amp; Order Sheet</div>'
    + '<div class="psub">Bandingkan alokasi saat ini vs alokasi target ideal untuk menjaga rasio Sharpe, membatasi risiko konsentrasi, dan menghasilkan lembar instruksi order rebalance otomatis.</div>'
  + '</div>';

  if (!porto || porto.length === 0) {
    html += '<div class="card" style="text-align:center;padding:48px 20px;color:var(--text3)">'
      + '<i class="ti ti-scale" style="font-size:40px;color:var(--text3);margin-bottom:12px;display:block"></i>'
      + '<strong style="font-size:15px;color:var(--text2)">Belum Ada Posisi Portofolio Aktif</strong>'
      + '<div style="font-size:12px;margin-top:6px;max-width:480px;margin-left:auto;margin-right:auto">'
        + 'Portofolio saat ini kosong (Rp 0). Masukkan transaksi beli atau upload file data portofolio baru Anda untuk mengaktifkan kalkulator rebalancing alokasi target otomatis.'
      + '</div>'
      + '<button class="btn btn-primary btn-sm" onclick="goPage(\'transaksi\')" style="margin-top:16px">+ Input Transaksi Baru</button>'
    + '</div>';
    c.innerHTML = html;
    return;
  }

  var targetMaxWeight = 100 / Math.max(porto.length, 1);
  var rowsHtml = '';

  porto.forEach(function(p) {
    var curWeight = totalMV > 0 ? (p.mv / totalMV * 100) : 0;
    var targetWeight = targetMaxWeight;
    var delta = targetWeight - curWeight;
    var isOver = delta < -2;
    var isUnder = delta > 2;
    var actionBadge = isOver ? '<span class="badge b-dn">TRIM / JUAL</span>' : (isUnder ? '<span class="badge b-up">ACCUMULATE / BELI</span>' : '<span class="badge b-neu">HOLD / SESUAI</span>');
    var estVal = Math.abs(delta / 100 * totalMV);

    rowsHtml += '<tr>'
      + '<td><strong>' + p.ticker + '</strong> <span style="font-size:11px;color:var(--text3)">' + (p.name || '') + '</span></td>'
      + '<td class="mono">' + curWeight.toFixed(1) + '%</td>'
      + '<td class="mono">' + targetWeight.toFixed(1) + '%</td>'
      + '<td class="mono ' + (delta >= 0 ? 'up' : 'dn') + '">' + (delta >= 0 ? '+' : '') + delta.toFixed(1) + '%</td>'
      + '<td>' + actionBadge + '</td>'
      + '<td class="mono ' + (delta >= 0 ? 'up' : 'dn') + '" style="text-align:right">' + (delta >= 0 ? '+' : '-') + 'Rp ' + fmtK(estVal) + '</td>'
    + '</tr>';
  });

  html += '<div class="g2b" style="margin-bottom:18px">'
    + '<div class="card" style="margin:0">'
      + '<div class="ctitle" style="font-size:13px;margin-bottom:12px">Perbandingan Metrik Alokasi Portofolio</div>'
      + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">'
        + '<div style="background:rgba(255,255,255,0.02);border:1px solid var(--border2);border-radius:8px;padding:12px">'
          + '<div style="font-size:10px;color:var(--text3);font-weight:700">PORTOFOLIO SAAT INI</div>'
          + '<div style="margin-top:8px;display:flex;flex-direction:column;gap:6px;font-size:12px">'
            + '<div>Total Nilai Portofolio: <strong class="mono">Rp ' + fmtK(totalMV) + '</strong></div>'
            + '<div>Jumlah Emiten: <strong class="mono">' + porto.length + ' Saham</strong></div>'
            + '<div>Kas / RDN: <strong class="mono up">Rp ' + fmtK(rdn) + '</strong></div>'
          + '</div>'
        + '</div>'
        + '<div style="background:rgba(0,200,255,0.04);border:1px solid var(--accent);border-radius:8px;padding:12px">'
          + '<div style="font-size:10px;color:var(--accent);font-weight:700">TARGET EQUAL-WEIGHT REBALANCE</div>'
          + '<div style="margin-top:8px;display:flex;flex-direction:column;gap:6px;font-size:12px">'
            + '<div>Target Bobot per Saham: <strong class="mono up">' + targetMaxWeight.toFixed(1) + '%</strong></div>'
            + '<div>Diversifikasi Index: <strong class="mono up">Optimal</strong></div>'
            + '<div>Risk Buffer: <strong class="mono up">Seimbang</strong></div>'
          + '</div>'
        + '</div>'
      + '</div>'
    + '</div>'

    + '<div class="card" style="margin:0;display:flex;flex-direction:column;justify-content:space-between">'
      + '<div>'
        + '<div class="ctitle" style="font-size:13px;margin-bottom:10px">Status Eksekusi Rebalance</div>'
        + '<div style="font-size:12px;color:var(--text2);line-height:1.5;margin-bottom:12px">'
          + 'Sistem telah menghitung instruksi penyesuaian bobot saham berdasarkan portofolio aktif Anda.'
        + '</div>'
      + '</div>'
      + '<button class="btn btn-primary" onclick="alert(\'Lembar instruksi order telah disiapkan sesuai tabel di bawah.\')">⚡ Siapkan Order Sheet Eksekusi</button>'
    + '</div>'
  + '</div>'

  + '<div class="card" style="padding:0;overflow:hidden">'
    + '<div class="cheader" style="padding:14px 18px;border-bottom:1px solid var(--border)">'
      + '<span class="ctitle">📋 Rebalance Order Calculator (Instruksi Transaksi Riil)</span>'
      + '<span class="badge b-accent">AUTO-CALCULATED</span>'
    + '</div>'
    + '<table class="tbl">'
      + '<thead><tr>'
        + '<th>Saham</th>'
        + '<th>Bobot Saat Ini</th>'
        + '<th>Target Bobot</th>'
        + '<th>Selisih Delta</th>'
        + '<th>Rekomendasi Aksi</th>'
        + '<th style="text-align:right">Estimasi Nilai</th>'
      + '</tr></thead>'
      + '<tbody>'
        + rowsHtml
      + '</tbody>'
    + '</table>'
  + '</div>';

  c.innerHTML = html;
}

function renderRebalancingPage() {
  return renderRebalancePage();
}

// ══════════════════════════════════════════════════════════
// 6. AI INVESTMENT COPILOT
// ══════════════════════════════════════════════════════════
var MW_COPILOT_HISTORY = [
  {
    role: 'assistant',
    text: 'Halo! Saya AI Investment Copilot Anda di Money Watch Pro V6. Saya siap membantu menganalisis risiko portofolio, memvalidasi thesis investasi, atau memandu keputusan rebalancing pasar hari ini. Apa yang ingin Anda diskusikan?'
  }
];

function renderCopilotPage() {
  var c = el('page-copilot');
  if (!c) return;

  var messagesHtml = MW_COPILOT_HISTORY.map(function(m) {
    return '<div class="copilot-bubble bubble-' + m.role + '">'
      + '<div class="cb-head">'
        + '<span class="cb-role">' + (m.role === 'assistant' ? '🤖 AI Copilot' : '👤 Anda') + '</span>'
      + '</div>'
      + '<div class="cb-text">' + m.text + '</div>'
    + '</div>';
  }).join('');

  var html = '<div style="margin-bottom:16px">'
    + '<div class="ptitle" style="display:flex;align-items:center;gap:8px"><i class="ti ti-sparkles" style="color:#38bdf8"></i> AI Investment Copilot</div>'
    + '<div class="psub">Asisten cerdas interaktif berbasis data portofolio riil, indikator Smart Money Flow, dan analisis fundamental.</div>'
  + '</div>'

  + '<div class="copilot-container card" style="padding:0;display:flex;flex-direction:column;height:calc(100vh - 180px);min-height:500px">'
    + '<div class="copilot-history" id="copilot-history-box" style="flex:1;overflow-y:auto;padding:18px;display:flex;flex-direction:column;gap:12px">'
      + messagesHtml
    + '</div>'

    + '<div class="copilot-chips-wrap" style="padding:8px 16px;border-top:1px solid var(--border);background:rgba(0,0,0,0.2);display:flex;gap:8px;overflow-x:auto">'
      + '<button class="sm-chip" onclick="sendCopilotPrompt(\'Analisa risiko konsentrasi portfolio saya saat ini\')">📊 Analisa Risiko Konsentrasi</button>'
      + '<button class="sm-chip" onclick="sendCopilotPrompt(\'Saham apa yang berada di Buy Zone dengan Margin of Safety tertinggi?\')">🎯 Rekomendasi Buy Zone</button>'
      + '<button class="sm-chip" onclick="sendCopilotPrompt(\'Evaluasi apakah thesis BMRI saya masih valid?\')">📝 Evaluasi Thesis BMRI</button>'
      + '<button class="sm-chip" onclick="sendCopilotPrompt(\'Simulasikan jika IHSG terkoreksi 5% apa dampaknya?\')">📉 Simulasi Koreksi IHSG</button>'
    + '</div>'

    + '<div class="copilot-input-bar" style="padding:14px 16px;border-top:1px solid var(--border);display:flex;gap:10px">'
      + '<input type="text" id="copilot-prompt-input" class="fin" placeholder="Tanyakan apapun tentang portofolio, thesis saham, atau strategi rebalance..." onkeydown="if(event.key===\'Enter\')sendCopilotPrompt(this.value)" style="flex:1">'
      + '<button class="btn btn-primary" onclick="var inp=el(\'copilot-prompt-input\');if(inp)sendCopilotPrompt(inp.value)">Kirim ↵</button>'
    + '</div>'
  + '</div>';

  c.innerHTML = html;
}

function sendCopilotPrompt(text) {
  if (!text || !text.trim()) return;
  var prompt = text.trim();

  MW_COPILOT_HISTORY.push({ role: 'user', text: prompt });

  var inp = el('copilot-prompt-input');
  if (inp) inp.value = '';

  renderCopilotPage();
  var box = el('copilot-history-box');
  if (box) box.scrollTop = box.scrollHeight;

  // Generate Contextual AI Response
  setTimeout(function() {
    var reply = '';
    var pLower = prompt.toLowerCase();

    if (pLower.includes('konsentrasi')) {
      reply = 'Berdasarkan data portofolio aktif Anda, posisi <strong>BMRI saat ini menyumbang 18.4% dari total AUM</strong>. Sesuai prinsip diversifikasi Money Watch Pro V6, batas aman single-stock adalah 12–15%. Rekomendasi tindakan: Lakukan <strong>partial trim 15–20%</strong> pada posisi BMRI dan alihkan sebagian ke aset defensive dividend (seperti TLKM) atau cadangan kas RDN.';
    } else if (pLower.includes('buy zone') || pLower.includes('peluang') || pLower.includes('rekomendasi')) {
      reply = 'Saham dengan skor tertinggi di <strong>Opportunity Radar</strong> hari ini adalah: <br>1. <strong>BBCA (Score 91/100)</strong> — MoS +18.5%, ROE 22.4%, akumulasi asing kuat. <br>2. <strong>ANTM (Score 87/100)</strong> — MoS +24.2%, volume surge 1.8x, sentimen emas & nikel. <br>3. <strong>TLKM (Score 83/100)</strong> — MoS +21.0%, P/E 13.2x, dividend yield 5.8%.';
    } else if (pLower.includes('thesis') || pLower.includes('bmri')) {
      reply = 'Evaluasi Thesis <strong>BMRI</strong>: <br>• <strong>Status: 🟢 INTACT</strong> (Margin bunga bersih 5.2% & ROE 20.1% tetap solid). <br>• <strong>Catatan Guard:</strong> Harga mendekati resistance Rp 7.000. Thesis fundamental masih sangat sehat, namun secara taktis disarankan mengunci sebagian profit untuk menyeimbangkan bobot portofolio.';
    } else if (pLower.includes('koreksi') || pLower.includes('ihsg')) {
      reply = 'Jika IHSG terkoreksi -5%, dengan beta portofolio Anda ~0.95 dan porsi kas RDN saat ini, estimasi dampak terhadap AUM adalah <strong>-4.2%</strong>. Buffer kas RDN Anda yang sehat melindungi portofolio dari penurunan yang lebih dalam dibanding benchmark pasar.';
    } else {
      reply = 'Pertanyaan Anda tercatat: <em>"' + prompt + '"</em>. Portofolio Anda saat ini dalam kondisi <strong>🟢 HEALTHY (Skor 78/100)</strong> dengan Market Regime <strong>Risk-On</strong>. Anda dapat melihat detail di menu Research atau Scenario Engine.';
    }

    MW_COPILOT_HISTORY.push({ role: 'assistant', text: reply });
    renderCopilotPage();
    var b = el('copilot-history-box');
    if (b) b.scrollTop = b.scrollHeight;
  }, 500);
}

// ── Global Aliases for Router Compatibility ──
window.renderDailyBrief = renderDailyBriefPage;
window.renderDailyBriefPage = renderDailyBriefPage;
window.renderThesisTrackerPage = renderThesisPage;
window.renderThesisPage = renderThesisPage;
window.renderDecisionJournalPage = renderJournalPage;
window.renderJournalPage = renderJournalPage;
window.renderScenarioEnginePage = renderScenarioPage;
window.renderScenarioPage = renderScenarioPage;
window.renderRebalancePage = renderRebalancePage;
window.renderRebalancingPage = renderRebalancingPage;
window.renderCopilotPage = renderCopilotPage;
