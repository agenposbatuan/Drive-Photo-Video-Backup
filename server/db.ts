import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const DATA_DIR = path.resolve(process.cwd(), '.gallery-data');
const DB_PATH = path.join(DATA_DIR, 'family-gallery.sqlite');
const DERIVATIVES_DIR = path.join(DATA_DIR, 'derivatives');

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(DERIVATIVES_DIR, { recursive: true });

export function getDerivativesDir(): string {
  return DERIVATIVES_DIR;
}

export const db = new DatabaseSync(DB_PATH);

// Initial baseline table creation
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS owner_accounts (
    id TEXT PRIMARY KEY,
    google_uid TEXT UNIQUE NOT NULL,
    email TEXT NOT NULL,
    display_name TEXT NOT NULL,
    root_folder_id TEXT,
    root_folder_name TEXT,
    encrypted_refresh_token TEXT,
    token_iv TEXT,
    token_tag TEXT,
    encrypted_access_token TEXT,
    access_iv TEXT,
    access_tag TEXT,
    access_expires_at TEXT,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS family_galleries (
    id TEXT PRIMARY KEY,
    owner_id TEXT NOT NULL REFERENCES owner_accounts(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    content_mode TEXT NOT NULL CHECK(content_mode IN ('all_albums', 'selected_albums', 'custom_photos', 'mixed')),
    default_quality TEXT NOT NULL CHECK(default_quality IN ('data_saver', 'hd', 'auto', 'original')),
    allow_download_default INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'revoked')),
    expires_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS gallery_album_permissions (
    id TEXT PRIMARY KEY,
    gallery_id TEXT NOT NULL REFERENCES family_galleries(id) ON DELETE CASCADE,
    drive_folder_id TEXT NOT NULL,
    folder_name TEXT NOT NULL,
    allow_download INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    UNIQUE(gallery_id, drive_folder_id)
  );

  CREATE TABLE IF NOT EXISTS gallery_photo_permissions (
    id TEXT PRIMARY KEY,
    gallery_id TEXT NOT NULL REFERENCES family_galleries(id) ON DELETE CASCADE,
    drive_file_id TEXT NOT NULL,
    parent_folder_id TEXT NOT NULL,
    file_name TEXT NOT NULL,
    allow_download INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    UNIQUE(gallery_id, drive_file_id)
  );

  CREATE TABLE IF NOT EXISTS sharing_links (
    id TEXT PRIMARY KEY,
    gallery_id TEXT NOT NULL REFERENCES family_galleries(id) ON DELETE CASCADE,
    token_hash TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    encrypted_display_password TEXT,
    display_password_iv TEXT,
    display_password_tag TEXT,
    password_updated_at TEXT,
    revoked_at TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS gallery_sessions (
    id TEXT PRIMARY KEY,
    gallery_id TEXT NOT NULL REFERENCES family_galleries(id) ON DELETE CASCADE,
    session_token_hash TEXT UNIQUE NOT NULL,
    auth_method TEXT NOT NULL DEFAULT 'password',
    expires_at TEXT NOT NULL,
    revoked_at TEXT,
    created_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS gallery_access_logs (
    id TEXT PRIMARY KEY,
    gallery_id TEXT NOT NULL REFERENCES family_galleries(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL,
    viewer_identifier TEXT NOT NULL,
    target_id TEXT,
    ip_address TEXT,
    user_agent TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS viewer_preferences (
    session_id TEXT PRIMARY KEY REFERENCES gallery_sessions(id) ON DELETE CASCADE,
    preferred_quality TEXT NOT NULL CHECK(preferred_quality IN ('data_saver', 'hd', 'auto', 'original')),
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS photo_derivatives_cache (
    id TEXT PRIMARY KEY,
    drive_file_id TEXT NOT NULL,
    quality_tier TEXT NOT NULL CHECK(quality_tier IN ('data_saver', 'hd')),
    mime_type TEXT NOT NULL,
    byte_size INTEGER NOT NULL,
    disk_path TEXT NOT NULL,
    source_modified_time TEXT,
    created_at TEXT NOT NULL,
    UNIQUE(drive_file_id, quality_tier)
  );
`);

// Migration step: ensure existing sqlite file matches modern schema seamlessly
function runAutoMigrations() {
  // 1. Check sharing_links for encrypted_display_password columns
  const linkCols = db.prepare('PRAGMA table_info(sharing_links)').all() as Array<{ name: string }>;
  const linkColNames = new Set(linkCols.map((c) => c.name));
  if (!linkColNames.has('encrypted_display_password')) {
    db.exec(`ALTER TABLE sharing_links ADD COLUMN encrypted_display_password TEXT;`);
  }
  if (!linkColNames.has('display_password_iv')) {
    db.exec(`ALTER TABLE sharing_links ADD COLUMN display_password_iv TEXT;`);
  }
  if (!linkColNames.has('display_password_tag')) {
    db.exec(`ALTER TABLE sharing_links ADD COLUMN display_password_tag TEXT;`);
  }

  // 2. Check family_galleries for legacy NOT NULL sharing_mode constraint
  const galleryCols = db.prepare('PRAGMA table_info(family_galleries)').all() as Array<{ name: string; notnull: number }>;
  const sharingModeCol = galleryCols.find((c) => c.name === 'sharing_mode');
  if (sharingModeCol && sharingModeCol.notnull === 1) {
    // Rebuild family_galleries cleanly to drop the strict sharing_mode column
    db.exec(`
      PRAGMA foreign_keys = OFF;
      CREATE TABLE IF NOT EXISTS family_galleries_new (
        id TEXT PRIMARY KEY,
        owner_id TEXT NOT NULL REFERENCES owner_accounts(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        content_mode TEXT NOT NULL CHECK(content_mode IN ('all_albums', 'selected_albums', 'custom_photos', 'mixed')),
        default_quality TEXT NOT NULL CHECK(default_quality IN ('data_saver', 'hd', 'auto', 'original')),
        allow_download_default INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'revoked')),
        expires_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      INSERT INTO family_galleries_new (id, owner_id, name, content_mode, default_quality, allow_download_default, status, expires_at, created_at, updated_at)
      SELECT id, owner_id, name, content_mode, default_quality, allow_download_default, status, expires_at, created_at, updated_at
      FROM family_galleries;

      DROP TABLE family_galleries;
      ALTER TABLE family_galleries_new RENAME TO family_galleries;
      PRAGMA foreign_keys = ON;
    `);
  }
}

try {
  runAutoMigrations();
} catch (migErr) {
  console.error('[DB] Migration note:', migErr);
}

export function logGalleryEvent(params: {
  id: string;
  galleryId: string;
  eventType: string;
  viewerIdentifier: string;
  targetId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}): void {
  const stmt = db.prepare(`
    INSERT INTO gallery_access_logs (id, gallery_id, event_type, viewer_identifier, target_id, ip_address, user_agent, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    params.id,
    params.galleryId,
    params.eventType,
    params.viewerIdentifier,
    params.targetId ?? null,
    params.ipAddress ?? null,
    params.userAgent ?? null,
    new Date().toISOString()
  );
}
