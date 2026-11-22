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


test('sync planner classifies inserts, pending updates, remote wins and conflict copies', () => {
  const local = [
    { id: 'insert', title: 'new local' },
    { id: 'pending', title: 'local edit' },
    { id: 'remote-wins', title: 'same' },
    { id: 'conflict', title: 'local version' },
    { id: 'remote-deleted', title: 'edit after delete' },
    { id: 'deleted-clean', title: 'already deleted' }
  ];
  const remote = [
    { client_id: 'pending', title: 'older remote', updated_at: 'server-v7' },
    { client_id: 'remote-wins', title: 'same', updated_at: 'server-v8' },
    { client_id: 'conflict', title: 'remote version', updated_at: 'server-v9' },
    { client_id: 'remote-deleted', title: 'deleted', deleted_at: '2026-01-01T00:00:00Z' },
    { client_id: 'deleted-clean', title: 'deleted', deleted_at: '2026-01-01T00:00:00Z' },
    { client_id: 'remote-only', title: 'cloud note' },
    { client_id: 'deleted-remote-only', title: 'gone', deleted_at: '2026-01-01T00:00:00Z' }
  ];
  const plan = require('../note-sync-core.js').planNoteSync(local, remote, new Set(['pending', 'remote-deleted']), {
    fingerprint: note => note.title,
    remoteToLocal: row => ({ id: row.client_id, title: row.title })
  });

  assert.deepEqual(plan.local.map(item => item.action), [
    'insert-local', 'update-existing', 'use-remote', 'use-remote', 'conflict-deleted', 'skip-deleted'
  ]);
  assert.equal(plan.local[1].expectedUpdatedAt, 'server-v7');
  assert.equal(plan.local[2].localChanged, false);
  assert.equal(plan.local[3].localChanged, true);
  assert.deepEqual(plan.local[3].remoteLocal, { id: 'conflict', title: 'remote version' });
  assert.deepEqual(plan.remoteOnly.map(row => row.client_id), ['remote-only']);
});

test('sync planner treats duplicate local IDs consistently and does not mutate inputs', () => {
  const local = [{ id: 'n', title: 'local' }];
  const remote = [{ client_id: 'n', title: 'remote', updated_at: 'server-v1' }];
  const localBefore = JSON.stringify(local);
  const remoteBefore = JSON.stringify(remote);
  const plan = require('../note-sync-core.js').planNoteSync(local, remote, [], {
    fingerprint: note => note.title,
    remoteToLocal: row => ({ id: row.client_id, title: row.title })
  });

  assert.equal(plan.local[0].action, 'use-remote');
  assert.equal(JSON.stringify(local), localBefore);
  assert.equal(JSON.stringify(remote), remoteBefore);
});

test('attachment fingerprint ignores binary Blob data and defaults missing metadata', () => {
  assert.deepEqual(JSON.parse(fingerprintAttachments({ attachments: [{ id: 'x', blob: { secret: true } }] })), [
    { id: 'x', name: '', type: '', sizeBytes: 0, mimeType: '' }
  ]);
});
