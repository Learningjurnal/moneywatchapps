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

