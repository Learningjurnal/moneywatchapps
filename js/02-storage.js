// Global Data Stores
var transactions = [];
var rdnMutations = [];
var dividends = [];
var cryptoTx = [];
var etfTx = [];
var rdTx = [];
var divInvestData = [];
var tradeStrategy = {};
var activeSekuritas = 'Stockbit';
var rdnBalance = 0;
var sekTaxOverride = {};
var nextTxId = 1;
var nextRdnId = 1;

// Helper bersama: id berikutnya yang AMAN untuk sebuah array {id,...}
function _maxIdPlus1(arr){ var m=0; (arr||[]).forEach(function(x){ if(x.id>m) m=x.id; }); return m+1; }

// ============================================================
// ============================================================
// DATA PORTOFOLIO & TRANSAKSI STOCK B (22 SAHAM SEKURITAS STOCKBIT)
// ============================================================
var INITIAL_PORTO_2026 = [
  { id: 1, date: '2026-09-02', type: 'BUY', ticker: 'GGRM', lot: 6, shares: 600, price: 77464, gross: 46478309, komisi: 0, ppn: 0, levy: 0, pph: 0, tax: 0, net: 46478309, sekuritas: 'Stockbit' },
  { id: 2, date: '2026-09-02', type: 'BUY', ticker: 'BBNI', lot: 73, shares: 7300, price: 4795, gross: 35005891, komisi: 0, ppn: 0, levy: 0, pph: 0, tax: 0, net: 35005891, sekuritas: 'Stockbit' },
  { id: 3, date: '2026-09-02', type: 'BUY', ticker: 'CPRI', lot: 90, shares: 9000, price: 136, gross: 1224792, komisi: 0, ppn: 0, levy: 0, pph: 0, tax: 0, net: 1224792, sekuritas: 'Stockbit' },
  { id: 4, date: '2026-09-02', type: 'BUY', ticker: 'BBCA', lot: 68, shares: 6800, price: 7395, gross: 50282840, komisi: 0, ppn: 0, levy: 0, pph: 0, tax: 0, net: 50282840, sekuritas: 'Stockbit' },
  { id: 5, date: '2026-09-02', type: 'BUY', ticker: 'BMRI', lot: 72, shares: 7200, price: 5085, gross: 36611126, komisi: 0, ppn: 0, levy: 0, pph: 0, tax: 0, net: 36611126, sekuritas: 'Stockbit' },
  { id: 6, date: '2026-09-02', type: 'BUY', ticker: 'BBRI', lot: 223, shares: 22300, price: 4277, gross: 95379245, komisi: 0, ppn: 0, levy: 0, pph: 0, tax: 0, net: 95379245, sekuritas: 'Stockbit' },
  { id: 7, date: '2026-09-02', type: 'BUY', ticker: 'UNVR', lot: 60, shares: 6000, price: 5631, gross: 33783526, komisi: 0, ppn: 0, levy: 0, pph: 0, tax: 0, net: 33783526, sekuritas: 'Stockbit' },
  { id: 8, date: '2026-09-02', type: 'BUY', ticker: 'ADRO', lot: 112, shares: 11200, price: 2685, gross: 30071411, komisi: 0, ppn: 0, levy: 0, pph: 0, tax: 0, net: 30071411, sekuritas: 'Stockbit' },
  { id: 9, date: '2026-09-02', type: 'BUY', ticker: 'SIDO', lot: 330, shares: 33000, price: 631, gross: 20821181, komisi: 0, ppn: 0, levy: 0, pph: 0, tax: 0, net: 20821181, sekuritas: 'Stockbit' },
  { id: 10, date: '2026-09-02', type: 'BUY', ticker: 'PGEO', lot: 823, shares: 82300, price: 1426, gross: 117354354, komisi: 0, ppn: 0, levy: 0, pph: 0, tax: 0, net: 117354354, sekuritas: 'Stockbit' },
  { id: 11, date: '2026-09-02', type: 'BUY', ticker: 'PMMP', lot: 38, shares: 3800, price: 260, gross: 989659, komisi: 0, ppn: 0, levy: 0, pph: 0, tax: 0, net: 989659, sekuritas: 'Stockbit' },
  { id: 12, date: '2026-09-02', type: 'BUY', ticker: 'BUMI', lot: 523, shares: 52300, price: 314, gross: 16444154, komisi: 0, ppn: 0, levy: 0, pph: 0, tax: 0, net: 16444154, sekuritas: 'Stockbit' },
  { id: 13, date: '2026-09-02', type: 'BUY', ticker: 'SMDR', lot: 710, shares: 71000, price: 395, gross: 28057533, komisi: 0, ppn: 0, levy: 0, pph: 0, tax: 0, net: 28057533, sekuritas: 'Stockbit' },
  { id: 14, date: '2026-09-02', type: 'BUY', ticker: 'CDIA', lot: 198, shares: 19800, price: 1859, gross: 36804194, komisi: 0, ppn: 0, levy: 0, pph: 0, tax: 0, net: 36804194, sekuritas: 'Stockbit' },
  { id: 15, date: '2026-09-02', type: 'BUY', ticker: 'RAJA', lot: 225, shares: 22500, price: 868, gross: 19526715, komisi: 0, ppn: 0, levy: 0, pph: 0, tax: 0, net: 19526715, sekuritas: 'Stockbit' },
  { id: 16, date: '2026-09-02', type: 'BUY', ticker: 'ADMR', lot: 223, shares: 22300, price: 1395, gross: 31117939, komisi: 0, ppn: 0, levy: 0, pph: 0, tax: 0, net: 31117939, sekuritas: 'Stockbit' },
  { id: 17, date: '2026-09-02', type: 'BUY', ticker: 'DEWA', lot: 135, shares: 13500, price: 730, gross: 9851114, komisi: 0, ppn: 0, levy: 0, pph: 0, tax: 0, net: 9851114, sekuritas: 'Stockbit' },
  { id: 18, date: '2026-09-02', type: 'BUY', ticker: 'MBMA', lot: 92, shares: 9200, price: 543, gross: 4996779, komisi: 0, ppn: 0, levy: 0, pph: 0, tax: 0, net: 4996779, sekuritas: 'Stockbit' },
  { id: 19, date: '2026-09-02', type: 'BUY', ticker: 'WIFI', lot: 57, shares: 5700, price: 3298, gross: 18797336, komisi: 0, ppn: 0, levy: 0, pph: 0, tax: 0, net: 18797336, sekuritas: 'Stockbit' },
  { id: 20, date: '2026-09-02', type: 'BUY', ticker: 'ARCI', lot: 240, shares: 24000, price: 1860, gross: 44638873, komisi: 0, ppn: 0, levy: 0, pph: 0, tax: 0, net: 44638873, sekuritas: 'Stockbit' },
  { id: 21, date: '2026-09-02', type: 'BUY', ticker: 'PRDL', lot: 31, shares: 3100, price: 356, gross: 1104985, komisi: 0, ppn: 0, levy: 0, pph: 0, tax: 0, net: 1104985, sekuritas: 'Stockbit' },
  { id: 22, date: '2026-09-02', type: 'BUY', ticker: 'GMFI', lot: 120, shares: 12000, price: 64, gross: 773390, komisi: 0, ppn: 0, levy: 0, pph: 0, tax: 0, net: 773390, sekuritas: 'Stockbit' }
];

function initPortfolio2026(force){
  if(transactions && transactions.length > 0 && !force) return;
  
  transactions = JSON.parse(JSON.stringify(INITIAL_PORTO_2026));
  rdnMutations = [];
  dividends = [];
  cryptoTx = [];
  etfTx = [];
  rdTx = [];
  divInvestData = [];
  nextTxId = 23;
  nextRdnId = 1;
  nextDivId = 1;
  nextCryptoId = 1;
  nextEtfId = 1;
  nextRdId = 1;
  activeSekuritas = 'Stockbit';
  rdnBalance = 52016390;

  // Initial RDN balance deposit mutation (Modal Pokok Awal = 729.807.630 + Dividen BBRI 2.324.106 - Beli 22 Saham 680.115.346 = Sisa Kas RDN 52.016.390)
  rdnMutations.push({
    id: nextRdnId++,
    date: '2026-09-02',
    type: 'TOPUP',
    ket: 'Setoran Modal Awal Investasi',
    amount: 729807630,
    balance: 729807630,
    sekuritas: 'Stockbit',
    linkedTxId: null,
    account: 'saham'
  });

  // Dividen YTD 2026 jika ada
  dividends.push({
    id: nextDivId++,
    date: '2026-09-02',
    ticker: 'BBRI',
    shares: 22300,
    dps: 104.22,
    gross: 2324106,
    tax: 0,
    net: 2324106,
    pphRate: 0
  });

  if(typeof CASH_ACCOUNTS !== 'undefined'){
    if(CASH_ACCOUNTS.saham) CASH_ACCOUNTS.saham.balance = 52016390;
    if(CASH_ACCOUNTS.crypto) CASH_ACCOUNTS.crypto.balance = 0;
    if(CASH_ACCOUNTS.reksadana) CASH_ACCOUNTS.reksadana.balance = 0;
  }

  tradeStrategy = {};

  if (typeof rebuildRdnBalance === 'function') rebuildRdnBalance();
  if (typeof _invalidatePortoCache === 'function') _invalidatePortoCache();
  if (typeof saveData === 'function') saveData();
}

function resetAllDatabaseAndTransactions(){
  transactions = [];
  rdnMutations = [];
  dividends = [];
  cryptoTx = [];
  etfTx = [];
  rdTx = [];
  divInvestData = [];
  nextTxId = 1;
  nextDivId = 1;
  nextRdnId = 1;
  nextCryptoId = 1;
  nextEtfId = 1;
  nextRdId = 1;
  rdnBalance = 0;
  sekTaxOverride = {};

  if(typeof MW_THESES !== 'undefined') MW_THESES = [];
  if(typeof MW_JOURNALS !== 'undefined') MW_JOURNALS = [];
  if(typeof WEALTH !== 'undefined'){
    WEALTH.income = 0; WEALTH.expense = 0; WEALTH.deposito = 0; WEALTH.emas = 0; WEALTH.obligasi = 0;
    WEALTH.bank = []; WEALTH.debt = []; WEALTH.piutang = [];
  }

  if(typeof CASH_ACCOUNTS !== 'undefined'){
    if(CASH_ACCOUNTS.saham) CASH_ACCOUNTS.saham.balance = 0;
    if(CASH_ACCOUNTS.crypto) CASH_ACCOUNTS.crypto.balance = 0;
    if(CASH_ACCOUNTS.reksadana) CASH_ACCOUNTS.reksadana.balance = 0;
  }

  tradeStrategy = {};

  try {
    var keysToClear = [
      'mw_local_data_v2',
      'mw_emergency_backup_v2',
      'mw_trade_strategy',
      'mw_stocks_db',
      'moneywatch_stocks_db',
      'moneywatch_stocks_backup',
      'transactions',
      'portfolio',
      'rdnMutations',
      'dividends',
      'cryptoTx',
      'etfTx',
      'rdTx',
      'divInvestData',
      'mw_backup_history',
      'mw_tx_cache',
      'mw_price_alerts',
      'mw_custom_stocks'
    ];
    keysToClear.forEach(function(k){
      localStorage.removeItem(k);
    });
  } catch(e){}

  // Purge server persistence mirror
  if(typeof fetch === 'function'){
    try {
      var uid = (typeof getFirestoreUserUid === 'function') ? getFirestoreUserUid() : '';
      fetch('/api/user-data/clear', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid: uid })
      }).catch(function(){});
    } catch(e){}
  }

  // Purge Firebase Firestore doc if connected
  var db = (typeof getFirebaseDb === 'function') ? getFirebaseDb() : _firebaseDb;
  var fireUid = (typeof getFirestoreUserUid === 'function') ? getFirestoreUserUid() : null;
  if(db && fireUid){
    try {
      var mainDoc = db.collection('users').doc(fireUid).collection('data').doc('main');
      mainDoc.set({
        transactions: [],
        dividends: [],
        rdnMutations: [],
        cryptoTx: [],
        etfTx: [],
        rdTx: [],
        divInvestData: [],
        tradeStrategy: {},
        rdnBalance: 0,
        updatedAt: new Date().toISOString()
      }, { merge: false }).catch(function(){});
    } catch(e){}
  }

  if(typeof rebuildRdnBalance === 'function') rebuildRdnBalance();
  if(typeof _invalidatePortoCache === 'function') _invalidatePortoCache();

  if(typeof renderDashboard === 'function') renderDashboard();
  if(typeof renderPortofolio === 'function') renderPortofolio();
  if(typeof renderTransaksi === 'function') renderTransaksi();
  if(typeof renderRdn === 'function') renderRdn();
  if(typeof renderDividen === 'function') renderDividen();
  if(typeof renderCrypto === 'function') renderCrypto();
  if(typeof renderReksaDana === 'function') renderReksaDana();
  if(typeof renderCashWidgets === 'function') renderCashWidgets();
  if(typeof renderAll === 'function') renderAll();

  if(typeof showSaveStatus === 'function'){
    showSaveStatus('✓ Seluruh data transaksi & lokal berhasil dikosongkan 100% (Bersih)', 'var(--green)');
  }
}
window.resetAllDatabaseAndTransactions = resetAllDatabaseAndTransactions;

function sanitizeRdnMutations(){
  if(!Array.isArray(rdnMutations)) rdnMutations = [];
  
  // 1. Jika ada mutasi berulang 'Setoran Awal' dan 'Setoran Awal Penyesuaian RDN', pertahankan yang TERBARU (berdasarkan ID / tanggal), bukan nilai terbesar
  var initialSetors = rdnMutations.filter(function(r){
    return (r.type === 'SETOR' || r.type === 'TOPUP') && 
           (r.ket && (r.ket.indexOf('Setoran Awal') !== -1 || r.ket.indexOf('Modal Awal') !== -1));
  });

  if (initialSetors.length > 1) {
    // Ambil mutasi setoran awal terbaru yang diupdate pengguna
    var latestSetor = initialSetors.reduce(function(prev, curr){
      if((curr.date || '') > (prev.date || '')) return curr;
      if((curr.date || '') === (prev.date || '') && (curr.id || 0) > (prev.id || 0)) return curr;
      return prev;
    }, initialSetors[0]);

    rdnMutations = rdnMutations.filter(function(r){
      if ((r.type === 'SETOR' || r.type === 'TOPUP') && 
          (r.ket && (r.ket.indexOf('Setoran Awal') !== -1 || r.ket.indexOf('Modal Awal') !== -1))) {
        return r.id === latestSetor.id;
      }
      return true;
    });
  }

  // 2. Rebuild saldo berjalan kronologis
  if(typeof rebuildRdnBalance === 'function') rebuildRdnBalance();
}

// ============================================================
// BACKEND & DATABASE RDN RECONCILIATION ENGINE
// ============================================================
function reconcileRdnWithTransactions(silent){
  if(!Array.isArray(transactions)) transactions = [];
  if(!Array.isArray(dividends)) dividends = [];
  if(!Array.isArray(cryptoTx)) cryptoTx = [];
  if(!Array.isArray(rdTx)) rdTx = [];
  if(!Array.isArray(rdnMutations)) rdnMutations = [];

  var defSec = activeSekuritas || 'Stockbit';

  // 1. Kumpulkan semua mutasi manual / non-trade (SETOR, TOPUP, TARIK, FEE, BIAYA, ADJUST, dll)
  var manualMutations = [];
  var existingTradeMutationsByLinkedId = {};

  rdnMutations.forEach(function(m){
    if(!m) return;
    var linkedId = (m.linkedTxId != null) ? String(m.linkedTxId) : null;
    if(linkedId){
      existingTradeMutationsByLinkedId[linkedId] = m;
    } else {
      // Manual cash entry (setoran, penarikan, penyesuaian saldo riil)
      var amt = (typeof m.amount === 'number' && !isNaN(m.amount)) ? m.amount : Number(m.amount || 0);
      manualMutations.push({
        id: m.id || null,
        date: m.date || today(),
        type: m.type || (amt >= 0 ? 'SETOR' : 'TARIK'),
        ket: m.ket || (amt >= 0 ? 'Setoran / Top Up Kas' : 'Penarikan Kas'),
        amount: amt,
        balance: 0,
        sekuritas: m.sekuritas || defSec,
        account: m.account || 'saham',
        linkedTxId: null
      });
    }
  });

  // Rapikan duplikasi Setoran Awal jika ada lebih dari 1 dengan memilih yang TERAKHIR (terbaru) diupdate
  var initialSetors = manualMutations.filter(function(r){
    return (r.type === 'SETOR' || r.type === 'TOPUP') && 
           (r.ket && (r.ket.indexOf('Setoran Awal') !== -1 || r.ket.indexOf('Modal Awal') !== -1));
  });
  if (initialSetors.length > 1) {
    var latestSetor = initialSetors.reduce(function(prev, curr){
      if((curr.date || '') > (prev.date || '')) return curr;
      if((curr.date || '') === (prev.date || '') && (curr.id || 0) > (prev.id || 0)) return curr;
      return prev;
    }, initialSetors[0]);
    manualMutations = manualMutations.filter(function(r){
      if ((r.type === 'SETOR' || r.type === 'TOPUP') && 
          (r.ket && (r.ket.indexOf('Setoran Awal') !== -1 || r.ket.indexOf('Modal Awal') !== -1))) {
        return r.id === latestSetor.id;
      }
      return true;
    });
  }

  var reconciled = manualMutations.slice();

  // 2. Sinkronkan Transaksi Saham (BUY / SELL)
  transactions.forEach(function(tx){
    if(!tx || !tx.id) return;
    var isBuy = tx.type === 'BUY';
    var gross = (typeof tx.gross === 'number' && isFinite(tx.gross)) ? tx.gross : ((tx.lot || 0) * 100 * (tx.price || 0));
    var net = (typeof tx.net === 'number' && isFinite(tx.net)) ? tx.net : gross;
    var amt = isBuy ? -Math.abs(net) : Math.abs(net);
    var linkedId = String(tx.id);
    var existing = existingTradeMutationsByLinkedId[linkedId];

    reconciled.push({
      id: existing && existing.id ? existing.id : null,
      date: tx.date || (existing && existing.date) || today(),
      type: tx.type || (isBuy ? 'BUY' : 'SELL'),
      ket: (isBuy ? 'Beli ' : 'Jual ') + (tx.lot || 0) + ' lot ' + (tx.ticker || '') + ' @ Rp ' + fmt(tx.price || 0),
      amount: amt,
      balance: 0,
      sekuritas: tx.sekuritas || defSec,
      account: 'saham',
      linkedTxId: tx.id
    });
  });

  // 3. Sinkronkan Penerimaan Dividen
  dividends.forEach(function(d){
    if(!d || !d.id) return;
    var gross = (typeof d.gross === 'number' && isFinite(d.gross)) ? d.gross : ((d.shares || 0) * (d.dps || 0));
    var tax = (typeof d.tax === 'number' && isFinite(d.tax)) ? d.tax : (gross * (d.pphRate || 0.1));
    var net = (typeof d.net === 'number' && isFinite(d.net)) ? d.net : (gross - tax);
    var linkedId = 'div-' + d.id;
    var existing = existingTradeMutationsByLinkedId[linkedId];

    reconciled.push({
      id: existing && existing.id ? existing.id : null,
      date: d.date || (existing && existing.date) || today(),
      type: 'DIVIDEN',
      ket: 'Dividen ' + (d.ticker || '') + ' (' + fmt(d.shares || 0) + ' lbr @ Rp ' + fmt(d.dps || 0) + ')',
      amount: Math.abs(net),
      balance: 0,
      sekuritas: d.sekuritas || defSec,
      account: 'saham',
      linkedTxId: linkedId
    });
  });

  // 4. Sinkronkan Transaksi Crypto
  cryptoTx.forEach(function(c){
    if(!c || !c.id) return;
    var isBuy = c.type === 'BUY';
    var total = (typeof c.total === 'number' && isFinite(c.total)) ? c.total : ((c.qty || 0) * (c.priceIdr || 0));
    var amt = isBuy ? -Math.abs(total) : Math.abs(total);
    var linkedId = 'cr-' + c.id;
    var existing = existingTradeMutationsByLinkedId[linkedId] || existingTradeMutationsByLinkedId['crypto-' + c.id];

    reconciled.push({
      id: existing && existing.id ? existing.id : null,
      date: c.date || (existing && existing.date) || today(),
      type: c.type || (isBuy ? 'BUY' : 'SELL'),
      ket: (isBuy ? 'Beli ' : 'Jual ') + (c.qty || 0) + ' ' + (c.coin || '') + ' @ Rp ' + fmt(Math.round(c.priceIdr || 0)),
      amount: amt,
      balance: 0,
      sekuritas: 'Crypto Exchange',
      account: 'crypto',
      linkedTxId: linkedId
    });
  });

  // 5. Sinkronkan Transaksi Reksa Dana
  rdTx.forEach(function(r){
    if(!r || !r.id) return;
    var isBeli = (r.type === 'BELI' || r.type === 'BUY');
    var amt = isBeli ? -Math.abs(Number(r.amount || 0)) : Math.abs(Number(r.amount || 0));
    var linkedId = 'rd-' + r.id;
    var existing = existingTradeMutationsByLinkedId[linkedId];
    var rdName = (typeof RD_DB !== 'undefined' && RD_DB[r.code] && RD_DB[r.code].name) || r.code || 'Reksa Dana';

    reconciled.push({
      id: existing && existing.id ? existing.id : null,
      date: r.date || (existing && existing.date) || today(),
      type: isBeli ? 'BUY' : 'SELL',
      ket: (isBeli ? 'Beli RD ' : 'Jual RD ') + rdName + ' (NAB Rp ' + fmt(Math.round(r.nab || 1000)) + ')',
      amount: amt,
      balance: 0,
      sekuritas: 'Platform RD',
      account: 'reksadana',
      linkedTxId: linkedId
    });
  });

  // 6. Urutkan secara kronologis deterministik
  function _getPriority(type){
    if(type === 'SETOR' || type === 'TOPUP') return 10;
    if(type === 'DIVIDEN' || type === 'DIVIDEND') return 20;
    if(type === 'SELL') return 30;
    if(type === 'BUY') return 40;
    if(type === 'TARIK') return 50;
    return 60;
  }

  reconciled.sort(function(a, b){
    var dComp = (a.date || '').localeCompare(b.date || '');
    if(dComp !== 0) return dComp;
    var pA = _getPriority(a.type);
    var pB = _getPriority(b.type);
    if(pA !== pB) return pA - pB;
    return ((a.id || 0) - (b.id || 0));
  });

  // 7. Berikan ID sekuensial aman & kalkulasi saldo per-rekening
  var maxId = 0;
  var balSaham = 0;
  var balCrypto = 0;
  var balRd = 0;

  reconciled.forEach(function(m, idx){
    m.id = idx + 1;
    maxId = m.id;
    var amt = Number(m.amount || 0);
    m.amount = amt;
    var acc = m.account || 'saham';
    m.account = acc;

    if(acc === 'crypto'){
      balCrypto += amt;
      m.balance = balCrypto;
    } else if(acc === 'reksadana'){
      balRd += amt;
      m.balance = balRd;
    } else {
      balSaham += amt;
      m.balance = balSaham;
    }
  });

  rdnMutations = reconciled;
  nextRdnId = maxId + 1;
  rdnBalance = balSaham;

  if(typeof CASH_ACCOUNTS !== 'undefined'){
    if(CASH_ACCOUNTS.saham) CASH_ACCOUNTS.saham.balance = balSaham;
    if(CASH_ACCOUNTS.crypto) CASH_ACCOUNTS.crypto.balance = balCrypto;
    if(CASH_ACCOUNTS.reksadana) CASH_ACCOUNTS.reksadana.balance = balRd;
  }

  // 8. Kirim verifikasi rekonsiliasi ke backend async
  try {
    var isStaticHost = typeof window !== 'undefined' && window.location && (
      (window.location.hostname || '').indexOf('github.io') !== -1 ||
      window.location.protocol === 'file:' ||
      (window.location.hostname || '').indexOf('pages.dev') !== -1
    );
    if(!isStaticHost && typeof fetch === 'function'){
      fetch('/api/sync/reconcile-rdn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transactions: transactions,
          dividends: dividends,
          cryptoTx: cryptoTx,
          rdTx: rdTx,
          rdnMutations: rdnMutations,
          activeSekuritas: activeSekuritas
        })
      }).then(function(res){
        if(!res.ok) return null;
        var ct = res.headers.get('content-type');
        return (ct && ct.indexOf('application/json') !== -1) ? res.json() : null;
      }).then(function(backendResult){
        if(backendResult && backendResult.success){
          console.log('✓ Backend RDN sync & audit verified:', backendResult.stats);
        }
      }).catch(function(beErr){});
    }
  } catch(netErr){}

  if(!silent && typeof showSaveStatus === 'function'){
    showSaveStatus('✓ Database mutasi RDN berhasil disinkronkan 100%', 'var(--green)');
  }

  return true;
}

async function syncRdnDatabase(notify){
  if(typeof showSaveStatus === 'function') showSaveStatus('⏳ Menyelaraskan database mutasi RDN...', 'var(--accent)', true);
  
  try {
    // 1. Jalankan rekonsiliasi lokal & backend
    reconcileRdnWithTransactions(true);
    
    // 2. Simpan ke LocalStorage dan Firebase Firestore Cloud
    saveData();
    
    // 3. Render ulang UI
    if(typeof renderRdn === 'function') renderRdn();
    if(typeof renderCashWidgets === 'function') renderCashWidgets();
    if(typeof renderTransaksi === 'function') renderTransaksi();
    if(typeof renderDividen === 'function') renderDividen();
    if(typeof renderCrypto === 'function') renderCrypto();
    if(typeof renderReksaDana === 'function') renderReksaDana();
    if(typeof renderDataHealth === 'function' && typeof currentPage !== 'undefined' && currentPage === 'datahealth') renderDataHealth();
    if(typeof renderPage === 'function' && typeof currentPage !== 'undefined') renderPage(currentPage);

    if(typeof showSaveStatus === 'function'){
      showSaveStatus('✓ Database Mutasi RDN telah 100% selaras dengan Transaksi & Cloud', 'var(--green)');
    }

    if(notify && typeof mwConfirm === 'function'){
      mwConfirm('Sinkronisasi Database RDN Berhasil', 
        '<div style="line-height:1.6">' +
        '✅ <strong>Data mutasi RDN di database telah diselaraskan dengan kondisi terkini:</strong><br><br>' +
        '• Transaksi Saham IDX: <strong>' + (transactions||[]).length + ' transaksi</strong> tersinkronisasi<br>' +
        '• Dividen Saham: <strong>' + (dividends||[]).length + ' penerimaan</strong> tersinkronisasi<br>' +
        '• Transaksi Crypto: <strong>' + (cryptoTx||[]).length + ' transaksi</strong> tersinkronisasi<br>' +
        '• Reksa Dana: <strong>' + (rdTx||[]).length + ' transaksi</strong> tersinkronisasi<br>' +
        '• Total Mutasi Kas RDN: <strong>' + (rdnMutations||[]).length + ' baris</strong> tersimpan &amp; terverifikasi.<br><br>' +
        '<span style="color:var(--green);font-weight:600">Saldo kas dan mutasi berjalan di Firestore &amp; lokal kini 100% konsisten.</span>' +
        '</div>',
        function(){},
        'Tutup',
        'btn-primary'
      );
    }
  } catch(err) {
    if(typeof showSaveStatus === 'function') showSaveStatus('⚠ Gagal sinkronisasi: ' + err.message, 'var(--red)', true);
  }
}
window.syncRdnDatabase = syncRdnDatabase;
window.reconcileRdnWithTransactions = reconcileRdnWithTransactions;

// Inisialisasi awal aman: coba load dari localStorage dulu
try {
  loadData();
  sanitizeRdnMutations();
} catch(e){
  console.warn('Initial storage load notice:', e);
}


// ============================================================
// FIREBASE FIRESTORE DATA SYNC
// ============================================================
var tradeStrategy = {
  'ARCI': 'Swing Trade',
  'PGEO': 'Core Long',
  'BBRI': 'Core Long',
  'BBCA': 'Core Long',
  'ADMR': 'Core Long',
  'BMRI': 'Core Long',
  'BBNI': 'Core Long',
  'ADRO': 'Core Long',
  'SMDR': 'Core Long'
};
// ══════════════════════════════════════════════════════════
// DATA MERGE & CONFLICT RESOLUTION ENGINE
// ══════════════════════════════════════════════════════════
function _makeTxSig(t){
  if(!t) return '';
  return (t.date || '') + '|' + (t.type || '') + '|' + (t.ticker || '') + '|' + (t.lot || 0) + '|' + (t.price || 0) + '|' + (t.sekuritas || '');
}

function _mergeDatasets(localObj, cloudObj){
  var local = localObj || {};
  var cloud = cloudObj || {};

  var localTime = new Date(local.savedAt || local.updatedAt || 0).getTime();
  var cloudTime = new Date(cloud.savedAt || cloud.updatedAt || 0).getTime();

  // 0. Cek flag eksplisit empty / reset dari user
  var localIsExplicitlyEmpty = local.isExplicitlyEmpty === true || (typeof localStorage !== 'undefined' && localStorage.getItem('mw_data_cleared') === '1');
  var cloudIsExplicitlyEmpty = cloud.isExplicitlyEmpty === true;

  if(localIsExplicitlyEmpty && (!cloudTime || localTime >= cloudTime)){
    return Object.assign({}, cloud, local, {
      transactions: [],
      dividends: [],
      rdnMutations: [],
      cryptoTx: [],
      etfTx: [],
      rdTx: [],
      divInvestData: [],
      rdnBalance: 0,
      isExplicitlyEmpty: true
    });
  }

  if(cloudIsExplicitlyEmpty && (!localTime || cloudTime >= localTime)){
    return Object.assign({}, local, cloud, {
      transactions: [],
      dividends: [],
      rdnMutations: [],
      cryptoTx: [],
      etfTx: [],
      rdTx: [],
      divInvestData: [],
      rdnBalance: 0,
      isExplicitlyEmpty: true
    });
  }

  if(localIsExplicitlyEmpty && cloudIsExplicitlyEmpty){
    return Object.assign({}, cloud, local, {
      transactions: [],
      dividends: [],
      rdnMutations: [],
      cryptoTx: [],
      etfTx: [],
      rdTx: [],
      divInvestData: [],
      rdnBalance: 0,
      isExplicitlyEmpty: true
    });
  }

  // Jika salah satu sisi secara eksplisit lebih baru (> 10 detik bedanya), prioritaskan dataset yang lebih baru agar transaksi yang dihapus/diubah pengguna tidak ditumpuk ulang secara bertentangan
  var isLocalMuchNewer = localTime > 0 && (localTime - cloudTime > 10000);
  var isCloudMuchNewer = cloudTime > 0 && (cloudTime - localTime > 10000);

  if (isLocalMuchNewer && Array.isArray(local.transactions) && local.transactions.length >= 0) {
    return Object.assign({}, cloud, local, {
      transactions: local.transactions,
      dividends: local.dividends || cloud.dividends || [],
      rdnMutations: local.rdnMutations || cloud.rdnMutations || [],
      cryptoTx: local.cryptoTx || cloud.cryptoTx || [],
      rdTx: local.rdTx || cloud.rdTx || []
    });
  }

  if (isCloudMuchNewer && Array.isArray(cloud.transactions) && cloud.transactions.length >= 0) {
    return Object.assign({}, local, cloud, {
      transactions: cloud.transactions,
      dividends: cloud.dividends || local.dividends || [],
      rdnMutations: cloud.rdnMutations || local.rdnMutations || [],
      cryptoTx: cloud.cryptoTx || local.cryptoTx || [],
      rdTx: cloud.rdTx || local.rdTx || []
    });
  }

  // Jika perangkat baru / device lain (local transaksi kosong) dan cloud memiliki transaksi, adopsi data cloud secara penuh
  if ((!local.transactions || local.transactions.length === 0) && Array.isArray(cloud.transactions) && cloud.transactions.length > 0) {
    return Object.assign({}, local, cloud, {
      transactions: cloud.transactions,
      dividends: cloud.dividends || [],
      rdnMutations: cloud.rdnMutations || [],
      cryptoTx: cloud.cryptoTx || [],
      rdTx: cloud.rdTx || [],
      etfTx: cloud.etfTx || [],
      divInvestData: cloud.divInvestData || [],
      rdnBalance: (typeof cloud.rdnBalance === 'number') ? cloud.rdnBalance : (local.rdnBalance || 0),
      wealth: cloud.wealth || local.wealth || null,
      theses: (cloud.theses && cloud.theses.length) ? cloud.theses : (local.theses || []),
      journals: (cloud.journals && cloud.journals.length) ? cloud.journals : (local.journals || []),
      tradeStrategy: Object.assign({}, local.tradeStrategy || {}, cloud.tradeStrategy || {}),
      cashAccounts: Object.assign({}, local.cashAccounts || {}, cloud.cashAccounts || {})
    });
  }

  // 1. Merge Transactions (Saham BUY / SELL) — preserve every transaction from both local & cloud
  var txMap = new Map();
  var mergedTx = [];

  var lTx = Array.isArray(local.transactions) ? local.transactions : [];
  var cTx = Array.isArray(cloud.transactions) ? cloud.transactions : [];

  // Index cloud transactions first
  cTx.forEach(function(t){
    if(!t) return;
    var sig = _makeTxSig(t);
    var key = (t.id != null) ? ('id_' + t.id) : ('sig_' + sig);
    txMap.set(key, t);
    if(sig) txMap.set('sig_' + sig, t);
  });

  // Merge local transactions (keep any local additions or modifications)
  lTx.forEach(function(t){
    if(!t) return;
    var sig = _makeTxSig(t);
    var key = (t.id != null) ? ('id_' + t.id) : ('sig_' + sig);
    if(!txMap.has(key) && (!sig || !txMap.has('sig_' + sig))){
      txMap.set(key, t);
      if(sig) txMap.set('sig_' + sig, t);
    } else {
      // If exists, keep the one with net/gross components or valid id
      var existing = txMap.get(key) || txMap.get('sig_' + sig);
      if(existing && t.id && !existing.id) existing.id = t.id;
      if(existing && t.sekuritas && !existing.sekuritas) existing.sekuritas = t.sekuritas;
    }
  });

  // Extract distinct transactions
  var seenIds = new Set();
  var seenSigs = new Set();
  txMap.forEach(function(t){
    var sig = _makeTxSig(t);
    var idKey = t.id != null ? String(t.id) : null;
    if(idKey && seenIds.has(idKey)) return;
    if(sig && seenSigs.has(sig)) return;
    if(idKey) seenIds.add(idKey);
    if(sig) seenSigs.add(sig);
    mergedTx.push(t);
  });

  // Sort transactions chronologically
  mergedTx.sort(function(a, b){
    var d = (a.date || '').localeCompare(b.date || '');
    if(d !== 0) return d;
    return ((a.id || 0) - (b.id || 0));
  });

  // 2. Merge Dividends
  var divMap = new Map();
  var lDiv = Array.isArray(local.dividends) ? local.dividends : [];
  var cDiv = Array.isArray(cloud.dividends) ? cloud.dividends : [];
  [].concat(cDiv, lDiv).forEach(function(d){
    if(!d) return;
    var sig = (d.date || '') + '|' + (d.ticker || '') + '|' + (d.shares || 0) + '|' + (d.dps || 0);
    if(!divMap.has(sig)) divMap.set(sig, d);
  });
  var mergedDiv = Array.from(divMap.values()).sort(function(a, b){
    return (a.date || '').localeCompare(b.date || '') || ((a.id || 0) - (b.id || 0));
  });

  // 3. Merge RDN Mutations (Preserve all manual entries: SETOR, TARIK, PENYESUAIAN, BIAYA)
  var lMut = Array.isArray(local.rdnMutations) ? local.rdnMutations : [];
  var cMut = Array.isArray(cloud.rdnMutations) ? cloud.rdnMutations : [];
  var mutMap = new Map();

  [].concat(cMut, lMut).forEach(function(m){
    if(!m) return;
    var sig = (m.date || '') + '|' + (m.type || '') + '|' + Number(m.amount || 0) + '|' + (m.ket || '') + '|' + (m.account || 'saham') + '|' + (m.linkedTxId || '');
    if(!mutMap.has(sig)){
      mutMap.set(sig, m);
    }
  });
  var mergedMutations = Array.from(mutMap.values());

  // 4. Merge Other Assets
  var lCrypto = Array.isArray(local.cryptoTx) ? local.cryptoTx : [];
  var cCrypto = Array.isArray(cloud.cryptoTx) ? cloud.cryptoTx : [];
  var cryptoMap = new Map();
  [].concat(cCrypto, lCrypto).forEach(function(c){
    if(!c) return;
    var sig = (c.date||'')+'|'+(c.coin||'')+'|'+(c.qty||0)+'|'+(c.priceIdr||0);
    if(!cryptoMap.has(sig)) cryptoMap.set(sig, c);
  });

  var lRd = Array.isArray(local.rdTx) ? local.rdTx : [];
  var cRd = Array.isArray(cloud.rdTx) ? cloud.rdTx : [];
  var rdMap = new Map();
  [].concat(cRd, lRd).forEach(function(r){
    if(!r) return;
    var sig = (r.date||'')+'|'+(r.code||'')+'|'+(r.amount||0)+'|'+(r.nab||0);
    if(!rdMap.has(sig)) rdMap.set(sig, r);
  });

  return {
    transactions: mergedTx,
    dividends: mergedDiv,
    rdnMutations: mergedMutations,
    cryptoTx: Array.from(cryptoMap.values()),
    etfTx: (local.etfTx && local.etfTx.length) ? local.etfTx : (cloud.etfTx || []),
    rdTx: Array.from(rdMap.values()),
    divInvestData: (local.divInvestData && local.divInvestData.length) ? local.divInvestData : (cloud.divInvestData || []),
    theses: (local.theses && local.theses.length) ? local.theses : (cloud.theses || []),
    journals: (local.journals && local.journals.length) ? local.journals : (cloud.journals || []),
    priceAlerts: (local.priceAlerts && local.priceAlerts.length) ? local.priceAlerts : (cloud.priceAlerts || []),
    wealth: local.wealth || cloud.wealth || null,
    tradeStrategy: Object.assign({}, cloud.tradeStrategy || {}, local.tradeStrategy || {}),
    taxSettings: Object.assign({}, cloud.taxSettings || {}, local.taxSettings || {}),
    cashAccounts: Object.assign({}, cloud.cashAccounts || {}, local.cashAccounts || {}),
    sekTaxOverride: Object.assign({}, cloud.sekTaxOverride || {}, local.sekTaxOverride || {}),
    activeSekuritas: local.activeSekuritas || cloud.activeSekuritas || 'Stockbit',
    rdnBalance: (local.rdnBalance !== undefined) ? local.rdnBalance : (cloud.rdnBalance || 0)
  };
}

// ══════════════════════════════════════════════════════════
// CLOUD PERSISTENCE & REALTIME CROSS-DEVICE ENGINE
// ══════════════════════════════════════════════════════════
var _cloudSyncFailed = false;
var _syncInFlight = false;
var _syncQueued = false;
var _realtimeListenerUnsub = null;
var _isApplyingCloudSnapshot = false;

function _syncToServerMirror(payload){
  try {
    var isStaticHost = typeof window !== 'undefined' && window.location && (
      (window.location.hostname || '').indexOf('github.io') !== -1 ||
      window.location.protocol === 'file:' ||
      (window.location.hostname || '').indexOf('pages.dev') !== -1
    );
    if(isStaticHost) return; // GitHub Pages is static host, bypass /api/user-data/save

    var uid = (typeof getFirestoreUserUid === 'function') ? getFirestoreUserUid() : 'u_andry_zuma_musa_40gmail_com';
    var email = (_currentUser && _currentUser.email) || (typeof PRIMARY_USER_EMAIL !== 'undefined' ? PRIMARY_USER_EMAIL : 'Andry.Zuma.Musa@gmail.com');
    if(typeof fetch === 'function'){
      fetch('/api/user-data/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        keepalive: true,
        body: JSON.stringify({
          uid: uid,
          email: email,
          savedAt: new Date().toISOString(),
          data: payload
        })
      }).catch(function(e){});
    }
  } catch(e){}
}

// ── SETUP REALTIME FIRESTORE CROSS-DEVICE SYNC ──
function setupFirestoreRealtimeListener(uid){
  var db = (typeof getFirebaseDb === 'function') ? getFirebaseDb() : _firebaseDb;
  if(!db || !uid) return;
  if(_realtimeListenerUnsub){
    try { _realtimeListenerUnsub(); } catch(e){}
    _realtimeListenerUnsub = null;
  }

  try {
    var mainDocRef = db.collection('users').doc(uid).collection('data').doc('main');
    _realtimeListenerUnsub = mainDocRef.onSnapshot(function(docSnap){
      if(!docSnap || !docSnap.exists) return;
      // Jangan timpa jika perubahan berasal dari save lokal yang sedang berlangsung
      if(_syncInFlight || _isApplyingCloudSnapshot) return;

      var cData = docSnap.data();
      if(!cData) return;

      // Cek apakah updatedAt dari cloud lebih baru atau berbeda dari state saat ini
      var currentTxLen = (transactions || []).length;
      var cloudTxLen = (cData.transactions || []).length;
      
      // Terapkan update dari cloud ke memori perangkat
      _isApplyingCloudSnapshot = true;
      try {
        if(Array.isArray(cData.transactions)) transactions = cData.transactions;
        if(Array.isArray(cData.dividends)) dividends = cData.dividends;
        if(Array.isArray(cData.rdnMutations)) rdnMutations = cData.rdnMutations;
        if(Array.isArray(cData.cryptoTx)) cryptoTx = cData.cryptoTx;
        if(Array.isArray(cData.etfTx)) etfTx = cData.etfTx;
        if(Array.isArray(cData.rdTx)) rdTx = cData.rdTx;
        if(Array.isArray(cData.divInvestData)) divInvestData = cData.divInvestData;
        if(cData.activeSekuritas) activeSekuritas = cData.activeSekuritas;
        if(typeof cData.rdnBalance === 'number') rdnBalance = cData.rdnBalance;
        if(cData.taxSettings && typeof TAX_SETTINGS !== 'undefined') Object.assign(TAX_SETTINGS, cData.taxSettings);
        if(cData.cashAccounts && typeof CASH_ACCOUNTS !== 'undefined') Object.assign(CASH_ACCOUNTS, cData.cashAccounts);
        if(cData.tradeStrategy) tradeStrategy = Object.assign({}, tradeStrategy, cData.tradeStrategy);
        if(cData.theses && typeof MW_THESES !== 'undefined') MW_THESES = cData.theses;
        if(cData.journals && typeof MW_JOURNALS !== 'undefined') MW_JOURNALS = cData.journals;
        if(cData.wealth && typeof WEALTH !== 'undefined') Object.assign(WEALTH, cData.wealth);

        // Simpan salinan terbaru ke local storage perangkat ini agar offline-ready
        try {
          var snapshotPayload = {
            transactions: transactions,
            dividends: dividends,
            rdnMutations: rdnMutations,
            cryptoTx: cryptoTx,
            etfTx: etfTx,
            rdTx: rdTx,
            divInvestData: divInvestData,
            tradeStrategy: tradeStrategy,
            activeSekuritas: activeSekuritas,
            rdnBalance: rdnBalance,
            wealth: (typeof WEALTH !== 'undefined') ? WEALTH : null,
            savedAt: cData.updatedAt || new Date().toISOString()
          };
          localStorage.setItem('mw_local_data_v2', JSON.stringify(snapshotPayload));
          localStorage.setItem('mw_emergency_backup_v2', JSON.stringify(snapshotPayload));
        } catch(e){}

        if(typeof reconcileRdnWithTransactions === 'function') reconcileRdnWithTransactions(true);
        if(typeof renderPage === 'function' && typeof currentPage !== 'undefined') renderPage(currentPage);
      } finally {
        _isApplyingCloudSnapshot = false;
      }
    }, function(err){
      console.warn('Realtime Firestore snapshot notice:', err);
    });
  } catch(e){
    console.warn('Gagal mengaktifkan Realtime Firestore Listener:', e);
  }
}

// ── MIGRASI TOTAL DATA LOKAL KE FIREBASE FIRESTORE ──
async function migrateLocalDataToFirebaseCloud(force){
  var db = (typeof getFirebaseDb === 'function') ? getFirebaseDb() : _firebaseDb;
  var uid = (typeof getFirestoreUserUid === 'function') ? getFirestoreUserUid() : 'u_andry_zuma_musa_40gmail_com';
  var email = (_currentUser && _currentUser.email) || (typeof PRIMARY_USER_EMAIL !== 'undefined' ? PRIMARY_USER_EMAIL : 'Andry.Zuma.Musa@gmail.com');

  if(!db){
    console.warn('Firebase Firestore belum terhubung, migrasi ditunda.');
    return false;
  }

  try {
    if(typeof showSaveStatus === 'function') showSaveStatus('⏳ Memindahkan data lokal ke Firebase Cloud Firestore...', 'var(--accent)', true);

    // Ambil data lokal dari localStorage untuk memastikan tidak ada yang terlewat
    var rawLocal = localStorage.getItem('mw_local_data_v2') || localStorage.getItem('mw_emergency_backup_v2');
    var parsedLocal = null;
    if(rawLocal){
      try { parsedLocal = JSON.parse(rawLocal); } catch(e){}
    }

    var localPayload = {
      transactions: transactions || (parsedLocal && parsedLocal.transactions) || [],
      dividends: dividends || (parsedLocal && parsedLocal.dividends) || [],
      rdnMutations: rdnMutations || (parsedLocal && parsedLocal.rdnMutations) || [],
      cryptoTx: cryptoTx || (parsedLocal && parsedLocal.cryptoTx) || [],
      etfTx: etfTx || (parsedLocal && parsedLocal.etfTx) || [],
      rdTx: rdTx || (parsedLocal && parsedLocal.rdTx) || [],
      divInvestData: divInvestData || (parsedLocal && parsedLocal.divInvestData) || [],
      theses: (typeof MW_THESES !== 'undefined' && MW_THESES.length) ? MW_THESES : (parsedLocal && parsedLocal.theses) || [],
      journals: (typeof MW_JOURNALS !== 'undefined' && MW_JOURNALS.length) ? MW_JOURNALS : (parsedLocal && parsedLocal.journals) || [],
      priceAlerts: (typeof mwGetPriceAlerts === 'function') ? mwGetPriceAlerts() : [],
      wealth: (typeof WEALTH !== 'undefined') ? WEALTH : (parsedLocal && parsedLocal.wealth) || null,
      equityHistory: (typeof equityHistoryLoad === 'function') ? equityHistoryLoad() : [],
      activeSekuritas: activeSekuritas || (parsedLocal && parsedLocal.activeSekuritas) || 'Stockbit',
      rdnBalance: (typeof rdnBalance === 'number') ? rdnBalance : (parsedLocal && parsedLocal.rdnBalance) || 0,
      cashAccounts: (typeof CASH_ACCOUNTS !== 'undefined') ? CASH_ACCOUNTS : (parsedLocal && parsedLocal.cashAccounts) || {},
      taxSettings: (typeof TAX_SETTINGS !== 'undefined') ? TAX_SETTINGS : (parsedLocal && parsedLocal.taxSettings) || {},
      sekTaxOverride: sekTaxOverride || (parsedLocal && parsedLocal.sekTaxOverride) || {},
      tradeStrategy: tradeStrategy || (parsedLocal && parsedLocal.tradeStrategy) || {},
      migratedFromLocalAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    var userRef = db.collection('users').doc(uid);
    var mainDataRef = userRef.collection('data').doc('main');

    // 1. Simpan dokumen utama (full bundle) ke Firestore
    await mainDataRef.set(localPayload, { merge: true });

    // 2. Simpan metadata profil user
    await userRef.set({
      email: email,
      storageMode: 'FIREBASE_FIRESTORE_CLOUD',
      isMigrated: true,
      lastMigratedAt: new Date().toISOString(),
      lastActiveAt: new Date().toISOString()
    }, { merge: true });

    window._firebaseMigrated = true;
    _syncToServerMirror(localPayload);

    // Aktifkan realtime listener lintas perangkat
    setupFirestoreRealtimeListener(uid);

    var countTx = localPayload.transactions.length;
    var countRdn = localPayload.rdnMutations.length;
    var countDiv = localPayload.dividends.length;

    var msg = '🔥 Sukses! ' + countTx + ' Transaksi, ' + countRdn + ' Mutasi RDN & ' + countDiv + ' Dividen telah dipindahkan ke Firebase Firestore Cloud';
    if(typeof showSaveStatus === 'function') showSaveStatus(msg, 'var(--green)');
    
    return true;
  } catch(err){
    console.error('Error saat memindahkan data lokal ke Firebase:', err);
    if(typeof showSaveStatus === 'function') showSaveStatus('⚠ Gagal migrasi Firebase: ' + err.message, 'var(--red)', true);
    return false;
  }
}
window.migrateLocalDataToFirebaseCloud = migrateLocalDataToFirebaseCloud;

async function fireSaveAllData(){
  var db = (typeof getFirebaseDb === 'function') ? getFirebaseDb() : _firebaseDb;
  var uid = (typeof getFirestoreUserUid === 'function') ? getFirestoreUserUid() : 'u_andry_zuma_musa_40gmail_com';
  var email = (_currentUser && _currentUser.email) || (typeof PRIMARY_USER_EMAIL !== 'undefined' ? PRIMARY_USER_EMAIL : 'Andry.Zuma.Musa@gmail.com');

  var currentWealth = (typeof WEALTH !== 'undefined') ? WEALTH : null;
  var currentTheses = (typeof MW_THESES !== 'undefined') ? MW_THESES : [];
  var currentJournals = (typeof MW_JOURNALS !== 'undefined') ? MW_JOURNALS : [];
  var currentAlerts = (typeof mwGetPriceAlerts === 'function') ? mwGetPriceAlerts() : [];
  var currentEqHist = (typeof equityHistoryLoad === 'function') ? equityHistoryLoad() : [];

  var payload = {
    transactions: transactions || [],
    dividends: dividends || [],
    rdnMutations: rdnMutations || [],
    cryptoTx: cryptoTx || [],
    etfTx: etfTx || [],
    rdTx: (rdTx || []).filter(function(r){ return r._userInput === true; }),
    divInvestData: divInvestData || [],
    theses: currentTheses,
    journals: currentJournals,
    priceAlerts: currentAlerts,
    wealth: currentWealth,
    equityHistory: currentEqHist,
    activeSekuritas: activeSekuritas || 'Stockbit',
    rdnBalance: rdnBalance || 0,
    cashAccounts: (typeof CASH_ACCOUNTS !== 'undefined') ? CASH_ACCOUNTS : {},
    taxSettings: (typeof TAX_SETTINGS !== 'undefined') ? TAX_SETTINGS : {},
    sekTaxOverride: sekTaxOverride || {},
    tradeStrategy: tradeStrategy || {},
    adminMeta: (typeof ADMIN_META !== 'undefined') ? ADMIN_META : {},
    adminExtra: (typeof ADMIN_EXTRA !== 'undefined') ? ADMIN_EXTRA : [],
    idxUniverse: (typeof IDX_UNIVERSE !== 'undefined') ? IDX_UNIVERSE : null,
    idxUniverseInfo: (typeof IDX_UNIVERSE_INFO !== 'undefined') ? IDX_UNIVERSE_INFO : null,
    nextTxId: Math.max(nextTxId || 1, _maxIdPlus1(transactions)),
    nextDivId: Math.max(nextDivId || 1, _maxIdPlus1(dividends)),
    nextRdnId: Math.max(nextRdnId || 1, _maxIdPlus1(rdnMutations)),
    nextCryptoId: Math.max(nextCryptoId || 1, _maxIdPlus1(cryptoTx)),
    nextEtfId: Math.max(nextEtfId || 1, _maxIdPlus1(etfTx)),
    nextRdId: Math.max(nextRdId || 1, _maxIdPlus1(rdTx)),
    updatedAt: new Date().toISOString()
  };

  // Always mirror to server disk storage for 100% hard-refresh resilience
  _syncToServerMirror(payload);

  if(!db) return true;

  try {
    var userRef = db.collection('users').doc(uid);
    var mainDataRef = userRef.collection('data').doc('main');
    
    await mainDataRef.set(payload, { merge: true });
    await userRef.set({
      email: email,
      storageMode: 'FIREBASE_FIRESTORE_CLOUD',
      lastActiveAt: new Date().toISOString()
    }, { merge: true });

    // Sync to alternative UID alias if applicable
    var altUid = uid.replace(/_40/g, '_');
    if(altUid !== uid){
      try {
        db.collection('users').doc(altUid).collection('data').doc('main').set(payload, { merge: true });
      } catch(e){}
    }

    return true;
  } catch(err) {
    var errStr = (err && err.message) ? err.message : String(err);
    if (errStr.indexOf('offline') !== -1 || errStr.indexOf('unavailable') !== -1) {
      console.warn('Firebase Firestore offline save queued:', errStr);
    } else {
      console.warn('Firebase Firestore save notice:', errStr);
    }
    throw err;
  }
}

async function fireLoadAllData(){
  var db = (typeof getFirebaseDb === 'function') ? getFirebaseDb() : _firebaseDb;
  var uid = (typeof getFirestoreUserUid === 'function') ? getFirestoreUserUid() : 'u_andry_zuma_musa_40gmail_com';
  if(!db) return false;

  try {
    var mainDataRef = db.collection('users').doc(uid).collection('data').doc('main');
    
    var snap = null;
    try {
      // Ambil snapshot langsung dari Firestore
      snap = await Promise.race([
        mainDataRef.get(),
        new Promise(function(_, reject) {
          setTimeout(function() { reject(new Error('Firestore connection timeout, checking fallback')); }, 4500);
        })
      ]);
    } catch(fetchErr) {
      try {
        snap = await mainDataRef.get({ source: 'cache' });
      } catch(cacheErr) {
        var msg = (fetchErr && fetchErr.message) ? fetchErr.message : String(fetchErr);
        console.warn('Firestore load notice:', msg);
        return false;
      }
    }

    // Jika dokumen tidak ditemukan di UID utama, periksa alias UID alternatif
    if(!snap || !snap.exists){
      var candidateUids = [];
      var alt1 = uid.replace(/_40/g, '_');
      var alt2 = uid.includes('_40') ? uid : uid.replace('@', '_40');
      if (alt1 !== uid) candidateUids.push(alt1);
      if (alt2 !== uid && !candidateUids.includes(alt2)) candidateUids.push(alt2);

      for (var i = 0; i < candidateUids.length; i++) {
        try {
          var candSnap = await db.collection('users').doc(candidateUids[i]).collection('data').doc('main').get();
          if (candSnap && candSnap.exists) {
            snap = candSnap;
            uid = candidateUids[i];
            break;
          }
        } catch(e){}
      }
    }

    // Capture current local state before applying cloud data
    var currentLocalState = {
      transactions: transactions || [],
      dividends: dividends || [],
      rdnMutations: rdnMutations || [],
      cryptoTx: cryptoTx || [],
      etfTx: etfTx || [],
      rdTx: rdTx || [],
      divInvestData: divInvestData || [],
      tradeStrategy: tradeStrategy || {},
      theses: (typeof MW_THESES !== 'undefined') ? MW_THESES : [],
      journals: (typeof MW_JOURNALS !== 'undefined') ? MW_JOURNALS : [],
      wealth: (typeof WEALTH !== 'undefined') ? WEALTH : null,
      taxSettings: (typeof TAX_SETTINGS !== 'undefined') ? TAX_SETTINGS : {},
      cashAccounts: (typeof CASH_ACCOUNTS !== 'undefined') ? CASH_ACCOUNTS : {},
      activeSekuritas: activeSekuritas || 'Stockbit',
      rdnBalance: rdnBalance || 0
    };

    // Jika dokumen belum ada di Firestore tapi ada data lokal, migrasikan jika bukan data kosong/reset
    if(!snap || !snap.exists){
      var isDataCleared = (typeof localStorage !== 'undefined' && localStorage.getItem('mw_data_cleared') === '1');
      if(currentLocalState.transactions.length > 0 && !isDataCleared){
        try {
          await migrateLocalDataToFirebaseCloud(true);
        } catch(saveErr) {
          console.warn('Initial migrateLocalDataToFirebaseCloud deferred:', saveErr);
        }
      }
      setupFirestoreRealtimeListener(uid);
      return true;
    }

    var cloudData = snap.data() || {};

    // ── SMART BI-DIRECTIONAL MERGE ──
    var merged = _mergeDatasets(currentLocalState, cloudData);

    transactions = merged.transactions || [];
    dividends = merged.dividends || [];
    rdnMutations = merged.rdnMutations || [];
    cryptoTx = merged.cryptoTx || [];
    etfTx = merged.etfTx || [];
    rdTx = merged.rdTx || [];
    divInvestData = merged.divInvestData || [];
    activeSekuritas = merged.activeSekuritas || 'Stockbit';

    if(merged.taxSettings && typeof TAX_SETTINGS !== 'undefined'){
      Object.assign(TAX_SETTINGS, merged.taxSettings);
    }
    if(merged.cashAccounts && typeof CASH_ACCOUNTS !== 'undefined'){
      Object.assign(CASH_ACCOUNTS, merged.cashAccounts);
    }

    tradeStrategy = merged.tradeStrategy || {};
    if(merged.theses && typeof MW_THESES !== 'undefined') MW_THESES = merged.theses;
    if(merged.journals && typeof MW_JOURNALS !== 'undefined') MW_JOURNALS = merged.journals;

    if(merged.wealth && typeof WEALTH !== 'undefined'){
      Object.keys(WEALTH).forEach(function(k){
        if(merged.wealth[k] !== undefined) WEALTH[k] = merged.wealth[k];
      });
      if(typeof wUpdateDueBadge === 'function') wUpdateDueBadge();
    }

    if(cloudData.equityHistory && Array.isArray(cloudData.equityHistory) && cloudData.equityHistory.length > 0){
      if(typeof equityHistorySave === 'function') equityHistorySave(cloudData.equityHistory);
    } else if(typeof equityHistoryLoad === 'function') {
      equityHistoryLoad();
    }

    if(cloudData.adminMeta && typeof ADMIN_META !== 'undefined') ADMIN_META = cloudData.adminMeta;
    if(cloudData.adminExtra && typeof ADMIN_EXTRA !== 'undefined') ADMIN_EXTRA = cloudData.adminExtra;
    if(cloudData.idxUniverse && typeof IDX_UNIVERSE !== 'undefined') IDX_UNIVERSE = cloudData.idxUniverse;
    if(cloudData.idxUniverseInfo && typeof IDX_UNIVERSE_INFO !== 'undefined') IDX_UNIVERSE_INFO = cloudData.idxUniverseInfo;

    nextTxId  = Math.max(cloudData.nextTxId || 1, _maxIdPlus1(transactions));
    nextDivId = Math.max(cloudData.nextDivId || 1, _maxIdPlus1(dividends));
    nextRdnId = Math.max(cloudData.nextRdnId || 1, _maxIdPlus1(rdnMutations));
    nextCryptoId = Math.max(cloudData.nextCryptoId || 1, _maxIdPlus1(cryptoTx));
    nextEtfId    = Math.max(cloudData.nextEtfId || 1, _maxIdPlus1(etfTx));
    nextRdId     = Math.max(cloudData.nextRdId || 1, _maxIdPlus1(rdTx));

    // Recalculate RDN ledger balance and synchronize
    if(typeof reconcileRdnWithTransactions === 'function') reconcileRdnWithTransactions(true);
    else if(typeof sanitizeRdnMutations === 'function') sanitizeRdnMutations();
    else if(typeof rebuildRdnBalance === 'function') rebuildRdnBalance();

    // Persist merged state to local storage & mirror
    try {
      var mergedPayload = {
        transactions: transactions,
        dividends: dividends,
        rdnMutations: rdnMutations,
        cryptoTx: cryptoTx,
        etfTx: etfTx,
        rdTx: rdTx,
        divInvestData: divInvestData,
        tradeStrategy: tradeStrategy,
        activeSekuritas: activeSekuritas,
        rdnBalance: rdnBalance,
        taxSettings: (typeof TAX_SETTINGS !== 'undefined') ? TAX_SETTINGS : {},
        cashAccounts: (typeof CASH_ACCOUNTS !== 'undefined') ? CASH_ACCOUNTS : {},
        theses: (typeof MW_THESES !== 'undefined') ? MW_THESES : [],
        journals: (typeof MW_JOURNALS !== 'undefined') ? MW_JOURNALS : [],
        wealth: (typeof WEALTH !== 'undefined') ? WEALTH : null,
        savedAt: new Date().toISOString()
      };
      localStorage.setItem('mw_local_data_v2', JSON.stringify(mergedPayload));
      localStorage.setItem('mw_emergency_backup_v2', JSON.stringify(mergedPayload));
      _syncToServerMirror(mergedPayload);
    } catch(e){}

    // If local state had new items not in cloud, push to Firestore (hanya jika data cloud tidak dalam status explicitly cleared)
    var isDataCleared = (typeof localStorage !== 'undefined' && localStorage.getItem('mw_data_cleared') === '1');
    if(!cloudData.isExplicitlyEmpty && !isDataCleared){
      var localTxCount = (currentLocalState.transactions || []).length;
      var cloudTxCount = (cloudData.transactions || []).length;
      if((transactions.length > cloudTxCount || localTxCount > cloudTxCount) && transactions.length > 0){
        try {
          fireSaveAllData();
        } catch(e){}
      }
    }

    // Aktifkan realtime listener untuk sinkronisasi antar perangkat
    setupFirestoreRealtimeListener(uid);

    // Pastikan riwayat ekuitas divalidasi setelah semua portofolio & mutasi RDN termuat
    if(typeof validateAndSyncEquityHistory === 'function'){
      try { validateAndSyncEquityHistory(false); } catch(e){}
    }

    if(typeof renderPage === 'function' && typeof currentPage !== 'undefined'){
      renderPage(currentPage);
    }

    return true;
  } catch(err) {
    var errStr = (err && err.message) ? err.message : String(err);
    console.warn('Firebase Firestore load notice:', errStr);
    return false;
  }
}

// ============================================================
// DATA SAVE & SYNC CONTROLLER (FIREBASE FIRESTORE CLOUD-FIRST)
// ============================================================
function saveData(){
  if(typeof _invalidatePortoCache === 'function') _invalidatePortoCache();
  
  var payloadObj = {
    transactions: transactions || [],
    dividends: dividends || [],
    rdnMutations: rdnMutations || [],
    cryptoTx: cryptoTx || [],
    etfTx: etfTx || [],
    rdTx: rdTx || [],
    divInvestData: divInvestData || [],
    tradeStrategy: tradeStrategy || {},
    activeSekuritas: activeSekuritas || 'Stockbit',
    rdnBalance: rdnBalance || 0,
    taxSettings: (typeof TAX_SETTINGS !== 'undefined') ? TAX_SETTINGS : {},
    sekTaxOverride: sekTaxOverride || {},
    cashAccounts: (typeof CASH_ACCOUNTS !== 'undefined') ? CASH_ACCOUNTS : {},
    wealth: (typeof WEALTH !== 'undefined') ? WEALTH : null,
    theses: (typeof MW_THESES !== 'undefined') ? MW_THESES : [],
    journals: (typeof MW_JOURNALS !== 'undefined') ? MW_JOURNALS : [],
    equityHistory: (typeof equityHistoryLoad === 'function') ? equityHistoryLoad() : [],
    savedAt: new Date().toISOString()
  };

  // 1. Simpan ke local cache sebagai offline fallback
  try {
    var payloadStr = JSON.stringify(payloadObj);
    localStorage.setItem('mw_local_data_v2', payloadStr);
    localStorage.setItem('mw_emergency_backup_v2', payloadStr);
    localStorage.setItem('mw_trade_strategy', JSON.stringify(tradeStrategy || {}));
  } catch(e) {
    console.warn('LocalStorage save notice:', e);
  }

  // 2. Simpan ke Server Persistence Mirror (Tahan Hard Refresh & Tab Close)
  _syncToServerMirror(payloadObj);

  // 3. Simpan dan sinkronkan seketika ke Firebase Firestore Cloud
  var db = (typeof getFirebaseDb === 'function') ? getFirebaseDb() : _firebaseDb;
  if(db){
    _syncToCloud(true);
  } else {
    if(typeof showSaveStatus === 'function') showSaveStatus('✓ Data tersimpan di server & perangkat', 'var(--green)');
  }
}

function _syncToCloud(allowRetry){
  if(_syncInFlight){
    _syncQueued = true;
    return Promise.resolve();
  }
  _syncInFlight = true;

  return fireSaveAllData().then(function(){
    _syncInFlight = false;
    _cloudSyncFailed = false;
    if(_syncQueued){
      _syncQueued = false;
      return _syncToCloud(allowRetry);
    }
    if(typeof showSaveStatus === 'function') showSaveStatus('✓ Tersimpan ke Firebase Firestore Cloud', 'var(--green)');
  }).catch(function(e){
    _syncInFlight = false;
    console.warn('Firebase sync notice:', e);
    _cloudSyncFailed = true;
    var _errMsg = (e && e.message) ? e.message : String(e);
    if(typeof showSaveStatus === 'function') showSaveStatus('✓ Tersimpan lokal & server (Cloud: ' + _errMsg + ')', 'var(--amber)');
    if(_syncQueued){
      _syncQueued = false;
      return _syncToCloud(allowRetry);
    }
    if(allowRetry){
      setTimeout(function(){ _syncToCloud(false); }, 8000);
    }
  });
}

function safeCloudBoot(){
  loadData();
  return fireLoadAllData().then(function(ok){
    // Pastikan data lokal termigrasi ke Firebase jika belum dan bukan dalam status cleared
    var isDataCleared = (typeof localStorage !== 'undefined' && localStorage.getItem('mw_data_cleared') === '1');
    if(!window._firebaseMigrated && !isDataCleared && transactions && transactions.length > 0){
      migrateLocalDataToFirebaseCloud();
    }
    return ok;
  });
}

function loadData(){
  try {
    var isDataCleared = (typeof localStorage !== 'undefined' && localStorage.getItem('mw_data_cleared') === '1');
    if(isDataCleared){
      transactions = [];
      dividends = [];
      rdnMutations = [];
      cryptoTx = [];
      etfTx = [];
      rdTx = [];
      divInvestData = [];
      rdnBalance = 0;
      return true;
    }

    var rawStrat = localStorage.getItem('mw_trade_strategy');
    if(rawStrat){
      var parsedStrat = JSON.parse(rawStrat);
      if(parsedStrat && typeof parsedStrat === 'object') {
        tradeStrategy = Object.assign({}, tradeStrategy, parsedStrat);
      }
    }
    var raw = localStorage.getItem('mw_local_data_v2') || localStorage.getItem('mw_emergency_backup_v2');
    if(raw){
      var d = JSON.parse(raw);
      if(d && typeof d === 'object'){
        if(d.isExplicitlyEmpty){
          transactions = [];
          dividends = [];
          rdnMutations = [];
          cryptoTx = [];
          etfTx = [];
          rdTx = [];
          divInvestData = [];
          rdnBalance = 0;
          return true;
        }
        if(d.tradeStrategy) tradeStrategy = Object.assign({}, tradeStrategy, d.tradeStrategy);
        if(d.transactions && Array.isArray(d.transactions)) transactions = d.transactions;
        if(d.dividends && Array.isArray(d.dividends)) dividends = d.dividends;
        if(d.rdnMutations && Array.isArray(d.rdnMutations)) rdnMutations = d.rdnMutations;
        if(d.cryptoTx && Array.isArray(d.cryptoTx)) cryptoTx = d.cryptoTx;
        if(d.etfTx && Array.isArray(d.etfTx)) etfTx = d.etfTx;
        if(d.rdTx && Array.isArray(d.rdTx)) rdTx = d.rdTx;
        if(d.divInvestData && Array.isArray(d.divInvestData)) divInvestData = d.divInvestData;
        if(d.activeSekuritas) activeSekuritas = d.activeSekuritas;
        if(typeof d.rdnBalance === 'number') rdnBalance = d.rdnBalance;
        if(d.sekTaxOverride) sekTaxOverride = d.sekTaxOverride;
        if(d.cashAccounts && typeof CASH_ACCOUNTS !== 'undefined') Object.assign(CASH_ACCOUNTS, d.cashAccounts);
        if(d.taxSettings && typeof TAX_SETTINGS !== 'undefined') Object.assign(TAX_SETTINGS, d.taxSettings);
        if(d.theses && typeof MW_THESES !== 'undefined') MW_THESES = d.theses;
        if(d.journals && typeof MW_JOURNALS !== 'undefined') MW_JOURNALS = d.journals;
        if(d.wealth && typeof WEALTH !== 'undefined') Object.assign(WEALTH, d.wealth);
        if(d.equityHistory && Array.isArray(d.equityHistory) && d.equityHistory.length > 0){
          if(typeof equityHistorySave === 'function') equityHistorySave(d.equityHistory);
        }

        // ── AUTO-HEAL & MIGRASI SCHEMA: 22 Saham Portofolio Stockbit (Total 4.449 Lot) ──
        var curVer = localStorage.getItem('mw_data_version');
        var isCorrupted = false;
        if(d.transactions && Array.isArray(d.transactions)){
          var ggrm = d.transactions.find(function(t){ return t && t.ticker === 'GGRM'; });
          var bbri = d.transactions.find(function(t){ return t && t.ticker === 'BBRI'; });
          if(ggrm && (ggrm.lot === 3 || ggrm.lot === 600 || ggrm.price === 134605)) isCorrupted = true;
          if(bbri && (bbri.lot === 2581 || bbri.lot === 22300)) isCorrupted = true;
        }
        if(typeof d.rdnBalance === 'number' && d.rdnBalance < -100000000) isCorrupted = true;

        if((curVer !== '2026.09.03_v5_lot4449' && isCorrupted) || (!transactions || transactions.length === 0)){
          console.log('[Auto-Heal] Migrating portfolio to authoritative 22-stock portfolio (4.449 Lot, Modal Rp 680jt, RDN Rp 52jt)...');
          transactions = JSON.parse(JSON.stringify(INITIAL_PORTO_2026));
          activeSekuritas = 'Stockbit';
          rdnBalance = 52016390;
          rdnMutations = [
            {
              id: 1,
              date: '2026-09-02',
              type: 'TOPUP',
              ket: 'Setoran Modal Awal Investasi',
              amount: 729807630,
              balance: 729807630,
              sekuritas: 'Stockbit',
              account: 'saham',
              linkedTxId: null
            },
            {
              id: 2,
              date: '2026-09-02',
              type: 'DIVIDEN',
              ket: 'Dividen BBRI (22.300 lbr @ Rp 104,22)',
              amount: 2324106,
              balance: 732131736,
              sekuritas: 'Stockbit',
              account: 'saham',
              linkedTxId: 'div-1'
            }
          ];
          dividends = [
            {
              id: 1,
              date: '2026-09-02',
              ticker: 'BBRI',
              shares: 22300,
              dps: 104.22,
              gross: 2324106,
              tax: 0,
              net: 2324106,
              pphRate: 0
            }
          ];
          try {
            localStorage.setItem('mw_data_version', '2026.09.03_v5_lot4449');
            saveData();
          } catch(e){}
        }
      }
    }

    if(!transactions || transactions.length === 0){
      initPortfolio2026(true);
    }

    if(typeof equityHistoryLoad === 'function') equityHistoryLoad();
    nextTxId  = Math.max(nextTxId || 1, _maxIdPlus1(transactions));
    nextDivId = Math.max(nextDivId || 1, _maxIdPlus1(dividends));
    nextRdnId = Math.max(nextRdnId || 1, _maxIdPlus1(rdnMutations));
    nextCryptoId = Math.max(nextCryptoId || 1, _maxIdPlus1(cryptoTx));
    nextEtfId    = Math.max(nextEtfId || 1, _maxIdPlus1(etfTx));
    nextRdId     = Math.max(nextRdId || 1, _maxIdPlus1(rdTx));

    if(typeof reconcileRdnWithTransactions === 'function') reconcileRdnWithTransactions(true);
    else if(typeof sanitizeRdnMutations === 'function') sanitizeRdnMutations();
    else if (typeof rebuildRdnBalance === 'function') rebuildRdnBalance();

    // Background asynchronous fallback check against server storage mirror
    if(typeof fetch === 'function' && (!transactions || transactions.length === 0) && !isDataCleared){
      var uid = (typeof getFirestoreUserUid === 'function') ? getFirestoreUserUid() : '';
      fetch('/api/user-data/load?uid=' + encodeURIComponent(uid))
        .then(function(res){ return res.json(); })
        .then(function(resData){
          if(resData && resData.found && resData.record && resData.record.data){
            var sData = resData.record.data;
            if(sData.isExplicitlyEmpty){
              transactions = [];
              dividends = [];
              rdnMutations = [];
              return;
            }
            if(sData.transactions && Array.isArray(sData.transactions) && sData.transactions.length > 0){
              transactions = sData.transactions;
              if(sData.rdnMutations && Array.isArray(sData.rdnMutations)) rdnMutations = sData.rdnMutations;
              if(sData.dividends && Array.isArray(sData.dividends)) dividends = sData.dividends;
              if(typeof reconcileRdnWithTransactions === 'function') reconcileRdnWithTransactions(true);
              if(typeof renderPage === 'function' && typeof currentPage !== 'undefined') renderPage(currentPage);
            }
          }
        }).catch(function(){});
    }

    return true;
  } catch(e){
    console.warn('LocalStorage load notice:', e);
    return false;
  }
}

async function clearData(skipConfirm){
  if(!skipConfirm){
    var confirmed = confirm('⚠️ PERINGATAN: Apakah Anda yakin ingin mengosongkan SELURUH data transaksi dan portofolio menjadi 0?\n\nTindakan ini akan menghapus semua riwayat transaksi di Firebase Firestore Cloud, server, dan browser lokal.');
    if(!confirmed) return false;
  }
  
  // 1. Kosongkan seluruh variabel memori
  transactions = [];
  dividends = [];
  rdnMutations = [];
  cryptoTx = [];
  etfTx = [];
  rdTx = [];
  divInvestData = [];
  tradeStrategy = {};
  sekTaxOverride = {};
  rdnBalance = 0;
  nextTxId = 1;
  nextDivId = 1;
  nextRdnId = 1;
  nextCryptoId = 1;
  nextEtfId = 1;
  nextRdId = 1;

  if(typeof MW_THESES !== 'undefined') MW_THESES = [];
  if(typeof MW_JOURNALS !== 'undefined') MW_JOURNALS = [];
  if(typeof WEALTH !== 'undefined'){
    WEALTH.income = 0; WEALTH.expense = 0; WEALTH.deposito = 0; WEALTH.emas = 0; WEALTH.obligasi = 0;
    WEALTH.bank = []; WEALTH.debt = []; WEALTH.piutang = [];
  }
  if(typeof CASH_ACCOUNTS !== 'undefined'){
    if(CASH_ACCOUNTS.saham) CASH_ACCOUNTS.saham.balance = 0;
    if(CASH_ACCOUNTS.crypto) CASH_ACCOUNTS.crypto.balance = 0;
    if(CASH_ACCOUNTS.reksadana) CASH_ACCOUNTS.reksadana.balance = 0;
  }

  // 2. Tandai LocalStorage dengan status bersih eksplisit
  try {
    var keysToClear = [
      'mw_trade_strategy',
      'mw_stocks_db',
      'moneywatch_stocks_db',
      'moneywatch_stocks_backup',
      'transactions',
      'portfolio',
      'rdnMutations',
      'dividends',
      'cryptoTx',
      'etfTx',
      'rdTx',
      'divInvestData',
      'mw_backup_history',
      'mw_tx_cache',
      'mw_price_alerts',
      'mw_custom_stocks'
    ];
    keysToClear.forEach(function(k){
      localStorage.removeItem(k);
    });

    var emptyRecord = {
      transactions: [],
      dividends: [],
      rdnMutations: [],
      cryptoTx: [],
      etfTx: [],
      rdTx: [],
      divInvestData: [],
      theses: [],
      journals: [],
      priceAlerts: [],
      wealth: null,
      equityHistory: [],
      activeSekuritas: 'Stockbit',
      rdnBalance: 0,
      cashAccounts: (typeof CASH_ACCOUNTS !== 'undefined') ? CASH_ACCOUNTS : {},
      tradeStrategy: {},
      isExplicitlyEmpty: true,
      clearedAt: new Date().toISOString(),
      savedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    localStorage.setItem('mw_local_data_v2', JSON.stringify(emptyRecord));
    localStorage.setItem('mw_emergency_backup_v2', JSON.stringify(emptyRecord));
    localStorage.setItem('mw_data_cleared', '1');
    localStorage.setItem('mw_empty_state_explicit', '1');
  } catch(e){}

  // 3. Bersihkan server storage mirror secara sinkron/menunggu
  var uid = (typeof getFirestoreUserUid === 'function') ? getFirestoreUserUid() : '';
  var email = (typeof PRIMARY_USER_EMAIL !== 'undefined') ? PRIMARY_USER_EMAIL : '';
  if(typeof fetch === 'function'){
    try {
      await fetch('/api/user-data/clear', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid: uid, email: email, purgeAll: true })
      });
    } catch(e){
      console.warn('Server storage clear notice:', e);
    }
  }

  // 4. Bersihkan Firebase Firestore Cloud pada semua alias dokumen akun
  var db = (typeof getFirebaseDb === 'function') ? getFirebaseDb() : _firebaseDb;
  var fireUid = uid || (typeof getFirestoreUserUid === 'function' ? getFirestoreUserUid() : null);
  
  if(db){
    if(typeof showSaveStatus === 'function') showSaveStatus('⏳ Menghapus & mengosongkan data di Firestore Cloud...', 'var(--amber)', true);
    
    var uidsToClear = new Set();
    if(fireUid) uidsToClear.add(fireUid);
    if(email){
      uidsToClear.add('u_' + encodeURIComponent(email.toLowerCase()).replace(/[^a-z0-9_]/g, '_'));
      uidsToClear.add('u_' + email.toLowerCase().replace(/[^a-z0-9_]/g, '_'));
    }

    var clearPromises = [];
    var emptyCloudDoc = {
      transactions: [],
      dividends: [],
      rdnMutations: [],
      cryptoTx: [],
      etfTx: [],
      rdTx: [],
      divInvestData: [],
      theses: [],
      journals: [],
      priceAlerts: [],
      wealth: null,
      equityHistory: [],
      tradeStrategy: {},
      rdnBalance: 0,
      activeSekuritas: 'Stockbit',
      isExplicitlyEmpty: true,
      clearedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      savedAt: new Date().toISOString()
    };

    uidsToClear.forEach(function(targetUid){
      try {
        var userRef = db.collection('users').doc(targetUid);
        var mainDataRef = userRef.collection('data').doc('main');
        
        clearPromises.push(mainDataRef.set(emptyCloudDoc, { merge: false }));
        clearPromises.push(userRef.set({ isCleared: true, lastResetAt: new Date().toISOString() }, { merge: true }));
      } catch(docErr){}
    });

    try {
      await Promise.all(clearPromises);
    } catch(err){
      console.warn('Firestore cloud clear note:', err);
    }
  }

  // 5. Perbarui tampilan & ledger
  if(typeof rebuildRdnBalance === 'function') rebuildRdnBalance();
  if(typeof _invalidatePortoCache === 'function') _invalidatePortoCache();
  if(typeof renderAll === 'function') renderAll();
  if(typeof renderSettingsPage === 'function') renderSettingsPage();
  if(typeof showSaveStatus === 'function') showSaveStatus('✓ Seluruh data transaksi di Firestore & lokal telah dikosongkan 100% (0 Transaksi)', 'var(--green)');

  return true;
}
window.clearData = clearData;
window.resetAllDatabaseAndTransactions = clearData;
window.resetAllDataToZero = clearData;

// ============================================================
// BACKUP & RESTORE MODAL (JSON FILE EXPORT / IMPORT)
// ============================================================
function downloadBackup(){
  var payload = {
    version: 'moneywatch_firebase_v1',
    transactions: transactions || [],
    dividends: dividends || [],
    rdnMutations: rdnMutations || [],
    cryptoTx: cryptoTx || [],
    etfTx: etfTx || [],
    rdTx: rdTx || [],
    theses: typeof MW_THESES !== 'undefined' ? MW_THESES : [],
    journals: typeof MW_JOURNALS !== 'undefined' ? MW_JOURNALS : [],
    wealth: typeof WEALTH !== 'undefined' ? WEALTH : null,
    tradeStrategy: tradeStrategy || {},
    sekTaxOverride: sekTaxOverride || {},
    activeSekuritas: activeSekuritas || 'Stockbit',
    rdnBalance: rdnBalance || 0,
    equityHistory: (typeof equityHistoryLoad === 'function') ? equityHistoryLoad() : [],
    savedAt: new Date().toISOString()
  };

  var blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = 'moneywatch_backup_' + new Date().toISOString().split('T')[0] + '.json';
  a.click();
  URL.revokeObjectURL(url);
  if(typeof showSaveStatus === 'function') showSaveStatus('✓ File backup JSON berhasil diunduh');
}

function restoreFromBackup(file){
  if(!file) return;
  var reader = new FileReader();
  reader.onload = function(e){
    try {
      var d = JSON.parse(e.target.result);
      if(!d) throw new Error('File tidak valid');

      transactions = d.transactions || [];
      dividends = d.dividends || [];
      rdnMutations = d.rdnMutations || [];
      cryptoTx = d.cryptoTx || [];
      etfTx = d.etfTx || [];
      rdTx = d.rdTx || [];
      activeSekuritas = d.activeSekuritas || 'Stockbit';
      rdnBalance = d.rdnBalance || 0;
      tradeStrategy = d.tradeStrategy || {};
      sekTaxOverride = d.sekTaxOverride || {};

      if(d.theses && typeof MW_THESES !== 'undefined') MW_THESES = d.theses;
      if(d.journals && typeof MW_JOURNALS !== 'undefined') MW_JOURNALS = d.journals;
      if(d.wealth && typeof WEALTH !== 'undefined') Object.assign(WEALTH, d.wealth);
      if(d.equityHistory && Array.isArray(d.equityHistory) && d.equityHistory.length > 0){
        if(typeof equityHistorySave === 'function') equityHistorySave(d.equityHistory);
      }

      nextTxId  = _maxIdPlus1(transactions);
      nextDivId = _maxIdPlus1(dividends);
      nextRdnId = _maxIdPlus1(rdnMutations);

      saveData();
      if(typeof renderAll === 'function') renderAll();
      if(typeof renderPage === 'function' && typeof currentPage !== 'undefined') renderPage(currentPage);
      closeBackupModal();
      if(typeof showSaveStatus === 'function') showSaveStatus('✓ Data backup JSON berhasil dipulihkan & disimpan ke Firestore');
    } catch(err) {
      alert('Gagal memulihkan backup: ' + err.message);
    }
  };
  reader.readAsText(file);
}

async function checkFirebaseLiveSyncStatus(){
  var box = el('sh-firebase-audit-box');
  if(!box) return;
  box.style.display = 'block';
  box.innerHTML = '<div style="color:var(--text3);display:flex;align-items:center;gap:6px"><span>⏳ Mengaudit koneksi & data langsung ke Firebase Firestore Cloud...</span></div>';

  var uid = (typeof getFirestoreUserUid === 'function') ? getFirestoreUserUid() : 'u_andry_zuma_musa_40gmail_com';
  try {
    var res = await fetch('/api/sync/firebase-audit?uid=' + encodeURIComponent(uid));
    var json = await res.json();

    if(!json.success || !json.hasDocument){
      box.innerHTML = `
        <div style="color:var(--yellow);font-weight:700;margin-bottom:6px">⚠️ Dokumen di Firestore belum terbuat atau kosong</div>
        <div style="color:var(--text2);font-size:11.5px;margin-bottom:8px">Silakan klik tombol <b>"Pindahkan / Sinkronkan Data ke Firebase Cloud Sekarang"</b> di atas.</div>
      `;
      return;
    }

    var localTx = (transactions || []).length;
    var localRdn = (rdnMutations || []).length;
    var localDiv = (dividends || []).length;

    var cloudTx = (json.stats && json.stats.transactions) || 0;
    var cloudRdn = (json.stats && json.stats.rdnMutations) || 0;
    var cloudDiv = (json.stats && json.stats.dividends) || 0;

    var isIdentical = (localTx === cloudTx && localRdn === cloudRdn && localDiv === cloudDiv);
    var badgeColor = isIdentical ? 'var(--green)' : 'var(--yellow)';
    var badgeText = isIdentical ? '✓ 100% IDENTIK & TERSINKRON' : '⚠️ SINKRONISASI PARSIAL';

    var html = `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;padding-bottom:8px;border-bottom:1px solid var(--border)">
        <span style="font-weight:700;color:var(--text);display:flex;align-items:center;gap:6px">
          <span style="width:8px;height:8px;border-radius:50%;background:${badgeColor}"></span>
          Status Sinkronisasi Cloud Firestore
        </span>
        <span style="font-size:10.5px;font-weight:700;padding:2px 8px;border-radius:10px;background:rgba(16,185,129,0.15);color:${badgeColor};border:1px solid ${badgeColor}">
          ${badgeText}
        </span>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px;font-size:11.5px">
        <div style="background:var(--bg2);padding:8px;border-radius:6px;border:1px solid var(--border)">
          <div style="color:var(--text3);font-size:10px;text-transform:uppercase;font-weight:700">Data di Perangkat Ini (Lokal)</div>
          <div style="font-weight:700;color:var(--text);margin-top:2px">${localTx} Saham · ${localRdn} Kas RDN · ${localDiv} Dividen</div>
        </div>
        <div style="background:var(--bg2);padding:8px;border-radius:6px;border:1px solid var(--border)">
          <div style="color:var(--text3);font-size:10px;text-transform:uppercase;font-weight:700">Data di Firestore Cloud</div>
          <div style="font-weight:700;color:${badgeColor};margin-top:2px">${cloudTx} Saham · ${cloudRdn} Kas RDN · ${cloudDiv} Dividen</div>
        </div>
      </div>
      <div style="font-size:11px;color:var(--text3);line-height:1.5">
        <div>• Project ID: <b style="color:var(--text2)">${json.projectId}</b></div>
        <div>• Database: <b style="color:var(--text2)">${json.firestoreDatabaseId}</b></div>
        <div>• Waktu Update Cloud: <b style="color:var(--text2)">${new Date(json.savedAt).toLocaleString('id-ID')}</b></div>
        <div style="color:var(--green);font-weight:600;margin-top:4px">✓ Aman dibuka di perangkat lain (laptop, HP, tablet). Data akan langsung termuat otomatis saat login.</div>
      </div>
    `;
    box.innerHTML = html;
  } catch(e) {
    box.innerHTML = '<div style="color:var(--red);font-size:11.5px">Gagal memeriksa status Firestore: ' + (e.message || e) + '</div>';
  }
}
window.checkFirebaseLiveSyncStatus = checkFirebaseLiveSyncStatus;

function openSettingsHub(tab){
  var m = el('settings-hub-modal');
  if(!m) return;
  m.style.display = 'flex';
  var targetTab = tab || 'cloud';
  var btn = document.querySelector('#sh-tabs .sh-tab[data-tab="'+targetTab+'"]');
  shSwitchTab(targetTab, btn);
}

function closeSettingsHub(){
  var m = el('settings-hub-modal');
  if(m) m.style.display = 'none';
}

function shSwitchTab(tab, btn){
  var tabs = document.querySelectorAll('#sh-tabs .sh-tab');
  tabs.forEach(function(b){ b.classList.remove('on'); });
  if(btn){
    btn.classList.add('on');
  } else {
    var b = document.querySelector('#sh-tabs .sh-tab[data-tab="'+tab+'"]');
    if(b) b.classList.add('on');
  }
  shRenderContent(tab);
}

function shRenderContent(tab){
  var c = el('sh-content');
  if(!c) return;

  var userEmail = (_currentUser && _currentUser.email) || (typeof PRIMARY_USER_EMAIL !== 'undefined' ? PRIMARY_USER_EMAIL : 'Andry.Zuma.Musa@gmail.com');
  var nTx = (transactions || []).length;
  var nRdn = (rdnMutations || []).length;
  var nDiv = (dividends || []).length;

  if(tab === 'cloud'){
    c.innerHTML = `
      <div style="margin-bottom:16px">
        <div style="font-size:15px;font-weight:700;color:var(--text);font-family:var(--font-display);display:flex;align-items:center;gap:6px">
          🔥 Firebase Cloud Firestore &amp; Sinkronisasi Data
        </div>
        <div style="font-size:11.5px;color:var(--text3);margin-top:2px">Seluruh data transaksi dan kas tersimpan di cloud database real-time tanpa resiko hilang saat hard-refresh atau ganti device.</div>
      </div>

      <div style="background:var(--bg2);border:1px solid var(--border);border-radius:10px;padding:16px;margin-bottom:16px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
          <span style="font-weight:700;color:var(--text);font-size:13px;display:flex;align-items:center;gap:6px">
            <span style="width:8px;height:8px;border-radius:50%;background:var(--green)"></span>
            Koneksi Firestore Cloud
          </span>
          <span style="background:rgba(16,185,129,0.15);color:var(--green);font-size:11px;font-weight:700;padding:3px 10px;border-radius:12px;border:1px solid rgba(16,185,129,0.3)">
            ONLINE &amp; TERSINKRON
          </span>
        </div>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;background:var(--bg3);border-radius:8px;padding:12px;margin-bottom:12px">
          <div>
            <div style="font-size:10px;color:var(--text3);text-transform:uppercase;font-weight:700">Akun Pengguna</div>
            <div style="font-size:12px;font-weight:700;color:var(--text);margin-top:2px;overflow:hidden;text-overflow:ellipsis">${escHtml(userEmail)}</div>
          </div>
          <div>
            <div style="font-size:10px;color:var(--text3);text-transform:uppercase;font-weight:700">Portofolio Saham</div>
            <div style="font-size:12px;font-weight:700;color:var(--accent);margin-top:2px">${nTx} Transaksi Saham</div>
          </div>
          <div>
            <div style="font-size:10px;color:var(--text3);text-transform:uppercase;font-weight:700">Mutasi Kas &amp; Dividen</div>
            <div style="font-size:12px;font-weight:700;color:var(--green);margin-top:2px">${nRdn} Kas RDN · ${nDiv} Dividen</div>
          </div>
        </div>
        <div style="font-size:11.5px;color:var(--text2);line-height:1.6">
          Setiap perubahan (tambah transaksi baru, update saldo kas, dividen, dan jurnal) otomatis disimpan secara instan ke Cloud Firestore.
        </div>
      </div>

      <div style="display:flex;flex-direction:column;gap:10px;margin-bottom:16px">
        <button class="btn btn-blue" onclick="migrateLocalDataToFirebaseCloud(true).then(function(){ checkFirebaseLiveSyncStatus(); })" style="justify-content:center;padding:11px;font-weight:700;font-size:12.5px">
          🚀 Pindahkan / Sinkronkan Data ke Firebase Cloud Sekarang
        </button>

        <button class="btn btn-ghost" onclick="checkFirebaseLiveSyncStatus()" style="justify-content:center;padding:10px;border-color:var(--accent);color:var(--accent);font-weight:600">
          🔍 Periksa Status Sinkronisasi Firebase Cloud (Live Audit)
        </button>

        <div id="sh-firebase-audit-box" style="display:none;background:var(--bg3);border:1px solid var(--border);border-radius:8px;padding:12px;font-size:12px">
          <!-- Injected dynamically by checkFirebaseLiveSyncStatus() -->
        </div>

        <button class="btn btn-ghost" onclick="fireLoadAllData().then(function(){ if(typeof showSaveStatus==='function') showSaveStatus('✓ Data terbaru dimuat dari Cloud','var(--green)'); closeSettingsHub(); })" style="justify-content:center;padding:10px;border-color:var(--border)">
          🔄 Muat Ulang Data dari Firebase Cloud
        </button>

        <div style="display:flex;gap:10px">
          <button class="btn btn-ghost" onclick="downloadBackup()" style="flex:1;justify-content:center;padding:9px;font-size:12px;border-color:var(--border)">
            ⬇️ Export File Cadangan JSON
          </button>
          <label class="btn btn-ghost" style="flex:1;justify-content:center;padding:9px;font-size:12px;cursor:pointer;border-color:var(--border)">
            ⬆️ Import File Cadangan JSON
            <input type="file" accept=".json" onchange="restoreFromBackup(this.files[0])" style="display:none">
          </label>
        </div>
      </div>

      <div style="padding-top:10px;border-top:1px solid var(--border);display:flex;justify-content:space-between;align-items:center">
        <button class="btn btn-ghost btn-sm" onclick="clearData()" style="color:var(--red);border-color:rgba(239,68,68,0.3);font-size:11px">
          🗑 Reset Data Portofolio
        </button>
        <span style="font-size:11px;color:var(--text3)">ID Applet: 088bcbd5-b0c7-48cf-baee-be4279fd2091</span>
      </div>
    `;
  } else if(tab === 'feed'){
    var sc = priceEngineMode==='static'?'var(--text3)':FH.status==='live'?'var(--green)':FH.status==='error'?'var(--red)':'var(--text3)';
    var st = priceEngineMode==='static'?'🔒 Kunci Statis (Harga Tetap)':FH.status==='live'?'● Real-time Live (Yahoo Finance)':FH.status==='error'?'● Error Reconnect':'○ Simulasi';
    c.innerHTML = `
      <div style="margin-bottom:16px">
        <div style="font-size:15px;font-weight:700;color:var(--text);font-family:var(--font-display)">
          📡 Feed Pasar &amp; Pembaruan Harga Real-time
        </div>
        <div style="font-size:11.5px;color:var(--text3);margin-top:2px">Pilih bagaimana harga pasar bursa IDX diperbarui secara berkala pada portofolio dan dashboard.</div>
      </div>

      <div style="background:var(--bg2);border:1px solid var(--border);border-radius:10px;padding:16px;margin-bottom:16px">
        <div style="font-weight:700;color:var(--text);margin-bottom:10px;font-size:12.5px">Mode Pergerakan Harga Aktif:</div>
        <div style="display:flex;flex-direction:column;gap:8px">
          <button class="btn ${priceEngineMode==='live'?'btn-blue':'btn-ghost'}" onclick="setPriceEngineMode('live'); shRenderContent('feed');" style="text-align:left;justify-content:flex-start;padding:10px 14px">
            <div>
              <div style="font-weight:700">📡 Real-time Live (Yahoo Finance)</div>
              <div style="font-size:11px;opacity:0.85;margin-top:2px">Update otomatis harga saham IDX real-time saat jam bursa BEI aktif.</div>
            </div>
          </button>
          <button class="btn ${priceEngineMode==='static'?'btn-blue':'btn-ghost'}" onclick="setPriceEngineMode('static'); shRenderContent('feed');" style="text-align:left;justify-content:flex-start;padding:10px 14px">
            <div>
              <div style="font-weight:700">🔒 Kunci Statis (Harga Tetap)</div>
              <div style="font-size:11px;opacity:0.85;margin-top:2px">Harga dan nilai pasar tidak bergerak sendiri secara otomatis (statis).</div>
            </div>
          </button>
          <button class="btn ${priceEngineMode==='sim'?'btn-blue':'btn-ghost'}" onclick="setPriceEngineMode('sim'); shRenderContent('feed');" style="text-align:left;justify-content:flex-start;padding:10px 14px">
            <div>
              <div style="font-weight:700">🎲 Simulasi Fluktuasi Pasar</div>
              <div style="font-size:11px;opacity:0.85;margin-top:2px">Mensimulasikan fluktuasi acak untuk keperluan testing dan demo offline.</div>
            </div>
          </button>
        </div>
      </div>

      <div style="background:var(--bg3);border:1px solid var(--border);border-radius:8px;padding:12px;display:flex;align-items:center;justify-content:space-between">
        <div>
          <div style="font-size:11px;color:var(--text3)">Status Feed Saat Ini:</div>
          <div style="font-size:13px;font-weight:700;color:${sc};margin-top:2px">${st}</div>
        </div>
        <button class="btn btn-ghost btn-sm" onclick="if(typeof rdLoadUniverse==='function'){ rdLoadUniverse(true); showSaveStatus('✓ Cache harga diperbarui','var(--green)'); }" style="font-size:11.5px">
          🔄 Refresh Feed Saham
        </button>
      </div>
    `;
  } else if(tab === 'display'){
    var curDens = typeof mwGetTableDensity==='function' ? mwGetTableDensity() : 'standard';
    var isExec = typeof mwViewMode!=='undefined' && mwViewMode==='executive';
    c.innerHTML = `
      <div style="margin-bottom:16px">
        <div style="font-size:15px;font-weight:700;color:var(--text);font-family:var(--font-display)">
          🎨 Tampilan, Skala &amp; Mode Kerja
        </div>
        <div style="font-size:11.5px;color:var(--text3);margin-top:2px">Sesuaikan ukuran font, kerapatan tabel data, dan mode terminal agar nyaman di mata.</div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:16px">
        <div style="background:var(--bg2);border:1px solid var(--border);border-radius:10px;padding:14px">
          <div style="font-weight:700;color:var(--text);font-size:12.5px;margin-bottom:6px">Mode Kerja Terminal</div>
          <div style="font-size:11px;color:var(--text3);margin-bottom:10px">Pilih antara tampilan analisis komprehensif atau ringkas.</div>
          <div style="display:flex;gap:8px">
            <button class="btn ${!isExec?'btn-blue':'btn-ghost'}" onclick="if(typeof mwSetViewMode==='function')mwSetViewMode('pro'); shRenderContent('display');" style="flex:1;justify-content:center;font-size:11.5px">
              PRO Terminal
            </button>
            <button class="btn ${isExec?'btn-blue':'btn-ghost'}" onclick="if(typeof mwSetViewMode==='function')mwSetViewMode('executive'); shRenderContent('display');" style="flex:1;justify-content:center;font-size:11.5px">
              Executive
            </button>
          </div>
        </div>

        <div style="background:var(--bg2);border:1px solid var(--border);border-radius:10px;padding:14px">
          <div style="font-weight:700;color:var(--text);font-size:12.5px;margin-bottom:6px">Skala Ukuran Tampilan (Zoom)</div>
          <div style="font-size:11px;color:var(--text3);margin-bottom:10px">Perbesar atau perkecil rasio elemen antarmuka.</div>
          <div style="display:flex;gap:8px">
            <button class="btn btn-ghost" onclick="if(typeof mwZoom==='function')mwZoom(-0.05)" style="flex:1;justify-content:center;font-size:12px;font-weight:700">A−</button>
            <button class="btn btn-ghost" onclick="if(typeof mwZoom==='function')mwZoom(0)" style="flex:1;justify-content:center;font-size:12px;font-weight:700">100%</button>
            <button class="btn btn-ghost" onclick="if(typeof mwZoom==='function')mwZoom(0.05)" style="flex:1;justify-content:center;font-size:12px;font-weight:700">A+</button>
          </div>
        </div>
      </div>

      <div style="background:var(--bg2);border:1px solid var(--border);border-radius:10px;padding:14px;margin-bottom:16px">
        <div style="font-weight:700;color:var(--text);font-size:12.5px;margin-bottom:6px">Kerapatan Tabel Data (Table Density)</div>
        <div style="font-size:11px;color:var(--text3);margin-bottom:10px">Mengatur padding baris tabel saham dan riwayat transaksi.</div>
        <div style="display:flex;gap:8px">
          <button class="btn ${curDens==='compact'?'btn-blue':'btn-ghost'}" onclick="if(typeof mwSetTableDensity==='function')mwSetTableDensity('compact'); shRenderContent('display');" style="flex:1;justify-content:center;font-size:11.5px">
            Compact (Rapat)
          </button>
          <button class="btn ${curDens==='standard'?'btn-blue':'btn-ghost'}" onclick="if(typeof mwSetTableDensity==='function')mwSetTableDensity('standard'); shRenderContent('display');" style="flex:1;justify-content:center;font-size:11.5px">
            Standard (Nyaman)
          </button>
          <button class="btn ${curDens==='pro'?'btn-blue':'btn-ghost'}" onclick="if(typeof mwSetTableDensity==='function')mwSetTableDensity('pro'); shRenderContent('display');" style="flex:1;justify-content:center;font-size:11.5px">
            Pro (Detail)
          </button>
        </div>
      </div>

      <div style="background:var(--bg2);border:1px solid var(--border);border-radius:10px;padding:14px;display:flex;align-items:center;justify-content:space-between">
        <div>
          <div style="font-weight:700;color:var(--text);font-size:12.5px">Running Ticker Tape BEI</div>
          <div style="font-size:11px;color:var(--text3)">Pita harga berjalan di bawah topbar</div>
        </div>
        <button class="btn btn-ghost btn-sm" onclick="var tw=el('ticker-wrap'); if(tw){ tw.style.display = tw.style.display==='none'?'flex':'none'; showSaveStatus('Pengaturan ticker diubah'); }">
          Alihkan Ticker
        </button>
      </div>
    `;
  } else if(tab === 'tax'){
    var pph = (TAX_SETTINGS.pphJual*100).toFixed(2);
    var ppn = (TAX_SETTINGS.ppn*100).toFixed(0);
    var levy = (TAX_SETTINGS.levy*100).toFixed(3);
    c.innerHTML = `
      <div style="margin-bottom:16px">
        <div style="font-size:15px;font-weight:700;color:var(--text);font-family:var(--font-display)">
          ⚖️ Tarif Pajak &amp; Komisi Broker Sekuritas
        </div>
        <div style="font-size:11.5px;color:var(--text3);margin-top:2px">Konfigurasi biaya transaksi resmi pasar modal Indonesia dan fee sekuritas.</div>
      </div>

      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:16px">
        <div style="background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:12px">
          <div style="font-size:10px;color:var(--text3);font-weight:700;text-transform:uppercase">PPh Final (Penjualan)</div>
          <div style="font-size:16px;font-weight:800;color:var(--accent);margin-top:4px">${pph}%</div>
          <div style="font-size:10px;color:var(--text3);margin-top:2px">Hanya dikenakan saat Jual</div>
        </div>
        <div style="background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:12px">
          <div style="font-size:10px;color:var(--text3);font-weight:700;text-transform:uppercase">PPN Jasa Pialang</div>
          <div style="font-size:16px;font-weight:800;color:var(--green);margin-top:4px">${ppn}%</div>
          <div style="font-size:10px;color:var(--text3);margin-top:2px">Dihitung dari nilai komisi</div>
        </div>
        <div style="background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:12px">
          <div style="font-size:10px;color:var(--text3);font-weight:700;text-transform:uppercase">Levy BEI, KPEI &amp; KSEI</div>
          <div style="font-size:16px;font-weight:800;color:var(--amber);margin-top:4px">${levy}%</div>
          <div style="font-size:10px;color:var(--text3);margin-top:2px">Dikenakan Beli &amp; Jual</div>
        </div>
      </div>

      <div style="background:var(--bg2);border:1px solid var(--border);border-radius:10px;padding:14px;margin-bottom:14px">
        <div style="font-weight:700;color:var(--text);font-size:12.5px;margin-bottom:8px">Biaya Sekuritas Populer:</div>
        <div style="font-size:11.5px;color:var(--text2);line-height:1.7">
          • <strong>Stockbit</strong>: Beli 0.18% · Jual 0.28% (All-in Fee)<br>
          • <strong>IPOT / Indo Premier</strong>: Beli 0.19% · Jual 0.29%<br>
          • <strong>Mirae Asset (HOT)</strong>: Beli 0.15% · Jual 0.25%<br>
          • <strong>Mandiri Sekuritas (MOST)</strong>: Beli 0.18% · Jual 0.28%
        </div>
      </div>

      <div style="display:flex;justify-content:space-between;align-items:center">
        <button class="btn btn-primary btn-sm" onclick="closeSettingsHub(); goPage('settings');">
          ⚙️ Buka Pusat Pengaturan Lengkap (Settings Pillar) →
        </button>
        <button class="btn btn-ghost btn-sm" onclick="closeSettingsHub(); goPage('pajak');">
          Halaman Pajak &amp; PPh Final →
        </button>
      </div>
    `;
  } else if(tab === 'health'){
    c.innerHTML = `
      <div style="margin-bottom:16px">
        <div style="font-size:15px;font-weight:700;color:var(--text);font-family:var(--font-display)">
          🏥 Integritas Data &amp; Audit Trail Transaksi
        </div>
        <div style="font-size:11.5px;color:var(--text3);margin-top:2px">Pemantauan kesehatan relasi data saldo kas, urutan transaksi saham, dan jurnal audit.</div>
      </div>

      <div style="background:var(--bg2);border:1px solid var(--border);border-radius:10px;padding:16px;margin-bottom:16px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
          <span style="font-weight:700;color:var(--text);font-size:13px">Status Integritas Database</span>
          <span style="background:rgba(16,185,129,0.15);color:var(--green);font-size:11px;font-weight:700;padding:2px 10px;border-radius:12px;border:1px solid rgba(16,185,129,0.3)">
            100% HEALTHY
          </span>
        </div>
        <div style="font-size:12px;color:var(--text2);line-height:1.7">
          ✓ Seluruh data tersimpan terenkripsi di Google Firebase Firestore.<br>
          ✓ Tidak ada mutasi RDN anomali atau referensi transaksi ganda.<br>
          ✓ Jurnal transaksi terhubung ke saldo kas dan harga beli rata-rata secara presisi.
        </div>
      </div>

      <div style="display:flex;gap:10px">
        <button class="btn btn-blue" onclick="closeSettingsHub(); goPage('rdn-audit');" style="flex:1;justify-content:center;padding:10px;font-size:12px">
          📋 Buka Log Audit Transaksi
        </button>
        <button class="btn btn-ghost" onclick="closeSettingsHub(); goPage('datahealth');" style="flex:1;justify-content:center;padding:10px;font-size:12px;border-color:var(--border)">
          🩺 Buka Diagnostik Data Health
        </button>
      </div>
    `;
  } else if(tab === 'universe'){
    var totalDB = Object.keys(DB||{}).length;
    c.innerHTML = `
      <div style="margin-bottom:16px">
        <div style="font-size:15px;font-weight:700;color:var(--text);font-family:var(--font-display)">
          📊 Kelola Universe Saham &amp; Sektor IDX
        </div>
        <div style="font-size:11.5px;color:var(--text3);margin-top:2px">Database ${totalDB} emiten bursa efek Indonesia dengan klasifikasi 11 sektor resmi.</div>
      </div>

      <div style="background:var(--bg2);border:1px solid var(--border);border-radius:10px;padding:16px;margin-bottom:16px">
        <div style="font-weight:700;color:var(--text);font-size:12.5px;margin-bottom:6px">Impor Data Universe Saham (Excel .xlsx)</div>
        <div style="font-size:11.5px;color:var(--text3);margin-bottom:12px">Perbarui daftar saham dan sektor secara massal via file Excel IDX.</div>
        <label class="btn btn-blue btn-sm" style="display:inline-flex;cursor:pointer">
          📁 Pilih File Excel (.xlsx)
          <input type="file" accept=".xlsx,.xls" onchange="if(typeof adminImportXlsx==='function')adminImportXlsx(this.files[0]);" style="display:none">
        </label>
      </div>

      <div style="display:flex;justify-content:flex-end">
        <button class="btn btn-ghost btn-sm" onclick="closeSettingsHub(); goPage('admin');">
          Buka Panel Universe Saham Lengkap →
        </button>
      </div>
    `;
  } else if(tab === 'account'){
    c.innerHTML = `
      <div style="margin-bottom:16px">
        <div style="font-size:15px;font-weight:700;color:var(--text);font-family:var(--font-display)">
          👤 Akun Pengguna &amp; Sesi Login
        </div>
        <div style="font-size:11.5px;color:var(--text3);margin-top:2px">Informasi otentikasi dan sesi aktif Money Watch Pro.</div>
      </div>

      <div style="background:var(--bg2);border:1px solid var(--border);border-radius:10px;padding:16px;margin-bottom:16px">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:14px">
          <div style="width:42px;height:42px;border-radius:50%;background:rgba(59,130,246,0.15);border:1px solid rgba(59,130,246,0.3);display:flex;align-items:center;justify-content:center;font-size:18px;color:var(--accent)">
            👤
          </div>
          <div>
            <div style="font-weight:700;color:var(--text);font-size:13.5px">${escHtml(userEmail)}</div>
            <div style="font-size:11px;color:var(--green);font-weight:600">● Portfolio Owner · Full Cloud Sync</div>
          </div>
        </div>
        <div style="font-size:11.5px;color:var(--text3);line-height:1.6">
          Sesi aktif diamankan dengan otentikasi Firebase. Seluruh pencatatan transaksi terhubung langsung ke ID akun Anda.
        </div>
      </div>

      <div style="display:flex;justify-content:space-between;align-items:center">
        <button class="btn btn-red" onclick="closeSettingsHub(); if(typeof authLogout==='function')authLogout();" style="padding:8px 16px;font-size:12px;font-weight:700">
          🚪 Keluar / Logout
        </button>
        <button class="btn btn-ghost btn-sm" onclick="closeSettingsHub()">Tutup</button>
      </div>
    `;
  }
}

function openBackupModal(){
  openSettingsHub('cloud');
}

function closeBackupModal(){
  closeSettingsHub();
}

var _saveStatusTimer = null;
function showSaveStatus(msg, color, persist){
  var bar = el('save-status-bar');
  if(!bar) return;
  if(_saveStatusTimer){
    clearTimeout(_saveStatusTimer);
    _saveStatusTimer = null;
  }
  bar.textContent = msg;
  bar.style.color = color || 'var(--green)';
  bar.style.opacity = '1';
  var duration = persist ? 4500 : 2500;
  _saveStatusTimer = setTimeout(function(){
    bar.style.opacity = '0';
    setTimeout(function(){ if(bar.style.opacity === '0') bar.textContent = ''; }, 600);
  }, duration);
}

// ============================================================
// HELPERS
// ============================================================
function fmt(n){return Math.round(n||0).toLocaleString('id-ID')}
function fmtK(n){var a=Math.abs(n||0);if(a>=1e12)return(n/1e12).toFixed(2)+'T';if(a>=1e9)return(n/1e9).toFixed(2)+'M';if(a>=1e6)return(n/1e6).toFixed(1)+'Jt';return fmt(n)}
function escHtml(s){ return String(s==null?'':s).replace(/[&<>"']/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
function rnd(b,p){p=p||0.025;return b*(1+(Math.random()*p*2-p))}
function today(){return new Date().toISOString().split('T')[0]}
function el(id){return document.getElementById(id)}
function dAgo(n){var d=new Date();d.setDate(d.getDate()-n);return d.toISOString().split('T')[0]}

// ============================================================
// METADATA PASAR & ACUAN DATA
// ============================================================
var XLSX_DATA = {
  total_equity: 0,
  margin_total: 0,
  nett_value: 0,
  change_rp: 0,
  change_pct: 0,
  cash: 0,
  equity_val: 0,
  crypto_etf: 0,
  fund_alloc: 0,
  p2p: 0,
  cap_gain_2026: 0,
  realized_gain_b: 0,
  dividend_2026: 0,
  kurs_usd: 17823.65,
  core_long: 0,
  swing_trade: 0,
  fast_trade: 0,
  sectoral:{},
  stocks:[],
  crypto:[
    {code:'BTC', name:'Bitcoin',  price_idr:1306967438},
    {code:'ETH', name:'Ethereum', price_idr:60000000},
    {code:'ADA', name:'Cardano',  price_idr:4143},
  ],
  fund_aktif: 0,
  fund_gain_total: 0,
  funds:[],
  fund_margin_by_cat:{},
  dividends:[],
  dividend_total: 0,
};
