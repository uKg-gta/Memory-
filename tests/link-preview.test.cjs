'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { classifyLink } = require('../note-link-preview.js');

test('classifies supported image, PDF, video, and audio file extensions', () => {
  for (const extension of ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'avif']) assert.equal(classifyLink('https://files.example/photo.' + extension).kind, 'image', extension);
  assert.equal(classifyLink('https://files.example/document.pdf').kind, 'pdf');
  for (const extension of ['mp4', 'webm', 'mov', 'm4v']) assert.equal(classifyLink('https://files.example/clip.' + extension).kind, 'video', extension);
  for (const extension of ['mp3', 'wav', 'm4a', 'aac', 'ogg', 'flac']) assert.equal(classifyLink('https://files.example/audio.' + extension).kind, 'audio', extension);
});

test('classifies Office and archive file links as unsupported', () => {
  for (const extension of ['doc', 'xls', 'ppt', 'docx', 'xlsx', 'pptx', 'zip', 'rar', '7z']) {
    const result = classifyLink('https://files.example/download.' + extension);
    assert.equal(result.kind, 'unsupported-file', extension);
    assert.equal(result.externalUrl, 'https://files.example/download.' + extension);
  }
});

test('extension matching is case-insensitive and ignores query strings', () => {
  assert.equal(classifyLink('https://files.example/photo.JPG?x=1').kind, 'image');
  assert.equal(classifyLink('https://files.example/clip.MP4?download=1').kind, 'video');
});

test('HTTP is insecure while HTTPS is eligible for previews', () => {
  const insecure = classifyLink('http://example.com/photo.jpg');
  assert.equal(insecure.kind, 'insecure');
  assert.equal(insecure.externalUrl, 'http://example.com/photo.jpg');
  assert.equal(insecure.src, '');
  assert.equal(classifyLink('https://example.com/photo.jpg').kind, 'image');
});

test('rejects executable, data, blob, file, relative and credential-bearing URLs', () => {
  for (const value of ['javascript:alert(1)', 'data:text/html,hello', 'blob:https://example.com/id', 'file:///tmp/file.pdf', '//evil.example/path', 'https://user:pass@example.com/secret']) {
    const result = classifyLink(value);
    assert.equal(result.kind, 'invalid', value);
    assert.equal(result.externalUrl, '', value);
    assert.equal(result.src, '', value);
  }
});

test('YouTube watch, shorts, embed and short-host URLs use validated privacy-enhanced IDs', () => {
  for (const url of ['https://www.youtube.com/watch?v=abcdefghijk', 'https://youtube.com/shorts/abcdefghijk', 'https://m.youtube.com/embed/abcdefghijk', 'https://youtu.be/abcdefghijk']) {
    const result = classifyLink(url);
    assert.equal(result.kind, 'video-embed');
    assert.equal(result.src, 'https://www.youtube-nocookie.com/embed/abcdefghijk');
  }
});

test('invalid or injected YouTube IDs never enter an embed src', () => {
  for (const url of ['https://www.youtube.com/watch?v=abc%22%3E%3Cscript%3E', 'https://www.youtube.com/watch?v=abcdefghij', 'https://youtu.be/abc%22%3E%3Cscript%3E']) {
    const result = classifyLink(url);
    assert.equal(result.kind, 'page');
    assert.doesNotMatch(result.src, /youtube-nocookie\.com\/embed/);
  }
});

test('Vimeo embeds only numeric single-segment video IDs', () => {
  const valid = classifyLink('https://vimeo.com/123456789?share=copy');
  assert.equal(valid.kind, 'video-embed');
  assert.equal(valid.src, 'https://player.vimeo.com/video/123456789');
  assert.equal(classifyLink('https://vimeo.com/not-a-number').kind, 'page');
  assert.equal(classifyLink('https://vimeo.com/123abc').kind, 'page');
});

test('unknown HTTPS URLs are pages and invalid input never produces an external URL', () => {
  const page = classifyLink('https://example.com/a/page?x=1');
  assert.equal(page.kind, 'page');
  assert.equal(page.src, 'https://example.com/a/page?x=1');
  for (const value of ['', '   ', 'not a url', 'https://']) {
    const result = classifyLink(value);
    assert.equal(result.kind, 'invalid');
    assert.equal(result.externalUrl, '');
  }
});
