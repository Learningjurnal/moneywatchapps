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

function mwZoom(delta) {
  if (delta === 0) {
    mwZoomReset();
  } else {
    mwApplyZoom(_mwCurrentZoom + delta);
  }
}
window.mwZoom = mwZoom;
window.mwZoomIn = mwZoomIn;
window.mwZoomOut = mwZoomOut;
window.mwZoomReset = mwZoomReset;

// ── Sidebar & Toolbar Navigation Controller (Accordion, Collapse, Search) ──
var _mwSidebarGroups = {};
var _mwSidebarCollapsed = false;

function sideToggleGroup(btn) {
  if (!btn) return;
  var group = null;
  if (typeof btn.closest === 'function') {
    group = btn.closest('.side-group');
  } else if (btn.parentElement) {
    group = btn.parentElement.closest ? btn.parentElement.closest('.side-group') : btn.parentElement;
  }
  if (!group && btn.classList && btn.classList.contains('side-group')) {
    group = btn;
  }
  if (!group) return;
  
  var isOpen = group.classList.contains('open');
  if (isOpen) {
    group.classList.remove('open');
  } else {
    group.classList.add('open');
  }
  
  // Simpan preferensi pengguna ke localStorage
  var groupKey = group.getAttribute('data-group');
  if (groupKey) {
    try {
      var saved = JSON.parse(localStorage.getItem('mw_side_groups') || '{}');
      saved[groupKey] = !isOpen;
      localStorage.setItem('mw_side_groups', JSON.stringify(saved));
    } catch(e){}
  }
}

function sideToggleCollapse() {
  var sideNav = document.getElementById('side-nav');
  if (!sideNav) return;
  
  _mwSidebarCollapsed = !sideNav.classList.contains('collapsed');
  sideNav.classList.toggle('collapsed', _mwSidebarCollapsed);
  
  try {
    localStorage.setItem('mw_side_collapsed', _mwSidebarCollapsed ? '1' : '0');
  } catch(e){}
}

function sideNavFilter(query) {
  var q = (query || '').trim().toLowerCase();
  var sideNav = document.getElementById('side-nav');
  if (!sideNav) return;
  
  var allButtons = sideNav.querySelectorAll('.side-group-items button, .side-nav-scroll > button');
  var groups = sideNav.querySelectorAll('.side-group');
  
  if (!q) {
    // Kembalikan ke state awal
    allButtons.forEach(function(b){ b.classList.remove('side-hit-hidden'); });
    // Pulihkan status buka/tutup grup dari localStorage
    sideRestoreGroupStates();
    return;
  }
  
  // Filter setiap tombol
  groups.forEach(function(grp){
    var groupButtons = grp.querySelectorAll('.side-group-items button');
    var hasMatchInGroup = false;
    
    groupButtons.forEach(function(b){
      var txt = (b.textContent || '').toLowerCase();
      if (txt.indexOf(q) !== -1) {
        b.classList.remove('side-hit-hidden');
        hasMatchInGroup = true;
      } else {
        b.classList.add('side-hit-hidden');
      }
    });
    
    // Jika ada item yang cocok dalam grup, buka grup tersebut otomatis
    if (hasMatchInGroup) {
      grp.classList.add('open');
    }
  });
  
  // Periksa tombol level atas
  var topButtons = sideNav.querySelectorAll('.side-nav-scroll > button');
  topButtons.forEach(function(b){
    var txt = (b.textContent || '').toLowerCase();
    if (txt.indexOf(q) !== -1) {
      b.classList.remove('side-hit-hidden');
    } else {
      b.classList.add('side-hit-hidden');
    }
  });
}

function sideRestoreGroupStates() {
  try {
    var isCollapsed = localStorage.getItem('mw_side_collapsed') === '1';
    var sideNav = document.getElementById('side-nav');
    if (sideNav && isCollapsed) {
      sideNav.classList.add('collapsed');
      _mwSidebarCollapsed = true;
    }
    
    var savedGroups = JSON.parse(localStorage.getItem('mw_side_groups') || '{}');
    var groups = document.querySelectorAll('.side-group');
    groups.forEach(function(grp){
      var key = grp.getAttribute('data-group');
      if (key && savedGroups[key] !== undefined) {
        if (savedGroups[key]) grp.classList.add('open');
        else grp.classList.remove('open');
      } else {
        grp.classList.add('open');
      }
    });
  } catch(e){}
}

// Inisialisasi event delegation untuk tombol header accordion sidebar
document.addEventListener('click', function(e) {
  var toggleBtn = e.target.closest ? e.target.closest('.side-sec-toggle') : null;
  if (toggleBtn && !toggleBtn.getAttribute('onclick')) {
    sideToggleGroup(toggleBtn);
  }
});

// Inisialisasi shortcut keyboard (Ctrl+K / Cmd+K) untuk mencari menu di sidebar
document.addEventListener('keydown', function(e) {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
    var searchInput = document.getElementById('side-nav-search');
    if (searchInput) {
      e.preventDefault();
      searchInput.focus();
      searchInput.select();
    }
  }
});

// Jalankan pemulihan status saat halaman dimuat
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', sideRestoreGroupStates);
} else {
  setTimeout(sideRestoreGroupStates, 50);
}

window.sideToggleGroup = sideToggleGroup;
window.sideToggleCollapse = sideToggleCollapse;
window.sideNavFilter = sideNavFilter;
window.sideRestoreGroupStates = sideRestoreGroupStates;

// Global window shortcuts
window.sideToggleGroup = sideToggleGroup;
window.sideToggleCollapse = sideToggleCollapse;
window.sideNavFilter = sideNavFilter;
window.sideRestoreGroupStates = sideRestoreGroupStates;
