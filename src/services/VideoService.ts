import { DriveFile, SortOption, VideoItem } from '../types';
import { AuthenticationService } from './AuthenticationService';
import { FolderService } from './FolderService';
import { escapeDriveQueryValue, GoogleDriveService } from './GoogleDriveService';
import { triggerBlobDownload } from '../utils/downloadHelpers';

export interface VideoPageResult {
  videos: VideoItem[];
  nextPageToken?: string;
  folderMap: Map<string, string>;
}

class VideoServiceImpl {
  private mapDriveFileToVideo(file: DriveFile, folderMap?: Map<string, string>): VideoItem {
    const folderId = file.parents?.[0] || '';
    const rawDuration = file.videoMediaMetadata?.durationMillis;
    const durationMillis = rawDuration ? Number.parseInt(rawDuration, 10) || undefined : undefined;

    return {
      ...file,
      sizeBytes: file.size ? Number.parseInt(file.size, 10) || 0 : 0,
      folderId,
      folderName: folderMap?.get(folderId) || (folderId ? 'Subfolder' : 'Folder Utama'),
      displayDate: file.createdTime || file.modifiedTime || '',
      durationMillis,
    };
  }

  private mapSortToOrderBy(sort: SortOption = 'date-desc'): string {
    switch (sort) {
      case 'date-asc':
        return 'createdTime asc';
      case 'name-asc':
        return 'name asc';
      case 'name-desc':
        return 'name desc';
      case 'date-desc':
      default:
        return 'createdTime desc';
    }
  }

  /**
   * Menemukan seluruh video di bawah backup root secara rekursif.
   * Menjaga file video tetap berada di folder induk aslinya dan memetakan nama folder aslinya.
   */
  public async listAllVideosUnderRoot(params: {
    rootFolderId: string;
    rootFolderName: string;
    sort?: SortOption;
    pageSize?: number;
    pageToken?: string;
    forceRefreshFolders?: boolean;
  }): Promise<VideoPageResult> {
    if (params.forceRefreshFolders) {
      FolderService.invalidateCache();
    }

    const folderMap = await FolderService.collectDescendantFolderMap(
      params.rootFolderId,
      params.rootFolderName,
      200
    );
    const folderIds = Array.from(folderMap.keys());

    const fields =
      'nextPageToken,files(id,name,mimeType,size,createdTime,modifiedTime,parents,thumbnailLink,webViewLink,iconLink,videoMediaMetadata(width,height,durationMillis),capabilities(canEdit),appProperties)';

    // Jika jumlah folder <= 30, kueri dalam satu batch
    if (folderIds.length <= 30) {
      const parentClause = folderIds
        .map((id) => `'${escapeDriveQueryValue(id)}' in parents`)
        .join(' or ');

      const res = await GoogleDriveService.listFiles({
        q: `(${parentClause}) and mimeType contains 'video/' and trashed = false`,
        fields,
        orderBy: this.mapSortToOrderBy(params.sort),
        pageSize: params.pageSize ?? 50,
        pageToken: params.pageToken,
      });

      return {
        videos: (res.files || []).map((f) => this.mapDriveFileToVideo(f, folderMap)),
        nextPageToken: res.nextPageToken,
        folderMap,
      };
    }

    // Untuk struktur hierarki yang sangat banyak folder (> 30 folder), pecah per batch
    const batchSize = 25;
    const allBatches: string[][] = [];
    for (let i = 0; i < folderIds.length; i += batchSize) {
      allBatches.push(folderIds.slice(i, i + batchSize));
    }

    const batchPromises = allBatches.map(async (batchIds) => {
      const parentClause = batchIds
        .map((id) => `'${escapeDriveQueryValue(id)}' in parents`)
        .join(' or ');

      try {
        const res = await GoogleDriveService.listFiles({
          q: `(${parentClause}) and mimeType contains 'video/' and trashed = false`,
          fields,
          orderBy: this.mapSortToOrderBy(params.sort),
          pageSize: 100,
        });
        return res.files || [];
      } catch {
        return [] as DriveFile[];
      }
    });

    const batchResults = await Promise.all(batchPromises);
    const seenIds = new Set<string>();
    const combinedFiles: DriveFile[] = [];

    for (const fileList of batchResults) {
      for (const f of fileList) {
        if (!seenIds.has(f.id)) {
          seenIds.add(f.id);
          combinedFiles.push(f);
        }
      }
    }

    // Urutkan gabungan hasil
    combinedFiles.sort((a, b) => {
      const timeA = new Date(a.createdTime || a.modifiedTime || 0).getTime();
      const timeB = new Date(b.createdTime || b.modifiedTime || 0).getTime();
      return params.sort === 'date-asc' ? timeA - timeB : timeB - timeA;
    });

    return {
      videos: combinedFiles.map((f) => this.mapDriveFileToVideo(f, folderMap)),
      folderMap,
    };
  }

  /**
   * Menemukan video pada folder spesifik
   */
  public async listVideosInFolder(params: {
    folderId: string;
    folderName?: string;
    sort?: SortOption;
    pageSize?: number;
    pageToken?: string;
  }): Promise<{ videos: VideoItem[]; nextPageToken?: string }> {
    const fields =
      'nextPageToken,files(id,name,mimeType,size,createdTime,modifiedTime,parents,thumbnailLink,webViewLink,iconLink,videoMediaMetadata(width,height,durationMillis),capabilities(canEdit),appProperties)';

    const res = await GoogleDriveService.listFiles({
      q: `'${escapeDriveQueryValue(params.folderId)}' in parents and mimeType contains 'video/' and trashed = false`,
      fields,
      orderBy: this.mapSortToOrderBy(params.sort),
      pageSize: params.pageSize ?? 50,
      pageToken: params.pageToken,
    });

    const map = new Map<string, string>();
    if (params.folderName) {
      map.set(params.folderId, params.folderName);
    }

    return {
      videos: (res.files || []).map((f) => this.mapDriveFileToVideo(f, map)),
      nextPageToken: res.nextPageToken,
    };
  }

  /**
   * Mengambil ticket streaming terotentikasi dari backend gateway.
   * Menghindari pencantuman access token mentah di URL atau log browser.
   */
  public async createStreamTicket(fileId: string): Promise<{
    ticket: string;
    streamUrl: string;
    thumbnailUrl: string;
  } | null> {
    const token = AuthenticationService.getAccessToken();
    if (!token) return null;

    try {
      const res = await fetch('/api/owner/video/ticket', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ fileId }),
      });

      if (!res.ok) {
        return null;
      }

      return (await res.json()) as {
        ticket: string;
        streamUrl: string;
        thumbnailUrl: string;
      };
    } catch {
      return null;
    }
  }

  /**
   * Menghasilkan URL streaming HTTP Range Request untuk tag HTML5 <video>
   */
  public getStreamUrl(fileId: string, name?: string, ticket?: string): string {
    const nameParam = name ? `&name=${encodeURIComponent(name)}` : '';
    if (ticket) {
      return `/api/owner/video/stream/${encodeURIComponent(fileId)}?ticket=${encodeURIComponent(ticket)}${nameParam}`;
    }
    const token = AuthenticationService.getAccessToken();
    return `/api/owner/video/stream/${encodeURIComponent(fileId)}?token=${encodeURIComponent(token || '')}${nameParam}`;
  }

  /**
   * Menghasilkan URL proxy thumbnail video dari Google Drive
   */
  public getThumbnailProxyUrl(fileId: string, ticket?: string, size = 480): string {
    if (ticket) {
      return `/api/owner/video/thumbnail/${encodeURIComponent(fileId)}?ticket=${encodeURIComponent(ticket)}&size=${size}`;
    }
    const token = AuthenticationService.getAccessToken();
    return `/api/owner/video/thumbnail/${encodeURIComponent(fileId)}?token=${encodeURIComponent(token || '')}&size=${size}`;
  }

  /**
   * Menguji kompatibilitas browser terhadap format & MIME type video
   */
  public checkFormatCompatibility(mimeType?: string, fileName?: string): {
    canPlay: boolean;
    formatName: string;
    note?: string;
  } {
    const name = (fileName || '').toLowerCase();
    let format = 'Video';
    if (name.endsWith('.mp4')) format = 'MP4';
    else if (name.endsWith('.3gp') || name.endsWith('.3gpp')) format = '3GP';
    else if (name.endsWith('.mov')) format = 'QuickTime (MOV)';
    else if (name.endsWith('.webm')) format = 'WebM';
    else if (name.endsWith('.mkv')) format = 'Matroska (MKV)';
    else if (name.endsWith('.avi')) format = 'AVI';

    if (typeof document === 'undefined') {
      return { canPlay: true, formatName: format };
    }

    const testVideo = document.createElement('video');
    const effectiveMime = mimeType || (
      format === 'MP4' ? 'video/mp4' :
      format === '3GP' ? 'video/3gpp' :
      format === 'WebM' ? 'video/webm' :
      format === 'QuickTime (MOV)' ? 'video/quicktime' : 'video/mp4'
    );

    const playResult = testVideo.canPlayType(effectiveMime);
    const canPlay = playResult === 'probably' || playResult === 'maybe';

    let note: string | undefined;
    if (format === '3GP' && !canPlay) {
      note = 'Format 3GP (dengan codec AMR/MPEG-4) umumnya memerlukan aplikasi pemutar lokal atau download langsung karena tidak semua browser desktop mendukung decoder AMR secara bawaan.';
    } else if (format === 'AVI' && !canPlay) {
      note = 'Container AVI memerlukan pemutar video eksternal (seperti VLC).';
    }

    return { canPlay, formatName: format, note };
  }

  /**
   * Mengunduh video asli byte-per-byte langsung dari Google Drive
   * Mempertahankan nama, ekstensi, resolusi, format, dan kualitas asli (tanpa kompresi foto).
   */
  public async downloadVideo(video: { id: string; name: string }): Promise<void> {
    const blob = await GoogleDriveService.fetchMediaBlob(video.id);
    triggerBlobDownload(blob, video.name);
  }
}

export const VideoService = new VideoServiceImpl();
