// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  D3.js PORTFOLIO NET WORTH GROWTH & VALUATION ENGINE                    ║
// ║  Visualisasi interaktif pertumbuhan aset berbasis transaksi Firestore   ║
// ╚══════════════════════════════════════════════════════════════════════════╝

var D3_NW_STATE = {
  period: 'YTD',
  mode: 'networth', // 'networth', 'both', 'pnl'
  data: []
};

// ── Kalkulasi Rangkaian Waktu Net Worth dari Data Transaksi Firestore ──
function buildD3NetWorthTimeline() {
  var txs = (typeof transactions !== 'undefined' && Array.isArray(transactions)) ? transactions : [];
  var rdns = (typeof rdnMutations !== 'undefined' && Array.isArray(rdnMutations)) ? rdnMutations : [];
  var divs = (typeof dividends !== 'undefined' && Array.isArray(dividends)) ? dividends : [];
  
  if (txs.length === 0 && rdns.length === 0) {
    return [];
  }

  // Kumpulkan seluruh tanggal unik dari transaksi & mutasi
  var dateMap = {};
  txs.forEach(function(t) { if (t.date) dateMap[t.date] = true; });
  rdns.forEach(function(m) { if (m.date) dateMap[m.date] = true; });
  divs.forEach(function(d) { if (d.date) dateMap[d.date] = true; });

  var sortedDates = Object.keys(dateMap).sort();
  if (sortedDates.length === 0) return [];

  // Urutkan transaksi secara kronologis
  var sortedTxs = txs.slice().sort(function(a, b) {
    var d = (a.date || '').localeCompare(b.date || '');
    return d !== 0 ? d : ((a.id || 0) - (b.id || 0));
  });

  // Replay transaksi dari awal hingga akhir untuk menghitung posisi per tanggal
  var holdings = {}; // ticker -> { lot, shares, cost }
  var cumInvested = 0;
  var timeline = [];

  // Jika hanya ada 1 tanggal transaksi, tambahkan titik awal baseline agar kurva D3 terbentuk sempurna
  if (sortedDates.length === 1) {
    var firstDate = new Date(sortedDates[0]);
    var prevDate = new Date(firstDate);
    prevDate.setDate(prevDate.getDate() - 1);
    var prevDateStr = prevDate.toISOString().slice(0, 10);
    timeline.push({
      date: prevDate,
      dateStr: prevDateStr,
      investedCapital: 0,
      stockValuation: 0,
      cashBalance: 0,
      otherAssets: 0,
      netWorth: 0,
      totalPnl: 0,
      pnlPct: 0,
      activeCount: 0
    });
  }

  sortedDates.forEach(function(curDateStr) {
    var curDate = new Date(curDateStr);

    // Proses semua transaksi sampai tanggal ini
    var curTxs = sortedTxs.filter(function(t) { return t.date === curDateStr; });
    curTxs.forEach(function(tx) {
      if (!holdings[tx.ticker]) holdings[tx.ticker] = { lot: 0, shares: 0, cost: 0 };
      var h = holdings[tx.ticker];
      var gross = tx.gross || (tx.lot * 100 * tx.price);
      var net = tx.net || gross;

      if (tx.type === 'BUY') {
        h.lot += tx.lot;
        h.shares += tx.lot * 100;
        h.cost += net;
        cumInvested += net;
      } else if (tx.type === 'SELL') {
        var avgCost = h.shares > 0 ? (h.cost / h.shares) : tx.price;
        var soldShares = tx.lot * 100;
        h.lot = Math.max(0, h.lot - tx.lot);
        h.shares = Math.max(0, h.shares - soldShares);
        h.cost = Math.max(0, h.cost - (avgCost * soldShares));
        cumInvested = Math.max(0, cumInvested - net);
      }
    });

    // Hitung valuasi pasar saham pada tanggal ini
    var stockVal = 0;
    var stockCost = 0;
    var activeCount = 0;
    Object.keys(holdings).forEach(function(ticker) {
      var h = holdings[ticker];
      if (h.lot > 0) {
        activeCount++;
        var curPrice = (typeof prices !== 'undefined' && prices[ticker]) 
          ? prices[ticker] 
          : ((typeof DB !== 'undefined' && DB[ticker] && DB[ticker].base) ? DB[ticker].base : (h.shares > 0 ? h.cost / h.shares : 0));
        stockVal += h.shares * curPrice;
        stockCost += h.cost;
      }
    });

    // Hitung saldo kas RDN
    var rdnBal = (typeof calcRdnBalance === 'function') ? calcRdnBalance() : 0;
    
    // Aset lainnya (Crypto, ETF, Reksa Dana, Wealth)
    var otherVal = 0;
    if (typeof getCryptoPortfolio === 'function') {
      otherVal += getCryptoPortfolio().reduce(function(a, c) { return a + (c.mv || 0); }, 0);
    }
    if (typeof getEtfPortfolio === 'function') {
      otherVal += getEtfPortfolio().reduce(function(a, e) { return a + (e.mvIdr || 0); }, 0);
    }
    if (typeof getRdPortfolio === 'function') {
      otherVal += getRdPortfolio().reduce(function(a, r) { return a + (r.mv || 0); }, 0);
    }
    if (typeof WEALTH !== 'undefined') {
      otherVal += (WEALTH.deposito || 0) + (WEALTH.emas || 0) + (WEALTH.obligasi || 0);
    }

    var totalNW = stockVal + rdnBal + otherVal;
    var totalPnl = totalNW - cumInvested;
    var pnlPct = cumInvested > 0 ? (totalPnl / cumInvested * 100) : 0;

    timeline.push({
      date: curDate,
      dateStr: curDateStr,
      investedCapital: cumInvested,
      stockValuation: stockVal,
      cashBalance: rdnBal,
      otherAssets: otherVal,
      netWorth: totalNW,
      totalPnl: totalPnl,
      pnlPct: pnlPct,
      activeCount: activeCount
    });
  });

  // Tambahkan titik hari ini jika tanggal transaksi terakhir sebelum hari ini
  var todayStr = new Date().toISOString().slice(0, 10);
  var lastItem = timeline[timeline.length - 1];
  if (lastItem && lastItem.dateStr !== todayStr) {
    var todayDate = new Date();
    var currentAUM = (typeof computeCurrentAUM === 'function') ? computeCurrentAUM() : lastItem.netWorth;
    var currentPnl = currentAUM - lastItem.investedCapital;
    timeline.push({
      date: todayDate,
      dateStr: todayStr,
      investedCapital: lastItem.investedCapital,
      stockValuation: lastItem.stockValuation,
      cashBalance: lastItem.cashBalance,
      otherAssets: lastItem.otherAssets,
      netWorth: currentAUM,
      totalPnl: currentPnl,
      pnlPct: lastItem.investedCapital > 0 ? (currentPnl / lastItem.investedCapital * 100) : 0,
      activeCount: lastItem.activeCount
    });
  }

  return timeline;
}

// ── Filter Data Berdasarkan Pilihan Periode ──
function filterD3Timeline(fullTimeline, period) {
  if (!fullTimeline || !fullTimeline.length || period === 'ALL') return fullTimeline || [];
  var last = fullTimeline[fullTimeline.length - 1].date;
  var cutoff = new Date(last);

  if (period === '1W') cutoff.setDate(cutoff.getDate() - 7);
  else if (period === '1M') cutoff.setMonth(cutoff.getMonth() - 1);
  else if (period === '3M') cutoff.setMonth(cutoff.getMonth() - 3);
  else if (period === 'YTD') cutoff = new Date(last.getFullYear(), 0, 1);
  else if (period === '1Y') cutoff.setFullYear(cutoff.getFullYear() - 1);

  var filtered = fullTimeline.filter(function(d) { return d.date >= cutoff; });
  return filtered.length >= 2 ? filtered : fullTimeline;
}

// ── Pengontrol UI Periode & Mode Tampilan ──
function d3NwSetPeriod(period, btn) {
  D3_NW_STATE.period = period;
  var group = document.getElementById('d3-nw-period-group');
  if (group) group.querySelectorAll('.pbtn').forEach(function(b) { b.classList.remove('on'); });
  if (btn) btn.classList.add('on');
  renderD3NetWorthChart();
}

function d3NwSetMode(mode, btn) {
  D3_NW_STATE.mode = mode;
  var group = document.getElementById('d3-nw-mode-group');
  if (group) group.querySelectorAll('.pbtn').forEach(function(b) { b.classList.remove('on'); });
  if (btn) btn.classList.add('on');
  renderD3NetWorthChart();
}

// ── Render Grafik Garis Interaktif Menggunakan D3.js v7 ──
function renderD3NetWorthChart() {
  if (typeof d3 === 'undefined') {
    console.warn('D3.js library belum terpasang');
    return;
  }

  var container = document.getElementById('d3-nw-chart-container');
  var tooltip = document.getElementById('d3-nw-tooltip');
  if (!container) return;

  var fullTimeline = buildD3NetWorthTimeline();
  D3_NW_STATE.data = fullTimeline;

  // Update Summary Strip
  if (fullTimeline.length > 0) {
    var latest = fullTimeline[fullTimeline.length - 1];
    var ath = Math.max.apply(Math, fullTimeline.map(function(d) { return d.netWorth; }));
    
    var elVal = document.getElementById('d3-nw-stat-val');
    var elCost = document.getElementById('d3-nw-stat-cost');
    var elPnl = document.getElementById('d3-nw-stat-pnl');
    var elAth = document.getElementById('d3-nw-stat-ath');
    var elBadge = document.getElementById('d3-nw-growth-badge');

    if (elVal) elVal.textContent = 'Rp ' + (typeof fmtK === 'function' ? fmtK(latest.netWorth) : latest.netWorth.toLocaleString('id-ID'));
    if (elCost) elCost.textContent = 'Rp ' + (typeof fmtK === 'function' ? fmtK(latest.investedCapital) : latest.investedCapital.toLocaleString('id-ID'));
    if (elPnl) {
      var isGain = latest.totalPnl >= 0;
      elPnl.innerHTML = '<span class="' + (isGain ? 'up' : 'dn') + '">' + (isGain ? '+' : '') + 'Rp ' + (typeof fmtK === 'function' ? fmtK(latest.totalPnl) : latest.totalPnl.toLocaleString('id-ID')) + ' (' + (isGain ? '+' : '') + latest.pnlPct.toFixed(2) + '%)</span>';
    }
    if (elAth) elAth.textContent = 'Rp ' + (typeof fmtK === 'function' ? fmtK(ath) : ath.toLocaleString('id-ID'));
    if (elBadge) {
      var isGain = latest.totalPnl >= 0;
      elBadge.className = 'badge ' + (isGain ? 'b-up' : 'b-dn');
      elBadge.textContent = (isGain ? '▲ +' : '▼ ') + latest.pnlPct.toFixed(2) + '%';
    }
  }

  // Bersihkan SVG sebelumnya
  container.innerHTML = '';
  if (fullTimeline.length === 0) {
    container.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--text3);font-family:var(--font-mono);font-size:12px">Belum ada data transaksi di Firestore</div>';
    return;
  }

  var data = filterD3Timeline(fullTimeline, D3_NW_STATE.period);

  // Ukuran kontainer responsif
  var rect = container.getBoundingClientRect();
  var width = rect.width || 800;
  var height = rect.height || 260;
  var margin = { top: 18, right: 24, bottom: 32, left: 75 };
  var innerWidth = Math.max(10, width - margin.left - margin.right);
  var innerHeight = Math.max(10, height - margin.top - margin.bottom);

  var svg = d3.select(container)
    .append('svg')
    .attr('width', width)
    .attr('height', height)
    .attr('viewBox', '0 0 ' + width + ' ' + height)
    .style('overflow', 'visible')
    .style('display', 'block');

  // Definitions: Gradien Warna
  var defs = svg.append('defs');

  // Gradien Net Worth (Emerald Green)
  var nwGrad = defs.append('linearGradient')
    .attr('id', 'd3-nw-area-grad')
    .attr('x1', '0%').attr('y1', '0%')
    .attr('x2', '0%').attr('y2', '100%');
  nwGrad.append('stop').attr('offset', '0%').attr('stop-color', '#10B981').attr('stop-opacity', 0.45);
  nwGrad.append('stop').attr('offset', '100%').attr('stop-color', '#10B981').attr('stop-opacity', 0.0);

  // Gradien Modal (Blue)
  var modalGrad = defs.append('linearGradient')
    .attr('id', 'd3-modal-area-grad')
    .attr('x1', '0%').attr('y1', '0%')
    .attr('x2', '0%').attr('y2', '100%');
  modalGrad.append('stop').attr('offset', '0%').attr('stop-color', '#3B82F6').attr('stop-opacity', 0.3);
  modalGrad.append('stop').attr('offset', '100%').attr('stop-color', '#3B82F6').attr('stop-opacity', 0.0);

  // Gradien P&L
  var pnlGrad = defs.append('linearGradient')
    .attr('id', 'd3-pnl-area-grad')
    .attr('x1', '0%').attr('y1', '0%')
    .attr('x2', '0%').attr('y2', '100%');
  pnlGrad.append('stop').attr('offset', '0%').attr('stop-color', '#F59E0B').attr('stop-opacity', 0.35);
  pnlGrad.append('stop').attr('offset', '100%').attr('stop-color', '#F59E0B').attr('stop-opacity', 0.0);

  // Filter Glow Effect
  var filter = defs.append('filter')
    .attr('id', 'd3-glow')
    .attr('x', '-20%').attr('y', '-20%').attr('width', '140%').attr('height', '140%');
  filter.append('feGaussianBlur').attr('stdDeviation', '3').attr('result', 'blur');
  var feMerge = filter.append('feMerge');
  feMerge.append('feMergeNode').attr('in', 'blur');
  feMerge.append('feMergeNode').attr('in', 'SourceGraphic');

  // Scales
  var xScale = d3.scaleTime()
    .domain(d3.extent(data, function(d) { return d.date; }))
    .range([0, innerWidth]);

  var yMin = 0, yMax = 100;
  if (D3_NW_STATE.mode === 'pnl') {
    var minPnl = d3.min(data, function(d) { return d.totalPnl; }) || 0;
    var maxPnl = d3.max(data, function(d) { return d.totalPnl; }) || 100;
    yMin = minPnl < 0 ? minPnl * 1.15 : 0;
    yMax = Math.max(100, maxPnl * 1.15);
  } else {
    var maxVal = d3.max(data, function(d) {
      return D3_NW_STATE.mode === 'both' 
        ? Math.max(d.netWorth, d.investedCapital) 
        : d.netWorth;
    }) || 100;
    var minVal = d3.min(data, function(d) {
      return D3_NW_STATE.mode === 'both' 
        ? Math.min(d.netWorth, d.investedCapital) 
        : d.netWorth;
    }) || 0;
    yMin = Math.max(0, minVal * 0.85);
    yMax = maxVal * 1.08;
  }

  var yScale = d3.scaleLinear()
    .domain([yMin, yMax])
    .range([innerHeight, 0])
    .nice();

  var g = svg.append('g')
    .attr('transform', 'translate(' + margin.left + ',' + margin.top + ')');

  // Horizontal Grid Lines
  g.append('g')
    .attr('class', 'grid')
    .call(d3.axisLeft(yScale)
      .ticks(5)
      .tickSize(-innerWidth)
      .tickFormat('')
    )
    .selectAll('line')
    .style('stroke', 'rgba(255, 255, 255, 0.05)')
    .style('stroke-dasharray', '3,3');

  g.selectAll('.grid .domain').remove();

  // Generator Garis & Area
  var curve = d3.curveMonotoneX;

  if (D3_NW_STATE.mode === 'both') {
    // Area Modal Disetor
    var modalArea = d3.area()
      .curve(curve)
      .x(function(d) { return xScale(d.date); })
      .y0(innerHeight)
      .y1(function(d) { return yScale(d.investedCapital); });

    g.append('path')
      .datum(data)
      .attr('fill', 'url(#d3-modal-area-grad)')
      .attr('d', modalArea);

    // Garis Modal Disetor (Dashed Blue)
    var modalLine = d3.line()
      .curve(curve)
      .x(function(d) { return xScale(d.date); })
      .y(function(d) { return yScale(d.investedCapital); });

    g.append('path')
      .datum(data)
      .attr('fill', 'none')
      .attr('stroke', '#60A5FA')
      .attr('stroke-width', 1.8)
      .attr('stroke-dasharray', '4,4')
      .attr('d', modalLine);
  }

  // Area & Garis Utama (Net Worth atau P&L)
  if (D3_NW_STATE.mode === 'pnl') {
    var pnlArea = d3.area()
      .curve(curve)
      .x(function(d) { return xScale(d.date); })
      .y0(yScale(0))
      .y1(function(d) { return yScale(d.totalPnl); });

    g.append('path')
      .datum(data)
      .attr('fill', 'url(#d3-pnl-area-grad)')
      .attr('d', pnlArea);

    var pnlLine = d3.line()
      .curve(curve)
      .x(function(d) { return xScale(d.date); })
      .y(function(d) { return yScale(d.totalPnl); });

    g.append('path')
      .datum(data)
      .attr('fill', 'none')
      .attr('stroke', '#F59E0B')
      .attr('stroke-width', 2.5)
      .style('filter', 'url(#d3-glow)')
      .attr('d', pnlLine);
  } else {
    // Area Net Worth
    var nwArea = d3.area()
      .curve(curve)
      .x(function(d) { return xScale(d.date); })
      .y0(innerHeight)
      .y1(function(d) { return yScale(d.netWorth); });

    g.append('path')
      .datum(data)
      .attr('fill', 'url(#d3-nw-area-grad)')
      .attr('d', nwArea);

    // Garis Net Worth
    var nwLine = d3.line()
      .curve(curve)
      .x(function(d) { return xScale(d.date); })
      .y(function(d) { return yScale(d.netWorth); });

    g.append('path')
      .datum(data)
      .attr('fill', 'none')
      .attr('stroke', '#10B981')
      .attr('stroke-width', 2.5)
      .style('filter', 'url(#d3-glow)')
      .attr('d', nwLine);
  }

  // Sumbu X
  var xAxis = d3.axisBottom(xScale)
    .ticks(Math.max(2, Math.floor(innerWidth / 110)))
    .tickFormat(d3.timeFormat("%d %b '%y"));

  var gx = g.append('g')
    .attr('transform', 'translate(0,' + innerHeight + ')')
    .call(xAxis);

  gx.selectAll('text')
    .style('fill', '#94A3B8')
    .style('font-family', 'var(--font-mono)')
    .style('font-size', '10px');
  gx.select('.domain').style('stroke', 'rgba(255, 255, 255, 0.1)');
  gx.selectAll('line').style('stroke', 'rgba(255, 255, 255, 0.1)');

  // Sumbu Y
  var yAxis = d3.axisLeft(yScale)
    .ticks(5)
    .tickFormat(function(d) {
      return (typeof fmtK === 'function') ? fmtK(d) : (d >= 1e9 ? (d/1e9).toFixed(1)+'M' : (d >= 1e6 ? (d/1e6).toFixed(0)+'jt' : d));
    });

  var gy = g.append('g').call(yAxis);
  gy.selectAll('text')
    .style('fill', '#94A3B8')
    .style('font-family', 'var(--font-mono)')
    .style('font-size', '10px');
  gy.select('.domain').remove();
  gy.selectAll('line').remove();

  // ── Interaktivitas Crosshair & Focus Points ──
  var focusLine = g.append('line')
    .attr('class', 'focus-line')
    .style('stroke', '#94A3B8')
    .style('stroke-width', 1)
    .style('stroke-dasharray', '3,3')
    .style('opacity', 0)
    .attr('y1', 0)
    .attr('y2', innerHeight);

  var focusDot = g.append('circle')
    .attr('class', 'focus-dot')
    .attr('r', 5)
    .attr('fill', '#10B981')
    .attr('stroke', '#FFFFFF')
    .attr('stroke-width', 2)
    .style('filter', 'url(#d3-glow)')
    .style('opacity', 0);

  var focusDotModal = g.append('circle')
    .attr('class', 'focus-dot-modal')
    .attr('r', 4)
    .attr('fill', '#60A5FA')
    .attr('stroke', '#FFFFFF')
    .attr('stroke-width', 1.5)
    .style('opacity', 0);

  var bisectDate = d3.bisector(function(d) { return d.date; }).left;

  // Overlay Transparan untuk Menangkap Mouse & Touch Event
  g.append('rect')
    .attr('class', 'overlay')
    .attr('width', innerWidth)
    .attr('height', innerHeight)
    .style('fill', 'none')
    .style('pointer-events', 'all')
    .on('mousemove touchmove', function(event) {
      var coords = d3.pointer(event, this);
      var x0 = xScale.invert(coords[0]);
      var i = bisectDate(data, x0, 1);
      var d0 = data[i - 1];
      var d1 = data[i];
      var d = d0;
      if (d1 && d0) {
        d = (x0 - d0.date > d1.date - x0) ? d1 : d0;
      } else if (d1) {
        d = d1;
      }
      if (!d) return;

      var cx = xScale(d.date);
      var cy = (D3_NW_STATE.mode === 'pnl') ? yScale(d.totalPnl) : yScale(d.netWorth);

      focusLine
        .attr('x1', cx)
        .attr('x2', cx)
        .style('opacity', 0.8);

      focusDot
        .attr('cx', cx)
        .attr('cy', cy)
        .attr('fill', (D3_NW_STATE.mode === 'pnl' ? '#F59E0B' : '#10B981'))
        .style('opacity', 1);

      if (D3_NW_STATE.mode === 'both') {
        focusDotModal
          .attr('cx', cx)
          .attr('cy', yScale(d.investedCapital))
          .style('opacity', 1);
      } else {
        focusDotModal.style('opacity', 0);
      }

      // Update Tooltip Floating Box
      if (tooltip) {
        var dateFormatted = d3.timeFormat("%d %B %Y")(d.date);
        var isPos = d.totalPnl >= 0;
        var html = '<div style="font-weight:700;color:var(--text);border-bottom:1px solid rgba(255,255,255,.1);padding-bottom:4px;margin-bottom:6px">📅 ' + dateFormatted + '</div>'
          + '<div style="display:flex;justify-content:space-between;gap:12px;margin-bottom:3px"><span style="color:var(--text3)">Net Worth:</span><span style="font-weight:700;color:#10B981">Rp ' + fmt(d.netWorth) + '</span></div>'
          + '<div style="display:flex;justify-content:space-between;gap:12px;margin-bottom:3px"><span style="color:var(--text3)">Modal Disetor:</span><span style="font-weight:700;color:#60A5FA">Rp ' + fmt(d.investedCapital) + '</span></div>'
          + '<div style="display:flex;justify-content:space-between;gap:12px;margin-bottom:3px"><span style="color:var(--text3)">Total P&L:</span><span style="font-weight:700;color:' + (isPos ? '#10B981' : '#EF4444') + '">' + (isPos ? '+' : '') + 'Rp ' + fmt(d.totalPnl) + ' (' + (isPos ? '+' : '') + d.pnlPct.toFixed(2) + '%)</span></div>'
          + (d.activeCount > 0 ? '<div style="display:flex;justify-content:space-between;gap:12px"><span style="color:var(--text3)">Saham Aktif:</span><span style="color:var(--text)">' + d.activeCount + ' emiten</span></div>' : '');

        tooltip.innerHTML = html;
        tooltip.style.display = 'block';

        // Hitung posisi tooltip agar tidak keluar layar
        var tooltipWidth = tooltip.offsetWidth || 190;
        var posX = cx + margin.left + 14;
        if (posX + tooltipWidth > width) {
          posX = cx + margin.left - tooltipWidth - 14;
        }
        var posY = Math.max(10, cy + margin.top - 30);

        tooltip.style.left = posX + 'px';
        tooltip.style.top = posY + 'px';
      }
    })
    .on('mouseleave touchend', function() {
      focusLine.style('opacity', 0);
      focusDot.style('opacity', 0);
      focusDotModal.style('opacity', 0);
      if (tooltip) tooltip.style.display = 'none';
    });
}

// ── Inisialisasi ResizeObserver untuk Responsivitas Optimal ──
function initD3NetWorthResize() {
  var wrapper = document.getElementById('d3-nw-wrapper');
  if (wrapper && window.ResizeObserver) {
    var ro = new ResizeObserver(function() {
      renderD3NetWorthChart();
    });
    ro.observe(wrapper);
  }
}

// Jalankan otomatis saat DOM selesai dimuat
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', function() {
    initD3NetWorthResize();
    setTimeout(renderD3NetWorthChart, 300);
  });
} else {
  initD3NetWorthResize();
  setTimeout(renderD3NetWorthChart, 300);
}
