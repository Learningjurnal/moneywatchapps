// ══════════════════════════════════════════════════════════
// FIREBASE FIRESTORE & AUTHENTICATION CONFIGURATION
// ══════════════════════════════════════════════════════════
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
  }
} catch (err) {
  console.warn("Firebase initialization notice:", err);
}

// Schemaless flag — Firebase Firestore does not require manual SQL migration
window._schemaOutdated = false;
