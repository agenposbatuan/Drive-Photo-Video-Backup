import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  ChevronRight,
  CloudUpload,
  Folder,
  FolderHeart,
  FolderOpen,
  FolderPlus,
  Loader2,
  Lock,
  RefreshCw,
  Share2,
  Shield,
  X,
} from 'lucide-react';
import {
  AlbumSummary,
  AppSection,
  AuthState,
  FolderBreadcrumb,
  PhotoItem,
  RecentAlbumRef,
  RootFolderConfig,
} from '../types';
import { FolderService } from '../services/FolderService';
import { PhotoService } from '../services/PhotoService';
import { SettingsService } from '../services/SettingsService';
import { PendingShareService } from '../services/PendingShareService';
import { DriveThumbnail } from './DriveThumbnail';
import { GoogleSignInButton } from './GoogleSignInButton';
import { PhotoDownloadOverlay } from './PhotoDownloadOverlay';
import { downloadOwnerPhoto } from '../utils/downloadHelpers';

interface AlbumViewProps {
  authState: AuthState;
  isSigningIn: boolean;
  rootFolder: RootFolderConfig | null;
  initialTargetAlbum: RecentAlbumRef | null;
  onClearInitialTargetAlbum: () => void;
  refreshTrigger: number;
  onSignIn: () => void;
  onOpenFolderPicker: () => void;
  onSelectPhoto: (photos: PhotoItem[], index: number) => void;
  onGoToBackupWithFolder: (folderId: string, folderName: string) => void;
  onNavigate?: (section: AppSection) => void;
}

export const AlbumView: React.FC<AlbumViewProps> = ({
  authState,
  isSigningIn,
  rootFolder,
  initialTargetAlbum,
  onClearInitialTargetAlbum,
  refreshTrigger,
  onSignIn,
  onOpenFolderPicker,
  onSelectPhoto,
  onGoToBackupWithFolder,
  onNavigate,
}) => {
  const [breadcrumbs, setBreadcrumbs] = useState<FolderBreadcrumb[]>([]);
  const [albums, setAlbums] = useState<AlbumSummary[]>([]);
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [nextPageToken, setNextPageToken] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showNewAlbumForm, setShowNewAlbumForm] = useState(false);
  const [newAlbumName, setNewAlbumName] = useState('');
  const [creatingAlbum, setCreatingAlbum] = useState(false);

  // Isolated pending sharing selection state (does NOT affect Google Drive or published galleries)
  const [pendingSharedIds, setPendingSharedIds] = useState<Set<string>>(() =>
    PendingShareService.getSelectedAlbumIds()
  );

  useEffect(() => {
    const unsub = PendingShareService.subscribe((ids) => {
      setPendingSharedIds(new Set(ids));
    });
    return unsub;
  }, []);

  const handleToggleShare = (e: React.MouseEvent, album: AlbumSummary) => {
    e.stopPropagation();
    PendingShareService.toggleAlbum(album);
  };

  const currentFolder = breadcrumbs[breadcrumbs.length - 1] || null;

  useEffect(() => {
    if (!rootFolder) {
      setBreadcrumbs([]);
      return;
    }

    if (initialTargetAlbum && initialTargetAlbum.id !== rootFolder.id) {
      setBreadcrumbs([
        { id: rootFolder.id, name: rootFolder.name },
        { id: initialTargetAlbum.id, name: initialTargetAlbum.name },
      ]);
      onClearInitialTargetAlbum();
      return;
    }

    setBreadcrumbs((prev) => {
      if (prev.length > 0 && prev[0].id === rootFolder.id) return prev;
      return [{ id: rootFolder.id, name: rootFolder.name }];
    });
  }, [rootFolder, initialTargetAlbum, onClearInitialTargetAlbum]);

  const loadCurrentFolder = useCallback(
    async (folder: FolderBreadcrumb, forceRefresh = false) => {
      if (!authState.hasValidToken) return;
      setLoading(true);
      setError(null);
      try {
        const [albumSummaries, photoResult] = await Promise.all([
          FolderService.getAlbumSummaries(folder.id, forceRefresh),
          PhotoService.listPhotosInFolder({
            folderId: folder.id,
            folderName: folder.name,
            sort: 'date-desc',
            pageSize: 48,
          }),
        ]);
        setAlbums(albumSummaries);
        setPhotos(photoResult.photos);
        setNextPageToken(photoResult.nextPageToken);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : 'Gagal memuat isi folder album dari Google Drive.'
        );
      } finally {
        setLoading(false);
      }
    },
    [authState.hasValidToken]
  );

  useEffect(() => {
    if (authState.hasValidToken && currentFolder) {
      void loadCurrentFolder(currentFolder, refreshTrigger > 0);
    } else {
      setAlbums([]);
      setPhotos([]);
    }
  }, [authState.hasValidToken, currentFolder, refreshTrigger, loadCurrentFolder]);

  const handleEnterAlbum = (album: AlbumSummary) => {
    SettingsService.recordRecentAlbum({
      id: album.id,
      name: album.name,
      accessedAt: Date.now(),
      photoCount: album.photoCount,
      coverThumbnailLink: album.coverThumbnailLink,
    });
    setBreadcrumbs((prev) => [...prev, { id: album.id, name: album.name }]);
    setShowNewAlbumForm(false);
  };

  const handleBreadcrumbClick = (idx: number) => {
    setBreadcrumbs((prev) => prev.slice(0, idx + 1));
    setShowNewAlbumForm(false);
  };

  const handleLoadMorePhotos = async () => {
    if (!currentFolder || !nextPageToken) return;
    setLoadingMore(true);
    try {
      const result = await PhotoService.listPhotosInFolder({
        folderId: currentFolder.id,
        folderName: currentFolder.name,
        sort: 'date-desc',
        pageSize: 48,
        pageToken: nextPageToken,
      });
      setPhotos((prev) => [...prev, ...result.photos]);
      setNextPageToken(result.nextPageToken);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat foto berikutnya.');
    } finally {
      setLoadingMore(false);
    }
  };

  const handleCreateAlbum = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentFolder || !newAlbumName.trim()) return;
    setCreatingAlbum(true);
    setError(null);
    try {
      await FolderService.createNewAlbum(currentFolder.id, newAlbumName.trim());
      setNewAlbumName('');
      setShowNewAlbumForm(false);
      await loadCurrentFolder(currentFolder, true);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Gagal membuat folder album baru di Google Drive.'
      );
    } finally {
      setCreatingAlbum(false);
    }
  };

  if (!authState.hasValidToken) {
    return (
      <div className="flex flex-col items-center justify-center rounded-3xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-[#14171f] py-16 px-6 text-center">
        <FolderHeart className="h-10 w-10 text-slate-300 dark:text-slate-600" />
        <h2 className="mt-4 text-lg font-semibold text-slate-900 dark:text-slate-100">
          Album Berbasis Folder Google Drive
        </h2>
        <p className="mt-1.5 max-w-md text-sm text-slate-500 dark:text-slate-400">
          Hubungkan akun Google Anda untuk menelusuri folder Google Drive sebagai album foto secara langsung.
        </p>
        <div className="mt-6">
          <GoogleSignInButton onClick={onSignIn} loading={isSigningIn} />
        </div>
      </div>
    );
  }

  if (!rootFolder || !currentFolder) {
    return (
      <div className="flex flex-col items-center justify-center rounded-3xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-[#14171f] py-16 px-6 text-center">
        <FolderOpen className="h-10 w-10 text-slate-300 dark:text-slate-600" />
        <h2 className="mt-4 text-lg font-semibold text-slate-900 dark:text-slate-100">
          Pilih Folder Root untuk Menampilkan Album
        </h2>
        <p className="mt-1.5 max-w-md text-sm text-slate-500 dark:text-slate-400">
          Setiap subfolder di dalam folder root pencadangan akan ditampilkan sebagai album foto.
        </p>
        <button
          type="button"
          onClick={onOpenFolderPicker}
          className="mt-6 inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
        >
          <FolderOpen className="h-4 w-4" />
          Pilih Folder Root Drive
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Breadcrumbs & Actions */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <nav
          aria-label="Breadcrumb album"
          className="flex items-center gap-1 overflow-x-auto text-sm text-slate-500 dark:text-slate-400 pb-1 md:pb-0"
        >
          {breadcrumbs.map((crumb, idx) => (
            <React.Fragment key={crumb.id}>
              {idx > 0 && <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />}
              <button
                type="button"
                onClick={() => handleBreadcrumbClick(idx)}
                className={`rounded-lg px-2 py-1 whitespace-nowrap transition-colors ${
                  idx === breadcrumbs.length - 1
                    ? 'font-semibold text-slate-900 dark:text-slate-100 bg-slate-100 dark:bg-slate-800/80'
                    : 'hover:text-blue-600 dark:hover:text-blue-400'
                }`}
              >
                {crumb.name}
              </button>
            </React.Fragment>
          ))}
        </nav>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => onGoToBackupWithFolder(currentFolder.id, currentFolder.name)}
            className="inline-flex min-h-[40px] items-center gap-2 rounded-xl bg-blue-600 px-3.5 text-xs font-medium text-white hover:bg-blue-700 transition-colors whitespace-nowrap"
          >
            <CloudUpload className="h-3.5 w-3.5" />
            Upload ke Folder Ini
          </button>

          <button
            type="button"
            onClick={() => setShowNewAlbumForm((v) => !v)}
            className="inline-flex min-h-[40px] items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#171a21] px-3.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap"
          >
            <FolderPlus className="h-3.5 w-3.5" />
            Album Baru
          </button>

          <button
            type="button"
            onClick={() => void loadCurrentFolder(currentFolder, true)}
            disabled={loading}
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#171a21] text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            aria-label="Segarkan folder album"
            title="Segarkan dari Google Drive"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Create New Album Inline Form */}
      {showNewAlbumForm && (
        <form
          onSubmit={handleCreateAlbum}
          className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-[#14171f] p-4"
        >
          <input
            type="text"
            value={newAlbumName}
            onChange={(e) => setNewAlbumName(e.target.value)}
            placeholder={`Nama album baru di dalam "${currentFolder.name}"...`}
            className="flex-1 min-h-[42px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#1a1f29] px-3.5 text-sm text-slate-900 dark:text-slate-100 focus:border-blue-500 focus:outline-none"
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowNewAlbumForm(false)}
              className="min-h-[42px] rounded-xl px-4 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-800"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={creatingAlbum || !newAlbumName.trim()}
              className="min-h-[42px] rounded-xl bg-blue-600 px-5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50 whitespace-nowrap"
            >
              {creatingAlbum ? 'Membuat...' : 'Buat Folder Album'}
            </button>
          </div>
        </form>
      )}

      {error && (
        <div className="flex items-start gap-2.5 rounded-2xl border border-red-200 dark:border-red-900/70 bg-red-50 dark:bg-red-950/40 px-4 py-3 text-sm text-red-700 dark:text-red-300">
          <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <div className="space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {Array.from({ length: 5 }).map((_, idx) => (
              <div
                key={idx}
                className="rounded-2xl border border-slate-200/70 dark:border-slate-800 overflow-hidden"
              >
                <div className="aspect-4/3 bg-slate-100 dark:bg-slate-800 animate-pulse" />
                <div className="p-3 space-y-2">
                  <div className="h-4 w-2/3 rounded bg-slate-100 dark:bg-slate-800 animate-pulse" />
                  <div className="h-3 w-1/2 rounded bg-slate-100 dark:bg-slate-800 animate-pulse" />
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="space-y-8">
          {/* Subfolders / Albums */}
          {albums.length > 0 && (
            <section>
              <h3 className="mb-3.5 text-sm font-semibold text-slate-800 dark:text-slate-200">
                Subfolder & Album ({albums.length})
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3.5 sm:gap-4">
                {albums.map((album) => {
                  const isPendingShare = pendingSharedIds.has(album.id);
                  return (
                    <button
                      key={album.id}
                      type="button"
                      onClick={() => handleEnterAlbum(album)}
                      className={`group relative flex flex-col overflow-hidden rounded-2xl border text-left hover:shadow-sm transition-all ${
                        isPendingShare
                          ? 'border-blue-500 ring-2 ring-blue-500/20 bg-blue-50/20 dark:bg-blue-950/20'
                          : 'border-slate-200/90 dark:border-slate-800 bg-white dark:bg-[#14171f] hover:border-blue-300 dark:hover:border-blue-700'
                      }`}
                    >
                      <div className="relative aspect-4/3 w-full overflow-hidden bg-slate-100 dark:bg-slate-800/70">
                        {album.coverThumbnailLink || album.coverPhotoId ? (
                          <DriveThumbnail
                            fileId={album.coverPhotoId}
                            thumbnailLink={album.coverThumbnailLink}
                            alt={album.name}
                            className="h-full w-full object-cover group-hover:scale-103 transition-transform duration-200"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-slate-400 dark:text-slate-500">
                            <Folder className="h-10 w-10 stroke-[1.5]" />
                          </div>
                        )}

                        {/* Additive Share Toggle Button */}
                        <div
                          className="absolute top-2 right-2 z-10"
                          onClick={(e) => handleToggleShare(e, album)}
                        >
                          <span
                            role="button"
                            tabIndex={0}
                            title={
                              isPendingShare
                                ? 'Ditandai untuk Galeri Keluarga (klik untuk batal)'
                                : 'Tandai untuk dibagikan ke Galeri Keluarga'
                            }
                            className={`flex h-7 w-7 items-center justify-center rounded-full shadow-md transition-all ${
                              isPendingShare
                                ? 'bg-blue-600 text-white ring-2 ring-white/80 dark:ring-slate-900'
                                : 'bg-white/80 dark:bg-slate-900/80 text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 backdrop-blur-sm'
                            }`}
                          >
                            <Shield className={`h-3.5 w-3.5 ${isPendingShare ? 'fill-current' : ''}`} />
                          </span>
                        </div>
                      </div>
                      <div className="p-3.5">
                        <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                          {album.name}
                        </p>
                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                          {album.photoCount} foto
                          {album.subfolderCount > 0 ? ` · ${album.subfolderCount} folder` : ''}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          {/* Photos inside current folder */}
          {photos.length > 0 && (
            <section>
              <h3 className="mb-3.5 text-sm font-semibold text-slate-800 dark:text-slate-200">
                Foto di {currentFolder.name} ({photos.length})
              </h3>
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 xl:grid-cols-6 gap-1.5 sm:gap-2.5">
                {photos.map((photo, index) => (
                  <div
                    key={photo.id}
                    className="group relative aspect-square overflow-hidden rounded-lg sm:rounded-xl bg-slate-100 dark:bg-slate-800 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                  >
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => onSelectPhoto(photos, index)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          onSelectPhoto(photos, index);
                        }
                      }}
                      className="h-full w-full cursor-pointer focus:outline-none"
                    >
                      <DriveThumbnail
                        fileId={photo.id}
                        thumbnailLink={photo.thumbnailLink}
                        alt={photo.name}
                        className="h-full w-full object-cover group-hover:scale-103 transition-transform duration-200"
                      />
                      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 via-black/30 to-transparent p-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <p className="truncate text-[11px] font-medium text-white">{photo.name}</p>
                      </div>
                    </div>
                    <PhotoDownloadOverlay
                      photoId={photo.id}
                      photoName={photo.name}
                      canDownload={true}
                      onDownloadOriginal={() => downloadOwnerPhoto(photo, 'original')}
                      onDownloadCompressed={() => downloadOwnerPhoto(photo, 'compress')}
                    />
                  </div>
                ))}
              </div>

              {nextPageToken && (
                <div className="mt-5 flex justify-center">
                  <button
                    type="button"
                    disabled={loadingMore}
                    onClick={() => void handleLoadMorePhotos()}
                    className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#171a21] px-5 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50"
                  >
                    {loadingMore && <Loader2 className="h-4 w-4 animate-spin" />}
                    {loadingMore ? 'Memuat...' : 'Muat Foto Lainnya'}
                  </button>
                </div>
              )}
            </section>
          )}

          {/* Empty state if neither albums nor photos exist */}
          {albums.length === 0 && photos.length === 0 && (
            <div className="flex flex-col items-center justify-center rounded-3xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-[#14171f] py-16 px-6 text-center">
              <Folder className="h-10 w-10 text-slate-300 dark:text-slate-600" />
              <h3 className="mt-4 text-base font-semibold text-slate-900 dark:text-slate-100">
                Folder "{currentFolder.name}" masih kosong
              </h3>
              <p className="mt-1.5 max-w-md text-sm text-slate-500 dark:text-slate-400">
                Upload foto langsung ke folder ini atau buat subfolder album baru di Google Drive.
              </p>
              <button
                type="button"
                onClick={() => onGoToBackupWithFolder(currentFolder.id, currentFolder.name)}
                className="mt-5 inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700"
              >
                <CloudUpload className="h-4 w-4" />
                Upload ke Folder Ini
              </button>
            </div>
          )}
        </div>
      )}

      {/* Floating Action Bar when albums are marked for sharing */}
      {pendingSharedIds.size > 0 && onNavigate && (
        <div className="fixed bottom-20 lg:bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 rounded-2xl bg-slate-900/95 dark:bg-white/95 text-white dark:text-slate-900 px-4 py-2.5 shadow-2xl backdrop-blur-md border border-slate-700 dark:border-slate-200 animate-in fade-in slide-in-from-bottom-4 duration-200">
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-white text-xs font-bold">
              {pendingSharedIds.size}
            </span>
            <span className="text-xs font-medium">album ditandai untuk dibagikan</span>
          </div>

          <button
            type="button"
            onClick={() => onNavigate('family-gallery')}
            className="flex items-center gap-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 text-xs font-semibold shadow-sm transition-colors"
          >
            <Shield className="h-3.5 w-3.5" />
            <span>Buka Galeri Keluarga</span>
          </button>

          <button
            type="button"
            onClick={() => PendingShareService.clear()}
            className="text-slate-400 hover:text-white dark:hover:text-slate-900 p-1"
            title="Bersihkan pilihan"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
};
