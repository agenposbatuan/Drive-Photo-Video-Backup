import React, { useEffect, useRef, useState } from 'react';
import { Archive, Download, Loader2 } from 'lucide-react';

export interface PhotoDownloadOverlayProps {
  photoId: string;
  photoName: string;
  canDownload?: boolean;
  onDownloadOriginal: () => Promise<void> | void;
  onDownloadCompressed: () => Promise<void> | void;
  variant?: 'thumbnail' | 'header';
  className?: string;
}

// Module-level coordinator to ensure ONLY ONE download menu is open at a time
let activePhotoId: string | null = null;
const activeListeners = new Set<(id: string | null) => void>();

function setGlobalActivePhotoId(id: string | null) {
  activePhotoId = id;
  activeListeners.forEach((listener) => listener(activePhotoId));
}

export const PhotoDownloadOverlay: React.FC<PhotoDownloadOverlayProps> = ({
  photoId,
  photoName,
  canDownload = true,
  onDownloadOriginal,
  onDownloadCompressed,
  variant = 'thumbnail',
  className = '',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [downloadingType, setDownloadingType] = useState<'original' | 'compress' | null>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Sync open state with single active coordinator
  useEffect(() => {
    const onActiveChange = (activeId: string | null) => {
      setIsOpen(activeId === photoId);
    };
    activeListeners.add(onActiveChange);
    return () => {
      activeListeners.delete(onActiveChange);
    };
  }, [photoId]);

  // Close menu when clicking outside
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;
      const clickedTrigger = triggerRef.current && triggerRef.current.contains(target);
      const clickedMenu = menuRef.current && menuRef.current.contains(target);

      if (!clickedTrigger && !clickedMenu) {
        setGlobalActivePhotoId(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside, true);
    document.addEventListener('touchstart', handleClickOutside, true);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside, true);
      document.removeEventListener('touchstart', handleClickOutside, true);
    };
  }, [isOpen]);

  if (!canDownload) {
    return null;
  }

  const handleTriggerClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setGlobalActivePhotoId(isOpen ? null : photoId);
  };

  const handleAction = async (e: React.MouseEvent, type: 'original' | 'compress') => {
    e.stopPropagation();
    e.preventDefault();
    if (downloadingType !== null) return;
    setDownloadingType(type);
    try {
      if (type === 'original') {
        await onDownloadOriginal();
      } else {
        await onDownloadCompressed();
      }
    } catch (err) {
      console.error('Download execution failed:', err);
      const msg = err instanceof Error ? err.message : 'Gagal mengunduh foto.';
      alert(msg);
    } finally {
      setDownloadingType(null);
      setGlobalActivePhotoId(null);
    }
  };

  // ─── HEADER / LIGHTBOX VARIANT ───
  if (variant === 'header') {
    return (
      <div
        ref={triggerRef}
        className={`relative z-20 ${className}`}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={handleTriggerClick}
          title="Opsi Unduh Foto"
          aria-label={`Unduh ${photoName}`}
          aria-expanded={isOpen}
          className="flex h-11 w-11 items-center justify-center rounded-full text-slate-200 hover:bg-white/10 transition-colors focus:outline-none"
        >
          {downloadingType ? (
            <Loader2 className="h-5 w-5 animate-spin text-white" />
          ) : (
            <Download className="h-5 w-5 text-white" />
          )}
        </button>

        {isOpen && (
          <div
            ref={menuRef}
            role="menu"
            aria-label="Pilihan format unduhan"
            className="absolute top-12 right-0 z-50 w-60 rounded-xl border border-white/20 bg-slate-950/95 text-white shadow-2xl p-1.5 backdrop-blur-md animate-in fade-in zoom-in-95 duration-100 flex flex-col gap-1 divide-y divide-white/10"
            onClick={(e) => e.stopPropagation()}
          >
            {/* ROW 1: HD / UKURAN ASLI */}
            <button
              type="button"
              role="menuitem"
              disabled={downloadingType !== null}
              onClick={(e) => handleAction(e, 'original')}
              className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-white/15 transition-colors disabled:opacity-50 group focus:outline-none"
            >
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-blue-500/20 text-blue-400 group-hover:bg-blue-500/30">
                {downloadingType === 'original' ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Download className="h-3.5 w-3.5" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-white leading-tight">HD / UKURAN ASLI</p>
                <p className="text-[10px] text-slate-300 leading-tight mt-0.5">
                  Download foto asli tanpa kompresi.
                </p>
              </div>
            </button>

            {/* ROW 2: COMPRESS */}
            <button
              type="button"
              role="menuitem"
              disabled={downloadingType !== null}
              onClick={(e) => handleAction(e, 'compress')}
              className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 pt-2 text-left hover:bg-white/15 transition-colors disabled:opacity-50 group focus:outline-none"
            >
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-amber-500/20 text-amber-400 group-hover:bg-amber-500/30">
                {downloadingType === 'compress' ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Archive className="h-3.5 w-3.5" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-white leading-tight">COMPRESS</p>
                <p className="text-[10px] text-slate-300 leading-tight mt-0.5">
                  Download foto dengan ukuran lebih kecil.
                </p>
              </div>
            </button>
          </div>
        )}
      </div>
    );
  }

  // ─── THUMBNAIL VARIANT: IN-THUMBNAIL RECTANGULAR CONTAINER ───
  return (
    <>
      {/* Download Icon Trigger inside top-right corner of thumbnail */}
      <div
        ref={triggerRef}
        className={`absolute top-1.5 right-1.5 z-20 ${className}`}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={handleTriggerClick}
          title="Opsi Unduh Foto"
          aria-label={`Unduh ${photoName}`}
          aria-expanded={isOpen}
          className={`flex h-7 w-7 items-center justify-center rounded-full text-white backdrop-blur-md shadow-md transition-all active:scale-95 focus:outline-none ${
            isOpen ? 'bg-blue-600 ring-2 ring-white/80' : 'bg-black/60 hover:bg-black/85'
          }`}
        >
          {downloadingType ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-white" />
          ) : (
            <Download className="h-3.5 w-3.5 text-white" />
          )}
        </button>
      </div>

      {/* In-Thumbnail Menu Container positioned inside lower portion of photo image area */}
      {isOpen && (
        <div
          ref={menuRef}
          role="menu"
          aria-label="Pilihan format unduhan"
          className="absolute inset-x-1 bottom-1 sm:inset-x-1.5 sm:bottom-1.5 z-30 rounded-xl border border-white/20 bg-slate-950/92 dark:bg-black/92 text-white shadow-2xl p-1 backdrop-blur-md animate-in fade-in zoom-in-95 duration-100 flex flex-col gap-0.5 divide-y divide-white/10"
          onClick={(e) => e.stopPropagation()}
        >
          {/* ROW 1: HD / UKURAN ASLI */}
          <button
            type="button"
            role="menuitem"
            disabled={downloadingType !== null}
            onClick={(e) => handleAction(e, 'original')}
            className="flex w-full items-center gap-1.5 rounded-lg px-1.5 py-1 text-left hover:bg-white/15 transition-colors disabled:opacity-50 group focus:outline-none"
          >
            <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-blue-500/20 text-blue-400 group-hover:bg-blue-500/30">
              {downloadingType === 'original' ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Download className="h-3 w-3" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] sm:text-[11px] font-bold text-white leading-tight truncate">
                HD / UKURAN ASLI
              </p>
              <p className="text-[7.5px] sm:text-[8.5px] text-slate-300 leading-tight truncate">
                Download foto asli tanpa kompresi.
              </p>
            </div>
          </button>

          {/* ROW 2: COMPRESS */}
          <button
            type="button"
            role="menuitem"
            disabled={downloadingType !== null}
            onClick={(e) => handleAction(e, 'compress')}
            className="flex w-full items-center gap-1.5 rounded-lg px-1.5 py-1 pt-1.5 text-left hover:bg-white/15 transition-colors disabled:opacity-50 group focus:outline-none"
          >
            <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-amber-500/20 text-amber-400 group-hover:bg-amber-500/30">
              {downloadingType === 'compress' ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Archive className="h-3 w-3" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] sm:text-[11px] font-bold text-white leading-tight truncate">
                COMPRESS
              </p>
              <p className="text-[7.5px] sm:text-[8.5px] text-slate-300 leading-tight truncate">
                Download foto dengan ukuran lebih kecil.
              </p>
            </div>
          </button>
        </div>
      )}
    </>
  );
};
