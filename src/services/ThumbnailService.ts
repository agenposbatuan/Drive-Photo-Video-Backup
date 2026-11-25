import { GoogleDriveService } from './GoogleDriveService';
import { PhotoQualityMode } from '../types';
import { resolveEffectiveQuality } from './FamilyGalleryService';

const MAX_OBJECT_URL_CACHE = 80;

export function resolveThumbnailSize(mode: PhotoQualityMode = 'auto', baseSize = 480): number {
  const effective = resolveEffectiveQuality(mode);
  switch (effective) {
    case 'data_saver':
      return 240; // Irit kuota, hemat bandwidth, memuat sangat cepat
    case 'hd':
      return 720; // High Definition tajam untuk layar beresolusi tinggi
    case 'original':
      return 1200; // Tampilan resolusi tinggi mendekati master
    default:
      return baseSize;
  }
}

class ThumbnailServiceImpl {
  private fullImageUrlCache = new Map<string, string>();
  private fallbackThumbCache = new Map<string, string>();
  private inFlightFull = new Map<string, Promise<string>>();
  private inFlightThumb = new Map<string, Promise<string>>();

  public resolveThumbnailSize(mode: PhotoQualityMode = 'auto', baseSize = 480): number {
    return resolveThumbnailSize(mode, baseSize);
  }

  public getGridThumbnailUrl(
    thumbnailLink?: string,
    size?: number,
    qualityMode: PhotoQualityMode = 'auto'
  ): string | null {
    if (!thumbnailLink) return null;
    const targetSize = size ?? resolveThumbnailSize(qualityMode);
    // Drive thumbnailLink biasanya berakhir dengan =s220 — sesuaikan dengan targetSize
    if (/=s\d+/.test(thumbnailLink)) {
      return thumbnailLink.replace(/=s\d+/, `=s${targetSize}`);
    }
    return thumbnailLink;
  }

  public async loadAuthenticatedThumbnail(fileId: string): Promise<string> {
    const cached = this.fallbackThumbCache.get(fileId);
    if (cached) return cached;

    const existing = this.inFlightThumb.get(fileId);
    if (existing) return existing;

    const promise = (async () => {
      try {
        const blob = await GoogleDriveService.fetchMediaBlob(fileId);
        const objectUrl = URL.createObjectURL(blob);
        this.rememberUrl(this.fallbackThumbCache, fileId, objectUrl);
        return objectUrl;
      } finally {
        this.inFlightThumb.delete(fileId);
      }
    })();

    this.inFlightThumb.set(fileId, promise);
    return promise;
  }

  public async loadOriginalImage(fileId: string, signal?: AbortSignal): Promise<string> {
    const cached = this.fullImageUrlCache.get(fileId);
    if (cached) return cached;

    const existing = this.inFlightFull.get(fileId);
    if (existing) return existing;

    const promise = (async () => {
      try {
        const blob = await GoogleDriveService.fetchMediaBlob(fileId, signal);
        const objectUrl = URL.createObjectURL(blob);
        this.rememberUrl(this.fullImageUrlCache, fileId, objectUrl);
        return objectUrl;
      } finally {
        this.inFlightFull.delete(fileId);
      }
    })();

    this.inFlightFull.set(fileId, promise);
    return promise;
  }

  private rememberUrl(cache: Map<string, string>, key: string, url: string): void {
    if (cache.size >= MAX_OBJECT_URL_CACHE) {
      const oldestKey = cache.keys().next().value;
      if (oldestKey) {
        const oldUrl = cache.get(oldestKey);
        if (oldUrl) URL.revokeObjectURL(oldUrl);
        cache.delete(oldestKey);
      }
    }
    cache.set(key, url);
  }

  public clearAll(): void {
    this.fullImageUrlCache.forEach((url) => URL.revokeObjectURL(url));
    this.fallbackThumbCache.forEach((url) => URL.revokeObjectURL(url));
    this.fullImageUrlCache.clear();
    this.fallbackThumbCache.clear();
  }
}

export const ThumbnailService = new ThumbnailServiceImpl();
