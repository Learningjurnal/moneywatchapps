// Helper bersama: id berikutnya yang AMAN untuk sebuah array {id,...} —
// selalu max(id yang ada)+1, tidak pernah dihitung dari JUMLAH baris
// (transactions.length+1 BUKAN jaminan lebih besar dari id maksimum kalau
// ada baris yang pernah dihapus/id tidak rapat) supaya id baru tidak pernah
// bentrok dengan id yang sudah ada — akar penyebab error "ON CONFLICT DO
// UPDATE command cannot affect row a second time" & realized P&L berubah
// sendiri (salah satu dari dua baris id-kembar dibuang saat sync).
function _maxIdPlus1(arr){ var m=0; (arr||[]).forEach(function(x){ if(x.id>m) m=x.id; }); return m+1; }

// ============================================================
// SUPABASE DATA SYNC
// ============================================================
// FIX KRITIS: PostgREST (Supabase) membatasi hasil `select()` ke default
// 1000 baris per request (db-max-rows) — TANPA error, cuma diam-diam
// terpotong. Trader aktif dengan >1000 transaksi (mis. 4441 baris hasil
// bulk import) sebelumnya hanya menarik ~1000 baris TERTUA (order by
// tanggal ascending) dari cloud, lalu berhenti. Efeknya: transaksi SELL
// yang menutup posisi (tanggal lebih baru, di luar 1000 baris pertama)
// tidak ikut termuat — saham yang sebenarnya sudah terjual habis
// (UNTR/ASII/TLKM/dst) muncul lagi seolah masih posisi terbuka, PADAHAL
// cloud-nya sendiri sudah benar (terverifikasi lewat SQL count). Ini juga
// diam-diam memotong rdn_mutations (1 baris per transaksi BUY/SELL —
// pasti >1000 untuk trader aktif). Sekarang: ambil per halaman 1000 baris
// sampai habis, bukan sekali select() saja.
async function _supaFetchAllPages(table, uid, orderCol){
  var PAGE = 1000, all = [], from = 0;
  while(true){
    var res = await _supabase.from(table).select('*').eq('user_id', uid).order(orderCol, {ascending:true}).range(from, from+PAGE-1);
    if(res.error) throw new Error('Ambil '+table+' gagal: '+res.error.message);
    var batch = res.data || [];
    all = all.concat(batch);
    if(batch.length < PAGE) break; // halaman terakhir (kurang dari PAGE = tidak ada lagi)
    from += PAGE;
  }
  return all;
}

async function _supaReplaceTable(table, uid, rows, idCol){
  // Upsert dulu, baru hapus baris yang sudah tidak ada lokal — BUKAN
  // delete-lalu-insert. Kalau delete jalan duluan dan insert berikutnya gagal
  // (network putus, RLS, kolom mismatch, dll), baris di cloud sudah terlanjur
  // hilang tanpa penggantinya, dan device lain yang login berikutnya akan
  // menarik tabel kosong itu — persis gejala "data hilang saat pindah device".
  // Dengan upsert dulu, kegagalan di tengah jalan tidak pernah menghapus data
  // yang belum berhasil digantikan.
  idCol = idCol || 'tx_id';
  if(rows && rows.length > 0){
    // FIX: Postgres menolak SELURUH upsert ("ON CONFLICT DO UPDATE command
    // cannot affect row a second time") kalau satu batch berisi >1 baris
    // dengan id yang sama — apapun penyebabnya di sisi lokal (id generator
    // yang pernah drift, dsb), ini dulu memblokir SEMUA sync berikutnya
    // (termasuk perubahan kecil seperti Strategi per Emiten, karena satu
    // fungsi sync yang sama menangani semuanya). Dedup di sini menutup
    // masalahnya secara permanen, apapun akar penyebabnya — simpan baris
    // TERAKHIR untuk tiap id (dianggap versi paling baru/lengkap).
    var seenIdx = {};
    rows.forEach(function(r, i){ seenIdx[r[idCol]] = i; });
    var dupCount = rows.length - Object.keys(seenIdx).length;
    if(dupCount > 0){
      // JANGAN diam-diam saja — kalau dua baris beda (bukan duplikat asli)
      // kebetulan punya id sama, salah satunya akan hilang di sini. User
      // harus tahu supaya bisa cek & tidak mengira datanya utuh padahal
      // sudah berkurang.
      console.warn(dupCount+' baris duplikat (id sama) di '+table+' dibuang sebelum sync ke cloud.');
      if(typeof showSaveStatus==='function') showSaveStatus('⚠ '+dupCount+' baris '+table+' punya ID sama — salah satunya digabung/dibuang saat sync. Cek datanya kalau ada yang hilang.', 'var(--amber)', true);
      rows = Object.keys(seenIdx).map(function(k){ return rows[seenIdx[k]]; });
    }
    var insRes = await _supabase.from(table).upsert(rows, {onConflict:'user_id,'+idCol});
    if(insRes.error && /no unique or exclusion constraint|there is no unique/i.test(insRes.error.message||'')){
      // Migrasi unique-constraint (lihat sql/schema_migration.sql) belum
      // dijalankan di Supabase — fallback ke cara lama (delete-lalu-insert)
      // supaya sync tetap jalan, sambil kasih peringatan di UI.
      window._schemaOutdated = true;
      if(typeof updateSchemaWarnBanner==='function') updateSchemaWarnBanner();
      console.warn('Unique constraint untuk '+table+' belum ada. Jalankan sql/schema_migration.sql agar sync lebih aman terhadap kegagalan parsial.');
      var delFallback = await _supabase.from(table).delete().eq('user_id', uid);
      if(delFallback.error) throw new Error('Delete '+table+' failed: '+delFallback.error.message);
      var insFallback = await _supabase.from(table).insert(rows);
      if(insFallback.error) throw new Error('Insert '+table+' failed: '+insFallback.error.message);
      return;
    }
    if(insRes.error) throw new Error('Simpan '+table+' gagal (data cloud lama TIDAK diubah): '+insRes.error.message);
    // FIX: sebelumnya bikin filter "NOT IN (id1,id2,...,idN)" berisi SEMUA id
    // yang mau disimpan langsung di URL request — untuk trader aktif dengan
    // ribuan baris (mis. 4441 transaksi), ini bisa menghasilkan query string
    // puluhan KB yang gampang kepotong/gagal di batas panjang URL server.
    // Sekarang: ambil id yang SEKARANG ada di cloud (paginated, aman untuk
    // jumlah besar), hitung selisihnya di JS (biasanya kecil/kosong), lalu
    // hapus HANYA id yang stale itu, dikirim berkelompok kecil.
    var keepIds = rows.map(function(r){ return r[idCol]; });
    var keepSet = {}; keepIds.forEach(function(id){ keepSet[id]=1; });
    var existingRows = await _supaFetchAllPages(table, uid, idCol);
    var staleIds = existingRows.map(function(r){ return r[idCol]; }).filter(function(id){ return !keepSet[id]; });
    if(staleIds.length>0){
      var CHUNK=200;
      for(var ci=0; ci<staleIds.length; ci+=CHUNK){
        var chunk = staleIds.slice(ci, ci+CHUNK);
        var delRes = await _supabase.from(table).delete().eq('user_id', uid).in(idCol, chunk);
        if(delRes.error){ console.warn('Bersihkan baris lama di '+table+' gagal (data baru aman tersimpan, hanya ada baris usang tersisa):', delRes.error.message); break; }
      }
    }
  } else {
    var delAllRes = await _supabase.from(table).delete().eq('user_id', uid);
    if(delAllRes.error) throw new Error('Hapus '+table+' gagal: '+delAllRes.error.message);
  }
}

async function supaSaveAllData(){
  if(!_currentUser) return;
  var uid = _currentUser.id;
  try {
    // Field inti — sudah ada sejak skema awal, selalu aman dikirim.
    // Tambahkan fallback _cloud_sync_backup ke dalam cash_accounts (JSONB)
    // agar data Wealth, Strategi, dan Override Pajak 100% TERSIMPAN KE CLOUD
    // meskipun kolom-kolom baru di Supabase belum sempat dimigrasi!
    var currentWealth = (typeof WEALTH!=='undefined') ? WEALTH : null;
    var adminMetaWithWealth = Object.assign({}, (typeof ADMIN_META!=='undefined' ? ADMIN_META : {}));
    if(currentWealth) adminMetaWithWealth._wealth = currentWealth;
    
    var cloudSyncBackup = {
      wealth: currentWealth,
      trade_strategy: tradeStrategy || {},
      sek_tax_override: sekTaxOverride || {},
      admin_meta: adminMetaWithWealth,
      admin_extra: (typeof ADMIN_EXTRA !== 'undefined') ? ADMIN_EXTRA : [],
      idx_universe: (typeof IDX_UNIVERSE !== 'undefined') ? IDX_UNIVERSE : null,
      idx_universe_info: (typeof IDX_UNIVERSE_INFO !== 'undefined') ? IDX_UNIVERSE_INFO : null,
      saved_at: new Date().toISOString()
    };
    
    var cashAccountsWithBackup = Object.assign({}, CASH_ACCOUNTS, {_cloud_sync_backup: cloudSyncBackup});
    var coreFields = {
      user_id: uid,
      active_sekuritas: activeSekuritas,
      rdn_balance: rdnBalance,
      cash_accounts: cashAccountsWithBackup,
      tax_cfg: TAX_SETTINGS,
      next_tx_id: nextTxId,
      next_div_id: nextDivId,
      next_rdn_id: nextRdnId,
      next_crypto_id: nextCryptoId||1,
      next_etf_id: nextEtfId||1,
      next_rd_id: nextRdId||1,
      updated_at: new Date().toISOString()
    };

    // Field native di tabel user_settings (membutuhkan sql/schema_migration.sql)
    var newFields = {
      sek_tax_override: sekTaxOverride||{},
      trade_strategy: tradeStrategy||{},
      schema_version: SCHEMA_VERSION,
      idx_universe: (typeof IDX_UNIVERSE!=='undefined') ? IDX_UNIVERSE : null,
      idx_universe_info: (typeof IDX_UNIVERSE_INFO!=='undefined') ? IDX_UNIVERSE_INFO : null,
      admin_meta: adminMetaWithWealth,
      admin_extra: (typeof ADMIN_EXTRA!=='undefined') ? ADMIN_EXTRA : [],
      wealth: currentWealth
    };
    var settingsRes = await _supabase.from('user_settings').upsert(Object.assign({}, coreFields, newFields), {onConflict:'user_id'});
    if(settingsRes.error && /column .* does not exist|could not find the .* column/i.test(settingsRes.error.message||'')){
      // Migrasi native kolom belum dijalankan di Supabase — simpan ke coreFields
      // (yang sudah berisi _cloud_sync_backup lengkap sehingga data 100% aman).
      window._schemaOutdated = true;
      if(typeof updateSchemaWarnBanner==='function') updateSchemaWarnBanner();
      console.warn('Skema Supabase belum diperbarui. Data disimpan aman via cloud backup bundle. Jalankan sql/schema_migration.sql untuk optimasi native.');
      settingsRes = await _supabase.from('user_settings').upsert(coreFields, {onConflict:'user_id'});
    } else if(!settingsRes.error){
      window._schemaOutdated = false;
      if(typeof updateSchemaWarnBanner==='function') updateSchemaWarnBanner();
    }
    if(settingsRes.error) throw new Error('Upsert user_settings failed: '+settingsRes.error.message);

    // ── PENTING: mapping di bawah ini HARUS cocok dengan nama field asli yang
    // dipakai engine (03-engine.js/05-assets.js), BUKAN nama kolom Supabase.
    // Versi sebelumnya salah total (mis. t.action/t.commission padahal field
    // aslinya t.type/t.komisi) — hasilnya transaksi yang ditarik lagi dari
    // cloud punya action=undefined, sehingga filter BUY/SELL di seluruh
    // dashboard gagal cocok dan totalnya kelihatan 0, sementara Riwayat
    // Transaksi menampilkan "undefined" & "NaN". Ini penyebab data yang
    // "muncul lalu hilang" di dashboard utama.
    await _supaReplaceTable('transactions', uid,
      (transactions&&transactions.length>0) ? transactions.map(function(t){return {user_id:uid,tx_id:t.id,date:t.date,action:t.type,ticker:t.ticker,sekuritas:t.sekuritas,lot:t.lot,shares:t.lot*100,price:t.price,gross:t.gross,commission:t.komisi,tax:t.tax,net:t.net,pl:0};}) : null, 'tx_id');

    await _supaReplaceTable('dividends', uid,
      (dividends&&dividends.length>0) ? dividends.map(function(d){return {user_id:uid,div_id:d.id,date:d.date,ticker:d.ticker,shares:d.shares,dps:d.dps,gross:d.gross,pph:d.tax,net:d.net,yield:0};}) : null, 'div_id');

    try {
      await _supaReplaceTable('rdn_mutations', uid,
        (rdnMutations&&rdnMutations.length>0) ? rdnMutations.map(function(r){return {user_id:uid,rdn_id:r.id,date:r.date,type:r.type,description:r.ket||'',amount_in:r.amount>0?r.amount:0,amount_out:r.amount<0?-r.amount:0,balance:r.balance||0,linked_tx_id:r.linkedTxId!=null?String(r.linkedTxId):null};}) : null, 'rdn_id');
    } catch(rdnErr) {
      // PostgREST tidak selalu pakai pesan Postgres native "column X does not
      // exist" — kadang "Could not find the 'X' column of 'Y' in the schema
      // cache" (yang persis ini terjadi pada linked_tx_id sebelum migrasi
      // dijalankan). Cocokkan kedua pola supaya fallback benar-benar kepicu.
      if(/column .* does not exist|could not find the .* column/i.test(rdnErr.message||'')){
        // Migrasi linked_tx_id (lihat sql/schema_migration.sql) belum
        // dijalankan — simpan tanpa kolom itu dulu supaya mutasi RDN inti
        // tetap tersinkron. Kelemahannya: hapus transaksi tidak akan ikut
        // menghapus mutasi RDN terkait di device lain sampai migrasi jalan.
        window._schemaOutdated = true;
        if(typeof updateSchemaWarnBanner==='function') updateSchemaWarnBanner();
        await _supaReplaceTable('rdn_mutations', uid,
          (rdnMutations&&rdnMutations.length>0) ? rdnMutations.map(function(r){return {user_id:uid,rdn_id:r.id,date:r.date,type:r.type,description:r.ket||'',amount_in:r.amount>0?r.amount:0,amount_out:r.amount<0?-r.amount:0,balance:r.balance||0};}) : null, 'rdn_id');
      } else { throw rdnErr; }
    }

    await _supaReplaceTable('crypto_tx', uid,
      (cryptoTx&&cryptoTx.length>0) ? cryptoTx.map(function(c){return {user_id:uid,tx_id:c.id,date:c.date,action:c.type,coin:c.coin,amount:c.qty,price_idr:c.priceIdr||0,total_idr:c.total||0,pl:0};}) : null, 'tx_id');

    await _supaReplaceTable('etf_tx', uid,
      (etfTx&&etfTx.length>0) ? etfTx.map(function(e){return {user_id:uid,tx_id:e.id,date:e.date,action:e.type,ticker:e.ticker,shares:e.shares,price_usd:e.priceUSD||0,total_usd:e.totalUSD||0,total_idr:e.totalIdr||0,kurs:e.kurs||0,pl_idr:0};}) : null, 'tx_id');

    var rdU=(rdTx||[]).filter(function(r){return r._userInput===true;});
    await _supaReplaceTable('rd_tx', uid,
      rdU.length>0 ? rdU.map(function(r){return {user_id:uid,tx_id:r.id,date:r.date,action:r.type,name:r.code||'',platform:'',units:r.units||0,nav:r.nab||0,total_idr:r.amount||0,pl:0};}) : null, 'tx_id');

    var diPayload = {user_id:uid,data:divInvestData||[],next_id:_divInvestId||1,updated_at:new Date().toISOString()};
    var diRes = await _supabase.from('div_invest').upsert(diPayload, {onConflict:'user_id'});
    if(diRes.error && /no unique or exclusion constraint|there is no unique/i.test(diRes.error.message||'')){
      // Tabel div_invest belum punya unique constraint di user_id (lihat
      // sql/schema_migration.sql) — upsert dengan onConflict gagal. Fallback:
      // update kalau baris sudah ada, insert kalau belum. Fitur Div. Investing
      // ini sekunder, jadi kegagalannya TIDAK menghentikan sync data inti
      // (saham/dividen/RDN/dst di atas sudah tersimpan duluan).
      window._schemaOutdated = true;
      if(typeof updateSchemaWarnBanner==='function') updateSchemaWarnBanner();
      var existing = await _supabase.from('div_invest').select('user_id').eq('user_id', uid).maybeSingle();
      diRes = existing.data
        ? await _supabase.from('div_invest').update(diPayload).eq('user_id', uid)
        : await _supabase.from('div_invest').insert(diPayload);
    }
    if(diRes.error) console.warn('Sync div_invest gagal (fitur Div. Investing saja, data inti tetap aman):', diRes.error.message);
  } catch(err){ console.warn('Supabase save error:',err); throw err; }
}

async function supaLoadAllData(){
  if(!_currentUser) return false;
  var uid=_currentUser.id;
  try {
    var sRes=await _supabase.from('user_settings').select('*').eq('user_id',uid).maybeSingle();
    if(sRes.data){
      var s=sRes.data;
      var backupBundle = (s.cash_accounts && s.cash_accounts._cloud_sync_backup) || {};
      
      activeSekuritas=s.active_sekuritas||'Stockbit';
      rdnBalance=s.rdn_balance||0;
      if(s.cash_accounts) {
        var cleanCash = Object.assign({}, s.cash_accounts);
        delete cleanCash._cloud_sync_backup;
        Object.assign(CASH_ACCOUNTS, cleanCash);
      }
      if(s.tax_cfg){Object.assign(TAX_SETTINGS,s.tax_cfg);if(typeof saveTaxSettings==='function')saveTaxSettings();}
      
      // Load Tax Override & Trade Strategy (prioritas kolom native, fallback backupBundle)
      if(s.sek_tax_override && Object.keys(s.sek_tax_override).length > 0){
        sekTaxOverride=s.sek_tax_override;
      } else if(backupBundle.sek_tax_override && Object.keys(backupBundle.sek_tax_override).length > 0){
        sekTaxOverride=backupBundle.sek_tax_override;
      }
      
      if(s.trade_strategy && Object.keys(s.trade_strategy).length > 0){
        tradeStrategy=s.trade_strategy;
      } else if(backupBundle.trade_strategy && Object.keys(backupBundle.trade_strategy).length > 0){
        tradeStrategy=backupBundle.trade_strategy;
      }
      
      nextTxId=s.next_tx_id||1;nextDivId=s.next_div_id||1;nextRdnId=s.next_rdn_id||1;nextCryptoId=s.next_crypto_id||1;nextEtfId=s.next_etf_id||1;nextRdId=s.next_rd_id||1;
      
      // Muat data Wealth (Bank, Piutang, Hutang, Emas, dll) dari user_settings (kolom wealth, admin_meta._wealth, atau backupBundle.wealth)
      if(typeof WEALTH!=='undefined'){
        var cloudWealth = s.wealth || (s.admin_meta && s.admin_meta._wealth) || backupBundle.wealth;
        if(cloudWealth && typeof cloudWealth==='object'){
          Object.keys(WEALTH).forEach(function(k){ if(cloudWealth[k]!==undefined) WEALTH[k]=cloudWealth[k]; });
          if(typeof wUpdateDueBadge==='function') wUpdateDueBadge();
          try{ localStorage.setItem('mw_wealth_v1', JSON.stringify(WEALTH)); }catch(e){}
        }
      }

      // schema_version eksplisit lebih rendah dari yang diharapkan = belum migrasi native.
      if(typeof s.schema_version==='number' && s.schema_version < SCHEMA_VERSION){
        window._schemaOutdated = true;
        if(typeof updateSchemaWarnBanner==='function') updateSchemaWarnBanner();
      } else if(s.schema_version === SCHEMA_VERSION){
        window._schemaOutdated = false;
        if(typeof updateSchemaWarnBanner==='function') updateSchemaWarnBanner();
      }
      // Daftar Saham (import Excel IDX + override Admin Panel) — samakan dengan perangkat lain
      try{
        var univData = s.idx_universe || backupBundle.idx_universe;
        var univInfo = s.idx_universe_info || backupBundle.idx_universe_info;
        var adminM = s.admin_meta || backupBundle.admin_meta;
        var adminE = s.admin_extra || backupBundle.admin_extra;
        var univChanged = (univData && typeof idxApplyFromCloud==='function') ? idxApplyFromCloud(univData, univInfo) : false;
        var adminChanged = (typeof adminApplyFromCloud==='function') ? adminApplyFromCloud(adminM, adminE) : false;
        if((univChanged || adminChanged) && typeof rdRebuildFromReal==='function'){
          if(typeof _scBaseCache!=='undefined') _scBaseCache=null;
          if(typeof QT!=='undefined') QT.scData=[];
          if(typeof RD_META!=='undefined') RD_META.universeLoaded=false;
          rdRebuildFromReal();
          if(typeof rdLoadUniverse==='function') rdLoadUniverse(true);
        }
      }catch(e){ console.warn('Sinkronisasi Daftar Saham dari cloud gagal:', e); }
    }
    // ── Sama seperti di supaSaveAllData: petakan balik nama kolom cloud ke properti engine.
    // Reset variabel ke array yang ditarik dari cloud agar konsisten 100% saat pindah device.
    var txData=await _supaFetchAllPages('transactions', uid, 'date');
    transactions=txData.map(function(t){return {id:t.tx_id,date:t.date,type:t.action,ticker:t.ticker,sekuritas:t.sekuritas,lot:t.lot,price:t.price,gross:t.gross,komisi:t.commission,ppn:0,levy:0,pph:0,tax:t.tax,net:t.net};});
    
    var divData=await _supaFetchAllPages('dividends', uid, 'date');
    dividends=divData.map(function(d){return {id:d.div_id,date:d.date,ticker:d.ticker,shares:d.shares,dps:d.dps,gross:d.gross,tax:d.pph,net:d.net};});
    
    var rdnData=await _supaFetchAllPages('rdn_mutations', uid, 'date');
    rdnMutations=rdnData.map(function(r){return {id:r.rdn_id,date:r.date,type:r.type,ket:r.description||'',amount:(r.amount_in||0)-(r.amount_out||0),balance:r.balance||0,linkedTxId:r.linked_tx_id||null,sekuritas:''};});
    if(typeof rebuildRdnBalance==='function') rebuildRdnBalance();

    var cData=await _supaFetchAllPages('crypto_tx', uid, 'date');
    cryptoTx=cData.map(function(c){return {id:c.tx_id,date:c.date,type:c.action,coin:c.coin,qty:c.amount,priceIdr:c.price_idr,total:c.total_idr};});
    
    var eData=await _supaFetchAllPages('etf_tx', uid, 'date');
    etfTx=eData.map(function(e){return {id:e.tx_id,date:e.date,type:e.action,ticker:e.ticker,shares:e.shares,priceUSD:e.price_usd,totalUSD:e.total_usd,totalIdr:e.total_idr,kurs:e.kurs};});
    
    var rData=await _supaFetchAllPages('rd_tx', uid, 'date');
    rdTx=rData.map(function(r){return {id:r.tx_id,date:r.date,type:r.action,code:r.name,amount:r.total_idr,nab:r.nav,units:r.units,_userInput:true};});
    
    var diRes=await _supabase.from('div_invest').select('*').eq('user_id',uid).maybeSingle();
    if(diRes.data){divInvestData=diRes.data.data||[];_divInvestId=diRes.data.next_id||1;}
    
    nextTxId  = Math.max(nextTxId,  _maxIdPlus1(transactions));
    nextDivId = Math.max(nextDivId, _maxIdPlus1(dividends));
    nextRdnId = Math.max(nextRdnId, _maxIdPlus1(rdnMutations));
    nextCryptoId = Math.max(nextCryptoId, _maxIdPlus1(cryptoTx));
    nextEtfId    = Math.max(nextEtfId,    _maxIdPlus1(etfTx));
    nextRdId     = Math.max(nextRdId,     _maxIdPlus1(rdTx));

    // Simpan snapshot cloud yang baru dimuat ke localStorage device ini
    try {
      var syncPayload = {
        transactions: transactions,
        dividends: dividends,
        rdnMutations: rdnMutations,
        activeSekuritas: activeSekuritas,
        rdnBalance: rdnBalance,
        nextTxId: nextTxId,
        nextDivId: nextDivId,
        nextRdnId: nextRdnId,
        cryptoTx: cryptoTx,
        etfTx: etfTx,
        rdTx: rdTx,
        nextCryptoId: nextCryptoId,
        nextEtfId: nextEtfId,
        nextRdId: nextRdId,
        tradeStrategy: tradeStrategy,
        sekTaxOverride: sekTaxOverride,
        wealth: (typeof WEALTH!=='undefined') ? WEALTH : null,
        savedAt: new Date().toISOString()
      };
      localStorage.setItem(LS_KEY, JSON.stringify(syncPayload));
      try{ localStorage.setItem(LS_PENDING_KEY,'0'); }catch(e){}
    } catch(e){}

    return true;
  } catch(err){ console.warn('Supabase load error:',err); return false; }
}

function loadDataFromLocalStorage(){
  try{
    var raw=localStorage.getItem(LS_KEY);
    if(!raw){
      loadSample();
      saveData();
      return true;
    }
    var d=JSON.parse(raw);
    if(!d){
      loadSample();
      saveData();
      return true;
    }
    transactions=d.transactions||[];dividends=d.dividends||[];rdnMutations=d.rdnMutations||[];activeSekuritas=d.activeSekuritas||'Stockbit';rdnBalance=d.rdnBalance||0;
    cryptoTx=d.cryptoTx||[];etfTx=d.etfTx||[];rdTx=(d.rdTx||[]).filter(function(tx){return tx._userInput===true;});
    tradeStrategy=d.tradeStrategy||{};sekTaxOverride=d.sekTaxOverride||{};
    if(d.wealth && typeof WEALTH!=='undefined'){
      Object.keys(WEALTH).forEach(function(k){ if(d.wealth[k]!==undefined) WEALTH[k]=d.wealth[k]; });
      if(typeof wUpdateDueBadge==='function') wUpdateDueBadge();
    }
    nextTxId=Math.max(d.nextTxId||0, _maxIdPlus1(transactions));
    nextDivId=Math.max(d.nextDivId||0, _maxIdPlus1(dividends));
    nextRdnId=Math.max(d.nextRdnId||0, _maxIdPlus1(rdnMutations));
    nextCryptoId=Math.max(d.nextCryptoId||0, _maxIdPlus1(cryptoTx));
    nextEtfId=Math.max(d.nextEtfId||0, _maxIdPlus1(etfTx));
    nextRdId=Math.max(d.nextRdId||0, _maxIdPlus1(rdTx));
    return true;
  }catch(e){
    loadSample();
    saveData();
    return true;
  }
}

// ============================================================
// LOCALSTORAGE — PERSISTENSI DATA
// ============================================================
var LS_KEY = 'ihsg_pro_v7_clean';

var LS_PENDING_KEY = 'ihsg_sync_pending';

var tradeStrategy = {};
var _cloudSyncFailed = false; // dipakai buat nahan banner peringatan sampai sync berikutnya sukses
function saveData(){
  if(typeof _invalidatePortoCache==='function') _invalidatePortoCache();
  try {
    var payload={
      transactions:transactions,
      dividends:dividends,
      rdnMutations:rdnMutations,
      activeSekuritas:activeSekuritas,
      rdnBalance:rdnBalance,
      nextTxId:nextTxId,
      nextDivId:nextDivId,
      nextRdnId:nextRdnId,
      cryptoTx:cryptoTx,
      etfTx:etfTx,
      rdTx:rdTx,
      nextCryptoId:nextCryptoId,
      nextEtfId:nextEtfId,
      nextRdId:nextRdId,
      tradeStrategy:tradeStrategy,
      sekTaxOverride:sekTaxOverride,
      wealth:(typeof WEALTH!=='undefined') ? WEALTH : null,
      savedAt:new Date().toISOString()
    };
    localStorage.setItem(LS_KEY, JSON.stringify(payload));
  } catch(e){}
  if(_currentUser){
    // Tandai "ada perubahan lokal belum terkonfirmasi ke cloud" SEBELUM
    // request sync dikirim. Kalau user refresh/tutup app sebelum sync
    // selesai, penanda ini masih ada di localStorage saat boot berikutnya —
    // supaya boot tahu TIDAK BOLEH menimpa data lokal dari cloud (yang
    // mungkin masih versi lama), harus push dulu. Tanpa ini, refresh cepat
    // setelah input data bisa bikin data baru hilang tertimpa cloud lama.
    try{ localStorage.setItem(LS_PENDING_KEY,'1'); }catch(e){}
    _syncToCloud(true);
  } else {
    // Tidak ada sesi login aktif — data HANYA di localStorage device ini.
    // Ini persis skenario yang bikin data "hilang" di device lain, jadi
    // harus kelihatan jelas, bukan cuma diam di console.
    _cloudSyncFailed = true;
    if(typeof showSaveStatus==='function') showSaveStatus('⚠ Belum login — data hanya tersimpan di device ini, TIDAK ke cloud', 'var(--red)', true);
  }
}

// FIX: dua panggilan _syncToCloud() yang tumpang tindih (mis. "Hapus Semua"
// lalu langsung "Upload Excel" dalam hitungan detik) sebelumnya bisa jalan
// BERSAMAAN — dua request delete/upsert ke tabel yang sama, dan yang
// SELESAI BELAKANGAN menang secara acak, bukan yang datanya paling baru.
// Ini persis skenario yang bikin data hasil upload tertimpa balik oleh
// delete-semua dari langkah sebelumnya. Sekarang di-serialize: kalau ada
// sync yang sedang berjalan, panggilan baru cuma ditandai "antre" dan akan
// otomatis dikirim ulang begitu yang sedang jalan selesai — dengan data
// TERBARU (bukan snapshot lama), karena supaSaveAllData() selalu baca
// variabel global saat itu juga, bukan parameter yang di-capture di awal.
var _syncInFlight = false;
var _syncQueued = false;
function _syncToCloud(allowRetry){
  if(_syncInFlight){
    _syncQueued = true;
    return Promise.resolve();
  }
  _syncInFlight = true;
  // PENTING: harus `return` promise-nya — safeCloudBoot() dan pemanggil lain
  // memanggil .then()/.catch() pada hasil fungsi ini. Tanpa return, hasilnya
  // undefined dan .then() di pemanggil crash ("Cannot read properties of
  // undefined (reading 'then')") — persis error yang muncul di layar login.
  return supaSaveAllData().then(function(){
    _syncInFlight = false;
    _cloudSyncFailed = false;
    if(_syncQueued){
      // Ada perubahan lain yang masuk selagi sync ini berjalan — kirim
      // ulang sekarang juga dengan state terbaru, jangan anggap selesai dulu.
      _syncQueued = false;
      try{ localStorage.setItem(LS_PENDING_KEY,'1'); }catch(e){}
      return _syncToCloud(allowRetry);
    }
    try{ localStorage.setItem(LS_PENDING_KEY,'0'); }catch(e){}
    if(typeof showSaveStatus==='function') showSaveStatus('✓ Tersimpan & tersinkron ke cloud');
  }).catch(function(e){
    _syncInFlight = false;
    console.warn('Supabase sync:',e);
    _cloudSyncFailed = true;
    // Jangan diam-diam saja — kalau sync ke cloud gagal, user harus tahu
    // supaya tidak berasumsi datanya aman untuk dibuka di device lain.
    // Banner ini TIDAK auto-hilang (lihat showSaveStatus) sampai sync sukses.
    // Tampilkan pesan error ASLI (bukan cuma generik) supaya bisa didiagnosis
    // dari screenshot, tanpa user perlu buka DevTools Console.
    var _errMsg = (e && e.message) ? e.message : String(e);
    if(typeof showSaveStatus==='function') showSaveStatus('⚠ Gagal sinkron ke cloud: '+_errMsg, 'var(--red)', true);
    if(_syncQueued){
      _syncQueued = false;
      return _syncToCloud(allowRetry);
    }
    if(allowRetry){
      // Coba lagi sekali setelah beberapa detik — menutup celah gangguan
      // jaringan sesaat supaya tidak butuh aksi manual dari user.
      setTimeout(function(){ if(_currentUser) _syncToCloud(false); }, 8000);
    }
  });
}

// ── Dipanggil saat boot (authInit/login) — SATU-SATUNYA pintu masuk untuk
// menarik data dari cloud. Kalau ada perubahan lokal yang belum terkonfirmasi
// tersinkron (LS_PENDING_KEY==='1'), JANGAN tarik dari cloud sama sekali —
// push dulu apa yang ada di localStorage, supaya data lokal yang lebih baru
// tidak pernah tertimpa oleh cloud yang lebih lama. ──
function safeCloudBoot(){
  var pending = false;
  try{ pending = localStorage.getItem(LS_PENDING_KEY)==='1'; }catch(e){}
  if(pending){
    console.warn('Ada perubahan lokal yang belum terkonfirmasi tersinkron — push ke cloud dulu, TIDAK menimpa dari cloud kali ini.');
    return _syncToCloud(true);
  }
  return supaLoadAllData();
}

function loadData(){ return loadDataFromLocalStorage(); }

function clearData(){
  if(!confirm('\u26a0\ufe0f Hapus SEMUA data transaksi tersimpan dan kosongkan portofolio?\n\nTindakan ini akan mengosongkan seluruh data transaksi agar siap di-upload ulang.')) return;
  if(_currentUser && !_currentUser.isGuest){
    var uid=_currentUser.id;
    var tables=['transactions','dividends','rdn_mutations','crypto_tx','etf_tx','rd_tx','user_settings','div_invest'];
    if(typeof showSaveStatus==='function') showSaveStatus('\u23f3 Menghapus semua data di cloud...', 'var(--amber)', true);
    Promise.all(tables.map(function(t){ return _supabase.from(t).delete().eq('user_id',uid); }))
      .then(function(results){
        var failed = tables.filter(function(t,i){ return results[i].error; });
        if(failed.length){
          if(typeof showSaveStatus==='function') showSaveStatus('\u26a0 Gagal hapus: '+failed.join(', ')+' \u2014 reset TIDAK selesai, coba lagi', 'var(--red)', true);
          return;
        }
        if(typeof WEALTH!=='undefined'){
          WEALTH.income=0; WEALTH.expense=0; WEALTH.deposito=0; WEALTH.emas=0; WEALTH.obligasi=0;
          WEALTH.bank=[]; WEALTH.debt=[]; WEALTH.piutang=[];
        }
        [
          'ihsg_pro_master_v5', 'ihsg_pro_stockb_v6', 'ihsg_pro_v7_clean', 'mw_wealth_v1',
          'ihsg_cash_v1', 'porto_imported_v1', 'ihsg_divinvest_v1', 'hw_history', 'hw_state',
          'ihsg_sync_pending'
        ].forEach(function(k){ localStorage.removeItem(k); });
        location.reload();
      })
      .catch(function(err){
        if(typeof showSaveStatus==='function') showSaveStatus('\u26a0 Gagal reset: '+(err&&err.message||'unknown'), 'var(--red)', true);
      });
  }
  else{
    if(typeof WEALTH!=='undefined'){
      WEALTH.income=0; WEALTH.expense=0; WEALTH.deposito=0; WEALTH.emas=0; WEALTH.obligasi=0;
      WEALTH.bank=[]; WEALTH.debt=[]; WEALTH.piutang=[];
    }
    [
      'ihsg_pro_master_v5', 'ihsg_pro_stockb_v6', 'ihsg_pro_v7_clean', 'mw_wealth_v1',
      'ihsg_cash_v1', 'porto_imported_v1', 'ihsg_divinvest_v1', 'hw_history', 'hw_state',
      'ihsg_sync_pending'
    ].forEach(function(k){ localStorage.removeItem(k); });
    location.reload();
  }
}



// ── EXPORT: download file JSON berisi semua data ──
function exportData(){
  try {
    var payload = {
      _version: '1.0',
      _app: 'IHSG Pro Master',
      _exportedAt: new Date().toISOString(),
      transactions: transactions,
      dividends: dividends,
      rdnMutations: rdnMutations,
      activeSekuritas: activeSekuritas,
      rdnBalance: rdnBalance,
      nextTxId: nextTxId, nextDivId: nextDivId, nextRdnId: nextRdnId,
      cryptoTx: cryptoTx, etfTx: etfTx, rdTx: rdTx,
      nextCryptoId: nextCryptoId, nextEtfId: nextEtfId, nextRdId: nextRdId,
      wealth: (typeof WEALTH!=='undefined') ? WEALTH : null
    };
    var json = JSON.stringify(payload, null, 2);
    var blob = new Blob([json], {type:'application/json'});
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    var d = new Date().toISOString().split('T')[0];
    a.href = url; a.download = 'ihsg_backup_'+d+'.json';
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
    showSaveStatus('✓ Backup berhasil didownload');
  } catch(e){ alert('Gagal export: '+e.message); }
}

// ── EXPORT: download CSV khusus transaksi saham ──
function exportCSV(){
  try {
    var rows = [['Tanggal','Tipe','Kode','Lot','Saham','Harga','Kotor','Komisi','PPh','Nett','Sekuritas']];
    transactions.slice().sort(function(a,b){return a.date.localeCompare(b.date)}).forEach(function(tx){
      rows.push([tx.date,tx.type,tx.ticker,tx.lot,tx.lot*100,tx.price,tx.gross,tx.komisi,tx.tax,tx.net,tx.sekuritas]);
    });
    var csv = rows.map(function(r){ return r.join(','); }).join('\n');
    var blob = new Blob(['\uFEFF'+csv], {type:'text/csv;charset=utf-8'});
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    var d = new Date().toISOString().split('T')[0];
    a.href = url; a.download = 'transaksi_saham_'+d+'.csv';
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
    showSaveStatus('✓ CSV transaksi didownload');
  } catch(e){ alert('Gagal export CSV: '+e.message); }
}

// ── IMPORT: restore dari file JSON backup ──
function importData(){
  var input = document.createElement('input');
  input.type = 'file'; input.accept = '.json,application/json';
  input.onchange = function(e){
    var file = e.target.files[0]; if(!file) return;
    var reader = new FileReader();
    reader.onload = function(ev){
      try {
        var d = JSON.parse(ev.target.result);
        if(!d.transactions) throw new Error('Format file tidak valid. Pastikan ini file backup dari IHSG Pro.');
        var txCount = (d.transactions||[]).length + (d.cryptoTx||[]).length + (d.etfTx||[]).length + (d.rdTx||[]).length;
        var exportDate = d._exportedAt ? new Date(d._exportedAt).toLocaleString('id-ID') : 'tidak diketahui';
        if(!confirm('Import data dari backup?\n\nFile: '+file.name+'\nDibuat: '+exportDate+'\nTotal '+txCount+' transaksi\n\n⚠️ Data saat ini akan diganti.')) return;

        transactions    = d.transactions    || [];
        dividends       = d.dividends       || [];
        rdnMutations    = d.rdnMutations    || [];
        activeSekuritas = d.activeSekuritas || 'Stockbit';
        rdnBalance      = d.rdnBalance      || 0;
        nextTxId        = Math.max(d.nextTxId||0, _maxIdPlus1(transactions));
        nextDivId       = Math.max(d.nextDivId||0, _maxIdPlus1(dividends));
        nextRdnId       = Math.max(d.nextRdnId||0, _maxIdPlus1(rdnMutations));
        cryptoTx        = d.cryptoTx        || [];
        etfTx           = d.etfTx           || [];
        rdTx            = d.rdTx            || [];
        nextCryptoId    = Math.max(d.nextCryptoId||0, _maxIdPlus1(cryptoTx));
        nextEtfId       = Math.max(d.nextEtfId||0, _maxIdPlus1(etfTx));
        nextRdId        = Math.max(d.nextRdId||0, _maxIdPlus1(rdTx));
        if(d.wealth && typeof WEALTH!=='undefined'){
          Object.keys(WEALTH).forEach(function(k){ if(d.wealth[k]!==undefined) WEALTH[k]=d.wealth[k]; });
          if(typeof wUpdateDueBadge==='function') wUpdateDueBadge();
          try{ localStorage.setItem('mw_wealth_v1', JSON.stringify(WEALTH)); }catch(e){}
        }
        saveData();
        closeBackupModal();
        showSaveStatus('✓ '+txCount+' transaksi berhasil diimport', 'var(--accent)');
        renderDashboard();
      } catch(err){ alert('Gagal import: '+err.message); }
    };
    reader.readAsText(file);
  };
  input.click();
}

// ── BACKUP MODAL ──
function openBackupModal(){
  var lsSize = 0;
  try { lsSize = new Blob([localStorage.getItem(LS_KEY)||'']).size; } catch(e){}
  var kbSize = (lsSize/1024).toFixed(1);
  var txTotal = transactions.length + dividends.length + cryptoTx.length + etfTx.length + rdTx.length;
  var lastSave = '—';
  try { var d=JSON.parse(localStorage.getItem(LS_KEY)||'{}'); if(d.savedAt) lastSave=new Date(d.savedAt).toLocaleString('id-ID'); } catch(e){}

  el('backup-modal').style.display = 'flex';
  el('backup-modal-body').innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:16px">
      <div style="background:var(--bg3);border:1px solid var(--border);border-radius:8px;padding:10px;text-align:center">
        <div style="font-size:22px;font-weight:800;font-family:var(--font-mono);color:var(--accent)">${txTotal}</div>
        <div style="font-size:10px;color:var(--text3);margin-top:2px;letter-spacing:.8px;text-transform:uppercase">Total Transaksi</div>
      </div>
      <div style="background:var(--bg3);border:1px solid var(--border);border-radius:8px;padding:10px;text-align:center">
        <div style="font-size:22px;font-weight:800;font-family:var(--font-mono);color:var(--green)">${kbSize} KB</div>
        <div style="font-size:10px;color:var(--text3);margin-top:2px;letter-spacing:.8px;text-transform:uppercase">Ukuran Data</div>
      </div>
      <div style="background:var(--bg3);border:1px solid var(--border);border-radius:8px;padding:10px;text-align:center">
        <div style="font-size:11px;font-weight:700;font-family:var(--font-mono);color:var(--text2);line-height:1.4">${lastSave}</div>
        <div style="font-size:10px;color:var(--text3);margin-top:2px;letter-spacing:.8px;text-transform:uppercase">Terakhir Simpan</div>
      </div>
    </div>

    <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:16px">
      <button class="btn btn-green" onclick="exportData()" style="justify-content:flex-start;gap:10px;padding:12px 14px;font-size:13px">
        <span style="font-size:20px">📥</span>
        <div style="text-align:left"><div style="font-weight:700">Download Backup JSON</div><div style="font-size:11px;opacity:.7;font-weight:400">Semua data: saham, crypto, ETF, reksa dana, RDN</div></div>
      </button>
      <button class="btn btn-blue" onclick="exportCSV()" style="justify-content:flex-start;gap:10px;padding:12px 14px;font-size:13px">
        <span style="font-size:20px">📊</span>
        <div style="text-align:left"><div style="font-weight:700">Download CSV Transaksi Saham</div><div style="font-size:11px;opacity:.7;font-weight:400">Bisa dibuka di Excel/Sheets — ${transactions.length} transaksi</div></div>
      </button>
      <button class="btn btn-ghost" onclick="importData()" style="justify-content:flex-start;gap:10px;padding:12px 14px;font-size:13px;border-color:rgba(0,200,255,.3)">
        <span style="font-size:20px">📤</span>
        <div style="text-align:left"><div style="font-weight:700">Restore dari Backup</div><div style="font-size:11px;opacity:.7;font-weight:400">Upload file JSON backup — data saat ini akan diganti</div></div>
      </button>
    </div>

    <div style="background:rgba(255,193,7,.06);border:1px solid rgba(255,193,7,.2);border-radius:8px;padding:10px 12px;font-size:11px;color:var(--text2);line-height:1.7">
      <div style="font-weight:700;color:var(--amber);margin-bottom:4px">⚠️ Penting — Backup Berkala</div>
      Data tersimpan di browser lokal (localStorage). Jika browser di-clear atau buka di device lain, data hilang.
      <strong style="color:var(--text)">Download backup JSON minimal seminggu sekali</strong> dan simpan di Google Drive atau email ke diri sendiri.
    </div>

    <div style="margin-top:12px;display:flex;justify-content:space-between;align-items:center">
      <button class="btn btn-ghost btn-sm" onclick="clearData()" style="color:var(--red);font-size:11px">🗑 Reset semua data</button>
      <button class="btn btn-ghost btn-sm" onclick="closeBackupModal()">Tutup</button>
    </div>
  `;
}

function closeBackupModal(){
  el('backup-modal').style.display = 'none';
}

function showSaveStatus(msg, color, persist){
  var bar = el('save-status-bar');
  if(!bar) return;
  bar.textContent = msg;
  bar.style.color = color || 'var(--green)';
  bar.style.opacity = '1';
  // persist=true (dipakai untuk peringatan gagal-sync) sengaja TIDAK auto-hilang
  // dalam 2 detik — user harus benar-benar melihatnya, bukan sekilas lewat,
  // supaya tidak berasumsi data sudah aman padahal belum tersinkron ke cloud.
  if(!persist){
    setTimeout(function(){ bar.style.opacity = '0'; }, 2000);
  }
}

// ── Peringatan skema Supabase belum diperbarui — tampil di UI, bukan cuma console ──
var SCHEMA_MIGRATION_SQL = `-- ══════════════════════════════════════════════════════════
-- MIGRASI SKEMA — Money Watch Pro (KONSOLIDASI LENGKAP)
-- ══════════════════════════════════════════════════════════
-- Jalankan SEKALI di Supabase SQL Editor project Anda
-- (Dashboard Supabase → SQL Editor → New query → Tempel → Run).

alter table public.user_settings
  add column if not exists idx_universe jsonb,
  add column if not exists idx_universe_info jsonb,
  add column if not exists admin_meta jsonb,
  add column if not exists admin_extra jsonb,
  add column if not exists trade_strategy jsonb,
  add column if not exists sek_tax_override jsonb,
  add column if not exists wealth jsonb,
  add column if not exists schema_version integer;

update public.user_settings set schema_version = 2 where schema_version is null;

do $$
begin
  delete from public.transactions a using public.transactions b
    where a.user_id=b.user_id and a.tx_id=b.tx_id and a.ctid<b.ctid;
  delete from public.dividends a using public.dividends b
    where a.user_id=b.user_id and a.div_id=b.div_id and a.ctid<b.ctid;
  delete from public.rdn_mutations a using public.rdn_mutations b
    where a.user_id=b.user_id and a.rdn_id=b.rdn_id and a.ctid<b.ctid;
  delete from public.crypto_tx a using public.crypto_tx b
    where a.user_id=b.user_id and a.tx_id=b.tx_id and a.ctid<b.ctid;
  delete from public.etf_tx a using public.etf_tx b
    where a.user_id=b.user_id and a.tx_id=b.tx_id and a.ctid<b.ctid;
  delete from public.rd_tx a using public.rd_tx b
    where a.user_id=b.user_id and a.tx_id=b.tx_id and a.ctid<b.ctid;
end $$;

alter table public.transactions
  drop constraint if exists transactions_user_tx_unique,
  add constraint transactions_user_tx_unique unique (user_id, tx_id);
alter table public.dividends
  drop constraint if exists dividends_user_div_unique,
  add constraint dividends_user_div_unique unique (user_id, div_id);
alter table public.rdn_mutations
  drop constraint if exists rdn_mutations_user_rdn_unique,
  add constraint rdn_mutations_user_rdn_unique unique (user_id, rdn_id);
alter table public.crypto_tx
  drop constraint if exists crypto_tx_user_tx_unique,
  add constraint crypto_tx_user_tx_unique unique (user_id, tx_id);
alter table public.etf_tx
  drop constraint if exists etf_tx_user_tx_unique,
  add constraint etf_tx_user_tx_unique unique (user_id, tx_id);
alter table public.rd_tx
  drop constraint if exists rd_tx_user_tx_unique,
  add constraint rd_tx_user_tx_unique unique (user_id, tx_id);

alter table public.rdn_mutations
  add column if not exists linked_tx_id text;

do $$
begin
  delete from public.div_invest a using public.div_invest b
    where a.user_id=b.user_id and a.ctid<b.ctid;
end $$;
alter table public.div_invest
  drop constraint if exists div_invest_user_unique,
  add constraint div_invest_user_unique unique (user_id);
`;

function updateSchemaWarnBanner(){
  var box = el('schema-warn-banner');
  if(!box) return;
  box.style.display = window._schemaOutdated ? 'flex' : 'none';
}

function dismissSchemaWarnBanner(){
  var box = el('schema-warn-banner');
  if(box) box.style.display = 'none';
}

function copySchemaMigrationSql(){
  if(navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(SCHEMA_MIGRATION_SQL).then(function(){
      showSaveStatus('✓ Script SQL Migrasi berhasil disalin ke clipboard!', 'var(--green)', true);
      setTimeout(function(){
        var bar = el('save-status-bar');
        if(bar) bar.style.opacity = '0';
      }, 4000);
    }).catch(function(){
      fallbackCopyText(SCHEMA_MIGRATION_SQL);
    });
  } else {
    fallbackCopyText(SCHEMA_MIGRATION_SQL);
  }
}

function fallbackCopyText(text){
  var ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.top = '0';
  ta.style.left = '0';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.focus();
  ta.select();
  try {
    document.execCommand('copy');
    showSaveStatus('✓ Script SQL Migrasi berhasil disalin ke clipboard!', 'var(--green)', true);
  } catch(e) {
    alert('Gagal menyalin otomatis. Silakan buka modal dan salin teks secara manual.');
  }
  document.body.removeChild(ta);
}

function openSchemaMigrationModal(){
  var m = el('schema-migration-modal');
  if(!m) return;
  var ta = el('schema-sql-text');
  if(ta) ta.value = SCHEMA_MIGRATION_SQL;
  m.style.display = 'flex';
}

function closeSchemaMigrationModal(){
  var m = el('schema-migration-modal');
  if(m) m.style.display = 'none';
}

async function checkSchemaMigrationStatus(){
  if(!_currentUser){
    showSaveStatus('Silakan login terlebih dahulu untuk cek koneksi database.', 'var(--amber)', true);
    return;
  }
  var btn = el('btn-check-schema-status');
  if(btn){
    btn.disabled = true;
    btn.textContent = '⏳ Memeriksa Skema Database...';
  }
  showSaveStatus('⏳ Memeriksa status skema Supabase...', 'var(--accent)', true);
  try {
    // Coba trigger supaSaveAllData untuk cek apakah kolom native sudah aktif
    await supaSaveAllData();
    if(!window._schemaOutdated){
      showSaveStatus('✓ Skema database Supabase berhasil dimigrasi & 100% Up-to-Date!', 'var(--green)', true);
      updateSchemaWarnBanner();
      closeSchemaMigrationModal();
    } else {
      showSaveStatus('⚠ Skema belum terdeteksi. Pastikan Anda sudah klik tombol "RUN" di Supabase SQL Editor.', 'var(--amber)', true);
    }
  } catch(e) {
    showSaveStatus('⚠ Pemeriksaan gagal: ' + e.message, 'var(--red)', true);
  } finally {
    if(btn){
      btn.disabled = false;
      btn.textContent = '🔄 Cek Ulang Status Sinkronisasi';
    }
  }
}

// ============================================================
// HELPERS
// ============================================================
function fmt(n){return Math.round(n).toLocaleString('id-ID')}
function fmtK(n){var a=Math.abs(n);if(a>=1e12)return(n/1e12).toFixed(2)+'T';if(a>=1e9)return(n/1e9).toFixed(2)+'M';if(a>=1e6)return(n/1e6).toFixed(1)+'Jt';return fmt(n)}
// Escape teks bebas milik user (mis. Keterangan RDN) sebelum masuk innerHTML —
// tanpa ini, string seperti "<img src=x onerror=...>" akan tereksekusi sebagai
// HTML, terutama berbahaya lewat fitur Restore Backup (file JSON dari luar).
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


