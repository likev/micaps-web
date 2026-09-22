// windowFocus.js - Window focus management, header controls, and timeline sync wiring
import { setActiveMap } from "../../map/mapInstance.js";
import { PRESET_GROUPS, isDivider } from "../../config/presets.js";
import { appState } from "../../store/appState.js";
import { tabsState, getActiveTab, getActiveWindow, getCallbacks } from "./tabsStore.js";
import { applySplitVisibility } from "./windowReorder.js";
import { updateWindowTitle } from "./windowTitles.js";
import { pausePlayback } from "../timeline/playbackController.js";
import { setTimelineMode, setTimeSliderVisible } from "../timeline/timeSliderView.js";
import { syncProfilePanelsForWindow } from "../../lib/services/profileVisibility.js";

function getPillElForWin(win) {
  if (!win) return null;
  try {
    if (win.pillId) {
      const el = document.getElementById(win.pillId);
      if (el) return el;
    }
    return document.getElementById(`tab-item-win-${win.winIdx}`);
  } catch { return null; }
}

export function focusWindow(tabId, winIdx) {
  const tab = tabsState.tabs.find((t) => t.id === tabId) || getActiveTab();
  if (!tab) return;

  const activeWin = tab.windows[winIdx];
  if (!activeWin) return;

  // Deactivate config editor tab if it was open
  const cfgPill = document.getElementById("tab-item-config");
  if (cfgPill) {
    cfgPill.classList.remove("active");
    cfgPill.setAttribute("aria-selected", "false");
  }
  const cfgPanel = document.getElementById("config-editor-panel");
  if (cfgPanel) {
    cfgPanel.style.display = "none";
  }

  // Ensure workspace container for this tab is marked active
  const ws = document.getElementById(`tab-workspace-${tab.id}`);
  if (ws && !ws.classList.contains("active")) {
    document.querySelectorAll(".tab-workspace").forEach((w) => w.classList.remove("active"));
    ws.classList.add("active");
  }

  const pillEl = getPillElForWin(activeWin);
  const panelEl = document.getElementById(activeWin.panelId);

  // Avoid redundant work when already focused, but still re-assert
  // visibility: the active slot can be hidden after config close or
  // mid-reorder (F4). applySplitVisibility is cheap (idempotent class
  // toggles + rAF resize).
  const alreadyFocused =
    tab.activeWinIdx === winIdx &&
    tab.windows[tab.activeWinIdx]?.id === activeWin.id &&
    panelEl?.classList.contains("active") &&
    pillEl?.classList.contains("active") &&
    ws?.classList.contains("active");
  if (alreadyFocused) {
    try { applySplitVisibility(tab); } catch {}
    if (activeWin.map) setActiveMap(activeWin.map);
    return;
  }

  tab.activeWinIdx = winIdx;

  // Highlight active panel and tab item (stable ids; winIdx is positional)
  tab.windows.forEach((w, idx) => {
    const isActive = idx === winIdx;
    const p = document.getElementById(w.panelId);
    if (p) {
      p.classList.toggle("active", isActive);
      p.classList.toggle("active-single", isActive);
    }
    const pill = getPillElForWin(w);
    if (pill) {
      pill.classList.toggle("active", isActive);
      pill.setAttribute("aria-selected", isActive ? "true" : "false");
    }
  });

  // Focusing a hidden win in split mode must bring it on screen. Map init
  // + onWindowInit owned by applySplitVisibility; here only assert the
  // active map.
  try { applySplitVisibility(tab); } catch {}

  if (activeWin.map) {
    try { setActiveMap(activeWin.map); } catch {}
  }

  const callbacks = getCallbacks();

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

  const isTimeHeight = Boolean(
    activeWin.activeGroup?.id === "composite-ec-timeheight" ||
    activeWin.activeGroup?.layers?.some((l) => l.type === "timeheight" || l.id === "ec-timeheight-diagram") ||
    activeWin.layers?.some((l) => l.type === "timeheight" || l.id === "ec-timeheight-diagram")
  );

  const isHovmoller = Boolean(
    activeWin.activeGroup?.id === "composite-ec-hovmoller" ||
    activeWin.activeGroup?.layers?.some((l) => l.type === "hovmoller" || l.id === "ec-hovmoller-diagram") ||
    activeWin.layers?.some((l) => l.type === "hovmoller" || l.id === "ec-hovmoller-diagram")
  );

  if (isTimeHeight || isHovmoller) {
    try { setTimeSliderVisible(false); } catch {}
  } else {
    try { setTimeSliderVisible(true); } catch {}
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
  }

  // Auto hide/show floating profile panels (T-LogP, Time-Height, Line-Height,
  // Time-Line) so toggling window tabs swaps diagrams instead of sticking.
  try { syncProfilePanelsForWindow(activeWin, activeWin.map || null); } catch {}

  callbacks.onWindowFocus?.(activeWin);
}

export function setupWindowControlsForWin(tab, win, onToggleTabsAndSplit) {
  const maxBtn = document.getElementById(win.maxBtnId);

  const header = document.getElementById(win.headerId);
  if (header) {
    header.addEventListener("dblclick", (e) => {
      if (e.target.tagName === "BUTTON") return;
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
  return;
}

export function setWindowHeaderLevel(win, level) {
  return;
}

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
