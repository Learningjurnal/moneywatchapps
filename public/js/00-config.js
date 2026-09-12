// ══════════════════════════════════════════════════════════
// APP CONFIG
// ══════════════════════════════════════════════════════════
// FIX AUDIT (2026-09-12, GitHub secret-scanning alert): this file used to
// also hold a live Firebase Web SDK config (FIREBASE_CONFIG, FIRESTORE_DB_ID,
// getFirebaseDb(), the firebase.initializeApp()/firebase.auth() boot block
// below) — dead code since the Supabase migration (see the SUPABASE section
// below), confirmed by grepping the whole public/js tree for any caller of
// getFirebaseDb()/FIREBASE_CONFIG/_firebaseApp/_firebaseAuth/_firebaseDb:
// none exist. Kept alive until now only because a stale comment claimed the
// KSEI shareholder feature still needed it — it doesn't (34-ksei-shareholders.js
// moved to its own Supabase table, sql/schema_migration.sql, weeks ago).
// Removed entirely, along with the firebase-*-compat.js <script> tags in
// index.html — nothing in this app talks to Firebase anymore.
// getFirestoreUserUid() below is KEPT: despite its name, it never touches
// the Firebase SDK — it's a pure localStorage/sessionStorage-based helper
// still called from public/js/02-storage.js (5 call sites).
var PRIMARY_USER_EMAIL = "Andry.Zuma.Musa@gmail.com";
var _currentUser = null;

function getFirestoreUserUid(user) {
  var u = user || _currentUser;
  if (!u) {
    var raw = null;
    try {
      raw = sessionStorage.getItem('mw_session_user') || localStorage.getItem('mw_session_user');
      if (raw) u = JSON.parse(raw);
    } catch(e){}
  }
  if (u) {
    if (u.isGuest || u.isDemo || u.uid === 'guest_user' || u.uid === 'demo_guest_user' || u.email === 'tamu@moneywatch.pro' || u.email === 'demo@moneywatch.pro') {
      return 'demo_guest_user';
    }
    if (u.email) {
      return 'u_' + encodeURIComponent(u.email.toLowerCase()).replace(/[^a-z0-9_]/g, '_');
    }
    if (u.uid && u.uid !== 'global_user') return u.uid;
    if (u.id) return u.id;
  }
  return null;
}

// Schemaless flag — historical leftover from the Firestore era; kept as a
// no-op flag since something downstream may still read window._schemaOutdated.
window._schemaOutdated = false;

// ══════════════════════════════════════════════════════════
// SUPABASE (per-user data + auth) — see AGENTS.md / migration notes for why
// ══════════════════════════════════════════════════════════
// FIX AUDIT: the Firebase project this app used to depend on (zinc-snowfall-6lcf1)
// was a shared Google AI Studio "Starter Tier" backend used by several
// unrelated apps - the account operating this app only had narrow IAM roles
// on it (Firebase Viewer / Firebase User (Free Tier), no Owner/Editor), so
// the Email/Password sign-in provider could never be added and the app's own
// OAuth redirect domain could never be authorized. Per-user data + auth were
// moved to a Supabase project the user fully owns, where none of that
// applies. Firebase itself has since been removed entirely (see the note
// at the top of this file).
var SUPABASE_URL = "https://kpvteaqnjwkxkhenfqyu.supabase.co";
var SUPABASE_ANON_KEY = "sb_publishable_IpA86ua5CkZ1UettBXR-tw_LUQFTyu0";
var _supabaseClient = null;
function getSupabaseClient() {
  if (_supabaseClient) return _supabaseClient;
  if (typeof supabase !== 'undefined' && supabase.createClient) {
    _supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  return _supabaseClient;
}

// New identity source of truth for the Supabase-backed save/load path in
// 02-storage.js. Supabase's auth.uid() is a real UUID tied to an actual
// authenticated session (unlike getFirestoreUserUid()'s email-string
// derivation), so there's no dot/case-normalization concern here.
function getAppUserId() {
  return (_currentUser && _currentUser.id) || null;
}

// MW-P0-001 Stage 1 (see lib/auth-verify.js): the /api/user-data/* calls in
// 02-storage.js never sent an Authorization header at all, so the server
// had nothing to verify identity against even in principle. This exposes
// the current Supabase session's access token (JWT) so those calls can
// start attaching `Authorization: Bearer <token>`. Returns null for
// guest/demo mode (no real Supabase session exists) or if the SDK/session
// isn't available yet — callers must treat null as "send no header", not
// an error, since Stage 1 never blocks on a missing token anyway.
var _cachedSupabaseSession = null;
try {
  var _sbClientForToken = getSupabaseClient();
  if (_sbClientForToken && _sbClientForToken.auth && _sbClientForToken.auth.onAuthStateChange) {
    _sbClientForToken.auth.onAuthStateChange(function(_event, session) {
      _cachedSupabaseSession = session || null;
    });
  }
} catch (err) {
  console.warn('Supabase auth state listener notice:', err);
}
function getSupabaseAccessToken() {
  try {
    if (_cachedSupabaseSession && _cachedSupabaseSession.access_token) {
      return _cachedSupabaseSession.access_token;
    }
  } catch (err) { /* fall through to null */ }
  return null;
}

// ══════════════════════════════════════════════════════════
// GLOBAL STOCK CONTEXT & UNIFIED DISPATCH SYSTEM
// ══════════════════════════════════════════════════════════
window.GLOBAL_STOCK_CONTEXT = {
  activeTicker: 'BBCA',
  listeners: [],
  getTicker: function() {
    return this.activeTicker || 'BBCA';
  },
  setTicker: function(ticker, source) {
    if (!ticker) return;
    var clean = String(ticker).toUpperCase().trim().replace('.JK', '').replace('.US', '');
    if (!clean) return;
    this.activeTicker = clean;
    
    // Sync into known subsystem globals
    try {
      if (typeof STOCKCHAT_SELECTED_TICKER !== 'undefined') STOCKCHAT_SELECTED_TICKER = clean;
      // NOTE: was `STOCK_INTEL_STATE.selectedTicker = clean` — STOCK_INTEL_STATE
      // never existed anywhere in the codebase (27-stockintel.js's actual state
      // var is the plain string MW_SELECTED_INTEL_TICKER), so this sync branch
      // silently did nothing and the Stock Intelligence Cockpit never received
      // cross-page ticker updates.
      if (typeof MW_SELECTED_INTEL_TICKER !== 'undefined') MW_SELECTED_INTEL_TICKER = clean;
      if (typeof AI_TRADE_STATE !== 'undefined' && AI_TRADE_STATE) AI_TRADE_STATE.selectedTicker = clean;
      if (typeof KSEI_STATE !== 'undefined' && KSEI_STATE) KSEI_STATE.selectedTicker = clean;
    } catch(e) {}

    // Dispatch to registered context subscribers
    this.listeners.forEach(function(fn) {
      try { fn(clean, source); } catch(err) { console.warn('[StockContext] listener err:', err); }
    });

    // Fire browser level custom event
    try {
      window.dispatchEvent(new CustomEvent('mw:stock-context-changed', {
        detail: { ticker: clean, source: source || 'user' }
      }));
    } catch(e) {}
  },
  subscribe: function(fn) {
    if (typeof fn === 'function') {
      this.listeners.push(fn);
      try { fn(this.activeTicker, 'init'); } catch(e) {}
    }
  }
};

window.mwSelectGlobalStock = function(ticker, targetPage) {
  if (!ticker) return;
  var clean = String(ticker).toUpperCase().trim().replace('.JK', '').replace('.US', '');
  if (!clean) return;
  window.GLOBAL_STOCK_CONTEXT.setTicker(clean, 'user-search');

  // If on a stock-specific page, refresh it; otherwise switch to intelligence or target
  var curPage = window._currentPageId || 'dashboard';
  if (targetPage) {
    if (typeof goPage === 'function') goPage(targetPage);
  } else if (curPage === 'dashboard' || curPage === 'daily-brief' || curPage === 'radar') {
    if (typeof goPage === 'function') goPage('stock-intel');
  } else {
    // Already on a dedicated tool page, trigger its refresh
    if (curPage === 'stock-intel' && typeof renderStockIntelPage === 'function') renderStockIntelPage();
    if (curPage === 'stockchat' && typeof renderStockChatPage === 'function') renderStockChatPage();
    if (curPage === 'bandarmology' && typeof renderBandarmologyCockpit === 'function') renderBandarmologyCockpit();
    if (curPage === 'fundamental' && typeof fundSelectTicker === 'function') fundSelectTicker(clean);
    if (curPage === 'technical' && typeof techSelectTicker === 'function') techSelectTicker(clean);
    if (curPage === 'hargawajar' && typeof hwSelectTicker === 'function') hwSelectTicker(clean);
  }
};

