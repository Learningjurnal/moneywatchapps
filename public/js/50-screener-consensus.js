/**
 * 50-screener-consensus.js — Konsensus Screener
 *
 * FIX (2026-09-27, user-reported: "saya masih bingung menggunakan
 * screener karena terlalu banyak screener dan menunjukan saham yang
 * berbeda-beda, tidak menunjukan spesifik saham yang berpotensi
 * bullish"): the app has 6 separate screening features (Unified
 * Screener, Strategy Engine, Opportunity Radar, Radar Akumulasi/
 * Distribusi, Volume Spike, Quant Screener), each with its own
 * methodology, naturally surfacing different tickers with nothing
 * cross-checking between them.
 *
 * This tab consumes GET /api/idx/screener-consensus
 * (generateScreenerConsensus(), lib/idx-data-engine.js) — a ticker only
 * appears when 3+ of 5 INDEPENDENT screening systems agree it looks
 * bullish today (user-approved threshold; Radar Akumulasi/Distribusi was
 * deliberately excluded as a 6th vote after investigation showed it's
 * already folded into Unified Screener's own whaleScore — counting both
 * would double-count one signal as two). Named "Konsensus Screener"
 * (not "Confluence Score") to avoid colliding with the unrelated,
 * pre-existing per-ticker "Confluence Score" already used by AI Chart
 * Intelligence / Trading Hypothesis (computeConfluence() in
 * lib/idx-data-engine.js — Volume Surge/Fibonacci Overlap/Trend
 * Consistency/Risk-Reward, a completely different concept).
 *
 * Every row shows WHICH systems agreed and why — never an opaque blended
 * number — per CLAUDE.md's zero-fabrication principle.
 */

var CS_STATE = { loading: false, data: null, error: null, minAgree: 3 };

async function csLoad(minAgree) {
  CS_STATE.loading = true;
  CS_STATE.error = null;
  if (typeof minAgree === 'number') CS_STATE.minAgree = minAgree;
  csRender();
  try {
    var res = await fetch('/api/idx/screener-consensus?minAgree=' + CS_STATE.minAgree, { signal: AbortSignal.timeout(30000) });
    var json = await res.json();
    if (!json.success) throw new Error(json.error || 'Gagal memuat Konsensus Screener');
    CS_STATE.data = json;
  } catch (e) {
    CS_STATE.error = e.message;
  } finally {
    CS_STATE.loading = false;
    csRender();
  }
}

function csSetMinAgree(n) {
  csLoad(parseInt(n, 10) || 3);
}

var CS_SYSTEM_ICON = {
  'Unified Screener': '📊',
  'Strategy Engine': '🎯',
  'Opportunity Radar': '🧭',
  'Volume Spike': '⚡',
  'Quant Screener': '🔬'
};

function csRenderRow(row) {
  var badges = row.agreeSystems.map(function (sys) {
    return '<span class="badge b-up" style="font-size:9px;margin-right:4px">' + (CS_SYSTEM_ICON[sys] || '') + ' ' + sys + '</span>';
  }).join('');
  var voteDetails = row.votes.map(function (v) {
    return '<div style="font-size:10.5px;color:var(--text3);margin-top:2px">' + (CS_SYSTEM_ICON[v.system] || '') + ' <b>' + v.system + '</b>: ' + v.detail + '</div>';
  }).join('');

  // FIX (2026-09-29, user-reported: broker/bandar analysis missing +
  // stale price letting an already-crashed stock look "bullish"): price/
  // chg1d below are now LIVE (row.priceIsLive) whenever generateScreenerConsensus()
  // managed to fetch a real quote for this row — priceWarning surfaces
  // honestly when that live price has already moved sharply against the
  // (cache-based) consensus signal, instead of hiding the mismatch.
  var priceCell = (row.chg1d != null ? ((row.chg1d >= 0 ? '+' : '') + row.chg1d.toFixed(2) + '%') : '-')
    + (row.priceIsLive === false ? ' <span title="Kuota real-time gagal — masih data cache, bisa beberapa hari lalu">⚠</span>' : '');

  var accHtml = '<div style="font-size:10px;color:var(--text3);margin-top:2px">Tidak ada sinyal akumulasi/distribusi ' + (row.netAccumulation ? row.netAccumulation.daysWindow : 10) + ' hari terakhir</div>';
  if (row.netAccumulation && row.netAccumulation.netScore != null) {
    var na = row.netAccumulation;
    var naColor = na.direction === 'AKUMULASI' ? 'var(--green)' : 'var(--red)';
    accHtml = '<div style="font-size:10.5px;color:' + naColor + ';font-weight:700;margin-top:2px">'
      + na.direction + ' ' + na.daysWindow + 'H (skor ' + (na.netScore > 0 ? '+' : '') + na.netScore + ', muncul ' + na.daysAppeared + '/' + na.daysWithData + ' hari)'
      + '</div>';
  }
  var brokerHtml = row.topBroker
    ? '<div style="font-size:10.5px;color:var(--text2);margin-top:2px">Top Buyer: <b>' + row.topBroker.code + '</b> (Rp ' + (row.topBroker.valueRp / 1e9).toFixed(2) + ' M)</div>'
    : '<div style="font-size:10px;color:var(--text3);margin-top:2px">Data broker tidak tersedia</div>';

  var warningHtml = row.priceWarning
    ? '<div style="background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.3);border-radius:6px;padding:4px 8px;margin-top:4px;font-size:10px;color:var(--red)">⚠ ' + row.priceWarning + '</div>'
    : '';

  return '<tr>'
    + '<td><span class="mono" style="font-weight:800;color:var(--text)">' + row.ticker + '</span><div style="font-size:10px;color:var(--text3)">' + row.name + '</div></td>'
    + '<td style="font-size:11px;color:var(--text2)">' + (row.sector || '-') + '</td>'
    + '<td class="mono" style="text-align:right;font-weight:700;color:var(--green)">' + row.agreeCount + '/5</td>'
    + '<td>' + badges + voteDetails + warningHtml + '</td>'
    + '<td class="mono" style="text-align:right;color:' + (row.chg1d >= 0 ? 'var(--green)' : 'var(--red)') + '">' + priceCell + '</td>'
    + '<td>' + accHtml + brokerHtml + '</td>'
    + '<td style="text-align:center"><button onclick="selectStockChatTicker(\'' + row.ticker + '\')" class="btn btn-ghost btn-xs">Detail</button></td>'
    + '</tr>';
}

function csRender() {
  var mount = document.getElementById('cs-mount');
  if (!mount) return;

  var minAgreeButtons = [3, 4, 5].map(function (n) {
    var active = CS_STATE.minAgree === n;
    return '<button class="btn btn-ghost btn-sm" onclick="csSetMinAgree(' + n + ')" style="font-weight:700;' + (active ? 'background:rgba(34,197,94,0.15);border-color:var(--green);color:var(--green)' : '') + '">' + n + ' dari 5 sepakat</button>';
  }).join('');

  var intro = '<div class="card" style="padding:16px;margin-bottom:14px">'
    + '<div style="font-weight:700;font-size:13px;margin-bottom:4px">✅ Konsensus Screener</div>'
    + '<div style="font-size:11.5px;color:var(--text3);margin-bottom:10px">Ticker hanya tampil kalau disetujui beberapa sistem screening SEKALIGUS (Unified Screener, Strategy Engine, Opportunity Radar, Volume Spike, Quant Screener) — bukan mesin skor baru, murni filter AND di atas ambang yang sudah ada di masing-masing halaman. Radar Akumulasi/Distribusi TIDAK dihitung terpisah karena sudah termasuk di dalam skor Unified Screener.</div>'
    + '<div style="display:flex;gap:8px;flex-wrap:wrap">' + minAgreeButtons + '</div>'
    + '</div>';

  if (CS_STATE.loading && !CS_STATE.data) {
    mount.innerHTML = intro + '<div class="card" style="padding:24px;text-align:center;color:var(--text3);font-size:12px">Memindai seluruh BEI lewat 5 sistem screening (bisa beberapa detik)...</div>';
    return;
  }
  if (CS_STATE.error) {
    mount.innerHTML = intro + '<div class="card" style="padding:16px;color:var(--text3);font-size:12px">Gagal memuat Konsensus Screener: ' + CS_STATE.error + '</div>';
    return;
  }
  if (!CS_STATE.data) {
    mount.innerHTML = intro;
    return;
  }

  var data = CS_STATE.data;
  var rows = data.results || [];
  var tableHtml;
  if (!rows.length) {
    tableHtml = '<div class="card" style="padding:24px;text-align:center;color:var(--text3);font-size:12px">'
      + 'Tidak ada saham yang disetujui ' + data.minAgree + ' dari 5 sistem sekaligus hari ini dari ' + data.universeScanned + ' emiten yang dipindai.'
      + '<div style="margin-top:6px;font-size:11px">Ini bukan bug — artinya memang belum ada saham dengan sinyal bullish yang cukup kuat/konsisten hari ini. Coba turunkan ambang ke 3 dari 5, atau cek lagi besok.</div>'
      + '</div>';
  } else {
    tableHtml = '<div class="card" style="padding:16px">'
      + '<div style="font-size:11px;color:var(--text3);margin-bottom:10px">' + rows.length + ' saham disetujui ≥' + data.minAgree + ' dari 5 sistem, dari total ' + data.universeScanned + ' emiten dipindai.</div>'
      + '<div class="tbl-wrap" style="overflow-x:auto">'
      + '<table class="tbl" style="width:100%;font-size:12px">'
      + '<thead><tr><th>Emiten</th><th>Sektor</th><th style="text-align:right">Konsensus</th><th>Sistem yang Setuju</th><th style="text-align:right">Perubahan</th><th>Akumulasi Bandar &amp; Broker ' + uiInfoIcon('Akumulasi/Distribusi dijumlahkan dari skor ranking relatif Invezgo lintas beberapa hari (BUKAN Rupiah) — "muncul X/Y hari" menandakan konsistensi. Top Buyer adalah broker dengan nilai beli terbesar hari ini (data real per-ticker, bukan whole-market). Keduanya informasi tambahan, TIDAK ikut menentukan skor Konsensus di atas.') + '</th><th style="text-align:center">Aksi</th></tr></thead>'
      + '<tbody>' + rows.map(csRenderRow).join('') + '</tbody>'
      + '</table></div></div>';
  }

  mount.innerHTML = intro + tableHtml;
}

function csScreenerSubPageHtml() {
  return '<div id="cs-mount"></div>';
}

function csInit() {
  if (!CS_STATE.data && !CS_STATE.loading) csLoad(CS_STATE.minAgree);
  else csRender();
}

if (typeof window !== 'undefined') {
  window.csInit = csInit;
  window.csLoad = csLoad;
  window.csSetMinAgree = csSetMinAgree;
  window.csScreenerSubPageHtml = csScreenerSubPageHtml;
}
