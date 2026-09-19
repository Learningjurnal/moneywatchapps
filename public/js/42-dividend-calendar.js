// ============================================================
// MONEY WATCH PRO — VISUAL DIVIDEND CALENDAR & PASSIVE INCOME
// ============================================================

var DIV_CALENDAR_STATE = {
  viewMode: 'calendar', // 'calendar' | 'timeline' | 'seasonality' | 'table'
  currentYear: new Date().getFullYear(),
  currentMonth: new Date().getMonth(), // 0-indexed real current month
  filterPortfolioOnly: false, // Default false agar jadwal dividen pasar tampil lengkap
  filterStatus: 'all', // 'all' | 'upcoming' | 'historical'
  searchQuery: '',
  selectedEvent: null,
  cachedData: null,
  isLoading: false
};

// Helper tanggal dinamis hari ini dalam format YYYY-MM-DD
function getDivCalTodayStr() {
  var d = new Date();
  var y = d.getFullYear();
  var m = String(d.getMonth() + 1).padStart(2, '0');
  var day = String(d.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + day;
}

// FIX (2026-09-18, user-reported after full-codebase audit): array
// `IDX_DIVIDEND_MASTER_REGISTRY` yang tadinya ada di sini adalah 100% data
// fiksi hardcoded (tanggal & DPS karangan) dengan klaim keliru "Data Riil
// KSEI/BEI" — dihapus total, bukan sekadar diberi label. Belum ada
// penggantinya yang real karena skema `payload` Invezgo untuk tipe
// DIVIDEND belum terverifikasi (lihat catatan di getIdxCalendarData(),
// lib/providers/idx-client.js) — fitur kalender/timeline/musiman/proyeksi
// passive income di bawah ini SENGAJA dinonaktifkan (lihat
// renderDividendCalendarComponent()) sampai skema itu terverifikasi,
// alih-alih menampilkan tanggal/DPS/yield hasil tebakan.

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

  // FIX AUDIT (tombol "+Catat Riil" tidak pernah ter-nonaktif -> dividen
  // bisa dicatat 2x): sebelumnya pencocokan ke sini pakai exact key
  // ticker+date, padahal tanggal dividen di `dividends[]` (ex-date, kalau
  // asalnya dari kalkulator riwayat transaksi) dan `paymentDate`/`cumDate`
  // di master registry kalender untuk DISTRIBUSI YANG SAMA bisa berjarak
  // beberapa minggu — exact match nyaris tidak pernah ketemu, jadi
  // ev.userRecorded selalu false meski dividennya sudah tercatat, dan
  // tombolnya tetap aktif. Sekarang pakai jendela toleransi 45 hari
  // (sama seperti isDividendAlreadyRecorded() di 03-engine.js).
  var DIV_MATCH_WINDOW_MS = 45 * 86400000;
  function findMatchingEventKey(ticker, dateStr) {
    var target = new Date(dateStr + 'T00:00:00').getTime();
    if (isNaN(target)) return null;
    var bestKey = null, bestDiff = Infinity;
    Object.keys(eventMap).forEach(function(k) {
      var ev = eventMap[k];
      if (ev.code !== ticker) return;
      var evDateStr = ev.paymentDate || ev.cumDate || ev.exDate;
      if (!evDateStr) return;
      var evTime = new Date(evDateStr + 'T00:00:00').getTime();
      if (isNaN(evTime)) return;
      var diff = Math.abs(evTime - target);
      if (diff <= DIV_MATCH_WINDOW_MS && diff < bestDiff) { bestDiff = diff; bestKey = k; }
    });
    return bestKey;
  }

  // Tambahkan catatan dividen riil yang ada di user storage jika belum ada
  var userDivs = typeof dividends !== 'undefined' && Array.isArray(dividends) ? dividends : [];
  userDivs.forEach(function(ud) {
    if (!ud.ticker || !ud.date) return;
    var matchedKey = findMatchingEventKey(ud.ticker, ud.date);
    if (!matchedKey) {
      var mp = (typeof prices !== 'undefined' && prices[ud.ticker]) || 1;
      var key = ud.ticker + '|' + ud.date;
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
      eventMap[matchedKey].userRecorded = true;
      eventMap[matchedKey].actualNet = ud.net || 0;
    }
  });

  var todayStr = getDivCalTodayStr();
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
// FIX (2026-09-18): dulu fallback ke IDX_DIVIDEND_MASTER_REGISTRY (data
// fiksi, sudah dihapus) kalau API gagal/kosong. Sekarang cuma menyimpan
// respons real Invezgo apa adanya (raw {code,type,payload}) — lihat
// renderDividendCalendarComponent() untuk kenapa fitur ini masih
// dinonaktifkan sementara (skema payload belum terverifikasi).
function initDividendCalendar() {
  if (DIV_CALENDAR_STATE.isLoading) return;
  DIV_CALENDAR_STATE.isLoading = true;

  fetch('/api/idx/calendar?type=DIVIDEN')
    .then(function(res) { return res.json(); })
    .then(function(data) {
      DIV_CALENDAR_STATE.isLoading = false;
      DIV_CALENDAR_STATE.cachedData = (data && Array.isArray(data.dividends)) ? data.dividends : [];
      DIV_CALENDAR_STATE.dataSource = data ? data.dataSource : null;
      renderDividendCalendarComponent();
    })
    .catch(function(err) {
      DIV_CALENDAR_STATE.isLoading = false;
      console.warn('[DividendCalendar] Fetch failed:', err);
      DIV_CALENDAR_STATE.cachedData = [];
      renderDividendCalendarComponent();
    });
}

// ── Render Master Komponen Kalender Dividen ──
// FIX (2026-09-18, user-reported after full-codebase audit): fitur ini
// (grid kalender per-tanggal, timeline, grafik musiman 12 bulan, proyeksi
// passive income) 100% dibangun di atas field hasil karangan dari
// IDX_DIVIDEND_MASTER_REGISTRY (dps/cumDate/exDate/paymentDate/yield/dst)
// yang sudah dihapus (lihat catatan di atas file ini). Invezgo memang punya
// endpoint real (GET /analysis/calendar) — TAPI skema `payload`-nya per
// tipe DIVIDEND belum terverifikasi (dokumentasi vendor cuma kasih contoh
// untuk tipe WARRANT), jadi field seperti tanggal cum/ex/payment dan
// nominal DPS TIDAK BISA dipetakan tanpa menebak. Alih-alih menampilkan
// kalender/proyeksi dengan tanggal & angka hasil tebakan, seluruh fitur
// ini dinonaktifkan jujur sampai skema terverifikasi (keputusan eksplisit
// user, bukan sepihak) — lihat renderDivCalDisabledNotice().
function renderDivCalDisabledNotice() {
  var items = DIV_CALENDAR_STATE.cachedData || [];
  var listHtml = items.length
    ? '<div style="margin-top:14px;display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:8px">'
      + items.map(function(d) {
        return '<div style="background:var(--bg3);border:1px solid var(--border2);border-radius:8px;padding:8px 10px;font-size:12px">'
          + '<strong style="color:var(--text)">' + d.code + '</strong>'
          + '<div style="color:var(--text3);font-size:10.5px;margin-top:2px">Ada jadwal dividen (detail belum bisa ditampilkan)</div>'
        + '</div>';
      }).join('')
      + '</div>'
    : '';
  return '<div class="card" style="padding:20px;text-align:center">'
    + '<div style="font-size:28px;margin-bottom:8px">📅</div>'
    + '<div style="font-weight:700;font-size:14px;color:var(--text);margin-bottom:6px">Kalender Dividen Sementara Dinonaktifkan</div>'
    + '<div style="font-size:12px;color:var(--text3);max-width:480px;margin:0 auto;line-height:1.5">'
    + 'Data dividen fiksi/karangan yang sebelumnya ditampilkan di sini sudah dihapus. Invezgo API punya data real untuk ini, tapi skema detailnya (tanggal cum/ex/payment, nominal DPS, yield) belum terverifikasi dari respons real — menampilkannya berarti menebak, yang tidak diperbolehkan di aplikasi ini. Fitur ini akan diaktifkan kembali setelah skema dikonfirmasi.'
    + '</div>'
    + (items.length ? '<div style="font-size:11px;color:var(--text2);margin-top:12px">' + items.length + ' emiten tercatat punya jadwal dividen dari Invezgo hari ini:</div>' + listHtml : '<div style="font-size:11px;color:var(--text3);margin-top:12px">Tidak ada data dari Invezgo saat ini.</div>')
    + '</div>';
}

function renderDividendCalendarComponent() {
  var container = document.getElementById('dividend-calendar-mount');
  if (!container) return;
  container.innerHTML = renderDivCalDisabledNotice();
  return;
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

  var todayStr = getDivCalTodayStr();

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

  var realNow = new Date();
  var todayBtnLabel = 'Hari Ini (' + monthNames[realNow.getMonth()].slice(0, 3) + ' ' + realNow.getFullYear() + ')';

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
    + '      <button class="btn btn-ghost btn-xs" onclick="setDivCalToday()" style="font-size:11px;color:var(--accent);">' + todayBtnLabel + '</button>'
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
      +        day + (isToday ? ' <span style="font-size:9px;background:var(--accent);color:var(--accent-fg, #fff);padding:1px 4px;border-radius:3px;font-weight:700;">HARI INI</span>' : '')
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
        ? (ev.userRecorded
            ? '    <span class="badge b-gray" style="font-size:10px;padding:3px 8px;" title="Sudah tercatat di Riwayat Dividen & tersinkron ke Mutasi RDN">Sudah Tercatat ✓</span>'
            : '    <button class="btn btn-green btn-xs" onclick="divCalRecordToDividends(\'' + ev.code + '\',' + ev.dps + ',\'' + (ev.paymentDate || ev.cumDate) + '\',' + ev.heldShares + ')" style="font-size:11px;" title="Catat langsung ke buku transaksi dividen">+ Catat Riil</button>')
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
            ? (ev.userRecorded
                ? '<span class="badge b-gray" style="font-size:9px;padding:2px 6px;" title="Sudah tercatat">✓</span>'
                : '<button class="btn btn-green btn-xs" onclick="divCalRecordToDividends(\'' + ev.code + '\',' + ev.dps + ',\'' + (ev.paymentDate || ev.cumDate) + '\',' + ev.heldShares + ')" title="Catat ke Dividen Riil">+</button>')
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
        ? (ev.userRecorded
            ? '      <span class="badge b-gray" style="padding:6px 12px;font-size:11px;" title="Sudah tercatat di Riwayat Dividen & tersinkron ke Mutasi RDN">Sudah Tercatat ✓</span>'
            : '      <button class="btn btn-green" onclick="divCalRecordToDividends(\'' + ev.code + '\',' + ev.dps + ',\'' + (ev.paymentDate || ev.cumDate) + '\',' + ev.heldShares + ');closeDivCalModal();">Catat ke Buku Dividen Riil</button>')
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

  // FIX AUDIT (dividen tercatat 2x): dulu exists-check di sini pakai exact
  // date match terhadap payment-date/cum-date kalender — beda field tanggal
  // dari yang dipakai kalkulator riwayat transaksi (ex-date resmi Yahoo
  // Finance) untuk distribusi dividen yang SAMA, jadi tidak pernah
  // terdeteksi sebagai duplikat. Sekarang pakai isDividendAlreadyRecorded()
  // (jendela toleransi 45 hari) — satu sumber kebenaran yang sama dipakai
  // di semua entry point. Kalau sudah tercatat, BLOKIR langsung (bukan
  // sekadar tanya "tambah lagi?") — tombolnya sendiri juga sudah
  // disembunyikan di render kalau ev.userRecorded true, jadi klik ganda ke
  // sini seharusnya jarang terjadi kecuali render belum sempat refresh.
  var alreadyRecorded = (typeof isDividendAlreadyRecorded === 'function')
    ? isDividendAlreadyRecorded(ticker, date)
    : ((typeof dividends !== 'undefined' && Array.isArray(dividends)) ? dividends.some(function(d) { return d.ticker === ticker && d.date === date; }) : false);

  if (alreadyRecorded) {
    alert('Dividen ' + ticker + ' untuk periode ini sudah tercatat di Riwayat Dividen (dan sudah tersinkron ke Mutasi RDN). Tidak perlu dicatat ulang.');
    if (typeof renderDividen === 'function') renderDividen();
    renderDividendCalendarComponent();
    return;
  }

  var gross = Math.round(dps * shares);
  var divTaxRate = (typeof TAX_SETTINGS !== 'undefined' && TAX_SETTINGS.dividenExempt) ? 0 : 0.10;

  // FIX AUDIT (RDN tidak tersinkron): sebelumnya kode ini memanggil
  // addDividend() — fungsi yang TIDAK PERNAH ADA di codebase ini — sehingga
  // selalu jatuh ke fallback dividends.push() manual yang tidak pernah
  // memanggil addRdn(). Akibatnya dividen yang dicatat lewat tombol
  // "+Catat Riil" di halaman ini tidak pernah masuk ke Mutasi RDN & Kas
  // Portofolio sama sekali. addDiv() (03-engine.js) adalah fungsi yang
  // benar — sama seperti yang dipakai form manual & kalkulator riwayat
  // transaksi — dan sudah menghitung gross/tax/net serta memanggil addRdn()
  // sendiri.
  if (typeof addDiv === 'function') {
    addDiv(date, ticker, shares, dps, divTaxRate);
  } else if (typeof dividends !== 'undefined' && Array.isArray(dividends)) {
    var tax = Math.round(gross * divTaxRate);
    var net = gross - tax;
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

  var netForToast = gross - Math.round(gross * divTaxRate);
  if (typeof showSaveStatus === 'function') {
    showSaveStatus('✓ Dividen ' + ticker + ' sebesar Rp ' + fmtK(netForToast) + ' berhasil dibukukan ke riwayat & Mutasi RDN!');
  }

  // Re-render dividend views + RDN (addDiv() sudah update data-nya, tapi
  // setiap halaman punya render function sendiri yang perlu dipanggil ulang
  // agar saldo/tabel yang tampil ikut ter-refresh).
  if (typeof renderDividen === 'function') renderDividen();
  if (typeof renderDivInvest === 'function') renderDivInvest();
  if (typeof renderRdn === 'function') renderRdn();
  if (typeof renderCashWidgets === 'function') renderCashWidgets();
  if (typeof renderDashboard === 'function') renderDashboard();
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
  var now = new Date();
  DIV_CALENDAR_STATE.currentYear = now.getFullYear();
  DIV_CALENDAR_STATE.currentMonth = now.getMonth();
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

  [btnCal, btnAna, btnLed].forEach(function(b) {
    if (b) b.className = 'sm-nav-item';
  });
  if (btnAll) btnAll.className = 'btn btn-xs btn-ghost';

  if (tab === 'calendar') {
    if (btnCal) btnCal.className = 'sm-nav-item active';
    if (secCal) secCal.style.display = 'block';
    if (secAna) secAna.style.display = 'none';
    if (secLed) secLed.style.display = 'none';
    renderDividendCalendarComponent();
  } else if (tab === 'analytics') {
    if (btnAna) btnAna.className = 'sm-nav-item active';
    if (secCal) secCal.style.display = 'none';
    if (secAna) secAna.style.display = 'block';
    if (secLed) secLed.style.display = 'none';
    if (typeof renderDividen === 'function') renderDividen();
  } else if (tab === 'ledger') {
    if (btnLed) btnLed.className = 'sm-nav-item active';
    if (secCal) secCal.style.display = 'none';
    if (secAna) secAna.style.display = 'none';
    if (secLed) secLed.style.display = 'block';
    if (typeof renderDividen === 'function') renderDividen();
  } else if (tab === 'all') {
    if (btnAll) btnAll.className = 'btn btn-xs btn-ghost active';
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
