/**
 * public/js/49-strategy-engine.js — Strategy Engine V1 tab inside the
 * Unified Screener page (public/js/48-unified-screener.js switches into
 * this via US_STATE.pageTab === 'strategy').
 *
 * Data: GET /api/strategy-engine/strategies (list of 4 strategies) and
 * GET /api/strategy-engine/scan?strategy=...&tickers=... (on-demand run,
 * explicit ticker list — see server.js route comment for why there is no
 * "scan whole market" button here: that belongs in a scheduled cron, not
 * an unauthenticated on-demand endpoint).
 *
 * This UI never labels a result BUY/SELL — only the engine's own
 * STRONG/QUALIFIED/WATCH/REJECT/DATA_INSUFFICIENT vocabulary.
 */

var SE_STATE = {
  strategiesLoaded: false,
  strategies: [],
  selectedStrategy: 'swing-flow',
  tickersInput: '',
  loading: false,
  error: null,
  data: null, // last /scan response
  expandedTicker: null,
  latest: { loading: false, fetchedFor: null, data: null, error: null },
  dailyStats: { loading: false, fetchedFor: null, data: null, error: null }
};

// FIX (2026-09-25, follow-up to removing FOREIGN from
// hidden-accumulation/momentum-candidate's mandatoryConditions —
// see lib/engine/indicators/foreignFlow.js's header comment for the
// incident): no historical backtest is possible for this engine
// (order-book/intraday data has no confirmed historical retention at
// Invezgo), so the only honest way to confirm the fix actually raised
// the qualifying rate is to watch it happen for real. Reads
// GET /api/strategy-engine/daily-stats (accumulated day-by-day from
// warmStrategyEngineRotating(), not a fresh computation).
async function seLoadDailyStats(strategyId) {
  SE_STATE.dailyStats.loading = true;
  seRenderStrategyEnginePage('us-strategy-subpage');
  try {
    var resp = await fetch('/api/strategy-engine/daily-stats?strategy=' + encodeURIComponent(strategyId) + '&days=14');
    var json = await resp.json();
    if (!json.success) throw new Error(json.error || 'Gagal memuat tren harian');
    SE_STATE.dailyStats.data = json;
    SE_STATE.dailyStats.fetchedFor = strategyId;
    SE_STATE.dailyStats.error = null;
  } catch (e) {
    SE_STATE.dailyStats.error = e.message;
  } finally {
    SE_STATE.dailyStats.loading = false;
    seRenderStrategyEnginePage('us-strategy-subpage');
  }
}

// "Hasil Cron Terakhir" — sinyal STRONG/QUALIFIED yang sudah terkumpul
// hari ini dari warmStrategyEngineRotating() (lib/engine/strategy/
// StrategyEngine.js), bukan hasil scan on-demand. Cron ini TIDAK otomatis
// jalan lewat Vercel native cron (lihat komentar server.js pada
// GET /api/cron/warm-strategy-engine) — kalau panel ini kosong terus,
// kemungkinan besar penjadwal eksternalnya belum di-set up.
async function seLoadLatest(strategyId) {
  SE_STATE.latest.loading = true;
  seRenderStrategyEnginePage('us-strategy-subpage');
  try {
    var resp = await fetch('/api/strategy-engine/latest?strategy=' + encodeURIComponent(strategyId));
    var json = await resp.json();
    if (!json.success) throw new Error(json.error || 'Gagal memuat hasil cron');
    SE_STATE.latest.data = json;
    SE_STATE.latest.fetchedFor = strategyId;
    SE_STATE.latest.error = null;
  } catch (e) {
    SE_STATE.latest.error = e.message;
  } finally {
    SE_STATE.latest.loading = false;
    seRenderStrategyEnginePage('us-strategy-subpage');
  }
}

function seStatusBadgeClass(status) {
  if (status === 'STRONG') return 'b-up';
  if (status === 'QUALIFIED') return 'b-up';
  if (status === 'WATCH') return 'b-amb';
  if (status === 'REJECT') return 'b-dn';
  return 'b-neu'; // DATA_INSUFFICIENT
}

async function seLoadStrategies() {
  try {
    var resp = await fetch('/api/strategy-engine/strategies');
    var json = await resp.json();
    if (json.success) {
      SE_STATE.strategies = json.strategies || [];
      if (!SE_STATE.strategies.find(function (s) { return s.id === SE_STATE.selectedStrategy; }) && SE_STATE.strategies.length) {
        SE_STATE.selectedStrategy = SE_STATE.strategies[0].id;
      }
    }
  } catch (e) { /* silent — form still usable with the default strategy id */ }
  SE_STATE.strategiesLoaded = true;
  seRenderStrategyEnginePage('us-strategy-subpage');
}

function seOnStrategyChange() {
  var sel = document.getElementById('se-strategy-select');
  if (sel) SE_STATE.selectedStrategy = sel.value;
  seRenderStrategyEnginePage('us-strategy-subpage');
}

function seReadForm() {
  var sel = document.getElementById('se-strategy-select');
  var tk = document.getElementById('se-tickers-input');
  if (sel) SE_STATE.selectedStrategy = sel.value;
  if (tk) SE_STATE.tickersInput = tk.value;
}

// User-requested (2026-10-01): "apakah harus dimasukan kode saham, buat
// sinkron saja dengan portofolio sebagai opsi" — fills the ticker input
// from the user's REAL current holdings (getPortfolio(), 03-engine.js —
// the same source of truth every other portfolio view in this app reads
// from) instead of requiring manual entry. Deliberately just fills the
// input rather than auto-running the scan: the user can still edit the
// list before hitting "Jalankan Scan", and a strategy scan calling
// Invezgo per ticker is not something to fire without an explicit click.
function seSyncFromPortfolio() {
  if (typeof getPortfolio !== 'function') {
    SE_STATE.error = 'Modul Portofolio tidak termuat di halaman ini — isi ticker manual.';
    seRenderStrategyEnginePage('us-strategy-subpage');
    return;
  }
  var porto = getPortfolio();
  if (!porto || !porto.length) {
    SE_STATE.error = 'Portofolio Anda masih kosong — isi transaksi dulu di menu Portofolio, atau masukkan ticker manual di sini.';
    seRenderStrategyEnginePage('us-strategy-subpage');
    return;
  }
  var tickers = porto.map(function (p) { return p.ticker; });
  var wasCapped = tickers.length > 50;
  if (wasCapped) tickers = tickers.slice(0, 50);
  SE_STATE.tickersInput = tickers.join(',');
  SE_STATE.error = wasCapped
    ? ('Portofolio Anda punya ' + porto.length + ' saham — hanya 50 pertama yang disinkronkan (batas maksimal scan per kuota Invezgo).')
    : null;
  seRenderStrategyEnginePage('us-strategy-subpage');
}
window.seSyncFromPortfolio = seSyncFromPortfolio;

async function seRunScan() {
  seReadForm();
  var tickers = SE_STATE.tickersInput.split(',').map(function (t) { return t.trim().toUpperCase(); }).filter(Boolean);
  if (!tickers.length) {
    SE_STATE.error = 'Isi minimal 1 ticker (pisahkan dengan koma), mis. BBCA,BBRI';
    seRenderStrategyEnginePage('us-strategy-subpage');
    return;
  }
  if (tickers.length > 50) {
    SE_STATE.error = 'Maksimal 50 ticker per scan (proteksi kuota Invezgo)';
    seRenderStrategyEnginePage('us-strategy-subpage');
    return;
  }
  SE_STATE.loading = true;
  SE_STATE.error = null;
  seRenderStrategyEnginePage('us-strategy-subpage');
  try {
    var url = '/api/strategy-engine/scan?strategy=' + encodeURIComponent(SE_STATE.selectedStrategy) + '&tickers=' + encodeURIComponent(tickers.join(','));
    var resp = await fetch(url);
    var json = await resp.json();
    if (!json.success) throw new Error(json.error || 'Scan gagal');
    SE_STATE.data = json;
  } catch (e) {
    SE_STATE.error = e.message;
    SE_STATE.data = null;
  } finally {
    SE_STATE.loading = false;
    seRenderStrategyEnginePage('us-strategy-subpage');
  }
}

function seToggleExplain(ticker) {
  SE_STATE.expandedTicker = (SE_STATE.expandedTicker === ticker) ? null : ticker;
  seRenderStrategyEnginePage('us-strategy-subpage');
}

function seRenderStrategyEnginePage(containerId) {
  var container = document.getElementById(containerId);
  if (!container) return;

  if (!SE_STATE.strategiesLoaded) {
    container.innerHTML = '<div class="card" style="padding:20px;text-align:center;color:var(--text-mute)">Memuat daftar strategi…</div>';
    seLoadStrategies();
    return;
  }

  if (SE_STATE.latest.fetchedFor !== SE_STATE.selectedStrategy && !SE_STATE.latest.loading) {
    seLoadLatest(SE_STATE.selectedStrategy);
    return; // seLoadLatest re-renders when it resolves
  }

  if (SE_STATE.dailyStats.fetchedFor !== SE_STATE.selectedStrategy && !SE_STATE.dailyStats.loading) {
    seLoadDailyStats(SE_STATE.selectedStrategy);
    return; // seLoadDailyStats re-renders when it resolves
  }

  var strat = SE_STATE.strategies.find(function (s) { return s.id === SE_STATE.selectedStrategy; });

  var html = '<div class="card" style="padding:14px;margin-bottom:12px">'
    + '<div style="font-weight:700;margin-bottom:6px">Money Watch Strategy Engine V1</div>'
    + '<div style="font-size:11.5px;color:var(--text-mute);margin-bottom:10px">'
    + 'Engine deterministik berbasis order book &amp; frekuensi transaksi real (Invezgo). '
    + 'Hasil hanya salah satu dari: <b>STRONG</b> / <b>QUALIFIED</b> / <b>WATCH</b> / <b>REJECT</b> / <b>DATA_INSUFFICIENT</b> — tidak pernah label BUY/SELL, dan bukan rekomendasi keuangan. '
    + 'Threshold di sini adalah default awal yang bisa dikalibrasi ulang, bukan parameter yang sudah tervalidasi empiris.'
    + '</div>'
    + '<div style="display:flex;flex-wrap:wrap;gap:10px;align-items:flex-end">'
    + '<div><label style="font-size:11px;color:var(--text-mute);display:block;margin-bottom:3px">Strategi</label>'
    + '<select id="se-strategy-select" class="finput fsel" onchange="seOnStrategyChange()" style="padding:5px 9px;font-size:11.5px;border-radius:6px;min-width:220px">'
    + SE_STATE.strategies.map(function (s) {
        return '<option value="' + s.id + '"' + (s.id === SE_STATE.selectedStrategy ? ' selected' : '') + '>' + s.name + '</option>';
      }).join('')
    + '</select></div>'
    + '<div style="flex:1;min-width:220px"><label style="font-size:11px;color:var(--text-mute);display:block;margin-bottom:3px">Ticker (pisah koma, maks 50)</label>'
    + '<input id="se-tickers-input" type="text" placeholder="BBCA,BBRI,TLKM" value="' + (SE_STATE.tickersInput || '').replace(/"/g, '&quot;') + '" style="width:100%;padding:5px 9px;font-size:11.5px;border-radius:6px" class="finput"></div>'
    + '<button class="btn btn-ghost btn-sm" onclick="seSyncFromPortfolio()" title="Isi otomatis dari saham yang sedang Anda pegang di menu Portofolio">📂 Sinkron Portofolio</button>'
    + '<button class="btn btn-primary btn-sm" onclick="seRunScan()"' + (SE_STATE.loading ? ' disabled' : '') + '>' + (SE_STATE.loading ? 'Memindai…' : '▶ Jalankan Scan') + '</button>'
    + '</div>';

  if (strat) {
    html += '<div style="margin-top:10px;font-size:11px;color:var(--text-mute)">'
      + 'Bobot: ' + Object.keys(strat.weights).map(function (k) { return k + ' ' + Math.round(strat.weights[k] * 100) + '%'; }).join(', ')
      + (strat.mandatoryConditions && strat.mandatoryConditions.length ? ' · Mandatory: ' + strat.mandatoryConditions.join(', ') : '')
      + '</div>';
  }
  html += '</div>';

  // "Hasil Cron Terakhir" — akumulasi sinyal STRONG/QUALIFIED hari ini
  // dari warmStrategyEngineRotating(), bukan hasil scan manual di atas.
  html += '<div class="card" style="padding:14px;margin-bottom:12px">'
    + '<div style="font-weight:700;margin-bottom:6px">Hasil Cron Terakhir (Hari Ini)</div>';
  if (SE_STATE.latest.error) {
    html += '<div style="font-size:11.5px;color:var(--down,#dc2626)">' + SE_STATE.latest.error + '</div>';
  } else if (SE_STATE.latest.loading) {
    html += '<div style="font-size:11.5px;color:var(--text-mute)">Memuat…</div>';
  } else if (SE_STATE.latest.data && SE_STATE.latest.data.signals && SE_STATE.latest.data.signals.length > 0) {
    html += '<div style="font-size:11.5px;color:var(--text-mute);margin-bottom:8px">Tanggal ' + SE_STATE.latest.data.date + ' — ' + SE_STATE.latest.data.signals.length + ' sinyal STRONG/QUALIFIED terkumpul sejauh ini.</div>'
      + '<div style="display:flex;flex-wrap:wrap;gap:6px">'
      + SE_STATE.latest.data.signals.map(function (s) {
          return '<span class="badge ' + seStatusBadgeClass(s.status) + '" style="font-size:10px">' + s.ticker + ' · ' + s.status + ' (' + s.score + ')</span>';
        }).join('')
      + '</div>';
  } else {
    html += '<div style="font-size:11.5px;color:var(--text-mute)">Belum ada sinyal terkumpul hari ini. Cron GET /api/cron/warm-strategy-engine belum otomatis jalan lewat Vercel native cron (2 slot Hobby sudah dipakai 2 cron lain) — perlu penjadwal eksternal (cron-job.org, GitHub Actions, dll) yang memanggil URL itu dengan header Authorization Bearer CRON_SECRET, atau jalankan manual dulu untuk tes.</div>';
  }
  html += '</div>';

  // "Tren Harian (14 Hari)" — validasi forward setelah FOREIGN dihapus
  // dari weights/mandatoryConditions (2026-09-25): tidak ada backtest
  // historis yang bisa dijalankan untuk engine ini, jadi qualifyingRate
  // dari hari ke hari adalah satu-satunya bukti nyata apakah fix ini
  // benar-benar menaikkan tingkat lolos strategi yang sebelumnya
  // mandatory-FOREIGN (hidden-accumulation, momentum-candidate).
  html += '<div class="card" style="padding:14px;margin-bottom:12px">'
    + '<div style="font-weight:700;margin-bottom:6px">Tren Harian (14 Hari Terakhir)</div>';
  if (SE_STATE.dailyStats.error) {
    html += '<div style="font-size:11.5px;color:var(--down,#dc2626)">' + SE_STATE.dailyStats.error + '</div>';
  } else if (SE_STATE.dailyStats.loading) {
    html += '<div style="font-size:11.5px;color:var(--text-mute)">Memuat…</div>';
  } else if (SE_STATE.dailyStats.data && SE_STATE.dailyStats.data.days) {
    var activeDays = SE_STATE.dailyStats.data.days.filter(function (d) { return d.processed > 0; });
    if (!activeDays.length) {
      html += '<div style="font-size:11.5px;color:var(--text-mute)">Belum ada data cron untuk 14 hari terakhir — statistik ini mulai terkumpul sejak fix FOREIGN 2026-09-25, butuh beberapa hari cron berjalan sebelum trennya terlihat.</div>';
    } else {
      html += '<div style="font-size:11px;color:var(--text-mute);margin-bottom:8px">Hanya hari dengan aktivitas cron ditampilkan · qualifyingRate = (STRONG+QUALIFIED) / processed</div>'
        + '<div style="overflow-x:auto"><table class="tbl" style="width:100%;font-size:11.5px">'
        + '<thead><tr><th>Tanggal</th><th>Discan</th><th>STRONG</th><th>QUALIFIED</th><th>WATCH</th><th>REJECT</th><th>DATA_INSUFFICIENT</th><th>Qualifying Rate</th></tr></thead><tbody>'
        + activeDays.map(function (d) {
            return '<tr><td>' + d.date + '</td><td>' + d.processed + '</td><td>' + d.STRONG + '</td><td>' + d.QUALIFIED + '</td><td>' + d.WATCH + '</td><td>' + d.REJECT + '</td><td>' + d.DATA_INSUFFICIENT + '</td><td>' + (d.qualifyingRate != null ? d.qualifyingRate + '%' : '-') + '</td></tr>';
          }).join('')
        + '</tbody></table></div>';
    }
  }
  html += '</div>';

  if (SE_STATE.error) {
    html += '<div class="card" style="padding:12px;color:var(--down,#dc2626);margin-bottom:12px">' + SE_STATE.error + '</div>';
  }

  if (SE_STATE.data) {
    var d = SE_STATE.data;
    if (d.regulatoryDataSource && !d.regulatoryDataSource.available) {
      html += '<div class="card" style="padding:10px 14px;margin-bottom:12px;font-size:11.5px;border:1px solid var(--border)">'
        + '⚠️ Data notasi khusus BEI (Regulatory Health Gate) sedang tidak tersedia' + (d.regulatoryDataSource.isStale ? ' (memakai cache lama)' : '') + ' — semua ticker default DATA_INSUFFICIENT sampai data ini pulih.'
        + '</div>';
    }
    html += '<div class="card" style="padding:10px 14px;margin-bottom:12px;font-size:11.5px;color:var(--text-mute)">'
      + 'STRONG: ' + d.summary.strong + ' · QUALIFIED: ' + d.summary.qualified + ' · WATCH: ' + d.summary.watch + ' · REJECT: ' + d.summary.reject + ' · DATA_INSUFFICIENT: ' + d.summary.dataInsufficient
      + '</div>';

    html += '<div class="card" style="padding:0;overflow-x:auto">'
      + '<table class="tbl" style="width:100%;font-size:12.5px">'
      + '<thead><tr><th>Ticker</th><th>Status</th><th>Score</th><th>Detail</th></tr></thead><tbody>';

    d.results.forEach(function (r) {
      html += '<tr>'
        + '<td><b>' + r.ticker + '</b></td>'
        + '<td><span class="badge ' + seStatusBadgeClass(r.status) + '" style="font-size:9px">' + r.status + '</span></td>'
        + '<td>' + (r.score != null ? r.score : '<span style="color:var(--text-mute)">-</span>') + '</td>'
        + '<td><button class="btn btn-ghost btn-xs" onclick="seToggleExplain(\'' + r.ticker + '\')">' + (SE_STATE.expandedTicker === r.ticker ? 'Tutup' : 'Lihat penjelasan') + '</button></td>'
        + '</tr>';
      if (SE_STATE.expandedTicker === r.ticker) {
        html += '<tr><td colspan="4" style="background:var(--bg-alt,#f8fafc);font-size:11px;padding:10px 14px">'
          + (r.explanations || []).map(function (line) { return '<div>' + line.replace(/</g, '&lt;') + '</div>'; }).join('')
          + '</td></tr>';
      }
    });

    html += '</tbody></table></div>';
  }

  container.innerHTML = html;
}

// ─────────────────────────────────────────────────────────────────────────
// DAILY PICKS WIDGET (Screener page header)
// User request (2026-09-24): "1 sidebar recommendation, isinya adalah
// rekomendasi stock pick dari analisa anda, sifatnya harian, setiap hari
// berubah kecuali libur bursa, dan akan reload tiap 15 menit, stock pick
// cukup 10 saham aja, namun anda beri score dan alasan nya." Originally
// placed in the global left sidebar; moved into the Screener page
// (2026-09-24, user-reported: "penempatannya di sidebar belum tepat,
// masukkan saja di screener supaya tidak berantakan") since that sidebar
// is shared across every page and this widget is screening/analysis
// content, not navigation — public/js/48-unified-screener.js's
// usRenderShell() now renders its container (#us-daily-picks) and calls
// usDailyPicksInit() once.
//
// ZERO FABRICATION (CLAUDE.md #1/#3): this widget invents NOTHING. It
// reads GET /api/strategy-engine/daily-picks, which itself only ever
// returns tickers that warmStrategyEngineRotating()'s cron already scored
// STRONG/QUALIFIED with the real Strategy Engine V1 formulas (see that
// endpoint's server.js comment and getDailyTopPicks() in
// lib/engine/strategy/StrategyEngine.js). "Changes daily except market
// holidays" and "10 stocks" are honored by the backend, not faked here:
// the backend walks back to the most recent date that actually has
// signals (weekends/holidays naturally reuse the last trading day's real
// results) and returns fewer than 10 with an honest `note` if the day's
// rotation hasn't found that many yet — this widget renders that note
// verbatim rather than padding the list.
// ─────────────────────────────────────────────────────────────────────────

var US_DAILY_PICKS_REFRESH_MS = 15 * 60 * 1000; // 15 minutes, as requested
var US_DAILY_PICKS_STATE = { loading: false, data: null, error: null };
var _usDailyPicksTimer = null;
var _usDailyPicksInitialized = false;

// usRenderShell() calls this on every render (including periodic same-page
// refresh ticks from 03-engine.js) — must be idempotent: only fetch/start
// the interval the FIRST time, otherwise just repaint from existing state.
function usDailyPicksInit() {
  var el = document.getElementById('us-daily-picks');
  if (!el) return; // markup not present on this build — no-op, not an error
  if (_usDailyPicksInitialized) {
    usDailyPicksRender();
    return;
  }
  _usDailyPicksInitialized = true;
  usDailyPicksLoad();
  if (_usDailyPicksTimer) clearInterval(_usDailyPicksTimer);
  _usDailyPicksTimer = setInterval(usDailyPicksLoad, US_DAILY_PICKS_REFRESH_MS);
}

async function usDailyPicksLoad() {
  US_DAILY_PICKS_STATE.loading = true;
  US_DAILY_PICKS_STATE.error = null;
  usDailyPicksRender();
  try {
    var resp = await fetch('/api/strategy-engine/daily-picks?limit=10', { signal: AbortSignal.timeout(15000) });
    var json = await resp.json();
    if (!json.success) throw new Error(json.error || 'Gagal memuat rekomendasi harian');
    US_DAILY_PICKS_STATE.data = json;
  } catch (e) {
    US_DAILY_PICKS_STATE.error = e.message || String(e);
  } finally {
    US_DAILY_PICKS_STATE.loading = false;
    usDailyPicksRender();
  }
}

function usDailyPicksStatusColor(status) {
  if (status === 'STRONG') return 'var(--green,#10b981)';
  if (status === 'QUALIFIED') return 'var(--blue,#38bdf8)';
  return 'var(--text3,#94a3b8)';
}

function usDailyPicksEsc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

// Parse raw rationale string into clean structured items
function usDailyPicksParseReason(reason) {
  if (!reason) return [];
  var parts = String(reason).split(/\s*—\s*/);
  var items = [];
  parts.forEach(function (part) {
    var p = part.trim();
    if (!p) return;
    if (/^(STRONG|QUALIFIED|WATCH|REJECT):\s*FinalScore/i.test(p)) {
      items.push({ type: 'verdict', label: 'STATUS &amp; SKOR', text: p, icon: 'ti-award', badgeClass: 'b-up' });
    } else if (/^Skor dihitung dari/i.test(p)) {
      items.push({ type: 'weight', label: 'CAKUPAN BOBOT', text: p, icon: 'ti-scale', badgeClass: 'b-amb' });
    } else {
      var colonIdx = p.indexOf(':');
      if (colonIdx > 0 && colonIdx < 35) {
        var key = p.slice(0, colonIdx).trim().replace(/_/g, ' ');
        var val = p.slice(colonIdx + 1).trim();
        items.push({ type: 'indicator', label: key, text: val, icon: 'ti-check', badgeClass: 'b-accent' });
      } else {
        items.push({ type: 'note', label: 'CATATAN ANALISIS', text: p, icon: 'ti-info-circle', badgeClass: 'b-neu' });
      }
    }
  });
  return items;
}

// Modal Popup for detailed rationale & breakdown
function usDailyPicksOpenModal(idx) {
  if (!US_DAILY_PICKS_STATE.data || !Array.isArray(US_DAILY_PICKS_STATE.data.picks)) return;
  var p = US_DAILY_PICKS_STATE.data.picks[idx];
  if (!p) return;

  var existing = document.getElementById('us-picks-modal-backdrop');
  if (existing) existing.remove();

  var scoreNum = p.score != null ? Number(p.score) : null;
  var isAlpha = scoreNum != null && scoreNum >= 88.0;
  var isStrong = scoreNum != null && scoreNum >= 83.0 && scoreNum < 88.0;

  var structured = usDailyPicksParseReason(p.reason);
  var indicatorCards = structured.map(function (item) {
    return '<div class="radar-modal-indicator-item">'
      + '<span class="indicator-badge-chip ' + (item.badgeClass || '') + '"><i class="ti ' + item.icon + '"></i> ' + usDailyPicksEsc(item.label) + '</span>'
      + '<div style="color:var(--text);font-size:11.5px;line-height:1.4">' + usDailyPicksEsc(item.text) + '</div>'
      + '</div>';
  }).join('');

  var tierBadgeText = isAlpha
    ? '🔥 <strong style="color:#f59e0b">ALPHA TARGET (TIER 1)</strong> — Konfluensi tertinggi pada pemindaian hari ini'
    : (isStrong ? '⚡ <strong style="color:#10b981">STRONG MOMENTUM (TIER 2)</strong> — Memenuhi akumulasi bandar &amp; momentum kuat'
      : '🎯 <strong style="color:#38bdf8">QUALIFIED TARGET (TIER 3)</strong> — Lolos ambang batas seleksi strategi');

  var modalHtml = '<div id="us-picks-modal-backdrop" class="radar-modal-backdrop" onclick="if(event.target===this)usDailyPicksCloseModal()">'
    + '<div class="radar-modal-card" role="dialog" aria-modal="true" aria-labelledby="radar-modal-title">'
    + '<div class="radar-modal-header">'
    + '  <div style="display:flex;align-items:center;gap:12px">'
    + '    <div style="flex-shrink:0">' + (typeof getStockLogoHtml === 'function' ? getStockLogoHtml(p.ticker, 42) : '') + '</div>'
    + '    <div>'
    + '      <div style="display:flex;align-items:center;gap:8px">'
    + '        <span id="radar-modal-title" class="mono" style="font-size:18px;font-weight:900;color:var(--text)">' + usDailyPicksEsc(p.ticker) + '</span>'
    + '        <span class="badge ' + (p.rank === 1 ? 'b-amb' : 'b-accent') + '" style="font-size:10px">RANK #' + p.rank + '</span>'
    + '        <span class="badge ' + (p.status === 'STRONG' ? 'b-up' : 'b-blue') + '" style="font-size:10px">' + usDailyPicksEsc(p.status) + '</span>'
    + '      </div>'
    + '      <div style="font-size:12px;color:var(--text3);margin-top:2px">' + usDailyPicksEsc(p.name || p.ticker) + '</div>'
    + '    </div>'
    + '  </div>'
    + '  <button class="radar-modal-close" onclick="usDailyPicksCloseModal()" aria-label="Tutup">✕</button>'
    + '</div>'
    + '<div class="radar-modal-body">'
    + '  <div class="radar-modal-score-banner">'
    + '    <div class="modal-score-circle ' + (isAlpha ? 'score-circle-alpha' : '') + '">'
    + '      <div class="score-large-val" style="color:' + usDailyPicksStatusColor(p.status) + '">' + (p.score != null ? p.score : '-') + '</div>'
    + '      <div class="score-large-lbl">FINAL SCORE</div>'
    + '    </div>'
    + '    <div class="modal-score-details">'
    + '      <div class="modal-strategy-title"><i class="ti ti-compass" style="color:var(--accent)"></i> Strategi: <strong>' + usDailyPicksEsc(p.strategyName) + '</strong></div>'
    + '      <div class="modal-tier-tag">' + tierBadgeText + '</div>'
    + '      <div class="modal-weight-note">Sistem perhitungan kuantitatif berbasis indikator multi-faktor tanpa manipulasi data sintetis.</div>'
    + '    </div>'
    + '  </div>'
    + '  <div class="radar-modal-section-title"><i class="ti ti-list-check"></i> Rincian Parameter &amp; Logika Skor</div>'
    + '  <div class="radar-modal-indicator-list">' + (indicatorCards || '<div style="color:var(--text3);font-size:11px">Tidak ada rincian tambahan.</div>') + '</div>'
    + '  <div class="radar-modal-verbatim-box">'
    + '    <div class="verbatim-header"><i class="ti ti-file-text"></i> Penjelasan Rationale Lengkap (Strategy Engine V1):</div>'
    + '    <div class="verbatim-content">' + usDailyPicksEsc(p.reason || 'Tidak ada penjelasan') + '</div>'
    + '  </div>'
    + '</div>'
    + '<div class="radar-modal-footer">'
    + '  <div style="font-size:10px;color:var(--text3);display:flex;align-items:center;gap:6px">'
    + '    <span class="radar-live-blip" style="width:6px;height:6px"></span> Data real Invezgo · Diperbarui tiap 15 mnt'
    + '  </div>'
    + '  <div style="display:flex;gap:8px">'
    + '    <button class="btn btn-ghost btn-sm" onclick="usDailyPicksCloseModal()">Tutup</button>'
    + '    <button class="btn btn-ghost btn-sm" onclick="usDailyPicksCloseModal();if(typeof selectStockChatTicker===\'function\')selectStockChatTicker(\'' + p.ticker + '\');if(typeof goPage===\'function\')goPage(\'stockchat\');">'
    + '      <i class="ti ti-terminal-2"></i> StockChat AI'
    + '    </button>'
    + '    <button class="btn btn-primary btn-sm" onclick="usDailyPicksCloseModal();if(typeof selectStockChatTicker===\'function\')selectStockChatTicker(\'' + p.ticker + '\');if(typeof goPage===\'function\')goPage(\'stock-dossier\');">'
    + '      <i class="ti ti-chart-candle"></i> Buka Stock Master 360'
    + '    </button>'
    + '  </div>'
    + '</div>'
    + '</div>'
    + '</div>';

  document.body.insertAdjacentHTML('beforeend', modalHtml);
}

function usDailyPicksCloseModal() {
  var m = document.getElementById('us-picks-modal-backdrop');
  if (m) m.remove();
}

window.addEventListener('keydown', function (e) {
  if (e.key === 'Escape') usDailyPicksCloseModal();
});

// Search Radar layout with live sweep HUD, target blips, score tier visualizer, and popup modal
function usDailyPicksRender() {
  var el = document.getElementById('us-daily-picks');
  if (!el) return;

  var d = US_DAILY_PICKS_STATE.data;
  var hasPicks = d && Array.isArray(d.picks) && d.picks.length > 0;
  var pickCount = hasPicks ? d.picks.length : 0;
  var dateStr = (d && d.date) || 'Hari Ini';

  // Top HUD Status Bar
  var header = '<div class="radar-hud-bar">'
    + '<div class="radar-hud-status">'
    + '  <span class="radar-live-blip"></span>'
    + '  <span class="radar-hud-title">Radar Pencarian Saham <span class="badge b-accent" style="font-size:9px">STRATEGY ENGINE V1</span></span>'
    + '</div>'
    + '<div class="radar-hud-meta">'
    + '  <span class="radar-meta-chip"><i class="ti ti-calendar"></i> ' + usDailyPicksEsc(dateStr) + '</span>'
    + '  <span class="radar-meta-chip"><i class="ti ti-target"></i> ' + pickCount + ' TARGET TERDETEKSI</span>'
    + '  <button class="btn btn-ghost btn-xs radar-refresh-btn" onclick="usDailyPicksLoad()" title="Pindai Ulang Radar"><i class="ti ti-refresh"></i> Pindai Ulang</button>'
    + '</div>'
    + '</div>';

  var content;
  if (US_DAILY_PICKS_STATE.loading && !d) {
    content = '<div class="radar-scope-wrapper" style="text-align:center;padding:48px 20px">'
      + '<div class="radar-scope-container" style="width:260px;height:260px;margin-bottom:16px">'
      + '  <div class="radar-scope">'
      + '    <div class="radar-ring ring-alpha"></div>'
      + '    <div class="radar-ring ring-strong"></div>'
      + '    <div class="radar-sweep-beam"></div>'
      + '    <div class="radar-center-origin"></div>'
      + '  </div>'
      + '</div>'
      + '<div style="font-size:13px;font-weight:700;color:var(--text);margin-bottom:4px">Memindai Peluang Pasar...</div>'
      + '<div style="font-size:11px;color:var(--text3)">Mengevaluasi konfluensi bandarmology, momentum, dan fundamental emiten IDX</div>'
      + '</div>';
    el.innerHTML = header + content;
    return;
  }

  if (US_DAILY_PICKS_STATE.error && !d) {
    content = '<div class="radar-scope-wrapper" style="text-align:center;padding:36px 20px">'
      + '<div style="color:var(--red,#ef4444);font-size:24px;margin-bottom:8px"><i class="ti ti-alert-triangle"></i></div>'
      + '<div style="font-size:13px;font-weight:700;color:var(--text);margin-bottom:6px">Radar Mengalami Gangguan Sensor</div>'
      + '<div style="font-size:11px;color:var(--text3);margin-bottom:14px">' + usDailyPicksEsc(US_DAILY_PICKS_STATE.error) + '</div>'
      + '<button class="btn btn-outline btn-sm" onclick="usDailyPicksLoad()"><i class="ti ti-refresh"></i> Coba Hubungkan Kembali</button>'
      + '</div>';
    el.innerHTML = header + content;
    return;
  }

  if (d && d.count === 0) {
    var cov = d.scanCoverage;
    var emptyReason = (cov && cov.scannedPerStrategyMax > 0)
      ? ('Rotasi harian baru memindai ' + cov.scannedPerStrategyMax + ' dari ' + cov.universeSize + ' emiten (per strategi) dan belum menemukan yang berstatus STRONG/QUALIFIED.')
      : 'Belum ada emiten yang berhasil dipindai untuk tanggal ini.';
    content = '<div class="radar-scope-wrapper" style="text-align:center;padding:36px 20px">'
      + '<div class="radar-scope-container" style="width:240px;height:240px;margin-bottom:16px">'
      + '  <div class="radar-scope">'
      + '    <div class="radar-ring ring-alpha"></div>'
      + '    <div class="radar-ring ring-strong"></div>'
      + '    <div class="radar-sweep-beam"></div>'
      + '    <div class="radar-center-origin"></div>'
      + '  </div>'
      + '</div>'
      + '<div style="font-size:13px;font-weight:700;color:var(--text);margin-bottom:4px">Belum Ada Saham Masuk Jangkauan Radar</div>'
      + '<div style="font-size:11px;color:var(--text3);max-width:540px;margin:0 auto;line-height:1.5">' + usDailyPicksEsc(emptyReason) + '</div>'
      + '</div>';
    el.innerHTML = header + content;
    return;
  }

  if (hasPicks) {
    // Generate Radar Scope Blips & Target Cards
    var blipsHtml = '';
    var cardsHtml = '';
    var totalPicks = d.picks.length;

    d.picks.forEach(function (p, idx) {
      var scoreVal = Number(p.score) || 75;
      var isAlpha = scoreVal >= 88.0;
      var isStrong = scoreVal >= 83.0 && scoreVal < 88.0;
      var tierClass = isAlpha ? 'tier-alpha' : (isStrong ? 'tier-strong' : 'tier-qualified');

      // Distance from center: higher score = closer to center (16% to 80% radius)
      var distPct = Math.max(16, Math.min(80, 84 - (scoreVal - 70) * 2.8));
      var angleDeg = (idx * (360 / totalPicks) + 40) % 360;
      var rad = angleDeg * (Math.PI / 180);
      var leftPct = (50 + (distPct / 2) * Math.cos(rad)).toFixed(2);
      var topPct = (50 + (distPct / 2) * Math.sin(rad)).toFixed(2);

      var logoSize = isAlpha ? 28 : 24;
      var stockLogo = typeof getStockLogoHtml === 'function' ? getStockLogoHtml(p.ticker, logoSize) : '';

      // Special visual effect based on scoring on radar
      var specialGlowHtml = '';
      if (isAlpha) {
        specialGlowHtml = '<div class="radar-blip-ping-gold"></div><div class="radar-target-reticle"></div>';
      } else if (isStrong) {
        specialGlowHtml = '<div class="radar-blip-ping-green"></div>';
      } else {
        specialGlowHtml = '<div class="radar-blip-ping-cyan"></div>';
      }

      blipsHtml += '<div class="radar-target-blip ' + tierClass + '" style="left:' + leftPct + '%;top:' + topPct + '%" '
        + 'onclick="usDailyPicksOpenModal(' + idx + ')" '
        + 'title="' + usDailyPicksEsc(p.ticker) + ' (' + usDailyPicksEsc(p.name || '') + ') · Skor: ' + (p.score != null ? p.score : '-') + ' · Klik untuk alasan">'
        + specialGlowHtml
        + '<div class="radar-blip-inner">'
        + stockLogo
        + '</div>'
        + '<div class="radar-blip-label-pod">'
        + '<span class="radar-blip-ticker">' + usDailyPicksEsc(p.ticker) + '</span>'
        + '<span class="radar-blip-score">' + (p.score != null ? p.score : '-') + '</span>'
        + '</div>'
        + '</div>';

      // Card for Target Feed list on right
      var rankClass = p.rank === 1 ? 'rank-1' : (p.rank === 2 ? 'rank-2' : (p.rank === 3 ? 'rank-3' : 'rank-other'));
      var cardTierClass = isAlpha ? 'card-tier-alpha' : (isStrong ? 'card-tier-strong' : 'card-tier-qualified');
      var scoreBadgeClass = isAlpha ? 'score-alpha' : (isStrong ? 'score-strong' : 'score-qualified');
      var scoreIcon = isAlpha ? '<i class="ti ti-flame" style="color:#f59e0b"></i>' : (isStrong ? '<i class="ti ti-bolt" style="color:#10b981"></i>' : '');

      cardsHtml += '<div class="radar-target-card ' + cardTierClass + '" onclick="usDailyPicksOpenModal(' + idx + ')">'
        + '<div class="target-card-left">'
        + '  <div class="target-rank-badge ' + rankClass + '">' + p.rank + '</div>'
        + '  <div class="target-logo-wrap">' + (typeof getStockLogoHtml === 'function' ? getStockLogoHtml(p.ticker, 36) : '') + '</div>'
        + '  <div class="target-identity">'
        + '    <div class="target-ticker">' + usDailyPicksEsc(p.ticker)
        + (isAlpha ? ' <span class="badge b-amb" style="font-size:8px;padding:1px 4px">HOT TARGET</span>' : '')
        + '    </div>'
        + '    <div class="target-name">' + usDailyPicksEsc(p.name || p.ticker) + '</div>'
        + '  </div>'
        + '</div>'
        + '<div class="target-card-center">'
        + '  <span class="badge b-accent target-strat-badge">' + usDailyPicksEsc(p.strategyName) + '</span>'
        + '  <span class="target-status-badge ' + (p.status === 'STRONG' ? 'status-strong' : 'status-qualified') + '">'
        + '    <span class="status-dot"></span> ' + usDailyPicksEsc(p.status)
        + '  </span>'
        + '</div>'
        + '<div class="target-card-right">'
        + '  <div class="target-score-badge ' + scoreBadgeClass + '">'
        + scoreIcon
        + '    <span class="score-num">' + (p.score != null ? p.score : '-') + '</span>'
        + '  </div>'
        + '  <button class="btn btn-ghost btn-xs" onclick="event.stopPropagation();usDailyPicksOpenModal(' + idx + ');" title="Buka Penjelasan &amp; Rationale">'
        + '    <i class="ti ti-file-text"></i> Alasan'
        + '  </button>'
        + '  <button class="btn btn-ghost btn-xs" onclick="event.stopPropagation();if(typeof selectStockChatTicker===\'function\')selectStockChatTicker(\'' + p.ticker + '\');if(typeof goPage===\'function\')goPage(\'stock-dossier\');" title="Buka Dossier / Chart">'
        + '    <i class="ti ti-chart-candle"></i>'
        + '  </button>'
        + '</div>'
        + '</div>';
    });

    var radarScopeScreen = '<div class="radar-screen-box">'
      + '<div class="radar-scope-container">'
      + '  <div class="radar-compass-label radar-compass-n">000° N</div>'
      + '  <div class="radar-compass-label radar-compass-e">090° E</div>'
      + '  <div class="radar-compass-label radar-compass-s">180° S</div>'
      + '  <div class="radar-compass-label radar-compass-w">270° W</div>'
      + '  <div class="radar-scope" id="radar-scope-screen">'
      + '    <div class="radar-ring ring-outer"><span class="radar-ring-tag">75</span></div>'
      + '    <div class="radar-ring ring-qualified"><span class="radar-ring-tag">80</span></div>'
      + '    <div class="radar-ring ring-strong"><span class="radar-ring-tag">85</span></div>'
      + '    <div class="radar-ring ring-alpha"><span class="radar-ring-tag">90+ ALPHA</span></div>'
      + '    <div class="radar-crosshair-h"></div>'
      + '    <div class="radar-crosshair-v"></div>'
      + '    <div class="radar-sweep-beam"></div>'
      + '    <div class="radar-center-origin"></div>'
      + blipsHtml
      + '  </div>'
      + '</div>'
      + '<div style="margin-top:12px;display:flex;align-items:center;gap:12px;font-size:10px;color:var(--text3);font-family:var(--font-mono)">'
      + '  <span style="display:inline-flex;align-items:center;gap:4px"><span style="width:8px;height:8px;border-radius:50%;background:#f59e0b;display:inline-block"></span> Bullseye 88+ (Alpha)</span>'
      + '  <span style="display:inline-flex;align-items:center;gap:4px"><span style="width:8px;height:8px;border-radius:50%;background:#10b981;display:inline-block"></span> Strong 83-87</span>'
      + '  <span style="display:inline-flex;align-items:center;gap:4px"><span style="width:8px;height:8px;border-radius:50%;background:#06b6d4;display:inline-block"></span> Qualified &lt;83</span>'
      + '</div>'
      + '</div>';

    var targetsFeed = '<div class="radar-targets-panel">'
      + '<div class="radar-targets-header">'
      + '  <div class="radar-targets-title"><i class="ti ti-radar-2"></i> Saham Masuk Radar Pencarian</div>'
      + '  <div style="font-size:11px;color:var(--text3)">Klik saham untuk membaca popup alasan lengkap</div>'
      + '</div>'
      + cardsHtml
      + '</div>';

    var footerBits = [];
    if (d.note) footerBits.push(usDailyPicksEsc(d.note));
    footerBits.push('Data ' + usDailyPicksEsc(d.date) + ' · Bukan nasihat investasi. Hasil perhitungan kuantitatif Strategy Engine V1 dari data pasar nyata Invezgo.');

    content = '<div class="radar-scope-wrapper">'
      + '<div class="radar-main-grid">'
      + radarScopeScreen
      + targetsFeed
      + '</div>'
      + '<div style="padding-top:14px;margin-top:14px;border-top:1px solid var(--border2,rgba(255,255,255,0.06));font-size:10px;color:var(--text3,#94a3b8);line-height:1.4">'
      + footerBits.join(' — ')
      + '</div>'
      + '</div>';
  } else {
    content = '';
  }

  el.innerHTML = header + content;
}

window.usDailyPicksOpenModal = usDailyPicksOpenModal;
window.usDailyPicksCloseModal = usDailyPicksCloseModal;
window.usDailyPicksRender = usDailyPicksRender;
