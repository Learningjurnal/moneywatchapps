// ║  FRESH START — Bersihkan semua sisa localStorage lama    ║
// ║  Penyimpanan 100% menggunakan Supabase Cloud             ║

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

// Catatan: Ctrl+K / Cmd+K ditangani secara terpadu oleh Command Palette di 29-institutional-ui.js.
// Modul ini menangani Pinned / Favorit Menu Sidebar (mw_pinned_nav_v1).
var MW_PIN_KEY = 'mw_pinned_nav_v1';

function sideGetPinnedPages() {
  try {
    var raw = localStorage.getItem(MW_PIN_KEY);
    var arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch (e) {
    return [];
  }
}

function sideSavePinnedPages(arr) {
  try { localStorage.setItem(MW_PIN_KEY, JSON.stringify(arr || [])); } catch (e) {}
}

function sideRenderPinnedNav() {
  var group = document.getElementById('side-pinned-group');
  var list = document.getElementById('side-pinned-list');
  if (!group || !list) return;

  var pinned = sideGetPinnedPages();
  list.innerHTML = '';

  // Sinkronkan state ikon pin pada seluruh tombol menu
  document.querySelectorAll('#side-nav-scroll .side-group:not(#side-pinned-group) button[data-pin-key]').forEach(function(btn) {
    var key = btn.getAttribute('data-pin-key');
    var pinEl = btn.querySelector('.side-pin-btn');
    if (pinEl) {
      var isPinned = pinned.indexOf(key) !== -1;
      pinEl.classList.toggle('pinned', isPinned);
      pinEl.title = isPinned ? 'Lepas sematan dari Favorit' : 'Sematkan ke Favorit';
    }
  });

  if (!pinned.length) {
    group.style.display = 'none';
    return;
  }

  var count = 0;
  pinned.forEach(function(key) {
    var srcBtn = document.querySelector('#side-nav-scroll .side-group:not(#side-pinned-group) button[data-pin-key="' + key + '"]');
    if (!srcBtn) return;
    var clone = document.createElement('button');
    var iconEl = srcBtn.querySelector('i');
    var labelEl = srcBtn.querySelector('.side-label');
    var iconCls = iconEl ? iconEl.className : 'ti ti-star';
    var labelTxt = labelEl ? labelEl.textContent : key;
    clone.innerHTML = '<i class="' + iconCls + '"></i><span class="side-label">' + labelTxt + '</span>';
    clone.setAttribute('onclick', srcBtn.getAttribute('onclick') || '');
    clone.title = labelTxt + ' (Favorit)';
    list.appendChild(clone);
    count++;
  });

  group.style.display = count > 0 ? '' : 'none';
}

function sideTogglePinPage(key, ev) {
  if (ev && ev.stopPropagation) ev.stopPropagation();
  if (ev && ev.preventDefault) ev.preventDefault();
  var pinned = sideGetPinnedPages();
  var idx = pinned.indexOf(key);
  if (idx !== -1) pinned.splice(idx, 1);
  else pinned.push(key);
  sideSavePinnedPages(pinned);
  sideRenderPinnedNav();
}

function sideInitPinButtons() {
  var btns = document.querySelectorAll('#side-nav-scroll .side-group:not(#side-pinned-group) .side-items button[onclick]');
  btns.forEach(function(btn) {
    if (btn.querySelector('.side-pin-btn')) return;
    var oc = btn.getAttribute('onclick') || '';
    var m = oc.match(/goPage\('([^']+)'/);
    var key = m ? m[1] : oc.slice(0, 32).replace(/[^a-zA-Z0-9_-]/g, '_');
    if (!key) return;
    btn.setAttribute('data-pin-key', key);
    var pin = document.createElement('span');
    pin.className = 'side-pin-btn';
    pin.innerHTML = '<i class="ti ti-pin"></i>';
    pin.setAttribute('role', 'button');
    pin.setAttribute('aria-label', 'Sematkan menu');
    pin.addEventListener('click', function(e) { sideTogglePinPage(key, e); });
    btn.appendChild(pin);
  });
  sideRenderPinnedNav();
}

// Jalankan pemulihan status saat halaman dimuat
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', function() {
    sideRestoreGroupStates();
    sideInitPinButtons();
  });
} else {
  setTimeout(function() {
    sideRestoreGroupStates();
    sideInitPinButtons();
  }, 50);
}

window.sideToggleGroup = sideToggleGroup;
window.sideToggleCollapse = sideToggleCollapse;
window.sideNavFilter = sideNavFilter;
window.sideTogglePinPage = sideTogglePinPage;
window.sideRestoreGroupStates = sideRestoreGroupStates;

// Global window shortcuts
window.sideToggleGroup = sideToggleGroup;
window.sideToggleCollapse = sideToggleCollapse;
window.sideNavFilter = sideNavFilter;
window.sideRestoreGroupStates = sideRestoreGroupStates;
