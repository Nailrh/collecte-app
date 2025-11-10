/* static/js/indexeddb.js
   Minimal IndexedDB wrapper for collecte-app.
   DB name: collecte_db (stores: personnes, outbox)
*/
const DB = (function(){
  const DB_NAME = 'collecte_db';
  const DB_VER = 1;
  const STORE_PERSONNES = 'personnes';
  const STORE_OUTBOX = 'outbox';
  let db = null;

  function open(){
    return new Promise((resolve, reject) => {
      if (db) return resolve(db);
      const req = indexedDB.open(DB_NAME, DB_VER);
      req.onupgradeneeded = e => {
        const d = e.target.result;
        if (!d.objectStoreNames.contains(STORE_PERSONNES)) {
          const s = d.createObjectStore(STORE_PERSONNES, { keyPath: 'id' });
          s.createIndex('created_at', 'created_at', { unique: false });
        }
        if (!d.objectStoreNames.contains(STORE_OUTBOX)) {
          d.createObjectStore(STORE_OUTBOX, { keyPath: 'qid', autoIncrement: true });
        }
      };
      req.onsuccess = e => { db = e.target.result; resolve(db); };
      req.onerror = e => reject(e.target.error);
      req.onblocked = () => console.warn('indexedDB open blocked, close other tabs');
    });
  }

  function tx(storeName, mode='readonly'){
    return open().then(database => {
      const tr = database.transaction(storeName, mode);
      return tr.objectStore(storeName);
    });
  }

  async function addPerson(person){
    const store = await tx(STORE_PERSONNES, 'readwrite');
    return new Promise((res, rej) => {
      const req = store.put(person);
      req.onsuccess = () => res(person);
      req.onerror = e => rej(e.target.error);
    });
  }

  async function deletePerson(id){
    const store = await tx(STORE_PERSONNES, 'readwrite');
    return new Promise((res, rej) => {
      const req = store.delete(id);
      req.onsuccess = () => res();
      req.onerror = e => rej(e.target.error);
    });
  }

  async function getAllPersons(){
    const store = await tx(STORE_PERSONNES, 'readonly');
    return new Promise((res, rej) => {
      const req = store.getAll();
      req.onsuccess = () => res(req.result || []);
      req.onerror = e => rej(e.target.error);
    });
  }

  async function countPersons(){
    const store = await tx(STORE_PERSONNES, 'readonly');
    return new Promise((res, rej) => {
      const req = store.count();
      req.onsuccess = () => res(req.result || 0);
      req.onerror = e => rej(e.target.error);
    });
  }

  async function clearPersons(){
    const store = await tx(STORE_PERSONNES, 'readwrite');
    return new Promise((res, rej) => {
      const req = store.clear();
      req.onsuccess = () => res();
      req.onerror = e => rej(e.target.error);
    });
  }

  async function enqueueSync(action){
    const store = await tx(STORE_OUTBOX, 'readwrite');
    return new Promise((res, rej) => {
      const req = store.add({ action, ts: Date.now() });
      req.onsuccess = () => res(req.result);
      req.onerror = e => rej(e.target.error);
    });
  }

  async function getOutbox(){
    const store = await tx(STORE_OUTBOX, 'readonly');
    return new Promise((res, rej) => {
      const req = store.getAll();
      req.onsuccess = () => res(req.result || []);
      req.onerror = e => rej(e.target.error);
    });
  }

  async function removeOutboxItem(qid){
    const store = await tx(STORE_OUTBOX, 'readwrite');
    return new Promise((res, rej) => {
      const req = store.delete(qid);
      req.onsuccess = () => res();
      req.onerror = e => rej(e.target.error);
    });
  }

  function close(){
    if (db) {
      db.close();
      db = null;
    }
  }

  return {
    open,
    addPerson,
    deletePerson,
    getAllPersons,
    countPersons,
    clearPersons,
    enqueueSync,
    getOutbox,
    removeOutboxItem,
    close
  };
})();