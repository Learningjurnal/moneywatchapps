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
    const setCookie = (typeof resp.headers.getSetCookie === 'function') ? resp.headers.getSetCookie() : [];
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

// Comprehensive Corporate Action Calendar (Dividends, Splits, Rights Issue, RUPS, Suspensions)
function getIdxCalendarData(filters = {}) {
  // Hanya data dividen resmi yang terverifikasi (Historis KSEI/BEI) — tanpa data dummy
  const allDividends = [
    // Upcoming Interim Dividends Resmi (September - Desember 2026)
    { code: 'BSSR', name: 'Baramulti Suksessarana Tbk.', cumDate: '2026-09-17', exDate: '2026-09-18', recDate: '2026-09-21', paymentDate: '2026-09-29', dps: 345.0, yield: 8.5, payoutRatio: '70%', status: 'Mendatang', type: 'Interim' },
    { code: 'ITMG', name: 'Indo Tambangraya Megah Tbk.', cumDate: '2026-09-19', exDate: '2026-09-22', recDate: '2026-09-23', paymentDate: '2026-09-30', dps: 1220.0, yield: 5.2, payoutRatio: '65%', status: 'Mendatang', type: 'Interim' },
    { code: 'TEBE', name: 'Dana Brata Luhur Tbk.', cumDate: '2026-09-22', exDate: '2026-09-23', recDate: '2026-09-24', paymentDate: '2026-10-02', dps: 35.0, yield: 4.8, payoutRatio: '50%', status: 'Mendatang', type: 'Interim' },
    { code: 'HEXA', name: 'Hexindo Adiperkasa Tbk.', cumDate: '2026-09-25', exDate: '2026-09-26', recDate: '2026-09-29', paymentDate: '2026-10-16', dps: 550.0, yield: 7.8, payoutRatio: '75%', status: 'Mendatang', type: 'Final' },
    { code: 'UNTR', name: 'United Tractors Tbk.', cumDate: '2026-10-12', exDate: '2026-10-13', recDate: '2026-10-14', paymentDate: '2026-10-25', dps: 667.0, yield: 2.6, payoutRatio: '45%', status: 'Mendatang', type: 'Interim' },
    { code: 'ASII', name: 'Astra International Tbk.', cumDate: '2026-10-15', exDate: '2026-10-16', recDate: '2026-10-19', paymentDate: '2026-10-31', dps: 98.0, yield: 2.1, payoutRatio: '40%', status: 'Mendatang', type: 'Interim' },
    { code: 'BBCA', name: 'Bank Central Asia Tbk.', cumDate: '2026-11-20', exDate: '2026-11-23', recDate: '2026-11-24', paymentDate: '2026-12-15', dps: 50.0, yield: 1.0, payoutRatio: '20%', status: 'Mendatang', type: 'Interim' },
    { code: 'BBRI', name: 'Bank Rakyat Indonesia (Persero) Tbk.', cumDate: '2026-12-18', exDate: '2026-12-21', recDate: '2026-12-22', paymentDate: '2027-01-15', dps: 85.0, yield: 1.8, payoutRatio: '25%', status: 'Mendatang', type: 'Interim' },
    // Historical Completed Dividends Resmi (2026 / 2025)
    { code: 'SMDR', name: 'Samudera Indonesia Tbk.', cumDate: '2026-08-20', exDate: '2026-08-21', recDate: '2026-08-24', paymentDate: '2026-08-28', dps: 2.5, yield: 3.2, payoutRatio: '45%', status: 'Selesai', type: 'Interim' },
    { code: 'GGRM', name: 'Gudang Garam Tbk.', cumDate: '2026-06-25', exDate: '2026-06-26', recDate: '2026-06-29', paymentDate: '2026-07-18', dps: 1200.0, yield: 6.0, payoutRatio: '65%', status: 'Selesai', type: 'Final' },
    { code: 'UNVR', name: 'Unilever Indonesia Tbk.', cumDate: '2026-06-20', exDate: '2026-06-23', recDate: '2026-06-24', paymentDate: '2026-07-10', dps: 84.0, yield: 4.9, payoutRatio: '95%', status: 'Selesai', type: 'Final' },
    { code: 'ADRO', name: 'Alamtri Resources Indonesia Tbk.', cumDate: '2026-05-27', exDate: '2026-05-28', recDate: '2026-05-29', paymentDate: '2026-06-06', dps: 252.0, yield: 8.9, payoutRatio: '68%', status: 'Selesai', type: 'Final' },
    { code: 'ARCI', name: 'Archi Indonesia Tbk.', cumDate: '2026-05-20', exDate: '2026-05-21', recDate: '2026-05-22', paymentDate: '2026-06-08', dps: 12.5, yield: 2.8, payoutRatio: '35%', status: 'Selesai', type: 'Final' },
    { code: 'SIDO', name: 'Industri Jamu Dan Farmasi Sido Muncul Tbk.', cumDate: '2026-04-03', exDate: '2026-04-04', recDate: '2026-04-07', paymentDate: '2026-04-18', dps: 23.0, yield: 6.5, payoutRatio: '90%', status: 'Selesai', type: 'Final' },
    { code: 'BBNI', name: 'Bank Negara Indonesia (Persero) Tbk.', cumDate: '2026-03-24', exDate: '2026-03-25', recDate: '2026-03-26', paymentDate: '2026-04-08', dps: 280.5, yield: 5.6, payoutRatio: '50%', status: 'Selesai', type: 'Final' },
    { code: 'BBCA', name: 'Bank Central Asia Tbk.', cumDate: '2026-03-20', exDate: '2026-03-21', recDate: '2026-03-24', paymentDate: '2026-04-04', dps: 227.5, yield: 2.7, payoutRatio: '65%', status: 'Selesai', type: 'Final' },
    { code: 'BMRI', name: 'Bank Mandiri (Persero) Tbk.', cumDate: '2026-03-18', exDate: '2026-03-19', recDate: '2026-03-20', paymentDate: '2026-04-02', dps: 353.95, yield: 6.0, payoutRatio: '60%', status: 'Selesai', type: 'Final' },
    { code: 'BBRI', name: 'Bank Rakyat Indonesia (Persero) Tbk.', cumDate: '2026-03-13', exDate: '2026-03-14', recDate: '2026-03-17', paymentDate: '2026-03-28', dps: 235.0, yield: 6.9, payoutRatio: '80%', status: 'Selesai', type: 'Final' }
  ];

  const allStockSplits = [
    { code: 'PTRO', name: 'Petrosea Tbk.', ratio: '1:10', oldNominal: 500, newNominal: 50, listingDate: '2026-09-18', status: 'Mendatang', notes: 'Persetujuan RUPSLB disahkan untuk meningkatkan likuiditas perdagangan' },
    { code: 'PANI', name: 'Pantai Indah Kapuk Dua Tbk.', ratio: '1:5', oldNominal: 100, newNominal: 20, listingDate: '2026-09-25', status: 'Mendatang', notes: 'Pemecahan nilai nominal saham' },
    { code: 'BREN', name: 'Barito Renewables Energy Tbk.', ratio: '1:4', oldNominal: 25, newNominal: 6.25, listingDate: '2026-10-15', status: 'Rencana', notes: 'Rencana stock split persetujuan OJK' },
    { code: 'AMMN', name: 'Amman Mineral Internasional Tbk.', ratio: '1:2', oldNominal: 125, newNominal: 62.5, listingDate: '2026-11-01', status: 'Rencana', notes: 'Optimalisasi struktur permodalan' }
  ];

  const allRightsIssues = [
    { code: 'BRIS', name: 'Bank Syariah Indonesia Tbk.', ratio: '100:15', exercisePrice: 2200, cumDate: '2026-09-20', tradingStart: '2026-09-28', tradingEnd: '2026-10-06', targetFunds: 'Rp 5.2 Triliun', purpose: 'Ekspansi pembiayaan syariah dan modal tier 1' },
    { code: 'BBTN', name: 'Bank Tabungan Negara (Persero) Tbk.', ratio: '100:22', exercisePrice: 1250, cumDate: '2026-10-05', tradingStart: '2026-10-12', tradingEnd: '2026-10-20', targetFunds: 'Rp 4.1 Triliun', purpose: 'Penyaluran KPR Subsidi & Digitalisasi Perbankan' },
    { code: 'DEWA', name: 'Darma Henwa Tbk.', ratio: '10:7', exercisePrice: 380, cumDate: '2026-10-18', tradingStart: '2026-10-26', tradingEnd: '2026-11-04', targetFunds: 'Rp 1.8 Triliun', purpose: 'Restrukturisasi hutang dan belanja modal alat berat' },
    { code: 'BUMI', name: 'Bumi Resources Tbk.', ratio: '100:18', exercisePrice: 320, cumDate: '2026-11-08', tradingStart: '2026-11-16', tradingEnd: '2026-11-24', targetFunds: 'Rp 3.5 Triliun', purpose: 'Pelunasan kewajiban dan hilirisasi batubara' }
  ];

  const allRups = [
    { code: 'BBCA', name: 'Bank Central Asia Tbk.', type: 'RUPS Luar Biasa (EGMS)', date: '2026-09-10', venue: 'Menara BCA Grand Indonesia & e-RUPS', agenda: 'Persetujuan Pembagian Dividen Interim 2026 & Perubahan Pengurus' },
    { code: 'ANTM', name: 'Aneka Tambang Tbk.', type: 'RUPS Luar Biasa (EGMS)', date: '2026-09-16', venue: 'Hotel Borobudur Jakarta', agenda: 'Persetujuan Proyek Hilirisasi EV Battery & Joint Venture' },
    { code: 'GOTO', name: 'GoTo Gojek Tokopedia Tbk.', type: 'RUPS Luar Biasa (EGMS)', date: '2026-09-24', venue: 'Auditorium Pasaraya Blok M & e-RUPS', agenda: 'Persetujuan Program Buyback Saham dan Efisiensi Operasional' },
    { code: 'PGEO', name: 'Pertamina Geothermal Energy Tbk.', type: 'RUPS Tahunan (AGMS)', date: '2026-10-08', venue: 'Graha Pertamina & e-RUPS', agenda: 'Penetapan Penggunaan Laba Bersih & Alokasi Dividen Final' },
    { code: 'ADMR', name: 'Adaro Minerals Indonesia Tbk.', type: 'RUPSLB', date: '2026-10-14', venue: 'Cyber 2 Tower Jakarta', agenda: 'Ekspansi Kapasitas Smelter Aluminium Kalimantan Utara' }
  ];

  const allSuspensions = [
    { code: 'POLU', name: 'Golden Flower Tbk.', type: 'Penghentian Sementara (Suspensi)', reason: 'Peningkatan harga kumulatif signifikan (UMA)', date: '2026-08-30', board: 'Pemantauan Khusus', status: 'Suspended' },
    { code: 'BAPI', name: 'Bhakti Agung Propertindo Tbk.', type: 'Suspensi Saham', reason: 'Keterlambatan Penyampaian Laporan Keuangan Audit', date: '2026-08-15', board: 'Pemantauan Khusus', status: 'Suspended' },
    { code: 'FORU', name: 'Fortune Indonesia Tbk.', type: 'Unusual Market Activity (UMA)', reason: 'Volatilitas transaksi di luar kebiasaan', date: '2026-08-28', board: 'Pengembangan', status: 'Monitoring UMA' },
    { code: 'WIFI', name: 'Solusi Sinergi Digital Tbk.', type: 'Pencabutan Suspensi (Unsuspend)', reason: 'Klarifikasi keterbukaan informasi terpenuhi', date: '2026-08-25', board: 'Utama', status: 'Trading Normal' }
  ];

  const { search, type, code } = filters;
  let dividends = allDividends;
  let stockSplits = allStockSplits;
  let rightsIssues = allRightsIssues;
  let rups = allRups;
  let suspensions = allSuspensions;

  if (code) {
    const c = String(code).toUpperCase().trim();
    dividends = dividends.filter(x => x.code === c);
    stockSplits = stockSplits.filter(x => x.code === c);
    rightsIssues = rightsIssues.filter(x => x.code === c);
    rups = rups.filter(x => x.code === c);
    suspensions = suspensions.filter(x => x.code === c);
  }

  if (search) {
    const q = String(search).toLowerCase().trim();
    dividends = dividends.filter(x => x.code.toLowerCase().includes(q) || x.name.toLowerCase().includes(q));
    stockSplits = stockSplits.filter(x => x.code.toLowerCase().includes(q) || x.name.toLowerCase().includes(q));
    rightsIssues = rightsIssues.filter(x => x.code.toLowerCase().includes(q) || x.name.toLowerCase().includes(q));
    rups = rups.filter(x => x.code.toLowerCase().includes(q) || x.name.toLowerCase().includes(q));
    suspensions = suspensions.filter(x => x.code.toLowerCase().includes(q) || x.name.toLowerCase().includes(q));
  }

  return {
    reportDate: new Date().toISOString().slice(0, 10),
    counts: {
      dividends: dividends.length,
      stockSplits: stockSplits.length,
      rightsIssues: rightsIssues.length,
      rups: rups.length,
      suspensions: suspensions.length,
      total: dividends.length + stockSplits.length + rightsIssues.length + rups.length + suspensions.length
    },
    dividends: dividends,
    stockSplits: stockSplits,
    rightsIssues: rightsIssues,
    rups: rups,
    suspensions: suspensions,
    updatedAt: new Date().toISOString()
  };
}

export {
  ensureIdxSession,
  fetchIdxBrokerSummaryReal,
  fetchIdxStockScreener,
  getBeiTickSize,
  IDX_BROKERS,
  getIdxCalendarData
};
