# Pangkalan Aplikasi

Halaman peluncur pribadi berisi link semua aplikasi Anda. Bisa dibuka di HP dan laptop, dipasang di layar utama HP, dan tetap tampil saat tidak ada internet.

- **Tamu** (tanpa login): melihat dan membuka link publik, menyalin link.
- **Pemilik** (setelah masuk): menambah, mengubah, menghapus link dan kategori, mengatur urutan, favorit, link privat, ekspor/impor.
- **Dua tab:** **Aplikasi Saya** (aplikasi buatan sendiri) dan **Link Lain** (Google, YouTube, game, dan situs lain). Tab Link Lain bisa dibuat privat.

**Teknologi:** HTML + Bootstrap 5 + JavaScript biasa (tanpa proses build), Supabase (login dan database), GitHub Pages (hosting gratis).

---

## Struktur folder

```
pangkalan-aplikasi/
├── index.html                 halaman utama
├── manifest.webmanifest       nama, ikon, warna untuk "Tambahkan ke layar utama"
├── sw.js                      service worker (offline)
├── .nojekyll                  agar GitHub Pages menyajikan file apa adanya
├── assets/
│   ├── css/app.css            gaya tambahan di atas Bootstrap
│   ├── icons/                 ikon aplikasi (192, 512, maskable, favicon)
│   └── vendor/                pustaka pihak ketiga (diisi oleh workflow vendor.yml), qrcode/ sudah tersedia
├── js/
│   ├── config.js              ← ISI URL dan kunci Supabase di sini
│   ├── api.js                 login dan semua panggilan ke Supabase
│   ├── boot.js                tema dan pemuat pustaka (lokal dulu, CDN sebagai cadangan)
│   ├── app.js                 logika halaman
│   ├── store.js               salinan data, riwayat, pengaturan di perangkat
│   └── utils.js               fungsi bantu, aturan ikon otomatis
├── supabase/
│   ├── schema.sql             tabel, aturan keamanan (RLS), fungsi urutan (pemasangan baru)
│   ├── seed.sql               data awal: 4 kategori, 11 link
│   └── migration-002-tab.sql  pembaruan untuk database lama: fitur dua tab
└── .github/workflows/
    ├── keep-alive.yml         menjaga Supabase tetap aktif
    └── vendor.yml             mengunduh pustaka ke assets/vendor (dijalankan manual sekali)
```

---

## Langkah pemasangan

### 1. Siapkan Supabase

1. Masuk ke [supabase.com](https://supabase.com) dan buat proyek baru (paket gratis cukup).
2. Buka **SQL Editor → New query**, tempel seluruh isi `supabase/schema.sql`, lalu **Run**.
3. Buka **Authentication → Sign In / Providers**:
   - Matikan **Allow new users to sign up**. Ini penting: hanya Anda yang boleh punya akun.
   - Pastikan **Email** sebagai metode masuk aktif.
4. Buka **Authentication → Users → Add user → Create new user**:
   - Isi email dan password Anda.
   - Centang **Auto Confirm User**.
5. Buka `supabase/seed.sql`, ganti `GANTI-DENGAN-EMAIL-ANDA@contoh.com` dengan email akun tadi, lalu jalankan di SQL Editor. Hasil akhirnya harus **4 kategori, 11 link**.
6. Buka **Project Settings → API** (atau **API Keys**) dan catat:
   - **Project URL**, misalnya `https://abcd1234.supabase.co`
   - **anon public key** atau **publishable key**. Jangan pernah memakai *service_role* atau *secret key*.

> Nama menu di dashboard Supabase bisa sedikit berbeda karena tampilannya sering diperbarui.

### 2. Isi pengaturan aplikasi

Buka `js/config.js`, isi dua baris berikut, lalu simpan:

```js
export const SUPABASE_URL = 'https://abcd1234.supabase.co';
export const SUPABASE_ANON_KEY = 'kunci-anon-atau-publishable-anda';
```

Kunci ini memang aman ditaruh di file publik karena data dijaga oleh aturan RLS di database.

### 3. Unggah ke GitHub Pages

1. Buat repositori **publik** baru di GitHub, misalnya `pangkalan-aplikasi`.
2. Unggah semua file dan folder proyek ini (**Add file → Upload files**, seret isi folder).
   - Folder `.github` kadang tidak ikut terunggah karena tersembunyi. Jika begitu, buat lewat **Add file → Create new file**, ketik nama `.github/workflows/keep-alive.yml`, lalu tempel isinya.
3. Buka **Settings → Pages**, pilih **Deploy from a branch**, branch **main**, folder **/ (root)**, lalu **Save**.
4. Tunggu 1–2 menit. Alamat aplikasi: `https://NAMA-AKUN.github.io/pangkalan-aplikasi/`

### 4. Daftarkan alamat situs di Supabase

Buka **Authentication → URL Configuration**:

- **Site URL**: `https://NAMA-AKUN.github.io/pangkalan-aplikasi/`
- **Redirect URLs**: tambahkan alamat yang sama.

Ini diperlukan agar link **Lupa password** dari email kembali ke aplikasi Anda.

### 5. Aktifkan penjaga Supabase

Proyek Supabase gratis dijeda jika databasenya jarang dipakai selama 7 hari. Workflow `keep-alive.yml` mencegahnya dengan membaca satu baris data tiga kali seminggu.

1. Di repositori GitHub, buka **Settings → Secrets and variables → Actions → New repository secret**.
2. Buat dua secret:
   - `SUPABASE_URL` = Project URL
   - `SUPABASE_ANON_KEY` = kunci anon/publishable
3. Buka tab **Actions → Jaga Supabase tetap aktif → Run workflow** untuk mencoba. Hasilnya harus hijau dengan status HTTP 200.

> Di repositori publik, GitHub menonaktifkan jadwal workflow jika repositori tidak ada aktivitas selama 60 hari. GitHub akan mengirim email peringatan. Jika itu terjadi, buka tab Actions dan aktifkan kembali.

Jika proyek terlanjur dijeda, aplikasi tetap menampilkan daftar terakhir yang tersimpan di perangkat. Pulihkan proyek lewat dashboard Supabase dengan **Resume project**.

### 6. Simpan pustaka di repositori sendiri

Buka tab **Actions → Unduh pustaka ke repositori → Run workflow**. Workflow ini mengunduh Bootstrap, Bootstrap Icons, SortableJS, dan supabase-js ke folder `assets/vendor`, lalu menyimpannya ke repositori. Cukup sekali.

Sebelum workflow ini dijalankan, aplikasi tetap berjalan normal dengan memakai CDN jsDelivr sebagai cadangan.

> Jika workflow gagal dengan pesan izin, buka **Settings → Actions → General → Workflow permissions**, pilih **Read and write permissions**, lalu jalankan ulang.

### 7. Pasang di HP

Buka alamat aplikasi di Chrome (Android) atau Safari (iPhone), lalu pilih **Tambahkan ke Layar Utama**.

---

## Pembaruan: fitur dua tab (untuk yang sudah memasang sebelumnya)

Jika aplikasi Anda sudah berjalan sebelum fitur tab ditambahkan:

1. **Perbarui database dulu.** Buka **SQL Editor → New query**, tempel isi `supabase/migration-002-tab.sql`, lalu **Run**. Data lama tidak hilang. Semua kategori yang ada otomatis masuk tab **Aplikasi Saya**.
2. **Ganti file di GitHub:** `index.html`, `sw.js`, `assets/css/app.css`, `js/app.js`, `js/api.js`, `js/store.js`, `js/utils.js`. File `js/config.js` **tidak perlu** diganti.
3. Tunggu 1–2 menit, lalu muat ulang halaman.

Jika langkah 2 dilakukan sebelum langkah 1, halaman menampilkan pemberitahuan merah "Database belum diperbarui". Jalankan langkah 1, lalu muat ulang.

Pemasangan baru tidak perlu file ini, karena isinya sudah termasuk di `schema.sql`.

---

## Penggunaan

| Yang ingin dilakukan | Caranya |
| --- | --- |
| Masuk sebagai pemilik | Tombol **Kelola** di kanan atas |
| Menambah link | **Tambah link** (laptop) atau tombol **+** (HP) |
| Mengubah atau menghapus link | Tombol titik tiga atau klik kanan (laptop), tekan lama ikon (HP) |
| Mengatur urutan link | Tombol **Atur**, lalu seret. Di HP, tekan dan tahan sebentar sebelum menyeret |
| Mengelola kategori | Menu akun → **Kelola kategori & tab** |
| Memindah kategori ke tab lain | Kelola kategori & tab → tombol ubah → **Tampil di tab** |
| Menyembunyikan tab Link Lain dari tamu | Kelola kategori & tab → saklar **Tab ini privat** |
| Link favorit | Saklar **Favorit** di form, atau menu aksi link |
| Link privat | Saklar **Privat** di form. Hanya tampil setelah masuk |
| Cadangan data | Menu akun → **Ekspor data** / **Impor data** |
| Menyalin link | Menu aksi link → **Salin link** (bisa tanpa masuk) |
| Membagikan link | Menu aksi link → **Bagikan…** (di HP, langsung ke WhatsApp dan aplikasi lain) |
| Kode QR untuk siswa | Menu aksi link → **Tampilkan kode QR** |
| Mencari cepat di laptop | Tekan `/` untuk ke kolom cari, `Esc` untuk mengosongkan |
| Cadangan berkala | Pengingat muncul jika 30 hari belum mengekspor dari perangkat itu. **Nanti** menunda 7 hari |
| Melihat link yang tersembunyi di HP | Kotak **+N lainnya**. Di HP, setiap kategori tampil maksimal 2 baris. Di laptop semua link tampil |

### Ikon otomatis

Ikon dipilih otomatis berurutan dari: (1) alamat situs terkenal, misalnya youtube.com → YouTube, drive.google.com → Google; (2) kata kunci di nama, misalnya "radar", "jurnal", "CBT", "LPJ", "game"; (3) ikon bawaan kategori. Aturannya ada di `URL_RULES` dan `ICON_RULES` dalam `js/utils.js` dan bisa ditambah sendiri. Semua nama ikon bisa dilihat di [icons.getbootstrap.com](https://icons.getbootstrap.com).

---

## Memperbarui aplikasi

File aplikasi (js, css, config) selalu diambil dari server lebih dulu, jadi perubahan langsung terpakai setelah halaman dimuat ulang. GitHub Pages butuh 1–2 menit untuk menayangkan perubahan. Jika Anda mengubah daftar file di `sw.js` atau mengganti versi pustaka, naikkan juga `VERSION` di `sw.js`.

---

## Keamanan

- Pendaftaran akun dimatikan, jadi hanya akun yang Anda buat di dashboard yang bisa masuk.
- Aturan RLS: siapa pun boleh membaca kategori dan link publik. Link privat dan semua perubahan hanya untuk pemilik.
- Database menolak link selain `http://` dan `https://` (misalnya `javascript:`).
- Halaman memakai `noindex` sehingga tidak muncul di hasil pencarian Google.
- Aturan keamanan halaman (Content Security Policy): skrip hanya boleh dari situs ini dan jsDelivr (cadangan), dan data hanya dikirim ke Supabase.
- Sebelum impor **Ganti semua**, data yang ada otomatis diunduh dulu sebagai file cadangan.
- Daftar link tetap bisa dilihat siapa saja yang tahu alamatnya. Untuk link yang tidak boleh terlihat, aktifkan **Privat**, atau jadikan seluruh tab Link Lain privat.

---

## Jika ada masalah

| Gejala | Penyebab yang mungkin |
| --- | --- |
| Muncul "Supabase belum diatur" | `js/config.js` belum diisi |
| "Server data tidak bisa dihubungi" | Tidak ada internet, proyek Supabase dijeda, atau URL/kunci salah |
| "Email atau password salah" | Periksa akun di Authentication → Users |
| "Email akun belum dikonfirmasi" | Saat membuat akun, centang Auto Confirm User, atau konfirmasi dari dashboard |
| Link reset password membuka halaman lain | Site URL / Redirect URLs belum diisi alamat GitHub Pages |
| Perubahan file tidak muncul / masih "Supabase belum diatur" | Tunggu 1–2 menit, lalu muat ulang paksa (Ctrl+Shift+R). Jika masih, hapus data situs di browser |
| Workflow keep-alive merah | Secret belum diisi atau salah ketik |
| Workflow "Unduh pustaka" gagal karena izin | Settings → Actions → General → Workflow permissions → Read and write permissions |
| "Database belum diperbarui untuk fitur tab" | `supabase/migration-002-tab.sql` belum dijalankan |
