const SUPPORTED_IMAGE_MIME_PREFIX = 'image/';
const SUPPORTED_VIDEO_MIME_PREFIX = 'video/';

const SUPPORTED_IMAGE_EXTENSIONS = new Set([
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.gif',
  '.heic',
  '.heif',
  '.bmp',
  '.tiff',
  '.tif',
  '.avif',
  '.dng',
  '.raw',
  '.cr2',
  '.nef',
  '.arw',
]);

const SUPPORTED_VIDEO_EXTENSIONS = new Set([
  '.mp4',
  '.mov',
  '.avi',
  '.mkv',
  '.webm',
  '.m4v',
  '.3gp',
  '.mpeg',
  '.mpg',
  '.wmv',
  '.flv',
]);

export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '0 B';
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, exponent);
  return `${value >= 10 || exponent === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[exponent]}`;
}

export function formatIndonesianDate(isoString?: string | number): string {
  if (!isoString) return 'Tanggal tidak diketahui';
  const date = typeof isoString === 'number' ? new Date(isoString) : new Date(isoString);
  if (Number.isNaN(date.getTime())) return 'Tanggal tidak diketahui';
  return new Intl.DateTimeFormat('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date);
}

export function formatIndonesianDateTime(isoString?: string | number): string {
  if (!isoString) return '-';
  const date = typeof isoString === 'number' ? new Date(isoString) : new Date(isoString);
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function formatExifDateToIso(exifTime?: string): string | undefined {
  if (!exifTime) return undefined;
  // Format EXIF dari Drive umumnya "YYYY:MM:DD HH:mm:ss"
  const match = exifTime.match(/^(\d{4}):(\d{2}):(\d{2})\s+(\d{2}):(\d{2}):(\d{2})$/);
  if (match) {
    return `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}Z`;
  }
  const parsed = Date.parse(exifTime);
  if (!Number.isNaN(parsed)) {
    return new Date(parsed).toISOString();
  }
  return undefined;
}

export function isValidImageFile(file: File): boolean {
  if (file.size <= 0) return false;
  if (file.type && file.type.startsWith(SUPPORTED_IMAGE_MIME_PREFIX)) {
    return true;
  }
  const lower = file.name.toLowerCase();
  const lastDot = lower.lastIndexOf('.');
  if (lastDot !== -1) {
    return SUPPORTED_IMAGE_EXTENSIONS.has(lower.slice(lastDot));
  }
  return false;
}

export function isValidVideoFile(file: File): boolean {
  if (file.size <= 0) return false;
  if (file.type && file.type.startsWith(SUPPORTED_VIDEO_MIME_PREFIX)) {
    return true;
  }
  const lower = file.name.toLowerCase();
  const lastDot = lower.lastIndexOf('.');
  if (lastDot !== -1) {
    return SUPPORTED_VIDEO_EXTENSIONS.has(lower.slice(lastDot));
  }
  return false;
}

export function isSupportedMediaFile(file: File): boolean {
  return isValidImageFile(file) || isValidVideoFile(file);
}

export function inferImageMimeType(file: File): string {
  if (file.type && file.type.startsWith('image/')) {
    return file.type;
  }
  const lower = file.name.toLowerCase();
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.heic')) return 'image/heic';
  if (lower.endsWith('.heif')) return 'image/heif';
  if (lower.endsWith('.bmp')) return 'image/bmp';
  if (lower.endsWith('.tif') || lower.endsWith('.tiff')) return 'image/tiff';
  if (lower.endsWith('.avif')) return 'image/avif';
  return 'application/octet-stream';
}

export function inferVideoMimeType(file: File): string {
  if (file.type && file.type.startsWith('video/')) {
    return file.type;
  }
  const lower = file.name.toLowerCase();
  if (lower.endsWith('.mp4')) return 'video/mp4';
  if (lower.endsWith('.mov')) return 'video/quicktime';
  if (lower.endsWith('.avi')) return 'video/x-msvideo';
  if (lower.endsWith('.mkv')) return 'video/x-matroska';
  if (lower.endsWith('.webm')) return 'video/webm';
  if (lower.endsWith('.m4v')) return 'video/x-m4v';
  if (lower.endsWith('.3gp')) return 'video/3gpp';
  if (lower.endsWith('.mpeg') || lower.endsWith('.mpg')) return 'video/mpeg';
  if (lower.endsWith('.wmv')) return 'video/x-ms-wmv';
  if (lower.endsWith('.flv')) return 'video/x-flv';
  return 'video/mp4';
}

export function inferMediaMimeType(file: File): string {
  if (isValidVideoFile(file)) {
    return inferVideoMimeType(file);
  }
  return inferImageMimeType(file);
}

export function extractRelativeFolderPath(file: File): string {
  const webkitPath = (file as File & { webkitRelativePath?: string }).webkitRelativePath;
  if (!webkitPath) return '';
  const parts = webkitPath.split('/').filter(Boolean);
  if (parts.length <= 1) return '';
  return parts.slice(0, -1).join('/');
}

export function generateTaskId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `task-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function buildCopyFileName(originalName: string): string {
  const dotIndex = originalName.lastIndexOf('.');
  const stamp = new Date()
    .toISOString()
    .replace(/[-:T]/g, '')
    .slice(0, 12);
  if (dotIndex > 0) {
    return `${originalName.slice(0, dotIndex)} (salinan ${stamp})${originalName.slice(dotIndex)}`;
  }
  return `${originalName} (salinan ${stamp})`;
}

export function mapUploadStatusLabel(status: string): string {
  switch (status) {
    case 'queued':
      return 'Menunggu antrean';
    case 'checking_duplicate':
      return 'Memeriksa duplikat';
    case 'duplicate_pending':
      return 'Menunggu keputusan duplikat';
    case 'uploading':
      return 'Sedang mengupload';
    case 'paused':
      return 'Dijeda';
    case 'interrupted':
      return 'Terputus — siap dilanjutkan';
    case 'waiting_auth':
      return 'Menunggu autentikasi Google';
    case 'needs_file':
      return 'File sumber tidak tersedia';
    case 'completed':
      return 'Selesai dicadangkan';
    case 'failed':
      return 'Gagal diupload';
    case 'skipped':
      return 'Dilewati (duplikat)';
    case 'cancelled':
      return 'Dibatalkan';
    default:
      return status;
  }
}

/**
 * Format duration in milliseconds to MM:SS or HH:MM:SS
 */
export function formatDurationMillis(millis?: number): string {
  if (!millis || millis <= 0 || !Number.isFinite(millis)) return '00:00';
  const totalSeconds = Math.floor(millis / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

