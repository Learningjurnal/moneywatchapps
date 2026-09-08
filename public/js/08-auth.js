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

  try{
    var urlParams = (typeof window !== 'undefined' && window.location && window.location.search) ? new URLSearchParams(window.location.search) : null;
    var targetPage = urlParams ? urlParams.get('page') : null;
    if(targetPage && typeof goPage === 'function'){
      goPage(targetPage);
    } else if(typeof renderPage==='function' && typeof currentPage!=='undefined') {
      renderPage(currentPage);
    }
  }catch(e){
    try{ if(typeof renderPage==='function' && typeof currentPage!=='undefined') renderPage(currentPage); }catch(e2){}
  }
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

// Terjemahkan pesan error umum Supabase Auth ke Bahasa Indonesia yang lebih
// jelas untuk pengguna - Supabase mengembalikan pesan bahasa Inggris apa
// adanya (mis. "Email not confirmed", "email rate limit exceeded").
function _translateSupabaseAuthError(err){
  var raw = (err && err.message) || '';
  var code = (err && err.code) || '';
  var lower = raw.toLowerCase();
  if(code === 'email_not_confirmed' || lower.indexOf('email not confirmed') !== -1){
    return 'Email belum dikonfirmasi. Cek inbox Anda dan klik link konfirmasi dari Supabase sebelum login.';
  }
  if(lower.indexOf('rate limit') !== -1){
    return 'Terlalu banyak percobaan dalam waktu singkat (batas pengiriman email Supabase). Tunggu beberapa saat lalu coba lagi.';
  }
  if(code === 'invalid_credentials' || lower.indexOf('invalid login credentials') !== -1){
    return 'Email atau password salah.';
  }
  if(lower.indexOf('user already registered') !== -1 || lower.indexOf('already registered') !== -1){
    return 'Email ini sudah terdaftar. Coba login, atau gunakan "Reset via kode" jika lupa password.';
  }
  return raw || 'Terjadi kesalahan tidak diketahui.';
}

// ── Login via Supabase Auth ──
// FIX AUDIT: was Firebase Auth with a "direct session" fallback for when
// the Email/Password provider was disabled. That fallback is exactly what
// was silently producing unauthenticated sessions with no real write
// access - moved to Supabase, which has Email/Password enabled by default
// on a project the user actually owns, so no fallback is needed: a login
// failure is now a real, reportable error instead of a fake session
// pretending to work.
function authDoLogin(){
  var uInput=(el('auth-username')&&el('auth-username').value||'').trim();
  var pInput=(el('auth-password')&&el('auth-password').value||'');
  if(!uInput||!pInput){ authShowErr('Isi email dan password.'); return; }
  var btn=el('auth-login-btn');
  if(btn){ btn.disabled=true; btn.textContent='Masuk...'; }

  var client = typeof getSupabaseClient === 'function' ? getSupabaseClient() : null;
  if(!client){
    if(btn){ btn.disabled=false; btn.textContent='Masuk \u2192'; }
    authShowErr('Supabase belum siap. Coba muat ulang halaman.');
    return;
  }

  client.auth.signInWithPassword({ email: uInput, password: pInput })
    .then(function(result){
      if(btn){ btn.disabled=false; btn.textContent='Masuk \u2192'; }
      if(result.error) throw result.error;
      var user = result.data.user;
      if (typeof resetUserPortfolioState === 'function') {
        resetUserPortfolioState();
      }
      try {
        localStorage.removeItem('mw_local_data_v2');
        localStorage.removeItem('mw_emergency_backup_v2');
      } catch(e){}
      _currentUser = {
        id: user.id,
        email: user.email,
        displayName: (user.user_metadata && user.user_metadata.displayName) || user.email.split('@')[0]
      };
      try {
        localStorage.removeItem('mw_explicit_logout');
        sessionStorage.setItem('mw_session_user', JSON.stringify(_currentUser));
        localStorage.setItem('mw_session_user', JSON.stringify(_currentUser));
      } catch(e){}
      var displayName = _currentUser.displayName || _currentUser.email;
      safeCloudBoot().then(function(){
        authShowApp(displayName);
      }).catch(function(){
        authShowApp(displayName);
      });
    })
    .catch(function(err){
      if(btn){ btn.disabled=false; btn.textContent='Masuk \u2192'; }
      authShowErr('Gagal login: ' + _translateSupabaseAuthError(err));
    });
}

// REMOVED (Firebase→Supabase migration): _gmailCanonical()/
// authDoGoogleLogin() existed to reconcile Google Sign-In's email with the
// app's Firebase-derived UID and only worked against Firebase's Google
// provider (which was itself tied to the wrong account and blocked by an
// unauthorized-domain error). Supabase identity is a real UUID
// (auth.uid()), not derived from the email string, so this whole concern
// no longer applies. A Supabase-OAuth version of Google Sign-In can be
// re-added later if the user sets up a Google provider in the Supabase
// dashboard (Authentication → Providers → Google).

// ── Login Mode Tamu / Demo Offline ──
function authDoGuestLogin(){
  _currentUser = {
    uid: 'demo_guest_user',
    email: 'tamu@moneywatch.pro',
    displayName: 'Tamu / Demo',
    isGuest: true,
    isDemo: true
  };
  try {
    sessionStorage.setItem('mw_session_user', JSON.stringify(_currentUser));
    localStorage.setItem('mw_session_user', JSON.stringify(_currentUser));
    localStorage.removeItem('mw_explicit_logout');
    localStorage.removeItem('mw_local_data_v2');
    localStorage.removeItem('mw_emergency_backup_v2');
  } catch(e){}
  
  if (typeof resetUserPortfolioState === 'function') {
    resetUserPortfolioState();
  }
  if (typeof loadData === 'function') {
    loadData();
  }
  authShowApp('Mode Tamu (Demo)');
  if (typeof _invalidatePortoCache === 'function') _invalidatePortoCache();
  if (typeof renderPage === 'function' && typeof currentPage !== 'undefined') renderPage(currentPage);
  if (typeof renderCashWidgets === 'function') renderCashWidgets();
  if (typeof buildTickerTape === 'function') buildTickerTape();
}

// ── Daftar akun baru via Supabase Auth ──
function authDoSetup(){
  var u=(el('auth-new-user')&&el('auth-new-user').value||'').trim();
  var p=(el('auth-new-pass')&&el('auth-new-pass').value||'');
  var p2=(el('auth-new-pass2')&&el('auth-new-pass2').value||'');
  if(!u||!u.includes('@')){ authShowErr('Gunakan alamat email yang valid.'); return; }
  if(p.length<6){ authShowErr('Password minimal 6 karakter.'); return; }
  if(p!==p2){ authShowErr('Password tidak cocok.'); return; }
  var setupBtn=document.querySelector('#auth-setup-form .auth-btn:not([data-added])');
  if(setupBtn){ setupBtn.disabled=true; setupBtn.textContent='Membuat akun...'; }

  var client = typeof getSupabaseClient === 'function' ? getSupabaseClient() : null;
  if(!client){
    if(setupBtn){ setupBtn.disabled=false; setupBtn.textContent='Buat Akun \u2192'; }
    authShowErr('Supabase belum siap. Coba muat ulang halaman.');
    return;
  }

  client.auth.signUp({ email: u, password: p })
    .then(function(result){
      if(setupBtn){ setupBtn.disabled=false; setupBtn.textContent='Buat Akun \u2192'; }
      if(result.error) throw result.error;
      var user = result.data.user;
      var hasSession = !!result.data.session;
      var msg=el('auth-setup-msg');
      var sf=el('auth-setup-form');

      // FIX AUDIT: this used to set _currentUser and add a working "Masuk
      // ke Aplikasi" button regardless of hasSession. When the project
      // requires email confirmation (true here - confirmed directly
      // against this project), signUp() creates the account but grants NO
      // session at all: clicking that button called safeCloudBoot() with
      // an id that looks valid but has no real Supabase JWT behind it, so
      // every Supabase read/write silently failed RLS, and the user landed
      // in the app believing they were logged in and synced when they
      // were not. Only treat this as "logged in" when a real session
      // actually exists.
      if(!hasSession){
        if(msg){
          msg.style.color='var(--green)';
          msg.style.background='rgba(0,229,160,.08)';
          msg.style.border='1px solid rgba(0,229,160,.2)';
          msg.innerHTML='✅ Akun berhasil dibuat!<br><br>Cek email Anda dan klik link konfirmasi, lalu kembali ke sini dan login dengan email &amp; password yang baru saja Anda buat.';
        }
        if(sf){
          var btnBack=document.createElement('button');
          btnBack.className='auth-btn';
          btnBack.style.marginTop='12px';
          btnBack.textContent='← Kembali ke Login';
          btnBack.setAttribute('data-added','1');
          btnBack.onclick=function(){ authShowLogin(); };
          sf.appendChild(btnBack);
        }
        return;
      }

      _currentUser = { id: user.id, email: user.email, displayName: user.email.split('@')[0] };
      try {
        sessionStorage.setItem('mw_session_user', JSON.stringify(_currentUser));
        localStorage.setItem('mw_session_user', JSON.stringify(_currentUser));
      } catch(e){}
      if(msg){
        msg.style.color='var(--green)';
        msg.style.background='rgba(0,229,160,.08)';
        msg.style.border='1px solid rgba(0,229,160,.2)';
        msg.innerHTML='✅ Akun berhasil dibuat!<br><br>Klik tombol di bawah untuk langsung masuk.';
      }
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
      if(setupBtn){ setupBtn.disabled=false; setupBtn.textContent='Buat Akun \u2192'; }
      authShowErr('Gagal membuat akun: ' + _translateSupabaseAuthError(err));
    });
}

// ── Reset password via Supabase Auth ──
function authDoReset(){
  var email=(el('auth-reset-code')&&el('auth-reset-code').value||'').trim();
  if(!email||!email.includes('@')){ authShowErr('Masukkan alamat email yang terdaftar.'); return; }
  var client = typeof getSupabaseClient === 'function' ? getSupabaseClient() : null;
  if(!client){ authShowErr('Supabase belum siap.'); return; }

  client.auth.resetPasswordForEmail(email).then(function(result){
    if(result.error) throw result.error;
    var e=el('auth-err');
    if(e){
      e.style.display='block';
      e.style.color='var(--green)';
      e.textContent='✅ Email instruksi reset password telah dikirim.';
    }
  }).catch(function(err){
    authShowErr('Gagal kirim reset: ' + _translateSupabaseAuthError(err));
  });
}

// ── Logout ──
function authLogout(){
  if(!confirm('Yakin ingin logout?')) return;
  // Pastikan seluruh data terakhir (termasuk setoran kas / transaksi baru) tersimpan aman ke cloud & lokal sebelum session ditutup
  if(typeof saveData === 'function'){
    try { saveData(); } catch(e){}
  }
  function _doLogoutUI(){
    _currentUser=null;
    if(typeof resetUserPortfolioState === 'function'){
      resetUserPortfolioState();
    }
    try {
      sessionStorage.removeItem('mw_session_user');
      localStorage.removeItem('mw_session_user');
      localStorage.setItem('mw_explicit_logout', '1');
      localStorage.removeItem('mw_local_data_v2');
      localStorage.removeItem('mw_emergency_backup_v2');
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

  var client = typeof getSupabaseClient === 'function' ? getSupabaseClient() : null;
  if(client){
    client.auth.signOut().then(function(){ _doLogoutUI(); }).catch(function(){ _doLogoutUI(); });
  } else {
    _doLogoutUI();
  }
}

// ── Init auth — pulihkan sesi Supabase yang masih aktif ──
function authInit(){
  var emailField = el('auth-username');
  if(emailField && !emailField.value && typeof PRIMARY_USER_EMAIL !== 'undefined'){
    emailField.value = PRIMARY_USER_EMAIL;
  }

  var client = typeof getSupabaseClient === 'function' ? getSupabaseClient() : null;
  if(!client){
    authShowLogin();
    return;
  }

  // FIX AUDIT (security, Firebase→Supabase migration): this used to have a
  // "cross-device auto-init" shortcut that, absent an explicit-logout flag,
  // silently became the primary user with a fabricated uid - no real
  // authentication involved. That cannot work with Supabase (there is no
  // way to fabricate a valid auth.uid() for RLS), and it was a real
  // security gap anyway: any browser that ever visited the app without
  // logging out first operated AS the primary account. Supabase's own
  // getSession() is now the single source of truth for "is anyone actually
  // logged in" - no session means the login screen, always.
  client.auth.getSession().then(function(result){
    var session = result.data && result.data.session;
    if(session && session.user){
      var user = session.user;
      _currentUser = {
        id: user.id,
        email: user.email,
        displayName: (user.user_metadata && user.user_metadata.displayName) || user.email.split('@')[0]
      };
      try {
        sessionStorage.setItem('mw_session_user', JSON.stringify(_currentUser));
        localStorage.setItem('mw_session_user', JSON.stringify(_currentUser));
      } catch(e){}
      var displayName = _currentUser.displayName || _currentUser.email;
      safeCloudBoot().then(function(){
        authShowApp(displayName);
      }).catch(function(){
        authShowApp(displayName);
      });
    } else {
      authShowLogin();
    }
  }).catch(function(){
    authShowLogin();
  });
}
