import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowUpDown,
  Download,
  Film,
  Folder,
  FolderOpen,
  Loader2,
  Play,
  RefreshCw,
  Search,
  Video,
  X,
} from 'lucide-react';
import { AuthState, RootFolderConfig, SortOption, VideoItem } from '../types';
import { VideoService } from '../services/VideoService';
import { formatDurationMillis, formatFileSize, formatIndonesianDate } from '../utils/formatters';
import { GoogleSignInButton } from './GoogleSignInButton';
import { VideoPlayerModal } from './VideoPlayerModal';
import { VideoThumbnail } from './VideoThumbnail';

export interface SemuaVideoViewProps {
  authState: AuthState;
  isSigningIn: boolean;
  rootFolder: RootFolderConfig | null;
  refreshTrigger: number;
  onSignIn: () => void;
  onOpenFolderPicker: () => void;
  onGoToBackup: () => void;
}

export const SemuaVideoView: React.FC<SemuaVideoViewProps> = ({
  authState,
  isSigningIn,
  rootFolder,
  refreshTrigger,
  onSignIn,
  onOpenFolderPicker,
  onGoToBackup,
}) => {
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [folderMap, setFolderMap] = useState<Map<string, string>>(new Map());
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [sort, setSort] = useState<SortOption>('date-desc');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextPageToken, setNextPageToken] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  // Player state
  const [activeVideoIndex, setActiveVideoIndex] = useState<number | null>(null);

  const loadVideos = useCallback(
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
        const res = await VideoService.listAllVideosUnderRoot({
          rootFolderId: rootFolder.id,
          rootFolderName: rootFolder.name,
          sort,
          pageSize: 50,
          pageToken: options.pageToken,
          forceRefreshFolders: options.forceRefresh,
        });

        setVideos((prev) => (isReset ? res.videos : [...prev, ...res.videos]));
        setFolderMap(res.folderMap);
        setNextPageToken(res.nextPageToken);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : 'Gagal memuat daftar video dari Google Drive.'
        );
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [authState.hasValidToken, rootFolder, sort]
  );

  useEffect(() => {
    void loadVideos({ reset: true });
  }, [loadVideos, refreshTrigger]);

  // Kumpulan folder unik yang memiliki video
  const availableFolders = useMemo(() => {
    const map = new Map<string, { id: string; name: string; count: number }>();
    for (const v of videos) {
      const fId = v.folderId || 'root';
      const fName = v.folderName || 'Folder Utama';
      const existing = map.get(fId);
      if (existing) {
        existing.count++;
      } else {
        map.set(fId, { id: fId, name: fName, count: 1 });
      }
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [videos]);

  // Filter video berdasarkan folder terpilih dan search query
  const filteredVideos = useMemo(() => {
    let result = videos;
    if (selectedFolderId) {
      result = result.filter((v) => (v.folderId || 'root') === selectedFolderId);
    }
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      result = result.filter(
        (v) =>
          v.name.toLowerCase().includes(q) ||
          (v.folderName && v.folderName.toLowerCase().includes(q))
      );
    }
    return result;
  }, [videos, selectedFolderId, searchQuery]);

  const activeVideo = activeVideoIndex !== null ? filteredVideos[activeVideoIndex] : null;

  // Total byte size dari video yang dimuat
  const totalSizeBytes = useMemo(() => {
    return filteredVideos.reduce((acc, v) => acc + (v.sizeBytes || 0), 0);
  }, [filteredVideos]);

  return (
    <div className="space-y-4">
      {/* Top Header & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-2 border-b border-slate-200 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <Video className="h-6 w-6 text-blue-600 dark:text-blue-400" />
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
              Semua Video
            </h1>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Jelajahi dan putar video cadangan langsung dari struktur folder asli Google Drive.
          </p>
        </div>

        {/* Toolbar Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Search Input */}
          <div className="relative">
            <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari video..."
              className="w-36 sm:w-48 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 pl-8 pr-7 py-1.5 text-xs outline-none focus:ring-1 focus:ring-blue-500"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-slate-400 hover:text-slate-600"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>

          {/* Sort Dropdown */}
          <div className="flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs text-slate-600 dark:text-slate-300">
            <ArrowUpDown className="h-3.5 w-3.5 text-slate-400 shrink-0" />
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortOption)}
              className="bg-transparent font-medium outline-none cursor-pointer"
            >
              <option value="date-desc">Terbaru</option>
              <option value="date-asc">Terlama</option>
              <option value="name-asc">Nama (A-Z)</option>
              <option value="name-desc">Nama (Z-A)</option>
            </select>
          </div>

          {/* Refresh Button */}
          <button
            type="button"
            onClick={() => void loadVideos({ reset: true, forceRefresh: true })}
            disabled={loading}
            className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-50"
            title="Segarkan daftar video"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* State: Belum Login */}
      {!authState.hasValidToken && (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30 p-8 text-center space-y-3">
          <Video className="h-12 w-12 text-slate-400" />
          <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200">
            Hubungkan Akun Google Drive
          </h3>
          <p className="text-xs text-slate-500 max-w-sm">
            Masuk dengan akun Google untuk menjelajahi dan memutar video yang tersimpan di Google Drive Anda.
          </p>
          <GoogleSignInButton
            onClick={onSignIn}
            disabled={isSigningIn}
            label={isSigningIn ? 'Menghubungkan...' : 'Masuk dengan Google'}
          />
        </div>
      )}

      {/* State: Belum Memilih Folder Root */}
      {authState.hasValidToken && !rootFolder && (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30 p-8 text-center space-y-3">
          <FolderOpen className="h-12 w-12 text-blue-500" />
          <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200">
            Pilih Folder Cadangan
          </h3>
          <p className="text-xs text-slate-500 max-w-sm">
            Tentukan folder utama Google Drive yang menjadi target penelusuran video Anda.
          </p>
          <button
            type="button"
            onClick={onOpenFolderPicker}
            className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 shadow-sm transition-colors"
          >
            Pilih Folder Sekarang
          </button>
        </div>
      )}

      {/* Konten Video Jika Siap */}
      {authState.hasValidToken && rootFolder && (
        <>
          {/* Folder Filter Bar (Navigation Tabs) */}
          {availableFolders.length > 1 && (
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-hide text-xs">
              <button
                type="button"
                onClick={() => setSelectedFolderId(null)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-medium transition-colors shrink-0 ${
                  selectedFolderId === null
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                <Film className="h-3.5 w-3.5" />
                Semua Folder ({videos.length})
              </button>

              {availableFolders.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setSelectedFolderId(f.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-medium transition-colors shrink-0 ${
                    selectedFolderId === f.id
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}
                >
                  <Folder className="h-3.5 w-3.5" />
                  {f.name} ({f.count})
                </button>
              ))}
            </div>
          )}

          {/* Info Summary */}
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 px-1">
            <span>
              Menampilkan <strong>{filteredVideos.length}</strong> video
              {selectedFolderId && (
                <span>
                  {' '}
                  di folder{' '}
                  <strong>
                    {availableFolders.find((f) => f.id === selectedFolderId)?.name || 'Folder Pilihan'}
                  </strong>
                </span>
              )}
            </span>
            <span>Total: <strong>{formatFileSize(totalSizeBytes)}</strong></span>
          </div>

          {/* Error Message */}
          {error && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 text-xs text-red-600 dark:text-red-400">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Video Grid */}
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 text-slate-400 space-y-2">
              <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
              <p className="text-xs">Memindai video di Google Drive...</p>
            </div>
          ) : filteredVideos.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-slate-400 space-y-3">
              <Video className="h-12 w-12 text-slate-300 dark:text-slate-600" />
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                {searchQuery
                  ? `Tidak ada video yang cocok dengan "${searchQuery}".`
                  : 'Belum ada video ditemukan di folder ini.'}
              </p>
              <p className="text-xs text-slate-400 max-w-sm text-center">
                Pastikan folder Google Drive Anda berisi file video seperti MP4, MOV, atau MKV.
              </p>
              <button
                type="button"
                onClick={onGoToBackup}
                className="px-3.5 py-1.5 rounded-xl bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 transition-colors"
              >
                Cadangkan Video Baru
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {filteredVideos.map((video, idx) => {
                return (
                  <div
                    key={video.id}
                    onClick={() => setActiveVideoIndex(idx)}
                    className="group relative flex flex-col rounded-2xl overflow-hidden border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-[#13161d] shadow-sm hover:shadow-md transition-all cursor-pointer"
                  >
                    {/* Thumbnail Viewport dengan Multi-tier Fallback */}
                    <VideoThumbnail video={video} />

                    {/* Metadata Info Footer */}
                    <div className="p-2.5 space-y-1">
                      <h3
                        className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors"
                        title={video.name}
                      >
                        {video.name}
                      </h3>
                      <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                        <span className="flex items-center gap-1 truncate" title={video.folderName}>
                          <Folder className="h-3 w-3 shrink-0 text-blue-500" />
                          <span className="truncate">{video.folderName}</span>
                        </span>
                        <span className="shrink-0 tabular-nums">
                          {formatIndonesianDate(video.displayDate)}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Load More Button if paginated */}
          {nextPageToken && !loading && (
            <div className="flex justify-center pt-4">
              <button
                type="button"
                onClick={() => void loadVideos({ reset: false, pageToken: nextPageToken })}
                disabled={loadingMore}
                className="flex items-center gap-2 px-5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-xs font-semibold transition-colors disabled:opacity-50"
              >
                {loadingMore && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Muat Lebih Banyak Video
              </button>
            </div>
          )}
        </>
      )}

      {/* Video Player Modal */}
      {activeVideo && activeVideoIndex !== null && (
        <VideoPlayerModal
          video={activeVideo}
          onClose={() => setActiveVideoIndex(null)}
          onPrev={() => setActiveVideoIndex((i) => (i !== null && i > 0 ? i - 1 : i))}
          onNext={() =>
            setActiveVideoIndex((i) =>
              i !== null && i < filteredVideos.length - 1 ? i + 1 : i
            )
          }
          hasPrev={activeVideoIndex > 0}
          hasNext={activeVideoIndex < filteredVideos.length - 1}
        />
      )}
    </div>
  );
};
