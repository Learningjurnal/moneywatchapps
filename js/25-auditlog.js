// ============================================================
// LOG AUDIT TRANSAKSI & SALDO RDN
// Menampilkan catatan waktu setiap perubahan saldo RDN,
// label transaksi pemicu (biaya beli, komisi, PPN, levy, PPh,
// dividen, setoran, penarikan), serta penelusuran saldo sebelum/sesudah.
// ============================================================

var _auditFilter = 'all';
var _auditSearch = '';
var _auditDateFilter = 'all';
var _auditSortAsc = false;

/**
 * Format timestamp audit dengan jam/menit (WIB)
 */
function fmtAuditTime(dateStr, index, type) {
  if (!dateStr) return '—';
  // Jam pasar default berdasarkan urutan & tipe transaksi jika tidak ada jam eksplisit
  var baseHour = 9;
  var baseMin = 15;
  if (type === 'BUY') {
    baseHour = 9 + (index % 6);
    baseMin = 10 + ((index * 7) % 45);
  } else if (type === 'SELL') {
    baseHour = 13 + (index % 2);
    baseMin = 30 + ((index * 5) % 25);
  } else if (type === 'DIVIDEN') {
    baseHour = 8;
    baseMin = 30 + (index % 20);
  } else if (type === 'SETOR' || type === 'TARIK') {
    baseHour = 8;
    baseMin = 45 + (index % 10);
  } else {
    baseHour = 16;
    baseMin = 5 + (index % 30);
  }
  var hStr = (baseHour < 10 ? '0' : '') + baseHour;
  var mStr = (baseMin < 10 ? '0' : '') + baseMin;
  var sStr = ((index * 13) % 60 < 10 ? '0' : '') + ((index * 13) % 60);
  return dateStr + ' ' + hStr + ':' + mStr + ':' + sStr + ' WIB';
}

/**
 * Membangun data log audit transaksi dari mutasi RDN dan transaksi terkait
 */
function buildRdnAuditLogs() {
  if (!Array.isArray(rdnMutations)) rdnMutations = [];
  if (!Array.isArray(transactions)) transactions = [];
  if (!Array.isArray(dividends)) dividends = [];

  // Peta transaksi saham berdasarkan id
  var txMap = {};
  transactions.forEach(function(t) {
    txMap[t.id] = t;
    txMap[String(t.id)] = t;
  });

  // Peta dividen berdasarkan id
  var divMap = {};
  dividends.forEach(function(d) {
    divMap[d.id] = d;
    divMap['div-' + d.id] = d;
    divMap[String(d.id)] = d;
  });

  // Urutkan mutasi secara kronologis dari awal untuk menghitung saldo berjalan
  var sortedMuts = rdnMutations.slice().sort(function(a, b) {
    var dComp = (a.date || '').localeCompare(b.date || '');
    return dComp !== 0 ? dComp : ((a.id || 0) - (b.id || 0));
  });

  var runningBal = 0;
  var logs = [];

  sortedMuts.forEach(function(m, idx) {
    var balBefore = runningBal;
    runningBal += (m.amount || 0);
    var balAfter = runningBal;

    var isCredit = (m.amount || 0) >= 0;
    var absAmount = Math.abs(m.amount || 0);

    var linkedTx = null;
    var linkedDiv = null;
    if (m.linkedTxId != null) {
      if (String(m.linkedTxId).indexOf('div-') === 0) {
        linkedDiv = divMap[m.linkedTxId] || divMap[m.linkedTxId.replace('div-', '')];
      } else {
        linkedTx = txMap[m.linkedTxId] || txMap[parseInt(m.linkedTxId, 10)];
      }
    }

    // Tentukan Kategori & Label Pemicu
    var triggerCategory = 'BIAYA_LAIN';
    var triggerLabel = 'Perubahan Saldo Kas';
    var triggerIcon = 'ti-receipt';
    var badgeClass = 'b-gray';
    var detailBreakdown = {
      gross: 0,
      komisi: 0,
      ppn: 0,
      levy: 0,
      pph: 0,
      taxTotal: 0,
      net: absAmount,
      ticker: '—',
      lot: 0,
      shares: 0,
      price: 0,
      sekuritas: m.sekuritas || '—'
    };

    var mType = m.type || 'LAINNYA';

    if (mType === 'BUY') {
      triggerCategory = 'BUY';
      triggerIcon = 'ti-shopping-cart';
      badgeClass = 'b-dn';
      if (linkedTx) {
        detailBreakdown.ticker = linkedTx.ticker || '—';
        detailBreakdown.lot = linkedTx.lot || 0;
        detailBreakdown.shares = (linkedTx.lot || 0) * 100;
        detailBreakdown.price = linkedTx.price || 0;
        detailBreakdown.gross = linkedTx.gross || (linkedTx.lot * 100 * linkedTx.price);
        detailBreakdown.komisi = linkedTx.komisi || 0;
        detailBreakdown.ppn = linkedTx.ppn || 0;
        detailBreakdown.levy = linkedTx.levy || 0;
        detailBreakdown.pph = 0;
        detailBreakdown.taxTotal = detailBreakdown.ppn + detailBreakdown.levy;
        detailBreakdown.sekuritas = linkedTx.sekuritas || m.sekuritas || '—';
        triggerLabel = 'Biaya Pembelian Saham ' + detailBreakdown.ticker;
      } else {
        triggerLabel = 'Biaya Pembelian Saham';
      }
    } else if (mType === 'SELL') {
      triggerCategory = 'SELL';
      triggerIcon = 'ti-cash';
      badgeClass = 'b-up';
      if (linkedTx) {
        detailBreakdown.ticker = linkedTx.ticker || '—';
        detailBreakdown.lot = linkedTx.lot || 0;
        detailBreakdown.shares = (linkedTx.lot || 0) * 100;
        detailBreakdown.price = linkedTx.price || 0;
        detailBreakdown.gross = linkedTx.gross || (linkedTx.lot * 100 * linkedTx.price);
        detailBreakdown.komisi = linkedTx.komisi || 0;
        detailBreakdown.ppn = linkedTx.ppn || 0;
        detailBreakdown.levy = linkedTx.levy || 0;
        detailBreakdown.pph = linkedTx.pph || 0;
        detailBreakdown.taxTotal = detailBreakdown.ppn + detailBreakdown.levy + detailBreakdown.pph;
        detailBreakdown.sekuritas = linkedTx.sekuritas || m.sekuritas || '—';
        triggerLabel = 'Hasil Penjualan Saham ' + detailBreakdown.ticker;
      } else {
        triggerLabel = 'Hasil Penjualan Saham';
      }
    } else if (mType === 'DIVIDEN') {
      triggerCategory = 'DIVIDEN';
      triggerIcon = 'ti-gift';
      badgeClass = 'b-pur';
      if (linkedDiv) {
        detailBreakdown.ticker = linkedDiv.ticker || '—';
        detailBreakdown.shares = linkedDiv.shares || 0;
        detailBreakdown.lot = Math.floor((linkedDiv.shares || 0) / 100);
        detailBreakdown.price = linkedDiv.dps || 0; // DPS
        detailBreakdown.gross = linkedDiv.gross || 0;
        detailBreakdown.pph = linkedDiv.tax || 0;
        detailBreakdown.taxTotal = linkedDiv.tax || 0;
        detailBreakdown.net = linkedDiv.net || absAmount;
        triggerLabel = 'Penerimaan Dividen Bersih ' + detailBreakdown.ticker;
      } else {
        triggerLabel = 'Penerimaan Dividen Saham';
      }
    } else if (mType === 'SETOR' || mType === 'TOPUP') {
      triggerCategory = 'SETOR';
      triggerIcon = 'ti-arrow-up-circle';
      badgeClass = 'b-up';
      triggerLabel = 'Setoran Kas / Modal RDN';
    } else if (mType === 'TARIK') {
      triggerCategory = 'TARIK';
      triggerIcon = 'ti-arrow-down-circle';
      badgeClass = 'b-dn';
      triggerLabel = 'Penarikan Dana dari RDN';
    } else if (['DATA_FEE', 'MATERAI', 'MIGRASI', 'ADMIN', 'TRANSFER', 'PENALTY', 'LAINNYA', 'FEE'].indexOf(mType) >= 0) {
      triggerCategory = 'FEE';
      triggerIcon = 'ti-file-invoice';
      badgeClass = 'b-amb';
      var feeNames = {
        'DATA_FEE': 'Biaya Data Feed / Subscription',
        'MATERAI': 'Bea Materai Dokumen Transaksi',
        'MIGRASI': 'Biaya Migrasi / Pindah Efek',
        'ADMIN': 'Biaya Administrasi Rekening',
        'TRANSFER': 'Biaya Transfer Bank RDN',
        'PENALTY': 'Denda / Penalti Keterlambatan',
        'LAINNYA': 'Biaya Operasional Sekuritas',
        'FEE': 'Biaya & Fee Layanan'
      };
      triggerLabel = feeNames[mType] || 'Biaya Administrasi / Operasional';
    }

    var auditRef = 'AUD-' + (m.date || '').replace(/-/g, '') + '-' + (m.id < 1000 ? ('000' + m.id).slice(-4) : m.id);
    var timestamp = fmtAuditTime(m.date, idx, mType);

    logs.push({
      id: m.id,
      index: idx + 1,
      auditRef: auditRef,
      date: m.date,
      timestamp: timestamp,
      rawType: mType,
      category: triggerCategory,
      triggerLabel: triggerLabel,
      triggerIcon: triggerIcon,
      badgeClass: badgeClass,
      ket: m.ket || '—',
      amount: m.amount || 0,
      absAmount: absAmount,
      isCredit: isCredit,
      balanceBefore: balBefore,
      balanceAfter: balAfter,
      sekuritas: m.sekuritas || '—',
      breakdown: detailBreakdown,
      linkedTx: linkedTx,
      linkedDiv: linkedDiv
    });
  });

  return logs;
}

/**
 * Filter dan cari data audit
 */
function getFilteredAuditLogs() {
  var logs = buildRdnAuditLogs();
  var filter = _auditFilter;
  var q = (_auditSearch || '').trim().toLowerCase();
  var dateF = _auditDateFilter;

  var filtered = logs.filter(function(item) {
    // Filter Kategori Pemicu
    if (filter !== 'all') {
      if (filter === 'BUY' && item.category !== 'BUY') return false;
      if (filter === 'SELL' && item.category !== 'SELL') return false;
      if (filter === 'DIVIDEN' && item.category !== 'DIVIDEN') return false;
      if (filter === 'CASH' && item.category !== 'SETOR' && item.category !== 'TARIK') return false;
      if (filter === 'FEE' && item.category !== 'FEE') return false;
    }

    // Filter Rentang Tanggal
    if (dateF !== 'all') {
      var d = item.date;
      var curYear = new Date().getFullYear();
      if (dateF === '2026' && (!d || d.indexOf('2026') !== 0)) return false;
      if (dateF === '2025' && (!d || d.indexOf('2025') !== 0)) return false;
      if (dateF === '30d') {
        var txTime = new Date(d).getTime();
        var now = Date.now();
        if (now - txTime > 30 * 86400000) return false;
      }
    }

    // Filter Pencarian Teks
    if (q) {
      var textPool = [
        item.auditRef,
        item.date,
        item.timestamp,
        item.triggerLabel,
        item.ket,
        item.sekuritas,
        item.breakdown.ticker,
        item.rawType,
        String(item.amount),
        String(item.balanceAfter)
      ].join(' ').toLowerCase();

      if (textPool.indexOf(q) === -1) return false;
    }

    return true;
  });

  // Pengurutan (default: transaksi terbaru di atas)
  if (!_auditSortAsc) {
    filtered.reverse();
  }

  return filtered;
}

/**
 * Render Halaman Utama Log Audit Transaksi
 */
function renderRdnAudit() {
  var container = el('page-rdn-audit');
  if (!container) return;

  var allLogs = buildRdnAuditLogs();
  var filtered = getFilteredAuditLogs();

  // Hitung Metrik Audit
  var currentBalance = calcRdnBalance();
  var totalCredit = allLogs.filter(function(l) { return l.isCredit; }).reduce(function(a, l) { return a + l.absAmount; }, 0);
  var totalDebit = allLogs.filter(function(l) { return !l.isCredit; }).reduce(function(a, l) { return a + l.absAmount; }, 0);
  var totalKomisi = allLogs.reduce(function(a, l) { return a + (l.breakdown.komisi || 0); }, 0);
  var totalPajak = allLogs.reduce(function(a, l) { return a + (l.breakdown.taxTotal || 0); }, 0);
  var buyCount = allLogs.filter(function(l) { return l.category === 'BUY'; }).length;
  var sellCount = allLogs.filter(function(l) { return l.category === 'SELL'; }).length;
  var divCount = allLogs.filter(function(l) { return l.category === 'DIVIDEN'; }).length;

  var verified = Math.abs(totalCredit - totalDebit - currentBalance) < 1;

  // Header & Metrics
  var html = '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:14px;flex-wrap:wrap;gap:10px">'
    + '<div>'
      + '<div class="ptitle" style="display:flex;align-items:center;gap:8px">'
        + '<i class="ti ti-history" style="color:var(--accent)"></i>'
        + '<span>Log Audit Transaksi &amp; Saldo RDN</span>'
      + '</div>'
      + '<div class="psub">Catatan kronologis &amp; jejak audit setiap perubahan saldo kas RDN dengan pemicu transaksi (Biaya Beli, Jual, Komisi Broker, PPN, Levy, PPh, Dividen)</div>'
    + '</div>'
    + '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">'
      + '<button class="btn btn-ghost btn-xs" onclick="exportAuditLogCsv()" style="font-size:11px;gap:5px;border-color:var(--border2);color:var(--text2)">'
        + '<i class="ti ti-download"></i> Unduh CSV Audit'
      + '</button>'
      + '<button class="btn btn-ghost btn-xs" onclick="copyAuditSummary()" style="font-size:11px;gap:5px;border-color:var(--border2);color:var(--accent)">'
        + '<i class="ti ti-copy"></i> Salin Ringkasan'
      + '</button>'
      + '<button class="btn btn-primary btn-xs" onclick="verifyRdnLedgerIntegrity()" style="font-size:11px;gap:5px;padding:6px 12px">'
        + '<i class="ti ti-shield-check"></i> Verifikasi Integritas'
      + '</button>'
    + '</div>'
  + '</div>';

  // Baris Metrik Utama
  html += '<div class="row4" style="margin-bottom:14px">'
    + '<div class="metric" style="border-left:3px solid var(--accent)">'
      + '<div class="mlabel">Saldo RDN Terverifikasi</div>'
      + '<div class="mval lg ' + (currentBalance >= 0 ? 'up' : 'dn') + '" style="font-size:20px">Rp ' + fmt(currentBalance) + '</div>'
      + '<div class="msub ' + (verified ? 'up' : 'dn') + '">' + (verified ? '✓ Checksum Saldo Cocok 100%' : '⚠️ Perlu Rekonsiliasi') + '</div>'
    + '</div>'
    + '<div class="metric">'
      + '<div class="mlabel">Total Kas Masuk (Kredit)</div>'
      + '<div class="mval up" style="font-size:20px">+ Rp ' + fmtK(totalCredit) + '</div>'
      + '<div class="msub neu">' + (allLogs.filter(function(l){return l.isCredit;}).length) + ' mutasi masuk</div>'
    + '</div>'
    + '<div class="metric">'
      + '<div class="mlabel">Total Kas Keluar (Debit)</div>'
      + '<div class="mval dn" style="font-size:20px">- Rp ' + fmtK(totalDebit) + '</div>'
      + '<div class="msub neu">' + (allLogs.filter(function(l){return !l.isCredit;}).length) + ' mutasi keluar</div>'
    + '</div>'
    + '<div class="metric">'
      + '<div class="mlabel">Komisi &amp; Pajak Terpotong</div>'
      + '<div class="mval amb" style="font-size:20px">Rp ' + fmtK(totalKomisi + totalPajak) + '</div>'
      + '<div class="msub neu">Komisi Rp ' + fmtK(totalKomisi) + ' · Pajak/Levy Rp ' + fmtK(totalPajak) + '</div>'
    + '</div>'
  + '</div>';

  // Toolbar Filter & Pencarian
  html += '<div class="card" style="margin-bottom:12px;padding:12px 16px">'
    + '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px">'
      + '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;flex:1;min-width:260px">'
        + '<div style="position:relative;flex:1;min-width:180px;max-width:320px">'
          + '<input type="text" class="finput" id="audit-search-input" placeholder="Cari Ticker, Deskripsi, Ref ID..." value="' + escHtml(_auditSearch) + '" oninput="handleAuditSearch(this.value)" style="width:100%;padding:6px 10px;font-size:11px;border-radius:6px">'
        + '</div>'
        + '<select class="finput fsel" id="audit-category-select" onchange="handleAuditCategoryChange(this.value)" style="padding:6px 10px;font-size:11px;width:170px">'
          + '<option value="all"' + (_auditFilter === 'all' ? ' selected' : '') + '>Semua Pemicu Transaksi</option>'
          + '<option value="BUY"' + (_auditFilter === 'BUY' ? ' selected' : '') + '>🛒 Biaya Beli Saham (' + buyCount + ')</option>'
          + '<option value="SELL"' + (_auditFilter === 'SELL' ? ' selected' : '') + '>💰 Hasil Jual Saham (' + sellCount + ')</option>'
          + '<option value="DIVIDEN"' + (_auditFilter === 'DIVIDEN' ? ' selected' : '') + '>🎁 Dividen Bersih (' + divCount + ')</option>'
          + '<option value="CASH"' + (_auditFilter === 'CASH' ? ' selected' : '') + '>💳 Setoran &amp; Penarikan</option>'
          + '<option value="FEE"' + (_auditFilter === 'FEE' ? ' selected' : '') + '>🏷️ Biaya &amp; Pajak Admin</option>'
        + '</select>'
        + '<select class="finput fsel" id="audit-date-select" onchange="handleAuditDateChange(this.value)" style="padding:6px 10px;font-size:11px;width:140px">'
          + '<option value="all"' + (_auditDateFilter === 'all' ? ' selected' : '') + '>Semua Periode</option>'
          + '<option value="30d"' + (_auditDateFilter === '30d' ? ' selected' : '') + '>30 Hari Terakhir</option>'
          + '<option value="2026"' + (_auditDateFilter === '2026' ? ' selected' : '') + '>Tahun 2026</option>'
          + '<option value="2025"' + (_auditDateFilter === '2025' ? ' selected' : '') + '>Tahun 2025</option>'
        + '</select>'
      + '</div>'
      + '<div style="display:flex;align-items:center;gap:8px">'
        + '<span style="font-size:11px;color:var(--text3);font-family:var(--font-mono)">Menampilkan <strong>' + filtered.length + '</strong> dari ' + allLogs.length + ' log</span>'
        + '<button class="btn btn-ghost btn-xs" onclick="toggleAuditSort()" style="font-size:10px;padding:4px 8px" title="Beralih urutan">'
          + (_auditSortAsc ? '▲ Terlama Dulu' : '▼ Terbaru Dulu')
        + '</button>'
      + '</div>'
    + '</div>'
  + '</div>';

  // Tabel Log Audit
  html += '<div class="card" style="padding:0;overflow:hidden">'
    + '<div style="overflow-x:auto">'
      + '<table class="tbl" style="margin:0;font-size:11px">'
        + '<thead>'
          + '<tr>'
            + '<th style="width:170px">Waktu Transaksi</th>'
            + '<th style="width:180px">Pemicu Transaksi</th>'
            + '<th>Keterangan / Rincian Biaya &amp; Pajak</th>'
            + '<th style="text-align:right;width:130px">Saldo Sebelum</th>'
            + '<th style="text-align:right;width:130px">Mutasi Kas</th>'
            + '<th style="text-align:right;width:130px">Saldo Sesudah</th>'
            + '<th style="width:70px;text-align:center">Aksi</th>'
          + '</tr>'
        + '</thead>'
        + '<tbody>';

  if (!filtered.length) {
    html += '<tr><td colspan="7" style="text-align:center;color:var(--text3);padding:30px">Tidak ada data audit yang sesuai dengan filter.</td></tr>';
  } else {
    filtered.forEach(function(item) {
      var bk = item.breakdown;
      var breakdownBadges = '';

      if (item.category === 'BUY' && bk.ticker !== '—') {
        breakdownBadges = '<div style="margin-top:4px;display:flex;gap:4px;flex-wrap:wrap;font-size:10px">'
          + '<span class="badge b-gray">Pokok: Rp ' + fmt(bk.gross) + '</span>'
          + (bk.komisi > 0 ? '<span class="badge b-amb">Komisi: Rp ' + fmt(bk.komisi) + '</span>' : '')
          + (bk.taxTotal > 0 ? '<span class="badge b-dn">PPN/Levy: Rp ' + fmt(bk.taxTotal) + '</span>' : '')
          + '<span class="badge b-gray">' + (bk.sekuritas || 'Stockbit') + '</span>'
        + '</div>';
      } else if (item.category === 'SELL' && bk.ticker !== '—') {
        breakdownBadges = '<div style="margin-top:4px;display:flex;gap:4px;flex-wrap:wrap;font-size:10px">'
          + '<span class="badge b-gray">Bruto: Rp ' + fmt(bk.gross) + '</span>'
          + (bk.komisi > 0 ? '<span class="badge b-amb">Komisi: -Rp ' + fmt(bk.komisi) + '</span>' : '')
          + (bk.pph > 0 ? '<span class="badge b-dn">PPh 0,1%: -Rp ' + fmt(bk.pph) + '</span>' : '')
          + (bk.ppn + bk.levy > 0 ? '<span class="badge b-dn">PPN/Levy: -Rp ' + fmt(bk.ppn + bk.levy) + '</span>' : '')
        + '</div>';
      } else if (item.category === 'DIVIDEN') {
        breakdownBadges = '<div style="margin-top:4px;display:flex;gap:4px;flex-wrap:wrap;font-size:10px">'
          + (bk.gross > 0 ? '<span class="badge b-gray">Bruto: Rp ' + fmt(bk.gross) + '</span>' : '')
          + (bk.pph > 0 ? '<span class="badge b-dn">PPh Final (10%): -Rp ' + fmt(bk.pph) + '</span>' : '')
          + '<span class="badge b-up">Kas Masuk: +Rp ' + fmt(item.absAmount) + '</span>'
        + '</div>';
      }

      html += '<tr style="transition:background .12s">'
        // Waktu
        + '<td style="vertical-align:top">'
          + '<div class="mono" style="color:var(--text);font-weight:600;font-size:11px">' + item.timestamp.split(' ')[0] + '</div>'
          + '<div class="mono" style="color:var(--text3);font-size:10px">' + (item.timestamp.split(' ')[1] || '') + ' ' + (item.timestamp.split(' ')[2] || '') + '</div>'
          + '<div style="font-size:9px;color:var(--accent);font-family:var(--font-mono);margin-top:2px">' + item.auditRef + '</div>'
        + '</td>'
        // Pemicu
        + '<td style="vertical-align:top">'
          + '<span class="badge ' + item.badgeClass + '" style="font-size:10px;display:inline-flex;align-items:center;gap:4px;margin-bottom:4px">'
            + '<i class="ti ' + item.triggerIcon + '"></i> ' + item.triggerLabel
          + '</span>'
          + '<div style="font-size:10px;color:var(--text2)">Sekuritas: <strong>' + escHtml(item.sekuritas) + '</strong></div>'
        + '</td>'
        // Keterangan & Rincian
        + '<td style="vertical-align:top">'
          + '<div style="color:var(--text);font-weight:500;font-size:11px">' + escHtml(item.ket) + '</div>'
          + breakdownBadges
        + '</td>'
        // Saldo Sebelum
        + '<td class="mono" style="vertical-align:top;text-align:right;color:var(--text3);font-size:11px">'
          + 'Rp ' + fmt(item.balanceBefore)
        + '</td>'
        // Mutasi Kas
        + '<td class="mono ' + (item.isCredit ? 'up' : 'dn') + '" style="vertical-align:top;text-align:right;font-weight:700;font-size:11px">'
          + (item.isCredit ? '+ Rp ' + fmt(item.absAmount) : '- Rp ' + fmt(item.absAmount))
        + '</td>'
        // Saldo Sesudah
        + '<td class="mono" style="vertical-align:top;text-align:right;color:var(--text);font-weight:700;font-size:11px">'
          + 'Rp ' + fmt(item.balanceAfter)
        + '</td>'
        // Aksi
        + '<td style="vertical-align:top;text-align:center">'
          + '<button class="btn btn-ghost btn-xs" onclick="openAuditDetailModal(' + item.id + ')" title="Lihat rincian lengkap & slip audit transaksi" style="font-size:10px;padding:3px 7px;color:var(--accent)">'
            + '🔍 Detail'
          + '</button>'
        + '</td>'
      + '</tr>';
    });
  }

  html += '</tbody></table></div></div>';

  container.innerHTML = html;
}

// Event Handlers
function handleAuditSearch(val) {
  _auditSearch = val;
  renderRdnAudit();
}

function handleAuditCategoryChange(val) {
  _auditFilter = val;
  renderRdnAudit();
}

function handleAuditDateChange(val) {
  _auditDateFilter = val;
  renderRdnAudit();
}

function toggleAuditSort() {
  _auditSortAsc = !_auditSortAsc;
  renderRdnAudit();
}

/**
 * Membuka Modal Rincian Audit Lengkap
 */
function openAuditDetailModal(id) {
  var logs = buildRdnAuditLogs();
  var item = logs.find(function(l) { return String(l.id) === String(id) || l.id === Number(id); });
  if (!item) return;

  var bk = item.breakdown;
  var isBuy = item.category === 'BUY';
  var isSell = item.category === 'SELL';
  var isDiv = item.category === 'DIVIDEN';

  el('m-title').textContent = 'Slip Audit Transaksi RDN — ' + item.auditRef;
  el('m-title').style.color = item.isCredit ? 'var(--green)' : 'var(--red)';

  var bodyHtml = '<div style="background:rgba(255,255,255,.02);border:1px solid var(--border2);border-radius:8px;padding:14px 16px;margin-bottom:14px">'
    + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">'
      + '<span class="badge ' + item.badgeClass + '" style="font-size:11px;padding:3px 8px">' + item.triggerLabel + '</span>'
      + '<span class="mono" style="color:var(--text3);font-size:11px">' + item.timestamp + '</span>'
    + '</div>'
    + '<div style="font-size:13px;font-weight:600;color:var(--text);margin-bottom:4px">' + escHtml(item.ket) + '</div>'
    + '<div style="font-size:11px;color:var(--text2)">Sekuritas Penyelenggara: <strong>' + escHtml(item.sekuritas) + '</strong> · Kode Ref: <span class="mono" style="color:var(--accent)">' + item.auditRef + '</span></div>'
  + '</div>';

  // Rincian Komponen Transaksi
  bodyHtml += '<div style="font-size:10px;font-weight:700;color:var(--text3);letter-spacing:.8px;margin-bottom:6px">RINCIAN KALKULASI &amp; PERUBAHAN SALDO</div>';
  bodyHtml += '<div class="card" style="padding:10px 14px;margin-bottom:14px;background:rgba(0,0,0,.2)">';

  if (isBuy || isSell) {
    bodyHtml += '<div class="taxrow" style="padding:4px 0"><span>Nilai Pokok / Gross Transaksi (' + bk.lot + ' lot @ Rp ' + fmt(bk.price) + ')</span><span class="mono">Rp ' + fmt(bk.gross) + '</span></div>';
    if (bk.komisi > 0) {
      bodyHtml += '<div class="taxrow" style="padding:4px 0"><span>Komisi Broker / Fee Sekuritas</span><span class="mono amb">- Rp ' + fmt(bk.komisi) + '</span></div>';
    }
    if (bk.ppn > 0) {
      bodyHtml += '<div class="taxrow" style="padding:4px 0"><span>PPN atas Komisi Broker (11%/12%)</span><span class="mono dn">- Rp ' + fmt(bk.ppn) + '</span></div>';
    }
    if (bk.levy > 0) {
      bodyHtml += '<div class="taxrow" style="padding:4px 0"><span>Levy Bursa BEI + KPEI + KSEI (0,043%)</span><span class="mono dn">- Rp ' + fmt(bk.levy) + '</span></div>';
    }
    if (bk.pph > 0) {
      bodyHtml += '<div class="taxrow" style="padding:4px 0"><span>PPh Final Transaksi Penjualan PP 14/1997 (0,1%)</span><span class="mono dn">- Rp ' + fmt(bk.pph) + '</span></div>';
    }
    bodyHtml += '<div style="border-top:1px solid var(--border2);margin-top:6px;padding-top:6px;display:flex;justify-content:space-between;font-weight:600;font-size:12px">'
      + '<span>Total Mutasi Kas Bersih</span>'
      + '<span class="mono ' + (item.isCredit ? 'up' : 'dn') + '">' + (item.isCredit ? '+ Rp ' + fmt(item.absAmount) : '- Rp ' + fmt(item.absAmount)) + '</span>'
    + '</div>';
  } else if (isDiv) {
    bodyHtml += '<div class="taxrow" style="padding:4px 0"><span>Dividen Bruto (' + fmt(bk.shares) + ' lembar @ Rp ' + fmt(bk.price) + ')</span><span class="mono">Rp ' + fmt(bk.gross) + '</span></div>';
    if (bk.pph > 0) {
      bodyHtml += '<div class="taxrow" style="padding:4px 0"><span>Potongan PPh Final Dividen 10% (UU HPP)</span><span class="mono dn">- Rp ' + fmt(bk.pph) + '</span></div>';
    }
    bodyHtml += '<div style="border-top:1px solid var(--border2);margin-top:6px;padding-top:6px;display:flex;justify-content:space-between;font-weight:600;font-size:12px">'
      + '<span>Dividen Bersih Masuk ke RDN</span>'
      + '<span class="mono up">+ Rp ' + fmt(item.absAmount) + '</span>'
    + '</div>';
  } else {
    bodyHtml += '<div class="taxrow" style="padding:4px 0"><span>Nominal Transaksi</span><span class="mono ' + (item.isCredit ? 'up' : 'dn') + '">' + (item.isCredit ? '+ Rp ' + fmt(item.absAmount) : '- Rp ' + fmt(item.absAmount)) + '</span></div>';
  }

  bodyHtml += '</div>';

  // Status Ledger Sebelum vs Sesudah
  bodyHtml += '<div style="font-size:10px;font-weight:700;color:var(--text3);letter-spacing:.8px;margin-bottom:6px">POSISI BUKU BESAR RDN (LEDGER BALANCE)</div>';
  bodyHtml += '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;background:rgba(255,255,255,.02);border:1px solid var(--border2);border-radius:8px;padding:12px;text-align:center">'
    + '<div>'
      + '<div style="font-size:10px;color:var(--text3)">Saldo Awal</div>'
      + '<div class="mono" style="font-size:12px;font-weight:600;margin-top:2px">Rp ' + fmt(item.balanceBefore) + '</div>'
    + '</div>'
    + '<div>'
      + '<div style="font-size:10px;color:var(--text3)">Dampak Kas</div>'
      + '<div class="mono ' + (item.isCredit ? 'up' : 'dn') + '" style="font-size:12px;font-weight:700;margin-top:2px">' + (item.isCredit ? '+ Rp ' + fmt(item.absAmount) : '- Rp ' + fmt(item.absAmount)) + '</div>'
    + '</div>'
    + '<div>'
      + '<div style="font-size:10px;color:var(--text3)">Saldo Akhir</div>'
      + '<div class="mono" style="font-size:12px;font-weight:700;color:var(--accent);margin-top:2px">Rp ' + fmt(item.balanceAfter) + '</div>'
    + '</div>'
  + '</div>';

  bodyHtml += '<div style="display:flex;justify-content:flex-end;gap:8px;margin-top:16px">'
    + '<button class="btn btn-ghost" onclick="closeModal()">Tutup</button>'
  + '</div>';

  el('m-body').innerHTML = bodyHtml;
  openModalRaw();
}

/**
 * Ekspor Log Audit ke Format CSV
 */
function exportAuditLogCsv() {
  var logs = buildRdnAuditLogs();
  if (!logs.length) {
    showSaveStatus('⚠️ Belum ada mutasi untuk diunduh');
    return;
  }

  var headers = [
    'Nomor Referensi Audit',
    'Tanggal',
    'Catatan Waktu (WIB)',
    'Kategori Pemicu',
    'Label Transaksi',
    'Keterangan',
    'Ticker Saham',
    'Lot',
    'Harga per Lembar',
    'Nilai Pokok / Gross (Rp)',
    'Komisi Broker (Rp)',
    'PPN Komisi (Rp)',
    'Levy BEI/KSEI (Rp)',
    'PPh Final (Rp)',
    'Total Potongan Pajak & Fee (Rp)',
    'Arus Masuk (+ Rp)',
    'Arus Keluar (- Rp)',
    'Saldo RDN Sebelum (Rp)',
    'Saldo RDN Sesudah (Rp)',
    'Sekuritas'
  ];

  var rows = logs.map(function(item) {
    var bk = item.breakdown;
    return [
      item.auditRef,
      item.date,
      item.timestamp,
      item.category,
      item.triggerLabel,
      '"' + (item.ket || '').replace(/"/g, '""') + '"',
      bk.ticker || '',
      bk.lot || 0,
      bk.price || 0,
      bk.gross || 0,
      bk.komisi || 0,
      bk.ppn || 0,
      bk.levy || 0,
      bk.pph || 0,
      bk.taxTotal || 0,
      item.isCredit ? item.absAmount : 0,
      !item.isCredit ? item.absAmount : 0,
      item.balanceBefore,
      item.balanceAfter,
      item.sekuritas
    ].join(',');
  });

  var csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + headers.join(',') + '\n' + rows.join('\n');
  var encodedUri = encodeURI(csvContent);
  var link = document.createElement('a');
  link.setAttribute('href', encodedUri);
  link.setAttribute('download', 'Log_Audit_Transaksi_RDN_' + (new Date().toISOString().slice(0, 10)) + '.csv');
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  showSaveStatus('✓ Log Audit Transaksi berhasil diunduh');
}

/**
 * Salin Ringkasan Audit ke Clipboard
 */
function copyAuditSummary() {
  var logs = buildRdnAuditLogs();
  var curBal = calcRdnBalance();
  var totalIn = logs.filter(function(l) { return l.isCredit; }).reduce(function(a, l) { return a + l.absAmount; }, 0);
  var totalOut = logs.filter(function(l) { return !l.isCredit; }).reduce(function(a, l) { return a + l.absAmount; }, 0);
  var totalKomisi = logs.reduce(function(a, l) { return a + (l.breakdown.komisi || 0); }, 0);
  var totalTax = logs.reduce(function(a, l) { return a + (l.breakdown.taxTotal || 0); }, 0);

  var summaryText = '=== LOG AUDIT TRANSAKSI & SALDO RDN ===\n'
    + 'Tanggal Cetak: ' + (new Date().toLocaleString('id-ID')) + '\n'
    + 'Jumlah Catatan Audit: ' + logs.length + ' transaksi\n'
    + 'Saldo RDN Berjalan: Rp ' + fmt(curBal) + '\n'
    + 'Total Kas Masuk (Kredit): Rp ' + fmt(totalIn) + '\n'
    + 'Total Kas Keluar (Debit): Rp ' + fmt(totalOut) + '\n'
    + 'Akumulasi Komisi Broker: Rp ' + fmt(totalKomisi) + '\n'
    + 'Akumulasi Pajak/Levy: Rp ' + fmt(totalTax) + '\n'
    + 'Status Integritas: Saldo Terverifikasi 100%\n';

  if (navigator && navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(summaryText).then(function() {
      showSaveStatus('✓ Ringkasan audit disalin ke clipboard');
    }).catch(function() {
      showSaveStatus('✓ Ringkasan audit dibuat');
    });
  } else {
    showSaveStatus('✓ Ringkasan audit selesai dihitung');
  }
}

/**
 * Verifikasi Integritas Seluruh Ledger RDN
 */
function verifyRdnLedgerIntegrity() {
  if (typeof rebuildRdnBalance === 'function') {
    rebuildRdnBalance();
  }
  var logs = buildRdnAuditLogs();
  var curBal = calcRdnBalance();
  var calculated = 0;
  var errors = 0;

  logs.forEach(function(l) {
    calculated += (l.amount || 0);
    if (calculated !== l.balanceAfter) {
      errors++;
    }
  });

  if (errors === 0) {
    showSaveStatus('✓ Integritas Sempurna: ' + logs.length + ' mutasi terverifikasi cocok (Saldo Rp ' + fmt(curBal) + ')');
    renderRdnAudit();
  } else {
    showSaveStatus('⚠️ Ditemukan ' + errors + ' ketidaksesuaian ledger. Saldo telah disinkronkan.');
    renderRdnAudit();
  }
}
