// windowFocus.js - Window focus management, header controls, and timeline sync wiring
import { setActiveMap } from "../../map/mapInstance.js";
import { PRESET_GROUPS } from "../../config/presets.js";
import { appState } from "../../store/appState.js";
import { tabsState, getActiveTab, getActiveWindow, getCallbacks } from "./tabsStore.js";
import { initWindowMap } from "./windowMaps.js";
import { updateWindowTitle } from "./windowTitles.js";
import { pausePlayback } from "../timeline/playbackController.js";
import { setTimelineMode } from "../timeline/timeSliderView.js";

export function focusWindow(tabId, winIdx) {
  const tab = tabsState.tabs.find((t) => t.id === tabId) || getActiveTab();
  if (!tab) return;

  const activeWin = tab.windows[winIdx];
  if (!activeWin) return;

  // Ensure workspace container for this tab is marked active
  const ws = document.getElementById(`tab-workspace-${tab.id}`);
  if (ws && !ws.classList.contains("active")) {
    document.querySelectorAll(".tab-workspace").forEach((w) => w.classList.remove("active"));
    ws.classList.add("active");
  }

  const pillEl = document.getElementById(`tab-item-win-${activeWin.winIdx}`);
  const panelEl = document.getElementById(activeWin.panelId);

  // Avoid redundant work when already focused
  const alreadyFocused =
    tab.activeWinIdx === winIdx &&
    tab.windows[tab.activeWinIdx]?.id === activeWin.id &&
    panelEl?.classList.contains("active") &&
    pillEl?.classList.contains("active") &&
    ws?.classList.contains("active");
  if (alreadyFocused) {
    if (activeWin.map) setActiveMap(activeWin.map);
    return;
  }

  tab.activeWinIdx = winIdx;

  // Highlight active panel and tab item (lookup by w.winIdx after reindex)
  tab.windows.forEach((w) => {
    const p = document.getElementById(w.panelId);
    if (p) {
      p.classList.toggle("active", w.winIdx === winIdx);
      p.classList.toggle("active-single", w.winIdx === winIdx);
    }
    const pill = document.getElementById(`tab-item-win-${w.winIdx}`);
    if (pill) {
      pill.classList.toggle("active", w.winIdx === winIdx);
      pill.setAttribute("aria-selected", w.winIdx === winIdx ? "true" : "false");
    }
  });

  const callbacks = getCallbacks();
  if (!activeWin.map) {
    initWindowMap(activeWin);
    callbacks.onWindowInit?.(activeWin);
  } else {
    setActiveMap(activeWin.map);
  }

  appState.set("activeWinId", activeWin.id);
  appState.update({
    activeGroup: activeWin.activeGroup,
    level: activeWin.level,
    period: activeWin.period,
    model: activeWin.model,
    element: activeWin.element,
    obsTime: activeWin.obsTime,
    isObservation: activeWin.isObservation,
  });

  // Pause any running playback when switching windows (L1)
  try { pausePlayback(); } catch {}

  // Apply pending or cached observation timeline for active window
  if (activeWin._pendingTimeline) {
    const pt = activeWin._pendingTimeline;
    if (activeWin.obsTime) pt.file = activeWin.obsTime;
    delete activeWin._pendingTimeline;
    try { setTimelineMode("obs", pt); } catch {}
  } else if (activeWin.isObservation && activeWin._obsTimeline) {
    const ot = activeWin._obsTimeline;
    if (activeWin.obsTime) ot.file = activeWin.obsTime;
    try { setTimelineMode("obs", ot); } catch {}
  }

  // Apply pending or cached NWP timeline for active window
  if (activeWin._pendingNwp) {
    const pn = activeWin._pendingNwp;
    if (activeWin.period !== undefined) pn.period = activeWin.period;
    delete activeWin._pendingNwp;
    try { setTimelineMode("nwp", pn); } catch {}
  } else if (!activeWin.isObservation && activeWin._nwpTimeline) {
    const nt = activeWin._nwpTimeline;
    if (activeWin.period !== undefined) nt.period = activeWin.period;
    try { setTimelineMode("nwp", nt); } catch {}
  }

  callbacks.onWindowFocus?.(activeWin);
}

export function setupWindowControlsForWin(tab, win, onToggleTabsAndSplit) {
  const callbacks = getCallbacks();
  const presetSelect = document.getElementById(win.presetSelectId);
  const levelSelect = document.getElementById(win.levelSelectId);
  const maxBtn = document.getElementById(win.maxBtnId);

  if (presetSelect) {
    presetSelect.addEventListener("change", (e) => {
      const gid = e.target.value;
      const g = PRESET_GROUPS.find((grp) => grp.id === gid) || null;
      if (callbacks.onWindowGroupChange && g) {
        callbacks.onWindowGroupChange(win, g);
      } else {
        win.activeGroup = g;
        updateWindowTitle(win, g ? g.name : "");
      }
      focusWindow(win.tabId, win.winIdx);
    });
  }

  if (levelSelect) {
    levelSelect.addEventListener("change", (e) => {
      const lvl = parseInt(e.target.value, 10);
      if (!isNaN(lvl)) {
        win.level = lvl;
        if (callbacks.onWindowLevelChange) {
          callbacks.onWindowLevelChange(win, lvl);
        }
        focusWindow(win.tabId, win.winIdx);
      }
    });
  }

  const header = document.getElementById(win.headerId);
  if (header) {
    header.addEventListener("dblclick", (e) => {
      if (e.target.tagName === "SELECT" || e.target.tagName === "BUTTON") return;
      focusWindow(win.tabId, win.winIdx);
      onToggleTabsAndSplit?.(win.tabId);
    });
  }

  if (maxBtn) {
    maxBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      focusWindow(win.tabId, win.winIdx);
      onToggleTabsAndSplit?.(win.tabId);
    });
  }
}

export function setWindowHeaderPreset(win, groupId) {
  if (!win || typeof document === "undefined") return;
  const el = document.getElementById(win.presetSelectId);
  if (el) el.value = groupId || "";
}

export function setWindowHeaderLevel(win, level) {
  if (!win || typeof document === "undefined") return;
  const el = document.getElementById(win.levelSelectId);
  if (el) {
    if (level == null || level === "") el.value = "";
    else el.value = String(level);
  }
}

export function refreshPresetControls() {
  if (typeof document === "undefined") return;
  tabsState.tabs.forEach((tab) => {
    tab.windows.forEach((win) => {
      const currentGroupId = win.activeGroup?.id;
      const group = PRESET_GROUPS.find((candidate) => candidate.id === currentGroupId) || null;
      win.activeGroup = group;

      const select = document.getElementById(win.presetSelectId);
      if (select) {
        select.innerHTML = `
          <option value="">-- Group --</option>
          ${PRESET_GROUPS.map((g) => `<option value="${g.id}">${g.name}</option>`).join("")}
        `;
        select.value = group?.id || "";
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
