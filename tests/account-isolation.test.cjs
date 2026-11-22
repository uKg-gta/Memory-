'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('account switches cannot write a snapshot into a different account cache', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  assert.match(html, /const storageKey = activeStorageKey;\s*persistenceQueue = persistenceQueue\.catch\(\(\) => \{\}\)\.then\(async \(\) => \{\s*await noteStorage\.write\(storageKey, snapshot\)/);
  assert.match(html, /async function switchAccountWorkspace\(user, isCurrent\)/);
  assert.match(html, /if \(!stillCurrent\(\)\) return false;\s*const target = await readDatabaseState\(targetKey\);\s*if \(!stillCurrent\(\)\) return false;\s*activeStorageKey = targetKey/);
  assert.match(html, /authTransitionGeneration/);
  assert.match(html, /authTransitionPending = true/);
  assert.match(html, /if \(!isCurrentTransition\(\)\) return/);
});
