import React, { useCallback, useEffect, useState } from 'react';
import {
  Check,
  ChevronRight,
  Folder,
  FolderPlus,
  HardDrive,
  Loader2,
  RefreshCw,
  Search,
  ShieldCheck,
  X,
} from 'lucide-react';
import { DriveFile, FolderBreadcrumb, RootFolderConfig } from '../types';
import { FolderService } from '../services/FolderService';
import { GoogleDriveService } from '../services/GoogleDriveService';

interface FolderPickerModalProps {
  open: boolean;
  currentRoot: RootFolderConfig | null;
  onSelect: (config: RootFolderConfig) => void;
  onClose: () => void;
}

export const FolderPickerModal: React.FC<FolderPickerModalProps> = ({
  open,
  currentRoot,
  onSelect,
  onClose,
}) => {
  const [breadcrumbs, setBreadcrumbs] = useState<FolderBreadcrumb[]>([
    { id: 'root', name: 'Drive Saya' },
  ]);
  const [folders, setFolders] = useState<DriveFile[]>([]);
  const [selectedFolder, setSelectedFolder] = useState<{ id: string; name: string } | null>(
    currentRoot ? { id: currentRoot.id, name: currentRoot.name } : null
  );
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [creating, setCreating] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newFolderName, setNewFolderName] = useState('PHOTO BACKUP');
  const [searchTerm, setSearchTerm] = useState('');
  const [error, setError] = useState<string | null>(null);

  const currentFolder = breadcrumbs[breadcrumbs.length - 1];

  const loadFolders = useCallback(
    async (parentId: string, forceRefresh = false, query = '') => {
      setLoading(true);
      setError(null);
      try {
        const items = await FolderService.listChildFolders(parentId, {
          forceRefresh,
          searchQuery: query,
        });
        setFolders(items);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : 'Gagal memuat daftar folder dari Google Drive.'
        );
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    if (!open) return;
    setBreadcrumbs([{ id: 'root', name: 'Drive Saya' }]);
    setSelectedFolder(currentRoot ? { id: currentRoot.id, name: currentRoot.name } : null);
    setSearchTerm('');
    setShowCreateForm(false);
    void loadFolders('root', true);
  }, [open, currentRoot, loadFolders]);

  const handleOpenFolder = (folder: DriveFile) => {
    setBreadcrumbs((prev) => [...prev, { id: folder.id, name: folder.name }]);
    setSelectedFolder({ id: folder.id, name: folder.name });
    setSearchTerm('');
    void loadFolders(folder.id, false);
  };

  const handleBreadcrumbClick = (index: number) => {
    const next = breadcrumbs.slice(0, index + 1);
    setBreadcrumbs(next);
    const target = next[next.length - 1];
    setSelectedFolder(target.id === 'root' ? null : { id: target.id, name: target.name });
    setSearchTerm('');
    void loadFolders(target.id, false);
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void loadFolders(currentFolder.id, true, searchTerm);
  };

  const handleCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newFolderName.trim();
    if (!trimmed) return;
    setCreating(true);
    setError(null);
    try {
      const created = await FolderService.createNewAlbum(currentFolder.id, trimmed);
      setShowCreateForm(false);
      setNewFolderName('');
      setSelectedFolder({ id: created.id, name: created.name });
      await loadFolders(currentFolder.id, true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal membuat folder baru di Google Drive.');
    } finally {
      setCreating(false);
    }
  };

  const handleConfirmSelection = async (target: { id: string; name: string } | null) => {
    if (!target || target.id === 'root') {
      setError('Pilih salah satu folder khusus (misalnya PHOTO BACKUP) sebagai folder root pencadangan.');
      return;
    }

    setVerifying(true);
    setError(null);
    try {
      const verified = await FolderService.verifyFolderAccess(target.id);
      if (!verified.canAddChildren) {
        setError(
          `Folder "${verified.name}" hanya memiliki izin baca. Pilih folder yang mengizinkan penambahan foto.`
        );
        return;
      }
      onSelect(verified);
      onClose();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Gagal memverifikasi akses ke folder yang dipilih.'
      );
    } finally {
      setVerifying(false);
    }
  };

  const handleOpenGooglePicker = async () => {
    setError(null);
    try {
      const picked = await GoogleDriveService.openGoogleFolderPicker();
      if (picked) {
        await handleConfirmSelection(picked);
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Google Picker tidak dapat dibuka. Gunakan daftar folder langsung di bawah ini.'
      );
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-xs sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="folder-picker-title"
    >
      <div className="flex max-h-[90vh] w-full sm:max-w-xl flex-col rounded-t-3xl sm:rounded-2xl bg-white dark:bg-[#171a21] border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-slate-200 dark:border-slate-800">
          <div>
            <h2
              id="folder-picker-title"
              className="text-base font-semibold text-slate-900 dark:text-slate-100"
            >
              Pilih Folder Root Pencadangan
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Semua album dan foto yang ditampilkan berasal dari folder ini beserta subfoldernya.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            aria-label="Tutup pemilih folder"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Toolbar */}
        <div className="px-5 py-3 bg-slate-50/80 dark:bg-[#12151b] border-b border-slate-200 dark:border-slate-800 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleOpenGooglePicker}
              disabled={verifying}
              className="inline-flex min-h-[40px] items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#171a21] px-3.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap"
            >
              <HardDrive className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              Buka Google Picker
            </button>

            <button
              type="button"
              onClick={() => setShowCreateForm((v) => !v)}
              className="inline-flex min-h-[40px] items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#171a21] px-3.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap"
            >
              <FolderPlus className="h-4 w-4 text-slate-600 dark:text-slate-300" />
              Buat Folder Baru
            </button>

            <button
              type="button"
              onClick={() => void loadFolders(currentFolder.id, true, searchTerm)}
              disabled={loading}
              className="ml-auto inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#171a21] text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              aria-label="Muat ulang daftar folder"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {showCreateForm && (
            <form onSubmit={handleCreateFolder} className="flex items-center gap-2">
              <input
                type="text"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                placeholder="Nama folder baru, misal PHOTO BACKUP"
                className="flex-1 min-h-[40px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#171a21] px-3 text-sm text-slate-900 dark:text-slate-100 focus:border-blue-500 focus:outline-none"
              />
              <button
                type="submit"
                disabled={creating || !newFolderName.trim()}
                className="min-h-[40px] rounded-xl bg-blue-600 px-4 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50 whitespace-nowrap"
              >
                {creating ? 'Membuat...' : 'Simpan'}
              </button>
            </form>
          )}

          <form onSubmit={handleSearchSubmit} className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Cari folder di lokasi ini..."
              className="w-full min-h-[40px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#171a21] pl-9 pr-3 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none"
            />
          </form>

          {/* Breadcrumb */}
          <nav className="flex items-center gap-1 overflow-x-auto text-xs text-slate-500 dark:text-slate-400">
            {breadcrumbs.map((crumb, idx) => (
              <React.Fragment key={crumb.id}>
                {idx > 0 && <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-400" />}
                <button
                  type="button"
                  onClick={() => handleBreadcrumbClick(idx)}
                  className={`rounded-md px-1.5 py-1 whitespace-nowrap transition-colors ${
                    idx === breadcrumbs.length - 1
                      ? 'font-semibold text-slate-900 dark:text-slate-100'
                      : 'hover:text-blue-600 dark:hover:text-blue-400'
                  }`}
                >
                  {crumb.name}
                </button>
              </React.Fragment>
            ))}
          </nav>
        </div>

        {/* Error banner */}
        {error && (
          <div className="mx-5 mt-3 rounded-xl border border-red-200 dark:border-red-900/70 bg-red-50 dark:bg-red-950/40 px-4 py-3 text-xs text-red-700 dark:text-red-300">
            {error}
          </div>
        )}

        {/* Folder List */}
        <div className="flex-1 overflow-y-auto px-3 py-2 min-h-[240px]">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 text-slate-500 dark:text-slate-400">
              <Loader2 className="h-6 w-6 animate-spin text-blue-600 dark:text-blue-400" />
              <p className="mt-2 text-sm">Memuat folder Google Drive...</p>
            </div>
          ) : folders.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center px-4">
              <Folder className="h-8 w-8 text-slate-300 dark:text-slate-600" />
              <p className="mt-2 text-sm font-medium text-slate-700 dark:text-slate-300">
                Tidak ada subfolder di lokasi ini
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Anda dapat memilih folder saat ini atau membuat folder baru untuk pencadangan.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800/70">
              {folders.map((folder) => {
                const isSelected = selectedFolder?.id === folder.id;
                return (
                  <li key={folder.id} className="flex items-center gap-2 py-1">
                    <button
                      type="button"
                      onClick={() => setSelectedFolder({ id: folder.id, name: folder.name })}
                      onDoubleClick={() => handleOpenFolder(folder)}
                      className={`flex flex-1 min-h-[48px] items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors ${
                        isSelected
                          ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-800/50 text-slate-800 dark:text-slate-200'
                      }`}
                    >
                      <Folder
                        className={`h-5 w-5 shrink-0 ${
                          isSelected
                            ? 'text-blue-600 dark:text-blue-400'
                            : 'text-slate-400 dark:text-slate-500'
                        }`}
                      />
                      <span className="truncate text-sm font-medium">{folder.name}</span>
                      {isSelected && <Check className="ml-auto h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" />}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleOpenFolder(folder)}
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
                      aria-label={`Buka isi folder ${folder.name}`}
                      title="Buka subfolder"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Footer */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-[#12151b] px-5 py-4">
          <div className="min-w-0 text-xs text-slate-600 dark:text-slate-400">
            {selectedFolder ? (
              <span className="flex items-center gap-1.5 truncate">
                <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                <span className="truncate">
                  Terpilih: <strong className="text-slate-900 dark:text-slate-100">{selectedFolder.name}</strong>
                </span>
              </span>
            ) : (
              <span>Ketuk folder untuk memilih, atau klik panah kanan untuk masuk.</span>
            )}
          </div>
          <div className="flex items-center justify-end gap-2 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[44px] rounded-xl px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-800 transition-colors"
            >
              Batal
            </button>
            <button
              type="button"
              disabled={!selectedFolder || verifying}
              onClick={() => void handleConfirmSelection(selectedFolder)}
              className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors whitespace-nowrap"
            >
              {verifying && <Loader2 className="h-4 w-4 animate-spin" />}
              {verifying ? 'Memverifikasi...' : 'Gunakan Folder Ini'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
