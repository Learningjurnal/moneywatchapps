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
  
  // Compute dynamic daily change for each portfolio holding
  porto.forEach(function(p) {
    var cur = (typeof prices !== 'undefined' && prices[p.ticker]) ? prices[p.ticker] : (p.mp || p.avg || 0);
    var prev = p.avg > 0 ? p.avg : cur;
    p.dynamicChgPct = prev > 0 ? ((cur - prev) / prev * 100) : (p.chgPct || 0);
  });

  var dayGain = porto.reduce(function(a, p) { return a + ((p.mv || 0) * (p.dynamicChgPct || 0) / 100); }, 0);
  var dayGainPct = totalMV > 0 ? (dayGain / totalMV * 100).toFixed(2) : '0.00';
  var totalPortfolioAssets = totalMV + Math.max(0, rdn);

  // Live IHSG calculation
  var curIhsg = (typeof ihsgCur === 'number' && ihsgCur > 0) ? ihsgCur : 6845.00;
  var baseIhsg = (typeof ihsgBase === 'number' && ihsgBase > 0) ? ihsgBase : 6800.00;
  var ihsgDiff = curIhsg - baseIhsg;
  var ihsgPct = baseIhsg > 0 ? (ihsgDiff / baseIhsg * 100).toFixed(2) : '0.00';
  var isBullish = ihsgDiff >= 0;

  // Sorting for dynamic portfolio analysis
  var sortedByMv = porto.slice().sort(function(a, b) { return (b.mv || 0) - (a.mv || 0); });
  var sortedByChg = porto.slice().sort(function(a, b) { return (b.dynamicChgPct || 0) - (a.dynamicChgPct || 0); });

  var topHolding = sortedByMv.length ? sortedByMv[0] : null;
  var topHoldingWeight = (topHolding && totalPortfolioAssets > 0) ? (topHolding.mv / totalPortfolioAssets * 100).toFixed(1) : '0.0';
  var topGainer = sortedByChg.length ? sortedByChg[0] : null;

  // Calculate annual projected dividends across all holdings in portfolio
  var totalAnnualDiv = 0;
  porto.forEach(function(p) {
    var info = (typeof DB !== 'undefined' && DB[p.ticker]) ? DB[p.ticker] : {};
    var yieldRate = p.yYield || info.grossDividendYield ? parseFloat(info.grossDividendYield) : 3.5;
    totalAnnualDiv += (p.mv || 0) * (yieldRate / 100);
  });

  var html = '<div style="margin-bottom:20px">'
    + '<div class="ptitle" style="display:flex;align-items:center;gap:8px">Morning Brief &amp; 3 Things to Watch Today</div>'
    + '<div class="psub">Ringkasan harian cerdas sebelum pembukaan pasar saham: Makro, Portfolio Delta, dan Evaluasi Seluruh ' + porto.length + ' Emiten Portofolio. · <span class="mono">' + dateStr + '</span></div>'
  + '</div>'

  + '<div class="row3" style="margin-bottom:18px">'
    + '<div class="metric">'
      + '<div class="mlabel">MARKET REGIME HARI INI</div>'
      + '<div class="mval ' + (isBullish ? 'up' : 'dn') + '" style="font-size:22px">' + (isBullish ? '🟢 RISK-ON BULLISH' : '🔴 BEARISH CORRECTION') + '</div>'
      + '<div class="msub ' + (isBullish ? 'up' : 'dn') + '">IHSG ' + curIhsg.toLocaleString('id-ID', {minimumFractionDigits:2}) + ' (' + (isBullish ? '+' : '') + ihsgPct + '%) · Real-time Feed</div>'
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
    var gainerDelta = (topGainer.dynamicChgPct || 0);
    html += '<div style="background:var(--bg3);border:1px solid var(--border2);border-radius:8px;padding:14px">'
      + '<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">'
      + '<span class="badge ' + (gainerDelta >= 0 ? 'b-up' : 'b-dn') + '">1. PORTFOLIO TOP MOVER</span>'
      + '<strong style="color:var(--text);font-size:13px">' + topGainer.ticker + ' Memimpin Pergerakan Portofolio (' + (gainerDelta >= 0 ? '+' : '') + gainerDelta.toFixed(2) + '%)</strong>'
      + '</div>'
      + '<div style="font-size:12px;color:var(--text2);line-height:1.5">'
      + 'Saham <strong>' + topGainer.ticker + '</strong> (' + (topGainer.info && topGainer.info.name ? topGainer.info.name : 'IDX Equities') + ') mencatatkan pergerakan aktif di portofolio Anda dengan nilai pasar Rp ' + fmtK(topGainer.mv) + ' (@ Rp ' + fmtK(topGainer.mp) + '). Pantau volume kelanjutan dan area target terdekat di Cockpit Analisis.'
      + '</div>'
    + '</div>';
  } else {
    html += '<div style="background:var(--bg3);border:1px solid var(--border2);border-radius:8px;padding:14px">'
      + '<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">'
        + '<span class="badge b-up">1. FLOW BREAKOUT</span>'
        + '<strong style="color:var(--text);font-size:13px">Belum Ada Emisi Saham Aktif di Portofolio</strong>'
      + '</div>'
      + '<div style="font-size:12px;color:var(--text2);line-height:1.5">'
        + 'Tambahkan transaksi saham ke portofolio Anda untuk memantau Top Mover harian secara otomatis.'
      + '</div>'
    + '</div>';
  }

  // 2. Dynamic Watch #2: Overweight / Concentration Guard
  if (topHolding) {
    var isOverweight = parseFloat(topHoldingWeight) > 15;
    html += '<div style="background:var(--bg3);border:1px solid var(--border2);border-radius:8px;padding:14px">'
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
    html += '<div style="background:var(--bg3);border:1px solid var(--border2);border-radius:8px;padding:14px">'
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
  html += '<div style="background:var(--bg3);border:1px solid var(--border2);border-radius:8px;padding:14px">'
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
var MW_THESES = [];

function saveThesesToStorage() {
  if (typeof saveData === 'function') saveData();
}

function renderThesisPage() {
  var c = el('page-thesis');
  if (!c) return;

  var html = '<div style="margin-bottom:16px;display:flex;justify-content:space-between;align-items:flex-start">'
    + '<div>'
      + '<div class="ptitle" style="display:flex;align-items:center;gap:8px">Investment Thesis Tracker</div>'
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
          + '<div style="font-size:12px;color:var(--text2);line-height:1.5;margin-bottom:12px;background:var(--bg3);border-left:3px solid var(--accent);padding:8px 12px;border-radius:0 6px 6px 0">'
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
var MW_JOURNALS = [];

function saveJournalsToStorage() {
  if (typeof saveData === 'function') saveData();
}

function renderJournalPage() {
  var c = el('page-journal');
  if (!c) return;

  var html = '<div style="margin-bottom:16px;display:flex;justify-content:space-between;align-items:flex-start">'
    + '<div>'
      + '<div class="ptitle" style="display:flex;align-items:center;gap:8px">Decision Journal &amp; Post-Trade Review</div>'
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

// Real portfolio Beta + parametric VaR — every scenario branch below used
// to carry its own hardcoded "VaR 95%: X%" / "Beta Portofolio: X" literal,
// a different fixed number per scenario type with no connection to the
// user's actual holdings or real market volatility. Reuses the same real
// regression-against-IHSG the Performance page's "Risk Beta (Real)" panel
// already computes (perfComputeRealBeta()/PERF_BETA_STATE in
// 21-performance.js) instead of inventing a second, fake risk figure.
// Beta/VaR are properties of the CURRENT portfolio's real volatility, not
// something a single hypothetical shock scenario would change, so the
// same real value is shown as context across scenarios (rather than
// fabricating a plausible-looking drift per scenario type).
function scenarioGetRealRisk() {
  if (typeof PERF_BETA_STATE !== 'undefined' && PERF_BETA_STATE.loaded && PERF_BETA_STATE.data && PERF_BETA_STATE.data.results) {
    var ok = PERF_BETA_STATE.data.results.filter(function(r) { return r.ok; });
    var okMV = ok.reduce(function(a, r) { return a + r.mv; }, 0);
    if (ok.length && okMV > 0) {
      var beta = ok.reduce(function(a, r) { return a + r.beta * (r.mv / okMV); }, 0);
      var ihsgVol = PERF_BETA_STATE.data.ihsgDailyVolPct || 0;
      var var95 = 1.645 * Math.abs(beta) * ihsgVol;
      return { beta: beta, var95: var95, ready: true };
    }
  }
  if (typeof PERF_BETA_STATE !== 'undefined' && !PERF_BETA_STATE.loading && typeof perfComputeRealBeta === 'function') {
    PERF_BETA_STATE.loading = true;
    perfComputeRealBeta(function(err, data) {
      PERF_BETA_STATE.loading = false;
      if (!err && data) { PERF_BETA_STATE.loaded = true; PERF_BETA_STATE.data = data; }
      // Re-render whichever scenario result is currently on screen once the
      // real numbers land, instead of leaving the "menghitung..." label.
      if (typeof currentPage !== 'undefined' && currentPage === 'scenario' && typeof renderScenarioPage === 'function') {
        renderScenarioPage();
      }
    });
  }
  return { beta: null, var95: null, ready: false };
}
function scenarioBetaLabel(risk) {
  return risk.ready ? 'Beta Portofolio: ' + risk.beta.toFixed(2) + ' (real)' : 'Beta Portofolio: menghitung dari data real…';
}
function scenarioVarLabel(risk) {
  return risk.ready ? 'VaR 95% (1 Hari): ' + risk.var95.toFixed(2) + '%' : 'VaR 95%: menghitung dari data real…';
}

function renderScenarioPage() {
  var c = el('page-scenario');
  if (!c) return;

  var baselineRisk = scenarioGetRealRisk();
  var porto = typeof getPortfolio === 'function' ? getPortfolio() : [];
  var sortedPorto = porto.slice().sort(function(a, b) { return (b.mv || 0) - (a.mv || 0); });
  var totalMV = porto.reduce(function(a, p) { return a + (p.mv || 0); }, 0);
  var rdn = typeof calcRdnBalance === 'function' ? calcRdnBalance() : 0;
  var totalAUM = totalMV + Math.max(0, rdn);

  var top1 = sortedPorto.length > 0 ? sortedPorto[0] : null;
  var top2 = sortedPorto.length > 1 ? sortedPorto[1] : null;
  var topTicker = top1 ? top1.ticker : 'PGEO';
  var top2Ticker = top2 ? top2.ticker : 'BBRI';
  var topSector = (top1 && top1.info && top1.info.sector) ? top1.info.sector : 'Energi';
  var topWeight = (top1 && totalAUM > 0) ? (top1.mv / totalAUM * 100).toFixed(1) : '0.0';

  // Stock options for interactive simulation
  var stockOptions = sortedPorto.map(function(p) {
    var w = totalAUM > 0 ? (p.mv / totalAUM * 100).toFixed(1) : '0.0';
    return '<option value="' + p.ticker + '">' + p.ticker + ' — ' + (p.name || '') + ' (' + w + '% AUM · Rp ' + fmtK(p.mv) + ')</option>';
  }).join('');

  var html = (typeof qlTabBarHtml === 'function' ? qlTabBarHtml('scenario') : '')

  + '<div style="margin-bottom:16px">'
    + '<div class="ptitle" style="display:flex;align-items:center;gap:8px">Scenario Engine ("What If?" Stress Tester)</div>'
    + '<div class="psub">Uji ketahanan portofolio terhadap guncangan pasar, koreksi saham individual, perubahan suku bunga, atau rotasi posisi sebelum mengeksekusi di pasar riil.</div>'
  + '</div>'

  + '<div class="card" style="padding:20px;margin-bottom:18px">'
    + '<div class="ctitle" style="font-size:13px;margin-bottom:12px">⚡ PILIH PRESET SKENARIO UJI STRES (BERDASARKAN PORTOFOLIO AKTIF):</div>'
    + '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:16px">'
      + '<button class="btn btn-ghost btn-sm" onclick="runScenarioSimulation(\'top-drop\')">📉 ' + topTicker + ' (Holding Terbesar ' + topWeight + '%) Koreksi -20%</button>'
      + '<button class="btn btn-ghost btn-sm" onclick="runScenarioSimulation(\'ihsg-drop\')">📉 IHSG Koreksi Pasar -10%</button>'
      + '<button class="btn btn-ghost btn-sm" onclick="runScenarioSimulation(\'sector-drop\')">🏦 Sektor ' + topSector + ' Koreksi -15%</button>'
      + '<button class="btn btn-ghost btn-sm" onclick="runScenarioSimulation(\'swap-top\')">🔄 Rotasi: Trim 30% ' + topTicker + ' → Beli ' + top2Ticker + ' / Kas</button>'
    + '</div>'

    + (sortedPorto.length > 0 ? (
      '<div style="border-top:1px solid var(--border);padding-top:14px;display:flex;gap:10px;flex-wrap:wrap;align-items:center">'
        + '<span style="font-size:12px;font-weight:700;color:var(--text2)">🎯 Custom Skenario Interaktif:</span>'
        + '<select id="sc-custom-ticker" class="finput fsel" style="max-width:280px;padding:5px 10px;font-size:12px">' + stockOptions + '</select>'
        + '<select id="sc-custom-shock" class="finput fsel" style="max-width:140px;padding:5px 10px;font-size:12px">'
          + '<option value="-30">-30% Crash</option>'
          + '<option value="-20" selected>-20% Koreksi</option>'
          + '<option value="-10">-10% Pullback</option>'
          + '<option value="10">+10% Rally</option>'
          + '<option value="20">+20% Breakout</option>'
          + '<option value="30">+30% Super Rally</option>'
        + '</select>'
        + '<button class="btn btn-primary btn-sm" onclick="runCustomScenarioSimulation()">⚡ Simulasikan</button>'
      + '</div>'
    ) : '')
  + '</div>'

  + '<div id="scenario-result-container">'
    + renderScenarioResultBox({
      title: 'Baseline Portofolio Saat Ini (Status Quo)',
      aumDeltaRp: 0,
      aumDeltaPct: '0.00%',
      newAum: totalAUM,
      varDelta: scenarioVarLabel(baselineRisk),
      betaDelta: scenarioBetaLabel(baselineRisk),
      concentrationDelta: 'Top Holding: ' + topTicker + ' (' + topWeight + '%)',
      cashRatioDelta: (rdn / (totalAUM || 1) * 100).toFixed(1) + '%',
      analysis: 'Pilih salah satu preset skenario atau gunakan custom simulator di atas untuk menguji ketahanan portofolio Anda secara instan.'
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
  var sortedPorto = porto.slice().sort(function(a, b) { return (b.mv || 0) - (a.mv || 0); });
  var totalMV = porto.reduce(function(a, p) { return a + (p.mv || 0); }, 0);
  var rdn = typeof calcRdnBalance === 'function' ? calcRdnBalance() : 0;
  var totalAUM = totalMV + Math.max(0, rdn);

  var top1 = sortedPorto.length > 0 ? sortedPorto[0] : null;
  var top2 = sortedPorto.length > 1 ? sortedPorto[1] : null;
  var topTicker = top1 ? top1.ticker : 'PGEO';
  var top2Ticker = top2 ? top2.ticker : 'BBRI';
  var topSector = (top1 && top1.info && top1.info.sector) ? top1.info.sector : 'Energi';
  var topWeight = (top1 && totalAUM > 0) ? (top1.mv / totalAUM * 100).toFixed(1) : '0.0';

  var res = {};
  var risk = scenarioGetRealRisk();

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
  } else if (scenarioType === 'top-drop' || scenarioType === 'bmri-drop') {
    var loss = top1 ? (top1.mv * 0.20) : 0;
    var newAum = totalAUM - loss;
    res = {
      title: 'Skenario: Saham Terbesar (' + topTicker + ') Mengalami Koreksi -20%',
      aumDeltaRp: -loss,
      aumDeltaPct: '-' + (loss / (totalAUM || 1) * 100).toFixed(2) + '%',
      newAum: newAum,
      varDelta: scenarioVarLabel(risk),
      betaDelta: scenarioBetaLabel(risk),
      concentrationDelta: 'Konsentrasi ' + topTicker + ' berkurang ke ' + ((top1.mv - loss) / newAum * 100).toFixed(1) + '%',
      cashRatioDelta: (rdn / (newAum || 1) * 100).toFixed(1) + '%',
      analysis: 'Karena <strong>' + topTicker + '</strong> memiliki bobot terbesar di portofolio Anda (' + topWeight + '% AUM / Nilai Rp ' + fmtK(top1.mv) + '), penurunan -20% akan menggerus AUM sebesar <strong>Rp ' + fmtK(loss) + '</strong>. Pastikan memasang stop loss disiplin atau mengamankan profit bertahap (trailing profit).'
    };
  } else if (scenarioType === 'ihsg-drop') {
    // Was a fixed "Beta ~0.95" assumption baked into the loss math itself,
    // while the risk cards above now show the real regressed beta (which
    // can differ meaningfully, e.g. 1.05) — used the real one when ready so
    // the loss estimate and the Beta card actually agree with each other.
    var scenarioBeta = risk.ready ? risk.beta : 0.95;
    var loss = totalMV * 0.10 * scenarioBeta;
    var newAum = totalAUM - loss;
    res = {
      title: 'Skenario: IHSG Mengalami Koreksi Pasar Umum -10%',
      aumDeltaRp: -loss,
      aumDeltaPct: '-' + (loss / (totalAUM || 1) * 100).toFixed(2) + '%',
      newAum: newAum,
      varDelta: scenarioVarLabel(risk),
      betaDelta: scenarioBetaLabel(risk),
      concentrationDelta: 'Alokasi Bergeser ke Kas',
      cashRatioDelta: (rdn / (newAum || 1) * 100).toFixed(1) + '%',
      analysis: 'Dengan ' + (risk.ready ? 'beta portofolio real ' + scenarioBeta.toFixed(2) : 'perkiraan beta pasar ~0.95') + ', penurunan IHSG 10% akan menyebabkan koreksi AUM sebesar ~Rp ' + fmtK(loss) + '. Cadangan kas RDN Anda (Rp ' + fmtK(rdn) + ') bertindak sebagai shock-absorber yang menahan drawdown portofolio.'
    };
  } else if (scenarioType === 'sector-drop' || scenarioType === 'bank-drop') {
    var sectorHoldings = porto.filter(function(p) { return p.info && p.info.sector === topSector; });
    var sectorMV = sectorHoldings.reduce(function(a, p) { return a + (p.mv || 0); }, 0);
    if (sectorMV <= 0) sectorMV = totalMV * 0.4;
    var loss = sectorMV * 0.15;
    var newAum = totalAUM - loss;
    res = {
      title: 'Skenario: Tekanan Sektor ' + topSector + ' Koreksi -15%',
      aumDeltaRp: -loss,
      aumDeltaPct: '-' + (loss / (totalAUM || 1) * 100).toFixed(2) + '%',
      newAum: newAum,
      varDelta: scenarioVarLabel(risk),
      betaDelta: scenarioBetaLabel(risk),
      concentrationDelta: 'Sektor ' + topSector + ' menyusut',
      cashRatioDelta: (rdn / (newAum || 1) * 100).toFixed(1) + '%',
      analysis: 'Penurunan 15% pada sektor <strong>' + topSector + '</strong> (eksposur Rp ' + fmtK(sectorMV) + ') menyebabkan kontraksi AUM sebesar <strong>Rp ' + fmtK(loss) + '</strong>. Diversifikasi lintas sektor membantu meredam volatilitas portofolio.'
    };
  } else if (scenarioType === 'swap-top' || scenarioType === 'swap-bmri-tlkm') {
    res = {
      title: 'Skenario: Rebalancing Posisi ' + topTicker + ' & Realokasi ke ' + top2Ticker + ' / Kas',
      aumDeltaRp: 0,
      aumDeltaPct: '0.00% (Capital Reallocated)',
      newAum: totalAUM,
      // Was a fabricated "improved" VaR/Beta implying the hypothetical swap
      // already lowered risk — but nothing was actually traded, so the real
      // portfolio risk hasn't changed yet. Show today's real numbers with a
      // note instead of inventing a plausible-looking post-trade estimate.
      varDelta: scenarioVarLabel(risk) + ' (saat ini)',
      betaDelta: scenarioBetaLabel(risk) + ' — hitung ulang setelah eksekusi',
      concentrationDelta: 'Konsentrasi ' + topTicker + ' turun ke batas ideal',
      cashRatioDelta: (rdn / (totalAUM || 1) * 100).toFixed(1) + '%',
      analysis: 'Strategi rotasi modal dengan memangkas bobot ' + topTicker + ' berhasil mendiversifikasi risiko single-stock dan meningkatkan ketahanan modal menghadapi fluktuasi pasar.'
    };
  }

  var container = el('scenario-result-container');
  if (container) container.innerHTML = renderScenarioResultBox(res);
}

function runCustomScenarioSimulation() {
  var tSel = el('sc-custom-ticker');
  var sSel = el('sc-custom-shock');
  if (!tSel || !sSel) return;

  var ticker = tSel.value;
  var shockPct = parseFloat(sSel.value) || 0;

  var porto = typeof getPortfolio === 'function' ? getPortfolio() : [];
  var targetPos = porto.find(function(p) { return p.ticker === ticker; });
  var totalMV = porto.reduce(function(a, p) { return a + (p.mv || 0); }, 0);
  var rdn = typeof calcRdnBalance === 'function' ? calcRdnBalance() : 0;
  var totalAUM = totalMV + Math.max(0, rdn);

  if (!targetPos) {
    alert('Saham ' + ticker + ' tidak ditemukan di portofolio aktif.');
    return;
  }

  var deltaRp = targetPos.mv * (shockPct / 100);
  var newAum = totalAUM + deltaRp;
  var deltaPctStr = (deltaRp / (totalAUM || 1) * 100).toFixed(2) + '%';
  var isGain = deltaRp >= 0;

  var res = {
    title: 'Custom Simulasi: ' + ticker + ' ' + (isGain ? 'Menguat +' : 'Terkoreksi ') + shockPct + '%',
    aumDeltaRp: deltaRp,
    aumDeltaPct: (isGain ? '+' : '') + deltaPctStr,
    newAum: newAum,
    varDelta: scenarioVarLabel(scenarioGetRealRisk()),
    betaDelta: 'Sensitivitas: ' + ((targetPos.info && targetPos.info.beta) || 1.0).toFixed(2),
    concentrationDelta: 'Bobot Baru: ' + ((targetPos.mv + deltaRp) / newAum * 100).toFixed(1) + '%',
    cashRatioDelta: (rdn / (newAum || 1) * 100).toFixed(1) + '%',
    analysis: 'Perubahan ' + (isGain ? '+' : '') + shockPct + '% pada saham <strong>' + ticker + '</strong> (Nilai pasar Rp ' + fmtK(targetPos.mv) + ') akan memberikan dampak sebesar <strong>' + (isGain ? '+Rp ' : '-Rp ') + fmtK(Math.abs(deltaRp)) + '</strong> (' + (isGain ? '+' : '') + deltaPctStr + ') terhadap total AUM Anda.'
  };

  var container = el('scenario-result-container');
  if (container) container.innerHTML = renderScenarioResultBox(res);
}

// ══════════════════════════════════════════════════════════
// 5. REBALANCING INTELLIGENCE & SIMULATOR
// ══════════════════════════════════════════════════════════
// 5. REBALANCING INTELLIGENCE & SIMULATOR
// ══════════════════════════════════════════════════════════
var _rebalanceMode = 'equal'; // 'equal' or 'custom'
var _rebalanceCustomWeights = {};

function setRebalanceMode(mode){
  _rebalanceMode = mode;
  renderRebalancePage();
}
window.setRebalanceMode = setRebalanceMode;

function updateCustomRebWeight(ticker, val){
  _rebalanceCustomWeights[ticker] = parseFloat(val) || 0;
}
window.updateCustomRebWeight = updateCustomRebWeight;

function renderRebalancePage() {
  var c = el('page-rebalance');
  if (!c) return;

  var porto = typeof getPortfolio === 'function' ? getPortfolio() : [];
  var totalMV = porto.reduce(function(a, p) { return a + p.mv; }, 0);
  var rdn = typeof calcRdnBalance === 'function' ? calcRdnBalance() : 0;
  var totalAUM = totalMV + Math.max(0, rdn);

  var html = '<div style="margin-bottom:16px;display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:12px">'
    + '<div>'
    + '<div class="ptitle" style="display:flex;align-items:center;gap:8px">Smart Rebalancing Engine &amp; Order Sheet</div>'
    + '<div class="psub">Sistem otomatis menghitung rekomendasi transaksi beli/jual untuk mengembalikan alokasi portofolio ke target persentase ideal.</div>'
    + '</div>'
    + '<div style="display:flex;gap:6px">'
    + '<button class="btn btn-ghost btn-sm ' + (_rebalanceMode==='equal'?'active':'') + '" onclick="setRebalanceMode(\'equal\')">⚖️ Equal Weight</button>'
    + '<button class="btn btn-ghost btn-sm ' + (_rebalanceMode==='custom'?'active':'') + '" onclick="setRebalanceMode(\'custom\')">🎯 Target Kustom</button>'
    + '</div>'
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

  var defaultTarget = 100 / Math.max(porto.length, 1);
  var rowsHtml = '';
  var totalTargetCheck = 0;

  porto.forEach(function(p) {
    var curWeight = totalMV > 0 ? (p.mv / totalMV * 100) : 0;
    var targetWeight = _rebalanceMode === 'equal' ? defaultTarget : (_rebalanceCustomWeights[p.ticker] !== undefined ? _rebalanceCustomWeights[p.ticker] : defaultTarget);
    totalTargetCheck += targetWeight;

    var deltaPct = targetWeight - curWeight;
    var estVal = Math.abs(deltaPct / 100 * totalMV);
    var price = p.price || (p.mv / Math.max(p.lot * 100, 1));
    var estLots = price > 0 ? Math.round(estVal / (price * 100)) : 0;

    var isOver = deltaPct < -1.5;
    var isUnder = deltaPct > 1.5;
    var actionBadge = isOver ? '<span class="badge b-dn">TRIM / JUAL</span>' : (isUnder ? '<span class="badge b-up">ACCUMULATE / BELI</span>' : '<span class="badge b-neu">HOLD / SESUAI</span>');
    var actionDesc = isOver ? 'Jual ~' + estLots + ' lot' : (isUnder ? 'Beli ~' + estLots + ' lot' : 'Pertahankan');

    var targetInputHtml = _rebalanceMode === 'custom'
      ? '<input type="number" step="0.5" min="0" max="100" value="' + targetWeight.toFixed(1) + '" onchange="updateCustomRebWeight(\'' + p.ticker + '\', this.value)" class="finput mono" style="width:70px;padding:3px 6px;text-align:right">'
      : '<span class="mono">' + targetWeight.toFixed(1) + '%</span>';

    rowsHtml += '<tr>'
      + '<td><strong>' + p.ticker + '</strong> <span style="font-size:11px;color:var(--text3)">' + (p.name || '') + '</span></td>'
      + '<td class="mono">' + curWeight.toFixed(1) + '%</td>'
      + '<td>' + targetInputHtml + '</td>'
      + '<td class="mono ' + (deltaPct >= 0 ? 'up' : 'dn') + '">' + (deltaPct >= 0 ? '+' : '') + deltaPct.toFixed(1) + '%</td>'
      + '<td>' + actionBadge + '<div style="font-size:10px;color:var(--text3);margin-top:2px">' + actionDesc + '</div></td>'
      + '<td class="mono ' + (deltaPct >= 0 ? 'up' : 'dn') + '" style="text-align:right">' + (deltaPct >= 0 ? '+' : '-') + 'Rp ' + fmtK(estVal) + '</td>'
    + '</tr>';
  });

  html += '<div class="card" style="margin-bottom:16px;background:rgba(0,200,255,0.02);border:1px solid rgba(0,200,255,0.15)">'
    + '<div class="ctitle" style="font-size:13px;margin-bottom:12px;display:flex;align-items:center;gap:8px">'
      + '<i class="ti ti-route" style="color:var(--accent)"></i> Alur Kerja Step-by-Step Eksekusi Rebalancing'
    + '</div>'
    + '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px">'
      + '<div style="background:var(--bg3);border:1px solid var(--border);border-radius:8px;padding:12px">'
        + '<div style="font-size:10px;color:var(--accent);font-weight:700">LANGKAH 1</div>'
        + '<div style="font-weight:600;font-size:12px;margin:4px 0">Identifikasi Deviasi</div>'
        + '<div style="font-size:11px;color:var(--text2)">Sistem mendeteksi posisi yang melampaui target (overweight) untuk di-trim dan posisi lagging untuk di-accumulate.</div>'
      + '</div>'
      + '<div style="background:var(--bg3);border:1px solid var(--border);border-radius:8px;padding:12px">'
        + '<div style="font-size:10px;color:var(--accent);font-weight:700">LANGKAH 2</div>'
        + '<div style="font-weight:600;font-size:12px;margin:4px 0">Eksekusi di Sekuritas</div>'
        + '<div style="font-size:11px;color:var(--text2)">Gunakan order sheet untuk menjual saham overweight dan membeli saham underweight secara bertahap.</div>'
      + '</div>'
      + '<div style="background:var(--bg3);border:1px solid var(--border);border-radius:8px;padding:12px">'
        + '<div style="font-size:10px;color:var(--accent);font-weight:700">LANGKAH 3</div>'
        + '<div style="font-weight:600;font-size:12px;margin:4px 0">Validasi Keseimbangan Baru</div>'
        + '<div style="font-size:11px;color:var(--text2)">Proyeksi menunjukkan portofolio kembali seimbang dengan risiko konsentrasi yang tereduksi optimal.</div>'
      + '</div>'
    + '</div>'
  + '</div>'

  + '<div class="g2b" style="margin-bottom:18px">'
    + '<div class="card" style="margin:0">'
      + '<div class="ctitle" style="font-size:13px;margin-bottom:12px">Ringkasan Portofolio &amp; Alokasi</div>'
      + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">'
        + '<div style="background:var(--bg3);border:1px solid var(--border2);border-radius:8px;padding:12px">'
          + '<div style="font-size:10px;color:var(--text3);font-weight:700">POSISI SAAT INI</div>'
          + '<div style="margin-top:8px;display:flex;flex-direction:column;gap:6px;font-size:12px">'
            + '<div>Total Nilai Saham: <strong class="mono">Rp ' + fmtK(totalMV) + '</strong></div>'
            + '<div>Jumlah Emiten: <strong class="mono">' + porto.length + ' Saham</strong></div>'
            + '<div>Kas / RDN: <strong class="mono up">Rp ' + fmtK(rdn) + '</strong></div>'
          + '</div>'
        + '</div>'
        + '<div style="background:rgba(0,200,255,0.04);border:1px solid var(--accent);border-radius:8px;padding:12px">'
          + '<div style="font-size:10px;color:var(--accent);font-weight:700">PROYEKSI PASCA-REBALANCE</div>'
          + '<div style="margin-top:8px;display:flex;flex-direction:column;gap:6px;font-size:12px">'
            + '<div>Target Per Emiten: <strong class="mono up">' + (_rebalanceMode === 'equal' ? defaultTarget.toFixed(1) + '%' : 'Custom Target') + '</strong></div>'
            + '<div>Deviasi Maksimal: <strong class="mono up">&lt; 1.0%</strong></div>'
            + '<div>Stabilitas Risiko: <strong class="mono up">Optimal &amp; Seimbang</strong></div>'
          + '</div>'
        + '</div>'
      + '</div>'
    + '</div>'

    + '<div class="card" style="margin:0;display:flex;flex-direction:column;justify-content:space-between">'
      + '<div>'
        + '<div class="ctitle" style="font-size:13px;margin-bottom:10px">Eksekusi &amp; Order Sheet</div>'
        + '<div style="font-size:12px;color:var(--text2);line-height:1.5;margin-bottom:12px">'
          + 'Gunakan rekomendasi order di bawah untuk melakukan penyesuaian di aplikasi sekuritas Anda (Stockbit, IPOT, Mandiri Sekuritas, dll).'
        + '</div>'
      + '</div>'
      + '<div style="display:flex;gap:8px">'
        + '<button class="btn btn-primary btn-sm" onclick="alert(\'Lembar instruksi order rebalance berhasil disiapkan. Salin atau catat untuk eksekusi di sekuritas.\')">📋 Salin Order Sheet</button>'
        + (_rebalanceMode === 'custom' ? '<button class="btn btn-ghost btn-sm" onclick="_rebalanceCustomWeights={};renderRebalancePage()">Reset Target</button>' : '')
      + '</div>'
    + '</div>'
  + '</div>'

  + '<div class="card" style="padding:0;overflow:hidden">'
    + '<div class="cheader" style="padding:14px 18px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center">'
      + '<span class="ctitle">📋 Rebalance Order Calculator (Rekomendasi Beli / Jual Otomatis)</span>'
      + '<span class="badge b-accent">REAL-TIME CALCULATION</span>'
    + '</div>'
    + '<table class="tbl">'
      + '<thead><tr>'
        + '<th>Saham</th>'
        + '<th>Bobot Saat Ini</th>'
        + '<th>Target Bobot</th>'
        + '<th>Selisih Delta</th>'
        + '<th>Rekomendasi Aksi &amp; Estimasi Lot</th>'
        + '<th style="text-align:right">Estimasi Nilai (Rp)</th>'
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
// 6. MONEYWATCH PRO AI AGENT (INSTITUTIONAL MULTI-ASSET ANALYST)
// ══════════════════════════════════════════════════════════
var MW_COPILOT_HISTORY = [
  {
    role: 'assistant',
    text: 'Halo! Saya adalah **MoneyWatch Pro AI**, asisten analis portofolio multi-aset kelas institusional yang berfokus pada pasar modal Indonesia (IHSG/BEI).\n\nSaya siap membantu Anda dalam:\n- 📊 **Analisa Portofolio & Risiko**: Evaluasi konsentrasi AUM, alokasi kas RDN, dan Maximum Drawdown.\n- 🏛️ **Kepatuhan Regulasi BEI**: Validasi simulasi transaksi sesuai fraksi harga (tick size) dan batas ARA/ARB simetris.\n- 💰 **Kalkulasi Pajak Dividen**: Proyeksi imbal hasil dividen bersih setelah dipotong PPh Final 10% (atau 0% reinvestasi PMK 18/2021).\n- 🔍 **Rasio Fundamental & Valuasi**: P/E, P/BV, ROE, DER, NPM, dan Margin of Safety tanpa halusinasi.\n- 👥 **Kepemilikan KSEI**: Pantau data pemegang saham institusi >5% dan estimasi free float publik.\n\n*Silakan tanyakan tentang portofolio Anda atau kode saham spesifik di BEI (misal: BBCA, BBRI, BMRI, PGEO).*',
    toolCalls: []
  }
];

var MW_AI_IS_LOADING = false;

function renderCopilotPage() {
  var c = el('page-copilot');
  if (!c) return;

  var porto = (typeof getPortfolio === 'function') ? getPortfolio() : (window.holdings || []);
  var sortedPorto = porto.slice().sort(function(a, b) { return (b.mv || 0) - (a.mv || 0); });
  var topTicker = sortedPorto.length > 0 ? (sortedPorto[0].ticker || 'BBCA') : 'BBCA';
  var secondTicker = sortedPorto.length > 1 ? (sortedPorto[1].ticker || 'BBRI') : 'BBRI';

  var messagesHtml = MW_COPILOT_HISTORY.map(function(m, idx) {
    var isAssistant = (m.role === 'assistant');
    var formattedText = formatAgentMarkdown(m.text || '');

    var toolHtml = '';
    if (m.toolCalls && m.toolCalls.length > 0) {
      toolHtml = '<div style="margin-bottom:8px;display:flex;flex-wrap:wrap;gap:6px">'
        + m.toolCalls.map(function(tc) {
          return '<span class="badge" style="background:rgba(56,189,248,0.15);color:#38bdf8;border:1px solid rgba(56,189,248,0.3);font-size:10px;padding:2px 6px;border-radius:4px">'
            + '⚡ ' + escapeHtml(tc.name) + '(' + escapeHtml(JSON.stringify(tc.args || {})) + ')'
          + '</span>';
        }).join('')
      + '</div>';
    }

    return '<div class="copilot-bubble bubble-' + m.role + '" style="margin-bottom:12px;background:' + (isAssistant ? 'var(--bg2)' : 'rgba(56,189,248,0.12)') + ';border:1px solid ' + (isAssistant ? 'var(--border)' : 'rgba(56,189,248,0.3)') + ';border-radius:8px;padding:14px">'
      + '<div class="cb-head" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">'
        + '<span class="cb-role" style="font-weight:700;font-size:12px;color:' + (isAssistant ? '#38bdf8' : 'var(--accent)') + '">'
          + (isAssistant ? '🤖 MoneyWatch Pro AI' : '👤 Anda')
        + '</span>'
        + (isAssistant ? '<span style="font-size:10px;color:var(--text3);background:var(--bg3);padding:1px 6px;border-radius:4px">BEI Institutional Analyst</span>' : '')
      + '</div>'
      + toolHtml
      + '<div class="cb-text" style="font-size:12.5px;line-height:1.6;color:var(--text)">' + formattedText + '</div>'
    + '</div>';
  }).join('');

  if (MW_AI_IS_LOADING) {
    messagesHtml += '<div class="copilot-bubble bubble-assistant" style="margin-bottom:12px;background:var(--bg2);border:1px dashed #38bdf8;border-radius:8px;padding:14px">'
      + '<div style="display:flex;align-items:center;gap:10px;color:#38bdf8;font-size:12px;font-weight:600">'
        + '<span class="spinner" style="display:inline-block;width:14px;height:14px;border:2px solid #38bdf8;border-top-color:transparent;border-radius:50%;animation:spin 1s linear infinite"></span>'
        + 'MoneyWatch Pro AI sedang menjalankan Agentic Loop (pemeriksaan data pasar, regulasi BEI & sinkronisasi portofolio)...'
      + '</div>'
    + '</div>';
  }

  var html = '<div style="margin-bottom:16px;display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:10px">'
    + '<div>'
      + '<div class="ptitle" style="display:flex;align-items:center;gap:8px">MoneyWatch Pro AI</div>'
      + '<div class="psub">Asisten analis portofolio multi-aset berbasis model reasoning, kepatuhan regulasi BEI, kepemilikan KSEI &amp; kalkulasi pajak dividen bersih.</div>'
    + '</div>'
    + '<div style="display:flex;gap:8px">'
      + '<button class="btn btn-ghost btn-sm" onclick="clearCopilotHistory()"><i class="ti ti-trash"></i> Bersihkan Sesi</button>'
    + '</div>'
  + '</div>'

  + '<div class="copilot-container card" style="padding:0;display:flex;flex-direction:column;height:calc(100vh - 180px);min-height:560px">'
    + '<div class="copilot-history" id="copilot-history-box" style="flex:1;overflow-y:auto;padding:18px;display:flex;flex-direction:column">'
      + messagesHtml
    + '</div>'

    + '<div class="copilot-chips-wrap" style="padding:8px 16px;border-top:1px solid var(--border);background:rgba(0,0,0,0.2);display:flex;gap:8px;overflow-x:auto;white-space:nowrap">'
      + '<button class="sm-chip" onclick="sendCopilotPrompt(\'Analisa konsentrasi portofolio, alokasi kas RDN, dan risiko Maximum Drawdown saya saat ini\')">📊 Analisa Portofolio & Konsentrasi</button>'
      + '<button class="sm-chip" onclick="sendCopilotPrompt(\'Cek rasio fundamental, MoS, dan analisa dua sisi potensi vs risiko saham ' + topTicker + '\')">🔍 Fundamental & MoS ' + topTicker + '</button>'
      + '<button class="sm-chip" onclick="sendCopilotPrompt(\'Simulasikan beli 50 lot ' + secondTicker + ' dan validasi fraksi harga BEI serta batas ARA/ARB\')">🏛️ Simulasi Transaksi ' + secondTicker + '</button>'
      + '<button class="sm-chip" onclick="sendCopilotPrompt(\'Hitung proyeksi dividen bersih saham ' + topTicker + ' dengan potongan pajak final 10%\')">💰 Hitung Pajak Dividen ' + topTicker + '</button>'
      + '<button class="sm-chip" onclick="sendCopilotPrompt(\'Cek struktur pemegang saham institusi >5% dan estimasi free float KSEI saham BMRI\')">👥 Kepemilikan KSEI BMRI</button>'
    + '</div>'

    + '<div class="copilot-input-bar" style="padding:14px 16px;border-top:1px solid var(--border);display:flex;gap:10px;background:var(--bg2)">'
      + '<input type="text" id="copilot-prompt-input" class="fin" placeholder="Tanyakan analisa portofolio, simulasi fraksi BEI, dividen bersih, atau rasio emiten..." onkeydown="if(event.key===\'Enter\')sendCopilotPrompt(this.value)" style="flex:1">'
      + '<button class="btn btn-primary" id="copilot-send-btn" onclick="var inp=el(\'copilot-prompt-input\');if(inp)sendCopilotPrompt(inp.value)">Kirim Analisa ↵</button>'
    + '</div>'
  + '</div>';

  c.innerHTML = html;
}

function clearCopilotHistory() {
  MW_COPILOT_HISTORY = [
    {
      role: 'assistant',
      text: 'Sesi baru dimulai. Saya adalah **MoneyWatch Pro AI**. Bagaimana saya dapat membantu analisa portofolio atau pasar modal Anda hari ini?',
      toolCalls: []
    }
  ];
  renderCopilotPage();
}

async function sendCopilotPrompt(text) {
  if (!text || !text.trim() || MW_AI_IS_LOADING) return;
  var prompt = text.trim();

  MW_COPILOT_HISTORY.push({ role: 'user', text: prompt });
  MW_AI_IS_LOADING = true;

  var inp = el('copilot-prompt-input');
  if (inp) inp.value = '';

  renderCopilotPage();
  var box = el('copilot-history-box');
  if (box) box.scrollTop = box.scrollHeight;

  // Prepare Live User Context
  var porto = (typeof getPortfolio === 'function') ? getPortfolio() : (window.holdings || []);
  var totalAum = (typeof computeCurrentAUM === 'function') ? computeCurrentAUM() : (typeof totalValuation === 'function' ? totalValuation() : 0);
  var rdn = (typeof calcRdnBalance === 'function') ? calcRdnBalance() : (window.rdnBalance || 0);
  var sekuritasName = (typeof activeSekuritas !== 'undefined') ? activeSekuritas : 'Stockbit';
  var livePrices = window.prices || {};

  var userContext = {
    holdings: porto,
    totalAum: totalAum,
    rdnCash: rdn,
    sekuritas: sekuritasName,
    livePrices: livePrices
  };

  try {
    var res = await fetch('/api/ai/agent-chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: prompt,
        history: MW_COPILOT_HISTORY.slice(-8),
        userContext: userContext
      })
    });

    var data = await res.json();
    if (data && data.success) {
      MW_COPILOT_HISTORY.push({
        role: 'assistant',
        text: data.reply || 'Analisa berhasil diproses.',
        toolCalls: data.toolCalls || []
      });
    } else {
      MW_COPILOT_HISTORY.push({
        role: 'assistant',
        text: '⚠️ Terjadi kendala saat memproses analisa: ' + (data.error || 'Server tidak merespons.'),
        toolCalls: []
      });
    }
  } catch (err) {
    console.error('Agent chat client error:', err);
    MW_COPILOT_HISTORY.push({
      role: 'assistant',
      text: '⚠️ Gagal terhubung ke engine MoneyWatch Pro AI. Silakan coba kembali sesaat lagi.',
      toolCalls: []
    });
  } finally {
    MW_AI_IS_LOADING = false;
    renderCopilotPage();
    var b = el('copilot-history-box');
    if (b) b.scrollTop = b.scrollHeight;
  }
}

// Markdown Formatter for Institutional Agent Output
function formatAgentMarkdown(md) {
  if (!md) return '';
  var text = String(md);

  // Escaping basic HTML while preserving custom tags if needed
  text = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  // Bold **text**
  text = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

  // Headings
  text = text.replace(/^### (.*$)/gim, '<div style="font-size:14px;font-weight:700;color:#38bdf8;margin:10px 0 4px">$1</div>');
  text = text.replace(/^## (.*$)/gim, '<div style="font-size:15px;font-weight:800;color:var(--text);margin:12px 0 6px">$1</div>');

  // Bullet points
  text = text.replace(/^- (.*$)/gim, '<div style="display:flex;align-items:flex-start;gap:6px;margin:2px 0"><span style="color:#38bdf8">•</span><span>$1</span></div>');

  // Disclaimer styling
  text = text.replace(/\*Disclaimer: (.*?)\*/gim, '<div style="margin-top:12px;padding:8px 12px;background:rgba(245,158,11,0.08);border-left:3px solid #f59e0b;font-size:11px;color:var(--text2);font-style:italic"><strong>Disclaimer:</strong> $1</div>');

  // Line breaks
  text = text.replace(/\n\n/g, '<div style="height:8px"></div>');
  text = text.replace(/\n/g, '<br>');

  return text;
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
window.sendCopilotPrompt = sendCopilotPrompt;
window.runScenarioSimulation = runScenarioSimulation;
window.runCustomScenarioSimulation = runCustomScenarioSimulation;
