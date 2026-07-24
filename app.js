// Boss Kill Tracker — app logic (vanilla JS, no build step)

const viewRoot = document.getElementById("view-root");
const modalRoot = document.getElementById("modal-root");
const headerTitle = document.getElementById("header-title");
const tabBtns = [...document.querySelectorAll(".tab-btn")];

let CATALOG = [];
let state = {
  tab: "today",
  calMonth: new Date().getMonth(),
  calYear: new Date().getFullYear(),
  editingRowId: null, // for settings focus banner
};

function todayStr() {
  return dateToStr(new Date());
}
function dateToStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function humanDate(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
}

function showToast(msg) {
  let el = document.querySelector(".toast");
  if (!el) {
    el = document.createElement("div");
    el.className = "toast";
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove("show"), 1800);
}

async function loadCatalog() {
  const res = await fetch("assets/bosses/manifest.json");
  CATALOG = await res.json();
  CATALOG.sort((a, b) => a.name.localeCompare(b.name));
}

// ---------------- Rendering: boss row (shared by Today + Calendar day modal) ----------------

function renderBossKillCard(boss, count, onChange) {
  const goal = boss.goal || 1;
  const pct = Math.min(100, Math.round((count / goal) * 100));
  const complete = count >= goal;

  const card = document.createElement("div");
  card.className = "boss-card";
  card.innerHTML = `
    <img class="boss-img" src="assets/bosses/${boss.image}" alt="${boss.name}">
    <div class="boss-info">
      <div class="boss-name-row">
        <div class="boss-name">${boss.name}</div>
        <div class="boss-count-label"><b>${count}</b> / ${goal}</div>
      </div>
      <div class="progress-track"><div class="progress-fill ${complete ? "complete" : ""}" style="width:${pct}%"></div></div>
      <div class="boss-controls">
        <button class="stepper-btn" data-act="dec">−</button>
        <input class="count-input" type="number" min="0" inputmode="numeric" value="${count}">
        <button class="stepper-btn" data-act="inc">+</button>
        <button class="quick-add" data-act="quick">+1 kill</button>
      </div>
    </div>
  `;
  const input = card.querySelector(".count-input");
  const dec = card.querySelector('[data-act="dec"]');
  const inc = card.querySelector('[data-act="inc"]');
  const quick = card.querySelector('[data-act="quick"]');

  const commit = (val) => {
    const n = Math.max(0, parseInt(val, 10) || 0);
    input.value = n;
    onChange(n);
  };

  dec.addEventListener("click", () => commit((parseInt(input.value, 10) || 0) - 1));
  inc.addEventListener("click", () => commit((parseInt(input.value, 10) || 0) + 1));
  quick.addEventListener("click", () => commit((parseInt(input.value, 10) || 0) + 1));
  input.addEventListener("change", () => commit(input.value));

  return card;
}

async function renderBossListForDate(container, date) {
  const [bosses, kills] = await Promise.all([DB.getBosses(), DB.getKillsForDate(date)]);
  container.innerHTML = "";
  if (bosses.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.innerHTML = `No bosses added yet.<br>Go to Settings to add one.`;
    container.appendChild(empty);
    return;
  }
  for (const boss of bosses) {
    const count = kills[boss.id] || 0;
    const card = renderBossKillCard(boss, count, async (n) => {
      await DB.setKill(date, boss.id, n);
      if (state.tab === "calendar") renderCalendarGrid(); // refresh dots underneath
    });
    container.appendChild(card);
  }
}

// ---------------- Today tab ----------------

async function renderToday() {
  headerTitle.textContent = "Boss Kill Tracker";
  const date = todayStr();
  viewRoot.innerHTML = `
    <div class="section-title">${humanDate(date)}</div>
    <div id="today-list"></div>
  `;
  await renderBossListForDate(document.getElementById("today-list"), date);
}

// ---------------- Calendar tab ----------------

async function renderCalendarGrid() {
  const grid = document.getElementById("cal-grid");
  if (!grid) return;
  const { calYear, calMonth } = state;
  const bosses = await DB.getBosses();
  const allKills = await DB.getAllKills();

  const killsByDate = {};
  for (const k of allKills) {
    (killsByDate[k.date] ||= {})[k.bossId] = k.count;
  }

  const firstOfMonth = new Date(calYear, calMonth, 1);
  const startWeekday = firstOfMonth.getDay();
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const todayS = todayStr();

  let html = "";
  ["S", "M", "T", "W", "T", "F", "S"].forEach((d) => (html += `<div class="cal-dow">${d}</div>`));
  for (let i = 0; i < startWeekday; i++) html += `<div class="cal-day empty"></div>`;

  for (let day = 1; day <= daysInMonth; day++) {
    const d = new Date(calYear, calMonth, day);
    const dStr = dateToStr(d);
    const dayKills = killsByDate[dStr] || {};

    let dotClass = "none";
    if (bosses.length > 0) {
      const anyLogged = bosses.some((b) => (dayKills[b.id] || 0) > 0);
      const allComplete = bosses.every((b) => (dayKills[b.id] || 0) >= (b.goal || 1));
      if (allComplete) dotClass = "complete";
      else if (anyLogged) dotClass = "partial";
    }

    html += `<div class="cal-day ${dStr === todayS ? "today" : ""}" data-date="${dStr}">
      <div>${day}</div><div class="dot ${dotClass}"></div>
    </div>`;
  }

  grid.innerHTML = html;
  grid.querySelectorAll(".cal-day[data-date]").forEach((el) => {
    el.addEventListener("click", () => openDayModal(el.dataset.date));
  });
}

function renderCalendar() {
  headerTitle.textContent = "Boss Kill Tracker";
  const monthName = new Date(state.calYear, state.calMonth, 1).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
  viewRoot.innerHTML = `
    <div class="cal-nav">
      <button id="cal-prev">‹</button>
      <h2>${monthName}</h2>
      <button id="cal-next">›</button>
    </div>
    <div class="cal-grid" id="cal-grid"></div>
  `;
  document.getElementById("cal-prev").addEventListener("click", () => {
    state.calMonth--;
    if (state.calMonth < 0) { state.calMonth = 11; state.calYear--; }
    renderCalendarGrid();
    document.querySelector(".cal-nav h2").textContent = new Date(state.calYear, state.calMonth, 1)
      .toLocaleDateString(undefined, { month: "long", year: "numeric" });
  });
  document.getElementById("cal-next").addEventListener("click", () => {
    state.calMonth++;
    if (state.calMonth > 11) { state.calMonth = 0; state.calYear++; }
    renderCalendarGrid();
    document.querySelector(".cal-nav h2").textContent = new Date(state.calYear, state.calMonth, 1)
      .toLocaleDateString(undefined, { month: "long", year: "numeric" });
  });
  renderCalendarGrid();
}

function openDayModal(dateStr) {
  modalRoot.innerHTML = `
    <div class="modal-overlay" id="modal-overlay">
      <div class="modal-sheet">
        <div class="modal-header">
          <h2>${humanDate(dateStr)}</h2>
          <button class="modal-close" id="modal-close">✕</button>
        </div>
        <div id="modal-boss-list"></div>
      </div>
    </div>
  `;
  document.getElementById("modal-close").addEventListener("click", closeModal);
  document.getElementById("modal-overlay").addEventListener("click", (e) => {
    if (e.target.id === "modal-overlay") closeModal();
  });
  renderBossListForDate(document.getElementById("modal-boss-list"), dateStr);
}
function closeModal() {
  modalRoot.innerHTML = "";
}

// ---------------- Settings tab ----------------

function setEditingBanner(name) {
  const banner = document.getElementById("editing-banner");
  if (!banner) return;
  if (name) {
    banner.textContent = `Editing: ${name}`;
    banner.style.display = "block";
  } else {
    banner.style.display = "none";
  }
}

async function renderMyBosses(container) {
  const bosses = await DB.getBosses();
  container.innerHTML = "";
  if (bosses.length === 0) {
    container.innerHTML = `<div class="empty-state">No bosses added yet. Add one below.</div>`;
    return;
  }
  for (const boss of bosses) {
    const row = document.createElement("div");
    row.className = "settings-boss-row";
    row.innerHTML = `
      <img src="assets/bosses/${boss.image}" alt="${boss.name}">
      <div class="name">${boss.name}</div>
      <div>
        <div class="goal-label">Daily goal</div>
        <input class="goal-input" type="number" min="1" inputmode="numeric" value="${boss.goal || 1}">
      </div>
      <button class="danger-link" data-act="remove">Remove</button>
    `;
    const goalInput = row.querySelector(".goal-input");
    goalInput.addEventListener("focus", () => setEditingBanner(boss.name));
    goalInput.addEventListener("blur", () => setEditingBanner(null));
    goalInput.addEventListener("change", async () => {
      const n = Math.max(1, parseInt(goalInput.value, 10) || 1);
      goalInput.value = n;
      await DB.updateBoss(boss.id, { goal: n });
      showToast(`${boss.name} goal set to ${n}`);
    });
    row.querySelector('[data-act="remove"]').addEventListener("click", async () => {
      if (confirm(`Remove ${boss.name} and all its recorded kills?`)) {
        await DB.deleteBoss(boss.id);
        showToast(`${boss.name} removed`);
        renderMyBosses(container);
      }
    });
    container.appendChild(row);
  }
}

async function renderCatalogList(container, searchTerm) {
  const bosses = await DB.getBosses();
  const addedNames = new Set(bosses.map((b) => b.name));
  const term = (searchTerm || "").toLowerCase();
  container.innerHTML = "";
  const filtered = CATALOG.filter((c) => c.name.toLowerCase().includes(term));
  if (filtered.length === 0) {
    container.innerHTML = `<div class="empty-state">No matching bosses.</div>`;
    return;
  }
  for (const entry of filtered) {
    const isAdded = addedNames.has(entry.name);
    const item = document.createElement("div");
    item.className = "catalog-item" + (isAdded ? " added" : "");
    item.innerHTML = `
      <img src="assets/bosses/${entry.file}" alt="${entry.name}">
      <div>${entry.name}</div>
      <button ${isAdded ? "disabled" : ""}>${isAdded ? "Added" : "Add"}</button>
    `;
    if (!isAdded) {
      item.querySelector("button").addEventListener("click", async () => {
        await DB.addBoss({ name: entry.name, image: entry.file, goal: 1 });
        showToast(`${entry.name} added`);
        renderSettings();
      });
    }
    container.appendChild(item);
  }
}

function renderSettings() {
  headerTitle.textContent = "Settings";
  viewRoot.innerHTML = `
    <div id="editing-banner" class="editing-banner" style="display:none"></div>
    <div class="section-title">My Bosses</div>
    <div id="my-bosses-list"></div>

    <div class="section-title">Add a Boss</div>
    <input class="search-input" id="catalog-search" placeholder="Search bosses…">
    <div class="catalog-list" id="catalog-list"></div>

    <div class="section-title">Backup</div>
    <div class="backup-row">
      <button class="secondary" id="export-btn">Export backup</button>
      <button class="secondary" id="import-btn">Import backup</button>
    </div>
    <input type="file" id="import-file" accept="application/json" style="display:none">
  `;
  renderMyBosses(document.getElementById("my-bosses-list"));
  renderCatalogList(document.getElementById("catalog-list"), "");

  document.getElementById("catalog-search").addEventListener("input", (e) => {
    renderCatalogList(document.getElementById("catalog-list"), e.target.value);
  });

  document.getElementById("export-btn").addEventListener("click", async () => {
    const data = await DB.exportAll();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `boss-tracker-backup-${todayStr()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  });

  const importFile = document.getElementById("import-file");
  document.getElementById("import-btn").addEventListener("click", () => importFile.click());
  importFile.addEventListener("change", async () => {
    const file = importFile.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (!confirm("This will replace all current data with the backup. Continue?")) return;
      await DB.importAll(data);
      showToast("Backup imported");
      renderSettings();
    } catch (err) {
      alert("Could not import backup: " + err.message);
    } finally {
      importFile.value = "";
    }
  });
}

// ---------------- Tab routing ----------------

function setActiveTab(tab) {
  state.tab = tab;
  tabBtns.forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
  closeModal();
  if (tab === "today") renderToday();
  else if (tab === "calendar") renderCalendar();
  else if (tab === "settings") renderSettings();
}

tabBtns.forEach((btn) => btn.addEventListener("click", () => setActiveTab(btn.dataset.tab)));

// ---------------- Init ----------------

(async function init() {
  await loadCatalog();
  setActiveTab("today");

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
})();
