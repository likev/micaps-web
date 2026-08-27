// tabWindowManager.js - Multi-tab and 4-split window orchestrator with unique DOM IDs
import { createMapInstance, setActiveMap } from "../map/mapInstance.js";
import { PRESET_GROUPS } from "../config/presets.js";
import { appState } from "../store/appState.js";

const DEFAULT_LEVELS = [1000, 925, 850, 700, 500, 400, 300, 200, 100];
const DEFAULT_GROUP_IDS = ["composite-500hpa", "composite-850hpa", "composite-surface", "composite-200hpa"];

let tabCounter = 0;
let tabs = [];
let activeTabId = null;
let callbacks = {};
let isSyncingCamera = false;

export function initTabWindowManager(callbacksObj = {}) {
  callbacks = callbacksObj;
  renderTabsBar();
  const firstTab = createNewTab("Workspace 1");
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
      <button id="btn-layout-1" class="layout-btn active" title="Single full window (1x1)">1x1</button>
      <button id="btn-layout-4" class="layout-btn" title="4-Split windows (2x2)">2x2</button>
      <button id="btn-sync-toggle" class="layout-btn active" title="Sync pan & zoom across windows">Sync 🔗</button>
    </div>
  `;

  document.getElementById("btn-add-tab").addEventListener("click", () => {
    createNewTab();
  });

  document.getElementById("btn-layout-1").addEventListener("click", () => {
    setTabLayout(activeTabId, "1x1");
  });

  document.getElementById("btn-layout-4").addEventListener("click", () => {
    setTabLayout(activeTabId, "2x2");
  });

  document.getElementById("btn-sync-toggle").addEventListener("click", () => {
    const tab = getActiveTab();
    if (!tab) return;
    tab.syncMap = !tab.syncMap;
    const btn = document.getElementById("btn-sync-toggle");
    if (btn) btn.classList.toggle("active", tab.syncMap);
  });
}

export function createNewTab(customName = null) {
  tabCounter++;
  const tabId = tabCounter;
  const tabName = customName || `Tab ${tabId}`;

  const tab = {
    id: tabId,
    name: tabName,
    layout: "1x1",
    activeWinIdx: 0,
    syncMap: true,
    windows: [],
  };

  const wsContainer = document.getElementById("workspace-container");
  if (!wsContainer) return null;

  // 1. Create tab workspace container with UNIQUE DOM ID
  const wsEl = document.createElement("div");
  wsEl.className = "tab-workspace";
  wsEl.id = `tab-workspace-${tabId}`;
  wsEl.dataset.tabId = String(tabId);

  // 2. Create windows grid with UNIQUE DOM ID
  const gridEl = document.createElement("div");
  gridEl.className = "windows-grid layout-1x1";
  gridEl.id = `windows-grid-${tabId}`;

  // 3. Create 4 windows, each with completely unique DOM IDs
  for (let wIdx = 0; wIdx < 4; wIdx++) {
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
      level: 500,
      period: 24,
      model: appState.get("model") || "ECMWF_HR",
      element: appState.get("element") || "TMP",
      isObservation: false,
      obsTime: null,
    };

    const defaultGId = DEFAULT_GROUP_IDS[wIdx] || "composite-500hpa";
    const defaultGroup = PRESET_GROUPS.find((g) => g.id === defaultGId);
    if (defaultGroup) {
      winObj.activeGroup = defaultGroup;
      if (defaultGroup.defaultLevel) winObj.level = defaultGroup.defaultLevel;
    }

    const panelEl = document.createElement("div");
    panelEl.className = `window-panel ${wIdx === 0 ? "active active-single" : ""}`;
    panelEl.id = winObj.panelId;
    panelEl.dataset.tabId = String(tabId);
    panelEl.dataset.winIdx = String(wIdx);

    panelEl.innerHTML = `
      <div class="win-header" id="${winObj.headerId}">
        <div class="win-title-group">
          <span class="win-badge" id="${winObj.badgeId}">W${wIdx + 1}</span>
          <span class="win-title" id="${winObj.titleId}">${winObj.activeGroup ? winObj.activeGroup.name : `Window ${wIdx + 1}`}</span>
        </div>
        <div class="win-actions">
          <select class="win-preset-select" id="${winObj.presetSelectId}">
            <option value="">-- Group --</option>
            ${PRESET_GROUPS.map((g) => `<option value="${g.id}" ${g.id === winObj.activeGroup?.id ? "selected" : ""}>${g.name}</option>`).join("")}
          </select>
          <select class="win-level-select" id="${winObj.levelSelectId}">
            ${DEFAULT_LEVELS.map((l) => `<option value="${l}" ${l === winObj.level ? "selected" : ""}>${l} hPa</option>`).join("")}
          </select>
          <button class="win-btn-max" id="${winObj.maxBtnId}" title="Maximize Window">⛶</button>
        </div>
      </div>
      <div class="map-viewport" id="${winObj.domId}"></div>
    `;

    // Click to focus window
    panelEl.addEventListener("click", () => {
      focusWindow(tabId, wIdx);
    });

    gridEl.appendChild(panelEl);
    tab.windows.push(winObj);
  }

  wsEl.appendChild(gridEl);
  wsContainer.appendChild(wsEl);
  tabs.push(tab);

  // Add tab pill button
  renderTabPill(tab);

  // Initialize Window 0 map immediately
  initWindowMap(tab.windows[0]);

  // Setup header controls for all 4 windows
  setupWindowControls(tab);

  // Switch to this new tab
  switchTab(tabId);

  return tab;
}

function renderTabPill(tab) {
  const tabsList = document.getElementById("tabs-list");
  const addBtn = document.getElementById("btn-add-tab");
  if (!tabsList || !addBtn) return;

  const pill = document.createElement("div");
  pill.className = "tab-item";
  pill.id = `tab-item-${tab.id}`;
  pill.dataset.tabId = String(tab.id);

  pill.innerHTML = `
    <span class="tab-label">${tab.name}</span>
    <button class="tab-close-btn" id="tab-close-${tab.id}" title="Close Tab">×</button>
  `;

  pill.addEventListener("click", (e) => {
    if (e.target.classList.contains("tab-close-btn")) {
      e.stopPropagation();
      closeTab(tab.id);
    } else {
      switchTab(tab.id);
    }
  });

  tabsList.insertBefore(pill, addBtn);
}

export function switchTab(tabId) {
  const targetTab = tabs.find((t) => t.id === tabId);
  if (!targetTab) return;

  activeTabId = tabId;

  // 1. Update tab pills
  document.querySelectorAll(".tab-item").forEach((pill) => {
    pill.classList.toggle("active", pill.dataset.tabId === String(tabId));
  });

  // 2. Update workspaces
  document.querySelectorAll(".tab-workspace").forEach((ws) => {
    ws.classList.toggle("active", ws.dataset.tabId === String(tabId));
  });

  // 3. Update layout buttons
  updateLayoutButtons(targetTab.layout);

  // 4. Focus active window
  focusWindow(targetTab.id, targetTab.activeWinIdx);

  // 5. Resize visible maps
  setTimeout(() => {
    targetTab.windows.forEach((win) => {
      if (win.map) win.map.resize();
    });
  }, 50);
}

export function closeTab(tabId) {
  if (tabs.length <= 1) return; // Keep at least one tab

  const idx = tabs.findIndex((t) => t.id === tabId);
  if (idx === -1) return;
  const tab = tabs[idx];

  // Destroy all maps in tab
  tab.windows.forEach((win) => {
    if (win.map) {
      win.map.remove();
      win.map = null;
    }
  });

  // Remove DOM elements
  document.getElementById(`tab-item-${tabId}`)?.remove();
  document.getElementById(`tab-workspace-${tabId}`)?.remove();

  tabs.splice(idx, 1);

  // Switch to previous or first tab
  const nextTab = tabs[Math.max(0, idx - 1)];
  if (nextTab) switchTab(nextTab.id);
}

export function setTabLayout(tabId, layout = "1x1") {
  const tab = tabs.find((t) => t.id === tabId);
  if (!tab) return;

  tab.layout = layout;
  const grid = document.getElementById(`windows-grid-${tabId}`);
  if (grid) {
    grid.className = `windows-grid layout-${layout}`;
  }

  updateLayoutButtons(layout);

  if (layout === "2x2") {
    // Initialize maps for windows 1, 2, 3 if not yet initialized
    for (let i = 0; i < 4; i++) {
      const win = tab.windows[i];
      if (!win.map) {
        initWindowMap(win);
        if (callbacks.onWindowInit) {
          callbacks.onWindowInit(win);
        }
      }
    }
  }

  setTimeout(() => {
    tab.windows.forEach((win) => {
      if (win.map) win.map.resize();
    });
  }, 50);
}

function updateLayoutButtons(layout) {
  const btn1 = document.getElementById("btn-layout-1");
  const btn4 = document.getElementById("btn-layout-4");
  if (btn1) btn1.classList.toggle("active", layout === "1x1");
  if (btn4) btn4.classList.toggle("active", layout === "2x2");
}

export function focusWindow(tabId, winIdx) {
  const tab = tabs.find((t) => t.id === tabId);
  if (!tab) return;

  tab.activeWinIdx = winIdx;
  const activeWin = tab.windows[winIdx];
  if (!activeWin) return;

  // Highlight active panel
  tab.windows.forEach((w) => {
    const p = document.getElementById(w.panelId);
    if (p) {
      p.classList.toggle("active", w.winIdx === winIdx);
      p.classList.toggle("active-single", w.winIdx === winIdx);
    }
  });

  if (activeWin.map) {
    setActiveMap(activeWin.map);
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

  if (callbacks.onWindowFocus) {
    callbacks.onWindowFocus(activeWin);
  }
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

  // Camera synchronization across windows in the same tab
  map.on("move", () => {
    const tab = tabs.find((t) => t.id === win.tabId);
    if (!tab || !tab.syncMap || isSyncingCamera) return;

    isSyncingCamera = true;
    const center = map.getCenter();
    const zoom = map.getZoom();
    const pitch = map.getPitch();
    const bearing = map.getBearing();

    tab.windows.forEach((otherWin) => {
      if (otherWin !== win && otherWin.map && otherWin.map.loaded()) {
        otherWin.map.jumpTo({ center, zoom, pitch, bearing });
      }
    });
    isSyncingCamera = false;
  });
}

function setupWindowControls(tab) {
  tab.windows.forEach((win) => {
    const presetSelect = document.getElementById(win.presetSelectId);
    const levelSelect = document.getElementById(win.levelSelectId);
    const maxBtn = document.getElementById(win.maxBtnId);

    if (presetSelect) {
      presetSelect.addEventListener("change", (e) => {
        const gid = e.target.value;
        const g = PRESET_GROUPS.find((grp) => grp.id === gid);
        if (g) {
          win.activeGroup = g;
          updateWindowTitle(win, g.name);
          focusWindow(win.tabId, win.winIdx);
          if (callbacks.onWindowGroupChange) {
            callbacks.onWindowGroupChange(win, g);
          }
        }
      });
    }

    if (levelSelect) {
      levelSelect.addEventListener("change", (e) => {
        const lvl = parseInt(e.target.value, 10);
        if (!isNaN(lvl)) {
          win.level = lvl;
          focusWindow(win.tabId, win.winIdx);
          if (callbacks.onWindowLevelChange) {
            callbacks.onWindowLevelChange(win, lvl);
          }
        }
      });
    }

    if (maxBtn) {
      maxBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        const panel = document.getElementById(win.panelId);
        if (panel) {
          panel.classList.toggle("maximized");
          maxBtn.textContent = panel.classList.contains("maximized") ? "🗗" : "⛶";
          setTimeout(() => {
            if (win.map) win.map.resize();
          }, 50);
        }
      });
    }
  });
}

export function updateWindowTitle(win, text) {
  const el = document.getElementById(win.titleId);
  if (el) el.textContent = text;
}

export function setWindowHeaderPreset(win, groupId) {
  const el = document.getElementById(win.presetSelectId);
  if (el) el.value = groupId || "";
}

export function setWindowHeaderLevel(win, level) {
  const el = document.getElementById(win.levelSelectId);
  if (el) el.value = String(level);
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

      updateWindowTitle(win, group?.name || `Window ${win.winIdx + 1}`);
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
