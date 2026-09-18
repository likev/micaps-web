import { PRESET_GROUPS, isDivider, renderPresetOptions } from "../../config/presets.js";
import { disarmAllContourReRenders } from "../../services/contourReRender.js";
import { cleanupWindLayer } from "../../layers/windLayer.js";
import { DEFAULT_LEVELS, tabsState, getActiveTab, getCallbacks } from "./tabsStore.js";
import { renderTabPillForWindow, updateLayoutButtons } from "./tabsBarView.js";
import { initWindowMap, syncTabCameras } from "./windowMaps.js";
import { focusWindow, setupWindowControlsForWin } from "./windowFocus.js";

export function createWindowPanel(tab, gridEl, wIdx) {
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
          ${renderPresetOptions(PRESET_GROUPS)}
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
  renderTabPillForWindow(tab, winObj, {
    onFocus: (tId, idx) => focusWindow(tId, idx),
    onClose: (t, idx) => closeWindowTab(t, idx),
  });

  return winObj;
}

export function createPrimaryWorkspace() {
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
  tabsState.tabs = [tab];
  tabsState.activeTabId = tabId;

  // Create initial 4 windows (representing Tabs 1-4 and Split 1-4)
  for (let wIdx = 0; wIdx < 4; wIdx++) {
    createWindowPanel(tab, gridEl, wIdx);
  }

  // Initialize Window 0 map immediately
  initWindowMap(tab.windows[0]);

  // Setup header controls for all 4 windows
  tab.windows.forEach((win) => setupWindowControlsForWin(tab, win, toggleTabsAndSplit));

  // Focus Window 0
  focusWindow(tabId, 0);

  updateLayoutButtons("1x1");

  return tab;
}

export function addTabWindow() {
  const tab = getActiveTab();
  if (!tab) return;
  const gridEl = document.getElementById(`windows-grid-${tab.id}`);
  if (!gridEl) return;

  let newIdx = tab.windows.length;
  // Ensure pill id uniqueness (post-reindex length is unique, but guard against stale DOM)
  while (document.getElementById(`tab-item-win-${newIdx}`)) newIdx++;
  const newWin = createWindowPanel(tab, gridEl, newIdx);
  setupWindowControlsForWin(tab, newWin, toggleTabsAndSplit);
  initWindowMap(newWin);
  const callbacks = getCallbacks();
  if (callbacks.onWindowInit) callbacks.onWindowInit(newWin);
  focusWindow(tab.id, newIdx);
}

export function closeWindowTab(tab, winIdx) {
  if (tab.windows.length <= 1) return;
  const win = tab.windows[winIdx];
  if (!win) return;

  if (win.map) {
    disarmAllContourReRenders(win.map, win);
    cleanupWindLayer(win.map);
    win.map.remove();
    win.map = null;
  }

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
  const tab = tabsState.tabs.find((t) => t.id === tabId) || getActiveTab();
  if (!tab) return;

  tab.layout = layout;
  const grid = document.getElementById(`windows-grid-${tab.id}`);
  if (grid) {
    grid.className = `windows-grid layout-${layout}`;
  }

  updateLayoutButtons(layout);

  const numVisible = layout === "1x1" ? 1 : (layout === "1x2" ? 2 : 4);
  const callbacks = getCallbacks();
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

  const visibleWins = tab.windows.slice(0, numVisible);

  const scheduleLayoutSync = () => {
    visibleWins.forEach((win) => {
      if (win.map) win.map.resize();
    });
    if (layout !== "1x1" && tab.syncMap) {
      syncTabCameras(tab);
    }
  };

  if (typeof requestAnimationFrame === "function") {
    requestAnimationFrame(scheduleLayoutSync);
  } else {
    setTimeout(scheduleLayoutSync, 20);
  }
}

export function toggleTabsAndSplit(tabId = tabsState.activeTabId) {
  const tab = tabsState.tabs.find((t) => t.id === tabId) || getActiveTab();
  if (!tab) return;
  const newLayout = tab.layout === "1x1" ? "2x2" : "1x1";
  setTabLayout(tab.id, newLayout);
}
