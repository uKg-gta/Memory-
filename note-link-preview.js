'use strict';

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.MemoryLinkPreview = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'avif']);
  const VIDEO_EXTENSIONS = new Set(['mp4', 'webm', 'mov', 'm4v']);
  const AUDIO_EXTENSIONS = new Set(['mp3', 'wav', 'm4a', 'aac', 'ogg', 'flac']);
  const UNSUPPORTED_EXTENSIONS = new Set(['doc', 'xls', 'ppt', 'docx', 'xlsx', 'pptx', 'zip', 'rar', '7z']);
  const YOUTUBE_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be']);
  const VIMEO_HOSTS = new Set(['vimeo.com', 'www.vimeo.com']);

  function invalid(reason) {
    return { kind: 'invalid', src: '', externalUrl: '', reason: reason || 'Invalid URL.' };
  }

  function classifyLink(rawUrl) {
    if (typeof rawUrl !== 'string' || !rawUrl.trim()) return invalid('A URL is required.');

    let parsed;
    try {
      parsed = new URL(rawUrl.trim());
    } catch (_) {
      return invalid('The URL could not be parsed.');
    }

    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return invalid('Only HTTP and HTTPS URLs are supported.');
    }
    if (parsed.username || parsed.password) {
      return invalid('URLs containing a username or password are not allowed.');
    }

    const externalUrl = parsed.href;
    if (parsed.protocol === 'http:') {
      return { kind: 'insecure', src: '', externalUrl, reason: 'HTTP links cannot be previewed here.' };
    }

    const host = parsed.hostname.toLowerCase();
    if (YOUTUBE_HOSTS.has(host)) {
      let videoId = '';
      if (host === 'youtu.be') {
        const match = parsed.pathname.match(/^\/([^/]+)\/?$/);
        videoId = match ? match[1] : '';
      } else if (parsed.pathname === '/watch') {
        videoId = parsed.searchParams.get('v') || '';
      } else {
        const match = parsed.pathname.match(/^\/(?:shorts|embed)\/([^/]+)\/?$/);
        videoId = match ? match[1] : '';
      }
      if (/^[A-Za-z0-9_-]{11}$/.test(videoId)) {
        return { kind: 'video-embed', src: 'https://www.youtube-nocookie.com/embed/' + videoId, externalUrl, reason: '' };
      }
    }

    if (VIMEO_HOSTS.has(host)) {
      const match = parsed.pathname.match(/^\/(\d+)\/?$/);
      if (match) {
        return { kind: 'video-embed', src: 'https://player.vimeo.com/video/' + match[1], externalUrl, reason: '' };
      }
    }

    const extensionMatch = parsed.pathname.match(/\.([a-z0-9]+)$/i);
    const extension = extensionMatch ? extensionMatch[1].toLowerCase() : '';
    let kind = 'page';
    if (IMAGE_EXTENSIONS.has(extension)) kind = 'image';
    else if (extension === 'pdf') kind = 'pdf';
    else if (VIDEO_EXTENSIONS.has(extension)) kind = 'video';
    else if (AUDIO_EXTENSIONS.has(extension)) kind = 'audio';
    else if (UNSUPPORTED_EXTENSIONS.has(extension)) kind = 'unsupported-file';

    return { kind, src: parsed.href, externalUrl, reason: '' };
  }

  return Object.freeze({ classifyLink });
});
