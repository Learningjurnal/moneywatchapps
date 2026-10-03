// Data pengguna yang sebelumnya hanya ada di localStorage (watchlist, workspace & histori Harga Wajar, bobot Stock Dossier,
// pengaturan FIRE/pajak, histori net worth) ikut disimpan ke Supabase lewat payload user_data (field `userExtras`).
// Tiap key membawa timestamp sendiri: yang lebih baru menang, jadi satu perangkat tidak menimpa edit terbaru perangkat lain.
var MW_EXTRAS_KEYS = {
  watchlist: 'moneywatch_watchlist',
  hwState: 'hw_state',
  hwHistory: 'hw_history',
  dossierWeights: 'mw_dossier_weights_v1',
  settings: 'mw_settings_v6',
  netWorthHistory: 'mw_wealth_networth_hist_v1'
};
var MW_EXTRAS_TS_KEY = 'mw_user_extras_ts_v1';
var MW_EXTRAS_EPOCH = '1970-01-01T00:00:00.000Z';

function _mwExtrasRead(name) {
  try {
    var raw = localStorage.getItem(MW_EXTRAS_KEYS[name]);
    return raw == null ? null : JSON.parse(raw);
  } catch (e) { return null; }
}

function _mwExtrasTimes() {
  try { return JSON.parse(localStorage.getItem(MW_EXTRAS_TS_KEY) || '{}') || {}; } catch (e) { return {}; }
}

function _mwExtrasSaveTimes(times) {
  try { localStorage.setItem(MW_EXTRAS_TS_KEY, JSON.stringify(times)); } catch (e) { /* kuota penuh: data tetap ada, hanya timestamp yang tertinggal */ }
}

function mwExtrasTouch(name) {
  var times = _mwExtrasTimes();
  times[name] = new Date().toISOString();
  _mwExtrasSaveTimes(times);
}

// Data lama yang belum pernah diberi timestamp dianggap paling tua, supaya tidak pernah menimpa data yang sudah ada di cloud.
function mwExtrasCollect() {
  var times = _mwExtrasTimes();
  var out = {};
  Object.keys(MW_EXTRAS_KEYS).forEach(function (name) {
    var value = _mwExtrasRead(name);
    if (value == null && !times[name]) return;
    out[name] = { v: value, t: times[name] || MW_EXTRAS_EPOCH };
  });
  return out;
}

function _mwExtrasMergeByDate(localArr, cloudArr, cloudIsNewer) {
  var byDate = {};
  var order = cloudIsNewer ? [localArr, cloudArr] : [cloudArr, localArr];
  order.forEach(function (arr) {
    (Array.isArray(arr) ? arr : []).forEach(function (row) {
      if (row && row.date) byDate[row.date] = row;
    });
  });
  return Object.keys(byDate).sort().map(function (d) { return byDate[d]; });
}

// Mengembalikan { applied: [...], pushNeeded: bool }: pushNeeded = ada data lokal yang lebih baru atau belum ada di cloud.
function mwExtrasApply(cloudExtras) {
  var result = { applied: [], pushNeeded: false };
  var cloud = (cloudExtras && typeof cloudExtras === 'object') ? cloudExtras : {};
  var times = _mwExtrasTimes();
  Object.keys(MW_EXTRAS_KEYS).forEach(function (name) {
    var localValue = _mwExtrasRead(name);
    var hasLocal = localValue != null || !!times[name];
    var localT = times[name] || MW_EXTRAS_EPOCH;
    var entry = cloud[name];
    if (!entry) {
      if (hasLocal) result.pushNeeded = true;
      return;
    }
    var cloudT = entry.t || MW_EXTRAS_EPOCH;
    if (name === 'netWorthHistory' && Array.isArray(localValue) && Array.isArray(entry.v)) {
      var merged = _mwExtrasMergeByDate(localValue, entry.v, cloudT > localT);
      try {
        if (JSON.stringify(merged) !== JSON.stringify(localValue)) {
          localStorage.setItem(MW_EXTRAS_KEYS[name], JSON.stringify(merged));
          result.applied.push(name);
        }
        times[name] = cloudT > localT ? cloudT : localT;
      } catch (e) { /* kuota penuh: biarkan nilai lokal */ }
      if (JSON.stringify(merged) !== JSON.stringify(entry.v)) result.pushNeeded = true;
      return;
    }
    if (hasLocal && localT >= cloudT) {
      if (localT > cloudT) result.pushNeeded = true;
      return;
    }
    try {
      var next = entry.v;
      if (next == null) localStorage.removeItem(MW_EXTRAS_KEYS[name]);
      else localStorage.setItem(MW_EXTRAS_KEYS[name], JSON.stringify(next));
      times[name] = cloudT;
      result.applied.push(name);
    } catch (e) { /* kuota penuh: biarkan nilai lokal, sync berikutnya mencoba lagi */ }
  });
  _mwExtrasSaveTimes(times);
  if (result.applied.indexOf('settings') >= 0 && window.MW_SETTINGS && typeof window.MW_SETTINGS.loadSettings === 'function') {
    try { window.MW_SETTINGS.loadSettings(); } catch (e) { /* tampilan memuat ulang dari localStorage di render berikutnya */ }
  }
  return result;
}

window.mwExtrasTouch = mwExtrasTouch;
window.mwExtrasCollect = mwExtrasCollect;
window.mwExtrasApply = mwExtrasApply;
