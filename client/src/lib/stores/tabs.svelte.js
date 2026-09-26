import {
  tabsState as coreTabsState,
  DEFAULT_LEVELS,
  DEFAULT_MODELS,
  stepCycleHours,
  applyAutoAllocation,
  revertAutoAllocation,
  isModelLayerSupported,
  getEligibleModelsForAllocation,
  getEligibleModelsForAllocationAsync,
  queryModelSupportedLevels,
  preloadModelLevels,
  setModelLevelsCache,
  modelLevelsRuntimeCache,
  getNumVisible,
  getVisibleWindows,
  isWindowVisible,
  getCallbacks,
  setCallbacks,
  getSyncingTabs,
  mapInstances as coreMapInstances,
  getMapInstance as coreGetMapInstance,
  setMapInstance as coreSetMapInstance,
} from "./tabsCore.js";
import { setDefaultWinResolver } from "./legendCore.js";
import { setDefaultTabResolver } from "../../ui/tabs/windowTitles.js";

export const tabsState = $state(coreTabsState);

// MapLibre map handles kept outside $state to prevent reactive proxy loops.
// MUST reuse the core registry instance (no `new Map()` fork): windowMaps.js
// reads the core registry in plain-JS tests and production, while App and
// mapViewport write through this module. A forked Map would make writes
// invisible to sync reads, silently breaking split-view camera sync.
export const mapInstances = coreMapInstances;

export function getActiveTab() {
  return tabsState.tabs.find((t) => t.id === tabsState.activeTabId) || tabsState.tabs[0] || null;
}

export function getTabForWindow(win) {
  if (!win) return getActiveTab();
  if (win.tabId) {
    const found = tabsState.tabs.find((t) => t.id === win.tabId);
    if (found) return found;
  }
  for (const tab of tabsState.tabs) {
    if (tab.windows?.some((w) => w === win || (w && win.id && w.id === win.id))) {
      return tab;
    }
  }
  return getActiveTab();
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
// Wire live tab resolver for window titles and model-alloc headers
setDefaultTabResolver(getTabForWindow);

export function getMapInstance(winId) {
  return coreGetMapInstance(winId);
}

export function setMapInstance(winId, map) {
  coreSetMapInstance(winId, map);
}

export {
  DEFAULT_LEVELS,
  DEFAULT_MODELS,
  stepCycleHours,
  getNumVisible,
  getVisibleWindows,
  isWindowVisible,
  getCallbacks,
  setCallbacks,
  getSyncingTabs,
  applyAutoAllocation,
  revertAutoAllocation,
  isModelLayerSupported,
  getEligibleModelsForAllocation,
  getEligibleModelsForAllocationAsync,
  queryModelSupportedLevels,
  preloadModelLevels,
  setModelLevelsCache,
  modelLevelsRuntimeCache,
};
