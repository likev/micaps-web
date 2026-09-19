// tabWindowManager.js - Multi-tab and Split Window Orchestrator (Facade)
import { setActiveWindowProvider } from "./timeline/timelineStore.js";
import {
  tabsState,
  getActiveTab,
  getActiveWindow,
  getWindowById,
  setCallbacks,
  getVisibleWindows,
  getNumVisible,
  isWindowVisible,
} from "./tabs/tabsStore.js";
import {
  renderTabsBar,
  updateLayoutButtons,
} from "./tabs/tabsBarView.js";
import {
  createPrimaryWorkspace,
  addTabWindow,
  setTabLayout,
  toggleTabsAndSplit,
} from "./tabs/windowPanels.js";
import {
  focusWindow,
  setWindowHeaderPreset,
  setWindowHeaderLevel,
  refreshPresetControls,
} from "./tabs/windowFocus.js";
import {
  computeFullWindowTitle,
  updateWindowTitle,
} from "./tabs/windowTitles.js";
import { syncTabCameras } from "./tabs/windowMaps.js";
import { reorderWindows, applySplitVisibility, enableWindowReorderDnD } from "./tabs/windowReorder.js";

export {
  getActiveTab,
  getActiveWindow,
  getWindowById,
  setTabLayout,
  toggleTabsAndSplit,
  focusWindow,
  computeFullWindowTitle,
  updateWindowTitle,
  setWindowHeaderPreset,
  setWindowHeaderLevel,
  refreshPresetControls,
  syncTabCameras,
  reorderWindows,
  applySplitVisibility,
  getVisibleWindows,
  getNumVisible,
  isWindowVisible,
};

export function initTabWindowManager(callbacksObj = {}) {
  setCallbacks(callbacksObj);
  setActiveWindowProvider(getActiveWindow);

  renderTabsBar({
    onAddTab: () => addTabWindow(),
    onSetLayout: (tabId, layout) => setTabLayout(tabId, layout),
    onSyncToggle: () => {
      const tab = getActiveTab();
      if (!tab) return;
      tab.syncMap = !tab.syncMap;
      updateLayoutButtons(tab.layout);
      if (tab.syncMap) {
        syncTabCameras(tab);
      }
    },
  });

  const firstTab = createPrimaryWorkspace();
  try { enableWindowReorderDnD(); } catch {}
  return firstTab;
}
