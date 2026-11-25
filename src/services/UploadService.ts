import {
  BackupActivity,
  DuplicateResolution,
  UploadTask,
  UploadTaskStatus,
} from '../types';
import {
  buildCopyFileName,
  extractRelativeFolderPath,
  generateTaskId,
  inferMediaMimeType,
  isSupportedMediaFile,
  isValidImageFile,
  isValidVideoFile,
} from '../utils/formatters';
import { AuthenticationService } from './AuthenticationService';
import { DuplicateDetectionService } from './DuplicateDetectionService';
import { FolderService } from './FolderService';
import { DriveApiError, GoogleDriveService } from './GoogleDriveService';
import { SettingsService } from './SettingsService';
import { UploadQueueService } from './UploadQueueService';

// Ukuran potongan 2 MB (kelipatan tepat dari 256 KB sesuai spesifikasi Google Drive Resumable Upload)
const CHUNK_SIZE_BYTES = 2 * 1024 * 1024;
const SESSION_MAX_AGE_MS = 6 * 24 * 60 * 60 * 1000; // Sesi Drive valid maksimal ~1 minggu

export type ConcurrencyMode = 'saver' | 'balanced' | 'speed';

export interface UploadQueueSnapshot {
  tasks: UploadTask[];
  activities: BackupActivity[];
  isOnline: boolean;
  isGlobalPaused: boolean;
  activeCount: number;
  waitingCount: number;
  completedCount: number;
  failedCount: number;
  needsAttentionCount: number;
  totalBytes: number;
  uploadedBytes: number;
  overallProgress: number;
  storageWarning: string | null;
  transferSpeedBytesPerSec: number;
  estimatedRemainingSeconds: number | null;
  concurrencyMode: ConcurrencyMode;
  effectiveConcurrency: number;
}

type QueueListener = (snapshot: UploadQueueSnapshot) => void;
type UploadCompletedCallback = () => void;

class UploadServiceImpl {
  private tasks = new Map<string, UploadTask>();
  private memoryFiles = new Map<string, Blob>();
  private activeXhrs = new Map<string, XMLHttpRequest>();
  private activeTaskIds = new Set<string>();
  private activities: BackupActivity[] = [];
  private listeners = new Set<QueueListener>();
  private completionCallbacks = new Set<UploadCompletedCallback>();
  private isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
  private isGlobalPaused = false;
  private storageWarning: string | null = null;
  private batchDuplicateOverride: DuplicateResolution | null = null;
  private isInitialized = false;
  private notifyBatchStartedSent = false;
  private concurrencyMode: ConcurrencyMode = 'balanced';
  private adaptiveBackoffUntil = 0;
  private lastSpeedSampleTime = Date.now();
  private lastSpeedSampleUploadedBytes = 0;
  private currentTransferSpeedBytesPerSec = 0;

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', this.handleNetworkOnline);
      window.addEventListener('offline', this.handleNetworkOffline);
    }

    SettingsService.subscribe(() => {
      this.pumpQueue();
    });
  }

  public async initializeFromStorage(): Promise<UploadTask[]> {
    if (this.isInitialized) {
      return Array.from(this.tasks.values());
    }

    const [savedTasks, savedActivities] = await Promise.all([
      UploadQueueService.getAllTasks(),
      UploadQueueService.getRecentActivities(20),
    ]);

    this.tasks.clear();
    for (const task of savedTasks) {
      this.tasks.set(task.id, task);
    }
    this.activities = savedActivities;
    this.isInitialized = true;
    this.emit();
    return savedTasks;
  }

  public subscribe(listener: QueueListener): () => void {
    this.listeners.add(listener);
    listener(this.getSnapshot());
    return () => this.listeners.delete(listener);
  }

  public onUploadCompleted(callback: UploadCompletedCallback): () => void {
    this.completionCallbacks.add(callback);
    return () => this.completionCallbacks.delete(callback);
  }

  public getSnapshot(): UploadQueueSnapshot {
    const taskList = Array.from(this.tasks.values()).sort((a, b) => b.createdAt - a.createdAt);

    let activeCount = 0;
    let waitingCount = 0;
    let completedCount = 0;
    let failedCount = 0;
    let needsAttentionCount = 0;
    let totalBytes = 0;
    let uploadedBytes = 0;

    for (const t of taskList) {
      if (t.status === 'uploading' || t.status === 'checking_duplicate') {
        activeCount += 1;
      } else if (t.status === 'queued') {
        waitingCount += 1;
      } else if (t.status === 'completed') {
        completedCount += 1;
      } else if (t.status === 'failed') {
        failedCount += 1;
      } else if (
        t.status === 'duplicate_pending' ||
        t.status === 'needs_file' ||
        t.status === 'waiting_auth' ||
        t.status === 'interrupted'
      ) {
        needsAttentionCount += 1;
      }

      if (t.status !== 'cancelled' && t.status !== 'skipped') {
        totalBytes += t.fileSize;
        uploadedBytes += t.status === 'completed' ? t.fileSize : Math.min(t.bytesUploaded, t.fileSize);
      }
    }

    const overallProgress =
      totalBytes > 0 ? Math.min(100, Math.round((uploadedBytes / totalBytes) * 100)) : 0;

    // Kalkulasi rolling speed (byte per detik) & estimasi sisa waktu
    const now = Date.now();
    const timeDelta = (now - this.lastSpeedSampleTime) / 1000;
    if (timeDelta >= 1) {
      const bytesDelta = Math.max(0, uploadedBytes - this.lastSpeedSampleUploadedBytes);
      const instantSpeed = bytesDelta / timeDelta;
      this.currentTransferSpeedBytesPerSec =
        activeCount > 0
          ? Math.round(this.currentTransferSpeedBytesPerSec * 0.4 + instantSpeed * 0.6)
          : 0;
      this.lastSpeedSampleTime = now;
      this.lastSpeedSampleUploadedBytes = uploadedBytes;
    } else if (activeCount === 0) {
      this.currentTransferSpeedBytesPerSec = 0;
    }

    const remainingBytes = Math.max(0, totalBytes - uploadedBytes);
    const estimatedRemainingSeconds =
      this.currentTransferSpeedBytesPerSec > 0 && remainingBytes > 0
        ? Math.round(remainingBytes / this.currentTransferSpeedBytesPerSec)
        : null;

    const baseLimit =
      this.concurrencyMode === 'saver' ? 1 : this.concurrencyMode === 'speed' ? 4 : 2;
    const effectiveConcurrency = now < this.adaptiveBackoffUntil ? 1 : baseLimit;

    return {
      tasks: taskList,
      activities: [...this.activities],
      isOnline: this.isOnline,
      isGlobalPaused: this.isGlobalPaused,
      activeCount,
      waitingCount,
      completedCount,
      failedCount,
      needsAttentionCount,
      totalBytes,
      uploadedBytes,
      overallProgress,
      storageWarning: this.storageWarning,
      transferSpeedBytesPerSec: this.currentTransferSpeedBytesPerSec,
      estimatedRemainingSeconds,
      concurrencyMode: this.concurrencyMode,
      effectiveConcurrency,
    };
  }

  public setConcurrencyMode(mode: ConcurrencyMode): void {
    this.concurrencyMode = mode;
    this.emit();
    this.pumpQueue();
  }

  public getConcurrencyMode(): ConcurrencyMode {
    return this.concurrencyMode;
  }

  public getTask(taskId: string): UploadTask | undefined {
    return this.tasks.get(taskId);
  }

  public async updateTaskDirect(task: UploadTask): Promise<void> {
    this.tasks.set(task.id, task);
    await UploadQueueService.saveTask(task);
    this.emit();
  }

  public async enqueueFiles(params: {
    files: File[];
    destinationFolderId: string;
    destinationFolderName: string;
    preserveRelativePaths?: boolean;
    mediaCategory?: 'photo' | 'video' | 'any';
  }): Promise<{
    enqueuedCount: number;
    rejectedFiles: Array<{ name: string; reason: string }>;
    storageWarning?: string;
  }> {
    const validFiles: File[] = [];
    const rejectedFiles: Array<{ name: string; reason: string }> = [];
    const category = params.mediaCategory || 'any';

    for (const file of params.files) {
      if (file.size <= 0) {
        rejectedFiles.push({
          name: file.name,
          reason: 'File kosong (0 byte) dan tidak dapat dicadangkan.',
        });
        continue;
      }

      if (category === 'photo' && !isValidImageFile(file)) {
        rejectedFiles.push({
          name: file.name,
          reason: 'Format file bukan foto/gambar yang didukung.',
        });
        continue;
      }

      if (category === 'video' && !isValidVideoFile(file)) {
        rejectedFiles.push({
          name: file.name,
          reason: 'Format file bukan video yang didukung.',
        });
        continue;
      }

      if (category === 'any' && !isSupportedMediaFile(file)) {
        rejectedFiles.push({
          name: file.name,
          reason: 'Format file bukan foto atau video yang didukung.',
        });
        continue;
      }

      validFiles.push(file);
    }

    if (validFiles.length === 0) {
      return { enqueuedCount: 0, rejectedFiles };
    }

    const totalBatchBytes = validFiles.reduce((acc, f) => acc + f.size, 0);
    const quotaCheck = await UploadQueueService.canPersistBytes(totalBatchBytes);
    this.storageWarning = quotaCheck.warningMessage || null;
    this.batchDuplicateOverride = null;

    const now = Date.now();
    const newTasks: UploadTask[] = [];

    for (let i = 0; i < validFiles.length; i += 1) {
      const file = validFiles[i];
      const taskId = generateTaskId();
      const relativeFolderPath = params.preserveRelativePaths
        ? extractRelativeFolderPath(file)
        : '';

      // Simpan referensi File/Blob di memori tanpa memuat biner ke IndexedDB
      this.memoryFiles.set(taskId, file);

      const task: UploadTask = {
        id: taskId,
        fileName: file.name,
        fileSize: file.size,
        mimeType: inferMediaMimeType(file),
        destinationFolderId: params.destinationFolderId,
        destinationFolderName: params.destinationFolderName,
        relativeFolderPath,
        status: AuthenticationService.getAccessToken() ? 'queued' : 'waiting_auth',
        progress: 0,
        bytesUploaded: 0,
        retryCount: 0,
        lastError: null,
        createdAt: now + i,
        updatedAt: now + i,
        resumableSessionUri: null,
        hasPersistedBlob: false,
      };

      this.tasks.set(taskId, task);
      newTasks.push(task);
    }

    // Simpan metadata secara batch ke IndexedDB dalam 1 transaksi
    await UploadQueueService.saveTasksBatch(newTasks);

    this.isGlobalPaused = false;
    this.notifyBatchStartedSent = false;
    this.emit();
    this.pumpQueue();

    return {
      enqueuedCount: validFiles.length,
      rejectedFiles,
      storageWarning: quotaCheck.warningMessage,
    };
  }

  public async reattachFileForTask(taskId: string, file: File): Promise<{ ok: boolean; message: string }> {
    const task = this.tasks.get(taskId);
    if (!task) {
      return { ok: false, message: 'Tugas upload tidak ditemukan di antrean.' };
    }
    if (!isSupportedMediaFile(file)) {
      return { ok: false, message: 'File yang dipilih bukan file foto atau video yang valid.' };
    }

    if (file.name !== task.fileName || file.size !== task.fileSize) {
      // Tetap izinkan jika pengguna yakin, namun reset sesi resumable agar byte range konsisten
      task.fileName = file.name;
      task.fileSize = file.size;
      task.mimeType = inferMediaMimeType(file);
      task.resumableSessionUri = null;
      task.bytesUploaded = 0;
      task.progress = 0;
    }

    this.memoryFiles.set(taskId, file);
    const saved = await UploadQueueService.saveFileBlob(taskId, file);
    task.hasPersistedBlob = saved;
    task.status = AuthenticationService.getAccessToken() ? 'queued' : 'waiting_auth';
    task.lastError = null;
    task.updatedAt = Date.now();

    await this.updateTaskDirect(task);
    this.pumpQueue();
    return { ok: true, message: 'File sumber berhasil dilampirkan kembali dan siap diupload.' };
  }

  public pauseTask(taskId: string): void {
    const task = this.tasks.get(taskId);
    if (!task) return;
    if (task.status === 'completed' || task.status === 'cancelled' || task.status === 'skipped') {
      return;
    }

    const xhr = this.activeXhrs.get(taskId);
    if (xhr) {
      xhr.abort();
      this.activeXhrs.delete(taskId);
    }
    this.activeTaskIds.delete(taskId);

    task.status = 'paused';
    task.updatedAt = Date.now();
    void this.updateTaskDirect(task);
  }

  public resumeTask(taskId: string): void {
    const task = this.tasks.get(taskId);
    if (!task) return;
    if (
      task.status === 'paused' ||
      task.status === 'interrupted' ||
      task.status === 'failed' ||
      task.status === 'waiting_auth'
    ) {
      task.status = AuthenticationService.getAccessToken() ? 'queued' : 'waiting_auth';
      task.lastError = null;
      task.updatedAt = Date.now();
      this.isGlobalPaused = false;
      void this.updateTaskDirect(task);
      this.pumpQueue();
    }
  }

  public retryTask(taskId: string): void {
    const task = this.tasks.get(taskId);
    if (!task) return;
    if (task.status === 'failed' || task.status === 'interrupted' || task.status === 'cancelled') {
      task.status = AuthenticationService.getAccessToken() ? 'queued' : 'waiting_auth';
      task.lastError = null;
      task.updatedAt = Date.now();
      this.isGlobalPaused = false;
      void this.updateTaskDirect(task);
      this.pumpQueue();
    }
  }

  public cancelTask(taskId: string): void {
    const task = this.tasks.get(taskId);
    if (!task) return;

    const xhr = this.activeXhrs.get(taskId);
    if (xhr) {
      xhr.abort();
      this.activeXhrs.delete(taskId);
    }
    this.activeTaskIds.delete(taskId);
    this.memoryFiles.delete(taskId);
    void UploadQueueService.deleteFileBlob(taskId);

    task.status = 'cancelled';
    task.resumableSessionUri = null;
    task.updatedAt = Date.now();
    void this.updateTaskDirect(task);
    this.pumpQueue();
  }

  public pauseAll(): void {
    this.isGlobalPaused = true;
    for (const task of this.tasks.values()) {
      if (task.status === 'uploading' || task.status === 'checking_duplicate' || task.status === 'queued') {
        const xhr = this.activeXhrs.get(task.id);
        if (xhr) {
          xhr.abort();
          this.activeXhrs.delete(task.id);
        }
        this.activeTaskIds.delete(task.id);
        task.status = 'paused';
        task.updatedAt = Date.now();
        void UploadQueueService.saveTask(task);
      }
    }
    this.emit();
  }

  public resumeAll(): void {
    this.isGlobalPaused = false;
    const hasToken = Boolean(AuthenticationService.getAccessToken());
    for (const task of this.tasks.values()) {
      if (task.status === 'paused' || task.status === 'interrupted' || task.status === 'waiting_auth') {
        task.status = hasToken ? 'queued' : 'waiting_auth';
        task.lastError = null;
        task.updatedAt = Date.now();
        void UploadQueueService.saveTask(task);
      }
    }
    this.emit();
    this.pumpQueue();
  }

  public retryAllFailed(): void {
    const hasToken = Boolean(AuthenticationService.getAccessToken());
    this.isGlobalPaused = false;
    for (const task of this.tasks.values()) {
      if (task.status === 'failed' || task.status === 'interrupted') {
        task.status = hasToken ? 'queued' : 'waiting_auth';
        task.lastError = null;
        task.updatedAt = Date.now();
        void UploadQueueService.saveTask(task);
      }
    }
    this.emit();
    this.pumpQueue();
  }

  public async clearCompletedTasks(): Promise<void> {
    // Membersihkan catatan antrean lokal TIDAK pernah menghapus file di Google Drive.
    const removable: UploadTaskStatus[] = ['completed', 'skipped', 'cancelled'];
    for (const [id, task] of this.tasks.entries()) {
      if (removable.includes(task.status)) {
        this.tasks.delete(id);
        this.memoryFiles.delete(id);
        await UploadQueueService.deleteTask(id);
      }
    }
    this.emit();
  }

  public async resolveDuplicate(
    taskId: string,
    resolution: DuplicateResolution,
    applyToRemaining = false
  ): Promise<void> {
    if (applyToRemaining) {
      this.batchDuplicateOverride = resolution;
    }

    const task = this.tasks.get(taskId);
    if (!task) return;

    await this.applyDuplicateDecision(task, resolution);

    if (applyToRemaining) {
      for (const other of this.tasks.values()) {
        if (other.id !== taskId && other.status === 'duplicate_pending') {
          await this.applyDuplicateDecision(other, resolution);
        }
      }
    }

    this.pumpQueue();
  }

  private async applyDuplicateDecision(
    task: UploadTask,
    resolution: DuplicateResolution
  ): Promise<void> {
    if (resolution === 'skip') {
      task.status = 'skipped';
      task.lastError = 'Dilewati karena file duplikat sudah ada di Google Drive.';
      task.updatedAt = Date.now();
      this.memoryFiles.delete(task.id);
      await UploadQueueService.deleteFileBlob(task.id);
      await this.recordTaskActivity(task, 'skipped');
      await this.updateTaskDirect(task);
      return;
    }

    if (resolution === 'cancel') {
      task.status = 'cancelled';
      task.lastError = 'Dibatalkan oleh pengguna saat pemeriksaan duplikat.';
      task.updatedAt = Date.now();
      this.memoryFiles.delete(task.id);
      await UploadQueueService.deleteFileBlob(task.id);
      await this.updateTaskDirect(task);
      return;
    }

    // resolution === 'copy': upload sebagai salinan baru tanpa menimpa file yang sudah ada
    task.fileName = buildCopyFileName(task.fileName);
    task.duplicateMatch = undefined;
    task.resumableSessionUri = null;
    task.bytesUploaded = 0;
    task.progress = 0;
    task.status = 'queued';
    task.lastError = null;
    task.updatedAt = Date.now();
    await this.updateTaskDirect(task);
  }

  public pumpQueue(): void {
    if (this.isGlobalPaused || !this.isOnline) return;
    if (!AuthenticationService.getAccessToken()) return;

    const now = Date.now();
    const baseLimit =
      this.concurrencyMode === 'saver' ? 1 : this.concurrencyMode === 'speed' ? 4 : 2;
    const effectiveLimit = now < this.adaptiveBackoffUntil ? 1 : baseLimit;

    const queuedTasks = Array.from(this.tasks.values())
      .filter((t) => t.status === 'queued')
      .sort((a, b) => a.createdAt - b.createdAt);

    if (queuedTasks.length > 0 && !this.notifyBatchStartedSent && this.activeTaskIds.size === 0) {
      this.notifyBatchStartedSent = true;
      this.sendBrowserNotification(
        'Pencadangan Media Dimulai',
        `Mengupload ${queuedTasks.length} file asli ke Google Drive.`
      );
    }

    for (const task of queuedTasks) {
      if (this.activeTaskIds.size >= effectiveLimit) break;
      if (this.activeTaskIds.has(task.id)) continue;
      this.activeTaskIds.add(task.id);
      void this.processSingleTask(task.id);
    }
  }

  private async getBlobForTask(taskId: string): Promise<Blob | null> {
    const inMemory = this.memoryFiles.get(taskId);
    if (inMemory) return inMemory;
    const fromDb = await UploadQueueService.getFileBlob(taskId);
    if (fromDb) {
      this.memoryFiles.set(taskId, fromDb);
      return fromDb;
    }
    return null;
  }

  private async processSingleTask(taskId: string): Promise<void> {
    const task = this.tasks.get(taskId);
    if (!task) {
      this.activeTaskIds.delete(taskId);
      return;
    }

    try {
      const fileBlob = await this.getBlobForTask(taskId);
      if (!fileBlob) {
        task.status = 'needs_file';
        task.hasPersistedBlob = false;
        task.lastError =
          'File sumber asli tidak tersedia di penyimpanan lokal browser. Pilih ulang file ini untuk melanjutkan.';
        task.updatedAt = Date.now();
        await this.updateTaskDirect(task);
        this.sendBrowserNotification(
          'Upload Memerlukan File Sumber',
          `File "${task.fileName}" perlu dipilih ulang untuk melanjutkan cadangan.`
        );
        return;
      }

      // 1. Pastikan folder tujuan (termasuk subfolder bersarang) sudah ada di Google Drive
      let targetFolderId = task.resolvedFolderId || task.destinationFolderId;
      if (!task.resolvedFolderId && task.relativeFolderPath) {
        targetFolderId = await FolderService.ensureRelativeFolderPath(
          task.destinationFolderId,
          task.relativeFolderPath
        );
        task.resolvedFolderId = targetFolderId;
        await this.updateTaskDirect(task);
      }

      // 2. Hitung SHA-256 hash & periksa duplikat jika belum memiliki sesi resumable aktif
      if (!task.resumableSessionUri && !task.duplicateMatch) {
        task.status = 'checking_duplicate';
        task.updatedAt = Date.now();
        await this.updateTaskDirect(task);

        if (!task.contentHash) {
          task.contentHash = await DuplicateDetectionService.computeSha256(fileBlob);
        }

        const duplicate = await DuplicateDetectionService.detectDuplicateInFolder({
          folderId: targetFolderId,
          fileName: task.fileName,
          fileSize: task.fileSize,
          contentHash: task.contentHash,
          existingDriveFileId: task.uploadedDriveFileId,
        });

        if (duplicate) {
          const policy =
            this.batchDuplicateOverride || SettingsService.getSettings().defaultDuplicatePolicy;

          if (policy === 'skip') {
            await this.applyDuplicateDecision(task, 'skip');
            return;
          }
          if (policy === 'copy') {
            task.fileName = buildCopyFileName(task.fileName);
          } else if (policy === 'cancel') {
            await this.applyDuplicateDecision(task, 'cancel');
            return;
          } else {
            task.duplicateMatch = duplicate;
            task.status = 'duplicate_pending';
            task.updatedAt = Date.now();
            await this.updateTaskDirect(task);
            return;
          }
        }
      }

      // Periksa ulang jika dijeda saat fase cek duplikat
      const preUploadStatus = this.tasks.get(taskId)?.status;
      if (this.isGlobalPaused || preUploadStatus === 'paused' || preUploadStatus === 'cancelled') {
        return;
      }

      task.status = 'uploading';
      task.lastError = null;
      task.updatedAt = Date.now();
      await this.updateTaskDirect(task);

      // 3. Validasi atau mulai sesi Resumable Upload Google Drive
      let offset = task.bytesUploaded;
      const isSessionStale =
        task.sessionCreatedAt && Date.now() - task.sessionCreatedAt > SESSION_MAX_AGE_MS;

      if (task.resumableSessionUri && !isSessionStale) {
        const sessionStatus = await GoogleDriveService.queryResumableSessionStatus(
          task.resumableSessionUri,
          task.fileSize
        );

        if (sessionStatus.status === 'completed') {
          await this.finalizeCompletedTask(task, sessionStatus.file.id, sessionStatus.file.size);
          return;
        }
        if (sessionStatus.status === 'incomplete') {
          offset = sessionStatus.nextByteOffset;
          task.bytesUploaded = offset;
          task.progress = Math.round((offset / task.fileSize) * 100);
          await this.updateTaskDirect(task);
        } else {
          // Sesi sudah kedaluwarsa — cek sekali lagi apakah file ternyata sudah tersimpan agar tidak duplikat
          task.resumableSessionUri = null;
          offset = 0;
        }
      } else {
        task.resumableSessionUri = null;
        offset = 0;
      }

      if (!task.resumableSessionUri) {
        const sessionUri = await GoogleDriveService.initiateResumableUpload({
          fileName: task.fileName,
          mimeType: task.mimeType,
          fileSize: task.fileSize,
          parentId: targetFolderId,
          contentHash: task.contentHash,
        });
        task.resumableSessionUri = sessionUri;
        task.sessionCreatedAt = Date.now();
        task.bytesUploaded = 0;
        task.progress = 0;
        offset = 0;
        await this.updateTaskDirect(task);
      }

      // 4. Upload file biner asli dalam potongan (chunk) tanpa kompresi / modifikasi
      let completedDriveFileId: string | null = null;
      let completedDriveSize: string | undefined;

      while (offset < task.fileSize) {
        const liveStatus = this.tasks.get(taskId)?.status;
        if (this.isGlobalPaused || liveStatus === 'paused' || liveStatus === 'cancelled') {
          return;
        }

        const endByte = Math.min(offset + CHUNK_SIZE_BYTES - 1, task.fileSize - 1);
        const chunk = fileBlob.slice(offset, endByte + 1);
        const currentStart = offset;

        const chunkResult = await GoogleDriveService.uploadChunkWithProgress({
          sessionUri: task.resumableSessionUri!,
          chunk,
          startByte: currentStart,
          endByte,
          totalSize: task.fileSize,
          mimeType: task.mimeType,
          onXhrCreated: (xhr) => {
            this.activeXhrs.set(task.id, xhr);
          },
          onProgress: (loadedInChunk) => {
            const totalLoaded = Math.min(task.fileSize, currentStart + loadedInChunk);
            task.bytesUploaded = totalLoaded;
            task.progress = Math.min(99, Math.round((totalLoaded / task.fileSize) * 100));
            this.emit();
          },
        });

        this.activeXhrs.delete(task.id);

        if (chunkResult.status === 'completed') {
          completedDriveFileId = chunkResult.file.id;
          completedDriveSize = chunkResult.file.size;
          break;
        }

        offset = chunkResult.nextByteOffset;
        task.bytesUploaded = offset;
        task.progress = Math.min(99, Math.round((offset / task.fileSize) * 100));
        task.updatedAt = Date.now();
        await this.updateTaskDirect(task);
      }

      if (completedDriveFileId) {
        await this.finalizeCompletedTask(task, completedDriveFileId, completedDriveSize);
      }
    } catch (err: unknown) {
      this.activeXhrs.delete(task.id);

      if (err instanceof DOMException && err.name === 'AbortError') {
        // Jeda atau batal eksplisit — status sudah diperbarui oleh handler
        return;
      }

      if (err instanceof DriveApiError) {
        if (err.code === 'UNAUTHORIZED') {
          task.status = 'waiting_auth';
          task.lastError = err.message;
          task.updatedAt = Date.now();
          await this.updateTaskDirect(task);
          return;
        }

        if (err.code === 'NETWORK_ERROR' || err.code === 'QUOTA_EXCEEDED') {
          this.adaptiveBackoffUntil = Date.now() + 15000; // Kurangi konkurensi sementara ke 1 worker
          task.status = 'interrupted';
          task.retryCount += 1;
          task.lastError = err.message;
          task.updatedAt = Date.now();
          await this.updateTaskDirect(task);
          this.sendBrowserNotification(
            'Upload Terputus',
            `Koneksi terganggu saat mengupload "${task.fileName}". Akan dilanjutkan otomatis saat online.`
          );
          return;
        }

        if (err.code === 'SESSION_EXPIRED') {
          task.resumableSessionUri = null;
          task.bytesUploaded = 0;
          task.progress = 0;
          task.retryCount += 1;
          if (task.retryCount <= 2) {
            task.status = 'queued';
            task.lastError = 'Sesi upload kedaluwarsa, memulai ulang secara otomatis...';
            await this.updateTaskDirect(task);
            return;
          }
          task.status = 'failed';
          task.lastError = err.message;
          task.updatedAt = Date.now();
          await this.recordTaskActivity(task, 'failed', err.message);
          await this.updateTaskDirect(task);
          return;
        }
      }

      const errorMessage =
        err instanceof Error
          ? err.message
          : 'Terjadi kesalahan saat mengupload foto ke Google Drive.';

      task.status = 'failed';
      task.retryCount += 1;
      task.lastError = errorMessage;
      task.updatedAt = Date.now();
      await this.recordTaskActivity(task, 'failed', errorMessage);
      await this.updateTaskDirect(task);

      this.sendBrowserNotification('Upload Gagal', `Gagal mengupload "${task.fileName}".`);
    } finally {
      this.activeTaskIds.delete(taskId);
      this.activeXhrs.delete(taskId);
      this.checkBatchCompletion();
      this.pumpQueue();
    }
  }

  private async finalizeCompletedTask(
    task: UploadTask,
    driveFileId: string,
    returnedSize?: string
  ): Promise<void> {
    const parsedSize = returnedSize ? Number.parseInt(returnedSize, 10) : task.fileSize;
    const integrityVerified = parsedSize === task.fileSize;

    task.status = 'completed';
    task.progress = 100;
    task.bytesUploaded = task.fileSize;
    task.uploadedDriveFileId = driveFileId;
    task.verifiedIntegrity = integrityVerified;
    task.resumableSessionUri = null;
    task.completedAt = Date.now();
    task.updatedAt = Date.now();
    task.lastError = integrityVerified
      ? null
      : 'File terunggah, namun ukuran yang dilaporkan Drive berbeda dari file lokal.';

    // Bersihkan salinan blob lokal setelah selesai agar penyimpanan browser tetap hemat
    this.memoryFiles.delete(task.id);
    await UploadQueueService.deleteFileBlob(task.id);
    task.hasPersistedBlob = false;

    await this.recordTaskActivity(task, 'completed');
    await this.updateTaskDirect(task);

    FolderService.invalidateCache(task.resolvedFolderId || task.destinationFolderId);
    this.completionCallbacks.forEach((cb) => cb());
  }

  private async recordTaskActivity(
    task: UploadTask,
    status: BackupActivity['status'],
    errorMessage?: string
  ): Promise<void> {
    const entry: BackupActivity = {
      id: `${task.id}-${Date.now()}`,
      fileName: task.fileName,
      fileSize: task.fileSize,
      destinationFolderName: task.destinationFolderName,
      relativeFolderPath: task.relativeFolderPath,
      status,
      timestamp: Date.now(),
      driveFileId: task.uploadedDriveFileId,
      errorMessage,
    };

    this.activities = [entry, ...this.activities].slice(0, 20);
    await UploadQueueService.recordActivity(entry);
  }

  private checkBatchCompletion(): void {
    const remaining = Array.from(this.tasks.values()).some(
      (t) =>
        t.status === 'queued' ||
        t.status === 'uploading' ||
        t.status === 'checking_duplicate'
    );
    if (!remaining && this.notifyBatchStartedSent) {
      this.notifyBatchStartedSent = false;
      const snapshot = this.getSnapshot();
      if (snapshot.completedCount > 0) {
        this.sendBrowserNotification(
          'Pencadangan Selesai',
          `${snapshot.completedCount} foto berhasil dicadangkan ke Google Drive.`
        );
      }
    }
  }

  private handleNetworkOffline = (): void => {
    this.isOnline = false;
    for (const task of this.tasks.values()) {
      if (task.status === 'uploading' || task.status === 'checking_duplicate') {
        const xhr = this.activeXhrs.get(task.id);
        if (xhr) {
          xhr.abort();
          this.activeXhrs.delete(task.id);
        }
        this.activeTaskIds.delete(task.id);
        task.status = 'interrupted';
        task.lastError = 'Koneksi internet terputus. Upload akan dilanjutkan saat jaringan kembali.';
        task.updatedAt = Date.now();
        void UploadQueueService.saveTask(task);
      }
    }
    this.emit();
  };

  private handleNetworkOnline = (): void => {
    this.isOnline = true;
    const hasToken = Boolean(AuthenticationService.getAccessToken());
    for (const task of this.tasks.values()) {
      if (task.status === 'interrupted') {
        task.status = hasToken ? 'queued' : 'waiting_auth';
        task.lastError = null;
        task.updatedAt = Date.now();
        void UploadQueueService.saveTask(task);
      }
    }
    this.emit();
    if (!this.isGlobalPaused) {
      this.pumpQueue();
    }
  };

  private sendBrowserNotification(title: string, body: string): void {
    if (!SettingsService.getSettings().notificationsEnabled) return;
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;

    try {
      if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        void navigator.serviceWorker.ready.then((reg) => {
          void reg.showNotification(title, { body, tag: 'gdrive-photo-backup' });
        });
      } else {
        new Notification(title, { body });
      }
    } catch {
      // Abaikan jika browser membatasi notifikasi
    }
  }

  private emit(): void {
    const snapshot = this.getSnapshot();
    this.listeners.forEach((listener) => listener(snapshot));
  }
}

export const UploadService = new UploadServiceImpl();
