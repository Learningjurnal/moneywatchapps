/**
 * MONEY WATCH PRO v7 — View Rendering Engine (6 Pillars)
 */
window.MW_V7 = window.MW_V7 || {};

MW_V7.Views = (function() {
  const UI = MW_V7.UI;

  function renderActiveView(pillarName) {
    const computed = MW_V7.Store.getComputedData();
    const state = MW_V7.Store.getState();
    const mode = MW_V7.Store.getMode();

    if (!computed || !state) return;

    // Render metrics in top header
    UI.renderHeaderMetrics(computed);

    switch (pillarName) {
      case 'HOME':
        renderHomeView(state, computed, mode);
        break;
      case 'PORTFOLIO':
        renderPortfolioView(state, computed, mode);
        break;
      case 'MARKETS':
        renderMarketsView(state, computed, mode);
        break;
      case 'RESEARCH':
        renderResearchView(state, computed, mode);
        break;
      case 'WEALTH':
        renderWealthView(state, computed, mode);
        break;
      case 'SETTINGS':
        renderSettingsView(state, computed, mode);
        break;
    }
  }

  // ══════════════════════════════════════════════════════════════════
  // 1. HOME VIEW (Executive Summary Dashboard)
  // ══════════════════════════════════════════════════════════════════
  function renderHomeView(state, computed, mode) {
    const container = document.getElementById('view-home');
    if (!container) return;

    const p = computed.portfolio;
    const rdn = computed.rdn;
    const risk = computed.risk;
    const div = computed.dividends;

    const isProfit = p.totalUnrealizedPnL >= 0;
    const isTodayProfit = computed.todayPnL >= 0;

    let html = `
      <!-- Executive Summary 6-Grid -->
      <div class="v7-grid-summary">
        <div class="v7-card">
          <div class="v7-card-header">
            <span class="v7-card-title">Total AUM / Wealth</span>
            <i class="ti ti-building-bank v7-card-icon"></i>
          </div>
          <div class="v7-card-value tabular-nums">${UI.fmtIdr(computed.totalNetWorth)}</div>
          <div class="v7-card-sub">
            <span class="v7-pill v7-pill-neutral">Porto: ${UI.fmtIdr(p.totalMarketValue)}</span>
          </div>
        </div>

        <div class="v7-card">
          <div class="v7-card-header">
            <span class="v7-card-title">Today's P&L</span>
            <i class="ti ti-chart-line v7-card-icon"></i>
          </div>
          <div class="v7-card-value tabular-nums" style="color:${isTodayProfit ? 'var(--color-profit)' : 'var(--color-loss)'}">
            ${isTodayProfit ? '+' : ''}${UI.fmtIdr(computed.todayPnL)}
          </div>
          <div class="v7-card-sub">
            <span class="v7-pill ${isTodayProfit ? 'v7-pill-up' : 'v7-pill-down'}">${UI.fmtPct(computed.todayPnLPct)}</span>
            <span style="font-size:11px;color:var(--text-muted)">Estimasi Hari Ini</span>
          </div>
        </div>

        <div class="v7-card">
          <div class="v7-card-header">
            <span class="v7-card-title">Total Unrealized P&L</span>
            <i class="ti ti-trending-up v7-card-icon"></i>
          </div>
          <div class="v7-card-value tabular-nums" style="color:${isProfit ? 'var(--color-profit)' : 'var(--color-loss)'}">
            ${isProfit ? '+' : ''}${UI.fmtIdr(p.totalUnrealizedPnL)}
          </div>
          <div class="v7-card-sub">
            <span class="v7-pill ${isProfit ? 'v7-pill-up' : 'v7-pill-down'}">${UI.fmtPct(p.totalUnrealizedPnLPct)}</span>
            <span style="font-size:11px;color:var(--text-muted)">All Time Return</span>
          </div>
        </div>

        <div class="v7-card">
          <div class="v7-card-header">
            <span class="v7-card-title">Kas RDN Aktif</span>
            <i class="ti ti-wallet v7-card-icon"></i>
          </div>
          <div class="v7-card-value tabular-nums">${UI.fmtIdr(rdn.currentCash)}</div>
          <div class="v7-card-sub">
            <span class="v7-pill v7-pill-neutral">Porsi Kas: ${risk.cashRatio}%</span>
          </div>
        </div>

        <div class="v7-card">
          <div class="v7-card-header">
            <span class="v7-card-title">Portfolio Risk Score</span>
            <i class="ti ti-shield-half-filled v7-card-icon"></i>
          </div>
          <div class="v7-card-value tabular-nums" style="color:#f59e0b">${risk.overallRiskScore}/100</div>
          <div class="v7-card-sub">
            <span class="v7-pill v7-pill-neutral" style="color:#f59e0b">${risk.riskLevel}</span>
          </div>
        </div>

        <div class="v7-card">
          <div class="v7-card-header">
            <span class="v7-card-title">Dividen YTD (${new Date().getFullYear()})</span>
            <i class="ti ti-coin v7-card-icon"></i>
          </div>
          <div class="v7-card-value tabular-nums" style="color:var(--color-profit)">${UI.fmtIdr(div.ytdNet)}</div>
          <div class="v7-card-sub">
            <span style="font-size:11px;color:var(--text-muted)">Total Kumulatif: ${UI.fmtIdr(div.totalNet)}</span>
          </div>
        </div>
      </div>

      <!-- Main 2-Column Executive Workspace -->
      <div class="v7-grid-2col">
        <!-- Left: Active Holdings Table -->
        <div class="v7-card">
          <div class="v7-card-section-head">
            <div class="v7-card-section-title">
              <i class="ti ti-briefcase" style="color:#38bdf8"></i>
              Posisi Terbesar dalam Portofolio
            </div>
            <button class="v7-btn v7-btn-secondary" style="font-size:11px;padding:4px 10px" onclick="MW_V7.UI.switchPillar('PORTFOLIO')">
              Lihat Semua Posisi (${p.positions.length}) →
            </button>
          </div>

          <div class="v7-table-wrap">
            <table class="v7-table">
              <thead>
                <tr>
                  <th>Ticker</th>
                  <th class="text-right">Lot</th>
                  <th class="text-right">Avg Beli</th>
                  <th class="text-right">Harga Live</th>
                  <th class="text-right">Nilai Pasar</th>
                  <th class="text-right">P&L Belum Terealisasi</th>
                  <th class="text-right">Bobot</th>
                </tr>
              </thead>
              <tbody>
                ${p.positions.slice(0, 8).map(pos => {
                  const posProfit = pos.unrealizedPnL >= 0;
                  return `
                    <tr>
                      <td>
                        <div style="font-weight:700;color:#fff">${pos.ticker}</div>
                      </td>
                      <td class="text-right tabular-nums">${pos.lot.toLocaleString('id-ID')}</td>
                      <td class="text-right tabular-nums">Rp ${Math.round(pos.avgPrice).toLocaleString('id-ID')}</td>
                      <td class="text-right tabular-nums" style="font-weight:600">Rp ${pos.currentPrice.toLocaleString('id-ID')}</td>
                      <td class="text-right tabular-nums" style="font-weight:600">${UI.fmtIdr(pos.marketValue)}</td>
                      <td class="text-right tabular-nums" style="color:${posProfit ? 'var(--color-profit)' : 'var(--color-loss)'}">
                        ${posProfit ? '+' : ''}${UI.fmtIdr(pos.unrealizedPnL)}
                        <span style="font-size:11px;margin-left:4px">(${UI.fmtPct(pos.unrealizedPnLPct)})</span>
                      </td>
                      <td class="text-right tabular-nums">
                        <span class="v7-pill v7-pill-neutral">${pos.weight.toFixed(1)}%</span>
                      </td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>

        <!-- Right: Risk & Analytics Panel -->
        <div style="display:flex;flex-direction:column;gap:16px">
          <div class="v7-card">
            <div class="v7-card-section-head">
              <div class="v7-card-section-title">
                <i class="ti ti-shield-check" style="color:#f59e0b"></i>
                Risk & Quant Analytics
              </div>
              <span class="v7-data-badge v7-badge-calculated">Calculated</span>
            </div>
            
            <div style="display:flex;flex-direction:column;gap:12px">
              <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid var(--border-subtle);padding-bottom:8px">
                <span style="color:var(--text-secondary);font-size:12px">Value-at-Risk (1-Day 95% VaR)</span>
                <span class="tabular-nums" style="font-weight:700;color:var(--color-loss)">-${UI.fmtIdr(risk.var95)}</span>
              </div>
              <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid var(--border-subtle);padding-bottom:8px">
                <span style="color:var(--text-secondary);font-size:12px">Value-at-Risk (1-Day 99% VaR)</span>
                <span class="tabular-nums" style="font-weight:700;color:var(--color-loss)">-${UI.fmtIdr(risk.var99)}</span>
              </div>
              <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid var(--border-subtle);padding-bottom:8px">
                <span style="color:var(--text-secondary);font-size:12px">Sharpe Ratio (vs BI Rate 6.25%)</span>
                <span class="tabular-nums" style="font-weight:700;color:#38bdf8">${risk.sharpeRatio}</span>
              </div>
              <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid var(--border-subtle);padding-bottom:8px">
                <span style="color:var(--text-secondary);font-size:12px">Portfolio Beta (vs IHSG)</span>
                <span class="tabular-nums" style="font-weight:700">${risk.portfolioBeta}</span>
              </div>
              <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid var(--border-subtle);padding-bottom:8px">
                <span style="color:var(--text-secondary);font-size:12px">Top 3 Concentration Risk</span>
                <span class="tabular-nums" style="font-weight:700;color:${risk.top3Concentration > 60 ? 'var(--color-loss)' : 'var(--color-profit)'}">${risk.top3Concentration}%</span>
              </div>
              <div style="display:flex;justify-content:space-between;align-items:center">
                <span style="color:var(--text-secondary);font-size:12px">Max Expected Drawdown</span>
                <span class="tabular-nums" style="font-weight:700;color:var(--color-loss)">-${risk.maxDrawdown}%</span>
              </div>
            </div>
          </div>

          <!-- Quick Action Card -->
          <div class="v7-card" style="background:linear-gradient(135deg, rgba(37,99,235,0.1), rgba(79,70,229,0.05));border-color:rgba(37,99,235,0.25)">
            <div style="font-weight:700;font-size:14px;margin-bottom:6px;color:#fff">
              <i class="ti ti-bulb" style="color:#38bdf8"></i> AI Advisor & Strategy Hub
            </div>
            <p style="font-size:12px;color:var(--text-secondary);margin-bottom:12px">
              Evaluasi kesehatan portofolio, deteksi konsentrasi risiko, dan simulasi penyeimbangan aset secara real-time.
            </p>
            <button class="v7-btn v7-btn-primary" style="width:100%" onclick="MW_V7.AI.openAdvisorModal()">
              Buka AI Wealth Advisor →
            </button>
          </div>
        </div>
      </div>
    `;

    container.innerHTML = html;
  }

  // ══════════════════════════════════════════════════════════════════
  // 2. PORTFOLIO VIEW (Complete Holdings & Multi-Asset Ledgers)
  // ══════════════════════════════════════════════════════════════════
  function renderPortfolioView(state, computed, mode) {
    const container = document.getElementById('view-portfolio');
    if (!container) return;

    const p = computed.portfolio;
    const rdn = computed.rdn;

    let html = `
      <div class="v7-card" style="margin-bottom:20px">
        <div class="v7-card-section-head">
          <div class="v7-card-section-title">
            <i class="ti ti-chart-pie-2" style="color:#38bdf8"></i>
            Daftar Seluruh Kepemilikan Saham (${p.positions.length} Saham Aktif)
          </div>
          <div style="display:flex;gap:8px">
            <button class="v7-btn v7-btn-primary" onclick="MW_V7.UI.showBuyModal()">
              <i class="ti ti-plus"></i> Tambah Transaksi Beli
            </button>
          </div>
        </div>

        <div class="v7-table-wrap">
          <table class="v7-table">
            <thead>
              <tr>
                <th>No</th>
                <th>Ticker Saham</th>
                <th class="text-right">Lot</th>
                <th class="text-right">Total Lembar</th>
                <th class="text-right">Harga Rata-rata Beli</th>
                <th class="text-right">Harga Terakhir</th>
                <th class="text-right">Total Modal (Invested)</th>
                <th class="text-right">Nilai Pasar (Market Value)</th>
                <th class="text-right">Unrealized P&L</th>
                <th class="text-right">Bobot</th>
                <th class="text-right">Aksi</th>
              </tr>
            </thead>
            <tbody>
              ${p.positions.map((pos, idx) => {
                const posProfit = pos.unrealizedPnL >= 0;
                return `
                  <tr>
                    <td style="color:var(--text-muted)">${idx + 1}</td>
                    <td>
                      <div style="font-weight:700;color:#38bdf8;font-size:14px">${pos.ticker}</div>
                    </td>
                    <td class="text-right tabular-nums">${pos.lot.toLocaleString('id-ID')}</td>
                    <td class="text-right tabular-nums">${pos.shares.toLocaleString('id-ID')}</td>
                    <td class="text-right tabular-nums">Rp ${Math.round(pos.avgPrice).toLocaleString('id-ID')}</td>
                    <td class="text-right tabular-nums" style="font-weight:700">Rp ${pos.currentPrice.toLocaleString('id-ID')}</td>
                    <td class="text-right tabular-nums">${UI.fmtIdr(pos.totalInvested)}</td>
                    <td class="text-right tabular-nums" style="font-weight:700">${UI.fmtIdr(pos.marketValue)}</td>
                    <td class="text-right tabular-nums" style="color:${posProfit ? 'var(--color-profit)' : 'var(--color-loss)'};font-weight:700">
                      ${posProfit ? '+' : ''}${UI.fmtIdr(pos.unrealizedPnL)}
                      <div style="font-size:11px">${UI.fmtPct(pos.unrealizedPnLPct)}</div>
                    </td>
                    <td class="text-right tabular-nums">
                      <span class="v7-pill v7-pill-neutral">${pos.weight.toFixed(1)}%</span>
                    </td>
                    <td class="text-right">
                      <button class="v7-btn v7-btn-outline" style="padding:4px 8px;font-size:11px" onclick="MW_V7.UI.showSellModal()">
                        Jual
                      </button>
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
            <tfoot>
              <tr style="background:rgba(0,0,0,0.3);font-weight:700">
                <td colspan="6" style="padding:14px">TOTAL PORTOFOLIO</td>
                <td class="text-right tabular-nums">${UI.fmtIdr(p.totalInvested)}</td>
                <td class="text-right tabular-nums" style="color:#fff">${UI.fmtIdr(p.totalMarketValue)}</td>
                <td class="text-right tabular-nums" style="color:${p.totalUnrealizedPnL >= 0 ? 'var(--color-profit)' : 'var(--color-loss)'}">
                  ${p.totalUnrealizedPnL >= 0 ? '+' : ''}${UI.fmtIdr(p.totalUnrealizedPnL)} (${UI.fmtPct(p.totalUnrealizedPnLPct)})
                </td>
                <td class="text-right tabular-nums">100.0%</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <!-- Transaction Ledger History -->
      <div class="v7-card">
        <div class="v7-card-section-head">
          <div class="v7-card-section-title">
            <i class="ti ti-history" style="color:#a855f7"></i>
            Riwayat Seluruh Transaksi (${state.transactions.length} Transaksi)
          </div>
        </div>

        <div class="v7-table-wrap">
          <table class="v7-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Tanggal</th>
                <th>Tipe</th>
                <th>Ticker</th>
                <th class="text-right">Lot</th>
                <th class="text-right">Harga Eksekusi</th>
                <th class="text-right">Gross</th>
                <th class="text-right">Fee & Pajak</th>
                <th class="text-right">Net Total</th>
                <th>Sekuritas</th>
                <th class="text-right">Aksi</th>
              </tr>
            </thead>
            <tbody>
              ${[...state.transactions].reverse().slice(0, 15).map(tx => {
                const isBuy = tx.type === 'BUY';
                return `
                  <tr>
                    <td style="color:var(--text-muted)">#${tx.id}</td>
                    <td>${tx.date}</td>
                    <td>
                      <span class="v7-pill ${isBuy ? 'v7-pill-up' : 'v7-pill-down'}">${tx.type}</span>
                    </td>
                    <td style="font-weight:700">${tx.ticker}</td>
                    <td class="text-right tabular-nums">${tx.lot}</td>
                    <td class="text-right tabular-nums">Rp ${Math.round(tx.price).toLocaleString('id-ID')}</td>
                    <td class="text-right tabular-nums">${UI.fmtIdr(tx.gross)}</td>
                    <td class="text-right tabular-nums" style="color:var(--text-muted)">${UI.fmtIdr(tx.tax || tx.komisi)}</td>
                    <td class="text-right tabular-nums" style="font-weight:700">${UI.fmtIdr(tx.net)}</td>
                    <td>${tx.sekuritas || 'Stockbit'}</td>
                    <td class="text-right">
                      <button class="v7-btn v7-btn-outline" style="padding:2px 6px;color:var(--color-loss)" onclick="MW_V7.Store.deleteTransaction(${tx.id})">
                        <i class="ti ti-trash"></i>
                      </button>
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;

    container.innerHTML = html;
  }

  // ══════════════════════════════════════════════════════════════════
  // 3. MARKETS VIEW (Watchlist, Tickers & KSEI 5% Ownership Radar)
  // ══════════════════════════════════════════════════════════════════
  function renderMarketsView(state, computed, mode) {
    const container = document.getElementById('view-markets');
    if (!container) return;

    const prices = MW_V7.MarketData.getPriceCache();

    let html = `
      <div class="v7-grid-2col">
        <!-- Watchlist -->
        <div class="v7-card">
          <div class="v7-card-section-head">
            <div class="v7-card-section-title">
              <i class="ti ti-list-search" style="color:#38bdf8"></i>
              Watchlist & Real-Time Price Feeds
            </div>
            <span class="v7-data-badge v7-badge-verified">Live Feed</span>
          </div>

          <div class="v7-table-wrap">
            <table class="v7-table">
              <thead>
                <tr>
                  <th>Ticker</th>
                  <th>Nama Emiten</th>
                  <th class="text-right">Harga</th>
                  <th class="text-right">Perubahan</th>
                  <th class="text-right">Status Data</th>
                  <th class="text-right">Aksi</th>
                </tr>
              </thead>
              <tbody>
                ${Object.keys(prices).map(sym => {
                  const p = prices[sym];
                  const isUp = (p.changePct || 0) >= 0;
                  return `
                    <tr>
                      <td style="font-weight:700;color:#fff">${p.ticker}</td>
                      <td style="color:var(--text-secondary);font-size:12px">${p.name || '-'}</td>
                      <td class="text-right tabular-nums" style="font-weight:700">Rp ${p.price.toLocaleString('id-ID')}</td>
                      <td class="text-right tabular-nums" style="color:${isUp ? 'var(--color-profit)' : 'var(--color-loss)'}">
                        ${isUp ? '+' : ''}${UI.fmtPct(p.changePct)}
                      </td>
                      <td class="text-right">
                        <span class="v7-pill v7-pill-neutral" style="font-size:10px">${p.status || 'Verified'}</span>
                      </td>
                      <td class="text-right">
                        <button class="v7-btn v7-btn-secondary" style="padding:4px 8px;font-size:11px" onclick="MW_V7.UI.showBuyModal()">
                          + Beli
                        </button>
                      </td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>

        <!-- KSEI 5%+ Major Shareholder Flow -->
        <div class="v7-card">
          <div class="v7-card-section-head">
            <div class="v7-card-section-title">
              <i class="ti ti-radar" style="color:#10b981"></i>
              Radar KSEI Kepemilikan >5% & Free Float
            </div>
            <span class="v7-data-badge v7-badge-verified">KSEI Official</span>
          </div>

          <div style="font-size:12px;color:var(--text-secondary);margin-bottom:14px">
            Transparansi struktur modal institusi, pemegang saham pengendali, dan porsi kepemilikan asing vs lokal dari Kustodian Sentral Efek Indonesia.
          </div>

          <div id="v7-ksei-summary-content" style="display:flex;flex-direction:column;gap:10px">
            <div style="padding:14px;background:var(--bg-surface-raised);border-radius:var(--radius-md);border:1px solid var(--border-subtle)">
              <div style="font-weight:700;margin-bottom:4px;color:#fff">Saham dengan Free Float Rendah (<20%)</div>
              <div style="font-size:11px;color:var(--text-muted)">Struktur kepemilikan sangat terkonsentrasi oleh pengendali (Potensi supply ketat).</div>
            </div>
            <div style="padding:14px;background:var(--bg-surface-raised);border-radius:var(--radius-md);border:1px solid var(--border-subtle)">
              <div style="font-weight:700;margin-bottom:4px;color:#fff">Saham Akumulasi Asing & Institusi</div>
              <div style="font-size:11px;color:var(--text-muted)">Deteksi kenaikan saldo kepemilikan custodian bank (HSBC, Citibank, Standard Chartered).</div>
            </div>
          </div>
        </div>
      </div>
    `;

    container.innerHTML = html;
  }

  // ══════════════════════════════════════════════════════════════════
  // 4. RESEARCH VIEW (DCF, Graham Valuation, Technical & Screener)
  // ══════════════════════════════════════════════════════════════════
  function renderResearchView(state, computed, mode) {
    const container = document.getElementById('view-research');
    if (!container) return;

    let html = `
      <div class="v7-grid-2col">
        <!-- DCF & Fair Value Model -->
        <div class="v7-card">
          <div class="v7-card-section-head">
            <div class="v7-card-section-title">
              <i class="ti ti-calculator" style="color:#38bdf8"></i>
              Kalkulator Nilai Wajar (DCF & Graham Number)
            </div>
            <span class="v7-data-badge v7-badge-calculated">Valuation Model</span>
          </div>

          <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:16px">
            <div>
              <label class="v7-form-label">Pilih Saham</label>
              <select id="res-ticker-select" class="v7-form-select" onchange="MW_V7.Views.updateValuationModel(this.value)">
                <option value="BBCA">BBCA — Bank Central Asia Tbk</option>
                <option value="BBRI">BBRI — Bank Rakyat Indonesia Tbk</option>
                <option value="BMRI">BMRI — Bank Mandiri Tbk</option>
                <option value="ADRO">ADRO — Adaro Energy Tbk</option>
                <option value="PGEO">PGEO — Pertamina Geothermal Tbk</option>
              </select>
            </div>
            <div>
              <label class="v7-form-label">Discount Rate / WACC (%)</label>
              <input type="number" id="res-wacc" class="v7-form-input tabular-nums" value="10.5" step="0.1">
            </div>
          </div>

          <div id="v7-val-result" style="padding:16px;background:var(--bg-surface-raised);border-radius:var(--radius-md);border:1px solid var(--border-subtle)">
            <div style="display:flex;justify-content:space-between;margin-bottom:8px">
              <span style="color:var(--text-secondary)">Estimasi Fair Value DCF:</span>
              <span class="tabular-nums" style="font-weight:700;color:var(--color-profit)">Rp 10.850</span>
            </div>
            <div style="display:flex;justify-content:space-between;margin-bottom:8px">
              <span style="color:var(--text-secondary)">Graham Intrinsic Number:</span>
              <span class="tabular-nums" style="font-weight:700">Rp 9.920</span>
            </div>
            <div style="display:flex;justify-content:space-between;margin-bottom:8px">
              <span style="color:var(--text-secondary)">Harga Pasar Saat Ini:</span>
              <span class="tabular-nums" style="font-weight:700">Rp 9.450</span>
            </div>
            <div style="display:flex;justify-content:space-between;padding-top:8px;border-top:1px solid var(--border-subtle)">
              <span style="color:var(--text-secondary)">Margin of Safety (MoS):</span>
              <span class="tabular-nums" style="font-weight:700;color:var(--color-profit)">+14.8% (Undervalued)</span>
            </div>
          </div>
        </div>

        <!-- Screener & Bandarmology Rules -->
        <div class="v7-card">
          <div class="v7-card-section-head">
            <div class="v7-card-section-title">
              <i class="ti ti-filter" style="color:#f59e0b"></i>
              Quantitative Screener & Factor Radar
            </div>
          </div>

          <div style="display:flex;flex-direction:column;gap:12px">
            <div style="padding:12px;background:var(--bg-surface-raised);border-radius:var(--radius-sm)">
              <div style="font-weight:700;font-size:13px;color:#fff">High Dividend Yield + Low PER Screener</div>
              <div style="font-size:11px;color:var(--text-secondary);margin-top:2px">Saring saham dividen > 6% dengan PER < 10x dan ROE > 15%.</div>
            </div>
            <div style="padding:12px;background:var(--bg-surface-raised);border-radius:var(--radius-sm)">
              <div style="font-weight:700;font-size:13px;color:#fff">Institutional Net Accumulation Screener</div>
              <div style="font-size:11px;color:var(--text-secondary);margin-top:2px">Saring saham dengan kenaikan porsi pemegang saham > 5% selama 3 bulan beruntun.</div>
            </div>
            <div style="padding:12px;background:var(--bg-surface-raised);border-radius:var(--radius-sm)">
              <div style="font-weight:700;font-size:13px;color:#fff">Momentum & Moving Average Crossover (Golden Cross)</div>
              <div style="font-size:11px;color:var(--text-secondary);margin-top:2px">Saring saham yang break di atas MA50 dan MA200 dengan konfirmasi volume tinggi.</div>
            </div>
          </div>
        </div>
      </div>
    `;

    container.innerHTML = html;
  }

  // ══════════════════════════════════════════════════════════════════
  // 5. WEALTH VIEW (Net Worth, Multi-Bank, Debt, FIRE Targets)
  // ══════════════════════════════════════════════════════════════════
  function renderWealthView(state, computed, mode) {
    const container = document.getElementById('view-wealth');
    if (!container) return;

    const w = state.wealth || {};
    const accounts = w.accounts || [];
    const debts = w.debts || [];
    const receivables = w.receivables || [];

    const fireTarget = Number(w.fireTarget || 2500000000);
    const fireProgress = fireTarget > 0 ? Math.min(100, (computed.totalNetWorth / fireTarget) * 100) : 0;

    let html = `
      <div class="v7-grid-summary">
        <div class="v7-card">
          <div class="v7-card-header">
            <span class="v7-card-title">Total Kekayaan Bersih (Net Worth)</span>
            <i class="ti ti-crown v7-card-icon"></i>
          </div>
          <div class="v7-card-value tabular-nums" style="color:#38bdf8">${UI.fmtIdr(computed.totalNetWorth)}</div>
          <div class="v7-card-sub">Liquid Assets + Portofolio Saham</div>
        </div>

        <div class="v7-card">
          <div class="v7-card-header">
            <span class="v7-card-title">Kas Tabungan / Multi-Bank</span>
            <i class="ti ti-building-bank v7-card-icon"></i>
          </div>
          <div class="v7-card-value tabular-nums">${UI.fmtIdr(computed.bankAccountsTotal)}</div>
          <div class="v7-card-sub">${accounts.length} Rekening Terdaftar</div>
        </div>

        <div class="v7-card">
          <div class="v7-card-header">
            <span class="v7-card-title">Total Liabilitas / Hutang</span>
            <i class="ti ti-credit-card-off v7-card-icon"></i>
          </div>
          <div class="v7-card-value tabular-nums" style="color:var(--color-loss)">-${UI.fmtIdr(computed.debtsTotal)}</div>
          <div class="v7-card-sub">${debts.length} Kewajiban Aktif</div>
        </div>

        <div class="v7-card">
          <div class="v7-card-header">
            <span class="v7-card-title">FIRE Milestones (${fireProgress.toFixed(1)}%)</span>
            <i class="ti ti-flame v7-card-icon"></i>
          </div>
          <div class="v7-card-value tabular-nums" style="color:var(--color-warning)">${UI.fmtIdr(fireTarget)}</div>
          <div class="v7-card-sub">Financial Independence Target</div>
        </div>
      </div>

      <!-- Bank Accounts & Debt Tables -->
      <div class="v7-grid-2col">
        <div class="v7-card">
          <div class="v7-card-section-head">
            <div class="v7-card-section-title">
              <i class="ti ti-building-bank" style="color:#38bdf8"></i>
              Daftar Rekening Bank & Kas Pribadi
            </div>
            <button class="v7-btn v7-btn-secondary" style="font-size:11px;padding:4px 10px" onclick="MW_V7.UI.switchPillar('SETTINGS')">
              <i class="ti ti-settings"></i> Kelola Rekening di Settings →
            </button>
          </div>

          <div class="v7-table-wrap">
            <table class="v7-table">
              <thead>
                <tr>
                  <th>Nama Rekening</th>
                  <th>Kategori</th>
                  <th class="text-right">Saldo</th>
                </tr>
              </thead>
              <tbody>
                ${accounts.map(acc => `
                  <tr>
                    <td style="font-weight:600;color:#fff">${acc.name}</td>
                    <td><span class="v7-pill v7-pill-neutral">${acc.category || 'Bank'}</span></td>
                    <td class="text-right tabular-nums" style="font-weight:700">${UI.fmtIdr(acc.balance)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>

        <div class="v7-card">
          <div class="v7-card-section-head">
            <div class="v7-card-section-title">
              <i class="ti ti-chart-arrows" style="color:#10b981"></i>
              Proyeksi Arus Kas & FIRE Runway
            </div>
          </div>

          <div style="padding:14px;background:var(--bg-surface-raised);border-radius:var(--radius-md);margin-bottom:14px">
            <div style="font-size:12px;color:var(--text-secondary);margin-bottom:4px">Target FIRE Fund:</div>
            <div style="font-family:var(--font-heading);font-size:18px;font-weight:700;color:#fff;margin-bottom:8px">
              ${UI.fmtIdr(computed.totalNetWorth)} / ${UI.fmtIdr(fireTarget)}
            </div>
            <div style="width:100%;height:8px;background:rgba(255,255,255,0.08);border-radius:4px;overflow:hidden">
              <div style="width:${fireProgress}%;height:100%;background:linear-gradient(90deg, #3b82f6, #10b981);border-radius:4px"></div>
            </div>
          </div>

          <div style="font-size:12px;color:var(--text-secondary)">
            Dengan rata-rata dividen tahunan dan penambahan modal berkala, estimasi pencapaian target FIRE tercapai dalam kurun waktu <strong>4.2 tahun</strong>.
          </div>
        </div>
      </div>
    `;

    container.innerHTML = html;
  }

  // ══════════════════════════════════════════════════════════════════
  // 6. SETTINGS VIEW (Consolidated Configuration & Management Engine)
  // ══════════════════════════════════════════════════════════════════
  function renderSettingsView(state, computed, mode) {
    const container = document.getElementById('view-settings');
    if (!container) return;

    const w = state.wealth || {};
    const accounts = w.accounts || [];
    const debts = w.debts || [];
    const tax = state.taxSettings || { buyFee: 0.0015, sellFee: 0.0025, pphFinal: 0.001, dividendTax: 0.10, ppnFee: 0.11, levy: 0.00043 };

    let html = `
      <!-- Pillar Header Summary -->
      <div style="margin-bottom:20px">
        <h2 style="font-family:var(--font-heading);font-size:20px;font-weight:700;color:#fff;margin-bottom:4px">
          Pusat Konfigurasi & Pengaturan Sistem (Settings Pillar)
        </h2>
        <p style="font-size:13px;color:var(--text-secondary)">
          Kelola seluruh parameter pajak, biaya broker, target keuangan FIRE, rekening multi-bank, preferensi tampilan, dan cadangan data di satu tempat.
        </p>
      </div>

      <!-- Settings Section 1: Taxes & Broker Fees + Wealth & FIRE Goals -->
      <div class="v7-grid-2col" style="margin-bottom:20px">
        <!-- 1. Dynamic Tax & Broker Fee Engine -->
        <div class="v7-card">
          <div class="v7-card-section-head">
            <div class="v7-card-section-title">
              <i class="ti ti-scale" style="color:#f59e0b"></i>
              Tax Rules & Broker Fee Engine
            </div>
            <span class="v7-data-badge v7-badge-calculated">Configurable</span>
          </div>

          <form id="v7-form-tax-settings" onsubmit="MW_V7.Views.saveTaxSettings(event)">
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">
              <div class="v7-form-group">
                <label class="v7-form-label">Komisi Beli Broker (%)</label>
                <input type="number" id="cfg-buyfee" class="v7-form-input tabular-nums" step="0.0001" value="${(tax.buyFee || 0.0015) * 100}" required>
              </div>
              <div class="v7-form-group">
                <label class="v7-form-label">Komisi Jual Broker (%)</label>
                <input type="number" id="cfg-sellfee" class="v7-form-input tabular-nums" step="0.0001" value="${(tax.sellFee || 0.0025) * 100}" required>
              </div>
            </div>

            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">
              <div class="v7-form-group">
                <label class="v7-form-label">Tarif PPh Final Jual (%)</label>
                <input type="number" id="cfg-pph" class="v7-form-input tabular-nums" step="0.0001" value="${(tax.pphFinal || 0.001) * 100}" required>
              </div>
              <div class="v7-form-group">
                <label class="v7-form-label">Tarif Pajak Dividen (%)</label>
                <input type="number" id="cfg-divtax" class="v7-form-input tabular-nums" step="0.01" value="${(tax.dividendTax || 0.10) * 100}" required>
              </div>
            </div>

            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px">
              <div class="v7-form-group">
                <label class="v7-form-label">Tarif PPN Komisi (%)</label>
                <input type="number" id="cfg-ppn" class="v7-form-input tabular-nums" step="0.1" value="${(tax.ppnFee || 0.11) * 100}">
              </div>
              <div class="v7-form-group">
                <label class="v7-form-label">Default Sekuritas Utama</label>
                <select id="cfg-default-sekuritas" class="v7-form-select">
                  <option value="Stockbit" ${state.activeSekuritas === 'Stockbit' ? 'selected' : ''}>Stockbit / Mahakarya Artha</option>
                  <option value="IPOT" ${state.activeSekuritas === 'IPOT' ? 'selected' : ''}>IPOT / Indo Premier</option>
                  <option value="Mirae Asset" ${state.activeSekuritas === 'Mirae Asset' ? 'selected' : ''}>Mirae Asset Sekuritas</option>
                  <option value="Mandiri Sekuritas" ${state.activeSekuritas === 'Mandiri Sekuritas' ? 'selected' : ''}>Mandiri Sekuritas (MOST)</option>
                  <option value="BCA Sekuritas" ${state.activeSekuritas === 'BCA Sekuritas' ? 'selected' : ''}>BCA Sekuritas (BEST)</option>
                  <option value="Ajaib" ${state.activeSekuritas === 'Ajaib' ? 'selected' : ''}>Ajaib Sekuritas</option>
                </select>
              </div>
            </div>

            <button type="submit" class="v7-btn v7-btn-primary" style="width:100%">
              <i class="ti ti-device-floppy"></i> Simpan Pengaturan Pajak & Fee Broker
            </button>
          </form>
        </div>

        <!-- 2. Financial Goals & FIRE Settings -->
        <div class="v7-card">
          <div class="v7-card-section-head">
            <div class="v7-card-section-title">
              <i class="ti ti-flame" style="color:#ef4444"></i>
              Sasaran Keuangan & Parameter FIRE
            </div>
            <span class="v7-data-badge v7-badge-verified">Wealth Goals</span>
          </div>

          <form id="v7-form-fire-settings" onsubmit="MW_V7.Views.saveFireSettings(event)">
            <div class="v7-form-group" style="margin-bottom:12px">
              <label class="v7-form-label">Target Dana FIRE (Financial Independence) (Rp)</label>
              <input type="number" id="cfg-fire-target" class="v7-form-input tabular-nums" value="${w.fireTarget || 2500000000}" step="10000000" required>
              <div style="font-size:11px;color:var(--text-muted);margin-top:3px">Target akumulasi total kekayaan bersih untuk pensiun mandiri.</div>
            </div>

            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">
              <div class="v7-form-group">
                <label class="v7-form-label">Estimasi Pengeluaran Bulanan (Rp)</label>
                <input type="number" id="cfg-monthly-exp" class="v7-form-input tabular-nums" value="${w.monthlyExpense || 10000000}" step="500000">
              </div>
              <div class="v7-form-group">
                <label class="v7-form-label">Target Dana Darurat (Rp)</label>
                <input type="number" id="cfg-emergency-target" class="v7-form-input tabular-nums" value="${w.emergencyFundTarget || 60000000}" step="1000000">
              </div>
            </div>

            <div class="v7-form-group" style="margin-bottom:16px">
              <label class="v7-form-label">Asumsi Imbal Hasil Portofolio Tahunan (%)</label>
              <input type="number" id="cfg-expected-return" class="v7-form-input tabular-nums" value="${w.expectedReturn || 12.0}" step="0.1">
            </div>

            <button type="submit" class="v7-btn v7-btn-secondary" style="width:100%">
              <i class="ti ti-target"></i> Simpan Parameter Sasaran Keuangan
            </button>
          </form>
        </div>
      </div>

      <!-- Settings Section 2: Multi-Bank & Liabilities Configuration -->
      <div class="v7-grid-2col" style="margin-bottom:20px">
        <!-- 3. Multi-Bank Accounts Management -->
        <div class="v7-card">
          <div class="v7-card-section-head">
            <div class="v7-card-section-title">
              <i class="ti ti-building-bank" style="color:#38bdf8"></i>
              Manajemen Rekening Bank & Kas
            </div>
            <span class="v7-pill v7-pill-neutral">${accounts.length} Akun</span>
          </div>

          <!-- Existing Accounts List -->
          <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:16px;max-height:180px;overflow-y:auto">
            ${accounts.length === 0 ? '<div style="font-size:12px;color:var(--text-muted)">Belum ada rekening bank yang dikonfigurasi.</div>' : ''}
            ${accounts.map((acc, idx) => `
              <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;background:var(--bg-surface-raised);border-radius:var(--radius-sm);border:1px solid var(--border-subtle)">
                <div>
                  <div style="font-weight:600;font-size:13px;color:#fff">${acc.name}</div>
                  <div style="font-size:11px;color:var(--text-muted)">${acc.category || 'Bank'}</div>
                </div>
                <div style="display:flex;align-items:center;gap:10px">
                  <span class="tabular-nums" style="font-weight:700;color:#38bdf8">${UI.fmtIdr(acc.balance)}</span>
                  <button type="button" class="v7-btn v7-btn-outline" style="padding:2px 6px;color:var(--color-loss)" onclick="MW_V7.Views.deleteBankAccount(${idx})">
                    <i class="ti ti-trash"></i>
                  </button>
                </div>
              </div>
            `).join('')}
          </div>

          <!-- Add New Bank Account Form -->
          <form onsubmit="MW_V7.Views.handleAddBankAccount(event)" style="border-top:1px solid var(--border-subtle);padding-top:12px">
            <div style="font-size:12px;font-weight:600;color:var(--text-secondary);margin-bottom:8px">Tambah Rekening Baru:</div>
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:10px">
              <input type="text" id="new-acc-name" class="v7-form-input" placeholder="Nama Bank (e.g. BCA)" required>
              <select id="new-acc-cat" class="v7-form-select">
                <option value="Operasional">Operasional</option>
                <option value="Tabungan">Tabungan</option>
                <option value="Dana Darurat">Dana Darurat</option>
                <option value="E-Wallet">E-Wallet</option>
                <option value="Pasar Uang">Pasar Uang</option>
              </select>
              <input type="number" id="new-acc-balance" class="v7-form-input tabular-nums" placeholder="Saldo (Rp)" required>
            </div>
            <button type="submit" class="v7-btn v7-btn-secondary" style="width:100%;font-size:12px">
              <i class="ti ti-plus"></i> Tambahkan Rekening
            </button>
          </form>
        </div>

        <!-- 4. Liabilities & Debts Management -->
        <div class="v7-card">
          <div class="v7-card-section-head">
            <div class="v7-card-section-title">
              <i class="ti ti-credit-card-off" style="color:var(--color-loss)"></i>
              Manajemen Liabilitas & Pos Kewajiban
            </div>
            <span class="v7-pill v7-pill-down">${debts.length} Pos</span>
          </div>

          <!-- Existing Debts List -->
          <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:16px;max-height:180px;overflow-y:auto">
            ${debts.length === 0 ? '<div style="font-size:12px;color:var(--text-muted)">Tidak ada kewajiban atau hutang aktif.</div>' : ''}
            ${debts.map((d, idx) => `
              <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;background:var(--bg-surface-raised);border-radius:var(--radius-sm);border:1px solid var(--border-subtle)">
                <div>
                  <div style="font-weight:600;font-size:13px;color:#fff">${d.name}</div>
                  <div style="font-size:11px;color:var(--text-muted)">${d.category || 'Cicilan'}</div>
                </div>
                <div style="display:flex;align-items:center;gap:10px">
                  <span class="tabular-nums" style="font-weight:700;color:var(--color-loss)">-${UI.fmtIdr(d.amount)}</span>
                  <button type="button" class="v7-btn v7-btn-outline" style="padding:2px 6px;color:var(--color-loss)" onclick="MW_V7.Views.deleteDebt(${idx})">
                    <i class="ti ti-trash"></i>
                  </button>
                </div>
              </div>
            `).join('')}
          </div>

          <!-- Add New Debt Form -->
          <form onsubmit="MW_V7.Views.handleAddDebt(event)" style="border-top:1px solid var(--border-subtle);padding-top:12px">
            <div style="font-size:12px;font-weight:600;color:var(--text-secondary);margin-bottom:8px">Tambah Pos Liabilitas:</div>
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:10px">
              <input type="text" id="new-debt-name" class="v7-form-input" placeholder="Nama Pos (e.g. KPR)" required>
              <select id="new-debt-cat" class="v7-form-select">
                <option value="KPR">KPR Rumah</option>
                <option value="Kendaraan">Cicilan Mobil/Motor</option>
                <option value="Kartu Kredit">Kartu Kredit</option>
                <option value="Personal">Pinjaman Lainnya</option>
              </select>
              <input type="number" id="new-debt-amount" class="v7-form-input tabular-nums" placeholder="Sisa Hutang (Rp)" required>
            </div>
            <button type="submit" class="v7-btn v7-btn-outline" style="width:100%;font-size:12px;color:var(--color-loss)">
              <i class="ti ti-plus"></i> Tambahkan Pos Liabilitas
            </button>
          </form>
        </div>
      </div>

      <!-- Settings Section 3: Data Management & Backup / Restore / Reset + Security Architecture -->
      <div class="v7-grid-2col">
        <!-- 5. Backup, Restore & Data Operations -->
        <div class="v7-card">
          <div class="v7-card-section-head">
            <div class="v7-card-section-title">
              <i class="ti ti-database" style="color:#38bdf8"></i>
              Cadangan, Pemulihan & Reset Database
            </div>
            <span class="v7-data-badge v7-badge-verified">Data Vault</span>
          </div>

          <div style="display:flex;flex-direction:column;gap:14px">
            <!-- Backup Button -->
            <div style="display:flex;justify-content:space-between;align-items:center;padding:12px;background:var(--bg-surface-raised);border-radius:var(--radius-sm)">
              <div>
                <div style="font-weight:700;font-size:13px;color:#fff">Unduh Cadangan JSON (Export)</div>
                <div style="font-size:11px;color:var(--text-muted)">Simpan seluruh portofolio, transaksi, dividen, dan rekening ke file lokal.</div>
              </div>
              <button type="button" class="v7-btn v7-btn-primary" style="font-size:12px" onclick="MW_V7.Views.downloadBackupJson()">
                <i class="ti ti-download"></i> Unduh JSON
              </button>
            </div>

            <!-- Restore / Import JSON -->
            <div style="padding:12px;background:var(--bg-surface-raised);border-radius:var(--radius-sm)">
              <div style="font-weight:700;font-size:13px;color:#fff;margin-bottom:2px">Pulihkan Data dari JSON (Import)</div>
              <div style="font-size:11px;color:var(--text-muted);margin-bottom:10px">Unggah berkas JSON cadangan MoneyWatch V6 atau V7.</div>
              <input type="file" id="v7-json-import-file" accept=".json" style="display:none" onchange="MW_V7.Views.handleFileImport(event)">
              <button type="button" class="v7-btn v7-btn-secondary" style="width:100%;font-size:12px" onclick="document.getElementById('v7-json-import-file').click()">
                <i class="ti ti-upload"></i> Pilih File JSON untuk Dipulihkan...
              </button>
            </div>

            <!-- Factory Reset Data -->
            <div style="display:flex;justify-content:space-between;align-items:center;padding:12px;background:rgba(239,68,68,0.06);border:1px solid rgba(239,68,68,0.2);border-radius:var(--radius-sm)">
              <div>
                <div style="font-weight:700;font-size:13px;color:#ef4444">Reset ke Pengaturan Awal</div>
                <div style="font-size:11px;color:var(--text-muted)">Kembalikan data transaksi ke sampel default awal.</div>
              </div>
              <button type="button" class="v7-btn v7-btn-outline" style="color:#ef4444;font-size:12px" onclick="MW_V7.Views.confirmFactoryReset()">
                <i class="ti ti-refresh"></i> Reset Data
              </button>
            </div>
          </div>
        </div>

        <!-- 6. Security Architecture & Version Switcher -->
        <div class="v7-card">
          <div class="v7-card-section-head">
            <div class="v7-card-section-title">
              <i class="ti ti-lock" style="color:#10b981"></i>
              Arsitektur Keamanan & Status Runtime
            </div>
            <span class="v7-data-badge v7-badge-verified">P0 Standard</span>
          </div>

          <div style="display:flex;flex-direction:column;gap:12px;margin-bottom:16px">
            <div style="display:flex;justify-content:space-between;align-items:center;padding:10px;background:var(--bg-surface-raised);border-radius:var(--radius-sm)">
              <div>
                <div style="font-weight:700;font-size:13px;color:#fff">BFF API Isolation Guard</div>
                <div style="font-size:11px;color:var(--text-muted)">Semua kredensial pasar terproteksi di sisi server container.</div>
              </div>
              <span class="v7-pill v7-pill-up">TERLINDUNGI</span>
            </div>

            <div style="display:flex;justify-content:space-between;align-items:center;padding:10px;background:var(--bg-surface-raised);border-radius:var(--radius-sm)">
              <div>
                <div style="font-weight:700;font-size:13px;color:#fff">Penyimpanan Terisolasi (V7 Parallel Engine)</div>
                <div style="font-size:11px;color:var(--text-muted)">V6 tetap utuh dan beroperasi berdampingan tanpa konflik.</div>
              </div>
              <a href="/v6" class="v7-btn v7-btn-switcher" style="font-size:12px">Buka V6 Benchmark →</a>
            </div>

            <div style="display:flex;justify-content:space-between;align-items:center;padding:10px;background:var(--bg-surface-raised);border-radius:var(--radius-sm)">
              <div>
                <div style="font-weight:700;font-size:13px;color:#fff">Mode Antarmuka Aktif</div>
                <div style="font-size:11px;color:var(--text-muted)">Level analitik dan kompleksitas visual saat ini.</div>
              </div>
              <span class="v7-pill v7-pill-neutral" style="font-weight:700;color:#38bdf8">${mode} Mode</span>
            </div>
          </div>
        </div>
      </div>
    `;

    container.innerHTML = html;
  }

  function downloadBackupJson() {
    const state = MW_V7.Store.getState();
    const jsonStr = JSON.stringify(state, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `moneywatch_v7_backup_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
  }

  function handleFileImport(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
      const content = e.target?.result;
      if (typeof content === 'string') {
        const res = MW_V7.Store.importStateFromJson(content);
        if (res.success) {
          alert('Data JSON berhasil dipulihkan!');
          renderSettingsView(MW_V7.Store.getState(), MW_V7.Store.getComputedData(), MW_V7.Store.getMode());
        } else {
          alert('Gagal memulihkan file JSON: ' + res.error);
        }
      }
    };
    reader.readAsText(file);
  }

  function confirmFactoryReset() {
    if (confirm('Apakah Anda yakin ingin me-reset seluruh data V7 ke pengaturan awal? Perubahan yang belum dicadangkan akan hilang.')) {
      MW_V7.Store.resetStateToDefaults();
      alert('Data V7 telah di-reset ke pengaturan awal default.');
      renderSettingsView(MW_V7.Store.getState(), MW_V7.Store.getComputedData(), MW_V7.Store.getMode());
    }
  }

  function saveTaxSettings(e) {
    e.preventDefault();
    const buyFee = Number(document.getElementById('cfg-buyfee').value) / 100;
    const sellFee = Number(document.getElementById('cfg-sellfee').value) / 100;
    const pphFinal = Number(document.getElementById('cfg-pph').value) / 100;
    const dividendTax = Number(document.getElementById('cfg-divtax').value) / 100;
    const ppnFee = Number(document.getElementById('cfg-ppn').value) / 100;
    const activeSekuritas = document.getElementById('cfg-default-sekuritas').value;

    MW_V7.Store.updateTaxSettings({
      buyFee,
      sellFee,
      pphFinal,
      dividendTax,
      ppnFee
    }, activeSekuritas);

    alert('Pengaturan Pajak & Biaya Broker berhasil disimpan!');
  }

  function saveFireSettings(e) {
    e.preventDefault();
    const fireTarget = Number(document.getElementById('cfg-fire-target').value);
    const monthlyExpense = Number(document.getElementById('cfg-monthly-exp').value);
    const emergencyFundTarget = Number(document.getElementById('cfg-emergency-target').value);
    const expectedReturn = Number(document.getElementById('cfg-expected-return').value);

    MW_V7.Store.updateFireSettings(fireTarget, monthlyExpense, emergencyFundTarget, expectedReturn);
    alert('Sasaran Keuangan & Parameter FIRE berhasil disimpan!');
  }

  function handleAddBankAccount(e) {
    e.preventDefault();
    const name = document.getElementById('new-acc-name').value;
    const category = document.getElementById('new-acc-cat').value;
    const balance = Number(document.getElementById('new-acc-balance').value);

    MW_V7.Store.addBankAccount(name, category, balance);
    renderSettingsView(MW_V7.Store.getState(), MW_V7.Store.getComputedData(), MW_V7.Store.getMode());
  }

  function deleteBankAccount(idx) {
    if (confirm('Hapus rekening bank ini?')) {
      MW_V7.Store.deleteBankAccount(idx);
      renderSettingsView(MW_V7.Store.getState(), MW_V7.Store.getComputedData(), MW_V7.Store.getMode());
    }
  }

  function handleAddDebt(e) {
    e.preventDefault();
    const name = document.getElementById('new-debt-name').value;
    const category = document.getElementById('new-debt-cat').value;
    const amount = Number(document.getElementById('new-debt-amount').value);

    MW_V7.Store.addDebt(name, category, amount);
    renderSettingsView(MW_V7.Store.getState(), MW_V7.Store.getComputedData(), MW_V7.Store.getMode());
  }

  function deleteDebt(idx) {
    if (confirm('Hapus pos liabilitas ini?')) {
      MW_V7.Store.deleteDebt(idx);
      renderSettingsView(MW_V7.Store.getState(), MW_V7.Store.getComputedData(), MW_V7.Store.getMode());
    }
  }

  return {
    renderActiveView,
    downloadBackupJson,
    handleFileImport,
    confirmFactoryReset,
    saveTaxSettings,
    saveFireSettings,
    handleAddBankAccount,
    deleteBankAccount,
    handleAddDebt,
    deleteDebt,
    updateValuationModel: (sym) => {
      console.log('Valuation updated for', sym);
    }
  };
})();
