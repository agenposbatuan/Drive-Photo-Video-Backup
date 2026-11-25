import assert from 'node:assert';
import { db } from './db.js';
import { hashPassword, sha256Hex, generateSecureToken } from './crypto.js';
import { authorizeFileAccess } from './permissions.js';

console.log('--- STARTING DOWNLOAD EXECUTION & PERMISSIONS TEST SUITE ---');

const nowIso = new Date().toISOString();
const futureIso = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
const pastIso = new Date(Date.now() - 24 * 3600 * 1000).toISOString();

// Setup test owner and gallery in SQLite
const testOwnerId = `test_owner_${generateSecureToken(4)}`;
const testGoogleUid = `google_uid_${generateSecureToken(4)}`;
const testGalleryIdEnabled = `gal_dl_on_${generateSecureToken(4)}`;
const testGalleryIdDisabled = `gal_dl_off_${generateSecureToken(4)}`;
const testGalleryIdExpired = `gal_dl_exp_${generateSecureToken(4)}`;

db.prepare(`
  INSERT INTO owner_accounts (id, google_uid, email, display_name, root_folder_id, updated_at)
  VALUES (?, ?, ?, ?, ?, ?)
`).run(testOwnerId, testGoogleUid, 'owner@test.com', 'Test Owner', 'root_folder_123', nowIso);

// Gallery 1: Download ENABLED
db.prepare(`
  INSERT INTO family_galleries (
    id, owner_id, name, content_mode, default_quality, allow_download_default,
    status, expires_at, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`).run(testGalleryIdEnabled, testOwnerId, 'Galeri Unduh Aktif', 'selected_albums', 'hd', 1, 'active', futureIso, nowIso, nowIso);

// Gallery 2: Download DISABLED
db.prepare(`
  INSERT INTO family_galleries (
    id, owner_id, name, content_mode, default_quality, allow_download_default,
    status, expires_at, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`).run(testGalleryIdDisabled, testOwnerId, 'Galeri Unduh Nonaktif', 'selected_albums', 'hd', 0, 'active', futureIso, nowIso, nowIso);

// Gallery 3: EXPIRED
db.prepare(`
  INSERT INTO family_galleries (
    id, owner_id, name, content_mode, default_quality, allow_download_default,
    status, expires_at, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`).run(testGalleryIdExpired, testOwnerId, 'Galeri Kedaluwarsa', 'selected_albums', 'hd', 1, 'active', pastIso, nowIso, nowIso);

// Add Album Permissions
const sharedFolderId = 'shared_album_abc';
const unsharedFolderId = 'unshared_album_xyz';

// For Gallery 1: download allowed
db.prepare(`
  INSERT INTO gallery_album_permissions (id, gallery_id, drive_folder_id, folder_name, allow_download, created_at)
  VALUES (?, ?, ?, ?, ?, ?)
`).run(`perm1_${generateSecureToken(4)}`, testGalleryIdEnabled, sharedFolderId, 'Album Liburan', 1, nowIso);

// For Gallery 2: download NOT allowed
db.prepare(`
  INSERT INTO gallery_album_permissions (id, gallery_id, drive_folder_id, folder_name, allow_download, created_at)
  VALUES (?, ?, ?, ?, ?, ?)
`).run(`perm2_${generateSecureToken(4)}`, testGalleryIdDisabled, sharedFolderId, 'Album Rahasia', 0, nowIso);

// Setup Sessions
const sessionTokenEnabled = `session_token_${generateSecureToken(16)}`;
const sessionTokenDisabled = `session_token_${generateSecureToken(16)}`;
const sessionTokenExpired = `session_token_${generateSecureToken(16)}`;

db.prepare(`
  INSERT INTO gallery_sessions (id, gallery_id, session_token_hash, auth_method, expires_at, created_at, last_seen_at)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`).run(`sess_1_${generateSecureToken(4)}`, testGalleryIdEnabled, sha256Hex(sessionTokenEnabled), 'password', futureIso, nowIso, nowIso);

db.prepare(`
  INSERT INTO gallery_sessions (id, gallery_id, session_token_hash, auth_method, expires_at, created_at, last_seen_at)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`).run(`sess_2_${generateSecureToken(4)}`, testGalleryIdDisabled, sha256Hex(sessionTokenDisabled), 'password', futureIso, nowIso, nowIso);

db.prepare(`
  INSERT INTO gallery_sessions (id, gallery_id, session_token_hash, auth_method, expires_at, created_at, last_seen_at)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`).run(`sess_3_${generateSecureToken(4)}`, testGalleryIdExpired, sha256Hex(sessionTokenExpired), 'password', pastIso, pastIso, pastIso);

async function testScenarios() {
  // ── TEST 1: Permission evaluation unit test ──
  console.log('[Test 1] Permission Evaluation (authorizeFileAccess)...');
  const sharedFile = {
    id: 'photo_123',
    name: 'Keluarga.jpg',
    mimeType: 'image/jpeg',
    parents: [sharedFolderId],
  };
  const unsharedFile = {
    id: 'photo_999',
    name: 'Rahasia.jpg',
    mimeType: 'image/jpeg',
    parents: [unsharedFolderId],
  };

  const gal1 = db.prepare('SELECT * FROM family_galleries WHERE id = ?').get(testGalleryIdEnabled) as any;
  const gal2 = db.prepare('SELECT * FROM family_galleries WHERE id = ?').get(testGalleryIdDisabled) as any;

  // Gallery 1 (Download Enabled):
  const authz1 = await authorizeFileAccess({
    gallery: gal1,
    fileMeta: sharedFile,
    accessToken: 'mock_token',
    ownerRootFolderId: 'root_folder_123',
  });
  assert.strictEqual(authz1.allowed, true, 'Shared file must be allowed');
  assert.strictEqual(authz1.allowDownload, true, 'Download must be allowed for Galeri 1');

  // Gallery 2 (Download Disabled):
  const authz2 = await authorizeFileAccess({
    gallery: gal2,
    fileMeta: sharedFile,
    accessToken: 'mock_token',
    ownerRootFolderId: 'root_folder_123',
  });
  assert.strictEqual(authz2.allowed, true, 'Shared file must be allowed for viewing');
  assert.strictEqual(authz2.allowDownload, false, 'Download must be strictly BLOCKED for Galeri 2');

  // Unshared file:
  const authzUnshared = await authorizeFileAccess({
    gallery: gal1,
    fileMeta: unsharedFile,
    accessToken: 'mock_token',
    ownerRootFolderId: 'root_folder_123',
  });
  assert.strictEqual(authzUnshared.allowed, false, 'Unshared file must be rejected');
  assert.strictEqual(authzUnshared.allowDownload, false, 'Download must be rejected for unshared file');
  console.log('✓ Permission evaluation correctly distinguishes viewing vs download authority.');

  // ── TEST 2: Backend Download API with Owner Download DISABLED ──
  console.log('[Test 2] Backend Endpoint when Owner Download is DISABLED...');
  const resDlDisabled = await fetch('http://localhost:3001/api/family/download/photo_123?type=original', {
    headers: {
      Cookie: `fg_session=${sessionTokenDisabled}`,
    },
  });
  assert.strictEqual(resDlDisabled.status, 403, 'Disabled download must return 403 Forbidden');
  const jsonDlDisabled = await resDlDisabled.json();
  assert.ok(jsonDlDisabled.error.includes('Izin unduh dinonaktifkan'), 'Must return permission disabled message');

  const resCompressDisabled = await fetch('http://localhost:3001/api/family/download/photo_123?type=compress', {
    headers: {
      Cookie: `fg_session=${sessionTokenDisabled}`,
    },
  });
  assert.strictEqual(resCompressDisabled.status, 403, 'Disabled compress download must return 403 Forbidden');
  console.log('✓ Backend rejects both original and compress downloads when permission is disabled.');

  // ── TEST 3: Backend Download API with EXPIRED session ──
  console.log('[Test 3] Backend Endpoint with EXPIRED session...');
  const resExpired = await fetch('http://localhost:3001/api/family/download/photo_123?type=original', {
    headers: {
      Cookie: `fg_session=${sessionTokenExpired}`,
    },
  });
  assert.strictEqual(resExpired.status, 401, 'Expired session must return 401 Unauthorized');
  console.log('✓ Expired session correctly rejected with 401.');

  // ── TEST 4: Backend Download API with UNSUPPORTED download type ──
  console.log('[Test 4] Backend Endpoint with UNSUPPORTED download type...');
  const resInvalidType = await fetch('http://localhost:3001/api/family/download/photo_123?type=unsupported_payload', {
    headers: {
      Cookie: `fg_session=${sessionTokenEnabled}`,
    },
  });
  assert.strictEqual(resInvalidType.status, 400, 'Invalid type query must return 400 Bad Request');
  const jsonInvalid = await resInvalidType.json();
  assert.ok(jsonInvalid.error.includes('Tipe unduhan tidak didukung'));
  console.log('✓ Unsupported download types safely rejected with 400.');

  // ── TEST 5: Filename generation and extension handling ──
  console.log('[Test 5] Filename formatting and extension extraction...');
  const testNames = [
    { input: 'Foto Keluarga.png', base: 'Foto Keluarga', ext: 'png', comp: 'compressed_Foto Keluarga.png' },
    { input: 'liburan_bali.jpeg', base: 'liburan_bali', ext: 'jpeg', comp: 'compressed_liburan_bali.jpeg' },
    { input: 'pantai', base: 'pantai', ext: 'jpg', comp: 'compressed_pantai.jpg' },
  ];
  for (const t of testNames) {
    const safeName = t.input.replace(/[\\/:*?"<>|]/g, '_');
    const baseName = safeName.replace(/\.[^/.]+$/, '');
    const ext = safeName.includes('.') ? safeName.split('.').pop() : 'jpg';
    const compName = `compressed_${baseName}.${ext || 'jpg'}`;
    assert.strictEqual(baseName, t.base);
    assert.strictEqual(ext, t.ext);
    assert.strictEqual(compName, t.comp);
  }
  console.log('✓ Filename formatting preserves original format and produces distinguishable compressed names.');

  console.log('--- ALL DOWNLOAD EXECUTION SCENARIOS PASSED (100%) ---');
}

testScenarios().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
