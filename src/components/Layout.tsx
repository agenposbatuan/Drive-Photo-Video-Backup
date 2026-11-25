import React, { useState } from 'react';
import {
  CloudUpload,
  FolderHeart,
  Home,
  Images,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  Shield,
  UploadCloud,
  User,
  Video,
} from 'lucide-react';
import { AppSection, AuthState } from '../types';
import { UploadQueueSnapshot } from '../services/UploadService';

interface LayoutProps {
  activeSection: AppSection;
  onNavigate: (section: AppSection) => void;
  authState: AuthState;
  uploadSnapshot: UploadQueueSnapshot;
  onOpenUploadQueue: () => void;
  children: React.ReactNode;
}

const SECTION_TITLES: Record<AppSection, string> = {
  beranda: 'Beranda',
  'semua-foto': 'Semua Foto',
  album: 'Album',
  'semua-video': 'Semua Video',
  cadangkan: 'Cadangkan Foto & Video',
  'family-gallery': 'Galeri Keluarga',
  pengaturan: 'Pengaturan',
};

const PRIMARY_NAV: Array<{ id: AppSection; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: 'beranda', label: 'Beranda', icon: Home },
  { id: 'semua-foto', label: 'Semua Foto', icon: Images },
  { id: 'album', label: 'Album', icon: FolderHeart },
  { id: 'semua-video', label: 'Semua Video', icon: Video },
  { id: 'cadangkan', label: 'Cadangkan', icon: CloudUpload },
  { id: 'family-gallery', label: 'Galeri Keluarga', icon: Shield },
];

export const Layout: React.FC<LayoutProps> = ({
  activeSection,
  onNavigate,
  authState,
  uploadSnapshot,
  onOpenUploadQueue,
  children,
}) => {
  const [sidebarExpanded, setSidebarExpanded] = useState(true);

  const hasUploading = uploadSnapshot.activeCount > 0 || uploadSnapshot.waitingCount > 0;
  const hasAttention = uploadSnapshot.failedCount > 0 || uploadSnapshot.needsAttentionCount > 0;
  const hasAnyTasks = uploadSnapshot.tasks.length > 0;

  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-white dark:bg-[#0f1115] text-slate-900 dark:text-slate-100">
      {/* Desktop Expandable Sidebar */}
      <aside
        className={`hidden lg:flex lg:flex-col lg:sticky lg:top-0 lg:h-screen shrink-0 border-r border-slate-200/80 dark:border-slate-800/90 bg-[#f8f9fa] dark:bg-[#13161d] transition-[width] duration-200 ${
          sidebarExpanded ? 'w-64' : 'w-20'
        }`}
      >
        <div className="flex h-16 items-center justify-between px-4 border-b border-slate-200/70 dark:border-slate-800/80">
          {sidebarExpanded && (
            <button
              type="button"
              onClick={() => onNavigate('beranda')}
              className="flex items-center gap-2.5 text-left min-w-0"
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white">
                <UploadCloud className="h-5 w-5" />
              </div>
              <span className="truncate text-sm font-bold tracking-tight text-slate-900 dark:text-slate-100">
                Drive Photo &amp; Video Backup
              </span>
            </button>
          )}
          <button
            type="button"
            onClick={() => setSidebarExpanded((v) => !v)}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-200/70 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100 transition-colors mx-auto lg:mx-0"
            aria-label={sidebarExpanded ? 'Ciutkan sidebar' : 'Perluas sidebar'}
            title={sidebarExpanded ? 'Ciutkan sidebar' : 'Perluas sidebar'}
          >
            {sidebarExpanded ? (
              <PanelLeftClose className="h-5 w-5" />
            ) : (
              <PanelLeftOpen className="h-5 w-5" />
            )}
          </button>
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 px-3 py-4 space-y-1" aria-label="Navigasi utama">
          {[...PRIMARY_NAV, { id: 'pengaturan' as AppSection, label: 'Pengaturan', icon: Settings }].map(
            (item) => {
              const Icon = item.icon;
              const isActive = activeSection === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onNavigate(item.id)}
                  title={!sidebarExpanded ? item.label : undefined}
                  className={`flex w-full min-h-[44px] items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors whitespace-nowrap ${
                    isActive
                      ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200/60 dark:hover:bg-slate-800/70 hover:text-slate-900 dark:hover:text-slate-100'
                  } ${!sidebarExpanded ? 'justify-center px-0' : ''}`}
                >
                  <Icon className="h-5 w-5 shrink-0" />
                  {sidebarExpanded && <span className="truncate">{item.label}</span>}
                </button>
              );
            }
          )}
        </nav>

        {/* Persistent Upload Indicator in Sidebar */}
        <div className="p-3 border-t border-slate-200/70 dark:border-slate-800/80 space-y-2.5">
          <button
            type="button"
            onClick={onOpenUploadQueue}
            className={`flex w-full min-h-[44px] items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors ${
              hasUploading
                ? 'border-blue-200 dark:border-blue-900/70 bg-blue-50/80 dark:bg-blue-950/40 text-blue-800 dark:text-blue-200'
                : hasAttention
                  ? 'border-amber-200 dark:border-amber-900/70 bg-amber-50/80 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300'
                  : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-[#171a21] text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
            } ${!sidebarExpanded ? 'justify-center px-0' : ''}`}
            title="Buka Manajer Antrean Upload"
          >
            <UploadCloud className="h-5 w-5 shrink-0" />
            {sidebarExpanded && (
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold">
                  {hasUploading
                    ? `Mengupload ${uploadSnapshot.overallProgress}%`
                    : hasAttention
                      ? 'Upload Perlu Tindakan'
                      : 'Antrean Upload'}
                </p>
                <p className="truncate text-[11px] opacity-80 tabular-nums">
                  {hasAnyTasks
                    ? `${uploadSnapshot.completedCount}/${uploadSnapshot.tasks.length} selesai`
                    : 'Tidak ada antrean'}
                </p>
              </div>
            )}
          </button>

          {/* Compact Profile Row */}
          <button
            type="button"
            onClick={() => onNavigate('pengaturan')}
            className={`flex w-full min-h-[44px] items-center gap-2.5 rounded-xl px-2 py-1.5 hover:bg-slate-200/60 dark:hover:bg-slate-800/70 transition-colors ${
              !sidebarExpanded ? 'justify-center px-0' : ''
            }`}
            title={authState.user ? authState.user.email : 'Hubungkan akun Google'}
          >
            {authState.user?.photoURL ? (
              <img
                src={authState.user.photoURL}
                alt={authState.user.displayName}
                referrerPolicy="no-referrer"
                className="h-8 w-8 shrink-0 rounded-full object-cover"
              />
            ) : (
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                <User className="h-4 w-4" />
              </div>
            )}
            {sidebarExpanded && (
              <div className="min-w-0 flex-1 text-left">
                <p className="truncate text-xs font-medium text-slate-900 dark:text-slate-100">
                  {authState.user ? authState.user.displayName : 'Belum terhubung'}
                </p>
                <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">
                  {authState.hasValidToken
                    ? authState.user?.email
                    : authState.tokenExpired
                      ? 'Sesi perlu diperbarui'
                      : 'Ketuk untuk masuk'}
                </p>
              </div>
            )}
          </button>
        </div>
      </aside>

      {/* Main Column */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Compact Top App Bar (Mobile <= 56px, Desktop 64px) */}
        <header className="sticky top-0 z-30 flex h-14 lg:h-16 items-center justify-between gap-3 border-b border-slate-200/80 dark:border-slate-800/90 bg-white/90 dark:bg-[#0f1115]/90 backdrop-blur-md px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="flex lg:hidden h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white">
              <UploadCloud className="h-4 w-4" />
            </div>
            <h1 className="truncate text-base lg:text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-100">
              {SECTION_TITLES[activeSection]}
            </h1>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Persistent Unobtrusive Upload Indicator Button */}
            <button
              type="button"
              onClick={onOpenUploadQueue}
              className={`inline-flex min-h-[40px] items-center gap-2 rounded-xl border px-3 text-xs font-medium transition-colors whitespace-nowrap ${
                hasUploading
                  ? 'border-blue-200 dark:border-blue-900/70 bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300'
                  : hasAttention
                    ? 'border-amber-200 dark:border-amber-900/70 bg-amber-50 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300'
                    : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#171a21] text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
              aria-label="Buka manajer antrean upload"
            >
              <UploadCloud className="h-4 w-4 shrink-0" />
              <span className="tabular-nums">
                {hasUploading
                  ? `${uploadSnapshot.overallProgress}%`
                  : hasAttention
                    ? `${uploadSnapshot.failedCount + uploadSnapshot.needsAttentionCount} kendala`
                    : hasAnyTasks
                      ? `${uploadSnapshot.completedCount}/${uploadSnapshot.tasks.length}`
                      : 'Antrean'}
              </span>
            </button>

            {/* Mobile Profile / Settings Trigger */}
            <button
              type="button"
              onClick={() => onNavigate('pengaturan')}
              className={`flex lg:hidden h-10 w-10 items-center justify-center rounded-full border transition-colors ${
                activeSection === 'pengaturan'
                  ? 'border-blue-500 ring-2 ring-blue-500/20'
                  : 'border-slate-200 dark:border-slate-700'
              }`}
              aria-label="Buka Pengaturan dan Akun"
            >
              {authState.user?.photoURL ? (
                <img
                  src={authState.user.photoURL}
                  alt={authState.user.displayName}
                  referrerPolicy="no-referrer"
                  className="h-9 w-9 rounded-full object-cover"
                />
              ) : (
                <Settings className="h-4 w-4 text-slate-600 dark:text-slate-300" />
              )}
            </button>
          </div>
        </header>

        {/* Scrollable Content Area (extra bottom padding on mobile for fixed bottom nav) */}
        <main className="flex-1 w-full max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-5 sm:py-6 pb-24 lg:pb-10">
          {children}
        </main>
      </div>

      {/* Mobile Fixed Bottom Navigation (height 60px) */}
      <nav
        className="lg:hidden fixed bottom-0 left-0 right-0 z-30 border-t border-slate-200/90 dark:border-slate-800 bg-white/95 dark:bg-[#13161d]/95 backdrop-blur-md pb-safe"
        aria-label="Navigasi bawah"
      >
        <div className="grid grid-cols-6 h-[60px]">
          {PRIMARY_NAV.map((item) => {
            const Icon = item.icon;
            const isActive = activeSection === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onNavigate(item.id)}
                className={`flex flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors ${
                  isActive
                    ? 'text-blue-600 dark:text-blue-400'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                <Icon className={`h-5 w-5 ${isActive ? 'stroke-[2.25]' : ''}`} />
                <span className="truncate max-w-[76px]">{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
};
