export interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
  prompt(): Promise<void>;
}

export interface PwaState {
  isStandalone: boolean;
  canInstall: boolean;
  isInstalled: boolean;
  isUpdateAvailable: boolean;
  platform: 'android' | 'ios' | 'desktop' | 'other';
}

type PwaListener = (state: PwaState) => void;

class PwaServiceImpl {
  private deferredPrompt: BeforeInstallPromptEvent | null = null;
  private swRegistration: ServiceWorkerRegistration | null = null;
  private waitingWorker: ServiceWorker | null = null;
  private isRefreshing = false;
  private listeners = new Set<PwaListener>();

  private state: PwaState = {
    isStandalone: false,
    canInstall: false,
    isInstalled: false,
    isUpdateAvailable: false,
    platform: 'other',
  };

  constructor() {
    this.detectPlatform();
    this.checkStandalone();
    this.bindEvents();
  }

  private detectPlatform(): void {
    if (typeof window === 'undefined') return;
    const ua = navigator.userAgent.toLowerCase();
    if (/android/.test(ua)) {
      this.state.platform = 'android';
    } else if (/iphone|ipad|ipod/.test(ua)) {
      this.state.platform = 'ios';
    } else if (/windows|macintosh|linux/.test(ua)) {
      this.state.platform = 'desktop';
    } else {
      this.state.platform = 'other';
    }
  }

  private checkStandalone(): void {
    if (typeof window === 'undefined') return;

    const isMatchStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      window.matchMedia('(display-mode: fullscreen)').matches ||
      window.matchMedia('(display-mode: minimal-ui)').matches;

    const isIosStandalone = (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    const isAndroidTwa = document.referrer.includes('android-app://');

    const isStandalone = isMatchStandalone || isIosStandalone || isAndroidTwa;

    this.state.isStandalone = isStandalone;
    if (isStandalone) {
      this.state.isInstalled = true;
      this.state.canInstall = false;
    }
  }

  private bindEvents(): void {
    if (typeof window === 'undefined') return;

    // Listen to beforeinstallprompt for Android & Chromium browsers
    window.addEventListener('beforeinstallprompt', (e) => {
      // Prevent browser default mini-infobar
      e.preventDefault();
      this.deferredPrompt = e as BeforeInstallPromptEvent;
      this.state.canInstall = true;
      this.notify();
    });

    // Listen to appinstalled event
    window.addEventListener('appinstalled', () => {
      this.deferredPrompt = null;
      this.state.canInstall = false;
      this.state.isInstalled = true;
      this.notify();
      console.log('[PWA] Aplikasi berhasil diinstal ke Home Screen');
    });

    // Listen to display-mode changes
    try {
      const matcher = window.matchMedia('(display-mode: standalone)');
      matcher.addEventListener('change', (e) => {
        this.state.isStandalone = e.matches;
        if (e.matches) {
          this.state.isInstalled = true;
          this.state.canInstall = false;
        }
        this.notify();
      });
    } catch {
      // Ignore if matchMedia listener unsupported
    }
  }

  public registerServiceWorker(): void {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

    window.addEventListener('load', () => {
      navigator.serviceWorker
        .register('/sw.js')
        .then((registration) => {
          this.swRegistration = registration;

          // Check if there is already a waiting worker
          if (registration.waiting) {
            this.waitingWorker = registration.waiting;
            this.state.isUpdateAvailable = true;
            this.notify();
          }

          // Listen for new worker installs
          registration.addEventListener('updatefound', () => {
            const newWorker = registration.installing;
            if (!newWorker) return;

            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                // New update available!
                this.waitingWorker = newWorker;
                this.state.isUpdateAvailable = true;
                this.notify();
              }
            });
          });
        })
        .catch((err) => {
          console.warn('[PWA] Service Worker registration failed:', err);
        });

      // Reload smoothly when new worker takes control
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!this.isRefreshing) {
          this.isRefreshing = true;
          window.location.reload();
        }
      });
    });
  }

  public async promptInstall(): Promise<'accepted' | 'dismissed' | 'unsupported'> {
    if (!this.deferredPrompt) {
      return 'unsupported';
    }

    try {
      await this.deferredPrompt.prompt();
      const choice = await this.deferredPrompt.userChoice;
      this.deferredPrompt = null;
      this.state.canInstall = false;
      if (choice.outcome === 'accepted') {
        this.state.isInstalled = true;
      }
      this.notify();
      return choice.outcome;
    } catch (err) {
      console.error('[PWA] Error prompting installation:', err);
      return 'unsupported';
    }
  }

  public applyUpdate(): void {
    if (this.waitingWorker) {
      this.waitingWorker.postMessage({ type: 'SKIP_WAITING' });
    } else if (this.swRegistration && this.swRegistration.waiting) {
      this.swRegistration.waiting.postMessage({ type: 'SKIP_WAITING' });
    } else {
      window.location.reload();
    }
  }

  public getState(): PwaState {
    return { ...this.state };
  }

  public subscribe(listener: PwaListener): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    const currentState = this.getState();
    for (const listener of this.listeners) {
      listener(currentState);
    }
  }
}

export const PwaService = new PwaServiceImpl();
