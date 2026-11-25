import assert from 'node:assert';
import { db } from './db.js';
import { generateSecureToken, hashPassword, encryptSecret, sha256Hex } from './crypto.js';

async function testFullCreationFlow() {
  console.log('--- TEST: CREATE GALLERY FLOW REPRODUCTION & VALIDATION ---');

  // 1. Ensure test owner account exists
  const testOwnerId = 'test_owner_' + Date.now();
  db.prepare(`
    INSERT OR REPLACE INTO owner_accounts (id, google_uid, email, display_name, updated_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(testOwnerId, 'uid_test_' + Date.now(), 'owner@example.com', 'Owner Test', new Date().toISOString());

  // 2. Simulate Create Gallery Payload (exactly what triggered HTTP 500)
  const galleryId = generateSecureToken(12);
  const now = new Date().toISOString();
  const password = 'cobaPassword123';
  const rawToken = generateSecureToken(32);
  const tokenHash = sha256Hex(rawToken);
  const passwordHash = hashPassword(password);
  const encDisplayPw = encryptSecret(password);

  console.log('[Step 1] Inserting gallery record into family_galleries...');
  db.prepare(`
    INSERT INTO family_galleries (id, owner_id, name, content_mode, default_quality, allow_download_default, status, expires_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)
  `).run(
    galleryId,
    testOwnerId,
    'coba',
    'selected_albums',
    'auto',
    0,
    new Date(Date.now() + 86400000).toISOString(),
    now,
    now
  );

  console.log('[Step 2] Inserting sharing link into sharing_links...');
  db.prepare(`
    INSERT INTO sharing_links (id, gallery_id, token_hash, password_hash, encrypted_display_password, display_password_iv, display_password_tag, password_updated_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
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

  console.log('[Step 3] Inserting album permission into gallery_album_permissions...');
  db.prepare(`
    INSERT INTO gallery_album_permissions (id, gallery_id, drive_folder_id, folder_name, allow_download, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    generateSecureToken(9),
    galleryId,
    'folder_12345',
    'Album Liburan',
    0,
    now
  );

  // 3. Verify inserted data
  const retrievedGallery = db.prepare('SELECT * FROM family_galleries WHERE id = ?').get(galleryId) as any;
  assert.ok(retrievedGallery, 'Gallery must be retrieved');
  assert.strictEqual(retrievedGallery.name, 'coba');
  assert.strictEqual(retrievedGallery.content_mode, 'selected_albums');

  const retrievedLink = db.prepare('SELECT * FROM sharing_links WHERE gallery_id = ?').get(galleryId) as any;
  assert.ok(retrievedLink, 'Link must be retrieved');
  assert.ok(retrievedLink.encrypted_display_password, 'Encrypted display password must exist');

  const permissions = db.prepare('SELECT * FROM gallery_album_permissions WHERE gallery_id = ?').all(galleryId);
  assert.strictEqual(permissions.length, 1);

  console.log('✓ Full gallery creation flow executed cleanly with zero errors.');
  console.log('--- TEST PASSED SUCCESSFULLY ---');
}

testFullCreationFlow().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
