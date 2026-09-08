/**
 * 44-sectoral-insight.js — MoneyWatch Pro: Sectoral Insight & Capital Flow Intelligence
 * 
 * Modul Analisis Rotasi Sektoral & Intelijen Aliran Dana (IDX Sector Rotation & Flow Analysis).
 * Mengidentifikasi sektor-sektor yang sedang mengalami Akumulasi vs Distribusi secara matematis
 * menggunakan Chaikin Money Flow (CMF 20) & Money Flow Multiplier (MFM) konstituen saham riil,
 * serta menghubungkannya langsung dengan sentimen berita finansial dan aksi korporasi terkini.
 * 
 * PRINSIP INTEGRITAS DATA:
 * - Data harga & volume 100% riil dari konstituen resmi IDX (SSOT Yahoo Finance / BEI).
 * - Tidak menggunakan data dummy/fiktif hanya untuk menghias UI.
 * - Transparansi: Menjelaskan bahwa status akumulasi/distribusi diturunkan dari dinamika
 *   volume & CMF konstituen (karena BEI tidak menyediakan broker feed internal publik gratis).
 */

(function(window) {
  'use strict';

  // 11 Sektor Resmi IDX dengan konstituen Big Caps riil
  var IDX_SECTOR_DEFINITIONS = [
    {
      key: 'financials',
      name: 'Financials',
      labelId: 'Keuangan',
      color: '#3b82f6',
      icon: '🏦',
      desc: 'Bank BUKU IV, Asuransi, Pembiayaan & Multifinance',
      constituents: ['BBCA', 'BBRI', 'BMRI', 'BBNI', 'BBTN', 'BRIS', 'BDMN']
    },
    {
      key: 'energy',
      name: 'Energy',
      labelId: 'Energi',
      color: '#f97316',
      icon: '⚡',
      desc: 'Batubara, Minyak & Gas, Energi Baru Terbarukan (EBT)',
      constituents: ['ADRO', 'PTBA', 'PGEO', 'PGAS', 'MEDC', 'BUMI', 'INDY']
    },
    {
      key: 'basic-materials',
      name: 'Basic Materials',
      labelId: 'Barang Baku',
      color: '#eab308',
      icon: '⛏️',
      desc: 'Tambang Emas, Nikel, Tembaga, Kimia & Kertas',
      constituents: ['ANTM', 'INCO', 'MDKA', 'BRPT', 'SMGR', 'INKP', 'TPIA']
    },
    {
      key: 'consumer-non-cyclicals',
      name: 'Consumer Non-Cyclicals',
      labelId: 'Konsumer Primer',
      color: '#10b981',
      icon: '🛒',
      desc: 'FMCG, Makanan & Minuman, Rokok & Kebutuhan Pokok',
      constituents: ['ICBP', 'INDF', 'UNVR', 'MYOR', 'CPIN', 'GGRM', 'HMSP']
    },
    {
      key: 'consumer-cyclicals',
      name: 'Consumer Cyclicals',
      labelId: 'Konsumer Non-Primer',
      color: '#22c55e',
      icon: '🛍️',
      desc: 'Ritel Modern, Gaya Hidup, Hiburan & Otomotif Ritel',
      constituents: ['ACES', 'MAPI', 'ERAA', 'AMRT', 'MAPA', 'RALS']
    },
    {
      key: 'healthcare',
      name: 'Healthcare',
      labelId: 'Kesehatan',
      color: '#14b8a6',
      icon: '🏥',
      desc: 'Farmasi, Rumah Sakit, Herbal & Alat Kesehatan',
      constituents: ['KLBF', 'SIDO', 'MIKA', 'HEAL', 'SILO', 'PRDA']
    },
    {
      key: 'technology',
      name: 'Technology',
      labelId: 'Teknologi',
      color: '#d946ef',
      icon: '💻',
      desc: 'Ekosistem Digital, E-Commerce, Software & Cloud',
      constituents: ['GOTO', 'BUKA', 'EMTK', 'WIRG', 'BELI', 'MTDL']
    },
    {
      key: 'infrastructures',
      name: 'Infrastructures',
      labelId: 'Infrastruktur',
      color: '#f43f5e',
      icon: '🏗️',
      desc: 'Telekomunikasi, Menara, Jalan Tol & Utilitas',
      constituents: ['TLKM', 'EXCL', 'ISAT', 'JSMR', 'TOWR', 'TBIG']
    },
    {
      key: 'properties',
      name: 'Properties & Real Estate',
      labelId: 'Properti',
      color: '#8b5cf6',
      icon: '🏢',
      desc: 'Township, Real Estat Residensial, Mall & Konstruksi',
      constituents: ['BSDE', 'PWON', 'CTRA', 'SMRA', 'ASRI', 'APLN']
    },
    {
      key: 'industrials',
      name: 'Industrials',
      labelId: 'Perindustrian',
      color: '#84cc16',
      icon: '⚙️',
      desc: 'Alat Berat, Mesin, Fabrikasi & Komponen Otomotif',
      constituents: ['ASII', 'UNTR', 'HEXA', 'ARNA', 'MARK', 'AUTO']
    },
    {
      key: 'transportation',
      name: 'Transportation & Logistics',
      labelId: 'Transportasi & Logistik',
      color: '#06b6d4',
      icon: '🚢',
      desc: 'Pelayaran Peti Kemas, Logistik Maritim & Transportasi Darat',
      constituents: ['SMDR', 'TMAS', 'BIRD', 'ASSA', 'GIAA']
    }
  ];

  // State lokal Sectoral Insight
  var _siState = {
    timeframe: '1D', // '1D' | '1W' | '1M'
    viewMode: 'bar', // 'bar' | 'quadrant' | 'list'
    selectedSectorKey: null, // null = all
    newsData: [],
    isFetchingNews: false,
    newsError: null,
    metrics: null,
    lastUpdated: null
  };

  // Instance ResizeObserver D3
  var _siResizeObserver = null;

  /**
   * Menghitung Chaikin Money Flow & Performa Constituent secara deterministik
   */
  function siComputeConstituentStats(ticker, timeframeDays) {
    var tk = String(ticker).toUpperCase().trim().replace(/\.JK$/i, '');
    var ohlcv = [];
    
    // Ambil deret candle riil
    if (typeof fsGenData === 'function') {
      ohlcv = fsGenData(tk, 45);
    }
    
    if (!ohlcv || ohlcv.length === 0) {
      // Fallback kuotasi SSOT jika fsGenData kosong
      var curPrice = (typeof getGlobalMarketPrice === 'function') ? getGlobalMarketPrice(tk) : 0;
      return {
        ticker: tk,
        price: curPrice,
        retPct: 0,
        cmf: 0,
        volume: 0,
        turnover: 0,
        valid: false
      };
    }

    var n = ohlcv.length;
    var lastCandle = ohlcv[n - 1];
    var curClose = Number(lastCandle.c !== undefined ? lastCandle.c : (lastCandle.close || 0));
    
    // Tentukan index baseline berdasarkan timeframe
    var lookback = timeframeDays || 1;
    var baseIdx = Math.max(0, n - 1 - lookback);
    var baseClose = Number(ohlcv[baseIdx].c !== undefined ? ohlcv[baseIdx].c : (ohlcv[baseIdx].close || curClose));
    
    var retPct = baseClose > 0 ? ((curClose - baseClose) / baseClose) * 100 : 0;

    // Hitung CMF (20 periode)
    var p = 20;
    var startIdx = Math.max(0, n - p);
    var sumMfv = 0;
    var sumVol = 0;

    for (var i = startIdx; i < n; i++) {
      var d = ohlcv[i];
      var c = Number(d.c !== undefined ? d.c : (d.close || 0));
      var o = Number(d.o !== undefined ? d.o : (d.open || c));
      var h = Number(d.h !== undefined ? d.h : (d.high || Math.max(o, c)));
      var l = Number(d.l !== undefined ? d.l : (d.low || Math.min(o, c)));
      var v = Number(d.v !== undefined ? d.v : (d.volume || 0));

      var mfm = (h !== l) ? (((c - l) - (h - c)) / (h - l)) : 0;
      sumMfv += (mfm * v);
      sumVol += v;
    }

    var cmfVal = sumVol > 0 ? (sumMfv / sumVol) : 0;
    // Cap batas wajar CMF [-1.0 s.d +1.0]
    cmfVal = Math.max(-1, Math.min(1, cmfVal));

    var totalVolPeriod = 0;
    for (var j = Math.max(0, n - lookback); j < n; j++) {
      totalVolPeriod += Number(ohlcv[j].v !== undefined ? ohlcv[j].v : (ohlcv[j].volume || 0));
    }

    return {
      ticker: tk,
      price: curClose,
      retPct: retPct,
      cmf: cmfVal,
      volume: totalVolPeriod,
      turnover: totalVolPeriod * curClose,
      valid: true
    };
  }

  /**
   * Menghitung metrik lengkap seluruh 11 sektor
   */
  function siComputeAllSectors(timeframe) {
    var tfDays = (timeframe === '1M') ? 20 : (timeframe === '1W' ? 5 : 1);
    var results = [];

    IDX_SECTOR_DEFINITIONS.forEach(function(sec) {
      var constituentStats = [];
      var totalTurnover = 0;
      var weightedCmfSum = 0;
      var weightedRetSum = 0;
      var totalVol = 0;

      sec.constituents.forEach(function(tk) {
        var stat = siComputeConstituentStats(tk, tfDays);
        constituentStats.push(stat);
        
        var w = Math.max(1, stat.turnover);
        weightedCmfSum += (stat.cmf * w);
        weightedRetSum += (stat.retPct * w);
        totalTurnover += stat.turnover;
        totalVol += stat.volume;
      });

      var avgCmf = totalTurnover > 0 ? (weightedCmfSum / totalTurnover) : 0;
      var avgRet = totalTurnover > 0 ? (weightedRetSum / totalTurnover) : 0;

      // Status klasifikasi
      var flowStatus = 'NETRAL';
      var flowBadgeClass = 'b-gray';
      var flowScoreLabel = 'Aliran Berimbang';

      if (avgCmf >= 0.12) {
        flowStatus = 'BIG ACCUMULATION';
        flowBadgeClass = 'b-up';
        flowScoreLabel = 'Akumulasi Masif';
      } else if (avgCmf >= 0.04) {
        flowStatus = 'ACCUMULATION';
        flowBadgeClass = 'b-up';
        flowScoreLabel = 'Akumulasi Ringan';
      } else if (avgCmf <= -0.12) {
        flowStatus = 'HEAVY DISTRIBUTION';
        flowBadgeClass = 'b-dn';
        flowScoreLabel = 'Distribusi Berat';
      } else if (avgCmf <= -0.04) {
        flowStatus = 'DISTRIBUTION';
        flowBadgeClass = 'b-dn';
        flowScoreLabel = 'Distribusi Ringan';
      }

      // Urutkan constituent movers
      constituentStats.sort(function(a, b) {
        return b.retPct - a.retPct;
      });

      results.push({
        key: sec.key,
        name: sec.name,
        labelId: sec.labelId,
        color: sec.color,
        icon: sec.icon,
        desc: sec.desc,
        constituents: sec.constituents,
        constituentStats: constituentStats,
        cmf: avgCmf,
        retPct: avgRet,
        volume: totalVol,
        turnover: totalTurnover,
        flowStatus: flowStatus,
        flowBadgeClass: flowBadgeClass,
        flowScoreLabel: flowScoreLabel,
        topGainer: constituentStats[0] || null,
        topLaggard: constituentStats[constituentStats.length - 1] || null
      });
    });

    // Urutkan dari Akumulasi tertinggi (CMF terbesar) ke terendah
    results.sort(function(a, b) {
      return b.cmf - a.cmf;
    });

    return results;
  }

  /**
   * Mengambil berita sektoral dari API backend atau fallback
   */
  async function siFetchNews(force) {
    if (_siState.isFetchingNews) return;
    _siState.isFetchingNews = true;
    _siState.newsError = null;

    try {
      var url = '/api/sectoral-news' + (force ? '?force=true' : '');
      var res = await fetch(url);
      if (res.ok) {
        var data = await res.json();
        if (data && Array.isArray(data.headlines)) {
          _siState.newsData = data.headlines;
          // FIX AUDIT (fabricated data): server used to always substitute
          // 11 hardcoded fake headlines when real search-grounded news
          // wasn't available, with no disclosure. It now returns an
          // honest empty list + dataUnavailable/message instead - surface
          // that message rather than silently showing zero news.
          if (data.headlines.length === 0 && data.dataUnavailable) {
            _siState.newsError = data.message || 'Belum ada berita real-time yang tersedia saat ini.';
          }
        }
      }
    } catch (e) {
      console.warn('Gagal memuat berita sektoral dari API:', e);
      _siState.newsError = 'Gagal menghubungi server berita.';
    } finally {
      _siState.isFetchingNews = false;
      _siState.lastUpdated = new Date();
      siRenderNewsPanel();
      siRenderKPIs();
    }
  }

  /**
   * Mengganti Timeframe (1D, 1W, 1M)
   */
  window.siSetTimeframe = function(tf) {
    if (!['1D', '1W', '1M'].includes(tf)) return;
    _siState.timeframe = tf;

    // Perbarui tombol aktif
    document.querySelectorAll('.si-tf-btn').forEach(function(btn) {
      btn.classList.toggle('on', btn.getAttribute('data-tf') === tf);
    });

    // Hitung ulang metrik
    _siState.metrics = siComputeAllSectors(tf);

    // Re-render seluruh komponen
    siRenderKPIs();
    siRenderVisualPane();
    siRenderTable();
  };

  /**
   * Mengganti Mode Tampilan Visual (D3 Bar vs Sectoral Cycle Matrix vs List)
   */
  window.siSetViewMode = function(mode) {
    if (!['bar', 'quadrant', 'list'].includes(mode)) return;
    _siState.viewMode = mode;

    document.querySelectorAll('.si-view-btn').forEach(function(btn) {
      btn.classList.toggle('on', btn.getAttribute('data-view') === mode);
    });

    var titleEl = document.getElementById('si-visual-card-title');
    var subEl = document.getElementById('si-visual-card-sub');
    if (titleEl) {
      if (mode === 'quadrant') {
        titleEl.textContent = 'Sectoral Cycle Matrix (Rotasi 4 Kuadran Siklus Pasar)';
        if (subEl) subEl.textContent = 'Memetakan 11 sektor IDX dalam 4 fase siklus (Akumulasi, Markup, Distribusi, Markdown) berdasarkan CMF & Performa Harga.';
      } else if (mode === 'list') {
        titleEl.textContent = 'Daftar Ringkas Aliran Sektoral';
        if (subEl) subEl.textContent = 'Ringkasan kartu status aliran modal dan performa masing-masing sektor IDX.';
      } else {
        titleEl.textContent = 'Pergerakan Aliran Modal Sektoral';
        if (subEl) subEl.textContent = 'Urut dari Akumulasi Terkuat (atas) ke Distribusi Terberat (bawah). Klik bar untuk menyaring berita terkait.';
      }
    }

    siRenderVisualPane();
  };

  /**
   * Memilih Sektor untuk Filter Berita
   */
  window.siSelectSector = function(sectorKey) {
    if (_siState.selectedSectorKey === sectorKey) {
      // Toggle off jika diklik ulang
      _siState.selectedSectorKey = null;
    } else {
      _siState.selectedSectorKey = sectorKey;
    }

    siRenderVisualPane();
    siRenderNewsPanel();
    siRenderTable();
  };

  /**
   * Mereset Filter Sektor
   */
  window.siClearSectorFilter = function() {
    _siState.selectedSectorKey = null;
    siRenderVisualPane();
    siRenderNewsPanel();
    siRenderTable();
  };

  /**
   * Segarkan Seluruh Data Sektoral & Berita
   */
  window.siRefreshAll = function() {
    _siState.metrics = siComputeAllSectors(_siState.timeframe);
    siRenderKPIs();
    siRenderVisualPane();
    siRenderTable();
    siFetchNews(true);
  };

  /**
   * Render 4 KPI Stat Cards
   */
  function siRenderKPIs() {
    if (!_siState.metrics) return;
    var m = _siState.metrics;

    var topAcc = m[0];
    var topDist = m[m.length - 1];

    var accCount = m.filter(function(s) { return s.cmf >= 0.04; }).length;
    var distCount = m.filter(function(s) { return s.cmf <= -0.04; }).length;

    // Hitung total news
    var newsCount = _siState.newsData.length;
    var bullishNewsCount = _siState.newsData.filter(function(n) { return n.impact === 'BULLISH'; }).length;

    var elTopAcc = document.getElementById('si-kpi-top-acc');
    var elTopDist = document.getElementById('si-kpi-top-dist');
    var elBreadth = document.getElementById('si-kpi-breadth');
    var elNewsKpi = document.getElementById('si-kpi-news');

    if (elTopAcc) {
      elTopAcc.innerHTML = 
        '<div class="mlabel">Sektor Akumulasi Terkuat</div>' +
        '<div class="mval up" style="font-size:16px;display:flex;align-items:center;gap:6px">' +
          '<span>' + topAcc.icon + ' ' + topAcc.name + '</span>' +
        '</div>' +
        '<div class="msub" style="color:var(--text2)">CMF <strong>' + (topAcc.cmf >= 0 ? '+' : '') + topAcc.cmf.toFixed(2) + '</strong> · Ret <span class="' + (topAcc.retPct >= 0 ? 'up' : 'dn') + '">' + (topAcc.retPct >= 0 ? '+' : '') + topAcc.retPct.toFixed(1) + '%</span></div>';
    }

    if (elTopDist) {
      elTopDist.innerHTML = 
        '<div class="mlabel">Sektor Distribusi Terberat</div>' +
        '<div class="mval dn" style="font-size:16px;display:flex;align-items:center;gap:6px">' +
          '<span>' + topDist.icon + ' ' + topDist.name + '</span>' +
        '</div>' +
        '<div class="msub" style="color:var(--text2)">CMF <strong>' + topDist.cmf.toFixed(2) + '</strong> · Ret <span class="' + (topDist.retPct >= 0 ? 'up' : 'dn') + '">' + (topDist.retPct >= 0 ? '+' : '') + topDist.retPct.toFixed(1) + '%</span></div>';
    }

    if (elBreadth) {
      var biasLabel = accCount > distCount ? 'Akumulasi Dominan' : (distCount > accCount ? 'Distribusi Dominan' : 'Aliran Berimbang');
      var biasClass = accCount > distCount ? 'up' : (distCount > accCount ? 'dn' : 'neu');
      elBreadth.innerHTML = 
        '<div class="mlabel">Breadth Aliran Pasar IDX</div>' +
        '<div class="mval ' + biasClass + '" style="font-size:16px">' + biasLabel + '</div>' +
        '<div class="msub" style="color:var(--text2)">' + accCount + ' Sektor Akumulasi · ' + distCount + ' Distribusi</div>';
    }

    if (elNewsKpi) {
      elNewsKpi.innerHTML = 
        '<div class="mlabel">Sentimen Berita Sektoral</div>' +
        '<div class="mval" style="font-size:16px;color:var(--accent)">' + newsCount + ' Katalis Terdeteksi</div>' +
        '<div class="msub" style="color:var(--text2)">' + bullishNewsCount + ' Bullish · ' + (newsCount - bullishNewsCount) + ' Netral/Risiko</div>';
    }
  }

  /**
   * Render Bagian Visual Kiri (Mode D3 Bar, Kuadran, atau List)
   */
  function siRenderVisualPane() {
    var container = document.getElementById('si-visual-container');
    if (!container || !_siState.metrics) return;

    if (_siResizeObserver) {
      try { _siResizeObserver.disconnect(); } catch (e) {}
      _siResizeObserver = null;
    }

    if (_siState.viewMode === 'quadrant') {
      siRenderQuadrantView(container);
    } else if (_siState.viewMode === 'list') {
      siRenderBarFlowView(container);
    } else {
      siRenderD3CmfBarChart(container);
    }
  }

  /**
   * Visualisasi Utama D3.js: Net Chaikin Money Flow (CMF) Bar Chart
   * Menampilkan divergensi akumulasi (kanan / hijau) vs distribusi (kiri / merah)
   * untuk seluruh 11 sektor resmi IDX lengkap dengan ambang batas signifikansi.
   */
  function siRenderD3CmfBarChart(container) {
    if (!window.d3) {
      siRenderBarFlowView(container);
      return;
    }

    var m = _siState.metrics;
    if (!m || m.length === 0) {
      container.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text3)">Memuat data CMF sektoral...</div>';
      return;
    }

    // Urutkan data secara menurun berdasarkan CMF (Akumulasi terkuat di atas, Distribusi terberat di bawah)
    var data = m.slice().sort(function(a, b) { return b.cmf - a.cmf; });
    var selKey = _siState.selectedSectorKey;

    container.innerHTML = '';

    // Header Legend & Filter Info
    var headerEl = document.createElement('div');
    headerEl.className = 'si-d3-header';
    headerEl.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:0 4px 10px 4px;font-size:11px;color:var(--text3);border-bottom:1px dashed var(--border2);margin-bottom:8px;flex-wrap:wrap;gap:8px';
    headerEl.innerHTML = 
      '<div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">' +
        '<span style="display:inline-flex;align-items:center;gap:5px"><span style="width:10px;height:10px;border-radius:2px;background:#10b981;display:inline-block"></span><strong style="color:var(--text)">Akumulasi (Inflow &gt; 0)</strong></span>' +
        '<span style="display:inline-flex;align-items:center;gap:5px"><span style="width:10px;height:10px;border-radius:2px;background:#ef4444;display:inline-block"></span><strong style="color:var(--text)">Distribusi (Outflow &lt; 0)</strong></span>' +
        '<span style="display:inline-flex;align-items:center;gap:5px"><span style="width:10px;height:2px;background:var(--text3);display:inline-block"></span><span>Ambang Signifikan ±0.05</span></span>' +
      '</div>' +
      '<div style="display:flex;align-items:center;gap:6px">' +
        (selKey ? '<span class="badge b-accent" style="font-size:9.5px;padding:1px 6px">Filter Aktif</span><button onclick="siClearSectorFilter()" class="btn btn-ghost btn-xs" style="padding:1px 6px;font-size:10px;color:var(--text2)">Reset</button>' : '<span style="font-style:italic">Klik bar untuk menyaring berita</span>') +
      '</div>';
    container.appendChild(headerEl);

    // Chart Wrapper
    var chartWrapper = document.createElement('div');
    chartWrapper.id = 'si-d3-chart-wrapper';
    chartWrapper.style.cssText = 'position:relative;width:100%;height:460px;user-select:none';
    container.appendChild(chartWrapper);

    var width = chartWrapper.clientWidth || container.clientWidth || 520;
    var height = 450;

    var isMobile = width < 500;
    var margin = {
      top: 24,
      right: isMobile ? 55 : 68,
      bottom: 26,
      left: isMobile ? 120 : 155
    };
    var innerW = Math.max(120, width - margin.left - margin.right);
    var innerH = Math.max(200, height - margin.top - margin.bottom);

    var svg = d3.select(chartWrapper)
      .append('svg')
      .attr('id', 'si-d3-svg')
      .attr('width', '100%')
      .attr('height', height)
      .attr('viewBox', '0 0 ' + width + ' ' + height)
      .style('display', 'block');

    // Tooltip tunggal global
    var tooltip = d3.select('body').select('#si-d3-tooltip');
    if (tooltip.empty()) {
      tooltip = d3.select('body').append('div')
        .attr('id', 'si-d3-tooltip')
        .style('position', 'fixed')
        .style('z-index', '99999')
        .style('display', 'none')
        .style('pointer-events', 'none')
        .style('background', 'var(--bg2, #181826)')
        .style('border', '1px solid var(--border, #2d2d42)')
        .style('box-shadow', '0 8px 24px rgba(0,0,0,0.5)')
        .style('border-radius', '8px')
        .style('padding', '10px 12px')
        .style('font-size', '11.5px')
        .style('color', 'var(--text, #f8fafc)')
        .style('line-height', '1.4');
    }

    // SVG Gradients
    var defs = svg.append('defs');

    // Gradien Akumulasi Standar
    var gradAcc = defs.append('linearGradient')
      .attr('id', 'si-grad-acc')
      .attr('x1', '0%').attr('y1', '0%')
      .attr('x2', '100%').attr('y2', '0%');
    gradAcc.append('stop').attr('offset', '0%').attr('stop-color', '#059669');
    gradAcc.append('stop').attr('offset', '100%').attr('stop-color', '#10b981');

    // Gradien Big Accumulation
    var gradAccStrong = defs.append('linearGradient')
      .attr('id', 'si-grad-strong-acc')
      .attr('x1', '0%').attr('y1', '0%')
      .attr('x2', '100%').attr('y2', '0%');
    gradAccStrong.append('stop').attr('offset', '0%').attr('stop-color', '#10b981');
    gradAccStrong.append('stop').attr('offset', '100%').attr('stop-color', '#34d399');

    // Gradien Distribusi Standar
    var gradDist = defs.append('linearGradient')
      .attr('id', 'si-grad-dist')
      .attr('x1', '100%').attr('y1', '0%')
      .attr('x2', '0%').attr('y2', '0%');
    gradDist.append('stop').attr('offset', '0%').attr('stop-color', '#b91c1c');
    gradDist.append('stop').attr('offset', '100%').attr('stop-color', '#ef4444');

    // Gradien Heavy Distribution
    var gradDistStrong = defs.append('linearGradient')
      .attr('id', 'si-grad-strong-dist')
      .attr('x1', '100%').attr('y1', '0%')
      .attr('x2', '0%').attr('y2', '0%');
    gradDistStrong.append('stop').attr('offset', '0%').attr('stop-color', '#ef4444');
    gradDistStrong.append('stop').attr('offset', '100%').attr('stop-color', '#f87171');

    // Gradien Netral
    var gradNeutral = defs.append('linearGradient')
      .attr('id', 'si-grad-neutral')
      .attr('x1', '0%').attr('y1', '0%')
      .attr('x2', '100%').attr('y2', '0%');
    gradNeutral.append('stop').attr('offset', '0%').attr('stop-color', '#475569');
    gradNeutral.append('stop').attr('offset', '100%').attr('stop-color', '#94a3b8');

    // Hitung Skala Simetris Berbasis CMF Maksimum
    var maxVal = d3.max(data, function(d) { return Math.abs(d.cmf); }) || 0.20;
    var domainLimit = Math.max(0.24, Math.ceil(maxVal * 1.25 * 20) / 20);

    var xScale = d3.scaleLinear()
      .domain([-domainLimit, domainLimit])
      .range([0, innerW]);

    var yScale = d3.scaleBand()
      .domain(data.map(function(d) { return d.key; }))
      .range([0, innerH])
      .padding(0.24);

    var g = svg.append('g')
      .attr('transform', 'translate(' + margin.left + ',' + margin.top + ')');

    var x0 = xScale(0);

    // Area Latar Belakang Distribusi (Kiri)
    g.append('rect')
      .attr('x', 0)
      .attr('y', 0)
      .attr('width', x0)
      .attr('height', innerH)
      .attr('fill', '#ef4444')
      .attr('opacity', 0.03);

    // Area Latar Belakang Akumulasi (Kanan)
    g.append('rect')
      .attr('x', x0)
      .attr('y', 0)
      .attr('width', innerW - x0)
      .attr('height', innerH)
      .attr('fill', '#10b981')
      .attr('opacity', 0.03);

    // Label Header Zona Aliran
    g.append('text')
      .attr('x', x0 / 2)
      .attr('y', -8)
      .attr('text-anchor', 'middle')
      .attr('fill', '#ef4444')
      .attr('font-size', '9.5px')
      .attr('font-weight', '700')
      .attr('letter-spacing', '0.5px')
      .text('◀ DISTRIBUSI (OUTFLOW)');

    g.append('text')
      .attr('x', x0 + (innerW - x0) / 2)
      .attr('y', -8)
      .attr('text-anchor', 'middle')
      .attr('fill', '#10b981')
      .attr('font-size', '9.5px')
      .attr('font-weight', '700')
      .attr('letter-spacing', '0.5px')
      .text('AKUMULASI (INFLOW) ▶');

    // Garis Ambang Signifikansi (+0.05 dan -0.05) dengan animasi fade-in
    var threshPos = xScale(0.05);
    var threshNeg = xScale(-0.05);

    g.append('line')
      .attr('class', 'si-d3-thresh-line')
      .attr('x1', threshPos).attr('x2', threshPos)
      .attr('y1', 0).attr('y2', innerH)
      .attr('stroke', '#10b981')
      .attr('stroke-width', 1)
      .attr('stroke-dasharray', '3,3')
      .attr('opacity', 0)
      .transition()
      .duration(450)
      .attr('opacity', 0.45);

    g.append('line')
      .attr('class', 'si-d3-thresh-line')
      .attr('x1', threshNeg).attr('x2', threshNeg)
      .attr('y1', 0).attr('y2', innerH)
      .attr('stroke', '#ef4444')
      .attr('stroke-width', 1)
      .attr('stroke-dasharray', '3,3')
      .attr('opacity', 0)
      .transition()
      .duration(450)
      .attr('opacity', 0.45);

    // Garis Tengah Netral 0.00 (Solid) dengan transisi mulus
    g.append('line')
      .attr('class', 'si-d3-zero-line')
      .attr('x1', x0).attr('x2', x0)
      .attr('y1', 0).attr('y2', innerH)
      .attr('stroke', 'var(--border, #475569)')
      .attr('stroke-width', 1.5)
      .attr('opacity', 0)
      .transition()
      .duration(350)
      .attr('opacity', 1);

    // X Axis
    var xAxis = d3.axisBottom(xScale)
      .ticks(Math.min(7, Math.floor(innerW / 65)))
      .tickFormat(function(d) {
        if (d === 0) return '0.00';
        return (d > 0 ? '+' : '') + d.toFixed(2);
      });

    var xAxisG = g.append('g')
      .attr('transform', 'translate(0,' + innerH + ')')
      .call(xAxis);

    xAxisG.select('.domain').attr('stroke', 'var(--border2, #334155)');
    xAxisG.selectAll('.tick line').attr('stroke', 'var(--border2, #334155)').attr('stroke-dasharray', '2,2');
    xAxisG.selectAll('.tick text')
      .attr('fill', 'var(--text3, #94a3b8)')
      .attr('font-size', '10px')
      .attr('font-family', 'var(--font-mono, monospace)');

    // Grup Bar Sektoral
    var rows = g.selectAll('.si-d3-row')
      .data(data)
      .enter()
      .append('g')
      .attr('class', function(d) {
        return 'si-d3-row' + (d.cmf >= 0 ? ' is-positive' : ' is-negative') + (selKey === d.key ? ' is-selected' : '');
      })
      .attr('transform', function(d) { return 'translate(0,' + yScale(d.key) + ')'; })
      .style('cursor', 'pointer');

    // Bar Latar Hover Seluruh Baris
    rows.append('rect')
      .attr('class', 'si-d3-row-bg')
      .attr('x', -margin.left)
      .attr('y', -2)
      .attr('width', width)
      .attr('height', yScale.bandwidth() + 4)
      .attr('fill', function(d) {
        return (selKey === d.key) ? 'var(--brand-soft, rgba(59,130,246,0.12))' : 'transparent';
      })
      .attr('stroke', function(d) {
        return (selKey === d.key) ? 'var(--accent, #3b82f6)' : 'transparent';
      })
      .attr('stroke-width', function(d) {
        return (selKey === d.key) ? 1 : 0;
      })
      .attr('rx', 4);

    // Batang Bar CMF (Diverging Bar) dengan Entrance Staggered Animation & Hover State
    rows.append('rect')
      .attr('class', function(d) {
        return 'si-d3-bar ' + (d.cmf >= 0 ? 'is-positive-bar' : 'is-negative-bar');
      })
      .attr('y', 0)
      .attr('height', yScale.bandwidth())
      .attr('rx', 4)
      .attr('ry', 4)
      .attr('fill', function(d) {
        if (d.cmf >= 0.12) return 'url(#si-grad-strong-acc)';
        if (d.cmf >= 0.04) return 'url(#si-grad-acc)';
        if (d.cmf <= -0.12) return 'url(#si-grad-strong-dist)';
        if (d.cmf <= -0.04) return 'url(#si-grad-dist)';
        return 'url(#si-grad-neutral)';
      })
      .attr('stroke', function(d) {
        return (selKey === d.key) ? 'var(--accent, #3b82f6)' : 'none';
      })
      .attr('stroke-width', function(d) {
        return (selKey === d.key) ? 2 : 0;
      })
      .attr('opacity', 0.2)
      // Posisi awal tepat di sumbu 0 (origin)
      .attr('x', x0)
      .attr('width', 0)
      // Animasi transisi bertingkat (staggered cascade dari akumulator terkuat ke distributor terberat)
      .transition()
      .delay(function(d, i) { return 60 + (i * 42); })
      .duration(540)
      .ease(d3.easeCubicOut)
      .attr('x', function(d) {
        return d.cmf >= 0 ? x0 : xScale(d.cmf);
      })
      .attr('width', function(d) {
        var w = d.cmf >= 0 ? (xScale(d.cmf) - x0) : (x0 - xScale(d.cmf));
        return Math.max(3, w);
      })
      .attr('opacity', function(d) {
        return (selKey !== null && selKey !== d.key) ? 0.38 : 1;
      });

    // Label Y-Axis (Ikon + Nama Sektor) dengan Entrance Slide-in
    var labelG = rows.append('g')
      .attr('class', 'si-d3-label-group')
      .attr('transform', 'translate(-18,' + (yScale.bandwidth() / 2) + ')')
      .attr('opacity', 0);

    labelG.append('text')
      .attr('class', 'si-d3-label-text')
      .attr('text-anchor', 'end')
      .attr('dominant-baseline', 'central')
      .attr('fill', function(d) {
        return (selKey === d.key) ? 'var(--accent, #3b82f6)' : 'var(--text, #f8fafc)';
      })
      .attr('font-size', isMobile ? '10px' : '11.5px')
      .attr('font-weight', function(d) {
        return (selKey === d.key) ? '700' : '600';
      })
      .text(function(d) {
        return d.icon + ' ' + (isMobile ? d.name.substring(0, 11) : d.name);
      });

    labelG.transition()
      .delay(function(d, i) { return i * 35; })
      .duration(380)
      .ease(d3.easeCubicOut)
      .attr('transform', 'translate(-8,' + (yScale.bandwidth() / 2) + ')')
      .attr('opacity', 1);

    // Label Nilai CMF di Ujung Bar dengan Entrance Staggered & Floating Animation
    rows.append('text')
      .attr('class', 'si-d3-val-label')
      .attr('y', yScale.bandwidth() / 2)
      .attr('dominant-baseline', 'central')
      .attr('font-family', 'var(--font-mono, monospace)')
      .attr('font-size', '10px')
      .attr('font-weight', '700')
      .attr('opacity', 0)
      .attr('fill', function(d) {
        return d.cmf >= 0 ? '#10b981' : '#ef4444';
      })
      .attr('text-anchor', function(d) {
        return d.cmf >= 0 ? 'start' : 'end';
      })
      .text(function(d) {
        var sign = d.cmf >= 0 ? '+' : '';
        return sign + d.cmf.toFixed(2);
      })
      .attr('x', x0)
      .transition()
      .delay(function(d, i) { return 180 + (i * 42); })
      .duration(420)
      .ease(d3.easeCubicOut)
      .attr('x', function(d) {
        return d.cmf >= 0 ? (xScale(d.cmf) + 6) : (xScale(d.cmf) - 6);
      })
      .attr('opacity', function(d) {
        return (selKey !== null && selKey !== d.key) ? 0.38 : 1;
      });

    // Event Interaksi (Hover, Focus Dimming & Click Micro-interactions)
    rows
      .on('mouseenter', function(event, d) {
        // Sibling Dimming: redupkan sektor lain agar fokus ke sektor yang disorot
        rows.filter(function(r) { return r.key !== d.key; })
          .transition()
          .duration(180)
          .attr('opacity', 0.28);

        // Pertahankan dan tegaskan baris aktif
        d3.select(this)
          .transition()
          .duration(180)
          .attr('opacity', 1);

        // Highlight baris latar
        d3.select(this).select('.si-d3-row-bg')
          .transition()
          .duration(180)
          .attr('fill', d.cmf >= 0 ? 'rgba(16, 185, 129, 0.14)' : 'rgba(239, 68, 68, 0.14)')
          .attr('stroke', d.cmf >= 0 ? 'rgba(16, 185, 129, 0.4)' : 'rgba(239, 68, 68, 0.4)')
          .attr('stroke-width', 1);

        // Animasi Hover Bar: sedikit membesar secara vertikal + glow outline
        d3.select(this).select('.si-d3-bar')
          .transition()
          .duration(180)
          .ease(d3.easeQuadOut)
          .attr('y', -2)
          .attr('height', yScale.bandwidth() + 4)
          .attr('rx', 5)
          .attr('ry', 5)
          .attr('stroke', d.cmf >= 0 ? '#34d399' : '#f87171')
          .attr('stroke-width', 2);

        // Perbesar dan terangkan label angka CMF
        d3.select(this).select('.si-d3-val-label')
          .transition()
          .duration(180)
          .attr('font-size', '11.5px')
          .attr('font-weight', '800')
          .attr('fill', d.cmf >= 0 ? '#34d399' : '#f87171')
          .attr('x', d.cmf >= 0 ? (xScale(d.cmf) + 8) : (xScale(d.cmf) - 8));

        // Sorot nama sektor
        d3.select(this).select('.si-d3-label-text')
          .transition()
          .duration(180)
          .attr('font-weight', '700')
          .attr('fill', d.cmf >= 0 ? '#10b981' : '#ef4444');

        var cmfSign = d.cmf >= 0 ? '+' : '';
        var retSign = d.retPct >= 0 ? '+' : '';
        var retColor = d.retPct >= 0 ? '#10b981' : '#ef4444';
        var cmfColor = d.cmf >= 0 ? '#10b981' : '#ef4444';

        var moversHtml = '';
        if (Array.isArray(d.constituentStats)) {
          moversHtml = d.constituentStats.slice(0, 3).map(function(st) {
            var r = (st.retPct >= 0 ? '+' : '') + st.retPct.toFixed(1) + '%';
            var c = st.retPct >= 0 ? '#10b981' : '#ef4444';
            return '<span style="font-family:var(--font-mono);font-size:10px;padding:1px 5px;background:var(--bg3);border:1px solid var(--border);border-radius:3px;margin-right:4px">' +
              st.ticker + ' <span style="color:' + c + '">' + r + '</span>' +
            '</span>';
          }).join('');
        }

        // Mini CMF Position Track inside tooltip
        var cmfNorm = Math.max(-1, Math.min(1, d.cmf));
        var cmfPct = ((cmfNorm + 1) / 2) * 100;

        var ttHtml = 
          '<div style="font-weight:700;font-size:13px;display:flex;align-items:center;gap:6px;margin-bottom:4px">' +
            '<span>' + d.icon + ' ' + d.name + '</span>' +
            '<span style="font-size:10px;color:var(--text3)">(' + d.labelId + ')</span>' +
          '</div>' +
          '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">' +
            '<span class="badge ' + d.flowBadgeClass + '" style="font-size:9.5px">' + d.flowStatus + '</span>' +
            '<span style="font-family:var(--font-mono);font-size:11px;font-weight:700;color:' + cmfColor + '">CMF: ' + cmfSign + d.cmf.toFixed(2) + '</span>' +
            '<span style="font-family:var(--font-mono);font-size:11px;color:' + retColor + '">Ret: ' + retSign + d.retPct.toFixed(2) + '%</span>' +
          '</div>' +
          // Mini visual gauge
          '<div style="margin-bottom:8px">' +
            '<div style="display:flex;justify-content:space-between;font-size:9px;color:var(--text3);margin-bottom:2px;font-family:var(--font-mono)">' +
              '<span>-1.00 (Distribusi)</span><span>0.00</span><span>+1.00 (Akumulasi)</span>' +
            '</div>' +
            '<div style="position:relative;width:100%;height:6px;background:rgba(255,255,255,0.08);border-radius:3px;overflow:hidden">' +
              '<div style="position:absolute;left:50%;top:0;bottom:0;width:1px;background:var(--border2)"></div>' +
              '<div style="position:absolute;top:0;bottom:0;border-radius:2px;' + 
                (d.cmf >= 0 ? ('left:50%;width:' + Math.min(50, (d.cmf * 50)).toFixed(1) + '%;background:#10b981') : ('right:50%;width:' + Math.min(50, (Math.abs(d.cmf) * 50)).toFixed(1) + '%;background:#ef4444')) + 
              '"></div>' +
            '</div>' +
          '</div>' +
          '<div style="font-size:10.5px;color:var(--text3);margin-bottom:6px">' +
            'Saham Penggerak: ' + (moversHtml || '-') +
          '</div>' +
          '<div style="font-size:9.5px;color:var(--accent);border-top:1px dashed var(--border2);padding-top:4px;display:flex;align-items:center;gap:4px">' +
            '<span>💡</span> <span>' + (selKey === d.key ? 'Sektor sedang aktif difilter. Klik untuk melepas filter.' : 'Klik bar untuk memfilter berita sektor ' + d.name) + '</span>' +
          '</div>';

        tooltip
          .html(ttHtml)
          .style('display', 'block')
          .style('opacity', '0')
          .style('transform', 'translateY(4px)')
          .style('left', (event.clientX + 16) + 'px')
          .style('top', (event.clientY - 20) + 'px');

        // Smooth fade-in
        requestAnimationFrame(function() {
          tooltip
            .style('opacity', '1')
            .style('transform', 'translateY(0)');
        });
      })
      .on('mousemove', function(event) {
        var x = event.clientX + 16;
        var y = event.clientY - 20;
        if (x + 300 > window.innerWidth) {
          x = event.clientX - 310;
        }
        tooltip
          .style('left', x + 'px')
          .style('top', y + 'px');
      })
      .on('mouseleave', function(event, d) {
        // Kembalikan opasitas seluruh baris
        rows.transition()
          .duration(220)
          .attr('opacity', function(r) {
            return (selKey !== null && selKey !== r.key) ? 0.38 : 1;
          });

        // Kembalikan baris latar
        d3.select(this).select('.si-d3-row-bg')
          .transition()
          .duration(220)
          .attr('fill', function() {
            return (selKey === d.key) ? 'var(--brand-soft, rgba(59,130,246,0.12))' : 'transparent';
          })
          .attr('stroke', function() {
            return (selKey === d.key) ? 'var(--accent, #3b82f6)' : 'transparent';
          })
          .attr('stroke-width', function() {
            return (selKey === d.key) ? 1 : 0;
          });

        // Kembalikan dimensi bar ke ukuran normal
        d3.select(this).select('.si-d3-bar')
          .transition()
          .duration(220)
          .ease(d3.easeQuadOut)
          .attr('y', 0)
          .attr('height', yScale.bandwidth())
          .attr('rx', 4)
          .attr('ry', 4)
          .attr('stroke', function() {
            return (selKey === d.key) ? 'var(--accent, #3b82f6)' : 'none';
          })
          .attr('stroke-width', function() {
            return (selKey === d.key) ? 2 : 0;
          });

        // Kembalikan font & posisi nilai CMF
        d3.select(this).select('.si-d3-val-label')
          .transition()
          .duration(220)
          .attr('font-size', '10px')
          .attr('font-weight', '700')
          .attr('fill', d.cmf >= 0 ? '#10b981' : '#ef4444')
          .attr('x', function() {
            return d.cmf >= 0 ? (xScale(d.cmf) + 6) : (xScale(d.cmf) - 6);
          });

        // Kembalikan label sektor
        d3.select(this).select('.si-d3-label-text')
          .transition()
          .duration(220)
          .attr('font-weight', function() {
            return (selKey === d.key) ? '700' : '600';
          })
          .attr('fill', function() {
            return (selKey === d.key) ? 'var(--accent, #3b82f6)' : 'var(--text, #f8fafc)';
          });

        tooltip
          .style('opacity', '0')
          .style('transform', 'translateY(4px)');
        
        setTimeout(function() {
          if (tooltip.style('opacity') === '0') {
            tooltip.style('display', 'none');
          }
        }, 160);
      })
      .on('click', function(event, d) {
        event.stopPropagation();
        
        // Micro-interaction tactile click pulse
        var clickedRow = d3.select(this);
        clickedRow.select('.si-d3-bar')
          .transition()
          .duration(90)
          .attr('stroke-width', 3)
          .transition()
          .duration(120)
          .attr('stroke-width', 2);

        tooltip.style('display', 'none');
        siSelectSector(d.key);
      });

    // ResizeObserver untuk responsivitas visual otomatis
    if (_siResizeObserver) {
      try { _siResizeObserver.disconnect(); } catch (e) {}
    }

    var resizeTimer = null;
    _siResizeObserver = new ResizeObserver(function(entries) {
      if (!entries || entries.length === 0) return;
      var newW = entries[0].contentRect.width;
      if (Math.abs(newW - width) > 15) {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(function() {
          if (_siState.viewMode === 'bar') {
            siRenderD3CmfBarChart(container);
          }
        }, 150);
      }
    });
    _siResizeObserver.observe(container);
  }

  /**
   * Visualisasi Bar Flow Akumulasi vs Distribusi
   */
  function siRenderBarFlowView(container) {
    var m = _siState.metrics;
    var selKey = _siState.selectedSectorKey;

    var html = '<div style="display:flex;flex-direction:column;gap:8px">';

    m.forEach(function(sec) {
      var isSelected = (selKey === sec.key);
      var isDimmed = (selKey !== null && !isSelected);

      // Hitung bar width proporsional dari rentang CMF
      var absCmf = Math.abs(sec.cmf);
      var barPct = Math.min(100, Math.max(8, Math.round((absCmf / 0.35) * 100)));
      var isPositive = (sec.cmf >= 0);
      var barColor = isPositive ? '#10b981' : '#ef4444';
      if (Math.abs(sec.cmf) < 0.04) barColor = '#94a3b8';

      var borderStyle = isSelected ? 'border:1.5px solid var(--accent);background:var(--brand-soft);' : 'border:1px solid var(--border);background:var(--bg2);';
      var opacityStyle = isDimmed ? 'opacity:0.45;' : 'opacity:1;';

      html += '<div class="si-flow-row" onclick="siSelectSector(\'' + sec.key + '\')" style="padding:10px 14px;border-radius:8px;cursor:pointer;transition:all 0.2s;' + borderStyle + opacityStyle + '">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">' +
          '<div style="display:flex;align-items:center;gap:8px">' +
            '<span style="font-size:16px">' + sec.icon + '</span>' +
            '<span style="font-weight:700;font-size:13px;color:var(--text)">' + sec.name + '</span>' +
            '<span style="font-size:11px;color:var(--text3)">(' + sec.labelId + ')</span>' +
            (isSelected ? '<span class="badge b-accent" style="font-size:9px;padding:1px 6px">TERPILIH</span>' : '') +
          '</div>' +
          '<div style="display:flex;align-items:center;gap:10px">' +
            '<span class="badge ' + (sec.retPct >= 0 ? 'b-up' : 'b-dn') + '" style="font-size:11px;font-family:var(--font-mono)">' +
              (sec.retPct >= 0 ? '+' : '') + sec.retPct.toFixed(2) + '%' +
            '</span>' +
            '<span style="font-family:var(--font-mono);font-size:12px;font-weight:700;color:' + barColor + '">' +
              'CMF ' + (sec.cmf >= 0 ? '+' : '') + sec.cmf.toFixed(2) +
            '</span>' +
          '</div>' +
        '</div>' +

        // Bar visualisasi dual-direction
        '<div style="position:relative;height:7px;background:var(--bg3);border-radius:99px;overflow:hidden;margin-bottom:6px">' +
          '<div style="position:absolute;top:0;bottom:0;left:0;width:' + barPct + '%;background:' + barColor + ';border-radius:99px;transition:width 0.4s ease"></div>' +
        '</div>' +

        '<div style="display:flex;justify-content:space-between;align-items:center;font-size:11px;color:var(--text3)">' +
          '<span>Status: <strong style="color:' + barColor + '">' + sec.flowScoreLabel + '</strong></span>' +
          '<span>Konstituen: ' + sec.constituents.slice(0, 4).join(', ') + '</span>' +
        '</div>' +
      '</div>';
    });

    html += '</div>';
    container.innerHTML = html;
  }

  /**
   * Klasifikasi Sektor ke dalam 4 Kuadran Siklus Pasar (Wyckoff / Sector Rotation Cycle)
   * 1. MARKUP       : CMF > 0 & Return > 0   (Arus modal deras mengiringi kenaikan harga)
   * 2. ACCUMULATION : CMF > 0 & Return <= 0  (Smart money akumulasi di area bawah/diskon)
   * 3. DISTRIBUTION : CMF <= 0 & Return > 0  (Bearish Divergence: harga naik tapi modal keluar)
   * 4. MARKDOWN     : CMF <= 0 & Return <= 0 (Tekanan jual institusi dan downtrend berlanjut)
   */
  function siClassifySectorQuadrant(sec) {
    var isCmfPos = (sec.cmf > 0);
    var isRetPos = (sec.retPct > 0);

    if (isCmfPos && isRetPos) {
      return {
        id: 'markup',
        name: 'Markup',
        titleId: '2. MARKUP (Ekspansi Bullish)',
        subId: 'CMF Inflow > 0 · Return Positif > 0%',
        color: '#10b981',
        bgTint: 'rgba(16, 185, 129, 0.05)',
        borderClr: 'rgba(16, 185, 129, 0.35)',
        badgeClass: 'b-up',
        icon: '🚀',
        quadrantNum: 'I',
        tactic: 'Trend Following · Ride the Winners · Trailing Stop Ketat',
        rationale: 'Arus modal institusional positif mengiringi reli harga. Permintaan mendominasi suplai pasar.'
      };
    } else if (isCmfPos && !isRetPos) {
      return {
        id: 'accumulation',
        name: 'Accumulation',
        titleId: '1. ACCUMULATION (Akumulasi Awal)',
        subId: 'CMF Inflow > 0 · Return Terdiskon <= 0%',
        color: '#06b6d4',
        bgTint: 'rgba(6, 182, 212, 0.05)',
        borderClr: 'rgba(6, 182, 212, 0.35)',
        badgeClass: 'b-accent',
        icon: '📥',
        quadrantNum: 'IV',
        tactic: 'Buy on Weakness · Bottom Fishing · Margin of Safety',
        rationale: 'Smart money mulai menyerap likuiditas di harga dasar sebelum breakout ekspansi harga.'
      };
    } else if (!isCmfPos && isRetPos) {
      return {
        id: 'distribution',
        name: 'Distribution',
        titleId: '3. DISTRIBUTION (Distribusi Pucuk)',
        subId: 'CMF Outflow < 0 · Return Masih Naik >= 0%',
        color: '#f59e0b',
        bgTint: 'rgba(245, 158, 11, 0.05)',
        borderClr: 'rgba(245, 158, 11, 0.35)',
        badgeClass: 'b-warn',
        icon: '📤',
        quadrantNum: 'II',
        tactic: 'Take Profit Bertahap · Waspada Bull Trap · Stop Loss Ketat',
        rationale: 'Bearish Divergence: Kinerja harga masih di pucuk namun arus modal institusional mengalami pelemahan keluar.'
      };
    } else {
      return {
        id: 'markdown',
        name: 'Markdown',
        titleId: '4. MARKDOWN (Penurunan Bearish)',
        subId: 'CMF Outflow < 0 · Return Negatif < 0%',
        color: '#ef4444',
        bgTint: 'rgba(239, 68, 68, 0.05)',
        borderClr: 'rgba(239, 68, 68, 0.35)',
        badgeClass: 'b-dn',
        icon: '📉',
        quadrantNum: 'III',
        tactic: 'Defensive · Jaga RDN Cash Buffer 15-20% · Hindari Pisau Jatuh',
        rationale: 'Tekanan jual institusi dan likuidasi mendominasi, harga terus tertekan ke bawah.'
      };
    }
  }

  /**
   * Helper: Membuat Chips Sektor Interaktif untuk Legenda Kuadran
   */
  function siRenderLegendSectorChips(items, selKey) {
    if (!items || items.length === 0) {
      return '<span style="font-size:10px;color:var(--text3);font-style:italic">Tidak ada sektor pada fase ini saat ini</span>';
    }
    return items.map(function(s) {
      var isSel = (s.key === selKey);
      var border = isSel ? 'border:1.5px solid var(--accent)' : 'border:1px solid var(--border2)';
      var bg = isSel ? 'var(--brand-soft)' : 'var(--bg3)';
      var retCol = s.retPct >= 0 ? '#10b981' : '#ef4444';
      return '<button type="button" onclick="siSelectSector(\'' + s.key + '\');siToggleMatrixLegend(false);" class="btn btn-ghost btn-xs" style="display:inline-flex;align-items:center;gap:4px;padding:2px 7px;font-size:10px;border-radius:4px;background:' + bg + ';' + border + ';color:var(--text)" title="Klik untuk filter berita sektor ' + s.name + '">' +
        '<span>' + s.icon + '</span> ' +
        '<strong>' + s.name + '</strong> ' +
        '<span style="font-family:var(--font-mono);font-size:9.5px;color:' + retCol + '">' + (s.retPct >= 0 ? '+' : '') + s.retPct.toFixed(1) + '%</span>' +
      '</button>';
    }).join('');
  }

  /**
   * Generator HTML untuk Overlay Legenda Lengkap 4 Kuadran
   */
  function siBuildQuadrantLegendOverlayHtml(quadBuckets, selKey) {
    var distSectors = siRenderLegendSectorChips(quadBuckets.distribution, selKey);
    var markupSectors = siRenderLegendSectorChips(quadBuckets.markup, selKey);
    var markdownSectors = siRenderLegendSectorChips(quadBuckets.markdown, selKey);
    var accSectors = siRenderLegendSectorChips(quadBuckets.accumulation, selKey);

    return '' +
      // Header Overlay
      '<div style="display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:10px;border-bottom:1px solid var(--border2);margin-bottom:10px;flex-shrink:0">' +
        '<div>' +
          '<div style="font-size:13.5px;font-weight:800;color:var(--text);display:flex;align-items:center;gap:6px">' +
            '<i class="ti ti-compass" style="color:var(--accent);font-size:17px"></i>' +
            '<span>Legenda &amp; Panduan 4 Kuadran Sectoral Cycle Matrix</span>' +
          '</div>' +
          '<div style="font-size:11px;color:var(--text3);margin-top:2px">' +
            'Model Siklus Wyckoff &amp; Chaikin Money Flow: Memetakan makna akumulasi, ekspansi markup, distribusi, dan markdown 11 sektor BEI.' +
          '</div>' +
        '</div>' +
        '<button type="button" class="btn btn-ghost btn-xs" onclick="siToggleMatrixLegend(false)" style="color:var(--text2);display:inline-flex;align-items:center;gap:4px;padding:3px 9px;border-radius:4px;border:1px solid var(--border2)" title="Tutup Legenda (Esc)">' +
          '<i class="ti ti-x"></i> <strong>Tutup</strong>' +
        '</button>' +
      '</div>' +

      // 2x2 Grid Kuadran (Sesuai Posisi Koordinat Chart X/Y)
      '<div class="si-matrix-legend-grid">' +

        // 1. TOP-LEFT: DISTRIBUTION (Kuadran II)
        '<div class="si-matrix-legend-card" style="background:rgba(245,158,11,0.06);border:1px solid rgba(245,158,11,0.35)">' +
          '<div>' +
            '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">' +
              '<div style="font-size:12px;font-weight:800;color:#f59e0b;display:flex;align-items:center;gap:5px">' +
                '<span>📤</span> <span>3. DISTRIBUTION (Distribusi Pucuk)</span>' +
              '</div>' +
              '<span class="badge" style="background:rgba(245,158,11,0.18);color:#f59e0b;border:1px solid rgba(245,158,11,0.45);font-size:9.5px;font-weight:700">Kuadran II · Kiri-Atas</span>' +
            '</div>' +
            '<div style="display:inline-block;padding:2px 7px;border-radius:4px;background:var(--bg3);border:1px solid var(--border2);font-family:var(--font-mono);font-size:10px;font-weight:700;color:#f59e0b;margin-bottom:6px">' +
              'CMF ≤ 0 (Outflow) · Return > 0% (Harga di Pucuk)' +
            '</div>' +
            '<div style="font-size:11px;color:var(--text);margin-bottom:5px;line-height:1.45">' +
              '<strong>Makna Siklus:</strong> Terjadi fenomena <em>Bearish Divergence</em>. Kinerja harga sektor masih tampak kuat di area pucuk, namun aliran dana institusional (smart money) sudah diam-diam keluar (outflow). Likuiditas ritel yang sedang FOMO dimanfaatkan institusi untuk melepas muatan secara bertahap tanpa menjatuhkan harga secara langsung (<em>churning</em>).' +
            '</div>' +
            '<div style="font-size:10.5px;color:var(--text2);margin-bottom:6px;line-height:1.4">' +
              '<strong>Ciri Khas:</strong> Volatilitas di pucuk tinggi, volume beli murni memudar, sering terjadi jebakan kenaikan semu (<em>upthrust / bull trap</em>).' +
            '</div>' +
            '<div style="background:rgba(245,158,11,0.12);border-left:3px solid #f59e0b;padding:5px 8px;border-radius:0 4px 4px 0;font-size:10.5px;color:var(--text);margin-bottom:6px">' +
              '<strong>Taktik &amp; Aksi:</strong> <strong>Take Profit Bertahap</strong> · Pasang Trailing Stop ketat · Hindari menambah posisi beli baru.' +
            '</div>' +
          '</div>' +
          '<div style="border-top:1px dashed var(--border2);padding-top:6px;margin-top:4px">' +
            '<div style="font-size:10px;color:var(--text3);margin-bottom:4px;font-weight:600">Sektor Terkini (' + quadBuckets.distribution.length + '):</div>' +
            '<div style="display:flex;flex-wrap:wrap;gap:4px">' + distSectors + '</div>' +
          '</div>' +
        '</div>' +

        // 2. TOP-RIGHT: MARKUP (Kuadran I)
        '<div class="si-matrix-legend-card" style="background:rgba(16,185,129,0.06);border:1px solid rgba(16,185,129,0.35)">' +
          '<div>' +
            '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">' +
              '<div style="font-size:12px;font-weight:800;color:#10b981;display:flex;align-items:center;gap:5px">' +
                '<span>🚀</span> <span>2. MARKUP (Ekspansi Bullish)</span>' +
              '</div>' +
              '<span class="badge" style="background:rgba(16,185,129,0.18);color:#10b981;border:1px solid rgba(16,185,129,0.45);font-size:9.5px;font-weight:700">Kuadran I · Kanan-Atas</span>' +
            '</div>' +
            '<div style="display:inline-block;padding:2px 7px;border-radius:4px;background:var(--bg3);border:1px solid var(--border2);font-family:var(--font-mono);font-size:10px;font-weight:700;color:#10b981;margin-bottom:6px">' +
              'CMF > 0 (Inflow Masuk) · Return > 0% (Reli Positif)' +
            '</div>' +
            '<div style="font-size:11px;color:var(--text);margin-bottom:5px;line-height:1.45">' +
              '<strong>Makna Siklus:</strong> Fase ekspansi tren naik (<em>Bullish Expansion</em>). Akumulasi institusi yang telah matang mendorong reli harga menembus resistensi (<em>breakout</em>). Minat beli institusi didukung partisipasi pasar luas. Kekuatan permintaan (<em>demand</em>) mendominasi total penawaran (<em>supply</em>).' +
            '</div>' +
            '<div style="font-size:10.5px;color:var(--text2);margin-bottom:6px;line-height:1.4">' +
              '<strong>Ciri Khas:</strong> Terbentuk struktur <em>higher highs</em> dan <em>higher lows</em>, kenaikan harga terkonfirmasi lonjakan volume (<em>volume expansion</em>).' +
            '</div>' +
            '<div style="background:rgba(16,185,129,0.12);border-left:3px solid #10b981;padding:5px 8px;border-radius:0 4px 4px 0;font-size:10.5px;color:var(--text);margin-bottom:6px">' +
              '<strong>Taktik &amp; Aksi:</strong> <strong>Trend Following</strong> · <strong>Ride the Winners</strong> · Akumulasi saat pullback ke support dinamis.' +
            '</div>' +
          '</div>' +
          '<div style="border-top:1px dashed var(--border2);padding-top:6px;margin-top:4px">' +
            '<div style="font-size:10px;color:var(--text3);margin-bottom:4px;font-weight:600">Sektor Terkini (' + quadBuckets.markup.length + '):</div>' +
            '<div style="display:flex;flex-wrap:wrap;gap:4px">' + markupSectors + '</div>' +
          '</div>' +
        '</div>' +

        // 3. BOTTOM-LEFT: MARKDOWN (Kuadran III)
        '<div class="si-matrix-legend-card" style="background:rgba(239,68,68,0.06);border:1px solid rgba(239,68,68,0.35)">' +
          '<div>' +
            '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">' +
              '<div style="font-size:12px;font-weight:800;color:#ef4444;display:flex;align-items:center;gap:5px">' +
                '<span>📉</span> <span>4. MARKDOWN (Penurunan Bearish)</span>' +
              '</div>' +
              '<span class="badge" style="background:rgba(239,68,68,0.18);color:#ef4444;border:1px solid rgba(239,68,68,0.45);font-size:9.5px;font-weight:700">Kuadran III · Kiri-Bawah</span>' +
            '</div>' +
            '<div style="display:inline-block;padding:2px 7px;border-radius:4px;background:var(--bg3);border:1px solid var(--border2);font-family:var(--font-mono);font-size:10px;font-weight:700;color:#ef4444;margin-bottom:6px">' +
              'CMF ≤ 0 (Outflow Berlanjut) · Return ≤ 0% (Downtrend)' +
            '</div>' +
            '<div style="font-size:11px;color:var(--text);margin-bottom:5px;line-height:1.45">' +
              '<strong>Makna Siklus:</strong> Fase tren turun terbuka (<em>Bearish Markdown</em>). Pasokan barang berlebih membanjiri bursa diiringi aksi likuidasi dan <em>cut loss</em> institusi. Tekanan jual mendominasi pasar secara mutlak, mendorong harga terus tergerus ke bawah.' +
            '</div>' +
            '<div style="font-size:10.5px;color:var(--text2);margin-bottom:6px;line-height:1.4">' +
              '<strong>Ciri Khas:</strong> Terbentuk struktur <em>lower lows</em> dan <em>lower highs</em>, pantulan harga bersifat sementara (<em>dead cat bounce</em>), minim minat beli institusi.' +
            '</div>' +
            '<div style="background:rgba(239,68,68,0.12);border-left:3px solid #ef4444;padding:5px 8px;border-radius:0 4px 4px 0;font-size:10.5px;color:var(--text);margin-bottom:6px">' +
              '<strong>Taktik &amp; Aksi:</strong> <strong>Capital Preservation</strong> · Amankan Cash Buffer RDN (15-20%) · Disiplin Stop Loss · Hindari menangkap pisau jatuh.' +
            '</div>' +
          '</div>' +
          '<div style="border-top:1px dashed var(--border2);padding-top:6px;margin-top:4px">' +
            '<div style="font-size:10px;color:var(--text3);margin-bottom:4px;font-weight:600">Sektor Terkini (' + quadBuckets.markdown.length + '):</div>' +
            '<div style="display:flex;flex-wrap:wrap;gap:4px">' + markdownSectors + '</div>' +
          '</div>' +
        '</div>' +

        // 4. BOTTOM-RIGHT: ACCUMULATION (Kuadran IV)
        '<div class="si-matrix-legend-card" style="background:rgba(6,182,212,0.06);border:1px solid rgba(6,182,212,0.35)">' +
          '<div>' +
            '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">' +
              '<div style="font-size:12px;font-weight:800;color:#06b6d4;display:flex;align-items:center;gap:5px">' +
                '<span>📥</span> <span>1. ACCUMULATION (Akumulasi Awal)</span>' +
              '</div>' +
              '<span class="badge" style="background:rgba(6,182,212,0.18);color:#06b6d4;border:1px solid rgba(6,182,212,0.45);font-size:9.5px;font-weight:700">Kuadran IV · Kanan-Bawah</span>' +
            '</div>' +
            '<div style="display:inline-block;padding:2px 7px;border-radius:4px;background:var(--bg3);border:1px solid var(--border2);font-family:var(--font-mono);font-size:10px;font-weight:700;color:#06b6d4;margin-bottom:6px">' +
              'CMF > 0 (Inflow Masuk) · Return ≤ 0% (Harga Terdiskon)' +
            '</div>' +
            '<div style="font-size:11px;color:var(--text);margin-bottom:5px;line-height:1.45">' +
              '<strong>Makna Siklus:</strong> Fase awal pembentukan siklus baru. Smart money dan institusi mulai menyerap likuiditas di harga dasar (<em>bottoming</em>) secara tenang saat publik masih pesimistis, sebelum harga merangkak naik (<em>markup</em>). Terjadi <strong>Bullish Divergence</strong> di mana modal institusi positif mendahului harga.' +
            '</div>' +
            '<div style="font-size:10.5px;color:var(--text2);margin-bottom:6px;line-height:1.4">' +
              '<strong>Ciri Khas:</strong> Harga mendatar (<em>sideways</em>) di support kuat, volume akumulasi senyap meningkat tanpa lonjakan harga agresif (<em>stealth buying</em>).' +
            '</div>' +
            '<div style="background:rgba(6,182,212,0.12);border-left:3px solid #06b6d4;padding:5px 8px;border-radius:0 4px 4px 0;font-size:10.5px;color:var(--text);margin-bottom:6px">' +
              '<strong>Taktik &amp; Aksi:</strong> <strong>Buy on Weakness</strong> · Cicil beli bertahap (DCA) · Manfaatkan Margin of Safety tinggi · Sabar menunggu fase ekspansi.' +
            '</div>' +
          '</div>' +
          '<div style="border-top:1px dashed var(--border2);padding-top:6px;margin-top:4px">' +
            '<div style="font-size:10px;color:var(--text3);margin-bottom:4px;font-weight:600">Sektor Terkini (' + quadBuckets.accumulation.length + '):</div>' +
            '<div style="display:flex;flex-wrap:wrap;gap:4px">' + accSectors + '</div>' +
          '</div>' +
        '</div>' +

      '</div>' +

      // Footer Overlay: Cyclical Breadcrumbs & Close Action
      '<div style="display:flex;justify-content:space-between;align-items:center;padding-top:8px;border-top:1px dashed var(--border2);flex-wrap:wrap;gap:8px;flex-shrink:0">' +
        '<div style="display:flex;align-items:center;gap:6px;font-size:11px;color:var(--text2);flex-wrap:wrap">' +
          '<strong style="color:var(--text)">Siklus Rotasi Alami:</strong>' +
          '<span style="color:#06b6d4;font-weight:700">📥 1. Akumulasi</span> ➔ ' +
          '<span style="color:#10b981;font-weight:700">🚀 2. Markup</span> ➔ ' +
          '<span style="color:#f59e0b;font-weight:700">📤 3. Distribusi</span> ➔ ' +
          '<span style="color:#ef4444;font-weight:700">📉 4. Markdown</span> ➔ ' +
          '<span style="color:var(--text3);font-style:italic">Rotasi Siklus Baru</span>' +
        '</div>' +
        '<button type="button" class="btn btn-primary btn-xs" onclick="siToggleMatrixLegend(false)" style="padding:4px 14px;font-weight:700">' +
          'Tutup &amp; Lihat Chart Matrix' +
        '</button>' +
      '</div>';
  }

  /**
   * Helper: Membuat Horizontal Summary Legend Strip yang Selalu Terlihat di Bawah Chart
   */
  function siBuildSummaryStripHtml(quadBuckets) {
    return '' +
      // 1. Akumulasi
      '<div class="si-matrix-strip-item" onclick="siToggleMatrixLegend(true)" style="background:rgba(6,182,212,0.07);border:1px solid rgba(6,182,212,0.35)" title="Klik untuk membuka penjelasan lengkap Akumulasi">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:2px">' +
          '<span style="font-size:11.5px;font-weight:800;color:#06b6d4">📥 1. Akumulasi</span>' +
          '<span class="badge" style="background:rgba(6,182,212,0.2);color:#06b6d4;font-size:9px;padding:1px 5px;font-weight:700">' + quadBuckets.accumulation.length + ' Sektor</span>' +
        '</div>' +
        '<div style="font-size:9.5px;font-family:var(--font-mono);color:#06b6d4;font-weight:700;margin-bottom:2px">CMF > 0 · Ret ≤ 0%</div>' +
        '<div style="font-size:10px;color:var(--text2);line-height:1.3">Smart money serap likuiditas di harga dasar sebelum fase markup.</div>' +
      '</div>' +

      // 2. Markup
      '<div class="si-matrix-strip-item" onclick="siToggleMatrixLegend(true)" style="background:rgba(16,185,129,0.07);border:1px solid rgba(16,185,129,0.35)" title="Klik untuk membuka penjelasan lengkap Markup">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:2px">' +
          '<span style="font-size:11.5px;font-weight:800;color:#10b981">🚀 2. Markup</span>' +
          '<span class="badge" style="background:rgba(16,185,129,0.2);color:#10b981;font-size:9px;padding:1px 5px;font-weight:700">' + quadBuckets.markup.length + ' Sektor</span>' +
        '</div>' +
        '<div style="font-size:9.5px;font-family:var(--font-mono);color:#10b981;font-weight:700;margin-bottom:2px">CMF > 0 · Ret > 0%</div>' +
        '<div style="font-size:10px;color:var(--text2);line-height:1.3">Reli ekspansi tren naik didukung arus modal institusional kuat.</div>' +
      '</div>' +

      // 3. Distribusi
      '<div class="si-matrix-strip-item" onclick="siToggleMatrixLegend(true)" style="background:rgba(245,158,11,0.07);border:1px solid rgba(245,158,11,0.35)" title="Klik untuk membuka penjelasan lengkap Distribusi">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:2px">' +
          '<span style="font-size:11.5px;font-weight:800;color:#f59e0b">📤 3. Distribusi</span>' +
          '<span class="badge" style="background:rgba(245,158,11,0.2);color:#f59e0b;font-size:9px;padding:1px 5px;font-weight:700">' + quadBuckets.distribution.length + ' Sektor</span>' +
        '</div>' +
        '<div style="font-size:9.5px;font-family:var(--font-mono);color:#f59e0b;font-weight:700;margin-bottom:2px">CMF ≤ 0 · Ret > 0%</div>' +
        '<div style="font-size:10px;color:var(--text2);line-height:1.3">Bearish divergence: harga di pucuk tapi modal institusi keluar (exit).</div>' +
      '</div>' +

      // 4. Markdown
      '<div class="si-matrix-strip-item" onclick="siToggleMatrixLegend(true)" style="background:rgba(239,68,68,0.07);border:1px solid rgba(239,68,68,0.35)" title="Klik untuk membuka penjelasan lengkap Markdown">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:2px">' +
          '<span style="font-size:11.5px;font-weight:800;color:#ef4444">📉 4. Markdown</span>' +
          '<span class="badge" style="background:rgba(239,68,68,0.2);color:#ef4444;font-size:9px;padding:1px 5px;font-weight:700">' + quadBuckets.markdown.length + ' Sektor</span>' +
        '</div>' +
        '<div style="font-size:9.5px;font-family:var(--font-mono);color:#ef4444;font-weight:700;margin-bottom:2px">CMF ≤ 0 · Ret ≤ 0%</div>' +
        '<div style="font-size:10px;color:var(--text2);line-height:1.3">Tekanan jual dominan dan downtrend berlanjut, utamakan defensif.</div>' +
      '</div>';
  }

  /**
   * Toggle Legenda 4 Kuadran Sectoral Cycle Matrix
   */
  window.siToggleMatrixLegend = function(forceState) {
    var overlay = document.getElementById('si-matrix-legend-overlay');
    if (!overlay) return;
    var isOpen = overlay.classList.contains('is-open');
    var shouldOpen = (typeof forceState === 'boolean') ? forceState : !isOpen;
    if (shouldOpen) {
      overlay.classList.add('is-open');
      _siState.showQuadrantLegend = true;
    } else {
      overlay.classList.remove('is-open');
      _siState.showQuadrantLegend = false;
    }
  };

  // Keyboard shortcut (Escape) untuk menutup legenda overlay
  if (!window._siMatrixLegendKeyBound) {
    window._siMatrixLegendKeyBound = true;
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') {
        var overlay = document.getElementById('si-matrix-legend-overlay');
        if (overlay && overlay.classList.contains('is-open')) {
          overlay.classList.remove('is-open');
          _siState.showQuadrantLegend = false;
        }
      }
    });
  }

  /**
   * Visualisasi Sectoral Cycle Matrix (Rotasi 4 Kuadran Siklus Pasar)
   * Berbasis Chaikin Money Flow (CMF) dan Performa Harga (% Return)
   */
  function siRenderQuadrantView(container) {
    var m = _siState.metrics;
    if (!container || !m || m.length === 0) {
      if (container) container.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text3)">Memuat data rotasi siklus sektoral...</div>';
      return;
    }

    var selKey = _siState.selectedSectorKey;

    // Klasifikasi seluruh sektor ke dalam 4 kuadran
    var quadBuckets = {
      accumulation: [],
      markup: [],
      distribution: [],
      markdown: []
    };

    m.forEach(function(sec) {
      var q = siClassifySectorQuadrant(sec);
      sec._quadrant = q;
      quadBuckets[q.id].push(sec);
    });

    container.innerHTML = '';

    // ── 1. Top Ribbon: Ringkasan 4 Fase Rotasi Siklus & Tombol Legenda ──
    var ribbonEl = document.createElement('div');
    ribbonEl.className = 'si-matrix-ribbon';
    ribbonEl.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:0 2px 10px 2px;margin-bottom:8px;border-bottom:1px dashed var(--border2);flex-wrap:wrap;gap:8px';

    var ribbonHtml = 
      '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">' +
        '<span style="font-size:11px;font-weight:700;color:var(--text);margin-right:2px">Distribusi Fase:</span>' +
        '<span style="display:inline-flex;align-items:center;gap:4px;font-size:10.5px;padding:2px 8px;border-radius:4px;background:rgba(6,182,212,0.12);border:1px solid rgba(6,182,212,0.3);color:#06b6d4">' +
          '📥 <strong>Akumulasi</strong>: ' + quadBuckets.accumulation.length +
        '</span>' +
        '<span style="display:inline-flex;align-items:center;gap:4px;font-size:10.5px;padding:2px 8px;border-radius:4px;background:rgba(16,185,129,0.12);border:1px solid rgba(16,185,129,0.3);color:#10b981">' +
          '🚀 <strong>Markup</strong>: ' + quadBuckets.markup.length +
        '</span>' +
        '<span style="display:inline-flex;align-items:center;gap:4px;font-size:10.5px;padding:2px 8px;border-radius:4px;background:rgba(245,158,11,0.12);border:1px solid rgba(245,158,11,0.3);color:#f59e0b">' +
          '📤 <strong>Distribusi</strong>: ' + quadBuckets.distribution.length +
        '</span>' +
        '<span style="display:inline-flex;align-items:center;gap:4px;font-size:10.5px;padding:2px 8px;border-radius:4px;background:rgba(239,68,68,0.12);border:1px solid rgba(239,68,68,0.3);color:#ef4444">' +
          '📉 <strong>Markdown</strong>: ' + quadBuckets.markdown.length +
        '</span>' +
      '</div>' +
      '<div style="display:flex;align-items:center;gap:6px">' +
        '<button id="si-ribbon-legend-btn" type="button" class="btn btn-ghost btn-xs" onclick="siToggleMatrixLegend()" style="display:inline-flex;align-items:center;gap:4px;padding:2px 8px;font-size:10.5px;color:var(--accent);border:1px solid rgba(59,130,246,0.3);background:rgba(59,130,246,0.08);border-radius:4px" title="Buka penjelasan 4 kuadran siklus pasar (Akumulasi, Markup, Distribusi, Markdown)">' +
          '<i class="ti ti-compass"></i> <strong>Legenda Kuadran</strong>' +
        '</button>' +
        (selKey ? '<span class="badge b-accent" style="font-size:9.5px;padding:1px 6px">Filter Aktif</span><button onclick="siClearSectorFilter()" class="btn btn-ghost btn-xs" style="padding:1px 6px;font-size:10px;color:var(--text2)">Reset</button>' : '<span style="font-size:10.5px;color:var(--text3);font-style:italic">Klik node untuk menyaring berita</span>') +
      '</div>';
    ribbonEl.innerHTML = ribbonHtml;
    container.appendChild(ribbonEl);

    // ── 2. D3.js 2D Scatter Matrix Graph & Legend Overlay Container ──
    var chartWrapper = document.createElement('div');
    chartWrapper.id = 'si-matrix-chart-wrapper';
    chartWrapper.style.cssText = 'position:relative;width:100%;height:385px;user-select:none;margin-bottom:12px';
    container.appendChild(chartWrapper);

    // Floating Trigger Button pada Pojok Atas-Kanan Chart
    var triggerBtn = document.createElement('button');
    triggerBtn.className = 'si-matrix-legend-trigger-btn';
    triggerBtn.setAttribute('type', 'button');
    triggerBtn.onclick = function() { window.siToggleMatrixLegend(true); };
    triggerBtn.title = 'Buka penjelasan lengkap 4 kuadran siklus pasar (Akumulasi, Markup, Distribusi, Markdown)';
    triggerBtn.innerHTML = '<i class="ti ti-compass"></i> <span>Legenda Kuadran</span>';
    chartWrapper.appendChild(triggerBtn);

    // Clear Legend Overlay Element di Atas Chart
    var overlayEl = document.createElement('div');
    overlayEl.id = 'si-matrix-legend-overlay';
    overlayEl.className = 'si-matrix-legend-overlay' + (_siState.showQuadrantLegend ? ' is-open' : '');
    overlayEl.innerHTML = siBuildQuadrantLegendOverlayHtml(quadBuckets, selKey);
    chartWrapper.appendChild(overlayEl);

    if (window.d3) {
      var width = chartWrapper.clientWidth || container.clientWidth || 520;
      var height = 385;

      var isMobile = width < 480;
      var margin = {
        top: 26,
        right: isMobile ? 22 : 36,
        bottom: 34,
        left: isMobile ? 38 : 50
      };

      var innerW = Math.max(160, width - margin.left - margin.right);
      var innerH = Math.max(160, height - margin.top - margin.bottom);

      var svg = d3.select(chartWrapper)
        .append('svg')
        .attr('id', 'si-matrix-svg')
        .attr('width', '100%')
        .attr('height', height)
        .attr('viewBox', '0 0 ' + width + ' ' + height)
        .style('display', 'block');

      // Shared Tooltip
      var tooltip = d3.select('body').select('#si-d3-tooltip');
      if (tooltip.empty()) {
        tooltip = d3.select('body').append('div')
          .attr('id', 'si-d3-tooltip')
          .style('position', 'fixed')
          .style('z-index', '99999')
          .style('display', 'none')
          .style('pointer-events', 'none')
          .style('background', 'var(--bg2, #181826)')
          .style('border', '1px solid var(--border, #2d2d42)')
          .style('box-shadow', '0 8px 24px rgba(0,0,0,0.5)')
          .style('border-radius', '8px')
          .style('padding', '10px 12px')
          .style('font-size', '11.5px')
          .style('color', 'var(--text, #f8fafc)')
          .style('line-height', '1.4');
      }

      // Hitung Skala Dinamis Simetris (X = CMF, Y = Return %)
      var maxAbsCmf = d3.max(m, function(d) { return Math.abs(d.cmf); }) || 0.20;
      var domainCmf = Math.max(0.24, Math.ceil(maxAbsCmf * 1.25 * 20) / 20);

      var maxAbsRet = d3.max(m, function(d) { return Math.abs(d.retPct); }) || 3.0;
      var domainRet = Math.max(3.5, Math.ceil(maxAbsRet * 1.2));

      var xScale = d3.scaleLinear()
        .domain([-domainCmf, domainCmf])
        .range([0, innerW]);

      var yScale = d3.scaleLinear()
        .domain([-domainRet, domainRet])
        .range([innerH, 0]); // Y naik ke atas

      var g = svg.append('g')
        .attr('transform', 'translate(' + margin.left + ',' + margin.top + ')');

      var x0 = xScale(0);
      var y0 = yScale(0);

      // Defs untuk filter bayangan & gradien
      var defs = svg.append('defs');
      var filterGlow = defs.append('filter')
        .attr('id', 'si-glow')
        .attr('x', '-30%').attr('y', '-30%')
        .attr('width', '160%').attr('height', '160%');
      filterGlow.append('feGaussianBlur')
        .attr('stdDeviation', '3')
        .attr('result', 'blur');
      filterGlow.append('feComposite')
        .attr('in', 'SourceGraphic')
        .attr('in2', 'blur')
        .attr('operator', 'over');

      // ── 4 Background Quadrant Regions ──
      // 1. Top-Right: MARKUP (CMF > 0, Return > 0)
      g.append('rect')
        .attr('x', x0)
        .attr('y', 0)
        .attr('width', Math.max(0, innerW - x0))
        .attr('height', Math.max(0, y0))
        .attr('fill', '#10b981')
        .attr('opacity', 0.05);

      // 2. Bottom-Right: ACCUMULATION (CMF > 0, Return <= 0)
      g.append('rect')
        .attr('x', x0)
        .attr('y', y0)
        .attr('width', Math.max(0, innerW - x0))
        .attr('height', Math.max(0, innerH - y0))
        .attr('fill', '#06b6d4')
        .attr('opacity', 0.05);

      // 3. Top-Left: DISTRIBUTION (CMF <= 0, Return > 0)
      g.append('rect')
        .attr('x', 0)
        .attr('y', 0)
        .attr('width', Math.max(0, x0))
        .attr('height', Math.max(0, y0))
        .attr('fill', '#f59e0b')
        .attr('opacity', 0.05);

      // 4. Bottom-Left: MARKDOWN (CMF <= 0, Return <= 0)
      g.append('rect')
        .attr('x', 0)
        .attr('y', y0)
        .attr('width', Math.max(0, x0))
        .attr('height', Math.max(0, innerH - y0))
        .attr('fill', '#ef4444')
        .attr('opacity', 0.05);

      // Garis Kisi Bantu Pembagi Kuadran (Gridlines)
      g.append('line')
        .attr('x1', 0).attr('x2', innerW)
        .attr('y1', y0).attr('y2', y0)
        .attr('stroke', 'var(--border, #475569)')
        .attr('stroke-width', 1.5)
        .attr('opacity', 0.85);

      g.append('line')
        .attr('x1', x0).attr('x2', x0)
        .attr('y1', 0).attr('y2', innerH)
        .attr('stroke', 'var(--border, #475569)')
        .attr('stroke-width', 1.5)
        .attr('opacity', 0.85);

      // Titik Pusat Origin (0,0)
      g.append('circle')
        .attr('cx', x0)
        .attr('cy', y0)
        .attr('r', 3)
        .attr('fill', 'var(--text3, #94a3b8)')
        .attr('opacity', 0.8);

      // Label Header & Judul Kuadran di Tiap Sudut
      var quadLabels = [
        {
          x: innerW - 8,
          y: 14,
          anchor: 'end',
          title: '🚀 2. MARKUP',
          sub: 'CMF+ · Return+',
          color: '#10b981'
        },
        {
          x: innerW - 8,
          y: innerH - 12,
          anchor: 'end',
          title: '📥 1. ACCUMULATION',
          sub: 'CMF+ · Return-',
          color: '#06b6d4'
        },
        {
          x: 8,
          y: 14,
          anchor: 'start',
          title: '📤 3. DISTRIBUTION',
          sub: 'CMF- · Return+',
          color: '#f59e0b'
        },
        {
          x: 8,
          y: innerH - 12,
          anchor: 'start',
          title: '📉 4. MARKDOWN',
          sub: 'CMF- · Return-',
          color: '#ef4444'
        }
      ];

      quadLabels.forEach(function(ql) {
        var lblG = g.append('g')
          .attr('opacity', 0.88)
          .style('cursor', 'pointer')
          .attr('title', 'Klik untuk membuka penjelasan lengkap kuadran ' + ql.title);

        lblG.on('click', function(event) {
          if (event) event.stopPropagation();
          if (typeof window.siToggleMatrixLegend === 'function') {
            window.siToggleMatrixLegend(true);
          }
        });

        lblG.on('mouseenter', function() {
          lblG.transition().duration(120).attr('opacity', 1);
        }).on('mouseleave', function() {
          lblG.transition().duration(120).attr('opacity', 0.88);
        });

        lblG.append('text')
          .attr('x', ql.x)
          .attr('y', ql.y)
          .attr('text-anchor', ql.anchor)
          .attr('fill', ql.color)
          .attr('font-size', isMobile ? '9.5px' : '11px')
          .attr('font-weight', '700')
          .attr('letter-spacing', '0.4px')
          .text(ql.title);

        lblG.append('text')
          .attr('x', ql.x)
          .attr('y', ql.y + 11)
          .attr('text-anchor', ql.anchor)
          .attr('fill', 'var(--text3, #94a3b8)')
          .attr('font-size', '8.5px')
          .attr('font-family', 'var(--font-mono, monospace)')
          .text(ql.sub);
      });

      // Indikator Siklus Rotasi (Clockwise Cycle Rotation Arrow Cue)
      var cycleRadius = Math.min(innerW, innerH) * 0.42;
      var arcGenerator = d3.arc()
        .innerRadius(cycleRadius - 1)
        .outerRadius(cycleRadius)
        .startAngle(0.35)
        .endAngle(1.45);

      g.append('path')
        .attr('transform', 'translate(' + x0 + ',' + y0 + ')')
        .attr('d', arcGenerator)
        .attr('fill', 'var(--text3)')
        .attr('opacity', 0.15)
        .attr('stroke-dasharray', '3,3');

      // X Axis (CMF)
      var xAxis = d3.axisBottom(xScale)
        .ticks(Math.min(6, Math.floor(innerW / 70)))
        .tickFormat(function(d) {
          if (d === 0) return '0.00';
          return (d > 0 ? '+' : '') + d.toFixed(2);
        });

      var xAxisG = g.append('g')
        .attr('transform', 'translate(0,' + innerH + ')')
        .call(xAxis);

      xAxisG.select('.domain').attr('stroke', 'var(--border2, #334155)');
      xAxisG.selectAll('.tick line').attr('stroke', 'var(--border2, #334155)').attr('stroke-dasharray', '2,2');
      xAxisG.selectAll('.tick text')
        .attr('fill', 'var(--text3, #94a3b8)')
        .attr('font-size', '9.5px')
        .attr('font-family', 'var(--font-mono, monospace)');

      // Label X-Axis
      g.append('text')
        .attr('x', innerW)
        .attr('y', innerH + 24)
        .attr('text-anchor', 'end')
        .attr('fill', 'var(--text3, #94a3b8)')
        .attr('font-size', '9.5px')
        .text('Arus Modal Institusional (CMF) ▶');

      // Y Axis (Return %)
      var yAxis = d3.axisLeft(yScale)
        .ticks(Math.min(6, Math.floor(innerH / 45)))
        .tickFormat(function(d) {
          if (d === 0) return '0%';
          return (d > 0 ? '+' : '') + d.toFixed(1) + '%';
        });

      var yAxisG = g.append('g')
        .call(yAxis);

      yAxisG.select('.domain').attr('stroke', 'var(--border2, #334155)');
      yAxisG.selectAll('.tick line').attr('stroke', 'var(--border2, #334155)').attr('stroke-dasharray', '2,2');
      yAxisG.selectAll('.tick text')
        .attr('fill', 'var(--text3, #94a3b8)')
        .attr('font-size', '9.5px')
        .attr('font-family', 'var(--font-mono, monospace)');

      // Label Y-Axis
      g.append('text')
        .attr('transform', 'rotate(-90)')
        .attr('x', 0)
        .attr('y', -34)
        .attr('text-anchor', 'end')
        .attr('fill', 'var(--text3, #94a3b8)')
        .attr('font-size', '9.5px')
        .text('Performa Harga (% Return) ▶');

      // ── Plotting Sector Nodes (Bubbles) ──
      var nodes = g.selectAll('.si-matrix-node')
        .data(m)
        .enter()
        .append('g')
        .attr('class', function(d) {
          var isSel = (selKey === d.key);
          return 'si-matrix-node' + (isSel ? ' is-selected' : '');
        })
        .attr('transform', function(d) {
          return 'translate(' + xScale(d.cmf) + ',' + yScale(d.retPct) + ')';
        })
        .style('cursor', 'pointer')
        .attr('opacity', function(d) {
          return (selKey !== null && selKey !== d.key) ? 0.35 : 1;
        });

      // Halo Lingkaran untuk Sektor yang Sedang Terpilih
      nodes.append('circle')
        .attr('class', 'si-node-halo')
        .attr('r', 20)
        .attr('fill', 'none')
        .attr('stroke', function(d) { return d._quadrant.color; })
        .attr('stroke-width', 2)
        .attr('stroke-dasharray', '3,3')
        .attr('opacity', function(d) { return (selKey === d.key) ? 1 : 0; });

      // Lingkaran Node Utama
      nodes.append('circle')
        .attr('class', 'si-node-circle')
        .attr('r', function(d) { return (selKey === d.key) ? 15 : 13; })
        .attr('fill', function(d) { return d._quadrant.color; })
        .attr('stroke', '#ffffff')
        .attr('stroke-width', function(d) { return (selKey === d.key) ? 2.5 : 1.5; })
        .attr('opacity', 0.95);

      // Ikon di Tengah Lingkaran Node
      nodes.append('text')
        .attr('class', 'si-node-icon')
        .attr('text-anchor', 'middle')
        .attr('dominant-baseline', 'central')
        .attr('font-size', '11px')
        .text(function(d) { return d.icon; });

      // Label Teks Singkat Nama Sektor di Sebelah Node
      nodes.append('text')
        .attr('class', 'si-node-label')
        .attr('x', function(d) { return (d.cmf >= 0) ? 17 : -17; })
        .attr('y', 4)
        .attr('text-anchor', function(d) { return (d.cmf >= 0) ? 'start' : 'end'; })
        .attr('fill', 'var(--text, #f8fafc)')
        .attr('font-size', '10px')
        .attr('font-weight', function(d) { return (selKey === d.key) ? '800' : '600'; })
        .text(function(d) { return d.name; });

      // Interaksi Hover & Click pada Node
      nodes
        .on('mouseenter', function(event, d) {
          // Dimming Sibling
          nodes.filter(function(n) { return n.key !== d.key; })
            .transition()
            .duration(160)
            .attr('opacity', 0.22);

          // Sorot Node Aktif
          d3.select(this)
            .transition()
            .duration(160)
            .attr('opacity', 1);

          d3.select(this).select('.si-node-circle')
            .transition()
            .duration(160)
            .attr('r', 17)
            .attr('stroke-width', 2.5);

          d3.select(this).select('.si-node-label')
            .transition()
            .duration(160)
            .attr('font-size', '11px')
            .attr('font-weight', '800')
            .attr('fill', d._quadrant.color);

          var q = d._quadrant;
          var cmfSign = d.cmf >= 0 ? '+' : '';
          var retSign = d.retPct >= 0 ? '+' : '';
          var retColor = d.retPct >= 0 ? '#10b981' : '#ef4444';
          var cmfColor = d.cmf >= 0 ? '#10b981' : '#ef4444';

          var moversHtml = '';
          if (Array.isArray(d.constituentStats)) {
            moversHtml = d.constituentStats.slice(0, 3).map(function(st) {
              var r = (st.retPct >= 0 ? '+' : '') + st.retPct.toFixed(1) + '%';
              var c = st.retPct >= 0 ? '#10b981' : '#ef4444';
              return '<span style="font-family:var(--font-mono);font-size:10px;padding:1px 5px;background:var(--bg3);border:1px solid var(--border);border-radius:3px;margin-right:4px">' +
                st.ticker + ' <span style="color:' + c + '">' + r + '</span>' +
              '</span>';
            }).join('');
          }

          var ttHtml = 
            '<div style="font-weight:700;font-size:13px;display:flex;align-items:center;gap:6px;margin-bottom:4px">' +
              '<span>' + d.icon + ' ' + d.name + '</span>' +
              '<span style="font-size:10px;color:var(--text3)">(' + d.labelId + ')</span>' +
            '</div>' +
            '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">' +
              '<span class="badge" style="background:' + q.bgTint + ';border:1px solid ' + q.color + ';color:' + q.color + ';font-size:10px;font-weight:700">' + q.titleId + '</span>' +
              '<span style="font-family:var(--font-mono);font-size:11px;font-weight:700;color:' + cmfColor + '">CMF: ' + cmfSign + d.cmf.toFixed(2) + '</span>' +
              '<span style="font-family:var(--font-mono);font-size:11px;color:' + retColor + '">Ret: ' + retSign + d.retPct.toFixed(2) + '%</span>' +
            '</div>' +
            '<div style="background:var(--bg3);border:1px solid var(--border2);border-radius:6px;padding:6px 8px;margin-bottom:8px;font-size:10.5px;color:var(--text2);line-height:1.4">' +
              '<strong style="color:var(--text)">Strategi:</strong> ' + q.tactic + '<br>' +
              '<span style="font-size:9.5px;color:var(--text3)">' + q.rationale + '</span>' +
            '</div>' +
            '<div style="font-size:10.5px;color:var(--text3);margin-bottom:6px">' +
              'Saham Penggerak: ' + (moversHtml || '-') +
            '</div>' +
            '<div style="font-size:9.5px;color:var(--accent);border-top:1px dashed var(--border2);padding-top:4px;display:flex;align-items:center;gap:4px">' +
              '<span>💡</span> <span>' + (selKey === d.key ? 'Sektor sedang aktif difilter. Klik untuk melepas filter.' : 'Klik node untuk memfilter berita sektor ' + d.name) + '</span>' +
            '</div>';

          tooltip
            .html(ttHtml)
            .style('display', 'block')
            .style('opacity', '1')
            .style('left', (event.pageX + 14) + 'px')
            .style('top', (event.pageY - 12) + 'px');
        })
        .on('mousemove', function(event) {
          tooltip
            .style('left', (event.pageX + 14) + 'px')
            .style('top', (event.pageY - 12) + 'px');
        })
        .on('mouseleave', function() {
          // Kembalikan semua node
          nodes
            .transition()
            .duration(200)
            .attr('opacity', function(d) {
              return (selKey !== null && selKey !== d.key) ? 0.35 : 1;
            });

          d3.select(this).select('.si-node-circle')
            .transition()
            .duration(200)
            .attr('r', function(d) { return (selKey === d.key) ? 15 : 13; })
            .attr('stroke-width', function(d) { return (selKey === d.key) ? 2.5 : 1.5; });

          d3.select(this).select('.si-node-label')
            .transition()
            .duration(200)
            .attr('font-size', '10px')
            .attr('font-weight', function(d) { return (selKey === d.key) ? '800' : '600'; })
            .attr('fill', 'var(--text, #f8fafc)');

          tooltip
            .style('opacity', '0')
            .style('transform', 'translateY(4px)');

          setTimeout(function() {
            if (tooltip.style('opacity') === '0') {
              tooltip.style('display', 'none');
            }
          }, 160);
        })
        .on('click', function(event, d) {
          event.stopPropagation();

          var clickedNode = d3.select(this);
          clickedNode.select('.si-node-circle')
            .transition()
            .duration(90)
            .attr('r', 18)
            .transition()
            .duration(120)
            .attr('r', 15);

          tooltip.style('display', 'none');
          siSelectSector(d.key);
        });

      // ResizeObserver untuk responsivitas visual otomatis
      if (_siResizeObserver) {
        try { _siResizeObserver.disconnect(); } catch (e) {}
      }

      var resizeTimer = null;
      _siResizeObserver = new ResizeObserver(function(entries) {
        if (!entries || entries.length === 0) return;
        var newW = entries[0].contentRect.width;
        if (Math.abs(newW - width) > 15) {
          clearTimeout(resizeTimer);
          resizeTimer = setTimeout(function() {
            if (_siState.viewMode === 'quadrant') {
              siRenderQuadrantView(container);
            }
          }, 150);
        }
      });
      _siResizeObserver.observe(container);
    }

    // ── 3. Horizontal Summary Legend Strip (Penjelasan Cepat 4 Kuadran) ──
    var summaryStrip = document.createElement('div');
    summaryStrip.className = 'si-matrix-summary-strip';
    summaryStrip.innerHTML = siBuildSummaryStripHtml(quadBuckets);
    container.appendChild(summaryStrip);

    // ── 4. Tactical 4-Quadrant Cards Grid (Rincian Sektor & Taktik) ──
    var cardsGrid = document.createElement('div');
    cardsGrid.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:12px';

    function renderQuadCard(quadMeta, items) {
      var isHighlighted = items.some(function(it) { return it.key === selKey; });
      var cardBorder = isHighlighted ? ('border:1.5px solid ' + quadMeta.color) : ('border:1px solid ' + quadMeta.borderClr);
      var cardBg = isHighlighted ? 'background:var(--bg2)' : 'background:var(--bg2)';

      var cardHtml = 
        '<div class="si-matrix-quad-card" style="' + cardBg + ';' + cardBorder + ';border-radius:8px;padding:12px;display:flex;flex-direction:column;min-height:165px">' +
          '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px;border-bottom:1px solid var(--border2);padding-bottom:8px">' +
            '<div>' +
              '<div style="font-size:12px;font-weight:700;color:' + quadMeta.color + ';display:flex;align-items:center;gap:5px">' +
                '<span>' + quadMeta.icon + '</span> <span>' + quadMeta.titleId + '</span>' +
              '</div>' +
              '<div style="font-size:10px;color:var(--text3);margin-top:2px">' + quadMeta.subId + '</div>' +
            '</div>' +
            '<span class="badge" style="background:' + quadMeta.bgTint + ';border:1px solid ' + quadMeta.color + ';color:' + quadMeta.color + ';font-size:10px;font-weight:700">' +
              items.length + ' Sektor' +
            '</span>' +
          '</div>' +

          // Tactical guidance note
          '<div style="font-size:10px;color:var(--text2);background:var(--bg3);border-radius:5px;padding:5px 8px;margin-bottom:8px;line-height:1.4">' +
            '<strong style="color:var(--text)">Taktik:</strong> ' + quadMeta.tactic +
          '</div>' +

          // List of sectors
          '<div style="display:flex;flex-direction:column;gap:5px;flex:1">';

      if (items.length === 0) {
        cardHtml += '<div style="font-size:11px;color:var(--text3);text-align:center;margin:auto;padding:12px 0">Tidak ada sektor pada fase ini</div>';
      } else {
        items.forEach(function(sec) {
          var isSel = (selKey === sec.key);
          var chipBg = isSel ? 'var(--brand-soft)' : 'var(--bg3)';
          var chipBorder = isSel ? ('border:1px solid ' + quadMeta.color) : 'border:1px solid var(--border2)';

          var moverPreview = '';
          if (Array.isArray(sec.constituentStats) && sec.constituentStats.length > 0) {
            moverPreview = sec.constituentStats.slice(0, 2).map(function(s) {
              var r = (s.retPct >= 0 ? '+' : '') + s.retPct.toFixed(1) + '%';
              var c = s.retPct >= 0 ? '#10b981' : '#ef4444';
              return s.ticker + ' <span style="color:' + c + '">' + r + '</span>';
            }).join(' · ');
          }

          cardHtml += 
            '<div class="si-matrix-sector-chip" onclick="siSelectSector(\'' + sec.key + '\')" style="display:flex;flex-direction:column;gap:3px;padding:6px 8px;border-radius:5px;background:' + chipBg + ';' + chipBorder + ';cursor:pointer" title="Klik untuk memfilter berita sektor ' + sec.name + '">' +
              '<div style="display:flex;justify-content:space-between;align-items:center">' +
                '<div style="display:flex;align-items:center;gap:6px">' +
                  '<span style="font-size:12px">' + sec.icon + '</span>' +
                  '<span style="font-size:11px;font-weight:600;color:' + (isSel ? quadMeta.color : 'var(--text)') + '">' + sec.name + '</span>' +
                  (isSel ? '<span class="badge b-accent" style="font-size:8.5px;padding:0 4px">AKTIF</span>' : '') +
                '</div>' +
                '<div style="display:flex;align-items:center;gap:6px">' +
                  '<span style="font-size:10px;font-family:var(--font-mono);color:' + (sec.retPct >= 0 ? '#10b981' : '#ef4444') + '">' +
                    (sec.retPct >= 0 ? '+' : '') + sec.retPct.toFixed(1) + '%' +
                  '</span>' +
                  '<span style="font-size:10px;font-family:var(--font-mono);font-weight:700;color:' + (sec.cmf >= 0 ? '#10b981' : '#ef4444') + '">' +
                    'CMF ' + (sec.cmf >= 0 ? '+' : '') + sec.cmf.toFixed(2) +
                  '</span>' +
                '</div>' +
              '</div>' +
              (moverPreview ? '<div style="font-size:9px;color:var(--text3);padding-left:18px">Penggerak: ' + moverPreview + '</div>' : '') +
            '</div>';
        });
      }

      cardHtml += '</div></div>';
      return cardHtml;
    }

    var qMarkup = siClassifySectorQuadrant({ cmf: 0.1, retPct: 1 });
    var qAcc = siClassifySectorQuadrant({ cmf: 0.1, retPct: -1 });
    var qDist = siClassifySectorQuadrant({ cmf: -0.1, retPct: 1 });
    var qMark = siClassifySectorQuadrant({ cmf: -0.1, retPct: -1 });

    cardsGrid.innerHTML = 
      renderQuadCard(qDist, quadBuckets.distribution) +
      renderQuadCard(qMarkup, quadBuckets.markup) +
      renderQuadCard(qMark, quadBuckets.markdown) +
      renderQuadCard(qAcc, quadBuckets.accumulation);

    container.appendChild(cardsGrid);
  }

  /**
   * Render Panel Berita Terkoneksi (Kolom Kanan)
   */
  function siRenderNewsPanel() {
    var container = document.getElementById('si-news-list');
    var filterBadge = document.getElementById('si-active-sector-filter');
    if (!container) return;

    var selKey = _siState.selectedSectorKey;
    var allNews = _siState.newsData || [];

    // Filter berita jika ada sektor terpilih
    var displayNews = allNews;
    var activeSectorObj = null;

    if (selKey && _siState.metrics) {
      activeSectorObj = _siState.metrics.find(function(s) { return s.key === selKey; });
      if (activeSectorObj) {
        displayNews = allNews.filter(function(item) {
          var s1 = String(item.sector || '').toLowerCase();
          var s2 = String(item.sectorName || '').toLowerCase();
          var target1 = activeSectorObj.name.toLowerCase();
          var target2 = activeSectorObj.labelId.toLowerCase();

          // Cek kesamaan sektor atau ada irisan ticker
          var hasSectorMatch = s1.includes(target1) || s2.includes(target2) || target1.includes(s1);
          var hasTickerMatch = Array.isArray(item.tickers) && item.tickers.some(function(tk) {
            return activeSectorObj.constituents.includes(tk);
          });

          return hasSectorMatch || hasTickerMatch;
        });
      }
    }

    // Perbarui label filter aktif
    if (filterBadge) {
      if (activeSectorObj) {
        filterBadge.innerHTML = 
          '<div style="display:flex;align-items:center;gap:8px;padding:6px 10px;background:var(--brand-soft);border:1px solid var(--accent);border-radius:6px;font-size:11px">' +
            '<span>Filter Aktif: <strong>' + activeSectorObj.icon + ' ' + activeSectorObj.name + ' (' + activeSectorObj.labelId + ')</strong></span>' +
            '<button onclick="siClearSectorFilter()" class="btn btn-ghost btn-xs" style="padding:1px 6px;margin-left:auto;border-color:var(--border);color:var(--text2)">Tampilkan Semua</button>' +
          '</div>';
      } else {
        filterBadge.innerHTML = 
          '<div style="font-size:11px;color:var(--text3)">Menampilkan berita seluruh 11 sektor IDX. Klik salah satu sektor di kolom kiri untuk menyaring berita.</div>';
      }
    }

    if (displayNews.length === 0) {
      var isGenuinelyEmpty = allNews.length === 0;
      var emptyMsg = (isGenuinelyEmpty && _siState.newsError)
        ? _siState.newsError
        : 'Belum ada berita spesifik untuk sektor ini dalam periode berjalan.';
      var emptyBtn = isGenuinelyEmpty
        ? '<button onclick="siRefreshAll()" class="btn btn-ghost btn-xs" style="margin-top:8px">🔄 Coba Lagi</button>'
        : '<button onclick="siClearSectorFilter()" class="btn btn-ghost btn-xs" style="margin-top:8px">Lihat Semua Berita</button>';
      container.innerHTML = '<div style="padding:24px;text-align:center;color:var(--text3);font-size:12px">' +
        '<i class="ti ti-news-off" style="font-size:24px;display:block;margin-bottom:6px"></i>' +
        emptyMsg + '<br>' +
        emptyBtn +
      '</div>';
      return;
    }

    var html = '<div style="display:flex;flex-direction:column;gap:10px">';

    displayNews.forEach(function(item) {
      var impactColor = item.impact === 'BULLISH' ? '#10b981' : (item.impact === 'BEARISH' ? '#ef4444' : '#f59e0b');
      var impactBg = item.impact === 'BULLISH' ? 'rgba(16,185,129,0.12)' : (item.impact === 'BEARISH' ? 'rgba(239,68,68,0.12)' : 'rgba(245,158,11,0.12)');

      var tickerChips = '';
      if (Array.isArray(item.tickers) && item.tickers.length > 0) {
        tickerChips = item.tickers.map(function(tk) {
          return '<span onclick="siInspectTicker(\'' + tk + '\')" class="badge" style="cursor:pointer;background:var(--bg3);border:1px solid var(--border);color:var(--text);font-family:var(--font-mono);font-size:10px;padding:2px 6px" title="Buka analisis saham ' + tk + '">' +
            tk + ' ↗' +
          '</span>';
        }).join(' ');
      }

      html += '<div style="background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:12px;display:flex;flex-direction:column;gap:6px">' +
        '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px">' +
          '<div style="font-size:10.5px;color:var(--text3);display:flex;align-items:center;gap:6px">' +
            '<span style="font-weight:700;color:var(--accent)">' + (item.source || 'Media Finansial') + '</span>' +
            '<span>·</span>' +
            '<span>' + (item.time || 'Terkini') + '</span>' +
            '<span>·</span>' +
            '<span style="color:var(--text2)">' + (item.category || item.sectorName || 'Sektoral') + '</span>' +
          '</div>' +
          '<span class="badge" style="background:' + impactBg + ';border:1px solid ' + impactColor + ';color:' + impactColor + ';font-size:9.5px;font-weight:700;padding:1px 6px">' +
            (item.impact || 'NEUTRAL') +
          '</span>' +
        '</div>' +

        '<div style="font-size:13px;font-weight:700;color:var(--text);line-height:1.4">' +
          '<a href="' + (item.url || '#') + '" target="_blank" rel="noopener noreferrer" style="color:inherit;text-decoration:none" onmouseover="this.style.color=\'var(--accent)\'" onmouseout="this.style.color=\'inherit\'">' +
            item.title +
          '</a>' +
        '</div>' +

        '<div style="font-size:11.5px;color:var(--text2);line-height:1.5">' +
          item.summary +
        '</div>' +

        '<div style="display:flex;justify-content:space-between;align-items:center;margin-top:4px;padding-top:6px;border-top:1px dashed var(--border2)">' +
          '<div style="display:flex;align-items:center;gap:5px;flex-wrap:wrap">' +
            '<span style="font-size:10px;color:var(--text3)">Emiten:</span>' +
            tickerChips +
          '</div>' +
          (item.impactReason ? '<span style="font-size:10px;color:var(--text3);font-style:italic">' + item.impactReason + '</span>' : '') +
        '</div>' +
      '</div>';
    });

    html += '</div>';
    container.innerHTML = html;
  }

  /**
   * Render Tabel Rincian 11 Sektor IDX
   */
  function siRenderTable() {
    var tbody = document.getElementById('si-table-tbody');
    if (!tbody || !_siState.metrics) return;

    var m = _siState.metrics;
    var selKey = _siState.selectedSectorKey;

    var html = '';

    m.forEach(function(sec, idx) {
      var isSelected = (selKey === sec.key);
      var trBg = isSelected ? 'background:var(--brand-soft);' : '';

      var topGainersHtml = sec.constituents.slice(0, 3).map(function(tk) {
        var st = sec.constituentStats.find(function(c) { return c.ticker === tk; });
        var ret = st ? st.retPct : 0;
        return '<span onclick="siInspectTicker(\'' + tk + '\')" style="cursor:pointer;font-family:var(--font-mono);font-size:11px;font-weight:600;padding:2px 5px;background:var(--bg3);border-radius:4px;border:1px solid var(--border);margin-right:4px" title="Buka analisis ' + tk + '">' +
          tk + ' <span class="' + (ret >= 0 ? 'up' : 'dn') + '" style="font-size:10px">' + (ret >= 0 ? '+' : '') + ret.toFixed(1) + '%</span>' +
        '</span>';
      }).join('');

      html += '<tr style="' + trBg + '">' +
        '<td style="font-family:var(--font-mono);color:var(--text3)">' + (idx + 1) + '</td>' +
        '<td>' +
          '<div style="display:flex;align-items:center;gap:8px">' +
            '<span style="font-size:16px">' + sec.icon + '</span>' +
            '<div>' +
              '<div style="font-weight:700;font-size:12.5px;color:var(--text)">' + sec.name + '</div>' +
              '<div style="font-size:10.5px;color:var(--text3)">' + sec.labelId + ' · ' + sec.desc + '</div>' +
            '</div>' +
          '</div>' +
        '</td>' +
        '<td style="font-family:var(--font-mono);font-weight:700" class="' + (sec.retPct >= 0 ? 'up' : 'dn') + '">' +
          (sec.retPct >= 0 ? '+' : '') + sec.retPct.toFixed(2) + '%' +
        '</td>' +
        '<td style="font-family:var(--font-mono);font-weight:700;color:' + (sec.cmf >= 0 ? '#10b981' : '#ef4444') + '">' +
          (sec.cmf >= 0 ? '+' : '') + sec.cmf.toFixed(2) +
        '</td>' +
        '<td>' +
          '<span class="badge ' + sec.flowBadgeClass + '" style="font-size:10px;font-weight:700">' +
            sec.flowStatus +
          '</span>' +
        '</td>' +
        '<td>' +
          topGainersHtml +
        '</td>' +
        '<td style="text-align:right">' +
          '<button onclick="siSelectSector(\'' + sec.key + '\')" class="btn btn-ghost btn-xs" style="padding:2px 8px;border-color:var(--border);color:var(--text2)">' +
            (isSelected ? 'Tutup Berita' : 'Lihat Berita') +
          '</button>' +
        '</td>' +
      '</tr>';
    });

    tbody.innerHTML = html;
  }

  /**
   * Buka Analisis Saham Constituent
   */
  window.siInspectTicker = function(ticker) {
    if (!ticker) return;
    var tk = String(ticker).toUpperCase().trim();
    if (typeof mwSelectGlobalStock === 'function') {
      mwSelectGlobalStock(tk);
    } else if (typeof openStockDetailModal === 'function') {
      openStockDetailModal(tk);
    } else if (typeof goPage === 'function') {
      goPage('stock-intel');
    }
  };

  /**
   * Main Page Initialization Hook
   */
  window.renderSectoralInsightPage = function() {
    // Inisialisasi metrik jika belum ada
    if (!_siState.metrics) {
      _siState.metrics = siComputeAllSectors(_siState.timeframe);
    }

    siRenderKPIs();
    siRenderVisualPane();
    siRenderTable();

    // Ambil berita jika belum ada
    if (_siState.newsData.length === 0) {
      siFetchNews(false);
    } else {
      siRenderNewsPanel();
    }
  };

})(window);
