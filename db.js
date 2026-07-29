// IndexedDB wrapper for the Boss Kill Tracker.
// Stores: bosses {id, name, image, goal, order}
// kills {key: "date_bossId", date, bossId, count}
// groups {id, name, bossIds: [bossId], goal, order} — a group's daily count
//   is the sum of its member bosses' kills for that date; grouping a boss
//   replaces its individual goal tracking with the group's combined goal.

const DB_NAME = "bossTrackerDB";
const DB_VERSION = 2;

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
      if (!db.objectStoreNames.contains("groups")) {
        db.createObjectStore("groups", { keyPath: "id", autoIncrement: true });
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
    const groups = await this.getGroups();
    const t = await tx(["bosses", "kills", "groups"], "readwrite");
    const bossStore = t.objectStore("bosses");
    const killStore = t.objectStore("kills");
    const groupStore = t.objectStore("groups");
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
      for (const g of groups) {
        if (!g.bossIds.includes(id)) continue;
        const bossIds = g.bossIds.filter((bid) => bid !== id);
        if (bossIds.length === 0) {
          groupStore.delete(g.id);
        } else {
          const memberGoals = g.memberGoals ? { ...g.memberGoals } : null;
          if (memberGoals) delete memberGoals[id];
          groupStore.put({ ...g, bossIds, memberGoals });
        }
      }
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
    });
  },

  async getGroups() {
    const t = await tx(["groups"], "readonly");
    return new Promise((resolve, reject) => {
      const store = t.objectStore("groups");
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result.sort((a, b) => (a.order ?? 0) - (b.order ?? 0)));
      req.onerror = () => reject(req.error);
    });
  },

  // mode: "sum" (default) — kills across all members add up to one shared `goal`.
  // mode: "either" — each member has its own goal in `memberGoals` ({bossId: goal});
  //   hitting any one member's goal completes the whole group for the day.
  async addGroup({ name, bossIds, goal, mode, memberGoals }) {
    const groups = await this.getGroups();
    const maxOrder = groups.reduce((m, g) => Math.max(m, g.order ?? 0), -1);
    const t = await tx(["groups"], "readwrite");
    return new Promise((resolve, reject) => {
      const store = t.objectStore("groups");
      const req = store.add({
        name,
        bossIds,
        mode: mode === "either" ? "either" : "sum",
        goal: goal ?? 1,
        memberGoals: memberGoals || null,
        order: maxOrder + 1,
      });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  },

  async updateGroup(id, changes) {
    const t = await tx(["groups"], "readwrite");
    const store = t.objectStore("groups");
    return new Promise((resolve, reject) => {
      const getReq = store.get(id);
      getReq.onsuccess = () => {
        const group = getReq.result;
        if (!group) return reject(new Error("Group not found"));
        Object.assign(group, changes);
        const putReq = store.put(group);
        putReq.onsuccess = () => resolve(group);
        putReq.onerror = () => reject(putReq.error);
      };
      getReq.onerror = () => reject(getReq.error);
    });
  },

  async deleteGroup(id) {
    const t = await tx(["groups"], "readwrite");
    return new Promise((resolve, reject) => {
      const req = t.objectStore("groups").delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
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
    const [bosses, kills, groups] = await Promise.all([this.getBosses(), this.getAllKills(), this.getGroups()]);
    return {
      version: 2,
      exportedAt: new Date().toISOString(),
      bosses,
      kills,
      groups,
    };
  },

  async importAll(data) {
    if (!data || !Array.isArray(data.bosses) || !Array.isArray(data.kills)) {
      throw new Error("Invalid backup file");
    }
    const groups = Array.isArray(data.groups) ? data.groups : [];
    const t = await tx(["bosses", "kills", "groups"], "readwrite");
    const bossStore = t.objectStore("bosses");
    const killStore = t.objectStore("kills");
    const groupStore = t.objectStore("groups");
    return new Promise((resolve, reject) => {
      bossStore.clear();
      killStore.clear();
      groupStore.clear();
      for (const b of data.bosses) bossStore.put(b);
      for (const k of data.kills) killStore.put(k);
      for (const g of groups) groupStore.put(g);
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
    });
  },
};
