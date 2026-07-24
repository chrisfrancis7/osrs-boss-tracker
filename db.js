// IndexedDB wrapper for the Boss Kill Tracker.
// Stores: bosses {id, name, image, goal, order}
// kills {key: "date_bossId", date, bossId, count}

const DB_NAME = "bossTrackerDB";
const DB_VERSION = 1;

let _dbPromise = null;

function openDB() {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains("bosses")) {
        db.createObjectStore("bosses", { keyPath: "id", autoIncrement: true });
      }
      if (!db.objectStoreNames.contains("kills")) {
        const store = db.createObjectStore("kills", { keyPath: "key" });
        store.createIndex("byDate", "date", { unique: false });
        store.createIndex("byBoss", "bossId", { unique: false });
      }
    };
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = (e) => reject(e.target.error);
  });
  return _dbPromise;
}

function tx(storeNames, mode) {
  return openDB().then((db) => db.transaction(storeNames, mode));
}

const DB = {
  async getBosses() {
    const t = await tx(["bosses"], "readonly");
    return new Promise((resolve, reject) => {
      const store = t.objectStore("bosses");
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result.sort((a, b) => (a.order ?? 0) - (b.order ?? 0)));
      req.onerror = () => reject(req.error);
    });
  },

  async addBoss({ name, image, goal }) {
    const bosses = await this.getBosses();
    const maxOrder = bosses.reduce((m, b) => Math.max(m, b.order ?? 0), -1);
    const t = await tx(["bosses"], "readwrite");
    return new Promise((resolve, reject) => {
      const store = t.objectStore("bosses");
      const req = store.add({ name, image, goal: goal ?? 1, order: maxOrder + 1 });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  },

  async updateBoss(id, changes) {
    const t = await tx(["bosses"], "readwrite");
    const store = t.objectStore("bosses");
    return new Promise((resolve, reject) => {
      const getReq = store.get(id);
      getReq.onsuccess = () => {
        const boss = getReq.result;
        if (!boss) return reject(new Error("Boss not found"));
        Object.assign(boss, changes);
        const putReq = store.put(boss);
        putReq.onsuccess = () => resolve(boss);
        putReq.onerror = () => reject(putReq.error);
      };
      getReq.onerror = () => reject(getReq.error);
    });
  },

  async deleteBoss(id) {
    const t = await tx(["bosses", "kills"], "readwrite");
    const bossStore = t.objectStore("bosses");
    const killStore = t.objectStore("kills");
    const idx = killStore.index("byBoss");
    return new Promise((resolve, reject) => {
      bossStore.delete(id);
      const cursorReq = idx.openCursor(IDBKeyRange.only(id));
      cursorReq.onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        }
      };
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
    });
  },

  async getKillsForDate(date) {
    const t = await tx(["kills"], "readonly");
    return new Promise((resolve, reject) => {
      const idx = t.objectStore("kills").index("byDate");
      const req = idx.getAll(IDBKeyRange.only(date));
      req.onsuccess = () => {
        const map = {};
        for (const row of req.result) map[row.bossId] = row.count;
        resolve(map);
      };
      req.onerror = () => reject(req.error);
    });
  },

  async setKill(date, bossId, count) {
    const t = await tx(["kills"], "readwrite");
    const store = t.objectStore("kills");
    const key = `${date}_${bossId}`;
    return new Promise((resolve, reject) => {
      if (count <= 0) {
        const req = store.delete(key);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      } else {
        const req = store.put({ key, date, bossId, count });
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      }
    });
  },

  async getAllKills() {
    const t = await tx(["kills"], "readonly");
    return new Promise((resolve, reject) => {
      const req = t.objectStore("kills").getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  },

  async exportAll() {
    const [bosses, kills] = await Promise.all([this.getBosses(), this.getAllKills()]);
    return {
      version: 1,
      exportedAt: new Date().toISOString(),
      bosses,
      kills,
    };
  },

  async importAll(data) {
    if (!data || !Array.isArray(data.bosses) || !Array.isArray(data.kills)) {
      throw new Error("Invalid backup file");
    }
    const t = await tx(["bosses", "kills"], "readwrite");
    const bossStore = t.objectStore("bosses");
    const killStore = t.objectStore("kills");
    return new Promise((resolve, reject) => {
      bossStore.clear();
      killStore.clear();
      for (const b of data.bosses) bossStore.put(b);
      for (const k of data.kills) killStore.put(k);
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
    });
  },
};
