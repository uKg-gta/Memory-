'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium, firefox, webkit } = require('playwright');

const root = path.join(__dirname, '..');
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png'
};

async function startServer() {
  const server = http.createServer((req, res) => {
    const pathname = new URL(req.url, 'http://localhost').pathname;
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
  return { server, url: 'http://127.0.0.1:' + server.address().port };
}

for (const [engineName, engine] of Object.entries({ chromium, firefox, webkit })) {
  test(`${engineName}: responsive shell, navigation drawer, themes and editor fit common viewports`, async () => {
    const { server, url } = await startServer();
    const browser = await engine.launch({ headless: true });
    try {
      const context = await browser.newContext();
      const page = await context.newPage();
      await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
      await page.goto(url + '/', { waitUntil: 'domcontentloaded' });
      // This suite checks layout only; keep the workspace visible even when the
      // asynchronous auth bootstrap re-applies its signed-out gate.
      await page.addStyleTag({ content: '#app { display: flex !important; } #auth-gate { display: none !important; }' });
      await page.evaluate(() => document.body.classList.remove('auth-locked'));

      for (const theme of ['light', 'dark']) {
        await page.evaluate(value => document.documentElement.classList.toggle('dark', value === 'dark'), theme);
        for (const width of [360, 390, 768, 1024, 1440]) {
          await page.setViewportSize({ width, height: 900 });
          await page.waitForTimeout(30);
          const shell = await page.evaluate(() => {
            const rect = selector => {
              const el = document.querySelector(selector);
              const box = el.getBoundingClientRect();
              return { x: box.x, right: box.right, width: box.width, height: box.height };
            };
            return {
              viewport: document.documentElement.clientWidth,
              document: document.documentElement.scrollWidth,
              header: rect('header'),
              main: rect('#main-content'),
              sidebarDisplay: getComputedStyle(document.querySelector('#app > aside')).display,
              mobileButtonDisplay: getComputedStyle(document.querySelector('#open-drawer-btn')).display
            };
          });
          assert.ok(shell.document <= shell.viewport + 1,
            `${engineName} ${theme} ${width}px: page has horizontal overflow (${shell.document}px > ${shell.viewport}px)`);
          assert.ok(shell.header.width > 0 && shell.main.width > 0, 'header and main content should be laid out');
          assert.equal(shell.sidebarDisplay !== 'none', width >= 768, 'desktop sidebar breakpoint should be consistent');
          assert.equal(shell.mobileButtonDisplay !== 'none', width < 768, 'mobile menu breakpoint should be consistent');

          const editor = await page.evaluate(() => {
            const overlay = document.querySelector('#editor-overlay');
            const panel = document.querySelector('#editor-panel');
            overlay.classList.remove('hidden');
            const box = panel.getBoundingClientRect();
            const result = {
              width: box.width,
              height: box.height,
              right: box.right,
              bottom: box.bottom,
              viewportWidth: document.documentElement.clientWidth,
              viewportHeight: document.documentElement.clientHeight
            };
            overlay.classList.add('hidden');
            return result;
          });
          assert.ok(editor.width > 0 && editor.height > 0, 'editor should have a measurable size');
          assert.ok(editor.right <= editor.viewportWidth + 1, 'editor should not exceed viewport width');
          assert.ok(editor.bottom <= editor.viewportHeight + 1, 'editor should not exceed viewport height');
        }
      }

      await page.setViewportSize({ width: 360, height: 800 });
      const drawer = await page.evaluate(() => {
        const panel = document.querySelector('#mobile-drawer');
        panel.classList.remove('-translate-x-full');
        const box = panel.getBoundingClientRect();
        return { width: box.width, viewport: document.documentElement.clientWidth, display: getComputedStyle(panel).display };
      });
      assert.ok(drawer.width > 0 && drawer.width <= drawer.viewport * 0.82 + 1, 'mobile drawer should fit its max-width constraint');

      await context.close();
    } finally {
      await browser.close();
      await new Promise(resolve => server.close(resolve));
    }
  });
}
