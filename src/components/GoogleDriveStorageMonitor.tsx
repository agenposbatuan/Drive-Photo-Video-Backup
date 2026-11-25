import React from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  HardDrive,
  Info,
  RefreshCw,
  Trash2,
  XCircle,
} from 'lucide-react';
import { AuthState, DriveStorageQuota } from '../types';
import { formatIndonesianDateTime } from '../utils/formatters';

interface GoogleDriveStorageMonitorProps {
  authState: AuthState;
  storageQuota: DriveStorageQuota | null;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
  onSignIn?: () => void;
}

export const GoogleDriveStorageMonitor: React.FC<GoogleDriveStorageMonitorProps> = ({
  authState,
  storageQuota,
  loading,
  error,
  onRefresh,
  onSignIn,
}) => {
  const isConnected = authState.hasValidToken && Boolean(authState.user);
  const isProblematic = authState.tokenExpired || Boolean(error);

  // Status koneksi akun
  const connectionStatus = !isConnected
    ? {
        label: 'Tidak Terhubung',
        color: 'text-slate-600 dark:text-slate-400',
        badgeBg: 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300',
        dot: 'bg-slate-400',
      }
    : isProblematic
      ? {
          label: 'Koneksi Bermasalah',
          color: 'text-amber-700 dark:text-amber-400',
          badgeBg: 'bg-amber-100 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800',
          dot: 'bg-amber-500 animate-pulse',
        }
      : {
          label: 'Aktif',
          color: 'text-emerald-700 dark:text-emerald-400',
          badgeBg: 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60',
          dot: 'bg-emerald-500',
        };

  // Indikator level kuota
  const quotaLevel = storageQuota?.status ?? 'normal';
  const progressBarColor =
    quotaLevel === 'full'
      ? 'bg-red-600 dark:bg-red-500'
      : quotaLevel === 'critical'
        ? 'bg-orange-600 dark:bg-orange-500'
        : quotaLevel === 'warning'
          ? 'bg-amber-500'
          : 'bg-blue-600 dark:bg-blue-500';

  const statusAlertText =
    quotaLevel === 'full'
      ? 'Kapasitas penyimpanan Google Drive Anda telah penuh (100%). Pencadangan baru tidak dapat diunggah hingga ruang dikosongkan.'
      : quotaLevel === 'critical'
        ? 'Peringatan Kritis: Kapasitas penyimpanan Google Drive Anda hampir penuh (>90%).'
        : quotaLevel === 'warning'
          ? 'Peringatan: Kapasitas penyimpanan Google Drive Anda mulai mendekati penuh (≥75%).'
          : null;

  return (
    <section
      aria-labelledby="drive-storage-heading"
      className="rounded-3xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-[#14171f] p-5 sm:p-6 shadow-xs transition-all"
    >
      {/* Header Panel: Ikon Drive, Nama Layanan, Badge Status, Tombol Refresh */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800/80">
        <div className="flex items-center gap-3">
          {/* Ikon Google Drive Resmi (SVG Multi-Warna) */}
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-slate-50 dark:bg-[#1a1f29] border border-slate-200/80 dark:border-slate-700/80 shadow-2xs">
            <svg
              className="h-6 w-6"
              viewBox="0 0 87.3 78"
              xmlns="http://www.w3.org/2000/svg"
              aria-label="Google Drive"
            >
              <path
                d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8h-27.5c0 1.55.4 3.1 1.2 4.5z"
                fill="#0066da"
              />
              <path
                d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44a9.06 9.06 0 0 0 -1.2 4.5h27.5z"
                fill="#00ac47"
              />
              <path
                d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5h-27.502l5.852 11.5z"
                fill="#ea4335"
              />
              <path
                d="m43.65 25 13.75-23.8c-1.35-.8-2.9-1.2-4.5-1.2h-18.5c-1.6 0-3.15.45-4.5 1.2z"
                fill="#00832d"
              />
              <path
                d="m59.8 53h-32.3l-13.75 23.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z"
                fill="#2684fc"
              />
              <path
                d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3l-13.75 23.8 16.15 28h27.45c0-1.55-.4-3.1-1.2-4.5z"
                fill="#ffba00"
              />
            </svg>
          </div>

          <div>
            <div className="flex items-center gap-2">
              <h3
                id="drive-storage-heading"
                className="text-base font-bold text-slate-900 dark:text-slate-100"
              >
                Google Drive
              </h3>
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${connectionStatus.badgeBg}`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${connectionStatus.dot}`} />
                {connectionStatus.label}
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {isConnected && (authState.user?.email || storageQuota?.user?.emailAddress) ? (
                <span className="truncate">
                  Akun: {authState.user?.email || storageQuota?.user?.emailAddress}
                </span>
              ) : (
                'Monitor kapasitas penyimpanan cloud aktual'
              )}
            </p>
          </div>
        </div>

        {/* Tombol Refresh Manual */}
        <div className="flex items-center gap-2 self-start sm:self-center">
          {isConnected && (
            <button
              type="button"
              onClick={onRefresh}
              disabled={loading}
              title="Perbarui informasi kapasitas dari Google Drive"
              className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-[#1a1f29] px-3.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white disabled:opacity-50 transition-colors whitespace-nowrap"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin text-blue-600' : ''}`} />
              <span>{loading ? 'Menyinkronkan...' : 'Perbarui'}</span>
            </button>
          )}

          {!isConnected && onSignIn && (
            <button
              type="button"
              onClick={onSignIn}
              className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 transition-colors whitespace-nowrap"
            >
              Hubungkan Akun
            </button>
          )}
        </div>
      </div>

      {/* Alert Error jika gagal memuat kuota */}
      {error && isConnected && (
        <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/40 p-3 text-xs text-red-700 dark:text-red-300">
          <XCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-semibold">Gagal memuat kapasitas penyimpanan:</p>
            <p className="mt-0.5">{error}</p>
          </div>
        </div>
      )}

      {/* Alert Peringatan Kapasitas (Warning / Critical / Full) */}
      {statusAlertText && (
        <div
          className={`mt-4 flex items-start gap-2.5 rounded-xl border p-3 text-xs ${
            quotaLevel === 'full'
              ? 'border-red-200 dark:border-red-900/70 bg-red-50 dark:bg-red-950/40 text-red-800 dark:text-red-200'
              : quotaLevel === 'critical'
                ? 'border-orange-200 dark:border-orange-900/70 bg-orange-50 dark:bg-orange-950/40 text-orange-800 dark:text-orange-200'
                : 'border-amber-200 dark:border-amber-900/70 bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-200'
          }`}
        >
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <p className="flex-1 leading-relaxed">{statusAlertText}</p>
        </div>
      )}

      {/* Progress Bar Penggunaan Penyimpanan */}
      <div className="mt-5 space-y-2">
        <div className="flex items-center justify-between text-xs font-medium">
          <span className="text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
            <HardDrive className="h-3.5 w-3.5 text-slate-500" />
            Penggunaan Penyimpanan Cloud
          </span>
          <span className="font-mono-tabular font-bold text-slate-900 dark:text-slate-100">
            {isConnected && storageQuota
              ? storageQuota.limit !== undefined
                ? `${storageQuota.percentFormatted} (${storageQuota.usageFormattedGB} / ${storageQuota.limitFormattedGB})`
                : `${storageQuota.usageFormattedGB} Terpakai (Tanpa Batas)`
              : '— / —'}
          </span>
        </div>

        <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800 shadow-inner">
          <div
            role="progressbar"
            aria-valuenow={isConnected && storageQuota ? storageQuota.percentUsed : 0}
            aria-valuemin={0}
            aria-valuemax={100}
            className={`h-full rounded-full transition-all duration-300 ${progressBarColor}`}
            style={{
              width: `${isConnected && storageQuota ? Math.max(1, Math.min(100, storageQuota.percentUsed)) : 0}%`,
            }}
          />
        </div>
      </div>

      {/* Grid 4 Metrik: Terpakai, Total, Tersedia, Persentase (Desktop: 4 Col, Mobile: 2x2) */}
      <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        {/* Metrik 1: Terpakai */}
        <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800/80 bg-slate-50/60 dark:bg-[#171a21] p-3.5 sm:p-4">
          <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
            Terpakai
          </span>
          <p className="mt-1.5 text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 font-mono-tabular">
            {isConnected && storageQuota ? storageQuota.usageFormattedGB : '—'}
          </p>
          <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400 truncate">
            {isConnected && storageQuota?.usageInDrive !== undefined
              ? `File Drive: ${(storageQuota.usageInDrive / (1024 * 1024 * 1024)).toFixed(1)} GB`
              : 'Total seluruh file'}
          </p>
        </div>

        {/* Metrik 2: Total Kapasitas */}
        <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800/80 bg-slate-50/60 dark:bg-[#171a21] p-3.5 sm:p-4">
          <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
            Total Kapasitas
          </span>
          <p className="mt-1.5 text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 font-mono-tabular">
            {isConnected && storageQuota ? storageQuota.limitFormattedGB : '—'}
          </p>
          <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400 truncate">
            {isConnected && storageQuota?.limit ? 'Kapasitas akun Google' : 'Paket penyimpanan akun'}
          </p>
        </div>

        {/* Metrik 3: Sisa Tersedia */}
        <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800/80 bg-slate-50/60 dark:bg-[#171a21] p-3.5 sm:p-4">
          <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
            Sisa Tersedia
          </span>
          <p className="mt-1.5 text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 font-mono-tabular">
            {isConnected && storageQuota ? storageQuota.availableFormattedGB : '—'}
          </p>
          <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400 truncate">
            {isConnected && storageQuota?.available !== undefined ? 'Siap digunakan' : 'Ruang cloud bebas'}
          </p>
        </div>

        {/* Metrik 4: Persentase Penggunaan */}
        <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800/80 bg-slate-50/60 dark:bg-[#171a21] p-3.5 sm:p-4">
          <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
            Penggunaan
          </span>
          <p className="mt-1.5 text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 font-mono-tabular">
            {isConnected && storageQuota ? storageQuota.percentFormatted : '—'}
          </p>
          <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400 truncate">
            {isConnected && storageQuota
              ? quotaLevel === 'normal'
                ? 'Batas aman'
                : quotaLevel === 'warning'
                  ? 'Mendekati penuh'
                  : 'Kritis / Penuh'
              : 'Status kapasitas'}
          </p>
        </div>
      </div>

      {/* Footer Breakdown & Last Sync Information */}
      <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800/80 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {isConnected && storageQuota?.usageInDriveTrash !== undefined && storageQuota.usageInDriveTrash > 0 && (
            <span className="inline-flex items-center gap-1 text-slate-600 dark:text-slate-400">
              <Trash2 className="h-3 w-3 text-slate-400" />
              Sampah Drive: {(storageQuota.usageInDriveTrash / (1024 * 1024 * 1024)).toFixed(2)} GB
            </span>
          )}
          <span className="inline-flex items-center gap-1">
            <Info className="h-3 w-3 text-slate-400" />
            Kapasitas mencakup file Google Drive, Gmail, dan Google Foto
          </span>
        </div>

        {isConnected && storageQuota?.lastFetchedAt && (
          <span className="font-mono-tabular">
            Terakhir diperbarui: {formatIndonesianDateTime(storageQuota.lastFetchedAt)}
          </span>
        )}
      </div>
    </section>
  );
};
