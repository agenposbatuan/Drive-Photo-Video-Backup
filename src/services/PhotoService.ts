import { DriveFile, DriveStats, PhotoItem, SortOption } from '../types';
import { formatExifDateToIso } from '../utils/formatters';
import { FolderService } from './FolderService';
import { escapeDriveQueryValue, GoogleDriveService } from './GoogleDriveService';

export interface PhotoPageResult {
  photos: PhotoItem[];
  nextPageToken?: string;
}

class PhotoServiceImpl {
  private mapDriveFileToPhoto(file: DriveFile, folderMap?: Map<string, string>): PhotoItem {
    const folderId = file.parents?.[0] || '';
    const exifIso = formatExifDateToIso(file.imageMediaMetadata?.time);
    const displayDate = exifIso || file.createdTime || file.modifiedTime || '';

    return {
      ...file,
      sizeBytes: file.size ? Number.parseInt(file.size, 10) || 0 : 0,
      folderId,
      folderName: folderMap?.get(folderId),
      displayDate,
    };
  }

  private mapSortToOrderBy(sort: SortOption): string {
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

  public async listPhotosInFolder(params: {
    folderId: string;
    folderName?: string;
    sort: SortOption;
    pageSize?: number;
    pageToken?: string;
  }): Promise<PhotoPageResult> {
    const res = await GoogleDriveService.listFiles({
      q: `'${escapeDriveQueryValue(params.folderId)}' in parents and mimeType contains 'image/' and trashed = false`,
      orderBy: this.mapSortToOrderBy(params.sort),
      pageSize: params.pageSize ?? 48,
      pageToken: params.pageToken,
    });

    const map = new Map<string, string>();
    if (params.folderName) {
      map.set(params.folderId, params.folderName);
    }

    return {
      photos: (res.files || []).map((f) => this.mapDriveFileToPhoto(f, map)),
      nextPageToken: res.nextPageToken,
    };
  }

  public async listAllPhotosUnderRoot(params: {
    rootFolderId: string;
    rootFolderName: string;
    sort: SortOption;
    pageSize?: number;
    pageToken?: string;
    forceRefreshFolders?: boolean;
  }): Promise<PhotoPageResult & { folderMap: Map<string, string> }> {
    if (params.forceRefreshFolders) {
      FolderService.invalidateCache();
    }

    const folderMap = await FolderService.collectDescendantFolderMap(
      params.rootFolderId,
      params.rootFolderName
    );
    const folderIds = Array.from(folderMap.keys());

    // Drive API query mengizinkan gabungan 'id' in parents. Untuk keamanan panjang query,
    // bagi batch jika folder sangat banyak (> 40 folder).
    if (folderIds.length <= 40) {
      const parentClause = folderIds
        .map((id) => `'${escapeDriveQueryValue(id)}' in parents`)
        .join(' or ');

      const res = await GoogleDriveService.listFiles({
        q: `(${parentClause}) and mimeType contains 'image/' and trashed = false`,
        orderBy: this.mapSortToOrderBy(params.sort),
        pageSize: params.pageSize ?? 60,
        pageToken: params.pageToken,
      });

      return {
        photos: (res.files || []).map((f) => this.mapDriveFileToPhoto(f, folderMap)),
        nextPageToken: res.nextPageToken,
        folderMap,
      };
    }

    // Jika lebih dari 40 subfolder, gabungkan hasil dari potongan batch
    const chunkSize = 35;
    const chunks: string[][] = [];
    for (let i = 0; i < folderIds.length; i += chunkSize) {
      chunks.push(folderIds.slice(i, i + chunkSize));
    }

    const batchResults = await Promise.all(
      chunks.map(async (ids) => {
        const parentClause = ids
          .map((id) => `'${escapeDriveQueryValue(id)}' in parents`)
          .join(' or ');
        const res = await GoogleDriveService.listFiles({
          q: `(${parentClause}) and mimeType contains 'image/' and trashed = false`,
          orderBy: this.mapSortToOrderBy(params.sort),
          pageSize: 100,
        });
        return res.files || [];
      })
    );

    const merged = batchResults
      .flat()
      .map((f) => this.mapDriveFileToPhoto(f, folderMap));

    merged.sort((a, b) => this.comparePhotos(a, b, params.sort));

    return {
      photos: merged,
      nextPageToken: undefined,
      folderMap,
    };
  }

  public comparePhotos(a: PhotoItem, b: PhotoItem, sort: SortOption): number {
    switch (sort) {
      case 'date-asc':
        return (Date.parse(a.displayDate) || 0) - (Date.parse(b.displayDate) || 0);
      case 'name-asc':
        return a.name.localeCompare(b.name, 'id');
      case 'name-desc':
        return b.name.localeCompare(a.name, 'id');
      case 'date-desc':
      default:
        return (Date.parse(b.displayDate) || 0) - (Date.parse(a.displayDate) || 0);
    }
  }

  public async fetchDriveStats(
    rootFolderId: string,
    rootFolderName: string,
    forceRefresh = false
  ): Promise<DriveStats> {
    if (forceRefresh) {
      FolderService.invalidateCache();
    }

    const folderMap = await FolderService.collectDescendantFolderMap(
      rootFolderId,
      rootFolderName
    );
    const folderIds = Array.from(folderMap.keys());
    const totalAlbums = Math.max(0, folderIds.length - 1);

    let totalPhotos = 0;
    let isPartial = false;

    const chunkSize = 35;
    for (let i = 0; i < folderIds.length; i += chunkSize) {
      const slice = folderIds.slice(i, i + chunkSize);
      const parentClause = slice
        .map((id) => `'${escapeDriveQueryValue(id)}' in parents`)
        .join(' or ');

      let pageToken: string | undefined;
      let pages = 0;
      do {
        const res = await GoogleDriveService.listFiles({
          q: `(${parentClause}) and mimeType contains 'image/' and trashed = false`,
          fields: 'nextPageToken,files(id)',
          pageSize: 500,
          pageToken,
        });
        totalPhotos += res.files?.length || 0;
        pageToken = res.nextPageToken;
        pages += 1;
        if (pages >= 4 && pageToken) {
          isPartial = true;
          break;
        }
      } while (pageToken);
    }

    return {
      totalPhotos,
      totalAlbums,
      lastSyncedAt: Date.now(),
      isPartial,
    };
  }
}

export const PhotoService = new PhotoServiceImpl();
