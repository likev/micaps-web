// tabWindowManager.js - Window state facade (Svelte-era slim remainder).
//
// Window/tab boot, focus switching, layout, and drag-reorder now live in
// App.svelte + lib/stores (reactive). The legacy imperative boot machine
// (initTabWindowManager/focusWindow/panels/tabs-bar/reorder) was removed.
// This facade keeps the state/query/title entry points live services use.
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
import { refreshPresetControls } from "./tabs/windowFocus.js";
import {
  computeFullWindowTitle,
  updateWindowTitle,
} from "./tabs/windowTitles.js";

export {
  getActiveTab,
  getActiveWindow,
  getWindowById,
  setCallbacks,
  computeFullWindowTitle,
  updateWindowTitle,
  refreshPresetControls,
  getVisibleWindows,
  getNumVisible,
  isWindowVisible,
};

export { tabsState };
