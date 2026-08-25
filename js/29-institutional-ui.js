// ============================================================
// MONEYWATCH PRO — INSTITUTIONAL FINTECH UI & COMMAND PALETTE
// ============================================================

(function() {
  'use strict';

  // ── Table Density Manager ──
  var currentDensity = localStorage.getItem('mw_table_density') || 'standard';

  window.mwGetTableDensity = function() {
    return currentDensity;
  };

  window.mwSetTableDensity = function(mode) {
    if (['compact', 'standard', 'pro'].indexOf(mode) === -1) mode = 'standard';
    currentDensity = mode;
    localStorage.setItem('mw_table_density', mode);
    
    // Apply class to tables
    var tables = document.querySelectorAll('.tbl');
    tables.forEach(function(t) {
      t.classList.remove('tbl-density-compact', 'tbl-density-standard', 'tbl-density-pro');
      t.classList.add('tbl-density-' + mode);
    });

    // Update active state on any density toggle button groups
    document.querySelectorAll('.density-toggle-btn').forEach(function(btn) {
      btn.classList.toggle('active', btn.getAttribute('data-density') === mode);
    });

    // Re-render if necessary
    if (typeof renderPortofolio === 'function' && document.getElementById('page-portofolio') && document.getElementById('page-portofolio').classList.contains('on')) {
      renderPortofolio();
    }
  };

  // ── Mini Sparkline Generator ──
  window.mwCreateSparkline = function(values, isGain, width, height) {
    width = width || 64;
    height = height || 18;
    if (!values || !values.length) {
      // Create a sensible 5-point curve if not provided
      var base = 100;
      var dir = isGain ? 1 : -1;
      values = [base, base + (dir * 2), base + (dir * 1.5), base + (dir * 3.5), base + (dir * 4.5)];
    }
    
    var min = Math.min.apply(null, values);
    var max = Math.max.apply(null, values);
    var range = max - min || 1;
    var padding = 2;
    var drawH = height - (padding * 2);
    
    var pts = values.map(function(val, idx) {
      var x = (idx / (values.length - 1)) * (width - 6) + 3;
      var y = height - padding - ((val - min) / range) * drawH;
      return { x: x.toFixed(1), y: y.toFixed(1) };
    });

    var pathD = 'M ' + pts.map(function(p) { return p.x + ' ' + p.y; }).join(' L ');
    var color = isGain ? '#10B981' : '#EF4444';
    var lastPt = pts[pts.length - 1];

    return '<svg class="sparkline-svg" width="' + width + '" height="' + height + '" viewBox="0 0 ' + width + ' ' + height + '">' +
      '<path d="' + pathD + '" fill="none" stroke="' + color + '" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>' +
      '<circle cx="' + lastPt.x + '" cy="' + lastPt.y + '" r="2" fill="' + color + '"/>' +
    '</svg>';
  };

  // ── Global Command Palette Engine ──
  var cmdSelectedIndex = 0;
  var cmdResults = [];

  window.openCommandPalette = function(initialQuery) {
    var overlay = document.getElementById('cmd-palette-overlay');
    if (!overlay) {
      createCommandPaletteDOM();
      overlay = document.getElementById('cmd-palette-overlay');
    }
    overlay.classList.add('open');
    var input = document.getElementById('cmd-search-input');
    if (input) {
      input.value = initialQuery || '';
      input.focus();
      input.select();
      mwFilterCommandPalette(input.value);
    }
  };

  window.closeCommandPalette = function() {
    var overlay = document.getElementById('cmd-palette-overlay');
    if (overlay) {
      overlay.classList.remove('open');
    }
  };

  function createCommandPaletteDOM() {
    var overlay = document.createElement('div');
    overlay.id = 'cmd-palette-overlay';
    overlay.onclick = function(e) {
      if (e.target === overlay) closeCommandPalette();
    };

    overlay.innerHTML = 
      '<div class="cmd-palette-container" onclick="event.stopPropagation()">' +
        '<div class="cmd-search-header">' +
          '<i class="ti ti-search"></i>' +
          '<input type="text" id="cmd-search-input" class="cmd-search-input" ' +
            'placeholder="Ketik ticker (BBCA, ANTM), modul, atau perintah cepat..." ' +
            'oninput="mwFilterCommandPalette(this.value)" ' +
            'onkeydown="mwHandleCmdKeyDown(event)">' +
          '<span class="cmd-kbd-badge">ESC Tutup</span>' +
        '</div>' +
        '<div class="cmd-results-list" id="cmd-results-list">' +
          '<!-- Injected by filter -->' +
        '</div>' +
        '<div class="cmd-footer">' +
          '<div style="display:flex;align-items:center;gap:12px">' +
            '<span><span class="cmd-kbd-badge">↑</span> <span class="cmd-kbd-badge">↓</span> Navigasi</span>' +
            '<span><span class="cmd-kbd-badge">↵</span> Pilih</span>' +
            '<span><span class="cmd-kbd-badge">/</span> Buka Cepat</span>' +
          '</div>' +
          '<div style="font-weight:700;color:var(--accent)">MoneyWatch Pro Terminal</div>' +
        '</div>' +
      '</div>';

    document.body.appendChild(overlay);
  }

  // Generate complete index of Searchable Items
  function getCommandIndex() {
    var items = [];

    // 1. Saham & Ticker IDX
    var allTickers = Object.keys(window.DB || {});
    var curPrices = window.prices || {};
    var curPrevCloses = window.prevCloses || {};

    allTickers.forEach(function(ticker) {
      var info = (window.DB && window.DB[ticker]) || {};
      var p = curPrices[ticker] || info.base || 0;
      var pc = curPrevCloses[ticker] || p;
      var chg = pc > 0 ? ((p - pc) / pc * 100) : 0;
      var isGain = chg >= 0;

      items.push({
        type: 'stock',
        category: 'Saham IDX',
        title: ticker,
        sub: (info.name || 'Saham BEI') + ' · ' + (info.sector || 'Sektor IDX'),
        badge: (p > 0 ? 'Rp ' + p.toLocaleString('id-ID') : 'Rp —') + ' (' + (isGain ? '+' : '') + chg.toFixed(2) + '%)',
        badgeColor: isGain ? 'var(--green)' : 'var(--red)',
        action: function() {
          if (typeof openStockIntelCockpit === 'function') {
            openStockIntelCockpit(ticker);
          } else {
            goPage('stock-intel');
          }
        }
      });
    });

    // 2. Modul & Halaman Aplikasi
    var pages = [
      { id: 'dashboard', title: 'Command Center (Executive Dashboard)', sub: 'Ringkasan portofolio, AUM, alokasi, dan pergerakan aset' },
      { id: 'stock-intel', title: 'Stock Intelligence Cockpit', sub: 'Deep cockpit analisis 360°, valuasi, teknikal & bandarmologi' },
      { id: 'portofolio', title: 'Portofolio Saham IDX', sub: 'Posisi aktif, lot, average price, unrealized P&L, dan alokasi' },
      { id: 'fundamental', title: 'Fundamental Suite & Health Score', sub: 'Rasio valuasi, ROE, PER, PBV, Altman Z-Score, dan margin' },
      { id: 'flowscan', title: 'Smart Money Flow & Foreign Tracker', sub: 'Deteksi akumulasi/distribusi big player dan arus dana asing' },
      { id: 'technical', title: 'Technical Indicators & Flow Scanner', sub: 'RSI, MACD, Stochastic, MA 20/50/200, dan support resistance' },
      { id: 'hargawajar', title: 'Fair Value & Valuation Model', sub: 'Graham Number, DCF Model, Peter Lynch & Relative Valuation' },
      { id: 'screener', title: 'Screener Saham LQ45 / Kompas100', sub: 'Filter saham berbasis kriteria fundamental dan momentum' },
      { id: 'market-regime', title: 'Market Regime & Macro Radar', sub: 'Deteksi siklus Bull/Bear, VIX, suku bunga, dan yield bond' },
      { id: 'radar', title: 'Opportunity Radar', sub: 'Peluang breakout, dividend trap, dan value turnaround' },
      { id: 'scenario', title: 'Scenario & What-If Engine', sub: 'Stress testing portofolio jika IHSG crash atau komoditas turun' },
      { id: 'backtester', title: 'Backtester Strategi Investasi', sub: 'Uji historis kinerja DCA, momentum, atau value investing' },
      { id: 'transaksi', title: 'Buku Transaksi', sub: 'Catatan seluruh transaksi beli, jual, dan dividen saham' },
      { id: 'dividen', title: 'Dashboard & Tracker Dividen', sub: 'Riwayat dividen, Dividend Yield, dan kalender cum-date' },
      { id: 'rebalance', title: 'Smart Rebalancing Portfolio', sub: 'Optimalisasi bobot portofolio kembali ke alokasi ideal' },
      { id: 'wealth', title: 'Net Worth & Money Map', sub: 'Total kekayaan bersih lintas bank, properti, kas, dan utang' },
      { id: 'rdn', title: 'Kas & Rekening Dana Nasabah (RDN)', sub: 'Mutasi saldo, top up, tarik dana, dan rekonsiliasi fee' }
    ];

    pages.forEach(function(pg) {
      items.push({
        type: 'page',
        category: 'Halaman & Modul',
        title: pg.title,
        sub: pg.sub,
        badge: 'Lompat →',
        badgeColor: 'var(--accent)',
        action: function() {
          if (typeof goPage === 'function') goPage(pg.id);
        }
      });
    });

    // 3. Aksi Cepat & Utilitas
    items.push({
      type: 'action',
      category: 'Aksi Cepat',
      title: '+ Catat Transaksi Saham Baru',
      sub: 'Input transaksi pembelian atau penjualan saham IDX',
      badge: 'Transaksi',
      badgeColor: 'var(--green)',
      action: function() {
        if (typeof openModal === 'function') openModal('tx');
      }
    });

    items.push({
      type: 'action',
      category: 'Aksi Cepat',
      title: '🔔 Pasang Price Alert Target Baru',
      sub: 'Set alarm take profit atau stop loss dengan audio chime dan web notification',
      badge: 'Price Alert',
      badgeColor: 'var(--amber)',
      action: function() {
        if (typeof openCreatePriceAlertModal === 'function') openCreatePriceAlertModal();
      }
    });

    items.push({
      type: 'action',
      category: 'Aksi Cepat',
      title: '🔔 Kelola Price Alerts & Monitoring Target',
      sub: 'Buka dashboard pemantauan target harga dan status pemicu alert',
      badge: 'Monitoring',
      badgeColor: 'var(--accent)',
      action: function() {
        if (typeof goPage === 'function') goPage('alerts');
      }
    });

    items.push({
      type: 'action',
      category: 'Aksi Cepat',
      title: '💾 Backup Data & Restore JSON',
      sub: 'Simpan snapshot data portofolio lokal atau pulihkan backup',
      badge: 'Backup',
      badgeColor: 'var(--amber)',
      action: function() {
        if (typeof openBackupModal === 'function') openBackupModal();
      }
    });

    items.push({
      type: 'action',
      category: 'Aksi Cepat',
      title: '⚡ Toggle View Mode (Terminal vs Executive)',
      sub: 'Beralih antara tampilan instrumen lengkap vs ringkasan eksekutif',
      badge: 'Tampilan',
      badgeColor: 'var(--purple)',
      action: function() {
        var cur = (typeof _currentViewMode !== 'undefined') ? _currentViewMode : 'pro';
        if (typeof mwSetViewMode === 'function') {
          mwSetViewMode(cur === 'pro' ? 'executive' : 'pro');
        }
      }
    });

    items.push({
      type: 'action',
      category: 'Aksi Cepat',
      title: '📑 Ubah Kerapatan Tabel: Compact / Rapat',
      sub: 'Format baris tabel rapat hemat ruang untuk multi-monitoring',
      badge: 'Density',
      badgeColor: 'var(--accent)',
      action: function() {
        mwSetTableDensity('compact');
      }
    });

    items.push({
      type: 'action',
      category: 'Aksi Cepat',
      title: '📑 Ubah Kerapatan Tabel: Pro / Expanded dengan Sparklines',
      sub: 'Format baris tabel detail lengkap dengan grafik sparkline mini',
      badge: 'Density',
      badgeColor: 'var(--accent)',
      action: function() {
        mwSetTableDensity('pro');
      }
    });

    return items;
  }

  window.mwFilterCommandPalette = function(query) {
    query = (query || '').trim().toLowerCase();
    var allItems = getCommandIndex();
    var resultsList = document.getElementById('cmd-results-list');
    if (!resultsList) return;

    var filtered = allItems;
    if (query) {
      filtered = allItems.filter(function(item) {
        return item.title.toLowerCase().indexOf(query) > -1 || 
               item.sub.toLowerCase().indexOf(query) > -1 || 
               (item.category && item.category.toLowerCase().indexOf(query) > -1);
      });
    }

    // Limit to top 25 results
    cmdResults = filtered.slice(0, 25);
    cmdSelectedIndex = 0;

    if (cmdResults.length === 0) {
      resultsList.innerHTML = '<div style="text-align:center;padding:32px 16px;color:var(--text3);font-size:13px">' +
        'Tidak ada ticker atau perintah yang cocok dengan "<strong>' + query + '</strong>"' +
      '</div>';
      return;
    }

    // Group by category
    var html = '';
    var lastCat = '';
    cmdResults.forEach(function(item, idx) {
      if (item.category !== lastCat) {
        lastCat = item.category;
        html += '<div class="cmd-category-label">' + lastCat + '</div>';
      }

      var iconClass = item.type === 'stock' ? 'ti ti-chart-candle' :
                      item.type === 'page' ? 'ti ti-layout' : 'ti ti-bolt';

      html += '<div class="cmd-item ' + (idx === 0 ? 'active' : '') + '" id="cmd-item-' + idx + '" onclick="mwExecuteCmdIndex(' + idx + ')">' +
        '<div class="cmd-item-left">' +
          '<div class="cmd-item-icon"><i class="' + iconClass + '"></i></div>' +
          '<div>' +
            '<div class="cmd-item-title">' + item.title + '</div>' +
            '<div class="cmd-item-sub">' + item.sub + '</div>' +
          '</div>' +
        '</div>' +
        '<div class="cmd-item-right">' +
          '<span class="badge" style="background:rgba(255,255,255,0.06);color:' + item.badgeColor + ';border:1px solid ' + item.badgeColor + '44">' + item.badge + '</span>' +
        '</div>' +
      '</div>';
    });

    resultsList.innerHTML = html;
  };

  window.mwHandleCmdKeyDown = function(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      closeCommandPalette();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (cmdResults.length > 0) {
        cmdSelectedIndex = (cmdSelectedIndex + 1) % cmdResults.length;
        updateCmdSelection();
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (cmdResults.length > 0) {
        cmdSelectedIndex = (cmdSelectedIndex - 1 + cmdResults.length) % cmdResults.length;
        updateCmdSelection();
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (cmdResults[cmdSelectedIndex]) {
        mwExecuteCmdIndex(cmdSelectedIndex);
      }
    }
  };

  function updateCmdSelection() {
    document.querySelectorAll('.cmd-item').forEach(function(el, idx) {
      el.classList.toggle('active', idx === cmdSelectedIndex);
    });
    var activeEl = document.getElementById('cmd-item-' + cmdSelectedIndex);
    if (activeEl) {
      activeEl.scrollIntoView({ block: 'nearest' });
    }
  }

  window.mwExecuteCmdIndex = function(idx) {
    var item = cmdResults[idx];
    if (item && typeof item.action === 'function') {
      closeCommandPalette();
      item.action();
    }
  };

  // ── Global Keyboard Shortcuts Listener ──
  document.addEventListener('keydown', function(e) {
    var tag = (e.target && e.target.tagName ? e.target.tagName.toLowerCase() : '');
    var isInput = tag === 'input' || tag === 'textarea' || tag === 'select' || (e.target && e.target.isContentEditable);

    // 1. Ctrl+K or Cmd+K: Open Command Palette
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      openCommandPalette();
      return;
    }

    // 2. '/' key: Open Command Palette when not typing in an input
    if (e.key === '/' && !isInput && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      openCommandPalette();
      return;
    }
  });

  // ── Inject Density Switchers into Toolbars on DOM Load ──
  function initInstitutionalUI() {
    // 1. Injeksi Table Density Switcher di Portofolio Table Toolbar
    var portoToolbar = document.querySelector('#page-portofolio .card > div:first-child');
    if (portoToolbar && !document.getElementById('porto-density-ctl')) {
      var densityDiv = document.createElement('div');
      densityDiv.id = 'porto-density-ctl';
      densityDiv.className = 'density-toggle-group';
      densityDiv.title = 'Ubah Kerapatan Tampilan Tabel';
      densityDiv.innerHTML = 
        '<button class="density-toggle-btn ' + (currentDensity==='compact'?'active':'') + '" data-density="compact" onclick="mwSetTableDensity(\'compact\')">Compact</button>' +
        '<button class="density-toggle-btn ' + (currentDensity==='standard'?'active':'') + '" data-density="standard" onclick="mwSetTableDensity(\'standard\')">Standard</button>' +
        '<button class="density-toggle-btn ' + (currentDensity==='pro'?'active':'') + '" data-density="pro" onclick="mwSetTableDensity(\'pro\')">Pro + Sparkline</button>';
      portoToolbar.appendChild(densityDiv);
    }

    // 2. Injeksi Quick Search Button di Topbar
    var topbarRight = document.querySelector('.topbar-right');
    if (topbarRight && !document.getElementById('tb-cmd-btn')) {
      var cmdBtn = document.createElement('button');
      cmdBtn.id = 'tb-cmd-btn';
      cmdBtn.className = 'btn btn-ghost btn-xs';
      cmdBtn.style.cssText = 'display:flex;align-items:center;gap:6px;font-size:11px;border-color:var(--border2);color:var(--text2);padding:4px 9px';
      cmdBtn.innerHTML = '<i class="ti ti-search" style="color:var(--accent)"></i> <span>Cari</span> <span class="side-kbd" style="font-size:9px">Ctrl K</span>';
      cmdBtn.onclick = function() { openCommandPalette(); };
      topbarRight.insertBefore(cmdBtn, topbarRight.firstChild);
    }

    // 3. Terapkan kelas densitas awal ke semua tabel
    mwSetTableDensity(currentDensity);
  }

  // Run on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initInstitutionalUI);
  } else {
    initInstitutionalUI();
  }

  // ── Override / Enhance `renderPortofolio` to support sparklines & professional layout ──
  var _origRenderPortofolio = window.renderPortofolio;
  window.renderPortofolio = function() {
    if (typeof _origRenderPortofolio === 'function') {
      _origRenderPortofolio.apply(this, arguments);
    }

    var density = mwGetTableDensity();
    var portoTbody = document.getElementById('porto-tbody');
    var portoTable = portoTbody ? portoTbody.closest('.tbl') : null;
    if (portoTable) {
      portoTable.classList.remove('tbl-density-compact', 'tbl-density-standard', 'tbl-density-pro');
      portoTable.classList.add('tbl-density-' + density);
    }

    // If in Pro mode, inject sparklines and enhance table headers
    if (density === 'pro' && portoTbody) {
      var headers = portoTable ? portoTable.querySelectorAll('thead th') : [];
      var hasSparkCol = false;
      headers.forEach(function(th) {
        if (th.textContent.indexOf('Tren 7D') > -1) hasSparkCol = true;
      });

      if (!hasSparkCol && portoTable && portoTable.querySelector('thead tr')) {
        var tr = portoTable.querySelector('thead tr');
        var th = document.createElement('th');
        th.className = 'spark-th';
        th.textContent = 'Tren 7D';
        th.style.width = '70px';
        tr.insertBefore(th, tr.children[7] || null);
      }

      // Add sparkline cell to each row
      var rows = portoTbody.querySelectorAll('tr');
      rows.forEach(function(row) {
        if (row.querySelector('.spark-td') || row.children.length < 5) return;
        var tickerEl = row.querySelector('.tp');
        var ticker = tickerEl ? tickerEl.textContent.trim() : '';
        var isGain = row.querySelector('.up') !== null;
        
        var td = document.createElement('td');
        td.className = 'spark-td';
        td.innerHTML = mwCreateSparkline(null, isGain, 64, 18);
        row.insertBefore(td, row.children[7] || null);
      });
    }
  };

})();
