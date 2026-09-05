/**
 * 39-knowledge-master-guide.js — Master Knowledge, Portfolio Management & Confluence Analysis Guide
 * MoneyWatch Pro Institutional Architecture
 */

(function(window, document) {
  'use strict';

  var KNOWLEDGE_STATE = {
    activeTab: 'workflow', // 'workflow' | 'portfolio' | 'conviction' | 'toolbars' | 'simulator'
    simTicker: 'BBCA',
    simInputs: {
      regime: 'bullish',
      valuation: 'undervalued',
      roe: 'high',
      trend: 'uptrend_ema',
      wave: 'wave3',
      volume: 'spike',
      foreignFlow: 'net_buy',
      brokerFlow: 'accum_heavy',
      kseiFloat: 'healthy',
      rrRatio: 'rr_1_25'
    }
  };

  function initKnowledgeSuite() {
    renderKnowledgePage();
  }

  function switchKnowledgeTab(tab) {
    KNOWLEDGE_STATE.activeTab = tab;
    renderKnowledgePage();
  }

  function renderKnowledgePage() {
    var c = document.getElementById('page-knowledge');
    if (!c) return;

    var state = KNOWLEDGE_STATE;

    var html = ''
      // Header Section
      + '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:18px;flex-wrap:wrap;gap:12px">'
      + '  <div>'
      + '    <div class="ptitle" style="display:flex;align-items:center;gap:8px;font-size:22px">'
      + '      Knowledge &amp; Master Guide'
      + '      <span class="badge b-accent" style="font-size:10px;padding:3px 9px">MASTER WORKFLOW</span>'
      + '      <span class="badge b-up" style="font-size:10px;padding:3px 9px">INTEGRATED ECOSYSTEM</span>'
      + '    </div>'
      + '    <div class="psub" style="max-width:880px;margin-top:4px">'
      + '      Panduan Komprehensif: Tata Cara Menggunakan Aplikasi Secara Efektif, Manajemen Portofolio Multi-Aset, Matriks Konvergensi Fundamental vs Teknikal vs Bandarmologi, serta Integrasi Alur Antar-Toolbar untuk Keputusan Investasi Berprobabilitas Tinggi.'
      + '    </div>'
      + '  </div>'
      + '  <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">'
      + '    <button class="btn btn-ghost btn-sm ' + (state.activeTab === 'workflow' ? 'on' : '') + '" onclick="window.switchKnowledgeTab(\'workflow\')" style="' + (state.activeTab === 'workflow' ? 'background:rgba(56,189,248,0.15);border-color:#38bdf8;color:#38bdf8' : '') + '">🗺️ Alur Analisis End-to-End</button>'
      + '    <button class="btn btn-ghost btn-sm ' + (state.activeTab === 'strategies' ? 'on' : '') + '" onclick="window.switchKnowledgeTab(\'strategies\')" style="' + (state.activeTab === 'strategies' ? 'background:rgba(56,189,248,0.15);border-color:#38bdf8;color:#38bdf8' : '') + '">📈 Playbook Strategi Trading &amp; Investasi</button>'
      + '    <button class="btn btn-ghost btn-sm ' + (state.activeTab === 'portfolio' ? 'on' : '') + '" onclick="window.switchKnowledgeTab(\'portfolio\')" style="' + (state.activeTab === 'portfolio' ? 'background:rgba(56,189,248,0.15);border-color:#38bdf8;color:#38bdf8' : '') + '">💼 Manajemen Portofolio &amp; RDN</button>'
      + '    <button class="btn btn-ghost btn-sm ' + (state.activeTab === 'conviction' ? 'on' : '') + '" onclick="window.switchKnowledgeTab(\'conviction\')" style="' + (state.activeTab === 'conviction' ? 'background:rgba(56,189,248,0.15);border-color:#38bdf8;color:#38bdf8' : '') + '">🔬 Fundamental vs Teknikal (Conviction)</button>'
      + '    <button class="btn btn-ghost btn-sm ' + (state.activeTab === 'toolbars' ? 'on' : '') + '" onclick="window.switchKnowledgeTab(\'toolbars\')" style="' + (state.activeTab === 'toolbars' ? 'background:rgba(56,189,248,0.15);border-color:#38bdf8;color:#38bdf8' : '') + '">🧭 Peta Integrasi Tiap Toolbar</button>'
      + '    <button class="btn btn-ghost btn-sm ' + (state.activeTab === 'simulator' ? 'on' : '') + '" onclick="window.switchKnowledgeTab(\'simulator\')" style="' + (state.activeTab === 'simulator' ? 'background:rgba(56,189,248,0.15);border-color:#38bdf8;color:#38bdf8' : '') + '">🧪 Simulator Keyakinan Saham</button>'
      + '  </div>'
      + '</div>';

    // Tab Contents
    if (state.activeTab === 'workflow') {
      html += renderWorkflowTab();
    } else if (state.activeTab === 'strategies') {
      html += renderStrategiesTab();
    } else if (state.activeTab === 'portfolio') {
      html += renderPortfolioManagementTab();
    } else if (state.activeTab === 'conviction') {
      html += renderConvictionTab();
    } else if (state.activeTab === 'toolbars') {
      html += renderToolbarsTab();
    } else if (state.activeTab === 'simulator') {
      html += renderSimulatorTab();
    }

    c.innerHTML = html;
  }

  // ══════════════════════════════════════════════════════════
  // TAB 1: ALUR ANALISIS END-TO-END (PIPELINE)
  // ══════════════════════════════════════════════════════════
  function renderWorkflowTab() {
    return ''
      + '<div class="card" style="padding:22px;margin-bottom:18px;border:1px solid rgba(56,189,248,0.25);background:linear-gradient(135deg, var(--bg2) 0%, rgba(56,189,248,0.03) 100%)">'
      + '  <div class="ctitle" style="font-size:17px;display:flex;align-items:center;gap:8px;margin-bottom:6px">'
      + '    <i class="ti ti-route" style="color:#38bdf8"></i> 6 Langkah Alur Kerja Standar Institusi (Institutional Decision Pipeline)'
      + '  </div>'
      + '  <div style="font-size:13px;color:var(--text2);line-height:1.6;margin-bottom:20px">'
      + '    Agar tidak terjebak bias emosional atau spekulasi acak, ikuti pipeline terstruktur dari makro hingga pencatatan jurnal evaluasi:'
      + '  </div>'

      + '  <!-- Step Flow Grid -->'
      + '  <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(280px, 1fr));gap:14px;margin-bottom:20px">'
      
      // STEP 1
      + '    <div style="background:var(--bg3);border:1px solid var(--border2);border-radius:10px;padding:16px;position:relative">'
      + '      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">'
      + '        <span class="badge b-accent" style="font-size:10px">LANGKAH 1 · MAKRO &amp; REZIM</span>'
      + '        <button class="btn btn-ghost btn-xs" onclick="goPage(\'market-regime\')">Buka Menu →</button>'
      + '      </div>'
      + '      <div style="font-size:15px;font-weight:800;color:var(--text);margin-bottom:6px">1. Cek Market Regime &amp; Heatmap</div>'
      + '      <div style="font-size:12px;color:var(--text2);line-height:1.5">'
      + '        Ketahui apakah pasar sedang <strong>Bullish Risk-On</strong>, <strong>Sideways</strong>, atau <strong>Bearish Risk-Off</strong>. Di pasar bullish, gunakan strategi agresif; di pasar bearish, perbanyak porsi Kas RDN atau strategi defensif.'
      + '      </div>'
      + '    </div>'

      // STEP 2
      + '    <div style="background:var(--bg3);border:1px solid var(--border2);border-radius:10px;padding:16px;position:relative">'
      + '      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">'
      + '        <span class="badge b-up" style="font-size:10px">LANGKAH 2 · PENYARINGAN</span>'
      + '        <button class="btn btn-ghost btn-xs" onclick="goPage(\'screener\')">Buka Menu →</button>'
      + '      </div>'
      + '      <div style="font-size:15px;font-weight:800;color:var(--text);margin-bottom:6px">2. Screening &amp; Opportunity Radar</div>'
      + '      <div style="font-size:12px;color:var(--text2);line-height:1.5">'
      + '        Gunakan <strong>Screener LQ45</strong> atau <strong>Opportunity Radar</strong> untuk menyaring kandidat emiten yang memiliki volume breakout, momentum ROC kuat, dan konsentrasi akumulasi bandar teratas.'
      + '      </div>'
      + '    </div>'

      // STEP 3
      + '    <div style="background:var(--bg3);border:1px solid var(--border2);border-radius:10px;padding:16px;position:relative">'
      + '      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">'
      + '        <span class="badge b-accent" style="font-size:10px">LANGKAH 3 · VALUASI &amp; KSEI</span>'
      + '        <button class="btn btn-ghost btn-xs" onclick="goPage(\'fundamental\')">Buka Menu →</button>'
      + '      </div>'
      + '      <div style="font-size:15px;font-weight:800;color:var(--text);margin-bottom:6px">3. Fundamental &amp; KSEI 5%+ Check</div>'
      + '      <div style="font-size:12px;color:var(--text2);line-height:1.5">'
      + '        Uji kualitas bisnis via <strong>Fundamental Suite</strong> (ROE > 15%, DER < 1.0, DCF/Graham Fair Value) dan pastikan struktur <strong>Kepemilikan KSEI 5%+</strong> tidak mengalami aksi distribusi pengendali besar.'
      + '      </div>'
      + '    </div>'

      // STEP 4
      + '    <div style="background:var(--bg3);border:1px solid var(--border2);border-radius:10px;padding:16px;position:relative">'
      + '      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">'
      + '        <span class="badge b-up" style="font-size:10px">LANGKAH 4 · TIMING &amp; WAVE</span>'
      + '        <button class="btn btn-ghost btn-xs" onclick="goPage(\'tradewave\')">Buka Menu →</button>'
      + '      </div>'
      + '      <div style="font-size:15px;font-weight:800;color:var(--text);margin-bottom:6px">4. TradeWave PRO &amp; Technical Flow</div>'
      + '      <div style="font-size:12px;color:var(--text2);line-height:1.5">'
      + '        Tentukan titik masuk presisi menggunakan <strong>Pita 4-EMA Ribbon (9/21/50/200)</strong>, deteksi <strong>Gelombang Elliott Wave</strong>, level Invalidation Stop Loss struktural, dan target Fibonacci Extension.'
      + '      </div>'
      + '    </div>'

      // STEP 5
      + '    <div style="background:var(--bg3);border:1px solid var(--border2);border-radius:10px;padding:16px;position:relative">'
      + '      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">'
      + '        <span class="badge b-accent" style="font-size:10px">LANGKAH 5 · SIZING &amp; EKSEKUSI</span>'
      + '        <button class="btn btn-ghost btn-xs" onclick="goPage(\'portofolio\')">Buka Menu →</button>'
      + '      </div>'
      + '      <div style="font-size:15px;font-weight:800;color:var(--text);margin-bottom:6px">5. Hitung Ukuran Lot &amp; Eksekusi</div>'
      + '      <div style="font-size:12px;color:var(--text2);line-height:1.5">'
      + '        Gunakan aturan <strong>Risk Sizing 1% per Trade</strong>. Masukkan transaksi di menu <strong>Portofolio Saham</strong>. Sistem otomatis mencatat harga rata-rata, estimasi fee broker, pajak PPh Final, dan memotong Kas RDN.'
      + '      </div>'
      + '    </div>'

      // STEP 6
      + '    <div style="background:var(--bg3);border:1px solid var(--border2);border-radius:10px;padding:16px;position:relative">'
      + '      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">'
      + '        <span class="badge b-up" style="font-size:10px">LANGKAH 6 · JURNAL &amp; EVALUASI</span>'
      + '        <button class="btn btn-ghost btn-xs" onclick="goPage(\'journal\')">Buka Menu →</button>'
      + '      </div>'
      + '      <div style="font-size:15px;font-weight:800;color:var(--text);margin-bottom:6px">6. Decision Journal &amp; Thesis Tracker</div>'
      + '      <div style="font-size:12px;color:var(--text2);line-height:1.5">'
      + '        Dokumentasikan alasan masuk di <strong>Investment Thesis</strong> dan catat hasil pasca-penjualan di <strong>Decision Journal</strong> untuk mengevaluasi apakah eksekusi sesuai rencana atau menyimpang.'
      + '      </div>'
      + '    </div>'

      + '  </div>'

      + '  <!-- Quick Jump Action Bar -->'
      + '  <div style="display:flex;justify-content:space-between;align-items:center;background:rgba(56,189,248,0.08);border:1px solid rgba(56,189,248,0.2);border-radius:8px;padding:12px 18px;flex-wrap:wrap;gap:10px">'
      + '    <div style="font-size:12.5px;color:var(--text)">'
      + '      <strong>Ingin menguji analisa saham pilihan secara menyeluruh?</strong> Buka Cockpit Stock Intelligence untuk melihat semua matriks dalam satu layar terpadu.'
      + '    </div>'
      + '    <button class="btn btn-blue btn-sm" onclick="goPage(\'stock-intel\')">🚀 Buka Stock Intelligence Cockpit →</button>'
      + '  </div>'
      + '</div>';
  }

  // ══════════════════════════════════════════════════════════
  // TAB 2: MANAJEMEN PORTOFOLIO & KAS RDN
  // ══════════════════════════════════════════════════════════
  function renderPortfolioManagementTab() {
    return ''
      + '<div class="card" style="padding:22px;margin-bottom:18px">'
      + '  <div class="ctitle" style="font-size:17px;display:flex;align-items:center;gap:8px;margin-bottom:8px">'
      + '    <i class="ti ti-briefcase" style="color:var(--green)"></i> Prinsip Manajemen Portofolio &amp; Pengelolaan Modal (Capital Management)'
      + '  </div>'
      + '  <div style="font-size:13px;color:var(--text2);line-height:1.6;margin-bottom:18px">'
      + '    Keberhasilan investasi jangka panjang 80% ditentukan oleh alokasi aset, manajemen risiko, dan disiplin kas RDN, bukan semata menebak arah pergerakan harga.'
      + '  </div>'

      + '  <!-- 3 Pillars of Portfolio Management -->'
      + '  <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(300px, 1fr));gap:16px;margin-bottom:20px">'
      
      + '    <div style="background:var(--bg3);border:1px solid var(--border2);border-radius:8px;padding:16px">'
      + '      <div style="font-size:14px;font-weight:800;color:#38bdf8;margin-bottom:8px;display:flex;align-items:center;gap:6px">'
      + '        <i class="ti ti-pie-chart"></i> 1. Alokasi Multi-Aset Terukur'
      + '      </div>'
      + '      <ul style="font-size:12px;color:var(--text2);line-height:1.6;padding-left:18px;margin:0">'
      + '        <li><strong>Saham Indonesia (60-70%)</strong>: Mesin pertumbuhan modal (Capital Gain &amp; Dividen).</li>'
      + '        <li><strong>Reksa Dana &amp; SBN (15-25%)</strong>: Penjaga likuiditas, passive income, dan bantalan saat market koreksi.</li>'
      + '        <li><strong>ETF Global &amp; US (5-10%)</strong>: Lindung nilai mata uang (Hedge USD) dan ekspansi ke sektor teknologi dunia.</li>'
      + '        <li><strong>Crypto Assets (2-5%)</strong>: Alokasi asymmetric upside dengan batas toleransi risiko ketat.</li>'
      + '      </ul>'
      + '      <div style="margin-top:12px"><button class="btn btn-ghost btn-xs" onclick="goPage(\'rebalance\')">Cek Rebalancing Portofolio →</button></div>'
      + '    </div>'

      + '    <div style="background:var(--bg3);border:1px solid var(--border2);border-radius:8px;padding:16px">'
      + '      <div style="font-size:14px;font-weight:800;color:var(--green);margin-bottom:8px;display:flex;align-items:center;gap:6px">'
      + '        <i class="ti ti-shield-check"></i> 2. Aturan Ukuran Posisi (Risk Sizing 1%)'
      + '      </div>'
      + '      <div style="font-size:12px;color:var(--text2);line-height:1.5;margin-bottom:8px">'
      + '        Jangan pernah mempertaruhkan lebih dari <strong>1% total modal</strong> pada 1 kali transaksi. Rumus perhitungan lot aman:'
      + '      </div>'
      + '      <div style="background:rgba(0,0,0,0.3);padding:8px 12px;border-radius:6px;font-family:var(--font-mono);font-size:11px;color:#38bdf8;margin-bottom:8px">'
      + '        Max Risiko = Total Modal × 1%<br>'
      + '        Jarak Risiko = Entry - Stop Loss<br>'
      + '        Maksimal Lembar = Max Risiko ÷ Jarak Risiko<br>'
      + '        Maksimal Lot = Maksimal Lembar ÷ 100'
      + '      </div>'
      + '      <div style="font-size:11px;color:var(--text3)">Contoh: Modal Rp 100Jt, Max Risiko = Rp 1Jt. Jika Entry 10.000 &amp; SL 9.600 (Jarak 400), maka maks lot = 1.000.000 / (400 × 100) = <strong>25 Lot</strong>.</div>'
      + '    </div>'

      + '    <div style="background:var(--bg3);border:1px solid var(--border2);border-radius:8px;padding:16px">'
      + '      <div style="font-size:14px;font-weight:800;color:var(--amber);margin-bottom:8px;display:flex;align-items:center;gap:6px">'
      + '        <i class="ti ti-building-bank"></i> 3. Disiplin Kas RDN &amp; Dividen'
      + '      </div>'
      + '      <ul style="font-size:12px;color:var(--text2);line-height:1.6;padding-left:18px;margin:0">'
      + '        <li><strong>Cash Buffer (10-20%)</strong>: Selalu simpan porsi kas mengendap di RDN untuk membeli saat terjadi diskon pasar (market crash).</li>'
      + '        <li><strong>Dividend Reinvestment</strong>: Manfaatkan modul <em>Dividen &amp; Yield</em> untuk melipatgandakan efek compound dividen.</li>'
      + '        <li><strong>Pajak Realistis</strong>: MoneyWatch Pro secara otomatis memperhitungkan PPh Final 0.1% dan komisi broker pada setiap transaksi.</li>'
      + '      </ul>'
      + '      <div style="margin-top:12px"><button class="btn btn-ghost btn-xs" onclick="goPage(\'rdn\')">Kelola Kas &amp; RDN →</button></div>'
      + '    </div>'

      + '  </div>'

      + '  <!-- Isolation Banner -->'
      + '  <div style="background:rgba(16,185,129,0.06);border:1px solid rgba(16,185,129,0.25);border-radius:8px;padding:14px 18px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px">'
      + '    <div style="font-size:12.5px;color:var(--text)">'
      + '      <strong>Ingin latihan tanpa risiko modal riil?</strong> Gunakan <strong>AI Paper Portfolio (Rp 100 Jt Virtual)</strong> di menu AI Trading Engine. Portofolio virtual ini terisolasi 100% dari aset nyata Anda.'
      + '    </div>'
      + '    <button class="btn btn-ghost btn-sm" onclick="goPage(\'ai-trading\')" style="border-color:var(--green);color:var(--green)">Lihat AI Paper Trading →</button>'
      + '  </div>'
      + '</div>';
  }

  // ══════════════════════════════════════════════════════════
  // TAB 2: PLAYBOOK STRATEGI TRADING & INVESTASI
  // ══════════════════════════════════════════════════════════
  function renderStrategiesTab() {
    return ''
      + '<div class="card" style="padding:22px;margin-bottom:18px;border:1px solid rgba(56,189,248,0.25);background:linear-gradient(135deg, var(--bg2) 0%, rgba(56,189,248,0.03) 100%)">'
      + '  <div class="ctitle" style="font-size:17px;display:flex;align-items:center;gap:8px;margin-bottom:6px">'
      + '    <i class="ti ti-chess" style="color:#38bdf8"></i> 5 Strategi Trading &amp; Investasi Kelas Institusi'
      + '  </div>'
      + '  <div style="font-size:13px;color:var(--text2);line-height:1.6;margin-bottom:20px">'
      + '    Pilih dan eksekusi strategi yang paling selaras dengan profil risiko dan horizon investasi Anda. Seluruh strategi ini didukung oleh algoritma MoneyWatch Pro AI Engine:'
      + '  </div>'

      + '  <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(320px, 1fr));gap:16px;margin-bottom:20px">'

      // Strategy 1: Bandarmology & Foreign Flow
      + '    <div style="background:var(--bg3);border:1px solid var(--border2);border-top:3px solid #10B981;border-radius:10px;padding:18px">'
      + '      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">'
      + '        <span class="badge b-up" style="font-size:10px">SWING &amp; SMART MONEY</span>'
      + '        <span style="font-size:11px;color:var(--text3);font-family:var(--font-mono)">Horizon: 1-4 Minggu</span>'
      + '      </div>'
      + '      <div style="font-size:16px;font-weight:800;color:var(--green);margin-bottom:8px">1. Smart Money &amp; Bandarmology Momentum</div>'
      + '      <div style="font-size:12px;color:var(--text2);line-height:1.6;margin-bottom:12px">'
      + '        Memanfaatkan arus akumulasi institusi/bandar besar (AK, BK, ZP, YU, RX) dan pergerakan <em>Net Foreign Inflow</em> secara berkelanjutan.'
      + '      </div>'
      + '      <div style="background:var(--bg2);padding:12px;border-radius:8px;font-size:12px;line-height:1.6;margin-bottom:12px;border:1px solid var(--border2)">'
      + '        <div><strong>📌 Kriteria Masuk (Entry):</strong> Top 3 Broker Accumulation &gt; 60% + Foreign Net Buy. Masuk di dekat VWAP / Average Price Bandar.</div>'
      + '        <div><strong>🎯 Target Profit:</strong> +10% s/d +20% atau Resistance Kuat terdekat (Risk/Reward &ge; 1:2).</div>'
      + '        <div><strong>🛡️ Cut Loss:</strong> -3% s/d -5% di bawah VWAP / Average Buy Price Bandar.</div>'
      + '      </div>'
      + '      <button class="btn btn-ghost btn-xs" style="width:100%" onclick="goPage(\'bandarmology\')">Analisa Bandar di Cockpit →</button>'
      + '    </div>'

      // Strategy 2: Value Investing & Margin of Safety
      + '    <div style="background:var(--bg3);border:1px solid var(--border2);border-top:3px solid #3B82F6;border-radius:10px;padding:18px">'
      + '      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">'
      + '        <span class="badge b-accent" style="font-size:10px">VALUE INVESTING</span>'
      + '        <span style="font-size:11px;color:var(--text3);font-family:var(--font-mono)">Horizon: 6-24 Bulan</span>'
      + '      </div>'
      + '      <div style="font-size:16px;font-weight:800;color:#3B82F6;margin-bottom:8px">2. Value Investing &amp; Margin of Safety</div>'
      + '      <div style="font-size:12px;color:var(--text2);line-height:1.6;margin-bottom:12px">'
      + '        Membeli saham berkualitas tinggi dengan harga diskon besar di bawah nilai wajar intrinsiknya (Graham Formula &amp; DCF).'
      + '      </div>'
      + '      <div style="background:var(--bg2);padding:12px;border-radius:8px;font-size:12px;line-height:1.6;margin-bottom:12px;border:1px solid var(--border2)">'
      + '        <div><strong>📌 Kriteria Masuk (Entry):</strong> Margin of Safety (MoS) &gt; 15-20%, ROE &gt; 12%, DER &lt; 1.0x, PE di bawah historis 5 tahun.</div>'
      + '        <div><strong>🎯 Target Profit:</strong> Harga mendekati / melampaui Intrinsic Fair Value (DCF Model).</div>'
      + '        <div><strong>🛡️ Cut Loss:</strong> Evaluasi ulang jika fundamental memburuk (penurunan EPS &gt; 25% atau DER melonjak &gt; 1.5x).</div>'
      + '      </div>'
      + '      <button class="btn btn-ghost btn-xs" style="width:100%" onclick="goPage(\'harga-wajar\')">Hitung Nilai Wajar →</button>'
      + '    </div>'

      // Strategy 3: Techno-Bandarmology Breakout
      + '    <div style="background:var(--bg3);border:1px solid var(--border2);border-top:3px solid var(--accent);border-radius:10px;padding:18px">'
      + '      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">'
      + '        <span class="badge b-accent" style="font-size:10px">BREAKOUT MOMENTUM</span>'
      + '        <span style="font-size:11px;color:var(--text3);font-family:var(--font-mono)">Horizon: 2-10 Hari</span>'
      + '      </div>'
      + '      <div style="font-size:16px;font-weight:800;color:var(--accent);margin-bottom:8px">3. Techno-Bandarmology Breakout</div>'
      + '      <div style="font-size:12px;color:var(--text2);line-height:1.6;margin-bottom:12px">'
      + '        Menggabungkan penembusan pola resistensi teknikal dengan lonjakan volume tinggi dan konfirmasi akumulasi pasar.'
      + '      </div>'
      + '      <div style="background:var(--bg2);padding:12px;border-radius:8px;font-size:12px;line-height:1.6;margin-bottom:12px;border:1px solid var(--border2)">'
      + '        <div><strong>📌 Kriteria Masuk (Entry):</strong> Breakout Resistance + Volume Spike &gt; 2x + Akumulasi Netral/Big Accumulation.</div>'
      + '        <div><strong>🎯 Target Profit:</strong> Target Fibonacci Extension / Height Pattern Breakout.</div>'
      + '        <div><strong>🛡️ Cut Loss:</strong> -3% jika harga kembali turun ke bawah level breakout (False Breakout Protection).</div>'
      + '      </div>'
      + '      <button class="btn btn-ghost btn-xs" style="width:100%" onclick="goPage(\'tradewave\')">Skrining Breakout TradeWave →</button>'
      + '    </div>'

      // Strategy 4: Dividend Compounder & PMK 18
      + '    <div style="background:var(--bg3);border:1px solid var(--border2);border-top:3px solid #F59E0B;border-radius:10px;padding:18px">'
      + '      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">'
      + '        <span class="badge b-warn" style="font-size:10px">DIVIDEND COMPOUNDER</span>'
      + '        <span style="font-size:11px;color:var(--text3);font-family:var(--font-mono)">Horizon: Long-Term</span>'
      + '      </div>'
      + '      <div style="font-size:16px;font-weight:800;color:#F59E0B;margin-bottom:8px">4. Dividend Compounder &amp; Bebas Pajak (PMK 18)</div>'
      + '      <div style="font-size:12px;color:var(--text2);line-height:1.6;margin-bottom:12px">'
      + '        Membangun mesin cash flow dari dividen stabil dan memanfaatkan insentif bebas pajak PPh 0% melalui reinvestasi 3 tahun.'
      + '      </div>'
      + '      <div style="background:var(--bg2);padding:12px;border-radius:8px;font-size:12px;line-height:1.6;margin-bottom:12px;border:1px solid var(--border2)">'
      + '        <div><strong>📌 Kriteria Masuk (Entry):</strong> Dividend Yield &gt; 5-8%, Dividend Payout Ratio (DPR) 30%-70%, Cash Flow Operasional Positif.</div>'
      + '        <div><strong>🎯 Reinvestasi:</strong> Gunakan opsi Reinvestasi Bebas Pajak (PPh 0%) sesuai PMK 18/2021.</div>'
      + '        <div><strong>🛡️ Proteksi:</strong> Waspada jika DPR &gt; 90% secara terus menerus yang mengancam kelangsungan ekspansi.</div>'
      + '      </div>'
      + '      <button class="btn btn-ghost btn-xs" style="width:100%" onclick="goPage(\'divinvest\')">Kalender &amp; Yield Dividen →</button>'
      + '    </div>'

      // Strategy 5: Institutional Risk Management & Portfolio Sizing
      + '    <div style="background:var(--bg3);border:1px solid var(--border2);border-top:3px solid #EC4899;border-radius:10px;padding:18px">'
      + '      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">'
      + '        <span class="badge b-down" style="font-size:10px;background:rgba(236,72,153,0.15);color:#EC4899;border-color:#EC4899">RISK CONTROL</span>'
      + '        <span style="font-size:11px;color:var(--text3);font-family:var(--font-mono)">Aturan Modal Sistemik</span>'
      + '      </div>'
      + '      <div style="font-size:16px;font-weight:800;color:#EC4899;margin-bottom:8px">5. Institutional Sizing &amp; Cash Buffer</div>'
      + '      <div style="font-size:12px;color:var(--text2);line-height:1.6;margin-bottom:12px">'
      + '        Melindungi modal dari penurunan beruntun (Max Drawdown) melalui alokasi porsi yang terdisiplin dan cadangan kas RDN.'
      + '      </div>'
      + '      <div style="background:var(--bg2);padding:12px;border-radius:8px;font-size:12px;line-height:1.6;margin-bottom:12px;border:1px solid var(--border2)">'
      + '        <div><strong>📊 Max Allocation:</strong> Maksimum 10-15% Total AUM per Big Cap, maks 5% per Mid/Small Cap.</div>'
      + '        <div><strong>💵 Kas RDN Buffer:</strong> Pertahankan Kas RDN minimal 15%-20% untuk kesempatan Buy on Weakness.</div>'
      + '        <div><strong>⚖️ Risk-Reward Rule:</strong> Dilarang masuk jika rasio Risk-to-Reward kurang dari 1 : 2.</div>'
      + '      </div>'
      + '      <button class="btn btn-ghost btn-xs" style="width:100%" onclick="goPage(\'rdn\')">Cek Alokasi Kas &amp; RDN →</button>'
      + '    </div>'

      + '  </div>'
      + '</div>';
  }

  // ══════════════════════════════════════════════════════════
  // TAB 3: FUNDAMENTAL VS TEKNIKAL (CONVICTION MATRIX)
  // ══════════════════════════════════════════════════════════
  function renderConvictionTab() {
    return ''
      + '<div class="card" style="padding:22px;margin-bottom:18px">'
      + '  <div class="ctitle" style="font-size:17px;display:flex;align-items:center;gap:8px;margin-bottom:8px">'
      + '    <i class="ti ti-scale" style="color:var(--accent)"></i> Analisa Fundamental vs Teknikal vs Smart Money: Mencapai Keyakinan Penuh'
      + '  </div>'
      + '  <div style="font-size:13px;color:var(--text2);line-height:1.6;margin-bottom:20px">'
      + '    Banyak investor mengalami kerugian karena hanya mengandalkan satu aspek. Untuk yakin bahwa sebuah saham berpotensi kuat untuk naik, Anda membutuhkan <strong>Konvergensi 3 Pilar (3-Pillar Confluence)</strong>:'
      + '  </div>'

      + '  <!-- 3 Pillars Comparison Grid -->'
      + '  <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(280px, 1fr));gap:16px;margin-bottom:24px">'
      
      // Pillar 1: Fundamental
      + '    <div style="background:var(--bg3);border:1px solid var(--border2);border-top:3px solid #3B82F6;border-radius:8px;padding:16px">'
      + '      <div style="font-size:15px;font-weight:800;color:#3B82F6;margin-bottom:6px;display:flex;align-items:center;gap:6px">'
      + '        <i class="ti ti-building-bank"></i> PILAR 1: FUNDAMENTAL'
      + '      </div>'
      + '      <div style="font-size:11px;color:var(--text3);font-weight:700;margin-bottom:10px">MENJAWAB PERTANYAAN: "APA YANG HARUS DIBELI?"</div>'
      + '      <div style="font-size:12px;color:var(--text2);line-height:1.6">'
      + '        Fundamental membuktikan kesehatan bisnis dan nilai intrinsik saham:'
      + '        <ul style="padding-left:16px;margin-top:6px">'
      + '          <li><strong>ROE &gt; 15%</strong>: Efisiensi penciptaan laba atas ekuitas tinggi.</li>'
      + '          <li><strong>DER &lt; 1.0x</strong>: Struktur utang aman dari risiko kebangkrutan.</li>'
      + '          <li><strong>Valuasi Diskon (DCF / Graham)</strong>: Harga pasar berada di bawah estimasi harga wajar (Margin of Safety &gt; 15%).</li>'
      + '          <li><strong>Net Profit Margin &amp; FCF Positif</strong>: Arus kas operasional riil bertumbuh.</li>'
      + '        </ul>'
      + '      </div>'
      + '      <div style="margin-top:12px"><button class="btn btn-ghost btn-xs" onclick="goPage(\'fundamental\')">Buka Fundamental Suite →</button></div>'
      + '    </div>'

      // Pillar 2: Technical & Wave
      + '    <div style="background:var(--bg3);border:1px solid var(--border2);border-top:3px solid var(--accent);border-radius:8px;padding:16px">'
      + '      <div style="font-size:15px;font-weight:800;color:var(--accent);margin-bottom:6px;display:flex;align-items:center;gap:6px">'
      + '        <i class="ti ti-wave-sine"></i> PILAR 2: TEKNIKAL &amp; WAVE'
      + '      </div>'
      + '      <div style="font-size:11px;color:var(--text3);font-weight:700;margin-bottom:10px">MENJAWAB PERTANYAAN: "KAPAN HARUS MEMBELI &amp; MENJUAL?"</div>'
      + '      <div style="font-size:12px;color:var(--text2);line-height:1.6">'
      + '        Teknikal mengatur momentum waktu, struktur harga, dan batas risiko:'
      + '        <ul style="padding-left:16px;margin-top:6px">'
      + '          <li><strong>Pita 4-EMA Ribbon (9/21/50/200)</strong>: Konfirmasi arah tren bullish terbuka (Golden Ribbon).</li>'
      + '          <li><strong>Elliott Wave 3 / Wave C Rebound</strong>: Siklus impuls paling kuat dan menguntungkan.</li>'
      + '          <li><strong>SuperTrend Positif &amp; RSI Rebound</strong>: Momentum beli kembali aktif.</li>'
      + '          <li><strong>Invalidation Stop Loss Presisi</strong>: Batas toleransi cut loss jelas di bawah swing low.</li>'
      + '        </ul>'
      + '      </div>'
      + '      <div style="margin-top:12px"><button class="btn btn-ghost btn-xs" onclick="goPage(\'tradewave\')">Buka TradeWave PRO →</button></div>'
      + '    </div>'

      // Pillar 3: Smart Money & Flow
      + '    <div style="background:var(--bg3);border:1px solid var(--border2);border-top:3px solid #10b981;border-radius:8px;padding:16px">'
      + '      <div style="font-size:15px;font-weight:800;color:#10b981;margin-bottom:6px;display:flex;align-items:center;gap:6px">'
      + '        <i class="ti ti-users-group"></i> PILAR 3: SMART MONEY &amp; KSEI'
      + '      </div>'
      + '      <div style="font-size:11px;color:var(--text3);font-weight:700;margin-bottom:10px">MENJAWAB PERTANYAAN: "SIAPA YANG MENGGERAKKAN HARGA?"</div>'
      + '      <div style="font-size:12px;color:var(--text2);line-height:1.6">'
      + '        Aliran dana membuktikan partisipasi modal besar (Institusi &amp; Asing):'
      + '        <ul style="padding-left:16px;margin-top:6px">'
      + '          <li><strong>KSEI 5%+ Free Float</strong>: Kepemilikan institusional solid tanpa dumping pemilik saham pengendali.</li>'
      + '          <li><strong>Chaikin Money Flow (CMF &gt; 0.10)</strong>: Bukti aliran dana masuk bersih.</li>'
      + '          <li><strong>Top 3-5 Broker Concentration</strong>: Bandar menguasai &gt; 60% akumulasi harian.</li>'
      + '          <li><strong>Foreign Net Buy Berturut-turut</strong>: Dukungan likuiditas investor global.</li>'
      + '        </ul>'
      + '      </div>'
      + '      <div style="margin-top:12px"><button class="btn btn-ghost btn-xs" onclick="openKseiModal()">Cek Kepemilikan KSEI →</button></div>'
      + '    </div>'

      + '  </div>'

      // Checklist of 10 Confluence Points
      + '  <div style="background:rgba(56,189,248,0.04);border:1px solid rgba(56,189,248,0.25);border-radius:10px;padding:18px">'
      + '    <div style="font-size:15px;font-weight:800;color:var(--text);margin-bottom:8px;display:flex;align-items:center;gap:6px">'
      + '      <i class="ti ti-checkbox" style="color:#38bdf8"></i> 10-Point Checklist Keyakinan Maksimal (Max Conviction Score)'
      + '    </div>'
      + '    <div style="font-size:12px;color:var(--text2);margin-bottom:14px">'
      + '      Sebelum menekan tombol BELI, pastikan minimal <strong>7 dari 10 indikator</strong> di bawah ini bernilai positif untuk memastikan probabilitas kenaikan tinggi:'
      + '    </div>'
      + '    <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(280px, 1fr));gap:10px;font-size:12px">'
      + '      <div style="background:var(--bg3);padding:8px 12px;border-radius:6px;border-left:3px solid var(--green)">✅ 1. Market Regime IHSG berstatus Bullish atau Netral.</div>'
      + '      <div style="background:var(--bg3);padding:8px 12px;border-radius:6px;border-left:3px solid var(--green)">✅ 2. Valuasi Harga Wajar (DCF/Graham) memiliki Margin of Safety &gt; 10%.</div>'
      + '      <div style="background:var(--bg3);padding:8px 12px;border-radius:6px;border-left:3px solid var(--green)">✅ 3. Rasio Profitabilitas ROE &gt; 12% dan DER &lt; 1.2x.</div>'
      + '      <div style="background:var(--bg3);padding:8px 12px;border-radius:6px;border-left:3px solid var(--green)">✅ 4. Struktur Tren Harga berada di atas EMA20 dan EMA50.</div>'
      + '      <div style="background:var(--bg3);padding:8px 12px;border-radius:6px;border-left:3px solid var(--green)">✅ 5. TradeWave mengonfirmasi sinyal BUY atau Impulse Wave 3.</div>'
      + '      <div style="background:var(--bg3);padding:8px 12px;border-radius:6px;border-left:3px solid var(--green)">✅ 6. Volume transaksi &gt; 1.2x rata-rata 20 hari saat kenaikan harga.</div>'
      + '      <div style="background:var(--bg3);padding:8px 12px;border-radius:6px;border-left:3px solid var(--green)">✅ 7. Chaikin Money Flow (CMF-20) berada di teritori positif (&gt; 0).</div>'
      + '      <div style="background:var(--bg3);padding:8px 12px;border-radius:6px;border-left:3px solid var(--green)">✅ 8. Top 3 Broker mencatat akumulasi bersih dominan.</div>'
      + '      <div style="background:var(--bg3);padding:8px 12px;border-radius:6px;border-left:3px solid var(--green)">✅ 9. Rasio Risk : Reward terukur minimal 1 : 2.0.</div>'
      + '      <div style="background:var(--bg3);padding:8px 12px;border-radius:6px;border-left:3px solid var(--green)">✅ 10. Memiliki Tesis Investasi tertulis dan batas Invalidation Stop Loss.</div>'
      + '    </div>'
      + '  </div>'
      + '</div>';
  }

  // ══════════════════════════════════════════════════════════
  // TAB 4: PETA INTEGRASI TIAP TOOLBAR
  // ══════════════════════════════════════════════════════════
  function renderToolbarsTab() {
    return ''
      + '<div class="card" style="padding:22px;margin-bottom:18px">'
      + '  <div class="ctitle" style="font-size:17px;display:flex;align-items:center;gap:8px;margin-bottom:8px">'
      + '    <i class="ti ti-layout-navbar" style="color:#38bdf8"></i> Panduan Lengkap Integrasi Tiap Toolbar &amp; Menu'
      + '  </div>'
      + '  <div style="font-size:13px;color:var(--text2);line-height:1.6;margin-bottom:20px">'
      + '    Setiap menu di sidebar dirancang secara modular dan saling bertukar data untuk membentuk ekosistem keputusan yang utuh:'
      + '  </div>'

      + '  <div style="display:flex;flex-direction:column;gap:14px">'

      // GROUP 1: PORTOFOLIO & ASET
      + '    <div style="background:var(--bg3);border:1px solid var(--border2);border-radius:8px;padding:16px">'
      + '      <div style="font-size:14px;font-weight:800;color:var(--text);margin-bottom:6px;display:flex;align-items:center;gap:6px">'
      + '        <i class="ti ti-briefcase" style="color:var(--accent)"></i> 1. Toolbar Portofolio &amp; Aset'
      + '      </div>'
      + '      <div style="font-size:12px;color:var(--text2);line-height:1.5;margin-bottom:10px">'
      + '        Pusat pencatatan seluruh aset nyata Anda (Saham, Crypto, ETF Global, Reksa Dana &amp; SBN). Menghitung otomatis Nilai Pasar, Weighted Average Cost, Realized/Unrealized PnL, Dividen Yield, serta menyajikan fitur <strong>Rebalancing Portofolio</strong> dan <strong>Performance Time-Weighted Return (TWR)</strong>.'
      + '      </div>'
      + '      <div style="display:flex;gap:6px;flex-wrap:wrap">'
      + '        <button class="btn btn-ghost btn-xs" onclick="goPage(\'portofolio\')"><i class="ti ti-chart-candle"></i> Saham Indonesia</button>'
      + '        <button class="btn btn-ghost btn-xs" onclick="goPage(\'crypto\')"><i class="ti ti-currency-bitcoin"></i> Crypto</button>'
      + '        <button class="btn btn-ghost btn-xs" onclick="goPage(\'etf\')"><i class="ti ti-world"></i> ETF Global</button>'
      + '        <button class="btn btn-ghost btn-xs" onclick="goPage(\'reksadana\')"><i class="ti ti-building-bank"></i> Reksa Dana</button>'
      + '        <button class="btn btn-ghost btn-xs" onclick="goPage(\'performance\')"><i class="ti ti-chart-line"></i> TWR Chart</button>'
      + '        <button class="btn btn-ghost btn-xs" onclick="goPage(\'dividen\')"><i class="ti ti-cash"></i> Dividen</button>'
      + '        <button class="btn btn-ghost btn-xs" onclick="goPage(\'rebalance\')"><i class="ti ti-scale"></i> Rebalance</button>'
      + '      </div>'
      + '    </div>'

      // GROUP 2: RISET & INTELIJEN
      + '    <div style="background:var(--bg3);border:1px solid var(--border2);border-radius:8px;padding:16px">'
      + '      <div style="font-size:14px;font-weight:800;color:var(--text);margin-bottom:6px;display:flex;align-items:center;gap:6px">'
      + '        <i class="ti ti-microscope" style="color:var(--accent)"></i> 2. Toolbar Riset &amp; Intelijen'
      + '      </div>'
      + '      <div style="font-size:12px;color:var(--text2);line-height:1.5;margin-bottom:10px">'
      + '        Mesin bedah saham mendalam. <strong>Stock Intelligence</strong> menyatukan seluruh indikator dalam satu tampilan cockpit; <strong>TradeWave PRO</strong> mendeteksi gelombang Elliott &amp; pita EMA; <strong>Kepemilikan KSEI</strong> menganalisis pemegang saham &gt;5%; <strong>Fundamental Suite</strong> mengevaluasi rasio finansial; serta <strong>Valuasi Harga Wajar</strong> menghitung diskon harga DCF/Graham.'
      + '      </div>'
      + '      <div style="display:flex;gap:6px;flex-wrap:wrap">'
      + '        <button class="btn btn-ghost btn-xs" onclick="goPage(\'stock-intel\')"><i class="ti ti-radar"></i> Stock Intelligence</button>'
      + '        <button class="btn btn-ghost btn-xs" onclick="goPage(\'tradewave\')"><i class="ti ti-wave-sine"></i> TradeWave PRO</button>'
      + '        <button class="btn btn-ghost btn-xs" onclick="openKseiModal()"><i class="ti ti-users-group"></i> Kepemilikan KSEI</button>'
      + '        <button class="btn btn-ghost btn-xs" onclick="goPage(\'fundamental\')"><i class="ti ti-building-bank"></i> Fundamental</button>'
      + '        <button class="btn btn-ghost btn-xs" onclick="goPage(\'technical\')"><i class="ti ti-chart-arrows"></i> Technical Flow</button>'
      + '        <button class="btn btn-ghost btn-xs" onclick="goPage(\'hargawajar\')"><i class="ti ti-calculator"></i> Harga Wajar</button>'
      + '      </div>'
      + '    </div>'

      // GROUP 3: PASAR & ALERTS
      + '    <div style="background:var(--bg3);border:1px solid var(--border2);border-radius:8px;padding:16px">'
      + '      <div style="font-size:14px;font-weight:800;color:var(--text);margin-bottom:6px;display:flex;align-items:center;gap:6px">'
      + '        <i class="ti ti-world" style="color:var(--accent)"></i> 3. Toolbar Pasar &amp; Alerts'
      + '      </div>'
      + '      <div style="font-size:12px;color:var(--text2);line-height:1.5;margin-bottom:10px">'
      + '        Navigasi radar makro: mendeteksi <strong>Market Regime IHSG</strong>, mengamati rotasi modal sektoral lewat <strong>Heatmap Sektor</strong>, serta menyetel notifikasi otomatis di <strong>Price Alerts &amp; Targets</strong>.'
      + '      </div>'
      + '      <div style="display:flex;gap:6px;flex-wrap:wrap">'
      + '        <button class="btn btn-ghost btn-xs" onclick="goPage(\'market-regime\')"><i class="ti ti-gauge"></i> Market Regime</button>'
      + '        <button class="btn btn-ghost btn-xs" onclick="goPage(\'radar\')"><i class="ti ti-antenna"></i> Opportunity Radar</button>'
      + '        <button class="btn btn-ghost btn-xs" onclick="goPage(\'heatmap\')"><i class="ti ti-layout-grid"></i> Heatmap</button>'
      + '        <button class="btn btn-ghost btn-xs" onclick="goPage(\'ranking\')"><i class="ti ti-award"></i> Rankings</button>'
      + '        <button class="btn btn-ghost btn-xs" onclick="goPage(\'alerts\')"><i class="ti ti-bell"></i> Price Alerts</button>'
      + '      </div>'
      + '    </div>'

      // GROUP 4: QUANT & SIMULASI
      + '    <div style="background:var(--bg3);border:1px solid var(--border2);border-radius:8px;padding:16px">'
      + '      <div style="font-size:14px;font-weight:800;color:var(--text);margin-bottom:6px;display:flex;align-items:center;gap:6px">'
      + '        <i class="ti ti-brain" style="color:var(--accent)"></i> 4. Toolbar Quant &amp; Simulasi'
      + '      </div>'
      + '      <div style="font-size:12px;color:var(--text2);line-height:1.5;margin-bottom:10px">'
      + '        Uji ketahanan portofolio terhadap skenario krisis (What-If Stress Test di <strong>Scenario Engine</strong>), hitung koefisien diversifikasi di <strong>Correlation Matrix</strong>, dan uji historis di <strong>Backtester Strategi</strong>.'
      + '      </div>'
      + '      <div style="display:flex;gap:6px;flex-wrap:wrap">'
      + '        <button class="btn btn-ghost btn-xs" onclick="goPage(\'scenario\')"><i class="ti ti-trending-up"></i> Scenario Engine</button>'
      + '        <button class="btn btn-ghost btn-xs" onclick="goPage(\'correlation\')"><i class="ti ti-grid-dots"></i> Correlation Matrix</button>'
      + '        <button class="btn btn-ghost btn-xs" onclick="goPage(\'backtester\')"><i class="ti ti-history"></i> Backtester</button>'
      + '        <button class="btn btn-ghost btn-xs" onclick="goPage(\'monthly-returns\')"><i class="ti ti-calendar"></i> Seasonality</button>'
      + '      </div>'
      + '    </div>'

      // GROUP 5: AI INTELLIGENCE
      + '    <div style="background:var(--bg3);border:1px solid var(--border2);border-radius:8px;padding:16px">'
      + '      <div style="font-size:14px;font-weight:800;color:var(--text);margin-bottom:6px;display:flex;align-items:center;gap:6px">'
      + '        <i class="ti ti-sparkles" style="color:var(--accent)"></i> 5. Toolbar AI Intelligence'
      + '      </div>'
      + '      <div style="font-size:12px;color:var(--text2);line-height:1.5;margin-bottom:10px">'
      + '        Pusat penalaran otonom. <strong>Autonomous AI Trading Engine</strong> melakukan scanning sinyal EV &gt; 0 dan menjalankan akun paper trading virtual mandiri; <strong>AI Copilot</strong> menjawab pertanyaan analisa real-time; serta <strong>Investment Thesis &amp; Decision Journal</strong> mendokumentasikan proses berpikir Anda.'
      + '      </div>'
      + '      <div style="display:flex;gap:6px;flex-wrap:wrap">'
      + '        <button class="btn btn-ghost btn-xs" onclick="goPage(\'ai-trading\')"><i class="ti ti-robot"></i> AI Trading Engine</button>'
      + '        <button class="btn btn-ghost btn-xs" onclick="goPage(\'copilot\')"><i class="ti ti-messages"></i> AI Copilot</button>'
      + '        <button class="btn btn-ghost btn-xs" onclick="goPage(\'thesis\')"><i class="ti ti-bulb"></i> Investment Thesis</button>'
      + '        <button class="btn btn-ghost btn-xs" onclick="goPage(\'journal\')"><i class="ti ti-notebook"></i> Decision Journal</button>'
      + '      </div>'
      + '    </div>'

      // GROUP 6: WEALTH & PAJAK
      + '    <div style="background:var(--bg3);border:1px solid var(--border2);border-radius:8px;padding:16px">'
      + '      <div style="font-size:14px;font-weight:800;color:var(--text);margin-bottom:6px;display:flex;align-items:center;gap:6px">'
      + '        <i class="ti ti-diamond" style="color:var(--accent)"></i> 6. Toolbar Wealth &amp; Pajak'
      + '      </div>'
      + '      <div style="font-size:12px;color:var(--text2);line-height:1.5;margin-bottom:10px">'
      + '        Melacak total kekayaan bersih (Net Worth Balance Sheet), pencatatan saldo Kas &amp; Mutasi RDN lintas sekuritas, serta perhitungan estimasi pelaporan SPT Pajak PPh Final atas transaksi saham dan dividen.'
      + '      </div>'
      + '      <div style="display:flex;gap:6px;flex-wrap:wrap">'
      + '        <button class="btn btn-ghost btn-xs" onclick="goPage(\'wealth\')"><i class="ti ti-shield-check"></i> Net Worth</button>'
      + '        <button class="btn btn-ghost btn-xs" onclick="goPage(\'rdn\')"><i class="ti ti-wallet"></i> Kas &amp; Mutasi RDN</button>'
      + '        <button class="btn btn-ghost btn-xs" onclick="goPage(\'pajak\')"><i class="ti ti-receipt-tax"></i> Pajak &amp; SPT</button>'
      + '      </div>'
      + '    </div>'

      + '  </div>'
      + '</div>';
  }

  // ══════════════════════════════════════════════════════════
  // TAB 5: SIMULATOR KEYAKINAN SAHAM INTERAKTIF
  // ══════════════════════════════════════════════════════════
  function renderSimulatorTab() {
    var state = KNOWLEDGE_STATE;
    var inp = state.simInputs;

    // Calculate score based on inputs
    var score = 0;
    if (inp.regime === 'bullish') score += 10;
    else if (inp.regime === 'sideways') score += 5;

    if (inp.valuation === 'undervalued') score += 15;
    else if (inp.valuation === 'fair') score += 8;

    if (inp.roe === 'high') score += 10;
    else if (inp.roe === 'med') score += 5;

    if (inp.trend === 'uptrend_ema') score += 15;
    else if (inp.trend === 'sideways') score += 5;

    if (inp.wave === 'wave3') score += 15;
    else if (inp.wave === 'wave1') score += 8;
    else if (inp.wave === 'wavec') score += 10;

    if (inp.volume === 'spike') score += 10;
    else if (inp.volume === 'normal') score += 4;

    if (inp.foreignFlow === 'net_buy') score += 10;
    if (inp.brokerFlow === 'accum_heavy') score += 10;
    else if (inp.brokerFlow === 'accum_mod') score += 5;

    if (inp.kseiFloat === 'healthy') score += 5;

    // Expected Value & Conviction Level
    var verdict = 'STRONG BUY / HIGH CONVICTION';
    var verdictCls = 'b-up';
    var evText = '+Rp 1.850.000 (EV Positif Signifikan)';
    var winProb = '75% - 82%';

    if (score < 45) {
      verdict = 'AVOID / NO TRADE (HIGH RISK)';
      verdictCls = 'b-dn';
      evText = '-Rp 450.000 (EV Negatif)';
      winProb = '< 40%';
    } else if (score < 70) {
      verdict = 'WATCHLIST / HOLD';
      verdictCls = 'b-amb';
      evText = '+Rp 400.000 (EV Moderat)';
      winProb = '50% - 62%';
    }

    return ''
      + '<div class="card" style="padding:22px;margin-bottom:18px">'
      + '  <div class="ctitle" style="font-size:17px;display:flex;align-items:center;gap:8px;margin-bottom:6px">'
      + '    <i class="ti ti-calculator" style="color:#38bdf8"></i> Interactive Stock Conviction Simulator'
      + '  </div>'
      + '  <div style="font-size:13px;color:var(--text2);line-height:1.6;margin-bottom:20px">'
      + '    Uji coba kombinasi faktor analisis saham secara interaktif. Ubah parameter di bawah ini untuk melihat bagaimana skor keyakinan (Conviction Score) dan Expected Value berubah secara deterministik:'
      + '  </div>'

      + '  <div style="display:grid;grid-template-columns:1.6fr 1.2fr;gap:20px">'
      
      // Control Inputs
      + '    <div style="display:flex;flex-direction:column;gap:12px;background:var(--bg3);border:1px solid var(--border2);border-radius:10px;padding:16px">'
      + '      <div style="font-size:13px;font-weight:800;color:var(--text);border-bottom:1px solid var(--border2);padding-bottom:6px">1. Parameter Makro &amp; Fundamental</div>'
      
      + '      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">'
      + '        <div>'
      + '          <label style="font-size:11px;color:var(--text3);font-weight:700;display:block;margin-bottom:4px">Market Regime IHSG</label>'
      + '          <select class="form-input" style="width:100%;font-size:12px" onchange="window.updateSimParam(\'regime\', this.value)">'
      + '            <option value="bullish" ' + (inp.regime === 'bullish' ? 'selected' : '') + '>🟢 Bullish Risk-On (+10)</option>'
      + '            <option value="sideways" ' + (inp.regime === 'sideways' ? 'selected' : '') + '>🟡 Sideways Konsolidasi (+5)</option>'
      + '            <option value="bearish" ' + (inp.regime === 'bearish' ? 'selected' : '') + '>🔴 Bearish Risk-Off (0)</option>'
      + '          </select>'
      + '        </div>'
      + '        <div>'
      + '          <label style="font-size:11px;color:var(--text3);font-weight:700;display:block;margin-bottom:4px">Valuasi Harga Wajar (DCF/Graham)</label>'
      + '          <select class="form-input" style="width:100%;font-size:12px" onchange="window.updateSimParam(\'valuation\', this.value)">'
      + '            <option value="undervalued" ' + (inp.valuation === 'undervalued' ? 'selected' : '') + '>🟢 Undervalued / Diskon &gt;15% (+15)</option>'
      + '            <option value="fair" ' + (inp.valuation === 'fair' ? 'selected' : '') + '>🟡 Fair Valued (+8)</option>'
      + '            <option value="overvalued" ' + (inp.valuation === 'overvalued' ? 'selected' : '') + '>🔴 Overvalued / Mahal (0)</option>'
      + '          </select>'
      + '        </div>'
      + '      </div>'

      + '      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">'
      + '        <div>'
      + '          <label style="font-size:11px;color:var(--text3);font-weight:700;display:block;margin-bottom:4px">Kualitas Profitabilitas (ROE &amp; DER)</label>'
      + '          <select class="form-input" style="width:100%;font-size:12px" onchange="window.updateSimParam(\'roe\', this.value)">'
      + '            <option value="high" ' + (inp.roe === 'high' ? 'selected' : '') + '>🟢 ROE &gt; 15% &amp; DER &lt; 1.0x (+10)</option>'
      + '            <option value="med" ' + (inp.roe === 'med' ? 'selected' : '') + '>🟡 ROE 8-15% (+5)</option>'
      + '            <option value="low" ' + (inp.roe === 'low' ? 'selected' : '') + '>🔴 ROE Rendah / Utang Tinggi (0)</option>'
      + '          </select>'
      + '        </div>'
      + '        <div>'
      + '          <label style="font-size:11px;color:var(--text3);font-weight:700;display:block;margin-bottom:4px">KSEI 5%+ Free Float</label>'
      + '          <select class="form-input" style="width:100%;font-size:12px" onchange="window.updateSimParam(\'kseiFloat\', this.value)">'
      + '            <option value="healthy" ' + (inp.kseiFloat === 'healthy' ? 'selected' : '') + '>🟢 Kepemilikan Institusi Sehat (+5)</option>'
      + '            <option value="dumping" ' + (inp.kseiFloat === 'dumping' ? 'selected' : '') + '>🔴 Ada Pelepasan Pemegang Saham (0)</option>'
      + '          </select>'
      + '        </div>'
      + '      </div>'

      + '      <div style="font-size:13px;font-weight:800;color:var(--text);border-bottom:1px solid var(--border2);padding-bottom:6px;margin-top:6px">2. Parameter Teknikal &amp; Aliran Dana</div>'

      + '      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">'
      + '        <div>'
      + '          <label style="font-size:11px;color:var(--text3);font-weight:700;display:block;margin-bottom:4px">Struktur Tren 4-EMA Ribbon</label>'
      + '          <select class="form-input" style="width:100%;font-size:12px" onchange="window.updateSimParam(\'trend\', this.value)">'
      + '            <option value="uptrend_ema" ' + (inp.trend === 'uptrend_ema' ? 'selected' : '') + '>🟢 Golden Ribbon (EMA 20&gt;50&gt;200) (+15)</option>'
      + '            <option value="sideways" ' + (inp.trend === 'sideways' ? 'selected' : '') + '>🟡 Pita Rapat / Sideways (+5)</option>'
      + '            <option value="downtrend" ' + (inp.trend === 'downtrend' ? 'selected' : '') + '>🔴 Death Cross / Downtrend (0)</option>'
      + '          </select>'
      + '        </div>'
      + '        <div>'
      + '          <label style="font-size:11px;color:var(--text3);font-weight:700;display:block;margin-bottom:4px">Siklus Elliott Wave</label>'
      + '          <select class="form-input" style="width:100%;font-size:12px" onchange="window.updateSimParam(\'wave\', this.value)">'
      + '            <option value="wave3" ' + (inp.wave === 'wave3' ? 'selected' : '') + '>🟢 Wave 3 Impulse (+15)</option>'
      + '            <option value="wavec" ' + (inp.wave === 'wavec' ? 'selected' : '') + '>🟢 Wave C Rebound (+10)</option>'
      + '            <option value="wave1" ' + (inp.wave === 'wave1' ? 'selected' : '') + '>🟡 Wave 1 Awal (+8)</option>'
      + '            <option value="wave5" ' + (inp.wave === 'wave5' ? 'selected' : '') + '>🔴 Wave 5 / Klimaks Akhir (0)</option>'
      + '          </select>'
      + '        </div>'
      + '      </div>'

      + '      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">'
      + '        <div>'
      + '          <label style="font-size:11px;color:var(--text3);font-weight:700;display:block;margin-bottom:4px">Volume &amp; Chaikin Flow</label>'
      + '          <select class="form-input" style="width:100%;font-size:12px" onchange="window.updateSimParam(\'volume\', this.value)">'
      + '            <option value="spike" ' + (inp.volume === 'spike' ? 'selected' : '') + '>🟢 Volume Spike &gt;1.5x &amp; CMF &gt; 0 (+10)</option>'
      + '            <option value="normal" ' + (inp.volume === 'normal' ? 'selected' : '') + '>🟡 Volume Rata-rata (+4)</option>'
      + '            <option value="dry" ' + (inp.volume === 'dry' ? 'selected' : '') + '>🔴 Volume Kering / Distribusi (0)</option>'
      + '          </select>'
      + '        </div>'
      + '        <div>'
      + '          <label style="font-size:11px;color:var(--text3);font-weight:700;display:block;margin-bottom:4px">Akumulasi Broker &amp; Asing</label>'
      + '          <select class="form-input" style="width:100%;font-size:12px" onchange="window.updateSimParam(\'brokerFlow\', this.value)">'
      + '            <option value="accum_heavy" ' + (inp.brokerFlow === 'accum_heavy' ? 'selected' : '') + '>🟢 Top 3 Broker Akumulasi &gt;65% (+10)</option>'
      + '            <option value="accum_mod" ' + (inp.brokerFlow === 'accum_mod' ? 'selected' : '') + '>🟡 Akumulasi Netral/Moderat (+5)</option>'
      + '            <option value="dist" ' + (inp.brokerFlow === 'dist' ? 'selected' : '') + '>🔴 Distribusi Masif (0)</option>'
      + '          </select>'
      + '        </div>'
      + '      </div>'

      + '    </div>'

      // Live Output Calculation
      + '    <div style="background:linear-gradient(135deg, var(--bg2) 0%, rgba(56,189,248,0.05) 100%);border:1px solid rgba(56,189,248,0.3);border-radius:10px;padding:20px;display:flex;flex-direction:column;justify-content:space-between">'
      + '      <div>'
      + '        <div style="font-size:11px;color:var(--text3);font-weight:700;margin-bottom:4px">HASIL KALKULASI CONFLUENCE</div>'
      + '        <div style="font-size:26px;font-weight:800;font-family:var(--font-mono);color:' + (score >= 75 ? 'var(--green)' : score >= 50 ? 'var(--amber)' : 'var(--red)') + ';margin-bottom:8px">'
      + '          ' + score + ' / 100 SKOR'
      + '        </div>'
      + '        <div style="margin-bottom:16px">'
      + '          <span class="badge ' + verdictCls + '" style="font-size:12px;padding:4px 10px">' + verdict + '</span>'
      + '        </div>'

      + '        <div style="display:flex;flex-direction:column;gap:10px;background:var(--bg3);border:1px solid var(--border2);border-radius:8px;padding:12px;margin-bottom:16px">'
      + '          <div style="display:flex;justify-content:space-between;font-size:12px">'
      + '            <span style="color:var(--text3)">Probabilitas Kenaikan:</span>'
      + '            <strong style="font-family:var(--font-mono);color:var(--text)">' + winProb + '</strong>'
      + '          </div>'
      + '          <div style="display:flex;justify-content:space-between;font-size:12px">'
      + '            <span style="color:var(--text3)">Expected Value (EV):</span>'
      + '            <strong style="font-family:var(--font-mono);color:' + (evText.includes('+') ? 'var(--green)' : 'var(--red)') + '">' + evText + '</strong>'
      + '          </div>'
      + '          <div style="display:flex;justify-content:space-between;font-size:12px">'
      + '            <span style="color:var(--text3)">Rekomendasi Risiko:</span>'
      + '            <strong style="color:var(--text)">' + (score >= 75 ? 'Alokasi Penuh (Risk 1.0%)' : score >= 50 ? 'Alokasi Separuh (Risk 0.5%)' : 'Dilarang Masuk (0%)') + '</strong>'
      + '          </div>'
      + '        </div>'

      + '        <div style="font-size:12px;color:var(--text2);line-height:1.5">'
      + '          ' + (score >= 75 ? '✅ <strong>Kondisi Sempurna:</strong> Saham memenuhi konvergensi fundamental murah, tren teknikal bullish, dan akumulasi bandar masif. Potensi reli sangat tinggi.' : score >= 50 ? '⚠️ <strong>Kondisi Campuran:</strong> Beberapa faktor belum selaras. Disarankan menunggu konfirmasi volume breakout sebelum entry penuh.' : '❌ <strong>Kondisi Berbahaya:</strong> Terdapat indikasi distribusi modal dan tren menurun. Risiko penurunan modal tinggi (Negative EV).')
      + '        </div>'
      + '      </div>'

      + '      <div style="margin-top:16px;padding-top:12px;border-top:1px solid var(--border2)">'
      + '        <button class="btn btn-blue btn-sm" style="width:100%" onclick="goPage(\'stock-intel\')">Terapkan Analisa Pada Saham Riil →</button>'
      + '      </div>'
      + '    </div>'

      + '  </div>'
      + '</div>';
  }

  // Global helper to update simulation parameters
  window.updateSimParam = function(param, value) {
    KNOWLEDGE_STATE.simInputs[param] = value;
    renderKnowledgePage();
  };

  window.switchKnowledgeTab = switchKnowledgeTab;
  window.initKnowledgeSuite = initKnowledgeSuite;

})(window, document);
