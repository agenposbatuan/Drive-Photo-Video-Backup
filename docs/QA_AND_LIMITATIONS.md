# Laporan Quality Assurance (QA) & Batasan Platform

Dokumen ini mencatat hasil verifikasi teknis yang benar-benar dijalankan terhadap **Google Drive Photo Backup** serta batasan platform browser yang berlaku secara transparan.

---

## 1. Verifikasi Teknis yang Dijalankan

| Area Pengujian | Metode Verifikasi | Status |
| :--- | :--- | :--- |
| TypeScript & Import Statis | `npm run lint` (`tsc --noEmit`) | Diuji pada build final |
| Bundling Produksi Vite + Tailwind v4 + Web Worker | `npm run build` | Diuji pada build final |
| Arsitektur Layanan Modular (10 service terpisah) | Audit struktur file `src/services/*` & `src/workers/hashWorker.ts` | Terverifikasi |
| Proteksi Keamanan Token OAuth | Audit `AuthenticationService.ts` & `UploadQueueService.ts` — token hanya disimpan di memori, tidak dicatat ke konsol, tidak disimpan di `localStorage`/`IndexedDB`, dan tidak ada Client Secret di frontend | Terverifikasi |
| Tata Letak Responsif (320px, 375px, 390px, 768px, 1024px, 1440px) | Audit CSS responsif mobile-first (bottom nav 60px + top bar 56px, sidebar desktop expandable, grid foto adaptif 3–6 kolom, `overflow-x: hidden`) | Terverifikasi |
| Tema Terang & Gelap | Audit `@custom-variant dark` di `src/index.css` dan pasangan warna `dark:*` pada seluruh komponen | Terverifikasi |

---

## 2. Pengujian Interaktif yang Memerlukan Akun Google Pengguna

Karena aplikasi ini terhubung langsung ke **Google Drive API v3** secara nyata (tanpa data palsu atau mock upload), pengujian end-to-end berikut dijalankan langsung oleh pengguna setelah login dengan akun Google:

1. **Autentikasi Google OAuth**: Masuk dengan tombol *Masuk dengan Google*, verifikasi tampilan profil, uji keluar (*Putuskan Akun*), dan verifikasi permintaan login ulang saat token memori kosong setelah muat ulang halaman.
2. **Pemilihan & Penjelajahan Folder Root**: Pilih folder existing (mis. `PHOTO BACKUP`) melalui Google Picker atau Penjelajah Folder bawaan, verifikasi breadcrumb subfolder bersarang, dan uji tombol segarkan setelah menambah/mengubah folder langsung di Google Drive.
3. **Galeri & Pratinjau Foto**: Uji muat thumbnail lazy, sortir berdasarkan tanggal & nama file, paginasi *Muat Foto Lainnya*, dan buka lightbox layar penuh untuk memuat resolusi asli on-demand serta panel detail EXIF.
4. **Upload Satu Foto, Banyak Foto, dan Satu Folder**:
   - Uji upload satu foto dan verifikasi nama file asli & ukuran byte di Google Drive sama persis dengan file lokal.
   - Uji upload satu folder bersarang (mis. `Liburan 2026/Pantai/foto01.jpg`) dan verifikasi struktur subfolder terbentuk otomatis di Google Drive.
5. **Upload Latar Belakang & Pemulihan**:
   - Mulai upload batch foto lalu berpindah ke halaman `Beranda`, `Semua Foto`, `Album`, dan `Pengaturan` — pastikan upload terus berjalan dan indikator antrean di header/sidebar terus memperbarui progres.
   - Muat ulang halaman saat antrean belum selesai, hubungkan kembali akun Google, dan verifikasi `UploadRecoveryService` memulihkan antrean serta mengecek offset sesi resumable.
6. **Proteksi Duplikat**: Upload ulang foto yang sama ke folder tujuan yang sama dan verifikasi modal duplikat menampilkan opsi **Lewati file**, **Upload sebagai salinan**, dan **Batalkan tindakan** tanpa menimpa file asli di Drive.

---

## 3. Batasan yang Diketahui (Known Limitations)

1. **Penutupan Browser / Tab Dimatikan oleh OS**:
   - Browser web tidak mengizinkan eksekusi upload file besar secara terus-menerus setelah browser ditutup total, tab dibunuh, atau perangkat masuk mode penghemat baterai ketat.
   - Aplikasi memitigasi hal ini dengan menyimpan antrean di IndexedDB dan menggunakan protokol Resumable Upload Google Drive sehingga upload dapat dipulihkan saat aplikasi dibuka kembali.
2. **Batas Kuota Penyimpanan Lokal Browser (IndexedDB)**:
   - Setiap browser (terutama Safari iOS dan mode Incognito/Privat) membatasi kapasitas IndexedDB. Sebelum memasukkan batch besar, aplikasi memeriksa `navigator.storage.estimate()`. Jika ruang lokal tidak cukup, file tetap dapat diupload dari memori selama tab aktif, namun jika halaman dimuat ulang pengguna akan diminta memilih ulang file sumber melalui tombol **Pilih Ulang File** pada tugas terkait.
3. **Dukungan Pemilihan Folder pada Browser Mobile**:
   - Atribut `webkitdirectory` didukung luas pada browser desktop dan sebagian browser Android modern, namun tidak semua browser mobile mendukung pemilihan direktori secara langsung. Aplikasi otomatis mendeteksi hal ini dan menyediakan tombol alternatif **Pilih Banyak Foto**.
4. **Masa Berlaku Sesi Token OAuth Client-Side**:
   - Demi keamanan, token akses OAuth hanya disimpan di memori sesi browser. Setelah muat ulang halaman atau masa berlaku token (~1 jam) habis, pengguna cukup menekan tombol **Hubungkan Kembali Google** untuk melanjutkan antrean secara otomatis.
5. **Kebutuhan Background Upload Penuh (Layar Mati / Aplikasi Tertutup)**:
   - Memerlukan aplikasi **Android Native** terpisah dengan Foreground Service / WorkManager, bukan aplikasi web browser biasa.
