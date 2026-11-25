import express, { Request, Response } from 'express';
import { generateSecureToken, sha256Hex, verifyPassword } from '../crypto.js';
import { db, logGalleryEvent } from '../db.js';
import {
  driveGetFileMetadata,
  driveListFiles,
  fetchDriveMediaBuffer,
  GatewayDriveFile,
  getOwnerDriveAccessToken,
  listAllSubfoldersUnderRoot,
} from '../driveGateway.js';
import {
  authorizeFileAccess,
  GalleryRecord,
  isGalleryExpired,
  loadGalleryPermissions,
} from '../permissions.js';
import {
  checkPasswordRateLimit,
  clearPasswordFailures,
  recordPasswordFailure,
} from '../rateLimit.js';

export const familyRouter = express.Router();

const SESSION_COOKIE = 'fg_session';
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

function parseCookies(req: Request): Record<string, string> {
  const header = req.headers.cookie;
  if (!header) return {};
  const result: Record<string, string> = {};
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const val = decodeURIComponent(part.slice(idx + 1).trim());
    result[key] = val;
  }
  return result;
}

function setSessionCookie(res: Response, rawSessionToken: string, req: Request): void {
  const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
  res.cookie(SESSION_COOKIE, rawSessionToken, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isHttps,
    maxAge: SESSION_TTL_MS,
    path: '/',
  });
}

function resolveLinkAndGallery(rawToken: string): {
  gallery: GalleryRecord;
  linkId: string;
  passwordHash: string;
  linkRevokedAt: string | null;
} | null {
  const tokenHash = sha256Hex(rawToken);
  const row = db
    .prepare(
      `SELECT l.id AS linkId, l.password_hash AS passwordHash, l.revoked_at AS linkRevokedAt,
              g.*
       FROM sharing_links l
       JOIN family_galleries g ON g.id = l.gallery_id
       WHERE l.token_hash = ?`
    )
    .get(tokenHash) as
    | (GalleryRecord & {
        linkId: string;
        passwordHash: string;
        linkRevokedAt: string | null;
      })
    | undefined;

  if (!row) return null;
  return {
    gallery: row,
    linkId: row.linkId,
    passwordHash: row.passwordHash,
    linkRevokedAt: row.linkRevokedAt,
  };
}

function validateActiveSession(req: Request): {
  sessionId: string;
  gallery: GalleryRecord;
  viewerIdentifier: string;
  ownerRootFolderId: string | null;
} | null {
  const cookies = parseCookies(req);
  const rawSession = cookies[SESSION_COOKIE];
  if (!rawSession) return null;

  const sessionHash = sha256Hex(rawSession);
  const row = db
    .prepare(
      `SELECT s.id AS sessionId, s.expires_at AS sessionExpiresAt, s.revoked_at AS sessionRevokedAt,
              o.root_folder_id AS ownerRootFolderId,
              g.*
       FROM gallery_sessions s
       JOIN family_galleries g ON g.id = s.gallery_id
       JOIN owner_accounts o ON o.id = g.owner_id
       WHERE s.session_token_hash = ?`
    )
    .get(sessionHash) as
    | (GalleryRecord & {
        sessionId: string;
        sessionExpiresAt: string;
        sessionRevokedAt: string | null;
        ownerRootFolderId: string | null;
      })
    | undefined;

  if (!row) return null;
  if (row.sessionRevokedAt || row.status === 'revoked') return null;
  if (new Date(row.sessionExpiresAt).getTime() <= Date.now()) return null;
  if (isGalleryExpired(row.expires_at)) return null;

  db.prepare(`UPDATE gallery_sessions SET last_seen_at = ? WHERE id = ?`).run(
    new Date().toISOString(),
    row.sessionId
  );

  return {
    sessionId: row.sessionId,
    gallery: row,
    viewerIdentifier: `family-viewer:${row.sessionId.slice(0, 6)}`,
    ownerRootFolderId: row.ownerRootFolderId,
  };
}

familyRouter.get('/info', (req: Request, res: Response) => {
  const rawToken = typeof req.query.token === 'string' ? req.query.token.trim() : '';
  if (!rawToken) {
    res.status(400).json({ error: 'Token galeri tidak ditemukan.' });
    return;
  }

  const resolved = resolveLinkAndGallery(rawToken);
  if (!resolved) {
    res.status(404).json({ code: 'NOT_FOUND', error: 'Tautan galeri keluarga tidak ditemukan.' });
    return;
  }

  if (resolved.linkRevokedAt || resolved.gallery.status === 'revoked') {
    res.status(403).json({
      code: 'REVOKED',
      error: 'Tautan galeri ini telah dinonaktifkan atau dicabut oleh pemilik.',
    });
    return;
  }

  if (isGalleryExpired(resolved.gallery.expires_at)) {
    res.status(410).json({
      code: 'EXPIRED',
      error: 'Tautan galeri ini telah melewati batas waktu kedaluwarsa.',
    });
    return;
  }

  const session = validateActiveSession(req);
  const isAuthenticated = Boolean(session && session.gallery.id === resolved.gallery.id);

  res.json({
    galleryId: resolved.gallery.id,
    name: resolved.gallery.name,
    defaultQuality: resolved.gallery.default_quality,
    expiresAt: resolved.gallery.expires_at,
    isAuthenticated,
  });
});

familyRouter.post('/auth/password', (req: Request, res: Response) => {
  const { token, password } = req.body as { token?: string; password?: string };
  if (!token || !password) {
    res.status(400).json({ error: 'Token dan password wajib diisi.' });
    return;
  }

  const resolved = resolveLinkAndGallery(token.trim());
  if (!resolved) {
    res.status(404).json({ error: 'Tautan galeri tidak ditemukan.' });
    return;
  }

  if (resolved.linkRevokedAt || resolved.gallery.status === 'revoked') {
    res.status(403).json({ error: 'Tautan galeri ini telah dicabut atau dinonaktifkan.' });
    return;
  }

  if (isGalleryExpired(resolved.gallery.expires_at)) {
    res.status(410).json({ error: 'Tautan galeri telah kedaluwarsa.' });
    return;
  }

  const rateKey = `${req.ip || 'unknown'}:${sha256Hex(token.trim())}`;
  const rate = checkPasswordRateLimit(rateKey);
  if (!rate.allowed) {
    logGalleryEvent({
      id: generateSecureToken(9),
      galleryId: resolved.gallery.id,
      eventType: 'rate_limited',
      viewerIdentifier: req.ip || 'unknown',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
    res.status(429).json({
      error: `Terlalu banyak percobaan password salah. Coba lagi dalam ${Math.ceil(rate.retryAfterSec / 60)} menit.`,
    });
    return;
  }

  if (!verifyPassword(password, resolved.passwordHash)) {
    recordPasswordFailure(rateKey);
    logGalleryEvent({
      id: generateSecureToken(9),
      galleryId: resolved.gallery.id,
      eventType: 'auth_failed',
      viewerIdentifier: req.ip || 'unknown',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
    res.status(401).json({ error: 'Password galeri tidak sesuai. Silakan periksa kembali.' });
    return;
  }

  clearPasswordFailures(rateKey);
  const rawSession = generateSecureToken(32);
  const sessionId = generateSecureToken(12);
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();

  db.prepare(
    `INSERT INTO gallery_sessions (id, gallery_id, session_token_hash, auth_method, expires_at, created_at, last_seen_at)
     VALUES (?, ?, ?, 'password', ?, ?, ?)`
  ).run(sessionId, resolved.gallery.id, sha256Hex(rawSession), expiresAt, now, now);

  logGalleryEvent({
    id: generateSecureToken(9),
    galleryId: resolved.gallery.id,
    eventType: 'auth_success',
    viewerIdentifier: 'family-viewer',
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
  });

  setSessionCookie(res, rawSession, req);
  res.json({ ok: true });
});

familyRouter.post('/logout', (req: Request, res: Response) => {
  const cookies = parseCookies(req);
  const rawSession = cookies[SESSION_COOKIE];
  if (rawSession) {
    db.prepare(`UPDATE gallery_sessions SET revoked_at = ? WHERE session_token_hash = ?`).run(
      new Date().toISOString(),
      sha256Hex(rawSession)
    );
  }
  res.clearCookie(SESSION_COOKIE, { path: '/' });
  res.json({ ok: true });
});

familyRouter.patch('/preferences', (req: Request, res: Response) => {
  const session = validateActiveSession(req);
  if (!session) {
    res.status(401).json({ error: 'Sesi galeri tidak valid atau telah berakhir.' });
    return;
  }
  const { preferredQuality } = req.body as {
    preferredQuality?: 'data_saver' | 'hd' | 'auto' | 'original';
  };
  if (!preferredQuality || !['data_saver', 'hd', 'auto', 'original'].includes(preferredQuality)) {
    res.status(400).json({ error: 'Pilihan kualitas tidak valid.' });
    return;
  }

  db.prepare(
    `INSERT INTO viewer_preferences (session_id, preferred_quality, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(session_id) DO UPDATE SET preferred_quality = excluded.preferred_quality, updated_at = excluded.updated_at`
  ).run(session.sessionId, preferredQuality, new Date().toISOString());

  res.json({ ok: true, preferredQuality });
});

familyRouter.get('/content', async (req: Request, res: Response) => {
  const session = validateActiveSession(req);
  if (!session) {
    res.status(401).json({ error: 'Sesi galeri tidak valid, kedaluwarsa, atau telah dicabut.' });
    return;
  }

  try {
    const accessToken = await getOwnerDriveAccessToken(session.gallery.owner_id);
    const { albumMap, photoMap } = loadGalleryPermissions(session.gallery.id);

    const prefRow = db
      .prepare(`SELECT preferred_quality FROM viewer_preferences WHERE session_id = ?`)
      .get(session.sessionId) as { preferred_quality: string } | undefined;

    const albums: Array<{ id: string; name: string; allowDownload: boolean; photoCount: number }> = [];
    const photos: Array<{
      id: string;
      name: string;
      mimeType: string;
      sizeBytes: number;
      folderId: string;
      folderName: string;
      displayDate: string;
      width?: number;
      height?: number;
      allowDownload: boolean;
    }> = [];

    const seenPhotoIds = new Set<string>();
    const mapDrivePhoto = (
      f: GatewayDriveFile,
      folderId: string,
      folderName: string,
      allowDownload: boolean
    ) => {
      if (seenPhotoIds.has(f.id)) return;
      seenPhotoIds.add(f.id);
      photos.push({
        id: f.id,
        name: f.name,
        mimeType: f.mimeType,
        sizeBytes: f.size ? Number.parseInt(f.size, 10) || 0 : 0,
        folderId,
        folderName,
        displayDate: f.createdTime || f.modifiedTime || '',
        width: f.imageMediaMetadata?.width,
        height: f.imageMediaMetadata?.height,
        allowDownload,
      });
    };

    if (session.gallery.content_mode === 'all_albums' && session.ownerRootFolderId) {
      const subfolders = await listAllSubfoldersUnderRoot(accessToken, session.ownerRootFolderId);
      const targetFolders = [
        { id: session.ownerRootFolderId, name: 'Utama' },
        ...Array.from(subfolders.values()).map((f) => ({ id: f.id, name: f.name })),
      ];
      for (const folder of targetFolders) {
        const resFiles = await driveListFiles(accessToken, {
          q: `'${folder.id.replace(/'/g, "\\'")}' in parents and mimeType contains 'image/' and trashed = false`,
          orderBy: 'createdTime desc',
          pageSize: 100,
        });
        const folderPhotos = resFiles.files || [];
        if (folderPhotos.length > 0) {
          albums.push({
            id: folder.id,
            name: folder.name,
            allowDownload: Boolean(session.gallery.allow_download_default),
            photoCount: folderPhotos.length,
          });
          for (const p of folderPhotos) {
            mapDrivePhoto(
              p,
              folder.id,
              folder.name,
              Boolean(session.gallery.allow_download_default)
            );
          }
        }
      }
    } else {
      if (
        session.gallery.content_mode === 'selected_albums' ||
        session.gallery.content_mode === 'mixed'
      ) {
        for (const [folderId, info] of albumMap.entries()) {
          const resFiles = await driveListFiles(accessToken, {
            q: `'${folderId.replace(/'/g, "\\'")}' in parents and mimeType contains 'image/' and trashed = false`,
            orderBy: 'createdTime desc',
            pageSize: 100,
          });
          const folderPhotos = resFiles.files || [];
          albums.push({
            id: folderId,
            name: info.folderName,
            allowDownload: info.allowDownload,
            photoCount: folderPhotos.length,
          });
          for (const p of folderPhotos) {
            mapDrivePhoto(p, folderId, info.folderName, info.allowDownload);
          }
        }
      }

      if (
        session.gallery.content_mode === 'custom_photos' ||
        session.gallery.content_mode === 'mixed'
      ) {
        for (const [fileId, perm] of photoMap.entries()) {
          if (seenPhotoIds.has(fileId)) continue;
          try {
            const meta = await driveGetFileMetadata(accessToken, fileId);
            mapDrivePhoto(meta, perm.parentFolderId, 'Foto Pilihan', perm.allowDownload);
          } catch {
            // Abaikan jika file di Drive terhapus
          }
        }
      }
    }

    res.setHeader('Cache-Control', 'private, no-store, max-age=0');
    res.json({
      gallery: {
        id: session.gallery.id,
        name: session.gallery.name,
        defaultQuality: session.gallery.default_quality,
        preferredQuality: prefRow?.preferred_quality || session.gallery.default_quality,
        expiresAt: session.gallery.expires_at,
      },
      albums,
      photos,
    });
  } catch (err) {
    res.status(502).json({
      error: err instanceof Error ? err.message : 'Gagal memuat konten galeri.',
    });
  }
});

familyRouter.get('/media/:fileId', async (req: Request, res: Response) => {
  const session = validateActiveSession(req);
  if (!session) {
    res.status(401).json({ error: 'Sesi galeri tidak valid atau telah dicabut.' });
    return;
  }

  const fileId = String(req.params.fileId);
  const rawQuality = typeof req.query.quality === 'string' ? req.query.quality : 'data_saver';
  const quality: 'data_saver' | 'hd' | 'original' =
    rawQuality === 'original' ? 'original' : rawQuality === 'hd' ? 'hd' : 'data_saver';

  try {
    const accessToken = await getOwnerDriveAccessToken(session.gallery.owner_id);
    const fileMeta = await driveGetFileMetadata(accessToken, fileId);
    const authz = await authorizeFileAccess({
      gallery: session.gallery,
      fileMeta,
      accessToken,
      ownerRootFolderId: session.ownerRootFolderId,
    });

    if (!authz.allowed) {
      res.status(403).json({ error: 'Anda tidak memiliki izin untuk mengakses foto ini.' });
      return;
    }

    const media = await fetchDriveMediaBuffer(accessToken, fileMeta, quality);

    res.setHeader('Content-Type', media.mimeType);
    res.setHeader('Content-Length', String(media.buffer.byteLength));
    res.setHeader('Cache-Control', 'private, no-store, max-age=0');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.send(media.buffer);
  } catch (err) {
    res.status(502).json({
      error: err instanceof Error ? err.message : 'Gagal memuat gambar.',
    });
  }
});

familyRouter.get('/download/:fileId', async (req: Request, res: Response) => {
  const session = validateActiveSession(req);
  if (!session) {
    res.status(401).json({ error: 'Sesi galeri tidak valid atau telah dicabut.' });
    return;
  }

  const fileId = String(req.params.fileId);
  const rawType = req.query.type;
  if (rawType && rawType !== 'original' && rawType !== 'compress') {
    res.status(400).json({ error: 'Tipe unduhan tidak didukung. Gunakan original atau compress.' });
    return;
  }
  const downloadType = rawType === 'compress' ? 'compress' : 'original';

  try {
    const { albumMap, photoMap } = loadGalleryPermissions(session.gallery.id);

    // Fast-path: reject download immediately if gallery or all shared items have download disabled
    if (session.gallery.content_mode === 'all_albums' && !session.gallery.allow_download_default) {
      res.status(403).json({ error: 'Izin unduh dinonaktifkan untuk foto atau album ini.' });
      return;
    }
    if (
      session.gallery.content_mode === 'selected_albums' &&
      Array.from(albumMap.values()).every((a) => !a.allowDownload)
    ) {
      res.status(403).json({ error: 'Izin unduh dinonaktifkan untuk foto atau album ini.' });
      return;
    }
    const directPhotoPerm = photoMap.get(fileId);
    if (directPhotoPerm && !directPhotoPerm.allowDownload) {
      res.status(403).json({ error: 'Izin unduh dinonaktifkan untuk foto atau album ini.' });
      return;
    }

    const accessToken = await getOwnerDriveAccessToken(session.gallery.owner_id);
    const fileMeta = await driveGetFileMetadata(accessToken, fileId);
    const authz = await authorizeFileAccess({
      gallery: session.gallery,
      fileMeta,
      accessToken,
      ownerRootFolderId: session.ownerRootFolderId,
    });

    if (!authz.allowed) {
      res.status(403).json({ error: 'Foto tidak termasuk dalam galeri ini.' });
      return;
    }

    if (!authz.allowDownload) {
      res.status(403).json({ error: 'Izin unduh dinonaktifkan untuk foto atau album ini.' });
      return;
    }

    const qualityTier = downloadType === 'compress' ? 'hd' : 'original';
    const media = await fetchDriveMediaBuffer(accessToken, fileMeta, qualityTier);

    logGalleryEvent({
      id: generateSecureToken(9),
      galleryId: session.gallery.id,
      eventType: downloadType === 'compress' ? 'download_compressed' : 'download_original',
      viewerIdentifier: session.viewerIdentifier,
      targetId: fileMeta.id,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    const baseName = fileMeta.name.replace(/["\r\n]/g, '_');
    const safeFileName = downloadType === 'compress' ? `compressed_${baseName}` : baseName;
    const asciiFileName = safeFileName.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '');
    const encodedFileName = encodeURIComponent(safeFileName);

    res.setHeader('Content-Type', media.mimeType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${asciiFileName}"; filename*=UTF-8''${encodedFileName}`
    );
    res.setHeader('Content-Length', String(media.buffer.byteLength));
    res.setHeader('Cache-Control', 'private, no-store, max-age=0');
    res.send(media.buffer);
  } catch (err) {
    res.status(502).json({
      error: err instanceof Error ? err.message : 'Gagal mengunduh file.',
    });
  }
});
