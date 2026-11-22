'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const policy = require('../note-attachment-policy.js');

test('attachment policy accepts files up to and including 50 MiB', () => {
  assert.deepEqual(policy.validateFile(0), { valid: true, reason: null });
  assert.deepEqual(policy.validateFile(policy.MAX_FILE_BYTES), { valid: true, reason: null });
});

test('attachment policy rejects files larger than 50 MiB', () => {
  assert.deepEqual(policy.validateFile(policy.MAX_FILE_BYTES + 1), { valid: false, reason: 'too-large' });
});

test('attachment policy rejects invalid sizes without restricting file type', () => {
  assert.deepEqual(policy.validateFile(-1), { valid: false, reason: 'invalid-size' });
  assert.deepEqual(policy.validateFile(NaN), { valid: false, reason: 'invalid-size' });
  assert.deepEqual(policy.validateFile({ name: 'anything.unknown', type: '', size: 1024 }), { valid: true, reason: null });
  assert.deepEqual(policy.validateFile({ name: 'script.html', type: 'text/html', size: 1024 }), { valid: true, reason: null });
});
