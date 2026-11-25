import React, { useRef, useState } from 'react';
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  FileUp,
  Film,
  Folder,
  Gauge,
  Image,
  Pause,
  Play,
  RotateCcw,
  Trash2,
  UploadCloud,
  WifiOff,
  X,
  Zap,
} from 'lucide-react';
import { UploadTask } from '../types';
import { ConcurrencyMode, UploadQueueSnapshot, UploadService } from '../services/UploadService';
import {
  formatDurationMillis,
  formatFileSize,
  formatIndonesianDateTime,
  mapUploadStatusLabel,
} from '../utils/formatters';

interface UploadQueueDrawerProps {
  open: boolean;
  snapshot: UploadQueueSnapshot;
  onClose: () => void;
  onRequestAuth: () => void;
}

type QueueFilter = 'all' | 'active' | 'failed' | 'completed';

export const UploadQueueDrawer: React.FC<UploadQueueDrawerProps> = ({
  open,
  snapshot,
  onClose,
  onRequestAuth,
}) => {
  const [filter, setFilter] = useState<QueueFilter>('all');
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  const [reattachTaskId, setReattachTaskId] = useState<string | null>(null);
  const [reattachFeedback, setReattachFeedback] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  if (!open) return null;

  const filteredTasks = snapshot.tasks.filter((t) => {
    if (filter === 'active') {
      return (
        t.status === 'uploading' ||
        t.status === 'queued' ||
        t.status === 'checking_duplicate' ||
        t.status === 'paused' ||
        t.status === 'interrupted' ||
        t.status === 'waiting_auth' ||
        t.status === 'duplicate_pending' ||
        t.status === 'needs_file'
      );
    }
    if (filter === 'failed') {
      return t.status === 'failed' || t.status === 'interrupted' || t.status === 'needs_file';
    }
    if (filter === 'completed') {
      return t.status === 'completed' || t.status === 'skipped';
    }
    return true;
  });

  const handleTriggerReattach = (taskId: string) => {
    setReattachTaskId(taskId);
    setReattachFeedback(null);
    fileInputRef.current?.click();
  };

  const handleFileReattached = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !reattachTaskId) return;
    const res = await UploadService.reattachFileForTask(reattachTaskId, file);
    setReattachFeedback(res.message);
    setReattachTaskId(null);
  };

  const hasActiveOrWaiting = snapshot.activeCount > 0 || snapshot.waitingCount > 0;
  const hasPausedOrInterrupted = snapshot.tasks.some(
    (t) => t.status === 'paused' || t.status === 'interrupted' || t.status === 'waiting_auth'
  );
  const hasFailed = snapshot.failedCount > 0;
  const hasClearable = snapshot.tasks.some(
    (t) => t.status === 'completed' || t.status === 'skipped' || t.status === 'cancelled'
  );

  const uniqueDestinations = Array.from(
    new Set(snapshot.tasks.map((t) => t.destinationFolderName))
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-end lg:items-stretch lg:justify-end bg-black/50 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="upload-drawer-title"
    >
      {/* Hidden input untuk melampirkan ulang file yang hilang setelah reload */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,video/*,.mp4,.mov,.avi,.mkv,.webm"
        className="hidden"
        onChange={handleFileReattached}
      />

      <div
        className="fixed inset-0"
        onClick={onClose}
        aria-hidden="true"
      />

      <aside className="relative z-10 flex max-h-[88vh] lg:max-h-none w-full lg:w-[460px] flex-col rounded-t-3xl lg:rounded-none bg-white dark:bg-[#14171f] border-t lg:border-t-0 lg:border-l border-slate-200 dark:border-slate-800 shadow-2xl">
        {/* Mobile grab handle */}
        <div className="lg:hidden pt-3 pb-1 flex justify-center">
          <div className="h-1.5 w-10 rounded-full bg-slate-300 dark:bg-slate-700" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-slate-200 dark:border-slate-800">
          <div>
            <h2
              id="upload-drawer-title"
              className="text-base font-semibold text-slate-900 dark:text-slate-100"
            >
              Manajer Antrean Upload
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate max-w-[280px]">
              {uniqueDestinations.length > 0
                ? `Tujuan: ${uniqueDestinations.join(', ')}`
                : 'Antrean persisten berbasis IndexedDB'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            aria-label="Tutup panel antrean upload"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Network Offline Warning */}
        {!snapshot.isOnline && (
          <div className="mx-5 mt-3 flex items-center gap-2.5 rounded-xl border border-amber-200 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/40 px-3.5 py-2.5 text-xs text-amber-800 dark:text-amber-300">
            <WifiOff className="h-4 w-4 shrink-0" />
            <span>Koneksi internet terputus. Upload akan dilanjutkan otomatis saat jaringan tersambung kembali.</span>
          </div>
        )}

        {/* Storage warning */}
        {snapshot.storageWarning && (
          <div className="mx-5 mt-3 rounded-xl border border-amber-200 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/40 px-3.5 py-2.5 text-xs text-amber-800 dark:text-amber-300">
            {snapshot.storageWarning}
          </div>
        )}

        {reattachFeedback && (
          <div className="mx-5 mt-3 rounded-xl border border-blue-200 dark:border-blue-900/60 bg-blue-50 dark:bg-blue-950/40 px-3.5 py-2.5 text-xs text-blue-800 dark:text-blue-200">
            {reattachFeedback}
          </div>
        )}

        {/* Summary Metrics & Overall Progress */}
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 space-y-3 bg-slate-50/70 dark:bg-[#11141b]">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium text-slate-700 dark:text-slate-300">
              Progres Keseluruhan
            </span>
            <span className="font-mono-tabular font-semibold text-slate-900 dark:text-slate-100">
              {snapshot.overallProgress}% · {formatFileSize(snapshot.uploadedBytes)} /{' '}
              {formatFileSize(snapshot.totalBytes)}
            </span>
          </div>

          <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
            <div
              className="h-full rounded-full bg-blue-600 dark:bg-blue-500 transition-all duration-200"
              style={{ width: `${snapshot.overallProgress}%` }}
            />
          </div>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600 dark:text-slate-400 tabular-nums">
            <span>
              Aktif: <strong className="text-slate-900 dark:text-slate-100">{snapshot.activeCount}</strong>
            </span>
            <span aria-hidden="true">·</span>
            <span>
              Menunggu: <strong className="text-slate-900 dark:text-slate-100">{snapshot.waitingCount}</strong>
            </span>
            <span aria-hidden="true">·</span>
            <span>
              Selesai: <strong className="text-emerald-700 dark:text-emerald-400">{snapshot.completedCount}</strong>
            </span>
            <span aria-hidden="true">·</span>
            <span>
              Gagal: <strong className="text-red-600 dark:text-red-400">{snapshot.failedCount}</strong>
            </span>
            <span aria-hidden="true">·</span>
            <span>
              Total: <strong className="text-slate-900 dark:text-slate-100">{snapshot.tasks.length}</strong>
            </span>
          </div>

          {/* Live Performance & Adaptive Concurrency Dashboard */}
          <div className="rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-[#171a21] p-3 space-y-2.5">
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="flex items-center gap-2">
                <Gauge className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0" />
                <div className="min-w-0">
                  <p className="text-[10px] text-slate-500">Kecepatan Transfer</p>
                  <p className="font-mono-tabular font-semibold text-slate-900 dark:text-slate-100 truncate">
                    {snapshot.transferSpeedBytesPerSec > 0
                      ? `${formatFileSize(snapshot.transferSpeedBytesPerSec)}/dtk`
                      : snapshot.activeCount > 0 ? 'Mengukur...' : '-'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <div className="min-w-0">
                  <p className="text-[10px] text-slate-500">Estimasi Sisa Waktu</p>
                  <p className="font-mono-tabular font-semibold text-slate-900 dark:text-slate-100 truncate">
                    {snapshot.estimatedRemainingSeconds !== null && snapshot.estimatedRemainingSeconds > 0
                      ? formatDurationMillis(snapshot.estimatedRemainingSeconds * 1000)
                      : snapshot.activeCount > 0 ? 'Menghitung...' : '-'}
                  </p>
                </div>
              </div>
            </div>

            {/* Concurrency Selector */}
            <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-[11px] text-slate-600 dark:text-slate-400">
                <Zap className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                <span>Mode Paralel:</span>
                <span className="font-semibold text-slate-900 dark:text-slate-200">
                  {snapshot.effectiveConcurrency}x
                </span>
              </div>
              <div className="flex items-center gap-1">
                {(
                  [
                    { id: 'saver' as ConcurrencyMode, label: 'Hemat (1x)' },
                    { id: 'balanced' as ConcurrencyMode, label: 'Seimbang (2x)' },
                    { id: 'speed' as ConcurrencyMode, label: 'Cepat (4x)' },
                  ] as const
                ).map((mode) => (
                  <button
                    key={mode.id}
                    type="button"
                    onClick={() => UploadService.setConcurrencyMode(mode.id)}
                    className={`rounded-lg px-2 py-1 text-[10px] font-medium transition-colors ${
                      snapshot.concurrencyMode === mode.id
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                    }`}
                  >
                    {mode.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Global Controls */}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            {hasActiveOrWaiting && !snapshot.isGlobalPaused && (
              <button
                type="button"
                onClick={() => UploadService.pauseAll()}
                className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#171a21] px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap"
              >
                <Pause className="h-3.5 w-3.5" />
                Jeda Semua
              </button>
            )}

            {(snapshot.isGlobalPaused || hasPausedOrInterrupted) && (
              <button
                type="button"
                onClick={() => UploadService.resumeAll()}
                className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 transition-colors whitespace-nowrap"
              >
                <Play className="h-3.5 w-3.5" />
                Lanjutkan
              </button>
            )}

            {hasFailed && (
              <button
                type="button"
                onClick={() => UploadService.retryAllFailed()}
                className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#171a21] px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Coba Ulang Gagal
              </button>
            )}

            {hasClearable && (
              <button
                type="button"
                onClick={() => void UploadService.clearCompletedTasks()}
                className="ml-auto inline-flex min-h-[38px] items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-200/70 dark:hover:bg-slate-800 transition-colors whitespace-nowrap"
                title="Hanya membersihkan daftar riwayat lokal, tidak menghapus foto di Google Drive"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Bersihkan Selesai
              </button>
            )}
          </div>
        </div>

        {/* Filter Segmented Control */}
        <div className="px-5 py-2.5 border-b border-slate-200 dark:border-slate-800">
          <div className="grid grid-cols-4 gap-1 rounded-xl bg-slate-100 dark:bg-[#1a1f29] p-1">
            {(
              [
                { id: 'all', label: 'Semua' },
                { id: 'active', label: 'Berjalan' },
                { id: 'failed', label: 'Kendala' },
                { id: 'completed', label: 'Selesai' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFilter(tab.id)}
                className={`min-h-[34px] rounded-lg px-2 text-xs font-medium transition-colors whitespace-nowrap ${
                  filter === tab.id
                    ? 'bg-white dark:bg-[#262d3b] text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Task List */}
        <div className="flex-1 overflow-y-auto px-5 py-3 space-y-2.5 min-h-[200px]">
          {filteredTasks.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-14 text-center">
              <UploadCloud className="h-9 w-9 text-slate-300 dark:text-slate-600" />
              <p className="mt-3 text-sm font-medium text-slate-700 dark:text-slate-300">
                Belum ada tugas pada kategori ini
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 max-w-xs">
                Pilih foto atau folder di menu Cadangkan untuk mulai mencadangkan file asli ke Google Drive.
              </p>
            </div>
          ) : (
            filteredTasks.map((task) => (
              <UploadTaskRow
                key={task.id}
                task={task}
                expanded={expandedTaskId === task.id}
                onToggleExpand={() =>
                  setExpandedTaskId((curr) => (curr === task.id ? null : task.id))
                }
                onReattach={() => handleTriggerReattach(task.id)}
                onRequestAuth={onRequestAuth}
              />
            ))
          )}
        </div>

        {/* Footer note */}
        <div className="border-t border-slate-200 dark:border-slate-800 px-5 py-3 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400 bg-slate-50/70 dark:bg-[#11141b]">
          Upload tetap berjalan saat Anda berpindah halaman di dalam aplikasi. Membersihkan daftar selesai tidak akan menghapus foto yang sudah ada di Google Drive.
        </div>
      </aside>
    </div>
  );
};

interface UploadTaskRowProps {
  task: UploadTask;
  expanded: boolean;
  onToggleExpand: () => void;
  onReattach: () => void;
  onRequestAuth: () => void;
}

const UploadTaskRow: React.FC<UploadTaskRowProps> = ({
  task,
  expanded,
  onToggleExpand,
  onReattach,
  onRequestAuth,
}) => {
  const statusColor =
    task.status === 'completed'
      ? 'text-emerald-600 dark:text-emerald-400'
      : task.status === 'failed' || task.status === 'needs_file'
        ? 'text-red-600 dark:text-red-400'
        : task.status === 'uploading' || task.status === 'checking_duplicate'
          ? 'text-blue-600 dark:text-blue-400'
          : 'text-amber-600 dark:text-amber-400';

  const isVideo = task.mimeType?.startsWith('video/') || false;

  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#171a21] p-3.5">
      <div className="flex items-start justify-between gap-2.5">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            {isVideo ? (
              <Film className="h-3.5 w-3.5 text-indigo-500 shrink-0" aria-label="File video" />
            ) : (
              <Image className="h-3.5 w-3.5 text-blue-500 shrink-0" aria-label="File foto" />
            )}
            <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
              {task.fileName}
            </p>
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500 dark:text-slate-400">
            <span className={`font-medium ${statusColor}`}>
              {mapUploadStatusLabel(task.status)}
            </span>
            <span aria-hidden="true">·</span>
            <span className="font-mono-tabular">
              {formatFileSize(task.bytesUploaded)} / {formatFileSize(task.fileSize)}
            </span>
            <span aria-hidden="true">·</span>
            <span className="uppercase text-[10px] font-semibold tracking-wider text-slate-400">
              {isVideo ? 'Video' : 'Foto'}
            </span>
          </div>
          {task.relativeFolderPath && (
            <p className="mt-1 flex items-center gap-1 truncate text-[11px] text-slate-500 dark:text-slate-400">
              <Folder className="h-3 w-3 shrink-0" />
              <span className="truncate">
                {task.destinationFolderName} / {task.relativeFolderPath}
              </span>
            </p>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {task.status === 'completed' && (
            <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 mr-1" />
          )}
          {(task.status === 'failed' || task.status === 'needs_file') && (
            <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-400 mr-1" />
          )}
          {task.status === 'queued' && (
            <Clock className="h-4 w-4 text-slate-400 mr-1" />
          )}

          <button
            type="button"
            onClick={onToggleExpand}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-200"
            aria-label="Lihat detail tugas"
          >
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* Progress bar */}
      {(task.status === 'uploading' ||
        task.status === 'paused' ||
        task.status === 'interrupted' ||
        task.status === 'checking_duplicate') && (
        <div className="mt-2.5 flex items-center gap-2.5">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
            <div
              className={`h-full rounded-full transition-all duration-150 ${
                task.status === 'paused' || task.status === 'interrupted'
                  ? 'bg-amber-500'
                  : 'bg-blue-600 dark:bg-blue-500'
              }`}
              style={{ width: `${task.progress}%` }}
            />
          </div>
          <span className="font-mono-tabular text-[11px] font-medium text-slate-600 dark:text-slate-300 w-9 text-right">
            {task.progress}%
          </span>
        </div>
      )}

      {/* Error message */}
      {task.lastError && task.status !== 'completed' && (
        <p className="mt-2 text-xs leading-relaxed text-red-600 dark:text-red-400">
          {task.lastError}
        </p>
      )}

      {/* Action buttons */}
      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        {(task.status === 'uploading' || task.status === 'queued') && (
          <button
            type="button"
            onClick={() => UploadService.pauseTask(task.id)}
            className="inline-flex min-h-[34px] items-center gap-1 rounded-lg border border-slate-200 dark:border-slate-700 px-2.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            <Pause className="h-3.5 w-3.5" />
            Jeda
          </button>
        )}

        {(task.status === 'paused' || task.status === 'interrupted') && (
          <button
            type="button"
            onClick={() => UploadService.resumeTask(task.id)}
            className="inline-flex min-h-[34px] items-center gap-1 rounded-lg bg-blue-600 px-2.5 text-xs font-medium text-white hover:bg-blue-700"
          >
            <Play className="h-3.5 w-3.5" />
            Lanjutkan
          </button>
        )}

        {task.status === 'failed' && (
          <button
            type="button"
            onClick={() => UploadService.retryTask(task.id)}
            className="inline-flex min-h-[34px] items-center gap-1 rounded-lg bg-blue-600 px-2.5 text-xs font-medium text-white hover:bg-blue-700"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Coba Ulang
          </button>
        )}

        {task.status === 'waiting_auth' && (
          <button
            type="button"
            onClick={onRequestAuth}
            className="inline-flex min-h-[34px] items-center gap-1 rounded-lg bg-blue-600 px-2.5 text-xs font-medium text-white hover:bg-blue-700"
          >
            Hubungkan Google
          </button>
        )}

        {task.status === 'needs_file' && (
          <button
            type="button"
            onClick={onReattach}
            className="inline-flex min-h-[34px] items-center gap-1 rounded-lg bg-blue-600 px-2.5 text-xs font-medium text-white hover:bg-blue-700"
          >
            <FileUp className="h-3.5 w-3.5" />
            Pilih Ulang File
          </button>
        )}

        {task.status !== 'completed' &&
          task.status !== 'cancelled' &&
          task.status !== 'skipped' && (
            <button
              type="button"
              onClick={() => UploadService.cancelTask(task.id)}
              className="inline-flex min-h-[34px] items-center gap-1 rounded-lg px-2.5 text-xs font-medium text-slate-500 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40 dark:hover:text-red-400"
            >
              Batalkan
            </button>
          )}
      </div>

      {/* Expandable Details */}
      {expanded && (
        <dl className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 grid grid-cols-2 gap-x-3 gap-y-2 text-[11px]">
          <div className="col-span-2">
            <dt className="text-slate-400">ID Tugas</dt>
            <dd className="font-mono-tabular break-all text-slate-700 dark:text-slate-300">
              {task.id}
            </dd>
          </div>
          <div>
            <dt className="text-slate-400">Tipe MIME</dt>
            <dd className="font-mono-tabular text-slate-700 dark:text-slate-300">{task.mimeType}</dd>
          </div>
          <div>
            <dt className="text-slate-400">Percobaan Ulang</dt>
            <dd className="font-mono-tabular text-slate-700 dark:text-slate-300">
              {task.retryCount}x
            </dd>
          </div>
          <div>
            <dt className="text-slate-400">Dibuat</dt>
            <dd className="text-slate-700 dark:text-slate-300">
              {formatIndonesianDateTime(task.createdAt)}
            </dd>
          </div>
          <div>
            <dt className="text-slate-400">Sesi Resumable</dt>
            <dd className="text-slate-700 dark:text-slate-300">
              {task.resumableSessionUri ? 'Aktif tersimpan' : 'Belum / Selesai'}
            </dd>
          </div>
          <div>
            <dt className="text-slate-400">Salinan Lokal IndexedDB</dt>
            <dd className="text-slate-700 dark:text-slate-300">
              {task.hasPersistedBlob ? 'Tersedia' : 'Tidak disimpan'}
            </dd>
          </div>
          {task.verifiedIntegrity !== undefined && (
            <div>
              <dt className="text-slate-400">Verifikasi Integritas</dt>
              <dd className="text-slate-700 dark:text-slate-300">
                {task.verifiedIntegrity ? 'Ukuran byte cocok' : 'Perlu dicek'}
              </dd>
            </div>
          )}
          {task.contentHash && (
            <div className="col-span-2">
              <dt className="text-slate-400">SHA-256</dt>
              <dd className="font-mono-tabular break-all text-slate-600 dark:text-slate-400">
                {task.contentHash}
              </dd>
            </div>
          )}
        </dl>
      )}
    </div>
  );
};
