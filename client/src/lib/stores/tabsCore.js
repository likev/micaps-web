// tabsCore.js - Plain-core tab and window state storage & visibility helpers
export const DEFAULT_LEVELS = [500, 850, 1000, 200, 700, 400, 300, 100];

export function createDefaultWindow(winIdx = 0, tabId = 1) {
  return {
    tabId,
    uid: winIdx,
    winIdx,
    id: `tab-${tabId}-win-${winIdx}`,
    title: "",
    level: 500,
    period: 24,
    model: null,
    element: null,
    isObservation: false,
    obsTime: null,
    activeGroup: null,
    // v1.1.0: no step default on fresh windows — the mode decides on load
    // (upper-air 12h, surface 3h, NWP 6h). A hardcoded 6 here would stick and
    // override the upper-air 12h default with a "valid" 6h.
    stepLength: null,
  };
}

export function createDefaultTab(id = 1) {
  return {
    id,
    title: `Workstation ${id}`,
    layout: "1x1",
    syncMap: true,
    activeWinIdx: 0,
    _nextWinSeq: 1,
    windows: [createDefaultWindow(0, id)],
  };
}

export const tabsState = {
  tabs: [createDefaultTab(1)],
  activeTabId: 1,
  callbacks: {},
  syncingTabs: new Set(),
};

export function getTabs() {
  return tabsState.tabs;
}

export function setTabs(tabs) {
  tabsState.tabs = tabs;
}

export function getActiveTabId() {
  return tabsState.activeTabId;
}

export function setActiveTabId(id) {
  tabsState.activeTabId = id;
}

export function getCallbacks() {
  return tabsState.callbacks;
}

export function setCallbacks(c) {
  tabsState.callbacks = c || {};
}

export function getSyncingTabs() {
  return tabsState.syncingTabs;
}

export function getActiveTab() {
  return tabsState.tabs.find((t) => t.id === tabsState.activeTabId) || tabsState.tabs[0];
}

export function getActiveWindow() {
  const tab = getActiveTab();
  if (!tab) return null;
  return tab.windows[tab.activeWinIdx] || tab.windows[0];
}

export function getWindowById(winId) {
  if (!winId) return null;
  for (const tab of tabsState.tabs) {
    const found = tab.windows?.find((w) => w.id === winId);
    if (found) return found;
  }
  return null;
}

// ── Split visibility helpers (pure, no DOM) ───────────────────────────────
export function getNumVisible(layout) {
  if (layout === "1x2") return 2;
  if (layout === "2x2") return 4;
  return 1;
}

export function getVisibleWindows(tab) {
  if (!tab || !Array.isArray(tab.windows) || tab.windows.length === 0) return [];
  const numVisible = getNumVisible(tab.layout);
  if (tab.layout === "1x1") {
    const active = tab.windows[tab.activeWinIdx] || tab.windows[0];
    return active ? [active] : [];
  }
  if (tab.windows.length <= numVisible) return [...tab.windows];
  const active = tab.windows[tab.activeWinIdx] || tab.windows[0];
  if (!active) return tab.windows.slice(0, numVisible);
  const activePos = tab.windows.indexOf(active);
  if (activePos >= 0 && activePos < numVisible) {
    return tab.windows.slice(0, numVisible);
  }
  // Active outside first N: keep active visible + first N-1 others in order.
  const others = tab.windows.filter((w) => w !== active).slice(0, numVisible - 1);
  return [active, ...others];
}

export function isWindowVisible(tab, win) {
  if (!tab || !win) return false;
  if (tab.layout === "1x1") {
    return tab.windows[tab.activeWinIdx] === win;
  }
  return getVisibleWindows(tab).includes(win);
}
