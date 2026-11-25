import { UploadTask } from '../types';
import { AuthenticationService } from './AuthenticationService';
import { FolderService } from './FolderService';
import { GoogleDriveService } from './GoogleDriveService';
import { UploadQueueService } from './UploadQueueService';
import { UploadService } from './UploadService';

export interface RecoveryReport {
  recoveredReadyCount: number;
  needsFileCount: number;
  waitingAuthCount: number;
  completedOnResumeCount: number;
  folderAccessErrors: string[];
}

class UploadRecoveryServiceImpl {
  private isRecovering = false;

  /**
   * Dipanggil saat aplikasi pertama kali dibuka untuk membaca antrean belum selesai dari IndexedDB
   * dan memverifikasi ketersediaan blob file lokal tanpa menghapus tugas secara diam-diam.
   */
  public async inspectPersistedQueueOnStartup(): Promise<RecoveryReport> {
    const tasks = await UploadService.initializeFromStorage();
    const report: RecoveryReport = {
      recoveredReadyCount: 0,
      needsFileCount: 0,
      waitingAuthCount: 0,
      completedOnResumeCount: 0,
      folderAccessErrors: [],
    };

    const unfinishedStatuses = new Set([
      'queued',
      'uploading',
      'checking_duplicate',
      'interrupted',
      'paused',
      'waiting_auth',
      'needs_file',
    ]);

    const hasToken = Boolean(AuthenticationService.getAccessToken());

    for (const task of tasks) {
      if (!unfinishedStatuses.has(task.status)) continue;

      const hasBlob = await UploadQueueService.hasFileBlob(task.id);
      const updated: UploadTask = { ...task, hasPersistedBlob: hasBlob, updatedAt: Date.now() };

      if (!hasBlob) {
        updated.status = 'needs_file';
        updated.lastError =
          'File sumber asli tidak tersedia setelah halaman dimuat ulang. Silakan pilih ulang file untuk melanjutkan upload.';
        report.needsFileCount += 1;
        await UploadService.updateTaskDirect(updated);
        continue;
      }

      if (task.status === 'paused') {
        // Hormati pilihan jeda eksplisit dari pengguna
        await UploadService.updateTaskDirect(updated);
        continue;
      }

      if (!hasToken) {
        updated.status = 'waiting_auth';
        updated.lastError =
          'Upload terhenti saat aplikasi ditutup. Hubungkan kembali akun Google untuk memulihkan antrean.';
        report.waitingAuthCount += 1;
        await UploadService.updateTaskDirect(updated);
        continue;
      }

      if (task.status === 'uploading' || task.status === 'checking_duplicate') {
        updated.status = 'interrupted';
        updated.lastError = 'Upload terputus saat halaman dimuat ulang dan siap dilanjutkan.';
      }

      report.recoveredReadyCount += 1;
      await UploadService.updateTaskDirect(updated);
    }

    return report;
  }

  /**
   * Dipanggil setelah autentikasi Google valid untuk memvalidasi akses folder tujuan,
   * memeriksa validitas sesi resumable Drive, dan melanjutkan tugas yang siap secara aman.
   */
  public async resumeRecoveredTasksAfterAuth(): Promise<RecoveryReport> {
    if (this.isRecovering) {
      return {
        recoveredReadyCount: 0,
        needsFileCount: 0,
        waitingAuthCount: 0,
        completedOnResumeCount: 0,
        folderAccessErrors: [],
      };
    }

    const token = AuthenticationService.getAccessToken();
    if (!token) {
      return {
        recoveredReadyCount: 0,
        needsFileCount: 0,
        waitingAuthCount: 0,
        completedOnResumeCount: 0,
        folderAccessErrors: [],
      };
    }

    this.isRecovering = true;
    const report: RecoveryReport = {
      recoveredReadyCount: 0,
      needsFileCount: 0,
      waitingAuthCount: 0,
      completedOnResumeCount: 0,
      folderAccessErrors: [],
    };

    try {
      const snapshot = UploadService.getSnapshot();
      const verifiedFolders = new Map<string, boolean>();

      for (const task of snapshot.tasks) {
        if (
          task.status !== 'waiting_auth' &&
          task.status !== 'interrupted' &&
          task.status !== 'queued'
        ) {
          continue;
        }

        const hasBlob = await UploadQueueService.hasFileBlob(task.id);
        if (!hasBlob) {
          await UploadService.updateTaskDirect({
            ...task,
            hasPersistedBlob: false,
            status: 'needs_file',
            lastError: 'File sumber tidak ditemukan di penyimpanan lokal. Pilih ulang file untuk melanjutkan.',
            updatedAt: Date.now(),
          });
          report.needsFileCount += 1;
          continue;
        }

        // Validasi akses folder tujuan (cached per folder ID)
        let folderOk = verifiedFolders.get(task.destinationFolderId);
        if (folderOk === undefined) {
          try {
            const meta = await FolderService.verifyFolderAccess(task.destinationFolderId);
            folderOk = meta.canAddChildren;
          } catch {
            folderOk = false;
          }
          verifiedFolders.set(task.destinationFolderId, folderOk);
        }

        if (!folderOk) {
          const msg = `Folder tujuan "${task.destinationFolderName}" tidak dapat diakses atau izin upload dicabut.`;
          if (!report.folderAccessErrors.includes(msg)) {
            report.folderAccessErrors.push(msg);
          }
          await UploadService.updateTaskDirect({
            ...task,
            status: 'failed',
            lastError: msg,
            updatedAt: Date.now(),
          });
          continue;
        }

        // Validasi sesi resumable jika ada
        const updatedTask: UploadTask = { ...task, updatedAt: Date.now() };
        if (updatedTask.resumableSessionUri) {
          try {
            const sessionStatus = await GoogleDriveService.queryResumableSessionStatus(
              updatedTask.resumableSessionUri,
              updatedTask.fileSize
            );
            if (sessionStatus.status === 'completed') {
              updatedTask.status = 'completed';
              updatedTask.progress = 100;
              updatedTask.bytesUploaded = updatedTask.fileSize;
              updatedTask.uploadedDriveFileId = sessionStatus.file.id;
              updatedTask.verifiedIntegrity = true;
              updatedTask.resumableSessionUri = null;
              updatedTask.completedAt = Date.now();
              updatedTask.lastError = null;
              await UploadQueueService.deleteFileBlob(updatedTask.id);
              updatedTask.hasPersistedBlob = false;
              await UploadService.updateTaskDirect(updatedTask);
              report.completedOnResumeCount += 1;
              continue;
            }
            if (sessionStatus.status === 'incomplete') {
              updatedTask.bytesUploaded = sessionStatus.nextByteOffset;
              updatedTask.progress = Math.round(
                (sessionStatus.nextByteOffset / updatedTask.fileSize) * 100
              );
            } else {
              // Sesi kedaluwarsa — hapus URI sesi agar UploadService memulai ulang secara aman + cek duplikat
              updatedTask.resumableSessionUri = null;
              updatedTask.bytesUploaded = 0;
              updatedTask.progress = 0;
            }
          } catch {
            // Biarkan UploadService menangani ulang saat giliran berjalan
          }
        }

        updatedTask.status = 'queued';
        updatedTask.lastError = null;
        await UploadService.updateTaskDirect(updatedTask);
        report.recoveredReadyCount += 1;
      }

      UploadService.pumpQueue();
      return report;
    } finally {
      this.isRecovering = false;
    }
  }
}

export const UploadRecoveryService = new UploadRecoveryServiceImpl();
