'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
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
    assert.ok(initialCache.names.some(name => name === 'memory-pwa-v36-shell'));
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

test('built-in attachment viewer previews browser-supported files in the app', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  assert.equal(html.includes('note-attachment-preview.js'), false);
  const appSource = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  assert.ok(appSource.includes("const isPdf = mime === 'application/pdf'"));
  assert.ok(appSource.includes("new Blob([blob], { type: 'application/pdf' })"));
  assert.ok(appSource.includes('frame.src = objectUrl'));
  assert.ok(appSource.includes('if (isPdf)'));
  assert.ok(appSource.includes("frame.setAttribute('sandbox', '')"));
  assert.ok(appSource.includes('player.controls = true'));
  assert.ok(appSource.includes('generation !== previewGeneration'));
  assert.ok(appSource.includes("Preview isn\\'t available for this file type."));
  const pdfBranch = appSource.slice(appSource.indexOf('if (isPdf)'), appSource.indexOf("} else if (mime.startsWith('image/')"));
  assert.ok(pdfBranch.includes('frame.src = objectUrl'));
  assert.equal(pdfBranch.includes("setAttribute('sandbox'"), false);
});


test('meta CSP protects the signed-out app and permits local Blob preview resources without violations', async () => {
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
    const requested = pathname === '/' ? 'index.html' : decodeURIComponent(pathname.slice(1));
    const file = path.resolve(root, requested);
    if (!file.startsWith(root + path.sep)) { res.writeHead(403); res.end('forbidden'); return; }
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
    const page = await browser.newPage();
    const cspConsoleErrors = [];
    page.on('console', message => {
      if (/content security policy|violates the following content security policy/i.test(message.text())) {
        cspConsoleErrors.push(message.text());
      }
    });
    await page.addInitScript(() => {
      window.__cspViolations = [];
      document.addEventListener('securitypolicyviolation', event => {
        window.__cspViolations.push({
          directive: event.violatedDirective,
          blockedURI: event.blockedURI
        });
      }, true);
    });
    await page.goto(base + '/', { waitUntil: 'load' });
    await page.waitForFunction(() => document.body.classList.contains('auth-locked'));
    const policy = await page.evaluate(() => {
      const meta = document.head.querySelector('meta[http-equiv="Content-Security-Policy"]');
      const directives = Object.fromEntries((meta?.content || '').split(';').map(part => {
        const [name, ...values] = part.trim().split(/\s+/);
        return [name, values];
      }));
      return {
        first: document.head.firstElementChild === meta,
        content: meta?.content || '',
        scriptSrc: directives['script-src'] || [],
        defaultSrc: directives['default-src'] || [],
        frameSrc: directives['frame-src'] || [],
        imgSrc: directives['img-src'] || [],
        mediaSrc: directives['media-src'] || [],
        connectSrc: directives['connect-src'] || [],
        objectSrc: directives['object-src'] || [],
        authVisible: getComputedStyle(document.getElementById('auth-gate')).display !== 'none',
        appHidden: getComputedStyle(document.getElementById('app')).display === 'none'
      };
    });
    assert.equal(policy.first, true, 'CSP meta must be the first head element');
    assert.ok(policy.content);
    assert.equal(policy.scriptSrc.includes("'unsafe-inline'"), false);
    assert.equal(policy.scriptSrc.includes("'unsafe-eval'"), false);
    assert.deepEqual(policy.defaultSrc, ["'none'"]);
    assert.ok(policy.frameSrc.includes('blob:') && policy.frameSrc.includes('https:'));
    assert.ok(policy.imgSrc.includes("'self'") && policy.imgSrc.includes('data:') && policy.imgSrc.includes('blob:') && policy.imgSrc.includes('https:'));
    assert.ok(policy.mediaSrc.includes('blob:') && policy.mediaSrc.includes('https:'));
    assert.equal(policy.connectSrc.includes('https:'), false);
    assert.deepEqual(policy.objectSrc, ["'none'"]);
    assert.equal(policy.authVisible, true, 'signed-out auth gate should be visible');
    assert.equal(policy.appHidden, true, 'notes app should remain hidden while signed out');

    const preview = await page.evaluate(async () => {
      const html = new Blob(['<!doctype html><p>Safe HTML attachment preview</p>'], { type: 'text/html' });
      const htmlUrl = URL.createObjectURL(html);
      const htmlFrame = document.createElement('iframe');
      htmlFrame.setAttribute('sandbox', '');
      htmlFrame.src = htmlUrl;
      document.body.append(htmlFrame);

      const pdf = new Blob(['%PDF-1.4\\n%%EOF'], { type: 'application/pdf' });
      const pdfUrl = URL.createObjectURL(pdf);
      const pdfFrame = document.createElement('iframe');
      pdfFrame.src = pdfUrl;
      document.body.append(pdfFrame);

      const image = new Blob([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], { type: 'image/png' });
      const imageUrl = URL.createObjectURL(image);
      const imageElement = document.createElement('img');
      imageElement.src = imageUrl;
      document.body.append(imageElement);

      const audioUrl = URL.createObjectURL(new Blob([], { type: 'audio/mpeg' }));
      const audio = document.createElement('audio');
      audio.src = audioUrl;
      document.body.append(audio);

      const videoUrl = URL.createObjectURL(new Blob([], { type: 'video/mp4' }));
      const video = document.createElement('video');
      video.src = videoUrl;
      document.body.append(video);
      return { htmlUrl, pdfUrl, imageUrl, audioUrl, videoUrl };
    });
    assert.ok(Object.values(preview).every(url => url.startsWith('blob:')));
    await page.waitForTimeout(250);
    const violations = await page.evaluate(() => window.__cspViolations);
    assert.deepEqual(violations, []);
    assert.deepEqual(cspConsoleErrors, []);

    const appSource = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
    assert.doesNotMatch(appSource, /In-app website previews are disabled by the app security policy/);
    assert.match(appSource, /function openLinkPreview/);
    assert.match(appSource, /MemoryLinkPreview\.classifyLink/);
    assert.doesNotMatch(appSource, /<iframe title="Website preview"/);
    assert.match(appSource, /origin !== window\.location\.origin/);
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
});
