import express, { Request, Response, NextFunction } from 'express';
import { Readable } from 'node:stream';
import { decryptSecret, encryptSecret, generateSecureToken, hashPassword, sha256Hex } from '../crypto.js';
import { db } from '../db.js';
import { verifyFirebaseIdToken } from '../driveGateway.js';
import { GalleryRecord, revokeGallerySessions } from '../permissions.js';

export const ownerRouter = express.Router();

interface AuthedOwnerRequest extends Request {
  ownerId?: string;
}

async function requireOwnerAuth(req: AuthedOwnerRequest, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Autentikasi pemilik diperlukan.' });
      return;
    }
    const idToken = authHeader.slice('Bearer '.length).trim();
    const verified = await verifyFirebaseIdToken(idToken);
    const owner = db
      .prepare(`SELECT id FROM owner_accounts WHERE google_uid = ?`)
      .get(verified.uid) as { id: string } | undefined;

    if (!owner) {
      const now = new Date().toISOString();
      const newId = generateSecureToken(12);
      db.prepare(
        `INSERT INTO owner_accounts (id, google_uid, email, display_name, updated_at)
         VALUES (?, ?, ?, ?, ?)`
      ).run(newId, verified.uid, verified.email, verified.displayName, now);
      req.ownerId = newId;
    } else {
      req.ownerId = owner.id;
    }
    next();
  } catch (err) {
    res.status(401).json({
      error: err instanceof Error ? err.message : 'Token pemilik tidak valid.',
    });
  }
}

ownerRouter.post('/session', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Firebase ID token diperlukan.' });
      return;
    }
    const idToken = authHeader.slice('Bearer '.length).trim();
    const verified = await verifyFirebaseIdToken(idToken);
    const { driveAccessToken, rootFolderId, rootFolderName } = req.body as {
      driveAccessToken?: string;
      rootFolderId?: string;
      rootFolderName?: string;
    };

    const now = new Date().toISOString();
    const existing = db
      .prepare(`SELECT id FROM owner_accounts WHERE google_uid = ?`)
      .get(verified.uid) as { id: string } | undefined;

    const ownerId = existing?.id || generateSecureToken(12);
    if (!existing) {
      db.prepare(
        `INSERT INTO owner_accounts (id, google_uid, email, display_name, root_folder_id, root_folder_name, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run(
        ownerId,
        verified.uid,
        verified.email,
        verified.displayName,
        rootFolderId ?? null,
        rootFolderName ?? null,
        now
      );
    } else {
      db.prepare(
        `UPDATE owner_accounts
         SET email = ?, display_name = ?, root_folder_id = COALESCE(?, root_folder_id),
             root_folder_name = COALESCE(?, root_folder_name), updated_at = ?
         WHERE id = ?`
      ).run(
        verified.email,
        verified.displayName,
        rootFolderId ?? null,
        rootFolderName ?? null,
        now,
        ownerId
      );
    }

    if (driveAccessToken) {
      const enc = encryptSecret(driveAccessToken);
      const expiresAt = new Date(Date.now() + 50 * 60 * 1000).toISOString();
      db.prepare(
        `UPDATE owner_accounts
         SET encrypted_access_token = ?, access_iv = ?, access_tag = ?, access_expires_at = ?, updated_at = ?
         WHERE id = ?`
      ).run(enc.ciphertext, enc.iv, enc.tag, expiresAt, now, ownerId);
    }

    res.json({ ok: true, ownerId, email: verified.email });
  } catch (err) {
    res.status(401).json({
      error: err instanceof Error ? err.message : 'Gagal menyinkronkan sesi gateway.',
    });
  }
});

interface StreamTicket {
  token: string;
  fileId: string;
  expiresAt: number;
}

const streamTickets = new Map<string, StreamTicket>();

function cleanExpiredTickets() {
  const now = Date.now();
  for (const [id, ticket] of streamTickets.entries()) {
    if (ticket.expiresAt < now) {
      streamTickets.delete(id);
    }
  }
}

/**
 * Buat ticket streaming video jangka pendek (2 jam).
 * Menghilangkan kebutuhan menaruh access token Google di query string URL atau log.
 */
ownerRouter.post('/video/ticket', (req: Request, res: Response) => {
  cleanExpiredTickets();

  let token = '';
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.slice('Bearer '.length).trim();
  } else if (typeof req.body?.token === 'string') {
    token = req.body.token.trim();
  }

  const fileId = typeof req.body?.fileId === 'string' ? req.body.fileId.trim() : '';
  if (!token || !fileId) {
    res.status(400).json({ error: 'fileId dan token akses Google Drive diperlukan.' });
    return;
  }

  const ticketId = generateSecureToken(24);
  streamTickets.set(ticketId, {
    token,
    fileId,
    expiresAt: Date.now() + 2 * 60 * 60 * 1000,
  });

  res.json({
    ok: true,
    ticket: ticketId,
    streamUrl: `/api/owner/video/stream/${encodeURIComponent(fileId)}?ticket=${ticketId}`,
    thumbnailUrl: `/api/owner/video/thumbnail/${encodeURIComponent(fileId)}?ticket=${ticketId}`,
  });
});

/**
 * Endpoint Streaming Video dengan HTTP Range Request Support.
 * Mengalirkan byte ranges langsung dari Google Drive v3 ke browser HTML5 <video>.
 * Mendukung autentikasi via Ticket (aman tanpa token di URL), Bearer Header, atau fallback token.
 * Menangani redirect cross-origin Google Drive dengan aman.
 */
ownerRouter.get('/video/stream/:fileId', async (req: Request, res: Response) => {
  const fileId = String(req.params.fileId);

  // 1. Ekstrak token melalui Ticket aman atau Authorization Header
  let token = '';
  const ticketParam = typeof req.query.ticket === 'string' ? req.query.ticket.trim() : '';
  if (ticketParam && streamTickets.has(ticketParam)) {
    const ticketData = streamTickets.get(ticketParam)!;
    if (ticketData.fileId === fileId && ticketData.expiresAt > Date.now()) {
      token = ticketData.token;
    }
  }

  if (!token) {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.slice('Bearer '.length).trim();
    } else if (typeof req.query.token === 'string') {
      token = req.query.token.trim();
    }
  }

  if (!token) {
    res.status(401).json({ error: 'Autentikasi Google Drive diperlukan untuk memutar video.' });
    return;
  }

  try {
    let driveUrl = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`;
    const driveHeaders: Record<string, string> = {
      Authorization: `Bearer ${token}`,
    };

    if (req.headers.range) {
      driveHeaders['Range'] = req.headers.range;
    }

    // 2. Gunakan redirect manual agar token Authorization tidak dilucuti saat redirect cross-origin
    let driveRes = await fetch(driveUrl, {
      headers: driveHeaders,
      redirect: 'manual',
    });

    if ([301, 302, 303, 307, 308].includes(driveRes.status)) {
      const redirectLocation = driveRes.headers.get('location');
      if (redirectLocation) {
        driveUrl = redirectLocation;
        driveRes = await fetch(driveUrl, {
          headers: driveHeaders,
        });
      }
    }

    if (!driveRes.ok && driveRes.status !== 206) {
      res.status(driveRes.status).json({
        error: `Gagal memuat video dari Google Drive (${driveRes.status})`,
      });
      return;
    }

    res.status(driveRes.status);
    const contentRange = driveRes.headers.get('content-range');
    const contentLength = driveRes.headers.get('content-length');
    let contentType = driveRes.headers.get('content-type') || '';

    // Deteksi MIME type video akurat jika Google Drive mengembalikan octet-stream
    if (!contentType || contentType === 'application/octet-stream') {
      const fileName = typeof req.query.name === 'string' ? req.query.name.toLowerCase() : '';
      if (fileName.endsWith('.mp4')) {
        contentType = 'video/mp4';
      } else if (fileName.endsWith('.3gp') || fileName.endsWith('.3gpp')) {
        contentType = 'video/3gpp';
      } else if (fileName.endsWith('.mov')) {
        contentType = 'video/quicktime';
      } else if (fileName.endsWith('.webm')) {
        contentType = 'video/webm';
      } else if (fileName.endsWith('.mkv')) {
        contentType = 'video/x-matroska';
      } else {
        contentType = 'video/mp4';
      }
    }

    if (contentRange) res.setHeader('Content-Range', contentRange);
    if (contentLength) res.setHeader('Content-Length', contentLength);
    res.setHeader('Content-Type', contentType);
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', 'private, no-cache');

    if (driveRes.body) {
      const stream = Readable.fromWeb(driveRes.body as any);
      req.on('close', () => {
        stream.destroy();
      });
      stream.pipe(res);
    } else {
      res.end();
    }
  } catch (err) {
    res.status(502).json({
      error: err instanceof Error ? err.message : 'Gangguan saat streaming video.',
    });
  }
});

/**
 * Endpoint Proxy Thumbnail Video Terautentikasi.
 * Mengambil dan mengalirkan thumbnail resmi Google Drive dengan aman.
 */
ownerRouter.get('/video/thumbnail/:fileId', async (req: Request, res: Response) => {
  const fileId = String(req.params.fileId);

  let token = '';
  const ticketParam = typeof req.query.ticket === 'string' ? req.query.ticket.trim() : '';
  if (ticketParam && streamTickets.has(ticketParam)) {
    const ticketData = streamTickets.get(ticketParam)!;
    if (ticketData.fileId === fileId && ticketData.expiresAt > Date.now()) {
      token = ticketData.token;
    }
  }

  if (!token) {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.slice('Bearer '.length).trim();
    } else if (typeof req.query.token === 'string') {
      token = req.query.token.trim();
    }
  }

  if (!token) {
    res.status(401).json({ error: 'Token akses diperlukan.' });
    return;
  }

  try {
    const metaUrl = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=id,name,thumbnailLink&supportsAllDrives=true`;
    const metaRes = await fetch(metaUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!metaRes.ok) {
      res.status(metaRes.status).json({ error: 'Gagal membaca metadata thumbnail' });
      return;
    }

    const meta = (await metaRes.json()) as { thumbnailLink?: string };
    if (!meta.thumbnailLink) {
      res.status(404).json({ error: 'Thumbnail belum dibuat oleh Google Drive' });
      return;
    }

    const targetSize = req.query.size ? Number(req.query.size) : 480;
    const sizedUrl = meta.thumbnailLink.replace(/=s\d+/, `=s${targetSize}`);

    const imgRes = await fetch(sizedUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!imgRes.ok) {
      // Fallback tanpa Authorization jika googleusercontent menolak header Bearer
      const unauthRes = await fetch(sizedUrl);
      if (unauthRes.ok) {
        res.setHeader('Content-Type', unauthRes.headers.get('content-type') || 'image/jpeg');
        res.setHeader('Cache-Control', 'private, max-age=86400');
        if (unauthRes.body) {
          Readable.fromWeb(unauthRes.body as any).pipe(res);
          return;
        }
      }
      res.status(imgRes.status).json({ error: 'Gagal memuat gambar thumbnail' });
      return;
    }

    res.setHeader('Content-Type', imgRes.headers.get('content-type') || 'image/jpeg');
    res.setHeader('Cache-Control', 'private, max-age=86400');
    if (imgRes.body) {
      Readable.fromWeb(imgRes.body as any).pipe(res);
    } else {
      res.end();
    }
  } catch (err) {
    res.status(502).json({
      error: err instanceof Error ? err.message : 'Gangguan saat memuat thumbnail.',
    });
  }
});

ownerRouter.use(requireOwnerAuth);

ownerRouter.get('/galleries', (req: AuthedOwnerRequest, res: Response) => {
  const galleries = db
    .prepare(`SELECT * FROM family_galleries WHERE owner_id = ? ORDER BY created_at DESC`)
    .all(req.ownerId!) as unknown as GalleryRecord[];

  const enriched = galleries.map((g) => {
    const albums = db
      .prepare(
        `SELECT drive_folder_id AS folderId, folder_name AS folderName, allow_download AS allowDownload
         FROM gallery_album_permissions WHERE gallery_id = ?`
      )
      .all(g.id) as Array<{ folderId: string; folderName: string; allowDownload: number }>;

    const photos = db
      .prepare(
        `SELECT drive_file_id AS fileId, parent_folder_id AS parentFolderId, file_name AS fileName, allow_download AS allowDownload
         FROM gallery_photo_permissions WHERE gallery_id = ?`
      )
      .all(g.id) as Array<{
      fileId: string;
      parentFolderId: string;
      fileName: string;
      allowDownload: number;
    }>;

    const activeLink = db
      .prepare(
        `SELECT id, encrypted_display_password, display_password_iv, display_password_tag, password_updated_at, created_at
         FROM sharing_links WHERE gallery_id = ? AND revoked_at IS NULL ORDER BY created_at DESC LIMIT 1`
      )
      .get(g.id) as
      | {
          id: string;
          encrypted_display_password: string | null;
          display_password_iv: string | null;
          display_password_tag: string | null;
          password_updated_at: string | null;
          created_at: string;
        }
      | undefined;

    let displayPassword = '';
    if (
      activeLink?.encrypted_display_password &&
      activeLink.display_password_iv &&
      activeLink.display_password_tag
    ) {
      try {
        displayPassword = decryptSecret(
          activeLink.encrypted_display_password,
          activeLink.display_password_iv,
          activeLink.display_password_tag
        );
      } catch {
        displayPassword = '';
      }
    }

    const logs = db
      .prepare(
        `SELECT id, event_type AS eventType, viewer_identifier AS viewerIdentifier, target_id AS targetId, created_at AS createdAt
         FROM gallery_access_logs WHERE gallery_id = ? ORDER BY created_at DESC LIMIT 25`
      )
      .all(g.id);

    const isExpired = Boolean(g.expires_at && new Date(g.expires_at).getTime() <= Date.now());
    const computedStatus =
      g.status === 'revoked' ? 'revoked' : isExpired ? 'expired' : 'active';

    return {
      id: g.id,
      name: g.name,
      contentMode: g.content_mode,
      defaultQuality: g.default_quality,
      allowDownloadDefault: Boolean(g.allow_download_default),
      status: computedStatus,
      expiresAt: g.expires_at,
      createdAt: g.created_at,
      updatedAt: g.updated_at,
      hasPassword: true,
      displayPassword,
      hasActiveLink: Boolean(activeLink),
      albums: albums.map((a) => ({ ...a, allowDownload: Boolean(a.allowDownload) })),
      photos: photos.map((p) => ({ ...p, allowDownload: Boolean(p.allowDownload) })),
      recentLogs: logs,
    };
  });

  res.json({ galleries: enriched });
});

ownerRouter.post('/galleries', (req: AuthedOwnerRequest, res: Response) => {
  try {
    const body = req.body as {
      name?: string;
      contentMode?: 'all_albums' | 'selected_albums' | 'custom_photos' | 'mixed';
      defaultQuality?: 'data_saver' | 'hd' | 'auto' | 'original';
      allowDownloadDefault?: boolean;
      expiresAt?: string | null;
      password?: string;
      albums?: Array<{ folderId: string; folderName: string; allowDownload?: boolean }>;
      photos?: Array<{
        fileId: string;
        parentFolderId: string;
        fileName: string;
        allowDownload?: boolean;
      }>;
    };

    if (!body.name || !body.name.trim()) {
      res.status(400).json({ error: 'Nama galeri wajib diisi.' });
      return;
    }

    if (!body.password || body.password.length < 4) {
      res.status(400).json({ error: 'Password minimal 4 karakter untuk tautan privat.' });
      return;
    }

    const contentMode = body.contentMode || 'selected_albums';
    const albums = body.albums || [];
    const photos = body.photos || [];

    if (contentMode === 'selected_albums' && albums.length === 0) {
      res.status(400).json({ error: 'Pilih minimal satu album untuk dibagikan.' });
      return;
    }

    if (contentMode === 'custom_photos' && photos.length === 0) {
      res.status(400).json({ error: 'Pilih minimal satu foto untuk dibagikan.' });
      return;
    }

    if (contentMode === 'mixed' && albums.length === 0 && photos.length === 0) {
      res.status(400).json({ error: 'Pilih minimal satu album atau foto untuk mode campuran.' });
      return;
    }

    const galleryId = generateSecureToken(12);
    const now = new Date().toISOString();
    const defaultQuality = body.defaultQuality || 'auto';
    const allowDownloadDefault = body.allowDownloadDefault ? 1 : 0;

    // Use transaction for atomic consistency
    db.exec('BEGIN TRANSACTION;');
    try {
      db.prepare(
        `INSERT INTO family_galleries (id, owner_id, name, content_mode, default_quality, allow_download_default, status, expires_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)`
      ).run(
        galleryId,
        req.ownerId!,
        body.name.trim(),
        contentMode,
        defaultQuality,
        allowDownloadDefault,
        body.expiresAt ?? null,
        now,
        now
      );

      for (const album of albums) {
        db.prepare(
          `INSERT OR IGNORE INTO gallery_album_permissions (id, gallery_id, drive_folder_id, folder_name, allow_download, created_at)
           VALUES (?, ?, ?, ?, ?, ?)`
        ).run(
          generateSecureToken(9),
          galleryId,
          album.folderId,
          album.folderName,
          album.allowDownload !== undefined ? (album.allowDownload ? 1 : 0) : allowDownloadDefault,
          now
        );
      }

      for (const photo of photos) {
        db.prepare(
          `INSERT OR IGNORE INTO gallery_photo_permissions (id, gallery_id, drive_file_id, parent_folder_id, file_name, allow_download, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        ).run(
          generateSecureToken(9),
          galleryId,
          photo.fileId,
          photo.parentFolderId,
          photo.fileName,
          photo.allowDownload !== undefined ? (photo.allowDownload ? 1 : 0) : allowDownloadDefault,
          now
        );
      }

      const rawToken = generateSecureToken(32);
      const tokenHash = sha256Hex(rawToken);
      const passwordHash = hashPassword(body.password);
      const encDisplayPw = encryptSecret(body.password);

      db.prepare(
        `INSERT INTO sharing_links (id, gallery_id, token_hash, password_hash, encrypted_display_password, display_password_iv, display_password_tag, password_updated_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        generateSecureToken(9),
        galleryId,
        tokenHash,
        passwordHash,
        encDisplayPw.ciphertext,
        encDisplayPw.iv,
        encDisplayPw.tag,
        now,
        now
      );

      db.exec('COMMIT;');

      res.status(201).json({
        galleryId,
        shareToken: rawToken,
      });
    } catch (txErr) {
      db.exec('ROLLBACK;');
      throw txErr;
    }
  } catch (err) {
    console.error('[OwnerAPI] Error creating gallery:', err);
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Gagal membuat tautan galeri privat.',
    });
  }
});

ownerRouter.patch('/galleries/:id', (req: AuthedOwnerRequest, res: Response) => {
  const galleryId = String(req.params.id);
  const existing = db
    .prepare(`SELECT * FROM family_galleries WHERE id = ? AND owner_id = ?`)
    .get(galleryId, req.ownerId!) as GalleryRecord | undefined;

  if (!existing) {
    res.status(404).json({ error: 'Galeri tidak ditemukan.' });
    return;
  }

  const body = req.body as {
    name?: string;
    contentMode?: 'all_albums' | 'selected_albums' | 'custom_photos' | 'mixed';
    defaultQuality?: 'data_saver' | 'hd' | 'auto' | 'original';
    allowDownloadDefault?: boolean;
    expiresAt?: string | null;
    newPassword?: string;
    albums?: Array<{ folderId: string; folderName: string; allowDownload?: boolean }>;
    photos?: Array<{
      fileId: string;
      parentFolderId: string;
      fileName: string;
      allowDownload?: boolean;
    }>;
    reactivate?: boolean;
  };

  const now = new Date().toISOString();
  const nextDownloadDefault =
    body.allowDownloadDefault !== undefined
      ? body.allowDownloadDefault
        ? 1
        : 0
      : existing.allow_download_default;

  db.prepare(
    `UPDATE family_galleries
     SET name = COALESCE(?, name),
         content_mode = COALESCE(?, content_mode),
         default_quality = COALESCE(?, default_quality),
         allow_download_default = ?,
         expires_at = ?,
         status = ?,
         updated_at = ?
     WHERE id = ?`
  ).run(
    body.name?.trim() || null,
    body.contentMode || null,
    body.defaultQuality || null,
    nextDownloadDefault,
    body.expiresAt !== undefined ? body.expiresAt : existing.expires_at,
    body.reactivate ? 'active' : existing.status,
    now,
    galleryId
  );

  let shouldRevokeSessions = false;

  if (body.albums !== undefined) {
    db.prepare(`DELETE FROM gallery_album_permissions WHERE gallery_id = ?`).run(galleryId);
    for (const album of body.albums) {
      db.prepare(
        `INSERT OR IGNORE INTO gallery_album_permissions (id, gallery_id, drive_folder_id, folder_name, allow_download, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run(
        generateSecureToken(9),
        galleryId,
        album.folderId,
        album.folderName,
        album.allowDownload !== undefined ? (album.allowDownload ? 1 : 0) : nextDownloadDefault,
        now
      );
    }
    shouldRevokeSessions = true;
  }

  if (body.photos !== undefined) {
    db.prepare(`DELETE FROM gallery_photo_permissions WHERE gallery_id = ?`).run(galleryId);
    for (const photo of body.photos) {
      db.prepare(
        `INSERT OR IGNORE INTO gallery_photo_permissions (id, gallery_id, drive_file_id, parent_folder_id, file_name, allow_download, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run(
        generateSecureToken(9),
        galleryId,
        photo.fileId,
        photo.parentFolderId,
        photo.fileName,
        photo.allowDownload !== undefined ? (photo.allowDownload ? 1 : 0) : nextDownloadDefault,
        now
      );
    }
    shouldRevokeSessions = true;
  }

  if (body.newPassword && body.newPassword.length >= 4) {
    const newHash = hashPassword(body.newPassword);
    const encDisplayPw = encryptSecret(body.newPassword);
    db.prepare(
      `UPDATE sharing_links
       SET password_hash = ?,
           encrypted_display_password = ?,
           display_password_iv = ?,
           display_password_tag = ?,
           password_updated_at = ?
       WHERE gallery_id = ? AND revoked_at IS NULL`
    ).run(newHash, encDisplayPw.ciphertext, encDisplayPw.iv, encDisplayPw.tag, now, galleryId);
    shouldRevokeSessions = true;
  }

  if (shouldRevokeSessions) {
    revokeGallerySessions(galleryId);
  }

  res.json({ ok: true });
});

ownerRouter.post('/galleries/:id/change-password', (req: AuthedOwnerRequest, res: Response) => {
  const galleryId = String(req.params.id);
  const { newPassword } = req.body as { newPassword?: string };

  if (!newPassword || newPassword.length < 4) {
    res.status(400).json({ error: 'Password baru minimal 4 karakter.' });
    return;
  }

  const existing = db
    .prepare(`SELECT id FROM family_galleries WHERE id = ? AND owner_id = ?`)
    .get(galleryId, req.ownerId!);

  if (!existing) {
    res.status(404).json({ error: 'Galeri tidak ditemukan.' });
    return;
  }

  const now = new Date().toISOString();
  const newHash = hashPassword(newPassword);
  const encDisplayPw = encryptSecret(newPassword);

  db.prepare(
    `UPDATE sharing_links
     SET password_hash = ?,
         encrypted_display_password = ?,
         display_password_iv = ?,
         display_password_tag = ?,
         password_updated_at = ?
     WHERE gallery_id = ? AND revoked_at IS NULL`
  ).run(newHash, encDisplayPw.ciphertext, encDisplayPw.iv, encDisplayPw.tag, now, galleryId);

  revokeGallerySessions(galleryId);
  res.json({ ok: true });
});

ownerRouter.post('/galleries/:id/extend-expiration', (req: AuthedOwnerRequest, res: Response) => {
  const galleryId = String(req.params.id);
  const { expiresAt } = req.body as { expiresAt?: string | null };

  const existing = db
    .prepare(`SELECT id FROM family_galleries WHERE id = ? AND owner_id = ?`)
    .get(galleryId, req.ownerId!);

  if (!existing) {
    res.status(404).json({ error: 'Galeri tidak ditemukan.' });
    return;
  }

  const now = new Date().toISOString();
  db.prepare(
    `UPDATE family_galleries
     SET expires_at = ?, status = 'active', updated_at = ?
     WHERE id = ?`
  ).run(expiresAt ?? null, now, galleryId);

  res.json({ ok: true });
});

ownerRouter.post('/galleries/:id/regenerate-link', (req: AuthedOwnerRequest, res: Response) => {
  const galleryId = String(req.params.id);
  const existing = db
    .prepare(`SELECT * FROM family_galleries WHERE id = ? AND owner_id = ?`)
    .get(galleryId, req.ownerId!) as GalleryRecord | undefined;

  if (!existing) {
    res.status(404).json({ error: 'Galeri tidak ditemukan.' });
    return;
  }

  const now = new Date().toISOString();
  const prevLink = db
    .prepare(
      `SELECT password_hash, encrypted_display_password, display_password_iv, display_password_tag
       FROM sharing_links WHERE gallery_id = ? AND revoked_at IS NULL ORDER BY created_at DESC LIMIT 1`
    )
    .get(galleryId) as
    | {
        password_hash: string;
        encrypted_display_password: string | null;
        display_password_iv: string | null;
        display_password_tag: string | null;
      }
    | undefined;

  db.prepare(`UPDATE sharing_links SET revoked_at = ? WHERE gallery_id = ? AND revoked_at IS NULL`).run(
    now,
    galleryId
  );

  const rawToken = generateSecureToken(32);
  db.prepare(
    `INSERT INTO sharing_links (id, gallery_id, token_hash, password_hash, encrypted_display_password, display_password_iv, display_password_tag, password_updated_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    generateSecureToken(9),
    galleryId,
    sha256Hex(rawToken),
    prevLink?.password_hash || hashPassword('123456'),
    prevLink?.encrypted_display_password ?? null,
    prevLink?.display_password_iv ?? null,
    prevLink?.display_password_tag ?? null,
    now,
    now
  );

  revokeGallerySessions(galleryId);
  res.json({ shareToken: rawToken });
});

ownerRouter.post('/galleries/:id/toggle-status', (req: AuthedOwnerRequest, res: Response) => {
  const galleryId = String(req.params.id);
  const existing = db
    .prepare(`SELECT status FROM family_galleries WHERE id = ? AND owner_id = ?`)
    .get(galleryId, req.ownerId!) as { status: string } | undefined;

  if (!existing) {
    res.status(404).json({ error: 'Galeri tidak ditemukan.' });
    return;
  }

  const nextStatus = existing.status === 'active' ? 'revoked' : 'active';
  const now = new Date().toISOString();

  db.prepare(`UPDATE family_galleries SET status = ?, updated_at = ? WHERE id = ?`).run(
    nextStatus,
    now,
    galleryId
  );

  if (nextStatus === 'revoked') {
    revokeGallerySessions(galleryId);
  }

  res.json({ ok: true, status: nextStatus });
});

ownerRouter.post('/galleries/:id/revoke', (req: AuthedOwnerRequest, res: Response) => {
  const galleryId = String(req.params.id);
  const existing = db
    .prepare(`SELECT * FROM family_galleries WHERE id = ? AND owner_id = ?`)
    .get(galleryId, req.ownerId!) as GalleryRecord | undefined;

  if (!existing) {
    res.status(404).json({ error: 'Galeri tidak ditemukan.' });
    return;
  }

  const now = new Date().toISOString();
  db.prepare(`UPDATE family_galleries SET status = 'revoked', updated_at = ? WHERE id = ?`).run(
    now,
    galleryId
  );
  db.prepare(`UPDATE sharing_links SET revoked_at = ? WHERE gallery_id = ? AND revoked_at IS NULL`).run(
    now,
    galleryId
  );
  revokeGallerySessions(galleryId);

  res.json({ ok: true });
});

ownerRouter.delete('/galleries/:id', (req: AuthedOwnerRequest, res: Response) => {
  const galleryId = String(req.params.id);
  const info = db
    .prepare(`DELETE FROM family_galleries WHERE id = ? AND owner_id = ?`)
    .run(galleryId, req.ownerId!);

  if (info.changes === 0) {
    res.status(404).json({ error: 'Galeri tidak ditemukan.' });
    return;
  }

  res.json({ ok: true });
});

