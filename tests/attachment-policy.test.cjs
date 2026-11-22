'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const policy = require('../note-attachment-policy.js');

test('attachment policy accepts files up to and including decimal 50 MB', () => {
  assert.deepEqual(policy.validateFile(0), { valid: true, reason: null });
  assert.equal(policy.MAX_FILE_BYTES, 50_000_000);
  assert.deepEqual(policy.validateFile(50_000_000), { valid: true, reason: null });
});

test('attachment policy rejects files larger than decimal 50 MB', () => {
  assert.deepEqual(policy.validateFile(50_000_001), { valid: false, reason: 'too-large' });
});

test('attachment policy rejects invalid sizes without restricting file type', () => {
  assert.deepEqual(policy.validateFile(-1), { valid: false, reason: 'invalid-size' });
  assert.deepEqual(policy.validateFile(NaN), { valid: false, reason: 'invalid-size' });
  assert.deepEqual(policy.validateFile({ name: 'anything.unknown', type: '', size: 1024 }), { valid: true, reason: null });
  assert.deepEqual(policy.validateFile({ name: 'script.html', type: 'text/html', size: 1024 }), { valid: true, reason: null });
});

test('application and service worker both load and enforce the shared policy', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const root = path.join(__dirname, '..');
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const appSource = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const serviceWorker = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');

  assert.match(html, /<script src="\.\/note-attachment-policy\.js"><\/script>/);
  assert.doesNotMatch(html, /note-attachment-preview\.js/);
  assert.match(appSource, /MemoryAttachmentPolicy\.validateFile\(file\)/);
  assert.match(appSource, /MemoryAttachmentPolicy\.validateFile\(blob\)/);
  assert.match(serviceWorker, /memory-pwa-v37/);
  assert.match(serviceWorker, /\.\/note-attachment-policy\.js/);
  assert.doesNotMatch(serviceWorker, /note-attachment-preview\.js/);
});
