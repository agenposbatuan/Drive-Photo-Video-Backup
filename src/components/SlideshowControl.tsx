import React, { useEffect, useRef, useState } from 'react';
import { Clock, Pause, Play, Square } from 'lucide-react';

export const SLIDESHOW_INTERVALS = [
  { label: '2 detik', value: 2 },
  { label: '3 detik', value: 3 },
  { label: '5 detik', value: 5 },
  { label: '10 detik', value: 10 },
  { label: '15 detik', value: 15 },
  { label: '30 detik', value: 30 },
] as const;

export interface SlideshowControlProps {
  isPlaying: boolean;
  activeIntervalSec: number | null;
  onStart: (intervalSeconds: number) => void;
  onStop: () => void;
  className?: string;
}

export const SlideshowControl: React.FC<SlideshowControlProps> = ({
  isPlaying,
  activeIntervalSec,
  onStart,
  onStop,
  className = '',
}) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close interval menu on click outside
  useEffect(() => {
    if (!menuOpen) return;
    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside, true);
    document.addEventListener('touchstart', handleClickOutside, true);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside, true);
      document.removeEventListener('touchstart', handleClickOutside, true);
    };
  }, [menuOpen]);

  const handleToggle = () => {
    if (isPlaying) {
      onStop();
      setMenuOpen(false);
    } else {
      setMenuOpen((prev) => !prev);
    }
  };

  const handleSelectInterval = (seconds: number) => {
    setMenuOpen(false);
    onStart(seconds);
  };

  return (
    <div ref={containerRef} className={`relative inline-flex items-center ${className}`}>
      {/* Tombol Utama Slideshow / Hentikan */}
      {isPlaying ? (
        <button
          type="button"
          onClick={handleToggle}
          title="Hentikan Slideshow Otomatis"
          aria-label="Hentikan slideshow"
          className="flex min-h-[36px] items-center gap-1.5 rounded-full bg-amber-500/25 hover:bg-amber-500/35 text-amber-300 border border-amber-400/50 px-3.5 py-1 text-xs font-semibold shadow-md transition-all active:scale-95 focus:outline-none"
        >
          <Square className="h-3.5 w-3.5 fill-current" />
          <span className="hidden sm:inline">HENTIKAN</span>
          <span className="text-[10px] text-amber-200/90 font-mono">({activeIntervalSec}s)</span>
        </button>
      ) : (
        <button
          type="button"
          onClick={handleToggle}
          title="Mulai Slideshow Otomatis (Pilih Interval)"
          aria-label="Buka menu interval slideshow"
          aria-expanded={menuOpen}
          className={`flex min-h-[36px] items-center gap-1.5 rounded-full px-3.5 py-1 text-xs font-semibold shadow-sm transition-all active:scale-95 focus:outline-none ${
            menuOpen
              ? 'bg-blue-600 text-white ring-2 ring-white/50'
              : 'bg-white/10 hover:bg-white/20 text-slate-200'
          }`}
        >
          <Play className="h-3.5 w-3.5 fill-current" />
          <span>SLIDESHOW</span>
        </button>
      )}

      {/* Menu Pilihan Interval (Hanya muncul saat tombol Slideshow diklik) */}
      {menuOpen && !isPlaying && (
        <div
          role="menu"
          aria-label="Pilih interval transisi foto"
          className="absolute top-11 right-0 z-50 w-44 rounded-xl border border-white/20 bg-slate-950/95 text-white shadow-2xl p-1.5 backdrop-blur-md animate-in fade-in zoom-in-95 duration-100 divide-y divide-white/10"
        >
          <div className="px-2 py-1 text-[10px] font-semibold tracking-wider text-slate-400 uppercase flex items-center gap-1.5">
            <Clock className="h-3 w-3" />
            <span>Interval Transisi</span>
          </div>
          <div className="pt-1 flex flex-col gap-0.5">
            {SLIDESHOW_INTERVALS.map((item) => (
              <button
                key={item.value}
                type="button"
                role="menuitem"
                onClick={() => handleSelectInterval(item.value)}
                className="flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-xs font-medium text-slate-200 hover:bg-white/15 hover:text-white transition-colors focus:outline-none"
              >
                <span>{item.label}</span>
                <Play className="h-2.5 w-2.5 text-blue-400 opacity-60" />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
