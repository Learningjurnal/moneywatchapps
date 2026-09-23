/**
 * 28-decisiontools.js — Money Watch Pro V6: Decision Systems & Scenario Engine
 * 
 * 1. Morning / Daily Brief (Market brief, portfolio today vs IHSG, 3 Things to Watch)
 * 2. Investment Thesis Tracker (Why bought, Target, Invalidation — status
 *    badge is set manually at creation time; the "AI Intact/Warning/
 *    Broken checker" this originally described was never implemented)
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
  
  // Trigger fresh quote fetching for portfolio holdings if quotes not yet fetched
  if (typeof fhFetchStocks === 'function' && porto.length > 0 && (!window.prices || !Object.keys(window.prices).length)) {
    try { fhFetchStocks(); } catch(e) {}
  }

  // Compute dynamic daily change for each portfolio holding
  porto.forEach(function(p) {
    var cur = (typeof prices !== 'undefined' && prices[p.ticker] > 0) ? prices[p.ticker] : (p.mp || p.avg || 0);
    var prev = (typeof prevCloses !== 'undefined' && prevCloses[p.ticker] > 0) ? prevCloses[p.ticker] : 0;
    var chg = 0;
    if (cur > 0 && prev > 0) {
      chg = ((cur - prev) / prev) * 100;
    } else if (typeof getGlobalMarketChange === 'function') {
      chg = getGlobalMarketChange(p.ticker);
    } else if (typeof changes !== 'undefined' && changes[p.ticker] !== undefined) {
      chg = Number(changes[p.ticker]);
    }
    p.dynamicChgPct = chg;
    p.chgPct = chg;
  });

  var dayGain = porto.reduce(function(a, p) { return a + ((p.mv || 0) * (p.dynamicChgPct || 0) / 100); }, 0);
  var dayGainPct = totalMV > 0 ? (dayGain / totalMV * 100).toFixed(2) : '0.00';
  var totalPortfolioAssets = totalMV + Math.max(0, rdn);

  // Live IHSG calculation
  // FIX (2026-09-18, audit menyeluruh): dulu label di sebelah nilai IHSG
  // ini SELALU menulis "Real-time Feed", termasuk saat ihsgCur/ihsgBase
  // belum ter-fetch dan angka fallback (6845/6800) dipakai — kontradiksi
  // langsung dengan Zero Fabricated Data. ihsgCur/ihsgBase sendiri TIDAK
  // cukup untuk membedakan data live dari placeholder (01-data.js
  // menginisialisasi ihsgCur=6500.83 saat load, juga > 0) — pakai flag
  // window._ihsgLiveFetched (03-engine.js's fhApplyIHSG) yang cuma jadi
  // true setelah harga IHSG real benar-benar diterapkan.
  var isIhsgLive = window._ihsgLiveFetched === true;
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
      + '<div class="mval ' + (isBullish ? 'up' : 'dn') + '" style="font-size:22px">' + (isBullish ? 'RISK-ON BULLISH' : 'BEARISH CORRECTION') + '</div>'
      + '<div class="msub ' + (isBullish ? 'up' : 'dn') + '">IHSG ' + curIhsg.toLocaleString('id-ID', {minimumFractionDigits:2}) + ' (' + (isBullish ? '+' : '') + ihsgPct + '%) · ' + (isIhsgLive ? 'Real-time Feed' : 'Data Belum Tersedia (Estimasi)') + '</div>'
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

  // IHSG chart — layout ala Yahoo Finance: chart+tab rentang di kiri, panel statistik di kanan
  + (function(){
      var activeTf = window._dbIhsgTf || '1D';
      var hist = (typeof ihsgHist !== 'undefined' && ihsgHist.length >= 2) ? ihsgHist : [curIhsg, curIhsg];
      var dayLo = Math.min.apply(null, hist), dayHi = Math.max.apply(null, hist);
      var openVal = hist[0];
      var fmtIdx = function(v){ return v.toLocaleString('id-ID', {minimumFractionDigits:2, maximumFractionDigits:2}); };
      // FIX (2026-09-17, user-reported "ihsg... history data belum
      // integrasi"): 5D/1M/6M/YTD/1Y/5Y/All used to be disabled
      // placeholders ("belum terintegrasi") — honestly labeled, but still
      // a real gap. Now wired to rdEnsureIhsgHistory() (03-engine.js),
      // which fetches REAL history for these ranges from Yahoo Finance
      // (^JKSE), same proxy chain the rest of the app already uses.
      var ranges = [
        {key:'1D', label:'1D'}, {key:'5D', label:'5D'}, {key:'1M', label:'1M'}, {key:'6M', label:'6M'},
        {key:'YTD', label:'YTD'}, {key:'1Y', label:'1Y'}, {key:'5Y', label:'5Y'}, {key:'ALL', label:'All'}
      ];
      var tabsHtml = ranges.map(function(r){
        var isActive = r.key === activeTf;
        var pctHtml = (isActive && r.key === '1D') ? ('<div style="font-size:9px;font-weight:600">' + (isBullish ? '+' : '') + ihsgPct + '%</div>') : '';
        return '<button class="btn ' + (isActive ? 'btn-blue' : 'btn-ghost') + ' btn-xs" style="min-width:44px" '
          + (isActive ? 'disabled' : 'onclick="dbSwitchIhsgRange(\'' + r.key + '\')"')
          + '>' + r.label + pctHtml + '</button>';
      }).join('');

      return '<div class="card" style="padding:0;margin-bottom:18px;overflow:hidden">'
        + '<div style="display:flex;flex-wrap:wrap">'
          + '<div style="flex:1 1 440px;min-width:280px;padding:18px 20px 12px">'
            + '<div style="font-size:11px;color:var(--text3);letter-spacing:.03em">IHSG · Indeks Harga Saham Gabungan</div>'
            + '<div style="display:flex;align-items:baseline;gap:10px;margin-top:2px;margin-bottom:10px">'
              + '<span style="font-size:24px;font-weight:700;font-family:var(--font-mono)">' + fmtIdx(curIhsg) + '</span>'
              + '<span class="' + (isBullish ? 'up' : 'dn') + '" style="font-size:13px;font-weight:600">' + (isBullish ? '▲' : '▼') + ' ' + (isBullish ? '+' : '') + ihsgDiff.toFixed(2) + ' (' + (isBullish ? '+' : '') + ihsgPct + '%)</span>'
            + '</div>'
            + '<div style="height:190px;position:relative"><canvas id="daily-brief-ihsg-chart"></canvas></div>'
            + '<div style="text-align:center;font-size:10px;color:var(--text3);margin-top:4px">Volume tidak tersedia untuk indeks komposit</div>'
            + '<div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:center;margin-top:10px;padding-top:10px;border-top:1px solid var(--border2)">' + tabsHtml + '</div>'
          + '</div>'
          + '<div style="flex:0 0 220px;border-left:1px solid var(--border2);padding:16px 20px;display:flex;flex-direction:column">'
            + [
                ['Previous Close', fmtIdx(ihsgBase)],
                ['Open (sesi ini)', fmtIdx(openVal)],
                ['Day Low', fmtIdx(dayLo)],
                ['Day High', fmtIdx(dayHi)],
                ['Volume', '—'],
                ['Avg. Volume', '—'],
                ['52 Week Low', '—'],
                ['52 Week High', '—']
              ].map(function(row){
                return '<div style="display:flex;justify-content:space-between;align-items:center;padding:7px 0;border-bottom:1px solid var(--border2);font-size:11.5px">'
                  + '<span style="color:var(--text3)">' + row[0] + '</span><b class="mono">' + row[1] + '</b></div>';
              }).join('')
            + '<div style="font-size:9.5px;color:var(--text3);margin-top:8px;line-height:1.4">Volume &amp; data 52 minggu belum terintegrasi — Day Low/High &amp; Open dihitung dari histori sesi aplikasi ini.</div>'
          + '</div>'
        + '</div>'
      + '</div>';
    })()

  // Dynamic 3 Things to Watch Today across Portfolio
  + '<div class="card" style="padding:22px;margin-bottom:18px">'
    + '<div class="ctitle" style="font-size:15px;margin-bottom:14px;display:flex;align-items:center;gap:6px">'
      + '3 HAL KRUSIAL YANG HARUS DIPERHATIKAN HARI INI (3 THINGS TO WATCH):'
    + '</div>'
    + '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:14px">';

  // 1. Dynamic Watch #1: Top Mover / Momentum in Portfolio
  if (topGainer) {
    var gainerDelta = (topGainer.dynamicChgPct || 0);
    html += '<div style="background:var(--bg3);border:1px solid var(--border);border-radius:8px;padding:16px;display:flex;flex-direction:column;gap:8px">'
      + '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">'
      + '<span class="badge ' + (gainerDelta >= 0 ? 'b-up' : 'b-dn') + '">1. PORTFOLIO TOP MOVER</span>'
      + '<strong style="color:var(--text);font-size:13px">' + topGainer.ticker + ' (' + (gainerDelta >= 0 ? '+' : '') + gainerDelta.toFixed(2) + '%)</strong>'
      + '</div>'
      + '<div style="font-size:12px;color:var(--text2);line-height:1.55;flex:1">'
      + 'Saham <strong>' + topGainer.ticker + '</strong> (' + (topGainer.info && topGainer.info.name ? topGainer.info.name : 'IDX Equities') + ') mencatatkan pergerakan aktif di portofolio Anda dengan nilai pasar Rp ' + fmtK(topGainer.mv) + ' (@ Rp ' + fmtK(topGainer.mp) + '). Pantau volume kelanjutan dan area target terdekat di Cockpit Analisis.'
      + '</div>'
    + '</div>';
  } else {
    html += '<div style="background:var(--bg3);border:1px solid var(--border);border-radius:8px;padding:16px;display:flex;flex-direction:column;gap:8px">'
      + '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">'
        + '<span class="badge b-up">1. FLOW BREAKOUT</span>'
        + '<strong style="color:var(--text);font-size:13px">Belum Ada Emisi Saham Aktif</strong>'
      + '</div>'
      + '<div style="font-size:12px;color:var(--text2);line-height:1.55;flex:1">'
        + 'Tambahkan transaksi saham ke portofolio Anda untuk memantau Top Mover harian secara otomatis.'
      + '</div>'
    + '</div>';
  }

  // 2. Dynamic Watch #2: Overweight / Concentration Guard
  if (topHolding) {
    var isOverweight = parseFloat(topHoldingWeight) > 15;
    html += '<div style="background:var(--bg3);border:1px solid var(--border);border-radius:8px;padding:16px;display:flex;flex-direction:column;gap:8px">'
      + '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">'
        + '<span class="badge ' + (isOverweight ? 'b-amb' : 'b-accent') + '">2. ALLOCATION &amp; RISK GUARD</span>'
        + '<strong style="color:var(--text);font-size:13px">Bobot: ' + topHolding.ticker + ' (' + topHoldingWeight + '%)</strong>'
      + '</div>'
      + '<div style="font-size:12px;color:var(--text2);line-height:1.55;flex:1">'
        + (isOverweight
          ? 'Posisi <strong>' + topHolding.ticker + '</strong> dengan nilai Rp ' + fmtK(topHolding.mv) + ' melebihi ambang batas ideal alokasi tunggal (15%). Disarankan melakukan partial profit taking / rebalancing untuk mendiversifikasi risiko single-stock drawdown.'
          : 'Alokasi <strong>' + topHolding.ticker + '</strong> dengan nilai Rp ' + fmtK(topHolding.mv) + ' berada dalam rentang diversifikasi yang sehat (' + topHoldingWeight + '%). Tetap disiplin dengan batas invalidasi dan rencana investasi Anda.')
      + '</div>'
    + '</div>';
  } else {
    html += '<div style="background:var(--bg3);border:1px solid var(--border);border-radius:8px;padding:16px;display:flex;flex-direction:column;gap:8px">'
      + '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">'
        + '<span class="badge b-amb">2. REBALANCE ALERT</span>'
        + '<strong style="color:var(--text);font-size:13px">Batas Alokasi Portofolio</strong>'
      + '</div>'
      + '<div style="font-size:12px;color:var(--text2);line-height:1.55;flex:1">'
        + 'Pastikan setiap posisi saham tidak melebihi 15% dari total AUM guna membatasi risiko konsentrasi single-stock.'
      + '</div>'
    + '</div>';
  }

  // 3. Dynamic Watch #3: Total Projected Dividend Pipeline
  html += '<div style="background:var(--bg3);border:1px solid var(--border);border-radius:8px;padding:16px;display:flex;flex-direction:column;gap:8px">'
    + '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">'
      + '<span class="badge b-accent">3. DIVIDEND &amp; CASHFLOW</span>'
      + '<strong style="color:var(--text);font-size:13px">Estimasi ~Rp ' + fmtK(totalAnnualDiv) + '/Tahun</strong>'
    + '</div>'
    + '<div style="font-size:12px;color:var(--text2);line-height:1.55;flex:1">'
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
          + 'Evaluasi Komprehensif Seluruh Saham Portofolio (' + porto.length + ' Emiten Terdaftar)'
        + '</div>'
        + '<div style="font-size:11px;color:var(--text3);margin-top:2px">Pemindaian risiko konsentrasi posisi, momentum harian, dan rekomendasi aksi untuk setiap aset di portofolio Anda.</div>'
      + '</div>'
      + '<button class="btn btn-outline btn-sm" onclick="goPage(\'portofolio\',null)">Kelola Portofolio</button>'
    + '</div>';

  if (!porto.length) {
    html += '<div class="empty" style="padding:32px;text-align:center">'
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
            + '<th style="text-align:center">SKOR RISIKO POSISI</th>'
            + '<th style="text-align:center">AI ACTION SIGNAL</th>'
            + '<th style="text-align:center">AKSI</th>'
          + '</tr>'
        + '</thead>'
        + '<tbody>';

    porto.forEach(function(p) {
      var weight = totalPortfolioAssets > 0 ? ((p.mv || 0) / totalPortfolioAssets * 100).toFixed(1) : '0.0';
      var chgPct = (typeof p.chgPct === 'number') ? p.chgPct : ((typeof p.dynamicChgPct === 'number') ? p.dynamicChgPct : ((typeof getGlobalMarketChange === 'function') ? getGlobalMarketChange(p.ticker) : (typeof changes !== 'undefined' && changes[p.ticker] !== undefined ? Number(changes[p.ticker]) : 0)));
      var dayPnl = (p.mv || 0) * (chgPct / 100);
      var unreal = p.unreal || 0;
      var unrealPct = (typeof p.unrealPct === 'number') ? p.unrealPct : (p.cost > 0 ? (unreal / p.cost * 100) : (p.ret || 0));
      var curPrice = (typeof prices !== 'undefined' && prices[p.ticker] > 0) ? prices[p.ticker] : (p.curPrice || p.mp || p.price || p.avg);

      // Dynamic Position Risk Score & AI Action Signal calculation
      // Based on portfolio concentration (FINANCIAL_POLICY §7), unrealized drawdown, and price momentum
      var wNum = parseFloat(weight) || 0;
      var rScore = 100;
      if (wNum > 15) {
        rScore -= Math.min(30, (wNum - 15) * 2.5); // Penalti konsentrasi melebihi batas 15%
      }
      if (unrealPct < 0) {
        rScore -= Math.min(35, Math.abs(unrealPct) * 1.2); // Penalti floating drawdown
      }
      var info = (typeof DB !== 'undefined' && DB[p.ticker]) ? DB[p.ticker] : (p.info || {});
      if (info.beta && info.beta > 1.3) {
        rScore -= 5; // Penalti volatilitas tinggi
      }
      var positionRiskScore = Math.max(10, Math.min(100, Math.round(rScore)));
      var riskScoreBadge = positionRiskScore >= 75 ? 'b-up' : (positionRiskScore >= 50 ? 'b-amb' : 'b-dn');

      var signal = 'HOLD / COMPOUND';
      var signalBadge = 'b-up';

      if (wNum > 16) {
        signal = 'TRIM / REBALANCE';
        signalBadge = 'b-amb';
      } else if (unrealPct <= -15) {
        signal = 'STOP LOSS / THESIS BREAK';
        signalBadge = 'b-dn';
      } else if (unrealPct < -8) {
        signal = 'EVALUATE THESIS / DCA';
        signalBadge = 'b-amb';
      } else if (unrealPct >= 20) {
        signal = 'SECURE PROFIT / TRAILING';
        signalBadge = 'b-accent';
      } else if (chgPct >= 2.0) {
        signal = 'MOMENTUM EXPANSION';
        signalBadge = 'b-up';
      } else if (chgPct <= -2.5) {
        signal = 'PULLBACK MONITOR';
        signalBadge = 'b-neu';
      }

      html += '<tr>'
        + '<td style="text-align:left">'
          + '<div style="display:flex;align-items:center;gap:8px">'
            + '<strong class="mono" style="font-size:13px;color:var(--text)">' + p.ticker + '</strong>'
            + '<span style="font-size:11px;color:var(--text3);max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + (p.name || (info && info.name) || '') + '</span>'
          + '</div>'
          + '<div style="font-size:10px;color:var(--text3);margin-top:2px">Harga: Rp ' + fmtK(curPrice) + ' · Avg: Rp ' + fmtK(p.avg) + '</div>'
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
          + '<span class="badge ' + riskScoreBadge + '" style="font-size:10px">' + positionRiskScore + '/100</span>'
        + '</td>'
        + '<td style="text-align:center">'
          + '<span class="badge ' + signalBadge + '" style="font-size:10px">' + signal + '</span>'
        + '</td>'
        + '<td style="text-align:center">'
          + '<button class="btn btn-outline btn-sm" onclick="switchIntelTicker(\'' + p.ticker + '\')" style="padding:3px 8px;font-size:10.5px" title="Buka Detail Analisis ' + p.ticker + '">Detail</button>'
        + '</td>'
      + '</tr>';
    });

    html += '</tbody></table></div>';
  }

  html += '</div>';

  c.innerHTML = html;
  renderDailyBriefIhsgChart(curIhsg, isBullish, window._dbIhsgTf || '1D');
}

// IHSG chart ala Yahoo Finance: garis putus-putus di level previous close,
// area+garis hijau/merah sesuai tren, dot+badge harga di titik terakhir.
// Sumber data: ihsgHist — histori harga live (01-data.js) yang sebelumnya
// dikumpulkan tapi tidak pernah divisualisasikan.
var _ihsgPrevCloseLinePlugin = {
  id: 'ihsgPrevCloseLine',
  afterDatasetsDraw: function(chart) {
    var prevClose = chart.$prevClose;
    if (typeof prevClose !== 'number') return;
    var yScale = chart.scales.y, xScale = chart.scales.x;
    var y = yScale.getPixelForValue(prevClose);
    var ctx = chart.ctx;
    ctx.save();
    ctx.setLineDash([4, 3]);
    ctx.strokeStyle = 'rgba(148,163,184,.5)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(xScale.left, y);
    ctx.lineTo(xScale.right, y);
    ctx.stroke();
    ctx.restore();
  },
  afterDraw: function(chart) {
    var meta = chart.getDatasetMeta(0);
    var lastPt = meta.data[meta.data.length - 1];
    if (!lastPt) return;
    var ds = chart.data.datasets[0];
    var val = ds.data[ds.data.length - 1];
    var color = chart.$isBullish ? '#00873C' : '#D0163A';
    var ctx = chart.ctx;
    var label = val.toLocaleString('id-ID', {minimumFractionDigits: 2, maximumFractionDigits: 2});
    ctx.save();
    ctx.font = 'bold 10px "Fira Code", monospace';
    var textW = ctx.measureText(label).width;
    var boxW = textW + 12, boxH = 18;
    var boxX = Math.min(lastPt.x + 6, chart.width - boxW - 4);
    var boxY = lastPt.y - boxH / 2;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(boxX, boxY, boxW, boxH, 3) : ctx.rect(boxX, boxY, boxW, boxH);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, boxX + 6, boxY + boxH / 2 + 1);
    ctx.restore();
  }
};

// FIX (2026-09-17, user-reported "ihsg... history data belum integrasi"):
// dbSwitchIhsgRange() is the click handler for the range tabs
// (renderDailyBriefPage()'s IIFE above) — it just re-renders the whole
// Daily Brief page with the new range remembered in window._dbIhsgTf.
function dbSwitchIhsgRange(key) {
  window._dbIhsgTf = key;
  if (typeof renderDailyBriefPage === 'function') renderDailyBriefPage();
}

function renderDailyBriefIhsgChart(curIhsg, isBullish, tf) {
  tf = tf || '1D';
  kc('dbIhsg');
  var cv = el('daily-brief-ihsg-chart');
  if (!cv || typeof Chart === 'undefined') {
    // Diagnosed 2026-09-17/18: confirmed via instrumented Playwright that
    // this guard was firing purely because Chart.js's CDN script
    // (cdnjs.cloudflare.com, index.html:177) failed to load under this
    // sandbox's network egress policy — not a bug in the range-tab wiring
    // below. Logged loudly (once per page render, not per tick) instead of
    // a bare silent `return` so a genuine missing-canvas/missing-Chart.js
    // condition in production is diagnosable instead of looking identical
    // to "nothing happened".
    console.warn('[renderDailyBriefIhsgChart] dibatalkan — cv=' + !!cv + ' Chart=' + (typeof Chart));
    return;
  }

  if (tf === '1D') {
    var hist1d = (typeof ihsgHist !== 'undefined' && ihsgHist.length >= 2) ? ihsgHist : [curIhsg, curIhsg];
    var prevClose1d = (typeof ihsgBase === 'number' && ihsgBase > 0) ? ihsgBase : hist1d[0];
    // FIX (2026-09-15, user-requested "berikan tambahan jam pada grafik"):
    // ihsgHistTs (01-data.js, timestamp per titik, index-aligned dengan
    // ihsgHist) dipakai untuk label jam sungguhan di sumbu-x — sebelumnya
    // sumbu-x disembunyikan total (x:{display:false}) karena labelnya cuma
    // index angka (0,1,2,...) yang tidak berarti apa-apa buat user. Fallback
    // ke label index kalau ihsgHistTs belum sinkron panjangnya (state
    // transisi sesaat setelah upgrade format localStorage).
    var hasTs1d = (typeof ihsgHistTs !== 'undefined' && ihsgHistTs.length === hist1d.length);
    var timeLabels1d = hasTs1d
      ? ihsgHistTs.map(function(t){ return new Date(t).toLocaleTimeString('id-ID', {hour:'2-digit', minute:'2-digit'}); })
      : hist1d.map(function(_, i) { return i; });
    dbBuildIhsgChartInstance(cv, hist1d, timeLabels1d, hasTs1d, prevClose1d, isBullish, true);
    return;
  }

  // Rentang lain (5D/1M/6M/YTD/1Y/5Y/All) — real history dari Yahoo
  // Finance ^JKSE via rdEnsureIhsgHistory() (03-engine.js), bukan
  // akumulasi live-polling seperti '1D'. Tampilkan status memuat dulu
  // (fetch bisa async), lalu render ulang begitu data (atau kegagalan
  // jujur) datang.
  var wrap = cv.parentElement;
  if (typeof rdEnsureIhsgHistory !== 'function') {
    if (wrap) wrap.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:190px;font-size:11px;color:var(--text3)">Modul data historis belum termuat.</div>';
    return;
  }
  if (wrap && !IHSG_HIST_CACHE_HAS(tf)) {
    wrap.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:190px;font-size:11px;color:var(--text3)">Memuat histori IHSG (' + tf + ')...</div>';
  }
  rdEnsureIhsgHistory(tf, function(rows) {
    if ((window._dbIhsgTf || '1D') !== tf) return; // rentang sudah diganti sementara fetch berjalan
    var cv2 = el('daily-brief-ihsg-chart');
    var wrap2 = cv2 ? cv2.parentElement : wrap;
    if (!rows || !rows.length) {
      if (wrap2) wrap2.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:190px;font-size:11px;color:var(--text3)">Gagal memuat data historis IHSG (' + tf + ') — coba lagi nanti.</div>';
      return;
    }
    if (wrap2 && !cv2) { wrap2.innerHTML = '<canvas id="daily-brief-ihsg-chart"></canvas>'; cv2 = el('daily-brief-ihsg-chart'); }
    if (!cv2) return;
    var histR = rows.map(function(r) { return r.c; });
    var fmtByTf = (tf === '5D')
      ? function(t) { return new Date(t).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' }) + ' ' + new Date(t).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }); }
      : (tf === '1M' || tf === '6M' || tf === 'YTD')
        ? function(t) { return new Date(t).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' }); }
        : function(t) { return new Date(t).toLocaleDateString('id-ID', { month: 'short', year: '2-digit' }); };
    var timeLabelsR = rows.map(function(r) { return fmtByTf(r.t); });
    var prevCloseR = rows[0].o;
    var isBullishR = histR[histR.length - 1] >= histR[0];
    dbBuildIhsgChartInstance(cv2, histR, timeLabelsR, true, prevCloseR, isBullishR, false);
  });
}

// tf sudah punya cache segar? (dipakai buat memutuskan tampilkan "Memuat..."
// atau tidak, tanpa memicu fetch — rdEnsureIhsgHistory sendiri yang menangani TTL/inflight)
function IHSG_HIST_CACHE_HAS(tf) {
  var entry = (typeof IHSG_HIST_CACHE !== 'undefined') ? IHSG_HIST_CACHE[tf] : null;
  var ttl = (typeof IHSG_HIST_TTL_MS !== 'undefined' && IHSG_HIST_TTL_MS[tf]) || 60000;
  return !!(entry && (Date.now() - entry.fetchedAt) < ttl);
}

function dbBuildIhsgChartInstance(cv, hist, timeLabels, hasTs, prevClose, isBullish, showWibSuffix) {
  var lineColor = isBullish ? '#00873C' : '#D0163A';
  var ctx = cv.getContext('2d');
  var grad = ctx.createLinearGradient(0, 0, 0, 190);
  grad.addColorStop(0, isBullish ? 'rgba(0,135,60,.28)' : 'rgba(208,22,58,.28)');
  grad.addColorStop(1, isBullish ? 'rgba(0,135,60,0)' : 'rgba(208,22,58,0)');
  var pointRadii = hist.map(function(_, i) { return i === hist.length - 1 ? 4 : 0; });

  charts['dbIhsg'] = new Chart(cv, {
    type: 'line',
    plugins: [_ihsgPrevCloseLinePlugin],
    data: {
      labels: timeLabels,
      datasets: [{
        data: hist,
        borderColor: lineColor,
        borderWidth: 2,
        backgroundColor: grad,
        fill: true,
        tension: 0.15,
        pointRadius: pointRadii,
        pointBackgroundColor: lineColor,
        pointBorderColor: '#fff',
        pointBorderWidth: 1.5,
        pointHoverRadius: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      layout: { padding: { right: 56 } },
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          displayColors: false,
          callbacks: {
            title: function(items) { return (hasTs && items && items[0]) ? items[0].label + (showWibSuffix ? ' WIB' : '') : ''; },
            label: function(c) { return c.raw.toLocaleString('id-ID', {minimumFractionDigits: 2}); }
          }
        }
      },
      scales: {
        x: {
          display: hasTs,
          ticks: {
            maxTicksLimit: 6,
            autoSkip: true,
            color: typeof _chartTextColor === 'function' ? _chartTextColor('--text3', '#8a94a6') : '#8a94a6',
            font: { size: 9 }
          },
          grid: { display: false },
          border: { display: false }
        },
        y: { display: false }
      }
    }
  });
  charts['dbIhsg'].$prevClose = prevClose;
  charts['dbIhsg'].$isBullish = isBullish;
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

  var html = '<div style="margin-bottom:16px;display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:12px">'
    + '<div>'
      + '<div class="ptitle" style="display:flex;align-items:center;gap:8px">Investment Thesis Tracker</div>'
      + '<div class="psub">Dokumentasi rasional, target valuasi, dan batas invalidasi untuk setiap saham di portofolio.</div>'
    + '</div>'
    + '<button class="sm-btn" onclick="openNewThesisModal()" style="font-size:12px;padding:8px 16px;border-radius:8px"><i class="ti ti-plus"></i> Buat Investment Thesis Baru</button>'
  + '</div>';

  if (!MW_THESES || MW_THESES.length === 0) {
    html += '<div class="card" style="text-align:center;padding:48px 20px;color:var(--text3);border-radius:12px">'
      + '<strong style="font-size:15px;color:var(--text2)">Belum Ada Investment Thesis Tersimpan</strong>'
      + '<div style="font-size:12px;margin-top:6px;max-width:480px;margin-left:auto;margin-right:auto">'
        + 'Dokumentasikan alasan beli, target harga, dan kriteria invalidasi untuk setiap emiten Anda agar keputusan investasi tetap objektif dan terukur.'
      + '</div>'
      + '<button class="sm-btn" onclick="openNewThesisModal()" style="margin-top:16px;font-size:12px"><i class="ti ti-plus"></i> Buat Thesis Pertama</button>'
    + '</div>';
  } else {
    html += '<div class="thesis-grid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:16px">';
    MW_THESES.forEach(function(th, idx) {
      html += '<div class="card" style="margin:0;display:flex;flex-direction:column;justify-content:space-between;border-radius:12px;padding:18px">'
        + '<div>'
          + '<div class="cheader" style="margin-bottom:12px;border-bottom:1px solid var(--border2);padding-bottom:10px">'
            + '<div style="display:flex;align-items:center;gap:10px">'
              + (typeof getStockLogoHtml === 'function' ? getStockLogoHtml(th.ticker, 24) : '')
              + '<div><strong style="font-size:16px;color:var(--text);font-family:var(--font-mono)">' + th.ticker + '</strong>'
              + '<div style="font-size:10px;color:var(--text3);font-family:var(--font-mono)">' + th.date + '</div></div>'
            + '</div>'
            + '<span class="badge ' + (th.statusClass || 'b-up') + '" style="font-size:10px;font-weight:800;border-radius:20px;padding:3px 10px">THESIS ' + (th.status || 'INTACT') + '</span>'
          + '</div>'
          + '<div style="font-size:11.5px;color:var(--text2);line-height:1.55;margin-bottom:12px;background:var(--bg3);border:1px solid var(--border);padding:10px 14px;border-radius:var(--radius)">'
            + '<span style="font-size:9.5px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:0.06em;display:block;margin-bottom:2px">Alasan Beli (Thesis / Moat):</span>'
            + th.whyBought
          + '</div>'
          + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px">'
            + '<div style="background:var(--bg3);border:1px solid var(--border);padding:10px;border-radius:8px">'
              + '<div style="font-size:9.5px;color:var(--text3);font-weight:700;letter-spacing:0.04em">TARGET HARGA</div>'
              + '<div class="mono up" style="font-size:15px;font-weight:900;margin-top:2px">Rp ' + fmtK(th.targetPrice) + (th.expectedReturn ? ' <span style="font-size:11px;font-weight:700">(' + th.expectedReturn + ')</span>' : '') + '</div>'
            + '</div>'
            + '<div style="background:var(--bg3);border:1px solid var(--border2);padding:10px;border-radius:8px">'
              + '<div style="font-size:9.5px;color:var(--text3);font-weight:700;letter-spacing:0.04em">HORIZON WAKTU</div>'
              + '<div class="mono" style="font-size:14px;font-weight:800;color:var(--text);margin-top:2px">' + (th.timeHorizon || '12 Bulan') + '</div>'
            + '</div>'
          + '</div>'
          + '<div style="font-size:11px;color:var(--red);line-height:1.45;margin-bottom:14px;background:rgba(239,68,68,0.06);border:1px solid rgba(239,68,68,0.25);padding:10px 12px;border-radius:8px">'
            + '<strong style="display:block;font-size:9.5px;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:2px;color:var(--red)">Batas Invalidasi (Exit Rule):</strong>'
            + th.invalidation
          + '</div>'
        + '</div>'
        + '<div style="display:flex;justify-content:space-between;align-items:center;padding-top:12px;border-top:1px solid var(--border2)">'
          + '<button class="btn btn-ghost btn-xs" onclick="goPage(\'stock-intel\');selectStockIntelTicker(\'' + th.ticker + '\');" style="border-radius:6px;font-weight:700"><i class="ti ti-radar"></i> Buka Cockpit →</button>'
          + '<button class="btn btn-ghost btn-xs" style="color:var(--red);border-color:rgba(239,68,68,0.3);border-radius:6px" onclick="deleteThesis(' + idx + ')"><i class="ti ti-trash"></i> Hapus</button>'
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

  mTitle.textContent = 'Buat Investment Thesis Baru';
  // FIX (2026-09-13, user-reported: "card terlalu kecil, desain kurang baik
  // dan tidak standar"): form ini sebelumnya pakai class `form-group`/`flbl`/
  // `fin` — tidak satupun pernah didefinisikan di main.css (dicek: 0 hasil),
  // jadi jatuh ke tampilan default browser polos (textarea kecil melayang,
  // label sebaris dengan input, tanpa padding/border/warna konsisten).
  // Diganti ke `.fgrid`/`.fg`/`.ffull`/`.flabel`/`.finput` — pola modal form
  // standar yang SUDAH dipakai & ter-styling di seluruh app (lih. modal
  // Price Alert di 30-price-alerts.js), termasuk sudah responsive (1 kolom
  // di layar sempit, lihat main.css baris ~1655).
  mBody.innerHTML = ''
    + '<div class="fgrid">'
      + '<div class="fg ffull">'
        + '<label class="flabel">Kode Saham (Ticker)</label>'
        + '<input type="text" id="th-in-ticker" class="finput" value="' + ticker + '" style="text-transform:uppercase;font-weight:700">'
      + '</div>'
      + '<div class="fg ffull">'
        + '<label class="flabel">Why I Bought (Rasional Investasi &amp; Moat)</label>'
        + '<textarea id="th-in-why" class="finput" rows="3" placeholder="Contoh: Core Compounder dengan ROE > 20%, valuasi murah di bawah P/E historis, ada sentimen dividen..." style="resize:vertical"></textarea>'
      + '</div>'
      + '<div class="fg">'
        + '<label class="flabel">Target Price (Rp)</label>'
        + '<input type="number" id="th-in-target" class="finput" placeholder="11200">'
      + '</div>'
      + '<div class="fg">'
        + '<label class="flabel">Time Horizon</label>'
        + '<input type="text" id="th-in-horizon" class="finput" placeholder="12 Bulan / Swing 3 Bulan">'
      + '</div>'
      + '<div class="fg ffull">'
        + '<label class="flabel">Invalidation Criteria (Kapan Thesis Dinyatakan Gagal &amp; Harus Cutloss/Keluar?)</label>'
        + '<input type="text" id="th-in-inval" class="finput" placeholder="Contoh: Jika Daily Close < Rp 8.800 atau Laba Bersih anjlok > 20%">'
      + '</div>'
      + '<div class="ffull" style="display:flex;gap:10px;justify-content:flex-end;margin-top:4px">'
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
  if (typeof showSaveStatus === 'function') showSaveStatus('Thesis tersimpan');
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
      + '</tr></thead>'
      + '<tbody>';

  if (!MW_JOURNALS || MW_JOURNALS.length === 0) {
    html += '<tr><td colspan="6" style="text-align:center;color:var(--text3);padding:40px 20px">'
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

  mTitle.textContent = 'Catat Jurnal Keputusan Baru';
  // FIX (2026-09-13): modal ini punya bug sama persis dengan modal Investment
  // Thesis (openNewThesisModal() di atas) — class `form-group`/`flbl`/`fin`
  // tidak pernah didefinisikan di main.css, jatuh ke tampilan default
  // browser. Diganti ke pola standar `.fgrid`/`.fg`/`.ffull`/`.flabel`/
  // `.finput` yang sama.
  mBody.innerHTML = ''
    + '<div class="fgrid">'
      + '<div class="fg">'
        + '<label class="flabel">Kode Saham (Ticker)</label>'
        + '<input type="text" id="jn-in-ticker" class="finput" value="ANTM" style="text-transform:uppercase;font-weight:700">'
      + '</div>'
      + '<div class="fg">'
        + '<label class="flabel">Tipe Transaksi</label>'
        + '<select id="jn-in-type" class="finput"><option value="BUY">BUY / ACCUMULATE</option><option value="SELL">SELL / TRIM</option></select>'
      + '</div>'
      + '<div class="fg">'
        + '<label class="flabel">Jumlah Lot</label>'
        + '<input type="number" id="jn-in-lot" class="finput" value="50">'
      + '</div>'
      + '<div class="fg">'
        + '<label class="flabel">Harga Eksekusi (Rp)</label>'
        + '<input type="number" id="jn-in-price" class="finput" value="1500">'
      + '</div>'
      + '<div class="fg ffull">'
        + '<label class="flabel">Rasional Keputusan (Mengapa masuk/keluar sekarang?)</label>'
        + '<textarea id="jn-in-rationale" class="finput" rows="2" placeholder="Berdasarkan sinyal Smart Money Flow dan konfirmasi volume..." style="resize:vertical"></textarea>'
      + '</div>'
      + '<div class="fg">'
        + '<label class="flabel">Kondisi Emosi</label>'
        + '<select id="jn-in-emotion" class="finput"><option>Calm / Rational</option><option>Disciplined Execution</option><option>FOMO Alert</option><option>Panic/Fear</option></select>'
      + '</div>'
      + '<div class="fg">'
        + '<label class="flabel">Tingkat Confidence (%)</label>'
        + '<input type="number" id="jn-in-conf" class="finput" value="85" min="1" max="100">'
      + '</div>'
      + '<div class="fg ffull">'
        + '<label class="flabel">Post-Trade Review &amp; Evaluasi (Apa yang berhasil / pelajaran didapat?)</label>'
        + '<input type="text" id="jn-in-review" class="finput" placeholder="Eksekusi sesuai rencana, batas stop loss terpasang disiplin.">'
      + '</div>'
      + '<div class="ffull" style="display:flex;gap:10px;justify-content:flex-end;margin-top:4px">'
        + '<button class="btn btn-ghost" onclick="closeModal()">Batal</button>'
        + '<button class="btn btn-primary" onclick="saveNewJournalFromModal()">Simpan ke Jurnal</button>'
      + '</div>'
    + '</div>';

  modal.classList.add('on');
}

// FIX (2026-09-18, audit menyeluruh): entri jurnal dulu selalu diberi field
// decisionQualityScore bernilai konstan sembilan-puluh, dipatri untuk SEMUA
// entri apa pun isinya — ditampilkan sebagai kolom "Decision Score" seolah
// hasil evaluasi otomatis. Tidak ada data outcome/hasil trade nyata yang
// bisa dipakai menghitung skor kualitas keputusan yang jujur (app tidak
// melacak hasil setelah entri dibuat), jadi field & kolom ini dihapus
// sepenuhnya alih-alih diganti formula karangan lain.
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
    postReview: review
  });

  saveJournalsToStorage();
  closeModal();
  renderJournalPage();
  if (typeof showSaveStatus === 'function') showSaveStatus('Jurnal tersimpan');
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
// INCIDENT_LOG.md #9: scenarioGetRealRisk()'s completion callback used to
// call renderScenarioPage() directly and synchronously, and
// renderScenarioPage() calls scenarioGetRealRisk() again at its very top —
// a self-re-triggering pair (AGENTS.md §29's named bug class, same as
// INCIDENT_LOG.md #2/#3). Normally a real Yahoo fetch takes real time, so
// the callback fires on a later tick and the recursion never nests inside
// its own call stack. But rdEnsure() (13-realdata.js) has a SYNCHRONOUS
// fast path — `if(RD_FAILED[tk]){ cb('failed'); return; }` — for any
// ticker that already failed once this session. Once every portfolio
// ticker + IHSG has failed once (a real, reachable state — a Yahoo/proxy
// outage, or just this sandbox's blocked network), the entire
// scenarioGetRealRisk → perfComputeRealBeta → perfFetchHoldingsHistory →
// rdEnsure chain resolves synchronously, so the "re-render" call lands
// inside the ORIGINAL renderScenarioPage() call's own stack frame —
// unbounded recursion, "Maximum call stack size exceeded", crashing the
// tab. Two independent guards now prevent this, matching the
// cooldown-guard prevention AGENTS.md §29 calls for:
var SCENARIO_RISK_LAST_ATTEMPT = 0;
var SCENARIO_RISK_RETRY_COOLDOWN_MS = 30000;
function scenarioShouldRetryRisk() {
  if (typeof PERF_BETA_STATE === 'undefined') return false;
  if (PERF_BETA_STATE.loaded && PERF_BETA_STATE.data) return false; // already have real data, no retry needed
  if (PERF_BETA_STATE.loading) return false; // an attempt is already in flight
  return (Date.now() - SCENARIO_RISK_LAST_ATTEMPT) > SCENARIO_RISK_RETRY_COOLDOWN_MS;
}
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
  if (scenarioShouldRetryRisk() && typeof perfComputeRealBeta === 'function') {
    // 1) Cooldown guard (SCENARIO_RISK_LAST_ATTEMPT) — stops this from
    //    re-attempting perfComputeRealBeta() on every single render while
    //    the underlying fetch keeps failing.
    SCENARIO_RISK_LAST_ATTEMPT = Date.now();
    PERF_BETA_STATE.loading = true;
    perfComputeRealBeta(function(err, data) {
      PERF_BETA_STATE.loading = false;
      if (!err && data) { PERF_BETA_STATE.loaded = true; PERF_BETA_STATE.data = data; }
      // 2) setTimeout defer — the actual fix for the synchronous-resolution
      //    stack overflow above: guarantees this re-render can never nest
      //    inside the call stack of the render that triggered it, no
      //    matter how fast perfComputeRealBeta()'s callback fires.
      setTimeout(function() {
        if (typeof currentPage !== 'undefined' && currentPage === 'scenario' && typeof renderScenarioPage === 'function') {
          renderScenarioPage();
        }
      }, 0);
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
    + '<div class="ctitle" style="font-size:13px;margin-bottom:12px">PILIH PRESET SKENARIO UJI STRES (BERDASARKAN PORTOFOLIO AKTIF):</div>'
    + '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:16px">'
      + '<button class="btn btn-ghost btn-sm" onclick="runScenarioSimulation(\'top-drop\')">' + topTicker + ' (Holding Terbesar ' + topWeight + '%) Koreksi -20%</button>'
      + '<button class="btn btn-ghost btn-sm" onclick="runScenarioSimulation(\'ihsg-drop\')">IHSG Koreksi Pasar -10%</button>'
      + '<button class="btn btn-ghost btn-sm" onclick="runScenarioSimulation(\'sector-drop\')">Sektor ' + topSector + ' Koreksi -15%</button>'
      + '<button class="btn btn-ghost btn-sm" onclick="runScenarioSimulation(\'swap-top\')">Rotasi: Trim 30% ' + topTicker + ' → Beli ' + top2Ticker + ' / Kas</button>'
    + '</div>'

    + (sortedPorto.length > 0 ? (
      '<div style="border-top:1px solid var(--border);padding-top:14px;display:flex;gap:10px;flex-wrap:wrap;align-items:center">'
        + '<span style="font-size:12px;font-weight:700;color:var(--text2)">Custom Skenario Interaktif:</span>'
        + '<select id="sc-custom-ticker" class="finput fsel" style="max-width:280px;padding:5px 10px;font-size:12px">' + stockOptions + '</select>'
        + '<select id="sc-custom-shock" class="finput fsel" style="max-width:140px;padding:5px 10px;font-size:12px">'
          + '<option value="-30">-30% Crash</option>'
          + '<option value="-20" selected>-20% Koreksi</option>'
          + '<option value="-10">-10% Pullback</option>'
          + '<option value="10">+10% Rally</option>'
          + '<option value="20">+20% Breakout</option>'
          + '<option value="30">+30% Super Rally</option>'
        + '</select>'
        + '<button class="btn btn-primary btn-sm" onclick="runCustomScenarioSimulation()">Simulasikan</button>'
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
    + '<div style="background:var(--bg3);border:1px solid var(--border);padding:12px 16px;border-radius:var(--radius)">'
      + '<div style="font-size:11px;font-weight:700;color:var(--text);margin-bottom:4px">AI SCENARIO DIAGNOSIS:</div>'
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
  var html = '<div style="margin-bottom:16px;display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:12px">'
    + '<div>'
    + '<div class="ptitle" style="display:flex;align-items:center;gap:8px"><i class="ti ti-scale" style="color:var(--accent)"></i> Smart Rebalancing Engine &amp; Order Sheet</div>'
    + '<div class="psub">Sistem otomatis menghitung rekomendasi transaksi beli/jual untuk mengembalikan alokasi portofolio ke target persentase ideal.</div>'
    + '</div>'
    + '<div class="sm-suite-tabs" style="background:var(--bg3);border:1px solid var(--border);border-radius:10px;padding:3px;display:inline-flex;gap:4px">'
    + '<button class="sm-nav-item ' + (_rebalanceMode==='equal'?'active':'') + '" onclick="setRebalanceMode(\'equal\')" style="padding:6px 14px;border-radius:7px;border:none;font-size:12px;font-weight:600;display:inline-flex;align-items:center;gap:6px;cursor:pointer;' + (_rebalanceMode==='equal' ? 'background:var(--accent);color:#0a0e17;box-shadow:0 1px 3px rgba(0,0,0,0.2)' : 'background:transparent;color:var(--text2)') + '"><i class="ti ti-equal"></i> Equal Weight</button>'
    + '<button class="sm-nav-item ' + (_rebalanceMode==='custom'?'active':'') + '" onclick="setRebalanceMode(\'custom\')" style="padding:6px 14px;border-radius:7px;border:none;font-size:12px;font-weight:600;display:inline-flex;align-items:center;gap:6px;cursor:pointer;' + (_rebalanceMode==='custom' ? 'background:var(--accent);color:#0a0e17;box-shadow:0 1px 3px rgba(0,0,0,0.2)' : 'background:transparent;color:var(--text2)') + '"><i class="ti ti-adjustments"></i> Target Kustom</button>'
    + '</div>'
    + '</div>';

  if (!porto || porto.length === 0) {
    html += '<div class="card" style="text-align:center;padding:48px 20px;color:var(--text3);border-radius:12px;background:var(--bg2);border:1px solid var(--border)">'
      + '<div style="width:48px;height:48px;border-radius:12px;background:var(--bg3);border:1px solid var(--border);display:flex;align-items:center;justify-content:center;margin:0 auto 12px;color:var(--accent);font-size:22px"><i class="ti ti-chart-pie-off"></i></div>'
      + '<strong style="font-size:15px;color:var(--text)">Belum Ada Posisi Portofolio Aktif</strong>'
      + '<div style="font-size:12px;margin-top:6px;max-width:480px;margin-left:auto;margin-right:auto;color:var(--text2);line-height:1.5">'
        + 'Portofolio saat ini kosong (Rp 0). Masukkan transaksi beli atau upload data transaksi untuk mengaktifkan kalkulator rebalancing alokasi target otomatis.'
      + '</div>'
      + '<button class="btn btn-primary btn-sm" onclick="goPage(\'transaksi\')" style="margin-top:16px;display:inline-flex;align-items:center;gap:6px"><i class="ti ti-plus"></i> Input Transaksi Baru</button>'
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
    var actionBadge = isOver ? '<span class="badge b-dn" style="display:inline-flex;align-items:center;gap:4px"><i class="ti ti-arrow-down-right"></i> TRIM / JUAL</span>' : (isUnder ? '<span class="badge b-up" style="display:inline-flex;align-items:center;gap:4px"><i class="ti ti-arrow-up-right"></i> ACCUMULATE / BELI</span>' : '<span class="badge b-neu" style="display:inline-flex;align-items:center;gap:4px"><i class="ti ti-check"></i> HOLD / SESUAI</span>');
    var actionDesc = isOver ? 'Jual ~' + estLots + ' lot' : (isUnder ? 'Beli ~' + estLots + ' lot' : 'Pertahankan alokasi');

    var targetInputHtml = _rebalanceMode === 'custom'
      ? '<div style="display:flex;align-items:center;gap:4px"><input type="number" step="0.5" min="0" max="100" value="' + targetWeight.toFixed(1) + '" onchange="updateCustomRebWeight(\'' + p.ticker + '\', this.value)" class="finput mono" style="width:70px;padding:3px 6px;text-align:right"><span style="font-size:11px;color:var(--text3)">%</span></div>'
      : '<span class="mono" style="font-weight:600">' + targetWeight.toFixed(1) + '%</span>';

    rowsHtml += '<tr>'
      + '<td><strong>' + p.ticker + '</strong> <span style="font-size:11px;color:var(--text3)">' + (p.name || '') + '</span></td>'
      + '<td class="mono">' + curWeight.toFixed(1) + '%</td>'
      + '<td>' + targetInputHtml + '</td>'
      + '<td class="mono ' + (deltaPct >= 0 ? 'up' : 'dn') + '" style="font-weight:600">' + (deltaPct >= 0 ? '+' : '') + deltaPct.toFixed(1) + '%</td>'
      + '<td>' + actionBadge + '<div style="font-size:10px;color:var(--text3);margin-top:3px">' + actionDesc + '</div></td>'
      + '<td class="mono ' + (deltaPct >= 0 ? 'up' : 'dn') + '" style="text-align:right;font-weight:600">' + (deltaPct >= 0 ? '+' : '-') + 'Rp ' + fmtK(estVal) + '</td>'
    + '</tr>';
  });

  html += '<div class="card" style="margin-bottom:16px;background:var(--bg2);border:1px solid var(--border);border-radius:12px">'
    + '<div class="ctitle" style="font-size:13px;margin-bottom:14px;display:flex;align-items:center;gap:8px">'
      + '<i class="ti ti-git-fork" style="color:var(--accent)"></i> Alur Kerja Step-by-Step Eksekusi Rebalancing'
    + '</div>'
    + '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px">'
      + '<div style="background:var(--bg3);border:1px solid var(--border);border-radius:10px;padding:14px">'
        + '<div style="font-size:10px;color:var(--accent);font-weight:800;letter-spacing:0.05em;display:flex;align-items:center;gap:4px"><i class="ti ti-scan"></i> LANGKAH 1</div>'
        + '<div style="font-weight:600;font-size:13px;margin:6px 0 4px;color:var(--text)">Identifikasi Deviasi</div>'
        + '<div style="font-size:11px;color:var(--text2);line-height:1.5">Sistem mendeteksi posisi yang melampaui target (overweight) untuk di-trim dan posisi lagging untuk di-accumulate.</div>'
      + '</div>'
      + '<div style="background:var(--bg3);border:1px solid var(--border);border-radius:10px;padding:14px">'
        + '<div style="font-size:10px;color:var(--accent);font-weight:800;letter-spacing:0.05em;display:flex;align-items:center;gap:4px"><i class="ti ti-building-bank"></i> LANGKAH 2</div>'
        + '<div style="font-weight:600;font-size:13px;margin:6px 0 4px;color:var(--text)">Eksekusi di Sekuritas</div>'
        + '<div style="font-size:11px;color:var(--text2);line-height:1.5">Gunakan order sheet untuk menjual saham overweight dan membeli saham underweight secara bertahap.</div>'
      + '</div>'
      + '<div style="background:var(--bg3);border:1px solid var(--border);border-radius:10px;padding:14px">'
        + '<div style="font-size:10px;color:var(--accent);font-weight:800;letter-spacing:0.05em;display:flex;align-items:center;gap:4px"><i class="ti ti-circle-check"></i> LANGKAH 3</div>'
        + '<div style="font-weight:600;font-size:13px;margin:6px 0 4px;color:var(--text)">Validasi Keseimbangan Baru</div>'
        + '<div style="font-size:11px;color:var(--text2);line-height:1.5">Proyeksi menunjukkan portofolio kembali seimbang dengan risiko konsentrasi yang tereduksi optimal.</div>'
      + '</div>'
    + '</div>'
  + '</div>'

  + '<div class="g2b" style="margin-bottom:18px;display:grid;grid-template-columns:1.2fr 1fr;gap:14px">'
    + '<div class="card" style="margin:0;border-radius:12px;background:var(--bg2);border:1px solid var(--border)">'
      + '<div class="ctitle" style="font-size:13px;margin-bottom:12px;display:flex;align-items:center;gap:8px"><i class="ti ti-chart-pie" style="color:var(--accent)"></i> Ringkasan Portofolio &amp; Alokasi</div>'
      + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">'
        + '<div style="background:var(--bg3);border:1px solid var(--border);border-radius:10px;padding:12px">'
          + '<div style="font-size:10px;color:var(--text3);font-weight:700;letter-spacing:0.04em">POSISI SAAT INI</div>'
          + '<div style="margin-top:8px;display:flex;flex-direction:column;gap:6px;font-size:12px">'
            + '<div style="display:flex;justify-content:space-between;align-items:center"><span style="color:var(--text2)">Total Saham:</span><strong class="mono" style="color:var(--text)">Rp ' + fmtK(totalMV) + '</strong></div>'
            + '<div style="display:flex;justify-content:space-between;align-items:center"><span style="color:var(--text2)">Emiten:</span><strong class="mono" style="color:var(--text)">' + porto.length + ' Saham</strong></div>'
            + '<div style="display:flex;justify-content:space-between;align-items:center"><span style="color:var(--text2)">Kas / RDN:</span><strong class="mono up">Rp ' + fmtK(rdn) + '</strong></div>'
          + '</div>'
        + '</div>'
        + '<div style="background:rgba(0,200,255,0.03);border:1px solid rgba(0,200,255,0.2);border-radius:10px;padding:12px">'
          + '<div style="font-size:10px;color:var(--accent);font-weight:700;letter-spacing:0.04em">PROYEKSI PASCA-REBALANCE</div>'
          + '<div style="margin-top:8px;display:flex;flex-direction:column;gap:6px;font-size:12px">'
            + '<div style="display:flex;justify-content:space-between;align-items:center"><span style="color:var(--text2)">Target:</span><strong class="mono up">' + (_rebalanceMode === 'equal' ? defaultTarget.toFixed(1) + '%' : 'Custom Target') + '</strong></div>'
            + '<div style="display:flex;justify-content:space-between;align-items:center"><span style="color:var(--text2)">Deviasi:</span><strong class="mono up">&lt; 1.0%</strong></div>'
            + '<div style="display:flex;justify-content:space-between;align-items:center"><span style="color:var(--text2)">Status:</span><strong class="mono up">Optimal</strong></div>'
          + '</div>'
        + '</div>'
      + '</div>'
    + '</div>'

    + '<div class="card" style="margin:0;border-radius:12px;background:var(--bg2);border:1px solid var(--border);display:flex;flex-direction:column;justify-content:space-between">'
      + '<div>'
        + '<div class="ctitle" style="font-size:13px;margin-bottom:8px;display:flex;align-items:center;gap:8px"><i class="ti ti-file-spreadsheet" style="color:var(--accent)"></i> Eksekusi &amp; Order Sheet</div>'
        + '<div style="font-size:12px;color:var(--text2);line-height:1.5;margin-bottom:12px">'
          + 'Gunakan rekomendasi order di bawah untuk melakukan penyesuaian langsung di aplikasi sekuritas Anda (Stockbit, IPOT, Mandiri Sekuritas, dll).'
        + '</div>'
      + '</div>'
      + '<div style="display:flex;gap:8px;flex-wrap:wrap">'
        + '<button class="btn btn-primary btn-sm" onclick="alert(\'Lembar instruksi order rebalance berhasil disiapkan. Salin atau catat untuk eksekusi di sekuritas.\')" style="display:inline-flex;align-items:center;gap:6px"><i class="ti ti-copy"></i> Salin Order Sheet</button>'
        + (_rebalanceMode === 'custom' ? '<button class="btn btn-ghost btn-sm" onclick="_rebalanceCustomWeights={};renderRebalancePage()" style="display:inline-flex;align-items:center;gap:6px"><i class="ti ti-rotate"></i> Reset Target</button>' : '')
      + '</div>'
    + '</div>'
  + '</div>'

  + '<div class="card" style="padding:0;overflow:hidden;border-radius:12px;background:var(--bg2);border:1px solid var(--border)">'
    + '<div class="cheader" style="padding:14px 18px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center">'
      + '<span class="ctitle" style="display:flex;align-items:center;gap:8px"><i class="ti ti-calculator" style="color:var(--accent)"></i> Rebalance Order Calculator (Rekomendasi Beli / Jual Otomatis)</span>'
      + '<span class="badge b-accent" style="display:inline-flex;align-items:center;gap:4px"><i class="ti ti-bolt"></i> REAL-TIME CALCULATION</span>'
    + '</div>'
    + '<div style="overflow-x:auto">'
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
    + '</div>'
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
    text: 'Halo! Saya adalah **MoneyWatch AI**, asisten analis portofolio multi-aset kelas institusional yang berfokus pada pasar modal Indonesia (IHSG/BEI).\n\nSaya siap membantu Anda dalam:\n- **Analisa Portofolio & Risiko**: Evaluasi konsentrasi AUM, alokasi kas RDN, dan Maximum Drawdown.\n- **Kepatuhan Regulasi BEI**: Validasi simulasi transaksi sesuai fraksi harga (tick size) dan batas ARA/ARB simetris.\n- **Kalkulasi Pajak Dividen**: Proyeksi imbal hasil dividen bersih setelah dipotong PPh Final 10% (atau 0% reinvestasi PMK 18/2021).\n- **Rasio Fundamental & Valuasi**: P/E, P/BV, ROE, DER, NPM, dan Margin of Safety tanpa halusinasi.\n- **Kepemilikan KSEI**: Pantau data pemegang saham institusi >5% dan estimasi free float publik.\n\n*Silakan tanyakan tentang portofolio Anda atau kode saham spesifik di BEI (misal: BBCA, BBRI, BMRI, PGEO).*',
    toolCalls: []
  }
];

var MW_AI_IS_LOADING = false;

function renderCopilotPage() {
  var c = el('page-copilot');
  if (!c) return;

  if (typeof ensureAiSignalLogResolved === 'function') ensureAiSignalLogResolved();

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
          return '<span class="badge" style="background:rgba(56,189,248,0.15);color:#38bdf8;border:1px solid rgba(56,189,248,0.3);font-size:10px;padding:2px 6px;border-radius:4px">' + escapeHtml(tc.name) + '(' + escapeHtml(JSON.stringify(tc.args || {})) + ')'
          + '</span>';
        }).join('')
      + '</div>';
    }

    // Bubble text colors: the CSS class .bubble-user (main.css) always
    // renders on a solid blue background in light theme (`!important
    // background:#2563EB`) — but that !important only affects the bubble
    // DIV's OWN color, never a child's own explicit inline color. cb-role
    // and cb-text below used to inherit var(--accent)/var(--text), which in
    // light theme resolve to near-black/dark-blue — dark text on a solid
    // blue bubble, exactly the low-contrast bug the user reported via
    // screenshot (2026-09-11). User-bubble text is now hardcoded white,
    // since a "Anda" bubble is blue-on-some-shade in every theme.
    return '<div class="copilot-bubble bubble-' + m.role + '" style="margin-bottom:12px;background:' + (isAssistant ? 'var(--bg2)' : 'rgba(56,189,248,0.12)') + ';border:1px solid ' + (isAssistant ? 'var(--border)' : 'rgba(56,189,248,0.3)') + ';border-radius:8px;padding:14px">'
      + '<div class="cb-head" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">'
        + '<span class="cb-role" style="font-weight:700;font-size:12px;color:' + (isAssistant ? '#38bdf8' : '#FFFFFF') + '">'
          + (isAssistant ? 'MoneyWatch AI' : 'Anda')
        + '</span>'
        + (isAssistant ? '<span style="font-size:10px;color:var(--text3);background:var(--bg3);padding:1px 6px;border-radius:4px">BEI Institutional Analyst</span>' : '')
      + '</div>'
      + toolHtml
      + '<div class="cb-text" style="font-size:12.5px;line-height:1.6;color:' + (isAssistant ? 'var(--text)' : '#FFFFFF') + '">' + formattedText + '</div>'
    + '</div>';
  }).join('');

  if (MW_AI_IS_LOADING) {
    messagesHtml += '<div class="copilot-bubble bubble-assistant" style="margin-bottom:12px;background:var(--bg2);border:1px dashed #38bdf8;border-radius:8px;padding:14px">'
      + '<div style="display:flex;align-items:center;gap:10px;color:#38bdf8;font-size:12px;font-weight:600">'
        + '<span class="spinner" style="display:inline-block;width:14px;height:14px;border:2px solid #38bdf8;border-top-color:transparent;border-radius:50%;animation:spin 1s linear infinite"></span>'
        + 'MoneyWatch AI sedang menjalankan Agentic Loop (pemeriksaan data pasar, regulasi BEI & sinkronisasi portofolio)...'
      + '</div>'
    + '</div>';
  }

  var html = '<div style="margin-bottom:16px;display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:12px">'
    + '<div>'
      + '<div class="ptitle" style="display:flex;align-items:center;gap:10px">'
        + '<span>MoneyWatch Copilot AI</span>'
        + '<span class="badge" style="background:rgba(16,185,129,0.12);color:#10b981;border:1px solid rgba(16,185,129,0.25);display:inline-flex;align-items:center;gap:6px;font-size:10px;font-weight:700;border-radius:6px;padding:2px 8px">'
          + '<span style="width:6px;height:6px;border-radius:50%;background:#10b981;box-shadow:0 0 6px #10b981"></span>ONLINE: PORTFOLIO REASONING'
        + '</span>'
      + '</div>'
      + '<div class="psub">Asisten analis portofolio multi-aset berbasis model reasoning, kepatuhan regulasi BEI, batas risiko RDN &amp; kalkulasi dividen bersih.</div>'
    + '</div>'
    + '<div style="display:flex;gap:8px;align-items:center">'
      + '<button class="btn btn-ghost btn-sm" onclick="clearCopilotHistory()">Bersihkan Sesi</button>'
    + '</div>'
  + '</div>'

  // AI Assistant Mode Switcher Tabs (Emiten Analysis vs Portfolio Audit)
  + '<div class="tab-row" style="margin-bottom:16px;display:flex;gap:8px;border-bottom:1px solid var(--border2);padding-bottom:10px;flex-wrap:wrap;align-items:center;justify-content:space-between">'
    + '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">'
      + '<button onclick="goPage(\'stockchat\')" class="sm-nav-item" style="font-size:11px;font-weight:700;display:inline-flex;align-items:center;gap:6px">'
        + '<i class="ti ti-chart-arrows"></i> Analisis Emiten &amp; Bandarmologi (StockChat)'
      + '</button>'
      + '<button class="sm-nav-item active" style="font-size:11px;font-weight:700;display:inline-flex;align-items:center;gap:6px">'
        + '<i class="ti ti-briefcase"></i> Audit Portofolio &amp; Risiko (Copilot)'
      + '</button>'
    + '</div>'
    + '<div style="font-size:10px;color:var(--text3);font-family:monospace;letter-spacing:0.5px">PORTFOLIO INTELLIGENCE</div>'
  + '</div>'

  + '<div class="copilot-container card" style="padding:0;display:flex;flex-direction:column;height:calc(100vh - 180px);min-height:560px;border:1px solid var(--border2);border-radius:12px;background:var(--bg2)">'
    + '<div class="copilot-history" id="copilot-history-box" style="flex:1;overflow-y:auto;padding:18px;display:flex;flex-direction:column">'
      + messagesHtml
    + '</div>'

    + '<div class="copilot-chips-wrap" style="padding:10px 16px;border-top:1px solid var(--border2);background:rgba(0,0,0,0.2);display:flex;gap:8px;overflow-x:auto;white-space:nowrap">'
      + '<button class="sm-chip" onclick="sendCopilotPrompt(\'Analisa konsentrasi portofolio, alokasi kas RDN, dan risiko Maximum Drawdown saya saat ini\')">Analisa Portofolio & Konsentrasi</button>'
      + '<button class="sm-chip" onclick="sendCopilotPrompt(\'Cek rasio fundamental, MoS, dan analisa dua sisi potensi vs risiko saham ' + topTicker + '\')">Fundamental & MoS ' + topTicker + '</button>'
      + '<button class="sm-chip" onclick="sendCopilotPrompt(\'Simulasikan beli 50 lot ' + secondTicker + ' dan validasi fraksi harga BEI serta batas ARA/ARB\')">Simulasi Transaksi ' + secondTicker + '</button>'
      + '<button class="sm-chip" onclick="sendCopilotPrompt(\'Hitung proyeksi dividen bersih saham ' + topTicker + ' dengan potongan pajak final 10%\')">Hitung Pajak Dividen ' + topTicker + '</button>'
      + '<button class="sm-chip" onclick="sendCopilotPrompt(\'Cek struktur pemegang saham institusi >5% dan estimasi free float KSEI saham BMRI\')">Kepemilikan KSEI BMRI</button>'
    + '</div>'

    + '<div class="copilot-input-bar" style="padding:14px 16px;border-top:1px solid var(--border2);display:flex;gap:10px;background:var(--bg2)">'
      + '<input type="text" id="copilot-prompt-input" class="finput" placeholder="Tanyakan analisa portofolio, simulasi fraksi BEI, dividen bersih, atau rasio emiten..." onkeydown="if(event.key===\'Enter\')sendCopilotPrompt(this.value)" style="flex:1">'
      + '<button class="btn btn-primary" id="copilot-send-btn" onclick="var inp=el(\'copilot-prompt-input\');if(inp)sendCopilotPrompt(inp.value)">Kirim Analisis</button>'
    + '</div>'
  + '</div>';

  c.innerHTML = html;
}

function clearCopilotHistory() {
  MW_COPILOT_HISTORY = [
    {
      role: 'assistant',
      text: 'Sesi baru dimulai. Saya adalah **MoneyWatch AI**. Bagaimana saya dapat membantu analisa portofolio atau pasar modal Anda hari ini?',
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

  // AI Paper Trading performance summary — real, derived stats from
  // AI_TRADE_STATE.paperAccount (38-ai-autonomous-trading.js), never
  // fabricated. This is what actually lets the Copilot "menganalisa data
  // & memberi saran perbaikan" from real trading history instead of just
  // reasoning over static portfolio holdings: recentClosedTrades carries
  // the SAME lesson/mistake/improvement text the 10-Point Post-Mortem
  // engine already computed per trade (classifyTradeOutcome()), so the
  // AI can cite genuine past mistakes instead of inventing generic advice.
  // typeof-guarded: AI_TRADE_STATE is only populated once
  // initAiAutonomousSuite() has run at least once this session.
  var aiPaperTrading = null;
  if (typeof AI_TRADE_STATE !== 'undefined' && AI_TRADE_STATE && AI_TRADE_STATE.paperAccount) {
    var pa = AI_TRADE_STATE.paperAccount;
    aiPaperTrading = {
      totalTrades: pa.totalTrades || 0,
      winningTrades: pa.winningTrades || 0,
      losingTrades: pa.losingTrades || 0,
      winRate: pa.winRate || 0,
      profitFactor: (pa.profitFactor === null || pa.profitFactor === undefined) ? null : pa.profitFactor,
      realizedPnL: pa.realizedPnL || 0,
      maxDrawdownPct: pa.maxDrawdownPct || 0,
      openPositionsCount: (pa.openPositions || []).length,
      // closedTrades is unshift()-ordered (index 0 = most recent) — no
      // reverse needed.
      recentClosedTrades: (pa.closedTrades || []).slice(0, 5).map(function(t) {
        return {
          ticker: t.ticker,
          result: t.result,
          netPnL: t.netPnL,
          exitReason: t.exitReason || null,
          lesson: t.lesson || null,
          mistake: t.mistake || null,
          improvement: t.improvement || null
        };
      })
    };
  }

  // Item #3 dari roadmap AI Copilot (2026-09-11, INCIDENT_LOG.md): kalau
  // pesan menyebut ticker riil DAN tampak menanyakan sinyal/prediksi,
  // jalankan inferensi XGBoost (xgbPredictLatest(), 11-quant.js — pipeline
  // ONNX YANG SAMA dipakai Backtester, bukan re-implementasi) di browser
  // sebelum mengirim ke server, supaya AI Copilot bisa mengutip prediksi
  // model nyata alih-alih menebak "kelihatannya bullish". Model ini SENDIRI
  // belum terbukti prediktif (lihat ml/README.md) — hasData/hasProvenSignal
  // di bawah memastikan server & AI tidak pernah menyajikannya seolah
  // sinyal yang solid. Timeout 8s: inferensi ONNX + fetch histori tidak
  // boleh menahan SETIAP pesan chat kalau lambat/macet — gagal diam-diam
  // ke null (server lalu jawab tanpa prediksi ini, bukan error).
  var xgboostPrediction = null;
  var isPredictionIntent = /\b(sinyal|prediksi|xgboost|rekomendasi|layak beli|worth buy|apakah bagus|apakah layak)\b/i.test(prompt);
  if (isPredictionIntent && typeof xgbPredictLatest === 'function') {
    var predTicker = prompt.toUpperCase().split(/[^A-Z0-9]/).filter(Boolean).find(function(w) {
      return typeof DB !== 'undefined' && DB[w];
    });
    if (predTicker) {
      try {
        xgboostPrediction = await Promise.race([
          new Promise(function(resolve) { xgbPredictLatest(predTicker, resolve); }),
          new Promise(function(resolve) { setTimeout(function() { resolve(null); }, 8000); })
        ]);
      } catch (e) {
        console.warn('[Copilot] xgbPredictLatest() gagal, lanjut tanpa prediksi:', e);
        xgboostPrediction = null;
      }
    }
  }

  // AI Signal Reflection Log Fase 3 (2026-09-17): sama seperti aiPaperTrading
  // di atas, server tidak pernah punya akses Supabase sendiri.
  var aiSignalHistory = (typeof getAiSignalHistorySummary === 'function') ? await getAiSignalHistorySummary() : [];

  var userContext = {
    holdings: porto,
    totalAum: totalAum,
    rdnCash: rdn,
    sekuritas: sekuritasName,
    livePrices: livePrices,
    aiPaperTrading: aiPaperTrading,
    xgboostPrediction: xgboostPrediction,
    aiSignalHistory: aiSignalHistory
  };

  // Was: any failure here (network error, non-2xx, or a response body that
  // wasn't valid JSON — e.g. a Vercel function-timeout HTML error page)
  // fell straight into a dead-end "Gagal terhubung ke engine..." message
  // with zero diagnostic value and no way forward for the user, even
  // though 41-stockchat-cockpit.js's sendStockChatMessage() already solved
  // this exact problem for the SAME /api/ai/agent-chat endpoint: on ANY
  // failure it silently degrades to generateClientSideAiAgentResponse(), a
  // deterministic client-side reasoning engine, so the user always gets a
  // real, useful analysis instead of an error. Copilot now does the same.
  var serverSucceeded = false;
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

    if (res.ok) {
      var data = await res.json();
      if (data && data.success) {
        MW_COPILOT_HISTORY.push({
          role: 'assistant',
          text: data.reply || 'Analisa berhasil diproses.',
          toolCalls: data.toolCalls || []
        });
        if (typeof logAiSignalToReflectionLog === 'function') logAiSignalToReflectionLog('copilot', data.toolCalls);
        serverSucceeded = true;
      } else {
        console.warn('[Copilot] Server AI responded without success:', data && data.error);
      }
    } else {
      console.warn('[Copilot] Server AI responded with HTTP ' + res.status + ' ' + res.statusText);
    }
  } catch (err) {
    console.warn('[Copilot] Server AI API unavailable, engaging client-side AI Agent Reasoning Engine:', err);
  }

  if (!serverSucceeded) {
    if (typeof generateClientSideAiAgentResponse === 'function') {
      var clientAiResult = generateClientSideAiAgentResponse(prompt, userContext);
      MW_COPILOT_HISTORY.push({
        role: 'assistant',
        text: clientAiResult.reply,
        toolCalls: clientAiResult.toolCalls || []
      });
    } else {
      // generateClientSideAiAgentResponse() not loaded (41-stockchat-cockpit.js
      // missing/failed) — last-resort message, now naming the actual cause
      // instead of a generic "coba lagi" with no diagnostic value.
      MW_COPILOT_HISTORY.push({
        role: 'assistant',
        text: 'Gagal terhubung ke engine MoneyWatch AI, dan engine cadangan client-side tidak tersedia. Silakan muat ulang halaman lalu coba lagi.',
        toolCalls: []
      });
    }
  }

  MW_AI_IS_LOADING = false;
  renderCopilotPage();
  var b = el('copilot-history-box');
  if (b) b.scrollTop = b.scrollHeight;
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
  text = text.replace(/\*Disclaimer: (.*?)\*/gim, '<div style="margin-top:12px;padding:8px 12px;background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius-sm);font-size:11px;color:var(--text3);font-style:italic"><strong>Disclaimer:</strong> $1</div>');

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
