// OSRS Tools — app logic (vanilla JS, no build step)

const viewRoot = document.getElementById("view-root");
const modalRoot = document.getElementById("modal-root");
const headerTitle = document.getElementById("header-title");
const headerBack = document.getElementById("header-back");
const tabBtns = [...document.querySelectorAll(".tab-btn")];

let CATALOG = [];
let state = {
  view: "home", // "home" | "bosses" | "max" | "settings"
  bossTab: "today", // Boss Tracker sub-view: "today" | "calendar"
  calMonth: new Date().getMonth(),
  calYear: new Date().getFullYear(),
  editingRowId: null, // for settings focus banner
  groupSelection: new Set(), // boss ids checked in Settings for "create a group"
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

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
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
  const countLabel = card.querySelector(".boss-count-label b");
  const progressFill = card.querySelector(".progress-fill");

  const commit = (val) => {
    const n = Math.max(0, parseInt(val, 10) || 0);
    input.value = n;
    const newPct = Math.min(100, Math.round((n / goal) * 100));
    const newComplete = n >= goal;
    countLabel.textContent = n;
    progressFill.style.width = `${newPct}%`;
    progressFill.classList.toggle("complete", newComplete);
    onChange(n);
  };

  dec.addEventListener("click", () => commit((parseInt(input.value, 10) || 0) - 1));
  inc.addEventListener("click", () => commit((parseInt(input.value, 10) || 0) + 1));
  quick.addEventListener("click", () => commit((parseInt(input.value, 10) || 0) + 1));
  input.addEventListener("change", () => commit(input.value));

  return card;
}

// group.mode: "sum" (default) — kills across all members add up to one shared goal.
// group.mode: "either" — each member has its own goal; hitting any one member's
//   goal completes the whole group for the day.
function groupStatusForDate(group, dayKills) {
  if (group.mode === "either") {
    const memberGoals = group.memberGoals || {};
    let complete = false;
    let anyLogged = false;
    for (const id of group.bossIds) {
      const count = dayKills[id] || 0;
      if (count > 0) anyLogged = true;
      if (count >= (memberGoals[id] || 1)) complete = true;
    }
    return { complete, anyLogged };
  }
  const goal = group.goal || 1;
  const total = group.bossIds.reduce((sum, id) => sum + (dayKills[id] || 0), 0);
  return { complete: total >= goal, anyLogged: total > 0 };
}

function renderGroupKillCard(group, members, kills, onChangeMember) {
  const memberCounts = new Map(members.map((b) => [b.id, kills[b.id] || 0]));
  const card = document.createElement("div");
  card.className = "group-card";

  if (group.mode === "either") {
    const memberGoals = group.memberGoals || {};
    card.innerHTML = `
      <div class="group-header">
        <div class="group-name">${group.name}</div>
        <div class="group-mode-badge">Any one</div>
      </div>
      <div class="group-members"></div>
    `;
    const membersEl = card.querySelector(".group-members");
    const badge = card.querySelector(".group-mode-badge");

    const refreshComplete = () => {
      const complete = members.some((b) => memberCounts.get(b.id) >= (memberGoals[b.id] || 1));
      card.classList.toggle("complete", complete);
      badge.textContent = complete ? "✓ Complete" : "Any one";
      badge.classList.toggle("complete", complete);
    };

    for (const boss of members) {
      const goal = memberGoals[boss.id] || 1;
      const row = document.createElement("div");
      row.className = "group-member-row";
      row.innerHTML = `
        <img class="group-member-img" src="assets/bosses/${boss.image}" alt="${boss.name}">
        <div class="group-member-info">
          <div class="group-member-name">${boss.name}</div>
          <div class="group-member-goal"><b>${memberCounts.get(boss.id)}</b> / ${goal}</div>
        </div>
        <div class="group-member-controls">
          <button class="stepper-btn small" data-act="dec">−</button>
          <input class="count-input small" type="number" min="0" inputmode="numeric" value="${memberCounts.get(boss.id)}">
          <button class="stepper-btn small" data-act="inc">+</button>
        </div>
      `;
      const input = row.querySelector(".count-input");
      const dec = row.querySelector('[data-act="dec"]');
      const inc = row.querySelector('[data-act="inc"]');
      const goalCountLabel = row.querySelector(".group-member-goal b");

      const commit = (val) => {
        const n = Math.max(0, parseInt(val, 10) || 0);
        input.value = n;
        memberCounts.set(boss.id, n);
        goalCountLabel.textContent = n;
        row.classList.toggle("complete", n >= goal);
        refreshComplete();
        onChangeMember(boss.id, n);
      };

      dec.addEventListener("click", () => commit((parseInt(input.value, 10) || 0) - 1));
      inc.addEventListener("click", () => commit((parseInt(input.value, 10) || 0) + 1));
      input.addEventListener("change", () => commit(input.value));

      row.classList.toggle("complete", memberCounts.get(boss.id) >= goal);
      membersEl.appendChild(row);
    }

    refreshComplete();
    return card;
  }

  // "sum" mode — combined goal across all members
  const goal = group.goal || 1;
  card.innerHTML = `
    <div class="group-header">
      <div class="group-name">${group.name}</div>
      <div class="group-count-label"><b></b> / ${goal}</div>
    </div>
    <div class="progress-track"><div class="progress-fill" style="width:0%"></div></div>
    <div class="group-members"></div>
  `;
  const countLabel = card.querySelector(".group-count-label b");
  const progressFill = card.querySelector(".progress-fill");
  const membersEl = card.querySelector(".group-members");

  const refreshTotal = () => {
    const total = members.reduce((sum, b) => sum + memberCounts.get(b.id), 0);
    const pct = Math.min(100, Math.round((total / goal) * 100));
    const complete = total >= goal;
    countLabel.textContent = total;
    progressFill.style.width = `${pct}%`;
    progressFill.classList.toggle("complete", complete);
  };

  for (const boss of members) {
    const row = document.createElement("div");
    row.className = "group-member-row";
    row.innerHTML = `
      <img class="group-member-img" src="assets/bosses/${boss.image}" alt="${boss.name}">
      <div class="group-member-name">${boss.name}</div>
      <div class="group-member-controls">
        <button class="stepper-btn small" data-act="dec">−</button>
        <input class="count-input small" type="number" min="0" inputmode="numeric" value="${memberCounts.get(boss.id)}">
        <button class="stepper-btn small" data-act="inc">+</button>
      </div>
    `;
    const input = row.querySelector(".count-input");
    const dec = row.querySelector('[data-act="dec"]');
    const inc = row.querySelector('[data-act="inc"]');

    const commit = (val) => {
      const n = Math.max(0, parseInt(val, 10) || 0);
      input.value = n;
      memberCounts.set(boss.id, n);
      refreshTotal();
      onChangeMember(boss.id, n);
    };

    dec.addEventListener("click", () => commit((parseInt(input.value, 10) || 0) - 1));
    inc.addEventListener("click", () => commit((parseInt(input.value, 10) || 0) + 1));
    input.addEventListener("change", () => commit(input.value));

    membersEl.appendChild(row);
  }

  refreshTotal();
  return card;
}

async function renderBossListForDate(container, date) {
  const [bosses, groups, kills] = await Promise.all([DB.getBosses(), DB.getGroups(), DB.getKillsForDate(date)]);
  container.innerHTML = "";
  if (bosses.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.innerHTML = `No bosses added yet.<br>Go to Settings to add one.`;
    container.appendChild(empty);
    return;
  }
  const bossById = new Map(bosses.map((b) => [b.id, b]));
  const groupedIds = new Set(groups.flatMap((g) => g.bossIds));

  for (const group of groups) {
    const members = group.bossIds.map((id) => bossById.get(id)).filter(Boolean);
    if (members.length === 0) continue;
    const card = renderGroupKillCard(group, members, kills, async (bossId, n) => {
      await DB.setKill(date, bossId, n);
      renderCalendarGrid(); // refresh dots underneath (no-op unless the calendar is showing)
    });
    container.appendChild(card);
  }

  for (const boss of bosses) {
    if (groupedIds.has(boss.id)) continue;
    const count = kills[boss.id] || 0;
    const card = renderBossKillCard(boss, count, async (n) => {
      await DB.setKill(date, boss.id, n);
      renderCalendarGrid(); // refresh dots underneath (no-op unless the calendar is showing)
    });
    container.appendChild(card);
  }
}

// ---------------- Boss Tracker (Today / Calendar sub-tabs) ----------------

function renderBossTracker() {
  headerTitle.textContent = "Boss Tracker";
  viewRoot.innerHTML = `
    <div class="seg" role="tablist">
      <button type="button" class="seg-btn" role="tab" data-sub="today">Today</button>
      <button type="button" class="seg-btn" role="tab" data-sub="calendar">Calendar</button>
    </div>
    <div id="boss-sub"></div>
  `;
  viewRoot.querySelectorAll(".seg-btn").forEach((btn) =>
    btn.addEventListener("click", () => {
      state.bossTab = btn.dataset.sub;
      closeModal();
      renderBossSub();
    })
  );
  renderBossSub();
}

function renderBossSub() {
  viewRoot.querySelectorAll(".seg-btn").forEach((b) => {
    const on = b.dataset.sub === state.bossTab;
    b.classList.toggle("active", on);
    b.setAttribute("aria-selected", on ? "true" : "false");
  });
  if (state.bossTab === "calendar") renderCalendar();
  else renderToday();
}

async function renderToday() {
  const date = todayStr();
  document.getElementById("boss-sub").innerHTML = `
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
  const [bosses, groups, allKills] = await Promise.all([DB.getBosses(), DB.getGroups(), DB.getAllKills()]);

  const groupedIds = new Set(groups.flatMap((g) => g.bossIds));
  const standaloneBosses = bosses.filter((b) => !groupedIds.has(b.id));

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
    if (standaloneBosses.length > 0 || groups.length > 0) {
      const groupStatuses = groups.map((g) => groupStatusForDate(g, dayKills));
      const anyLogged =
        standaloneBosses.some((b) => (dayKills[b.id] || 0) > 0) || groupStatuses.some((s) => s.anyLogged);
      const allComplete =
        standaloneBosses.every((b) => (dayKills[b.id] || 0) >= (b.goal || 1)) &&
        groupStatuses.every((s) => s.complete);
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
  const monthName = new Date(state.calYear, state.calMonth, 1).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
  document.getElementById("boss-sub").innerHTML = `
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

// ---------------- Hours to Max: skills, XP math, Wise Old Man sync ----------------

const MAX_XP = 13034431; // XP for level 99

// In-game skill tab order. `key` is the Wise Old Man metric name.
const SKILLS = [
  ["attack", "Attack"], ["hitpoints", "Hitpoints"], ["mining", "Mining"],
  ["strength", "Strength"], ["agility", "Agility"], ["smithing", "Smithing"],
  ["defence", "Defence"], ["herblore", "Herblore"], ["fishing", "Fishing"],
  ["ranged", "Ranged"], ["thieving", "Thieving"], ["cooking", "Cooking"],
  ["prayer", "Prayer"], ["crafting", "Crafting"], ["firemaking", "Firemaking"],
  ["magic", "Magic"], ["fletching", "Fletching"], ["woodcutting", "Woodcutting"],
  ["runecrafting", "Runecraft"], ["slayer", "Slayer"], ["farming", "Farming"],
  ["construction", "Construction"], ["hunter", "Hunter"], ["sailing", "Sailing"],
].map(([key, name]) => ({ key, name }));

// Colors for the "where the hours go" bar, assigned by rank (most hours first).
const SKILL_COLORS = [
  "#c9a13b", "#c97b3b", "#5fa85f", "#7a9cc6", "#b07ac6", "#c66a6a",
  "#6ac6b8", "#a3a35a", "#d9c28a", "#8f7fbf", "#c98fa8", "#7fa88f",
];

// XP_FOR_LEVEL[L] = total XP needed to reach level L (XP_FOR_LEVEL[99] === MAX_XP).
const XP_FOR_LEVEL = (() => {
  const table = [0, 0];
  let points = 0;
  for (let lvl = 1; lvl < 99; lvl++) {
    points += Math.floor(lvl + 300 * Math.pow(2, lvl / 7));
    table.push(Math.floor(points / 4));
  }
  return table;
})();

function levelForXp(xp) {
  let lvl = 1;
  while (lvl < 99 && XP_FOR_LEVEL[lvl + 1] <= xp) lvl++;
  return lvl;
}

const fmtInt = (n) => Math.round(n).toLocaleString();

function timeAgo(iso) {
  if (!iso) return "never";
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} h ago`;
  const days = Math.round(hrs / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

const WOM_API = "https://api.wiseoldman.net/v2";

// Reads the player's latest snapshot as Wise Old Man currently has it. This
// never asks WOM to refresh from the official hiscores; the user updates
// their profile on wiseoldman.net themselves when they want newer data.
async function fetchWomPlayer(rsn) {
  const url = `${WOM_API}/players/${encodeURIComponent(rsn)}`;
  let res;
  try {
    res = await fetch(url);
  } catch (_) {
    throw new Error("Couldn't reach Wise Old Man. Check your connection and try again.");
  }
  if (res.status === 404) throw new Error(`Wise Old Man has no player named "${rsn}". Check the spelling.`);
  if (res.status === 429) throw new Error("Wise Old Man is limiting requests right now. Wait a minute and try again.");
  if (!res.ok) throw new Error(`Wise Old Man returned an error (${res.status}). Try again later.`);
  return res.json();
}

async function syncStats() {
  const rsn = ((await DB.getMeta("rsn")) || "").trim();
  if (!rsn) throw new Error("Enter your RuneScape name in Settings first.");
  const player = await fetchWomPlayer(rsn);
  const snap = player && player.latestSnapshot;
  const womSkills = snap && snap.data && snap.data.skills;
  if (!womSkills) throw new Error(`Wise Old Man has no stats for "${rsn}" yet.`);
  const skills = {};
  for (const s of SKILLS) {
    const xp = womSkills[s.key] ? womSkills[s.key].experience : 0;
    skills[s.key] = Math.max(0, xp || 0); // unranked skills come back as -1
  }
  const stats = {
    skills,
    displayName: player.displayName || rsn,
    syncedAt: new Date().toISOString(),
    snapshotAt: snap.createdAt || null,
  };
  await DB.setMeta("stats", stats);
  return stats;
}

// Skills at 99 are left out. A skill below 99 with no rate is "unrated", and a
// skill the user excluded in Settings is "excluded"; neither counts toward the total.
function computeMax(stats, rates, excludedKeys = []) {
  const excludedSet = new Set(excludedKeys);
  const rows = [];
  let maxedCount = 0;
  for (const s of SKILLS) {
    const xp = (stats.skills && stats.skills[s.key]) || 0;
    if (xp >= MAX_XP) {
      maxedCount++;
      continue;
    }
    const rate = Number(rates[s.key]) || 0;
    const left = MAX_XP - xp;
    rows.push({ ...s, xp, left, rate, level: levelForXp(xp), hours: rate > 0 ? left / rate : null });
  }
  const excluded = rows.filter((r) => excludedSet.has(r.key));
  const counted = rows.filter((r) => !excludedSet.has(r.key));
  const rated = counted.filter((r) => r.hours !== null).sort((a, b) => b.hours - a.hours);
  const unrated = counted.filter((r) => r.hours === null);
  return {
    rated,
    unrated,
    excluded,
    maxedCount,
    totalHours: rated.reduce((sum, r) => sum + r.hours, 0),
    xpLeft: rated.reduce((sum, r) => sum + r.left, 0),
  };
}

let renderToken = 0; // bumped on every navigation so slow async renders don't paint over a newer view

// ---------------- Home ----------------

async function renderHome() {
  headerTitle.textContent = "OSRS Tools";
  const token = renderToken;
  const date = todayStr();
  const [bosses, groups, kills, meta] = await Promise.all([
    DB.getBosses(),
    DB.getGroups(),
    DB.getKillsForDate(date),
    DB.getAllMeta(),
  ]);
  if (token !== renderToken) return;

  const groupedIds = new Set(groups.flatMap((g) => g.bossIds));
  const standalone = bosses.filter((b) => !groupedIds.has(b.id));
  const goalsTotal = standalone.length + groups.length;
  const goalsDone =
    standalone.filter((b) => (kills[b.id] || 0) >= (b.goal || 1)).length +
    groups.filter((g) => groupStatusForDate(g, kills).complete).length;
  const bossValue = goalsTotal ? `${goalsDone} / ${goalsTotal}` : "Add bosses";
  const bossSub = goalsTotal ? "Today's goals done" : "No bosses yet";

  let maxValue = "Set up";
  let maxSub = meta.rsn ? "Sync your stats" : "Add your RSN in Settings";
  if (meta.stats) {
    const m = computeMax(meta.stats, meta.rates || {}, meta.excluded || []);
    if (m.rated.length === 0 && m.unrated.length > 0) {
      maxSub = "Set your xp/h rates";
    } else {
      maxValue = m.rated.length || m.unrated.length ? `${fmtInt(m.totalHours)} h` : "Maxed!";
      maxSub = `Synced ${timeAgo(meta.stats.syncedAt)}`;
    }
  }

  viewRoot.innerHTML = `
    ${meta.rsn ? `<div class="home-rsn">${escapeHtml(meta.stats?.displayName || meta.rsn)}</div>` : ""}
    <div class="tool-tiles">
      <button type="button" class="tool-tile" data-go="bosses">
        <span class="tool-name">Boss Tracker</span>
        <span class="tool-sub">${bossSub}</span>
        <span class="tool-value">${bossValue}</span>
      </button>
      <button type="button" class="tool-tile" data-go="max">
        <span class="tool-name">Hours to Max</span>
        <span class="tool-sub">${maxSub}</span>
        <span class="tool-value">${maxValue}</span>
      </button>
    </div>
  `;
  viewRoot.querySelectorAll("[data-go]").forEach((el) => el.addEventListener("click", () => navigate(el.dataset.go)));
}

// ---------------- Hours to Max ----------------

async function renderMax() {
  headerTitle.textContent = "Hours to Max";
  const token = renderToken;
  const meta = await DB.getAllMeta();
  if (token !== renderToken) return;

  if (!meta.stats) {
    viewRoot.innerHTML = `
      <div class="empty-state">
        ${meta.rsn
          ? `Stats for <b>${escapeHtml(meta.rsn)}</b> haven't been synced yet.<br><button class="primary" id="max-sync">Sync from Wise Old Man</button><div class="sync-error" id="max-error"></div>`
          : `Enter your RuneScape name in Settings and tap Sync to pull your stats from Wise Old Man.<br><button class="primary" id="max-settings">Go to Settings</button>`}
      </div>
    `;
    document.getElementById("max-settings")?.addEventListener("click", () => navigate("settings"));
    document.getElementById("max-sync")?.addEventListener("click", (e) => runMaxSync(e.currentTarget));
    return;
  }

  const m = computeMax(meta.stats, meta.rates || {}, meta.excluded || []);
  const pace = Number(meta.pace) > 0 ? Number(meta.pace) : 2;
  const total = m.totalHours;
  const hasRated = m.rated.length > 0;
  const toNinetyNine = m.rated.length + m.unrated.length;

  const paceCard = hasRated
    ? `<div class="max-card">
        <div class="pace-row">
          <label for="pace-input">I play</label>
          <input id="pace-input" class="goal-input" type="number" min="0.5" step="0.5" inputmode="decimal" value="${pace}">
          <span>hours a day</span>
        </div>
        <div class="max-date" id="max-date"></div>
        <div class="max-sub" id="max-days"></div>
      </div>`
    : "";

  const summaryTop = toNinetyNine === 0
    ? m.excluded.length
      ? `<div class="max-sub">Every skill below 99 is excluded in Settings.</div>`
      : `<div class="max-big">Maxed!</div><div class="max-sub">Every skill is 99.</div>`
    : hasRated
      ? `<div class="max-big">${fmtInt(total)}<small>hours</small></div>
         <div class="max-sub"><span>${fmtInt(m.xpLeft)} XP left</span><span>${m.rated.length} skill${m.rated.length === 1 ? "" : "s"} to 99</span></div>
         <div class="hours-stack" aria-label="Share of remaining hours per skill">
           ${m.rated.map((r, i) => `<span style="flex:${r.hours};background:${SKILL_COLORS[i % SKILL_COLORS.length]}"></span>`).join("")}
         </div>`
      : `<div class="max-sub">Set your xp/h rates in Settings to see how many hours you have left.</div>`;

  const unratedNote = m.unrated.length
    ? `<div class="unrated-note">${m.unrated.length} skill${m.unrated.length === 1 ? "" : "s"} not counted (no rate): ${m.unrated.map((r) => r.name).join(", ")}</div>`
    : "";
  const excludedNote = m.excluded.length
    ? `<div class="unrated-note excluded-note">${m.excluded.length} skill${m.excluded.length === 1 ? "" : "s"} excluded in Settings: ${m.excluded.map((r) => r.name).join(", ")}</div>`
    : "";

  viewRoot.innerHTML = `
    ${paceCard}
    <div class="max-card">
      ${summaryTop}
      ${unratedNote}
      ${excludedNote}
      <div class="sync-line">
        <span>Wise Old Man data from ${timeAgo(meta.stats.snapshotAt || meta.stats.syncedAt)}</span>
        <button type="button" class="small-btn" id="max-refresh">Refresh</button>
      </div>
      <div class="sync-error" id="max-error"></div>
    </div>
    <div class="skill-rows">
      ${m.rated.map((r, i) => `
        <div class="skill-row expandable" data-skill="${r.key}" role="button" tabindex="0" aria-expanded="${openSkills.has(r.key)}">
          <div class="skill-row-name"><span class="skill-dot" style="color:${SKILL_COLORS[i % SKILL_COLORS.length]}">●</span>${r.name}<span class="skill-row-lvl">Lv ${r.level}</span></div>
          <div class="skill-row-hours">${r.hours.toFixed(1)} <small>h</small><span class="skill-chevron">▾</span></div>
          <div class="progress-track"><div class="progress-fill complete" style="width:${((r.xp / MAX_XP) * 100).toFixed(1)}%"></div></div>
          <div class="skill-row-meta"><span>${fmtInt(r.left)} XP left · ${pctDone(r)}</span><span>${fmtInt(r.rate)} xp/h</span></div>
          ${levelBreakdown(r)}
        </div>`).join("")}
      ${m.unrated.map((r) => `
        <div class="skill-row unrated">
          <div class="skill-row-name">${r.name}<span class="skill-row-lvl">Lv ${r.level}</span></div>
          <button type="button" class="small-btn" data-act="set-rate">No rate set</button>
          <div class="skill-row-meta"><span>${fmtInt(r.left)} XP left · ${pctDone(r)}</span><span>Not counted</span></div>
        </div>`).join("")}
      ${m.excluded.map((r) => `
        <div class="skill-row excluded ${r.hours !== null ? "expandable" : ""}" data-skill="${r.key}" ${r.hours !== null ? `role="button" tabindex="0" aria-expanded="${openSkills.has(r.key)}"` : ""}>
          <div class="skill-row-name">${r.name}<span class="skill-row-lvl">Lv ${r.level}</span></div>
          <div class="skill-row-hours">${r.hours !== null ? `${r.hours.toFixed(1)} <small>h</small><span class="skill-chevron">▾</span>` : ""}</div>
          <div class="skill-row-meta"><span>${fmtInt(r.left)} XP left · ${pctDone(r)}</span><span>Excluded${r.hours !== null ? ` · ${fmtInt(r.rate)} xp/h` : ""}</span></div>
          ${r.hours !== null ? levelBreakdown(r) : ""}
        </div>`).join("")}
    </div>
    ${m.maxedCount ? `<div class="maxed-note">${m.maxedCount} skill${m.maxedCount === 1 ? "" : "s"} already 99</div>` : ""}
  `;

  const paceInput = document.getElementById("pace-input");
  const updateDate = () => {
    const p = Number(paceInput.value);
    const valid = p > 0;
    const days = valid ? Math.ceil(total / p) : 0;
    const d = new Date();
    d.setDate(d.getDate() + days);
    document.getElementById("max-date").textContent = valid
      ? d.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })
      : "–";
    document.getElementById("max-days").textContent = valid ? `${fmtInt(days)} days at ${p} h/day` : "Enter hours per day";
  };
  if (paceInput) {
    updateDate();
    paceInput.addEventListener("input", updateDate);
    paceInput.addEventListener("change", async () => {
      const p = Number(paceInput.value);
      if (p > 0) await DB.setMeta("pace", p);
    });
  }
  document.getElementById("max-refresh").addEventListener("click", (e) => runMaxSync(e.currentTarget));
  viewRoot.querySelectorAll('[data-act="set-rate"]').forEach((b) => b.addEventListener("click", () => navigate("settings")));
  viewRoot.querySelectorAll(".skill-row.expandable").forEach((row) => {
    row.classList.toggle("open", openSkills.has(row.dataset.skill));
    const toggle = () => {
      const open = row.classList.toggle("open");
      row.setAttribute("aria-expanded", open);
      if (open) openSkills.add(row.dataset.skill);
      else openSkills.delete(row.dataset.skill);
    };
    row.addEventListener("click", toggle);
    row.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        toggle();
      }
    });
  });
}

// Skills whose level breakdown is expanded; kept across re-renders (e.g. Refresh).
const openSkills = new Set();

// Share of the XP to 99 already earned, e.g. "56%" or "97.4%". Rounded down
// (one decimal from 90% up) so a skill short of 99 never shows 100%.
function pctDone(r) {
  const pct = (r.xp / MAX_XP) * 100;
  return `${pct >= 90 ? (Math.floor(pct * 10) / 10).toFixed(1) : Math.floor(pct)}%`;
}

// Accordion body: hours for each level from the current one up to 99, at the
// skill's flat xp/h rate. The first level only counts the XP still needed.
function levelBreakdown(r) {
  let cumulative = 0;
  const rows = [];
  for (let lvl = r.level; lvl < 99; lvl++) {
    const xp = XP_FOR_LEVEL[lvl + 1] - Math.max(r.xp, XP_FOR_LEVEL[lvl]);
    const hours = xp / r.rate;
    cumulative += hours;
    rows.push(`<tr><td>${lvl} → ${lvl + 1}</td><td>${fmtInt(xp)}</td><td>${fmtHours(hours)}</td><td>${fmtHours(cumulative)}</td></tr>`);
  }
  return `
    <div class="level-breakdown">
      <table>
        <thead><tr><th>Level</th><th>XP</th><th>Hours</th><th>Total</th></tr></thead>
        <tbody>${rows.join("")}</tbody>
      </table>
    </div>`;
}

function fmtHours(h) {
  return h < 10 ? h.toFixed(2) : h.toFixed(1);
}

async function runMaxSync(btn) {
  const errEl = document.getElementById("max-error");
  const label = btn.textContent;
  btn.disabled = true;
  btn.textContent = "Syncing…";
  if (errEl) errEl.textContent = "";
  try {
    await syncStats();
    showToast("Stats synced");
    if (state.view === "max") renderMax();
  } catch (err) {
    btn.disabled = false;
    btn.textContent = label;
    if (errEl) errEl.textContent = err.message;
  }
}

// ---------------- Settings: Account & xp/h rates ----------------

function syncStatusText(stats) {
  if (!stats) return "Not synced yet. Stats come from Wise Old Man.";
  const fmt = (iso) => new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  const snap = stats.snapshotAt ? ` Wise Old Man last updated this player ${fmt(stats.snapshotAt)}.` : "";
  return `Last synced ${fmt(stats.syncedAt)}.${snap} To get newer stats, update the player on wiseoldman.net, then sync again.`;
}

async function renderAccountSection(container) {
  const meta = await DB.getAllMeta();
  const stats = meta.stats;
  const rates = meta.rates || {};
  const excluded = new Set(meta.excluded || []);

  container.innerHTML = `
    <div class="rsn-row">
      <input id="rsn-input" class="search-input" placeholder="Your RuneScape name" autocapitalize="off" autocomplete="off" autocorrect="off" spellcheck="false" maxlength="12" value="${escapeHtml(meta.rsn || "")}">
      <button type="button" class="primary" id="sync-btn">Sync</button>
    </div>
    <div class="sync-status" id="sync-status">${escapeHtml(syncStatusText(stats))}</div>
    <div class="settings-hint">The xp/h you expect to get in each skill. Untick <b>Count</b> to leave a skill out of the Hours to Max total (or leave its rate blank).</div>
    <div class="rate-row rate-head" aria-hidden="true"><span>Skill</span><span>Lv</span><span>xp/h</span><span>Count</span></div>
    <div class="rates-list">
      ${SKILLS.map((s) => {
        const xp = stats ? stats.skills[s.key] || 0 : null;
        const maxed = xp !== null && xp >= MAX_XP;
        const isExcluded = excluded.has(s.key);
        return `
          <div class="rate-row ${maxed ? "maxed" : ""} ${!maxed && isExcluded ? "excluded" : ""}">
            <label for="rate-${s.key}">${s.name}</label>
            <span class="rate-level">${xp === null ? "–" : levelForXp(xp)}</span>
            ${maxed
              ? `<span class="rate-maxed">Maxed</span>`
              : `<input id="rate-${s.key}" class="rate-input" data-skill="${s.key}" type="number" min="0" step="1000" inputmode="numeric" placeholder="xp/h" value="${rates[s.key] || ""}">`}
            ${maxed
              ? `<span></span>`
              : `<input type="checkbox" class="rate-count" data-skill="${s.key}" aria-label="Count ${s.name} toward Hours to Max" ${isExcluded ? "" : "checked"}>`}
          </div>`;
      }).join("")}
    </div>
  `;

  const rsnInput = document.getElementById("rsn-input");
  const saveRsn = async () => {
    const rsn = rsnInput.value.trim();
    const prev = (await DB.getMeta("rsn")) || "";
    if (rsn === prev) return;
    await DB.setMeta("rsn", rsn);
    // Stats belong to the old name; drop them so Hours to Max doesn't mix accounts.
    if (prev) await DB.setMeta("stats", null);
    document.getElementById("sync-status").textContent = rsn ? "Name saved. Tap Sync to pull stats." : syncStatusText(null);
  };
  rsnInput.addEventListener("change", saveRsn);

  const syncBtn = document.getElementById("sync-btn");
  syncBtn.addEventListener("click", async () => {
    await saveRsn();
    const status = document.getElementById("sync-status");
    status.classList.remove("error");
    syncBtn.disabled = true;
    syncBtn.textContent = "Syncing…";
    try {
      await syncStats();
      showToast("Stats synced");
      renderAccountSection(container);
    } catch (err) {
      status.textContent = err.message;
      status.classList.add("error");
      syncBtn.disabled = false;
      syncBtn.textContent = "Sync";
    }
  });

  container.querySelectorAll(".rate-input").forEach((input) => {
    const skill = SKILLS.find((s) => s.key === input.dataset.skill);
    input.addEventListener("focus", () => setEditingBanner(`${skill.name} xp/h`));
    input.addEventListener("blur", () => setEditingBanner(null));
    input.addEventListener("change", async () => {
      const n = Math.max(0, Math.round(Number(input.value) || 0));
      input.value = n || "";
      const current = { ...((await DB.getMeta("rates")) || {}) };
      if (n) current[skill.key] = n;
      else delete current[skill.key];
      await DB.setMeta("rates", current);
      showToast(n ? `${skill.name}: ${fmtInt(n)} xp/h` : `${skill.name} rate cleared`);
    });
  });

  container.querySelectorAll(".rate-count").forEach((box) => {
    const skill = SKILLS.find((s) => s.key === box.dataset.skill);
    box.addEventListener("change", async () => {
      const current = new Set((await DB.getMeta("excluded")) || []);
      if (box.checked) current.delete(skill.key);
      else current.add(skill.key);
      await DB.setMeta("excluded", [...current]);
      box.closest(".rate-row").classList.toggle("excluded", !box.checked);
      showToast(box.checked ? `${skill.name} counted` : `${skill.name} excluded`);
    });
  });
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

function updateGroupBar() {
  const bar = document.getElementById("create-group-bar");
  if (!bar) return;
  const n = state.groupSelection.size;
  if (n < 2) {
    bar.style.display = "none";
    bar.innerHTML = "";
    return;
  }
  bar.style.display = "block";
  bar.innerHTML = `<button class="primary" id="create-group-btn">Group ${n} selected bosses</button>`;
  document.getElementById("create-group-btn").addEventListener("click", openCreateGroupModal);
}

async function openCreateGroupModal() {
  const bossIds = [...state.groupSelection];
  const allBosses = await DB.getBosses();
  const selectedBosses = bossIds.map((id) => allBosses.find((b) => b.id === id)).filter(Boolean);
  let mode = "sum";

  function renderGoalSection() {
    const el = document.getElementById("group-goal-section");
    if (!el) return;
    if (mode === "sum") {
      el.innerHTML = `
        <div class="form-row">
          <div class="goal-label">Combined daily goal</div>
          <input type="number" id="group-goal-input" class="goal-input" min="1" inputmode="numeric" value="1">
        </div>
      `;
    } else {
      el.innerHTML = `
        <div class="form-row">
          <div class="goal-label">Goal for each (hitting any one completes the group)</div>
          ${selectedBosses
            .map(
              (b) => `
            <div class="either-goal-row">
              <img src="assets/bosses/${b.image}" alt="${b.name}">
              <div class="either-goal-name">${b.name}</div>
              <input type="number" class="goal-input either-goal-input" data-boss-id="${b.id}" min="1" inputmode="numeric" value="1">
            </div>
          `
            )
            .join("")}
        </div>
      `;
    }
  }

  modalRoot.innerHTML = `
    <div class="modal-overlay" id="modal-overlay">
      <div class="modal-sheet">
        <div class="modal-header">
          <h2>Create Group</h2>
          <button class="modal-close" id="modal-close">✕</button>
        </div>
        <div class="form-row">
          <div class="goal-label">Group name</div>
          <input type="text" id="group-name-input" class="search-input" placeholder="e.g. Wilderness bosses">
        </div>
        <div class="mode-toggle">
          <button type="button" class="mode-btn active" data-mode="sum">All together</button>
          <button type="button" class="mode-btn" data-mode="either">Any one (either/or)</button>
        </div>
        <div class="mode-hint" id="mode-hint">Kills across all selected bosses add up to one shared goal.</div>
        <div id="group-goal-section"></div>
        <button class="primary" id="group-create-confirm" style="width:100%;margin-top:14px;">Create Group</button>
      </div>
    </div>
  `;
  renderGoalSection();

  document.getElementById("modal-close").addEventListener("click", closeModal);
  document.getElementById("modal-overlay").addEventListener("click", (e) => {
    if (e.target.id === "modal-overlay") closeModal();
  });
  document.querySelectorAll(".mode-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      mode = btn.dataset.mode;
      document.querySelectorAll(".mode-btn").forEach((b) => b.classList.toggle("active", b === btn));
      document.getElementById("mode-hint").textContent =
        mode === "sum"
          ? "Kills across all selected bosses add up to one shared goal."
          : "Hitting the goal for any one boss below completes the group for the day.";
      renderGoalSection();
    });
  });
  document.getElementById("group-create-confirm").addEventListener("click", async () => {
    const name = document.getElementById("group-name-input").value.trim();
    if (!name) {
      alert("Please enter a group name.");
      return;
    }
    if (mode === "sum") {
      const goal = Math.max(1, parseInt(document.getElementById("group-goal-input").value, 10) || 1);
      await DB.addGroup({ name, bossIds, mode: "sum", goal });
    } else {
      const memberGoals = {};
      document.querySelectorAll(".either-goal-input").forEach((input) => {
        memberGoals[Number(input.dataset.bossId)] = Math.max(1, parseInt(input.value, 10) || 1);
      });
      await DB.addGroup({ name, bossIds, mode: "either", memberGoals });
    }
    state.groupSelection.clear();
    showToast(`${name} group created`);
    closeModal();
    renderSettings();
  });
}

async function renderMyBosses(container) {
  const [bosses, groups] = await Promise.all([DB.getBosses(), DB.getGroups()]);
  const groupedIds = new Set(groups.flatMap((g) => g.bossIds));
  const standalone = bosses.filter((b) => !groupedIds.has(b.id));
  container.innerHTML = "";
  if (standalone.length === 0) {
    container.innerHTML = `<div class="empty-state">${
      bosses.length === 0 ? "No bosses added yet. Add one below." : "All your bosses are in groups below."
    }</div>`;
    updateGroupBar();
    return;
  }
  for (const boss of standalone) {
    const row = document.createElement("div");
    row.className = "settings-boss-row";
    row.innerHTML = `
      <input type="checkbox" class="group-select-checkbox" ${state.groupSelection.has(boss.id) ? "checked" : ""}>
      <img src="assets/bosses/${boss.image}" alt="${boss.name}">
      <div class="name">${boss.name}</div>
      <div>
        <div class="goal-label">Daily goal</div>
        <input class="goal-input" type="number" min="1" inputmode="numeric" value="${boss.goal || 1}">
      </div>
      <button class="danger-link" data-act="remove">Remove</button>
    `;
    const checkbox = row.querySelector(".group-select-checkbox");
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) state.groupSelection.add(boss.id);
      else state.groupSelection.delete(boss.id);
      updateGroupBar();
    });
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
        state.groupSelection.delete(boss.id);
        await DB.deleteBoss(boss.id);
        showToast(`${boss.name} removed`);
        renderSettings();
      }
    });
    container.appendChild(row);
  }
  updateGroupBar();
}

async function renderMyGroups(container) {
  const [bosses, groups] = await Promise.all([DB.getBosses(), DB.getGroups()]);
  const bossById = new Map(bosses.map((b) => [b.id, b]));
  container.innerHTML = "";
  if (groups.length === 0) {
    container.innerHTML = `<div class="empty-state">No groups yet. Select 2 or more bosses above to combine them.</div>`;
    return;
  }
  for (const group of groups) {
    const mode = group.mode || "sum";
    const memberGoals = group.memberGoals || {};
    const members = group.bossIds.map((id) => bossById.get(id)).filter(Boolean);
    const card = document.createElement("div");
    card.className = "group-settings-card";
    card.innerHTML = `
      <div class="group-settings-header">
        <div class="name">${group.name}</div>
        <div class="group-mode-tag">${mode === "either" ? "Any one" : "Combined"}</div>
        <button class="danger-link" data-act="delete-group">Delete group</button>
      </div>
      ${
        mode === "sum"
          ? `<div class="group-settings-goal-row">
               <div class="goal-label">Combined goal</div>
               <input class="goal-input group-goal-input" type="number" min="1" inputmode="numeric" value="${group.goal || 1}">
             </div>`
          : ""
      }
      <div class="group-settings-members"></div>
    `;
    if (mode === "sum") {
      card.querySelector(".group-goal-input").addEventListener("change", async (e) => {
        const n = Math.max(1, parseInt(e.target.value, 10) || 1);
        e.target.value = n;
        await DB.updateGroup(group.id, { goal: n });
        showToast(`${group.name} goal set to ${n}`);
      });
    }
    card.querySelector('[data-act="delete-group"]').addEventListener("click", async () => {
      if (confirm(`Delete "${group.name}"? Its bosses will go back to being tracked individually.`)) {
        await DB.deleteGroup(group.id);
        showToast(`${group.name} deleted`);
        renderSettings();
      }
    });
    const membersEl = card.querySelector(".group-settings-members");
    for (const boss of members) {
      const memberRow = document.createElement("div");
      memberRow.className = "group-settings-member";
      memberRow.innerHTML = `
        <img src="assets/bosses/${boss.image}" alt="${boss.name}">
        <div class="name">${boss.name}</div>
        ${
          mode === "either"
            ? `<input class="goal-input member-goal-input" type="number" min="1" inputmode="numeric" value="${memberGoals[boss.id] || 1}">`
            : ""
        }
        <button class="danger-link" data-act="remove-member">Remove</button>
      `;
      if (mode === "either") {
        memberRow.querySelector(".member-goal-input").addEventListener("change", async (e) => {
          const n = Math.max(1, parseInt(e.target.value, 10) || 1);
          e.target.value = n;
          const newGoals = { ...(group.memberGoals || {}), [boss.id]: n };
          await DB.updateGroup(group.id, { memberGoals: newGoals });
          showToast(`${boss.name} goal set to ${n}`);
        });
      }
      memberRow.querySelector('[data-act="remove-member"]').addEventListener("click", async () => {
        const newIds = group.bossIds.filter((id) => id !== boss.id);
        if (newIds.length === 0) {
          if (!confirm(`Remove ${boss.name}? This will delete the empty group "${group.name}".`)) return;
          await DB.deleteGroup(group.id);
          showToast(`${group.name} deleted`);
        } else {
          const changes = { bossIds: newIds };
          if (mode === "either" && group.memberGoals) {
            const mg = { ...group.memberGoals };
            delete mg[boss.id];
            changes.memberGoals = mg;
          }
          await DB.updateGroup(group.id, changes);
          showToast(`${boss.name} removed from ${group.name}`);
        }
        renderSettings();
      });
      membersEl.appendChild(memberRow);
    }
    container.appendChild(card);
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
    <div class="section-title">Account &amp; xp/h Rates</div>
    <div id="account-section"></div>

    <div class="section-title">My Bosses</div>
    <div class="settings-hint">Check 2 or more to combine them into a group goal.</div>
    <div id="my-bosses-list"></div>
    <div id="create-group-bar" style="display:none"></div>

    <div class="section-title">My Groups</div>
    <div id="my-groups-list"></div>

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
  renderAccountSection(document.getElementById("account-section"));
  renderMyBosses(document.getElementById("my-bosses-list"));
  renderMyGroups(document.getElementById("my-groups-list"));
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
    a.download = `osrs-tools-backup-${todayStr()}.json`;
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

// ---------------- Navigation ----------------
// Bottom tabs: Home and Settings. Tools (Boss Tracker, Hours to Max) open from
// Home tiles and show a back button in the header.

function navigate(view) {
  if (state.view === "settings" && view !== "settings") state.groupSelection.clear();
  state.view = view;
  renderToken++;
  const activeTab = view === "settings" ? "settings" : "home";
  tabBtns.forEach((b) => b.classList.toggle("active", b.dataset.tab === activeTab));
  headerBack.hidden = !(view === "bosses" || view === "max");
  closeModal();
  viewRoot.scrollTop = 0;
  if (view === "bosses") renderBossTracker();
  else if (view === "max") renderMax();
  else if (view === "settings") renderSettings();
  else renderHome();
}

tabBtns.forEach((btn) => btn.addEventListener("click", () => navigate(btn.dataset.tab)));
headerBack.addEventListener("click", () => navigate("home"));

// ---------------- Init ----------------

(async function init() {
  await loadCatalog();
  navigate("home");

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
})();
