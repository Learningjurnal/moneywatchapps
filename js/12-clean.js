// ╔══════════════════════════════════════════════════════════╗
// ║  FRESH START — Bersihkan semua sisa localStorage lama    ║
// ║  Penyimpanan 100% menggunakan Firebase Firestore Cloud   ║
// ╚══════════════════════════════════════════════════════════╝

function mwPurgeLocalState(force) {
  try {
    // Bersihkan seluruh histori transaksi lama dari localStorage browser
    [
      'ihsg_pro_master_v5', 'ihsg_pro_stockb_v6', 'porto_imported_v1', 'ihsg_cash_v1',
      'ihsg_divinvest_v1', 'hw_history', 'hw_state', 'claude_api_key', 'mw_wealth_v1',
      'ihsg_sync_pending', 'mw_fresh_v6', 'mw_theses', 'mw_journals', 'mw_price_alerts_v2',
      'equityHistory', 'ihsg_hidden_metrics', 'mw_clean_zero_v7', 'mw_clean_zero_v8',
      'mw_clean_zero_v10', 'mw_clean_zero_v11', 'ihsg_pro_v7_clean'
    ].forEach(function(k){
      try { localStorage.removeItem(k); } catch(e){}
    });
  } catch (err) {
    console.warn('Local state purge notice:', err);
  }
}

// Jalankan saat load
mwPurgeLocalState(true);

// ── Zoom Controls ──
var MW_ZOOM_DEFAULT = 1.0;
var MW_ZOOM_STEP = 0.05;
var MW_ZOOM_MIN = 0.70;
var MW_ZOOM_MAX = 1.30;
var _mwCurrentZoom = MW_ZOOM_DEFAULT;

function mwApplyZoom(z) {
  z = Math.min(MW_ZOOM_MAX, Math.max(MW_ZOOM_MIN, Math.round(z * 100) / 100));
  _mwCurrentZoom = z;
  var root = document.documentElement;
  if (root) {
    root.style.setProperty('--mw-zoom', String(z));
    root.style.zoom = String(z);
  }
  var elLbl = document.getElementById('mw-zoom-level');
  if (elLbl) elLbl.textContent = Math.round(z * 100) + '%';
}

function mwZoomIn() {
  mwApplyZoom(_mwCurrentZoom + MW_ZOOM_STEP);
}

function mwZoomOut() {
  mwApplyZoom(_mwCurrentZoom - MW_ZOOM_STEP);
}

function mwZoomReset() {
  mwApplyZoom(MW_ZOOM_DEFAULT);
}

// ── Sidebar State (In Memory) ──
var _mwSidebarOpen = { porto: true, tools: true };
var _mwSidebarCollapsed = false;

function mwToggleSideSection(sec) {
  var header = document.querySelector('.nav-section-header[data-sec="' + sec + '"]');
  var items = document.querySelector('.nav-section-items[data-sec="' + sec + '"]');
  if (!items) return;
  var isExpanded = items.style.display !== 'none';
  items.style.display = isExpanded ? 'none' : '';
  if (header) {
    header.setAttribute('aria-expanded', !isExpanded);
    var arr = header.querySelector('.nav-arrow');
    if (arr) arr.textContent = isExpanded ? '▾' : '▴';
  }
  _mwSidebarOpen[sec] = !isExpanded;
}

function mwToggleSidebarCollapse() {
  _mwSidebarCollapsed = !_mwSidebarCollapsed;
  var app = document.querySelector('.app');
  var side = document.querySelector('.sidebar');
  var btn = document.getElementById('side-toggle-btn');
  if (side) side.classList.toggle('collapsed', _mwSidebarCollapsed);
  if (app) app.classList.toggle('sidebar-collapsed', _mwSidebarCollapsed);
  if (btn) {
    btn.setAttribute('aria-label', _mwSidebarCollapsed ? 'Buka Sidebar' : 'Ciutkan Sidebar');
    btn.innerHTML = _mwSidebarCollapsed ? '☰' : '◀';
  }
}
