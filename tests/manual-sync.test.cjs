'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const appSource = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');

test('cloud sync is manual after the initial signed-in sync', () => {
  assert.doesNotMatch(appSource, /queueCloudSync\s*\(/);
  assert.doesNotMatch(appSource, /setInterval\s*\(/);
  assert.doesNotMatch(appSource, /addEventListener\s*\(\s*['"]focus['"]/);
  assert.doesNotMatch(appSource, /visibilitychange/);
  assert.doesNotMatch(appSource, /onChange:\s*\(\)\s*=>\s*syncCloudNotes/);
  assert.match(appSource, /onChange:\s*\(\)\s*=>\s*\{\s*cloudChangesAvailable\s*=\s*true/);
});

test('manual sync controls are present in the app header and open editor', () => {
  assert.match(html, /id="sync-now-btn"[^>]*data-sync-trigger/);
  assert.match(html, /id="editor-sync-now-btn"[^>]*data-sync-trigger/);
  assert.match(appSource, /querySelectorAll\('\[data-sync-trigger\]'\)[\s\S]*?syncCloudNotes\(\)/);
});

test('initial cloud sync runs after session restore and after a new sign-in', () => {
  assert.match(appSource, /await subscribeToAccountChanges\(authUser\.id\);\s*await syncCloudNotes\(\)/);
  assert.match(appSource, /await subscribeToAccountChanges\(nextUser\.id\);[\s\S]*?await syncCloudNotes\(\)/);
});

test('a previously synced editor remains editable during manual sync and its draft is reconciled', () => {
  assert.match(appSource, /syncStatus === 'synced' \|\| \(syncInProgress && syncStartedWritable\)/);
  assert.match(appSource, /reconcileEditorDraftsAfterSync\(editorDrafts, syncConflictIds\)/);
  assert.match(appSource, /syncConflictIds\.add\(local\.id\)/);
});

test('offline, initial-sync-pending and failed-sync states retain read-only protection', () => {
  assert.match(appSource, /navigator\.onLine && \(syncStatus === 'synced'/);
  assert.match(appSource, /syncStatus === 'error' \? 'Cloud sync needs attention/);
  assert.match(appSource, /Initial cloud sync required · tap Sync to enable editing/);
});

test('manual sync disables duplicate starts before awaiting the active-draft save', () => {
  const syncStart = appSource.indexOf('async function syncCloudNotes()');
  const preflight = appSource.slice(syncStart, appSource.indexOf('const syncConflictIds', syncStart));
  assert.ok(preflight.indexOf('syncInProgress = true;') < preflight.indexOf('await saveState()'));
});
