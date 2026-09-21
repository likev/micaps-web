import {
  tabsState as coreTabsState,
  DEFAULT_LEVELS,
  getNumVisible,
  getVisibleWindows,
  isWindowVisible,
  getCallbacks,
  setCallbacks,
  getSyncingTabs,
} from "./tabsCore.js";
import { setDefaultWinResolver } from "./legendCore.js";

export const tabsState = $state(coreTabsState);

// MapLibre map handles kept outside $state to prevent reactive proxy loops
export const mapInstances = new Map();

export function getActiveTab() {
  return tabsState.tabs.find((t) => t.id === tabsState.activeTabId) || tabsState.tabs[0] || null;
}

export function getActiveWindow() {
  const tab = getActiveTab();
  if (!tab || !tab.windows) return null;
  return tab.windows[tab.activeWinIdx] || tab.windows[0] || null;
}

export function getWindowById(winId) {
  if (!winId) return null;
  for (const tab of tabsState.tabs) {
    const found = tab.windows?.find((w) => w.id === winId);
    if (found) return found;
  }
  return null;
}

// Wire live window resolver for legend prefix
setDefaultWinResolver(getWindowById);

export function getMapInstance(winId) {
  return mapInstances.get(winId) || null;
}

export function setMapInstance(winId, map) {
  if (map) {
    mapInstances.set(winId, map);
  } else {
    mapInstances.delete(winId);
  }
}

export {
  DEFAULT_LEVELS,
  getNumVisible,
  getVisibleWindows,
  isWindowVisible,
  getCallbacks,
  setCallbacks,
  getSyncingTabs,
};
