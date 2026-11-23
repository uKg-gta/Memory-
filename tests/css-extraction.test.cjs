const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');
const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');

test('the existing application stylesheet is external and loaded by index.html', () => {
  assert.match(html, /<link rel="stylesheet" href="\.\/styles\.css"\s*\/>/);
  assert.doesNotMatch(html, /<style\b/i);
  assert.ok(css.includes(':root {'));
  assert.ok(css.includes('.note-card {'));
  assert.ok(css.includes('body.cloud-readonly'));
});

test('the extracted stylesheet is precached by the current PWA shell', () => {
  assert.match(sw, /const VERSION = 'memory-pwa-v39';/);
  assert.match(sw, /'\.\/styles\.css'/);
  assert.match(sw, /const SHELL_ASSETS = new Set\(SHELL_FILES/);
});
