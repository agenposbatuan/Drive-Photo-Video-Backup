import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowUpDown,
  CloudUpload,
  FolderOpen,
  Images,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import { AuthState, PhotoItem, RootFolderConfig, SortOption } from '../types';
import { PhotoService } from '../services/PhotoService';
import { formatIndonesianDate } from '../utils/formatters';
import { DriveThumbnail } from './DriveThumbnail';
import { GoogleSignInButton } from './GoogleSignInButton';
import { PhotoDownloadOverlay } from './PhotoDownloadOverlay';
import { downloadOwnerPhoto } from '../utils/downloadHelpers';

interface SemuaFotoViewProps {
  authState: AuthState;
  isSigningIn: boolean;
  rootFolder: RootFolderConfig | null;
  refreshTrigger: number;
  onSignIn: () => void;
  onOpenFolderPicker: () => void;
  onGoToBackup: () => void;
  onSelectPhoto: (photos: PhotoItem[], index: number) => void;
}

export const SemuaFotoView: React.FC<SemuaFotoViewProps> = ({
  authState,
  isSigningIn,
  rootFolder,
  refreshTrigger,
  onSignIn,
  onOpenFolderPicker,
  onGoToBackup,
  onSelectPhoto,
}) => {
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [nextPageToken, setNextPageToken] = useState<string | undefined>(undefined);
  const [sort, setSort] = useState<SortOption>('date-desc');
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadPhotos = useCallback(
    async (options: { reset?: boolean; forceRefresh?: boolean; pageToken?: string } = {}) => {
      if (!authState.hasValidToken || !rootFolder) return;

      const isReset = options.reset ?? true;
      if (isReset) {
        setLoading(true);
      } else {
        setLoadingMore(true);
      }
      setError(null);

      try {
        const result = await PhotoService.listAllPhotosUnderRoot({
          rootFolderId: rootFolder.id,
          rootFolderName: rootFolder.name,
          sort,
          pageSize: 60,
          pageToken: options.pageToken,
          forceRefreshFolders: options.forceRefresh,
        });

        setPhotos((prev) => (isReset ? result.photos : [...prev, ...result.photos]));
        setNextPageToken(result.nextPageToken);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : 'Gagal memuat daftar foto dari Google Drive.'
        );
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [authState.hasValidToken, rootFolder, sort]
  );

  useEffect(() => {
    if (authState.hasValidToken && rootFolder) {
      void loadPhotos({ reset: true, forceRefresh: refreshTrigger > 0 });
    } else {
      setPhotos([]);
      setNextPageToken(undefined);
    }
  }, [authState.hasValidToken, rootFolder, sort, refreshTrigger, loadPhotos]);

  const groupedByDate = useMemo(() => {
    if (sort === 'name-asc' || sort === 'name-desc') {
      return null;
    }
    const groups: Array<{ dateLabel: string; items: Array<{ photo: PhotoItem; globalIndex: number }> }> = [];
    const map = new Map<string, number>();

    photos.forEach((photo, idx) => {
      const label = formatIndonesianDate(photo.displayDate);
      let groupIndex = map.get(label);
      if (groupIndex === undefined) {
        groupIndex = groups.length;
        map.set(label, groupIndex);
        groups.push({ dateLabel: label, items: [] });
      }
      groups[groupIndex].items.push({ photo, globalIndex: idx });
    });

    return groups;
  }, [photos, sort]);

  if (!authState.hasValidToken) {
    return (
      <div className="flex flex-col items-center justify-center rounded-3xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-[#14171f] py-16 px-6 text-center">
        <Images className="h-10 w-10 text-slate-300 dark:text-slate-600" />
        <h2 className="mt-4 text-lg font-semibold text-slate-900 dark:text-slate-100">
          Hubungkan Google Drive untuk Melihat Foto
        </h2>
        <p className="mt-1.5 max-w-md text-sm text-slate-500 dark:text-slate-400">
          Galeri Semua Foto menampilkan foto asli yang tersimpan di folder pencadangan Google Drive Anda.
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
          Folder Root Pencadangan Belum Dipilih
        </h2>
        <p className="mt-1.5 max-w-md text-sm text-slate-500 dark:text-slate-400">
          Untuk menjaga privasi dan kerapian, galeri hanya menampilkan foto di dalam folder root yang Anda pilih.
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
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <p className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
            Folder root: <strong className="text-slate-800 dark:text-slate-200">{rootFolder.name}</strong> ·{' '}
            {photos.length.toLocaleString('id-ID')} foto dimuat
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative inline-flex items-center">
            <ArrowUpDown className="pointer-events-none absolute left-3 h-3.5 w-3.5 text-slate-400" />
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortOption)}
              aria-label="Urutkan foto"
              className="min-h-[40px] rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#171a21] pl-8 pr-8 text-xs font-medium text-slate-700 dark:text-slate-200 focus:border-blue-500 focus:outline-none"
            >
              <option value="date-desc">Tanggal Terbaru</option>
              <option value="date-asc">Tanggal Terlama</option>
              <option value="name-asc">Nama File (A–Z)</option>
              <option value="name-desc">Nama File (Z–A)</option>
            </select>
          </div>

          <button
            type="button"
            onClick={() => void loadPhotos({ reset: true, forceRefresh: true })}
            disabled={loading}
            className="inline-flex min-h-[40px] items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#171a21] px-3.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 transition-colors whitespace-nowrap"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Segarkan
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2.5 rounded-2xl border border-red-200 dark:border-red-900/70 bg-red-50 dark:bg-red-950/40 px-4 py-3 text-sm text-red-700 dark:text-red-300">
          <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p>{error}</p>
            <button
              type="button"
              onClick={() => void loadPhotos({ reset: true, forceRefresh: true })}
              className="mt-1 text-xs font-semibold underline"
            >
              Coba lagi
            </button>
          </div>
        </div>
      )}

      {/* Loading Skeleton */}
      {loading ? (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 xl:grid-cols-6 gap-1.5 sm:gap-2.5">
          {Array.from({ length: 18 }).map((_, idx) => (
            <div
              key={idx}
              className="aspect-square rounded-lg sm:rounded-xl bg-slate-100 dark:bg-slate-800/80 animate-pulse"
            />
          ))}
        </div>
      ) : photos.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-3xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-[#14171f] py-16 px-6 text-center">
          <Images className="h-10 w-10 text-slate-300 dark:text-slate-600" />
          <h3 className="mt-4 text-base font-semibold text-slate-900 dark:text-slate-100">
            Belum ada foto di folder {rootFolder.name}
          </h3>
          <p className="mt-1.5 max-w-md text-sm text-slate-500 dark:text-slate-400">
            Mulai cadangkan foto pertama Anda atau pilih folder Google Drive lain yang sudah berisi foto.
          </p>
          <button
            type="button"
            onClick={onGoToBackup}
            className="mt-6 inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
          >
            <CloudUpload className="h-4 w-4" />
            Cadangkan Foto Sekarang
          </button>
        </div>
      ) : groupedByDate ? (
        <div className="space-y-7">
          {groupedByDate.map((group) => (
            <section key={group.dateLabel}>
              <h3 className="mb-3 text-sm font-semibold text-slate-800 dark:text-slate-200">
                {group.dateLabel}
              </h3>
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 xl:grid-cols-6 gap-1.5 sm:gap-2.5">
                {group.items.map(({ photo, globalIndex }) => (
                  <PhotoTile
                    key={photo.id}
                    photo={photo}
                    onClick={() => onSelectPhoto(photos, globalIndex)}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 xl:grid-cols-6 gap-1.5 sm:gap-2.5">
          {photos.map((photo, index) => (
            <PhotoTile
              key={photo.id}
              photo={photo}
              onClick={() => onSelectPhoto(photos, index)}
            />
          ))}
        </div>
      )}

      {/* Pagination */}
      {nextPageToken && !loading && (
        <div className="flex justify-center pt-2">
          <button
            type="button"
            disabled={loadingMore}
            onClick={() => void loadPhotos({ reset: false, pageToken: nextPageToken })}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#171a21] px-6 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 transition-colors"
          >
            {loadingMore && <Loader2 className="h-4 w-4 animate-spin" />}
            {loadingMore ? 'Memuat foto lainnya...' : 'Muat Foto Lainnya'}
          </button>
        </div>
      )}
    </div>
  );
};

interface PhotoTileProps {
  photo: PhotoItem;
  onClick: () => void;
}

const PhotoTile: React.FC<PhotoTileProps> = ({ photo, onClick }) => (
  <div className="group relative aspect-square w-full overflow-hidden rounded-lg sm:rounded-xl bg-slate-100 dark:bg-slate-800 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600">
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
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
      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 via-black/30 to-transparent p-2 opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity">
        <p className="truncate text-[11px] font-medium text-white">{photo.name}</p>
        {photo.folderName && (
          <p className="truncate text-[10px] text-slate-200/90">{photo.folderName}</p>
        )}
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
);
