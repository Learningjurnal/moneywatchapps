# DESIGN.md — MoneyWatch Pro

> Written 2026-09-26 as part of antislop audit-001, finding #7. This document
> transcribes the visual identity **already present and consistent** across
> the existing app (`public/css/main.css`, `public/index.html`) — it does not
> invent new direction. If any line here misreads the intent behind an
> existing screen, correct it directly; this file should track what the
> product actually is, not aspire to something else.

## Identity

MoneyWatch Pro is a quantitative analytics terminal for the Indonesian Stock
Exchange (IDX/BEI): Smart Money / Bandarmology detection, Benjamin Graham-style
intrinsic valuation, dividend tax (PMK 18) management, and an autonomous
paper-trading research engine. It presents itself as an **institutional
trading terminal**, not a consumer investing app — dense, numeric,
mono-spaced data over friendly illustration.

## Personality

- Precise and data-dense over friendly and spacious. Font sizes run small
  (base `12.5px`); the product trusts its user to read numbers, not be
  onboarded gently.
- Quantitative rigor as the actual brand promise, not just an aesthetic:
  `CLAUDE.md` rule #1 ("Zero Fabricated Data") is a real, enforced product
  value, and the UI should never claim more certainty than the underlying
  data supports (see the disclosure pattern below).
- Dark-first: the primary theme is dark navy, matching the "trading terminal"
  identity (real reason — R-21 in the antislop core — not "dark looks tech").
  A full light theme exists and must stay equally correct (`theme-light`
  overrides throughout `main.css`).

## Palette

Defined as CSS custom properties in `main.css:2` (dark) and `main.css:70`
(light, under `.theme-light`):

| Token | Dark | Light | Use |
|---|---|---|---|
| `--bg` / `--bg2..5` | `#030712` → `#1E293B` | `#F5F7FA` → `#CBD1D8` | Surface layers |
| `--text` / `--text2` / `--text3` | white → grey | near-black → grey | Text hierarchy |
| `--accent` | `#5B8DEF` | `#0000FF` | Bare text/icons on the page |
| `--accent-blue` | `#38BDF8` | `#0F69FF` | Filled backgrounds, links, telemetry accents |
| `--green` | `#00C805` | `#00873C` | Gains, "up", accumulation — semantic, not decorative |
| `--red` | `#FF333A` | `#D0163A` | Losses, "down", distribution — semantic, not decorative |
| amber (`rgba(245,158,11,*)`) | — | — | Reserved for honest disclosure ("data simulasi", "contoh tampilan") — do not reuse this color for anything that isn't a disclosure |

Core palette stays at 2-3 colors (bg/text neutrals + one blue accent) plus the
green/red pair, which is a finance-standard semantic convention, not an
arbitrary "too many colors" violation (R-29 exempts industry-semantic color).

## Typography

- UI text: `Inter` (`main.css:124`). Chosen for legibility at small sizes
  across a data-dense interface, not as an unexamined AI default — this app
  runs almost entirely at 10-13px.
- Numeric/data values and the landing page's "telemetry" flavor text: monospace
  (`var(--font-mono)`, `ui-monospace`/`SFMono-Regular`/`Menlo` stack). Reserved
  for values and status readouts, matching a real trading-terminal convention
  (ticker tapes, HUDs) — not decoration.

## Icons

Tabler Icons (`ti ti-*`), picked per-instance for relevance to the label next
to them (`ti-shield-check` for a security claim, `ti-chart-dots` for
analytics, `ti-cpu` for an engine reference) rather than generic
sparkle/magic/robot glyphs.

## Mood & Honesty Pattern

The one recurring UI pattern that IS load-bearing brand identity, not
decoration: an amber-tinted disclosure box/tag
(`background: rgba(245,158,11,0.08-0.1)`, `border: 1px solid
rgba(245,158,11,0.25)`) used whenever data is simulated, unavailable, or
illustrative rather than real. This pattern exists in the Bandarmology
widgets, the AI Autonomous Trading opportunity card ("win-rate historis belum
divalidasi backtest"), and now the auth screen's example telemetry card
(antislop audit-001 #1). Any new screen that shows a number it cannot back
with real data should reuse this exact pattern rather than inventing a new
one.

## Dials

- **ENERGY: 2** (Stripe/Vercel register). The landing/auth screens carry real
  flourish (gradient hero text, a glowing primary CTA, atmospheric
  background), but the main app (the ~45 feature pages behind login) is
  intentionally closer to ENERGY 1 — a dense terminal, not a marketing site.
  Treat the landing/auth screens and the logged-in app as two different
  registers on purpose.
- **RHYTHM: 2**. The logged-in app is consistently composed (consistent card/
  table/badge vocabulary across pages) with the landing and auth screens
  deliberately breaking from that vocabulary (their own `.lp-*`/`.auth-*`
  styles) because they serve a different job (persuasion vs. analysis).
- **MOTION: 1-2**. Inside the app: hover states and transitions only
  (`var(--spring)`), no scroll-reveal or choreography — appropriate for a
  tool people scan quickly and repeatedly. On the landing/auth screens:
  a few purposeful animations (starfield twinkle, atmospheric glow breathing,
  button hover lift) — kept deliberately sparse after antislop audit-001 #3
  removed the extra glow/pulse layers that pushed it toward MOTION 3.

## What NOT to add without a reason

- No new gradient/glow/badge on the logged-in app pages without the same
  purpose test as any other antislop pass (see `antislop.md` core).
- No new "trust" claims (compliance, statistics, uptime) anywhere without a
  real, checkable source — this app's history includes multiple removed
  instances of exactly this (see `anti-slop/audit-001-2026-09-26.md`).
- No customer testimonials or logo bars until real ones exist.

---

## Aturan Baku Konsistensi Desain Antar-Menu & Layout (Design System Standard)

> Ditetapkan agar transisi antar ~45 halaman/menu terasa sebagai **satu terminal terpadu yang konsisten, bersih, dan modern**, bukan kumpulan halaman terpisah yang dibuat dengan selera berbeda.

### 1. Struktur Anatomi Halaman Baku (Page Anatomy)
Setiap halaman/fitur di bawah `#page-*` harus mengikuti susunan hierarki 3 zona berikut:
1. **Header Zona Atas (Page Header)**:
   - Judul Halaman (`h1` atau `h2`, font-weight 700-800, `letter-spacing: -0.02em`, `color: var(--text)`).
   - Timestamp / Sync Badge di sebelah kanan (misal: "Diperbarui: HH:MM:SS" dengan font mono).
   - Action Bar terpadu (tombol refresh, export, atau switch mode menggunakan `.sm-btn`).
2. **Control & Filter Strip (Sub-navigation)**:
   - Jika halaman memiliki sub-kategori/sub-view (seperti All/Whale/Breakout atau timeframes): letakkan dalam satu bar horizontal terpadu (`.dash-view-toggle-bar` atau wadah segmented chip).
   - Chip aktif wajib memakai class `.sm-chip.active` atau `.btn.on`, bukan membuat style button baru per halaman.
3. **Content Grid (Canvas Utama)**:
   - Menggunakan CSS Grid terstruktur (`grid-template-columns: repeat(auto-fit, minmax(...))` atau 2-kolom seimbang), dengan `gap: 14px-16px`. Hindari layout masonry acak yang membuat tinggi kartu tidak sejajar.

### 2. Aturan Pengelompokan Kartu & Metrik (No Metric Fragmentation)
Mengacu pada `CLAUDE.md` Aturan #4:
- **DILARANG** membungkus setiap angka/metrik kecil ke dalam kartu terpisah (anti-AI slop).
- **WAJIB** mengelompokkan metrik yang berada dalam satu topik/sumber data ke dalam **SATU kartu terpadu (`.card`)**.
  - Contoh baik: 1 kartu "Valuasi Finansial" berisi 4 baris data (PER, PBV, ROE, DER) atau 1 grid mini di dalamnya.
  - Contoh buruk: 4 kartu terpisah untuk masing-masing PER, PBV, ROE, dan DER.
- Semua kartu wajib menggunakan class `.card` dengan `background: var(--bg2)`, `border: 1px solid var(--border)`, dan `border-radius: var(--radius-lg)` (8-10px). Hindari shadow tebal; gunakan hover halus `border-color: var(--border2)`.

### 3. Standar Tabel Data Finansial (Financial Data Tables)
Data tabel adalah komponen inti terminal ini. Semua tabel lintas menu wajib mematuhi aturan perataan:
- **Kolom Teks / Identitas (Ticker, Nama Saham, Sektor)**: Rata kiri (`text-align: left`).
- **Kolom Angka Finansial (Harga, Lot, Volume, Value, P/L, Persen, Rasio)**:
  - **WAJIB rata kanan (`text-align: right`)**.
  - **WAJIB menggunakan font angka tabular**: `font-family: var(--font-mono)`, `font-variant-numeric: tabular-nums`, dan `font-feature-settings: "tnum" 1` agar angka tidak bergeser saat data berubah.
- **Header Tabel (`th`)**:
  - `font-size: 10px-10.5px`, uppercase, `color: var(--text3)`, `letter-spacing: 0.05em`.
  - Background `var(--table-header-bg)` dan border bawah `1px solid var(--border)`.
- **Row Hover & Interaksi**:
  - Baris tabel wajib memiliki hover halus (`background: var(--table-row-hover)`).
- **Mobile Overflow**:
  - Setiap tabel WAJIB dibungkus kontainer dengan `overflow-x: auto` (misal `.table-wrap`) agar tabel lebar tidak merusak lebar layar HP/tablet.

### 4. Aturan Penjelasan Fitur & Micro-copy (Info-Icon Standard)
- **DILARANG** menampilkan paragraf penjelasan panjang langsung di layout halaman (menghabiskan ruang analisa terminal).
- **WAJIB** menggunakan helper reusable `uiInfoIcon(id, text)` di sebelah label/judul metrik.
- **Interaksi Popover**:
  - Wajib mendukung **klik/tap untuk toggle buka-tutup** agar berfungsi di layar sentuh/HP (tidak boleh hover-only).
  - Klik di luar area popover otomatis menutup popover.

### 5. Aturan Semantik Warna & Integritas Status
Patuhi aturan warna finansial yang konsisten di semua halaman:
- **Hijau (`var(--green)`)**: Khusus indikasi positif (Gain, Akumulasi, Net Inflow, Target Tercapai, Status Optimal).
- **Merah (`var(--red)`)**: Khusus indikasi negatif (Loss, Distribusi, Net Outflow, Stop Loss Terkena, Risiko Tinggi).
- **Biru (`var(--accent)` / `var(--accent-blue)`)**: Navigasi aktif, interaksi klik, status telemetri operasional.
- **Amber (`rgba(245,158,11,*)`)**: **HANYA** untuk pola kejujuran data (data simulasi, estimasi historis yang belum divalidasi, fallback saat API eksternal down). Jangan gunakan warna amber untuk badge dekorasi biasa.

### 6. Aturan Mutlak Paritas Tema Terang & Gelap (Theme Parity)
- **DILARANG KERAS** meng-hardcode warna teks atau latar dengan nilai hex solid statis seperti `color: #FFFFFF`, `color: #000000`, atau `background: #0E131F` di dalam template string JS atau inline CSS komponen baru.
- **WAJIB** menggunakan CSS Custom Properties:
  - Background: `var(--bg)`, `var(--bg2)`, `var(--bg3)`.
  - Teks: `var(--text)` (primer), `var(--text2)` (sekunder), `var(--text3)` (muted/label).
  - Garis batas: `var(--border)`, `var(--border2)`, `var(--border-subtle)`.
- Setiap kali membuat atau memodifikasi layout menu, **WAJIB diuji di kedua tema** (Dark dan Light mode via `body.theme-light`). Teks putih di atas latar putih atau teks hitam di latar gelap adalah cacat rilis (P0 bug).

### 7. Checklist Verifikasi Konsistensi Desain (Consistency Gate)
Sebelum menganggap perubahan layout atau penambahan menu selesai, verifikasi 7 poin ini:
1. [ ] Apakah Page Header memiliki judul terstruktur dengan Action/Refresh yang rapi?
2. [ ] Apakah metrik sekelompok sudah digabung dalam satu Card, bukan terpecah-pecah?
3. [ ] Apakah seluruh angka finansial rata kanan dan menggunakan font `tabular-nums`?
4. [ ] Apakah penjelasan fitur menggunakan popover `uiInfoIcon()`, bukan teks deskripsi panjang?
5. [ ] Apakah warna hijau/merah/amber digunakan strictly sesuai makna semantiknya?
6. [ ] Apakah tampilan tetap terbaca jelas (kontras tinggi, tidak ada teks tak terlihat) saat tombol tema beralih ke Mode Terang?
7. [ ] Apakah layout responsif dan tabel dapat di-scroll horizontal tanpa membuat halaman HP meluber ke samping?

