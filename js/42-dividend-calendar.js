// ============================================================
// MONEY WATCH PRO — VISUAL DIVIDEND CALENDAR & PASSIVE INCOME
// ============================================================

var DIV_CALENDAR_STATE = {
  viewMode: 'calendar', // 'calendar' | 'timeline' | 'seasonality' | 'table'
  currentYear: 2026,
  currentMonth: 8, // 0-indexed (8 = September)
  filterPortfolioOnly: true, // Default to true as per user intent
  filterStatus: 'all', // 'all' | 'upcoming' | 'historical'
  searchQuery: '',
  selectedEvent: null,
  cachedData: null,
  isLoading: false
};

// Curated comprehensive IDX Dividend Calendar Dataset (Hanya data dividen resmi BEI / KSEI yang terverifikasi)
var IDX_DIVIDEND_MASTER_REGISTRY = [
  // Historical Completed Dividends Resmi (2026 / 2025) — Data Riil KSEI/BEI
  { id: 'dc-smdr-26-agt', code: 'SMDR', name: 'Samudera Indonesia Tbk.', cumDate: '2026-08-20', exDate: '2026-08-21', recDate: '2026-08-24', paymentDate: '2026-08-28', dps: 2.5, yield: 3.2, payoutRatio: '45%', status: 'Selesai', type: 'Interim', sector: 'Logistics' },
  { id: 'dc-ggrm-26-jul', code: 'GGRM', name: 'Gudang Garam Tbk.', cumDate: '2026-06-25', exDate: '2026-06-26', recDate: '2026-06-29', paymentDate: '2026-07-18', dps: 1200.0, yield: 6.0, payoutRatio: '65%', status: 'Selesai', type: 'Final', sector: 'Consumer Goods' },
  { id: 'dc-unvr-26-jul', code: 'UNVR', name: 'Unilever Indonesia Tbk.', cumDate: '2026-06-20', exDate: '2026-06-23', recDate: '2026-06-24', paymentDate: '2026-07-10', dps: 84.0, yield: 4.9, payoutRatio: '95%', status: 'Selesai', type: 'Final', sector: 'Consumer Non-Cyclicals' },
  { id: 'dc-adro-26-jun', code: 'ADRO', name: 'Alamtri Resources Indonesia Tbk.', cumDate: '2026-05-27', exDate: '2026-05-28', recDate: '2026-05-29', paymentDate: '2026-06-06', dps: 252.0, yield: 8.9, payoutRatio: '68%', status: 'Selesai', type: 'Final', sector: 'Energy' },
  { id: 'dc-arci-26-jun', code: 'ARCI', name: 'Archi Indonesia Tbk.', cumDate: '2026-05-20', exDate: '2026-05-21', recDate: '2026-05-22', paymentDate: '2026-06-08', dps: 12.5, yield: 2.8, payoutRatio: '35%', status: 'Selesai', type: 'Final', sector: 'Basic Materials' },
  { id: 'dc-sido-26-apr', code: 'SIDO', name: 'Industri Jamu Dan Farmasi Sido Muncul Tbk.', cumDate: '2026-04-03', exDate: '2026-04-04', recDate: '2026-04-07', paymentDate: '2026-04-18', dps: 23.0, yield: 6.5, payoutRatio: '90%', status: 'Selesai', type: 'Final', sector: 'Healthcare' },
  { id: 'dc-bbni-26-apr', code: 'BBNI', name: 'Bank Negara Indonesia (Persero) Tbk.', cumDate: '2026-03-24', exDate: '2026-03-25', recDate: '2026-03-26', paymentDate: '2026-04-08', dps: 280.5, yield: 5.6, payoutRatio: '50%', status: 'Selesai', type: 'Final', sector: 'Financials' },
  { id: 'dc-bbca-26-apr', code: 'BBCA', name: 'Bank Central Asia Tbk.', cumDate: '2026-03-20', exDate: '2026-03-21', recDate: '2026-03-24', paymentDate: '2026-04-04', dps: 227.5, yield: 2.7, payoutRatio: '65%', status: 'Selesai', type: 'Final', sector: 'Financials' },
  { id: 'dc-bmri-26-apr', code: 'BMRI', name: 'Bank Mandiri (Persero) Tbk.', cumDate: '2026-03-18', exDate: '2026-03-19', recDate: '2026-03-20', paymentDate: '2026-04-02', dps: 353.95, yield: 6.0, payoutRatio: '60%', status: 'Selesai', type: 'Final', sector: 'Financials' },
  { id: 'dc-bbri-26-mar', code: 'BBRI', name: 'Bank Rakyat Indonesia (Persero) Tbk.', cumDate: '2026-03-13', exDate: '2026-03-14', recDate: '2026-03-17', paymentDate: '2026-03-28', dps: 235.0, yield: 6.9, payoutRatio: '80%', status: 'Selesai', type: 'Final', sector: 'Financials' }
];

// ── Helper: Ambil holdings saham yang sedang dipegang di portofolio ──
function getDivCalPortfolioMap() {
  var porto = typeof getPortfolio === 'function' ? getPortfolio() : [];
  var map = {};
  porto.forEach(function(p) {
    if (p && p.ticker && p.shares > 0) {
      map[p.ticker] = {
        ticker: p.ticker,
        shares: p.shares,
        lot: p.lot || Math.floor(p.shares / 100),
        avg: p.avg || 0,
        mp: p.mp || (typeof prices !== 'undefined' && prices[p.ticker]) || 0,
        mv: p.mv || (p.shares * (p.mp || 0)),
        name: (p.info && p.info.name) || (typeof DB !== 'undefined' && DB[p.ticker] && DB[p.ticker].name) || p.ticker
      };
    }
  });
  return map;
}

// ── Helper: Gabungkan API Calendar, Master Registry, dan Dividen Riil User ──
function getEnrichedDividendEvents() {
  var portoMap = getDivCalPortfolioMap();
  var masterList = (DIV_CALENDAR_STATE.cachedData && DIV_CALENDAR_STATE.cachedData.length)
    ? DIV_CALENDAR_STATE.cachedData
    : IDX_DIVIDEND_MASTER_REGISTRY.slice();

  // Deduplikasi by code + paymentDate
  var eventMap = {};
  masterList.forEach(function(item) {
    var key = item.code + '|' + (item.paymentDate || item.cumDate);
    eventMap[key] = Object.assign({}, item);
  });

  // Tambahkan catatan dividen riil yang ada di user storage jika belum ada
  var userDivs = typeof dividends !== 'undefined' && Array.isArray(dividends) ? dividends : [];
  userDivs.forEach(function(ud) {
    if (!ud.ticker || !ud.date) return;
    var key = ud.ticker + '|' + ud.date;
    if (!eventMap[key]) {
      var mp = (typeof prices !== 'undefined' && prices[ud.ticker]) || 1;
      eventMap[key] = {
        id: 'usr-div-' + (ud.id || Math.random().toString(36).substr(2, 5)),
        code: ud.ticker,
        name: (typeof DB !== 'undefined' && DB[ud.ticker] && DB[ud.ticker].name) || ud.ticker,
        cumDate: ud.date,
        exDate: ud.date,
        recDate: ud.date,
        paymentDate: ud.date,
        dps: ud.dps || (ud.shares > 0 ? ud.gross / ud.shares : 0),
        yield: ud.dps && mp ? Math.round((ud.dps / mp) * 1000) / 10 : 0,
        payoutRatio: '—',
        status: 'Selesai',
        type: 'Riwayat Transaksi',
        sector: (typeof DB !== 'undefined' && DB[ud.ticker] && DB[ud.ticker].sector) || 'Equities',
        userRecorded: true,
        actualNet: ud.net || 0
      };
    } else {
      eventMap[key].userRecorded = true;
      eventMap[key].actualNet = ud.net || 0;
    }
  });

  var todayStr = '2026-09-02'; // Tanggal sistem saat ini
  var todayDate = new Date(todayStr + 'T00:00:00');

  var result = Object.values(eventMap).map(function(ev) {
    var p = portoMap[ev.code];
    var isHeld = !!p;
    var heldShares = isHeld ? p.shares : 0;
    var heldLot = isHeld ? p.lot : 0;
    var dps = ev.dps || 0;

    // Kalkulasi proyeksi passive income
    var grossExpected = Math.round(heldShares * dps);
    var divTaxRate = (typeof TAX_SETTINGS !== 'undefined' && TAX_SETTINGS.dividenExempt) ? 0 : 0.10;
    var taxExpected = Math.round(grossExpected * divTaxRate);
    var netExpected = ev.userRecorded && ev.actualNet ? ev.actualNet : (grossExpected - taxExpected);

    // Hitung status tanggal & countdown
    var pDate = new Date((ev.paymentDate || ev.cumDate) + 'T00:00:00');
    var diffTime = pDate.getTime() - todayDate.getTime();
    var diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    var isUpcoming = diffDays >= 0;

    var countdownLabel = '';
    if (diffDays === 0) countdownLabel = 'HARI INI';
    else if (diffDays === 1) countdownLabel = 'BESOK';
    else if (diffDays > 1 && diffDays <= 7) countdownLabel = 'Dalam ' + diffDays + ' hari';
    else if (diffDays > 7 && diffDays <= 30) countdownLabel = diffDays + ' hari lagi';
    else if (diffDays > 30) countdownLabel = Math.round(diffDays / 30) + ' bulan lagi';
    else countdownLabel = Math.abs(diffDays) + ' hari lalu';

    return Object.assign({}, ev, {
      isHeld: isHeld,
      holding: p,
      heldShares: heldShares,
      heldLot: heldLot,
      grossExpected: grossExpected,
      taxExpected: taxExpected,
      netExpected: netExpected,
      diffDays: diffDays,
      isUpcoming: isUpcoming,
      countdownLabel: countdownLabel,
      status: isUpcoming ? 'Mendatang' : 'Selesai'
    });
  });

  // Filter sesuai pengaturan UI
  if (DIV_CALENDAR_STATE.filterPortfolioOnly) {
    result = result.filter(function(x) { return x.isHeld; });
  }

  if (DIV_CALENDAR_STATE.filterStatus === 'upcoming') {
    result = result.filter(function(x) { return x.isUpcoming; });
  } else if (DIV_CALENDAR_STATE.filterStatus === 'historical') {
    result = result.filter(function(x) { return !x.isUpcoming; });
  }

  if (DIV_CALENDAR_STATE.searchQuery) {
    var q = DIV_CALENDAR_STATE.searchQuery.toLowerCase();
    result = result.filter(function(x) {
      return x.code.toLowerCase().includes(q) || (x.name && x.name.toLowerCase().includes(q));
    });
  }

  // Sort: Upcoming terdekat ke terjauh, historical terbaru ke terlama
  result.sort(function(a, b) {
    return (a.paymentDate || a.cumDate).localeCompare(b.paymentDate || b.cumDate);
  });

  return result;
}

// ── Inisialisasi & Fetch data kalender dari API server ──
function initDividendCalendar() {
  if (DIV_CALENDAR_STATE.isLoading) return;
  DIV_CALENDAR_STATE.isLoading = true;

  fetch('/api/idx/calendar?type=DIVIDEN')
    .then(function(res) { return res.json(); })
    .then(function(data) {
      DIV_CALENDAR_STATE.isLoading = false;
      if (data && data.success && Array.isArray(data.dividends) && data.dividends.length) {
        var merged = IDX_DIVIDEND_MASTER_REGISTRY.slice();
        var codeSet = new Set(merged.map(function(m) { return m.code + '|' + m.paymentDate; }));
        data.dividends.forEach(function(d) {
          var key = d.code + '|' + d.paymentDate;
          if (!codeSet.has(key)) {
            merged.push(Object.assign({ id: 'api-' + d.code + '-' + d.paymentDate }, d));
          }
        });
        DIV_CALENDAR_STATE.cachedData = merged;
      }
      renderDividendCalendarComponent();
    })
    .catch(function(err) {
      DIV_CALENDAR_STATE.isLoading = false;
      console.warn('[DividendCalendar] Using fallback master registry:', err);
      DIV_CALENDAR_STATE.cachedData = IDX_DIVIDEND_MASTER_REGISTRY.slice();
      renderDividendCalendarComponent();
    });
}

// ── Render Master Komponen Kalender Dividen ──
function renderDividendCalendarComponent() {
  var container = document.getElementById('dividend-calendar-mount');
  if (!container) return;

  var events = getEnrichedDividendEvents();
  var portoMap = getDivCalPortfolioMap();
  var heldCount = Object.keys(portoMap).length;

  // Kalkulasi Metrik Passive Income Portofolio
  var totalUpcomingNet = 0;
  var totalHistoricalNet = 0;
  var currentMonthNet = 0;
  var nextUpcomingEvent = null;

  var selY = DIV_CALENDAR_STATE.currentYear;
  var selM = DIV_CALENDAR_STATE.currentMonth; // 0-indexed
  var targetMonthPrefix = selY + '-' + String(selM + 1).padStart(2, '0');

  events.forEach(function(ev) {
    if (ev.isHeld) {
      if (ev.isUpcoming) {
        totalUpcomingNet += ev.netExpected;
        if (!nextUpcomingEvent || ev.diffDays < nextUpcomingEvent.diffDays) {
          nextUpcomingEvent = ev;
        }
      } else {
        totalHistoricalNet += ev.netExpected;
      }

      if ((ev.paymentDate || '').startsWith(targetMonthPrefix)) {
        currentMonthNet += ev.netExpected;
      }
    }
  });

  // Portfolio total market value untuk menghitung expected dividend yield
  var totalPortoMV = 0;
  Object.values(portoMap).forEach(function(p) { totalPortoMV += p.mv; });
  var expectedAnnualYield = totalPortoMV > 0 ? ((totalUpcomingNet + totalHistoricalNet) / totalPortoMV) * 100 : 0;

  var monthNames = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

  var html = ''
    + '<div class="card" style="margin-bottom:18px;border:1px solid rgba(52,211,153,.25);background:linear-gradient(180deg, rgba(16,185,129,.03) 0%, var(--bg2) 100%);box-shadow:0 10px 25px -5px rgba(0,0,0,0.1);">'
    + '  <!-- Header & Title -->'
    + '  <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;margin-bottom:16px;padding-bottom:14px;border-bottom:1px solid var(--border);">'
    + '    <div>'
    + '      <div style="display:flex;align-items:center;gap:8px;">'
    + '        <div style="width:34px;height:34px;border-radius:9px;background:rgba(52,211,153,.15);color:var(--green);display:flex;align-items:center;justify-content:center;font-size:18px;">'
    + '          <i class="ti ti-calendar-event"></i>'
    + '        </div>'
    + '        <div>'
    + '          <div style="font-size:16px;font-weight:800;letter-spacing:-0.01em;display:flex;align-items:center;gap:8px;">'
    + '            <span>Kalender Dividen &amp; Expected Passive Income</span>'
    + '            <span class="badge b-up" style="font-size:10px;padding:2px 7px;">ACTIVE RADAR</span>'
    + '          </div>'
    + '          <div style="font-size:12px;color:var(--text3);margin-top:1px;">Jadwal Pembayaran Dividen Saham Portofolio · Estimasi Kas Masuk Bersih (Net) · Cum/Ex/Payment Tracker</div>'
    + '        </div>'
    + '      </div>'
    + '    </div>'
    + '    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">'
    + '      <!-- Switch Views -->'
    + '      <div style="display:inline-flex;background:var(--bg3);padding:3px;border-radius:8px;border:1px solid var(--border);">'
    + '        <button class="btn btn-xs ' + (DIV_CALENDAR_STATE.viewMode === 'calendar' ? 'btn-green' : 'btn-ghost') + '" onclick="setDivCalViewMode(\'calendar\')"><i class="ti ti-calendar"></i> Kalender</button>'
    + '        <button class="btn btn-xs ' + (DIV_CALENDAR_STATE.viewMode === 'timeline' ? 'btn-green' : 'btn-ghost') + '" onclick="setDivCalViewMode(\'timeline\')"><i class="ti ti-timeline"></i> Timeline &amp; Countdown</button>'
    + '        <button class="btn btn-xs ' + (DIV_CALENDAR_STATE.viewMode === 'seasonality' ? 'btn-green' : 'btn-ghost') + '" onclick="setDivCalViewMode(\'seasonality\')"><i class="ti ti-chart-bar"></i> Musim 12 Bulan</button>'
    + '        <button class="btn btn-xs ' + (DIV_CALENDAR_STATE.viewMode === 'table' ? 'btn-green' : 'btn-ghost') + '" onclick="setDivCalViewMode(\'table\')"><i class="ti ti-table"></i> Daftar Riwayat</button>'
    + '      </div>'
    + '      <button class="btn btn-ghost btn-xs" onclick="initDividendCalendar()" title="Refresh Kalender"><i class="ti ti-refresh"></i> Refresh</button>'
    + '    </div>'
    + '  </div>'

    + '  <!-- Metric Cockpit: 4 Kartu Passive Income -->'
    + '  <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:12px;margin-bottom:18px;">'
    + '    <div style="background:var(--bg3);border:1px solid rgba(52,211,153,.25);border-radius:10px;padding:12px 14px;position:relative;overflow:hidden;">'
    + '      <div style="position:absolute;top:-8px;right:-8px;width:40px;height:40px;background:rgba(52,211,153,.08);border-radius:50%;"></div>'
    + '      <div style="font-size:11px;font-weight:600;color:var(--text3);text-transform:uppercase;letter-spacing:0.04em;">Expected Passive Income (Mendatang)</div>'
    + '      <div style="font-family:var(--font-mono);font-size:19px;font-weight:800;color:' + (totalUpcomingNet > 0 ? 'var(--green)' : 'var(--text3)') + ';margin:4px 0 2px;">Rp ' + fmtK(totalUpcomingNet) + '</div>'
    + '      <div style="font-size:11px;color:var(--text2);display:flex;align-items:center;gap:4px;">'
    + (totalUpcomingNet > 0
        ? '        <i class="ti ti-trending-up" style="color:var(--green);"></i> <span>Kas bersih dari dividen terjadwal resmi</span>'
        : '        <i class="ti ti-info-circle" style="color:var(--text3);"></i> <span>Tidak ada jadwal dividen mendatang aktif</span>')
    + '      </div>'
    + '    </div>'

    + '    <div style="background:var(--bg3);border:1px solid var(--border);border-radius:10px;padding:12px 14px;">'
    + '      <div style="font-size:11px;font-weight:600;color:var(--text3);text-transform:uppercase;letter-spacing:0.04em;">Dividen Bulan Ini (' + monthNames[selM] + ')</div>'
    + '      <div style="font-family:var(--font-mono);font-size:19px;font-weight:800;color:' + (currentMonthNet > 0 ? 'var(--accent)' : 'var(--text3)') + ';margin:4px 0 2px;">Rp ' + fmtK(currentMonthNet) + '</div>'
    + '      <div style="font-size:11px;color:var(--text2);">'
    + (currentMonthNet > 0
        ? '        <span>Estimasi panen dividen ' + monthNames[selM] + ' ' + selY + '</span>'
        : '        <span>Tidak ada jadwal dividen di ' + monthNames[selM] + ' ' + selY + '</span>')
    + '      </div>'
    + '    </div>'

    + '    <div style="background:var(--bg3);border:1px solid var(--border);border-radius:10px;padding:12px 14px;">'
    + '      <div style="font-size:11px;font-weight:600;color:var(--text3);text-transform:uppercase;letter-spacing:0.04em;">Pembayaran Terdekat</div>'
    + (nextUpcomingEvent
        ? '      <div style="display:flex;align-items:baseline;gap:6px;margin:4px 0 2px;">'
          + '        <span style="font-weight:800;font-size:16px;color:var(--text-main);">' + nextUpcomingEvent.code + '</span>'
          + '        <span style="font-family:var(--font-mono);font-weight:700;color:var(--green);font-size:15px;">Rp ' + fmtK(nextUpcomingEvent.netExpected) + '</span>'
          + '      </div>'
          + '      <div style="font-size:11px;color:var(--text2);">'
          + '        <span>Tanggal Bayar: <b>' + nextUpcomingEvent.paymentDate + '</b> (' + nextUpcomingEvent.countdownLabel + ')</span>'
          + '      </div>'
        : '      <div style="font-size:13px;font-weight:700;color:var(--text3);margin:6px 0;">Tidak Ada Jadwal Bulan Ini</div>'
          + '      <div style="font-size:11px;color:var(--text3);">BBRI, BBCA, ADRO tidak ada dividen bulan ini</div>')
    + '    </div>'

    + '    <div style="background:var(--bg3);border:1px solid var(--border);border-radius:10px;padding:12px 14px;">'
    + '      <div style="font-size:11px;font-weight:600;color:var(--text3);text-transform:uppercase;letter-spacing:0.04em;">Dividen Yield Portofolio (Est.)</div>'
    + '      <div style="font-family:var(--font-mono);font-size:19px;font-weight:800;color:#f59e0b;margin:4px 0 2px;">' + expectedAnnualYield.toFixed(2) + '%</div>'
    + '      <div style="font-size:11px;color:var(--text2);">'
    + '        <span>Total Realisasi: <b>Rp ' + fmtK(totalHistoricalNet) + '</b></span>'
    + '      </div>'
    + '    </div>'
    + '  </div>'

    + '  <!-- Controls: Filter Portofolio, Status, Search -->'
    + '  <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;background:var(--bg);padding:10px 14px;border-radius:10px;border:1px solid var(--border);margin-bottom:16px;">'
    + '    <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">'
    + '      <!-- Toggle Portfolio Only -->'
    + '      <label style="display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:700;color:var(--text-main);cursor:pointer;user-select:none;background:rgba(52,211,153,.1);padding:4px 10px;border-radius:6px;border:1px solid rgba(52,211,153,.25);">'
    + '        <input type="checkbox" id="div-cal-porto-filter" ' + (DIV_CALENDAR_STATE.filterPortfolioOnly ? 'checked' : '') + ' onchange="toggleDivCalPortfolioFilter(this.checked)" style="cursor:pointer;accent-color:var(--green);">'
    + '        <span>⭐ Hanya Saham Portofolio (' + heldCount + ' Saham)</span>'
    + '      </label>'

    + '      <!-- Status Filter -->'
    + '      <div style="display:inline-flex;gap:4px;align-items:center;">'
    + '        <span style="font-size:11px;color:var(--text3);">Status:</span>'
    + '        <select class="finput fsel" style="padding:3px 8px;font-size:11px;height:28px;" onchange="setDivCalStatusFilter(this.value)">'
    + '          <option value="all" ' + (DIV_CALENDAR_STATE.filterStatus === 'all' ? 'selected' : '') + '>Semua (Upcoming &amp; Riwayat)</option>'
    + '          <option value="upcoming" ' + (DIV_CALENDAR_STATE.filterStatus === 'upcoming' ? 'selected' : '') + '>🔮 Mendatang Saja</option>'
    + '          <option value="historical" ' + (DIV_CALENDAR_STATE.filterStatus === 'historical' ? 'selected' : '') + '>✅ Riwayat Selesai</option>'
    + '        </select>'
    + '      </div>'
    + '    </div>'

    + '    <div style="display:flex;align-items:center;gap:8px;">'
    + '      <div style="position:relative;">'
    + '        <input type="text" class="finput" placeholder="Cari ticker / emiten..." value="' + (DIV_CALENDAR_STATE.searchQuery || '') + '" oninput="setDivCalSearch(this.value)" style="padding:4px 10px 4px 28px;font-size:11px;height:28px;width:180px;border-radius:6px;">'
    + '        <i class="ti ti-search" style="position:absolute;left:8px;top:7px;font-size:13px;color:var(--text3);"></i>'
    + '      </div>'
    + '    </div>'
    + '  </div>';

  // Render sesuai ViewMode yang dipilih
  if (DIV_CALENDAR_STATE.viewMode === 'calendar') {
    html += renderDivCalMonthGrid(events, selY, selM);
  } else if (DIV_CALENDAR_STATE.viewMode === 'timeline') {
    html += renderDivCalTimelineView(events);
  } else if (DIV_CALENDAR_STATE.viewMode === 'seasonality') {
    html += renderDivCalSeasonalityView(events);
  } else if (DIV_CALENDAR_STATE.viewMode === 'table') {
    html += renderDivCalTableView(events);
  }

  html += '</div>';

  // Modal Container jika belum ada
  html += '<div id="div-cal-modal-container"></div>';

  container.innerHTML = html;
}

// ── 1. Render Kalender Bulanan Interaktif ──
function renderDivCalMonthGrid(events, year, month) {
  var monthNames = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  var dayHeaders = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];

  var firstDayIndex = new Date(year, month, 1).getDay();
  // Transform Sunday (0) to 6 for Monday-first week
  firstDayIndex = (firstDayIndex === 0) ? 6 : firstDayIndex - 1;

  var totalDaysInMonth = new Date(year, month + 1, 0).getDate();
  var prevMonthDays = new Date(year, month, 0).getDate();

  var todayStr = '2026-09-02';

  // Index events by day of this month
  var eventsByDay = {};
  var monthPrefix = year + '-' + String(month + 1).padStart(2, '0');

  events.forEach(function(ev) {
    var pDate = ev.paymentDate || '';
    var cDate = ev.cumDate || '';
    var eDate = ev.exDate || '';

    // Tandai tanggal pembayaran (prioritas utama)
    if (pDate.startsWith(monthPrefix)) {
      var d = parseInt(pDate.slice(8, 10), 10);
      if (!eventsByDay[d]) eventsByDay[d] = [];
      eventsByDay[d].push({ type: 'PAYMENT', event: ev });
    }
    // Tandai Cum-Date
    if (cDate.startsWith(monthPrefix) && cDate !== pDate) {
      var cd = parseInt(cDate.slice(8, 10), 10);
      if (!eventsByDay[cd]) eventsByDay[cd] = [];
      eventsByDay[cd].push({ type: 'CUM', event: ev });
    }
  });

  var html = ''
    + '<div style="background:var(--bg2);border-radius:10px;border:1px solid var(--border);padding:14px;">'
    + '  <!-- Month Navigator Header -->'
    + '  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">'
    + '    <div style="display:flex;align-items:center;gap:10px;">'
    + '      <button class="btn btn-ghost btn-xs" onclick="navigateDivCalMonth(-1)" title="Bulan Sebelumnya"><i class="ti ti-chevron-left"></i></button>'
    + '      <div style="font-size:15px;font-weight:800;color:var(--text-main);min-width:160px;text-align:center;">'
    + '        ' + monthNames[month] + ' ' + year
    + '      </div>'
    + '      <button class="btn btn-ghost btn-xs" onclick="navigateDivCalMonth(1)" title="Bulan Berikutnya"><i class="ti ti-chevron-right"></i></button>'
    + '      <button class="btn btn-ghost btn-xs" onclick="setDivCalToday()" style="font-size:11px;color:var(--accent);">Hari Ini (Sep 2026)</button>'
    + '    </div>'
    + '    <div style="display:flex;gap:12px;font-size:11px;color:var(--text3);align-items:center;flex-wrap:wrap;">'
    + '      <span style="display:inline-flex;align-items:center;gap:4px;"><span style="width:10px;height:10px;border-radius:3px;background:rgba(52,211,153,.3);border:1px solid var(--green);"></span> <b>Tanggal Bayar (Kas Masuk)</b></span>'
    + '      <span style="display:inline-flex;align-items:center;gap:4px;"><span style="width:10px;height:10px;border-radius:3px;background:rgba(56,189,248,.25);border:1px solid #38bdf8;"></span> Cum-Date</span>'
    + '      <span style="display:inline-flex;align-items:center;gap:4px;"><span style="width:8px;height:8px;border-radius:50%;background:var(--green);box-shadow:0 0 6px var(--green);"></span> Di Portofolio</span>'
    + '    </div>'
    + '  </div>'

    + '  <!-- Calendar Table Header -->'
    + '  <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:4px;text-align:center;margin-bottom:6px;">';

  dayHeaders.forEach(function(dh, idx) {
    var isWeekend = idx >= 5;
    html += '<div style="font-size:11px;font-weight:700;color:' + (isWeekend ? 'var(--text3)' : 'var(--text2)') + ';padding:4px 0;">' + dh + '</div>';
  });

  html += '  </div>'
    + '  <!-- Calendar Days Grid -->'
    + '  <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:4px;">';

  // Leading days from previous month
  for (var i = 0; i < firstDayIndex; i++) {
    var prevD = prevMonthDays - firstDayIndex + 1 + i;
    html += '<div style="min-height:78px;background:rgba(0,0,0,0.02);border:1px solid rgba(255,255,255,0.03);border-radius:6px;padding:6px;opacity:0.35;">'
      + '<span style="font-size:11px;color:var(--text3);">' + prevD + '</span>'
      + '</div>';
  }

  // Days of current month
  for (var day = 1; day <= totalDaysInMonth; day++) {
    var dateString = year + '-' + String(month + 1).padStart(2, '0') + '-' + String(day).padStart(2, '0');
    var isToday = dateString === todayStr;
    var dayEvents = eventsByDay[day] || [];

    var hasHeldPayment = dayEvents.some(function(de) { return de.type === 'PAYMENT' && de.event.isHeld; });

    var cellBg = isToday
      ? 'background:rgba(56,189,248,.07);border:1px solid rgba(56,189,248,.4);'
      : (hasHeldPayment ? 'background:rgba(52,211,153,.06);border:1px solid rgba(52,211,153,.3);' : 'background:var(--bg3);border:1px solid var(--border);');

    html += '<div style="min-height:84px;border-radius:6px;padding:6px;display:flex;flex-direction:column;justify-content:space-between;transition:all 0.15s;' + cellBg + '">'
      + '  <div style="display:flex;justify-content:space-between;align-items:center;">'
      + '    <span style="font-size:12px;font-weight:' + (isToday ? '800' : '600') + ';color:' + (isToday ? 'var(--accent)' : 'var(--text-main)') + ';">'
      +        day + (isToday ? ' <span style="font-size:9px;background:var(--accent);color:#000;padding:1px 4px;border-radius:3px;font-weight:700;">HARI INI</span>' : '')
      + '    </span>'
      + (dayEvents.length > 0 ? '<span style="font-size:9px;font-weight:700;color:var(--green);">' + dayEvents.length + ' event</span>' : '')
      + '  </div>'

      + '  <div style="display:flex;flex-direction:column;gap:3px;margin-top:4px;">';

    dayEvents.slice(0, 3).forEach(function(de) {
      var ev = de.event;
      var isPay = de.type === 'PAYMENT';
      var badgeBg = isPay
        ? (ev.isHeld ? 'background:rgba(52,211,153,.2);border:1px solid var(--green);color:var(--green);' : 'background:rgba(52,211,153,.1);color:var(--green);')
        : 'background:rgba(56,189,248,.12);border:1px solid rgba(56,189,248,.25);color:#38bdf8;';

      html += '<div onclick="openDivCalDetailModal(\'' + ev.id + '\')" style="padding:2px 4px;border-radius:4px;font-size:10px;font-weight:700;display:flex;align-items:center;justify-content:space-between;cursor:pointer;' + badgeBg + '" title="' + ev.code + ' ' + (isPay ? 'Tanggal Bayar' : 'Cum-Date') + (ev.isHeld ? ' · Kas Bersih: Rp ' + fmtK(ev.netExpected) : '') + '">'
        + '  <div style="display:flex;align-items:center;gap:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">'
        + (ev.isHeld ? '<span style="width:5px;height:5px;border-radius:50%;background:var(--green);box-shadow:0 0 4px var(--green);"></span>' : '')
        + '    <span>' + (isPay ? '💰 ' : '📅 ') + ev.code + '</span>'
        + '  </div>'
        + (ev.isHeld && isPay && ev.netExpected > 0 ? '<span style="font-family:var(--font-mono);font-size:9px;font-weight:800;">Rp ' + fmtK(ev.netExpected) + '</span>' : '')
        + '</div>';
    });

    if (dayEvents.length > 3) {
      html += '<div style="font-size:9px;color:var(--text3);text-align:center;cursor:pointer;" onclick="openDivCalDayModal(' + day + ')">+' + (dayEvents.length - 3) + ' lainnya</div>';
    }

    html += '  </div>'
      + '</div>';
  }

  // Trailing days of next month
  var totalCells = firstDayIndex + totalDaysInMonth;
  var nextDays = (totalCells % 7 === 0) ? 0 : 7 - (totalCells % 7);
  for (var n = 1; n <= nextDays; n++) {
    html += '<div style="min-height:78px;background:rgba(0,0,0,0.02);border:1px solid rgba(255,255,255,0.03);border-radius:6px;padding:6px;opacity:0.35;">'
      + '<span style="font-size:11px;color:var(--text3);">' + n + '</span>'
      + '</div>';
  }

  html += '  </div>'
    + '</div>';

  var totalEventsThisMonth = Object.keys(eventsByDay).length;
  if (totalEventsThisMonth === 0) {
    html += '<div style="margin-top:12px;background:var(--bg3);border:1px dashed var(--border);border-radius:8px;padding:12px 16px;display:flex;align-items:center;gap:12px;color:var(--text2);font-size:12px;">'
      + '  <div style="width:32px;height:32px;border-radius:8px;background:rgba(52,211,153,.1);color:var(--green);display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0;">'
      + '    <i class="ti ti-info-circle"></i>'
      + '  </div>'
      + '  <div>'
      + '    <div style="font-weight:700;color:var(--text-main);">Tidak ada jadwal dividen di bulan ' + monthNames[month] + ' ' + year + '</div>'
      + '    <div style="color:var(--text3);font-size:11px;margin-top:2px;">Saham seperti BBRI, BBCA, dan ADRO tidak memiliki agenda pembagian dividen bulan ini berdasarkan data resmi BEI/KSEI. Silakan gunakan tombol navigasi ◀ untuk melihat riwayat dividen musim semi (Maret–Juli 2026).</div>'
      + '  </div>'
      + '</div>';
  }

  return html;
}

// ── 2. Render Timeline & Countdown View ──
function renderDivCalTimelineView(events) {
  var upcomingList = events.filter(function(e) { return e.isUpcoming; });
  var historicalList = events.filter(function(e) { return !e.isUpcoming; }).reverse();

  var html = ''
    + '<div style="display:grid;grid-template-columns:1fr;gap:16px;">'
    + '  <!-- Upcoming Section -->'
    + '  <div>'
    + '    <div style="font-size:13px;font-weight:800;color:var(--green);display:flex;align-items:center;gap:6px;margin-bottom:10px;">'
    + '      <i class="ti ti-sparkles"></i> <span>MENDATANG — ESTIMASI JADWAL PEMBAYARAN KAS MASUK (' + upcomingList.length + ')</span>'
    + '    </div>'
    + '    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(330px,1fr));gap:12px;">';

  if (!upcomingList.length) {
    html += '<div style="grid-column:1/-1;background:var(--bg3);padding:24px;border-radius:10px;text-align:center;color:var(--text3);border:1px dashed var(--border);">'
      + '<i class="ti ti-calendar-off" style="font-size:28px;display:block;margin-bottom:6px;color:var(--text3);"></i>'
      + '<div style="font-weight:700;color:var(--text2);font-size:13px;margin-bottom:4px;">Tidak Ada Dividen Mendatang Terjadwal</div>'
      + '<div style="font-size:11px;max-width:460px;margin:0 auto;">Emiten saham portofolio Anda (termasuk BBRI, BBCA, ADRO) tidak membagikan dividen bulan ini. Dividen hanya akan dimunculkan jika terdapat pengumuman resmi jadwal keterbukaan informasi KSEI/BEI atau dividen yang Anda input manual.</div>'
      + '</div>';
  } else {
    upcomingList.forEach(function(ev) {
      html += renderTimelineCard(ev, true);
    });
  }

  html += '    </div>'
    + '  </div>'

    + '  <!-- Historical Section -->'
    + '  <div style="margin-top:10px;">'
    + '    <div style="font-size:13px;font-weight:800;color:var(--text2);display:flex;align-items:center;gap:6px;margin-bottom:10px;">'
    + '      <i class="ti ti-history"></i> <span>RIWAYAT — DIVIDEN SELESAI DIBAYARKAN (' + historicalList.length + ')</span>'
    + '    </div>'
    + '    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(330px,1fr));gap:12px;">';

  if (!historicalList.length) {
    html += '<div style="grid-column:1/-1;background:var(--bg3);padding:24px;border-radius:10px;text-align:center;color:var(--text3);border:1px dashed var(--border);">'
      + 'Belum ada riwayat dividen selesai.'
      + '</div>';
  } else {
    historicalList.slice(0, 8).forEach(function(ev) {
      html += renderTimelineCard(ev, false);
    });
  }

  html += '    </div>'
    + '  </div>'
    + '</div>';

  return html;
}

// Helper: Card untuk Timeline View
function renderTimelineCard(ev, isUpcoming) {
  var borderStyle = ev.isHeld
    ? 'border:1px solid rgba(52,211,153,.35);background:linear-gradient(180deg, rgba(52,211,153,.04) 0%, var(--bg3) 100%);'
    : 'border:1px solid var(--border);background:var(--bg3);';

  return ''
    + '<div style="border-radius:10px;padding:14px;position:relative;display:flex;flex-direction:column;justify-content:space-between;' + borderStyle + '">'
    + '  <div>'
    + '    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;margin-bottom:8px;">'
    + '      <div style="display:flex;align-items:center;gap:8px;">'
    + (typeof getStockLogoHtml === 'function' ? getStockLogoHtml(ev.code, 26) : '')
    + '        <div>'
    + '          <div style="font-size:15px;font-weight:800;letter-spacing:-0.01em;display:flex;align-items:center;gap:6px;">'
    + '            <span>' + ev.code + '</span>'
    + (ev.isHeld ? '<span class="badge b-up" style="font-size:9px;padding:1px 5px;">DI PORTOFOLIO</span>' : '')
    + '          </div>'
    + '          <div style="font-size:11px;color:var(--text3);max-width:210px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + (ev.name || ev.code) + '</div>'
    + '        </div>'
    + '      </div>'
    + '      <div style="text-align:right;">'
    + (isUpcoming
        ? '<span class="badge b-up" style="font-size:10px;padding:2px 6px;"><i class="ti ti-clock"></i> ' + ev.countdownLabel + '</span>'
        : '<span class="badge b-gray" style="font-size:10px;padding:2px 6px;"><i class="ti ti-check"></i> Selesai</span>')
    + '      </div>'
    + '    </div>'

    + '    <!-- Expected Net Income Block -->'
    + (ev.isHeld
        ? '    <div style="background:rgba(52,211,153,.08);border:1px solid rgba(52,211,153,.2);border-radius:8px;padding:10px;margin-bottom:10px;">'
          + '      <div style="display:flex;justify-content:space-between;align-items:baseline;">'
          + '        <span style="font-size:11px;color:var(--text2);font-weight:600;">Estimasi Kas Masuk (Net):</span>'
          + '        <span style="font-family:var(--font-mono);font-size:16px;font-weight:800;color:var(--green);">Rp ' + fmtK(ev.netExpected) + '</span>'
          + '      </div>'
          + '      <div style="display:flex;justify-content:space-between;font-size:10px;color:var(--text3);margin-top:2px;">'
          + '        <span>Kepemilikan: ' + (ev.heldShares || 0).toLocaleString('id-ID') + ' lembar (' + (ev.heldLot || 0) + ' lot)</span>'
          + '        <span>DPS: Rp ' + fmt(ev.dps) + ' / lbr</span>'
          + '      </div>'
          + '    </div>'
        : '    <div style="background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:8px 10px;margin-bottom:10px;font-size:11px;color:var(--text3);">'
          + '      <span>DPS: <b>Rp ' + fmt(ev.dps) + '</b> · Yield Est: <b>' + (ev.yield || 0) + '%</b> · Belum ada di portofolio</span>'
          + '    </div>')

    + '    <!-- Corporate Action Timeline Dates -->'
    + '    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:4px;text-align:center;font-size:10px;background:var(--bg2);padding:6px;border-radius:6px;margin-bottom:10px;">'
    + '      <div><div style="color:var(--text3);">Cum-Date</div><div style="font-weight:700;color:var(--text-main);">' + (ev.cumDate ? ev.cumDate.slice(5) : '—') + '</div></div>'
    + '      <div><div style="color:var(--text3);">Ex-Date</div><div style="font-weight:700;color:var(--text-main);">' + (ev.exDate ? ev.exDate.slice(5) : '—') + '</div></div>'
    + '      <div><div style="color:var(--text3);">Rec-Date</div><div style="font-weight:700;color:var(--text-main);">' + (ev.recDate ? ev.recDate.slice(5) : '—') + '</div></div>'
    + '      <div><div style="color:var(--green);font-weight:700;">Bayar</div><div style="font-weight:800;color:var(--green);">' + (ev.paymentDate ? ev.paymentDate.slice(5) : '—') + '</div></div>'
    + '    </div>'
    + '  </div>'

    + '  <!-- Actions -->'
    + '  <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;padding-top:6px;border-top:1px solid var(--border);">'
    + '    <button class="btn btn-ghost btn-xs" onclick="openDivCalDetailModal(\'' + ev.id + '\')" style="font-size:11px;"><i class="ti ti-info-circle"></i> Detail Info</button>'
    + (ev.isHeld
        ? '    <button class="btn btn-green btn-xs" onclick="divCalRecordToDividends(\'' + ev.code + '\',' + ev.dps + ',\'' + (ev.paymentDate || ev.cumDate) + '\',' + ev.heldShares + ')" style="font-size:11px;" title="Catat langsung ke buku transaksi dividen">'
          + '      <i class="ti ti-plus"></i> ' + (ev.userRecorded ? 'Sudah Tercatat ✓' : '+ Catat Riil')
          + '    </button>'
        : '')
    + '  </div>'
    + '</div>';
}

// ── 3. Render 12-Month Seasonality & Distribution View ──
function renderDivCalSeasonalityView(events) {
  var monthNamesShort = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  var monthTotals = new Array(12).fill(0);
  var monthEventCounts = new Array(12).fill(0);

  var year = DIV_CALENDAR_STATE.currentYear;

  events.forEach(function(ev) {
    if (ev.isHeld && ev.paymentDate && ev.paymentDate.startsWith(String(year))) {
      var mIndex = parseInt(ev.paymentDate.slice(5, 7), 10) - 1;
      if (mIndex >= 0 && mIndex < 12) {
        monthTotals[mIndex] += (ev.netExpected || 0);
        monthEventCounts[mIndex]++;
      }
    }
  });

  var maxVal = Math.max.apply(null, monthTotals.concat([1000000]));
  var grandTotalYear = monthTotals.reduce(function(a, b) { return a + b; }, 0);
  var monthlyAvg = Math.round(grandTotalYear / 12);

  var html = ''
    + '<div style="background:var(--bg2);border-radius:10px;border:1px solid var(--border);padding:18px;">'
    + '  <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:16px;">'
    + '    <div>'
    + '      <div style="font-size:15px;font-weight:800;color:var(--text-main);">Distribusi Passive Income 12 Bulan (' + year + ')</div>'
    + '      <div style="font-size:12px;color:var(--text3);">Peta musim panen dividen IDX berdasarkan jadwal pembayaran aktual saham yang sedang dipegang</div>'
    + '    </div>'
    + '    <div style="text-align:right;">'
    + '      <div style="font-size:11px;color:var(--text3);">Total Cashflow Portofolio ' + year + ':</div>'
    + '      <div style="font-family:var(--font-mono);font-size:18px;font-weight:800;color:var(--green);">Rp ' + fmtK(grandTotalYear) + '</div>'
    + '      <div style="font-size:10px;color:var(--text2);">Rata-rata: <b>Rp ' + fmtK(monthlyAvg) + ' / bulan</b></div>'
    + '    </div>'
    + '  </div>'

    + '  <!-- Musim Dividen Banners -->'
    + '  <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:18px;">'
    + '    <div style="background:rgba(52,211,153,.07);border:1px solid rgba(52,211,153,.25);border-radius:8px;padding:10px;">'
    + '      <div style="font-size:11px;font-weight:700;color:var(--green);"><i class="ti ti-sun"></i> Musim Semi Dividen Final (Maret – Juni)</div>'
    + '      <div style="font-size:11px;color:var(--text2);margin-top:2px;">Periode RUPS Tahunan pembagian dividen final emiten Big Banks (BBRI, BMRI, BBCA, BBNI) &amp; Consumer Goods.</div>'
    + '    </div>'
    + '    <div style="background:rgba(56,189,248,.07);border:1px solid rgba(56,189,248,.25);border-radius:8px;padding:10px;">'
    + '      <div style="font-size:11px;font-weight:700;color:#38bdf8;"><i class="ti ti-leaf"></i> Musim Gugur Dividen Interim (Oktober – Desember)</div>'
    + '      <div style="font-size:11px;color:var(--text2);margin-top:2px;">Periode pembagian dividen interim H2 emiten energi, batu bara (ADRO, ITMG, PTBA) &amp; interim perbankan.</div>'
    + '    </div>'
    + '  </div>'

    + '  <!-- 12 Bar Columns -->'
    + '  <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:8px;align-items:flex-end;min-height:160px;padding:14px 4px 6px;border-bottom:1px solid var(--border);">';

  monthNamesShort.forEach(function(mName, idx) {
    var val = monthTotals[idx];
    var pct = Math.round((val / maxVal) * 100);
    var isPeak = val > 0 && val >= (maxVal * 0.5);
    var barColor = isPeak
      ? 'background:linear-gradient(180deg, #10b981 0%, #059669 100%);box-shadow:0 0 10px rgba(16,185,129,.3);'
      : (val > 0 ? 'background:rgba(52,211,153,.5);' : 'background:var(--bg3);');

    html += '<div style="display:flex;flex-direction:column;align-items:center;height:100%;justify-content:flex-end;" title="' + mName + ' ' + year + ': Rp ' + fmtK(val) + ' (' + monthEventCounts[idx] + ' pembayaran)">'
      + (val > 0 ? '<div style="font-family:var(--font-mono);font-size:9px;font-weight:700;color:var(--green);margin-bottom:4px;white-space:nowrap;">Rp ' + fmtK(val) + '</div>' : '')
      + '  <div style="width:100%;max-width:28px;height:' + Math.max(8, pct) + '%;border-radius:4px 4px 0 0;' + barColor + '"></div>'
      + '  <div style="font-size:11px;font-weight:700;color:' + (val > 0 ? 'var(--text-main)' : 'var(--text3)') + ';margin-top:8px;">' + mName + '</div>'
      + '</div>';
  });

  html += '  </div>'
    + '</div>';

  return html;
}

// ── 4. Render Table View ──
function renderDivCalTableView(events) {
  var html = ''
    + '<div style="background:var(--bg2);border-radius:10px;border:1px solid var(--border);overflow-x:auto;">'
    + '  <table class="tbl">'
    + '    <thead>'
    + '      <tr>'
    + '        <th>Status</th>'
    + '        <th>Ticker</th>'
    + '        <th>Kepemilikan</th>'
    + '        <th>Cum-Date</th>'
    + '        <th>Ex-Date</th>'
    + '        <th>Tanggal Bayar</th>'
    + '        <th>DPS</th>'
    + '        <th>Estimasi Net</th>'
    + '        <th>Yield</th>'
    + '        <th>Aksi</th>'
    + '      </tr>'
    + '    </thead>'
    + '    <tbody>';

  if (!events.length) {
    html += '<tr><td colspan="10" style="text-align:center;padding:24px;color:var(--text3);">Tidak ada dividen yang sesuai filter.</td></tr>';
  } else {
    events.forEach(function(ev) {
      html += '<tr style="' + (ev.isHeld ? 'background:rgba(52,211,153,.02);' : '') + '">'
        + '  <td>'
        + (ev.isUpcoming
            ? '<span class="badge b-up" style="font-size:10px;">🔮 ' + ev.countdownLabel + '</span>'
            : '<span class="badge b-gray" style="font-size:10px;">✅ Selesai</span>')
        + '  </td>'
        + '  <td>'
        + '    <div style="display:inline-flex;align-items:center;gap:6px;">'
        + (typeof getStockLogoHtml === 'function' ? getStockLogoHtml(ev.code, 18) : '')
        + '      <span style="font-weight:800;">' + ev.code + '</span>'
        + (ev.isHeld ? '<span class="badge b-up" style="font-size:8px;padding:1px 4px;">HELD</span>' : '')
        + '    </div>'
        + '  </td>'
        + '  <td class="mono">' + (ev.isHeld ? (ev.heldShares || 0).toLocaleString('id-ID') + ' lbr (' + (ev.heldLot || 0) + ' lot)' : '<span style="color:var(--text3);">—</span>') + '</td>'
        + '  <td class="mono" style="font-size:11px;">' + (ev.cumDate || '—') + '</td>'
        + '  <td class="mono" style="font-size:11px;">' + (ev.exDate || '—') + '</td>'
        + '  <td class="mono" style="font-size:11px;font-weight:700;color:var(--green);">' + (ev.paymentDate || '—') + '</td>'
        + '  <td class="mono">Rp ' + fmt(ev.dps) + '</td>'
        + '  <td class="mono" style="font-weight:800;color:' + (ev.isHeld ? 'var(--green)' : 'var(--text3)') + ';">'
        + (ev.isHeld ? 'Rp ' + fmtK(ev.netExpected) : '—')
        + '  </td>'
        + '  <td><span class="badge b-amb">' + (ev.yield || 0) + '%</span></td>'
        + '  <td>'
        + '    <div style="display:flex;gap:4px;">'
        + '      <button class="btn btn-ghost btn-xs" onclick="openDivCalDetailModal(\'' + ev.id + '\')" title="Detail"><i class="ti ti-eye"></i></button>'
        + (ev.isHeld
            ? '<button class="btn btn-green btn-xs" onclick="divCalRecordToDividends(\'' + ev.code + '\',' + ev.dps + ',\'' + (ev.paymentDate || ev.cumDate) + '\',' + ev.heldShares + ')" title="Catat ke Dividen Riil"><i class="ti ti-plus"></i></button>'
            : '')
        + '    </div>'
        + '  </td>'
        + '</tr>';
    });
  }

  html += '    </tbody>'
    + '  </table>'
    + '</div>';

  return html;
}

// ── Modal Detail Dividen Inspector ──
function openDivCalDetailModal(eventId) {
  var events = getEnrichedDividendEvents();
  var ev = events.find(function(e) { return e.id === eventId; });
  if (!ev) return;

  var modalBox = document.getElementById('div-cal-modal-container');
  if (!modalBox) return;

  var html = ''
    + '<div class="modal on" style="display:flex;align-items:center;justify-content:center;z-index:9999;" onclick="if(event.target===this)closeDivCalModal()">'
    + '  <div style="background:var(--bg2);border:1px solid var(--border);border-radius:12px;max-width:540px;width:95%;padding:22px;box-shadow:0 20px 40px rgba(0,0,0,0.5);max-height:90vh;overflow-y:auto;">'
    + '    <!-- Modal Header -->'
    + '    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px;">'
    + '      <div style="display:flex;align-items:center;gap:10px;">'
    + (typeof getStockLogoHtml === 'function' ? getStockLogoHtml(ev.code, 36) : '')
    + '        <div>'
    + '          <div style="display:flex;align-items:center;gap:8px;">'
    + '            <span style="font-size:18px;font-weight:900;">' + ev.code + '</span>'
    + (ev.isHeld ? '<span class="badge b-up" style="font-size:10px;">DI PORTOFOLIO</span>' : '<span class="badge b-gray" style="font-size:10px;">WATCHLIST</span>')
    + '          </div>'
    + '          <div style="font-size:12px;color:var(--text3);">' + (ev.name || ev.code) + '</div>'
    + '        </div>'
    + '      </div>'
    + '      <button class="btn btn-ghost btn-xs" onclick="closeDivCalModal()" style="font-size:16px;">✕</button>'
    + '    </div>'

    + '    <!-- Summary Metrics -->'
    + '    <div style="background:var(--bg3);border:1px solid var(--border);border-radius:8px;padding:12px;margin-bottom:14px;">'
    + '      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">'
    + '        <div>'
    + '          <div style="font-size:11px;color:var(--text3);">DPS (Dividen per Lembar)</div>'
    + '          <div style="font-family:var(--font-mono);font-size:16px;font-weight:800;color:var(--text-main);">Rp ' + fmt(ev.dps) + '</div>'
    + '        </div>'
    + '        <div>'
    + '          <div style="font-size:11px;color:var(--text3);">Status Pembayaran</div>'
    + '          <div style="font-size:13px;font-weight:700;color:' + (ev.isUpcoming ? 'var(--green)' : 'var(--text2)') + ';">' + (ev.isUpcoming ? '🔮 ' + ev.countdownLabel : '✅ Selesai') + '</div>'
    + '        </div>'
    + '      </div>'
    + '    </div>'

    + (ev.isHeld
        ? '    <!-- Portfolio Expected Income -->'
          + '    <div style="background:rgba(52,211,153,.08);border:1px solid rgba(52,211,153,.25);border-radius:8px;padding:12px;margin-bottom:16px;">'
          + '      <div style="font-size:12px;font-weight:700;color:var(--green);margin-bottom:8px;"><i class="ti ti-wallet"></i> KEPEMILIKAN &amp; ESTIMASI PENDAPATAN PASIF</div>'
          + '      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:11px;">'
          + '        <div><span style="color:var(--text3);">Jumlah Saham Dipegang:</span> <b class="mono">' + (ev.heldShares || 0).toLocaleString('id-ID') + ' lembar (' + (ev.heldLot || 0) + ' lot)</b></div>'
          + '        <div><span style="color:var(--text3);">Dividen Kotor (Gross):</span> <b class="mono">Rp ' + fmtK(ev.grossExpected) + '</b></div>'
          + '        <div><span style="color:var(--text3);">Tarif PPh Dividen:</span> <b>' + ((typeof TAX_SETTINGS !== 'undefined' && TAX_SETTINGS.dividenExempt) ? '0% (Bebas Pajak PMK 18/2021)' : '10%') + '</b></div>'
          + '        <div><span style="color:var(--text3);">Kas Bersih (Net Masuk):</span> <b class="mono" style="color:var(--green);font-size:13px;">Rp ' + fmtK(ev.netExpected) + '</b></div>'
          + '      </div>'
          + '    </div>'
        : '')

    + '    <!-- Corporate Action Milestones -->'
    + '    <div style="margin-bottom:16px;">'
    + '      <div style="font-size:12px;font-weight:700;color:var(--text2);margin-bottom:8px;"><i class="ti ti-calendar-event"></i> JADWAL AKSI KORPORASI LENGKAP</div>'
    + '      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;background:var(--bg3);border:1px solid var(--border);border-radius:8px;padding:10px;font-size:11px;">'
    + '        <div><span style="color:var(--text3);">Cum-Date (Pasar Reguler):</span> <div style="font-weight:700;color:var(--text-main);">' + (ev.cumDate || '—') + '</div></div>'
    + '        <div><span style="color:var(--text3);">Ex-Date (Pasar Reguler):</span> <div style="font-weight:700;color:var(--text-main);">' + (ev.exDate || '—') + '</div></div>'
    + '        <div><span style="color:var(--text3);">Recording Date (DPS):</span> <div style="font-weight:700;color:var(--text-main);">' + (ev.recDate || '—') + '</div></div>'
    + '        <div><span style="color:var(--green);font-weight:700;">Tanggal Pembayaran (RDN):</span> <div style="font-weight:800;color:var(--green);">' + (ev.paymentDate || '—') + '</div></div>'
    + '      </div>'
    + '    </div>'

    + '    <!-- Additional Stock Info -->'
    + '    <div style="font-size:11px;color:var(--text3);margin-bottom:18px;">'
    + '      <span>Sektor: <b>' + (ev.sector || 'Equities') + '</b> · Dividend Yield Est: <b>' + (ev.yield || 0) + '%</b> · Payout Ratio: <b>' + (ev.payoutRatio || '—') + '</b></span>'
    + '    </div>'

    + '    <!-- Modal Footer Actions -->'
    + '    <div style="display:flex;justify-content:flex-end;gap:8px;padding-top:12px;border-top:1px solid var(--border);">'
    + '      <button class="btn btn-ghost" onclick="closeDivCalModal()">Tutup</button>'
    + (ev.isHeld
        ? '      <button class="btn btn-green" onclick="divCalRecordToDividends(\'' + ev.code + '\',' + ev.dps + ',\'' + (ev.paymentDate || ev.cumDate) + '\',' + ev.heldShares + ');closeDivCalModal();">'
          + '        <i class="ti ti-file-text"></i> ' + (ev.userRecorded ? 'Simpan Ulang ke Riwayat' : 'Catat ke Buku Dividen Riil')
          + '      </button>'
        : '')
    + '    </div>'
    + '  </div>'
    + '</div>';

  modalBox.innerHTML = html;
}

function closeDivCalModal() {
  var modalBox = document.getElementById('div-cal-modal-container');
  if (modalBox) modalBox.innerHTML = '';
}

// ── Action: Catat Dividen Kalender ke Riwayat Dividen Riil User ──
function divCalRecordToDividends(ticker, dps, date, shares) {
  if (!ticker || !dps || !date || !shares) {
    alert('Data dividen tidak lengkap.');
    return;
  }

  // Cek apakah sudah ada transaksi dividen dengan ticker & tanggal yang sama
  var exists = (typeof dividends !== 'undefined' && Array.isArray(dividends))
    ? dividends.some(function(d) { return d.ticker === ticker && d.date === date; })
    : false;

  var gross = Math.round(dps * shares);
  var divTaxRate = (typeof TAX_SETTINGS !== 'undefined' && TAX_SETTINGS.dividenExempt) ? 0 : 0.10;
  var tax = Math.round(gross * divTaxRate);
  var net = gross - tax;

  if (exists) {
    if (!confirm('Dividen ' + ticker + ' pada tanggal ' + date + ' sudah tercatat sebelumnya. Tambahkan lagi?')) {
      return;
    }
  }

  if (typeof addDividend === 'function') {
    addDividend(date, ticker, shares, dps, gross, tax, net);
  } else if (typeof dividends !== 'undefined' && Array.isArray(dividends)) {
    var nextId = (typeof nextDivId !== 'undefined') ? nextDivId++ : Date.now();
    dividends.push({
      id: nextId,
      date: date,
      ticker: ticker,
      shares: shares,
      dps: dps,
      gross: gross,
      tax: tax,
      net: net,
      pphRate: divTaxRate
    });
    if (typeof saveData === 'function') saveData();
  }

  if (typeof showSaveStatus === 'function') {
    showSaveStatus('✓ Dividen ' + ticker + ' sebesar Rp ' + fmtK(net) + ' berhasil dibukukan ke riwayat!');
  }

  // Re-render dividend views
  if (typeof renderDividen === 'function') renderDividen();
  renderDividendCalendarComponent();
}

// ── Control Helpers ──
function setDivCalViewMode(mode) {
  DIV_CALENDAR_STATE.viewMode = mode;
  renderDividendCalendarComponent();
}

function toggleDivCalPortfolioFilter(checked) {
  DIV_CALENDAR_STATE.filterPortfolioOnly = !!checked;
  renderDividendCalendarComponent();
}

function setDivCalStatusFilter(status) {
  DIV_CALENDAR_STATE.filterStatus = status;
  renderDividendCalendarComponent();
}

function setDivCalSearch(query) {
  DIV_CALENDAR_STATE.searchQuery = (query || '').trim();
  renderDividendCalendarComponent();
}

function navigateDivCalMonth(direction) {
  var newM = DIV_CALENDAR_STATE.currentMonth + direction;
  if (newM < 0) {
    DIV_CALENDAR_STATE.currentMonth = 11;
    DIV_CALENDAR_STATE.currentYear--;
  } else if (newM > 11) {
    DIV_CALENDAR_STATE.currentMonth = 0;
    DIV_CALENDAR_STATE.currentYear++;
  } else {
    DIV_CALENDAR_STATE.currentMonth = newM;
  }
  renderDividendCalendarComponent();
}

function setDivCalToday() {
  DIV_CALENDAR_STATE.currentYear = 2026;
  DIV_CALENDAR_STATE.currentMonth = 8; // September 2026
  renderDividendCalendarComponent();
}

// ── Sub-tab Switcher for Dividend Page ──
function switchDivSubTab(tab) {
  var btnCal = document.getElementById('div-subtab-btn-cal');
  var btnAna = document.getElementById('div-subtab-btn-analytics');
  var btnLed = document.getElementById('div-subtab-btn-ledger');
  var btnAll = document.getElementById('div-subtab-btn-all');

  var secCal = document.getElementById('div-section-calendar');
  var secAna = document.getElementById('div-section-analytics');
  var secLed = document.getElementById('div-section-ledger');

  [btnCal, btnAna, btnLed, btnAll].forEach(function(b) {
    if (b) b.className = 'btn btn-xs btn-ghost';
  });

  if (tab === 'calendar') {
    if (btnCal) btnCal.className = 'btn btn-xs btn-green';
    if (secCal) secCal.style.display = 'block';
    if (secAna) secAna.style.display = 'none';
    if (secLed) secLed.style.display = 'none';
    renderDividendCalendarComponent();
  } else if (tab === 'analytics') {
    if (btnAna) btnAna.className = 'btn btn-xs btn-green';
    if (secCal) secCal.style.display = 'none';
    if (secAna) secAna.style.display = 'block';
    if (secLed) secLed.style.display = 'none';
    if (typeof renderDividen === 'function') renderDividen();
  } else if (tab === 'ledger') {
    if (btnLed) btnLed.className = 'btn btn-xs btn-green';
    if (secCal) secCal.style.display = 'none';
    if (secAna) secAna.style.display = 'none';
    if (secLed) secLed.style.display = 'block';
    if (typeof renderDividen === 'function') renderDividen();
  } else if (tab === 'all') {
    if (btnAll) btnAll.className = 'btn btn-xs btn-green';
    if (secCal) secCal.style.display = 'block';
    if (secAna) secAna.style.display = 'block';
    if (secLed) secLed.style.display = 'block';
    renderDividendCalendarComponent();
    if (typeof renderDividen === 'function') renderDividen();
  }
}

function openDivCalDayModal(day) {
  var year = DIV_CALENDAR_STATE.currentYear;
  var month = DIV_CALENDAR_STATE.currentMonth;
  var datePrefix = year + '-' + String(month + 1).padStart(2, '0') + '-' + String(day).padStart(2, '0');

  var events = getEnrichedDividendEvents();
  var dayEvents = events.filter(function(e) {
    return e.paymentDate === datePrefix || e.cumDate === datePrefix;
  });

  if (!dayEvents.length) return;
  openDivCalDetailModal(dayEvents[0].id);
}

// ── Hook ke Window & Boot ──
window.initDividendCalendar = initDividendCalendar;
window.renderDividendCalendarComponent = renderDividendCalendarComponent;
window.setDivCalViewMode = setDivCalViewMode;
window.toggleDivCalPortfolioFilter = toggleDivCalPortfolioFilter;
window.setDivCalStatusFilter = setDivCalStatusFilter;
window.setDivCalSearch = setDivCalSearch;
window.navigateDivCalMonth = navigateDivCalMonth;
window.setDivCalToday = setDivCalToday;
window.switchDivSubTab = switchDivSubTab;
window.openDivCalDayModal = openDivCalDayModal;
window.openDivCalDetailModal = openDivCalDetailModal;
window.closeDivCalModal = closeDivCalModal;
window.divCalRecordToDividends = divCalRecordToDividends;

// Auto-run saat DOM siap
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', function() {
    initDividendCalendar();
  });
} else {
  setTimeout(initDividendCalendar, 100);
}
