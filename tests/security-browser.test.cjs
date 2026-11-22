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
