/**
 * 34-ksei-shareholders.js — MoneyWatch Pro: KSEI 5%+ Shareholders & Free Float Intelligence
 *
 * 1. Real KSEI Shareholder & Free Float Database (840+ IDX Stocks)
 * 2. Manual Excel upload (user cleans the raw IDX download into a fixed
 *    template, app parses + validates + persists — see kseiParseWorkbook())
 * 3. Free Float Calculation: 100% - Total Major Shareholders (>5%)
 * 4. Local vs Foreign Ownership Breakdown & Custodian Account Tracing
 * 5. Integrated across Fundamental Suite, Stock Intelligence Cockpit & Dedicated KSEI Explorer
 *
 * ARCHITECTURE (rewritten 2026-09-11, user-requested — "data ini harus
 * diolah dulu, dan apabila sumber data spreadsheet hilang maka data hilang
 * juga"): this used to fetch a Google Sheet as CSV via POST /api/ksei/sync,
 * which fs.writeFileSync()'d the result on the SERVER — on Vercel
 * serverless that filesystem is read-only outside /tmp, so the write
 * always threw EROFS in production (same failure class already fixed for
 * /api/user-data/save; see that handler's comment in server.js). The
 * "Update Data" button was effectively non-functional. It also kept a
 * THIRD copy of the data in Firebase Firestore, on top of localStorage and
 * the (broken) server file — redundant now, and Firestore is otherwise
 * unused for real app data since the Supabase migration.
 *
 * New flow: the user still does the manual cleanup work (IDX's raw export
 * needs human judgment — merged cells, stray rows — that a parser
 * shouldn't guess at), but now into a FIXED, named-column Excel template
 * instead of an ad-hoc Google Sheet, then uploads the .xlsx directly here.
 * Parsed client-side with the SheetJS `XLSX` library already loaded for
 * the Admin Panel's stock-universe import (public/js/14-admin.js's
 * idxImportFile() — same library, same header-name-based approach, not a
 * new dependency), validated explicitly (missing required column / bad
 * ticker / inconsistent report date => a clear rejection naming the
 * row, never a silent wrong default), then upserted to a DEDICATED
 * Supabase table (public.ksei_ownership, sql/schema_migration.sql) — same
 * isolation rationale as AI Paper Trading's own dedicated table: large,
 * infrequently-changing reference data must not ride along on every save
 * of frequently-changing personal transaction data (the user_data blob
 * saveData() uses).
 *
 * This directly answers the "kalau sheet hilang" worry: once uploaded,
 * the data lives in Supabase independent of the source file's continued
 * existence — only the NEXT re-upload needs a working source file, never
 * the data already stored. A bundled default snapshot (data/ksei-
 * shareholders.json, served read-only by GET /api/ksei/data — no write
 * involved, so no EROFS risk) is still used as the "belum ada data
 * ter-upload" starting point, mirroring the Admin Panel's own "universe
 * bawaan" fallback before a first Excel import.
 */

var KSEI_STATE = {
  data: {},
  metadata: {
    source: 'default_bundled', // 'default_bundled' | 'upload'
    title: 'KEPEMILIKAN EFEK DIATAS 5% BERDASARKAN SID (PUBLIK)',
    reportDate: null,
    totalEmiten: 0,
    totalMajorInvestors: 0,
    lastUpdated: null,
    uploadedFileName: null
  },
  selectedTicker: 'ADRO',
  activeTab: 'stock-view', // 'stock-view' | 'market-scanner' | 'sync-settings'
  scannerFilter: 'all', // 'all' | 'low-ff' | 'high-ff' | 'foreign' | 'accumulating' | 'distributing'
  scannerSearch: '',
  isLoading: false,
  isSyncing: false
};

// ══════════════════════════════════════════════════════════════
// 1. DATA INITIALIZATION & SUPABASE CLOUD SYNC (public.ksei_ownership)
// ══════════════════════════════════════════════════════════════

// Debounce is mostly moot here (upload is a deliberate one-click action,
// not a rapid-fire stream of edits like AI Paper Trading positions) but
// kept for the same "batch rapid successive calls into one network call"
// reason and to match the established pattern exactly.
var KSEI_CLOUD_SYNC_DEBOUNCE_MS = 1500;
var _kseiCloudSyncTimer = null;

function scheduleKseiCloudSync() {
  var uid = (typeof getAppUserId === 'function') ? getAppUserId() : null;
  if (!uid) return; // guest/demo/not signed in — localStorage-only, same as AI Paper Trading's own guard
  if (_kseiCloudSyncTimer) clearTimeout(_kseiCloudSyncTimer);
  _kseiCloudSyncTimer = setTimeout(function() { flushKseiCloudSync(uid); }, KSEI_CLOUD_SYNC_DEBOUNCE_MS);
}

async function flushKseiCloudSync(uid) {
  _kseiCloudSyncTimer = null;
  var client = (typeof getSupabaseClient === 'function') ? getSupabaseClient() : null;
  if (!client) return; // Supabase not configured (e.g. local dev) — localStorage already has the real write
  try {
    var result = await client.from('ksei_ownership').upsert({
      user_id: uid,
      data: KSEI_STATE.data,
      metadata: KSEI_STATE.metadata,
      updated_at: new Date().toISOString()
    });
    if (result && result.error) console.warn('[KSEI Cloud Sync]', result.error.message);
  } catch (e) {
    console.warn('[KSEI Cloud Sync]', e && e.message);
  }
}

var _kseiCloudLoadedOnce = false;

/**
 * Load priority:
 * 1. Fast local cache (instant paint while cloud/default load in background)
 * 2. Supabase ksei_ownership row for the signed-in user, if any (their own
 *    last uploaded dataset — the real source of truth once they've
 *    uploaded at least once)
 * 3. Bundled default snapshot (GET /api/ksei/data — read-only, static
 *    file bundled with the deploy) as the pre-upload starting point
 */
async function kseiInitData(forceRefresh) {
  // 1. Check local cache first for instant response
  if (!forceRefresh && (!KSEI_STATE.data || Object.keys(KSEI_STATE.data).length === 0)) {
    try {
      var cached = localStorage.getItem('MW_KSEI_DATA_CACHE');
      if (cached) {
        var parsedCache = JSON.parse(cached);
        if (parsedCache && parsedCache.data && Object.keys(parsedCache.data).length > 0) {
          KSEI_STATE.data = parsedCache.data;
          if (parsedCache.metadata) KSEI_STATE.metadata = parsedCache.metadata;
          return;
        }
      }
    } catch (e) {
      console.warn('[KSEI] Cache read error, clearing corrupted cache:', e);
      try { localStorage.removeItem('MW_KSEI_DATA_CACHE'); } catch(err){}
    }
  }

  // 2. Try the user's own uploaded dataset from Supabase
  if (!forceRefresh && !_kseiCloudLoadedOnce) {
    _kseiCloudLoadedOnce = true;
    var uid = (typeof getAppUserId === 'function') ? getAppUserId() : null;
    var client = (typeof getSupabaseClient === 'function') ? getSupabaseClient() : null;
    if (uid && client) {
      try {
        var result = await client.from('ksei_ownership').select('data, metadata').eq('user_id', uid).maybeSingle();
        if (result.error) {
          console.warn('[KSEI Cloud Load]', result.error.message);
        } else if (result.data && result.data.data && Object.keys(result.data.data).length > 0) {
          KSEI_STATE.data = result.data.data;
          if (result.data.metadata) KSEI_STATE.metadata = result.data.metadata;
          try {
            localStorage.setItem('MW_KSEI_DATA_CACHE', JSON.stringify({ metadata: KSEI_STATE.metadata, data: KSEI_STATE.data }));
          } catch (e) {}
          return;
        }
      } catch (e) {
        console.warn('[KSEI Cloud Load]', e && e.message);
      }
    }
  }

  // 3. Fallback: bundled default snapshot (read-only, no write involved)
  try {
    KSEI_STATE.isLoading = true;
    var resp = await fetch('/api/ksei/data');
    if (resp.ok) {
      var json = await resp.json();
      if (json.success && json.data) {
        var map = {};
        if (Array.isArray(json.data)) {
          json.data.forEach(function(item) {
            map[item.ticker] = item;
          });
        } else {
          map = json.data;
        }
        KSEI_STATE.data = map;
        if (json.metadata) KSEI_STATE.metadata = Object.assign({ source: 'default_bundled' }, json.metadata);

        // Persist to localStorage for ultra-fast startup
        try {
          localStorage.setItem('MW_KSEI_DATA_CACHE', JSON.stringify({
            metadata: KSEI_STATE.metadata,
            data: KSEI_STATE.data
          }));
        } catch (e) {}
      }
    }
  } catch (err) {
    console.warn('[KSEI] Error fetching /api/ksei/data, falling back to bundled JSON file:', err);
    try {
      var fResp = await fetch('data/ksei-shareholders.json');
      if (fResp.ok) {
        var fJson = await fResp.json();
        if (fJson && fJson.data) {
          KSEI_STATE.data = fJson.data;
          if (fJson.metadata) KSEI_STATE.metadata = Object.assign({ source: 'default_bundled' }, fJson.metadata);
        }
      }
    } catch (e) {}
  } finally {
    KSEI_STATE.isLoading = false;
  }
}

// ══════════════════════════════════════════════════════════════
// EXCEL UPLOAD TEMPLATE — fixed, named columns (header-based lookup,
// case/whitespace-insensitive), NOT positional like the old CSV parser
// this replaces. One row = one investor, OR one row per custodian
// sub-account for an investor that has more than one (repeat Ticker/Nama
// Investor/Persentase/Jumlah Saham identically on each such row — see
// template shared with the user). Every required column missing, or any
// row failing validation, REJECTS THE WHOLE FILE with a specific row-
// numbered reason — never silently falls back to a guessed default
// (the old parser's worst flaw: a hardcoded "26 Aug 2026" reportDate
// fallback when its date regex failed to match).
// ══════════════════════════════════════════════════════════════
var KSEI_TEMPLATE_REQUIRED_COLUMNS = ['Ticker', 'Nama Emiten', 'Nama Investor', 'Status', 'Persentase (%)', 'Jumlah Saham', 'Tanggal Laporan'];
// Optional — see the freeFloat/freeFloatIsEstimated note in kseiParseWorkbook()
// below for why this is a SEPARATE column, not derived from the required ones.
var KSEI_TEMPLATE_OPTIONAL_FF_COLUMN = 'Persentase Free Float (%)';

function _kseiNormKey(k) { return String(k || '').trim().toLowerCase(); }
function _kseiRowGet(normRow, colName) { return normRow[_kseiNormKey(colName)]; }

/**
 * Pure function: takes the row-object array XLSX.utils.sheet_to_json()
 * produces (keyed by header text) and returns either
 * {data, metadata, errors:[]} on success, or {data:null, metadata:null,
 * errors:[...]} on any validation failure (never a partial/best-effort
 * result — a half-imported dataset silently replacing a good one would be
 * worse than refusing outright).
 */
function kseiParseWorkbook(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return { data: null, metadata: null, errors: ['File kosong atau tidak punya baris data.'] };
  }

  var normRows = rows.map(function(r) {
    var out = {};
    Object.keys(r).forEach(function(k) { out[_kseiNormKey(k)] = r[k]; });
    return out;
  });

  var presentKeys = Object.keys(normRows[0]);
  var missingCols = KSEI_TEMPLATE_REQUIRED_COLUMNS.filter(function(c) {
    return presentKeys.indexOf(_kseiNormKey(c)) === -1;
  });
  if (missingCols.length > 0) {
    return { data: null, metadata: null, errors: ['Kolom wajib tidak ditemukan di file: ' + missingCols.join(', ') + '. Pastikan nama kolom persis sama dengan template.'] };
  }

  var dataByTicker = {};
  var reportDates = {};
  var rowErrors = [];

  normRows.forEach(function(normRow, idx) {
    var rowNum = idx + 2; // header is row 1
    var ticker = String(_kseiRowGet(normRow, 'Ticker') || '').trim().toUpperCase();
    var emitenName = String(_kseiRowGet(normRow, 'Nama Emiten') || '').trim();
    var investorName = String(_kseiRowGet(normRow, 'Nama Investor') || '').trim();
    var statusRaw = String(_kseiRowGet(normRow, 'Status') || '').trim();
    var pctRaw = _kseiRowGet(normRow, 'Persentase (%)');
    var sharesRaw = _kseiRowGet(normRow, 'Jumlah Saham');
    var reportDate = String(_kseiRowGet(normRow, 'Tanggal Laporan') || '').trim();

    // Skip a fully blank row (trailing empty rows are common in exports)
    if (!ticker && !emitenName && !investorName) return;

    if (!/^[A-Z0-9]{4,5}$/.test(ticker)) {
      rowErrors.push('Baris ' + rowNum + ': Ticker "' + ticker + '" tidak valid (harus 4-5 huruf/angka).');
      return;
    }
    if (!investorName) {
      rowErrors.push('Baris ' + rowNum + ' (' + ticker + '): Nama Investor kosong.');
      return;
    }
    var statusLower = statusRaw.toLowerCase();
    if (statusLower !== 'lokal' && statusLower !== 'asing') {
      rowErrors.push('Baris ' + rowNum + ' (' + ticker + '/' + investorName + '): Status harus "Lokal" atau "Asing", ditemukan "' + statusRaw + '".');
      return;
    }
    var pct = parseFloat(String(pctRaw).replace(/,/g, '').replace('%', ''));
    if (!isFinite(pct) || pct <= 0) {
      rowErrors.push('Baris ' + rowNum + ' (' + ticker + '/' + investorName + '): Persentase (%) tidak valid: "' + pctRaw + '".');
      return;
    }
    var shares = parseInt(String(sharesRaw).replace(/,/g, ''), 10);
    if (!isFinite(shares) || shares < 0) {
      rowErrors.push('Baris ' + rowNum + ' (' + ticker + '/' + investorName + '): Jumlah Saham tidak valid: "' + sharesRaw + '".');
      return;
    }
    if (!reportDate) {
      rowErrors.push('Baris ' + rowNum + ' (' + ticker + '/' + investorName + '): Tanggal Laporan kosong.');
      return;
    }
    reportDates[reportDate] = (reportDates[reportDate] || 0) + 1;

    var change = parseInt(String(_kseiRowGet(normRow, 'Perubahan Saham') || '0').replace(/,/g, ''), 10) || 0;
    var domicile = String(_kseiRowGet(normRow, 'Domisili') || '').trim() || 'INDONESIA';
    var custodian = String(_kseiRowGet(normRow, 'Nama Kustodian') || '').trim();
    var accName = String(_kseiRowGet(normRow, 'Nama Akun Kustodian') || '').trim();
    var custShares = parseInt(String(_kseiRowGet(normRow, 'Saham di Kustodian Ini') || '').replace(/,/g, ''), 10) || 0;
    // Free float is IDX's own published figure (from the separate free-float
    // compliance report), NOT simply 100% minus the >5% shareholders' total —
    // confirmed by cross-checking a real KSEI dataset against a hand-built
    // reference: e.g. one real ticker had 62.30% major-shareholder ownership
    // but an officially published free float of only 18.62%, not the naive
    // 37.70% complement (treasury stock, sub-5% affiliated/founder holdings,
    // etc. are excluded from "free float" but wouldn't show up as a >5%
    // shareholder row at all). Read per-row (same repeat-on-every-row
    // convention as the other optional columns) so it survives even if a
    // ticker's investor rows are entered on different lines.
    var ffRaw = _kseiRowGet(normRow, KSEI_TEMPLATE_OPTIONAL_FF_COLUMN);
    var ffParsed = (ffRaw !== undefined && ffRaw !== null && String(ffRaw).trim() !== '')
      ? parseFloat(String(ffRaw).replace(/,/g, '.').replace('%', ''))
      : null;

    if (!dataByTicker[ticker]) {
      dataByTicker[ticker] = {
        ticker: ticker,
        name: emitenName || ticker,
        investors: [],
        totalMajorPercent: 0,
        freeFloat: null,
        freeFloatIsEstimated: true,
        localPercent: 0,
        foreignPercent: 0,
        totalSharesHeld: 0,
        netChangeShares: 0,
        reportDate: reportDate
      };
    }
    if (isFinite(ffParsed) && ffParsed !== null) {
      dataByTicker[ticker].freeFloat = Math.round(ffParsed * 100) / 100;
      dataByTicker[ticker].freeFloatIsEstimated = false;
    }

    // Same investor name repeated under the same ticker = another
    // custodian sub-account for that investor (per the template's
    // documented convention), not a duplicate holding to add twice.
    var existingInvestor = dataByTicker[ticker].investors.filter(function(inv) { return inv.name === investorName; })[0];
    if (existingInvestor) {
      if (custodian || accName) {
        existingInvestor.accounts.push({ custodian: custodian, accountName: accName, shares: custShares, domicile: domicile });
      }
    } else {
      var investor = {
        name: investorName,
        percentage: pct,
        shares: shares,
        change: change,
        status: statusLower === 'asing' ? 'Asing' : 'Lokal',
        domicile: domicile,
        accounts: []
      };
      if (custodian || accName) {
        investor.accounts.push({ custodian: custodian, accountName: accName, shares: custShares, domicile: domicile });
      }
      dataByTicker[ticker].investors.push(investor);
    }
  });

  if (rowErrors.length > 0) {
    return { data: null, metadata: null, errors: rowErrors };
  }

  var reportDateKeys = Object.keys(reportDates);
  if (reportDateKeys.length > 1) {
    return {
      data: null, metadata: null,
      errors: ['Kolom "Tanggal Laporan" tidak konsisten — ditemukan ' + reportDateKeys.length + ' tanggal berbeda dalam satu file (' + reportDateKeys.join(', ') + '). Pastikan semua baris memakai tanggal laporan yang sama sebelum upload.']
    };
  }
  if (reportDateKeys.length === 0 || Object.keys(dataByTicker).length === 0) {
    return { data: null, metadata: null, errors: ['Tidak ada baris valid ditemukan setelah validasi.'] };
  }
  var finalReportDate = reportDateKeys[0];

  var totalHoldersCount = 0;
  Object.keys(dataByTicker).forEach(function(t) {
    var item = dataByTicker[t];
    var totPct = 0, locPct = 0, forPct = 0, totShares = 0, totChg = 0;
    item.investors.forEach(function(inv) {
      totPct += inv.percentage;
      if (inv.status === 'Asing') forPct += inv.percentage; else locPct += inv.percentage;
      totShares += inv.shares;
      totChg += inv.change;
    });
    item.totalMajorPercent = Math.min(100, Math.round(totPct * 100) / 100);
    // freeFloat was set per-row above (from the optional column) when
    // present; a ticker that never had it falls back here to the naive
    // complement, clearly flagged freeFloatIsEstimated:true — see the note
    // above this function on why that complement is not the real figure.
    if (item.freeFloat === null) {
      item.freeFloat = Math.max(0, Math.round((100 - item.totalMajorPercent) * 100) / 100);
    }
    item.localPercent = Math.round(locPct * 100) / 100;
    item.foreignPercent = Math.round(forPct * 100) / 100;
    item.totalSharesHeld = totShares;
    item.netChangeShares = totChg;
    item.reportDate = finalReportDate;
    totalHoldersCount += item.investors.length;
  });

  return {
    data: dataByTicker,
    metadata: {
      source: 'upload',
      title: 'KEPEMILIKAN EFEK DIATAS 5% BERDASARKAN SID (PUBLIK) per tanggal ' + finalReportDate,
      reportDate: finalReportDate,
      totalEmiten: Object.keys(dataByTicker).length,
      totalMajorInvestors: totalHoldersCount,
      lastUpdated: new Date().toISOString()
    },
    errors: []
  };
}

// ══════════════════════════════════════════════════════════════
// RAW IDX FILE UPLOAD — Kepemilikan >5% + Free Float, straight from IDX,
// no manual "build Master" step required (user-requested, 2026-09-11,
// after the single-template path above). Validated against a real KSEI
// dataset (Aug 2026, 840 emiten) cross-checked against the user's own
// hand-built reference table: 1,043/1,043 (ticker,status) buckets matched
// EXACTLY on percentage AND on Papan/Kapitalisasi/JPS/Free Float% — see
// INCIDENT_LOG.md for the full validation write-up. The only 3
// discrepancies were a SheetJS boolean-coercion quirk (ticker "TRUE" read
// as JS `true`, guarded by _kseiCellText() below) and two rows where
// KSEI's own raw export mislabels a sub-custodian-account row's L/A
// status differently from its investor's main row — both contribute 0%
// in the reference table too (i.e. noise, not a real ownership signal).
//
// Structurally different from kseiParseWorkbook() above: these are the
// UNMODIFIED files IDX/KSEI publish (multi-row merged super-headers,
// continuation rows, 1-2 report-period column blocks side by side) —
// read as raw 2D arrays (XLSX.utils.sheet_to_json(sheet, {header:1})),
// not header-keyed row objects, and every column position is LOCATED by
// searching for landmark header text (never a hardcoded index — that was
// the pre-2026-09-11 parser's failure mode) so a month where IDX
// adds/drops a comparison-period column doesn't silently misread data
// into the wrong field. When 2 period columns exist side by side, the
// RIGHTMOST (last) one is always the most recent — confirmed against
// both real files.
// ══════════════════════════════════════════════════════════════

// Guards against a ticker cell like "TRUE"/"FALSE" coming back as a JS
// boolean instead of text — found via the real KSEI file: ticker "TRUE"
// (PT Triniti Dinamik Tbk) silently became boolean `true` under SheetJS,
// same class of surprise Excel itself applies to a bare "TRUE" cell.
function _kseiCellText(v) {
  if (v === true) return 'TRUE';
  if (v === false) return 'FALSE';
  if (v === null || v === undefined) return '';
  return String(v);
}

// Scans `rows2D` (array of arrays) for the first row containing a cell
// whose text STARTS WITH `headerPrefix` (case-insensitive) within the
// first `maxScanRows` rows. Returns the row index, or -1 if not found.
function _kseiFindHeaderRowIdx(rows2D, headerPrefix, maxScanRows) {
  var limit = Math.min(rows2D.length, maxScanRows || 20);
  var needle = headerPrefix.toLowerCase();
  for (var r = 0; r < limit; r++) {
    var row = rows2D[r] || [];
    for (var c = 0; c < row.length; c++) {
      if (_kseiCellText(row[c]).trim().toLowerCase().indexOf(needle) === 0) return r;
    }
  }
  return -1;
}

// Within ONE specific row, finds every column whose text starts with
// `headerPrefix` and returns the LAST (rightmost) match — the most
// recent report-period column, when IDX places several side by side.
// Returns -1 if not found (caller must treat that as a hard error, never
// default to column 0).
function _kseiFindLastColInRow(row, headerPrefix) {
  var needle = headerPrefix.toLowerCase();
  var found = -1;
  for (var c = 0; c < row.length; c++) {
    if (_kseiCellText(row[c]).trim().toLowerCase().indexOf(needle) === 0) found = c;
  }
  return found;
}

function _kseiParseNum(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return v;
  var n = parseFloat(String(v).replace(/,/g, ''));
  return isFinite(n) ? n : null;
}

/**
 * Parses the raw "Kepemilikan Efek Diatas 5%" KSEI export (2D array from
 * XLSX.utils.sheet_to_json(sheet, {header:1})). Returns
 * {investors: [{ticker, emiten, investor, status, combinedShares,
 * combinedPct}], reportDate, errors: []} — or {investors:null,
 * errors:[...]} if the expected structure isn't found (never guesses).
 */
function kseiParseOwnershipRaw(rows2D) {
  if (!Array.isArray(rows2D) || rows2D.length < 5) {
    return { investors: null, reportDate: null, errors: ['File Kepemilikan kosong atau terlalu pendek — pastikan ini file mentah KSEI, bukan file yang sudah diolah.'] };
  }

  var titleRow = rows2D[0] || [];
  var titleText = titleRow.map(_kseiCellText).join(' ');
  var dateMatch = titleText.match(/per tanggal\s+([^,]+)/i);
  if (!dateMatch) {
    return { investors: null, reportDate: null, errors: ['Tidak menemukan "per tanggal ..." di baris judul file Kepemilikan — pastikan ini file mentah KSEI yang belum diubah (judul aslinya "KEPEMILIKAN EFEK DIATAS 5% BERDASARKAN SID... per tanggal <tanggal>").'] };
  }
  var reportDate = dateMatch[1].trim();

  var hdr1Idx = _kseiFindHeaderRowIdx(rows2D, 'Kode Efek', 10);
  if (hdr1Idx === -1) {
    return { investors: null, reportDate: null, errors: ['Kolom "Kode Efek" tidak ditemukan di 10 baris pertama — struktur file Kepemilikan tidak dikenali.'] };
  }
  var hdr1 = rows2D[hdr1Idx];
  var hdr2 = rows2D[hdr1Idx + 1] || [];

  var colTicker = _kseiFindLastColInRow(hdr1, 'Kode Efek');
  var colEmiten = _kseiFindLastColInRow(hdr1, 'Nama Emiten');
  var colInvestor = _kseiFindLastColInRow(hdr1, 'Nama Pemegang Saham');
  var colStatus = _kseiFindLastColInRow(hdr1, 'Status');
  var required = { 'Kode Efek': colTicker, 'Nama Emiten': colEmiten, 'Nama Pemegang Saham': colInvestor, 'Status': colStatus };
  var missing = Object.keys(required).filter(function(k) { return required[k] === -1; });
  if (missing.length > 0) {
    return { investors: null, reportDate: null, errors: ['Kolom wajib tidak ditemukan di file Kepemilikan: ' + missing.join(', ') + '.'] };
  }

  // "Saham Gabungan Per Investor" / "Persentase Kepemilikan Per Investor
  // (%)" repeat once per report-period block (1 or 2 blocks side by
  // side) — take the LAST occurrence = the most recent period.
  var colCombinedShares = _kseiFindLastColInRow(hdr2, 'Saham Gabungan Per Investor');
  var colCombinedPct = _kseiFindLastColInRow(hdr2, 'Persentase Kepemilikan Per Investor');
  if (colCombinedShares === -1 || colCombinedPct === -1) {
    return { investors: null, reportDate: null, errors: ['Kolom "Saham Gabungan Per Investor" / "Persentase Kepemilikan Per Investor (%)" tidak ditemukan pada baris sub-header — struktur periode file Kepemilikan tidak dikenali.'] };
  }

  var investors = [];
  var cur = null;
  for (var r = hdr1Idx + 2; r < rows2D.length; r++) {
    var row = rows2D[r] || [];
    var tickerCell = _kseiCellText(row[colTicker]).trim().toUpperCase();
    if (!tickerCell) continue; // spacer/footnote row — skip, not an error
    var investorCell = _kseiCellText(row[colInvestor]).trim();
    if (investorCell) {
      // new investor group
      cur = {
        ticker: tickerCell,
        emiten: _kseiCellText(row[colEmiten]).trim(),
        investor: investorCell,
        status: _kseiCellText(row[colStatus]).trim().toUpperCase().indexOf('A') === 0 ? 'Asing' : 'Lokal',
        combinedShares: _kseiParseNum(row[colCombinedShares]) || 0,
        combinedPct: _kseiParseNum(row[colCombinedPct]) || 0
      };
      investors.push(cur);
    }
    // continuation rows (additional custodian sub-accounts for `cur`)
    // carry no new percentage/shares total — KSEI already gives the
    // investor-level combined total on the group's first row, so they're
    // intentionally not re-summed here (see file header for why: the
    // validation run confirmed re-summing sub-account rows is
    // unnecessary and a source of the 2 known raw-data status-label
    // anomalies, not a fix for them).
  }

  if (investors.length === 0) {
    return { investors: null, reportDate: null, errors: ['Tidak ada baris investor valid ditemukan di file Kepemilikan setelah header.'] };
  }

  return { investors: investors, reportDate: reportDate, errors: [] };
}

/**
 * Parses the raw IDX Free Float compliance report (2D array). Returns
 * {byTicker: {TICKER: {papan, kapitalisasi, jumlahPemegangSaham,
 * freeFloatPct}}, errors: []} — or {byTicker:null, errors:[...]}.
 */
function kseiParseFreeFloatRaw(rows2D) {
  if (!Array.isArray(rows2D) || rows2D.length < 10) {
    return { byTicker: null, errors: ['File Free Float kosong atau terlalu pendek — pastikan ini file mentah IDX, bukan file yang sudah diolah.'] };
  }

  var hdr1Idx = _kseiFindHeaderRowIdx(rows2D, 'Kode', 20);
  if (hdr1Idx === -1) {
    return { byTicker: null, errors: ['Kolom "Kode" tidak ditemukan di 20 baris pertama — struktur file Free Float tidak dikenali.'] };
  }
  var hdr1 = rows2D[hdr1Idx];
  var hdr2 = rows2D[hdr1Idx + 1] || [];

  var colTicker = _kseiFindLastColInRow(hdr1, 'Kode');
  var colEmiten = _kseiFindLastColInRow(hdr1, 'Nama Perusahaan');
  var colPapan = _kseiFindLastColInRow(hdr1, 'Papan Pencatatan');
  var colKap = _kseiFindLastColInRow(hdr2, 'Kapitalisasi Pasar');
  var colJps = _kseiFindLastColInRow(hdr2, 'Jumlah Pemegang Saham');
  var colFf = _kseiFindLastColInRow(hdr2, '% Saham Free Float');
  var required = { 'Kode': colTicker, 'Papan Pencatatan': colPapan, 'Kapitalisasi Pasar': colKap, 'Jumlah Pemegang Saham': colJps, '% Saham Free Float': colFf };
  var missing = Object.keys(required).filter(function(k) { return required[k] === -1; });
  if (missing.length > 0) {
    return { byTicker: null, errors: ['Kolom wajib tidak ditemukan di file Free Float: ' + missing.join(', ') + '.'] };
  }

  var byTicker = {};
  var n = 0;
  for (var r = hdr1Idx + 2; r < rows2D.length; r++) {
    var row = rows2D[r] || [];
    var tickerCell = _kseiCellText(row[colTicker]).trim().toUpperCase();
    if (!/^[A-Z0-9]{4,5}$/.test(tickerCell)) continue; // footnote/blank/spacer row — skip, not an error
    var ffRaw = _kseiCellText(row[colFf]).replace(',', '.').replace('%', '').trim();
    var ffPct = parseFloat(ffRaw);
    byTicker[tickerCell] = {
      emiten: colEmiten !== -1 ? _kseiCellText(row[colEmiten]).trim() : '',
      papan: _kseiCellText(row[colPapan]).trim(),
      kapitalisasi: _kseiCellText(row[colKap]).trim(),
      jumlahPemegangSaham: _kseiParseNum(row[colJps]),
      freeFloatPct: isFinite(ffPct) ? Math.round(ffPct * 100) / 100 : null
    };
    n++;
  }

  if (n === 0) {
    return { byTicker: null, errors: ['Tidak ada baris ticker valid ditemukan di file Free Float setelah header.'] };
  }

  return { byTicker: byTicker, errors: [] };
}

// ══════════════════════════════════════════════════════════════
// SAME-INVESTOR DEDUPLICATION (added 2026-09-11, user-requested audit —
// "cek kalau ada emiten lain yang datanya aneh"). Found scanning all 840
// real emiten: KSEI's raw export lists the SAME beneficial owner under 2+
// slightly different name strings within one ticker (e.g. "PERUSAHAAN
// PERSEROAN (PERSERO) PT ASABRI" vs "...PT. ASABRI" — one extra period —
// across 17 different tickers; "BANK PAN INDONESIA TBK, PT" vs "Panin
// Bank Tbk, PT", its own brand name, across 5 more), each row carrying
// IDENTICAL percentage/shares — summing both as if they were 2 distinct
// holders inflates totalMajorPercent (one ticker, ASJT, hit a
// mathematically impossible 154.78% this way) and, for tickers without an
// official Free Float match, deflates the naive freeFloat estimate. This
// exact inflated figure was independently confirmed in the user's own
// hand-built "Master Data Kepemilikan" reference too — a real KSEI/IDX
// data quality gap, not something this parser introduced.
//
// Deliberately conservative: only merges when BOTH (a) the percentage AND
// share count are EXACTLY identical between the two rows (the actual
// signal that this is one real holding double-listed, not a coincidence)
// AND (b) the names resolve to the same entity after stripping legal
// noise (PT/PT./Tbk/punctuation/case) or via the small known-alias table
// below. A same-ticker scan found ~70 OTHER pairs with identical percent/
// shares but genuinely different-looking names (e.g. 5 different named
// siblings/heirs each holding an exactly equal split) — those are NOT
// touched here; merging them would risk hiding real distinct
// shareholders, which is worse than leaving a rare KSEI duplicate
// unmerged. See INCIDENT_LOG.md for the full audit and the specific
// ticker lists in both categories.
var KSEI_KNOWN_INVESTOR_ALIASES = [
  // [substring found in one name, substring found in the alias, both after normalization]
  ['bank pan indonesia', 'panin bank']
];

function _kseiNormalizeInvestorName(name) {
  var n = String(name || '').toLowerCase();
  // Legal-form noise: "pt"/"tbk" as standalone words (not inside another
  // word), then punctuation, then collapse whitespace.
  n = n.replace(/\bpt\b/g, '').replace(/\btbk\b/g, '').replace(/[.,]/g, '').replace(/\s+/g, ' ').trim();
  return n;
}

// True only when both names, after normalization, are either IDENTICAL,
// or match one of the known brand-name aliases above.
function _kseiSameInvestorEntity(nameA, nameB) {
  var a = _kseiNormalizeInvestorName(nameA);
  var b = _kseiNormalizeInvestorName(nameB);
  if (a === b) return true;
  return KSEI_KNOWN_INVESTOR_ALIASES.some(function(pair) {
    return (a.indexOf(pair[0]) !== -1 && b.indexOf(pair[1]) !== -1) ||
           (b.indexOf(pair[0]) !== -1 && a.indexOf(pair[1]) !== -1);
  });
}

/**
 * Combines the two raw-parse results into the SAME per-ticker data shape
 * kseiParseWorkbook() above produces (dataByTicker[ticker] = {ticker,
 * name, investors:[...], totalMajorPercent, freeFloat,
 * freeFloatIsEstimated, localPercent, foreignPercent, ...}) — so every
 * other part of this file (getKseiStock(), the Explorer modal, the
 * Scanner) works identically regardless of which upload path produced
 * the data.
 */
function kseiCombineRawSheets(ownershipResult, ffResult) {
  var dataByTicker = {};
  ownershipResult.investors.forEach(function(inv) {
    if (!dataByTicker[inv.ticker]) {
      dataByTicker[inv.ticker] = {
        ticker: inv.ticker,
        name: inv.emiten || inv.ticker,
        investors: [],
        totalMajorPercent: 0,
        freeFloat: null,
        freeFloatIsEstimated: true,
        localPercent: 0,
        foreignPercent: 0,
        totalSharesHeld: 0,
        netChangeShares: 0,
        reportDate: ownershipResult.reportDate
      };
    }
    var item = dataByTicker[inv.ticker];
    if (inv.emiten) item.name = inv.emiten;

    // Same-investor dedup (see KSEI_KNOWN_INVESTOR_ALIASES note above) —
    // only when status/percentage/shares all match exactly AND the names
    // resolve to the same entity; otherwise always a new investor row,
    // same as before.
    var dupOf = item.investors.filter(function(existing) {
      return existing.status === inv.status &&
        existing.percentage === inv.combinedPct &&
        existing.shares === inv.combinedShares &&
        _kseiSameInvestorEntity(existing.name, inv.investor);
    })[0];
    if (dupOf) {
      if (!dupOf.mergedAliasNames) dupOf.mergedAliasNames = [];
      dupOf.mergedAliasNames.push(inv.investor);
    } else {
      item.investors.push({
        name: inv.investor,
        percentage: inv.combinedPct,
        shares: inv.combinedShares,
        change: 0,
        status: inv.status,
        domicile: inv.status === 'Asing' ? 'LUAR NEGERI' : 'INDONESIA',
        accounts: []
      });
    }
  });

  var totalHoldersCount = 0;
  Object.keys(dataByTicker).forEach(function(t) {
    var item = dataByTicker[t];
    var totPct = 0, locPct = 0, forPct = 0, totShares = 0;
    item.investors.forEach(function(inv) {
      totPct += inv.percentage;
      if (inv.status === 'Asing') forPct += inv.percentage; else locPct += inv.percentage;
      totShares += inv.shares;
    });
    item.totalMajorPercent = Math.min(100, Math.round(totPct * 100) / 100);
    item.localPercent = Math.round(locPct * 100) / 100;
    item.foreignPercent = Math.round(forPct * 100) / 100;
    item.totalSharesHeld = totShares;
    totalHoldersCount += item.investors.length;

    var ff = ffResult.byTicker[t];
    if (ff) {
      item.papan = ff.papan;
      item.kapitalisasiPasar = ff.kapitalisasi;
      item.jumlahPemegangSaham = ff.jumlahPemegangSaham;
      if (ff.freeFloatPct !== null) {
        item.freeFloat = ff.freeFloatPct;
        item.freeFloatIsEstimated = false;
      }
    }
    // No FF match for this ticker — freeFloat stays null/estimated:true,
    // an honest gap (44 of 840 real tickers had this in the validated
    // dataset — e.g. a ticker recently listed/delisted between the two
    // reports) rather than a fabricated number.
    if (item.freeFloat === null) {
      item.freeFloat = Math.max(0, Math.round((100 - item.totalMajorPercent) * 100) / 100);
    }
  });

  return {
    data: dataByTicker,
    metadata: {
      source: 'upload_raw_2file',
      title: 'KEPEMILIKAN EFEK DIATAS 5% BERDASARKAN SID (PUBLIK) per tanggal ' + ownershipResult.reportDate,
      reportDate: ownershipResult.reportDate,
      totalEmiten: Object.keys(dataByTicker).length,
      totalMajorInvestors: totalHoldersCount,
      lastUpdated: new Date().toISOString()
    }
  };
}

/**
 * Wired to the two raw-file inputs in the Sync Settings tab. Reads BOTH
 * files, parses independently (kseiParseOwnershipRaw/kseiParseFreeFloatRaw),
 * and only combines+applies if BOTH parsed cleanly — a bad Free Float file
 * must not silently apply a Kepemilikan-only dataset with every freeFloat
 * naively estimated, that regression is exactly what freeFloatIsEstimated
 * exists to make visible instead of hiding.
 */
function kseiImportRawFiles(ownershipInputId, ffInputId) {
  var ownershipInp = document.getElementById(ownershipInputId || 'ksei-import-ownership-file');
  var ffInp = document.getElementById(ffInputId || 'ksei-import-ff-file');
  var ownershipFile = ownershipInp && ownershipInp.files && ownershipInp.files[0];
  var ffFile = ffInp && ffInp.files && ffInp.files[0];
  if (!ownershipFile || !ffFile) { if (typeof showToast === 'function') showToast('Pilih KEDUA file (Kepemilikan dan Free Float) dulu'); return; }
  if (typeof XLSX === 'undefined') { if (typeof showToast === 'function') showToast('Pustaka pembaca Excel belum termuat, coba lagi sebentar'); return; }
  if (!confirm('RESET TOTAL data KSEI 5%+ Shareholders & Free Float?\n\nSeluruh data yang tersimpan akan DIGANTI TOTAL dengan gabungan:\n\n"' + ownershipFile.name + '"\n"' + ffFile.name + '"\n\nLanjutkan?')) return;

  KSEI_STATE.isSyncing = true;
  kseiUpdateSyncUI();
  if (typeof showToast === 'function') showToast('⏳ Membaca & menggabungkan 2 file...');

  function readAsRows(file) {
    return new Promise(function(resolve, reject) {
      var reader = new FileReader();
      reader.onload = function(e) {
        try {
          var wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
          var sheet = wb.Sheets[wb.SheetNames[0]];
          resolve(XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: true }));
        } catch (err) { reject(err); }
      };
      reader.onerror = function() { reject(new Error('Gagal membaca ' + file.name)); };
      reader.readAsArrayBuffer(file);
    });
  }

  Promise.all([readAsRows(ownershipFile), readAsRows(ffFile)]).then(function(results) {
    var ownershipRows = results[0], ffRows = results[1];
    var ownershipResult = kseiParseOwnershipRaw(ownershipRows);
    var ffResult = kseiParseFreeFloatRaw(ffRows);
    var errors = (ownershipResult.errors || []).concat(ffResult.errors || []);

    if (errors.length > 0) {
      var msg = errors.join('\n');
      if (typeof showToast === 'function') showToast('❌ File ditolak: ' + errors[0] + (errors.length > 1 ? ' (+' + (errors.length - 1) + ' lainnya)' : ''));
      alert('File ditolak — data KSEI TIDAK diubah. Perbaiki dulu:\n\n' + msg);
      return;
    }

    var combined = kseiCombineRawSheets(ownershipResult, ffResult);
    KSEI_STATE.data = combined.data;
    KSEI_STATE.metadata = Object.assign({}, combined.metadata, {
      uploadedFileName: ownershipFile.name + ' + ' + ffFile.name
    });

    try {
      localStorage.setItem('MW_KSEI_DATA_CACHE', JSON.stringify({ metadata: KSEI_STATE.metadata, data: KSEI_STATE.data }));
    } catch (e2) {}

    scheduleKseiCloudSync();

    var unmatchedCount = Object.keys(combined.data).filter(function(t) { return combined.data[t].freeFloatIsEstimated; }).length;
    var okMsg = '✅ Berhasil menggabungkan ' + combined.metadata.totalEmiten + ' emiten (periode ' + combined.metadata.reportDate + ')';
    if (unmatchedCount > 0) okMsg += ' — ' + unmatchedCount + ' emiten tanpa data Free Float resmi (dipakai estimasi 100%-mayoritas, ditandai jelas di tampilan).';
    if (typeof showToast === 'function') showToast(okMsg);
    kseiRefreshActiveViews();
  }).catch(function(err) {
    console.error('[KSEI Raw Import Error]', err);
    if (typeof showToast === 'function') showToast('❌ Gagal membaca file: ' + err.message);
  }).finally(function() {
    KSEI_STATE.isSyncing = false;
    kseiUpdateSyncUI();
  });
}

/**
 * Wired to the file input in the Sync Settings tab. Reads the selected
 * .xlsx with the SheetJS `XLSX` library already loaded for the Admin
 * Panel's stock-universe import (same library, no new dependency),
 * validates via kseiParseWorkbook(), and on success REPLACES the entire
 * KSEI dataset (localStorage cache immediately + debounced Supabase
 * upsert — see scheduleKseiCloudSync()). A validation failure changes
 * nothing — the file is rejected with the specific row-level reasons.
 */
function kseiImportExcelFile(inputElId) {
  var inp = document.getElementById(inputElId || 'ksei-import-file');
  var f = inp && inp.files && inp.files[0];
  if (!f) { if (typeof showToast === 'function') showToast('Pilih file Excel dulu'); return; }
  if (typeof XLSX === 'undefined') { if (typeof showToast === 'function') showToast('Pustaka pembaca Excel belum termuat, coba lagi sebentar'); return; }
  if (!confirm('RESET TOTAL data KSEI 5%+ Shareholders & Free Float?\n\nSeluruh data yang tersimpan akan DIGANTI TOTAL dengan isi file:\n\n"' + f.name + '"\n\nLanjutkan?')) return;

  KSEI_STATE.isSyncing = true;
  kseiUpdateSyncUI();
  if (typeof showToast === 'function') showToast('⏳ Membaca ' + f.name + '...');

  var reader = new FileReader();
  reader.onload = function(e) {
    try {
      var wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
      var sheet = wb.Sheets[wb.SheetNames[0]];
      var rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
      var result = kseiParseWorkbook(rows);

      if (result.errors && result.errors.length > 0) {
        var msg = result.errors.slice(0, 8).join('\n') + (result.errors.length > 8 ? '\n... (' + (result.errors.length - 8) + ' error lainnya)' : '');
        if (typeof showToast === 'function') showToast('❌ File ditolak: ' + result.errors[0] + (result.errors.length > 1 ? ' (+' + (result.errors.length - 1) + ' lainnya)' : ''));
        alert('File "' + f.name + '" ditolak — data KSEI TIDAK diubah. Perbaiki dulu:\n\n' + msg);
        return;
      }

      KSEI_STATE.data = result.data;
      KSEI_STATE.metadata = Object.assign({}, result.metadata, { uploadedFileName: f.name });

      try {
        localStorage.setItem('MW_KSEI_DATA_CACHE', JSON.stringify({ metadata: KSEI_STATE.metadata, data: KSEI_STATE.data }));
      } catch (e2) {}

      scheduleKseiCloudSync();

      if (typeof showToast === 'function') {
        showToast('✅ Berhasil mengimpor ' + KSEI_STATE.metadata.totalEmiten + ' emiten dari ' + f.name + ' (periode ' + KSEI_STATE.metadata.reportDate + ')');
      }
      kseiRefreshActiveViews();
    } catch (err) {
      console.error('[KSEI Import Error]', err);
      if (typeof showToast === 'function') showToast('❌ Gagal membaca file Excel: ' + err.message);
    } finally {
      KSEI_STATE.isSyncing = false;
      kseiUpdateSyncUI();
    }
  };
  reader.readAsArrayBuffer(f);
}

/**
 * Get KSEI Stock details for any ticker
 */
function getKseiStock(ticker) {
  if (!ticker) return null;
  var tk = String(ticker).toUpperCase().trim().replace('.JK', '').replace('.US', '');
  
  if (KSEI_STATE.data && KSEI_STATE.data[tk]) {
    return KSEI_STATE.data[tk];
  }

  // Fallback defaults if stock has no major >5% shareholders (100% free float or widely held)
  // Same class of bug as the CUAN incident (07-flowscan.js's
  // fsFallbackInfo()): this used to build a generic "<TICKER> Tbk."
  // placeholder without ever checking DB[tk].name first, even when the
  // real company name is already available there.
  var dbName = (typeof DB !== 'undefined' && DB[tk] && DB[tk].name && DB[tk].name !== tk) ? DB[tk].name : null;
  return {
    ticker: tk,
    name: dbName || (tk + ' Tbk.'),
    investors: [],
    totalMajorPercent: 0,
    freeFloat: 100,
    freeFloatIsEstimated: true,
    localPercent: 0,
    foreignPercent: 0,
    totalSharesHeld: 0,
    netChangeShares: 0,
    reportDate: KSEI_STATE.metadata ? KSEI_STATE.metadata.reportDate : 'Terbaru',
    isDispersed: true
  };
}

// ══════════════════════════════════════════════════════════════
// 2. MODAL & EXPLORER INTERFACE
// ══════════════════════════════════════════════════════════════

/**
 * Open the dedicated KSEI 5%+ Shareholders & Free Float Explorer Modal
 */
function openKseiModal(ticker) {
  if (ticker) {
    KSEI_STATE.selectedTicker = String(ticker).toUpperCase().trim().replace('.JK', '').replace('.US', '');
  }

  var existing = document.getElementById('ksei-modal-overlay');
  if (!existing) {
    var modalHtml = `
      <div class="overlay" id="ksei-modal-overlay" style="display:flex;align-items:center;justify-content:center;z-index:9999;background:rgba(0,0,0,0.85);backdrop-filter:blur(6px);position:fixed;inset:0;padding:16px">
        <div class="modal" style="width:1080px;max-width:98vw;max-height:92vh;display:flex;flex-direction:column;background:var(--bg);border:1px solid var(--border2);border-radius:12px;box-shadow:0 25px 50px -12px rgba(0,0,0,0.7);overflow:hidden;padding:0">
          
          <!-- MODAL HEADER -->
          <div style="padding:16px 20px;background:var(--bg2);border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px">
            <div style="display:flex;align-items:center;gap:10px">
              <div style="width:36px;height:36px;border-radius:8px;background:rgba(16,185,129,0.15);border:1px solid rgba(16,185,129,0.3);display:flex;align-items:center;justify-content:center;color:#10B981;font-size:18px">
                🏛️
              </div>
              <div>
                <div style="font-size:16px;font-weight:800;color:var(--text);display:flex;align-items:center;gap:8px">
                  KSEI 5%+ Shareholders &amp; Free Float Explorer
                  <span class="badge b-up" style="font-size:10px">SUPABASE STORED</span>
                </div>
                <div style="font-size:11px;color:var(--text3);display:flex;align-items:center;gap:6px" id="ksei-modal-meta-bar">
                  <span>Memuat data KSEI...</span>
                </div>
              </div>
            </div>

            <!-- MODAL ACTION BUTTONS -->
            <div style="display:flex;align-items:center;gap:8px">
              <button id="btn-ksei-sync" class="btn btn-blue btn-xs" onclick="kseiSwitchTab('sync-settings')" style="display:flex;align-items:center;gap:5px;font-size:11px;padding:6px 12px;font-weight:700">
                📤 Update Data (Upload Excel)
              </button>
              <button class="mclose" onclick="closeKseiModal()" style="font-size:22px;line-height:1;background:none;border:none;color:var(--text3);cursor:pointer;padding:4px 8px" aria-label="Tutup dialog">×</button>
            </div>
          </div>

          <!-- SUB NAVIGATION TABS -->
          <div style="display:flex;gap:2px;background:var(--bg3);padding:6px 16px;border-bottom:1px solid var(--border);overflow-x:auto">
            <button id="ksei-tab-btn-stock" class="btn btn-xs btn-primary" onclick="kseiSwitchTab('stock-view')" style="font-size:11px;padding:5px 12px;border-radius:6px">
              🔍 Analisis Kepemilikan Emiten
            </button>
            <button id="ksei-tab-btn-scanner" class="btn btn-xs btn-ghost" onclick="kseiSwitchTab('market-scanner')" style="font-size:11px;padding:5px 12px;border-radius:6px">
              📊 Market-Wide Free Float Scanner (840 Saham)
            </button>
            <button id="ksei-tab-btn-settings" class="btn btn-xs btn-ghost" onclick="kseiSwitchTab('sync-settings')" style="font-size:11px;padding:5px 12px;border-radius:6px">
              📤 Upload Excel &amp; Sumber Data
            </button>
          </div>

          <!-- MODAL BODY -->
          <div id="ksei-modal-content" style="padding:20px;overflow-y:auto;flex:1;background:var(--bg)">
            <!-- Injected by renderKseiModalBody -->
          </div>

        </div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);
  } else {
    existing.style.display = 'flex';
  }

  // Ensure data loaded then render
  if (!KSEI_STATE.data || Object.keys(KSEI_STATE.data).length === 0) {
    kseiInitData().then(function() {
      renderKseiModalBody();
      kseiUpdateMetaBar();
    });
  } else {
    renderKseiModalBody();
    kseiUpdateMetaBar();
  }
}

function closeKseiModal() {
  var el = document.getElementById('ksei-modal-overlay');
  if (el) el.style.display = 'none';
}

function kseiSwitchTab(tabName) {
  KSEI_STATE.activeTab = tabName;
  var btnStock = document.getElementById('ksei-tab-btn-stock');
  var btnScanner = document.getElementById('ksei-tab-btn-scanner');
  var btnSettings = document.getElementById('ksei-tab-btn-settings');

  if (btnStock) btnStock.className = tabName === 'stock-view' ? 'btn btn-xs btn-primary' : 'btn btn-xs btn-ghost';
  if (btnScanner) btnScanner.className = tabName === 'market-scanner' ? 'btn btn-xs btn-primary' : 'btn btn-xs btn-ghost';
  if (btnSettings) btnSettings.className = tabName === 'sync-settings' ? 'btn btn-xs btn-primary' : 'btn btn-xs btn-ghost';

  renderKseiModalBody();
}

function kseiUpdateMetaBar() {
  var metaEl = document.getElementById('ksei-modal-meta-bar');
  if (!metaEl) return;
  var m = KSEI_STATE.metadata || {};
  metaEl.innerHTML = `
    <span>📅 Periode: <b>${m.reportDate || '26 Aug 2026'}</b></span>
    <span>•</span>
    <span>🏛️ Terdaftar: <b>${m.totalEmiten || '840'}</b> Emiten</span>
    <span>•</span>
    <span>👥 Investor >5%: <b>${m.totalMajorInvestors || '1.920'}</b> SID</span>
  `;
}

function kseiUpdateSyncUI() {
  var btn = document.getElementById('btn-ksei-sync');
  if (btn) {
    if (KSEI_STATE.isSyncing) {
      btn.disabled = true;
      btn.innerHTML = '⏳ Memproses...';
    } else {
      btn.disabled = false;
      btn.innerHTML = '📤 Update Data (Upload Excel)';
    }
  }

  var importBtn = document.getElementById('btn-ksei-import-file');
  if (importBtn) importBtn.disabled = !!KSEI_STATE.isSyncing;

  var importRawBtn = document.getElementById('btn-ksei-import-raw');
  if (importRawBtn) {
    importRawBtn.disabled = !!KSEI_STATE.isSyncing;
    importRawBtn.textContent = KSEI_STATE.isSyncing ? '⏳ Memproses...' : 'Gabungkan & Import (RESET TOTAL)';
  }
}

function kseiSelectTicker(ticker) {
  if (!ticker) return;
  KSEI_STATE.selectedTicker = String(ticker).toUpperCase().trim().replace('.JK', '').replace('.US', '');
  if (window.GLOBAL_STOCK_CONTEXT && window.GLOBAL_STOCK_CONTEXT.getTicker() !== KSEI_STATE.selectedTicker) {
    window.GLOBAL_STOCK_CONTEXT.setTicker(KSEI_STATE.selectedTicker, 'ksei');
  }
  KSEI_STATE.activeTab = 'stock-view';
  kseiSwitchTab('stock-view');
}

/**
 * Render the inner contents of the KSEI Modal based on active tab
 */
function renderKseiModalBody() {
  var body = document.getElementById('ksei-modal-content');
  if (!body) return;

  if (KSEI_STATE.activeTab === 'market-scanner') {
    renderKseiScannerView(body);
  } else if (KSEI_STATE.activeTab === 'sync-settings') {
    renderKseiSettingsView(body);
  } else {
    renderKseiStockView(body, KSEI_STATE.selectedTicker);
  }
}

// ══════════════════════════════════════════════════════════════
// 3. TAB 1: EMITEN SHAREHOLDER & FREE FLOAT ANALYSIS VIEW
// ══════════════════════════════════════════════════════════════

function renderKseiStockView(container, ticker, embedded) {
  var stock = getKseiStock(ticker);
  var allTickers = Object.keys(KSEI_STATE.data || {}).sort();

  var optionsHtml = allTickers.map(function(tk) {
    var item = KSEI_STATE.data[tk];
    return `<option value="${tk}" ${tk === ticker ? 'selected' : ''}>${tk} — ${item.name || tk} (FF: ${item.freeFloat}%)</option>`;
  }).join('');

  // Determine Free Float rating & badge
  var ff = stock.freeFloat || 0;
  var ffBadgeClass = 'b-up';
  var ffRatingText = 'LIKUIDITAS TINGGI / FREE FLOAT LUAS';
  var ffDesc = 'Porsi kepemilikan saham di publik/masyarakat luas (>40%), likuiditas perdagangan harian umumnya sangat tinggi dan risiko intervensi pengendali tunggal terdistribusi.';

  if (ff < 15) {
    ffBadgeClass = 'b-dn';
    ffRatingText = 'SANGAT KETAT / FREE FLOAT KECIL (<15%)';
    ffDesc = 'Saham sangat terkonsentrasi pada pemegang saham utama/pengendali. Likuiditas beredar di pasar reguler terbatas dan rentan terhadap pergerakan harga tajam (volatilitas tinggi).';
  } else if (ff < 30) {
    ffBadgeClass = 'b-amb';
    ffRatingText = 'MODERAT TERKONSENTRASI (15%–30%)';
    ffDesc = 'Mayoritas saham (>70%) dipegang oleh pemegang saham pengendali & institusi besar, memenuhi batas minimum free float regulasi IDX (7.5%).';
  }

  // Net Whales Accumulation / Distribution Status
  var netChange = stock.netChangeShares || 0;
  var changeBadge = '<span class="badge b-neu">Netral (0)</span>';
  if (netChange > 0) {
    changeBadge = `<span class="badge b-up">▲ Akumulasi Whale (+${Number(netChange).toLocaleString('id-ID')} lbr)</span>`;
  } else if (netChange < 0) {
    changeBadge = `<span class="badge b-dn">▼ Distribusi Whale (${Number(netChange).toLocaleString('id-ID')} lbr)</span>`;
  }

  // Render Table Rows for Major Shareholders (>5%)
  var holdersRowsHtml = '';
  if (stock.investors && stock.investors.length > 0) {
    holdersRowsHtml = stock.investors.map(function(inv, idx) {
      var isForeign = inv.status === 'Asing';
      var statusBadge = isForeign 
        ? '<span class="badge" style="background:rgba(139,92,246,0.15);color:#A78BFA;border:1px solid rgba(139,92,246,0.3)">Asing (' + (inv.domicile || 'Foreign') + ')</span>'
        : '<span class="badge" style="background:rgba(59,130,246,0.15);color:#60A5FA;border:1px solid rgba(59,130,246,0.3)">Lokal (Indonesia)</span>';

      var changeText = '<span style="color:var(--text3)">0</span>';
      if (inv.change > 0) {
        changeText = `<span style="color:#10B981;font-weight:700">+${Number(inv.change).toLocaleString('id-ID')}</span>`;
      } else if (inv.change < 0) {
        changeText = `<span style="color:#EF4444;font-weight:700">${Number(inv.change).toLocaleString('id-ID')}</span>`;
      }

      // Sub-accounts breakdown
      var subAccountsHtml = '';
      if (inv.accounts && inv.accounts.length > 0) {
        subAccountsHtml = `
          <div style="margin-top:6px;padding-top:6px;border-top:1px dashed var(--border2);font-size:11px">
            <span style="color:var(--text3);font-weight:600">Rincian Kustodian &amp; Sub-Akun Efek (${inv.accounts.length} Akun):</span>
            <div style="display:flex;flex-direction:column;gap:3px;margin-top:4px">
              ${inv.accounts.map(function(acc) {
                return `
                  <div style="display:flex;justify-content:space-between;padding:2px 6px;background:var(--bg3);border-radius:4px">
                    <span style="color:var(--text2)">🏦 ${acc.custodian || 'Kustodian'} <span style="color:var(--text3)">(${acc.accountName || 'A/C'})</span></span>
                    <span style="font-family:var(--font-mono);font-weight:600;color:var(--text)">${Number(acc.shares).toLocaleString('id-ID')} lbr</span>
                  </div>
                `;
              }).join('')}
            </div>
          </div>
        `;
      }

      return `
        <tr style="border-bottom:1px solid var(--border)">
          <td style="padding:10px 12px;font-weight:700;color:var(--text);vertical-align:top">
            <div style="font-size:13px;display:flex;align-items:center;gap:6px">
              <span style="color:var(--accent);font-size:11px">#${idx + 1}</span>
              ${inv.name}
            </div>
            ${subAccountsHtml}
          </td>
          <td style="padding:10px 12px;text-align:right;vertical-align:top">
            <div style="font-size:14px;font-weight:800;font-family:var(--font-mono);color:var(--accent)">
              ${Number(inv.percentage).toFixed(2)}%
            </div>
          </td>
          <td style="padding:10px 12px;text-align:right;vertical-align:top;font-family:var(--font-mono);color:var(--text)">
            ${Number(inv.shares).toLocaleString('id-ID')}
          </td>
          <td style="padding:10px 12px;text-align:center;vertical-align:top">
            ${statusBadge}
          </td>
          <td style="padding:10px 12px;text-align:right;vertical-align:top;font-family:var(--font-mono)">
            ${changeText}
          </td>
        </tr>
      `;
    }).join('');
  } else {
    holdersRowsHtml = `
      <tr>
        <td colspan="5" style="padding:24px;text-align:center;color:var(--text3)">
          ℹ️ Tidak ada pemegang saham dengan kepemilikan di atas 5% yang tercatat secara tunggal di KSEI. Seluruh saham beredar tersebar di bawah 5% (Free Float 100%).
        </td>
      </tr>
    `;
  }

  // Quick Tickers Buttons
  var quickTicks = ['BBCA', 'BBRI', 'BMRI', 'BBNI', 'TLKM', 'ASII', 'ADRO', 'AMMN', 'AADI', 'BREN', 'GOTO', 'ABMM', 'CUAN', 'WIFI'];
  var quickButtonsHtml = quickTicks.map(function(qt) {
    var isSel = qt === ticker;
    return `<button class="btn btn-xs ${isSel ? 'btn-primary' : 'btn-ghost'}" onclick="kseiSelectTicker('${qt}')" style="font-size:10px;padding:3px 8px">${qt}</button>`;
  }).join(' ');

  // When embedded inside another page that already has its own ticker
  // picker (e.g. the Fundamental Suite's top "KODE SAHAM" input, which
  // already re-renders this widget on every fundFetchData() call — see
  // fundFetchData()/fundSwitchTab() in 24-stockmaster.js), showing this
  // view's own dropdown + search box + quick-ticker row again is a pure
  // duplicate control for the exact same action. Standalone contexts
  // (the dedicated KSEI Explorer modal) keep the full toolbar since
  // there is no other ticker selector on screen there.
  var toolbarHtml = embedded ? `
    <div style="font-size:11px;color:var(--text3);margin-bottom:12px;display:flex;align-items:center;gap:6px">
      <i class="ti ti-link"></i> Ticker mengikuti pilihan "Kode Saham" di atas — gunakan kolom itu untuk mengganti emiten.
    </div>
  ` : `
    <!-- TOP TOOLBAR TICKER SELECT -->
    <div style="background:var(--bg2);border:1px solid var(--border);border-radius:10px;padding:12px 16px;margin-bottom:16px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px">
      <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;flex:1">
        <div style="min-width:280px">
          <label style="font-size:10px;font-weight:700;color:var(--text3);display:block;margin-bottom:4px">PILIH EMITEN DARI 840+ SAHAM KSEI:</label>
          <select class="finput fsel" style="width:100%;font-size:13px;padding:6px 10px;background:var(--bg3);border:1px solid var(--border2);border-radius:6px;color:var(--text)" onchange="kseiSelectTicker(this.value)">
            ${optionsHtml}
          </select>
        </div>
        <div>
          <label style="font-size:10px;font-weight:700;color:var(--text3);display:block;margin-bottom:4px">CARI KODE / NAMA SAHAM:</label>
          <div style="display:flex;gap:4px">
            <input type="text" id="ksei-search-direct" list="idx-all-tickers-datalist" class="finput" placeholder="Contoh: ADRO, AMMN..." value="${ticker}" style="width:140px;font-size:12px;text-transform:uppercase" onkeydown="if(event.key==='Enter')kseiSelectTicker(this.value)">
            <button class="btn btn-blue btn-sm" onclick="kseiSelectTicker(document.getElementById('ksei-search-direct').value)" style="padding:0 12px">Cari</button>
          </div>
        </div>
      </div>
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:5px">
        <span style="font-size:10px;color:var(--text3);font-weight:600">Pilihan Cepat Saham:</span>
        <div style="display:flex;gap:4px;flex-wrap:wrap;justify-content:flex-end">
          ${quickButtonsHtml}
        </div>
      </div>
    </div>
  `;

  container.innerHTML = `
    ${toolbarHtml}
    <!-- MAIN EMITEN OVERVIEW CARD -->
    <div style="background:var(--bg2);border:1px solid var(--border);border-radius:10px;padding:18px 20px;margin-bottom:18px">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:14px;margin-bottom:16px">
        <div>
          <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
            <h2 style="font-size:26px;font-weight:800;color:var(--accent);margin:0;letter-spacing:-0.5px">${stock.ticker}</h2>
            <span style="font-size:16px;font-weight:700;color:var(--text)">${stock.name}</span>
            <span class="badge ${ffBadgeClass}" style="font-size:11px">${ffRatingText}</span>
          </div>
          <p style="font-size:12px;color:var(--text2);margin:6px 0 0 0;line-height:1.6;max-width:750px">
            ${ffDesc}
          </p>
        </div>

        <div style="text-align:right;background:var(--bg3);border:1px solid var(--border2);border-radius:8px;padding:10px 16px">
          <div style="font-size:10px;font-weight:700;color:${stock.freeFloatIsEstimated ? '#f59e0b' : 'var(--text3)'};text-transform:uppercase;letter-spacing:0.5px">${stock.freeFloatIsEstimated ? 'ESTIMASI FREE FLOAT (BUKAN ANGKA RESMI)' : 'FREE FLOAT RESMI IDX'}</div>
          <div style="font-size:28px;font-weight:800;font-family:var(--font-mono);color:#10B981;line-height:1.1;margin-top:2px">
            ${Number(stock.freeFloat).toFixed(2)}%
          </div>
          <div style="font-size:11px;color:var(--text3);margin-top:2px">${stock.freeFloatIsEstimated ? '100% − kepemilikan mayoritas (tidak ada data FF resmi untuk emiten ini)' : 'Masyarakat / Saham Beredar &lt;5%'}</div>
        </div>
      </div>

      <!-- KEY METRICS 4-COLUMN -->
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:12px;margin-bottom:16px">
        <div style="background:var(--bg3);border:1px solid var(--border);border-radius:8px;padding:12px">
          <div style="font-size:11px;color:var(--text3);font-weight:600">Pemegang Saham Mayoritas (&gt;5%)</div>
          <div style="font-size:18px;font-weight:800;color:var(--text);font-family:var(--font-mono);margin-top:4px">
            ${Number(stock.totalMajorPercent).toFixed(2)}%
          </div>
          <div style="font-size:10px;color:var(--text3);margin-top:2px">${stock.investors.length} Investor / Entitas Terdaftar</div>
        </div>

        <div style="background:var(--bg3);border:1px solid var(--border);border-radius:8px;padding:12px">
          <div style="font-size:11px;color:var(--text3);font-weight:600">Porsi Domisili Lokal (&gt;5%)</div>
          <div style="font-size:18px;font-weight:800;color:#3B82F6;font-family:var(--font-mono);margin-top:4px">
            ${Number(stock.localPercent).toFixed(2)}%
          </div>
          <div style="font-size:10px;color:var(--text3);margin-top:2px">Entitas &amp; Investor Domestik</div>
        </div>

        <div style="background:var(--bg3);border:1px solid var(--border);border-radius:8px;padding:12px">
          <div style="font-size:11px;color:var(--text3);font-weight:600">Porsi Domisili Asing (&gt;5%)</div>
          <div style="font-size:18px;font-weight:800;color:#8B5CF6;font-family:var(--font-mono);margin-top:4px">
            ${Number(stock.foreignPercent).toFixed(2)}%
          </div>
          <div style="font-size:10px;color:var(--text3);margin-top:2px">Entitas &amp; Fund Luar Negeri</div>
        </div>

        <div style="background:var(--bg3);border:1px solid var(--border);border-radius:8px;padding:12px">
          <div style="font-size:11px;color:var(--text3);font-weight:600">Status Pergerakan Whales</div>
          <div style="margin-top:6px">
            ${changeBadge}
          </div>
          <div style="font-size:10px;color:var(--text3);margin-top:4px">Dibandingkan periode sebelumnya</div>
        </div>
      </div>

      <!-- VISUAL STACKED SHAREHOLDER COMPOSITION BAR -->
      <div style="background:var(--bg);border:1px solid var(--border2);border-radius:8px;padding:12px 14px">
        <div style="display:flex;justify-content:space-between;align-items:center;font-size:11px;font-weight:700;color:var(--text);margin-bottom:8px">
          <span>KOMPOSISI KEPEMILIKAN SAHAM TERKINI (KSEI SID)</span>
          <span style="color:var(--text3)">Total Saham: 100%</span>
        </div>
        
        <!-- Multi-segment visual bar -->
        <div style="display:flex;height:24px;border-radius:6px;overflow:hidden;background:var(--bg3);box-shadow:inset 0 1px 3px rgba(0,0,0,0.4)">
          ${stock.localPercent > 0 ? `
            <div style="width:${stock.localPercent}%;background:linear-gradient(90deg,#2563EB,#3B82F6);display:flex;align-items:center;justify-content:center;color:#fff;font-size:10px;font-weight:800;font-family:var(--font-mono);overflow:hidden;white-space:nowrap;padding:0 4px" title="Lokal >5%: ${stock.localPercent}%">
              ${stock.localPercent >= 10 ? 'Lokal ' + stock.localPercent + '%' : ''}
            </div>
          ` : ''}

          ${stock.foreignPercent > 0 ? `
            <div style="width:${stock.foreignPercent}%;background:linear-gradient(90deg,#7C3AED,#8B5CF6);display:flex;align-items:center;justify-content:center;color:#fff;font-size:10px;font-weight:800;font-family:var(--font-mono);overflow:hidden;white-space:nowrap;padding:0 4px" title="Asing >5%: ${stock.foreignPercent}%">
              ${stock.foreignPercent >= 10 ? 'Asing ' + stock.foreignPercent + '%' : ''}
            </div>
          ` : ''}

          ${stock.freeFloat > 0 ? `
            <div style="width:${stock.freeFloat}%;background:linear-gradient(90deg,#059669,#10B981);display:flex;align-items:center;justify-content:center;color:#fff;font-size:10px;font-weight:800;font-family:var(--font-mono);overflow:hidden;white-space:nowrap;padding:0 4px" title="Free Float Publik: ${stock.freeFloat}%">
              ${stock.freeFloat >= 10 ? 'Free Float ' + stock.freeFloat + '%' : ''}
            </div>
          ` : ''}
        </div>

        <!-- Legend -->
        <div style="display:flex;gap:16px;margin-top:10px;font-size:11px;flex-wrap:wrap">
          <div style="display:flex;align-items:center;gap:6px">
            <span style="width:10px;height:10px;border-radius:2px;background:#3B82F6;display:inline-block"></span>
            <span style="color:var(--text2)">Investor Lokal &gt;5%: <b>${stock.localPercent}%</b></span>
          </div>
          <div style="display:flex;align-items:center;gap:6px">
            <span style="width:10px;height:10px;border-radius:2px;background:#8B5CF6;display:inline-block"></span>
            <span style="color:var(--text2)">Investor Asing &gt;5%: <b>${stock.foreignPercent}%</b></span>
          </div>
          <div style="display:flex;align-items:center;gap:6px">
            <span style="width:10px;height:10px;border-radius:2px;background:#10B981;display:inline-block"></span>
            <span style="color:var(--text2)">Free Float Publik / Masyarakat (&lt;5%): <b>${stock.freeFloat}%</b></span>
          </div>
        </div>
      </div>
    </div>

    <!-- SHAREHOLDERS TABLE -->
    <div style="background:var(--bg2);border:1px solid var(--border);border-radius:10px;overflow:hidden">
      <div style="padding:14px 18px;background:var(--bg3);border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
        <div style="font-size:13px;font-weight:700;color:var(--text)">
          📋 Daftar Pemegang Saham di Atas 5% Berdasarkan SID KSEI
        </div>
        <div style="font-size:11px;color:var(--text3)">
          Tanggal Laporan: <b>${stock.reportDate || '26 Aug 2026'}</b>
        </div>
      </div>

      <div style="overflow-x:auto">
        <table style="width:100%;border-collapse:collapse;font-size:12px;text-align:left">
          <thead>
            <tr style="background:var(--bg3);border-bottom:1px solid var(--border2);color:var(--text3);font-size:10px;text-transform:uppercase;letter-spacing:.5px">
              <th style="padding:10px 12px">Nama Pemegang Saham &amp; Sub-Akun Kustodian</th>
              <th style="padding:10px 12px;text-align:right">Porsi (%)</th>
              <th style="padding:10px 12px;text-align:right">Jumlah Lembar Saham</th>
              <th style="padding:10px 12px;text-align:center">Status / Domisili</th>
              <th style="padding:10px 12px;text-align:right">Perubahan Lembar</th>
            </tr>
          </thead>
          <tbody>
            ${holdersRowsHtml}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

// ══════════════════════════════════════════════════════════════
// 4. TAB 2: MARKET-WIDE FREE FLOAT SCANNER
// ══════════════════════════════════════════════════════════════

function renderKseiScannerView(container) {
  var list = Object.values(KSEI_STATE.data || {});
  var filter = KSEI_STATE.scannerFilter || 'all';
  var search = (KSEI_STATE.scannerSearch || '').toLowerCase().trim();

  // Apply filters
  if (filter === 'low-ff') {
    list = list.filter(function(x) { return x.freeFloat < 20 && x.investors.length > 0; });
  } else if (filter === 'high-ff') {
    list = list.filter(function(x) { return x.freeFloat > 50; });
  } else if (filter === 'foreign') {
    list = list.filter(function(x) { return x.foreignPercent > 30; });
  } else if (filter === 'accumulating') {
    list = list.filter(function(x) { return x.netChangeShares > 0; });
  } else if (filter === 'distributing') {
    list = list.filter(function(x) { return x.netChangeShares < 0; });
  }

  // Apply search query
  if (search) {
    list = list.filter(function(x) {
      if (x.ticker.toLowerCase().includes(search) || (x.name && x.name.toLowerCase().includes(search))) return true;
      return x.investors.some(function(inv) { return inv.name.toLowerCase().includes(search); });
    });
  }

  // Sort by Free Float ascending by default for low-ff, or alphabetical
  if (filter === 'low-ff') {
    list.sort(function(a, b) { return a.freeFloat - b.freeFloat; });
  } else if (filter === 'high-ff') {
    list.sort(function(a, b) { return b.freeFloat - a.freeFloat; });
  } else if (filter === 'accumulating') {
    list.sort(function(a, b) { return b.netChangeShares - a.netChangeShares; });
  } else {
    list.sort(function(a, b) { return a.ticker.localeCompare(b.ticker); });
  }

  var rowsHtml = list.slice(0, 100).map(function(item) {
    var ff = item.freeFloat || 0;
    var ffColor = '#10B981';
    if (ff < 15) ffColor = '#EF4444';
    else if (ff < 30) ffColor = '#F59E0B';

    var chgText = '<span style="color:var(--text3)">-</span>';
    if (item.netChangeShares > 0) {
      chgText = `<span style="color:#10B981;font-weight:700">+${Number(item.netChangeShares).toLocaleString('id-ID')}</span>`;
    } else if (item.netChangeShares < 0) {
      chgText = `<span style="color:#EF4444;font-weight:700">${Number(item.netChangeShares).toLocaleString('id-ID')}</span>`;
    }

    var topHolderName = item.investors && item.investors.length > 0 ? item.investors[0].name : 'Publik / Tersebar';

    return `
      <tr style="border-bottom:1px solid var(--border);cursor:pointer;transition:background .15s" onclick="kseiSelectTicker('${item.ticker}')" class="mw-hover-row">
        <td style="padding:10px 12px;font-weight:800;color:var(--accent)">
          ${item.ticker}
        </td>
        <td style="padding:10px 12px;color:var(--text)">
          <div style="font-weight:600">${item.name || item.ticker}</div>
          <div style="font-size:10px;color:var(--text3)">Top: ${topHolderName}</div>
        </td>
        <td style="padding:10px 12px;text-align:right">
          <span style="font-size:14px;font-weight:800;font-family:var(--font-mono);color:${ffColor}">
            ${Number(item.freeFloat).toFixed(2)}%
          </span>
        </td>
        <td style="padding:10px 12px;text-align:right;font-family:var(--font-mono);color:var(--text)">
          ${Number(item.totalMajorPercent).toFixed(2)}%
        </td>
        <td style="padding:10px 12px;text-align:right;font-family:var(--font-mono);color:#3B82F6">
          ${Number(item.localPercent).toFixed(2)}%
        </td>
        <td style="padding:10px 12px;text-align:right;font-family:var(--font-mono);color:#8B5CF6">
          ${Number(item.foreignPercent).toFixed(2)}%
        </td>
        <td style="padding:10px 12px;text-align:right;font-family:var(--font-mono)">
          ${chgText}
        </td>
        <td style="padding:10px 12px;text-align:center">
          <button class="btn btn-xs btn-blue" onclick="event.stopPropagation();kseiSelectTicker('${item.ticker}')" style="font-size:10px;padding:2px 8px">
            Detail →
          </button>
        </td>
      </tr>
    `;
  }).join('');

  container.innerHTML = `
    <!-- FILTER BAR -->
    <div style="background:var(--bg2);border:1px solid var(--border);border-radius:10px;padding:14px 16px;margin-bottom:16px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px">
      <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
        <span style="font-size:11px;font-weight:700;color:var(--text3);margin-right:4px">FILTER PRESET:</span>
        <button class="btn btn-xs ${filter === 'all' ? 'btn-primary' : 'btn-ghost'}" onclick="kseiSetScannerFilter('all')" style="font-size:11px;padding:4px 10px">Semua (${Object.keys(KSEI_STATE.data || {}).length})</button>
        <button class="btn btn-xs ${filter === 'low-ff' ? 'btn-primary' : 'btn-ghost'}" onclick="kseiSetScannerFilter('low-ff')" style="font-size:11px;padding:4px 10px">⚠️ Free Float Rendah (&lt;20%)</button>
        <button class="btn btn-xs ${filter === 'high-ff' ? 'btn-primary' : 'btn-ghost'}" onclick="kseiSetScannerFilter('high-ff')" style="font-size:11px;padding:4px 10px">🌊 Free Float Tinggi (&gt;50%)</button>
        <button class="btn btn-xs ${filter === 'foreign' ? 'btn-primary' : 'btn-ghost'}" onclick="kseiSetScannerFilter('foreign')" style="font-size:11px;padding:4px 10px">🌐 Dominasi Asing (&gt;30%)</button>
        <button class="btn btn-xs ${filter === 'accumulating' ? 'btn-primary' : 'btn-ghost'}" onclick="kseiSetScannerFilter('accumulating')" style="font-size:11px;padding:4px 10px">▲ Akumulasi Whales</button>
      </div>

      <div style="display:flex;align-items:center;gap:6px">
        <input type="text" id="ksei-scanner-search" class="finput" placeholder="Cari kode/nama/investor..." value="${KSEI_STATE.scannerSearch || ''}" style="width:200px;font-size:12px" oninput="kseiOnScannerSearch(this.value)">
      </div>
    </div>

    <!-- TABLE RESULT -->
    <div style="background:var(--bg2);border:1px solid var(--border);border-radius:10px;overflow:hidden">
      <div style="padding:10px 16px;background:var(--bg3);border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;font-size:11px;color:var(--text3)">
        <span>Menampilkan <b>${Math.min(list.length, 100)}</b> dari <b>${list.length}</b> emiten sesuai filter</span>
        <span>Klik baris saham untuk membuka analisis kepemilikan lengkap</span>
      </div>

      <div style="overflow-x:auto;max-height:520px">
        <table style="width:100%;border-collapse:collapse;font-size:12px;text-align:left">
          <thead style="position:sticky;top:0;background:var(--bg);z-index:2">
            <tr style="border-bottom:1px solid var(--border2);color:var(--text3);font-size:10px;text-transform:uppercase;letter-spacing:.5px">
              <th style="padding:10px 12px">Kode</th>
              <th style="padding:10px 12px">Nama Emiten</th>
              <th style="padding:10px 12px;text-align:right">Free Float (%)</th>
              <th style="padding:10px 12px;text-align:right">Pengendali (&gt;5%)</th>
              <th style="padding:10px 12px;text-align:right">Lokal (%)</th>
              <th style="padding:10px 12px;text-align:right">Asing (%)</th>
              <th style="padding:10px 12px;text-align:right">Net Change Lembar</th>
              <th style="padding:10px 12px;text-align:center">Aksi</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml || '<tr><td colspan="8" style="padding:24px;text-align:center;color:var(--text3)">Tidak ditemukan emiten yang sesuai pencarian.</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function kseiSetScannerFilter(f) {
  KSEI_STATE.scannerFilter = f;
  renderKseiScannerView(document.getElementById('ksei-modal-content'));
}

function kseiOnScannerSearch(val) {
  KSEI_STATE.scannerSearch = val;
  renderKseiScannerView(document.getElementById('ksei-modal-content'));
}

// ══════════════════════════════════════════════════════════════
// 5. TAB 3: EXCEL UPLOAD & SUMBER DATA
// ══════════════════════════════════════════════════════════════

function renderKseiSettingsView(container) {
  var m = KSEI_STATE.metadata || {};
  var lastUpdatedStr = m.lastUpdated ? new Date(m.lastUpdated).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }) : '-';
  var isUploaded = m.source === 'upload';

  container.innerHTML = `
    <div style="max-width:760px;margin:0 auto;background:var(--bg2);border:1px solid var(--border);border-radius:10px;padding:24px">
      <div style="font-size:16px;font-weight:800;color:var(--text);margin-bottom:8px;display:flex;align-items:center;gap:8px">
        <span>📤 Upload Excel &amp; Manajemen Data KSEI</span>
        <span class="badge ${isUploaded ? 'b-up' : 'b-neu'}" style="font-size:10px">${isUploaded ? 'DATA HASIL UPLOAD ANDA' : 'DATA BAWAAN (BELUM ADA UPLOAD)'}</span>
      </div>
      <p style="font-size:12px;color:var(--text2);line-height:1.7;margin-bottom:20px">
        Data <b>Shareholder &gt;5% &amp; Free Float Publik</b> tersimpan permanen di <b>Supabase</b> (tabel <code>ksei_ownership</code>, terpisah dari data portofolio Anda), begitu Anda upload minimal sekali — sehingga kalau file sumber di komputer Anda hilang, data yang SUDAH ter-upload tetap aman. Aplikasi tidak menarik data otomatis dari mana pun; Anda yang mengunggah file Excel kapan pun ada laporan KSEI terbaru yang sudah Anda bersihkan.
      </p>

      <!-- STATUS CARD -->
      <div style="background:var(--bg);border:1px solid var(--border2);border-radius:8px;padding:14px 16px;margin-bottom:18px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px">
        <div>
          <div style="font-size:11px;font-weight:700;color:var(--text3);display:flex;align-items:center;gap:6px">
            <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${isUploaded ? '#10B981' : '#f59e0b'};box-shadow:0 0 6px ${isUploaded ? '#10B981' : '#f59e0b'}"></span>
            SUMBER DATA SAAT INI:
          </div>
          <div style="font-size:12px;font-weight:800;color:var(--text);margin-top:2px">
            ${isUploaded ? escHtml(m.uploadedFileName || 'File hasil upload') : 'Snapshot bawaan (belum pernah upload)'}
          </div>
        </div>
        <div style="text-align:right">
          <div style="font-size:10px;color:var(--text3);font-weight:700">TERAKHIR DIPERBARUI:</div>
          <div style="font-size:12px;font-weight:800;color:var(--accent);font-family:var(--font-mono);margin-top:2px">${lastUpdatedStr}</div>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:12px;margin-bottom:20px">
        <div style="background:var(--bg);border:1px solid var(--border2);border-radius:8px;padding:12px">
          <div style="font-size:10px;color:var(--text3);font-weight:700">TANGGAL LAPORAN KSEI:</div>
          <div style="font-size:14px;font-weight:800;color:var(--accent);margin-top:4px">${m.reportDate || '-'}</div>
        </div>
        <div style="background:var(--bg);border:1px solid var(--border2);border-radius:8px;padding:12px">
          <div style="font-size:10px;color:var(--text3);font-weight:700">JUMLAH SAHAM TERCATAT:</div>
          <div style="font-size:14px;font-weight:800;color:#10B981;margin-top:4px">${m.totalEmiten || 0} Emiten IDX</div>
        </div>
      </div>

      <div style="background:rgba(16,185,129,0.08);border:1px solid rgba(16,185,129,0.3);border-radius:8px;padding:16px;margin-bottom:14px">
        <div style="font-size:11px;font-weight:700;color:#10B981;margin-bottom:4px">⭐ CARA UTAMA — UPLOAD 2 FILE MENTAH IDX (TANPA OLAH MANUAL)</div>
        <div style="font-size:10.5px;color:var(--text2);margin-bottom:10px;line-height:1.6">
          Download langsung dari IDX apa adanya — <b>tidak perlu digabung/dibersihkan dulu</b>. App menggabungkan &amp; menghitung otomatis (tervalidasi 1.044/1.046 baris cocok sempurna terhadap perhitungan manual).
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">
          <div>
            <label class="flabel" style="font-size:10px">1. File Kepemilikan &gt;5% (raw KSEI)</label>
            <input class="finput" type="file" id="ksei-import-ownership-file" accept=".xlsx,.xls" style="width:100%">
          </div>
          <div>
            <label class="flabel" style="font-size:10px">2. File Free Float (raw IDX)</label>
            <input class="finput" type="file" id="ksei-import-ff-file" accept=".xlsx,.xls" style="width:100%">
          </div>
        </div>
        <button id="btn-ksei-import-raw" class="btn btn-green btn-sm" style="background:#059669;color:#fff;border-color:#047857;font-weight:700;width:100%;justify-content:center" onclick="kseiImportRawFiles('ksei-import-ownership-file','ksei-import-ff-file')">Gabungkan &amp; Import (RESET TOTAL)</button>
        <div style="font-size:10px;color:var(--text3);margin-top:8px;line-height:1.6">
          Free Float diambil dari angka resmi IDX per emiten (bukan hasil hitungan 100% − kepemilikan mayoritas — dua angka itu BEDA). Emiten yang tidak ditemukan di file Free Float akan ditandai jelas sebagai estimasi, bukan diam-diam disamakan dengan angka resmi.
        </div>
      </div>

      <div style="background:var(--bg3);border:1px solid var(--border2);border-radius:8px;padding:16px">
        <div style="font-size:11px;font-weight:700;color:var(--text3);margin-bottom:8px">ALTERNATIF — UPLOAD 1 FILE TEMPLATE (kalau sudah terlanjur digabung manual)</div>
        <div style="font-size:10px;color:var(--text3);margin-bottom:8px">Kolom wajib: Ticker, Nama Emiten, Nama Investor, Status, Persentase (%), Jumlah Saham, Tanggal Laporan. Kolom opsional "Persentase Free Float (%)" — tanpa ini, Free Float diestimasi (100% − mayoritas) dan ditandai jelas sebagai estimasi.</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
          <input class="finput" type="file" id="ksei-import-file" accept=".xlsx,.xls" style="flex:1;min-width:220px">
          <button id="btn-ksei-import-file" class="btn btn-ghost btn-sm" onclick="kseiImportExcelFile('ksei-import-file')">Import &amp; RESET TOTAL</button>
        </div>
        <div style="font-size:10px;color:var(--text3);margin-top:8px;line-height:1.6">
          File yang tidak lolos validasi akan DITOLAK dengan alasan per baris, data yang sudah ada TIDAK akan berubah.
        </div>
      </div>
    </div>
  `;
}

// ══════════════════════════════════════════════════════════════
// 6. INTEGRATION WIDGETS (FUNDAMENTAL SUITE & STOCK INTEL)
// ══════════════════════════════════════════════════════════════

/**
 * Render KSEI Shareholders and Free Float Widget for Fundamental Suite Tab 10
 */
function renderKseiFundamentalWidget(ticker, targetContainerId) {
  var target = document.getElementById(targetContainerId || 'fund-ksei-container');
  if (!target) return;
  // embedded=true: the Fundamental Suite already has its own top-level
  // "KODE SAHAM" ticker input/button, which already re-renders this widget
  // on every change (see fundFetchData()/fundSwitchTab() in
  // 24-stockmaster.js) — so hide this view's own duplicate ticker
  // dropdown/search/quick-buttons toolbar here.
  renderKseiStockView(target, ticker || FUND_DATA.ticker || 'BBCA', true);
}

/**
 * Render compact KSEI Free Float card for Stock Intelligence Cockpit
 */
function renderKseiIntelWidget(ticker) {
  var stock = getKseiStock(ticker);
  var ff = stock.freeFloat || 0;
  var ffColor = '#10B981';
  if (ff < 15) ffColor = '#EF4444';
  else if (ff < 30) ffColor = '#F59E0B';

  var topHolder = stock.investors && stock.investors.length > 0 
    ? (stock.investors[0].name + ' (' + stock.investors[0].percentage.toFixed(1) + '%)') 
    : 'Publik Tersebar (<5%)';

  return `
    <div style="background:var(--bg2);border:1px solid var(--border);border-radius:10px;padding:14px 18px;margin-bottom:16px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
        <div style="display:flex;align-items:center;gap:6px">
          <span style="font-size:16px">🏛️</span>
          <span style="font-size:12px;font-weight:800;color:var(--text);letter-spacing:.3px">STRUKTUR KEPEMILIKAN &amp; FREE FLOAT (KSEI)</span>
          <span class="badge b-up" style="font-size:9px">PER ${stock.reportDate || '26 AUG'}</span>
        </div>
        <button class="btn btn-ghost btn-xs" onclick="openKseiModal('${ticker}')" style="font-size:10px;padding:2px 8px;color:var(--accent);border-color:rgba(0,200,255,0.3)">
          Buka Rincian KSEI →
        </button>
      </div>

      <div style="display:grid;grid-template-columns:140px 1fr 1fr;gap:12px;align-items:center">
        <div style="background:var(--bg3);border:1px solid var(--border2);border-radius:8px;padding:8px 12px;text-align:center">
          <div style="font-size:9px;font-weight:700;color:var(--text3);text-transform:uppercase">FREE FLOAT</div>
          <div style="font-size:20px;font-weight:800;font-family:var(--font-mono);color:${ffColor};line-height:1.2;margin-top:2px">
            ${Number(stock.freeFloat).toFixed(1)}%
          </div>
        </div>

        <div style="font-size:11px">
          <div style="color:var(--text3);font-size:10px">Pengendali Utama (>5%):</div>
          <div style="font-weight:700;color:var(--text);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${topHolder}">
            ${topHolder}
          </div>
          <div style="color:var(--text3);font-size:10px;margin-top:2px">
            Lokal: <b style="color:#3B82F6">${stock.localPercent}%</b> · Asing: <b style="color:#8B5CF6">${stock.foreignPercent}%</b>
          </div>
        </div>

        <div>
          <!-- Visual Stacked Bar -->
          <div style="height:12px;border-radius:4px;overflow:hidden;display:flex;background:var(--bg);box-shadow:inset 0 1px 2px rgba(0,0,0,0.5)">
            ${stock.localPercent > 0 ? `<div style="width:${stock.localPercent}%;background:#3B82F6" title="Lokal: ${stock.localPercent}%"></div>` : ''}
            ${stock.foreignPercent > 0 ? `<div style="width:${stock.foreignPercent}%;background:#8B5CF6" title="Asing: ${stock.foreignPercent}%"></div>` : ''}
            ${stock.freeFloat > 0 ? `<div style="width:${stock.freeFloat}%;background:#10B981" title="Free Float: ${stock.freeFloat}%"></div>` : ''}
          </div>
          <div style="display:flex;justify-content:space-between;font-size:9px;color:var(--text3);margin-top:4px">
            <span>Mayoritas: <b>${stock.totalMajorPercent}%</b></span>
            <span>Publik: <b>${stock.freeFloat}%</b></span>
          </div>
        </div>
      </div>
    </div>
  `;
}

function kseiRefreshActiveViews() {
  var overlay = document.getElementById('ksei-modal-overlay');
  if (overlay && overlay.style.display !== 'none') {
    renderKseiModalBody();
    kseiUpdateMetaBar();
  }

  // Refresh fundamental tab if open
  var fundContainer = document.getElementById('fund-ksei-container');
  if (fundContainer) {
    renderKseiStockView(fundContainer, FUND_DATA.ticker || 'BBCA', true);
  }

  // Refresh intel page if open
  if (typeof renderStockIntelPage === 'function') {
    var pageIntel = document.getElementById('page-stock-intel');
    if (pageIntel && pageIntel.classList.contains('active')) {
      renderStockIntelPage();
    }
  }
}

// Auto-initialize when script is loaded
if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', function() {
    kseiInitData();
  });
}
