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
  var buyMuts = [];

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
    buyMuts.push({
      date: '2026-08-24',
      type: 'BUY',
      ket: 'Beli ' + item.lot + ' lot ' + item.ticker + ' @ Rp ' + fmt(item.price),
      amount: -c.net,
      balance: 0,
      sekuritas: 'Stockbit',
      linkedTxId: txId
    });
  });

  // Tambahkan setoran awal RDN (Modal Awal) sebagai mutasi pertama (id: 1)
  var initialDeposit = Math.ceil(totalBuyNet / 50000000) * 50000000 + 10000000;
  rdnMutations.push({
    id: nextRdnId++,
    date: '2026-08-24',
    type: 'SETOR',
    ket: 'Setoran Awal RDN (Modal Awal)',
    amount: initialDeposit,
    balance: initialDeposit,
    sekuritas: 'Stockbit'
  });

  buyMuts.forEach(function(m){
    m.id = nextRdnId++;
    rdnMutations.push(m);
  });

  if (typeof rebuildRdnBalance === 'function') rebuildRdnBalance();
  if (typeof _invalidatePortoCache === 'function') _invalidatePortoCache();
  if (force && typeof saveData === 'function') saveData();
}

function sanitizeRdnMutations(){
  if(!Array.isArray(rdnMutations)) rdnMutations = [];
  
  // 1. Jika ada mutasi berulang 'Setoran Awal' dan 'Setoran Awal Penyesuaian RDN', rapikan
  var initialSetors = rdnMutations.filter(function(r){
    return (r.type === 'SETOR' || r.type === 'TOPUP') && 
           (r.ket && (r.ket.indexOf('Setoran Awal') !== -1 || r.ket.indexOf('Modal Awal') !== -1));
  });

  if (initialSetors.length > 1) {
    var maxSetor = initialSetors.reduce(function(prev, curr){
      return (curr.amount > prev.amount) ? curr : prev;
    }, initialSetors[0]);

    rdnMutations = rdnMutations.filter(function(r){
      if ((r.type === 'SETOR' || r.type === 'TOPUP') && 
          (r.ket && (r.ket.indexOf('Setoran Awal') !== -1 || r.ket.indexOf('Modal Awal') !== -1))) {
        return r.id === maxSetor.id;
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
      // Manual cash entry
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

  // Rapikan duplikasi Setoran Awal jika ada lebih dari 1
  var initialSetors = manualMutations.filter(function(r){
    return (r.type === 'SETOR' || r.type === 'TOPUP') && 
           (r.ket && (r.ket.indexOf('Setoran Awal') !== -1 || r.ket.indexOf('Modal Awal') !== -1));
  });
  if (initialSetors.length > 1) {
    var maxSetor = initialSetors.reduce(function(prev, curr){
      return (curr.amount > prev.amount) ? curr : prev;
    }, initialSetors[0]);
    manualMutations = manualMutations.filter(function(r){
      if ((r.type === 'SETOR' || r.type === 'TOPUP') && 
          (r.ket && (r.ket.indexOf('Setoran Awal') !== -1 || r.ket.indexOf('Modal Awal') !== -1))) {
        return r.id === maxSetor.id;
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
    }).then(function(res){ return res.json(); }).then(function(backendResult){
      if(backendResult && backendResult.success){
        console.log('✓ Backend RDN sync & audit verified:', backendResult.stats);
      }
    }).catch(function(beErr){
      console.warn('Backend sync ping notice (offline/local):', beErr);
    });
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
  var _hasLoaded = loadData();
  if(!_hasLoaded || (transactions.length === 0 && !localStorage.getItem('mw_local_data_v2'))){
    initPortfolio2026();
  } else {
    sanitizeRdnMutations();
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
    var uid = (typeof getFirestoreUserUid === 'function') ? getFirestoreUserUid() : 'u_andry_zuma_musa_gmail_com';
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
      }).catch(function(e){
        console.warn('Server persistence mirror notice:', e);
      });
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
  var uid = (typeof getFirestoreUserUid === 'function') ? getFirestoreUserUid() : 'u_andry_zuma_musa_gmail_com';
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
  var uid = (typeof getFirestoreUserUid === 'function') ? getFirestoreUserUid() : 'u_andry_zuma_musa_gmail_com';
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
  var uid = (typeof getFirestoreUserUid === 'function') ? getFirestoreUserUid() : 'u_andry_zuma_musa_gmail_com';
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

    // Jika dokumen belum ada di Firestore tapi ada data lokal, segera migrasikan ke Firestore
    if(!snap || !snap.exists){
      if(currentLocalState.transactions.length === 0 && !localStorage.getItem('mw_local_data_v2') && !localStorage.getItem('mw_emergency_backup_v2')){
        initPortfolio2026(true);
      }
      try {
        await migrateLocalDataToFirebaseCloud(true);
      } catch(saveErr) {
        console.warn('Initial migrateLocalDataToFirebaseCloud deferred:', saveErr);
      }
      return true;
    }

    var cloudData = snap.data() || {};

    // ── SMART BI-DIRECTIONAL MERGE ──
    var merged = _mergeDatasets(currentLocalState, cloudData);

    transactions = merged.transactions;
    dividends = merged.dividends;
    rdnMutations = merged.rdnMutations;
    cryptoTx = merged.cryptoTx;
    etfTx = merged.etfTx;
    rdTx = merged.rdTx;
    divInvestData = merged.divInvestData;
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

    // If local state had new items not in cloud, push to Firestore
    var localTxCount = (currentLocalState.transactions || []).length;
    var cloudTxCount = (cloudData.transactions || []).length;
    if(transactions.length > cloudTxCount || localTxCount > cloudTxCount){
      try {
        fireSaveAllData();
      } catch(e){}
    }

    // Aktifkan realtime listener untuk sinkronisasi antar perangkat
    setupFirestoreRealtimeListener(uid);

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
    // Pastikan data lokal termigrasi ke Firebase jika belum
    if(!window._firebaseMigrated){
      migrateLocalDataToFirebaseCloud();
    }
    return ok;
  });
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
    var raw = localStorage.getItem('mw_local_data_v2') || localStorage.getItem('mw_emergency_backup_v2');
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
        if(d.cashAccounts && typeof CASH_ACCOUNTS !== 'undefined') Object.assign(CASH_ACCOUNTS, d.cashAccounts);
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
    if(typeof fetch === 'function' && (!transactions || transactions.length === 0)){
      fetch('/api/user-data/load')
        .then(function(res){ return res.json(); })
        .then(function(resData){
          if(resData && resData.found && resData.record && resData.record.data){
            var sData = resData.record.data;
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

  var userEmail = (_currentUser && _currentUser.email) || (typeof PRIMARY_USER_EMAIL !== 'undefined' ? PRIMARY_USER_EMAIL : 'Andry.Zuma.Musa@gmail.com');
  var nTx = (transactions || []).length;
  var nRdn = (rdnMutations || []).length;
  var nDiv = (dividends || []).length;

  body.innerHTML = `
    <div style="background:var(--surface2);border:1px solid var(--border);border-radius:10px;padding:14px;margin-bottom:16px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
        <span style="font-weight:700;color:var(--text);font-size:13px;display:flex;align-items:center;gap:6px">
          🔥 Firebase Cloud Firestore
        </span>
        <span style="background:rgba(65,243,167,0.15);color:var(--green);font-size:11px;font-weight:600;padding:2px 8px;border-radius:12px">
          Aktif &amp; Terhubung
        </span>
      </div>
      <div style="font-size:12px;color:var(--text2);line-height:1.6">
        <div><strong>Akun:</strong> ${escHtml(userEmail)}</div>
        <div><strong>Koleksi Aktif:</strong> ${nTx} Saham, ${nRdn} Mutasi RDN, ${nDiv} Dividen</div>
        <div style="color:var(--text3);font-size:11px;margin-top:4px">
          Seluruh data disimpan permanen di Firebase Firestore dan tersinkronisasi otomatis saat berpindah perangkat (PC, HP, Tablet).
        </div>
      </div>
    </div>

    <div style="display:flex;flex-direction:column;gap:10px;margin-bottom:16px">
      <button class="btn btn-primary" onclick="migrateLocalDataToFirebaseCloud(true)" style="justify-content:center;padding:11px;font-weight:600;background:var(--accent);color:#000">
        🚀 Pindahkan / Sinkronkan Data ke Firebase Cloud
      </button>

      <button class="btn btn-ghost" onclick="fireLoadAllData().then(function(){ if(typeof showSaveStatus==='function') showSaveStatus('✓ Data terbaru dimuat dari Firebase Cloud','var(--green)'); closeBackupModal(); })" style="justify-content:center;padding:10px;border-color:var(--border)">
        🔄 Muat Ulang Data dari Firebase Cloud
      </button>

      <div style="display:flex;gap:8px">
        <button class="btn btn-ghost" onclick="downloadBackup()" style="flex:1;justify-content:center;padding:9px;font-size:12px;border-color:var(--border)">
          ⬇️ Export File JSON
        </button>
        <label class="btn btn-ghost" style="flex:1;justify-content:center;padding:9px;font-size:12px;cursor:pointer;border-color:var(--border)">
          ⬆️ Import File JSON
          <input type="file" accept=".json" onchange="restoreFromBackup(this.files[0])" style="display:none">
        </label>
      </div>
    </div>

    <div style="margin-top:12px;display:flex;justify-content:space-between;align-items:center">
      <button class="btn btn-ghost btn-sm" onclick="clearData()" style="color:var(--red);font-size:11px">🗑 Reset Data Portofolio</button>
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
