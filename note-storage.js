'use strict';

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.MemoryNoteStorage = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const DB_NAME = 'MemoryPersonalNotes';
  const DB_VERSION = 2;
  const DB_STORE = 'appState';

  function create(indexedDBApi) {
    let dbPromise = null;

    function open() {
      if (dbPromise) return dbPromise;
      if (!indexedDBApi || typeof indexedDBApi.open !== 'function') {
        return Promise.reject(new Error('IndexedDB is unavailable in this browser context.'));
      }

      dbPromise = new Promise((resolve, reject) => {
        const request = indexedDBApi.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains(DB_STORE)) db.createObjectStore(DB_STORE, { keyPath: 'key' });
          if (request.oldVersion < 2 && db.objectStoreNames.contains(DB_STORE)) {
            request.transaction.objectStore(DB_STORE).clear();
          }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => {
          dbPromise = null;
          reject(request.error || new Error('Could not open local database.'));
        };
        request.onblocked = () => {
          dbPromise = null;
          reject(new Error('The local database is blocked by another open Memory tab.'));
        };
      });
      return dbPromise;
    }

    async function read(key) {
      const db = await open();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(DB_STORE, 'readonly');
        const request = tx.objectStore(DB_STORE).get(key);
        request.onsuccess = () => resolve(request.result ? request.result.value : null);
        request.onerror = () => reject(request.error || new Error('Could not read local data.'));
        tx.onabort = () => reject(tx.error || new Error('Local read was interrupted.'));
      });
    }

    async function write(key, value) {
      const db = await open();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(DB_STORE, 'readwrite');
        tx.objectStore(DB_STORE).put({ key, value, updatedAt: Date.now() });
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error || new Error('Could not save local data.'));
        tx.onabort = () => reject(tx.error || new Error('Local save was interrupted.'));
      });
    }

    async function remove(key) {
      const db = await open();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(DB_STORE, 'readwrite');
        tx.objectStore(DB_STORE).delete(key);
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error || new Error('Could not clear old local data.'));
        tx.onabort = () => reject(tx.error || new Error('Local cleanup was interrupted.'));
      });
    }

    return Object.freeze({ read, write, remove });
  }

  return Object.freeze({ create });
});
