// ============================================================
// MONEYWATCH PRO — PRICE ALERT & NOTIFICATION ENGINE (V7)
// ============================================================

(function() {
  'use strict';

  var ALERT_LS_KEY = 'mw_price_alerts_v2';
  var SOUND_ENABLED_KEY = 'mw_alert_sound_enabled';
  var alertsList = [];
  var isSoundEnabled = (function() {
    try {
      var s = localStorage.getItem(SOUND_ENABLED_KEY);
      return s === null ? true : s === '1';
    } catch(e) { return true; }
  })();

  // ── Load & Save Alerts ──
  function loadAlerts() {
    if (!Array.isArray(alertsList)) alertsList = [];
    return alertsList;
  }

  function saveAlerts() {
    if (typeof saveData === 'function') saveData();
    updateAlertBadgeUI();
  }

  window.mwGetPriceAlerts = function() {
    return alertsList;
  };

  // ── Web Audio API Synthetic Chime ──
  window.mwPlayAlertChime = function(type) {
    if (!isSoundEnabled) return;
    try {
      var AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      var ctx = new AudioCtx();
      if (ctx.state === 'suspended') {
        ctx.resume();
      }

      var now = ctx.currentTime;
      var isPositive = type !== 'down' && type !== 'sl';

      // Oscillator 1
      var osc1 = ctx.createOscillator();
      var gain1 = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(isPositive ? 587.33 : 440, now); // D5 or A4
      osc1.frequency.exponentialRampToValueAtTime(isPositive ? 880 : 329.63, now + 0.18); // A5 or E4

      gain1.gain.setValueAtTime(0.001, now);
      gain1.gain.linearRampToValueAtTime(0.2, now + 0.04);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.36);

      // Oscillator 2 (Harmonic overtone)
      var osc2 = ctx.createOscillator();
      var gain2 = ctx.createGain();
      osc2.type = 'triangle';
      osc2.frequency.setValueAtTime(isPositive ? 880 : 329.63, now + 0.12);
      osc2.frequency.exponentialRampToValueAtTime(isPositive ? 1174.66 : 220, now + 0.32);

      gain2.gain.setValueAtTime(0.001, now + 0.12);
      gain2.gain.linearRampToValueAtTime(0.25, now + 0.16);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.55);

      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(now + 0.12);
      osc2.stop(now + 0.56);
    } catch(e) {
      console.warn('Audio chime unsupported:', e);
    }
  };

  // ── Browser Web Notification Permission ──
  window.mwRequestNotificationPermission = function(cb) {
    if (!('Notification' in window)) {
      if (typeof showSaveStatus === 'function') {
        showSaveStatus('⚠ Browser Anda tidak mendukung Web Notifications', 'var(--amber)');
      }
      if (cb) cb(false);
      return;
    }

    if (Notification.permission === 'granted') {
      if (typeof showSaveStatus === 'function') {
        showSaveStatus('✓ Izin Notifikasi Web sudah aktif', 'var(--green)');
      }
      if (cb) cb(true);
      return;
    }

    Notification.requestPermission().then(function(permission) {
      if (permission === 'granted') {
        if (typeof showSaveStatus === 'function') {
          showSaveStatus('✓ Notifikasi Web Browser berhasil diaktifkan', 'var(--green)');
        }
        mwSendBrowserNotification('🔔 MoneyWatch Pro Alerts Aktif', 'Anda akan menerima notifikasi instan saat harga saham menyentuh target.');
        if (cb) cb(true);
      } else {
        if (typeof showSaveStatus === 'function') {
          showSaveStatus('⚠ Izin Notifikasi ditolak di browser', 'var(--red)');
        }
        if (cb) cb(false);
      }
      if (typeof renderPriceAlertsPage === 'function') renderPriceAlertsPage();
    });
  };

  window.mwSendBrowserNotification = function(title, body, tag) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    try {
      var notif = new Notification(title, {
        body: body,
        icon: 'https://cdn-icons-png.flxml.com/512/2953/2953363.png',
        tag: tag || 'mw-price-alert'
      });
      notif.onclick = function() {
        window.focus();
        if (typeof goPage === 'function') goPage('alerts');
        this.close();
      };
    } catch(e) {
      console.warn('Gagal memicu browser notification:', e);
    }
  };

  // ── In-App Floating Toast Notification ──
  window.mwShowPriceAlertToast = function(alertItem, curPrice) {
    var toastContainer = document.getElementById('mw-toast-container');
    if (!toastContainer) {
      toastContainer = document.createElement('div');
      toastContainer.id = 'mw-toast-container';
      toastContainer.style.cssText = 'position:fixed;bottom:24px;right:24px;z-index:10050;display:flex;flex-direction:column;gap:10px;max-width:380px;width:calc(100vw - 48px);pointer-events:none;';
      document.body.appendChild(toastContainer);
    }

    var isGte = alertItem.condition === 'GTE';
    var color = isGte ? 'var(--green)' : 'var(--red)';
    var borderColor = isGte ? 'rgba(16,185,129,0.4)' : 'rgba(239,68,68,0.4)';
    var bg = '#101726';

    var toast = document.createElement('div');
    toast.style.cssText = 'background:' + bg + ';border:1px solid ' + borderColor + ';box-shadow:0 15px 35px rgba(0,0,0,0.6), 0 0 15px ' + borderColor + ';border-radius:10px;padding:14px 16px;pointer-events:auto;animation:toastIn 0.3s cubic-bezier(0.16, 1, 0.3, 1);transition:all 0.2s ease;';

    toast.innerHTML = 
      '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px">' +
        '<div style="display:flex;align-items:center;gap:8px">' +
          '<div style="width:30px;height:30px;border-radius:6px;background:var(--bg4);display:flex;align-items:center;justify-content:center;font-size:16px;color:' + color + ';flex-shrink:0">' +
            '<i class="ti ti-bell-ringing"></i>' +
          '</div>' +
          '<div>' +
            '<div style="font-size:13px;font-weight:800;color:#fff;display:flex;align-items:center;gap:6px">' +
              '<span>' + alertItem.ticker + '</span>' +
              '<span class="badge" style="font-size:9.5px;padding:1px 6px;background:' + color + '22;color:' + color + ';border:1px solid ' + color + '44">' + (alertItem.tag || 'Target Tercapai') + '</span>' +
            '</div>' +
            '<div style="font-size:11px;color:var(--text3);margin-top:2px">' +
              (isGte ? 'Menembus Target Naik ≥ ' : 'Menembus Target Turun ≤ ') + '<strong>Rp ' + Number(alertItem.targetPrice).toLocaleString('id-ID') + '</strong>' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<button onclick="this.closest(\'div\').parentElement.remove()" style="background:none;border:none;color:var(--text3);cursor:pointer;font-size:16px;padding:0 4px;line-height:1">×</button>' +
      '</div>' +
      '<div style="margin-top:10px;padding-top:8px;border-top:1px solid rgba(255,255,255,0.08);display:flex;align-items:center;justify-content:space-between">' +
        '<div style="font-size:12px;font-family:var(--font-mono);font-weight:700;color:' + color + '">' +
          'Harga Terkini: Rp ' + Number(curPrice).toLocaleString('id-ID') +
        '</div>' +
        '<button class="btn btn-ghost btn-xs" onclick="goStockIntelCockpit(\'' + alertItem.ticker + '\');this.closest(\'div\').parentElement.remove();" style="font-size:11px;color:var(--accent);border-color:var(--border2);padding:2px 8px">' +
          'Buka Cockpit ↗' +
        '</button>' +
      '</div>';

    toastContainer.appendChild(toast);

    // Auto dismiss after 8 seconds
    setTimeout(function() {
      if (toast && toast.parentElement) {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(10px)';
        setTimeout(function() { if (toast.parentElement) toast.remove(); }, 250);
      }
    }, 8000);
  };

  // ── Price Alert Evaluation Engine ──
  window.mwCheckPriceAlerts = function() {
    if (!alertsList || !alertsList.length) return;
    var curPrices = window.prices || {};
    var changed = false;

    alertsList.forEach(function(item) {
      if (item.status !== 'ACTIVE') return;

      var p = curPrices[item.ticker] || (window.DB && window.DB[item.ticker] && window.DB[item.ticker].base) || 0;
      if (p <= 0) return;

      var isTriggered = false;
      if (item.condition === 'GTE' && p >= item.targetPrice) {
        isTriggered = true;
      } else if (item.condition === 'LTE' && p <= item.targetPrice) {
        isTriggered = true;
      } else if (item.condition === 'PCT_UP') {
        var pct = ((p - item.initialPrice) / item.initialPrice) * 100;
        if (pct >= item.pctChange) isTriggered = true;
      } else if (item.condition === 'PCT_DN') {
        var pct = ((p - item.initialPrice) / item.initialPrice) * 100;
        if (pct <= -Math.abs(item.pctChange)) isTriggered = true;
      }

      if (isTriggered) {
        item.status = 'TRIGGERED';
        item.triggeredAt = new Date().toISOString();
        item.triggeredPrice = p;
        changed = true;

        // Play Sound
        mwPlayAlertChime(item.condition === 'LTE' || item.tag === 'Stop Loss' ? 'down' : 'up');

        // Show Toast
        mwShowPriceAlertToast(item, p);

        // Send Native OS Notification
        var bodyMsg = item.ticker + ' telah mencapai target Rp ' + p.toLocaleString('id-ID') + 
          (item.note ? ' (' + item.note + ')' : '');
        mwSendBrowserNotification('🚨 Target Alert ' + item.ticker + ' Tercapai!', bodyMsg, 'alert-' + item.id);
      }
    });

    if (changed) {
      saveAlerts();
      if (typeof renderPriceAlertsPage === 'function' && document.getElementById('page-alerts') && document.getElementById('page-alerts').classList.contains('on')) {
        renderPriceAlertsPage();
      }
    }
  };

  // ── Alert CRUD ──
  window.mwAddPriceAlert = function(data) {
    if (!data || !data.ticker || !data.targetPrice) {
      if (typeof showSaveStatus === 'function') showSaveStatus('⚠ Lengkapi Ticker dan Target Harga', 'var(--red)');
      return false;
    }

    var id = 'al_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4);
    var curP = (window.prices && window.prices[data.ticker]) || (window.DB && window.DB[data.ticker] && window.DB[data.ticker].base) || data.targetPrice;

    var newAlert = {
      id: id,
      ticker: data.ticker.toUpperCase().trim(),
      condition: data.condition || (data.targetPrice >= curP ? 'GTE' : 'LTE'),
      targetPrice: Number(data.targetPrice),
      initialPrice: Number(curP),
      tag: data.tag || (data.targetPrice >= curP ? 'Take Profit' : 'Stop Loss'),
      note: data.note || '',
      status: 'ACTIVE',
      createdAt: new Date().toISOString(),
      triggeredAt: null,
      triggeredPrice: null
    };

    alertsList.unshift(newAlert);
    saveAlerts();

    if (typeof showSaveStatus === 'function') {
      showSaveStatus('✓ Alert harga untuk ' + newAlert.ticker + ' aktif', 'var(--green)');
    }

    // Check immediately in case current price already satisfies
    mwCheckPriceAlerts();

    if (typeof renderPriceAlertsPage === 'function' && document.getElementById('page-alerts') && document.getElementById('page-alerts').classList.contains('on')) {
      renderPriceAlertsPage();
    }
    return true;
  };

  window.mwTogglePauseAlert = function(id) {
    var item = alertsList.find(function(a) { return a.id === id; });
    if (item) {
      item.status = item.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE';
      saveAlerts();
      if (typeof renderPriceAlertsPage === 'function') renderPriceAlertsPage();
      if (typeof showSaveStatus === 'function') {
        showSaveStatus(item.status === 'ACTIVE' ? '✓ Alert ' + item.ticker + ' diaktifkan kembali' : '⏸ Alert ' + item.ticker + ' di-pause');
      }
    }
  };

  window.mwResetTriggeredAlert = function(id) {
    var item = alertsList.find(function(a) { return a.id === id; });
    if (item) {
      item.status = 'ACTIVE';
      item.triggeredAt = null;
      item.triggeredPrice = null;
      var curP = (window.prices && window.prices[item.ticker]) || item.initialPrice;
      item.initialPrice = curP;
      saveAlerts();
      if (typeof renderPriceAlertsPage === 'function') renderPriceAlertsPage();
      if (typeof showSaveStatus === 'function') showSaveStatus('✓ Alert ' + item.ticker + ' direset ke status aktif');
    }
  };

  window.mwDeletePriceAlert = function(id) {
    var idx = alertsList.findIndex(function(a) { return a.id === id; });
    if (idx > -1) {
      var tk = alertsList[idx].ticker;
      alertsList.splice(idx, 1);
      saveAlerts();
      if (typeof renderPriceAlertsPage === 'function') renderPriceAlertsPage();
      if (typeof showSaveStatus === 'function') showSaveStatus('🗑 Alert ' + tk + ' dihapus');
    }
  };

  window.mwClearTriggeredAlerts = function() {
    alertsList = alertsList.filter(function(a) { return a.status !== 'TRIGGERED'; });
    saveAlerts();
    if (typeof renderPriceAlertsPage === 'function') renderPriceAlertsPage();
    if (typeof showSaveStatus === 'function') showSaveStatus('✓ Semua alert tercapai telah dibersihkan');
  };

  window.mwToggleSoundEnabled = function() {
    isSoundEnabled = !isSoundEnabled;
    try {
      localStorage.setItem(SOUND_ENABLED_KEY, isSoundEnabled ? '1' : '0');
    } catch(e) {}
    if (isSoundEnabled) mwPlayAlertChime('up');
    if (typeof showSaveStatus === 'function') {
      showSaveStatus(isSoundEnabled ? '🔊 Suara Alert Diaktifkan' : '🔇 Suara Alert Dinonaktifkan');
    }
    if (typeof renderPriceAlertsPage === 'function') renderPriceAlertsPage();
  };

  // ── UI Counter Badges in Topbar and Sidebar ──
  function updateAlertBadgeUI() {
    var activeCount = alertsList.filter(function(a) { return a.status === 'ACTIVE'; }).length;
    var triggeredCount = alertsList.filter(function(a) { return a.status === 'TRIGGERED'; }).length;

    // Topbar bell icon badge
    var tbBadge = document.getElementById('tb-alert-badge');
    if (tbBadge) {
      if (triggeredCount > 0) {
        tbBadge.style.display = 'inline-flex';
        tbBadge.textContent = triggeredCount;
        tbBadge.className = 'tb-alert-badge pulsing-alert';
        tbBadge.style.background = 'var(--red)';
      } else if (activeCount > 0) {
        tbBadge.style.display = 'inline-flex';
        tbBadge.textContent = activeCount;
        tbBadge.className = 'tb-alert-badge';
        tbBadge.style.background = 'var(--accent)';
      } else {
        tbBadge.style.display = 'none';
      }
    }

    // Sidebar navigation badge
    var sideBadge = document.getElementById('side-alert-badge');
    if (sideBadge) {
      if (triggeredCount > 0) {
        sideBadge.style.display = 'inline-block';
        sideBadge.textContent = triggeredCount + ' Baru';
        sideBadge.className = 'badge b-dn';
      } else if (activeCount > 0) {
        sideBadge.style.display = 'inline-block';
        sideBadge.textContent = activeCount;
        sideBadge.className = 'badge b-accent';
      } else {
        sideBadge.style.display = 'none';
      }
    }
  }

  // ── Interactive Modal: Buat / Pasang Alert Baru ──
  window.openCreatePriceAlertModal = function(defaultTicker, defaultTarget, defaultCond, defaultTag) {
    var modal = document.getElementById('modal');
    if (!modal) return;

    var tickers = Object.keys(window.DB || {});
    if (window.getPortfolio && typeof window.getPortfolio === 'function') {
      var porto = window.getPortfolio();
      porto.forEach(function(p) {
        if (tickers.indexOf(p.ticker) === -1) tickers.unshift(p.ticker);
      });
    }

    defaultTicker = (defaultTicker || (tickers[0] || 'BBCA')).toUpperCase();
    var curP = (window.prices && window.prices[defaultTicker]) || (window.DB && window.DB[defaultTicker] && window.DB[defaultTicker].base) || 1000;
    var targetP = defaultTarget || Math.round(curP * 1.05);
    var cond = defaultCond || (targetP >= curP ? 'GTE' : 'LTE');
    var tag = defaultTag || (targetP >= curP ? 'Take Profit' : 'Stop Loss');

    var optsHtml = tickers.map(function(tk) {
      var name = (window.DB && window.DB[tk] && window.DB[tk].name) || tk;
      return '<option value="' + tk + '"' + (tk === defaultTicker ? ' selected' : '') + '>' + tk + ' — ' + name + '</option>';
    }).join('');

    var modalTitle = document.getElementById('m-title');
    var modalBody = document.getElementById('m-body');
    if (modalTitle) {
      modalTitle.innerHTML = '🔔 Pasang Price Alert Baru';
      modalTitle.style.color = 'var(--accent)';
    }

    if (modalBody) {
      modalBody.innerHTML = 
        '<div style="display:flex;flex-direction:column;gap:14px">' +
          '<div style="font-size:12px;color:var(--text2);line-height:1.5;background:rgba(56,189,248,0.06);border:1px solid rgba(56,189,248,0.15);padding:10px 12px;border-radius:8px">' +
            '<i class="ti ti-info-circle" style="color:var(--accent);margin-right:4px"></i>' +
            'Sistem akan memantau fluktuasi harga secara real-time dan memberikan peringatan suara serta notifikasi browser instan saat target tercapai.' +
          '</div>' +

          '<div class="fgrid">' +
            '<div class="fg ffull">' +
              '<label class="flabel">Pilih Saham</label>' +
              '<select class="finput fsel" id="al-modal-ticker" onchange="mwOnAlertModalTickerChange(this.value)">' +
                optsHtml +
              '</select>' +
            '</div>' +

            '<div class="fg">' +
              '<label class="flabel">Harga Terkini</label>' +
              '<div id="al-modal-cur-price" style="font-size:14px;font-weight:800;font-family:var(--font-mono);color:#fff;padding:8px 10px;background:var(--bg3);border:1px solid var(--border);border-radius:6px">' +
                'Rp ' + curP.toLocaleString('id-ID') +
              '</div>' +
            '</div>' +

            '<div class="fg">' +
              '<label class="flabel">Kondisi Pemicu</label>' +
              '<select class="finput fsel" id="al-modal-cond" onchange="mwCalcAlertDistance()">' +
                '<option value="GTE"' + (cond==='GTE'?' selected':'') + '>≥ Target Atas (Resisten / Take Profit)</option>' +
                '<option value="LTE"' + (cond==='LTE'?' selected':'') + '>≤ Target Bawah (Support / Stop Loss)</option>' +
              '</select>' +
            '</div>' +

            '<div class="fg ffull">' +
              '<label class="flabel">Target Harga (Rp)</label>' +
              '<input class="finput" type="number" id="al-modal-target" value="' + targetP + '" step="5" oninput="mwCalcAlertDistance()">' +
              '<div style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap">' +
                '<button type="button" class="btn btn-ghost btn-xs" onclick="mwSetAlertPreset(1.03, \'GTE\', \'Take Profit\')">+3% (TP)</button>' +
                '<button type="button" class="btn btn-ghost btn-xs" onclick="mwSetAlertPreset(1.05, \'GTE\', \'Take Profit\')">+5% (TP)</button>' +
                '<button type="button" class="btn btn-ghost btn-xs" onclick="mwSetAlertPreset(1.10, \'GTE\', \'Take Profit\')">+10% (TP)</button>' +
                '<button type="button" class="btn btn-ghost btn-xs" onclick="mwSetAlertPreset(0.97, \'LTE\', \'Stop Loss\')">-3% (SL)</button>' +
                '<button type="button" class="btn btn-ghost btn-xs" onclick="mwSetAlertPreset(0.95, \'LTE\', \'Stop Loss\')">-5% (SL)</button>' +
                '<button type="button" class="btn btn-ghost btn-xs" onclick="mwSetAlertPreset(0.92, \'LTE\', \'Stop Loss\')">-8% (SL)</button>' +
              '</div>' +
            '</div>' +

            '<div class="fg">' +
              '<label class="flabel">Kategori / Tag</label>' +
              '<select class="finput fsel" id="al-modal-tag">' +
                '<option value="Take Profit"' + (tag==='Take Profit'?' selected':'') + '>Take Profit</option>' +
                '<option value="Stop Loss"' + (tag==='Stop Loss'?' selected':'') + '>Stop Loss / Cut Loss</option>' +
                '<option value="Buy on Weakness"' + (tag==='Buy on Weakness'?' selected':'') + '>Buy on Weakness (Support)</option>' +
                '<option value="Breakout Entry"' + (tag==='Breakout Entry'?' selected':'') + '>Breakout Resisten</option>' +
                '<option value="Price Milestone">Price Milestone / Acuan</option>' +
              '</select>' +
            '</div>' +

            '<div class="fg">' +
              '<label class="flabel">Estimasi Jarak ke Target</label>' +
              '<div id="al-modal-distance" style="font-size:12.5px;font-family:var(--font-mono);font-weight:700;color:var(--accent);padding:8px 10px;background:var(--bg3);border:1px solid var(--border);border-radius:6px">' +
                '—' +
              '</div>' +
            '</div>' +

            '<div class="fg ffull">' +
              '<label class="flabel">Catatan / Rencana Trading (Opsional)</label>' +
              '<input class="finput" type="text" id="al-modal-note" placeholder="Misal: Jual 50% lot jika kena target, atau pasang trailing stop">' +
            '</div>' +
          '</div>' +

          '<div style="display:flex;align-items:center;justify-content:space-between;padding-top:12px;border-top:1px solid var(--border);margin-top:4px">' +
            '<button type="button" class="btn btn-ghost" onclick="closeModal()">Batal</button>' +
            '<button type="button" class="btn btn-primary" onclick="mwSubmitPriceAlertFromModal()" style="display:flex;align-items:center;gap:6px">' +
              '<i class="ti ti-bell"></i> <span>Aktifkan Alert</span>' +
            '</button>' +
          '</div>' +
        '</div>';

      mwCalcAlertDistance();
    }

    modal.classList.add('open');
  };

  window.mwOnAlertModalTickerChange = function(ticker) {
    var curP = (window.prices && window.prices[ticker]) || (window.DB && window.DB[ticker] && window.DB[ticker].base) || 1000;
    var elCur = document.getElementById('al-modal-cur-price');
    if (elCur) elCur.textContent = 'Rp ' + curP.toLocaleString('id-ID');
    var elTarget = document.getElementById('al-modal-target');
    if (elTarget) elTarget.value = Math.round(curP * 1.05);
    mwCalcAlertDistance();
  };

  window.mwSetAlertPreset = function(multiplier, cond, tag) {
    var ticker = (document.getElementById('al-modal-ticker') && document.getElementById('al-modal-ticker').value) || 'BBCA';
    var curP = (window.prices && window.prices[ticker]) || (window.DB && window.DB[ticker] && window.DB[ticker].base) || 1000;
    var target = Math.round(curP * multiplier);

    var elTarget = document.getElementById('al-modal-target');
    if (elTarget) elTarget.value = target;

    var elCond = document.getElementById('al-modal-cond');
    if (elCond) elCond.value = cond;

    var elTag = document.getElementById('al-modal-tag');
    if (elTag) elTag.value = tag;

    mwCalcAlertDistance();
  };

  window.mwCalcAlertDistance = function() {
    var ticker = (document.getElementById('al-modal-ticker') && document.getElementById('al-modal-ticker').value) || 'BBCA';
    var curP = (window.prices && window.prices[ticker]) || (window.DB && window.DB[ticker] && window.DB[ticker].base) || 1000;
    var target = Number((document.getElementById('al-modal-target') && document.getElementById('al-modal-target').value) || curP);
    var elDist = document.getElementById('al-modal-distance');
    if (!elDist) return;

    var diff = target - curP;
    var pct = curP > 0 ? (diff / curP) * 100 : 0;
    var isUp = pct >= 0;

    elDist.innerHTML = 
      '<span style="color:' + (isUp ? 'var(--green)' : 'var(--red)') + '">' +
        (isUp ? '▲ +' : '▼ ') + pct.toFixed(2) + '% ' +
      '</span>' +
      '<span style="font-size:11px;color:var(--text3);font-weight:400"> (' + (diff >= 0 ? '+' : '') + 'Rp ' + diff.toLocaleString('id-ID') + ')</span>';
  };

  window.mwSubmitPriceAlertFromModal = function() {
    var ticker = document.getElementById('al-modal-ticker').value;
    var target = Number(document.getElementById('al-modal-target').value);
    var cond = document.getElementById('al-modal-cond').value;
    var tag = document.getElementById('al-modal-tag').value;
    var note = document.getElementById('al-modal-note').value;

    if (!target || target <= 0) {
      if (typeof showSaveStatus === 'function') showSaveStatus('⚠ Masukkan target harga yang valid', 'var(--red)');
      return;
    }

    var ok = mwAddPriceAlert({
      ticker: ticker,
      targetPrice: target,
      condition: cond,
      tag: tag,
      note: note
    });

    if (ok) {
      if (typeof closeModal === 'function') closeModal();
      // Prompt for browser notification permission if not yet decided
      if ('Notification' in window && Notification.permission === 'default') {
        setTimeout(function() {
          mwRequestNotificationPermission();
        }, 600);
      }
    }
  };

  // ── Render Dedicated Price Alerts Page (`#page-alerts`) ──
  var activeAlertTab = 'ALL';

  window.setAlertsFilterTab = function(tab) {
    activeAlertTab = tab;
    renderPriceAlertsPage();
  };

  window.renderPriceAlertsPage = function() {
    var page = document.getElementById('page-alerts');
    if (!page) return;

    var all = alertsList;
    var activeList = all.filter(function(a) { return a.status === 'ACTIVE'; });
    var triggeredList = all.filter(function(a) { return a.status === 'TRIGGERED'; });
    var pausedList = all.filter(function(a) { return a.status === 'PAUSED'; });

    var curPrices = window.prices || {};

    // Find closest active alert to target
    var closestAlert = null;
    var minDistance = Infinity;
    activeList.forEach(function(a) {
      var cp = curPrices[a.ticker] || (window.DB && window.DB[a.ticker] && window.DB[a.ticker].base) || a.initialPrice;
      var dist = Math.abs((a.targetPrice - cp) / cp * 100);
      if (dist < minDistance) {
        minDistance = dist;
        closestAlert = { item: a, curPrice: cp, dist: dist };
      }
    });

    var notifPerm = 'Notification' in window ? Notification.permission : 'unsupported';
    var permColor = notifPerm === 'granted' ? 'var(--green)' : notifPerm === 'denied' ? 'var(--red)' : 'var(--amber)';
    var permText = notifPerm === 'granted' ? 'Aktif (Diizinkan)' : notifPerm === 'denied' ? 'Ditolak di Browser' : 'Belum Diaktifkan';

    var filtered = all;
    if (activeAlertTab === 'ACTIVE') filtered = activeList;
    else if (activeAlertTab === 'TRIGGERED') filtered = triggeredList;
    else if (activeAlertTab === 'PAUSED') filtered = pausedList;

    var alertsHtml = '';
    if (filtered.length === 0) {
      alertsHtml = 
        '<div style="text-align:center;padding:48px 16px;background:var(--bg);border-radius:10px;border:1px dashed var(--border2);margin-top:12px">' +
          '<div style="font-size:32px;margin-bottom:8px">🔔</div>' +
          '<div style="font-size:15px;font-weight:700;color:#fff">Belum Ada Alert Harga ' + (activeAlertTab !== 'ALL' ? '(' + activeAlertTab + ')' : '') + '</div>' +
          '<div style="font-size:12px;color:var(--text3);max-width:400px;margin:6px auto 16px;line-height:1.5">' +
            'Buat alert harga untuk saham portofolio atau watchlist Anda agar mendapatkan notifikasi otomatis saat mencapai titik Take Profit atau Stop Loss.' +
          '</div>' +
          '<button class="btn btn-primary" onclick="openCreatePriceAlertModal()">' +
            '+ Pasang Alert Harga Baru' +
          '</button>' +
        '</div>';
    } else {
      alertsHtml = '<div style="display:flex;flex-direction:column;gap:10px;margin-top:12px">' +
        filtered.map(function(a) {
          var cp = curPrices[a.ticker] || (window.DB && window.DB[a.ticker] && window.DB[a.ticker].base) || a.initialPrice;
          var diff = a.targetPrice - cp;
          var pctDist = cp > 0 ? (diff / cp * 100) : 0;
          var isGte = a.condition === 'GTE';
          var isTriggered = a.status === 'TRIGGERED';
          var isPaused = a.status === 'PAUSED';

          var cardBg = isTriggered ? 'rgba(16,185,129,0.06)' : isPaused ? 'rgba(255,255,255,0.02)' : 'var(--bg2)';
          var cardBorder = isTriggered ? 'rgba(16,185,129,0.3)' : isPaused ? 'var(--border)' : 'var(--border2)';
          var tagColor = a.tag === 'Take Profit' || a.tag === 'Breakout Entry' ? 'var(--green)' : a.tag === 'Stop Loss' ? 'var(--red)' : 'var(--accent)';

          // Progress calculation
          var progressPct = 0;
          if (isGte) {
            var range = a.targetPrice - a.initialPrice;
            if (range > 0) progressPct = Math.min(100, Math.max(0, ((cp - a.initialPrice) / range) * 100));
          } else {
            var range = a.initialPrice - a.targetPrice;
            if (range > 0) progressPct = Math.min(100, Math.max(0, ((a.initialPrice - cp) / range) * 100));
          }
          if (isTriggered) progressPct = 100;

          return '<div style="background:' + cardBg + ';border:1px solid ' + cardBorder + ';border-radius:10px;padding:14px 16px;display:flex;flex-direction:column;gap:10px;transition:all .15s ease">' +
            '<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px">' +
              '<div style="display:flex;align-items:center;gap:12px">' +
                '<div style="width:36px;height:36px;border-radius:8px;background:' + (isTriggered ? 'rgba(16,185,129,0.15)' : 'rgba(255,255,255,0.05)') + ';display:flex;align-items:center;justify-content:center;font-size:18px;color:' + (isTriggered ? 'var(--green)' : isPaused ? 'var(--text3)' : 'var(--accent)') + '">' +
                  '<i class="ti ' + (isTriggered ? 'ti-check' : isPaused ? 'ti-player-pause' : 'ti-bell-ringing') + '"></i>' +
                '</div>' +
                '<div>' +
                  '<div style="display:flex;align-items:center;gap:8px">' +
                    '<span style="font-size:15px;font-weight:800;color:#fff;cursor:pointer" onclick="goStockIntelCockpit(\'' + a.ticker + '\')">' + a.ticker + '</span>' +
                    '<span class="badge" style="font-size:10px;background:' + tagColor + '18;color:' + tagColor + ';border:1px solid ' + tagColor + '33">' + a.tag + '</span>' +
                    (isTriggered ? '<span class="badge b-up" style="font-size:10px">✓ TARGET TERCAPAI</span>' : isPaused ? '<span class="badge b-neu" style="font-size:10px">DI-PAUSE</span>' : '<span class="badge b-accent" style="font-size:10px">MONITORING</span>') +
                  '</div>' +
                  '<div style="font-size:11px;color:var(--text3);margin-top:2px">' +
                    (window.DB && window.DB[a.ticker] ? window.DB[a.ticker].name + ' · ' + (window.DB[a.ticker].sector || '') : 'Emiten IDX') +
                  '</div>' +
                '</div>' +
              '</div>' +

              '<div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap">' +
                '<div style="text-align:right">' +
                  '<div style="font-size:10px;color:var(--text3);text-transform:uppercase;font-weight:700">Target Harga</div>' +
                  '<div style="font-size:14px;font-weight:800;color:#fff;font-family:var(--font-mono)">Rp ' + Number(a.targetPrice).toLocaleString('id-ID') + '</div>' +
                  '<div style="font-size:11px;color:' + (isGte ? 'var(--green)' : 'var(--red)') + '">' +
                    (isGte ? '≥ Target Atas' : '≤ Target Bawah') +
                  '</div>' +
                '</div>' +

                '<div style="text-align:right;min-width:100px">' +
                  '<div style="font-size:10px;color:var(--text3);text-transform:uppercase;font-weight:700">Harga Terkini</div>' +
                  '<div style="font-size:14px;font-weight:800;color:' + (isTriggered ? 'var(--green)' : 'var(--accent)') + ';font-family:var(--font-mono)">Rp ' + Number(cp).toLocaleString('id-ID') + '</div>' +
                  '<div style="font-size:11px;font-family:var(--font-mono);color:' + (pctDist >= 0 ? 'var(--green)' : 'var(--red)') + '">' +
                    (pctDist >= 0 ? '+' : '') + pctDist.toFixed(2) + '% lagi' +
                  '</div>' +
                '</div>' +

                '<div style="display:flex;align-items:center;gap:4px">' +
                  (isTriggered ? 
                    '<button class="btn btn-ghost btn-xs" onclick="mwResetTriggeredAlert(\'' + a.id + '\')" title="Reset ke status aktif" style="font-size:11px;color:var(--green);border-color:rgba(16,185,129,0.3)">🔄 Reset</button>' :
                    '<button class="btn btn-ghost btn-xs" onclick="mwTogglePauseAlert(\'' + a.id + '\')" title="' + (isPaused ? 'Aktifkan' : 'Pause') + '" style="font-size:11px">' + (isPaused ? '▶ Lanjutkan' : '⏸ Pause') + '</button>'
                  ) +
                  '<button class="btn btn-ghost btn-xs" onclick="openCreatePriceAlertModal(\'' + a.ticker + '\', ' + a.targetPrice + ', \'' + a.condition + '\', \'' + a.tag + '\')" title="Duplikasi / Edit" style="font-size:11px"><i class="ti ti-edit"></i></button>' +
                  '<button class="btn btn-ghost btn-xs" onclick="mwDeletePriceAlert(\'' + a.id + '\')" title="Hapus Alert" style="font-size:11px;color:var(--red)"><i class="ti ti-trash"></i></button>' +
                '</div>' +
              '</div>' +
            '</div>' +

            // Progress bar and Notes
            '<div style="background:var(--bg3);border-radius:6px;padding:8px 10px;display:flex;flex-direction:column;gap:6px">' +
              '<div style="display:flex;align-items:center;justify-content:space-between;font-size:10.5px;color:var(--text3)">' +
                '<span>Progres ke Target (' + progressPct.toFixed(0) + '%)</span>' +
                '<span>' + (isTriggered ? 'Tercapai pada: ' + new Date(a.triggeredAt).toLocaleTimeString('id-ID') : 'Dibuat: ' + new Date(a.createdAt).toLocaleDateString('id-ID')) + '</span>' +
              '</div>' +
              '<div style="width:100%;height:5px;background:var(--bg5);border-radius:3px;overflow:hidden">' +
                '<div style="height:100%;width:' + progressPct + '%;background:' + (isTriggered ? 'var(--green)' : 'var(--accent)') + ';transition:width .3s ease"></div>' +
              '</div>' +
              (a.note ? '<div style="font-size:11px;color:var(--text2);margin-top:2px"><i class="ti ti-notes" style="color:var(--accent);margin-right:4px"></i>' + a.note + '</div>' : '') +
            '</div>' +
          '</div>';
        }).join('') +
      '</div>';
    }

    page.innerHTML = 
      '<div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:12px;margin-bottom:16px">' +
        '<div>' +
          '<div class="ptitle" style="display:flex;align-items:center;gap:8px">' +
            '<span>🔔 Price Alert &amp; Target Monitoring Center</span>' +
            '<span class="badge b-accent" style="font-size:10px">REAL-TIME</span>' +
          '</div>' +
          '<div class="psub">Pasang peringatan target harga resistance (Take Profit) &amp; support (Stop Loss) otomatis dengan notifikasi browser dan sinyal audio chime.</div>' +
        '</div>' +
        '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">' +
          '<button class="btn btn-ghost btn-sm" onclick="mwToggleSoundEnabled()" style="display:flex;align-items:center;gap:6px">' +
            '<i class="ti ' + (isSoundEnabled ? 'ti-volume' : 'ti-volume-off') + '"></i>' +
            '<span>' + (isSoundEnabled ? 'Suara: Aktif' : 'Suara: Hening') + '</span>' +
          '</button>' +
          (notifPerm !== 'granted' ? 
            '<button class="btn btn-ghost btn-sm" onclick="mwRequestNotificationPermission()" style="border-color:rgba(245,158,11,0.4);color:var(--amber);display:flex;align-items:center;gap:6px">' +
              '<i class="ti ti-bell"></i> <span>Izinkan Notifikasi Web</span>' +
            '</button>' : ''
          ) +
          '<button class="btn btn-primary" onclick="openCreatePriceAlertModal()" style="display:flex;align-items:center;gap:6px">' +
            '<i class="ti ti-plus"></i> <span>+ Pasang Alert Baru</span>' +
          '</button>' +
        '</div>' +
      '</div>' +

      // Metric Summary Cards
      '<div class="grid4" style="margin-bottom:16px">' +
        '<div class="metric" style="background:var(--bg2)">' +
          '<div class="mlabel">Alert Aktif Dipantau</div>' +
          '<div class="mval" style="color:var(--accent)">' + activeList.length + ' Saham</div>' +
          '<div style="font-size:10.5px;color:var(--text3);margin-top:4px">Dipindai real-time pada tiap feed harga</div>' +
        '</div>' +

        '<div class="metric" style="background:var(--bg2)">' +
          '<div class="mlabel">Target Tercapai</div>' +
          '<div class="mval" style="color:' + (triggeredList.length > 0 ? 'var(--green)' : 'var(--text3)') + '">' + triggeredList.length + ' Alert</div>' +
          '<div style="font-size:10.5px;color:var(--text3);margin-top:4px">' +
            (triggeredList.length > 0 ? '<a href="javascript:void(0)" onclick="mwClearTriggeredAlerts()" style="color:var(--red);text-decoration:none">Bersihkan tercapai ↗</a>' : 'Belum ada pemicu baru') +
          '</div>' +
        '</div>' +

        '<div class="metric" style="background:var(--bg2)">' +
          '<div class="mlabel">Target Paling Dekat</div>' +
          '<div class="mval" style="color:var(--amber)">' +
            (closestAlert ? closestAlert.item.ticker + ' (' + closestAlert.dist.toFixed(1) + '%)' : '—') +
          '</div>' +
          '<div style="font-size:10.5px;color:var(--text3);margin-top:4px">' +
            (closestAlert ? 'Target: Rp ' + closestAlert.item.targetPrice.toLocaleString('id-ID') : 'Tidak ada antrean alert') +
          '</div>' +
        '</div>' +

        '<div class="metric" style="background:var(--bg2)">' +
          '<div class="mlabel">Notifikasi Browser Web</div>' +
          '<div class="mval" style="color:' + permColor + ';font-size:15px">' + permText + '</div>' +
          '<div style="font-size:10.5px;color:var(--text3);margin-top:4px">' +
            (notifPerm === 'granted' ? 'Native Web Notification On' : '<a href="javascript:void(0)" onclick="mwRequestNotificationPermission()" style="color:var(--accent);text-decoration:none">Klik untuk aktifkan ↗</a>') +
          '</div>' +
        '</div>' +
      '</div>' +

      // Main Card Container with Tabs
      '<div class="card">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;border-bottom:1px solid var(--border);padding-bottom:12px">' +
          '<div style="display:flex;align-items:center;gap:6px">' +
            '<button class="btn btn-ghost btn-sm ' + (activeAlertTab==='ALL'?'active':'') + '" onclick="setAlertsFilterTab(\'ALL\')" style="' + (activeAlertTab==='ALL'?'background:var(--bg3);color:var(--accent);font-weight:700':'') + '">Semua (' + all.length + ')</button>' +
            '<button class="btn btn-ghost btn-sm ' + (activeAlertTab==='ACTIVE'?'active':'') + '" onclick="setAlertsFilterTab(\'ACTIVE\')" style="' + (activeAlertTab==='ACTIVE'?'background:var(--bg3);color:var(--accent);font-weight:700':'') + '">Aktif (' + activeList.length + ')</button>' +
            '<button class="btn btn-ghost btn-sm ' + (activeAlertTab==='TRIGGERED'?'active':'') + '" onclick="setAlertsFilterTab(\'TRIGGERED\')" style="' + (activeAlertTab==='TRIGGERED'?'background:var(--bg3);color:var(--green);font-weight:700':'') + '">Tercapai (' + triggeredList.length + ')</button>' +
            '<button class="btn btn-ghost btn-sm ' + (activeAlertTab==='PAUSED'?'active':'') + '" onclick="setAlertsFilterTab(\'PAUSED\')" style="' + (activeAlertTab==='PAUSED'?'background:var(--bg3);color:var(--text2);font-weight:700':'') + '">Di-pause (' + pausedList.length + ')</button>' +
          '</div>' +

          '<div style="display:flex;align-items:center;gap:8px">' +
            '<button class="btn btn-ghost btn-xs" onclick="mwPlayAlertChime(\'up\')" title="Uji suara alert" style="font-size:11px">' +
              '🔊 Tes Bunyi' +
            '</button>' +
            '<button class="btn btn-ghost btn-xs" onclick="if(typeof fsGenAlerts===\'function\')fsGenAlerts();mwCheckPriceAlerts();showSaveStatus(\'✓ Alert diperbarui\');" style="font-size:11px">' +
              '🔄 Refresh Evaluasi' +
            '</button>' +
          '</div>' +
        '</div>' +

        alertsHtml +
      '</div>' +

      // Secondary Section: Smart Money & Technical Signal Radar (fsGenAlerts)
      '<div class="card" style="margin-top:16px">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">' +
          '<div>' +
            '<span class="ctitle">📡 Radar Sinyal Teknikal &amp; Aliran Dana (Smart Money)</span>' +
            '<div style="font-size:11px;color:var(--text3);margin-top:2px">Deteksi otomatis anomali volume, golden cross, dan akumulasi big player</div>' +
          '</div>' +
          '<button class="btn btn-ghost btn-xs" onclick="if(typeof fsGenAlerts===\'function\')fsGenAlerts()" style="font-size:11px">Scan Sinyal ↗</button>' +
        '</div>' +
        '<div id="al-list" style="display:flex;flex-direction:column;gap:7px">' +
          '<div style="color:var(--text3);text-align:center;padding:16px;font-size:12px">Memuat analisis sinyal otomatis...</div>' +
        '</div>' +
      '</div>';

    // Trigger secondary signal scanner if exists
    if (typeof fsGenAlerts === 'function') {
      setTimeout(fsGenAlerts, 50);
    }
  };

  // ── Initialize Topbar Bell Button & Hook into Lifecycle ──
  function initPriceAlertUI() {
    loadAlerts();

    // 1. Injeksi Bell Alert Icon di Topbar
    var topbarRight = document.querySelector('.topbar-right');
    if (topbarRight && !document.getElementById('tb-alert-btn')) {
      var alertBtn = document.createElement('button');
      alertBtn.id = 'tb-alert-btn';
      alertBtn.className = 'btn btn-ghost btn-xs';
      alertBtn.style.cssText = 'position:relative;display:flex;align-items:center;gap:4px;font-size:11px;border-color:var(--border2);color:var(--text2);padding:4px 8px;';
      alertBtn.title = 'Price Alerts & Target Monitor';
      alertBtn.innerHTML = 
        '<i class="ti ti-bell" style="font-size:14px;color:var(--amber)"></i>' +
        '<span id="tb-alert-badge" class="tb-alert-badge" style="display:none">0</span>';
      alertBtn.onclick = function() {
        if (typeof goPage === 'function') goPage('alerts');
      };
      topbarRight.insertBefore(alertBtn, topbarRight.firstChild);
    }

    // 2. Injeksi Navigasi Sidebar jika belum ada
    var sideNavScroll = document.getElementById('side-nav-scroll');
    var existingSideBtn = document.getElementById('side-btn-alerts') || document.querySelector('button[onclick*="goPage(\'alerts\'"]');
    if (sideNavScroll && !existingSideBtn) {
      var marketGroup = document.querySelector('.side-group[data-group="market"] .side-group-items');
      if (marketGroup) {
        var btn = document.createElement('button');
        btn.id = 'side-btn-alerts';
        btn.innerHTML = '<i class="ti ti-bell" style="color:var(--amber)"></i><span class="side-label">Price Alerts &amp; Targets</span><span id="side-alert-badge" class="badge b-accent" style="margin-left:auto;font-size:8px;padding:1px 5px;display:none">0</span>';
        btn.onclick = function() { goPage('alerts', this); };
        marketGroup.insertBefore(btn, marketGroup.firstChild);
      }
    }

    updateAlertBadgeUI();

    // Periodic background evaluation of price alerts every 10 seconds
    setInterval(function() {
      mwCheckPriceAlerts();
    }, 10000);
  }

  // Run on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPriceAlertUI);
  } else {
    initPriceAlertUI();
  }

  // Hook into router for page 'alerts'
  var _origRenderPage = window.renderPage;
  window.renderPage = function(name) {
    if (typeof _origRenderPage === 'function') {
      _origRenderPage.apply(this, arguments);
    }
    if (name === 'alerts') {
      renderPriceAlertsPage();
    }
  };

  // Helper helper to jump to stock cockpit
  window.goStockIntelCockpit = function(ticker) {
    if (typeof openStockIntelCockpit === 'function') {
      openStockIntelCockpit(ticker);
    } else if (typeof goPage === 'function') {
      goPage('stock-intel');
    }
  };

})();
