// windowFocus.js - Window focus helpers (Svelte-era slim remainder).
//
// Focus switching itself lives in App.svelte handleWindowFocus (reactive);
// the legacy imperative focusWindow/pill/header-control machine was removed
// with the legacy tab boot. What remains is preset refresh, which live
// services still call after configuration reloads.
import { PRESET_GROUPS, isDivider } from "../../config/presets.js";
import { appState } from "../../store/appState.js";
import { tabsState, getActiveTab, getActiveWindow, getCallbacks } from "./tabsStore.js";
import { updateWindowTitle } from "./windowTitles.js";

export function refreshPresetControls() {
  if (typeof document === "undefined") return;
  tabsState.tabs.forEach((tab) => {
    tab.windows.forEach((win) => {
      const currentGroupId = win.activeGroup?.id;
      const group = PRESET_GROUPS.find((candidate) => !isDivider(candidate) && candidate.id === currentGroupId) || null;
      try {
        win.activeGroup = group
          ? (typeof structuredClone === "function" ? structuredClone(group) : JSON.parse(JSON.stringify(group)))
          : group;
      } catch {
        win.activeGroup = group;
      }

      updateWindowTitle(win, group ? group.name : "");
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
    getCallbacks().onWindowFocus?.(activeWin);
  }
}
