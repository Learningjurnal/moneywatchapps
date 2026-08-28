// ============================================================
// RENDER FUNCTIONS
// ============================================================
function renderDashboard(){
  if(typeof renderPortfolioHub === 'function') renderPortfolioHub();
}

function renderRdn(){
  var accFilter = el('rdn-acc-filter') ? el('rdn-acc-filter').value : 'all';
  var rdn = calcRdnBalance(accFilter === 'all' ? 'saham' : accFilter);
  var activeMuts = (accFilter === 'all') ? rdnMutations : rdnMutations.filter(function(r){ return (r.account || 'saham') === accFilter; });

  var setors=activeMuts.filter(function(r){return r.type==='SETOR' || r.type==='TOPUP'});
  var tariks=activeMuts.filter(function(r){return r.type==='TARIK'});
  var totalIn=setors.reduce(function(a,r){return a+(r.amount||0)},0);
  var totalOut=Math.abs(tariks.reduce(function(a,r){return a+(r.amount||0)},0));
  var usedBuy=transactions.filter(function(t){return t.type==='BUY'}).reduce(function(a,t){return a+(t.net||0)},0);

  el('rdn-saldo').textContent='Rp '+fmtK(rdn);
  el('rdn-sekuritas').textContent= (accFilter === 'crypto') ? 'Crypto Wallet' : (accFilter === 'reksadana') ? 'Reksa Dana' : activeSekuritas;
  el('rdn-in').textContent='Rp '+fmtK(totalIn);
  el('rdn-in-cnt').textContent=setors.length+' kali setor';
  el('rdn-out').textContent='Rp '+fmtK(totalOut);
  el('rdn-out-cnt').textContent=tariks.length+' kali tarik';
  el('rdn-used').textContent='Rp '+fmtK(usedBuy);

  var feeMuts=activeMuts.filter(function(r){
    return ['DATA_FEE','MATERAI','MIGRASI','ADMIN','TRANSFER','PENALTY','LAINNYA','FEE'].indexOf(r.type)>=0;
  });
  var totalFee=Math.abs(feeMuts.reduce(function(a,r){return a+r.amount;},0));
  el('rdn-summary').innerHTML=
    '<div class="taxrow" style="padding:5px 0"><span style="color:var(--text2)">Total Setoran</span><span class="mono up">+ Rp '+fmtK(totalIn)+'</span></div>'
    +'<div class="taxrow" style="padding:5px 0"><span style="color:var(--text2)">Total Penarikan</span><span class="mono dn">- Rp '+fmtK(totalOut)+'</span></div>'
    +'<div class="taxrow" style="padding:5px 0"><span style="color:var(--text2)">Dana Untuk Beli</span><span class="mono dn">- Rp '+fmtK(usedBuy)+'</span></div>'
    +'<div class="taxrow" style="padding:5px 0"><span style="color:var(--text2)">Hasil Jual Saham</span><span class="mono up">+ Rp '+fmtK(transactions.filter(function(t){return t.type==='SELL'}).reduce(function(a,t){return a+t.net},0))+'</span></div>'
    +'<div class="taxrow" style="padding:5px 0"><span style="color:var(--text2)">Penerimaan Dividen</span><span class="mono up">+ Rp '+fmtK(dividends.filter(function(d){return d._src!=='lampiran'}).reduce(function(a,d){return a+d.net},0))+'</span></div>'
    +(totalFee>0?'<div class="taxrow" style="padding:5px 0"><span style="color:var(--text2)">Biaya & Fee ('+(feeMuts.length+' catatan')+')</span><span class="mono dn">- Rp '+fmtK(totalFee)+'</span></div>':'')
    +'<div style="border-top:1px solid var(--border2);margin-top:6px;padding-top:8px;display:flex;justify-content:space-between;font-family:var(--font-mono);font-weight:600;font-size:13px"><span>Saldo Aktif</span><span class="up">Rp '+fmtK(rdn)+'</span></div>';

  // Deteksi sekuritas dari portofolio
  var detectedSek = detectActiveSekuritas();
  var sec=SEKURITAS[detectedSek]||SEKURITAS[activeSekuritas];
  var ovr=sekTaxOverride[detectedSek]||{};
  var bFee=(ovr.beli!=null?ovr.beli:sec.buyFee)*100;
  var jFee=(ovr.jual!=null?ovr.jual:sec.sellFee)*100;

  // Hitung distribusi transaksi per sekuritas
  var bySekTx={};
  transactions.forEach(function(t){
    var s=t.sekuritas||'(tidak ada)';
    if(!bySekTx[s]) bySekTx[s]={cnt:0,lot:0,lastDate:''};
    bySekTx[s].cnt++;
    bySekTx[s].lot+=(t.lot||0);
    if(t.date>bySekTx[s].lastDate) bySekTx[s].lastDate=t.date;
  });
  var sekRows=Object.keys(bySekTx).sort(function(a,b){return bySekTx[b].cnt-bySekTx[a].cnt;}).map(function(s){
    var isActive=(s===detectedSek);
    var sf=SEKURITAS[s];
    return '<div class="taxrow" style="padding:4px 0'+(isActive?';border-left:2px solid var(--accent);padding-left:6px':'')+'">'
      +'<span style="font-size:11px'+(isActive?';color:var(--accent);font-weight:600':'')+'">'+(isActive?'★ ':'')+s+'</span>'
      +'<span class="mono" style="font-size:10px;color:var(--text2)">'+bySekTx[s].cnt+' tx · '+bySekTx[s].lot+' lot</span>'
      +'</div>';
  }).join('') || '<div style="color:var(--text3);font-size:11px">Belum ada transaksi</div>';

  el('rdn-sec-info').innerHTML=
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">'
    +'<div><span style="font-size:13px;font-weight:600;color:var(--accent)">'+detectedSek+'</span>'
    +'<span style="font-size:9px;color:var(--text3);margin-left:6px;font-family:var(--font-mono)">auto-detect dari portofolio</span></div>'
    +'<button class="btn btn-ghost btn-xs" onclick="openModal(\'sec\')">Ganti</button></div>'
    +'<div class="taxrow"><span>Komisi Beli</span><span class="mono amb">'+bFee.toFixed(3)+'%</span></div>'
    +'<div class="taxrow"><span>Komisi Jual</span><span class="mono amb">'+jFee.toFixed(3)+'%</span></div>'
    +'<div class="taxrow"><span>PPh Final Jual</span><span class="mono dn">'+(TAX_SETTINGS.pphJual*100).toFixed(1)+'%</span></div>'
    +'<div class="taxrow"><span>PPN × Komisi</span><span class="mono dn">'+(TAX_SETTINGS.ppn*100).toFixed(0)+'%</span></div>'
    +'<div class="taxrow"><span>Levy BEI+KPEI+KSEI</span><span class="mono dn">'+(TAX_SETTINGS.levy*100).toFixed(3)+'%</span></div>'
    +'<div style="border-top:1px solid var(--border2);margin-top:8px;padding-top:8px;font-size:9px;color:var(--text3);letter-spacing:.6px;font-family:var(--font-mono);margin-bottom:5px">DISTRIBUSI SEKURITAS</div>'
    +sekRows;

  var filter=el('rdn-filter')?el('rdn-filter').value:'all';
  var FEE_SUBTYPES=['DATA_FEE','MATERAI','MIGRASI','ADMIN','TRANSFER','PENALTY','LAINNYA','FEE'];
  var list=rdnMutations.slice().reverse().filter(function(r){
    var acc = r.account || 'saham';
    if(accFilter !== 'all' && acc !== accFilter) return false;
    if(filter==='all') return true;
    if(filter==='SETOR') return r.type==='SETOR' || r.type==='TOPUP';
    if(filter==='FEE') return FEE_SUBTYPES.indexOf(r.type)>=0;
    return r.type===filter;
  });
  el('rdn-tbody').innerHTML=list.map(function(r){
    var isin=r.amount>0;
    var acc = r.account || 'saham';
    var accBadges = {
      'saham': '<span class="badge" style="background:rgba(0,200,255,.12);color:var(--accent);font-size:9px">Saham</span>',
      'crypto': '<span class="badge" style="background:rgba(247,147,26,.12);color:#f7931a;font-size:9px">Crypto</span>',
      'reksadana': '<span class="badge" style="background:rgba(128,112,210,.12);color:#8070d2;font-size:9px">Reksa Dana</span>'
    };
    var accBadge = accBadges[acc] || accBadges['saham'];

    var typeColors={'SETOR':'b-up','TOPUP':'b-up','TARIK':'b-dn','BUY':'b-dn','SELL':'b-up','DIVIDEN':'b-pur','FEE':'b-amb',
      'DATA_FEE':'b-amb','MATERAI':'b-amb','MIGRASI':'b-amb','ADMIN':'b-amb','TRANSFER':'b-amb','PENALTY':'b-dn','LAINNYA':'b-amb'};
    var typeLabels={'SETOR':'SETOR','TOPUP':'SETOR','TARIK':'TARIK','BUY':'BELI','SELL':'JUAL','DIVIDEN':'DIVIDEN','FEE':'FEE',
      'DATA_FEE':'DATA FEE','MATERAI':'MATERAI','MIGRASI':'MIGRASI','ADMIN':'ADMIN','TRANSFER':'TRANSFER','PENALTY':'DENDA','LAINNYA':'BIAYA'};
    // SETOR, TARIK, FEE dan semua mutasi non-linked (termasuk Setoran Awal) bisa dihapus langsung
    var canDel = (r.type==='SETOR'||r.type==='TOPUP'||r.type==='TARIK'||r.type==='FEE'||
      ['DATA_FEE','MATERAI','MIGRASI','ADMIN','TRANSFER','PENALTY','LAINNYA'].indexOf(r.type)>=0 || !r.linkedTxId);
    var delBtn = canDel
      ? '<button class="btn btn-ghost btn-xs" style="color:var(--red);padding:2px 5px" onclick="delRdnManual(\''+r.id+'\')" title="Hapus mutasi ini" aria-label="Hapus mutasi RDN '+r.date+'">✕</button>'
      : '<span class="badge b-gray" style="font-size:9px;cursor:default" title="Dikelola dari transaksi terkait">auto</span>';
    var auditBtn = '<button class="btn btn-ghost btn-xs" style="color:var(--accent);padding:2px 5px;margin-right:4px" onclick="if(typeof openAuditDetailModal===\'function\')openAuditDetailModal(\''+r.id+'\')" title="Buka Slip Audit Rincian">🔍</button>';
    return '<tr>'
      +'<td class="mono" style="color:var(--text2);font-size:11px">'+r.date+'</td>'
      +'<td>'+accBadge+'</td>'
      +'<td><span class="badge '+(typeColors[r.type]||'b-gray')+'">'+(typeLabels[r.type]||r.type)+'</span></td>'
      +'<td style="max-width:240px;color:var(--text2);font-size:11px">'+escHtml(r.ket)+'</td>'
      +'<td class="mono up">'+(isin?'Rp '+fmtK(r.amount):'—')+'</td>'
      +'<td class="mono dn">'+(!isin?'Rp '+fmtK(Math.abs(r.amount)):'—')+'</td>'
      +'<td class="mono" style="font-weight:600">Rp '+fmtK(r.balance)+'</td>'
      +'<td style="white-space:nowrap">'+auditBtn+delBtn+'</td>'
      +'</tr>';
  }).join('')||'<tr><td colspan="8" style="text-align:center;color:var(--text3);padding:16px">Belum ada mutasi</td></tr>';

  buildRdnChart();
}

function renderTransaksi(){
  var search=(el('tx-search')?el('tx-search').value:'').toUpperCase();
  var filter=el('tx-filter')?el('tx-filter').value:'all';
  var buys=transactions.filter(function(t){return t.type==='BUY'});
  var sells=transactions.filter(function(t){return t.type==='SELL'});
  el('tx-cnt').textContent=transactions.length;
  el('tx-buy').textContent='Rp '+fmtK(buys.reduce(function(a,t){return a+t.net},0));
  el('tx-buy-cnt').textContent=buys.length+' transaksi';
  el('tx-sell').textContent='Rp '+fmtK(sells.reduce(function(a,t){return a+t.net},0));
  el('tx-sell-cnt').textContent=sells.length+' transaksi';
  el('tx-tax').textContent='Rp '+fmtK(transactions.reduce(function(a,t){return a+t.tax+t.komisi},0));

  var txMetrics = (typeof calcChronologicalTxMetrics==='function') ? calcChronologicalTxMetrics() : {};

  var list=transactions.slice().sort(function(a,b){return (b.date||'').localeCompare(a.date||'') || ((b.id||0) - (a.id||0));}).filter(function(tx){
    return tx.ticker.toUpperCase().indexOf(search)>=0&&(filter==='all'||tx.type===filter)
  });
  _txVisibleIds = list.map(function(tx){return tx.id});

  el('tx-tbody').innerHTML=list.map(function(tx){
    var isBuy=tx.type==='BUY';
    var m = txMetrics[tx.id] || {};
    var pnlHtml='—';
    if(!isBuy && m.pnlGross != null){
      var pnl = m.pnlGross;
      var pct = m.pnlPct || 0;
      var pnlNet = m.pnlNet != null ? m.pnlNet : pnl;
      pnlHtml = '<div style="display:inline-flex;flex-direction:column;align-items:flex-start" title="Gain Kotor: '+(pnl>=0?'+':'')+'Rp '+fmt(pnl)+' ('+pct.toFixed(2)+'%)&#10;Gain Bersih (setelah fee): '+(pnlNet>=0?'+':'')+'Rp '+fmt(pnlNet)+'&#10;Modal Rata-rata: Rp '+fmt(m.avgGrossBuy||0)+'/lbr">'
        + '<span class="'+(pnl>=0?'up':'dn')+'" style="font-weight:600">'+(pnl>=0?'+':'')+'Rp '+fmtK(pnl)+'</span>'
        + '<span style="font-size:9px;color:'+(pct>=0?'var(--green)':'var(--red)')+';font-family:var(--font-mono)">('+(pct>=0?'+':'')+pct.toFixed(1)+'%)</span>'
        + '</div>';
    }

    return '<tr style="'+(_txSelected.has(tx.id)?'background:rgba(0,200,255,.05)':'')+'">'
      +'<td><input type="checkbox" '+ (_txSelected.has(tx.id)?'checked':'')+' onmousedown="txCbMouseDown(event,'+tx.id+')" onmouseenter="txCbMouseEnter(event,'+tx.id+')" onclick="txCbClick(event,'+tx.id+')" style="cursor:pointer"></td>'
      +'<td class="mono" style="color:var(--text2);font-size:11px">'+tx.date+'</td>'
      +'<td><span class="badge '+(isBuy?'b-up':'b-dn')+'">'+tx.type+'</span></td>'
      +'<td><div style="display:inline-flex;align-items:center;gap:6px">'+getStockLogoHtml(tx.ticker,18)+'<span class="tp" style="cursor:pointer" onclick="openTxDetailModal('+tx.id+')" title="Lihat detail kalkulasi & rincian biaya">'+tx.ticker+'</span></div></td>'
      +'<td style="font-size:11px;color:var(--text2)">'+tx.sekuritas+'</td>'
      +'<td class="mono">'+tx.lot+'</td>'
      +'<td class="mono">'+tx.lot*100+'</td>'
      +'<td class="mono">Rp '+fmt(tx.price)+'</td>'
      +'<td class="mono">Rp '+fmtK(tx.gross)+'</td>'
      +'<td class="mono amb" title="Komisi: Rp '+fmt(tx.komisi)+'">Rp '+fmtK(tx.komisi)+'</td>'
      +'<td class="mono dn" title="PPN+Levy+PPh: Rp '+fmt(tx.tax)+'">Rp '+fmtK(tx.tax)+'</td>'
      +'<td class="mono" style="font-weight:600;cursor:pointer" onclick="openTxDetailModal('+tx.id+')" title="Klik untuk rincian formula bersih">Rp '+fmtK(tx.net)+'</td>'
      +'<td>'+pnlHtml+'</td>'
      +'<td style="display:flex;gap:4px;align-items:center">'
        +'<button class="btn btn-ghost btn-xs" style="color:var(--accent)" onclick="openTxDetailModal('+tx.id+')" title="Rincian kalkulasi transaksi" aria-label="Rincian transaksi">🔍</button>'
        +'<button class="btn btn-ghost btn-xs" style="color:var(--text2)" onclick="editTx('+tx.id+')" title="Edit transaksi" aria-label="Edit transaksi '+tx.type+' '+tx.ticker+' '+tx.date+'">✎</button>'
        +'<button class="btn btn-ghost btn-xs" style="color:var(--red)" onclick="delTx('+tx.id+')" title="Hapus transaksi" aria-label="Hapus transaksi '+tx.type+' '+tx.ticker+' '+tx.date+'">✕</button>'
      +'</td>'
      +'</tr>';
  }).join('')||'<tr><td colspan="14" style="text-align:center;color:var(--text3);padding:16px;font-family:var(--font-mono)">Belum ada transaksi</td></tr>';

  if (typeof renderTrendingNews === 'function') {
    try { renderTrendingNews(); } catch (e) { console.warn('Trending news render error:', e); }
  }
}

var _portoChartMode = 'sector'; // 'sector' or 'class'
function setPortoChartMode(mode){
  _portoChartMode = mode;
  var bSec = el('porto-tab-sector');
  var bCls = el('porto-tab-class');
  if(bSec && bCls){
    if(mode === 'sector'){
      bSec.className = 'btn btn-ghost btn-sm active';
      bCls.className = 'btn btn-ghost btn-sm';
    } else {
      bSec.className = 'btn btn-ghost btn-sm';
      bCls.className = 'btn btn-ghost btn-sm active';
    }
  }
  renderPortofolio();
}
window.setPortoChartMode = setPortoChartMode;

function renderPortofolio(){
  if(typeof renderStockPerformance==='function') renderStockPerformance();
  var porto=getPortfolio();
  var totalMV=porto.reduce(function(a,p){return a+p.mv},0);
  var totalCost=porto.reduce(function(a,p){return a+p.cost},0);
  var unreal=totalMV-totalCost;
  var pct=totalCost>0?unreal/totalCost*100:0;
  var best=porto.reduce(function(a,p){return p.ret>a.ret?p:a},{ret:-Infinity,ticker:'-'});

  el('p-invest').textContent='Rp '+fmtK(totalCost);
  el('p-market').textContent='Rp '+fmtK(totalMV);
  el('p-unreal').className='mval '+(unreal>=0?'up':'dn');
  el('p-unreal').textContent=(unreal>=0?'+':'')+'Rp '+fmtK(unreal);
  el('p-unreal-pct').innerHTML='<span class="'+(unreal>=0?'up':'dn')+'">'+pct.toFixed(2)+'% dari modal</span>';
  el('p-best').className='mval '+(best.ret>=0?'up':'dn');
  el('p-best').textContent=best.ret!==-Infinity?(best.ret>=0?'+':'')+best.ret.toFixed(2)+'%':'-';
  el('p-best-sub').textContent=best.ticker!=='-'?best.ticker:'';

  // ── Donut Chart Alokasi (Sektor / Kelas Aset) ──
  kc('portoDonut');
  var cvPorto = el('portoDonutChart');
  if(cvPorto){
    var labels = [];
    var dataVals = [];
    var backgroundColors = [];
    var totalVal = 0;

    if(_portoChartMode === 'sector'){
      var secMap = {};
      porto.forEach(function(p){
        var sec = (p.info && p.info.sector) || 'Lainnya';
        secMap[sec] = (secMap[sec] || 0) + (p.mv || 0);
      });
      var sortedSec = Object.keys(secMap).map(function(s){return {sector:s, mv:secMap[s]};}).sort(function(a,b){return b.mv-a.mv;});
      totalVal = sortedSec.reduce(function(a,x){return a+x.mv;}, 0) || 1;
      labels = sortedSec.map(function(x){return x.sector;});
      dataVals = sortedSec.map(function(x){return x.mv;});
      backgroundColors = sortedSec.map(function(x,i){return sectorColor(x.sector) || COLORS[i%COLORS.length];});
    } else {
      var sahamMV = porto.reduce(function(a,p){return a+(p.mv||0);},0);
      var cryptoPorto = typeof getCryptoPortfolio==='function'?getCryptoPortfolio():[];
      var etfPorto = typeof getEtfPortfolio==='function'?getEtfPortfolio():[];
      var rdPorto = typeof getRdPortfolio==='function'?getRdPortfolio():[];
      var crMV = cryptoPorto.reduce(function(a,p){return a+(p.mv||0);},0);
      var etfMV = etfPorto.reduce(function(a,p){return a+(p.mvIdr||0);},0);
      var rdMV = rdPorto.reduce(function(a,p){return a+(p.mv||0);},0);
      var rdn = typeof calcRdnBalance==='function'?calcRdnBalance():0;
      var kasRdn = Math.max(0, rdn);

      var classItems = [
        {label:'Saham IDX', val:sahamMV, color:'#41f3a7'},
        {label:'Crypto', val:crMV, color:'#f7931a'},
        {label:'ETF AS', val:etfMV, color:'#00c8ff'},
        {label:'Reksa Dana', val:rdMV, color:'#8070d2'},
        {label:'Kas RDN', val:kasRdn, color:'#ffc107'}
      ].filter(function(x){return x.val > 0;});

      totalVal = classItems.reduce(function(a,x){return a+x.val;},0) || 1;
      labels = classItems.map(function(x){return x.label;});
      dataVals = classItems.map(function(x){return x.val;});
      backgroundColors = classItems.map(function(x){return x.color;});
    }

    charts['portoDonut'] = new Chart(cvPorto,{
      type:'doughnut',
      data:{
        labels:labels,
        datasets:[{
          data:dataVals,
          backgroundColor:backgroundColors,
          borderWidth:0,
          hoverOffset:6
        }]
      },
      options:{
        responsive:true,
        maintainAspectRatio:false,
        cutout:'65%',
        plugins:{
          legend:{display:false},
          tooltip:Object.assign({}, TT, {
            callbacks:{
              label:function(c){
                var pct = (c.parsed / totalVal * 100).toFixed(1);
                return c.label + ': Rp ' + fmtK(c.parsed) + ' (' + pct + '%)';
              }
            }
          })
        }
      }
    });

    var legEl = el('porto-donut-legend');
    if(legEl){
      legEl.innerHTML = labels.map(function(lbl, idx){
        var val = dataVals[idx];
        var pct = (val / totalVal * 100).toFixed(1);
        var col = backgroundColors[idx];
        return '<div style="display:flex;align-items:center;gap:8px;padding:4px 6px;border-radius:6px;background:rgba(255,255,255,.02)">'
          + '<div style="width:8px;height:8px;border-radius:2px;background:'+col+';flex-shrink:0"></div>'
          + '<span style="color:var(--text2);flex:1;font-weight:500">'+lbl+'</span>'
          + '<span style="font-family:var(--font-mono);font-weight:600;color:'+col+'">'+pct+'%</span>'
          + '<span style="font-family:var(--font-mono);color:var(--text3);min-width:70px;text-align:right">Rp '+fmtK(val)+'</span>'
          + '</div>';
      }).join('');
    }
  }

  // ── Isi dropdown filter sektor (pertahankan pilihan aktif) ──
  var secSel=el('porto-filter-sector');
  if(secSel){
    var curSecVal=secSel.value;
    var secList=Array.from(new Set(porto.map(function(p){return p.info.sector;}))).sort();
    secSel.innerHTML='<option value="">Semua Sektor</option>'+secList.map(function(s){return '<option value="'+s+'">'+s+'</option>';}).join('');
    if(secList.indexOf(curSecVal)>-1) secSel.value=curSecVal;
  }

  // ── Terapkan filter ──
  var qSearch=(el('porto-filter-search')&&el('porto-filter-search').value||'').trim().toUpperCase();
  var qSector=(el('porto-filter-sector')&&el('porto-filter-sector').value)||'';
  var qSignal=(el('porto-filter-signal')&&el('porto-filter-signal').value)||'';
  var qPnl=(el('porto-filter-pnl')&&el('porto-filter-pnl').value)||'';
  var rows=porto.map(function(p){
    var alloc=totalMV>0?(p.mv/totalMV*100):0;
    var sig=p.ret>5?'BUY':p.ret<-5?'SELL':'HOLD';
    return Object.assign({},p,{alloc:alloc,sig:sig});
  });
  if(qSearch) rows=rows.filter(function(p){return p.ticker.toUpperCase().indexOf(qSearch)>-1||(p.info.name||'').toUpperCase().indexOf(qSearch)>-1;});
  if(qSector) rows=rows.filter(function(p){return p.info.sector===qSector;});
  if(qSignal) rows=rows.filter(function(p){return p.sig===qSignal;});
  if(qPnl==='profit') rows=rows.filter(function(p){return p.unreal>=0;});
  else if(qPnl==='loss') rows=rows.filter(function(p){return p.unreal<0;});

  // ── Terapkan sort ──
  var sk=_portoSort.key, asc=_portoSort.asc;
  rows.sort(function(a,b){
    var va,vb;
    if(sk==='name'){ va=a.ticker; vb=b.ticker; return asc?va.localeCompare(vb):vb.localeCompare(va); }
    if(sk==='sector'){ va=a.info.sector; vb=b.info.sector; return asc?va.localeCompare(vb):vb.localeCompare(va); }
    va=a[sk]; vb=b[sk];
    return asc?va-vb:vb-va;
  });
  ['name','sector','lot','mv','cost','unreal','ret','alloc'].forEach(function(k){
    var ico=el('porto-sort-ico-'+k);
    if(ico) ico.textContent=k===sk?(asc?'↑':'↓'):'↕';
  });

  var cntEl=el('porto-filter-count');
  if(cntEl) cntEl.textContent=(qSearch||qSector||qSignal||qPnl)?rows.length+' dari '+porto.length+' saham':porto.length+' saham';

  el('porto-tbody').innerHTML=rows.map(function(p,i){
    var alloc=p.alloc, sig=p.sig;
    var sigCls=sig==='BUY'?'sig-buy':sig==='SELL'?'sig-sell':'sig-hold';
    var secColor=sectorColor(p.info.sector);
    return '<tr><td><div style="display:inline-flex;align-items:center;gap:6px">'+getStockLogoHtml(p.ticker, 22)+'<span class="tp" style="border-color:'+COLORS[i%12]+'">'+p.ticker+'</span><button class="btn btn-ghost btn-xs" onclick="event.stopPropagation();if(typeof openCreatePriceAlertModal===\'function\')openCreatePriceAlertModal(\''+p.ticker+'\','+p.mp+')" title="Pasang Price Alert untuk '+p.ticker+'" style="padding:1px 4px;font-size:10px;border:none;color:var(--amber)"><i class="ti ti-bell"></i></button></div></td><td style="font-size:11px;color:var(--text2)">'+p.info.name+'</td><td><span style="display:inline-flex;align-items:center;gap:4px;font-size:10px;font-family:var(--font-mono);color:var(--text2)"><span class="sec-dot" style="background:'+secColor+'"></span>'+p.info.sector+'</span></td><td class="mono">'+p.lot+'</td><td class="mono">'+p.shares+'</td><td class="mono">Rp '+fmt(p.avg)+'</td><td class="mono" style="color:var(--accent)">Rp '+fmt(p.mp)+'</td><td class="mono">Rp '+fmtK(p.mv)+'</td><td class="mono" style="color:var(--text2)">Rp '+fmtK(p.cost)+'</td><td class="mono '+(p.unreal>=0?'up':'dn')+'">'+(p.unreal>=0?'+':'')+'Rp '+fmtK(p.unreal)+'</td><td class="mono '+(p.ret>=0?'up':'dn')+'">'+(p.ret>=0?'+':'')+p.ret.toFixed(2)+'%</td><td><div class="prog" style="width:70px"><div class="progf" style="width:'+alloc.toFixed(1)+'%;background:'+COLORS[i%12]+'"></div></div><div style="font-size:9px;color:var(--text3);font-family:var(--font-mono);margin-top:2px">'+alloc.toFixed(1)+'%</div></td><td><span class="sig '+sigCls+'">'+sig+'</span></td></tr>';
  }).join('')||'<tr><td colspan="13" style="text-align:center;color:var(--text3);padding:16px;font-family:var(--font-mono)">'+(porto.length?'Tidak ada saham yang cocok dengan filter':'Belum ada posisi aktif')+'</td></tr>';
}

// ── Toolbar Performa per Saham — realized + unrealized P&L tiap kode,
// termasuk saham yang sudah TERTUTUP PENUH (tidak muncul di tabel
// Portofolio biasa karena lot-nya 0). Lihat getStockPerformanceByTicker()
// di 03-engine.js untuk metodologinya (sama persis dengan getPortfolio()).
var _perfSort = {key:'total', asc:false};
var _perfShowClosed = true;
function sortPerf(key){
  if(_perfSort.key===key) _perfSort.asc=!_perfSort.asc;
  else { _perfSort.key=key; _perfSort.asc=false; }
  renderStockPerformance();
}
function togglePerfClosed(){
  _perfShowClosed = !_perfShowClosed;
  renderStockPerformance();
}
function renderStockPerformance(){
  var box = el('perf-toolbar-body');
  if(!box) return;
  var rows = getStockPerformanceByTicker();
  var totalRealized = rows.reduce(function(a,r){return a+r.realized;},0);
  var totalUnreal = rows.reduce(function(a,r){return a+r.unreal;},0);
  var totalAll = totalRealized+totalUnreal;

  var sum = el('perf-summary');
  if(sum){
    sum.innerHTML =
      '<div class="metric"><div class="mlabel">Realized P&amp;L (semua saham)</div><div class="mval '+(totalRealized>=0?'up':'dn')+'">'+(totalRealized>=0?'+':'')+'Rp '+fmtK(totalRealized)+'</div></div>'+
      '<div class="metric"><div class="mlabel">Unrealized P&amp;L (posisi aktif)</div><div class="mval '+(totalUnreal>=0?'up':'dn')+'">'+(totalUnreal>=0?'+':'')+'Rp '+fmtK(totalUnreal)+'</div></div>'+
      '<div class="metric"><div class="mlabel">Total P&amp;L Akun</div><div class="mval '+(totalAll>=0?'up':'dn')+'">'+(totalAll>=0?'+':'')+'Rp '+fmtK(totalAll)+'</div></div>';
  }

  var view = _perfShowClosed ? rows : rows.filter(function(r){return !r.closed;});
  var sk=_perfSort.key, asc=_perfSort.asc;
  view = view.slice().sort(function(a,b){
    if(sk==='ticker') return asc?a.ticker.localeCompare(b.ticker):b.ticker.localeCompare(a.ticker);
    return asc?a[sk]-b[sk]:b[sk]-a[sk];
  });
  ['ticker','lot','realized','unreal','total'].forEach(function(k){
    var ico=el('perf-sort-ico-'+k);
    if(ico) ico.textContent=k===sk?(asc?'↑':'↓'):'↕';
  });

  box.innerHTML = view.map(function(r){
    var statusBadge = r.closed
      ? '<span class="badge b-gray" style="font-size:9px">○ Ditutup</span>'
      : '<span class="badge b-up" style="font-size:9px">● Aktif</span>';
    return '<tr>'
      +'<td><div style="display:inline-flex;align-items:center;gap:6px">'+getStockLogoHtml(r.ticker, 18)+'<span class="tp">'+r.ticker+'</span></div></td>'
      +'<td>'+statusBadge+'</td>'
      +'<td class="mono">'+(r.closed?'—':r.lot)+'</td>'
      +'<td class="mono '+(r.realized>=0?'up':'dn')+'">'+(r.realized>=0?'+':'')+'Rp '+fmtK(r.realized)+'</td>'
      +'<td class="mono '+(r.unreal>=0?'up':'dn')+'">'+(r.closed?'—':(r.unreal>=0?'+':'')+'Rp '+fmtK(r.unreal))+'</td>'
      +'<td class="mono" style="font-weight:700;'+(r.total>=0?'color:var(--green)':'color:var(--red)')+'">'+(r.total>=0?'+':'')+'Rp '+fmtK(r.total)+'</td>'
      +'<td style="font-size:10px;color:var(--text3)">'+r.txCount+'x · '+r.firstDate+' → '+r.lastDate+'</td>'
    +'</tr>';
  }).join('') || '<tr><td colspan="7" style="text-align:center;color:var(--text3);padding:16px;font-family:var(--font-mono)">Belum ada transaksi saham</td></tr>';
}

var _divSelected = new Set();

function renderDividen(){
  var yearFilter = el('div-year-filter')&&el('div-year-filter').value||'all';
  var growthRate = parseFloat(el('div-growth-sel')&&el('div-growth-sel').value||0.08);
  if(typeof renderDividendYoC==='function') renderDividendYoC();

  // Hanya dari user transactions (XLSX sudah dikosongkan)
  var filtered = yearFilter==='all' ? dividends.slice() :
    dividends.filter(function(d){ return d.date && d.date.startsWith(yearFilter); });
  filtered.sort(function(a,b){ return b.date.localeCompare(a.date); });

  var totalNet = dividends.reduce(function(a,d){return a+d.net},0);
  var totalTax = dividends.reduce(function(a,d){return a+d.tax},0);
  var yr = new Date().getFullYear();
  var ytd = dividends.filter(function(d){return d.date&&d.date.startsWith(yr)});
  var ytdNet = ytd.reduce(function(a,d){return a+d.net},0);
  var porto = getPortfolio();
  var totalMV = porto.reduce(function(a,p){return a+p.mv},0)||1;

  el('dv-total').textContent = 'Rp '+fmtK(totalNet);
  el('dv-total-sub').textContent = dividends.length+' catatan dividen';
  el('dv-ytd').textContent = 'Rp '+fmtK(ytdNet);
  el('dv-ytd-sub').textContent = ytd.length+' pembayaran '+yr;
  el('dv-tax').textContent = 'Rp '+fmtK(totalTax);
  el('dv-yield').textContent = totalMV>0?(totalNet/totalMV*100).toFixed(2)+'%':'0,00%';

  // ── Chart: per tahun ──
  kc('divYC');
  var byYr={};
  dividends.forEach(function(d){ var y=d.date?d.date.slice(0,4):'?'; byYr[y]=(byYr[y]||0)+d.net; });
  var years = Object.keys(byYr).sort();
  var cvY = el('divYearChart');
  if(cvY && years.length){
    charts['divYC'] = new Chart(cvY, {type:'bar',
      data:{labels:years, datasets:[{data:years.map(function(y){return byYr[y]}),
        backgroundColor:'rgba(0,229,160,.65)', borderRadius:4}]},
      options:{responsive:true,maintainAspectRatio:false,
        plugins:{legend:{display:false},tooltip:Object.assign({},TT,{callbacks:{label:function(c){return 'Rp '+fmtK(c.parsed.y)}}})},
        scales:{x:{grid:{color:GC},ticks:TC},y:{grid:{color:GC},ticks:Object.assign({},TC,{callback:function(v){return 'Rp '+fmtK(v)}}),position:'right'}}}
    });
  }

  // ── Chart: per saham ──
  kc('divC');
  var byT={};
  dividends.forEach(function(d){ byT[d.ticker]=(byT[d.ticker]||0)+d.net; });
  var tks = Object.keys(byT).sort(function(a,b){return byT[b]-byT[a]}).slice(0,10);
  var cvD = el('divChart');
  if(cvD && tks.length){
    charts['divC'] = new Chart(cvD, {type:'bar',
      data:{labels:tks, datasets:[{data:tks.map(function(t){return byT[t]}),
        backgroundColor:COLORS.slice(0,tks.length), borderRadius:4}]},
      options:{responsive:true,maintainAspectRatio:false,
        plugins:{legend:{display:false},tooltip:Object.assign({},TT,{callbacks:{label:function(c){return 'Rp '+fmtK(c.parsed.y)}}})},
        scales:{x:{grid:{color:GC},ticks:TC},y:{grid:{color:GC},ticks:Object.assign({},TC,{callback:function(v){return 'Rp '+fmtK(v)}}),position:'right'}}}
    });
  }

  // ── Proyeksi 5 tahun ──
  var baseYr = totalNet > 0 ? totalNet : (ytdNet||1000000);
  var projYears=[2027,2028,2029,2030,2031];
  var projVals = projYears.map(function(y,i){ return Math.round(baseYr*Math.pow(1+growthRate,i+1)); });
  var cards = el('div-proj-cards');
  if(cards) cards.innerHTML = projYears.map(function(y,i){
    var val=projVals[i]; var pct=((val-baseYr)/baseYr*100).toFixed(0);
    return '<div style="background:rgba(0,229,160,.06);border:1px solid rgba(0,229,160,.15);border-radius:9px;padding:10px;text-align:center">'+
      '<div style="font-size:11px;font-weight:700;color:var(--green);margin-bottom:4px">'+y+'</div>'+
      '<div style="font-family:var(--font-mono);font-size:13px;font-weight:600">Rp '+fmtK(val)+'</div>'+
      '<div style="font-size:10px;color:var(--text3);margin-top:2px">+'+pct+'% vs base</div>'+
    '</div>';
  }).join('');
  kc('divProj');
  var cvP = el('divProjChart');
  if(cvP){
    charts['divProj'] = new Chart(cvP, {type:'line',
      data:{labels:projYears.map(String),datasets:[
        {data:projVals, borderColor:'#41f3a7', borderWidth:2, fill:true, tension:.4, pointRadius:4,
         backgroundColor:'rgba(0,229,160,.08)'},
        {data:projYears.map(function(){return baseYr}), borderColor:'rgba(255,255,255,.15)',
         borderWidth:1, borderDash:[4,3], fill:false, pointRadius:0}
      ]},
      options:{responsive:true,maintainAspectRatio:false,
        plugins:{legend:{display:false},tooltip:Object.assign({},TT,{callbacks:{label:function(c){return 'Rp '+fmtK(c.parsed.y)}}})},
        scales:{x:{grid:{color:GC},ticks:TC},y:{grid:{color:GC},ticks:Object.assign({},TC,{callback:function(v){return 'Rp '+fmtK(v)}}),position:'right'}}}
    });
  }

  // ── Tabel ──
  var selBtns = el('div-del-sel-btn');
  if(selBtns) selBtns.style.display = _divSelected.size>0?'inline-flex':'none';

  el('div-tbody').innerHTML = filtered.map(function(d){
    var mp = prices[d.ticker]||DB[d.ticker]&&DB[d.ticker].base||1;
    var yld = d.dps && mp ? (d.dps/mp*100).toFixed(2)+'%' : '—';
    var isSel = _divSelected.has(d.id);
    var sharesDisp = (d.shares||0).toLocaleString('id-ID') || '<span style="color:var(--red)">?</span>';
    var dpsDisp   = d.dps ? 'Rp '+fmt(d.dps) : '<span style="color:var(--red)">?</span>';
    var taxDisp   = d.tax!=null ? 'Rp '+fmtK(d.tax) : '<span style="color:var(--red)">?</span>';
    return '<tr style="'+(isSel?'background:rgba(0,200,255,.05)':'')+'">'
      +'<td><input type="checkbox" '+(isSel?'checked':'')+' onchange="divToggleSel('+d.id+',this.checked)" style="cursor:pointer"></td>'
      +'<td class="mono" style="color:var(--text2);font-size:11px">'+d.date+'</td>'
      +'<td><div style="display:inline-flex;align-items:center;gap:6px">'+getStockLogoHtml(d.ticker, 18)+'<span class="tp">'+d.ticker+'</span></div></td>'
      +'<td class="mono">'+sharesDisp+'</td>'
      +'<td class="mono">'+dpsDisp+'</td>'
      +'<td class="mono">Rp '+fmtK(d.gross||0)+'</td>'
      +'<td class="mono dn">'+taxDisp+'</td>'
      +'<td class="mono up">Rp '+fmtK(d.net||0)+'</td>'
      +'<td><span class="badge b-amb">'+yld+'</span></td>'
      +'<td style="display:flex;gap:4px">'
        +'<button class="btn btn-ghost btn-xs" style="color:var(--accent)" onclick="editDiv('+d.id+')" title="Edit" aria-label="Edit dividen '+d.ticker+'">✎</button>'
        +'<button class="btn btn-ghost btn-xs" style="color:var(--red)" onclick="delDiv('+d.id+')" title="Hapus" aria-label="Hapus dividen '+d.ticker+'">✕</button>'
      +'</td>'
      +'</tr>';
  }).join('')||'<tr><td colspan="10" style="text-align:center;color:var(--text3);padding:16px">Belum ada data dividen. Klik "+ Catat Dividen" untuk mulai.</td></tr>';
}

// ── Dividen helpers ──
function divToggleAll(checked){
  var vis = el('div-tbody').querySelectorAll('input[type=checkbox]');
  vis.forEach(function(cb){ cb.checked=checked; });
  dividends.forEach(function(d){ checked ? _divSelected.add(d.id) : _divSelected.delete(d.id); });
  var b=el('div-del-sel-btn'); if(b) b.style.display=_divSelected.size>0?'inline-flex':'none';
}
function divToggleSel(id, checked){
  checked ? _divSelected.add(id) : _divSelected.delete(id);
  var b=el('div-del-sel-btn'); if(b) b.style.display=_divSelected.size>0?'inline-flex':'none';
}
function deleteSelectedDiv(){
  if(_divSelected.size===0) return;
  var count = _divSelected.size;
  if(typeof mwConfirm === 'function'){
    mwConfirm('Hapus Dividen Terpilih', 'Apakah Anda yakin ingin menghapus <strong>'+count+'</strong> catatan dividen terpilih?', function(){
      _divSelected.forEach(function(id){
        dividends = dividends.filter(function(d){return String(d.id)!==String(id) && d.id!==Number(id)});
        rdnMutations = rdnMutations.filter(function(r){return String(r.linkedTxId)!=='div-'+id && r.linkedTxId!=='div-'+String(id)});
      });
      _divSelected.clear();
      rebuildRdnBalance();
      saveData();
      showSaveStatus('✓ Dividen terpilih berhasil dihapus', 'var(--green)');
      renderDividen();
    });
  } else {
    _divSelected.forEach(function(id){
      dividends = dividends.filter(function(d){return String(d.id)!==String(id) && d.id!==Number(id)});
      rdnMutations = rdnMutations.filter(function(r){return String(r.linkedTxId)!=='div-'+id && r.linkedTxId!=='div-'+String(id)});
    });
    _divSelected.clear();
    rebuildRdnBalance();
    saveData();
    showSaveStatus('✓ Dividen terpilih berhasil dihapus', 'var(--green)');
    renderDividen();
  }
}
function clearAllDiv(){
  if(typeof mwConfirm === 'function'){
    mwConfirm('Hapus Semua Dividen', '⚠️ Apakah Anda yakin ingin menghapus <strong>SEMUA</strong> catatan dividen? Tindakan ini tidak dapat dibatalkan.', function(){
      var ids = dividends.map(function(d){return d.id});
      ids.forEach(function(id){
        rdnMutations = rdnMutations.filter(function(r){return String(r.linkedTxId)!=='div-'+id && r.linkedTxId!=='div-'+String(id)});
      });
      dividends = [];
      _divSelected.clear();
      rebuildRdnBalance();
      saveData();
      showSaveStatus('✓ Semua dividen berhasil dihapus', 'var(--green)');
      renderDividen();
    });
  } else {
    var ids = dividends.map(function(d){return d.id});
    ids.forEach(function(id){
      rdnMutations = rdnMutations.filter(function(r){return String(r.linkedTxId)!=='div-'+id && r.linkedTxId!=='div-'+String(id)});
    });
    dividends = [];
    _divSelected.clear();
    rebuildRdnBalance();
    saveData();
    showSaveStatus('✓ Semua dividen berhasil dihapus', 'var(--green)');
    renderDividen();
  }
}
function selectAllDiv(){
  var allChecked = _divSelected.size===dividends.length && dividends.length>0;
  divToggleAll(!allChecked);
  renderDividen();
}
function editDiv(id){
  var d = dividends.find(function(x){return x.id===id}); if(!d) return;
  var tkrOpts = Object.keys(DB).map(function(t){return '<option value="'+t+'"'+(t===d.ticker?' selected':'')+'>'+t+'</option>'}).join('');
  el('m-title').textContent='Edit Dividen — '+d.ticker;
  el('m-title').style.color='var(--green)';
  el('m-body').innerHTML=
    '<div class="fgrid">'+
      '<div class="fg"><label class="flabel">Tanggal</label><input class="finput" type="date" id="ed-date" value="'+(d.date||today())+'"></div>'+
      '<div class="fg"><label class="flabel">Ticker</label><select class="finput fsel" id="ed-ticker">'+tkrOpts+'</select></div>'+
      '<div class="fg"><label class="flabel">Lembar Saham</label><input class="finput" type="number" id="ed-shares" value="'+(d.shares||0)+'" oninput="edDivCalc()"></div>'+
      '<div class="fg"><label class="flabel">Dividen/Lembar (Rp)</label><input class="finput" type="number" id="ed-dps" value="'+(d.dps||0)+'" oninput="edDivCalc()"></div>'+
      '<div class="fg"><label class="flabel">PPh (%)</label><input class="finput" type="number" id="ed-pph-pct" value="10" min="0" max="100" step="0.1" oninput="edDivCalc()"></div>'+
    '</div>'+
    '<div class="taxbox">'+
      '<div class="taxrow"><span>Kotor</span><span class="mono" id="ed-gross">Rp 0</span></div>'+
      '<div class="taxrow"><span>PPh</span><span class="mono dn" id="ed-tax">-Rp 0</span></div>'+
      '<div class="taxrow tot"><span>Bersih</span><span class="mono up" id="ed-net">Rp 0</span></div>'+
    '</div>'+
    '<div style="margin-top:14px;display:flex;gap:8px;justify-content:flex-end">'+
      '<button class="btn btn-ghost" onclick="closeModal()">Batal</button>'+
      '<button class="btn btn-green" onclick="submitEditDiv('+id+')">💾 Simpan</button>'+
    '</div>';
  setTimeout(function(){ edDivCalc(); }, 50);
  el('modal').classList.add('on');
}
function edDivCalc(){
  var shares=parseFloat(el('ed-shares')&&el('ed-shares').value||0);
  var dps=parseFloat(el('ed-dps')&&el('ed-dps').value||0);
  var pct=parseFloat(el('ed-pph-pct')&&el('ed-pph-pct').value||10)/100;
  var gross=shares*dps; var tax=gross*pct; var net=gross-tax;
  if(el('ed-gross')) el('ed-gross').textContent='Rp '+fmt(gross);
  if(el('ed-tax'))   el('ed-tax').textContent='-Rp '+fmt(tax);
  if(el('ed-net'))   el('ed-net').textContent='Rp '+fmt(net);
}
function submitEditDiv(id){
  var date=el('ed-date').value; var ticker=el('ed-ticker').value;
  var shares=parseFloat(el('ed-shares').value||0); var dps=parseFloat(el('ed-dps').value||0);
  var pct=parseFloat(el('ed-pph-pct').value||10)/100;
  if(!date||!ticker||shares<=0) { alert('Lengkapi data!'); return; }
  var gross=shares*dps; var tax=gross*pct; var net=gross-tax;
  var idx = dividends.findIndex(function(d){return d.id===id}); if(idx===-1) return;
  // Update RDN linked
  rdnMutations = rdnMutations.filter(function(r){return r.linkedTxId!=='div-'+id});
  dividends[idx] = {id:id,date:date,ticker:ticker,shares:shares,dps:dps,gross:gross,tax:tax,net:net};
  addRdn(date,'DIVIDEN','Dividen '+ticker+' Rp '+fmt(dps)+'/lbr',net,'—','div-'+id);
  rebuildRdnBalance();
  saveData();
  showSaveStatus('✓ Dividen '+ticker+' diperbarui');
  closeModal(); renderDividen();
}

function renderSektoral(){
  var porto=getPortfolio();
  var totalMV=porto.reduce(function(a,p){return a+p.mv},0)||1;
  var totalCost=porto.reduce(function(a,p){return a+p.cost},0)||1;
  var byS={};
  porto.forEach(function(p){
    var s=p.info.sector;
    if(!byS[s])byS[s]={mv:0,cost:0,stocks:[]};
    byS[s].mv+=p.mv;byS[s].cost+=p.cost;byS[s].stocks.push(p);
  });
  var sectors=Object.keys(byS).sort(function(a,b){return byS[b].mv-byS[a].mv});
  var topSec=sectors[0]||'-';
  var secCnt=sectors.length;
  var divScore=Math.min(10,Math.round(secCnt*10/11+((secCnt>=5&&byS[topSec]&&byS[topSec].mv/totalMV<0.5)?2:0)));
  var concPct=byS[topSec]?(byS[topSec].mv/totalMV*100).toFixed(1):'0';

  el('sec-top').textContent=topSec;
  el('sec-top-pct').textContent=byS[topSec]?(byS[topSec].mv/totalMV*100).toFixed(1)+'% dari portofolio':'';
  el('sec-cnt').textContent=secCnt;
  el('sec-div-score').textContent=divScore+'/10';
  el('sec-div-score').className='mval '+(divScore>=6?'up':divScore>=4?'amb':'dn');
  el('sec-div-label').textContent=divScore>=7?'Sangat Terdiversifikasi':divScore>=5?'Cukup Terdiversifikasi':divScore>=3?'Perlu Diversifikasi':'Konsentrasi Tinggi';
  el('sec-conc').textContent=concPct+'%';
  el('sec-conc').className='mval '+(parseFloat(concPct)<=40?'up':parseFloat(concPct)<=60?'amb':'dn');
  el('sec-conc-sub').textContent=(topSec!=='-'?topSec:'')+ ' sektor teratas';

  // ── Return per sektor — sebelumnya halaman ini cuma menghitung ALOKASI
  // (berapa % portofolio di tiap sektor), bukan sektor mana yang benar-benar
  // menguntungkan/merugikan. sv.ret = unrealized return sektor itu sendiri;
  // sv.contrib = poin persentase sumbangan sektor itu ke TOTAL return
  // portofolio (unreal sektor ÷ total modal portofolio) — beda dari ret
  // karena memperhitungkan bobot, bukan cuma performa sektor itu sendiri. ──
  sectors.forEach(function(s){
    var sv=byS[s];
    sv.ret = sv.cost>0 ? ((sv.mv-sv.cost)/sv.cost*100) : 0;
    sv.contrib = ((sv.mv-sv.cost)/totalCost*100);
  });
  var bySRet = sectors.slice().sort(function(a,b){return byS[b].ret-byS[a].ret;});
  var bestSec = bySRet[0], worstSec = bySRet[bySRet.length-1];
  var byContrib = sectors.slice().sort(function(a,b){return Math.abs(byS[b].contrib)-Math.abs(byS[a].contrib);});
  var topContribSec = byContrib[0];

  if(sectors.length){
    el('sec-best').textContent=bestSec;
    el('sec-best-pct').innerHTML='<span class="up">'+(byS[bestSec].ret>=0?'+':'')+byS[bestSec].ret.toFixed(1)+'%</span> unrealized';
    el('sec-worst').textContent=worstSec;
    el('sec-worst-pct').innerHTML='<span class="dn">'+(byS[worstSec].ret>=0?'+':'')+byS[worstSec].ret.toFixed(1)+'%</span> unrealized';
    el('sec-contrib').textContent=topContribSec;
    el('sec-contrib-pct').innerHTML='<span class="'+(byS[topContribSec].contrib>=0?'up':'dn')+'">'+(byS[topContribSec].contrib>=0?'+':'')+byS[topContribSec].contrib.toFixed(1)+' poin%</span> dari total return';
  } else {
    el('sec-best').textContent='-'; el('sec-best-pct').textContent='';
    el('sec-worst').textContent='-'; el('sec-worst-pct').textContent='';
    el('sec-contrib').textContent='-'; el('sec-contrib-pct').textContent='';
  }

  el('sector-detail').innerHTML=sectors.map(function(s){
    var sv=byS[s];var alloc=(sv.mv/totalMV*100);
    var sInfo=IDX_SECTORS[s]||{color:sectorColor(s),icon:sectorIcon(s),desc:''};
    return '<div style="margin-bottom:12px">'
      +'<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:5px">'
        +'<div style="display:flex;align-items:center;gap:8px">'
          +'<span style="display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;font-size:13px;flex-shrink:0;filter:grayscale(1);opacity:.8">'+sInfo.icon+'</span>'
          +'<span class="sec-dot" style="background:'+sInfo.color+'"></span>'
          +'<span style="font-size:12px;font-weight:600">'+s+'</span>'
          +'<span class="badge '+(sv.ret>=0?'b-up':'b-dn')+'" style="font-size:9px">'+(sv.ret>=0?'+':'')+sv.ret.toFixed(1)+'%</span>'
        +'</div>'
        +'<span style="font-family:var(--font-mono);font-size:12px;font-weight:700;color:'+sInfo.color+'">'+alloc.toFixed(1)+'%</span>'
      +'</div>'
      +'<div class="prog" style="height:6px;border-radius:99px;overflow:hidden"><div class="progf" style="width:'+alloc+'%;background:'+sInfo.color+';border-radius:99px"></div></div>'
      +'<div style="font-size:10px;color:var(--text3);margin-top:3px">'+sv.stocks.length+' saham · Rp '+fmtK(sv.mv)+' · modal Rp '+fmtK(sv.cost)+'</div>'
    +'</div>';
  }).join('')||'<div style="color:var(--text3);text-align:center;padding:20px">Belum ada portofolio</div>';

  el('sector-stocks').innerHTML=sectors.map(function(s){
    var sv=byS[s];var sInfo=IDX_SECTORS[s]||{color:sectorColor(s),icon:sectorIcon(s),desc:''};
    return '<div style="margin-bottom:14px">'
      +'<div style="display:flex;align-items:center;gap:8px;margin-bottom:7px">'
        +'<span style="display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;font-size:13px;flex-shrink:0;filter:grayscale(1);opacity:.8">'+sInfo.icon+'</span>'
        +'<span class="sec-dot" style="background:'+sInfo.color+'"></span>'
        +'<span style="font-size:12px;font-weight:600">'+s+'</span>'
        +'<span class="badge b-gray" style="margin-left:auto">'+sInfo.desc+'</span>'
      +'</div>'
      +'<div style="display:flex;flex-wrap:wrap;gap:6px">'+sv.stocks.map(function(p){return '<div style="background:var(--bg3);border:1px solid var(--border);border-radius:7px;padding:7px 10px;min-width:120px"><div style="display:flex;justify-content:space-between;align-items:center"><div style="display:inline-flex;align-items:center;gap:5px">'+getStockLogoHtml(p.ticker, 16)+'<span class="tp" style="border-color:'+sInfo.color+'">'+p.ticker+'</span></div><span class="badge '+(p.ret>=0?'b-up':'b-dn')+'">'+(p.ret>=0?'+':'')+p.ret.toFixed(1)+'%</span></div><div style="font-size:10px;color:var(--text2);margin-top:3px">'+p.lot+' lot · Rp '+fmtK(p.mv)+'</div></div>'}).join('')+'</div>'
    +'</div>';
  }).join('')||'<div style="color:var(--text3);text-align:center;padding:20px">Belum ada portofolio</div>';

  buildSectorChart(porto);
}

// renderEquityHistory() lama DIHAPUS — digantikan perfRenderEquity() di
// js/21-performance.js (halaman Performance baru), yang menampilkan data
// equityHistory yang sama dengan tambahan filter periode + tabel riwayat.
// Pencatatan snapshot harian (equitySnapshotToday()) tetap dipanggil dari
// renderDashboard() supaya tidak bergantung user membuka halaman Performance.

function renderRisiko(){
  var porto=getPortfolio();
  var totalMV=porto.reduce(function(a,p){return a+p.mv},0)||1;
  var totalCost=porto.reduce(function(a,p){return a+p.cost},0)||1;

  // Beta portofolio (weighted) — ESTIMASI, dari nilai beta statis per saham di database
  var portoBeta=porto.reduce(function(a,p){return a+(p.info.beta||1)*(p.mv/totalMV)},0);
  var betaIsReal=false, betaCoverage=null;
  // FIX: kalau Beta RIIL (regresi harga sungguhan vs IHSG, dihitung di kartu
  // "Alpha & Beta Riil" halaman Performance) sudah tersedia, pakai itu untuk
  // SELURUH perhitungan di bawah (VaR/Sharpe/Risk Score/Stress Test) alih-alih
  // tetap terpaku ke nilai statis padahal data yang lebih akurat sudah ada.
  // Beta statis tetap dipakai sebagai fallback kalau data riil belum/tidak
  // bisa dihitung (mis. riwayat harga belum cukup panjang).
  if(typeof perfGetRealPortfolioBeta==='function'){
    var realBeta=perfGetRealPortfolioBeta();
    if(realBeta){ portoBeta=realBeta.beta; betaIsReal=true; betaCoverage=realBeta; }
  }
  // Volatilitas estimasi (simplified, annualized)
  var avgVol=porto.reduce(function(a,p){return a+(p.info.beta||1)*0.25*(p.mv/totalMV)},0);
  var portVolAnn=(avgVol*100).toFixed(1);
  // VaR 95% = 1.645 * vol * portfolio_value / sqrt(252)
  var dailyVol=avgVol/Math.sqrt(252);
  var var95=totalMV*dailyVol*1.645;
  var var99=totalMV*dailyVol*2.326;
  // Sharpe (simplified)
  var realPnl=getRealizedPnl();
  var unreal=porto.reduce(function(a,p){return a+p.unreal},0);
  var totalReturn=(realPnl+unreal)/totalCost;
  var rfRate=0.065; // Risk-free 6.5% (BI rate approx)
  var sharpe=((totalReturn-rfRate/252*transactions.length)/avgVol).toFixed(2);
  // Win rate
  var sells=transactions.filter(function(t){return t.type==='SELL'});
  var wins=0;var pos2={};
  transactions.slice().sort(function(a,b){return a.date.localeCompare(b.date)}).forEach(function(tx){
    if(!pos2[tx.ticker])pos2[tx.ticker]={lot:0,cost:0};
    var p=pos2[tx.ticker];
    if(tx.type==='BUY'){p.lot+=tx.lot;p.cost+=tx.net;}
    else if(tx.type==='SELL'&&p.lot>0){
      var avg = p.cost / (p.lot * 100);
      if(tx.price > avg) wins++;
      var soldShares = Math.min(p.lot, tx.lot) * 100;
      p.lot = Math.max(0, p.lot - tx.lot);
      p.cost = Math.max(0, p.cost - (avg * soldShares));
      if(p.lot <= 0) p.cost = 0;
    }
  });
  var winRate=sells.length>0?((wins/sells.length)*100).toFixed(1):0;
  // Max drawdown (simplified from unrealized)
  var worstRet=porto.reduce(function(a,p){return p.ret<a?p.ret:a},0);
  // Risk score (0-100)
  var riskScore=Math.min(100,Math.round(
    portoBeta*30 + (parseFloat(portVolAnn)/30)*20 +
    (porto.length<3?30:porto.length<5?15:0) +
    (parseFloat(var95)/totalMV*500)
  ));

  el('risk-score').textContent=riskScore;
  var riskLabel=riskScore>=70?'Risiko Tinggi':riskScore>=40?'Risiko Sedang':'Risiko Rendah';
  el('risk-score').className='mval lg '+(riskScore>=70?'dn':riskScore>=40?'amb':'up');
  el('risk-score-label').innerHTML='<span class="'+(riskScore>=70?'dn':riskScore>=40?'amb':'up')+'">'+riskLabel+'</span>';
  el('var-95').textContent='-Rp '+fmtK(var95);
  el('var-99').textContent='-Rp '+fmtK(var99);
  el('risk-sharpe').textContent=sharpe;
  el('risk-sharpe').className='mval '+(parseFloat(sharpe)>=1?'up':parseFloat(sharpe)>=0?'amb':'dn');
  el('risk-vol').textContent=portVolAnn+'%';
  el('risk-vol').className='mval '+(parseFloat(portVolAnn)<=15?'up':parseFloat(portVolAnn)<=25?'amb':'dn');
  el('risk-beta').textContent=portoBeta.toFixed(2);
  el('risk-beta').className='mval '+(portoBeta<=1?'up':portoBeta<=1.3?'amb':'dn');
  var betaSubEl=el('risk-beta-sub');
  if(betaSubEl){
    betaSubEl.innerHTML = betaIsReal
      ? '<span class="up">riil</span> · '+betaCoverage.n+'/'+betaCoverage.total+' saham (data harga sungguhan)'
      : 'estimasi · <a href="#" onclick="goPage(\'performance\');return false" style="color:var(--accent)">lihat Beta riil →</a>';
  }
  el('risk-dd').textContent=worstRet.toFixed(1)+'%';
  el('risk-win').textContent=winRate+'%';
  el('risk-win').className='mval '+(parseFloat(winRate)>=55?'up':parseFloat(winRate)>=40?'amb':'dn');
  el('risk-win-sub').textContent=wins+'/'+sells.length+' trade menang';

  // Risk per stock
  el('risk-per-stock').innerHTML=porto.map(function(p,i){
    var beta=p.info.beta||1;
    var weight=(p.mv/totalMV*100).toFixed(1);
    var vol=(beta*25).toFixed(1);
    var varStock=p.mv*beta*0.25/Math.sqrt(252)*1.645;
    var rLevel=beta>=1.3?'Tinggi':beta>=1.0?'Sedang':'Rendah';
    var rCls=beta>=1.3?'b-dn':beta>=1.0?'b-amb':'b-up';
    return '<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid var(--border)"><div style="display:flex;align-items:center;gap:8px"><div style="display:inline-flex;align-items:center;gap:6px">'+getStockLogoHtml(p.ticker, 18)+'<span class="tp" style="border-color:'+COLORS[i%12]+'">'+p.ticker+'</span></div><div><div style="font-size:10px;color:var(--text2);font-family:var(--font-mono)">β='+beta.toFixed(2)+' · Vol '+vol+'%/yr</div><div style="font-size:9px;color:var(--text3);font-family:var(--font-mono)">Bobot '+weight+'% · VaR95: -Rp '+fmtK(varStock)+'</div></div></div><span class="badge '+rCls+'">'+rLevel+'</span></div>';
  }).join('')||'<div style="color:var(--text3);text-align:center;padding:16px">Belum ada posisi</div>';

  // Stress test
  var scenarios=[
    {name:'Krisis 2008 (−50%)',shock:-0.50,color:'var(--red)'},
    {name:'COVID-19 (−30%)',shock:-0.30,color:'var(--coral)'},
    {name:'Koreksi Ringan (−15%)',shock:-0.15,color:'var(--amber)'},
    {name:'Stagnasi (−5%)',shock:-0.05,color:'var(--text2)'},
    {name:'Bull Market (+20%)',shock:+0.20,color:'var(--green)'},
  ];
  var stressBadge=el('stress-beta-src');
  if(stressBadge){
    stressBadge.textContent = betaIsReal ? 'Beta riil ('+betaCoverage.n+' saham)' : 'Beta estimasi';
    stressBadge.className = 'badge '+(betaIsReal?'b-up':'b-gray'); // style="font-size:9px" tetap dari atribut inline di HTML, tidak disentuh di sini
  }
  el('stress-test').innerHTML=scenarios.map(function(sc){
    var impact=totalMV*(sc.shock*portoBeta);
    var newVal=totalMV+impact;
    return '<div style="display:flex;justify-content:space-between;align-items:center;padding:7px 0;border-bottom:1px solid var(--border)"><div><div style="font-size:11px;font-weight:600">'+sc.name+'</div><div style="font-size:10px;color:var(--text3);font-family:var(--font-mono)">Nilai portofolio → Rp '+fmtK(newVal)+'</div></div><span style="font-family:var(--font-mono);font-size:12px;color:'+sc.color+';font-weight:600">'+(sc.shock>=0?'+':'')+fmt(Math.round(impact))+'</span></div>';
  }).join('');

  // Recommendations
  var recos=[];
  if(porto.length<5)recos.push({icon:'⚠️',text:'Diversifikasi lebih lanjut — portofolio Anda hanya '+porto.length+' saham. Ideal minimal 8−12 saham.',cls:'alert-warn'});
  if(portoBeta>1.2)recos.push({icon:'📊',text:'Beta tinggi ('+portoBeta.toFixed(2)+') — portofolio lebih volatile dari IHSG. Pertimbangkan tambah saham defensif.',cls:'alert-warn'});
  var byS2={};porto.forEach(function(p){byS2[p.info.sector]=(byS2[p.info.sector]||0)+p.mv});
  var secCnt2=Object.keys(byS2).length;
  if(secCnt2<4)recos.push({icon:'🔴',text:'Hanya '+secCnt2+' sektor — risiko sektoral tinggi. Tambah saham dari sektor berbeda.',cls:'alert-warn'});
  var maxSec=Object.values(byS2).reduce(function(a,b){return Math.max(a,b)},0);
  if(maxSec/totalMV>0.6)recos.push({icon:'⚡',text:'Satu sektor mendominasi >'+(maxSec/totalMV*100).toFixed(0)+'% portofolio. Rebalancing disarankan.',cls:'alert-warn'});
  if(parseFloat(sharpe)<0)recos.push({icon:'📉',text:'Sharpe Ratio negatif — return tidak sepadan dengan risiko yang diambil.',cls:'alert-warn'});
  if(recos.length===0)recos.push({icon:'✅',text:'Profil risiko portofolio dalam kondisi baik. Pertahankan strategi saat ini.',cls:'alert-ok'});

  el('risk-reco').innerHTML=recos.map(function(r){return '<div class="alert '+r.cls+'" style="margin-bottom:7px">'+r.icon+' '+r.text+'</div>'}).join('');

  buildRetDistChart(porto);
}

function renderPajak(){
  var printDateEl = el('pj-print-date');
  if(printDateEl) printDateEl.textContent = new Date().toLocaleDateString('id-ID',{day:'numeric',month:'long',year:'numeric',hour:'2-digit',minute:'2-digit'});
  // Info bar
  var infoBar = el('pj-info-bar');
  if(infoBar) infoBar.textContent = 'ℹ️ Tarif aktif: Komisi sesuai sekuritas · PPN '+
    (TAX_SETTINGS.ppn*100).toFixed(0)+'% × Komisi · Levy '+
    (TAX_SETTINGS.levy*100).toFixed(3)+'% (BEI+KPEI+KSEI) · PPh Final Jual '+
    (TAX_SETTINGS.pphJual*100).toFixed(1)+'% · PPh Dividen 10%';
  if(typeof renderSekTaxPanel==='function') renderSekTaxPanel();

  var pj = TAX_SETTINGS.pphJual*100;
  var buys  = transactions.filter(function(t){return t.type==='BUY'});
  var sells = transactions.filter(function(t){return t.type==='SELL'});
  var totalPphBeli = buys.reduce(function(a,t){return a+t.tax},0);
  var totalPphJual = sells.reduce(function(a,t){return a+t.tax},0);
  var totalPph  = totalPphBeli + totalPphJual;
  var totalDiv  = dividends.reduce(function(a,d){return a+d.tax},0);
  var totalKom  = transactions.reduce(function(a,t){return a+t.komisi},0);

  el('pj-pph-label').textContent = 'PPh Final Jual ('+pj.toFixed(1)+'%) + Levy+PPN';
  el('pj-pph').textContent = 'Rp '+fmtK(totalPph);
  el('pj-pph-sub').textContent = buys.length+' beli + '+sells.length+' jual';
  el('pj-div').textContent = 'Rp '+fmtK(totalDiv);
  el('pj-div-sub').textContent = dividends.length+' pembayaran';
  el('pj-kom').textContent = 'Rp '+fmtK(totalKom);
  el('pj-kom-sub').textContent = transactions.length+' transaksi';
  el('pj-tot').textContent = 'Rp '+fmtK(totalPph+totalDiv+totalKom);

  // Badge rate
  if(el('pj-pph-rate-badge')) el('pj-pph-rate-badge').textContent = 'PPh Jual '+pj.toFixed(1)+'% · Levy '+(TAX_SETTINGS.levy*100).toFixed(3)+'% · PPN '+(TAX_SETTINGS.ppn*100).toFixed(0)+'%';

  // By sekuritas
  var bySec={};
  transactions.forEach(function(tx){
    if(!bySec[tx.sekuritas])bySec[tx.sekuritas]={cnt:0,komisi:0,pph:0};
    bySec[tx.sekuritas].cnt++;bySec[tx.sekuritas].komisi+=tx.komisi;bySec[tx.sekuritas].pph+=tx.tax;
  });
  el('pj-by-sec').innerHTML=Object.entries(bySec).map(function(e){
    var s=e[0],d=e[1];var sInfo=SEKURITAS[s]||{buyFee:0.0015,sellFee:0.0025,color:'#4a5e82'};
    return '<div style="background:var(--bg3);border:1px solid var(--border);border-radius:8px;padding:10px;margin-bottom:8px">'+
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">'+
        '<span style="font-weight:600;font-size:12px;display:flex;align-items:center;gap:6px">'+
          '<span style="width:7px;height:7px;border-radius:50%;background:'+(sInfo.color||'#4a5e82')+';display:inline-block"></span>'+s+
        '</span><span class="badge b-gray">'+d.cnt+' tx</span></div>'+
      '<div class="taxrow"><span>Komisi</span><span class="mono amb">Rp '+fmtK(d.komisi)+'</span></div>'+
      '<div class="taxrow"><span>PPh (Beli+Jual)</span><span class="mono dn">Rp '+fmtK(d.pph)+'</span></div>'+
      '<div style="display:flex;gap:6px;margin-top:4px">'+
        '<span class="badge" style="font-size:9px;background:rgba(0,229,160,.1);color:var(--green)">Beli '+(sInfo.buyFee*100).toFixed(2)+'%</span>'+
        '<span class="badge" style="font-size:9px;background:rgba(255,61,90,.1);color:var(--red)">Jual '+(sInfo.sellFee*100).toFixed(2)+'%</span>'+
      '</div></div>';
  }).join('')||'<div style="color:var(--text3);text-align:center;padding:16px">Belum ada transaksi</div>';

  if(typeof renderCostDrag==='function') renderCostDrag();

  // Table ALL transactions (buy + sell)
  el('pj-tbody').innerHTML=transactions.slice().sort(function(a,b){return b.date.localeCompare(a.date)}).map(function(tx){
    var isBuy=tx.type==='BUY';
    return '<tr>'+
      '<td class="mono" style="color:var(--text2);font-size:11px">'+tx.date+'</td>'+
      '<td><span class="badge '+(isBuy?'b-up':'b-dn')+'">'+tx.type+'</span></td>'+
      '<td><div style="display:inline-flex;align-items:center;gap:6px">'+getStockLogoHtml(tx.ticker, 18)+'<span class="tp">'+tx.ticker+'</span></div></td>'+
      '<td style="font-size:11px;color:var(--text2)">'+tx.sekuritas+'</td>'+
      '<td class="mono">Rp '+fmtK(tx.gross)+'</td>'+
      '<td class="mono dn">Rp '+fmtK(tx.tax)+'</td>'+
      '<td class="mono amb">Rp '+fmtK(tx.komisi)+'</td>'+
      '<td class="mono" style="font-weight:600">Rp '+fmtK(tx.tax+tx.komisi)+'</td>'+
    '</tr>';
  }).join('')||'<tr><td colspan="8" style="text-align:center;color:var(--text3);padding:14px">Belum ada transaksi</td></tr>';

  // Tax settings UI populate — selalu sinkron dengan TAX_SETTINGS terkini
  var tpi = el('tax-ppn-input'), tli = el('tax-levy-input'), tji = el('tax-jual-input');
  if(tpi){ tpi.value=(TAX_SETTINGS.ppn*100).toFixed(0); }
  if(tli){ tli.value=(TAX_SETTINGS.levy*100).toFixed(3); } // display as persen: 0.043
  if(tji){ tji.value=(TAX_SETTINGS.pphJual*100).toFixed(2); }
  taxPreviewLive();

  // Simulator
  var simSec=el('sim-sec');
  if(simSec&&simSec.options.length===0){
    Object.keys(SEKURITAS).forEach(function(s){var o=document.createElement('option');o.value=s;o.textContent=s;simSec.appendChild(o)});
  }
  if(el('sim-sec')) el('sim-sec').onchange=el('sim-lot').oninput=el('sim-price').oninput=simCalcTax;
}

function simCalcTax(){
  var secName=el('sim-sec')&&el('sim-sec').value||'Stockbit';
  var lot=parseFloat(el('sim-lot')&&el('sim-lot').value)||0;
  var price=parseFloat(el('sim-price')&&el('sim-price').value)||0;
  var gross=lot*100*price;
  var cB=calcTxComponents(gross,true,secName);
  var cJ=calcTxComponents(gross,false,secName);
  if(el('s-gross'))       el('s-gross').textContent='Rp '+fmt(gross);
  if(el('s-pph-label'))   el('s-pph-label').textContent='PPh Final Jual ('+(TAX_SETTINGS.pphJual*100).toFixed(1)+'%)';
  if(el('s-pph'))         el('s-pph').textContent='-Rp '+fmt(cJ.pph);
  if(el('s-kom-label'))   el('s-kom-label').textContent='Komisi Jual ('+(cJ.komisiRate*100).toFixed(3)+'%) + PPN+Levy';
  if(el('s-kom'))         el('s-kom').textContent='-Rp '+fmt(cJ.komisi+cJ.ppn+cJ.levy);
  if(el('s-net'))         el('s-net').textContent='Rp '+fmt(cJ.net);
  if(el('s-buy'))         el('s-buy').textContent='Rp '+fmt(gross);
  if(el('s-pph-beli-label')) el('s-pph-beli-label').textContent='PPN+Levy Beli';
  if(el('s-pph-beli'))    el('s-pph-beli').textContent='-Rp '+fmt(cB.ppn+cB.levy);
  if(el('s-bkom-label'))  el('s-bkom-label').textContent='Komisi Beli ('+(cB.komisiRate*100).toFixed(3)+'%)';
  if(el('s-bkom'))        el('s-bkom').textContent='-Rp '+fmt(cB.komisi);
  if(el('s-btot'))        el('s-btot').textContent='Rp '+fmt(cB.net);
}

function taxPreviewLive(){
  var ppn  = parseFloat(el('tax-ppn-input')&&el('tax-ppn-input').value||TAX_SETTINGS.ppn*100)/100;
  var levy = parseFloat(el('tax-levy-input')&&el('tax-levy-input').value||TAX_SETTINGS.levy*100)/100;
  var j    = parseFloat(el('tax-jual-input')&&el('tax-jual-input').value||TAX_SETTINGS.pphJual*100)/100;
  if(el('tax-ppn-disp'))  el('tax-ppn-disp').textContent=(ppn*100).toFixed(0)+'%';
  if(el('tax-levy-disp')) el('tax-levy-disp').textContent=(levy*100).toFixed(3)+'%';
  if(el('tax-jual-disp')) el('tax-jual-disp').textContent=(j*100).toFixed(2)+'%';
  // Preview: 10 lot @ Rp 5.000, Stockbit fee (0.28% Beli & 0.18% Jual)
  var gross=10*100*5000;
  var cB = calcTxComponents(gross, true, 'Stockbit');
  var cJ = calcTxComponents(gross, false, 'Stockbit');
  if(el('tax-prev-beli')) el('tax-prev-beli').textContent='Rp '+fmt(cB.totalFee);
  if(el('tax-prev-jual')) el('tax-prev-jual').textContent='Rp '+fmt(cJ.totalFee);
  if(el('tax-prev-diff')) el('tax-prev-diff').textContent='Rp '+fmt(cB.totalFee + cJ.totalFee);
  simCalcTax();
}

function applyTaxPreset(ppn, pphJual, levy){
  if(ppn!==undefined)     TAX_SETTINGS.ppn=ppn;
  if(pphJual!==undefined) TAX_SETTINGS.pphJual=pphJual;
  if(levy!==undefined)    TAX_SETTINGS.levy=levy;
  var tpi=el('tax-ppn-input'), tli=el('tax-levy-input'), tji=el('tax-jual-input');
  if(tpi){tpi.value=(TAX_SETTINGS.ppn*100).toFixed(0);}
  if(tli){tli.value=(TAX_SETTINGS.levy*100).toFixed(3);}
  if(tji){tji.value=(TAX_SETTINGS.pphJual*100).toFixed(2);}
  taxPreviewLive();
  saveTaxSettings();
  saveData(); // FIX SINKRONISASI: kirim juga ke cloud — tanpa ini, login berikutnya menimpa balik dengan tarif lama
  showSaveStatus('✓ Preset pajak: PPN '+(TAX_SETTINGS.ppn*100).toFixed(0)+'% · Levy '+(TAX_SETTINGS.levy*100).toFixed(3)+'% · PPh Final Jual '+(TAX_SETTINGS.pphJual*100).toFixed(2)+'%');
}

function saveTaxFromUI(){
  var ppn  = parseFloat(el('tax-ppn-input').value||0)/100;
  var levy = parseFloat(el('tax-levy-input').value||0)/100;
  var j    = parseFloat(el('tax-jual-input').value||0)/100;
  TAX_SETTINGS.ppn=ppn; TAX_SETTINGS.levy=levy; TAX_SETTINGS.pphJual=j;
  saveTaxSettings();
  saveData(); // FIX SINKRONISASI: kirim juga ke cloud — tanpa ini, login berikutnya menimpa balik dengan tarif lama
  showSaveStatus('✓ Pajak disimpan: PPN '+(ppn*100).toFixed(0)+'% · Levy '+(levy*100).toFixed(3)+'% · PPh Jual '+(j*100).toFixed(2)+'%');
  renderPajak();
}

function openMarketSyncModal(){
  var porto = getPortfolio();
  var html = '<div class="modal-backdrop" id="market-sync-modal" style="position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.7);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px">'
    + '<div class="card" style="width:100%;max-width:550px;max-height:90vh;overflow-y:auto;background:var(--bg2);border:1px solid var(--border)">'
    + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">'
    + '<div class="ptitle" style="font-size:15px">⚙️ Sinkronisasi &amp; Penyesuaian Harga Pasar (IHSG &amp; Saham)</div>'
    + '<button class="btn btn-ghost btn-xs" onclick="document.getElementById(\'market-sync-modal\').remove()">✕</button>'
    + '</div>'
    + '<div style="font-size:12px;color:var(--text2);margin-bottom:14px">Jika data Yahoo Finance terlambat atau berbeda dari aplikasi sekuritas Anda (Stockbit, IPOT, Mandiri Sekuritas, dll), Anda dapat memperbarui level IHSG dan menyesuaikan harga pasar per saham secara manual di sini.</div>'
    
    + '<div style="background:rgba(255,255,255,0.02);border:1px solid var(--border);border-radius:8px;padding:12px;margin-bottom:14px">'
    + '<div style="font-weight:600;font-size:12px;margin-bottom:8px">Indeks Harga Saham Gabungan (IHSG)</div>'
    + '<div style="display:flex;gap:8px;align-items:center">'
    + '<div style="flex:1"><label style="font-size:10px;color:var(--text3)">Level IHSG Saat Ini</label><input type="number" step="0.01" id="sync-ihsg-input" value="'+(typeof ihsgCur !== 'undefined' ? ihsgCur : 6500)+'" class="finput mono" style="width:100%;padding:6px"></div>'
    + '<button class="btn btn-primary btn-sm" style="margin-top:16px" onclick="applyManualIhsg()">Set IHSG</button>'
    + '</div>'
    + '</div>'

    + '<div style="font-weight:600;font-size:12px;margin-bottom:8px">Harga Pasar Saham Portofolio (Cocokkan dengan Sekuritas)</div>'
    + '<div style="max-height:250px;overflow-y:auto;border:1px solid var(--border);border-radius:8px">'
    + '<table class="tbl" style="font-size:11px">'
    + '<thead><tr><th>Ticker</th><th>Modal / Avg</th><th>Harga Pasar (Rp)</th></tr></thead>'
    + '<tbody>'
    + (porto.length ? porto.map(function(p){
        var curP = p.price || (typeof prices !== 'undefined' && prices[p.ticker]) || 0;
        return '<tr>'
          + '<td><strong>'+p.ticker+'</strong><br><span style="font-size:10px;color:var(--text3)">'+(p.name||'')+'</span></td>'
          + '<td class="mono">Rp '+fmtK(p.avg)+'</td>'
          + '<td><input type="number" step="25" id="sync-p-'+p.ticker+'" value="'+curP+'" onchange="updateManualPrice(\''+p.ticker+'\', this.value)" class="finput mono" style="width:110px;padding:4px 6px"></td>'
          + '</tr>';
      }).join('') : '<tr><td colspan="3" style="text-align:center;color:var(--text3)">Belum ada saham di portofolio</td>')
    + '</tbody>'
    + '</table>'
    + '</div>'

    + '<div style="display:flex;justify-content:flex-end;gap:8px;margin-top:16px">'
    + '<button class="btn btn-ghost btn-sm" onclick="document.getElementById(\'market-sync-modal\').remove()">Tutup</button>'
    + '<button class="btn btn-primary btn-sm" onclick="location.reload()">Simpan &amp; Muat Ulang</button>'
    + '</div>'
    + '</div>'
    + '</div>';
  
  var div = document.createElement('div');
  div.innerHTML = html;
  document.body.appendChild(div);
}

function applyManualIhsg(){
  var val = parseFloat(document.getElementById('sync-ihsg-input').value);
  if(val > 0){
    if(typeof fhApplyIHSG === 'function'){
      fhApplyIHSG(val, val * 0.995, val * 0.99, val * 1.01, val * 0.98);
    } else {
      window.ihsgCur = val;
    }
    alert('Level IHSG berhasil diperbarui menjadi ' + val.toLocaleString('id-ID'));
  }
}

function updateManualPrice(ticker, val){
  var p = parseFloat(val);
  if(p > 0){
    if(typeof prices === 'undefined') window.prices = {};
    prices[ticker] = p;
    if(typeof _invalidatePortoCache === 'function') _invalidatePortoCache();
    if(typeof renderPortofolio === 'function') renderPortofolio();
  }
}

window.openMarketSyncModal = openMarketSyncModal;
window.applyManualIhsg = applyManualIhsg;
window.updateManualPrice = updateManualPrice;


