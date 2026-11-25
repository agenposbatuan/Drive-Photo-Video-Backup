import { AlbumSummary, DriveFile, FolderBreadcrumb, FolderTreeNode, RootFolderConfig } from '../types';
import {
  DriveApiError,
  escapeDriveQueryValue,
  FOLDER_MIME_TYPE,
  GoogleDriveService,
} from './GoogleDriveService';

interface CachedFolderChildren {
  folders: DriveFile[];
  fetchedAt: number;
}

const CACHE_TTL_MS = 60_000;

class FolderServiceImpl {
  private childFolderCache = new Map<string, CachedFolderChildren>();
  private folderTreeCache = new Map<string, { tree: FolderTreeNode[]; fetchedAt: number }>();
  private folderCreationLocks = new Map<string, Promise<DriveFile>>();

  public invalidateCache(parentId?: string): void {
    if (parentId) {
      this.childFolderCache.delete(parentId);
    } else {
      this.childFolderCache.clear();
      this.folderTreeCache.clear();
    }
  }

  public async verifyFolderAccess(folderId: string): Promise<RootFolderConfig> {
    const meta = await GoogleDriveService.getFileMetadata(folderId);
    if (meta.mimeType !== FOLDER_MIME_TYPE) {
      throw new DriveApiError(
        'Item yang dipilih bukan folder Google Drive yang valid.',
        400,
        'UNKNOWN'
      );
    }

    // Verifikasi kemampuan membaca isi folder
    await GoogleDriveService.listFiles({
      q: `'${escapeDriveQueryValue(folderId)}' in parents and trashed = false`,
      fields: 'files(id)',
      pageSize: 1,
    });

    const canAddChildren = meta.capabilities?.canAddChildren ?? true;

    return {
      id: meta.id,
      name: meta.name,
      verifiedAt: Date.now(),
      canAddChildren,
    };
  }

  public async listChildFolders(
    parentId: string,
    options: { forceRefresh?: boolean; searchQuery?: string } = {}
  ): Promise<DriveFile[]> {
    const useCache = !options.forceRefresh && !options.searchQuery;
    if (useCache) {
      const cached = this.childFolderCache.get(parentId);
      if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
        return cached.folders;
      }
    }

    const parts = [
      `mimeType = '${FOLDER_MIME_TYPE}'`,
      `trashed = false`,
    ];

    if (parentId === 'root') {
      parts.push(`'root' in parents`);
    } else {
      parts.push(`'${escapeDriveQueryValue(parentId)}' in parents`);
    }

    if (options.searchQuery && options.searchQuery.trim()) {
      parts.push(`name contains '${escapeDriveQueryValue(options.searchQuery.trim())}'`);
    }

    const allFolders: DriveFile[] = [];
    let pageToken: string | undefined;

    do {
      const res = await GoogleDriveService.listFiles({
        q: parts.join(' and '),
        orderBy: 'name',
        pageSize: 100,
        pageToken,
      });
      allFolders.push(...(res.files || []));
      pageToken = res.nextPageToken;
    } while (pageToken && allFolders.length < 500);

    if (useCache) {
      this.childFolderCache.set(parentId, {
        folders: allFolders,
        fetchedAt: Date.now(),
      });
    }

    return allFolders;
  }

  public async getAlbumSummaries(
    parentId: string,
    forceRefresh = false
  ): Promise<AlbumSummary[]> {
    const folders = await this.listChildFolders(parentId, { forceRefresh });
    if (folders.length === 0) return [];

    // Ambil ringkasan foto & subfolder secara paralel terkontrol (maksimal 5 bersamaan)
    const summaries: AlbumSummary[] = new Array(folders.length);
    const concurrency = 5;
    let cursor = 0;

    const worker = async () => {
      while (cursor < folders.length) {
        const index = cursor++;
        const folder = folders[index];
        try {
          const [photosRes, subRes] = await Promise.all([
            GoogleDriveService.listFiles({
              q: `'${escapeDriveQueryValue(folder.id)}' in parents and mimeType contains 'image/' and trashed = false`,
              fields: 'files(id,thumbnailLink)',
              orderBy: 'modifiedTime desc',
              pageSize: 100,
            }),
            GoogleDriveService.listFiles({
              q: `'${escapeDriveQueryValue(folder.id)}' in parents and mimeType = '${FOLDER_MIME_TYPE}' and trashed = false`,
              fields: 'files(id)',
              pageSize: 100,
            }),
          ]);

          const photos = photosRes.files || [];
          const subfolders = subRes.files || [];
          let coverPhotoId = photos[0]?.id;
          let coverThumbnailLink = photos[0]?.thumbnailLink;

          // Jika album hanya berisi subfolder, coba ambil satu sampul dari subfolder pertama
          if (!coverPhotoId && subfolders.length > 0) {
            const nestedPhoto = await GoogleDriveService.listFiles({
              q: `'${escapeDriveQueryValue(subfolders[0].id)}' in parents and mimeType contains 'image/' and trashed = false`,
              fields: 'files(id,thumbnailLink)',
              orderBy: 'modifiedTime desc',
              pageSize: 1,
            });
            coverPhotoId = nestedPhoto.files?.[0]?.id;
            coverThumbnailLink = nestedPhoto.files?.[0]?.thumbnailLink;
          }

          summaries[index] = {
            id: folder.id,
            name: folder.name,
            parentId,
            photoCount: photos.length,
            subfolderCount: subfolders.length,
            coverPhotoId,
            coverThumbnailLink,
            modifiedTime: folder.modifiedTime,
            canAddChildren: folder.capabilities?.canAddChildren ?? true,
          };
        } catch {
          summaries[index] = {
            id: folder.id,
            name: folder.name,
            parentId,
            photoCount: 0,
            subfolderCount: 0,
            modifiedTime: folder.modifiedTime,
            canAddChildren: folder.capabilities?.canAddChildren ?? true,
          };
        }
      }
    };

    await Promise.all(
      Array.from({ length: Math.min(concurrency, folders.length) }, () => worker())
    );

    return summaries;
  }

  public async collectDescendantFolderMap(
    rootFolderId: string,
    rootFolderName: string,
    maxFolders = 120
  ): Promise<Map<string, string>> {
    const folderMap = new Map<string, string>();
    folderMap.set(rootFolderId, rootFolderName);

    const queue: string[] = [rootFolderId];
    let visited = 0;

    while (queue.length > 0 && visited < maxFolders) {
      const batch = queue.splice(0, 4);
      const results = await Promise.all(
        batch.map((id) =>
          this.listChildFolders(id).catch(() => [] as DriveFile[])
        )
      );

      for (const children of results) {
        for (const child of children) {
          if (!folderMap.has(child.id) && folderMap.size < maxFolders) {
            folderMap.set(child.id, child.name);
            queue.push(child.id);
            visited += 1;
          }
        }
      }
    }

    return folderMap;
  }

  public async findOrCreateSubfolder(parentId: string, folderName: string): Promise<DriveFile> {
    const cleanName = folderName.trim();
    const lockKey = `${parentId}::${cleanName.toLowerCase()}`;

    const inFlight = this.folderCreationLocks.get(lockKey);
    if (inFlight) {
      return inFlight;
    }

    const promise = (async () => {
      try {
        const res = await GoogleDriveService.listFiles({
          q: `'${escapeDriveQueryValue(parentId)}' in parents and name = '${escapeDriveQueryValue(cleanName)}' and mimeType = '${FOLDER_MIME_TYPE}' and trashed = false`,
          fields: 'files(id,name,mimeType,parents,capabilities(canAddChildren))',
          pageSize: 1,
        });

        if (res.files && res.files.length > 0) {
          return res.files[0];
        }

        const created = await GoogleDriveService.createFolder(cleanName, parentId);
        this.invalidateCache(parentId);
        return created;
      } finally {
        this.folderCreationLocks.delete(lockKey);
      }
    })();

    this.folderCreationLocks.set(lockKey, promise);
    return promise;
  }

  public async ensureRelativeFolderPath(
    baseFolderId: string,
    relativeFolderPath: string
  ): Promise<string> {
    const segments = relativeFolderPath
      .split('/')
      .map((s) => s.trim())
      .filter(Boolean);

    let currentParentId = baseFolderId;
    for (const segment of segments) {
      const folder = await this.findOrCreateSubfolder(currentParentId, segment);
      currentParentId = folder.id;
    }

    return currentParentId;
  }

  public async createNewAlbum(parentId: string, name: string): Promise<DriveFile> {
    const trimmed = name.trim();
    if (!trimmed) {
      throw new Error('Nama album tidak boleh kosong.');
    }
    const created = await this.findOrCreateSubfolder(parentId, trimmed);
    this.invalidateCache(parentId);
    return created;
  }

  public async listFlatFolderOptions(
    rootFolderId: string,
    rootFolderName: string
  ): Promise<Array<{ id: string; label: string; depth: number }>> {
    const options: Array<{ id: string; label: string; depth: number }> = [
      { id: rootFolderId, label: rootFolderName, depth: 0 },
    ];

    const traverse = async (parentId: string, prefix: string, depth: number) => {
      if (depth > 3 || options.length >= 80) return;
      const children = await this.listChildFolders(parentId).catch(() => []);
      for (const child of children) {
        const label = `${prefix} / ${child.name}`;
        options.push({ id: child.id, label, depth });
        if (options.length < 80) {
          await traverse(child.id, label, depth + 1);
        }
      }
    };

    await traverse(rootFolderId, rootFolderName, 1);
    return options;
  }

  public buildInitialBreadcrumb(root: RootFolderConfig): FolderBreadcrumb[] {
    return [{ id: root.id, name: root.name }];
  }

  /**
   * Mengambil seluruh hierarki folder dan subfolder secara rekursif tanpa batas kedalaman arbitrer.
   * Mendukung pagination penuh (nextPageToken) di setiap level folder.
   * Folder kosong (0 foto, 0 file, atau hanya subfolder) tetap disertakan sepenuhnya.
   */
  public async buildRecursiveFolderTree(
    rootFolderId: string,
    options: {
      forceRefresh?: boolean;
      onProgress?: (count: number) => void;
    } = {}
  ): Promise<FolderTreeNode[]> {
    if (!options.forceRefresh) {
      const cached = this.folderTreeCache.get(rootFolderId);
      if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
        return cached.tree;
      }
    }

    const visited = new Set<string>();
    visited.add(rootFolderId);
    let totalDiscovered = 0;

    const fetchFolderChildren = async (parentId: string): Promise<DriveFile[]> => {
      const queryParent = parentId === 'root' ? `'root' in parents` : `'${escapeDriveQueryValue(parentId)}' in parents`;
      const q = `${queryParent} and mimeType = '${FOLDER_MIME_TYPE}' and trashed = false`;
      const children: DriveFile[] = [];
      let pageToken: string | undefined;

      do {
        const res = await GoogleDriveService.listFiles({
          q,
          fields: 'nextPageToken, files(id, name, mimeType, parents, modifiedTime)',
          orderBy: 'name',
          pageSize: 100,
          pageToken,
        });
        if (res.files && res.files.length > 0) {
          children.push(...res.files);
        }
        pageToken = res.nextPageToken;
      } while (pageToken);

      return children;
    };

    const fetchFolderPhotoCount = async (folderId: string): Promise<number> => {
      try {
        const queryParent = folderId === 'root' ? `'root' in parents` : `'${escapeDriveQueryValue(folderId)}' in parents`;
        const res = await GoogleDriveService.listFiles({
          q: `${queryParent} and mimeType contains 'image/' and trashed = false`,
          fields: 'files(id)',
          pageSize: 100,
        });
        return res.files?.length || 0;
      } catch {
        return 0;
      }
    };

    const buildSubtree = async (
      folder: DriveFile,
      depth: number
    ): Promise<FolderTreeNode> => {
      visited.add(folder.id);
      totalDiscovered += 1;
      options.onProgress?.(totalDiscovered);

      // Ambil subfolder & jumlah foto di folder ini secara paralel
      const [childFolders, photoCount] = await Promise.all([
        fetchFolderChildren(folder.id).catch(() => [] as DriveFile[]),
        fetchFolderPhotoCount(folder.id),
      ]);

      // Filter subfolder yang belum dikunjungi untuk mencegah siklus rekursif
      const unvisitedChildren = childFolders.filter((c) => !visited.has(c.id));

      // Lakukan rekursi ke seluruh subfolder tanpa batasan kedalaman
      const childNodes = await Promise.all(
        unvisitedChildren.map((c) => buildSubtree(c, depth + 1))
      );

      // Urutkan berdasarkan nama
      childNodes.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));

      return {
        id: folder.id,
        name: folder.name,
        parentId: folder.parents?.[0] || null,
        depth,
        photoCount,
        subfolderCount: childNodes.length,
        children: childNodes,
      };
    };

    // Ambil direct children dari rootFolderId
    const rootChildren = await fetchFolderChildren(rootFolderId);
    const topLevelNodes = await Promise.all(
      rootChildren
        .filter((c) => !visited.has(c.id))
        .map((child) => buildSubtree(child, 0))
    );

    topLevelNodes.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));

    this.folderTreeCache.set(rootFolderId, {
      tree: topLevelNodes,
      fetchedAt: Date.now(),
    });

    return topLevelNodes;
  }

  public flattenFolderTree(nodes: FolderTreeNode[]): FolderTreeNode[] {
    const list: FolderTreeNode[] = [];
    const traverse = (nodeList: FolderTreeNode[]) => {
      for (const node of nodeList) {
        list.push(node);
        if (node.children && node.children.length > 0) {
          traverse(node.children);
        }
      }
    };
    traverse(nodes);
    return list;
  }

  public getAllDescendantIds(node: FolderTreeNode): Set<string> {
    const ids = new Set<string>();
    ids.add(node.id);
    const traverse = (n: FolderTreeNode) => {
      for (const child of n.children) {
        ids.add(child.id);
        traverse(child);
      }
    };
    traverse(node);
    return ids;
  }

  public findNodeInTree(nodes: FolderTreeNode[], id: string): FolderTreeNode | null {
    for (const node of nodes) {
      if (node.id === id) return node;
      if (node.children && node.children.length > 0) {
        const found = this.findNodeInTree(node.children, id);
        if (found) return found;
      }
    }
    return null;
  }
}

export const FolderService = new FolderServiceImpl();
