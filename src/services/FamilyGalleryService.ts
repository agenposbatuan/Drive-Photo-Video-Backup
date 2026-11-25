import {
  FamilyGalleryItem,
  FamilyViewerAlbum,
  FamilyViewerPhoto,
  GalleryAlbumPermission,
  GalleryContentMode,
  GalleryPhotoPermission,
  PhotoQualityMode,
} from '../types';
import { AuthenticationService } from './AuthenticationService';

export const QUALITY_OPTIONS: Array<{
  value: PhotoQualityMode;
  label: string;
  shortLabel: string;
  description: string;
}> = [
  {
    value: 'data_saver',
    label: 'IRIT KUOTA',
    shortLabel: 'Irit Kuota',
    description: 'Hemat penggunaan data internet.',
  },
  {
    value: 'hd',
    label: 'HD',
    shortLabel: 'HD',
    description: 'Foto lebih tajam dengan detail lebih tinggi.',
  },
  {
    value: 'auto',
    label: 'OTOMATIS',
    shortLabel: 'Otomatis',
    description: 'Menyesuaikan kualitas berdasarkan kondisi jaringan.',
  },
  {
    value: 'original',
    label: 'ORIGINAL',
    shortLabel: 'Original',
    description: 'Menampilkan foto asli sesuai resolusi sumber.',
  },
];

export function resolveEffectiveQuality(mode: PhotoQualityMode): 'data_saver' | 'hd' | 'original' {
  if (mode !== 'auto') return mode;
  if (typeof navigator === 'undefined') return 'data_saver';
  const nav = navigator as Navigator & {
    connection?: { effectiveType?: string; saveData?: boolean };
  };
  const conn = nav.connection;
  if (!conn) return 'data_saver';
  if (conn.saveData) return 'data_saver';
  if (conn.effectiveType === '4g') return 'hd';
  return 'data_saver';
}

async function ownerFetch<T>(url: string, init: RequestInit = {}): Promise<T> {
  const idToken = await AuthenticationService.getIdToken();
  if (!idToken) {
    throw new Error('Silakan masuk dengan akun Google terlebih dahulu.');
  }
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${idToken}`);
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const res = await fetch(url, { ...init, headers });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) {
    throw new Error(data.error || `Permintaan gagal (${res.status}).`);
  }
  return data;
}

class FamilyGalleryServiceImpl {
  public async syncOwnerSession(rootFolder?: { id: string; name: string } | null): Promise<void> {
    const driveAccessToken = AuthenticationService.getAccessToken();
    await ownerFetch('/api/owner/session', {
      method: 'POST',
      body: JSON.stringify({
        driveAccessToken: driveAccessToken || undefined,
        rootFolderId: rootFolder?.id,
        rootFolderName: rootFolder?.name,
      }),
    });
  }

  public async listGalleries(): Promise<FamilyGalleryItem[]> {
    const data = await ownerFetch<{ galleries: FamilyGalleryItem[] }>('/api/owner/galleries');
    return data.galleries;
  }

  public async createGallery(payload: {
    name: string;
    contentMode: GalleryContentMode;
    defaultQuality: PhotoQualityMode;
    allowDownloadDefault: boolean;
    expiresAt: string | null;
    password: string;
    albums: GalleryAlbumPermission[];
    photos: GalleryPhotoPermission[];
  }): Promise<{ galleryId: string; shareToken: string }> {
    return ownerFetch('/api/owner/galleries', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  public async updateGallery(
    galleryId: string,
    payload: {
      name?: string;
      contentMode?: GalleryContentMode;
      defaultQuality?: PhotoQualityMode;
      allowDownloadDefault?: boolean;
      expiresAt?: string | null;
      newPassword?: string;
      albums?: GalleryAlbumPermission[];
      photos?: GalleryPhotoPermission[];
      reactivate?: boolean;
    }
  ): Promise<void> {
    await ownerFetch(`/api/owner/galleries/${encodeURIComponent(galleryId)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  }

  public async changePassword(galleryId: string, newPassword: string): Promise<void> {
    await ownerFetch(`/api/owner/galleries/${encodeURIComponent(galleryId)}/change-password`, {
      method: 'POST',
      body: JSON.stringify({ newPassword }),
    });
  }

  public async extendExpiration(galleryId: string, expiresAt: string | null): Promise<void> {
    await ownerFetch(`/api/owner/galleries/${encodeURIComponent(galleryId)}/extend-expiration`, {
      method: 'POST',
      body: JSON.stringify({ expiresAt }),
    });
  }

  public async toggleLinkStatus(galleryId: string): Promise<{ status: 'active' | 'revoked' }> {
    return ownerFetch(`/api/owner/galleries/${encodeURIComponent(galleryId)}/toggle-status`, {
      method: 'POST',
    });
  }

  public async regenerateLink(galleryId: string): Promise<{ shareToken: string }> {
    return ownerFetch(`/api/owner/galleries/${encodeURIComponent(galleryId)}/regenerate-link`, {
      method: 'POST',
    });
  }

  public async revokeGallery(galleryId: string): Promise<void> {
    await ownerFetch(`/api/owner/galleries/${encodeURIComponent(galleryId)}/revoke`, {
      method: 'POST',
    });
  }

  public async deleteGallery(galleryId: string): Promise<void> {
    await ownerFetch(`/api/owner/galleries/${encodeURIComponent(galleryId)}`, {
      method: 'DELETE',
    });
  }

  // Family Viewer API (Private Link + Password Only)
  public async getShareInfo(token: string): Promise<{
    galleryId: string;
    name: string;
    defaultQuality: PhotoQualityMode;
    expiresAt: string | null;
    isAuthenticated: boolean;
  }> {
    const res = await fetch(`/api/family/info?token=${encodeURIComponent(token)}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || 'Tautan galeri tidak tersedia.');
    }
    return data;
  }

  public async authenticateWithPassword(token: string, password: string): Promise<void> {
    const res = await fetch('/api/family/auth/password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, password }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || 'Gagal masuk ke galeri.');
    }
  }

  public async logoutViewer(): Promise<void> {
    await fetch('/api/family/logout', { method: 'POST' });
  }

  public async fetchViewerContent(): Promise<{
    gallery: {
      id: string;
      name: string;
      defaultQuality: PhotoQualityMode;
      preferredQuality: PhotoQualityMode;
      expiresAt: string | null;
    };
    albums: FamilyViewerAlbum[];
    photos: FamilyViewerPhoto[];
  }> {
    const res = await fetch('/api/family/content');
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || 'Gagal memuat foto galeri.');
    }
    return data;
  }

  public async saveViewerQualityPreference(preferredQuality: PhotoQualityMode): Promise<void> {
    await fetch('/api/family/preferences', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ preferredQuality }),
    });
  }

  public getShareUrl(shareToken: string): string {
    return `${window.location.origin}/?share=${encodeURIComponent(shareToken)}`;
  }

  public getMediaUrl(fileId: string, quality: 'data_saver' | 'hd' | 'original'): string {
    return `/api/family/media/${encodeURIComponent(fileId)}?quality=${quality}`;
  }

  public getDownloadUrl(fileId: string): string {
    return `/api/family/download/${encodeURIComponent(fileId)}`;
  }
}

export const FamilyGalleryService = new FamilyGalleryServiceImpl();
