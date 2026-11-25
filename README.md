# Google Drive Photo Backup

Aplikasi web **mobile-first** yang terinspirasi dari Google Photos untuk mencadangkan foto kualitas asli ke Google Drive, menelusuri album berbasis struktur folder Google Drive secara langsung, serta mengelola antrean upload persisten yang tahan perpindahan halaman dan mendukung pemulihan upload terputus.

---

## Fitur Utama

1. **Integrasi Google Drive Nyata (Source of Truth)**
   - Menggunakan Google Drive API v3 dan autentikasi Google OAuth 2.0 (melalui Firebase Auth client-side + Google Picker API).
   - Tidak menggunakan data tiruan atau database album terpisah — seluruh folder, subfolder bersarang, dan foto dibaca langsung dari Google Drive pengguna.
2. **Pencadangan Kualitas Asli 100%**
   - Tidak ada kompresi otomatis, tidak ada perubahan dimensi, tidak ada konversi format, tidak ada perubahan nama file, dan tidak ada penghapusan file lokal.
   - Pencadangan bersifat satu arah (lokal → Google Drive) tanpa sinkronisasi destruktif.
3. **Tiga Mode Upload Lengkap**
   - **Upload Satu Foto** dengan pratinjau penuh.
   - **Upload Banyak Foto** dengan pratinjau grid & progres individual/keseluruhan.
   - **Upload Satu Folder** secara rekursif mempertahankan seluruh struktur subfolder & nama file asli (disertai fallback pilih banyak foto pada browser mobile yang tidak mendukung `webkitdirectory`).
4. **Manajer Upload Latar Belakang Aplikasi & Resumable Upload**
   - Berjalan sebagai layanan singleton terpisah dari komponen halaman sehingga navigasi antar halaman (`Beranda`, `Semua Foto`, `Album`, `Cadangkan`, `Pengaturan`) tidak menghentikan upload.
   - Menggunakan protokol Google Drive Resumable Upload dalam potongan 2 MB dengan fitur Jeda, Lanjutkan, Coba Ulang, dan penanganan putus jaringan otomatis.
5. **Antrean Persisten IndexedDB & Pemulihan Upload**
   - Menyimpan metadata tugas, progres, URI sesi resumable, dan salinan blob file lokal (jika kuota penyimpanan browser mencukupi).
   - Token OAuth **tidak pernah** disimpan di `localStorage`, `sessionStorage`, atau `IndexedDB` — hanya disimpan sementara di memori sesi.
6. **Proteksi Duplikat Tanpa Menimpa File**
   - Menghitung hash konten SHA-256 menggunakan Web Worker (`src/workers/hashWorker.ts`) serta memeriksa nama file, ukuran byte, dan ID Google Drive.
   - Memberikan opsi jelas kepada pengguna: **Lewati file**, **Upload sebagai salinan**, atau **Batalkan tindakan**.

---

## Struktur Proyek

```text
├── public/
│   └── sw.js                              # Service Worker ringan untuk notifikasi browser
├── docs/
│   └── QA_AND_LIMITATIONS.md              # Laporan pengujian QA & batasan platform
├── src/
│   ├── components/
│   │   ├── AlbumView.tsx                  # Eksplorasi folder Google Drive sebagai album & breadcrumb
│   │   ├── BerandaView.tsx                # Dasbor status koneksi, statistik nyata, aktivitas terbaru
│   │   ├── CadangkanView.tsx              # Upload 1 foto, banyak foto, dan 1 folder rekursif
│   │   ├── ConfirmDialog.tsx              # Dialog konfirmasi kustom
│   │   ├── DriveThumbnail.tsx             # Thumbnail lazy dengan fallback autentikasi Drive
│   │   ├── DuplicateResolutionModal.tsx   # Dialog keputusan file duplikat
│   │   ├── FolderPickerModal.tsx          # Pemilih folder root (Google Picker + penjelajah in-app)
│   │   ├── GoogleSignInButton.tsx         # Tombol resmi "Masuk dengan Google"
│   │   ├── Layout.tsx                     # Shell responsif mobile-first (bottom nav) & desktop (sidebar)
│   │   ├── PengaturanView.tsx             # Pengaturan akun, root folder, paralelisme, tema & notifikasi
│   │   ├── PhotoPreviewModal.tsx          # Lightbox layar penuh dengan resolusi asli on-demand & EXIF
│   │   ├── SemuaFotoView.tsx              # Galeri foto terkelompok tanggal, sortir, paginasi
│   │   └── UploadQueueDrawer.tsx          # Panel antrean upload (drawer desktop / bottom sheet mobile)
│   ├── services/
│   │   ├── AuthenticationService.ts       # Google OAuth via Firebase Auth & cache token in-memory
│   │   ├── DuplicateDetectionService.ts   # Deteksi duplikat SHA-256 (Web Worker) + Drive API
│   │   ├── FolderService.ts               # Penjelajahan folder, verifikasi akses, pembuatan path rekursif
│   │   ├── GoogleDriveService.ts          # Klien REST Google Drive API v3 & Resumable Upload
│   │   ├── PhotoService.ts                # Pengambilan foto terbatas dalam folder root & statistik
│   │   ├── SettingsService.ts             # Preferensi non-sensitif (tema, folder root, paralelisme)
│   │   ├── ThumbnailService.ts            # Manajemen cache URL thumbnail & foto asli on-demand
│   │   ├── UploadQueueService.ts          # Persistensi IndexedDB untuk tugas, blob, & aktivitas
│   │   ├── UploadRecoveryService.ts       # Pemulihan tugas belum selesai saat aplikasi dibuka ulang
│   │   └── UploadService.ts               # Mesin upload latar belakang tingkat aplikasi (singleton)
│   ├── types/
│   │   └── index.ts                       # Definisi tipe TypeScript utama
│   ├── utils/
│   │   └── formatters.ts                  # Pemformatan tanggal Indonesia, ukuran file, validasi gambar
│   ├── workers/
│   │   └── hashWorker.ts                  # Web Worker untuk perhitungan hash SHA-256
│   ├── App.tsx
│   ├── index.css
│   └── main.tsx
├── .env.example
└── index.html
```

---

## Panduan Konfigurasi Google Cloud, OAuth & Drive API

### 1. Konfigurasi Google Cloud Project
1. Buka [Google Cloud Console](https://console.cloud.google.com/) dan buat atau pilih proyek Google Cloud.
2. Pastikan proyek aktif pada halaman dashboard.

### 2. Aktifkan Google Drive API & Google Picker API
1. Masuk ke menu **APIs & Services → Library**.
2. Cari dan aktifkan:
   - **Google Drive API** (`drive.googleapis.com`)
   - **Google Picker API** (`picker.googleapis.com`)

### 3. Konfigurasi OAuth Consent Screen
1. Buka **APIs & Services → OAuth consent screen**.
2. Pilih tipe pengguna (**External** untuk akun Gmail biasa atau **Internal** untuk Google Workspace).
3. Isi nama aplikasi (`Google Drive Photo Backup`), email dukungan, dan tambahkan **Test Users** jika aplikasi masih berstatus Testing.
4. Daftarkan scope berikut:
   - `https://www.googleapis.com/auth/drive` — Diperlukan untuk membaca folder existing, menelusuri struktur subfolder bersarang di dalam folder root pilihan pengguna, serta mencadangkan foto.
   - `https://www.googleapis.com/auth/drive.file` — Diperlukan untuk interaksi file yang dibuat/dipilih melalui aplikasi dan Google Picker.
   - `https://www.googleapis.com/auth/drive.metadata.readonly` — Diperlukan oleh Google Picker API untuk menampilkan metadata folder.

> **Catatan Scope & Keamanan:** Scope `drive.file` saja tidak memberikan akses otomatis ke seluruh folder dan foto lama yang sudah ada sebelumnya di Google Drive tanpa pemilihan item satu per satu. Karena aplikasi ini perlu membaca struktur subfolder bersarang dan galeri foto yang sudah ada di folder backup pengguna, scope `drive` diminta secara transparan dengan persetujuan eksplisit pengguna.

### 4. Konfigurasi OAuth 2.0 Client & Firebase Auth
1. Pada lingkungan AI Studio, konfigurasi OAuth & Firebase Auth telah terpasang melalui `firebase-applet-config.json`.
2. Untuk deployment mandiri di luar AI Studio:
   - Salin `.env.example` menjadi `.env`.
   - Masukkan `VITE_GOOGLE_CLIENT_ID` (public Client ID saja — **jangan pernah** menaruh Client Secret di frontend).
   - Pastikan domain aplikasi terdaftar di **Authorized JavaScript Origins** dan **Firebase Authorized Domains**.

---

## Menjalankan Secara Lokal

```bash
npm install
npm run dev
```

Build produksi dan validasi TypeScript:

```bash
npm run lint
npm run build
```

---

## Batasan Browser & Catatan Pengembangan Android Native

- **Upload di dalam aplikasi web** tetap berjalan saat pengguna berpindah halaman (`Beranda` ↔ `Semua Foto` ↔ `Album` ↔ `Cadangkan` ↔ `Pengaturan`) selama tab browser aktif.
- **Batasan platform browser**: Browser web (Chrome/Safari/Firefox di Android, iOS, maupun Desktop) tidak menjamin proses upload file besar tetap berjalan setelah browser ditutup total, tab dimatikan, atau sistem operasi membekukan browser karena mode hemat daya ketat.
- **Pemulihan aman**: Antrean disimpan di IndexedDB beserta salinan file sementara (apabila kuota perangkat mengizinkan). Saat aplikasi dibuka kembali, sistem memvalidasi sesi resumable dan melanjutkan dari offset byte terakhir atau meminta pengguna memilih ulang file jika salinan lokal sudah dibersihkan oleh browser.
- **Kebutuhan Android Native**: Apabila dibutuhkan pencadangan latar belakang penuh ketika aplikasi ditutup atau layar terkunci dalam durasi lama, fitur tersebut merupakan kapabilitas aplikasi **Android Native** terpisah (menggunakan Foreground Service / WorkManager) yang dapat memanfaatkan ulang pola layanan Drive dan protokol Resumable Upload dari arsitektur modular ini.
