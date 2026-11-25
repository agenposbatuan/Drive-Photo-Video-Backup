import fs from 'node:fs';
import path from 'node:path';
import { decryptSecret, encryptSecret } from './crypto.js';
import { db, getDerivativesDir } from './db.js';
import firebaseConfig from '../firebase-applet-config.json' with { type: 'json' };

const DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3';
const FOLDER_MIME_TYPE = 'application/vnd.google-apps.folder';

export interface GatewayDriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  createdTime?: string;
  modifiedTime?: string;
  parents?: string[];
  thumbnailLink?: string;
  imageMediaMetadata?: {
    width?: number;
    height?: number;
    time?: string;
  };
}

export async function verifyFirebaseIdToken(idToken: string): Promise<{
  uid: string;
  email: string;
  displayName: string;
  emailVerified: boolean;
}> {
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(firebaseConfig.apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken }),
    }
  );
  if (!res.ok) {
    throw new Error('Token identitas Google/Firebase tidak valid.');
  }
  const data = (await res.json()) as {
    users?: Array<{
      localId: string;
      email?: string;
      displayName?: string;
      emailVerified?: boolean;
    }>;
  };
  const user = data.users?.[0];
  if (!user || !user.email) {
    throw new Error('Informasi akun Google tidak ditemukan.');
  }
  return {
    uid: user.localId,
    email: user.email.toLowerCase(),
    displayName: user.displayName || user.email,
    emailVerified: Boolean(user.emailVerified),
  };
}

export async function getOwnerDriveAccessToken(ownerId: string): Promise<string> {
  const row = db
    .prepare(
      `SELECT encrypted_refresh_token, token_iv, token_tag,
              encrypted_access_token, access_iv, access_tag, access_expires_at
       FROM owner_accounts WHERE id = ?`
    )
    .get(ownerId) as
    | {
        encrypted_refresh_token: string | null;
        token_iv: string | null;
        token_tag: string | null;
        encrypted_access_token: string | null;
        access_iv: string | null;
        access_tag: string | null;
        access_expires_at: string | null;
      }
    | undefined;

  if (!row) {
    throw new Error('Akun pemilik belum terhubung ke gateway.');
  }

  if (
    row.encrypted_access_token &&
    row.access_iv &&
    row.access_tag &&
    row.access_expires_at &&
    new Date(row.access_expires_at).getTime() > Date.now() + 60_000
  ) {
    return decryptSecret(row.encrypted_access_token, row.access_iv, row.access_tag);
  }

  if (
    row.encrypted_refresh_token &&
    row.token_iv &&
    row.token_tag &&
    process.env.GOOGLE_CLIENT_ID &&
    process.env.GOOGLE_CLIENT_SECRET
  ) {
    const refreshToken = decryptSecret(row.encrypted_refresh_token, row.token_iv, row.token_tag);
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    });
    if (tokenRes.ok) {
      const tokenJson = (await tokenRes.json()) as {
        access_token: string;
        expires_in?: number;
      };
      const enc = encryptSecret(tokenJson.access_token);
      const expiresAt = new Date(Date.now() + (tokenJson.expires_in ?? 3500) * 1000).toISOString();
      db.prepare(
        `UPDATE owner_accounts
         SET encrypted_access_token = ?, access_iv = ?, access_tag = ?, access_expires_at = ?, updated_at = ?
         WHERE id = ?`
      ).run(enc.ciphertext, enc.iv, enc.tag, expiresAt, new Date().toISOString(), ownerId);
      return tokenJson.access_token;
    }
  }

  throw new Error(
    'Sesi token Google Drive pemilik di gateway telah kedaluwarsa. Pemilik perlu membuka dashboard dan menyegarkan koneksi Google.'
  );
}

function escapeQuery(val: string): string {
  return val.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

export async function driveListFiles(
  accessToken: string,
  params: { q: string; pageSize?: number; pageToken?: string; orderBy?: string }
): Promise<{ files: GatewayDriveFile[]; nextPageToken?: string }> {
  const query = new URLSearchParams({
    q: params.q,
    fields:
      'nextPageToken,files(id,name,mimeType,size,createdTime,modifiedTime,parents,thumbnailLink,imageMediaMetadata)',
    pageSize: String(params.pageSize ?? 100),
    spaces: 'drive',
    supportsAllDrives: 'true',
    includeItemsFromAllDrives: 'true',
  });
  if (params.pageToken) query.set('pageToken', params.pageToken);
  if (params.orderBy) query.set('orderBy', params.orderBy);

  const res = await fetch(`${DRIVE_API_BASE}/files?${query.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error(`Google Drive API error (${res.status})`);
  }
  return (await res.json()) as { files: GatewayDriveFile[]; nextPageToken?: string };
}

export async function driveGetFileMetadata(
  accessToken: string,
  fileId: string
): Promise<GatewayDriveFile> {
  const query = new URLSearchParams({
    fields: 'id,name,mimeType,size,createdTime,modifiedTime,parents,thumbnailLink,imageMediaMetadata',
    supportsAllDrives: 'true',
  });
  const res = await fetch(`${DRIVE_API_BASE}/files/${encodeURIComponent(fileId)}?${query.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error(`File tidak ditemukan atau tidak dapat diakses (${res.status})`);
  }
  return (await res.json()) as GatewayDriveFile;
}

export async function listAllSubfoldersUnderRoot(
  accessToken: string,
  rootFolderId: string
): Promise<Map<string, GatewayDriveFile>> {
  const folderMap = new Map<string, GatewayDriveFile>();
  const queue: string[] = [rootFolderId];
  const visited = new Set<string>();

  while (queue.length > 0 && folderMap.size < 300) {
    const currentId = queue.shift()!;
    if (visited.has(currentId)) continue;
    visited.add(currentId);

    let pageToken: string | undefined;
    do {
      const res = await driveListFiles(accessToken, {
        q: `'${escapeQuery(currentId)}' in parents and mimeType = '${FOLDER_MIME_TYPE}' and trashed = false`,
        orderBy: 'name',
        pageSize: 100,
        pageToken,
      });
      for (const folder of res.files || []) {
        folderMap.set(folder.id, folder);
        queue.push(folder.id);
      }
      pageToken = res.nextPageToken;
    } while (pageToken);
  }

  return folderMap;
}

export async function fetchDriveMediaBuffer(
  accessToken: string,
  fileMeta: GatewayDriveFile,
  quality: 'data_saver' | 'hd' | 'original'
): Promise<{ buffer: Buffer; mimeType: string; fromCache: boolean }> {
  if (quality !== 'original') {
    const cached = db
      .prepare(
        `SELECT disk_path, mime_type, source_modified_time
         FROM photo_derivatives_cache
         WHERE drive_file_id = ? AND quality_tier = ?`
      )
      .get(fileMeta.id, quality) as
      | { disk_path: string; mime_type: string; source_modified_time: string | null }
      | undefined;

    if (
      cached &&
      cached.source_modified_time === (fileMeta.modifiedTime ?? null) &&
      fs.existsSync(cached.disk_path)
    ) {
      return {
        buffer: fs.readFileSync(cached.disk_path),
        mimeType: cached.mime_type,
        fromCache: true,
      };
    }

    if (fileMeta.thumbnailLink) {
      const targetSize = quality === 'data_saver' ? 480 : 1600;
      const sizedUrl = /=s\d+/.test(fileMeta.thumbnailLink)
        ? fileMeta.thumbnailLink.replace(/=s\d+/, `=s${targetSize}`)
        : fileMeta.thumbnailLink;

      const thumbRes = await fetch(sizedUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (thumbRes.ok) {
        const arrayBuf = await thumbRes.arrayBuffer();
        const buffer = Buffer.from(arrayBuf);
        const mimeType = thumbRes.headers.get('content-type') || 'image/jpeg';
        const safeName = `${fileMeta.id.replace(/[^a-zA-Z0-9_-]/g, '_')}_${quality}.bin`;
        const diskPath = path.join(getDerivativesDir(), safeName);
        fs.writeFileSync(diskPath, buffer);

        db.prepare(
          `INSERT INTO photo_derivatives_cache (id, drive_file_id, quality_tier, mime_type, byte_size, disk_path, source_modified_time, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(drive_file_id, quality_tier) DO UPDATE SET
             mime_type = excluded.mime_type,
             byte_size = excluded.byte_size,
             disk_path = excluded.disk_path,
             source_modified_time = excluded.source_modified_time,
             created_at = excluded.created_at`
        ).run(
          `${fileMeta.id}:${quality}`,
          fileMeta.id,
          quality,
          mimeType,
          buffer.byteLength,
          diskPath,
          fileMeta.modifiedTime ?? null,
          new Date().toISOString()
        );

        return { buffer, mimeType, fromCache: false };
      }
    }
  }

  // Fallback ke media asli (untuk mode original atau jika thumbnailLink tidak tersedia)
  const mediaRes = await fetch(
    `${DRIVE_API_BASE}/files/${encodeURIComponent(fileMeta.id)}?alt=media&supportsAllDrives=true`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!mediaRes.ok) {
    throw new Error(`Gagal mengambil media dari Google Drive (${mediaRes.status})`);
  }
  const buffer = Buffer.from(await mediaRes.arrayBuffer());
  const mimeType = mediaRes.headers.get('content-type') || fileMeta.mimeType || 'application/octet-stream';
  return { buffer, mimeType, fromCache: false };
}
