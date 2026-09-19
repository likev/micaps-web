// tabsStore.js - Tabs and Window State Storage
export const DEFAULT_LEVELS = [500, 850, 1000, 200, 700, 400, 300, 100];

export const tabsState = {
  tabs: [],
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
// Visible windows always include the active window so any tab-win can be
// shown in split-2 / split-4 by focusing it. Order is preserved; the grid
// packs visible panels in DOM order.
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
