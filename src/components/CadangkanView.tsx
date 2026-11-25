import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  CloudUpload,
  Film,
  FolderOpen,
  FolderPlus,
  FolderUp,
  ImagePlus,
  Images,
  Info,
  Play,
  ShieldCheck,
  Trash2,
  UploadCloud,
  Video,
} from 'lucide-react';
import { AuthState, RootFolderConfig, StorageQuotaInfo } from '../types';
import { FolderService } from '../services/FolderService';
import { GoogleDriveService } from '../services/GoogleDriveService';
import { UploadQueueService } from '../services/UploadQueueService';
import { UploadService } from '../services/UploadService';
import {
  extractRelativeFolderPath,
  formatFileSize,
  isSupportedMediaFile,
  isValidImageFile,
  isValidVideoFile,
} from '../utils/formatters';
import { GoogleSignInButton } from './GoogleSignInButton';

interface CadangkanViewProps {
  authState: AuthState;
  isSigningIn: boolean;
  rootFolder: RootFolderConfig | null;
  preselectedDestination: { id: string; name: string } | null;
  onSignIn: () => void;
  onOpenFolderPicker: () => void;
  onOpenUploadQueue: () => void;
}

export type UploadMode =
  | 'single-photo'
  | 'multiple-photos'
  | 'single-video'
  | 'multiple-videos'
  | 'folder';

interface StagedFileItem {
  id: string;
  file: File;
  previewUrl: string;
  relativePath: string;
  isVideo: boolean;
}

export const CadangkanView: React.FC<CadangkanViewProps> = ({
  authState,
  isSigningIn,
  rootFolder,
  preselectedDestination,
  onSignIn,
  onOpenFolderPicker,
  onOpenUploadQueue,
}) => {
  const [mode, setMode] = useState<UploadMode>('multiple-photos');
  const [stagedItems, setStagedItems] = useState<StagedFileItem[]>([]);
  const [rejectedSummary, setRejectedSummary] = useState<string[]>([]);
  const [folderOptions, setFolderOptions] = useState<
    Array<{ id: string; label: string; depth: number }>
  >([]);
  const [selectedFolderId, setSelectedFolderId] = useState<string>('');
  const [loadingFolders, setLoadingFolders] = useState(false);
  const [creatingSubfolder, setCreatingSubfolder] = useState(false);
  const [showNewSubfolder, setShowNewSubfolder] = useState(false);
  const [newSubfolderName, setNewSubfolderName] = useState('');
  const [quotaInfo, setQuotaInfo] = useState<StorageQuotaInfo | null>(null);
  const [enqueuing, setEnqueuing] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'warning' | 'error';
    message: string;
  } | null>(null);

  const singlePhotoInputRef = useRef<HTMLInputElement | null>(null);
  const multiPhotoInputRef = useRef<HTMLInputElement | null>(null);
  const singleVideoInputRef = useRef<HTMLInputElement | null>(null);
  const multiVideoInputRef = useRef<HTMLInputElement | null>(null);
  const folderInputRef = useRef<HTMLInputElement | null>(null);

  // Deteksi dukungan webkitdirectory pada browser saat ini
  const supportsDirectoryPicker = useMemo(() => {
    if (typeof document === 'undefined') return false;
    const input = document.createElement('input');
    return 'webkitdirectory' in input;
  }, []);

  // Pastikan atribut webkitdirectory terpasang pada input folder
  useEffect(() => {
    const el = folderInputRef.current;
    if (el) {
      el.setAttribute('webkitdirectory', '');
      el.setAttribute('directory', '');
    }
  }, [mode]);

  // Bersihkan Object URL saat unmount
  useEffect(() => {
    return () => {
      stagedItems.forEach((item) => {
        if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
      });
    };
  }, [stagedItems]);

  // Cek kuota penyimpanan lokal browser
  useEffect(() => {
    void UploadQueueService.checkStorageQuota().then(setQuotaInfo);
  }, []);

  // Muat opsi album tujuan dari Google Drive
  useEffect(() => {
    if (!authState.hasValidToken || !rootFolder) {
      setFolderOptions([]);
      setSelectedFolderId('');
      return;
    }

    setLoadingFolders(true);
    FolderService.listFlatFolderOptions(rootFolder.id, rootFolder.name)
      .then((options) => {
        setFolderOptions(options);
        if (preselectedDestination && options.some((o) => o.id === preselectedDestination.id)) {
          setSelectedFolderId(preselectedDestination.id);
        } else {
          setSelectedFolderId((prev) =>
            prev && options.some((o) => o.id === prev) ? prev : rootFolder.id
          );
        }
      })
      .catch(() => {
        setFolderOptions([{ id: rootFolder.id, label: rootFolder.name, depth: 0 }]);
        setSelectedFolderId(rootFolder.id);
      })
      .finally(() => setLoadingFolders(false));
  }, [authState.hasValidToken, rootFolder, preselectedDestination]);

  const clearStaged = () => {
    stagedItems.forEach((item) => {
      if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
    });
    setStagedItems([]);
    setRejectedSummary([]);
  };

  const handleFilesSelected = (fileList: FileList | null, targetMode: UploadMode) => {
    if (!fileList || fileList.length === 0) return;
    setFeedback(null);

    const files = Array.from(fileList);
    const valid: StagedFileItem[] = [];
    const rejected: string[] = [];

    const isPhotoMode = targetMode === 'single-photo' || targetMode === 'multiple-photos';
    const isVideoMode = targetMode === 'single-video' || targetMode === 'multiple-videos';
    const isFolderMode = targetMode === 'folder';

    const maxPreviewThumbs = 60;
    files.forEach((file, idx) => {
      if (file.size <= 0) {
        rejected.push(`${file.name} (file kosong 0 byte)`);
        return;
      }

      if (isPhotoMode) {
        if (!isValidImageFile(file)) {
          rejected.push(`${file.name} (bukan format foto/gambar valid)`);
          return;
        }
      } else if (isVideoMode) {
        if (!isValidVideoFile(file)) {
          rejected.push(`${file.name} (bukan format video yang didukung)`);
          return;
        }
      } else if (isFolderMode) {
        if (!isSupportedMediaFile(file)) {
          rejected.push(`${file.name} (bukan foto atau video yang didukung)`);
          return;
        }
      }

      const isVideo = isValidVideoFile(file);
      valid.push({
        id: `${file.name}-${file.size}-${idx}-${Date.now()}`,
        file,
        previewUrl: idx < maxPreviewThumbs ? URL.createObjectURL(file) : '',
        relativePath: isFolderMode ? extractRelativeFolderPath(file) : '',
        isVideo,
      });
    });

    if (targetMode === 'single-photo' || targetMode === 'single-video') {
      clearStaged();
      setStagedItems(valid.slice(0, 1));
    } else {
      clearStaged();
      setStagedItems(valid);
    }
    setRejectedSummary(rejected);
  };

  const handleRemoveStaged = (id: string) => {
    setStagedItems((prev) => {
      const target = prev.find((i) => i.id === id);
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((i) => i.id !== id);
    });
  };

  const handleCreateDestinationAlbum = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rootFolder || !newSubfolderName.trim()) return;
    setCreatingSubfolder(true);
    setFeedback(null);
    try {
      const parentId = selectedFolderId || rootFolder.id;
      const created = await FolderService.createNewAlbum(parentId, newSubfolderName.trim());
      const options = await FolderService.listFlatFolderOptions(rootFolder.id, rootFolder.name);
      setFolderOptions(options);
      setSelectedFolderId(created.id);
      setNewSubfolderName('');
      setShowNewSubfolder(false);
    } catch (err) {
      setFeedback({
        type: 'error',
        message:
          err instanceof Error ? err.message : 'Gagal membuat album tujuan di Google Drive.',
      });
    } finally {
      setCreatingSubfolder(false);
    }
  };

  const totalSelectedBytes = useMemo(
    () => stagedItems.reduce((sum, item) => sum + item.file.size, 0),
    [stagedItems]
  );

  const photoCount = useMemo(
    () => stagedItems.filter((i) => !i.isVideo).length,
    [stagedItems]
  );

  const videoCount = useMemo(
    () => stagedItems.filter((i) => i.isVideo).length,
    [stagedItems]
  );

  const detectedFolderGroups = useMemo(() => {
    if (mode !== 'folder') return [];
    const map = new Map<string, { total: number; photos: number; videos: number }>();
    for (const item of stagedItems) {
      const key = item.relativePath || '(Folder utama)';
      const existing = map.get(key) || { total: 0, photos: 0, videos: 0 };
      existing.total += 1;
      if (item.isVideo) {
        existing.videos += 1;
      } else {
        existing.photos += 1;
      }
      map.set(key, existing);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0], 'id'));
  }, [mode, stagedItems]);

  const selectedFolderOption = folderOptions.find((f) => f.id === selectedFolderId);

  const handleStartBackup = async () => {
    if (!rootFolder || stagedItems.length === 0) return;
    const destinationId = selectedFolderId || rootFolder.id;
    const destinationName = selectedFolderOption?.label || rootFolder.name;

    const mediaCategory =
      mode === 'single-photo' || mode === 'multiple-photos'
        ? 'photo'
        : mode === 'single-video' || mode === 'multiple-videos'
          ? 'video'
          : 'any';

    setEnqueuing(true);
    setFeedback(null);
    try {
      // Pre-flight check: Verifikasi sisa ruang penyimpanan Google Drive untuk batch besar
      try {
        const driveQuota = await GoogleDriveService.getAccountStorageQuota();
        if (driveQuota.available !== undefined && totalSelectedBytes > driveQuota.available) {
          setFeedback({
            type: 'warning',
            message: `Peringatan Kapasitas: Total file yang dipilih (${formatFileSize(totalSelectedBytes)}) melebihi sisa ruang penyimpanan Google Drive Anda (${formatFileSize(driveQuota.available)}).`,
          });
        }
      } catch {
        // Abaikan kegagalan panggilan kuota agar tidak memblokir upload normal
      }

      const result = await UploadService.enqueueFiles({
        files: stagedItems.map((s) => s.file),
        destinationFolderId: destinationId,
        destinationFolderName: destinationName,
        preserveRelativePaths: mode === 'folder',
        mediaCategory,
      });

      clearStaged();

      const mediaDesc =
        photoCount > 0 && videoCount > 0
          ? `${photoCount} foto & ${videoCount} video`
          : videoCount > 0
            ? `${videoCount} video`
            : `${photoCount} foto`;

      if (result.storageWarning) {
        setFeedback({
          type: 'warning',
          message: `${result.enqueuedCount} file (${mediaDesc}) dimasukkan ke antrean upload. Catatan: ${result.storageWarning}`,
        });
      } else {
        setFeedback({
          type: 'success',
          message: `${result.enqueuedCount} file asli (${mediaDesc}) berhasil dimasukkan ke antrean pencadangan. Upload berjalan di latar belakang aplikasi.`,
        });
      }
      onOpenUploadQueue();
    } catch (err) {
      setFeedback({
        type: 'error',
        message:
          err instanceof Error ? err.message : 'Gagal menambahkan file ke antrean upload.',
      });
    } finally {
      setEnqueuing(false);
    }
  };

  if (!authState.hasValidToken) {
    return (
      <div className="flex flex-col items-center justify-center rounded-3xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-[#14171f] py-16 px-6 text-center">
        <CloudUpload className="h-10 w-10 text-slate-300 dark:text-slate-600" />
        <h2 className="mt-4 text-lg font-semibold text-slate-900 dark:text-slate-100">
          Hubungkan Akun Google untuk Mencadangkan Foto & Video
        </h2>
        <p className="mt-1.5 max-w-md text-sm text-slate-500 dark:text-slate-400">
          Masuk dengan akun Google Anda agar foto dan video dapat diupload langsung ke folder Google Drive dalam kualitas asli 100%.
        </p>
        <div className="mt-6">
          <GoogleSignInButton onClick={onSignIn} loading={isSigningIn} />
        </div>
      </div>
    );
  }

  if (!rootFolder) {
    return (
      <div className="flex flex-col items-center justify-center rounded-3xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-[#14171f] py-16 px-6 text-center">
        <FolderOpen className="h-10 w-10 text-slate-300 dark:text-slate-600" />
        <h2 className="mt-4 text-lg font-semibold text-slate-900 dark:text-slate-100">
          Tentukan Folder Root Pencadangan Terlebih Dahulu
        </h2>
        <p className="mt-1.5 max-w-md text-sm text-slate-500 dark:text-slate-400">
          Pilih folder utama di Google Drive (misalnya PHOTO & VIDEO BACKUP) sebagai tujuan pencadangan Anda.
        </p>
        <button
          type="button"
          onClick={onOpenFolderPicker}
          className="mt-6 inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700"
        >
          <FolderOpen className="h-4 w-4" />
          Pilih Folder Root Drive
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Hidden File Inputs for 5 Modes */}
      <input
        ref={singlePhotoInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          handleFilesSelected(e.target.files, 'single-photo');
          e.target.value = '';
        }}
      />
      <input
        ref={multiPhotoInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          handleFilesSelected(e.target.files, 'multiple-photos');
          e.target.value = '';
        }}
      />
      <input
        ref={singleVideoInputRef}
        type="file"
        accept="video/*,.mp4,.mov,.avi,.mkv,.webm,.m4v,.3gp,.mpeg,.mpg,.wmv,.flv"
        className="hidden"
        onChange={(e) => {
          handleFilesSelected(e.target.files, 'single-video');
          e.target.value = '';
        }}
      />
      <input
        ref={multiVideoInputRef}
        type="file"
        accept="video/*,.mp4,.mov,.avi,.mkv,.webm,.m4v,.3gp,.mpeg,.mpg,.wmv,.flv"
        multiple
        className="hidden"
        onChange={(e) => {
          handleFilesSelected(e.target.files, 'multiple-videos');
          e.target.value = '';
        }}
      />
      <input
        ref={folderInputRef}
        type="file"
        accept="image/*,video/*,.mp4,.mov,.avi,.mkv,.webm"
        multiple
        className="hidden"
        onChange={(e) => {
          handleFilesSelected(e.target.files, 'folder');
          e.target.value = '';
        }}
      />

      {/* Feedback alert */}
      {feedback && (
        <div
          className={`flex items-start gap-3 rounded-2xl border px-4 py-3.5 text-sm ${
            feedback.type === 'success'
              ? 'border-emerald-200 dark:border-emerald-900/60 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200'
              : feedback.type === 'warning'
                ? 'border-amber-200 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-200'
                : 'border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300'
          }`}
        >
          {feedback.type === 'success' ? (
            <CheckCircle2 className="h-5 w-5 shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
          )}
          <div className="flex-1">
            <p>{feedback.message}</p>
          </div>
        </div>
      )}

      {/* Upload Mode Selector (5 Methods) */}
      <section aria-labelledby="upload-mode-heading">
        <h2
          id="upload-mode-heading"
          className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-3"
        >
          1. Pilih Metode Pencadangan
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {(
            [
              {
                id: 'single-photo' as UploadMode,
                title: 'Upload Satu Foto',
                desc: 'Pilih satu foto dengan pratinjau penuh sebelum diupload.',
                icon: ImagePlus,
              },
              {
                id: 'multiple-photos' as UploadMode,
                title: 'Upload Banyak Foto',
                desc: 'Pilih beberapa foto sekaligus ke album tujuan.',
                icon: Images,
              },
              {
                id: 'single-video' as UploadMode,
                title: 'Upload Satu Video',
                desc: 'Pilih satu video biner asli tanpa kompresi.',
                icon: Video,
              },
              {
                id: 'multiple-videos' as UploadMode,
                title: 'Upload Banyak Video',
                desc: 'Pilih beberapa video sekaligus dengan daftar kelola.',
                icon: Film,
              },
              {
                id: 'folder' as UploadMode,
                title: 'Upload Satu Folder',
                desc: 'Folder foto & video dengan struktur subfolder asli.',
                icon: FolderUp,
              },
            ] as const
          ).map((item) => {
            const Icon = item.icon;
            const active = mode === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  if (mode !== item.id) {
                    clearStaged();
                    setMode(item.id);
                  }
                }}
                className={`flex flex-col items-start gap-2.5 rounded-2xl border p-3.5 text-left transition-all ${
                  active
                    ? 'border-blue-600 dark:border-blue-500 bg-blue-50/60 dark:bg-blue-950/40 shadow-xs ring-1 ring-blue-500/20'
                    : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-[#14171f] hover:border-slate-300 dark:hover:border-slate-700'
                }`}
              >
                <div
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                    active
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                  }`}
                >
                  <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                    {item.title}
                  </p>
                  <p className="mt-1 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
                    {item.desc}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* Destination Album Selection */}
      <section className="rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-[#14171f] p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            2. Pilih Album Tujuan di Google Drive
          </h3>
          <button
            type="button"
            onClick={() => setShowNewSubfolder((v) => !v)}
            className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/50 transition-colors"
          >
            <FolderPlus className="h-4 w-4" />
            Buat Album Baru
          </button>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <select
            value={selectedFolderId}
            onChange={(e) => setSelectedFolderId(e.target.value)}
            disabled={loadingFolders}
            aria-label="Pilih album tujuan"
            className="flex-1 min-h-[46px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#1a1f29] px-3.5 text-sm text-slate-900 dark:text-slate-100 focus:border-blue-500 focus:outline-none"
          >
            {folderOptions.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {showNewSubfolder && (
          <form onSubmit={handleCreateDestinationAlbum} className="flex items-center gap-2 pt-1">
            <input
              type="text"
              value={newSubfolderName}
              onChange={(e) => setNewSubfolderName(e.target.value)}
              placeholder="Nama album baru, misal Dokumentasi Liburan"
              className="flex-1 min-h-[42px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#1a1f29] px-3.5 text-sm text-slate-900 dark:text-slate-100 focus:border-blue-500 focus:outline-none"
            />
            <button
              type="submit"
              disabled={creatingSubfolder || !newSubfolderName.trim()}
              className="min-h-[42px] rounded-xl bg-blue-600 px-4 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50 whitespace-nowrap"
            >
              {creatingSubfolder ? 'Membuat...' : 'Buat'}
            </button>
          </form>
        )}

        {mode === 'folder' && (
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Struktur folder yang Anda pilih (termasuk semua subfolder di dalamnya) akan dibuat ulang otomatis di dalam{' '}
            <strong className="text-slate-800 dark:text-slate-200">
              {selectedFolderOption?.label || rootFolder.name}
            </strong>
            .
          </p>
        )}
      </section>

      {/* File / Folder Drop & Trigger Area */}
      <section className="rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-[#14171f] p-5 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            3. Pilih{' '}
            {mode === 'single-photo'
              ? 'Foto'
              : mode === 'multiple-photos'
                ? 'Daftar Foto'
                : mode === 'single-video'
                  ? 'Video'
                  : mode === 'multiple-videos'
                    ? 'Daftar Video'
                    : 'Folder (Foto & Video)'}
          </h3>
          {stagedItems.length > 0 && (
            <button
              type="button"
              onClick={clearStaged}
              className="text-xs font-medium text-red-600 dark:text-red-400 hover:underline"
            >
              Kosongkan pilihan
            </button>
          )}
        </div>

        {/* Fallback note if mobile browser lacks directory upload */}
        {mode === 'folder' && !supportsDirectoryPicker && (
          <div className="rounded-xl border border-amber-200 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/40 p-3.5 text-xs text-amber-800 dark:text-amber-300">
            Browser perangkat ini tidak mendukung pemilihan direktori secara langsung. Silakan gunakan tombol pemilihan banyak file di bawah ini sebagai alternatif aman.
          </div>
        )}

        <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 dark:border-slate-700 bg-slate-50/70 dark:bg-[#11141b] px-5 py-8 text-center">
          <UploadCloud className="h-9 w-9 text-blue-600 dark:text-blue-400" />
          <p className="mt-3 text-sm font-semibold text-slate-900 dark:text-slate-100">
            {mode === 'single-photo'
              ? 'Pilih satu file foto asli dari perangkat'
              : mode === 'multiple-photos'
                ? 'Pilih beberapa foto sekaligus dari galeri perangkat'
                : mode === 'single-video'
                  ? 'Pilih satu file video asli dari perangkat'
                  : mode === 'multiple-videos'
                    ? 'Pilih beberapa file video sekaligus dari galeri perangkat'
                    : 'Pilih satu folder lengkap berisi foto dan video'}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 max-w-md">
            File diupload dalam bentuk biner asli 100% tanpa kompresi, tanpa transkoding, dan tanpa menghapus file lokal Anda.
          </p>

          <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
            {mode === 'single-photo' && (
              <button
                type="button"
                onClick={() => singlePhotoInputRef.current?.click()}
                className="inline-flex min-h-[46px] items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
              >
                <ImagePlus className="h-4 w-4" />
                Pilih Satu Foto
              </button>
            )}

            {mode === 'multiple-photos' && (
              <button
                type="button"
                onClick={() => multiPhotoInputRef.current?.click()}
                className="inline-flex min-h-[46px] items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
              >
                <Images className="h-4 w-4" />
                Pilih Banyak Foto
              </button>
            )}

            {mode === 'single-video' && (
              <button
                type="button"
                onClick={() => singleVideoInputRef.current?.click()}
                className="inline-flex min-h-[46px] items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
              >
                <Video className="h-4 w-4" />
                Pilih Satu Video
              </button>
            )}

            {mode === 'multiple-videos' && (
              <button
                type="button"
                onClick={() => multiVideoInputRef.current?.click()}
                className="inline-flex min-h-[46px] items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
              >
                <Film className="h-4 w-4" />
                Pilih Banyak Video
              </button>
            )}

            {mode === 'folder' && (
              <>
                {supportsDirectoryPicker && (
                  <button
                    type="button"
                    onClick={() => folderInputRef.current?.click()}
                    className="inline-flex min-h-[46px] items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
                  >
                    <FolderUp className="h-4 w-4" />
                    Pilih Folder Lengkap
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => multiPhotoInputRef.current?.click()}
                  className="inline-flex min-h-[46px] items-center gap-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#171a21] px-4 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  Alternatif: Pilih Banyak Foto
                </button>
                <button
                  type="button"
                  onClick={() => multiVideoInputRef.current?.click()}
                  className="inline-flex min-h-[46px] items-center gap-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#171a21] px-4 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  Alternatif: Pilih Banyak Video
                </button>
              </>
            )}
          </div>
        </div>

        {/* Rejected File Notice */}
        {rejectedSummary.length > 0 && (
          <div className="rounded-xl border border-amber-200 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/40 px-4 py-3 text-xs text-amber-800 dark:text-amber-300">
            <p className="font-semibold">
              {rejectedSummary.length} file dilewati karena bukan format yang didukung:
            </p>
            <p className="mt-1 truncate">{rejectedSummary.slice(0, 5).join(', ')}</p>
          </div>
        )}

        {/* Preview Selected Files */}
        {stagedItems.length > 0 && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600 dark:text-slate-400">
              <span className="tabular-nums">
                <strong className="text-slate-900 dark:text-slate-100">
                  {stagedItems.length.toLocaleString('id-ID')} file{' '}
                  {mode === 'folder' && (
                    <span className="font-normal text-slate-500">
                      ({photoCount} foto, {videoCount} video)
                    </span>
                  )}
                </strong>{' '}
                siap dicadangkan · Total ukuran:{' '}
                <strong className="font-mono-tabular text-slate-900 dark:text-slate-100">
                  {formatFileSize(totalSelectedBytes)}
                </strong>
              </span>
              {quotaInfo?.supported && (
                <span className="font-mono-tabular">
                  Ruang lokal browser tersisa: {formatFileSize(quotaInfo.availableBytes)}
                </span>
              )}
            </div>

            {/* Folder tree summary for folder mode */}
            {mode === 'folder' && detectedFolderGroups.length > 0 && (
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-[#11141b] p-3.5 max-h-48 overflow-y-auto space-y-1.5">
                <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Struktur folder yang akan dipertahankan ({detectedFolderGroups.length} folder):
                </p>
                {detectedFolderGroups.map(([pathLabel, counts]) => (
                  <div
                    key={pathLabel}
                    className="flex items-center justify-between gap-2 text-xs text-slate-600 dark:text-slate-400"
                  >
                    <span className="truncate font-mono-tabular">{pathLabel}</span>
                    <span className="shrink-0 tabular-nums font-medium">
                      {counts.photos > 0 && `${counts.photos} foto`}
                      {counts.photos > 0 && counts.videos > 0 && ', '}
                      {counts.videos > 0 && `${counts.videos} video`}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Single Photo Large Preview */}
            {mode === 'single-photo' && stagedItems[0] && (
              <div className="flex flex-col sm:flex-row items-start gap-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-[#11141b] p-4">
                {stagedItems[0].previewUrl && (
                  <img
                    src={stagedItems[0].previewUrl}
                    alt={stagedItems[0].file.name}
                    className="h-44 w-full sm:w-56 rounded-xl object-cover bg-slate-200 dark:bg-slate-800"
                  />
                )}
                <div className="min-w-0 flex-1 space-y-1.5">
                  <p className="break-all text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {stagedItems[0].file.name}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 font-mono-tabular">
                    {formatFileSize(stagedItems[0].file.size)} · {stagedItems[0].file.type || 'image'}
                  </p>
                  <p className="text-xs text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5 pt-1">
                    <ShieldCheck className="h-4 w-4 shrink-0" />
                    <span>Kualitas asli dipertahankan 100% tanpa kompresi</span>
                  </p>
                </div>
              </div>
            )}

            {/* Single Video Large Preview */}
            {mode === 'single-video' && stagedItems[0] && (
              <div className="flex flex-col sm:flex-row items-start gap-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-[#11141b] p-4">
                {stagedItems[0].previewUrl ? (
                  <video
                    controls
                    preload="metadata"
                    src={stagedItems[0].previewUrl}
                    className="h-44 w-full sm:w-64 rounded-xl object-contain bg-black"
                  />
                ) : (
                  <div className="flex h-44 w-full sm:w-64 items-center justify-center rounded-xl bg-slate-900 text-slate-400">
                    <Video className="h-10 w-10 text-slate-500" />
                  </div>
                )}
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="rounded bg-indigo-100 dark:bg-indigo-950/80 px-2 py-0.5 text-[10px] font-semibold text-indigo-700 dark:text-indigo-300 uppercase">
                      Video
                    </span>
                    <p className="break-all text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {stagedItems[0].file.name}
                    </p>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 font-mono-tabular">
                    {formatFileSize(stagedItems[0].file.size)} · {stagedItems[0].file.type || 'video'}
                  </p>
                  <p className="text-xs text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5 pt-1">
                    <ShieldCheck className="h-4 w-4 shrink-0" />
                    <span>Format & biner asli dipertahankan tanpa transkoding atau kompresi</span>
                  </p>
                </div>
              </div>
            )}

            {/* Multi / Folder Thumbnail Preview Grid */}
            {mode !== 'single-photo' && mode !== 'single-video' && (
              <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2.5 max-h-72 overflow-y-auto pr-1">
                {stagedItems.slice(0, 48).map((item) => (
                  <div
                    key={item.id}
                    className="group relative overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-800"
                  >
                    <div className="aspect-square w-full overflow-hidden bg-slate-900 flex items-center justify-center">
                      {item.isVideo ? (
                        <div className="relative flex h-full w-full items-center justify-center bg-slate-950 text-indigo-400">
                          <Film className="h-7 w-7 text-indigo-400/80" />
                          <span className="absolute bottom-1 right-1 rounded bg-black/75 px-1 py-0.5 text-[9px] font-bold text-white tracking-wider">
                            VIDEO
                          </span>
                        </div>
                      ) : item.previewUrl ? (
                        <img
                          src={item.previewUrl}
                          alt={item.file.name}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-slate-400">
                          <Images className="h-5 w-5" />
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveStaged(item.id)}
                      className="absolute top-1.5 right-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-black/65 text-white hover:bg-red-600 transition-colors z-10"
                      aria-label={`Hapus ${item.file.name} dari pilihan`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                    <div className="p-1.5 bg-white dark:bg-[#171a21]">
                      <p className="truncate text-[11px] font-medium text-slate-800 dark:text-slate-200">
                        {item.file.name}
                      </p>
                      <p className="text-[10px] font-mono-tabular text-slate-500">
                        {formatFileSize(item.file.size)}
                      </p>
                    </div>
                  </div>
                ))}
                {stagedItems.length > 48 && (
                  <div className="flex items-center justify-center rounded-xl border border-dashed border-slate-300 dark:border-slate-700 p-3 text-center text-xs text-slate-500">
                    +{stagedItems.length - 48} file lainnya siap diupload
                  </div>
                )}
              </div>
            )}

            {/* Start Upload Button */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-slate-200 dark:border-slate-800">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Tujuan:{' '}
                <strong className="text-slate-800 dark:text-slate-200">
                  {selectedFolderOption?.label || rootFolder.name}
                </strong>
              </p>
              <button
                type="button"
                disabled={enqueuing}
                onClick={() => void handleStartBackup()}
                className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-2xl bg-blue-600 px-6 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition-colors whitespace-nowrap"
              >
                <CloudUpload className="h-5 w-5" />
                {enqueuing
                  ? 'Menyiapkan Antrean...'
                  : mode === 'single-photo'
                    ? 'Mulai Cadangkan 1 Foto'
                    : mode === 'single-video'
                      ? 'Mulai Cadangkan 1 Video'
                      : mode === 'multiple-photos'
                        ? `Mulai Cadangkan ${stagedItems.length} Foto`
                        : mode === 'multiple-videos'
                          ? `Mulai Cadangkan ${stagedItems.length} Video`
                          : `Mulai Cadangkan ${stagedItems.length} File (${photoCount} Foto, ${videoCount} Video)`}
              </button>
            </div>
          </div>
        )}
      </section>

      {/* Transparent Browser Background Limitations Notice */}
      <section className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/60 dark:bg-[#14171f] p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <Info className="h-5 w-5 shrink-0 text-slate-500 dark:text-slate-400 mt-0.5" />
          <div className="space-y-1.5 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
            <p className="font-semibold text-slate-800 dark:text-slate-200">
              Informasi Upload Latar Belakang & Batasan Browser
            </p>
            <p>
              Upload tetap berjalan lancar saat Anda berpindah antar halaman (Beranda, Semua Foto, Album, Semua Video, Pengaturan) dan antrean disimpan di IndexedDB agar dapat dipulihkan jika halaman dimuat ulang. Namun, browser web tidak menjamin upload file besar terus berjalan setelah browser ditutup total, tab dimatikan, atau perangkat masuk mode hemat daya ketat.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
};
