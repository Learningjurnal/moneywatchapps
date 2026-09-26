// APP CONFIG
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

// SUPABASE (per-user data + auth) — see AGENTS.md / migration notes for why
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

// AI SIGNAL REFLECTION LOG — Fase 2 (2026-09-17)
// Dipanggil dari StockChat (41-stockchat-cockpit.js) dan AI Copilot
// (28-decisiontools.js) setiap kali respons AI membawa toolCalls yang
// mengandung "cek_sinyal_teknikal" (lihat server.js, executeAgentTool()) —
// satu-satunya tool yang mengembalikan sinyal TERSTRUKTUR (bukan teks
// bebas AI, yang secara sengaja tidak pernah memberi sinyal definitif,
// lihat Aturan Perilaku #1 di system prompt). Sengaja diletakkan di sini
// (bukan diduplikasi di kedua file chat) supaya logikanya satu sumber.
//
// horizonDays per-signal (bukan satu konstanta global, sesuai keputusan
// desain skema Fase 1): heuristik pertama berbasis jenis sinyal — BUY/
// STRONG BUY dikasih waktu lebih panjang (setup swing-trade dari
// entry/SL/TP berbasis ATR butuh ruang gerak), WATCH/HOLD/AVOID lebih
// pendek (bukan thesis aktif, cuma mengecek apakah penilaiannya berubah).
// Bisa disetel lagi nanti kalau ada data cukup untuk mengevaluasi horizon
// mana yang paling representatif — bukan angka final.
var AI_SIGNAL_LOG_HORIZON_DAYS = {
  'STRONG BUY': 15,
  'BUY': 15,
  'HOLD': 10,
  'WATCH': 10,
  'AVOID': 7
};

async function logAiSignalToReflectionLog(source, toolCalls) {
  try {
    if (!toolCalls || !toolCalls.length) return;
    var uid = (typeof getAppUserId === 'function') ? getAppUserId() : null;
    if (!uid) return; // guest/demo — tidak dicatat (konsisten dgn pola ai_paper_trading), jangan sampai instansiasi Supabase client sia-sia
    var client = (typeof getSupabaseClient === 'function') ? getSupabaseClient() : null;
    if (!client) return; // Supabase belum termuat (mis. dev lokal)

    var signalCalls = toolCalls.filter(function(tc) { return tc && tc.name === 'cek_sinyal_teknikal' && tc.result; });
    for (var i = 0; i < signalCalls.length; i++) {
      var r = signalCalls[i].result;
      // signal:'NO DATA' atau error berarti tidak ada sinyal valid untuk
      // direfleksikan nanti — computeStockSignal() sendiri sudah menolak
      // mengarang sinyal saat data tidak cukup, tidak perlu dicatat.
      if (!r || !r.signal || r.signal === 'NO DATA' || r.error) continue;

      var horizonDays = AI_SIGNAL_LOG_HORIZON_DAYS[r.signal] || 10;
      var emittedAt = new Date();
      var resolveAfter = new Date(emittedAt.getTime() + horizonDays * 24 * 60 * 60 * 1000);

      var result = await client.from('ai_signal_log').insert({
        user_id: uid,
        source: source,
        ticker: r.ticker || signalCalls[i].args?.ticker || '',
        signal_action: r.signal,
        composite_score: (typeof r.compositeScore === 'number') ? r.compositeScore : null,
        // computeStockSignal() menomorkan entry:null untuk sinyal AVOID
        // (tidak ada posisi yang dibuka) — tapi field `price` (harga pasar
        // riil saat sinyal dihitung) TETAP terisi. Fallback ke situ supaya
        // baris AVOID tetap punya harga acuan untuk dihitung return-nya
        // nanti oleh resolveOneAiSignal() (return: "seandainya tetap masuk,
        // apakah AVOID ini benar?"), bukan macet selamanya karena entry_price null.
        entry_price: (typeof r.entry === 'number') ? r.entry : ((typeof r.price === 'number') ? r.price : null),
        stop_loss: (typeof r.sl === 'number') ? r.sl : null,
        take_profit_1: (typeof r.tp1 === 'number') ? r.tp1 : null,
        take_profit_2: (typeof r.tp2 === 'number') ? r.tp2 : null,
        raw_snapshot: r,
        emitted_at: emittedAt.toISOString(),
        horizon_days: horizonDays,
        resolve_after: resolveAfter.toISOString()
      });
      if (result && result.error) console.warn('[AI Signal Log]', result.error.message);
    }
  } catch (e) {
    console.warn('[AI Signal Log]', e && e.message);
  }
}

// AI SIGNAL REFLECTION LOG — JOB RESOLUSI (Fase 2 lanjutan, 2026-09-17)
// Dipanggil sekali per sesi lewat ensureAiSignalLogResolved() (dari
// StockChat/Copilot page-open, mirip pola loadAiCloudState() di
// 38-ai-autonomous-trading.js) — TIDAK ada cron/worker terpisah, app ini
// serverless (Vercel) dan semua akses Supabase memang client-side lewat
// RLS (auth.uid()=user_id), jadi resolusi wajar dijalankan di sesi
// pengguna yang bersangkutan, bukan job global lintas-user.
//
// Alur per baris: ambil histori harga ticker + IHSG (endpoint publik
// /api/idx/history yang sudah ada, bukan endpoint baru) -> cari harga exit
// pada/​setelah resolve_after -> hitung return riil vs benchmark -> minta
// Claude menulis refleksi (/api/ai/signal-reflection, server tidak
// menyentuh Supabase sama sekali) -> update baris jadi 'resolved'.
var AI_SIGNAL_RESOLVE_BATCH_LIMIT = 10; // dibatasi per sesi (tiap baris = 2 fetch histori + 1 panggilan Claude) — sisanya diproses sesi berikutnya
var _aiSignalResolveTriggeredOnce = false;

function ensureAiSignalLogResolved() {
  if (_aiSignalResolveTriggeredOnce) return;
  _aiSignalResolveTriggeredOnce = true;
  if (typeof resolveDueAiSignals === 'function') resolveDueAiSignals();
}

// Titik pertama (>=) dari array points {t,c} yang timestamp-nya >= targetMs
// — dipakai untuk harga EXIT (butuh harga PERTAMA SETELAH horizon lewat,
// bukan harga terdekat ke arah manapun, supaya tidak "mengintip" harga
// sebelum horizon-nya benar-benar selesai).
function _aiSignalFindPointAtOrAfter(points, targetMs) {
  if (!Array.isArray(points)) return null;
  for (var i = 0; i < points.length; i++) {
    if (points[i] && points[i].t >= targetMs && typeof points[i].c === 'number') return points[i];
  }
  return null;
}

// Titik TERAKHIR (<=) dari array points — dipakai untuk harga benchmark
// IHSG pada saat sinyal DIEMIT (emitted_at), bukan exit.
function _aiSignalFindPointAtOrBefore(points, targetMs) {
  if (!Array.isArray(points)) return null;
  var best = null;
  for (var i = 0; i < points.length; i++) {
    if (points[i] && points[i].t <= targetMs && typeof points[i].c === 'number') best = points[i];
  }
  return best;
}

async function resolveDueAiSignals() {
  try {
    var uid = (typeof getAppUserId === 'function') ? getAppUserId() : null;
    var client = (typeof getSupabaseClient === 'function') ? getSupabaseClient() : null;
    if (!uid || !client) return;

    var result = await client.from('ai_signal_log')
      .select('*')
      .eq('user_id', uid)
      .eq('status', 'pending')
      .lte('resolve_after', new Date().toISOString())
      .limit(AI_SIGNAL_RESOLVE_BATCH_LIMIT);
    if (result.error) { console.warn('[AI Signal Resolve]', result.error.message); return; }
    var rows = result.data || [];
    for (var i = 0; i < rows.length; i++) {
      await resolveOneAiSignal(rows[i], client);
    }
  } catch (e) {
    console.warn('[AI Signal Resolve]', e && e.message);
  }
}

async function resolveOneAiSignal(row, client) {
  try {
    // Tidak ada harga acuan sama sekali (seharusnya tidak terjadi lagi
    // sejak fallback ke r.price di logAiSignalToReflectionLog, tapi baris
    // lama sebelum fallback itu ada bisa saja masih null) — tidak bisa
    // dihitung, tandai expired daripada dicoba ulang selamanya.
    if (typeof row.entry_price !== 'number') {
      await client.from('ai_signal_log').update({ status: 'expired', resolved_at: new Date().toISOString() }).eq('id', row.id);
      return;
    }

    var tkResp = await fetch('/api/idx/history/' + encodeURIComponent(row.ticker) + '?tf=1M');
    var tkHist = tkResp.ok ? await tkResp.json() : null;
    var ihsgResp = await fetch('/api/idx/history/' + encodeURIComponent('^JKSE') + '?tf=1M');
    var ihsgHist = ihsgResp.ok ? await ihsgResp.json() : null;
    if (!tkHist || !tkHist.success || !ihsgHist || !ihsgHist.success) return; // gagal ambil data — coba lagi sesi berikutnya, JANGAN tandai expired

    var resolveAfterMs = new Date(row.resolve_after).getTime();
    var emittedAtMs = new Date(row.emitted_at).getTime();
    var exitPoint = _aiSignalFindPointAtOrAfter(tkHist.points, resolveAfterMs);
    var ihsgExitPoint = _aiSignalFindPointAtOrAfter(ihsgHist.points, resolveAfterMs);
    var ihsgEntryPoint = _aiSignalFindPointAtOrBefore(ihsgHist.points, emittedAtMs);
    if (!exitPoint || !ihsgExitPoint || !ihsgEntryPoint) return; // histori 1 bulan belum mencakup rentang ini — coba lagi sesi berikutnya

    var rawReturnPct = Math.round(((exitPoint.c - row.entry_price) / row.entry_price) * 10000) / 100;
    var benchmarkReturnPct = Math.round(((ihsgExitPoint.c - ihsgEntryPoint.c) / ihsgEntryPoint.c) * 10000) / 100;
    var alphaReturnPct = Math.round((rawReturnPct - benchmarkReturnPct) * 100) / 100;

    // AVOID/SELL "menang" kalau harga TURUN (sinyal itu benar mengarahkan
    // menjauh dari kerugian) — kebalikan dari BUY/STRONG BUY. HOLD/WATCH
    // tidak punya arah tegas untuk dinilai menang/kalah, selalu NEUTRAL.
    var outcome = 'NEUTRAL';
    if (row.signal_action === 'BUY' || row.signal_action === 'STRONG BUY') {
      outcome = rawReturnPct > 0.5 ? 'WIN' : (rawReturnPct < -0.5 ? 'LOSS' : 'NEUTRAL');
    } else if (row.signal_action === 'SELL' || row.signal_action === 'AVOID') {
      outcome = rawReturnPct < -0.5 ? 'WIN' : (rawReturnPct > 0.5 ? 'LOSS' : 'NEUTRAL');
    }

    var reflectionText = null;
    var reflectionModel = null;
    try {
      var reflResp = await fetch('/api/ai/signal-reflection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticker: row.ticker,
          signalAction: row.signal_action,
          entryPrice: row.entry_price,
          exitPrice: exitPoint.c,
          rawReturnPct: rawReturnPct,
          benchmarkReturnPct: benchmarkReturnPct,
          alphaReturnPct: alphaReturnPct,
          outcome: outcome,
          rationale: row.rationale || null
        })
      });
      if (reflResp.ok) {
        var reflData = await reflResp.json();
        if (reflData && reflData.success) { reflectionText = reflData.reflection; reflectionModel = reflData.model; }
      }
    } catch (e) { console.warn('[AI Signal Resolve] refleksi gagal, baris tetap diresolusi tanpa teks refleksi:', e && e.message); }

    var updateResult = await client.from('ai_signal_log').update({
      status: 'resolved',
      resolved_at: new Date().toISOString(),
      exit_price: exitPoint.c,
      raw_return_pct: rawReturnPct,
      benchmark_return_pct: benchmarkReturnPct,
      alpha_return_pct: alphaReturnPct,
      outcome: outcome,
      reflection_text: reflectionText,
      reflection_model: reflectionModel
    }).eq('id', row.id);
    if (updateResult && updateResult.error) console.warn('[AI Signal Resolve]', updateResult.error.message);
  } catch (e) {
    console.warn('[AI Signal Resolve]', e && e.message);
  }
}

// AI SIGNAL REFLECTION LOG — Fase 3: injeksi riwayat ke prompt (2026-09-17)
// Dipanggil dari StockChat/Copilot SEBELUM tiap pesan dikirim ke server —
// sama seperti pola aiPaperTrading/xgboostPrediction yang sudah ada
// (server.js TIDAK PERNAH punya akses Supabase sendiri, lihat catatan di
// executeAgentTool() case 'cek_kinerja_ai_trading': server hanya bisa
// melaporkan apa yang browser kirim di userContext). Ambil N sinyal
// TER-RESOLUSI terakhir milik user (lintas ticker — filter per-ticker
// dilakukan di server, di dalam executeAgentTool('cek_sinyal_teknikal'),
// karena ticker yang ditanya baru diketahui setelah pesan diparse di sana).
var AI_SIGNAL_HISTORY_FETCH_LIMIT = 10;

async function getAiSignalHistorySummary() {
  try {
    var uid = (typeof getAppUserId === 'function') ? getAppUserId() : null;
    if (!uid) return [];
    var client = (typeof getSupabaseClient === 'function') ? getSupabaseClient() : null;
    if (!client) return [];

    var result = await client.from('ai_signal_log')
      .select('ticker,signal_action,raw_return_pct,benchmark_return_pct,alpha_return_pct,outcome,reflection_text,resolved_at')
      .eq('user_id', uid)
      .eq('status', 'resolved')
      .order('resolved_at', { ascending: false })
      .limit(AI_SIGNAL_HISTORY_FETCH_LIMIT);
    if (result.error || !result.data) return [];

    return result.data.map(function(r) {
      return {
        ticker: r.ticker,
        signalAction: r.signal_action,
        rawReturnPct: r.raw_return_pct,
        benchmarkReturnPct: r.benchmark_return_pct,
        alphaReturnPct: r.alpha_return_pct,
        outcome: r.outcome,
        reflectionText: r.reflection_text,
        resolvedAt: r.resolved_at
      };
    });
  } catch (e) {
    console.warn('[AI Signal History]', e && e.message);
    return [];
  }
}

// GLOBAL STOCK CONTEXT & UNIFIED DISPATCH SYSTEM
window.GLOBAL_STOCK_CONTEXT = {
  activeTicker: 'BBCA',
  listeners: [],
  getTicker: function() {
    return this.activeTicker || 'BBCA';
  },
  setTicker: function(ticker, source) {
    if (!ticker) return;
    var clean = String(ticker).toUpperCase().trim().replace(/\.JK$/i, '').replace(/\.US$/i, '');
    if (!clean) return;
    var oldTicker = this.activeTicker;
    this.activeTicker = clean;
    
    // 1. Sync into known subsystem globals
    try {
      if (typeof STOCKCHAT_SELECTED_TICKER !== 'undefined') STOCKCHAT_SELECTED_TICKER = clean;
      if (typeof MW_SELECTED_INTEL_TICKER !== 'undefined') MW_SELECTED_INTEL_TICKER = clean;
      if (typeof FUND_DATA !== 'undefined' && FUND_DATA) FUND_DATA.ticker = clean;
      if (typeof TECH_DATA !== 'undefined' && TECH_DATA) TECH_DATA.ticker = clean;
      if (typeof STOCK_DOSSIER_STATE !== 'undefined' && STOCK_DOSSIER_STATE) STOCK_DOSSIER_STATE.ticker = clean;
      if (typeof dossierState !== 'undefined' && dossierState) dossierState.ticker = clean;
      if (typeof AI_TRADE_STATE !== 'undefined' && AI_TRADE_STATE) AI_TRADE_STATE.selectedTicker = clean;
      if (typeof KSEI_STATE !== 'undefined' && KSEI_STATE) KSEI_STATE.selectedTicker = clean;
      if (typeof VS_STATE !== 'undefined' && VS_STATE) VS_STATE.ticker = clean;
    } catch(e) {}

    // 2. Global DOM input synchronization across ALL search inputs and dropdowns
    try {
      if (typeof document !== 'undefined') {
        document.querySelectorAll('.sm360-search-input, #sm360-search-inp').forEach(function(el) {
          el.value = clean;
        });
        ['techTickerInput', 'fundTickerInput', 'dossier-ticker-input', 'intel-search-input', 'stockchat-ticker-inp', 'bt-ticker', 'mr-ticker-input'].forEach(function(id) {
          var el = document.getElementById(id);
          if (el) el.value = clean;
        });
        var sel = document.getElementById('intel-ticker-select');
        if (sel) sel.value = clean;
      }
    } catch(e) {}

    // 3. Update all mounted Stock Master 360 terminal headers immediately
    try {
      var techMount = document.getElementById('tech-sm360-mount');
      if (techMount && typeof renderStockMaster360Nav === 'function') {
        techMount.innerHTML = renderStockMaster360Nav('technical', clean);
      }
      var fundMount = document.getElementById('fund-sm360-mount');
      if (fundMount && typeof renderStockMaster360Nav === 'function') {
        fundMount.innerHTML = renderStockMaster360Nav('fundamental', clean);
      }
    } catch(e) {}

    // 4. Dispatch to registered context subscribers
    this.listeners.forEach(function(fn) {
      try { fn(clean, source, oldTicker); } catch(err) { console.warn('[StockContext] listener err:', err); }
    });

    // 5. Fire browser level custom event
    try {
      if (typeof window !== 'undefined' && window.dispatchEvent) {
        window.dispatchEvent(new CustomEvent('mw:stock-context-changed', {
          detail: { ticker: clean, source: source || 'user', oldTicker: oldTicker }
        }));
      }
    } catch(e) {}
  },
  subscribe: function(fn) {
    if (typeof fn === 'function') {
      this.listeners.push(fn);
      try { fn(this.activeTicker, 'init', this.activeTicker); } catch(e) {}
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

// BOTTOM TOOLBAR STATUS INDICATORS — pengecekan nyata (2026-09-17, audit fix)
// Kedua indikator ini (dot "AI Engine Live" dan dot Supabase di tombol
// Pengaturan & Data) sebelumnya HTML statis — dot hijau permanen tanpa
// pengecekan apa pun, ditemukan lewat audit toolbar AI Engine (INCIDENT_LOG.md
// 2026-09-17). Dipanggil sekali saat boot dari DOMContentLoaded init
// (06-analysis-router.js) — tidak perlu polling terus-menerus, cukup
// mencerminkan status yang benar saat halaman dimuat.

async function checkAiEngineStatus() {
  var dot = document.getElementById('ai-engine-status-dot');
  var label = document.getElementById('ai-engine-status-label');
  if (!dot || !label) return;
  try {
    var res = await fetch('/api/ai/status');
    var data = res.ok ? await res.json() : null;
    if (data && data.available) {
      dot.style.background = '#10b981';
      dot.style.boxShadow = '0 0 6px #10b981';
      label.textContent = 'AI Engine Live';
      if (data.geminiAvailable) {
        label.title = 'Google Gemini API (' + (data.geminiModel || 'gemini-2.5-flash') + ') terkonfigurasi sebagai engine utama.'
          + (data.anthropicAvailable ? ' Backup Anthropic (' + data.anthropicModel + ') siap.' : '')
          + (data.backupAvailable ? ' Backup OpenRouter (' + data.backupModel + ') siap.' : '');
      } else {
        label.title = 'Claude API (' + data.model + ') terkonfigurasi di server — StockChat/Copilot berjalan dengan model Claude sungguhan.'
          + (data.backupAvailable ? ' Backup OpenRouter (' + data.backupModel + ') juga terkonfigurasi kalau Anthropic gagal saat runtime (kredit habis/rate-limit/outage).' : '');
      }
    } else if (data && data.backupAvailable) {
      dot.style.background = '#F59E0B';
      dot.style.boxShadow = '0 0 6px #F59E0B';
      label.textContent = 'AI Engine Backup (OpenRouter)';
      label.title = 'GEMINI_API_KEY dan ANTHROPIC_API_KEY tidak terkonfigurasi di server, tapi OPENROUTER_API_KEY ada — StockChat/Copilot berjalan lewat OpenRouter (' + data.backupModel + ').';
    } else {
      dot.style.background = '#F59E0B';
      dot.style.boxShadow = '0 0 6px #F59E0B';
      label.textContent = 'AI Engine Fallback';
      label.title = 'ANTHROPIC_API_KEY (dan GEMINI_API_KEY / OPENROUTER_API_KEY backup) tidak terkonfigurasi di server — StockChat/Copilot berjalan di mode fallback deterministik (rule-based), bukan model AI sungguhan.';
    }
  } catch (e) {
    dot.style.background = '#EF4444';
    dot.style.boxShadow = '0 0 6px #EF4444';
    label.textContent = 'AI Engine Offline';
    label.title = 'Gagal menghubungi server untuk memeriksa status AI Engine: ' + (e && e.message);
  }
}

async function checkSupabaseCloudStatus() {
  var dot = document.getElementById('sh-topbar-dot');
  if (!dot) return;
  var client = (typeof getSupabaseClient === 'function') ? getSupabaseClient() : null;
  if (!client) {
    dot.style.background = '#EF4444';
    dot.title = 'Supabase SDK gagal termuat — sinkronisasi cloud tidak tersedia di sesi ini.';
    return;
  }
  try {
    // auth.getSession() sengaja dipakai sebagai probe konektivitas: panggilan
    // ringan bawaan SDK (baca sesi lokal + validasi ke server Supabase),
    // tidak butuh login, tidak mengubah apa pun. Timeout 5 detik supaya
    // dot tidak menggantung abu-abu selamanya kalau jaringan macet total.
    await Promise.race([
      client.auth.getSession(),
      new Promise(function(_, reject) { setTimeout(function() { reject(new Error('Timeout 5 detik')); }, 5000); })
    ]);
    dot.style.background = 'var(--green)';
    dot.title = 'Supabase Cloud terkoneksi.';
  } catch (e) {
    dot.style.background = '#EF4444';
    dot.title = 'Supabase Cloud tidak terjangkau: ' + (e && e.message);
  }
}

// GLOBAL SPECIAL NOTATIONS & WATCHLIST BOARD (FCA) SYSTEM
window.GLOBAL_SPECIAL_NOTATIONS = {};
window.GLOBAL_SPECIAL_NOTATIONS_LOADED = false;
// FIX (Regulatory Health Gate, 2026-09-24): dulu tidak ada cara membedakan
// "sudah dicek, memang bersih" dari "belum berhasil dimuat sama sekali" --
// getTickerSpecialNotation() mengembalikan null untuk KEDUANYA. Sekarang
// server mengirim available/isStale eksplisit (lihat fetchIdxSpecialNotations()),
// disimpan di sini supaya konsumen (mis. gate sisi client) bisa membedakan.
window.GLOBAL_SPECIAL_NOTATIONS_AVAILABLE = false;
window.GLOBAL_SPECIAL_NOTATIONS_STALE = false;

window.loadSpecialNotations = async function(force) {
  if (window.GLOBAL_SPECIAL_NOTATIONS_LOADED && !force && Object.keys(window.GLOBAL_SPECIAL_NOTATIONS).length > 0) {
    return window.GLOBAL_SPECIAL_NOTATIONS;
  }
  try {
    var resp = await fetch('/api/idx/special-notations' + (force ? '?force=true' : ''));
    if (resp.ok) {
      var json = await resp.json();
      window.GLOBAL_SPECIAL_NOTATIONS_AVAILABLE = !!(json && json.available);
      window.GLOBAL_SPECIAL_NOTATIONS_STALE = !!(json && json.isStale);
      if (json && json.data) {
        window.GLOBAL_SPECIAL_NOTATIONS = json.data;
        window.GLOBAL_SPECIAL_NOTATIONS_LOADED = true;
        // Broadcast updates if headers are mounted
        if (typeof document !== 'undefined') {
          var activeTk = (window.GLOBAL_STOCK_CONTEXT && window.GLOBAL_STOCK_CONTEXT.getTicker) ? window.GLOBAL_STOCK_CONTEXT.getTicker() : 'BBCA';
          var techMount = document.getElementById('tech-sm360-mount');
          if (techMount && typeof renderStockMaster360Nav === 'function') {
            techMount.innerHTML = renderStockMaster360Nav('technical', activeTk);
          }
          var fundMount = document.getElementById('fund-sm360-mount');
          if (fundMount && typeof renderStockMaster360Nav === 'function') {
            fundMount.innerHTML = renderStockMaster360Nav('fundamental', activeTk);
          }
        }
      }
    }
  } catch(e) {
    console.warn('[SpecialNotation] Gagal memuat notasi khusus:', e && e.message);
  }
  return window.GLOBAL_SPECIAL_NOTATIONS;
};

window.getTickerSpecialNotation = function(ticker) {
  if (!ticker) return null;
  var clean = String(ticker).toUpperCase().trim().replace(/\.JK$/i, '').replace(/\.US$/i, '');
  return (window.GLOBAL_SPECIAL_NOTATIONS && window.GLOBAL_SPECIAL_NOTATIONS[clean]) || null;
};

// Auto-fetch on client boot
if (typeof window !== 'undefined' && typeof setTimeout === 'function') {
  setTimeout(function() {
    if (typeof window.loadSpecialNotations === 'function') {
      window.loadSpecialNotations();
    }
  }, 100);
}


