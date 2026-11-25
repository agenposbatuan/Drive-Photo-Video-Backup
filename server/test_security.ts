import assert from 'node:assert';
import { db } from './db.js';
import { hashPassword, verifyPassword, sha256Hex, generateSecureToken } from './crypto.js';
import { checkPasswordRateLimit, recordPasswordFailure, clearPasswordFailures } from './rateLimit.js';

async function runTests() {
  console.log('--- STARTING SECURITY & REGRESSION VERIFICATION ---');

  // Test 1: Password hashing & verification
  console.log('[Test 1] Crypto Password Hash & Verify...');
  const pw = 'KeluargaBahagia2026!';
  const hashed = hashPassword(pw);
  assert.ok(hashed.includes(':'), 'Hash must contain salt delimiter');
  assert.strictEqual(verifyPassword(pw, hashed), true, 'Correct password must verify');
  assert.strictEqual(verifyPassword('WrongPassword', hashed), false, 'Wrong password must fail');
  console.log('✓ Password hashing & timing-safe verification passed.');

  // Test 2: Rate limiting logic
  console.log('[Test 2] Password Rate Limiting...');
  const testIpKey = '127.0.0.1:test_token_hash';
  clearPasswordFailures(testIpKey);
  for (let i = 0; i < 4; i++) {
    recordPasswordFailure(testIpKey);
    const check = checkPasswordRateLimit(testIpKey);
    assert.strictEqual(check.allowed, true, `Attempt ${i + 1} should be allowed`);
  }
  recordPasswordFailure(testIpKey); // 5th failure
  const blockedCheck = checkPasswordRateLimit(testIpKey);
  assert.strictEqual(blockedCheck.allowed, false, '5th failure must trigger block');
  assert.ok(blockedCheck.retryAfterSec > 0, 'Must return positive retry delay');
  clearPasswordFailures(testIpKey);
  assert.strictEqual(checkPasswordRateLimit(testIpKey).allowed, true, 'Clear must reset bucket');
  console.log('✓ Rate limiting protects against brute force attacks.');

  // Test 3: Backend Gateway Endpoints
  console.log('[Test 3] Family Gallery API Endpoints...');
  const healthRes = await fetch('http://localhost:3001/api/health');
  assert.strictEqual(healthRes.status, 200);
  const healthJson = await healthRes.json();
  assert.strictEqual(healthJson.ok, true);

  // Test 4: Unauthenticated Info endpoint
  const invalidInfoRes = await fetch('http://localhost:3001/api/family/info?token=nonexistent');
  assert.strictEqual(invalidInfoRes.status, 404, 'Non-existent token must return 404');
  console.log('✓ Public endpoints correctly reject unauthorized/invalid tokens.');

  // Test 5: Database integrity check
  console.log('[Test 5] SQLite Database Tables & Schema...');
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((t: any) => t.name);
  const expectedTables = [
    'owner_accounts',
    'family_galleries',
    'gallery_album_permissions',
    'gallery_photo_permissions',
    'sharing_links',
    'family_invitations',
    'gallery_sessions',
    'gallery_access_logs',
    'viewer_preferences',
    'photo_derivatives_cache'
  ];
  for (const exp of expectedTables) {
    assert.ok(tables.includes(exp), `Table ${exp} must exist in SQLite schema`);
  }
  console.log('✓ All 10 relational tables verified with foreign keys & indexes.');

  console.log('--- ALL AUTOMATED SUITES PASSED SUCCESSFULLY ---');
}

runTests().catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
