/* static/js/indexeddb.js
   Robust IndexedDB wrapper for collecte-app.
   DB name: collecte_db (stores: personnes, outbox)
*/
const DB = (function () {
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
    const database = await open();
    const tx = database.transaction(storeName, mode);
    const store = tx.objectStore(storeName);
    return { store, tx };
  }

  function promisifyRequest(req) {
    return new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = e => reject(e.target.error);
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
      const { store, tx } = await getStore(STORE_PERSONNES, 'readonly');
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
    try {
      const { store, tx } = await getStore(STORE_OUTBOX, 'readwrite');
      const req = store.add({ action, ts: Date.now() });
      const result = await promisifyRequest(req);
      await waitTxComplete(tx);
      log('enqueueSync qid=', result);
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

  // flush outbox: attempts to POST items one by one; stops on network error
  async function flushOutbox({ syncUrl = SYNC_URL, onProgress = null } = {}) {
    try {
      const out = await getOutbox();
      for (const item of out) {
        try {
          const resp = await fetch(syncUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(item.action),
            credentials: 'same-origin'
          });
          if (!resp.ok) {
            // If server error or unauthorized, stop and surface
            errLog('flushOutbox: server returned', resp.status);
            return { success: false, status: resp.status };
          }
          // remove item on success
          await removeOutboxItem(item.qid);
          if (onProgress) onProgress(item.qid);
        } catch (e) {
          // network error — stop and retry later
          errLog('flushOutbox network error', e);
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

  return {
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
    testAddAndList
  };
})();
