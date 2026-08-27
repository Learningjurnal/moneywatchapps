// Helper bersama: id berikutnya yang AMAN untuk sebuah array {id,...}
function _maxIdPlus1(arr){ var m=0; (arr||[]).forEach(function(x){ if(x.id>m) m=x.id; }); return m+1; }

// ============================================================
// DATA PORTOFOLIO & TRANSAKSI 24 AGUSTUS 2026 (STOCKBIT)
// ============================================================
var INITIAL_PORTO_2026 = [
  { no: 3,  ticker: 'GGRM', lot: 6,   price: 67303,  amount: 40381580 },
  { no: 4,  ticker: 'BBNI', lot: 73,  price: 5243,   amount: 38276774 },
  { no: 5,  ticker: 'CPRI', lot: 90,  price: 123,    amount: 1106098 },
  { no: 12, ticker: 'BBCA', lot: 68,  price: 8116,   amount: 55190301 },
  { no: 15, ticker: 'BMRI', lot: 72,  price: 6023,   amount: 43362552 },
  { no: 37, ticker: 'BBRI', lot: 223, price: 4833,   amount: 107776850 },
  { no: 38, ticker: 'ERAA', lot: 415, price: 544.9,  amount: 22613284 },
  { no: 42, ticker: 'UNVR', lot: 60,  price: 5756.8, amount: 34540561 },
  { no: 46, ticker: 'ADRO', lot: 102, price: 3484.6, amount: 35542862 },
  { no: 51, ticker: 'SIDO', lot: 330, price: 645,    amount: 21273844 },
  { no: 53, ticker: 'PGEO', lot: 823, price: 1521,   amount: 125189937 },
  { no: 62, ticker: 'PMMP', lot: 38,  price: 265,    amount: 1007284 },
  { no: 64, ticker: 'AADI', lot: 5,   price: 10679,  amount: 5339594 },
  { no: 67, ticker: 'BUMI', lot: 523, price: 357,    amount: 18682368 },
  { no: 70, ticker: 'SMDR', lot: 710, price: 439,    amount: 31180236 },
  { no: 74, ticker: 'CDIA', lot: 198, price: 1950,   amount: 38608062 },
  { no: 76, ticker: 'RAJA', lot: 215, price: 1072,   amount: 23053923 },
  { no: 77, ticker: 'ADMR', lot: 203, price: 2062,   amount: 41854202 },
  { no: 78, ticker: 'DEWA', lot: 135, price: 474,    amount: 6398196 },
  { no: 81, ticker: 'PTRO', lot: 5,   price: 5619,   amount: 2809608 },
  { no: 82, ticker: 'MBMA', lot: 92,  price: 788,    amount: 7248969 },
  { no: 85, ticker: 'WIFI', lot: 57,  price: 3406,   amount: 19415886 },
  { no: 90, ticker: 'ARCI', lot: 236, price: 1890,   amount: 44610655 },
  { no: 92, ticker: 'PRDL', lot: 31,  price: 356,    amount: 1104985 },
  { no: 93, ticker: 'GMFI', lot: 120, price: 64,     amount: 773390 },
];

function initPortfolio2026(force){
  if(transactions && transactions.length > 0 && !force) return;
  
  transactions = [];
  rdnMutations = [];
  dividends = [];
  nextTxId = 1;
  nextRdnId = 1;
  activeSekuritas = 'Stockbit';

  var totalBuyNet = 0;
  INITIAL_PORTO_2026.forEach(function(item){
    var gross = item.lot * 100 * item.price;
    var c = (typeof calcTxComponents === 'function') 
      ? calcTxComponents(gross, true, 'Stockbit') 
      : { komisi: gross * 0.0028, ppn: 0, levy: 0, pph: 0, net: gross * 1.0028 };
    totalBuyNet += c.net;
    var txId = nextTxId++;
    transactions.push({
      id: txId,
      date: '2026-08-24',
      type: 'BUY',
      ticker: item.ticker,
      lot: item.lot,
      price: item.price,
      gross: gross,
      komisi: c.komisi,
      ppn: c.ppn,
      levy: c.levy,
      pph: c.pph,
      tax: (c.ppn || 0) + (c.levy || 0) + (c.pph || 0),
      net: c.net,
      sekuritas: 'Stockbit'
    });
    rdnMutations.push({
      id: nextRdnId++,
      date: '2026-08-24',
      type: 'BUY',
      ket: 'Beli ' + item.lot + ' lot ' + item.ticker + ' @ Rp ' + fmt(item.price),
      amount: -c.net,
      balance: 0,
      sekuritas: 'Stockbit',
      linkedTxId: txId
    });
  });

  // Tambahkan setoran awal RDN (Modal Awal) agar saldo kas tidak defisit fiktif
  var initialDeposit = Math.ceil(totalBuyNet / 50000000) * 50000000 + 10000000;
  rdnMutations.unshift({
    id: nextRdnId++,
    date: '2026-08-24',
    type: 'SETOR',
    ket: 'Setoran Awal RDN (Modal Awal)',
    amount: initialDeposit,
    balance: initialDeposit,
    sekuritas: 'Stockbit'
  });

  if (typeof rebuildRdnBalance === 'function') rebuildRdnBalance();
  if (typeof _invalidatePortoCache === 'function') _invalidatePortoCache();
  if (force && typeof saveData === 'function') saveData();
}

// Inisialisasi awal aman: coba load dari localStorage dulu
try {
  var _hasLoaded = loadData();
  if(!_hasLoaded || (transactions.length === 0 && !localStorage.getItem('mw_local_data_v2'))){
    initPortfolio2026();
  }
} catch(e){
  initPortfolio2026();
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
var _cloudSyncFailed = false;
var _syncInFlight = false;
var _syncQueued = false;

async function fireSaveAllData(){
  if(!_currentUser || !_firebaseDb) return;
  var uid = _currentUser.uid || _currentUser.id;
  if(!uid) return;

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
    nextTxId: nextTxId || 1,
    nextDivId: nextDivId || 1,
    nextRdnId: nextRdnId || 1,
    nextCryptoId: nextCryptoId || 1,
    nextEtfId: nextEtfId || 1,
    nextRdId: nextRdId || 1,
    updatedAt: new Date().toISOString()
  };

  try {
    var userRef = _firebaseDb.collection('users').doc(uid);
    var mainDataRef = userRef.collection('data').doc('main');
    
    await mainDataRef.set(payload, { merge: true });
    await userRef.set({
      email: _currentUser.email || 'user',
      lastActiveAt: new Date().toISOString()
    }, { merge: true });

    return true;
  } catch(err) {
    var errStr = (err && err.message) ? err.message : String(err);
    if (errStr.indexOf('offline') !== -1 || errStr.indexOf('unavailable') !== -1) {
      console.warn('Firebase Firestore offline save queued locally:', errStr);
    } else {
      console.warn('Firebase Firestore save notice:', errStr);
    }
    throw err;
  }
}

async function fireLoadAllData(){
  if(!_currentUser || !_firebaseDb) return false;
  var uid = _currentUser.uid || _currentUser.id;
  if(!uid) return false;

  try {
    var mainDataRef = _firebaseDb.collection('users').doc(uid).collection('data').doc('main');
    
    var snap = null;
    try {
      // Coba ambil dari Firestore dengan timeout agar tidak memblokir saat offline/koneksi lambat
      snap = await Promise.race([
        mainDataRef.get(),
        new Promise(function(_, reject) {
          setTimeout(function() { reject(new Error('Firestore connection timeout, using local cache')); }, 3500);
        })
      ]);
    } catch(fetchErr) {
      // Jika offline atau timeout, coba ambil dari cache offline lokal Firestore
      try {
        snap = await mainDataRef.get({ source: 'cache' });
      } catch(cacheErr) {
        var msg = (fetchErr && fetchErr.message) ? fetchErr.message : String(fetchErr);
        console.warn('Firestore offline notice (menggunakan data lokal):', msg);
        return false;
      }
    }

    if(!snap || !snap.exists){
      // Inisialisasi portofolio 24 Agustus 2026 jika belum ada data di Firestore maupun lokal
      if(!transactions || transactions.length === 0){
        initPortfolio2026(true);
      }
      try {
        await fireSaveAllData();
      } catch(saveErr) {
        console.warn('Initial fireSaveAllData deferred:', saveErr && saveErr.message ? saveErr.message : saveErr);
      }
      return true;
    }

    var d = snap.data() || {};

    transactions = d.transactions || [];
    dividends = d.dividends || [];
    rdnMutations = d.rdnMutations || [];
    cryptoTx = d.cryptoTx || [];
    etfTx = d.etfTx || [];
    rdTx = d.rdTx || [];
    divInvestData = d.divInvestData || [];
    
    activeSekuritas = d.activeSekuritas || 'Stockbit';
    rdnBalance = d.rdnBalance || 0;
    if(typeof rebuildRdnBalance === 'function') rebuildRdnBalance();

    if(d.taxSettings && typeof TAX_SETTINGS !== 'undefined'){
      Object.assign(TAX_SETTINGS, d.taxSettings);
    }
    if(d.cashAccounts && typeof CASH_ACCOUNTS !== 'undefined'){
      Object.assign(CASH_ACCOUNTS, d.cashAccounts);
    }

    sekTaxOverride = d.sekTaxOverride || {};
    tradeStrategy = d.tradeStrategy || {};

    if(d.theses && typeof MW_THESES !== 'undefined') MW_THESES = d.theses;
    if(d.journals && typeof MW_JOURNALS !== 'undefined') MW_JOURNALS = d.journals;

    if(d.wealth && typeof WEALTH !== 'undefined'){
      Object.keys(WEALTH).forEach(function(k){
        if(d.wealth[k] !== undefined) WEALTH[k] = d.wealth[k];
      });
      if(typeof wUpdateDueBadge === 'function') wUpdateDueBadge();
    }

    if(d.equityHistory && Array.isArray(d.equityHistory) && d.equityHistory.length > 0){
      if(typeof equityHistorySave === 'function') equityHistorySave(d.equityHistory);
    } else if(typeof equityHistoryLoad === 'function') {
      equityHistoryLoad();
    }

    if(d.adminMeta && typeof ADMIN_META !== 'undefined') ADMIN_META = d.adminMeta;
    if(d.adminExtra && typeof ADMIN_EXTRA !== 'undefined') ADMIN_EXTRA = d.adminExtra;
    if(d.idxUniverse && typeof IDX_UNIVERSE !== 'undefined') IDX_UNIVERSE = d.idxUniverse;
    if(d.idxUniverseInfo && typeof IDX_UNIVERSE_INFO !== 'undefined') IDX_UNIVERSE_INFO = d.idxUniverseInfo;

    nextTxId  = Math.max(d.nextTxId || 1, _maxIdPlus1(transactions));
    nextDivId = Math.max(d.nextDivId || 1, _maxIdPlus1(dividends));
    nextRdnId = Math.max(d.nextRdnId || 1, _maxIdPlus1(rdnMutations));
    nextCryptoId = Math.max(d.nextCryptoId || 1, _maxIdPlus1(cryptoTx));
    nextEtfId    = Math.max(d.nextEtfId || 1, _maxIdPlus1(etfTx));
    nextRdId     = Math.max(d.nextRdId || 1, _maxIdPlus1(rdTx));

    return true;
  } catch(err) {
    var errStr = (err && err.message) ? err.message : String(err);
    console.warn('Firebase Firestore load notice (fallback ke penyimpanan lokal):', errStr);
    return false;
  }
}

// ============================================================
// DATA SAVE & SYNC CONTROLLER (HYBRID LOCALSTORAGE & FIRESTORE)
// ============================================================
function saveData(){
  if(typeof _invalidatePortoCache === 'function') _invalidatePortoCache();
  
  // 1. Simpan selalu ke LocalStorage browser agar persisten seketika (offline-resilient)
  try {
    var localPayload = {
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
      wealth: (typeof WEALTH !== 'undefined') ? WEALTH : null,
      theses: (typeof MW_THESES !== 'undefined') ? MW_THESES : [],
      journals: (typeof MW_JOURNALS !== 'undefined') ? MW_JOURNALS : [],
      equityHistory: (typeof equityHistoryLoad === 'function') ? equityHistoryLoad() : [],
      savedAt: new Date().toISOString()
    };
    localStorage.setItem('mw_local_data_v2', JSON.stringify(localPayload));
    localStorage.setItem('mw_trade_strategy', JSON.stringify(tradeStrategy || {}));
  } catch(e) {
    console.warn('LocalStorage save notice:', e);
  }

  // 2. Sinkronkan ke Firebase Firestore jika user terhubung
  if(_currentUser && (_currentUser.uid || _currentUser.id) && _firebaseDb){
    _syncToCloud(true);
  } else {
    if(typeof showSaveStatus === 'function') showSaveStatus('✓ Data & strategi tersimpan lokal', 'var(--green)');
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
    if(typeof showSaveStatus === 'function') showSaveStatus('✓ Tersimpan ke Firebase Firestore & Lokal', 'var(--green)');
  }).catch(function(e){
    _syncInFlight = false;
    console.warn('Firebase sync notice:', e);
    _cloudSyncFailed = true;
    var _errMsg = (e && e.message) ? e.message : String(e);
    if(typeof showSaveStatus === 'function') showSaveStatus('✓ Tersimpan lokal (Cloud: ' + _errMsg + ')', 'var(--amber)');
    if(_syncQueued){
      _syncQueued = false;
      return _syncToCloud(allowRetry);
    }
    if(allowRetry){
      setTimeout(function(){ if(_currentUser) _syncToCloud(false); }, 8000);
    }
  });
}

function safeCloudBoot(){
  loadData();
  return fireLoadAllData();
}

function loadData(){
  try {
    var rawStrat = localStorage.getItem('mw_trade_strategy');
    if(rawStrat){
      var parsedStrat = JSON.parse(rawStrat);
      if(parsedStrat && typeof parsedStrat === 'object') {
        tradeStrategy = Object.assign({}, tradeStrategy, parsedStrat);
      }
    }
    var raw = localStorage.getItem('mw_local_data_v2');
    if(raw){
      var d = JSON.parse(raw);
      if(d && typeof d === 'object'){
        if(d.tradeStrategy) tradeStrategy = Object.assign({}, tradeStrategy, d.tradeStrategy);
        if(d.transactions && Array.isArray(d.transactions) && d.transactions.length > 0) transactions = d.transactions;
        if(d.dividends && Array.isArray(d.dividends)) dividends = d.dividends;
        if(d.rdnMutations && Array.isArray(d.rdnMutations)) rdnMutations = d.rdnMutations;
        if(d.cryptoTx && Array.isArray(d.cryptoTx)) cryptoTx = d.cryptoTx;
        if(d.etfTx && Array.isArray(d.etfTx)) etfTx = d.etfTx;
        if(d.rdTx && Array.isArray(d.rdTx)) rdTx = d.rdTx;
        if(d.divInvestData && Array.isArray(d.divInvestData)) divInvestData = d.divInvestData;
        if(d.activeSekuritas) activeSekuritas = d.activeSekuritas;
        if(typeof d.rdnBalance === 'number') rdnBalance = d.rdnBalance;
        if(d.sekTaxOverride) sekTaxOverride = d.sekTaxOverride;
        if(d.taxSettings && typeof TAX_SETTINGS !== 'undefined') Object.assign(TAX_SETTINGS, d.taxSettings);
        if(d.theses && typeof MW_THESES !== 'undefined') MW_THESES = d.theses;
        if(d.journals && typeof MW_JOURNALS !== 'undefined') MW_JOURNALS = d.journals;
        if(d.wealth && typeof WEALTH !== 'undefined') Object.assign(WEALTH, d.wealth);
        if(d.equityHistory && Array.isArray(d.equityHistory) && d.equityHistory.length > 0){
          if(typeof equityHistorySave === 'function') equityHistorySave(d.equityHistory);
        }
      }
    }
    if(typeof equityHistoryLoad === 'function') equityHistoryLoad();
    nextTxId  = _maxIdPlus1(transactions);
    nextDivId = _maxIdPlus1(dividends);
    nextRdnId = _maxIdPlus1(rdnMutations);
    nextCryptoId = _maxIdPlus1(cryptoTx);
    nextEtfId    = _maxIdPlus1(etfTx);
    nextRdId     = _maxIdPlus1(rdTx);
    if (typeof rebuildRdnBalance === 'function') rebuildRdnBalance();
    return true;
  } catch(e){
    console.warn('LocalStorage load notice:', e);
    return false;
  }
}

function clearData(){
  if(!confirm('⚠️ Hapus SEMUA data transaksi tersimpan dan kosongkan portofolio di Firebase?\n\nTindakan ini akan mengosongkan seluruh data transaksi agar siap di-upload ulang.')) return;
  
  // Kosongkan variabel memori
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

  if(_currentUser && _currentUser.uid && _firebaseDb){
    var uid = _currentUser.uid || _currentUser.id;
    if(typeof showSaveStatus === 'function') showSaveStatus('⏳ Menghapus data di Firestore...', 'var(--amber)', true);
    
    var userRef = _firebaseDb.collection('users').doc(uid);
    var mainDataRef = userRef.collection('data').doc('main');
    
    mainDataRef.delete().then(function(){
      if(typeof showSaveStatus === 'function') showSaveStatus('✓ Seluruh data transaksi di Firestore telah dikosongkan 100%');
      if(typeof renderAll === 'function') renderAll();
      if(typeof renderPage === 'function' && typeof currentPage !== 'undefined') renderPage(currentPage);
    }).catch(function(err){
      if(typeof showSaveStatus === 'function') showSaveStatus('⚠ Gagal menghapus: ' + err.message, 'var(--red)', true);
    });
  } else {
    if(typeof showSaveStatus === 'function') showSaveStatus('✓ Data transaksi di memori telah dikosongkan 100%');
    if(typeof renderAll === 'function') renderAll();
    if(typeof renderPage === 'function' && typeof currentPage !== 'undefined') renderPage(currentPage);
  }
}

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

function openBackupModal(){
  var m = el('backup-modal');
  if(!m) return;
  m.style.display = 'flex';
  var body = el('backup-modal-body');
  if(!body) return;

  body.innerHTML = `
    <div style="font-size:12px;color:var(--text2);line-height:1.6;margin-bottom:14px">
      Database aktif menggunakan <strong>Firebase Firestore Cloud</strong> (otomatis tanpa skema). Anda juga dapat mengekspor atau mengimpor file backup JSON mandiri kapan saja.
    </div>

    <div style="display:flex;flex-direction:column;gap:10px;margin-bottom:16px">
      <button class="btn btn-primary" onclick="downloadBackup()" style="justify-content:center;padding:10px">
        ⬇️ Download File Backup JSON
      </button>
      
      <label class="btn btn-ghost" style="justify-content:center;padding:10px;cursor:pointer;border-color:var(--border)">
        ⬆️ Upload File Backup JSON
        <input type="file" accept=".json" onchange="restoreFromBackup(this.files[0])" style="display:none">
      </label>
    </div>

    <div style="margin-top:12px;display:flex;justify-content:space-between;align-items:center">
      <button class="btn btn-ghost btn-sm" onclick="clearData()" style="color:var(--red);font-size:11px">🗑 Reset semua data</button>
      <button class="btn btn-ghost btn-sm" onclick="closeBackupModal()">Tutup</button>
    </div>
  `;
}

function closeBackupModal(){
  var m = el('backup-modal');
  if(m) m.style.display = 'none';
}

function showSaveStatus(msg, color, persist){
  var bar = el('save-status-bar');
  if(!bar) return;
  bar.textContent = msg;
  bar.style.color = color || 'var(--green)';
  bar.style.opacity = '1';
  if(!persist){
    setTimeout(function(){ bar.style.opacity = '0'; }, 2500);
  }
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
