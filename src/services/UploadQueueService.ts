import { BackupActivity, StorageQuotaInfo, UploadTask } from '../types';

const DB_NAME = 'GDrivePhotoBackupDB';
const DB_VERSION = 1;
const TASKS_STORE = 'upload_tasks';
const BLOBS_STORE = 'file_blobs';
const ACTIVITY_STORE = 'backup_activity';

interface StoredBlobRecord {
  taskId: string;
  blob: Blob;
  savedAt: number;
}

class UploadQueueServiceImpl {
  private dbPromise: Promise<IDBDatabase> | null = null;
  private indexedDbAvailable = typeof indexedDB !== 'undefined';

  private openDb(): Promise<IDBDatabase> {
    if (!this.indexedDbAvailable) {
      return Promise.reject(new Error('IndexedDB tidak didukung oleh browser ini.'));
    }

    if (this.dbPromise) return this.dbPromise;

    this.dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(TASKS_STORE)) {
          const store = db.createObjectStore(TASKS_STORE, { keyPath: 'id' });
          store.createIndex('createdAt', 'createdAt', { unique: false });
          store.createIndex('status', 'status', { unique: false });
        }
        if (!db.objectStoreNames.contains(BLOBS_STORE)) {
          db.createObjectStore(BLOBS_STORE, { keyPath: 'taskId' });
        }
        if (!db.objectStoreNames.contains(ACTIVITY_STORE)) {
          const activityStore = db.createObjectStore(ACTIVITY_STORE, { keyPath: 'id' });
          activityStore.createIndex('timestamp', 'timestamp', { unique: false });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => {
        this.indexedDbAvailable = false;
        reject(request.error || new Error('Gagal membuka penyimpanan lokal IndexedDB.'));
      };
    });

    return this.dbPromise;
  }

  public async checkStorageQuota(): Promise<StorageQuotaInfo> {
    if (typeof navigator === 'undefined' || !navigator.storage?.estimate) {
      return {
        supported: false,
        usageBytes: 0,
        quotaBytes: 0,
        availableBytes: 0,
      };
    }

    try {
      const estimate = await navigator.storage.estimate();
      const usageBytes = estimate.usage ?? 0;
      const quotaBytes = estimate.quota ?? 0;
      return {
        supported: true,
        usageBytes,
        quotaBytes,
        availableBytes: Math.max(0, quotaBytes - usageBytes),
      };
    } catch {
      return {
        supported: false,
        usageBytes: 0,
        quotaBytes: 0,
        availableBytes: 0,
      };
    }
  }

  public async canPersistBytes(_requiredBytes: number): Promise<{
    canPersist: boolean;
    quota: StorageQuotaInfo;
    warningMessage?: string;
  }> {
    const quota = await this.checkStorageQuota();
    if (!this.indexedDbAvailable) {
      return {
        canPersist: false,
        quota,
        warningMessage:
          'Browser tidak mendukung IndexedDB. File tetap dapat diupload selama tab aktif, namun perlu dipilih ulang jika halaman dimuat ulang.',
      };
    }

    // Untuk koleksi media berskala besar (hingga 300GB+), antrean didesain metadata-only.
    // File biner asli tidak diduplikasi ke IndexedDB agar tidak menghabiskan kuota disk browser.
    return {
      canPersist: false,
      quota,
      warningMessage: undefined,
    };
  }

  public async saveTask(task: UploadTask): Promise<void> {
    if (!this.indexedDbAvailable) return;
    try {
      const db = await this.openDb();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(TASKS_STORE, 'readwrite');
        tx.objectStore(TASKS_STORE).put(task);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch {
      // Jangan gagalkan upload jika persistensi metadata sementara terganggu
    }
  }

  /**
   * Simpan sekumpulan task metadata dalam satu transaksi tunggal
   * untuk efisiensi tinggi pada antrean ribuan file (1.000 - 10.000+ file)
   */
  public async saveTasksBatch(tasks: UploadTask[]): Promise<void> {
    if (!this.indexedDbAvailable || tasks.length === 0) return;
    try {
      const db = await this.openDb();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(TASKS_STORE, 'readwrite');
        const store = tx.objectStore(TASKS_STORE);
        for (const task of tasks) {
          store.put(task);
        }
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch {
      // Abaikan error batch
    }
  }

  public async deleteTask(taskId: string): Promise<void> {
    if (!this.indexedDbAvailable) return;
    try {
      const db = await this.openDb();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction([TASKS_STORE, BLOBS_STORE], 'readwrite');
        tx.objectStore(TASKS_STORE).delete(taskId);
        tx.objectStore(BLOBS_STORE).delete(taskId);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch {
      // Abaikan error pembersihan
    }
  }

  public async getAllTasks(): Promise<UploadTask[]> {
    if (!this.indexedDbAvailable) return [];
    try {
      const db = await this.openDb();
      return await new Promise<UploadTask[]>((resolve, reject) => {
        const tx = db.transaction(TASKS_STORE, 'readonly');
        const req = tx.objectStore(TASKS_STORE).getAll();
        req.onsuccess = () => {
          const items = (req.result as UploadTask[]) || [];
          items.sort((a, b) => a.createdAt - b.createdAt);
          resolve(items);
        };
        req.onerror = () => reject(req.error);
      });
    } catch {
      return [];
    }
  }

  public async saveFileBlob(taskId: string, blob: Blob): Promise<boolean> {
    if (!this.indexedDbAvailable) return false;
    try {
      const db = await this.openDb();
      const record: StoredBlobRecord = {
        taskId,
        blob,
        savedAt: Date.now(),
      };
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(BLOBS_STORE, 'readwrite');
        tx.objectStore(BLOBS_STORE).put(record);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      return true;
    } catch {
      return false;
    }
  }

  public async getFileBlob(taskId: string): Promise<Blob | null> {
    if (!this.indexedDbAvailable) return null;
    try {
      const db = await this.openDb();
      return await new Promise<Blob | null>((resolve, reject) => {
        const tx = db.transaction(BLOBS_STORE, 'readonly');
        const req = tx.objectStore(BLOBS_STORE).get(taskId);
        req.onsuccess = () => {
          const record = req.result as StoredBlobRecord | undefined;
          resolve(record?.blob ?? null);
        };
        req.onerror = () => reject(req.error);
      });
    } catch {
      return null;
    }
  }

  public async hasFileBlob(taskId: string): Promise<boolean> {
    if (!this.indexedDbAvailable) return false;
    try {
      const db = await this.openDb();
      return await new Promise<boolean>((resolve, reject) => {
        const tx = db.transaction(BLOBS_STORE, 'readonly');
        const req = tx.objectStore(BLOBS_STORE).getKey(taskId);
        req.onsuccess = () => resolve(req.result !== undefined);
        req.onerror = () => reject(req.error);
      });
    } catch {
      return false;
    }
  }

  public async deleteFileBlob(taskId: string): Promise<void> {
    if (!this.indexedDbAvailable) return;
    try {
      const db = await this.openDb();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(BLOBS_STORE, 'readwrite');
        tx.objectStore(BLOBS_STORE).delete(taskId);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch {
      // Abaikan error
    }
  }

  public async recordActivity(activity: BackupActivity): Promise<void> {
    if (!this.indexedDbAvailable) return;
    try {
      const db = await this.openDb();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(ACTIVITY_STORE, 'readwrite');
        tx.objectStore(ACTIVITY_STORE).put(activity);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch {
      // Abaikan
    }
  }

  public async getRecentActivities(limit = 15): Promise<BackupActivity[]> {
    if (!this.indexedDbAvailable) return [];
    try {
      const db = await this.openDb();
      return await new Promise<BackupActivity[]>((resolve, reject) => {
        const tx = db.transaction(ACTIVITY_STORE, 'readonly');
        const req = tx.objectStore(ACTIVITY_STORE).getAll();
        req.onsuccess = () => {
          const all = (req.result as BackupActivity[]) || [];
          all.sort((a, b) => b.timestamp - a.timestamp);
          resolve(all.slice(0, limit));
        };
        req.onerror = () => reject(req.error);
      });
    } catch {
      return [];
    }
  }
}

export const UploadQueueService = new UploadQueueServiceImpl();
