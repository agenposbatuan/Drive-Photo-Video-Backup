import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  User,
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';
import { AuthState, AuthUserProfile } from '../types';

export const SCOPES = [
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/drive.metadata.readonly',
];

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);

const provider = new GoogleAuthProvider();
SCOPES.forEach((scope) => provider.addScope(scope));
provider.setCustomParameters({
  prompt: 'select_account',
});

type AuthListener = (state: AuthState) => void;

class AuthenticationServiceImpl {
  // Token akses HANYA disimpan di memori — tidak pernah di localStorage, sessionStorage, atau IndexedDB.
  private cachedAccessToken: string | null = null;
  private isSigningIn = false;
  private listeners = new Set<AuthListener>();
  private state: AuthState = {
    isInitialized: false,
    isAuthenticated: false,
    hasValidToken: false,
    tokenExpired: false,
    user: null,
    error: null,
  };
  private unsubscribeFirebase: (() => void) | null = null;

  private mapUser(user: User | null): AuthUserProfile | null {
    if (!user) return null;
    return {
      uid: user.uid,
      displayName: user.displayName || 'Pengguna Google',
      email: user.email || '',
      photoURL: user.photoURL,
    };
  }

  private emit(next: Partial<AuthState>): void {
    this.state = { ...this.state, ...next };
    const snapshot = { ...this.state };
    this.listeners.forEach((listener) => listener(snapshot));
  }

  public init(): () => void {
    if (this.unsubscribeFirebase) {
      return this.unsubscribeFirebase;
    }

    this.unsubscribeFirebase = onAuthStateChanged(auth, (user: User | null) => {
      if (user) {
        if (this.cachedAccessToken) {
          this.emit({
            isInitialized: true,
            isAuthenticated: true,
            hasValidToken: true,
            tokenExpired: false,
            user: this.mapUser(user),
            error: null,
          });
        } else if (!this.isSigningIn) {
          // Pengguna sudah masuk ke sesi Firebase, namun token OAuth Drive di memori belum tersedia
          // (misalnya setelah muat ulang halaman). Minta verifikasi ulang secara transparan.
          this.cachedAccessToken = null;
          this.emit({
            isInitialized: true,
            isAuthenticated: true,
            hasValidToken: false,
            tokenExpired: true,
            user: this.mapUser(user),
            error: null,
          });
        }
      } else {
        this.cachedAccessToken = null;
        this.emit({
          isInitialized: true,
          isAuthenticated: false,
          hasValidToken: false,
          tokenExpired: false,
          user: null,
          error: null,
        });
      }
    });

    return this.unsubscribeFirebase;
  }

  public getState(): AuthState {
    return { ...this.state };
  }

  public subscribe(listener: AuthListener): () => void {
    this.listeners.add(listener);
    listener({ ...this.state });
    return () => this.listeners.delete(listener);
  }

  public async signInWithGoogle(): Promise<{ user: AuthUserProfile; accessToken: string }> {
    try {
      this.isSigningIn = true;
      this.emit({ error: null });

      const result = await signInWithPopup(auth, provider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      const token = credential?.accessToken;

      if (!token) {
        throw new Error('Token akses Google Drive tidak diterima dari layanan autentikasi.');
      }

      this.cachedAccessToken = token;
      const profile = this.mapUser(result.user)!;

      this.emit({
        isInitialized: true,
        isAuthenticated: true,
        hasValidToken: true,
        tokenExpired: false,
        user: profile,
        error: null,
      });

      return { user: profile, accessToken: token };
    } catch (err: unknown) {
      const mappedMessage = this.mapAuthError(err);
      this.emit({ error: mappedMessage });
      throw new Error(mappedMessage);
    } finally {
      this.isSigningIn = false;
    }
  }

  public async logout(): Promise<void> {
    this.cachedAccessToken = null;
    try {
      await signOut(auth);
    } finally {
      this.emit({
        isInitialized: true,
        isAuthenticated: false,
        hasValidToken: false,
        tokenExpired: false,
        user: null,
        error: null,
      });
    }
  }

  public getAccessToken(): string | null {
    return this.cachedAccessToken;
  }

  public async getIdToken(): Promise<string | null> {
    if (!auth.currentUser) return null;
    return auth.currentUser.getIdToken();
  }

  public markTokenExpired(reason?: string): void {
    this.cachedAccessToken = null;
    this.emit({
      hasValidToken: false,
      tokenExpired: true,
      error:
        reason ||
        'Sesi akses Google Drive telah berakhir. Silakan hubungkan kembali akun Google Anda.',
    });
  }

  public clearError(): void {
    this.emit({ error: null });
  }

  private mapAuthError(err: unknown): string {
    const code =
      typeof err === 'object' && err !== null && 'code' in err
        ? String((err as { code?: unknown }).code)
        : '';

    switch (code) {
      case 'auth/popup-closed-by-user':
        return 'Jendela masuk Google ditutup sebelum proses selesai. Silakan coba lagi.';
      case 'auth/popup-blocked':
        return 'Popup masuk Google diblokir oleh browser. Izinkan popup untuk situs ini lalu coba lagi.';
      case 'auth/cancelled-popup-request':
        return 'Permintaan masuk sebelumnya dibatalkan karena ada permintaan baru.';
      case 'auth/network-request-failed':
        return 'Koneksi jaringan terganggu saat menghubungi layanan autentikasi Google.';
      case 'auth/unauthorized-domain': {
        const host = typeof window !== 'undefined' ? window.location.hostname : '';
        return host
          ? `Domain "${host}" belum terdaftar di Authorized domains Firebase Authentication (project: ${firebaseConfig.projectId}).`
          : 'Domain aplikasi belum terdaftar pada konfigurasi autentikasi Google Cloud.';
      }
      case 'auth/access-denied':
        return 'Izin akses Google Drive ditolak. Aplikasi memerlukan izin Drive agar dapat mencadangkan foto.';
      default:
        return err instanceof Error && err.message
          ? err.message
          : 'Gagal masuk ke akun Google. Silakan periksa koneksi internet dan coba kembali.';
    }
  }
}

export const AuthenticationService = new AuthenticationServiceImpl();
