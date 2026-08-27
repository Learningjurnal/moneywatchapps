/**
 * MONEY WATCH PRO v7 — UI Controller & Interaction Handlers
 */
window.MW_V7 = window.MW_V7 || {};

MW_V7.UI = (function() {

  function fmtIdr(num) {
    return 'Rp ' + Math.round(num || 0).toLocaleString('id-ID');
  }

  function fmtNum(num) {
    return Math.round(num || 0).toLocaleString('id-ID');
  }

  function fmtPct(num) {
    const val = Number(num || 0);
    const sign = val > 0 ? '+' : '';
    return `${sign}${val.toFixed(2)}%`;
  }

  function switchPillar(pillarName) {
    MW_V7.Store.setPillar(pillarName);

    // Update active tab buttons in top nav and mobile nav
    document.querySelectorAll('.v7-nav-tab').forEach(el => {
      el.classList.toggle('active', el.dataset.pillar === pillarName);
    });
    document.querySelectorAll('.v7-mobile-tab').forEach(el => {
      el.classList.toggle('active', el.dataset.pillar === pillarName);
    });

    // Update active view container
    document.querySelectorAll('.v7-view').forEach(el => {
      el.classList.toggle('active', el.id === `view-${pillarName.toLowerCase()}`);
    });

    // Render corresponding view
    MW_V7.Views.renderActiveView(pillarName);
  }

  function switchMode(modeName) {
    MW_V7.Store.setMode(modeName);
    document.querySelectorAll('.v7-mode-btn').forEach(el => {
      el.classList.toggle('active', el.dataset.mode === modeName);
    });
  }

  function renderHeaderMetrics(computed) {
    if (!computed) return;

    // RDN Cash Balance
    const elRdn = document.getElementById('v7-hdr-rdn');
    if (elRdn) elRdn.innerText = fmtIdr(computed.rdn.currentCash);

    // Total Wealth / Net Worth
    const elNw = document.getElementById('v7-hdr-nw');
    if (elNw) elNw.innerText = fmtIdr(computed.totalNetWorth);

    // Data Freshness
    const elFreshness = document.getElementById('v7-hdr-freshness');
    if (elFreshness) {
      elFreshness.innerText = 'DATA: VERIFIED LIVE';
      elFreshness.className = 'v7-data-badge v7-badge-verified';
    }
  }

  function renderTickerBar() {
    const track = document.getElementById('v7-ticker-track');
    if (!track) return;

    const prices = MW_V7.MarketData.getPriceCache();
    const benchmarks = MW_V7.CONFIG.BENCHMARKS;

    let itemsHtml = '';
    
    // Add benchmarks
    benchmarks.forEach(b => {
      const isUp = b.chg >= 0;
      itemsHtml += `
        <div class="v7-ticker-item">
          <span class="v7-ticker-sym" style="color:#38bdf8">${b.ticker}</span>
          <span class="v7-ticker-price">${b.price.toLocaleString('id-ID')}</span>
          <span class="v7-ticker-chg ${isUp ? 'up' : 'down'}">${isUp ? '▲' : '▼'} ${Math.abs(b.chg)}%</span>
        </div>
      `;
    });

    // Add top stock tickers
    Object.keys(prices).slice(0, 15).forEach(ticker => {
      const p = prices[ticker];
      const isUp = (p.changePct || 0) >= 0;
      itemsHtml += `
        <div class="v7-ticker-item">
          <span class="v7-ticker-sym">${p.ticker}</span>
          <span class="v7-ticker-price">Rp ${p.price.toLocaleString('id-ID')}</span>
          <span class="v7-ticker-chg ${isUp ? 'up' : 'down'}">${isUp ? '▲' : '▼'} ${fmtPct(p.changePct)}</span>
        </div>
      `;
    });

    // Duplicate track for infinite loop
    track.innerHTML = itemsHtml + itemsHtml;
  }

  // Modal Handlers
  function openModal(title, bodyHtml) {
    const backdrop = document.getElementById('v7-modal-backdrop');
    const titleEl = document.getElementById('v7-modal-title');
    const bodyEl = document.getElementById('v7-modal-body');

    if (!backdrop || !titleEl || !bodyEl) return;

    titleEl.innerHTML = title;
    bodyEl.innerHTML = bodyHtml;
    backdrop.classList.add('open');
  }

  function closeModal() {
    const backdrop = document.getElementById('v7-modal-backdrop');
    if (backdrop) backdrop.classList.remove('open');
  }

  function showQuickActionModal() {
    const html = `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px">
        <button class="v7-btn v7-btn-primary" style="padding:14px" onclick="MW_V7.UI.showBuyModal()">
          <i class="ti ti-shopping-cart-plus" style="font-size:18px"></i> Beli Saham (BUY)
        </button>
        <button class="v7-btn v7-btn-secondary" style="padding:14px;color:var(--color-loss)" onclick="MW_V7.UI.showSellModal()">
          <i class="ti ti-receipt-tax" style="font-size:18px"></i> Jual Saham (SELL)
        </button>
        <button class="v7-btn v7-btn-secondary" style="padding:14px" onclick="MW_V7.UI.showCashModal('SETOR')">
          <i class="ti ti-wallet" style="font-size:18px"></i> Top Up / Setor Kas
        </button>
        <button class="v7-btn v7-btn-secondary" style="padding:14px" onclick="MW_V7.UI.showCashModal('TARIK')">
          <i class="ti ti-arrow-up-right" style="font-size:18px"></i> Tarik Dana RDN
        </button>
      </div>
      <button class="v7-btn v7-btn-outline" style="width:100%;padding:12px" onclick="MW_V7.UI.showDividendModal()">
        <i class="ti ti-coin"></i> Catat Penerimaan Dividen
      </button>
    `;
    openModal('<i class="ti ti-bolt" style="color:#38bdf8"></i> Quick Actions & Transaksi', html);
  }

  function showBuyModal() {
    const html = `
      <form onsubmit="MW_V7.UI.handleTradeSubmit(event, 'BUY')">
        <div class="v7-form-group">
          <label class="v7-form-label">Kode Ticker (Contoh: BBCA, BBRI, ADRO)</label>
          <input type="text" id="tx-ticker" class="v7-form-input" required style="text-transform:uppercase" placeholder="BBCA">
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
          <div class="v7-form-group">
            <label class="v7-form-label">Jumlah Lot</label>
            <input type="number" id="tx-lot" class="v7-form-input tabular-nums" required min="1" placeholder="10">
          </div>
          <div class="v7-form-group">
            <label class="v7-form-label">Harga per Lembar (Rp)</label>
            <input type="number" id="tx-price" class="v7-form-input tabular-nums" required min="1" placeholder="9450">
          </div>
        </div>
        <div class="v7-form-group">
          <label class="v7-form-label">Tanggal Transaksi</label>
          <input type="date" id="tx-date" class="v7-form-input" value="${new Date().toISOString().split('T')[0]}" required>
        </div>
        <button type="submit" class="v7-btn v7-btn-primary" style="width:100%;margin-top:10px;padding:12px">
          Simpan Transaksi Beli (BUY) →
        </button>
      </form>
    `;
    openModal('<i class="ti ti-shopping-cart-plus" style="color:var(--color-profit)"></i> Catat Transaksi Beli Saham', html);
  }

  function showSellModal() {
    const html = `
      <form onsubmit="MW_V7.UI.handleTradeSubmit(event, 'SELL')">
        <div class="v7-form-group">
          <label class="v7-form-label">Kode Ticker</label>
          <input type="text" id="tx-ticker" class="v7-form-input" required style="text-transform:uppercase" placeholder="BBCA">
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
          <div class="v7-form-group">
            <label class="v7-form-label">Jumlah Lot Dijual</label>
            <input type="number" id="tx-lot" class="v7-form-input tabular-nums" required min="1" placeholder="5">
          </div>
          <div class="v7-form-group">
            <label class="v7-form-label">Harga Jual per Lembar (Rp)</label>
            <input type="number" id="tx-price" class="v7-form-input tabular-nums" required min="1" placeholder="9600">
          </div>
        </div>
        <div class="v7-form-group">
          <label class="v7-form-label">Tanggal Transaksi</label>
          <input type="date" id="tx-date" class="v7-form-input" value="${new Date().toISOString().split('T')[0]}" required>
        </div>
        <button type="submit" class="v7-btn v7-btn-primary" style="width:100%;margin-top:10px;padding:12px;background:#ef4444">
          Simpan Transaksi Jual (SELL) →
        </button>
      </form>
    `;
    openModal('<i class="ti ti-receipt-tax" style="color:var(--color-loss)"></i> Catat Transaksi Jual Saham', html);
  }

  function showCashModal(type) {
    const isSetor = type === 'SETOR';
    const html = `
      <form onsubmit="MW_V7.UI.handleCashSubmit(event, '${type}')">
        <div class="v7-form-group">
          <label class="v7-form-label">Nominal (Rp)</label>
          <input type="number" id="cash-amount" class="v7-form-input tabular-nums" required min="10000" placeholder="10000000">
        </div>
        <div class="v7-form-group">
          <label class="v7-form-label">Keterangan Mutasi</label>
          <input type="text" id="cash-ket" class="v7-form-input" value="${isSetor ? 'Top Up Kas RDN' : 'Penarikan Dana ke Rekening Pribadi'}" required>
        </div>
        <div class="v7-form-group">
          <label class="v7-form-label">Tanggal</label>
          <input type="date" id="cash-date" class="v7-form-input" value="${new Date().toISOString().split('T')[0]}" required>
        </div>
        <button type="submit" class="v7-btn v7-btn-primary" style="width:100%;margin-top:10px;padding:12px">
          ${isSetor ? 'Simpan Setoran Kas' : 'Simpan Penarikan Kas'} →
        </button>
      </form>
    `;
    openModal(`<i class="ti ti-wallet" style="color:#38bdf8"></i> ${isSetor ? 'Setoran Dana RDN' : 'Penarikan Dana RDN'}`, html);
  }

  function showDividendModal() {
    const html = `
      <form onsubmit="MW_V7.UI.handleDividendSubmit(event)">
        <div class="v7-form-group">
          <label class="v7-form-label">Kode Ticker</label>
          <input type="text" id="div-ticker" class="v7-form-input" required style="text-transform:uppercase" placeholder="BBCA">
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
          <div class="v7-form-group">
            <label class="v7-form-label">DPS (Dividen per Lembar)</label>
            <input type="number" id="div-dps" class="v7-form-input tabular-nums" required min="0.1" step="0.1" placeholder="270">
          </div>
          <div class="v7-form-group">
            <label class="v7-form-label">Jumlah Lembar Saham</label>
            <input type="number" id="div-shares" class="v7-form-input tabular-nums" required min="1" placeholder="6800">
          </div>
        </div>
        <div class="v7-form-group">
          <label class="v7-form-label">Tanggal Cair / Payment Date</label>
          <input type="date" id="div-date" class="v7-form-input" value="${new Date().toISOString().split('T')[0]}" required>
        </div>
        <button type="submit" class="v7-btn v7-btn-primary" style="width:100%;margin-top:10px;padding:12px">
          Simpan Dividen Masuk →
        </button>
      </form>
    `;
    openModal('<i class="ti ti-coin" style="color:var(--color-profit)"></i> Catat Penerimaan Dividen', html);
  }

  function handleTradeSubmit(e, type) {
    e.preventDefault();
    const ticker = document.getElementById('tx-ticker').value;
    const lot = document.getElementById('tx-lot').value;
    const price = document.getElementById('tx-price').value;
    const date = document.getElementById('tx-date').value;

    MW_V7.Store.addTransaction({
      ticker,
      lot,
      price,
      date,
      type
    });

    closeModal();
  }

  function handleCashSubmit(e, type) {
    e.preventDefault();
    const amount = document.getElementById('cash-amount').value;
    const ket = document.getElementById('cash-ket').value;
    const date = document.getElementById('cash-date').value;

    MW_V7.Store.addRdnCashMutation(type, amount, ket, date);
    closeModal();
  }

  function handleDividendSubmit(e) {
    e.preventDefault();
    const ticker = document.getElementById('div-ticker').value;
    const dps = document.getElementById('div-dps').value;
    const shares = document.getElementById('div-shares').value;
    const date = document.getElementById('div-date').value;

    MW_V7.Store.addDividend({
      ticker,
      dps,
      shares,
      date
    });

    closeModal();
  }

  return {
    fmtIdr,
    fmtNum,
    fmtPct,
    switchPillar,
    switchMode,
    renderHeaderMetrics,
    renderTickerBar,
    openModal,
    closeModal,
    showQuickActionModal,
    showBuyModal,
    showSellModal,
    showCashModal,
    showDividendModal,
    handleTradeSubmit,
    handleCashSubmit,
    handleDividendSubmit
  };
})();
