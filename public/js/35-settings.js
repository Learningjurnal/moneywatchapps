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
    }
  };

  var state = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));

  function loadSettings() {
    try {
      var raw = localStorage.getItem(SETTINGS_KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        if (parsed.tax) Object.assign(state.tax, parsed.tax);
        if (parsed.fire) Object.assign(state.fire, parsed.fire);
      }
    } catch(e) {
      console.warn('MW_SETTINGS load error:', e);
    }
    syncWithGlobalEngines();
  }

  function saveSettings() {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(state));
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
      showSaveStatus('✓ Preset broker diatur ke ' + preset.name);
    }
  }

  // ══════════════════════════════════════════════════════════════════
  // RENDER FULL SETTINGS PAGE / PILLAR
  // ══════════════════════════════════════════════════════════════════
  function renderSettingsPage() {
    var c = document.getElementById('page-settings');
    if (!c) return;

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

    var html = `
      <div style="margin-bottom:20px;display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:12px">
        <div>
          <div class="ptitle" style="display:flex;align-items:center;gap:8px">Pusat Pengaturan &amp; Konfigurasi Sistem
          </div>
          <div class="psub">
            Kelola parameter pajak, komisi broker sekuritas, sasaran keuangan FIRE, rekening multi-bank, liabilitas, preferensi tampilan, dan cadangan data di satu tempat.
          </div>
        </div>
        <div style="display:flex;gap:8px">
          <button class="btn btn-primary btn-sm" onclick="MW_SETTINGS.exportJsonBackup()">
            <i class="ti ti-download"></i> Ekspor Cadangan JSON
          </button>
          <label class="btn btn-ghost btn-sm" style="cursor:pointer">
            <i class="ti ti-upload"></i> Impor JSON
            <input type="file" accept=".json" onchange="MW_SETTINGS.handleFileImport(event)" style="display:none">
          </label>
        </div>
      </div>

      <!-- Overview KPI Cards -->
      <div class="row4" style="margin-bottom:20px">
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

      <!-- GRID 1: Tax & Broker Fees + Financial Goals & FIRE -->
      <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(340px, 1fr));gap:16px;margin-bottom:20px">
        
        <!-- 1. Dynamic Tax & Broker Fee Engine -->
        <div class="card" style="padding:18px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;border-bottom:1px solid var(--border2);padding-bottom:10px">
            <div style="font-weight:700;font-size:14px;color:var(--text);display:flex;align-items:center;gap:8px">
              <i class="ti ti-scale" style="color:var(--amber)"></i>
              Tarif Pajak &amp; Komisi Broker Sekuritas
            </div>
            <span class="badge b-up">Configurable</span>
          </div>

          <!-- Broker Quick Presets -->
          <div style="margin-bottom:14px">
            <div style="font-size:11px;font-weight:700;color:var(--text3);margin-bottom:6px">PRESET SEKURITAS POPULER:</div>
            <div style="display:flex;flex-wrap:wrap;gap:6px">
              ${Object.keys(BROKER_PRESETS).map(function(k) {
                var isAct = (state.tax.activeSekuritas === k);
                return `<button type="button" class="btn ${isAct ? 'btn-primary' : 'btn-ghost'} btn-xs" onclick="MW_SETTINGS.applyBrokerPreset('${k}')">${k}</button>`;
              }).join('')}
            </div>
          </div>

          <form id="v6-form-tax-settings" onsubmit="MW_SETTINGS.handleSaveTaxSettings(event)">
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">
              <div>
                <label style="font-size:11px;color:var(--text2);display:block;margin-bottom:4px;font-weight:600">Komisi Beli (%)</label>
                <input type="number" id="cfg-buyfee" class="form-input mono" step="0.0001" value="${(state.tax.buyFee * 100).toFixed(4)}" required style="width:100%">
              </div>
              <div>
                <label style="font-size:11px;color:var(--text2);display:block;margin-bottom:4px;font-weight:600">Komisi Jual (%)</label>
                <input type="number" id="cfg-sellfee" class="form-input mono" step="0.0001" value="${(state.tax.sellFee * 100).toFixed(4)}" required style="width:100%">
              </div>
            </div>

            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">
              <div>
                <label style="font-size:11px;color:var(--text2);display:block;margin-bottom:4px;font-weight:600">PPh Final Jual (%)</label>
                <input type="number" id="cfg-pph" class="form-input mono" step="0.0001" value="${(state.tax.pphFinal * 100).toFixed(2)}" required style="width:100%">
              </div>
              <div>
                <label style="font-size:11px;color:var(--text2);display:block;margin-bottom:4px;font-weight:600">Tarif PPN Komisi (%)</label>
                <input type="number" id="cfg-ppn" class="form-input mono" step="0.1" value="${(state.tax.ppnFee * 100).toFixed(0)}" style="width:100%">
              </div>
            </div>

            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">
              <div>
                <label style="font-size:11px;color:var(--text2);display:block;margin-bottom:4px;font-weight:600">Nama Sekuritas Aktif</label>
                <select id="cfg-default-sekuritas" class="form-input" style="width:100%">
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
                <label style="font-size:11px;color:var(--text2);display:block;margin-bottom:4px;font-weight:600">Service Fee Tambahan (%)</label>
                <input type="number" id="cfg-servicefee" class="form-input mono" step="0.001" value="${((state.tax.serviceFee || 0) * 100).toFixed(3)}" style="width:100%">
              </div>
            </div>

            <!-- PMK 18/2021 Dividend Exemption Toggle -->
            <div style="background:var(--bg3);border:1px solid var(--border2);border-radius:6px;padding:10px 12px;margin-bottom:14px">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
                <div style="font-size:12px;font-weight:700;color:var(--text)">Bebas PPh Dividen (PMK 18/2021)</div>
                <label style="display:flex;align-items:center;gap:6px;cursor:pointer">
                  <input type="checkbox" id="cfg-div-exempt" ${state.tax.dividenExempt !== false ? 'checked' : ''} onchange="var dt=document.getElementById('cfg-divtax-box'); if(dt) dt.style.display=this.checked?'none':'block';">
                  <span style="font-size:11.5px;font-weight:600;color:var(--green)">0% (Bebas Pajak)</span>
                </label>
              </div>
              <div style="font-size:10.5px;color:var(--text3);line-height:1.4">Dividen Wajib Pajak OP Dalam Negeri bebas PPh jika direinvestasikan di wilayah NKRI.</div>
              <div id="cfg-divtax-box" style="display:${state.tax.dividenExempt !== false ? 'none' : 'block'};margin-top:8px;padding-top:8px;border-top:1px solid var(--border2)">
                <label style="font-size:11px;color:var(--text2);display:block;margin-bottom:4px;font-weight:600">Tarif PPh Dividen Normal Non-Reinvestasi (%)</label>
                <input type="number" id="cfg-divtax" class="form-input mono" step="0.01" value="${((state.tax.dividendTax || 0.10) * 100).toFixed(1)}" style="width:100%">
              </div>
            </div>

            <div style="display:flex;gap:8px">
              <button type="submit" class="btn btn-primary" style="flex:1;justify-content:center">
                <i class="ti ti-device-floppy"></i> Simpan Tarif Pajak
              </button>
              <button type="button" class="btn btn-ghost" onclick="MW_SETTINGS.triggerRecalculate()" title="Koreksi ulang seluruh angka transaksi &amp; pajak yang tersimpan tanpa menghapus riwayat transaksi">
                <i class="ti ti-refresh"></i> Rekalkulasi Data
              </button>
            </div>
          </form>
        </div>

        <!-- 2. Financial Goals & FIRE Settings -->
        <div class="card" style="padding:18px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;border-bottom:1px solid var(--border2);padding-bottom:10px">
            <div style="font-weight:700;font-size:14px;color:var(--text);display:flex;align-items:center;gap:8px">
              <i class="ti ti-flame" style="color:var(--red)"></i>
              Sasaran Keuangan &amp; Parameter FIRE
            </div>
            <span class="badge b-up">FIRE Engine</span>
          </div>

          <!-- FIRE Progress Meter -->
          <div style="background:var(--bg3);border:1px solid var(--border2);border-radius:8px;padding:12px;margin-bottom:14px">
            <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:6px">
              <span>Kesiapan Dana FIRE</span>
              <strong style="color:var(--accent)">${fireProgressPct}% (Rp ${fmt(currentNet)} / Rp ${fmt(fireTarget)})</strong>
            </div>
            <div style="background:var(--bg3);height:8px;border-radius:4px;overflow:hidden">
              <div style="background:linear-gradient(90deg, #3B82F6, #10B981);height:100%;width:${fireProgressPct}%;transition:width 0.3s"></div>
            </div>
            <div style="font-size:10.5px;color:var(--text3);margin-top:6px;display:flex;justify-content:space-between">
              <span>Pengeluaran Tahunan: Rp ${fmt(annualExp)}</span>
              <span>Dana Darurat: ${emergencyProgressPct}% (${(wData.bankTotal / Math.max(1, monthlyExp)).toFixed(1)} bln)</span>
            </div>
          </div>

          <form id="v6-form-fire-settings" onsubmit="MW_SETTINGS.handleSaveFireSettings(event)">
            <div style="margin-bottom:12px">
              <label style="font-size:11px;color:var(--text2);display:block;margin-bottom:4px;font-weight:600">Target Dana FIRE (Financial Independence) (Rp)</label>
              <input type="number" id="cfg-fire-target" class="form-input mono" value="${fireTarget}" step="10000000" required style="width:100%">
            </div>

            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">
              <div>
                <label style="font-size:11px;color:var(--text2);display:block;margin-bottom:4px;font-weight:600">Pengeluaran Bulanan (Rp)</label>
                <input type="number" id="cfg-monthly-exp" class="form-input mono" value="${monthlyExp}" step="500000" style="width:100%">
              </div>
              <div>
                <label style="font-size:11px;color:var(--text2);display:block;margin-bottom:4px;font-weight:600">Target Dana Darurat (Rp)</label>
                <input type="number" id="cfg-emergency-target" class="form-input mono" value="${emergencyTarget}" step="1000000" style="width:100%">
              </div>
            </div>

            <div style="margin-bottom:16px">
              <label style="font-size:11px;color:var(--text2);display:block;margin-bottom:4px;font-weight:600">Asumsi Imbal Hasil Portofolio Tahunan (%)</label>
              <input type="number" id="cfg-expected-return" class="form-input mono" value="${expReturn}" step="0.1" style="width:100%">
            </div>

            <button type="submit" class="btn btn-secondary" style="width:100%;justify-content:center">
              <i class="ti ti-target"></i> Simpan Parameter Sasaran Keuangan &amp; FIRE
            </button>
          </form>
        </div>
      </div>

      <!-- GRID 2: Multi-Bank Accounts + Liabilities -->
      <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(340px, 1fr));gap:16px;margin-bottom:20px">
        
        <!-- 3. Multi-Bank Accounts Management -->
        <div class="card" style="padding:18px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;border-bottom:1px solid var(--border2);padding-bottom:10px">
            <div style="font-weight:700;font-size:14px;color:var(--text);display:flex;align-items:center;gap:8px">
              <i class="ti ti-building-bank" style="color:#38bdf8"></i>
              Manajemen Rekening Bank &amp; Kas Likuid
            </div>
            <span class="badge b-up">${accounts.length} Rekening</span>
          </div>

          <!-- Existing Bank Accounts List -->
          <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:16px;max-height:190px;overflow-y:auto">
            ${accounts.length === 0 ? '<div style="font-size:12px;color:var(--text3);padding:8px 0">Belum ada rekening bank yang dikonfigurasi.</div>' : ''}
            ${accounts.map(function(acc, idx) {
              return `
                <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;background:var(--bg3);border-radius:6px;border:1px solid var(--border2)">
                  <div>
                    <div style="font-weight:600;font-size:13px;color:var(--text)">${escHtml(acc.bank || acc.name || 'Bank')}</div>
                    <div style="font-size:11px;color:var(--text3)">${escHtml(acc.type || acc.category || 'Tabungan')} ${acc.no ? '· ' + escHtml(acc.no) : ''}</div>
                  </div>
                  <div style="display:flex;align-items:center;gap:10px">
                    <span class="mono" style="font-weight:700;color:#38bdf8">Rp ${fmt(acc.saldo || acc.balance || 0)}</span>
                    <button type="button" class="btn btn-ghost btn-xs" style="color:var(--red);padding:2px 6px" onclick="MW_SETTINGS.deleteBankAccount(${idx})">
                      <i class="ti ti-trash"></i>
                    </button>
                  </div>
                </div>
              `;
            }).join('')}
          </div>

          <!-- Add New Bank Account Form -->
          <form onsubmit="MW_SETTINGS.handleAddBankAccount(event)" style="border-top:1px solid var(--border2);padding-top:12px">
            <div style="font-size:11.5px;font-weight:700;color:var(--text2);margin-bottom:8px">Tambah Rekening Baru:</div>
            <div style="display:grid;grid-template-columns:1.2fr 1fr 1.2fr;gap:8px;margin-bottom:10px">
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
            <button type="submit" class="btn btn-secondary btn-sm" style="width:100%;justify-content:center">
              <i class="ti ti-plus"></i> Tambahkan Rekening Bank
            </button>
          </form>
        </div>

        <!-- 4. Liabilities & Debts Management -->
        <div class="card" style="padding:18px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;border-bottom:1px solid var(--border2);padding-bottom:10px">
            <div style="font-weight:700;font-size:14px;color:var(--text);display:flex;align-items:center;gap:8px">
              <i class="ti ti-credit-card-off" style="color:var(--red)"></i>
              Manajemen Liabilitas &amp; Kewajiban
            </div>
            <span class="badge b-dn">${debts.length} Pos Hutang</span>
          </div>

          <!-- Existing Debts List -->
          <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:16px;max-height:190px;overflow-y:auto">
            ${debts.length === 0 ? '<div style="font-size:12px;color:var(--text3);padding:8px 0">Tidak ada kewajiban atau hutang aktif.</div>' : ''}
            ${debts.map(function(d, idx) {
              return `
                <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;background:var(--bg3);border-radius:6px;border:1px solid var(--border2)">
                  <div>
                    <div style="font-weight:600;font-size:13px;color:var(--text)">${escHtml(d.nama || d.name || 'Kewajiban')}</div>
                    <div style="font-size:11px;color:var(--text3)">${escHtml(d.tipe || d.category || 'Cicilan')} ${d.cicilan ? '· Cicilan Rp ' + fmt(d.cicilan) + '/bln' : ''}</div>
                  </div>
                  <div style="display:flex;align-items:center;gap:10px">
                    <span class="mono dn" style="font-weight:700">-Rp ${fmt(d.outstanding || d.amount || 0)}</span>
                    <button type="button" class="btn btn-ghost btn-xs" style="color:var(--red);padding:2px 6px" onclick="MW_SETTINGS.deleteDebt(${idx})">
                      <i class="ti ti-trash"></i>
                    </button>
                  </div>
                </div>
              `;
            }).join('')}
          </div>

          <!-- Add New Debt Form -->
          <form onsubmit="MW_SETTINGS.handleAddDebt(event)" style="border-top:1px solid var(--border2);padding-top:12px">
            <div style="font-size:11.5px;font-weight:700;color:var(--text2);margin-bottom:8px">Tambah Pos Liabilitas:</div>
            <div style="display:grid;grid-template-columns:1.2fr 1fr 1.2fr;gap:8px;margin-bottom:10px">
              <input type="text" id="new-v6-debt-name" class="form-input" placeholder="Nama Pos (e.g. KPR)" required>
              <select id="new-v6-debt-cat" class="form-input">
                <option value="KPR">KPR Rumah</option>
                <option value="Kendaraan">Cicilan Kendaraan</option>
                <option value="Kartu Kredit">Kartu Kredit</option>
                <option value="Personal">Pinjaman Personal</option>
              </select>
              <input type="number" id="new-v6-debt-amount" class="form-input mono" placeholder="Sisa Pokok (Rp)" required>
            </div>
            <button type="submit" class="btn btn-ghost btn-sm" style="width:100%;justify-content:center;color:var(--red);border-color:rgba(239,68,68,0.3)">
              <i class="ti ti-plus"></i> Tambahkan Pos Liabilitas
            </button>
          </form>
        </div>
      </div>

      <!-- GRID 3: Data Management & Display / UI Customization -->
      <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(340px, 1fr));gap:16px">
        
        <!-- 5. Data Vault & Backup / Restore -->
        <div class="card" style="padding:18px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;border-bottom:1px solid var(--border2);padding-bottom:10px">
            <div style="font-weight:700;font-size:14px;color:var(--text);display:flex;align-items:center;gap:8px">
              <i class="ti ti-database" style="color:#38bdf8"></i>
              Cadangan Data, Pemulihan &amp; Database Cloud
            </div>
            <span class="badge b-up">Data Vault</span>
          </div>

          <div style="display:flex;flex-direction:column;gap:12px">
            <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 12px;background:rgba(5,150,105,0.1);border:1px solid rgba(5,150,105,0.3);border-radius:6px">
              <div>
                <div style="font-weight:700;font-size:12.5px;color:#10b981">Ekspor Terkonsolidasi (Excel / CSV)</div>
                <div style="font-size:11px;color:var(--text3)">Gabungkan seluruh hasil, saham, crypto, ETF, RD, kas, hutang, dan proyeksi FIRE.</div>
              </div>
              <button type="button" class="btn btn-green btn-sm" style="background:#059669;color:#fff;border-color:#047857;font-weight:700" onclick="if(typeof exportConsolidatedPortfolioCsv==='function')exportConsolidatedPortfolioCsv();">
                <i class="ti ti-file-spreadsheet"></i> Ekspor CSV
              </button>
            </div>

            <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 12px;background:rgba(59,130,246,0.1);border:1px solid rgba(59,130,246,0.3);border-radius:6px">
              <div>
                <div style="font-weight:700;font-size:12.5px;color:#38bdf8">Pusat Laporan &amp; Dokumen PDF</div>
                <div style="font-size:11px;color:var(--text3)">Pratinjau dan cetak dokumen resmi Family Office A4.</div>
              </div>
              <button type="button" class="btn btn-blue btn-sm" style="font-weight:700" onclick="if(typeof mwOpenPdfReportModal==='function')mwOpenPdfReportModal('consolidated');">
                <i class="ti ti-file-text"></i> Buka Pusat Laporan
              </button>
            </div>

            <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 12px;background:var(--bg3);border:1px solid var(--border2);border-radius:6px">
              <div>
                <div style="font-weight:700;font-size:12.5px;color:var(--text)">Ekspor Cadangan Master JSON</div>
                <div style="font-size:11px;color:var(--text3)">Unduh berkas portofolio, mutasi kas RDN, dividen, dan rekening.</div>
              </div>
              <button type="button" class="btn btn-ghost btn-sm" onclick="MW_SETTINGS.exportJsonBackup()">
                <i class="ti ti-download"></i> Ekspor JSON
              </button>
            </div>

            <div style="padding:10px 12px;background:var(--bg3);border:1px solid var(--border2);border-radius:6px">
              <div style="font-weight:700;font-size:12.5px;color:var(--text);margin-bottom:2px">Pulihkan Data dari JSON</div>
              <div style="font-size:11px;color:var(--text3);margin-bottom:8px">Unggah berkas cadangan MoneyWatch Pro.</div>
              <label class="btn btn-ghost btn-sm" style="width:100%;justify-content:center;cursor:pointer">
                <i class="ti ti-upload"></i> Pilih Berkas JSON untuk Dipulihkan...
                <input type="file" accept=".json" onchange="MW_SETTINGS.handleFileImport(event)" style="display:none">
              </label>
            </div>

            <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 12px;background:rgba(239,68,68,0.06);border:1px solid rgba(239,68,68,0.2);border-radius:6px">
              <div>
                <div style="font-weight:700;font-size:12.5px;color:var(--red)">Reset Data Transaksi (0 Transaksi)</div>
                <div style="font-size:11px;color:var(--text3)">Kosongkan seluruh riwayat portofolio &amp; transaksi di Cloud Firestore dan perangkat lokal.</div>
              </div>
              <button type="button" class="btn btn-ghost btn-sm" style="color:var(--red);border-color:rgba(239,68,68,0.3)" onclick="MW_SETTINGS.confirmDataReset()">
                <i class="ti ti-refresh"></i> Reset Data
              </button>
            </div>
          </div>
        </div>

        <!-- 6. Display, Font Scaling & Terminal Density -->
        <div class="card" style="padding:18px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;border-bottom:1px solid var(--border2);padding-bottom:10px">
            <div style="font-weight:700;font-size:14px;color:var(--text);display:flex;align-items:center;gap:8px">
              <i class="ti ti-palette" style="color:#38bdf8"></i>
              Tampilan, Kerapatan &amp; Skala Antarmuka
            </div>
            <span class="badge b-up">UI Control</span>
          </div>

          <div style="display:flex;flex-direction:column;gap:12px">
            <div>
              <div style="font-weight:600;font-size:12px;color:var(--text);margin-bottom:6px">Kerapatan Tabel Data (Density):</div>
              <div style="display:flex;gap:6px">
                <button type="button" class="btn btn-ghost btn-xs" onclick="if(typeof setViewDensity==='function')setViewDensity('compact');">Compact (Rapat)</button>
                <button type="button" class="btn btn-primary btn-xs" onclick="if(typeof setViewDensity==='function')setViewDensity('comfortable');">Comfortable (Nyaman)</button>
                <button type="button" class="btn btn-ghost btn-xs" onclick="if(typeof setViewDensity==='function')setViewDensity('executive');">Executive (Luas)</button>
              </div>
            </div>

            <div>
              <div style="font-weight:600;font-size:12px;color:var(--text);margin-bottom:6px">Skala Ukuran Tampilan (Zoom):</div>
              <div style="display:flex;gap:6px">
                <button type="button" class="btn btn-ghost btn-xs" onclick="if(typeof mwZoom==='function')mwZoom(-0.05)">A−</button>
                <button type="button" class="btn btn-ghost btn-xs" onclick="if(typeof mwZoom==='function')mwZoom(0)">100%</button>
                <button type="button" class="btn btn-ghost btn-xs" onclick="if(typeof mwZoom==='function')mwZoom(0.05)">A+</button>
              </div>
            </div>

            <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 10px;background:var(--bg3);border:1px solid var(--border2);border-radius:6px">
              <div>
                <div style="font-weight:600;font-size:12px;color:var(--text)">Running Ticker Tape BEI</div>
                <div style="font-size:11px;color:var(--text3)">Pita harga berjalan di bawah topbar</div>
              </div>
              <button type="button" class="btn btn-ghost btn-xs" onclick="var tw=el('ticker-wrap'); if(tw){ tw.style.display = tw.style.display==='none'?'flex':'none'; showSaveStatus('Pengaturan ticker diperbarui'); }">
                Alihkan Ticker
              </button>
            </div>
          </div>
        </div>

      </div>
    `;

    c.innerHTML = html;
  }

  // ══════════════════════════════════════════════════════════════════
  // EVENT HANDLERS
  // ══════════════════════════════════════════════════════════════════
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
      showSaveStatus('✓ Tarif Pajak & Komisi Broker berhasil disimpan & data direkalkulasi');
    }
    renderSettingsPage();
  }

  function triggerRecalculate() {
    if (typeof recalculateAllStoredData === 'function') {
      recalculateAllStoredData(false);
    }
    renderSettingsPage();
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
      showSaveStatus('✓ Sasaran Keuangan & Parameter FIRE berhasil disimpan');
    }
    renderSettingsPage();
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
      showSaveStatus('✓ Rekening ' + name + ' berhasil ditambahkan');
    }
    renderSettingsPage();
  }

  function deleteBankAccount(idx) {
    if (confirm('Hapus rekening bank ini?')) {
      if (typeof WEALTH !== 'undefined' && Array.isArray(WEALTH.bank)) {
        WEALTH.bank.splice(idx, 1);
        if (typeof wSave === 'function') wSave();
      }
      if (typeof showSaveStatus === 'function') {
        showSaveStatus('✓ Rekening bank dihapus');
      }
      renderSettingsPage();
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
      showSaveStatus('✓ Pos liabilitas ' + name + ' ditambahkan');
    }
    renderSettingsPage();
  }

  function deleteDebt(idx) {
    if (confirm('Hapus pos liabilitas ini?')) {
      if (typeof WEALTH !== 'undefined' && Array.isArray(WEALTH.debt)) {
        WEALTH.debt.splice(idx, 1);
        if (typeof wSave === 'function') wSave();
      }
      if (typeof showSaveStatus === 'function') {
        showSaveStatus('✓ Pos liabilitas dihapus');
      }
      renderSettingsPage();
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
      showSaveStatus('✓ Cadangan JSON berhasil diunduh');
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
        renderSettingsPage();
      } catch(err) {
        alert('Gagal memulihkan file: ' + err.message);
      }
    };
    reader.readAsText(file);
  }

  async function confirmDataReset() {
    if (!confirm('PERINGATAN: Apakah Anda yakin ingin mengosongkan SELURUH data transaksi dan portofolio menjadi 0?\n\nTindakan ini akan menghapus permanen seluruh riwayat transaksi di Firebase Firestore Cloud, server mirror, dan browser lokal.')) {
      return;
    }
    try {
      if (typeof showSaveStatus === 'function') {
        showSaveStatus('⏳ Menghapus transaksi di Firestore Cloud & Server...', 'var(--amber)', true);
      }
      if (typeof clearData === 'function') {
        await clearData(true);
      } else if (typeof resetAllDatabaseAndTransactions === 'function') {
        await resetAllDatabaseAndTransactions();
      }
      alert('✓ Berhasil! Seluruh transaksi dan saldo telah di-reset menjadi 0 di Firestore Cloud dan lokal.');
      renderSettingsPage();
    } catch(err) {
      console.error('Reset error:', err);
      alert('Reset selesai: ' + (err.message || err));
      renderSettingsPage();
    }
  }

  // Initialize
  loadSettings();

  window.MW_SETTINGS = {
    getState: function() { return state; },
    loadSettings: loadSettings,
    saveSettings: saveSettings,
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
