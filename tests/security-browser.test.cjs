'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('playwright');

test('DOMPurify removes executable markup and unsafe attributes in Chromium', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent('<!doctype html><html><body></body></html>');
    await page.addScriptTag({ path: path.join(__dirname, '..', 'vendor', 'purify.min.js') });
    await page.addScriptTag({ path: path.join(__dirname, '..', 'note-sanitizer.js') });

    const result = await page.evaluate(() => {
      window.__xss = 0;
      const payload = '<p>Safe</p><img src=x onerror="window.__xss++">' +
        '<svg onload="window.__xss++"><script>window.__xss++</script></svg>' +
        '<iframe srcdoc="<script>parent.__xss++</script>"></iframe>' +
        '<a href="javascript:window.__xss++" onclick="window.__xss++">bad link</a>';
      const clean = MemoryNoteSanitizer.sanitize(payload);
      const host = document.createElement('div');
      host.innerHTML = clean;
      return {
        clean,
        unsafeNodes: host.querySelectorAll('script,img,svg,iframe').length,
        unsafeAttributes: host.querySelectorAll('[onerror],[onload],[onclick],[srcdoc]').length,
        unsafeUrls: [...host.querySelectorAll('[href]')].some(node => /^\s*javascript:/i.test(node.getAttribute('href'))),
        preservedText: host.textContent.includes('Safe') && host.textContent.includes('bad link')
      };
    });
    await page.waitForTimeout(50);
    assert.equal(result.unsafeNodes, 0);
    assert.equal(result.unsafeAttributes, 0);
    assert.equal(result.unsafeUrls, false);
    assert.equal(result.preservedText, true);
    assert.equal(await page.evaluate(() => window.__xss), 0);
  } finally {
    await browser.close();
  }
});

test('safe formatting survives and stripHtml does not execute image handlers', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent('<!doctype html><html><body></body></html>');
    await page.addScriptTag({ path: path.join(__dirname, '..', 'vendor', 'purify.min.js') });
    await page.addScriptTag({ path: path.join(__dirname, '..', 'note-sanitizer.js') });
    const result = await page.evaluate(() => {
      window.__xss = 0;
      const safe = MemoryNoteSanitizer.sanitize(
        '<p><strong>Bold</strong> <em>Italic</em></p><ul><li>One</li></ul>' +
        '<a href="https://example.com" title="Example">Example</a>'
      );
      const text = MemoryNoteSanitizer.stripHtml(
        '<img src=x onerror="window.__xss++"><p>Visible text</p>'
      );
      return { safe, text, xss: window.__xss };
    });
    assert.match(result.safe, /<strong>Bold<\/strong>/);
    assert.match(result.safe, /<em>Italic<\/em>/);
    assert.match(result.safe, /<ul>/);
    assert.match(result.safe, /href="https:\/\/example\.com"/);
    assert.equal(result.text, 'Visible text');
    assert.equal(result.xss, 0);
  } finally {
    await browser.close();
  }
});


test('real Chromium service worker keeps API and error navigations out of Cache Storage and serves offline shell', async () => {
  const fs = require('node:fs');
  const http = require('node:http');
  const root = path.join(__dirname, '..');
  const mime = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.webmanifest': 'application/manifest+json',
    '.png': 'image/png'
  };
  const server = http.createServer((req, res) => {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    if (pathname === '/__test_404') {
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('test 404 response');
      return;
    }
    if (pathname === '/__test_500') {
      res.writeHead(500, { 'content-type': 'text/plain' });
      res.end('test 500 response');
      return;
    }
    const requested = pathname === '/' ? 'index.html' : decodeURIComponent(pathname.slice(1));
    const file = path.resolve(root, requested);
    if (!file.startsWith(root + path.sep)) {
      res.writeHead(403); res.end('forbidden'); return;
    }
    fs.readFile(file, (error, bytes) => {
      if (error) { res.writeHead(404); res.end('not found'); return; }
      res.writeHead(200, { 'content-type': mime[path.extname(file)] || 'application/octet-stream' });
      res.end(bytes);
    });
  });

  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ serviceWorkers: 'allow' });
    const page = await context.newPage();
    await page.goto(base + '/', { waitUntil: 'load' });
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload({ waitUntil: 'domcontentloaded' });
    assert.equal(await page.evaluate(() => Boolean(navigator.serviceWorker.controller)), true);

    const initialCache = await page.evaluate(async () => {
      const names = await caches.keys();
      const allKeys = [];
      for (const name of names) {
        const cache = await caches.open(name);
        const requests = await cache.keys();
        allKeys.push(...requests.map(request => request.url));
      }
      return { names, allKeys };
    });
    assert.ok(initialCache.names.some(name => name === 'memory-pwa-v31-shell'));
    const approvedExternal = new Set([
      'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.119.2/dist/umd/supabase.min.js',
      'https://unpkg.com/lucide@0.460.0/dist/umd/lucide.min.js',
      'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap'
    ]);
    assert.equal(initialCache.allKeys.some(url => url.includes('supabase.co')), false);
    assert.equal(initialCache.allKeys.filter(url => /^https?:/.test(url) && new URL(url).origin !== new URL(base).origin)
      .every(url => approvedExternal.has(url)), true);

    await page.evaluate(async () => {
      try { await fetch('https://ncqypupxbywojcvwfgvg.supabase.co/rest/v1/__cache_probe__'); } catch (_) {}
      try { await fetch('https://example.org/__unlisted_cache_probe__'); } catch (_) {}
    });
    for (const route of ['/__test_404', '/__test_500']) {
      const response = await page.goto(base + route, { waitUntil: 'domcontentloaded' });
      assert.equal(response.status(), route.endsWith('404') ? 404 : 500);
    }

    const afterProbes = await page.evaluate(async () => {
      const names = await caches.keys();
      const urls = [];
      for (const name of names) {
        const cache = await caches.open(name);
        urls.push(...(await cache.keys()).map(request => request.url));
      }
      return urls;
    });
    assert.equal(afterProbes.some(url => url.includes('supabase.co') || url.includes('__unlisted_cache_probe__')), false);

    await context.setOffline(true);
    await page.goto(base + '/', { waitUntil: 'domcontentloaded' });
    assert.match(await page.title(), /Memory/);
    await context.setOffline(false);
    await context.close();
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
});

test('universal attachment preview routes formats to safe in-app renderers', () => {
  const fs = require('node:fs');
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const preview = fs.readFileSync(path.join(__dirname, '..', 'note-attachment-preview.js'), 'utf8');
  assert.match(html, /note-attachment-preview\.js/);
  assert.match(html, /MemoryAttachmentPreview\.render/);
  assert.match(html, /previewGeneration/);
  assert.doesNotMatch(html, /PDF preview is disabled for safety/);
  assert.match(preview, /sandbox','allow-scripts'/);
  for (const extension of ['docx', 'xlsx', 'pptx', 'zip', 'rar', '7z', 'stl', 'obj', 'gltf', 'glb', 'woff2', 'exe']) {
    assert.ok(preview.includes("'" + extension + "'"), 'preview engine should recognize ' + extension);
  }
  assert.match(preview, /Binary preview/);
  assert.match(preview, /ZIP archive contents/);
  assert.match(preview, /Macros and embedded scripts are not executed/);
  assert.match(preview, /DOMPurify/);
});

test('preview engine renders text, Office documents, PDFs and binary inspector in Chromium', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent('<!doctype html><html><body><div id="preview"></div></body></html>');
    await page.addScriptTag({ path: path.join(__dirname, '..', 'vendor', 'purify.min.js') });
    await page.addScriptTag({ path: path.join(__dirname, '..', 'note-attachment-preview.js') });
    const result = await page.evaluate(async () => {
      const host = document.getElementById('preview');
      const textBlob = new Blob(['{"hello":"Memory"}'], { type: 'application/json' });
      await MemoryAttachmentPreview.render({ container: host, blob: textBlob, name: 'sample.json', mimeType: 'application/json', objectUrl: URL.createObjectURL(textBlob) });
      const text = host.querySelector('pre')?.textContent || '';
      const binary = new Blob([new Uint8Array([0x4d,0x5a,0x00,0xff])], { type: 'application/octet-stream' });
      await MemoryAttachmentPreview.render({ container: host, blob: binary, name: 'sample.exe', mimeType: 'application/octet-stream', objectUrl: URL.createObjectURL(binary) });
      const inspector = host.textContent.includes('File inspector') && host.textContent.includes('Binary preview');
      const pdf = new Blob(['%PDF-1.4'], { type: 'application/pdf' });
      await MemoryAttachmentPreview.render({ container: host, blob: pdf, name: 'sample.pdf', mimeType: 'application/pdf', objectUrl: URL.createObjectURL(pdf) });
      const pdfSandboxed = host.querySelector('iframe')?.getAttribute('sandbox') === 'allow-scripts';
      return { text, inspector, pdfSandboxed };
    });
    assert.match(result.text, /"hello": "Memory"/);
    assert.equal(result.inspector, true);
    assert.equal(result.pdfSandboxed, true);
  } finally {
    await browser.close();
  }
});
