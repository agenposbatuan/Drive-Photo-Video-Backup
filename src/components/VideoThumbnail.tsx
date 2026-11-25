import React, { useEffect, useState } from 'react';
import { Film, Play } from 'lucide-react';
import { VideoItem } from '../types';
import { VideoService } from '../services/VideoService';
import { formatDurationMillis, formatFileSize } from '../utils/formatters';

export interface VideoThumbnailProps {
  video: VideoItem;
  className?: string;
}

export const VideoThumbnail: React.FC<VideoThumbnailProps> = ({ video, className }) => {
  const directThumbUrl = video.thumbnailLink
    ? video.thumbnailLink.replace(/=s\d+/, '=s480')
    : null;

  const [src, setSrc] = useState<string | null>(directThumbUrl);
  const [loadStage, setLoadStage] = useState<'direct' | 'proxy' | 'fallback'>(
    directThumbUrl ? 'direct' : 'proxy'
  );
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    const nextDirect = video.thumbnailLink
      ? video.thumbnailLink.replace(/=s\d+/, '=s480')
      : null;

    if (nextDirect) {
      setSrc(nextDirect);
      setLoadStage('direct');
      setIsLoaded(false);
    } else {
      // Langsung coba proxy jika metadata thumbnailLink kosong
      setSrc(VideoService.getThumbnailProxyUrl(video.id));
      setLoadStage('proxy');
      setIsLoaded(false);
    }
  }, [video.id, video.thumbnailLink]);

  const handleError = () => {
    if (loadStage === 'direct') {
      // Tahap 2: Coba melalui proxy terotentikasi backend
      const proxyUrl = VideoService.getThumbnailProxyUrl(video.id);
      setSrc(proxyUrl);
      setLoadStage('proxy');
      setIsLoaded(false);
    } else {
      // Tahap 3: Tampilkan visual fallback yang elegan tanpa gambar rusak
      setSrc(null);
      setLoadStage('fallback');
      setIsLoaded(true);
    }
  };

  // Ekstrak ekstensi file untuk badge format
  const fileName = video.name.toLowerCase();
  let extBadge = 'VIDEO';
  if (fileName.endsWith('.mp4')) extBadge = 'MP4';
  else if (fileName.endsWith('.3gp') || fileName.endsWith('.3gpp')) extBadge = '3GP';
  else if (fileName.endsWith('.mov')) extBadge = 'MOV';
  else if (fileName.endsWith('.webm')) extBadge = 'WEBM';
  else if (fileName.endsWith('.mkv')) extBadge = 'MKV';

  return (
    <div
      className={`relative aspect-video w-full overflow-hidden bg-slate-900 select-none ${className || ''}`}
    >
      {/* 1. Tampilkan Gambar Thumbnail jika ada dan belum gagal */}
      {src && loadStage !== 'fallback' ? (
        <img
          src={src}
          alt={video.name}
          loading="lazy"
          onLoad={() => setIsLoaded(true)}
          onError={handleError}
          className={`h-full w-full object-cover transition-all duration-300 group-hover:scale-105 ${
            isLoaded ? 'opacity-100' : 'opacity-0'
          }`}
        />
      ) : null}

      {/* 2. Visual Fallback: Banner Elegan Pengganti Broken Image */}
      {loadStage === 'fallback' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center p-3 text-center bg-gradient-to-br from-slate-800 via-slate-900 to-slate-950">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-600/20 border border-blue-500/30 text-blue-400 mb-1.5 shadow-inner">
            <Film className="h-6 w-6" />
          </div>
          <span className="text-[11px] font-semibold text-slate-300 truncate max-w-[90%]" title={video.name}>
            {video.name}
          </span>
          <span className="text-[9px] font-mono text-slate-400 uppercase tracking-wider mt-0.5">
            Pratinjau Siap Diputar
          </span>
        </div>
      )}

      {/* Loading Shimmer Sebelum Gambar Siap */}
      {!isLoaded && loadStage !== 'fallback' && (
        <div className="absolute inset-0 bg-slate-800/80 animate-pulse flex items-center justify-center">
          <Film className="h-7 w-7 text-slate-600 animate-bounce" />
        </div>
      )}

      {/* Play Button Overlay */}
      <div className="absolute inset-0 flex items-center justify-center bg-black/25 group-hover:bg-black/45 transition-colors">
        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-blue-600/90 text-white shadow-lg group-hover:scale-110 group-hover:bg-blue-500 transition-all">
          <Play className="h-5 w-5 ml-0.5" />
        </div>
      </div>

      {/* Format Badge (Kiri Atas) */}
      <span className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded-md bg-black/70 text-[9px] font-mono font-bold text-blue-300 backdrop-blur-sm border border-white/10 uppercase">
        {extBadge}
      </span>

      {/* Duration Badge (Kanan Bawah) */}
      {video.durationMillis !== undefined && video.durationMillis > 0 && (
        <span className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 rounded-md bg-black/80 text-[10px] font-mono font-semibold text-white backdrop-blur-sm">
          {formatDurationMillis(video.durationMillis)}
        </span>
      )}

      {/* File Size Badge (Kiri Bawah) */}
      {video.sizeBytes > 0 && (
        <span className="absolute bottom-1.5 left-1.5 px-1.5 py-0.5 rounded-md bg-black/70 text-[10px] font-medium text-slate-200 backdrop-blur-sm">
          {formatFileSize(video.sizeBytes)}
        </span>
      )}
    </div>
  );
};
