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

  // RENDER FULL SETTINGS PAGE / PILLAR
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
            Ekspor Cadangan JSON
          </button>
          <label class="btn btn-ghost btn-sm" style="cursor:pointer">
            Impor JSON
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

        <!-- 2. Financial Goals & FIRE Settings -->
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
      </div>

      <!-- GRID 2: Multi-Bank Accounts + Liabilities -->
      <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(340px, 1fr));gap:16px;margin-bottom:20px">
        
        <!-- 3. Multi-Bank Accounts Management -->
        <div class="card" style="padding:22px 24px;border-radius:12px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;border-bottom:1px solid var(--border2);padding-bottom:12px">
            <div style="font-weight:700;font-size:15px;color:var(--text);display:flex;align-items:center;gap:8px">
              <i class="ti ti-building-bank" style="color:var(--accent)"></i> Manajemen Rekening Bank &amp; Kas Likuid
            </div>
            <span class="badge b-up">${accounts.length} Rekening</span>
          </div>

          <!-- Existing Bank Accounts List -->
          <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:16px;max-height:210px;overflow-y:auto">
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

        <!-- 4. Liabilities & Debts Management -->
        <div class="card" style="padding:22px 24px;border-radius:12px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;border-bottom:1px solid var(--border2);padding-bottom:12px">
            <div style="font-weight:700;font-size:15px;color:var(--text);display:flex;align-items:center;gap:8px">
              <i class="ti ti-credit-card-off" style="color:var(--red)"></i> Manajemen Liabilitas &amp; Kewajiban
            </div>
            <span class="badge b-dn">${debts.length} Pos Hutang</span>
          </div>

          <!-- Existing Debts List -->
          <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:16px;max-height:210px;overflow-y:auto">
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
      </div>

      <!-- GRID 3: Data Management & Display / UI Customization -->
      <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(340px, 1fr));gap:16px">
        
        <!-- 5. Data Vault & Backup / Restore -->
        <div class="card" style="padding:18px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;border-bottom:1px solid var(--border2);padding-bottom:10px">
            <div style="font-weight:700;font-size:14px;color:var(--text);display:flex;align-items:center;gap:8px">
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
                Ekspor CSV
              </button>
            </div>

            <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 12px;background:rgba(59,130,246,0.1);border:1px solid rgba(59,130,246,0.3);border-radius:6px">
              <div>
                <div style="font-weight:700;font-size:12.5px;color:#38bdf8">Pusat Laporan &amp; Dokumen PDF</div>
                <div style="font-size:11px;color:var(--text3)">Pratinjau dan cetak dokumen resmi Family Office A4.</div>
              </div>
              <button type="button" class="btn btn-blue btn-sm" style="font-weight:700" onclick="if(typeof mwOpenPdfReportModal==='function')mwOpenPdfReportModal('consolidated');">
                Buka Pusat Laporan
              </button>
            </div>

            <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 12px;background:var(--bg3);border:1px solid var(--border2);border-radius:6px">
              <div>
                <div style="font-weight:700;font-size:12.5px;color:var(--text)">Ekspor Cadangan Master JSON</div>
                <div style="font-size:11px;color:var(--text3)">Unduh berkas portofolio, mutasi kas RDN, dividen, dan rekening.</div>
              </div>
              <button type="button" class="btn btn-ghost btn-sm" onclick="MW_SETTINGS.exportJsonBackup()">
                Ekspor JSON
              </button>
            </div>

            <div style="padding:10px 12px;background:var(--bg3);border:1px solid var(--border2);border-radius:6px">
              <div style="font-weight:700;font-size:12.5px;color:var(--text);margin-bottom:2px">Pulihkan Data dari JSON</div>
              <div style="font-size:11px;color:var(--text3);margin-bottom:8px">Unggah berkas cadangan MoneyWatch.</div>
              <label class="btn btn-ghost btn-sm" style="width:100%;justify-content:center;cursor:pointer">
                Pilih Berkas JSON untuk Dipulihkan...
                <input type="file" accept=".json" onchange="MW_SETTINGS.handleFileImport(event)" style="display:none">
              </label>
            </div>

            <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 12px;background:rgba(239,68,68,0.06);border:1px solid rgba(239,68,68,0.2);border-radius:6px">
              <div>
                <div style="font-weight:700;font-size:12.5px;color:var(--red)">Reset Data Transaksi (0 Transaksi)</div>
                <div style="font-size:11px;color:var(--text3)">Kosongkan seluruh riwayat portofolio &amp; transaksi di Supabase Cloud dan perangkat lokal.</div>
              </div>
              <button type="button" class="btn btn-ghost btn-sm" style="color:var(--red);border-color:rgba(239,68,68,0.3)" onclick="MW_SETTINGS.confirmDataReset()">
                Reset Data
              </button>
            </div>
          </div>
        </div>

        <!-- 6. Display, Font Scaling & Terminal Density -->
        <div class="card" style="padding:18px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;border-bottom:1px solid var(--border2);padding-bottom:10px">
            <div style="font-weight:700;font-size:14px;color:var(--text);display:flex;align-items:center;gap:8px">
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

        <!-- 7. KSEI Ownership & Free Float shortcut -->
        <div class="card" style="padding:18px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;border-bottom:1px solid var(--border2);padding-bottom:10px">
            <div style="font-weight:700;font-size:14px;color:var(--text);display:flex;align-items:center;gap:8px">
                            Struktur Kepemilikan &amp; Free Float (KSEI)
            </div>
            <span class="badge b-up">Upload Excel</span>
          </div>

          <div style="display:flex;flex-direction:column;gap:12px">
            <div style="font-size:11.5px;color:var(--text2);line-height:1.6">
              Update data Kepemilikan &gt;5% &amp; Free Float dari file Excel IDX (2 file mentah, atau 1 file template) tanpa perlu buka halaman saham dulu.
            </div>
            <button type="button" class="btn btn-primary btn-sm" style="width:100%;justify-content:center" onclick="if(typeof openKseiModal==='function')openKseiModal();if(typeof kseiSwitchTab==='function')kseiSwitchTab('sync-settings');">
              Buka KSEI Explorer &amp; Upload Data
            </button>
          </div>
        </div>

      </div>


      <!-- GRID KHUSUS: Form Input & Override Data Fundamental Manual -->
      <div class="card" style="padding:22px 24px;border:1px solid rgba(59,130,246,0.3);margin-top:16px;background:linear-gradient(180deg, rgba(59,130,246,0.03) 0%, var(--card) 100%)">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;border-bottom:1px solid var(--border2);padding-bottom:12px;flex-wrap:wrap;gap:10px">
          <div style="display:flex;align-items:center;gap:10px">
            <div style="width:36px;height:36px;border-radius:8px;background:rgba(59,130,246,0.12);display:flex;align-items:center;justify-content:center;color:var(--accent);font-size:18px">
              <i class="ti ti-database-cog"></i>
            </div>
            <div>
              <div style="font-weight:700;font-size:15px;color:var(--text)">Input &amp; Kelola Data Fundamental Emiten (Manual Override)</div>
              <div style="font-size:11.5px;color:var(--text3)">Input atau lengkapi rasio keuangan &amp; riwayat 5 tahun laporan keuangan untuk emiten yang belum tersedia di feed bursa</div>
            </div>
          </div>
          <span class="badge b-up">Tersimpan Lokal &amp; Cloud Sync</span>
        </div>

        <!-- Form Wrapper -->
        <form id="v6-form-fundamental-override" onsubmit="MW_SETTINGS.handleSaveFundamental(event)">
          <!-- Ticker Selection Bar -->
          <div style="background:var(--bg3);padding:14px 16px;border-radius:8px;border:1px solid var(--border2);margin-bottom:18px">
            <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
              <div style="flex:1;min-width:200px">
                <label class="cfg-label" style="margin-bottom:4px">KODE EMITEN (TICKER BEI)</label>
                <div style="display:flex;gap:8px">
                  <input type="text" id="fund-cfg-ticker" class="form-input mono" placeholder="Contoh: BBTN, BRIS, PTBA" style="text-transform:uppercase;font-weight:700;font-size:14px;letter-spacing:1px" required maxlength="10">
                  <button type="button" class="btn btn-primary btn-sm" onclick="MW_SETTINGS.loadFundamentalToForm(document.getElementById('fund-cfg-ticker').value)">
                    <i class="ti ti-search"></i> Muat / Cek Data
                  </button>
                  <button type="button" class="btn btn-ghost btn-sm" onclick="MW_SETTINGS.resetFundamentalForm()">
                    Kosongkan
                  </button>
                </div>
              </div>
            </div>

            <!-- Quick Ticker Chips -->
            <div style="margin-top:10px;display:flex;align-items:center;gap:6px;flex-wrap:wrap">
              <span style="font-size:11px;font-weight:600;color:var(--text3)">Pilihan Cepat Saham Populer:</span>
              <button type="button" class="btn btn-ghost btn-xs" onclick="MW_SETTINGS.quickSelectFundamentalTicker('BBTN')">BBTN</button>
              <button type="button" class="btn btn-ghost btn-xs" onclick="MW_SETTINGS.quickSelectFundamentalTicker('BRIS')">BRIS</button>
              <button type="button" class="btn btn-ghost btn-xs" onclick="MW_SETTINGS.quickSelectFundamentalTicker('PTBA')">PTBA</button>
              <button type="button" class="btn btn-ghost btn-xs" onclick="MW_SETTINGS.quickSelectFundamentalTicker('ANTM')">ANTM</button>
              <button type="button" class="btn btn-ghost btn-xs" onclick="MW_SETTINGS.quickSelectFundamentalTicker('KLBF')">KLBF</button>
              <button type="button" class="btn btn-ghost btn-xs" onclick="MW_SETTINGS.quickSelectFundamentalTicker('PGAS')">PGAS</button>
              <button type="button" class="btn btn-ghost btn-xs" onclick="MW_SETTINGS.quickSelectFundamentalTicker('ICBP')">ICBP</button>
              <button type="button" class="btn btn-ghost btn-xs" onclick="MW_SETTINGS.quickSelectFundamentalTicker('INDF')">INDF</button>
              <button type="button" class="btn btn-ghost btn-xs" onclick="MW_SETTINGS.quickSelectFundamentalTicker('MEDC')">MEDC</button>
              <button type="button" class="btn btn-ghost btn-xs" onclick="MW_SETTINGS.quickSelectFundamentalTicker('AMMN')">AMMN</button>
            </div>
          </div>

          <!-- Section 1: Rasio Finansial Utama Terkini -->
          <div style="margin-bottom:20px">
            <div style="font-weight:700;font-size:13px;color:var(--text);margin-bottom:10px;display:flex;align-items:center;gap:6px">
              <i class="ti ti-chart-dots" style="color:var(--accent)"></i>
              1. Rasio Finansial Utama Terkini (Untuk Stock Intel, Dossier &amp; Cockpit)
            </div>
            <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(130px, 1fr));gap:12px">
              <div>
                <label class="cfg-label">PER (P/E Ratio)</label>
                <input type="number" id="fund-cfg-per" class="form-input mono" step="0.01" placeholder="cth: 7.5">
                <div class="cfg-hint">x (kali)</div>
              </div>
              <div>
                <label class="cfg-label">PBV (P/B Ratio)</label>
                <input type="number" id="fund-cfg-pbv" class="form-input mono" step="0.01" placeholder="cth: 0.85">
                <div class="cfg-hint">x (kali)</div>
              </div>
              <div>
                <label class="cfg-label">ROE (%)</label>
                <input type="number" id="fund-cfg-roe" class="form-input mono" step="0.01" placeholder="cth: 14.5">
                <div class="cfg-hint">Return on Equity</div>
              </div>
              <div>
                <label class="cfg-label">ROA (%)</label>
                <input type="number" id="fund-cfg-roa" class="form-input mono" step="0.01" placeholder="cth: 2.1">
                <div class="cfg-hint">Return on Assets</div>
              </div>
              <div>
                <label class="cfg-label">DER (Debt/Equity)</label>
                <input type="number" id="fund-cfg-der" class="form-input mono" step="0.01" placeholder="cth: 0.75">
                <div class="cfg-hint">x (leverage)</div>
              </div>
              <div>
                <label class="cfg-label">NPM (%)</label>
                <input type="number" id="fund-cfg-npm" class="form-input mono" step="0.01" placeholder="cth: 18.2">
                <div class="cfg-hint">Net Profit Margin</div>
              </div>
              <div>
                <label class="cfg-label">Dividend Yield (%)</label>
                <input type="number" id="fund-cfg-divyield" class="form-input mono" step="0.01" placeholder="cth: 6.5">
                <div class="cfg-hint">Yield dividen tahunan</div>
              </div>
              <div>
                <label class="cfg-label">EPS Terkini (Rp)</label>
                <input type="number" id="fund-cfg-eps" class="form-input mono" step="1" placeholder="cth: 245">
                <div class="cfg-hint">Laba per lembar</div>
              </div>
              <div>
                <label class="cfg-label">BVPS (Rp)</label>
                <input type="number" id="fund-cfg-bvps" class="form-input mono" step="1" placeholder="cth: 1850">
                <div class="cfg-hint">Nilai buku/lembar</div>
              </div>
              <div>
                <label class="cfg-label">Harga Acuan (Rp)</label>
                <input type="number" id="fund-cfg-price" class="form-input mono" step="1" placeholder="cth: 1350">
                <div class="cfg-hint">Harga pasar saham</div>
              </div>
            </div>
          </div>

          <!-- Section 2: Riwayat 5 Tahun Laporan Keuangan (Harga Wajar) -->
          <div style="margin-bottom:20px">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
              <div style="font-weight:700;font-size:13px;color:var(--text);display:flex;align-items:center;gap:6px">
                <i class="ti ti-table" style="color:var(--accent)"></i>
                2. Riwayat Laporan Keuangan Tahunan (Untuk Engine Harga Wajar &amp; Valuasi Graham/DCF)
              </div>
              <button type="button" class="btn btn-ghost btn-xs" onclick="MW_SETTINGS.addFundamentalHistoryRow()">
                <i class="ti ti-plus"></i> Tambah Baris Tahun
              </button>
            </div>

            <div style="overflow-x:auto;border:1px solid var(--border2);border-radius:8px">
              <table style="width:100%;border-collapse:collapse;font-size:12px;text-align:left">
                <thead>
                  <tr style="background:var(--bg3);border-bottom:1px solid var(--border2);color:var(--text2)">
                    <th style="padding:8px 10px;font-weight:600;width:75px">Tahun</th>
                    <th style="padding:8px 10px;font-weight:600">EPS (Rp)</th>
                    <th style="padding:8px 10px;font-weight:600">Ekuitas / Lbr (Rp)</th>
                    <th style="padding:8px 10px;font-weight:600">Jml Saham Beredar</th>
                    <th style="padding:8px 10px;font-weight:600">DPS (Rp)</th>
                    <th style="padding:8px 10px;font-weight:600">PER Historis</th>
                    <th style="padding:8px 10px;font-weight:600">Laba Bersih (Rp)</th>
                    <th style="padding:8px 10px;text-align:center;width:40px">Aksi</th>
                  </tr>
                </thead>
                <tbody id="fund-history-tbody">
                  <!-- Dynamic rows inserted by JavaScript -->
                </tbody>
              </table>
            </div>
          </div>

          <!-- Submit Button & Messages -->
          <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;border-top:1px solid var(--border2);padding-top:16px">
            <div style="font-size:11.5px;color:var(--text3)">
              * Data yang disimpan akan langsung otomatis digunakan di modul <b>Harga Wajar</b>, <b>Stock Intel</b>, dan <b>Stock Dossier</b>.
            </div>
            <div style="display:flex;gap:8px">
              <button type="submit" class="btn btn-primary btn-sm" style="font-weight:700">
                <i class="ti ti-check"></i> Simpan Data Fundamental
              </button>
            </div>
          </div>
        </form>

        <!-- Section 3: Daftar Emiten yang Sudah Tersimpan -->
        <div style="margin-top:24px;border-top:1px dashed var(--border2);padding-top:16px">
          <div style="font-weight:700;font-size:13px;color:var(--text);margin-bottom:12px;display:flex;align-items:center;justify-content:space-between">
            <span style="display:flex;align-items:center;gap:6px">
              <i class="ti ti-list" style="color:var(--accent)"></i>
              Daftar Emiten dengan Data Manual Override:
            </span>
            <span id="fund-override-count" class="badge b-up">0 Emiten</span>
          </div>
          <div id="fund-override-list-box" style="font-size:12px;color:var(--text3)">
            Memuat daftar emiten...
          </div>
        </div>
      </div>

      <!-- GRID 4: API Quota Monitor (Invezgo) -->
      <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(340px, 1fr));gap:16px;margin-top:16px">

        <!-- 7. Invezgo Quota -->
        <div class="card" style="padding:18px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;border-bottom:1px solid var(--border2);padding-bottom:10px">
            <div style="font-weight:700;font-size:14px;color:var(--text)">Kuota Invezgo (Bandarmology)</div>
            <span class="badge b-up">Real-time</span>
          </div>
          <div id="quota-invezgo-box" style="font-size:12px;color:var(--text3)">Memuat data kuota…</div>
        </div>

        <!-- 8. Data Quality Gate Telemetry — jawaban praktis atas komentar
             DATA_QUALITY_ENFORCE_STAGE2 di .env.example/idx-data-engine.js:
             "only set to true after observing how often non-REAL status
             actually occurs in production". Sebelumnya tidak ada cara
             mengamati itu — kartu ini yang jadi caranya. -->
        <div class="card" style="padding:18px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;border-bottom:1px solid var(--border2);padding-bottom:10px">
            <div style="font-weight:700;font-size:14px;color:var(--text)">Data Quality Gate (Sinyal AI Trading)</div>
            <span class="badge b-up">Hari ini</span>
          </div>
          <div id="quota-dq-box" style="font-size:12px;color:var(--text3)">Memuat telemetri…</div>
        </div>

      </div>
    `;

    c.innerHTML = html;
    loadApiQuotaWidgets();
    renderFundamentalRows([]);
    renderFundamentalOverrideList();
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


  // ============================================================================
  // MANUAL FUNDAMENTAL DATA MANAGER
  // ============================================================================
  function renderFundamentalRows(rows) {
    var tbody = document.getElementById('fund-history-tbody');
    if (!tbody) return;
    
    var currentYear = new Date().getFullYear();
    if (!rows || !Array.isArray(rows) || rows.length === 0) {
      rows = [];
      for (var i = 4; i >= 0; i--) {
        rows.push({ year: currentYear - i, eps: '', equity: '', shares: '', dps: '', per: '', netIncome: '' });
      }
    }

    var html = '';
    rows.forEach(function(r) {
      html += `
        <tr style="border-bottom:1px solid var(--border2)">
          <td style="padding:6px 8px">
            <input type="number" class="form-input mono fund-row-year" value="${r.year || ''}" style="width:70px;padding:4px 6px;font-size:11.5px" placeholder="Tahun" required>
          </td>
          <td style="padding:6px 8px">
            <input type="number" step="any" class="form-input mono fund-row-eps" value="${r.eps !== undefined ? r.eps : ''}" style="width:100%;min-width:75px;padding:4px 6px;font-size:11.5px" placeholder="cth: 150">
          </td>
          <td style="padding:6px 8px">
            <input type="number" step="any" class="form-input mono fund-row-equity" value="${r.equity !== undefined ? r.equity : ''}" style="width:100%;min-width:85px;padding:4px 6px;font-size:11.5px" placeholder="cth: 1200">
          </td>
          <td style="padding:6px 8px">
            <input type="number" step="any" class="form-input mono fund-row-shares" value="${r.shares !== undefined ? r.shares : ''}" style="width:100%;min-width:110px;padding:4px 6px;font-size:11.5px" placeholder="cth: 10000000000">
          </td>
          <td style="padding:6px 8px">
            <input type="number" step="any" class="form-input mono fund-row-dps" value="${r.dps !== undefined ? r.dps : ''}" style="width:100%;min-width:75px;padding:4px 6px;font-size:11.5px" placeholder="cth: 50">
          </td>
          <td style="padding:6px 8px">
            <input type="number" step="any" class="form-input mono fund-row-per" value="${r.per !== undefined ? r.per : ''}" style="width:100%;min-width:65px;padding:4px 6px;font-size:11.5px" placeholder="cth: 10.5">
          </td>
          <td style="padding:6px 8px">
            <input type="number" step="any" class="form-input mono fund-row-netincome" value="${r.netIncome !== undefined ? r.netIncome : ''}" style="width:100%;min-width:110px;padding:4px 6px;font-size:11.5px" placeholder="cth: 1500000000000">
          </td>
          <td style="padding:6px 8px;text-align:center">
            <button type="button" class="btn btn-ghost btn-xs" style="color:var(--red);padding:2px 6px" onclick="MW_SETTINGS.removeFundamentalHistoryRow(this)" title="Hapus Baris">
              <i class="ti ti-trash"></i>
            </button>
          </td>
        </tr>
      `;
    });

    tbody.innerHTML = html;
  }

  function addFundamentalHistoryRow() {
    var tbody = document.getElementById('fund-history-tbody');
    if (!tbody) return;
    var rows = tbody.querySelectorAll('tr');
    var lastYear = new Date().getFullYear();
    if (rows.length > 0) {
      var lastInp = rows[rows.length - 1].querySelector('.fund-row-year');
      if (lastInp && lastInp.value) {
        lastYear = parseInt(lastInp.value, 10) + 1;
      }
    }
    var tr = document.createElement('tr');
    tr.style.borderBottom = '1px solid var(--border2)';
    tr.innerHTML = `
      <td style="padding:6px 8px">
        <input type="number" class="form-input mono fund-row-year" value="${lastYear}" style="width:70px;padding:4px 6px;font-size:11.5px" placeholder="Tahun" required>
      </td>
      <td style="padding:6px 8px">
        <input type="number" step="any" class="form-input mono fund-row-eps" value="" style="width:100%;min-width:75px;padding:4px 6px;font-size:11.5px" placeholder="cth: 150">
      </td>
      <td style="padding:6px 8px">
        <input type="number" step="any" class="form-input mono fund-row-equity" value="" style="width:100%;min-width:85px;padding:4px 6px;font-size:11.5px" placeholder="cth: 1200">
      </td>
      <td style="padding:6px 8px">
        <input type="number" step="any" class="form-input mono fund-row-shares" value="" style="width:100%;min-width:110px;padding:4px 6px;font-size:11.5px" placeholder="cth: 10000000000">
      </td>
      <td style="padding:6px 8px">
        <input type="number" step="any" class="form-input mono fund-row-dps" value="" style="width:100%;min-width:75px;padding:4px 6px;font-size:11.5px" placeholder="cth: 50">
      </td>
      <td style="padding:6px 8px">
        <input type="number" step="any" class="form-input mono fund-row-per" value="" style="width:100%;min-width:65px;padding:4px 6px;font-size:11.5px" placeholder="cth: 10.5">
      </td>
      <td style="padding:6px 8px">
        <input type="number" step="any" class="form-input mono fund-row-netincome" value="" style="width:100%;min-width:110px;padding:4px 6px;font-size:11.5px" placeholder="cth: 1500000000000">
      </td>
      <td style="padding:6px 8px;text-align:center">
        <button type="button" class="btn btn-ghost btn-xs" style="color:var(--red);padding:2px 6px" onclick="MW_SETTINGS.removeFundamentalHistoryRow(this)" title="Hapus Baris">
          <i class="ti ti-trash"></i>
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  }

  function removeFundamentalHistoryRow(btn) {
    if (!btn) return;
    var tr = btn.closest('tr');
    if (tr) tr.remove();
  }

  function resetFundamentalForm() {
    var tInp = document.getElementById('fund-cfg-ticker');
    if (tInp) tInp.value = '';
    ['fund-cfg-per', 'fund-cfg-pbv', 'fund-cfg-roe', 'fund-cfg-roa', 'fund-cfg-der',
     'fund-cfg-npm', 'fund-cfg-divyield', 'fund-cfg-eps', 'fund-cfg-bvps', 'fund-cfg-price'].forEach(function(id) {
      var el = document.getElementById(id);
      if (el) el.value = '';
    });
    renderFundamentalRows([]);
  }

  function loadFundamentalToForm(ticker) {
    if (!ticker) return;
    var tk = String(ticker).toUpperCase().replace(/\.JK$/i, '').trim();
    var tInp = document.getElementById('fund-cfg-ticker');
    if (tInp) tInp.value = tk;

    var override = typeof getFundamentalOverride === 'function' ? getFundamentalOverride(tk) : null;
    var dbEntry = (typeof STOCK_FINANCIAL_DATABASE !== 'undefined' && STOCK_FINANCIAL_DATABASE[tk]) ? STOCK_FINANCIAL_DATABASE[tk] : null;

    var ratios = (override && override.ratios) ? override.ratios : {};
    var rows = (override && Array.isArray(override.rows) && override.rows.length) ? override.rows : (dbEntry ? dbEntry.rows : []);

    var setV = function(id, v) {
      var el = document.getElementById(id);
      if (el) el.value = (v !== undefined && v !== null && v !== '') ? v : '';
    };

    setV('fund-cfg-per', ratios.per !== undefined ? ratios.per : (dbEntry ? '' : ''));
    setV('fund-cfg-pbv', ratios.pbv);
    setV('fund-cfg-roe', ratios.roe);
    setV('fund-cfg-roa', ratios.roa);
    setV('fund-cfg-der', ratios.der);
    setV('fund-cfg-npm', ratios.npm);
    setV('fund-cfg-divyield', ratios.dividendYield);
    setV('fund-cfg-eps', ratios.eps);
    setV('fund-cfg-bvps', ratios.bvps);
    setV('fund-cfg-price', override ? override.currentPrice : (dbEntry ? dbEntry.price : ''));

    renderFundamentalRows(rows);

    if (override) {
      if (typeof showSaveStatus === 'function') {
        showSaveStatus('Data manual override ' + tk + ' dimuat ke form', 'var(--accent)');
      }
    } else if (dbEntry) {
      if (typeof showSaveStatus === 'function') {
        showSaveStatus('Data dasar ' + tk + ' dimuat dari kurasi bawaan', 'var(--blue)');
      }
    } else {
      if (typeof showSaveStatus === 'function') {
        showSaveStatus('Emiten ' + tk + ' belum memiliki data tersimpan. Siap diinput.', 'var(--amber)');
      }
    }
  }

  function quickSelectFundamentalTicker(tk) {
    loadFundamentalToForm(tk);
  }

  function handleSaveFundamental(e) {
    if (e && e.preventDefault) e.preventDefault();
    var tInp = document.getElementById('fund-cfg-ticker');
    var tk = tInp ? tInp.value.trim().toUpperCase().replace(/\.JK$/i, '') : '';
    if (!tk) {
      alert('Silakan masukkan kode ticker emiten.');
      return;
    }

    var getNum = function(id) {
      var el = document.getElementById(id);
      if (!el || el.value === '') return null;
      var n = parseFloat(el.value);
      return isNaN(n) ? null : n;
    };

    var ratios = {
      per: getNum('fund-cfg-per'),
      pbv: getNum('fund-cfg-pbv'),
      roe: getNum('fund-cfg-roe'),
      roa: getNum('fund-cfg-roa'),
      der: getNum('fund-cfg-der'),
      npm: getNum('fund-cfg-npm'),
      dividendYield: getNum('fund-cfg-divyield'),
      eps: getNum('fund-cfg-eps'),
      bvps: getNum('fund-cfg-bvps')
    };
    var currentPrice = getNum('fund-cfg-price');

    // Collect history rows
    var tbody = document.getElementById('fund-history-tbody');
    var rows = [];
    if (tbody) {
      var trs = tbody.querySelectorAll('tr');
      trs.forEach(function(tr) {
        var yInp = tr.querySelector('.fund-row-year');
        var epsInp = tr.querySelector('.fund-row-eps');
        var eqInp = tr.querySelector('.fund-row-equity');
        var shInp = tr.querySelector('.fund-row-shares');
        var dpsInp = tr.querySelector('.fund-row-dps');
        var perInp = tr.querySelector('.fund-row-per');
        var niInp = tr.querySelector('.fund-row-netincome');

        var year = yInp ? parseInt(yInp.value, 10) : null;
        if (year && !isNaN(year)) {
          var parseF = function(inp) {
            if (!inp || inp.value === '') return '';
            var val = parseFloat(inp.value);
            return isNaN(val) ? '' : val;
          };
          rows.push({
            year: year,
            eps: parseF(epsInp),
            equity: parseF(eqInp),
            shares: parseF(shInp),
            dps: parseF(dpsInp),
            per: parseF(perInp),
            netIncome: parseF(niInp)
          });
        }
      });
    }

    // Urutkan rows berdasarkan tahun menaik
    rows.sort(function(a, b) { return a.year - b.year; });

    var payload = {
      ticker: tk,
      currentPrice: currentPrice,
      ratios: ratios,
      rows: rows
    };

    if (typeof saveFundamentalOverride === 'function') {
      var ok = saveFundamentalOverride(tk, payload);
      if (ok) {
        if (typeof showSaveStatus === 'function') {
          showSaveStatus('Data fundamental ' + tk + ' berhasil disimpan & disinkronkan!', 'var(--green)');
        }
        renderFundamentalOverrideList();
      } else {
        alert('Gagal menyimpan data fundamental ' + tk);
      }
    }
  }

  function handleDeleteFundamental(tk) {
    if (!tk) return;
    if (confirm('Hapus data fundamental manual untuk emiten ' + tk + '? Data akan kembali ke sumber feed default.')) {
      if (typeof deleteFundamentalOverride === 'function') {
        deleteFundamentalOverride(tk);
        if (typeof showSaveStatus === 'function') {
          showSaveStatus('Data fundamental ' + tk + ' telah dihapus');
        }
        renderFundamentalOverrideList();
        var currentTInp = document.getElementById('fund-cfg-ticker');
        if (currentTInp && currentTInp.value.toUpperCase() === tk.toUpperCase()) {
          resetFundamentalForm();
        }
      }
    }
  }

  function renderFundamentalOverrideList() {
    var box = document.getElementById('fund-override-list-box');
    var countBadge = document.getElementById('fund-override-count');
    if (!box) return;

    var all = typeof getAllFundamentalOverrides === 'function' ? getAllFundamentalOverrides() : {};
    var tickers = Object.keys(all).sort();

    if (countBadge) {
      countBadge.textContent = tickers.length + ' Emiten';
    }

    if (tickers.length === 0) {
      box.innerHTML = '<div style="padding:14px;text-align:center;background:var(--bg3);border-radius:6px;color:var(--text3)">Belum ada data fundamental manual yang disimpan. Pilih saham di atas untuk mulai input.</div>';
      return;
    }

    var html = '<div style="overflow-x:auto;border:1px solid var(--border2);border-radius:6px"><table style="width:100%;border-collapse:collapse;font-size:12px">';
    html += '<thead style="background:var(--bg3);border-bottom:1px solid var(--border2);color:var(--text2)"><tr>';
    html += '<th style="padding:8px 10px;text-align:left">Ticker</th>';
    html += '<th style="padding:8px 10px;text-align:left">Status</th>';
    html += '<th style="padding:8px 10px;text-align:right">PER</th>';
    html += '<th style="padding:8px 10px;text-align:right">PBV</th>';
    html += '<th style="padding:8px 10px;text-align:right">ROE</th>';
    html += '<th style="padding:8px 10px;text-align:right">DER</th>';
    html += '<th style="padding:8px 10px;text-align:right">Div Yield</th>';
    html += '<th style="padding:8px 10px;text-align:center">Histori</th>';
    html += '<th style="padding:8px 10px;text-align:left">Diperbarui</th>';
    html += '<th style="padding:8px 10px;text-align:center">Aksi</th>';
    html += '</tr></thead><tbody>';

    tickers.forEach(function(tk) {
      var item = all[tk];
      var r = item.ratios || {};
      var numRows = Array.isArray(item.rows) ? item.rows.length : 0;
      var dateStr = item.updatedAt ? new Date(item.updatedAt).toLocaleDateString('id-ID', {day:'2-digit', month:'short', year:'numeric'}) : '-';

      html += '<tr style="border-bottom:1px solid var(--border2)">';
      html += '<td style="padding:8px 10px;font-weight:700;color:var(--text);font-family:monospace">' + tk + '</td>';
      html += '<td style="padding:8px 10px"><span class="badge b-up" style="font-size:10px">MANUAL</span></td>';
      html += '<td style="padding:8px 10px;text-align:right;font-family:monospace">' + (r.per != null ? r.per.toFixed(1) + 'x' : '—') + '</td>';
      html += '<td style="padding:8px 10px;text-align:right;font-family:monospace">' + (r.pbv != null ? r.pbv.toFixed(2) + 'x' : '—') + '</td>';
      html += '<td style="padding:8px 10px;text-align:right;font-family:monospace">' + (r.roe != null ? r.roe.toFixed(1) + '%' : '—') + '</td>';
      html += '<td style="padding:8px 10px;text-align:right;font-family:monospace">' + (r.der != null ? r.der.toFixed(2) + 'x' : '—') + '</td>';
      html += '<td style="padding:8px 10px;text-align:right;font-family:monospace">' + (r.dividendYield != null ? r.dividendYield.toFixed(1) + '%' : '—') + '</td>';
      html += '<td style="padding:8px 10px;text-align:center"><span class="badge b-amb" style="font-size:10px">' + numRows + ' Thn</span></td>';
      html += '<td style="padding:8px 10px;color:var(--text3);font-size:11px">' + dateStr + '</td>';
      html += '<td style="padding:8px 10px;text-align:center;display:flex;gap:4px;justify-content:center">';
      html += '<button type="button" class="btn btn-ghost btn-xs" onclick="MW_SETTINGS.loadFundamentalToForm(\'' + tk + '\')" title="Muat / Edit"><i class="ti ti-edit"></i> Edit</button>';
      html += '<button type="button" class="btn btn-ghost btn-xs" style="color:var(--red)" onclick="MW_SETTINGS.handleDeleteFundamental(\'' + tk + '\')" title="Hapus"><i class="ti ti-trash"></i></button>';
      html += '</td>';
      html += '</tr>';
    });

    html += '</tbody></table></div>';
    box.innerHTML = html;
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
      showSaveStatus('Sasaran Keuangan & Parameter FIRE berhasil disimpan');
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
      showSaveStatus('Rekening ' + name + ' berhasil ditambahkan');
    }
    renderSettingsPage();
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
      showSaveStatus('Pos liabilitas ' + name + ' ditambahkan');
    }
    renderSettingsPage();
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
        renderSettingsPage();
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
    triggerRecalculate: triggerRecalculate,
    renderFundamentalRows: renderFundamentalRows,
    addFundamentalHistoryRow: addFundamentalHistoryRow,
    removeFundamentalHistoryRow: removeFundamentalHistoryRow,
    resetFundamentalForm: resetFundamentalForm,
    loadFundamentalToForm: loadFundamentalToForm,
    quickSelectFundamentalTicker: quickSelectFundamentalTicker,
    handleSaveFundamental: handleSaveFundamental,
    handleDeleteFundamental: handleDeleteFundamental,
    renderFundamentalOverrideList: renderFundamentalOverrideList
  };

  // Aliases for Router Compatibility
  window.renderSettingsPage = renderSettingsPage;

})();
