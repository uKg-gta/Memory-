'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

test('cloud sync is manual after the initial signed-in sync', () => {
  assert.doesNotMatch(html, /queueCloudSync\s*\(/);
  assert.doesNotMatch(html, /setInterval\s*\(/);
  assert.doesNotMatch(html, /addEventListener\s*\(\s*['"]focus['"]/);
  assert.doesNotMatch(html, /visibilitychange/);
  assert.doesNotMatch(html, /onChange:\s*\(\)\s*=>\s*syncCloudNotes/);
  assert.match(html, /onChange:\s*\(\)\s*=>\s*\{\s*cloudChangesAvailable\s*=\s*true/);
});

test('manual sync controls are present in the app header and open editor', () => {
  assert.match(html, /id="sync-now-btn"[^>]*data-sync-trigger/);
  assert.match(html, /id="editor-sync-now-btn"[^>]*data-sync-trigger/);
  assert.match(html, /querySelectorAll\('\[data-sync-trigger\]'\)[\s\S]*?syncCloudNotes\(\)/);
});

test('initial cloud sync runs after session restore and after a new sign-in', () => {
  assert.match(html, /await subscribeToAccountChanges\(authUser\.id\);\s*await syncCloudNotes\(\)/);
  assert.match(html, /await subscribeToAccountChanges\(nextUser\.id\);[\s\S]*?await syncCloudNotes\(\)/);
});

test('a previously synced editor remains editable during manual sync and its draft is reconciled', () => {
  assert.match(html, /syncStatus === 'synced' \|\| \(syncInProgress && syncStartedWritable\)/);
  assert.match(html, /reconcileEditorDraftsAfterSync\(editorDrafts, syncConflictIds\)/);
  assert.match(html, /syncConflictIds\.add\(local\.id\)/);
});

test('offline, initial-sync-pending and failed-sync states retain read-only protection', () => {
  assert.match(html, /navigator\.onLine && \(syncStatus === 'synced'/);
  assert.match(html, /syncStatus === 'error' \? 'Cloud sync needs attention/);
  assert.match(html, /Initial cloud sync required · tap Sync to enable editing/);
});
