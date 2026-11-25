import React, { useState } from 'react';
import { Copy, FileWarning, SkipForward, XCircle } from 'lucide-react';
import { DuplicateResolution, UploadTask } from '../types';
import { formatFileSize, formatIndonesianDateTime } from '../utils/formatters';

interface DuplicateResolutionModalProps {
  task: UploadTask | null;
  remainingPendingCount: number;
  onResolve: (
    taskId: string,
    resolution: DuplicateResolution,
    applyToRemaining: boolean
  ) => void;
}

export const DuplicateResolutionModal: React.FC<DuplicateResolutionModalProps> = ({
  task,
  remainingPendingCount,
  onResolve,
}) => {
  const [applyToAll, setApplyToAll] = useState(false);

  if (!task || !task.duplicateMatch) return null;

  const { existingFile, confidence, reason } = task.duplicateMatch;
  const existingSize = existingFile.size ? Number.parseInt(existingFile.size, 10) : 0;

  const confidenceLabel =
    confidence === 'exact_hash'
      ? 'Identik (Hash konten cocok)'
      : confidence === 'name_and_size'
        ? 'Kemungkinan besar duplikat (Nama & ukuran sama)'
        : 'Nama file sama (Ukuran berbeda)';

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/55 backdrop-blur-xs sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="duplicate-modal-title"
    >
      <div className="w-full sm:max-w-lg rounded-t-3xl sm:rounded-2xl bg-white dark:bg-[#171a21] border border-slate-200 dark:border-slate-800 shadow-2xl p-6">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400">
            <FileWarning className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h3
              id="duplicate-modal-title"
              className="text-base font-semibold text-slate-900 dark:text-slate-100"
            >
              Terdeteksi Kemungkinan File Duplikat
            </h3>
            <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
              {reason} File yang sudah ada di Google Drive tidak akan pernah ditimpa atau dihapus secara otomatis.
            </p>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <div className="rounded-xl bg-slate-50 dark:bg-[#12151b] p-3.5 border border-slate-200/80 dark:border-slate-800">
            <p className="font-medium text-slate-500 dark:text-slate-400">File Lokal (Akan Diupload)</p>
            <p className="mt-1.5 break-all font-semibold text-slate-900 dark:text-slate-100">
              {task.fileName}
            </p>
            <p className="mt-1 font-mono-tabular text-slate-600 dark:text-slate-400">
              {formatFileSize(task.fileSize)}
            </p>
            {task.relativeFolderPath && (
              <p className="mt-1 truncate text-slate-500 dark:text-slate-400">
                Path: {task.relativeFolderPath}
              </p>
            )}
          </div>

          <div className="rounded-xl bg-slate-50 dark:bg-[#12151b] p-3.5 border border-slate-200/80 dark:border-slate-800">
            <p className="font-medium text-slate-500 dark:text-slate-400">File di Google Drive</p>
            <p className="mt-1.5 break-all font-semibold text-slate-900 dark:text-slate-100">
              {existingFile.name}
            </p>
            <p className="mt-1 font-mono-tabular text-slate-600 dark:text-slate-400">
              {formatFileSize(existingSize)}
            </p>
            <p className="mt-1 text-slate-500 dark:text-slate-400">
              Diubah: {formatIndonesianDateTime(existingFile.modifiedTime)}
            </p>
          </div>
        </div>

        <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
          Tingkat kecocokan: <strong className="text-slate-800 dark:text-slate-200">{confidenceLabel}</strong>
        </p>

        {remainingPendingCount > 1 && (
          <label className="mt-4 flex items-center gap-2.5 text-xs text-slate-700 dark:text-slate-300 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={applyToAll}
              onChange={(e) => setApplyToAll(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
            <span>
              Terapkan pilihan ini untuk semua duplikat tersisa di antrean ({remainingPendingCount} file)
            </span>
          </label>
        )}

        <div className="mt-6 flex flex-col sm:flex-row gap-2.5">
          <button
            type="button"
            onClick={() => onResolve(task.id, 'skip', applyToAll)}
            className="inline-flex flex-1 min-h-[44px] items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors whitespace-nowrap"
          >
            <SkipForward className="h-4 w-4" />
            Lewati file
          </button>

          <button
            type="button"
            onClick={() => onResolve(task.id, 'copy', applyToAll)}
            className="inline-flex flex-1 min-h-[44px] items-center justify-center gap-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#1f242e] px-4 py-2.5 text-sm font-medium text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap"
          >
            <Copy className="h-4 w-4" />
            Upload sebagai salinan
          </button>

          <button
            type="button"
            onClick={() => onResolve(task.id, 'cancel', applyToAll)}
            className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors whitespace-nowrap"
          >
            <XCircle className="h-4 w-4" />
            Batalkan tindakan
          </button>
        </div>
      </div>
    </div>
  );
};
