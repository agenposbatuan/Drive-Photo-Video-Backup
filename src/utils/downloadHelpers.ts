import { GoogleDriveService } from '../services/GoogleDriveService';

/**
 * Triggers a file download in the browser from a Blob.
 */
export function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Triggers a file download in the browser from an endpoint URL.
 */
export function triggerUrlDownload(url: string, filename?: string): void {
  const a = document.createElement('a');
  a.href = url;
  if (filename) {
    a.download = filename;
  }
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

/**
 * Compresses an image Blob using HTML5 Canvas.
 * Preserves aspect ratio, reduces resolution if larger than maxDimension,
 * and encodes with JPEG compression (default 0.78 quality).
 */
export async function compressImageBlob(
  blob: Blob,
  maxDimension = 1920,
  quality = 0.78
): Promise<Blob> {
  return new Promise((resolve) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(blob);

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      let width = img.naturalWidth || img.width;
      let height = img.naturalHeight || img.height;

      if (!width || !height) {
        resolve(blob);
        return;
      }

      if (width > maxDimension || height > maxDimension) {
        if (width > height) {
          height = Math.round((height * maxDimension) / width);
          width = maxDimension;
        } else {
          width = Math.round((width * maxDimension) / height);
          height = maxDimension;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(blob);
        return;
      }

      // Draw image onto canvas
      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        (compressedBlob) => {
          if (compressedBlob && compressedBlob.size > 0) {
            resolve(compressedBlob);
          } else {
            resolve(blob);
          }
        },
        'image/jpeg',
        quality
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      // Fallback cleanly to original blob if browser fails to decode
      resolve(blob);
    };

    img.src = objectUrl;
  });
}

/**
 * Helper to download photo for the authenticated owner (Semua Foto & Album).
 * Uses GoogleDriveService.fetchMediaBlob with OAuth token.
 */
export async function downloadOwnerPhoto(
  photo: { id: string; name: string },
  type: 'original' | 'compress'
): Promise<void> {
  const blob = await GoogleDriveService.fetchMediaBlob(photo.id);
  if (type === 'original') {
    triggerBlobDownload(blob, photo.name);
  } else {
    const compressedBlob = await compressImageBlob(blob);
    const baseName = photo.name.replace(/\.[^/.]+$/, '');
    const ext = photo.name.includes('.') ? photo.name.split('.').pop() : 'jpg';
    const compressedName = `compressed_${baseName}.${ext || 'jpg'}`;
    triggerBlobDownload(compressedBlob, compressedName);
  }
}

/**
 * Helper to download photo for Family Viewer via the backend gateway.
 * Enforces server-side permissions and provides either original or compressed derivative.
 */
export async function downloadFamilyPhoto(
  photo: { id: string; name: string },
  type: 'original' | 'compress'
): Promise<void> {
  const downloadUrl = `/api/family/download/${encodeURIComponent(photo.id)}?type=${type}`;
  const response = await fetch(downloadUrl, {
    method: 'GET',
    credentials: 'same-origin',
  });

  if (!response.ok) {
    let errorMessage = 'Gagal mengunduh foto.';
    try {
      const errData = await response.json();
      if (errData && errData.error) {
        errorMessage = errData.error;
      }
    } catch {
      errorMessage = `Gagal mengunduh foto (${response.status}: ${response.statusText})`;
    }
    throw new Error(errorMessage);
  }

  const blob = await response.blob();
  const safeName = photo.name.replace(/[\\/:*?"<>|]/g, '_');
  const baseName = safeName.replace(/\.[^/.]+$/, '');
  const ext = safeName.includes('.') ? safeName.split('.').pop() : 'jpg';

  if (type === 'original') {
    triggerBlobDownload(blob, safeName);
  } else {
    // Generate compressed derivative reusing the same canvas compression pipeline as admin
    const compressedBlob = await compressImageBlob(blob);
    const compressedName = `compressed_${baseName}.${ext || 'jpg'}`;
    triggerBlobDownload(compressedBlob, compressedName);
  }
}
