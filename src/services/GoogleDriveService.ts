import { DriveFile, DriveStorageQuota, StorageStatusLevel } from '../types';
import { AuthenticationService } from './AuthenticationService';

const DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD_BASE = 'https://www.googleapis.com/upload/drive/v3';

export const FOLDER_MIME_TYPE = 'application/vnd.google-apps.folder';

export class DriveApiError extends Error {
  public readonly status: number;
  public readonly code:
    | 'UNAUTHORIZED'
    | 'PERMISSION_DENIED'
    | 'NOT_FOUND'
    | 'QUOTA_EXCEEDED'
    | 'NETWORK_ERROR'
    | 'SESSION_EXPIRED'
    | 'UNKNOWN';

  constructor(
    message: string,
    status: number,
    code: DriveApiError['code'] = 'UNKNOWN'
  ) {
    super(message);
    this.name = 'DriveApiError';
    this.status = status;
    this.code = code;
  }
}

export interface DriveFileListResponse {
  files: DriveFile[];
  nextPageToken?: string;
}

export function formatBytesToGB(bytes?: number): string {
  if (bytes === undefined || !Number.isFinite(bytes) || bytes < 0) return '0.0 GB';
  const gb = bytes / (1024 * 1024 * 1024);
  return `${gb.toFixed(1)} GB`;
}

export function escapeDriveQueryValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

class GoogleDriveServiceImpl {
  private cachedQuota: { data: DriveStorageQuota; fetchedAt: number } | null = null;
  private quotaPromise: Promise<DriveStorageQuota> | null = null;
  private static readonly QUOTA_CACHE_TTL_MS = 5 * 60 * 1000;

  private requireToken(): string {
    const token = AuthenticationService.getAccessToken();
    if (!token) {
      AuthenticationService.markTokenExpired(
        'Token akses Google Drive tidak tersedia atau telah kedaluwarsa. Silakan hubungkan kembali akun Google.'
      );
      throw new DriveApiError(
        'Sesi akses Google Drive tidak aktif. Silakan masuk ulang dengan akun Google Anda.',
        401,
        'UNAUTHORIZED'
      );
    }
    return token;
  }

  private async requestJson<T>(
    url: string,
    init: RequestInit = {},
    retryCount = 0
  ): Promise<T> {
    const token = this.requireToken();
    const headers = new Headers(init.headers);
    headers.set('Authorization', `Bearer ${token}`);

    let response: Response;
    try {
      response = await fetch(url, { ...init, headers });
    } catch {
      throw new DriveApiError(
        'Koneksi jaringan terputus saat menghubungi Google Drive. Periksa koneksi internet Anda.',
        0,
        'NETWORK_ERROR'
      );
    }

    if (response.status === 401) {
      AuthenticationService.markTokenExpired();
      throw new DriveApiError(
        'Token akses Google Drive telah berakhir. Silakan autentikasi ulang untuk melanjutkan.',
        401,
        'UNAUTHORIZED'
      );
    }

    if (response.status === 429 || (response.status === 403 && retryCount < 2)) {
      const errorText = await response.text().catch(() => '');
      const isRateLimit =
        response.status === 429 ||
        errorText.includes('rateLimitExceeded') ||
        errorText.includes('userRateLimitExceeded');

      if (isRateLimit && retryCount < 2) {
        const delayMs = Math.pow(2, retryCount + 1) * 800;
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        return this.requestJson<T>(url, init, retryCount + 1);
      }

      if (isRateLimit || errorText.includes('quotaExceeded') || errorText.includes('storageQuotaExceeded')) {
        throw new DriveApiError(
          'Kuota API atau kapasitas penyimpanan Google Drive terlampaui. Coba lagi beberapa saat atau periksa penyimpanan Drive Anda.',
          response.status,
          'QUOTA_EXCEEDED'
        );
      }

      throw new DriveApiError(
        'Akses ke folder atau file Google Drive ditolak. Pastikan akun memiliki izin yang sesuai.',
        403,
        'PERMISSION_DENIED'
      );
    }

    if (response.status === 404) {
      throw new DriveApiError(
        'Folder atau file tidak ditemukan di Google Drive, atau akses telah dicabut.',
        404,
        'NOT_FOUND'
      );
    }

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      let parsedMsg = 'Permintaan ke Google Drive gagal diproses.';
      try {
        const parsed = JSON.parse(detail);
        if (parsed?.error?.message) {
          parsedMsg = `Google Drive menolak permintaan: ${parsed.error.message}`;
        }
      } catch {
        // gunakan pesan bawaan
      }
      throw new DriveApiError(parsedMsg, response.status, 'UNKNOWN');
    }

    return (await response.json()) as T;
  }

  public async listFiles(params: {
    q: string;
    fields?: string;
    pageSize?: number;
    pageToken?: string;
    orderBy?: string;
  }): Promise<DriveFileListResponse> {
    const query = new URLSearchParams();
    query.set('q', params.q);
    query.set(
      'fields',
      params.fields ||
        'nextPageToken,files(id,name,mimeType,size,createdTime,modifiedTime,parents,thumbnailLink,webViewLink,md5Checksum,imageMediaMetadata,capabilities(canAddChildren,canListChildren,canEdit),appProperties)'
    );
    query.set('pageSize', String(params.pageSize ?? 100));
    query.set('spaces', 'drive');
    query.set('supportsAllDrives', 'true');
    query.set('includeItemsFromAllDrives', 'true');
    if (params.pageToken) query.set('pageToken', params.pageToken);
    if (params.orderBy) query.set('orderBy', params.orderBy);

    return this.requestJson<DriveFileListResponse>(`${DRIVE_API_BASE}/files?${query.toString()}`);
  }

  public async getAccountStorageQuota(forceRefresh = false): Promise<DriveStorageQuota> {
    const now = Date.now();
    if (
      !forceRefresh &&
      this.cachedQuota &&
      now - this.cachedQuota.fetchedAt < GoogleDriveServiceImpl.QUOTA_CACHE_TTL_MS
    ) {
      return this.cachedQuota.data;
    }

    if (this.quotaPromise && !forceRefresh) {
      return this.quotaPromise;
    }

    this.quotaPromise = (async () => {
      try {
        const data = await this.requestJson<{
          user?: {
            displayName?: string;
            emailAddress?: string;
            photoLink?: string;
          };
          storageQuota?: {
            limit?: string;
            usage?: string;
            usageInDrive?: string;
            usageInDriveTrash?: string;
          };
        }>(`${DRIVE_API_BASE}/about?fields=user,storageQuota`);

        const q = data.storageQuota;
        const limit = q?.limit ? Number.parseInt(q.limit, 10) : undefined;
        const usage = q?.usage ? Number.parseInt(q.usage, 10) : 0;
        const usageInDrive = q?.usageInDrive ? Number.parseInt(q.usageInDrive, 10) : undefined;
        const usageInDriveTrash = q?.usageInDriveTrash
          ? Number.parseInt(q.usageInDriveTrash, 10)
          : undefined;
        const available = limit !== undefined ? Math.max(0, limit - usage) : undefined;

        let percentUsed = 0;
        let status: StorageStatusLevel = 'normal';

        if (limit && limit > 0) {
          percentUsed = Math.min(100, Math.round((usage / limit) * 1000) / 10);
          if (percentUsed >= 100) {
            status = 'full';
          } else if (percentUsed >= 90) {
            status = 'critical';
          } else if (percentUsed >= 75) {
            status = 'warning';
          } else {
            status = 'normal';
          }
        } else {
          percentUsed = 0;
          status = 'normal';
        }

        const result: DriveStorageQuota = {
          limit,
          usage,
          usageInDrive,
          usageInDriveTrash,
          available,
          percentUsed,
          status,
          usageFormattedGB: formatBytesToGB(usage),
          limitFormattedGB: limit !== undefined ? formatBytesToGB(limit) : 'Tak Terbatas',
          availableFormattedGB: available !== undefined ? formatBytesToGB(available) : 'Tersedia',
          percentFormatted: limit !== undefined ? `${percentUsed.toFixed(1)}%` : '—',
          user: data.user
            ? {
                displayName: data.user.displayName,
                emailAddress: data.user.emailAddress,
                photoLink: data.user.photoLink,
              }
            : undefined,
          lastFetchedAt: Date.now(),
        };

        this.cachedQuota = { data: result, fetchedAt: Date.now() };
        return result;
      } finally {
        this.quotaPromise = null;
      }
    })();

    return this.quotaPromise;
  }

  public invalidateQuotaCache(): void {
    this.cachedQuota = null;
  }

  public async getFileMetadata(fileId: string, fields?: string): Promise<DriveFile> {
    const query = new URLSearchParams();
    query.set(
      'fields',
      fields ||
        'id,name,mimeType,size,createdTime,modifiedTime,parents,thumbnailLink,webViewLink,md5Checksum,imageMediaMetadata,capabilities(canAddChildren,canListChildren,canEdit),appProperties'
    );
    query.set('supportsAllDrives', 'true');
    return this.requestJson<DriveFile>(`${DRIVE_API_BASE}/files/${encodeURIComponent(fileId)}?${query.toString()}`);
  }

  public async createFolder(name: string, parentId?: string): Promise<DriveFile> {
    const body: Record<string, unknown> = {
      name,
      mimeType: FOLDER_MIME_TYPE,
    };
    if (parentId && parentId !== 'root') {
      body.parents = [parentId];
    }

    const query = new URLSearchParams({
      fields: 'id,name,mimeType,parents,createdTime,modifiedTime,capabilities(canAddChildren,canListChildren)',
      supportsAllDrives: 'true',
    });

    return this.requestJson<DriveFile>(`${DRIVE_API_BASE}/files?${query.toString()}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  }

  public async fetchMediaBlob(fileId: string, signal?: AbortSignal): Promise<Blob> {
    const token = this.requireToken();
    const url = `${DRIVE_API_BASE}/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`;
    let response: Response;
    try {
      response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
        signal,
      });
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        throw err;
      }
      throw new DriveApiError(
        'Gagal mengunduh gambar dari Google Drive karena gangguan jaringan.',
        0,
        'NETWORK_ERROR'
      );
    }

    if (response.status === 401) {
      AuthenticationService.markTokenExpired();
      throw new DriveApiError('Token akses berakhir saat memuat gambar.', 401, 'UNAUTHORIZED');
    }

    if (!response.ok) {
      throw new DriveApiError(
        'Gambar tidak dapat dimuat dari Google Drive.',
        response.status,
        response.status === 404 ? 'NOT_FOUND' : 'UNKNOWN'
      );
    }

    return response.blob();
  }

  public async initiateResumableUpload(params: {
    fileName: string;
    mimeType: string;
    fileSize: number;
    parentId: string;
    contentHash?: string;
  }): Promise<string> {
    const token = this.requireToken();
    const metadata: Record<string, unknown> = {
      name: params.fileName,
      mimeType: params.mimeType,
      parents: [params.parentId],
    };

    if (params.contentHash) {
      metadata.appProperties = {
        contentSha256: params.contentHash,
      };
    }

    const url = `${DRIVE_UPLOAD_BASE}/files?uploadType=resumable&supportsAllDrives=true&fields=id,name,size,mimeType,md5Checksum,parents,createdTime,modifiedTime,thumbnailLink,appProperties`;

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json; charset=UTF-8',
          'X-Upload-Content-Type': params.mimeType,
          'X-Upload-Content-Length': String(params.fileSize),
        },
        body: JSON.stringify(metadata),
      });
    } catch {
      throw new DriveApiError(
        'Koneksi jaringan terputus saat memulai sesi upload resumable.',
        0,
        'NETWORK_ERROR'
      );
    }

    if (response.status === 401) {
      AuthenticationService.markTokenExpired();
      throw new DriveApiError(
        'Token akses Google Drive berakhir. Silakan autentikasi ulang.',
        401,
        'UNAUTHORIZED'
      );
    }

    if (response.status === 403 || response.status === 429) {
      throw new DriveApiError(
        'Izin upload ditolak atau kuota Google Drive penuh.',
        response.status,
        response.status === 429 ? 'QUOTA_EXCEEDED' : 'PERMISSION_DENIED'
      );
    }

    if (!response.ok) {
      throw new DriveApiError(
        'Gagal menginisialisasi sesi upload ke Google Drive.',
        response.status,
        'UNKNOWN'
      );
    }

    const sessionUri = response.headers.get('Location');
    if (!sessionUri) {
      throw new DriveApiError(
        'Google Drive tidak mengembalikan URL sesi upload resumable.',
        500,
        'UNKNOWN'
      );
    }

    return sessionUri;
  }

  public async queryResumableSessionStatus(
    sessionUri: string,
    totalSize: number
  ): Promise<
    | { status: 'incomplete'; nextByteOffset: number }
    | { status: 'completed'; file: DriveFile }
    | { status: 'expired' }
  > {
    let response: Response;
    try {
      response = await fetch(sessionUri, {
        method: 'PUT',
        headers: {
          'Content-Range': `bytes */${totalSize}`,
        },
      });
    } catch {
      throw new DriveApiError(
        'Tidak dapat memeriksa status sesi upload karena koneksi terputus.',
        0,
        'NETWORK_ERROR'
      );
    }

    if (response.status === 308) {
      const rangeHeader = response.headers.get('Range');
      if (!rangeHeader) {
        return { status: 'incomplete', nextByteOffset: 0 };
      }
      const match = rangeHeader.match(/bytes=0-(\d+)/);
      const lastByte = match ? Number.parseInt(match[1], 10) : -1;
      return { status: 'incomplete', nextByteOffset: lastByte + 1 };
    }

    if (response.status === 200 || response.status === 201) {
      const file = (await response.json()) as DriveFile;
      return { status: 'completed', file };
    }

    if (response.status === 404 || response.status === 410) {
      return { status: 'expired' };
    }

    if (response.status === 401) {
      AuthenticationService.markTokenExpired();
      throw new DriveApiError('Token berakhir saat memvalidasi sesi upload.', 401, 'UNAUTHORIZED');
    }

    return { status: 'expired' };
  }

  public uploadChunkWithProgress(params: {
    sessionUri: string;
    chunk: Blob;
    startByte: number;
    endByte: number;
    totalSize: number;
    mimeType: string;
    onProgress: (loadedBytesInChunk: number) => void;
    onXhrCreated?: (xhr: XMLHttpRequest) => void;
  }): Promise<
    | { status: 'incomplete'; nextByteOffset: number }
    | { status: 'completed'; file: DriveFile }
  > {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      params.onXhrCreated?.(xhr);

      xhr.open('PUT', params.sessionUri, true);
      xhr.setRequestHeader('Content-Type', params.mimeType);
      xhr.setRequestHeader(
        'Content-Range',
        `bytes ${params.startByte}-${params.endByte}/${params.totalSize}`
      );

      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          params.onProgress(event.loaded);
        }
      };

      xhr.onload = () => {
        if (xhr.status === 308) {
          const rangeHeader = xhr.getResponseHeader('Range');
          let nextOffset = params.endByte + 1;
          if (rangeHeader) {
            const match = rangeHeader.match(/bytes=0-(\d+)/);
            if (match) {
              nextOffset = Number.parseInt(match[1], 10) + 1;
            }
          }
          resolve({ status: 'incomplete', nextByteOffset: nextOffset });
          return;
        }

        if (xhr.status === 200 || xhr.status === 201) {
          try {
            const file = JSON.parse(xhr.responseText) as DriveFile;
            resolve({ status: 'completed', file });
          } catch {
            reject(
              new DriveApiError(
                'Respons penyelesaian upload dari Google Drive tidak valid.',
                xhr.status,
                'UNKNOWN'
              )
            );
          }
          return;
        }

        if (xhr.status === 404 || xhr.status === 410) {
          reject(
            new DriveApiError(
              'Sesi upload resumable telah kedaluwarsa. Sistem akan memulai ulang sesi dengan aman.',
              xhr.status,
              'SESSION_EXPIRED'
            )
          );
          return;
        }

        if (xhr.status === 401) {
          AuthenticationService.markTokenExpired();
          reject(
            new DriveApiError(
              'Token akses Google Drive kedaluwarsa saat mengupload.',
              401,
              'UNAUTHORIZED'
            )
          );
          return;
        }

        if (xhr.status === 403 || xhr.status === 429) {
          reject(
            new DriveApiError(
              'Kuota Google Drive terlampaui atau izin upload ditolak.',
              xhr.status,
              xhr.status === 429 ? 'QUOTA_EXCEEDED' : 'PERMISSION_DENIED'
            )
          );
          return;
        }

        reject(
          new DriveApiError(
            `Upload potongan gagal dengan kode status ${xhr.status}.`,
            xhr.status,
            'UNKNOWN'
          )
        );
      };

      xhr.onerror = () => {
        reject(
          new DriveApiError(
            'Koneksi internet terputus saat mengirim data foto ke Google Drive.',
            0,
            'NETWORK_ERROR'
          )
        );
      };

      xhr.onabort = () => {
        reject(new DOMException('Upload dibatalkan atau dijeda', 'AbortError'));
      };

      xhr.send(params.chunk);
    });
  }

  public async openGoogleFolderPicker(): Promise<{ id: string; name: string } | null> {
    const token = this.requireToken();

    const gapiObj = (window as unknown as {
      gapi?: {
        load: (api: string, cb: () => void) => void;
      };
      google?: {
        picker?: {
          PickerBuilder: new () => {
            addView: (view: unknown) => unknown;
            setOAuthToken: (t: string) => unknown;
            setCallback: (cb: (data: PickerCallbackData) => void) => unknown;
            setOrigin: (origin: string) => unknown;
            setLocale: (locale: string) => unknown;
            build: () => { setVisible: (v: boolean) => void };
          };
          DocsView: new (viewId: unknown) => {
            setIncludeFolders: (v: boolean) => unknown;
            setSelectFolderEnabled: (v: boolean) => unknown;
            setMimeTypes: (mime: string) => unknown;
          };
          ViewId: { FOLDERS: unknown; DOCS: unknown };
          Action: { PICKED: string; CANCEL: string };
        };
      };
    });

    if (!gapiObj.gapi) {
      throw new Error(
        'Skrip Google Picker belum dimuat oleh browser. Gunakan pemilih folder langsung di aplikasi.'
      );
    }

    await new Promise<void>((resolve, reject) => {
      try {
        gapiObj.gapi!.load('picker', () => resolve());
      } catch {
        reject(new Error('Gagal memuat modul Google Picker.'));
      }
    });

    const pickerApi = gapiObj.google?.picker;
    if (!pickerApi) {
      throw new Error('Google Picker tidak tersedia di browser saat ini.');
    }

    const pickerOrigin =
      window.location.ancestorOrigins && window.location.ancestorOrigins.length > 0
        ? window.location.ancestorOrigins[window.location.ancestorOrigins.length - 1]
        : window.location.origin;

    return new Promise((resolve) => {
      const folderView = new pickerApi.DocsView(pickerApi.ViewId.FOLDERS);
      folderView.setIncludeFolders(true);
      folderView.setSelectFolderEnabled(true);
      folderView.setMimeTypes(FOLDER_MIME_TYPE);

      const builder = new pickerApi.PickerBuilder() as unknown as {
        addView: (v: unknown) => typeof builder;
        setOAuthToken: (t: string) => typeof builder;
        setCallback: (cb: (data: PickerCallbackData) => void) => typeof builder;
        setOrigin: (origin: string) => typeof builder;
        setLocale: (locale: string) => typeof builder;
        build: () => { setVisible: (v: boolean) => void };
      };

      const picker = builder
        .addView(folderView)
        .setOAuthToken(token)
        .setLocale('id')
        .setOrigin(pickerOrigin)
        .setCallback((data: PickerCallbackData) => {
          if (data.action === pickerApi.Action.PICKED && data.docs && data.docs.length > 0) {
            const doc = data.docs[0];
            resolve({ id: doc.id, name: doc.name });
          } else if (data.action === pickerApi.Action.CANCEL) {
            resolve(null);
          }
        })
        .build();

      picker.setVisible(true);
    });
  }
}

interface PickerCallbackData {
  action: string;
  docs?: Array<{ id: string; name: string }>;
}

export const GoogleDriveService = new GoogleDriveServiceImpl();
