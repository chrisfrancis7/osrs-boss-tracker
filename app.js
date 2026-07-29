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
      if (state.tab === "calendar") renderCalendarGrid(); // refresh dots underneath
    });
    container.appendChild(card);
  }

  for (const boss of bosses) {
    if (groupedIds.has(boss.id)) continue;
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
  if (state.tab === "settings" && tab !== "settings") state.groupSelection.clear();
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
