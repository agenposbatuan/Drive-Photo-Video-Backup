import { db } from './db.js';
import { GatewayDriveFile, listAllSubfoldersUnderRoot } from './driveGateway.js';

export interface GalleryRecord {
  id: string;
  owner_id: string;
  name: string;
  sharing_mode: 'password' | 'google_invite' | 'both';
  content_mode: 'all_albums' | 'selected_albums' | 'custom_photos' | 'mixed';
  default_quality: 'data_saver' | 'hd' | 'auto' | 'original';
  allow_download_default: number;
  status: 'active' | 'revoked';
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}

export function isGalleryExpired(expiresAt: string | null): boolean {
  if (!expiresAt) return false;
  const ts = new Date(expiresAt).getTime();
  if (Number.isNaN(ts)) return true;
  return Date.now() >= ts;
}

export function revokeGallerySessions(galleryId: string): void {
  db.prepare(
    `UPDATE gallery_sessions SET revoked_at = ? WHERE gallery_id = ? AND revoked_at IS NULL`
  ).run(new Date().toISOString(), galleryId);
}

export interface GalleryPermissionsSnapshot {
  albumMap: Map<string, { folderName: string; allowDownload: boolean }>;
  photoMap: Map<string, { parentFolderId: string; allowDownload: boolean }>;
}

export function loadGalleryPermissions(galleryId: string): GalleryPermissionsSnapshot {
  const albums = db
    .prepare(
      `SELECT drive_folder_id, folder_name, allow_download
       FROM gallery_album_permissions WHERE gallery_id = ?`
    )
    .all(galleryId) as Array<{
    drive_folder_id: string;
    folder_name: string;
    allow_download: number;
  }>;

  const photos = db
    .prepare(
      `SELECT drive_file_id, parent_folder_id, allow_download
       FROM gallery_photo_permissions WHERE gallery_id = ?`
    )
    .all(galleryId) as Array<{
    drive_file_id: string;
    parent_folder_id: string;
    allow_download: number;
  }>;

  const albumMap = new Map<string, { folderName: string; allowDownload: boolean }>();
  for (const a of albums) {
    albumMap.set(a.drive_folder_id, {
      folderName: a.folder_name,
      allowDownload: Boolean(a.allow_download),
    });
  }

  const photoMap = new Map<string, { parentFolderId: string; allowDownload: boolean }>();
  for (const p of photos) {
    photoMap.set(p.drive_file_id, {
      parentFolderId: p.parent_folder_id,
      allowDownload: Boolean(p.allow_download),
    });
  }

  return { albumMap, photoMap };
}

export async function authorizeFileAccess(params: {
  gallery: GalleryRecord;
  fileMeta: GatewayDriveFile;
  accessToken: string;
  ownerRootFolderId: string | null;
}): Promise<{ allowed: boolean; allowDownload: boolean }> {
  const { gallery, fileMeta, accessToken, ownerRootFolderId } = params;
  const parents = fileMeta.parents || [];
  const { albumMap, photoMap } = loadGalleryPermissions(gallery.id);

  if (gallery.content_mode === 'all_albums') {
    if (!ownerRootFolderId) return { allowed: false, allowDownload: false };
    if (parents.includes(ownerRootFolderId)) {
      return { allowed: true, allowDownload: Boolean(gallery.allow_download_default) };
    }
    const subfolders = await listAllSubfoldersUnderRoot(accessToken, ownerRootFolderId);
    const inRootTree = parents.some((pid) => subfolders.has(pid));
    return {
      allowed: inRootTree,
      allowDownload: inRootTree ? Boolean(gallery.allow_download_default) : false,
    };
  }

  if (gallery.content_mode === 'selected_albums') {
    for (const pid of parents) {
      const albumPerm = albumMap.get(pid);
      if (albumPerm) {
        return { allowed: true, allowDownload: albumPerm.allowDownload };
      }
    }
    return { allowed: false, allowDownload: false };
  }

  if (gallery.content_mode === 'custom_photos') {
    const photoPerm = photoMap.get(fileMeta.id);
    if (!photoPerm) return { allowed: false, allowDownload: false };
    return { allowed: true, allowDownload: photoPerm.allowDownload };
  }

  // mixed
  for (const pid of parents) {
    const albumPerm = albumMap.get(pid);
    if (albumPerm) {
      return { allowed: true, allowDownload: albumPerm.allowDownload };
    }
  }
  const photoPerm = photoMap.get(fileMeta.id);
  if (photoPerm) {
    return { allowed: true, allowDownload: photoPerm.allowDownload };
  }
  return { allowed: false, allowDownload: false };
}
