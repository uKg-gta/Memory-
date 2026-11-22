'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const workerSource = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');

function createWorker(fetchImpl) {
  const listeners = {};
  const stores = new Map();
  const writes = [];
  const caches = {
    async open(name) {
      if (!stores.has(name)) {
        const entries = new Map();
        stores.set(name, {
          async match(key) {
            const value = entries.get(typeof key === 'string' ? key : key.url);
            return value ? value.clone() : undefined;
          },
          async put(key, response) {
            const normalized = typeof key === 'string' ? key : key.url;
            entries.set(normalized, response.clone());
            writes.push({ name, key: normalized });
          },
          async addAll() {},
          entries
        });
      }
      return stores.get(name);
    },
    async keys() { return [...stores.keys()]; },
    async delete(name) { return stores.delete(name); }
  };
  const self = {
    location: { origin: 'https://app.example' },
    registration: { scope: 'https://app.example/' },
    clients: { async claim() {} },
    async skipWaiting() {},
    addEventListener(name, callback) { listeners[name] = callback; }
  };
  vm.runInNewContext(workerSource, {
    self, caches, fetch: fetchImpl, URL, Request, Response,
    AbortController, setTimeout, clearTimeout, console
  }, { filename: 'sw.js' });
  return { listeners, caches, stores, writes };
}

async function dispatch(worker, request) {
  let responsePromise;
  worker.listeners.fetch({
    request,
    respondWith(promise) { responsePromise = Promise.resolve(promise); }
  });
  assert.ok(responsePromise, 'fetch handler should call respondWith for GET');
  return responsePromise;
}

const response = (body, status = 200) =>
  new Response(body, { status, headers: { 'content-type': 'text/plain' } });

test('Supabase REST and Storage requests are network-only', async () => {
  const worker = createWorker(async () => response('supabase'));
  for (const path of ['/rest/v1/notes', '/storage/v1/object/private/file']) {
    const result = await dispatch(worker, {
      method: 'GET', mode: 'cors',
      url: 'https://ncqypupxbywojcvwfgvg.supabase.co' + path
    });
    assert.equal(await result.text(), 'supabase');
  }
  assert.equal(worker.writes.length, 0);
  assert.equal(worker.stores.size, 0);
});

test('only an exact allowlisted third-party URL is cached', async () => {
  const worker = createWorker(async () => response('asset'));
  const allowed = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.119.2/dist/umd/supabase.min.js';
  await dispatch(worker, { method: 'GET', mode: 'no-cors', url: allowed });
  assert.deepEqual(worker.writes.map(write => write.key), [allowed]);
  await dispatch(worker, { method: 'GET', mode: 'no-cors', url: allowed + '?unexpected=1' });
  assert.equal(worker.writes.length, 1);
});

test('unlisted external requests are network-only', async () => {
  const worker = createWorker(async () => response('external'));
  await dispatch(worker, {
    method: 'GET', mode: 'cors',
    url: 'https://example.org/track.js'
  });
  assert.equal(worker.writes.length, 0);
  assert.equal(worker.stores.size, 0);
});

test('unknown same-origin GET endpoints are network-only', async () => {
  const worker = createWorker(async () => response('dynamic'));
  await dispatch(worker, {
    method: 'GET', mode: 'cors',
    url: 'https://app.example/api/user-data'
  });
  assert.equal(worker.writes.length, 0);
  assert.equal(worker.stores.size, 0);
});

test('same-origin shell assets may be cached', async () => {
  const worker = createWorker(async () => response('shell asset'));
  const result = await dispatch(worker, {
    method: 'GET', mode: 'cors',
    url: 'https://app.example/tailwind.css'
  });
  assert.equal(await result.text(), 'shell asset');
  assert.equal(worker.writes.length, 1);
  assert.equal(worker.writes[0].key, 'https://app.example/tailwind.css');
  await dispatch(worker, { method: 'GET', mode: 'cors', url: 'https://app.example/note-sync-core.js' });
  assert.equal(worker.writes[1].key, 'https://app.example/note-sync-core.js');
  await dispatch(worker, { method: 'GET', mode: 'cors', url: 'https://app.example/note-storage.js' });
  assert.equal(worker.writes[2].key, 'https://app.example/note-storage.js');
  await dispatch(worker, { method: 'GET', mode: 'cors', url: 'https://app.example/note-state-core.js' });
  assert.equal(worker.writes[3].key, 'https://app.example/note-state-core.js');
  await dispatch(worker, { method: 'GET', mode: 'cors', url: 'https://app.example/note-auth-core.js' });
  assert.equal(worker.writes[4].key, 'https://app.example/note-auth-core.js');
  await dispatch(worker, { method: 'GET', mode: 'cors', url: 'https://app.example/note-editor-core.js' });
  assert.equal(worker.writes[5].key, 'https://app.example/note-editor-core.js');
  await dispatch(worker, { method: 'GET', mode: 'cors', url: 'https://app.example/note-realtime-core.js' });
  assert.equal(worker.writes[6].key, 'https://app.example/note-realtime-core.js');
  await dispatch(worker, { method: 'GET', mode: 'cors', url: 'https://app.example/note-attachment-preview.js' });
  assert.equal(worker.writes[7].key, 'https://app.example/note-attachment-preview.js');
});

test('404 and 500 navigation responses never replace the app shell', async () => {
  for (const status of [404, 500]) {
    const worker = createWorker(async () => response('error page', status));
    const result = await dispatch(worker, {
      method: 'GET', mode: 'navigate',
      url: 'https://app.example/missing-route'
    });
    assert.equal(result.status, status);
    assert.equal(worker.writes.length, 0);
    assert.equal(worker.stores.size, 0);
  }
});

test('offline navigation falls back to the install-time app shell', async () => {
  const worker = createWorker(async () => { throw new Error('offline'); });
  const shell = await worker.caches.open('memory-pwa-v32-shell');
  await shell.put('./index.html', response('cached app shell'));
  const result = await dispatch(worker, {
    method: 'GET', mode: 'navigate',
    url: 'https://app.example/'
  });
  assert.equal(await result.text(), 'cached app shell');
});
