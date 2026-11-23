/**
 * 35-settings.js — Money Watch Pro V6: Centralized Settings & Configuration Pillar
 * 
 * Consolidates:
 * 1. Dynamic Tax & Broker Fee Engine (Stockbit, IPOT, Mirae, Mandiri, BCA, Ajaib, Custom presets)
 * 2. Financial Goals & FIRE Calculator Settings (Target Dana FIRE, Pengeluaran Bulanan, Dana Darurat, Imbal Hasil)
 * 3. Multi-Bank & Liquid Cash Management (Operasional, Tabungan, Dana Darurat, E-Wallet, Pasar Uang)
 * 4. Liabilities & Debt Positions Management (KPR, Kendaraan, Kartu Kredit, Pinjaman Personal)
 * 5. Data Vault & Backup / Restore / JSON Export / Reset
 * 6. Display, Font Scaling & Terminal Density
 */

(function() {
  'use strict';

  var SETTINGS_KEY = 'mw_settings_v6';

  var DEFAULT_SETTINGS = {
    tax: {
      buyFee: 0.0018,       // 0.18% (Stockbit All-in buy fee)
      sellFee: 0.0028,      // 0.28% (Stockbit All-in sell fee)
      pphFinal: 0.001,      // 0.1% PPh Final jual (PP 14/1997)
      dividendTax: 0.00,    // 0% PPh Dividen (PMK 18/2021 bebas pajak)
      dividenExempt: true,  // Toggle bebas pajak dividen (PMK 18/2021)
      ppnFee: 0.11,         // PPN Efektif 11% Jasa Pialang
      serviceFee: 0.00,     // Biaya layanan tambahan (opsional)
      activeSekuritas: 'Stockbit'
    },
    fire: {
      fireTarget: 2500000000,       // Rp 2.5 Miliar
      monthlyExpense: 10000000,     // Rp 10 Juta / bulan
      emergencyFundTarget: 60000000,// Rp 60 Juta (6 bulan pengeluaran)
      expectedReturn: 12.0          // 12% p.a.
    },
    activeTab: 'tax'
  };

  var state = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));

  function loadSettings() {
    try {
      var raw = localStorage.getItem(SETTINGS_KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        if (parsed.tax) Object.assign(state.tax, parsed.tax);
        if (parsed.fire) Object.assign(state.fire, parsed.fire);
        if (parsed.activeTab) state.activeTab = parsed.activeTab;
      }
    } catch(e) {
      console.warn('MW_SETTINGS load error:', e);
    }
    syncWithGlobalEngines();
  }

  function saveSettings() {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(state));
      if (typeof mwExtrasTouch === 'function') mwExtrasTouch('settings');
    } catch(e) {
      console.warn('MW_SETTINGS save error:', e);
    }
    syncWithGlobalEngines();
    if (typeof saveData === 'function') saveData();
  }

  function syncWithGlobalEngines() {
    // 1. Sync Tax settings to global TAX_SETTINGS
    if (typeof TAX_SETTINGS !== 'undefined') {
      TAX_SETTINGS.ppn = (typeof state.tax.ppnFee === 'number') ? state.tax.ppnFee : 0.11;
      TAX_SETTINGS.pphJual = (typeof state.tax.pphFinal === 'number') ? state.tax.pphFinal : 0.001;
      TAX_SETTINGS.pphDividen = (typeof state.tax.dividendTax === 'number') ? state.tax.dividendTax : 0.00;
      TAX_SETTINGS.dividenExempt = (state.tax.dividenExempt !== false);
      TAX_SETTINGS.serviceFee = state.tax.serviceFee || 0.00;
    }

    // 2. Sync Sekuritas to global SEKURITAS
    if (typeof SEKURITAS !== 'undefined' && state.tax.activeSekuritas) {
      var sec = SEKURITAS[state.tax.activeSekuritas];
      if (sec) {
        sec.buyFee = state.tax.buyFee;
        sec.sellFee = state.tax.sellFee;
      }
      if (typeof activeSekuritas !== 'undefined') {
        activeSekuritas = state.tax.activeSekuritas;
      }
    }

    // 3. Sync FIRE expense to WEALTH
    if (typeof WEALTH !== 'undefined') {
      if (state.fire.monthlyExpense > 0) {
        WEALTH.expense = state.fire.monthlyExpense;
      }
    }
  }

  // Broker Presets
  var BROKER_PRESETS = {
    'Stockbit': { buyFee: 0.0018, sellFee: 0.0028, name: 'Stockbit (All-in Fee)' },
    'IPOT': { buyFee: 0.0019, sellFee: 0.0029, name: 'IPOT / Indo Premier' },
    'Mirae Asset': { buyFee: 0.0015, sellFee: 0.0025, name: 'Mirae Asset Sekuritas' },
    'Mandiri Sekuritas': { buyFee: 0.0018, sellFee: 0.0028, name: 'Mandiri Sekuritas (MOST)' },
    'BCA Sekuritas': { buyFee: 0.0018, sellFee: 0.0028, name: 'BCA Sekuritas (BEST)' },
    'Ajaib': { buyFee: 0.0015, sellFee: 0.0025, name: 'Ajaib Sekuritas' }
  };

  function applyBrokerPreset(presetKey) {
    var preset = BROKER_PRESETS[presetKey];
    if (!preset) return;
    state.tax.activeSekuritas = presetKey;
    state.tax.buyFee = preset.buyFee;
    state.tax.sellFee = preset.sellFee;
    saveSettings();

    // Refresh active form if on screen
    var bInput = document.getElementById('cfg-buyfee');
    var sInput = document.getElementById('cfg-sellfee');
    var secSelect = document.getElementById('cfg-default-sekuritas');
    if (bInput) bInput.value = (preset.buyFee * 100).toFixed(4);
    if (sInput) sInput.value = (preset.sellFee * 100).toFixed(4);
    if (secSelect) secSelect.value = presetKey;

    if (typeof showSaveStatus === 'function') {
      showSaveStatus('Preset broker diatur ke ' + preset.name);
    }
  }

  // SETTINGS CATEGORIES CONFIGURATION
  var SETTINGS_TABS = [
    { id: 'tax', label: 'Pajak & Broker', icon: 'ti ti-receipt-tax', hint: 'Tarif Pajak, Komisi Broker Sekuritas & Preset Populer' },
    { id: 'fire', label: 'FIRE & Sasaran', icon: 'ti ti-flame', hint: 'Target Dana FIRE, Pengeluaran Bulanan & Dana Darurat' },
    { id: 'bank', label: 'Kas & Bank', icon: 'ti ti-building-bank', hint: 'Manajemen Rekening Multi-Bank & Kas Likuid' },
    { id: 'debt', label: 'Hutang & Liabilitas', icon: 'ti ti-credit-card-off', hint: 'Daftar Kewajiban, Cicilan & Sisa Pokok Hutang' },
    { id: 'vault', label: 'Cadangan & Cloud', icon: 'ti ti-cloud-lock', hint: 'Sinkronisasi Supabase Cloud, Ekspor CSV/PDF/JSON & Reset Data' },
    { id: 'display', label: 'Tampilan & UI', icon: 'ti ti-palette', hint: 'Kerapatan Tabel, Skala Font (Zoom), Running Ticker & Mode Terminal' },
    { id: 'integrations', label: 'API & Telemetri', icon: 'ti ti-plug', hint: 'Status Kuota Invezgo, Upload KSEI & Telemetri Data Quality Gate' },
    { id: 'all', label: 'Semua Menu', icon: 'ti ti-layout-grid', hint: 'Tampilkan Seluruh Fitur Pengaturan Sekaligus' }
  ];

  function setTab(tabId) {
    if (!tabId) return;
    state.activeTab = tabId;
    saveSettings();
    renderSettingsPage(tabId);
  }

  // RENDER FULL SETTINGS PAGE / PILLAR
  function renderSettingsPage(tab) {
    var c = document.getElementById('page-settings');
    if (!c) return;

    if (tab) state.activeTab = tab;
    var currentTab = state.activeTab || 'tax';

    var wData = (typeof wCalc === 'function') ? wCalc() : { net: 0, aset: 0, bankTotal: 0, debt: { t: 0 } };
    var accounts = (typeof WEALTH !== 'undefined' && Array.isArray(WEALTH.bank)) ? WEALTH.bank : [];
    var debts = (typeof WEALTH !== 'undefined' && Array.isArray(WEALTH.debt)) ? WEALTH.debt : [];

    // FIRE progress calculation
    var currentNet = Math.max(0, wData.net || 0);
    var fireTarget = state.fire.fireTarget || 2500000000;
    var fireProgressPct = Math.min(100, (currentNet / fireTarget * 100)).toFixed(1);
    var monthlyExp = state.fire.monthlyExpense || 10000000;
    var annualExp = monthlyExp * 12;
    var emergencyTarget = state.fire.emergencyFundTarget || 60000000;
    var emergencyProgressPct = Math.min(100, (wData.bankTotal / emergencyTarget * 100)).toFixed(1);
    var expReturn = state.fire.expectedReturn || 12.0;

    var curTabObj = SETTINGS_TABS.find(function(t){ return t.id === currentTab; }) || SETTINGS_TABS[0];

    // Card Builder: 1. Tax & Broker Fees
    function renderCardTax() {
      return `
        <div class="card" style="padding:22px 24px;border-radius:12px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;border-bottom:1px solid var(--border2);padding-bottom:12px">
            <div style="font-weight:700;font-size:15px;color:var(--text);display:flex;align-items:center;gap:8px">
              <i class="ti ti-receipt-tax" style="color:var(--accent)"></i> Tarif Pajak &amp; Komisi Broker Sekuritas
            </div>
            <span class="badge b-up">Configurable</span>
          </div>

          <!-- Broker Quick Presets -->
          <div style="margin-bottom:18px">
            <div style="font-size:11.5px;font-weight:700;color:var(--text3);margin-bottom:8px">PRESET SEKURITAS POPULER:</div>
            <div style="display:flex;flex-wrap:wrap;gap:8px">
              ${Object.keys(BROKER_PRESETS).map(function(k) {
                var isAct = (state.tax.activeSekuritas === k);
                return `<button type="button" class="btn ${isAct ? 'btn-primary' : 'btn-ghost'} btn-sm" style="font-size:12px;padding:5px 12px" onclick="MW_SETTINGS.applyBrokerPreset('${k}')">${k}</button>`;
              }).join('')}
            </div>
          </div>

          <form id="v6-form-tax-settings" onsubmit="MW_SETTINGS.handleSaveTaxSettings(event)">
            <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(180px, 1fr));gap:16px;margin-bottom:16px">
              <div>
                <label class="cfg-label">Komisi Beli (%)</label>
                <input type="number" id="cfg-buyfee" class="form-input mono" step="0.0001" value="${(state.tax.buyFee * 100).toFixed(4)}" required>
                <div class="cfg-hint">Standar industri: 0.15%</div>
              </div>
              <div>
                <label class="cfg-label">Komisi Jual (%)</label>
                <input type="number" id="cfg-sellfee" class="form-input mono" step="0.0001" value="${(state.tax.sellFee * 100).toFixed(4)}" required>
                <div class="cfg-hint">Standar industri: 0.25%</div>
              </div>
            </div>

            <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(180px, 1fr));gap:16px;margin-bottom:16px">
              <div>
                <label class="cfg-label">PPh Final Jual (%)</label>
                <input type="number" id="cfg-pph" class="form-input mono" step="0.0001" value="${(state.tax.pphFinal * 100).toFixed(2)}" required>
                <div class="cfg-hint">PPh Pasal 4 ayat (2): 0.1%</div>
              </div>
              <div>
                <label class="cfg-label">Tarif PPN Komisi (%)</label>
                <input type="number" id="cfg-ppn" class="form-input mono" step="0.1" value="${(state.tax.ppnFee * 100).toFixed(0)}">
                <div class="cfg-hint">Tarif PPN UU HPP: 11%</div>
              </div>
            </div>

            <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(180px, 1fr));gap:16px;margin-bottom:18px">
              <div>
                <label class="cfg-label">Nama Sekuritas Aktif</label>
                <select id="cfg-default-sekuritas" class="form-input">
                  <option value="Stockbit" ${state.tax.activeSekuritas === 'Stockbit' ? 'selected' : ''}>Stockbit</option>
                  <option value="IPOT" ${state.tax.activeSekuritas === 'IPOT' ? 'selected' : ''}>IPOT / Indo Premier</option>
                  <option value="Mirae Asset" ${state.tax.activeSekuritas === 'Mirae Asset' ? 'selected' : ''}>Mirae Asset</option>
                  <option value="Mandiri Sekuritas" ${state.tax.activeSekuritas === 'Mandiri Sekuritas' ? 'selected' : ''}>Mandiri Sekuritas</option>
                  <option value="BCA Sekuritas" ${state.tax.activeSekuritas === 'BCA Sekuritas' ? 'selected' : ''}>BCA Sekuritas</option>
                  <option value="Ajaib" ${state.tax.activeSekuritas === 'Ajaib' ? 'selected' : ''}>Ajaib</option>
                  <option value="Custom" ${state.tax.activeSekuritas === 'Custom' ? 'selected' : ''}>Custom Sekuritas</option>
                </select>
              </div>
              <div>
                <label class="cfg-label">Service Fee Tambahan (%)</label>
                <input type="number" id="cfg-servicefee" class="form-input mono" step="0.001" value="${((state.tax.serviceFee || 0) * 100).toFixed(3)}">
                <div class="cfg-hint">Levy IDX / KPEI / KSEI: ~0.043%</div>
              </div>
            </div>

            <!-- PMK 18/2021 Dividend Exemption Toggle -->
            <div style="background:var(--bg3);border:1px solid var(--border2);border-radius:8px;padding:14px 16px;margin-bottom:18px">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
                <div style="font-size:13px;font-weight:700;color:var(--text)">Bebas PPh Dividen (PMK 18/2021)</div>
                <label style="display:flex;align-items:center;gap:6px;cursor:pointer">
                  <input type="checkbox" id="cfg-div-exempt" ${state.tax.dividenExempt !== false ? 'checked' : ''} onchange="var dt=document.getElementById('cfg-divtax-box'); if(dt) dt.style.display=this.checked?'none':'block';">
                  <span style="font-size:12px;font-weight:600;color:var(--green)">0% (Bebas Pajak)</span>
                </label>
              </div>
              <div class="cfg-hint" style="margin-top:0">Dividen Wajib Pajak OP Dalam Negeri bebas PPh jika direinvestasikan di wilayah NKRI.</div>
              <div id="cfg-divtax-box" style="display:${state.tax.dividenExempt !== false ? 'none' : 'block'};margin-top:12px;padding-top:12px;border-top:1px solid var(--border2)">
                <label class="cfg-label">Tarif PPh Dividen Normal Non-Reinvestasi (%)</label>
                <input type="number" id="cfg-divtax" class="form-input mono" step="0.01" value="${((state.tax.dividendTax || 0.10) * 100).toFixed(1)}">
              </div>
            </div>

            <div style="display:flex;gap:10px">
              <button type="submit" class="btn btn-primary" style="flex:1;min-height:40px;justify-content:center;font-size:13px">
                Simpan Tarif Pajak
              </button>
              <button type="button" class="btn btn-ghost" style="min-height:40px;font-size:13px" onclick="MW_SETTINGS.triggerRecalculate()" title="Koreksi ulang seluruh angka transaksi &amp; pajak yang tersimpan tanpa menghapus riwayat transaksi">
                Rekalkulasi Data
              </button>
            </div>
          </form>
        </div>
      `;
    }

    // Card Builder: 2. Financial Goals & FIRE Settings
    function renderCardFire() {
      return `
        <div class="card" style="padding:22px 24px;border-radius:12px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;border-bottom:1px solid var(--border2);padding-bottom:12px">
            <div style="font-weight:700;font-size:15px;color:var(--text);display:flex;align-items:center;gap:8px">
              <i class="ti ti-flame" style="color:var(--amber)"></i> Sasaran Keuangan &amp; Parameter FIRE
            </div>
            <span class="badge b-neu" style="font-size:10px">Parameter FIRE</span>
          </div>

          <!-- FIRE Progress Meter -->
          <div style="background:var(--bg3);border:1px solid var(--border2);border-radius:8px;padding:14px 16px;margin-bottom:16px">
            <div style="display:flex;justify-content:space-between;font-size:12.5px;margin-bottom:8px">
              <span style="font-weight:600;color:var(--text)">Kesiapan Dana FIRE</span>
              <strong style="color:var(--accent);font-family:var(--font-mono)">${fireProgressPct}% (Rp ${fmt(currentNet)} / Rp ${fmt(fireTarget)})</strong>
            </div>
            <div style="background:var(--bg2);height:8px;border-radius:4px;overflow:hidden;border:1px solid var(--border2)">
              <div style="background:var(--accent);height:100%;width:${fireProgressPct}%;transition:width 0.3s"></div>
            </div>
            <div style="font-size:11px;color:var(--text3);margin-top:8px;display:flex;justify-content:space-between;flex-wrap:wrap;gap:4px">
              <span>Pengeluaran Tahunan: <b style="color:var(--text2)">Rp ${fmt(annualExp)}</b></span>
              <span>Dana Darurat: <b style="color:var(--text2)">${emergencyProgressPct}%</b> (${(wData.bankTotal / Math.max(1, monthlyExp)).toFixed(1)} bln)</span>
            </div>
          </div>

          <form id="v6-form-fire-settings" onsubmit="MW_SETTINGS.handleSaveFireSettings(event)">
            <div style="margin-bottom:16px">
              <label class="cfg-label">Target Dana FIRE (Financial Independence) (Rp)</label>
              <input type="number" id="cfg-fire-target" class="form-input mono" value="${fireTarget}" step="10000000" required>
              <div class="cfg-hint">Aturan 4%: 25x Pengeluaran Tahunan = Rp ${fmt(fireTarget)}</div>
            </div>

            <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(180px, 1fr));gap:16px;margin-bottom:16px">
              <div>
                <label class="cfg-label">Pengeluaran Bulanan (Rp)</label>
                <input type="number" id="cfg-monthly-exp" class="form-input mono" value="${monthlyExp}" step="500000">
                <div class="cfg-hint">Kebutuhan hidup bulanan</div>
              </div>
              <div>
                <label class="cfg-label">Target Dana Darurat (Rp)</label>
                <input type="number" id="cfg-emergency-target" class="form-input mono" value="${emergencyTarget}" step="1000000">
                <div class="cfg-hint">Standar ideal: 6–12 bulan pengeluaran</div>
              </div>
            </div>

            <div style="margin-bottom:20px">
              <label class="cfg-label">Asumsi Imbal Hasil Portofolio Tahunan (%)</label>
              <input type="number" id="cfg-expected-return" class="form-input mono" value="${expReturn}" step="0.1">
              <div class="cfg-hint">Ekspektasi CAGR portofolio majemuk</div>
            </div>

            <button type="submit" class="btn btn-secondary" style="width:100%;min-height:42px;justify-content:center;font-size:13px">
              Simpan Parameter Sasaran Keuangan &amp; FIRE
            </button>
          </form>
        </div>
      `;
    }

    // Card Builder: 3. Multi-Bank Accounts
    function renderCardBank() {
      return `
        <div class="card" style="padding:22px 24px;border-radius:12px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;border-bottom:1px solid var(--border2);padding-bottom:12px">
            <div style="font-weight:700;font-size:15px;color:var(--text);display:flex;align-items:center;gap:8px">
              <i class="ti ti-building-bank" style="color:var(--accent)"></i> Manajemen Rekening Bank &amp; Kas Likuid
            </div>
            <span class="badge b-up">${accounts.length} Rekening</span>
          </div>

          <!-- Existing Bank Accounts List -->
          <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:16px;max-height:260px;overflow-y:auto">
            ${accounts.length === 0 ? '<div style="font-size:12px;color:var(--text3);padding:12px 0;text-align:center">Belum ada rekening bank yang dikonfigurasi.</div>' : ''}
            ${accounts.map(function(acc, idx) {
              return `
                <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 14px;background:var(--bg3);border-radius:8px;border:1px solid var(--border2)">
                  <div>
                    <div style="font-weight:600;font-size:13px;color:var(--text)">${escHtml(acc.bank || acc.name || 'Bank')}</div>
                    <div style="font-size:11px;color:var(--text3)">${escHtml(acc.type || acc.category || 'Tabungan')} ${acc.no ? '· ' + escHtml(acc.no) : ''}</div>
                  </div>
                  <div style="display:flex;align-items:center;gap:12px">
                    <span class="mono" style="font-weight:700;color:#38bdf8;font-size:13px">Rp ${fmt(acc.saldo || acc.balance || 0)}</span>
                    <button type="button" class="btn btn-ghost btn-xs" style="color:var(--red);padding:4px 8px;font-size:11px" onclick="MW_SETTINGS.deleteBankAccount(${idx})">
                      <i class="ti ti-trash"></i> Hapus
                    </button>
                  </div>
                </div>
              `;
            }).join('')}
          </div>

          <!-- Add New Bank Account Form -->
          <form onsubmit="MW_SETTINGS.handleAddBankAccount(event)" style="border-top:1px solid var(--border2);padding-top:14px">
            <div style="font-size:12.5px;font-weight:700;color:var(--text);margin-bottom:10px">Tambah Rekening Baru:</div>
            <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(110px, 1fr));gap:10px;margin-bottom:12px">
              <input type="text" id="new-v6-bank-name" class="form-input" placeholder="Nama Bank (e.g. BCA)" required>
              <select id="new-v6-bank-cat" class="form-input">
                <option value="Operasional">Operasional</option>
                <option value="Tabungan">Tabungan</option>
                <option value="Dana Darurat">Dana Darurat</option>
                <option value="E-Wallet">E-Wallet</option>
                <option value="Pasar Uang">Pasar Uang</option>
              </select>
              <input type="number" id="new-v6-bank-saldo" class="form-input mono" placeholder="Saldo (Rp)" required>
            </div>
            <button type="submit" class="btn btn-secondary btn-sm" style="width:100%;min-height:38px;justify-content:center;font-size:12.5px">
              Tambahkan Rekening Bank
            </button>
          </form>
        </div>
      `;
    }

    // Card Builder: 4. Liabilities & Debts
    function renderCardDebt() {
      return `
        <div class="card" style="padding:22px 24px;border-radius:12px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;border-bottom:1px solid var(--border2);padding-bottom:12px">
            <div style="font-weight:700;font-size:15px;color:var(--text);display:flex;align-items:center;gap:8px">
              <i class="ti ti-credit-card-off" style="color:var(--red)"></i> Manajemen Liabilitas &amp; Kewajiban
            </div>
            <span class="badge b-dn">${debts.length} Pos Hutang</span>
          </div>

          <!-- Existing Debts List -->
          <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:16px;max-height:260px;overflow-y:auto">
            ${debts.length === 0 ? '<div style="font-size:12px;color:var(--text3);padding:12px 0;text-align:center">Tidak ada kewajiban atau hutang aktif.</div>' : ''}
            ${debts.map(function(d, idx) {
              return `
                <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 14px;background:var(--bg3);border-radius:8px;border:1px solid var(--border2)">
                  <div>
                    <div style="font-weight:600;font-size:13px;color:var(--text)">${escHtml(d.nama || d.name || 'Kewajiban')}</div>
                    <div style="font-size:11px;color:var(--text3)">${escHtml(d.tipe || d.category || 'Cicilan')} ${d.cicilan ? '· Cicilan Rp ' + fmt(d.cicilan) + '/bln' : ''}</div>
                  </div>
                  <div style="display:flex;align-items:center;gap:12px">
                    <span class="mono dn" style="font-weight:700;font-size:13px">-Rp ${fmt(d.outstanding || d.amount || 0)}</span>
                    <button type="button" class="btn btn-ghost btn-xs" style="color:var(--red);padding:4px 8px;font-size:11px" onclick="MW_SETTINGS.deleteDebt(${idx})">
                      <i class="ti ti-trash"></i> Hapus
                    </button>
                  </div>
                </div>
              `;
            }).join('')}
          </div>

          <!-- Add New Debt Form -->
          <form onsubmit="MW_SETTINGS.handleAddDebt(event)" style="border-top:1px solid var(--border2);padding-top:14px">
            <div style="font-size:12.5px;font-weight:700;color:var(--text);margin-bottom:10px">Tambah Pos Liabilitas:</div>
            <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(110px, 1fr));gap:10px;margin-bottom:12px">
              <input type="text" id="new-v6-debt-name" class="form-input" placeholder="Nama Pos (e.g. KPR)" required>
              <select id="new-v6-debt-cat" class="form-input">
                <option value="KPR">KPR Rumah</option>
                <option value="Kendaraan">Cicilan Kendaraan</option>
                <option value="Kartu Kredit">Kartu Kredit</option>
                <option value="Personal">Pinjaman Personal</option>
              </select>
              <input type="number" id="new-v6-debt-amount" class="form-input mono" placeholder="Sisa Pokok (Rp)" required>
            </div>
            <button type="submit" class="btn btn-ghost btn-sm" style="width:100%;min-height:38px;justify-content:center;color:var(--red);border-color:rgba(239,68,68,0.3);font-size:12.5px">
              Tambahkan Pos Liabilitas
            </button>
          </form>
        </div>
      `;
    }

    // Card Builder: 5. Data Vault & Backup/Restore/Cloud
    function renderCardVault() {
      return `
        <div class="card" style="padding:22px 24px;border-radius:12px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;border-bottom:1px solid var(--border2);padding-bottom:12px">
            <div style="font-weight:700;font-size:15px;color:var(--text);display:flex;align-items:center;gap:8px">
              <i class="ti ti-cloud-lock" style="color:var(--accent)"></i> Cadangan Data, Pemulihan &amp; Database Cloud
            </div>
            <span class="badge b-up">Data Vault</span>
          </div>

          <div style="display:flex;flex-direction:column;gap:12px">
            <!-- Supabase Cloud Sync Card -->
            <div style="padding:12px 14px;background:var(--bg3);border:1px solid var(--border2);border-radius:8px">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
                <div style="font-weight:700;font-size:13px;color:var(--text);display:flex;align-items:center;gap:6px">
                  <span style="width:8px;height:8px;border-radius:50%;background:var(--green)"></span>
                  Database Cloud Supabase
                </div>
                <button type="button" class="btn btn-ghost btn-xs" onclick="if(typeof checkSupabaseLiveSyncStatus==='function')checkSupabaseLiveSyncStatus();" style="border-color:var(--accent);color:var(--accent);font-size:11px">
                  Audit Sinkronisasi
                </button>
              </div>
              <div style="font-size:11.5px;color:var(--text3);margin-bottom:10px">
                Data transaksi saham, kas RDN, dan dividen tersinkron otomatis ke Supabase Cloud.
              </div>
              <div style="display:flex;gap:8px;flex-wrap:wrap">
                <button type="button" class="btn btn-blue btn-sm" style="flex:1;justify-content:center;font-size:12px;font-weight:600" onclick="if(typeof migrateLocalDataToSupabaseCloud==='function')migrateLocalDataToSupabaseCloud(true).then(function(){ if(typeof checkSupabaseLiveSyncStatus==='function')checkSupabaseLiveSyncStatus(); });">
                  Sinkronkan Sekarang
                </button>
                <button type="button" class="btn btn-ghost btn-sm" style="flex:1;justify-content:center;font-size:12px" onclick="if(typeof fireLoadAllData==='function')fireLoadAllData().then(function(){ if(typeof showSaveStatus==='function')showSaveStatus('Data dimuat dari Cloud','var(--green)'); });">
                  Muat Ulang dari Cloud
                </button>
              </div>
            </div>

            <!-- Consolidated Export -->
            <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 14px;background:rgba(5,150,105,0.1);border:1px solid rgba(5,150,105,0.3);border-radius:8px">
              <div>
                <div style="font-weight:700;font-size:13px;color:#10b981">Ekspor Terkonsolidasi (Excel / CSV)</div>
                <div style="font-size:11px;color:var(--text3)">Gabungkan seluruh portofolio, kas, dividen, dan FIRE ke berkas CSV.</div>
              </div>
              <button type="button" class="btn btn-green btn-sm" style="background:#059669;color:#fff;border-color:#047857;font-weight:700" onclick="if(typeof exportConsolidatedPortfolioCsv==='function')exportConsolidatedPortfolioCsv();">
                Ekspor CSV
              </button>
            </div>

            <!-- PDF Reports -->
            <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 14px;background:rgba(59,130,246,0.1);border:1px solid rgba(59,130,246,0.3);border-radius:8px">
              <div>
                <div style="font-weight:700;font-size:13px;color:#38bdf8">Pusat Laporan &amp; Dokumen PDF</div>
                <div style="font-size:11px;color:var(--text3)">Pratinjau dan cetak dokumen resmi Family Office A4.</div>
              </div>
              <button type="button" class="btn btn-blue btn-sm" style="font-weight:700" onclick="if(typeof mwOpenPdfReportModal==='function')mwOpenPdfReportModal('consolidated');">
                Buka Laporan PDF
              </button>
            </div>

            <!-- Master JSON Backup -->
            <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 14px;background:var(--bg3);border:1px solid var(--border2);border-radius:8px">
              <div>
                <div style="font-weight:700;font-size:13px;color:var(--text)">Ekspor Cadangan Master JSON</div>
                <div style="font-size:11px;color:var(--text3)">Unduh berkas portofolio, mutasi kas RDN, dividen, dan rekening lengkap.</div>
              </div>
              <button type="button" class="btn btn-ghost btn-sm" onclick="MW_SETTINGS.exportJsonBackup()">
                Ekspor JSON
              </button>
            </div>

            <!-- Restore JSON Backup -->
            <div style="padding:12px 14px;background:var(--bg3);border:1px solid var(--border2);border-radius:8px">
              <div style="font-weight:700;font-size:13px;color:var(--text);margin-bottom:2px">Pulihkan Data dari JSON</div>
              <div style="font-size:11px;color:var(--text3);margin-bottom:8px">Unggah berkas cadangan MoneyWatch untuk memulihkan seluruh data.</div>
              <label class="btn btn-ghost btn-sm" style="width:100%;justify-content:center;cursor:pointer">
                Pilih Berkas JSON untuk Dipulihkan...
                <input type="file" accept=".json" onchange="MW_SETTINGS.handleFileImport(event)" style="display:none">
              </label>
            </div>

            <!-- Danger: Reset Data -->
            <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 14px;background:rgba(239,68,68,0.06);border:1px solid rgba(239,68,68,0.2);border-radius:8px">
              <div>
                <div style="font-weight:700;font-size:13px;color:var(--red)">Reset Data Transaksi (0 Transaksi)</div>
                <div style="font-size:11px;color:var(--text3)">Kosongkan seluruh riwayat portofolio &amp; transaksi di Supabase Cloud dan lokal.</div>
              </div>
              <button type="button" class="btn btn-ghost btn-sm" style="color:var(--red);border-color:rgba(239,68,68,0.3)" onclick="MW_SETTINGS.confirmDataReset()">
                Reset Data
              </button>
            </div>
          </div>
        </div>
      `;
    }

    // Card Builder: 6. Display, UI & Feed Preferences
    function renderCardDisplay() {
      var curDens = typeof mwGetTableDensity === 'function' ? mwGetTableDensity() : 'standard';
      var isExec = typeof mwViewMode !== 'undefined' && mwViewMode === 'executive';
      return `
        <div class="card" style="padding:22px 24px;border-radius:12px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;border-bottom:1px solid var(--border2);padding-bottom:12px">
            <div style="font-weight:700;font-size:15px;color:var(--text);display:flex;align-items:center;gap:8px">
              <i class="ti ti-palette" style="color:var(--accent)"></i> Tampilan, Kerapatan &amp; Skala Antarmuka
            </div>
            <span class="badge b-up">UI Control</span>
          </div>

          <div style="display:flex;flex-direction:column;gap:16px">
            <!-- Table Density -->
            <div style="padding:12px 14px;background:var(--bg3);border:1px solid var(--border2);border-radius:8px">
              <div style="font-weight:600;font-size:12.5px;color:var(--text);margin-bottom:4px">Kerapatan Tabel Data (Density):</div>
              <div style="font-size:11px;color:var(--text3);margin-bottom:10px">Mengatur jarak vertikal baris tabel saham dan riwayat mutasi kas.</div>
              <div style="display:flex;gap:8px">
                <button type="button" class="btn ${curDens==='compact'?'btn-primary':'btn-ghost'} btn-xs" style="flex:1;justify-content:center" onclick="if(typeof setViewDensity==='function')setViewDensity('compact'); if(typeof mwSetTableDensity==='function')mwSetTableDensity('compact'); renderSettingsPage('display');">Compact (Rapat)</button>
                <button type="button" class="btn ${curDens==='standard'||curDens==='comfortable'?'btn-primary':'btn-ghost'} btn-xs" style="flex:1;justify-content:center" onclick="if(typeof setViewDensity==='function')setViewDensity('comfortable'); if(typeof mwSetTableDensity==='function')mwSetTableDensity('standard'); renderSettingsPage('display');">Comfortable (Nyaman)</button>
                <button type="button" class="btn ${curDens==='executive'||curDens==='pro'?'btn-primary':'btn-ghost'} btn-xs" style="flex:1;justify-content:center" onclick="if(typeof setViewDensity==='function')setViewDensity('executive'); if(typeof mwSetTableDensity==='function')mwSetTableDensity('pro'); renderSettingsPage('display');">Executive (Luas)</button>
              </div>
            </div>

            <!-- Font Zoom Scale -->
            <div style="padding:12px 14px;background:var(--bg3);border:1px solid var(--border2);border-radius:8px">
              <div style="font-weight:600;font-size:12.5px;color:var(--text);margin-bottom:4px">Skala Ukuran Tampilan (Zoom):</div>
              <div style="font-size:11px;color:var(--text3);margin-bottom:10px">Perbesar atau perkecil rasio elemen antarmuka aplikasi.</div>
              <div style="display:flex;gap:8px">
                <button type="button" class="btn btn-ghost btn-xs" style="flex:1;justify-content:center;font-weight:700" onclick="if(typeof mwZoom==='function')mwZoom(-0.05)">A−</button>
                <button type="button" class="btn btn-ghost btn-xs" style="flex:1;justify-content:center;font-weight:700" onclick="if(typeof mwZoom==='function')mwZoom(0)">100% (Reset)</button>
                <button type="button" class="btn btn-ghost btn-xs" style="flex:1;justify-content:center;font-weight:700" onclick="if(typeof mwZoom==='function')mwZoom(0.05)">A+</button>
              </div>
            </div>

            <!-- Terminal Work Mode -->
            <div style="padding:12px 14px;background:var(--bg3);border:1px solid var(--border2);border-radius:8px">
              <div style="font-weight:600;font-size:12.5px;color:var(--text);margin-bottom:4px">Mode Kerja Terminal:</div>
              <div style="font-size:11px;color:var(--text3);margin-bottom:10px">Pilih antara tampilan analisis komprehensif atau ringkas.</div>
              <div style="display:flex;gap:8px">
                <button type="button" class="btn ${!isExec?'btn-primary':'btn-ghost'} btn-xs" style="flex:1;justify-content:center" onclick="if(typeof mwSetViewMode==='function')mwSetViewMode('pro'); renderSettingsPage('display');">PRO Terminal</button>
                <button type="button" class="btn ${isExec?'btn-primary':'btn-ghost'} btn-xs" style="flex:1;justify-content:center" onclick="if(typeof mwSetViewMode==='function')mwSetViewMode('executive'); renderSettingsPage('display');">Executive</button>
              </div>
            </div>

            <!-- Running Ticker Tape Toggle -->
            <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 14px;background:var(--bg3);border:1px solid var(--border2);border-radius:8px">
              <div>
                <div style="font-weight:600;font-size:12.5px;color:var(--text)">Running Ticker Tape BEI</div>
                <div style="font-size:11px;color:var(--text3)">Pita harga berjalan real-time di bawah topbar</div>
              </div>
              <button type="button" class="btn btn-ghost btn-sm" onclick="var tw=document.getElementById('ticker-wrap'); if(tw){ tw.style.display = tw.style.display==='none'?'flex':'none'; if(typeof showSaveStatus==='function')showSaveStatus('Pengaturan ticker diperbarui'); }">
                Alihkan Ticker
              </button>
            </div>
          </div>
        </div>
      `;
    }

    // Card Builder: 7. API Quotas & Telemetry
    function renderCardIntegrations() {
      return `
        <!-- Invezgo Quota -->
        <div class="card" style="padding:20px;border-radius:12px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;border-bottom:1px solid var(--border2);padding-bottom:10px">
            <div style="font-weight:700;font-size:14px;color:var(--text);display:flex;align-items:center;gap:6px">
              <i class="ti ti-activity" style="color:var(--accent)"></i> Kuota Invezgo (Bandarmology)
            </div>
            <span class="badge b-up">Real-time</span>
          </div>
          <div id="quota-invezgo-box" style="font-size:12px;color:var(--text3)">Memuat data kuota…</div>
        </div>

        <!-- Data Quality Gate Telemetry -->
        <div class="card" style="padding:20px;border-radius:12px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;border-bottom:1px solid var(--border2);padding-bottom:10px">
            <div style="font-weight:700;font-size:14px;color:var(--text);display:flex;align-items:center;gap:6px">
              <i class="ti ti-shield-check" style="color:var(--green)"></i> Data Quality Gate (AI Trading)
            </div>
            <span class="badge b-up">Hari ini</span>
          </div>
          <div id="quota-dq-box" style="font-size:12px;color:var(--text3)">Memuat telemetri…</div>
        </div>

        <!-- KSEI Ownership & Free Float shortcut -->
        <div class="card" style="padding:20px;border-radius:12px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;border-bottom:1px solid var(--border2);padding-bottom:10px">
            <div style="font-weight:700;font-size:14px;color:var(--text);display:flex;align-items:center;gap:6px">
              <i class="ti ti-file-spreadsheet" style="color:#10b981"></i> Struktur Kepemilikan &amp; Free Float (KSEI)
            </div>
            <span class="badge b-up">Excel Sync</span>
          </div>
          <div style="font-size:11.5px;color:var(--text2);line-height:1.6;margin-bottom:12px">
            Perbarui data Kepemilikan Saham &gt;5% dan Rasio Free Float resmi IDX dari file Excel KSEI.
          </div>
          <div style="display:flex;gap:8px">
            <button type="button" class="btn btn-primary btn-sm" style="flex:1;justify-content:center" onclick="if(typeof openKseiModal==='function')openKseiModal();if(typeof kseiSwitchTab==='function')kseiSwitchTab('sync-settings');">
              Buka KSEI Explorer &amp; Upload
            </button>
            <button type="button" class="btn btn-ghost btn-sm" onclick="if(typeof rdLoadUniverse==='function'){ rdLoadUniverse(true); if(typeof showSaveStatus==='function')showSaveStatus('Cache harga diperbarui','var(--green)'); }">
              Refresh Feed Saham
            </button>
          </div>
        </div>
      `;
    }

    // Determine category content to render
    var categoryContent = '';
    if (currentTab === 'tax') {
      categoryContent = `<div style="max-width:860px;margin:0 auto">${renderCardTax()}</div>`;
    } else if (currentTab === 'fire') {
      categoryContent = `<div style="max-width:860px;margin:0 auto">${renderCardFire()}</div>`;
    } else if (currentTab === 'bank') {
      categoryContent = `<div style="max-width:860px;margin:0 auto">${renderCardBank()}</div>`;
    } else if (currentTab === 'debt') {
      categoryContent = `<div style="max-width:860px;margin:0 auto">${renderCardDebt()}</div>`;
    } else if (currentTab === 'vault') {
      categoryContent = `<div style="max-width:860px;margin:0 auto">${renderCardVault()}</div>`;
    } else if (currentTab === 'display') {
      categoryContent = `<div style="max-width:860px;margin:0 auto">${renderCardDisplay()}</div>`;
    } else if (currentTab === 'integrations') {
      categoryContent = `<div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(340px, 1fr));gap:16px">${renderCardIntegrations()}</div>`;
    } else {
      // 'all'
      categoryContent = `
        <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(340px, 1fr));gap:16px;margin-bottom:20px">
          ${renderCardTax()}
          ${renderCardFire()}
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(340px, 1fr));gap:16px;margin-bottom:20px">
          ${renderCardBank()}
          ${renderCardDebt()}
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(340px, 1fr));gap:16px;margin-bottom:20px">
          ${renderCardVault()}
          ${renderCardDisplay()}
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(340px, 1fr));gap:16px">
          ${renderCardIntegrations()}
        </div>
      `;
    }

    var html = `
      <!-- Page Header -->
      <div style="margin-bottom:18px;display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:12px">
        <div>
          <div class="ptitle" style="display:flex;align-items:center;gap:8px">
            Pusat Pengaturan &amp; Konfigurasi Sistem
          </div>
          <div class="psub">
            ${curTabObj ? curTabObj.hint : 'Kelola seluruh parameter sistem MoneyWatch Pro secara terpusat.'}
          </div>
        </div>
        <div style="display:flex;gap:8px">
          <button class="btn btn-primary btn-sm" onclick="MW_SETTINGS.exportJsonBackup()">
            Ekspor Cadangan JSON
          </button>
          <label class="btn btn-ghost btn-sm" style="cursor:pointer">
            Impor JSON
            <input type="file" accept=".json" onchange="MW_SETTINGS.handleFileImport(event)" style="display:none">
          </label>
        </div>
      </div>

      <!-- Overview KPI Ribbon -->
      <div class="row4" style="margin-bottom:18px">
        <div class="metric">
          <div class="mlabel">TOTAL NET WORTH</div>
          <div class="mval" style="color:var(--accent)">Rp ${fmt(wData.net)}</div>
          <div class="msub neu">Basis Akumulasi FIRE</div>
        </div>
        <div class="metric">
          <div class="mlabel">PROGRES SASARAN FIRE</div>
          <div class="mval ${Number(fireProgressPct)>=50?'up':'neu'}">${fireProgressPct}%</div>
          <div class="msub neu">Target Rp ${fmt(fireTarget)}</div>
        </div>
        <div class="metric">
          <div class="mlabel">REKENING BANK AKTIF</div>
          <div class="mval up">${accounts.length} Akun</div>
          <div class="msub neu">Total Saldo: Rp ${fmt(wData.bankTotal)}</div>
        </div>
        <div class="metric">
          <div class="mlabel">SEKURITAS UTAMA</div>
          <div class="mval" style="color:#f59e0b">${state.tax.activeSekuritas || 'Stockbit'}</div>
          <div class="msub neu">Komisi Beli: ${(state.tax.buyFee*100).toFixed(2)}%</div>
        </div>
      </div>

      <!-- CATEGORY TABS NAVIGATION -->
      <div class="sm-suite-tabs" style="background:var(--bg3);border:1px solid var(--border);border-radius:12px;padding:6px;display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-bottom:20px">
        ${SETTINGS_TABS.map(function(t) {
          var isAct = (currentTab === t.id);
          return `
            <button type="button" class="btn btn-sm ${isAct ? 'btn-primary' : 'btn-ghost'}" style="font-size:12px;font-weight:${isAct ? '700' : '600'};gap:6px;display:inline-flex;align-items:center;border-radius:8px;padding:7px 14px;${isAct ? 'box-shadow:0 2px 8px rgba(0,0,0,0.15);' : ''}" onclick="MW_SETTINGS.setTab('${t.id}')">
              <i class="${t.icon}" style="${isAct ? 'color:#fff' : 'color:var(--accent)'}"></i>
              <span>${t.label}</span>
            </button>
          `;
        }).join('')}
      </div>

      <!-- ACTIVE CATEGORY CONTENT AREA -->
      <div id="settings-tab-content-area" style="margin-bottom:24px">
        ${categoryContent}
      </div>
    `;

    c.innerHTML = html;
    if (currentTab === 'integrations' || currentTab === 'all') {
      loadApiQuotaWidgets();
    }
  }

  // API QUOTA MONITOR — Invezgo (GET /api/idx/invezgo-status). The Gemini
  // quota widget that used to sit alongside this (GET /api/ai/gemini-status)
  // was removed in the 2026-09-12 Claude migration — Anthropic has no
  // equivalent lightweight self-reported per-model quota endpoint, and
  // Gemini itself is no longer called anywhere in this app.
  function quotaBar(pct, alert90, alert80) {
    var safePct = (typeof pct === 'number' && isFinite(pct)) ? Math.max(0, Math.min(100, pct)) : 0;
    var color = alert90 ? 'var(--red)' : (alert80 ? '#f59e0b' : 'var(--accent)');
    return '<div style="height:6px;border-radius:3px;background:var(--bg3);overflow:hidden;margin:4px 0 8px">' +
      '<div style="height:100%;width:' + safePct + '%;background:' + color + ';transition:width .3s"></div></div>';
  }

  async function loadApiQuotaWidgets() {
    var invezgoBox = document.getElementById('quota-invezgo-box');

    if (invezgoBox) {
      try {
        var invRes = await fetch('/api/idx/invezgo-status');
        var inv = await invRes.json();
        if (inv && inv.success) {
          var q = inv.quota;
          var live = inv.live || {};
          var statusHtml = '';

          if (!inv.configured) {
            statusHtml =
              '<div style="padding:10px 12px;border-radius:6px;background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.25);margin-bottom:10px">' +
              '<div style="font-weight:700;color:var(--red);margin-bottom:4px">API Key Belum Dikonfigurasi</div>' +
              '<div style="font-size:11px;color:var(--text2);line-height:1.4">' +
              'Anda sudah berlangganan? Dapatkan API Key di <a href="https://invezgo.com/id/setting/api" target="_blank" rel="noopener" style="color:var(--accent);text-decoration:underline">invezgo.com/id/setting/api</a>, lalu tambahkan ke file <code style="color:var(--accent)">.env</code> atau Vercel Environment Variables: ' +
              '<div style="font-family:monospace;background:var(--bg3);padding:4px 6px;border-radius:4px;margin-top:4px;word-break:break-all">INVEZGO_API_KEY=token_invezgo_anda</div>' +
              '</div>' +
              '</div>';
          } else if (live.status === 'ACTIVE') {
            var expireStr = live.quota && live.quota.expire ? ' &middot; Exp: ' + new Date(live.quota.expire).toLocaleDateString('id-ID') : '';
            statusHtml =
              '<div style="display:flex;align-items:center;gap:6px;margin-bottom:8px">' +
              '<span class="badge b-up" style="font-size:11px">Terhubung (Invezgo API Aktif)</span>' +
              '<span style="font-size:11px;color:var(--text3)">' + expireStr + '</span>' +
              '</div>';
          } else if (live.status === 'UNAUTHORIZED' || live.status === 'FORBIDDEN') {
            statusHtml =
              '<div style="padding:10px 12px;border-radius:6px;background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.25);margin-bottom:10px;font-size:11px;color:var(--red)">' +
              '<div style="font-weight:700;margin-bottom:2px">Akses API Ditolak (' + escHtml(live.status) + ')</div>' +
              '<div>' + escHtml(live.message || 'Token tidak valid atau belum memiliki hak akses API (Advance).') + '</div>' +
              '</div>';
          }

          var badgeCls = q.alert90 ? 'b-dn' : (q.alert80 ? 'b-amb' : 'b-up');
          invezgoBox.innerHTML =
            statusHtml +
            '<div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:2px">' +
            '<span style="font-size:20px;font-weight:700;color:var(--text)">' + q.usagePct + '%</span>' +
            '<span class="badge ' + badgeCls + '">' + fmt(q.used) + ' / ' + fmt(q.monthlyBudget) + ' req/bulan</span>' +
            '</div>' +
            quotaBar(q.usagePct, q.alert90, q.alert80) +
            '<div style="color:var(--text3)">Sisa: ' + fmt(q.remaining) + ' req &middot; Cache hit hari ini: ' + (inv.today.cacheHitRatioPct !== null ? inv.today.cacheHitRatioPct + '%' : '-') + '</div>' +
            (q.alert90 ? '<div style="color:var(--red);font-weight:600;margin-top:6px">Sudah &gt;90% kuota bulanan. Risiko rate-limit Invezgo sebelum bulan berganti.</div>' :
              q.alert80 ? '<div style="color:#f59e0b;font-weight:600;margin-top:6px">Sudah &gt;80% kuota bulanan.</div>' : '');
        } else {
          invezgoBox.innerHTML = '<span style="color:var(--text3)">Data kuota tidak tersedia.</span>';
        }
      } catch (err) {
        invezgoBox.innerHTML = '<span style="color:var(--text3)">Gagal memuat kuota Invezgo (' + escHtml(String(err && err.message || err)) + ').</span>';
      }
    }

    var dqBox = document.getElementById('quota-dq-box');
    if (dqBox) {
      try {
        var dqRes = await fetch('/api/idx/data-quality-status');
        var dq = await dqRes.json();
        if (dq && dq.success) {
          var pct = dq.realPct;
          var badgeCls = pct === null ? 'b-gray' : (pct >= 90 ? 'b-up' : (pct >= 50 ? 'b-amb' : 'b-dn'));
          dqBox.innerHTML =
            '<div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:2px">' +
            '<span style="font-size:20px;font-weight:700;color:var(--text)">' + (pct === null ? '—' : pct + '%') + '</span>' +
            '<span class="badge ' + badgeCls + '">REAL &middot; ' + dq.total + ' cek hari ini</span>' +
            '</div>' +
            quotaBar(pct || 0, false, false) +
            '<div style="color:var(--text3)">Simulasi: ' + (dq.counts.SIMULATION||0) + ' &middot; Basi: ' + (dq.counts.STALE||0) + ' &middot; Tidak tersedia: ' + (dq.counts.UNAVAILABLE||0) + ' &middot; Invalid: ' + (dq.counts.INVALID||0) + '</div>' +
            '<div style="margin-top:8px;padding-top:8px;border-top:1px solid var(--border2)">' + escHtml(dq.recommendation) + '</div>' +
            '<div style="color:var(--text3);margin-top:6px;font-size:10.5px">Kill-switch <code>DATA_QUALITY_ENFORCE_STAGE2</code>: <b style="color:' + (dq.enforceStage2Active ? 'var(--green)' : 'var(--text3)') + '">' + (dq.enforceStage2Active ? 'AKTIF' : 'nonaktif') + '</b>' + (dq.persistedInRedis ? '' : ' &middot; ⚠ tanpa Redis (Upstash), angka reset tiap cold-start — tidak akurat untuk keputusan production') + '</div>';
        } else {
          dqBox.innerHTML = '<span style="color:var(--text3)">Data telemetri tidak tersedia.</span>';
        }
      } catch (err) {
        dqBox.innerHTML = '<span style="color:var(--text3)">Gagal memuat telemetri Data Quality Gate (' + escHtml(String(err && err.message || err)) + ').</span>';
      }
    }
  }

  // EVENT HANDLERS
  function handleSaveTaxSettings(e) {
    if (e && e.preventDefault) e.preventDefault();
    var buyFee = Number(document.getElementById('cfg-buyfee').value) / 100;
    var sellFee = Number(document.getElementById('cfg-sellfee').value) / 100;
    var pphFinal = Number(document.getElementById('cfg-pph').value) / 100;
    var divExemptEl = document.getElementById('cfg-div-exempt');
    var isDivExempt = divExemptEl ? divExemptEl.checked : true;
    var divTaxInput = document.getElementById('cfg-divtax');
    var dividendTax = isDivExempt ? 0 : (divTaxInput ? Number(divTaxInput.value) / 100 : 0.10);
    var ppnFee = Number(document.getElementById('cfg-ppn').value) / 100;
    var serviceFee = (document.getElementById('cfg-servicefee') ? Number(document.getElementById('cfg-servicefee').value) / 100 : 0) || 0;
    var activeSekuritasVal = document.getElementById('cfg-default-sekuritas').value;

    state.tax = {
      buyFee: buyFee,
      sellFee: sellFee,
      pphFinal: pphFinal,
      dividendTax: dividendTax,
      dividenExempt: isDivExempt,
      ppnFee: ppnFee,
      serviceFee: serviceFee,
      activeSekuritas: activeSekuritasVal
    };

    saveSettings();
    if (typeof recalculateAllStoredData === 'function') {
      recalculateAllStoredData(true);
    }
    if (typeof showSaveStatus === 'function') {
      showSaveStatus('Tarif Pajak & Komisi Broker berhasil disimpan & data direkalkulasi');
    }
    renderSettingsPage(state.activeTab || 'tax');
  }

  function triggerRecalculate() {
    if (typeof recalculateAllStoredData === 'function') {
      recalculateAllStoredData(false);
    }
    renderSettingsPage(state.activeTab || 'tax');
  }

  function handleSaveFireSettings(e) {
    if (e && e.preventDefault) e.preventDefault();
    var fireTarget = Number(document.getElementById('cfg-fire-target').value);
    var monthlyExpense = Number(document.getElementById('cfg-monthly-exp').value);
    var emergencyFundTarget = Number(document.getElementById('cfg-emergency-target').value);
    var expectedReturn = Number(document.getElementById('cfg-expected-return').value);

    state.fire = {
      fireTarget: fireTarget,
      monthlyExpense: monthlyExpense,
      emergencyFundTarget: emergencyFundTarget,
      expectedReturn: expectedReturn
    };

    saveSettings();
    if (typeof showSaveStatus === 'function') {
      showSaveStatus('Sasaran Keuangan & Parameter FIRE berhasil disimpan');
    }
    renderSettingsPage(state.activeTab || 'fire');
  }

  function handleAddBankAccount(e) {
    if (e && e.preventDefault) e.preventDefault();
    var name = document.getElementById('new-v6-bank-name').value.trim();
    var cat = document.getElementById('new-v6-bank-cat').value;
    var saldo = Number(document.getElementById('new-v6-bank-saldo').value);

    if (!name) return;

    if (typeof WEALTH !== 'undefined' && Array.isArray(WEALTH.bank)) {
      WEALTH.bank.push({
        id: (typeof wUid === 'function') ? wUid() : Date.now(),
        bank: name,
        type: cat,
        saldo: saldo,
        no: ''
      });
      if (typeof wSave === 'function') wSave();
    }

    if (typeof showSaveStatus === 'function') {
      showSaveStatus('Rekening ' + name + ' berhasil ditambahkan');
    }
    renderSettingsPage(state.activeTab || 'bank');
  }

  function deleteBankAccount(idx) {
    if (confirm('Hapus rekening bank ini?')) {
      if (typeof WEALTH !== 'undefined' && Array.isArray(WEALTH.bank)) {
        var removed = WEALTH.bank[idx];
        if (removed && removed.id != null && typeof wRecordTombstone === 'function') wRecordTombstone('bank', removed.id);
        WEALTH.bank.splice(idx, 1);
        if (typeof wSave === 'function') wSave();
      }
      if (typeof showSaveStatus === 'function') {
        showSaveStatus('Rekening bank dihapus');
      }
      renderSettingsPage(state.activeTab || 'bank');
    }
  }

  function handleAddDebt(e) {
    if (e && e.preventDefault) e.preventDefault();
    var name = document.getElementById('new-v6-debt-name').value.trim();
    var cat = document.getElementById('new-v6-debt-cat').value;
    var amount = Number(document.getElementById('new-v6-debt-amount').value);

    if (!name) return;

    if (typeof WEALTH !== 'undefined' && Array.isArray(WEALTH.debt)) {
      WEALTH.debt.push({
        id: (typeof wUid === 'function') ? wUid() : Date.now(),
        nama: name,
        tipe: cat,
        outstanding: amount,
        bunga: 0,
        cicilan: 0
      });
      if (typeof wSave === 'function') wSave();
    }

    if (typeof showSaveStatus === 'function') {
      showSaveStatus('Pos liabilitas ' + name + ' ditambahkan');
    }
    renderSettingsPage(state.activeTab || 'debt');
  }

  function deleteDebt(idx) {
    if (confirm('Hapus pos liabilitas ini?')) {
      if (typeof WEALTH !== 'undefined' && Array.isArray(WEALTH.debt)) {
        var removed = WEALTH.debt[idx];
        if (removed && removed.id != null && typeof wRecordTombstone === 'function') wRecordTombstone('debt', removed.id);
        WEALTH.debt.splice(idx, 1);
        if (typeof wSave === 'function') wSave();
      }
      if (typeof showSaveStatus === 'function') {
        showSaveStatus('Pos liabilitas dihapus');
      }
      renderSettingsPage(state.activeTab || 'debt');
    }
  }

  function exportJsonBackup() {
    if (typeof downloadBackup === 'function') {
      downloadBackup();
      return;
    }
    var backupData = {
      transactions: typeof transactions !== 'undefined' ? transactions : [],
      dividends: typeof dividends !== 'undefined' ? dividends : [],
      rdnMutations: typeof rdnMutations !== 'undefined' ? rdnMutations : [],
      wealth: typeof WEALTH !== 'undefined' ? WEALTH : {},
      settings: state,
      exportDate: new Date().toISOString()
    };
    var str = JSON.stringify(backupData, null, 2);
    var blob = new Blob([str], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'moneywatch_v6_backup_' + (new Date().toISOString().slice(0, 10)) + '.json';
    a.click();
    if (typeof showSaveStatus === 'function') {
      showSaveStatus('Cadangan JSON berhasil diunduh');
    }
  }

  function handleFileImport(event) {
    var file = event.target.files && event.target.files[0];
    if (!file) return;
    if (typeof restoreFromBackup === 'function') {
      restoreFromBackup(file);
      return;
    }
    var reader = new FileReader();
    reader.onload = function(e) {
      try {
        var content = e.target.result;
        var data = JSON.parse(content);
        if (data.settings) {
          Object.assign(state, data.settings);
          saveSettings();
        }
        alert('Data berhasil dipulihkan!');
        renderSettingsPage(state.activeTab || 'vault');
      } catch(err) {
        alert('Gagal memulihkan file: ' + err.message);
      }
    };
    reader.readAsText(file);
  }

  async function confirmDataReset() {
    if (!confirm('PERINGATAN: Apakah Anda yakin ingin mengosongkan SELURUH data transaksi dan portofolio menjadi 0?\n\nTindakan ini akan menghapus permanen seluruh riwayat transaksi di Supabase Cloud, server mirror, dan browser lokal.')) {
      return;
    }
    try {
      if (typeof showSaveStatus === 'function') {
        showSaveStatus('⏳ Menghapus transaksi di Supabase Cloud & Server...', 'var(--amber)', true);
      }
      if (typeof clearData === 'function') {
        await clearData(true);
      } else if (typeof resetAllDatabaseAndTransactions === 'function') {
        await resetAllDatabaseAndTransactions();
      }
      alert('Berhasil! Seluruh transaksi dan saldo telah di-reset menjadi 0 di Supabase Cloud dan lokal.');
      renderSettingsPage(state.activeTab || 'vault');
    } catch(err) {
      console.error('Reset error:', err);
      alert('Reset selesai: ' + (err.message || err));
      renderSettingsPage(state.activeTab || 'vault');
    }
  }

  // Initialize
  loadSettings();

  window.MW_SETTINGS = {
    getState: function() { return state; },
    loadSettings: loadSettings,
    saveSettings: saveSettings,
    setTab: setTab,
    switchTab: setTab,
    renderSettingsPage: renderSettingsPage,
    applyBrokerPreset: applyBrokerPreset,
    handleSaveTaxSettings: handleSaveTaxSettings,
    handleSaveFireSettings: handleSaveFireSettings,
    handleAddBankAccount: handleAddBankAccount,
    deleteBankAccount: deleteBankAccount,
    handleAddDebt: handleAddDebt,
    deleteDebt: deleteDebt,
    exportJsonBackup: exportJsonBackup,
    handleFileImport: handleFileImport,
    confirmDataReset: confirmDataReset,
    triggerRecalculate: triggerRecalculate
  };

  // Aliases for Router Compatibility
  window.renderSettingsPage = renderSettingsPage;

})();
