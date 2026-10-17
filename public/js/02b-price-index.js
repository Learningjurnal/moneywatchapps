// Equity-history rebuild helpers used by rebuildEquityHistoryFromTransactions().
// Plain pure functions with no DOM dependency, loaded globally and CommonJS-exportable.

// Generate calendar days formatted in UTC to avoid positive UTC offset timezone drift.
function generateUtcDateRange(startStr, endStr) {
  var out = [];
  if (!startStr || !endStr || startStr > endStr) return out;
  var cur = new Date(startStr + 'T00:00:00Z');
  var end = new Date(endStr + 'T00:00:00Z');
  while (cur <= end) {
    out.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}

// Price advancer: O(1)-amortized nearest prior trading day lookup from sparse OHLCV series.
// Used by rebuildEquityHistoryFromTransactions() (03-engine.js) to look up
// a real market close for every calendar day of a user's holding period,
// including weekends/holidays (which forward-fill from the prior trading
// day's close — same "nearest prior trading day" contract already used by
// perfNearestIhsgClose(), 21-performance.js, just O(1) amortized instead of
// linear-scanned per lookup: a stateful forward-only pointer advanced once
// per call, instead of rescanning `rows` from the start on every one of
// `days × symbols` lookups — the difference between a multi-year,
// multi-symbol rebuild finishing instantly vs. tens of millions of
// comparisons on every Dashboard open).
//
// Deliberately does NOT independently regenerate the calendar-day sequence
// itself — it only ever consumes the date strings the CALLER's own
// day-by-day loop already produces (now generateUtcDateRange() above, the
// same canonical sequence both use), in the same order. Requires
// `next(dStr)` to be called with non-decreasing `dStr` values, which the
// caller's forward day-by-day loop always satisfies.

// Build an advancer for one price series. Returns a function `next(dStr)`
// that, called with non-decreasing 'YYYY-MM-DD' date strings, returns the
// real close as of that date (the most recent row with date <= dStr), or
// `null` if `dStr` predates the series' first real close — callers should
// treat `null` as "no real data yet" and fall back to their own logic
// (e.g. cost-basis/last-transaction price) rather than inventing a price
// that predates the instrument's known history.
function makePriceAdvancer(rows) {
  var clean = (rows || [])
    .filter(function (r) { return r && r.date && typeof r.close === 'number' && isFinite(r.close) && r.close > 0; })
    .slice()
    .sort(function (a, b) { return a.date < b.date ? -1 : (a.date > b.date ? 1 : 0); });

  var pointer = 0;
  var lastClose = null;

  return function next(dStr) {
    while (pointer < clean.length && clean[pointer].date <= dStr) {
      lastClose = clean[pointer].close;
      pointer++;
    }
    return lastClose;
  };
}

// ── Kalender Libur Resmi Bursa Efek Indonesia (BEI) & Hari Libur Nasional ──
var IDX_HOLIDAYS = {
  // 2024
  '2024-01-01': 'Tahun Baru 2024 Masehi',
  '2024-02-08': 'Isra Mi\'raj Nabi Muhammad SAW',
  '2024-02-09': 'Cuti Bersama Tahun Baru Imlek',
  '2024-02-14': 'Pemilihan Umum 2024',
  '2024-03-11': 'Hari Suci Nyepi',
  '2024-03-12': 'Cuti Bersama Hari Suci Nyepi',
  '2024-03-29': 'Wafat Isa Almasih',
  '2024-04-08': 'Cuti Bersama Idul Fitri 1445 H',
  '2024-04-09': 'Cuti Bersama Idul Fitri 1445 H',
  '2024-04-10': 'Hari Raya Idul Fitri 1445 H',
  '2024-04-11': 'Hari Raya Idul Fitri 1445 H',
  '2024-04-12': 'Cuti Bersama Idul Fitri 1445 H',
  '2024-04-15': 'Cuti Bersama Idul Fitri 1445 H',
  '2024-05-01': 'Hari Buruh Internasional',
  '2024-05-09': 'Kenaikan Isa Almasih',
  '2024-05-10': 'Cuti Bersama Kenaikan Isa Almasih',
  '2024-05-23': 'Hari Raya Waisak 2568 BE',
  '2024-05-24': 'Cuti Bersama Hari Raya Waisak',
  '2024-06-17': 'Hari Raya Idul Adha 1445 H',
  '2024-06-18': 'Cuti Bersama Idul Adha',
  '2024-07-07': 'Tahun Baru Islam 1446 H',
  '2024-08-17': 'Hari Kemerdekaan RI',
  '2024-09-16': 'Maulid Nabi Muhammad SAW',
  '2024-11-27': 'Pilkada Serentak 2024',
  '2024-12-25': 'Hari Raya Natal',
  '2024-12-26': 'Cuti Bersama Hari Raya Natal',
  '2024-12-31': 'Libur Akhir Tahun Bursa',

  // 2025
  '2025-01-01': 'Tahun Baru 2025 Masehi',
  '2025-01-27': 'Isra Mi\'raj Nabi Muhammad SAW',
  '2025-01-28': 'Cuti Bersama Tahun Baru Imlek',
  '2025-01-29': 'Tahun Baru Imlek 2576 Kongzili',
  '2025-03-28': 'Cuti Bersama Hari Suci Nyepi',
  '2025-03-29': 'Hari Suci Nyepi',
  '2025-03-31': 'Hari Raya Idul Fitri 1446 H',
  '2025-04-01': 'Hari Raya Idul Fitri 1446 H',
  '2025-04-02': 'Cuti Bersama Idul Fitri 1446 H',
  '2025-04-03': 'Cuti Bersama Idul Fitri 1446 H',
  '2025-04-04': 'Cuti Bersama Idul Fitri 1446 H',
  '2025-04-07': 'Cuti Bersama Idul Fitri 1446 H',
  '2025-04-18': 'Wafat Yesus Kristus',
  '2025-05-01': 'Hari Buruh Internasional',
  '2025-05-12': 'Hari Raya Waisak 2569 BE',
  '2025-05-13': 'Cuti Bersama Hari Raya Waisak',
  '2025-05-29': 'Kenaikan Yesus Kristus',
  '2025-05-30': 'Cuti Bersama Kenaikan Yesus Kristus',
  '2025-06-01': 'Hari Lahir Pancasila',
  '2025-06-06': 'Hari Raya Idul Adha 1446 H',
  '2025-06-09': 'Cuti Bersama Idul Adha',
  '2025-06-27': 'Tahun Baru Islam 1447 H',
  '2025-08-17': 'Hari Kemerdekaan RI',
  '2025-09-05': 'Maulid Nabi Muhammad SAW',
  '2025-12-25': 'Hari Raya Natal',
  '2025-12-26': 'Cuti Bersama Hari Raya Natal',
  '2025-12-31': 'Libur Akhir Tahun Bursa',

  // 2026
  '2026-01-01': 'Tahun Baru 2026 Masehi',
  '2026-01-16': 'Isra Mi\'raj Nabi Muhammad SAW',
  '2026-02-16': 'Cuti Bersama Tahun Baru Imlek',
  '2026-02-17': 'Tahun Baru Imlek 2577 Kongzili',
  '2026-03-19': 'Hari Suci Nyepi',
  '2026-03-20': 'Hari Raya Idul Fitri 1447 H / Cuti Nyepi',
  '2026-03-21': 'Hari Raya Idul Fitri 1447 H',
  '2026-03-23': 'Cuti Bersama Idul Fitri 1447 H',
  '2026-03-24': 'Cuti Bersama Idul Fitri 1447 H',
  '2026-03-25': 'Cuti Bersama Idul Fitri 1447 H',
  '2026-04-03': 'Wafat Yesus Kristus',
  '2026-05-01': 'Hari Buruh Internasional',
  '2026-05-14': 'Kenaikan Yesus Kristus',
  '2026-05-15': 'Cuti Bersama Kenaikan Yesus Kristus',
  '2026-05-27': 'Hari Raya Idul Adha 1447 H',
  '2026-05-28': 'Cuti Bersama Idul Adha',
  '2026-05-31': 'Hari Raya Waisak 2570 BE',
  '2026-06-01': 'Hari Lahir Pancasila',
  '2026-06-16': 'Tahun Baru Islam 1448 H',
  '2026-08-17': 'Hari Kemerdekaan RI',
  '2026-08-25': 'Maulid Nabi Muhammad SAW',
  '2026-12-24': 'Cuti Bersama Hari Raya Natal',
  '2026-12-25': 'Hari Raya Natal',
  '2026-12-31': 'Libur Akhir Tahun Bursa',

  // 2027
  '2027-01-01': 'Tahun Baru 2027 Masehi',
  '2027-02-05': 'Isra Mi\'raj Nabi Muhammad SAW',
  '2027-02-06': 'Cuti Bersama Tahun Baru Imlek',
  '2027-02-07': 'Tahun Baru Imlek 2578 Kongzili',
  '2027-03-09': 'Hari Raya Idul Fitri 1448 H',
  '2027-03-10': 'Hari Raya Idul Fitri 1448 H',
  '2027-03-11': 'Cuti Bersama Idul Fitri 1448 H',
  '2027-03-12': 'Cuti Bersama Idul Fitri 1448 H',
  '2027-03-26': 'Wafat Yesus Kristus',
  '2027-04-08': 'Hari Suci Nyepi',
  '2027-04-09': 'Cuti Bersama Hari Suci Nyepi',
  '2027-05-01': 'Hari Buruh Internasional',
  '2027-05-06': 'Kenaikan Yesus Kristus',
  '2027-05-07': 'Cuti Bersama Kenaikan Yesus Kristus',
  '2027-05-17': 'Hari Raya Idul Adha 1448 H',
  '2027-05-20': 'Hari Raya Waisak 2571 BE',
  '2027-06-01': 'Hari Lahir Pancasila',
  '2027-06-06': 'Tahun Baru Islam 1449 H',
  '2027-08-15': 'Maulid Nabi Muhammad SAW',
  '2027-08-17': 'Hari Kemerdekaan RI',
  '2027-12-24': 'Cuti Bersama Hari Raya Natal',
  '2027-12-25': 'Hari Raya Natal',
  '2027-12-31': 'Libur Akhir Tahun Bursa'
};

var FIXED_ANNUAL_HOLIDAYS = {
  '01-01': 'Tahun Baru Masehi',
  '05-01': 'Hari Buruh Internasional',
  '06-01': 'Hari Lahir Pancasila',
  '08-17': 'Hari Kemerdekaan RI',
  '12-25': 'Hari Raya Natal',
  '12-31': 'Libur Akhir Tahun Bursa'
};

function getIdxHolidayName(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return null;
  var d = dateStr.slice(0, 10);
  if (IDX_HOLIDAYS[d]) return IDX_HOLIDAYS[d];
  var mmdd = d.slice(5);
  if (FIXED_ANNUAL_HOLIDAYS[mmdd]) return FIXED_ANNUAL_HOLIDAYS[mmdd];
  return null;
}

function isIdxHoliday(dateStr) {
  return getIdxHolidayName(dateStr) !== null;
}

function getWibDate(date) {
  var d = (date instanceof Date && !isNaN(date.getTime())) ? date : new Date();
  var utc = d.getTime() + (d.getTimezoneOffset() * 60000);
  return new Date(utc + (7 * 3600000));
}

function getWibDateString(date) {
  var w = getWibDate(date);
  var y = w.getFullYear();
  var m = String(w.getMonth() + 1);
  if (m.length < 2) m = '0' + m;
  var d = String(w.getDate());
  if (d.length < 2) d = '0' + d;
  return y + '-' + m + '-' + d;
}

function isIdxTradingDay(date) {
  var w = getWibDate(date);
  var day = w.getDay();
  if (day === 0 || day === 6) return false;
  var dStr = getWibDateString(date);
  if (isIdxHoliday(dStr)) return false;
  return true;
}

function isIdxMarketOpen(date) {
  var w = getWibDate(date);
  var day = w.getDay(); // 0 = Sun, 1 = Mon, ..., 5 = Fri, 6 = Sat
  var hours = w.getHours();
  var minutes = w.getMinutes();
  var totalMinutes = hours * 60 + minutes;

  var dayNames = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  var dayName = dayNames[day];
  var wibTime = (hours < 10 ? '0' : '') + hours + ':' + (minutes < 10 ? '0' : '') + minutes;
  var dateStr = getWibDateString(date);
  var holidayName = getIdxHolidayName(dateStr);

  if (day === 0 || day === 6) {
    return {
      isOpen: false,
      isTradingDay: false,
      session: 'CLOSED',
      dayName: dayName,
      wibTime: wibTime,
      holidayName: null,
      reason: 'Akhir Pekan (' + dayName + ') — Bursa Efek Indonesia Tutup'
    };
  }

  if (holidayName) {
    return {
      isOpen: false,
      isTradingDay: false,
      session: 'CLOSED',
      dayName: dayName,
      wibTime: wibTime,
      holidayName: holidayName,
      reason: 'Hari Libur Bursa (' + holidayName + ') — Bursa Efek Indonesia Tutup'
    };
  }

  var isFriday = (day === 5);
  var s1Start = 9 * 60;        // 09:00
  var s1End = 11 * 60 + 30;    // 11:30
  var s2Start = isFriday ? (14 * 60) : (13 * 60 + 30); // Jumat 14:00, Senin-Kamis 13:30
  var s2End = 15 * 60 + 45;    // 15:45

  if (totalMinutes < s1Start) {
    return {
      isOpen: false,
      isTradingDay: true,
      session: 'PRE_MARKET',
      dayName: dayName,
      wibTime: wibTime,
      holidayName: null,
      reason: 'Pra-Pembukaan Bursa (Sebelum 09:00 WIB)'
    };
  }

  if (totalMinutes >= s1Start && totalMinutes < s1End) {
    return {
      isOpen: true,
      isTradingDay: true,
      session: 'SESI_1',
      dayName: dayName,
      wibTime: wibTime,
      holidayName: null,
      reason: 'Sesi 1 Perdagangan Berlangsung'
    };
  }

  if (totalMinutes >= s1End && totalMinutes < s2Start) {
    return {
      isOpen: false,
      isTradingDay: true,
      session: 'BREAK',
      dayName: dayName,
      wibTime: wibTime,
      holidayName: null,
      reason: isFriday ? 'Istirahat Sholat Jumat / Siang Bursa' : 'Istirahat Siang Bursa'
    };
  }

  if (totalMinutes >= s2Start && totalMinutes < s2End) {
    return {
      isOpen: true,
      isTradingDay: true,
      session: 'SESI_2',
      dayName: dayName,
      wibTime: wibTime,
      holidayName: null,
      reason: 'Sesi 2 Perdagangan Berlangsung'
    };
  }

  return {
    isOpen: false,
    isTradingDay: true,
    session: 'CLOSED',
    dayName: dayName,
    wibTime: wibTime,
    holidayName: null,
    reason: 'Pasca-Penutupan Bursa (Setelah 15:45 WIB)'
  };
}

if (typeof window !== 'undefined') {
  window.IDX_HOLIDAYS = IDX_HOLIDAYS;
  window.FIXED_ANNUAL_HOLIDAYS = FIXED_ANNUAL_HOLIDAYS;
  window.getIdxHolidayName = getIdxHolidayName;
  window.isIdxHoliday = isIdxHoliday;
  window.getWibDate = getWibDate;
  window.getWibDateString = getWibDateString;
  window.isIdxTradingDay = isIdxTradingDay;
  window.isIdxMarketOpen = isIdxMarketOpen;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    makePriceAdvancer: makePriceAdvancer,
    generateUtcDateRange: generateUtcDateRange,
    IDX_HOLIDAYS: IDX_HOLIDAYS,
    FIXED_ANNUAL_HOLIDAYS: FIXED_ANNUAL_HOLIDAYS,
    getIdxHolidayName: getIdxHolidayName,
    isIdxHoliday: isIdxHoliday,
    getWibDate: getWibDate,
    getWibDateString: getWibDateString,
    isIdxTradingDay: isIdxTradingDay,
    isIdxMarketOpen: isIdxMarketOpen
  };
}
