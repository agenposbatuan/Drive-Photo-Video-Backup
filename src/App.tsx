import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, Sparkles, X } from 'lucide-react';
import {
  AppSection,
  AppSettings,
  AuthState,
  DriveStats,
  DriveStorageQuota,
  PhotoItem,
  RecentAlbumRef,
  RootFolderConfig,
} from './types';
import { AuthenticationService } from './services/AuthenticationService';
import { FolderService } from './services/FolderService';
import { GoogleDriveService } from './services/GoogleDriveService';
import { PhotoService } from './services/PhotoService';
import { SettingsService } from './services/SettingsService';
import { ThumbnailService } from './services/ThumbnailService';
import { UploadRecoveryService } from './services/UploadRecoveryService';
import { UploadQueueSnapshot, UploadService } from './services/UploadService';
import { usePwa } from './hooks/usePwa';
import { AlbumView } from './components/AlbumView';
import { BerandaView } from './components/BerandaView';
import { CadangkanView } from './components/CadangkanView';
import { DuplicateResolutionModal } from './components/DuplicateResolutionModal';
import { FolderPickerModal } from './components/FolderPickerModal';
import { FamilyGalleryDashboard } from './components/family-gallery/FamilyGalleryDashboard';
import { FamilyViewerPage } from './components/family-gallery/FamilyViewerPage';
import { Layout } from './components/Layout';
import { PengaturanView } from './components/PengaturanView';
import { PhotoPreviewModal } from './components/PhotoPreviewModal';
import { SemuaFotoView } from './components/SemuaFotoView';
import { SemuaVideoView } from './components/SemuaVideoView';
import { UploadQueueDrawer } from './components/UploadQueueDrawer';

export default function App() {
  // Detect ?share=<token> in URL for Family Viewer
  const shareToken = typeof window !== 'undefined'
    ? new URLSearchParams(window.location.search).get('share')
    : null;

  const initialSection = useMemo<AppSection>(() => {
    if (typeof window === 'undefined') return 'beranda';
    const v = new URLSearchParams(window.location.search).get('view');
    if (v === 'gallery' || v === 'semua-foto') return 'semua-foto';
    if (v === 'backup' || v === 'cadangkan') return 'cadangkan';
    if (v === 'videos' || v === 'semua-video') return 'semua-video';
    if (v === 'album') return 'album';
    if (v === 'family') return 'family-gallery';
    if (v === 'settings' || v === 'pengaturan') return 'pengaturan';
    return 'beranda';
  }, []);

  const [activeSection, setActiveSection] = useState<AppSection>(initialSection);
  const { isUpdateAvailable, updateApp } = usePwa();
  const [authState, setAuthState] = useState<AuthState>(() => AuthenticationService.getState());
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [settings, setSettings] = useState<AppSettings>(() => SettingsService.getSettings());
  const [uploadSnapshot, setUploadSnapshot] = useState<UploadQueueSnapshot>(() =>
    UploadService.getSnapshot()
  );

  // Real Google Drive stats
  const [driveStats, setDriveStats] = useState<DriveStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Google Drive storage quota state
  const [storageQuota, setStorageQuota] = useState<DriveStorageQuota | null>(null);
  const [storageQuotaLoading, setStorageQuotaLoading] = useState(false);
  const [storageQuotaError, setStorageQuotaError] = useState<string | null>(null);

  // Overlays & navigation helpers
  const [folderPickerOpen, setFolderPickerOpen] = useState(false);
  const [uploadDrawerOpen, setUploadDrawerOpen] = useState(false);
  const [previewState, setPreviewState] = useState<{
    photos: PhotoItem[];
    index: number | null;
  }>({ photos: [], index: null });
  const [targetAlbumToOpen, setTargetAlbumToOpen] = useState<RecentAlbumRef | null>(null);
  const [preselectedUploadDest, setPreselectedUploadDest] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [recoveryNotice, setRecoveryNotice] = useState<{
    type: 'info' | 'warning';
    text: string;
  } | null>(null);

  // 1. Inisialisasi Auth, Settings, UploadService & Startup Queue Recovery
  useEffect(() => {
    const unsubAuth = AuthenticationService.subscribe(setAuthState);
    const unsubFirebase = AuthenticationService.init();
    const unsubSettings = SettingsService.subscribe(setSettings);
    const unsubUpload = UploadService.subscribe(setUploadSnapshot);
    const unsubComplete = UploadService.onUploadCompleted(() => {
      setRefreshTrigger((n) => n + 1);
    });

    void UploadRecoveryService.inspectPersistedQueueOnStartup().then((report) => {
      if (report.needsFileCount > 0) {
        setRecoveryNotice({
          type: 'warning',
          text: `${report.needsFileCount} tugas upload sebelumnya membutuhkan pemilihan ulang file sumber karena browser tidak lagi menyimpan salinan lokalnya.`,
        });
      } else if (report.waitingAuthCount > 0) {
        setRecoveryNotice({
          type: 'info',
          text: `${report.waitingAuthCount} tugas upload belum selesai dipulihkan dari antrean lokal. Hubungkan kembali akun Google untuk melanjutkan.`,
        });
      } else if (report.recoveredReadyCount > 0) {
        setRecoveryNotice({
          type: 'info',
          text: `${report.recoveredReadyCount} tugas upload belum selesai siap dilanjutkan dari antrean lokal.`,
        });
      }
    });

    return () => {
      unsubAuth();
      unsubFirebase();
      unsubSettings();
      unsubUpload();
      unsubComplete();
    };
  }, []);

  // 2. Pulihkan antrean upload otomatis setelah token autentikasi Google tersedia
  useEffect(() => {
    if (!authState.hasValidToken) return;
    void UploadRecoveryService.resumeRecoveredTasksAfterAuth().then((report) => {
      if (report.folderAccessErrors.length > 0) {
        setRecoveryNotice({
          type: 'warning',
          text: report.folderAccessErrors[0],
        });
      } else if (report.recoveredReadyCount > 0 || report.completedOnResumeCount > 0) {
        const parts: string[] = [];
        if (report.recoveredReadyCount > 0) {
          parts.push(`${report.recoveredReadyCount} upload dilanjutkan`);
        }
        if (report.completedOnResumeCount > 0) {
          parts.push(`${report.completedOnResumeCount} upload terverifikasi selesai`);
        }
        setRecoveryNotice({
          type: 'info',
          text: `Pemulihan antrean selesai: ${parts.join(', ')}.`,
        });
        setRefreshTrigger((n) => n + 1);
      }
    });
  }, [authState.hasValidToken]);

  // 3. Sinkronisasi statistik Google Drive aktual
  const loadDriveStats = useCallback(
    async (forceRefresh = false) => {
      if (!authState.hasValidToken || !settings.rootFolder) {
        setDriveStats(null);
        setStatsError(null);
        return;
      }

      setStatsLoading(true);
      setStatsError(null);
      try {
        const verified = await FolderService.verifyFolderAccess(settings.rootFolder.id);
        if (verified.name !== settings.rootFolder.name) {
          SettingsService.setRootFolder(verified);
        }
        const stats = await PhotoService.fetchDriveStats(
          verified.id,
          verified.name,
          forceRefresh
        );
        setDriveStats(stats);
      } catch (err) {
        setStatsError(
          err instanceof Error
            ? err.message
            : 'Gagal memuat statistik folder dari Google Drive.'
        );
      } finally {
        setStatsLoading(false);
      }
    },
    [authState.hasValidToken, settings.rootFolder]
  );

  useEffect(() => {
    if (authState.hasValidToken && settings.rootFolder) {
      void loadDriveStats(refreshTrigger > 0);
    } else {
      setDriveStats(null);
    }
  }, [authState.hasValidToken, settings.rootFolder?.id, refreshTrigger, loadDriveStats]);

  // 4. Sinkronisasi kuota kapasitas Google Drive aktual
  const loadStorageQuota = useCallback(
    async (forceRefresh = false) => {
      if (!authState.hasValidToken) {
        setStorageQuota(null);
        setStorageQuotaError(null);
        return;
      }

      setStorageQuotaLoading(true);
      setStorageQuotaError(null);
      try {
        const quota = await GoogleDriveService.getAccountStorageQuota(forceRefresh);
        setStorageQuota(quota);
      } catch (err) {
        setStorageQuotaError(
          err instanceof Error
            ? err.message
            : 'Gagal memuat kapasitas penyimpanan Google Drive.'
        );
      } finally {
        setStorageQuotaLoading(false);
      }
    },
    [authState.hasValidToken]
  );

  useEffect(() => {
    if (authState.hasValidToken) {
      void loadStorageQuota(refreshTrigger > 0);
    } else {
      setStorageQuota(null);
    }
  }, [authState.hasValidToken, refreshTrigger, loadStorageQuota]);

  // Perbarui kapasitas penyimpanan otomatis setelah batch upload selesai
  useEffect(() => {
    const unsub = UploadService.onUploadCompleted(() => {
      void loadStorageQuota(true);
    });
    return unsub;
  }, [loadStorageQuota]);

  // Handlers
  const handleSignIn = async () => {
    setIsSigningIn(true);
    try {
      await AuthenticationService.signInWithGoogle();
    } catch {
      // Pesan kesalahan sudah diterbitkan ke authState.error
    } finally {
      setIsSigningIn(false);
    }
  };

  const handleSignOut = async () => {
    UploadService.pauseAll();
    FolderService.invalidateCache();
    GoogleDriveService.invalidateQuotaCache();
    ThumbnailService.clearAll();
    setDriveStats(null);
    setStorageQuota(null);
    await AuthenticationService.logout();
  };

  const handleSelectRootFolder = (config: RootFolderConfig) => {
    FolderService.invalidateCache();
    SettingsService.setRootFolder(config);
    setRefreshTrigger((n) => n + 1);
  };

  const handleOpenAlbumFromHome = (album: RecentAlbumRef) => {
    setTargetAlbumToOpen(album);
    setActiveSection('album');
  };

  const handleGoToBackupWithFolder = (folderId: string, folderName: string) => {
    setPreselectedUploadDest({ id: folderId, name: folderName });
    setActiveSection('cadangkan');
  };

  // Cari tugas duplikat yang membutuhkan keputusan pengguna
  const pendingDuplicateTasks = useMemo(
    () => uploadSnapshot.tasks.filter((t) => t.status === 'duplicate_pending'),
    [uploadSnapshot.tasks]
  );
  const currentDuplicateTask = pendingDuplicateTasks[0] ?? null;

  // If the URL has ?share=<token>, render the Family Viewer instead of the owner app
  if (shareToken) {
    return <FamilyViewerPage shareToken={shareToken} />;
  }

  return (
    <Layout
      activeSection={activeSection}
      onNavigate={setActiveSection}
      authState={authState}
      uploadSnapshot={uploadSnapshot}
      onOpenUploadQueue={() => setUploadDrawerOpen(true)}
    >
      {/* Recovery Notification Strip */}
      {recoveryNotice && (
        <div
          className={`mb-5 flex items-start justify-between gap-3 rounded-2xl border px-4 py-3 text-xs sm:text-sm ${
            recoveryNotice.type === 'warning'
              ? 'border-amber-200 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-200'
              : 'border-blue-200 dark:border-blue-900/60 bg-blue-50 dark:bg-blue-950/40 text-blue-800 dark:text-blue-200'
          }`}
        >
          <div className="flex items-start gap-2.5">
            {recoveryNotice.type === 'warning' ? (
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            ) : (
              <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
            )}
            <div>
              <span>{recoveryNotice.text}</span>{' '}
              <button
                type="button"
                onClick={() => setUploadDrawerOpen(true)}
                className="font-semibold underline ml-1"
              >
                Lihat Antrean
              </button>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setRecoveryNotice(null)}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full hover:bg-black/5 dark:hover:bg-white/10"
            aria-label="Tutup pemberitahuan pemulihan"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Active Section View */}
      {activeSection === 'beranda' && (
        <BerandaView
          authState={authState}
          isSigningIn={isSigningIn}
          settings={settings}
          stats={driveStats}
          statsLoading={statsLoading}
          statsError={statsError}
          storageQuota={storageQuota}
          storageQuotaLoading={storageQuotaLoading}
          storageQuotaError={storageQuotaError}
          uploadSnapshot={uploadSnapshot}
          onSignIn={() => void handleSignIn()}
          onOpenFolderPicker={() => setFolderPickerOpen(true)}
          onRefreshStats={() => void loadDriveStats(true)}
          onRefreshStorageQuota={() => void loadStorageQuota(true)}
          onNavigate={setActiveSection}
          onOpenAlbum={handleOpenAlbumFromHome}
          onOpenUploadQueue={() => setUploadDrawerOpen(true)}
        />
      )}

      {activeSection === 'semua-foto' && (
        <SemuaFotoView
          authState={authState}
          isSigningIn={isSigningIn}
          rootFolder={settings.rootFolder}
          refreshTrigger={refreshTrigger}
          onSignIn={() => void handleSignIn()}
          onOpenFolderPicker={() => setFolderPickerOpen(true)}
          onGoToBackup={() => setActiveSection('cadangkan')}
          onSelectPhoto={(photos, index) => setPreviewState({ photos, index })}
        />
      )}

      {activeSection === 'album' && (
        <AlbumView
          authState={authState}
          isSigningIn={isSigningIn}
          rootFolder={settings.rootFolder}
          initialTargetAlbum={targetAlbumToOpen}
          onClearInitialTargetAlbum={() => setTargetAlbumToOpen(null)}
          refreshTrigger={refreshTrigger}
          onSignIn={() => void handleSignIn()}
          onOpenFolderPicker={() => setFolderPickerOpen(true)}
          onSelectPhoto={(photos, index) => setPreviewState({ photos, index })}
          onGoToBackupWithFolder={handleGoToBackupWithFolder}
          onNavigate={setActiveSection}
        />
      )}

      {activeSection === 'semua-video' && (
        <SemuaVideoView
          authState={authState}
          isSigningIn={isSigningIn}
          rootFolder={settings.rootFolder}
          refreshTrigger={refreshTrigger}
          onSignIn={() => void handleSignIn()}
          onOpenFolderPicker={() => setFolderPickerOpen(true)}
          onGoToBackup={() => setActiveSection('cadangkan')}
        />
      )}

      {activeSection === 'cadangkan' && (
        <CadangkanView
          authState={authState}
          isSigningIn={isSigningIn}
          rootFolder={settings.rootFolder}
          preselectedDestination={preselectedUploadDest}
          onSignIn={() => void handleSignIn()}
          onOpenFolderPicker={() => setFolderPickerOpen(true)}
          onOpenUploadQueue={() => setUploadDrawerOpen(true)}
        />
      )}

      {activeSection === 'pengaturan' && (
        <PengaturanView
          authState={authState}
          isSigningIn={isSigningIn}
          settings={settings}
          onSignIn={() => void handleSignIn()}
          onSignOut={() => void handleSignOut()}
          onOpenFolderPicker={() => setFolderPickerOpen(true)}
        />
      )}

      {activeSection === 'family-gallery' && (
        <FamilyGalleryDashboard
          rootFolderId={settings.rootFolder?.id}
          rootFolderName={settings.rootFolder?.name}
          hasValidToken={authState.hasValidToken}
        />
      )}

      {/* Global Overlays */}
      <FolderPickerModal
        open={folderPickerOpen}
        currentRoot={settings.rootFolder}
        onSelect={handleSelectRootFolder}
        onClose={() => setFolderPickerOpen(false)}
      />

      <PhotoPreviewModal
        photos={previewState.photos}
        currentIndex={previewState.index}
        quality={settings.galleryQuality}
        onChangeIndex={(nextIndex) =>
          setPreviewState((prev) => ({ ...prev, index: nextIndex }))
        }
        onClose={() => setPreviewState({ photos: [], index: null })}
      />

      <UploadQueueDrawer
        open={uploadDrawerOpen}
        snapshot={uploadSnapshot}
        onClose={() => setUploadDrawerOpen(false)}
        onRequestAuth={() => void handleSignIn()}
      />

      <DuplicateResolutionModal
        task={currentDuplicateTask}
        remainingPendingCount={pendingDuplicateTasks.length}
        onResolve={(taskId, resolution, applyAll) =>
          void UploadService.resolveDuplicate(taskId, resolution, applyAll)
        }
      />

      {/* PWA App Update Notification Toast */}
      {isUpdateAvailable && (
        <aside
          role="status"
          aria-live="polite"
          className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-6 sm:w-96 z-50 rounded-2xl bg-slate-900/95 dark:bg-slate-800/95 text-white p-4 shadow-2xl border border-slate-700/60 backdrop-blur-md flex items-center justify-between gap-3 animate-fade-in"
        >
          <div className="flex items-center gap-3 min-w-0">
            <Sparkles className="h-5 w-5 text-blue-400 shrink-0" />
            <div className="text-xs">
              <p className="font-semibold text-white">Versi Baru Tersedia</p>
              <p className="text-slate-300">Pembaruan siap digunakan.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={updateApp}
            className="px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs whitespace-nowrap transition-colors shadow-sm"
          >
            Perbarui
          </button>
        </aside>
      )}
    </Layout>
  );
}
