'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('playwright');

test('IndexedDB adapter persists account-scoped state and Blob attachments', async () => {
  const root = path.join(__dirname, '..');
  const server = http.createServer((req, res) => {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    if (pathname === '/') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end('<!doctype html><title>Storage test</title>');
      return;
    }
    if (pathname === '/note-storage.js') {
      res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8' });
      res.end(fs.readFileSync(path.join(root, 'note-storage.js')));
      return;
    }
    res.writeHead(404); res.end('not found');
  });

  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.goto('http://127.0.0.1:' + server.address().port + '/');
    await page.addScriptTag({ url: '/note-storage.js' });

    const result = await page.evaluate(async () => {
      const storage = MemoryNoteStorage.create(window.indexedDB);
      const attachment = new Blob(['attachment bytes'], { type: 'text/plain' });
      const accountA = { theme: 'dark', notes: [{ id: 'note-a', attachments: [{ id: 'file-a', blob: attachment }] }] };
      const accountB = { theme: 'light', notes: [{ id: 'note-b', attachments: [] }] };

      const missing = await storage.read('not-yet-created');
      await storage.write('account-a', accountA);
      await storage.write('account-b', accountB);
      const firstA = await storage.read('account-a');
      const firstB = await storage.read('account-b');
      await storage.write('account-a', { ...accountA, theme: 'light' });
      const updatedA = await storage.read('account-a');
      const blobText = await updatedA.notes[0].attachments[0].blob.text();

      return {
        missing,
        firstATheme: firstA.theme,
        firstBTheme: firstB.theme,
        firstAId: firstA.notes[0].id,
        firstBId: firstB.notes[0].id,
        updatedTheme: updatedA.theme,
        blobText,
        blobType: updatedA.notes[0].attachments[0].blob.type
      };
    });

    assert.equal(result.missing, null);
    assert.equal(result.firstATheme, 'dark');
    assert.equal(result.firstBTheme, 'light');
    assert.equal(result.firstAId, 'note-a');
    assert.equal(result.firstBId, 'note-b');
    assert.equal(result.updatedTheme, 'light');
    assert.equal(result.blobText, 'attachment bytes');
    assert.equal(result.blobType, 'text/plain');
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
});
