// ╔══════════════════════════════════════════════════════════╗
// ║  REAL DATA ENGINE — sambungkan Kelompok B ke Yahoo riil  ║
// ║  FlowScan · Candle · Correlation · Ranking · Heatmap ·   ║
// ║  Scanner · Screener → data OHLCV harian riil (cache/hari)║
// ║  + VERDICT GABUNGAN: satu skor insight dari semua tools  ║
// ╚══════════════════════════════════════════════════════════╝

var RD_STORE  = {};   // tk → rows [{date,open,high,low,close,volume}] — RIIL saja
var RD_STALE  = {};   // tk → rows dari cache hari sebelumnya (fallback lebih baik dari simulasi)
var RD_FAILED = {};   // tk → true bila fetch gagal sesi ini
var RD_META   = { loading:false, universeLoaded:false, scLiveDone:false };
var RD_TODAY  = new Date().toISOString().slice(0,10);

// FIX (2026-09-11, incident: user localStorage penuh 4.99/5MB, penyimpanan
// portofolio riil gagal dengan QuotaExceededError saat logout): rdSave()
// adalah satu-satunya titik tulis untuk SEMUA cache harga bernama mw_rd_*
// -- dipakai baik oleh fungsi di file ini sendiri (cache 1 tahun per
// ticker, key mw_rd_<TICKER>) MAUPUN oleh perfFetchDailyHistory() di
// 21-performance.js (cache DAILY_MAX/10 TAHUN via perfHistCacheKey(), key
// mw_rd_PXH_STK_<TICKER>/mw_rd_PXH_IDX_<INDEX>/dst -- ~100-130KB per
// entry). Sebelum fix ini, key baru ditambahkan permanen setiap kali user
// menganalisis saham/index/crypto/ETF baru, TIDAK PERNAH dihapus --
// diagnosis langsung dari localStorage user nyata menunjukkan 6+ entry
// PXH_STK_* @ ~100KB masing-masing plus cache lain, total localStorage
// origin (~5MB kuota Chrome) nyaris habis, dan penulisan data PORTOFOLIO
// RIIL (mw_local_data_v3_<user>, via saveData() di 02-storage.js) mulai
// gagal diam-diam karena kuota sudah habis oleh cache harga yang
// sebenarnya disposable (bisa di-refetch Yahoo Finance kapan saja).
var RD_CACHE_BUDGET_BYTES = 2 * 1024 * 1024; // 2MB gabungan untuk seluruh keluarga mw_rd_* -- sisakan ruang untuk data user yang tidak boleh hilang

// Menjaga total ukuran seluruh cache mw_rd_* tetap di bawah
// RD_CACHE_BUDGET_BYTES sebelum menulis entry baru. Field `d` (tanggal
// entry itu terakhir ditulis/direfresh) dipakai sebagai proksi recency --
// entry yang paling lama TIDAK di-refresh dihapus duluan (LRU sederhana
// tanpa perlu index terpisah, karena `d` sudah tersimpan di tiap entry).
function _rdEvictIfNeeded(newKey, newPayloadLen){
  try{
    var entries = [];
    var totalLen = newPayloadLen;
    for(var i=0;i<localStorage.length;i++){
      var k = localStorage.key(i);
      if(!k || k.indexOf('mw_rd_')!==0 || k===newKey) continue;
      var raw = localStorage.getItem(k) || '';
      totalLen += raw.length;
      var d = '';
      try{ d = JSON.parse(raw).d || ''; }catch(e){}
      entries.push({key:k, len:raw.length, d:d});
    }
    if(totalLen <= RD_CACHE_BUDGET_BYTES) return;
    entries.sort(function(a,b){ return a.d < b.d ? -1 : (a.d > b.d ? 1 : 0); }); // paling basi (d terkecil) duluan
    var idx=0;
    while(totalLen > RD_CACHE_BUDGET_BYTES && idx<entries.length){
      localStorage.removeItem(entries[idx].key);
      totalLen -= entries[idx].len;
      idx++;
    }
  }catch(e){}
}

// ── Cache localStorage per hari ──
function rdSave(tk, rows){
  RD_STORE[tk] = rows;
  try{
    var compact = rows.map(function(r){ return [r.date, r.open, r.high, r.low, r.close, r.volume]; });
    var payload = JSON.stringify({d:RD_TODAY, r:compact});
    _rdEvictIfNeeded('mw_rd_'+tk, payload.length);
    localStorage.setItem('mw_rd_'+tk, payload);
  }catch(e){}
}
function _rdExpand(c){ return c.map(function(a){ return {date:a[0], open:a[1], high:a[2], low:a[3], close:a[4], volume:a[5]}; }); }
function rdGet(tk){
  if(RD_STORE[tk]) return RD_STORE[tk];
  try{
    var raw = localStorage.getItem('mw_rd_'+tk);
    if(!raw) return null;
    var o = JSON.parse(raw);
    if(!o || !o.r || !o.r.length) return null;
    var rows = _rdExpand(o.r);
    if(o.d === RD_TODAY){ RD_STORE[tk] = rows; return rows; }
    RD_STALE[tk] = rows; // cache lama: dipakai sebagai fallback, tapi tetap re-fetch
    return null;
  }catch(e){ return null; }
}
function rdGetAny(tk){ return rdGet(tk) || RD_STALE[tk] || null; }
function rdIsReal(tk){ return !!rdGetAny(tk); }

// ── Fetch Yahoo 1 tahun harian — TANPA fallback simulasi (caller yang memutuskan) ──
function rdFetchYahoo(tk, cb, pi){
  pi = pi || 0;
  var cleanTk = String(tk || '').toUpperCase().replace(/\.JK$/i, '').trim();
  if(!cleanTk){ if(cb) cb(new Error('INVALID_TICKER'), null); return; }

  // 1. Coba endpoint first-party server terlebih dahulu (stabil, berlisensi server-side, bebas masalah CORS proxy)
  if(pi === 0 && typeof window !== 'undefined' && window.location && window.location.protocol !== 'file:'){
    fetch('/api/idx/history/' + encodeURIComponent(cleanTk) + '?tf=1Y&market=id')
      .then(function(r){ if(!r.ok) throw new Error('HTTP_'+r.status); return r.json(); })
      .then(function(json){
        var pts = (json && json.points && Array.isArray(json.points)) ? json.points : null;
        if(!pts || pts.length < 15) throw new Error('TOO_FEW');
        var rows = pts.map(function(p){
          var c = Number(p.close !== undefined ? p.close : (p.c !== undefined ? p.c : 0));
          var o = Number(p.open !== undefined ? p.open : (p.o !== undefined ? p.o : c));
          var h = Number(p.high !== undefined ? p.high : (p.h !== undefined ? p.h : Math.max(o, c)));
          var l = Number(p.low !== undefined ? p.low : (p.l !== undefined ? p.l : Math.min(o, c)));
          var v = Number(p.volume !== undefined ? p.volume : (p.v !== undefined ? p.v : 0));
          return {
            date: p.date || (p.t ? new Date(p.t).toISOString().slice(0,10) : ''),
            open: o,
            high: h,
            low: l,
            close: c,
            volume: v
          };
        }).filter(function(r){ return r.close > 0; });
        if(rows.length < 15) throw new Error('TOO_FEW_FILTERED');
        rdSave(cleanTk, rows);
        delete RD_FAILED[cleanTk];
        if(cb) cb(null, rows);
      })
      .catch(function(){
        // Server endpoint gagal atau timeout, coba fallback proxy publik
        rdFetchYahoo(cleanTk, cb, 1);
      });
    return;
  }

  // Offset proxy index (karena pi=0 untuk server)
  var proxyIdx = pi - 1;
  if(!window.FH || !FH.PROXIES || proxyIdx >= FH.PROXIES.length){ RD_FAILED[cleanTk] = true; cb(new Error('ALL_PROXIES_FAILED'), null); return; }
  var yUrl = 'https://query1.finance.yahoo.com/v8/finance/chart/' + cleanTk + '.JK?interval=1d&range=1y';
  var proxyConfig = FH.PROXIES[proxyIdx];
  var url = typeof proxyConfig === 'function' ? proxyConfig(yUrl) : (proxyConfig && proxyConfig.url ? proxyConfig.url(yUrl) : yUrl);
  fetch(url)
  .then(function(r){ if(!r.ok) throw new Error('HTTP_'+r.status); return r.json(); })
  .then(function(d){
    var rawObj = d;
    if(proxyConfig && proxyConfig.isWrapped && d && d.contents){
      try { rawObj = JSON.parse(d.contents); } catch(e){ throw new Error('PARSE_ERROR'); }
    }
    var res = rawObj && rawObj.chart && rawObj.chart.result && rawObj.chart.result[0];
    if(!res || !res.timestamp) throw new Error('NO_DATA');
    var q = (res.indicators && res.indicators.quote && res.indicators.quote[0]) || {};
    var qOpen = q.open || [], qHigh = q.high || [], qLow = q.low || [], qClose = q.close || [], qVol = q.volume || [];
    var rows = res.timestamp.map(function(ts,i){
      return {date:new Date(ts*1000).toISOString().slice(0,10),
              open:qOpen[i]||0, high:qHigh[i]||0, low:qLow[i]||0,
              close:qClose[i]||0, volume:qVol[i]||0};
    }).filter(function(r){ return r.close > 0; });
    if(rows.length < 20) throw new Error('TOO_FEW');
    rdSave(cleanTk, rows);
    delete RD_FAILED[cleanTk];
    cb(null, rows);
  })
  .catch(function(){ rdFetchYahoo(cleanTk, cb, pi+1); });
}
// FIX (2026-09-25, follow-up audit "cek halaman lain yang masih pakai
// fetch tanpa concurrency limit"): rdEnsure() is the single shared
// chokepoint FlowScan/Ranking/Heatmap/Scanner/Alerts/Watchlist/Candle all
// call (see file header) to warm a ticker's real OHLCV cache — but it had
// no concurrency bound at all. fsInit() alone can call it for up to 60
// tickers (FS_RD ranking) plus every watchlist/portfolio ticker (FS_WL) on
// a single page load; with a cold cache (new session, cleared cache,
// browser switch), that fires one /api/idx/history/:ticker Yahoo call per
// distinct uncached ticker simultaneously — the exact same burst-triggers-
// throttling bug class fixed earlier the same day server-side
// (fetchYahooHistoryBatched() in lib/idx-data-engine.js) and client-side
// (perfFetchHoldingsHistory() in 21-performance.js). Fixed here at the
// shared chokepoint itself (rather than patching every caller separately)
// with a small dedupe+queue: concurrent rdEnsure() calls for the SAME
// ticker share one fetch and callback list, and only RD_MAX_CONCURRENT
// (4, matching the constant already used elsewhere for this purpose)
// distinct tickers fetch at once — additional tickers wait in RD_QUEUE
// until a slot frees. The already-cached fast path (rdGet(tk) truthy)
// is untouched: still a synchronous cb(null), no queueing.
var RD_INFLIGHT = {};       // tk -> array of pending callbacks for an in-flight fetch
var RD_INFLIGHT_COUNT = 0;  // number of distinct tickers currently fetching
var RD_QUEUE = [];          // fetches waiting for a free concurrency slot
var RD_MAX_CONCURRENT = 4;
function rdEnsure(tk, cb){
  if(rdGet(tk)){ cb(null); return; }
  if(RD_FAILED[tk]){ cb('failed'); return; }
  if(RD_INFLIGHT[tk]){ RD_INFLIGHT[tk].push(cb); return; }
  RD_INFLIGHT[tk] = [cb];
  function run(){
    RD_INFLIGHT_COUNT++;
    rdFetchYahoo(tk, function(err){
      RD_INFLIGHT_COUNT--;
      var cbs = RD_INFLIGHT[tk] || [];
      delete RD_INFLIGHT[tk];
      cbs.forEach(function(fn){ fn(err); });
      if(RD_QUEUE.length){
        var next = RD_QUEUE.shift();
        next();
      }
    });
  }
  if(RD_INFLIGHT_COUNT < RD_MAX_CONCURRENT) run();
  else RD_QUEUE.push(run);
}

// FIX: `prices{}` (dipakai getPortfolio() untuk Nilai Pasar) dan RD_STORE (cache
// engine ini) adalah DUA cache terpisah yang tidak saling sinkron. Sebelumnya,
// ticker BARU (baru dibeli manual atau lewat bulk import Excel) menunggu siklus
// fhFetchStocks() berkala (rotasi 2 ticker/~2 menit) sebelum harganya terisi —
// selama itu Nilai Pasar tampil 0 (base placeholder untuk universe hasil import
// Excel IDX memang sengaja 0, lihat 14-admin.js). Fungsi ini mengambil harga
// riil satu ticker LANGSUNG dan menuliskannya ke `prices[]`, dipanggil segera
// setelah transaksi baru dicatat (manual maupun bulk) supaya nilainya akurat
// seketika, bukan menunggu rotasi.
function rdFetchLivePrice(tk, cb){
  rdFetchYahoo(tk, function(err, rows){
    if(!err && rows && rows.length){
      prices[tk] = rows[rows.length-1].close;
      if(cb) cb(null, prices[tk]);
    } else if(cb) cb(err||new Error('NO_DATA'));
  });
}

// Ambil harga riil untuk beberapa ticker sekaligus tanpa membanjiri proxy —
// berurutan dengan jeda singkat, lalu satu kali render ulang di akhir.
function rdFetchLivePrices(tickers, onEachOrDone){
  var uniq = [], seen = {};
  tickers.forEach(function(t){ if(t && !seen[t]){ seen[t]=1; uniq.push(t); } });
  var i = 0;
  (function next(){
    if(i >= uniq.length){ if(onEachOrDone) onEachOrDone(); return; }
    var t = uniq[i++];
    rdFetchLivePrice(t, function(){ setTimeout(next, 500); });
  })();
}

// ── Adapter: rows Yahoo → format FlowScan {dt,o,h,l,c,v,obv,ad,mfv,big,up,mfm} ──
function rdToFs(rows, days){
  var slice = rows.slice(-Math.max(5, days));
  var avgV = slice.reduce(function(s,r){ return s+r.volume; },0) / Math.max(1,slice.length);
  var obv = 0, ad = 0;
  var out = slice.map(function(r){
    var o=r.open||r.close, h=r.high||r.close, l=r.low||r.close, c=r.close, v=r.volume||0;
    var mfm = (h-l) > 0 ? ((c-l)-(h-c))/(h-l) : 0;
    obv += c >= o ? v : -v;
    ad  += mfm * v;
    return {dt:new Date(r.date), o:o, h:h, l:l, c:c, v:v, obv:obv, ad:ad,
            mfv:mfm*v, big:v > avgV*1.8, up:c >= o, mfm:mfm};
  });
  out.simulated = false;
  return out;
}

// ══════════════════════════════════════════════
// OVERRIDE 1 — fsGenData: cache-first data riil
// Semua pemakai (FlowScan, Ranking, Heatmap, Scanner, Alerts,
// Watchlist, Candle via cdGenOhlcv) otomatis ikut riil.
// ══════════════════════════════════════════════
var _fsGenSim = fsGenData;
fsGenData = function(tk, days){
  var rows = rdGetAny(tk);
  if(rows && rows.length >= 15) return rdToFs(rows, days);
  return _fsGenSim(tk, days);
};

// ══════════════════════════════════════════════
// OVERRIDE 2 — qtFetchOHLCV: cache-first (≤ 1 thn)
// Backtester/Screener/Pairs/Monthly Returns hemat request.
// ══════════════════════════════════════════════
var _qtFetchOrig = qtFetchOHLCV;
qtFetchOHLCV = function(tk, rangeDays, cb){
  var rows = rdGet(String(tk).toUpperCase());
  if(rows && rangeDays <= 380){
    try{
      el('bt-data-status') && (el('bt-data-status').textContent = '✅ Data riil (cache hari ini): '+rows.length+' hari');
      el('bt-src-label') && (el('bt-src-label').textContent = '● LIVE Yahoo (cache)', el('bt-src-label').style.color = 'var(--green)');
    }catch(e){}
    cb(null, rows.slice());
    return;
  }
  _qtFetchOrig(tk, rangeDays, function(err, data){ cb(err, data); });
};

// ══════════════════════════════════════════════
// OVERRIDE 3 — fsRunAnalysis: fetch riil dulu, lalu analisa + VERDICT
// ══════════════════════════════════════════════
var _fsRunOrig = fsRunAnalysis;
fsRunAnalysis = function(){
  var inp = el('fs-ticker-input');
  var tk = (inp ? inp.value : 'BBCA').trim().toUpperCase().replace(/\.JK$/i,'');
  if(!tk) return;
  if(!rdIsReal(tk) && !RD_FAILED[tk]){
    _fsRunOrig();                      // tampilkan dulu (simulasi, ditandai jelas)
    rdRenderVerdict(tk, true);
    rdEnsure(tk, function(err){        // lalu ganti dengan data riil begitu tiba
      _fsRunOrig();
      rdRenderVerdict(tk, false);
      rdUpdateBanners();
    });
    rdUpdateBanners();
    return;
  }
  _fsRunOrig();
  rdRenderVerdict(tk, false);
  rdUpdateBanners();
};

// ══════════════════════════════════════════════
// VERDICT GABUNGAN — satu skor dari semua analitik Kelompok B
// Komponen: Big Money (30%) · Trend MA (25%) · RSI (15%) ·
//           CMF (15%) · VWAP (5%) · Momentum 3 bln (10%)
// ══════════════════════════════════════════════
function rdRenderVerdict(tk, fetching){
  var pg = el('page-flowscan'); if(!pg) return;
  var box = el('rd-verdict');
  if(!box){
    pg.insertAdjacentHTML('afterbegin', '<div id="rd-verdict" style="margin-bottom:11px"></div>');
    box = el('rd-verdict');
  }
  var data = FS_G.data, a = FS_G.a;
  if(!data || !a || FS_G.tk !== tk){ box.innerHTML=''; return; }

  var real = rdIsReal(tk);
  var rows = rdGetAny(tk);
  var last = a.last;

  // — komponen skor —
  var wsum = 0, parts = [];
  function add(label, score, weight, detail){
    wsum += score * weight;
    parts.push({label:label, score:Math.round(score), detail:detail});
  }
  // 1. Big Money (skor FlowScan asli)
  add('Big Money Flow', a.sc, 0.30, a.bu+' hari akumulasi vs '+a.bd+' distribusi');
  // 2. Trend MA
  var tScore = 40, tTxt = 'harga di sekitar MA';
  if(last.ma20 && last.ma50){
    if(last.c > last.ma20 && last.ma20 > last.ma50){ tScore=95; tTxt='uptrend — harga > MA'+a.maFP+' > MA'+a.maSP; }
    else if(last.c > last.ma20){ tScore=70; tTxt='harga di atas MA'+a.maFP; }
    else if(last.c < last.ma20 && last.ma20 < last.ma50){ tScore=10; tTxt='downtrend — harga < MA'+a.maFP+' < MA'+a.maSP; }
    else { tScore=35; tTxt='harga di bawah MA'+a.maFP; }
  }
  add('Trend (MA)', tScore, 0.25, tTxt);
  // 3. RSI
  var r = a.rl, rScore, rTxt;
  if(r >= 45 && r <= 65){ rScore=80; rTxt='sehat ('+r.toFixed(0)+')'; }
  else if(r > 65 && r <= 75){ rScore=55; rTxt='mulai jenuh beli ('+r.toFixed(0)+')'; }
  else if(r > 75){ rScore=25; rTxt='overbought ('+r.toFixed(0)+') — rawan koreksi'; }
  else if(r >= 30){ rScore=55; rTxt='melemah ('+r.toFixed(0)+')'; }
  else { rScore=45; rTxt='oversold ('+r.toFixed(0)+') — bisa technical rebound'; }
  add('Momentum (RSI)', rScore, 0.15, rTxt);
  // 4. CMF
  var cmf = a.cl, cScore, cTxt;
  if(cmf > 0.10){ cScore=90; cTxt='aliran dana masuk kuat ('+cmf.toFixed(2)+')'; }
  else if(cmf > 0){ cScore=65; cTxt='aliran dana positif tipis ('+cmf.toFixed(2)+')'; }
  else if(cmf > -0.10){ cScore=40; cTxt='aliran dana negatif tipis ('+cmf.toFixed(2)+')'; }
  else { cScore=12; cTxt='dana keluar deras ('+cmf.toFixed(2)+')'; }
  add('Money Flow (CMF)', cScore, 0.15, cTxt);
  // 5. VWAP
  var vScore = 50, vTxt = '—';
  try{
    var vw = fsCalcVWAP(data); var lv = vw[vw.length-1];
    if(lv > 0){ if(last.c >= lv){ vScore=75; vTxt='harga di atas VWAP ('+fsP(lv)+')'; } else { vScore=32; vTxt='harga di bawah VWAP ('+fsP(lv)+')'; } }
  }catch(e){}
  add('Posisi vs VWAP', vScore, 0.05, vTxt);
  // 6. Momentum 3 bulan (hanya bermakna pada data riil 1 thn)
  var mScore = 50, mTxt = 'data < 3 bulan';
  if(rows && rows.length > 70){
    var cl2 = rows.map(function(x){return x.close;});
    var m3 = (cl2[cl2.length-1]-cl2[cl2.length-66])/cl2[cl2.length-66]*100;
    if(m3 > 10){ mScore=85; } else if(m3 > 0){ mScore=65; } else if(m3 > -10){ mScore=35; } else { mScore=15; }
    mTxt = (m3>=0?'+':'')+m3.toFixed(1)+'% dalam 3 bulan';
  }
  add('Momentum 3 Bulan', mScore, 0.10, mTxt);

  var total = Math.round(wsum);
  var label, colr, advice;
  if(total >= 70){ label='POTENSI NAIK KUAT'; colr='var(--green)'; advice='Mayoritas indikator selaras positif. Layak lanjut ke Harga Wajar & Backtester untuk konfirmasi, lalu tentukan sizing di Manajemen Risiko.'; }
  else if(total >= 55){ label='CENDERUNG POSITIF'; colr='#7dd87d'; advice='Bias positif tapi belum bulat. Tunggu konfirmasi (harga menembus MA / CMF menguat) atau beli bertahap.'; }
  else if(total >= 45){ label='NETRAL — TUNGGU'; colr='var(--amber)'; advice='Sinyal campuran. Tidak ada edge yang jelas — lebih baik menunggu daripada memaksakan entry.'; }
  else { label='LEMAH — HINDARI'; colr='var(--red)'; advice='Mayoritas indikator negatif. Hindari entry baru; bila sudah punya posisi, evaluasi cut loss di Manajemen Risiko.'; }

  var srcBadge = fetching
    ? '<span class="badge b-gray">⏳ mengambil data riil Yahoo...</span>'
    : real
      ? '<span class="badge b-up">✓ DATA RIIL YAHOO · '+(rows?rows[rows.length-1].date:'')+'</span>'
      : '<span class="badge b-dn">⚠ SIMULASI — fetch gagal, jangan jadikan dasar keputusan</span>';

  box.innerHTML =
  '<div class="card" style="border-color:'+(real?'rgba(129,140,248,.35)':'rgba(255,193,7,.3)')+'">'+
    '<div style="display:flex;gap:18px;align-items:center;flex-wrap:wrap">'+
      '<div style="text-align:center;min-width:130px">'+
        '<div class="mlabel">🎯 VERDICT GABUNGAN</div>'+
        '<div style="font-size:40px;font-weight:800;font-family:\'Menlo\',monospace;color:'+colr+';line-height:1.1">'+total+'</div>'+
        '<div style="font-size:12px;font-weight:700;color:'+colr+'">'+label+'</div>'+
        '<div style="margin-top:6px">'+srcBadge+'</div>'+
      '</div>'+
      '<div style="flex:1;min-width:260px">'+
        parts.map(function(p){
          var c2 = p.score>=65?'var(--green)':p.score<=35?'var(--red)':'var(--amber)';
          return '<div style="display:flex;align-items:center;gap:8px;margin-bottom:5px">'+
            '<span style="width:130px;font-size:11.5px;color:var(--text2);flex-shrink:0">'+p.label+'</span>'+
            '<div style="flex:1;height:7px;border-radius:99px;background:var(--bg4);overflow:hidden"><div style="height:100%;width:'+p.score+'%;background:'+c2+';border-radius:99px"></div></div>'+
            '<span style="width:30px;text-align:right;font-size:11.5px;font-family:\'Menlo\',monospace;color:'+c2+'">'+p.score+'</span>'+
            '<span style="width:230px;font-size:10.5px;color:var(--text3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="'+p.detail+'">'+p.detail+'</span>'+
          '</div>';
        }).join('')+
        '<div style="margin-top:8px;font-size:11.5px;color:var(--text2);line-height:1.6;border-top:1px solid var(--border);padding-top:8px">💡 '+advice+
        ' <span style="color:var(--text3)">Skor = probabilitas relatif, bukan jaminan.</span></div>'+
      '</div>'+
    '</div>'+
  '</div>';
}

// ══════════════════════════════════════════════
// UNIVERSE LOADER — data riil untuk Ranking/Heatmap/Scanner/Alerts/Watchlist
// ══════════════════════════════════════════════
function rdUniverseTickers(){
  // FIX AUDIT: versi lama memotong ke FS_UNIV.slice(0,12) lalu .slice(0,20) total —
  // bila portofolio user sendiri sudah >20 saham (kasus nyata), saham miliknya yang
  // terpotong diam-diam jatuh ke fallback SIMULASI tanpa peringatan (harga acak,
  // itulah sumber "kesalahan penafsiran saham" — PGEO/CDIA/SMDR dsb menampilkan
  // harga fiktif). Sekarang: portofolio, watchlist, dan saham tambahan admin milik
  // user SELALU ikut dimuat tanpa batas. Bagian FS_UNIV (bisa 900+ saham setelah
  // import Excel IDX) dibatasi ke top-N market cap agar tidak membanjiri proxy
  // publik dengan ratusan request sekaligus — sisanya tetap bisa dimuat manual
  // per-saham lewat tombol ↻ di Kelola Daftar Saham.
  var tks = [], seen = {};
  try{ getPortfolio().forEach(function(p){ if(!seen[p.ticker]){ seen[p.ticker]=1; tks.push(p.ticker); } }); }catch(e){}
  try{ FS_WL.forEach(function(w){ if(!seen[w.t]){ seen[w.t]=1; tks.push(w.t); } }); }catch(e){}
  try{ LQ45_STOCKS.forEach(function(s){ if(!seen[s.t]){ seen[s.t]=1; tks.push(s.t); } }); }catch(e){}
  var univSource = FS_UNIV.length > 60
    ? FS_UNIV.slice().sort(function(a,b){ return (b.cap||0)-(a.cap||0); }).slice(0, 30)
    : FS_UNIV;
  univSource.forEach(function(u){ if(!seen[u.t]){ seen[u.t]=1; tks.push(u.t); } });
  if(typeof ADMIN_EXTRA !== 'undefined'){ ADMIN_EXTRA.forEach(function(t){ if(!seen[t]){ seen[t]=1; tks.push(t); } }); }
  if(typeof ADMIN_META !== 'undefined'){ tks = tks.filter(function(t){ return !(ADMIN_META[t] && ADMIN_META[t].excluded); }); }
  return tks;
}

// Retry manual untuk satu ticker — membuka blokir RD_FAILED (dipakai Admin Panel)
function rdRetryTicker(code, cb){
  delete RD_FAILED[code];
  rdFetchYahoo(code, function(err){
    rdRebuildFromReal();
    if(cb) cb(err);
  });
}

function rdLoadUniverse(force){
  if(RD_META.loading) return;
  var all = rdUniverseTickers();
  var tks = all.filter(function(t){ return force ? true : (!rdGet(t) && !RD_FAILED[t]); });
  if(!tks.length){ rdRebuildFromReal(); return; }
  RD_META.loading = true;
  var i = 0, ok = 0;
  (function next(){
    if(i >= tks.length){
      RD_META.loading = false;
      rdRebuildFromReal();
      return;
    }
    var t = tks[i++];
    rdSetBannerText('⏳ Memuat data riil Yahoo: <b>'+t+'</b> ('+i+'/'+tks.length+')... Ranking, Heatmap, Scanner & Watchlist akan otomatis diperbarui.');
    rdFetchYahoo(t, function(err){ if(!err) ok++; setTimeout(next, 1600); });
  })();
}

// Bangun ulang seluruh struktur analisa dari data riil yang tersedia
function rdRebuildFromReal(){
  var realCount = rdUniverseTickers().filter(function(t){ return rdIsReal(t); }).length;
  RD_META.universeLoaded = realCount > 0;
  // FS_RD & FS_WL (pertahankan isi watchlist user)
  var wlTks = FS_WL.map(function(w){ return w.t; });
  FS_WL.length = 0; FS_RD.length = 0;
  try{ fsInit(); }catch(e){}
  // Buang saham yang dikecualikan lewat Admin Panel dari seluruh hasil analisa
  if(typeof ADMIN_META !== 'undefined'){
    var kept = FS_RD.filter(function(r){ return !(ADMIN_META[r.t] && ADMIN_META[r.t].excluded); });
    FS_RD.length = 0; kept.forEach(function(r){ FS_RD.push(r); });
  }
  // Bila data riil sudah ada: Ranking/Heatmap/Scanner/Alerts HANYA menampilkan
  // saham dengan data riil — jangan campur dengan entri simulasi (menyesatkan).
  if(RD_META.universeLoaded || rdUniverseTickers().some(function(t){ return rdIsReal(t); })){
    var realOnly = FS_RD.filter(function(r){ return rdIsReal(r.t); });
    if(realOnly.length >= 5){ FS_RD.length = 0; realOnly.forEach(function(r){ FS_RD.push(r); }); }
  }
  wlTks.forEach(function(t){
    if(!FS_WL.some(function(w){ return w.t===t; })){
      // Was a hardcoded {t,n:t,s:'IHSG',cap:0} duplicate of fsFallbackInfo()'s
      // OLD (buggy) fallback — same class of bug as the CUAN incident
      // (name=code, sector=IHSG instead of the real sector). Reuse the
      // already-fixed shared helper instead of re-duplicating its logic.
      var info = FS_UNIV.find(function(u){ return u.t===t; }) || fsFallbackInfo(t);
      var d = fsGenData(t, 60);
      FS_WL.push(Object.assign({}, info, {data:d, a:fsProcess(d)}));
    }
  });
  // Screener (QT.scData) dari data riil
  rdBuildScData();
  // FIX: `prices{}` (dipakai getPortfolio() untuk Nilai Pasar di Portofolio/
  // Dashboard) dan cache data riil di sini (RD_STORE) sebelumnya tidak pernah
  // saling sinkron — saham yang harga riilnya HANYA berasal dari sini (bukan
  // dari fhFetchStocks() 03-engine.js) tetap tampil 0 walau datanya sudah ada.
  // Sinkronkan sekarang untuk seluruh saham yang benar-benar dimiliki user.
  try{
    getPortfolio().forEach(function(p){
      var rows = rdGetAny(p.ticker);
      if(rows && rows.length) prices[p.ticker] = rows[rows.length-1].close;
    });
  }catch(e){}
  rdUpdateBanners();
  try{ renderPage(currentPage); }catch(e){}
  setTimeout(rdUpdateBanners, 300);
}

// Sumber kanonik Screener/Heatmap — TIDAK PERNAH difilter, agar exclude di Admin
// Panel bisa di-toggle bolak-balik tanpa kehilangan data (bug lama: memfilter
// QT.scData langsung membuatnya permanen hilang sampai reload halaman).
var _scBaseCache = null;
function rdBuildScData(){
  if(!_scBaseCache){
    if(!QT.scData.length){ try{ scBuildSim(); }catch(e){} }
    _scBaseCache = QT.scData.slice();
  }
  QT.scData = _scBaseCache.map(function(st){
    var rows = rdGetAny(st.t);
    if(!rows || rows.length < 70) return st;
    var close = rows.map(function(r){ return r.close; });
    var rsi2 = qtRSI(close, 14);
    var ma50 = qtSMA(close, 50);
    var rsiLast = rsi2[rsi2.length-1]||50;
    var lc = close[close.length-1], lm = ma50[ma50.length-1];
    var mom1m = (lc-close[close.length-22])/close[close.length-22]*100;
    var mom3m = (lc-close[Math.max(0,close.length-66)])/close[Math.max(0,close.length-66)]*100;
    var w30 = close.slice(-30);
    var vol = Math.sqrt(w30.slice(1).map(function(c,i){ return Math.pow((c-w30[i])/w30[i]*100,2); }).reduce(function(a,b){ return a+b; },0)/29);
    var score = Math.round((50-Math.abs(rsiLast-50))/50*40+(mom1m>0?Math.min(mom1m*2,30):0)+(lc>lm?20:0));
    return Object.assign({}, st, {rsi:rsiLast, mom1m:mom1m, mom3m:mom3m, vol:vol, price:lc, aboveMa:lc>lm, score:score, live:true});
  }).filter(function(st){
    return !(typeof ADMIN_META !== 'undefined' && ADMIN_META[st.t] && ADMIN_META[st.t].excluded);
  });
}

// ══════════════════════════════════════════════
// Correlation Matrix: didelegasikan ke mesin kanonikal (11-quant.js)
// ══════════════════════════════════════════════
// Tidak menimpa corrRender() dengan data statis / qtGenSim. Modul 11-quant.js
// menghitung korelasi portofolio riil pengguna + metrik risiko VaR 95% via perfFetchHoldingsHistory.


// ══════════════════════════════════════════════
// BANNER STATUS DATA — di semua halaman Kelompok B
// ══════════════════════════════════════════════
var RD_BANNER_PAGES = ['heatmap','scanner','alerts','screener','candle','correlation'];
function rdBannerHtml(){
  var uTks = rdUniverseTickers();
  var realN = uTks.filter(function(t){ return rdIsReal(t); }).length;
  if(RD_META.loading) return '<span style="color:var(--amber)">⏳</span> <span id="rd-banner-txt">Memuat data riil Yahoo...</span>';
  if(realN === 0) return '<span style="color:var(--red)">⚠</span> <b style="color:var(--red)">DATA SIMULASI</b> — belum ada data riil. <button class="btn btn-blue btn-xs" onclick="rdLoadUniverse(true)">📡 Muat Data Riil Yahoo (±30 dtk)</button>';
  var full = realN >= uTks.length;
  return '<span style="color:'+(full?'var(--green)':'var(--amber)')+'">'+(full?'✓':'◐')+'</span> '+
    '<b style="color:'+(full?'var(--green)':'var(--amber)')+'">DATA RIIL YAHOO '+realN+'/'+uTks.length+' saham</b> '+
    '<span style="color:var(--text3)">· harian 1 thn · cache '+RD_TODAY+'</span> '+
    '<button class="btn btn-ghost btn-xs" onclick="rdLoadUniverse(true)">↻ Refresh</button>';
}
function rdUpdateBanners(){
  RD_BANNER_PAGES.forEach(function(p){
    var pg = el('page-'+p); if(!pg) return;
    var b = pg.querySelector('.rd-banner');
    if(!b){
      pg.insertAdjacentHTML('afterbegin', '<div class="rd-banner" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;background:rgba(129,140,248,.07);border:1px solid var(--border2);border-radius:10px;padding:8px 13px;margin-bottom:10px;font-size:12px"></div>');
      b = pg.querySelector('.rd-banner');
    }
    b.innerHTML = rdBannerHtml();
  });
}
function rdSetBannerText(html){
  RD_BANNER_PAGES.forEach(function(p){
    var pg = el('page-'+p); if(!pg) return;
    var b = pg.querySelector('.rd-banner'); if(!b) return;
    b.innerHTML = '<span style="color:var(--amber)">⏳</span> <span>'+html+'</span>';
  });
}

// ══════════════════════════════════════════════
// HOOK NAVIGASI — auto-fetch per halaman
// ══════════════════════════════════════════════
var _rdGoPage = window.goPage;
window.goPage = function(page, btn){
  _rdGoPage.call(this, page, btn);
  if(page === 'candle'){
    var tk = (typeof CD_TICKER !== 'undefined' && CD_TICKER) || null;
    if(tk && !rdIsReal(tk) && !RD_FAILED[tk]){
      rdEnsure(tk, function(err){ try{ renderCandle(); }catch(e){} });
    }
  }
  if(page === 'monthly-returns'){
    var t = (el('mr-ticker') && el('mr-ticker').value) || 'BBCA';
    if(!QT.mrData[t]) setTimeout(function(){ try{ mrFetch(); }catch(e){} }, 400);
  }
  if(page === 'screener' && RD_META.universeLoaded && !RD_META.scLiveDone){
    RD_META.scLiveDone = true;
    setTimeout(function(){ try{ rdBuildScData(); scRenderTable(); }catch(e){} }, 250);
  }
  if(RD_BANNER_PAGES.indexOf(page) >= 0 || page === 'flowscan'){
    setTimeout(rdUpdateBanners, 300);
  }
};

// ── INIT: muat cache hari ini ke memori, lalu auto-load universe ──
(function(){
  rdUniverseTickers().forEach(function(t){ rdGet(t); }); // warm dari localStorage
  setTimeout(function(){ rdLoadUniverse(false); }, 8000); // auto — hanya fetch yang belum ada cache hari ini
  setTimeout(rdUpdateBanners, 1500);
})();
