import React from 'react';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  CloudUpload,
  Folder,
  FolderOpen,
  HardDrive,
  Images,
  RefreshCw,
  ShieldCheck,
  UploadCloud,
} from 'lucide-react';
import {
  AppSection,
  AppSettings,
  AuthState,
  DriveStats,
  DriveStorageQuota,
  RecentAlbumRef,
} from '../types';
import { UploadQueueSnapshot } from '../services/UploadService';
import { formatFileSize, formatIndonesianDateTime } from '../utils/formatters';
import { DriveThumbnail } from './DriveThumbnail';
import { GoogleDriveStorageMonitor } from './GoogleDriveStorageMonitor';
import { GoogleSignInButton } from './GoogleSignInButton';

interface BerandaViewProps {
  authState: AuthState;
  isSigningIn: boolean;
  settings: AppSettings;
  stats: DriveStats | null;
  statsLoading: boolean;
  statsError: string | null;
  storageQuota: DriveStorageQuota | null;
  storageQuotaLoading: boolean;
  storageQuotaError: string | null;
  uploadSnapshot: UploadQueueSnapshot;
  onSignIn: () => void;
  onOpenFolderPicker: () => void;
  onRefreshStats: () => void;
  onRefreshStorageQuota: () => void;
  onNavigate: (section: AppSection) => void;
  onOpenAlbum: (album: RecentAlbumRef) => void;
  onOpenUploadQueue: () => void;
}

export const BerandaView: React.FC<BerandaViewProps> = ({
  authState,
  isSigningIn,
  settings,
  stats,
  statsLoading,
  statsError,
  storageQuota,
  storageQuotaLoading,
  storageQuotaError,
  uploadSnapshot,
  onSignIn,
  onOpenFolderPicker,
  onRefreshStats,
  onRefreshStorageQuota,
  onNavigate,
  onOpenAlbum,
  onOpenUploadQueue,
}) => {
  const isConnected = authState.hasValidToken && Boolean(authState.user);
  const rootFolder = settings.rootFolder;
  const hasActiveUpload =
    uploadSnapshot.activeCount > 0 ||
    uploadSnapshot.waitingCount > 0 ||
    uploadSnapshot.needsAttentionCount > 0;

  return (
    <div className="space-y-8">
      {/* Connection & Primary Hero Action */}
      <section className="rounded-3xl border border-slate-200/90 dark:border-slate-800 bg-[#f8f9fa] dark:bg-[#14171f] p-5 sm:p-7">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-2 max-w-2xl">
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <span
                className={`font-semibold ${
                  isConnected
                    ? 'text-emerald-700 dark:text-emerald-400'
                    : authState.tokenExpired
                      ? 'text-amber-700 dark:text-amber-400'
                      : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                {isConnected
                  ? 'Google Drive Terhubung'
                  : authState.tokenExpired
                    ? 'Sesi Google Perlu Diperbarui'
                    : 'Google Drive Belum Terhubung'}
              </span>
              {authState.user?.email && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="truncate">{authState.user.email}</span>
                </>
              )}
              {rootFolder && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="truncate">Folder Root: {rootFolder.name}</span>
                </>
              )}
            </div>

            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100 text-balance">
              {isConnected
                ? rootFolder
                  ? `Pencadangan Foto Asli ke ${rootFolder.name}`
                  : 'Pilih Folder Root Google Drive Anda'
                : 'Cadangkan Foto Kualitas Asli ke Google Drive'}
            </h2>

            <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-400">
              {isConnected
                ? rootFolder
                  ? 'Foto dicadangkan dalam berkas biner asli tanpa kompresi dan tersusun mengikuti struktur folder Google Drive Anda.'
                  : 'Tentukan satu folder utama di Google Drive (misalnya PHOTO BACKUP) untuk menampilkan galeri, album, dan tujuan pencadangan.'
                : 'Hubungkan akun Google Anda untuk mengakses folder Drive secara langsung, mengelola album, dan mencadangkan foto tanpa modifikasi kualitas.'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 shrink-0">
            {!isConnected ? (
              <GoogleSignInButton
                onClick={onSignIn}
                loading={isSigningIn}
                label={
                  authState.tokenExpired
                    ? 'Hubungkan Kembali Google'
                    : 'Masuk dengan Google'
                }
              />
            ) : !rootFolder ? (
              <button
                type="button"
                onClick={onOpenFolderPicker}
                className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-2xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-700 transition-colors whitespace-nowrap"
              >
                <FolderOpen className="h-5 w-5" />
                Pilih Folder Root Drive
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => onNavigate('cadangkan')}
                  className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-2xl bg-blue-600 px-6 py-3 text-sm font-semibold text-white hover:bg-blue-700 transition-colors whitespace-nowrap"
                >
                  <CloudUpload className="h-5 w-5" />
                  Cadangkan Foto
                </button>
                <button
                  type="button"
                  onClick={onOpenFolderPicker}
                  className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-2xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#1a1f29] px-4 py-3 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap"
                >
                  Ganti Folder Root
                </button>
              </>
            )}
          </div>
        </div>

        {authState.error && (
          <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-red-200 dark:border-red-900/70 bg-red-50 dark:bg-red-950/40 px-4 py-3 text-xs text-red-700 dark:text-red-300">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{authState.error}</span>
          </div>
        )}
      </section>

      {/* Active / Interrupted Upload Banner */}
      {hasActiveUpload && (
        <section className="rounded-2xl border border-blue-200 dark:border-blue-900/70 bg-blue-50/70 dark:bg-blue-950/30 p-4 sm:p-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3 min-w-0">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white">
                <UploadCloud className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {uploadSnapshot.activeCount > 0
                    ? `Sedang mengupload ${uploadSnapshot.activeCount} foto (${uploadSnapshot.overallProgress}%)`
                    : uploadSnapshot.needsAttentionCount > 0
                      ? `${uploadSnapshot.needsAttentionCount} tugas upload memerlukan perhatian Anda`
                      : `${uploadSnapshot.waitingCount} foto menunggu dalam antrean`}
                </h3>
                <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-400 tabular-nums">
                  {uploadSnapshot.completedCount} selesai · {uploadSnapshot.failedCount} gagal ·{' '}
                  {formatFileSize(uploadSnapshot.uploadedBytes)} dari{' '}
                  {formatFileSize(uploadSnapshot.totalBytes)}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onOpenUploadQueue}
              className="inline-flex min-h-[42px] items-center justify-center gap-2 rounded-xl bg-white dark:bg-[#171a21] border border-blue-200 dark:border-blue-800 px-4 py-2 text-xs font-semibold text-blue-700 dark:text-blue-300 hover:bg-blue-100/60 dark:hover:bg-blue-950/60 transition-colors whitespace-nowrap shrink-0"
            >
              Kelola Antrean
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-blue-200/70 dark:bg-blue-950">
            <div
              className="h-full rounded-full bg-blue-600 dark:bg-blue-400 transition-all duration-200"
              style={{ width: `${uploadSnapshot.overallProgress}%` }}
            />
          </div>
        </section>
      )}

      {/* Google Drive Storage Monitor */}
      <GoogleDriveStorageMonitor
        authState={authState}
        storageQuota={storageQuota}
        loading={storageQuotaLoading}
        error={storageQuotaError}
        onRefresh={onRefreshStorageQuota}
        onSignIn={onSignIn}
      />

      {/* Real Google Drive Statistics */}
      <section aria-labelledby="stats-heading">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div>
            <h3
              id="stats-heading"
              className="text-base font-semibold text-slate-900 dark:text-slate-100"
            >
              Ringkasan Google Drive
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {stats?.lastSyncedAt
                ? `Terakhir disinkronkan ${formatIndonesianDateTime(stats.lastSyncedAt)}`
                : 'Statistik dihitung langsung dari folder Google Drive Anda'}
            </p>
          </div>

          {isConnected && rootFolder && (
            <button
              type="button"
              onClick={onRefreshStats}
              disabled={statsLoading}
              className="inline-flex min-h-[40px] items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#171a21] px-3.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 transition-colors whitespace-nowrap"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${statsLoading ? 'animate-spin' : ''}`} />
              Muat Ulang
            </button>
          )}
        </div>

        {statsError && (
          <div className="mb-4 rounded-xl border border-red-200 dark:border-red-900/70 bg-red-50 dark:bg-red-950/40 px-4 py-3 text-xs text-red-700 dark:text-red-300">
            {statsError}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-[#14171f] p-5">
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
              <span className="text-xs font-medium">Total Foto Terakses</span>
              <Images className="h-4 w-4" />
            </div>
            <p className="mt-3 text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100 tabular-nums">
              {!isConnected || !rootFolder
                ? '—'
                : statsLoading
                  ? '...'
                  : stats
                    ? `${stats.totalPhotos.toLocaleString('id-ID')}${stats.isPartial ? '+' : ''}`
                    : '0'}
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {isConnected && rootFolder
                ? 'Foto di dalam folder root & subfolder'
                : 'Hubungkan Drive & pilih folder root'}
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-[#14171f] p-5">
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
              <span className="text-xs font-medium">Total Album (Folder)</span>
              <Folder className="h-4 w-4" />
            </div>
            <p className="mt-3 text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100 tabular-nums">
              {!isConnected || !rootFolder
                ? '—'
                : statsLoading
                  ? '...'
                  : stats
                    ? stats.totalAlbums.toLocaleString('id-ID')
                    : '0'}
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {isConnected && rootFolder
                ? 'Struktur subfolder aktual di Drive'
                : 'Belum ada folder root terkonfigurasi'}
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-[#14171f] p-5">
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
              <span className="text-xs font-medium">Status Akses Folder</span>
              <HardDrive className="h-4 w-4" />
            </div>
            <p className="mt-3 truncate text-lg font-semibold text-slate-900 dark:text-slate-100">
              {rootFolder ? rootFolder.name : 'Belum dipilih'}
            </p>
            <p className="mt-1.5 flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
              {isConnected && rootFolder ? (
                <>
                  <ShieldCheck className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <span>Izin baca & upload terverifikasi</span>
                </>
              ) : (
                <span>Menunggu konfigurasi folder</span>
              )}
            </p>
          </div>
        </div>
      </section>

      {/* Two-column lower section: Recent Albums + Recent Backup Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Recently Accessed Albums */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Album Baru Diakses
            </h3>
            {isConnected && rootFolder && (
              <button
                type="button"
                onClick={() => onNavigate('album')}
                className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline"
              >
                Lihat Semua Album
              </button>
            )}
          </div>

          {settings.recentAlbums.length === 0 ? (
            <div className="rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-slate-50/50 dark:bg-[#14171f] p-6 text-center">
              <Folder className="mx-auto h-7 w-7 text-slate-300 dark:text-slate-600" />
              <p className="mt-2 text-sm font-medium text-slate-700 dark:text-slate-300">
                Belum ada riwayat album dibuka
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Buka folder album di menu Album untuk melihat pintasan akses cepat di sini.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {settings.recentAlbums.map((album) => (
                <button
                  key={album.id}
                  type="button"
                  onClick={() => onOpenAlbum(album)}
                  className="group flex flex-col overflow-hidden rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-[#14171f] text-left hover:border-blue-300 dark:hover:border-blue-700 transition-colors"
                >
                  <div className="aspect-4/3 w-full overflow-hidden bg-slate-100 dark:bg-slate-800">
                    {album.coverThumbnailLink ? (
                      <DriveThumbnail
                        thumbnailLink={album.coverThumbnailLink}
                        alt={album.name}
                        className="h-full w-full object-cover group-hover:scale-103 transition-transform duration-200"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-slate-400 dark:text-slate-500">
                        <Folder className="h-8 w-8" />
                      </div>
                    )}
                  </div>
                  <div className="p-3">
                    <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                      {album.name}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                      {typeof album.photoCount === 'number'
                        ? `${album.photoCount} foto`
                        : formatIndonesianDateTime(album.accessedAt)}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>

        {/* Recent Backup Activity */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Aktivitas Pencadangan Terbaru
            </h3>
            <button
              type="button"
              onClick={onOpenUploadQueue}
              className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline"
            >
              Buka Antrean
            </button>
          </div>

          {uploadSnapshot.activities.length === 0 ? (
            <div className="rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-slate-50/50 dark:bg-[#14171f] p-6 text-center">
              <CloudUpload className="mx-auto h-7 w-7 text-slate-300 dark:text-slate-600" />
              <p className="mt-2 text-sm font-medium text-slate-700 dark:text-slate-300">
                Belum ada aktivitas upload
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Riwayat foto yang selesai atau gagal dicadangkan akan tercatat secara otomatis di sini.
              </p>
            </div>
          ) : (
            <div className="rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-[#14171f] divide-y divide-slate-100 dark:divide-slate-800/80 overflow-hidden">
              {uploadSnapshot.activities.slice(0, 6).map((item) => (
                <div key={item.id} className="flex items-center gap-3 px-4 py-3">
                  {item.status === 'completed' ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                  ) : item.status === 'failed' ? (
                    <AlertCircle className="h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
                  ) : (
                    <Folder className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                      {item.fileName}
                    </p>
                    <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                      {item.destinationFolderName}
                      {item.relativeFolderPath ? ` / ${item.relativeFolderPath}` : ''} ·{' '}
                      <span className="font-mono-tabular">{formatFileSize(item.fileSize)}</span>
                    </p>
                  </div>
                  <span className="shrink-0 text-[11px] text-slate-400 tabular-nums">
                    {formatIndonesianDateTime(item.timestamp)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
