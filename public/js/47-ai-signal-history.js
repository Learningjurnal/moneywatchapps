/**
 * 47-ai-signal-history.js — AI Signal Reflection Log, Fase 4 (2026-09-17)
 * UI riwayat sinyal AI (StockChat/Copilot) untuk user: daftar sinyal yang
 * pernah dicatat (ai_signal_log), status resolusinya, return riil vs
 * benchmark IHSG, dan refleksi Claude — sisi baca dari Fase 1-3 yang
 * sebelumnya cuma bisa dilihat AI sendiri lewat pastSignals di prompt.
 *
 * Tidak ada API baru: baca langsung dari Supabase client-side (RLS,
 * auth.uid()=user_id) mengikuti pola getAiSignalHistorySummary() di
 * 00-config.js — bedanya di sini menampilkan SEMUA status (pending/
 * resolved/expired), bukan cuma resolved untuk injeksi prompt.
 */

var AI_SIGNAL_HISTORY_PAGE_LIMIT = 100;

async function renderAiSignalHistoryPage() {
  var c = document.getElementById('page-ai-signal-history');
  if (!c) return;

  var uid = (typeof getAppUserId === 'function') ? getAppUserId() : null;
  if (!uid) {
    c.innerHTML = ''
      + '<div class="ptitle">Riwayat Sinyal AI</div>'
      + '<div class="psub" style="margin-bottom:16px">Jejak sinyal teknikal yang pernah dikeluarkan StockChat/Copilot, hasil realisasinya, dan refleksi AI.</div>'
      + '<div class="sm-card" style="text-align:center;padding:32px">'
      + '  <div style="font-size:14px;color:var(--text3)">Fitur ini butuh akun (login), tidak tersedia di Mode Tamu/Demo — riwayat sinyal disimpan per akun lewat Supabase.</div>'
      + '</div>';
    return;
  }

  c.innerHTML = ''
    + '<div class="ptitle">Riwayat Sinyal AI</div>'
    + '<div class="psub" style="margin-bottom:16px">Jejak sinyal teknikal yang pernah dikeluarkan StockChat/Copilot ("cek_sinyal_teknikal"), hasil realisasinya vs IHSG, dan refleksi AI.</div>'
    + '<div id="ai-signal-history-body" class="sm-card" style="text-align:center;padding:24px;color:var(--text3)">Memuat riwayat sinyal...</div>';

  var client = (typeof getSupabaseClient === 'function') ? getSupabaseClient() : null;
  var body = document.getElementById('ai-signal-history-body');
  if (!client) {
    if (body) body.innerHTML = '<div style="color:var(--text3)">Supabase belum termuat — coba muat ulang halaman.</div>';
    return;
  }

  var result = await client.from('ai_signal_log')
    .select('*')
    .eq('user_id', uid)
    .order('emitted_at', { ascending: false })
    .limit(AI_SIGNAL_HISTORY_PAGE_LIMIT);

  if (result.error) {
    if (body) body.innerHTML = aiSignalHistoryRenderErrorHtml(result.error);
    return;
  }

  aiSignalHistoryRenderRows(result.data || []);
}

// Bug lapangan (2026-09-17): user melihat "Gagal memuat riwayat: Could not
// find the table 'public.ai_signal_log' in the schema cache" — pesan
// mentah dari PostgREST (kode PGRST205) yang berarti tabelnya secara
// harfiah belum ada di project Supabase yang tersambung, BUKAN bug query
// di sisi client (nama tabel di sini sudah cocok persis dengan
// sql/schema_migration.sql). Penyebabnya: file migrasi itu cuma skrip SQL
// di repo, tidak pernah otomatis dijalankan ke database Supabase produksi
// mana pun (server.js sengaja nol akses Supabase, tidak ada mekanisme
// migrasi otomatis) — harus dijalankan manual sekali oleh pemilik project
// lewat Supabase SQL Editor. Kode ini tidak bisa memperbaiki itu (tidak
// ada akses ke database Supabase project manapun dari sini), tapi bisa
// mengganti pesan teknis yang membingungkan dengan penjelasan tindakan apa
// yang perlu diambil, sekaligus tetap menampilkan pesan mentah untuk
// developer yang perlu debug lebih lanjut.
function aiSignalHistoryIsMissingTableError(error) {
  if (!error) return false;
  if (error.code === 'PGRST205') return true;
  var msg = String(error.message || '');
  return /could not find the table/i.test(msg) && /ai_signal_log/i.test(msg);
}

function aiSignalHistoryRenderErrorHtml(error) {
  if (aiSignalHistoryIsMissingTableError(error)) {
    return '<div style="color:#EF4444;text-align:left">'
      + '<div style="font-weight:700;margin-bottom:6px">⚠️ Tabel <code>ai_signal_log</code> belum ada di database Supabase</div>'
      + '<div style="color:var(--text3);font-size:12.5px;line-height:1.6">'
      + 'Migrasi <code>sql/schema_migration.sql</code> (bagian <code>ai_signal_log</code>) belum pernah dijalankan di project Supabase ini. '
      + 'Ini bukan bug di aplikasi — jalankan isi migrasi tersebut sekali lewat <b>Supabase Dashboard → SQL Editor</b> pada project yang dipakai aplikasi ini, lalu muat ulang halaman.'
      + '</div>'
      + '<div style="color:var(--text3);font-size:11px;margin-top:8px;opacity:.7">Pesan asli: ' + escapeHtml(error.message) + '</div>'
      + '</div>';
  }
  return '<div style="color:#EF4444">Gagal memuat riwayat: ' + escapeHtml(error.message) + '</div>';
}

function aiSignalHistoryRenderRows(rows) {
  var c = document.getElementById('page-ai-signal-history');
  if (!c) return;

  var totalCount = rows.length;
  var pendingCount = rows.filter(function(r) { return r.status === 'pending'; }).length;
  var resolvedCount = rows.filter(function(r) { return r.status === 'resolved'; }).length;
  var winCount = rows.filter(function(r) { return r.outcome === 'WIN'; }).length;
  var lossCount = rows.filter(function(r) { return r.outcome === 'LOSS'; }).length;
  var winRatePct = (winCount + lossCount) > 0 ? Math.round((winCount / (winCount + lossCount)) * 1000) / 10 : null;
  var resolvedWithAlpha = rows.filter(function(r) { return r.status === 'resolved' && typeof r.alpha_return_pct === 'number'; });
  var avgAlpha = resolvedWithAlpha.length > 0
    ? Math.round((resolvedWithAlpha.reduce(function(sum, r) { return sum + r.alpha_return_pct; }, 0) / resolvedWithAlpha.length) * 100) / 100
    : null;

  var summaryHtml = ''
    + '<div class="sm-card sm-grid-4" style="margin-bottom:16px">'
    + '  <div class="sm-stat-box"><div class="sm-stat-label">Total Sinyal Tercatat</div><div class="sm-stat-val">' + totalCount + '</div></div>'
    + '  <div class="sm-stat-box"><div class="sm-stat-label">Menunggu Resolusi</div><div class="sm-stat-val">' + pendingCount + '</div></div>'
    + '  <div class="sm-stat-box"><div class="sm-stat-label">Win Rate (Resolved)</div><div class="sm-stat-val ' + (winRatePct === null ? '' : (winRatePct >= 50 ? 'sm-text-green' : 'sm-text-red')) + '">' + (winRatePct === null ? '—' : winRatePct + '%') + '</div></div>'
    + '  <div class="sm-stat-box"><div class="sm-stat-label">Rata-rata Alpha vs IHSG</div><div class="sm-stat-val ' + (avgAlpha === null ? '' : (avgAlpha >= 0 ? 'sm-text-green' : 'sm-text-red')) + '">' + (avgAlpha === null ? '—' : (avgAlpha >= 0 ? '+' : '') + avgAlpha + '%') + '</div></div>'
    + '</div>';

  var tableHtml;
  if (!rows.length) {
    tableHtml = '<div class="sm-card" style="text-align:center;padding:32px;color:var(--text3)">Belum ada sinyal tercatat. Tanya sinyal teknikal ticker tertentu lewat StockChat atau AI Copilot untuk mulai mengisi riwayat ini.</div>';
  } else {
    tableHtml = ''
      + '<div class="sm-card">'
      + '  <div style="overflow-x:auto">'
      + '    <table class="tbl" style="width:100%;font-size:12px">'
      + '      <thead><tr><th>Tanggal</th><th>Ticker</th><th>Sumber</th><th>Sinyal</th><th>Status</th><th>Entry → Exit</th><th>Return Riil</th><th>Return IHSG</th><th>Alpha</th><th>Hasil</th><th>Refleksi</th></tr></thead>'
      + '      <tbody>'
      + rows.map(aiSignalHistoryRenderRow).join('')
      + '      </tbody>'
      + '    </table>'
      + '  </div>'
      + '</div>';
  }

  c.innerHTML = ''
    + '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px;flex-wrap:wrap;gap:12px">'
    + '  <div>'
    + '    <div class="ptitle">Riwayat Sinyal AI</div>'
    + '    <div class="psub">Jejak sinyal teknikal yang pernah dikeluarkan StockChat/Copilot ("cek_sinyal_teknikal"), hasil realisasinya vs IHSG, dan refleksi AI.</div>'
    + '  </div>'
    + '  <button class="btn btn-ghost btn-xs" onclick="aiSignalHistoryRunResolveNow()">↻ Jalankan Resolusi Sekarang</button>'
    + '</div>'
    + summaryHtml
    + tableHtml;
}

var AI_SIGNAL_BADGE_CLASS = {
  'STRONG BUY': 'b-up', 'BUY': 'b-up', 'HOLD': 'b-neu', 'WATCH': 'b-neu',
  'AVOID': 'b-dn', 'SELL': 'b-dn', 'REVIEW': 'b-amb'
};
var AI_SIGNAL_OUTCOME_BADGE_CLASS = { 'WIN': 'b-up', 'LOSS': 'b-dn', 'NEUTRAL': 'b-neu' };
var AI_SIGNAL_STATUS_LABEL = { 'pending': 'Menunggu', 'resolved': 'Selesai', 'expired': 'Kedaluwarsa' };

function aiSignalHistoryRenderRow(r) {
  var badgeClass = AI_SIGNAL_BADGE_CLASS[r.signal_action] || 'b-neu';
  var outcomeBadge = r.outcome ? '<span class="badge ' + (AI_SIGNAL_OUTCOME_BADGE_CLASS[r.outcome] || 'b-neu') + '" style="font-size:10px">' + escapeHtml(r.outcome) + '</span>' : '<span style="color:var(--text3)">—</span>';
  var returnCell = function(pct) {
    if (typeof pct !== 'number') return '<span style="color:var(--text3)">—</span>';
    var color = pct > 0 ? '#10B981' : (pct < 0 ? '#EF4444' : 'var(--text2)');
    return '<span style="color:' + color + ';font-weight:700;font-family:var(--font-mono)">' + (pct >= 0 ? '+' : '') + pct.toFixed(2) + '%</span>';
  };
  var entryExit = Number(r.entry_price || 0).toLocaleString('id-ID') + (r.exit_price != null ? (' → ' + Number(r.exit_price).toLocaleString('id-ID')) : '');
  var dateStr = r.emitted_at ? new Date(r.emitted_at).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
  var reflectionCell = r.reflection_text
    ? '<span title="' + escapeHtml(r.reflection_text) + '" style="cursor:help;color:var(--text3);font-size:11px">' + escapeHtml(r.reflection_text.length > 60 ? r.reflection_text.slice(0, 60) + '…' : r.reflection_text) + '</span>'
    : '<span style="color:var(--text3)">—</span>';

  return '<tr>'
    + '<td style="white-space:nowrap;color:var(--text3)">' + dateStr + '</td>'
    + '<td style="font-weight:700;font-family:var(--font-mono)">' + escapeHtml(r.ticker) + '</td>'
    + '<td>' + escapeHtml(r.source) + '</td>'
    + '<td><span class="badge ' + badgeClass + '" style="font-size:10px">' + escapeHtml(r.signal_action) + '</span></td>'
    + '<td>' + escapeHtml(AI_SIGNAL_STATUS_LABEL[r.status] || r.status) + '</td>'
    + '<td class="mono">Rp ' + entryExit + '</td>'
    + '<td>' + returnCell(r.raw_return_pct) + '</td>'
    + '<td>' + returnCell(r.benchmark_return_pct) + '</td>'
    + '<td>' + returnCell(r.alpha_return_pct) + '</td>'
    + '<td>' + outcomeBadge + '</td>'
    + '<td style="max-width:220px">' + reflectionCell + '</td>'
    + '</tr>';
}

async function aiSignalHistoryRunResolveNow() {
  if (typeof resolveDueAiSignals !== 'function') return;
  var btn = event && event.target;
  if (btn) { btn.disabled = true; btn.textContent = 'Memproses...'; }
  try {
    await resolveDueAiSignals();
  } finally {
    renderAiSignalHistoryPage();
  }
}

window.renderAiSignalHistoryPage = renderAiSignalHistoryPage;
window.aiSignalHistoryRunResolveNow = aiSignalHistoryRunResolveNow;
