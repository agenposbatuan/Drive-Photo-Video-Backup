import React, { useEffect, useState } from 'react';
import { ImageOff } from 'lucide-react';
import { ThumbnailService } from '../services/ThumbnailService';
import { SettingsService } from '../services/SettingsService';
import { PhotoQualityMode } from '../types';

interface DriveThumbnailProps {
  fileId?: string;
  thumbnailLink?: string;
  alt: string;
  className?: string;
  size?: number;
  quality?: PhotoQualityMode;
}

export const DriveThumbnail: React.FC<DriveThumbnailProps> = ({
  fileId,
  thumbnailLink,
  alt,
  className = 'h-full w-full object-cover',
  size,
  quality,
}) => {
  const [activeQuality, setActiveQuality] = useState<PhotoQualityMode>(
    () => quality ?? SettingsService.getSettings().galleryQuality ?? 'auto'
  );

  useEffect(() => {
    if (quality) {
      setActiveQuality(quality);
      return;
    }
    const unsub = SettingsService.subscribe((settings) => {
      setActiveQuality(settings.galleryQuality ?? 'auto');
    });
    return unsub;
  }, [quality]);

  const effectiveSize = size ?? ThumbnailService.resolveThumbnailSize(activeQuality);
  const initialUrl = ThumbnailService.getGridThumbnailUrl(thumbnailLink, effectiveSize);

  const [src, setSrc] = useState<string | null>(initialUrl);
  const [loaded, setLoaded] = useState(false);
  const [triedAuthFallback, setTriedAuthFallback] = useState(false);
  const [failed, setFailed] = useState(!initialUrl && !fileId);

  useEffect(() => {
    const nextUrl = ThumbnailService.getGridThumbnailUrl(thumbnailLink, effectiveSize);
    setSrc(nextUrl);
    setLoaded(false);
    setTriedAuthFallback(false);
    setFailed(!nextUrl && !fileId);

    // Jika thumbnailLink kosong tetapi fileId tersedia, muat lewat autentikasi Drive
    if (!nextUrl && fileId) {
      let active = true;
      setTriedAuthFallback(true);
      ThumbnailService.loadAuthenticatedThumbnail(fileId)
        .then((blobUrl) => {
          if (active) {
            setSrc(blobUrl);
            setFailed(false);
          }
        })
        .catch(() => {
          if (active) setFailed(true);
        });
      return () => {
        active = false;
      };
    }
  }, [fileId, thumbnailLink, effectiveSize]);

  const handleError = () => {
    if (!triedAuthFallback && fileId) {
      setTriedAuthFallback(true);
      ThumbnailService.loadAuthenticatedThumbnail(fileId)
        .then((blobUrl) => {
          setSrc(blobUrl);
          setFailed(false);
        })
        .catch(() => {
          setFailed(true);
        });
      return;
    }
    setFailed(true);
  };

  if (failed || !src) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center bg-slate-100 dark:bg-slate-800/80 text-slate-400 dark:text-slate-500 p-2">
        <ImageOff className="h-5 w-5" />
      </div>
    );
  }

  return (
    <div className="relative h-full w-full overflow-hidden bg-slate-100 dark:bg-slate-800/70">
      {!loaded && (
        <div className="absolute inset-0 animate-pulse bg-slate-200/80 dark:bg-slate-800" />
      )}
      <img
        src={src}
        alt={alt}
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        onLoad={() => setLoaded(true)}
        onError={handleError}
        className={`${className} transition-opacity duration-200 ${loaded ? 'opacity-100' : 'opacity-0'}`}
      />
    </div>
  );
};
