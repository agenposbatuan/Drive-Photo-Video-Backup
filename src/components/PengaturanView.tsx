import React, { useState } from 'react';
import {
  Bell,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Download,
  FolderOpen,
  HelpCircle,
  Info,
  LogOut,
  Monitor,
  Moon,
  Shield,
  Smartphone,
  Sparkles,
  Sun,
  User,
} from 'lucide-react';
import { AppSettings, AuthState, DuplicatePolicy, ThemeMode } from '../types';
import { SettingsService } from '../services/SettingsService';
import { usePwa } from '../hooks/usePwa';
import { formatIndonesianDateTime } from '../utils/formatters';
import { ConfirmDialog } from './ConfirmDialog';
import { GoogleSignInButton } from './GoogleSignInButton';
import { QualitySelector } from './family-gallery/QualitySelector';

interface PengaturanViewProps {
  authState: AuthState;
  isSigningIn: boolean;
  settings: AppSettings;
  onSignIn: () => void;
  onSignOut: () => void;
  onOpenFolderPicker: () => void;
}

export const PengaturanView: React.FC<PengaturanViewProps> = ({
  authState,
  isSigningIn,
  settings,
  onSignIn,
  onSignOut,
  onOpenFolderPicker,
}) => {
  const [confirmLogoutOpen, setConfirmLogoutOpen] = useState(false);
  const [notificationNotice, setNotificationNotice] = useState<string | null>(null);
  const { isStandalone, canInstall, isInstalled, installApp, isUpdateAvailable, updateApp } = usePwa();
  const [showManualGuide, setShowManualGuide] = useState(false);
  const [installFeedback, setInstallFeedback] = useState<string | null>(null);

  const handleInstallApp = async () => {
    setInstallFeedback(null);
    if (!canInstall) {
      setShowManualGuide(true);
      return;
    }
    const result = await installApp();
    if (result === 'accepted') {
      setInstallFeedback('Aplikasi sedang ditambahkan ke layar perangkat Anda.');
    } else if (result === 'dismissed') {
      setInstallFeedback('Pemasangan dibatalkan.');
    } else {
      setShowManualGuide(true);
    }
  };

  const handleToggleNotifications = async () => {
    setNotificationNotice(null);
    if (settings.notificationsEnabled) {
      SettingsService.setNotificationsEnabled(false);
      return;
    }

    if (typeof Notification === 'undefined') {
      setNotificationNotice('Browser ini tidak mendukung notifikasi web.');
      return;
    }

    if (Notification.permission === 'granted') {
      SettingsService.setNotificationsEnabled(true);
      return;
    }

    if (Notification.permission === 'denied') {
      setNotificationNotice(
        'Izin notifikasi diblokir pada pengaturan browser Anda. Aktifkan izin notifikasi untuk situs ini terlebih dahulu.'
      );
      return;
    }

    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      SettingsService.setNotificationsEnabled(true);
    } else {
      setNotificationNotice('Izin notifikasi tidak diberikan.');
    }
  };

  return (
    <div className="max-w-3xl space-y-6">
      {/* Akun Google */}
      <section className="rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-[#14171f] p-5 sm:p-6 space-y-4">
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
          Akun Google Drive
        </h2>

        {authState.user ? (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3.5 min-w-0">
              {authState.user.photoURL ? (
                <img
                  src={authState.user.photoURL}
                  alt={authState.user.displayName}
                  referrerPolicy="no-referrer"
                  className="h-12 w-12 shrink-0 rounded-full object-cover"
                />
              ) : (
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                  <User className="h-5 w-5" />
                </div>
              )}
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {authState.user.displayName}
                </p>
                <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                  {authState.user.email}
                </p>
                <p
                  className={`mt-0.5 text-xs font-medium ${
                    authState.hasValidToken
                      ? 'text-emerald-700 dark:text-emerald-400'
                      : 'text-amber-700 dark:text-amber-400'
                  }`}
                >
                  {authState.hasValidToken
                    ? 'Sesi akses Drive aktif'
                    : 'Token sesi kedaluwarsa — perlu autentikasi ulang'}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {!authState.hasValidToken && (
                <GoogleSignInButton
                  onClick={onSignIn}
                  loading={isSigningIn}
                  label="Perbarui Sesi"
                />
              )}
              <button
                type="button"
                onClick={() => setConfirmLogoutOpen(true)}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-red-200 dark:border-red-900/60 px-4 py-2 text-xs font-semibold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors whitespace-nowrap"
              >
                <LogOut className="h-4 w-4" />
                Putuskan Akun
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Belum ada akun Google yang terhubung. Hubungkan akun untuk membaca folder dan mencadangkan foto.
            </p>
            <GoogleSignInButton onClick={onSignIn} loading={isSigningIn} />
          </div>
        )}
      </section>

      {/* Folder Root Pencadangan */}
      <section className="rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-[#14171f] p-5 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Folder Root Pencadangan
            </h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Google Drive menjadi sumber kebenaran utama untuk semua album dan foto yang ditampilkan.
            </p>
          </div>
          <button
            type="button"
            disabled={!authState.hasValidToken}
            onClick={onOpenFolderPicker}
            className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#1a1f29] px-4 py-2 text-xs font-semibold text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 transition-colors whitespace-nowrap"
          >
            <FolderOpen className="h-4 w-4" />
            {settings.rootFolder ? 'Ubah Folder Root' : 'Pilih Folder Root'}
          </button>
        </div>

        <div className="rounded-xl bg-slate-50 dark:bg-[#11141b] border border-slate-200/80 dark:border-slate-800 p-4 text-xs">
          {settings.rootFolder ? (
            <div className="space-y-1">
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                {settings.rootFolder.name}
              </p>
              <p className="font-mono-tabular text-slate-500 dark:text-slate-400 break-all">
                ID Folder: {settings.rootFolder.id}
              </p>
              <p className="text-slate-500 dark:text-slate-400">
                Terverifikasi: {formatIndonesianDateTime(settings.rootFolder.verifiedAt)} ·{' '}
                {settings.rootFolder.canAddChildren
                  ? 'Izin baca & upload aktif'
                  : 'Hanya baca'}
              </p>
            </div>
          ) : (
            <p className="text-slate-500 dark:text-slate-400">
              Belum ada folder root yang dipilih.
            </p>
          )}
        </div>
      </section>

      {/* Preferensi Upload */}
      <section className="rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-[#14171f] p-5 sm:p-6 space-y-5">
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
          Preferensi Upload
        </h2>

        {/* Parallel concurrency */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
              Upload Paralel Maksimal
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Jumlah file yang diupload secara bersamaan untuk menjaga stabilitas jaringan.
            </p>
          </div>
          <div className="inline-flex rounded-xl bg-slate-100 dark:bg-[#1a1f29] p-1 self-start">
            {[1, 2, 3].map((count) => (
              <button
                key={count}
                type="button"
                onClick={() => SettingsService.setMaxConcurrentUploads(count)}
                className={`min-h-[36px] min-w-[44px] rounded-lg px-3 text-xs font-semibold tabular-nums transition-colors ${
                  settings.maxConcurrentUploads === count
                    ? 'bg-white dark:bg-[#262d3b] text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                {count}
              </button>
            ))}
          </div>
        </div>

        {/* Duplicate policy */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-4 border-t border-slate-100 dark:border-slate-800/80">
          <div>
            <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
              Penanganan File Duplikat
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Aplikasi tidak pernah menimpa atau menghapus file yang sudah ada di Google Drive.
            </p>
          </div>
          <select
            value={settings.defaultDuplicatePolicy}
            onChange={(e) =>
              SettingsService.setDefaultDuplicatePolicy(e.target.value as DuplicatePolicy)
            }
            aria-label="Penanganan file duplikat"
            className="min-h-[42px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#1a1f29] px-3 text-xs font-medium text-slate-800 dark:text-slate-100 focus:border-blue-500 focus:outline-none"
          >
            <option value="ask">Tanyakan setiap kali (Disarankan)</option>
            <option value="skip">Lewati file otomatis</option>
            <option value="copy">Upload sebagai salinan</option>
          </select>
        </div>

        {/* Browser Notifications */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-4 border-t border-slate-100 dark:border-slate-800/80">
          <div className="flex items-start gap-2.5">
            <Bell className="h-4 w-4 shrink-0 text-slate-500 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
                Notifikasi Browser
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Tampilkan pemberitahuan saat upload dimulai, selesai, gagal, atau terputus.
              </p>
              {notificationNotice && (
                <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
                  {notificationNotice}
                </p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={() => void handleToggleNotifications()}
            className={`min-h-[40px] rounded-xl px-4 text-xs font-semibold transition-colors whitespace-nowrap self-start ${
              settings.notificationsEnabled
                ? 'bg-blue-600 text-white hover:bg-blue-700'
                : 'border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#1a1f29] text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800'
            }`}
          >
            {settings.notificationsEnabled ? 'Aktif' : 'Aktifkan'}
          </button>
        </div>
      </section>

      {/* Kualitas Tampilan Galeri */}
      <section className="rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-[#14171f] p-5 sm:p-6 space-y-4">
        <div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            Kualitas Tampilan Galeri
          </h2>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            Pilih kualitas tampilan foto untuk mengatur penggunaan data internet dan performa aplikasi.
          </p>
        </div>

        <QualitySelector
          value={settings.galleryQuality ?? 'auto'}
          onChange={(quality) => SettingsService.setGalleryQuality(quality)}
          variant="cards"
        />
      </section>

      {/* Tema Tampilan */}
      <section className="rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-[#14171f] p-5 sm:p-6 space-y-4">
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
          Tema Tampilan
        </h2>
        <div className="grid grid-cols-3 gap-2.5">
          {(
            [
              { id: 'light' as ThemeMode, label: 'Terang', icon: Sun },
              { id: 'dark' as ThemeMode, label: 'Gelap', icon: Moon },
              { id: 'system' as ThemeMode, label: 'Sistem', icon: Monitor },
            ] as const
          ).map((item) => {
            const Icon = item.icon;
            const active = settings.theme === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => SettingsService.setTheme(item.id)}
                className={`flex min-h-[48px] items-center justify-center gap-2 rounded-xl border text-xs font-semibold transition-colors ${
                  active
                    ? 'border-blue-600 bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300'
                    : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-[#1a1f29] text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </button>
            );
          })}
        </div>
      </section>

      {/* Instalasi Aplikasi PWA */}
      <section className="rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-[#14171f] p-5 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Instalasi Aplikasi
              </h2>
              {isStandalone || isInstalled ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 dark:bg-emerald-950/60 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400 border border-emerald-200/80 dark:border-emerald-800/80">
                  <CheckCircle2 className="h-3 w-3" />
                  Terpasang
                </span>
              ) : canInstall ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 dark:bg-blue-950/60 px-2.5 py-0.5 text-xs font-semibold text-blue-700 dark:text-blue-400 border border-blue-200/80 dark:border-blue-800/80">
                  <Sparkles className="h-3 w-3" />
                  Siap Pasang
                </span>
              ) : null}
            </div>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Pasang aplikasi ke layar utama Android atau Desktop untuk akses cepat dan pengalaman layar penuh tanpa bilah browser.
            </p>
          </div>

          <div className="flex items-center gap-2">
            {!isStandalone && !isInstalled && (
              <button
                type="button"
                onClick={() => void handleInstallApp()}
                className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 text-xs font-semibold transition-colors shadow-sm whitespace-nowrap"
              >
                <Download className="h-4 w-4" />
                Install Aplikasi
              </button>
            )}
          </div>
        </div>

        {installFeedback && (
          <p className="text-xs text-blue-600 dark:text-blue-400 font-medium">
            {installFeedback}
          </p>
        )}

        {isUpdateAvailable && (
          <div className="rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200/80 dark:border-amber-800/60 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div>
              <p className="font-semibold text-amber-900 dark:text-amber-200">
                Pembaruan Aplikasi Tersedia
              </p>
              <p className="text-amber-700 dark:text-amber-400 mt-0.5">
                Versi baru aplikasi siap digunakan. Perbarui sekarang untuk mendapatkan perbaikan terbaru.
              </p>
            </div>
            <button
              type="button"
              onClick={updateApp}
              className="inline-flex min-h-[38px] items-center justify-center rounded-xl bg-amber-600 hover:bg-amber-700 text-white px-3.5 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap self-start sm:self-auto"
            >
              Perbarui Sekarang
            </button>
          </div>
        )}

        {/* Status Mode */}
        <div className="rounded-xl bg-slate-50 dark:bg-[#11141b] border border-slate-200/80 dark:border-slate-800 p-4 text-xs space-y-2">
          {isStandalone || isInstalled ? (
            <div className="space-y-1">
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                Mode Standalone Aktif
              </p>
              <p className="text-slate-600 dark:text-slate-400">
                Aplikasi sedang berjalan langsung dalam mode mandiri dari layar utama. Navigasi antrean, galeri, dan pencadangan berjalan secara terintegrasi dengan perangkat Anda.
              </p>
            </div>
          ) : (
            <div className="space-y-1">
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Aplikasi Web Progresif (PWA)
              </p>
              <p className="text-slate-600 dark:text-slate-400">
                Aplikasi ini mendukung standar Progressive Web App (PWA). Anda dapat menambahkannya ke Layar Utama (Home Screen) tanpa perlu mengunduh file APK manual.
              </p>
            </div>
          )}

          {/* Panduan Instalasi Manual Toggle */}
          <div className="pt-2 border-t border-slate-200/60 dark:border-slate-800/60">
            <button
              type="button"
              onClick={() => setShowManualGuide((prev) => !prev)}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline"
            >
              <HelpCircle className="h-3.5 w-3.5" />
              {showManualGuide ? 'Sembunyikan panduan instalasi manual' : 'Panduan instalasi manual (Android / iOS / PC)'}
              {showManualGuide ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </button>

            {showManualGuide && (
              <div className="mt-3 space-y-3 pl-1 text-slate-600 dark:text-slate-400">
                <div className="p-3 rounded-lg bg-white dark:bg-[#1a1f29] border border-slate-200 dark:border-slate-800">
                  <p className="font-semibold text-slate-800 dark:text-slate-200 mb-1">
                    📱 Android (Google Chrome & Microsoft Edge):
                  </p>
                  <ol className="list-decimal list-inside space-y-1 text-xs">
                    <li>Ketuk ikon menu <strong>tiga titik (⋮)</strong> di pojok kanan atas browser.</li>
                    <li>Pilih menu <strong>"Instal aplikasi"</strong> atau <strong>"Tambahkan ke Layar Utama"</strong>.</li>
                    <li>Ketuk tombol <strong>"Instal"</strong> pada jendela konfirmasi.</li>
                    <li>Ikon <strong>Drive Backup</strong> akan muncul di layar utama Android Anda.</li>
                  </ol>
                </div>

                <div className="p-3 rounded-lg bg-white dark:bg-[#1a1f29] border border-slate-200 dark:border-slate-800">
                  <p className="font-semibold text-slate-800 dark:text-slate-200 mb-1">
                    🍏 iOS / iPhone / iPad (Apple Safari):
                  </p>
                  <ol className="list-decimal list-inside space-y-1 text-xs">
                    <li>Ketuk ikon <strong>Bagikan / Share</strong> (kotak dengan panah mengarah ke atas) di bilah bawah Safari.</li>
                    <li>Gulir ke bawah dan ketuk opsi <strong>"Tambahkan ke Layar Utama" (Add to Home Screen)</strong>.</li>
                    <li>Ketuk <strong>"Tambah"</strong> di kanan atas.</li>
                  </ol>
                </div>

                <div className="p-3 rounded-lg bg-white dark:bg-[#1a1f29] border border-slate-200 dark:border-slate-800">
                  <p className="font-semibold text-slate-800 dark:text-slate-200 mb-1">
                    💻 Komputer Desktop (Chrome / Edge / Brave):
                  </p>
                  <ol className="list-decimal list-inside space-y-1 text-xs">
                    <li>Klik ikon <strong>Instal</strong> (berbentuk monitor atau panah unduh) di bilah alamat URL browser (sebelah kanan).</li>
                    <li>Atau buka Menu browser (⋮) → pilih <strong>"Instal Drive Photo &amp; Video Backup..."</strong>.</li>
                  </ol>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Keamanan OAuth, Batasan Browser & Informasi Aplikasi */}
      <section className="rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-[#14171f] p-5 sm:p-6 space-y-4">
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
          Keamanan, Izin & Informasi Aplikasi
        </h2>

        <div className="space-y-3 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
          <div className="flex items-start gap-2.5">
            <Shield className="h-4 w-4 shrink-0 text-slate-500 mt-0.5" />
            <div>
              <p className="font-semibold text-slate-800 dark:text-slate-200">
                Izin OAuth Google Drive & Privasi Token
              </p>
              <p className="mt-0.5">
                Aplikasi menggunakan izin Google Drive agar dapat membaca folder existing, menelusuri subfolder bersarang, menampilkan foto yang sudah ada, serta mengupload foto baru ke folder root pilihan Anda. Token akses hanya disimpan sementara di memori sesi browser dan tidak pernah disimpan di IndexedDB atau dicatat pada log. Pencadangan bersifat satu arah (lokal ke Drive) dan tidak pernah menghapus file secara otomatis.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-2.5">
            <Smartphone className="h-4 w-4 shrink-0 text-slate-500 mt-0.5" />
            <div>
              <p className="font-semibold text-slate-800 dark:text-slate-200">
                Batasan Aplikasi Web & Rencana Native Android
              </p>
              <p className="mt-0.5">
                Aplikasi web ini mendukung upload persisten selama tab aplikasi aktif serta pemulihan antrean ketika halaman dibuka kembali. Untuk pencadangan latar belakang penuh ketika browser ditutup atau layar terkunci dalam waktu lama, diperlukan aplikasi Android native terpisah dengan Foreground Service.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-2.5">
            <Info className="h-4 w-4 shrink-0 text-slate-500 mt-0.5" />
            <div>
              <p className="font-semibold text-slate-800 dark:text-slate-200">
                Google Drive Photo &amp; Video Backup
              </p>
              <p className="mt-0.5">
                Arsitektur modular React · TypeScript · Google Drive API v3 Resumable Upload · IndexedDB Persistent Queue · Web Worker SHA-256.
              </p>
            </div>
          </div>
        </div>
      </section>

      <ConfirmDialog
        open={confirmLogoutOpen}
        title="Putuskan Akun Google?"
        description="Sesi akses Google Drive di browser ini akan dihapus. Foto yang sudah dicadangkan di Google Drive tetap aman dan tidak terhapus."
        confirmLabel="Putuskan Akun"
        cancelLabel="Batal"
        variant="danger"
        onConfirm={() => {
          setConfirmLogoutOpen(false);
          onSignOut();
        }}
        onCancel={() => setConfirmLogoutOpen(false)}
      />
    </div>
  );
};
