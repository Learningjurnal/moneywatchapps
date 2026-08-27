// ╔══════════════════════════════════════════════════════════╗
// ║                   AUTH SYSTEM (FIREBASE)                ║
// ║  Firebase Authentication · session token · safe cloud    ║
// ╚══════════════════════════════════════════════════════════╝

var AUTH = { SESSION_MS: 60 * 60 * 1000, _sesTimer: null, _barTimer: null, _sesStart: 0, _sesExp: 0 };

// ── Auth stubs ──
function authLoadAcc(){ return _currentUser ? {user: _currentUser.email} : null; }
function authSaveAcc(obj){}
function authSaveSession(u){ return {}; }
function authLoadSession(){ return _currentUser ? {user:_currentUser.email, exp: AUTH._sesExp} : null; }
function authClearSession(){ _currentUser=null; AUTH._sesExp=0; }
function authBumpSession(){ if(_currentUser){ AUTH._sesExp = Date.now() + AUTH.SESSION_MS; } }

// ── Show / Hide app ──
function authShowApp(username){
  var overlay = document.getElementById('auth-overlay');
  var app = document.getElementById('main-app');
  if(overlay) overlay.classList.add('hidden');
  if(app) app.style.display='';

  // Show session info
  var si = el('session-info'), su = el('session-user');
  if(si) si.style.display='flex';
  if(su) su.textContent = username;

  // Start session countdown bar
  AUTH._sesStart = Date.now();
  AUTH._sesExp = Date.now() + AUTH.SESSION_MS;
  authStartTimeoutBar();

  try{ if(typeof renderPage==='function' && typeof currentPage!=='undefined') renderPage(currentPage); }catch(e){}
  try{ if(typeof renderCashWidgets==='function') renderCashWidgets(); }catch(e){}
  try{ if(typeof buildTickerTape==='function') buildTickerTape(); }catch(e){}

  // Activity listeners reset timer
  ['click','keydown','mousemove'].forEach(function(ev){
    document.addEventListener(ev, authBumpSession, {passive:true});
  });

  // Auto-logout check
  if(AUTH._sesTimer) clearInterval(AUTH._sesTimer);
  AUTH._sesTimer = setInterval(function(){
    var s = authLoadSession();
    if(!s || (s.exp && Date.now() > s.exp)){ authLogout(); }
  }, 60000);
}

function authStartTimeoutBar(){
  var bar = el('auth-timeout-bar');
  if(!bar) return;
  if(AUTH._barTimer) clearInterval(AUTH._barTimer);
  AUTH._barTimer = setInterval(function(){
    var s = authLoadSession();
    if(!s){ clearInterval(AUTH._barTimer); return; }
    var remaining = s.exp - Date.now();
    var pct = Math.max(0, (remaining / AUTH.SESSION_MS) * 100);
    bar.style.width = pct + '%';
    bar.style.background = pct < 20 ? '#e21d48' : pct < 50 ? '#ffc107' : 'var(--accent)';
  }, 1000);
}

// ── UI navigation ──
function authShowLogin(){
  el('auth-login-form').style.display='';
  el('auth-setup-form').style.display='none';
  el('auth-reset-form').style.display='none';
  el('auth-err').style.display='none';
  var lk=el('auth-lock-msg'); if(lk) lk.style.display='none';
}

function authShowSetup(msg){
  el('auth-login-form').style.display='none';
  el('auth-setup-form').style.display='';
  el('auth-reset-form').style.display='none';
  el('auth-err').style.display='none';
  var sm = el('auth-setup-msg'); if(sm) sm.textContent = msg||'Buat akun baru';
  var sb = el('auth-setup-back'); if(sb) sb.style.display = '';
}

function authShowReset(){
  el('auth-login-form').style.display='none';
  el('auth-setup-form').style.display='none';
  el('auth-reset-form').style.display='';
  el('auth-err').style.display='none';
}

function authShowErr(msg){
  var e = el('auth-err');
  if(!e) return;
  e.style.display='block'; e.textContent='⚠️ '+msg;
}

// ── Login via Firebase Auth (dengan Auto-Fallback jika Provider Belum Aktif di Firebase Console) ──
function authDoLogin(){
  var uInput=(el('auth-username')&&el('auth-username').value||'').trim();
  var pInput=(el('auth-password')&&el('auth-password').value||'');
  if(!uInput||!pInput){ authShowErr('Isi email dan password.'); return; }
  var btn=el('auth-login-btn');
  if(btn){ btn.disabled=true; btn.textContent='Masuk...'; }

  function _performDirectSession(emailStr){
    _currentUser = {
      uid: 'u_' + encodeURIComponent(emailStr.toLowerCase()).replace(/[^a-z0-9_]/g, '_'),
      email: emailStr,
      displayName: emailStr.split('@')[0],
      isDirect: true
    };
    try {
      sessionStorage.setItem('mw_session_user', JSON.stringify(_currentUser));
      localStorage.setItem('mw_session_user', JSON.stringify(_currentUser));
    } catch(e){}
    safeCloudBoot().then(function(){
      if(btn){ btn.disabled=false; btn.textContent='Masuk \u2192'; }
      authShowApp(_currentUser.displayName || _currentUser.email);
    }).catch(function(){
      if(btn){ btn.disabled=false; btn.textContent='Masuk \u2192'; }
      authShowApp(_currentUser.displayName || _currentUser.email);
    });
  }

  if(!_firebaseAuth){
    _performDirectSession(uInput);
    return;
  }

  _firebaseAuth.signInWithEmailAndPassword(uInput, pInput)
    .then(function(userCredential){
      if(btn){ btn.disabled=false; btn.textContent='Masuk \u2192'; }
      _currentUser = userCredential.user;
      var sessData = { uid: _currentUser.uid, email: _currentUser.email, displayName: _currentUser.displayName };
      try {
        sessionStorage.setItem('mw_session_user', JSON.stringify(sessData));
        localStorage.setItem('mw_session_user', JSON.stringify(sessData));
      } catch(e){}
      var displayName = _currentUser.displayName || _currentUser.email || 'User';
      safeCloudBoot().then(function(){
        authShowApp(displayName);
      }).catch(function(loadErr){
        authShowApp(displayName);
      });
    })
    .catch(function(err){
      // Jika Email/Password provider belum di-enable di Firebase Console, atau terjadi kendala auth eksternal
      if(err && (err.code === 'auth/operation-not-allowed' || (err.message && err.message.indexOf('operation-not-allowed') !== -1))){
        console.warn('Firebase Email/Password provider disabled di console, auto-fallback ke direct session:', uInput);
        _performDirectSession(uInput);
        return;
      }
      
      if(btn){ btn.disabled=false; btn.textContent='Masuk \u2192'; }
      var msg = err && err.message ? err.message : 'Email atau password salah';
      if(err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential'){
        msg = 'Email atau password salah. Pastikan akun sudah terdaftar di Firebase.';
      }
      authShowErr('Gagal login: ' + msg);
    });
}

// ── Login Mode Tamu / Demo Offline ──
function authDoGuestLogin(){
  _currentUser = {
    uid: 'guest_user',
    email: 'tamu@moneywatch.pro',
    displayName: 'Tamu / Demo',
    isGuest: true
  };
  try {
    sessionStorage.setItem('mw_session_user', JSON.stringify(_currentUser));
    localStorage.setItem('mw_session_user', JSON.stringify(_currentUser));
  } catch(e){}
  
  if(_firebaseAuth){
    _firebaseAuth.signInAnonymously().then(function(res){
      if(res && res.user) _currentUser.uid = res.user.uid;
      safeCloudBoot().then(function(){
        authShowApp('Mode Tamu (Demo)');
      }).catch(function(){
        authShowApp('Mode Tamu (Demo)');
      });
    }).catch(function(){
      safeCloudBoot().then(function(){
        authShowApp('Mode Tamu (Demo)');
      }).catch(function(){
        authShowApp('Mode Tamu (Demo)');
      });
    });
  } else {
    safeCloudBoot().then(function(){
      authShowApp('Mode Tamu (Demo)');
    }).catch(function(){
      authShowApp('Mode Tamu (Demo)');
    });
  }
}

// ── Daftar akun baru via Firebase Auth ──
function authDoSetup(){
  var u=(el('auth-new-user')&&el('auth-new-user').value||'').trim();
  var p=(el('auth-new-pass')&&el('auth-new-pass').value||'');
  var p2=(el('auth-new-pass2')&&el('auth-new-pass2').value||'');
  if(!u||!u.includes('@')){ authShowErr('Gunakan alamat email yang valid.'); return; }
  if(p.length<6){ authShowErr('Password minimal 6 karakter.'); return; }
  if(p!==p2){ authShowErr('Password tidak cocok.'); return; }
  var setupBtn=document.querySelector('#auth-setup-form .auth-btn:not([data-added])');
  if(setupBtn){ setupBtn.disabled=true; setupBtn.textContent='Membuat akun...'; }

  function _performDirectRegister(emailStr){
    _currentUser = {
      uid: 'u_' + encodeURIComponent(emailStr.toLowerCase()).replace(/[^a-z0-9_]/g, '_'),
      email: emailStr,
      displayName: emailStr.split('@')[0],
      isDirect: true
    };
    try {
      sessionStorage.setItem('mw_session_user', JSON.stringify(_currentUser));
      localStorage.setItem('mw_session_user', JSON.stringify(_currentUser));
    } catch(e){}
    safeCloudBoot().then(function(){
      if(setupBtn){ setupBtn.disabled=false; setupBtn.textContent='Buat Akun \u2192'; }
      authShowApp(_currentUser.displayName || _currentUser.email);
    }).catch(function(){
      if(setupBtn){ setupBtn.disabled=false; setupBtn.textContent='Buat Akun \u2192'; }
      authShowApp(_currentUser.displayName || _currentUser.email);
    });
  }

  if(!_firebaseAuth){
    _performDirectRegister(u);
    return;
  }

  _firebaseAuth.createUserWithEmailAndPassword(u, p)
    .then(function(userCredential){
      if(setupBtn){ setupBtn.disabled=false; setupBtn.textContent='Buat Akun \u2192'; }
      _currentUser = userCredential.user;
      var sessData = { uid: _currentUser.uid, email: _currentUser.email, displayName: _currentUser.displayName };
      try {
        sessionStorage.setItem('mw_session_user', JSON.stringify(sessData));
        localStorage.setItem('mw_session_user', JSON.stringify(sessData));
      } catch(e){}
      var msg=el('auth-setup-msg');
      if(msg){
        msg.style.color='var(--green)';
        msg.style.background='rgba(0,229,160,.08)';
        msg.style.border='1px solid rgba(0,229,160,.2)';
        msg.innerHTML='✅ Akun Firebase berhasil dibuat!<br><br>Klik tombol di bawah untuk langsung masuk.';
      }
      var sf=el('auth-setup-form');
      if(sf){
        var btn2=document.createElement('button');
        btn2.className='auth-btn';
        btn2.style.marginTop='12px';
        btn2.textContent='Masuk ke Aplikasi \u2192';
        btn2.setAttribute('data-added','1');
        btn2.onclick=function(){
          safeCloudBoot().then(function(){
            authShowApp(_currentUser.email || 'User');
          });
        };
        sf.appendChild(btn2);
      }
    })
    .catch(function(err){
      if(err && (err.code === 'auth/operation-not-allowed' || (err.message && err.message.indexOf('operation-not-allowed') !== -1))){
        console.warn('Firebase createUser provider disabled di console, auto-fallback:', u);
        _performDirectRegister(u);
        return;
      }
      if(setupBtn){ setupBtn.disabled=false; setupBtn.textContent='Buat Akun \u2192'; }
      authShowErr('Gagal membuat akun: ' + (err && err.message || 'unknown'));
    });
}

// ── Reset password via Firebase ──
function authDoReset(){
  var email=(el('auth-reset-code')&&el('auth-reset-code').value||'').trim();
  if(!email||!email.includes('@')){ authShowErr('Masukkan alamat email yang terdaftar.'); return; }
  if(!_firebaseAuth){ authShowErr('Firebase Auth belum siap.'); return; }

  _firebaseAuth.sendPasswordResetEmail(email).then(function(){
    var e=el('auth-err');
    if(e){
      e.style.display='block';
      e.style.color='var(--green)';
      e.textContent='✅ Email instruksi reset password telah dikirim.';
    }
  }).catch(function(err){
    authShowErr('Gagal kirim reset: ' + (err && err.message || 'unknown'));
  });
}

// ── Logout ──
function authLogout(){
  if(!confirm('Yakin ingin logout?')) return;
  function _doLogoutUI(){
    _currentUser=null;
    try {
      sessionStorage.removeItem('mw_session_user');
      localStorage.removeItem('mw_session_user');
    } catch(e){}
    if(AUTH._sesTimer){ clearInterval(AUTH._sesTimer); AUTH._sesTimer=null; }
    if(AUTH._barTimer){ clearInterval(AUTH._barTimer); AUTH._barTimer=null; }
    var app=document.getElementById('main-app');
    var overlay=document.getElementById('auth-overlay');
    if(app) app.style.display='none';
    if(overlay) overlay.classList.remove('hidden');
    var si=el('session-info'); if(si) si.style.display='none';
    ['auth-username','auth-password'].forEach(function(id){ var e=el(id); if(e) e.value=''; });
    var ae=el('auth-err'); if(ae) ae.style.display='none';
    authShowLogin();
  }

  if(_firebaseAuth){
    _firebaseAuth.signOut().then(function(){ _doLogoutUI(); }).catch(function(){ _doLogoutUI(); });
  } else {
    _doLogoutUI();
  }
}

// ── Init auth — cek Firebase session & direct session ──
function authInit(){
  var emailField = el('auth-username');
  if(emailField && !emailField.value && typeof PRIMARY_USER_EMAIL !== 'undefined'){
    emailField.value = PRIMARY_USER_EMAIL;
  }

  var savedSession = null;
  var isExplicitLogout = false;
  try {
    isExplicitLogout = localStorage.getItem('mw_explicit_logout') === '1';
    var rawSess = sessionStorage.getItem('mw_session_user') || localStorage.getItem('mw_session_user');
    savedSession = JSON.parse(rawSess || 'null');
  } catch(e){}

  if(savedSession && (savedSession.email || savedSession.uid)){
    _currentUser = savedSession;
    var displayName = _currentUser.displayName || _currentUser.email || 'User';
    safeCloudBoot().then(function(){
      authShowApp(displayName);
    }).catch(function(){
      authShowApp(displayName);
    });
    return;
  }

  // Cross-device auto-init: Jika belum ada session di perangkat ini dan belum logout eksplisit,
  // hubungkan langsung ke akun utama Firebase agar data langsung termuat tanpa layar kosong
  if(!isExplicitLogout && typeof PRIMARY_USER_EMAIL !== 'undefined' && PRIMARY_USER_EMAIL){
    _currentUser = {
      uid: 'u_' + encodeURIComponent(PRIMARY_USER_EMAIL.toLowerCase()).replace(/[^a-z0-9_]/g, '_'),
      email: PRIMARY_USER_EMAIL,
      displayName: PRIMARY_USER_EMAIL.split('@')[0],
      isPrimary: true
    };
    try {
      sessionStorage.setItem('mw_session_user', JSON.stringify(_currentUser));
      localStorage.setItem('mw_session_user', JSON.stringify(_currentUser));
    } catch(e){}

    safeCloudBoot().then(function(){
      authShowApp(_currentUser.displayName || _currentUser.email);
    }).catch(function(){
      authShowApp(_currentUser.displayName || _currentUser.email);
    });
    return;
  }

  if(!_firebaseAuth){
    authShowLogin();
    return;
  }
  _firebaseAuth.onAuthStateChanged(function(user){
    if(user){
      _currentUser = user;
      var sessData = { uid: user.uid, email: user.email, displayName: user.displayName };
      try {
        sessionStorage.setItem('mw_session_user', JSON.stringify(sessData));
        localStorage.setItem('mw_session_user', JSON.stringify(sessData));
      } catch(e){}
      var displayName = _currentUser.displayName || _currentUser.email || 'User';
      safeCloudBoot().then(function(){
        authShowApp(displayName);
      }).catch(function(){
        authShowLogin();
      });
    } else {
      if(!_currentUser){
        authShowLogin();
      }
    }
  });
}
