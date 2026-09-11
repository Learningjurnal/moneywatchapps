-- ══════════════════════════════════════════════════════════
-- MIGRASI SKEMA — Money Watch Pro (KONSOLIDASI)
-- ══════════════════════════════════════════════════════════
-- Jalankan SEKALI di Supabase SQL Editor project Anda
-- (Dashboard Supabase → SQL Editor → New query → tempel → Run).
--
-- File ini MENGGANTIKAN dua migrasi terpisah sebelumnya
-- (idx_universe_migration.sql, trade_strategy_migration.sql) —
-- aman dijalankan kapan pun, termasuk kalau salah satu/keduanya
-- sudah pernah dijalankan (semua kolom pakai IF NOT EXISTS).
--
-- Menambahkan ke tabel user_settings:
--   idx_universe / idx_universe_info  — hasil import Excel Daftar Saham (Admin Panel)
--   admin_meta / admin_extra          — override nama/sektor per-ticker (Admin Panel)
--   trade_strategy                    — pilihan strategi per emiten (Dashboard)
--   sek_tax_override                  — override komisi per sekuritas (Pengaturan Pajak)
--   schema_version                    — penanda versi skema, dibaca aplikasi saat login
--                                        untuk mendeteksi kalau migrasi ini BELUM
--                                        dijalankan, dan menampilkan peringatan di UI
--                                        (bukan cuma di console) supaya tidak ada lagi
--                                        fitur yang "tersimpan tapi hilang lagi setelah
--                                        reload" karena upsert gagal diam-diam.
--
-- Tidak perlu policy RLS baru — kolom baru otomatis mengikuti
-- policy row-level yang sudah berlaku di tabel user_settings.
-- ══════════════════════════════════════════════════════════

alter table public.user_settings
  add column if not exists idx_universe jsonb,
  add column if not exists idx_universe_info jsonb,
  add column if not exists admin_meta jsonb,
  add column if not exists admin_extra jsonb,
  add column if not exists trade_strategy jsonb,
  add column if not exists sek_tax_override jsonb,
  add column if not exists wealth jsonb,
  add column if not exists schema_version integer;

-- Tandai baris yang sudah ada (dibuat sebelum migrasi ini) sebagai versi 2,
-- supaya baris lama tidak terus-menerus memicu peringatan "skema belum update"
-- di UI padahal kolomnya sudah baru saja ditambahkan barusan.
update public.user_settings set schema_version = 2 where schema_version is null;

-- ══════════════════════════════════════════════════════════
-- FIX: "data hilang saat pindah device"
-- ══════════════════════════════════════════════════════════
-- Sinkronisasi transaksi/dividen/dll sebelumnya delete-semua-lalu-insert-ulang:
-- kalau insert gagal di tengah jalan (network putus, dsb), baris di cloud
-- sudah kadung terhapus tanpa penggantinya, dan device lain yang login
-- berikutnya menarik tabel yang kosong itu. Kode aplikasi sekarang upsert
-- dulu baru bersihkan baris usang — tapi upsert butuh unique constraint di
-- bawah ini supaya ON CONFLICT (user_id, <id>) bisa bekerja.
--
-- Baris duplikat (kalau ada, dari histori delete+insert yang gagal
-- sebagian) dibersihkan dulu sebelum constraint ditambahkan — disimpan
-- hanya baris dengan ctid terbesar (paling baru) per (user_id, id).

do $$
begin
  delete from public.transactions a using public.transactions b
    where a.user_id=b.user_id and a.tx_id=b.tx_id and a.ctid<b.ctid;
  delete from public.dividends a using public.dividends b
    where a.user_id=b.user_id and a.div_id=b.div_id and a.ctid<b.ctid;
  delete from public.rdn_mutations a using public.rdn_mutations b
    where a.user_id=b.user_id and a.rdn_id=b.rdn_id and a.ctid<b.ctid;
  delete from public.crypto_tx a using public.crypto_tx b
    where a.user_id=b.user_id and a.tx_id=b.tx_id and a.ctid<b.ctid;
  delete from public.etf_tx a using public.etf_tx b
    where a.user_id=b.user_id and a.tx_id=b.tx_id and a.ctid<b.ctid;
  delete from public.rd_tx a using public.rd_tx b
    where a.user_id=b.user_id and a.tx_id=b.tx_id and a.ctid<b.ctid;
end $$;

alter table public.transactions
  drop constraint if exists transactions_user_tx_unique,
  add constraint transactions_user_tx_unique unique (user_id, tx_id);
alter table public.dividends
  drop constraint if exists dividends_user_div_unique,
  add constraint dividends_user_div_unique unique (user_id, div_id);
alter table public.rdn_mutations
  drop constraint if exists rdn_mutations_user_rdn_unique,
  add constraint rdn_mutations_user_rdn_unique unique (user_id, rdn_id);
alter table public.crypto_tx
  drop constraint if exists crypto_tx_user_tx_unique,
  add constraint crypto_tx_user_tx_unique unique (user_id, tx_id);
alter table public.etf_tx
  drop constraint if exists etf_tx_user_tx_unique,
  add constraint etf_tx_user_tx_unique unique (user_id, tx_id);
alter table public.rd_tx
  drop constraint if exists rd_tx_user_tx_unique,
  add constraint rd_tx_user_tx_unique unique (user_id, tx_id);

-- ══════════════════════════════════════════════════════════
-- FIX: field mapping cloud-sync salah total (bug lama, terpisah dari
-- fix di atas) — kode sebelumnya menulis/membaca t.action/t.commission/
-- r.description/r.amountIn-Out padahal field asli di engine adalah
-- t.type/t.komisi/r.ket/r.amount (satu nilai bertanda + / -). Akibatnya
-- transaksi yang ditarik ulang dari cloud selalu action=undefined —
-- semua filter BUY/SELL di dashboard gagal cocok, jadi Dashboard Utama
-- terlihat kosong padahal Riwayat Transaksi (render mentah) masih
-- menampilkan barisnya (dengan Aksi "undefined" & Pajak "NaN").
--
-- Kolom baru ini menyimpan id transaksi/dividen terkait per mutasi RDN
-- (dulu tidak pernah disimpan ke cloud sama sekali), supaya hapus
-- transaksi ikut menghapus mutasi RDN terkait juga di device lain.
alter table public.rdn_mutations
  add column if not exists linked_tx_id text;

-- div_invest juga di-upsert dengan onConflict:'user_id' tapi tabelnya tidak
-- pernah diberi unique constraint di kolom itu sejak awal — bug lama terpisah,
-- baru ketahuan setelah rdn_mutations & transactions dites (error: "there is
-- no unique or exclusion constraint matching the ON CONFLICT specification").
do $$
begin
  delete from public.div_invest a using public.div_invest b
    where a.user_id=b.user_id and a.ctid<b.ctid;
end $$;
alter table public.div_invest
  drop constraint if exists div_invest_user_unique,
  add constraint div_invest_user_unique unique (user_id);

-- ══════════════════════════════════════════════════════════
-- AI PAPER TRADING CLOUD SYNC (2026-09-11, user-requested)
-- ══════════════════════════════════════════════════════════
-- Sengaja tabel BARU dan TERPISAH dari user_data/user_settings — modul AI
-- Trading punya prinsip tertulis sendiri ("Complete Isolation: Zero
-- Mixing with User's Personal Portfolio", lihat header
-- public/js/38-ai-autonomous-trading.js), dan user_data sudah punya
-- sejarah bug merge (isExplicitlyEmpty, lihat catatan di atas) yang tidak
-- perlu ditambah risikonya oleh fitur paper-trading yang secara konsep
-- memang harus terisolasi dari data finansial riil pengguna.
--
-- Sebelum ini, paperAccount/hypotheses/decisionLog AI Trading HANYA ada
-- di localStorage browser (mw_ai_paper_v3/mw_ai_hypotheses_v1/
-- mw_ai_decision_log_v1) — tidak sinkron lintas device, jadi Win Rate
-- yang terlihat di HP dan laptop bisa beda-beda. Tabel ini jadi sumber
-- utama begitu user login (bukan tamu/demo); localStorage tetap dipakai
-- sebagai cache offline — lihat scheduleAiCloudSync()/loadAiCloudState()
-- di 38-ai-autonomous-trading.js.
--
-- Desain sengaja sederhana (bukan realtime, sesuai keputusan user):
-- simpan-saat-berubah (upsert, di-debounce 2 detik) + muat-saat-halaman-
-- dibuka. Tidak ada migrasi otomatis dari localStorage lama — akun paper
-- trading baru dianggap mulai bersih dari cloud sejak fitur ini aktif.

create table if not exists public.ai_paper_trading (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.ai_paper_trading enable row level security;

drop policy if exists "ai_paper_trading_select_own" on public.ai_paper_trading;
create policy "ai_paper_trading_select_own" on public.ai_paper_trading
  for select using (auth.uid() = user_id);

drop policy if exists "ai_paper_trading_insert_own" on public.ai_paper_trading;
create policy "ai_paper_trading_insert_own" on public.ai_paper_trading
  for insert with check (auth.uid() = user_id);

drop policy if exists "ai_paper_trading_update_own" on public.ai_paper_trading;
create policy "ai_paper_trading_update_own" on public.ai_paper_trading
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ══════════════════════════════════════════════════════════
-- KSEI 5%+ Shareholders & Free Float — dedicated table (2026-09-11,
-- user-requested: "apa rekomendasi anda, karena data ini harus diolah
-- dulu, dan apabila sumber data spreadsheet hilang maka data hilang juga")
-- ══════════════════════════════════════════════════════════
-- Replaces TWO broken/fragile mechanisms at once:
--   1. POST /api/ksei/sync (server.js) used to fetch a Google Sheet as CSV
--      and fs.writeFileSync() the parsed result to data/ksei-shareholders
--      .json — on Vercel serverless the filesystem is read-only outside
--      /tmp, so that write ALWAYS threw EROFS in production (same failure
--      class already fixed for /api/user-data/save — see that handler's
--      comment). The "Update Data" button was effectively non-functional.
--   2. Client-side kseiSaveSnapshotToFirestore()/kseiLoadFromFirestore()
--      (34-ksei-shareholders.js) used Firebase Firestore as a THIRD copy
--      of truth alongside localStorage and the server file — redundant
--      now that this table is the real source of truth, and Firestore is
--      otherwise unused for real app data since the Supabase migration.
--
-- New flow: user downloads/cleans data into an Excel file (unchanged —
-- still their manual judgment work, IDX's raw export needs it), uploads
-- the .xlsx directly in the KSEI Explorer (parsed client-side with the
-- SheetJS `XLSX` library already loaded for the Admin Panel's stock-
-- universe import, header-name-based + explicitly validated — see
-- kseiParseWorkbook() in 34-ksei-shareholders.js), and the parsed result
-- is upserted here. Answers the "kalau sheet hilang" worry structurally:
-- once uploaded, the data lives here independent of the source file/
-- sheet's continued existence — only the NEXT re-upload needs a working
-- source, never the data already stored.
--
-- Dedicated table (not the user_data blob saveData() uses), same
-- isolation rationale as ai_paper_trading above: KSEI data is large
-- (840+ emiten) and changes rarely (per KSEI's own periodic report
-- cadence), so it must not ride along on every save of frequently-
-- changing personal transaction data.
create table if not exists public.ksei_ownership (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.ksei_ownership enable row level security;

drop policy if exists "ksei_ownership_select_own" on public.ksei_ownership;
create policy "ksei_ownership_select_own" on public.ksei_ownership
  for select using (auth.uid() = user_id);

drop policy if exists "ksei_ownership_insert_own" on public.ksei_ownership;
create policy "ksei_ownership_insert_own" on public.ksei_ownership
  for insert with check (auth.uid() = user_id);

drop policy if exists "ksei_ownership_update_own" on public.ksei_ownership;
create policy "ksei_ownership_update_own" on public.ksei_ownership
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
