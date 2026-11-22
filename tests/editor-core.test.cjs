'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  createDraft, isDraftEmpty, setChecklistDone, setChecklistText,
  removeChecklistItem, appendChecklistItem, toggleLabel
} = require('../note-editor-core.js');

test('new drafts receive complete defaults and context without shared arrays', () => {
  const first = createDraft(null, { id: 'new-1', order: 4, folderId: 'folder-1', labelIds: ['label-1'], createdAt: 123 });
  const second = createDraft(null, { id: 'new-2', labelIds: ['label-1'] });
  first.labelIds.push('label-2');
  assert.equal(first.id, 'new-1');
  assert.equal(first.order, 4);
  assert.equal(first.folderId, 'folder-1');
  assert.deepEqual(second.labelIds, ['label-1']);
  assert.deepEqual(first.checklist, []);
  assert.deepEqual(first.attachments, []);
  assert.equal(first.colour, 'paper');
  assert.equal(first.createdAt, 123);
});

test('existing drafts are cloned through the supplied structured-clone boundary', () => {
  const existing = { id: 'note-1', attachments: [{ blob: new Blob(['bytes']) }] };
  const draft = createDraft(existing, {}, value => structuredClone(value));
  draft.attachments[0].name = 'renamed';
  assert.equal(existing.attachments[0].name, undefined);
  assert.equal(draft.attachments[0].blob.size, 5);
});

test('empty draft detection includes every supported content type', () => {
  const strip = html => html.replace(/<[^>]*>/g, '').trim();
  assert.equal(isDraftEmpty({ title: '', bodyHtml: '', checklist: [], attachments: [], links: [] }, strip), true);
  assert.equal(isDraftEmpty({ title: 'Title' }, strip), false);
  assert.equal(isDraftEmpty({ bodyHtml: '<p>Text</p>' }, strip), false);
  assert.equal(isDraftEmpty({ checklist: [{ text: 'Task' }] }, strip), false);
  assert.equal(isDraftEmpty({ attachments: [{ id: 'file' }] }, strip), false);
  assert.equal(isDraftEmpty({ links: [{ id: 'link' }] }, strip), false);
});

test('checklist helpers return updated collections without mutating the original', () => {
  const source = [{ id: 'a', text: 'First', done: false }, { id: 'b', text: 'Second', done: false }];
  const completed = setChecklistDone(source, 'a', true);
  const renamed = setChecklistText(completed, 'b', 'Updated');
  const removed = removeChecklistItem(renamed, 'a');
  const appended = appendChecklistItem(removed, 'c');

  assert.equal(source[0].done, false);
  assert.equal(source[1].text, 'Second');
  assert.deepEqual(appended, [
    { id: 'b', text: 'Updated', done: false },
    { id: 'c', text: '', done: false }
  ]);
});

test('label toggling adds and removes only the selected label', () => {
  assert.deepEqual(toggleLabel(['a'], 'b'), ['a', 'b']);
  assert.deepEqual(toggleLabel(['a', 'b'], 'a'), ['b']);
  assert.deepEqual(toggleLabel(null, 'x'), ['x']);
});
