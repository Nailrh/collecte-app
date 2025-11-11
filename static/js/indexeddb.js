/* static/js/indexeddb.js
   Robust IndexedDB wrapper for collecte-app.
   DB name: collecte_db (stores: personnes, outbox)
   Exposes window.DB
*/

(function (window) {
  const DB_NAME = 'collecte_db';
  const DB_VER = 1;
  const STORE_PERSONNES = 'personnes';
  const STORE_OUTBOX = 'outbox';
  let db = null;
  let _readyPromise = null;

  // Configurable sync endpoint (adapt to your backend)
  const SYNC_URL = '/api/sync-outbox/';

  function log(...args) { console.log('[DB]', ...args); }
  function errLog(...args) { console.error('[DB]', ...args); }

  function open() {
    return new Promise((resolve, reject) => {
      if (db) return resolve(db);
      const req = indexedDB.open(DB_NAME, DB_VER);

      req.onupgradeneeded = e => {
        const d = e.target.result;
        log('onupgradeneeded, oldVersion=', e.oldVersion, 'newVersion=', e.newVersion);
        if (!d.objectStoreNames.contains(STORE_PERSONNES)) {
          const s = d.createObjectStore(STORE_PERSONNES, { keyPath: 'id', autoIncrement: true });
          s.createIndex('created_at', 'created_at', { unique: false });
          log('created store', STORE_PERSONNES);
        }
        if (!d.objectStoreNames.contains(STORE_OUTBOX)) {
          d.createObjectStore(STORE_OUTBOX, { keyPath: 'qid', autoIncrement: true });
          log('created store', STORE_OUTBOX);
        }
      };

      req.onsuccess = e => {
        db = e.target.result;
        db.onversionchange = () => {
          log('versionchange event — closing db');
          db.close();
          db = null;
        };
        log('DB opened', DB_NAME, 'version', db.version);
        resolve(db);
      };

      req.onerror = e => {
        errLog('open error', e.target.error);
        reject(e.target.error);
      };

      req.onblocked = () => {
        errLog('open blocked — close other tabs with this origin');
      };
    });
  }

  // ready() returns a single promise to open the DB
  function ready() {
    if (!_readyPromise) _readyPromise = open();
    return _readyPromise;
  }

  // transaction completion helper (portable)
  function waitTxComplete(tx) {
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onabort = e => reject(e.target && e.target.error);
      tx.onerror = e => reject(e.target && e.target.error);
    });
  }

  // helper to get objectStore via transaction, returns {store, tx}
  async function getStore(storeName, mode = 'readonly') {
    const database = await ready();
    const tx = database.transaction(storeName, mode);
    const store = tx.objectStore(storeName);
    return { store, tx };
  }

  function promisifyRequest(req) {
    return new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = e => reject(e.target && e.target.error);
    });
  }

  // CRUD operations for personnes
  async function addPerson(person) {
    try {
      const { store, tx } = await getStore(STORE_PERSONNES, 'readwrite');
      const req = store.add(person);
      const result = await promisifyRequest(req);
      await waitTxComplete(tx);
      log('addPerson success', result, person);
      return result;
    } catch (e) {
      if (e && e.name === 'QuotaExceededError') {
        errLog('addPerson QuotaExceededError');
      } else {
        errLog('addPerson error', e);
      }
      throw e;
    }
  }

  async function upsertPerson(person) {
    try {
      const { store, tx } = await getStore(STORE_PERSONNES, 'readwrite');
      const req = store.put(person);
      const result = await promisifyRequest(req);
      await waitTxComplete(tx);
      log('upsertPerson success', result, person);
      return result;
    } catch (e) {
      errLog('upsertPerson error', e);
      throw e;
    }
  }

  async function getById(id) {
    try {
      const { store } = await getStore(STORE_PERSONNES, 'readonly');
      const req = store.get(id);
      const result = await promisifyRequest(req);
      log('getById', id, '=>', result);
      return result;
    } catch (e) {
      errLog('getById error', e);
      throw e;
    }
  }

  async function getAllPersons() {
    try {
      const { store } = await getStore(STORE_PERSONNES, 'readonly');
      const req = store.getAll();
      const result = await promisifyRequest(req);
      log('getAllPersons count', (result && result.length) || 0);
      return result || [];
    } catch (e) {
      errLog('getAllPersons error', e);
      throw e;
    }
  }

  async function countPersons() {
    try {
      const { store } = await getStore(STORE_PERSONNES, 'readonly');
      const req = store.count();
      const result = await promisifyRequest(req);
      log('countPersons', result);
      return result || 0;
    } catch (e) {
      errLog('countPersons error', e);
      throw e;
    }
  }

  async function deletePerson(id) {
    try {
      const { store, tx } = await getStore(STORE_PERSONNES, 'readwrite');
      const req = store.delete(id);
      const result = await promisifyRequest(req);
      await waitTxComplete(tx);
      log('deletePerson', id);
      return result;
    } catch (e) {
      errLog('deletePerson error', e);
      throw e;
    }
  }

  async function clearPersons() {
    try {
      const { store, tx } = await getStore(STORE_PERSONNES, 'readwrite');
      const req = store.clear();
      const result = await promisifyRequest(req);
      await waitTxComplete(tx);
      log('clearPersons done');
      return result;
    } catch (e) {
      errLog('clearPersons error', e);
      throw e;
    }
  }

  // iterate with cursor
  async function iteratePersons(cb /* function(item) */) {
    try {
      const database = await ready();
      const tx = database.transaction(STORE_PERSONNES, 'readonly');
      const store = tx.objectStore(STORE_PERSONNES);
      return await new Promise((resolve, reject) => {
        const req = store.openCursor();
        req.onsuccess = e => {
          const cursor = e.target.result;
          if (cursor) {
            try {
              cb(cursor.value);
            } catch (err) {
              errLog('iterate callback error', err);
            }
            cursor.continue();
          } else {
            // done
          }
        };
        req.onerror = e => reject(e.target.error);
        tx.oncomplete = () => resolve();
        tx.onerror = e => reject(e.target.error);
      });
    } catch (e) {
      errLog('iteratePersons error', e);
      throw e;
    }
  }

  // bulk add array of persons (useful for import)
  async function bulkAddPersons(items = []) {
    try {
      const { store, tx } = await getStore(STORE_PERSONNES, 'readwrite');
      return await new Promise((resolve, reject) => {
        items.forEach(item => store.add(item));
        tx.oncomplete = () => {
          log('bulkAddPersons complete', items.length);
          resolve(items.length);
        };
        tx.onerror = e => {
          errLog('bulkAddPersons tx error', e.target.error);
          reject(e.target.error);
        };
      });
    } catch (e) {
      errLog('bulkAddPersons error', e);
      throw e;
    }
  }

  // Outbox helpers
  async function enqueueSync(action) {
    // recommended action shape: { method: 'POST', url: '/api/personnes/', body: {...} }
    try {
      const { store, tx } = await getStore(STORE_OUTBOX, 'readwrite');
      const req = store.add({ action, ts: Date.now() });
      const result = await promisifyRequest(req);
      await waitTxComplete(tx);
      log('enqueueSync qid=', result, action);
      return result;
    } catch (e) {
      errLog('enqueueSync error', e);
      throw e;
    }
  }

  async function getOutbox() {
    try {
      const { store } = await getStore(STORE_OUTBOX, 'readonly');
      const req = store.getAll();
      const result = await promisifyRequest(req);
      log('getOutbox count', (result && result.length) || 0);
      return result || [];
    } catch (e) {
      errLog('getOutbox error', e);
      throw e;
    }
  }

  async function removeOutboxItem(qid) {
    try {
      const { store, tx } = await getStore(STORE_OUTBOX, 'readwrite');
      const req = store.delete(qid);
      const result = await promisifyRequest(req);
      await waitTxComplete(tx);
      log('removeOutboxItem', qid);
      return result;
    } catch (e) {
      errLog('removeOutboxItem error', e);
      throw e;
    }
  }

  // Utility: get CSRF token from cookie (Django default)
  function getCSRF() {
    const m = document.cookie.match(/(^|;)\s*csrftoken=([^;]+)/);
    return m ? decodeURIComponent(m[2]) : null;
  }

  // Utility: fetch with timeout and optional retries
  function fetchWithTimeout(url, opts = {}, ms = 15000, signal) {
    const controller = new AbortController();
    const signals = [controller.signal];
    if (signal) {
      signal.addEventListener('abort', () => controller.abort());
    }
    const id = setTimeout(() => controller.abort(), ms);
    const mergedOpts = Object.assign({}, opts, { signal: controller.signal });
    return fetch(url, mergedOpts).finally(() => clearTimeout(id));
  }

  async function tryFetchWithRetries(url, opts = {}, retries = 2, backoff = 1000) {
    let lastErr = null;
    for (let i = 0; i <= retries; i++) {
      try {
        const res = await fetchWithTimeout(url, opts, 15000);
        return res;
      } catch (e) {
        lastErr = e;
        await new Promise(r => setTimeout(r, backoff * (i + 1)));
      }
    }
    throw lastErr;
  }

  // flush outbox: expects action shape { method, url, body }
  async function flushOutbox({ syncUrl = SYNC_URL, onProgress = null, retries = 1 } = {}) {
    try {
      const out = await getOutbox();
      for (const item of out) {
        const action = item.action || {};
        const method = (action.method || 'POST').toUpperCase();
        const url = action.url || syncUrl;
        const body = action.body || action; // fallback to whole action if shape different

        const headers = { 'Content-Type': 'application/json' };
        const csrftoken = getCSRF();
        if (csrftoken) headers['X-CSRFToken'] = csrftoken;

        try {
          const resp = await tryFetchWithRetries(url, {
            method,
            headers,
            body: method === 'GET' ? undefined : JSON.stringify(body),
            credentials: 'same-origin'
          }, retries, 1000);

          if (!resp || !resp.ok) {
            // server returned error - surface it and stop processing further items
            errLog('flushOutbox: server returned', resp && resp.status);
            return { success: false, status: resp && resp.status };
          }

          // parse response and allow server to map client -> server ids if provided
          let data = null;
          try {
            data = await resp.json().catch(() => null);
          } catch (e) {
            data = null;
          }

          // if server returns mapping, let client update local records
          if (data && data.mappings) {
            // example mappings: [{ client_qid: item.qid, server_id: 123, client_id: 7 }]
            try {
              if (Array.isArray(data.mappings)) {
                for (const m of data.mappings) {
                  if (m.client_id && m.server_id) {
                    // update local person record if present
                    try {
                      const person = await getById(m.client_id);
                      if (person) {
                        person.server_id = m.server_id;
                        await upsertPerson(person);
                      }
                    } catch (e) {
                      // ignore mapping update errors
                      errLog('mapping update error', e);
                    }
                  }
                  if (m.client_qid) {
                    // remove outbox item explicitly if server mapped it
                    try {
                      await removeOutboxItem(m.client_qid);
                    } catch (e) {
                      // ignore
                    }
                  }
                }
              }
            } catch (e) {
              errLog('processing mappings failed', e);
            }
          } else {
            // default: remove the outbox item on success
            await removeOutboxItem(item.qid);
          }

          if (onProgress) onProgress(item.qid);
        } catch (e) {
          // network or retry exhaustion — stop and retry later
          errLog('flushOutbox network error or retry exhausted', e);
          return { success: false, error: e };
        }
      }
      return { success: true };
    } catch (e) {
      errLog('flushOutbox fatal', e);
      throw e;
    }
  }

  function close() {
    if (db) {
      db.close();
      db = null;
      log('DB closed');
    }
  }

  // for testing convenience
  async function testAddAndList() {
    try {
      await ready();
      const id = await addPerson({ name: 'Test ' + Date.now(), created_at: Date.now() });
      const all = await getAllPersons();
      log('testAddAndList ->', all);
      return { id, all };
    } catch (e) {
      errLog('testAddAndList error', e);
      throw e;
    }
  }

  // Auto flush on online
  function _setupAutoFlush() {
    try {
      window.addEventListener('online', async () => {
        log('navigator back online — attempting to flush outbox');
        try {
          const res = await flushOutbox();
          log('auto flushOutbox result', res);
        } catch (e) {
          errLog('auto flush failed', e);
        }
      });
    } catch (e) {
      errLog('setupAutoFlush failed', e);
    }
  }

  // init: expose ready promise and set up auto flush
  async function init() {
    await ready();
    _setupAutoFlush();
  }

  // Public API
  const API = {
    ready,
    open,
    addPerson,
    upsertPerson,
    deletePerson,
    getById,
    getAllPersons,
    countPersons,
    clearPersons,
    iteratePersons,
    bulkAddPersons,
    enqueueSync,
    getOutbox,
    removeOutboxItem,
    flushOutbox,
    close,
    testAddAndList,
    init
  };

  // expose on window
  window.DB = API;

  // Start init in background (non-blocking)
  _readyPromise = open().then(() => {
    _setupAutoFlush();
    return db;
  }).catch(e => {
    errLog('DB background open failed', e);
    return null;
  });

})(window);
