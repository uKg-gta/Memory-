'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { fingerprintNote, fingerprintAttachments } = require('../note-sync-core.js');

test('note fingerprint includes only cloud-synchronized note fields', () => {
  const note = {
    id: 'local-id',
    title: 'A note',
    bodyHtml: '<p>Body</p>',
    checklist: [{ id: 'check-1', text: 'Task', done: false }],
    links: [{ id: 'link-1', title: 'Site', url: 'https://example.com', domain: 'example.com', titleLocked: true, transient: 'ignored' }],
    colour: 'olive',
    pinned: true,
    order: 4,
    folderId: 'folder-1',
    archived: false,
    trashed: false,
    attachments: [{ id: 'attachment-1' }],
    updatedAt: '2026-01-01T00:00:00.000Z'
  };

  const fingerprint = JSON.parse(fingerprintNote(note, html => html.trim()));
  assert.deepEqual(fingerprint, {
    title: 'A note',
    bodyHtml: '<p>Body</p>',
    checklist: [{ id: 'check-1', text: 'Task', done: false }],
    links: [{ id: 'link-1', title: 'Site', url: 'https://example.com', domain: 'example.com', titleLocked: true }],
    colour: 'olive',
    pinned: true,
    order: 4,
    folderId: 'folder-1',
    archived: false,
    trashed: false
  });
});

test('note fingerprint normalizes missing fields and sanitizes HTML through the injected boundary', () => {
  const fingerprint = JSON.parse(fingerprintNote({}, html => 'clean:' + html));
  assert.deepEqual(fingerprint, {
    title: '',
    bodyHtml: 'clean:',
    checklist: [],
    links: [],
    colour: 'paper',
    pinned: false,
    order: 0,
    folderId: '',
    archived: false,
    trashed: false
  });
});

test('attachment fingerprint is stable regardless of attachment order', () => {
  const first = [
    { id: 'b', name: 'B.txt', type: 'TXT', sizeBytes: '20', mimeType: 'text/plain', blob: {} },
    { id: 'a', fileName: 'A.pdf', type: 'PDF', sizeBytes: 10, mimeType: 'application/pdf' }
  ];
  const second = [...first].reverse();

  assert.equal(fingerprintAttachments({ attachments: first }), fingerprintAttachments({ attachments: second }));
  assert.deepEqual(JSON.parse(fingerprintAttachments({ attachments: first })), [
    { id: 'a', name: 'A.pdf', type: 'PDF', sizeBytes: 10, mimeType: 'application/pdf' },
    { id: 'b', name: 'B.txt', type: 'TXT', sizeBytes: 20, mimeType: 'text/plain' }
  ]);
});

test('attachment fingerprint ignores binary Blob data and defaults missing metadata', () => {
  assert.deepEqual(JSON.parse(fingerprintAttachments({ attachments: [{ id: 'x', blob: { secret: true } }] })), [
    { id: 'x', name: '', type: '', sizeBytes: 0, mimeType: '' }
  ]);
});
