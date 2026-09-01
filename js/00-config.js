// ══════════════════════════════════════════════════════════
// FIREBASE FIRESTORE & AUTHENTICATION CONFIGURATION
// ══════════════════════════════════════════════════════════
var PRIMARY_USER_EMAIL = "Andry.Zuma.Musa@gmail.com";

var FIREBASE_CONFIG = {
  apiKey: "AIzaSyAjO1QrHyIuR8T0NM07NWxAgbwjnrbSYXk",
  authDomain: "zinc-snowfall-6lcf1.firebaseapp.com",
  projectId: "zinc-snowfall-6lcf1",
  storageBucket: "zinc-snowfall-6lcf1.firebasestorage.app",
  messagingSenderId: "1097630283503",
  appId: "1:1097630283503:web:eedb1b5fafd56ac16b4d1a"
};

var FIRESTORE_DB_ID = "ai-studio-moneywatchpro-088bcbd5-b0c7-48cf-baee-be4279fd2091";

var _firebaseApp = null;
var _firebaseAuth = null;
var _firebaseDb = null;
var _currentUser = null;

function _configureDbSettings(db) {
  if (db && typeof db.settings === 'function') {
    try {
      db.settings({
        experimentalForceLongPolling: true,
        ignoreUndefinedProperties: true
      });
    } catch(e) {
      // Settings already frozen or already initialized
    }
  }
}

function getFirebaseDb() {
  if (_firebaseDb) return _firebaseDb;
  if (typeof firebase !== 'undefined') {
    if (!_firebaseApp) {
      try {
        _firebaseApp = firebase.initializeApp(FIREBASE_CONFIG);
      } catch(e) {
        _firebaseApp = firebase.app();
      }
    }
    try {
      _firebaseDb = firebase.app().firestore(FIRESTORE_DB_ID);
    } catch(e) {
      try {
        _firebaseDb = firebase.firestore();
      } catch(e2) {
        console.warn("Firestore fallback init:", e2);
      }
    }
    if (_firebaseDb) {
      _configureDbSettings(_firebaseDb);
    }
  }
  return _firebaseDb;
}

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
    if (u.email) {
      return 'u_' + encodeURIComponent(u.email.toLowerCase()).replace(/[^a-z0-9_]/g, '_');
    }
    if (u.uid && u.uid !== 'global_user' && u.uid !== 'guest_user') return u.uid;
    if (u.id) return u.id;
  }
  return 'u_' + encodeURIComponent(PRIMARY_USER_EMAIL.toLowerCase()).replace(/[^a-z0-9_]/g, '_');
}

try {
  if (typeof firebase !== 'undefined') {
    _firebaseApp = firebase.initializeApp(FIREBASE_CONFIG);
    _firebaseAuth = firebase.auth();
    try {
      _firebaseDb = firebase.app().firestore(FIRESTORE_DB_ID);
    } catch(e) {
      try {
        _firebaseDb = firebase.firestore();
      } catch(e2) {
        console.warn("Firestore fallback init:", e2);
      }
    }
    if (_firebaseDb) {
      _configureDbSettings(_firebaseDb);
    }
    if (_firebaseDb && typeof _firebaseDb.enablePersistence === 'function') {
      _firebaseDb.enablePersistence({ synchronizeTabs: true }).catch(function(err) {
        if (err && err.code === 'failed-precondition') {
          console.warn('Firestore persistence notice: multiple tabs open');
        } else if (err && err.code === 'unimplemented') {
          console.warn('Firestore persistence not supported in this browser environment');
        }
      });
    }
  }
} catch (err) {
  console.warn("Firebase initialization notice:", err);
}

// Schemaless flag — Firebase Firestore does not require manual SQL migration
window._schemaOutdated = false;

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
      if (typeof STOCK_INTEL_STATE !== 'undefined' && STOCK_INTEL_STATE) STOCK_INTEL_STATE.selectedTicker = clean;
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

