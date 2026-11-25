import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Download,
  Film,
  Folder,
  Loader2,
  Maximize,
  Minimize,
  Pause,
  Play,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { VideoItem } from '../types';
import { VideoService } from '../services/VideoService';
import { GoogleDriveService } from '../services/GoogleDriveService';
import { formatDurationMillis, formatFileSize, formatIndonesianDateTime } from '../utils/formatters';

export interface VideoPlayerModalProps {
  video: VideoItem;
  onClose: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  hasPrev?: boolean;
  hasNext?: boolean;
}

const PLAYBACK_SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];

export const VideoPlayerModal: React.FC<VideoPlayerModalProps> = ({
  video,
  onClose,
  onPrev,
  onNext,
  hasPrev = false,
  hasNext = false,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isBuffering, setIsBuffering] = useState(true);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [streamError, setStreamError] = useState<string | null>(null);

  const [streamSrc, setStreamSrc] = useState<string>('');
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [unsupportedInfo, setUnsupportedInfo] = useState<{
    formatName: string;
    note?: string;
  } | null>(null);

  // Inisialisasi streaming, validasi kompatibilitas format, dan alokasi resource
  useEffect(() => {
    let active = true;
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(video.durationMillis ? video.durationMillis / 1000 : 0);
    setIsBuffering(true);
    setStreamError(null);

    // 1. Bersihkan Object URL sebelumnya jika ada
    if (blobUrl) {
      URL.revokeObjectURL(blobUrl);
      setBlobUrl(null);
    }

    // 2. Evaluasi kompatibilitas format & codec
    const compat = VideoService.checkFormatCompatibility(video.mimeType, video.name);
    if (!compat.canPlay) {
      setIsBuffering(false);
      setUnsupportedInfo({ formatName: compat.formatName, note: compat.note });
      return;
    }
    setUnsupportedInfo(null);

    // 3. Minta Ticket Streaming terotentikasi (mencegah token terlihat di URL / log)
    VideoService.createStreamTicket(video.id)
      .then((ticketRes) => {
        if (!active) return;
        if (ticketRes?.streamUrl) {
          setStreamSrc(ticketRes.streamUrl);
        } else {
          // Fallback ke stream endpoint terenkripsi
          setStreamSrc(VideoService.getStreamUrl(video.id, video.name));
        }
      })
      .catch(() => {
        if (active) {
          setStreamSrc(VideoService.getStreamUrl(video.id, video.name));
        }
      });

    return () => {
      active = false;
      if (videoRef.current) {
        videoRef.current.pause();
        videoRef.current.removeAttribute('src');
        videoRef.current.load();
      }
    };
  }, [video.id, video.name, video.mimeType, video.durationMillis]);

  // Bersihkan Blob URL saat unmount
  useEffect(() => {
    return () => {
      if (blobUrl) {
        URL.revokeObjectURL(blobUrl);
      }
    };
  }, [blobUrl]);

  // Keyboard navigation & playback controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      switch (e.key) {
        case 'Escape':
          onClose();
          break;
        case ' ':
          e.preventDefault();
          togglePlay();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          if (e.ctrlKey || e.metaKey) {
            onPrev?.();
          } else {
            seekRelative(-5);
          }
          break;
        case 'ArrowRight':
          e.preventDefault();
          if (e.ctrlKey || e.metaKey) {
            onNext?.();
          } else {
            seekRelative(5);
          }
          break;
        case 'f':
        case 'F':
          e.preventDefault();
          toggleFullscreen();
          break;
        case 'm':
        case 'M':
          e.preventDefault();
          toggleMute();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPlaying, hasPrev, hasNext, onPrev, onNext, onClose]);

  const togglePlay = () => {
    const el = videoRef.current;
    if (!el) return;
    if (el.paused) {
      el.play().catch(() => {});
    } else {
      el.pause();
    }
  };

  const seekRelative = (deltaSeconds: number) => {
    const el = videoRef.current;
    if (!el) return;
    el.currentTime = Math.max(0, Math.min(el.duration || duration, el.currentTime + deltaSeconds));
  };

  const handleSeekChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const el = videoRef.current;
    if (!el) return;
    const targetTime = Number.parseFloat(e.target.value);
    el.currentTime = targetTime;
    setCurrentTime(targetTime);
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Number.parseFloat(e.target.value);
    setVolume(val);
    if (videoRef.current) {
      videoRef.current.volume = val;
      videoRef.current.muted = val === 0;
      setIsMuted(val === 0);
    }
  };

  const toggleMute = () => {
    if (!videoRef.current) return;
    const nextMuted = !isMuted;
    videoRef.current.muted = nextMuted;
    setIsMuted(nextMuted);
  };

  const handleSpeedSelect = (speed: number) => {
    setPlaybackSpeed(speed);
    if (videoRef.current) {
      videoRef.current.playbackRate = speed;
    }
    setShowSpeedMenu(false);
  };

  const toggleFullscreen = async () => {
    if (!containerRef.current) return;
    try {
      if (!document.fullscreenElement) {
        await containerRef.current.requestFullscreen();
        setIsFullscreen(true);
      } else {
        await document.exitFullscreen();
        setIsFullscreen(false);
      }
    } catch {
      // Fallback jika fullscreen diblokir oleh browser
    }
  };

  const handleDownload = async () => {
    if (isDownloading) return;
    setIsDownloading(true);
    try {
      await VideoService.downloadVideo(video);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Gagal mengunduh video.');
    } finally {
      setIsDownloading(false);
    }
  };

  const handleVideoError = async (e: React.SyntheticEvent<HTMLVideoElement, Event>) => {
    const videoEl = e.currentTarget;
    const mediaError = videoEl.error;
    setIsBuffering(false);

    if (mediaError?.code === 4) {
      // MEDIA_ERR_SRC_NOT_SUPPORTED
      const fileName = video.name.toLowerCase();
      const is3gp = fileName.endsWith('.3gp') || fileName.endsWith('.3gpp');
      setStreamError(
        is3gp
          ? 'Format video 3GP atau codec audionya (AMR/MPEG-4) tidak didukung oleh browser Anda. Anda dapat mengunduh video asli untuk diputar secara lancar di aplikasi pemutar bawaan perangkat.'
          : 'Format atau codec file video ini tidak didukung oleh browser Anda. Silakan unduh video asli untuk memutarnya.'
      );
      return;
    }

    // Direct blob fallback untuk video berukuran kecil (<= 30 MB)
    if (!blobUrl && video.sizeBytes > 0 && video.sizeBytes <= 30 * 1024 * 1024) {
      try {
        setIsBuffering(true);
        const blob = await GoogleDriveService.fetchMediaBlob(video.id);
        const newBlobUrl = URL.createObjectURL(blob);
        setBlobUrl(newBlobUrl);
        setStreamSrc(newBlobUrl);
        setIsBuffering(false);
        setStreamError(null);
        return;
      } catch {
        // Blob fallback gagal
      }
    }

    setStreamError('Gagal memuat streaming video dari Google Drive. Pastikan koneksi stabil atau unduh video asli.');
  };

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-50 flex flex-col bg-black text-white select-none"
      role="dialog"
      aria-modal="true"
      aria-label={`Pemutar video: ${video.name}`}
    >
      {/* Top Bar / Header */}
      <header className="flex h-14 shrink-0 items-center justify-between gap-3 px-3 sm:px-5 bg-gradient-to-b from-black/90 via-black/60 to-transparent z-20">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-slate-300 hover:text-white hover:bg-white/10 transition-colors"
            title="Tutup (Esc)"
          >
            <X className="h-5 w-5" />
          </button>
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold text-white" title={video.name}>
              {video.name}
            </h2>
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <span className="flex items-center gap-1">
                <Folder className="h-3 w-3 text-blue-400" />
                {video.folderName || 'Folder Utama'}
              </span>
              <span>•</span>
              <span>{formatFileSize(video.sizeBytes)}</span>
              {video.displayDate && (
                <>
                  <span>•</span>
                  <span>{formatIndonesianDateTime(video.displayDate)}</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => void handleDownload()}
            disabled={isDownloading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-semibold text-white transition-colors disabled:opacity-50"
            title="Download Video Asli"
          >
            {isDownloading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Download className="h-3.5 w-3.5" />
            )}
            <span className="hidden sm:inline">Unduh Asli</span>
          </button>
        </div>
      </header>

      {/* Main Video Viewport */}
      <div className="relative flex-1 flex items-center justify-center overflow-hidden bg-black group">
        {/* HTML5 Video Element */}
        {!unsupportedInfo && streamSrc && (
          <video
            ref={videoRef}
            src={streamSrc}
            playsInline
            preload="metadata"
            className="max-h-full max-w-full w-auto h-auto object-contain cursor-pointer"
            onClick={togglePlay}
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            onTimeUpdate={() => {
              if (videoRef.current) {
                setCurrentTime(videoRef.current.currentTime);
              }
            }}
            onLoadedMetadata={() => {
              if (videoRef.current) {
                setDuration(videoRef.current.duration || 0);
                setIsBuffering(false);
              }
            }}
            onCanPlay={() => setIsBuffering(false)}
            onWaiting={() => setIsBuffering(true)}
            onPlaying={() => setIsBuffering(false)}
            onError={handleVideoError}
          />
        )}

        {/* Buffering Indicator */}
        {isBuffering && !unsupportedInfo && !streamError && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none bg-black/20">
            <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-black/70 backdrop-blur-md">
              <Loader2 className="h-5 w-5 animate-spin text-blue-400" />
              <span className="text-xs text-white">Menghubungkan stream video...</span>
            </div>
          </div>
        )}

        {/* Unsupported Format / Codec Notification */}
        {unsupportedInfo && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/85 p-4 z-10">
            <div className="max-w-md rounded-2xl bg-amber-950/80 border border-amber-800 p-6 text-center space-y-4 shadow-2xl">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/20 text-amber-400 mx-auto">
                <AlertTriangle className="h-6 w-6" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-semibold text-amber-200">
                  Format Video Tidak Didukung Browser
                </h3>
                <p className="text-xs text-amber-300/90 leading-relaxed">
                  File ini ({unsupportedInfo.formatName}) menggunakan format atau codec audio/video lawas yang tidak didukung langsung oleh browser modern.
                </p>
                {unsupportedInfo.note && (
                  <p className="text-[11px] text-slate-400 mt-2">
                    {unsupportedInfo.note}
                  </p>
                )}
              </div>
              <div className="flex justify-center gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => void handleDownload()}
                  disabled={isDownloading}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-sm transition-colors"
                >
                  <Download className="h-4 w-4" />
                  Unduh Video Asli
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-semibold transition-colors"
                >
                  Tutup
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Stream Playback Error Notification */}
        {streamError && !unsupportedInfo && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/85 p-4 z-10">
            <div className="max-w-md rounded-2xl bg-red-950/80 border border-red-800 p-6 text-center space-y-4 shadow-2xl">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-500/20 text-red-400 mx-auto">
                <AlertCircle className="h-6 w-6" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-semibold text-red-200">
                  Gagal Memutar Video
                </h3>
                <p className="text-xs text-red-300/90 leading-relaxed">
                  {streamError}
                </p>
              </div>
              <div className="flex justify-center gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setStreamError(null);
                    setIsBuffering(true);
                    if (videoRef.current) {
                      videoRef.current.load();
                      videoRef.current.play().catch(() => {});
                    }
                  }}
                  className="px-4 py-2 rounded-xl bg-red-800 hover:bg-red-700 text-white text-xs font-semibold transition-colors"
                >
                  Coba Lagi
                </button>
                <button
                  type="button"
                  onClick={() => void handleDownload()}
                  disabled={isDownloading}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-semibold transition-colors"
                >
                  <Download className="h-4 w-4" />
                  Unduh Video Asli
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Navigation Arrows for Previous / Next Video */}
        {hasPrev && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onPrev?.();
            }}
            className="absolute left-3 top-1/2 -translate-y-1/2 p-2.5 rounded-full bg-black/60 hover:bg-black/90 text-white/80 hover:text-white transition-all opacity-0 group-hover:opacity-100"
            title="Video Sebelumnya (Ctrl + Panah Kiri)"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
        )}
        {hasNext && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onNext?.();
            }}
            className="absolute right-3 top-1/2 -translate-y-1/2 p-2.5 rounded-full bg-black/60 hover:bg-black/90 text-white/80 hover:text-white transition-all opacity-0 group-hover:opacity-100"
            title="Video Berikutnya (Ctrl + Panah Kanan)"
          >
            <ChevronRight className="h-6 w-6" />
          </button>
        )}
      </div>

      {/* Bottom Control Bar */}
      <footer className="h-16 shrink-0 flex flex-col justify-end px-4 pb-3 bg-gradient-to-t from-black/95 via-black/75 to-transparent z-20 space-y-2">
        {/* Timeline / Scrub Bar */}
        <div className="flex items-center gap-2.5">
          <span className="text-[11px] font-mono tabular-nums text-slate-300 w-11 text-right">
            {formatDurationMillis(currentTime * 1000)}
          </span>
          <input
            type="range"
            min={0}
            max={duration || 100}
            step={0.1}
            value={currentTime}
            onChange={handleSeekChange}
            className="flex-1 h-1.5 rounded-lg appearance-none bg-white/20 cursor-pointer accent-blue-500 hover:h-2 transition-all"
            title="Geser posisi pemutaran"
          />
          <span className="text-[11px] font-mono tabular-nums text-slate-300 w-11">
            {formatDurationMillis(duration * 1000)}
          </span>
        </div>

        {/* Playback Button Row */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {/* Play / Pause Toggle */}
            <button
              type="button"
              onClick={togglePlay}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-600 hover:bg-blue-500 text-white transition-colors"
              title={isPlaying ? 'Jeda (Spasi)' : 'Putar (Spasi)'}
            >
              {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 ml-0.5" />}
            </button>

            {/* Volume Control */}
            <div className="flex items-center gap-1.5 group/vol">
              <button
                type="button"
                onClick={toggleMute}
                className="p-1.5 rounded-lg hover:bg-white/10 text-slate-300 hover:text-white"
                title={isMuted ? 'Bunyikan (M)' : 'Bisukan (M)'}
              >
                {isMuted || volume === 0 ? (
                  <VolumeX className="h-4 w-4 text-red-400" />
                ) : (
                  <Volume2 className="h-4 w-4" />
                )}
              </button>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={isMuted ? 0 : volume}
                onChange={handleVolumeChange}
                className="w-16 h-1 rounded-lg appearance-none bg-white/20 accent-blue-500 cursor-pointer"
                title="Atur volume"
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Speed Selector */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowSpeedMenu(!showSpeedMenu)}
                className="px-2 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-semibold text-slate-200"
                title="Kecepatan Pemutaran"
              >
                {playbackSpeed}x
              </button>
              {showSpeedMenu && (
                <div className="absolute bottom-9 right-0 w-24 rounded-xl border border-white/20 bg-slate-900/95 p-1 shadow-2xl flex flex-col gap-0.5 text-xs">
                  {PLAYBACK_SPEEDS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => handleSpeedSelect(s)}
                      className={`px-2 py-1 rounded-lg text-left transition-colors ${
                        playbackSpeed === s
                          ? 'bg-blue-600 text-white font-bold'
                          : 'hover:bg-white/10 text-slate-300'
                      }`}
                    >
                      {s}x
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Fullscreen Toggle */}
            <button
              type="button"
              onClick={toggleFullscreen}
              className="p-1.5 rounded-lg hover:bg-white/10 text-slate-300 hover:text-white"
              title={isFullscreen ? 'Keluar Layar Penuh (F)' : 'Layar Penuh (F)'}
            >
              {isFullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
};
