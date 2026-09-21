import { disarmAllContourReRenders } from "../../services/contourReRender.js";
import { cleanupWindLayer } from "../../layers/windLayer.js";
import { DEFAULT_LEVELS, tabsState, getActiveTab } from "./tabsStore.js";
import { renderTabPillForWindow, updateLayoutButtons } from "./tabsBarView.js";
import { focusWindow, setupWindowControlsForWin } from "./windowFocus.js";
import { reindexWindowPositions, applySplitVisibility, reorderWindows } from "./windowReorder.js";

export { reorderWindows };

export function createWindowPanel(tab, gridEl) {
  const tabId = tab.id;
  if (tab._nextWinSeq == null) tab._nextWinSeq = tab.windows.length;
  const uid = tab._nextWinSeq++;
  const posIdx = tab.windows.length;
  const winObj = {
    tabId,
    uid,
    winIdx: posIdx,
    id: `tab-${tabId}-win-${uid}`,
    panelId: `win-panel-${tabId}-${uid}`,
    headerId: `win-header-${tabId}-${uid}`,
    badgeId: `win-badge-${tabId}-${uid}`,
    titleId: `win-title-${tabId}-${uid}`,
    maxBtnId: `win-max-${tabId}-${uid}`,
    pillId: `tab-item-win-${uid}`,
    labelId: `tab-label-${uid}`,
    closeBtnId: `tab-close-${uid}`,
    domId: `map-viewport-${tabId}-${uid}`,
    map: null,
    activeGroup: null,
    level: DEFAULT_LEVELS[posIdx] || 500,
    period: 24,
    model: null,
    element: null,
    isObservation: false,
    obsTime: null,
  };

  const panelEl = document.createElement("div");
  panelEl.className = `window-panel ${posIdx === tab.activeWinIdx ? "active active-single" : ""}`;
  panelEl.id = winObj.panelId;
  panelEl.dataset.tabId = String(tabId);
  panelEl.dataset.winIdx = String(posIdx);
  panelEl.dataset.uid = String(uid);

  panelEl.innerHTML = `
    <div class="win-header" id="${winObj.headerId}" draggable="true" title="Drag to rearrange windows">
      <div class="win-title-group">
        <span class="win-badge" id="${winObj.badgeId}">W${posIdx + 1}</span>
        <span class="win-title" id="${winObj.titleId}"></span>
      </div>
      <div class="win-actions">
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
  tab._nextWinSeq = 0;
  for (let wIdx = 0; wIdx < 4; wIdx++) {
    createWindowPanel(tab, gridEl);
  }

  // Setup header controls for all 4 windows
  tab.windows.forEach((win) => setupWindowControlsForWin(tab, win, toggleTabsAndSplit));

  // Focus Window 0 (map init + onWindowInit owned by applySplitVisibility
  // inside focusWindow).
  focusWindow(tabId, 0);

  updateLayoutButtons("1x1");

  return tab;
}

export function addTabWindow() {
  const tab = getActiveTab();
  if (!tab) return;
  const gridEl = document.getElementById(`windows-grid-${tab.id}`);
  if (!gridEl) return;

  const newWin = createWindowPanel(tab, gridEl);
  setupWindowControlsForWin(tab, newWin, toggleTabsAndSplit);
  // Map init + visibility owned by focusWindow -> applySplitVisibility.
  focusWindow(tab.id, newWin.winIdx);
}

export function closeWindowTab(tab, winIdx) {
  if (tab.windows.length <= 1) return;
  const win = tab.windows[winIdx];
  if (!win) return;

  const wasActive = winIdx === tab.activeWinIdx;
  const activeBeforeClose = tab.windows[tab.activeWinIdx] || null;

  if (win.map) {
    disarmAllContourReRenders(win.map, win);
    cleanupWindLayer(win.map);
    win.map.remove();
    win.map = null;
  }

  // Stable ids: simply remove this window's own panel + pill. Remaining
  // windows keep their ids (and layers/legends/maps stay bound); only the
  // positional winIdx / badges / labels are refreshed.
  try { document.getElementById(win.panelId)?.remove(); } catch {}
  try { document.getElementById(win.pillId || `tab-item-win-${win.winIdx}`)?.remove(); } catch {}

  tab.windows.splice(winIdx, 1);
  reindexWindowPositions(tab, wasActive ? null : activeBeforeClose);
  applySplitVisibility(tab);

  // Closing a background tab must not steal focus (F1). Only refocus when
  // the closed tab was active; otherwise the preserved active object stays.
  if (wasActive) {
    const nextIdx = Math.max(0, Math.min(winIdx, tab.windows.length - 1));
    focusWindow(tab.id, nextIdx);
  }
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

  // Visibility always includes the active window, so focusing Tab 3 then
  // entering 1x2 (or Tab 5 then 2x2) keeps it on screen. Order is unchanged
  // unless the user drags to rearrange. Map init owned by applySplitVisibility.
  applySplitVisibility(tab);

  focusWindow(tab.id, tab.activeWinIdx);
}

export function toggleTabsAndSplit(tabId = tabsState.activeTabId) {
  const tab = tabsState.tabs.find((t) => t.id === tabId) || getActiveTab();
  if (!tab) return;
  const newLayout = tab.layout === "1x1" ? "2x2" : "1x1";
  setTabLayout(tab.id, newLayout);
}
