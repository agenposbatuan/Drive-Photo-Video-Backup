import { AppSettings, DuplicatePolicy, PhotoQualityMode, RecentAlbumRef, RootFolderConfig, ThemeMode } from '../types';

const SETTINGS_STORAGE_KEY = 'gdrive_photo_backup_settings_v1';

const DEFAULT_SETTINGS: AppSettings = {
  theme: 'light',
  rootFolder: null,
  maxConcurrentUploads: 2,
  defaultDuplicatePolicy: 'ask',
  notificationsEnabled: false,
  recentAlbums: [],
  galleryQuality: 'auto',
};

type SettingsListener = (settings: AppSettings) => void;

class SettingsServiceImpl {
  private settings: AppSettings;
  private listeners = new Set<SettingsListener>();

  constructor() {
    this.settings = this.loadFromStorage();
    this.applyTheme(this.settings.theme);
    this.bindSystemThemeListener();
  }

  private loadFromStorage(): AppSettings {
    try {
      const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
      if (!raw) return { ...DEFAULT_SETTINGS };
      const parsed = JSON.parse(raw) as Partial<AppSettings>;
      return {
        theme: parsed.theme === 'dark' || parsed.theme === 'system' ? parsed.theme : 'light',
        rootFolder: parsed.rootFolder ?? null,
        maxConcurrentUploads:
          typeof parsed.maxConcurrentUploads === 'number' &&
          parsed.maxConcurrentUploads >= 1 &&
          parsed.maxConcurrentUploads <= 4
            ? parsed.maxConcurrentUploads
            : 2,
        defaultDuplicatePolicy:
          parsed.defaultDuplicatePolicy === 'skip' || parsed.defaultDuplicatePolicy === 'copy'
            ? parsed.defaultDuplicatePolicy
            : 'ask',
        notificationsEnabled: Boolean(parsed.notificationsEnabled),
        recentAlbums: Array.isArray(parsed.recentAlbums) ? parsed.recentAlbums.slice(0, 8) : [],
        galleryQuality:
          parsed.galleryQuality === 'data_saver' ||
          parsed.galleryQuality === 'hd' ||
          parsed.galleryQuality === 'auto' ||
          parsed.galleryQuality === 'original'
            ? parsed.galleryQuality
            : 'auto',
      };
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  }

  private save(): void {
    try {
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(this.settings));
    } catch {
      // Abaikan jika penyimpanan lokal dibatasi oleh mode privat browser
    }
    this.listeners.forEach((listener) => listener(this.getSettings()));
  }

  private bindSystemThemeListener(): void {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', () => {
      if (this.settings.theme === 'system') {
        this.applyTheme('system');
      }
    });
  }

  public applyTheme(mode: ThemeMode): void {
    if (typeof document === 'undefined') return;
    const prefersDark =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-color-scheme: dark)').matches;
    const shouldBeDark = mode === 'dark' || (mode === 'system' && prefersDark);
    document.documentElement.classList.toggle('dark', shouldBeDark);
  }

  public getSettings(): AppSettings {
    return {
      ...this.settings,
      recentAlbums: [...this.settings.recentAlbums],
    };
  }

  public subscribe(listener: SettingsListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  public setTheme(theme: ThemeMode): void {
    this.settings = { ...this.settings, theme };
    this.applyTheme(theme);
    this.save();
  }

  public setRootFolder(rootFolder: RootFolderConfig | null): void {
    this.settings = {
      ...this.settings,
      rootFolder,
      recentAlbums: rootFolder ? this.settings.recentAlbums : [],
    };
    this.save();
  }

  public setMaxConcurrentUploads(count: number): void {
    const clamped = Math.max(1, Math.min(4, Math.round(count)));
    this.settings = { ...this.settings, maxConcurrentUploads: clamped };
    this.save();
  }

  public setDefaultDuplicatePolicy(policy: DuplicatePolicy): void {
    this.settings = { ...this.settings, defaultDuplicatePolicy: policy };
    this.save();
  }

  public setNotificationsEnabled(enabled: boolean): void {
    this.settings = { ...this.settings, notificationsEnabled: enabled };
    this.save();
  }

  public recordRecentAlbum(album: RecentAlbumRef): void {
    const filtered = this.settings.recentAlbums.filter((a) => a.id !== album.id);
    const updated = [album, ...filtered].slice(0, 6);
    this.settings = { ...this.settings, recentAlbums: updated };
    this.save();
  }

  public clearRecentAlbums(): void {
    this.settings = { ...this.settings, recentAlbums: [] };
    this.save();
  }

  public setGalleryQuality(galleryQuality: PhotoQualityMode): void {
    this.settings = { ...this.settings, galleryQuality };
    this.save();
  }
}

export const SettingsService = new SettingsServiceImpl();
