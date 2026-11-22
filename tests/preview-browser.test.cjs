'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.join(__dirname, '..');

function createTestServer() {
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
    if (!file.startsWith(root + path.sep)) {
      res.writeHead(403); res.end('forbidden'); return;
    }
    fs.readFile(file, (error, bytes) => {
      if (error) { res.writeHead(404); res.end('not found'); return; }
      if (requested === 'app.js') {
        const hook = [
          '',
          'window.__memoryTest = {',
          '  openLinkPreview: link => openLinkPreview(link),',
          '  closePreview: () => closeAttachmentPreview(),',
          '  setWritable: writable => { authUser = writable ? { id: "test-user" } : null; authReady = true; syncReady = !!writable; syncStatus = writable ? "synced" : "idle"; syncInProgress = false; syncStartedWritable = false; applyReadOnlyMode(); },',
          '  setEditorDraft: attachments => { document.body.classList.remove("auth-locked"); document.getElementById("auth-gate").classList.add("hidden"); editorDraft = { id: "test-note", title: "Test note", bodyHtml: "", checklist: [], links: [], attachments: attachments || [], colour: "paper", pinned: false, order: 1, folderId: "", labelIds: [], archived: false, trashed: false, createdAt: Date.now() }; state.notes = [editorDraft]; editingNoteId = editorDraft.id; document.getElementById("editor-title").value = editorDraft.title; document.getElementById("editor-body").textContent = ""; document.getElementById("editor-overlay").classList.remove("hidden"); renderEditorAttachments(); window.__memoryTest.setWritable(false); },',
          '  getAttachment: id => (editorDraft && editorDraft.attachments || []).find(item => item.id === id) || null,',
          '  closeEditor: () => closeEditor(),',
          '  isReady: () => authReady',
          '};',
          ''
        ].join('\n');
        const source = bytes.toString('utf8');
        const closure = source.lastIndexOf('    })();');
        if (closure < 0) { res.writeHead(500); res.end('app.js test hook insertion point missing'); return; }
        res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8' });
        res.end(source.slice(0, closure) + hook + source.slice(closure));
        return;
      }
      res.writeHead(200, { 'content-type': mime[path.extname(file)] || 'application/octet-stream' });
      res.end(bytes);
    });
  });
  return server;
}

async function openApp(browser) {
  const server = createTestServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  const context = await browser.newContext({ serviceWorkers: 'block', acceptDownloads: true });
  const page = await context.newPage();
  await page.route('https://**/*', async route => {
    const url = new URL(route.request().url());
    if (url.hostname === 'cdn.jsdelivr.net') {
      await route.fulfill({ status: 200, contentType: 'text/javascript', body: 'window.supabase = { createClient: function () { return null; } };' });
    } else if (url.hostname === 'unpkg.com') {
      await route.fulfill({ status: 200, contentType: 'text/javascript', body: 'window.lucide = { createIcons: function () {} };' });
    } else if (url.hostname === 'fonts.googleapis.com') {
      await route.fulfill({ status: 200, contentType: 'text/css', body: '' });
    } else if (url.hostname === 'stub.example.test') {
      if (/\.png$/i.test(url.pathname)) {
        await route.fulfill({ status: 200, contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jWZkAAAAASUVORK5CYII=', 'base64') });
      } else if (/\.pdf$/i.test(url.pathname)) {
        await route.fulfill({ status: 200, contentType: 'application/pdf', body: '%PDF-1.4\n%%EOF' });
      } else if (/\.mp4$/i.test(url.pathname)) {
        await route.fulfill({ status: 200, contentType: 'video/mp4', body: Buffer.from([0, 0, 0, 16, 102, 116, 121, 112, 105, 115, 111, 109]) });
      } else if (/\.mp3$/i.test(url.pathname)) {
        await route.fulfill({ status: 200, contentType: 'audio/mpeg', body: Buffer.from([73, 68, 51, 3, 0, 0, 0, 0, 0, 0]) });
      } else {
        await route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: '<!doctype html><title>Stub</title><p>stubbed page content</p>' });
      }
    } else if (url.hostname === 'www.youtube-nocookie.com' || url.hostname === 'player.vimeo.com') {
      await route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: '<!doctype html><title>Video stub</title>' });
    } else {
      await route.fulfill({ status: 200, contentType: 'text/plain', body: '' });
    }
  });
  await page.addInitScript(() => {
    window.__cspViolations = [];
    document.addEventListener('securitypolicyviolation', event => {
      window.__cspViolations.push({ directive: event.violatedDirective, blockedURI: event.blockedURI });
    }, true);
  });
  await page.goto(base + '/', { waitUntil: 'load' });
  await page.waitForFunction(() => !!window.__memoryTest && window.__memoryTest.isReady());
  // This harness tests the app UI without a real sign-in; keep the signed-out
  // gate from covering the preview/menu controls while retaining read-only mode.
  await page.addStyleTag({ content: 'body.auth-locked #app { display: flex !important; } body.auth-locked #auth-gate { display: none !important; }' });
  await page.evaluate(() => document.body.classList.remove('auth-locked'));
  return { server, context, page };
}

async function closeApp(app, browser) {
  await app.context.close();
  await browser.close();
  await new Promise(resolve => app.server.close(resolve));
}

test('link preview window renders HTTPS resources with restrictive frames and safe fallbacks', async () => {
  const browser = await chromium.launch({ headless: true });
  let app;
  try {
    app = await openApp(browser);
    const page = app.page;
    const policy = await page.evaluate(() => {
      const meta = document.head.querySelector('meta[http-equiv="Content-Security-Policy"]');
      const directives = Object.fromEntries(meta.content.split(';').map(part => {
        const [name, ...values] = part.trim().split(/\s+/);
        return [name, values];
      }));
      return {
        first: document.head.firstElementChild === meta,
        frame: directives['frame-src'],
        images: directives['img-src'],
        media: directives['media-src'],
        connect: directives['connect-src'],
        script: directives['script-src'],
        default: directives['default-src']
      };
    });
    assert.equal(policy.first, true);
    assert.ok(policy.frame.includes('https:'));
    assert.ok(policy.images.includes('https:'));
    assert.ok(policy.media.includes('https:'));
    assert.equal(policy.connect.includes('https:'), false);
    assert.ok(policy.script.includes("'unsafe-inline'") === false);
    assert.deepEqual(policy.default, ["'none'"]);

    await page.evaluate(() => window.__memoryTest.openLinkPreview({ title: 'Image', url: 'https://stub.example.test/photo.png?x=1' }));
    const image = page.locator('#file-preview-body img');
    await image.waitFor({ state: 'attached' });
    assert.equal(await image.getAttribute('referrerpolicy'), 'no-referrer');
    const external = page.locator('#file-preview-external');
    const externalInfo = await external.evaluate(element => ({ href: element.href, target: element.target, rel: element.rel }));
    assert.equal(externalInfo.href, 'https://stub.example.test/photo.png?x=1');
    assert.equal(externalInfo.target, '_blank');
    assert.equal(externalInfo.rel, 'noopener noreferrer');

    await page.evaluate(() => window.__memoryTest.openLinkPreview({ title: 'PDF', url: 'https://stub.example.test/document.pdf' }));
    const pdf = page.locator('#file-preview-body iframe');
    await pdf.waitFor({ state: 'attached' });
    assert.equal(await pdf.getAttribute('sandbox'), 'allow-scripts allow-same-origin');
    assert.equal(await pdf.getAttribute('referrerpolicy'), 'no-referrer');

    await page.evaluate(() => window.__memoryTest.openLinkPreview({ title: 'Video', url: 'https://stub.example.test/clip.mp4' }));
    const video = page.locator('#file-preview-body video');
    await video.waitFor({ state: 'attached' });
    assert.equal(await video.getAttribute('controls'), '');
    assert.equal(await video.getAttribute('playsinline'), '');

    await page.evaluate(() => window.__memoryTest.openLinkPreview({ title: 'Audio', url: 'https://stub.example.test/sound.mp3' }));
    const audio = page.locator('#file-preview-body audio');
    await audio.waitFor({ state: 'attached' });
    assert.equal(await audio.getAttribute('controls'), '');
    assert.equal(await audio.getAttribute('playsinline'), '');

    await page.evaluate(() => window.__memoryTest.openLinkPreview({ title: 'Page', url: 'https://stub.example.test/page' }));
    const pageFrame = page.locator('#file-preview-body iframe');
    await pageFrame.waitFor({ state: 'attached' });
    assert.equal(await pageFrame.getAttribute('sandbox'), 'allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox');
    assert.equal((await pageFrame.getAttribute('sandbox')).includes('allow-top-navigation'), false);
    assert.ok((await page.locator('#file-preview-body').innerText()).includes("Some sites don't allow previews. If this looks blank, use Open externally."));

    await page.evaluate(() => window.__memoryTest.openLinkPreview({ title: 'YouTube', url: 'https://www.youtube.com/watch?v=abcdefghijk' }));
    const embed = page.locator('#file-preview-body iframe');
    await embed.waitFor({ state: 'attached' });
    assert.equal(await embed.getAttribute('src'), 'https://www.youtube-nocookie.com/embed/abcdefghijk');
    assert.equal(await embed.getAttribute('sandbox'), 'allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox');
    assert.equal(await embed.getAttribute('allow'), 'fullscreen; picture-in-picture');

    await page.evaluate(() => window.__memoryTest.openLinkPreview({ title: 'Office', url: 'https://stub.example.test/report.docx' }));
    assert.ok((await page.locator('#file-preview-body').innerText()).includes("This file type can't be previewed in the browser. Use Open externally."));
    assert.equal(await external.evaluate(element => !element.classList.contains('hidden')), true);

    await page.evaluate(() => window.__memoryTest.openLinkPreview({ title: 'Insecure', url: 'http://stub.example.test/page' }));
    assert.ok((await page.locator('#file-preview-body').innerText()).includes("This link uses http, so it can't be previewed here. Use Open externally."));
    assert.equal(await external.evaluate(element => !element.classList.contains('hidden')), true);

    await page.evaluate(() => window.__memoryTest.openLinkPreview({ title: 'Invalid', url: 'javascript:alert(1)' }));
    assert.ok((await page.locator('#file-preview-body').innerText()).includes("This link can't be previewed or opened."));
    assert.equal(await external.evaluate(element => element.classList.contains('hidden')), true);
    assert.equal(await external.getAttribute('href'), null);

    await page.evaluate(() => window.__memoryTest.openLinkPreview({ title: 'Close test', url: 'https://stub.example.test/page' }));
    await page.locator('#file-preview-close').click();
    assert.equal(await page.locator('#file-preview-body').evaluate(element => element.childElementCount), 0);

    await app.context.setOffline(true);
    await page.evaluate(() => window.__memoryTest.openLinkPreview({ title: 'Offline', url: 'https://stub.example.test/page' }));
    assert.ok((await page.locator('#file-preview-body').innerText()).includes("You're offline. Link previews need a connection."));
    assert.equal(await page.locator('#file-preview-body iframe').count(), 0);
    await app.context.setOffline(false);

    await page.waitForTimeout(100);
    assert.deepEqual(await page.evaluate(() => window.__cspViolations), []);
  } finally {
    if (app) await closeApp(app, browser);
    else await browser.close();
  }
});

test('attachment menu supports positioning, keyboard access, preview, download, rename, remove, and read-only', async () => {
  const browser = await chromium.launch({ headless: true });
  let app;
  try {
    app = await openApp(browser);
    const page = app.page;
    await page.setViewportSize({ width: 360, height: 640 });
    await page.evaluate(() => window.__memoryTest.setEditorDraft([{
      id: 'att1', name: 'photo.png', type: 'PNG', size: '1 KB', sizeBytes: 1024,
      mimeType: 'image/png', blob: new Blob(['image bytes'], { type: 'image/png' })
    }]));
    const trigger = '[data-att-menu="att1"]';
    await page.evaluate(selector => {
      const button = document.querySelector(selector);
      button.style.position = 'fixed';
      button.style.right = '4px';
      button.style.bottom = '72px';
    }, trigger);
    await page.locator(trigger).click();
    const menu = page.locator('#attachment-menu');
    await menu.waitFor({ state: 'attached' });
    const geometry = await page.evaluate(() => {
      const panel = document.getElementById('attachment-menu').getBoundingClientRect();
      const button = document.querySelector('[data-att-menu="att1"]').getBoundingClientRect();
      return { left: panel.left, top: panel.top, right: panel.right, bottom: panel.bottom, triggerTop: button.top };
    });
    assert.ok(geometry.left >= 0 && geometry.top >= 0 && geometry.right <= 360 && geometry.bottom <= 640);
    assert.ok(geometry.top < geometry.triggerTop, 'menu should flip above a trigger near the bottom');
    assert.equal(await page.locator('[data-att-menu-action="rename"]').isDisabled(), true);
    assert.equal(await page.locator('[data-att-menu-action="remove"]').isDisabled(), true);
    assert.equal(await page.locator('[data-att-menu-action="preview"]').isDisabled(), false);
    assert.equal(await page.locator('[data-att-menu-action="download"]').isDisabled(), false);

    await page.keyboard.press('ArrowDown');
    assert.equal(await page.evaluate(() => document.activeElement.getAttribute('data-att-menu-action')), 'download');
    await page.keyboard.press('ArrowUp');
    assert.equal(await page.evaluate(() => document.activeElement.getAttribute('data-att-menu-action')), 'preview');
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#attachment-menu').count(), 0);
    assert.equal(await page.evaluate(() => document.activeElement.getAttribute('data-att-menu')), 'att1');

    await page.evaluate(() => {
      const button = document.querySelector('[data-att-menu="att1"]');
      button.style.position = '';
      button.style.right = '';
      button.style.bottom = '';
    });
    await page.locator(trigger).click();
    await page.locator('[data-att-menu-action="preview"]').click();
    assert.equal(await page.locator('#file-preview-overlay').evaluate(element => !element.classList.contains('hidden')), true);
    await page.locator('#file-preview-close').click();

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      (async () => {
        await page.locator(trigger).click();
        await page.locator('[data-att-menu-action="download"]').click();
      })()
    ]);
    assert.equal(download.suggestedFilename(), 'photo.png');

    await page.evaluate(() => window.__memoryTest.setWritable(true));
    await page.locator(trigger).click();
    assert.equal(await page.locator('[data-att-menu-action="rename"]').isDisabled(), false);
    assert.equal(await page.locator('[data-att-menu-action="remove"]').isDisabled(), false);
    await page.keyboard.press('Escape');

    async function beginRename() {
      if (await page.locator('#attachment-menu').count() === 0) await page.locator(trigger).click();
      await page.locator('[data-att-menu-action="rename"]').click();
      await page.locator('#attachment-rename-input').waitFor({ state: 'visible' });
    }
    await beginRename();
    await page.locator('#attachment-rename-input').fill('');
    await page.locator('#attachment-rename-save').click();
    assert.ok((await page.locator('#attachment-rename-error').innerText()).length > 0);
    await page.locator('#attachment-rename-input').evaluate(input => { input.value = 'a'.repeat(121); });
    await page.locator('#attachment-rename-save').click();
    assert.ok((await page.locator('#attachment-rename-error').innerText()).includes('120'));
    await page.locator('#attachment-rename-input').fill('bad/name.pdf');
    await page.locator('#attachment-rename-save').click();
    assert.ok((await page.locator('#attachment-rename-error').innerText()).includes('cannot contain'));
    await page.locator('#attachment-rename-input').fill('bad\\name.pdf');
    await page.locator('#attachment-rename-save').click();
    assert.ok((await page.locator('#attachment-rename-error').innerText()).includes('cannot contain'));
    await page.locator('#attachment-rename-input').evaluate(input => { input.value = 'bad' + String.fromCharCode(1) + 'name.pdf'; });
    await page.locator('#attachment-rename-save').click();
    assert.ok((await page.locator('#attachment-rename-error').innerText()).includes('control characters'));
    await page.locator('#attachment-rename-input').evaluate(input => { input.value = 'bad' + String.fromCharCode(1) + 'name.pdf'; });
    await page.locator('#attachment-rename-save').click();
    assert.ok((await page.locator('#attachment-rename-error').innerText()).includes('cannot contain'));
    await page.locator('#attachment-rename-input').fill('Report.PdF');
    await page.locator('#attachment-rename-input').press('Enter');
    await page.waitForFunction(() => window.__memoryTest.getAttachment('att1').name === 'Report.PdF');
    assert.equal(await page.evaluate(() => window.__memoryTest.getAttachment('att1').type), 'PDF');

    await beginRename();
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#attachment-rename-overlay').evaluate(element => element.classList.contains('hidden')), true);

    await page.locator(trigger).click();
    await page.locator('[data-att-menu-action="remove"]').click();
    assert.equal(await page.locator('#confirm-title').innerText(), 'Remove attachment?');
    await page.locator('#confirm-cancel-btn').click();

    await page.locator(trigger).click();
    await page.locator('[data-att-menu-action="remove"]').click();
    await page.locator('#confirm-ok-btn').click();
    await page.waitForFunction(() => !document.querySelector('[data-att-menu="att1"]'));
    assert.equal(await page.evaluate(() => window.__memoryTest.getAttachment('att1')), null);

    await page.evaluate(() => window.__memoryTest.setEditorDraft([{ id: 'old1', name: 'old-file.pdf', type: 'PDF', size: 'old', sizeBytes: 0 }]));
    await page.locator('[data-att-menu="old1"]').click();
    await page.locator('[data-att-menu-action="download"]').click();
    assert.ok((await page.locator('#toast').innerText()).includes('older attachment'));

    await page.locator('[data-att-menu="old1"]').click();
    await page.evaluate(() => window.__memoryTest.closeEditor());
    assert.equal(await page.locator('#attachment-menu').count(), 0);
    assert.equal(await page.locator('#editor-overlay').evaluate(element => element.classList.contains('hidden')), true);
  } finally {
    if (app) await closeApp(app, browser);
    else await browser.close();
  }
});
