/**
 * 49-bandar-movement.js — MoneyWatch Pro: Step 6 Bandar Movement Cockpit
 *
 * Implements 4 core Bandarmology widgets in Stock Master Terminal 360:
 * 1. Trade Flow (Intraday HAKA vs HAKI cumulative tape, Big Money filter, Net Acc/Dist gauge)
 * 2. Broker Flow (Cumulative multi-broker time series with 1D/1W/1M/3M/YTD/1Y timeframes + interactive broker chips)
 * 3. Broker Summary (Two-column Buyer vs Seller table with B.Val/Lot/Avg & S.Val/Lot/Avg + Broker Action gauge)
 * 4. Broker Distribution (Interactive Sankey / Alluvial Flow Diagram with Domestic, BUMN, and Foreign color coding)
 *
 * Strictly follows:
 * - CLAUDE.md: Zero synthetic/fabricated data (honest degradation when Invezgo unavailable)
 * - FINANCIAL_POLICY.md & AGENTS.md: Provider-agnostic, cache-efficient, single-stock synced
 */

var BM_STATE = {
  ticker: 'BBCA',
  timeframe: '1D', // '1D', '1W', '1M', '3M', 'YTD', '1Y'
  isBigMoney: false,
  metric: 'value', // 'value' | 'volume'
  investor: 'all', // 'all' | 'foreign' | 'domestic'
  market: 'RG', // 'RG' | 'NG' | 'TN'
  isNet: true,
  selectedBrokers: ['XC', 'XL', 'YP', 'AZ', 'SQ'],
  data: null,
  isLoading: false,
  charts: {},
  sankeySelectedNode: null // {side:'buyer'|'seller', code} when isolating one node's ribbons, else null
};

// Broker category color & styling helper
function bmGetBrokerInfo(code) {
  var clean = String(code || '').trim().toUpperCase();
  var foreignBrokers = ['AK', 'BK', 'KZ', 'RX', 'CS', 'MS', 'CG', 'ML', 'YU', 'DB', 'GW', 'ZP'];
  var bumnBrokers = ['CC', 'NI', 'OD', 'LG'];

  if (bumnBrokers.indexOf(clean) !== -1) {
    return { code: clean, group: 'BUMN', color: '#10B981', label: 'BUMN' };
  }
  if (foreignBrokers.indexOf(clean) !== -1) {
    return { code: clean, group: 'Foreign', color: '#EF4444', label: 'Asing' };
  }
  return { code: clean, group: 'Domestic', color: '#8B5CF6', label: 'Domestik' };
}

// Format Rupiah currency
function bmFormatRp(num) {
  var n = Number(num) || 0;
  var abs = Math.abs(n);
  var sign = n < 0 ? '-' : '';
  if (abs >= 1e12) return sign + (abs / 1e12).toFixed(2) + ' T';
  if (abs >= 1e9) return sign + (abs / 1e9).toFixed(2) + ' B';
  if (abs >= 1e6) return sign + (abs / 1e6).toFixed(1) + ' M';
  if (abs >= 1e3) return sign + (abs / 1e3).toFixed(0) + ' K';
  return sign + abs.toLocaleString('id-ID');
}

// Format Lot volume
function bmFormatLot(num) {
  var n = Number(num) || 0;
  var abs = Math.abs(n);
  var sign = n < 0 ? '-' : '';
  if (abs >= 1e6) return sign + (abs / 1e6).toFixed(1) + ' M Lot';
  if (abs >= 1e3) return sign + (abs / 1e3).toFixed(1) + ' K Lot';
  return sign + abs.toLocaleString('id-ID') + ' Lot';
}

// Format Average Price (clean integer or up to 2 decimal places)
function bmFormatAvg(num) {
  if (num === null || num === undefined || isNaN(num) || num === 0) return '-';
  var n = Number(num);
  if (n % 1 === 0) return n.toLocaleString('id-ID');
  var fixed = n.toFixed(2);
  if (fixed.endsWith('.00')) return Number(fixed.slice(0, -3)).toLocaleString('id-ID');
  if (fixed.endsWith('0')) fixed = fixed.slice(0, -1);
  var parts = fixed.split('.');
  var intPart = Number(parts[0]).toLocaleString('id-ID');
  return intPart + '.' + parts[1];
}

// Label helpers for filter dropdowns
function bmGetInvestorLabel(val) {
  var v = String(val || 'all').toLowerCase();
  if (v === 'foreign' || v === 'f') return 'Foreign';
  if (v === 'domestic' || v === 'd') return 'Domestic';
  return 'All Investor';
}

function bmGetMarketLabel(val) {
  var v = String(val || 'all').toUpperCase();
  if (v === 'RG') return 'Regular';
  if (v === 'TN') return 'Tunai';
  if (v === 'NG') return 'Nego';
  return 'All Market';
}

// Clean up chart instances
function bmKillChart(key) {
  if (BM_STATE.charts[key]) {
    try { BM_STATE.charts[key].destroy(); } catch (e) {}
    delete BM_STATE.charts[key];
  }
}

// ============================================================
// MAIN PAGE RENDERER
// ============================================================

function renderBandarMovementPage() {
  var container = document.getElementById('page-bandar-movement');
  if (!container) return;

  var currentTicker = (typeof GLOBAL_STOCK_CONTEXT !== 'undefined' && GLOBAL_STOCK_CONTEXT.getTicker)
    ? GLOBAL_STOCK_CONTEXT.getTicker()
    : (BM_STATE.ticker || 'BBCA');

  BM_STATE.ticker = currentTicker.toUpperCase().replace(/\.JK$/i, '').replace(/\.US$/i, '').trim();

  var navHtml = (typeof renderStockMaster360Nav === 'function')
    ? renderStockMaster360Nav('bandarmovement', BM_STATE.ticker)
    : '';

  container.innerHTML = `
    <div class="bandar-movement-suite" style="padding:16px;max-width:1600px;margin:0 auto">
      <div id="bm-sm360-mount">${navHtml}</div>

      <!-- STATUS & CONTROLS TOOLBAR -->
      <div class="card" style="margin-bottom:16px;padding:12px 18px;background:var(--bg2);border:1px solid var(--border);border-radius:10px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px">
        <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
          <div style="font-size:15px;font-weight:800;color:var(--text);display:flex;align-items:center;gap:6px">
            <i class="ti ti-chart-arrows-vertical" style="color:var(--accent,#3B82F6)"></i>
            STEP 6: BANDAR MOVEMENT &amp; FLOW COCKPIT
          </div>
          <span id="bm-header-ticker-badge" class="badge badge-primary" style="font-size:11px;font-weight:700;padding:2px 8px">${BM_STATE.ticker}</span>
          <span id="bm-data-status-badge" style="font-size:11px;color:var(--text3)"></span>
        </div>
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <button type="button" class="btn btn-sm btn-ghost" onclick="bmLoadData('${BM_STATE.ticker}', true)" title="Refresh data dari server">
            <i class="ti ti-refresh"></i> Refresh
          </button>
        </div>
      </div>

      <!-- 4-GRID COCKPIT CONTAINER -->
      <div id="bm-cockpit-grid" style="display:grid;grid-template-columns:repeat(auto-fit, minmax(580px, 1fr));gap:16px">
        <!-- 1. TRADE FLOW WIDGET -->
        <div class="card" style="background:var(--bg2);border:1px solid var(--border);border-radius:12px;padding:16px;display:flex;flex-direction:column">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;flex-wrap:wrap;gap:8px">
            <div style="display:flex;align-items:center;gap:8px">
              <span style="font-size:14px;font-weight:800;color:var(--text)">Trade Flow</span>
              <div class="btn-group" style="display:inline-flex;border:1px solid var(--border2);border-radius:6px;overflow:hidden">
                <button type="button" class="btn btn-xs ${!BM_STATE.isBigMoney ? 'btn-primary' : 'btn-ghost'}" onclick="bmToggleBigMoney(false)" style="font-size:10px;padding:3px 8px">All Trades</button>
                <button type="button" class="btn btn-xs ${BM_STATE.isBigMoney ? 'btn-primary' : 'btn-ghost'}" onclick="bmToggleBigMoney(true)" style="font-size:10px;padding:3px 8px">Big Money</button>
              </div>
            </div>
            <div style="display:flex;align-items:center;gap:6px">
              <span style="font-size:11px;color:var(--text3);font-family:var(--font-mono)">${BM_STATE.data && BM_STATE.data.date ? BM_STATE.data.date : 'Today'}</span>
            </div>
          </div>

          <div id="bm-trade-flow-chart-container" style="position:relative;height:280px;width:100%;margin-bottom:12px">
            <canvas id="bm-trade-flow-canvas"></canvas>
          </div>

          <!-- TRADE FLOW POWER GAUGE -->
          <div id="bm-trade-flow-gauge-wrap" style="margin-top:auto;padding-top:10px;border-top:1px solid var(--border2)">
            <!-- Rendered dynamically -->
          </div>
        </div>

        <!-- 2. BROKER FLOW WIDGET -->
        <div class="card" style="background:var(--bg2);border:1px solid var(--border);border-radius:12px;padding:16px;display:flex;flex-direction:column">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;flex-wrap:wrap;gap:8px">
            <div style="display:flex;align-items:center;gap:8px">
              <span style="font-size:14px;font-weight:800;color:var(--text)">Broker Flow ⓘ</span>
              <div class="btn-group" style="display:inline-flex;border:1px solid var(--border2);border-radius:6px;overflow:hidden">
                <button type="button" class="btn btn-xs ${BM_STATE.metric === 'value' ? 'btn-primary' : 'btn-ghost'}" onclick="bmToggleMetric('value')" style="font-size:10px;padding:3px 8px">Value</button>
                <button type="button" class="btn btn-xs ${BM_STATE.metric === 'volume' ? 'btn-primary' : 'btn-ghost'}" onclick="bmToggleMetric('volume')" style="font-size:10px;padding:3px 8px">Volume</button>
              </div>
            </div>
            <!-- Timeframe selector -->
            <div style="display:flex;gap:4px">
              ${['1D', '1W', '1M', '3M', 'YTD', '1Y'].map(function(tf) {
                return '<button type="button" class="btn btn-xs ' + (BM_STATE.timeframe === tf ? 'btn-primary' : 'btn-ghost') + '" onclick="bmSetTimeframe(\'' + tf + '\')" style="font-size:10px;padding:2px 8px;border-radius:4px">' + tf + '</button>';
              }).join('')}
            </div>
          </div>

          <div id="bm-broker-flow-chart-container" style="position:relative;height:280px;width:100%;margin-bottom:12px">
            <canvas id="bm-broker-flow-canvas"></canvas>
          </div>

          <!-- BROKER SELECTOR CHIPS -->
          <div id="bm-broker-chips-wrap" style="margin-top:auto;padding-top:10px;border-top:1px solid var(--border2);display:flex;align-items:center;gap:6px;flex-wrap:wrap">
            <!-- Rendered dynamically -->
          </div>
        </div>

        <!-- 3. BROKER SUMMARY WIDGET -->
        <div class="card" style="background:var(--bg2);border:1px solid var(--border);border-radius:12px;padding:16px;display:flex;flex-direction:column">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;flex-wrap:wrap;gap:8px">
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
              <span style="font-size:14px;font-weight:800;color:var(--text)">Broker Summary</span>
              
              <!-- INVESTOR FILTER DROPDOWN -->
              <div class="bm-dropdown-container" style="position:relative;display:inline-block">
                <button type="button" class="btn btn-xs" onclick="bmToggleDropdown('bm-investor-dropdown')" style="display:inline-flex;align-items:center;gap:6px;background:var(--bg3);border:1px solid var(--border2);border-radius:20px;padding:3px 10px;font-size:11px;font-weight:600;color:var(--text);cursor:pointer">
                  <span>${bmGetInvestorLabel(BM_STATE.investor)}</span>
                  <i class="ti ti-chevron-down" style="font-size:10px;color:var(--text3)"></i>
                </button>
                <div id="bm-investor-dropdown" class="bm-dropdown-menu" style="display:none;position:absolute;top:calc(100% + 4px);left:0;min-width:140px;background:var(--bg2);border:1px solid var(--border2);border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,0.25);z-index:100;padding:4px;overflow:hidden">
                  <div onclick="bmSetInvestor('all')" style="display:flex;align-items:center;justify-content:space-between;padding:7px 10px;font-size:12px;font-weight:500;border-radius:6px;cursor:pointer;color:var(--text);background:${BM_STATE.investor === 'all' ? 'var(--border2)' : 'transparent'};transition:background 0.15s" onmouseover="this.style.background='var(--border2)'" onmouseout="this.style.background='${BM_STATE.investor === 'all' ? 'var(--border2)' : 'transparent'}'">
                    <span>All Investor</span>
                    ${BM_STATE.investor === 'all' ? '<span style="width:16px;height:16px;border-radius:50%;background:#10B981;display:inline-flex;align-items:center;justify-content:center;color:#FFF;font-size:10px"><i class="ti ti-check" style="stroke-width:3"></i></span>' : ''}
                  </div>
                  <div onclick="bmSetInvestor('foreign')" style="display:flex;align-items:center;justify-content:space-between;padding:7px 10px;font-size:12px;font-weight:500;border-radius:6px;cursor:pointer;color:var(--text);background:${BM_STATE.investor === 'foreign' ? 'var(--border2)' : 'transparent'};transition:background 0.15s" onmouseover="this.style.background='var(--border2)'" onmouseout="this.style.background='${BM_STATE.investor === 'foreign' ? 'var(--border2)' : 'transparent'}'">
                    <span>Foreign</span>
                    ${BM_STATE.investor === 'foreign' ? '<span style="width:16px;height:16px;border-radius:50%;background:#10B981;display:inline-flex;align-items:center;justify-content:center;color:#FFF;font-size:10px"><i class="ti ti-check" style="stroke-width:3"></i></span>' : ''}
                  </div>
                  <div onclick="bmSetInvestor('domestic')" style="display:flex;align-items:center;justify-content:space-between;padding:7px 10px;font-size:12px;font-weight:500;border-radius:6px;cursor:pointer;color:var(--text);background:${BM_STATE.investor === 'domestic' ? 'var(--border2)' : 'transparent'};transition:background 0.15s" onmouseover="this.style.background='var(--border2)'" onmouseout="this.style.background='${BM_STATE.investor === 'domestic' ? 'var(--border2)' : 'transparent'}'">
                    <span>Domestic</span>
                    ${BM_STATE.investor === 'domestic' ? '<span style="width:16px;height:16px;border-radius:50%;background:#10B981;display:inline-flex;align-items:center;justify-content:center;color:#FFF;font-size:10px"><i class="ti ti-check" style="stroke-width:3"></i></span>' : ''}
                  </div>
                </div>
              </div>

              <!-- MARKET FILTER DROPDOWN -->
              <div class="bm-dropdown-container" style="position:relative;display:inline-block">
                <button type="button" class="btn btn-xs" onclick="bmToggleDropdown('bm-market-dropdown')" style="display:inline-flex;align-items:center;gap:6px;background:var(--bg3);border:1px solid var(--border2);border-radius:20px;padding:3px 10px;font-size:11px;font-weight:600;color:var(--text);cursor:pointer">
                  <span>${bmGetMarketLabel(BM_STATE.market)}</span>
                  <i class="ti ti-chevron-down" style="font-size:10px;color:var(--text3)"></i>
                </button>
                <div id="bm-market-dropdown" class="bm-dropdown-menu" style="display:none;position:absolute;top:calc(100% + 4px);left:0;min-width:140px;background:var(--bg2);border:1px solid var(--border2);border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,0.25);z-index:100;padding:4px;overflow:hidden">
                  <div onclick="bmSetMarket('all')" style="display:flex;align-items:center;justify-content:space-between;padding:7px 10px;font-size:12px;font-weight:500;border-radius:6px;cursor:pointer;color:var(--text);background:${BM_STATE.market === 'all' ? 'var(--border2)' : 'transparent'};transition:background 0.15s" onmouseover="this.style.background='var(--border2)'" onmouseout="this.style.background='${BM_STATE.market === 'all' ? 'var(--border2)' : 'transparent'}'">
                    <span>All Market</span>
                    ${BM_STATE.market === 'all' ? '<span style="width:16px;height:16px;border-radius:50%;background:#10B981;display:inline-flex;align-items:center;justify-content:center;color:#FFF;font-size:10px"><i class="ti ti-check" style="stroke-width:3"></i></span>' : ''}
                  </div>
                  <div onclick="bmSetMarket('RG')" style="display:flex;align-items:center;justify-content:space-between;padding:7px 10px;font-size:12px;font-weight:500;border-radius:6px;cursor:pointer;color:var(--text);background:${BM_STATE.market === 'RG' ? 'var(--border2)' : 'transparent'};transition:background 0.15s" onmouseover="this.style.background='var(--border2)'" onmouseout="this.style.background='${BM_STATE.market === 'RG' ? 'var(--border2)' : 'transparent'}'">
                    <span>Regular</span>
                    ${BM_STATE.market === 'RG' ? '<span style="width:16px;height:16px;border-radius:50%;background:#10B981;display:inline-flex;align-items:center;justify-content:center;color:#FFF;font-size:10px"><i class="ti ti-check" style="stroke-width:3"></i></span>' : ''}
                  </div>
                  <div onclick="bmSetMarket('TN')" style="display:flex;align-items:center;justify-content:space-between;padding:7px 10px;font-size:12px;font-weight:500;border-radius:6px;cursor:pointer;color:var(--text);background:${BM_STATE.market === 'TN' ? 'var(--border2)' : 'transparent'};transition:background 0.15s" onmouseover="this.style.background='var(--border2)'" onmouseout="this.style.background='${BM_STATE.market === 'TN' ? 'var(--border2)' : 'transparent'}'">
                    <span>Tunai</span>
                    ${BM_STATE.market === 'TN' ? '<span style="width:16px;height:16px;border-radius:50%;background:#10B981;display:inline-flex;align-items:center;justify-content:center;color:#FFF;font-size:10px"><i class="ti ti-check" style="stroke-width:3"></i></span>' : ''}
                  </div>
                  <div onclick="bmSetMarket('NG')" style="display:flex;align-items:center;justify-content:space-between;padding:7px 10px;font-size:12px;font-weight:500;border-radius:6px;cursor:pointer;color:var(--text);background:${BM_STATE.market === 'NG' ? 'var(--border2)' : 'transparent'};transition:background 0.15s" onmouseover="this.style.background='var(--border2)'" onmouseout="this.style.background='${BM_STATE.market === 'NG' ? 'var(--border2)' : 'transparent'}'">
                    <span>Nego</span>
                    ${BM_STATE.market === 'NG' ? '<span style="width:16px;height:16px;border-radius:50%;background:#10B981;display:inline-flex;align-items:center;justify-content:center;color:#FFF;font-size:10px"><i class="ti ti-check" style="stroke-width:3"></i></span>' : ''}
                  </div>
                </div>
              </div>
            </div>
            <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
              <!-- Broker Summary Timeframe Switcher -->
              <div class="btn-group" style="display:inline-flex;border:1px solid var(--border2);border-radius:6px;overflow:hidden">
                ${['1D', '1W', '1M', '3M'].map(function(tf) {
                  return '<button type="button" class="btn btn-xs ' + (BM_STATE.timeframe === tf ? 'btn-primary' : 'btn-ghost') + '" onclick="bmSetTimeframe(\'' + tf + '\')" style="font-size:10px;padding:2px 7px">' + tf + '</button>';
                }).join('')}
              </div>
              <button type="button" class="btn btn-xs ${BM_STATE.isNet ? 'btn-primary' : 'btn-ghost'}" onclick="bmToggleNet()" style="font-size:10px;padding:3px 8px">
                Net: ${BM_STATE.isNet ? 'ON' : 'OFF'}
              </button>
              <button type="button" class="btn btn-xs btn-ghost" onclick="bmLoadData('${BM_STATE.ticker}', true)" title="Muat ulang Broker Summary (${BM_STATE.timeframe})" style="font-size:10px;padding:3px 6px;border:1px solid var(--border2);border-radius:4px">
                <i class="ti ti-refresh"></i>
              </button>
            </div>
          </div>

          <!-- BROKER ACTION POWER GAUGE -->
          <div id="bm-broker-action-gauge" style="margin-bottom:14px">
            <!-- Rendered dynamically -->
          </div>

          <!-- BUYER & SELLER TWO-COLUMN TABLE -->
          <div id="bm-summary-tables-wrap" style="overflow-x:auto">
            <!-- Rendered dynamically -->
          </div>
        </div>

        <!-- 4. BROKER DISTRIBUTION (SANKEY / ALLUVIAL FLOW) -->
        <div class="card" style="background:var(--bg2);border:1px solid var(--border);border-radius:12px;padding:16px;display:flex;flex-direction:column">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;flex-wrap:wrap;gap:8px">
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
              <span style="font-size:14px;font-weight:800;color:var(--text)">Broker Distribution (Alluvial Flow)</span>
              <span style="font-size:9px;font-weight:700;letter-spacing:.03em;color:#F59E0B;background:rgba(245,158,11,.1);border:1px solid rgba(245,158,11,.25);border-radius:4px;padding:2px 7px" title="Nilai per pasangan buyer-seller dihitung proporsional dari total beli/jual broker, bukan pasangan transaksi yang benar-benar teramati (broker summary IDX tidak mengungkap siapa berdagang dengan siapa)">ESTIMASI PROPORSIONAL</span>
              <button type="button" id="bm-sankey-reset-btn" onclick="bmSankeySelectNode(null)" style="display:none;font-size:10px;font-weight:600;color:var(--accent,#3B82F6);background:none;border:1px solid var(--border2);border-radius:5px;padding:2px 8px;cursor:pointer">
                <i class="ti ti-x" style="font-size:9px;vertical-align:-1px"></i> Tampilkan Semua
              </button>
            </div>
            <div style="display:flex;align-items:center;gap:10px;font-size:11px">
              <span style="display:inline-flex;align-items:center;gap:4px"><span style="width:8px;height:8px;border-radius:2px;background:#8B5CF6"></span> Domestik</span>
              <span style="display:inline-flex;align-items:center;gap:4px"><span style="width:8px;height:8px;border-radius:2px;background:#10B981"></span> BUMN</span>
              <span style="display:inline-flex;align-items:center;gap:4px"><span style="width:8px;height:8px;border-radius:2px;background:#EF4444"></span> Asing</span>
            </div>
          </div>

          <div id="bm-sankey-container" style="position:relative;width:100%;flex:1;min-height:0;max-height:520px;overflow-y:auto;overflow-x:hidden">
            <canvas id="bm-sankey-canvas" style="width:100%;display:block"></canvas>
          </div>

          <div style="margin-top:10px;font-size:10.5px;color:var(--text3);text-align:center">
            Klik broker untuk menyorot pita miliknya saja &middot; ketebalan pita = estimasi proporsional (bukan pasangan transaksi teramati) &middot; scroll di dalam chart untuk lihat semua broker
          </div>
        </div>
      </div>
    </div>
  `;

  bmLoadData(BM_STATE.ticker);
}

// ============================================================
// DATA LOADER & API HANDLER
// ============================================================

async function bmLoadData(ticker, force) {
  if (!ticker) return;
  BM_STATE.ticker = ticker.toUpperCase().replace(/\.JK$/i, '').replace(/\.US$/i, '').trim();

  var tkBadge = document.getElementById('bm-header-ticker-badge');
  if (tkBadge) tkBadge.textContent = BM_STATE.ticker;

  var statusBadge = document.getElementById('bm-data-status-badge');
  if (statusBadge) statusBadge.innerHTML = '⏳ Memuat data Bandar Movement...';

  try {
    var query = '?timeframe=' + encodeURIComponent(BM_STATE.timeframe)
      + '&big_money=' + (BM_STATE.isBigMoney ? 'true' : 'false')
      + '&investor=' + encodeURIComponent(BM_STATE.investor)
      + '&market=' + encodeURIComponent(BM_STATE.market)
      + (force ? '&refresh=true&force=true' : '');

    var res = await fetch('/api/idx/bandar-movement/' + encodeURIComponent(BM_STATE.ticker) + query);
    var json = await res.json();

    if (!json || !json.success || !json.data) {
      if (statusBadge) statusBadge.innerHTML = '<span style="color:#EF4444">⚠️ Data tidak tersedia</span>';
      bmRenderEmptyState('Gagal memuat data dari server atau Invezgo API key belum aktif.');
      return;
    }

    BM_STATE.data = json.data;
    if (statusBadge) {
      statusBadge.innerHTML = '<span style="color:#10B981">● Live Invezgo / IDX Data</span>';
    }

    bmRenderAllWidgets();
  } catch (e) {
    console.warn('[Bandar Movement] Load error:', e);
    if (statusBadge) statusBadge.innerHTML = '<span style="color:#EF4444">⚠️ Gangguan jaringan</span>';
    bmRenderEmptyState('Terjadi kesalahan jaringan saat mengambil data Bandar Movement.');
  }
}

function bmRenderEmptyState(msg) {
  var grid = document.getElementById('bm-cockpit-grid');
  if (grid) {
    grid.innerHTML = `
      <div class="card" style="grid-column: 1 / -1; padding: 40px 20px; text-align: center; background: var(--bg2); border: 1px solid var(--border); border-radius: 12px">
        <div style="font-size: 32px; margin-bottom: 12px">📡</div>
        <div style="font-size: 15px; font-weight: 700; color: var(--text); margin-bottom: 6px">Data Bandar Movement Tidak Tersedia</div>
        <div style="font-size: 12px; color: var(--text3); max-width: 500px; margin: 0 auto 16px">${msg}</div>
        <button type="button" class="btn btn-sm btn-primary" onclick="bmLoadData('${BM_STATE.ticker}', true)">Coba Lagi</button>
      </div>
    `;
  }
}

// ============================================================
// WIDGET RENDERERS
// ============================================================

function bmRenderAllWidgets() {
  if (!BM_STATE.data) return;
  bmRenderTradeFlowWidget();
  bmRenderBrokerFlowWidget();
  bmRenderBrokerSummaryWidget();
  bmRenderBrokerDistributionSankey();
}

// 1. Trade Flow Chart & Gauge
function bmRenderTradeFlowWidget() {
  var tfData = BM_STATE.data.tradeFlow;
  var canvas = document.getElementById('bm-trade-flow-canvas');
  var gaugeWrap = document.getElementById('bm-trade-flow-gauge-wrap');
  if (!canvas) return;

  bmKillChart('tradeFlow');

  if (!tfData || !tfData.ok || !Array.isArray(tfData.points) || tfData.points.length === 0) {
    var parent = document.getElementById('bm-trade-flow-chart-container');
    if (parent) {
      parent.innerHTML = '<div style="display:flex;height:100%;align-items:center;justify-content:center;color:var(--text3);font-size:12px">Data Trade Flow intraday belum tersedia untuk saham ini.</div>';
    }
    return;
  }

  var labels = tfData.points.map(p => p.time.slice(11, 16) || p.time);
  var buySeries = tfData.points.map(p => p.cumBuyValue);
  var sellSeries = tfData.points.map(p => p.cumSellValue);
  var priceSeries = tfData.points.map(p => p.price);

  if (typeof Chart !== 'undefined') {
    BM_STATE.charts['tradeFlow'] = new Chart(canvas.getContext('2d'), {
      type: 'line',
      data: {
        labels: labels,
        datasets: [
          {
            label: 'Buy (HAKA)',
            data: buySeries,
            borderColor: '#10B981',
            backgroundColor: 'rgba(16,185,129,0.05)',
            borderWidth: 2,
            pointRadius: 0,
            yAxisID: 'y'
          },
          {
            label: 'Sell (HAKI)',
            data: sellSeries,
            borderColor: '#EF4444',
            backgroundColor: 'rgba(239,68,68,0.05)',
            borderWidth: 2,
            pointRadius: 0,
            yAxisID: 'y'
          },
          {
            label: 'Price',
            data: priceSeries,
            borderColor: '#38BDF8',
            borderWidth: 1.5,
            borderDash: [3, 3],
            pointRadius: 0,
            yAxisID: 'y1'
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: {
            position: 'bottom',
            labels: { boxWidth: 10, font: { size: 10 }, color: '#94A3B8' }
          },
          tooltip: {
            callbacks: {
              label: function(ctx) {
                if (ctx.datasetIndex === 2) return 'Price: Rp ' + Number(ctx.raw).toLocaleString('id-ID');
                return ctx.dataset.label + ': ' + bmFormatRp(ctx.raw);
              }
            }
          }
        },
        scales: {
          x: { grid: { display: false }, ticks: { font: { size: 9 }, color: '#64748B', maxTicksLimit: 7 } },
          y: {
            position: 'left',
            grid: { color: 'rgba(255,255,255,0.04)' },
            ticks: {
              font: { size: 9 },
              color: '#64748B',
              callback: function(v) { return bmFormatRp(v); }
            }
          },
          y1: {
            position: 'right',
            grid: { display: false },
            ticks: {
              font: { size: 9 },
              color: '#38BDF8',
              callback: function(v) { return 'Rp ' + Number(v).toLocaleString('id-ID'); }
            }
          }
        }
      }
    });
  }

  // Gauge Meter
  if (gaugeWrap) {
    var score = tfData.accScore || 0;
    var normPct = Math.max(0, Math.min(100, Math.round(((score + 100) / 200) * 100)));
    var label = tfData.meterLabel || 'Neutral';
    var labelColor = score >= 15 ? '#10B981' : (score <= -15 ? '#EF4444' : 'var(--text3)');

    gaugeWrap.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;font-size:11px;margin-bottom:4px">
        <span style="color:#EF4444;font-weight:700">Net Dist</span>
        <span style="color:${labelColor};font-weight:800;font-size:12px">${label} (${score > 0 ? '+' : ''}${score}%)</span>
        <span style="color:#10B981;font-weight:700">Net Acc</span>
      </div>
      <div style="position:relative;height:8px;background:rgba(255,255,255,0.08);border-radius:4px;overflow:hidden">
        <div style="position:absolute;left:0;top:0;bottom:0;width:50%;background:linear-gradient(to right, #EF4444, rgba(239,68,68,0.2))"></div>
        <div style="position:absolute;right:0;top:0;bottom:0;width:50%;background:linear-gradient(to right, rgba(16,185,129,0.2), #10B981)"></div>
        <div style="position:absolute;top:0;bottom:0;left:${normPct}%;width:4px;background:#FFF;border-radius:2px;transform:translateX(-50%);box-shadow:0 0 6px rgba(255,255,255,0.8)"></div>
      </div>
    `;
  }
}

// 2. Multi-Broker Cumulative Flow Chart
function bmRenderBrokerFlowWidget() {
  var bfData = BM_STATE.data.brokerFlow;
  var canvas = document.getElementById('bm-broker-flow-canvas');
  var chipsWrap = document.getElementById('bm-broker-chips-wrap');
  if (!canvas) return;

  bmKillChart('brokerFlow');

  if (!bfData || !bfData.ok || !Array.isArray(bfData.points) || bfData.points.length === 0) {
    var parent = document.getElementById('bm-broker-flow-chart-container');
    if (parent) {
      parent.innerHTML = '<div style="display:flex;height:100%;align-items:center;justify-content:center;color:var(--text3);font-size:12px">Data Broker Flow time-series belum tersedia.</div>';
    }
    return;
  }

  var labels = bfData.points.map(p => p.time.slice(0, 10));
  var colorPalette = ['#8B5CF6', '#38BDF8', '#EC4899', '#F59E0B', '#EF4444', '#10B981', '#6366F1', '#14B8A6'];

  var datasets = BM_STATE.selectedBrokers.map(function(bCode, idx) {
    var dataVals = bfData.points.map(function(pt) {
      return (pt.brokers && pt.brokers[bCode]) ? Number(pt.brokers[bCode]) : 0;
    });

    return {
      label: bCode,
      data: dataVals,
      borderColor: colorPalette[idx % colorPalette.length],
      backgroundColor: 'transparent',
      borderWidth: 2,
      pointRadius: 0,
      yAxisID: 'y'
    };
  });

  if (typeof Chart !== 'undefined') {
    BM_STATE.charts['brokerFlow'] = new Chart(canvas.getContext('2d'), {
      type: 'line',
      data: {
        labels: labels,
        datasets: datasets
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: {
            position: 'bottom',
            labels: { boxWidth: 10, font: { size: 10 }, color: '#94A3B8' }
          },
          tooltip: {
            callbacks: {
              label: function(ctx) {
                return ctx.dataset.label + ': ' + bmFormatRp(ctx.raw);
              }
            }
          }
        },
        scales: {
          x: { grid: { display: false }, ticks: { font: { size: 9 }, color: '#64748B', maxTicksLimit: 7 } },
          y: {
            grid: { color: 'rgba(255,255,255,0.04)' },
            ticks: {
              font: { size: 9 },
              color: '#64748B',
              callback: function(v) { return bmFormatRp(v); }
            }
          }
        }
      }
    });
  }

  // Chips at bottom
  if (chipsWrap) {
    var chipsHtml = BM_STATE.selectedBrokers.map(function(code, idx) {
      var color = colorPalette[idx % colorPalette.length];
      return `
        <span class="badge" style="background:rgba(255,255,255,0.05);color:${color};border:1px solid ${color};padding:3px 8px;border-radius:6px;font-size:11px;font-weight:700;display:inline-flex;align-items:center;gap:4px">
          ● ${code}
          <i class="ti ti-x" style="cursor:pointer;font-size:10px" onclick="bmRemoveBroker('${code}')"></i>
        </span>
      `;
    }).join(' ');

    chipsWrap.innerHTML = `
      <div style="font-size:11px;color:var(--text3);margin-right:4px">Brokers:</div>
      ${chipsHtml}
      <button type="button" class="btn btn-xs btn-ghost" onclick="bmPromptAddBroker()" style="font-size:10px;padding:2px 8px;border-radius:6px;border:1px dashed var(--border2)">
        <i class="ti ti-plus"></i> Tambah
      </button>
    `;
  }
}

// 3. Broker Summary & Power Meter
function bmRenderBrokerSummaryWidget() {
  var bSummary = BM_STATE.data.brokerSummary;
  var gaugeEl = document.getElementById('bm-broker-action-gauge');
  var tablesEl = document.getElementById('bm-summary-tables-wrap');
  if (!tablesEl) return;

  if (!bSummary || !Array.isArray(bSummary.buyers) || !Array.isArray(bSummary.sellers) || (bSummary.buyers.length === 0 && bSummary.sellers.length === 0)) {
    if (gaugeEl) gaugeEl.innerHTML = '';
    var tfText = (BM_STATE.timeframe && BM_STATE.timeframe !== '1D')
      ? 'Data Broker Summary periode <b>' + BM_STATE.timeframe + '</b> untuk <b>' + (BM_STATE.ticker || 'emiten ini') + '</b> saat ini belum tersedia dari bursa atau sedang disiapkan.'
      : 'Data Broker Summary harian (1D) untuk <b>' + (BM_STATE.ticker || 'emiten ini') + '</b> saat ini belum tersedia atau belum dipublikasikan oleh bursa (EOD diterbitkan sore hari pk 17:30 WIB setelah penutupan bursa).';
    tablesEl.innerHTML = '<div style="padding:28px 16px;text-align:center;background:var(--bg3);border:1px dashed var(--border2);border-radius:10px;margin:8px 0">'
      + '<div style="font-size:22px;margin-bottom:8px">📡</div>'
      + '<div style="font-weight:700;color:var(--text);font-size:13px;margin-bottom:4px">Data Broker Summary Belum Tersedia (' + BM_STATE.timeframe + ')</div>'
      + '<div style="color:var(--text3);font-size:11.5px;max-width:440px;margin:0 auto 14px;line-height:1.5">' + tfText + '</div>'
      + '<button type="button" class="btn btn-sm btn-primary" onclick="bmLoadData(\'' + (BM_STATE.ticker || 'BBCA') + '\', true)" style="display:inline-flex;align-items:center;gap:6px">'
      + '<i class="ti ti-refresh"></i> Muat Ulang Data (' + BM_STATE.timeframe + ')'
      + '</button>'
      + '</div>';
    return;
  }

  var verdict = (bSummary.bandarmology && bSummary.bandarmology.verdict) || 'NEUTRAL';
  var rawScore = bSummary.bandarmology && bSummary.bandarmology.score !== undefined ? bSummary.bandarmology.score : 50;
  var score = Number(rawScore);
  // Backend computeBandarmologyVerdict outputs score on [0, 100] scale:
  // 0-15: Big Dist, 30: Normal Dist, 50: Neutral, 75: Normal Acc, 90-100: Big Acc
  var normPct = Math.max(0, Math.min(100, Math.round(score)));
  var vColor = score >= 60 ? '#10B981' : (score <= 40 ? '#EF4444' : 'var(--text3)');
  var scoreLabel = '';
  if (score > 50) {
    scoreLabel = `(+${score - 50})`;
  } else if (score < 50) {
    scoreLabel = `(${score - 50})`;
  } else {
    scoreLabel = '(Net 0)';
  }

  if (gaugeEl) {
    gaugeEl.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;font-size:11px;margin-bottom:4px">
        <span style="color:#EF4444;font-weight:700">Big Dist</span>
        <span style="color:${vColor};font-weight:800;font-size:12px">${verdict} ${scoreLabel}</span>
        <span style="color:#10B981;font-weight:700">Big Acc</span>
      </div>
      <div style="position:relative;height:8px;background:rgba(255,255,255,0.08);border-radius:4px;overflow:hidden">
        <div style="position:absolute;left:0;top:0;bottom:0;width:50%;background:linear-gradient(to right, #EF4444, rgba(239,68,68,0.2))"></div>
        <div style="position:absolute;right:0;top:0;bottom:0;width:50%;background:linear-gradient(to right, rgba(16,185,129,0.2), #10B981)"></div>
        <div style="position:absolute;top:0;bottom:0;left:${normPct}%;width:4px;background:#FFF;border-radius:2px;transform:translateX(-50%);box-shadow:0 0 6px rgba(255,255,255,0.8)"></div>
      </div>
    `;
  }

  var buyers = bSummary.buyers.slice(0, 10);
  var sellers = bSummary.sellers.slice(0, 10);
  var maxRows = Math.max(buyers.length, sellers.length);

  var rowsHtml = '';
  for (var i = 0; i < maxRows; i++) {
    var b = buyers[i] || null;
    var s = sellers[i] || null;

    var bInfo = b ? bmGetBrokerInfo(b.broker) : null;
    var sInfo = s ? bmGetBrokerInfo(s.broker) : null;

    rowsHtml += `
      <tr style="border-bottom:1px solid var(--border2);font-size:11px">
        <!-- BUY SIDE -->
        <td style="padding:6px 8px;font-weight:700;color:${bInfo ? bInfo.color : 'inherit'}">${b ? b.broker : '-'}</td>
        <td style="padding:6px 8px;text-align:right;font-family:var(--font-mono)">${b ? bmFormatRp(b.valueRp) : '-'}</td>
        <td style="padding:6px 8px;text-align:right;font-family:var(--font-mono);color:var(--text2)">${b ? bmFormatLot(b.volumeLot) : '-'}</td>
        <td style="padding:6px 8px;text-align:right;font-family:var(--font-mono);color:#38BDF8">${b ? bmFormatAvg(b.avgPrice) : '-'}</td>

        <!-- DIVIDER -->
        <td style="width:1px;background:var(--border2);padding:0"></td>

        <!-- SELL SIDE -->
        <td style="padding:6px 8px;font-weight:700;color:${sInfo ? sInfo.color : 'inherit'}">${s ? s.broker : '-'}</td>
        <td style="padding:6px 8px;text-align:right;font-family:var(--font-mono)">${s ? bmFormatRp(s.valueRp) : '-'}</td>
        <td style="padding:6px 8px;text-align:right;font-family:var(--font-mono);color:var(--text2)">${s ? bmFormatLot(s.volumeLot) : '-'}</td>
        <td style="padding:6px 8px;text-align:right;font-family:var(--font-mono);color:#38BDF8">${s ? bmFormatAvg(s.avgPrice) : '-'}</td>
      </tr>
    `;
  }

  tablesEl.innerHTML = `
    <table style="width:100%;border-collapse:collapse;text-align:left">
      <thead>
        <tr style="background:var(--bg3);font-size:10px;text-transform:uppercase;color:var(--text3);border-bottom:1px solid var(--border)">
          <th style="padding:6px 8px">Buy</th>
          <th style="padding:6px 8px;text-align:right">B.Val</th>
          <th style="padding:6px 8px;text-align:right">B.Lot</th>
          <th style="padding:6px 8px;text-align:right">B.Avg</th>
          <th style="width:1px;background:var(--border2);padding:0"></th>
          <th style="padding:6px 8px">Sell</th>
          <th style="padding:6px 8px;text-align:right">S.Val</th>
          <th style="padding:6px 8px;text-align:right">S.Lot</th>
          <th style="padding:6px 8px;text-align:right">S.Avg</th>
        </tr>
      </thead>
      <tbody>
        ${rowsHtml}
      </tbody>
    </table>
  `;
}

// 4. Broker Distribution Sankey Alluvial Flow
function bmRenderBrokerDistributionSankey() {
  var dist = BM_STATE.data.distributionSankey;
  var canvas = document.getElementById('bm-sankey-canvas');
  if (!canvas) return;

  var ctx = canvas.getContext('2d');
  var dpr = window.devicePixelRatio || 1;
  var width = canvas.parentElement.clientWidth || 540;

  if (!dist || !dist.buyers || !dist.sellers || dist.buyers.length === 0 || dist.sellers.length === 0) {
    var emptyHeight = 300;
    canvas.style.height = emptyHeight + 'px';
    canvas.width = width * dpr;
    canvas.height = emptyHeight * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, emptyHeight);
    ctx.fillStyle = '#64748B';
    ctx.font = '12px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Data distribusi perpindahan broker belum tersedia.', width / 2, emptyHeight / 2);
    return;
  }

  var buyers = dist.buyers.slice(0, 7);
  var sellers = dist.sellers.slice(0, 7);
  var links = dist.links || [];

  var topPad = 24;
  var bottomPad = 20;
  var nodeWidth = 86;
  var leftX = 20;
  var rightX = width - nodeWidth - 20;

  // FIX (2026-09-26, user-reported: bottom rows cut off with no way to
  // reach them): height used to come from the container's own rendered
  // size (rect.height), which a CSS grid can squeeze or stretch to match
  // its row regardless of how many buyers/sellers there are. Height is now
  // content-driven — every node gets at least NODE_MIN_H — and
  // #bm-sankey-container (main render template above) caps its own height
  // with overflow-y:auto, so a chart taller than the card scrolls inside
  // the card instead of being clipped with no way to see the rest.
  var NODE_MIN_H = 30, NODE_GAP = 10;
  var maxRows = Math.max(buyers.length, sellers.length);
  var neededUsableHeight = maxRows * NODE_MIN_H + (maxRows - 1) * NODE_GAP;
  var height = Math.max(320, neededUsableHeight + topPad + bottomPad);
  var usableHeight = height - topPad - bottomPad;

  canvas.style.height = height + 'px';
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, width, height);

  var totalBuyVal = dist.totalBuyVal || 1;
  var totalSellVal = dist.totalSellVal || 1;

  // Calculate Buyer Node Positions
  var bCurrentY = topPad;
  var bAvailHeight = usableHeight - (buyers.length - 1) * NODE_GAP;

  buyers.forEach(function(b) {
    var h = Math.max(NODE_MIN_H, (b.value / totalBuyVal) * bAvailHeight);
    b.x = leftX;
    b.y = bCurrentY;
    b.w = nodeWidth;
    b.h = h;
    bCurrentY += h + NODE_GAP;
  });

  // Calculate Seller Node Positions
  var sCurrentY = topPad;
  var sAvailHeight = usableHeight - (sellers.length - 1) * NODE_GAP;

  sellers.forEach(function(s) {
    var h = Math.max(NODE_MIN_H, (s.value / totalSellVal) * sAvailHeight);
    s.x = rightX;
    s.y = sCurrentY;
    s.w = nodeWidth;
    s.h = h;
    sCurrentY += h + NODE_GAP;
  });

  // Draw Flow Ribbons — filled bands, not thin strokes, allocated to
  // distinct segments of each node's height (largest flow first) so a
  // buyer's several ribbons fan out side-by-side instead of all leaving
  // from the node's exact center and crossing on top of each other.
  // FIX (2026-09-26, user-reported with reference screenshot: "pita
  // menumpuk"): the old renderer stroked every buyer-seller pair as its
  // own thin line anchored to each node's vertical midpoint, so a buyer
  // with several outgoing links drew every ribbon starting from the same
  // point, guaranteeing overlap right at the node. Also drops flows below
  // 8% of the buyer's own value (always keeping each buyer's single
  // largest flow) so the chart shows the material distribution instead of
  // ~49 near-invisible buyer x seller combinations — see isEstimate note
  // on distributionSankey in generateBandarMovementData() for why these
  // per-pair values are a proportional estimate, not observed trades.
  //
  // FEATURE (2026-09-26, user-requested): clicking a buyer/seller node
  // isolates it — only ribbons touching BM_STATE.sankeySelectedNode are
  // drawn, every other ribbon is skipped entirely (not just dimmed). In
  // that mode ALL of the node's real links are shown (no MIN_LINK_SHARE
  // cut) since inspecting one node is exactly when the small flows matter.
  var selected = BM_STATE.sankeySelectedNode;
  var MIN_LINK_SHARE = 0.08;
  var renderLinks = [];
  if (selected) {
    renderLinks = links.filter(function(l) {
      return (selected.side === 'buyer' && l.sourceCode === selected.code)
        || (selected.side === 'seller' && l.targetCode === selected.code);
    });
  } else {
    var linksByBuyer = {};
    links.forEach(function(link) {
      (linksByBuyer[link.sourceCode] = linksByBuyer[link.sourceCode] || []).push(link);
    });
    Object.keys(linksByBuyer).forEach(function(code) {
      var bNode = buyers.find(function(b) { return b.code === code; });
      var bVal = (bNode && bNode.value) || 1;
      linksByBuyer[code].slice().sort(function(a, b) { return b.value - a.value; })
        .forEach(function(link, i) {
          if (i === 0 || link.value / bVal >= MIN_LINK_SHARE) renderLinks.push(link);
        });
    });
  }

  function allocateSegments(nodes, codeKey) {
    var segByLink = {};
    nodes.forEach(function(node) {
      var nodeLinks = renderLinks.filter(function(l) { return l[codeKey] === node.code; });
      var total = nodeLinks.reduce(function(sum, l) { return sum + l.value; }, 0) || 1;
      var y = node.y;
      nodeLinks.forEach(function(l) {
        var segH = (l.value / total) * node.h;
        segByLink[l.__rid] = { y0: y, y1: y + segH };
        y += segH;
      });
    });
    return segByLink;
  }
  renderLinks.forEach(function(l, i) { l.__rid = i; });
  var buyerSegments = allocateSegments(buyers, 'sourceCode');
  var sellerSegments = allocateSegments(sellers, 'targetCode');

  renderLinks.forEach(function(link) {
    var bNode = buyers.find(b => b.code === link.sourceCode);
    var sNode = sellers.find(s => s.code === link.targetCode);
    var bSeg = buyerSegments[link.__rid];
    var sSeg = sellerSegments[link.__rid];
    if (!bNode || !sNode || !bSeg || !sSeg) return;

    var x0 = bNode.x + bNode.w;
    var x1 = sNode.x;
    var cpx = x0 + (x1 - x0) * 0.5;

    var grad = ctx.createLinearGradient(x0, 0, x1, 0);
    grad.addColorStop(0, link.color || '#8B5CF6');
    grad.addColorStop(1, sNode.color || link.color || '#8B5CF6');

    ctx.beginPath();
    ctx.moveTo(x0, bSeg.y0);
    ctx.bezierCurveTo(cpx, bSeg.y0, cpx, sSeg.y0, x1, sSeg.y0);
    ctx.lineTo(x1, sSeg.y1);
    ctx.bezierCurveTo(cpx, sSeg.y1, cpx, bSeg.y1, x0, bSeg.y1);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.globalAlpha = 0.62;
    ctx.fill();
    ctx.globalAlpha = 1.0;
  });

  // Draw Buyer Nodes (Left Pillar) — a node matching the current selection
  // gets a bright ring so it's clear which one is isolated.
  function drawNode(n, side) {
    var isSelected = selected && selected.side === side && selected.code === n.code;
    ctx.fillStyle = n.color || '#8B5CF6';
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(n.x, n.y, n.w, n.h, 4) : ctx.rect(n.x, n.y, n.w, n.h);
    ctx.fill();
    if (isSelected) {
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#FFFFFF';
      ctx.stroke();
    }

    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 11px Fira Code, monospace';
    ctx.textAlign = 'left';
    ctx.fillText(n.code, n.x + 8, n.y + n.h / 2 + 4);

    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = '9px Inter, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(bmFormatRp(n.value), n.x + n.w - 6, n.y + n.h / 2 + 3);
  }
  buyers.forEach(function(b) { drawNode(b, 'buyer'); });
  sellers.forEach(function(s) { drawNode(s, 'seller'); });

  // Click a buyer/seller to isolate its ribbons; click it again (or the
  // "Tampilkan Semua" button) to go back to showing every material flow.
  // Assigning .onclick/.onmousemove (not addEventListener) is intentional:
  // this canvas element persists across re-renders of just this widget, so
  // addEventListener would stack a new duplicate listener on every click.
  function hitNode(mx, my) {
    var all = buyers.map(function(b) { return { side: 'buyer', node: b }; })
      .concat(sellers.map(function(s) { return { side: 'seller', node: s }; }));
    for (var i = 0; i < all.length; i++) {
      var n = all[i].node;
      if (mx >= n.x && mx <= n.x + n.w && my >= n.y && my <= n.y + n.h) return all[i];
    }
    return null;
  }
  canvas.onclick = function(event) {
    var r = canvas.getBoundingClientRect();
    var hit = hitNode(event.clientX - r.left, event.clientY - r.top);
    if (!hit) return;
    var isSame = selected && selected.side === hit.side && selected.code === hit.node.code;
    bmSankeySelectNode(isSame ? null : { side: hit.side, code: hit.node.code });
  };
  canvas.onmousemove = function(event) {
    var r = canvas.getBoundingClientRect();
    canvas.style.cursor = hitNode(event.clientX - r.left, event.clientY - r.top) ? 'pointer' : 'default';
  };

  var resetBtn = document.getElementById('bm-sankey-reset-btn');
  if (resetBtn) resetBtn.style.display = selected ? 'inline-flex' : 'none';
}

function bmSankeySelectNode(nodeOrNull) {
  BM_STATE.sankeySelectedNode = nodeOrNull;
  bmRenderBrokerDistributionSankey();
}
window.bmSankeySelectNode = bmSankeySelectNode;

// ============================================================
// INTERACTION HANDLERS
// ============================================================

function bmSetTimeframe(tf) {
  BM_STATE.timeframe = tf;
  renderBandarMovementPage();
}

function bmToggleBigMoney(val) {
  BM_STATE.isBigMoney = !!val;
  renderBandarMovementPage();
}

function bmToggleMetric(m) {
  BM_STATE.metric = m;
  renderBandarMovementPage();
}

function bmToggleNet() {
  BM_STATE.isNet = !BM_STATE.isNet;
  bmRenderBrokerSummaryWidget();
}

function bmRemoveBroker(code) {
  BM_STATE.selectedBrokers = BM_STATE.selectedBrokers.filter(c => c !== code);
  bmRenderBrokerFlowWidget();
}

function bmPromptAddBroker() {
  var code = prompt('Masukkan 2 huruf kode broker IDX (contoh: YP, CC, AK, NI, PD):');
  if (!code) return;
  var clean = code.trim().toUpperCase();
  if (clean.length === 2 && BM_STATE.selectedBrokers.indexOf(clean) === -1) {
    BM_STATE.selectedBrokers.push(clean);
    bmRenderBrokerFlowWidget();
  }
}

function bmToggleDropdown(id) {
  var el = document.getElementById(id);
  if (!el) return;
  var isVisible = el.style.display === 'block';
  document.querySelectorAll('.bm-dropdown-menu').forEach(function(m) {
    m.style.display = 'none';
  });
  if (!isVisible) {
    el.style.display = 'block';
  }
}

function bmSetInvestor(val) {
  BM_STATE.investor = val;
  document.querySelectorAll('.bm-dropdown-menu').forEach(function(m) {
    m.style.display = 'none';
  });
  renderBandarMovementPage();
}

function bmSetMarket(val) {
  BM_STATE.market = val;
  document.querySelectorAll('.bm-dropdown-menu').forEach(function(m) {
    m.style.display = 'none';
  });
  renderBandarMovementPage();
}

if (typeof window !== 'undefined' && typeof document !== 'undefined' && typeof document.addEventListener === 'function' && !window._bmDropdownListenerAttached) {
  window._bmDropdownListenerAttached = true;
  document.addEventListener('click', function(e) {
    if (!e.target || !e.target.closest || !e.target.closest('.bm-dropdown-container')) {
      if (document.querySelectorAll) {
        document.querySelectorAll('.bm-dropdown-menu').forEach(function(m) {
          m.style.display = 'none';
        });
      }
    }
  });
}

// Synchronize with GLOBAL_STOCK_CONTEXT (Stock Master 360)
if (typeof window !== 'undefined' && window.GLOBAL_STOCK_CONTEXT && typeof window.GLOBAL_STOCK_CONTEXT.subscribe === 'function') {
  window.GLOBAL_STOCK_CONTEXT.subscribe(function(tk) {
    if (!tk) return;
    var clean = String(tk).toUpperCase().replace(/\.JK$/i, '').replace(/\.US$/i, '').trim();
    if (clean && clean !== BM_STATE.ticker) {
      BM_STATE.ticker = clean;
      var activePage = document.querySelector('.page.on');
      if (activePage && activePage.id === 'page-bandar-movement') {
        renderBandarMovementPage();
      }
    }
  });
}

if (typeof window !== 'undefined') {
  window.BM_STATE = BM_STATE;
  window.bmLoadData = bmLoadData;
  window.renderBandarMovementPage = renderBandarMovementPage;
}

