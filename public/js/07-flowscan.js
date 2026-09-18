// ============================================================
// FLOWSCAN — BIG MONEY ANALISA ENGINE (dari index.html)
// ============================================================
var FS_LAST_SIMULATED = {}; // tracks in-flight background real-data fetches per ticker (see fsGenData)
var FS_UNIV=[
  {t:'BBCA',n:'Bank Central Asia',s:'Perbankan',cap:950},
  {t:'BBRI',n:'Bank Rakyat Indonesia',s:'Perbankan',cap:780},
  {t:'BMRI',n:'Bank Mandiri',s:'Perbankan',cap:620},
  {t:'TLKM',n:'Telkom Indonesia',s:'Telekomunikasi',cap:580},
  {t:'ASII',n:'Astra International',s:'Otomotif',cap:450},
  {t:'BBNI',n:'Bank Negara Indonesia',s:'Perbankan',cap:320},
  {t:'UNVR',n:'Unilever Indonesia',s:'Konsumer',cap:270},
  {t:'ADRO',n:'Adaro Energy',s:'Energi',cap:240},
  {t:'ANTM',n:'Aneka Tambang',s:'Tambang',cap:200},
  {t:'PGAS',n:'Perusahaan Gas Negara',s:'Energi',cap:185},
  {t:'INDF',n:'Indofood Sukses Makmur',s:'Konsumer',cap:175},
  {t:'KLBF',n:'Kalbe Farma',s:'Farmasi',cap:165},
  {t:'ICBP',n:'Indofood CBP',s:'Konsumer',cap:160},
  {t:'SMGR',n:'Semen Indonesia',s:'Industri',cap:140},
  {t:'PTBA',n:'Bukit Asam',s:'Tambang',cap:125},
  {t:'JSMR',n:'Jasa Marga',s:'Infrastruktur',cap:120},
  {t:'INCO',n:'Vale Indonesia',s:'Tambang',cap:115},
  {t:'MAPI',n:'Mitra Adiperkasa',s:'Ritel',cap:110},
  {t:'PWON',n:'Pakuwon Jati',s:'Properti',cap:95},
  {t:'CPIN',n:'Charoen Pokphand',s:'Konsumer',cap:90},
  {t:'MYOR',n:'Mayora Indah',s:'Konsumer',cap:88},
  {t:'ACES',n:'Ace Hardware',s:'Ritel',cap:82},
  {t:'AUTO',n:'Astra Otoparts',s:'Otomotif',cap:72},
  {t:'PGEO',n:'Pertamina Geothermal',s:'Energi',cap:68},
  {t:'ADMR',n:'Adaro Minerals',s:'Tambang',cap:65},
  {t:'ARCI',n:'Archi Indonesia',s:'Tambang',cap:60},
  {t:'BUMI',n:'Bumi Resources',s:'Energi',cap:58},
  {t:'SMDR',n:'Samudera Indonesia',s:'Transportasi',cap:55},
  {t:'SIDO',n:'Industri Jamu Sido Muncul',s:'Konsumer',cap:52},
  {t:'WIFI',n:'Solusi Sinergi Digital',s:'Teknologi',cap:48},
];

// Same English->Indonesian sector-label map 06-analysis-router.js's init()
// applies when it builds DB[] from XLSX_DATA.stocks (kept as a small
// duplicated lookup table here rather than a shared export, since it's
// static and rarely changes — hoisting it would touch that file's init()
// too for no behavioral gain). Needed because _IDX_RAW_LIST's own sector
// classification (what DB[tk].sector falls back to below) is in English
// ("Consumer Cyclicals", "Energy", ...) while every sector badge elsewhere
// in this app (Portfolio, Sector Insight, Wealth) is Indonesian — without
// this, a bulk-imported ticker with no sector of its own would show a raw
// English label sitting next to Indonesian ones in the same table.
var FS_SECTOR_MAP={'Financials':'Keuangan','Energy':'Energi','Infrastructures':'Infrastruktur',
  'Consumer Non-Cyclicals':'Konsumer Primer','Basic Materials':'Barang Baku',
  'Consumer Cyclicals':'Konsumer Non-Primer','Healthcare':'Kesehatan',
  'Transportation & Logistic':'Infrastruktur','Properties & Real Estate':'Properti','Properties':'Properti'};
function fsSectorLabel(raw){ return raw ? (FS_SECTOR_MAP[raw]||raw) : null; }

// Tambahkan saham dari portofolio real — gunakan nama dari DB jika ada
XLSX_DATA.stocks.forEach(function(s){
  if(!FS_UNIV.find(function(u){return u.t===s.code})){
    var dbInfo = DB[s.code];
    var nama = (dbInfo && dbInfo.name) ? dbInfo.name : s.code;
    // FIX: fallback dulu 'IHSG' — itu nama indeks komposit, bukan sektor,
    // jadi tampil sebagai badge sektor yang tidak masuk akal untuk saham
    // hasil bulk-import Excel tanpa data sektor sendiri (lihat KODE →
    // badge di halaman Watchlist/Ranking). DB[s.code].sector dicoba dulu
    // (01-data.js sudah membackfill-nya dari _IDX_RAW_LIST kalau ada),
    // baru jatuh ke 'Lainnya' — konvensi "sektor tidak diketahui" yang
    // sama dipakai di 01-data.js/06-analysis-router.js/22-datahealth.js.
    FS_UNIV.push({t:s.code,n:nama,s:fsSectorLabel(s.sector)||fsSectorLabel(dbInfo&&dbInfo.sector)||'Lainnya',cap:Math.round(s.amount/1e9)||1});
  }
});
// Untuk semua entry di FS_UNIV, update nama dari DB jika tersedia dan lebih baik
FS_UNIV = FS_UNIV.map(function(u){
  var dbInfo = DB[u.t];
  if(dbInfo && dbInfo.name && dbInfo.name !== u.t) u.n = dbInfo.name;
  return u;
});
// Dedup FS_UNIV by ticker
(function(){ var seen={}; FS_UNIV=FS_UNIV.filter(function(u){ if(seen[u.t]) return false; seen[u.t]=true; return true; }); })();

var FS_G={tk:'BBCA',days:30,data:null,a:null};
var FS_WL=[];
var fsWlSort='default';
var FS_CHARTS={};
var FS_RD=[];

// ── seed RNG ──
function fsSd(s){var h=0;for(var i=0;i<s.length;i++)h=(Math.imul(31,h)+s.charCodeAt(i))|0;return Math.abs(h);}
function fsSr(s){var x=Math.sin(s+1)*10000;return x-Math.floor(x);}

// ── format helpers ──
function fsTick(p){
  if(p<200)return 1; if(p<500)return 2; if(p<2000)return 5;
  if(p<5000)return 10; return 25;
}
function fsRoundTick(p){var t=fsTick(p);return Math.max(t,Math.round(p/t)*t);}

function fsV(n){if(!n||isNaN(n))return'—';if(n>=1e9)return(n/1e9).toFixed(2)+'M';if(n>=1e6)return(n/1e6).toFixed(1)+'Jt';if(n>=1e3)return(n/1e3).toFixed(0)+'Rb';return Math.round(n)+'';}
function fsP(n){if(!n||isNaN(n))return'—';return'Rp '+Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g,'.');}
function fsD(d){return new Date(d).toLocaleDateString('id-ID',{day:'2-digit',month:'short'});}
function fsPct(n){return(n>=0?'▲':'▼')+Math.abs(n).toFixed(2)+'%';}
function fsScColor(s){return s>=58?'#41f3a7':s<=42?'#e21d48':'#8fa3c8';}
// Shared fallback for a ticker not found in FS_UNIV at all — was
// `{t:tk,n:tk,cap:0}` plus a sector field literally set to "IHSG" (the composite
// index, not a sector) as a sector badge for these tickers on Ranking/
// Heatmap/Watchlist. Tries DB[tk]'s own sector (already backfilled from
// _IDX_RAW_LIST by 01-data.js when available) before falling back to
// 'Lainnya', the "sector unknown" convention used everywhere else in
// this app.
// The `n` (name) field had the same class of bug: it was hardcoded to the
// ticker code itself, so any stock outside FS_UNIV's static 30-ticker list
// (e.g. CUAN) showed its code twice instead of a company name on
// Ranking/Heatmap/Watchlist, even though DB[tk].name already has the real
// name. Mirrors the DB[tk].sector fallback right below, and the same
// "!== tk" guard getIntelStockMeta() in 27-stockintel.js uses.
function fsFallbackInfo(tk){
  var dbInfo = (typeof DB !== 'undefined') ? DB[tk] : null;
  var dbSector = (dbInfo && dbInfo.sector) ? dbInfo.sector : null;
  var dbName = (dbInfo && dbInfo.name && dbInfo.name !== tk) ? dbInfo.name : tk;
  return { t: tk, n: dbName, s: fsSectorLabel(dbSector) || 'Lainnya', cap: 0 };
}
function fsMkBdg(sig,sm){
  var cls=sig==='AKUMULASI'?'b-up':sig==='DISTRIBUSI'?'b-dn':'b-neu';
  var ic=sig==='AKUMULASI'?'ti-trending-up':sig==='DISTRIBUSI'?'ti-trending-down':'ti-minus';
  return '<span class="badge '+cls+'" style="'+(sm?'padding:2px 6px;font-size:10px':'')+
    '"><i class="ti '+ic+'"></i> '+sig+'</span>';
}
// KNOWN_ISSUES.md #2 — shared disclosure marker for whether the Big Money
// score/signal shown was computed from real cached OHLCV (fsGenData()'s
// rdGetAny() branch) or the seeded random-walk fallback used while real data
// hasn't been fetched yet for that ticker (data.simulated, set by
// fsGenData()). Reused by Ranking, Heatmap, Watchlist and the single-ticker
// analysis view so a fabricated score is never shown indistinguishably from
// a real one anywhere FS_RD/FS_WL/FS_G feed into.
function fsSrcDot(isSimulated){
  return isSimulated
    ? '<span title="SIMULASI — data acak, bukan harga/volume pasar riil. Klik Refresh di Kelola Daftar Saham." style="color:#e21d48;font-size:9px;margin-left:4px;cursor:help">○ SIM</span>'
    : '<span title="Data riil (cache OHLCV)" style="color:#41f3a7;font-size:9px;margin-left:4px">●</span>';
}

// ── data engine ──
// ── data engine ──
function fsGenData(tk,days){
  // 1. Prioritize 100% real market OHLCV data from Yahoo / RD_STORE if available
  if (typeof rdGetAny === 'function') {
    var realRows = rdGetAny(tk);
    if (realRows && realRows.length > 0) {
      var slice = realRows.slice(-days);
      var obv = 0, ad = 0;
      var out = slice.map(function(r) {
        var o = r.open || r.o || r.close || r.c;
        var h = r.high || r.h || r.close || r.c;
        var l = r.low || r.l || r.close || r.c;
        var c = r.close || r.c;
        var v = r.volume || r.v || 1000000;
        var mfm = (h - l) > 0 ? ((c - l) - (h - c)) / (h - l) : 0;
        obv += c >= o ? v : -v;
        ad += mfm * v;
        return {
          dt: new Date(r.date || r.dt || Date.now()),
          o: o, h: h, l: l, c: c, v: v,
          obv: obv, ad: ad, mfv: mfm * v,
          big: v > 10000000, up: c >= o, mfm: mfm
        };
      });
      // KNOWN_ISSUES.md #2: tag the returned array itself with whether it's
      // real OHLCV or about to fall through to the synthetic branch below —
      // every render function that reads FS_RD/FS_WL/FS_G off this array
      // checks .simulated to decide whether to show a "SIM" disclosure.
      if (out.length >= 5) { out.simulated = false; return out; }
    }
  }

  // 2. Real SSOT Base Price Resolution (No Dummy Data)
  if (typeof isValidStockTicker === 'function' && !isValidStockTicker(tk)) {
    return [];
  }

  // No real OHLCV cached for this ticker yet, so the seeded synthetic
  // series below is about to be used (see the honesty note further down).
  // Kick off a real fetch in the background so rdGetAny(tk) above starts
  // returning real data on the next call for this ticker - shared with
  // every other feature that also reads RD_STORE (TradeWave, Screener,
  // Backtester), not a separate cache.
  if (typeof rdEnsure === 'function') {
    if (!FS_LAST_SIMULATED[tk]) {
      FS_LAST_SIMULATED[tk] = true;
      rdEnsure(tk, function() { FS_LAST_SIMULATED[tk] = false; });
    }
  }

  var s = fsSd(tk);
  var base = (typeof getGlobalMarketPrice === 'function' ? getGlobalMarketPrice(tk) : 0);
  if (!base || base <= 0) {
    var realStk = (typeof XLSX_DATA !== 'undefined' && XLSX_DATA.stocks) ? XLSX_DATA.stocks.find(function(x){return x.code===tk;}) : null;
    if (realStk && realStk.price > 0) base = realStk.price;
    else if (typeof DB !== 'undefined' && DB[tk]) base = DB[tk].base;
    else return [];
  }
  var price = base, obv = 0, ad = 0, data = [];
  var vol = 5e6 + fsSr(s+1)*50e6;
  var bias = fsSr(s+99) > 0.5 ? 0.0003 : -0.0002;
  for(var i=0; i<days; i++){
    var r = fsSr(s*i+i*7+13), r2 = fsSr(s*i+i*3+7), r3 = fsSr(s*i+i*11+29), r4 = fsSr(s*i+i*17+41);
    var ret = (r-.49)*.03+bias, o = price, c = price*(1+ret);
    var h = Math.max(o,c)*(1+r2*.015), l = Math.min(o,c)*(1-r3*.015);
    var big = r4>.82, v = vol*(.5+r*.8)*(big?(2+r2*3):1);
    var mfm = (h-l)>0?((c-l)-(h-c))/(h-l):0;
    obv += c>o?v:-v; ad += mfm*v;
    var dt = new Date(); dt.setDate(dt.getDate()-days+i);
    o = fsRoundTick(o); h = fsRoundTick(h); l = fsRoundTick(l); c = fsRoundTick(c);
    data.push({dt:dt, o:o, h:h, l:l, c:c, v:v, obv:obv, ad:ad, mfv:mfm*v, big:big, up:c>=o, mfm:mfm});
    price = c;
  }
  data.simulated = true; // KNOWN_ISSUES.md #2 — this whole series is the seeded random-walk fallback, not real OHLCV
  return data;
}
// FIX (2026-09-15, user-requested "gabungkan Volume Spike ke Market Radar"):
// Market Radar (fsRenderRanking) SUDAH memuat 60 hari data OHLCV+volume per
// saham untuk menghitung CMF (lihat fsInit -> fsGenData) — jadi rasio volume
// spike bisa dihitung dari data yang SAMA, tanpa fetch tambahan sama sekali.
// vsMedian()/VS_SPIKE_THRESHOLD (45-volume-spike.js) dipakai ulang di sini
// (bukan ditulis ulang) supaya definisi "spike" (rasio ≥1.70x median) SAMA
// PERSIS antara Market Radar dan halaman Volume Spike — dua tempat itu jadi
// benar-benar saling melengkapi (bukan 2 angka beda arti yang kebetulan mirip).
function fsCalcVolRatio(data){
  var n = data.length;
  var todayVol = (n && data[n-1]) ? data[n-1].v : 0;
  var vol14 = data.slice(-15,-1).map(function(r){ return r.v; });
  var vol30 = data.slice(-31,-1).map(function(r){ return r.v; });
  var med14 = (typeof vsMedian==='function') ? vsMedian(vol14) : 0;
  var med30 = (typeof vsMedian==='function') ? vsMedian(vol30) : 0;
  var ratio14 = med14>0 ? todayVol/med14 : 0;
  var ratio30 = med30>0 ? todayVol/med30 : 0;
  var threshold = (typeof VS_SPIKE_THRESHOLD==='number') ? VS_SPIKE_THRESHOLD : 1.7;
  return { ratio14:ratio14, ratio30:ratio30, isSpike: ratio14>=threshold || ratio30>=threshold };
}
// Pindah ke halaman Volume Spike (kolom kanannya: screening lintas-saham +
// panel detail) dengan ticker ini langsung dipilih — drill-down 1 klik dari
// Market Radar, konsisten dengan pola GLOBAL_STOCK_CONTEXT yang sudah dipakai
// di seluruh app untuk sinkronisasi ticker lintas-halaman.
function fsGoVolumeSpike(tk){
  if(typeof window!=='undefined' && window.GLOBAL_STOCK_CONTEXT) window.GLOBAL_STOCK_CONTEXT.setTicker(tk,'market-radar');
  if(typeof goPage==='function') goPage('volume-spike', null);
}
function fsCalcCMF(data,p){p=p||20;return data.map(function(_,i){if(i<p-1)return 0;var sm=0,sv=0;for(var j=i-p+1;j<=i;j++){sm+=data[j].mfv;sv+=data[j].v;}return sv>0?sm/sv:0;});}
function fsCalcMA(arr,p){return arr.map(function(_,i){if(i<p-1)return null;return arr.slice(i-p+1,i+1).reduce(function(a,b){return a+b;},0)/p;});}
function fsCalcRSI(data,p){p=p||14;var g=0,l=0;for(var i=1;i<=p;i++){var d=data[i].c-data[i-1].c;if(d>0)g+=d;else l-=d;}var ag=g/p,al=l/p,rsi=[];for(var i=0;i<p;i++)rsi.push(50);rsi.push(al===0?100:100-(100/(1+ag/al)));for(var i=p+1;i<data.length;i++){var d=data[i].c-data[i-1].c;ag=(ag*(p-1)+(d>0?d:0))/p;al=(al*(p-1)+(d<0?-d:0))/p;rsi.push(al===0?100:100-(100/(1+ag/al)));}return rsi;}

function fsProcess(data){
  var n=data.length;
  // Adaptasi periode indikator sesuai jumlah data tersedia
  var cmfP  = Math.max(3, Math.min(20, Math.floor(n*0.6)));
  var maFP  = Math.max(3, Math.min(20, Math.floor(n*0.5)));
  var maSP  = Math.max(5, Math.min(50, Math.floor(n*0.8)));
  var rsiP  = Math.max(3, Math.min(14, Math.floor(n*0.6)));
  var vmaP  = Math.max(3, Math.min(20, Math.floor(n*0.5)));

  var cmf=fsCalcCMF(data,cmfP);
  var cls=data.map(function(d){return d.c;});
  var vls=data.map(function(d){return d.v;});
  var ma20=fsCalcMA(cls,maFP),ma50=fsCalcMA(cls,maSP),vma20=fsCalcMA(vls,vmaP),rsi=fsCalcRSI(data,rsiP);
  data.forEach(function(d,i){
    d.ma20=ma20[i];d.ma50=ma50[i];d.vma20=vma20[i];d.cmf=cmf[i];d.rsi=rsi[i];
    d.vr=d.vma20?d.v/d.vma20:1;d.isBig=d.vr>=1.5;
    d.buyVol=d.mfm>0?d.v*d.mfm:0;d.sellVol=d.mfm<0?d.v*(-d.mfm):0;
    if(d.isBig&&d.up)d.sig='ACC';else if(d.isBig&&!d.up)d.sig='DIST';else d.sig='';
  });
  var cl=cmf[cmf.length-1]||0,rl=rsi[rsi.length-1]||50;
  var lookback=Math.min(n,20);
  var rec=data.slice(-lookback);
  var bu=rec.filter(function(d){return d.sig==='ACC';}).length;
  var bd=rec.filter(function(d){return d.sig==='DIST';}).length;
  var last=data[data.length-1],prev=data[data.length-2]||last;
  var chgPct=prev.c>0?((last.c-prev.c)/prev.c*100):0;
  var obvRef=data[Math.max(0,data.length-Math.min(10,n-1))];
  var adRef=data[Math.max(0,data.length-Math.min(5,n-1))];
  var obvT=obvRef?last.obv>obvRef.obv:false;
  var adT=adRef?last.ad>adRef.ad:false;
  var sc=40;
  if(cl>0.1)sc+=20;else if(cl>0)sc+=10;else if(cl<-0.1)sc-=20;else sc-=10;
  if(cl>0)sc+=5;if(bu>bd)sc+=20;if(bu>=2)sc+=10;if(obvT)sc+=10;if(rl>50&&rl<70)sc+=10;
  if(last.ma20&&last.c>last.ma20)sc+=10;
  sc=Math.max(0,Math.min(100,sc));
  var sig='NETRAL',str='Sinyal lemah';
  if(sc>=70){sig='AKUMULASI';str='Sinyal kuat';}else if(sc>=58){sig='AKUMULASI';str='Sinyal sedang';}
  else if(sc<=30){sig='DISTRIBUSI';str='Sinyal kuat';}else if(sc<=42){sig='DISTRIBUSI';str='Sinyal sedang';}
  return{cmf:cmf,ma20:ma20,ma50:ma50,rsi:rsi,cl:cl,rl:rl,bu:bu,bd:bd,sc:sc,sig:sig,str:str,
         chgPct:chgPct,obvT:obvT,adT:adT,last:last,prev:prev,cmfP:cmfP,maFP:maFP,maSP:maSP,rsiP:rsiP};
}

// ── nav / helpers ──
// FIX (2026-09-12, dead-code cleanup): fsSt() dan fsSetPeriod() dihapus -
// keduanya HANYA dipanggil dari onclick di markup <div id="page-flowscan">
// (dashboard FlowScan lama), yang sendiri sudah dihapus karena terbukti
// dead code - goPage('flowscan') selalu redirect ke Bandarmology Cockpit
// sebelum halaman itu sempat dirender (lihat INCIDENT_LOG.md). fsRunAnalysis()
// TETAP dipertahankan karena masih dipanggil fsQuickLoad() dari halaman
// Ranking/Heatmap/Watchlist yang live - semua akses DOM di dalamnya sudah
// defensif (if(el)...) jadi aman jadi no-op tanpa target render.

function fsQuickLoad(tk){
  var inp=document.getElementById('fs-ticker-input');
  if(inp) inp.value=tk;
  goPage('flowscan',null);
  fsRunAnalysis();
}

// ── analysis ──
function fsRunAnalysis(){
  var inp=document.getElementById('fs-ticker-input');
  var tk=(inp?inp.value:'BBCA').trim().toUpperCase().replace(/\.JK$/i,'');
  if(!tk) return;
  FS_G.tk=tk;
  var data=fsGenData(tk,FS_G.days);
  var a=fsProcess(data);
  FS_G.data=data; FS_G.a=a;
  var last=a.last,prev=a.prev;
  var chg=((last.c-prev.c)/prev.c*100);
  var info=FS_UNIV.find(function(u){return u.t===tk;})||fsFallbackInfo(tk);
  var rec=data.slice(-20);
  var bvBuy=rec.filter(function(d){return d.sig==='ACC';}).reduce(function(s,d){return s+d.buyVol;},0);
  var bvSell=rec.filter(function(d){return d.sig==='DIST';}).reduce(function(s,d){return s+d.sellVol;},0);
  var net=bvBuy-bvSell;

  // KNOWN_ISSUES.md #2: the single-ticker deep-dive view reads the exact
  // same fsGenData()/fsProcess() output as Ranking/Heatmap/Watchlist, so it
  // carries the exact same fabricated-data exposure — disclose it here too.
  var isSim=!!(data && data.simulated);

  var cards=document.getElementById('fs-cards');
  if(cards) cards.innerHTML=
    '<div class="metric"><div class="mlabel">Saham</div><div class="mval" style="font-size:20px">'+tk+fsSrcDot(isSim)+'</div><div class="msub neu">'+info.s+'</div></div>'+
    '<div class="metric"><div class="mlabel">Harga</div><div class="mval" style="font-size:18px">'+fsP(last.c)+'</div><div class="msub '+(chg>=0?'up':'dn')+'">'+fsPct(chg)+' hari ini</div></div>'+
    '<div class="metric"><div class="mlabel">Sinyal</div><div style="margin-top:6px">'+fsMkBdg(a.sig)+'</div><div class="msub neu">'+a.str+'</div></div>'+
    '<div class="metric"><div class="mlabel">Skor Big Money</div><div class="mval" style="color:'+fsScColor(a.sc)+'">'+a.sc+'/100</div><div class="msub"><div class="prog"><div class="progf" style="width:'+a.sc+'%;background:'+fsScColor(a.sc)+'"></div></div></div></div>'+
    '<div class="metric"><div class="mlabel">Net Vol Institusional</div><div class="mval '+(net>=0?'up':'dn')+'">'+(net>=0?'+':'')+fsV(Math.abs(net))+'</div><div class="msub neu">'+a.bu+' acc / '+a.bd+' dist hari</div></div>';

  var pLbl=document.getElementById('fs-price-lbl');
  var periodLabel = FS_G.days===7?'1 Minggu':FS_G.days===30?'1 Bulan':FS_G.days===90?'3 Bulan':'1 Tahun';
  if(pLbl) pLbl.innerHTML = 'Harga terakhir: <strong>'+fsP(last.c)+'</strong> &nbsp;·&nbsp; Periode: <strong style="color:var(--accent)">'+periodLabel+'</strong> ('+FS_G.days+' hari)'+
    (FS_G.days<=7?' &nbsp;<span style="color:var(--amber);font-size:10px">Indikator diadaptasi ke data pendek</span>':'')+
    (isSim?' &nbsp;<span style="color:#e21d48;font-size:10px" title="Belum ada data OHLCV riil ter-cache untuk saham ini — semua angka di halaman ini sementara berbasis simulasi.">⚠ SIMULASI — bukan data pasar riil</span>':'');

  // Notice bar untuk timeframe pendek
  var noticeEl = document.getElementById('fs-period-notice');
  if(noticeEl){
    if(FS_G.days<=7){
      noticeEl.style.display='flex';
      noticeEl.innerHTML='<span style="font-size:11px;color:var(--text2)">Periode <strong>1 Minggu (7 hari)</strong> — periode indikator diadaptasi otomatis (CMF-'+a.cmfP+', RSI-'+a.rsiP+', MA'+a.maFP+'/'+a.maSP+'). Sinyal kurang akurat dibanding periode lebih panjang.</span>';
    } else {
      noticeEl.style.display='none';
    }
  }

  var wlBar=document.getElementById('fs-wl-bar-txt');
  var wlBtn=document.getElementById('fs-wl-btn');
  var inWl=FS_WL.some(function(w){return w.t===tk;});
  if(wlBar) wlBar.textContent=inWl?tk+' sudah ada di watchlist Anda':'Tambah '+tk+' ke watchlist untuk memantau secara rutin';
  if(wlBtn){wlBtn.textContent=inWl?'Ada di Watchlist':'Tambah ke Watchlist';wlBtn.className='btn '+(inWl?'btn-ghost':'btn-blue')+' btn-sm';}

  fsRenderCharts();
  fsRenderInd();
  fsRenderDailyTable();
  // Render VWAP jika tab sedang terbuka
  var vwapTab = document.getElementById('fs-st-vwap');
  try{ fsRenderVWAP(); }catch(e){} // always render so VWAP data is ready

  // Kesimpulan probabilitas + tampilkan semua bila tab Analisa aktif
  fsRenderProb(a);
  var tblOpen=document.getElementById('fs-st-tbl'); tblOpen=tblOpen&&tblOpen.style.display!=='none';
  if(!tblOpen){
    ['ov','vol','ind','vwap'].forEach(function(t){var e=document.getElementById('fs-st-'+t);if(e)e.style.display='block';});
    var pb=document.getElementById('fs-prob'); if(pb)pb.style.display='block';
    fsRenderVWAP();
  }
  FS_G._prevTk = tk;
}

// ── charts ──
function fsRenderCharts(){
  var data=FS_G.data,a=FS_G.a;
  if(!data) return;
  var lb=data.map(function(d){return fsD(d.dt);});
  var cl=data.map(function(d){return d.c;});
  var vl=data.map(function(d){return d.v;});
  var cm=a.cmf.map(function(v){return+(v*100).toFixed(2);});
  var rs=a.rsi;
  var vc=data.map(function(d){return d.sig==='ACC'?'rgba(0,229,160,.7)':d.sig==='DIST'?'rgba(255,61,90,.7)':'rgba(50,65,82,.8)';});
  var nf=data.map(function(d){return+((d.buyVol-d.sellVol)/1e6).toFixed(2);});

  Object.values(FS_CHARTS).forEach(function(c){try{c.destroy();}catch(e){}});FS_CHARTS={};

  // Font sebelumnya #4a5e82 tipis (dilaporkan user 2026-09-13, sama seperti
  // rk-chart di fsRenderRanking() di atas) — ganti ke _chartTextColor()
  // theme-aware + bold, dipakai untuk 5 chart FlowScan detail di bawah.
  var GC2='rgba(255,255,255,.04)',TC2={color:(typeof _chartTextColor==='function'?_chartTextColor('--text2','#D2D8DF'):'#D2D8DF'),font:{size:10,weight:'bold',family:'"Fira Code","Public Sans",monospace'}};
  var bo={responsive:true,maintainAspectRatio:false,
    plugins:{legend:{display:false},tooltip:{backgroundColor:'rgba(6,11,23,.95)',borderColor:'rgba(255,255,255,.08)',borderWidth:1,titleColor:'#8fa3c8',bodyColor:'#dce8ff',bodyFont:{family:'Menlo',size:11}}},
    scales:{x:{ticks:Object.assign({maxTicksLimit:8,autoSkip:true},TC2),grid:{display:false},border:{display:false}},
            y:{ticks:TC2,grid:{color:GC2},border:{display:false}}}};
  function mo(extra){return Object.assign({},bo,extra);}

  var cvPr=document.getElementById('fsCPr');
  if(cvPr) FS_CHARTS.pr=new Chart(cvPr,{type:'line',data:{labels:lb,datasets:[
    {data:cl,borderColor:'#4da6ff',borderWidth:1.5,pointRadius:0,fill:true,tension:0.3,backgroundColor:function(ctx){var g=ctx.chart.ctx.createLinearGradient(0,0,0,200);g.addColorStop(0,'rgba(77,166,255,.14)');g.addColorStop(1,'rgba(77,166,255,0)');return g;}},
    {data:a.ma20,borderColor:'rgba(0,229,160,.55)',borderWidth:1,pointRadius:0,fill:false,borderDash:[4,2],tension:0.3,spanGaps:true},
    {data:a.ma50,borderColor:'rgba(255,61,90,.45)',borderWidth:1,pointRadius:0,fill:false,borderDash:[6,3],tension:0.3,spanGaps:true}
  ]},options:mo({})});

  var cvVo=document.getElementById('fsCVo');
  if(cvVo) FS_CHARTS.vo=new Chart(cvVo,{type:'bar',data:{labels:lb,datasets:[{data:vl,backgroundColor:vc,borderWidth:0,borderRadius:2}]},options:mo({})});

  var cvCm=document.getElementById('fsCCm');
  if(cvCm) FS_CHARTS.cm=new Chart(cvCm,{type:'bar',data:{labels:lb,datasets:[{data:cm,backgroundColor:cm.map(function(v){return v>0?'rgba(0,229,160,.65)':'rgba(255,61,90,.65)';}),borderWidth:0,borderRadius:1}]},options:mo({})});

  var cvNf=document.getElementById('fsCNf');
  if(cvNf) FS_CHARTS.nf=new Chart(cvNf,{type:'bar',data:{labels:lb,datasets:[{data:nf,backgroundColor:nf.map(function(v){return v>=0?'rgba(0,229,160,.6)':'rgba(255,61,90,.6)';}),borderWidth:0,borderRadius:2}]},options:mo({})});

  var cvRs=document.getElementById('fsCRs');
  if(cvRs) FS_CHARTS.rs=new Chart(cvRs,{type:'line',data:{labels:lb,datasets:[
    {data:rs,borderColor:'#8070d2',borderWidth:1.5,pointRadius:0,fill:false,tension:0.3},
    {data:Array(rs.length).fill(70),borderColor:'rgba(255,61,90,.3)',borderWidth:1,pointRadius:0,fill:false,borderDash:[3,3]},
    {data:Array(rs.length).fill(30),borderColor:'rgba(0,229,160,.3)',borderWidth:1,pointRadius:0,fill:false,borderDash:[3,3]}
  ]},options:mo({scales:Object.assign({},bo.scales,{y:Object.assign({},bo.scales.y,{min:0,max:100})})})}); 
}

function fsRenderInd(){
  var data=FS_G.data,a=FS_G.a;
  if(!data) return;
  var last=a.last;
  var n=data.length;
  var lookback=Math.min(n,20);
  // Label adaptif berdasarkan periode yang dipakai
  var cmfLabel = 'CMF-'+(a.cmfP||20);
  var rsiLabel = 'RSI-'+(a.rsiP||14);
  var volLabel = 'Vol Ratio vs MA'+(a.maFP||20);
  var bvLabel  = 'Big Vol Days ('+lookback+'h)';
  var items=[
    {n:'On-Balance Volume',v:(last.obv>=0?'+':'')+fsV(last.obv),d:a.obvT?'OBV naik → Big money masuk':'OBV turun → Tekanan jual dominan',p:a.obvT?72:28,c:a.obvT?'#41f3a7':'#e21d48'},
    {n:cmfLabel,v:(a.cl*100).toFixed(2)+'%',d:a.cl>0.1?'Tekanan beli kuat':a.cl>0?'Tekanan beli lemah':a.cl>-0.1?'Tekanan jual lemah':'Tekanan jual kuat',p:Math.min(100,Math.max(0,(a.cl+0.3)*167)),c:a.cl>0?'#41f3a7':'#e21d48'},
    {n:volLabel,v:last.vr.toFixed(2)+'×',d:last.vr>2?'Anomali institusional >2×':last.vr>1.5?'Volume di atas normal':last.vr>0.8?'Volume normal':'Volume sepi',p:Math.min(100,last.vr*40),c:last.vr>1.5?'#41f3a7':'#8fa3c8'},
    {n:'A/D Line',v:a.adT?'Naik':'Turun',d:a.adT?'A/D naik — akumulasi berlanjut':'A/D turun — distribusi berlanjut',p:a.adT?72:28,c:a.adT?'#41f3a7':'#e21d48'},
    {n:rsiLabel,v:a.rl.toFixed(1),d:a.rl>70?'Overbought':a.rl<30?'Oversold':a.rl>50?'Momentum positif':'Momentum negatif',p:a.rl,c:a.rl>70?'#e21d48':a.rl<30?'#41f3a7':'#8fa3c8'},
    {n:bvLabel,v:a.bu+' naik / '+a.bd+' turun',d:a.bu>a.bd?'Big vol dominan hari naik → Akumulasi':a.bu<a.bd?'Big vol dominan hari turun → Distribusi':'Imbang',p:a.bu+a.bd>0?Math.min(100,a.bu/(a.bu+a.bd)*100):50,c:a.bu>a.bd?'#41f3a7':a.bu<a.bd?'#e21d48':'#8fa3c8'}
  ];
  var grid=document.getElementById('fs-ind-grid');
  if(grid) grid.innerHTML=items.map(function(x){
    return '<div style="background:var(--bg3);border:1px solid var(--border);border-radius:8px;padding:12px">'+
      '<div style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:.7px;margin-bottom:4px">'+x.n+'</div>'+
      '<div style="font-family:var(--font-mono);font-size:16px;font-weight:500;margin-bottom:3px;color:'+x.c+'">'+x.v+'</div>'+
      '<div style="font-size:11px;color:var(--text2);line-height:1.45">'+x.d+'</div>'+
      '<div style="height:3px;background:var(--bg5);border-radius:2px;margin-top:8px;overflow:hidden">'+
        '<div style="width:'+x.p+'%;height:100%;border-radius:2px;background:'+x.c+'"></div></div></div>';
  }).join('');
}

function fsRenderDailyTable(){
  var data=FS_G.data;
  if(!data) return;
  var tbody=document.getElementById('fs-daily-body');
  if(!tbody) return;
  tbody.innerHTML='';
  data.slice(-60).reverse().forEach(function(d){
    var chg=d.o>0?((d.c-d.o)/d.o*100):0;
    var vc=d.vr>=2?'#41f3a7':d.vr>=1.5?'rgba(0,229,160,.7)':d.vr<0.7?'#e21d48':'#8fa3c8';
    var sig=d.sig==='ACC'?'<span class="badge b-up">Akumulasi</span>':d.sig==='DIST'?'<span class="badge b-dn">Distribusi</span>':'';
    var cc=d.cmf>0.1?'#41f3a7':d.cmf<-0.1?'#e21d48':'#8fa3c8';
    var tr=document.createElement('tr');
    if(d.sig==='ACC')tr.style.background='rgba(0,229,160,.04)';
    if(d.sig==='DIST')tr.style.background='rgba(255,61,90,.04)';
    tr.innerHTML='<td class="mono">'+fsD(d.dt)+'</td><td class="mono">'+fsP(d.o)+'</td>'+
      '<td class="mono up">'+fsP(d.h)+'</td><td class="mono dn">'+fsP(d.l)+'</td>'+
      '<td class="mono" style="font-weight:600">'+fsP(d.c)+'</td>'+
      '<td class="mono '+(chg>=0?'up':'dn')+'">'+fsPct(chg)+'</td>'+
      '<td class="mono">'+fsV(d.v)+'</td>'+
      '<td class="mono" style="color:'+vc+';font-weight:'+(d.vr>=1.5?600:400)+'">'+d.vr.toFixed(2)+'×</td>'+
      '<td class="mono up">'+(d.buyVol>0?fsV(d.buyVol):'—')+'</td>'+
      '<td class="mono dn">'+(d.sellVol>0?fsV(d.sellVol):'—')+'</td>'+
      '<td class="mono" style="color:'+cc+'">'+(d.cmf*100).toFixed(1)+'%</td>'+
      '<td>'+sig+'</td>';
    tbody.appendChild(tr);
  });
}

// ── VWAP ENGINE ──────────────────────────────────────────────
function fsCalcVWAP(data){
  var cumTPV=0,cumVol=0;
  return data.map(function(d){
    var tp=(d.h+d.l+d.c)/3;
    cumTPV+=tp*d.v; cumVol+=d.v;
    return cumVol>0?cumTPV/cumVol:d.c;
  });
}
function fsCalcVWAPPeriod(data,period){
  return data.map(function(_,i){
    var slice=data.slice(Math.max(0,i-period+1),i+1);
    var sTPV=0,sVol=0;
    slice.forEach(function(d){var tp=(d.h+d.l+d.c)/3;sTPV+=tp*d.v;sVol+=d.v;});
    return sVol>0?sTPV/sVol:data[i].c;
  });
}
function fsCalcVWAPStdDev(data,vwap){
  var cumSq=0,cumVol=0;
  return data.map(function(d,i){
    var tp=(d.h+d.l+d.c)/3;
    var dev=tp-vwap[i];
    cumSq+=dev*dev*d.v; cumVol+=d.v;
    return cumVol>0?Math.sqrt(cumSq/cumVol):0;
  });
}
function fsRenderVWAP(){
  var data=FS_G.data,a=FS_G.a;
  if(!data||data.length<5) return;
  var sigma=parseFloat(document.getElementById('vwap-band-sel')&&document.getElementById('vwap-band-sel').value||2);
  var vwap=fsCalcVWAP(data);
  var std=fsCalcVWAPStdDev(data,vwap);
  var upper=vwap.map(function(v,i){return v+sigma*std[i];});
  var lower=vwap.map(function(v,i){return v-sigma*std[i];});
  var labels=data.map(function(d){return fsD(d.dt);});
  var closes=data.map(function(d){return d.c;});
  var last=data[data.length-1];
  var vL=vwap[vwap.length-1],uL=upper[upper.length-1],lL=lower[lower.length-1];
  // Chart 1: VWAP + bands
  if(FS_CHARTS.vwap){try{FS_CHARTS.vwap.destroy();}catch(e){}}
  var cv1=document.getElementById('fsVwapChart');
  // Font sebelumnya #4a5e82 tipis (dilaporkan user 2026-09-13) — ganti ke
  // _chartTextColor() theme-aware + bold, sama seperti chart FlowScan lain.
  var vwapTickColor=(typeof _chartTextColor==='function'?_chartTextColor('--text2','#D2D8DF'):'#D2D8DF');
  var vwapTickFont={size:9,weight:'bold',family:'"Fira Code","Public Sans",monospace'};
  var boV={responsive:true,maintainAspectRatio:false,
    plugins:{legend:{display:true,position:'top',labels:{color:vwapTickColor,font:{size:9,weight:'bold'},boxWidth:16}},
      tooltip:{backgroundColor:'rgba(6,11,23,.95)',borderColor:'rgba(255,255,255,.08)',borderWidth:1,
        titleColor:'#8fa3c8',bodyColor:'#dce8ff',bodyFont:{family:'Menlo',size:10},
        callbacks:{label:function(c){return c.dataset.label+': '+fsP(c.parsed.y);}}}},
    scales:{x:{ticks:{maxTicksLimit:8,autoSkip:true,color:vwapTickColor,font:vwapTickFont},grid:{display:false},border:{display:false}},
            y:{ticks:{color:vwapTickColor,font:vwapTickFont},grid:{color:GC},border:{display:false}}}};
  if(cv1) FS_CHARTS.vwap=new Chart(cv1,{type:'line',data:{labels:labels,datasets:[
    {label:'Harga',data:closes,borderColor:'rgba(77,166,255,.9)',borderWidth:1.5,pointRadius:0,fill:false,tension:.3},
    {label:'VWAP',data:vwap,borderColor:'#ffc107',borderWidth:2.5,pointRadius:0,fill:false,tension:.3},
    {label:'Upper +'+sigma+'σ',data:upper,borderColor:'rgba(255,61,90,.55)',borderWidth:1,pointRadius:0,fill:false,tension:.3,borderDash:[4,2]},
    {label:'Lower −'+sigma+'σ',data:lower,borderColor:'rgba(0,229,160,.55)',borderWidth:1,pointRadius:0,fill:false,tension:.3,borderDash:[4,2]},
  ]},options:boV});
  // Chart 2: Multi-period
  var vwap5=fsCalcVWAPPeriod(data,5),vwap20=fsCalcVWAPPeriod(data,20);
  if(FS_CHARTS.vwapM){try{FS_CHARTS.vwapM.destroy();}catch(e){}}
  var cv2=document.getElementById('fsVwapMulti');
  if(cv2) FS_CHARTS.vwapM=new Chart(cv2,{type:'line',data:{labels:labels,datasets:[
    {label:'Harga',data:closes,borderColor:'rgba(77,166,255,.7)',borderWidth:1.5,pointRadius:0,fill:false,tension:.3},
    {label:'VWAP-1D',data:vwap,borderColor:'#ffc107',borderWidth:2,pointRadius:0,fill:false,tension:.3},
    {label:'VWAP-5H',data:vwap5,borderColor:'#8070d2',borderWidth:1.5,pointRadius:0,fill:false,tension:.3,borderDash:[4,2]},
    {label:'VWAP-20H',data:vwap20,borderColor:'#ff6b6b',borderWidth:1.5,pointRadius:0,fill:false,tension:.3,borderDash:[6,3]},
  ]},options:boV});
  // Level cards
  var aboveV=last.c>vL;
  var pctV=((last.c-vL)/vL*100).toFixed(2);
  var lvls=[
    {label:'VWAP Harian',val:vL,color:'#ffc107',desc:'Harga rata-rata berbobot volume'},
    {label:'Upper Band +'+sigma+'σ',val:uL,color:'#e21d48',desc:'Resistance / overbought zona'},
    {label:'Lower Band −'+sigma+'σ',val:lL,color:'#41f3a7',desc:'Support / oversold zona'},
    {label:'Harga Terakhir',val:last.c,color:aboveV?'#41f3a7':'#e21d48',desc:(aboveV?'Di atas':'Di bawah')+' VWAP ('+pctV+'%)'},
  ];
  var lvlEl=document.getElementById('vwap-levels');
  if(lvlEl) lvlEl.innerHTML=lvls.map(function(l){
    return '<div style="display:flex;justify-content:space-between;align-items:center;padding:7px 10px;background:var(--bg3);border-radius:7px;border-left:3px solid '+l.color+'">'+
      '<div><div style="font-size:10px;color:var(--text3)">'+l.label+'</div><div style="font-size:10px;color:var(--text2);margin-top:1px">'+l.desc+'</div></div>'+
      '<div style="font-family:var(--font-mono);font-size:13px;font-weight:700;color:'+l.color+'">'+fsP(l.val)+'</div></div>';
  }).join('');
  // Signal text
  var sig='';
  if(last.c>uL) sig='<span style="color:#e21d48">Di atas Upper Band (+'+sigma+'σ)</span><br>Kondisi <strong>overbought</strong>. Potensi pullback ke VWAP ('+fsP(vL)+').';
  else if(last.c<lL) sig='<span style="color:#41f3a7">Di bawah Lower Band (−'+sigma+'σ)</span><br>Kondisi <strong>oversold</strong>. Zona akumulasi, potensi bounce ke VWAP.';
  else if(last.c>vL) sig='<span style="color:#41f3a7">Di atas VWAP</span><br>Tren <strong>bullish</strong>. VWAP '+fsP(vL)+' sebagai support dinamis.';
  else sig='<span style="color:#e21d48">Di bawah VWAP</span><br>Tren <strong>bearish</strong>. VWAP '+fsP(vL)+' sebagai resistance.';
  var v5L=vwap5[vwap5.length-1],v20L=vwap20[vwap20.length-1];
  if(last.c>vL&&last.c>v5L&&last.c>v20L) sig+='<br><br><strong>Triple VWAP Confluence Bullish</strong> — buyer dominan di semua timeframe.';
  if(last.c<vL&&last.c<v5L&&last.c<v20L) sig+='<br><br><strong>Triple VWAP Confluence Bearish</strong> — seller dominan di semua timeframe.';
  var sE=document.getElementById('vwap-signal'); if(sE) sE.innerHTML=sig;
}

// ── ranking ──
function fsRenderRanking(){
  if(!FS_RD.length) return;
  var sort=document.getElementById('rk-sort')&&document.getElementById('rk-sort').value||'score';
  var sigF=document.getElementById('rk-sig')&&document.getElementById('rk-sig').value||'all';
  var list=[].concat(FS_RD);
  if(sigF!=='all') list=list.filter(function(r){return r.a.sig===sigF;});
  list.sort(function(a,b){if(sort==='score')return b.a.sc-a.a.sc;if(sort==='cap')return b.cap-a.cap;if(sort==='cmf')return b.a.cl-a.a.cl;if(sort==='chg')return b.a.chgPct-a.a.chgPct;if(sort==='volratio')return (b.a.volRatio30||0)-(a.a.volRatio30||0);return 0;});

  var acc=FS_RD.filter(function(r){return r.a.sig==='AKUMULASI';}).length;
  var dist=FS_RD.filter(function(r){return r.a.sig==='DISTRIBUSI';}).length;
  var neut=FS_RD.filter(function(r){return r.a.sig==='NETRAL';}).length;
  var avg=Math.round(FS_RD.reduce(function(s,r){return s+r.a.sc;},0)/FS_RD.length);
  var rkSum=document.getElementById('rk-sum');
  if(rkSum) rkSum.innerHTML=[
    {v:acc,l:'Akumulasi',c:'rgba(0,229,160,.1)',bc:'rgba(0,229,160,.2)',tc:'#41f3a7'},
    {v:dist,l:'Distribusi',c:'rgba(255,61,90,.1)',bc:'rgba(255,61,90,.2)',tc:'#e21d48'},
    {v:neut,l:'Netral',c:'var(--bg3)',bc:'var(--border)',tc:'var(--text2)'},
    {v:avg,l:'Avg Skor',c:'rgba(0,200,255,.08)',bc:'rgba(0,200,255,.2)',tc:'var(--accent)'},
  ].map(function(x){return '<div style="background:'+x.c+';border:.5px solid '+x.bc+';border-radius:8px;padding:10px 12px;text-align:center"><div class="mono" style="font-size:20px;font-weight:600;color:'+x.tc+'">'+x.v+'</div><div style="font-size:10px;color:var(--text3);margin-top:2px;text-transform:uppercase;letter-spacing:.8px">'+x.l+'</div></div>';}).join('');

  var rkChart=document.getElementById('rk-chart');
  if(rkChart){
    if(FS_CHARTS.rk){try{FS_CHARTS.rk.destroy();}catch(e){}}
    var top=list.slice(0,15);
    // Font sebelumnya #4a5e82 (kontras terlalu rendah di tema gelap,
    // dilaporkan user 2026-09-13) — diganti ke _chartTextColor('--text2')
    // yang beradaptasi ke tema aktif + font-weight bold untuk keterbacaan.
    var rkTickColor = typeof _chartTextColor === 'function' ? _chartTextColor('--text2','#D2D8DF') : '#D2D8DF';
    var rkTickFont = {family:'"Fira Code","Public Sans",monospace',size:10,weight:'bold'};
    FS_CHARTS.rk=new Chart(rkChart,{type:'bar',
      data:{labels:top.map(function(r){return r.t;}),
            datasets:[{data:top.map(function(r){return r.a.sc;}),
              backgroundColor:top.map(function(r){return r.a.sig==='AKUMULASI'?'rgba(0,229,160,.75)':r.a.sig==='DISTRIBUSI'?'rgba(255,61,90,.75)':'rgba(60,75,95,.8)';}),borderWidth:0,borderRadius:3}]},
      options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},
        scales:{x:{ticks:{color:rkTickColor,font:rkTickFont},grid:{display:false},border:{display:false}},
                y:{min:0,max:100,ticks:{color:rkTickColor,font:rkTickFont},grid:{color:GC},border:{display:false}}}}});
  }

  var rkBody=document.getElementById('rk-body');
  if(rkBody) rkBody.innerHTML=list.map(function(r,i){
    var last=r.data[r.data.length-1];
    var inWl=FS_WL.some(function(w){return w.t===r.t;});
    // FIX (KNOWN_ISSUES.md #2): tandai per-baris apakah harga ini RIIL atau
    // SIMULASI — sebelumnya tidak ada indikator sama sekali sehingga harga
    // fiktif tampil identik dengan harga riil (sumber "kesalahan penafsiran
    // saham"). Was rdIsReal(r.t) (checks the raw cache only — imprecise:
    // could be true while fsGenData() still used the synthetic branch, e.g.
    // <5 cached rows); now reads r.data.simulated, the exact flag fsGenData()
    // itself set on this row's data.
    var isSim = !!(r.data && r.data.simulated);
    var srcDot = fsSrcDot(isSim);
    return '<tr style="'+(r.a.sig==='AKUMULASI'?'background:rgba(0,229,160,.03)':r.a.sig==='DISTRIBUSI'?'background:rgba(255,61,90,.03)':'')+(isSim?';outline:1px solid rgba(255,61,90,.15)':'')+'">'
      +'<td class="mono" style="color:var(--text3)">'+(i+1)+'</td>'
      +'<td class="mono" style="font-weight:600;cursor:pointer;color:var(--accent)" onclick="fsQuickLoad(\''+r.t+'\')">'+r.t+'</td>'
      +'<td><div style="font-size:12px">'+r.n+'</div><span class="badge b-neu" style="font-size:9px">'+r.s+'</span></td>'
      +'<td class="mono">'+fsP(last.c)+srcDot+'</td>'
      +'<td class="mono '+(r.a.chgPct>=0?'up':'dn')+'">'+fsPct(r.a.chgPct)+'</td>'
      +'<td class="mono" style="color:var(--text2)">'+r.cap+'T</td>'
      +'<td><div style="display:flex;align-items:center;gap:5px"><span class="mono" style="color:'+fsScColor(r.a.sc)+';min-width:22px;font-weight:600">'+r.a.sc+'</span><div class="prog" style="width:50px"><div class="progf" style="width:'+r.a.sc+'%;background:'+fsScColor(r.a.sc)+'"></div></div></div></td>'
      +'<td>'+fsMkBdg(r.a.sig,true)+(r.a.isVolSpike?' <span class="badge" style="font-size:8px;background:rgba(245,158,11,.18);color:var(--amber)" title="Volume hari ini juga melonjak (≥'+((typeof VS_SPIKE_THRESHOLD==="number"?VS_SPIKE_THRESHOLD:1.7).toFixed(2))+'x median) — memperkuat sinyal '+r.a.sig.toLowerCase()+' di atas">⚡</span>':'')+'</td>'
      +'<td class="mono" style="color:'+(r.a.cl>0?'#41f3a7':'#e21d48')+'">'+(r.a.cl*100).toFixed(1)+'%</td>'
      +'<td class="mono" style="color:'+(r.a.rl>70?'#e21d48':r.a.rl<30?'#41f3a7':'var(--text2)')+'">'+r.a.rl.toFixed(1)+'</td>'
      // FIX (2026-09-15, gabung Volume Spike ke Market Radar): kolom baru,
      // hitungan & ambang PERSIS sama dengan halaman Volume Spike (lihat
      // fsCalcVolRatio di atas) — klik nilainya loncat ke Volume Spike untuk
      // drill-down (chart 7 hari, arus dana asing) tanpa duplikasi tampilan.
      +'<td class="mono" style="cursor:pointer;font-weight:'+(r.a.isVolSpike?'700':'400')+';color:'+(r.a.isVolSpike?'var(--amber)':'var(--text2)')+'" onclick="fsGoVolumeSpike(\''+r.t+'\')" title="Buka di Volume Spike">'+(r.a.volRatio30||0).toFixed(2)+'x</td>'
      +'<td><button class="btn btn-ghost btn-xs '+(inWl?'b-up':'')+'" onclick="fsTgWl(\''+r.t+'\');fsRenderRanking()" style="font-size:10px">'+(inWl?'★':'☆')+'</button></td>'
      +'<td><button class="btn btn-ghost btn-xs" onclick="fsQuickLoad(\''+r.t+'\')" style="font-size:10px">Lihat</button></td>'
      +'</tr>';
  }).join('');
}

// ── Heatmap tab switcher ──
function hmSwitchTab(tab, btn){
  var panels=['flow','factor'];
  panels.forEach(function(p){
    var panel=el('hm-panel-'+p);
    if(panel) panel.style.display=(p===tab)?'':'none';
    var tb=el('hm-tab-'+p);
    if(tb){ tb.classList.toggle('on',p===tab); }
  });
  if(tab==='factor') fhmRender();
  if(tab==='flow') fsRenderHeatmap();
}

// ── heatmap ──
function fsRenderHeatmap(){
  if(!FS_RD.length) return;
  var m=document.getElementById('hm-mode')&&document.getElementById('hm-mode').value||'score';
  var grid=document.getElementById('hm-grid');
  if(!grid) return;
  grid.innerHTML=[].concat(FS_RD).sort(function(a,b){return b.cap-a.cap;}).map(function(r){
    var last=r.data[r.data.length-1];
    var val,disp;
    if(m==='score'){val=r.a.sc;disp=''+val;}
    else if(m==='cmf'){val=r.a.cl;disp=(val*100).toFixed(1)+'%';}
    else{val=r.a.chgPct;disp=fsPct(val);}
    var cls=r.a.sig==='AKUMULASI'?'fs-hm-acc':r.a.sig==='DISTRIBUSI'?'fs-hm-dist':'fs-hm-neut';
    var vc=r.a.sig==='AKUMULASI'?'#41f3a7':r.a.sig==='DISTRIBUSI'?'#e21d48':'#8fa3c8';
    var inWl=FS_WL.some(function(w){return w.t===r.t;});
    // KNOWN_ISSUES.md #2: this cell's score/signal can be entirely computed
    // from fsGenData()'s synthetic random-walk fallback with zero prior
    // disclosure — surface it via the shared SIM marker + outline.
    var isSim=!!(r.data && r.data.simulated);
    return '<div class="fs-hm-cell '+cls+'" onclick="fsQuickLoad(\''+r.t+'\')" title="'+(inWl?'★ ':'')+r.n+' — '+r.a.sig+(isSim?' — SIMULASI, data acak (belum ada OHLCV riil ter-cache)':'')+'" style="'+(isSim?'outline:1px solid rgba(255,61,90,.25)':'')+'">'
      +'<div class="mono" style="font-size:13px;font-weight:600;color:var(--text)">'+(inWl?'★ ':'')+r.t+fsSrcDot(isSim)+'</div>'
      +'<div class="mono" style="font-size:17px;font-weight:700;margin-top:3px;color:'+vc+'">'+disp+'</div>'
      +'<div class="mono" style="font-size:12px;margin-top:3px;color:'+(r.a.chgPct>=0?'#41f3a7':'#e21d48')+'">'+fsPct(r.a.chgPct)+'</div>'
      +'</div>';
  }).join('');
}

// ── scanner ──
function fsRunScanner(){
  var mc=parseFloat(document.getElementById('sc-cmf')&&document.getElementById('sc-cmf').value||-1);
  var ms=parseFloat(document.getElementById('sc-sc')&&document.getElementById('sc-sc').value||0);
  var mv=parseFloat(document.getElementById('sc-vr')&&document.getElementById('sc-vr').value||0);
  var res=FS_RD.filter(function(r){var last=r.data[r.data.length-1];return r.a.cl>=mc&&r.a.sc>=ms&&last.vr>=mv;}).sort(function(a,b){return b.a.sc-a.a.sc;});
  var out=document.getElementById('sc-results');
  if(!out) return;
  if(res.length===0){out.innerHTML='<div style="color:var(--text3);text-align:center;padding:20px;font-size:13px">Tidak ada saham memenuhi kriteria. Turunkan threshold.</div>';return;}
  out.innerHTML='<div style="font-size:12px;color:var(--text3);margin-bottom:12px;font-family:var(--font-mono);font-weight:700">Ditemukan <strong style="color:var(--accent)">'+res.length+'</strong> emiten terverifikasi:</div>'
    +'<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:10px">'
    +res.map(function(r){
      var last=r.data[r.data.length-1];
      var isAcc=r.a.sig==='AKUMULASI';
      var bgCard=isAcc?'rgba(16,185,129,0.06)':'rgba(239,68,68,0.06)';
      var brdCard=isAcc?'rgba(16,185,129,0.25)':'rgba(239,68,68,0.25)';
      var inWl=FS_WL.some(function(w){return w.t===r.t;});
      return '<div class="card" style="background:'+bgCard+';border:1px solid '+brdCard+';border-radius:10px;padding:12px;display:flex;flex-direction:column;justify-content:space-between">'
        +'<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">'
        +'<span class="mono" style="font-weight:800;font-size:14px;cursor:pointer;color:var(--accent)" onclick="fsQuickLoad(\''+r.t+'\')">'+r.t+'</span>'
        +'<button class="btn btn-ghost btn-xs" onclick="fsTgWl(\''+r.t+'\');fsRunScanner()" style="font-size:11px;padding:2px 6px;border-radius:6px;border:1px solid var(--border2)">'+(inWl?'★':'☆')+'</button>'
        +'</div>'
        +'<div style="font-size:11px;color:var(--text3);margin-bottom:8px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+r.n.split(' ').slice(0,3).join(' ')+'</div>'
        +'<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;background:var(--bg3);padding:5px 8px;border-radius:6px;border:1px solid var(--border2)">'
        +'<span class="mono" style="font-size:10px;font-weight:700;color:'+(r.a.cl>0?'var(--green)':'var(--red)')+'">CMF '+(r.a.cl*100).toFixed(1)+'%</span>'
        +'<span class="mono" style="font-size:10px;font-weight:700;color:'+(last.vr>1.5?'var(--green)':'var(--text2)')+'">VR '+last.vr.toFixed(1)+'×</span>'
        +'</div>'
        +'<div style="display:flex;align-items:center;justify-content:space-between">'+fsMkBdg(r.a.sig,true)+'<span class="mono" style="font-size:10px;font-weight:700;color:var(--text3)">Skor '+r.a.sc+'</span></div>'
        +'</div>';
    }).join('')+'</div>';
}

// ══════════════════════════════════════════════════════════
// SMART MONEY SCREENER — mode switch (2026-09-17, konsolidasi screener)
// ══════════════════════════════════════════════════════════
// Sebelumnya ada 3 fitur terpisah yang overlap konsep (deteksi akumulasi/
// distribusi "smart money"), dua di antaranya bahkan memakai fungsi hitung
// CMF yang identik persis (fsGenData/fsCalcCMF di file ini):
//   1. Flow Scanner (halaman ini) — proxy CMF/volume-ratio, universe
//      watchlist+portofolio (~30 saham).
//   2. "Scanner Akumulasi & Distribusi" — sub-tab Opportunity Radar
//      (26-commandcenter.js), broker-flow riil Invezgo kalau API key ada,
//      hardcoded ke universe LQ45 (45 saham) walau namanya "Universe-Wide".
//   3. "Heatmap & Live Scanner" — Bandarmology Cockpit (41-stockchat-
//      cockpit.js), heatmap sektor + tabel 8 ticker hardcoded, pakai CMF
//      yang sama dengan Flow Scanner tapi verdict flow-nya simulasi.
// Risiko nyata (bukan cuma redundansi): 3 implementasi terpisah bisa
// memberi verdict akumulasi/distribusi BERBEDA untuk ticker yang SAMA di
// waktu yang SAMA. Digabung jadi 3 MODE di satu halaman ini — data source
// & fungsi hitungnya TIDAK diduplikasi ulang, cuma dipanggil dari sini.
var FS_SMS_LOADED = { broker: false, sector: false };

function fsSwitchScreenerMode(mode) {
  ['cmf', 'broker', 'sector'].forEach(function(m) {
    var panel = document.getElementById('sms-mode-' + m);
    var btn = document.getElementById('sms-mode-btn-' + m);
    if (panel) panel.style.display = (m === mode) ? '' : 'none';
    if (btn) btn.className = 'btn btn-xs ' + (m === mode ? 'btn-primary' : 'btn-ghost');
  });
  if (mode === 'broker' && !FS_SMS_LOADED.broker) {
    FS_SMS_LOADED.broker = true;
    fsRenderBrokerFlowMode();
  } else if (mode === 'sector' && !FS_SMS_LOADED.sector) {
    FS_SMS_LOADED.sector = true;
    fsRenderSectorHeatmapMode();
  }
}

// Mode "Broker Flow Riil (Seluruh BEI)" — dipindahkan & DIPERLUAS dari
// renderRadarScannerSubTab() (26-commandcenter.js, sebelumnya sub-tab
// "Scanner Akumulasi & Distribusi", dulu HANYA scan 45 saham LQ45).
//
// FIX AUDIT (2026-09-17, user-requested): nama "Universe-Wide"/"seluruh
// BEI" sebelumnya menyesatkan — implementasinya cuma scan 45 saham LQ45,
// hardcoded, tidak bisa diperluas. Sekarang benar-benar bisa scan SELURUH
// ~900+ saham BEI, tapi bertahap per-batch (klik "Lanjutkan Scan") karena
// tiap saham = 1 kuota Invezgo (default 30.000/bulan) dan satu request
// serverless punya batas waktu — scan 900 saham sekaligus dalam 1 request
// akan timeout dan/atau memboroskan kuota bulanan hanya dari satu kali
// scan. Pola sama dengan aiSetScanUniverse() di 38-ai-autonomous-trading.js
// (batch bertahap untuk universe besar), TAPI di sini progresnya TIDAK
// auto-lanjut sendiri — pengguna yang mengontrol kapan lanjut, supaya
// pemakaian kuota Invezgo tetap sadar/disengaja, bukan otomatis boros.
// State-nya SENGAJA terpisah dari cache akumulasi/distribusi milik
// RADAR_STATE (dipakai sub-tab "Anomaly Structural & ARA" di Command
// Center, dan tetap LQ45-only di sana) — supaya scan seluruh-BEI di sini
// tidak ikut mencampur hasilnya ke sub-tab lain yang didesain seputar LQ45.
// FIX (2026-09-17, user-requested quota optimization: "optimalkan
// langganan API saya... karena broker ini sifatnya reload per hari saja"):
// dulu FS_BROKER_SCAN mengelola scan BERTAHAP (universe/batchSize/
// nextIndex/scannedCount, tombol "Lanjutkan Scan" berkali-kali) karena
// endpoint lama butuh 1 panggilan Invezgo PER TICKER (~960 kuota untuk 1x
// scan penuh BEI). Endpoint baru (GET /analysis/top/accumulation di
// Invezgo, lihat getUniverseAccumulationDistribution() di
// lib/idx-data-engine.js) mengembalikan SELURUH pasar dalam SATU panggilan
// (1 kuota total) — tidak ada lagi yang perlu di-batch, jadi seluruh
// state/logika bertahap di atas dihapus. Data ini juga EOD harian (bukan
// rentang timeframe yang bisa dipilih), jadi tombol pemilih timeframe
// (1D/3D/5D/20D) yang lama juga dihapus — jujur soal keterbatasan data
// selalu "hari ini", bukan berpura-pura ada rentang yang bisa dipilih.
var FS_BROKER_SCAN = {
  accumulation: [],
  distribution: [],
  date: null,
  loaded: false,
  notConfigured: false, // Invezgo API key belum ada sama sekali
  loading: false,
  quota: null // { used, monthlyBudget, remaining, usagePct, alert80, alert90 } dari /api/idx/invezgo-status
};

function fsResetBrokerScan() {
  FS_BROKER_SCAN.accumulation = [];
  FS_BROKER_SCAN.distribution = [];
  FS_BROKER_SCAN.date = null;
  FS_BROKER_SCAN.loaded = false;
  FS_BROKER_SCAN.notConfigured = false;
}

// FIX AUDIT (2026-09-17, quota budget planning, user-requested: "atur
// dulu kuotanya agar cukup dipakai 1 bulan"): 1 saham = 1 kuota Invezgo
// (30.000/bulan default), dan endpoint /api/idx/invezgo-status (sudah ada
// sebelumnya untuk observability backend) belum pernah ditampilkan ke
// user — orang bisa klik "Lanjutkan Scan" berkali-kali tanpa tahu berapa
// kuota bulanan yang sudah/akan terpakai sampai tiba-tiba kuota habis
// (endpoint sudah menangani QUOTA_EXHAUSTED dengan aman, tapi tanpa
// visibility user tidak bisa MENGATUR pemakaiannya sendiri). Diambil ulang
// setiap kali masuk mode ini & setelah tiap batch (karena berubah).
async function fsFetchInvezgoQuotaStatus() {
  try {
    var res = await fetch('/api/idx/invezgo-status');
    var json = await res.json();
    if (json && json.success) FS_BROKER_SCAN.quota = json.quota;
  } catch (e) {
    console.warn('[Smart Money Screener] Gagal memuat status kuota Invezgo:', e && e.message);
  }
}

function fsRenderQuotaBar() {
  var q = FS_BROKER_SCAN.quota;
  if (!q) return '';
  var color = q.alert90 ? '#EF4444' : q.alert80 ? '#F59E0B' : 'var(--green)';
  var label = q.remaining <= 0
    ? 'Kuota Invezgo bulan ini HABIS (' + q.used.toLocaleString('id-ID') + '/' + q.monthlyBudget.toLocaleString('id-ID') + ') — reset otomatis awal bulan berikutnya'
    : 'Kuota Invezgo bulan ini: ' + q.used.toLocaleString('id-ID') + ' / ' + q.monthlyBudget.toLocaleString('id-ID') + ' terpakai (' + q.usagePct + '%) — sisa ' + q.remaining.toLocaleString('id-ID');
  return '<div class="card" style="padding:8px 14px;margin-bottom:12px;display:flex;align-items:center;gap:10px;border-left:3px solid ' + color + '">'
    + '<div style="flex:1;height:6px;background:var(--bg3);border-radius:3px;overflow:hidden">'
      + '<div style="width:' + Math.min(100, q.usagePct) + '%;height:100%;background:' + color + '"></div>'
    + '</div>'
    + '<span style="font-size:11px;color:' + color + ';font-weight:700;white-space:nowrap">' + label + '</span>'
    + '</div>';
}

// FIX (2026-09-17, quota optimization): mode "Broker Flow Riil" dulu
// memuat daftar ~958 ticker lalu scan bertahap (lihat komentar di
// FS_BROKER_SCAN di atas). Sekarang cukup SATU fetch ke
// /api/idx/accumulation-distribution — endpoint ini sendiri sudah
// memanggil Invezgo market-wide (1 kuota, bukan per-ticker), jadi tidak
// ada lagi yang perlu di-batch di sisi client sama sekali.
async function fsRenderBrokerFlowMode() {
  var c = document.getElementById('sms-broker-content');
  if (!c) return;

  if (FS_BROKER_SCAN.loaded && !FS_BROKER_SCAN.notConfigured) {
    fsRenderBrokerScanUI(c);
    return;
  }

  if (!FS_BROKER_SCAN.notConfigured) await fsFetchInvezgoQuotaStatus();

  if (FS_BROKER_SCAN.notConfigured) {
    c.innerHTML = '<div class="card" style="padding:30px;text-align:center;color:var(--text3);font-size:12.5px;line-height:1.6">'
      + 'Pemindaian akumulasi/distribusi seluruh bursa membutuhkan feed data broker summary real-time (Invezgo atau setara) yang belum dikonfigurasi di aplikasi ini. Untuk data broker per-saham, gunakan Analisis Emiten pada ticker spesifik.'
      + '</div>';
    return;
  }

  c.innerHTML = '<div style="color:var(--text3);text-align:center;padding:32px 20px;font-size:13px">Memuat data akumulasi/distribusi seluruh BEI...</div>';
  FS_BROKER_SCAN.loading = true;

  try {
    var res = await fetch('/api/idx/accumulation-distribution');
    var data = await res.json();

    if (data && data.isSimulated && data.counts && data.counts.totalUniverseScanned === 0) {
      FS_BROKER_SCAN.notConfigured = true;
    } else if (data && data.success) {
      FS_BROKER_SCAN.accumulation = data.accumulation || [];
      FS_BROKER_SCAN.distribution = data.distribution || [];
      FS_BROKER_SCAN.date = data.date || null;
      FS_BROKER_SCAN.loaded = true;
    }
    await fsFetchInvezgoQuotaStatus();
  } catch (e) {
    console.warn('[Smart Money Screener] Gagal memuat data akumulasi/distribusi:', e && e.message);
  } finally {
    FS_BROKER_SCAN.loading = false;
  }

  var c2 = document.getElementById('sms-broker-content');
  if (!c2) return;
  if (FS_BROKER_SCAN.notConfigured) {
    fsRenderBrokerFlowMode();
  } else {
    fsRenderBrokerScanUI(c2);
  }
}

function fsRenderBrokerScanUI(c) {
  var accList = FS_BROKER_SCAN.accumulation;
  var distList = FS_BROKER_SCAN.distribution;
  var quotaExhausted = !!(FS_BROKER_SCAN.quota && FS_BROKER_SCAN.quota.remaining <= 0);
  var dateLabel = FS_BROKER_SCAN.date || '-';

  var html = fsRenderQuotaBar()

  + '<div class="card" style="padding:14px;margin-bottom:14px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px">'
    + '<div>'
      + '<div style="font-weight:700;font-size:13px;color:var(--text)">Pemindaian Smart Money &amp; Retail Absorption (Seluruh BEI)</div>'
      + '<div style="font-size:11px;color:var(--text3)">Skor ranking akumulasi/distribusi harian (Invezgo, EOD) — mencakup seluruh emiten BEI, data per: ' + dateLabel + '</div>'
    + '</div>'
    + '<button class="btn btn-ghost btn-xs" ' + (FS_BROKER_SCAN.loading || quotaExhausted ? 'disabled' : '') + ' ' + (quotaExhausted ? 'title="Kuota Invezgo bulan ini habis — coba lagi bulan depan"' : '') + ' onclick="fsResetBrokerScan();fsRenderBrokerFlowMode()">'
      + (FS_BROKER_SCAN.loading ? 'Memuat…' : quotaExhausted ? 'Kuota Habis' : 'Refresh')
      + '</button>'
  + '</div>';

  if (!accList.length && !distList.length) {
    html += '<div class="card" style="padding:24px;text-align:center;color:var(--text3);font-size:12.5px">'
      + (FS_BROKER_SCAN.loading ? 'Memuat data...' : 'Belum ada data akumulasi/distribusi untuk hari ini.')
      + '</div>';
  } else {
    html += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(340px,1fr));gap:16px">'
      + '<div class="card" style="padding:0;overflow:hidden">'
        + '<div style="padding:12px 16px;background:rgba(16,185,129,0.08);border-bottom:1px solid rgba(16,185,129,0.2);display:flex;justify-content:space-between;align-items:center">'
          + '<div style="display:flex;align-items:center;gap:8px"><strong style="color:var(--green);font-size:13px">TOP AKUMULASI</strong></div>'
          + '<span class="badge b-up">' + accList.length + ' Saham</span>'
        + '</div>'
        + '<div style="overflow-x:auto;max-height:420px"><table class="tbl">'
          + '<thead><tr><th>Ticker</th><th style="text-align:right">Price</th><th style="text-align:right">Chg%</th><th style="text-align:right">Skor</th><th style="text-align:center">Alur</th></tr></thead>'
          + '<tbody>'
          + accList.slice(0, 100).map(function(it) {
              var chg = Number(it.priceChangePct || 0);
              return '<tr>'
                + '<td><strong style="color:var(--text);font-size:13px">' + it.ticker + '</strong><div style="font-size:10px;color:var(--text3)">' + (it.name || '') + '</div></td>'
                + '<td class="mono" style="text-align:right">Rp ' + Number(it.avgPrice || 0).toLocaleString('id-ID') + '</td>'
                + '<td class="mono ' + (chg >= 0 ? 'up' : 'dn') + '" style="text-align:right">' + (chg >= 0 ? '+' : '') + chg.toFixed(2) + '%</td>'
                + '<td class="mono up" style="text-align:right;font-weight:700">' + Number(it.score || 0).toFixed(2) + '</td>'
                + '<td style="text-align:center"><button class="btn btn-ghost btn-xs" onclick="fsOpenBrokerFlowTicker(\'' + it.ticker + '\')" title="Lihat Alur Transaksi">Alur</button></td>'
                + '</tr>';
            }).join('')
          + '</tbody></table></div></div>'

      + '<div class="card" style="padding:0;overflow:hidden">'
        + '<div style="padding:12px 16px;background:rgba(239,68,68,0.08);border-bottom:1px solid rgba(239,68,68,0.2);display:flex;justify-content:space-between;align-items:center">'
          + '<div style="display:flex;align-items:center;gap:8px"><strong style="color:var(--red);font-size:13px">TOP DISTRIBUSI</strong></div>'
          + '<span class="badge b-dn">' + distList.length + ' Saham</span>'
        + '</div>'
        + '<div style="overflow-x:auto;max-height:420px"><table class="tbl">'
          + '<thead><tr><th>Ticker</th><th style="text-align:right">Price</th><th style="text-align:right">Chg%</th><th style="text-align:right">Skor</th><th style="text-align:center">Alur</th></tr></thead>'
          + '<tbody>'
          + distList.slice(0, 100).map(function(it) {
              var chg = Number(it.priceChangePct || 0);
              return '<tr>'
                + '<td><strong style="color:var(--text);font-size:13px">' + it.ticker + '</strong><div style="font-size:10px;color:var(--text3)">' + (it.name || '') + '</div></td>'
                + '<td class="mono" style="text-align:right">Rp ' + Number(it.avgPrice || 0).toLocaleString('id-ID') + '</td>'
                + '<td class="mono ' + (chg >= 0 ? 'up' : 'dn') + '" style="text-align:right">' + (chg >= 0 ? '+' : '') + chg.toFixed(2) + '%</td>'
                + '<td class="mono dn" style="text-align:right;font-weight:700">' + Number(it.score || 0).toFixed(2) + '</td>'
                + '<td style="text-align:center"><button class="btn btn-ghost btn-xs" onclick="fsOpenBrokerFlowTicker(\'' + it.ticker + '\')" title="Lihat Alur Transaksi">Alur</button></td>'
                + '</tr>';
            }).join('')
          + '</tbody></table></div></div>'
    + '</div>';
  }

  c.innerHTML = html;
}

// "Alur" per ticker sebelumnya membuka sub-tab "Visualisasi Alur Transaksi"
// di Opportunity Radar (selectRadarFlowTicker) — dipertahankan sebagai
// jalan pintas dari mode ini, bukan diduplikasi.
function fsOpenBrokerFlowTicker(ticker) {
  if (typeof goPage === 'function') goPage('radar', null);
  if (typeof setRadarSubTab === 'function') setRadarSubTab('flow-trail');
  if (typeof selectRadarFlowTicker === 'function') selectRadarFlowTicker(ticker);
}

// Mode "Heatmap Sektor" — dipindahkan dari renderBandarmologyHeatmapScannerView()
// (41-stockchat-cockpit.js), lalu diperluas ke seluruh BEI, lalu (2026-09-17,
// user-reported "masih pakai data simulasi") DISAMBUNGKAN ke data Invezgo
// real yang sama dengan mode "Broker Flow Riil" — bukan lagi memakai
// mesin simulasi CMF lokal (fungsi di 41-stockchat-cockpit.js). Memakai
// FS_BROKER_SCAN yang SAMA (state punya mode "Broker Flow Riil" di atas):
// satu fetch dipakai bersama kedua mode, tidak ada panggilan Invezgo
// tambahan cuma karena pindah tab. Sektor diagregasi dari field `sector`
// yang sudah disertakan server (lib/idx-data-engine.js), flow per-sektor
// dijumlahkan dari `valueRp` real (akumulasi = +, distribusi = -).
// Kalau Invezgo belum dikonfigurasi/gagal, tampilkan pesan jujur yang SAMA
// dengan mode "Broker Flow Riil" — tidak lagi diam-diam jatuh ke tabel
// simulasi seperti sebelumnya.
async function fsRenderSectorHeatmapMode() {
  var c = document.getElementById('sms-sector-content');
  if (!c) return;

  if (FS_BROKER_SCAN.loaded && !FS_BROKER_SCAN.notConfigured) {
    fsRenderSectorHeatmapUI(c);
    return;
  }

  c.innerHTML = '<div style="color:var(--text3);text-align:center;padding:32px 20px;font-size:13px">Memuat data broker seluruh BEI...</div>';
  if (!FS_BROKER_SCAN.notConfigured) await fsFetchInvezgoQuotaStatus();

  if (FS_BROKER_SCAN.notConfigured) {
    c.innerHTML = '<div style="color:var(--text3);text-align:center;padding:32px 20px;font-size:13px">Heatmap sektoral membutuhkan feed data broker summary real-time (Invezgo) yang belum dikonfigurasi di aplikasi ini.</div>';
    return;
  }

  FS_BROKER_SCAN.loading = true;
  try {
    var res = await fetch('/api/idx/accumulation-distribution');
    var data = await res.json();
    if (!data || !data.success || data.isSimulated) {
      FS_BROKER_SCAN.notConfigured = true;
    } else {
      FS_BROKER_SCAN.accumulation = data.accumulation || [];
      FS_BROKER_SCAN.distribution = data.distribution || [];
      FS_BROKER_SCAN.date = data.date || null;
      FS_BROKER_SCAN.loaded = true;
    }
  } catch (e) {
    FS_BROKER_SCAN.notConfigured = true;
  } finally {
    FS_BROKER_SCAN.loading = false;
  }

  if (FS_BROKER_SCAN.notConfigured) {
    c.innerHTML = '<div style="color:var(--text3);text-align:center;padding:32px 20px;font-size:13px">Provider data broker tidak mengembalikan data real untuk heatmap sektoral hari ini.</div>';
  } else {
    fsRenderSectorHeatmapUI(c);
  }
}

function fsRenderSectorHeatmapUI(c) {
  var accList = FS_BROKER_SCAN.accumulation || [];
  var distList = FS_BROKER_SCAN.distribution || [];
  var dateLabel = FS_BROKER_SCAN.date || '-';

  var sectorTotals = {}; // name -> { net: number, count: number }
  function fold(list, sign) {
    list.forEach(function(item) {
      var secName = item.sector || '-';
      if (!sectorTotals[secName]) sectorTotals[secName] = { net: 0, count: 0 };
      sectorTotals[secName].net += sign * (Number(item.valueRp) || 0);
      sectorTotals[secName].count += 1;
    });
  }
  fold(accList, 1);
  fold(distList, -1);

  var sectorColors = ['var(--green)', 'var(--red)'];
  var sectors = Object.keys(sectorTotals).map(function(name) {
    var t = sectorTotals[name];
    var secM = Math.round(t.net / 1000000000);
    var isAcc = secM >= 0;
    return {
      name: name,
      flowVal: (secM >= 0 ? '+Rp ' : '-Rp ') + Math.abs(secM).toLocaleString('id-ID') + ' M',
      count: t.count,
      isAcc: isAcc,
      borderCol: isAcc ? sectorColors[0] : sectorColors[1]
    };
  }).sort(function(a, b) { return b.count - a.count; });

  // Gabungkan accum+dist jadi satu tabel ranking, diurutkan berdasar
  // |valueRp| (nilai transaksi real, bukan skor) terbesar.
  var combined = accList.map(function(x) { return Object.assign({}, x, { isAcc: true }); })
    .concat(distList.map(function(x) { return Object.assign({}, x, { isAcc: false }); }));
  combined.sort(function(a, b) { return Math.abs(b.valueRp || 0) - Math.abs(a.valueRp || 0); });
  var totalScanned = combined.length;
  var TABLE_DISPLAY_CAP = 40;
  var rows = combined.slice(0, TABLE_DISPLAY_CAP);

  var html = '<div style="display:flex;flex-direction:column;gap:16px">'
    + '<div class="card" style="padding:16px">'
    + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">'
    + '<div style="font-size:12px;font-weight:700;color:var(--text);display:flex;align-items:center;gap:6px">HEATMAP ALIRAN DANA SMART MONEY SEKTORAL BEI</div>'
    + '<span class="badge b-up" style="font-size:9px" title="Data real dari Invezgo API, per ' + dateLabel + '">DATA REAL — ' + dateLabel + '</span>'
    + '</div>'
    + '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px">'
    + sectors.map(function(s) {
        return '<div class="metric" style="border-left:3px solid ' + s.borderCol + ';padding:10px">'
          + '<div class="mlabel" title="' + s.name + '">' + s.name + '</div>'
          + '<div class="mval ' + (s.isAcc ? 'up' : 'down') + ' mono" style="font-size:16px;margin:4px 0">' + s.flowVal + '</div>'
          + '<div class="msub neu">' + s.count + ' Emiten Teranalisis</div>'
          + '</div>';
      }).join('')
    + '</div></div>'

    + '<div class="card" style="padding:16px">'
    + '<div style="display:flex;justify-content:space-between;align-items:center;padding-bottom:12px;border-bottom:1px solid var(--border2);margin-bottom:12px;flex-wrap:wrap;gap:8px">'
    + '<div>'
    + '<div style="font-size:13px;font-weight:700;color:var(--text);display:flex;align-items:center;gap:6px">PEMINDAI SMART MONEY &amp; BANDAR RADAR (SELURUH BEI)</div>'
    + '<div style="font-size:11px;color:var(--text3);margin-top:2px">Harga, verdict &amp; nilai transaksi real dari Invezgo API (EOD) · menampilkan ' + rows.length + ' teratas (berdasar nilai transaksi) dari ' + totalScanned + ' saham</div>'
    + '</div>'
    + '<span class="badge b-neu" style="font-size:9px">' + totalScanned + ' SAHAM TERDETEKSI</span>'
    + '</div>'
    + '<div class="tbl-wrap" style="overflow-x:auto"><table class="tbl" style="width:100%;font-size:12px">'
    + '<thead><tr><th>Emiten</th><th>Sektor</th><th style="text-align:right">Harga</th><th style="text-align:right">Chg %</th><th style="text-align:right">Skor</th><th style="text-align:center">Bandarmology</th><th style="text-align:right">Nilai Transaksi</th><th style="text-align:center">Aksi</th></tr></thead>'
    + '<tbody>'
    + rows.map(function(row) {
        var chgVal = Number(row.priceChangePct || 0);
        var valM = Math.round((row.valueRp || 0) / 1000000000);
        return '<tr>'
          + '<td><span class="mono" style="font-weight:800;color:var(--text)">' + row.ticker + '</span></td>'
          + '<td style="color:var(--text2)">' + (row.sector || '-') + '</td>'
          + '<td class="mono" style="text-align:right;font-weight:700;color:var(--text)">Rp ' + Math.round(row.avgPrice || 0).toLocaleString('id-ID') + '</td>'
          + '<td class="mono ' + (chgVal >= 0 ? 'up' : 'down') + '" style="text-align:right;font-weight:700">' + (chgVal >= 0 ? '+' : '') + chgVal.toFixed(2) + '%</td>'
          + '<td class="mono ' + (row.isAcc ? 'up' : 'down') + '" style="text-align:right;font-weight:700">' + (Number(row.score || 0)).toFixed(2) + '</td>'
          + '<td style="text-align:center"><span class="badge ' + (row.isAcc ? 'b-up' : 'b-dn') + '" style="font-size:9px">' + (row.isAcc ? 'ACCUMULATION' : 'DISTRIBUTION') + '</span></td>'
          + '<td class="mono ' + (row.isAcc ? 'up' : 'down') + '" style="text-align:right;font-weight:700">Rp ' + valM.toLocaleString('id-ID') + ' M</td>'
          + '<td style="text-align:center"><button onclick="selectStockChatTicker(\'' + row.ticker + '\');goBandarmology(\'stock\',null);" class="btn btn-primary btn-xs">Analisa ' + row.ticker + '</button></td>'
          + '</tr>';
      }).join('')
    + '</tbody></table></div></div></div>';

  c.innerHTML = html;
}

// ── alerts ──
function fsGenAlerts(){
  var als=[];
  // KNOWN_ISSUES.md #2: any of these three signals can be computed entirely
  // from fsGenData()'s synthetic random-walk fallback (r.data.simulated) with
  // zero disclosure. Per the issue's own "Next step" — disclose, don't
  // silently hide (hiding would remove most alerts for any ticker without a
  // cache hit yet) — every title/sub below is tagged "[Estimasi]" plus an
  // explicit "bukan konfirmasi pasar riil" note when simulated.
  FS_RD.filter(function(r){return r.a.sc>=70;}).slice(0,3).forEach(function(r){
    var isSim=!!(r.data && r.data.simulated);
    als.push({t:'al-a',ic:'ti-trending-up',title:(isSim?'[Estimasi] ':'')+'Akumulasi kuat: '+r.t,sub:'Skor '+r.a.sc+'/100 • CMF '+(r.a.cl*100).toFixed(1)+'% • '+r.a.bu+' hari big vol naik'+(isSim?' — data simulasi, bukan konfirmasi pasar riil':'')});
  });
  FS_RD.filter(function(r){return r.a.sc<=32;}).slice(0,2).forEach(function(r){
    var isSim=!!(r.data && r.data.simulated);
    als.push({t:'al-d',ic:'ti-trending-down',title:(isSim?'[Estimasi] ':'')+'Distribusi terdeteksi: '+r.t,sub:'Skor '+r.a.sc+'/100 • CMF '+(r.a.cl*100).toFixed(1)+'% • '+r.a.bd+' hari big vol turun'+(isSim?' — data simulasi, bukan konfirmasi pasar riil':'')});
  });
  FS_RD.filter(function(r){return r.data[r.data.length-1].vr>=2;}).slice(0,3).forEach(function(r){
    var isSim=!!(r.data && r.data.simulated);
    als.push({t:'al-n',ic:'ti-bolt',title:(isSim?'[Estimasi] ':'')+'Volume anomali: '+r.t+' — '+r.data[r.data.length-1].vr.toFixed(1)+'× rata-rata',sub:(isSim?'Data simulasi, bukan konfirmasi pasar riil. ':'')+'Aktivitas institusional tidak biasa. Pantau arah pergerakan harga.'});
  });
  als.sort(function(){return Math.random()-.5;});
  var alList=document.getElementById('al-list');
  // FIX: sebelumnya jam alert dibangkitkan acak (09:00-15:00 palsu), bukan
  // waktu deteksi sungguhan — seolah-olah alert punya histori jam kejadian
  // padahal cuma dihitung ulang saat render. Sekarang pakai jam saat ini
  // (waktu render/deteksi sesungguhnya), bukan angka fiktif.
  var nowReal=new Date();
  var hReal=String(nowReal.getHours()).padStart(2,'0'), mReal=String(nowReal.getMinutes()).padStart(2,'0');
  if(alList) alList.innerHTML=als.map(function(a){
    var h=hReal, m=mReal;
    return '<div class="al-item"><div class="al-ico '+a.t+'"><i class="ti '+a.ic+'"></i></div>'
      +'<div style="flex:1"><div style="font-size:12px;font-weight:500;margin-bottom:2px">'+a.title+'</div>'
      +'<div style="font-size:11px;color:var(--text2)">'+a.sub+'</div></div>'
      +'<div class="mono" style="font-size:10px;color:var(--text3);flex-shrink:0;margin-top:1px">'+h+':'+m+' WIB</div></div>';
  }).join('');
}

// ── watchlist ──
function fsSaveWl(){
  try{
    var tickers = FS_WL.map(function(w){ return w.t; });
    localStorage.setItem('moneywatch_watchlist', JSON.stringify(tickers));
    if(typeof saveData==='function') saveData();
  }catch(e){}
}

function fsLoadWlTickers(){
  try{
    var s = localStorage.getItem('moneywatch_watchlist');
    if(s){
      var arr = JSON.parse(s);
      if(Array.isArray(arr) && arr.length) return arr;
    }
  }catch(e){}
  return null;
}

function fsSyncWithPortfolio(showToast){
  var porto = (typeof getPortfolio==='function') ? getPortfolio() : [];
  var portoTickers = porto.map(function(p){ return p.ticker; });
  if(!portoTickers.length){
    if(showToast && typeof showSaveStatus==='function'){
      showSaveStatus('ℹ Portofolio masih kosong. Catat transaksi beli saham untuk sinkronisasi otomatis.', 'var(--accent)');
    }
    return false;
  }
  // Build new watchlist strictly based on user portfolio + preserve any additional custom watched tickers
  var seen = {};
  var newWl = [];
  // Prioritize portfolio tickers first
  portoTickers.forEach(function(tk){
    if(!tk || seen[tk]) return;
    seen[tk] = true;
    var info = FS_UNIV.find(function(u){ return u.t===tk; }) || fsFallbackInfo(tk);
    var data = fsGenData(tk, 60);
    var a = fsProcess(data);
    newWl.push(Object.assign({}, info, {data:data, a:a}));
  });
  // Also preserve previously added non-portfolio tickers
  FS_WL.forEach(function(w){
    if(!seen[w.t]){
      seen[w.t] = true;
      newWl.push(w);
    }
  });

  FS_WL = newWl;
  fsSaveWl();
  fsRenderWlPage();
  var cnt = document.getElementById('fs-wl-count');
  if(cnt) cnt.textContent = FS_WL.length;

  if(showToast && typeof showSaveStatus==='function'){
    showSaveStatus('Watchlist berhasil diselaraskan dengan ' + portoTickers.length + ' saham portofolio Anda!');
  }
  return true;
}

function fsTgWl(tk){
  if(FS_WL.some(function(w){return w.t===tk;})){
    FS_WL=FS_WL.filter(function(w){return w.t!==tk;});
  } else {
    var info=FS_UNIV.find(function(u){return u.t===tk;})||fsFallbackInfo(tk);
    var data=fsGenData(tk,60);var a=fsProcess(data);
    FS_WL.push(Object.assign({},info,{data:data,a:a}));
  }
  fsSaveWl();
  var cnt=document.getElementById('fs-wl-count');
  if(cnt) cnt.textContent=FS_WL.length;
}

function fsAddFromInput(){
  var inp=document.getElementById('wl-add-input');
  if(!inp) return;
  var v=inp.value.trim().toUpperCase().replace(/\.JK$/i,'');
  if(!v) return;
  fsTgWl(v);
  inp.value='';
  fsRenderWlPage();
}

function fsSetWlSort(mode,btn){
  fsWlSort=mode;
  document.querySelectorAll('#wl-sort-row button').forEach(function(b){b.className='btn btn-ghost btn-sm';});
  btn.className='btn btn-blue btn-sm';
  fsRenderWlPage();
}

function fsRenderWlPage(){
  var list=[].concat(FS_WL);
  if(fsWlSort==='score') list.sort(function(a,b){return b.a.sc-a.a.sc;});
  else if(fsWlSort==='chg') list.sort(function(a,b){return b.a.chgPct-a.a.chgPct;});
  else if(fsWlSort==='signal'){var o={'AKUMULASI':0,'NETRAL':1,'DISTRIBUSI':2};list.sort(function(a,b){return (o[a.a.sig]||1)-(o[b.a.sig]||1);});}
  var el=document.getElementById('wl-page-list');
  if(!el) return;
  if(list.length===0){
    el.innerHTML='<div style="text-align:center;padding:28px;color:var(--text3)">Watchlist kosong. <button class="btn btn-ghost btn-xs" onclick="fsSyncWithPortfolio(true)" style="margin-left:6px;color:var(--accent)">Sinkronkan Portofolio</button> atau tambah dari input di atas.</div>';
    return;
  }
  var porto = (typeof getPortfolio==='function') ? getPortfolio() : [];
  var portoMap = {};
  porto.forEach(function(p){ portoMap[p.ticker] = p; });

  el.innerHTML='<div style="overflow-x:auto"><table class="tbl"><thead><tr><th>Kode</th><th>Nama Saham</th><th>Posisi Portofolio</th><th>Harga Live</th><th>Chg%</th><th>Skor Big Money</th><th>Sinyal Flow</th><th>CMF</th><th>Vol Ratio</th><th>RSI</th><th></th></tr></thead><tbody>'
    +list.map(function(w){
      var last=w.data[w.data.length-1],prev=w.data[w.data.length-2]||last;
      var livePrice = (typeof prices!=='undefined' && prices[w.t]) ? prices[w.t] : last.c;
      var chg=((last.c-prev.c)/prev.c*100);
      var pItem = portoMap[w.t];
      var portoBadge = pItem
        ? '<div style="display:inline-flex;flex-direction:column;gap:2px"><span class="badge b-up" style="font-size:10px;font-weight:700;letter-spacing:0.3px">'+pItem.lot+' Lot</span><span style="font-size:9px;color:var(--text2);font-family:var(--font-mono)">Avg Rp '+fmt(pItem.avg)+'</span></div>'
        : '<span class="badge b-neu" style="font-size:9px;color:var(--text3)">Pantau</span>';

      // KNOWN_ISSUES.md #2: same disclosure as Ranking/Heatmap — this row's
      // score/signal can be entirely synthetic (fsGenData()'s fallback).
      var isSim=!!(w.data && w.data.simulated);
      return '<tr style="'+(w.a.sig==='AKUMULASI'?'background:rgba(0,229,160,.03)':w.a.sig==='DISTRIBUSI'?'background:rgba(255,61,90,.03)':'')+(isSim?';outline:1px solid rgba(255,61,90,.15)':'')+'">'
        +'<td class="mono" style="font-weight:700;cursor:pointer;color:var(--accent)" onclick="fsQuickLoad(\''+w.t+'\')" title="Buka analisa detail FlowScan"><div style="display:flex;align-items:center;gap:6px">'+(typeof getStockLogoHtml==='function'?getStockLogoHtml(w.t,16):'')+w.t+fsSrcDot(isSim)+'</div></td>'
        +'<td><div style="font-size:12px;font-weight:500">'+w.n+'</div><span class="badge b-neu" style="font-size:9px">'+w.s+'</span></td>'
        +'<td>'+portoBadge+'</td>'
        +'<td class="mono" style="font-weight:600">'+fsP(livePrice)+'</td>'
        +'<td class="mono '+(chg>=0?'up':'dn')+'">'+fsPct(chg)+'</td>'
        +'<td><div style="display:flex;align-items:center;gap:5px"><span class="mono" style="color:'+fsScColor(w.a.sc)+';min-width:22px;font-weight:600">'+w.a.sc+'</span><div class="prog" style="width:50px"><div class="progf" style="width:'+w.a.sc+'%;background:'+fsScColor(w.a.sc)+'"></div></div></div></td>'
        +'<td>'+fsMkBdg(w.a.sig,true)+'</td>'
        +'<td class="mono" style="color:'+(w.a.cl>0?'#41f3a7':'#e21d48')+'">'+(w.a.cl*100).toFixed(1)+'%</td>'
        +'<td class="mono" style="color:'+(last.vr>1.5?'#41f3a7':'var(--text2)')+'">'+last.vr.toFixed(2)+'×</td>'
        +'<td class="mono" style="color:'+(w.a.rl>70?'#e21d48':w.a.rl<30?'#41f3a7':'var(--text2)')+'">'+w.a.rl.toFixed(1)+'</td>'
        +'<td><button class="btn btn-red btn-xs" onclick="fsTgWl(\''+w.t+'\');fsRenderWlPage()" style="font-size:10px" title="Hapus dari Watchlist">✕</button></td>'
        +'</tr>';
    }).join('')+'</tbody></table></div>';
}

// ── quick add chips ──
function fsBuildQaChips(){
  var chips=['BBCA','BBRI','BMRI','ADRO','PGEO','ARCI','TLKM','ANTM','CDIA','SMDR'];
  var el=document.getElementById('wl-qa-chips');
  if(!el) return;
  el.innerHTML=chips.map(function(t){
    var inWl=FS_WL.some(function(w){return w.t===t;});
    var style='display:inline-block;padding:3px 9px;border-radius:12px;font-size:11px;font-family:var(--font-mono);cursor:pointer;font-weight:700;'
      +(inWl?'background:var(--accent);color:#fff':'background:var(--bg3);color:var(--text2);border:1px solid var(--border2)');
    return '<span style="'+style+'" onclick="fsTgWl(\''+t+'\');fsBuildQaChips();fsRenderWlPage()">'+t+'</span>';
  }).join('');
}

// ── init FlowScan ──
function saveCashInput(account){
  var input = el('cash-'+account+'-input');
  if(!input) return;
  var val = parseFloat(input.value)||0;
  var current = (typeof calcRdnBalance === 'function') ? calcRdnBalance(account) : 0;
  var diff = val - current;
  if(Math.abs(diff) > 0){
    var isIn = diff >= 0;
    var absDiff = Math.abs(diff);
    var sek = (account === 'saham') ? activeSekuritas : (account === 'crypto' ? 'Crypto Exchange' : 'Platform RD');
    var label = (account === 'crypto') ? 'Kas Crypto' : (account === 'reksadana') ? 'Kas Reksa Dana' : 'Kas Saham IDX (RDN)';
    addRdn(today(), isIn ? 'SETOR' : 'TARIK', 'Penyesuaian saldo ' + label, isIn ? absDiff : -absDiff, sek, null, account);
    saveData();
  }
  renderCashWidgets();
  updateTopbar();
  showSaveStatus('Saldo kas ' + account + ' disesuaikan ke Rp ' + fmtK(val));
}
function renderCashWidgets(){
  // Semua saldo kas akun (Saham, Crypto, Reksa Dana) bersumber dari mutasi RDN
  if(typeof calcRdnBalance === 'function'){
    if(typeof CASH_ACCOUNTS !== 'undefined'){
      if(CASH_ACCOUNTS.saham) CASH_ACCOUNTS.saham.balance = calcRdnBalance('saham');
      if(CASH_ACCOUNTS.crypto) CASH_ACCOUNTS.crypto.balance = calcRdnBalance('crypto');
      if(CASH_ACCOUNTS.reksadana) CASH_ACCOUNTS.reksadana.balance = calcRdnBalance('reksadana');
    }
  }
  if(typeof CASH_ACCOUNTS !== 'undefined'){
    Object.keys(CASH_ACCOUNTS).forEach(function(k){
      var disp = el('cash-'+k+'-disp');
      var input = el('cash-'+k+'-input');
      var ca = CASH_ACCOUNTS[k];
      if(disp){ var isUsd=ca.isUsd; disp.textContent=(isUsd?'$':'Rp ')+fmt(Math.round(ca.balance)); }
      if(input){ input.value=Math.round(ca.balance); }
    });
  }
}

function closeDD(){
  document.querySelectorAll('.nav-dd-menu').forEach(function(m){ m.classList.remove('open'); });
  document.querySelectorAll('.nav-dd-btn').forEach(function(b){ b.classList.remove('on'); });
}
document.addEventListener('click', function(e){
  if(!e.target.closest('.nav-dropdown')) closeDD();
});

function fsInit(){
  // Re-dedup FS_UNIV (may have received duplicates from dynamic portfolio push)
  (function(){ var seen={}; FS_UNIV=FS_UNIV.filter(function(u){ if(seen[u.t]) return false; seen[u.t]=true; return true; }); })();
  // FIX: setelah import Excel IDX, FS_UNIV bisa berisi 900+ saham — halaman
  // "Ranking 30 Saham Terbesar" tetap dibatasi ke top-N market cap agar cepat
  // & sesuai judulnya, bukan me-render ratusan baris sekaligus.
  var rankSource = FS_UNIV.length > 60
    ? FS_UNIV.slice().sort(function(a,b){ return (b.cap||0)-(a.cap||0); }).slice(0, 60)
    : FS_UNIV;
  FS_RD=rankSource.map(function(u){
    var data=fsGenData(u.t,60);
    var a=fsProcess(data);
    // Rasio volume spike dihitung SEKALI di sini (bukan tiap render) dari
    // data yang sudah dimuat — lihat fsCalcVolRatio() di atas.
    var vr=fsCalcVolRatio(data);
    a.volRatio30=vr.ratio30; a.volRatio14=vr.ratio14; a.isVolSpike=vr.isSpike;
    return Object.assign({},u,{data:data,a:a});
  });

  FS_WL = [];
  var savedWl = fsLoadWlTickers();
  var porto = (typeof getPortfolio==='function') ? getPortfolio() : [];
  var targetTickers = [];

  if(savedWl && savedWl.length){
    targetTickers = savedWl;
  } else if(porto && porto.length){
    targetTickers = porto.map(function(p){ return p.ticker; });
  } else if(typeof XLSX_DATA!=='undefined' && XLSX_DATA.stocks && XLSX_DATA.stocks.length){
    targetTickers = XLSX_DATA.stocks.slice(0,6).map(function(s){ return s.code; });
  } else {
    targetTickers = ['BBCA','BBRI','BMRI','TLKM','ASII','ICBP'];
  }

  var seenTk = {};
  targetTickers.forEach(function(code){
    if(!code || seenTk[code]) return;
    seenTk[code] = true;
    var info = FS_UNIV.find(function(u){ return u.t===code; }) || fsFallbackInfo(code);
    var data = fsGenData(code, 60);
    var a = fsProcess(data);
    FS_WL.push(Object.assign({}, info, {data:data, a:a}));
  });

  fsBuildQaChips();
  var cnt = document.getElementById('fs-wl-count');
  if(cnt) cnt.textContent = FS_WL.length;
}

