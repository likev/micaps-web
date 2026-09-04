// tabWindowManager.js - Multi-tab and Split Window Orchestrator
import { createMapInstance, setActiveMap } from "../map/mapInstance.js";
import { PRESET_GROUPS } from "../config/presets.js";
import { appState } from "../store/appState.js";
import { formatObsTimestamp, formatForecastValidTime } from "../utils/formatters.js";

const DEFAULT_LEVELS = [500, 850, 1000, 200, 700, 400, 300, 100];

let tabs = [];
let activeTabId = 1;
let callbacks = {};
const syncingTabs = new Set();

export function initTabWindowManager(callbacksObj = {}) {
  callbacks = callbacksObj;
  renderTabsBar();
  const firstTab = createPrimaryWorkspace();
  return firstTab;
}

export function getActiveTab() {
  return tabs.find((t) => t.id === activeTabId) || tabs[0];
}

export function getActiveWindow() {
  const tab = getActiveTab();
  if (!tab) return null;
  return tab.windows[tab.activeWinIdx] || tab.windows[0];
}

function renderTabsBar() {
  const tabsBar = document.getElementById("tabs-bar");
  if (!tabsBar) return;

  tabsBar.innerHTML = `
    <div class="tabs-list" id="tabs-list">
      <button class="btn-add-tab" id="btn-add-tab" title="Add new tab">+</button>
    </div>
    <div class="layout-controls" id="layout-controls">
      <span class="layout-label">Layout:</span>
      <button id="btn-layout-1" class="layout-btn active" title="Tabs Mode (Full window tab)">⊟ Tabs</button>
      <button id="btn-layout-2" class="layout-btn" title="2-Split Mode (Side-by-side 1x2)">◫ 2-Split</button>
      <button id="btn-layout-4" class="layout-btn" title="4-Split Mode (2x2 grid)">⊞ 4-Split</button>
      <button id="btn-sync-toggle" class="layout-btn active hidden" title="Sync pan & zoom across windows">Sync 🔗</button>
    </div>
  `;

  document.getElementById("btn-add-tab").addEventListener("click", () => {
    addTabWindow();
  });

  document.getElementById("btn-layout-1").addEventListener("click", () => {
    setTabLayout(activeTabId, "1x1");
  });

  document.getElementById("btn-layout-2").addEventListener("click", () => {
    setTabLayout(activeTabId, "1x2");
  });

  document.getElementById("btn-layout-4").addEventListener("click", () => {
    setTabLayout(activeTabId, "2x2");
  });

  document.getElementById("btn-sync-toggle").addEventListener("click", () => {
    const tab = getActiveTab();
    if (!tab) return;
    tab.syncMap = !tab.syncMap;
    updateLayoutButtons(tab.layout);
    if (tab.syncMap) {
      syncTabCameras(tab);
    }
  });
}

function createPrimaryWorkspace() {
  const tabId = 1;
  const tab = {
    id: tabId,
    name: "Workspace 1",
    layout: "1x1",
    activeWinIdx: 0,
    syncMap: true,
    windows: [],
  };

  const wsContainer = document.getElementById("workspace-container");
  if (!wsContainer) return null;
  wsContainer.innerHTML = "";

  const wsEl = document.createElement("div");
  wsEl.className = "tab-workspace active";
  wsEl.id = `tab-workspace-${tabId}`;
  wsEl.dataset.tabId = String(tabId);

  const gridEl = document.createElement("div");
  gridEl.className = "windows-grid layout-1x1";
  gridEl.id = `windows-grid-${tabId}`;

  wsEl.appendChild(gridEl);
  wsContainer.appendChild(wsEl);
  tabs = [tab];
  activeTabId = tabId;

  // Create initial 4 windows (representing Tabs 1-4 and Split 1-4)
  for (let wIdx = 0; wIdx < 4; wIdx++) {
    createWindowPanel(tab, gridEl, wIdx);
  }

  // Initialize Window 0 map immediately
  initWindowMap(tab.windows[0]);

  // Setup header controls for all 4 windows
  tab.windows.forEach((win) => setupWindowControlsForWin(tab, win));

  // Focus Window 0
  focusWindow(tabId, 0);

  updateLayoutButtons("1x1");

  return tab;
}

function createWindowPanel(tab, gridEl, wIdx) {
  const tabId = tab.id;
  const winObj = {
    tabId,
    winIdx: wIdx,
    id: `tab-${tabId}-win-${wIdx}`,
    panelId: `win-panel-${tabId}-${wIdx}`,
    headerId: `win-header-${tabId}-${wIdx}`,
    badgeId: `win-badge-${tabId}-${wIdx}`,
    titleId: `win-title-${tabId}-${wIdx}`,
    presetSelectId: `win-preset-${tabId}-${wIdx}`,
    levelSelectId: `win-level-${tabId}-${wIdx}`,
    maxBtnId: `win-max-${tabId}-${wIdx}`,
    domId: `map-viewport-${tabId}-${wIdx}`,
    map: null,
    activeGroup: null,
    level: DEFAULT_LEVELS[wIdx] || 500,
    period: 24,
    model: null,
    element: null,
    isObservation: false,
    obsTime: null,
  };

  const panelEl = document.createElement("div");
  panelEl.className = `window-panel ${wIdx === tab.activeWinIdx ? "active active-single" : ""}`;
  panelEl.id = winObj.panelId;
  panelEl.dataset.tabId = String(tabId);
  panelEl.dataset.winIdx = String(wIdx);

  panelEl.innerHTML = `
    <div class="win-header" id="${winObj.headerId}">
      <div class="win-title-group">
        <span class="win-badge" id="${winObj.badgeId}">W${wIdx + 1}</span>
        <span class="win-title" id="${winObj.titleId}"></span>
      </div>
      <div class="win-actions">
        <select class="win-preset-select" id="${winObj.presetSelectId}">
          <option value="">-- Group --</option>
          ${PRESET_GROUPS.map((g) => `<option value="${g.id}">${g.name}</option>`).join("")}
        </select>
        <select class="win-level-select" id="${winObj.levelSelectId}">
          ${DEFAULT_LEVELS.map((l) => `<option value="${l}" ${l === winObj.level ? "selected" : ""}>${l} hPa</option>`).join("")}
        </select>
        <button class="win-btn-max" id="${winObj.maxBtnId}" title="Maximize Window">⛶</button>
      </div>
    </div>
    <div class="map-viewport" id="${winObj.domId}"></div>
  `;

  panelEl.addEventListener("click", () => {
    const curIdx = parseInt(panelEl.dataset.winIdx, 10);
    focusWindow(tabId, Number.isNaN(curIdx) ? winObj.winIdx : curIdx);
  });

  gridEl.appendChild(panelEl);
  tab.windows.push(winObj);

  // Render tab pill for this window in tabs list
  renderTabPillForWindow(tab, winObj);

  return winObj;
}

function renderTabPillForWindow(tab, winObj) {
  const tabsList = document.getElementById("tabs-list");
  const addBtn = document.getElementById("btn-add-tab");
  if (!tabsList || !addBtn) return;

  const wIdx = winObj.winIdx;
  const pill = document.createElement("div");
  pill.className = `tab-item ${wIdx === tab.activeWinIdx ? "active" : ""}`;
  pill.id = `tab-item-win-${wIdx}`;
  pill.dataset.winIdx = String(wIdx);

  pill.innerHTML = `
    <span class="tab-label" id="tab-label-${wIdx}">Tab ${wIdx + 1}</span>
    ${wIdx >= 4 ? `<button class="tab-close-btn" id="tab-close-${wIdx}" title="Close Tab">×</button>` : ""}
  `;

  pill.addEventListener("click", (e) => {
    const curIdx = parseInt(pill.dataset.winIdx, 10);
    const targetIdx = Number.isNaN(curIdx) ? winObj.winIdx : curIdx;
    if (e.target.classList.contains("tab-close-btn")) {
      e.stopPropagation();
      closeWindowTab(tab, targetIdx);
    } else {
      focusWindow(tab.id, targetIdx);
    }
  });

  tabsList.insertBefore(pill, addBtn);
}

function addTabWindow() {
  const tab = getActiveTab();
  if (!tab) return;
  const gridEl = document.getElementById(`windows-grid-${tab.id}`);
  if (!gridEl) return;

  let newIdx = tab.windows.length;
  // Ensure pill id uniqueness (post-reindex length is unique, but guard against stale DOM)
  while (document.getElementById(`tab-item-win-${newIdx}`)) newIdx++;
  const newWin = createWindowPanel(tab, gridEl, newIdx);
  setupWindowControlsForWin(tab, newWin);
  initWindowMap(newWin);
  if (callbacks.onWindowInit) callbacks.onWindowInit(newWin);
  focusWindow(tab.id, newIdx);
}

function closeWindowTab(tab, winIdx) {
  if (tab.windows.length <= 1) return;
  const win = tab.windows[winIdx];
  if (!win) return;

  win.map?.remove();
  win.map = null;

  document.getElementById(win.panelId)?.remove();
  document.getElementById(`tab-item-win-${win.winIdx}`)?.remove();

  tab.windows.splice(winIdx, 1);
  tab.windows.forEach((w, idx) => {
    const oldWinIdx = w.winIdx;
    const oldPanelId = w.panelId;
    const oldHeaderId = w.headerId;
    const oldBadgeId = w.badgeId;
    const oldTitleId = w.titleId;
    const oldPresetId = w.presetSelectId;
    const oldLevelId = w.levelSelectId;
    const oldMaxBtnId = w.maxBtnId;

    const newPanelId = `win-panel-${tab.id}-${idx}`;
    const newHeaderId = `win-header-${tab.id}-${idx}`;
    const newBadgeId = `win-badge-${tab.id}-${idx}`;
    const newTitleId = `win-title-${tab.id}-${idx}`;
    const newPresetId = `win-preset-${tab.id}-${idx}`;
    const newLevelId = `win-level-${tab.id}-${idx}`;
    const newMaxBtnId = `win-max-${tab.id}-${idx}`;
    const newId = `tab-${tab.id}-win-${idx}`;

    const renameEl = (oldId, newId) => {
      if (oldId !== newId) {
        const el = document.getElementById(oldId);
        if (el) el.id = newId;
      }
    };

    // Panel: rename and update dataset.winIdx (domId viewport kept as-is to avoid breaking map container)
    if (oldPanelId !== newPanelId) {
      const panelEl = document.getElementById(oldPanelId);
      if (panelEl) {
        panelEl.id = newPanelId;
        panelEl.dataset.winIdx = String(idx);
      }
    } else {
      const panelEl = document.getElementById(newPanelId);
      if (panelEl) panelEl.dataset.winIdx = String(idx);
    }
    renameEl(oldHeaderId, newHeaderId);
    renameEl(oldBadgeId, newBadgeId);
    renameEl(oldTitleId, newTitleId);
    renameEl(oldPresetId, newPresetId);
    renameEl(oldLevelId, newLevelId);
    renameEl(oldMaxBtnId, newMaxBtnId);
    // w.domId intentionally not renamed to keep map container stable

    const badge = document.getElementById(newBadgeId);
    if (badge) badge.textContent = `W${idx + 1}`;

    // Pill renaming: lookup by old winIdx
    const oldPillId = `tab-item-win-${oldWinIdx}`;
    const newPillId = `tab-item-win-${idx}`;
    let pill = document.getElementById(oldPillId);
    if (!pill) pill = document.getElementById(newPillId);
    if (pill) {
      if (pill.id !== newPillId) pill.id = newPillId;
      pill.dataset.winIdx = String(idx);
      // Update label id and text
      const oldLabelId = `tab-label-${oldWinIdx}`;
      const newLabelId = `tab-label-${idx}`;
      let labelEl = document.getElementById(oldLabelId);
      if (!labelEl) labelEl = pill.querySelector('[id^="tab-label-"]');
      if (labelEl) {
        if (labelEl.id !== newLabelId) labelEl.id = newLabelId;
        const titleText = document.getElementById(newTitleId)?.textContent || "";
        labelEl.textContent = titleText ? `W${idx + 1}: ${titleText}` : `Tab ${idx + 1}`;
      }
      const oldCloseId = `tab-close-${oldWinIdx}`;
      const newCloseId = `tab-close-${idx}`;
      const closeBtn = document.getElementById(oldCloseId);
      if (closeBtn && closeBtn.id !== newCloseId) closeBtn.id = newCloseId;
      // Ensure close button visibility matches new idx (>=4 closable)
      const hasClose = !!pill.querySelector(`#${newCloseId}`) || !!document.getElementById(newCloseId);
      if (idx >= 4 && !hasClose) {
        const btn = document.createElement("button");
        btn.className = "tab-close-btn";
        btn.id = newCloseId;
        btn.title = "Close Tab";
        btn.textContent = "×";
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          const cur = parseInt(pill.dataset.winIdx, 10);
          closeWindowTab(tab, Number.isNaN(cur) ? idx : cur);
        });
        pill.appendChild(btn);
      } else if (idx < 4 && hasClose) {
        document.getElementById(newCloseId)?.remove();
      }
    }

    // Update window object fields to new ids (domId kept)
    w.winIdx = idx;
    w.id = newId;
    w.panelId = newPanelId;
    w.headerId = newHeaderId;
    w.badgeId = newBadgeId;
    w.titleId = newTitleId;
    w.presetSelectId = newPresetId;
    w.levelSelectId = newLevelId;
    w.maxBtnId = newMaxBtnId;
  });

  const nextIdx = Math.max(0, winIdx - 1);
  focusWindow(tab.id, nextIdx);
}

export function setTabLayout(tabId, layout = "1x1") {
  const tab = tabs.find((t) => t.id === tabId) || getActiveTab();
  if (!tab) return;

  tab.layout = layout;
  const grid = document.getElementById(`windows-grid-${tab.id}`);
  if (grid) {
    grid.className = `windows-grid layout-${layout}`;
  }

  updateLayoutButtons(layout);

  const numVisible = layout === "1x1" ? 1 : (layout === "1x2" ? 2 : 4);
  for (let i = 0; i < Math.min(numVisible, tab.windows.length); i++) {
    const win = tab.windows[i];
    if (win && !win.map) {
      initWindowMap(win);
      if (callbacks.onWindowInit) {
        callbacks.onWindowInit(win);
      }
    }
  }

  if (layout === "1x2" && tab.activeWinIdx > 1) {
    tab.activeWinIdx = 0;
  }

  focusWindow(tab.id, tab.activeWinIdx);

  if (layout !== "1x1" && tab.syncMap) {
    setTimeout(() => {
      syncTabCameras(tab);
    }, 100);
  }

  setTimeout(() => {
    tab.windows.forEach((win) => {
      if (win.map) win.map.resize();
    });
  }, 50);
}

function updateLayoutButtons(layout) {
  const btn1 = document.getElementById("btn-layout-1");
  const btn2 = document.getElementById("btn-layout-2");
  const btn4 = document.getElementById("btn-layout-4");
  const syncBtn = document.getElementById("btn-sync-toggle");
  const tabsList = document.getElementById("tabs-list");
  const tab = getActiveTab();

  if (btn1) btn1.classList.toggle("active", layout === "1x1");
  if (btn2) btn2.classList.toggle("active", layout === "1x2");
  if (btn4) btn4.classList.toggle("active", layout === "2x2");

  if (tabsList) {
    tabsList.classList.toggle("hidden", layout !== "1x1");
  }

  if (syncBtn) {
    syncBtn.classList.toggle("hidden", layout === "1x1");
    if (tab) {
      const isSync = tab.syncMap !== false;
      syncBtn.classList.toggle("active", isSync);
      syncBtn.textContent = isSync ? "Sync 🔗" : "Sync ✕";
      syncBtn.title = isSync
        ? "Camera sync enabled across windows (Click to toggle off)"
        : "Camera sync disabled (Click to toggle on)";
    }
  }
}

export function toggleTabsAndSplit(tabId = activeTabId) {
  const tab = tabs.find((t) => t.id === tabId) || getActiveTab();
  if (!tab) return;
  const newLayout = tab.layout === "1x1" ? "2x2" : "1x1";
  setTabLayout(tab.id, newLayout);
}

export function focusWindow(tabId, winIdx) {
  const tab = tabs.find((t) => t.id === tabId) || getActiveTab();
  if (!tab) return;

  const activeWin = tab.windows[winIdx];
  if (!activeWin) return;

  // Avoid redundant work when already focused
  const alreadyFocused =
    tab.activeWinIdx === winIdx &&
    tab.windows[tab.activeWinIdx]?.id === activeWin.id &&
    document.getElementById(activeWin.panelId)?.classList.contains("active");
  if (alreadyFocused) {
    if (activeWin.map) setActiveMap(activeWin.map);
    return;
  }

  tab.activeWinIdx = winIdx;

  // Highlight active panel and tab item (lookup by w.winIdx after reindex)
  tab.windows.forEach((w) => {
    const p = document.getElementById(w.panelId);
    if (p) {
      p.classList.toggle("active", w.winIdx === winIdx);
      p.classList.toggle("active-single", w.winIdx === winIdx);
    }
    const pill = document.getElementById(`tab-item-win-${w.winIdx}`);
    if (pill) {
      pill.classList.toggle("active", w.winIdx === winIdx);
    }
  });

  if (!activeWin.map) {
    initWindowMap(activeWin);
    callbacks.onWindowInit?.(activeWin);
  } else {
    setActiveMap(activeWin.map);
    setTimeout(() => {
      activeWin.map.resize();
    }, 50);
  }

  appState.set("activeWinId", activeWin.id);
  appState.update({
    activeGroup: activeWin.activeGroup,
    level: activeWin.level,
    period: activeWin.period,
    model: activeWin.model,
    element: activeWin.element,
    obsTime: activeWin.obsTime,
    isObservation: activeWin.isObservation,
  });

  // Apply pending observation timeline stored by syncObservationTimeline for background windows
  if (activeWin._pendingTimeline) {
    const pt = activeWin._pendingTimeline;
    delete activeWin._pendingTimeline;
    import("./timeSlider.js").then(({ setTimelineMode }) => {
      try { setTimelineMode("obs", pt); } catch {}
    });
  }

  callbacks.onWindowFocus?.(activeWin);
}

function initWindowMap(win) {
  if (win.map) return;
  const container = document.getElementById(win.domId);
  if (!container) return;

  const map = createMapInstance(container);
  win.map = map;

  if (win.tabId === 1 && win.winIdx === 0) {
    setActiveMap(map);
    map.on("load", () => {
      window.__MAP_LOADED__ = true;
    });
  }

  map.on("load", () => {
    const tab = tabs.find((t) => t.id === win.tabId);
    if (tab && tab.syncMap && tab.layout !== "1x1") {
      const activeWin = tab.windows[tab.activeWinIdx] || tab.windows[0];
      if (activeWin && activeWin !== win && activeWin.map) {
        map.jumpTo({
          center: activeWin.map.getCenter(),
          zoom: activeWin.map.getZoom(),
          pitch: activeWin.map.getPitch(),
          bearing: activeWin.map.getBearing(),
        });
      }
    }
  });

  // Camera synchronization across visible windows in split mode
  map.on("move", () => {
    const tab = tabs.find((t) => t.id === win.tabId);
    if (!tab || !tab.syncMap || tab.layout === "1x1" || syncingTabs.has(tab.id)) return;

    const numVisible = tab.layout === "1x2" ? 2 : 4;
    if (win.winIdx >= numVisible) return;

    syncingTabs.add(tab.id);
    try {
      const center = map.getCenter();
      const zoom = map.getZoom();
      const pitch = map.getPitch();
      const bearing = map.getBearing();

      tab.windows.slice(0, numVisible).forEach((otherWin) => {
        if (otherWin !== win && otherWin.map && (otherWin.map.isStyleLoaded() || otherWin.map.loaded())) {
          otherWin.map.jumpTo({ center, zoom, pitch, bearing });
        }
      });
    } finally {
      syncingTabs.delete(tab.id);
    }
  });
}

function setupWindowControlsForWin(tab, win) {
  const presetSelect = document.getElementById(win.presetSelectId);
  const levelSelect = document.getElementById(win.levelSelectId);
  const maxBtn = document.getElementById(win.maxBtnId);

  if (presetSelect) {
    presetSelect.addEventListener("change", (e) => {
      const gid = e.target.value;
      const g = PRESET_GROUPS.find((grp) => grp.id === gid) || null;
      win.activeGroup = g;
      updateWindowTitle(win, g ? g.name : "");
      focusWindow(win.tabId, win.winIdx);
    });
  }

  if (levelSelect) {
    levelSelect.addEventListener("change", (e) => {
      const lvl = parseInt(e.target.value, 10);
      if (!isNaN(lvl)) {
        win.level = lvl;
        focusWindow(win.tabId, win.winIdx);
      }
    });
  }

  const header = document.getElementById(win.headerId);
  if (header) {
    header.addEventListener("dblclick", (e) => {
      if (e.target.tagName === "SELECT" || e.target.tagName === "BUTTON") return;
      focusWindow(win.tabId, win.winIdx);
      toggleTabsAndSplit(win.tabId);
    });
  }

  if (maxBtn) {
    maxBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      focusWindow(win.tabId, win.winIdx);
      toggleTabsAndSplit(win.tabId);
    });
  }
}

export function computeFullWindowTitle(win, baseText = null) {
  if (!win) return "";
  let base = (baseText !== null && baseText !== undefined) ? baseText : win.baseTitle;
  if (!base) {
    base = win.activeGroup ? win.activeGroup.name : (win.title || "");
  }
  if (!base) return "";

  // Strip any existing timestamp suffix to prevent duplicate accumulation
  base = base.replace(/\s*[\(\[](Obs|Valid).*?[\)\]]$/i, "").trim();
  win.baseTitle = base;

  const isObs = Boolean(
    win.isObservation ||
    win.activeGroup?.isObservation ||
    win.model === "SURFACE" ||
    win.model === "UPPER_AIR" ||
    base.toLowerCase().includes("sounding") ||
    base.toLowerCase().includes("observation")
  );

  let timeSuffix = "";
  if (isObs) {
    if (win.obsTime) {
      const formatted = formatObsTimestamp(win.obsTime);
      if (formatted && formatted !== "--") {
        timeSuffix = `[Obs: ${formatted}]`;
      }
    }
  } else {
    // NWP Forecast mode
    if (win.forecastCycle) {
      const formatted = formatForecastValidTime(win.forecastCycle, win.period ?? 0);
      if (formatted && !formatted.includes("NaN")) {
        timeSuffix = `[Valid: ${formatted}]`;
      }
    } else if (win.period !== undefined && win.period !== null && win.period !== "") {
      timeSuffix = `[Valid: +${String(win.period).padStart(3, "0")}h]`;
    }
  }

  const full = timeSuffix ? `${base} ${timeSuffix}` : base;
  win.title = full;
  return full;
}

export function updateWindowTitle(win, text = null) {
  if (!win) return;
  const fullTitle = computeFullWindowTitle(win, text);

  const el = document.getElementById(win.titleId);
  if (el) {
    el.textContent = fullTitle;
    el.title = fullTitle;
  }

  const tabLabel = document.getElementById(`tab-label-${win.winIdx}`);
  if (tabLabel) {
    tabLabel.textContent = fullTitle ? `W${win.winIdx + 1}: ${fullTitle}` : `Tab ${win.winIdx + 1}`;
    tabLabel.title = fullTitle ? `W${win.winIdx + 1}: ${fullTitle}` : `Tab ${win.winIdx + 1}`;
  }
}

export function setWindowHeaderPreset(win, groupId) {
  const el = document.getElementById(win.presetSelectId);
  if (el) el.value = groupId || "";
}

export function setWindowHeaderLevel(win, level) {
  const el = document.getElementById(win.levelSelectId);
  if (el) {
    if (level == null || level === "") el.value = "";
    else el.value = String(level);
  }
}

export function refreshPresetControls() {
  tabs.forEach((tab) => {
    tab.windows.forEach((win) => {
      const currentGroupId = win.activeGroup?.id;
      const group = PRESET_GROUPS.find((candidate) => candidate.id === currentGroupId) || null;
      win.activeGroup = group;

      const select = document.getElementById(win.presetSelectId);
      if (select) {
        select.innerHTML = `
          <option value="">-- Group --</option>
          ${PRESET_GROUPS.map((g) => `<option value="${g.id}">${g.name}</option>`).join("")}
        `;
        select.value = group?.id || "";
      }

      updateWindowTitle(win, group ? group.name : "");
    });
  });

  const activeWin = getActiveWindow();
  if (activeWin) {
    appState.update({
      activeGroup: activeWin.activeGroup,
      level: activeWin.level,
      period: activeWin.period,
      model: activeWin.model,
      element: activeWin.element,
      obsTime: activeWin.obsTime,
      isObservation: activeWin.isObservation,
    });
    callbacks.onWindowFocus?.(activeWin);
  }
}

export function syncTabCameras(tab) {
  if (!tab || !tab.syncMap || tab.layout === "1x1" || syncingTabs.has(tab.id)) return;
  const activeWin = tab.windows[tab.activeWinIdx] || tab.windows[0];
  if (!activeWin || !activeWin.map) return;

  const numVisible = tab.layout === "1x2" ? 2 : 4;
  const map = activeWin.map;
  syncingTabs.add(tab.id);
  try {
    const center = map.getCenter();
    const zoom = map.getZoom();
    const pitch = map.getPitch();
    const bearing = map.getBearing();

    tab.windows.slice(0, numVisible).forEach((otherWin) => {
      if (otherWin !== activeWin && otherWin.map && (otherWin.map.isStyleLoaded() || otherWin.map.loaded())) {
        otherWin.map.jumpTo({ center, zoom, pitch, bearing });
      }
    });
  } finally {
    syncingTabs.delete(tab.id);
  }
}
