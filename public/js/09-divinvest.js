// ============================================================
// DIVIDEN INVESTING DASHBOARD ENGINE
// ============================================================

// Storage key — hanya untuk entri tambahan manual (suplemen dari dividends global)
var DI_KEY = 'ihsg_divinvest_v1';
var divInvestData = []; // entri manual tambahan, tidak duplikasi dividends global
var _divInvestId = 1;

function diLoadData(){
  try{
    var r=localStorage.getItem(DI_KEY);
    if(r){var d=JSON.parse(r);divInvestData=d.entries||[];_divInvestId=d.nextId||1;}
  }catch(e){}
}
function diSaveData(){
  try{localStorage.setItem(DI_KEY,JSON.stringify({entries:divInvestData,nextId:_divInvestId}));}catch(e){}
}

// ============================================================
// HITUNG DIVIDEN OTOMATIS DARI RIWAYAT TRANSAKSI PORTOFOLIO
// Menggabungkan riwayat BUY/SELL yang sudah tercatat di aplikasi ini
// dengan riwayat pembagian dividen resmi (corporate actions) dari Yahoo
// Finance untuk tiap ticker, lalu menghitung berapa dividen yang benar-benar
// diterima berdasarkan jumlah lembar yang dipegang pada ex-dividend date.
// ============================================================
var _diCalcCandidates = [];

async function diFetchJsonViaProxy(targetUrl, timeoutMs){
  timeoutMs = timeoutMs || 8000;
  var isStaticHost = typeof window !== 'undefined' && window.location && (
    (window.location.hostname || '').indexOf('github.io') !== -1 ||
    window.location.protocol === 'file:' ||
    (window.location.hostname || '').indexOf('pages.dev') !== -1
  );
  var proxyList = isStaticHost ? [] : [
    { name: 'local_proxy', isWrapped: false, url: function(u){ return '/api/proxy?url=' + encodeURIComponent(u); } }
  ];
  proxyList.push(
    { name: 'allorigins_get', isWrapped: true, url: function(u){ return 'https://api.allorigins.win/get?url=' + encodeURIComponent(u); } },
    { name: 'codetabs', isWrapped: false, url: function(u){ return 'https://api.codetabs.com/v1/proxy?quest=' + encodeURIComponent(u); } }
  );
  for (var i = 0; i < proxyList.length; i++) {
    try {
      var proxiedUrl = proxyList[i].url(targetUrl);
      var controller = (typeof AbortController !== 'undefined') ? new AbortController() : null;
      var timer = controller ? setTimeout(function(){ controller.abort(); }, timeoutMs) : null;
      var resp = await fetch(proxiedUrl, { signal: controller ? controller.signal : undefined });
      if (timer) clearTimeout(timer);
      if (resp.ok) {
        var data = await resp.json();
        if (proxyList[i].isWrapped && data && data.contents) {
          try { return JSON.parse(data.contents); } catch(e){}
        }
        return data;
      }
    } catch (errProxy) { /* coba proxy berikutnya */ }
  }
  throw new Error('Semua proxy tidak dapat menjangkau ' + targetUrl);
}

// Riwayat pembagian dividen resmi (corporate action) per ticker, dari Yahoo
// Finance chart API dengan events=div — bukan data buatan/estimasi.
async function fetchYahooDividendHistory(rawTicker){
  var cleanCode = String(rawTicker || '').replace('.JK', '').replace('.US', '').toUpperCase();
  var isUsStock = ['AAPL','TSLA','NVDA','MSFT','GOOG','GOOGL','AMZN','META','NFLX','AMD','INTC','COIN','PLTR','BRK-B','SPY','QQQ'].includes(cleanCode);
  var yahooTicker = isUsStock ? cleanCode : (cleanCode + '.JK');
  var url = 'https://query1.finance.yahoo.com/v8/finance/chart/' + encodeURIComponent(yahooTicker) + '?range=10y&interval=1d&events=div';
  var json = await diFetchJsonViaProxy(url, 8000);
  var result = json && json.chart && json.chart.result && json.chart.result[0];
  var divEvents = result && result.events && result.events.dividends;
  if (!divEvents) return [];
  return Object.keys(divEvents).map(function(ts){
    var ev = divEvents[ts];
    var d = new Date((ev.date ? ev.date : Number(ts)) * 1000);
    return { date: d.toISOString().slice(0, 10), dps: Number(ev.amount) || 0 };
  }).filter(function(ev){ return ev.dps > 0; }).sort(function(a, b){ return a.date.localeCompare(b.date); });
}

// Jumlah lembar yang dipegang pada suatu tanggal, dihitung dari riwayat
// transaksi BUY/SELL yang sudah ada di aplikasi ini (pendekatan: dividen
// dihitung dari posisi pada ex-date, recording date resmi bisa berbeda
// beberapa hari kerja).
function diSharesHeldOnDate(ticker, dateStr){
  var list = (transactions || []).filter(function(t){
    return t.ticker === ticker && (t.type === 'BUY' || t.type === 'SELL') && t.date && t.date <= dateStr;
  }).sort(function(a, b){ return a.date.localeCompare(b.date); });
  var shares = 0;
  list.forEach(function(t){
    var mult = (typeof getTxMultiplier === 'function') ? getTxMultiplier(t) : 100;
    var sh = (t.lot || 0) * mult;
    shares += (t.type === 'BUY') ? sh : -sh;
  });
  return Math.max(0, shares);
}

// Tarif PPh Final atas dividen sesuai tahun kejadian — PMK 18/PMK.03/2021
// (bebas pajak untuk WP OP DN yang memenuhi syarat reinvestasi) baru
// berlaku sejak 2021; sebelum itu dividen individu selalu kena PPh Final
// 10% terlepas dari pengaturan "Bebas PPh Dividen" pengguna saat ini.
function diPphRateForYear(year){
  if (year < 2021) return 0.10;
  if (typeof TAX_SETTINGS === 'undefined') return 0.10;
  if (TAX_SETTINGS.dividenExempt) return 0;
  return (TAX_SETTINGS.pphDividen && TAX_SETTINGS.pphDividen > 0) ? TAX_SETTINGS.pphDividen : 0.10;
}

async function diCalcFromTransactionHistory(){
  var uniqueTickers = Array.from(new Set((transactions || [])
    .filter(function(t){ return t.type === 'BUY' || t.type === 'SELL'; })
    .map(function(t){ return t.ticker; })));

  var statusEl = el('di-calc-status');
  var box = el('di-calc-preview');
  if (box) box.innerHTML = '';

  if (!uniqueTickers.length) {
    if (statusEl) statusEl.textContent = 'Tidak ada riwayat transaksi saham untuk dihitung. Catat transaksi Beli/Jual di halaman Portofolio terlebih dahulu.';
    return;
  }

  if (statusEl) statusEl.textContent = 'Mengambil riwayat pembagian dividen resmi dari Yahoo Finance untuk ' + uniqueTickers.length + ' saham...';

  // Diagnostik per-ticker (bukan cuma jumlah akhir) — supaya kalau suatu
  // periode "hilang" (mis. tidak ada entri sebelum tahun tertentu), sebabnya
  // langsung terlihat: tidak ada event dividen resmi, ATAU ada event tapi
  // lembar yang dipegang = 0 pada ex-date itu (berarti riwayat transaksi
  // Beli/Jual untuk ticker itu di aplikasi ini belum mencakup periode
  // tersebut), ATAU sudah pernah tercatat sebelumnya (di-skip, bukan hilang).
  var diag = [];
  var candidates = [];
  for (var i = 0; i < uniqueTickers.length; i++) {
    var ticker = uniqueTickers[i];
    var d = { ticker: ticker, totalEvents: 0, noSharesHeld: 0, alreadyRecorded: 0, newCandidates: 0, earliestTxDate: null, error: null };
    var txDates = (transactions || []).filter(function(t){ return t.ticker === ticker && (t.type === 'BUY' || t.type === 'SELL'); }).map(function(t){ return t.date; }).sort();
    d.earliestTxDate = txDates.length ? txDates[0] : null;
    try {
      var divs = await fetchYahooDividendHistory(ticker);
      d.totalEvents = divs.length;
      divs.forEach(function(ev){
        var shares = diSharesHeldOnDate(ticker, ev.date);
        if (shares <= 0) { d.noSharesHeld++; return; } // belum/sudah tidak memegang saham pada ex-date ini
        var alreadyExists = dividends.some(function(dv){ return dv.ticker === ticker && dv.date === ev.date; });
        if (alreadyExists) { d.alreadyRecorded++; return; }
        var year = parseInt(ev.date.slice(0, 4), 10);
        candidates.push({ ticker: ticker, date: ev.date, dps: ev.dps, shares: shares, year: year, pphRate: diPphRateForYear(year) });
        d.newCandidates++;
      });
    } catch (e) {
      d.error = e && e.message || String(e);
      console.warn('Gagal mengambil riwayat dividen untuk ' + ticker + ':', e);
    }
    diag.push(d);
  }

  _diCalcCandidates = candidates;
  renderDivCalcPreview(candidates, diag);
  if (statusEl) {
    statusEl.textContent = candidates.length
      ? 'Ditemukan ' + candidates.length + ' event dividen baru dari riwayat transaksi Anda. Periksa lalu klik "Import ke Data Dividen".'
      : 'Tidak ditemukan event dividen baru — lihat rincian per saham di bawah untuk penyebabnya.';
  }
}

function renderDivDiagTable(diag){
  if (!diag || !diag.length) return '';
  return '<div style="margin-bottom:14px;overflow-x:auto"><table class="tbl"><thead><tr>'
    + '<th>Ticker</th><th>Transaksi Tercatat Sejak</th><th>Event Dividen Resmi</th><th>Tanpa Kepemilikan</th><th>Sudah Tercatat</th><th>Baru</th>'
    + '</tr></thead><tbody>'
    + diag.map(function(d){
        var earliest = d.earliestTxDate || '<span style="color:var(--text3)">tidak ada transaksi</span>';
        var status = d.error ? '<span style="color:var(--red)">Gagal: ' + d.error + '</span>' : '';
        return '<tr><td class="mono" style="font-weight:700">' + d.ticker + '</td>'
          + '<td class="mono">' + earliest + '</td>'
          + '<td class="mono">' + d.totalEvents + '</td>'
          + '<td class="mono" title="Event dividen ditemukan, tapi lembar yang dipegang = 0 pada ex-date (periode sebelum transaksi Beli pertama tercatat)">' + d.noSharesHeld + '</td>'
          + '<td class="mono">' + d.alreadyRecorded + '</td>'
          + '<td class="mono" style="font-weight:700;color:var(--green)">' + d.newCandidates + '</td>'
          + (status ? '<td>' + status + '</td>' : '') + '</tr>';
      }).join('')
    + '</tbody></table></div>'
    + '<div style="margin-bottom:14px;font-size:10.5px;color:var(--text3);line-height:1.5">Kolom "Tanpa Kepemilikan" tinggi berarti: emiten membagikan dividen resmi, tapi riwayat transaksi Beli/Jual Anda di aplikasi ini belum mencakup periode itu — bukan bug kalkulator, tapi transaksi lama (sebelum tanggal di kolom "Transaksi Tercatat Sejak") belum diinput. Input/upload transaksi Beli lama itu dulu di halaman Transaksi Saham, lalu jalankan kalkulator ini lagi.</div>';
}

function renderDivCalcPreview(candidates, diag){
  var box = el('di-calc-preview');
  if (!box) return;
  var diagHtml = renderDivDiagTable(diag);
  if (!candidates.length) { box.innerHTML = diagHtml; return; }
  var totalGross = candidates.reduce(function(a, c){ return a + Math.round(c.dps * c.shares); }, 0);
  var totalTax = candidates.reduce(function(a, c){ return a + Math.round(c.dps * c.shares * c.pphRate); }, 0);
  box.innerHTML = diagHtml + '<div style="overflow-x:auto"><table class="tbl"><thead><tr>'
    + '<th>Ticker</th><th>Ex-Date</th><th>Div/Lembar</th><th>Lembar Dimiliki</th><th>Kotor</th><th>Tarif PPh</th><th>Bersih</th>'
    + '</tr></thead><tbody>'
    + candidates.map(function(c){
        var gross = Math.round(c.dps * c.shares);
        var tax = Math.round(gross * c.pphRate);
        var net = gross - tax;
        var rateNote = c.year < 2021 ? ' (standar, pra-PMK 18/2021)' : (c.pphRate === 0 ? ' (bebas, PMK 18/2021)' : '');
        return '<tr><td class="mono" style="font-weight:700">' + c.ticker + '</td><td>' + c.date + '</td>'
          + '<td class="mono">Rp ' + c.dps.toFixed(2) + '</td>'
          + '<td class="mono">' + c.shares.toLocaleString('id-ID') + '</td>'
          + '<td class="mono">Rp ' + fmt(gross) + '</td>'
          + '<td class="mono">' + (c.pphRate * 100).toFixed(0) + '%' + rateNote + '</td>'
          + '<td class="mono" style="font-weight:700">Rp ' + fmt(net) + '</td></tr>';
      }).join('')
    + '</tbody></table></div>'
    + '<div style="margin-top:10px;font-size:11px;color:var(--text2)">Total Kotor: <b>Rp ' + fmt(totalGross) + '</b> · Total PPh: <b>Rp ' + fmt(totalTax) + '</b> · Total Bersih: <b>Rp ' + fmt(totalGross - totalTax) + '</b></div>'
    + '<div style="margin-top:8px;font-size:10.5px;color:var(--text3);line-height:1.5">Dihitung dari jumlah lembar saham yang Anda miliki pada ex-dividend date (pendekatan; recording date resmi bisa berbeda beberapa hari kerja). Sumber Div/Lembar: corporate action resmi Yahoo Finance. Tarif PPh otomatis: sebelum 2021 selalu PPh Final 10% (PMK 18/2021 belum berlaku), 2021 ke atas mengikuti pengaturan "Bebas PPh Dividen" Anda di Pengaturan Pajak.</div>'
    + '<button class="btn btn-blue btn-sm" style="margin-top:10px" onclick="diImportCalculatedDividends()">Import ke Data Dividen (' + candidates.length + ' entri)</button>';
}

function diImportCalculatedDividends(){
  if (!_diCalcCandidates || !_diCalcCandidates.length) return;
  var n = 0;
  _diCalcCandidates.forEach(function(c){
    var alreadyExists = dividends.some(function(d){ return d.ticker === c.ticker && d.date === c.date; });
    if (alreadyExists) return;
    addDiv(c.date, c.ticker, c.shares, c.dps, c.pphRate);
    n++;
  });
  _diCalcCandidates = [];
  var box = el('di-calc-preview'); if (box) box.innerHTML = '';
  var statusEl = el('di-calc-status'); if (statusEl) statusEl.textContent = '';
  // Dividen → mutasi RDN sudah tersambung lewat addDiv()->addRdn() di atas
  // (data-nya sudah benar begitu addDiv selesai), tapi setiap halaman yang
  // menampilkan saldo/mutasi RDN punya render function-nya sendiri yang
  // TIDAK otomatis dipanggil ulang dari sini — sebelumnya hanya Dividen yang
  // di-refresh, jadi saldo di halaman Mutasi RDN & Kas Portofolio bisa
  // terlihat belum bertambah sampai halaman itu dibuka ulang secara manual.
  if (typeof renderDividen === 'function') renderDividen();
  if (typeof renderDivInvest === 'function') renderDivInvest();
  if (typeof renderRdn === 'function') renderRdn();
  if (typeof renderCashWidgets === 'function') renderCashWidgets();
  if (typeof renderTransaksi === 'function') renderTransaksi();
  if (typeof renderDashboard === 'function') renderDashboard();
  if (typeof showSaveStatus === 'function') showSaveStatus('✓ ' + n + ' data dividen berhasil diimport — saldo RDN diperbarui otomatis');
}

// ── Gabungkan semua sumber dividen (global + manual) ──
function diGetAllDividends(){
  var all=[];
  // 1. Dari dividends global (user-entry + lampiran)
  dividends.forEach(function(d){
    // Lampiran: dps=0 shares=0, kita pakai gross langsung (synthetic)
    var isLampiran=d._src==='lampiran';
    all.push({
      _src: isLampiran?'lampiran':'global',
      id: 'g'+d.id,
      ticker: d.ticker,
      date: d.date,
      dps: d.dps||0,
      shares: d.shares||0,
      avgPrice: 0,
      gross: d.gross||0,
      tax: d.tax||0,
      net: d.net||0
    });
  });
  // 2. Dari divInvestData manual — tambahkan yg belum ada di global (cek by ticker+date)
  var globalKeys=new Set(dividends.map(function(d){return d.ticker+'|'+d.date;}));
  divInvestData.forEach(function(d){
    if(!globalKeys.has(d.ticker+'|'+d.date)){
      all.push(Object.assign({_src:'manual'},d));
    }
  });
  return all;
}

// ── Form helpers ──
function openDivInvestForm(){
  var box=el('di-form-box');
  if(box){box.style.display='block';box.scrollIntoView({behavior:'smooth',block:'nearest'});}
  // Isi dropdown ticker dari portofolio
  diPopulateTickerSuggest();
}
function closeDivInvestForm(){
  var box=el('di-form-box');if(box)box.style.display='none';
}
function openDivBatchInput(){
  var b=el('di-batch-box');if(b)b.style.display=b.style.display==='none'?'block':'none';
}

// Auto-fill shares dari portofolio saat ticker berubah
function diOnTickerChange(){
  var ticker=(el('di-inp-ticker')&&el('di-inp-ticker').value.trim().toUpperCase())||'';
  if(!ticker)return;
  var porto=typeof getPortfolio==='function'?getPortfolio():[];
  var h=porto.find(function(p){return p.ticker===ticker;});
  if(h){
    if(el('di-inp-shares'))el('di-inp-shares').value=h.shares;
    if(el('di-inp-avgprice'))el('di-inp-avgprice').value=Math.round(h.avg);
  }
}

function diPopulateTickerSuggest(){
  var inp=el('di-inp-ticker');
  if(!inp)return;
  // Set oninput handler
  inp.oninput=function(){this.value=this.value.toUpperCase();diOnTickerChange();};
}

function saveDivInvestEntry(){
  var ticker=(el('di-inp-ticker')&&el('di-inp-ticker').value.trim().toUpperCase())||'';
  var date=el('di-inp-date')&&el('di-inp-date').value||'';
  var dps=parseFloat(el('di-inp-dps')&&el('di-inp-dps').value)||0;
  var shares=parseFloat(el('di-inp-shares')&&el('di-inp-shares').value)||0;
  var avgPrice=parseFloat(el('di-inp-avgprice')&&el('di-inp-avgprice').value)||0;
  if(!ticker||!date||dps<=0||shares<=0){alert('Lengkapi: Ticker, Tanggal, DPS, dan Jumlah Lembar');return;}
  // Cek duplikat di dividends global
  var isDup=dividends.some(function(d){return d.ticker===ticker&&d.date===date&&d.dps===dps;});
  if(isDup){alert('Data ini sudah ada di riwayat dividen global. Tidak perlu diinput ulang.');return;}
  // FIX AUDIT PMK 18/2021: Dividen WP OP DN bebas pajak (0%) jika exempt/reinvestasi, atau tarif pphDividen
  var divRate = (typeof TAX_SETTINGS.dividenExempt !== 'undefined' && TAX_SETTINGS.dividenExempt) ? 0 : (TAX_SETTINGS.pphDividen || 0);
  var gross = Math.round(dps * shares);
  var tax = Math.round(gross * divRate);
  var net = gross - tax;
  divInvestData.push({id:_divInvestId++,ticker:ticker,date:date,dps:dps,shares:shares,avgPrice:avgPrice,gross:gross,tax:tax,net:net,pphRate:divRate});
  diSaveData();
  ['di-inp-ticker','di-inp-date','di-inp-dps','di-inp-shares','di-inp-avgprice'].forEach(function(id){var e=el(id);if(e)e.value='';});
  renderDivInvest();
  if(typeof showSaveStatus==='function')showSaveStatus('✓ Dividen '+ticker+' disimpan');
}

function saveDivBatch(){
  var raw=el('di-batch-text')&&el('di-batch-text').value||'';
  var lines=raw.trim().split('\n').filter(function(l){return l.trim();});
  var count=0;
  var divRate = (typeof TAX_SETTINGS.dividenExempt !== 'undefined' && TAX_SETTINGS.dividenExempt) ? 0 : (TAX_SETTINGS.pphDividen || 0);
  lines.forEach(function(line){
    var parts=line.split(',').map(function(s){return s.trim();});
    if(parts.length<4)return;
    var ticker=parts[0].toUpperCase(),date=parts[1];
    var dps=parseFloat(parts[2]),shares=parseFloat(parts[3]);
    var avgPrice=parseFloat(parts[4])||0;
    if(!ticker||!date||isNaN(dps)||isNaN(shares)||dps<=0||shares<=0)return;
    var gross = Math.round(dps * shares);
    var tax = Math.round(gross * divRate);
    var net = gross - tax;
    divInvestData.push({id:_divInvestId++,ticker:ticker,date:date,dps:dps,shares:shares,avgPrice:avgPrice,gross:gross,tax:tax,net:net,pphRate:divRate});
    count++;
  });
  if(count===0){alert('Tidak ada data valid. Cek format: TICKER,YYYY-MM-DD,DPS,LEMBAR,HARGA_BELI');return;}
  diSaveData();
  if(el('di-batch-text'))el('di-batch-text').value='';
  renderDivInvest();
  if(typeof showSaveStatus==='function')showSaveStatus('✓ '+count+' data dividen diimport');
}

function delDivInvestEntry(id){
  divInvestData=divInvestData.filter(function(d){return d.id!==id;});
  diSaveData();renderDivInvest();
}
function clearDivInvestData(){
  if(!confirm('Hapus semua data history dividen investing?'))return;
  divInvestData=[];_divInvestId=1;diSaveData();renderDivInvest();
}

// ── Core analytics — terhubung penuh ke portofolio eksisting ──
function diAnalyze(){
  var porto = typeof getPortfolio==='function' ? getPortfolio() : [];
  var allDiv = diGetAllDividends(); // gabungan dividends global + divInvestData manual

  // Index portofolio by ticker
  var portoMap={};
  porto.forEach(function(p){ portoMap[p.ticker]=p; });

  // Kelompokkan dividen per ticker
  var byTicker={};
  allDiv.forEach(function(d){
    if(!byTicker[d.ticker]) byTicker[d.ticker]={ticker:d.ticker,payments:[],totalNet:0,totalGross:0};
    byTicker[d.ticker].payments.push(d);
    byTicker[d.ticker].totalNet  += (d.net||0);
    byTicker[d.ticker].totalGross+= (d.gross||0);
  });

  // Tambahkan holding portofolio yang belum punya catatan dividen sama sekali
  porto.forEach(function(p){
    if(!byTicker[p.ticker]) byTicker[p.ticker]={ticker:p.ticker,payments:[],totalNet:0,totalGross:0};
  });

  var YEARS_ALL=['2019','2020','2021','2022','2023','2024','2025','2026'];
  var results=[];

  Object.values(byTicker).forEach(function(g){
    var pmts = g.payments.slice().sort(function(a,b){return a.date.localeCompare(b.date);});

    // Tahun-tahun yang pernah bayar (deduplicate by year)
    var yearsPaid = [...new Set(pmts.map(function(p){return p.date.slice(0,4);}))].sort();

    // DPS per tahun — sum semua pembayaran dalam satu tahun (interim + final)
    var dpsByYear={}, grossByYear={}, netByYear={};
    pmts.forEach(function(p){
      var y=p.date.slice(0,4);
      // Untuk lampiran (dps=0), hitung DPS dari gross/shares bila shares>0; skip jika keduanya 0
      var dps = p.dps>0 ? p.dps : (p.shares>0 ? p.gross/p.shares : (p._src==='lampiran' ? 0 : 0));
      if(p._src==='lampiran' && dps===0 && p.gross>0) dps=0; // lampiran tanpa shares tidak masuk DPS
      dpsByYear[y]  = (dpsByYear[y]||0) + dps;
      grossByYear[y]= (grossByYear[y]||0)+ (p.gross||0);
      netByYear[y]  = (netByYear[y]||0)  + (p.net||0);
    });

    var dpsList = yearsPaid.map(function(y){return dpsByYear[y]||0;}).filter(function(v){return v>0;});
    var consistency = yearsPaid.length / YEARS_ALL.length;

    // CAGR DPS — pakai 3 tahun terakhir yang valid
    var cagr=0;
    if(dpsList.length>=2){
      var n=Math.min(3,dpsList.length-1);
      var last=dpsList[dpsList.length-1], first=dpsList[dpsList.length-1-n];
      if(first>0) cagr=Math.pow(last/first,1/n)-1;
      if(!isFinite(cagr)) cagr=0;
    }

    // ── Data dari portofolio eksisting (PRIORITAS UTAMA) ──
    var ph = portoMap[g.ticker]; // portofolio holding
    var currentShares = ph ? ph.shares : (pmts.length ? (pmts[pmts.length-1].shares||0) : 0);
    var currentPrice  = ph ? ph.mp    : 0;
    var avgPrice      = ph ? ph.avg   : 0;
    // Override avgPrice dari divInvestData jika ada
    var manualAvg = divInvestData.filter(function(d){return d.ticker===g.ticker&&d.avgPrice>0;});
    if(manualAvg.length) avgPrice = manualAvg.reduce(function(a,d){return a+d.avgPrice;},0)/manualAvg.length;
    var currentLot    = ph ? ph.lot   : 0;
    var currentMV     = ph ? ph.mv    : 0;
    var unrealPnl     = ph ? ph.unreal: 0;
    var unrealRet     = ph ? ph.ret   : 0;
    var sector        = ph ? (ph.info&&ph.info.sector||'—') : (DB&&DB[g.ticker]?DB[g.ticker].sector:'—');
    var compName      = DB&&DB[g.ticker] ? DB[g.ticker].name : g.ticker;
    var inPortfolio   = !!ph;

    // Latest + avg DPS
    var latestDPS = dpsList.length ? dpsList[dpsList.length-1] : 0;
    var avgDPS    = dpsList.length ? dpsList.reduce(function(a,v){return a+v;},0)/dpsList.length : 0;

    // Yield on cost & on market
    var yoc = avgPrice>0&&latestDPS>0    ? latestDPS/avgPrice*100   : 0;
    var yom = currentPrice>0&&latestDPS>0? latestDPS/currentPrice*100: 0;

    // Projected income pakai currentShares dari porto
    var latestYearNet = yearsPaid.length ? (netByYear[yearsPaid[yearsPaid.length-1]]||0) : 0;
    // Gunakan gross/net aktual dari tahun terakhir bila ada
    var baseNet = latestYearNet > 0 ? latestYearNet :
                  (latestDPS>0&&currentShares>0 ? latestDPS*currentShares*0.9 : 0);

    // ── Rating Algorithm (5 faktor) ──
    var scoreC = Math.min(1, consistency);                         // konsistensi 0-1
    var scoreY = Math.min(1, yom/10);                             // yield, 10% = perfect
    var scoreG = Math.min(1, Math.max(0,(cagr+0.05)/0.30));       // growth, -5%..+25% → 0-1
    var scoreV = dpsList.length>=3 ? 1 : dpsList.length/3;        // volume data
    var scoreP = inPortfolio ? 1 : 0.5;                           // bonus in-portfolio
    var score  = (scoreC*0.35 + scoreY*0.25 + scoreG*0.20 + scoreV*0.10 + scoreP*0.10)*100;

    var rating,ratingLabel,ratingColor,ratingNote;
    if(yearsPaid.length===0){
      rating='NONE'; ratingLabel='⬜ Tidak Bayar'; ratingColor='#4a5e82';
      ratingNote='Belum pernah membagikan dividen';
    } else if(score>=62 && consistency>=0.55 && yom>=2){
      rating='HIGH'; ratingLabel='🏆 High'; ratingColor='#41f3a7';
      ratingNote='Pembayar konsisten, yield & pertumbuhan baik';
    } else if(score>=38 && consistency>=0.35){
      rating='MODERATE'; ratingLabel='⚖️ Moderate'; ratingColor='#ffc107';
      ratingNote='Pembayar moderat, perlu monitoring berkala';
    } else {
      rating='LOW'; ratingLabel='📉 Low'; ratingColor='#e21d48';
      ratingNote='Konsistensi rendah atau yield tidak menarik';
    }

    results.push({
      ticker:g.ticker, compName:compName, sector:sector,
      payments:pmts, yearsPaid:yearsPaid, dpsByYear:dpsByYear,
      grossByYear:grossByYear, netByYear:netByYear,
      dpsList:dpsList, latestDPS:latestDPS, avgDPS:avgDPS, cagr:cagr,
      consistency:consistency, totalNet:g.totalNet, totalGross:g.totalGross,
      baseNet:baseNet, latestYearNet:latestYearNet,
      // Portofolio data (live)
      inPortfolio:inPortfolio, currentShares:currentShares, currentPrice:currentPrice,
      avgPrice:avgPrice, currentLot:currentLot, currentMV:currentMV,
      unrealPnl:unrealPnl, unrealRet:unrealRet,
      yoc:yoc, yom:yom, score:score,
      rating:rating, ratingLabel:ratingLabel, ratingColor:ratingColor, ratingNote:ratingNote
    });
  });

  return results;
}

// ── Probabilistic projection — pakai currentShares dari portofolio ──
function diProjectNext(item, scenario){
  var mult = scenario==='bull'?1.20 : scenario==='bear'?0.80 : 1.00;
  // P(bayar): konsistensi + bonus kalau sudah bayar 3+ tahun berturut-turut
  var streak=0;
  var yr=new Date().getFullYear();
  for(var i=0;i<4;i++){if(item.dpsByYear[String(yr-i)])streak++;else break;}
  var probPay = Math.min(0.97, item.consistency*(streak>=3?1.15:streak>=2?1.05:0.90));
  if(item.yearsPaid.length===0) probPay=0;
  // Expected DPS: 60% CAGR-based trend + 40% historical avg
  var trendDPS = item.latestDPS * (1 + (item.cagr||0));
  var expDPS   = Math.max(0, (trendDPS*0.60 + item.avgDPS*0.40) * mult);
  // Expected net income berdasarkan shares AKTUAL di porto sekarang
  var shares   = item.currentShares || 0;
  var expGross = probPay * expDPS * shares;
  var expNet   = expGross * 0.90;
  // CI 80%: simpangan dari std dev DPS historis
  var dpsMean  = item.avgDPS;
  var dpsStd   = item.dpsList.length>1 ?
    Math.sqrt(item.dpsList.reduce(function(a,v){return a+Math.pow(v-dpsMean,2);},0)/item.dpsList.length) : dpsMean*0.2;
  var ci80Low  = Math.max(0,(expDPS - 1.28*dpsStd))*shares*0.90*probPay;
  var ci80High = (expDPS + 1.28*dpsStd)*shares*0.90*probPay;
  return {probPay:probPay, expDPS:expDPS, expGross:expGross, expNet:expNet,
          ci80Low:ci80Low, ci80High:ci80High, streak:streak, shares:shares};
}

// ── Main Render ──
function renderDivInvest(){
  diLoadData();
  var results=diAnalyze();
  var sortBy   = el('di-sort-sel')&&el('di-sort-sel').value||'rating';
  var scenario = el('di-scenario')&&el('di-scenario').value||'base';

  // Sort
  var ORDER=['HIGH','MODERATE','LOW','NONE'];
  var sortFn={
    rating     :function(a,b){return ORDER.indexOf(a.rating)-ORDER.indexOf(b.rating);},
    yield      :function(a,b){return b.yom-a.yom;},
    projected  :function(a,b){return diProjectNext(b,scenario).expNet-diProjectNext(a,scenario).expNet;},
    consistency:function(a,b){return b.consistency-a.consistency;},
    total      :function(a,b){return b.totalNet-a.totalNet;}
  };
  results.sort(sortFn[sortBy]||sortFn.rating);

  // ── Aggregate metrics ──
  var porto         = typeof getPortfolio==='function'?getPortfolio():[];
  var totalNet      = results.reduce(function(a,r){return a+r.totalNet;},0);
  var routineCount  = results.filter(function(r){return r.yearsPaid.length>=2;}).length;
  var totalProj     = results.reduce(function(a,r){return a+diProjectNext(r,scenario).expNet;},0);
  var yomArr        = results.filter(function(r){return r.yom>0;});
  var avgYield      = yomArr.length ? yomArr.reduce(function(a,r){return a+r.yom;},0)/yomArr.length : 0;
  var noDivList     = results.filter(function(r){return r.yearsPaid.length===0&&r.inPortfolio;});

  if(el('di-total-net'))  el('di-total-net').textContent  = 'Rp '+fmtK(totalNet);
  if(el('di-total-sub'))  el('di-total-sub').textContent  = results.length+' emiten · sejak 2019';
  if(el('di-emiten-cnt')) el('di-emiten-cnt').textContent = routineCount;
  if(el('di-emiten-sub')) el('di-emiten-sub').textContent = 'bayar ≥2x · '+porto.length+' di portofolio';
  if(el('di-proj-next'))  el('di-proj-next').textContent  = 'Rp '+fmtK(totalProj);
  if(el('di-proj-sub'))   el('di-proj-sub').textContent   = 'skenario '+scenario+' · net PPh';
  if(el('di-avg-yield'))  el('di-avg-yield').textContent  = avgYield.toFixed(2)+'%';
  if(el('di-total-proj-disp')) el('di-total-proj-disp').textContent='Rp '+fmtK(totalProj);

  // ── Rating Grid Cards (hanya yg punya data dividen atau di porto) ──
  var rGrid = el('di-rating-grid');
  if(rGrid){
    var showResults = results.filter(function(r){return r.yearsPaid.length>0||r.inPortfolio;});
    rGrid.innerHTML = showResults.length ? showResults.map(function(r){
      var proj     = diProjectNext(r,scenario);
      var cagrPct  = (r.cagr*100).toFixed(1);
      var cagrColor= r.cagr>=0?'var(--green)':'var(--red)';
      var mvDisp   = r.currentMV>0 ? 'MV Rp '+fmtK(r.currentMV) : '';
      var pnlColor = r.unrealPnl>=0?'var(--green)':'var(--red)';
      var pnlSign  = r.unrealPnl>=0?'+':'';
      var portoBadge = r.inPortfolio
        ? '<span style="font-size:9px;padding:1px 6px;border-radius:8px;background:rgba(0,229,160,.12);color:var(--green)">📈 '+r.currentLot+' lot</span>'
        : '<span style="font-size:9px;padding:1px 6px;border-radius:8px;background:rgba(74,94,130,.2);color:var(--text3)">Tidak di porto</span>';
      var histBars = ['2019','2020','2021','2022','2023','2024','2025','2026'].map(function(y){
        var dps = r.dpsByYear[y];
        return '<span title="'+y+(dps?' | DPS: Rp'+Math.round(dps):' | Tidak bayar')+'" '
          +'style="display:inline-block;width:13px;height:18px;border-radius:2px;background:'
          +(dps?r.ratingColor:'rgba(255,255,255,.07)')+';margin-right:1px;cursor:default;'
          +'font-size:7px;text-align:center;line-height:18px;color:rgba(0,0,0,.7)">'+(dps?'✓':'')+'</span>';
      }).join('');
      return '<div style="background:var(--bg2);border:1px solid '+(r.ratingColor+'44')+';border-radius:10px;padding:13px">'
        // Header
        +'<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px">'
          +'<div>'
            +'<div style="display:flex;align-items:center;gap:6px">'
              +getStockLogoHtml(r.ticker, 22)
              +'<span class="tp" style="font-size:14px">'+r.ticker+'</span>'
              +portoBadge
            +'</div>'
            +'<div style="font-size:9px;color:var(--text3);margin-top:2px">'+r.compName+'</div>'
          +'</div>'
          +'<span style="font-size:10px;font-weight:700;padding:3px 8px;border-radius:12px;background:'+r.ratingColor+'22;color:'+r.ratingColor+'">'+r.ratingLabel+'</span>'
        +'</div>'
        // Porto live data
        +(r.inPortfolio?'<div style="background:var(--bg3);border-radius:6px;padding:6px 8px;margin-bottom:7px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:3px">'
          +'<div style="font-size:9px;color:var(--text3)">Harga Pasar<br><span style="font-family:var(--font-mono);font-size:11px;color:var(--text)">Rp '+fmt(r.currentPrice)+'</span></div>'
          +'<div style="font-size:9px;color:var(--text3)">Avg Beli<br><span style="font-family:var(--font-mono);font-size:11px;color:var(--amber)">Rp '+fmt(Math.round(r.avgPrice))+'</span></div>'
          +'<div style="font-size:9px;color:var(--text3)">Unrealized<br><span style="font-family:var(--font-mono);font-size:11px;color:'+pnlColor+'">'+pnlSign+r.unrealRet.toFixed(1)+'%</span></div>'
        +'</div>':'')
        // Metrics grid
        +'<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:4px;margin-bottom:7px">'
          +'<div style="font-size:9px;color:var(--text3)">Yield Pasar<br><span style="font-family:var(--font-mono);font-size:12px;font-weight:600;color:var(--text)">'+r.yom.toFixed(2)+'%</span></div>'
          +'<div style="font-size:9px;color:var(--text3)">Yield on Cost<br><span style="font-family:var(--font-mono);font-size:12px;font-weight:600;color:var(--amber)">'+r.yoc.toFixed(2)+'%</span></div>'
          +'<div style="font-size:9px;color:var(--text3)">CAGR DPS<br><span style="font-family:var(--font-mono);font-size:12px;font-weight:600;color:'+cagrColor+'">'+cagrPct+'%/th</span></div>'
          +'<div style="font-size:9px;color:var(--text3)">Konsistensi<br><span style="font-family:var(--font-mono);font-size:12px;font-weight:600">'+Math.round(r.consistency*100)+'%</span></div>'
          +'<div style="font-size:9px;color:var(--text3)">Total Realisasi<br><span style="font-family:var(--font-mono);font-size:11px">Rp '+fmtK(r.totalNet)+'</span></div>'
          +'<div style="font-size:9px;color:var(--text3)">Streak Bayar<br><span style="font-family:var(--font-mono);font-size:12px;font-weight:600;color:var(--accent)">'+proj.streak+' th</span></div>'
        +'</div>'
        // History bars
        +'<div style="margin-bottom:8px">'
          +'<div style="font-size:9px;color:var(--text3);margin-bottom:3px">History bayar 2019–2026</div>'
          +'<div>'+histBars+'</div>'
        +'</div>'
        // Projection
        +'<div style="border-top:1px solid var(--border);padding-top:8px">'
          +'<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">'
            +'<span style="font-size:9px;color:var(--text3)">Proyeksi '+(new Date().getFullYear()+1)+' (P='+Math.round(proj.probPay*100)+'%)</span>'
            +'<div style="width:60px;height:4px;background:var(--bg5);border-radius:2px">'
              +'<div style="width:'+Math.round(proj.probPay*100)+'%;height:100%;background:'+r.ratingColor+';border-radius:2px"></div>'
            +'</div>'
          +'</div>'
          +'<div style="font-family:var(--font-mono);font-size:14px;font-weight:700;color:var(--green)">Rp '+fmtK(proj.expNet)+' <span style="font-size:10px;font-weight:400;color:var(--text3)">net</span></div>'
          +'<div style="font-size:9px;color:var(--text3);margin-top:2px">CI 80%: Rp '+fmtK(proj.ci80Low)+' – Rp '+fmtK(proj.ci80High)+'</div>'
          +'<div style="font-size:9px;color:var(--text3)">Est.DPS Rp '+fmt(Math.round(proj.expDPS))+' × '+(r.currentShares).toLocaleString('id-ID')+' lbr</div>'
          +'<div style="font-size:9px;margin-top:3px;padding:3px 6px;border-radius:5px;background:'+r.ratingColor+'11;color:'+r.ratingColor+'">'+r.ratingNote+'</div>'
        +'</div>'
      +'</div>';
    }).join('')
    : '<div style="color:var(--text3);text-align:center;padding:24px;grid-column:1/-1">Belum ada data. Dividen dari tab <b>Dividen</b> akan otomatis terbaca di sini.</div>';
  }

  // ── Realisasi per Emiten Table ──
  var rtbody = el('di-real-tbody');
  if(rtbody){
    var realResults = results.filter(function(r){return r.yearsPaid.length>0;});
    rtbody.innerHTML = realResults.map(function(r){
      return '<tr>'
        +'<td><div style="display:inline-flex;align-items:center;gap:6px">'+getStockLogoHtml(r.ticker, 18)+'<span class="tp">'+r.ticker+'</span></div><div style="font-size:9px;color:var(--text3);margin-top:2px">'+r.sector+'</div></td>'
        +'<td class="mono" style="font-size:10px">'+r.yearsPaid.join(', ')+'</td>'
        +'<td class="mono up">Rp '+fmtK(r.totalNet)+'</td>'
        +'<td class="mono">Rp '+fmt(Math.round(r.avgDPS))+'</td>'
        +'<td class="mono amb">'+r.yoc.toFixed(2)+'%</td>'
        +'<td><div style="display:flex;align-items:center;gap:4px">'
          +'<div style="width:56px;height:5px;background:var(--bg5);border-radius:3px">'
            +'<div style="width:'+Math.round(r.consistency*100)+'%;height:100%;background:'+r.ratingColor+';border-radius:3px"></div>'
          +'</div>'
          +'<span style="font-size:10px;font-family:var(--font-mono)">'+Math.round(r.consistency*100)+'%</span>'
        +'</div></td>'
      +'</tr>';
    }).join('')||'<tr><td colspan="6" style="text-align:center;color:var(--text3);padding:14px">Belum ada data dividen</td></tr>';
  }

  // ── Tidak Membayar Dividen (dari portofolio) ──
  var noBadge = el('di-no-div-cnt'); if(noBadge) noBadge.textContent = noDivList.length;
  var noList  = el('di-no-div-list');
  if(noList){
    noList.innerHTML = noDivList.length ? noDivList.map(function(r){
      return '<div style="display:flex;justify-content:space-between;align-items:center;padding:7px 0;border-bottom:1px solid var(--border)">'
        +'<div>'
          +'<div style="display:inline-flex;align-items:center;gap:6px">'+getStockLogoHtml(r.ticker, 18)+'<span class="tp">'+r.ticker+'</span></div>'
          +'<span style="font-size:10px;color:var(--text3);margin-left:6px">'+r.compName+'</span>'
          +'<div style="font-size:9px;color:var(--text3);margin-top:1px">'+r.sector+'</div>'
        +'</div>'
        +'<div style="text-align:right">'
          +'<div style="font-size:11px;font-family:var(--font-mono)">'+r.currentLot+' lot · Rp '+fmtK(r.currentMV)+'</div>'
          +'<div style="font-size:10px;color:'+(r.unrealPnl>=0?'var(--green)':'var(--red)')+'">'+
            (r.unrealPnl>=0?'+':'')+fmtK(r.unrealPnl)+' ('+r.unrealRet.toFixed(1)+'%)</div>'
          +'<span style="font-size:9px;padding:1px 7px;border-radius:8px;background:rgba(74,94,130,.25);color:var(--text3)">⬜ Belum ada dividen</span>'
        +'</div>'
      +'</div>';
    }).join('')
    : '<div style="color:var(--text3);font-size:11px;padding:10px 0;text-align:center">✅ Semua holding sudah pernah membayar dividen</div>';
  }

  // ── Projection Table ──
  var projTbody = el('di-proj-tbody');
  if(projTbody){
    var totalProjNet=0;
    var projResults = results.filter(function(r){return r.inPortfolio||r.yearsPaid.length>0;});
    projTbody.innerHTML = projResults.map(function(r){
      var proj = diProjectNext(r,scenario);
      totalProjNet += proj.expNet;
      return '<tr>'
        +'<td><div style="display:inline-flex;align-items:center;gap:6px">'+getStockLogoHtml(r.ticker, 18)+'<span class="tp">'+r.ticker+'</span></div><div style="font-size:9px;color:var(--text3);margin-top:2px">'+r.compName+'</div></td>'
        +'<td class="mono">'+(r.currentShares>0?r.currentShares.toLocaleString('id-ID'):'<span style="color:var(--text3)">—</span>')+'</td>'
        +'<td><div style="display:flex;align-items:center;gap:4px">'
          +'<div style="width:40px;height:4px;background:var(--bg5);border-radius:2px">'
            +'<div style="width:'+Math.round(proj.probPay*100)+'%;height:100%;background:'+r.ratingColor+';border-radius:2px"></div>'
          +'</div>'
          +'<span class="mono" style="font-size:11px">'+Math.round(proj.probPay*100)+'%</span>'
        +'</div></td>'
        +'<td class="mono">Rp '+fmt(Math.round(proj.expDPS))+'</td>'
        +'<td class="mono">Rp '+fmtK(proj.expGross)+'</td>'
        +'<td class="mono up">Rp '+fmtK(proj.expNet)+'</td>'
        +'<td><span style="font-size:10px;font-weight:600;color:'+r.ratingColor+'">'+r.ratingLabel+'</span></td>'
        +'<td style="font-size:10px;color:var(--text3)">'+r.ratingNote+'</td>'
      +'</tr>';
    }).join('')||'<tr><td colspan="8" style="text-align:center;color:var(--text3);padding:14px">Tambahkan transaksi di tab Transaksi &amp; dividen di tab Dividen</td></tr>';
    if(el('di-total-proj-disp')) el('di-total-proj-disp').textContent='Rp '+fmtK(totalProjNet);
  }

  // ── History ticker dropdown — dari semua sumber ──
  var histSel = el('di-history-ticker');
  if(histSel){
    var allDiv2 = diGetAllDividends();
    var tickers2 = [...new Set(allDiv2.filter(function(d){return d.dps>0||d.gross>0;}).map(function(d){return d.ticker;}))].sort();
    var cur2 = histSel.value;
    histSel.innerHTML = '<option value="ALL">Semua Emiten</option>'+
      tickers2.map(function(t){return '<option value="'+t+'"'+(t===cur2?' selected':'')+'>'+t+'</option>';}).join('');
  }

  // ── Riwayat Table — tampilkan semua sumber (global + manual) ──
  var yearFilter2   = el('di-hist-year')&&el('di-hist-year').value||'all';
  var allHistData   = diGetAllDividends().filter(function(d){return d.gross>0||d.net>0;});
  var filteredHist  = yearFilter2==='all' ? allHistData : allHistData.filter(function(d){return d.date&&d.date.startsWith(yearFilter2);});
  filteredHist.sort(function(a,b){return b.date.localeCompare(a.date);});
  var histTbody = el('di-hist-tbody');
  if(histTbody){
    histTbody.innerHTML = filteredHist.map(function(d){
      var yoc = d.avgPrice>0&&d.dps>0 ? (d.dps/d.avgPrice*100).toFixed(2)+'%' : '—';
      var srcBadge = d._src==='lampiran'?'<span style="font-size:8px;background:rgba(167,139,250,.15);color:var(--purple);padding:1px 4px;border-radius:3px">lampiran</span>'
                  : d._src==='manual'?'<span style="font-size:8px;background:rgba(255,193,7,.12);color:var(--amber);padding:1px 4px;border-radius:3px">manual</span>'
                  : '<span style="font-size:8px;background:rgba(0,229,160,.1);color:var(--green);padding:1px 4px;border-radius:3px">porto</span>';
      var deleteBtn = d._src==='manual'
        ? '<button class="btn btn-ghost btn-xs" style="color:var(--red)" onclick="delDivInvestEntry('+d.id+')" title="Hapus" aria-label="Hapus entri dividen '+d.ticker+' '+d.date+'">✕</button>'
        : '<span style="font-size:10px;color:var(--text3)" title="Hapus dari tab Dividen">—</span>';
      return '<tr>'
        +'<td class="mono" style="color:var(--text2);font-size:11px">'+d.date+'</td>'
        +'<td><div style="display:inline-flex;align-items:center;gap:6px">'+getStockLogoHtml(d.ticker, 18)+'<span class="tp">'+d.ticker+'</span> '+srcBadge+'</div></td>'
        +'<td class="mono">'+(d.dps>0?'Rp '+fmt(d.dps):'—')+'</td>'
        +'<td class="mono">'+(d.shares>0?d.shares.toLocaleString('id-ID'):'—')+'</td>'
        +'<td class="mono">Rp '+fmtK(d.gross)+'</td>'
        +'<td class="mono dn">Rp '+fmtK(d.tax)+'</td>'
        +'<td class="mono up">Rp '+fmtK(d.net)+'</td>'
        +'<td class="mono amb">'+yoc+'</td>'
        +'<td>'+deleteBtn+'</td>'
      +'</tr>';
    }).join('')||'<tr><td colspan="9" style="text-align:center;color:var(--text3);padding:14px">Belum ada history. Klik "+ Input Dividen" untuk mulai.</td></tr>';
  }

  renderDivHistoryChart();
}

// ── History DPS Chart ──
function renderDivHistoryChart(){
  var sel=el('di-history-ticker')&&el('di-history-ticker').value||'ALL';
  var allData=diGetAllDividends().filter(function(d){return d.gross>0||d.net>0;});

  var filtered=sel==='ALL'?allData:allData.filter(function(d){return d.ticker===sel;});
  var YEARS=['2019','2020','2021','2022','2023','2024','2025','2026'];
  kc('diHistC');
  var cv=el('diHistChart');
  if(!cv||!filtered.length)return;

  if(sel==='ALL'){
    // Stacked: net per year
    var byYr={};
    filtered.forEach(function(d){var y=d.date.slice(0,4);byYr[y]=(byYr[y]||0)+d.net;});
    charts['diHistC']=new Chart(cv,{type:'bar',data:{labels:YEARS,datasets:[{label:'Net Dividen',data:YEARS.map(function(y){return byYr[y]||0;}),backgroundColor:'rgba(0,229,160,.65)',borderRadius:4}]},
      options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:Object.assign({},TT,{callbacks:{label:function(c){return 'Rp '+fmtK(c.parsed.y);}}})},
        scales:{x:{grid:{color:GC},ticks:TC},y:{grid:{color:GC},ticks:Object.assign({},TC,{callback:function(v){return 'Rp '+fmtK(v);}}),position:'right'}}}});
  } else {
    // DPS trend for single ticker
    var dpsByYr={};
    filtered.forEach(function(d){var y=d.date.slice(0,4);dpsByYr[y]=(dpsByYr[y]||0)+d.dps;});
    charts['diHistC']=new Chart(cv,{type:'line',data:{labels:YEARS,datasets:[{label:'DPS ('+sel+')',data:YEARS.map(function(y){return dpsByYr[y]||null;}),borderColor:'#ffc107',borderWidth:2,fill:true,tension:.4,pointRadius:4,backgroundColor:'rgba(255,193,7,.08)',spanGaps:false}]},
      options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:Object.assign({},TT,{callbacks:{label:function(c){return 'DPS: Rp '+fmt(c.parsed.y);}}})},
        scales:{x:{grid:{color:GC},ticks:TC},y:{grid:{color:GC},ticks:Object.assign({},TC,{callback:function(v){return 'Rp '+fmt(v);}}),position:'right'}}}});
  }
}

// Init divInvest on load
(function(){ try{ if(!window._diInited){ window._diInited=true; diLoadData(); } }catch(e){} })();

