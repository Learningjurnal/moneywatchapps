/**
 * 34-ksei-shareholders.js — MoneyWatch Pro: KSEI 5%+ Shareholders & Free Float Intelligence
 * 
 * 1. Real KSEI Shareholder & Free Float Database (840+ IDX Stocks)
 * 2. On-demand & Periodic Auto-Sync from Google Sheets / KSEI Data Feed
 * 3. Free Float Calculation: 100% - Total Major Shareholders (>5%)
 * 4. Local vs Foreign Ownership Breakdown & Custodian Account Tracing
 * 5. Integrated across Fundamental Suite, Stock Intelligence Cockpit & Dedicated KSEI Explorer
 */

var KSEI_DEFAULT_SHEET_ID = '1GYz3TymfqJCITTWm4QKncRaw2uYLPnyq-VlnVyU8Udg';
var KSEI_DEFAULT_SHEET_URL = 'https://docs.google.com/spreadsheets/d/1GYz3TymfqJCITTWm4QKncRaw2uYLPnyq-VlnVyU8Udg/edit?gid=123456789#gid=123456789';

var KSEI_STATE = {
  data: {},
  metadata: {
    source: 'KSEI (Kustodian Sentral Efek Indonesia) via Google Sheets',
    sheetId: KSEI_DEFAULT_SHEET_ID,
    sheetUrl: KSEI_DEFAULT_SHEET_URL,
    title: 'KEPEMILIKAN EFEK DIATAS 5% BERDASARKAN SID (PUBLIK)',
    reportDate: '26 Aug 2026',
    totalEmiten: 840,
    totalMajorInvestors: 1920,
    lastUpdated: null
  },
  selectedTicker: 'ADRO',
  activeTab: 'stock-view', // 'stock-view' | 'market-scanner' | 'sync-settings'
  scannerFilter: 'all', // 'all' | 'low-ff' | 'high-ff' | 'foreign' | 'accumulating' | 'distributing'
  scannerSearch: '',
  isLoading: false,
  isSyncing: false
};

// ══════════════════════════════════════════════════════════════
// 1. DATA INITIALIZATION & SYNC ENGINE
// ══════════════════════════════════════════════════════════════

/**
 * Load KSEI dataset from cache or backend API
 */
async function kseiInitData(forceRefresh) {
  // 1. Check local cache first for instant response
  if (!forceRefresh && (!KSEI_STATE.data || Object.keys(KSEI_STATE.data).length === 0)) {
    try {
      var cached = localStorage.getItem('MW_KSEI_DATA_CACHE');
      if (cached) {
        var parsed = JSON.parse(cached);
        if (parsed && parsed.data && Object.keys(parsed.data).length > 0) {
          KSEI_STATE.data = parsed.data;
          if (parsed.metadata) KSEI_STATE.metadata = parsed.metadata;
        }
      }
    } catch (e) {
      console.warn('[KSEI] Cache read error:', e);
    }
  }

  // 2. Fetch fresh data from backend
  try {
    KSEI_STATE.isLoading = true;
    var resp = await fetch('/api/ksei/data');
    if (resp.ok) {
      var json = await resp.json();
      if (json.success && json.data) {
        var map = {};
        if (Array.isArray(json.data)) {
          json.data.forEach(function(item) {
            map[item.ticker] = item;
          });
        } else {
          map = json.data;
        }
        KSEI_STATE.data = map;
        if (json.metadata) KSEI_STATE.metadata = json.metadata;

        // Persist to localStorage for ultra-fast startup
        try {
          localStorage.setItem('MW_KSEI_DATA_CACHE', JSON.stringify({
            metadata: KSEI_STATE.metadata,
            data: KSEI_STATE.data
          }));
        } catch (e) {
          // In case quota exceeded, ignore
        }
      }
    }
  } catch (err) {
    console.warn('[KSEI] Error fetching /api/ksei/data, falling back to local snapshot or direct sheet fetch:', err);
    // Fallback: fetch from static file if available
    try {
      var fResp = await fetch('data/ksei-shareholders.json');
      if (fResp.ok) {
        var fJson = await fResp.json();
        if (fJson && fJson.data) {
          KSEI_STATE.data = fJson.data;
          if (fJson.metadata) KSEI_STATE.metadata = fJson.metadata;
        }
      }
    } catch (e) {}
  } finally {
    KSEI_STATE.isLoading = false;
  }
}

/**
 * Trigger on-demand sync from Google Sheets
 */
async function kseiSyncFromSheets(customSheetUrl, customSheetId) {
  KSEI_STATE.isSyncing = true;
  kseiUpdateSyncUI();

  if (typeof showToast === 'function') {
    showToast('⏳ Menghubungi Google Sheets KSEI & memperbarui data kepemilikan...');
  }

  var payload = {};
  if (customSheetUrl) payload.sheetUrl = customSheetUrl;
  if (customSheetId) payload.sheetId = customSheetId;

  try {
    var resp = await fetch('/api/ksei/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!resp.ok) {
      throw new Error('Server returned HTTP ' + resp.status);
    }

    var result = await resp.json();
    if (result.success) {
      if (result.metadata) KSEI_STATE.metadata = result.metadata;
      // Re-fetch fresh data
      await kseiInitData(true);

      if (typeof showToast === 'function') {
        showToast('✅ Berhasil menyinkronkan data KSEI (' + (KSEI_STATE.metadata.totalEmiten || '840+') + ' emiten, ' + (KSEI_STATE.metadata.reportDate || 'terbaru') + ')');
      }

      // Re-render open modals or components
      kseiRefreshActiveViews();
    } else {
      throw new Error(result.error || 'Gagal sinkronisasi');
    }
  } catch (err) {
    console.error('[KSEI Sync Error]', err);
    if (typeof showToast === 'function') {
      showToast('❌ Gagal sinkronisasi data KSEI: ' + err.message);
    }
  } finally {
    KSEI_STATE.isSyncing = false;
    kseiUpdateSyncUI();
  }
}

/**
 * Get KSEI Stock details for any ticker
 */
function getKseiStock(ticker) {
  if (!ticker) return null;
  var tk = String(ticker).toUpperCase().trim().replace('.JK', '').replace('.US', '');
  
  if (KSEI_STATE.data && KSEI_STATE.data[tk]) {
    return KSEI_STATE.data[tk];
  }

  // Fallback defaults if stock has no major >5% shareholders (100% free float or widely held)
  return {
    ticker: tk,
    name: tk + ' Tbk.',
    investors: [],
    totalMajorPercent: 0,
    freeFloat: 100,
    localPercent: 0,
    foreignPercent: 0,
    totalSharesHeld: 0,
    netChangeShares: 0,
    reportDate: KSEI_STATE.metadata ? KSEI_STATE.metadata.reportDate : 'Terbaru',
    isDispersed: true
  };
}

// ══════════════════════════════════════════════════════════════
// 2. MODAL & EXPLORER INTERFACE
// ══════════════════════════════════════════════════════════════

/**
 * Open the dedicated KSEI 5%+ Shareholders & Free Float Explorer Modal
 */
function openKseiModal(ticker) {
  if (ticker) {
    KSEI_STATE.selectedTicker = String(ticker).toUpperCase().trim().replace('.JK', '').replace('.US', '');
  }

  var existing = document.getElementById('ksei-modal-overlay');
  if (!existing) {
    var modalHtml = `
      <div class="overlay" id="ksei-modal-overlay" style="display:flex;align-items:center;justify-content:center;z-index:9999;background:rgba(0,0,0,0.85);backdrop-filter:blur(6px);position:fixed;inset:0;padding:16px">
        <div class="modal" style="width:1080px;max-width:98vw;max-height:92vh;display:flex;flex-direction:column;background:var(--bg);border:1px solid var(--border2);border-radius:12px;box-shadow:0 25px 50px -12px rgba(0,0,0,0.7);overflow:hidden;padding:0">
          
          <!-- MODAL HEADER -->
          <div style="padding:16px 20px;background:var(--bg2);border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px">
            <div style="display:flex;align-items:center;gap:10px">
              <div style="width:36px;height:36px;border-radius:8px;background:rgba(16,185,129,0.15);border:1px solid rgba(16,185,129,0.3);display:flex;align-items:center;justify-content:center;color:#10B981;font-size:18px">
                🏛️
              </div>
              <div>
                <div style="font-size:16px;font-weight:800;color:var(--text);display:flex;align-items:center;gap:8px">
                  KSEI 5%+ Shareholders &amp; Free Float Explorer
                  <span class="badge b-up" style="font-size:10px">REAL KSEI DATA</span>
                </div>
                <div style="font-size:11px;color:var(--text3);display:flex;align-items:center;gap:6px" id="ksei-modal-meta-bar">
                  <span>Memuat data KSEI...</span>
                </div>
              </div>
            </div>

            <!-- MODAL ACTION BUTTONS -->
            <div style="display:flex;align-items:center;gap:8px">
              <button id="btn-ksei-sync" class="btn btn-blue btn-xs" onclick="kseiSyncFromSheets()" style="display:flex;align-items:center;gap:4px;font-size:11px;padding:5px 10px">
                ⚡ Update dari Google Sheets
              </button>
              <button class="mclose" onclick="closeKseiModal()" style="font-size:22px;line-height:1;background:none;border:none;color:var(--text3);cursor:pointer;padding:4px 8px" aria-label="Tutup dialog">×</button>
            </div>
          </div>

          <!-- SUB NAVIGATION TABS -->
          <div style="display:flex;gap:2px;background:var(--bg3);padding:6px 16px;border-bottom:1px solid var(--border);overflow-x:auto">
            <button id="ksei-tab-btn-stock" class="btn btn-xs btn-primary" onclick="kseiSwitchTab('stock-view')" style="font-size:11px;padding:5px 12px;border-radius:6px">
              🔍 Analisis Kepemilikan Emiten
            </button>
            <button id="ksei-tab-btn-scanner" class="btn btn-xs btn-ghost" onclick="kseiSwitchTab('market-scanner')" style="font-size:11px;padding:5px 12px;border-radius:6px">
              📊 Market-Wide Free Float Scanner (840 Saham)
            </button>
            <button id="ksei-tab-btn-settings" class="btn btn-xs btn-ghost" onclick="kseiSwitchTab('sync-settings')" style="font-size:11px;padding:5px 12px;border-radius:6px">
              ⚙️ Pengaturan Sumber Google Sheets
            </button>
          </div>

          <!-- MODAL BODY -->
          <div id="ksei-modal-content" style="padding:20px;overflow-y:auto;flex:1;background:var(--bg)">
            <!-- Injected by renderKseiModalBody -->
          </div>

        </div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);
  } else {
    existing.style.display = 'flex';
  }

  // Ensure data loaded then render
  if (!KSEI_STATE.data || Object.keys(KSEI_STATE.data).length === 0) {
    kseiInitData().then(function() {
      renderKseiModalBody();
      kseiUpdateMetaBar();
    });
  } else {
    renderKseiModalBody();
    kseiUpdateMetaBar();
  }
}

function closeKseiModal() {
  var el = document.getElementById('ksei-modal-overlay');
  if (el) el.style.display = 'none';
}

function kseiSwitchTab(tabName) {
  KSEI_STATE.activeTab = tabName;
  var btnStock = document.getElementById('ksei-tab-btn-stock');
  var btnScanner = document.getElementById('ksei-tab-btn-scanner');
  var btnSettings = document.getElementById('ksei-tab-btn-settings');

  if (btnStock) btnStock.className = tabName === 'stock-view' ? 'btn btn-xs btn-primary' : 'btn btn-xs btn-ghost';
  if (btnScanner) btnScanner.className = tabName === 'market-scanner' ? 'btn btn-xs btn-primary' : 'btn btn-xs btn-ghost';
  if (btnSettings) btnSettings.className = tabName === 'sync-settings' ? 'btn btn-xs btn-primary' : 'btn btn-xs btn-ghost';

  renderKseiModalBody();
}

function kseiUpdateMetaBar() {
  var metaEl = document.getElementById('ksei-modal-meta-bar');
  if (!metaEl) return;
  var m = KSEI_STATE.metadata || {};
  metaEl.innerHTML = `
    <span>📅 Periode: <b>${m.reportDate || '26 Aug 2026'}</b></span>
    <span>•</span>
    <span>🏛️ Terdaftar: <b>${m.totalEmiten || '840'}</b> Emiten</span>
    <span>•</span>
    <span>👥 Investor >5%: <b>${m.totalMajorInvestors || '1.920'}</b> SID</span>
  `;
}

function kseiUpdateSyncUI() {
  var btn = document.getElementById('btn-ksei-sync');
  if (!btn) return;
  if (KSEI_STATE.isSyncing) {
    btn.disabled = true;
    btn.innerHTML = '⏳ Sedang Menyinkronkan...';
  } else {
    btn.disabled = false;
    btn.innerHTML = '⚡ Update dari Google Sheets';
  }
}

function kseiSelectTicker(ticker) {
  if (!ticker) return;
  KSEI_STATE.selectedTicker = String(ticker).toUpperCase().trim().replace('.JK', '').replace('.US', '');
  KSEI_STATE.activeTab = 'stock-view';
  kseiSwitchTab('stock-view');
}

/**
 * Render the inner contents of the KSEI Modal based on active tab
 */
function renderKseiModalBody() {
  var body = document.getElementById('ksei-modal-content');
  if (!body) return;

  if (KSEI_STATE.activeTab === 'market-scanner') {
    renderKseiScannerView(body);
  } else if (KSEI_STATE.activeTab === 'sync-settings') {
    renderKseiSettingsView(body);
  } else {
    renderKseiStockView(body, KSEI_STATE.selectedTicker);
  }
}

// ══════════════════════════════════════════════════════════════
// 3. TAB 1: EMITEN SHAREHOLDER & FREE FLOAT ANALYSIS VIEW
// ══════════════════════════════════════════════════════════════

function renderKseiStockView(container, ticker) {
  var stock = getKseiStock(ticker);
  var allTickers = Object.keys(KSEI_STATE.data || {}).sort();

  var optionsHtml = allTickers.map(function(tk) {
    var item = KSEI_STATE.data[tk];
    return `<option value="${tk}" ${tk === ticker ? 'selected' : ''}>${tk} — ${item.name || tk} (FF: ${item.freeFloat}%)</option>`;
  }).join('');

  // Determine Free Float rating & badge
  var ff = stock.freeFloat || 0;
  var ffBadgeClass = 'b-up';
  var ffRatingText = 'LIKUIDITAS TINGGI / FREE FLOAT LUAS';
  var ffDesc = 'Porsi kepemilikan saham di publik/masyarakat luas (>40%), likuiditas perdagangan harian umumnya sangat tinggi dan risiko intervensi pengendali tunggal terdistribusi.';

  if (ff < 15) {
    ffBadgeClass = 'b-dn';
    ffRatingText = 'SANGAT KETAT / FREE FLOAT KECIL (<15%)';
    ffDesc = 'Saham sangat terkonsentrasi pada pemegang saham utama/pengendali. Likuiditas beredar di pasar reguler terbatas dan rentan terhadap pergerakan harga tajam (volatilitas tinggi).';
  } else if (ff < 30) {
    ffBadgeClass = 'b-amb';
    ffRatingText = 'MODERAT TERKONSENTRASI (15%–30%)';
    ffDesc = 'Mayoritas saham (>70%) dipegang oleh pemegang saham pengendali & institusi besar, memenuhi batas minimum free float regulasi IDX (7.5%).';
  }

  // Net Whales Accumulation / Distribution Status
  var netChange = stock.netChangeShares || 0;
  var changeBadge = '<span class="badge b-neu">Netral (0)</span>';
  if (netChange > 0) {
    changeBadge = `<span class="badge b-up">▲ Akumulasi Whale (+${Number(netChange).toLocaleString('id-ID')} lbr)</span>`;
  } else if (netChange < 0) {
    changeBadge = `<span class="badge b-dn">▼ Distribusi Whale (${Number(netChange).toLocaleString('id-ID')} lbr)</span>`;
  }

  // Render Table Rows for Major Shareholders (>5%)
  var holdersRowsHtml = '';
  if (stock.investors && stock.investors.length > 0) {
    holdersRowsHtml = stock.investors.map(function(inv, idx) {
      var isForeign = inv.status === 'Asing';
      var statusBadge = isForeign 
        ? '<span class="badge" style="background:rgba(139,92,246,0.15);color:#A78BFA;border:1px solid rgba(139,92,246,0.3)">Asing (' + (inv.domicile || 'Foreign') + ')</span>'
        : '<span class="badge" style="background:rgba(59,130,246,0.15);color:#60A5FA;border:1px solid rgba(59,130,246,0.3)">Lokal (Indonesia)</span>';

      var changeText = '<span style="color:var(--text3)">0</span>';
      if (inv.change > 0) {
        changeText = `<span style="color:#10B981;font-weight:700">+${Number(inv.change).toLocaleString('id-ID')}</span>`;
      } else if (inv.change < 0) {
        changeText = `<span style="color:#EF4444;font-weight:700">${Number(inv.change).toLocaleString('id-ID')}</span>`;
      }

      // Sub-accounts breakdown
      var subAccountsHtml = '';
      if (inv.accounts && inv.accounts.length > 0) {
        subAccountsHtml = `
          <div style="margin-top:6px;padding-top:6px;border-top:1px dashed var(--border2);font-size:11px">
            <span style="color:var(--text3);font-weight:600">Rincian Kustodian &amp; Sub-Akun Efek (${inv.accounts.length} Akun):</span>
            <div style="display:flex;flex-direction:column;gap:3px;margin-top:4px">
              ${inv.accounts.map(function(acc) {
                return `
                  <div style="display:flex;justify-content:space-between;padding:2px 6px;background:var(--bg3);border-radius:4px">
                    <span style="color:var(--text2)">🏦 ${acc.custodian || 'Kustodian'} <span style="color:var(--text3)">(${acc.accountName || 'A/C'})</span></span>
                    <span style="font-family:var(--font-mono);font-weight:600;color:var(--text)">${Number(acc.shares).toLocaleString('id-ID')} lbr</span>
                  </div>
                `;
              }).join('')}
            </div>
          </div>
        `;
      }

      return `
        <tr style="border-bottom:1px solid var(--border)">
          <td style="padding:10px 12px;font-weight:700;color:var(--text);vertical-align:top">
            <div style="font-size:13px;display:flex;align-items:center;gap:6px">
              <span style="color:var(--accent);font-size:11px">#${idx + 1}</span>
              ${inv.name}
            </div>
            ${subAccountsHtml}
          </td>
          <td style="padding:10px 12px;text-align:right;vertical-align:top">
            <div style="font-size:14px;font-weight:800;font-family:var(--font-mono);color:var(--accent)">
              ${Number(inv.percentage).toFixed(2)}%
            </div>
          </td>
          <td style="padding:10px 12px;text-align:right;vertical-align:top;font-family:var(--font-mono);color:var(--text)">
            ${Number(inv.shares).toLocaleString('id-ID')}
          </td>
          <td style="padding:10px 12px;text-align:center;vertical-align:top">
            ${statusBadge}
          </td>
          <td style="padding:10px 12px;text-align:right;vertical-align:top;font-family:var(--font-mono)">
            ${changeText}
          </td>
        </tr>
      `;
    }).join('');
  } else {
    holdersRowsHtml = `
      <tr>
        <td colspan="5" style="padding:24px;text-align:center;color:var(--text3)">
          ℹ️ Tidak ada pemegang saham dengan kepemilikan di atas 5% yang tercatat secara tunggal di KSEI. Seluruh saham beredar tersebar di bawah 5% (Free Float 100%).
        </td>
      </tr>
    `;
  }

  // Quick Tickers Buttons
  var quickTicks = ['BBCA', 'BBRI', 'BMRI', 'BBNI', 'TLKM', 'ASII', 'ADRO', 'AMMN', 'AADI', 'BREN', 'GOTO', 'ABMM', 'CUAN', 'WIFI'];
  var quickButtonsHtml = quickTicks.map(function(qt) {
    var isSel = qt === ticker;
    return `<button class="btn btn-xs ${isSel ? 'btn-primary' : 'btn-ghost'}" onclick="kseiSelectTicker('${qt}')" style="font-size:10px;padding:3px 8px">${qt}</button>`;
  }).join(' ');

  container.innerHTML = `
    <!-- TOP TOOLBAR TICKER SELECT -->
    <div style="background:var(--bg2);border:1px solid var(--border);border-radius:10px;padding:12px 16px;margin-bottom:16px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px">
      <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;flex:1">
        <div style="min-width:280px">
          <label style="font-size:10px;font-weight:700;color:var(--text3);display:block;margin-bottom:4px">PILIH EMITEN DARI 840+ SAHAM KSEI:</label>
          <select class="finput fsel" style="width:100%;font-size:13px;padding:6px 10px;background:var(--bg3);border:1px solid var(--border2);border-radius:6px;color:var(--text)" onchange="kseiSelectTicker(this.value)">
            ${optionsHtml}
          </select>
        </div>
        <div>
          <label style="font-size:10px;font-weight:700;color:var(--text3);display:block;margin-bottom:4px">CARI KODE / NAMA SAHAM:</label>
          <div style="display:flex;gap:4px">
            <input type="text" id="ksei-search-direct" list="idx-all-tickers-datalist" class="finput" placeholder="Contoh: ADRO, AMMN..." value="${ticker}" style="width:140px;font-size:12px;text-transform:uppercase" onkeydown="if(event.key==='Enter')kseiSelectTicker(this.value)">
            <button class="btn btn-blue btn-sm" onclick="kseiSelectTicker(document.getElementById('ksei-search-direct').value)" style="padding:0 12px">Cari</button>
          </div>
        </div>
      </div>
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:5px">
        <span style="font-size:10px;color:var(--text3);font-weight:600">Pilihan Cepat Saham:</span>
        <div style="display:flex;gap:4px;flex-wrap:wrap;justify-content:flex-end">
          ${quickButtonsHtml}
        </div>
      </div>
    </div>

    <!-- MAIN EMITEN OVERVIEW CARD -->
    <div style="background:var(--bg2);border:1px solid var(--border);border-radius:10px;padding:18px 20px;margin-bottom:18px">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:14px;margin-bottom:16px">
        <div>
          <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
            <h2 style="font-size:26px;font-weight:800;color:var(--accent);margin:0;letter-spacing:-0.5px">${stock.ticker}</h2>
            <span style="font-size:16px;font-weight:700;color:var(--text)">${stock.name}</span>
            <span class="badge ${ffBadgeClass}" style="font-size:11px">${ffRatingText}</span>
          </div>
          <p style="font-size:12px;color:var(--text2);margin:6px 0 0 0;line-height:1.6;max-width:750px">
            ${ffDesc}
          </p>
        </div>

        <div style="text-align:right;background:var(--bg3);border:1px solid var(--border2);border-radius:8px;padding:10px 16px">
          <div style="font-size:10px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:0.5px">ESTIMASI FREE FLOAT PUBLIK</div>
          <div style="font-size:28px;font-weight:800;font-family:var(--font-mono);color:#10B981;line-height:1.1;margin-top:2px">
            ${Number(stock.freeFloat).toFixed(2)}%
          </div>
          <div style="font-size:11px;color:var(--text3);margin-top:2px">Masyarakat / Saham Beredar &lt;5%</div>
        </div>
      </div>

      <!-- KEY METRICS 4-COLUMN -->
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:12px;margin-bottom:16px">
        <div style="background:var(--bg3);border:1px solid var(--border);border-radius:8px;padding:12px">
          <div style="font-size:11px;color:var(--text3);font-weight:600">Pemegang Saham Mayoritas (&gt;5%)</div>
          <div style="font-size:18px;font-weight:800;color:var(--text);font-family:var(--font-mono);margin-top:4px">
            ${Number(stock.totalMajorPercent).toFixed(2)}%
          </div>
          <div style="font-size:10px;color:var(--text3);margin-top:2px">${stock.investors.length} Investor / Entitas Terdaftar</div>
        </div>

        <div style="background:var(--bg3);border:1px solid var(--border);border-radius:8px;padding:12px">
          <div style="font-size:11px;color:var(--text3);font-weight:600">Porsi Domisili Lokal (&gt;5%)</div>
          <div style="font-size:18px;font-weight:800;color:#3B82F6;font-family:var(--font-mono);margin-top:4px">
            ${Number(stock.localPercent).toFixed(2)}%
          </div>
          <div style="font-size:10px;color:var(--text3);margin-top:2px">Entitas &amp; Investor Domestik</div>
        </div>

        <div style="background:var(--bg3);border:1px solid var(--border);border-radius:8px;padding:12px">
          <div style="font-size:11px;color:var(--text3);font-weight:600">Porsi Domisili Asing (&gt;5%)</div>
          <div style="font-size:18px;font-weight:800;color:#8B5CF6;font-family:var(--font-mono);margin-top:4px">
            ${Number(stock.foreignPercent).toFixed(2)}%
          </div>
          <div style="font-size:10px;color:var(--text3);margin-top:2px">Entitas &amp; Fund Luar Negeri</div>
        </div>

        <div style="background:var(--bg3);border:1px solid var(--border);border-radius:8px;padding:12px">
          <div style="font-size:11px;color:var(--text3);font-weight:600">Status Pergerakan Whales</div>
          <div style="margin-top:6px">
            ${changeBadge}
          </div>
          <div style="font-size:10px;color:var(--text3);margin-top:4px">Dibandingkan periode sebelumnya</div>
        </div>
      </div>

      <!-- VISUAL STACKED SHAREHOLDER COMPOSITION BAR -->
      <div style="background:var(--bg);border:1px solid var(--border2);border-radius:8px;padding:12px 14px">
        <div style="display:flex;justify-content:space-between;align-items:center;font-size:11px;font-weight:700;color:var(--text);margin-bottom:8px">
          <span>KOMPOSISI KEPEMILIKAN SAHAM TERKINI (KSEI SID)</span>
          <span style="color:var(--text3)">Total Saham: 100%</span>
        </div>
        
        <!-- Multi-segment visual bar -->
        <div style="display:flex;height:24px;border-radius:6px;overflow:hidden;background:var(--bg3);box-shadow:inset 0 1px 3px rgba(0,0,0,0.4)">
          ${stock.localPercent > 0 ? `
            <div style="width:${stock.localPercent}%;background:linear-gradient(90deg,#2563EB,#3B82F6);display:flex;align-items:center;justify-content:center;color:#fff;font-size:10px;font-weight:800;font-family:var(--font-mono);overflow:hidden;white-space:nowrap;padding:0 4px" title="Lokal >5%: ${stock.localPercent}%">
              ${stock.localPercent >= 10 ? 'Lokal ' + stock.localPercent + '%' : ''}
            </div>
          ` : ''}

          ${stock.foreignPercent > 0 ? `
            <div style="width:${stock.foreignPercent}%;background:linear-gradient(90deg,#7C3AED,#8B5CF6);display:flex;align-items:center;justify-content:center;color:#fff;font-size:10px;font-weight:800;font-family:var(--font-mono);overflow:hidden;white-space:nowrap;padding:0 4px" title="Asing >5%: ${stock.foreignPercent}%">
              ${stock.foreignPercent >= 10 ? 'Asing ' + stock.foreignPercent + '%' : ''}
            </div>
          ` : ''}

          ${stock.freeFloat > 0 ? `
            <div style="width:${stock.freeFloat}%;background:linear-gradient(90deg,#059669,#10B981);display:flex;align-items:center;justify-content:center;color:#fff;font-size:10px;font-weight:800;font-family:var(--font-mono);overflow:hidden;white-space:nowrap;padding:0 4px" title="Free Float Publik: ${stock.freeFloat}%">
              ${stock.freeFloat >= 10 ? 'Free Float ' + stock.freeFloat + '%' : ''}
            </div>
          ` : ''}
        </div>

        <!-- Legend -->
        <div style="display:flex;gap:16px;margin-top:10px;font-size:11px;flex-wrap:wrap">
          <div style="display:flex;align-items:center;gap:6px">
            <span style="width:10px;height:10px;border-radius:2px;background:#3B82F6;display:inline-block"></span>
            <span style="color:var(--text2)">Investor Lokal &gt;5%: <b>${stock.localPercent}%</b></span>
          </div>
          <div style="display:flex;align-items:center;gap:6px">
            <span style="width:10px;height:10px;border-radius:2px;background:#8B5CF6;display:inline-block"></span>
            <span style="color:var(--text2)">Investor Asing &gt;5%: <b>${stock.foreignPercent}%</b></span>
          </div>
          <div style="display:flex;align-items:center;gap:6px">
            <span style="width:10px;height:10px;border-radius:2px;background:#10B981;display:inline-block"></span>
            <span style="color:var(--text2)">Free Float Publik / Masyarakat (&lt;5%): <b>${stock.freeFloat}%</b></span>
          </div>
        </div>
      </div>
    </div>

    <!-- SHAREHOLDERS TABLE -->
    <div style="background:var(--bg2);border:1px solid var(--border);border-radius:10px;overflow:hidden">
      <div style="padding:14px 18px;background:var(--bg3);border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
        <div style="font-size:13px;font-weight:700;color:var(--text)">
          📋 Daftar Pemegang Saham di Atas 5% Berdasarkan SID KSEI
        </div>
        <div style="font-size:11px;color:var(--text3)">
          Tanggal Laporan: <b>${stock.reportDate || '26 Aug 2026'}</b>
        </div>
      </div>

      <div style="overflow-x:auto">
        <table style="width:100%;border-collapse:collapse;font-size:12px;text-align:left">
          <thead>
            <tr style="background:rgba(255,255,255,0.02);border-bottom:1px solid var(--border2);color:var(--text3);font-size:10px;text-transform:uppercase;letter-spacing:.5px">
              <th style="padding:10px 12px">Nama Pemegang Saham &amp; Sub-Akun Kustodian</th>
              <th style="padding:10px 12px;text-align:right">Porsi (%)</th>
              <th style="padding:10px 12px;text-align:right">Jumlah Lembar Saham</th>
              <th style="padding:10px 12px;text-align:center">Status / Domisili</th>
              <th style="padding:10px 12px;text-align:right">Perubahan Lembar</th>
            </tr>
          </thead>
          <tbody>
            ${holdersRowsHtml}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

// ══════════════════════════════════════════════════════════════
// 4. TAB 2: MARKET-WIDE FREE FLOAT SCANNER
// ══════════════════════════════════════════════════════════════

function renderKseiScannerView(container) {
  var list = Object.values(KSEI_STATE.data || {});
  var filter = KSEI_STATE.scannerFilter || 'all';
  var search = (KSEI_STATE.scannerSearch || '').toLowerCase().trim();

  // Apply filters
  if (filter === 'low-ff') {
    list = list.filter(function(x) { return x.freeFloat < 20 && x.investors.length > 0; });
  } else if (filter === 'high-ff') {
    list = list.filter(function(x) { return x.freeFloat > 50; });
  } else if (filter === 'foreign') {
    list = list.filter(function(x) { return x.foreignPercent > 30; });
  } else if (filter === 'accumulating') {
    list = list.filter(function(x) { return x.netChangeShares > 0; });
  } else if (filter === 'distributing') {
    list = list.filter(function(x) { return x.netChangeShares < 0; });
  }

  // Apply search query
  if (search) {
    list = list.filter(function(x) {
      if (x.ticker.toLowerCase().includes(search) || (x.name && x.name.toLowerCase().includes(search))) return true;
      return x.investors.some(function(inv) { return inv.name.toLowerCase().includes(search); });
    });
  }

  // Sort by Free Float ascending by default for low-ff, or alphabetical
  if (filter === 'low-ff') {
    list.sort(function(a, b) { return a.freeFloat - b.freeFloat; });
  } else if (filter === 'high-ff') {
    list.sort(function(a, b) { return b.freeFloat - a.freeFloat; });
  } else if (filter === 'accumulating') {
    list.sort(function(a, b) { return b.netChangeShares - a.netChangeShares; });
  } else {
    list.sort(function(a, b) { return a.ticker.localeCompare(b.ticker); });
  }

  var rowsHtml = list.slice(0, 100).map(function(item) {
    var ff = item.freeFloat || 0;
    var ffColor = '#10B981';
    if (ff < 15) ffColor = '#EF4444';
    else if (ff < 30) ffColor = '#F59E0B';

    var chgText = '<span style="color:var(--text3)">-</span>';
    if (item.netChangeShares > 0) {
      chgText = `<span style="color:#10B981;font-weight:700">+${Number(item.netChangeShares).toLocaleString('id-ID')}</span>`;
    } else if (item.netChangeShares < 0) {
      chgText = `<span style="color:#EF4444;font-weight:700">${Number(item.netChangeShares).toLocaleString('id-ID')}</span>`;
    }

    var topHolderName = item.investors && item.investors.length > 0 ? item.investors[0].name : 'Publik / Tersebar';

    return `
      <tr style="border-bottom:1px solid var(--border);cursor:pointer;transition:background .15s" onclick="kseiSelectTicker('${item.ticker}')" class="mw-hover-row">
        <td style="padding:10px 12px;font-weight:800;color:var(--accent)">
          ${item.ticker}
        </td>
        <td style="padding:10px 12px;color:var(--text)">
          <div style="font-weight:600">${item.name || item.ticker}</div>
          <div style="font-size:10px;color:var(--text3)">Top: ${topHolderName}</div>
        </td>
        <td style="padding:10px 12px;text-align:right">
          <span style="font-size:14px;font-weight:800;font-family:var(--font-mono);color:${ffColor}">
            ${Number(item.freeFloat).toFixed(2)}%
          </span>
        </td>
        <td style="padding:10px 12px;text-align:right;font-family:var(--font-mono);color:var(--text)">
          ${Number(item.totalMajorPercent).toFixed(2)}%
        </td>
        <td style="padding:10px 12px;text-align:right;font-family:var(--font-mono);color:#3B82F6">
          ${Number(item.localPercent).toFixed(2)}%
        </td>
        <td style="padding:10px 12px;text-align:right;font-family:var(--font-mono);color:#8B5CF6">
          ${Number(item.foreignPercent).toFixed(2)}%
        </td>
        <td style="padding:10px 12px;text-align:right;font-family:var(--font-mono)">
          ${chgText}
        </td>
        <td style="padding:10px 12px;text-align:center">
          <button class="btn btn-xs btn-blue" onclick="event.stopPropagation();kseiSelectTicker('${item.ticker}')" style="font-size:10px;padding:2px 8px">
            Detail →
          </button>
        </td>
      </tr>
    `;
  }).join('');

  container.innerHTML = `
    <!-- FILTER BAR -->
    <div style="background:var(--bg2);border:1px solid var(--border);border-radius:10px;padding:14px 16px;margin-bottom:16px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px">
      <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
        <span style="font-size:11px;font-weight:700;color:var(--text3);margin-right:4px">FILTER PRESET:</span>
        <button class="btn btn-xs ${filter === 'all' ? 'btn-primary' : 'btn-ghost'}" onclick="kseiSetScannerFilter('all')" style="font-size:11px;padding:4px 10px">Semua (${Object.keys(KSEI_STATE.data || {}).length})</button>
        <button class="btn btn-xs ${filter === 'low-ff' ? 'btn-primary' : 'btn-ghost'}" onclick="kseiSetScannerFilter('low-ff')" style="font-size:11px;padding:4px 10px">⚠️ Free Float Rendah (&lt;20%)</button>
        <button class="btn btn-xs ${filter === 'high-ff' ? 'btn-primary' : 'btn-ghost'}" onclick="kseiSetScannerFilter('high-ff')" style="font-size:11px;padding:4px 10px">🌊 Free Float Tinggi (&gt;50%)</button>
        <button class="btn btn-xs ${filter === 'foreign' ? 'btn-primary' : 'btn-ghost'}" onclick="kseiSetScannerFilter('foreign')" style="font-size:11px;padding:4px 10px">🌐 Dominasi Asing (&gt;30%)</button>
        <button class="btn btn-xs ${filter === 'accumulating' ? 'btn-primary' : 'btn-ghost'}" onclick="kseiSetScannerFilter('accumulating')" style="font-size:11px;padding:4px 10px">▲ Akumulasi Whales</button>
      </div>

      <div style="display:flex;align-items:center;gap:6px">
        <input type="text" id="ksei-scanner-search" class="finput" placeholder="Cari kode/nama/investor..." value="${KSEI_STATE.scannerSearch || ''}" style="width:200px;font-size:12px" oninput="kseiOnScannerSearch(this.value)">
      </div>
    </div>

    <!-- TABLE RESULT -->
    <div style="background:var(--bg2);border:1px solid var(--border);border-radius:10px;overflow:hidden">
      <div style="padding:10px 16px;background:var(--bg3);border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;font-size:11px;color:var(--text3)">
        <span>Menampilkan <b>${Math.min(list.length, 100)}</b> dari <b>${list.length}</b> emiten sesuai filter</span>
        <span>Klik baris saham untuk membuka analisis kepemilikan lengkap</span>
      </div>

      <div style="overflow-x:auto;max-height:520px">
        <table style="width:100%;border-collapse:collapse;font-size:12px;text-align:left">
          <thead style="position:sticky;top:0;background:var(--bg);z-index:2">
            <tr style="border-bottom:1px solid var(--border2);color:var(--text3);font-size:10px;text-transform:uppercase;letter-spacing:.5px">
              <th style="padding:10px 12px">Kode</th>
              <th style="padding:10px 12px">Nama Emiten</th>
              <th style="padding:10px 12px;text-align:right">Free Float (%)</th>
              <th style="padding:10px 12px;text-align:right">Pengendali (&gt;5%)</th>
              <th style="padding:10px 12px;text-align:right">Lokal (%)</th>
              <th style="padding:10px 12px;text-align:right">Asing (%)</th>
              <th style="padding:10px 12px;text-align:right">Net Change Lembar</th>
              <th style="padding:10px 12px;text-align:center">Aksi</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml || '<tr><td colspan="8" style="padding:24px;text-align:center;color:var(--text3)">Tidak ditemukan emiten yang sesuai pencarian.</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function kseiSetScannerFilter(f) {
  KSEI_STATE.scannerFilter = f;
  renderKseiScannerView(document.getElementById('ksei-modal-content'));
}

function kseiOnScannerSearch(val) {
  KSEI_STATE.scannerSearch = val;
  renderKseiScannerView(document.getElementById('ksei-modal-content'));
}

// ══════════════════════════════════════════════════════════════
// 5. TAB 3: GOOGLE SHEETS SETTINGS & SYNC VIEW
// ══════════════════════════════════════════════════════════════

function renderKseiSettingsView(container) {
  var m = KSEI_STATE.metadata || {};
  container.innerHTML = `
    <div style="max-width:720px;margin:0 auto;background:var(--bg2);border:1px solid var(--border);border-radius:10px;padding:24px">
      <div style="font-size:16px;font-weight:800;color:var(--text);margin-bottom:8px;display:flex;align-items:center;gap:8px">
        <span>⚙️ Sumber Data Google Sheets &amp; Konfigurasi Pembaruan</span>
      </div>
      <p style="font-size:12px;color:var(--text2);line-height:1.7;margin-bottom:20px">
        Aplikasi terhubung langsung dengan dokumen Google Sheets yang berisi data <b>KEPEMILIKAN EFEK DIATAS 5% BERDASARKAN SID (PUBLIK)</b> dari KSEI. Anda dapat melakukan sinkronisasi ulang kapan saja ketika dokumen spreadsheet diperbarui.
      </p>

      <div style="background:var(--bg3);border:1px solid var(--border2);border-radius:8px;padding:16px;margin-bottom:20px">
        <div style="font-size:11px;font-weight:700;color:var(--text3);margin-bottom:6px">URL GOOGLE SPREADSHEET SUMBER:</div>
        <input type="text" id="ksei-custom-sheet-url" class="finput" style="width:100%;font-size:12px;padding:8px 10px;background:var(--bg);border:1px solid var(--border2);border-radius:6px;color:var(--text);font-family:var(--font-mono)" value="${m.sheetUrl || KSEI_DEFAULT_SHEET_URL}">
        <div style="font-size:10px;color:var(--text3);margin-top:6px">
          💡 Tips: Pastikan dokumen Google Sheets diatur ke mode akses publik ("Anyone with the link can view").
        </div>
      </div>

      <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:12px;margin-bottom:20px">
        <div style="background:var(--bg);border:1px solid var(--border2);border-radius:8px;padding:12px">
          <div style="font-size:10px;color:var(--text3);font-weight:700">TANGGAL LAPORAN KSEI:</div>
          <div style="font-size:14px;font-weight:800;color:var(--accent);margin-top:4px">${m.reportDate || '26 Aug 2026'}</div>
        </div>
        <div style="background:var(--bg);border:1px solid var(--border2);border-radius:8px;padding:12px">
          <div style="font-size:10px;color:var(--text3);font-weight:700">JUMLAH SAHAM TERCATAT:</div>
          <div style="font-size:14px;font-weight:800;color:#10B981;margin-top:4px">${m.totalEmiten || '840'} Emiten IDX</div>
        </div>
      </div>

      <div style="display:flex;justify-content:flex-end;gap:10px">
        <button class="btn btn-ghost" onclick="document.getElementById('ksei-custom-sheet-url').value='${KSEI_DEFAULT_SHEET_URL}'" style="font-size:12px">
          Reset ke URL Standar
        </button>
        <button class="btn btn-blue" onclick="kseiSyncFromSheets(document.getElementById('ksei-custom-sheet-url').value)" style="font-size:12px;padding:8px 16px;font-weight:700">
          ⚡ Simpan &amp; Tarik Data Sekarang
        </button>
      </div>
    </div>
  `;
}

// ══════════════════════════════════════════════════════════════
// 6. INTEGRATION WIDGETS (FUNDAMENTAL SUITE & STOCK INTEL)
// ══════════════════════════════════════════════════════════════

/**
 * Render KSEI Shareholders and Free Float Widget for Fundamental Suite Tab 10
 */
function renderKseiFundamentalWidget(ticker, targetContainerId) {
  var target = document.getElementById(targetContainerId || 'fund-ksei-container');
  if (!target) return;
  renderKseiStockView(target, ticker || FUND_DATA.ticker || 'BBCA');
}

/**
 * Render compact KSEI Free Float card for Stock Intelligence Cockpit
 */
function renderKseiIntelWidget(ticker) {
  var stock = getKseiStock(ticker);
  var ff = stock.freeFloat || 0;
  var ffColor = '#10B981';
  if (ff < 15) ffColor = '#EF4444';
  else if (ff < 30) ffColor = '#F59E0B';

  var topHolder = stock.investors && stock.investors.length > 0 
    ? (stock.investors[0].name + ' (' + stock.investors[0].percentage.toFixed(1) + '%)') 
    : 'Publik Tersebar (<5%)';

  return `
    <div style="background:var(--bg2);border:1px solid var(--border);border-radius:10px;padding:14px 18px;margin-bottom:16px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
        <div style="display:flex;align-items:center;gap:6px">
          <span style="font-size:16px">🏛️</span>
          <span style="font-size:12px;font-weight:800;color:var(--text);letter-spacing:.3px">STRUKTUR KEPEMILIKAN &amp; FREE FLOAT (KSEI)</span>
          <span class="badge b-up" style="font-size:9px">PER ${stock.reportDate || '26 AUG'}</span>
        </div>
        <button class="btn btn-ghost btn-xs" onclick="openKseiModal('${ticker}')" style="font-size:10px;padding:2px 8px;color:var(--accent);border-color:rgba(0,200,255,0.3)">
          Buka Rincian KSEI →
        </button>
      </div>

      <div style="display:grid;grid-template-columns:140px 1fr 1fr;gap:12px;align-items:center">
        <div style="background:var(--bg3);border:1px solid var(--border2);border-radius:8px;padding:8px 12px;text-align:center">
          <div style="font-size:9px;font-weight:700;color:var(--text3);text-transform:uppercase">FREE FLOAT</div>
          <div style="font-size:20px;font-weight:800;font-family:var(--font-mono);color:${ffColor};line-height:1.2;margin-top:2px">
            ${Number(stock.freeFloat).toFixed(1)}%
          </div>
        </div>

        <div style="font-size:11px">
          <div style="color:var(--text3);font-size:10px">Pengendali Utama (>5%):</div>
          <div style="font-weight:700;color:var(--text);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${topHolder}">
            ${topHolder}
          </div>
          <div style="color:var(--text3);font-size:10px;margin-top:2px">
            Lokal: <b style="color:#3B82F6">${stock.localPercent}%</b> · Asing: <b style="color:#8B5CF6">${stock.foreignPercent}%</b>
          </div>
        </div>

        <div>
          <!-- Visual Stacked Bar -->
          <div style="height:12px;border-radius:4px;overflow:hidden;display:flex;background:var(--bg);box-shadow:inset 0 1px 2px rgba(0,0,0,0.5)">
            ${stock.localPercent > 0 ? `<div style="width:${stock.localPercent}%;background:#3B82F6" title="Lokal: ${stock.localPercent}%"></div>` : ''}
            ${stock.foreignPercent > 0 ? `<div style="width:${stock.foreignPercent}%;background:#8B5CF6" title="Asing: ${stock.foreignPercent}%"></div>` : ''}
            ${stock.freeFloat > 0 ? `<div style="width:${stock.freeFloat}%;background:#10B981" title="Free Float: ${stock.freeFloat}%"></div>` : ''}
          </div>
          <div style="display:flex;justify-content:space-between;font-size:9px;color:var(--text3);margin-top:4px">
            <span>Mayoritas: <b>${stock.totalMajorPercent}%</b></span>
            <span>Publik: <b>${stock.freeFloat}%</b></span>
          </div>
        </div>
      </div>
    </div>
  `;
}

function kseiRefreshActiveViews() {
  var overlay = document.getElementById('ksei-modal-overlay');
  if (overlay && overlay.style.display !== 'none') {
    renderKseiModalBody();
    kseiUpdateMetaBar();
  }

  // Refresh fundamental tab if open
  var fundContainer = document.getElementById('fund-ksei-container');
  if (fundContainer) {
    renderKseiStockView(fundContainer, FUND_DATA.ticker || 'BBCA');
  }

  // Refresh intel page if open
  if (typeof renderStockIntelPage === 'function') {
    var pageIntel = document.getElementById('page-stock-intel');
    if (pageIntel && pageIntel.classList.contains('active')) {
      renderStockIntelPage();
    }
  }
}

// Auto-initialize when script is loaded
if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', function() {
    kseiInitData();
  });
}
