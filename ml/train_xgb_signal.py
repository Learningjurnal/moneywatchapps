"""
Money Watch Pro — Training XGBoost Signal Model
==================================================
Melatih model XGBoost untuk memprediksi probabilitas "sinyal BUY yang bagus"
-- didefinisikan sebagai TP1 tersentuh SEBELUM Stop Loss, memakai formula
ATR SL/TP yang SAMA PERSIS dengan computeStockSignal() produksi
(lib/idx-data-engine.js: sl=price-ATR*1.5, tp1=price+ATR*2.5), bukan lagi
sekadar "harga naik >3% dalam 10 hari" yang tidak peduli risiko -- dari
fitur teknikal harian saham IDX, lalu mengekspornya ke ONNX supaya bisa
dijalankan LANGSUNG di browser
(lihat js/11-quant.js, fungsi xgbLoadModel/xgbPredict) — tanpa server Python
yang harus menyala terus-menerus.

Cara pakai:
    python -m venv .mlvenv
    .mlvenv\\Scripts\\activate          (Windows)   atau   source .mlvenv/bin/activate (Mac/Linux)
    pip install -r ml/requirements.txt
    python ml/train_xgb_signal.py

Hasil (path selalu dihitung relatif terhadap lokasi skrip ini, jadi aman
dijalankan dari direktori mana pun — repo root atau dari dalam ml/):
    public/models/xgb_signal.onnx        — model terlatih, siap dipakai browser
    public/models/xgb_signal_meta.json   — urutan fitur, threshold sinyal, metrik training

PENTING: fitur di sini (lihat FEATURE_NAMES) harus identik urutan & rumusnya
dengan fungsi xgbComputeFeatures() di js/11-quant.js. Kalau Anda mengubah
salah satu, ubah juga yang satunya.

Jalankan ulang skrip ini secara berkala (mis. tiap bulan) dengan data
terbaru, lalu commit ulang public/models/xgb_signal.onnx supaya model tetap
relevan — atau biarkan workflow terjadwal (.github/workflows/retrain-model.yml)
melakukannya otomatis tiap bulan.
Ini BUKAN rekomendasi investasi — signal murni hasil model statistik.
"""
import json
import os
import sys
import warnings
from datetime import datetime

# Windows console default (cp1252) can't print unicode checkmarks — force UTF-8.
if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8")

import numpy as np
import pandas as pd
import yfinance as yf
from sklearn.metrics import accuracy_score, classification_report, roc_auc_score
from xgboost import XGBClassifier
from onnxmltools.convert import convert_xgboost
from onnxmltools.convert.common.data_types import FloatTensorType

warnings.filterwarnings("ignore")

# ── Konfigurasi ──────────────────────────────────────────────────────────
TICKERS = [
    "BBCA.JK", "BBRI.JK", "BMRI.JK", "BBNI.JK", "TLKM.JK", "ASII.JK",
    "UNVR.JK", "ICBP.JK", "INDF.JK", "KLBF.JK", "ADRO.JK", "ANTM.JK",
    "PGAS.JK", "SMGR.JK", "GOTO.JK", "MDKA.JK", "INCO.JK", "CPIN.JK",
    "EXCL.JK", "JSMR.JK",
]
PERIOD = "5y"            # rentang data historis
TEST_FRACTION = 0.2       # 20% terakhir (per ticker, berurutan waktu) untuk test

# THRESHOLD BUY/SELL: dikalibrasi dari PERSENTIL distribusi probabilitas
# model itu sendiri di test set, BUKAN lagi angka absolut tetap (0.60/0.35).
#
# Kenapa: retrain 2026-09-11 dengan label SL/TP-aware (lihat
# compute_sl_tp_label() di bawah) menghasilkan model dengan recall kelas
# BUY cuma 3.1% pada threshold default 0.5 -- artinya probabilitas
# prediksi model nyaris TIDAK PERNAH menembus 0.60, dan backtest user
# menghasilkan 0 sinyal sepanjang 2 tahun untuk BBCA. Target SL/TP-aware
# ini jauh lebih sulit ditebak daripada target arah-harga sederhana
# sebelumnya, jadi skala probabilitas mentah model tidak lagi berarti
# "60% = yakin" seperti asumsi threshold absolut lama.
#
# Solusi: ambil ambang dari PERSENTIL keluaran model sendiri di test set
# -- BUY_PERCENTILE tertinggi (paling yakin versi model, apa pun skala
# absolutnya) dan SELL_PERCENTILE terendah. Ini menjamin model SELALU
# menghasilkan sinyal pada kasus-kasus paling meyakinkan menurut dirinya
# sendiri, tapi TIDAK menjamin sinyal itu akurat -- lihat print
# diagnostik "precision pada threshold ini vs base rate" di main() untuk
# itu. Kalau precision di titik itu tidak jauh dari base rate, artinya
# model memang tidak punya sinyal nyata (bukan cuma soal kalibrasi
# threshold) -- root cause-nya di fitur/model, bukan angka threshold.
BUY_PERCENTILE = 80       # top 20% probabilitas tertinggi -> sinyal BUY
SELL_PERCENTILE = 20      # bottom 20% probabilitas terendah -> sinyal AVOID/SELL

# LABEL: sinkron dengan SL/TP1 riil yang dipakai computeStockSignal() di
# lib/idx-data-engine.js (2026-09-11 fix) -- BUKAN lagi "naik >3% dalam 10
# hari" generik yang tidak peduli risiko sama sekali. sl_mult/tp_mult HARUS
# sama persis dengan `sl = price - atr*1.5` / `tp1 = price + atr*2.5` di
# sana; kalau App mengubah pengali itu, ubah juga MAX_HOLD_DAYS/SL_ATR_MULT/
# TP_ATR_MULT di bawah supaya label training tetap merepresentasikan trade
# yang benar-benar akan dieksekusi sistem.
SL_ATR_MULT = 1.5
TP_ATR_MULT = 2.5
ATR_PERIOD = 14           # sama dengan computeATR(points, 14) di JS
MAX_HOLD_DAYS = 20        # horizon maksimum menunggu TP/SL tersentuh (hari bursa)

FEATURE_NAMES = [
    "sma_ratio", "rsi14", "mom20", "vol_ratio", "volatility20", "dist_high20",
    "atr_pct", "ema20_slope5", "dist_ema20", "atr_ratio_20",
]

# FIX: harus resolve ke public/models/ (tempat sebenarnya index.html memuat
# file ini via fetch('models/...') relatif terhadap public/) dan tidak
# tergantung dari direktori mana skrip ini dijalankan — sebelumnya ini
# hardcode "models/..." relatif ke cwd, yang menulis ke ml/models/ (kalau
# dijalankan dari dalam ml/, sesuai instruksi README) atau ./models/ di
# root repo (kalau dijalankan sebagai `python ml/train_xgb_signal.py` sesuai
# docstring di atas) — DUA-DUANYA salah, bukan public/models/ yang sebenarnya
# dibaca browser. File model yang ada sekarang di public/models/ hanya bisa
# sampai di sana lewat penempatan manual terpisah, bukan dari skrip ini.
_SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
_REPO_ROOT = os.path.dirname(_SCRIPT_DIR)
MODEL_PATH = os.path.join(_REPO_ROOT, "public", "models", "xgb_signal.onnx")
META_PATH = os.path.join(_REPO_ROOT, "public", "models", "xgb_signal_meta.json")


# ── ATR (harus sama persis dengan computeATR() di lib/idx-data-engine.js:
# rata-rata SEDERHANA True Range 14 hari, BUKAN Wilder's smoothing) ────────
def compute_atr(df, period=ATR_PERIOD):
    high, low, close = df["High"], df["Low"], df["Close"]
    prev_close = close.shift(1)
    tr = pd.concat([
        high - low,
        (high - prev_close).abs(),
        (low - prev_close).abs(),
    ], axis=1).max(axis=1)
    return tr.rolling(period).mean()


# EMA_LOOKBACK: jendela tetap (BUKAN rekursi dari seluruh histori yang
# tersedia) untuk menghitung EMA di setiap baris -- meniru PERSIS pola
# computeEMA(closes.slice(-40), 20) yang sudah dipakai di
# lib/idx-data-engine.js. Kalau EMA direkursi dari histori penuh, nilainya
# akan berbeda antara training (histori 5 tahun) dan inferensi live di
# browser (mungkin cuma dapat histori 1 tahun untuk rentang backtest
# pendek) untuk TANGGAL YANG SAMA -- train/serve skew yang tidak pernah
# muncul sebagai error, cuma diam-diam merusak akurasi model. Jendela
# tetap menghilangkan ketergantungan pada panjang histori yang kebetulan
# tersedia.
EMA_LOOKBACK = 60


def compute_ema_windowed(close_series, period=20, lookback=EMA_LOOKBACK):
    vals = close_series.to_numpy()
    n = len(vals)
    out = np.full(n, np.nan)
    k = 2.0 / (period + 1)
    for i in range(lookback - 1, n):
        window = vals[i - lookback + 1:i + 1]
        ema = window[0]
        for v in window[1:]:
            ema = v * k + ema * (1 - k)
        out[i] = ema
    return pd.Series(out, index=close_series.index)


# ── Feature engineering (harus sama persis dengan versi JS) ────────────────
def compute_features(df):
    close = df["Close"]
    high = df["High"]
    volume = df["Volume"]

    sma10 = close.rolling(10).mean()
    sma30 = close.rolling(30).mean()
    sma_ratio = sma10 / sma30 - 1

    delta = close.diff()
    gain = delta.clip(lower=0).rolling(14).mean()
    loss = (-delta.clip(upper=0)).rolling(14).mean()
    rs = gain / loss.replace(0, np.nan)
    rsi14 = (100 - 100 / (1 + rs)) / 100

    mom20 = close.pct_change(20)

    vol_sma20 = volume.rolling(20).mean()
    vol_ratio = volume / vol_sma20.replace(0, np.nan)

    daily_ret = close.pct_change()
    volatility20 = daily_ret.rolling(20).std()

    high20 = high.rolling(20).max()
    dist_high20 = (close - high20) / high20

    # ── Fitur baru (2026-09-11, Opsi C): relevan ke path-dependency SL/TP
    # yang tidak ditangkap 6 fitur di atas (semuanya soal arah/momentum
    # harga, tidak ada yang menangkap REZIM VOLATILITAS terhadap SL/TP
    # yang justru ATR-scaled). Ditambahkan setelah retrain dengan label
    # SL/TP-aware menunjukkan lift cuma 1.09x vs base rate (AUC 0.522,
    # nyaris tebak acak) -- indikasi kuat 6 fitur lama tidak cukup.
    atr = compute_atr(df)
    ema20w = compute_ema_windowed(close, period=20, lookback=EMA_LOOKBACK)

    # atr_pct: volatilitas RELATIF terhadap harga -- SL/TP dihitung
    # ATR*1.5/2.5, jadi seberapa besar ATR dibanding harga langsung
    # mempengaruhi seberapa "jauh" target itu secara persentase.
    atr_pct = atr / close

    # ema20_slope5: percepatan tren jangka pendek dari garis rata-rata
    # (lebih halus dari mom20 mentah karena EMA sudah menyaring noise
    # harian).
    ema20_slope5 = (ema20w - ema20w.shift(5)) / ema20w.shift(5)

    # dist_ema20: seberapa jauh harga "meregang" dari rata-rata bergerak
    # -- sinyal mean-reversion vs trend-continuation.
    dist_ema20 = (close - ema20w) / ema20w

    # atr_ratio_20: apakah volatilitas sedang MELEBAR atau MENYEMPIT
    # dibanding 20 hari lalu -- rezim volatilitas yang berubah punya
    # implikasi langsung ke kecepatan harga menyentuh TP/SL yang
    # ATR-scaled itu sendiri.
    atr_ratio_20 = atr / atr.shift(20) - 1

    feats = pd.DataFrame({
        "sma_ratio": sma_ratio,
        "rsi14": rsi14,
        "mom20": mom20,
        "vol_ratio": vol_ratio,
        "volatility20": volatility20,
        "dist_high20": dist_high20,
        "atr_pct": atr_pct,
        "ema20_slope5": ema20_slope5,
        "dist_ema20": dist_ema20,
        "atr_ratio_20": atr_ratio_20,
    })
    return feats


# ── Label SL/TP-aware: 1 kalau TP1 tersentuh SEBELUM SL dalam
# MAX_HOLD_DAYS hari bursa ke depan, 0 kalau SL tersentuh duluan (atau di
# hari yang sama dengan TP -- diasumsikan SL duluan, skenario konservatif
# karena urutan intraday tidak diketahui dari data harian), NaN (baris
# dibuang) kalau KEDUANYA belum tersentuh sampai akhir horizon -- outcome
# belum diketahui, bukan otomatis "gagal" (lihat INV-011 di build_dataset()
# untuk alasan yang sama kenapa NaN tidak boleh diam-diam jadi 0).
#
# Ini menggantikan label lama "harga naik >3% dalam 10 hari" yang sama
# sekali tidak peduli risiko (SL) -- model lama bisa saja "benar" soal arah
# harga naik tapi tetap kena stop out duluan sebelum sempat naik.
def compute_sl_tp_label(df):
    close = df["Close"].to_numpy()
    high = df["High"].to_numpy()
    low = df["Low"].to_numpy()
    atr = compute_atr(df).to_numpy()

    n = len(df)
    label = np.full(n, np.nan)

    for i in range(n):
        entry = close[i]
        a = atr[i]
        if not np.isfinite(entry) or not np.isfinite(a) or a <= 0:
            continue  # ATR belum bisa dihitung (14 hari pertama) -- baris dibuang lewat dropna()

        sl = entry - a * SL_ATR_MULT
        tp1 = entry + a * TP_ATR_MULT

        end = min(i + 1 + MAX_HOLD_DAYS, n)
        for j in range(i + 1, end):
            hit_tp = high[j] >= tp1
            hit_sl = low[j] <= sl
            if hit_tp and hit_sl:
                label[i] = 0  # ambigu di hari yang sama -- konservatif, anggap SL duluan
                break
            elif hit_tp:
                label[i] = 1
                break
            elif hit_sl:
                label[i] = 0
                break
        # tidak ada break sampai `end` -> label[i] tetap NaN (belum diketahui, dibuang)

    return pd.Series(label, index=df.index)


def build_dataset():
    all_X, all_y = [], []
    used_tickers = []
    for tk in TICKERS:
        try:
            df = yf.download(tk, period=PERIOD, progress=False, auto_adjust=True)
        except Exception as e:
            print(f"  ! gagal mengambil {tk}: {e}")
            continue
        if df is None or len(df) < 100:
            print(f"  ! data {tk} terlalu sedikit, dilewati")
            continue
        if isinstance(df.columns, pd.MultiIndex):
            df.columns = df.columns.get_level_values(0)

        feats = compute_features(df)
        # INV-011 (audit, masih berlaku): baris yang outcome-nya belum
        # diketahui (ATR belum bisa dihitung, ATAU TP/SL belum tersentuh
        # sampai akhir MAX_HOLD_DAYS) harus dibuang lewat dropna() SEBELUM
        # dibinarisasi -- bukan diam-diam jadi label 0 seperti bug lama.
        # compute_sl_tp_label() sudah mengembalikan NaN untuk kasus itu,
        # bukan hasil biner, persis untuk menghindari pengulangan bug INV-011.
        sl_tp_label = compute_sl_tp_label(df)

        data = feats.copy()
        data["label_raw"] = sl_tp_label
        data = data.dropna()
        if len(data) < 50:
            print(f"  ! {tk}: baris valid terlalu sedikit setelah dropna, dilewati")
            continue
        data["label"] = data["label_raw"].astype(int)
        data = data.drop(columns=["label_raw"])
        label = data["label"]

        # split waktu per-ticker supaya tidak ada kebocoran antar periode
        split = int(len(data) * (1 - TEST_FRACTION))
        data["is_test"] = False
        data.iloc[split:, data.columns.get_loc("is_test")] = True

        all_X.append(data)
        used_tickers.append(tk)
        print(f"  ✓ {tk}: {len(data)} baris, {label.sum()} label positif ({label.mean()*100:.1f}%)")

    if not all_X:
        raise RuntimeError("Tidak ada data yang berhasil diambil — cek koneksi internet / ticker.")

    full = pd.concat(all_X, ignore_index=True)
    return full, used_tickers


def main():
    print(f"[{datetime.now().isoformat()}] Mengambil data {len(TICKERS)} ticker (periode {PERIOD})...")
    data, used_tickers = build_dataset()

    train = data[~data["is_test"]]
    test = data[data["is_test"]]
    # .to_numpy() supaya XGBoost menyimpan nama fitur default f0/f1/... —
    # dibutuhkan onnxmltools untuk konversi (tidak bisa parse nama kolom pandas).
    X_train, y_train = train[FEATURE_NAMES].to_numpy(dtype=np.float32), train["label"]
    X_test, y_test = test[FEATURE_NAMES].to_numpy(dtype=np.float32), test["label"]

    print(f"\nTrain: {len(X_train)} baris · Test: {len(X_test)} baris")
    print(f"Label positif — train: {y_train.mean()*100:.1f}% · test: {y_test.mean()*100:.1f}%")

    model = XGBClassifier(
        n_estimators=200,
        max_depth=4,
        learning_rate=0.05,
        subsample=0.8,
        colsample_bytree=0.8,
        eval_metric="logloss",
        random_state=42,
    )
    model.fit(X_train, y_train)

    pred = model.predict(X_test)
    proba = model.predict_proba(X_test)[:, 1]
    acc = accuracy_score(y_test, pred)
    try:
        auc = roc_auc_score(y_test, proba)
    except ValueError:
        auc = float("nan")

    print("\n── Evaluasi (test set, time-based split) ──")
    print(f"Accuracy : {acc:.3f}")
    print(f"ROC AUC  : {auc:.3f}")
    print(classification_report(y_test, pred, digits=3))

    importance = dict(zip(FEATURE_NAMES, model.feature_importances_.tolist()))
    print("Feature importance:", json.dumps(importance, indent=2))

    # ── Kalibrasi threshold BUY/SELL dari persentil (lihat catatan
    # BUY_PERCENTILE/SELL_PERCENTILE di atas) + diagnostik jujur: apakah
    # sinyal di titik ini benar-benar lebih baik dari base rate, atau
    # model cuma "menyerah" ke kelas mayoritas dan persentil ini tidak
    # menyaring apa pun yang berarti.
    base_rate = float(y_test.mean())
    buy_threshold = float(np.percentile(proba, BUY_PERCENTILE))
    sell_threshold = float(np.percentile(proba, SELL_PERCENTILE))

    buy_mask = proba >= buy_threshold
    n_buy = int(buy_mask.sum())
    buy_precision = float(y_test.to_numpy()[buy_mask].mean()) if n_buy > 0 else float("nan")
    lift = (buy_precision / base_rate) if (n_buy > 0 and base_rate > 0) else float("nan")

    print(f"\n── Kalibrasi Threshold (persentil ke-{BUY_PERCENTILE}/{SELL_PERCENTILE}) ──")
    print(f"Base rate label positif di test set : {base_rate*100:.1f}%")
    print(f"BUY threshold (persentil {BUY_PERCENTILE})  : {buy_threshold:.4f} -> {n_buy}/{len(proba)} baris test terpicu BUY")
    print(f"Precision pada threshold ini          : {buy_precision*100:.1f}%" if n_buy > 0 else "Precision pada threshold ini          : N/A (0 baris terpicu)")
    if n_buy > 0:
        print(f"Lift vs base rate                     : {lift:.2f}x" + (" -- model TIDAK menambah nilai nyata di titik ini, cuma kalibrasi threshold, bukan solusi." if lift < 1.15 else " -- ada sinyal nyata di atas base rate."))
    print(f"SELL threshold (persentil {SELL_PERCENTILE}) : {sell_threshold:.4f}")

    # ── Ekspor ke ONNX (zipmap=False -> output tensor float polos, gampang dibaca JS) ──
    onnx_model = convert_xgboost(
        model,
        initial_types=[("input", FloatTensorType([None, len(FEATURE_NAMES)]))],
    )
    os.makedirs(os.path.dirname(MODEL_PATH), exist_ok=True)
    with open(MODEL_PATH, "wb") as f:
        f.write(onnx_model.SerializeToString())
    print(f"\n✓ Model ONNX disimpan: {MODEL_PATH}")

    meta = {
        "version": datetime.now().strftime("%Y%m%d"),
        "trained_at": datetime.now().isoformat(),
        "feature_names": FEATURE_NAMES,
        "label_definition": "TP1 tersentuh sebelum SL (ATR-based, sinkron dengan computeStockSignal())",
        "sl_atr_mult": SL_ATR_MULT,
        "tp_atr_mult": TP_ATR_MULT,
        "atr_period": ATR_PERIOD,
        "max_hold_days": MAX_HOLD_DAYS,
        "buy_threshold": buy_threshold,
        "sell_threshold": sell_threshold,
        "buy_percentile": BUY_PERCENTILE,
        "sell_percentile": SELL_PERCENTILE,
        "base_rate": base_rate,
        "buy_precision_at_threshold": buy_precision if n_buy > 0 else None,
        "buy_signal_rate_test": n_buy / len(proba) if len(proba) > 0 else None,
        "tickers_used": used_tickers,
        "n_train": int(len(X_train)),
        "n_test": int(len(X_test)),
        "test_accuracy": float(acc),
        "test_roc_auc": float(auc) if auc == auc else None,  # NaN check
        "feature_importance": importance,
        "disclaimer": "Model statistik untuk edukasi/backtesting — bukan rekomendasi investasi.",
    }
    with open(META_PATH, "w", encoding="utf-8") as f:
        json.dump(meta, f, indent=2, ensure_ascii=False)
    print(f"✓ Metadata disimpan: {META_PATH}")
    print("\nSelesai. Commit public/models/xgb_signal.onnx dan public/models/xgb_signal_meta.json ke repo,")
    print("lalu reload aplikasi — Backtester akan otomatis memakai model ini untuk strategi XGBoost.")


if __name__ == "__main__":
    main()
