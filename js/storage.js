'use strict';

const ScreenTestDB = (() => {
  const DB_NAME = 'ScreenTestDB';
  const DB_VERSION = 1;
  let db = null;

  async function open() {
    if (db) return db;
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const idb = e.target.result;
        if (!idb.objectStoreNames.contains('media')) {
          idb.createObjectStore('media', { keyPath: 'id' });
        }
        if (!idb.objectStoreNames.contains('settings')) {
          idb.createObjectStore('settings', { keyPath: 'key' });
        }
      };
      req.onsuccess = (e) => { db = e.target.result; resolve(db); };
      req.onerror = (e) => reject(e.target.error);
      req.onblocked = () => reject(new Error('IndexedDB blocked — close other tabs using this app'));
    });
  }

  function store(name, mode) {
    return db.transaction([name], mode).objectStore(name);
  }

  async function saveMedia(id, blob, meta = {}) {
    await open();
    return new Promise((resolve, reject) => {
      const req = store('media', 'readwrite').put({ id, blob, meta, savedAt: Date.now() });
      req.onsuccess = () => resolve(id);
      req.onerror = (e) => reject(e.target.error);
    });
  }

  async function getMedia(id) {
    await open();
    return new Promise((resolve, reject) => {
      const req = store('media', 'readonly').get(id);
      req.onsuccess = (e) => resolve(e.target.result || null);
      req.onerror = (e) => reject(e.target.error);
    });
  }

  async function listMedia() {
    await open();
    return new Promise((resolve, reject) => {
      const req = store('media', 'readonly').getAll();
      req.onsuccess = (e) => resolve(e.target.result);
      req.onerror = (e) => reject(e.target.error);
    });
  }

  async function deleteMedia(id) {
    await open();
    return new Promise((resolve, reject) => {
      const req = store('media', 'readwrite').delete(id);
      req.onsuccess = () => resolve();
      req.onerror = (e) => reject(e.target.error);
    });
  }

  async function saveSetting(key, value) {
    await open();
    return new Promise((resolve, reject) => {
      const req = store('settings', 'readwrite').put({ key, value });
      req.onsuccess = () => resolve();
      req.onerror = (e) => reject(e.target.error);
    });
  }

  async function getSetting(key, fallback = null) {
    await open();
    return new Promise((resolve, reject) => {
      const req = store('settings', 'readonly').get(key);
      req.onsuccess = (e) => resolve(e.target.result ? e.target.result.value : fallback);
      req.onerror = (e) => reject(e.target.error);
    });
  }

  return { open, saveMedia, getMedia, listMedia, deleteMedia, saveSetting, getSetting };
})();
