import { getPeriodsForStep } from "./timelineMath.js";
export const DEFAULT_LEVELS = [500, 850, 1000, 200, 700, 925, 400, 300, 100];

export const DEFAULT_MODELS = [
  "ECMWF_HR",
  "GRAPES_GFS",
  "BEIJING_MR",
  "GRAPES_3KM",
  "JAPAN_MR",
  "SHANGHAI_MR",
  "NCEP_GFS",
  "GERMAN_HR",
];

export function stepCycleHours(cycleStr, deltaHours) {
  if (!cycleStr || typeof cycleStr !== "string") return cycleStr;
  const dotIdx = cycleStr.indexOf(".");
  const raw = dotIdx !== -1 ? cycleStr.slice(0, dotIdx) : cycleStr;
  if (raw.length < 8) return cycleStr;

  let year, month, day, hour, tail = "", is4DigitYear = false;
  if (raw.length >= 10 && (raw.startsWith("19") || raw.startsWith("20"))) {
    is4DigitYear = true;
    year = parseInt(raw.slice(0, 4), 10);
    month = parseInt(raw.slice(4, 6), 10) - 1;
    day = parseInt(raw.slice(6, 8), 10);
    hour = parseInt(raw.slice(8, 10), 10);
    tail = raw.slice(10);
  } else if (raw.length === 8) {
    const yy = parseInt(raw.slice(0, 2), 10);
    year = yy < 70 ? 2000 + yy : 1900 + yy;
    month = parseInt(raw.slice(2, 4), 10) - 1;
    day = parseInt(raw.slice(4, 6), 10);
    hour = parseInt(raw.slice(6, 8), 10);
  } else {
    return cycleStr;
  }

  if (isNaN(year) || isNaN(month) || isNaN(day) || isNaN(hour)) return cycleStr;
  const d = new Date(Date.UTC(year, month, day, hour + deltaHours));
  if (isNaN(d.getTime())) return cycleStr;

  const pad = (n) => String(n).padStart(2, "0");
  const outYYYY = String(d.getUTCFullYear());
  const outMM = pad(d.getUTCMonth() + 1);
  const outDD = pad(d.getUTCDate());
  const outHH = pad(d.getUTCHours());

  if (is4DigitYear) {
    return `${outYYYY}${outMM}${outDD}${outHH}${tail}`;
  }
  return `${outYYYY.slice(-2)}${outMM}${outDD}${outHH}`;
}

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
    autoAllocation: "none",
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

// ── Shared MapLibre instance registry (plain, never reactive) ─────────────
// Map handles must never live inside Svelte $state: the proxy would wrap
// MapLibre Map methods and break `this`, plus cause reactive loops.
// This registry is the single source of truth for live maps. tabs.svelte.js
// re-exports this SAME Map instance (no `new Map()` fork) so App/mapViewport
// writes are visible to windowMaps sync reads even though tab state itself
// is forked between core (plain) and svelte (proxy).
export const mapInstances = new Map();

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

// ── Split visibility helpers (pure, no DOM) ───────────────────────────────
export function getNumVisible(layout) {
  if (layout === "1x2") return 2;
  if (layout === "2x2") return 4;
  // 3x2 reserved for future (portrait/vertical-monitor layout); UI currently only creates 2x3.
  if (layout === "2x3" || layout === "3x2") return 6;
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

export function applyAutoAllocation(tab, mode = "level", baseWin = null) {
  if (!tab || !Array.isArray(tab.windows)) return;
  tab.autoAllocation = mode;
  if (mode === "none") {
    revertAutoAllocation(tab, baseWin);
    return;
  }
  const visible = getVisibleWindows(tab);
  const win0 = (baseWin && typeof baseWin === "object" && baseWin.activeGroup)
    ? baseWin
    : (tab.windows.find((w) => w && w.activeGroup) || (baseWin && typeof baseWin === "object" ? baseWin : null) || tab.windows[tab.activeWinIdx] || tab.windows[0] || {});
  const baseLevel = win0.level ?? 500;
  const baseModel = win0.model || tab.windows[tab.activeWinIdx]?.model || tab.windows[0]?.model || "ECMWF_HR";
  const baseElement = win0.element || "TMP";
  const basePeriod = win0.period ?? 24;
  const baseCycle = win0.forecastCycle || "26092608";
  const isObs = Boolean(win0.isObservation || win0.activeGroup?.isObservation || tab.windows.some((w) => w.isObservation));
  const isSurface = baseModel === "SURFACE" || baseModel === "SURFACE_PLOT" || (typeof win0.element === "string" && win0.element.toLowerCase().includes("surface")) || win0.activeGroup?.id?.toLowerCase().includes("surface");
  let baseObsTime = win0.obsTime || tab.windows.find((w) => w.obsTime)?.obsTime || "26092608";
  const defaultStep = isObs ? (isSurface ? 3 : 12) : 6;
  const stepLen = win0.stepLength || defaultStep;

  for (let i = 0; i < visible.length; i++) {
    const win = visible[i];
    win.element = baseElement;
    win.isObservation = isObs;
    win.stepLength = stepLen;
    if (win0.activeGroup && (!win.activeGroup || win !== win0)) {
      try {
        win.activeGroup = JSON.parse(JSON.stringify(win0.activeGroup));
      } catch {
        win.activeGroup = win0.activeGroup;
      }
    }
    if (mode === "level") {
      win.level = DEFAULT_LEVELS[i] ?? 500;
      win.model = baseModel;
      win.period = basePeriod;
      win.forecastCycle = baseCycle;
      win.obsTime = baseObsTime;
    } else if (mode === "model") {
      win.model = DEFAULT_MODELS[i % DEFAULT_MODELS.length];
      win.level = baseLevel;
      win.period = basePeriod;
      win.forecastCycle = baseCycle;
      win.obsTime = baseObsTime;
    } else if (mode === "step") {
      win.model = baseModel;
      win.level = baseLevel;
      win.forecastCycle = baseCycle;
      if (isObs) {
        const stepped = stepCycleHours(baseObsTime, -i * stepLen);
        win.obsTime = (typeof baseObsTime === "string" && baseObsTime.endsWith(".000") && !stepped.endsWith(".000"))
          ? `${stepped}.000`
          : stepped;
        if (win._obsTimeline) win._obsTimeline.file = win.obsTime;
      } else {
        const periods = (Array.isArray(win0.discretePeriods) && win0.discretePeriods.length > 0)
          ? win0.discretePeriods
          : getPeriodsForStep(stepLen);
        win.discretePeriods = Array.isArray(periods) ? [...periods] : periods;
        const baseIdx = periods.indexOf(basePeriod);
        if (baseIdx !== -1 && baseIdx + i < periods.length) {
          win.period = periods[baseIdx + i];
        } else {
          win.period = basePeriod + i * stepLen;
        }
      }
    } else if (mode === "time") {
      win.model = baseModel;
      win.level = baseLevel;
      if (isObs) {
        const stepped = stepCycleHours(baseObsTime, -i * stepLen);
        win.obsTime = (typeof baseObsTime === "string" && baseObsTime.endsWith(".000") && !stepped.endsWith(".000"))
          ? `${stepped}.000`
          : stepped;
        if (win._obsTimeline) win._obsTimeline.file = win.obsTime;
      } else {
        const cycles = Array.isArray(win0.forecastCycles) && win0.forecastCycles.length > 0
          ? win0.forecastCycles
          : null;
        const cycleStep = (win0.model === "ECMWF_HR" && win0.stepLength === 6) ? 12 : (win0.stepLength || 12);
        if (cycles && i < cycles.length) {
          win.forecastCycle = cycles[i];
          win.period = basePeriod + i * 12;
        } else {
          win.forecastCycle = stepCycleHours(baseCycle, -i * cycleStep);
          win.period = basePeriod + i * cycleStep;
        }
      }
    }
  }
}

/**
 * Reverts auto-allocation across visible windows to 'none'.
 * @param {Object} tab - The tab state.
 * @param {Object|number|null} baseWin - Target baseline: window object (unifies level, model,
 *   period, cycle) or numeric level (unifies vertical level while retaining window's model/period).
 */
export function revertAutoAllocation(tab, baseWin = null) {
  if (!tab || !Array.isArray(tab.windows)) return;
  tab.autoAllocation = "none";
  const visible = getVisibleWindows(tab);
  const win0 = (baseWin && typeof baseWin === "object" && baseWin.activeGroup)
    ? baseWin
    : (tab.windows.find((w) => w && w.activeGroup) || (baseWin && typeof baseWin === "object" ? baseWin : null) || tab.windows[tab.activeWinIdx] || tab.windows[0] || {});
  const baseLevel = typeof baseWin === "number" ? baseWin : (win0.level ?? 500);
  const baseModel = win0.model || "ECMWF_HR";
  const baseElement = win0.element || "TMP";
  const basePeriod = win0.period ?? 24;
  const baseCycle = win0.forecastCycle || "26092608";
  const isObs = Boolean(win0.isObservation || win0.activeGroup?.isObservation);
  let baseObsTime = win0.obsTime || null;

  for (let i = 0; i < visible.length; i++) {
    const win = visible[i];
    win.level = baseLevel;
    win.model = baseModel;
    win.element = baseElement;
    win.period = basePeriod;
    const isSurface = win0.model === "SURFACE" || win0.model === "SURFACE_PLOT" || (typeof win0.element === "string" && win0.element.toLowerCase().includes("surface")) || win0.activeGroup?.id?.toLowerCase().includes("surface");
    win.isObservation = isObs;
    if (baseCycle) win.forecastCycle = baseCycle;
    if (baseObsTime) win.obsTime = baseObsTime;
    win.stepLength = win0.stepLength || (isObs ? (isSurface ? 3 : 12) : 6);
    if (win0.activeGroup && (!win.activeGroup || win !== win0)) {
      try {
        win.activeGroup = JSON.parse(JSON.stringify(win0.activeGroup));
      } catch {
        win.activeGroup = win0.activeGroup;
      }
    }
  }
}

