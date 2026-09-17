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
