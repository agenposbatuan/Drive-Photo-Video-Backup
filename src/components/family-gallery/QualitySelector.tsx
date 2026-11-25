import React from 'react';
import { Gauge, Sparkles, Wifi, Image as ImageIcon } from 'lucide-react';
import { PhotoQualityMode } from '../../types';
import { QUALITY_OPTIONS } from '../../services/FamilyGalleryService';

interface QualitySelectorProps {
  value: PhotoQualityMode;
  onChange: (next: PhotoQualityMode) => void;
  variant?: 'cards' | 'compact' | 'dark';
}

const ICONS: Record<PhotoQualityMode, React.ComponentType<{ className?: string }>> = {
  data_saver: Gauge,
  hd: Sparkles,
  auto: Wifi,
  original: ImageIcon,
};

export const QualitySelector: React.FC<QualitySelectorProps> = ({
  value,
  onChange,
  variant = 'compact',
}) => {
  if (variant === 'cards') {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {QUALITY_OPTIONS.map((opt) => {
          const Icon = ICONS[opt.value];
          const active = value === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange(opt.value)}
              className={`flex items-start gap-3 rounded-xl border p-3 text-left transition-colors ${
                active
                  ? 'border-blue-600 ring-2 ring-blue-500/20 bg-blue-50/80 dark:bg-blue-950/40 text-blue-900 dark:text-blue-100'
                  : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50'
              }`}
            >
              <Icon className={`h-5 w-5 shrink-0 mt-0.5 ${active ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400'}`} />
              <div className="min-w-0">
                <p className="text-xs font-bold tracking-wide">{opt.label}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{opt.description}</p>
              </div>
            </button>
          );
        })}
      </div>
    );
  }

  const isDark = variant === 'dark';

  return (
    <div
      className={`inline-flex flex-wrap items-center gap-1 rounded-xl p-1 ${
        isDark
          ? 'bg-white/10 text-white'
          : 'bg-slate-100 dark:bg-slate-800/80 text-slate-700 dark:text-slate-200'
      }`}
      role="group"
      aria-label="Pilih kualitas tampilan foto"
    >
      {QUALITY_OPTIONS.map((opt) => {
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            title={opt.description}
            className={`rounded-lg px-2.5 py-1.5 text-[11px] font-semibold tracking-wide transition-colors ${
              active
                ? isDark
                  ? 'bg-blue-600 text-white'
                  : 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-sm'
                : isDark
                  ? 'text-slate-300 hover:bg-white/10'
                  : 'hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
};
