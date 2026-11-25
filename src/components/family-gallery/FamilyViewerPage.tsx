import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  Clock,
  Download,
  Eye,
  EyeOff,
  FolderHeart,
  Images,
  Loader2,
  Lock,
  LogOut,
  X,
  ZoomIn,
  ZoomOut,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import {
  FamilyViewerAlbum,
  FamilyViewerPhoto,
  PhotoQualityMode,
} from '../../types';
import {
  FamilyGalleryService,
  resolveEffectiveQuality,
} from '../../services/FamilyGalleryService';
import { PhotoDownloadOverlay } from '../PhotoDownloadOverlay';
import { downloadFamilyPhoto } from '../../utils/downloadHelpers';
import { QualitySelector } from './QualitySelector';
import { SlideshowControl } from '../SlideshowControl';

interface FamilyViewerPageProps {
  shareToken: string;
}

type ViewerState = 'loading' | 'auth_needed' | 'authenticated' | 'error';

export const FamilyViewerPage: React.FC<FamilyViewerPageProps> = ({ shareToken }) => {
  const [viewerState, setViewerState] = useState<ViewerState>('loading');
  const [galleryName, setGalleryName] = useState('');
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [errorCode, setErrorCode] = useState('');

  // Password Auth State
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // Gallery Content State
  const [albums, setAlbums] = useState<FamilyViewerAlbum[]>([]);
  const [photos, setPhotos] = useState<FamilyViewerPhoto[]>([]);
  const [quality, setQuality] = useState<PhotoQualityMode>('auto');
  const [selectedAlbum, setSelectedAlbum] = useState<string | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [contentLoading, setContentLoading] = useState(false);

  const checkShareInfo = useCallback(async () => {
    try {
      const info = await FamilyGalleryService.getShareInfo(shareToken);
      setGalleryName(info.name);
      setExpiresAt(info.expiresAt);
      setQuality(info.defaultQuality);
      if (info.isAuthenticated) {
        setViewerState('authenticated');
      } else {
        setViewerState('auth_needed');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Tautan galeri tidak tersedia.';
      setErrorMessage(msg);
      if (msg.includes('dicabut') || msg.includes('dinonaktifkan')) setErrorCode('REVOKED');
      else if (msg.includes('kedaluwarsa')) setErrorCode('EXPIRED');
      else setErrorCode('NOT_FOUND');
      setViewerState('error');
    }
  }, [shareToken]);

  useEffect(() => {
    void checkShareInfo();
  }, [checkShareInfo]);

  const loadContent = useCallback(async () => {
    setContentLoading(true);
    try {
      const data = await FamilyGalleryService.fetchViewerContent();
      setGalleryName(data.gallery.name);
      setQuality(data.gallery.preferredQuality);
      setExpiresAt(data.gallery.expiresAt);
      setAlbums(data.albums);
      setPhotos(data.photos);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Gagal memuat galeri.');
      setViewerState('error');
    } finally {
      setContentLoading(false);
    }
  }, []);

  useEffect(() => {
    if (viewerState === 'authenticated') void loadContent();
  }, [viewerState, loadContent]);

  const handlePasswordAuth = async () => {
    if (!password) return;
    setAuthLoading(true);
    setAuthError(null);
    try {
      await FamilyGalleryService.authenticateWithPassword(shareToken, password);
      setViewerState('authenticated');
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Gagal masuk.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = async () => {
    await FamilyGalleryService.logoutViewer();
    setViewerState('auth_needed');
    setAlbums([]);
    setPhotos([]);
  };

  const handleQualityChange = (q: PhotoQualityMode) => {
    setQuality(q);
    FamilyGalleryService.saveViewerQualityPreference(q).catch(() => {});
  };

  const filteredPhotos = selectedAlbum
    ? photos.filter((p) => p.folderId === selectedAlbum)
    : photos;

  const effectiveQuality = resolveEffectiveQuality(quality);

  // ─── Error State ───
  if (viewerState === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-[#0f1115] p-4">
        <div className="max-w-sm w-full text-center space-y-4">
          <div className="flex justify-center">
            {errorCode === 'REVOKED' ? (
              <Lock className="h-14 w-14 text-red-400" />
            ) : errorCode === 'EXPIRED' ? (
              <Clock className="h-14 w-14 text-amber-400" />
            ) : (
              <AlertCircle className="h-14 w-14 text-slate-400" />
            )}
          </div>
          <h1 className="text-lg font-bold text-slate-800 dark:text-slate-100">
            {errorCode === 'REVOKED'
              ? 'Akses Tautan Tidak Aktif'
              : errorCode === 'EXPIRED'
                ? 'Tautan Kedaluwarsa'
                : 'Galeri Tidak Ditemukan'}
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">{errorMessage}</p>
        </div>
      </div>
    );
  }

  // ─── Loading State ───
  if (viewerState === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-[#0f1115]">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
      </div>
    );
  }

  // ─── Auth Needed: Private Link + Password Only ───
  if (viewerState === 'auth_needed') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-blue-50 to-white dark:from-[#0d1017] dark:to-[#0f1115] p-4">
        <div className="w-full max-w-sm space-y-6">
          <div className="text-center space-y-2">
            <div className="flex justify-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-lg">
                <Images className="h-7 w-7" />
              </div>
            </div>
            <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Private Family Gallery</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">{galleryName}</p>
            {expiresAt && (
              <p className="text-[11px] text-slate-400 inline-flex items-center gap-1">
                <Clock className="h-3 w-3" />
                Berlaku hingga{' '}
                {new Date(expiresAt).toLocaleDateString('id-ID', {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </p>
            )}
          </div>

          <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#171a21] p-5 space-y-4 shadow-sm">
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
                Masukkan Password Galeri
              </label>
              <div className="relative">
                <input
                  type={showPw ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && void handlePasswordAuth()}
                  placeholder="Password galeri"
                  autoFocus
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3 py-2.5 pr-10 text-sm font-mono outline-none focus:ring-2 focus:ring-blue-500/40"
                />
                <button
                  type="button"
                  onClick={() => setShowPw(!showPw)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
                >
                  {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {authError && (
              <p className="text-xs text-red-600 dark:text-red-400 flex items-center gap-1.5">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" /> {authError}
              </p>
            )}

            <button
              type="button"
              onClick={() => void handlePasswordAuth()}
              disabled={authLoading || !password}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white py-2.5 text-sm font-semibold transition-colors disabled:opacity-60"
            >
              {authLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Lock className="h-4 w-4" />
              )}
              Buka Galeri
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─── Authenticated: Gallery Content ───
  return (
    <div className="min-h-screen bg-white dark:bg-[#0f1115] text-slate-900 dark:text-slate-100">
      {/* Top bar */}
      <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 bg-white/90 dark:bg-[#0f1115]/90 backdrop-blur-lg px-4 py-3">
        <div className="min-w-0">
          <h1 className="text-sm font-bold truncate">{galleryName}</h1>
          {expiresAt && (
            <p className="text-[10px] text-slate-400 inline-flex items-center gap-1 mt-0.5">
              <Clock className="h-3 w-3" />
              Berlaku hingga{' '}
              {new Date(expiresAt).toLocaleDateString('id-ID', {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
              })}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <QualitySelector value={quality} onChange={handleQualityChange} variant="compact" />
          <button
            type="button"
            onClick={() => void handleLogout()}
            className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
            title="Keluar galeri"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 py-5 space-y-5">
        {contentLoading && (
          <div className="flex justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
          </div>
        )}

        {!contentLoading && (
          <>
            {/* Album Tabs */}
            {albums.length > 1 && (
              <div className="flex items-center gap-2 overflow-x-auto pb-1 -mx-4 px-4 scrollbar-hide">
                <button
                  type="button"
                  onClick={() => setSelectedAlbum(null)}
                  className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold whitespace-nowrap transition-colors shrink-0 ${
                    !selectedAlbum
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}
                >
                  <Images className="h-3.5 w-3.5" />
                  Semua ({photos.length})
                </button>
                {albums.map((album) => (
                  <button
                    key={album.id}
                    type="button"
                    onClick={() => setSelectedAlbum(album.id)}
                    className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold whitespace-nowrap transition-colors shrink-0 ${
                      selectedAlbum === album.id
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                    }`}
                  >
                    <FolderHeart className="h-3.5 w-3.5" />
                    {album.name} ({album.photoCount})
                  </button>
                ))}
              </div>
            )}

            {/* Photo Grid or Empty State */}
            {filteredPhotos.length === 0 ? (
              <div className="text-center py-16 text-slate-400">
                {selectedAlbum ? (
                  <>
                    <FolderHeart className="h-12 w-12 mx-auto mb-3 text-slate-300 dark:text-slate-600" />
                    <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                      Album "{albums.find((a) => a.id === selectedAlbum)?.name || 'Ini'}" Belum Memiliki Foto
                    </p>
                    <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                      Folder ini masih kosong atau belum ada foto yang diunggah ke dalamnya.
                    </p>
                  </>
                ) : albums.length === 1 && albums[0].photoCount === 0 ? (
                  <>
                    <FolderHeart className="h-12 w-12 mx-auto mb-3 text-slate-300 dark:text-slate-600" />
                    <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                      Album "{albums[0].name}" Masih Kosong
                    </p>
                    <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                      Belum ada foto di dalam folder yang dibagikan ini.
                    </p>
                  </>
                ) : (
                  <>
                    <Images className="h-12 w-12 mx-auto mb-3 text-slate-300 dark:text-slate-600" />
                    <p className="text-sm font-medium">Tidak ada foto di galeri ini.</p>
                  </>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-1 sm:gap-1.5">
                {filteredPhotos.map((photo, idx) => (
                  <div
                    key={photo.id}
                    className="relative aspect-square overflow-hidden rounded-lg bg-slate-100 dark:bg-slate-800 group"
                  >
                    <img
                      src={FamilyGalleryService.getMediaUrl(photo.id, effectiveQuality)}
                      alt={photo.name}
                      loading="lazy"
                      decoding="async"
                      onClick={() => setLightboxIndex(idx)}
                      className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105 cursor-pointer"
                    />
                    <PhotoDownloadOverlay
                      key={photo.id}
                      photoId={photo.id}
                      photoName={photo.name}
                      canDownload={photo.allowDownload}
                      onDownloadOriginal={() => downloadFamilyPhoto(photo, 'original')}
                      onDownloadCompressed={() => downloadFamilyPhoto(photo, 'compress')}
                    />
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Lightbox */}
      {lightboxIndex !== null && lightboxIndex >= 0 && lightboxIndex < filteredPhotos.length && (
        <FamilyLightbox
          photos={filteredPhotos}
          currentIndex={lightboxIndex}
          quality={quality}
          effectiveQuality={effectiveQuality}
          onChangeIndex={setLightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onQualityChange={handleQualityChange}
        />
      )}
    </div>
  );
};

/* ───────── Family Lightbox ───────── */

interface FamilyLightboxProps {
  photos: FamilyViewerPhoto[];
  currentIndex: number;
  quality: PhotoQualityMode;
  effectiveQuality: 'data_saver' | 'hd' | 'original';
  onChangeIndex: (i: number) => void;
  onClose: () => void;
  onQualityChange: (q: PhotoQualityMode) => void;
}

const FamilyLightbox: React.FC<FamilyLightboxProps> = ({
  photos,
  currentIndex,
  quality,
  effectiveQuality,
  onChangeIndex,
  onClose,
  onQualityChange,
}) => {
  const photo = photos[currentIndex];
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < photos.length - 1;
  const [zoomed, setZoomed] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // Manual Auto Slideshow State
  const [isSlideshowPlaying, setIsSlideshowPlaying] = useState(false);
  const [slideshowIntervalSec, setSlideshowIntervalSec] = useState<number | null>(null);

  const handleClose = () => {
    setIsSlideshowPlaying(false);
    setSlideshowIntervalSec(null);
    onClose();
  };

  useEffect(() => {
    setZoomed(false);
    setLoaded(false);
  }, [currentIndex]);

  // Slideshow Timer Lifecycle Effect
  useEffect(() => {
    if (!isSlideshowPlaying || !slideshowIntervalSec || photos.length <= 1) {
      return;
    }

    const timer = window.setTimeout(() => {
      const nextIndex = (currentIndex + 1) % photos.length;
      onChangeIndex(nextIndex);
    }, slideshowIntervalSec * 1000);

    return () => {
      window.clearTimeout(timer);
    };
  }, [isSlideshowPlaying, slideshowIntervalSec, currentIndex, photos.length, onChangeIndex]);

  // Preload next image derivative when slideshow is playing
  useEffect(() => {
    if (!isSlideshowPlaying || photos.length <= 1) return;
    const nextPhoto = photos[(currentIndex + 1) % photos.length];
    if (nextPhoto?.id) {
      const nextUrl = FamilyGalleryService.getMediaUrl(
        nextPhoto.id,
        effectiveQuality === 'data_saver' ? 'hd' : effectiveQuality
      );
      if (nextUrl) {
        const img = new Image();
        img.src = nextUrl;
      }
    }
  }, [isSlideshowPlaying, currentIndex, photos, effectiveQuality]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
      if (e.key === 'ArrowLeft' && hasPrev) onChangeIndex(currentIndex - 1);
      if (e.key === 'ArrowRight' && hasNext) onChangeIndex(currentIndex + 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [hasPrev, hasNext, currentIndex, onChangeIndex, handleClose]);

  const imgSrc = FamilyGalleryService.getMediaUrl(
    photo.id,
    zoomed ? 'original' : effectiveQuality === 'data_saver' ? 'hd' : effectiveQuality
  );

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#08090c] text-white" role="dialog" aria-modal="true">
      {/* Top Bar */}
      <header className="flex h-14 shrink-0 items-center justify-between gap-3 px-3 sm:px-5 bg-gradient-to-b from-black/80 to-transparent">
        <div className="flex items-center gap-3 min-w-0">
          <button type="button" onClick={handleClose} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full hover:bg-white/10">
            <X className="h-5 w-5" />
          </button>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{photo.name}</p>
            <p className="text-xs text-slate-400 tabular-nums">
              {currentIndex + 1} / {photos.length}
              {photo.folderName ? ` · ${photo.folderName}` : ''}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <SlideshowControl
            isPlaying={isSlideshowPlaying}
            activeIntervalSec={slideshowIntervalSec}
            onStart={(seconds) => {
              setSlideshowIntervalSec(seconds);
              setIsSlideshowPlaying(true);
            }}
            onStop={() => {
              setIsSlideshowPlaying(false);
              setSlideshowIntervalSec(null);
            }}
          />
          <QualitySelector value={quality} onChange={onQualityChange} variant="dark" />
          <button
            type="button"
            onClick={() => setZoomed(!zoomed)}
            className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-white/10"
            title={zoomed ? 'Perkecil' : 'Perbesar'}
          >
            {zoomed ? <ZoomOut className="h-5 w-5" /> : <ZoomIn className="h-5 w-5" />}
          </button>
          {photo.allowDownload && (
            <PhotoDownloadOverlay
              key={photo.id}
              photoId={photo.id}
              photoName={photo.name}
              canDownload={photo.allowDownload}
              onDownloadOriginal={() => downloadFamilyPhoto(photo, 'original')}
              onDownloadCompressed={() => downloadFamilyPhoto(photo, 'compress')}
              variant="header"
            />
          )}
        </div>
      </header>

      {/* Image Viewer */}
      <div className="relative flex-1 flex items-center justify-center overflow-hidden">
        {!loaded && (
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-blue-400" />
          </div>
        )}
        <img
          src={imgSrc}
          alt={photo.name}
          onLoad={() => setLoaded(true)}
          className={`max-h-full transition-all duration-300 ${
            zoomed ? 'max-w-none cursor-zoom-out' : 'max-w-full cursor-zoom-in'
          } ${loaded ? 'opacity-100' : 'opacity-0'}`}
          onClick={() => setZoomed(!zoomed)}
          draggable={false}
        />

        {hasPrev && (
          <button
            type="button"
            onClick={() => onChangeIndex(currentIndex - 1)}
            className="absolute left-2 top-1/2 -translate-y-1/2 flex h-12 w-12 items-center justify-center rounded-full bg-black/40 hover:bg-black/60 text-white transition-colors"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
        )}
        {hasNext && (
          <button
            type="button"
            onClick={() => onChangeIndex(currentIndex + 1)}
            className="absolute right-2 top-1/2 -translate-y-1/2 flex h-12 w-12 items-center justify-center rounded-full bg-black/40 hover:bg-black/60 text-white transition-colors"
          >
            <ChevronRight className="h-6 w-6" />
          </button>
        )}
      </div>
    </div>
  );
};
