/* Memory PWA service worker. Requires HTTPS or localhost. */
const VERSION = 'memory-pwa-v26';
const SHELL_CACHE = `${VERSION}-shell`;
const RUNTIME_CACHE = `${VERSION}-runtime`;
const SHELL_FILES = [
  './index.html',
  './tailwind.css',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './vendor/purify.min.js',
  './note-sanitizer.js',
  './note-sync-core.js',
  './note-storage.js',
  './note-state-core.js'
];
const SHELL_ASSETS = new Set(SHELL_FILES.map(path => new URL(path, self.registration.scope).href));

// Only these exact third-party URLs may enter Cache Storage.
const EXTERNAL_ASSETS = new Set([
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.119.2/dist/umd/supabase.min.js',
  'https://unpkg.com/lucide@0.460.0/dist/umd/lucide.min.js',
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap'
]);

// Supabase API and Storage traffic must never be cached.
const SUPABASE_ORIGIN = 'https://ncqypupxbywojcvwfgvg.supabase.co';

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const shell = await caches.open(SHELL_CACHE);
    await shell.addAll(SHELL_FILES);

    const runtime = await caches.open(RUNTIME_CACHE);
    await Promise.allSettled([...EXTERNAL_ASSETS].map(async assetUrl => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      try {
        const response = await fetch(new Request(assetUrl, {
          mode: 'no-cors',
          signal: controller.signal
        }));
        if (response && (response.ok || response.type === 'opaque')) {
          await runtime.put(assetUrl, response);
        }
      } finally {
        clearTimeout(timer);
      }
    }));

    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter(key => key.startsWith('memory-pwa-') && ![SHELL_CACHE, RUNTIME_CACHE].includes(key))
      .map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // External requests are network-only unless their exact URL is allowlisted.
  // The entire Supabase origin is always network-only, including API and Storage.
  if (url.origin !== self.location.origin) {
    if (url.origin === SUPABASE_ORIGIN || !EXTERNAL_ASSETS.has(url.href)) {
      event.respondWith(fetch(request));
      return;
    }

    event.respondWith((async () => {
      const cache = await caches.open(RUNTIME_CACHE);
      const cached = await cache.match(url.href);
      if (cached) return cached;

      try {
        const response = await fetch(request);
        if (response && (response.ok || response.type === 'opaque')) {
          await cache.put(url.href, response.clone());
        }
        return response;
      } catch (error) {
        return cached || Response.error();
      }
    })());
    return;
  }

  // Navigations are network-first. Never replace the known-good app shell with
  // a route-specific response; use the install-time shell only when offline.
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        return await fetch(request);
      } catch (error) {
        const cache = await caches.open(SHELL_CACHE);
        return (await cache.match('./index.html')) || Response.error();
      }
    })());
    return;
  }

  // Cache only the exact same-origin shell assets. All other same-origin
  // requests (including future APIs and dynamic endpoints) remain network-only.
  if (!SHELL_ASSETS.has(url.href)) {
    event.respondWith(fetch(request));
    return;
  }

  event.respondWith((async () => {
    const cache = await caches.open(SHELL_CACHE);
    const cached = await cache.match(url.href);
    if (cached) return cached;

    try {
      const response = await fetch(request);
      if (response && response.ok) await cache.put(url.href, response.clone());
      return response;
    } catch (error) {
      return cached || Response.error();
    }
  })());
});
