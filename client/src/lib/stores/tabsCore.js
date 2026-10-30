import { getPeriodsForStep } from "./timelineMath.js";
import { fetchLevels } from "../../api/catalogApi.js";
import {
  getRainAccumulationHours,
  getRainAccumulationHoursForWindow,
} from "../../utils/rain12.js";
export const DEFAULT_LEVELS = [500, 850, 1000, 200, 700, 925, 400, 300, 100];
export const DEFAULT_SATELLITE_LEVELS = [12, 9, 8, 2, 1, 13, 7, 3, 10, 11, 14, 15, 4, 5, 6];

export function isSatelliteEntity(winOrGroup) {
  if (!winOrGroup) return false;
  if (winOrGroup.model === "SATELLITE") return true;
  if (winOrGroup.activeGroup?.model === "SATELLITE") return true;
  if (/FY4B|FY-4B|FY2G|FY-2G|SATELLITE/i.test(String(winOrGroup.id || winOrGroup.activeGroup?.id || winOrGroup.category || winOrGroup.name || ""))) return true;
  const layers = Array.isArray(winOrGroup.layers) ? winOrGroup.layers : (Array.isArray(winOrGroup.activeGroup?.layers) ? winOrGroup.activeGroup.layers : []);
  return layers.some((l) => l?.model === "SATELLITE" || l?.type === "image" || /FY4B|FY2G|SATELLITE/i.test(String(l?.path || l?.element || l?.id || "")));
}

export function isMultiChannelSatellite(winOrGroup) {
  if (!winOrGroup) return false;
  if (!isSatelliteEntity(winOrGroup)) return false;
  if (/AMV/i.test(String(winOrGroup.id || winOrGroup.activeGroup?.id || winOrGroup.element || ""))) return false;
  const levels = winOrGroup.activeGroup?.levels || winOrGroup.levels;
  if (Array.isArray(levels) && levels.length > 0) {
    return levels.every((lvl) => typeof lvl === "number" && lvl >= 1 && lvl <= 36);
  }
  if (typeof winOrGroup.level === "number" && winOrGroup.level >= 1 && winOrGroup.level <= 36) {
    return true;
  }
  return /FY4/i.test(String(winOrGroup.id || winOrGroup.activeGroup?.id || winOrGroup.element || ""));
}

export const DEFAULT_MODELS = [
  "ECMWF_HR",
  "GRAPES_GFS",
  "GRAPES_3KM",
  "SHANGHAI_MR",
  "BEIJING_MR",
  "JAPAN_MR",
];

// Runtime cache of model levels queried from server (/api/catalog/levels)
// key: "MODEL/ELEMENT" or "MODEL" -> Array<number> (e.g. "SHANGHAI_MR/RH" -> [1000, 925, 850])
export const modelLevelsRuntimeCache = new Map();
const inFlightLevelQueries = new Map();

/**
 * Queries the server at runtime for supported pressure levels of a model and element.
 * Caches the response in modelLevelsRuntimeCache.
 * @param {string} model
 * @param {string} [element]
 * @returns {Promise<number[]|null>}
 */
export async function queryModelSupportedLevels(model, element = "") {
  if (!model) return null;
  const m = String(model).trim().toUpperCase();
  let el = element ? String(element).trim().toUpperCase() : "";
  if (el.includes("T-VAR") || el.includes("T_VAR") || el.includes("TMP-VAR") || el.includes("TMP_VAR")) {
    el = "TMP";
  } else if (el.includes("SLP") || el.includes("PRMSL")) {
    el = "PRMSL";
  }
  const key = el ? `${m}/${el}` : m;

  if (modelLevelsRuntimeCache.has(key)) {
    return modelLevelsRuntimeCache.get(key);
  }
  if (inFlightLevelQueries.has(key)) {
    return await inFlightLevelQueries.get(key);
  }

  const queryPromise = (async () => {
    try {
      const dataPath = el ? `${m}/${el}` : m;
      const res = await fetchLevels(dataPath);
      if (Array.isArray(res)) {
        const levels = res.map((n) => parseInt(n, 10)).filter((n) => !isNaN(n));
        modelLevelsRuntimeCache.set(key, levels);
        return levels;
      }
    } catch {
      if (el) {
        try {
          const res = await fetchLevels(m);
          if (Array.isArray(res)) {
            const levels = res.map((n) => parseInt(n, 10)).filter((n) => !isNaN(n));
            modelLevelsRuntimeCache.set(key, levels);
            return levels;
          }
        } catch {}
      }
    } finally {
      inFlightLevelQueries.delete(key);
    }
    return null;
  })();

  inFlightLevelQueries.set(key, queryPromise);
  return await queryPromise;
}

/**
 * Preloads supported levels from the server for models and layers at runtime.
 */
export async function preloadModelLevels(models = DEFAULT_MODELS, elements = ["RH", "HGT", "WIND", "TMP"]) {
  const tasks = [];
  for (const m of models) {
    if (Array.isArray(elements) && elements.length > 0) {
      for (const el of elements) {
        tasks.push(queryModelSupportedLevels(m, el));
      }
    } else {
      tasks.push(queryModelSupportedLevels(m));
    }
  }
  await Promise.allSettled(tasks);
}

/**
 * Sets or updates the cached levels for a model/element (useful for tests or custom server configs).
 */
export function setModelLevelsCache(model, element, levels) {
  if (!model) return;
  const m = String(model).trim().toUpperCase();
  const el = element ? String(element).trim().toUpperCase() : "";
  const key = el ? `${m}/${el}` : m;
  if (Array.isArray(levels)) {
    modelLevelsRuntimeCache.set(key, levels.map((n) => parseInt(n, 10)).filter((n) => !isNaN(n)));
  } else {
    modelLevelsRuntimeCache.delete(key);
  }
}

/**
 * Checks whether a given model supports a specific meteorological element at a given level.
 * Queries the server at runtime (via /api/catalog/levels) and checks the runtime cache.
 * Does NOT hardcode model names or level limits.
 */
export function isModelLayerSupported(model, element, level) {
  if (!model || level == null) return true;
  const numLevel = parseInt(level, 10);
  if (isNaN(numLevel) || numLevel === 0) return true;

  const m = String(model).trim().toUpperCase();
  let el = element ? String(element).trim().toUpperCase() : "";
  if (el.includes("T-VAR") || el.includes("T_VAR") || el.includes("TMP-VAR") || el.includes("TMP_VAR")) {
    el = "TMP";
  } else if (el.includes("SLP") || el.includes("PRMSL")) {
    return true; // Surface level element always supported on gridded models
  }
  const key = el ? `${m}/${el}` : m;

  // 1. If levels are already cached from a runtime server query, check against them:
  const cached = (el && modelLevelsRuntimeCache.get(key)) || modelLevelsRuntimeCache.get(m);
  if (Array.isArray(cached) && cached.length > 0) {
    return cached.includes(numLevel);
  }

  // 2. If not yet cached, query the server at runtime
  return queryModelSupportedLevels(m, el).then((levels) => {
    if (Array.isArray(levels) && levels.length > 0) {
      return levels.includes(numLevel);
    }
    return true;
  });
}

/**
 * Returns candidate models for auto-allocation Mode 'model', omitting models
 * for which all layers in the preset/window do not exist at the given level.
 */
export function getEligibleModelsForAllocation(groupOrWin, level = null, models = DEFAULT_MODELS) {
  if (!Array.isArray(models) || models.length === 0) return DEFAULT_MODELS;

  const layers = (Array.isArray(groupOrWin?.activeGroup?.layers) && groupOrWin.activeGroup.layers.length > 0)
    ? groupOrWin.activeGroup.layers
    : (Array.isArray(groupOrWin?.layers) && groupOrWin.layers.length > 0
      ? groupOrWin.layers
      : null);

  if (!layers || layers.length === 0) {
    return models;
  }

  // When groupOrWin.hasLevel === false or layers.every(l => l.hasLevel === false || !l.level), DO NOT filter by vertical pressure level!
  const effectiveLevel = level !== null && level !== undefined
    ? parseInt(level, 10)
    : (groupOrWin?.level !== null && groupOrWin?.level !== undefined
      ? parseInt(groupOrWin.level, 10)
      : (groupOrWin?.defaultLevel ? parseInt(groupOrWin.defaultLevel, 10) : null));

  const hasNoLevel =
    groupOrWin?.hasLevel === false ||
    groupOrWin?.activeGroup?.hasLevel === false ||
    layers.every((l) => l.hasLevel === false) ||
    effectiveLevel === null ||
    isNaN(effectiveLevel);

  if (hasNoLevel) {
    return models;
  }

  const fallbackElement = groupOrWin?.element || groupOrWin?.activeGroup?.element;

  const eligible = models.filter((model) => {
    const allLayersNotExist = layers.every((l) => {
      const elem = l.element || (l.type === "wind" ? "WIND" : null) || (typeof l.id === "string" ? l.id.toUpperCase() : null) || fallbackElement || "TMP";
      const lvl = l.level !== null && l.level !== undefined ? parseInt(l.level, 10) : effectiveLevel;
      const res = isModelLayerSupported(model, elem, lvl);
      return res === false;
    });
    return !allLayersNotExist;
  });

  return eligible.length > 0 ? eligible : models;
}

/**
 * Asynchronous version that ensures all model level queries from server complete before evaluating eligibility.
 */
export async function getEligibleModelsForAllocationAsync(groupOrWin, level = null, models = DEFAULT_MODELS) {
  if (!Array.isArray(models) || models.length === 0) return DEFAULT_MODELS;

  const layers = (Array.isArray(groupOrWin?.activeGroup?.layers) && groupOrWin.activeGroup.layers.length > 0)
    ? groupOrWin.activeGroup.layers
    : (Array.isArray(groupOrWin?.layers) && groupOrWin.layers.length > 0
      ? groupOrWin.layers
      : null);

  if (!layers || layers.length === 0) {
    return models;
  }

  const effectiveLevel = level !== null && level !== undefined
    ? parseInt(level, 10)
    : (groupOrWin?.level !== null && groupOrWin?.level !== undefined
      ? parseInt(groupOrWin.level, 10)
      : (groupOrWin?.defaultLevel ? parseInt(groupOrWin.defaultLevel, 10) : null));

  const hasNoLevel =
    groupOrWin?.hasLevel === false ||
    groupOrWin?.activeGroup?.hasLevel === false ||
    layers.every((l) => l.hasLevel === false) ||
    effectiveLevel === null ||
    isNaN(effectiveLevel);

  if (hasNoLevel) {
    return models;
  }

  const fallbackElement = groupOrWin?.element || groupOrWin?.activeGroup?.element;
  const elements = layers.map((l) => l.element || (l.type === "wind" ? "WIND" : null) || (typeof l.id === "string" ? l.id.toUpperCase() : null) || fallbackElement || "TMP");

  await preloadModelLevels(models, elements);
  return getEligibleModelsForAllocation(groupOrWin, level, models);
}


export function stepCycleHours(cycleStr, deltaHours) {
  if (!cycleStr || typeof cycleStr !== "string") return cycleStr;
  const pad = (n) => String(n).padStart(2, "0");

  let raw = cycleStr;
  const dotIdx = cycleStr.indexOf(".");
  if (dotIdx !== -1) {
    const ext = cycleStr.slice(dotIdx);
    if (/^\.\d+$/.test(ext)) {
      raw = cycleStr.slice(0, dotIdx);
    }
  }

  // 1. Embedded 8+4 underscore: e.g. CTT_MLT_OTG_20261016_1000_FY2G.AWX
  const mUnderscore = raw.match(/^(.*?)((?:19|20)\d{6})_(\d{4})(.*)$/);
  if (mUnderscore) {
    const [, pre, dPart, tPart, post] = mUnderscore;
    const y = parseInt(dPart.slice(0, 4), 10);
    const m = parseInt(dPart.slice(4, 6), 10) - 1;
    const d = parseInt(dPart.slice(6, 8), 10);
    const h = parseInt(tPart.slice(0, 2), 10);
    const min = parseInt(tPart.slice(2, 4), 10);
    const date = new Date(Date.UTC(y, m, d, h, min) + Math.round(deltaHours * 3600 * 1000));
    const newD = `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}`;
    const newT = `${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}`;
    return `${pre}${newD}_${newT}${post}`;
  }

  // 2. 14 digits: e.g. C012_20261016114500_FY4B.AWX or 20260918080000
  const m14 = raw.match(/^(.*?)((?:19|20)\d{12})(.*)$/);
  if (m14) {
    const [, pre, ts, post] = m14;
    const y = parseInt(ts.slice(0, 4), 10);
    const m = parseInt(ts.slice(4, 6), 10) - 1;
    const d = parseInt(ts.slice(6, 8), 10);
    const h = parseInt(ts.slice(8, 10), 10);
    const min = parseInt(ts.slice(10, 12), 10);
    const s = parseInt(ts.slice(12, 14), 10);
    const date = new Date(Date.UTC(y, m, d, h, min, s) + Math.round(deltaHours * 3600 * 1000));
    const newTs = `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}`;
    return `${pre}${newTs}${post}`;
  }

  // 3. 10 digits YYYYMMDDHH: e.g. 2026092608
  const m10 = raw.match(/^(.*?)((?:19|20)\d{8})(.*)$/);
  if (m10) {
    const [, pre, ts, post] = m10;
    const y = parseInt(ts.slice(0, 4), 10);
    const m = parseInt(ts.slice(4, 6), 10) - 1;
    const d = parseInt(ts.slice(6, 8), 10);
    const h = parseInt(ts.slice(8, 10), 10);
    const date = new Date(Date.UTC(y, m, d, h) + Math.round(deltaHours * 3600 * 1000));
    const newTs = `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}${pad(date.getUTCHours())}`;
    return `${pre}${newTs}${post}`;
  }

  // 4. 8 digits YYMMDDHH: e.g. 26092608 or 26092608.024
  const m8 = raw.match(/^(.*?)(\d{8})(.*)$/);
  if (m8) {
    const [, pre, ts, post] = m8;
    const yy = parseInt(ts.slice(0, 2), 10);
    const y = yy < 70 ? 2000 + yy : 1900 + yy;
    const m = parseInt(ts.slice(2, 4), 10) - 1;
    const d = parseInt(ts.slice(4, 6), 10);
    const h = parseInt(ts.slice(6, 8), 10);
    const date = new Date(Date.UTC(y, m, d, h) + Math.round(deltaHours * 3600 * 1000));
    const newYY = String(date.getUTCFullYear()).slice(-2);
    const newTs = `${newYY}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}${pad(date.getUTCHours())}`;
    return `${pre}${newTs}${post}`;
  }

  return cycleStr;
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
  if (tab.layout === "1x1" || tab.isMaximizedPreview) {
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
  if (tab.layout === "1x1" || tab.isMaximizedPreview) {
    return (tab.windows[tab.activeWinIdx] || tab.windows[0]) === win;
  }
  return getVisibleWindows(tab).includes(win);
}

/**
 * Resolves the root Initiator window for an auto-allocated contrast group.
 * Prevents circular allocParentId chains when a user focuses a child window
 * and changes layout or allocation mode.
 */
export function resolveContrastInitiator(tab, baseWin = null) {
  if (!tab || !Array.isArray(tab.windows) || tab.windows.length === 0) {
    return baseWin || null;
  }
  const inTab = baseWin && typeof baseWin === "object" && tab.windows.includes(baseWin);
  let cur = inTab
    ? baseWin
    : ((tab.activeWinIdx != null && tab.windows[tab.activeWinIdx]) ? tab.windows[tab.activeWinIdx] : tab.windows[0]);

  const visited = new Set();
  while (cur && cur.isAutoAllocated && !cur.isPinned && cur.allocParentId && !visited.has(cur.id)) {
    visited.add(cur.id);
    const parent = tab.windows.find((w) => w && w.id === cur.allocParentId);
    if (parent && parent !== cur) {
      cur = parent;
    } else {
      break;
    }
  }

  if (cur && cur.isAutoAllocated && !cur.isPinned) {
    if (tab.allocAnchorId) {
      const anchor = tab.windows.find((w) => w && w.id === tab.allocAnchorId && (!w.isAutoAllocated || w.isPinned));
      if (anchor) return anchor;
    }
    const firstNonAlloc = tab.windows.find((w) => w && (!w.isAutoAllocated || w.isPinned));
    if (firstNonAlloc) return firstNonAlloc;
  }

  return cur || tab.windows[0] || null;
}

/**
 * Computes a compact differential badge label for a window in a split contrast group.
 */
export function computeAllocBadgeText(win, mode, slotIdx = 0) {
  if (!win || !mode || mode === "none") return null;
  if (mode === "level") {
    if (win.level == null) return "SFC";
    if (isMultiChannelSatellite(win)) {
      return `C${String(win.level).padStart(3, "0")}`;
    }
    const isMeterHeight =
      /TDMOSAIC/i.test(String(win.activeGroup?.id || "")) ||
      (Array.isArray(win.levels) && win.levels.some((l) => l > 1050)) ||
      (Array.isArray(win.layers) && win.layers.some((l) => /TDMOSAIC/i.test(String(l?.path || l?.element || ""))));
    if (isMeterHeight) {
      return `${win.level}m`;
    }
    return `${win.level}hPa`;
  }
  if (mode === "model") {
    const raw = String(win.model || "");
    if (!raw) return `M${slotIdx + 1}`;
    return raw.replace(/_HR$|_MR$/, "");
  }
  const formatObsLabel = (obsTime) => {
    if (!obsTime) return null;
    const match14 = String(obsTime).match(/(?:^|[_.-])((?:19|20)\d{12})(?:[_.-]|$)/);
    const matchUnderscore = String(obsTime).match(/(?:^|[_.-])((?:19|20)\d{6})_(\d{4})(?:[_.-]|$)/);
    if (match14) {
      const raw = match14[1];
      const dd = raw.slice(6, 8);
      const hh = raw.slice(8, 10);
      const mm = raw.slice(10, 12);
      return mm !== "00" ? `${dd}/${hh}:${mm}` : `${dd}/${hh}h`;
    } else if (matchUnderscore) {
      const dPart = matchUnderscore[1];
      const tPart = matchUnderscore[2];
      const dd = dPart.slice(6, 8);
      const hh = tPart.slice(0, 2);
      const mm = tPart.slice(2, 4);
      return mm !== "00" ? `${dd}/${hh}:${mm}` : `${dd}/${hh}h`;
    }
    const digits = String(obsTime).replace(/[^\d]/g, "");
    if (digits.length >= 8) {
      const dd = digits.length >= 10 ? digits.slice(6, 8) : digits.slice(4, 6);
      const hh = digits.length >= 10 ? digits.slice(8, 10) : digits.slice(6, 8);
      return `${dd}/${hh}h`;
    }
    return String(obsTime);
  };
  if (mode === "step") {
    if (win.isObservation && win.obsTime) {
      return formatObsLabel(win.obsTime);
    }
    const p = Number(win.period ?? 0);
    return `+${String(p).padStart(3, "0")}h`;
  }
  if (mode === "time") {
    if (win.isObservation && win.obsTime) {
      return formatObsLabel(win.obsTime);
    }
    const cyc = String(win.forecastCycle || "").replace(/[^\d]/g, "");
    const p = Number(win.period ?? 0);
    if (cyc.length >= 8) {
      const dd = cyc.length >= 10 ? cyc.slice(6, 8) : cyc.slice(4, 6);
      const hh = cyc.length >= 10 ? cyc.slice(8, 10) : cyc.slice(6, 8);
      return `${dd}/${hh} +${String(p).padStart(3, "0")}h`;
    }
    return `+${String(p).padStart(3, "0")}h`;
  }
  return null;
}

/**
 * Promotes an auto-allocated contrast window to a permanent, independent user tab.
 */
export function pinContrastWindow(tab, winOrId) {
  if (!tab || !Array.isArray(tab.windows) || !winOrId) return null;
  const win = typeof winOrId === "object"
    ? tab.windows.find((w) => w === winOrId || (w && winOrId.id && w.id === winOrId.id))
    : tab.windows.find((w) => w && w.id === winOrId);
  if (!win) return null;
  win.isPinned = true;
  win.isAutoAllocated = false;
  win.allocParentId = null;
  win.allocMode = null;
  win.allocBadgeText = null;
  return win;
}

/**
 * Returns structured metadata about the active contrast group on `tab`, or null if none.
 */
export function getContrastGroupInfo(tab) {
  if (!tab || !Array.isArray(tab.windows)) return null;
  const children = tab.windows.filter((w) => w && w.isAutoAllocated && !w.isPinned);
  if (children.length === 0) return null;
  const parentId = children[0].allocParentId || tab.allocAnchorId || null;
  const initiator = (parentId ? tab.windows.find((w) => w && w.id === parentId) : null) ||
    resolveContrastInitiator(tab, children[0]) ||
    tab.windows[0];
  const mode = (tab.autoAllocation && tab.autoAllocation !== "none")
    ? tab.autoAllocation
    : (children[0].allocMode || "level");
  return {
    initiator,
    parentId: initiator?.id || parentId,
    children,
    mode,
    totalCount: (initiator ? 1 : 0) + children.length,
  };
}

/**
 * Prunes ephemeral auto-allocated child windows (`isAutoAllocated && !isPinned`).
 * Strictly preserves:
 *  1. The Initiator window (`isAutoAllocated === false`)
 *  2. All Original Non-Focused independent tabs (`isAutoAllocated === false`)
 *  3. Any Pinned contrast tabs (`isPinned === true`)
 *
 * @param {Object} tab - The tab state object.
 * @param {Object} [options]
 * @param {number} [options.keepCount=0] - Number of auto-allocated children of targetParentId to retain.
 * @param {string|null} [options.targetParentId=null] - Parent window ID whose children may be retained up to keepCount.
 * @param {Object|null} [options.promoteWin=null] - Child window whose parameters should be adopted onto the initiator before pruning.
 * @param {Function|null} [options.onCleanupWindow=null] - Callback invoked for each pruned window to release MapLibre/layer/timeline resources.
 * @returns {Array} Array of pruned window objects.
 */
export function pruneAutoAllocatedWindows(tab, options = {}) {
  if (!tab || !Array.isArray(tab.windows)) return [];
  const {
    keepCount = 0,
    targetParentId = null,
    promoteWin = null,
    onCleanupWindow = null,
  } = options;

  const initiator = promoteWin
    ? (tab.windows.find((w) => w && w.id === promoteWin.allocParentId) || resolveContrastInitiator(tab, promoteWin))
    : (targetParentId
      ? (tab.windows.find((w) => w && w.id === targetParentId) || resolveContrastInitiator(tab))
      : resolveContrastInitiator(tab));

  if (promoteWin && initiator && promoteWin !== initiator) {
    initiator.level = promoteWin.level;
    initiator.model = promoteWin.model;
    initiator.element = promoteWin.element;
    initiator.period = promoteWin.period;
    initiator.forecastCycle = promoteWin.forecastCycle;
    initiator.obsTime = promoteWin.obsTime;
    initiator.isObservation = promoteWin.isObservation;
    initiator.stepLength = promoteWin.stepLength;
    if (Array.isArray(promoteWin.discretePeriods)) {
      initiator.discretePeriods = [...promoteWin.discretePeriods];
    }
    if (Array.isArray(promoteWin.forecastCycles)) {
      initiator.forecastCycles = [...promoteWin.forecastCycles];
    }
    if (promoteWin.activeGroup) {
      try {
        initiator.activeGroup = JSON.parse(JSON.stringify(promoteWin.activeGroup));
      } catch {
        initiator.activeGroup = promoteWin.activeGroup;
      }
    }
    if (Array.isArray(promoteWin.layers)) {
      try {
        initiator.layers = JSON.parse(JSON.stringify(promoteWin.layers));
      } catch {
        initiator.layers = [...promoteWin.layers];
      }
    }
    if (promoteWin._nwpTimeline) {
      initiator._nwpTimeline = { ...promoteWin._nwpTimeline };
    }
    if (promoteWin._obsTimeline) {
      initiator._obsTimeline = { ...promoteWin._obsTimeline };
    }
    initiator.isAutoAllocated = false;
    initiator.allocParentId = null;
  }

  const prevActive = tab.windows[tab.activeWinIdx] || tab.windows[0] || null;
  const effectiveParentId = targetParentId || initiator?.id || null;

  let keptChildren = 0;
  const survivors = [];
  const pruned = [];

  for (const w of tab.windows) {
    const isEphemeral = Boolean(w && w.isAutoAllocated && !w.isPinned && w !== initiator);
    if (!isEphemeral) {
      if (keepCount === 0 && w) {
        w.allocBadgeText = null;
        w.allocMode = null;
      }
      survivors.push(w);
    } else {
      const matchesParent = !effectiveParentId || !w.allocParentId || w.allocParentId === effectiveParentId;
      if (keepCount > 0 && matchesParent && keptChildren < keepCount) {
        keptChildren += 1;
        survivors.push(w);
      } else {
        pruned.push(w);
      }
    }
  }

  if (survivors.length === 0 && tab.windows.length > 0) {
    const fallback = tab.windows[0];
    fallback.isAutoAllocated = false;
    fallback.allocParentId = null;
    fallback.allocBadgeText = null;
    survivors.push(fallback);
    const idx = pruned.indexOf(fallback);
    if (idx !== -1) pruned.splice(idx, 1);
  }

  if (typeof onCleanupWindow === "function") {
    for (const w of pruned) {
      try {
        onCleanupWindow(w);
      } catch {}
    }
  }

  survivors.forEach((w, idx) => {
    w.winIdx = idx;
    if (w.title) w.title = String(w.title).replace(/^W\d+:\s*/, "");
    if (w.baseTitle) w.baseTitle = String(w.baseTitle).replace(/^W\d+:\s*/, "");
  });
  tab.windows = survivors;

  if (promoteWin && initiator && survivors.includes(initiator)) {
    tab.activeWinIdx = survivors.indexOf(initiator);
  } else if (prevActive && survivors.includes(prevActive)) {
    tab.activeWinIdx = survivors.indexOf(prevActive);
  } else if (prevActive && prevActive.allocParentId) {
    const parentIdx = survivors.findIndex((w) => w && w.id === prevActive.allocParentId);
    tab.activeWinIdx = parentIdx !== -1 ? parentIdx : Math.max(0, Math.min(tab.activeWinIdx || 0, survivors.length - 1));
  } else if (initiator && survivors.includes(initiator)) {
    tab.activeWinIdx = survivors.indexOf(initiator);
  } else {
    tab.activeWinIdx = Math.max(0, Math.min(tab.activeWinIdx || 0, survivors.length - 1));
  }

  if (keepCount === 0) {
    tab.allocAnchorId = null;
    tab.isMaximizedPreview = false;
  }

  return pruned;
}

/**
 * Pure predicate behind the split fan-out's reload skip: the base window
 * keeps its map untouched when the allocation pass changed nothing about it
 * (same preset, level, model, period, cycle, obsTime). Skipping must not
 * wipe or invalidate anything — callers must neither tear down its map nor
 * bump its stale-guard sequence on this path.
 */
export function shouldSkipWindowReload(w, baseWin, prevBaseState, mode) {
  if (!w || !baseWin || w !== baseWin || !prevBaseState || w.activeGroup?.id !== prevBaseState.groupId) {
    return false;
  }
  if (mode === "level") return w.level === prevBaseState.level;
  if (mode === "model") return w.model === prevBaseState.model;
  if (mode === "step") return w.period === prevBaseState.period;
  if (mode === "time") {
    if (w.isObservation) return w.obsTime === prevBaseState.obsTime;
    return w.forecastCycle === prevBaseState.forecastCycle && w.period === prevBaseState.period;
  }
  return false;
}

export function replaceModelInPath(path, newModel) {
  if (typeof path !== "string" || !path.includes("/")) return path;
  if (path.startsWith("/api/derived/")) {
    if (path.startsWith("/api/derived/SURFACE/") || path.startsWith("/api/derived/UPPER_AIR/")) {
      return path;
    }
    return path.replace(/^\/api\/derived\/[^\/]+/, `/api/derived/${newModel}`);
  }
  return path.replace(/^[^\/]+/, newModel);
}

export function applyAutoAllocation(tab, mode = "level", baseWin = null) {
  if (!tab || !Array.isArray(tab.windows)) return;
  tab.autoAllocation = mode;
  if (mode === "none") {
    revertAutoAllocation(tab, baseWin);
    return;
  }
  const visible = getVisibleWindows(tab);
  const baseInTab = Boolean(baseWin && typeof baseWin === "object" && tab.windows.includes(baseWin));
  const anchorWin = baseInTab
    ? resolveContrastInitiator(tab, baseWin)
    : resolveContrastInitiator(tab, visible[0] || tab.windows[0] || null);
  const win0 = (baseWin && typeof baseWin === "object" && !baseInTab)
    ? baseWin
    : (anchorWin || (baseWin && typeof baseWin === "object" ? baseWin : null) || ((tab.activeWinIdx != null && tab.windows[tab.activeWinIdx]) ? tab.windows[tab.activeWinIdx] : (tab.windows[0] || {})));
  if (anchorWin) {
    tab.allocAnchorId = anchorWin.id;
  }
  const win0Layers = (Array.isArray(win0.activeGroup?.layers) && win0.activeGroup.layers.length > 0)
    ? win0.activeGroup.layers
    : (Array.isArray(win0.layers) && win0.layers.length > 0
      ? win0.layers
      : null);
  const win0HasNoLevel =
    win0.hasLevel === false ||
    win0.activeGroup?.hasLevel === false ||
    (win0.level == null &&
     win0.activeGroup?.level == null &&
     win0.defaultLevel == null &&
     win0.activeGroup?.defaultLevel == null &&
     Array.isArray(win0Layers) && win0Layers.length > 0 && win0Layers.every((l) => l.hasLevel === false || !l.level));

  const baseLevel = win0HasNoLevel ? null : (win0.level ?? 500);
  const baseModel = win0.model ||
    win0.activeGroup?.model ||
    (Array.isArray(win0.activeGroup?.layers) && win0.activeGroup.layers[0]?.model) ||
    (Array.isArray(win0.layers) && win0.layers[0]?.model) ||
    (tab.activeWinIdx != null ? tab.windows[tab.activeWinIdx]?.model : null) ||
    tab.windows[0]?.model ||
    "ECMWF_HR";
  const baseElement = win0.element ||
    win0.activeGroup?.element ||
    (Array.isArray(win0.activeGroup?.layers) && win0.activeGroup.layers[0]?.element) ||
    (Array.isArray(win0.layers) && win0.layers[0]?.element) ||
    "TMP";
  const rainHours = getRainAccumulationHoursForWindow(win0) ??
    getRainAccumulationHours(baseElement) ??
    getRainAccumulationHours(win0.activeGroup?.id) ??
    getRainAccumulationHours(win0.activeGroup?.name);
  const basePeriodRaw = win0.period ?? 24;
  let basePeriod = basePeriodRaw;
  if (rainHours !== null && rainHours > 0) {
    if (basePeriodRaw < rainHours) {
      basePeriod = rainHours;
    }
  }
  const baseCycle = win0.forecastCycle || (Array.isArray(win0.forecastCycles) && win0.forecastCycles[0]) || "26092608";
  const isObs = Boolean(win0.isObservation || win0.activeGroup?.isObservation || (win0.model === "SURFACE" || win0.model === "UPPER_AIR"));
  const isSurface = baseModel === "SURFACE" || baseModel === "SURFACE_PLOT" || (typeof win0.element === "string" && win0.element.toLowerCase().includes("surface")) || win0.activeGroup?.id?.toLowerCase().includes("surface");
  let baseObsTime = win0.obsTime || (tab.activeWinIdx != null ? tab.windows[tab.activeWinIdx]?.obsTime : null) || tab.windows[0]?.obsTime || "26092608";
  const defaultStep = isObs ? (isSurface ? 3 : 12) : 6;
  const stepLen = win0.stepLength || defaultStep;

  for (let i = 0; i < visible.length; i++) {
    const win = visible[i];
    win.element = baseElement;
    win.isObservation = isObs;
    win.stepLength = stepLen;
    if (Array.isArray(win0.discretePeriods)) {
      win.discretePeriods = [...win0.discretePeriods];
    }
    if (Array.isArray(win0.forecastCycles)) {
      win.forecastCycles = [...win0.forecastCycles];
    }
    if (win === anchorWin) {
      win.isAutoAllocated = false;
      win.allocParentId = null;
      win.allocMode = mode;
    } else if (!win.isPinned) {
      win.isAutoAllocated = true;
      win.allocParentId = anchorWin?.id || win0.id || null;
      win.allocMode = mode;
    }
    if (win0.activeGroup && (!win.activeGroup || win !== anchorWin)) {
      try {
        win.activeGroup = JSON.parse(JSON.stringify(win0.activeGroup));
      } catch {
        win.activeGroup = win0.activeGroup;
      }
    }
    if (mode === "level") {
      let allocatedLevel;
      const isMultiChanSat = isMultiChannelSatellite(win0);

      if (isMultiChanSat) {
        const satLevels = Array.isArray(win0.activeGroup?.levels) && win0.activeGroup.levels.length > 0
          ? win0.activeGroup.levels
          : (Array.isArray(win0.levels) && win0.levels.length > 0 ? win0.levels : DEFAULT_SATELLITE_LEVELS);
        const orderedChannels = [
          ...DEFAULT_SATELLITE_LEVELS.filter((ch) => satLevels.includes(ch)),
          ...satLevels.filter((ch) => !DEFAULT_SATELLITE_LEVELS.includes(ch)),
        ];
        if (i === 0) {
          allocatedLevel = baseLevel ?? orderedChannels[0] ?? 12;
        } else {
          const pool = orderedChannels.filter((ch) => ch !== (baseLevel ?? orderedChannels[0]));
          allocatedLevel = pool[(i - 1) % pool.length] ?? orderedChannels[i % orderedChannels.length];
        }
      } else if (Array.isArray(win0.activeGroup?.levels) && win0.activeGroup.levels.length > 0) {
        const groupLevels = win0.activeGroup.levels;
        if (i === 0) {
          allocatedLevel = baseLevel ?? groupLevels[0];
        } else {
          const pool = groupLevels.filter((lvl) => lvl !== (baseLevel ?? groupLevels[0]));
          allocatedLevel = pool[(i - 1) % pool.length] ?? groupLevels[i % groupLevels.length];
        }
      } else {
        allocatedLevel = DEFAULT_LEVELS[i] ?? 500;
      }

      win.level = allocatedLevel;
      win.model = baseModel;
      win.period = basePeriod;
      win.forecastCycle = baseCycle;
      win.obsTime = baseObsTime;
      if (isMultiChanSat && typeof win.obsTime === "string" && /^C\d{3}_/i.test(win.obsTime)) {
        win.obsTime = `C${String(win.level).padStart(3, "0")}_${win.obsTime.replace(/^C\d{3}_/i, "")}`;
      }
    } else if (mode === "model") {
      const eligibleModels = getEligibleModelsForAllocation(win0, baseLevel, DEFAULT_MODELS);
      win.model = eligibleModels[i % eligibleModels.length];
      win.level = baseLevel;
      win.period = basePeriod;
      win.forecastCycle = baseCycle;
      win.obsTime = baseObsTime;
      if (win.activeGroup && Array.isArray(win.activeGroup.layers)) {
        for (const l of win.activeGroup.layers) {
          const isObs = Boolean(
            l?.isObservation ||
            l?.model === "SURFACE" ||
            l?.model === "UPPER_AIR" ||
            l?.path?.includes("/api/derived/SURFACE") ||
            l?.path?.includes("/api/derived/UPPER_AIR")
          );
          if (!isObs && l && (l.type === "contour" || l.type === "wind" || l.type === "raster" || l.model)) {
            const oldM = l.model;
            l.model = win.model;
            if (typeof l.path === "string" && l.path.includes("/")) {
              l.path = replaceModelInPath(l.path, win.model);
            }
            if (typeof l.id === "string" && oldM) {
              const baseM = oldM.replace(/_.*$/, "");
              l.id = l.id.replaceAll(oldM, win.model).replaceAll(oldM.toLowerCase(), win.model.toLowerCase());
              if (baseM && baseM !== oldM) {
                l.id = l.id.replaceAll(baseM, win.model).replaceAll(baseM.toLowerCase(), win.model.toLowerCase());
              }
            }
            if (typeof l.derivedFrom === "string" && oldM) {
              const baseM = oldM.replace(/_.*$/, "");
              l.derivedFrom = l.derivedFrom.replaceAll(oldM, win.model).replaceAll(oldM.toLowerCase(), win.model.toLowerCase());
              if (baseM && baseM !== oldM) {
                l.derivedFrom = l.derivedFrom.replaceAll(baseM, win.model).replaceAll(baseM.toLowerCase(), win.model.toLowerCase());
              }
            }
            if (typeof l.name === "string" && oldM) {
              const baseM = oldM.replace(/_.*$/, "");
              l.name = l.name.replaceAll(oldM, win.model);
              if (baseM && baseM !== oldM) {
                l.name = l.name.replaceAll(baseM, win.model);
              }
            }
          }
        }
      }
      if (Array.isArray(win.layers)) {
        for (const l of win.layers) {
          const isObs = Boolean(
            l?.isObservation ||
            l?.model === "SURFACE" ||
            l?.model === "UPPER_AIR" ||
            l?.path?.includes("/api/derived/SURFACE") ||
            l?.path?.includes("/api/derived/UPPER_AIR")
          );
          if (!isObs && l && (l.type === "contour" || l.type === "wind" || l.type === "raster" || l.model)) {
            const oldM = l.model;
            l.model = win.model;
            if (typeof l.path === "string" && l.path.includes("/")) {
              l.path = replaceModelInPath(l.path, win.model);
            }
            if (typeof l.id === "string" && oldM) {
              const baseM = oldM.replace(/_.*$/, "");
              l.id = l.id.replaceAll(oldM, win.model).replaceAll(oldM.toLowerCase(), win.model.toLowerCase());
              if (baseM && baseM !== oldM) {
                l.id = l.id.replaceAll(baseM, win.model).replaceAll(baseM.toLowerCase(), win.model.toLowerCase());
              }
            }
            if (typeof l.derivedFrom === "string" && oldM) {
              const baseM = oldM.replace(/_.*$/, "");
              l.derivedFrom = l.derivedFrom.replaceAll(oldM, win.model).replaceAll(oldM.toLowerCase(), win.model.toLowerCase());
              if (baseM && baseM !== oldM) {
                l.derivedFrom = l.derivedFrom.replaceAll(baseM, win.model).replaceAll(baseM.toLowerCase(), win.model.toLowerCase());
              }
            }
            if (typeof l.name === "string" && oldM) {
              const baseM = oldM.replace(/_.*$/, "");
              l.name = l.name.replaceAll(oldM, win.model);
              if (baseM && baseM !== oldM) {
                l.name = l.name.replaceAll(baseM, win.model);
              }
            }
          }
        }
      }
    } else if (mode === "step") {
      win.model = baseModel;
      win.level = baseLevel;
      win.forecastCycle = baseCycle;
      if (Array.isArray(win0.forecastCycles)) {
        win.forecastCycles = [...win0.forecastCycles];
      }
      if (win0._nwpTimeline && !isObs) {
        win._nwpTimeline = { ...win0._nwpTimeline, stepLength: win.stepLength, cycle: win.forecastCycle };
      }
      if (isObs) {
        let stepped = null;
        const availableFiles = Array.isArray(win0.obsFiles) && win0.obsFiles.length > 0
          ? win0.obsFiles
          : (Array.isArray(win0._obsTimeline?.files) && win0._obsTimeline.files.length > 0
            ? win0._obsTimeline.files
            : null);
        if (availableFiles && baseObsTime) {
          const curIdx = availableFiles.indexOf(baseObsTime);
          if (curIdx !== -1 && curIdx - i >= 0) {
            stepped = availableFiles[curIdx - i];
          }
        }
        if (!stepped) {
          stepped = stepCycleHours(baseObsTime, -i * stepLen);
        }
        win.obsTime = (typeof baseObsTime === "string" && baseObsTime.endsWith(".000") && !stepped.endsWith(".000"))
          ? `${stepped}.000`
          : stepped;
        if (win._obsTimeline) win._obsTimeline.file = win.obsTime;
      } else {
        const isCadenceMatch = Array.isArray(win0.discretePeriods) &&
          win0.discretePeriods.length >= 2 &&
          (Math.abs(Number(win0.discretePeriods[1]) - Number(win0.discretePeriods[0])) === Number(stepLen));
        const periods = isCadenceMatch
          ? win0.discretePeriods
          : getPeriodsForStep(stepLen);
        win.discretePeriods = Array.isArray(periods) ? [...periods] : periods;
        let baseIdx = periods.indexOf(basePeriod);
        if (baseIdx === -1 && Array.isArray(periods) && periods.length > 0) {
          let minDiff = Infinity;
          periods.forEach((p, idx) => {
            if (rainHours !== null && rainHours > 0 && Number(p) < rainHours) return;
            const diff = Math.abs(p - basePeriod);
            if (diff < minDiff) {
              minDiff = diff;
              baseIdx = idx;
            }
          });
        }
        if (baseIdx !== -1 && baseIdx + i < periods.length) {
          win.period = periods[baseIdx + i];
        } else {
          const startP = baseIdx !== -1 ? periods[baseIdx] : basePeriod;
          win.period = startP + i * stepLen;
        }
      }
    } else if (mode === "time") {
      win.model = baseModel;
      win.level = baseLevel;
      if (isObs) {
        let stepped = null;
        const availableFiles = Array.isArray(win0.obsFiles) && win0.obsFiles.length > 0
          ? win0.obsFiles
          : (Array.isArray(win0._obsTimeline?.files) && win0._obsTimeline.files.length > 0
            ? win0._obsTimeline.files
            : null);
        if (availableFiles && baseObsTime) {
          const curIdx = availableFiles.indexOf(baseObsTime);
          if (curIdx !== -1 && curIdx - i >= 0) {
            stepped = availableFiles[curIdx - i];
          }
        }
        if (!stepped) {
          stepped = stepCycleHours(baseObsTime, -i * stepLen);
        }
        win.obsTime = (typeof baseObsTime === "string" && baseObsTime.endsWith(".000") && !stepped.endsWith(".000"))
          ? `${stepped}.000`
          : stepped;
        if (win._obsTimeline) win._obsTimeline.file = win.obsTime;
      } else {
        const cycles = Array.isArray(win0.forecastCycles) && win0.forecastCycles.length > 0
          ? win0.forecastCycles
          : null;
        win.forecastCycles = Array.isArray(cycles) ? [...cycles] : cycles;
        if (Array.isArray(win0.discretePeriods)) {
          win.discretePeriods = [...win0.discretePeriods];
        }

        const parseCycleEpoch = (str) => {
          const clean = String(str || "").replace(/[^\d]/g, "").slice(0, 10);
          if (clean.length < 8) return NaN;
          const y = clean.length === 8 ? parseInt(`20${clean.slice(0, 2)}`, 10) : parseInt(clean.slice(0, 4), 10);
          const m = (clean.length === 8 ? parseInt(clean.slice(2, 4), 10) : parseInt(clean.slice(4, 6), 10)) - 1;
          const d = clean.length === 8 ? parseInt(clean.slice(4, 6), 10) : parseInt(clean.slice(6, 8), 10);
          const h = clean.length === 8 ? parseInt(clean.slice(6, 8), 10) : parseInt(clean.slice(8, 10), 10);
          return Date.UTC(y, m, d, h);
        };

        let cycleStep = (win0.model === "ECMWF_HR" && win0.stepLength === 6) ? 12 : (win0.stepLength || 12);
        if (cycles && cycles.length >= 2) {
          const t0 = parseCycleEpoch(cycles[0]);
          const t1 = parseCycleEpoch(cycles[1]);
          if (!isNaN(t0) && !isNaN(t1)) {
            const diffH = Math.round(Math.abs(t0 - t1) / 3600000);
            if (diffH > 0 && diffH <= 48) cycleStep = diffH;
          }
        }

        const baseIdx = cycles ? cycles.indexOf(baseCycle) : -1;
        if (cycles && baseIdx !== -1 && (baseIdx + i) < cycles.length) {
          const chosenCycle = cycles[baseIdx + i];
          const tBase = parseCycleEpoch(baseCycle);
          const tChosen = parseCycleEpoch(chosenCycle);
          const deltaH = (!isNaN(tBase) && !isNaN(tChosen)) ? Math.round((tBase - tChosen) / 3600000) : (i * cycleStep);
          win.forecastCycle = chosenCycle;
          win.period = basePeriod + deltaH;
        } else {
          win.forecastCycle = stepCycleHours(baseCycle, -i * cycleStep);
          win.period = basePeriod + i * cycleStep;
        }
        if (win.forecastCycles && Array.isArray(win.forecastCycles) && !win.forecastCycles.includes(win.forecastCycle)) {
          win.forecastCycles = [win.forecastCycle, ...win.forecastCycles];
        }
      }
    }
    win.allocBadgeText = computeAllocBadgeText(win, mode, i);
  }

  if (mode === "step" && !isObs) {
    const isCadenceMatch = Array.isArray(win0.discretePeriods) &&
      win0.discretePeriods.length >= 2 &&
      (Math.abs(Number(win0.discretePeriods[1]) - Number(win0.discretePeriods[0])) === Number(stepLen));
    const periods = isCadenceMatch
      ? win0.discretePeriods
      : getPeriodsForStep(stepLen);
    for (const w of tab.windows) {
      if (!visible.includes(w)) {
        w.stepLength = stepLen;
        w.discretePeriods = Array.isArray(periods) ? [...periods] : periods;
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
  tab.allocAnchorId = null;
  for (const win of tab.windows) {
    win.isAutoAllocated = false;
    win.allocParentId = null;
    win.allocMode = null;
    win.allocBadgeText = null;
  }
  const visible = getVisibleWindows(tab);
  const isNumericLevelOnly = typeof baseWin === "number";
  const win0 = (baseWin && typeof baseWin === "object" && baseWin.activeGroup)
    ? baseWin
    : (tab.windows.find((w) => w && w.activeGroup) || (baseWin && typeof baseWin === "object" ? baseWin : null) || tab.windows[tab.activeWinIdx] || tab.windows[0] || {});
  const win0HasNoLevel =
    win0.hasLevel === false ||
    win0.activeGroup?.hasLevel === false ||
    (win0.level == null && win0.activeGroup?.level == null && win0.defaultLevel == null && win0.activeGroup?.defaultLevel == null);
  const baseLevel = isNumericLevelOnly ? baseWin : (win0HasNoLevel ? null : (win0.level ?? 500));
  const baseModel = win0.model || "ECMWF_HR";
  const baseElement = win0.element || "TMP";
  const basePeriod = win0.period ?? 24;
  const baseCycle = win0.forecastCycle || "26092608";
  const isObs = Boolean(win0.isObservation || win0.activeGroup?.isObservation);
  let baseObsTime = win0.obsTime || null;

  for (let i = 0; i < visible.length; i++) {
    const win = visible[i];
    win.level = baseLevel;
    if (!isNumericLevelOnly) {
      win.model = baseModel;
      win.element = baseElement;
      win.period = basePeriod;
      const isSurface = win0.model === "SURFACE" || win0.model === "SURFACE_PLOT" || (typeof win0.element === "string" && win0.element.toLowerCase().includes("surface")) || win0.activeGroup?.id?.toLowerCase().includes("surface");
      win.isObservation = isObs;
      if (baseCycle) win.forecastCycle = baseCycle;
      if (baseObsTime) win.obsTime = baseObsTime;
      win.stepLength = win0.stepLength || (isObs ? (isSurface ? 3 : 12) : 6);
      if (Array.isArray(win0.discretePeriods)) {
        win.discretePeriods = [...win0.discretePeriods];
      }
      if (win0.activeGroup && (!win.activeGroup || win !== win0)) {
        try {
          win.activeGroup = JSON.parse(JSON.stringify(win0.activeGroup));
        } catch {
          win.activeGroup = win0.activeGroup;
        }
      }
    }
  }
}

let defaultLayerResolver = null;
export function setDefaultLayerResolver(fn) {
  defaultLayerResolver = fn;
}

export function hasWeatherLayers(win, layerResolver = null) {
  if (!win) return false;
  if (win.activeGroup && Array.isArray(win.activeGroup.layers) && win.activeGroup.layers.length > 0) {
    return true;
  }
  if (Array.isArray(win.layers) && win.layers.length > 0) {
    return true;
  }
  const resolver = layerResolver || defaultLayerResolver;
  if (typeof resolver === "function") {
    try {
      const layers = resolver(win.id || win);
      if (Array.isArray(layers) && layers.some((l) => l.removable !== false || (l.type && l.type !== "pmtiles"))) {
        return true;
      }
    } catch {}
  }
  return false;
}

export function isWindowEmpty(win, layerResolver = null) {
  return !hasWeatherLayers(win, layerResolver);
}

export function getNextWindowUid(tab) {
  if (!tab) return 0;
  const maxUid = (tab.windows || []).reduce((max, w) => Math.max(max, typeof w?.uid === "number" ? w.uid : -1), -1);
  const nextSeq = Math.max(tab._nextWinSeq || 0, (tab.windows || []).length, maxUid + 1);
  tab._nextWinSeq = nextSeq + 1;
  return nextSeq;
}

export function prepareSplitWindows(
  tab,
  numNeeded,
  baseWin = null,
  isWindowEmptyFn = isWindowEmpty,
  wasTab = true,
  prevNumVisible = null,
  onCleanupWindow = null
) {
  if (!tab || !Array.isArray(tab.windows)) return [];
  if (numNeeded <= 1) return tab.windows;

  const rawBase = baseWin || (tab.activeWinIdx != null ? tab.windows[tab.activeWinIdx] : null) || tab.windows[0];
  const targetBase = (rawBase && rawBase.isAutoAllocated && !rawBase.isPinned)
    ? resolveContrastInitiator(tab, rawBase)
    : rawBase;

  const targetLayers = (Array.isArray(targetBase?.activeGroup?.layers) && targetBase.activeGroup.layers.length > 0)
    ? targetBase.activeGroup.layers
    : (Array.isArray(targetBase?.layers) && targetBase.layers.length > 0
      ? targetBase.layers
      : null);
  const targetHasNoLevel =
    targetBase?.hasLevel === false ||
    targetBase?.activeGroup?.hasLevel === false ||
    (targetBase?.level == null &&
     targetBase?.activeGroup?.level == null &&
     targetBase?.defaultLevel == null &&
     targetBase?.activeGroup?.defaultLevel == null &&
     Array.isArray(targetLayers) && targetLayers.length > 0 && targetLayers.every((l) => l.hasLevel === false || !l.level));
  const effectiveBaseLevel = targetHasNoLevel ? null : (targetBase?.level ?? 500);

  if (targetBase) {
    targetBase.isAutoAllocated = false;
    targetBase.allocParentId = null;
    tab.allocAnchorId = targetBase.id;
    if (targetHasNoLevel) {
      targetBase.level = null;
    }
    if (tab.autoAllocation === "model" && !targetBase.model) {
      const eligible = getEligibleModelsForAllocation(targetBase, effectiveBaseLevel, DEFAULT_MODELS);
      targetBase.model = eligible[0];
    }
  }

  if (wasTab) {
    const allocForBaseWins = [];
    const otherEphemeralAllocWins = [];
    const trulyEmptyWins = [];
    const busyWins = [];

    for (const w of tab.windows) {
      if (w === targetBase || (targetBase && w.id && w.id === targetBase.id)) {
        continue;
      }
      const isEphemeralAlloc = Boolean(w.isAutoAllocated && !w.isPinned);
      const isAllocForBase = Boolean(
        (isEphemeralAlloc && targetBase && w.allocParentId === targetBase.id) ||
        (tab.autoAllocation && tab.autoAllocation !== "none" && w.isAutoAllocated !== false && w.activeGroup?.id && targetBase?.activeGroup?.id && w.activeGroup.id === targetBase.activeGroup.id)
      );
      if (isAllocForBase) {
        allocForBaseWins.push(w);
      } else if (isEphemeralAlloc) {
        otherEphemeralAllocWins.push(w);
      } else if (isWindowEmptyFn(w)) {
        trulyEmptyWins.push(w);
      } else {
        busyWins.push(w);
      }
    }

    const emptyWins = [...allocForBaseWins, ...otherEphemeralAllocWins, ...trulyEmptyWins];
    const neededExtra = numNeeded - 1;
    const usedEmpty = emptyWins.slice(0, neededExtra);
    const rawUnusedEmpty = emptyWins.slice(neededExtra);
    const unusedEmpty = [];

    for (const w of rawUnusedEmpty) {
      if (w && w.isAutoAllocated && !w.isPinned) {
        if (typeof onCleanupWindow === "function") {
          try { onCleanupWindow(w); } catch {}
        }
      } else {
        unusedEmpty.push(w);
      }
    }

    usedEmpty.forEach((winObj, idx) => {
      const posIdx = 1 + idx;
      if (targetHasNoLevel || targetBase?.level === null) {
        winObj.level = targetBase?.level ?? null;
      }
      if (tab.autoAllocation && tab.autoAllocation !== "none") {
        winObj.isAutoAllocated = true;
        if (targetBase) winObj.allocParentId = targetBase.id;
        winObj.allocMode = tab.autoAllocation;
        if (tab.autoAllocation === "model") {
          const eligible = getEligibleModelsForAllocation(targetBase, effectiveBaseLevel, DEFAULT_MODELS);
          winObj.model = eligible[posIdx % eligible.length];
        }
      }
    });

    const createdWins = [];
    while (usedEmpty.length + createdWins.length < neededExtra) {
      const uid = getNextWindowUid(tab);
      const posIdx = 1 + usedEmpty.length + createdWins.length;
      const winObj = createDefaultWindow(posIdx, tab.id);
      winObj.uid = uid;
      winObj.id = `tab-${tab.id}-win-${uid}`;
      if (targetHasNoLevel || targetBase?.level === null) {
        winObj.level = targetBase?.level ?? null;
      }
      if (tab.autoAllocation && tab.autoAllocation !== "none") {
        winObj.isAutoAllocated = true;
        if (targetBase) winObj.allocParentId = targetBase.id;
        winObj.allocMode = tab.autoAllocation;
        if (tab.autoAllocation === "model") {
          const eligible = getEligibleModelsForAllocation(targetBase, effectiveBaseLevel, DEFAULT_MODELS);
          winObj.model = eligible[posIdx % eligible.length];
        }
      }
      createdWins.push(winObj);
    }

    const splitWins = [targetBase, ...usedEmpty, ...createdWins];
    tab.windows = [...splitWins, ...busyWins, ...unusedEmpty];
    if (targetBase) {
      tab.activeWinIdx = Math.max(0, tab.windows.indexOf(targetBase));
    }
  } else {
    // When already in split mode, only windows that were in the previous visible split
    // are kept in currentSplit. Any windows outside the previous visible split that have
    // layers (busyWins) must NOT be clobbered or drawn into new split slots.
    const prevCount = prevNumVisible != null ? prevNumVisible : Math.min(tab.windows.length, numNeeded);
    const currentSplit = tab.windows.slice(0, Math.min(prevCount, numNeeded));
    const remaining = tab.windows.slice(Math.min(prevCount, numNeeded));

    const emptyWins = [];
    const busyWins = [];
    for (const w of remaining) {
      const isEphemeralAlloc = Boolean(w.isAutoAllocated && !w.isPinned);
      const isAllocForBase = Boolean(
        isEphemeralAlloc ||
        (tab.autoAllocation && tab.autoAllocation !== "none" && w.isAutoAllocated !== false && w.activeGroup?.id && targetBase?.activeGroup?.id && w.activeGroup.id === targetBase.activeGroup.id)
      );
      if (isWindowEmptyFn(w) || isAllocForBase) {
        emptyWins.push(w);
      } else {
        busyWins.push(w);
      }
    }

    const neededExtra = numNeeded - currentSplit.length;
    const usedEmpty = emptyWins.slice(0, Math.max(0, neededExtra));
    const rawUnusedEmpty = emptyWins.slice(Math.max(0, neededExtra));
    const unusedEmpty = [];

    for (const w of rawUnusedEmpty) {
      if (w && w.isAutoAllocated && !w.isPinned) {
        if (typeof onCleanupWindow === "function") {
          try { onCleanupWindow(w); } catch {}
        }
      } else {
        unusedEmpty.push(w);
      }
    }

    usedEmpty.forEach((winObj, idx) => {
      const posIdx = currentSplit.length + idx;
      if (targetHasNoLevel || targetBase?.level === null) {
        winObj.level = targetBase?.level ?? null;
      }
      if (tab.autoAllocation && tab.autoAllocation !== "none") {
        winObj.isAutoAllocated = true;
        if (targetBase) winObj.allocParentId = targetBase.id;
        winObj.allocMode = tab.autoAllocation;
        if (tab.autoAllocation === "model") {
          const eligible = getEligibleModelsForAllocation(targetBase, effectiveBaseLevel, DEFAULT_MODELS);
          winObj.model = eligible[posIdx % eligible.length];
        }
      }
    });

    const createdWins = [];
    while (currentSplit.length + usedEmpty.length + createdWins.length < numNeeded) {
      const uid = getNextWindowUid(tab);
      const posIdx = currentSplit.length + usedEmpty.length + createdWins.length;
      const winObj = createDefaultWindow(posIdx, tab.id);
      winObj.uid = uid;
      winObj.id = `tab-${tab.id}-win-${uid}`;
      if (targetHasNoLevel || targetBase?.level === null) {
        winObj.level = targetBase?.level ?? null;
      }
      if (tab.autoAllocation && tab.autoAllocation !== "none") {
        winObj.isAutoAllocated = true;
        if (targetBase) winObj.allocParentId = targetBase.id;
        winObj.allocMode = tab.autoAllocation;
        if (tab.autoAllocation === "model") {
          const eligible = getEligibleModelsForAllocation(targetBase, effectiveBaseLevel, DEFAULT_MODELS);
          winObj.model = eligible[posIdx % eligible.length];
        }
      }
      createdWins.push(winObj);
    }

    const splitWins = [...currentSplit, ...usedEmpty, ...createdWins];
    tab.windows = [...splitWins, ...busyWins, ...unusedEmpty];
  }

  tab.windows.forEach((w, idx) => {
    w.winIdx = idx;
    if (w.title) w.title = String(w.title).replace(/^W\d+:\s*/, "");
    if (w.baseTitle) w.baseTitle = String(w.baseTitle).replace(/^W\d+:\s*/, "");
  });

  if (!wasTab && rawBase && tab.windows.slice(0, numNeeded).includes(rawBase)) {
    tab.activeWinIdx = Math.max(0, tab.windows.indexOf(rawBase));
  } else {
    tab.activeWinIdx = Math.max(0, tab.windows.findIndex((w) => w === targetBase || (targetBase && w.id && w.id === targetBase.id)));
  }
  return tab.windows;
}

