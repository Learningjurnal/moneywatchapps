# DESIGN.md — MoneyWatch Pro Design System v7.0
> **Institutional Precision, Quiet Elegance, and Quantitative Clarity**  
> *Versi 7.0 — Diperbarui 2026-11-09*

---

## 1. Filosofi Desain (Design Philosophy)

MoneyWatch Pro adalah terminal analitik dan manajemen aset kuantitatif untuk Bursa Efek Indonesia (IDX). Aplikasi ini dirancang untuk **analis profesional, investor institusi, dan trader data-driven**.

### Tiga Pilar Utama:
1. **Quiet Luxury & Restraint (Tidak Banyak Warna)**:
   - Menghindari visual bising ala aplikasi ritel/crypto (tanpa neon berlebihan, tanpa gradient warna-warni pelangi).
   - Palet warna terkendali: basis monokromatik gelap berkelas (*Obsidian / Deep Slate*) dengan satu aksen presisi (*Precision Cobalt Blue*) dan warna semantik murni (*Finance Green & Red*).
2. **Keterbacaan & Kepadatan Tinggi (High Information Density)**:
   - Data numerik disajikan secara padat, tegas, dan sejajar sempurna (*tabular-nums*).
   - Pengelompokan kartu terpadu (*Zero Fragmentation*): informasi terkait berada dalam satu kontainer dengan hierarki visual yang jelas.
3. **Integritas & Kejujuran Data (Data Provenance & Honesty)**:
   - Desain tidak pernah memalsukan atau mengaburkan kualitas data.
   - Sinyal simulasi atau data perkiraan selalu diberi tanda visual yang jujur (*Amber Disclosure Tag*).

---

## 2. Sistem Warna (Color Architecture)

Palet warna disederhanakan secara disiplin menjadi **3 lapisan visual**:
1. **Lapisan Netral Monokromatik (Surfaces & Typography)**
2. **Lapisan Aksen Primer Tunggal (Brand & Interactive)**
3. **Lapisan Semantik Pasar (Khusus Data Finansial)**

### A. Palet Tema Gelap (Dark Mode — Obsidian Slate)
| Token CSS | Nilai Hex / RGBA | Peruntukan & Karakter |
|---|---|---|
| `--bg` | `#080A0F` | Kanvas latar belakang utama (deep obsidian, bebas pantulan lelah mata) |
| `--bg2` | `#0F131D` | Kontainer kartu tingkat 1 (`.card`), panel samping, dan topbar |
| `--bg3` | `#161B28` | Sub-panel internal, input field, baris header tabel, badge netral |
| `--bg4` | `#1E2536` | State hover kartu, modal backdrop, tombol sekunder |
| `--bg5` | `#2A3348` | Garis seleksi aktif, highlight baris tabel |
| `--text` | `#F8FAFC` | Teks utama, judul, angka penting (Slate 50 — kontras tinggi 14:1) |
| `--text2` | `#CBD5E1` | Teks sekunder, label formulir, keterangan metrik (Slate 300) |
| `--text3` | `#64748B` | Teks pendukung, unit ukuran, placeholder, timestamp (Slate 500) |
| `--border` | `rgba(255, 255, 255, 0.07)` | Garis pemisah halus antar komponen (micro-border) |
| `--border2` | `rgba(255, 255, 255, 0.12)` | Border kartu interaktif, form input fokus, divider utama |

### B. Aksen Primer Tunggal (Precision Cobalt)
| Token CSS | Nilai Hex | Peruntukan |
|---|---|---|
| `--accent` | `#3B82F6` | Aksen tombol aktif, link penting, ikon kontrol navigasi aktif |
| `--accent-hover` | `#2563EB` | Hover state tombol utama |
| `--accent-soft` | `rgba(59, 130, 246, 0.12)` | Latar badge aktif, highlight ringkas, chip terpilih |

### C. Warna Semantik Finansial (Financial Data Semantics)
> *Warna di bawah ini HANYA digunakan untuk nilai finansial dan status sinyal, TIDAK BOLEH digunakan sebagai warna dekoratif umum.*

| Token CSS | Dark Mode | Light Mode | Arti Semantik Pasar |
|---|---|---|---|
| `--green` | `#10B981` | `#059669` | Untung (Profit), Kenaikan (Gain), Akumulasi Bandar, Inflow Asing |
| `--red` | `#F43F5E` | `#E11D48` | Rugi (Loss), Penurunan (Drop), Distribusi Bandar, Outflow, Stop Loss |
| `--amber` | `#F59E0B` | `#D97706` | Peringatan kejujuran data (Simulasi, Estimasi historis, Data Basi) |

---

## 3. Sistem Tipografi (Typography Hierarchy)

Menggunakan kombinasi 2 keluarga font modern berstandar institusional:

### 1. Font Tampilan & Antarmuka: **Inter & Plus Jakarta Sans**
- **Headings (`h1`–`h4`, `.ptitle`, `.ctitle`)**: `Plus Jakarta Sans` / `Inter`, weight 600–700, tracking rapat (`letter-spacing: -0.025em`). *Hindari weight 800/900 yang terlalu tebal.*
- **Body & Controls (`body`, buttons, form labels)**: `Inter`, weight 400, 500, 600. Ukuran standar `12.5px`–`13px` dengan `line-height: 1.5`.

### 2. Font Angka & Finansial: **Fira Code / JetBrains Mono**
- Digunakan untuk seluruh:
  * Angka harga saham, P&L, persentase, rasio keuangan (PER, PBV, ROE).
  * Kode ticker emiten (`BBCA`, `BBRI`, `BMRI`).
  * Koordinat telemetry, jam WIB, dan sumbu grafik.
- **Wajib Tabular Nums**: `font-variant-numeric: tabular-nums` dan `font-feature-settings: "tnum" 1` agar digit angka rata sempurna tanpa bergetar saat nilai berubah.

---

## 4. Desain Landing Page & Login Page (Modern & Minimalist)

### A. Landing Page (`.lp-*`)
- **Tone**: *Executive Trading Desk & Horizon Minimalist*.
- **Latar Belakang**:
  - Deep dark obsidian (`#080A0F`) dengan satu aksen cahaya ambient monokromatik di bagian bawah (bukan warna ungu/cyan pelangi yang mencolok).
  - Kisi koordinat (*grid-mesh*) dibuat sangat tipis (`opacity: 0.02`) memberikan kedalaman dimensional tanpa mengganggu teks.
- **Hero Cockpit**:
  - Kartu tengah menggunakan *frosted glass* halus (`background: rgba(15, 19, 29, 0.75)`, `border: 1px solid rgba(255, 255, 255, 0.08)`, `backdrop-filter: blur(20px)`).
  - Judul bersih: Teks putih solid dengan aksen perak lembut, tanpa gradient warna-warni yang mencolok.
  - Tombol CTA utama: Satu warna solid elegan (`#2563EB` dengan micro-lift), dipadukan tombol sekunder minimalis.
  - Indikator Telemetry: Huruf monospaced rapi berukuran 10.5px di garis paling atas dan bawah.

### B. Login Page / Auth Modal (`.auth-*`)
- **Arsitektur Split Panel**:
  - **Sisi Kiri (Intelijen & Nilai Platform)**: Menggunakan nuansa obsidian slate terpadu, menampilkan fitur inti secara ringkas, kartu telemetri contoh berlabel jujur (`CONTOH ESTIMASI`), dan poin jaminan keamanan.
  - **Sisi Kanan (Form Input Interaktif)**: Bidang input modern dengan ikon minimalis, label jelas, dan tombol aksi tegas.
- **Micro-Interactions**:
  - Transisi modal halus (`opacity` dan `transform: scale(0.98)` ke `scale(1)`).
  - Form input saat fokus menggunakan border biru presisi halus (`rgba(59, 130, 246, 0.5)`) tanpa pendaran neon berlebihan.

---

## 5. Standar Antarmuka Dalam Aplikasi (In-App Design Rules)

### 1. Desain Modular & Anti-Berantakan (Decluttered & Collapsible)
- **Halaman Form / Pengaturan**:
  * Form yang belum ingin diisi **disembunyikan secara default (*hidden/collapsed*)**.
  * Sediakan **Navigasi Kategori (Tabs)** di bagian atas halaman agar user dapat memilih fokus area yang ingin dikerjakan.
  * Kartu panjang menyediakan tombol buka-tutup (*accordion*) dengan ikon panah halus.
- **Zero Card Fragmentation**:
  * Jangan memecah metrik yang berkaitan menjadi banyak kartu kecil. Satukan dalam 1 kartu terpadu dengan sub-panel berlatar `var(--bg3)`.
  * Hindari ruang kosong tak bernilai (*zero wasteland*).

### 2. Standar Tabel Finansial
- Kolom Teks/Emiten: Rata Kiri (`text-align: left`).
- Kolom Angka Finansial (Harga, Lot, Volume, Value, PnL, Rasio): **Wajib Rata Kanan (`text-align: right`)**.
- Sticky Header: Header kolom tabel tetap terlihat saat di-scroll (`position: sticky; top: 0`).
- Responsif: Setiap tabel wajib dibungkus kontainer horizontal scroll (`.tbl-wrap` / `overflow-x: auto`).

### 3. Penjelasan Fitur & State Kosong (Tooltips & Disclosures)
- Jangan memenuhi layout dengan paragraf instruksi panjang. Gunakan ikon info mikro `uiInfoIcon()` atau tombol expand/collapse bantuan.
- Status data simulasi atau estimasi **wajib** menggunakan badge amber (`b-amb` / `rgba(245, 158, 11, 0.12)`).

---

## 6. Paritas Tema Terang (Light Theme — Alabaster Slate)

Tema terang dirancang dengan tingkat keanggunan yang sama (*Alabaster White & Slate*):
- `--bg`: `#F8FAFC` (Slate 50 — sejuk di mata, bukan putih silau murni `#FFFFFF`).
- `--bg2`: `#FFFFFF` (Surface kartu dan panel).
- `--bg3`: `#F1F5F9` (Sub-panel dan baris tabel).
- `--border`: `rgba(0, 0, 0, 0.08)`.
- `--text`: `#0F172A` (Slate 900).
- `--text2`: `#334155` (Slate 700).
- `--text3`: `#64748B` (Slate 500).

Semua komponen wajib diuji di kedua tema agar kontras selalu memenuhi standar WCAG AA (rasio minimal 4.5:1 untuk teks biasa, 7:1 untuk teks utama).

---

## 7. Checklist Verifikasi Rilis UI/UX (Quality Gate)

Sebelum merilis perubahan tampilan apa pun, pastikan:
- [ ] **Warna Terkendali**: Bebas dari warna ungu/cyan neon berlebih, tombol pelangi, atau pendaran yang melelahkan mata.
- [ ] **Font Konsisten**: Judul menggunakan Sans Display rapi, angka finansial rata kanan dengan font tabular monospace.
- [ ] **Kerapian Layout**: Form tidak terbuka sekaligus menumpuk; menggunakan sistem Tab / Collapsible untuk bagian yang belum ingin diisi.
- [ ] **Responsif & Aman**: Tidak ada teks yang tumpang tindih (*anti-collision*) di layar smartphone atau resolusi desktop rendah.
- [ ] **Dual-Theme Compatible**: Tampilan terbaca jelas dan indah di Dark Mode maupun Light Mode.
