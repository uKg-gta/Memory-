'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { getDefaultData, cloneData, normalizeState } = require('../note-state-core.js');

test('default state is a fresh empty workspace', () => {
  const first = getDefaultData();
  const second = getDefaultData();
  first.notes.push({ id: 'only-first' });
  assert.deepEqual(second, { theme: 'light', folders: [], labels: [], notes: [] });
});

test('state normalization supplies safe defaults and sanitizes note HTML', () => {
  const source = {
    theme: 'unexpected',
    folders: [{ id: 'folder-1' }],
    labels: [{ id: 'label-1' }],
    notes: [{ id: 'note-1', bodyHtml: '<script>bad()</script><p>safe</p>' }],
    syncMeta: { pendingNoteIds: 'invalid', pendingFolderIds: ['folder-1'] }
  };
  const result = normalizeState(source, html => html.replace(/<script>[\s\S]*?<\/script>/gi, ''));

  assert.equal(result.theme, 'light');
  assert.equal(result.folders[0].updatedAt, '1970-01-01T00:00:00.000Z');
  assert.equal(result.labels[0].colour, 'olive');
  assert.equal(result.labels[0].updatedAt, '1970-01-01T00:00:00.000Z');
  assert.deepEqual(result.syncMeta, {
    pendingNoteIds: [],
    pendingFolderIds: ['folder-1'],
    pendingLabelIds: []
  });
  assert.equal(result.notes[0].bodyHtml, '<p>safe</p>');
  assert.equal(result.notes[0].folderId, '');
  assert.deepEqual(result.notes[0].labelIds, []);
  assert.deepEqual(result.notes[0].attachments, []);
  assert.deepEqual(result.notes[0].links, []);
  assert.deepEqual(result.notes[0].checklist, []);
  assert.ok(Number.isFinite(result.notes[0].createdAt));
  assert.equal(result.notes[0].updatedAt, new Date(result.notes[0].createdAt).toISOString());
});

test('state normalization preserves valid collections and dark theme', () => {
  const source = {
    theme: 'dark',
    folders: [{ id: 'f', updatedAt: '2026-01-01T00:00:00.000Z' }],
    labels: [{ id: 'l', colour: 'navy', updatedAt: '2026-01-01T00:00:00.000Z' }],
    notes: [{
      id: 'n', bodyHtml: '<p>hello</p>', folderId: 'f', labelIds: ['l'],
      attachments: [{ id: 'a' }], links: [{ id: 'x' }], checklist: [{ id: 'c' }],
      createdAt: 1000, updatedAt: '1970-01-01T00:00:01.000Z'
    }]
  };
  const result = normalizeState(source, html => html);
  assert.equal(result.theme, 'dark');
  assert.deepEqual(result.notes[0].labelIds, ['l']);
  assert.deepEqual(result.notes[0].attachments, [{ id: 'a' }]);
  assert.equal(result.notes[0].updatedAt, '1970-01-01T00:00:01.000Z');
});

test('cloneData deep-clones state and preserves structured-clone attachment Blobs', () => {
  const source = { nested: { value: 1 }, attachment: new Blob(['file bytes'], { type: 'text/plain' }) };
  const copy = cloneData(source);
  copy.nested.value = 2;
  assert.equal(source.nested.value, 1);
  assert.equal(copy.attachment.size, 10);
  assert.equal(copy.attachment.type, 'text/plain');
});
