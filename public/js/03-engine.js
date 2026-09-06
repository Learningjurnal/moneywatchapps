// ============================================================
// STATE INITIALIZATION & CLEAN RESET
// ============================================================
function loadSample(){
  // Reset state murni — kosong tanpa data transaksi/portofolio palsu/bawaan
  transactions = [];
  rdnMutations = [];
  dividends = [];
  nextTxId = 1;
  nextRdnId = 1;
  nextDivId = 1;
  activeSekuritas = 'Stockbit';
  rdnBalance = 0;

  if (typeof rebuildRdnBalance === 'function') {
    rebuildRdnBalance();
  }

  if (typeof setCash === 'function') {
    setCash('saham', 0);
  }
  
  if (typeof _invalidatePortoCache === 'function') {
    _invalidatePortoCache();
  }
}



// ── Deteksi sekuritas aktif dari transaksi portofolio ──
// Returns sekuritas yang paling sering dipakai pada transaksi BUY terbaru (30 hari terakhir),
// atau jika tidak ada, sekuritas dengan total lot terbanyak.
function detectActiveSekuritas(){
  if(transactions.length === 0) return activeSekuritas;
  // Cek 30 hari terakhir
  var cutoff = new Date(); cutoff.setDate(cutoff.getDate()-30);
  var cutoffStr = cutoff.toISOString().slice(0,10);
  var recent = transactions.filter(function(t){ return t.date >= cutoffStr && t.type==='BUY'; });
  var pool = recent.length > 0 ? recent : transactions.filter(function(t){ return t.type==='BUY'; });
  if(pool.length === 0) return activeSekuritas;
  // Hitung frekuensi per sekuritas
  var freq = {};
  pool.forEach(function(t){
    var s = t.sekuritas||''; if(!s) return;
    freq[s] = (freq[s]||0) + 1;
  });
  // Pilih yang terbanyak, tie-break: transaksi terbaru
  var sorted = Object.keys(freq).sort(function(a,b){
    return freq[b] - freq[a] || 0;
  });
  return sorted[0] || activeSekuritas;
}

// Jenis biaya RDN non-saham (fee, materai, dll)
var FEE_TYPES = [
  { value:'DATA_FEE',  label:'Data Fee / Subscription',   hint:'Biaya langganan data pasar real-time' },
  { value:'MATERAI',   label:'Bea Materai',                hint:'Bea materai dokumen (Rp 10.000/dok)' },
  { value:'MIGRASI',   label:'Biaya Migrasi',              hint:'Biaya pindah rekening antar sekuritas' },
  { value:'ADMIN',     label:'Biaya Administrasi',         hint:'Biaya bulanan rekening atau kartu saham' },
  { value:'TRANSFER',  label:'Biaya Transfer Bank',        hint:'Biaya transfer RDN ke bank lain' },
  { value:'PENALTY',   label:'Denda / Penalti',            hint:'Denda gagal bayar atau pelanggaran' },
  { value:'LAINNYA',   label:'Biaya Lainnya',              hint:'Biaya operasional lainnya' },
];

function addRdn(date, type, ket, amount, sekuritas, linkedTxId, account){
  // FIX AUDIT F2: sebelumnya rdnBalance+=amount lalu balance:rdnBalance ditulis
  // TANPA mengurutkan ulang rdnMutations dulu — mutasi bertanggal MUNDUR yang
  // ditambahkan setelah mutasi lain akan dapat snapshot "balance" yang salah
  // secara kronologis (lihat AUDIT_FINANCIAL_ENGINE.md Temuan #2, terverifikasi
  // reproduksi langsung). rebuildRdnBalance() selalu re-sort by date dulu lalu
  // menghitung ulang penuh, jadi kolom balance per-baris selalu benar berapa
  // pun urutan penambahannya.
  rdnMutations.push({
    id:nextRdnId++, date:date, type:type, ket:ket,
    amount:amount, balance:0, sekuritas:sekuritas,
    linkedTxId: linkedTxId||null,
    account: account || 'saham'
  });
  if(typeof rebuildRdnBalance==='function') rebuildRdnBalance();
  else rdnBalance += amount; // fallback (seharusnya tidak pernah terjadi di app ini)
  // Note: saveData() harus dipanggil dari caller utama (addTx/addDiv/submitRdn)
}

function addTx(date,type,ticker,lot,price,sekuritas){
  var isBuy = type==='BUY';
  var gross  = lot*100*price;
  var c      = calcTxComponents(gross, isBuy, sekuritas);
  var txId   = nextTxId++;
  // tax = ppn + levy + pph (semua komponen non-komisi, untuk backward compat display)
  transactions.push({id:txId,date:date,type:type,ticker:ticker,lot:lot,price:price,
    gross:gross, komisi:c.komisi, ppn:c.ppn, levy:c.levy, pph:c.pph,
    tax:c.ppn+c.levy+c.pph, net:c.net, sekuritas:sekuritas});
  // Update RDN — tag dengan linkedTxId agar bisa dihapus bersama
  if(isBuy){
    addRdn(date,'BUY','Beli '+lot+' lot '+ticker+' @ Rp '+fmt(price),-c.net,sekuritas, txId);
  } else {
    addRdn(date,'SELL','Jual '+lot+' lot '+ticker+' @ Rp '+fmt(price),c.net,sekuritas, txId);
  }
  saveData();
}

function addDiv(date,ticker,shares,dps,pphRate){
  // FIX AUDIT PMK 18/2021: Dividen WP OP DN bebas pajak (0%) jika reinvestasi, atau 10% jika kena tarif
  var rate = (typeof pphRate==='number' && isFinite(pphRate) && pphRate>=0)
    ? pphRate
    : (TAX_SETTINGS.dividenExempt ? 0 : (TAX_SETTINGS.pphDividen || 0));
  var gross = Math.round(shares * dps);
  var tax = Math.round(gross * rate);
  var net = gross - tax;
  var divId = nextDivId++;
  dividends.push({id:divId,date:date,ticker:ticker,shares:shares,dps:dps,gross:gross,tax:tax,net:net,pphRate:rate});
  addRdn(date,'DIVIDEN','Dividen '+ticker+' Rp '+fmt(dps)+'/lbr',net,'—', 'div-'+divId);
  saveData();
}

// ============================================================
// PORTFOLIO CALC
// ============================================================
var _portoCache=null, _portoCacheKey='';
function _invalidatePortoCache(){ _portoCache=null; _portoCacheKey=''; }
function _txHash(){
  return (transactions||[]).reduce(function(h,t){
    return h + [t.id, t.type, t.ticker, t.lot, t.price, t.gross, t.net, t.sekuritas].join(':') + '|';
  }, '');
}
function getTxMultiplier(tx){
  if(!tx) return 100;
  if(tx.unitMultiplier !== undefined && tx.unitMultiplier > 0) return tx.unitMultiplier;
  if(tx.shares && tx.lot) {
    var ratio = tx.shares / tx.lot;
    if(ratio > 0.8 && ratio < 1.2) return 1;
    if(ratio > 80 && ratio < 120) return 100;
  }
  if(tx.gross && tx.price && tx.lot){
    var diff1 = Math.abs(tx.gross - (tx.lot * tx.price));
    var diff100 = Math.abs(tx.gross - (tx.lot * 100 * tx.price));
    if(diff1 < diff100) return 1;
  }
  return 100;
}

function getPortfolio(){
  var heldTickers={};
  (transactions||[]).forEach(function(tx){ heldTickers[tx.ticker]=1; });
  var priceSig=Object.keys(heldTickers).sort().map(function(t){ return t+':'+(prices[t]||0); }).join(',');
  var cacheKey=_txHash()+'#'+priceSig;
  if(_portoCache && _portoCacheKey===cacheKey) return _portoCache;
  var pos={};
  transactions.slice().sort(function(a,b){
    var d = (a.date||'').localeCompare(b.date||'');
    return d !== 0 ? d : ((a.id||0) - (b.id||0));
  }).forEach(function(tx){
    if(!pos[tx.ticker]) pos[tx.ticker]={ticker:tx.ticker,lot:0,shares:0,cost:0,buyNet:0,sellNet:0};
    var p=pos[tx.ticker];
    var isBuy = tx.type==='BUY';
    var mult = getTxMultiplier(tx);
    var txShares = tx.shares ? tx.shares : Math.round(tx.lot * mult);
    var netVal = tx.net || tx.gross || (tx.lot * mult * tx.price);
    if(isBuy){
      p.lot += tx.lot;
      p.shares += txShares;
      p.cost += (tx.gross || netVal);
      p.buyNet += netVal;
    } else {
      var sold = txShares;
      var avg = p.shares > 0 ? (p.cost / p.shares) : (tx.gross / sold);
      p.lot = Math.max(0, p.lot - tx.lot);
      p.shares = Math.max(0, p.shares - sold);
      p.cost = Math.max(0, p.cost - (avg * sold));
      p.sellNet += netVal;
      if(p.shares <= 0) p.cost = 0;
    }
  });
  var result=Object.values(pos).filter(function(p){return p.lot>0}).map(function(p){
    var info=DB[p.ticker]||{name:p.ticker,sector:'Lainnya',beta:1.0};
    var avg=p.shares>0?p.cost/p.shares:0;
    // Prioritas harga: 1. Live price dari feed, 2. Base price DB jika realistis (>100), 3. Harga modal rata-rata beli (avg), 4. info.base
    var mp = (prices[p.ticker] && prices[p.ticker]>0)
      ? prices[p.ticker]
      : ((info.base && info.base > 100) ? info.base : (avg > 0 ? avg : (info.base || 0)));
    var mv=mp*p.shares;
    var unreal=mv-p.cost;
    var ret=p.cost>0?(unreal/p.cost)*100:0;
    return Object.assign({},p,{mp:mp,price:mp,mv:mv,avg:avg,unreal:unreal,ret:ret,info:info});
  });
  _portoCache=result; _portoCacheKey=cacheKey;
  return result;
}

// ── Riwayat Ekuitas Harian (AUM) — satu snapshot per hari, disimpan lokal & cloud ──
function computeCurrentAUM(){
  var porto=(typeof getPortfolio==='function')?getPortfolio():[];
  var cryptoPorto=(typeof getCryptoPortfolio==='function')?getCryptoPortfolio():[];
  var etfPorto=(typeof getEtfPortfolio==='function')?getEtfPortfolio():[];
  var rdPorto=(typeof getRdPortfolio==='function')?getRdPortfolio():[];
  var sahamMV=porto.reduce(function(a,p){return a+(p.mv||0)},0);
  var crMV=cryptoPorto.reduce(function(a,p){return a+(p.mv||0)},0);
  var etfMV=etfPorto.reduce(function(a,p){return a+(p.mvIdr||0)},0);
  var rdMV=rdPorto.reduce(function(a,p){return a+(p.val||p.mv||0)},0);
  var rdn=(typeof calcRdnBalance==='function')?calcRdnBalance('all'):0;
  return Math.round((sahamMV||0)+(crMV||0)+(etfMV||0)+(rdMV||0)+(rdn||0));
}

function isPortfolioDataReady(){
  // Cek apakah data transaksi & RDN sudah diinisialisasi
  var hasTx = (typeof transactions !== 'undefined' && Array.isArray(transactions));
  var hasRdn = (typeof rdnMutations !== 'undefined' && Array.isArray(rdnMutations));
  return hasTx || hasRdn;
}

function rebuildEquityHistoryFromTransactions(existingHist, forceFullRebuild){
  var txs = (typeof transactions !== 'undefined' && Array.isArray(transactions)) ? transactions : [];
  var rdns = (typeof rdnMutations !== 'undefined' && Array.isArray(rdnMutations)) ? rdnMutations : [];
  var divs = (typeof dividends !== 'undefined' && Array.isArray(dividends)) ? dividends : [];
  var cTxs = (typeof cryptoTx !== 'undefined' && Array.isArray(cryptoTx)) ? cryptoTx : [];
  var eTxs = (typeof etfTx !== 'undefined' && Array.isArray(etfTx)) ? etfTx : [];
  var rTxs = (typeof rdTx !== 'undefined' && Array.isArray(rdTx)) ? rdTx : [];

  if (txs.length === 0 && rdns.length === 0 && cTxs.length === 0 && eTxs.length === 0 && rTxs.length === 0) {
    return existingHist || [];
  }

  var allDates = [];
  txs.forEach(function(t){ if(t.date) allDates.push(t.date); });
  rdns.forEach(function(m){ if(m.date) allDates.push(m.date); });
  divs.forEach(function(d){ if(d.date) allDates.push(d.date); });
  cTxs.forEach(function(c){ if(c.date) allDates.push(c.date); });
  eTxs.forEach(function(e){ if(e.date) allDates.push(e.date); });
  rTxs.forEach(function(r){ if(r.date) allDates.push(r.date); });

  if(allDates.length === 0) return existingHist || [];
  allDates.sort();

  var firstDateStr = allDates[0];
  var todayStr = new Date().toISOString().slice(0, 10);
  if (firstDateStr > todayStr) firstDateStr = todayStr;

  var sortedTxs = txs.slice().sort(function(a, b) {
    var d = (a.date || '').localeCompare(b.date || '');
    return d !== 0 ? d : ((a.id || 0) - (b.id || 0));
  });

  var sortedCrypto = cTxs.slice().sort(function(a, b) {
    var d = (a.date || '').localeCompare(b.date || '');
    return d !== 0 ? d : ((a.id || 0) - (b.id || 0));
  });

  var sortedEtf = eTxs.slice().sort(function(a, b) {
    var d = (a.date || '').localeCompare(b.date || '');
    return d !== 0 ? d : ((a.id || 0) - (b.id || 0));
  });

  var sortedRd = rTxs.slice().sort(function(a, b) {
    var d = (a.date || '').localeCompare(b.date || '');
    return d !== 0 ? d : ((a.id || 0) - (b.id || 0));
  });

  var curDate = new Date(firstDateStr + 'T00:00:00');
  var endDate = new Date(todayStr + 'T00:00:00');
  var result = [];

  var stockHoldings = {}; // ticker -> { lot, shares, cost, lastPrice }
  var cryptoHoldings = {}; // coin -> { qty, cost, lastPrice }
  var etfHoldings = {}; // ticker -> { shares, costUSD, costIdr, lastPrice }
  var rdHoldings = {}; // code -> { units, cost, lastNAB }

  while (curDate <= endDate) {
    var dStr = curDate.toISOString().slice(0, 10);

    // 1. Transaksi Saham sampai dStr
    var dayTxs = sortedTxs.filter(function(t) { return t.date === dStr; });
    dayTxs.forEach(function(tx) {
      if (!stockHoldings[tx.ticker]) stockHoldings[tx.ticker] = { lot: 0, shares: 0, cost: 0, lastPrice: tx.price };
      var h = stockHoldings[tx.ticker];
      h.lastPrice = tx.price || h.lastPrice;
      var gross = tx.gross || (tx.lot * 100 * tx.price);
      var net = tx.net || gross;

      if (tx.type === 'BUY') {
        h.lot += tx.lot;
        h.shares += tx.lot * 100;
        h.cost += net;
      } else if (tx.type === 'SELL') {
        var avgCost = h.shares > 0 ? (h.cost / h.shares) : tx.price;
        var soldShares = tx.lot * 100;
        h.lot = Math.max(0, h.lot - tx.lot);
        h.shares = Math.max(0, h.shares - soldShares);
        h.cost = Math.max(0, h.cost - (avgCost * soldShares));
        if (h.shares <= 0) h.cost = 0;
      }
    });

    var stockVal = 0;
    Object.keys(stockHoldings).forEach(function(ticker) {
      var h = stockHoldings[ticker];
      if (h.shares > 0) {
        var pr = (dStr === todayStr && typeof prices !== 'undefined' && prices[ticker])
          ? prices[ticker]
          : (h.lastPrice || (typeof prices !== 'undefined' && prices[ticker]) || ((typeof DB !== 'undefined' && DB[ticker] && DB[ticker].base) ? DB[ticker].base : (h.cost / h.shares)));
        stockVal += h.shares * pr;
      }
    });

    // 2. Transaksi Crypto sampai dStr
    var dayCrypto = sortedCrypto.filter(function(c) { return c.date === dStr; });
    dayCrypto.forEach(function(c) {
      if (!cryptoHoldings[c.coin]) cryptoHoldings[c.coin] = { qty: 0, cost: 0, lastPrice: c.priceIdr };
      var ch = cryptoHoldings[c.coin];
      ch.lastPrice = c.priceIdr || ch.lastPrice;
      if (c.type === 'BUY') {
        ch.qty += c.qty;
        ch.cost += c.total;
      } else if (c.type === 'SELL') {
        var avgCost = ch.qty > 0 ? (ch.cost / ch.qty) : (c.priceIdr || 0);
        ch.qty = Math.max(0, ch.qty - c.qty);
        ch.cost = Math.max(0, ch.cost - avgCost * c.qty);
        if (ch.qty <= 0) ch.cost = 0;
      }
    });

    var cryptoVal = 0;
    Object.keys(cryptoHoldings).forEach(function(coin) {
      var ch = cryptoHoldings[coin];
      if (ch.qty > 0.000001) {
        var info = (typeof CRYPTO_DB !== 'undefined' && CRYPTO_DB[coin]) ? CRYPTO_DB[coin] : null;
        var pr = (dStr === todayStr && typeof cryptoPrices !== 'undefined' && cryptoPrices[coin])
          ? cryptoPrices[coin]
          : (ch.lastPrice || (typeof cryptoPrices !== 'undefined' && cryptoPrices[coin]) || (info && (info.baseIDR || (info.baseUSD ? info.baseUSD * usdIdr : 0))) || (ch.cost / ch.qty));
        cryptoVal += ch.qty * pr;
      }
    });

    // 3. Transaksi ETF sampai dStr
    var dayEtf = sortedEtf.filter(function(e) { return e.date === dStr; });
    dayEtf.forEach(function(e) {
      if (!etfHoldings[e.ticker]) etfHoldings[e.ticker] = { shares: 0, costUSD: 0, costIdr: 0, lastPrice: e.priceUSD };
      var eh = etfHoldings[e.ticker];
      eh.lastPrice = e.priceUSD || eh.lastPrice;
      if (e.type === 'BUY') {
        eh.shares += e.shares;
        eh.costUSD += e.totalUSD;
        eh.costIdr += e.totalIdr;
      } else if (e.type === 'SELL') {
        var avgUSD = eh.shares > 0 ? (eh.costUSD / eh.shares) : e.priceUSD;
        var avgIdr = eh.shares > 0 ? (eh.costIdr / eh.shares) : (e.totalIdr / e.shares);
        eh.shares = Math.max(0, eh.shares - e.shares);
        eh.costUSD = Math.max(0, eh.costUSD - avgUSD * e.shares);
        eh.costIdr = Math.max(0, eh.costIdr - avgIdr * e.shares);
        if (eh.shares <= 0) { eh.costUSD = 0; eh.costIdr = 0; }
      }
    });

    var etfVal = 0;
    Object.keys(etfHoldings).forEach(function(ticker) {
      var eh = etfHoldings[ticker];
      if (eh.shares > 0) {
        var info = (typeof ETF_DB !== 'undefined' && ETF_DB[ticker]) ? ETF_DB[ticker] : null;
        var prUSD = (dStr === todayStr && typeof etfPrices !== 'undefined' && etfPrices[ticker])
          ? etfPrices[ticker]
          : (eh.lastPrice || (typeof etfPrices !== 'undefined' && etfPrices[ticker]) || (info && info.baseUSD) || (eh.costUSD / eh.shares));
        etfVal += eh.shares * prUSD * (typeof usdIdr !== 'undefined' ? usdIdr : 16000);
      }
    });

    // 4. Transaksi Reksa Dana sampai dStr
    var dayRd = sortedRd.filter(function(r) { return r.date === dStr; });
    dayRd.forEach(function(r) {
      if (!rdHoldings[r.code]) rdHoldings[r.code] = { units: 0, cost: 0, lastNAB: r.nab };
      var rh = rdHoldings[r.code];
      rh.lastNAB = r.nab || rh.lastNAB;
      if (r.type === 'BELI' || r.type === 'BUY') {
        rh.units += (r.units || (r.amount / (r.nab || 1000)));
        rh.cost += r.amount;
      } else if (r.type === 'JUAL' || r.type === 'SELL') {
        var avgNAB = rh.units > 0 ? (rh.cost / rh.units) : r.nab;
        var soldUnits = (r.units || (r.amount / (r.nab || 1000)));
        rh.units = Math.max(0, rh.units - soldUnits);
        rh.cost = Math.max(0, rh.cost - avgNAB * soldUnits);
        if (rh.units <= 0) rh.cost = 0;
      }
    });

    var rdVal = 0;
    Object.keys(rdHoldings).forEach(function(code) {
      var rh = rdHoldings[code];
      if (rh.units > 0.001) {
        var info = (typeof RD_DB !== 'undefined' && RD_DB[code]) ? RD_DB[code] : null;
        var nab = (dStr === todayStr && typeof rdNAB !== 'undefined' && rdNAB[code])
          ? rdNAB[code]
          : (rh.lastNAB || (typeof rdNAB !== 'undefined' && rdNAB[code]) || (info && info.baseNAB) || 1000);
        rdVal += rh.units * nab;
      }
    });

    // 5. Kas Saldo RDN Ledger sampai dStr
    var dayRdn = 0;
    rdns.forEach(function(m) {
      if (m.date && m.date <= dStr) {
        dayRdn += (m.amount || 0);
      }
    });
    if (dayRdn < 0) dayRdn = 0;

    var calculatedEquity = stockVal + cryptoVal + etfVal + rdVal + dayRdn;

    if (dStr === todayStr && typeof computeCurrentAUM === 'function') {
      var liveAum = computeCurrentAUM();
      if (liveAum > 0) calculatedEquity = liveAum;
    }

    result.push({
      date: dStr,
      equity: Math.round(calculatedEquity)
    });

    curDate.setDate(curDate.getDate() + 1);
  }

  return result;
}

function equityHistoryLoad(){
  var raw = [];
  try{ raw = JSON.parse(localStorage.getItem('equityHistory')||'[]'); }catch(e){ raw = []; }

  // Rekonstruksi atau validasi histori dari data transaksi riil
  var hasTx = (typeof transactions !== 'undefined' && transactions && transactions.length > 0)
    || (typeof rdnMutations !== 'undefined' && rdnMutations && rdnMutations.length > 0)
    || (typeof cryptoTx !== 'undefined' && cryptoTx && cryptoTx.length > 0);

  if (hasTx) {
    var minTxDate = '';
    if(transactions.length) minTxDate = transactions.reduce(function(min, t){ return (t.date && (!min || t.date < min)) ? t.date : min; }, '');
    if(rdnMutations.length) {
      var minRdnDate = rdnMutations.reduce(function(min, m){ return (m.date && (!min || m.date < min)) ? m.date : min; }, '');
      if(!minTxDate || (minRdnDate && minRdnDate < minTxDate)) minTxDate = minRdnDate;
    }

    var needsRebuild = false;
    if (!raw || raw.length <= 1) {
      needsRebuild = true;
    } else if (minTxDate && raw[0] && raw[0].date > minTxDate) {
      needsRebuild = true;
    } else if (raw.some(function(h){ return !h || typeof h.equity !== 'number' || isNaN(h.equity) || h.equity <= 0; })) {
      needsRebuild = true;
    }

    if (needsRebuild) {
      var rebuilt = rebuildEquityHistoryFromTransactions(raw, true);
      if (rebuilt && rebuilt.length > 0) {
        equityHistorySave(rebuilt);
        return rebuilt;
      }
    }
  }

  return raw;
}

function equityHistorySave(arr){
  try{
    localStorage.setItem('equityHistory', JSON.stringify(arr));
  }catch(e){}
}

function equitySnapshotToday(){
  if(!isPortfolioDataReady()) return [];
  if(!transactions.length && !(rdnMutations&&rdnMutations.length)) return [];
  
  var today=new Date().toISOString().slice(0,10);
  var aum=computeCurrentAUM();
  if(aum <= 0) return equityHistoryLoad();

  var hist=equityHistoryLoad();

  if(!hist || hist.length===0){
    hist = rebuildEquityHistoryFromTransactions([{date:today, equity:aum}], true);
  } else {
    var last=hist[hist.length-1];
    if(last && last.date===today) {
      last.equity=aum;
    } else {
      hist.push({date:today,equity:aum});
    }
  }

  if(hist.length>730) hist=hist.slice(-730);
  equityHistorySave(hist);
  return hist;
}

function validateAndSyncEquityHistory(forceRebuild){
  var currentAum = computeCurrentAUM();
  var hist = equityHistoryLoad();
  var rebuilt = rebuildEquityHistoryFromTransactions(hist, true);
  
  var today = new Date().toISOString().slice(0,10);
  if(rebuilt.length > 0 && currentAum > 0){
    var last = rebuilt[rebuilt.length-1];
    if(last.date === today){
      last.equity = currentAum;
    }
  }
  
  equityHistorySave(rebuilt);
  return rebuilt;
}

function getRealizedPnl(){
  var perf = getStockPerformanceByTicker();
  return perf.reduce(function(a, r){ return a + (r.realized || 0); }, 0);
}

// ── Kalkulasi Metrik Kronologis Transaksi (P&L & Modal Rata-rata per Transaksi) ──
function calcChronologicalTxMetrics(){
  var sorted = transactions.slice().sort(function(a,b){
    var d = (a.date||'').localeCompare(b.date||'');
    return d !== 0 ? d : ((a.id||0) - (b.id||0));
  });
  var pos = {}; // ticker -> { lot, shares, grossCost, netCost }
  var metrics = {}; // txId -> { avgGrossBuy, avgNetBuy, pnlGross, pnlNet, pnlPct, pnlNetPct, remainingLot }
  sorted.forEach(function(tx){
    if(!pos[tx.ticker]) pos[tx.ticker] = { lot:0, shares:0, grossCost:0, netCost:0, buyNet:0, sellNet:0 };
    var p = pos[tx.ticker];
    var isBuy = tx.type === 'BUY';
    var txGross = tx.gross || (tx.lot * 100 * tx.price);
    var txNet = tx.net || txGross;
    if(isBuy){
      p.lot += tx.lot;
      p.shares += tx.lot * 100;
      p.grossCost += txGross;
      p.netCost += txNet;
      p.buyNet += txNet;
      var avgGross = p.shares > 0 ? p.grossCost / p.shares : tx.price;
      var avgNet = p.shares > 0 ? p.netCost / p.shares : (txNet / (tx.lot * 100));
      metrics[tx.id] = {
        avgGrossBuy: avgGross,
        avgNetBuy: avgNet,
        pnlGross: null,
        pnlNet: null,
        pnlPct: null,
        pnlNetPct: null,
        remainingLot: p.lot
      };
    } else {
      // SELL
      var soldShares = tx.lot * 100;
      var avgGross = p.shares > 0 ? p.grossCost / p.shares : tx.price;
      var avgNet = p.shares > 0 ? p.netCost / p.shares : (txNet / soldShares);
      var grossCostBasis = avgGross * soldShares;
      var netCostBasis = avgNet * soldShares;
      var pnlGross = txGross - grossCostBasis;
      var pnlNet = txNet - netCostBasis;
      var pnlPct = grossCostBasis > 0 ? (pnlGross / grossCostBasis) * 100 : 0;
      var pnlNetPct = netCostBasis > 0 ? (pnlNet / netCostBasis) * 100 : 0;

      p.lot = Math.max(0, p.lot - tx.lot);
      p.shares = Math.max(0, p.shares - soldShares);
      p.grossCost = Math.max(0, p.grossCost - grossCostBasis);
      p.netCost = Math.max(0, p.netCost - netCostBasis);
      if(p.shares <= 0) { p.grossCost = 0; p.netCost = 0; }
      p.sellNet += txNet;

      metrics[tx.id] = {
        avgGrossBuy: avgGross,
        avgNetBuy: avgNet,
        pnlGross: pnlGross,
        pnlNet: pnlNet,
        pnlPct: pnlPct,
        pnlNetPct: pnlNetPct,
        grossCostBasis: grossCostBasis,
        netCostBasis: netCostBasis,
        remainingLot: p.lot
      };
    }
  });
  return metrics;
}

// ── Performa per Saham (Stock B Model) — Realized P&L (Weighted Average Basis) + Unrealized P&L ──
// Sesuai audit finansial: Realized pada jual sebagian dihitung dari (proceedsNet - (avgNetCost * sharesSold))
function getStockPerformanceByTicker(){
  var pos={};
  (transactions||[]).slice().sort(function(a,b){
    var d = (a.date||'').localeCompare(b.date||'');
    return d !== 0 ? d : ((a.id||0) - (b.id||0));
  }).forEach(function(tx){
    if(!pos[tx.ticker]) pos[tx.ticker]={ticker:tx.ticker,lot:0,shares:0,cost:0,netCost:0,buyNet:0,sellNet:0,realizedNet:0,firstDate:tx.date,lastDate:tx.date,txCount:0};
    var p=pos[tx.ticker];
    p.txCount++; p.lastDate=tx.date;
    var mult = getTxMultiplier(tx);
    var txShares = tx.shares ? tx.shares : Math.round(tx.lot * mult);
    var txGross = tx.gross || (tx.lot * mult * tx.price);
    var txNet = tx.net || txGross;
    if(tx.type==='BUY'){
      p.lot += tx.lot;
      p.shares += txShares;
      p.cost += txGross;
      p.netCost += txNet;
      p.buyNet += txNet;
    } else if(tx.type==='SELL'){
      var sold = txShares;
      var avgGross = p.shares > 0 ? (p.cost / p.shares) : tx.price;
      var avgNet = p.shares > 0 ? (p.netCost / p.shares) : (txNet / sold);
      var grossCostBasis = avgGross * sold;
      var netCostBasis = avgNet * sold;
      var pnlNet = txNet - netCostBasis;
      p.realizedNet += pnlNet; // Boleh bernilai positif (untung) maupun negatif (rugi)

      p.lot = Math.max(0, p.lot - tx.lot);
      p.shares = Math.max(0, p.shares - sold);
      p.cost = Math.max(0, p.cost - grossCostBasis);
      p.netCost = Math.max(0, p.netCost - netCostBasis);
      if(p.shares <= 0) { p.cost = 0; p.netCost = 0; }
      p.sellNet += txNet;
    }
  });
  var portoByTicker={};
  getPortfolio().forEach(function(p){ portoByTicker[p.ticker]=p; });
  return Object.keys(pos).map(function(t){
    var p=pos[t], live=portoByTicker[t];
    var isClosed = p.lot <= 0;
    var mv = live ? live.mv : 0;
    var unreal = live ? live.unreal : 0;
    var cost = live ? live.cost : 0;
    var avg = live ? live.avg : 0;
    var realized = Math.round(p.realizedNet);
    return {
      ticker:t, lot:p.lot, shares:p.shares, cost:cost, avg:avg,
      mv:mv, unreal:unreal, realized:realized, total:realized+unreal,
      closed: isClosed, firstDate:p.firstDate, lastDate:p.lastDate, txCount:p.txCount
    };
  });
}

// ── REKALKULASI SELURUH DATA TRANSAKSI & PAJAK SECARA PRESISI (HEALING / MIGRATION) ──
function recalculateAllStoredData(silent){
  if(!Array.isArray(transactions)) transactions = [];
  if(!Array.isArray(dividends)) dividends = [];
  if(!Array.isArray(rdnMutations)) rdnMutations = [];

  var txChanged = 0;
  var divChanged = 0;

  // 1. Rekalkulasi tiap transaksi saham dengan mesin komponen biaya 11% PPN, broker fee baru, & Math.round
  transactions.forEach(function(tx){
    var lot = Number(tx.lot) || 0;
    var price = Number(tx.price) || 0;
    var isBuy = tx.type === 'BUY';
    var sec = tx.sekuritas || (typeof activeSekuritas !== 'undefined' ? activeSekuritas : 'Stockbit') || 'Stockbit';
    var mult = getTxMultiplier(tx);
    var gross = (tx.gross && Math.abs(tx.gross - (lot * mult * price)) < 5000) ? tx.gross : Math.round(lot * mult * price);
    var c = (typeof calcTxComponents === 'function')
      ? calcTxComponents(gross, isBuy, sec)
      : { gross: gross, komisi: Math.round(gross * (isBuy ? 0.0018 : 0.0028)), ppn: 0, levy: 0, pph: 0, net: gross };

    // Jika transaksi sudah memiliki nilai net eksak dan komisi 0 (impor manual)
    if(tx.komisi === 0 && tx.tax === 0 && tx.net && Math.abs(tx.net - gross) < 5000){
      c.komisi = 0; c.ppn = 0; c.levy = 0; c.pph = 0; c.tax = 0; c.net = gross;
    }

    tx.gross = c.gross;
    tx.komisi = c.komisi;
    tx.ppn = c.ppn;
    tx.levy = c.levy;
    tx.pph = c.pph;
    tx.tax = (c.ppn || 0) + (c.levy || 0) + (c.pph || 0);
    tx.serviceFee = c.serviceFee || 0;
    tx.net = c.net;
    tx.sekuritas = sec;
    txChanged++;
  });

  // 2. Sinkronkan mutasi RDN yang terhubung ke transaksi saham
  var txMap = {};
  transactions.forEach(function(t){ txMap[t.id] = t; txMap['tx-' + t.id] = t; });
  rdnMutations.forEach(function(m){
    if(m.linkedTxId && txMap[m.linkedTxId]){
      var tx = txMap[m.linkedTxId];
      m.amount = (tx.type === 'BUY' ? -tx.net : tx.net);
    }
  });

  // 3. Rekalkulasi dividen (PMK 18/2021 dividen bebas pajak 0% jika exempt)
  dividends.forEach(function(d){
    var shares = Number(d.shares) || 0;
    var dps = Number(d.dps) || 0;
    var gross = Math.round(shares * dps);
    var rate = (typeof d.pphRate === 'number' && isFinite(d.pphRate) && d.pphRate >= 0)
      ? d.pphRate
      : (TAX_SETTINGS.dividenExempt ? 0 : (TAX_SETTINGS.pphDividen || 0));
    var tax = Math.round(gross * rate);
    var net = gross - tax;
    d.gross = gross;
    d.tax = tax;
    d.net = net;
    divChanged++;
  });

  // 4. Sinkronkan mutasi RDN yang terhubung ke dividen
  var divMap = {};
  dividends.forEach(function(d){ divMap['div-' + d.id] = d; });
  rdnMutations.forEach(function(m){
    if(m.linkedTxId && divMap[m.linkedTxId]){
      var d = divMap[m.linkedTxId];
      m.amount = d.net;
    }
  });

  // 5. Invalidate cache dan bangun ulang saldo RDN
  _invalidatePortoCache();
  if(typeof rebuildRdnBalance === 'function') rebuildRdnBalance();

  // 6. Simpan perubahan ke storage / cloud
  if(typeof saveData === 'function') saveData();

  if(!silent && typeof showSaveStatus === 'function'){
    showSaveStatus('✓ ' + txChanged + ' transaksi & ' + divChanged + ' dividen berhasil direkalkulasi secara presisi!');
  }
}

function calcRdnBalance(account){
  // FIX AUDIT F3: sebelumnya fungsi ini "percaya" variabel cache rdnBalance
  // apa adanya (hanya menghitung ulang jika kebetulan 0) — model kepercayaan
  // BEDA dari rebuildRdnBalance() yang SELALU menghitung ulang penuh. Dua
  // fungsi berbeda untuk satu nilai yang sama = pelanggaran Single Source of
  // Truth (lihat AUDIT_FINANCIAL_ENGINE.md Temuan #3). Sekarang calcRdnBalance
  // HANYA memanggil rebuildRdnBalance() dan mengembalikan hasilnya — satu
  // jalur kebenaran untuk keduanya. Aman secara performa: rdnMutations biasa
  // berjumlah puluhan-ratusan baris, bukan jutaan.
  if(!Array.isArray(rdnMutations)) rdnMutations = [];
  if(typeof rebuildRdnBalance === 'function'){
    rebuildRdnBalance();
    if(account === 'crypto') return (typeof CASH_ACCOUNTS !== 'undefined' && CASH_ACCOUNTS.crypto) ? (CASH_ACCOUNTS.crypto.balance||0) : 0;
    if(account === 'reksadana') return (typeof CASH_ACCOUNTS !== 'undefined' && CASH_ACCOUNTS.reksadana) ? (CASH_ACCOUNTS.reksadana.balance||0) : 0;
    if(account === 'all'){
      var s = (typeof CASH_ACCOUNTS !== 'undefined' && CASH_ACCOUNTS.saham) ? CASH_ACCOUNTS.saham.balance : rdnBalance;
      var c = (typeof CASH_ACCOUNTS !== 'undefined' && CASH_ACCOUNTS.crypto) ? CASH_ACCOUNTS.crypto.balance : 0;
      var r = (typeof CASH_ACCOUNTS !== 'undefined' && CASH_ACCOUNTS.reksadana) ? CASH_ACCOUNTS.reksadana.balance : 0;
      return (s||0) + (c||0) + (r||0);
    }
    return rdnBalance;
  }
  // Fallback jika rebuildRdnBalance entah kenapa belum termuat
  var bal = 0;
  rdnMutations.forEach(function(r){
    var acc = r.account || 'saham';
    if(account && account !== 'all' && acc !== account) return;
    if(typeof r.amount === 'number' && r.amount !== 0) bal += r.amount;
    else bal += (Number(r.amountIn||r.amount_in||0)) - (Number(r.amountOut||r.amount_out||0));
  });
  return isNaN(bal) ? 0 : bal;
}

// ============================================================
// MARKET
// ── HIDE/SHOW METRIC VALUES ──────────────────────────────────
var _hiddenMetrics = {};
var MASK = '••••••••';

function loadHiddenMetrics(){
  try{ _hiddenMetrics=JSON.parse(localStorage.getItem('ihsg_hidden_metrics')||'{}'); }catch(e){}
}
function saveHiddenMetrics(){
  try{ localStorage.setItem('ihsg_hidden_metrics', JSON.stringify(_hiddenMetrics)); }catch(e){}
}

// Called after renderDashboard to re-apply masks
function applyMetricMasks(){
  ['aum','unreal','real','rdn','div'].forEach(function(k){
    if(_hiddenMetrics[k]) _maskMetric(k);
    else _unmaskMetric(k);
  });
}

function _maskMetric(k){
  var val=el('d-'+k), eye=el('eye-'+k);
  if(!val) return;
  if(!val._rv) val._rv=val.innerHTML;
  val.innerHTML='<span style="letter-spacing:3px;color:var(--text3)">••••••••</span>';
  if(eye) eye.textContent='🚫';
  // Hide sub-elements for AUM
  if(k==='aum'){
    var s=el('d-aum-sub'),b=el('d-aum-badges');
    if(s&&!s._rv){s._rv=s.innerHTML;s.innerHTML='';}
    if(b&&!b._rv){b._rv=b.innerHTML;b.innerHTML='';}
  }
  if(k==='unreal'){
    var s2=el('d-unreal-sub'); if(s2&&!s2._rv){s2._rv=s2.innerHTML;s2.innerHTML='';}
  }
}

function _unmaskMetric(k){
  var val=el('d-'+k), eye=el('eye-'+k);
  if(!val) return;
  if(val._rv){val.innerHTML=val._rv; delete val._rv;}
  if(eye) eye.textContent='👁';
  if(k==='aum'){
    var s=el('d-aum-sub'),b=el('d-aum-badges');
    if(s&&s._rv){s.innerHTML=s._rv; delete s._rv;}
    if(b&&b._rv){b.innerHTML=b._rv; delete b._rv;}
  }
  if(k==='unreal'){
    var s2=el('d-unreal-sub'); if(s2&&s2._rv){s2.innerHTML=s2._rv; delete s2._rv;}
  }
}

function toggleMetric(k){
  _hiddenMetrics[k]=!_hiddenMetrics[k];
  saveHiddenMetrics();
  if(_hiddenMetrics[k]) _maskMetric(k);
  else {
    // Force renderDashboard to repopulate, then unmask
    delete el('d-'+k)._rv;
    renderDashboard();
    // renderDashboard will call applyMetricMasks() which leaves this one unmasked
  }
}

// ============================================================
// YAHOO FINANCE REALTIME ENGINE (tanpa API key)
// ============================================================
var FH = {
  status: 'off',              // 'off' | 'live' | 'error' | 'loading'
  timer: null,                // interval handle
  IHSG_SYM: '%5EJKSE',        // ^JKSE URL-encoded
  USD_SYM:  'USDIDR%3DX',     // USDIDR=X URL-encoded
  _stockIdx: 0,
  _simTimer: null,
  PROXIES: (function(){
    var isStatic = typeof window !== 'undefined' && window.location && (
      (window.location.hostname || '').indexOf('github.io') !== -1 ||
      window.location.protocol === 'file:' ||
      (window.location.hostname || '').indexOf('pages.dev') !== -1
    );
    if(isStatic){
      return [
        { name: 'allorigins_get', isWrapped: true, url: function(u){ return 'https://api.allorigins.win/get?url=' + encodeURIComponent(u); } },
        { name: 'codetabs', isWrapped: false, url: function(u){ return 'https://api.codetabs.com/v1/proxy?quest=' + encodeURIComponent(u); } }
      ];
    }
    return [
      { name: 'local_proxy', isWrapped: false, url: function(u){ return '/api/proxy?url=' + encodeURIComponent(u); } },
      { name: 'allorigins_get', isWrapped: true, url: function(u){ return 'https://api.allorigins.win/get?url=' + encodeURIComponent(u); } },
      { name: 'codetabs', isWrapped: false, url: function(u){ return 'https://api.codetabs.com/v1/proxy?quest=' + encodeURIComponent(u); } }
    ];
  })()
};

var _proxyFailureCount = 0;
var _proxyCircuitOpenUntil = 0;

// ── Core: fetch Yahoo Finance chart endpoint, mencoba tiap proxy berurutan ──
function yfFetch(symbol, cb, proxyIdx){
  if(Date.now() < _proxyCircuitOpenUntil){
    cb(new Error('CIRCUIT_OPEN'), null);
    return;
  }

  proxyIdx = proxyIdx || 0;
  if(proxyIdx >= FH.PROXIES.length){
    _proxyFailureCount++;
    if(_proxyFailureCount >= 3){
      // Buka circuit breaker selama 5 menit jika proxy publik offline agar console tidak dibanjiri error
      _proxyCircuitOpenUntil = Date.now() + (5 * 60 * 1000);
      console.log('[Feed Engine] Proxy eksternal offline/rate-limited. Menggunakan data baseline lokal.');
      if(typeof fhSetBadge === 'function') fhSetBadge('off', '● Data Baseline');
    }
    cb(new Error('ALL_PROXIES_FAILED'), null);
    return;
  }

  var host = 'query1.finance.yahoo.com';
  var yUrl = 'https://' + host + '/v8/finance/chart/' + symbol + '?interval=1d&range=1d';
  var proxyConfig = FH.PROXIES[proxyIdx];
  var url = proxyConfig.url(yUrl);

  var controller = null;
  var timeoutId = null;
  if(typeof AbortController !== 'undefined'){
    controller = new AbortController();
    timeoutId = setTimeout(function(){ controller.abort(); }, 5000);
  }

  fetch(url, { signal: controller ? controller.signal : undefined })
  .then(function(r){
    if(timeoutId) clearTimeout(timeoutId);
    if(!r.ok){ throw new Error('HTTP_' + r.status); }
    return r.json();
  })
  .then(function(d){
    var rawObj = d;
    if(proxyConfig.isWrapped && d && d.contents){
      try { rawObj = JSON.parse(d.contents); } catch(e){ throw new Error('PARSE_ERROR'); }
    }
    var result = rawObj && rawObj.chart && rawObj.chart.result && rawObj.chart.result[0];
    var meta = result && result.meta;
    if(meta && meta.regularMarketPrice > 0){
      _proxyFailureCount = 0;
      cb(null, meta);
    } else {
      throw new Error('NO_DATA');
    }
  })
  .catch(function(){
    if(timeoutId) clearTimeout(timeoutId);
    yfFetch(symbol, cb, proxyIdx + 1);
  });
}

// FIX: fungsi ini menggantikan data acak (Math.random) di chart 24 jam
// BTC/ETH — sebelumnya seluruh titik data chart dibangkitkan dari noise
// acak di sekitar harga saat ini, bukan histori sungguhan. Yahoo Finance
// chart API sebenarnya SUDAH mengembalikan deret waktu penuh (timestamp[]
// + indicators.quote[0].close[]) di respons yang sama dengan yang dipakai
// yfFetch() — yfFetch() hanya membuang deret itu dan mengambil meta saja.
// Fungsi ini memakai proxy chain (FH.PROXIES) yang sama, tapi interval=15m
// range=1d agar dapat ~96 titik data 24 jam terakhir yang riil.
function fhFetchCryptoHistory(symbol, cb, proxyIdx){
  proxyIdx = proxyIdx || 0;
  if(proxyIdx >= FH.PROXIES.length){ cb(new Error('ALL_PROXIES_FAILED'), null); return; }

  var host = 'query1.finance.yahoo.com';
  var yUrl = 'https://' + host + '/v8/finance/chart/' + symbol + '?interval=15m&range=1d';
  var proxyConfig = FH.PROXIES[proxyIdx];
  var url = proxyConfig.url(yUrl);

  var controller = null, timeoutId = null;
  if(typeof AbortController !== 'undefined'){
    controller = new AbortController();
    timeoutId = setTimeout(function(){ controller.abort(); }, 6000);
  }

  fetch(url, { signal: controller ? controller.signal : undefined })
  .then(function(r){
    if(timeoutId) clearTimeout(timeoutId);
    if(!r.ok){ throw new Error('HTTP_' + r.status); }
    return r.json();
  })
  .then(function(d){
    var rawObj = d;
    if(proxyConfig.isWrapped && d && d.contents){
      try { rawObj = JSON.parse(d.contents); } catch(e){ throw new Error('PARSE_ERROR'); }
    }
    var result = rawObj && rawObj.chart && rawObj.chart.result && rawObj.chart.result[0];
    var ts = result && result.timestamp;
    var closes = result && result.indicators && result.indicators.quote && result.indicators.quote[0] && result.indicators.quote[0].close;
    if(ts && closes && ts.length){
      var points = [];
      for(var i=0;i<ts.length;i++){
        if(closes[i]!=null) points.push({t: ts[i]*1000, c: closes[i]});
      }
      if(points.length){ cb(null, points); return; }
    }
    throw new Error('NO_DATA');
  })
  .catch(function(){
    if(timeoutId) clearTimeout(timeoutId);
    fhFetchCryptoHistory(symbol, cb, proxyIdx + 1);
  });
}

// ── Real daily OHLCV cache for the Crypto Technical Terminal ──
// FIX AUDIT (Crypto Technical Terminal): analyzeCryptoTechnical() in
// 36-crypto-technical.js used to run 100% on a seeded pseudo-random walk
// (generateCryptoOHLCV) for every candle, every volume bar, and every
// "whale spike" — only the current spot price was ever real. RSI, MACD,
// Whale Accumulation Score etc. were all computed from invented history.
// This cache fetches genuine daily OHLCV from Yahoo Finance (SYMBOL-USD,
// 1y range) via the same proxy chain as the rest of the app, so the daily/
// weekly timeframe (the default, and what the Crypto Portfolio radar
// banner uses) is backed by real prices and real volume.
var CRYPTO_DAILY_STORE = {}; // { SYM: { rows: [{t,o,h,l,c,v}], fetchedAt } }
var CRYPTO_DAILY_INFLIGHT = {};
var CRYPTO_DAILY_TTL_MS = 15 * 60 * 1000; // 15 minutes

function rdGetCryptoDaily(sym){
  var e = CRYPTO_DAILY_STORE[sym];
  return (e && e.rows && e.rows.length >= 20) ? e.rows : null;
}

function fhFetchCryptoDailyHistory(symbol, cb, proxyIdx){
  proxyIdx = proxyIdx || 0;
  if(proxyIdx >= FH.PROXIES.length){ cb(new Error('ALL_PROXIES_FAILED'), null); return; }

  var host = 'query1.finance.yahoo.com';
  var yUrl = 'https://' + host + '/v8/finance/chart/' + symbol + '-USD?interval=1d&range=1y';
  var proxyConfig = FH.PROXIES[proxyIdx];
  var url = proxyConfig.url(yUrl);

  var controller = null, timeoutId = null;
  if(typeof AbortController !== 'undefined'){
    controller = new AbortController();
    timeoutId = setTimeout(function(){ controller.abort(); }, 8000);
  }

  fetch(url, { signal: controller ? controller.signal : undefined })
  .then(function(r){
    if(timeoutId) clearTimeout(timeoutId);
    if(!r.ok){ throw new Error('HTTP_' + r.status); }
    return r.json();
  })
  .then(function(d){
    var rawObj = d;
    if(proxyConfig.isWrapped && d && d.contents){
      try { rawObj = JSON.parse(d.contents); } catch(e){ throw new Error('PARSE_ERROR'); }
    }
    var result = rawObj && rawObj.chart && rawObj.chart.result && rawObj.chart.result[0];
    var ts = result && result.timestamp;
    var q = result && result.indicators && result.indicators.quote && result.indicators.quote[0];
    if(ts && q && q.close && ts.length){
      var rows = [];
      for(var i=0;i<ts.length;i++){
        if(q.close[i]==null || q.open[i]==null) continue;
        rows.push({ t: ts[i]*1000, o: q.open[i], h: q.high[i], l: q.low[i], c: q.close[i], v: q.volume[i] || 0 });
      }
      if(rows.length >= 20){ cb(null, rows); return; }
    }
    throw new Error('NO_DATA');
  })
  .catch(function(){
    if(timeoutId) clearTimeout(timeoutId);
    fhFetchCryptoDailyHistory(symbol, cb, proxyIdx + 1);
  });
}

function rdEnsureCryptoDaily(sym, cb){
  var cached = rdGetCryptoDaily(sym);
  var entry = CRYPTO_DAILY_STORE[sym];
  if(cached && entry && (Date.now() - entry.fetchedAt) < CRYPTO_DAILY_TTL_MS){
    if(cb) cb(cached);
    return;
  }
  if(CRYPTO_DAILY_INFLIGHT[sym]) return;
  CRYPTO_DAILY_INFLIGHT[sym] = true;
  fhFetchCryptoDailyHistory(sym, function(err, rows){
    CRYPTO_DAILY_INFLIGHT[sym] = false;
    if(!err && rows && rows.length){
      CRYPTO_DAILY_STORE[sym] = { rows: rows, fetchedAt: Date.now() };
      if(cb) cb(rows);
    }
  });
}
window.rdGetCryptoDaily = rdGetCryptoDaily;
window.rdEnsureCryptoDaily = rdEnsureCryptoDaily;

// ── Update badge UI ──
function fhSetBadge(status, text){
  FH.status = status;
  fhUpdateLoadBanners(status);
  var dot = el('fh-dot'), lbl = el('fh-label'), badge = el('fh-badge');
  if(status==='live'){
    FH.lastSyncAt = Date.now();
    PORTFOLIO_LAST_UPDATED_AT = FH.lastSyncAt;
  }
  if(typeof updateAllLastSyncTimestamps==='function') updateAllLastSyncTimestamps();
  if(!dot||!lbl) return;
  var colors = { live:'#41f3a7', error:'#e21d48', off:'#4a5e82', loading:'#ffc107', limit:'#ffc107' };
  dot.style.background = colors[status]||'#4a5e82';
  lbl.textContent = text;
  if(badge){
    badge.style.borderColor = status==='live'  ? 'rgba(0,229,160,.3)' :
                              status==='error'  ? 'rgba(255,61,90,.3)' :
                              status==='limit'  ? 'rgba(255,193,7,.3)' : 'var(--border)';
  }
}

// Global portfolio sync timestamp & 5-minute background refresh state
var PORTFOLIO_LAST_UPDATED_AT = Date.now();
var PORTFOLIO_REFRESH_INTERVAL_MS = 5 * 60 * 1000; // 5 menit
var _portfolioRefreshIntervalTimer = null;
var _isPortfolioRefreshing = false;

// ── Update semua tampilan label & timestamp "Last Updated" ──
function updateAllLastSyncTimestamps(){
  var ts = PORTFOLIO_LAST_UPDATED_AT || FH.lastSyncAt || Date.now();
  var d = new Date(ts);
  var timeStr = d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  var fullStr = d.toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'medium' });
  var secAgo = Math.max(0, Math.floor((Date.now() - ts) / 1000));

  var relTxt;
  if(secAgo < 8) relTxt = 'baru saja';
  else if(secAgo < 60) relTxt = secAgo + ' dtk lalu';
  else if(secAgo < 3600) relTxt = Math.floor(secAgo / 60) + ' mnt lalu';
  else relTxt = Math.floor(secAgo / 3600) + ' jam lalu';

  // 1. Topbar last updated badge
  var tbTime = el('topbar-last-updated-time');
  if(tbTime){
    tbTime.textContent = timeStr;
    var tbBadge = el('topbar-last-sync-badge');
    if(tbBadge) tbBadge.title = 'Terakhir diperbarui: ' + fullStr + ' (' + relTxt + '). Interval auto-refresh: 5 menit. Klik untuk refresh sekarang.';
  }

  // 2. Dashboard portfolio hub header
  var dashStamp = el('dash-last-updated-stamp');
  var dashRel = el('dash-last-updated-rel');
  if(dashStamp){
    dashStamp.textContent = timeStr;
    dashStamp.title = 'Terakhir disinkronkan: ' + fullStr;
  }
  if(dashRel){
    dashRel.textContent = '(' + relTxt + ')';
    dashRel.style.color = secAgo > 600 ? 'var(--amber)' : 'var(--text3)';
  }

  // 3. Portofolio Saham page header
  var portoStamp = el('porto-last-updated-stamp');
  var portoRel = el('porto-last-updated-rel');
  if(portoStamp){
    portoStamp.textContent = timeStr;
    portoStamp.title = 'Terakhir disinkronkan: ' + fullStr;
  }
  if(portoRel){
    portoRel.textContent = '(' + relTxt + ')';
    portoRel.style.color = secAgo > 600 ? 'var(--amber)' : 'var(--text3)';
  }

  // 4. Legacy fh-lastsync compatibility
  var el2 = el('fh-lastsync');
  if(el2){
    el2.textContent = relTxt;
    el2.style.color = secAgo > 600 ? 'var(--amber)' : 'var(--text3)';
    el2.title = 'Harga terakhir berhasil disinkronkan: ' + fullStr;
  }
}

function fhUpdateLastSyncLabel(){
  updateAllLastSyncTimestamps();
}

// ── Refresh data pasar & portofolio secara komprehensif ──
function refreshPortfolioMarketData(options){
  options = options || {};
  var isManual = !!options.isManual;
  
  if(_isPortfolioRefreshing) return;
  _isPortfolioRefreshing = true;

  // Animasi putar ikon refresh
  var topbarIcon = el('topbar-sync-icon');
  var dashIcon = el('dash-refresh-icon');
  if(topbarIcon) topbarIcon.classList.add('animate-spin');
  if(dashIcon) dashIcon.classList.add('animate-spin');

  if(isManual && typeof showSaveStatus === 'function'){
    showSaveStatus('⏳ Menyinkronkan data pasar portofolio...');
  }

  // 1. Fetch benchmark IHSG & kurs
  fhFetchIHSG();
  fhFetchKurs();

  // 2. Fetch aset portofolio (Saham, Crypto, ETF)
  fhFetchStocks();
  fhFetchCrypto();
  fhFetchEtf();

  // 3. Rekalkulasi dan refresh antarmuka setelah fetch
  setTimeout(function(){
    PORTFOLIO_LAST_UPDATED_AT = Date.now();
    if(FH) FH.lastSyncAt = PORTFOLIO_LAST_UPDATED_AT;

    _invalidatePortoCache();
    if(typeof calcPortfolioVolatilityAndRisk === 'function') calcPortfolioVolatilityAndRisk();
    updatePrices();
    updateTopbar();
    buildTickerTape();

    if(typeof renderPortfolioHub === 'function') renderPortfolioHub();
    if(typeof renderPortoDonut === 'function') renderPortoDonut();

    if(typeof currentPage !== 'undefined'){
      if(currentPage === 'dashboard') { try{ renderDashboard(); }catch(e){} }
      else if(currentPage === 'portofolio') { try{ renderPortofolio(); }catch(e){} }
      else if(currentPage === 'performance') { try{ renderStockPerformance(); }catch(e){} }
      else if(currentPage === 'wealth') { try{ if(typeof renderWealthOverview==='function') renderWealthOverview(); }catch(e){} }
    }

    updateAllLastSyncTimestamps();

    if(topbarIcon) topbarIcon.classList.remove('animate-spin');
    if(dashIcon) dashIcon.classList.remove('animate-spin');
    _isPortfolioRefreshing = false;

    if(isManual){
      if(typeof showSaveStatus === 'function') showSaveStatus('✓ Data portofolio berhasil diperbarui');
      if(typeof showToast === 'function') showToast('🔄 Data pasar portofolio berhasil disinkronkan');
    }
    if(typeof options.onComplete === 'function') options.onComplete();
  }, 1200);
}

// ── Inisialisasi interval latar belakang 5 menit ──
function startPortfolioBackgroundInterval(){
  if(_portfolioRefreshIntervalTimer) clearInterval(_portfolioRefreshIntervalTimer);
  _portfolioRefreshIntervalTimer = setInterval(function(){
    console.log('[Portfolio Engine] Background 5-minute auto-refresh triggered at ' + new Date().toLocaleTimeString());
    refreshPortfolioMarketData({ isBackground: true });
  }, PORTFOLIO_REFRESH_INTERVAL_MS);
}

window.PORTFOLIO_LAST_UPDATED_AT = PORTFOLIO_LAST_UPDATED_AT;
window.PORTFOLIO_REFRESH_INTERVAL_MS = PORTFOLIO_REFRESH_INTERVAL_MS;
window.refreshPortfolioMarketData = refreshPortfolioMarketData;
window.updateAllLastSyncTimestamps = updateAllLastSyncTimestamps;
window.startPortfolioBackgroundInterval = startPortfolioBackgroundInterval;

// ── Banner loading ringan di Dashboard & Portofolio Saham — status pengambilan harga live ──
function fhUpdateLoadBanners(status){
  var msg = status==='loading' ? '⏳ Memuat harga live dari Yahoo Finance...'
          : (status==='error'||status==='limit') ? '⚠ Gagal terhubung ke sumber harga — menampilkan data tersimpan terakhir'
          : null;
  [['dash-load-banner','dash-load-text'],['porto-load-banner','porto-load-text']].forEach(function(pair){
    var banner=el(pair[0]), text=el(pair[1]);
    if(!banner||!text) return;
    if(msg){
      banner.className='load-banner on '+(status==='loading'?'st-loading':'st-error');
      text.textContent=msg;
    } else {
      banner.className='load-banner';
    }
  });
}

// ── Fetch IHSG via Yahoo Finance ──
function fhFetchIHSG(){
  yfFetch(FH.IHSG_SYM, function(err, meta){
    if(err){
      // Jika fetch live gagal, gunakan harga referensi/terakhir tanpa merusak UI
      if(ihsgCur > 0){
        fhApplyIHSG(ihsgCur, ihsgBase, 0, 0, 0);
        fhSetBadge('off','● Terakhir');
      } else {
        fhSetBadge('error','IHSG Gagal');
      }
      return;
    }
    fhApplyIHSG(
      meta.regularMarketPrice,
      meta.previousClose||meta.regularMarketPrice,
      meta.regularMarketOpen||meta.regularMarketPrice,
      meta.regularMarketDayHigh||meta.regularMarketPrice,
      meta.regularMarketDayLow||meta.regularMarketPrice
    );
    fhSetBadge('live','● LIVE');
  });
}

function fhApplyIHSG(price, prev, open, high, low){
  if(!price || isNaN(price) || price <= 0) return;
  ihsgCur  = Math.round(price * 100) / 100;
  ihsgBase = (prev && prev > 0) ? Math.round(prev * 100) / 100 : ihsgCur;
  
  var opVal = (open && open > 0) ? open : (ihsgBase || ihsgCur);
  var hiVal = (high && high > 0) ? high : Math.max(ihsgCur, opVal);
  var loVal = (low && low > 0) ? low : Math.min(ihsgCur, opVal);

  var eOp = el('ihsg-op'); if(eOp) eOp.textContent = opVal.toLocaleString('id-ID', {minimumFractionDigits:2, maximumFractionDigits:2});
  var eHi = el('ihsg-hi'); if(eHi) eHi.textContent = hiVal.toLocaleString('id-ID', {minimumFractionDigits:2, maximumFractionDigits:2});
  var eLo = el('ihsg-lo'); if(eLo) eLo.textContent = loVal.toLocaleString('id-ID', {minimumFractionDigits:2, maximumFractionDigits:2});

  ihsgHistPush(ihsgCur);
  updateTopbar();
  if(typeof currentPage !== 'undefined' && currentPage === 'dashboard'){
    try{ buildIhsgChart(window._currentIhsgTf || '1H'); }catch(e){}
    try{ renderPage('dashboard'); }catch(e){}
  }
}

// ── Fetch harga saham IDX via Yahoo Finance ──
// Semua ticker portofolio diambil dalam satu putaran, dijeda 1,5 dtk per request
// agar tidak membanjiri proxy publik. previousClose disimpan untuk % harian akurat.
var prevCloses = {};
function fhFetchStocks(){
  var porto = getPortfolio();
  var codes = porto.length > 0
    ? porto.map(function(p){ return p.ticker; })
    : ['BBCA','BBRI','BMRI','TLKM','ASII','ANTM'];
  // Sertakan ticker yang sedang dilihat di Candlestick/Flowscan + active price alerts,
  // supaya analisa dan monitoring alert harga selalu update
  var extra = ['BBCA','BBRI','TLKM'];
  if(typeof CD_TICKER!=='undefined' && CD_TICKER) extra.unshift(CD_TICKER);
  if(typeof mwGetPriceAlerts==='function'){
    var activeAls = mwGetPriceAlerts().filter(function(a){ return a.status==='ACTIVE'; });
    activeAls.forEach(function(a){ if(extra.indexOf(a.ticker)<0) extra.push(a.ticker); });
  }
  extra.forEach(function(t){ if(codes.indexOf(t)<0) codes.push(t); });
  if(!codes.length) return;
  var _debouncedRenderTimer = null;
  function _triggerRenderAfterPrice(){
    _invalidatePortoCache();
    if(_debouncedRenderTimer) clearTimeout(_debouncedRenderTimer);
    _debouncedRenderTimer = setTimeout(function(){
      try{ updateTopbar(); }catch(e){}
      try{ buildTickerTape(); }catch(e){}
      if(typeof currentPage!=='undefined'){
        if(currentPage==='dashboard') { try{ renderDashboard(); }catch(e){} }
        else if(currentPage==='portofolio') { try{ renderPortofolio(); }catch(e){} }
        else if(currentPage==='performance') { try{ renderStockPerformance(); }catch(e){} }
      }
    }, 400);
  }

  // Coba fetch batch langsung dari endpoint server lokal /api/idx/quotes (cepat, akurat, tanpa CORS)
  if(typeof fetch === 'function'){
    fetch('/api/idx/quotes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tickers: codes })
    })
    .then(function(res){ return res.json(); })
    .then(function(resJson){
      if(resJson && resJson.success && resJson.quotes){
        var quotes = resJson.quotes;
        var updated = false;
        Object.keys(quotes).forEach(function(c){
          var q = quotes[c];
          if(q && q.price > 0){
            prices[c] = q.price;
            if(q.previous > 0) prevCloses[c] = q.previous;
            if(typeof DB!=='undefined' && DB[c]) DB[c].base = q.price;
            updated = true;
          }
        });
        if(updated){
          fhSetBadge('live', '● LIVE');
          _triggerRenderAfterPrice();
          return;
        }
      }
      _fallbackFetchIndividual();
    })
    .catch(function(){
      _fallbackFetchIndividual();
    });
  } else {
    _fallbackFetchIndividual();
  }

  function _fallbackFetchIndividual(){
    codes.forEach(function(code, i){
      setTimeout(function(){
        yfFetch(code+'.JK', function(err, meta){
          if(!err && meta && meta.regularMarketPrice > 0){
            prices[code] = meta.regularMarketPrice;
            if(meta.previousClose > 0) prevCloses[code] = meta.previousClose;
            if(typeof DB!=='undefined' && DB[code]) DB[code].base = meta.regularMarketPrice;
            if(typeof mwCheckPriceAlerts==='function') mwCheckPriceAlerts();
            _triggerRenderAfterPrice();
          }
        });
      }, i*1200);
    });
  }

  // Bangun ulang ticker tape sekali setelah seluruh batch selesai
  setTimeout(function(){ try{ buildTickerTape(); }catch(e){} }, Math.min(codes.length*1200 + 2000, 8000));
}

// ── Fetch kurs USD/IDR via Yahoo Finance ──
function fhFetchKurs(){
  yfFetch(FH.USD_SYM, function(err, meta){
    if(!err && meta && meta.regularMarketPrice > 10000) usdIdr = meta.regularMarketPrice;
  });
}

// FIX AUDIT F4: harga ETF sebelumnya cuma simulasi Math.random() satu kali saat
// load, tidak pernah diperbarui — padahal ticker ETF AS (VOO, QQQ, dst) adalah
// simbol Yahoo Finance yang valid TANPA akhiran .JK, jadi bisa pakai yfFetch()
// yang sama persis dengan saham IDX. updateEtfPrices() (Math.random) tetap ada
// sebagai fallback simulasi kalau fetch riil gagal — pola sama dengan updatePrices().
function fhFetchEtf(){
  var held = (typeof getEtfPortfolio==='function') ? getEtfPortfolio().map(function(p){return p.ticker;}) : [];
  var codes = held.length ? held : Object.keys(ETF_DB).slice(0,5);
  codes.forEach(function(code, i){
    setTimeout(function(){
      yfFetch(code, function(err, meta){
        if(!err && meta && meta.regularMarketPrice > 0){
          etfPrices[code] = meta.regularMarketPrice;
          if(typeof ETF_DB!=='undefined' && ETF_DB[code]) ETF_DB[code].baseUSD = meta.regularMarketPrice;
          if(typeof currentPage!=='undefined' && currentPage==='etf'){ try{ renderEtf(); }catch(e){} }
        }
      });
    }, i*1500);
  });
}

// ── Fetch harga crypto LANGSUNG dalam IDR via Yahoo Finance (pair -IDR) ──
function fhFetchCrypto(){
  var codes = Object.keys(CRYPTO_DB);
  codes.forEach(function(code, i){
    setTimeout(function(){
      yfFetch(code+'-IDR', function(err, meta){
        if(!err && meta && meta.regularMarketPrice > 0){
          cryptoPrices[code] = meta.regularMarketPrice;
        }
      });
    }, i*1500);
  });
}

// ── Mode refresh — 'fast' (default, IHSG/15dtk·saham/2mnt·kurs/10mnt) atau
// 'slow' (hemat, semua jenis harga tiap 15 menit bersamaan). Mode 'fast'
// memukul proxy CORS publik gratis terus-menerus (240x/jam hanya untuk
// IHSG) — tidak ada backoff kalau proxy rate-limit, jadi 'slow' berguna
// buat user yang lebih mementingkan stabilitas daripada kecepatan update.
var FH_REFRESH_KEY = 'mw_fh_refresh_mode_v1';
FH.mode = (function(){ try{ return localStorage.getItem(FH_REFRESH_KEY)||'fast'; }catch(e){ return 'fast'; } })();
function fhSetRefreshMode(mode){
  FH.mode = (mode==='slow') ? 'slow' : 'fast';
  try{ localStorage.setItem(FH_REFRESH_KEY, FH.mode); }catch(e){}
  if(FH.timer) fhStart(); // restart supaya interval baru langsung berlaku
  if(typeof showSaveStatus==='function') showSaveStatus('✓ Mode refresh: '+(FH.mode==='slow'?'Hemat (15 menit)':'Real-time (15 detik)'));
  if(el('m-title') && el('m-title').textContent.indexOf('Harga Realtime')>=0) openFinnhubSettings(); // refresh tampilan tombol aktif
}

// ── Start Yahoo Finance realtime engine ──
function fhStart(){
  if(FH._simTimer){ clearInterval(FH._simTimer); FH._simTimer=null; }
  fhSetBadge('loading','Menghubungkan...');
  fhFetchIHSG();
  setTimeout(fhFetchKurs,   2000);
  setTimeout(fhFetchStocks, 4000);
  setTimeout(fhFetchCrypto, 6000);
  setTimeout(fhFetchEtf,    8000);
  if(FH.timer) clearInterval(FH.timer);
  var tick = 0;
  var slow = FH.mode==='slow';
  FH.timer = setInterval(function(){
    tick++;
    if(slow){
      // Mode hemat: base interval sudah 15 menit, jadi semua jenis harga
      // langsung di-refresh bersamaan tiap tick — tidak perlu throttle
      // modulo tambahan seperti mode real-time.
      fhFetchIHSG(); fhFetchStocks(); fhFetchCrypto(); fhFetchEtf(); fhFetchKurs();
      renderPage(currentPage);
      return;
    }
    fhFetchIHSG();                       // IHSG tiap 15 detik
    if(tick%8===0)  fhFetchStocks();     // saham tiap 2 menit
    if(tick%8===0)  fhFetchCrypto();     // crypto tiap 2 menit
    if(tick%8===0)  fhFetchEtf();        // ETF tiap 2 menit
    if(tick%40===0) fhFetchKurs();       // kurs tiap 10 menit
    if(tick%4===0)  renderPage(currentPage);
  }, slow ? 15*60*1000 : 15000);
}

var FH_PRICE_MODE_KEY = 'mw_price_mode_v1';
var priceEngineMode = (function(){ try{ return localStorage.getItem(FH_PRICE_MODE_KEY)||'live'; }catch(e){ return 'live'; } })();

function setPriceEngineMode(mode){
  priceEngineMode = mode;
  try{ localStorage.setItem(FH_PRICE_MODE_KEY, mode); }catch(e){}
  if(mode === 'static'){
    if(FH.timer){ clearInterval(FH.timer); FH.timer=null; }
    if(FH._simTimer){ clearInterval(FH._simTimer); FH._simTimer=null; }
    fhSetBadge('off', '🔒 Statis');
    // Reset prices to base reference prices
    (XLSX_DATA.stocks||[]).forEach(function(s){ if(s.price>0) prices[s.code] = s.price; });
    _invalidatePortoCache();
    updateTopbar();
    renderPage(currentPage);
    if(typeof showSaveStatus==='function') showSaveStatus('✓ Mode Harga: Kunci Statis (Tidak Berubah Otomatis)');
  } else if(mode === 'sim'){
    if(FH.timer){ clearInterval(FH.timer); FH.timer=null; }
    fhStop();
    if(typeof showSaveStatus==='function') showSaveStatus('✓ Mode Harga: Simulasi Fluktuasi Pasar');
  } else {
    // live
    if(FH._simTimer){ clearInterval(FH._simTimer); FH._simTimer=null; }
    fhStart();
    if(typeof showSaveStatus==='function') showSaveStatus('✓ Mode Harga: Real-time Live (Yahoo Finance)');
  }
  if(el('m-title') && el('m-title').textContent.indexOf('Harga')>=0) openFinnhubSettings();
}

// ── Stop (fallback ke statis aman tanpa jitter) ──
function fhStop(){
  if(FH.timer){ clearInterval(FH.timer); FH.timer=null; }
  if(FH._simTimer){ clearInterval(FH._simTimer); FH._simTimer=null; }
  fhSetBadge('off','🔒 Statis');
}

// ── Update harga stabil (tanpa acak Math.random) ──
function updatePrices(){
  if(priceEngineMode === 'static') return;
  // Pastikan harga stabil dan tidak berubah-ubah secara acak
  if(typeof XLSX_DATA !== 'undefined' && Array.isArray(XLSX_DATA.stocks)){
    XLSX_DATA.stocks.forEach(function(s){
      if(s && s.code && s.price > 0 && (!prices[s.code] || prices[s.code] <= 0)){
        prices[s.code] = s.price;
      }
    });
  }
  updateTopbar();
  if(typeof mwCheckPriceAlerts==='function') mwCheckPriceAlerts();
}

// ── Settings Modal ──
function openFinnhubSettings(){
  if(typeof openSettingsHub === 'function'){
    openSettingsHub('feed');
    return;
  }
  el('m-title').textContent = '📡 Pengaturan Mode & Fluktuasi Harga';
  el('m-title').style.color = 'var(--accent)';
  var sc = priceEngineMode==='static'?'var(--text3)':FH.status==='live'?'var(--green)':FH.status==='error'?'var(--red)':'var(--text3)';
  var st = priceEngineMode==='static'?'🔒 Kunci Statis (Harga Tetap)':FH.status==='live'?'● Live Yahoo Finance':FH.status==='error'?'● Error Reconnect':'○ Simulasi';
  el('m-body').innerHTML =
    '<div style="font-size:12px;color:var(--text2);margin-bottom:14px;line-height:1.7">'+
      'Nilai pasar dan <em>Unrealized P&L</em> pada dashboard dapat bergerak otomatis jika mode <strong>Real-time Live</strong> atau <strong>Simulasi</strong> aktif mengikuti fluktuasi harga pasar bursa.'+
    '</div>'+
    '<div style="background:var(--bg3);border:1px solid var(--border);border-radius:8px;padding:11px 13px;margin-bottom:12px">'+
      '<div style="font-weight:700;color:var(--text);margin-bottom:8px;font-size:12px">Pilih Mode Pergerakan Harga:</div>'+
      '<div style="display:flex;flex-direction:column;gap:7px">'+
        '<button class="btn '+(priceEngineMode==='live'?'btn-blue':'btn-ghost')+' btn-sm" onclick="setPriceEngineMode(\'live\')" style="text-align:left;justify-content:flex-start;padding:8px 12px">'+
          '📡 <strong>Real-time Live (Yahoo Finance)</strong> — Update harga saham IDX saat jam bursa aktif'+
        '</button>'+
        '<button class="btn '+(priceEngineMode==='static'?'btn-blue':'btn-ghost')+' btn-sm" onclick="setPriceEngineMode(\'static\')" style="text-align:left;justify-content:flex-start;padding:8px 12px">'+
          '🔒 <strong>Kunci Statis (Harga Tetap)</strong> — Nilai pasar tidak bergerak sendiri tanpa transaksi'+
        '</button>'+
        '<button class="btn '+(priceEngineMode==='sim'?'btn-blue':'btn-ghost')+' btn-sm" onclick="setPriceEngineMode(\'sim\')" style="text-align:left;justify-content:flex-start;padding:8px 12px">'+
          '🎲 <strong>Simulasi Fluktuasi</strong> — Mensimulasikan tick pasar acak'+
        '</button>'+
      '</div>'+
    '</div>'+
    '<div style="display:flex;justify-content:space-between;align-items:center;padding-top:4px">'+
      '<span style="font-size:11px;font-family:var(--font-mono)">Status Saat Ini: <span id="fh-modal-status" style="color:'+sc+';font-weight:bold">'+st+'</span></span>'+
      '<button class="btn btn-ghost" onclick="closeModal()">Tutup</button>'+
    '</div>';
  el('modal').classList.add('on');
}

function fhConnect(){
  closeModal();
  fhStart();
  showSaveStatus('Menghubungkan ke Yahoo Finance...');
}

function fhDisconnect(){
  if(FH.timer){ clearInterval(FH.timer); FH.timer=null; }
  closeModal();
  fhStop();
  showSaveStatus('Mode simulasi aktif');
}

function updateTopbar(){
  var diff=ihsgCur-ihsgBase;var pct=(diff/ihsgBase*100).toFixed(2);
  var sign=diff>=0?'+':'';
  var ihsgFmt=ihsgCur.toLocaleString('id-ID',{minimumFractionDigits:2,maximumFractionDigits:2});
  el('tb-ihsg').textContent=ihsgFmt;
  el('tb-chg').className='ibar-chg '+(diff>=0?'up':'dn');
  el('tb-chg').textContent=sign+diff.toFixed(2)+' ('+sign+pct+'%)';
  // Update chart header
  var cd=el('ihsg-close-disp'); if(cd) cd.textContent=ihsgFmt;
  var cc=el('ihsg-chg-disp');
  if(cc){
    cc.textContent=(diff>=0?'▲ ':'▼ ')+Math.abs(diff).toFixed(2)+' ('+sign+pct+'%)';
    cc.className='badge '+(diff>=0?'b-up':'b-dn');
  }
  var rdn=calcRdnBalance();
  el('tb-rdn').textContent='Rp '+fmtK(rdn);
}

function updateClock(){
  el('clock').textContent=new Date().toLocaleTimeString('id-ID');
  if(typeof fhUpdateLastSyncLabel==='function') fhUpdateLastSyncLabel();
}

// ── Bloomberg Ticker Tape ──
function buildTickerTape(){
  // HANYA data live Yahoo Finance yang ditampilkan — tanpa angka statis palsu.
  // % harian dihitung dari previousClose Yahoo (bukan DB.base yang bisa basi).
  var _stock=function(sym){
    var cur=typeof prices!=='undefined'&&prices[sym];
    var pc=typeof prevCloses!=='undefined'&&prevCloses[sym];
    if(!cur||cur<=0||!pc||pc<=0) return null; // tampilkan HANYA harga yang sudah terkonfirmasi live Yahoo
    var d=(cur-pc)/pc*100;
    return {sym:sym,val:Math.round(cur).toLocaleString('id-ID'),chg:(d>=0?'+':'')+d.toFixed(2)+'%',up:d>=0};
  };
  var _ihsgChg=(function(){ var d=ihsgCur-ihsgBase; var p=(d/(ihsgBase||1)*100); return {chg:(d>=0?'+':'')+p.toFixed(2)+'%',up:d>=0}; })();
  var items=[
    {sym:'IHSG', val:(typeof ihsgCur!=='undefined'?ihsgCur.toLocaleString('id-ID',{minimumFractionDigits:2}):'—'), chg:_ihsgChg.chg, up:_ihsgChg.up}
  ];
  // Saham: portofolio user + ticker umum yang punya harga live
  var seen={};
  var tickSyms=[];
  try{ getPortfolio().forEach(function(p){ tickSyms.push(p.ticker); }); }catch(e){}
  ['BBCA','BBRI','BMRI','TLKM','ANTM','ASII'].forEach(function(t){ tickSyms.push(t); });
  tickSyms.forEach(function(t){
    if(seen[t]) return; seen[t]=1;
    var it=_stock(t); if(it) items.push(it);
  });
  // Kurs & crypto live
  if(typeof usdIdr!=='undefined'&&usdIdr>10000) items.push({sym:'USD/IDR',val:Math.round(usdIdr).toLocaleString('id-ID'),chg:'kurs',up:true});
  if(typeof cryptoPrices!=='undefined'){
    if(cryptoPrices.BTC>0) items.push({sym:'BTC/IDR',val:fmtK(cryptoPrices.BTC),chg:'live',up:true});
    if(cryptoPrices.ETH>0) items.push({sym:'ETH/IDR',val:fmtK(cryptoPrices.ETH),chg:'live',up:true});
  }
  var html=items.map(function(it){
    var col=it.up?'var(--green)':'var(--red)';
    var arrow=it.up?'▲':'▼';
    return '<div class="tick-item">'
      +'<span class="tick-sym">'+it.sym+'</span>'
      +'<span class="tick-val">'+it.val+'</span>'
      +'<span class="tick-chg" style="color:'+col+'">'+arrow+' '+it.chg+'</span>'
      +'</div>';
  }).join('');
  // Duplicate for seamless loop
  html=html+html;
  var tc=el('ticker-inner');
  if(tc) tc.innerHTML=html;
}

// ============================================================
// CHARTS
// ============================================================
function kc(id){if(charts[id]){charts[id].destroy();delete charts[id];}}
var TC={color:'#8a90ad',font:{family:'Menlo',size:9}};
var GC='rgba(255,102,0,.07)';

function customChartTooltip(context) {
    let tooltipEl = document.getElementById('mw-tooltip');
    if (!tooltipEl) {
        tooltipEl = document.createElement('div');
        tooltipEl.id = 'mw-tooltip';
        document.body.appendChild(tooltipEl);
    }
    
    const tooltipModel = context.tooltip;
    if (tooltipModel.opacity === 0) {
        tooltipEl.style.opacity = 0;
        tooltipEl.style.transform = 'translateY(4px)';
        tooltipEl.style.pointerEvents = 'none';
        return;
    }
    
    tooltipEl.classList.remove('above', 'below', 'no-transform');
    if (tooltipModel.yAlign) {
        tooltipEl.classList.add(tooltipModel.yAlign);
    } else {
        tooltipEl.classList.add('no-transform');
    }

    function getBody(bodyItem) {
        return bodyItem.lines;
    }

    if (tooltipModel.body) {
        const titleLines = tooltipModel.title || [];
        const bodyLines = tooltipModel.body.map(getBody);
        let innerHtml = '';

        titleLines.forEach(function(title) {
            innerHtml += '<div class="mw-tt-title">' + title + '</div>';
        });

        bodyLines.forEach(function(body, i) {
            const colors = (tooltipModel.labelColors && tooltipModel.labelColors[i]) ? tooltipModel.labelColors[i] : {backgroundColor: "var(--accent)", borderColor: "var(--accent)"};
            let style = 'background:' + colors.backgroundColor + '; border-color:' + colors.borderColor + ';';
            if (!colors.backgroundColor) { style = 'background:var(--accent);'; }
            const span = '<span class="mw-tt-indicator" style="' + style + '"></span>';
            innerHtml += '<div class="mw-tt-body">' + span + body + '</div>';
        });

        tooltipEl.innerHTML = innerHtml;
    }

    // #mw-tooltip is position:fixed (see main.css), so coordinates must
    // stay viewport-relative — no window.pageXOffset/pageYOffset here,
    // those are for position:absolute-in-document-flow and would push the
    // tooltip further off-screen on any scrolled page.
    const position = context.chart.canvas.getBoundingClientRect();
    let left = position.left + tooltipModel.caretX;
    let top = position.top + tooltipModel.caretY;

    // Overflow prevention — the old version only nudged top/left by a
    // fixed guess (top - 80, left = innerWidth - 260) instead of the
    // tooltip's real measured size, so on a doughnut/pie (where the caret
    // can sit anywhere around the ring, not just above a bar) the tooltip
    // regularly ended up rendering fully below or past the viewport edge
    // — invisible, even though it was technically "showing" (reported by
    // user: hovering the donut showed nothing). Clamp against the
    // tooltip's actual rendered width/height.
    tooltipEl.style.left = '0px';
    tooltipEl.style.top = '0px';
    tooltipEl.style.opacity = 1;
    const ttW = tooltipEl.offsetWidth || 220;
    const ttH = tooltipEl.offsetHeight || 60;
    const margin = 8;
    const minLeft = margin;
    const maxLeft = window.innerWidth - ttW - margin;
    const minTop = margin;
    const maxTop = window.innerHeight - ttH - margin;
    left = Math.min(Math.max(left, minLeft), Math.max(minLeft, maxLeft));
    top = Math.min(Math.max(top - ttH - 12, minTop), Math.max(minTop, maxTop));

    tooltipEl.style.transform = 'translateY(0)';
    tooltipEl.style.left = left + 'px';
    tooltipEl.style.top = top + 'px';
}

var TT = {
    enabled: false,
    external: customChartTooltip
};

// Site-wide hover UX fix: by default Chart.js only shows a tooltip when
// the cursor sits exactly on a drawn pixel (intersect:true) - on a thin
// doughnut ring or a sparse bar chart this is easy to miss entirely,
// making every chart look like it has no hover info at all (reported by
// user - hovering the "Alokasi Portofolio" donut showed nothing because
// the cursor was a few px off the ring). mode:'nearest'+intersect:false
// shows the nearest data point's tooltip anywhere inside the chart area,
// applied globally so every chart in the app benefits without needing to
// touch each individual chart config.
if (typeof Chart !== 'undefined') {
  Chart.defaults.interaction = { mode: 'nearest', intersect: false };
  Chart.defaults.hover = Object.assign({}, Chart.defaults.hover, { mode: 'nearest', intersect: false });
}


function buildModalPosisiChart(porto){
  kc('modalposisi');
  var cv=el('modalPosisiChart'); if(!cv||!porto.length) return;
  var labels=porto.map(function(p){return p.ticker});
  // Stacked: bottom=retained(min), top-red=loss, top-green=gain
  var retained=porto.map(function(p){return Math.round(Math.min(p.cost,p.mv))});
  var loss=porto.map(function(p){return p.unreal<0?Math.round(Math.abs(p.unreal)):0});
  var gain=porto.map(function(p){return p.unreal>=0?Math.round(p.unreal):0});
  var ctx=cv.getContext('2d');
  charts['modalposisi']=new Chart(ctx,{
    type:'bar',
    data:{
      labels:labels,
      datasets:[
        {label:'Nilai Pasar',data:retained,backgroundColor:'rgba(45,212,191,.6)',borderColor:'#2dd4bf',borderWidth:1,stack:'s'},
        {label:'Rugi',      data:loss,    backgroundColor:'rgba(255,61,90,.7)',  borderColor:'#e21d48',borderWidth:1,stack:'s'},
        {label:'Untung',    data:gain,    backgroundColor:'rgba(0,229,160,.7)',  borderColor:'#41f3a7',borderWidth:1,stack:'s'}
      ]
    },
    options:{
      responsive:true,maintainAspectRatio:false,
      plugins:{
        legend:{
          display:true,
          labels:{color:'#8fa3c8',font:{size:10},boxWidth:12,padding:16}
        },
        tooltip:Object.assign({},TT,{mode:'index',intersect:false,callbacks:{
          label:function(c){
            var pf=porto[c.dataIndex];
            if(c.datasetIndex===0) return 'Nilai Pasar: Rp '+fmtK(pf.mv)+' (Modal: Rp '+fmtK(pf.cost)+')';
            if(c.datasetIndex===1&&pf.unreal<0) return 'Rugi: -Rp '+fmtK(Math.abs(pf.unreal))+' ('+pf.ret.toFixed(2)+'%)';
            if(c.datasetIndex===2&&pf.unreal>=0) return 'Untung: +Rp '+fmtK(pf.unreal)+' (+'+pf.ret.toFixed(2)+'%)';
            return null;
          },
          filter:function(item){ return item.parsed.y>0; }
        }})
      },
      scales:{
        x:{stacked:true,grid:{color:GC},ticks:Object.assign({},TC,{maxRotation:45,font:{size:9}})},
        y:{stacked:true,grid:{color:GC},ticks:Object.assign({},TC,{callback:function(v){return 'Rp'+fmtK(v)}}),position:'right'}
      }
    }
  });
}

// ── IHSG Market-Accurate Lightweight SVG Chart ──
function buildIhsgChart(tf){
  var svg = el('ihsgChart');
  if(!svg) return;
  tf = tf || window._currentIhsgTf || '1H';
  window._currentIhsgTf = tf;

  // Nilai pasar acuan saat ini
  var curPrice = (typeof ihsgCur === 'number' && ihsgCur > 0) ? ihsgCur : 6500.83;
  var basePrice = (typeof ihsgBase === 'number' && ihsgBase > 0) ? ihsgBase : curPrice;

  // Baca Open, High, Low dari DOM atau estimasi proporsional pasar
  var eOp = el('ihsg-op');
  var eHi = el('ihsg-hi');
  var eLo = el('ihsg-lo');

  var openVal = basePrice;
  if(eOp && eOp.textContent){
    var pOp = parseFloat(eOp.textContent.replace(/\./g,'').replace(',','.'));
    if(!isNaN(pOp) && pOp > 5000 && pOp < 8500) openVal = pOp;
  }
  var highVal = Math.max(curPrice, openVal, (eHi && parseFloat(eHi.textContent.replace(/\./g,'').replace(',','.'))) || (openVal * 1.0048));
  var lowVal = Math.min(curPrice, openVal, (eLo && parseFloat(eLo.textContent.replace(/\./g,'').replace(',','.'))) || (openVal * 0.9952));

  if(highVal - lowVal < 10){
    highVal = curPrice + 16;
    lowVal = curPrice - 16;
  }

  // Format ulang teks Open/High/Low dengan 2 desimal standar rapi
  if(eOp) eOp.textContent = openVal.toLocaleString('id-ID', {minimumFractionDigits:2, maximumFractionDigits:2});
  if(eHi) eHi.textContent = highVal.toLocaleString('id-ID', {minimumFractionDigits:2, maximumFractionDigits:2});
  if(eLo) eLo.textContent = lowVal.toLocaleString('id-ID', {minimumFractionDigits:2, maximumFractionDigits:2});

  var months = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
  var points = [];
  var labels = [];
  var timeLabels = [];

  if(tf === '1H'){
    // Intraday 1 Hari (Sesi Bursa 09:00 s.d. 15:50 WIB)
    var numPts = 40;
    var range = highVal - lowVal;
    
    for(var i = 0; i < numPts; i++){
      var t = i / (numPts - 1);
      var baseTrend;
      if(t < 0.25){
        // Pagi 09:00 - 10:15: Uji level High
        baseTrend = openVal + (highVal - openVal) * Math.sin(t / 0.25 * Math.PI / 2);
      } else if(t < 0.55){
        // Siang 10:15 - 11:30: Penyesuaian ke level Low / konsolidasi
        var tRel = (t - 0.25) / 0.30;
        baseTrend = highVal - (highVal - lowVal) * Math.sin(tRel * Math.PI / 2);
      } else if(t < 0.85){
        // Sesi 2 13:30 - 14:45: Rebound bertahap
        var tRel2 = (t - 0.55) / 0.30;
        baseTrend = lowVal + (curPrice - lowVal) * (0.4 + 0.6 * Math.sin(tRel2 * Math.PI / 2));
      } else {
        // Akhir sesi 14:45 - 15:50: Menuju curPrice
        var tRel3 = (t - 0.85) / 0.15;
        baseTrend = baseTrend * (1 - tRel3) + curPrice * tRel3;
      }
      // Noise mikro halus untuk menjaga keaslian visual chart bursa
      var noise = (Math.sin(i * 1.7) * 0.55 + Math.cos(i * 2.8) * 0.45) * (range * 0.035);
      var pVal = (i === 0) ? openVal : (i === numPts - 1 ? curPrice : (baseTrend + noise));
      pVal = Math.max(lowVal, Math.min(highVal, pVal));
      points.push(Math.round(pVal * 100) / 100);

      var minFrom9 = Math.round(t * 410);
      var hh = 9 + Math.floor(minFrom9 / 60);
      var mm = minFrom9 % 60;
      timeLabels.push(('0' + hh).slice(-2) + ':' + ('0' + mm).slice(-2) + ' WIB');
    }

    labels = ['09:00', '10:30', '11:30', '13:30', '14:30', '15:50'];

  } else if(tf === '3H'){
    // 3 Hari Perdagangan
    var numPts3 = 45;
    var day1Close = openVal * 0.996;
    var day2Close = openVal * 1.003;
    for(var i3 = 0; i3 < numPts3; i3++){
      var prog3 = i3 / (numPts3 - 1);
      var p3;
      if(prog3 < 0.33){
        var r1 = prog3 / 0.33;
        p3 = (day1Close * 0.997) + (day1Close * 0.006) * Math.sin(r1 * Math.PI) + (Math.sin(i3 * 2) * 3);
      } else if(prog3 < 0.66){
        var r2 = (prog3 - 0.33) / 0.33;
        p3 = day1Close + (day2Close - day1Close) * r2 + (Math.sin(i3 * 2.5) * 4);
      } else {
        var r3 = (prog3 - 0.66) / 0.34;
        p3 = day2Close + (curPrice - day2Close) * r3 + (Math.sin(i3 * 3) * 3);
      }
      if(i3 === numPts3 - 1) p3 = curPrice;
      points.push(Math.round(p3 * 100) / 100);
      timeLabels.push('Hari ' + (prog3 < 0.33 ? 'D-2' : (prog3 < 0.66 ? 'D-1' : 'Ini')));
    }
    labels = ['D-2 09:00', 'D-2 15:00', 'D-1 09:00', 'D-1 15:00', 'Hari Ini'];

  } else if(tf === '1M'){
    // 1 Bulan (22 hari bursa)
    var numPtsM = 24;
    var startMonth = curPrice * 0.985;
    for(var im = 0; im < numPtsM; im++){
      var rm = im / (numPtsM - 1);
      var wave = Math.sin(rm * Math.PI * 1.5) * (curPrice * 0.012) + (Math.cos(im * 1.4) * (curPrice * 0.004));
      var pm = startMonth + (curPrice - startMonth) * rm + wave;
      if(im === numPtsM - 1) pm = curPrice;
      points.push(Math.round(pm * 100) / 100);
      var dObj = new Date(Date.now() - (numPtsM - 1 - im) * 86400000 * 1.25);
      timeLabels.push(('0' + dObj.getDate()).slice(-2) + ' ' + months[dObj.getMonth()]);
    }
    var dNow = new Date();
    labels = [
      ('0' + new Date(dNow.getTime() - 28 * 86400000).getDate()).slice(-2) + ' ' + months[new Date(dNow.getTime() - 28 * 86400000).getMonth()],
      ('0' + new Date(dNow.getTime() - 21 * 86400000).getDate()).slice(-2) + ' ' + months[new Date(dNow.getTime() - 21 * 86400000).getMonth()],
      ('0' + new Date(dNow.getTime() - 14 * 86400000).getDate()).slice(-2) + ' ' + months[new Date(dNow.getTime() - 14 * 86400000).getMonth()],
      ('0' + new Date(dNow.getTime() - 7 * 86400000).getDate()).slice(-2) + ' ' + months[new Date(dNow.getTime() - 7 * 86400000).getMonth()],
      'Hari Ini'
    ];

  } else if(tf === '1Y'){
    // 1 Tahun (52 pekan)
    var numPtsY = 48;
    var startYear = curPrice * 0.94;
    for(var iy = 0; iy < numPtsY; iy++){
      var ry = iy / (numPtsY - 1);
      var waveY = Math.sin(ry * Math.PI * 2.5) * (curPrice * 0.025) + (Math.sin(iy * 1.2) * (curPrice * 0.008));
      var py = startYear + (curPrice - startYear) * ry + waveY;
      if(iy === numPtsY - 1) py = curPrice;
      points.push(Math.round(py * 100) / 100);
      var dY = new Date(Date.now() - (numPtsY - 1 - iy) * 7 * 86400000);
      timeLabels.push(months[dY.getMonth()] + ' ' + dY.getFullYear());
    }
    labels = ['Sep', 'Nov', 'Jan', 'Mar', 'Mei', 'Jul', 'Agu'];
  }

  // SVG Geometry Calculation (Ringan & Cepat)
  var container = svg.parentElement;
  var VW = container ? (container.offsetWidth || 700) : 700;
  var VH = container ? (container.offsetHeight || 200) : 200;
  var padL = 52, padR = 12, padT = 16, padB = 24;
  var plotW = Math.max(10, VW - padL - padR);
  var plotH = Math.max(10, VH - padT - padB);

  svg.setAttribute('viewBox', '0 0 ' + VW + ' ' + VH);
  svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');

  var pMin = Math.min.apply(null, points);
  var pMax = Math.max.apply(null, points);
  var pRng = pMax - pMin || 1;
  pMin -= pRng * 0.07;
  pMax += pRng * 0.07;
  pRng = pMax - pMin;

  var toX = function(i){ return padL + (points.length <= 1 ? 0 : (i / (points.length - 1)) * plotW); };
  var toY = function(v){ return padT + ((pMax - v) / pRng) * plotH; };

  var isBull = points[points.length - 1] >= points[0];
  var lineColor = isBull ? '#41f3a7' : '#f23645';
  var gradId = isBull ? 'ihsgGradUp' : 'ihsgGradDn';

  var html = '';
  // Background
  html += '<rect x="0" y="0" width="' + VW + '" height="' + VH + '" fill="#080a0f"/>';

  // Gradient Definition
  html += '<defs>' +
    '<linearGradient id="' + gradId + '" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0%" stop-color="' + lineColor + '" stop-opacity="0.25"/>' +
      '<stop offset="100%" stop-color="' + lineColor + '" stop-opacity="0.0"/>' +
    '</linearGradient>' +
  '</defs>';

  // Grid Lines (Y-Axis)
  var yTicks = 4;
  for(var gi = 0; gi <= yTicks; gi++){
    var yv = pMin + (pRng * gi / yTicks);
    var gy = toY(yv);
    html += '<line x1="' + padL + '" y1="' + gy.toFixed(1) + '" x2="' + (VW - padR) + '" y2="' + gy.toFixed(1) + '" stroke="rgba(255,255,255,0.06)" stroke-width="1"/>';
    html += '<text x="' + (padL - 6) + '" y="' + (gy + 3.5).toFixed(1) + '" text-anchor="end" font-size="8.5" fill="#787b86" font-family="Menlo,monospace">' + Math.round(yv).toLocaleString('id-ID') + '</text>';
  }

  // Baseline Reference: Open Price Dotted Line
  var openY = toY(points[0]);
  if(openY >= padT && openY <= (VH - padB)){
    html += '<line x1="' + padL + '" y1="' + openY.toFixed(1) + '" x2="' + (VW - padR) + '" y2="' + openY.toFixed(1) + '" stroke="rgba(255,255,255,0.12)" stroke-width="1" stroke-dasharray="3,3"/>';
  }

  // X-Axis Labels
  var numLabels = labels.length;
  for(var li = 0; li < numLabels; li++){
    var lx = padL + (li / (numLabels - 1)) * plotW;
    html += '<text x="' + lx.toFixed(1) + '" y="' + (VH - 5) + '" text-anchor="middle" font-size="8.5" fill="#787b86" font-family="Menlo,monospace">' + labels[li] + '</text>';
  }

  // Smooth Bezier Curve Path Construction
  var n = points.length;
  var pts = [];
  for(var pi = 0; pi < n; pi++){
    pts.push({ x: toX(pi), y: toY(points[pi]) });
  }

  var pathD = 'M ' + pts[0].x.toFixed(1) + ' ' + pts[0].y.toFixed(1);
  for(var i = 0; i < n - 1; i++){
    var p0 = pts[i === 0 ? 0 : i - 1];
    var p1 = pts[i];
    var p2 = pts[i + 1];
    var p3 = pts[i + 2 < n ? i + 2 : i + 1];

    var cp1x = p1.x + (p2.x - p0.x) / 6;
    var cp1y = p1.y + (p2.y - p0.y) / 6;
    var cp2x = p2.x - (p3.x - p1.x) / 6;
    var cp2y = p2.y - (p3.y - p1.y) / 6;

    pathD += ' C ' + cp1x.toFixed(1) + ' ' + cp1y.toFixed(1) + ', ' + cp2x.toFixed(1) + ' ' + cp2y.toFixed(1) + ', ' + p2.x.toFixed(1) + ' ' + p2.y.toFixed(1);
  }

  // Area Fill Path
  var areaD = pathD + ' L ' + pts[n - 1].x.toFixed(1) + ' ' + (VH - padB) + ' L ' + pts[0].x.toFixed(1) + ' ' + (VH - padB) + ' Z';
  html += '<path d="' + areaD + '" fill="url(#' + gradId + ')" stroke="none"/>';

  // Main Smooth Stroke Line
  html += '<path d="' + pathD + '" fill="none" stroke="' + lineColor + '" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/>';

  // Last Point Indicator with Glow
  var lastPt = pts[n - 1];
  html += '<circle cx="' + lastPt.x.toFixed(1) + '" cy="' + lastPt.y.toFixed(1) + '" r="5" fill="' + lineColor + '" opacity="0.25"/>';
  html += '<circle cx="' + lastPt.x.toFixed(1) + '" cy="' + lastPt.y.toFixed(1) + '" r="2.8" fill="' + lineColor + '"/>';

  // Hover Crosshair & Dot Elements
  html += '<g id="ihsg-crosshair" style="display:none">' +
    '<line id="ihsg-ch-line" x1="0" y1="' + padT + '" x2="0" y2="' + (VH - padB) + '" stroke="rgba(255,255,255,0.3)" stroke-width="1" stroke-dasharray="2,2"/>' +
    '<circle id="ihsg-ch-dot" cx="0" cy="0" r="3.5" fill="#ffffff" stroke="' + lineColor + '" stroke-width="2"/>' +
  '</g>';

  svg.innerHTML = html;

  // Lightweight Mousemove Event for Interactive Crosshair
  svg.onmousemove = function(e){
    var rect = svg.getBoundingClientRect();
    var mouseX = e.clientX - rect.left;
    if(mouseX < padL || mouseX > (VW - padR)) return;

    var ratio = (mouseX - padL) / plotW;
    var idx = Math.max(0, Math.min(n - 1, Math.round(ratio * (n - 1))));
    var pt = pts[idx];
    var val = points[idx];
    var timeTxt = timeLabels[idx] || '';

    var gCh = el('ihsg-crosshair');
    var chLine = el('ihsg-ch-line');
    var chDot = el('ihsg-ch-dot');
    if(gCh && chLine && chDot){
      gCh.style.display = 'block';
      chLine.setAttribute('x1', pt.x.toFixed(1));
      chLine.setAttribute('x2', pt.x.toFixed(1));
      chDot.setAttribute('cx', pt.x.toFixed(1));
      chDot.setAttribute('cy', pt.y.toFixed(1));
    }

    // Update Header Text on Hover
    var cd = el('ihsg-close-disp');
    var cc = el('ihsg-chg-disp');
    if(cd){
      cd.textContent = val.toLocaleString('id-ID', {minimumFractionDigits:2, maximumFractionDigits:2});
    }
    if(cc){
      var diffH = val - points[0];
      var pctH = (diffH / points[0] * 100).toFixed(2);
      var signH = diffH >= 0 ? '+' : '';
      cc.textContent = (diffH >= 0 ? '▲ ' : '▼ ') + Math.abs(diffH).toFixed(2) + ' (' + signH + pctH + '%) · ' + timeTxt;
      cc.className = 'badge ' + (diffH >= 0 ? 'b-up' : 'b-dn');
    }
  };

  svg.onmouseleave = function(){
    var gCh = el('ihsg-crosshair');
    if(gCh) gCh.style.display = 'none';
    updateTopbar();
  };
}

function buildDonut(porto){
  kc('donut');var cv=el('donutChart');if(!cv||!porto.length)return;
  charts['donut']=new Chart(cv,{type:'doughnut',data:{labels:porto.map(function(p){return p.ticker}),datasets:[{data:porto.map(function(p){return p.mv}),backgroundColor:COLORS.slice(0,porto.length),borderWidth:0,hoverOffset:4}]},options:{responsive:true,maintainAspectRatio:false,cutout:'68%',plugins:{legend:{display:false},tooltip:Object.assign({},TT,{callbacks:{label:function(c){return c.label+': Rp '+fmtK(c.parsed)}}})}}});
}

function buildDivCharts(){
  // Charts are now built directly inside renderDividen()
  // This function is kept as stub for backward compatibility
}

// Plugin ringan: tulis teks di tengah donut (jumlah sektor + sektor teratas)
// — dipakai khusus untuk sectorChart lewat opsi `plugins:[...]` per-chart,
// tidak didaftarkan global supaya tidak memengaruhi donut/pie lain.
var _centerTextPlugin = {
  id: 'centerText',
  afterDraw: function(chart){
    var opt = chart.config.options.centerText;
    if(!opt) return;
    var ctx = chart.ctx;
    var x = (chart.chartArea.left+chart.chartArea.right)/2;
    var y = (chart.chartArea.top+chart.chartArea.bottom)/2;
    ctx.save();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = '700 20px "Menlo",monospace';
    ctx.fillStyle = opt.color || '#f5f5fa';
    ctx.fillText(opt.top, x, y-9);
    ctx.font = '600 9px "Menlo",monospace';
    ctx.fillStyle = '#8a90ad';
    ctx.fillText(opt.bottom, x, y+10);
    ctx.restore();
  }
};

function buildSectorChart(porto){
  kc('sector');var cv=el('sectorChart');if(!cv)return;
  var byS={};var totalMV=porto.reduce(function(a,p){return a+p.mv},0)||1;
  porto.forEach(function(p){byS[p.info.sector]=(byS[p.info.sector]||0)+p.mv});
  // Urutkan besar → kecil supaya alur visual donut sejalan dengan daftar
  // "Detail Sektor" di sebelahnya (sama-sama diurutkan dari sektor terbesar).
  var labels=Object.keys(byS).sort(function(a,b){return byS[b]-byS[a];});
  var vals=labels.map(function(s){return byS[s]});
  var cols=labels.map(function(s){return sectorColor(s);});
  var icons=labels.map(function(s){return sectorIcon(s);});
  var topLabel = labels.length ? (icons[0]+' '+(vals[0]/totalMV*100).toFixed(0)+'%') : '—';
  charts['sector']=new Chart(cv,{
    type:'doughnut',
    plugins:[_centerTextPlugin],
    data:{labels:labels,datasets:[{
      data:vals, backgroundColor:cols,
      borderColor:'#18191c', borderWidth:3, borderRadius:4,
      hoverOffset:10, hoverBorderWidth:3, spacing:2
    }]},
    options:{
      responsive:true, maintainAspectRatio:false, cutout:'68%',
      centerText:{top:topLabel, bottom:labels.length+' SEKTOR', color:cols[0]||'#f5f5fa'},
      animation:{animateRotate:true, duration:600},
      plugins:{
        legend:{display:false},
        tooltip:Object.assign({},TT,{callbacks:{
          label:function(c){return c.label+': '+(c.parsed/totalMV*100).toFixed(1)+'% · Rp '+fmtK(c.parsed);}
        }})
      }
    }
  });
}

function buildRdnChart(){
  kc('rdnf');var cv=el('rdnFlowChart');if(!cv)return;
  var months=['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
  var inM=new Array(12).fill(0);var outM=new Array(12).fill(0);var yr=new Date().getFullYear();
  rdnMutations.forEach(function(r){
    var dt=new Date(r.date);if(dt.getFullYear()!==yr)return;
    var m=dt.getMonth();
    if(r.amount>0)inM[m]+=r.amount;else outM[m]+=Math.abs(r.amount);
  });
  charts['rdnf']=new Chart(cv,{type:'bar',data:{labels:months,datasets:[{label:'Masuk',data:inM,backgroundColor:'rgba(0,229,160,.6)',borderRadius:3},{label:'Keluar',data:outM,backgroundColor:'rgba(255,61,90,.5)',borderRadius:3}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:Object.assign({},TT,{callbacks:{label:function(c){return c.dataset.label+': Rp '+fmtK(c.parsed.y)}}})},scales:{x:{grid:{color:GC},ticks:TC},y:{grid:{color:GC},ticks:Object.assign({},TC,{callback:function(v){return 'Rp '+fmtK(v)}}),position:'right'}}}});
}

function buildPnlChart(){
  kc('pnl');var cv=el('pnlChart');if(!cv)return;
  var cum=0;var data=[0];var labels=['Mulai'];
  var pos={};
  transactions.slice().sort(function(a,b){return a.date.localeCompare(b.date)}).forEach(function(tx){
    if(!pos[tx.ticker])pos[tx.ticker]={lot:0,cost:0};
    var p=pos[tx.ticker];
    if(tx.type==='BUY'){p.lot+=tx.lot;p.cost+=tx.gross;}
    if(tx.type==='SELL'&&p.lot>0){
      var avg=p.cost/(p.lot*100);cum+=(tx.gross-avg*tx.lot*100);
      data.push(Math.round(cum));labels.push(tx.date.slice(5));
      p.lot-=tx.lot;p.cost=Math.max(0,p.cost-avg*tx.lot*100);
    }
  });
  var last=data[data.length-1];var col=last>=0?'#41f3a7':'#e21d48';
  var ctx=cv.getContext('2d');var g=ctx.createLinearGradient(0,0,0,190);
  g.addColorStop(0,last>=0?'rgba(0,229,160,.18)':'rgba(255,61,90,.18)');g.addColorStop(1,'rgba(0,0,0,0)');
  charts['pnl']=new Chart(ctx,{type:'line',data:{labels:labels,datasets:[{data:data,borderColor:col,borderWidth:2,backgroundColor:g,fill:true,tension:.4,pointRadius:3,pointBackgroundColor:col}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:Object.assign({},TT,{callbacks:{label:function(c){return 'P&L: Rp '+fmt(c.parsed.y)}}})},scales:{x:{grid:{color:GC},ticks:Object.assign({},TC,{maxTicksLimit:7})},y:{grid:{color:GC},ticks:Object.assign({},TC,{callback:function(v){return 'Rp '+fmtK(v)}}),position:'right'}}}});
}

function buildRetDistChart(porto){
  kc('retdist');var cv=el('retDistChart');if(!cv)return;
  var returns=porto.map(function(p){return parseFloat(p.ret.toFixed(1))});
  var bins=[-30,-20,-15,-10,-5,0,5,10,15,20,30];
  var counts=new Array(bins.length-1).fill(0);
  returns.forEach(function(r){
    for(var i=0;i<bins.length-1;i++){if(r>=bins[i]&&r<bins[i+1]){counts[i]++;break;}}
  });
  var labels=bins.slice(0,-1).map(function(b,i){return b+'% to '+bins[i+1]+'%'});
  var bkgs=bins.slice(0,-1).map(function(b){return b>=0?'rgba(0,229,160,.65)':'rgba(255,61,90,.55)'});
  charts['retdist']=new Chart(cv,{type:'bar',data:{labels:labels,datasets:[{data:counts,backgroundColor:bkgs,borderRadius:3}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:Object.assign({},TT,{callbacks:{label:function(c){return c.parsed.y+' saham'}}})},scales:{x:{grid:{color:GC},ticks:Object.assign({},TC,{maxRotation:35})},y:{grid:{color:GC},ticks:Object.assign({},TC,{stepSize:1}),position:'right'}}}});
}



// DOM tooltips for metrics and icons
document.addEventListener('mouseover', function(e) {
  let target = e.target.closest('[title], [data-tooltip]');
  if (!target) return;
  if (target.tagName.toLowerCase() === 'canvas') return;

  if (target.hasAttribute('title')) {
    target.setAttribute('data-tooltip', target.getAttribute('title'));
    target.removeAttribute('title');
  }
  
  let text = target.getAttribute('data-tooltip');
  if (!text) return;

  let tooltipEl = document.getElementById('mw-tooltip');
  if (!tooltipEl) {
      tooltipEl = document.createElement('div');
      tooltipEl.id = 'mw-tooltip';
      document.body.appendChild(tooltipEl);
  }

  tooltipEl.innerHTML = '<div class="mw-tt-body">' + text.replace(/\n/g, '<br>') + '</div>';
  
  const rect = target.getBoundingClientRect();
  let left = rect.left + window.pageXOffset + (rect.width / 2);
  let top = rect.bottom + window.pageYOffset + 8;

  tooltipEl.style.display = 'flex';
  tooltipEl.style.pointerEvents = 'none';
  
  // Measure after content is set
  let ttRect = tooltipEl.getBoundingClientRect();
  left = left - (ttRect.width / 2);
  
  if (left < 10) left = 10;
  if (left + ttRect.width > window.innerWidth) left = window.innerWidth - ttRect.width - 10;
  
  if (top + ttRect.height > window.innerHeight + window.pageYOffset) {
     top = rect.top + window.pageYOffset - ttRect.height - 8;
  }
  
  tooltipEl.style.left = left + 'px';
  tooltipEl.style.top = top + 'px';
  tooltipEl.style.opacity = 1;
  tooltipEl.style.transform = 'translateY(0)';
  
  target.addEventListener('mouseleave', function onLeave() {
     tooltipEl.style.opacity = 0;
     tooltipEl.style.transform = 'translateY(4px)';
     target.removeEventListener('mouseleave', onLeave);
  });
});
