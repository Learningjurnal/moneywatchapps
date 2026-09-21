import { fetchInvezgoCalendar } from '../invezgo-client.js';

/**
 * lib/providers/idx-client.js
 * IDX (Bursa Efek Indonesia / idx.co.id) provider adapter — session
 * management, broker summary, stock screener, tick-size rule, broker
 * directory, and the corporate-action calendar. All real HTTP calls
 * against the idx.co.id website (the same endpoints idx.co.id's own
 * pages use), never a fabricated fallback for these.
 *
 * Extracted from lib/idx-data-engine.js during the provider-adapter
 * refactor — this file is the IDX-specific half of that split; Yahoo
 * Finance lives in lib/providers/yahoo-client.js, Invezgo in
 * lib/invezgo-client.js. idx-data-engine.js keeps the cross-provider
 * business logic (signal/confluence/hypothesis engine, backtest,
 * universe scans) and imports these functions back in — no behavior
 * change, byte-identical function bodies.
 */

// ── IDX.co.id session + real Broker Summary fetch ──
// FIX: sebelumnya generateBrokerSummary() 100% template fiktif (lihat di
// bawah, "Seed deterministic broker participation"). Fungsi baru ini port
// dari NeaByteLab/IDX-API (client.trading.getBrokerSummary) — endpoint yang
// sama dipakai website idx.co.id sendiri untuk halaman Ringkasan Broker
// Transaksi publik mereka. Butuh session cookie dulu (ensureIdxSession)
// sebelum endpoint GetBrokerSummary bisa dipanggil.
const IDX_BROWSER_HEADERS = {
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9,id;q=0.8',
  'Referer': 'https://www.idx.co.id/',
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36'
};
let _idxSessionCookie = '';
let _idxSessionPromise = null;

async function ensureIdxSession() {
  if (_idxSessionCookie) return _idxSessionCookie;
  if (_idxSessionPromise) return _idxSessionPromise;
  _idxSessionPromise = (async () => {
    const resp = await fetch('https://www.idx.co.id/id', { headers: IDX_BROWSER_HEADERS });
    const setCookie = (resp && resp.headers && typeof resp.headers.getSetCookie === 'function') ? resp.headers.getSetCookie() : [];
    _idxSessionCookie = setCookie.join('; ');
    await new Promise(r => setTimeout(r, 1000));
    try {
      await fetch('https://www.idx.co.id/primary/home/GetIndexList', {
        headers: { ...IDX_BROWSER_HEADERS, 'X-Requested-With': 'XMLHttpRequest', ...(_idxSessionCookie ? { Cookie: _idxSessionCookie } : {}) }
      });
    } catch (e) { /* validasi sesi gagal — tetap lanjut, GetBrokerSummary akan gagal sendiri kalau memang perlu */ }
    return _idxSessionCookie;
  })();
  try { return await _idxSessionPromise; } finally { _idxSessionPromise = null; }
}

// Fetch broker summary ASLI dari idx.co.id (bukan simulasi). date format: YYYYMMDD.
// Return null kalau gagal (caller WAJIB fallback, jangan crash).
async function fetchIdxBrokerSummaryReal(date, start = 0, length = 9999) {
  try {
    await ensureIdxSession();
    const url = `https://www.idx.co.id/primary/TradingSummary/GetBrokerSummary?length=${length}&start=${start}&date=${date}`;
    const resp = await fetch(url, {
      headers: { ...IDX_BROWSER_HEADERS, 'X-Requested-With': 'XMLHttpRequest', ...(_idxSessionCookie ? { Cookie: _idxSessionCookie } : {}) }
    });
    if (!resp.ok) return null;
    const raw = await resp.json();
    if (!raw || !Array.isArray(raw.data)) return null;
    return raw.data.map(item => ({
      brokerCode: item.IDFirm,
      brokerName: item.FirmName,
      totalValue: item.Value,
      volumeLot: Math.round((item.Volume || 0) / 100),
      frequency: item.Frequency
    }));
  } catch (e) {
    console.warn('[IDX Broker Summary] Fetch riil gagal, akan fallback ke simulasi:', e.message);
    return null;
  }
}

// ── IDX Stock Screener — rasio fundamental REAL untuk seluruh universe ──
// FIX (mengisi gap 15-ticker STOCK_REGISTRY): endpoint resmi idx.co.id ini
// sama persis dipakai fitur "Stock Screener" di website idx.co.id sendiri.
// Satu panggilan mengembalikan PER/PBV/ROE/ROA/DER/NPM untuk SEMUA saham
// (kosongkan sector/subSector untuk ambil semua), bukan cuma 15 ticker.
// Di-cache 24 jam karena rasio fundamental tidak berubah intraday.
let _screenerCache = null;
let _screenerCacheTime = 0;
const SCREENER_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 jam

async function fetchIdxStockScreener(forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && _screenerCache && (now - _screenerCacheTime) < SCREENER_CACHE_TTL_MS) {
    return _screenerCache;
  }
  try {
    await ensureIdxSession();
    const url = 'https://www.idx.co.id/support/stock-screener/api/v1/stock-screener/get?Sector=&SubSector=';
    const resp = await fetch(url, {
      headers: { ...IDX_BROWSER_HEADERS, 'X-Requested-With': 'XMLHttpRequest', ...(_idxSessionCookie ? { Cookie: _idxSessionCookie } : {}) }
    });
    if (!resp.ok) return _screenerCache; // gagal → pakai cache lama kalau ada, jangan crash
    const raw = await resp.json();
    if (!raw || !Array.isArray(raw.results)) return _screenerCache;

    const byTicker = {};
    raw.results.forEach(item => {
      if (!item.stockCode) return;
      // INV-009 (audit): `|| 0` conflates "IDX reported exactly zero" with
      // "IDX didn't report this ratio for this ticker" — a real (if small)
      // fabrication for financial ratios. `?? null` preserves a genuine 0
      // while leaving a missing/null field as null instead of guessing.
      byTicker[item.stockCode] = {
        code: item.stockCode,
        name: item.companyName,
        sector: item.sector,
        subSector: item.subSector,
        marketCapital: item.marketCapital ?? null,
        totalRevenue: item.tRevenue ?? null,
        npm: item.npm ?? null,
        per: item.per ?? null,
        pbv: item.pbv ?? null,
        roa: item.roa ?? null,
        roe: item.roe ?? null,
        der: item.der ?? null
      };
    });
    _screenerCache = byTicker;
    _screenerCacheTime = now;
    console.log(`[IDX Screener] ${Object.keys(byTicker).length} saham berhasil di-cache dengan rasio fundamental real.`);
    return _screenerCache;
  } catch (e) {
    console.warn('[IDX Screener] Fetch gagal, pakai cache lama kalau ada:', e.message);
    return _screenerCache;
  }
}

// Official BEI Tick Price Fractions (Fraksi Harga BEI)
function getBeiTickSize(price) {
  if (price < 200) return 1;
  if (price < 500) return 2;
  if (price < 2000) return 5;
  if (price < 5000) return 10;
  return 25;
}

// Master IDX Broker Directory
const IDX_BROKERS = {
  // Foreign Brokers
  'ZP': { code: 'ZP', name: 'Maybank Sekuritas Indonesia', type: 'F', category: 'Institutional / Foreign' },
  'AK': { code: 'AK', name: 'UBS Sekuritas Indonesia', type: 'F', category: 'Tier-1 Global Institutional' },
  'BK': { code: 'BK', name: 'J.P. Morgan Sekuritas Indonesia', type: 'F', category: 'Tier-1 Global Institutional' },
  'KZ': { code: 'KZ', name: 'CLSA Sekuritas Indonesia', type: 'F', category: 'Institutional / Foreign' },
  'RX': { code: 'RX', name: 'Macquarie Sekuritas Indonesia', type: 'F', category: 'Institutional / Foreign' },
  'CS': { code: 'CS', name: 'Credit Suisse Sekuritas Indonesia', type: 'F', category: 'Tier-1 Global Institutional' },
  'MS': { code: 'MS', name: 'Morgan Stanley Sekuritas Indonesia', type: 'F', category: 'Tier-1 Global Institutional' },
  'CG': { code: 'CG', name: 'Citigroup Sekuritas Indonesia', type: 'F', category: 'Tier-1 Global Institutional' },
  'ML': { code: 'ML', name: 'BofA Securities Indonesia', type: 'F', category: 'Tier-1 Global Institutional' },
  'YU': { code: 'YU', name: 'CGS International Sekuritas', type: 'F', category: 'Regional Foreign' },
  'DB': { code: 'DB', name: 'Deutsche Sekuritas Indonesia', type: 'F', category: 'Institutional / Foreign' },
  'GW': { code: 'GW', name: 'HSBC Sekuritas Indonesia', type: 'F', category: 'Institutional / Foreign' },
  
  // Domestic Institutional / Hybrid Brokers
  'CC': { code: 'CC', name: 'Mandiri Sekuritas', type: 'D', category: 'BUMN Tier-1 / Institutional' },
  'NI': { code: 'NI', name: 'BNI Sekuritas', type: 'D', category: 'BUMN / Institutional' },
  'OD': { code: 'OD', name: 'BRI Danareksa Sekuritas', type: 'D', category: 'BUMN / Institutional' },
  'SQ': { code: 'SQ', name: 'BCA Sekuritas', type: 'D', category: 'Private Bank Tier-1' },
  'YP': { code: 'YP', name: 'Mirae Asset Sekuritas', type: 'D', category: 'Hybrid Retail & Institutional' },
  'PD': { code: 'PD', name: 'Indo Premier Sekuritas (IPOT)', type: 'D', category: 'Top Retail / Domestic' },
  'XC': { code: 'XC', name: 'Ajaib Sekuritas Asia', type: 'D', category: 'Digital Retail' },
  'XL': { code: 'XL', name: 'Stockbit Sekuritas', type: 'D', category: 'Digital Retail' },
  'CP': { code: 'CP', name: 'KB Valbury Sekuritas', type: 'D', category: 'Institutional & Retail' },
  'DR': { code: 'DR', name: 'RHB Sekuritas Indonesia', type: 'D', category: 'Regional Domestic' },
  'GR': { code: 'GR', name: 'Panin Sekuritas', type: 'D', category: 'Institutional / High Net Worth' },
  'IF': { code: 'IF', name: 'Samuel Sekuritas Indonesia', type: 'D', category: 'Institutional Domestic' },
  'TP': { code: 'TP', name: 'OCBC Sekuritas Indonesia', type: 'D', category: 'Bank-backed Domestic' },
  'MG': { code: 'MG', name: 'Semesta Indovest Sekuritas', type: 'D', category: 'Day Trader / Scalper Flow' },
  'EP': { code: 'EP', name: 'MNC Sekuritas', type: 'D', category: 'Retail & Domestic' },
  'AI': { code: 'AI', name: 'UOB Kay Hian Sekuritas', type: 'D', category: 'Regional Domestic' },
  'LG': { code: 'LG', name: 'Trimegah Sekuritas Indonesia', type: 'D', category: 'Institutional Domestic' },
  'AZ': { code: 'AZ', name: 'Sucor Sekuritas', type: 'D', category: 'Retail & Domestic Funds' },
  'KK': { code: 'KK', name: 'Phillip Sekuritas Indonesia', type: 'D', category: 'Retail & Domestic' },
  'HD': { code: 'HD', name: 'KGI Sekuritas Indonesia', type: 'D', category: 'Domestic' },
  'AT': { code: 'AT', name: 'Phintraco Sekuritas', type: 'D', category: 'Retail Domestic' },
  'FS': { code: 'FS', name: 'Shinhan Sekuritas Indonesia', type: 'D', category: 'Domestic / Regional' },
  'KI': { code: 'KI', name: 'Ciptadana Sekuritas Asia', type: 'D', category: 'Institutional Domestic' },
  'LS': { code: 'LS', name: 'Reliance Sekuritas Indonesia', type: 'D', category: 'Domestic' }
};

// FIX (2026-09-18, user-reported after full-codebase audit): fungsi ini
// SEBELUMNYA 100% array hardcoded fiksi (dividen/split/rights issue/RUPS/
// suspensi dengan tanggal & angka karangan) dengan komentar yang secara
// keliru mengklaim "Hanya data dividen resmi yang terverifikasi (Historis
// KSEI/BEI) — tanpa data dummy" — klaim itu tidak benar, dan datanya tidak
// pernah diberi label isSimulated sehingga tidak ada bagian UI yang tahu
// ini palsu. Diganti total dengan panggilan REAL ke Invezgo
// GET /analysis/calendar (fetchInvezgoCalendar(), lib/invezgo-client.js) —
// 4 tipe yang confirmed dari skema resmi vendor: DIVIDEND, SPLIT, RIGHT,
// RUPS_SCHEDULE. TIDAK ADA tipe "suspensi/UMA" di enum resmi Invezgo untuk
// endpoint ini — kategori suspensions karena itu SELALU kosong sekarang
// (jujur, bukan diam-diam dihapus) sampai ditemukan sumber data lain.
//
// PENTING: struktur `payload` per-item BEDA-BEDA tergantung `type`, dan
// dokumentasi resmi Invezgo cuma memberi contoh untuk tipe WARRANT (bukan
// salah satu dari 4 tipe di atas) — jadi field di dalam payload (mis. DPS/
// tanggal cum-date/rasio split/harga exercise) TIDAK diverifikasi dan
// SENGAJA TIDAK dipetakan ke nama field tebakan. `payload` diteruskan
// mentah apa adanya — konsumen (UI) harus menampilkannya generik (key-value
// list) sampai ada contoh respons real per tipe untuk memverifikasi skema.
async function getIdxCalendarData(filters = {}) {
  const { search, type, code } = filters;
  const apiKey = process.env.INVEZGO_API_KEY;

  if (!apiKey) {
    return {
      isSimulated: true,
      dataSource: 'Tidak tersedia (Invezgo API key belum dikonfigurasi)',
      reportDate: new Date().toISOString().slice(0, 10),
      counts: { dividends: 0, stockSplits: 0, rightsIssues: 0, rups: 0, suspensions: 0, total: 0 },
      dividends: [], stockSplits: [], rightsIssues: [], rups: [], suspensions: [],
      message: 'Kalender aksi korporasi membutuhkan Invezgo API key yang belum dikonfigurasi di aplikasi ini.',
      updatedAt: new Date().toISOString()
    };
  }

  const CALENDAR_TYPE_MAP = { dividends: 'DIVIDEND', stockSplits: 'SPLIT', rightsIssues: 'RIGHT', rups: 'RUPS_SCHEDULE' };
  // `type` filter menerima BAIK enum resmi Invezgo (DIVIDEND/SPLIT/RIGHT/
  // RUPS_SCHEDULE) MAUPUN alias lama yang sudah dipakai UI sejak sebelum
  // fix ini (DIVIDEN/RIGHTS/RUPS/SUSPENSI/ALL) — supaya caller lama tidak
  // perlu diubah semua sekaligus. 'suspensions'/'SUSPENSI' sengaja tidak
  // ada padanan Invezgo (lihat catatan di atas fungsi ini), jadi filter
  // itu akan selalu menghasilkan array kosong, bukan error.
  const CALENDAR_TYPE_ALIASES = { DIVIDEN: 'DIVIDEND', DIVIDEND: 'DIVIDEND', SPLIT: 'SPLIT', RIGHTS: 'RIGHT', RIGHT: 'RIGHT', RUPS: 'RUPS_SCHEDULE', RUPS_SCHEDULE: 'RUPS_SCHEDULE' };
  const normalizedType = type ? (CALENDAR_TYPE_ALIASES[String(type).toUpperCase()] || null) : null;
  const wanted = type
    ? (normalizedType ? Object.keys(CALENDAR_TYPE_MAP).filter(k => CALENDAR_TYPE_MAP[k] === normalizedType) : [])
    : Object.keys(CALENDAR_TYPE_MAP);

  const results = await Promise.all(wanted.map(async (key) => {
    const res = await fetchInvezgoCalendar(CALENDAR_TYPE_MAP[key], code);
    return [key, res];
  }));

  let anyReal = false;
  const out = { dividends: [], stockSplits: [], rightsIssues: [], rups: [], suspensions: [] };
  results.forEach(([key, res]) => {
    if (res.ok) {
      anyReal = true;
      out[key] = res.items.map(item => ({ code: item.code, type: item.type, payload: item.payload }));
    }
  });

  if (search) {
    const q = String(search).toLowerCase().trim();
    Object.keys(out).forEach(key => {
      out[key] = out[key].filter(x => x.code.toLowerCase().includes(q));
    });
  }

  return {
    isSimulated: !anyReal,
    dataSource: anyReal ? 'Invezgo API (real) — GET /analysis/calendar' : 'Tidak tersedia (Invezgo gagal atau tidak mengembalikan data)',
    reportDate: new Date().toISOString().slice(0, 10),
    counts: {
      dividends: out.dividends.length,
      stockSplits: out.stockSplits.length,
      rightsIssues: out.rightsIssues.length,
      rups: out.rups.length,
      suspensions: out.suspensions.length,
      total: out.dividends.length + out.stockSplits.length + out.rightsIssues.length + out.rups.length + out.suspensions.length
    },
    dividends: out.dividends,
    stockSplits: out.stockSplits,
    rightsIssues: out.rightsIssues,
    rups: out.rups,
    suspensions: out.suspensions,
    payloadSchemaUnverified: true,
    updatedAt: new Date().toISOString()
  };
}

// Master Dictionary Notasi Khusus Resmi BEI (Special Notations)
const IDX_SPECIAL_NOTATION_DICT = {
  'A': { code: 'A', name: 'Opini Tidak Wajar (Adverse)', desc: 'Adanya Opini Tidak Wajar (Adverse) dari Akuntan Publik', severity: 'HIGH' },
  'B': { code: 'B', name: 'Permohonan Pailit / PKPU', desc: 'Adanya permohonan Pernyataan Pailit atau Penundaan Kewajiban Pembayaran Utang (PKPU)', severity: 'CRITICAL' },
  'C': { code: 'C', name: 'Perkara Hukum Material', desc: 'Adanya kejadian perkara hukum terhadap Perusahaan Tercatat, Direksi dan/atau Komisaris', severity: 'HIGH' },
  'D': { code: 'D', name: 'Opini Tidak Menyatakan Pendapat (Disclaimer)', desc: 'Adanya Opini Tidak Menyatakan Pendapat (Disclaimer) dari Akuntan Publik', severity: 'CRITICAL' },
  'E': { code: 'E', name: 'Ekuitas Negatif', desc: 'Laporan keuangan terakhir menunjukkan ekuitas negatif', severity: 'CRITICAL' },
  'F': { code: 'F', name: 'Sanksi Denda OJK/Bursa', desc: 'Adanya sanksi administratif dan/atau denda dari OJK/Bursa', severity: 'MEDIUM' },
  'G': { code: 'G', name: 'Sanksi Tertulis OJK/Bursa', desc: 'Adanya sanksi peringatan tertulis dari OJK/Bursa', severity: 'MEDIUM' },
  'I': { code: 'I', name: 'Tidak Memiliki Direktur Independen', desc: 'Perusahaan belum memiliki Direktur Independen yang memenuhi ketentuan', severity: 'LOW' },
  'K': { code: 'K', name: 'Saham Tanpa Hak Suara (Non-Voting)', desc: 'Perusahaan Tercatat menerapkan Saham Dengan Hak Suara Multipel namun bukan pemegang saham pengendali', severity: 'LOW' },
  'L': { code: 'L', name: 'Terlambat Laporan Keuangan', desc: 'Perusahaan Tercatat belum menyampaikan laporan keuangan', severity: 'HIGH' },
  'M': { code: 'M', name: 'Permohonan Pembatalan Perdamaian', desc: 'Adanya permohonan pembatalan perdamaian dalam proses PKPU/kepailitan', severity: 'CRITICAL' },
  'N': { code: 'N', name: 'Hak Suara Multipel (MVS)', desc: 'Perusahaan Tercatat menerapkan Saham Dengan Hak Suara Multipel (Multiple Voting Shares)', severity: 'INFO' },
  'Q': { code: 'Q', name: 'Pembatasan Kegiatan Usaha', desc: 'Adanya pembatasan kegiatan usaha Perusahaan Tercatat oleh regulator', severity: 'HIGH' },
  'S': { code: 'S', name: 'Zero Revenue (Tanpa Pendapatan)', desc: 'Laporan keuangan terakhir menunjukkan tidak ada pendapatan usaha', severity: 'HIGH' },
  'V': { code: 'V', name: 'Sanksi Pembatasan Usaha', desc: 'Adanya sanksi pembatasan kegiatan usaha dari instansi yang berwenang', severity: 'HIGH' },
  'X': { code: 'X', name: 'Papan Pemantauan Khusus (FCA)', desc: 'Efek bersifat ekuitas masuk dalam Papan Pemantauan Khusus (Full Call Auction)', severity: 'HIGH' },
  'Y': { code: 'Y', name: 'Belum RUPS Tahunan', desc: 'Perusahaan Tercatat belum menyelenggarakan RUPST sampai 6 bulan setelah tahun buku', severity: 'MEDIUM' }
};

// Cache Notasi Khusus 12 Jam
let _specialNotationCache = null;
let _specialNotationCacheTime = 0;
const NOTATION_CACHE_TTL_MS = 12 * 60 * 60 * 1000;

async function fetchIdxSpecialNotations(forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && _specialNotationCache && (now - _specialNotationCacheTime) < NOTATION_CACHE_TTL_MS) {
    return _specialNotationCache;
  }

  const byTicker = {};

  try {
    await ensureIdxSession();
    
    // 1. Fetch Notasi Khusus (GetSpecialNotation)
    const urlNotation = 'https://www.idx.co.id/primary/ListedCompany/GetSpecialNotation?indexFrom=1&pageSize=1000';
    const respNotation = await fetch(urlNotation, {
      headers: { ...IDX_BROWSER_HEADERS, 'X-Requested-With': 'XMLHttpRequest', ...(_idxSessionCookie ? { Cookie: _idxSessionCookie } : {}) }
    });

    if (respNotation.ok) {
      const rawNotation = await respNotation.json();
      const records = rawNotation.data || rawNotation.results || rawNotation.Data || (Array.isArray(rawNotation) ? rawNotation : []);
      if (Array.isArray(records)) {
        records.forEach(item => {
          const code = (item.Code || item.StockCode || item.code || '').toUpperCase().trim();
          if (!code) return;
          const notationChar = (item.Notation || item.notation || item.NotationCode || '').toUpperCase().trim();
          const desc = item.Description || item.description || (IDX_SPECIAL_NOTATION_DICT[notationChar] ? IDX_SPECIAL_NOTATION_DICT[notationChar].desc : `Notasi ${notationChar}`);

          if (!byTicker[code]) {
            byTicker[code] = {
              code: code,
              name: item.Name || item.companyName || (code + ' Tbk.'),
              notations: [],
              details: [],
              isWatchlist: false,
              isHighRisk: false,
              updatedAt: new Date().toISOString()
            };
          }

          if (notationChar && !byTicker[code].notations.includes(notationChar)) {
            byTicker[code].notations.push(notationChar);
            byTicker[code].details.push({
              notation: notationChar,
              name: IDX_SPECIAL_NOTATION_DICT[notationChar] ? IDX_SPECIAL_NOTATION_DICT[notationChar].name : `Notasi ${notationChar}`,
              desc: desc,
              severity: IDX_SPECIAL_NOTATION_DICT[notationChar] ? IDX_SPECIAL_NOTATION_DICT[notationChar].severity : 'MEDIUM'
            });
            if (['E', 'B', 'M', 'D', 'L', 'S', 'A', 'X'].includes(notationChar)) {
              byTicker[code].isHighRisk = true;
            }
          }
        });
      }
    }

    // 2. Fetch Papan Pemantauan Khusus (GetWatchlistStock)
    const urlWatchlist = 'https://www.idx.co.id/primary/ListedCompany/GetWatchlistStock?indexFrom=1&pageSize=1000';
    const respWatchlist = await fetch(urlWatchlist, {
      headers: { ...IDX_BROWSER_HEADERS, 'X-Requested-With': 'XMLHttpRequest', ...(_idxSessionCookie ? { Cookie: _idxSessionCookie } : {}) }
    });

    if (respWatchlist.ok) {
      const rawWatchlist = await respWatchlist.json();
      const wRecords = rawWatchlist.data || rawWatchlist.results || rawWatchlist.Data || (Array.isArray(rawWatchlist) ? rawWatchlist : []);
      if (Array.isArray(wRecords)) {
        wRecords.forEach(item => {
          const code = (item.Code || item.StockCode || item.code || '').toUpperCase().trim();
          if (!code) return;
          const criteria = item.Criteria || item.criteria || item.Reason || 'Papan Pemantauan Khusus (FCA)';

          if (!byTicker[code]) {
            byTicker[code] = {
              code: code,
              name: item.Name || item.companyName || (code + ' Tbk.'),
              notations: ['X'],
              details: [{
                notation: 'X',
                name: 'Papan Pemantauan Khusus (FCA)',
                desc: criteria,
                severity: 'HIGH'
              }],
              isWatchlist: true,
              isHighRisk: true,
              updatedAt: new Date().toISOString()
            };
          } else {
            byTicker[code].isWatchlist = true;
            byTicker[code].isHighRisk = true;
            if (!byTicker[code].notations.includes('X')) {
              byTicker[code].notations.push('X');
              byTicker[code].details.push({
                notation: 'X',
                name: 'Papan Pemantauan Khusus (FCA)',
                desc: criteria,
                severity: 'HIGH'
              });
            }
          }
        });
      }
    }

    if (Object.keys(byTicker).length > 0) {
      _specialNotationCache = byTicker;
      _specialNotationCacheTime = now;
      console.log(`[IDX Notasi Khusus] ${Object.keys(byTicker).length} emiten bernotasi khusus berhasil disinkronkan dari idx.co.id.`);
    }

    return _specialNotationCache || byTicker;
  } catch (e) {
    console.warn('[IDX Notasi Khusus] Fetch gagal, pakai cache lama kalau ada:', e.message);
    return _specialNotationCache || byTicker;
  }
}

export {
  ensureIdxSession,
  fetchIdxBrokerSummaryReal,
  fetchIdxStockScreener,
  fetchIdxSpecialNotations,
  IDX_SPECIAL_NOTATION_DICT,
  getBeiTickSize,
  IDX_BROKERS,
  getIdxCalendarData
};
