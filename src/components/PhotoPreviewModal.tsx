import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Gauge,
  Info,
  Loader2,
  RefreshCw,
  X,
} from 'lucide-react';
import { PhotoItem, PhotoQualityMode } from '../types';
import { ThumbnailService } from '../services/ThumbnailService';
import { SettingsService } from '../services/SettingsService';
import { resolveEffectiveQuality } from '../services/FamilyGalleryService';
import { formatFileSize, formatIndonesianDateTime } from '../utils/formatters';
import { PhotoDownloadOverlay } from './PhotoDownloadOverlay';
import { downloadOwnerPhoto } from '../utils/downloadHelpers';
import { SlideshowControl } from './SlideshowControl';

interface PhotoPreviewModalProps {
  photos: PhotoItem[];
  currentIndex: number | null;
  onChangeIndex: (nextIndex: number) => void;
  onClose: () => void;
  quality?: PhotoQualityMode;
}

export const PhotoPreviewModal: React.FC<PhotoPreviewModalProps> = ({
  photos,
  currentIndex,
  onChangeIndex,
  onClose,
  quality,
}) => {
  const [originalUrl, setOriginalUrl] = useState<string | null>(null);
  const [loadingFull, setLoadingFull] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showInfo, setShowInfo] = useState(false);
  const [reloadNonce, setReloadNonce] = useState(0);
  const [forceLoadOriginal, setForceLoadOriginal] = useState(false);

  // Manual Auto Slideshow State
  const [isSlideshowPlaying, setIsSlideshowPlaying] = useState(false);
  const [slideshowIntervalSec, setSlideshowIntervalSec] = useState<number | null>(null);

  const activeQualityMode = quality ?? SettingsService.getSettings().galleryQuality ?? 'auto';
  const effectiveQuality = resolveEffectiveQuality(activeQualityMode);

  const isOpen = currentIndex !== null && currentIndex >= 0 && currentIndex < photos.length;
  const photo = isOpen ? photos[currentIndex] : null;
  const hasPrev = isOpen && currentIndex > 0;
  const hasNext = isOpen && currentIndex < photos.length - 1;

  const handleClose = () => {
    setIsSlideshowPlaying(false);
    setSlideshowIntervalSec(null);
    onClose();
  };

  useEffect(() => {
    setForceLoadOriginal(false);
  }, [currentIndex]);

  // Slideshow Timer Lifecycle Effect
  useEffect(() => {
    if (!isSlideshowPlaying || !slideshowIntervalSec || photos.length <= 1 || currentIndex === null) {
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
    if (!isSlideshowPlaying || currentIndex === null || photos.length <= 1) return;
    const nextPhoto = photos[(currentIndex + 1) % photos.length];
    if (nextPhoto?.thumbnailLink) {
      const nextUrl = ThumbnailService.getGridThumbnailUrl(
        nextPhoto.thumbnailLink,
        effectiveQuality === 'data_saver' ? 1200 : 1600
      );
      if (nextUrl) {
        const img = new Image();
        img.src = nextUrl;
      }
    }
  }, [isSlideshowPlaying, currentIndex, photos, effectiveQuality]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
      if (e.key === 'ArrowLeft' && hasPrev) onChangeIndex(currentIndex - 1);
      if (e.key === 'ArrowRight' && hasNext) onChangeIndex(currentIndex + 1);
      if (e.key.toLowerCase() === 'i') setShowInfo((v) => !v);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, hasPrev, hasNext, currentIndex, onChangeIndex, handleClose]);

  useEffect(() => {
    if (!photo) {
      setOriginalUrl(null);
      setLoadError(null);
      return;
    }

    // Dalam mode Irit Kuota, jangan langsung mengunduh file mentah besar kecuali diminta pengguna
    if (effectiveQuality === 'data_saver' && !forceLoadOriginal) {
      setOriginalUrl(null);
      setLoadingFull(false);
      setLoadError(null);
      return;
    }

    const controller = new AbortController();
    setOriginalUrl(null);
    setLoadingFull(true);
    setLoadError(null);

    ThumbnailService.loadOriginalImage(photo.id, controller.signal)
      .then((url) => {
        setOriginalUrl(url);
        setLoadingFull(false);
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setLoadingFull(false);
        setLoadError(
          err instanceof Error
            ? err.message
            : 'Gagal memuat foto resolusi asli dari Google Drive.'
        );
      });

    return () => controller.abort();
  }, [photo, reloadNonce, effectiveQuality, forceLoadOriginal]);

  if (!isOpen || !photo) return null;

  const fallbackThumb = ThumbnailService.getGridThumbnailUrl(
    photo.thumbnailLink,
    effectiveQuality === 'data_saver' ? 1200 : 1600
  );
  const displaySrc = originalUrl || fallbackThumb;

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-[#08090c] text-white"
      role="dialog"
      aria-modal="true"
      aria-label={`Pratinjau foto ${photo.name}`}
    >
      {/* Top bar */}
      <header className="flex h-14 shrink-0 items-center justify-between gap-3 px-3 sm:px-5 bg-gradient-to-b from-black/80 to-transparent">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={handleClose}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-slate-200 hover:bg-white/10 transition-colors"
            aria-label="Tutup pratinjau"
          >
            <X className="h-5 w-5" />
          </button>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-white">{photo.name}</p>
            <p className="text-xs text-slate-400 tabular-nums">
              {currentIndex + 1} / {photos.length} · {formatIndonesianDateTime(photo.displayDate)}
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
          {effectiveQuality === 'data_saver' && !originalUrl && (
            <button
              type="button"
              onClick={() => setForceLoadOriginal(true)}
              disabled={loadingFull}
              className="hidden sm:inline-flex items-center gap-1.5 rounded-full bg-white/10 hover:bg-white/20 px-3 py-1.5 text-xs font-medium text-slate-200 transition-colors"
              title="Foto ditampilkan dalam mode Irit Kuota. Klik untuk memuat file resolusi asli."
            >
              <Gauge className="h-3.5 w-3.5 text-amber-400" />
              <span>Irit Kuota (Muat Asli)</span>
            </button>
          )}
          <PhotoDownloadOverlay
            key={photo.id}
            photoId={photo.id}
            photoName={photo.name}
            canDownload={true}
            onDownloadOriginal={() => downloadOwnerPhoto(photo, 'original')}
            onDownloadCompressed={() => downloadOwnerPhoto(photo, 'compress')}
            variant="header"
          />
          {photo.webViewLink && (
            <a
              href={photo.webViewLink}
              target="_blank"
              rel="noopener noreferrer"
              className="flex h-11 w-11 items-center justify-center rounded-full text-slate-200 hover:bg-white/10 transition-colors"
              aria-label="Buka di Google Drive"
              title="Buka di Google Drive"
            >
              <ExternalLink className="h-5 w-5" />
            </a>
          )}
          <button
            type="button"
            onClick={() => setShowInfo((v) => !v)}
            className={`flex h-11 w-11 items-center justify-center rounded-full transition-colors ${
              showInfo ? 'bg-blue-600 text-white' : 'text-slate-200 hover:bg-white/10'
            }`}
            aria-label="Informasi detail foto"
            title="Detail foto"
          >
            <Info className="h-5 w-5" />
          </button>
        </div>
      </header>

      {/* Main Viewer + Optional Info Sidebar */}
      <div className="relative flex flex-1 min-h-0 overflow-hidden">
        <div className="relative flex flex-1 items-center justify-center p-2 sm:p-8 select-none">
          {/* Previous Button */}
          {hasPrev && (
            <button
              type="button"
              onClick={() => onChangeIndex(currentIndex - 1)}
              className="absolute left-2 sm:left-4 z-10 flex h-12 w-12 items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/80 transition-colors"
              aria-label="Foto sebelumnya"
            >
              <ChevronLeft className="h-6 w-6" />
            </button>
          )}

          {/* Image Canvas */}
          {displaySrc ? (
            <div className="relative flex max-h-full max-w-full items-center justify-center">
              <img
                src={displaySrc}
                alt={photo.name}
                referrerPolicy="no-referrer"
                className="max-h-[calc(100vh-112px)] max-w-full object-contain rounded-sm"
              />
              {loadingFull && (
                <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-2 rounded-full bg-black/75 px-3.5 py-1.5 text-xs text-slate-200">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-400" />
                  <span>Memuat resolusi asli...</span>
                </div>
              )}
            </div>
          ) : loadingFull ? (
            <div className="flex flex-col items-center gap-3 text-slate-300">
              <Loader2 className="h-8 w-8 animate-spin text-blue-400" />
              <p className="text-sm">Memuat foto dari Google Drive...</p>
            </div>
          ) : (
            <div className="flex max-w-sm flex-col items-center text-center gap-3 p-6">
              <AlertCircle className="h-9 w-9 text-red-400" />
              <p className="text-sm text-slate-200">
                {loadError || 'Foto tidak dapat ditampilkan.'}
              </p>
              <button
                type="button"
                onClick={() => setReloadNonce((n) => n + 1)}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-white/10 px-4 py-2 text-xs font-medium text-white hover:bg-white/20"
              >
                <RefreshCw className="h-4 w-4" />
                Coba Muat Ulang
              </button>
            </div>
          )}

          {loadError && displaySrc && (
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-2 rounded-xl bg-red-950/90 border border-red-800 px-3.5 py-2 text-xs text-red-200">
              <span>{loadError}</span>
              <button
                type="button"
                onClick={() => setReloadNonce((n) => n + 1)}
                className="underline font-medium hover:text-white whitespace-nowrap"
              >
                Muat ulang
              </button>
            </div>
          )}

          {/* Next Button */}
          {hasNext && (
            <button
              type="button"
              onClick={() => onChangeIndex(currentIndex + 1)}
              className="absolute right-2 sm:right-4 z-10 flex h-12 w-12 items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/80 transition-colors"
              aria-label="Foto berikutnya"
            >
              <ChevronRight className="h-6 w-6" />
            </button>
          )}
        </div>

        {/* Metadata Info Drawer */}
        {showInfo && (
          <aside className="absolute inset-x-0 bottom-0 sm:static sm:inset-auto z-20 max-h-[65vh] sm:max-h-none sm:w-80 shrink-0 overflow-y-auto bg-[#14171f] border-t sm:border-t-0 sm:border-l border-slate-800 p-5 text-sm">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="font-semibold text-white">Detail Foto</h3>
              <button
                type="button"
                onClick={() => setShowInfo(false)}
                className="sm:hidden flex h-9 w-9 items-center justify-center rounded-full text-slate-400 hover:bg-white/10"
                aria-label="Tutup detail foto"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <dl className="mt-4 space-y-4 text-xs">
              <div>
                <dt className="text-slate-400">Nama File Asli</dt>
                <dd className="mt-1 break-all font-medium text-slate-100">{photo.name}</dd>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <dt className="text-slate-400">Ukuran File</dt>
                  <dd className="mt-1 font-mono-tabular text-slate-100">
                    {formatFileSize(photo.sizeBytes)}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-400">Format MIME</dt>
                  <dd className="mt-1 font-mono-tabular text-slate-100">{photo.mimeType}</dd>
                </div>
              </div>

              {photo.imageMediaMetadata?.width && photo.imageMediaMetadata?.height && (
                <div>
                  <dt className="text-slate-400">Dimensi Resolusi</dt>
                  <dd className="mt-1 font-mono-tabular text-slate-100">
                    {photo.imageMediaMetadata.width} × {photo.imageMediaMetadata.height} piksel
                  </dd>
                </div>
              )}

              <div>
                <dt className="text-slate-400">Tanggal Foto</dt>
                <dd className="mt-1 text-slate-100">
                  {formatIndonesianDateTime(photo.displayDate)}
                </dd>
              </div>

              {photo.folderName && (
                <div>
                  <dt className="text-slate-400">Lokasi Album Drive</dt>
                  <dd className="mt-1 text-slate-100">{photo.folderName}</dd>
                </div>
              )}

              {(photo.imageMediaMetadata?.cameraMake || photo.imageMediaMetadata?.cameraModel) && (
                <div>
                  <dt className="text-slate-400">Kamera</dt>
                  <dd className="mt-1 text-slate-100">
                    {[photo.imageMediaMetadata.cameraMake, photo.imageMediaMetadata.cameraModel]
                      .filter(Boolean)
                      .join(' ')}
                  </dd>
                </div>
              )}

              {photo.md5Checksum && (
                <div>
                  <dt className="text-slate-400">Checksum MD5 Drive</dt>
                  <dd className="mt-1 break-all font-mono-tabular text-[11px] text-slate-300">
                    {photo.md5Checksum}
                  </dd>
                </div>
              )}
            </dl>
          </aside>
        )}
      </div>
    </div>
  );
};
