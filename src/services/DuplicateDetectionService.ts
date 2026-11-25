import { DriveFile, DuplicateMatch } from '../types';
import { escapeDriveQueryValue, GoogleDriveService } from './GoogleDriveService';

interface PendingHashRequest {
  resolve: (hash: string) => void;
  reject: (err: Error) => void;
}

class DuplicateDetectionServiceImpl {
  private worker: Worker | null = null;
  private workerBroken = false;
  private pending = new Map<string, PendingHashRequest>();
  private reqCounter = 0;

  private getWorker(): Worker | null {
    if (this.workerBroken || typeof Worker === 'undefined') return null;
    if (this.worker) return this.worker;

    try {
      this.worker = new Worker(new URL('../workers/hashWorker.ts', import.meta.url), {
        type: 'module',
      });
      this.worker.onmessage = (event: MessageEvent<{ id: string; hash?: string; error?: string }>) => {
        const { id, hash, error } = event.data;
        const entry = this.pending.get(id);
        if (!entry) return;
        this.pending.delete(id);
        if (hash) {
          entry.resolve(hash);
        } else {
          entry.reject(new Error(error || 'Gagal menghitung hash SHA-256'));
        }
      };
      this.worker.onerror = () => {
        this.workerBroken = true;
        this.pending.forEach((p) => p.reject(new Error('Web Worker terhenti')));
        this.pending.clear();
        this.worker?.terminate();
        this.worker = null;
      };
      return this.worker;
    } catch {
      this.workerBroken = true;
      return null;
    }
  }

  public async computeSha256(file: Blob): Promise<string | undefined> {
    // Hindari memuat file besar (>20MB) ke memory heap (arrayBuffer)
    // Untuk file video & media besar, Google Drive API mendeteksi duplikat via nama persis dan ukuran byte
    if (file.size > 20 * 1024 * 1024) {
      return undefined;
    }

    const worker = this.getWorker();
    if (worker) {
      try {
        return await new Promise<string>((resolve, reject) => {
          const id = `h-${++this.reqCounter}`;
          this.pending.set(id, { resolve, reject });
          worker.postMessage({ id, file });
        });
      } catch {
        // Fallback ke thread utama jika Web Worker gagal
      }
    }

    if (typeof crypto !== 'undefined' && crypto.subtle) {
      try {
        const buffer = await file.arrayBuffer();
        const digest = await crypto.subtle.digest('SHA-256', buffer);
        return Array.from(new Uint8Array(digest))
          .map((b) => b.toString(16).padStart(2, '0'))
          .join('');
      } catch {
        return undefined;
      }
    }

    return undefined;
  }

  public async detectDuplicateInFolder(params: {
    folderId: string;
    fileName: string;
    fileSize: number;
    contentHash?: string;
    existingDriveFileId?: string;
  }): Promise<DuplicateMatch | null> {
    // 1. Jika ada Drive File ID yang sebelumnya sudah terunggah, verifikasi keberadaannya
    if (params.existingDriveFileId) {
      try {
        const existing = await GoogleDriveService.getFileMetadata(params.existingDriveFileId);
        if (existing?.id) {
          return {
            existingFile: existing,
            confidence: 'exact_hash',
            reason: 'File ini sudah tercatat terunggah dengan ID Google Drive yang sama.',
          };
        }
      } catch {
        // Lanjutkan pemeriksaan folder
      }
    }

    // 2. Cek berdasarkan contentHash (appProperties.contentSha256) di folder tujuan
    if (params.contentHash) {
      try {
        const hashRes = await GoogleDriveService.listFiles({
          q: `'${escapeDriveQueryValue(params.folderId)}' in parents and appProperties has { key='contentSha256' and value='${escapeDriveQueryValue(params.contentHash)}' } and trashed = false`,
          pageSize: 5,
        });
        if (hashRes.files && hashRes.files.length > 0) {
          return {
            existingFile: hashRes.files[0],
            confidence: 'exact_hash',
            reason: 'Hash konten SHA-256 identik dengan file yang sudah ada di folder tujuan.',
          };
        }
      } catch {
        // Fallback ke pencarian nama dan ukuran
      }
    }

    // 3. Cek berdasarkan nama file di folder tujuan (nama saja bukan bukti mutlak!)
    const nameRes = await GoogleDriveService.listFiles({
      q: `'${escapeDriveQueryValue(params.folderId)}' in parents and name = '${escapeDriveQueryValue(params.fileName)}' and trashed = false`,
      pageSize: 10,
    });

    const candidates: DriveFile[] = nameRes.files || [];
    if (candidates.length === 0) return null;

    const exactSizeMatch = candidates.find(
      (f) => Number.parseInt(f.size || '0', 10) === params.fileSize
    );

    if (exactSizeMatch) {
      return {
        existingFile: exactSizeMatch,
        confidence: 'name_and_size',
        reason:
          'Nama file dan ukuran byte sama dengan file yang sudah ada di folder tujuan. Konten sangat mungkin identik.',
      };
    }

    return {
      existingFile: candidates[0],
      confidence: 'name_only',
      reason:
        'Terdapat file dengan nama sama, tetapi ukurannya berbeda. Nama file saja bukan bukti duplikat konten.',
    };
  }
}

export const DuplicateDetectionService = new DuplicateDetectionServiceImpl();
